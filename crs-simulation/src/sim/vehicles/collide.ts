/* =====================================================================================
 * Collisions des véhicules terrestres.
 *
 *   - décor (ctx.world) : l'emprise est essayée par une file de disques le long de l'axe et un petit
 *     disque par coin ; chaque contact corrige position ET cap (corps rigide), annule la vitesse vers
 *     le mur (léger rebond, frottement le long de la paroi → on glisse) et abîme selon la vitesse ;
 *   - objets (ctx.props) : le mobilier léger est renversé et projeté, le lourd arrête le véhicule
 *     ou cède s'il reçoit assez d'énergie ; un engin à lame (canPush) dégage barricades et bancs ;
 *   - véhicules : boîtes orientées, impulsion avec rotation, dégâts partagés selon les masses ;
 *     un engin à lame repousse une épave ou un véhicule à l'arrêt jusqu'à sa masse limite ;
 *   - personnes : à basse vitesse la foule est repoussée (et retient le véhicule) ; au-delà, c'est
 *     un choc : ctx.health.hurt de type 'vehicle', et ctx.law.reportForce si le conducteur est policier.
 * Événement vehicle:collision pour chaque choc notable.
 * ===================================================================================== */

import type { DamageInfo, EntityId, EntityKind, Person, Prop, Vec2 } from '@/core/contracts';
import { circleVsObb } from '@/core/math';
import { CLEARED_EVENT, GRAVITY } from './api';
import { makeObbContact, obbVsObb } from './geometry';
import type { ObbContact } from './geometry';
import type { WorldCollider } from './physics';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Vitesse de choc (m/s) à partir de laquelle une personne est blessée : en dessous, elle est repoussée. */
export const PERSON_HIT_SPEED = 2.0;
/** Délai avant qu'une même personne puisse être heurtée de nouveau (s). */
const HIT_COOLDOWN = 2.5;
/** Interpénétration en deçà de laquelle deux véhicules sont considérés comme simplement voisins (m). */
const CONTACT_SLOP = 0.002;
/** Rebond contre le décor et entre véhicules. */
const RESTITUTION = 0.12;
const WALL_FRICTION = 0.35;
/** Travail de la lame sur un obstacle (points de structure par seconde, à 5 km/h). */
const BLADE_RATE = 100;
/** Effort que la foule oppose par personne repoussée (N). */
const CROWD_RESIST = 350;

/** Mobilier lourd qu'une lame peut dégager. */
function clearable(p: Prop): boolean {
  return p.kind === 'barricade' || p.kind === 'banc' || p.kind === 'jardiniere' || p.kind === 'pile_paves';
}

export class Collisions implements WorldCollider {
  private readonly pos: Vec2 = { x: 0, z: 0 };
  private readonly push: Vec2 = { x: 0, z: 0 };
  private readonly contact: ObbContact = makeObbContact();
  private readonly people: Person[] = [];
  private readonly props: Prop[] = [];
  /** Dernier choc par personne (temps de session) : une personne heurtée n'est pas blessée à chaque pas. */
  private readonly hitAt = new Map<EntityId, number>();
  /** Véhicules triés par bord ouest (balayage des collisions entre véhicules). */
  private readonly order: VehicleRt[] = [];
  private orderStamp = -1;

  constructor(private readonly k: VehicleKernel) {}

  reset(): void {
    this.hitAt.clear();
    this.order.length = 0;
    this.orderStamp = -1;
  }

  /** Dégâts de carrosserie pour une vitesse de choc (m/s). */
  crashDamage(rt: VehicleRt, speed: number): number {
    const s = speed - 1.2;
    return s > 0 ? s * s * 0.4 * rt.spec.toughness * this.k.tuning.crashDamage : 0;
  }

  /**
   * Signale un choc (événement vehicle:collision). Les contacts répétés d'un même accrochage sont
   * regroupés : retourne true seulement pour un choc nouveau (ou nettement plus fort que le précédent).
   */
  private emit(rt: VehicleRt, otherKind: EntityKind | 'world', otherId: EntityId, speed: number, x: number, z: number): boolean {
    if (speed < 0.5) return false;
    const now = this.k.ctx.clock.now;
    if (now - rt.lastHitAt < 0.25 && speed < rt.lastHitSpeed * 1.5) return false;
    rt.lastHitAt = now;
    rt.lastHitSpeed = speed;
    this.k.ctx.events.emit('vehicle:collision', { vehicleId: rt.v.id, otherKind, otherId, speed, x, z });
    return true;
  }

