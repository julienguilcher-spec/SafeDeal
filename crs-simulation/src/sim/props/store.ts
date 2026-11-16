/* =====================================================================================
 * DÉCOR DYNAMIQUE — magasin des objets et des vitrines : listes, index spatial, requêtes,
 * collisions et lancers de rayon exacts sur boîtes orientées.
 *
 *   - index : chaque objet est inscrit dans les cellules de 4 m que recouvre son emprise (BoxGrid) ;
 *     un objet déplacé par ce module est ré-inscrit aussitôt ; un objet déplacé directement par un
 *     autre module (x/z écrits à la main) l'est à son prochain événement prop:moved, à son prochain
 *     dégât, ou au plus tard par le balayage lent (≈ 1 s) ;
 *   - queryRadius : objets éveillés dont la boîte touche le disque ;
 *   - resolveCircle : objets `blocksMove`, éveillés, non portés ;
 *   - raycast : parcours des cellules traversées dans l'ordre, arrêt dès que l'impact trouvé précède
 *     la cellule suivante ; mode 'move' = objets qui barrent le passage, 'sight' = objets qui masquent
 *     la vue, sans mode = les uns ou les autres ; RayHit.height = hauteur de l'obstacle ;
 *   - listes d'activité (en mouvement, en feu, portés, batteries qui couvent) : le pas de simulation
 *     ne parcourt qu'elles, jamais les milliers d'objets immobiles.
 * ===================================================================================== */

import { swapRemove, truncate } from '@/core/arrays';
import type { EntityId, PropKind, RayHit, ShopInit, Vec2 } from '@/core/contracts';
import { circleVsObb, distSqPointObb, distSqPointSegment, segmentVsObb } from '@/core/math';
import type { SegmentCast } from '@/core/math';
import { SpatialHash } from '@/core/spatial';
import { propDef } from './defs';
import { BoxGrid } from './grid';
import { ACT_BURNING, ACT_CARRIED, ACT_MOVING, ACT_SMOLDER, PropObj, ShopObj } from './shared';
import type { Kernel } from './shared';
import { shopDef } from './shop-defs';

/** Nombre maximal de cellules visitées par un lancer de rayon (rayon de 8 km). */
const MAX_WALK = 2048;

export class Store {
  readonly list: PropObj[] = [];
  readonly shops: ShopObj[] = [];
  readonly grid = new BoxGrid<PropObj>(4, 4096);
  readonly shopGrid = new SpatialHash<ShopObj>(16, 512);

  /** Listes d'activité. */
  readonly moving: PropObj[] = [];
  readonly burning: PropObj[] = [];
  readonly carried: PropObj[] = [];
  readonly smolder: PropObj[] = [];
  /** Vitrines en feu et rideaux en mouvement. */
  readonly burningShops: ShopObj[] = [];
  readonly rolling: ShopObj[] = [];
  /** Barricades présentes. */
  readonly barricades: PropObj[] = [];

  /** Appelés juste avant qu'un objet ou une vitrine ne disparaisse (mémoire de tuile, nettoyage). */
  onRemove: ((p: PropObj) => void) | null = null;
  onShopRemove: ((s: ShopObj) => void) | null = null;

  private readonly byId = new Map<EntityId, PropObj>();
  private readonly shopById = new Map<EntityId, ShopObj>();
  private maxShopHalf = 0;
  private readonly cand: PropObj[] = [];
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly cast: SegmentCast = { t: 0, nx: 0, nz: 0 };

  constructor(private readonly k: Kernel) {}

  // ───────────────────────────── objets ─────────────────────────────

  get(id: EntityId): PropObj | undefined {
    return this.byId.get(id);
  }

