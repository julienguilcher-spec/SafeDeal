/* =====================================================================================
 * FORCES DE L'ORDRE — manœuvres particulières :
 *
 *   releve              la section fraîche s'aligne 10 m derrière, la section relevée se replie à
 *                       travers elle, puis la relève prend la position (bible §E.8) ;
 *   couper_circulation  barrage en travers de la voie la plus proche (service 'traffic.control') ;
 *   filtrer             le même avec une porte de passage (station de métro : 'crowd.metro') ;
 *   embarquer/debarquer véhicules de l'unité (un agent sort par véhicule toutes les 0,6 s) ;
 *   équipages           conduits par le service 'vehicles.autopilot'.
 * L'encerclement est dans encircle.ts.
 * ===================================================================================== */

import type { EntityId, SquadOrder, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi, TrafficControlApi } from '@/core/extensions';
import { angleDiff, cardinalFr, wrapAngle } from '@/core/math';
import type { Agent, Unit } from './brain';
import { F_NONE, agentOf, unitOf } from './brain';
import type { Kernel } from './kernel';
import { isAble } from './kernel';
import {
  allSettled, done, formHold, formLate, formLine, inPlace, leaderOf, mainGroup, moveTo, report, setPhase, setStep, unitCenter,
} from './mcore';
import { spell } from './radio';
import { formStreetBarrage, markBarrage } from './barrages';
import { fleetOf } from './tree';
import * as T from './tuning';

// ───────────────────────────── relève ─────────────────────────────

