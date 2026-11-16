/* =====================================================================================
 * CIRCULATION — réflexion d'un automobiliste (4 fois par seconde, étalée d'un véhicule à l'autre) :
 *   1. régulation : feux, carrefours (réservation), exigence d'une sortie dégagée ;
 *   2. rues fermées : nouvel itinéraire, ou sortie par le barrage s'il était déjà engagé ;
 *   3. arrivée à destination, stationnement.
 * Les sirènes, l'immobilisation (klaxon, demi-tour, incident) et la peur sont dans car-watch.ts.
 * ===================================================================================== */

import type { RoadSample, Vehicle } from '@/core/contracts';
import type { BlockCause } from './api';
import type { CarBrain } from './car-brain';
import { MODE_DONE, MODE_GO, MODE_HOLD, MODE_PARK, MODE_PULL, modeName } from './car-brain';
import { CarWatcher } from './car-watch';
import type { Cars } from './cars';
import type { ControlPoint, RoutePoint } from './route';
import { CP_BOX, CP_SIGNAL } from './route';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';
import { AMBER, RED } from './signals';
import { AP_DECEL, HARD_DECEL } from './tuning';

export class CarThinker {
  readonly watcher: CarWatcher;
  private readonly near: Vehicle[] = [];
  private readonly rp: RoutePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly road: RoadSample = makeRoadSample();
  private holdCause: BlockCause = '';

  constructor(private readonly k: TrafficKernel, private readonly cars: Cars) {
    this.watcher = new CarWatcher(k, cars);
  }

  reset(): void {
    this.watcher.reset();
  }

