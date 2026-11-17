/* =====================================================================================
 * Magasin de tuiles : chargement asynchrone autour du centre d'intérêt, décodage,
 * conservation dans un rayon et déchargement au-delà (hystérésis).
 *
 *   - une tuile est demandée dès qu'elle est à moins de `loadRadius` du centre d'intérêt ;
 *   - elle n'est déchargée qu'au-delà de `unloadRadius` : on peut aller et venir autour d'une
 *     limite sans recharger sans cesse ;
 *   - la distance est celle du point au rectangle de la tuile (0 si le point est dedans) ;
 *   - au plus MAX_PARALLEL lectures à la fois, les plus proches d'abord ;
 *   - une tuile qui ne se charge pas (fichier absent, JSON invalide) est marquée « failed » : elle
 *     ne bloque pas whenLoaded et sera retentée (MAX_ATTEMPTS fois au plus).
 * ===================================================================================== */

import type { MapFurnitureInfo, MapShopInfo } from '@/core/contracts';
import { TILE_SIZE, decodeTile, tileKey } from '../mapdata';
import type { Manifest, ManifestTile, Tile } from '../mapdata';
import type { MapSource } from './api';
import type { CollisionBucket } from './collision';
import type { TileGrid } from './raster';

export const DEFAULT_LOAD_RADIUS = 700;
export const DEFAULT_UNLOAD_RADIUS = 1100;
const MAX_PARALLEL = 4;
const MAX_ATTEMPTS = 3;
/** Déplacement du centre d'intérêt (m) en deçà duquel on ne réévalue pas les tuiles. */
const FOCUS_STEP = 8;

export type TileState = 'idle' | 'queued' | 'loading' | 'loaded' | 'failed';

export interface TileEntry {
  readonly tx: number;
  readonly tz: number;
  readonly key: string;
  readonly info: ManifestTile;
  state: TileState;
  tile: Tile | null;
  /** Obstacles de la tuile (construits au chargement). */
  bucket: CollisionBucket | null;
  /** Grille de surfaces (construite à la première demande). */
  grid: TileGrid | null;
  shops: MapShopInfo[];
  furniture: MapFurnitureInfo[];
  attempts: number;
  /** Promesse de fin de chargement en cours (résolue aussi en cas d'échec). */
  settled: Promise<void> | null;
  settle: (() => void) | null;
}

/** Ce que le magasin demande à son hôte (le monde). */
export interface TileHost {
  /** La tuile vient d'être décodée : construire ses données dérivées (obstacles). */
  tileDecoded(entry: TileEntry): void;
  /** La tuile est prête : émettre world:tile_loaded. */
  tileLoaded(entry: TileEntry): void;
  /** La tuile va être déchargée : retirer ses obstacles, émettre world:tile_unloaded. */
  tileUnloaded(entry: TileEntry): void;
  /** Cède la main entre deux étapes lourdes (navigateur) ; immédiat en mode headless. */
  pause(): Promise<void>;
  /**
   * Chargement synchrone voulu (headless) : si la source sait lire une tuile sans attendre (MapSource.tileSync), chaque
   * tuile demandée est chargée sur-le-champ, dans l'ordre des demandes (les plus proches d'abord). Rien ne dépend alors
   * de l'horloge ni de la vitesse du disque : même graine → même déroulement.
   */
  syncLoads?(): boolean;
  addDecodeTime(ms: number): void;
}

const NO_SHOPS: MapShopInfo[] = [];
const NO_FURNITURE: MapFurnitureInfo[] = [];

const clock: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now();

