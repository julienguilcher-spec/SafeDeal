/* =====================================================================================
 * CIRCULATION — aides de test (tests/unit/traffic.*.test.ts). Rien ici n'est chargé par le jeu.
 *
 *   createRoadWorld   monde factice complet (WorldQuery) bâti sur un petit graphe routier : nœuds (feu,
 *                     passage piéton), arêtes (largeur, sens unique, trottoir), itinéraires, surfaces
 *                     (chaussée / trottoir / immeuble) et immeubles au cœur des îlots ;
 *   createTown        quadrillage de rues à double sens avec rues de sortie : 6 à 10 carrefours ;
 *   createGasHazards  dangers factices : nuages de gaz posés à la main ;
 *   createTrafficBench moteur de test avec le module de circulation et les modules fournis par le test
 *                     (véhicules, personnes : le test est la racine de composition).
 * ===================================================================================== */

import type {
  GameContext, HazardApi, ModuleFactory, RayHit, RoadClass, RoadEdgeInfo, RoadNodeInfo, RoadSample, SessionConfig,
  SurfaceKind, Vec2, WorldQuery,
} from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { circleVsObb, segmentVsObb } from '@/core/math';
import type { SegmentCast } from '@/core/math';
import { clearRayHit, createNullWorld } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { TRAFFIC_SERVICE } from './api';
import type { TrafficApi } from './api';
import { TrafficSystem } from './system';

export interface FakeNode { x: number; z: number; signal?: boolean; crossing?: boolean }
export interface FakeEdge {
  a: number; b: number;
  width?: number; oneway?: boolean; sidewalk?: number; speedLimit?: number; roadClass?: RoadClass; name?: string;
  pedestrianOnly?: boolean;
}
export interface FakeBox { minX: number; minZ: number; maxX: number; maxZ: number; height: number }

export interface RoadWorld extends WorldQuery {
  readonly nodes: RoadNodeInfo[];
  readonly edges: RoadEdgeInfo[];
  readonly boxes: FakeBox[];
  /** Nombre d'appels à findPath. */
  pathCalls: number;
}

