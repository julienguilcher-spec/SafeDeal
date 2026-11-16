/* =====================================================================================
 * CIRCULATION — ce qui arrive à un automobiliste en dehors de la régulation ordinaire :
 *   - véhicules en intervention : repérage des sirènes, feux et carrefours qui leur sont réservés,
 *     automobilistes qui se rangent ;
 *   - immobilisation (une fois par seconde) : cause du blocage, propagation dans la file (le bouchon
 *     remonte), klaxon, demi-tour ou contournement après un temps de patience, incident
 *     « automobiliste bloqué » ;
 *   - peur : fuite en voiture, ou abandon du véhicule quand il est pris dans une émeute.
 * ===================================================================================== */

import type { Person, RoadSample, Vehicle } from '@/core/contracts';
import type { BlockCause } from './api';
import type { CarBrain } from './car-brain';
import { MODE_GO, MODE_HOLD, MODE_PARK, MODE_PULL } from './car-brain';
import type { Cars } from './cars';
import type { EdgeHit, EdgePoint } from './graph';
import { E_ONEWAY, N_JUNCTION, N_SIGNAL, makeEdgeHit } from './graph';
import type { RoutePoint } from './route';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';

/** Véhicule en intervention repéré (sirène en marche). */
class Emergency {
  id = 0;
  x = 0;
  z = 0;
  dx = 0;
  dz = 1;
  speed = 0;
}

const MAX_EMERGENCIES = 8;

export class CarWatcher {
  private readonly emergencies: Emergency[] = [];
  private emergencyCount = 0;
  private scanT = 0;
  private readonly near: Vehicle[] = [];
  private readonly people: Person[] = [];
  private readonly rp: RoutePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly ep: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly road: RoadSample = makeRoadSample();
  private readonly protest = (p: Person): boolean => p.faction === 'protest' && p.vehicleId === 0;

  constructor(private readonly k: TrafficKernel, private readonly cars: Cars) {
    for (let i = 0; i < MAX_EMERGENCIES; i++) this.emergencies.push(new Emergency());
  }

  reset(): void {
    this.emergencyCount = 0;
    this.scanT = 0;
  }

  /** Une fois par pas : repérage des sirènes (2 fois par seconde), oubli des dangers passés. */
  update(dt: number): void {
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.5;
    const k = this.k;
    const now = k.ctx.clock.now;
    k.dangers.prune(now);
    k.obstructions.prune(now);
    this.scanEmergencies(now);
  }

  // ───────────────────────────── véhicules en intervention ─────────────────────────────

  private scanEmergencies(now: number): void {
    const k = this.k;
    const list = k.ctx.vehicles.list;
    let n = 0;
    for (let i = 0; i < list.length && n < MAX_EMERGENCIES; i++) {
      const v = list[i]!;
      if (v.siren === 0 || v.def.flying || v.dormant) continue;
      const sp = Math.abs(v.speed);
      if (sp < 0.5) continue;
      const e = this.emergencies[n++]!;
      e.id = v.id;
      e.x = v.x;
      e.z = v.z;
      const back = v.speed < 0 ? -1 : 1;
      e.dx = Math.sin(v.heading) * back;
      e.dz = Math.cos(v.heading) * back;
      e.speed = sp;
      this.preempt(e, now);
    }
    this.emergencyCount = n;
  }

