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
  decodeLandmarks, decodePlaces, decodeRoadGraph, decodeTerrain, parseManifest, pointInPolygon, sampleTerrain, tileBounds,
} from '../mapdata';
import type {
  GetColliders, MapSource, ObstacleSegmentView, WorldData, WorldQueryExt, WorldQueryOptions, WorldQueryStats,
  WorldSourceEvent,
} from './api';
import { WORLD_SOURCE_EVENT } from './api';
import { WorldBase, emptyBase, loadBase } from './base';
import { WorldDataView } from './data-view';
import type { DecodedBase } from './base';
import { CollisionWorld, SOLID_BUILDING, SOLID_LANDMARK } from './collision';
import { loadMonumentColliders } from './monuments';
import { BucketBuilder } from './obstacles';
import { CODE_GRAVEL, CODE_PARK, CODE_VOID, GRID_SIZE, surfaceOfCode } from './raster';
import type { TileGrid } from './raster';
import { ROAD_ANY } from './roads';
import { DEFAULT_BASE_URL, FetchMapSource, createTestDistrictSource, testDistrictRaw } from './sources';
import { findSpawnPoint } from './spawn';
import { buildTileGrid, patchNeighbourGrid } from './surfaces';
import { DEFAULT_LOAD_RADIUS, DEFAULT_UNLOAD_RADIUS } from './tiles';
import type { TileEntry, TileHost } from './tiles';

type SourceName = 'none' | 'test' | 'paris';

/** Distance par défaut de nearestRoad (m). */
const DEFAULT_ROAD_DISTANCE = 120;
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
    this.data = new WorldDataView(() => this.base);
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
    // Monuments sans obstacles propres : leur emprise ne sert que si aucun bâtiment ne les représente ici.
    const rect = tileBounds(entry.tx, entry.tz);
    for (const fb of this.base.landmarkSet.fallback) {
      if (fb.x < rect.minX || fb.x >= rect.maxX || fb.z < rect.minZ || fb.z >= rect.maxZ) continue;
      let represented = false;
      for (let i = 0; i < tile.buildings.length && !represented; i++) {
        const b = tile.buildings[i];
        represented = b.landmarkKey === fb.key || pointInPolygon(b.outer, b.holes, fb.x, fb.z);
      }
      if (!represented) builder.addSolid([fb.ring], SOLID_LANDMARK, fb.top);
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
        if (n !== null && n.grid !== null) patchNeighbourGrid(this.base, n.grid, tile, entry.bucket);
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

  /** Grille de surfaces de la tuile, rasterisée à la première demande. */
  private gridOf(entry: TileEntry): TileGrid {
    if (entry.grid !== null) return entry.grid;
    const t0 = now();
    entry.grid = buildTileGrid(this.base, entry, this.edgeScratch);
    this.rasterMs += now() - t0;
    return entry.grid;
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
    const grid = this.gridOf(entry);
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
    const grid = this.gridOf(entry);
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

  randomFreePoint(x: number, z: number, radius: number, surface: 'sidewalk' | 'road' | 'any', rand: () => number, out: Vec2): boolean {
    return findSpawnPoint(this, this.collision, this.base.roads, x, z, radius, surface, rand, out);
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
