/* =====================================================================================
 * FORCES DE L'ORDRE — manœuvres particulières :
 *
 *   encercler           issues de la zone = voies du graphe routier qui franchissent le cercle
 *                       (chaussées jumelles regroupées, largeur mesurée de façade à façade) ; chaque
 *                       issue est fermée par une ligne tournée vers l'intérieur ; l'effectif est
 *                       réparti au prorata des largeurs, dans l'ordre circulaire (sans croisement) ;
 *                       plusieurs unités qui reçoivent le même ordre se partagent les issues ;
 *   releve              la section fraîche s'aligne 10 m derrière, la section relevée se replie à
 *                       travers elle, puis la relève prend la position (bible §E.8) ;
 *   couper_circulation  barrage en travers de la voie la plus proche (service 'traffic.control') ;
 *   filtrer             le même avec une porte de passage (station de métro : 'crowd.metro') ;
 *   embarquer/debarquer véhicules de l'unité ; équipages conduits par 'vehicles.autopilot'.
 * ===================================================================================== */

import type { EntityId, SquadOrder, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi, TrafficControlApi } from '@/core/extensions';
import { angleDiff, cardinalFr, wrapAngle } from '@/core/math';
import type { ExitInfo } from './api';
import { ENCIRCLE_CLOSE_ALL, ENCIRCLED_EVENT } from './api';
import type { Agent, FormGroup, Unit } from './brain';
import { F_NONE, agentOf, createGroup, unitOf } from './brain';
import { buildLine, probe, probeStreet } from './formation';
import type { Kernel } from './kernel';
import {
  adopt, allSettled, clearSlots, done, formHold, formLine, gather, inPlace, leaderOf, mainGroup, moveTo, report, setPhase,
  setStep, unitCenter,
} from './mcore';
import { placeGroup, settleSlots } from './place';
import { spell } from './radio';
import { fleetOf, refreshFormable, resolveLeads } from './tree';
import * as T from './tuning';

// ───────────────────────────── issues d'une zone ─────────────────────────────

interface Crossing { x: number; z: number; dx: number; dz: number; w: number; a: number; name: string }
const crossings: Crossing[] = [];
let crossingCount = 0;

function addCrossing(x: number, z: number, dx: number, dz: number, w: number, a: number, name: string): void {
  let c = crossings[crossingCount];
  if (!c) {
    c = { x: 0, z: 0, dx: 0, dz: 0, w: 0, a: 0, name: '' };
    crossings[crossingCount] = c;
  }
  c.x = x;
  c.z = z;
  c.dx = dx;
  c.dz = dz;
  c.w = w;
  c.a = a;
  c.name = name;
  crossingCount++;
}

function byAngle(a: Crossing, b: Crossing): number {
  return a.a - b.a;
}

function byBearing(a: ExitInfo, b: ExitInfo): number {
  return a.bearing - b.bearing;
}

/**
 * Issues de la zone circulaire (cx, cz, r) : chaque voie qui franchit le cercle, les chaussées voisines
 * de même direction étant regroupées. Sans réseau routier : postes répartis régulièrement sur le cercle.
 */
