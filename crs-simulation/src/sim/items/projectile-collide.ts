/* =====================================================================================
 * COLLISIONS DES PROJECTILES — premier obstacle rencontré sur le segment parcouru pendant un pas.
 *
 * Le monde est quasi 2D : chaque obstacle est une emprise au sol + une hauteur. Un projectile le
 * heurte si sa trajectoire coupe l'emprise SOUS cette hauteur ; sinon il passe au-dessus (grenade
 * en cloche par-dessus une ligne de boucliers, un fourgon, une grille). Au-dessus d'un bâtiment, le
 * « sol » est son toit (ctx.world.buildingHeightAt).
 * ===================================================================================== */

import type { Person, Projectile, Prop, RayHit, Shop, Vehicle } from '@/core/contracts';
import { segmentSegment } from '@/core/math';
import type { SegmentHit } from '@/core/math';
import type { ProjState } from './projectiles';
import { bodyHeight } from './shared';
import type { ItemsCore } from './shared';

export const HIT_NONE = 0;
export const HIT_GROUND = 1;
export const HIT_WALL = 2;
export const HIT_PROP = 3;
export const HIT_VEHICLE = 4;
export const HIT_SHOP = 5;
export const HIT_PERSON = 6;

/** Altitudes (m au-dessus du sol) sous lesquelles chaque famille d'obstacles est testée. */
const PROP_MAX_HEIGHT = 9.5;
const VEHICLE_MAX_HEIGHT = 4.2;
const SHOP_MAX_HEIGHT = 3.2;
const PERSON_MAX_HEIGHT = 2.3;
/** Bas et haut d'une vitrine au-dessus du trottoir (m). */
const SHOP_SILL = 0.15;
const SHOP_TOP = 3;

export class ProjectileCaster {
  /** Fraction du segment au point de contact, et normale horizontale de l'obstacle. */
  t = 1;
  nx = 0;
  nz = 0;
  wallKind: RayHit['kind'] = 'building';
  prop: Prop | null = null;
  vehicle: Vehicle | null = null;
  shop: Shop | null = null;
  person: Person | null = null;
  /** Hauteur relative de l'impact sur la personne (0 pieds … 1 tête). */
  zone = 0;
  /** Altitude du sol (ou du toit) touché, pour HIT_GROUND. */
  floor = 0;

  private readonly segHit: SegmentHit = { t: 0, u: 0, x: 0, z: 0 };

  constructor(private readonly core: ItemsCore) {}

