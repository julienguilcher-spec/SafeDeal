/* =====================================================================================
 * Magasin des objets du décor et des vitrines (PropApi) — données et géométrie.
 * Les comportements de jeu (incendie, pillage détaillé, construction de barricades…) relèvent
 * du module du mobilier ; ce magasin se limite à des règles de données simples et réelles.
 *
 *   - spawn() : gabarit réaliste par type (PROP_DEFAULTS), altitude prise sur le monde ;
 *   - vitrines : le contrat ne prévoit pas leur création → addShop() / removeShop() ;
 *   - requêtes : un objet est retenu si son emprise (boîte orientée) touche le disque demandé ;
 *     une vitrine si le segment de sa façade passe à moins de r du point ;
 *   - resolveCircle() : objets `blocksMove`, non endormis, non portés ;
 *   - raycast() : objets `blocksMove` ou `blocksSight` ; RayHit.height permet au tireur de
 *     décider si le projectile passe au-dessus ;
 *   - index spatial : mis à jour à l'insertion, au retrait, par rebuildIndex(), et au plus une
 *     fois par pas de simulation lors de la première requête (objets déplacés entre-temps) ;
 *   - push() donne une vitesse à l'objet ; update(dt) l'intègre avec frottement (appelé par le
 *     moteur tant que ce magasin est celui du contexte).
 * ===================================================================================== */

import type {
  DamageKind, EntityId, GameContext, Prop, PropApi, PropKind, PropState, RayHit, Shop, ShopCategory, Vec2,
  WindowState,
} from './contracts';
import { circleVsObb, distSqPointObb, distSqPointSegment, segmentVsObb } from './math';
import type { SegmentCast } from './math';
import { SpatialHash } from './spatial';

export interface PropDefaults {
  halfX: number;
  halfZ: number;
  height: number;
  hp: number;
  movable: boolean;
  blocksMove: boolean;
  blocksSight: boolean;
  /** Combustible (s de feu). */
  fuel: number;
}

function pd(
  halfX: number, halfZ: number, height: number, hp: number,
  movable: boolean, blocksMove: boolean, blocksSight: boolean, fuel: number,
): PropDefaults {
  return { halfX, halfZ, height, hp, movable, blocksMove, blocksSight, fuel };
}

/** Gabarits par défaut (demi-largeur, demi-profondeur, hauteur en m). Extensible par les modules. */
export const PROP_DEFAULTS: Record<string, PropDefaults> = {
  poubelle: pd(0.22, 0.22, 1.0, 20, true, true, false, 60),
  conteneur: pd(0.63, 0.39, 1.2, 60, true, true, false, 240),
  barriere_vauban: pd(1.25, 0.2, 1.1, 80, true, true, false, 0),
  barriere_chantier: pd(1.75, 0.25, 2.0, 60, true, true, false, 0),
  banc: pd(1.0, 0.3, 0.8, 150, false, true, false, 30),
  abribus: pd(2.1, 0.8, 2.6, 200, false, true, false, 0),
  kiosque: pd(1.5, 1.1, 3.5, 400, false, true, true, 200),
  colonne_morris: pd(0.7, 0.7, 4.5, 500, false, true, true, 0),
  panneau_pub: pd(0.65, 0.12, 2.7, 80, false, true, true, 0),
  potelet: pd(0.06, 0.06, 1.0, 200, false, true, false, 0),
  velo: pd(0.28, 0.9, 1.05, 30, true, true, false, 0),
  trottinette: pd(0.22, 0.55, 1.15, 20, true, true, false, 0),
  palette: pd(0.6, 0.4, 0.15, 40, true, false, false, 120),
  pile_paves: pd(0.5, 0.5, 0.5, 500, false, true, false, 0),
  table_terrasse: pd(0.35, 0.35, 0.75, 30, true, true, false, 40),
  chaise: pd(0.23, 0.25, 0.85, 15, true, true, false, 20),
  candelabre: pd(0.12, 0.12, 9.0, 1000, false, true, false, 0),
  feu_tricolore: pd(0.1, 0.1, 3.5, 300, false, true, false, 0),
  distributeur: pd(0.45, 0.35, 1.8, 300, false, true, true, 0),
  fontaine_wallace: pd(0.4, 0.4, 2.7, 2000, false, true, false, 0),
  barricade: pd(1.5, 0.6, 1.3, 300, false, true, false, 300),
  debris: pd(0.4, 0.4, 0.3, 50, true, false, false, 0),
  cone: pd(0.18, 0.18, 0.6, 10, true, false, false, 0),
  jardiniere: pd(0.75, 0.3, 0.7, 600, false, true, false, 0),
  echafaudage: pd(4.0, 0.6, 9.0, 800, false, false, false, 0),
  sanisette: pd(1.6, 1.0, 2.6, 1500, false, true, true, 0),
  station_velo: pd(3.0, 0.9, 1.2, 400, false, true, false, 0),
};