export function findExits(k: Kernel, cx: number, cz: number, r: number, out: ExitInfo[]): number {
  const world = k.ctx.world;
  crossingCount = 0;
  const r2 = r * r;
  const edges = world.edgeCount;
  for (let e = 0; e < edges; e++) {
    const info = world.edge(e);
    const pts = info.points;
    const n = pts.length >> 1;
    if (n < 2 || info.id < 0) continue;
    const d0 = Math.hypot(pts[0] - cx, pts[1] - cz);
    const d1 = Math.hypot(pts[n * 2 - 2] - cx, pts[n * 2 - 1] - cz);
    if (Math.min(d0, d1) > r + info.length) continue;
    if (Math.max(d0, d1) + info.length * 0.5 < r) continue;
    const w = info.width + 2 * info.sidewalk;
    for (let i = 1; i < n; i++) {
      const ax = pts[i * 2 - 2] - cx;
      const az = pts[i * 2 - 1] - cz;
      const bx = pts[i * 2] - cx;
      const bz = pts[i * 2 + 1] - cz;
      const ina = ax * ax + az * az < r2;
      const inb = bx * bx + bz * bz < r2;
      if (ina === inb) continue;
      // intersection du segment avec le cercle
      const ex = bx - ax;
      const ez = bz - az;
      const qa = ex * ex + ez * ez;
      const qb = 2 * (ax * ex + az * ez);
      const qc = ax * ax + az * az - r2;
      const disc = qb * qb - 4 * qa * qc;
      if (disc < 0 || qa < 1e-9) continue;
      const sq = Math.sqrt(disc);
      let t = (-qb + sq) / (2 * qa);
      if (t < 0 || t > 1) t = (-qb - sq) / (2 * qa);
      if (t < 0 || t > 1) continue;
      const l = Math.sqrt(qa);
      const s = ina ? 1 : -1;
      const px = ax + ex * t;
      const pz = az + ez * t;
      addCrossing(cx + px, cz + pz, (ex / l) * s, (ez / l) * s, w, Math.atan2(px, pz), info.name);
    }
  }
  out.length = 0;
  if (crossingCount === 0) {
    // aucun réseau : postes réguliers sur le cercle
    const n = Math.max(4, Math.min(8, Math.round((2 * Math.PI * r) / 40)));
    for (let i = 0; i < n; i++) {
      const b = wrapAngle((i * 2 * Math.PI) / n);
      out.push({ x: cx + Math.sin(b) * r, z: cz + Math.cos(b) * r, bearing: b, width: Math.min(24, (2 * Math.PI * r) / n * 0.6), held: true, agents: 0, name: 'poste ' + (i + 1) });
    }
    return out.length;
  }
  crossings.length = crossingCount;
  crossings.sort(byAngle);
  // regroupement des chaussées voisines de même direction (dont celles de part et d'autre de ±π)
  const used: boolean[] = [];
  for (let i = 0; i < crossingCount; i++) used[i] = false;
  for (let i = 0; i < crossingCount; i++) {
    if (used[i]) continue;
    const c = crossings[i];
    let sx = c.x * c.w;
    let sz = c.z * c.w;
    let sw = c.w;
    let dx = c.dx;
    let dz = c.dz;
    let minT = 0;
    let maxT = 0;
    let maxW = c.w;
    let name = c.name;
    used[i] = true;
    // axe transversal du groupe
    const tx = -c.dz;
    const tz = c.dx;
    for (let j = 0; j < crossingCount; j++) {
      if (used[j]) continue;
      const o = crossings[j];
      if (o.dx * c.dx + o.dz * c.dz < 0.6) continue;
      const along = (o.x - c.x) * c.dx + (o.z - c.z) * c.dz;
      const across = (o.x - c.x) * tx + (o.z - c.z) * tz;
      if (Math.abs(along) > 14 || Math.abs(across) > 10 + (o.w + c.w) * 0.5) continue;
      used[j] = true;
      sx += o.x * o.w;
      sz += o.z * o.w;
      sw += o.w;
      dx += o.dx;
      dz += o.dz;
      if (across < minT) minT = across;
      if (across > maxT) maxT = across;
      if (o.w > maxW) {
        maxW = o.w;
        name = o.name;
      }
    }
    const dl = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= dl;
    dz /= dl;
    let x = sx / sw + dx * 3;
    let z = sz / sw + dz * 3;
    let width = maxT - minT + maxW;
    // largeur réelle, de façade à façade
    const h = Math.atan2(dx, dz);
    probeStreet(k, x, z, h, 46);
    if (probe.left < 46 && probe.right < 46) {
      width = probe.left + probe.right;
      const shift = (probe.right - probe.left) / 2;
      x += -Math.cos(h) * shift;
      z += Math.sin(h) * shift;
    }
    out.push({ x, z, bearing: Math.atan2(x - cx, z - cz), width, held: true, agents: 0, name });
  }
  // doublons après recentrage
  for (let i = out.length - 1; i > 0; i--) {
    for (let j = 0; j < i; j++) {
      const ddx = out[i].x - out[j].x;
      const ddz = out[i].z - out[j].z;
      if (ddx * ddx + ddz * ddz < 36) {
        if (out[i].width > out[j].width) out[j] = out[i];
        out.splice(i, 1);
        break;
      }
    }
  }
  out.sort(byBearing);
  return out.length;
}

