/* =====================================================================================
 * Jet d'eau des canons (engin lanceur d'eau, lance du fourgon-pompe).
 *
 * Le jet est une trajectoire balistique partant de la buse ; il s'arrête au sol, contre un mur, un
 * véhicule ou un objet plus haut que lui, ou se disperse à sa portée maximale. Cinq fois par seconde :
 *   - les personnes prises dans le jet (partie basse de la trajectoire et gerbe d'impact) sont
 *     mouillées et REPOUSSÉES : ctx.health.hurt de type 'water' avec recul (m/s) dans l'axe du jet ;
 *     en jet droit à moins de 15 m le recul dépasse le seuil de chute ;
 *   - ctx.hazards.douse au point d'impact : éteint les feux, rabat gaz et fumée ; les véhicules en
 *     feu touchés sont éteints (événement 'hazards:douse', ou directement si personne ne l'émet) ;
 *   - les objets légers sont chassés et renversés ;
 *   - le tireur policier déclare l'emploi de la force ('canon_eau') quand le jet atteint quelqu'un.
 * Modes (docs/research/06-roles-jouables.md §8.2) : droit (15 l/s, 40 m utiles), diffusé (12 l/s,
 * 15 à 20 m, large), pluie (8 l/s, en cloche, trempe sans repousser).
 * ===================================================================================== */

import type { DamageInfo, EntityId, Person, Prop, RayHit, Vec2, Vehicle } from '@/core/contracts';
import { segmentParam } from '@/core/math';
import { makeRayHit } from '@/core/null-services';
import { GRAVITY } from './api';
import type { JetMode, JetSpec } from './api';
import type { DamageSystem } from './damage';
import type { TurretRt, VehicleKernel, VehicleRt } from './runtime';

/** Période des effets du jet (s). */
export const JET_EFFECT_PERIOD = 0.2;
/** En jet droit, en deçà de cette distance, le recul jette à terre (m). */
export const JET_KNOCKDOWN_RANGE = 15;
const MAX_SAMPLES = 64;

export function jetSpeed(spec: JetSpec, mode: JetMode): number {
  return mode === 'droit' ? spec.speed : mode === 'diffus' ? spec.speed * 0.6 : spec.speed * 0.8;
}

export function jetFlow(spec: JetSpec, mode: JetMode): number {
  return mode === 'droit' ? spec.flow : mode === 'diffus' ? spec.flow * 0.8 : spec.flow * 0.53;
}

/** Portée maximale d'un mode (m). */
export function jetReach(spec: JetSpec, mode: JetMode): number {
  return mode === 'droit' ? spec.range : mode === 'diffus' ? spec.range * 0.36 : spec.range * 0.72;
}

/** Demi-largeur du jet à une distance donnée de la buse (m). */
function jetRadius(mode: JetMode, dist: number): number {
  return mode === 'droit' ? 0.45 + 0.03 * dist : mode === 'diffus' ? 1.0 + 0.13 * dist : 1.5 + 0.06 * dist;
}

export class WaterJet {
  // trajectoire du dernier tracé
  private readonly px: number[] = [];
  private readonly py: number[] = [];
  private readonly pz: number[] = [];
  private readonly pg: number[] = [];
  private count = 0;
  /** Ce qui arrête le jet : 0 dispersion en l'air, 1 sol, 2 décor, 3 véhicule, 4 objet. */
  private stop = 0;
  private stopId: EntityId = 0;
  private readonly hit: RayHit = makeRayHit();
  private readonly people: Person[] = [];
  private readonly struck: Person[] = [];
  private readonly struckZone: number[] = [];
  private readonly struckDist: number[] = [];
  private readonly props: Prop[] = [];
  private readonly vehicles: Vehicle[] = [];
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  /** Un événement 'hazards:douse' a été reçu pendant notre propre appel à douse(). */
  douseSeen = false;

  constructor(private readonly k: VehicleKernel, private readonly damage: DamageSystem) {}

