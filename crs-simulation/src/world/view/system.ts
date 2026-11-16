/* =====================================================================================
 * VILLE EN 3D — système d'affichage (GameSystem, ordre WORLD_VIEW).
 * -------------------------------------------------------------------------------------
 * Suit la caméra (ctx.view) : construit les tuiles proches en version détaillée, les autres en
 * version lointaine jusqu'à ctx.view.drawDistance, et libère tout ce qui sort de portée. La
 * construction est étalée : quelques millisecondes par image, la tuile la plus proche d'abord.
 *
 * Données : service « world.data » (tuiles décodées par la simulation, graphe, relief) et
 * événements world:tile_loaded / world:tile_unloaded / world:source. Au-delà du rayon de
 * chargement de la simulation, les tuiles de la vue lointaine sont lues à part (voir FarTileProvider).
 * ===================================================================================== */

import * as THREE from 'three';
import type { EnvState, GameContext, GameSystem, QualityLevel, Unsubscribe } from '../../core/contracts';
import { SystemOrder } from '../../core/contracts';
import { TILE_SIZE, decodeTile, sampleTerrain } from '../mapdata';
import type { Landmark, Manifest, ManifestTile, Place, RawTile, RoadGraph, Terrain, Tile } from '../mapdata';
import { WORLD_MAP2D_SERVICE, WORLD_VIEW_SERVICE } from './api';
import type { FarTileProvider, WorldViewApi, WorldViewOptions, WorldViewStats } from './api';
import { disposeSharedBuildingResources, prepareSharedBuildingResources } from './buildings/index';
import { BridgeProfile } from './decks';
import { EdgeIndex } from './edgeindex';
import { releaseGroundScratch } from './ground';
import { Horizon } from './horizon';
import { runSlice, sortJobs, tileDistance, wantedLod } from './lod';
import type { BuildJob, Lod, SliceSpent } from './lod';
import { Map2d } from './map2d';
import type { Map2dSource } from './map2d';
import { cityUniforms, updateCityUniforms } from './materials';
import { cityQuality } from './quality';
import { bakeMacro, createRaster, rasterizeTile } from './raster';
import { createSharedResources, disposeSharedResources } from './shared';
import type { SharedResources } from './shared';
import { DetailTile, FarTile, releaseTileScratch } from './tiles';
import type { CityContext } from './tiles';
import { releaseTinScratch } from './tin';

/** Forme du service « world.data » (voir src/world/query/api.ts). */
interface WorldDataLike extends Map2dSource {
  readonly terrain: Terrain;
  readonly places: readonly Place[];
  readonly landmarks: readonly Landmark[];
}

interface MonumentsLike { has(key: string): boolean }

interface Slot {
  readonly tx: number;
  readonly tz: number;
  readonly key: string;
  readonly info: ManifestTile;
  /** Niveau voulu (avec hystérésis). */
  want: Lod;
  dist: number;
  far: FarTile | null;
  detail: DetailTile | null;
  /** Données lues à part pour la vue lointaine (hors du rayon de la simulation). */
  fetched: Tile | null;
  fetching: boolean;
  /** Échecs de lecture (on n'insiste pas). */
  fetchFailed: number;
  /** Le socle a déjà reçu les couleurs de cette tuile. */
  painted: boolean;
}

interface ActiveJob {
  slot: Slot;
  lod: 1 | 2;
  work: Generator<number, void, void>;
  view: DetailTile | FarTile;
  spent: SliceSpent;
}

const NEUTRAL_ENV: EnvState = {
  timeOfDay: 14, clockScale: 1, weather: 'clair', rain: 0, fog: 0, clouds: 0.3, wetness: 0, windX: 1, windZ: 0.5, sunX: 0.4, sunY: 0.8, sunZ: 0.3,
  daylight: 1, isNight: false, streetLights: false,
};

const now = (): number => performance.now();

export class WorldViewSystem implements GameSystem {
  readonly id = 'world:view';
  readonly order = SystemOrder.WORLD_VIEW;