// ───────────────────────────── encerclement ─────────────────────────────

function sameEncircle(a: SquadOrder, b: SquadOrder): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz < 4 && Math.abs(a.width - b.width) < 2 && Math.abs(a.issuedAt - b.issuedAt) < 0.5;
}

export function startEncircle(k: Kernel, u: Unit, o: SquadOrder): void {
  // même ordre déjà reçu par une unité sœur : on se joint à elle pour se partager les issues
  for (let i = 0; i < k.roots.length; i++) {
    const r = k.roots[i];
    if (r === u || !r.order || r.order.type !== 'encercler' || !sameEncircle(r.order, o)) continue;
    u.joinedTo = r;
    u.isRoot = false;
    if (r.joined.indexOf(u) < 0) r.joined.push(u);
    u.groups.length = 0;
    resolveLeads(k);
    setPhase(k, u, 'mise_en_place');
    layoutEncircle(k, r);
    return;
  }
  const radius = o.width > 0 ? o.width * 0.5 : 60;
  findExits(k, o.x, o.z, radius, u.exits);
  // issue laissée ouverte : celle qui se trouve dans la direction donnée par l'ordre
  if (o.targetId !== ENCIRCLE_CLOSE_ALL && u.exits.length > 1) {
    let best = -1;
    let bestD = 0.9;
    for (let i = 0; i < u.exits.length; i++) {
      const d = Math.abs(angleDiff(u.exits[i].bearing, o.heading));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) u.exits[best].held = false;
  }
  layoutEncircle(k, u);
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

function byLatAgent(a: Agent, b: Agent): number {
  return a.lat - b.lat || a.p.id - b.p.id;
}

const heldExits: number[] = [];
const quota: number[] = [];

/** Répartit l'effectif apte entre les issues tenues et construit une ligne par issue. */
function layoutEncircle(k: Kernel, u: Unit): void {
  const o = u.order!;
  const exits = u.exits;
  const n = gather(k, u);
  clearSlots(u);
  heldExits.length = 0;
  let total = 0;
  for (let i = 0; i < exits.length; i++) {
    exits[i].agents = 0;
    if (!exits[i].held) continue;
    heldExits.push(i);
    total += exits[i].width;
  }
  const h = heldExits.length;
  if (h === 0 || n === 0) {
    u.groups.length = 0;
    return;
  }
  // origine du tri circulaire : milieu du plus grand vide entre deux issues tenues consécutives
  let origin = 0;
  let gap = -1;
  for (let i = 0; i < h; i++) {
    const a = exits[heldExits[i]].bearing;
    const b = exits[heldExits[(i + 1) % h]].bearing;
    let d = b - a;
    if (d <= 0) d += Math.PI * 2;
    if (d > gap) {
      gap = d;
      origin = a + d / 2;
    }
  }
  const agents = k.agentsTmp;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    let ang = Math.atan2(a.p.x - o.x, a.p.z - o.z) - origin;
    ang -= Math.floor(ang / (Math.PI * 2)) * Math.PI * 2;
    a.lat = ang;
  }
  agents.sort(byLatAgent);
  // issues dans le même ordre circulaire
  heldExits.sort((i, j) => {
    let a = exits[i].bearing - origin;
    let b = exits[j].bearing - origin;
    a -= Math.floor(a / (Math.PI * 2)) * Math.PI * 2;
    b -= Math.floor(b / (Math.PI * 2)) * Math.PI * 2;
    return a - b;
  });
  // effectif par issue, au prorata des largeurs (au moins deux agents par issue quand c'est possible)
  let given = 0;
  const floorPer = n >= 2 * h ? 2 : n >= h ? 1 : 0;
  for (let i = 0; i < h; i++) {
    let q = Math.round((n * exits[heldExits[i]].width) / total);
    if (q < floorPer) q = floorPer;
    quota[i] = q;
    given += q;
  }
  // ajustement au total : on retire ou on ajoute là où l'intervalle par agent est le plus favorable
  let guard = 0;
  while (given !== n && guard++ < 400) {
    let best = -1;
    let bestV = given > n ? Infinity : -Infinity;
    for (let i = 0; i < h; i++) {
      const w = exits[heldExits[i]].width;
      if (given > n) {
        if (quota[i] <= floorPer) continue;
        const v = w / quota[i];
        if (v < bestV) {
          bestV = v;
          best = i;
        }
      } else {
        const v = w / (quota[i] || 0.5);
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      }
    }
    if (best < 0) break;
    quota[best] += given > n ? -1 : 1;
    given += given > n ? -1 : 1;
  }
  while (u.groups.length < h) u.groups.push(createGroup());
  u.groups.length = h;
  const chunk = k.agentsTmp2;
  let cursor = 0;
  for (let i = 0; i < h; i++) {
    const ex = exits[heldExits[i]];
    const g = u.groups[i];
    const cnt = Math.min(quota[i], n - cursor);
    chunk.length = 0;
    for (let j = 0; j < cnt; j++) chunk.push(agents[cursor + j]);
    cursor += cnt;
    ex.agents = cnt;
    if (cnt === 0) {
      g.kind = F_NONE;
      g.agents.length = 0;
      g.front.length = 0;
      continue;
    }
    // ligne en travers de l'issue, tournée vers l'intérieur de la zone
    const inward = Math.atan2(o.x - ex.x, o.z - ex.z);
    buildLine(k, g, chunk, cnt, ex.x, ex.z, inward, ex.width);
    g.exitIndex = heldExits[i];
    adopt(g, chunk, cnt);
    placeGroup(k, g);
    settleSlots(k, g);
  }
}

