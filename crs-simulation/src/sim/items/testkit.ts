/* =====================================================================================
 * Aides de test du module « items » (importées uniquement par tests/unit/items.*.test.ts) :
 * services factices qui enregistrent ce que le module leur demande, petit monde à murs, raccourcis.
 * ===================================================================================== */

import type {
  AimSolution, DamageKind, EntityId, EventName, GameContext, GameEvents, HazardApi, Person, PersonKind, Prop,
  PropApi, PropKind, RayHit, Shop, ShopInit, Vec2, WorldQuery,
} from '@/core/contracts';
import { clearRayHit } from '@/core/null-services';
import { distSqPointSegment, segmentSegment } from '@/core/math';
import type { SegmentHit } from '@/core/math';

// ───────────────────────────── dangers factices ─────────────────────────────

export interface HazardCall { x: number; z: number; amount: number; radius: number; color?: number; sourceId?: number; t: number }

export interface HazardRecorder {
  api: HazardApi;
  gas: HazardCall[];
  smoke: HazardCall[];
  fires: HazardCall[];
  douses: HazardCall[];
}

/** Service de dangers factice : enregistre chaque appel (avec l'instant de session). */
export function createHazardRecorder(ctx: GameContext): HazardRecorder {
  const rec: HazardRecorder = {
    gas: [], smoke: [], fires: [], douses: [],
    api: {
      emitGas(x, z, amount, radius) { rec.gas.push({ x, z, amount, radius, t: ctx.clock.now }); },
      emitSmoke(x, z, amount, radius, color) { rec.smoke.push({ x, z, amount, radius, color, t: ctx.clock.now }); },
      gasAt() { return 0; },
      smokeAt() { return 0; },
      ignite(x, z, radius, intensity, sourceId) { rec.fires.push({ x, z, amount: intensity, radius, sourceId, t: ctx.clock.now }); },
      fireAt() { return 0; },
      douse(x, z, radius, amount) { rec.douses.push({ x, z, amount, radius, t: ctx.clock.now }); },
      visibility() { return 1; },
      clear() {
        rec.gas.length = 0;
        rec.smoke.length = 0;
        rec.fires.length = 0;
        rec.douses.length = 0;
      },
    },
  };
  return rec;
}

// ───────────────────────────── décor factice ─────────────────────────────

export interface ShopDamageCall { shopId: EntityId; amount: number; kind: DamageKind; byId: EntityId }

export interface PropRecorder {
  api: PropApi;
  addShop(init: ShopInit): Shop;
  shopDamage: ShopDamageCall[];
  tags: EntityId[];
}

/**
 * Service de décor factice, réduit aux vitrines : une vitrine se fissure à 10 points de dégâts
 * cumulés et se brise à 20 ; chaque appel est enregistré. Aucun mobilier.
 */
export function createPropRecorder(ctx: GameContext): PropRecorder {
  const shops: Shop[] = [];
  const hp = new Map<EntityId, number>();
  const none: Prop[] = [];
  const rec: PropRecorder = {
    shopDamage: [],
    tags: [],
    addShop(init: ShopInit): Shop {
      const shop: Shop = {
        id: ctx.newId(), name: init.name ?? 'Boutique', category: init.category, x: init.x, y: 0, z: init.z,
        heading: init.heading, width: init.width, window: 'intact', shutter: init.shutter ?? 0,
        stock: init.stock ?? 1, appeal: init.appeal ?? 0.5, burning: 0, occupants: 0, dormant: false,
      };
      shops.push(shop);
      hp.set(shop.id, 0);
      return shop;
    },
    api: {
      list: none,
      shops,
      addShop(init: ShopInit): Shop { return rec.addShop(init); },
      removeShop(id: EntityId): void {
        const i = shops.findIndex((s) => s.id === id);
        if (i >= 0) shops.splice(i, 1);
      },
      get(): Prop | undefined { return undefined; },
      shop(id: EntityId): Shop | undefined { return shops.find((s) => s.id === id); },
      spawn(_kind: PropKind, _x: number, _z: number, _heading: number): Prop { throw new Error('décor factice : pas de mobilier'); },
      remove(): void {},
      clear(): void { shops.length = 0; },
      queryRadius(_x: number, _z: number, _r: number, out: Prop[]): number {
        out.length = 0;
        return 0;
      },
      shopsNear(x: number, z: number, r: number, out: Shop[]): number {
        out.length = 0;
        for (const s of shops) {
          const tx = Math.cos(s.heading) * s.width * 0.5;
          const tz = -Math.sin(s.heading) * s.width * 0.5;
          if (distSqPointSegment(x, z, s.x - tx, s.z - tz, s.x + tx, s.z + tz) <= r * r) out.push(s);
        }
        return out.length;
      },
      damage(): void {},
      damageShop(shop: Shop, amount: number, kind: DamageKind, byId: EntityId): void {
        rec.shopDamage.push({ shopId: shop.id, amount, kind, byId });
        const total = (hp.get(shop.id) ?? 0) + amount;
        hp.set(shop.id, total);
        const next = total >= 20 ? 'broken' : total >= 10 ? 'cracked' : shop.window;
        if (next !== shop.window) {
          shop.window = next;
          ctx.events.emit('shop:window', { id: shop.id, state: next, byId });
        }
      },
      loot(): number { return 0; },
      push(): void {},
      tag(target: Prop | Shop, byId: EntityId): void {
        rec.tags.push(target.id);
        if ('window' in target && target.window === 'intact') {
          target.window = 'tagged';
          ctx.events.emit('shop:window', { id: target.id, state: 'tagged', byId });
        }
      },
      resolveCircle(_pos: Vec2, _radius: number): boolean { return false; },
      raycast(_ax: number, _az: number, bx: number, bz: number, out: RayHit): boolean {
        clearRayHit(out, bx, bz);
        return false;
      },
    },
  };
  return rec;
}

