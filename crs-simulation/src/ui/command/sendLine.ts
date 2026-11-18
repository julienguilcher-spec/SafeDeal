/* =====================================================================================
 * Carte de commandement — ENVOI d'une ligne de fiche (« Donner l'ordre »).
 *
 *   sendCardLine(env, ligne, qui, lieu)  fixe Qui (TacticalState), puis fait exactement ce que font aujourd'hui les
 *                                        boutons de la carte : ordres par TacticalMap (issuePoint, issueLine, issueArea,
 *                                        issueImmediate) ou CommandCore.issue (cible), aide « Encercler » (nasse.ts),
 *                                        sortie filtrée, fermetures de rues, secours, incidents, métro, « Suivez-moi »,
 *                                        proposition de l'adjoint, sommations (chaîne légale). Un renfort de
 *                                        commissariat (qui.fromStation) est d'abord engagé
 *                                        (core.engageFromCommissariat), puis reçoit l'ordre dans le même pas.
 *                                        Une ligne 🔒 n'est jamais envoyée ici : la fiche ouvre S3, qui lance la chaîne
 *                                        légale (legalCheck puis core.legalChain.start).
 *   lineSends(ligne)                     la ligne donne un ordre (sinon elle change l'état de la fiche : « L'envoyer
 *                                        ailleurs… », « Autres ordres ici… », « Envoyer TV 75-19 »…).
 *   undoOrder(core, unités)              « Annuler l'ordre » (X, 5 s) : « cesser » aux mêmes unités.
 *   legalCheck(core, env, ligne, qui, lieu)  étapes de S3 et plan de la chaîne légale.
 *   coreLegalDeps(core)                  dépendances de la chaîne légale liées à la partie (carte fermée comprise).
 * ===================================================================================== */

import type { ForceLevel, OrderType, Squad } from '@/core/contracts';
import { pickFilterExit } from '../maps/barrages';
import { windFrom } from '../maps/widgets';
import type { SceneCrowdExits } from '../maps/barrages';
import type { MapUnit } from '../maps/units';
import { nasseSections } from './bestUnit';
import type { CardEnv, CardLine, LegalPlan, Repere, SendEnv, SendMapLike, WhoCandidate } from './cardTypes';
import type { CommandCore } from './core';
import { legalPlan, legalSteps } from './legalChain';
import type { LegalDeps, LegalStepsResult } from './legalChain';
import { acceptNasse, nearestCrowd, openFilteredExit, proposeNasse } from './nasse';
import {
  MIN_LINE, areaToOrder, lineToOrder, pointHeading, slotsAlongLine, splitLine, spreadPoint, verbOf, withArticle,
} from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import { forceRequest, radioFrame } from './phrases';
import { autoLineFor, placePhrase, streetAt, subjectOf } from './preview';

export interface SendResult {
  ok: boolean;
  /** Succès : « Section MISTRAL 2 → Barrer la rue de Rivoli » (en-tête « ✓ ORDRE DONNÉ ») ; échec : le motif. */
  text: string;
  /** Unités qui ont reçu l'ordre (« Annuler l'ordre » leur donne « cesser ») ; vide pour une action sans unité. */
  squads: number[];
}

/** Actions qui changent la fiche au lieu de donner un ordre (l'écran les traite). */
const UI_ACTIONS: ReadonlySet<string> = new Set(['sendElsewhere', 'pickTarget', 'others', 'stationList', 'engage']);

/** La ligne donne un ordre ou fait une action de terrain (false : elle change l'état de la fiche). */
export function lineSends(line: CardLine): boolean {
  return !UI_ACTIONS.has(line.action.kind);
}

function fail(text: string): SendResult {
  return { ok: false, text, squads: [] };
}

/** Titre de l'ordre donné, avec le lieu : « Barrer la rue de Rivoli », « Y aller — Ici : près de la rue Royale ». */
export function sentTitle(line: CardLine, where: Repere): string {
  const lab = line.label;
  if (where.kind === 'rue' && /^Barrer la rue/.test(lab)) return `Barrer ${placePhrase(where)}${lab.slice('Barrer la rue'.length)}`;
  const name = where.name.split(' — ')[0]!.trim();
  if (name === '' || where.kind === 'unite' || where.kind === 'vous') return lab;
  if (where.kind === 'rue') return `${lab} — ${withArticle(name.charAt(0).toLocaleLowerCase('fr-FR') + name.slice(1))}`;
  return `${lab} — ${name}`;
}

function okText(who: WhoCandidate | null, line: CardLine, where: Repere): string {
  const title = sentTitle(line, where);
  return who && who.squadIds.length > 0 ? `${who.label} → ${title}` : title;
}