export function progressEncircle(k: Kernel, u: Unit, relayout: boolean): void {
  if (relayout) {
    layoutEncircle(k, u);
    return;
  }
  if (u.phase !== 'mise_en_place') return;
  if (!(allSettled(u, 0.45) || k.now - u.phaseT > 75)) return;
  let held = 0;
  let open = -1;
  for (let i = 0; i < u.exits.length; i++) {
    if (u.exits[i].held && u.exits[i].agents > 0) held++;
    else if (!u.exits[i].held) open = i;
  }
  const body = 'Bouclage en place, ' + spell(held) + (held > 1 ? ' issues tenues' : ' issue tenue')
    + (open >= 0 ? ', sortie contrôlée laissée ouverte face ' + cardinalFr(u.exits[open].bearing) : ', toutes les issues sont fermées');
  inPlace(k, u, body);
  for (let i = 0; i < u.joined.length; i++) setPhase(k, u.joined[i], 'en_place');
  k.emit(ENCIRCLED_EVENT, { squadId: u.id, exits: u.exits.length, held, open: open >= 0 ? 1 : 0 });
  done(k, u, 'encercler', true, '');
}

// ───────────────────────────── quitter un poste ─────────────────────────────

/** Avant un nouvel ordre : rouvre la rue coupée, lève le filtrage, rend leur liberté aux unités jointes. */
export function leavePost(k: Kernel, u: Unit): void {
  const m = u.man;
  const ctx = k.ctx;
  if (m.closureId !== 0) {
    const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
    if (traffic) traffic.open(m.closureId);
    m.closureId = 0;
  }
  if (m.stationId !== 0) {
    const metro = ctx.service<MetroApi>(EXT.metro);
    if (metro) metro.setFiltered(m.stationId, false, u.id);
    m.stationId = 0;
  }
  if (u.joined.length > 0) {
    const joined = u.joined.slice();
    u.joined.length = 0;
    for (let i = 0; i < joined.length; i++) {
      const j = joined[i];
      if (j.joinedTo !== u) continue;
      j.joinedTo = null;
      j.isRoot = true;
    }
    resolveLeads(k);
    for (let i = 0; i < joined.length; i++) {
      if (!joined[i].isRoot) continue;
      refreshFormable(k, joined[i]);
      formHold(k, joined[i]);
      setPhase(k, joined[i], 'en_place');
    }
  }
  u.exits.length = 0;
}

