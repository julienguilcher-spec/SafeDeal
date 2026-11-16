/* =====================================================================================
 * CIRCULATION — un automobiliste qu'on fait dégager : il libère la chaussée.
 *
 * Demande du commanditaire : « un bus me bloquait […] je le fais dégager avec un bouton », « avec la sirène ».
 *
 *   déclenchement  ordre d'un policier à pied (interaction « Faire circuler ce véhicule », TrafficApi.clearOff) ;
 *                  deux-tons d'un véhicule de police ou de secours ARRÊTÉ (ou au pas) à moins de 25 m derrière
 *                  lui, dans son couloir — la règle « se ranger » (car-watch.ts) ne vaut que pour une sirène qui
 *                  roule, et un véhicule trop long pour se ranger restait planté devant elle ;
 *   manœuvre       il se serre à droite, au besoin à cheval sur le trottoir (jamais contre une façade), jusqu'à
 *                  laisser un couloir de 3,4 m à sa gauche : en avant s'il a de la place, sinon en marche arrière,
 *                  en plusieurs reprises (créneau), au pas ; il s'arrête et klaxonne si quelqu'un est dans son
 *                  chemin ou contre son flanc : la manœuvre ne blesse personne ;
 *   reprise        rangé, il attend que le véhicule de police soit passé et que sa propre voie se soit libérée
 *                  devant lui (une foule le retient : il reste rangé), puis repart vers sa destination.
 * Le conducteur écrit lui-même Vehicle.cmd pendant la manœuvre (le pilote automatique est arrêté).
 * ===================================================================================== */

import type { EntityId, GameContext, InteractionOption, Person, RoadSample, Vehicle } from '@/core/contracts';
import type { TrafficApi } from './api';
import type { CarBrain } from './car-brain';
import { MODE_CLEAR, MODE_HOLD, MODE_PARK } from './car-brain';
import type { Cars } from './cars';
import { CP_BOX } from './route';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';

/** Portée du deux-tons d'un véhicule arrêté : les véhicules arrêtés devant lui à moins de … m dégagent (m). */
export const CLEAR_SIREN_RANGE = 25;
/** Couloir laissé libre à gauche du véhicule rangé (m) : un fourgon ou un engin y passe. */
export const CLEAR_CORRIDOR = 3.4;
/** Allure de la manœuvre (m/s). */
const CLEAR_SPEED = 1.6;
/** Au-delà, la manœuvre est abandonnée là où il en est (s). */
const CLEAR_GIVE_UP = 45;
/** Rangé, il attend au moins … avant de repartir (s). */
const CLEAR_MIN_WAIT = 8;
/** Longueur maximale d'une reprise de la manœuvre (m). */
const CLEAR_RUN = 10;
/** Garde au-devant de ce qui l'arrête (personne, véhicule, façade) pendant la manœuvre (m). */
const CLEAR_GAP = 0.7;

export class CarClearer {
  private scanT = 0;
  private readonly near: Vehicle[] = [];
  private readonly people: Person[] = [];
  private readonly road: RoadSample = makeRoadSample();

  constructor(private readonly k: TrafficKernel, private readonly cars: Cars) {
  }

  reset(): void {
    this.scanT = 0;
  }

  // ───────────────────────────── déclenchement ─────────────────────────────

