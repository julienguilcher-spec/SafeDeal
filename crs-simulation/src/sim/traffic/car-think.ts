/* =====================================================================================
 * CIRCULATION — réflexion d'un automobiliste (4 fois par seconde, étalée d'un véhicule à l'autre) :
 *   1. régulation : feux, carrefours (réservation), exigence d'une sortie dégagée ;
 *   2. véhicules en intervention : il se range, les feux et les carrefours leur sont réservés ;
 *   3. rues fermées : nouvel itinéraire, ou sortie par le barrage s'il était déjà engagé ;
 *   4. immobilisation (une fois par seconde) : cause du blocage, klaxon, demi-tour ou contournement
 *      après un temps de patience, incident « automobiliste bloqué » ;
 *   5. peur : fuite en voiture, ou abandon du véhicule quand il est pris dans une émeute.
 * ===================================================================================== */

import type { Person, RoadSample, Vehicle } from '@/core/contracts';
import type { BlockCause } from './api';
import type { CarBrain } from './car-brain';
import { MODE_DONE, MODE_GO, MODE_HOLD, MODE_PARK, MODE_PULL, modeName } from './car-brain';
import type { Cars } from './cars';
import type { EdgeHit, EdgePoint } from './graph';
import { E_ONEWAY, N_JUNCTION, N_SIGNAL, makeEdgeHit } from './graph';
import type { ControlPoint, RoutePoint } from './route';
import { CP_BOX, CP_SIGNAL } from './route';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';
import { AMBER, RED } from './signals';
import { AP_DECEL, HARD_DECEL } from './tuning';

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