/** Une unité jointe à une autre reprend son autonomie (elle a reçu un ordre propre). */
export function unjoin(k: Kernel, u: Unit): void {
  const host = u.joinedTo;
  if (!host) return;
  const i = host.joined.indexOf(u);
  if (i >= 0) host.joined.splice(i, 1);
  u.joinedTo = null;
  u.isRoot = true;
  resolveLeads(k);
}

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
      if (u.phase === 'mise_en_place' && (allSettled(u, T.IN_PLACE_TOLERANCE) || k.now - u.phaseT > T.FORM_TIMEOUT)) {
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
  let x = o.x;
  let z = o.z;
  let h = o.heading;
  const road = k.road;
  if (k.ctx.world.nearestRoad(x, z, road, 40)) {
    x = road.x;
    z = road.z;
    h = Math.cos(angleDiff(road.heading, o.heading)) >= 0 ? road.heading : wrapAngle(road.heading + Math.PI);
  }
  formLine(k, u, x, z, h, o.width, o.type === 'filtrer' ? T.FILTER_DOOR : 0);
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

export function progressBarrage(k: Kernel, u: Unit): void {
  if (u.phase !== 'mise_en_place') return;
  if (!(allSettled(u, T.IN_PLACE_TOLERANCE) || k.now - u.phaseT > T.FORM_TIMEOUT)) return;
  const ctx = k.ctx;
  const g = u.groups[0];
  const m = u.man;
  const type = u.order!.type;
  const leader = leaderOf(k, u);
  const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
  if (traffic && m.closureId === 0) {
    const c = traffic.closeRoad(g.ax, g.az, leader ? leader.id : 0, u.id);
    if (c) m.closureId = c.id;
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
    : 'Circulation coupée' + where + ', barrage en place face ' + cardinalFr(g.ah));
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
      if (p.poste === 'conducteur' && usable(v) && driverSeatFree(v)) pick = vi;
      else if (freeSeats[vi] > 0) pick = vi;
    }
    for (let j = 0; j < fleet.length && pick < 0; j++) if (freeSeats[j] > 0) pick = j;
    if (pick < 0) continue;
    const v = ctx.vehicles.get(fleet[pick])!;
    if (!(p.poste === 'conducteur' && driverSeatFree(v) && fleet[pick] === (a.home ? a.home.squad.vehicleId : 0))) freeSeats[pick]--;
    a.boardId = v.id;
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
  // le chef est à bord : la ligne se forme une douzaine de mètres devant les véhicules
  const ahead = leader && leader.vehicleId !== 0 ? 12 : 0;
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
    for (let i = 0; i < agents.length; i++) agents[i].boardId = 0;
    setStep(k, u, 1);
    setPhase(k, u, 'embarque');
    u.reported = true;
    report(k, u, 'Embarqué, ' + spell(aboard) + ' à bord' + (left + waiting > 0 ? ', ' + spell(left + waiting) + ' sans place restent à pied' : ''));
    done(k, u, 'embarquer', left + waiting === 0, left + waiting === 0 ? '' : 'Places insuffisantes.');
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
    if (allSettled(u, T.IN_PLACE_TOLERANCE) || k.now - u.phaseT > T.FORM_TIMEOUT) {
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
    for (let i = 0; i < u.agents.length; i++) {
      const p = u.agents[i].p;
      if (type === 'debarquer') {
        if (p.vehicleId !== 0) k.ctx.vehicles.exit(p);
      } else if (p.vehicleId === 0 && !p.isPlayer) {
        k.ctx.vehicles.enter(p, v, p.poste === 'conducteur' ? 'driver' : undefined);
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