  /**
   * Fait dégager le véhicule de cette fiche (ordre de `byId`, véhicule ou personne). false s'il n'y a pas de rue
   * sous lui (il ne sait pas où se ranger).
   */
  start(b: CarBrain, byId: EntityId, siren: boolean): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const v = b.v;
    const now = ctx.clock.now;
    if (b.mode === MODE_CLEAR) {
      // déjà en train de dégager : l'ordre est renouvelé (il attendra ce nouveau venu)
      b.clearBy = byId;
      if (b.clearDone >= 0) b.clearDone = now;
      return true;
    }
    const road = this.road;
    if (!ctx.world.nearestRoad(v.x, v.z, road, 14)) return false;
    // axe de la rue, orienté dans son sens de marche
    let dx = Math.sin(road.heading);
    let dz = Math.cos(road.heading);
    if (dx * Math.sin(v.heading) + dz * Math.cos(v.heading) < 0) {
      dx = -dx;
      dz = -dz;
    }
    b.clearAx = road.x;
    b.clearAz = road.z;
    b.clearDx = dx;
    b.clearDz = dz;
    const half = road.width * 0.5;
    const lat0 = this.lateral(b);
    // au moins serré contre la bordure ; davantage (à cheval sur le trottoir) s'il faut laisser le couloir
    const want = Math.max(b.halfW + CLEAR_CORRIDOR - half, half - b.halfW - 0.25);
    let off = want;
    while (off > lat0 + 0.1 && !this.fits(b, off)) off -= 0.25;
    b.clearOff = Math.max(off, Math.min(lat0, want));
    if (b.mode === MODE_PARK && this.cars.parking) {
      this.cars.parking.release(b.parkSlot);
      b.parkSlot = -1;
    }
    // il rend ses réservations de carrefour : il n'y passera pas de sitôt
    const r = b.route;
    for (let i = r.cpNext; i < r.cpCount; i++) {
      const cp = r.cps[i]!;
      cp.cleared = false;
      if ((cp.kind & CP_BOX) !== 0) k.boxes.release(cp.node, v.id);
    }
    if (this.cars.ap) this.cars.ap.stop(v);
    b.mode = MODE_CLEAR;
    b.holdCp = null;
    b.clearBy = byId;
    b.clearAt = now;
    b.clearDone = -1;
    b.clearSign = 0;
    b.clearRun = 0;
    b.clearStall = 0;
    b.clearHorn = 0;
    b.cause = siren ? 'sirene' : '';
    b.status.mode = 'range';
    b.status.cause = b.cause;
    return true;
  }

  /**
   * Deux fois par seconde : un véhicule de police ou de secours, deux-tons allumé, arrêté ou au pas derrière des
   * véhicules de la circulation arrêtés dans son couloir à moins de 25 m : ils dégagent.
   */
  update(dt: number): void {
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.5;
    const ctx = this.k.ctx;
    const list = ctx.vehicles.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (s.siren === 0 || s.def.flying || s.dormant || Math.abs(s.speed) > 2 || this.cars.byVehicle.has(s.id)) continue;
      if (s.state !== 'ok' && s.state !== 'damaged') continue;
      this.clearAhead(s, CLEAR_SIREN_RANGE, true);
    }
  }

  /**
   * Fait dégager les véhicules de la circulation arrêtés devant `s`, dans son couloir, à moins de `range` m de son
   * pare-chocs. Retourne leur nombre.
   */
  clearAhead(s: Vehicle, range: number, siren: boolean): number {
    const ctx = this.k.ctx;
    const hx = Math.sin(s.heading);
    const hz = Math.cos(s.heading);
    const halfL = s.def.length * 0.5;
    const halfW = s.def.width * 0.5;
    const list = this.near;
    const reach = halfL + range * 0.5;
    const n = ctx.vehicles.queryRadius(s.x + hx * reach, s.z + hz * reach, range * 0.5 + 14, list);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const o = list[i]!;
      if (o === s) continue;
      const b = this.cars.byVehicle.get(o.id);
      if (!b || Math.abs(o.speed) > 1) continue;
      const rx = o.x - s.x;
      const rz = o.z - s.z;
      const along = rx * hx + rz * hz;
      const lat = -rx * hz + rz * hx;
      // demi-emprise de l'autre, en long et en travers de mon axe
      const sn = Math.abs(Math.sin(o.heading) * hx + Math.cos(o.heading) * hz);
      const cs = Math.sqrt(Math.max(0, 1 - sn * sn));
      const extL = 0.5 * (o.def.length * sn + o.def.width * cs);
      const extW = 0.5 * (o.def.width * sn + o.def.length * cs);
      if (along - extL > halfL + range || along + extL < halfL - 0.5) continue;
      if (Math.abs(lat) > halfW + extW + 0.4) continue;
      if (b.mode === MODE_CLEAR && b.clearBy === s.id) continue;
      if (passable(ctx, o, s.def.width)) continue;
      if (this.start(b, s.id, siren)) count++;
    }
    list.length = 0;
    return count;
  }

  // ───────────────────────────── manœuvre ─────────────────────────────

  /** Écart à droite de l'axe de la rue (m). */
  private lateral(b: CarBrain): number {
    const v = b.v;
    return -(v.x - b.clearAx) * b.clearDz + (v.z - b.clearAz) * b.clearDx;
  }

  /** Le véhicule tient-il, à `off` m à droite de l'axe, sans toucher une façade ni un obstacle fixe ? */
  private fits(b: CarBrain, off: number): boolean {
    const world = this.k.ctx.world;
    const v = b.v;
    const rx = -b.clearDz;
    const rz = b.clearDx;
    const along0 = (v.x - b.clearAx) * b.clearDx + (v.z - b.clearAz) * b.clearDz;
    const edge = off + b.halfW + 0.3;
    for (let s = -b.halfL; s <= b.halfL + 0.01; s += 1.5) {
      const x = b.clearAx + b.clearDx * (along0 + s) + rx * edge;
      const z = b.clearAz + b.clearDz * (along0 + s) + rz * edge;
      if (!world.isFree(x, z, 0.3)) return false;
      const surf = world.surfaceAt(x, z);
      if (surf === 'building' || surf === 'water') return false;
    }
    return true;
  }

  /**
   * Place libre devant (sign = 1) ou derrière (−1) le véhicule, dans son axe (m, plafonnée à 6) ; 0 si quelqu'un se
   * tient contre son flanc droit alors qu'il s'y déporte.
   */
  private room(b: CarBrain, sign: number, toRight: boolean): number {
    const ctx = this.k.ctx;
    const v = b.v;
    const hx = Math.sin(v.heading) * sign;
    const hz = Math.cos(v.heading) * sign;
    let free = 6;
    // façades et obstacles fixes
    const world = ctx.world;
    for (let d = 0.5; d <= free; d += 0.5) {
      const cx = v.x + hx * (b.halfL + d);
      const cz = v.z + hz * (b.halfL + d);
      if (!world.isFree(cx, cz, 0.3) || !world.isFree(cx - hz * b.halfW * 0.9, cz + hx * b.halfW * 0.9, 0.25)
        || !world.isFree(cx + hz * b.halfW * 0.9, cz - hx * b.halfW * 0.9, 0.25)) {
        free = d - 0.5;
        break;
      }
    }
    // personnes : devant, ou contre le flanc vers lequel il se déporte
    const people = this.people;
    const n = ctx.people.queryRadius(v.x, v.z, b.halfL + 8, people);
    for (let i = 0; i < n; i++) {
      const p = people[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      const rx = p.x - v.x;
      const rz = p.z - v.z;
      const along = rx * hx + rz * hz;
      const lat = -rx * hz + rz * hx; // positif à droite du sens de déplacement
      const side = sign > 0 ? lat : -lat; // positif à droite du véhicule
      if (Math.abs(lat) < b.halfW + 0.6 && along > b.halfL - 0.5) free = Math.min(free, along - b.halfL - CLEAR_GAP);
      if (toRight && along > -b.halfL - 0.5 && along < b.halfL + 1 && side > b.halfW - 0.2 && side < b.halfW + 1.2) free = 0;
    }
    people.length = 0;
    // autres véhicules
    const list = this.near;
    const m = ctx.vehicles.queryRadius(v.x, v.z, b.halfL + 14, list);
    for (let i = 0; i < m; i++) {
      const o = list[i]!;
      if (o === v || o.def.flying) continue;
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      const along = rx * hx + rz * hz;
      const lat = -rx * hz + rz * hx;
      const sn = Math.abs(Math.sin(o.heading) * hx + Math.cos(o.heading) * hz);
      const cs = Math.sqrt(Math.max(0, 1 - sn * sn));
      const extL = 0.5 * (o.def.length * sn + o.def.width * cs);
      const extW = 0.5 * (o.def.width * sn + o.def.length * cs);
      if (Math.abs(lat) > b.halfW + extW + 0.2 || along - extL < b.halfL - 1) continue;
      free = Math.min(free, along - extL - b.halfL - CLEAR_GAP);
    }
    list.length = 0;
    return free > 0 ? free : 0;
  }

  /** À chaque pas : commandes du conducteur pendant la manœuvre (le pilote automatique est arrêté). */
  step(b: CarBrain, dt: number): void {
    const v = b.v;
    const c = v.cmd;
    const ap = this.cars.ap;
    if ((ap && ap.isActive(v)) || b.clearDone >= 0) {
      // le pilote automatique finit de freiner, ou il est rangé : frein serré
      if (!ap || !ap.isActive(v)) {
        c.throttle = 0;
        c.brake = 1;
        c.steer = 0;
        c.handbrake = Math.abs(v.speed) < 0.2;
      }
      return;
    }
    const now = this.k.ctx.clock.now;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    // cap par rapport à l'axe de la rue : positif tourné vers la droite
    const psi = Math.atan2(-hx * b.clearDz + hz * b.clearDx, hx * b.clearDx + hz * b.clearDz);
    const lat = this.lateral(b);
    const err = b.clearOff - lat;
    // rangé : le coin avant gauche (ou arrière) ne mord plus sur le couloir laissé à gauche, et il est droit
    const leftMost = lat - b.halfW * Math.cos(psi) - b.halfL * Math.abs(Math.sin(psi));
    if ((leftMost > b.clearOff - b.halfW - 0.2 && err > -0.8 && Math.abs(psi) < 0.06) || now - b.clearAt > CLEAR_GIVE_UP) {
      this.done(b, now);
      return;
    }
    // sens de marche : en avant dès qu'il y a de la place (la manœuvre converge mieux), en marche arrière quand
    // l'avant est pris, le temps de se redonner de la place (créneau)
    const toRight = err > 0;
    const fwd = this.room(b, 1, toRight);
    const back = this.room(b, -1, toRight);
    // (chaque reprise va jusqu'au bout de la place, une dizaine de mètres au plus)
    const more = b.clearRun < CLEAR_RUN;
    let sign = 0;
    if (b.clearSign === -1 && back >= 0.6 && more) sign = -1;
    else if (b.clearSign === 1 && fwd >= 0.6 && more) sign = 1;
    else if (fwd >= 0.6 && (b.clearSign !== 1 || back < 0.6)) sign = 1;
    else if (back >= 0.6) sign = -1;
    // (sens imposé un instant après un calage, s'il y a la place)
    if (b.clearStall < 0 && b.clearSign !== 0 && (b.clearSign > 0 ? fwd : back) >= 0.6) sign = b.clearSign;
    if (sign !== b.clearSign) {
      if (b.clearStall > 0) b.clearStall = 0;
      b.clearRun = 0;
    }
    b.clearSign = sign;
    b.clearRun += Math.abs(v.speed) * dt;
    if (sign === 0) {
      // rien de libre (quelqu'un devant, derrière ou contre son flanc) : il attend, et klaxonne
      c.throttle = 0;
      c.brake = 1;
      c.steer = 0;
      c.handbrake = false;
      if (now >= b.clearHorn) {
        b.clearHorn = now + 3;
        if (this.cars.ext) this.cars.ext.horn(v, 0.6);
        else c.horn = true;
      }
      return;
    }
    // cap visé : vers l'écart voulu, d'autant plus franchement qu'il en est loin ; en marche arrière, la même
    // trajectoire se prend cap inversé
    const lim = 0.45;
    let psiWant = Math.max(-lim, Math.min(lim, err * 0.6));
    if (sign < 0) psiWant = -psiWant;
    let steer = Math.max(-1, Math.min(1, (psiWant - psi) * 3));
    if (sign < 0) steer = -steer;
    c.steer = steer;
    c.handbrake = false;
    c.horn = false;
    const u = v.speed * sign;
    if (u < -0.15) {
      // il roule encore dans l'autre sens : il s'arrête d'abord
      c.throttle = 0;
      c.brake = 1;
    } else if (u < CLEAR_SPEED) {
      c.throttle = sign * (u < 0.3 ? 0.6 : 0.35);
      c.brake = 0;
    } else {
      c.throttle = 0;
      c.brake = 0.25;
    }
    // il pousse sans avancer (bordure, borne, véhicule contre lui) : l'autre sens, une seconde au moins
    if (b.clearStall < 0) {
      b.clearStall = Math.min(0, b.clearStall + dt);
    } else if (Math.abs(v.speed) < 0.08) {
      b.clearStall += dt;
      if (b.clearStall > 2) {
        b.clearStall = -1.5;
        b.clearSign = -sign;
      }
    } else {
      b.clearStall = 0;
    }
  }

  private done(b: CarBrain, now: number): void {
    const c = b.v.cmd;
    c.throttle = 0;
    c.brake = 1;
    c.steer = 0;
    b.clearDone = now;
    b.clearSign = 0;
  }

  // ───────────────────────────── attente et reprise ─────────────────────────────

  /** Quatre fois par seconde (réflexion de l'automobiliste) : rangé, peut-il repartir ? */
  think(b: CarBrain): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    const v = b.v;
    b.status.mode = 'range';
    if (b.clearDone < 0) return;
    // d'ambiance, rangé depuis longtemps hors de la vue du joueur : il s'efface (il s'est garé plus loin)
    if (b.ambient && now - b.clearDone > 150 && !k.visible(v.x, v.z)) {
      this.cars.despawn(b);
      return;
    }
    if (now - b.clearDone < CLEAR_MIN_WAIT) return;
    if (this.waiting(b)) {
      b.clearDone = Math.max(b.clearDone, now - CLEAR_MIN_WAIT); // (pas de reprise avant que la voie se libère)
      return;
    }
    // il repart : vers sa destination si elle est devant lui, sinon vers une autre
    b.clearBy = 0;
    b.clearDone = -1;
    b.cause = '';
    b.status.cause = '';
    v.cmd.handbrake = false;
    b.mode = MODE_HOLD;
    b.holdCp = null;
    b.holdCause = '';
    b.failures = 0;
    if (!this.cars.go(b)) {
      b.tripDue = true;
      b.replanAt = now + 1;
    }
  }

  /** Doit-il rester rangé ? (le véhicule qui l'a fait dégager n'est pas passé, une sirène approche, sa voie est prise) */
  private waiting(b: CarBrain): boolean {
    const ctx = this.k.ctx;
    const v = b.v;
    const dx = b.clearDx;
    const dz = b.clearDz;
    const by = b.clearBy !== 0 ? ctx.vehicles.get(b.clearBy) : undefined;
    if (by) {
      const along = (by.x - v.x) * dx + (by.z - v.z) * dz;
      // encore derrière lui ou à sa hauteur, pas trop loin
      if (along < b.halfL + by.def.length * 0.5 + 3 && Math.hypot(by.x - v.x, by.z - v.z) < 45) return true;
    } else if (b.clearBy !== 0) {
      const p = ctx.people.get(b.clearBy);
      if (p && p.vehicleId === 0 && Math.hypot(p.x - v.x, p.z - v.z) < 20) return true;
    }
    // une sirène dans les parages, ou un véhicule de police arrêté juste derrière lui
    const list = this.near;
    const n = ctx.vehicles.queryRadius(v.x, v.z, 45, list);
    let wait = false;
    for (let i = 0; i < n && !wait; i++) {
      const o = list[i]!;
      if (o === v || o.def.flying || this.cars.byVehicle.has(o.id)) continue;
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      const along = rx * dx + rz * dz;
      const lat = -rx * dz + rz * dx;
      if (o.siren !== 0 && along < b.halfL + 3) wait = true;
      else if (o.faction === 'police' && along < 0 && along > -(b.halfL + 20) && lat < 1 && lat > -6) wait = true;
    }
    list.length = 0;
    if (wait) return true;
    // sa voie, devant lui, est-elle prise par des gens (manifestation) ?
    const people = this.people;
    const m = ctx.people.queryRadius(v.x + dx * (b.halfL + 12), v.z + dz * (b.halfL + 12), 13, people, (p) => p.vehicleId === 0 && !p.dormant);
    for (let i = 0; i < m && !wait; i++) {
      const p = people[i]!;
      const rx = p.x - b.clearAx;
      const rz = p.z - b.clearAz;
      const lat = -rx * dz + rz * dx;
      if (lat > -0.5 && lat < b.clearOff + b.halfW) wait = true;
    }
    people.length = 0;
    return wait;
  }
}

