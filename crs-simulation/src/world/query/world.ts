/* =====================================================================================
 * WorldQuery : relief, surfaces, collisions, réseau de rues, itinéraires, lieux, chargement
 * par secteurs. Assemble les pièces du dossier (magasin de tuiles, lots d'obstacles, grilles de
 * surfaces, graphe) et gère le choix du jeu de données (Paris ou quartier d'essai).
 *
 * Simulation pure : ni DOM, ni Three.js. Tourne sous Node (vitest) comme dans le navigateur.
 * ===================================================================================== */

import type {
  GameContext, LandmarkInfo, MapFurnitureInfo, MapShopInfo, PlaceInfo, RayHit, RoadEdgeInfo, RoadNodeInfo, RoadSample,
  SurfaceKind, Vec2, WorldBounds,
} from '@/core/contracts';
import {
  TILE_SIZE, decodeLandmarks, decodePlaces, decodeRoadGraph, decodeTerrain, parseManifest, sampleTerrain, tileBounds,
} from '../mapdata';
import type { Tile } from '../mapdata';
import type {
  GetColliders, MapSource, ObstacleSegmentView, WorldData, WorldQueryExt, WorldQueryOptions, WorldQueryStats,
  WorldSourceEvent,
} from './api';
import { WORLD_SOURCE_EVENT } from './api';
import { WorldBase, emptyBase, loadBase } from './base';
import type { DecodedBase } from './base';
import { CAP_STRIDE, CollisionBucket, CollisionWorld, SOLID_BUILDING, SOLID_WATER } from './collision';
import { loadMonumentColliders } from './monuments';
import { BucketBuilder } from './obstacles';
import {
  CODE_BRIDGE, CODE_BUILDING, CODE_GRAVEL, CODE_PARK, CODE_PLAZA, CODE_QUAY, CODE_ROAD, CODE_SETT, CODE_SIDEWALK,
  CODE_VOID, CODE_WATER, GRID_SIZE, TileGrid, codeOfCarriageway, codeOfMapSurface, codeOfPedestrianWay, fillPolygon,
  heightToDm, paintCapsule, paintPolyline, surfaceOfCode,
} from './raster';
import { ROAD_ANY, ROAD_DRIVABLE } from './roads';
import { DEFAULT_BASE_URL, FetchMapSource, createTestDistrictSource, testDistrictRaw } from './sources';
import { DEFAULT_LOAD_RADIUS, DEFAULT_UNLOAD_RADIUS } from './tiles';
import type { TileEntry, TileHost } from './tiles';

type SourceName = 'none' | 'test' | 'paris';

/** Distance par défaut de nearestRoad (m). */
const DEFAULT_ROAD_DISTANCE = 120;
/** Rayon libre exigé autour d'un point d'apparition (m). */
const SPAWN_CLEARANCE = 0.45;
/** Nombre d'essais de randomFreePoint. */
const SPAWN_TRIES = 48;
/** Distance maximale d'un point d'apparition au réseau de rues (m). */
const SPAWN_ROAD_DISTANCE = 120;
/** Période de suivi automatique du joueur (s) et délai après un setFocus explicite (s). */
const FOLLOW_PERIOD = 0.25;
const FOLLOW_DELAY = 1;

const FALLBACK_NOTICE = "Carte de Paris introuvable : le quartier d'essai est chargé à la place.";

const NO_NODE: RoadNodeInfo = Object.freeze({ id: -1, x: 0, z: 0, signal: false, crossing: false, edges: Object.freeze([]) as readonly number[] });
const NO_EDGE: RoadEdgeInfo = Object.freeze({
  id: -1, a: -1, b: -1, points: Object.freeze([]) as readonly number[], length: 0, width: 0, lanesForward: 0, lanesBackward: 0,
  oneway: false, roadClass: 'footway', name: '', bridge: false, sett: false, speedLimit: 0, sidewalk: 0, pedestrianOnly: true,
} as RoadEdgeInfo);
const NO_SHOPS: readonly MapShopInfo[] = Object.freeze([]);
const NO_FURNITURE: readonly MapFurnitureInfo[] = Object.freeze([]);

const now: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now();

interface LaunchLike { autostart?: string | null; raw?: Readonly<Record<string, string>> }
interface NodeProcessLike { versions?: { node?: string } }

