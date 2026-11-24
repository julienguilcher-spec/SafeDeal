/* =====================================================================================
 * CIRCULATION — rue fermée vidée de ses voitures.
 *
 * Demande du commanditaire : « quand je coupe la circulation, s'il reste des voitures dans la rue devant, tu les
 * supprimes, elles disparaissent : c'est seulement à partir de la barrière bloquée ».
 *
 *   la rue fermée   au-delà du barrage, du côté où il fait face (la foule, la rue qu'il interdit) jusqu'au bout du
 *                   tronçon fermé (carrefour suivant) ; tout le tronçon pour des barrières seules sans unité ni foule ;
 *                   tout l'intérieur d'un périmètre fermé (closeArea) ou d'une nasse ;
 *   qui s'en va     les automobilistes de la circulation d'ambiance qui s'y trouvent : hors de la vue du joueur, ils
 *                   disparaissent aussitôt (véhicule et conducteur) ; sous ses yeux, ils s'en vont d'abord (par le
 *                   bout du tronçon ou par un demi-tour, jamais au travers du barrage) et disparaissent dès qu'il ne
 *                   les voit plus, au plus tard au bout de 15 s ;
 *   qui reste       véhicules garés sans conducteur (décor, obstacles que le Centaure pousse), épaves, véhicules en
 *                   feu, véhicules de police et de secours, camion sono, automobilistes d'une mission, véhicule où
 *                   se trouve le joueur ou qu'il s'apprête à prendre.
 * Côté ouvert du barrage, les automobilistes engagés dans le tronçon font demi-tour (une ligne de policiers ne
 * s'ouvre pas pour eux) ; les autres attendent au carrefour ou contournent (car-think.ts, car-routing.ts).
 * ===================================================================================== */

import type { Person, RoadSample } from '@/core/contracts';
import type { CarBrain } from './car-brain';
import { MODE_DONE, MODE_GO, MODE_HOLD, MODE_PARK } from './car-brain';
import type { Cars } from './cars';
import type { ClosureRec } from './closures';
import { isPriority } from './closures';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';

/** Sous les yeux du joueur, il disparaît au plus tard … après avoir été pris dans la rue fermée (s). */
export const PURGE_MAX = 15;
/** Au-delà de la ligne du barrage, à partir de … (m) : la voiture arrêtée contre la barrière en fait partie. */
const PURGE_BEYOND = 1.5;
/** Le joueur à moins de … d'un véhicule s'apprête peut-être à y monter : il reste (m). */
const PLAYER_NEAR = 8;
/** Une foule à moins de … du barrage, dans l'axe de la rue, dit le côté vers lequel il fait face (m). */
const CROWD_RANGE = 200;

const BARRAGES_SERVICE = 'police.barrages';

/** Ce qu'on lit du service des barrages de police (src/sim/police/api.ts : BarragesApi). */
interface BarragesView {
  readonly list: readonly { squadId: number; x: number; z: number; heading: number }[];
  readonly kettles: readonly { x: number; z: number; radius: number; closed: boolean }[];
}

export class CarPurge {
  private scanT = 0;
  private stamp = -1;
  private readonly road: RoadSample = makeRoadSample();
  private readonly people: Person[] = [];
  private readonly isProtest = (p: Person): boolean => p.faction === 'protest' && !p.dormant && p.vehicleId === 0 && p.custody === 'free';

  constructor(private readonly k: TrafficKernel, private readonly cars: Cars) {}

  reset(): void {
    this.scanT = 0;
    this.stamp = -1;
  }