// ───────────────────────────── véhicule qui barre la voie ─────────────────────────────

const blockBuf: Vehicle[] = [];
const roadBuf: RoadSample = makeRoadSample();

/**
 * Reste-t-il, d'un côté ou de l'autre du véhicule `o`, de quoi faire passer un véhicule de `width` m sur la chaussée
 * (sa largeur et 0,9 m) ? (Inconnu, faute de rue sous lui : non.)
 */
export function passable(ctx: GameContext, o: Vehicle, width: number): boolean {
  const road = roadBuf;
  if (!ctx.world.nearestRoad(o.x, o.z, road, 14)) return false;
  const dx = Math.sin(road.heading);
  const dz = Math.cos(road.heading);
  const lat = -(o.x - road.x) * dz + (o.z - road.z) * dx;
  const sn = Math.abs(Math.sin(o.heading) * -dz + Math.cos(o.heading) * dx);
  const cs = Math.sqrt(Math.max(0, 1 - sn * sn));
  const ext = 0.5 * (o.def.length * sn + o.def.width * cs);
  const half = road.width * 0.5;
  const need = width + 0.9;
  return (lat - ext) + half >= need || half - (lat + ext) >= need;
}

/**
 * Véhicule à l'arrêt (circulation, garé, abandonné, épave) qui barre le couloir de `s` dans les `range` m devant son
 * pare-chocs (le plus proche), ou null. Le couloir : la largeur de `s` et 0,4 m de part et d'autre.
 */
