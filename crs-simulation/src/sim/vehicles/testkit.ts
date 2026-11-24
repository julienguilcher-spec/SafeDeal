/* =====================================================================================
 * Aides de test du module (utilisées par tests/unit/vehicles.*.test.ts). Rien ici n'est chargé par le jeu.
 *
 *   createFakeWorld   monde factice : sol plat ou en pente, nature du sol au choix, murs et immeubles
 *                     (boîtes alignées sur les axes), petit graphe routier avec itinéraires ;
 *   createFakeHazards dangers factices : foyers ponctuels, journal des appels (ignite, douse, fumée) ;
 *   createFakeTraffic fermetures de rues factices (service EXT.traffic) ;
 *   createRecordingProps service de décor factice qui consigne poussées et dégâts ;
 *   createVehicleBench moteur de test avec le seul module des véhicules.
 * ===================================================================================== */

import type {
  EntityId, GameContext, HazardApi, Person, PersonKind, Prop, PropApi, RayHit, RoadEdgeInfo, RoadNodeInfo, RoadSample,
  SessionConfig, Shop, SurfaceKind, Vec2, Vehicle, VehicleKind, WorldQuery,
} from '@/core/contracts';
import type { RoadClosure, TrafficControlApi } from '@/core/extensions';
import { circleVsObb, distSqPointSegment, segmentParam, segmentVsObb } from '@/core/math';
import type { SegmentCast } from '@/core/math';
import { clearRayHit, createNullWorld } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import type { AutopilotApi, VehiclesExtApi } from './api';
import { AUTOPILOT_SERVICE, VEHICLES_EXT_SERVICE } from './api';
import { VehiclesSystem } from './system';

/** Immeuble ou mur : boîte alignée sur les axes. */
export interface FakeBox { minX: number; minZ: number; maxX: number; maxZ: number; height: number }

export interface FakeRoadNode { x: number; z: number }
export interface FakeRoadEdge {
  a: number; b: number;
  width?: number; oneway?: boolean; speedLimit?: number; sett?: boolean; name?: string;
}

export interface FakeWorldOptions {
  boxes?: FakeBox[];
  /** Nature du sol (défaut : 'road' partout). */
  surface?: SurfaceKind | ((x: number, z: number) => SurfaceKind);
  height?: (x: number, z: number) => number;
  nodes?: FakeRoadNode[];
  edges?: FakeRoadEdge[];
}

export interface FakeWorld extends WorldQuery {
  readonly boxes: FakeBox[];
  /** Nombre d'appels à findPath (pour vérifier qu'on ne replanifie pas à chaque pas). */
  pathCalls: number;
}