// ───────────────────────────── ordres sans carte (chaîne légale) ─────────────────────────────

/** Unités à manœuvrer : les squads commandables, sans celles dont une unité supérieure est aussi désignée. */
function squadsOf(core: CommandCore, ids: readonly number[]): Squad[] {
  const all = ids.map((id) => core.ctx.squads.get(id)).filter((s): s is Squad => !!s && core.canCommand(s.id));
  const set = new Set(all.map((s) => s.id));
  return all.filter((s) => {
    let p = s.parentId;
    for (let guard = 0; p !== 0 && guard < 8; guard++) {
      if (set.has(p)) return false;
      p = core.ctx.squads.get(p)?.parentId ?? 0;
    }
    return true;
  }).sort((a, b) => a.id - b.id);
}

/** Position d'une unité (son chef, sinon son premier membre). */
function squadPos(core: CommandCore, s: Squad): { x: number; z: number; valid: number } {
  const lead = s.leaderId !== 0 ? core.ctx.people.get(s.leaderId) : undefined;
  const p = lead ?? (s.members.length > 0 ? core.ctx.people.get(s.members[0]!) : undefined);
  return { x: p ? p.x : 0, z: p ? p.z : 0, valid: Math.max(1, s.members.length) };
}

/** Ordres pour lesquels plusieurs unités envoyées au même point se rangent côte à côte (comme sur la carte). */
const SPREAD: ReadonlySet<string> = new Set(['avancer', 'colonne', 'bond_offensif', 'charge', 'refoulement', 'repli', 'tenir', 'ligne']);
const POINT_SPACING = 10;

/**
 * Mêmes ordres que TacticalMap.issue*, mais pour des unités nommées et sans écran (la chaîne légale part carte fermée).
 * Les fermetures, secours et incidents ne passent jamais par ici.
 */
export class DirectIssuer implements Pick<SendMapLike, 'issueImmediate' | 'issuePoint' | 'issueLine' | 'issueArea'> {
  /** Motif du dernier refus ('' sinon). */
  reason = '';

  constructor(private readonly core: CommandCore, private readonly ids: readonly number[]) {}

  private squads(): Squad[] {
    return squadsOf(this.core, this.ids);
  }

  private done(r: { ok: boolean; reason: string }): boolean {
    this.reason = r.ok ? '' : r.reason;
    return r.ok;
  }

  issueImmediate(verb: OrderVerb): boolean {
    const squads = this.squads();
    if (squads.length === 0) return this.done({ ok: false, reason: 'Aucune unité sous vos ordres.' });
    const target = verb.type === 'embarquer' && squads.length === 1 ? squads[0]!.vehicleId : 0;
    return this.done(this.core.issue(verb.type, squads, null, target));
  }

  issuePoint(verb: OrderVerb, x: number, z: number, face: number, targetId = 0, targetName = ''): boolean {
    const squads = this.squads();
    if (squads.length === 0 && verb.type !== 'degager_obstacle') return this.done({ ok: false, reason: 'Aucune unité sous vos ordres.' });
    const pos = squads.map((s) => squadPos(this.core, s));
    const cx = pos.length ? pos.reduce((a, p) => a + p.x, 0) / pos.length : x;
    const cz = pos.length ? pos.reduce((a, p) => a + p.z, 0) / pos.length : z;
    const heading = face === face ? face : pointHeading(verb.type, cx, cz, x, z);
    let ordered = squads;
    const geoms: OrderGeom[] = [];
    if (squads.length > 1 && targetId === 0 && SPREAD.has(verb.type)) {
      const idx = slotsAlongLine({ x, z, heading, width: 0 }, pos);
      ordered = idx.map((i) => squads[i]!);
      spreadPoint(x, z, heading, squads.length, POINT_SPACING, geoms);
    } else geoms.push({ x, z, heading, width: 0 });
    return this.done(this.core.issue(verb.type, ordered, geoms, targetId, targetName));
  }

  issueLine(verb: OrderVerb, ax: number, az: number, bx: number, bz: number): boolean {
    const squads = this.squads();
    if (squads.length === 0) return this.done({ ok: false, reason: 'Aucune unité sous vos ordres.' });
    const g: OrderGeom = { x: 0, z: 0, heading: 0, width: 0 };
    lineToOrder(ax, az, bx, bz, g);
    if (g.width < MIN_LINE) return this.issuePoint(verb, g.x, g.z, NaN);
    const pos = squads.map((s) => squadPos(this.core, s));
    const idx = slotsAlongLine(g, pos);
    const ordered = idx.map((i) => squads[i]!);
    const geoms: OrderGeom[] = [];
    splitLine(g, idx.map((i) => pos[i]!.valid), geoms);
    return this.done(this.core.issue(verb.type, ordered, geoms));
  }