export function blockerAhead(ctx: GameContext, s: Vehicle, range: number): Vehicle | null {
  const hx = Math.sin(s.heading);
  const hz = Math.cos(s.heading);
  const halfL = s.def.length * 0.5;
  const halfW = s.def.width * 0.5;
  const reach = halfL + range * 0.5;
  const list = blockBuf;
  const n = ctx.vehicles.queryRadius(s.x + hx * reach, s.z + hz * reach, range * 0.5 + 14, list);
  let best: Vehicle | null = null;
  let bestAlong = Infinity;
  for (let i = 0; i < n; i++) {
    const o = list[i]!;
    if (o === s || o.def.flying || o.dormant || Math.abs(o.speed) > 1) continue;
    // (un véhicule de la même colonne ou de la police n'est pas un obstacle à faire dégager)
    if (o.faction === 'police') continue;
    const rx = o.x - s.x;
    const rz = o.z - s.z;
    const along = rx * hx + rz * hz;
    const lat = -rx * hz + rz * hx;
    const sn = Math.abs(Math.sin(o.heading) * hx + Math.cos(o.heading) * hz);
    const cs = Math.sqrt(Math.max(0, 1 - sn * sn));
    const extL = 0.5 * (o.def.length * sn + o.def.width * cs);
    const extW = 0.5 * (o.def.width * sn + o.def.length * cs);
    if (along - extL > halfL + range || along + extL < halfL - 0.5) continue;
    if (Math.abs(lat) > halfW + extW + 0.4) continue;
    if (passable(ctx, o, s.def.width)) continue;
    if (along < bestAlong) {
      bestAlong = along;
      best = o;
    }
  }
  list.length = 0;
  return best;
}