  /** Une fois par pas : repérage des sirènes, oubli des dangers passés. */
  update(dt: number): void {
    this.watcher.update(dt);
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
    if (this.watcher.emergency(b, now)) {
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
      if (b.tripDue) {
        this.newTrip(b, now);
        return;
      }
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
    // Immobilisé à sa ligne, le pilote automatique a rendu la main : le véhicule serait un obstacle inerte que
    // les autres véhicules pilotés ne savent pas contourner. On le garde « en prise » en lui faisant suivre son
    // propre conducteur : il reste à l'arrêt, mais les autres le voient comme un véhicule qui attend et
    // appliquent leur règle de priorité (passage au pas à quelques décimètres) au lieu de rester bloqués.
    if (b.mode === MODE_HOLD && !ap.isActive(v) && Math.abs(v.speed) < 0.2) ap.follow(v, b.driverId, 0.5);
    if ((b.tick & 3) === 0) this.watcher.watch(b, driver, now);
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
      // hors de portée : on n'y pense pas encore (sauf si l'on est déjà tenu à cette ligne, dans la file, ou
      // si le passage est acquis : la réservation doit être rappelée jusqu'au bout, même si l'on a ralenti)
      if (dStop > reach && cp !== b.holdCp && !cp.cleared) break;
      // ligne d'arrêt dépassée : engagé, il ne s'arrête plus (un arrêt dans le carrefour le bloquerait)
      const inside = dStop < -1;
      // le feu a pu passer à l'orange ou au rouge depuis qu'on a vu le vert : on s'arrête si on le peut encore
      if (cp.cleared && !inside && (cp.kind & CP_SIGNAL) !== 0 && cp.ctrl !== null && now >= b.forceUntil) {
        const st = k.signals.state(cp.ctrl, cp.inDx, cp.inDz, now);
        if ((st === RED || st === AMBER) && dStop > (u * u) / (2 * HARD_DECEL) + 1) {
          if ((cp.kind & CP_BOX) !== 0) k.boxes.release(cp.node, v.id);
          cp.cleared = false;
        }
      }
      if (cp.cleared) {
        if ((cp.kind & CP_BOX) !== 0) {
          // arrêté devant un carrefour pourtant réservé (piéton, file) : on rend la place aux autres
          if (!inside && u < 0.3) b.waitBox += 0.25;
          else b.waitBox = 0;
          if (inside || now < b.forceUntil) {
            k.boxes.occupy(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
          } else if ((b.waitBox > 3 || this.boxStalled(b, cp)) && dStop > (u * u) / (2 * HARD_DECEL) + 1.5) {
            // (ou quelqu'un s'est immobilisé au milieu du carrefour : on ne le rejoint pas, on attend à la ligne)
            b.waitBox = 0;
            k.boxes.release(cp.node, v.id);
            cp.cleared = false;
          } else if (!k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now)) {
            // réservation perdue : on s'arrête si on le peut encore, sinon on passe en occupant le carrefour
            if (dStop > (u * u) / (2 * HARD_DECEL) + 1.5) cp.cleared = false;
            else k.boxes.occupy(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
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
    // la rue où mène ce carrefour est fermée : on n'y entre pas (sauf si l'on est déjà engagé)
    if (cp === b.entryCp && !inside) {
      this.holdCause = 'fermeture';
      return false;
    }
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
      k.boxes.occupy(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
      return true;
    }
    if (!this.junctionFree(b, cp)) return false;
    return k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
  }

  /** Un véhicule est-il au pas ou arrêté au milieu du carrefour ? */
  private boxStalled(b: CarBrain, cp: ControlPoint): boolean {
    if ((b.tick & 1) !== 0) return false; // un examen sur deux suffit
    const c = this.k.cache;
    const nx = c.nodeX[cp.node]!;
    const nz = c.nodeZ[cp.node]!;
    const zone = cp.radius + 2;
    const list = this.near;
    const n = this.k.ctx.vehicles.queryRadius(nx, nz, zone, list);
    for (let i = 0; i < n; i++) {
      const o = list[i]!;
      if (o === b.v || o.def.flying || Math.abs(o.speed) >= 2) continue;
      const dx = o.x - nx;
      const dz = o.z - nz;
      if (dx * dx + dz * dz < zone * zone) return true;
    }
    return false;
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
      const mine = cars.byVehicle.has(o.id);
      // quelqu'un est au pas ou arrêté au milieu du carrefour (il manœuvre, un piéton le retient) : on attend
      // qu'il l'ait quitté, d'où qu'il vienne
      if (sp < 2.5) {
        const dx = o.x - nx;
        const dz = o.z - nz;
        const zone = cp.radius + 2;
        if (dx * dx + dz * dz < zone * zone) return false;
      }
      if (sp > 1.2 && !mine) {
        // véhicule étranger à la circulation régulée (police, joueur) en mouvement dans le carrefour : on le laisse passer
        const dx = o.x - nx;
        const dz = o.z - nz;
        if (dx * dx + dz * dz < inner * inner) return false;
        continue;
      }
      if (sp > 2) continue;
      // véhicule arrêté ou au pas dans ma sortie : je ne pourrais pas dégager le carrefour
      const rx = o.x - p.x;
      const rz = o.z - p.z;
      const along = rx * p.dx + rz * p.dz;
      const lat = -rx * p.dz + rz * p.dx; // positif à droite
      const half = o.def.length * 0.5;
      if (along > -(b.halfL + half + 1) && along < b.halfL + half + 9 && lat > -3.2 && lat < b.halfW + o.def.width * 0.5 + 2.2) {
        // à gauche de ma voie : seulement s'il roule dans mon sens (celui d'en face attend à sa ligne, c'est normal)
        if (lat < -1.2 && Math.sin(o.heading) * p.dx + Math.cos(o.heading) * p.dz < 0.3) continue;
        // un véhicule garé le long du trottoir ne compte pas : seul celui qui est sur une voie gêne
        if (lat < b.halfW + o.def.width * 0.5 + 0.9 || mine) return false;
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
    cars.markEntry(b);
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
    // arrivé loin du joueur ou hors de sa vue : il sort de la zone simulée
    if (k.distToFocus2(v.x, v.z) > 150 * 150 || !k.visible(v.x, v.z)) {
      cars.despawn(b);
      return;
    }
    // sous les yeux du joueur : il se gare s'il trouve une place, sinon il marque l'arrêt (il dépose quelqu'un,
    // cherche son chemin) puis repart droit devant vers une autre destination
    const parking = cars.parking;
    if (parking && k.rng.chance(k.tuning.parkShare * 2.5) && parking.offer(b)) return;
    b.mode = MODE_HOLD;
    b.holdCp = null;
    b.holdCause = '';
    b.failures = 0;
    b.replanAt = now + 1 + k.rng.next() * 4;
    b.tripDue = true;
  }

  /** Repart vers une autre destination. */
  private newTrip(b: CarBrain, now: number): void {
    const cars = this.cars;
    // toujours devant lui : pas de demi-tour en pleine rue pour un simple changement de destination
    if (cars.newDestination(b, true)) {
      if (cars.retarget(b, false) && cars.drive(b)) {
        b.failures = 0;
        b.tripDue = false;
        return;
      }
    }
    b.tripDue = true;
    b.failures++;
    // cul-de-sac sans issue : plutôt que de boucher la rue, il finit par disparaître (il s'est garé plus loin)
    if (b.ambient && b.failures >= 4 && this.k.distToFocus2(b.v.x, b.v.z) > 60 * 60) {
      cars.despawn(b);
      return;
    }
    // en attendant, moteur tournant le long du trottoir
    b.mode = MODE_HOLD;
    b.holdCp = null;
    b.holdCause = '';
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
}
