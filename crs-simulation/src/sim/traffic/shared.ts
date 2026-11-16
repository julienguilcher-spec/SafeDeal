/* =====================================================================================
 * CIRCULATION — noyau partagé par les sous-systèmes du module : contexte, graphe, réglages, compteurs,
 * point d'intérêt (joueur), visibilité, dangers récents (détonations, incendies) et obstructions
 * signalées par les automobilistes bloqués (les suivants les contournent).
 * ===================================================================================== */

import type { GameContext, Person, Rng, RoadSample } from '@/core/contracts';
import type { TrafficStats, TrafficTuning } from './api';
import type { Closures } from './closures';
import { RoadCache } from './graph';
import type { Boxes, Signals } from './signals';
import { defaultTuning } from './tuning';

export function makeRoadSample(): RoadSample {
  return { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
}

export function makeStats(): TrafficStats {
  return {
    vehicles: 0, blocked: 0, parked: 0, abandoned: 0, pedestrians: 0, fleeing: 0, vehicleTarget: 0, pedestrianTarget: 0,
    closures: 0, spawned: 0, despawned: 0, reroutes: 0, uturns: 0, honks: 0, abandons: 0, incidents: 0,
  };
}

/** Danger ponctuel récent : détonation, incendie, personne à terre. */
class Danger {
  x = 0;
  z = 0;
  radius = 0;
  strength = 0;
  until = -1;
}

/** Mémoire courte des dangers : les civils (automobilistes et piétons) s'en éloignent. */
export class Dangers {
  private readonly list: Danger[] = [];
  private next = 0;
  /** Dernier danger trouvé par at() (pour fuir dans la direction opposée). */
  lastX = 0;
  lastZ = 0;
  /** Nombre de dangers encore actifs (mis à jour par prune). */
  active = 0;

  constructor(size = 24) {
    for (let i = 0; i < size; i++) this.list.push(new Danger());
  }

  reset(): void {
    for (let i = 0; i < this.list.length; i++) this.list[i]!.until = -1;
    this.active = 0;
  }

  add(x: number, z: number, radius: number, strength: number, until: number): void {
    const list = this.list;
    // fusionne avec un danger voisin encore actif
    for (let i = 0; i < list.length; i++) {
      const d = list[i]!;
      if (d.until < 0) continue;
      const dx = d.x - x;
      const dz = d.z - z;
      if (dx * dx + dz * dz < 36) {
        if (strength > d.strength) d.strength = strength;
        if (radius > d.radius) d.radius = radius;
        if (until > d.until) d.until = until;
        return;
      }
    }
    const d = list[this.next]!;
    this.next = (this.next + 1) % list.length;
    if (d.until < 0) this.active++;
    d.x = x;
    d.z = z;
    d.radius = radius;
    d.strength = strength;
    d.until = until;
  }

  prune(now: number): void {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i]!;
      if (d.until >= 0 && d.until < now) d.until = -1;
      if (d.until >= 0) n++;
    }
    this.active = n;
  }

  /** Niveau de danger ressenti en un point (0..1) ; renseigne lastX / lastZ avec le danger dominant. */
  at(x: number, z: number): number {
    if (this.active === 0) return 0;
    let best = 0;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i]!;
      if (d.until < 0) continue;
      const dx = x - d.x;
      const dz = z - d.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= d.radius * d.radius) continue;
      const level = d.strength * (1 - Math.sqrt(d2) / d.radius);
      if (level > best) {
        best = level;
        this.lastX = d.x;
        this.lastZ = d.z;
      }
    }
    return best;
  }
}

/** Chaussée signalée bloquée par un automobiliste (foule, barricade, épave). */
class Obstruction {
  x = 0;
  z = 0;
  radius = 0;
  until = -1;
}

export class Obstructions {
  readonly list: Obstruction[] = [];
  active = 0;

  constructor(size = 12) {
    for (let i = 0; i < size; i++) this.list.push(new Obstruction());
  }

  reset(): void {
    for (let i = 0; i < this.list.length; i++) this.list[i]!.until = -1;
    this.active = 0;
  }

  add(x: number, z: number, radius: number, until: number): void {
    let slot: Obstruction | null = null;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i]!;
      if (o.until < 0) {
        if (!slot) slot = o;
        continue;
      }
      const dx = o.x - x;
      const dz = o.z - z;
      if (dx * dx + dz * dz < 144) {
        if (until > o.until) o.until = until;
        return;
      }
    }
    if (!slot) slot = this.list[0]!;
    else this.active++;
    slot.x = x;
    slot.z = z;
    slot.radius = radius;
    slot.until = until;
  }

  prune(now: number): void {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i]!;
      if (o.until >= 0 && o.until < now) o.until = -1;
      if (o.until >= 0) n++;
    }
    this.active = n;
  }

  /** L'itinéraire (polyligne plate) passe-t-il par une chaussée signalée bloquée, au-delà de `fromS` ? */
  blocks(pts: readonly number[], cum: readonly number[], n: number, fromS: number): boolean {
    if (this.active === 0) return false;
    for (let k = 0; k < this.list.length; k++) {
      const o = this.list[k]!;
      if (o.until < 0) continue;
      const r2 = o.radius * o.radius;
      for (let i = 0; i < n - 1; i++) {
        if (cum[i + 1]! < fromS) continue;
        const ax = pts[i * 2]!;
        const az = pts[i * 2 + 1]!;
        const dx = pts[i * 2 + 2]! - ax;
        const dz = pts[i * 2 + 3]! - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 1e-9 ? ((o.x - ax) * dx + (o.z - az) * dz) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const ex = o.x - (ax + dx * t);
        const ez = o.z - (az + dz * t);
        if (ex * ex + ez * ez < r2) return true;
      }
    }
    return false;
  }
}

