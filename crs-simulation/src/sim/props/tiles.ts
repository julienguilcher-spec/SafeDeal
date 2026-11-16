/* =====================================================================================
 * DÉCOR DYNAMIQUE — peuplement depuis la carte, tuile par tuile.
 *
 *   - world:tile_loaded : les vitrines de ctx.world.shopsInTile deviennent des boutiques (enseigne
 *     fictive, stock, attrait, rideau), le mobilier de ctx.world.furnitureInTile des objets du jeu ;
 *   - mobilier d'ambiance, quand la carte en manque : vélos aux stations et aux arceaux, chaises autour
 *     des tables, terrasses devant les cafés-restaurants, corbeilles, bacs roulants sortis, trottinettes
 *     et vélos stationnés, palettes devant les commerces alimentaires, petits chantiers (grilles,
 *     palettes, cônes, tas de pavés). Chaque emplacement est vérifié (trottoir ou place, libre, sans
 *     chevauchement). Rien n'est ajouté dans une tuile vide (monde neutre des tests) ;
 *   - tirages : générateur propre à la tuile, dérivé de la graine de session — même graine, même rue ;
 *   - en cours de partie le peuplement est étalé (réglage populateBudget, objets par pas) ; hors
 *     partie (chargement, menu) il est fait d'un coup ;
 *   - world:tile_unloaded : objets et vitrines de la tuile sont retirés ; ce qui avait changé
 *     (déplacé, cassé, brûlé, pillé, enlevé) est mémorisé et retrouvé au rechargement.
 * ===================================================================================== */

import type { MapFurnitureInfo, MapShopInfo, PropKind, PropState, Rng, Vec2, WindowState } from '@/core/contracts';
import { distSqPointObb } from '@/core/math';
import { mapFurnitureKind, propDef } from './defs';
import type { Mod } from './mod';
import { tileKey } from './shared';
import type { PropObj, ShopObj } from './shared';

/**
 * Numéros d'ordre dans une tuile : les objets de la carte gardent leur index ; les objets d'ambiance
 * reçoivent un numéro déduit de l'élément de carte qui les fait naître.
 */
const COMPANION_SERIAL = 1_000_000;
const SHOP_SERIAL = 20_000_000;
const SHOP_BLOCK = 48;
const SITE_SERIAL = 900_000_000;
/** Nombre maximal d'objets d'ambiance par tuile. */
const MAX_EXTRAS = 320;

interface PropSnap {
  x: number; z: number; heading: number; halfX: number; halfZ: number; height: number;
  hp: number; state: PropState; toppled: boolean; fuel: number; tags: number; glass: number; panes: number;
  yieldLeft: number; blocksMove: boolean; blocksSight: boolean; moved: boolean;
}

interface ShopSnap {
  window: WindowState; shutter: number; stock: number; glass: number; boards: number; tags: number;
  forced: boolean; shutterHp: number; burnt: boolean; fuel: number; abandoned: boolean; target: number;
}

interface TileMemory {
  props: Map<number, PropSnap>;
  removed: Set<number>;
  shops: Map<number, ShopSnap>;
}

interface Job {
  stage: number;
  index: number;
  rng: Rng;
  extras: number;
}

interface TileRec {
  key: number;
  tx: number;
  tz: number;
  props: PropObj[];
  shops: ShopObj[];
  removed: Set<number>;
  job: Job | null;
  /** La tuile avait du contenu cartographique. */
  filled: boolean;
}

export class Tiles {
  private readonly tiles = new Map<number, TileRec>();
  private readonly memory = new Map<number, TileMemory>();
  private readonly queue: TileRec[] = [];
  private readonly spot: Vec2 = { x: 0, z: 0 };
  private readonly buf: PropObj[] = [];
  /** Tuile en cours de déchargement : ses retraits ne sont pas des enlèvements volontaires. */
  private unloading: TileRec | null = null;
  private readonly rand = (): number => this.randRng.next();
  private randRng!: Rng;

  constructor(private readonly m: Mod) {}