function runningUnderNode(): boolean {
  const proc = (globalThis as { process?: NodeProcessLike }).process;
  return proc !== undefined && proc.versions !== undefined && typeof proc.versions.node === 'string';
}

// Fichiers de base du quartier d'essai décodés une fois par graine (immuables, partagés).
const testBaseCache = new Map<number, DecodedBase>();

function decodedTestBase(seed: number): DecodedBase {
  let base = testBaseCache.get(seed);
  if (base === undefined) {
    const raw = testDistrictRaw(seed);
    base = {
      source: createTestDistrictSource(seed),
      manifest: parseManifest(raw.manifest),
      roadGraph: decodeRoadGraph(raw.roadGraph),
      places: decodePlaces(raw.places),
      landmarks: decodeLandmarks(raw.landmarks),
      terrain: decodeTerrain(raw.terrain),
    };
    testBaseCache.set(seed, base);
  }
  return base;
}

export class WorldQueryImpl implements WorldQueryExt, TileHost {
  private ctx: GameContext | null = null;
  private headless = true;
  private readonly options: WorldQueryOptions;
  private readonly loadRadius: number;
  private readonly unloadRadius: number;
  private readonly collision = new CollisionWorld();

  private base: WorldBase;
  private current: SourceName = 'none';
  private fallback = false;
  private wanted: 'test' | 'paris' = 'test';
  private testBase: WorldBase | null = null;
  private parisBase: WorldBase | null = null;
  private parisState: 'unknown' | 'loading' | 'ready' | 'missing' = 'unknown';
  private parisLoad: Promise<void> | null = null;
  private pending: Promise<void> | null = null;
  private colliders: GetColliders | null;
  private collidersKnown: boolean;
  private disposed = false;

  private focusX = 0;
  private focusZ = 0;
  private hasFocus = false;
  private focusAge = Infinity;
  private followTimer = 0;

  private decodeMs = 0;
  private collisionMs = 0;
  private rasterMs = 0;
  private readonly countScratch = { segments: 0, solids: 0 };
  private readonly edgeScratch: number[] = [];

  /** Service 'world.data' (objet stable ; ses champs suivent le jeu de données courant). */
  readonly data: WorldData;

  constructor(options: WorldQueryOptions = {}) {
    this.options = options;
    this.loadRadius = options.loadRadius ?? DEFAULT_LOAD_RADIUS;
    this.unloadRadius = options.unloadRadius ?? DEFAULT_UNLOAD_RADIUS;
    this.colliders = options.colliders ?? null;
    this.collidersKnown = options.colliders !== undefined;
    this.base = new WorldBase(emptyBase(), this, this.loadRadius, this.unloadRadius, null);
    this.collision.setBounds(this.base.manifest.bounds);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.data = {
      get manifest() { return self.base.manifest; },
      get roadGraph() { return self.base.decoded.roadGraph; },
      get places() { return self.base.decoded.places; },
      get landmarks() { return self.base.decoded.landmarks; },
      get terrain() { return self.base.terrain; },
      tile(tx: number, tz: number): Tile | null {
        const e = self.base.store.entry(tx, tz);
        return e !== null && e.state === 'loaded' ? e.tile : null;
      },
      loadedKeys(): readonly string[] {
        return self.base.store.loadedKeys();
      },
    };
  }

  // ─────────────────────────────── cycle de vie ───────────────────────────────

  /** provide() : le contexte est connu. En mode headless, le quartier d'essai est installé tout de suite. */
  attach(ctx: GameContext): void {
    this.ctx = ctx;
    this.headless = ctx.headless;
    if (this.current === 'none' && (ctx.headless || this.options.source === 'test')) this.installTest(false);
  }

  /** init() : obstacles des monuments (facultatifs), puis jeu de données de démarrage. */
  async boot(): Promise<void> {
    if (!this.collidersKnown) {
      const fn = await loadMonumentColliders();
      this.collidersKnown = true;
      if (fn !== null && !this.disposed) {
        this.colliders = fn;
        for (const b of [this.testBase, this.parisBase]) {
          if (b === null) continue;
          const wasCurrent = b === this.base;
          if (wasCurrent) {
            b.store.unloadAll();
            this.collision.remove(b.landmarkBucket);
          }
          b.setColliders(fn);
          if (wasCurrent) {
            this.collision.add(b.landmarkBucket);
            if (this.hasFocus) b.store.setFocus(this.focusX, this.focusZ, true);
          }
        }
      }
    }
    await this.switchTo(this.sourceFor(false));
  }