  /**
   * Crée un objet au gabarit de son type et l'inscrit dans l'index. `announce = false` : l'appelant
   * finit de le préparer (gabarit d'une barricade, état d'une épave) puis appelle announce() — ainsi
   * prop:spawned ne part que pour un objet complet.
   */
  create(kind: PropKind, x: number, z: number, heading: number, announce = true): PropObj {
    const ctx = this.k.ctx;
    const p = new PropObj(ctx.newId(), kind, propDef(kind), x, z, heading);
    const y = ctx.world.heightAt(x, z);
    p.y = Number.isFinite(y) ? y : 0;
    p.sweptAt = ctx.clock.now;
    const def = p.def;
    if (def.fuel > 0) {
      // charge variable : une corbeille à moitié vide brûle moins longtemps qu'un bac plein
      p.fuel = p.fuelMax = def.fuel * this.k.rng.range(0.8, 1.25);
    }
    if (def.battery > 0) p.battery = def.battery >= 1 || this.k.rng.chance(def.battery);
    p.slot = this.list.length;
    this.list.push(p);
    this.byId.set(p.id, p);
    this.reindex(p);
    if (kind === 'barricade') this.barricades.push(p);
    if (announce) ctx.events.emit('prop:spawned', { id: p.id });
    return p;
  }

  announce(p: PropObj): void {
    if (p.slot >= 0) this.k.ctx.events.emit('prop:spawned', { id: p.id });
  }

