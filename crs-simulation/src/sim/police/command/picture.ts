/* =====================================================================================
 * COMMANDEMENT — tableau de situation : ce que le commandement SAIT.
 *
 *   points chauds   regroupés par proximité (30 m), nourris par les événements de la simulation
 *                   (jets, agents blessés, vitrines, pillages, feux, barricades, compression,
 *                   signes avant-coureurs) ; leur intensité retombe (demi-vie 40 s) ;
 *   connaissance    un fait n'est connu que s'il est VU : par un agent à pied à moins de 90 m en vue
 *                   directe, par le drone (son champ au sol), ou annoncé par la salle (incidents).
 *                   Le commandant l'apprend après un délai de transmission qui dépend de son aptitude ;
 *   cortège         phase, tension, parcours, tête et queue (directeur de foule, s'il existe) ;
 *   observations    comptes rendus du drone (nature, volume, attitude).
 * ===================================================================================== */

import type { CrowdPhase, EntityId, Person } from '@/core/contracts';
import { HOT_KINDS } from './api';
import type { CrowdSignal, HotKind, HotSpot, Observation } from './api';
import type { CommandCore } from './core';
import { isPoliceOnFoot } from './core';

/** Distance de regroupement de deux faits en un même point chaud (m). */
const MERGE_RADIUS = 30;
/** Portée de vue d'un agent à pied (m). */
const SIGHT = 90;
/** Demi-vie de l'intensité d'un point chaud (s). */
const HALF_LIFE = 40;
const MAX_SPOTS = 16;
const MAX_OBSERVATIONS = 48;

const KIND_INDEX: Readonly<Record<HotKind, number>> = { violences: 0, casse: 1, feu: 2, barricade: 3, groupe_hostile: 4, compression: 5 };

export class Picture {
  readonly spots: HotSpot[] = [];
  readonly observations: Observation[] = [];
  private nextId = 1;

  // ── cortège ──
  /** Une manifestation est suivie par le directeur de foule. */
  active = false;
  phase: CrowdPhase = 'aucune';
  /** Phase du déroulé, sans les états superposés « tension » et « affrontement » (égale à `phase` sans module de foule). */
  basePhase: CrowdPhase = 'aucune';
  tension = 0;
  route: readonly number[] = [];
  routeLength = 0;
  headS = 0;
  tailS = 0;
  present = 0;
  total = 0;

  // ── champs des drones en vol (remplis par le télépilote) ──
  readonly droneX: number[] = [];
  readonly droneZ: number[] = [];
  readonly droneR: number[] = [];
  droneN = 0;

  /** Délai de transmission d'un fait au commandant (s) : fixé par le commandement d'après son aptitude. */
  reportDelay = 5;
  private signalAt = 0;
  private readonly seenSignals: number[] = [];

  constructor(private readonly core: CommandCore) {}

  reset(): void {
    this.spots.length = 0;
    this.observations.length = 0;
    this.nextId = 1;
    this.active = false;
    this.phase = 'aucune';
    this.basePhase = 'aucune';
    this.tension = 0;
    this.route = [];
    this.routeLength = 0;
    this.headS = 0;
    this.tailS = 0;
    this.present = 0;
    this.total = 0;
    this.droneN = 0;
    this.signalAt = 0;
    this.seenSignals.length = 0;
  }

  // ───────────────────────────── cortège ─────────────────────────────

  /** Relit le directeur de foule (une fois par réflexion). */
  refreshCortege(): void {
    const core = this.core;
    const d = core.ctx.director;
    this.phase = d.phase;
    this.tension = d.tension;
    this.active = d.phase !== 'aucune';
    const route = d.route;
    if (route !== this.route || route.length !== this.route.length) {
      this.route = route;
      let len = 0;
      for (let i = 2; i + 1 < route.length; i += 2) len += Math.hypot(route[i] - route[i - 2], route[i + 1] - route[i - 1]);
      this.routeLength = len;
    }
    this.headS = d.headProgress;
    this.basePhase = core.crowd && core.crowd.active ? core.crowd.basePhase : d.phase;
    const f = core.crowd && core.crowd.active ? core.crowd.formation : null;
    this.tailS = f ? f.tailS : this.headS - 150;
    this.present = d.stats.present;
    this.total = d.stats.total;
  }

