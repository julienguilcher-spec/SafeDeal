/* =====================================================================================
 * CIRCULATION — itinéraire d'un automobiliste : la polyligne rendue par ctx.world.findPath (la même que
 * celle que suit le pilote automatique, calculée au même instant avec les mêmes arguments), l'abscisse
 * du véhicule, et les POINTS DE CONTRÔLE rencontrés : lignes de feu et carrefours où il faut une
 * réservation avant de s'engager.
 * ===================================================================================== */

import type { RoadCache } from './graph';
import { N_JUNCTION, N_SIGNAL } from './graph';
import type { SignalCtrl, Signals } from './signals';
import { CLUSTER_REACH, SIGNAL_REACH, STOP_SETBACK } from './tuning';

export const CP_SIGNAL = 1;
export const CP_BOX = 2;

export class ControlPoint {
  node = -1;
  /** Abscisse de la ligne d'arrêt (où s'immobilise le pare-chocs avant) et du nœud. */
  stopS = 0;
  nodeS = 0;
  /** Rayon du carrefour (m) : au-delà, le véhicule l'a quitté. */
  radius = 0;
  kind = 0;
  ctrl: SignalCtrl | null = null;
  /** Directions unitaires d'arrivée et de départ. */
  inDx = 0;
  inDz = 1;
  outDx = 0;
  outDz = 1;
  /** Franchissement acquis (feu vert vu, carrefour réservé). */
  cleared = false;
}

export interface RoutePoint { x: number; z: number; dx: number; dz: number }

export class CarRoute {
  readonly pts: number[] = [];
  readonly cum: number[] = [];
  n = 0;
  total = 0;
  seg = 0;
  s = 0;
  readonly cps: ControlPoint[] = [];
  cpCount = 0;
  /** Premier point de contrôle pas encore dépassé. */
  cpNext = 0;

