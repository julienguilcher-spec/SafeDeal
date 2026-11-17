/* =====================================================================================
 * FOULE — DÉTOURS : un cortège dont la tête bute sur un barrage des forces de l'ordre (ligne d'agents, véhicules,
 * rue fermée par le module de circulation, barrage filtrant, nasse) s'arrête ; après une hésitation réaliste (les
 * organisateurs parlementent, 20 à 60 s), il cherche un autre chemin par les rues vers sa destination déclarée, en
 * évitant toutes les voies barrées. Si plus aucun chemin n'y mène, il va où il peut : la grande place atteignable la
 * plus proche de sa destination. Le commandant peut ainsi, en fermant des rues, faire converger plusieurs cortèges
 * sur une même place. Une place dont toutes les issues sont fermées est « close » : le cortège s'y arrête
 * (rassemblement statique, la tension monte).
 *
 *   RoadBlocks     voies barrées à cet instant : fermetures du module de circulation, voies tenues par au moins
 *                  trois agents à pied à l'arrêt, ou par un véhicule de police à l'arrêt ;
 *   searchRoads()  plus court chemin (Dijkstra, tas binaire) sur le graphe des rues sans les voies barrées ;
 *   planDetour()   nouveau tracé de la tête vers la destination (ou la place de repli) ;
 *   enclosedAt()   la place est-elle close (on ne peut pas s'en éloigner de plus de 220 m) ?
 *   closureAhead() fermeture de rue sur l'axe du parcours devant la tête (abscisse) ;
 *   Rerouter       l'état d'un cortège : arrêt, hésitation, détours pris, voies retenues comme barrées (pas
 *                  d'aller-retour : une voie trouvée barrée le reste pour ce cortège pendant dix minutes).
 * Utilisé par le directeur (cortège principal) et par manifs.ts (manifestations supplémentaires).
 * ===================================================================================== */

import type { GameContext, Person, RoadSample, Rng } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { CordonsApi, TrafficControlApi } from '@/core/extensions';
import type { RoutePoint } from './api';
import type { Corridor } from './route';

const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
const rp: RoutePoint = { x: 0, z: 0, tx: 0, tz: 1, center: 0, half: 8, stretch: 1 };

/** Agents à l'arrêt sur une même voie pour qu'elle compte comme barrée. */
const LINE_AGENTS = 3;
/** Rayon de recherche du graphe (m de chemin). */
const SEARCH_LIMIT = 4200;
/** Mémoire d'une voie trouvée barrée (s). */
const MEMORY = 600;
/** Rayon en deçà duquel une place est « close » (m de chemin). */
const ENCLOSED_REACH = 220;

function isStillPolice(p: Person): boolean {
  return p.faction === 'police' && !p.dormant && p.vehicleId === 0 && p.posture !== 'down' && p.vx * p.vx + p.vz * p.vz < 0.5;
}

// ───────────────────────────── voies barrées ─────────────────────────────

export class RoadBlocks {
  readonly edges = new Set<number>();
  private at = -1e9;
  private readonly count = new Map<number, number>();

  /** Recalcule (au plus toutes les 2 s) et retourne l'ensemble des voies barrées. */
  refresh(ctx: GameContext, now: number): Set<number> {
    if (now - this.at < 2 && this.at > -1e8) return this.edges;
    this.at = now;
    const edges = this.edges;
    edges.clear();
    const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
    if (traffic) for (const c of traffic.closures) if (c.edgeId >= 0) edges.add(c.edgeId);
    const count = this.count;
    count.clear();
    const world = ctx.world;
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (!isStillPolice(p)) continue;
      if (!world.nearestRoad(p.x, p.z, sample, 9) || sample.edgeId < 0) continue;
      count.set(sample.edgeId, (count.get(sample.edgeId) ?? 0) + 1);
    }
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police' || v.def.flying || Math.abs(v.speed) > 0.5) continue;
      if (!world.nearestRoad(v.x, v.z, sample, 5) || sample.edgeId < 0) continue;
      count.set(sample.edgeId, (count.get(sample.edgeId) ?? 0) + LINE_AGENTS);
    }
    for (const [e, n] of count) if (n >= LINE_AGENTS) edges.add(e);
    return edges;
  }

  invalidate(): void {
    this.at = -1e9;
  }
}

