/* =====================================================================================
 * FORCES DE L'ORDRE — rue barrée, cordons et nasses.
 *
 *   rue barrée   une unité à pied envoyée sur un point d'une rue (avancer, tenir, ligne, couper_circulation,
 *                filtrer) s'y déploie EN TRAVERS, de façade à façade (chaussée et trottoirs, mesurés par des
 *                rayons sur le bâti), face à la foule la plus proche, coude à coude ; trop peu nombreuse, elle tient
 *                le milieu de la rue, rend compte de la largeur non tenue et demande un renfort ;
 *   cordons      entre deux agents voisins du premier rang à l'arrêt, et entre l'agent de flanc et la façade, un
 *                tronçon que personne ne franchit (ni manifestant, ni passant, ni cycliste) ; forces de l'ordre,
 *                secours et joueur passent. Le cordon suit les agents : une ligne enfoncée (agents écartés,
 *                à terre) s'ouvre — la pression de la foule agit comme avant ;
 *   fermeture    la rue est déclarée fermée (TrafficControlApi) dès que le barrage est en place, rouverte quand
 *                l'unité s'en va ou que la ligne est rompue (détours des cortèges, circulation) ;
 *   nasses       une foule dont toutes les issues (rues et passages piétons) sont tenues — barrages, rues
 *                fermées, encerclement — est nassée : compte rendu sur le réseau de commandement, événement,
 *                la foule le sait (STRANDED) ; une issue filtrée la laisse sortir au compte-gouttes.
 * Service 'police.barrages' (BarragesApi), événements libres 'police:barrage' et 'police:kettle'.
 * ===================================================================================== */

import type { Person, RoadSample, Vec2, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { CordonsApi, TrafficControlApi } from '@/core/extensions';
import { angleDiff, cardinalFr, wrapAngle } from '@/core/math';
import type { BarrageState, BarrageView, BarragesApi, ExitInfo, ExitView, KettleView } from './api';
import { BARRAGE_EVENT, KETTLE_EVENT } from './api';
import type { FormGroup, Unit } from './brain';
import { F_LINE, agentOf } from './brain';
import { probe, probeStreet } from './formation';
import type { Kernel } from './kernel';
import { formLine, leaderOf, report } from './mcore';
import { spell } from './radio';
import * as T from './tuning';

export const B_EN_ROUTE = 0;
export const B_EN_PLACE = 1;
export const B_INCOMPLET = 2;
export const B_ROMPU = 3;
const STATE_NAMES: readonly BarrageState[] = ['en_route', 'en_place', 'incomplet', 'rompu'];

// ───────────────────────────── rue au point ─────────────────────────────

/** Rue au point : point de l'axe, cap de l'axe, voie, nom, distances aux façades (gauche, droite). */
export const street = { x: 0, z: 0, heading: 0, edgeId: -1, name: '', left: 0, right: 0 };
const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

/** Le point est-il dans une rue (bordée de façades des deux côtés) ? Remplit `street`. */
export function streetAt(k: Kernel, x: number, z: number): boolean {
  const world = k.ctx.world;
  if (!world.nearestRoad(x, z, road, 30) || road.edgeId < 0) return false;
  const e = world.edge(road.edgeId);
  const side = e ? e.sidewalk : 2;
  // point désigné sur la chaussée ou ses trottoirs (pas au milieu d'une place voisine)
  if (road.dist > road.width * 0.5 + side + 4) return false;
  probeStreet(k, road.x, road.z, road.heading, T.STREET_PROBE);
  if (!(probe.left < T.STREET_PROBE && probe.right < T.STREET_PROBE)) return false;
  street.x = road.x;
  street.z = road.z;
  street.heading = road.heading;
  street.edgeId = road.edgeId;
  street.name = road.name || (e ? e.name : '');
  street.left = probe.left;
  street.right = probe.right;
  return true;
}

/** Cap le long de l'axe `h` (ou son opposé) tourné vers la foule la plus proche ; sans foule, le plus proche de `want`. */
function facingCrowd(k: Kernel, x: number, z: number, h: number, want: number): number {
  let best = Math.cos(angleDiff(h, want)) >= 0 ? h : wrapAngle(h + Math.PI);
  const list = k.ctx.people.list;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  let bestD = 250 * 250;
  let side = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.faction !== 'protest' || p.dormant || p.custody !== 'free' || p.posture === 'down') continue;
    const dx = p.x - x;
    const dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d >= bestD) continue;
    const along = dx * fx + dz * fz;
    // la foule doit être dans l'axe de la rue, pas derrière une façade latérale
    if (along * along < d * 0.5) continue;
    bestD = d;
    side = along;
  }
  if (side > 0) best = h;
  else if (side < 0) best = wrapAngle(h + Math.PI);
  return best;
}