  issueArea(verb: OrderVerb, cx: number, cz: number, px: number, pz: number): boolean {
    const squads = this.squads();
    if (squads.length === 0) return this.done({ ok: false, reason: 'Aucune unité sous vos ordres.' });
    if (Math.hypot(px - cx, pz - cz) < 2) {
      const pos = squads.map((s) => squadPos(this.core, s));
      const fx = pos.reduce((a, p) => a + p.x, 0) / pos.length;
      const fz = pos.reduce((a, p) => a + p.z, 0) / pos.length;
      const h = pointHeading('avancer', fx, fz, cx, cz);
      px = cx + Math.sin(h) * 18;
      pz = cz + Math.cos(h) * 18;
    }
    const g: OrderGeom = { x: 0, z: 0, heading: 0, width: 0 };
    areaToOrder(cx, cz, px, pz, g);
    return this.done(this.core.issue(verb.type, squads, [g]));
  }
}

// ───────────────────────────── ordres du catalogue ─────────────────────────────

type Issuer = Pick<SendMapLike, 'issueImmediate' | 'issuePoint' | 'issueLine' | 'issueArea'>;

/** Personne à interpeller près du point (protestataire libre, interpellable), null sinon. */
function arrestable(core: CommandCore, x: number, z: number, radius: number): { id: number; x: number; z: number } | null {
  const ctx = core.ctx;
  const p = ctx.people.nearest(x, z, radius, (q) => q.faction === 'protest' && q.custody === 'free' && ctx.law.canArrest(q));
  return p ? { id: p.id, x: p.x, z: p.z } : null;
}

/** Donne un ordre du catalogue (ligne `verb`) : mêmes gestes que la carte, sans tracé. */
function sendVerb(
  core: CommandCore, issuer: Issuer, card: CardEnv, line: CardLine, squads: readonly number[], where: Repere,
  trace: SendEnv['trace'],
): { ok: boolean; reason: string } {
  const a = line.action;
  if (a.kind !== 'verb') return { ok: false, reason: '' };
  const verb = verbOf(a.type);
  if (!verb) return { ok: false, reason: 'Cet ordre n’existe pas dans cette version.' };
  const chk = core.check(verb);
  if (!chk.ok) return { ok: false, reason: chk.reason };
  const name = where.name.split(' — ')[0]!;
  const targetId = a.targetId ?? 0;
  let ok: boolean;
  switch (a.geom) {
    case 'street': {
      const st = streetAt(where, card);
      ok = issuer.issuePoint(verb, st.x, st.z, NaN, targetId);
      break;
    }
    case 'autoLine': {
      const units = squads.map((id) => card.units.find((u) => u.squadId === id)).filter((u) => u !== undefined);
      const l = autoLineFor(where, card, units);
      ok = issuer.issueLine(verb, l.ax, l.az, l.bx, l.bz);
      break;
    }
    case 'trace':
      if (!trace) return { ok: false, reason: 'Désignez d’abord les deux bouts de la ligne.' };
      ok = issuer.issueLine(verb, trace.ax, trace.az, trace.bx, trace.bz);
      break;
    case 'circle':
      ok = issuer.issueArea(verb, where.x, where.z, where.x, where.z);
      break;
    case 'immediate':
      ok = issuer.issueImmediate(verb);
      break;
    case 'target': {
      if (a.type === 'interpeller' && targetId === 0) {
        // dans une foule : l'auteur interpellable le plus proche du centre ; ailleurs, à 14 m
        const r = where.kind === 'foule' || where.kind === 'nasse' ? 40 : 14;
        const p = arrestable(core, where.x, where.z, r);
        ok = p ? issuer.issuePoint(verb, p.x, p.z, NaN, p.id, 'l’auteur désigné') : issuer.issuePoint(verb, where.x, where.z, NaN);
        break;
      }
      if (targetId <= 0) {
        ok = issuer.issuePoint(verb, where.x, where.z, NaN);
        break;
      }
      const list = squadsOf(core, squads);
      if (list.length === 0) return { ok: false, reason: 'Aucune unité sous vos ordres.' };
      const pos = list.map((s) => squadPos(core, s));
      const fx = pos.reduce((s, p) => s + p.x, 0) / pos.length;
      const fz = pos.reduce((s, p) => s + p.z, 0) / pos.length;
      const r = core.issue(a.type, list, [{ x: where.x, z: where.z, heading: pointHeading(a.type, fx, fz, where.x, where.z), width: 0 }], targetId, name);
      return { ok: r.ok, reason: r.reason };
    }
    default: {
      if (a.type === 'interpeller' && targetId === 0) {
        const p = arrestable(core, where.x, where.z, 14);
        ok = p ? issuer.issuePoint(verb, p.x, p.z, NaN, p.id, 'l’auteur désigné') : issuer.issuePoint(verb, where.x, where.z, NaN);
      } else ok = issuer.issuePoint(verb, where.x, where.z, NaN, targetId, where.kind === 'foule' || where.kind === 'nasse' ? name : '');
    }
  }
  const reason = issuer instanceof DirectIssuer ? issuer.reason : '';
  return { ok, reason: ok ? '' : reason || 'L’ordre n’a pas pu partir.' };
}