  /** reset() : début de session — le mode de la session décide du jeu de données. */
  onSessionReset(): void {
    void this.switchTo(this.sourceFor(true)).catch((err) => console.error('[world] changement de carte', err));
  }

  update(dt: number): void {
    this.focusAge += dt;
    this.followTimer -= dt;
    if (this.followTimer > 0) return;
    this.followTimer = FOLLOW_PERIOD;
    // Sans setFocus explicite récent, le centre d'intérêt suit le personnage du joueur.
    if (this.focusAge > FOLLOW_DELAY && this.ctx !== null) {
      const p = this.ctx.player.person();
      if (p !== null) {
        this.focusX = p.x;
        this.focusZ = p.z;
        this.hasFocus = true;
      }
    }
    if (this.hasFocus) this.base.store.setFocus(this.focusX, this.focusZ);
  }

  dispose(): void {
    this.disposed = true;
    this.base.store.unloadAll();
    this.collision.clear();
  }

  // ─────────────────────────────── choix de la source ───────────────────────────────

  /** Jeu de données voulu : au démarrage (session = false) ou pour la session qui commence. */
  private sourceFor(session: boolean): 'test' | 'paris' {
    if (this.options.source === 'test') return 'test';
    if (this.options.source === 'paris') return 'paris';
    const launch = this.ctx !== null ? this.ctx.service<LaunchLike>('launch') : undefined;
    if (launch !== undefined && launch.raw !== undefined && launch.raw.map === 'test') return 'test';
    if (session) {
      const cfg = this.ctx !== null ? this.ctx.session.config : null;
      if (cfg !== null) return cfg.mode === 'test' ? 'test' : 'paris';
    }
    // Avant toute session : pas de lecture réseau ou disque inutile si l'on sait qu'on n'en aura pas besoin.
    if (launch !== undefined && launch.autostart === 'test') return 'test';
    return this.headless ? 'test' : 'paris';
  }

  private switchTo(want: 'test' | 'paris'): Promise<void> {
    this.wanted = want;
    if (want === 'test') {
      this.installTest(false);
      return Promise.resolve();
    }
    if (this.parisBase !== null) {
      this.install(this.parisBase, 'paris', false);
      return Promise.resolve();
    }
    if (this.parisState === 'missing') {
      this.installTest(true);
      return Promise.resolve();
    }
    if (this.parisLoad === null) this.parisLoad = this.loadParis();
    const p = this.parisLoad.then(() => {
      if (this.disposed || this.wanted !== 'paris') return;
      if (this.parisBase !== null) this.install(this.parisBase, 'paris', false);
      else this.installTest(true);
    });
    this.pending = p;
    const clear = (): void => {
      if (this.pending === p) this.pending = null;
    };
    p.then(clear, clear);
    return p;
  }

  private async loadParis(): Promise<void> {
    this.parisState = 'loading';
    try {
      let source: MapSource;
      if (this.options.parisSource !== undefined) {
        source = this.options.parisSource;
      } else if (runningUnderNode()) {
        const fsModule = await import('./source-fs');
        source = new fsModule.FsMapSource(this.options.fsDir);
      } else {
        source = new FetchMapSource(this.options.baseUrl ?? DEFAULT_BASE_URL);
      }
      const decoded = await loadBase(source);
      this.parisBase = new WorldBase(decoded, this, this.loadRadius, this.unloadRadius, this.colliders);
      this.parisState = 'ready';
    } catch (err) {
      this.parisState = 'missing';
      console.warn(`[world] données de Paris introuvables (${err instanceof Error ? err.message : String(err)}) : quartier d'essai`);
    }
  }

  private installTest(fallback: boolean): void {
    if (this.testBase === null) {
      this.testBase = new WorldBase(decodedTestBase(this.options.testSeed ?? 1), this, this.loadRadius, this.unloadRadius, this.colliders);
    }
    this.install(this.testBase, 'test', fallback);
    if (fallback && this.ctx !== null) this.ctx.ui.notify(FALLBACK_NOTICE, 'warn', 8);
  }

