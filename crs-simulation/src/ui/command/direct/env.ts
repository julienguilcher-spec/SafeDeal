/* =====================================================================================
 * Ordres directs — LECTURE DE LA PARTIE : la vue étroite (DirectEnv) que la logique pure consomme, remplie depuis la
 * partie en cours. Lecture seule : aucune écriture dans ctx, aucun DOM.
 *
 *   directEnvFromCore(core, opts)   poste du joueur, unités sous ses ordres (fourgons cellulaires compris), foule,
 *                                   rues, secours, droit, interpellé tenu, binôme libre, services présents ;
 *   designationAt(core, x, z, …)    désignation d'un point ou d'une personne (tests, et repli tant que designate.ts
 *                                   n'est pas branché) — même forme que celle de designate.ts (P9).
 *
 * Services lus au moment même (absents : la règle qui en dépend n'est pas proposée, jamais un appui sans effet) :
 *   'police.arrests'  takeOver(targetId, byPlayer)          « Confier » (P13) ;
 *   'law.custody'     handover(actorId)                     « Remettre » au fourgon par Entrée (P12) ;
 *   'police.command'  arrive(squadId, destination)          « Faire venir le fourgon » (existe) ;
 *   'transfer'        depart(vanSquadId)                    « Partir au commissariat » (P14).
 * ===================================================================================== */

import type { Person, Squad } from '@/core/contracts';
import type { CommandCore } from '../core';
import type { IncidentKind } from '@/core/extensions';
import { INCIDENT_KIND_LABELS } from '../incidents';
import { cardEnvFromCore } from '../reperes';
import { unitKindOf } from './caps';
import { isFree } from './who';
import type { Designation, DesignatedPerson, DirectEnv, DirectUnit, FreePair, PlayerOrderInfo, Poste } from './types';
import { offenderWords } from './words';

/** Services facultatifs, vus par leur méthode. */
interface ArrestsLike {
  takeOver?(targetId: number, byPlayer: number): unknown;
  pairFor?(byPlayer: number): FreePair | null;
}
interface CustodyLike {
  handover?(actorId: number): unknown;
  detaineeOf?(actorId: number): Person | null;
}
interface CommandLike { arrive?(squadId: number, dest: unknown): unknown }
interface TransferLike { depart?(squadId: number): unknown }
interface FollowLike { inColumn?(squadId: number): boolean; coming?(squadId: number): boolean }

export interface DirectEnvOptions {
  /** Dernier ordre du joueur à une unité (P8 : CommandCore.playerOrder) ; absent : l'ordre en cours s'il est `byPlayer`. */
  playerOrder?(squadId: number): PlayerOrderInfo | null;
}

/** Rayon (m) où l'on cherche un binôme libre pour « Confier ». */
const PAIR_RADIUS = 60;
const FIRE_KINDS: ReadonlySet<string> = new Set(['feu_poubelle', 'feu_barricade', 'feu_vehicule', 'feu_boutique']);
const INJURY_KINDS: ReadonlySet<string> = new Set(['blesse', 'agent_a_terre']);

/** Poste du joueur d'après l'étendue de son commandement. */
export function posteOf(core: CommandCore): Poste {
  const ctx = core.ctx;
  const sc = core.scope();
  const me = core.player();
  if (sc.level === 'tout') return 'commandant';
  if (sc.level === 'lecture') {
    // chef de bord d'une patrouille : il commande ses deux collègues (§1.4)
    if (ctx.player.state.role === 'patrouille' && me && me.squadId !== 0 && ctx.squads.get(me.squadId)?.leaderId === me.id) return 'equipage';
    return 'lecture';
  }
  const own = sc.ownSquadId !== 0 ? ctx.squads.get(sc.ownSquadId) : undefined;
  if (!own) return 'groupe';
  const unit = core.maps.scene.units.find((u) => u.squadId === own.id);
  if (unit && unit.symbol === 'bravm') return 'bravm';
  if (own.kind === 'section' || own.kind === 'peloton' || own.kind === 'compagnie') return 'section';
  return 'groupe';
}

function eachSquad(core: CommandCore, root: Squad, fn: (s: Squad) => void, guard = 0): void {
  fn(root);
  if (guard > 8) return;
  for (const c of core.ctx.squads.childrenOf(root.id)) eachSquad(core, c, fn, guard + 1);
}

/** Interpellés à bord d'un véhicule et places de retenue (sièges qui ne sont pas des postes d'équipage). */
function vanLoad(core: CommandCore, vehicleId: number): { detainees: number; seats: number } {
  const v = core.ctx.vehicles.get(vehicleId);
  if (!v) return { detainees: 0, seats: 0 };
  let detainees = 0;
  for (const id of v.seats) {
    if (id === 0) continue;
    const p = core.ctx.people.get(id);
    if (p && p.custody === 'in_vehicle') detainees++;
  }
  const crewSeats = v.def.seats.filter((s) => s.role === 'driver').length + 1;
  return { detainees, seats: Math.max(0, v.def.seats.length - crewSeats) };
}