  private ctx: GameContext | null = null;
  private readonly options: WorldViewOptions;
  private readonly map2d: Map2d;
  private readonly root = new THREE.Group();
  private data: WorldDataLike | null = null;
  private manifest: Manifest | null = null;
  private graph: RoadGraph | null = null;
  private shared: SharedResources | null = null;
  private city: CityContext | null = null;
  private horizon: Horizon | null = null;
  private quality: QualityLevel = 'moyen';
  private readonly slots = new Map<string, Slot>();
  private readonly slotList: Slot[] = [];
  private queue: BuildJob[] = [];
  private active: ActiveJob | null = null;
  private fetchCount = 0;
  private unsub: Unsubscribe[] = [];
  private evalTimer = 0;
  private evalX = NaN;
  private evalZ = NaN;
  private dirty = true;
  private time = 0;
  private attached = false;
  private idleWaiters: (() => void)[] = [];
  private readonly counters = { lastDetailMs: 0, lastFarMs: 0, maxStepMs: 0, maxStepLabel: '', maxBuildingMs: 0, lastFrameBuildMs: 0 };
  private readonly api: WorldViewApi = {
    stats: () => this.stats(),
    liftAt: (x, z) => this.liftAt(x, z),
    pending: () => this.pending(),
    flush: (maxMs) => this.flush(maxMs ?? 1e9),
    whenIdle: () => this.whenIdle(),
  };

  constructor(options: WorldViewOptions = {}) {
    this.options = options;
    this.root.name = 'ville';
    this.map2d = new Map2d(() => this.currentData());
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide(WORLD_MAP2D_SERVICE, this.map2d);
    ctx.provide(WORLD_VIEW_SERVICE, this.api);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.unsub.push(ctx.events.on('world:tile_loaded', () => { this.dirty = true; }));
    this.unsub.push(ctx.events.on('world:tile_unloaded', (e) => { this.map2d.forgetTile(e.tx, e.tz); }));
    this.unsub.push(ctx.events.onAny('world:source', () => this.resetWorld()));
    this.unsub.push(ctx.events.on('settings:changed', (e) => { if (e.key === 'quality' || e.key === 'drawDistance') this.dirty = true; }));
  }

  reset(): void {
    // Début de session : la carte a pu changer ; les tuiles autour du nouveau départ seront construites à la demande.
    this.dirty = true;
  }

  private currentData(): WorldDataLike | null {
    const ctx = this.ctx;
    if (ctx === null) return null;
    const d = ctx.service<WorldDataLike>('world.data');
    return d !== undefined && d.manifest !== undefined && d.roadGraph !== undefined ? d : null;
  }

  // ─────────────────────────────── monde et ressources ───────────────────────────────

  /** Libère toutes les tuiles et ce qui dépend de la carte (changement de carte ou de qualité). */
  private resetWorld(): void {
    this.cancelActive();
    for (const slot of this.slotList) {
      if (slot.detail) slot.detail.dispose();
      if (slot.far) slot.far.dispose();
    }
    this.slots.clear();
    this.slotList.length = 0;
    this.queue.length = 0;
    if (this.horizon) this.horizon.dispose();
    this.horizon = null;
    this.city = null;
    this.manifest = null;
    this.graph = null;
    this.data = null;
    this.map2d.invalidate();
    this.providerCache = undefined;
    this.dirty = true;
  }

  private disposeShared(): void {
    if (this.shared) disposeSharedResources(this.shared);
    this.shared = null;
    disposeSharedBuildingResources();
    releaseTileScratch();
    releaseGroundScratch();
    releaseTinScratch();
  }