/** Ordre d'un plan de la chaîne légale (carte fermée possible) : Qui du plan, sans écran. */
export function issuePlan(core: CommandCore, card: CardEnv, plan: LegalPlan): { ok: boolean; reason: string } {
  const ids = plan.who ? plan.who.squadIds : [];
  return sendVerb(core, new DirectIssuer(core, ids), card, plan.line, ids, plan.where, null);
}

// ───────────────────────────── envoi d'une ligne ─────────────────────────────

function sceneCrowd(core: CommandCore, where: Repere): SceneCrowdExits | null {
  const list = core.maps.scene.crowdExits;
  if (where.crowdKey !== undefined) {
    const c = list.find((q) => q.key === where.crowdKey);
    if (c) return c;
  }
  return nearestCrowd(list, where.x, where.z, 80);
}

function mapUnit(core: CommandCore, squadId: number): MapUnit | null {
  return core.maps.scene.unitModel.get(squadId) ?? core.maps.scene.units.find((u) => u.squadId === squadId) ?? null;
}

/**
 * Envoie la ligne surlignée de la fiche à Qui. Ne lance jamais une ligne 🔒 (S3 s'en charge) ; ne fait rien pour
 * une ligne qui change la fiche (lineSends faux). Retourne le texte de S4 (ou le motif du refus) et les unités.
 */