/** Monde factice : graphe routier, surfaces déduites des chaussées, immeubles facultatifs. */
export function createRoadWorld(nodes: readonly FakeNode[], edges: readonly FakeEdge[], boxes: FakeBox[] = []): RoadWorld {
  const base = createNullWorld();
  const tmp: Vec2 = { x: 0, z: 0 };
  const cast: SegmentCast = { t: 0, nx: 0, nz: 0 };
  const nodeInfos: RoadNodeInfo[] = nodes.map((n, id) => ({
    id, x: n.x, z: n.z, signal: n.signal === true, crossing: n.crossing === true,
    edges: edges.map((e, i) => (e.a === id || e.b === id ? i : -1)).filter((i) => i >= 0),
  }));
  const edgeInfos: RoadEdgeInfo[] = edges.map((e, id) => {
    const a = nodes[e.a]!;
    const b = nodes[e.b]!;
    return {
      id, a: e.a, b: e.b, points: [a.x, a.z, b.x, b.z], length: Math.hypot(b.x - a.x, b.z - a.z), width: e.width ?? 8,
      lanesForward: 1, lanesBackward: e.oneway ? 0 : 1, oneway: e.oneway === true, roadClass: e.roadClass ?? 'residential',
      name: e.name ?? `Rue ${id}`, bridge: false, sett: false, speedLimit: e.speedLimit ?? 30 / 3.6, sidewalk: e.sidewalk ?? 3,
      pedestrianOnly: e.pedestrianOnly === true,
    };
  });
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minZ = Math.min(minZ, n.z);
    maxX = Math.max(maxX, n.x);
    maxZ = Math.max(maxZ, n.z);
  }

  function project(e: RoadEdgeInfo, x: number, z: number): { t: number; d2: number } {
    const p = e.points;
    const dx = p[2]! - p[0]!;
    const dz = p[3]! - p[1]!;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((x - p[0]!) * dx + (z - p[1]!) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = x - (p[0]! + dx * t);
    const ez = z - (p[1]! + dz * t);
    return { t, d2: ex * ex + ez * ez };
  }

  function nearest(x: number, z: number, vehicle: boolean): { edge: number; t: number; d2: number } {
    let best = -1;
    let bestT = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < edgeInfos.length; i++) {
      const e = edgeInfos[i]!;
      if (vehicle && e.pedestrianOnly) continue;
      const r = project(e, x, z);
      if (r.d2 < bestD2) {
        bestD2 = r.d2;
        best = i;
        bestT = r.t;
      }
    }
    return { edge: best, t: bestT, d2: bestD2 };
  }

  /** Dijkstra multi-sources sur un petit graphe : coût en temps (véhicule) ou en longueur (à pied). */
  function dijkstra(sources: { node: number; cost: number }[], vehicle: boolean): { dist: number[]; prev: number[] } {
    const dist = nodes.map(() => Infinity);
    const prev = nodes.map(() => -1);
    const done = nodes.map(() => false);
    for (const s of sources) if (s.cost < dist[s.node]!) dist[s.node] = s.cost;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
      if (u < 0) break;
      done[u] = true;
      for (const e of edgeInfos) {
        if (vehicle && e.pedestrianOnly) continue;
        let w = -1;
        if (e.a === u) w = e.b;
        else if (e.b === u && !(vehicle && e.oneway)) w = e.a;
        if (w < 0) continue;
        const nd = dist[u]! + (vehicle ? e.length / e.speedLimit : e.length);
        if (nd < dist[w]!) {
          dist[w] = nd;
          prev[w] = u;
        }
      }
    }
    return { dist, prev };
  }

  function inBox(x: number, z: number): FakeBox | null {
    for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return b;
    return null;
  }

  const world: RoadWorld = {
    ...base,
    nodes: nodeInfos,
    edges: edgeInfos,
    boxes,
    pathCalls: 0,
    ready: true,
    bounds: { minX: minX - 200, minZ: minZ - 200, maxX: maxX + 200, maxZ: maxZ + 200 },
    heightAt: (): number => 0,
    surfaceAt(x: number, z: number): SurfaceKind {
      for (const e of edgeInfos) {
        const half = e.width * 0.5;
        if (project(e, x, z).d2 < half * half) return e.pedestrianOnly ? 'plaza' : 'road';
      }
      return inBox(x, z) ? 'building' : 'sidewalk';
    },
    buildingHeightAt: (x: number, z: number): number => inBox(x, z)?.height ?? 0,
    resolveCircle(pos: Vec2, radius: number): boolean {
      let hit = false;
      for (const b of boxes) {
        const cx = (b.minX + b.maxX) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        if (circleVsObb(pos.x, pos.z, radius, cx, cz, (b.maxX - b.minX) * 0.5, (b.maxZ - b.minZ) * 0.5, 0, tmp)) {
          pos.x += tmp.x;
          pos.z += tmp.z;
          hit = true;
        }
      }
      return hit;
    },
    isFree(x: number, z: number, radius: number): boolean {
      for (const b of boxes) {
        const cx = (b.minX + b.maxX) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        if (circleVsObb(x, z, radius, cx, cz, (b.maxX - b.minX) * 0.5, (b.maxZ - b.minZ) * 0.5, 0, tmp)) return false;
      }
      return true;
    },
    raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
      let bestT = 2;
      let best: FakeBox | null = null;
      let nx = 0;
      let nz = 0;
      for (const b of boxes) {
        const cx = (b.minX + b.maxX) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        if (segmentVsObb(ax, az, bx, bz, cx, cz, (b.maxX - b.minX) * 0.5, (b.maxZ - b.minZ) * 0.5, 0, cast) && cast.t < bestT) {
          bestT = cast.t;
          best = b;
          nx = cast.nx;
          nz = cast.nz;
        }
      }
      if (!best) {
        clearRayHit(out, bx, bz);
        return false;
      }
      out.hit = true;
      out.t = bestT;
      out.x = ax + (bx - ax) * bestT;
      out.z = az + (bz - az) * bestT;
      out.nx = nx;
      out.nz = nz;
      out.kind = 'building';
      out.id = 0;
      out.height = best.height;
      return true;
    },
    lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
      for (const b of boxes) {
        const cx = (b.minX + b.maxX) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        if (segmentVsObb(ax, az, bx, bz, cx, cz, (b.maxX - b.minX) * 0.5, (b.maxZ - b.minZ) * 0.5, 0, cast)) return false;
      }
      return true;
    },
    nodeCount: nodeInfos.length,
    edgeCount: edgeInfos.length,
    node: (id: number): RoadNodeInfo => nodeInfos[id] ?? base.node(id),
    edge: (id: number): RoadEdgeInfo => edgeInfos[id] ?? base.edge(id),
    nearestRoad(x: number, z: number, out: RoadSample, maxDist = 120): boolean {
      const n = nearest(x, z, false);
      if (n.edge < 0 || n.d2 > maxDist * maxDist) return false;
      const e = edgeInfos[n.edge]!;
      const p = e.points;
      out.edgeId = e.id;
      out.x = p[0]! + (p[2]! - p[0]!) * n.t;
      out.z = p[1]! + (p[3]! - p[1]!) * n.t;
      out.heading = Math.atan2(p[2]! - p[0]!, p[3]! - p[1]!);
      out.dist = Math.sqrt(n.d2);
      out.width = e.width;
      out.name = e.name;
      out.roadClass = e.roadClass;
      out.oneway = e.oneway;
      return true;
    },
    findPath(ax: number, az: number, bx: number, bz: number, mode: 'foot' | 'vehicle', out: number[]): boolean {
      world.pathCalls++;
      out.length = 0;
      const vehicle = mode === 'vehicle';
      const s = nearest(ax, az, vehicle);
      const e = nearest(bx, bz, vehicle);
      if (s.edge < 0 || e.edge < 0) return false;
      const se = edgeInfos[s.edge]!;
      const ee = edgeInfos[e.edge]!;
      const sp = se.points;
      const epts = ee.points;
      const sx = sp[0]! + (sp[2]! - sp[0]!) * s.t;
      const sz = sp[1]! + (sp[3]! - sp[1]!) * s.t;
      const ex = epts[0]! + (epts[2]! - epts[0]!) * e.t;
      const ez = epts[1]! + (epts[3]! - epts[1]!) * e.t;
      const rate = (edge: RoadEdgeInfo): number => (vehicle ? 1 / edge.speedLimit : 1);
      // trajet direct sur la même arête
      let direct = Infinity;
      if (s.edge === e.edge && (!(vehicle && se.oneway) || e.t >= s.t)) direct = Math.abs(e.t - s.t) * se.length * rate(se);
      const sources: { node: number; cost: number }[] = [{ node: se.b, cost: (1 - s.t) * se.length * rate(se) }];
      if (!(vehicle && se.oneway)) sources.push({ node: se.a, cost: s.t * se.length * rate(se) });
      const { dist, prev } = dijkstra(sources, vehicle);
      const viaA = dist[ee.a]! + e.t * ee.length * rate(ee);
      const viaB = vehicle && ee.oneway ? Infinity : dist[ee.b]! + (1 - e.t) * ee.length * rate(ee);
      const best = Math.min(viaA, viaB);
      if (best === Infinity && direct === Infinity) return false;
      const push = (x: number, z: number): void => {
        const n = out.length;
        if (n >= 2 && Math.hypot(out[n - 2]! - x, out[n - 1]! - z) < 0.05) return;
        out.push(x, z);
      };
      push(ax, az);
      push(sx, sz);
      if (best < direct) {
        const chain: number[] = [];
        for (let n = viaA <= viaB ? ee.a : ee.b; n >= 0; n = prev[n]!) chain.unshift(n);
        for (const n of chain) push(nodes[n]!.x, nodes[n]!.z);
      }
      push(ex, ez);
      push(bx, bz);
      if (out.length < 4) out.push(bx, bz);
      return true;
    },
    randomFreePoint(x: number, z: number, radius: number, _surface: 'sidewalk' | 'road' | 'any', rand: () => number, out: Vec2): boolean {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      out.x = x + Math.cos(a) * r;
      out.z = z + Math.sin(a) * r;
      return true;
    },
    sectorName(x: number, z: number): string {
      const n = nearest(x, z, false);
      return n.edge >= 0 ? edgeInfos[n.edge]!.name : '';
    },
    setFocus: (): void => {},
    isLoaded: (): boolean => true,
    whenLoaded: (): Promise<void> => Promise.resolve(),
  };
  return world;
}