/** Véhicule en intervention repéré (sirène en marche), tel que les automobilistes et les piétons l'entendent. */
export class Siren {
  id = 0;
  x = 0;
  z = 0;
  /** Sens de marche (unitaire). */
  dx = 0;
  dz = 1;
  speed = 0;
  /** Demi-largeur du véhicule (m) : la place qu'il lui faut pour passer. */
  halfW = 1;
}

export const MAX_SIRENS = 8;

/**
 * Sirènes en marche autour du joueur, relevées deux fois par seconde par CarWatcher. Les piétons s'en servent
 * aussi : ils ne s'engagent pas sur la chaussée quand une sirène approche.
 */
export class Sirens {
  readonly list: Siren[] = [];
  count = 0;

  constructor() {
    for (let i = 0; i < MAX_SIRENS; i++) this.list.push(new Siren());
  }

  reset(): void {
    this.count = 0;
  }

  /**
   * Une sirène arrive-t-elle sur le point (x, z) ? Vrai si elle en est à moins de `near` m, ou si le point est
   * devant elle à moins de `reach` m et à moins de `side` m de sa trajectoire. Renvoie la sirène, ou null.
   */
  approaching(x: number, z: number, reach: number, side: number, near: number): Siren | null {
    for (let i = 0; i < this.count; i++) {
      const s = this.list[i]!;
      const rx = x - s.x;
      const rz = z - s.z;
      if (rx * rx + rz * rz < near * near) return s;
      const ahead = rx * s.dx + rz * s.dz;
      if (ahead < -4 || ahead > reach) continue;
      const lat = rx * s.dz - rz * s.dx;
      if (lat < side && lat > -side) return s;
    }
    return null;
  }
}

/** Ce que le gestionnaire des véhicules demande à celui des piétons (conducteur descendu de voiture). */
export interface PedAdopter {
  adopt(p: Person, fleeing: boolean, fromX: number, fromZ: number): void;
}

export class TrafficKernel {
  ctx!: GameContext;
  readonly cache = new RoadCache();
  readonly tuning: TrafficTuning = defaultTuning();
  readonly stats: TrafficStats = makeStats();
  readonly dangers = new Dangers();
  readonly obstructions = new Obstructions();
  /** Sirènes en marche (relevées par CarWatcher, lues aussi par les piétons). */
  readonly sirens = new Sirens();
  signals!: Signals;
  boxes!: Boxes;
  closures!: Closures;
  peds: PedAdopter | null = null;
  rng!: Rng;
  /** Multiplicateurs de session (SessionConfig.extra.traffic). */
  sessionVehicles = 1;
  sessionParked = 1;
  sessionPedestrians = 1;
  /** Point d'intérêt : le joueur, à défaut le lieu de la session. */
  hasFocus = false;
  focusX = 0;
  focusZ = 0;
  /** Direction du regard du joueur (unitaire) si elle est connue. */
  hasCam = false;
  camX = 0;
  camZ = 1;
  /** Part de la rue occupée par la manifestation autour du joueur (0..1). */
  crowd = 0;
  /** Manifestants présents à moins de 150 m du joueur (0 : aucune réaction de foule à calculer). */
  protestNear = 0;

  /** Met à jour le point d'intérêt. */
  refocus(): void {
    const ctx = this.ctx;
    const p = ctx.player.person();
    if (p) {
      this.hasFocus = true;
      this.focusX = p.x;
      this.focusZ = p.z;
      const yaw = ctx.player.state.camYaw;
      this.hasCam = true;
      this.camX = Math.sin(yaw);
      this.camZ = Math.cos(yaw);
      return;
    }
    this.hasCam = false;
    const cfg = ctx.session.config;
    if (cfg && cfg.x !== undefined && cfg.z !== undefined) {
      this.hasFocus = true;
      this.focusX = cfg.x;
      this.focusZ = cfg.z;
    } else {
      this.hasFocus = false;
    }
  }

  /** Le point est-il sous les yeux du joueur ? (champ de vision horizontal large, ligne de vue dégagée) */
  visible(x: number, z: number): boolean {
    const dx = x - this.focusX;
    const dz = z - this.focusZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > 240 * 240) return false;
    if (d2 < 144) return true;
    if (this.hasCam) {
      const d = Math.sqrt(d2);
      if ((dx * this.camX + dz * this.camZ) / d < 0.42) return false; // hors d'un champ de ± 65°
    }
    return this.ctx.world.lineOfSight(this.focusX, this.focusZ, x, z);
  }

  distToFocus2(x: number, z: number): number {
    const dx = x - this.focusX;
    const dz = z - this.focusZ;
    return dx * dx + dz * dz;
  }
}