/** Fermeture de rue (module de circulation) sur l'axe du parcours, entre s0 et s0 + scan : abscisse, sinon Infinity. */
export function closureAhead(ctx: GameContext, corridor: Corridor, s0: number, scan: number): number {
  const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
  if (!traffic || traffic.closures.length === 0 || corridor.n === 0) return Infinity;
  let best = Infinity;
  for (const c of traffic.closures) {
    // cherche l'abscisse du parcours la plus proche de la fermeture, devant la tête
    const s = corridor.project(c.x, c.z, s0 + scan * 0.5, scan * 0.5 + 20);
    if (s < s0 - 2 || s > s0 + scan) continue;
    corridor.at(s, rp);
    const d = Math.hypot(rp.x - c.x, rp.z - c.z);
    if (d > rp.half + 5) continue;
    // une rue latérale fermée au débouché ne barre pas le parcours : la fermeture doit être dans l'axe
    const along = Math.abs(Math.sin(c.heading) * rp.tx + Math.cos(c.heading) * rp.tz);
    if (along < 0.6 && d > 4) continue;
    if (s < best) best = s;
  }
  return best;
}

// ───────────────────────────── graphe ─────────────────────────────

class Heap {
  ids: Int32Array = new Int32Array(256);
  keys: Float64Array = new Float64Array(256);
  size = 0;

  push(id: number, key: number): void {
    if (this.size >= this.ids.length) {
      const ids = new Int32Array(this.ids.length * 2);
      ids.set(this.ids);
      const keys = new Float64Array(this.keys.length * 2);
      keys.set(this.keys);
      this.ids = ids;
      this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.ids[i] = this.ids[p]!;
      this.keys[i] = this.keys[p]!;
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.ids[0]!;
    const n = --this.size;
    if (n > 0) {
      const id = this.ids[n]!;
      const key = this.keys[n]!;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && this.keys[r]! < this.keys[l]! ? r : l;
        if (this.keys[c]! >= key) break;
        this.ids[i] = this.ids[c]!;
        this.keys[i] = this.keys[c]!;
        i = c;
      }
      this.ids[i] = id;
      this.keys[i] = key;
    }
    return top;
  }

  topKey(): number {
    return this.keys[0]!;
  }
}

/** Résultat d'une exploration : distance et arête d'arrivée de chaque nœud atteint. */
export class RoadSearch {
  dist: Float64Array = new Float64Array(0);
  via: Int32Array = new Int32Array(0);
  /** Nœuds atteints (pour remettre à zéro). */
  readonly touched: number[] = [];
  private readonly heap = new Heap();

  private ensure(n: number): void {
    if (this.dist.length >= n) return;
    this.dist = new Float64Array(n).fill(Infinity);
    this.via = new Int32Array(n).fill(-1);
    this.touched.length = 0;
  }

  private clear(): void {
    for (const i of this.touched) {
      this.dist[i] = Infinity;
      this.via[i] = -1;
    }
    this.touched.length = 0;
  }

  /** Dijkstra depuis des nœuds de départ (coûts initiaux), sans passer par les voies barrées. */
  run(ctx: GameContext, seeds: readonly { node: number; cost: number }[], blocked: ReadonlySet<number>, limit: number, stopAt = -1): void {
    const world = ctx.world;
    this.ensure(world.nodeCount);
    this.clear();
    const heap = this.heap;
    heap.size = 0;
    for (const s of seeds) {
      if (s.node < 0 || s.node >= world.nodeCount) continue;
      if (s.cost < this.dist[s.node]!) {
        if (this.dist[s.node] === Infinity) this.touched.push(s.node);
        this.dist[s.node] = s.cost;
        heap.push(s.node, s.cost);
      }
    }
    while (heap.size > 0) {
      const d = heap.topKey();
      const n = heap.pop();
      if (d > this.dist[n]!) continue;
      if (n === stopAt || d > limit) break;
      const node = world.node(n);
      for (let k = 0; k < node.edges.length; k++) {
        const eid = node.edges[k]!;
        if (blocked.has(eid)) continue;
        const e = world.edge(eid);
        // un cortège suit les rues : ni sentiers, ni passages piétons (une fermeture de rue ne les barre pas)
        if (e.pedestrianOnly) continue;
        const m = e.a === n ? e.b : e.a;
        const nd = d + Math.max(1, e.length);
        if (nd < this.dist[m]!) {
          if (this.dist[m] === Infinity) this.touched.push(m);
          this.dist[m] = nd;
          this.via[m] = eid;
          heap.push(m, nd);
        }
      }
    }
  }

