/* =====================================================================================
 * VILLE EN 3D — altitude des tabliers de ponts (logique pure).
 * -------------------------------------------------------------------------------------
 * Reprend la formule de la simulation (src/world/query/roads.ts, deckHeight) pour que les
 * personnages posent le pied sur le tablier dessiné :
 *   - un pont relie l'altitude du relief à ses deux extrémités sans suivre le relief ;
 *   - un pont fait de plusieurs arêtes à la suite : les nœuds intermédiaires sont interpolés selon
 *     la longueur des arêtes (relaxation, exacte sur une chaîne) ;
 *   - à moins d'une demi-largeur de l'axe : l'altitude du tablier ; au-delà, sur l'emprise réelle,
 *     la même altitude amenée sur 8 m depuis chaque bout, avec un raccord latéral de 1,5 m.
 * Cette classe est interrogée pour les sommets des surfaces de tablier : ils sont, par
 * construction, sur l'emprise du pont.
 * ===================================================================================== */

import type { RoadGraph } from '../mapdata';
import { halfDeckOf } from './raster';

const DECK_REACH = 45;
const DECK_RAMP = 8;
const DECK_BLEND = 1.5;

export class BridgeProfile {
  /** Segments de pont : 4 valeurs chacun (ax, az, bx, bz). */
  private readonly seg: Float32Array;
  private readonly segEdge: Int32Array;
  private readonly segS0: Float32Array;
  private readonly count: number;
  private readonly ya: Float32Array;
  private readonly yb: Float32Array;
  private readonly rampA: Uint8Array;
  private readonly rampB: Uint8Array;
  private readonly graph: RoadGraph;
  // Sous-ensemble de segments proche d'une tuile (voir focus).
  private near: Int32Array = new Int32Array(0);
  private nearCount = 0;
  /** Résultat de la dernière recherche. */
  lastEdge = -1;
  lastAlong = 0;
  lastDist = 0;

  constructor(graph: RoadGraph, terrainAt: (x: number, z: number) => number) {
    this.graph = graph;
    const ne = graph.edges.length, nn = graph.nodes.length;
    this.ya = new Float32Array(ne);
    this.yb = new Float32Array(ne);
    this.rampA = new Uint8Array(ne);
    this.rampB = new Uint8Array(ne);
    let segs = 0;
    for (let e = 0; e < ne; e++) {
      const ed = graph.edges[e];
      if (ed.bridge && !ed.tunnel) segs += Math.max(0, (ed.points.length >> 1) - 1);
    }
    this.count = segs;
    this.seg = new Float32Array(segs * 4);
    this.segEdge = new Int32Array(segs);
    this.segS0 = new Float32Array(segs);
    if (segs === 0) return;
    const y = new Float32Array(nn);
    const interior = new Uint8Array(nn);
    const inner: number[] = [];
    for (let n = 0; n < nn; n++) {
      const nd = graph.nodes[n];
      y[n] = terrainAt(nd.x, nd.z);
      let all = nd.edges.length >= 2;
      for (let k = 0; k < nd.edges.length && all; k++) {
        const ed = graph.edges[nd.edges[k]];
        if (!ed.bridge || ed.tunnel) all = false;
      }
      if (all) {
        interior[n] = 1;
        inner.push(n);
      }
    }
    for (let iter = 0; iter < 200 && inner.length > 0; iter++) {
      let change = 0;
      for (let q = 0; q < inner.length; q++) {
        const n = inner[q];
        const nd = graph.nodes[n];
        let sum = 0, wsum = 0;
        for (let k = 0; k < nd.edges.length; k++) {
          const ed = graph.edges[nd.edges[k]];
          const other = ed.a === n ? ed.b : ed.a;
          if (other === n) continue;
          const w = 1 / Math.max(0.5, ed.length);
          sum += y[other] * w;
          wsum += w;
        }
        if (wsum > 0) {
          const v = sum / wsum;
          change = Math.max(change, Math.abs(v - y[n]));
          y[n] = v;
        }
      }
      if (change < 0.001) break;
    }
    let k = 0;
    for (let e = 0; e < ne; e++) {
      const ed = graph.edges[e];
      if (!ed.bridge || ed.tunnel) continue;
      this.ya[e] = y[ed.a];
      this.yb[e] = y[ed.b];
      this.rampA[e] = interior[ed.a] === 1 ? 0 : 1;
      this.rampB[e] = interior[ed.b] === 1 ? 0 : 1;
      const pts = ed.points;
      let s = 0;
      for (let i = 2; i + 1 < pts.length; i += 2) {
        this.seg[4 * k] = pts[i - 2];
        this.seg[4 * k + 1] = pts[i - 1];
        this.seg[4 * k + 2] = pts[i];
        this.seg[4 * k + 3] = pts[i + 1];
        this.segEdge[k] = e;
        this.segS0[k] = s;
        s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        k++;
      }
    }
    this.near = new Int32Array(segs);
  }