const GENERIC_PROP: PropDefaults = pd(0.25, 0.25, 1.0, 50, true, true, false, 0);

/** Gabarit d'un type d'objet (générique si le type est inconnu). */
export function propDefaults(kind: PropKind): PropDefaults {
  return PROP_DEFAULTS[kind] ?? GENERIC_PROP;
}

const SHOP_LABELS: Record<string, string> = {
  banque: 'Banque', luxe: 'Boutique de luxe', mode: 'Prêt-à-porter', bijouterie: 'Bijouterie',
  alimentation: 'Alimentation', supermarche: 'Supermarché', cafe_restaurant: 'Café-restaurant',
  restauration_rapide: 'Restauration rapide', pharmacie: 'Pharmacie', tabac_presse: 'Tabac-presse',
  telephonie: 'Téléphonie', agence: 'Agence', hotel: 'Hôtel', autre: 'Commerce',
};

/** Attrait par défaut d'une catégorie de commerce pour les pilleurs (0..1). */
const SHOP_APPEAL: Record<string, number> = {
  banque: 0.5, luxe: 0.95, mode: 0.6, bijouterie: 0.9, alimentation: 0.3, supermarche: 0.5,
  cafe_restaurant: 0.15, restauration_rapide: 0.3, pharmacie: 0.2, tabac_presse: 0.5,
  telephonie: 0.85, agence: 0.3, hotel: 0.2, autre: 0.3,
};

export interface ShopInit {
  category: ShopCategory;
  /** Milieu de la vitrine. */
  x: number;
  z: number;
  /** Cap de la normale sortante de la façade. */
  heading: number;
  width: number;
  /** Nom d'enseigne fictif (par défaut : libellé générique de la catégorie). */
  name?: string;
  stock?: number;
  appeal?: number;
  shutter?: number;
}

/** Magasin de base : contrat PropApi + création des vitrines, index et intégration des poussées. */
export interface PropStore extends PropApi {
  addShop(init: ShopInit): Shop;
  removeShop(id: EntityId): void;
  /** Ré-indexe tous les objets (après des déplacements directs de x/z). */
  rebuildIndex(): void;
  /** Intègre la vitesse des objets poussés (frottement au sol). */
  update(dt: number): void;
}

/** Décélération d'un objet qui glisse au sol (m/s²). */
const PROP_FRICTION = 6;

class PropStoreImpl implements PropStore {
  readonly list: Prop[] = [];
  readonly shops: Shop[] = [];
  private readonly byId = new Map<EntityId, Prop>();
  private readonly shopById = new Map<EntityId, Shop>();
  private readonly slotOf = new Map<EntityId, number>();
  private readonly shopSlotOf = new Map<EntityId, number>();
  private readonly grid = new SpatialHash<Prop>(4, 1024);
  private readonly shopGrid = new SpatialHash<Shop>(16, 256);
  /** Plus grand rayon englobant parmi les objets / plus grande demi-largeur de vitrine. */
  private maxReach = 0;
  private maxShopHalf = 0;
  private indexedTick = -1;
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly cast: SegmentCast = { t: 0, nx: 0, nz: 0 };
  private readonly scratch: Prop[] = [];

  constructor(private readonly ctx: GameContext) {}

  get(id: EntityId): Prop | undefined {
    return this.byId.get(id);
  }

  shop(id: EntityId): Shop | undefined {
    return this.shopById.get(id);
  }

