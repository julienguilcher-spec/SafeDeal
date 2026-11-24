/* =====================================================================================
 * DÉCOR DYNAMIQUE — système de simulation (ordre ACTIONS + 20) : publie ctx.props et le service
 * étendu « props.ext », branche les événements et fait vivre le décor à chaque pas.
 *
 * Coût d'un pas : seuls les objets actifs (en mouvement, portés, en feu), les rideaux en mouvement,
 * les boutiques en feu et une tranche du balayage lent sont parcourus — pas les milliers d'objets
 * immobiles (mesuré : voir tests/unit/props.perf.test.ts).
 * ===================================================================================== */

import type {
  DamageKind, EntityId, GameContext, GameSystem, InteractionHandler, Person, Prop, PropApi, PropKind, RayHit, Shop,
  ShopCategory, ShopInit, Unsubscribe, Vec2,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { PROPS_EXT_SERVICE, SESSION_EXTRA_KEY } from './api';
import type { BarricadePart, PropDef, PropsExtApi, PropsStats, PropsTuning, PropView, ShopView } from './api';
import { Barricades } from './barricades';
import { Damage } from './damage';
import { mapFurnitureKind, propDef } from './defs';
import { Fire } from './fire';
import { createHandlers, resetHandlers } from './handlers';
import type { Mod } from './mod';
import { Motion } from './motion';
import { ACT_BURNING, Kernel, PropObj, ShopObj, defaultTuning } from './shared';
import { shopName } from './shop-defs';
import { Shops } from './shops';
import { Store } from './store';
import { Sweep } from './sweep';
import { Tiles } from './tiles';

function emptyShopView(): ShopView {
  return {
    hasShutter: false, forced: false, shutterTarget: 0, shutterHealth: 0, glass: 0, reinforced: false, boards: 0, tags: 0,
    burnt: false, maxOccupants: 0, lootLeft: 0,
  };
}

export class PropsSystem implements GameSystem {
  readonly id = 'props';
  readonly order = SystemOrder.ACTIONS + 20;

  readonly m: Mod;
  readonly api: PropApi;
  readonly ext: PropsExtApi;
  private handlers: InteractionHandler[] = [];
  private readonly offs: Unsubscribe[] = [];

  constructor() {
    const k = new Kernel();
    const m = { k } as Mod;
    m.store = new Store(k);
    m.motion = new Motion(m);
    m.fire = new Fire(m);
    m.damage = new Damage(m);
    m.shops = new Shops(m);
    m.barricades = new Barricades(m);
    m.tiles = new Tiles(m);
    m.sweep = new Sweep(m);
    this.m = m;
    m.store.onRemove = (p) => {
      m.tiles.noteRemoved(p);
      m.damage.noteRemoved(p);
    };
    m.store.onShopRemove = (s) => m.tiles.noteShopRemoved(s);
    this.api = this.makeApi();
    this.ext = this.makeExt();
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  provide(ctx: GameContext): void {
    this.m.k.bind(ctx);
    ctx.props = this.api;
    ctx.provide(PROPS_EXT_SERVICE, this.ext);
  }

  init(ctx: GameContext): void {
    const m = this.m;
    const ev = ctx.events;
    this.offs.push(
      ev.on('world:tile_loaded', (e) => m.tiles.onLoaded(e.tx, e.tz)),
      ev.on('world:tile_unloaded', (e) => m.tiles.onUnloaded(e.tx, e.tz)),
      // tuiles restées chargées d'une session à l'autre : le monde ne les annonce pas une seconde fois
      ev.on('session:started', () => m.tiles.syncAll()),
      ev.on('explosion', (e) => m.damage.onExplosion(e)),
      // un autre module a déplacé un objet en écrivant ses champs (lame d'un engin) : l'index suit
      ev.on('prop:moved', (e) => {
        const p = m.store.get(e.id);
        if (p && m.store.stale(p)) m.store.reindex(p);
      }),
    );
    m.fire.init();
    this.handlers = createHandlers(m);
    for (let i = 0; i < this.handlers.length; i++) ctx.interactions.register(this.handlers[i]!);
    // tuiles chargées par le monde pendant son propre démarrage, avant que nous n'écoutions
    m.tiles.syncAll();
  }

  reset(): void {
    const m = this.m;
    m.store.clear();
    m.tiles.reset(true);
    m.barricades.reset();
    m.damage.reset();
    m.sweep.reset();
    m.k.reset();
    resetHandlers(this.handlers);
    this.applySessionTuning();
  }

  /**
   * Les réglages reviennent à leurs valeurs de référence à chaque session, puis reçoivent ceux que la
   * mission a prévus dans SessionConfig.extra.props (ex. { ambientDensity: 0.3 } après un retrait
   * préventif du mobilier) — lus ici parce que le peuplement a lieu pendant le chargement, avant
   * 'session:started'.
   */
  private applySessionTuning(): void {
    const k = this.m.k;
    const tuning = k.tuning as unknown as Record<string, unknown>;
    const defaults = defaultTuning() as unknown as Record<string, unknown>;
    Object.assign(tuning, defaults);
    const extra = k.ctx.session.config?.extra?.[SESSION_EXTRA_KEY];
    if (extra === null || typeof extra !== 'object') return;
    const wanted = extra as Record<string, unknown>;
    for (const key of Object.keys(defaults)) {
      const value = wanted[key];
      if (value === undefined || typeof value !== typeof defaults[key]) continue;
      if (typeof value === 'number' && !Number.isFinite(value)) continue;
      if (key === 'blade' && value !== 'auto' && value !== 'on' && value !== 'off') continue;
      tuning[key] = value;
    }
  }

  update(dt: number): void {
    const m = this.m;
    if (m.tiles.pending > 0) m.tiles.run(Math.max(1, m.k.tuning.populateBudget));
    m.motion.update(dt);
    m.fire.update(dt);
    m.shops.update(dt);
    m.barricades.update();
    m.sweep.update(dt);
  }

  dispose(): void {
    for (let i = 0; i < this.offs.length; i++) this.offs[i]!();
    this.offs.length = 0;
  }

  // ───────────────────────────── PropApi ─────────────────────────────

  private own(prop: Prop): PropObj | null {
    return prop instanceof PropObj && prop.slot >= 0 ? prop : null;
  }

  private ownShop(shop: Shop): ShopObj | null {
    return shop instanceof ShopObj && shop.slot >= 0 ? shop : null;
  }

  private makeApi(): PropApi {
    const m = this.m;
    const store = m.store;
    const self = this;
    return {
      get list(): readonly Prop[] {
        return store.list;
      },
      get shops(): readonly Shop[] {
        return store.shops;
      },
      addShop: (init: ShopInit): Shop => m.shops.add(init),
      removeShop(id: EntityId): void {
        const s = store.shop(id);
        if (s) store.removeShop(s);
      },
      get: (id: EntityId): Prop | undefined => store.get(id),
      shop: (id: EntityId): Shop | undefined => store.shop(id),
      spawn(kind: PropKind, x: number, z: number, heading: number): Prop {
        const p = store.create(kind, Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0, Number.isFinite(heading) ? heading : 0, false);
        if (kind === 'barricade') m.barricades.prefab(p);
        store.announce(p);
        return p;
      },
      remove(id: EntityId): void {
        const p = store.get(id);
        if (p) store.remove(p);
      },
      clear(): void {
        store.clear();
        m.tiles.reset(false);
        m.barricades.reset();
        m.damage.reset();
      },
      queryRadius: (x: number, z: number, r: number, out: Prop[], filter?: (p: Prop) => boolean): number =>
        store.queryRadius(x, z, r, out as PropObj[], filter),
      shopsNear: (x: number, z: number, r: number, out: Shop[]): number => store.shopsNear(x, z, r, out as ShopObj[]),
      damage(prop: Prop, amount: number, kind: DamageKind, byId: EntityId): void {
        const p = self.own(prop);
        if (p) m.damage.damage(p, amount, kind, byId);
      },
      damageShop(shop: Shop, amount: number, kind: DamageKind, byId: EntityId): void {
        const s = self.ownShop(shop);
        if (s) m.shops.damageShop(s, amount, kind, byId);
      },
      loot(shop: Shop, byId: EntityId): number {
        const s = self.ownShop(shop);
        return s ? m.shops.loot(s, byId) : 0;
      },
      push(prop: Prop, dirX: number, dirZ: number, force: number, byId: EntityId): void {
        const p = self.own(prop);
        if (p) m.motion.push(p, dirX, dirZ, force, byId);
      },
      tag(target: Prop | Shop, byId: EntityId): void {
        if (target instanceof ShopObj) m.shops.tag(target, byId);
        else if (target instanceof PropObj) m.damage.tagProp(target, byId);
      },
      resolveCircle: (pos: Vec2, radius: number): boolean => store.resolveCircle(pos, radius),
      raycast: (ax: number, az: number, bx: number, bz: number, out: RayHit, mode?: 'move' | 'sight'): boolean =>
        store.raycast(ax, az, bx, bz, out, mode),
    };
  }

  // ───────────────────────────── service étendu ─────────────────────────────

  private makeExt(): PropsExtApi {
    const m = this.m;
    const k = m.k;
    const store = m.store;
    const self = this;
    return {
      get tuning(): PropsTuning {
        return k.tuning;
      },
      resetTuning(): void {
        Object.assign(k.tuning, defaultTuning());
      },
      get stats(): Readonly<PropsStats> {
        const s = k.stats;
        s.props = store.list.length;
        s.shops = store.shops.length;
        s.awake = m.sweep.countAwake();
        s.moving = store.moving.length;
        s.carried = store.carried.length;
        s.burning = store.burning.length;
        s.burningShops = store.burningShops.length;
        s.barricades = store.barricades.length;
        s.tiles = m.tiles.tileCount;
        s.pendingTiles = m.tiles.pending;
        return s;
      },
      def: (kind: PropKind): PropDef => propDef(kind),
      propView(prop: Prop, out?: PropView): PropView | null {
        if (!(prop instanceof PropObj)) return null;
        const v = out ?? ({} as PropView);
        v.def = prop.def;
        v.maxHp = prop.maxHp;
        v.panesLeft = prop.panes;
        v.heat = prop.act & ACT_BURNING ? 1 : prop.heat < 1 ? prop.heat : 1;
        v.fuelMax = prop.fuelMax;
        v.battery = prop.battery;
        v.yieldLeft = prop.yieldLeft;
        v.movedBy = prop.movedBy;
        return v;
      },
      shopView(shop: Shop, out?: ShopView): ShopView | null {
        if (!(shop instanceof ShopObj)) return null;
        return m.shops.view(shop, out ?? emptyShopView());
      },
      barricadeParts: (id: EntityId): readonly BarricadePart[] => m.barricades.partsOf(id),
      ignite(prop: Prop, byId: EntityId): boolean {
        const p = self.own(prop);
        return p ? m.fire.ignite(p, byId) : false;
      },
      extinguish(prop: Prop, byId: EntityId): void {
        const p = self.own(prop);
        if (p) m.fire.extinguish(p, byId, true);
      },
      igniteShop(shop: Shop, byId: EntityId): boolean {
        const s = self.ownShop(shop);
        return s ? m.shops.ignite(s, byId, false) : false;
      },
      extinguishShop(shop: Shop, byId: EntityId): void {
        const s = self.ownShop(shop);
        if (s) m.shops.extinguish(s, byId, true);
      },
      topple(prop: Prop, dirX: number, dirZ: number, byId: EntityId): boolean {
        const p = self.own(prop);
        return p ? m.motion.topple(p, dirX, dirZ, byId) : false;
      },
      carry(prop: Prop, by: Person): boolean {
        const p = self.own(prop);
        return p ? m.motion.carry(p, by) : false;
      },
      drop: (by: Person): boolean => m.motion.drop(by),
      lootable(shop: Shop): boolean {
        const s = self.ownShop(shop);
        return s ? m.shops.lootable(s) : false;
      },
      setShutter(shop: Shop, closed: boolean, instant?: boolean): boolean {
        const s = self.ownShop(shop);
        return s ? m.shops.setShutter(s, closed, instant === true) : false;
      },
      mapKind: (kind: string): PropKind | '' => mapFurnitureKind(kind),
      shopName: (category: ShopCategory, seed: number): string => shopName(category, k.ctx.rng.fork(`props:enseigne:${seed}`)),
      flushTiles: (): void => m.tiles.flush(),
      populateTile: (tx: number, tz: number): number => m.tiles.populate(tx, tz),
    };
  }
}