  /** Retire un objet. `silent` : sans événement (déchargement en masse géré par l'appelant). */
  remove(p: PropObj, silent = false): void {
    if (p.slot < 0) return;
    if (this.onRemove) this.onRemove(p);
    const list = this.list;
    const last = list[list.length - 1]!;
    list[p.slot] = last;
    last.slot = p.slot;
    list.pop();
    p.slot = -1;
    this.grid.remove(p);
    const burning = (p.act & ACT_BURNING) !== 0;
    if (p.act & ACT_MOVING) swapRemove(this.moving, p);
    if (burning) swapRemove(this.burning, p);
    if (p.act & ACT_CARRIED) swapRemove(this.carried, p);
    if (p.act & ACT_SMOLDER) swapRemove(this.smolder, p);
    p.act = 0;
    if (p.kind === 'barricade') swapRemove(this.barricades, p);
    if (p.carriedBy !== 0) {
      const carrier = this.k.ctx.people.get(p.carriedBy);
      if (carrier && carrier.carrying === p.id) carrier.carrying = 0;
      p.carriedBy = 0;
    }
    const events = this.k.ctx.events;
    // un objet qui disparaît en flammes : son feu s'arrête avec lui (boucles sonores, incidents)
    if (burning) {
      events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'prop', targetId: p.id, byId: 0 });
      p.burning = 0;
    }
    // l'objet reste accessible par get(id) le temps de l'événement
    if (!silent) events.emit('prop:removed', { id: p.id });
    this.byId.delete(p.id);
  }

  clear(): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      p.slot = -1;
      p.act = 0;
      p.gIn = false;
    }
    list.length = 0;
    this.byId.clear();
    this.grid.clear();
    this.moving.length = 0;
    this.burning.length = 0;
    this.carried.length = 0;
    this.smolder.length = 0;
    this.barricades.length = 0;
    const shops = this.shops;
    for (let i = 0; i < shops.length; i++) shops[i]!.slot = -1;
    shops.length = 0;
    this.shopById.clear();
    this.shopGrid.clear();
    this.burningShops.length = 0;
    this.rolling.length = 0;
    this.maxShopHalf = 0;
  }

  /** Ré-inscrit l'objet dans l'index d'après sa position, son cap et son gabarit courants. */
  reindex(p: PropObj): void {
    if (p.slot < 0) return;
    const s = Math.sin(p.heading);
    const c = Math.cos(p.heading);
    const ex = Math.abs(c) * p.halfX + Math.abs(s) * p.halfZ;
    const ez = Math.abs(s) * p.halfX + Math.abs(c) * p.halfZ;
    this.grid.update(p, p.x - ex, p.z - ez, p.x + ex, p.z + ez);
    p.ix = p.x;
    p.iz = p.z;
    p.ih = p.heading;
    p.ihx = p.halfX;
    p.ihz = p.halfZ;
  }

  /** L'objet a-t-il bougé ou changé de gabarit depuis sa dernière inscription ? */
  stale(p: PropObj): boolean {
    return p.x !== p.ix || p.z !== p.iz || p.heading !== p.ih || p.halfX !== p.ihx || p.halfZ !== p.ihz;
  }

  activate(p: PropObj, bit: number): void {
    if (p.act & bit || p.slot < 0) return;
    p.act |= bit;
    this.setOf(bit).push(p);
  }

  deactivate(p: PropObj, bit: number): void {
    if (!(p.act & bit)) return;
    p.act &= ~bit;
    swapRemove(this.setOf(bit), p);
  }

  private setOf(bit: number): PropObj[] {
    return bit === ACT_MOVING ? this.moving : bit === ACT_BURNING ? this.burning : bit === ACT_CARRIED ? this.carried : this.smolder;
  }

  // ───────────────────────────── vitrines ─────────────────────────────

  shop(id: EntityId): ShopObj | undefined {
    return this.shopById.get(id);
  }

  /** Crée une vitrine « nue » (les caractères de la boutique sont posés par shops.ts). */
  createShop(init: ShopInit): ShopObj {
    const ctx = this.k.ctx;
    const width = init.width > 0.5 ? init.width : 0.5;
    const s = new ShopObj(ctx.newId(), init.category, shopDef(init.category), init.x, init.z, init.heading, width);
    const y = ctx.world.heightAt(init.x, init.z);
    s.y = Number.isFinite(y) ? y : 0;
    s.sweptAt = ctx.clock.now;
    s.slot = this.shops.length;
    this.shops.push(s);
    this.shopById.set(s.id, s);
    s.gridSlot = this.shopGrid.insert(s);
    if (width * 0.5 > this.maxShopHalf) this.maxShopHalf = width * 0.5;
    return s;
  }

  removeShop(s: ShopObj): void {
    if (s.slot < 0) return;
    if (this.onShopRemove) this.onShopRemove(s);
    const shops = this.shops;
    const last = shops[shops.length - 1]!;
    shops[s.slot] = last;
    last.slot = s.slot;
    shops.pop();
    s.slot = -1;
    this.shopGrid.remove(s.gridSlot);
    this.shopById.delete(s.id);
    if (s.inFire) {
      swapRemove(this.burningShops, s);
      s.inFire = false;
      this.k.ctx.events.emit('fire:out', { x: s.x, z: s.z, targetKind: 'shop', targetId: s.id, byId: 0 });
    }
    if (s.rolling) {
      swapRemove(this.rolling, s);
      s.rolling = false;
    }
  }

  // ───────────────────────────── requêtes ─────────────────────────────

  /** Objets éveillés dont la boîte touche le disque (x, z, r). */
  queryRadius(x: number, z: number, r: number, out: PropObj[], filter?: (p: PropObj) => boolean): number {
    if (!(r >= 0)) {
      truncate(out, 0);
      return 0;
    }
    // collecte complète d'abord, filtre ensuite : le filtre peut lancer ses propres requêtes sans fausser celle-ci
    const found = this.grid.collectBox(x - r, z - r, x + r, z + r, out, 0);
    const r2 = r * r;
    let n = 0;
    for (let i = 0; i < found; i++) {
      const p = out[i]!;
      if (p.dormant) continue;
      if (distSqPointObb(x, z, p.x, p.z, p.halfX, p.halfZ, p.heading) > r2) continue;
      out[n++] = p;
    }
    if (filter) {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const p = out[i]!;
        if (filter(p)) out[m++] = p;
      }
      n = m;
    }
    truncate(out, n);
    return n;
  }

  /** Tous les objets (éveillés ou non) dont le rectangle englobant touche le carré : usage interne. */
  collectAround(x: number, z: number, r: number, out: PropObj[]): number {
    return this.grid.collectBox(x - r, z - r, x + r, z + r, out, 0);
  }

  shopsNear(x: number, z: number, r: number, out: ShopObj[]): number {
    const found = this.shopGrid.query(x, z, r + this.maxShopHalf, out);
    const r2 = r * r;
    let n = 0;
    for (let i = 0; i < found; i++) {
      const s = out[i]!;
      if (s.dormant) continue;
      // la façade est perpendiculaire à la normale sortante : tangente = (cos h, −sin h)
      const tx = Math.cos(s.heading) * s.width * 0.5;
      const tz = -Math.sin(s.heading) * s.width * 0.5;
      if (distSqPointSegment(x, z, s.x - tx, s.z - tz, s.x + tx, s.z + tz) > r2) continue;
      out[n++] = s;
    }
    truncate(out, n);
    return n;
  }

  /** Repousse le disque hors des objets qui barrent le passage. true s'il y a eu contact. */
  resolveCircle(pos: Vec2, radius: number): boolean {
    const grid = this.grid;
    if (grid.empty) return false;
    const cand = this.cand;
    const found = grid.collectBox(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, cand, 0);
    if (found === 0) return false;
    let hit = false;
    const tmp = this.tmp;
    for (let i = 0; i < found; i++) {
      const p = cand[i]!;
      if (!p.blocksMove || p.dormant || p.carriedBy !== 0) continue;
      if (circleVsObb(pos.x, pos.z, radius, p.x, p.z, p.halfX, p.halfZ, p.heading, tmp)) {
        pos.x += tmp.x;
        pos.z += tmp.z;
        hit = true;
      }
    }
    return hit;
  }

  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit, mode?: 'move' | 'sight'): boolean {
    const grid = this.grid;
    let bestT = 2;
    let best: PropObj | null = null;
    let nx = 0;
    let nz = 0;
    if (!grid.empty && Number.isFinite(ax) && Number.isFinite(az) && Number.isFinite(bx) && Number.isFinite(bz)) {
      const cell = grid.cellSize;
      const inv = 1 / cell;
      let cx = Math.floor(ax * inv);
      let cz = Math.floor(az * inv);
      const ex = Math.floor(bx * inv);
      const ez = Math.floor(bz * inv);
      const dx = bx - ax;
      const dz = bz - az;
      const stepX = dx > 0 ? 1 : -1;
      const stepZ = dz > 0 ? 1 : -1;
      const tDeltaX = dx !== 0 ? cell / Math.abs(dx) : Infinity;
      const tDeltaZ = dz !== 0 ? cell / Math.abs(dz) : Infinity;
      let tMaxX = dx !== 0 ? ((cx + (dx > 0 ? 1 : 0)) * cell - ax) / dx : Infinity;
      let tMaxZ = dz !== 0 ? ((cz + (dz > 0 ? 1 : 0)) * cell - az) / dz : Infinity;
      let left = Math.abs(ex - cx) + Math.abs(ez - cz) + 1;
      if (left > MAX_WALK) left = MAX_WALK;
      const cand = this.cand;
      const cast = this.cast;
      grid.beginWalk();
      while (left-- > 0) {
        const found = grid.collectCell(cx, cz, cand, 0);
        for (let i = 0; i < found; i++) {
          const p = cand[i]!;
          if (p.dormant || p.carriedBy !== 0) continue;
          if (mode === 'move' ? !p.blocksMove : mode === 'sight' ? !p.blocksSight : !(p.blocksMove || p.blocksSight)) continue;
          if (segmentVsObb(ax, az, bx, bz, p.x, p.z, p.halfX, p.halfZ, p.heading, cast) && cast.t < bestT) {
            bestT = cast.t;
            best = p;
            nx = cast.nx;
            nz = cast.nz;
          }
        }
        // l'impact trouvé précède l'entrée dans la cellule suivante : rien de plus proche plus loin
        const tNext = tMaxX < tMaxZ ? tMaxX : tMaxZ;
        if (bestT <= tNext || tNext > 1) break;
        if (tMaxX < tMaxZ) {
          cx += stepX;
          tMaxX += tDeltaX;
        } else {
          cz += stepZ;
          tMaxZ += tDeltaZ;
        }
      }
    }
    if (!best) {
      out.hit = false;
      out.t = 1;
      out.x = bx;
      out.z = bz;
      out.nx = 0;
      out.nz = 0;
      out.kind = 'none';
      out.id = 0;
      out.height = 0;
      return false;
    }
    out.hit = true;
    out.t = bestT;
    out.x = ax + (bx - ax) * bestT;
    out.z = az + (bz - az) * bestT;
    out.nx = nx;
    out.nz = nz;
    out.kind = 'prop';
    out.id = best.id;
    out.height = best.height;
    return true;
  }
}