  /**
   * Cherche le premier obstacle entre (px, py, pz) et la position courante de `p`.
   * `ground` : altitude du terrain au point d'arrivée ; `floor` : terrain + toit éventuel.
   * Retourne un code HIT_* ; les champs de l'objet décrivent le contact.
   */
  cast(p: Projectile, st: ProjState, px: number, py: number, pz: number, ground: number, floor: number): number {
    const ctx = this.core.ctx;
    const spec = st.spec;
    const dx = p.x - px;
    const dy = p.y - py;
    const dz = p.z - pz;
    const len2 = dx * dx + dz * dz;
    let best = 2;
    let kind = HIT_NONE;
    this.prop = null;
    this.vehicle = null;
    this.shop = null;
    this.person = null;

    let nx = 0;
    let nz = 0;

    if (len2 > 1e-10) {
      const len = Math.sqrt(len2);
      const low = (py < p.y ? py : p.y) - spec.radius - ground;
      const hit = this.core.hit;

      // ── décor statique ──
      const tw = this.castWorld(px, py, pz, dx, dy, dz, len);
      if (tw < best) {
        best = tw;
        kind = HIT_WALL;
        nx = this.wnx;
        nz = this.wnz;
        this.wallKind = this.wkind;
      }

      // ── objets du décor ──
      if (low < PROP_MAX_HEIGHT && ctx.props.list.length > 0 && ctx.props.raycast(px, pz, p.x, p.z, hit) && hit.t < best) {
        const prop = ctx.props.get(hit.id);
        const y = py + dy * hit.t;
        if (prop && y - spec.radius - prop.y < hit.height) {
          best = hit.t;
          kind = HIT_PROP;
          this.prop = prop;
          nx = hit.nx;
          nz = hit.nz;
        }
      }

      // ── véhicules ──
      if (low < VEHICLE_MAX_HEIGHT && ctx.vehicles.list.length > 0 && ctx.vehicles.raycast(px, pz, p.x, p.z, hit) && hit.t < best) {
        const v = ctx.vehicles.get(hit.id);
        const y = py + dy * hit.t;
        if (v && y - spec.radius - v.y < hit.height) {
          best = hit.t;
          kind = HIT_VEHICLE;
          this.vehicle = v;
          nx = hit.nx;
          nz = hit.nz;
        }
      }

      // ── vitrines ──
      if (low < SHOP_MAX_HEIGHT && ctx.props.shops.length > 0) {
        // une vitrine est dans le plan de la façade : elle prime sur le mur qui la porte
        const ts = this.castShops(px, py, pz, dx, dy, dz, len, kind === HIT_WALL ? best + 0.4 / len : best);
        if (ts < 2) {
          best = ts;
          kind = HIT_SHOP;
          nx = this.snx;
          nz = this.snz;
        }
      }

      // ── personnes ──
      if (low < PERSON_MAX_HEIGHT) {
        const tp = this.castPeople(p, st, px, py, pz, dx, dy, dz, len, len2, best);
        if (tp < best) {
          best = tp;
          kind = HIT_PERSON;
          nx = 0;
          nz = 0;
        }
      }

      // ── façade franchie sans segment de collision : le « sol » bondit à hauteur de toit ──
      if (kind === HIT_NONE && floor - st.floorY > 1 && p.y - spec.radius < floor && py - spec.radius >= st.floorY) {
        this.t = 0;
        this.nx = -dx / len;
        this.nz = -dz / len;
        this.wallKind = 'building';
        return HIT_WALL;
      }
    }

    // ── sol ou toit ──
    if (kind !== HIT_NONE) {
      // un obstacle est atteint à la fraction `best` : jusque-là, le sol est celui du pas précédent
      // (au-delà d'une façade, le « sol » serait son toit)
      const hb = py + dy * best - spec.radius - st.floorY;
      if (hb < 0) {
        const h0 = py - spec.radius - st.floorY;
        this.t = h0 > hb ? (best * h0) / (h0 - hb) : 0;
        this.nx = 0;
        this.nz = 0;
        this.floor = st.floorY;
        return HIT_GROUND;
      }
    } else {
      const h1 = p.y - spec.radius - floor;
      if (h1 < 0) {
        const h0 = py - spec.radius - st.floorY;
        let tg = h0 > h1 ? h0 / (h0 - h1) : 0;
        if (tg < 0) tg = 0;
        else if (tg > 1) tg = 1;
        this.t = tg;
        this.nx = 0;
        this.nz = 0;
        this.floor = floor;
        return HIT_GROUND;
      }
    }
    this.nx = nx;
    this.nz = nz;
    this.t = best > 1 ? 1 : best;
    return kind;
  }

  private snx = 0;
  private snz = 0;
  private wnx = 0;
  private wnz = 0;
  private wkind: RayHit['kind'] = 'building';

  /** Mur ou grille du décor coupé sous sa hauteur. Retourne la fraction du segment, 2 si rien. */
  private castWorld(px: number, py: number, pz: number, dx: number, dy: number, dz: number, len: number): number {
    const world = this.core.ctx.world;
    const hit = this.core.hit;
    const ex = px + dx;
    const ez = pz + dz;
    let base = 0;
    let ax = px;
    let az = pz;
    for (let k = 0; k < 3; k++) {
      if (!world.raycast(ax, az, ex, ez, hit)) return 2;
      const t = base + hit.t * (1 - base);
      if (hit.height > 0.05) {
        const y = py + dy * t;
        if (y - world.heightAt(hit.x, hit.z) < hit.height) {
          this.wnx = hit.nx;
          this.wnz = hit.nz;
          this.wkind = hit.kind === 'barrier' ? 'barrier' : 'building';
          return t;
        }
      }
      // passe au-dessus : on repart juste après l'obstacle
      base = t + 0.02 / len;
      if (base >= 1) return 2;
      ax = px + dx * base;
      az = pz + dz * base;
    }
    return 2;
  }