  /** Blesse les occupants lors d'un choc violent (les deux-roues n'ont aucune protection). */
  private hurtOccupants(rt: VehicleRt, impact: number, x: number, z: number): void {
    const two = rt.spec.handling.twoWheels;
    const from = two ? 3.5 : 7;
    if (impact <= from || rt.occupants === 0) return;
    const amount = (impact - from) * (two ? 8 : 3.5);
    const ctx = this.k.ctx;
    const seats = rt.v.seats;
    for (let i = 0; i < seats.length; i++) {
      if (seats[i] === 0) continue;
      const p = ctx.people.get(seats[i]!);
      if (!p) continue;
      const info: DamageInfo = { amount, kind: 'vehicle', sourceId: 0, x, z, zone: 0.6, stun: impact * 0.15 };
      ctx.health.hurt(p, info);
    }
  }

  /**
   * Réponse d'un véhicule à un contact contre un corps fixe : annule la vitesse vers l'obstacle au point
   * de contact (rebond léger), frotte le long de la paroi. Retourne la vitesse de choc (m/s, ≥ 0).
   */
  private bounce(rt: VehicleRt, cx: number, cz: number, nx: number, nz: number): number {
    const v = rt.v;
    const m = rt.mass;
    const I = m * rt.gyr2;
    const rx = cx - v.x;
    const rz = cz - v.z;
    const vpx = v.vx + v.yawRate * rz;
    const vpz = v.vz - v.yawRate * rx;
    const vn = vpx * nx + vpz * nz;
    if (vn >= 0) return 0;
    const cross = rz * nx - rx * nz;
    const j = (-(1 + RESTITUTION) * vn) / (1 / m + (cross * cross) / I);
    v.vx += (j * nx) / m;
    v.vz += (j * nz) / m;
    v.yawRate += (j * cross) / I;
    // frottement le long de la paroi
    const tx = -nz;
    const tz = nx;
    const vt = vpx * tx + vpz * tz;
    const crossT = rz * tx - rx * tz;
    let jt = -vt / (1 / m + (crossT * crossT) / I);
    const cap = WALL_FRICTION * j;
    if (jt > cap) jt = cap;
    else if (jt < -cap) jt = -cap;
    v.vx += (jt * tx) / m;
    v.vz += (jt * tz) / m;
    v.yawRate += (jt * crossT) / I;
    return -vn;
  }

  // ───────────────────────────── décor ─────────────────────────────