  /** Trace la trajectoire du jet depuis la buse ; renseigne le point d'impact de la tourelle. */
  trace(rt: VehicleRt, t: TurretRt, x: number, y: number, z: number, yaw: number, pitch: number, spec: JetSpec): void {
    const ctx = this.k.ctx;
    const world = ctx.world;
    const v = rt.v;
    const speed = jetSpeed(spec, t.mode);
    const reach = jetReach(spec, t.mode);
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const vh = speed * Math.cos(pitch);
    let vy = speed * Math.sin(pitch);
    let dts = 2 / (vh > 4 ? vh : 4);
    if (dts > 0.2) dts = 0.2;
    const hit = this.hit;
    const x0 = x;
    const z0 = z;
    let n = 0;
    this.px[n] = x;
    this.py[n] = y;
    this.pz[n] = z;
    this.pg[n] = world.heightAt(x, z);
    n++;
    this.stop = 0;
    this.stopId = 0;
    const clear = rt.radius + 0.4;
    while (n < MAX_SAMPLES) {
      let nx = x + dirX * vh * dts;
      let nz = z + dirZ * vh * dts;
      let ny = y + vy * dts - 0.5 * GRAVITY * dts * dts;
      vy -= GRAVITY * dts;
      let ground = world.heightAt(nx, nz);
      let stop = 0;
      let stopId: EntityId = 0;
      let bestT = 2;
      if ((y < ny ? y : ny) - ground < 30) {
        if (world.raycast(x, z, nx, nz, hit) && hit.hit) {
          const yAt = y + (ny - y) * hit.t;
          if (yAt < world.heightAt(hit.x, hit.z) + hit.height) {
            bestT = hit.t;
            stop = 2;
          }
        }
        // sorti de l'emprise de l'engin, le jet peut heurter un autre véhicule
        const ox = x - v.x;
        const oz = z - v.z;
        if (ox * ox + oz * oz > clear * clear && this.k.store.raycast(x, z, nx, nz, hit) && hit.hit && hit.id !== v.id && hit.t < bestT) {
          const other = this.k.store.get(hit.id);
          const yAt = y + (ny - y) * hit.t;
          if (other && yAt < other.y + other.def.height) {
            bestT = hit.t;
            stop = 3;
            stopId = hit.id;
          }
        }
        if (ctx.props.raycast(x, z, nx, nz, hit, 'move') && hit.hit && hit.t < bestT) {
          const yAt = y + (ny - y) * hit.t;
          if (yAt < world.heightAt(hit.x, hit.z) + hit.height) {
            bestT = hit.t;
            stop = 4;
            stopId = hit.id;
          }
        }
      }
      if (stop !== 0) {
        nx = x + (nx - x) * bestT;
        nz = z + (nz - z) * bestT;
        ny = y + (ny - y) * bestT;
        ground = world.heightAt(nx, nz);
      } else if (ny <= ground) {
        // touche le sol : point d'impact interpolé
        const prevG = this.pg[n - 1]!;
        const a = y - prevG;
        const b = ground - ny;
        const f = a + b > 1e-6 ? a / (a + b) : 1;
        nx = x + (nx - x) * f;
        nz = z + (nz - z) * f;
        ground = world.heightAt(nx, nz);
        ny = ground;
        stop = 1;
      }
      this.px[n] = nx;
      this.py[n] = ny;
      this.pz[n] = nz;
      this.pg[n] = ground;
      n++;
      x = nx;
      y = ny;
      z = nz;
      if (stop !== 0) {
        this.stop = stop;
        this.stopId = stopId;
        break;
      }
      const hx = x - x0;
      const hz = z - z0;
      if (hx * hx + hz * hz >= reach * reach) break; // le jet se disperse
    }
    this.count = n;
    t.impactX = x;
    t.impactY = y;
    t.impactZ = z;
    const lx = x - x0;
    const lz = z - z0;
    t.jetLength = Math.sqrt(lx * lx + lz * lz);
  }

  private strike(p: Person, zone: number, dist: number): void {
    if (p.vehicleId !== 0 || p.dormant) return;
    const struck = this.struck;
    const i = struck.indexOf(p);
    if (i >= 0) {
      // touchée par plusieurs tronçons : on garde l'impact le plus haut (le plus dangereux)
      if (zone > this.struckZone[i]!) this.struckZone[i] = zone;
      return;
    }
    struck.push(p);
    this.struckZone.push(zone);
    this.struckDist.push(dist);
  }

  /** Effets du jet pendant `dtE` secondes, le long de la trajectoire tracée. Retourne le nombre de personnes atteintes. */
  effects(rt: VehicleRt, index: number, spec: JetSpec, dtE: number): number {
    const t = rt.turrets[index]!;
    const ctx = this.k.ctx;
    const n = this.count;
    if (n < 2) return 0;
    const px = this.px;
    const py = this.py;
    const pz = this.pz;
    const pg = this.pg;
    const x0 = px[0]!;
    const z0 = pz[0]!;
    const mode = t.mode;
    const people = this.people;
    const struck = this.struck;
    struck.length = 0;
    this.struckZone.length = 0;
    this.struckDist.length = 0;

    // ── personnes prises dans la partie basse du jet ──
    for (let i = 1; i < n; i++) {
      const ha = py[i - 1]! - pg[i - 1]!;
      const hb = py[i]! - pg[i]!;
      if ((ha < hb ? ha : hb) > 2.1) continue;
      const ax = px[i - 1]!;
      const az = pz[i - 1]!;
      const bx = px[i]!;
      const bz = pz[i]!;
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      const dist = Math.sqrt((mx - x0) * (mx - x0) + (mz - z0) * (mz - z0));
      const r = jetRadius(mode, dist);
      const half = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) * 0.5;
      const found = ctx.people.queryRadius(mx, mz, r + half + 0.4, people);
      for (let j = 0; j < found; j++) {
        const p = people[j]!;
        const s = segmentParam(p.x, p.z, ax, az, bx, bz);
        const qx = ax + (bx - ax) * s;
        const qz = az + (bz - az) * s;
        const dx = p.x - qx;
        const dz = p.z - qz;
        const lim = r + p.radius;
        if (dx * dx + dz * dz > lim * lim) continue;
        const jetY = py[i - 1]! + (py[i]! - py[i - 1]!) * s;
        const rel = (jetY - p.y) / 1.75;
        if (rel > 1.15 || rel < -0.2) continue; // passe au-dessus de la tête, ou sous les pieds
        this.strike(p, rel < 0.05 ? 0.05 : rel > 1 ? 1 : rel, dist);
      }
    }
    // ── gerbe au point d'impact ──
    const ix = t.impactX;
    const iz = t.impactZ;
    const iDist = t.jetLength;
    const splash = jetRadius(mode, iDist) + 0.4;
    if (this.stop === 1 || this.stop === 2) {
      const found = ctx.people.queryRadius(ix, iz, splash, people);
      for (let j = 0; j < found; j++) this.strike(people[j]!, 0.25, iDist);
    }