  /** Point du parcours à l'abscisse s (dans core.v2) ; retourne le cap de la marche en ce point. */
  routePoint(s: number): number {
    const r = this.route;
    const v = this.core.v2;
    const n = r.length >> 1;
    if (n === 0) {
      v.x = 0;
      v.z = 0;
      return 0;
    }
    if (n === 1 || s <= 0) {
      v.x = r[0];
      v.z = r[1];
      return n > 1 ? Math.atan2(r[2] - r[0], r[3] - r[1]) : 0;
    }
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const ax = r[i * 2 - 2];
      const az = r[i * 2 - 1];
      const bx = r[i * 2];
      const bz = r[i * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (s <= acc + len || i === n - 1) {
        const t = len > 1e-6 ? Math.min(1, (s - acc) / len) : 0;
        v.x = ax + (bx - ax) * t;
        v.z = az + (bz - az) * t;
        return Math.atan2(bx - ax, bz - az);
      }
      acc += len;
    }
    return 0;
  }

  /** Abscisse du point du parcours le plus proche de (x, z) ; écrit la distance à l'axe dans core.v3.y. */
  routeAbscissa(x: number, z: number): number {
    const r = this.route;
    const n = r.length >> 1;
    let best = Infinity;
    let bestS = 0;
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const ax = r[i * 2 - 2];
      const az = r[i * 2 - 1];
      const dx = r[i * 2] - ax;
      const dz = r[i * 2 + 1] - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      const len = Math.sqrt(len2);
      if (d < best) {
        best = d;
        bestS = acc + len * t;
      }
      acc += len;
    }
    if (n === 1) best = (x - r[0]) * (x - r[0]) + (z - r[1]) * (z - r[1]);
    this.core.v3.y = Math.sqrt(best);
    return bestS;
  }

  // ───────────────────────────── points chauds ─────────────────────────────

  /** Un fait à (x, z) est-il vu à cet instant par un agent à pied ou par un drone ? */
  seenNow(x: number, z: number): boolean {
    for (let i = 0; i < this.droneN; i++) {
      const dx = x - this.droneX[i];
      const dz = z - this.droneZ[i];
      if (dx * dx + dz * dz <= this.droneR[i] * this.droneR[i]) return true;
    }
    const ctx = this.core.ctx;
    const list = this.core.people2;
    const n = ctx.people.queryRadius(x, z, SIGHT, list, isPoliceOnFoot);
    const max = n < 10 ? n : 10;
    for (let i = 0; i < max; i++) if (ctx.world.lineOfSight(list[i].x, list[i].z, x, z)) return true;
    return false;
  }

  /**
   * Inscrit un fait. `seen` : true s'il est connu d'emblée (annoncé par la salle, constaté par un agent) ;
   * false : il ne sera connu que si quelqu'un le voit. Retourne le point chaud.
   */
  note(kind: HotKind, x: number, z: number, weight: number, seen: boolean, againstPolice = false): HotSpot {
    const now = this.core.now;
    const spots = this.spots;
    let s: HotSpot | null = null;
    let bestD = MERGE_RADIUS * MERGE_RADIUS;
    for (let i = 0; i < spots.length; i++) {
      const d = (spots[i].x - x) * (spots[i].x - x) + (spots[i].z - z) * (spots[i].z - z);
      if (d < bestD) {
        bestD = d;
        s = spots[i];
      }
    }
    if (!s) {
      if (spots.length >= MAX_SPOTS) {
        // le plus froid cède sa place
        let cold = 0;
        for (let i = 1; i < spots.length; i++) if (spots[i].heat < spots[cold].heat) cold = i;
        s = spots[cold];
        (s as { id: number }).id = this.nextId++;
      } else {
        s = { id: this.nextId++, x, z, heat: 0, kind, weights: [0, 0, 0, 0, 0, 0], firstAt: now, lastAt: now, seen: false, knownAt: Infinity, againstPolice: false };
        spots.push(s);
      }
      s.x = x;
      s.z = z;
      s.heat = 0;
      for (let i = 0; i < s.weights.length; i++) s.weights[i] = 0;
      s.firstAt = now;
      s.seen = false;
      s.knownAt = Infinity;
      s.againstPolice = false;
    } else {
      // le centre suit les faits récents
      const k = weight / (s.heat + weight + 0.5);
      s.x += (x - s.x) * k;
      s.z += (z - s.z) * k;
    }
    s.heat = Math.min(3, s.heat + weight);
    s.weights[KIND_INDEX[kind]] += weight;
    s.lastAt = now;
    if (againstPolice) s.againstPolice = true;
    let top = 0;
    for (let i = 1; i < s.weights.length; i++) if (s.weights[i] > s.weights[top]) top = i;
    s.kind = HOT_KINDS[top];
    if (!s.seen && (seen || this.seenNow(x, z))) {
      s.seen = true;
      s.knownAt = now + (seen ? 0 : this.reportDelay);
    }
    return s;
  }

  /** Point chaud connu le plus intense au-dessus du seuil (null si aucun). */
  hottest(minHeat: number): HotSpot | null {
    const now = this.core.now;
    let best: HotSpot | null = null;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.seen || now < s.knownAt || s.heat < minHeat) continue;
      if (!best || s.heat > best.heat) best = s;
    }
    return best;
  }

  /** Point chaud connu le plus proche de (x, z) dans le rayon, ou null. */
  near(x: number, z: number, radius: number): HotSpot | null {
    const now = this.core.now;
    let best: HotSpot | null = null;
    let bestD = radius * radius;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.seen || now < s.knownAt) continue;
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Retombée des intensités et prise de connaissance des faits non encore vus (appelé une fois par seconde). */
  update(dt: number): void {
    const core = this.core;
    const now = core.now;
    const decay = Math.pow(0.5, dt / HALF_LIFE);
    const spots = this.spots;
    for (let i = spots.length - 1; i >= 0; i--) {
      const s = spots[i];
      s.heat *= decay;
      for (let j = 0; j < s.weights.length; j++) s.weights[j] *= decay;
      if (s.heat < 0.04 && now - s.lastAt > 30) {
        spots[i] = spots[spots.length - 1];
        spots.pop();
        continue;
      }
      if (!s.seen && this.seenNow(s.x, s.z)) {
        s.seen = true;
        s.knownAt = now + this.reportDelay;
      }
    }
    // signes avant-coureurs publiés par le module de foule (service facultatif)
    if (core.signals && now >= this.signalAt) {
      this.signalAt = now + 2;
      const list = core.signals.list ?? core.signals.active;
      if (list) for (let i = 0; i < list.length; i++) this.signal(list[i], true);
    }
  }

  /** Signe avant-coureur (service 'crowd.signals' ou événement 'crowd:signal'). */
  signal(sig: CrowdSignal, fromService: boolean): void {
    if (!sig || !Number.isFinite(sig.x) || !Number.isFinite(sig.z)) return;
    if (fromService && sig.id !== undefined) {
      // un même signal du service n'est compté qu'une fois
      if (this.seenSignals.indexOf(sig.id) >= 0) return;
      if (this.seenSignals.length >= 64) this.seenSignals.splice(0, 32);
      this.seenSignals.push(sig.id);
    }
    const strength = sig.strength !== undefined && Number.isFinite(sig.strength) ? Math.max(0.1, Math.min(1, sig.strength)) : 0.5;
    this.note('groupe_hostile', sig.x, sig.z, 0.5 * strength + 0.15, false);
  }

  // ───────────────────────────── drone ─────────────────────────────

  observe(kind: string, x: number, z: number, count: number, hostile: number, vehicleId: EntityId): Observation {
    const list = this.observations;
    let o: Observation;
    if (list.length >= MAX_OBSERVATIONS) {
      o = list.shift()!;
      o.t = this.core.now;
      o.kind = kind;
      o.x = x;
      o.z = z;
      o.count = count;
      o.hostile = hostile;
      o.vehicleId = vehicleId;
    } else {
      o = { t: this.core.now, kind, x, z, count, hostile, vehicleId };
    }
    list.push(o);
    return o;
  }

  /** Dernière observation du drone près de (x, z), datant de moins de `maxAge` secondes. */
  lastObservation(x: number, z: number, radius: number, maxAge: number): Observation | null {
    const list = this.observations;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (this.core.now - o.t > maxAge) break;
      if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) <= radius * radius) return o;
    }
    return null;
  }
}

/** Auteur d'un fait récent, constaté et de gravité suffisante pour une interpellation (dans la fenêtre donnée). */
export function recentOffender(p: Person, now: number, window: number): boolean {
  const list = p.offenses;
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (now - o.t > window) return false;
    if (o.severity >= 2 && o.type !== 'attroupement_apres_sommations') return true;
  }
  return false;
}
