/* =====================================================================================
 * DÉCOR DYNAMIQUE — banc d'essai des tests : contexte headless avec le module branché, et des
 * services factices pilotables (monde avec tuiles, surfaces, murs et rues ; dangers qui enregistrent
 * fumée, chaleur et eau ; directeur dont on règle la tension).
 * Réservé aux tests (tests/unit/props.*.test.ts) : aucun autre module ne doit l'importer.
 * ===================================================================================== */

import type {
  DirectorApi, GameContext, GameEvents, GameSystem, HazardApi, MapFurnitureInfo, MapShopInfo, Person, PersonInit,
  RoadSample, SessionConfig, ShopCategory, SurfaceKind, Vec2, WorldQuery,
} from '@/core/contracts';
import { createNullDirector, createNullHazards, createNullWorld } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { PROPS_EXT_SERVICE } from './api';
import type { PropsExtApi } from './api';
import { PropsSystem } from './system';

// ───────────────────────────── monde factice ─────────────────────────────

export interface FakeWall { minX: number; minZ: number; maxX: number; maxZ: number }

export interface FakeRoad { x: number; z: number; heading: number; width: number }

export interface FakeWorld extends WorldQuery {
  /** Contenu des tuiles « chargées ». */
  setTile(tx: number, tz: number, furniture: MapFurnitureInfo[], shops: MapShopInfo[]): void;
  dropTile(tx: number, tz: number): void;
  /** Surface en un point (défaut : 'sidewalk'). */
  surface: (x: number, z: number) => SurfaceKind;
  /** Murs (rectangles alignés sur les axes) : arrêtent les disques. */
  walls: FakeWall[];
  /** Rue unique, droite et infinie, si définie. */
  road: FakeRoad | null;
}

export function createFakeWorld(): FakeWorld {
  const base = createNullWorld();
  const tiles = new Map<string, { furniture: MapFurnitureInfo[]; shops: MapShopInfo[] }>();
  const none: readonly never[] = Object.freeze([]);
  const world: FakeWorld = Object.assign(Object.create(base) as WorldQuery, {
    surface: (_x: number, _z: number): SurfaceKind => 'sidewalk',
    walls: [] as FakeWall[],
    road: null as FakeRoad | null,
    setTile(tx: number, tz: number, furniture: MapFurnitureInfo[], shops: MapShopInfo[]): void {
      tiles.set(`${tx}:${tz}`, { furniture, shops });
    },
    dropTile(tx: number, tz: number): void {
      tiles.delete(`${tx}:${tz}`);
    },
  }) as FakeWorld;
  // les propriétés en lecture seule du monde neutre sont reprises telles quelles
  Object.defineProperties(world, {
    ready: { value: true },
    bounds: { value: { minX: -1024, minZ: -1024, maxX: 1024, maxZ: 1024 } },
    tileSize: { value: 512 },
    attribution: { value: '' },
    waterLevel: { value: -4 },
    nodeCount: { value: 0 },
    edgeCount: { get: () => (world.road ? 1 : 0) },
    places: { value: [] },
    landmarks: { value: [] },
  });
  world.heightAt = () => 0;
  world.buildingHeightAt = () => 0;
  world.surfaceAt = (x, z) => world.surface(x, z);
  world.isFree = (x, z, r) => {
    for (const w of world.walls) {
      if (x + r > w.minX && x - r < w.maxX && z + r > w.minZ && z - r < w.maxZ) return false;
    }
    return true;
  };
  world.resolveCircle = (pos: Vec2, r: number) => {
    let hit = false;
    for (const w of world.walls) {
      const qx = pos.x < w.minX ? w.minX : pos.x > w.maxX ? w.maxX : pos.x;
      const qz = pos.z < w.minZ ? w.minZ : pos.z > w.maxZ ? w.maxZ : pos.z;
      const dx = pos.x - qx;
      const dz = pos.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        pos.z = w.minZ - r; // centre dans le mur : sortie par le nord
      }
      hit = true;
    }
    return hit;
  };
  world.nearestRoad = (x: number, z: number, out: RoadSample, maxDist?: number) => {
    const road = world.road;
    if (!road) return false;
    const fx = Math.sin(road.heading);
    const fz = Math.cos(road.heading);
    const t = (x - road.x) * fx + (z - road.z) * fz;
    const px = road.x + fx * t;
    const pz = road.z + fz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (maxDist !== undefined && dist > maxDist) return false;
    out.edgeId = 0;
    out.x = px;
    out.z = pz;
    out.heading = road.heading;
    out.dist = dist;
    out.width = road.width;
    out.name = 'rue du Banc-d\'Essai';
    out.roadClass = 'secondary';
    out.oneway = false;
    return true;
  };
  world.isLoaded = () => true;
  world.shopsInTile = (tx, tz) => tiles.get(`${tx}:${tz}`)?.shops ?? none;
  world.furnitureInTile = (tx, tz) => tiles.get(`${tx}:${tz}`)?.furniture ?? none;
  return world;
}