  get bridgeSegments(): number {
    return this.count;
  }

  /** Restreint les recherches aux segments proches du rectangle (à faire avant de construire une tuile). Retourne leur nombre. */
  focus(minX: number, minZ: number, maxX: number, maxZ: number): number {
    const m = DECK_REACH + 2;
    let n = 0;
    for (let s = 0; s < this.count; s++) {
      const ax = this.seg[4 * s], az = this.seg[4 * s + 1], bx = this.seg[4 * s + 2], bz = this.seg[4 * s + 3];
      if (Math.max(ax, bx) < minX - m || Math.min(ax, bx) > maxX + m || Math.max(az, bz) < minZ - m || Math.min(az, bz) > maxZ + m) continue;
      this.near[n++] = s;
    }
    this.nearCount = n;
    return n;
  }

  /** Segment de pont le plus proche (parmi ceux retenus par focus) à moins de DECK_REACH. Résultat dans lastEdge, lastAlong, lastDist. */
  nearest(x: number, z: number): boolean {
    let best = DECK_REACH * DECK_REACH, bestSeg = -1, bestT = 0;
    const seg = this.seg;
    for (let q = 0; q < this.nearCount; q++) {
      const s = this.near[q];
      const ax = seg[4 * s], az = seg[4 * s + 1];
      const dx = seg[4 * s + 2] - ax, dz = seg[4 * s + 3] - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 >= best) continue;
      best = d2;
      bestSeg = s;
      bestT = t;
    }
    if (bestSeg < 0) {
      this.lastEdge = -1;
      return false;
    }
    const sx = seg[4 * bestSeg + 2] - seg[4 * bestSeg], sz = seg[4 * bestSeg + 3] - seg[4 * bestSeg + 1];
    this.lastEdge = this.segEdge[bestSeg];
    this.lastAlong = this.segS0[bestSeg] + Math.sqrt(sx * sx + sz * sz) * bestT;
    this.lastDist = Math.sqrt(best);
    return true;
  }

  /** Altitude du tablier de l'arête `e` à l'abscisse curviligne `along`. */
  axisY(e: number, along: number): number {
    const length = this.graph.edges[e].length;
    return this.ya[e] + (this.yb[e] - this.ya[e]) * (length > 0 ? along / length : 0);
  }

  /**
   * Altitude d'un point d'une surface de tablier. `ground` est l'altitude du sol en ce point ; elle
   * est rendue telle quelle loin de tout pont.
   */
  deckY(x: number, z: number, ground: number): number {
    if (this.nearCount === 0 || !this.nearest(x, z)) return ground;
    const e = this.lastEdge;
    const ed = this.graph.edges[e];
    const along = this.lastAlong, d = this.lastDist, length = ed.length;
    const deck = this.axisY(e, along);
    const half = halfDeckOf(ed);
    if (d <= half) return deck;
    let wide = 1;
    if (this.rampA[e] === 1 && along < DECK_RAMP) wide = along / DECK_RAMP;
    if (this.rampB[e] === 1 && length - along < DECK_RAMP) wide = Math.min(wide, (length - along) / DECK_RAMP);
    const w = d < half + DECK_BLEND ? 1 + (wide - 1) * ((d - half) / DECK_BLEND) : wide;
    return ground + (deck - ground) * w;
  }
}