  /** Prépare (ou reprend) le contexte de construction pour la carte et la qualité courantes. Faux si rien à dessiner. */
  private ensureWorld(): boolean {
    const ctx = this.ctx;
    if (ctx === null || ctx.view === null) return false;
    const view = ctx.view;
    if (!this.attached) {
      view.world.add(this.root);
      this.attached = true;
    }
    const data = this.currentData();
    if (data === null || data.manifest.tiles.length === 0 && data.roadGraph.edges.length === 0) return false;
    if (view.quality !== this.quality || this.shared === null) {
      // Changement de qualité : tout est reconstruit avec les nouvelles ressources.
      this.resetWorld();
      this.disposeShared();
      this.quality = view.quality;
      const antialias = view.renderer.getContextAttributes()?.antialias === true;
      this.shared = createSharedResources(cityQuality(this.quality), antialias);
      // L'atlas des façades est peint ici, pendant le chargement, et non à la première tuile.
      if (this.options.buildings !== false) prepareSharedBuildingResources(this.quality);
    }
    if (this.manifest !== data.manifest || this.graph !== data.roadGraph || this.city === null) {
      if (this.manifest !== null) this.resetWorld();
      this.data = data;
      this.manifest = data.manifest;
      this.graph = data.roadGraph;
      const terrain = data.terrain;
      const monuments = (): MonumentsLike | undefined => ctx.service<MonumentsLike>('world.monuments') ?? ctx.service<MonumentsLike>('monuments');
      this.city = {
        shared: this.shared,
        quality: this.quality,
        renderer: view.renderer,
        graph: data.roadGraph,
        terrain,
        waterLevel: data.manifest.waterLevel,
        profile: new BridgeProfile(data.roadGraph, (x, z) => sampleTerrain(terrain, x, z)),
        edgeIndex: new EdgeIndex(data.roadGraph),
        seed: this.options.seed ?? 1,
        skipLandmark: (key) => {
          const m = monuments();
          return m !== undefined && m.has(key);
        },
        skipBridge: (edge) => {
          const m = monuments();
          return edge.landmarkKey !== '' && m !== undefined && m.has(edge.landmarkKey);
        },
        buildings: this.options.buildings !== false,
        root: this.root,
      };
      for (const info of data.manifest.tiles) {
        const slot: Slot = {
          tx: info.tx, tz: info.tz, key: `${info.tx}_${info.tz}`, info, want: 0, dist: Infinity, far: null, detail: null, fetched: null,
          fetching: false, fetchFailed: 0, painted: false,
        };
        this.slots.set(slot.key, slot);
        this.slotList.push(slot);
      }
      if (this.options.horizon !== false) {
        this.horizon = new Horizon(data.manifest, data.roadGraph, terrain, data.places);
        this.root.add(this.horizon.group);
      }
      this.dirty = true;
    }
    const q = this.shared.quality;
    cityUniforms.uFade.value.set(q.fadeNear, q.fadeFar);
    return true;
  }

  // ─────────────────────────────── niveaux de détail et file ───────────────────────────────

  private evaluate(camX: number, camZ: number): void {
    const ctx = this.ctx, data = this.data, shared = this.shared;
    if (ctx === null || ctx.view === null || data === null || shared === null) return;
    const params = { detailRadius: shared.quality.detailRadius, drawDistance: Math.max(shared.quality.detailRadius, ctx.view.drawDistance) };
    const jobs: BuildJob[] = [];
    for (let i = 0; i < this.slotList.length; i++) {
      const slot = this.slotList[i];
      const dist = tileDistance(slot.tx, slot.tz, camX, camZ);
      slot.dist = dist;
      const current: Lod = slot.detail !== null ? 2 : slot.far !== null ? 1 : 0;
      let want = wantedLod(dist, slot.want === 2 || current === 2 ? 2 : current, params);
      // Sans les données de la simulation, pas de version détaillée : la version lointaine en tient lieu.
      const loaded = data.tile(slot.tx, slot.tz);
      if (want === 2 && loaded === null && slot.detail === null) want = 1;
      slot.want = want;
      if (want === 0) {
        this.drop(slot);
        continue;
      }
      if (want === 2) {
        if (slot.detail === null) {
          // En attendant le détail : la version lointaine, vite construite.
          if (slot.far === null) jobs.push({ key: slot.key, tx: slot.tx, tz: slot.tz, lod: 1, dist });
          jobs.push({ key: slot.key, tx: slot.tx, tz: slot.tz, lod: 2, dist });
        }
        continue;
      }
      // want === 1
      if (slot.far === null) {
        if (loaded !== null || slot.fetched !== null) jobs.push({ key: slot.key, tx: slot.tx, tz: slot.tz, lod: 1, dist });
        else this.fetchFar(slot);
      } else if (slot.detail !== null && slot.far.ready) {
        // Redescente : la version lointaine est prête, le détail est libéré.
        this.releaseDetail(slot);
      }
    }
    // Le travail en cours reste en tête s'il est encore voulu ; sinon il est abandonné.
    const act = this.active;
    if (act !== null && (act.slot.want === 0 || (act.lod === 2 && act.slot.want !== 2))) this.cancelActive();
    this.queue = sortJobs(jobs.filter((j) => !(this.active !== null && this.active.slot.key === j.key && this.active.lod === j.lod)));
  }