export interface TownOptions {
  /** Carrefours par côté (défaut 3 × 3 = 9 carrefours). */
  cols?: number;
  rows?: number;
  /** Distance entre deux carrefours (m). */
  spacing?: number;
  /** Longueur des rues de sortie au bord du quadrillage (m) ; 0 = aucune. */
  stub?: number;
  width?: number;
  sidewalk?: number;
  /** Carrefours à feux : 'all', 'none', ou indices (col + row × cols). */
  signals?: 'all' | 'none' | readonly number[];
  /** Immeubles au cœur des îlots. */
  buildings?: boolean;
  /** Largeur des rues horizontales (axe x) si elle diffère. */
  widthX?: number;
}

export interface Town extends RoadWorld {
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
  /** Nœud du carrefour (col, row). */
  junction(col: number, row: number): number;
  /** Nœuds de bout des rues de sortie. */
  readonly exits: number[];
  /** Arête entre deux nœuds voisins (−1 si aucune). */
  edgeBetween(a: number, b: number): number;
  readonly centerX: number;
  readonly centerZ: number;
}

/**
 * Quadrillage de rues : carrefour (col, row) en (col × spacing, row × spacing) ; chaque rangée et chaque
 * colonne se prolonge au bord par une rue de sortie (impasse) où le trafic apparaît et disparaît.
 */