// ───────────────────────────── dangers factices ─────────────────────────────

export interface FakeFire { x: number; z: number; radius: number; intensity: number; sourceId: number }

export interface FakeHazards extends HazardApi {
  fires: FakeFire[];
  smoke: { x: number; z: number; amount: number; radius: number; color: number | undefined; t: number }[];
  ignites: { x: number; z: number; radius: number; intensity: number; sourceId: number; t: number }[];
  douses: { x: number; z: number; radius: number; amount: number; t: number }[];
  /** ignite() crée ou entretient une nappe factice (comme le vrai module) ; false = sans effet sur fireAt. */
  keepFires: boolean;
  /** douse() émet l'événement libre 'hazards:douse' (comme le vrai module). */
  emitDouse: boolean;
  /** douse() retire les nappes factices touchées. */
  douseKills: boolean;
  totalSmoke(): number;
}

export function createFakeHazards(ctx: GameContext): FakeHazards {
  const base = createNullHazards();
  const h: FakeHazards = {
    ...base,
    fires: [],
    smoke: [],
    ignites: [],
    douses: [],
    keepFires: true,
    emitDouse: true,
    douseKills: true,
    emitSmoke(x, z, amount, radius, color) {
      h.smoke.push({ x, z, amount, radius, color, t: ctx.clock.now });
    },
    ignite(x, z, radius, intensity, sourceId) {
      h.ignites.push({ x, z, radius, intensity, sourceId, t: ctx.clock.now });
      if (!h.keepFires) return;
      for (const f of h.fires) {
        if (Math.hypot(f.x - x, f.z - z) < 0.6 * Math.max(f.radius, radius)) {
          f.intensity = Math.max(f.intensity, intensity);
          f.radius = Math.max(f.radius, radius);
          return;
        }
      }
      h.fires.push({ x, z, radius, intensity, sourceId });
    },
    fireAt(x, z) {
      let best = 0;
      for (const f of h.fires) {
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < f.radius && f.intensity > best) best = f.intensity;
      }
      return best;
    },
    douse(x, z, radius, amount) {
      h.douses.push({ x, z, radius, amount, t: ctx.clock.now });
      if (h.douseKills) h.fires = h.fires.filter((f) => Math.hypot(f.x - x, f.z - z) > radius + f.radius);
      if (h.emitDouse) ctx.events.emitAny('hazards:douse', { x, z, radius, amount });
    },
    clear() {
      h.fires.length = 0;
      h.smoke.length = 0;
      h.ignites.length = 0;
      h.douses.length = 0;
    },
    totalSmoke() {
      let s = 0;
      for (const e of h.smoke) s += e.amount;
      return s;
    },
  };
  return h;
}

// ───────────────────────────── directeur factice ─────────────────────────────

export interface FakeDirector extends DirectorApi {
  /** Tension locale renvoyée par tensionAt (réglable). */
  local: (x: number, z: number) => number;
  added: { amount: number; x: number; z: number; reason: string }[];
  totalAdded(): number;
}

