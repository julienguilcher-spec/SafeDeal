/* =====================================================================================
 * FORCES DE L'ORDRE — encerclement (« nasse »).
 *
 *   issues       voies du graphe routier qui franchissent le cercle de la zone ; les chaussées
 *                voisines de même direction sont regroupées (avenue à terre-plein = une issue) et
 *                la largeur est mesurée de façade à façade par des rayons ; sans réseau routier,
 *                des postes sont répartis régulièrement sur le cercle ;
 *   répartition  chaque issue tenue est fermée par une ligne tournée vers l'intérieur ; l'effectif
 *                est réparti au prorata des largeurs, dans l'ordre circulaire (sans croisement) ;
 *   à plusieurs  les unités qui reçoivent le même ordre se joignent à la première et se partagent
 *                les issues ; un ordre propre rend son autonomie à une unité jointe ;
 *   issue libre  celle qui se trouve dans la direction order.heading, sauf targetId = −1.
 * Cadre : docs/research/00-bible-realisme.md §A.3.20 (point de sortie contrôlé).
 * ===================================================================================== */

import type { SquadOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi, TrafficControlApi } from '@/core/extensions';
import { angleDiff, cardinalFr, wrapAngle } from '@/core/math';
import type { ExitInfo } from './api';
import { ENCIRCLE_CLOSE_ALL, ENCIRCLED_EVENT } from './api';
import type { Agent, Unit } from './brain';
import { F_NONE, createGroup } from './brain';
import { buildLine, probe, probeStreet } from './formation';
import type { Kernel } from './kernel';
import { adopt, clearSlots, done, formHold, gather, inPlace, setPhase, setStep, allSettled } from './mcore';
import { placeGroup, settleSlots } from './place';
import { spell } from './radio';
import { refreshFormable, resolveLeads } from './tree';

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
  // en place quand chaque issue est barrée (premiers rangs alignés) : les chefs peuvent encore rejoindre leur poste
  let barred = k.now - u.phaseT > 3;
  for (let i = 0; i < u.groups.length && barred; i++) {
    const g = u.groups[i];
    if (g.kind !== F_NONE && (g.moving || g.errMax > 0.45)) barred = false;
  }
  if (!barred && k.now - u.phaseT < 150) return;
  allSettled(u, 0.45);
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