export function sendCardLine(env: SendEnv, line: CardLine, who: WhoCandidate | null, where: Repere): SendResult {
  const core = env.core;
  const ctx = core.ctx;
  if (!lineSends(line)) return fail('');
  if (line.lock) return fail(`Il faut d’abord : ${line.lock.text}.`);
  if (core.scope().level === 'lecture') return fail('Lecture seule : vous ne donnez pas d’ordre.');
  const a = line.action;
  let squads = who ? who.squadIds.filter((id) => id > 0) : [];
  // renfort d'un commissariat : engagé seulement maintenant, puis l'ordre part dans le même pas
  if (who && who.fromStation !== undefined) {
    if (!core.engageFromCommissariat) return fail('Les renforts des commissariats ne sont pas disponibles.');
    const r = core.engageFromCommissariat(who.fromStation);
    if (!r.ok || r.squadId <= 0) return fail(r.reason || 'Ce renfort ne peut pas être engagé.');
    core.invalidateScope();
    squads = [r.squadId];
  }
  const needUnit = line.needsWho && a.kind !== 'closeRoad' && !(a.kind === 'verb' && a.type === 'degager_obstacle');
  if (needUnit && squads.length === 0) return fail('Choisissez d’abord l’unité (U).');
  const done = (text: string, ids: readonly number[] = squads): SendResult => ({ ok: true, text, squads: ids.slice() });
  switch (a.kind) {
    case 'verb': {
      env.setSelection(squads);
      const r = sendVerb(core, env.map, env.card, line, squads, where, env.trace);
      if (!r.ok) return fail(r.reason);
      // les unités qui ont réellement reçu l'ordre (une subordonnée d'une unité désignée fait partie de sa colonne)
      const sent = a.type === 'degager_obstacle' && squads.length === 0 ? lastIssued(core) : squadsOf(core, squads).map((s) => s.id);
      return done(okText(who, line, where), sent);
    }
    case 'nasse': {
      const crowd = sceneCrowd(core, where);
      if (!crowd) return fail('Aucune foule repérée ici.');
      const selected = squads.map((id) => mapUnit(core, id)).filter((u): u is MapUnit => u !== null);
      const prop = proposeNasse(core, crowd, selected, nasseSections(core, (id) => core.canCommand(id)));
      if (!prop.pending || !core.nasse) return fail(prop.text);
      const ids = core.nasse.lines.map((l) => l.squadId);
      const r = acceptNasse(core);
      return r.ok ? done(r.text, ids) : fail(r.text);
    }
    case 'filteredExit': {
      const crowd = sceneCrowd(core, where);
      if (!crowd) return fail('Aucune nasse repérée ici.');
      const e = pickFilterExit(crowd.exits, (id) => core.canCommand(id));
      const r = openFilteredExit(core, crowd);
      return r.ok ? done(r.text, e ? [e.squadId] : []) : fail(r.text);
    }
    case 'closeRoad': {
      const traffic = core.traffic;
      if (!traffic || !core.scope().canTraffic) return fail('La circulation n’est pas pilotable pour cette mission.');
      const holder = squads.slice(0, 1);
      env.setSelection(holder);
      const before = traffic.closures.length;
      const st = streetAt(where, env.card);
      env.map.closeRoad(st.x, st.z);
      if (traffic.closures.length <= before) return fail('Aucune rue à fermer à cet endroit.');
      return done(`Fermer aux voitures — ${st.name}`, holder);
    }
    case 'closeArea': {
      const traffic = core.traffic;
      if (!traffic || !core.scope().canTraffic) return fail('La circulation n’est pas pilotable pour cette mission.');
      const before = traffic.closures.length;
      env.map.closeArea(where.x, where.z, a.radius);
      if (traffic.closures.length <= before) return fail('Aucune rue n’entre dans ce périmètre.');
      return done(`Quartier fermé aux voitures (${a.radius} m)`, []);
    }
    case 'rescue': {
      if (!core.rescue || !core.scope().canDelegate) return fail('Pompiers et SAMU ne sont pas joignables pour cette mission.');
      const inc = a.incidentId !== 0 ? core.incidents?.get(a.incidentId) : undefined;
      if (inc) {
        // comme le panneau des incidents : l'incident est confié aux secours, qu'on demande s'ils ne sont pas déjà en route
        core.incidents!.assign(inc.id, a.service, 0);
        const pending = core.rescue.calls.some((c) => c.kind === a.service && c.incidentId === inc.id && c.state !== 'reparti' && c.state !== 'annule');
        if (!pending) env.map.callRescue(a.service, inc.x, inc.z, inc.id);
      } else env.map.callRescue(a.service, where.x, where.z, 0);
      return done(`${a.service === 'pompiers' ? 'Pompiers demandés' : 'SAMU demandé'} — ${where.name.split(' — ')[0]}`, []);
    }
    case 'means':
    case 'assignOther': {
      const u = squads.length > 0 ? mapUnit(core, squads[0]!) : null;
      if (!u) return fail('Choisissez d’abord l’unité (U).');
      if (!env.map.assignToUnit(a.incidentId, u)) return fail(`${u.name} ne peut pas traiter cet incident.`);
      return done(okText(who, line, where), [u.squadId]);
    }
    case 'unassign': {
      if (!core.incidents) return fail('Aucun incident à traiter pour cette mission.');
      core.incidents.unassign(a.incidentId);
      return done('Affectation retirée', []);
    }
    case 'cancelCall': {
      if (!core.rescue) return fail('Aucun appel de secours en cours.');
      core.rescue.cancel(a.callId);
      return done('Demande de secours annulée', []);
    }
    case 'metro':
      return sendMetro(core, a.stationId, a.op, squads);
    case 'reopen': {
      const traffic = core.traffic;
      if (!traffic || !core.scope().canTraffic) return fail('La circulation n’est pas pilotable pour cette mission.');
      const c = traffic.closures.find((q) => q.id === a.closureId);
      if (!c) return fail('Cette rue est déjà rouverte.');
      const edge = ctx.world.edge(c.edgeId);
      const name = edge && edge.name ? edge.name : ctx.world.sectorName(c.x, c.z) || 'voie sans nom';
      traffic.open(c.id);
      ctx.radio.say({
        channel: 'commandement', from: core.callsign(), priority: 1, personId: ctx.player.state.personId,
        text: radioFrame('CENTRAL', core.callsign(), `Circulation rétablie, ${name}`, false),
      });
      return done(`Circulation rétablie — ${name}`, []);
    }
    case 'reopenAll': {
      const traffic = core.traffic;
      if (!traffic || !core.scope().canTraffic) return fail('La circulation n’est pas pilotable pour cette mission.');
      traffic.openAll();
      return done('Toutes les rues sont rouvertes à la circulation', []);
    }
    case 'follow': {
      const r = core.callFollow(a.column);
      if (!r.ok) return fail(r.reason);
      const u = core.followUnit();
      return done(`${a.column ? 'Suivez-moi en véhicules' : 'Suivez-moi à pied'}${u ? ` — ${u.name}` : ''}`, u ? [u.id] : []);
    }
    case 'centre':
      env.centre?.(where.x, where.z);
      return { ok: true, text: '', squads: [] };
    case 'proposal': {
      const cmd = ctx.service<{ accept(id: number): boolean; dismiss(id: number): void }>('police.command');
      const id = where.proposalId ?? 0;
      if (!cmd || id === 0) return fail('Cette proposition n’est plus d’actualité.');
      if (!a.accept) {
        cmd.dismiss(id);
        return done('Proposition écartée', []);
      }
      return cmd.accept(id) ? done('Proposition acceptée : l’adjoint fait exécuter', []) : fail('Cette proposition n’est plus d’actualité.');
    }
    case 'sommation': {
      const card = env.card;
      if (card.sommations >= 3) return fail('Les sommations sont déjà faites.');
      if (a.all) {
        const r = legalCheck(core, card, line, null, where);
        if (!r.chain || !r.plan) return fail(r.reason);
        core.legalChain.start(r.plan);
        return done(r.plan.viaOfficer ? 'Sommations demandées à l’officier sur place' : 'Sommations lancées', []);
      }
      const r = sommationOnce(core, where);
      return r.ok ? done(r.text, []) : fail(r.text);
    }
    case 'liaison': {
      // l'équipe de liaison au contact des organisateurs (crowd.core.setLiaison, effet de la bible F.4) ; réservé à qui
      // commande tout le dispositif, une seule fois par partie (le directeur de la foule remet le drapeau à chaque partie)
      const api = ctx.service<{ setLiaison?(active: boolean): void }>('crowd.core');
      if (!api || typeof api.setLiaison !== 'function' || core.scope().level !== 'tout') {
        return fail('Seul le commandant du dispositif engage l’équipe de liaison.');
      }
      if (env.card.liaison === true) return fail('L’équipe de liaison est déjà au contact des organisateurs.');
      api.setLiaison(true);
      ctx.radio.say({
        channel: 'commandement', from: core.callsign(), priority: 1, personId: ctx.player.state.personId,
        text: radioFrame('LIAISON', core.callsign(), 'Prenez contact avec les organisateurs, négociez le parcours', false),
      });
      return done('Équipe de liaison au contact des organisateurs', []);
    }
    default:
      return fail('');
  }
}