export function createFakeDirector(): FakeDirector {
  const base = createNullDirector();
  const d: FakeDirector = {
    ...base,
    local: () => 0,
    added: [],
    tensionAt(x, z) {
      return d.local(x, z);
    },
    addTension(amount, x, z, reason) {
      d.added.push({ amount, x, z, reason });
    },
    totalAdded() {
      let s = 0;
      for (const a of d.added) s += a.amount;
      return s;
    },
  };
  return d;
}

// ───────────────────────────── banc ─────────────────────────────

export interface PropsRigOptions {
  seed?: number;
  /** Monde factice (défaut : oui). false = monde neutre du cœur. */
  world?: boolean;
  /** Dangers factices (défaut : oui). false = dangers neutres du cœur. */
  hazards?: boolean;
  /** Systèmes supplémentaires (modules réels pour un essai d'intégration). */
  systems?: GameSystem[];
  session?: Partial<SessionConfig>;
}

type Logged<K extends keyof GameEvents> = GameEvents[K] & { name: K };

export interface PropsRig {
  t: TestContext;
  ctx: GameContext;
  system: PropsSystem;
  ext: PropsExtApi;
  world: FakeWorld;
  hazards: FakeHazards;
  director: FakeDirector;
  /** Journal des événements du contrat émis depuis le démarrage (nom + charge utile copiée). */
  log: Logged<keyof GameEvents>[];
  events<K extends keyof GameEvents>(name: K): GameEvents[K][];
  clearLog(): void;
  /** Crée un manifestant (ou une autre personne) immobile. */
  person(x: number, z: number, init?: Partial<PersonInit>): Person;
  /** Avance la simulation (pas de 1/30 s par défaut). */
  step(seconds: number, dt?: number): void;
}

const LOGGED: (keyof GameEvents)[] = [
  'prop:spawned', 'prop:removed', 'prop:damaged', 'prop:moved', 'shop:window', 'shop:looted', 'shop:shutter',
  'barricade:built', 'fire:started', 'fire:out', 'fx', 'sfx', 'law:offense',
];

export async function startProps(options: PropsRigOptions = {}): Promise<PropsRig> {
  const system = new PropsSystem();
  const world = createFakeWorld();
  const director = createFakeDirector();
  let hazards!: FakeHazards;
  const fakes: GameSystem = {
    id: 'props.testkit',
    order: 1,
    provide(ctx: GameContext): void {
      hazards = createFakeHazards(ctx);
      if (options.world !== false) ctx.world = world;
      if (options.hazards !== false) ctx.hazards = hazards;
      ctx.director = director;
    },
    reset(): void {
      hazards.clear();
      director.added.length = 0;
    },
  };
  const t = createTestContext({ seed: options.seed ?? 1, systems: [fakes, ...(options.systems ?? []), system] });
  const ctx = t.ctx;
  const log: Logged<keyof GameEvents>[] = [];
  await t.ready;
  for (const name of LOGGED) {
    ctx.events.on(name, (payload) => {
      log.push({ ...(payload as object), name } as Logged<keyof GameEvents>);
    });
  }
  await t.start(options.session ?? {});
  const ext = ctx.require<PropsExtApi>(PROPS_EXT_SERVICE);
  return {
    t, ctx, system, ext, world, hazards, director, log,
    events<K extends keyof GameEvents>(name: K): GameEvents[K][] {
      return log.filter((e) => e.name === name) as unknown as GameEvents[K][];
    },
    clearLog(): void {
      log.length = 0;
    },
    person(x: number, z: number, init: Partial<PersonInit> = {}): Person {
      return ctx.people.spawn({ kind: 'manifestant', x, z, ...init });
    },
    step(seconds: number, dt?: number): void {
      t.step(seconds, dt);
    },
  };
}

/** Raccourci : vitrine de carte. */
export function mapShop(index: number, category: ShopCategory, x: number, z: number, heading = 0, width = 6): MapShopInfo {
  return { index, category, x, z, heading, width };
}

/** Raccourci : mobilier de carte. */
export function mapFurniture(index: number, kind: string, x: number, z: number, heading = 0): MapFurnitureInfo {
  return { index, kind, x, z, heading };
}