  private drop(slot: Slot): void {
    if (this.active !== null && this.active.slot === slot) this.cancelActive();
    if (slot.detail) {
      slot.detail.dispose();
      slot.detail = null;
    }
    if (slot.far) {
      slot.far.dispose();
      slot.far = null;
    }
    slot.fetched = null;
    if (this.horizon) this.horizon.setTileHidden(slot.tx, slot.tz, false);
  }

  private releaseDetail(slot: Slot): void {
    if (slot.detail === null) return;
    slot.detail.dispose();
    slot.detail = null;
  }

  private cancelActive(): void {
    const act = this.active;
    if (act === null) return;
    this.active = null;
    act.view.dispose();
    if (act.lod === 2 && act.slot.far) act.slot.far.showAll();
    if (act.lod === 2 && act.slot.detail === act.view) act.slot.detail = null;
    if (act.lod === 1 && act.slot.far === act.view) act.slot.far = null;
    this.dirty = true;
  }

  private fetchFar(slot: Slot): void {
    if (slot.fetching || slot.fetchFailed >= 2 || this.fetchCount >= 3) return;
    const provider = this.farProvider();
    if (provider === null) return;
    slot.fetching = true;
    this.fetchCount++;
    const manifest = this.manifest;
    provider(slot.tx, slot.tz, slot.info.file).then(
      (tile) => {
        this.fetchCount--;
        slot.fetching = false;
        if (manifest !== this.manifest) return; // la carte a changé entre-temps
        if (tile === null) slot.fetchFailed++;
        else if (slot.want >= 1) slot.fetched = tile;
        this.dirty = true;
      },
      (err: unknown) => {
        this.fetchCount--;
        slot.fetching = false;
        slot.fetchFailed++;
        console.warn(`[world:view] tuile lointaine ${slot.key} illisible`, err);
        this.dirty = true;
      },
    );
  }

  private providerCache: FarTileProvider | null | undefined;

  private farProvider(): FarTileProvider | null {
    if (this.options.farTiles !== undefined) return this.options.farTiles;
    if (this.providerCache !== undefined) return this.providerCache;
    // Par défaut : les fichiers de la carte de Paris, lus directement (aucune collision n'est construite pour eux).
    if (this.manifest === null || this.manifest.name !== 'paris' || typeof fetch !== 'function') return null;
    const base = this.options.baseUrl ?? './data/paris/';
    this.providerCache = async (_tx, _tz, file) => {
      const r = await fetch(base + file);
      if (!r.ok) return null;
      return decodeTile((await r.json()) as RawTile);
    };
    return this.providerCache;
  }