/** Unités du dernier ordre tracé (Centaure choisi par la simulation pour « pousser un véhicule »). */
function lastIssued(core: CommandCore): number[] {
  const last = core.issued[core.issued.length - 1];
  return last ? [last.squadId] : [];
}

function sendMetro(core: CommandCore, stationId: number, op: 'close' | 'open' | 'filter' | 'unfilter', squads: readonly number[]): SendResult {
  const ctx = core.ctx;
  const metro = core.metro;
  const s = metro?.get(stationId);
  if (!metro || !s) return fail('Le métro n’est pas pilotable pour cette mission.');
  const me = ctx.player.state.personId;
  if (op === 'close' || op === 'open') {
    if (!core.scope().canMetro) return fail('Seul le commandant fait fermer une station.');
    metro.setOpen(s.id, op === 'open', me);
    ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: me,
      text: radioFrame('CENTRAL', core.callsign(), op === 'open' ? `Demande la réouverture de la station ${s.name}` : `Demande la fermeture de la station ${s.name}`, true),
    });
    return { ok: true, text: op === 'open' ? `Station ${s.name} rouverte` : `Fermeture de la station ${s.name} demandée`, squads: [] };
  }
  if (op === 'unfilter') {
    metro.setFiltered(s.id, false, 0);
    return { ok: true, text: `Filtrage levé — station ${s.name}`, squads: [] };
  }
  // la plus proche des unités de Qui tient la sortie
  const list = squadsOf(core, squads);
  if (list.length === 0) return fail('Choisissez d’abord l’unité qui filtrera la sortie (U).');
  let best = list[0]!;
  let bd = Infinity;
  for (const q of list) {
    const p = squadPos(core, q);
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  metro.setFiltered(s.id, true, best.id);
  ctx.radio.say({
    channel: 'commandement', from: core.callsign(), priority: 1, personId: me,
    text: radioFrame(best.name, core.callsign(), `Filtrez la sortie de la station ${s.name}, contrôles à vue`, true),
  });
  return { ok: true, text: `${best.name} → Filtrer la sortie — station ${s.name}`, squads: [best.id] };
}

/** « Annuler l'ordre » (X, dans les 5 s) : un ordre ordinaire « cesser » aux mêmes unités ; rien n'est défait. */
export function undoOrder(core: CommandCore, squads: readonly number[]): { ok: boolean; reason: string; count: number } {
  const list = squadsOf(core, squads);
  if (list.length === 0) return { ok: false, reason: 'Aucune unité à arrêter.', count: 0 };
  return core.issue('cesser' as OrderType, list, null);
}

// ───────────────────────────── sommations et chaîne légale ─────────────────────────────

const STAGE_SAID: readonly string[] = [
  'Aucune sommation', 'Annonce faite : « Obéissance à la loi »', 'Première sommation faite', 'Dernière sommation faite',
];

