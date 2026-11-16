/* =====================================================================================
 * CIRCULATION — feux tricolores et priorité aux carrefours.
 *
 * FEUX. Un ensemble de feux (SignalCtrl) commande un carrefour, ou plusieurs carrefours très proches
 * (chaussées séparées d'un boulevard : moins de 30 m de l'un à l'autre). Deux phases : l'axe principal
 * (celui de la plus large chaussée) puis l'axe transversal, séparées par l'orange et un rouge de
 * dégagement. L'état est une fonction pure de l'horloge de session : rien n'est mis à jour à chaque pas,
 * et un carrefour jamais regardé ne coûte rien. Un feu isolé en pleine rue protège un passage piéton
 * (long vert pour les voitures, rouge court). Un véhicule en intervention (sirène) force son axe au vert.
 *
 * CARREFOURS. Chaque carrefour (≥ 3 chaussées) est une « boîte » où l'on ne s'engage qu'avec une
 * réservation : elle est accordée si la trajectoire (entrée → sortie, chacun sur sa voie de droite) ne
 * coupe celle d'aucun véhicule déjà engagé, ni celle d'un véhicule qui attend depuis plus longtemps
 * (premier arrivé, premier servi : pas de famine pour celui qui tourne à gauche ou sort d'une petite rue).
 * ===================================================================================== */

import { hash2 } from '@/core/rng';
import type { TrafficTuning } from './api';
import type { EdgePoint, RoadCache } from './graph';
import { N_JUNCTION } from './graph';
import { CLUSTER_REACH } from './tuning';

export const GREEN = 0;
export const AMBER = 1;
export const RED = 2;
export const NO_SIGNAL = 3;

/** Durée du rouge d'un feu de passage piéton en pleine rue (s). */
const MIDBLOCK_RED = 12;

export class SignalCtrl {
  id = 0;
  /** Axe principal (vecteur unitaire, sens indifférent). */
  ax = 0;
  az = 1;
  /** Décalage dans le cycle (s) : les carrefours ne passent pas tous au vert en même temps. */
  offset = 0;
  midblock = false;
  preemptUntil = -1;
  preDx = 0;
  preDz = 0;
}