/**
 * Déploie l'unité en travers de la rue au point (x, z), de façade à façade. Retourne le bloc, ou null si le point
 * n'est pas dans une rue (l'appelant forme alors sa ligne ordinaire).
 */
export function formStreetBarrage(k: Kernel, u: Unit, x: number, z: number, want: number, doorW = 0): FormGroup | null {
  if (u.squad.kind === 'equipage' || !streetAt(k, x, z)) return null;
  // ordre du joueur (ou sans cap) : face à la foule la plus proche ; ordre du commandement : le cap qu'il a choisi
  // (le dispositif place ses barrages face au parcours, même si des casseurs traînent dans la rue derrière)
  const o = u.order;
  const pid = k.ctx.player.state.personId;
  const fromPlayer = !o || (o.issuedBy !== 0 && o.issuedBy === pid) || o.issuedBy === 0;
  const h = fromPlayer || !Number.isFinite(want)
    ? facingCrowd(k, street.x, street.z, street.heading, Number.isFinite(want) ? want : street.heading)
    : Math.cos(angleDiff(street.heading, want)) >= 0 ? street.heading : wrapAngle(street.heading + Math.PI);
  const g = formLine(k, u, street.x, street.z, h, 0, doorW, T.BARRAGE_SPACING);
  const m = u.man;
  // milieu entre les façades, mesuré perpendiculairement à l'axe de la rue (le cap retenu ne change pas la mesure)
  const rx = -Math.cos(street.heading);
  const rz = Math.sin(street.heading);
  const shift = (street.right - street.left) / 2;
  m.barrage = true;
  m.bWalls = true;
  m.bx = street.x + rx * shift;
  m.bz = street.z + rz * shift;
  m.bh = h;
  m.bWidth = street.left + street.right;
  m.bEdge = street.edgeId;
  m.bStreet = street.name;
  m.bState = B_EN_ROUTE;
  m.bCovered = 0;
  m.bBest = 0;
  m.bNext = 0;
  m.bSince = 0;
  m.bShort = false;
  return g;
}

/** Barrage de circulation hors d'une rue bordée (place, carrefour) : la ligne de l'ordre, suivie comme un barrage. */
export function markBarrage(k: Kernel, u: Unit, g: FormGroup): void {
  const m = u.man;
  m.barrage = true;
  m.bWalls = false;
  m.bx = g.ax;
  m.bz = g.az;
  m.bh = g.ah;
  m.bWidth = g.width;
  m.bEdge = -1;
  m.bStreet = '';
  if (k.ctx.world.nearestRoad(g.ax, g.az, road, 15)) {
    m.bEdge = road.edgeId;
    m.bStreet = road.name;
  }
  m.bState = B_EN_ROUTE;
  m.bCovered = 0;
  m.bBest = 0;
  m.bNext = 0;
  m.bSince = 0;
  m.bShort = false;
}

/** L'unité quitte son barrage (nouvel ordre). */
export function clearBarrage(u: Unit): void {
  u.man.barrage = false;
  u.man.bWalls = false;
  u.man.bState = B_EN_ROUTE;
}

// ───────────────────────────── cordons ─────────────────────────────

/**
 * Personne qui franchit un cordon : forces de l'ordre, secours, joueur (sauf s'il joue un manifestant : la ligne ne
 * s'ouvre pas pour lui), personne tenue ou emmenée.
 */
function passes(p: Person): boolean {
  return p.faction === 'police' || p.kind === 'pompier' || p.kind === 'samu' || (p.isPlayer && p.faction !== 'protest') || p.custody !== 'free'
    || p.heldBy !== 0 || p.vehicleId !== 0;
}

export class Cordons implements CordonsApi {
  /** Tronçons [ax, az, bx, bz] et unité qui les tient. */
  private seg = new Float64Array(256);
  private owner = new Int32Array(64);
  count = 0;
  private minX = 0;
  private maxX = 0;
  private minZ = 0;
  private maxZ = 0;

  reset(): void {
    this.count = 0;
  }

  private add(ax: number, az: number, bx: number, bz: number, unit: number): void {
    const n = this.count;
    if ((n + 1) * 4 > this.seg.length) {
      const s = new Float64Array(this.seg.length * 2);
      s.set(this.seg);
      this.seg = s;
      const o = new Int32Array(this.owner.length * 2);
      o.set(this.owner);
      this.owner = o;
    }
    const s = this.seg;
    s[n * 4] = ax;
    s[n * 4 + 1] = az;
    s[n * 4 + 2] = bx;
    s[n * 4 + 3] = bz;
    this.owner[n] = unit;
    this.count = n + 1;
    const x0 = ax < bx ? ax : bx;
    const x1 = ax < bx ? bx : ax;
    const z0 = az < bz ? az : bz;
    const z1 = az < bz ? bz : az;
    if (n === 0) {
      this.minX = x0;
      this.maxX = x1;
      this.minZ = z0;
      this.maxZ = z1;
    } else {
      if (x0 < this.minX) this.minX = x0;
      if (x1 > this.maxX) this.maxX = x1;
      if (z0 < this.minZ) this.minZ = z0;
      if (z1 > this.maxZ) this.maxZ = z1;
    }
  }