/** Monde factice complet (WorldQuery) : à poser sur ctx.world avant de démarrer la session. */
export function createFakeWorld(options: FakeWorldOptions = {}): FakeWorld {
  const base = createNullWorld();
  const boxes = options.boxes ?? [];
  const nodes = options.nodes ?? [];
  const edges = options.edges ?? [];
  const surfaceOpt = options.surface ?? 'road';
  const heightFn = options.height;
  const tmp: Vec2 = { x: 0, z: 0 };
  const cast: SegmentCast = { t: 0, nx: 0, nz: 0 };

  const nodeInfos: RoadNodeInfo[] = nodes.map((n, id) => ({
    id, x: n.x, z: n.z, signal: false, crossing: false,
    edges: edges.map((e, i) => (e.a === id || e.b === id ? i : -1)).filter((i) => i >= 0),
  }));
  const edgeInfos: RoadEdgeInfo[] = edges.map((e, id) => {
    const a = nodes[e.a]!;
    const b = nodes[e.b]!;
    return {
      id, a: e.a, b: e.b, points: [a.x, a.z, b.x, b.z], length: Math.hypot(b.x - a.x, b.z - a.z), width: e.width ?? 7,
      lanesForward: 1, lanesBackward: e.oneway ? 0 : 1, oneway: e.oneway ?? false, roadClass: 'residential',
      name: e.name ?? `Rue ${id}`, bridge: false, sett: e.sett ?? false, speedLimit: e.speedLimit ?? 8.33, sidewalk: 2,
      pedestrianOnly: false,
    };
  });

  function inBox(x: number, z: number): FakeBox | null {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return b;
    }
    return null;
  }

  function nearestEdge(x: number, z: number): { edge: number; t: number; d2: number } {
    let best = -1;
    let bestT = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < edgeInfos.length; i++) {
      const p = edgeInfos[i]!.points;
      const d2 = distSqPointSegment(x, z, p[0]!, p[1]!, p[2]!, p[3]!);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
        bestT = segmentParam(x, z, p[0]!, p[1]!, p[2]!, p[3]!);
      }
    }
    return { edge: best, t: bestT, d2: bestD2 };
  }

  /** Plus court chemin entre deux nœuds (Dijkstra sur un petit graphe) ; liste de nœuds, vide si aucun. */
  function route(from: number, to: number): number[] {
    const dist = nodes.map(() => Infinity);
    const prev = nodes.map(() => -1);
    const done = nodes.map(() => false);
    dist[from] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
      if (u < 0 || u === to) break;
      done[u] = true;
      for (const e of edgeInfos) {
        let w = -1;
        if (e.a === u) w = e.b;
        else if (e.b === u && !e.oneway) w = e.a;
        if (w < 0) continue;
        const nd = dist[u]! + e.length;
        if (nd < dist[w]!) {
          dist[w] = nd;
          prev[w] = u;
        }
      }
    }
    if (dist[to] === Infinity) return [];
    const out: number[] = [];
    for (let n = to; n >= 0; n = prev[n]!) out.unshift(n);
    return out;
  }

  const world: FakeWorld = {
    ...base,
    boxes,
    pathCalls: 0,
    heightAt(x: number, z: number): number {
      return heightFn ? heightFn(x, z) : 0;
    },
    surfaceAt(x: number, z: number): SurfaceKind {
      if (inBox(x, z)) return 'building';
      return typeof surfaceOpt === 'function' ? surfaceOpt(x, z) : surfaceOpt;
    },
    buildingHeightAt(x: number, z: number): number {
      const b = inBox(x, z);
      return b ? b.height : 0;
    },
    resolveCircle(pos: Vec2, radius: number): boolean {
      let hit = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
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
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
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
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
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
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
        const cx = (b.minX + b.maxX) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        if (segmentVsObb(ax, az, bx, bz, cx, cz, (b.maxX - b.minX) * 0.5, (b.maxZ - b.minZ) * 0.5, 0, cast)) return false;
      }
      return true;
    },
    nodeCount: nodeInfos.length,
    edgeCount: edgeInfos.length,
    node(id: number): RoadNodeInfo {
      return nodeInfos[id] ?? base.node(id);
    },
    edge(id: number): RoadEdgeInfo {
      return edgeInfos[id] ?? base.edge(id);
    },
    nearestRoad(x: number, z: number, out: RoadSample, maxDist = 50): boolean {
      const n = nearestEdge(x, z);
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
    findPath(ax: number, az: number, bx: number, bz: number, _mode: 'foot' | 'vehicle', out: number[]): boolean {
      world.pathCalls++;
      out.length = 0;
      if (edgeInfos.length === 0) {
        out.push(ax, az, bx, bz);
        return true;
      }
      const s = nearestEdge(ax, az);
      const e = nearestEdge(bx, bz);
      const se = edgeInfos[s.edge]!;
      const ee = edgeInfos[e.edge]!;
      const sx = se.points[0]! + (se.points[2]! - se.points[0]!) * s.t;
      const sz = se.points[1]! + (se.points[3]! - se.points[1]!) * s.t;
      const ex = ee.points[0]! + (ee.points[2]! - ee.points[0]!) * e.t;
      const ez = ee.points[1]! + (ee.points[3]! - ee.points[1]!) * e.t;
      out.push(ax, az, sx, sz);
      if (s.edge !== e.edge) {
        // meilleur couple (extrémité de départ, extrémité d'arrivée)
        let best: number[] = [];
        let bestLen = Infinity;
        const starts = se.oneway ? [se.b] : [se.a, se.b];
        const ends = ee.oneway ? [ee.a] : [ee.a, ee.b];
        for (const from of starts) {
          for (const to of ends) {
            const r = route(from, to);
            if (r.length === 0) continue;
            let len = Math.hypot(nodes[from]!.x - sx, nodes[from]!.z - sz) + Math.hypot(nodes[to]!.x - ex, nodes[to]!.z - ez);
            for (let i = 1; i < r.length; i++) len += Math.hypot(nodes[r[i]!]!.x - nodes[r[i - 1]!]!.x, nodes[r[i]!]!.z - nodes[r[i - 1]!]!.z);
            if (len < bestLen) {
              bestLen = len;
              best = r;
            }
          }
        }
        if (best.length === 0) {
          out.length = 0;
          return false;
        }
        for (const n of best) out.push(nodes[n]!.x, nodes[n]!.z);
      }
      out.push(ex, ez, bx, bz);
      return true;
    },
  };
  return world;
}