  /** Deux fois par seconde (et aussitôt qu'une rue se ferme ou rouvre). */
  update(dt: number): void {
    const k = this.k;
    const cl = k.closures;
    this.scanT -= dt;
    if (this.scanT > 0 && cl.stamp === this.stamp) return;
    this.scanT = 0.5;
    this.stamp = cl.stamp;
    const list = this.cars.list;
    const barrages = k.ctx.service<BarragesView>(BARRAGES_SERVICE);
    const kettles = barrages && Array.isArray(barrages.kettles) ? barrages.kettles : null;
    let closedKettle = false;
    if (kettles) for (let i = 0; i < kettles.length; i++) if (kettles[i]!.closed) closedKettle = true;
    if (cl.recs.length === 0 && !closedKettle) {
      // tout est rouvert : ceux qui s'en allaient encore reprennent leur vie d'automobiliste
      for (let i = 0; i < list.length; i++) {
        list[i]!.purgeAt = -1;
        list[i]!.purgeRec = null;
      }
      return;
    }
    for (let i = 0; i < cl.recs.length; i++) this.face(cl.recs[i]!, barrages);
    this.turnBackOpenSide();
    const now = k.ctx.clock.now;
    // (de la fin vers le début : un véhicule retiré est remplacé à sa place par le dernier de la liste)
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if (b.purgeAt >= 0 && (b.purgeRec !== null ? cl.recs.indexOf(b.purgeRec) < 0 : !closedKettle)) {
        // la rue (ou la nasse) a été rouverte entre-temps : il reste
        b.purgeAt = -1;
        b.purgeRec = null;
      }
      if (!this.candidate(b)) continue;
      if (b.purgeAt < 0) {
        const rec = this.zone(b, kettles);
        if (rec === undefined) continue;
        b.purgeAt = now;
        b.purgeRec = rec;
      }
      if (this.protectedByPlayer(b)) continue;
      if (!k.visible(b.v.x, b.v.z) || now - b.purgeAt > PURGE_MAX) {
        this.remove(b);
        continue;
      }
      this.leave(b);
    }
  }

  /** Automobiliste d'ambiance, civil, au volant : le seul que la rue fermée fait disparaître. */
  private candidate(b: CarBrain): boolean {
    const v = b.v;
    if (!b.ambient || b.mode === MODE_DONE || b.mode === MODE_PARK) return false;
    if (isPriority(v) || v.kind === 'camion_sono') return false;
    return v.state === 'ok' || v.state === 'damaged';
  }

  /** Le joueur est à bord, ou tout près (il va peut-être y monter). */
  private protectedByPlayer(b: CarBrain): boolean {
    const p = this.k.ctx.player.person();
    if (!p) return false;
    const v = b.v;
    if (p.vehicleId === v.id) return true;
    for (let i = 0; i < v.seats.length; i++) if (v.seats[i] === p.id) return true;
    const dx = p.x - v.x;
    const dz = p.z - v.z;
    return p.vehicleId === 0 && dx * dx + dz * dz < PLAYER_NEAR * PLAYER_NEAR;
  }

  /**
   * Fermeture dans la rue fermée de laquelle il se trouve (null : une nasse), ou undefined s'il n'est dans aucune.
   */
  private zone(b: CarBrain, kettles: BarragesView['kettles'] | null): ClosureRec | null | undefined {
    const k = this.k;
    const cl = k.closures;
    const v = b.v;
    for (let i = 0; i < cl.recs.length; i++) {
      const rec = cl.recs[i]!;
      if (rec.areaId === 0) continue;
      const dx = v.x - rec.areaX;
      const dz = v.z - rec.areaZ;
      if (dx * dx + dz * dz < rec.areaR * rec.areaR) return rec;
    }
    if (kettles) {
      for (let i = 0; i < kettles.length; i++) {
        const q = kettles[i]!;
        if (!q.closed) continue;
        const dx = v.x - q.x;
        const dz = v.z - q.z;
        if (dx * dx + dz * dz < q.radius * q.radius) return null;
      }
    }
    const road = this.road;
    if (!k.ctx.world.nearestRoad(v.x, v.z, road, 8)) return undefined;
    const rec = cl.recOfEdge(road.edgeId);
    if (!rec || rec.areaId !== 0) return undefined;
    // pas celui qui traverse le carrefour au bout du tronçon (il passe dans la rue transversale)
    const c = k.cache;
    for (let j = 0; j < 2; j++) {
      const node = j === 0 ? rec.nodeA : rec.nodeB;
      if (node < 0) continue;
      const dx = v.x - c.nodeX[node]!;
      const dz = v.z - c.nodeZ[node]!;
      const r = c.nodeRadius[node]! + 1;
      if (dx * dx + dz * dz < r * r) return undefined;
    }
    if (!rec.faced) return rec;
    const along = (v.x - rec.closure.x) * rec.faceX + (v.z - rec.closure.z) * rec.faceZ;
    return along > PURGE_BEYOND ? rec : undefined;
  }

  /**
   * Côté vers lequel le barrage fait face : celui de l'unité qui le tient (service des barrages de police), sinon
   * celui de la foule la plus proche dans l'axe de la rue ; inconnu pour des barrières seules.
   */
  private face(rec: ClosureRec, barrages: BarragesView | undefined): void {
    const cl = rec.closure;
    rec.faced = false;
    if (rec.areaId !== 0) return;
    let hx = 0;
    let hz = 0;
    if (barrages && Array.isArray(barrages.list)) {
      let bestD = 30 * 30;
      for (let i = 0; i < barrages.list.length; i++) {
        const q = barrages.list[i]!;
        const dx = q.x - cl.x;
        const dz = q.z - cl.z;
        const d = dx * dx + dz * dz;
        const mine = cl.squadId !== 0 && q.squadId === cl.squadId;
        if (!mine && d >= bestD) continue;
        bestD = mine ? -1 : d;
        hx = Math.sin(q.heading);
        hz = Math.cos(q.heading);
      }
    }
    if (hx === 0 && hz === 0) {
      // la foule la plus proche, dans l'axe de la rue (pas derrière une façade latérale)
      const ctx = this.k.ctx;
      const near = this.people;
      const n = ctx.people.queryRadius(cl.x, cl.z, CROWD_RANGE, near, this.isProtest);
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const p = near[i]!;
        const dx = p.x - cl.x;
        const dz = p.z - cl.z;
        const d = dx * dx + dz * dz;
        const along = dx * rec.dx + dz * rec.dz;
        if (d >= bestD || along * along < d * 0.5) continue;
        bestD = d;
        hx = along > 0 ? rec.dx : -rec.dx;
        hz = along > 0 ? rec.dz : -rec.dz;
      }
      near.length = 0;
    }
    // ramené sur l'axe de la rue
    const dot = hx * rec.dx + hz * rec.dz;
    if (Math.abs(dot) < 0.3) return;
    rec.faced = true;
    rec.faceX = dot > 0 ? rec.dx : -rec.dx;
    rec.faceZ = dot > 0 ? rec.dz : -rec.dz;
  }

  /**
   * Sous les yeux du joueur : il quitte la rue fermée par son autre bout, ou par un demi-tour — jamais au travers du
   * barrage (il n'a plus de passe-droit pour le franchir).
   */
  private leave(b: CarBrain): void {
    const rec = b.purgeRec;
    // (barrières seules : tout le tronçon est fermé, il en sort par où il allait, barrage compris ; périmètre : il en
    // sort par le barrage, qui s'ouvre pour lui)
    if (!rec || rec.areaId !== 0 || !rec.faced) return;
    rec.permits.delete(b.v.id);
    this.turnBack(b, rec);
  }

  /** Côté ouvert d'une rue barrée : l'automobiliste engagé dans le tronçon fait demi-tour au lieu de franchir la ligne. */
  private turnBackOpenSide(): void {
    const cl = this.k.closures;
    const list = this.cars.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (b.purgeAt >= 0) continue;
      for (let j = 0; j < cl.recs.length; j++) {
        const rec = cl.recs[j]!;
        if (!rec.faced || !rec.permits.has(b.v.id)) continue;
        rec.permits.delete(b.v.id);
        this.turnBack(b, rec);
      }
    }
  }

  private turnBack(b: CarBrain, rec: ClosureRec): void {
    const k = this.k;
    const cars = this.cars;
    const now = k.ctx.clock.now;
    if (b.passRec === rec) {
      b.passRec = null;
      b.passing = false;
    }
    if (b.mode !== MODE_GO && b.mode !== MODE_HOLD) return;
    // l'itinéraire passe-t-il encore par ce barrage ?
    const r = b.route;
    r.project(b.v.x, b.v.z);
    k.closures.scan(r.pts, r.cum, r.n, r.s, b.v);
    if (k.closures.blockRec !== rec) return;
    if (cars.retarget(b, true)) {
      k.stats.uturns++;
      cars.emit(b, 'demi_tour');
      cars.drive(b);
    } else if (cars.retarget(b, false)) {
      cars.drive(b);
    } else {
      b.replanAt = now + 2;
    }
  }

  /** Retire le véhicule et son conducteur ; l'incident « automobiliste bloqué » qu'il portait est levé. */
  private remove(b: CarBrain): void {
    this.cars.closeIncident(b, true);
    this.cars.despawn(b);
  }
}