export class Signals {
  private readonly ctrls = new Map<number, SignalCtrl>();
  private readonly stack: number[] = [];
  private readonly members: number[] = [];
  private readonly dir: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };

  constructor(private readonly cache: RoadCache, private readonly tuning: TrafficTuning) {}

  reset(): void {
    this.ctrls.clear();
  }

  /** Ensemble de feux du carrefour (créé à la première demande, partagé par les carrefours voisins). */
  ctrlOf(node: number): SignalCtrl {
    const known = this.ctrls.get(node);
    if (known) return known;
    const c = this.cache;
    const members = this.members;
    const stack = this.stack;
    members.length = 0;
    stack.length = 0;
    members.push(node);
    stack.push(node);
    while (stack.length > 0 && members.length < 16) {
      const n = stack.pop()!;
      for (let k = c.adjStart[n]!; k < c.adjStart[n + 1]!; k++) {
        let e = c.adjEdge[k]!;
        if (!c.isVehicle(e)) continue;
        // suit la chaussée à travers les nœuds de degré 2 jusqu'au prochain carrefour, s'il est tout près
        let at = n;
        let dist = 0;
        let guard = 0;
        for (;;) {
          dist += c.edgeLen[e]!;
          at = c.other(e, at);
          if (dist > CLUSTER_REACH || c.nodeDeg[at] !== 2 || guard++ > 12) break;
          let next = -1;
          for (let j = c.adjStart[at]!; j < c.adjStart[at + 1]!; j++) {
            const e2 = c.adjEdge[j]!;
            if (e2 !== e && c.isVehicle(e2)) next = e2;
          }
          if (next < 0) break;
          e = next;
        }
        if (dist <= CLUSTER_REACH && (c.nodeFlags[at]! & N_JUNCTION) !== 0 && members.indexOf(at) < 0) {
          members.push(at);
          stack.push(at);
        }
      }
    }
    const ctrl = new SignalCtrl();
    let id = node;
    let bestWidth = -1;
    for (let i = 0; i < members.length; i++) {
      const n = members[i]!;
      if (n < id) id = n;
      for (let k = c.adjStart[n]!; k < c.adjStart[n + 1]!; k++) {
        const e = c.adjEdge[k]!;
        if (!c.isVehicle(e)) continue;
        // la plus large chaussée, à largeur égale la plus longue, fixe l'axe principal
        const w = c.edgeWidth[e]! + c.edgeLen[e]! * 0.001;
        if (w > bestWidth) {
          bestWidth = w;
          c.dirFrom(e, n, this.dir);
          ctrl.ax = this.dir.dx;
          ctrl.az = this.dir.dz;
        }
      }
    }
    ctrl.id = id;
    const t = this.tuning;
    const cycle = t.greenMain + t.greenCross + 2 * (t.amber + t.allRed);
    ctrl.offset = (hash2(id, 7919) % 1000) / 1000 * cycle;
    for (let i = 0; i < members.length; i++) this.ctrls.set(members[i]!, ctrl);
    return ctrl;
  }

  /** Feu isolé (nœud de degré ≤ 2 sans carrefour à proximité) : passage piéton protégé. */
  midblockCtrl(node: number): SignalCtrl {
    let ctrl = this.ctrls.get(node);
    if (ctrl) return ctrl;
    ctrl = new SignalCtrl();
    ctrl.id = node;
    ctrl.midblock = true;
    ctrl.offset = (hash2(node, 104729) % 1000) / 1000 * 60;
    this.ctrls.set(node, ctrl);
    return ctrl;
  }

  /** Ensemble de feux déjà connu pour ce nœud (sans le créer). */
  peek(node: number): SignalCtrl | undefined {
    return this.ctrls.get(node);
  }

  /** Couleur du feu pour un véhicule qui arrive dans la direction (dx, dz). */
  state(ctrl: SignalCtrl, dx: number, dz: number, now: number): number {
    const t = this.tuning;
    if (!t.signals) return NO_SIGNAL;
    if (now < ctrl.preemptUntil) return dx * ctrl.preDx + dz * ctrl.preDz > 0.7 ? GREEN : RED;
    if (ctrl.midblock) {
      const green = t.greenMain + t.greenCross;
      const tt = (now + ctrl.offset) % (green + t.amber + MIDBLOCK_RED);
      return tt < green ? GREEN : tt < green + t.amber ? AMBER : RED;
    }
    const cycle = t.greenMain + t.greenCross + 2 * (t.amber + t.allRed);
    let tt = (now + ctrl.offset) % cycle;
    const dot = dx * ctrl.ax + dz * ctrl.az;
    if (dot >= 0.7071 || dot <= -0.7071) {
      return tt < t.greenMain ? GREEN : tt < t.greenMain + t.amber ? AMBER : RED;
    }
    tt -= t.greenMain + t.amber + t.allRed;
    return tt < 0 ? RED : tt < t.greenCross ? GREEN : tt < t.greenCross + t.amber ? AMBER : RED;
  }

  /**
   * Temps pendant lequel les véhicules de la rue de direction (dx, dz) ont encore le rouge (s) : 0 s'ils ont
   * le vert ou l'orange. Un piéton traverse cette rue quand ce temps couvre sa traversée.
   */
  redLeft(ctrl: SignalCtrl, dx: number, dz: number, now: number): number {
    const t = this.tuning;
    if (!t.signals || now < ctrl.preemptUntil) return 0;
    if (ctrl.midblock) {
      const green = t.greenMain + t.greenCross;
      const cycle = green + t.amber + MIDBLOCK_RED;
      const tt = (now + ctrl.offset) % cycle;
      return tt < green + t.amber ? 0 : cycle - tt;
    }
    const cycle = t.greenMain + t.greenCross + 2 * (t.amber + t.allRed);
    const tt = (now + ctrl.offset) % cycle;
    const dot = dx * ctrl.ax + dz * ctrl.az;
    if (dot >= 0.7071 || dot <= -0.7071) return tt < t.greenMain + t.amber ? 0 : cycle - tt;
    const start = t.greenMain + t.amber + t.allRed;
    if (tt < start) return start - tt;
    return tt < start + t.greenCross + t.amber ? 0 : cycle - tt + start;
  }

  /** Un véhicule en intervention arrive dans la direction donnée : son axe passe au vert, les autres au rouge. */
  preempt(ctrl: SignalCtrl, dx: number, dz: number, until: number): void {
    ctrl.preemptUntil = until;
    ctrl.preDx = dx;
    ctrl.preDz = dz;
  }
}

// ───────────────────────────── boîtes de carrefour ─────────────────────────────

class Reservation {
  car = 0;
  inDx = 0;
  inDz = 1;
  outDx = 0;
  outDz = 1;
  granted = false;
  /** Première demande refusée (ancienneté dans la file). */
  since = 0;
  until = 0;
}

class Box {
  readonly res: Reservation[] = [];
  n = 0;
  preemptUntil = -1;
  preDx = 0;
  preDz = 0;
}

/** Durée de vie d'une réservation sans rappel du véhicule (s) ; d'une demande en attente (s). */
const GRANT_TTL = 5;
const WAIT_TTL = 1.2;