// ───────────────────────────── dangers factices ─────────────────────────────

export interface FakeFire { x: number; z: number; radius: number; intensity: number; sourceId: EntityId }
export interface FakeDouse { x: number; z: number; radius: number; amount: number }

export interface FakeHazards extends HazardApi {
  readonly fires: FakeFire[];
  readonly douses: FakeDouse[];
  smokeCalls: number;
  smokeAmount: number;
  igniteCalls: number;
  /** Conserver les foyers allumés par ignite() (sinon ils sont seulement comptés). */
  keepIgnited: boolean;
  /** Agent extincteur total reçu. */
  doused: number;
}

/**
 * Dangers factices : chaque foyer est un disque d'intensité constante ; douse() l'affaiblit
 * (1 unité d'agent retire 0,1 d'intensité) et le supprime à zéro.
 */
export function createFakeHazards(): FakeHazards {
  const fires: FakeFire[] = [];
  const douses: FakeDouse[] = [];
  const hz: FakeHazards = {
    fires,
    douses,
    smokeCalls: 0,
    smokeAmount: 0,
    igniteCalls: 0,
    keepIgnited: false,
    doused: 0,
    emitGas(): void {},
    emitSmoke(_x: number, _z: number, amount: number): void {
      hz.smokeCalls++;
      hz.smokeAmount += amount;
    },
    gasAt(): number {
      return 0;
    },
    smokeAt(): number {
      return 0;
    },
    ignite(x: number, z: number, radius: number, intensity: number, sourceId: EntityId): void {
      hz.igniteCalls++;
      if (hz.keepIgnited) fires.push({ x, z, radius, intensity, sourceId });
    },
    fireAt(x: number, z: number): number {
      let best = 0;
      for (let i = 0; i < fires.length; i++) {
        const f = fires[i]!;
        const dx = x - f.x;
        const dz = z - f.z;
        if (dx * dx + dz * dz <= f.radius * f.radius && f.intensity > best) best = f.intensity;
      }
      return best;
    },
    douse(x: number, z: number, radius: number, amount: number): void {
      douses.push({ x, z, radius, amount });
      hz.doused += amount;
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i]!;
        const dx = x - f.x;
        const dz = z - f.z;
        const reach = radius + f.radius;
        if (dx * dx + dz * dz > reach * reach) continue;
        f.intensity -= amount * 0.1;
        if (f.intensity <= 0) fires.splice(i, 1);
      }
    },
    visibility(): number {
      return 1;
    },
    clear(): void {
      fires.length = 0;
      douses.length = 0;
      hz.smokeCalls = 0;
      hz.smokeAmount = 0;
      hz.igniteCalls = 0;
      hz.doused = 0;
    },
  };
  return hz;
}

// ───────────────────────────── circulation factice ─────────────────────────────

export interface FakeTraffic extends TrafficControlApi {
  readonly closures: RoadClosure[];
  /** Ferme la rue en un point (sans graphe : simple barrage). */
  closeAt(x: number, z: number): RoadClosure;
}

export function createFakeTraffic(): FakeTraffic {
  const closures: RoadClosure[] = [];
  let next = 1;
  return {
    closures,
    isClosed: (edgeId: number): boolean => closures.some((c) => c.edgeId === edgeId),
    closeRoad(x: number, z: number): RoadClosure {
      return this.closeAt(x, z);
    },
    closeArea: (): RoadClosure[] => [],
    open(id: number): void {
      const i = closures.findIndex((c) => c.id === id);
      if (i >= 0) closures.splice(i, 1);
    },
    openAll(): void {
      closures.length = 0;
    },
    countNear: () => ({ moving: 0, stopped: 0 }),
    closeAt(x: number, z: number): RoadClosure {
      const c: RoadClosure = { id: next++, edgeId: -1, x, z, heading: 0, squadId: 0, createdAt: 0 };
      closures.push(c);
      return c;
    },
  };
}

// ───────────────────────────── banc d'essai ─────────────────────────────