export class CarThinker {
  private readonly emergencies: Emergency[] = [];
  private emergencyCount = 0;
  private scanT = 0;
  private readonly near: Vehicle[] = [];
  private readonly people: Person[] = [];
  private readonly rp: RoutePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly ep: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly road: RoadSample = makeRoadSample();
  private holdCause: BlockCause = '';
  /** Automobiliste qui me précède, trouvé par causeAhead (null si aucun ou véhicule étranger). */
  private aheadCar: CarBrain | null = null;
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
  private emergency(b: CarBrain, now: number): boolean {
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
    if (this.emergencyCount === 0 || b.mode === MODE_PARK) return false;
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
      // jamais d'arrêt au milieu d'un carrefour
      const r = b.route;
      if (r.cpNext < r.cpCount) {
        const cp = r.cps[r.cpNext]!;
        if (r.s + b.halfL > cp.nodeS - cp.radius - 3 && r.s - b.halfL < cp.nodeS + cp.radius + 2) continue;
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

  // ───────────────────────────── réflexion ─────────────────────────────

  think(b: CarBrain): void {
    const k = this.k;
    const cars = this.cars;
    const ctx = k.ctx;
    const v = b.v;
    const now = ctx.clock.now;
    if (ctx.vehicles.get(v.id) !== v) {
      cars.forget(b, false);
      return;
    }
    // le conducteur n'est plus au volant (évacué d'un véhicule en feu, sorti par un autre module, disparu)
    const driver = ctx.people.get(b.driverId);
    if (!driver || driver.vehicleId !== v.id) {
      if (cars.ap) cars.ap.stop(v);
      cars.emit(b, 'abandon');
      cars.forget(b, true);
      k.stats.abandons++;
      if (driver && driver.vehicleId === 0 && !ctx.health.isIncapacitated(driver) && k.peds) k.peds.adopt(driver, true, v.x, v.z);
      return;
    }
    if (v.state !== 'ok' && v.state !== 'damaged') {
      cars.abandon(b);
      return;
    }
    if (ctx.health.isIncapacitated(driver) || driver.custody !== 'free') {
      // conducteur inconscient ou interpellé au volant : le véhicule s'arrête et n'est plus conduit
      if (cars.ap) cars.ap.stop(v);
      cars.forget(b, true);
      return;
    }
    if (b.mode === MODE_DONE || !cars.ap) return;
    const ap = cars.ap;
    const r = b.route;
    r.project(v.x, v.z);
    b.tick++;

    // carte rechargée : tout itinéraire est caduc
    if (b.graphStamp !== k.cache.stamp) {
      b.graphStamp = k.cache.stamp;
      if (!cars.retarget(b, false) || !cars.drive(b)) {
        cars.despawn(b);
        return;
      }
    }
    if (b.closureStamp !== k.closures.stamp) {
      b.closureStamp = k.closures.stamp;
      this.revalidate(b);
    }
    if (this.emergency(b, now)) {
      b.status.mode = 'range';
      b.cause = 'sirene';
      b.status.cause = 'sirene';
      return;
    }
    if (b.mode === MODE_PARK) {
      this.parking(b, now);
      return;
    }
    // nouvelle tentative après un échec d'itinéraire
    if (b.replanAt >= 0) {
      if (now < b.replanAt) return;
      b.replanAt = -1;
      if (!cars.retarget(b, false) || !cars.drive(b)) {
        b.failures++;
        if (b.ambient && b.failures > 2 && !k.visible(v.x, v.z)) cars.despawn(b);
        else b.replanAt = now + 4;
        return;
      }
    }
    if (b.mode === MODE_GO) {
      const st = ap.status(v);
      if (!ap.isActive(v)) {
        if (st.state === 'arrive') {
          this.arrived(b, now);
          return;
        }
        // le pilote a renoncé (coincé contre un mur, plus d'itinéraire) : on recommence un peu plus tard
        b.failures++;
        if (b.ambient && b.failures > 3 && !k.visible(v.x, v.z)) cars.despawn(b);
        else b.replanAt = now + 2 + b.failures;
        return;
      }
      // déviation : à l'approche du point de passage, on vise la suite avant que le pilote ne freine
      if (b.hasVia && r.total - r.s < 46 && now >= b.viaAt) {
        b.viaAt = now + 1.5;
        if (cars.retarget(b, false)) cars.drive(b);
        else b.replanAt = now + 2;
      }
    }
    // barrage franchi avec autorisation (véhicule déjà engagé, sortie d'un périmètre)
    if (b.passRec && b.mode === MODE_GO) {
      const d = b.passS - (r.s + b.halfL);
      if (d < 34) {
        k.closures.requestGate(b.passRec, v.id);
        if (!b.passing) {
          b.passing = true;
          cars.drive(b);
        }
      }
      if (r.s - b.halfL > b.passS + 4) {
        b.passRec.permits.delete(v.id);
        b.passRec = null;
        b.passing = false;
        cars.drive(b);
      }
    }
    this.regulate(b, now);
    if ((b.tick & 3) === 0) this.watch(b, driver, now);
    b.status.mode = modeName(b);
  }

  // ───────────────────────────── feux et carrefours ─────────────────────────────

  private regulate(b: CarBrain, now: number): void {
    const k = this.k;
    const cars = this.cars;
    const r = b.route;
    const v = b.v;
    const u = Math.abs(v.speed);
    const front = r.s + b.halfL;
    const rear = r.s - b.halfL;
    while (r.cpNext < r.cpCount) {
      const cp = r.cps[r.cpNext]!;
      if (rear <= cp.nodeS + cp.radius + 0.5) break;
      if ((cp.kind & CP_BOX) !== 0) k.boxes.release(cp.node, v.id);
      if (b.holdCp === cp) b.holdCp = null;
      r.cpNext++;
    }
    const grip = cars.ext ? Math.min(1, cars.ext.dynamics(v).grip / 0.85) : 1;
    const dBrake = (u * u) / (2 * AP_DECEL * (grip > 0.3 ? grip : 0.3));
    const reach = dBrake + 14 + u * 0.6;
    let hold: ControlPoint | null = null;
    for (let i = r.cpNext; i < r.cpCount; i++) {
      const cp = r.cps[i]!;
      const dStop = cp.stopS - front;
      // hors de portée : on n'y pense pas encore (sauf si l'on est déjà tenu à cette ligne, dans la file)
      if (dStop > reach && cp !== b.holdCp) break;
      // ligne d'arrêt dépassée : engagé, il ne s'arrête plus (un arrêt dans le carrefour le bloquerait)
      const inside = dStop < -1;
      if (cp.cleared) {
        if ((cp.kind & CP_BOX) !== 0) {
          // arrêté devant un carrefour pourtant réservé (piéton, file) : on rend la place aux autres
          if (!inside && u < 0.3) b.waitBox += 0.25;
          else b.waitBox = 0;
          if (now < b.forceUntil) {
            k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
          } else if (b.waitBox > 3 && !inside) {
            b.waitBox = 0;
            k.boxes.release(cp.node, v.id);
            cp.cleared = false;
          } else if (!k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now) && !inside) {
            cp.cleared = false;
          }
        }
        if (cp.cleared) continue;
      }
      if (this.permit(b, cp, dStop, u, inside, now)) {
        cp.cleared = true;
        continue;
      }
      hold = cp;
      break;
    }
    if (hold) {
      b.holdCause = this.holdCause;
      if (b.mode !== MODE_HOLD || b.holdCp !== hold) cars.holdAt(b, hold);
    } else if (b.mode === MODE_HOLD) {
      b.holdCause = '';
      if (!cars.go(b)) b.replanAt = now + 2;
    }
  }

  /** Le véhicule peut-il franchir ce point de contrôle maintenant ? (sinon holdCause dit pourquoi) */
  private permit(b: CarBrain, cp: ControlPoint, dStop: number, u: number, inside: boolean, now: number): boolean {
    const k = this.k;
    const v = b.v;
    if ((cp.kind & CP_SIGNAL) !== 0 && cp.ctrl !== null && dStop > -1.5) {
      const st = k.signals.state(cp.ctrl, cp.inDx, cp.inDz, now);
      if (st === RED) {
        this.holdCause = 'feu';
        return false;
      }
      // à l'orange : on s'arrête si on le peut encore sans freiner fort
      if (st === AMBER && !(u > 2 && dStop < (u * u) / (2 * HARD_DECEL) + 1)) {
        this.holdCause = 'feu';
        return false;
      }
    }
    if ((cp.kind & CP_BOX) === 0) return true;
    this.holdCause = 'carrefour';
    if (inside) {
      // déjà dans le carrefour : on ne s'y arrête pas, on dégage
      k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
      return true;
    }
    if (!this.junctionFree(b, cp)) return false;
    return k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
  }

  /**
   * Le carrefour est-il praticable ? Faux si un véhicule étranger à la circulation régulée (convoi de police,
   * joueur) le traverse, ou si la sortie visée est occupée par un véhicule à l'arrêt : on ne s'engage pas
   * pour rester en travers.
   */
  private junctionFree(b: CarBrain, cp: ControlPoint): boolean {
    const k = this.k;
    const c = k.cache;
    const v = b.v;
    const r = b.route;
    const node = cp.node;
    const nx = c.nodeX[node]!;
    const nz = c.nodeZ[node]!;
    const list = this.near;
    const reach = cp.radius + b.halfL * 2 + 9;
    const n = k.ctx.vehicles.queryRadius(nx, nz, reach, list);
    if (n <= 1) return true;
    // zone de sortie : sur ma voie, juste après le carrefour
    const p = this.rp;
    const exitS = cp.nodeS + cp.radius + b.halfL + 2;
    r.sample(exitS < r.total ? exitS : r.total, p);
    const cars = this.cars;
    const inner = cp.radius + 5;
    for (let i = 0; i < n; i++) {
      const o = list[i]!;
      if (o === v || o.def.flying) continue;
      const sp = Math.abs(o.speed);
      if (sp > 1.2) {
        if (cars.byVehicle.has(o.id)) continue; // la circulation régulée passe par les réservations
        const dx = o.x - nx;
        const dz = o.z - nz;
        if (dx * dx + dz * dz < inner * inner) return false;
        continue;
      }
      if (sp > 0.6) continue;
      // véhicule à l'arrêt dans ma sortie ?
      const rx = o.x - p.x;
      const rz = o.z - p.z;
      const along = rx * p.dx + rz * p.dz;
      const lat = -rx * p.dz + rz * p.dx; // positif à droite
      const half = o.def.length * 0.5;
      if (along > -(b.halfL + half + 1) && along < b.halfL + half + 2.5 && lat > -1 && lat < b.halfW + o.def.width * 0.5 + 2.2) {
        // un véhicule garé le long du trottoir ne compte pas : seul celui qui est sur une voie gêne
        if (lat < b.halfW + o.def.width * 0.5 + 0.9 || cars.byVehicle.has(o.id)) return false;
      }
    }
    return true;
  }

  // ───────────────────────────── rues fermées ─────────────────────────────

  private revalidate(b: CarBrain): void {
    const k = this.k;
    const cars = this.cars;
    const v = b.v;
    const r = b.route;
    const cl = k.closures;
    const had = b.blockS >= 0 || b.hasVia || b.cause === 'fermeture';
    cl.scan(r.pts, r.cum, r.n, r.s, v);
    if (cl.blockS >= 0 && cl.blockRec) {
      // déjà engagé dans le tronçon qu'on ferme : il sortira par le barrage
      const road = this.road;
      if (k.ctx.world.nearestRoad(v.x, v.z, road, 12) && cl.recOfEdge(road.edgeId) === cl.blockRec) {
        cl.blockRec.permits.add(v.id);
        cl.scan(r.pts, r.cum, r.n, r.s, v);
      }
    }
    if (cl.blockS >= 0 || had) {
      if (b.mode === MODE_PULL || b.mode === MODE_PARK) return;
      if (cars.retarget(b, false)) cars.drive(b);
      else b.replanAt = k.ctx.clock.now + 2;
      return;
    }
    b.blockS = cl.blockS;
    b.passS = cl.passS;
    b.passRec = cl.passRec;
  }

  // ───────────────────────────── arrivée, stationnement ─────────────────────────────

  private arrived(b: CarBrain, now: number): void {
    const k = this.k;
    const cars = this.cars;
    const v = b.v;
    if (b.hasVia) {
      if (!cars.retarget(b, false) || !cars.drive(b)) b.replanAt = now + 2;
      return;
    }
    if (!b.ambient) {
      // automobiliste d'une mission : il reste là, moteur tournant, jusqu'à nouvel ordre
      b.mode = MODE_DONE;
      b.status.mode = 'arret';
      b.status.cause = '';
      cars.closeIncident(b, true);
      return;
    }
    if (!k.visible(v.x, v.z)) {
      cars.despawn(b);
      return;
    }
    const parking = cars.parking;
    if (parking && k.rng.chance(k.tuning.parkShare) && parking.offer(b)) return;
    this.newTrip(b, now);
  }

  /** Repart vers une autre destination. */
  private newTrip(b: CarBrain, now: number): void {
    const cars = this.cars;
    if (cars.newDestination(b) && cars.retarget(b, false) && cars.drive(b)) return;
    b.replanAt = now + 3;
  }

  private parking(b: CarBrain, now: number): void {
    const cars = this.cars;
    const ap = cars.ap!;
    const v = b.v;
    const st = ap.status(v);
    if (!ap.isActive(v) && st.state === 'arrive') {
      cars.parking?.settle(b);
      return;
    }
    if (now > b.parkUntil || (!ap.isActive(v) && st.state !== 'arrive')) {
      // manœuvre impossible : il renonce et repart
      cars.parking?.release(b.parkSlot);
      b.parkSlot = -1;
      this.newTrip(b, now);
    }
  }

  // ───────────────────────────── immobilisation, klaxon, peur ─────────────────────────────

  /** Une fois par seconde : pourquoi est-il arrêté, depuis combien de temps, et qu'en fait-il ? */
  private watch(b: CarBrain, driver: Person, now: number): void {
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
    this.aheadCar = null;
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
    // Engagé dans un carrefour et arrêté par un véhicule qui, lui, attend à sa ligne que je libère le carrefour :
    // personne ne bougerait plus. Celui qui attend passe d'abord (le pilote automatique sait contourner au pas
    // un véhicule arrêté mais « en route », pas un véhicule tenu à l'arrêt).
    if (cause === 'file' && b.stillT >= 5 && b.mode === MODE_GO && this.aheadCar) {
      const o = this.aheadCar;
      if (o.mode === MODE_HOLD && o.holdCp && o.holdCause === 'carrefour') {
        o.holdCp.cleared = true;
        o.forceUntil = now + 9;
        o.holdCause = '';
        if (!cars.go(o)) o.replanAt = now + 2;
      }
    }
    const jam = cause === 'personne' || cause === 'obstacle' || cause === 'fermeture' || cause === 'mur';
    if (jam && !moving) b.blockedT++;
    else if (b.movingT >= 2 || !jam) b.blockedT = b.blockedT > 3 ? b.blockedT - 3 : 0;
    b.cause = cause;
    b.status.cause = cause;
    b.status.blockedFor = b.blockedT;

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
      if (b.blockedT > b.patience && now >= b.escapeAt && b.mode !== MODE_HOLD) {
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
      if (ahead <= 0 || ahead > bestAhead || lat > 2.6 || lat < -2.6) continue;
      bestAhead = ahead;
      best = o;
    }
    this.aheadCar = null;
    if (!best) return 'file';
    const other = this.cars.byVehicle.get(best.id);
    if (other) {
      this.aheadCar = other;
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