  spawn(kind: PropKind, x: number, z: number, heading: number): Prop {
    const d = propDefaults(kind);
    const prop: Prop = {
      id: this.ctx.newId(),
      kind,
      x,
      y: this.ctx.world.heightAt(x, z),
      z,
      heading,
      halfX: d.halfX,
      halfZ: d.halfZ,
      height: d.height,
      hp: d.hp,
      state: 'intact',
      burning: 0,
      fuel: d.fuel,
      movable: d.movable,
      toppled: false,
      blocksMove: d.blocksMove,
      blocksSight: d.blocksSight,
      tags: 0,
      carriedBy: 0,
      vx: 0,
      vz: 0,
      dormant: false,
    };
    this.list.push(prop);
    this.byId.set(prop.id, prop);
    this.slotOf.set(prop.id, this.grid.insert(prop));
    const reach = Math.sqrt(d.halfX * d.halfX + d.halfZ * d.halfZ);
    if (reach > this.maxReach) this.maxReach = reach;
    return prop;
  }

  remove(id: EntityId): void {
    const prop = this.byId.get(id);
    if (!prop) return;
    this.byId.delete(id);
    const slot = this.slotOf.get(id);
    if (slot !== undefined) this.grid.remove(slot);
    this.slotOf.delete(id);
    const idx = this.list.indexOf(prop);
    if (idx >= 0) {
      this.list[idx] = this.list[this.list.length - 1]!;
      this.list.pop();
    }
    if (prop.carriedBy !== 0) {
      const carrier = this.ctx.people.get(prop.carriedBy);
      if (carrier && carrier.carrying === id) carrier.carrying = 0;
    }
  }

  clear(): void {
    this.list.length = 0;
    this.shops.length = 0;
    this.byId.clear();
    this.shopById.clear();
    this.slotOf.clear();
    this.shopSlotOf.clear();
    this.grid.clear();
    this.shopGrid.clear();
    this.maxReach = 0;
    this.maxShopHalf = 0;
    this.indexedTick = -1;
  }

  addShop(init: ShopInit): Shop {
    const shop: Shop = {
      id: this.ctx.newId(),
      name: init.name ?? SHOP_LABELS[init.category] ?? SHOP_LABELS.autre!,
      category: init.category,
      x: init.x,
      y: this.ctx.world.heightAt(init.x, init.z),
      z: init.z,
      heading: init.heading,
      width: init.width,
      window: 'intact',
      shutter: init.shutter ?? 0,
      stock: init.stock ?? 1,
      appeal: init.appeal ?? SHOP_APPEAL[init.category] ?? 0.3,
      burning: 0,
      occupants: 0,
      dormant: false,
    };
    this.shops.push(shop);
    this.shopById.set(shop.id, shop);
    this.shopSlotOf.set(shop.id, this.shopGrid.insert(shop));
    if (shop.width * 0.5 > this.maxShopHalf) this.maxShopHalf = shop.width * 0.5;
    return shop;
  }

  removeShop(id: EntityId): void {
    const shop = this.shopById.get(id);
    if (!shop) return;
    this.shopById.delete(id);
    const slot = this.shopSlotOf.get(id);
    if (slot !== undefined) this.shopGrid.remove(slot);
    this.shopSlotOf.delete(id);
    const idx = this.shops.indexOf(shop);
    if (idx >= 0) {
      this.shops[idx] = this.shops[this.shops.length - 1]!;
      this.shops.pop();
    }
  }

  rebuildIndex(): void {
    this.grid.updateAll();
    this.indexedTick = this.ctx.clock.tick;
  }

  /** Ré-indexe au plus une fois par pas de simulation (objets déplacés depuis la dernière requête). */
  private refresh(): void {
    const tick = this.ctx.clock.tick;
    if (tick !== this.indexedTick) {
      this.grid.updateAll();
      this.indexedTick = tick;
    }
  }

  queryRadius(x: number, z: number, r: number, out: Prop[], filter?: (p: Prop) => boolean): number {
    this.refresh();
    const found = this.grid.query(x, z, r + this.maxReach, out);
    const r2 = r * r;
    let n = 0;
    for (let i = 0; i < found; i++) {
      const p = out[i]!;
      if (p.dormant) continue;
      if (distSqPointObb(x, z, p.x, p.z, p.halfX, p.halfZ, p.heading) > r2) continue;
      if (filter && !filter(p)) continue;
      out[n++] = p;
    }
    if (out.length > n) out.length = n;
    return n;
  }

  shopsNear(x: number, z: number, r: number, out: Shop[]): number {
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
    if (out.length > n) out.length = n;
    return n;
  }