/** Vue étroite de la partie pour les ordres directs. */
export function directEnvFromCore(core: CommandCore, opts: DirectEnvOptions = {}): DirectEnv {
  const ctx = core.ctx;
  const card = cardEnvFromCore(core);
  const me = core.player();
  const sc = core.scope();
  const poste = posteOf(core);
  const follow = ctx.service<FollowLike>('session.follow');
  const playerId = me ? me.id : 0;
  const ownSquadId = poste === 'equipage' ? me?.squadId ?? 0 : sc.ownSquadId;

  const units: DirectUnit[] = [];
  for (const u of core.maps.scene.units) {
    if (u.squadId <= 0 || u.faction !== 'police') continue;
    if (!core.canCommand(u.squadId) && !(poste === 'equipage' && u.squadId === ownSquadId)) continue;
    // unité d'un commissariat encore au poste, en alerte dans ses places ou au repos : pas un destinataire des ordres
    // directs (on l'engage depuis la carte, touche C) ; engagée, c'est un renfort, choisi en dernier (who.ts)
    if (core.atPost(u.squadId)) continue;
    const s = ctx.squads.get(u.squadId);
    if (!s) continue;
    const vehicle = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    const cellular = vehicle !== undefined && vehicle.kind === 'fourgon_cellulaire';
    let seated = 0;
    eachSquad(core, s, (q) => {
      for (const id of q.members) {
        if (id === playerId) continue;
        const p = ctx.people.get(id);
        if (p && p.vehicleId !== 0) seated++;
      }
    });
    const o = s.order;
    // « libre » sans le joueur, c'est l'absence d'ordre ; « Laisser agir seuls » du joueur est un ordre
    const hasOrder = o.type !== 'libre' || o.byPlayer === true;
    const po = opts.playerOrder ? opts.playerOrder(s.id)
      : o && o.byPlayer ? { type: o.type, verb: null, issuedAt: o.issuedAt, done: false, place: o.place ?? '' } : null;
    const cardUnit = card.units.find((c) => c.squadId === s.id);
    const avecVous = (o.type === 'suivre' && playerId !== 0 && o.targetId === playerId) || o.type === 'avec_moi' || o.type === 'suivre_pied'
      || (follow && typeof follow.inColumn === 'function' ? follow.inColumn(s.id) : false)
      // (elle descend de ses fourgons pour le suivre, ou vient de loin : « Avec moi » est donné, elle est « avec vous »)
      || (follow && typeof follow.coming === 'function' ? follow.coming(s.id) : false);
    const unit: DirectUnit = {
      squadId: s.id, name: s.name, symbol: u.symbol, kind: unitKindOf(u.symbol, cellular), x: u.x, z: u.z, total: u.total, valid: u.valid,
      parentId: s.parentId, hasPlayer: u.hasPlayer, hasVehicles: cardUnit ? cardUnit.hasVehicles : vehicle !== undefined, seated,
      order: hasOrder ? { type: o.type, x: o.x, z: o.z, targetId: o.targetId, issuedAt: o.issuedAt, byPlayer: o.byPlayer === true } : null,
      playerOrder: po, avecVous,
    };
    if (core.commissariats?.isStationUnit(s.id)) unit.station = true;
    if (cellular && vehicle) {
      const load = vanLoad(core, vehicle.id);
      unit.detainees = load.detainees;
      unit.seats = load.seats;
    }
    units.push(unit);
  }

  // l'interpellé que tient le joueur : escorté par lui, ou menotté / tenu par lui (palpation finie) — le module de droit
  // le sait (law.custody : aussi le menotté assis à côté de lui après la palpation, tant qu'aucun binôme ne le prend)
  let detainee: DirectEnv['detainee'] = null;
  const custodyDesk = ctx.service<CustodyLike>('law.custody');
  if (me && custodyDesk && typeof custodyDesk.detaineeOf === 'function') {
    const held = custodyDesk.detaineeOf(me.id);
    if (held) detainee = { personId: held.id, name: held.name };
  } else if (me) {
    const held = me.carrying !== 0 ? ctx.people.get(me.carrying) : undefined;
    if (held && held.heldBy === me.id && (held.custody === 'escorted' || held.custody === 'cuffed' || held.custody === 'held')) {
      detainee = { personId: held.id, name: held.name };
    }
  }

  // binôme libre à qui confier : celui que « Confier » prendra (police.arrests, le même nom à l'écran et sur le
  // terrain) ; sans ce service, une unité sous ses ordres, ou un binôme de son groupe
  let freePair: FreePair | null = null;
  const arrestDesk = ctx.service<ArrestsLike>('police.arrests');
  if (me && detainee && arrestDesk && typeof arrestDesk.pairFor === 'function') {
    freePair = arrestDesk.pairFor(me.id);
  } else if (me && detainee) {
    const mine = new Set(units.map((u) => u.squadId));
    const group = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const parent = group && group.parentId !== 0 ? ctx.squads.get(group.parentId) : undefined;
    const siblings = parent ? ctx.squads.childrenOf(parent.id) : group ? [group] : [];
    for (const s of siblings) mine.add(s.id);
    let best = Infinity;
    for (const id of mine) {
      const s = ctx.squads.get(id);
      if (!s || s.faction !== 'police' || s.kind !== 'binome' || s.members.includes(me.id)) continue;
      const du = units.find((u) => u.squadId === id);
      if (du && !isFree(du)) continue;
      const lead = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : s.members.length > 0 ? ctx.people.get(s.members[0]!) : undefined;
      if (!lead || lead.vehicleId !== 0 || ctx.health.isIncapacitated(lead)) continue;
      const d = Math.hypot(lead.x - me.x, lead.z - me.z);
      if (d <= PAIR_RADIUS && d < best) {
        best = d;
        freePair = { squadId: s.id, name: s.name, distance: d };
      }
    }
  }

  const tmp: Person[] = [];
  const demonstratorsAt = (x: number, z: number, radius: number): { count: number; x: number; z: number } => {
    tmp.length = 0;
    const n = ctx.people.queryRadius(x, z, radius, tmp, (p) => p.faction === 'protest' && p.custody === 'free' && p.vehicleId === 0 && !ctx.health.isIncapacitated(p));
    if (n === 0) return { count: 0, x, z };
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i++) {
      sx += tmp[i]!.x;
      sz += tmp[i]!.z;
    }
    return { count: n, x: sx / n, z: sz / n };
  };

  const rescueAt = (x: number, z: number, radius: number): { label: string } | null => {
    for (const inc of card.incidents) {
      if (inc.state === 'resolu' || inc.state === 'echoue') continue;
      if (Math.hypot(inc.x - x, inc.z - z) > radius) continue;
      if (INJURY_KINDS.has(inc.kind)) return { label: 'blessé au sol' };
      if (FIRE_KINDS.has(inc.kind)) return { label: INCIDENT_KIND_LABELS[inc.kind as IncidentKind].toLocaleLowerCase('fr-FR') };
    }
    const hurt = ctx.people.nearest(x, z, radius, (p) => p.vehicleId === 0 && p.custody === 'free'
      && (p.injury === 'serious' || p.injury === 'critical' || ctx.health.isIncapacitated(p)) && p.injury !== 'dead');
    return hurt ? { label: 'blessé au sol' } : null;
  };

  const arrests = ctx.service<ArrestsLike>('police.arrests');
  const custody = ctx.service<CustodyLike>('law.custody');
  const command = ctx.service<CommandLike>('police.command');
  const transfer = ctx.service<TransferLike>('transfer');

  return {
    now: ctx.clock.now, poste, ownSquadId,
    player: me ? { x: me.x, z: me.z, heading: me.heading, inVehicle: me.vehicleId !== 0 } : null,
    units, demonstratorsAt, roadAt: card.roadAt, placeName: card.placeName, rescueAt,
    sommations: card.sommations, riposteAt: card.riposteAt,
    detainee, freePair,
    can: {
      confier: !!arrests && typeof arrests.takeOver === 'function',
      remettre: !!custody && typeof custody.handover === 'function',
      faireVenir: !!command && typeof command.arrive === 'function',
      transfert: !!transfer && typeof transfer.depart === 'function',
    },
  };
}