  world(rt: VehicleRt): boolean {
    const v = rt.v;
    const world = this.k.ctx.world;
    // dégrossissage : rien à faire au milieu d'une chaussée dégagée
    if (world.isFree(v.x, v.z, rt.radius + 0.1)) return false;
    const pos = this.pos;
    const k2 = rt.gyr2;
    let hit = false;
    let worst = 0;
    let wx = 0;
    let wz = 0;
    const nC = rt.circleF.length;
    for (let i = 0; i < nC; i++) {
      const sn = Math.sin(v.heading);
      const cs = Math.cos(v.heading);
      const f = rt.circleF[i]!;
      const l = rt.circleL[i]!;
      // décalage monde : avant·f + gauche·l
      const ox = sn * f + cs * l;
      const oz = cs * f - sn * l;
      const px = v.x + ox;
      const pz = v.z + oz;
      pos.x = px;
      pos.z = pz;
      if (!world.resolveCircle(pos, rt.circleR[i]!)) continue;
      const dx = pos.x - px;
      const dz = pos.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-6) continue;
      hit = true;
      const nx = dx / d;
      const nz = dz / d;
      // correction de corps rigide : translation + rotation qui déplacent ce point de d le long de n
      const cross = oz * nx - ox * nz;
      const p = d / (1 + (cross * cross) / k2);
      v.x += nx * p;
      v.z += nz * p;
      v.heading += (p * cross) / k2;
      const impact = this.bounce(rt, px, pz, nx, nz);
      if (impact > worst) {
        worst = impact;
        wx = px - nx * rt.circleR[i]!;
        wz = pz - nz * rt.circleR[i]!;
      }
    }
    if (worst > 0.6) {
      const dmg = this.crashDamage(rt, worst);
      if (dmg > 0) this.k.hurtVehicle(v, dmg, 'impact', 0, wx, wz);
      this.hurtOccupants(rt, worst, wx, wz);
      this.emit(rt, 'world', 0, worst, wx, wz);
    }
    return hit;
  }

  // ───────────────────────────── objets du décor ─────────────────────────────

  propsOf(rt: VehicleRt, dt: number): void {
    const v = rt.v;
    const ctx = this.k.ctx;
    if (ctx.props.list.length === 0) return;
    const buf = this.props;
    const n = ctx.props.queryRadius(v.x, v.z, rt.radius + 0.3, buf);
    if (n === 0) return;
    const c = this.contact;
    const driverId = rt.driverId;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    for (let i = 0; i < n; i++) {
      const prop = buf[i]!;
      if (prop.dormant || prop.carriedBy !== 0) continue;
      if (!obbVsObb(v.x, v.z, rt.halfW, rt.halfL, v.heading, prop.x, prop.z, prop.halfX, prop.halfZ, prop.heading, c)) continue;
      const rx = c.x - v.x;
      const rz = c.z - v.z;
      const vpx = v.vx + v.yawRate * rz;
      const vpz = v.vz - v.yawRate * rx;
      const closing = -(vpx * c.nx + vpz * c.nz); // > 0 : le véhicule avance sur l'objet
      const solid = prop.blocksMove && prop.state !== 'broken';

      if (!solid) {
        // débris, palette, cône : on roule dessus ; les plus légers sont chassés
        if (prop.movable && closing > 1) ctx.props.push(prop, -c.nx, -c.nz, Math.min(closing, 8) * 0.6, driverId);
        continue;
      }

      if (prop.movable) {
        // mobilier léger : renversé, projeté ; le véhicule est à peine ralenti
        if (closing > 0.2) {
          ctx.props.push(prop, -c.nx, -c.nz, Math.min(14, closing * 1.15 + 0.4), driverId);
          if (closing > 1.5) prop.toppled = true;
          rt.drag += 400;
          if (this.emit(rt, 'prop', prop.id, closing, c.x, c.z)) {
            if (closing > 2.5) ctx.props.damage(prop, (closing - 2.5) * 5 * Math.min(2, Math.sqrt(rt.mass / 1300)), 'vehicle', driverId);
            if (closing > 6) this.k.hurtVehicle(v, (closing - 6) * 0.6 * rt.spec.toughness, 'impact', 0, c.x, c.z);
          }
        }
        // l'objet sort de l'emprise même s'il est coincé
        prop.x -= c.nx * c.depth;
        prop.z -= c.nz * c.depth;
        continue;
      }

      // objet lourd ou fixe
      const front = c.nx * sn + c.nz * cs < -0.5 && rx * sn + rz * cs > rt.halfL - 1.0;
      if (v.def.canPush && front && clearable(prop)) {
        this.blade(rt, prop, c, sn, cs, dt);
        continue;
      }
      let broke = false;
      if (closing > 0.3) {
        const energy = (0.5 * rt.mass * closing * closing) / 1000; // kJ
        ctx.props.damage(prop, energy * 2, 'vehicle', driverId);
        broke = prop.hp <= 0 || prop.state === 'broken';
        const dmg = this.crashDamage(rt, closing) * (broke ? 0.5 : 1);
        if (dmg > 0) this.k.hurtVehicle(v, dmg, 'impact', 0, c.x, c.z);
        this.hurtOccupants(rt, closing * (broke ? 0.6 : 1), c.x, c.z);
        this.emit(rt, 'prop', prop.id, closing, c.x, c.z);
      }
      if (broke) {
        // l'obstacle cède : le véhicule passe en y laissant de la vitesse
        v.vx *= 0.7;
        v.vz *= 0.7;
        prop.toppled = true;
        continue;
      }
      v.x += c.nx * c.depth;
      v.z += c.nz * c.depth;
      this.bounce(rt, c.x, c.z, c.nx, c.nz);
    }
  }

  /** La lame pousse un obstacle lourd : il recule avec elle, se disloque, puis ne barre plus le passage. */
  private blade(rt: VehicleRt, prop: Prop, c: ObbContact, sn: number, cs: number, dt: number): void {
    const v = rt.v;
    const ctx = this.k.ctx;
    const driverId = rt.driverId;
    const u = v.vx * sn + v.vz * cs;
    prop.x -= c.nx * c.depth;
    prop.z -= c.nz * c.depth;
    prop.vx = 0;
    prop.vz = 0;
    // résistance : frottement de l'obstacle traîné (0,6 × son poids estimé)
    const mass = Math.min(4000, 900 * prop.halfX * prop.halfZ * prop.height * 4 * 0.35 + 150);
    rt.drag += 0.6 * mass * GRAVITY;
    if (u > 0.2) {
      const pace = u / 1.4;
      ctx.props.damage(prop, BLADE_RATE * dt * (pace < 0.3 ? 0.3 : pace > 1.6 ? 1.6 : pace), 'crush', driverId);
      const now = ctx.clock.now;
      if (now - rt.lastHitAt > 0.4) {
        rt.lastHitAt = now;
        rt.lastHitSpeed = u;
        ctx.events.emit('prop:moved', { id: prop.id, byId: driverId });
      }
    }
    if (prop.hp <= 0 || prop.state === 'broken') {
      prop.blocksMove = false;
      prop.toppled = true;
      // une barricade en feu se divise en plusieurs foyers quand on la pousse
      if (prop.burning > 0.1) {
        const pieces = this.k.rng.int(2, 5);
        for (let i = 0; i < pieces; i++) {
          ctx.hazards.ignite(prop.x + this.k.rng.range(-2, 2), prop.z + this.k.rng.range(-2, 2), 0.8, prop.burning * 0.5, 0);
        }
      }
      ctx.events.emitAny(CLEARED_EVENT, { vehicleId: v.id, propId: prop.id, x: prop.x, z: prop.z });
    }
  }

  // ───────────────────────────── véhicules entre eux ─────────────────────────────

  /**
   * Toutes les paires dont au moins un véhicule bouge. Balayage le long de l'axe x : les véhicules sont
   * tenus triés par leur bord ouest (tri par insertion, presque gratuit d'un pas au suivant), et chacun
   * n'est comparé qu'à ceux dont l'intervalle en x recouvre le sien.
   */
  vehicles(): void {
    const rts = this.k.rts;
    const order = this.order;
    if (order.length !== rts.length || this.orderStamp !== this.k.stamp) {
      order.length = 0;
      for (let i = 0; i < rts.length; i++) order.push(rts[i]!);
      this.orderStamp = this.k.stamp;
    }
    const n = order.length;
    for (let i = 1; i < n; i++) {
      const rt = order[i]!;
      const key = rt.v.x - rt.radius;
      let j = i - 1;
      while (j >= 0 && order[j]!.v.x - order[j]!.radius > key) {
        order[j + 1] = order[j]!;
        j--;
      }
      order[j + 1] = rt;
    }
    const c = this.contact;
    for (let i = 0; i < n; i++) {
      const A = order[i]!;
      const av = A.v;
      if (av.dormant || av.def.flying) continue;
      const maxX = av.x + A.radius;
      const awakeA = !A.dyn.asleep;
      for (let j = i + 1; j < n; j++) {
        const B = order[j]!;
        const bv = B.v;
        if (bv.x - B.radius > maxX) break;
        if (!awakeA && B.dyn.asleep) continue; // deux véhicules immobiles
        const dz = av.z - bv.z;
        const rr = A.radius + B.radius;
        if (dz > rr || dz < -rr) continue;
        const dx = av.x - bv.x;
        if (dx * dx + dz * dz >= rr * rr || bv.dormant || bv.def.flying) continue;
        if (!obbVsObb(av.x, av.z, A.halfW, A.halfL, av.heading, bv.x, bv.z, B.halfW, B.halfL, bv.heading, c)) continue;
        if (c.depth < CONTACT_SLOP) continue; // tôles qui se touchent à peine : pas un choc, on laisse dormir
        // le premier nommé est celui qui bouge (c'est lui qui signale le choc)
        if (awakeA) this.resolvePair(A, B, c);
        else {
          c.nx = -c.nx;
          c.nz = -c.nz;
          this.resolvePair(B, A, c);
        }
      }
    }
  }

  /** Le contact (normale n, de l'autre vers moi) est-il sur ma face avant ? */
  private frontHit(rt: VehicleRt, nx: number, nz: number, cx: number, cz: number): boolean {
    const v = rt.v;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    return nx * sn + nz * cs < -0.6 && (cx - v.x) * sn + (cz - v.z) * cs > rt.halfL - 1.0;
  }

  private resolvePair(A: VehicleRt, B: VehicleRt, c: ObbContact): void {
    const a = A.v;
    const b = B.v;
    const mA = A.mass;
    const mB = B.mass;
    const IA = mA * A.gyr2;
    const IB = mB * B.gyr2;
    const nx = c.nx;
    const nz = c.nz;
    // séparation, partagée selon les masses (un cheveu de plus : le contact ne se reproduit pas au pas suivant)
    const wA = mB / (mA + mB);
    const sep = c.depth + CONTACT_SLOP;
    a.x += nx * sep * wA;
    a.z += nz * sep * wA;
    b.x -= nx * sep * (1 - wA);
    b.z -= nz * sep * (1 - wA);

    const rAx = c.x - a.x;
    const rAz = c.z - a.z;
    const rBx = c.x - b.x;
    const rBz = c.z - b.z;
    const rvx = a.vx + a.yawRate * rAz - (b.vx + b.yawRate * rBz);
    const rvz = a.vz - a.yawRate * rAx - (b.vz - b.yawRate * rBx);
    const vn = rvx * nx + rvz * nz;

    // lame : pousser sans casser, et vaincre les freins de ce qu'on pousse
    const bladeA = a.def.canPush && this.frontHit(A, nx, nz, c.x, c.z);
    const bladeB = b.def.canPush && this.frontHit(B, -nx, -nz, c.x, c.z);
    if (bladeA && a.cmd.throttle > 0 && mB <= A.spec.pushMass) B.pushRelief = 0.5 * a.def.mass * a.def.accel;
    if (bladeB && b.cmd.throttle > 0 && mA <= B.spec.pushMass) A.pushRelief = 0.5 * b.def.mass * b.def.accel;

    A.awake = true;
    B.awake = true;
    if (vn >= 0) return;

    const crossA = rAz * nx - rAx * nz;
    const crossB = rBz * nx - rBx * nz;
    const j = (-(1 + RESTITUTION) * vn) / (1 / mA + 1 / mB + (crossA * crossA) / IA + (crossB * crossB) / IB);
    a.vx += (j * nx) / mA;
    a.vz += (j * nz) / mA;
    a.yawRate += (j * crossA) / IA;
    b.vx -= (j * nx) / mB;
    b.vz -= (j * nz) / mB;
    b.yawRate -= (j * crossB) / IB;
    // frottement tangent (tôles qui se frottent)
    const tx = -nz;
    const tz = nx;
    const vt = rvx * tx + rvz * tz;
    const cAt = rAz * tx - rAx * tz;
    const cBt = rBz * tx - rBx * tz;
    let jt = -vt / (1 / mA + 1 / mB + (cAt * cAt) / IA + (cBt * cBt) / IB);
    const cap = 0.4 * j;
    if (jt > cap) jt = cap;
    else if (jt < -cap) jt = -cap;
    a.vx += (jt * tx) / mA;
    a.vz += (jt * tz) / mA;
    a.yawRate += (jt * cAt) / IA;
    b.vx -= (jt * tx) / mB;
    b.vz -= (jt * tz) / mB;
    b.yawRate -= (jt * cBt) / IB;

    const impact = -vn;
    const gentlePush = (bladeA || bladeB) && impact < 4;
    if (impact > 1 && !gentlePush) {
      // chacun encaisse d'autant plus que l'autre est lourd
      const dA = this.crashDamage(A, impact) * 2 * (mB / (mA + mB));
      const dB = this.crashDamage(B, impact) * 2 * (mA / (mA + mB));
      const idA = A.driverId;
      const idB = B.driverId;
      if (dA > 0) this.k.hurtVehicle(a, dA, 'impact', idB, c.x, c.z);
      if (dB > 0) this.k.hurtVehicle(b, dB, 'impact', idA, c.x, c.z);
      this.hurtOccupants(A, impact * 2 * (mB / (mA + mB)), c.x, c.z);
      this.hurtOccupants(B, impact * 2 * (mA / (mA + mB)), c.x, c.z);
    }
    this.emit(A, 'vehicle', b.id, impact, c.x, c.z);
  }

  // ───────────────────────────── personnes ─────────────────────────────

  peopleOf(rt: VehicleRt): void {
    const v = rt.v;
    const ctx = this.k.ctx;
    const buf = this.people;
    const n = ctx.people.queryRadius(v.x, v.z, rt.radius + 0.6, buf);
    if (n === 0) return;
    const push = this.push;
    const pos = this.pos;
    const now = ctx.clock.now;
    let driver: Person | null = null;
    let driverKnown = false;
    for (let i = 0; i < n; i++) {
      const p = buf[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      if (!circleVsObb(p.x, p.z, p.radius, v.x, v.z, rt.halfW, rt.halfL, v.heading, push)) continue;
      const d = Math.sqrt(push.x * push.x + push.z * push.z);
      if (d < 1e-6) continue;
      const nx = push.x / d;
      const nz = push.z / d;
      const rx = p.x - v.x;
      const rz = p.z - v.z;
      const closing = (v.vx + v.yawRate * rz) * nx + (v.vz - v.yawRate * rx) * nz;
      // la personne sort de l'emprise ; si un mur l'en empêche, elle est coincée
      p.x += push.x;
      p.z += push.z;
      pos.x = p.x;
      pos.z = p.z;
      let squeezed = false;
      if (ctx.world.resolveCircle(pos, p.radius)) {
        p.x = pos.x;
        p.z = pos.z;
        squeezed = circleVsObb(p.x, p.z, p.radius * 0.5, v.x, v.z, rt.halfW, rt.halfL, v.heading, push);
      }
      if (closing <= 0.05) continue; // elle est venue d'elle-même contre le véhicule
      const lying = p.posture === 'down' || p.posture === 'prone';
      const isHit = closing >= PERSON_HIT_SPEED || (squeezed && closing > 0.3) || (lying && closing > 0.5);
      if (!isHit) {
        // foule repoussée : elle prend la vitesse du pare-chocs et retient le véhicule
        const pv = p.vx * nx + p.vz * nz;
        if (pv < closing) {
          p.vx += (closing - pv) * nx;
          p.vz += (closing - pv) * nz;
        }
        rt.drag += CROWD_RESIST + 120 * closing;
        continue;
      }
      const last = this.hitAt.get(p.id);
      if (last !== undefined && now - last < HIT_COOLDOWN) continue;
      if (this.hitAt.size > 1024) this.hitAt.clear();
      this.hitAt.set(p.id, now);
      if (!driverKnown) {
        driver = this.k.driver(rt);
        driverKnown = true;
      }
      const massFactor = Math.max(0.5, Math.min(1.6, Math.sqrt(rt.mass / 1300)));
      const police = driver !== null && driver.faction === 'police';
      const crushed = lying || squeezed;
      // projeté vers l'avant et vers le côté où il se trouvait : il sort de la trajectoire
      const sn = Math.sin(v.heading);
      const cs = Math.cos(v.heading);
      const side = rx * cs - rz * sn >= 0 ? 1 : -1; // > 0 : à gauche de l'axe du véhicule
      let dirX = nx + 0.6 * side * cs;
      let dirZ = nz - 0.6 * side * sn;
      const dl = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
      dirX /= dl;
      dirZ /= dl;
      const knock = crushed ? 0 : Math.min(9, closing * 0.9);
      const info: DamageInfo = {
        amount: (0.5 * closing * closing + 2 * closing) * massFactor + (crushed ? 15 * massFactor : 0),
        kind: crushed ? 'crush' : 'vehicle',
        sourceId: driver ? driver.id : 0,
        x: p.x,
        z: p.z,
        dirX,
        dirZ,
        zone: rt.halfW > 1.1 ? 0.55 : 0.35,
        stun: closing > 4 ? 1 + closing * 0.2 : 0.4,
        knockback: knock,
      };
      if (police) info.means = 'vehicule';
      ctx.health.hurt(p, info);
      if (this.k.neutralHealth && knock > 0) {
        // la santé neutre n'applique pas le recul : la personne est déplacée ici
        pos.x = p.x + dirX * knock * 0.5;
        pos.z = p.z + dirZ * knock * 0.5;
        ctx.world.resolveCircle(pos, p.radius);
        p.x = pos.x;
        p.z = pos.z;
      }
      // le véhicule cède un peu de sa vitesse
      const dv = (closing * 80) / (rt.mass + 80);
      v.vx -= nx * dv;
      v.vz -= nz * dv;
      this.k.ctx.events.emit('vehicle:collision', { vehicleId: v.id, otherKind: 'person', otherId: p.id, speed: closing, x: p.x, z: p.z });
      if (police && driver) ctx.law.reportForce(driver, 'vehicule', p, p.x, p.z);
    }
  }
}