  /** Polyligne du départ jusqu'au nœud (en partant de (x0, z0)). */
  pathTo(ctx: GameContext, node: number, x0: number, z0: number, out: number[]): void {
    const world = ctx.world;
    const edges: number[] = [];
    let n = node;
    for (let guard = 0; guard < 4000 && this.via[n]! >= 0; guard++) {
      const eid = this.via[n]!;
      edges.push(eid);
      const e = world.edge(eid);
      n = e.a === n ? e.b : e.a;
    }
    out.length = 0;
    out.push(x0, z0);
    const first = world.node(n);
    push(out, first.x, first.z);
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = world.edge(edges[i]!);
      const pts = e.points;
      const forward = e.a === n;
      const count = pts.length >> 1;
      for (let k = 0; k < count; k++) {
        const j = forward ? k : count - 1 - k;
        push(out, pts[j * 2]!, pts[j * 2 + 1]!);
      }
      n = forward ? e.b : e.a;
    }
  }
}

function push(out: number[], x: number, z: number): void {
  const n = out.length;
  if (n >= 2 && Math.hypot(x - out[n - 2]!, z - out[n - 1]!) < 0.5) return;
  out.push(x, z);
}

const search = new RoadSearch();

/** Nœuds proches d'un point (extrémités de la voie la plus proche). */
function nodesNear(ctx: GameContext, x: number, z: number, out: number[]): void {
  out.length = 0;
  const world = ctx.world;
  if (!world.nearestRoad(x, z, sample, 120) || sample.edgeId < 0) return;
  let e = world.edge(sample.edgeId);
  if (e.pedestrianOnly) {
    // au milieu d'une place piétonne : les rues qui la bordent
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const r of [25, 50, 80]) {
        if (!world.nearestRoad(x + Math.sin(a) * r, z + Math.cos(a) * r, sample, 30) || sample.edgeId < 0) continue;
        const f = world.edge(sample.edgeId);
        if (f.pedestrianOnly) continue;
        const d = Math.hypot(sample.x - x, sample.z - z);
        if (d < best) {
          best = d;
          e = f;
        }
        break;
      }
    }
    if (e.pedestrianOnly) return;
  }
  out.push(e.a, e.b);
}

export interface Detour {
  /** Tracé de la tête jusqu'au but [x0, z0, …]. */
  points: number[];
  /** Le but est la destination déclarée (sinon une place de repli). */
  toDestination: boolean;
  /** But atteint : point et nom (destination ou place). */
  x: number;
  z: number;
  name: string;
  /** Première voie nommée empruntée (pour la radio). */
  via: string;
}

/** Places de repli : grandes places de la carte. */
function squares(ctx: GameContext): { x: number; z: number; name: string }[] {
  const out: { x: number; z: number; name: string }[] = [];
  for (const p of ctx.world.places) {
    // une vraie place publique (pas une cour intérieure ni un petit carrefour nommé)
    if (p.kind !== 'square' || p.radius < 40 || /^cour\b/i.test(p.name)) continue;
    out.push({ x: p.x, z: p.z, name: p.name });
  }
  return out;
}

/**
 * Nouveau tracé depuis la tête (hx, hz, cap `heading`) vers la destination, sans les voies `blocked`. La voie de la
 * tête se prend vers l'arrière si elle est barrée. Repli : la place atteignable la plus proche de la destination
 * (pas celle où l'on est). null si l'on ne peut aller nulle part.
 */