// ───────────────────────────── monde factice ─────────────────────────────

export interface Wall { ax: number; az: number; bx: number; bz: number; height: number }
export interface Roof { minX: number; minZ: number; maxX: number; maxZ: number; height: number }

/** Monde plat avec quelques murs (segments de hauteur donnée) et toits (rectangles). */
export function withWalls(base: WorldQuery, walls: readonly Wall[], roofs: readonly Roof[] = []): WorldQuery {
  const seg: SegmentHit = { t: 0, u: 0, x: 0, z: 0 };
  const world = Object.create(base) as WorldQuery;
  world.raycast = (ax: number, az: number, bx: number, bz: number, out: RayHit): boolean => {
    let best = 2;
    let found: Wall | null = null;
    for (const w of walls) {
      if (segmentSegment(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz, seg) && seg.t < best) {
        best = seg.t;
        found = w;
      }
    }
    if (!found) {
      clearRayHit(out, bx, bz);
      return false;
    }
    let nx = -(found.bz - found.az);
    let nz = found.bx - found.ax;
    const l = Math.hypot(nx, nz);
    nx /= l;
    nz /= l;
    if (nx * (bx - ax) + nz * (bz - az) > 0) {
      nx = -nx;
      nz = -nz;
    }
    out.hit = true;
    out.t = best;
    out.x = ax + (bx - ax) * best;
    out.z = az + (bz - az) * best;
    out.nx = nx;
    out.nz = nz;
    out.kind = 'building';
    out.id = 0;
    out.height = found.height;
    return true;
  };
  world.lineOfSight = (ax: number, az: number, bx: number, bz: number): boolean => {
    for (const w of walls) if (w.height >= 1.7 && segmentSegment(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz)) return false;
    return true;
  };
  world.buildingHeightAt = (x: number, z: number): number => {
    for (const r of roofs) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.height;
    return 0;
  };
  return world;
}

// ───────────────────────────── raccourcis ─────────────────────────────

/** Fait apparaître une personne et lui donne des objets (dotation normale). */
export function spawn(ctx: GameContext, kind: PersonKind, x: number, z: number, heading = 0, items: readonly string[] = []): Person {
  const p = ctx.people.spawn({ kind, x, z, heading });
  for (const id of items) ctx.actions.give(p, id);
  return p;
}

/** Oriente le corps et la visée d'une personne. */
export function face(p: Person, yaw: number, pitch = 0): void {
  p.heading = yaw;
  p.aimYaw = yaw;
  p.aimPitch = pitch;
  p.cmd.aimYaw = yaw;
  p.cmd.aimPitch = pitch;
}

const solution: AimSolution = { yaw: 0, pitch: 0, power: 1, flightTime: 0 };

/** solveAim puis mise en joue ; retourne la solution (objet réutilisé) ou null si hors de portée. */
export function aimAt(ctx: GameContext, p: Person, tx: number, ty: number, tz: number): AimSolution | null {
  if (!ctx.actions.solveAim(p, tx, ty, tz, solution)) return null;
  face(p, solution.yaw, solution.pitch);
  return solution;
}

/** Enregistre toutes les occurrences d'un événement. */
export function record<K extends EventName>(ctx: GameContext, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  ctx.events.on(name, (e) => void out.push(e));
  return out;
}