  /** Réserve à la sirène les feux et les carrefours des 90 m devant elle, le long de la rue qu'elle suit. */
  private preempt(em: Emergency, now: number): void {
    const k = this.k;
    const c = k.cache;
    if (!c.ready) return;
    const road = this.road;
    if (!k.ctx.world.nearestRoad(em.x, em.z, road, 12)) return;
    let e = road.edgeId;
    if (e < 0 || e >= c.edgeCount || !c.isVehicle(e)) return;
    const hit = this.hit;
    c.project(e, em.x, em.z, hit);
    const forward = hit.dx * em.dx + hit.dz * em.dz >= 0;
    let node = forward ? c.edgeB[e]! : c.edgeA[e]!;
    let dist = forward ? c.edgeLen[e]! - hit.s : hit.s;
    const until = now + 1.2;
    const ep = this.ep;
    for (let hop = 0; hop < 14 && dist < 90; hop++) {
      // direction d'arrivée au nœud = opposée à la direction de l'arête quittant ce nœud
      c.dirFrom(e, node, ep);
      const inX = -ep.dx;
      const inZ = -ep.dz;
      const flags = c.nodeFlags[node]!;
      if ((flags & N_JUNCTION) !== 0) {
        k.boxes.preempt(node, inX, inZ, until);
        k.signals.preempt(k.signals.ctrlOf(node), inX, inZ, until);
      } else if ((flags & N_SIGNAL) !== 0) {
        const ctrl = k.signals.peek(node);
        if (ctrl) k.signals.preempt(ctrl, inX, inZ, until);
      }
      // suite : l'arête la plus dans l'axe
      let best = -1;
      let bestDot = 0.3;
      for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
        const e2 = c.adjEdge[j]!;
        if (e2 === e || !c.isVehicle(e2)) continue;
        if ((c.edgeFlags[e2]! & E_ONEWAY) !== 0 && c.edgeA[e2] !== node) continue;
        c.dirFrom(e2, node, ep);
        const dot = ep.dx * inX + ep.dz * inZ;
        if (dot > bestDot) {
          bestDot = dot;
          best = e2;
        }
      }
      if (best < 0) break;
      e = best;
      dist += c.edgeLen[e]!;
      node = c.other(e, node);
    }
  }

  /** Réaction à une sirène proche. true si l'automobiliste vient de se ranger (ou reste rangé). */
  emergency(b: CarBrain, now: number): boolean {
    const v = b.v;
    if (b.mode === MODE_PULL) {
      let passed = now > b.pullUntil;
      if (!passed) {
        passed = true;
        for (let i = 0; i < this.emergencyCount; i++) {
          const e = this.emergencies[i]!;
          if (e.id !== b.pullFor) continue;
          // encore derrière moi dans son sens de marche, ou encore en face
          const ahead = (v.x - e.x) * e.dx + (v.z - e.z) * e.dz;
          passed = ahead < -6;
        }
      }
      if (!passed) return true;
      b.pullFor = 0;
      if (!this.cars.go(b)) b.replanAt = now + 2;
      return false;
    }
    // déjà arrêté à une ligne (feu, carrefour) : il y reste, sur sa voie, sans avancer dans le carrefour
    if (this.emergencyCount === 0 || b.mode === MODE_PARK || b.mode === MODE_HOLD) return false;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    for (let i = 0; i < this.emergencyCount; i++) {
      const e = this.emergencies[i]!;
      if (e.id === v.id || e.speed < 1.5) continue;
      const rx = v.x - e.x;
      const rz = v.z - e.z;
      const ahead = rx * e.dx + rz * e.dz;
      if (ahead < 10 || ahead > 65) continue;
      const lat = rx * e.dz - rz * e.dx;
      if (lat > 7 || lat < -7) continue; // pas dans sa rue
      const same = hx * e.dx + hz * e.dz;
      if (same > -0.5 && same < 0.5) continue; // rue transversale : les feux et le carrefour s'en chargent
      // jamais d'arrêt dans un carrefour ni entre sa ligne d'arrêt et lui : trop près, il continue (il s'arrêtera
      // à la ligne si le feu ou la priorité le lui demandent)
      const r = b.route;
      if (r.cpNext < r.cpCount) {
        const cp = r.cps[r.cpNext]!;
        const need = Math.abs(v.speed) * 1.6 + 6 + b.halfL + 2;
        if (r.s + need > cp.stopS && r.s - b.halfL < cp.nodeS + cp.radius + 2) continue;
      }
      if (same >= 0.5) {
        // même sens : il ne se range que si la chaussée laisse ensuite le passage ; sinon il dégage devant elle
        const road = this.road;
        if (!this.k.ctx.world.nearestRoad(v.x, v.z, road, 8)) continue;
        if (road.width < (road.oneway ? 7 : 14)) continue;
      }
      this.cars.pullOver(b, e.id, 12);
      return true;
    }
    return false;
  }

  // ───────────────────────────── immobilisation, klaxon, peur ─────────────────────────────

  /** Une fois par seconde : pourquoi est-il arrêté, depuis combien de temps, et qu'en fait-il ? */
  watch(b: CarBrain, driver: Person, now: number): void {
    const k = this.k;
    const cars = this.cars;
    const ctx = k.ctx;
    const v = b.v;
    const ap = cars.ap!;
    const st = ap.status(v);
    const moving = Math.abs(v.speed) > 0.4;
    if (moving) {
      b.movingT++;
      b.stillT = 0;
    } else {
      b.stillT++;
      b.movingT = 0;
    }
    let cause: BlockCause = '';
    let direct = false;
    if (b.mode === MODE_HOLD) {
      cause = b.holdCause !== '' ? b.holdCause : 'carrefour';
      // tenu à sa ligne mais arrêté bien avant, derrière autre chose ?
      if (ap.isActive(v) && (st.state === 'attente' || st.state === 'bloque') && st.reason !== 'vehicule' && st.reason !== '') {
        cause = st.reason === 'personne' ? 'personne' : st.reason === 'obstacle' ? 'obstacle' : cause;
        direct = cause === 'personne' || cause === 'obstacle';
      }
    } else if (st.state === 'attente' || st.state === 'bloque') {
      switch (st.reason) {
        case 'personne': cause = 'personne'; direct = true; break;
        case 'obstacle': cause = 'obstacle'; direct = true; break;
        case 'fermeture': cause = 'fermeture'; break;
        case 'mur': cause = 'mur'; break;
        case 'vehicule': cause = this.causeAhead(b); direct = cause === 'obstacle'; break;
        default: break;
      }
    }
    const jam = jamCause(cause);
    if (jam && !moving) b.blockedT++;
    else if (b.movingT >= 2 || !jam) b.blockedT = b.blockedT > 3 ? b.blockedT - 3 : 0;
    b.cause = cause;
    b.status.cause = cause;
    b.status.blockedFor = b.blockedT;

    // Immobile depuis très longtemps sans raison valable (ni feu, ni foule, ni barrage) : nœud de circulation
    // que rien ne défera. Un véhicule d'ambiance s'efface, hors champ d'abord ; cela libère les autres.
    if (b.ambient && b.stillT > 70 && cause !== 'feu' && cause !== 'sirene' && !jamCause(cause)) {
      if (b.stillT > 150 || !k.visible(v.x, v.z)) {
        cars.despawn(b);
        return;
      }
    }
    // Derrière un obstacle inerte (épave, véhicule abandonné, barricade) dont personne ne peut sortir : au bout de
    // quelques minutes les automobilistes ont renoncé et sont partis en reculant. Foule et barrage tenu, eux,
    // retiennent le bouchon tant qu'ils durent.
    if (b.ambient && b.stillT > 180 && (cause === 'obstacle' || cause === 'mur') && (b.stillT > 300 || !k.visible(v.x, v.z))) {
      cars.despawn(b);
      return;
    }

    // incident résolu : il roule de nouveau
    if (b.status.incidentId !== 0 && b.movingT >= 4) cars.closeIncident(b, true);

    if (jam && b.blockedT > 0) {
      // les suivants sauront que cette chaussée est bloquée
      if (direct && b.blockedT >= 4) {
        const reach = b.halfL + 7;
        k.obstructions.add(v.x + Math.sin(v.heading) * reach, v.z + Math.cos(v.heading) * reach, 9, now + 45);
      }
      // klaxon d'impatience
      if (b.blockedT > b.patience * 0.35 && now >= b.hornAt && cause !== 'fermeture' && cause !== 'mur') {
        b.hornAt = now + 2.5 + k.rng.next() * 7;
        if (cars.ext) cars.ext.horn(v, 0.25 + k.rng.next() * 0.8);
        else v.cmd.horn = true;
        k.stats.honks++;
      }
      // patience épuisée : demi-tour ou contournement
      if (b.blockedT > b.patience && now >= b.escapeAt && (b.mode !== MODE_HOLD || b.holdCause === 'fermeture')) {
        b.escapeAt = now + 10;
        this.escape(b, now);
      }
      // incident « automobiliste bloqué » : pris dans la manifestation, ou bloqué depuis longtemps
      if (b.status.incidentId === 0 && b.blockedT >= 25 && cause !== 'mur') {
        const phase = ctx.director.phase;
        const risky = (phase !== 'aucune' && phase !== 'terminee') || ctx.director.tensionAt(v.x, v.z) > 0.2 || b.fear > 0.3;
        if (risky || b.blockedT >= 60) cars.openIncident(b, b.fear > 0.6 ? 3 : b.fear > 0.3 || cause === 'personne' ? 2 : 1);
      }
    }
    if (k.tuning.panic) this.panic(b, driver, now);
  }

  /** Cause du blocage du véhicule qui me précède (le bouchon remonte de proche en proche). */
  private causeAhead(b: CarBrain): BlockCause {
    const k = this.k;
    const v = b.v;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    const list = this.near;
    const reach = b.halfL + 9;
    const n = k.ctx.vehicles.queryRadius(v.x + hx * reach, v.z + hz * reach, 9, list);
    let best: Vehicle | null = null;
    let bestAhead = Infinity;
    for (let i = 0; i < n; i++) {
      const o = list[i]!;
      if (o === v || o.def.flying) continue;
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      const ahead = rx * hx + rz * hz;
      const lat = rx * hz - rz * hx;
      // demi-emprise de l'autre en travers de ma route (un véhicule en travers de la chaussée la barre de toute sa longueur)
      const cross = Math.abs(Math.sin(o.heading) * hz - Math.cos(o.heading) * hx);
      const reachLat = b.halfW + 0.7 + 0.5 * (o.def.width * (1 - cross) + o.def.length * cross);
      if (ahead <= 0 || ahead > bestAhead || lat > reachLat || lat < -reachLat) continue;
      bestAhead = ahead;
      best = o;
    }
    if (!best) return 'file';
    const other = this.cars.byVehicle.get(best.id);
    if (other) {
      const c = other.cause;
      return c === 'personne' || c === 'obstacle' || c === 'fermeture' ? c : 'file';
    }
    // véhicule étranger à la circulation, immobile sur ma voie : épave, véhicule abandonné, barrage de police
    return Math.abs(best.speed) < 0.3 ? 'obstacle' : 'file';
  }

  /** Demi-tour ou itinéraire de contournement. */
  private escape(b: CarBrain, now: number): void {
    const k = this.k;
    const cars = this.cars;
    const v = b.v;
    if (cars.retarget(b, true)) {
      // l'itinéraire repart-il dans mon dos ?
      const r = b.route;
      const p = this.rp;
      r.sample(Math.min(r.total, 8), p);
      const back = (p.x - v.x) * Math.sin(v.heading) + (p.z - v.z) * Math.cos(v.heading) < 0;
      if (back) {
        k.stats.uturns++;
        cars.emit(b, 'demi_tour');
      }
      b.blockedT = 0;
      b.patience *= 1.3;
      cars.drive(b);
      return;
    }
    // aucune échappatoire (sens unique, cul-de-sac) : il reste dans la file
    if (cars.retarget(b, false)) cars.drive(b);
    else b.replanAt = now + 3;
  }

  /** Peur du conducteur : fuite en voiture si la voie est libre, abandon du véhicule s'il est pris au piège. */
  private panic(b: CarBrain, driver: Person, now: number): void {
    const k = this.k;
    const cars = this.cars;
    const ctx = k.ctx;
    const v = b.v;
    let danger = k.dangers.at(v.x, v.z);
    const fire = ctx.hazards.fireAt(v.x, v.z);
    if (fire > danger) danger = fire;
    const gas = ctx.hazards.gasAt(v.x, v.z) * 0.6;
    if (gas > danger) danger = gas;
    if (v.burning > 0) danger = 1;
    else if (v.health < 75) danger = Math.max(danger, 0.75);
    const tension = ctx.director.tensionAt(v.x, v.z);
    if (tension > 0.25 || b.cause === 'personne') {
      // entouré de manifestants en colère ?
      const n = ctx.people.queryRadius(v.x, v.z, 9, this.people, this.protest);
      let anger = 0;
      for (let i = 0; i < n; i++) anger += this.people[i]!.anger;
      this.people.length = 0;
      const hostile = Math.min(1, (anger / 4) * 0.7 + tension * Math.min(1, n / 6) * 0.6);
      if (hostile > danger) danger = hostile;
    }
    b.fear += (danger - b.fear) * (danger > b.fear ? 0.45 : 0.06);
    if (b.fear < 0.01) b.fear = 0;
    b.status.fear = b.fear;
    if (driver.fear < b.fear) driver.fear = b.fear;
    if (b.fear > 0.78 && (b.stillT >= 4 || v.health < 60 || v.burning > 0)) {
      cars.abandon(b);
      return;
    }
    if (b.fear > 0.5 && !b.fleeing && b.mode !== MODE_PARK) {
      b.fleeing = true;
      cars.emit(b, 'fuite');
      if (b.mode === MODE_GO && cars.retarget(b, true)) cars.drive(b);
      else if (b.mode === MODE_GO) {
        if (cars.retarget(b, false)) cars.drive(b);
        else b.replanAt = now + 2;
      }
    } else if (b.fleeing && b.fear < 0.15) {
      b.fleeing = false;
    }
  }
}


/** Causes d'immobilisation qui font un bouchon (par opposition à l'attente ordinaire à un feu ou dans une file). */
function jamCause(cause: BlockCause): boolean {
  return cause === 'personne' || cause === 'obstacle' || cause === 'fermeture' || cause === 'mur';
}