export function planDetour(
  ctx: GameContext, hx: number, hz: number, heading: number, destX: number, destZ: number, destName: string, blocked: ReadonlySet<number>,
): Detour | null {
  const world = ctx.world;
  if (world.nodeCount === 0 || !world.nearestRoad(hx, hz, sample, 60) || sample.edgeId < 0) return null;
  const e0 = world.edge(sample.edgeId);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const seeds: { node: number; cost: number }[] = [];
  const headBlocked = blocked.has(e0.id);
  for (const id of [e0.a, e0.b]) {
    const n = world.node(id);
    const ahead = (n.x - hx) * fx + (n.z - hz) * fz;
    if (headBlocked && ahead > 0) continue;
    // revenir sur ses pas coûte : on préfère tourner devant le barrage quand c'est possible
    seeds.push({ node: id, cost: Math.hypot(n.x - hx, n.z - hz) * (ahead < 0 ? 2.5 : 1) });
  }
  if (seeds.length === 0) return null;
  const dn: number[] = [];
  nodesNear(ctx, destX, destZ, dn);
  search.run(ctx, seeds, blocked, SEARCH_LIMIT);
  let goal = -1;
  for (const n of dn) if (search.dist[n]! < Infinity && (goal < 0 || search.dist[n]! < search.dist[goal]!)) goal = n;
  let toDestination = goal >= 0 && Math.hypot(destX - hx, destZ - hz) > 40;
  let gx = destX;
  let gz = destZ;
  let name = destName;
  if (!toDestination) {
    // plus de chemin vers la destination : la place atteignable la plus proche d'elle
    let best = Infinity;
    goal = -1;
    for (const sq of squares(ctx)) {
      nodesNear(ctx, sq.x, sq.z, dn);
      for (const n of dn) {
        const d = search.dist[n]!;
        if (d === Infinity) continue;
        const score = Math.hypot(sq.x - destX, sq.z - destZ) + 0.35 * d;
        if (score < best) {
          best = score;
          goal = n;
          gx = sq.x;
          gz = sq.z;
          name = sq.name;
        }
      }
    }
    toDestination = false;
  }
  if (goal < 0) return null;
  const points: number[] = [];
  search.pathTo(ctx, goal, hx, hz, points);
  if (points.length < 4) return null;
  // jusqu'au but même (le centre de la place), s'il est dans la rue
  if (Math.hypot(gx - points[points.length - 2]!, gz - points[points.length - 1]!) < 60 && world.isFree(gx, gz, 0.3)) push(points, gx, gz);
  // première voie nommée prise, différente de celle de la tête
  let via = '';
  for (let i = 2; i + 1 < points.length && via === ''; i += 2) {
    if (!world.nearestRoad(points[i]!, points[i + 1]!, sample, 6)) continue;
    if (sample.edgeId !== e0.id && sample.name !== '' && sample.name !== e0.name) via = sample.name;
  }
  return { points, toDestination, x: gx, z: gz, name, via };
}

const barred = new Set<number>();
const goals: number[] = [];

/** L'itinéraire (polyligne [x0, z0, x1, z1, …]) franchit-il un cordon de police tenu ? */
export function pathCrossesCordon(cordons: CordonsApi, pts: readonly number[]): boolean {
  if (cordons.count === 0) return false;
  for (let i = 2; i + 1 < pts.length; i += 2) if (cordons.crosses(pts[i - 2]!, pts[i - 1]!, pts[i]!, pts[i + 1]!)) return true;
  return false;
}

/**
 * Itinéraire à pied de A vers B qui contourne les rues barrées par une ligne de police (cordons tenus en travers de
 * la rue) : `out` reçoit la polyligne depuis A. false s'il n'y a pas d'autre chemin (la personne est nassée, ou la
 * seule rue qui mène à B est barrée) : elle n'a alors nulle part où aller par là.
 */
export function footAround(ctx: GameContext, ax: number, az: number, bx: number, bz: number, cordons: CordonsApi, out: number[]): boolean {
  const world = ctx.world;
  if (world.nodeCount === 0 || cordons.count === 0) return false;
  // voies barrées : celles que coupe en travers un tronçon de cordon
  barred.clear();
  const s = cordons.segments;
  for (let i = 0; i < cordons.count; i++) {
    const sx = s[i * 4]!;
    const sz = s[i * 4 + 1]!;
    const ex = s[i * 4 + 2]! - sx;
    const ez = s[i * 4 + 3]! - sz;
    const l = Math.hypot(ex, ez);
    if (l < 0.05 || !world.nearestRoad(sx + ex * 0.5, sz + ez * 0.5, sample, 12) || sample.edgeId < 0) continue;
    // en travers de la voie, pas le long d'elle (une ligne au débouché d'une rue latérale ne barre pas l'avenue)
    if (Math.abs((ex * Math.sin(sample.heading) + ez * Math.cos(sample.heading)) / l) > 0.6) continue;
    barred.add(sample.edgeId);
  }
  if (barred.size === 0 || !world.nearestRoad(ax, az, sample, 60) || sample.edgeId < 0) return false;
  const e0 = world.edge(sample.edgeId);
  const seeds: { node: number; cost: number }[] = [];
  for (const id of [e0.a, e0.b]) {
    const n = world.node(id);
    // on ne repart que vers le carrefour de son côté du barrage
    if (cordons.crosses(ax, az, n.x, n.z)) continue;
    seeds.push({ node: id, cost: Math.hypot(n.x - ax, n.z - az) });
  }
  if (seeds.length === 0) return false;
  nodesNear(ctx, bx, bz, goals);
  if (goals.length === 0) return false;
  search.run(ctx, seeds, barred, SEARCH_LIMIT);
  let goal = -1;
  let best = Infinity;
  for (const n of goals) {
    const d = search.dist[n]!;
    if (d === Infinity) continue;
    const nd = world.node(n);
    // le dernier bout jusqu'à B ne doit pas, lui non plus, franchir le barrage
    if (cordons.crosses(nd.x, nd.z, bx, bz)) continue;
    const score = d + Math.hypot(nd.x - bx, nd.z - bz);
    if (score < best) {
      best = score;
      goal = n;
    }
  }
  if (goal < 0) return false;
  search.pathTo(ctx, goal, ax, az, out);
  push(out, bx, bz);
  return out.length >= 4 && !pathCrossesCordon(cordons, out);
}