/** « le lanceur de projectile » : d'après l'infraction constatée la plus récente de la personne. */
export function offenderLabel(p: Person): string {
  let best: Person['offenses'][number] | null = null;
  for (const o of p.offenses) if (o.witnessed && (!best || o.t >= best.t)) best = o;
  return offenderWords(best ? String(best.type) : '');
}

/**
 * Désignation d'un point ou d'une personne vue depuis le joueur (tests ; repli tant que designate.ts n'est pas
 * branché). `personId` : la personne visée (0 : le point seul) ; `exact` : sous le réticule même.
 */
export function designationAt(core: CommandCore, x: number, z: number, personId = 0, exact = true): Designation {
  const ctx = core.ctx;
  const me = core.player();
  const px = me ? me.x : 0, pz = me ? me.z : 0;
  const target = personId !== 0 ? ctx.people.get(personId) : undefined;
  let person: DesignatedPerson | null = null;
  let tx = x, tz = z;
  if (target) {
    tx = target.x;
    tz = target.z;
    const hurt = target.injury === 'serious' || target.injury === 'critical' || ctx.health.isIncapacitated(target);
    const kind: DesignatedPerson['kind'] = target.faction === 'police' ? 'police'
      : target.custody === 'free' && ctx.law.canArrest(target) ? 'offender'
        : hurt ? 'wounded' : target.faction === 'protest' ? 'demonstrator' : 'other';
    person = {
      id: target.id, kind, squadId: target.squadId, exact,
      label: kind === 'offender' ? offenderLabel(target) : target.name,
    };
  }
  return { kind: target ? 'person' : 'ground', x: tx, z: tz, distance: Math.hypot(tx - px, tz - pz), person, place: '', far: false };
}