interface AdvisorLike {
  sommationRefusal(by: unknown): string;
  sommationWait(): number;
  forceWait(): number;
  riposteAt(x: number, z: number): boolean;
}

interface PoliceCommandLike {
  requestSommation(companySquadId: number, x: number, z: number): boolean;
}

function advisorOf(core: CommandCore): AdvisorLike | null {
  const a = core.ctx.service<AdvisorLike>('law.advisor');
  return a && typeof a.sommationRefusal === 'function' ? a : null;
}

/** Compagnie dont l'officier fera les sommations sur ordre (la plus proche du lieu parmi les miennes), null sinon. */
function officerCompany(core: CommandCore, x: number, z: number): Squad | null {
  const cmd = core.ctx.service<PoliceCommandLike>('police.command');
  if (!cmd || typeof cmd.requestSommation !== 'function') return null;
  let best: Squad | null = null;
  let bd = Infinity;
  for (const q of core.ctx.squads.list) {
    if (q.kind !== 'compagnie' || q.faction !== 'police') continue;
    const p = squadPos(core, q);
    const d = Math.hypot(p.x - x, p.z - z) + (core.canCommand(q.id) ? 0 : 1e6);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** Sommation suivante prononcée par le joueur ; trace radio comme le panneau légal. true si l'étape a avancé. */
function playerSommation(core: CommandCore): boolean {
  const ctx = core.ctx;
  const p = core.player();
  if (!p) return false;
  const before = ctx.law.roe.sommation;
  const stage = ctx.law.sommation(p);
  if (stage === before) return false;
  // le texte réglementaire est diffusé par l'événement law:sommation ; ici, la trace radio
  ctx.radio.say({
    channel: 'commandement', from: core.callsign(), priority: 2, personId: p.id,
    text: `À TOUS ICI ${core.callsign().toUpperCase()}. ${STAGE_SAID[Math.min(3, stage)]}. ${stage >= 3 ? 'Emploi de la force possible sur mon ordre.' : 'Aucun emploi de la force avant mon ordre.'} TERMINÉ.`,
  });
  return true;
}

/** L'officier de la compagnie est envoyé prononcer la sommation suivante au lieu (salle de commandement). */
function officerSommation(core: CommandCore, x: number, z: number): boolean {
  const ctx = core.ctx;
  const cmd = ctx.service<PoliceCommandLike>('police.command');
  const company = officerCompany(core, x, z);
  if (!cmd || !company || !Number.isFinite(x) || !Number.isFinite(z) || !cmd.requestSommation(company.id, x, z)) return false;
  ctx.radio.say({
    channel: 'commandement', from: core.callsign(), priority: 2, personId: ctx.player.state.personId,
    text: `${company.name.toUpperCase()} ICI ${core.callsign().toUpperCase()}. Portez-vous à portée de mégaphone et procédez à la sommation suivante. PARLEZ.`,
  });
  return true;
}

/** « Faire la sommation suivante seulement » : par le joueur, sinon par l'officier sur place. */
function sommationOnce(core: CommandCore, where: Repere): { ok: boolean; text: string } {
  const ctx = core.ctx;
  const p = core.player();
  const adv = advisorOf(core);
  const salle = ctx.session.config?.extra?.['variante'] === 'salle';
  const refusal = p && adv ? adv.sommationRefusal(p) : '';
  if (!salle && core.scope().canSommation && refusal === '' && playerSommation(core)) return { ok: true, text: 'Sommation faite' };
  if ((salle || refusal !== '') && officerSommation(core, where.x, where.z)) return { ok: true, text: 'Sommation demandée à l’officier sur place' };
  return { ok: false, text: refusal !== '' ? refusal : 'Sommation impossible : aucune autorité habilitée sur place.' };
}

/**
 * Étapes de S3 pour une ligne 🔒 / ⚖ (ou « Faire les sommations ») et le plan à confirmer : qui fait les sommations
 * (le joueur, l'officier sur place) ou pourquoi personne ne le peut ; l'autorisation ; l'ordre. `plan` est null quand
 * la chaîne est impossible (`reason` le dit).
 */
export function legalCheck(
  core: CommandCore, card: CardEnv, line: CardLine, who: WhoCandidate | null, where: Repere,
): LegalStepsResult & { plan: LegalPlan | null } {
  const ctx = core.ctx;
  const sc = core.scope();
  const roe = ctx.law.roe;
  const adv = advisorOf(core);
  const p = core.player();
  const a = line.action;
  const verb = a.kind === 'verb' ? verbOf(a.type) ?? null : null;
  const refusal = p && adv ? adv.sommationRefusal(p) : sc.canSommation ? '' : 'Seul le commandant peut prononcer les sommations.';
  const salle = card.salle;
  const officer = !!officerCompany(core, where.x, where.z);
  let what = '';
  if (verb) {
    const subj = who && who.squadIds.length > 0 ? subjectOf(who.label) : null;
    const forms = LEGAL_WHAT[verb.type];
    const crowd = where.kind === 'foule' || where.kind === 'nasse';
    const act = forms
      ? forms[subj && subj.plural ? 1 : 0].replace('{sur}', crowd ? 'sur la foule' : 'ici').replace('{vers}', crowd ? 'vers la foule' : 'jusqu’ici')
      : verb.doing;
    what = `${subj ? subj.text : 'l’unité'} ${act}`;
    // le gaz : d'où vient le vent et où ira le nuage (§2.5)
    if (verb.type === 'disperser_gaz' && card.wind && Math.hypot(card.wind.x, card.wind.z) >= 0.3) what += ` (${windDrift(card.wind.x, card.wind.z)})`;
  }
  const r = legalSteps(
    verb ? { force: verb.force, coercive: verb.coercive } : null,
    { sommations: roe.sommation, authorised: roe.authorizedForce as ForceLevel, underAttack: roe.underAttack, riposte: card.riposteAt(where.x, where.z) },
    { level: sc.level, canSommation: sc.canSommation, canAuthorize: sc.canAuthorize, salle, officer },
    refusal, what,
  );
  return { ...r, plan: r.chain ? legalPlan(line, who, where, r) : null };
}

/** « vent de sud-ouest : le nuage ira vers le nord-est » (vecteur du vent : là où il souffle). */
export function windDrift(windX: number, windZ: number): string {
  const toward = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest'];
  const bearing = Math.atan2(windX, -windZ);
  const i = ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;
  return `vent ${windFrom(windX, windZ)}\u00a0: le nuage ira vers ${toward[i]!}`;
}

/** Fin de l'étape de l'ordre en S3 (singulier, pluriel) : « puis la section MISTRAL 2 lance le gaz lacrymogène ici ». */
const LEGAL_WHAT: Readonly<Record<string, readonly [string, string]>> = {
  disperser_gaz: ['lance le gaz lacrymogène {sur}', 'lancent le gaz lacrymogène {sur}'],
  charge: ['charge {vers}', 'chargent {vers}'],
  refoulement: ['repousse la foule', 'repoussent la foule'],
  bond_offensif: ['fait un bond en avant {vers}', 'font un bond en avant {vers}'],
  encercler: ['encercle la foule', 'encerclent la foule'],
};

/**
 * Dépendances de la chaîne légale liées à la partie : sommations du joueur (ou de l'officier sur place), délais du
 * conseiller juridique, autorisation, demande radio, ordre final sans écran (DirectIssuer). Lues à chaque pas.
 */
export function coreLegalDeps(core: CommandCore, cardOf: () => CardEnv): LegalDeps {
  return {
    sommation: () => playerSommation(core),
    requestSommation: (plan) => officerSommation(core, plan.where.x, plan.where.z),
    sommationWait: () => advisorOf(core)?.sommationWait() ?? 0,
    sommationsDone: () => core.ctx.law.roe.sommation,
    sommationRefusal: () => {
      const p = core.player();
      const adv = advisorOf(core);
      if (!p) return 'Personne pour prononcer les sommations.';
      return adv ? adv.sommationRefusal(p) : '';
    },
    authorize: (level) => core.authorize(level),
    authorised: () => core.ctx.law.roe.authorizedForce,
    requestForce: (level) => {
      const ctx = core.ctx;
      const p = core.player();
      const company = ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police');
      ctx.radio.say({
        channel: 'commandement', from: core.callsign(), priority: 2, personId: p ? p.id : 0,
        text: forceRequest(core.callsign(), p ? ctx.world.sectorName(p.x, p.z) : '', level, ctx.law.roe.underAttack, company?.name),
      });
    },
    forceWait: () => {
      const adv = advisorOf(core);
      return adv ? adv.forceWait() : core.ctx.law.roe.lawfulForce >= 3 ? 0 : Infinity;
    },
    issue: (plan) => issuePlan(core, cardOf(), plan),
  };
}

/** Phrase de la ligne Qui pour un ordre déjà donné (en-tête S4) : « à pied · arrivée ~2 min ». */
export function sentDetail(who: WhoCandidate | null): string {
  if (!who || who.squadIds.length === 0) return '';
  return `${who.mode === 'vehicules' ? 'en véhicules' : 'à pied'} · arrivée ~${Math.max(1, Math.round(who.eta / 60))} min`;
}