/** La place est-elle close : impossible de s'en éloigner de plus de ENCLOSED_REACH m de chemin ? */
export function enclosedAt(ctx: GameContext, x: number, z: number, blocked: ReadonlySet<number>): boolean {
  const world = ctx.world;
  if (blocked.size === 0 || world.nodeCount === 0) return false;
  const dn: number[] = [];
  nodesNear(ctx, x, z, dn);
  if (dn.length === 0) return false;
  const seeds = dn.map((node) => ({ node, cost: 0 }));
  search.run(ctx, seeds, blocked, ENCLOSED_REACH * 2);
  for (const n of search.touched) {
    if (search.dist[n]! === Infinity) continue;
    const nd = world.node(n);
    if (Math.hypot(nd.x - x, nd.z - z) > ENCLOSED_REACH) return false;
  }
  return true;
}

/**
 * Raccorde un détour au parcours courant. Quand le détour commence par revenir sur ses pas jusqu'au carrefour
 * précédent, la tête repart de ce carrefour (le corps du cortège n'a pas à se croiser lui-même) : retourne le nouveau
 * tracé et la nouvelle abscisse de la tête.
 */
export function spliceDetour(prev: readonly number[], headS: number, d: Detour, corridor: Corridor): { points: number[]; headS: number } {
  const out: number[] = [];
  const p = d.points;
  if (p.length >= 6) {
    const nx = p[2]!;
    const nz = p[3]!;
    const back = Math.hypot(nx - p[0]!, nz - p[1]!);
    const sN = corridor.project(nx, nz, headS - back, back + 30);
    corridor.at(sN, rp);
    if (sN < headS - 1 && Math.hypot(rp.x - nx, rp.z - nz) < 8) {
      truncate(prev, sN, out);
      for (let i = 4; i + 1 < p.length; i += 2) push(out, p[i]!, p[i + 1]!);
      return { points: out, headS: Math.max(0, sN) };
    }
  }
  truncate(prev, headS, out);
  for (let i = 2; i + 1 < p.length; i += 2) push(out, p[i]!, p[i + 1]!);
  return { points: out, headS };
}

/** Tronque une polyligne à l'abscisse s (inclus le point en s). */
export function truncate(points: readonly number[], s: number, out: number[]): void {
  out.length = 0;
  if (points.length < 2) return;
  out.push(points[0]!, points[1]!);
  let acc = 0;
  for (let i = 2; i + 1 < points.length; i += 2) {
    const ax = points[i - 2]!;
    const az = points[i - 1]!;
    const bx = points[i]!;
    const bz = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s) {
      const t = len > 1e-6 ? Math.max(0, Math.min(1, (s - acc) / len)) : 0;
      push(out, ax + (bx - ax) * t, az + (bz - az) * t);
      return;
    }
    push(out, bx, bz);
    acc += len;
  }
}

// ───────────────────────────── état d'un cortège ─────────────────────────────

export type RerouteResult = 'none' | 'waiting' | 'detour' | 'stuck';

export class Rerouter {
  /** Détours pris. */
  count = 0;
  /** Arrêté sur une place close. */
  enclosed = false;
  /** Le but courant est la destination déclarée. */
  toDestination = true;
  blockedSince = -1;
  hesitate = 30;
  lastAt = -1e9;
  stuckAt = -1e9;
  lastDetour: Detour | null = null;
  /** Voies trouvées barrées : identifiant → instant jusqu'auquel elles sont évitées. */
  private readonly memory = new Map<number, number>();
  private readonly avoid = new Set<number>();
  readonly blocks = new RoadBlocks();