    // ── recul, mouillage, blessures ──
    const gunner = t.byId !== 0 ? ctx.people.get(t.byId) ?? null : null;
    const force = !spec.rescue && gunner !== null && gunner.faction === 'police';
    const yaw = rt.v.heading - rt.v.turretYaw[index]!; // gisement positif = vers la droite
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const neutral = this.k.neutralHealth;
    for (let j = 0; j < struck.length; j++) {
      const p = struck[j]!;
      const dist = this.struckDist[j]!;
      let strength = dist <= spec.useful ? 1 : 1 - (dist - spec.useful) / Math.max(1, spec.range - spec.useful);
      if (strength < 0) strength = 0;
      let knock = 0;
      let rate = 0;
      if (mode === 'droit') {
        const close = dist < JET_KNOCKDOWN_RANGE;
        knock = close ? 4.5 : (3 - Math.min(1, (dist - JET_KNOCKDOWN_RANGE) / Math.max(1, spec.useful - JET_KNOCKDOWN_RANGE))) * strength;
        rate = close ? 6 : 1.5 * strength;
      } else if (mode === 'diffus') {
        knock = 1;
        rate = 0.4;
      }
      if (spec.rescue) {
        // lance de pompiers : elle bouscule un peu, elle ne blesse pas
        knock *= 0.4;
        rate = 0;
      }
      const info: DamageInfo = {
        amount: rate * dtE, kind: 'water', sourceId: t.byId, x: x0, z: z0, dirX, dirZ, zone: this.struckZone[j]!,
        knockback: knock, stun: knock > 4 ? 0.6 : 0,
      };
      if (force) info.means = 'canon_eau';
      ctx.health.hurt(p, info);
      if (neutral) {
        // la santé neutre n'applique ni mouillage ni recul : le module s'en charge
        p.wet = Math.min(1, p.wet + (mode === 'pluie' ? 0.25 : 0.5) * dtE * 2);
        if (knock > 0) {
          const tmp = this.tmp;
          tmp.x = p.x + dirX * knock * dtE;
          tmp.z = p.z + dirZ * knock * dtE;
          ctx.world.resolveCircle(tmp, p.radius);
          p.x = tmp.x;
          p.z = tmp.z;
        }
      }
    }
    if (force && struck.length > 0 && gunner) {
      t.reportT -= dtE;
      if (t.reportT <= 0) {
        t.reportT = 2.5;
        ctx.law.reportForce(gunner, 'canon_eau', struck[0]!, ix, iz);
      }
    }

    // ── extinction, objets ──
    if (this.stop !== 0) {
      const agent = spec.douse * dtE * (mode === 'droit' ? 1 : mode === 'diffus' ? 0.8 : 0.5);
      this.douseSeen = false;
      ctx.hazards.douse(ix, iz, splash + 0.5, agent);
      if (!this.douseSeen) this.douseVehicles(ix, iz, splash + 0.5, agent, t.byId);
      const found = ctx.props.queryRadius(ix, iz, splash, this.props);
      for (let j = 0; j < found; j++) {
        const prop = this.props[j]!;
        if (!prop.movable || prop.carriedBy !== 0 || mode === 'pluie') continue;
        ctx.props.push(prop, dirX, dirZ, (mode === 'droit' ? 3 : 1.2) * dtE * 5, t.byId);
        if (prop.hp <= 80) prop.toppled = true; // objets légers renversés
      }
      ctx.events.emit('fx', { id: 'eclaboussure', x: ix, y: t.impactY, z: iz, size: splash });
    }
    return struck.length;
  }

  /** Éteint les véhicules en feu dont l'emprise touche le disque arrosé. */
  douseVehicles(x: number, z: number, radius: number, amount: number, byId: EntityId): void {
    const n = this.k.store.queryRadius(x, z, radius, this.vehicles);
    for (let i = 0; i < n; i++) {
      const v = this.vehicles[i]!;
      if (v.state !== 'burning' && this.k.rt(v).heat <= 0) continue;
      this.damage.extinguish(this.k.rt(v), amount, byId);
    }
  }
}