// ───────────────────────────── « Faire circuler ce véhicule » ─────────────────────────────

/** Distance (m) d'un point au gabarit au sol d'un véhicule. */
function footprintDist(v: Vehicle, x: number, z: number): number {
  const hx = Math.sin(v.heading);
  const hz = Math.cos(v.heading);
  const rx = x - v.x;
  const rz = z - v.z;
  const along = Math.abs(rx * hx + rz * hz) - v.def.length * 0.5;
  const lat = Math.abs(-rx * hz + rz * hx) - v.def.width * 0.5;
  return Math.hypot(Math.max(0, along), Math.max(0, lat));
}

/** Portée de l'interaction depuis la carrosserie (m). */
const CLEAR_REACH = 2.6;

/**
 * Interaction « Faire circuler ce véhicule » (touche d'interaction, sans souris) : un policier à pied, près d'un
 * véhicule civil à l'arrêt avec son conducteur, le fait dégager (TrafficApi.clearOff). Sans personne au volant (garé,
 * abandonné, épave), l'option le dit : il faut le Centaure pour le pousser.
 */
export function registerClearOff(ctx: GameContext, api: TrafficApi): void {
  const opt: InteractionOption = { verb: 'faire_circuler', targetKind: 'vehicle', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
  const near: Vehicle[] = [];
  const target = (actor: Person, targetId?: EntityId): Vehicle | null => {
    if (actor.faction !== 'police' || actor.vehicleId !== 0 || actor.custody !== 'free' || actor.heldBy !== 0) return null;
    if (ctx.health.isIncapacitated(actor)) return null;
    const n = ctx.vehicles.queryRadius(actor.x, actor.z, 10, near);
    let best: Vehicle | null = null;
    let bestD = CLEAR_REACH;
    for (let i = 0; i < n; i++) {
      const v = near[i]!;
      if (targetId !== undefined && targetId !== 0 && v.id !== targetId) continue;
      if (v.faction === 'police' || v.faction === 'rescue' || v.def.flying || v.dormant || Math.abs(v.speed) > 1) continue;
      if (v.kind === 'velo' || v.kind === 'scooter') continue;
      // sans conducteur, seulement s'il barre vraiment la chaussée (pas chaque voiture garée le long du trottoir)
      if (api.motorist(v) === null && passable(ctx, v, 2.5)) continue;
      const d = footprintDist(v, actor.x, actor.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    near.length = 0;
    return best;
  };
  ctx.interactions.register({
    verb: 'faire_circuler',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      const v = target(actor, targetId);
      if (!v) return null;
      const driven = api.motorist(v) !== null;
      opt.targetId = v.id;
      opt.label = driven
        ? `Faire circuler ce véhicule — ${v.def.name}`
        : `${v.def.name} sans conducteur : il faut le Centaure pour le pousser`;
      // (avant « monter » dans le véhicule d'un automobiliste ; sans conducteur, seulement si rien d'autre)
      opt.priority = driven ? 58 : 6;
      opt.duration = driven ? 0.6 : 0;
      opt.x = v.x;
      opt.z = v.z;
      return opt;
    },
    begin: (actor: Person, o: InteractionOption): boolean => target(actor, o.targetId) !== null,
    complete(actor: Person, o: InteractionOption): void {
      const v = ctx.vehicles.get(o.targetId);
      if (!v) return;
      const r = api.clearOff(v, actor.id);
      if (!actor.isPlayer) return;
      if (r === 'ok') {
        ctx.ui.notify('« Circulez ! Dégagez la voie. » Le conducteur se range sur le côté.', 'ok', 4);
      } else if (r === 'sans_conducteur') {
        ctx.ui.notify(`${v.def.name} sans conducteur : il faut le Centaure pour le pousser (ordre « Dégager l’obstacle », ou demande par le menu Radio).`, 'warn', 6);
      } else {
        ctx.ui.notify('Ce véhicule ne peut pas dégager d’ici.', 'warn', 4);
      }
    },
  });
}