  /** Vitrine traversée de l'extérieur, entre l'allège et le linteau. */
  private castShops(px: number, py: number, pz: number, dx: number, dy: number, dz: number, len: number, limit: number): number {
    const ctx = this.core.ctx;
    const shops = this.core.shops;
    const n = ctx.props.shopsNear(px + dx * 0.5, pz + dz * 0.5, len * 0.5 + 0.2, shops);
    const seg = this.segHit;
    let best = 2;
    for (let i = 0; i < n; i++) {
      const s = shops[i]!;
      const nx = Math.sin(s.heading);
      const nz = Math.cos(s.heading);
      if (dx * nx + dz * nz >= 0) continue; // vient de l'intérieur ou longe la façade
      const tx = nz * s.width * 0.5;
      const tz = -nx * s.width * 0.5;
      if (!segmentSegment(px, pz, px + dx, pz + dz, s.x - tx, s.z - tz, s.x + tx, s.z + tz, seg)) continue;
      if (seg.t >= best || seg.t > limit) continue;
      const h = py + dy * seg.t - s.y;
      if (h < SHOP_SILL || h > SHOP_TOP) continue;
      best = seg.t;
      this.shop = s;
      this.snx = nx;
      this.snz = nz;
    }
    return best;
  }

  /** Première personne dont le corps (cylindre de la hauteur de sa posture) est traversé. */
  private castPeople(
    p: Projectile, st: ProjState, px: number, py: number, pz: number,
    dx: number, dy: number, dz: number, len: number, len2: number, limit: number,
  ): number {
    const core = this.core;
    const people = core.people;
    const n = core.ctx.people.queryRadius(px + dx * 0.5, pz + dz * 0.5, len * 0.5 + 0.8, people);
    const radius = st.spec.radius;
    const age = p.age;
    let best = limit;
    let found: Person | null = null;
    let zone = 0;
    for (let i = 0; i < n; i++) {
      const q = people[i]!;
      if (q.vehicleId !== 0 || q.id === st.ignoreId) continue;
      if (q.id === p.ownerId) {
        if (age < st.ownerGrace) continue;
      } else if (age < st.factionGrace && q.faction === st.ownerFaction) {
        continue;
      }
      const r = q.radius + radius;
      const fx = px - q.x;
      const fz = pz - q.z;
      const c = fx * fx + fz * fz - r * r;
      const b = fx * dx + fz * dz;
      let tIn = 0;
      let tOut = 1;
      if (c > 0) {
        if (b >= 0) continue;
        const disc = b * b - len2 * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        tIn = (-b - sq) / len2;
        if (tIn > 1 || tIn >= best) continue;
        tOut = (-b + sq) / len2;
      } else {
        const disc = b * b - len2 * c;
        tOut = (-b + Math.sqrt(disc > 0 ? disc : 0)) / len2;
      }
      if (tOut > 1) tOut = 1;
      const feet = q.y;
      const height = bodyHeight(q);
      const top = feet + height;
      const yIn = py + dy * tIn;
      const yOut = py + dy * tOut;
      let tHit = tIn;
      let yHit = yIn;
      if (yIn > top) {
        if (yOut > top) continue;
        tHit = tIn + ((tOut - tIn) * (yIn - top)) / (yIn - yOut);
        yHit = top;
      } else if (yIn < feet) {
        if (yOut < feet) continue;
        tHit = tIn + ((tOut - tIn) * (feet - yIn)) / (yOut - yIn);
        yHit = feet;
      }
      if (tHit >= best) continue;
      best = tHit;
      found = q;
      zone = (yHit - feet) / height;
    }
    if (!found) return 2;
    this.person = found;
    this.zone = zone < 0 ? 0 : zone > 1 ? 1 : zone;
    return best;
  }
}