  reset(): void {
    this.count = 0;
    this.enclosed = false;
    this.toDestination = true;
    this.blockedSince = -1;
    this.lastAt = -1e9;
    this.stuckAt = -1e9;
    this.lastDetour = null;
    this.memory.clear();
    this.blocks.invalidate();
  }

  /**
   * À appeler régulièrement (≈ 1 s) : `blocked` vrai si la tête est arrêtée par un barrage. Retourne 'detour' quand un
   * nouveau tracé est prêt (dans lastDetour), 'stuck' quand aucun chemin n'existe (le cortège reste où il est), 'waiting'
   * pendant l'hésitation.
   */
  update(
    ctx: GameContext, now: number, blocked: boolean, hx: number, hz: number, heading: number, destX: number, destZ: number, destName: string,
    rng: Rng, timeScale: number,
  ): RerouteResult {
    if (!blocked) {
      this.blockedSince = -1;
      return 'none';
    }
    if (this.blockedSince < 0) {
      this.blockedSince = now;
      // les organisateurs parlementent avec le barrage, puis décident (plus vite s'ils viennent de se détourner)
      this.hesitate = (20 + 40 * rng.next()) * Math.min(1.3, Math.max(0.6, timeScale)) * (this.count > 0 ? 0.7 : 1);
    }
    if (now - this.blockedSince < this.hesitate) return 'waiting';
    // pas plus d'un détour toutes les 25 s, ni d'un essai sans issue toutes les 40 s ; huit détours au plus
    if (now - this.lastAt < 25 || now - this.stuckAt < 40) return 'waiting';
    if (this.count >= 8) {
      this.stuckAt = now;
      return 'stuck';
    }
    const blocks = this.blocks.refresh(ctx, now);
    for (const e of blocks) this.memory.set(e, now + MEMORY);
    // la voie de la tête est barrée : on la retient aussi (barrage vu en face, même s'il n'est pas sur la voie exacte)
    if (ctx.world.nearestRoad(hx + Math.sin(heading) * 12, hz + Math.cos(heading) * 12, sample, 12) && sample.edgeId >= 0) {
      this.memory.set(sample.edgeId, now + MEMORY);
    }
    const avoid = this.avoid;
    avoid.clear();
    for (const [e, until] of this.memory) {
      if (until < now) this.memory.delete(e);
      else avoid.add(e);
    }
    const d = planDetour(ctx, hx, hz, heading, destX, destZ, destName, avoid);
    if (!d) {
      this.stuckAt = now;
      this.enclosed = enclosedAt(ctx, hx, hz, avoid);
      return 'stuck';
    }
    this.lastAt = now;
    this.blockedSince = -1;
    this.count++;
    this.toDestination = d.toDestination;
    this.lastDetour = d;
    return 'detour';
  }

  /** Voies évitées (barrées, retenues). */
  avoided(ctx: GameContext, now: number): ReadonlySet<number> {
    const blocks = this.blocks.refresh(ctx, now);
    const avoid = this.avoid;
    avoid.clear();
    for (const e of blocks) avoid.add(e);
    for (const [e, until] of this.memory) if (until >= now) avoid.add(e);
    return avoid;
  }
}

/** Texte radio d'un détour. */
export function detourText(who: string, d: Detour): string {
  const by = d.via !== '' ? ' par ' + lowerFirst(d.via) : '';
  const name = d.name === '' ? '' : /^(place|esplanade|parvis|square|rond-point)\b/i.test(d.name) ? d.name.charAt(0).toLowerCase() + d.name.slice(1) : d.name;
  return d.toDestination
    ? `CENTRAL : ${who} se détourne${by}, toujours en direction de ${name || 'sa destination'}.`
    : `CENTRAL : ${who} ne peut plus rejoindre sa destination ; il se détourne${by} vers ${name || 'une place voisine'}.`;
}

function lowerFirst(s: string): string {
  const first = (s.split(/[\s'’-]/)[0] ?? '').toLowerCase();
  const masc = ['boulevard', 'quai', 'pont', 'cours', 'passage', 'square'];
  const fem = ['rue', 'place'];
  const elided = ['avenue', 'allée', 'impasse', 'esplanade'];
  const low = s.charAt(0).toLowerCase() + s.slice(1);
  if (elided.indexOf(first) >= 0) return 'l’' + low;
  if (masc.indexOf(first) >= 0) return 'le ' + low;
  if (fem.indexOf(first) >= 0) return 'la ' + low;
  return s;
}