/** Les trajectoires (entrée → sortie) de deux véhicules se coupent-elles dans le carrefour ? */
export function movementsConflict(
  aInX: number, aInZ: number, aOutX: number, aOutZ: number,
  bInX: number, bInZ: number, bOutX: number, bOutZ: number,
): boolean {
  // même approche : l'un derrière l'autre, la distance de sécurité suffit
  if (aInX * bInX + aInZ * bInZ > 0.9) return false;
  // même sortie : les deux veulent la même voie
  if (aOutX * bOutX + aOutZ * bOutZ > 0.9) return true;
  // cordes de la trajectoire dans un cercle unité, chacun sur sa voie de droite (droite = (−dz, dx))
  const L = 0.3;
  const a0x = -aInX - aInZ * L;
  const a0z = -aInZ + aInX * L;
  const a1x = aOutX - aOutZ * L;
  const a1z = aOutZ + aOutX * L;
  const b0x = -bInX - bInZ * L;
  const b0z = -bInZ + bInX * L;
  const b1x = bOutX - bOutZ * L;
  const b1z = bOutZ + bOutX * L;
  const rx = a1x - a0x;
  const rz = a1z - a0z;
  const sx = b1x - b0x;
  const sz = b1z - b0z;
  const den = rx * sz - rz * sx;
  const qx = b0x - a0x;
  const qz = b0z - a0z;
  if (den > -1e-6 && den < 1e-6) {
    // parallèles : en conflit seulement si elles se recouvrent presque (même corde en sens inverse)
    const off = qx * rz - qz * rx;
    const len = Math.sqrt(rx * rx + rz * rz);
    return len > 1e-6 && Math.abs(off) / len < 0.25;
  }
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  return t > -0.05 && t < 1.05 && u > -0.05 && u < 1.05;
}

export class Boxes {
  private readonly boxes = new Map<number, Box>();
  private readonly pool: Reservation[] = [];

  reset(): void {
    this.boxes.clear();
  }

  private box(node: number): Box {
    let b = this.boxes.get(node);
    if (!b) {
      b = new Box();
      this.boxes.set(node, b);
    }
    return b;
  }

  private drop(b: Box, i: number): void {
    const r = b.res[i]!;
    b.res[i] = b.res[b.n - 1]!;
    b.res[b.n - 1] = r;
    b.n--;
    this.pool.push(r);
    b.res.length = b.n;
  }

  /**
   * Demande (ou confirme) le droit de traverser le carrefour selon la trajectoire donnée (vecteurs unitaires
   * d'arrivée et de départ). À rappeler à chaque réflexion tant que le véhicule attend ou traverse.
   */
  request(node: number, car: number, inDx: number, inDz: number, outDx: number, outDz: number, now: number): boolean {
    const b = this.box(node);
    let mine: Reservation | null = null;
    for (let i = b.n - 1; i >= 0; i--) {
      const r = b.res[i]!;
      if (r.car === car) mine = r;
      else if (r.until < now) this.drop(b, i);
    }
    if (mine && b.res.indexOf(mine) >= b.n) mine = null;
    if (!mine) {
      mine = this.pool.pop() ?? new Reservation();
      mine.car = car;
      mine.granted = false;
      mine.since = now;
      b.res[b.n++] = mine;
    }
    mine.inDx = inDx;
    mine.inDz = inDz;
    mine.outDx = outDx;
    mine.outDz = outDz;
    if (mine.granted) {
      mine.until = now + GRANT_TTL;
      return true;
    }
    mine.until = now + WAIT_TTL;
    if (now < b.preemptUntil && inDx * b.preDx + inDz * b.preDz < 0.7) return false;
    for (let i = 0; i < b.n; i++) {
      const r = b.res[i]!;
      if (r === mine) continue;
      if (!r.granted && r.since >= mine.since) continue; // arrivé après moi : il attendra
      if (movementsConflict(inDx, inDz, outDx, outDz, r.inDx, r.inDz, r.outDx, r.outDz)) return false;
    }
    mine.granted = true;
    mine.until = now + GRANT_TTL;
    return true;
  }

  /** Le véhicule tient-il une réservation accordée et valide ? */
  holds(node: number, car: number, now: number): boolean {
    const b = this.boxes.get(node);
    if (!b) return false;
    for (let i = 0; i < b.n; i++) {
      const r = b.res[i]!;
      if (r.car === car) return r.granted && r.until >= now;
    }
    return false;
  }

  release(node: number, car: number): void {
    const b = this.boxes.get(node);
    if (!b) return;
    for (let i = b.n - 1; i >= 0; i--) if (b.res[i]!.car === car) this.drop(b, i);
  }

  /** Réserve le carrefour à l'axe d'un véhicule en intervention : seules les approches de même sens passent. */
  preempt(node: number, dx: number, dz: number, until: number): void {
    const b = this.box(node);
    b.preemptUntil = until;
    b.preDx = dx;
    b.preDz = dz;
  }

  /** Nombre de réservations accordées en cours (diagnostic, tests). */
  granted(node: number, now: number): number {
    const b = this.boxes.get(node);
    if (!b) return 0;
    let n = 0;
    for (let i = 0; i < b.n; i++) if (b.res[i]!.granted && b.res[i]!.until >= now) n++;
    return n;
  }
}