  private startNext(): boolean {
    const city = this.city, data = this.data;
    if (city === null || data === null) return false;
    while (this.queue.length > 0) {
      const job = this.queue.shift() as BuildJob;
      const slot = this.slots.get(job.key);
      if (slot === undefined || slot.want === 0) continue;
      const loaded = data.tile(slot.tx, slot.tz);
      if (job.lod === 2) {
        if (slot.detail !== null || slot.want !== 2 || loaded === null) continue;
        const view = new DetailTile(city, loaded);
        view.onGroundShown = () => {
          if (slot.far) slot.far.hideGround();
          if (this.horizon) this.horizon.setTileHidden(slot.tx, slot.tz, true);
        };
        view.onBuildingsShown = () => {
          if (slot.far) {
            slot.far.dispose();
            slot.far = null;
          }
        };
        slot.detail = view;
        this.root.add(view.group);
        this.active = { slot, lod: 2, work: view.build(), view, spent: { maxStepMs: 0, secondStepMs: 0, totalMs: 0, maxLabel: '', secondLabel: '' } };
        return true;
      }
      if (slot.far !== null) continue;
      const tile = loaded ?? slot.fetched;
      if (tile === null) continue;
      const view = new FarTile(city, tile);
      slot.far = view;
      slot.fetched = null;
      if (!slot.painted && this.horizon) {
        // Le socle garde le souvenir des couleurs de la tuile (grille grossière, quelques millisecondes).
        const raster = rasterizeTile(createRaster(tile.tx, tile.tz, 128), tile, city.graph, tile.roadEdges);
        this.horizon.paintTile(tile.tx, tile.tz, bakeMacro(raster, 64, undefined, city.shared.palette), 64);
        slot.painted = true;
      }
      this.root.add(view.group);
      this.active = { slot, lod: 1, work: view.build(), view, spent: { maxStepMs: 0, secondStepMs: 0, totalMs: 0, maxLabel: '', secondLabel: '' } };
      return true;
    }
    return false;
  }

  /** Avance la construction pendant `budgetMs` au plus. `ignoreFrames` : ne pas attendre l'image suivante (chargement). */
  private work(budgetMs: number, ignoreFrames: boolean): void {
    const t0 = now();
    for (;;) {
      if (this.active === null && !this.startNext()) break;
      const act = this.active as ActiveJob;
      const left = budgetMs - (now() - t0);
      const view = act.view;
      const result = runSlice(act.work, Math.max(0, left), now, act.spent, () => view.phase);
      if (result === 'done') {
        this.finish(act);
        this.active = null;
        if (now() - t0 >= budgetMs) break;
        continue;
      }
      if (result === 'frame' && ignoreFrames && now() - t0 < budgetMs) continue;
      break;
    }
    this.counters.lastFrameBuildMs = now() - t0;
  }

  private finish(act: ActiveJob): void {
    const c = this.counters;
    const building = act.view.stats.buildingMs;
    act.view.stats.buildMs = act.spent.totalMs - building;
    if (act.lod === 2) c.lastDetailMs = act.view.stats.buildMs;
    else c.lastFarMs = act.view.stats.buildMs;
    if (building > c.maxBuildingMs) c.maxBuildingMs = building;
    // La plus longue étape hors immeubles : celle des immeubles (indivisible, seule dans son image) est comptée à part.
    const first = !(building > 0 && act.spent.maxLabel === 'immeubles');
    const step = first ? act.spent.maxStepMs : act.spent.secondStepMs;
    act.view.stats.maxStepMs = step;
    if (step > c.maxStepMs) {
      c.maxStepMs = step;
      c.maxStepLabel = `${act.lod === 2 ? 'détail' : 'lointain'} ${act.slot.key} : ${first ? act.spent.maxLabel : act.spent.secondLabel}`;
    }
    if (act.lod === 1 && this.horizon) this.horizon.setTileHidden(act.slot.tx, act.slot.tz, true);
    this.dirty = true;
  }

  // ─────────────────────────────── boucle ───────────────────────────────