function findRelieved(k: Kernel, u: Unit, o: SquadOrder): Unit | null {
  if (o.targetId > 0) {
    const a = agentOf(k.ctx.people.get(o.targetId));
    if (a && a.root && a.root !== u) return a.root;
    const s = unitOf(k.ctx.squads.get(o.targetId));
    if (s && s.lead !== u) return s.lead;
  }
  let best: Unit | null = null;
  let bestD = 45 * 45;
  for (let i = 0; i < k.roots.length; i++) {
    const r = k.roots[i];
    if (r === u || r.groups.length === 0 || r.groups[0].kind === F_NONE) continue;
    const g = r.groups[0];
    const d = (g.ax - o.x) * (g.ax - o.x) + (g.az - o.z) * (g.az - o.z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function startRelief(k: Kernel, u: Unit, o: SquadOrder): void {
  const target = findRelieved(k, u, o);
  const m = u.man;
  if (!target || target.groups.length === 0) {
    formLine(k, u, o.x, o.z, o.heading, o.width);
    m.otherId = 0;
    setStep(k, u, 3);
    setPhase(k, u, 'mise_en_place');
    return;
  }
  const tg = target.groups[0];
  m.otherId = target.id;
  m.x0 = tg.ax;
  m.z0 = tg.az;
  m.h0 = tg.ah;
  m.deployWidth = tg.width;
  const fx = Math.sin(tg.ah);
  const fz = Math.cos(tg.ah);
  formLine(k, u, tg.ax - fx * T.RELIEF_BEHIND, tg.az - fz * T.RELIEF_BEHIND, tg.ah, tg.width);
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

export function progressRelief(k: Kernel, u: Unit, arrived: boolean): void {
  const m = u.man;
  const g = u.groups[0];
  const fx = Math.sin(m.h0);
  const fz = Math.cos(m.h0);
  switch (m.step) {
    case 0:
      if (allSettled(u, 0.5) || k.now - m.stepT > 30) {
        const target = unitOf(k.ctx.squads.get(m.otherId));
        const leader = leaderOf(k, u);
        report(k, u, 'Relève alignée derrière la ligne, passage de ligne');
        if (target && target.isRoot) {
          k.ctx.squads.issue(target.id, {
            type: 'repli', x: m.x0 - fx * T.RELIEF_WITHDRAW, z: m.z0 - fz * T.RELIEF_WITHDRAW, heading: m.h0, width: m.deployWidth,
            maxForce: target.order ? target.order.maxForce : u.order!.maxForce, issuedBy: leader ? leader.id : 0,
          });
        }
        setStep(k, u, 1);
        setPhase(k, u, 'action');
      }
      break;
    case 1: {
      // la section relevée passe derrière notre ligne, puis nous prenons sa position
      const target = unitOf(k.ctx.squads.get(m.otherId));
      const tg = target && target.groups.length > 0 ? target.groups[0] : null;
      const passed = !tg || (tg.ax - m.x0) * fx + (tg.az - m.z0) * fz < -(T.RELIEF_BEHIND + 2);
      if (passed || k.now - m.stepT > 25) {
        moveTo(g, m.x0, m.z0, m.h0, k.tuning.pace);
        setStep(k, u, 2);
        setPhase(k, u, 'mouvement');
      }
      break;
    }
    case 2:
      if (arrived) {
        setStep(k, u, 3);
        setPhase(k, u, 'mise_en_place');
      }
      break;
    case 3:
      if (u.phase === 'mise_en_place' && (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) {
        const target = unitOf(k.ctx.squads.get(m.otherId));
        if (target) target.needsRelief = false;
        inPlace(k, u, 'Relève effectuée, je tiens la position face ' + cardinalFr(g.ah));
        done(k, u, 'releve', true, '');
      }
      break;
    default:
      break;
  }
}

// ───────────────────────────── barrages de rue ─────────────────────────────

export function startBarrage(k: Kernel, u: Unit, o: SquadOrder): void {
  const doorW = o.type === 'filtrer' ? T.FILTER_DOOR : 0;
  // rue bordée de façades : barrée de façade à façade, pour tout le monde (barrages.ts)
  if (formStreetBarrage(k, u, o.x, o.z, o.heading, doorW)) {
    setStep(k, u, 0);
    setPhase(k, u, 'mise_en_place');
    return;
  }
  let x = o.x;
  let z = o.z;
  let h = o.heading;
  const road = k.road;
  if (k.ctx.world.nearestRoad(x, z, road, 40)) {
    x = road.x;
    z = road.z;
    h = Math.cos(angleDiff(road.heading, o.heading)) >= 0 ? road.heading : wrapAngle(road.heading + Math.PI);
  }
  markBarrage(k, u, formLine(k, u, x, z, h, o.width, doorW, T.BARRAGE_SPACING));
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

export function progressBarrage(k: Kernel, u: Unit): void {
  if (u.phase !== 'mise_en_place') return;
  if (!(allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) return;
  const ctx = k.ctx;
  const g = u.groups[0];
  const m = u.man;
  const type = u.order!.type;
  const leader = leaderOf(k, u);
  const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
  if (traffic && m.closureId === 0) {
    // rue barrée de façade à façade : la ligne est le barrage (pas de barrières où les agents se tiennent, et la
    // ligne s'ouvre pour les collègues et les secours) ; ailleurs, barrières posées par la circulation
    if (m.bWalls && traffic.isClosed(m.bEdge)) {
      m.closureId = -1;
    } else {
      const c = traffic.closeRoad(g.ax, g.az, leader ? leader.id : 0, u.id, m.bWalls);
      if (c) m.closureId = c.id;
    }
  }
  let station = '';
  if (type === 'filtrer') {
    const metro = ctx.service<MetroApi>(EXT.metro);
    const st = metro ? metro.nearest(g.ax, g.az, 35) : null;
    if (metro && st) {
      metro.setFiltered(st.id, true, u.id);
      m.stationId = st.id;
      station = st.name;
    }
  }
  const sec = ctx.world.sectorName(g.ax, g.az);
  const where = sec && sec !== 'secteur inconnu' ? ', ' + sec : '';
  inPlace(k, u, type === 'filtrer'
    ? 'Barrage filtrant en place' + (station !== '' ? ', sortie de la station ' + station : where)
    // rue barrée de façade à façade : piétons compris, personne ne passe (pas seulement les voitures)
    : 'Rue barrée' + (m.bStreet !== '' ? ', ' + m.bStreet : where) + ' : personne ne passe, barrage en place face ' + cardinalFr(g.ah));
  done(k, u, type, true, '');
}

// ───────────────────────────── véhicules ─────────────────────────────

const fleet: number[] = [];
const freeSeats: number[] = [];
const usedVehicles: EntityId[] = [];

function passengerSeatsFree(v: Vehicle): number {
  let n = 0;
  for (let i = 0; i < v.seats.length; i++) if (v.seats[i] === 0 && v.def.seats[i] && v.def.seats[i].role !== 'driver') n++;
  return n;
}

function driverSeatFree(v: Vehicle): boolean {
  for (let i = 0; i < v.seats.length; i++) if (v.def.seats[i] && v.def.seats[i].role === 'driver') return v.seats[i] === 0;
  return false;
}

function usable(v: Vehicle | undefined): v is Vehicle {
  return !!v && v.faction === 'police' && !v.def.flying && (v.state === 'ok' || v.state === 'damaged');
}

/** Véhicules de troupe de police où un agent sans place peut monter (fourgons, car, VL de commandement). */
const TROOP_SEATS: ReadonlySet<string> = new Set(['fourgon_crs', 'car_crs', 'vl_commandement']);
/** Rayon de recherche d'une place dans un autre véhicule de la colonne (m). */
const RESEAT_RADIUS = 120;
const nearby: Vehicle[] = [];

/**
 * Places passager encore libres pour un agent sans place : libres, moins celles déjà promises à un agent de l'unité
 * qui n'est pas encore monté. Fourgon cellulaire : ses deux places avant seulement (les cellules sont aux interpellés).
 */
function seatsLeft(u: Unit, v: Vehicle, self: Agent): number {
  let n = 0;
  const cell = v.kind === 'fourgon_cellulaire';
  for (let i = 0; i < v.seats.length && (!cell || i < 2); i++) if (v.seats[i] === 0 && v.def.seats[i] && v.def.seats[i].role !== 'driver') n++;
  for (let i = 0; i < u.agents.length; i++) {
    const b = u.agents[i];
    if (b !== self && b.boardId === v.id && b.p.vehicleId === 0) n--;
  }
  return n;
}

/**
 * Place pour un agent resté sans siège (le joueur a pris la sienne, son conducteur lui a cédé le volant…) : un véhicule
 * de sa branche, puis de l'unité, puis n'importe quel véhicule de troupe de police de la colonne alentour (le fourgon
 * d'un autre groupe, le VL), et en dernier recours les places avant du fourgon cellulaire. 0 si aucune.
 */
/** Poste de conduite : conducteur d'un véhicule, pilote d'une moto de la BRAV-M (sa place est le guidon, pas la selle arrière). */
function drives(p: { poste: string | null }): boolean {
  return p.poste === 'conducteur' || p.poste === 'pilote_moto';
}

function seatFor(k: Kernel, u: Unit, a: Agent): EntityId {
  const ctx = k.ctx;
  const p = a.p;
  for (let x: Unit | null = a.home; x; x = x.parent) {
    const v = x.squad.vehicleId !== 0 ? ctx.vehicles.get(x.squad.vehicleId) : undefined;
    if (!usable(v) || v.kind === 'fourgon_cellulaire') continue;
    if (drives(p) && driverSeatFree(v)) return v.id;
    if (seatsLeft(u, v, a) > 0) return v.id;
  }
  // puis le véhicule de l'unité le plus proche où il reste une place
  fleet.length = 0;
  fleetOf(k, u, fleet);
  let near: EntityId = 0;
  let nearD = Infinity;
  for (let i = 0; i < fleet.length; i++) {
    const v = ctx.vehicles.get(fleet[i]);
    if (!usable(v) || v.kind === 'fourgon_cellulaire' || seatsLeft(u, v, a) <= 0) continue;
    const d = Math.hypot(v.x - p.x, v.z - p.z) + (v.seats[0] === 0 ? 1000 : 0);
    if (d < nearD) {
      nearD = d;
      near = v.id;
    }
  }
  if (near !== 0) return near;
  // véhicules de la colonne alentour : d'abord ceux de la compagnie, et ceux qui ont un conducteur (un véhicule sans
  // conducteur ne part pas)
  let top = u;
  while (top.parent) top = top.parent;
  fleet.length = 0;
  if (top !== u) fleetOf(k, top, fleet);
  const n = ctx.vehicles.queryRadius(p.x, p.z, RESEAT_RADIUS, nearby);
  let best: Vehicle | null = null;
  let bestKey = Infinity;
  for (let i = 0; i < n; i++) {
    const v = nearby[i];
    if (!usable(v) || (!TROOP_SEATS.has(v.kind) && v.kind !== 'fourgon_cellulaire') || seatsLeft(u, v, a) <= 0) continue;
    const key = (v.kind === 'fourgon_cellulaire' ? 4000 : 0) + (v.seats[0] === 0 ? 2000 : 0) + (top !== u && fleet.indexOf(v.id) < 0 ? 1000 : 0)
      + Math.hypot(v.x - p.x, v.z - p.z);
    if (key < bestKey) {
      bestKey = key;
      best = v;
    }
  }
  return best ? best.id : 0;
}

/** Les agents valides restés à pied sans place désignée en reçoivent une (retourne le nombre d'agents en chemin). */
function reseat(k: Kernel, u: Unit): number {
  let walking = 0;
  for (let i = 0; i < u.agents.length; i++) {
    const a = u.agents[i];
    const p = a.p;
    if (p.vehicleId !== 0 || p.isPlayer || a.boardId !== 0 || (!a.able && !a.crew) || p.custody !== 'free' || p.posture === 'down') continue;
    const id = seatFor(k, u, a);
    if (id === 0) continue;
    a.boardId = id;
    a.boardAt = k.now;
    a.hasSlot = false;
    a.pathN = 0;
    walking++;
  }
  return walking;
}

export function startEmbark(k: Kernel, u: Unit, o: SquadOrder): void {
  const ctx = k.ctx;
  const m = u.man;
  fleet.length = 0;
  const named = ctx.vehicles.get(o.targetId);
  if (o.targetId > 0 && usable(named)) fleet.push(named.id);
  else fleetOf(k, u, fleet);
  if (fleet.length === 0) {
    // à défaut : véhicules de police proches
    unitCenter(k, u);
    const n = ctx.vehicles.queryRadius(k.v2.x, k.v2.z, 60, k.vehicles);
    for (let i = 0; i < n; i++) if (usable(k.vehicles[i]) && k.vehicles[i].kind !== 'fourgon_cellulaire') fleet.push(k.vehicles[i].id);
  }
  if (u.groups.length === 0 || u.groups[0].kind === F_NONE) formHold(k, u);
  for (let i = 0; i < u.groups.length; i++) {
    u.groups[i].moving = false;
    u.groups[i].followId = 0;
  }
  if (fleet.length === 0) {
    setPhase(k, u, 'refuse');
    report(k, u, 'Aucun véhicule disponible pour embarquer');
    u.reported = true;
    done(k, u, 'embarquer', false, 'Aucun véhicule disponible.');
    return;
  }
  for (let i = 0; i < fleet.length; i++) {
    const v = ctx.vehicles.get(fleet[i]);
    // le fourgon cellulaire garde ses places pour les personnes interpellées
    freeSeats[i] = usable(v) && v.kind !== 'fourgon_cellulaire' ? passengerSeatsFree(v) : 0;
  }
  let assigned = 0;
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    a.boardId = 0;
    const p = a.p;
    if (!a.able && !a.crew) continue;
    if (p.vehicleId !== 0 || p.isPlayer) continue;
    // véhicule de son groupe d'abord, puis le premier qui a de la place
    let pick = -1;
    for (let x: Unit | null = a.home; x && pick < 0; x = x.parent) {
      const vi = x.squad.vehicleId !== 0 ? fleet.indexOf(x.squad.vehicleId) : -1;
      if (vi < 0) continue;
      const v = ctx.vehicles.get(fleet[vi]);
      if (drives(p) && usable(v) && driverSeatFree(v)) pick = vi;
      else if (freeSeats[vi] > 0) pick = vi;
    }
    for (let j = 0; j < fleet.length && pick < 0; j++) if (freeSeats[j] > 0) pick = j;
    if (pick < 0) continue;
    const v = ctx.vehicles.get(fleet[pick])!;
    if (!(drives(p) && driverSeatFree(v) && fleet[pick] === (a.home ? a.home.squad.vehicleId : 0))) freeSeats[pick]--;
    a.boardId = v.id;
    a.boardAt = k.now;
    a.hasSlot = false;
    a.pathN = 0;
    assigned++;
  }
  m.pending = assigned;
  setStep(k, u, 0);
  setPhase(k, u, 'action');
}

export function startDisembark(k: Kernel, u: Unit, o: SquadOrder): void {
  const m = u.man;
  const leader = leaderOf(k, u);
  const fx = Math.sin(o.heading);
  const fz = Math.cos(o.heading);
  // ordre donné sans point (celui du chef, encore à bord) : la ligne se forme une douzaine de mètres devant les véhicules
  const ahead = leader && leader.vehicleId !== 0 && (o.x - leader.x) * (o.x - leader.x) + (o.z - leader.z) * (o.z - leader.z) < 64 ? 12 : 0;
  m.gx = o.x + fx * ahead;
  m.gz = o.z + fz * ahead;
  m.gh = o.heading;
  m.deployWidth = o.width;
  m.nextExitAt = k.now + 0.4;
  for (let i = 0; i < u.agents.length; i++) u.agents[i].boardId = 0;
  setStep(k, u, 0);
  setPhase(k, u, 'action');
}

export function progressBoarding(k: Kernel, u: Unit): void {
  const ctx = k.ctx;
  const m = u.man;
  const agents = u.agents;
  if (u.order!.type === 'embarquer') {
    // agent resté sans place (le joueur a pris la sienne, ou son conducteur lui a cédé le volant) : il monte ailleurs —
    // avant tout bilan pendant l'embarquement, puis une fois par seconde (le joueur monte quand l'unité est déjà à bord)
    if (m.step === 0 || k.now >= m.nextExitAt) {
      m.nextExitAt = k.now + 1;
      reseat(k, u);
    }
    if (m.step !== 0) return;
    let waiting = 0;
    let aboard = 0;
    let left = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.p.vehicleId !== 0) aboard++;
      else if (a.boardId !== 0 && a.able) waiting++;
      else if (a.able && !a.p.isPlayer) left++;
    }
    if (waiting > 0 && k.now - m.stepT < 90) return;
    for (let i = 0; i < agents.length; i++) if (agents[i].p.vehicleId !== 0) agents[i].boardId = 0;
    setStep(k, u, 1);
    setPhase(k, u, 'embarque');
    u.reported = true;
    // un agent sans place (véhicules détruits) reste à pied : l'unité part avec ceux qui sont à bord, l'ordre n'est pas
    // abandonné ; échec seulement si personne n'a pu monter
    const afoot = left + waiting;
    report(k, u, 'Embarqué, ' + spell(aboard) + ' à bord' + (afoot === 1 ? ', un agent reste à pied' : afoot > 1 ? ', ' + spell(afoot) + ' agents restent à pied' : ''));
    done(k, u, 'embarquer', afoot === 0 || aboard > 0, afoot === 0 || aboard > 0 ? '' : 'Places insuffisantes.');
    return;
  }
  // débarquement : un agent par véhicule toutes les 0,6 s, puis mise en ligne
  if (m.step === 0) {
    if (k.now < m.nextExitAt) return;
    m.nextExitAt = k.now + T.EXIT_INTERVAL;
    usedVehicles.length = 0;
    let aboard = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const p = a.p;
      if (p.vehicleId === 0 || a.crew || p.isPlayer) continue;
      aboard++;
      if (usedVehicles.indexOf(p.vehicleId) >= 0) continue;
      usedVehicles.push(p.vehicleId);
      if (ctx.vehicles.exit(p)) {
        aboard--;
        a.lastX = p.x;
        a.lastZ = p.z;
      }
    }
    if (aboard > 0 && k.now - m.stepT < 60) return;
    formLine(k, u, m.gx, m.gz, m.gh, m.deployWidth);
    setStep(k, u, 1);
    setPhase(k, u, 'mise_en_place');
  } else if (m.step === 1 && u.phase === 'mise_en_place') {
    if (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u)) {
      const g = mainGroup(u);
      inPlace(k, u, 'Débarqué, en ligne face ' + cardinalFr(g.ah) + ', ' + spell(u.formed) + ' à pied');
      done(k, u, 'debarquer', true, '');
    }
  }
}

// ───────────────────────────── équipages ─────────────────────────────

/** Ordre donné à un équipage : conduite par le pilote automatique. Retourne false si l'unité n'a pas d'engin. */
export function startCrewOrder(k: Kernel, u: Unit, o: SquadOrder): boolean {
  const v = k.ctx.vehicles.get(u.squad.vehicleId);
  if (!v) return false;
  const ap = k.autopilot;
  const type = o.type;
  u.groups.length = 0;
  if (type === 'embarquer' || type === 'debarquer') {
    // un conducteur valide dans l'équipage (le joueur compris) : les autres lui laissent le volant ; sans lui (conducteur
    // blessé ou interpellé), le premier qui monte prend le volant, comme avant
    let driver = false;
    for (let i = 0; i < u.agents.length && !driver; i++) {
      const p = u.agents[i].p;
      driver = p.squadId === u.squad.id && p.poste === 'conducteur' && isAble(k.ctx, p);
    }
    for (let i = 0; i < u.agents.length; i++) {
      const p = u.agents[i].p;
      if (type === 'debarquer') {
        if (p.vehicleId !== 0) k.ctx.vehicles.exit(p);
      } else if (p.vehicleId === 0 && !p.isPlayer) {
        // seul l'équipage monte dans l'engin : le groupe de CRS qui l'escorte (rattaché à l'équipage) monte dans son
        // propre fourgon. Sans cela, l'escorte remplissait les trois places du canon à eau du joueur à l'embarquement
        // de la journée de service, et l'opérateur était envoyé dans un fourgon de CRS.
        const sub = p.squadId !== u.squad.id ? k.ctx.squads.get(p.squadId) : undefined;
        if (sub) {
          const ride = sub.vehicleId !== 0 ? k.ctx.vehicles.get(sub.vehicleId) : undefined;
          if (ride && ride !== v) k.ctx.vehicles.enter(p, ride, drives(p) ? 'driver' : ride.kind === 'moto_bravm' ? 'passenger' : undefined);
          continue;
        }
        // le conducteur (ou le pilote de la moto) prend le volant ; à moto, l'équipier prend la selle arrière ;
        // (un équipier qui n'est pas le conducteur laisse le volant libre : le joueur conducteur y prend place)
        if (drives(p)) k.ctx.vehicles.enter(p, v, 'driver');
        else if (v.kind === 'moto_bravm') k.ctx.vehicles.enter(p, v, 'passenger');
        else if (!driver) k.ctx.vehicles.enter(p, v);
        else if (!k.ctx.vehicles.enter(p, v, 'gunner') && !k.ctx.vehicles.enter(p, v, 'passenger')) k.ctx.vehicles.enter(p, v);
      }
    }
    setPhase(k, u, type === 'embarquer' ? 'embarque' : 'en_place');
    u.reported = true;
    return true;
  }
  if (!ap) {
    setPhase(k, u, 'refuse');
    u.reported = true;
    u.ackText = '';
    report(k, u, 'Engin immobilisé : pas de pilote disponible');
    done(k, u, type, false, 'Pilote automatique indisponible.');
    return true;
  }
  if (type === 'tenir' || type === 'cesser' || type === 'libre') {
    ap.stop(v);
    setPhase(k, u, 'en_place');
    u.reported = true;
    return true;
  }
  let ok: boolean;
  if (type === 'suivre' || type === 'escorter') {
    const id = o.targetId > 0 ? o.targetId : o.issuedBy;
    ok = id !== 0 && ap.follow(v, id, type === 'escorter' ? 10 : 8);
  } else {
    ok = ap.driveTo(v, o.x, o.z, { speed: type === 'refoulement' || type === 'avancer' ? 2.2 : undefined, stopBefore: 1 });
  }
  if (!ok) {
    setPhase(k, u, 'refuse');
    u.reported = true;
    report(k, u, 'Itinéraire impossible pour l’engin');
    done(k, u, type, false, 'Aucun itinéraire.');
    return true;
  }
  setStep(k, u, 1);
  setPhase(k, u, 'mouvement');
  return true;
}

/** Suivi d'un équipage en route. Retourne true si l'unité est bien un équipage conduit. */
export function progressCrew(k: Kernel, u: Unit): boolean {
  const v = k.ctx.vehicles.get(u.squad.vehicleId);
  const ap = k.autopilot;
  if (!v || !ap) return !!v;
  if (u.phase !== 'mouvement' || u.man.step !== 1) return true;
  const st = ap.status(v);
  if (st.mode === 'follow') return true;
  if (st.state === 'arrive' || st.mode === 'idle') {
    setStep(k, u, 2);
    inPlace(k, u, 'Engin en position');
    done(k, u, u.order!.type, true, '');
  } else if (st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 25)) {
    setStep(k, u, 2);
    setPhase(k, u, 'refuse');
    u.reported = true;
    report(k, u, st.state === 'echec' ? 'Engin arrêté : itinéraire impossible' : 'Engin bloqué par un obstacle, demande dégagement');
    done(k, u, u.order!.type, false, 'Engin bloqué.');
  }
  return true;
}