  /** Remplace l'itinéraire par les `count` premiers points de `points` (points confondus retirés). */
  setPath(points: ArrayLike<number>, count: number): void {
    const path = this.pts;
    const cum = this.cum;
    let n = 0;
    let total = 0;
    for (let i = 0; i < count; i++) {
      const x = points[i * 2]!;
      const z = points[i * 2 + 1]!;
      if (n > 0) {
        const dx = x - path[n * 2 - 2]!;
        const dz = z - path[n * 2 - 1]!;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.05 && i < count - 1) continue;
        total += d;
      }
      path[n * 2] = x;
      path[n * 2 + 1] = z;
      cum[n] = total;
      n++;
    }
    path.length = n * 2;
    cum.length = n;
    this.n = n;
    this.total = total;
    this.seg = 0;
    this.s = 0;
    this.cpCount = 0;
    this.cpNext = 0;
  }

  /** Recale l'abscisse du véhicule (recherche vers l'avant seulement). */
  project(x: number, z: number): void {
    const path = this.pts;
    const last = this.n - 2;
    if (last < 0) {
      this.s = 0;
      return;
    }
    let best = Infinity;
    let bestSeg = this.seg;
    let bestS = this.s;
    const end = Math.min(last, this.seg + 5);
    for (let i = this.seg; i <= end; i++) {
      const ax = path[i * 2]!;
      const az = path[i * 2 + 1]!;
      const dx = path[i * 2 + 2]! - ax;
      const dz = path[i * 2 + 3]! - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const ex = x - (ax + dx * t);
      const ez = z - (az + dz * t);
      const d2 = ex * ex + ez * ez + (i - this.seg) * 0.05;
      if (d2 < best) {
        best = d2;
        bestSeg = i;
        bestS = this.cum[i]! + Math.sqrt(l2) * t;
      }
    }
    this.seg = bestSeg;
    if (bestS > this.s) this.s = bestS;
  }

  /** Point à l'abscisse `s` (bornée) et direction du tronçon. */
  sample(s: number, out: RoutePoint): void {
    const path = this.pts;
    const cum = this.cum;
    const n = this.n;
    if (n < 2) {
      out.x = n === 1 ? path[0]! : 0;
      out.z = n === 1 ? path[1]! : 0;
      out.dx = 0;
      out.dz = 1;
      return;
    }
    let i = this.seg;
    if (i > n - 2) i = n - 2;
    while (i < n - 2 && cum[i + 1]! < s) i++;
    while (i > 0 && cum[i]! > s) i--;
    const ax = path[i * 2]!;
    const az = path[i * 2 + 1]!;
    const dx = path[i * 2 + 2]! - ax;
    const dz = path[i * 2 + 3]! - az;
    const l = Math.sqrt(dx * dx + dz * dz);
    let t = l > 1e-9 ? (s - cum[i]!) / l : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    out.x = ax + dx * t;
    out.z = az + dz * t;
    out.dx = l > 1e-9 ? dx / l : 0;
    out.dz = l > 1e-9 ? dz / l : 1;
  }

  private add(): ControlPoint {
    let cp = this.cps[this.cpCount];
    if (!cp) {
      cp = new ControlPoint();
      this.cps[this.cpCount] = cp;
    }
    this.cpCount++;
    cp.cleared = false;
    cp.ctrl = null;
    cp.kind = 0;
    return cp;
  }

  /** Direction unitaire du tronçon qui arrive au sommet `i` (ou qui en part si `leaving`). */
  private dirAt(i: number, leaving: boolean, cp: ControlPoint): void {
    const p = this.pts;
    const n = this.n;
    let a = leaving ? i : i - 1;
    let b = leaving ? i + 1 : i;
    if (a < 0) {
      a = 0;
      b = 1;
    }
    if (b > n - 1) {
      a = n - 2;
      b = n - 1;
    }
    const dx = p[b * 2]! - p[a * 2]!;
    const dz = p[b * 2 + 1]! - p[a * 2 + 1]!;
    const l = Math.sqrt(dx * dx + dz * dz);
    const ux = l > 1e-6 ? dx / l : 0;
    const uz = l > 1e-6 ? dz / l : 1;
    if (leaving) {
      cp.outDx = ux;
      cp.outDz = uz;
    } else {
      cp.inDx = ux;
      cp.inDz = uz;
    }
  }

  /** Repère les lignes de feu et les carrefours de l'itinéraire. */
  buildControlPoints(cache: RoadCache, signals: Signals): void {
    this.cpCount = 0;
    this.cpNext = 0;
    const n = this.n;
    if (!cache.ready || n < 3) return;
    const p = this.pts;
    const cum = this.cum;
    let pendingS = -1;
    let pendingNode = -1;
    let pendingIndex = -1;
    let prevNode = -1;
    let prevEnd = 0; // abscisse où l'on a quitté le carrefour précédent
    let prevS = -1e9;
    for (let i = 1; i < n - 1; i++) {
      const node = cache.nodeAt(p[i * 2]!, p[i * 2 + 1]!);
      if (node < 0) continue;
      const s = cum[i]!;
      const flags = cache.nodeFlags[node]!;
      if ((flags & N_JUNCTION) !== 0) {
        const cp = this.add();
        cp.node = node;
        cp.nodeS = s;
        cp.radius = cache.nodeRadius[node]!;
        cp.kind = CP_BOX;
        this.dirAt(i, false, cp);
        this.dirAt(i, true, cp);
        let stop = s - cp.radius - STOP_SETBACK;
        const lineAhead = pendingS >= 0 && s - pendingS <= SIGNAL_REACH;
        if (lineAhead || (flags & N_SIGNAL) !== 0) {
          const ctrl = signals.ctrlOf(node);
          // à l'intérieur d'un même ensemble de carrefours, on ne s'arrête plus : on dégage
          const internal = prevNode >= 0 && s - prevS < CLUSTER_REACH + 2 && signals.peek(prevNode) === ctrl;
          if (!internal) {
            cp.kind |= CP_SIGNAL;
            cp.ctrl = ctrl;
            if (lineAhead) stop = pendingS - 0.8;
          }
        }
        if (stop < prevEnd + 1) stop = prevEnd + 1;
        if (stop > s - 1) stop = s - 1;
        cp.stopS = stop;
        prevNode = node;
        prevS = s;
        prevEnd = s + cp.radius;
        pendingS = -1;
      } else if ((flags & N_SIGNAL) !== 0) {
        if (pendingS >= 0) this.addMidblock(signals, pendingNode, pendingIndex, pendingS, prevEnd);
        pendingS = s;
        pendingNode = node;
        pendingIndex = i;
      }
      if (pendingS >= 0 && s - pendingS > SIGNAL_REACH) {
        // aucun carrefour derrière ce feu : passage piéton protégé en pleine rue
        const cp = this.addMidblock(signals, pendingNode, pendingIndex, pendingS, prevEnd);
        prevEnd = cp.nodeS + cp.radius;
        pendingS = -1;
      }
    }
    if (pendingS >= 0 && this.total - pendingS > 4) this.addMidblock(signals, pendingNode, pendingIndex, pendingS, prevEnd);
    // les points de contrôle doivent rester dans l'ordre des abscisses
    for (let i = 1; i < this.cpCount; i++) {
      const cp = this.cps[i]!;
      let j = i - 1;
      while (j >= 0 && this.cps[j]!.nodeS > cp.nodeS) {
        this.cps[j + 1] = this.cps[j]!;
        j--;
      }
      this.cps[j + 1] = cp;
    }
  }

  private addMidblock(signals: Signals, node: number, index: number, s: number, prevEnd: number): ControlPoint {
    const cp = this.add();
    cp.node = node;
    cp.nodeS = s;
    cp.radius = 2.5;
    cp.kind = CP_SIGNAL;
    cp.ctrl = signals.midblockCtrl(node);
    this.dirAt(index, false, cp);
    this.dirAt(index, true, cp);
    cp.stopS = Math.max(prevEnd + 1, s - 3);
    return cp;
  }
}