export class TileStore {
  private readonly source: MapSource;
  private readonly host: TileHost;
  readonly loadRadius: number;
  readonly unloadRadius: number;
  /** Toutes les tuiles du manifeste. */
  readonly entries: TileEntry[] = [];
  // Index dense (tx, tz) → tuile.
  private readonly tx0: number;
  private readonly tz0: number;
  private readonly nx: number;
  private readonly nz: number;
  private readonly grid: (TileEntry | null)[];
  private readonly loaded: string[] = [];
  private readonly queue: TileEntry[] = [];
  private active = 0;
  /** Incrémenté par unloadAll/dispose : les lectures en vol d'une époque passée sont abandonnées. */
  private epoch = 0;
  private focusX = NaN;
  private focusZ = NaN;
  private evalX = NaN;
  private evalZ = NaN;
  loadingCount = 0;
  failedCount = 0;

  constructor(source: MapSource, manifest: Manifest, host: TileHost, loadRadius: number, unloadRadius: number) {
    this.source = source;
    this.host = host;
    this.loadRadius = loadRadius;
    this.unloadRadius = Math.max(unloadRadius, loadRadius + TILE_SIZE / 2);
    let tx0 = Infinity, tz0 = Infinity, tx1 = -Infinity, tz1 = -Infinity;
    for (const t of manifest.tiles) {
      if (t.tx < tx0) tx0 = t.tx;
      if (t.tx > tx1) tx1 = t.tx;
      if (t.tz < tz0) tz0 = t.tz;
      if (t.tz > tz1) tz1 = t.tz;
    }
    if (manifest.tiles.length === 0) {
      tx0 = 0;
      tz0 = 0;
      tx1 = -1;
      tz1 = -1;
    }
    this.tx0 = tx0;
    this.tz0 = tz0;
    this.nx = tx1 - tx0 + 1;
    this.nz = tz1 - tz0 + 1;
    this.grid = new Array<TileEntry | null>(Math.max(0, this.nx * this.nz)).fill(null);
    for (const info of manifest.tiles) {
      const entry: TileEntry = {
        tx: info.tx, tz: info.tz, key: tileKey(info.tx, info.tz), info, state: 'idle', tile: null, bucket: null, grid: null,
        shops: NO_SHOPS, furniture: NO_FURNITURE, attempts: 0, settled: null, settle: null,
      };
      this.entries.push(entry);
      this.grid[(info.tz - tz0) * this.nx + (info.tx - tx0)] = entry;
    }
  }

  /** Tuile (tx, tz) du manifeste, ou null. Aucune allocation. */
  entry(tx: number, tz: number): TileEntry | null {
    const i = tx - this.tx0, j = tz - this.tz0;
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
    return this.grid[j * this.nx + i];
  }