  get tileCount(): number {
    return this.tiles.size;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Début de session ou clear() : on oublie tout (les objets sont déjà retirés par le magasin). */
  reset(forgetMemory: boolean): void {
    this.tiles.clear();
    this.queue.length = 0;
    this.unloading = null;
    if (forgetMemory) this.memory.clear();
  }

  // ───────────────────────────── cycle des tuiles ─────────────────────────────

  onLoaded(tx: number, tz: number): void {
    const key = tileKey(tx, tz);
    if (this.tiles.has(key)) return;
    const k = this.m.k;
    const rec: TileRec = {
      key, tx, tz, props: [], shops: [], removed: new Set(), filled: false,
      job: { stage: 0, index: 0, rng: k.ctx.rng.fork(`props:tuile:${tx}:${tz}`), extras: 0 },
    };
    this.tiles.set(key, rec);
    this.queue.push(rec);
    // hors partie (chargement, menu), rien ne presse : tout de suite et d'un coup
    if (k.ctx.session.phase !== 'playing') this.flush();
  }

  onUnloaded(tx: number, tz: number): void {
    const key = tileKey(tx, tz);
    const rec = this.tiles.get(key);
    if (!rec) return;
    const m = this.m;
    const qi = this.queue.indexOf(rec);
    if (qi >= 0) this.queue.splice(qi, 1);
    // un peuplement interrompu n'a rien à mémoriser de fiable : la mémoire précédente reste valable
    const complete = rec.job === null;
    const mem: TileMemory = { props: new Map(), removed: rec.removed, shops: new Map() };
    this.unloading = rec;
    const props = rec.props;
    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i]!;
      if (p.slot < 0) continue;
      if (complete && p.dirty) mem.props.set(p.serial, this.snapProp(p));
      m.store.remove(p);
    }
    const shops = rec.shops;
    for (let i = shops.length - 1; i >= 0; i--) {
      const s = shops[i]!;
      if (s.slot < 0) continue;
      if (complete && s.dirty) mem.shops.set(s.serial, this.snapShop(s));
      m.store.removeShop(s);
    }
    this.unloading = null;
    this.tiles.delete(key);
    if (complete && (mem.props.size > 0 || mem.removed.size > 0 || mem.shops.size > 0)) this.memory.set(key, mem);
  }

  /** Un objet va disparaître du magasin : s'il venait d'une tuile, on s'en souvient. */
  noteRemoved(p: PropObj): void {
    if (p.tile < 0) return;
    const rec = this.tiles.get(p.tile);
    if (!rec || rec === this.unloading) return;
    rec.removed.add(p.serial);
    const i = rec.props.indexOf(p);
    if (i >= 0) {
      rec.props[i] = rec.props[rec.props.length - 1]!;
      rec.props.pop();
    }
  }

  noteShopRemoved(s: ShopObj): void {
    if (s.tile < 0) return;
    const rec = this.tiles.get(s.tile);
    if (!rec || rec === this.unloading) return;
    const i = rec.shops.indexOf(s);
    if (i >= 0) {
      rec.shops[i] = rec.shops[rec.shops.length - 1]!;
      rec.shops.pop();
    }
  }

  /** Peuple les tuiles déjà chargées que nous n'avons pas vues arriver (début de session). */
  syncAll(): void {
    const world = this.m.k.ctx.world;
    const b = world.bounds;
    const ts = world.tileSize;
    if (!(ts > 0) || !Number.isFinite(b.minX) || !Number.isFinite(b.maxX) || !Number.isFinite(b.minZ) || !Number.isFinite(b.maxZ)) return;
    const x0 = Math.floor(b.minX / ts);
    const x1 = Math.floor(b.maxX / ts);
    const z0 = Math.floor(b.minZ / ts);
    const z1 = Math.floor(b.maxZ / ts);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) return;
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tiles.has(tileKey(tx, tz))) continue;
        if (world.furnitureInTile(tx, tz).length > 0 || world.shopsInTile(tx, tz).length > 0) this.onLoaded(tx, tz);
      }
    }
    this.flush();
  }

  /** Termine tout de suite le peuplement en attente. */
  flush(): void {
    while (this.queue.length > 0) this.run(Infinity);
  }

  /** Avance le peuplement en attente d'au plus `budget` éléments de carte. */
  run(budget: number): void {
    const queue = this.queue;
    while (queue.length > 0 && budget > 0) {
      const rec = queue[0]!;
      budget = this.step(rec, budget);
      if (rec.job === null) queue.shift();
    }
  }

  /** (Re)peuple une tuile sur demande ; retourne le nombre d'objets créés. */
  populate(tx: number, tz: number): number {
    const before = this.m.store.list.length;
    this.onUnloaded(tx, tz);
    this.onLoaded(tx, tz);
    this.flush();
    return this.m.store.list.length - before;
  }

  // ───────────────────────────── peuplement ─────────────────────────────

  private step(rec: TileRec, budget: number): number {
    const job = rec.job!;
    const m = this.m;
    const world = m.k.ctx.world;
    const shopsInfo = world.shopsInTile(rec.tx, rec.tz);
    const furniture = world.furnitureInTile(rec.tx, rec.tz);
    this.randRng = job.rng;
    const density = m.k.tuning.ambientDensity;

    if (job.stage === 0) {
      while (job.index < shopsInfo.length && budget > 0) {
        this.addShop(rec, shopsInfo[job.index]!, job.rng);
        job.index++;
        budget--;
      }
      if (job.index >= shopsInfo.length) this.next(job);
    }
    if (job.stage === 1 && budget > 0) {
      while (job.index < furniture.length && budget > 0) {
        this.addFurniture(rec, furniture[job.index]!, job, density);
        job.index++;
        budget--;
      }
      if (job.index >= furniture.length) this.next(job);
    }
    rec.filled = shopsInfo.length > 0 || furniture.length > 0;
    if (job.stage === 2 && budget > 0) {
      // mobilier d'ambiance devant les commerces
      if (!rec.filled || !(density > 0)) this.next(job);
      else {
        while (job.index < rec.shops.length && budget > 0) {
          if (job.extras < MAX_EXTRAS) this.dressShop(rec, rec.shops[job.index]!, job, density);
          job.index++;
          budget--;
        }
        if (job.index >= rec.shops.length) this.next(job);
      }
    }
    if (job.stage === 3 && budget > 0) {
      if (rec.filled && density > 0) {
        const sites = Math.round(density * job.rng.int(1, 4));
        for (let i = 0; i < sites && job.extras < MAX_EXTRAS; i++) this.addWorksite(rec, job, i);
        budget -= sites;
      }
      this.next(job);
    }
    if (job.stage === 4) {
      this.applyMemory(rec);
      rec.job = null;
    }
    return budget;
  }

  private next(job: Job): void {
    job.stage++;
    job.index = 0;
  }

  private addShop(rec: TileRec, info: MapShopInfo, rng: Rng): void {
    const s = this.m.shops.add({ category: info.category, x: info.x, z: info.z, heading: info.heading, width: info.width }, rng);
    s.tile = rec.key;
    s.serial = info.index;
    rec.shops.push(s);
  }

  /** Crée un objet de la tuile courante, sans contrôle d'emplacement. */
  private spawn(rec: TileRec, kind: PropKind, x: number, z: number, heading: number, serial: number): PropObj {
    const p = this.m.store.create(kind, x, z, heading);
    p.tile = rec.key;
    p.serial = serial;
    rec.props.push(p);
    return p;
  }

  /** Emplacement convenable pour du mobilier de trottoir : sol piéton, libre, sans objet déjà là. */
  private okSpot(x: number, z: number, r: number): boolean {
    const world = this.m.k.ctx.world;
    const surface = world.surfaceAt(x, z);
    if (surface !== 'sidewalk' && surface !== 'plaza' && surface !== 'quay') return false;
    if (!world.isFree(x, z, r)) return false;
    const buf = this.buf;
    const n = this.m.store.collectAround(x, z, r + 0.2, buf);
    const r2 = (r + 0.1) * (r + 0.1);
    for (let i = 0; i < n; i++) {
      const q = buf[i]!;
      if (distSqPointObb(x, z, q.x, q.z, q.halfX, q.halfZ, q.heading) < r2) return false;
    }
    return true;
  }

  /**
   * Objet d'ambiance, posé seulement si l'emplacement convient. Son numéro d'ordre est fixé par
   * l'appelant d'après la carte (jamais d'après ce qui a pu être posé) : il désigne donc le même objet
   * à chaque rechargement de la tuile.
   */
  private extra(rec: TileRec, job: Job, kind: PropKind, x: number, z: number, heading: number, serial: number): PropObj | null {
    const def = propDef(kind);
    if (!this.okSpot(x, z, Math.max(def.halfX, def.halfZ))) return null;
    job.extras++;
    return this.spawn(rec, kind, x, z, heading, serial);
  }

  private addFurniture(rec: TileRec, info: MapFurnitureInfo, job: Job, density: number): void {
    const kind = mapFurnitureKind(info.kind);
    if (kind === '') return;
    const p = this.spawn(rec, kind, info.x, info.z, info.heading, info.index);
    if (!(density > 0)) return;
    const rng = job.rng;
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    const base = COMPANION_SERIAL + info.index * 10;
    if (kind === 'station_velo') {
      // vélos en libre-service accrochés aux bornes
      const slots = Math.min(9, Math.floor((p.halfX * 2) / 0.75));
      for (let i = 0; i < slots; i++) {
        const take = rng.chance(Math.min(0.9, 0.55 * density));
        const turn = rng.range(-0.06, 0.06);
        if (!take) continue;
        const lx = -p.halfX + 0.4 + i * 0.75;
        const lz = p.halfZ + 0.75;
        this.extra(rec, job, 'velo', p.x + lx * c + lz * s, p.z - lx * s + lz * c, p.heading + turn, base + i);
      }
    } else if (kind === 'arceau_velo') {
      const take = rng.chance(Math.min(0.8, 0.35 * density));
      const turn = rng.range(-0.15, 0.15);
      if (take) this.extra(rec, job, 'velo', p.x + s * 0.35, p.z + c * 0.35, p.heading + Math.PI * 0.5 + turn, base);
    } else if (kind === 'table_terrasse') {
      // deux chaises face à face de part et d'autre de la table
      this.extra(rec, job, 'chaise', p.x + c * 0.62, p.z - s * 0.62, p.heading - Math.PI * 0.5, base);
      this.extra(rec, job, 'chaise', p.x - c * 0.62, p.z + s * 0.62, p.heading + Math.PI * 0.5, base + 1);
    }
  }

  /** Y a-t-il déjà un objet de ce type à moins de `r` du point ? */
  private hasNear(kind: PropKind, x: number, z: number, r: number): boolean {
    const buf = this.buf;
    const n = this.m.store.collectAround(x, z, r, buf);
    const r2 = r * r;
    for (let i = 0; i < n; i++) {
      const q = buf[i]!;
      if (q.kind !== kind) continue;
      const dx = q.x - x;
      const dz = q.z - z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  /** Mobilier d'ambiance devant une boutique : terrasse, corbeille, bacs, deux-roues, palettes. */
  private dressShop(rec: TileRec, shop: ShopObj, job: Job, density: number): void {
    const rng = job.rng;
    const h = shop.heading;
    const nx = Math.sin(h);
    const nz = Math.cos(h);
    const tx = Math.cos(h);
    const tz = -Math.sin(h);
    const half = shop.width * 0.5;
    const base = SHOP_SERIAL + shop.serial * SHOP_BLOCK;
    // tous les tirages sont faits d'avance, dans un ordre fixe, que les emplacements conviennent ou non
    const rTerrace = rng.next();
    const rRows = rng.next();
    const rBin = rng.next();
    const rBacs = rng.next();
    const nBacs = 1 + Math.floor(rng.next() * 3);
    const rScoot = rng.next();
    const nScoot = 1 + Math.floor(rng.next() * 3);
    const rBike = rng.next();
    const rPal = rng.next();
    const turn = rng.range(-0.25, 0.25);

    if (shop.category === 'cafe_restaurant' && rTerrace < 0.85 * density && !this.hasNear('table_terrasse', shop.x + nx * 1.5, shop.z + nz * 1.5, half + 3)) {
      const count = Math.max(1, Math.min(5, Math.floor(shop.width / 1.7)));
      const rows = rRows < 0.4 ? 2 : 1;
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < count; i++) {
          const serial = base + (row * 5 + i) * 3;
          const u = (i - (count - 1) * 0.5) * 1.7;
          const d = 1.1 + row * 1.6;
          const x = shop.x + tx * u + nx * d;
          const z = shop.z + tz * u + nz * d;
          const skew = ((i * 7 + row * 3) % 5) * 0.08 - 0.16;
          if (this.extra(rec, job, 'table_terrasse', x, z, h + skew, serial) === null) continue;
          this.extra(rec, job, 'chaise', x + tx * 0.62, z + tz * 0.62, h - Math.PI * 0.5 + skew * 2, serial + 1);
          this.extra(rec, job, 'chaise', x - tx * 0.62, z - tz * 0.62, h + Math.PI * 0.5 - skew * 2, serial + 2);
        }
      }
    }

    if (rBin < 0.22 * density) {
      const u = half + 0.8;
      const x = shop.x + tx * u + nx * 2.4;
      const z = shop.z + tz * u + nz * 2.4;
      if (!this.hasNear('poubelle', x, z, 14) && this.extra(rec, job, 'poubelle', x, z, h, base + 30) === null) {
        // trottoir étroit : contre la façade
        this.extra(rec, job, 'poubelle', shop.x + tx * u + nx * 1.0, shop.z + tz * u + nz * 1.0, h, base + 31);
      }
    }

    if (rBacs < 0.1 * density) {
      // bacs roulants sortis, alignés contre la façade à côté de la vitrine
      for (let j = 0; j < nBacs; j++) {
        const u = -(half + 0.9 + j * 1.4);
        this.extra(rec, job, 'conteneur', shop.x + tx * u + nx * 0.55, shop.z + tz * u + nz * 0.55, h + turn * 0.3, base + 32 + j);
      }
    }

    if (rScoot < 0.12 * density) {
      for (let j = 0; j < nScoot; j++) {
        const u = half * 0.4 + j * 0.6;
        this.extra(rec, job, 'trottinette', shop.x + tx * u + nx * 2.2, shop.z + tz * u + nz * 2.2, h + Math.PI * 0.5 + turn * (1 - j * 0.6), base + 35 + j);
      }
    }

    if (rBike < 0.07 * density) {
      const u = -half * 0.5;
      this.extra(rec, job, 'velo', shop.x + tx * u + nx * 2.0, shop.z + tz * u + nz * 2.0, h + Math.PI * 0.5 - turn, base + 38);
    }

    if ((shop.category === 'supermarche' || shop.category === 'alimentation') && rPal < 0.35 * density) {
      const u = half + 1.3;
      this.extra(rec, job, 'palette', shop.x + tx * u + nx * 0.9, shop.z + tz * u + nz * 0.9, h + turn, base + 39);
    }
  }

  /** Petit chantier de voirie : grilles autour d'une fouille, palettes, cônes, tas de pavés. */
  private addWorksite(rec: TileRec, job: Job, site: number): void {
    const rng = job.rng;
    const world = this.m.k.ctx.world;
    const ts = world.tileSize;
    const spot = this.spot;
    const cx = (rec.tx + 0.5) * ts;
    const cz = (rec.tz + 0.5) * ts;
    const base = SITE_SERIAL + site * 8;
    const found = world.randomFreePoint(cx, cz, ts * 0.45, 'sidewalk', this.rand, spot);
    const h = rng.next() * Math.PI;
    const pile = rng.chance(0.6);
    const turn = rng.range(-0.3, 0.3);
    const a0 = rng.next() * 6.283185307179586;
    if (!found || !this.okSpot(spot.x, spot.z, 2.4)) return;
    const c = Math.cos(h);
    const s = Math.sin(h);
    const x = spot.x;
    const z = spot.z;
    // deux grilles de 3,5 m de part et d'autre de la fouille, le reste ouvert vers le trottoir
    this.extra(rec, job, 'barriere_chantier', x + s * 1.1, z + c * 1.1, h, base);
    this.extra(rec, job, 'barriere_chantier', x - s * 1.1, z - c * 1.1, h, base + 1);
    this.extra(rec, job, 'palette', x + c * 0.7, z - s * 0.7, h + turn, base + 2);
    if (pile) this.extra(rec, job, 'pile_paves', x - c * 0.8, z + s * 0.8, h, base + 3);
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.1;
      this.extra(rec, job, 'cone', x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6, a, base + 4 + i);
    }
  }

  // ───────────────────────────── mémoire ─────────────────────────────

  private snapProp(p: PropObj): PropSnap {
    return {
      x: p.x, z: p.z, heading: p.heading, halfX: p.halfX, halfZ: p.halfZ, height: p.height, hp: p.hp,
      state: p.state === 'burning' ? p.preFire === 'intact' ? 'damaged' : p.preFire : p.state,
      toppled: p.toppled, fuel: p.fuel, tags: p.tags, glass: p.glass, panes: p.panes, yieldLeft: p.yieldLeft,
      blocksMove: p.blocksMove, blocksSight: p.blocksSight, moved: p.movedAt > -1e8,
    };
  }

  private snapShop(s: ShopObj): ShopSnap {
    return {
      window: s.window, shutter: s.shutter, stock: s.stock, glass: s.glass, boards: s.boards, tags: s.tags,
      forced: s.forced, shutterHp: s.shutterHp, burnt: s.burnt, fuel: s.fuel, abandoned: s.abandoned, target: s.target,
    };
  }

  /** Rend à la tuile rechargée l'état laissé au déchargement. */
  private applyMemory(rec: TileRec): void {
    const mem = this.memory.get(rec.key);
    if (!mem) return;
    this.memory.delete(rec.key);
    const store = this.m.store;
    const props = rec.props;
    this.unloading = rec; // retraits silencieux pour la mémoire : ils y sont déjà
    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i]!;
      if (mem.removed.has(p.serial)) {
        props[i] = props[props.length - 1]!;
        props.pop();
        store.remove(p);
        continue;
      }
      const snap = mem.props.get(p.serial);
      if (!snap) continue;
      p.x = snap.x;
      p.z = snap.z;
      p.heading = snap.heading;
      p.halfX = snap.halfX;
      p.halfZ = snap.halfZ;
      p.height = snap.height;
      p.hp = snap.hp;
      p.state = snap.state;
      p.toppled = snap.toppled;
      p.toppledDone = snap.toppled;
      p.fuel = snap.fuel;
      p.tags = snap.tags;
      p.glass = snap.glass;
      p.panes = snap.panes;
      p.yieldLeft = snap.yieldLeft;
      p.blocksMove = snap.blocksMove;
      p.blocksSight = snap.blocksSight;
      p.dirty = true;
      if (snap.moved) p.movedAt = this.m.k.ctx.clock.now;
      const y = this.m.k.ctx.world.heightAt(p.x, p.z);
      p.y = Number.isFinite(y) ? y : 0;
      store.reindex(p);
    }
    this.unloading = null;
    for (const serial of mem.removed) rec.removed.add(serial);
    const shops = rec.shops;
    for (let i = 0; i < shops.length; i++) {
      const s = shops[i]!;
      const snap = mem.shops.get(s.serial);
      if (!snap) continue;
      s.window = snap.window;
      s.shutter = snap.shutter;
      s.stock = snap.stock;
      s.glass = snap.glass;
      s.boards = snap.boards;
      s.tags = snap.tags;
      s.forced = snap.forced;
      s.shutterHp = snap.shutterHp;
      s.burnt = snap.burnt;
      s.fuel = snap.fuel;
      s.abandoned = snap.abandoned;
      s.target = snap.target;
      s.closedSent = s.shutter >= 0.999;
      s.dirty = true;
    }
  }
}