  private install(base: WorldBase, name: SourceName, fallback: boolean): void {
    this.fallback = fallback;
    if (this.base === base && this.current === name) return;
    this.base.store.unloadAll();
    this.collision.clear();
    this.base = base;
    this.current = name;
    this.collision.setBounds(base.manifest.bounds);
    this.collision.add(base.landmarkBucket);
    this.decodeMs = 0;
    this.collisionMs = 0;
    this.rasterMs = 0;
    if (this.hasFocus) base.store.setFocus(this.focusX, this.focusZ, true);
    if (this.ctx !== null) {
      const event: WorldSourceEvent = { name: base.manifest.name, fallback };
      this.ctx.events.emitAny(WORLD_SOURCE_EVENT, event);
    }
  }

  whenReady(): Promise<void> {
    return this.pending ?? Promise.resolve();
  }

  // ─────────────────────────────── hôte du magasin de tuiles ───────────────────────────────

  pause(): Promise<void> {
    if (this.headless) return Promise.resolve();
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  addDecodeTime(ms: number): void {
    this.decodeMs += ms;
  }

  tileDecoded(entry: TileEntry): void {
    const tile = entry.tile;
    if (tile === null) return;
    const t0 = now();
    const replaced = this.base.landmarkSet.replaced;
    const builder = new BucketBuilder(this.base.roads, tileBounds(entry.tx, entry.tz));
    for (const b of tile.buildings) {
      if (b.landmarkKey !== '' && replaced.has(b.landmarkKey)) continue;
      builder.addSolid(b.holes.length === 0 ? [b.outer] : [b.outer, ...b.holes], SOLID_BUILDING, b.height);
    }
    for (const s of tile.surfaces) {
      if (s.kind === 'water') builder.addWater(s.holes.length === 0 ? [s.outer] : [s.outer, ...s.holes]);
    }
    for (const b of tile.barriers) builder.addBarrier(b.kind, b.height, b.points);
    entry.bucket = builder.build();
    this.collision.add(entry.bucket);
    this.collisionMs += now() - t0;
    // Les bâtiments de cette tuile qui débordent chez les voisines sont ajoutés à leurs grilles.
    const store = this.base.store;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = store.entry(entry.tx + dx, entry.tz + dz);
        if (n !== null && n.grid !== null) {
          this.paintBuildings(n.grid, tile);
          this.paintPassages(n.grid, entry.bucket);
        }
      }
    }
  }

  tileLoaded(entry: TileEntry): void {
    if (this.ctx !== null) this.ctx.events.emit('world:tile_loaded', { tx: entry.tx, tz: entry.tz });
  }

  tileUnloaded(entry: TileEntry): void {
    if (entry.bucket !== null) this.collision.remove(entry.bucket);
    // Les grilles voisines portent peut-être des bâtiments de cette tuile : elles seront refaites à la demande.
    const store = this.base.store;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = store.entry(entry.tx + dx, entry.tz + dz);
        if (n !== null) n.grid = null;
      }
    }
    if (this.ctx !== null) this.ctx.events.emit('world:tile_unloaded', { tx: entry.tx, tz: entry.tz });
  }

  // ─────────────────────────────── grille de surfaces ───────────────────────────────

  private paintBuildings(grid: TileGrid, tile: Tile): void {
    const replaced = this.base.landmarkSet.replaced;
    const minX = grid.ox, minZ = grid.oz, maxX = grid.ox + TILE_SIZE, maxZ = grid.oz + TILE_SIZE;
    const own = tile.tx * TILE_SIZE === grid.ox && tile.tz * TILE_SIZE === grid.oz;
    for (const b of tile.buildings) {
      if (b.landmarkKey !== '' && replaced.has(b.landmarkKey)) continue;
      if (!own) {
        // Bâtiment d'une tuile voisine : seulement s'il déborde sur cette grille.
        const o = b.outer;
        let hit = false;
        for (let i = 0; i + 1 < o.length && !hit; i += 2) hit = o[i] >= minX && o[i] <= maxX && o[i + 1] >= minZ && o[i + 1] <= maxZ;
        if (!hit) continue;
      }
      fillPolygon(grid, b.holes.length === 0 ? [b.outer] : [b.outer, ...b.holes], CODE_BUILDING, heightToDm(b.height), 0);
    }
  }

  /** Passages de voies sous les bâtiments d'un lot : le sol y redevient celui de la voie. */
  private paintPassages(grid: TileGrid, bucket: CollisionBucket): void {
    const graph = this.base.decoded.roadGraph;
    for (let q = 0; q < bucket.polyCount; q++) {
      if (bucket.polyKind[q] === SOLID_WATER) continue;
      for (let c = bucket.polyCap0[q], end = bucket.polyCap0[q + 1]; c < end; c++) {
        const o = c * CAP_STRIDE;
        const ed = graph.edges[bucket.capEdge[c]];
        const code = ed === undefined ? CODE_SIDEWALK : ed.pedestrianOnly ? codeOfPedestrianWay(ed) : codeOfCarriageway(ed);
        paintCapsule(grid, bucket.caps[o], bucket.caps[o + 1], bucket.caps[o + 2], bucket.caps[o + 3], bucket.caps[o + 4], code, true, true, 0, 1 << CODE_BUILDING, 0);
      }
    }
  }

  private buildGrid(entry: TileEntry): TileGrid {
    const t0 = now();
    const tile = entry.tile as Tile;
    const base = this.base;
    const grid = new TileGrid(entry.tx * TILE_SIZE, entry.tz * TILE_SIZE);
    grid.kinds.fill(CODE_SIDEWALK);
    // Surfaces de la carte, dans leur ordre de superposition.
    for (const s of tile.surfaces) {
      fillPolygon(grid, s.holes.length === 0 ? [s.outer] : [s.outer, ...s.holes], codeOfMapSurface(s.kind), -1, 0);
    }
    // Arêtes du graphe qui touchent la tuile.
    const roads = base.roads;
    const margin = 64;
    const count = roads.querySegments(grid.ox - margin, grid.oz - margin, grid.ox + TILE_SIZE + margin, grid.oz + TILE_SIZE + margin, this.edgeScratch);
    const edges = new Set<number>();
    for (let k = 0; k < count; k++) edges.add(roads.segEdge[this.edgeScratch[k]]);
    const graph = base.decoded.roadGraph;
    const keepWater = 1 << CODE_WATER;
    for (const e of edges) {
      const ed = graph.edges[e];
      if (ed.tunnel || !ed.pedestrianOnly || ed.bridge) continue;
      paintPolyline(grid, ed.points, Math.max(0.75, ed.width / 2), codeOfPedestrianWay(ed), true, keepWater | (1 << CODE_ROAD), 0, -1);
    }
    for (const e of edges) {
      const ed = graph.edges[e];
      if (ed.tunnel || ed.pedestrianOnly || ed.bridge) continue;
      paintPolyline(grid, ed.points, ed.width / 2, codeOfCarriageway(ed), true, keepWater, 0, -1);
    }
    for (const e of edges) {
      const ed = graph.edges[e];
      if (ed.tunnel || !ed.bridge) continue;
      paintPolyline(grid, ed.points, roads.halfDeck[e], CODE_BRIDGE, false, 0, 0, -1);
    }
    // Bâtiments : ceux de la tuile, puis ceux des voisines qui débordent ; obstacles des monuments.
    this.paintBuildings(grid, tile);
    const store = base.store;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = store.entry(entry.tx + dx, entry.tz + dz);
        if (n !== null && n.tile !== null) this.paintBuildings(grid, n.tile);
      }
    }
    for (const o of base.landmarkSet.obstacles) fillPolygon(grid, [o.ring], CODE_BUILDING, heightToDm(o.top), 0);
    // Porches.
    if (entry.bucket !== null) this.paintPassages(grid, entry.bucket);
    this.paintPassages(grid, base.landmarkBucket);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = store.entry(entry.tx + dx, entry.tz + dz);
        if (n !== null && n.bucket !== null) this.paintPassages(grid, n.bucket);
      }
    }
    entry.grid = grid;
    this.rasterMs += now() - t0;
    return grid;
  }

  // ─────────────────────────────── WorldQuery : généralités ───────────────────────────────

  get ready(): boolean {
    return this.current !== 'none';
  }

  get bounds(): WorldBounds {
    return this.base.manifest.bounds;
  }

  get tileSize(): number {
    return this.base.manifest.tileSize;
  }

  get attribution(): string {
    return this.base.attribution;
  }

  get waterLevel(): number {
    return this.base.manifest.waterLevel;
  }

  // ─────────────────────────────── relief et surfaces ───────────────────────────────

  /** Altitude du sol : relief bilinéaire, ou tablier du pont (raccordé au relief sur ses bords). */
  heightAt(x: number, z: number): number {
    const base = this.base;
    return base.roads.deckHeight(x, z, sampleTerrain(base.terrain, x, z));
  }

  /** Code de surface (indice dans SURFACE_CODES) ; 0 = hors carte ou tuile non chargée. */
  surfaceCodeAt(x: number, z: number): number {
    const base = this.base;
    const b = base.manifest.bounds;
    if (!(x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ)) return CODE_VOID;
    const entry = base.store.entryAt(x, z);
    if (entry === null || entry.state !== 'loaded') return CODE_VOID;
    const grid = entry.grid !== null ? entry.grid : this.buildGrid(entry);
    let i = Math.floor(x - grid.ox), j = Math.floor(z - grid.oz);
    if (i < 0) i = 0; else if (i >= GRID_SIZE) i = GRID_SIZE - 1;
    if (j < 0) j = 0; else if (j >= GRID_SIZE) j = GRID_SIZE - 1;
    return grid.kinds[j * GRID_SIZE + i];
  }

  surfaceAt(x: number, z: number): SurfaceKind {
    return surfaceOfCode(this.surfaceCodeAt(x, z));
  }

  buildingHeightAt(x: number, z: number): number {
    const base = this.base;
    const entry = base.store.entryAt(x, z);
    if (entry === null || entry.state !== 'loaded') return 0;
    const grid = entry.grid !== null ? entry.grid : this.buildGrid(entry);
    let i = Math.floor(x - grid.ox), j = Math.floor(z - grid.oz);
    if (i < 0) i = 0; else if (i >= GRID_SIZE) i = GRID_SIZE - 1;
    if (j < 0) j = 0; else if (j >= GRID_SIZE) j = GRID_SIZE - 1;
    return grid.heights[j * GRID_SIZE + i] / 10;
  }

  // ─────────────────────────────── collisions ───────────────────────────────

  resolveCircle(pos: Vec2, radius: number): boolean {
    return this.collision.resolveCircle(pos, radius);
  }

  isFree(x: number, z: number, radius: number): boolean {
    return this.collision.isFree(x, z, radius);
  }

  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
    return this.collision.raycast(ax, az, bx, bz, out);
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return this.collision.lineOfSight(ax, az, bx, bz);
  }

  isSolidAt(x: number, z: number): boolean {
    return this.collision.solidAt(x, z);
  }

  sweepCircle(fromX: number, fromZ: number, pos: Vec2, radius: number): boolean {
    const dx = pos.x - fromX, dz = pos.z - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const stride = Math.max(0.05, radius * 0.9);
    if (dist <= stride) return this.collision.resolveCircle(pos, radius);
    const steps = Math.ceil(dist / stride);
    const sx = dx / steps, sz = dz / steps;
    let hit = false;
    pos.x = fromX;
    pos.z = fromZ;
    for (let i = 0; i < steps; i++) {
      pos.x += sx;
      pos.z += sz;
      if (this.collision.resolveCircle(pos, radius)) hit = true;
    }
    return hit;
  }

  forEachObstacle(minX: number, minZ: number, maxX: number, maxZ: number, visit: (s: ObstacleSegmentView) => void): void {
    this.collision.forEachSegment(minX, minZ, maxX, maxZ, visit);
  }

  // ─────────────────────────────── réseau de rues ───────────────────────────────

  get nodeCount(): number {
    return this.base.roads.nodes.length;
  }

  get edgeCount(): number {
    return this.base.roads.edges.length;
  }

  node(id: number): RoadNodeInfo {
    return this.base.roads.nodes[id] ?? NO_NODE;
  }

  edge(id: number): RoadEdgeInfo {
    return this.base.roads.edges[id] ?? NO_EDGE;
  }

  nearestRoad(x: number, z: number, out: RoadSample, maxDist: number = DEFAULT_ROAD_DISTANCE): boolean {
    const roads = this.base.roads;
    if (!roads.nearest(x, z, maxDist, ROAD_ANY)) return false;
    roads.fillSample(out);
    return true;
  }

  findPath(ax: number, az: number, bx: number, bz: number, mode: 'foot' | 'vehicle', out: number[]): boolean {
    return this.base.paths.find(ax, az, bx, bz, mode === 'vehicle', out);
  }

  /**
   * Point libre aléatoire autour de (x, z). 'sidewalk' : trottoir ou place ; 'road' : sur la
   * chaussée d'une voie carrossable ; 'any' : tout sol praticable. Le point est relié en ligne
   * droite à l'axe d'une voie proche : jamais dans une cour fermée ni derrière une grille.
   */
  randomFreePoint(x: number, z: number, radius: number, surface: 'sidewalk' | 'road' | 'any', rand: () => number, out: Vec2): boolean {
    const roads = this.base.roads;
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const code = this.surfaceCodeAt(px, pz);
      if (surface === 'sidewalk') {
        if (code !== CODE_SIDEWALK && code !== CODE_PLAZA) continue;
      } else if (surface === 'road') {
        if (code !== CODE_ROAD && code !== CODE_SETT) continue;
      } else if (code !== CODE_SIDEWALK && code !== CODE_PLAZA && code !== CODE_ROAD && code !== CODE_SETT && code !== CODE_PARK && code !== CODE_GRAVEL && code !== CODE_BRIDGE && code !== CODE_QUAY) {
        continue;
      }
      if (!this.collision.isFree(px, pz, SPAWN_CLEARANCE)) continue;
      if (surface === 'road') {
        if (!roads.nearest(px, pz, 40, ROAD_DRIVABLE)) continue;
        if (roads.snapDist > roads.edges[roads.snapEdge].width / 2 + 0.5) continue;
      } else {
        if (!roads.nearest(px, pz, SPAWN_ROAD_DISTANCE, ROAD_ANY)) continue;
        if (this.collision.blocked(px, pz, roads.snapX, roads.snapZ)) continue;
      }
      out.x = px;
      out.z = pz;
      return true;
    }
    return false;
  }

  // ─────────────────────────────── lieux ───────────────────────────────

  get places(): readonly PlaceInfo[] {
    return this.base.placeIndex.places;
  }

  get landmarks(): readonly LandmarkInfo[] {
    return this.base.placeIndex.landmarks;
  }

  placeByName(name: string): PlaceInfo | null {
    return this.base.placeIndex.byName(name);
  }

  sectorName(x: number, z: number): string {
    const base = this.base;
    const entry = base.store.entryAt(x, z);
    // La grille n'est consultée que si elle existe déjà (un nom de secteur ne vaut pas une rasterisation).
    let green = false;
    if (entry !== null && entry.grid !== null) {
      const code = this.surfaceCodeAt(x, z);
      green = code === CODE_PARK || code === CODE_GRAVEL;
    }
    return base.placeIndex.sectorName(x, z, base.roads, green);
  }

  // ─────────────────────────────── chargement par secteurs ───────────────────────────────

  setFocus(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.focusX = x;
    this.focusZ = z;
    this.hasFocus = true;
    this.focusAge = 0;
    this.base.store.setFocus(x, z);
  }

  isLoaded(x: number, z: number): boolean {
    return this.base.store.isLoaded(x, z);
  }

  whenLoaded(x: number, z: number, radius: number): Promise<void> {
    const pending = this.pending;
    if (pending !== null) {
      const next = (): Promise<void> => this.base.store.whenLoaded(x, z, radius);
      return pending.then(next, next);
    }
    return this.base.store.whenLoaded(x, z, radius);
  }

  shopsInTile(tx: number, tz: number): readonly MapShopInfo[] {
    const e = this.base.store.entry(tx, tz);
    return e !== null && e.state === 'loaded' ? e.shops : NO_SHOPS;
  }

  furnitureInTile(tx: number, tz: number): readonly MapFurnitureInfo[] {
    const e = this.base.store.entry(tx, tz);
    return e !== null && e.state === 'loaded' ? e.furniture : NO_FURNITURE;
  }

  // ─────────────────────────────── diagnostic ───────────────────────────────

  stats(): WorldQueryStats {
    const store = this.base.store;
    this.collision.count(this.countScratch);
    let grids = 0;
    for (const e of store.entries) if (e.grid !== null) grids++;
    return {
      source: this.base.manifest.name,
      fallback: this.fallback,
      tilesLoaded: store.loadedCount,
      tilesLoading: store.loadingCount,
      tilesFailed: store.failedCount,
      segments: this.countScratch.segments,
      solids: this.countScratch.solids,
      grids,
      decodeMs: this.decodeMs,
      collisionBuildMs: this.collisionMs,
      rasterMs: this.rasterMs,
    };
  }
}