  /** Tuile qui contient le point, ou null. Aucune allocation. */
  entryAt(x: number, z: number): TileEntry | null {
    return this.entry(Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE));
  }

  loadedKeys(): readonly string[] {
    return this.loaded;
  }

  get loadedCount(): number {
    return this.loaded.length;
  }

  private distance(e: TileEntry, x: number, z: number): number {
    const minX = e.tx * TILE_SIZE, minZ = e.tz * TILE_SIZE;
    const dx = x < minX ? minX - x : x > minX + TILE_SIZE ? x - minX - TILE_SIZE : 0;
    const dz = z < minZ ? minZ - z : z > minZ + TILE_SIZE ? z - minZ - TILE_SIZE : 0;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Centre d'intérêt : charge autour, décharge au loin. Sans effet si le point a peu bougé. */
  setFocus(x: number, z: number, force = false): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.focusX = x;
    this.focusZ = z;
    if (!force && Math.abs(x - this.evalX) < FOCUS_STEP && Math.abs(z - this.evalZ) < FOCUS_STEP) return;
    this.evalX = x;
    this.evalZ = z;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const d = this.distance(e, x, z);
      if (d <= this.loadRadius) {
        if (e.state === 'idle' || (e.state === 'failed' && e.attempts < MAX_ATTEMPTS)) this.request(e);
      } else if (d > this.unloadRadius) {
        if (e.state === 'loaded') this.unload(e);
        else if (e.state === 'queued') this.dequeue(e);
      }
    }
    this.pump();
  }

  /** Les données détaillées sont-elles chargées en ce point ? (true hors de la carte : rien à charger) */
  isLoaded(x: number, z: number): boolean {
    const e = this.entryAt(x, z);
    return e === null || e.state === 'loaded';
  }

  /** Promesse résolue quand toutes les tuiles à moins de `radius` du point sont prêtes (ou en échec). */
  whenLoaded(x: number, z: number, radius: number): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const e of this.entries) {
      if (this.distance(e, x, z) > radius) continue;
      if (e.state === 'loaded') continue;
      if (e.state === 'failed' && e.attempts >= MAX_ATTEMPTS) continue;
      if (e.state === 'idle' || e.state === 'failed') this.request(e);
      if (e.settled !== null) waits.push(e.settled);
    }
    this.pump();
    if (waits.length === 0) return Promise.resolve();
    return Promise.all(waits).then(() => undefined);
  }

  private request(e: TileEntry): void {
    if (e.state === 'failed') this.failedCount--;
    e.state = 'queued';
    e.settled = new Promise<void>((resolve) => {
      e.settle = resolve;
    });
    this.queue.push(e);
    this.loadingCount++;
  }

  private dequeue(e: TileEntry): void {
    const i = this.queue.indexOf(e);
    if (i >= 0) this.queue.splice(i, 1);
    e.state = 'idle';
    this.loadingCount--;
    this.finish(e);
  }

  private finish(e: TileEntry): void {
    const settle = e.settle;
    e.settle = null;
    e.settled = null;
    if (settle !== null) settle();
  }

  /** Lance des lectures tant qu'il reste de la place, les tuiles les plus proches d'abord. */
  private pump(): void {
    if (this.source.tileSync !== undefined && this.host.syncLoads !== undefined && this.host.syncLoads()) {
      this.pumpSync();
      return;
    }
    while (this.active < MAX_PARALLEL && this.queue.length > 0) {
      const best = this.nextIndex();
      const e = this.queue[best];
      this.queue.splice(best, 1);
      e.state = 'loading';
      e.attempts++;
      this.active++;
      void this.load(e, this.epoch);
    }
  }

  /** Indice dans la file de la tuile à lire d'abord (la plus proche du centre d'intérêt ; à défaut, la plus ancienne). */
  private nextIndex(): number {
    let best = 0;
    if (Number.isFinite(this.focusX)) {
      let bestD = Infinity;
      for (let i = 0; i < this.queue.length; i++) {
        const d = this.distance(this.queue[i], this.focusX, this.focusZ);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  /** Vrai pendant un chargement synchrone : une demande faite par un abonné de world:tile_loaded rejoint la boucle en cours. */
  private pumping = false;

  /** Chargement synchrone de toute la file (headless), les plus proches d'abord. */
  private pumpSync(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const best = this.nextIndex();
        const e = this.queue[best];
        this.queue.splice(best, 1);
        e.state = 'loading';
        e.attempts++;
        this.loadSync(e, this.epoch);
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Même chose que load(), sans attente (source synchrone). */
  private loadSync(e: TileEntry, epoch: number): void {
    let ok = false;
    this.active++;
    try {
      const t0 = clock();
      const tile = decodeTile(this.source.tileSync!(e.info));
      if (tile.tx !== e.tx || tile.tz !== e.tz) throw new Error(`le fichier contient la tuile ${tile.tx}_${tile.tz}`);
      const shops: MapShopInfo[] = [];
      for (let i = 0; i < tile.shops.length; i++) {
        const s = tile.shops[i];
        shops.push({ index: i, x: s.x, z: s.z, heading: s.heading, width: s.width, category: s.category });
      }
      const furniture: MapFurnitureInfo[] = [];
      for (let i = 0; i < tile.furniture.length; i++) {
        const f = tile.furniture[i];
        furniture.push({ index: i, kind: f.kind, x: f.x, z: f.z, heading: f.heading });
      }
      this.host.addDecodeTime(clock() - t0);
      e.tile = tile;
      e.shops = shops;
      e.furniture = furniture;
      this.host.tileDecoded(e);
      ok = true;
    } catch (err) {
      if (epoch === this.epoch) console.error(`[world] tuile ${e.key} illisible (${this.source.label})`, err);
    }
    if (epoch !== this.epoch) return; // tout a été déchargé entre-temps (unloadAll remet les compteurs à zéro)
    this.active--;
    this.loadingCount--;
    if (ok) {
      e.state = 'loaded';
      this.loaded.push(e.key);
      try {
        this.host.tileLoaded(e);
      } catch (err) {
        console.error(`[world] un abonné de world:tile_loaded a échoué (tuile ${e.key})`, err);
      }
    } else {
      e.state = 'failed';
      e.tile = null;
      e.bucket = null;
      this.failedCount++;
    }
    this.finish(e);
  }

  private async load(e: TileEntry, epoch: number): Promise<void> {
    let ok = false;
    try {
      const raw = await this.source.tile(e.info);
      if (epoch !== this.epoch) return;
      await this.host.pause();
      if (epoch !== this.epoch) return;
      const t0 = clock();
      const tile = decodeTile(raw);
      if (tile.tx !== e.tx || tile.tz !== e.tz) throw new Error(`le fichier contient la tuile ${tile.tx}_${tile.tz}`);
      const shops: MapShopInfo[] = [];
      for (let i = 0; i < tile.shops.length; i++) {
        const s = tile.shops[i];
        shops.push({ index: i, x: s.x, z: s.z, heading: s.heading, width: s.width, category: s.category });
      }
      const furniture: MapFurnitureInfo[] = [];
      for (let i = 0; i < tile.furniture.length; i++) {
        const f = tile.furniture[i];
        furniture.push({ index: i, kind: f.kind, x: f.x, z: f.z, heading: f.heading });
      }
      this.host.addDecodeTime(clock() - t0);
      await this.host.pause();
      if (epoch !== this.epoch) return;
      e.tile = tile;
      e.shops = shops;
      e.furniture = furniture;
      this.host.tileDecoded(e);
      ok = true;
    } catch (err) {
      if (epoch === this.epoch) console.error(`[world] tuile ${e.key} illisible (${this.source.label})`, err);
    } finally {
      if (epoch === this.epoch) {
        this.active--;
        this.loadingCount--;
        if (ok) {
          e.state = 'loaded';
          this.loaded.push(e.key);
        } else {
          e.state = 'failed';
          e.tile = null;
          e.bucket = null;
          this.failedCount++;
        }
      }
    }
    if (epoch !== this.epoch) return;
    if (ok) {
      try {
        this.host.tileLoaded(e);
      } catch (err) {
        console.error(`[world] un abonné de world:tile_loaded a échoué (tuile ${e.key})`, err);
      }
    }
    this.finish(e);
    this.pump();
  }

  private unload(e: TileEntry): void {
    try {
      this.host.tileUnloaded(e);
    } catch (err) {
      console.error(`[world] déchargement de la tuile ${e.key}`, err);
    }
    e.state = 'idle';
    e.tile = null;
    e.bucket = null;
    e.grid = null;
    e.shops = NO_SHOPS;
    e.furniture = NO_FURNITURE;
    e.attempts = 0;
    const i = this.loaded.indexOf(e.key);
    if (i >= 0) {
      this.loaded[i] = this.loaded[this.loaded.length - 1];
      this.loaded.pop();
    }
  }

  /** Décharge tout et abandonne les lectures en cours (changement de jeu de données, fin). */
  unloadAll(): void {
    this.epoch++;
    for (const e of this.entries) {
      if (e.state === 'loaded') this.unload(e);
      e.state = 'idle';
      e.attempts = 0;
      this.finish(e);
    }
    this.queue.length = 0;
    this.active = 0;
    this.loadingCount = 0;
    this.failedCount = 0;
    this.evalX = NaN;
    this.evalZ = NaN;
  }
}