  frame(dt: number): void {
    const ctx = this.ctx;
    if (ctx === null || ctx.view === null) return;
    if (!this.ensureWorld()) return;
    const view = ctx.view;
    this.time += dt;
    const env = ctx.env && ctx.env.state ? ctx.env.state : NEUTRAL_ENV;
    updateCityUniforms(env, this.time);
    const shared = this.shared as SharedResources;
    shared.halo.opacity = env.streetLights ? 0.3 * (1 + 0.7 * env.wetness) : 0;
    const camX = view.camX, camY = view.camY, camZ = view.camZ;
    this.evalTimer -= dt;
    if (this.dirty || this.evalTimer <= 0 || Math.abs(camX - this.evalX) > 16 || Math.abs(camZ - this.evalZ) > 16) {
      this.dirty = false;
      this.evalTimer = 0.5;
      this.evalX = camX;
      this.evalZ = camZ;
      this.evaluate(camX, camZ);
    }
    this.work(shared.quality.budgetMs, false);
    for (let i = 0; i < this.slotList.length; i++) {
      const slot = this.slotList[i];
      if (slot.detail) slot.detail.update(env, camX, camY, camZ);
      if (slot.far) slot.far.update(env, camX, camY, camZ);
    }
    if (this.horizon) this.horizon.update(env.daylight, camY - sampleTerrain((this.data as WorldDataLike).terrain, camX, camZ));
    if (this.idleWaiters.length > 0 && this.pending() === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
  }

  private pending(): number {
    return this.queue.length + (this.active !== null ? 1 : 0) + this.fetchCount + (this.dirty ? 1 : 0);
  }

  private flush(maxMs: number): boolean {
    const ctx = this.ctx;
    if (ctx === null || ctx.view === null || !this.ensureWorld()) return true;
    const t0 = now();
    for (let guard = 0; guard < 10000; guard++) {
      this.dirty = false;
      this.evaluate(ctx.view.camX, ctx.view.camZ);
      this.evalX = ctx.view.camX;
      this.evalZ = ctx.view.camZ;
      if (this.queue.length === 0 && this.active === null) break;
      this.work(Math.max(1, maxMs - (now() - t0)), true);
      if (now() - t0 >= maxMs) break;
    }
    return this.queue.length === 0 && this.active === null && this.fetchCount === 0;
  }

  private whenIdle(): Promise<void> {
    if (this.pending() === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private liftAt(x: number, z: number): number {
    const slot = this.slots.get(`${Math.floor(x / TILE_SIZE)}_${Math.floor(z / TILE_SIZE)}`);
    return slot !== undefined && slot.detail !== null ? slot.detail.liftAt(x, z) : 0;
  }

  private stats(): WorldViewStats {
    const s: WorldViewStats = {
      quality: this.quality, detailTiles: 0, farTiles: 0, queued: this.queue.length + (this.active ? 1 : 0), fetching: this.fetchCount,
      triangles: 0, drawCalls: 0, buildingTriangles: 0, buildingDrawCalls: 0, maxDetailDrawCalls: 0, tileGpuBytes: 0,
      sharedGpuBytes: this.shared ? this.shared.textureBytes * 1.33 : 0, lastDetailMs: this.counters.lastDetailMs, lastFarMs: this.counters.lastFarMs,
      maxStepMs: this.counters.maxStepMs, maxStepLabel: this.counters.maxStepLabel, maxBuildingMs: this.counters.maxBuildingMs, lastFrameBuildMs: this.counters.lastFrameBuildMs,
      paintMs: this.shared ? this.shared.paintMs : 0,
    };
    for (const slot of this.slotList) {
      for (const v of [slot.detail, slot.far]) {
        if (v === null) continue;
        s.triangles += v.stats.triangles;
        s.drawCalls += v.stats.drawCalls;
        s.buildingTriangles += v.stats.buildingTriangles;
        s.buildingDrawCalls += v.stats.buildingDrawCalls;
        s.tileGpuBytes += v.stats.gpuBytes;
      }
      if (slot.detail !== null && slot.detail.ready) {
        s.detailTiles++;
        if (slot.detail.stats.drawCalls > s.maxDetailDrawCalls) s.maxDetailDrawCalls = slot.detail.stats.drawCalls;
      } else if (slot.far !== null && slot.far.ready) s.farTiles++;
    }
    if (this.horizon) {
      s.triangles += this.horizon.stats.triangles;
      s.drawCalls += this.horizon.stats.drawCalls;
      s.sharedGpuBytes += this.horizon.stats.textureBytes * 1.33;
    }
    return s;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    this.resetWorld();
    this.disposeShared();
    this.root.removeFromParent();
    this.attached = false;
  }
}