export interface VehicleBench {
  readonly t: TestContext;
  readonly ctx: GameContext;
  readonly sys: VehiclesSystem;
  readonly ext: VehiclesExtApi;
  readonly autopilot: AutopilotApi;
  /** Avance la simulation (pas de 1/30 s par défaut). */
  step(seconds: number, dt?: number): void;
  spawn(kind: VehicleKind, x?: number, z?: number, heading?: number): Vehicle;
  /** Crée une personne et l'assoit au volant. */
  driver(v: Vehicle, kind?: PersonKind): Person;
  person(kind: PersonKind, x: number, z: number): Person;
}

export interface VehicleBenchOptions {
  world?: WorldQuery;
  hazards?: HazardApi;
  seed?: number;
  session?: Partial<SessionConfig>;
  /** Appelé après le boot et avant le démarrage de la session (services factices supplémentaires). */
  setup?(ctx: GameContext): void;
}

/** Moteur de test avec le seul module des véhicules, session démarrée. */
export async function createVehicleBench(options: VehicleBenchOptions = {}): Promise<VehicleBench> {
  const sys = new VehiclesSystem();
  const t = createTestContext({ seed: options.seed ?? 1, systems: [sys] });
  await t.ready;
  const ctx = t.ctx;
  if (options.world) ctx.world = options.world;
  if (options.hazards) ctx.hazards = options.hazards;
  options.setup?.(ctx);
  await t.start(options.session);
  const bench: VehicleBench = {
    t,
    ctx,
    sys,
    ext: ctx.require<VehiclesExtApi>(VEHICLES_EXT_SERVICE),
    autopilot: ctx.require<AutopilotApi>(AUTOPILOT_SERVICE),
    step: (seconds: number, dt?: number): void => t.step(seconds, dt),
    spawn: (kind: VehicleKind, x = 0, z = 0, heading = 0): Vehicle => ctx.vehicles.spawn(kind, x, z, heading),
    driver(v: Vehicle, kind: PersonKind = 'crs'): Person {
      const p = ctx.people.spawn({ kind, x: v.x, z: v.z });
      if (!ctx.vehicles.enter(p, v, 'driver')) throw new Error(`siège conducteur indisponible dans ${v.def.name}`);
      return p;
    },
    person: (kind: PersonKind, x: number, z: number): Person => ctx.people.spawn({ kind, x, z }),
  };
  return bench;
}

// ───────────────────────────── décor factice ─────────────────────────────

export interface PropCall { type: 'push' | 'damage'; propId: EntityId; amount: number; kind: string; byId: EntityId; dirX: number; dirZ: number }

export interface RecordingProps extends PropApi {
  /** Journal des poussées et des dégâts demandés au service. */
  readonly calls: PropCall[];
}

/**
 * Service de décor factice : s'appuie sur un vrai magasin (celui du cœur) pour les données et la
 * géométrie, et consigne chaque appel à push() et damage().
 */
export function createRecordingProps(real: PropApi): RecordingProps {
  const calls: PropCall[] = [];
  return {
    calls,
    get list(): readonly Prop[] {
      return real.list;
    },
    get shops(): readonly Shop[] {
      return real.shops;
    },
    addShop: (init) => real.addShop(init),
    removeShop: (id) => real.removeShop(id),
    get: (id) => real.get(id),
    shop: (id) => real.shop(id),
    spawn: (kind, x, z, heading) => real.spawn(kind, x, z, heading),
    remove: (id) => real.remove(id),
    clear: () => real.clear(),
    queryRadius: (x, z, r, out, filter) => real.queryRadius(x, z, r, out, filter),
    shopsNear: (x, z, r, out) => real.shopsNear(x, z, r, out),
    damage(prop, amount, kind, byId): void {
      calls.push({ type: 'damage', propId: prop.id, amount, kind, byId, dirX: 0, dirZ: 0 });
      real.damage(prop, amount, kind, byId);
    },
    damageShop: (shop, amount, kind, byId) => real.damageShop(shop, amount, kind, byId),
    loot: (shop, byId) => real.loot(shop, byId),
    push(prop, dirX, dirZ, force, byId): void {
      calls.push({ type: 'push', propId: prop.id, amount: force, kind: '', byId, dirX, dirZ });
      real.push(prop, dirX, dirZ, force, byId);
    },
    tag: (target, byId) => real.tag(target, byId),
    resolveCircle: (pos, radius) => real.resolveCircle(pos, radius),
    raycast: (ax, az, bx, bz, out, mode) => real.raycast(ax, az, bx, bz, out, mode),
  };
}