  /** Recalcule les tronçons tenus : premiers rangs à l'arrêt, agents à leur emplacement. */
  rebuild(k: Kernel): void {
    this.count = 0;
    const roots = k.roots;
    for (let i = 0; i < roots.length; i++) {
      const u = roots[i];
      for (let j = 0; j < u.groups.length; j++) this.addGroup(k, u, u.groups[j]);
    }
  }

  private holds(a: FormGroup['front'][number]): boolean {
    const p = a.p;
    if (!a.able || a.op !== null || p.posture === 'down' || p.vehicleId !== 0 || p.dormant) return false;
    const dx = a.sx - p.x;
    const dz = a.sz - p.z;
    return dx * dx + dz * dz <= T.CORDON_SLOT * T.CORDON_SLOT;
  }

  private addGroup(k: Kernel, u: Unit, g: FormGroup): void {
    if (g.kind !== F_LINE || g.moving) return;
    const front = g.front;
    const n = front.length;
    if (n === 0) return;
    const rx = -Math.cos(g.ah);
    const rz = Math.sin(g.ah);
    const world = k.ctx.world;
    const hit = k.hit;
    const gap2 = T.CORDON_GAP * T.CORDON_GAP;
    let first = -1;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      if (!this.holds(front[i])) continue;
      const p = front[i].p;
      if (first < 0) first = i;
      if (prev >= 0) {
        const q = front[prev].p;
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        if (dx * dx + dz * dz <= gap2) this.add(q.x, q.z, p.x, p.z, u.id);
      }
      prev = i;
    }
    if (first < 0) return;
    // flancs : l'agent de bout tient le passage le long de la façade
    const a = front[first].p;
    if (world.raycast(a.x, a.z, a.x - rx * T.CORDON_WALL, a.z - rz * T.CORDON_WALL, hit) && hit.hit) {
      const t = hit.t * T.CORDON_WALL + 0.3;
      this.add(a.x - rx * t, a.z - rz * t, a.x, a.z, u.id);
    }
    const b = front[prev].p;
    if (world.raycast(b.x, b.z, b.x + rx * T.CORDON_WALL, b.z + rz * T.CORDON_WALL, hit) && hit.hit) {
      const t = hit.t * T.CORDON_WALL + 0.3;
      this.add(b.x, b.z, b.x + rx * t, b.z + rz * t, u.id);
    }
  }

  /**
   * Part de la largeur `w` tenue en travers de la rue centrée en (cx, cz), de cap h : réunion des tronçons de toutes
   * les unités à moins de `depth` m de la ligne (une seconde ligne de renfort comble les flancs de la première).
   */
  coverage(cx: number, cz: number, h: number, w: number, depth: number): number {
    if (w <= 0.5) return 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = -fz;
    const rz = fx;
    const s = this.seg;
    const iv = this.iv;
    iv.length = 0;
    const half = w / 2;
    for (let i = 0; i < this.count; i++) {
      const ax = s[i * 4] - cx;
      const az = s[i * 4 + 1] - cz;
      const bx = s[i * 4 + 2] - cx;
      const bz = s[i * 4 + 3] - cz;
      if (Math.abs(ax * fx + az * fz) > depth || Math.abs(bx * fx + bz * fz) > depth) continue;
      let l0 = ax * rx + az * rz;
      let l1 = bx * rx + bz * rz;
      if (l0 > l1) {
        const t = l0;
        l0 = l1;
        l1 = t;
      }
      if (l0 < -half) l0 = -half;
      if (l1 > half) l1 = half;
      if (l1 > l0) iv.push(l0, l1);
    }
    // réunion des intervalles (tri par début)
    const n = iv.length >> 1;
    const order = this.ivOrder;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => iv[a * 2] - iv[b * 2]);
    let sum = 0;
    let end = -Infinity;
    for (let j = 0; j < n; j++) {
      const a = iv[order[j] * 2];
      const b = iv[order[j] * 2 + 1];
      if (b <= end) continue;
      sum += b - (a > end ? a : end);
      end = b;
    }
    return sum / w;
  }

  private readonly iv: number[] = [];
  private readonly ivOrder: number[] = [];

  /** Longueur tenue à moins de `r` du point, projetée sur (rx, rz), et unité qui en tient le plus. */
  heldNear(x: number, z: number, r: number, rx: number, rz: number, out: { len: number; unit: number }): void {
    const s = this.seg;
    out.len = 0;
    out.unit = 0;
    let best = 0;
    for (let i = 0; i < this.count; i++) {
      const mx = (s[i * 4] + s[i * 4 + 2]) * 0.5;
      const mz = (s[i * 4 + 1] + s[i * 4 + 3]) * 0.5;
      if ((mx - x) * (mx - x) + (mz - z) * (mz - z) > r * r) continue;
      const l = Math.abs((s[i * 4 + 2] - s[i * 4]) * rx + (s[i * 4 + 3] - s[i * 4 + 1]) * rz);
      out.len += l;
      if (l > best) {
        best = l;
        out.unit = this.owner[i];
      }
    }
  }

  get segments(): ArrayLike<number> {
    return this.seg;
  }

  crosses(ax: number, az: number, bx: number, bz: number): boolean {
    if (this.count === 0) return false;
    if ((ax < this.minX && bx < this.minX) || (ax > this.maxX && bx > this.maxX)) return false;
    if ((az < this.minZ && bz < this.minZ) || (az > this.maxZ && bz > this.maxZ)) return false;
    const s = this.seg;
    const dx = bx - ax;
    const dz = bz - az;
    for (let i = 0; i < this.count; i++) {
      const cx = s[i * 4];
      const cz = s[i * 4 + 1];
      const ex = s[i * 4 + 2] - cx;
      const ez = s[i * 4 + 3] - cz;
      const den = dx * ez - dz * ex;
      if (den > -1e-9 && den < 1e-9) continue;
      const t = ((cx - ax) * ez - (cz - az) * ex) / den;
      const u = ((cx - ax) * dz - (cz - az) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  }

  resolve(p: Person, pos: Vec2, r: number): boolean {
    if (this.count === 0 || passes(p)) return false;
    const reach = r + T.CORDON_THICK + 0.5;
    let nx = pos.x;
    let nz = pos.z;
    if (nx < this.minX - reach || nx > this.maxX + reach || nz < this.minZ - reach || nz > this.maxZ + reach) return false;
    const ox = p.x;
    const oz = p.z;
    const keep = r + T.CORDON_THICK;
    const s = this.seg;
    let moved = false;
    for (let i = 0; i < this.count; i++) {
      const ax = s[i * 4];
      const az = s[i * 4 + 1];
      const ex = s[i * 4 + 2] - ax;
      const ez = s[i * 4 + 3] - az;
      const x0 = ex < 0 ? ax + ex : ax;
      const x1 = ex < 0 ? ax : ax + ex;
      const z0 = ez < 0 ? az + ez : az;
      const z1 = ez < 0 ? az : az + ez;
      if (nx < x0 - reach || nx > x1 + reach || nz < z0 - reach || nz > z1 + reach) continue;
      const l2 = ex * ex + ez * ez;
      if (l2 < 1e-6) continue;
      const l = Math.sqrt(l2);
      // côté de la ligne où se trouvait la personne, côté où elle veut aller
      const so = (ex * (oz - az) - ez * (ox - ax)) / l;
      const sn = (ex * (nz - az) - ez * (nx - ax)) / l;
      const t = ((nx - ax) * ex + (nz - az) * ez) / l2;
      const to = ((ox - ax) * ex + (oz - az) * ez) / l2;
      // franchissement en un pas (élan) : le passage du segment entre l'ancienne et la nouvelle position
      const crossed = so * sn < 0 && ((t > 0 && t < 1) || (to > 0 && to < 1));
      if (!crossed && (t <= 0 || t >= 1 || Math.abs(sn) >= keep)) continue;
      const side = so > 0.001 ? 1 : so < -0.001 ? -1 : sn >= 0 ? 1 : -1;
      if (!crossed && sn * side >= keep) continue;
      const tc = t < 0.001 ? 0.001 : t > 0.999 ? 0.999 : t;
      const nxn = -ez / l;
      const nzn = ex / l;
      nx = ax + ex * tc + nxn * side * keep;
      nz = az + ez * tc + nzn * side * keep;
      moved = true;
    }
    if (moved) {
      pos.x = nx;
      pos.z = nz;
    }
    return moved;
  }
}

// ───────────────────────────── suivi des barrages, nasses ─────────────────────────────

interface Kettle extends KettleView {
  exits: ExitView[];
  seen: number;
  announced: boolean;
}

const KETTLE_CELL = 40;
const KETTLE_MIN = 8;
const KETTLE_EVERY = 3;
const held = { len: 0, unit: 0 };

export class Barrages implements BarragesApi {
  readonly cordons = new Cordons();
  readonly list: BarrageView[] = [];
  readonly kettles: Kettle[] = [];
  private nextKettle = 1;
  private kettleAt = 0;
  private readonly exitTmp: ExitInfo[] = [];
  private readonly cells = new Map<number, { n: number; sx: number; sz: number; id: number }>();

  /** Issues d'une zone : fourni par l'encerclement (findExits), branché par le système. */
  findExits: ((k: Kernel, x: number, z: number, r: number, out: ExitInfo[]) => number) | null = null;
  private k: Kernel | null = null;

  bind(k: Kernel): void {
    this.k = k;
  }

  reset(): void {
    this.cordons.reset();
    this.list.length = 0;
    this.kettles.length = 0;
    this.nextKettle = 1;
    this.kettleAt = 0;
  }

  private readonly near: Person[] = [];
  private readonly nearV: Vehicle[] = [];

  /**
   * La ligne s'ouvre devant ceux qui ont à la franchir : collègue d'une autre unité, pompier, SAMU, joueur à pied
   * (porte d'un binôme, 1,5 m), véhicule prioritaire qui roule vers elle (porte à sa largeur) — la porte se referme
   * derrière eux (place.ts, openDoor).
   */
  private letThrough(k: Kernel, u: Unit, g: FormGroup): void {
    if (g.kind !== F_LINE || g.moving || g.front.length < 3) return;
    const ctx = k.ctx;
    const fx = Math.sin(g.ah);
    const fz = Math.cos(g.ah);
    const rx = -fz;
    const rz = fx;
    const half = g.width * 0.5;
    const near = this.near;
    const n = ctx.people.queryRadius(g.ax, g.az, half + 3, near);
    for (let i = 0; i < n; i++) {
      const p = near[i];
      if (!passes(p) || p.vehicleId !== 0 || p.posture === 'down') continue;
      const a = agentOf(p);
      if (a && a.root === u) continue;
      const dx = p.x - g.ax;
      const dz = p.z - g.az;
      const fwd = dx * fx + dz * fz;
      const lat = dx * rx + dz * rz;
      if (Math.abs(fwd) > 2.5 || Math.abs(lat) > half + 0.5) continue;
      // il vient vers la ligne (ou s'y trouve déjà, en marche)
      const vf = p.vx * fx + p.vz * fz;
      const sp2 = p.vx * p.vx + p.vz * p.vz;
      if (!(vf * fwd < -0.1 || (Math.abs(fwd) < 1.2 && sp2 > 0.04))) continue;
      this.door(k, g, lat, T.DOOR_WIDTH, 2.5);
    }
    near.length = 0;
    const nv = ctx.vehicles.queryRadius(g.ax, g.az, half + 18, this.nearV);
    for (let i = 0; i < nv; i++) {
      const v = this.nearV[i];
      if (v.def.flying || v.dormant || Math.abs(v.speed) < 0.5) continue;
      if (!(v.faction === 'police' || v.faction === 'rescue' || v.faction === 'medic' || v.siren !== 0 || v.beacons)) continue;
      const dx = v.x - g.ax;
      const dz = v.z - g.az;
      const fwd = dx * fx + dz * fz;
      const lat = dx * rx + dz * rz;
      if (Math.abs(fwd) > 18 || Math.abs(lat) > half + 2) continue;
      if ((v.vx * fx + v.vz * fz) * fwd >= 0 && Math.abs(fwd) > v.def.length * 0.5 + 1) continue;
      this.door(k, g, lat, v.def.width + 1.4, 3);
    }
    this.nearV.length = 0;
  }

  private door(k: Kernel, g: FormGroup, lat: number, w: number, seconds: number): void {
    const half = g.width * 0.5 - 0.6;
    const open = k.now < g.doorUntil;
    g.doorX = lat < -half ? -half : lat > half ? half : lat;
    g.doorW = open && g.doorW > w ? g.doorW : w;
    const until = k.now + seconds;
    if (!open || g.doorUntil < until) g.doorUntil = until;
    g.dirty = true;
  }

  /** Après la marche des formations : cordons, états des barrages, nasses. */
  update(k: Kernel): void {
    const roots0 = k.roots;
    for (let i = 0; i < roots0.length; i++) {
      const u = roots0[i];
      for (let j = 0; j < u.groups.length; j++) this.letThrough(k, u, u.groups[j]);
    }
    this.cordons.rebuild(k);
    const now = k.now;
    this.list.length = 0;
    const roots = k.roots;
    for (let i = 0; i < roots.length; i++) {
      const u = roots[i];
      if (!u.man.barrage || !u.order) continue;
      this.track(k, u, now);
      const m = u.man;
      const g = u.groups.length > 0 ? u.groups[0] : null;
      this.list.push({
        squadId: u.id, x: m.bx, z: m.bz, heading: m.bh, width: m.bWidth, covered: m.bCovered, state: STATE_NAMES[m.bState],
        street: m.bStreet, edgeId: m.bEdge, mode: u.order.type === 'filtrer' || (g !== null && g.doorW > 0 && g.doorUntil === Infinity) ? 'filtrant' : 'ferme',
      });
    }
    if (now >= this.kettleAt) {
      this.kettleAt = now + KETTLE_EVERY;
      this.detectKettles(k);
    }
  }

  private track(k: Kernel, u: Unit, now: number): void {
    const m = u.man;
    if (now < m.bNext) return;
    m.bNext = now + 0.5;
    const placed = u.phase === 'en_place' || m.bState !== B_EN_ROUTE;
    const covered = Math.min(1, this.cordons.coverage(m.bx, m.bz, m.bh, m.bWidth, 6));
    m.bCovered = covered;
    if (!placed) return;
    // barrage filtrant : la porte est tenue (contrôle), elle ne compte pas comme largeur non tenue
    const g = u.groups.length > 0 ? u.groups[0] : null;
    const door = u.order && u.order.type === 'filtrer' ? (T.FILTER_DOOR + 1.2) / Math.max(1, m.bWidth) : 0;
    // agents sortis du rang pour une interpellation ou un secours : un trou voulu, pas une ligne enfoncée
    let detached = false;
    for (let i = 0; g !== null && i < g.front.length && !detached; i++) if (g.front[i].op !== null) detached = true;
    let cand: number;
    if (covered >= T.BARRAGE_FULL - door) cand = B_EN_PLACE;
    else if (m.bBest > 0.2 && covered < m.bBest * 0.5 && !detached) cand = B_ROMPU;
    else cand = m.bState === B_ROMPU && detached ? B_ROMPU : B_INCOMPLET;
    if (cand === m.bState) {
      m.bSince = 0;
    } else if (m.bState === B_EN_ROUTE) {
      // première mise en place : le temps que les flancs rejoignent les façades
      if (m.bSince === 0) m.bSince = now;
      if (cand === B_EN_PLACE || now - m.bSince >= 3) this.enter(k, u, cand);
    } else {
      // une ligne bousculée un instant n'est pas une ligne enfoncée : il faut que le trou dure
      if (m.bSince === 0) m.bSince = now;
      if (now - m.bSince >= (cand === B_ROMPU ? 6 : 2)) this.enter(k, u, cand);
    }
    if (m.bState !== B_EN_ROUTE && m.bState !== B_ROMPU && covered > m.bBest) m.bBest = covered;
  }

  private enter(k: Kernel, u: Unit, state: number): void {
    const m = u.man;
    const was = m.bState;
    m.bState = state;
    m.bSince = 0;
    const traffic = k.ctx.service<TrafficControlApi>(EXT.traffic);
    if (state === B_EN_PLACE || state === B_INCOMPLET) {
      if (m.bCovered > m.bBest) m.bBest = m.bCovered;
      // la rue est fermée dès que le barrage est en place (détours des cortèges, circulation)
      if (traffic && m.closureId === 0 && m.bEdge >= 0) {
        if (traffic.isClosed(m.bEdge)) {
          // déjà fermée (barrières, périmètre) : la fermeture n'est pas la nôtre, on ne la lèvera pas en partant
          m.closureId = -1;
        } else {
          const leader = leaderOf(k, u);
          const c = traffic.closeRoad(m.bx, m.bz, leader ? leader.id : 0, u.id, true);
          if (c) m.closureId = c.id;
        }
      }
      if (state === B_INCOMPLET && !m.bShort) {
        m.bShort = true;
        const open = Math.max(0, m.bWidth * (1 - m.bCovered));
        report(k, u, 'Largeur insuffisante, ' + spell(Math.max(1, Math.round(open))) + ' mètres non tenus ' + this.uncoveredSide(u)
          + (m.bStreet !== '' ? ', ' + m.bStreet : '') + ', demande renfort', 1);
      } else if (state === B_EN_PLACE && was === B_ROMPU) {
        report(k, u, 'Ligne rétablie' + (m.bStreet !== '' ? ', ' + m.bStreet + ' barrée' : '') + ' de façade à façade', 1, false);
      }
    } else if (state === B_ROMPU) {
      if (traffic && m.closureId > 0) traffic.open(m.closureId);
      m.closureId = 0;
      report(k, u, 'URGENT. Ligne enfoncée' + (m.bStreet !== '' ? ', ' + m.bStreet : '') + ', le barrage ne tient plus', 2);
    }
    k.emit(BARRAGE_EVENT, { squadId: u.id, state: STATE_NAMES[state], x: m.bx, z: m.bz });
  }

  /** Côté non tenu : celui où le flanc est le plus loin de la façade (« de part et d'autre » si les deux). */
  private uncoveredSide(u: Unit): string {
    const m = u.man;
    const g = u.groups.length > 0 ? u.groups[0] : null;
    if (!g || g.front.length === 0) return 'de part et d’autre';
    const rx = -Math.cos(m.bh);
    const rz = Math.sin(m.bh);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < g.front.length; i++) {
      const p = g.front[i].p;
      const lat = (p.x - m.bx) * rx + (p.z - m.bz) * rz;
      if (lat < lo) lo = lat;
      if (lat > hi) hi = lat;
    }
    const left = lo + m.bWidth / 2;
    const right = m.bWidth / 2 - hi;
    if (left > 1 && right > 1) return 'de part et d’autre';
    return 'côté ' + cardinalFr(Math.atan2(left > right ? -rx : rx, left > right ? -rz : rz));
  }

  // ── issues d'une zone ──

  exitsAround(x: number, z: number, r: number): readonly ExitView[] {
    const out: ExitView[] = [];
    this.fillExits(x, z, r, out);
    return out;
  }

  private fillExits(x: number, z: number, r: number, out: ExitView[]): void {
    const k = this.k;
    out.length = 0;
    if (!k || !this.findExits) return;
    const tmp = this.exitTmp;
    this.findExits(k, x, z, r, tmp);
    const traffic = k.ctx.service<TrafficControlApi>(EXT.traffic);
    for (let i = 0; i < tmp.length; i++) {
      const e = tmp[i];
      const v: ExitView = { x: 0, z: 0, heading: 0, width: 0, street: '', edgeId: -1, held: false, squadId: 0, mode: 'ouvert' };
      v.x = e.x;
      v.z = e.z;
      v.heading = e.bearing;
      v.width = e.width;
      v.street = e.name;
      v.edgeId = e.edgeId ?? -1;
      v.held = false;
      v.squadId = 0;
      v.mode = 'ouvert';
      // tenue par un cordon en travers de l'issue
      const rx = -Math.cos(e.bearing);
      const rz = Math.sin(e.bearing);
      this.cordons.heldNear(e.x, e.z, e.width * 0.5 + 10, rx, rz, held);
      if (held.unit !== 0 && held.len >= Math.min(e.width, e.width * 0.9)) {
        v.held = true;
        v.squadId = held.unit;
        v.mode = this.filtering(k, held.unit) ? 'filtrant' : 'ferme';
      } else if (held.unit !== 0 && this.filtering(k, held.unit)) {
        // barrage filtrant : la porte est l'issue contrôlée
        v.held = true;
        v.squadId = held.unit;
        v.mode = 'filtrant';
      }
      // rue fermée et tenue par une unité, plus loin dans la rue (de simples barrières de circulation ne retiennent
      // pas des piétons : une place entourée de rues fermées aux voitures n'est pas une nasse)
      if (!v.held && traffic && v.edgeId >= 0) {
        const closed = traffic.isClosed(v.edgeId);
        let best = 0;
        let bestD = 100 * 100;
        for (const c of traffic.closures) {
          if (c.squadId === 0) continue;
          // même voie, ou même tronçon fermé (une fermeture couvre la rue d'un carrefour à l'autre) : la plus proche
          const d = c.edgeId === v.edgeId ? -1 : (c.x - v.x) * (c.x - v.x) + (c.z - v.z) * (c.z - v.z);
          if ((d >= 0 && !closed) || d >= bestD) continue;
          bestD = d;
          best = c.squadId;
        }
        if (best !== 0) {
          v.held = true;
          v.squadId = best;
          v.mode = this.filtering(k, best) ? 'filtrant' : 'ferme';
        }
      }
      // encerclement : l'issue est tenue par une ligne de la nasse
      if (!v.held) {
        const u = this.encircledExit(k, e.x, e.z, e.width);
        if (u) {
          v.held = true;
          v.squadId = u.id;
          v.mode = 'ferme';
        }
      }
      out.push(v);
    }
  }

  private filtering(k: Kernel, unit: number): boolean {
    for (let i = 0; i < k.roots.length; i++) {
      const u = k.roots[i];
      if (u.id === unit) return !!u.order && u.order.type === 'filtrer';
      for (let j = 0; j < u.joined.length; j++) if (u.joined[j].id === unit) return !!u.order && u.order.type === 'filtrer';
    }
    return false;
  }

  /** Unité qui encercle et dont un bloc est posté sur cette issue. */
  private encircledExit(k: Kernel, x: number, z: number, w: number): Unit | null {
    for (let i = 0; i < k.roots.length; i++) {
      const u = k.roots[i];
      if (!u.order || u.order.type !== 'encercler') continue;
      for (let j = 0; j < u.groups.length; j++) {
        const g = u.groups[j];
        if (g.kind !== F_LINE || g.agents.length === 0) continue;
        const d = Math.hypot(g.ax - x, g.az - z);
        if (d < w * 0.5 + 8) return u;
      }
    }
    return null;
  }

  // ── nasses ──

  private detectKettles(k: Kernel): void {
    const ctx = k.ctx;
    const cells = this.cells;
    cells.clear();
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.faction !== 'protest' || p.dormant || p.custody !== 'free' || p.vehicleId !== 0) continue;
      const cx = Math.floor(p.x / KETTLE_CELL);
      const cz = Math.floor(p.z / KETTLE_CELL);
      const key = cx * 100003 + cz;
      let c = cells.get(key);
      if (!c) {
        c = { n: 0, sx: 0, sz: 0, id: 0 };
        cells.set(key, c);
      }
      c.n++;
      c.sx += p.x;
      c.sz += p.z;
    }
    for (let i = 0; i < this.kettles.length; i++) this.kettles[i].seen = 0;
    // regroupement des cellules voisines
    let cluster = 0;
    const stack: number[] = [];
    for (const [key, c] of cells) {
      if (c.id !== 0 || c.n === 0) continue;
      cluster++;
      c.id = cluster;
      stack.length = 0;
      stack.push(key);
      let n = 0;
      let sx = 0;
      let sz = 0;
      while (stack.length > 0) {
        const kk = stack.pop()!;
        const cc = cells.get(kk)!;
        n += cc.n;
        sx += cc.sx;
        sz += cc.sz;
        const cx = Math.round(kk / 100003);
        const cz = kk - cx * 100003;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nk = (cx + dx) * 100003 + cz + dz;
            const nc = cells.get(nk);
            if (nc && nc.id === 0) {
              nc.id = cluster;
              stack.push(nk);
            }
          }
        }
      }
      if (n < KETTLE_MIN) continue;
      const mx = sx / n;
      const mz = sz / n;
      // rayon de la foule : 90 % des personnes du groupe
      let r = 0;
      const ds: number[] = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.faction !== 'protest' || p.dormant || p.custody !== 'free' || p.vehicleId !== 0) continue;
        const kk = Math.floor(p.x / KETTLE_CELL) * 100003 + Math.floor(p.z / KETTLE_CELL);
        if (cells.get(kk)?.id !== cluster) continue;
        ds.push(Math.hypot(p.x - mx, p.z - mz));
      }
      ds.sort((a, b) => a - b);
      r = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.9))] ?? 0;
      const radius = Math.max(20, Math.min(140, r + 8));
      this.consider(k, mx, mz, radius, n);
    }
    // nasses disparues (foule dispersée, sortie) : rouvertes
    for (let i = this.kettles.length - 1; i >= 0; i--) {
      const kt = this.kettles[i];
      if (kt.seen !== 0) continue;
      if (kt.closed) this.announce(k, kt, false);
      this.kettles.splice(i, 1);
    }
  }

  private consider(k: Kernel, x: number, z: number, radius: number, n: number): void {
    let kt: Kettle | null = null;
    for (let i = 0; i < this.kettles.length; i++) {
      const o = this.kettles[i];
      if (o.seen === 0 && Math.hypot(o.x - x, o.z - z) < Math.max(60, o.radius)) {
        kt = o;
        break;
      }
    }
    // la zone d'une nasse fermée ne bouge pas avec les remous de la foule
    const cx = kt && kt.closed ? kt.x : x;
    const cz = kt && kt.closed ? kt.z : z;
    const cr = kt && kt.closed ? kt.radius : radius;
    const exits: ExitView[] = [];
    this.fillExits(cx, cz, cr, exits);
    let any = false;
    let closed = exits.length > 0;
    for (let j = 0; j < exits.length; j++) {
      if (exits[j].held) any = true;
      else closed = false;
    }
    // foule libre de toutes parts : pas de nasse à suivre
    if (!kt && !any) return;
    if (!kt) {
      kt = { id: this.nextKettle++, x: cx, z: cz, radius: cr, exits, closed: false, inside: n, place: '', seen: 1, announced: false };
      this.kettles.push(kt);
    }
    kt.seen = 1;
    kt.x = cx;
    kt.z = cz;
    kt.radius = cr;
    kt.exits = exits;
    kt.inside = n;
    if (kt.place === '') {
      const s = k.ctx.world.sectorName(kt.x, kt.z);
      kt.place = s && s !== 'secteur inconnu' ? s : '';
    }
    if (closed !== kt.closed) this.announce(k, kt, closed);
  }

  private announce(k: Kernel, kt: Kettle, closed: boolean): void {
    kt.closed = closed;
    const ctx = k.ctx;
    const where = kt.place !== '' ? ' ' + kt.place : '';
    if (closed || kt.announced) {
      let filtered = 0;
      for (let j = 0; j < kt.exits.length; j++) if (kt.exits[j].mode === 'filtrant') filtered++;
      ctx.radio.say({
        channel: 'commandement', from: 'CENTRAL', priority: 1,
        text: closed
          ? 'Nasse fermée' + where + ', environ ' + spell(roundCount(kt.inside)) + ' personnes'
            + (filtered > 0 ? ', sortie filtrée' : ', toutes les issues sont tenues') + '.'
          : 'Nasse rouverte' + where + ', une issue est libre.',
      });
      kt.announced = true;
    }
    k.emit(KETTLE_EVENT, { id: kt.id, closed, inside: kt.inside, x: kt.x, z: kt.z, radius: kt.radius });
  }
}

function roundCount(n: number): number {
  if (n < 20) return n;
  if (n < 200) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}