export function createTown(options: TownOptions = {}): Town {
  const cols = options.cols ?? 3;
  const rows = options.rows ?? 3;
  const spacing = options.spacing ?? 120;
  const stub = options.stub ?? 150;
  const width = options.width ?? 8;
  const widthX = options.widthX ?? width;
  const sidewalk = options.sidewalk ?? 3;
  const sig = options.signals ?? 'none';
  const nodes: FakeNode[] = [];
  const edges: FakeEdge[] = [];
  const junction = (c: number, r: number): number => c + r * cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = junction(c, r);
      nodes.push({ x: c * spacing, z: r * spacing, signal: sig === 'all' || (sig !== 'none' && sig.includes(id)), crossing: true });
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) edges.push({ a: junction(c, r), b: junction(c + 1, r), width: widthX, sidewalk, name: `Rue Est-Ouest ${r}` });
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r + 1 < rows; r++) edges.push({ a: junction(c, r), b: junction(c, r + 1), width, sidewalk, name: `Rue Nord-Sud ${c}` });
  }
  const exits: number[] = [];
  if (stub > 0) {
    const add = (x: number, z: number, to: number, w: number, name: string): void => {
      nodes.push({ x, z });
      exits.push(nodes.length - 1);
      edges.push({ a: nodes.length - 1, b: to, width: w, sidewalk, name });
    };
    for (let r = 0; r < rows; r++) {
      add(-stub, r * spacing, junction(0, r), widthX, `Rue Est-Ouest ${r}`);
      add((cols - 1) * spacing + stub, r * spacing, junction(cols - 1, r), widthX, `Rue Est-Ouest ${r}`);
    }
    for (let c = 0; c < cols; c++) {
      add(c * spacing, -stub, junction(c, 0), width, `Rue Nord-Sud ${c}`);
      add(c * spacing, (rows - 1) * spacing + stub, junction(c, rows - 1), width, `Rue Nord-Sud ${c}`);
    }
  }
  const boxes: FakeBox[] = [];
  if (options.buildings) {
    const m = Math.max(width, widthX) * 0.5 + sidewalk + 0.5;
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        boxes.push({ minX: c * spacing + m, minZ: r * spacing + m, maxX: (c + 1) * spacing - m, maxZ: (r + 1) * spacing - m, height: 18 });
      }
    }
  }
  const world = createRoadWorld(nodes, edges, boxes) as Town;
  const extra = {
    cols, rows, spacing, exits, junction,
    centerX: ((cols - 1) * spacing) / 2,
    centerZ: ((rows - 1) * spacing) / 2,
    edgeBetween(a: number, b: number): number {
      return edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    },
  };
  return Object.assign(world, extra);
}

// ───────────────────────────── dangers factices ─────────────────────────────

export interface GasCloud { x: number; z: number; radius: number; level: number }
export interface GasHazards extends HazardApi {
  readonly clouds: GasCloud[];
}

/** Dangers factices : nuages de gaz circulaires posés par le test (concentration maximale au centre). */
export function createGasHazards(base: HazardApi): GasHazards {
  const clouds: GasCloud[] = [];
  return {
    ...base,
    clouds,
    gasAt(x: number, z: number): number {
      let best = 0;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i]!;
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.radius) best = Math.max(best, c.level * (1 - d / c.radius));
      }
      return best;
    },
    clear(): void {
      clouds.length = 0;
    },
  };
}

// ───────────────────────────── banc d'essai ─────────────────────────────

export interface TrafficBench {
  readonly t: TestContext;
  readonly ctx: GameContext;
  readonly sys: TrafficSystem;
  readonly api: TrafficApi;
  readonly control: TrafficControlApi;
  step(seconds: number, dt?: number): void;
}

export interface TrafficBenchOptions {
  world?: WorldQuery;
  /** Modules voisins fournis par le test (véhicules, personnes…). */
  modules?: readonly ModuleFactory[];
  seed?: number;
  session?: Partial<SessionConfig>;
  /** Appelé après le boot et avant le démarrage de la session (services factices). */
  setup?(ctx: GameContext): void;
  /** Vie civile automatique (défaut : désactivée, le test fait apparaître ce qu'il veut). */
  ambient?: boolean;
}

/** Moteur de test avec le module de circulation, session démarrée. */
export async function createTrafficBench(options: TrafficBenchOptions = {}): Promise<TrafficBench> {
  const sys = new TrafficSystem();
  const t = createTestContext({ seed: options.seed ?? 1, modules: options.modules ?? [], systems: [sys] });
  await t.ready;
  const ctx = t.ctx;
  if (options.world) ctx.world = options.world;
  options.setup?.(ctx);
  await t.start(options.session);
  const api = ctx.require<TrafficApi>(TRAFFIC_SERVICE);
  api.tuning.ambient = options.ambient === true;
  return {
    t,
    ctx,
    sys,
    api,
    control: ctx.require<TrafficControlApi>(EXT.traffic),
    step: (seconds: number, dt?: number): void => t.step(seconds, dt),
  };
}