  damage(prop: Prop, amount: number, _kind: DamageKind, byId: EntityId): void {
    if (!(amount > 0) || prop.state === 'burnt') return;
    prop.hp -= amount;
    if (prop.hp < 0) prop.hp = 0;
    const max = propDefaults(prop.kind).hp;
    let next: PropState = prop.state;
    if (prop.state === 'intact' || prop.state === 'damaged') {
      next = prop.hp <= 0 ? 'broken' : prop.hp < max * 0.5 ? 'damaged' : prop.state;
    }
    if (next !== prop.state) {
      prop.state = next;
      this.ctx.events.emit('prop:damaged', { id: prop.id, state: next, byId });
    }
  }

  damageShop(shop: Shop, amount: number, kind: DamageKind, byId: EntityId): void {
    if (!(amount > 0)) return;
    if (shop.shutter >= 0.99 && kind !== 'burn' && kind !== 'blast') return; // rideau de fer baissé
    let next: WindowState = shop.window;
    if (shop.window === 'intact' || shop.window === 'tagged') next = amount >= 30 ? 'broken' : amount >= 10 ? 'cracked' : shop.window;
    else if (shop.window === 'cracked') next = amount >= 10 ? 'broken' : 'cracked';
    if (next !== shop.window) {
      shop.window = next;
      this.ctx.events.emit('shop:window', { id: shop.id, state: next, byId });
    }
  }

  loot(shop: Shop, byId: EntityId): number {
    if (shop.window !== 'broken' || shop.shutter > 0.5 || shop.stock <= 0) return 0;
    const amount = shop.stock < 0.05 ? shop.stock : 0.05;
    shop.stock -= amount;
    if (shop.stock < 1e-9) shop.stock = 0;
    this.ctx.events.emit('shop:looted', { id: shop.id, byId, amount });
    return amount;
  }

  push(prop: Prop, dirX: number, dirZ: number, force: number, byId: EntityId): void {
    if (!prop.movable || !(force > 0)) return;
    const l = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (l < 1e-9) return;
    prop.vx += (dirX / l) * force;
    prop.vz += (dirZ / l) * force;
    this.ctx.events.emit('prop:moved', { id: prop.id, byId });
  }

  tag(target: Prop | Shop, byId: EntityId): void {
    if ('window' in target) {
      if (target.window === 'intact') {
        target.window = 'tagged';
        this.ctx.events.emit('shop:window', { id: target.id, state: 'tagged', byId });
      }
    } else {
      target.tags++;
    }
  }

  resolveCircle(pos: Vec2, radius: number): boolean {
    this.refresh();
    const cand = this.scratch;
    const found = this.grid.query(pos.x, pos.z, radius + this.maxReach, cand);
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

  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
    this.refresh();
    const cand = this.scratch;
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    const half = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) * 0.5;
    const found = this.grid.query(mx, mz, half + this.maxReach, cand);
    const cast = this.cast;
    let bestT = 2;
    let best: Prop | null = null;
    let nx = 0;
    let nz = 0;
    for (let i = 0; i < found; i++) {
      const p = cand[i]!;
      if (p.dormant || p.carriedBy !== 0 || !(p.blocksMove || p.blocksSight)) continue;
      if (segmentVsObb(ax, az, bx, bz, p.x, p.z, p.halfX, p.halfZ, p.heading, cast) && cast.t < bestT) {
        bestT = cast.t;
        best = p;
        nx = cast.nx;
        nz = cast.nz;
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

  update(dt: number): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.vx === 0 && p.vz === 0) continue;
      const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      const drop = PROP_FRICTION * dt;
      if (speed <= drop || p.carriedBy !== 0) {
        // dernier pas : distance restante avant l'arrêt
        if (p.carriedBy === 0) {
          const d = (speed * speed) / (2 * PROP_FRICTION);
          p.x += (p.vx / speed) * d;
          p.z += (p.vz / speed) * d;
        }
        p.vx = 0;
        p.vz = 0;
      } else {
        const k = (speed - drop) / speed;
        p.x += p.vx * dt * (1 + k) * 0.5;
        p.z += p.vz * dt * (1 + k) * 0.5;
        p.vx *= k;
        p.vz *= k;
      }
      p.y = this.ctx.world.heightAt(p.x, p.z);
      const slot = this.slotOf.get(p.id);
      if (slot !== undefined) this.grid.update(slot);
    }
  }
}

export function createPropStore(ctx: GameContext): PropStore {
  return new PropStoreImpl(ctx);
}
