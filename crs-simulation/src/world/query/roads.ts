/* =====================================================================================
 * Réseau de rues : vues RoadNodeInfo / RoadEdgeInfo, index spatial des segments (cellules
 * de 32 m), voie la plus proche, tabliers des ponts (altitude).
 *
 * Tout est construit une fois à l'installation du jeu de données ; les requêtes n'allouent rien.
 * Une arête « tunnel » n'est pas praticable en surface : elle est ignorée par nearestRoad, par
 * les itinéraires et par les surfaces.
 * ===================================================================================== */

import type { RoadEdgeInfo, RoadNodeInfo, RoadSample } from '@/core/contracts';
import { sampleTerrain, segmentIntersectsRect } from '../mapdata';
import type { Bounds, RoadGraph, Terrain } from '../mapdata';

/** Côté d'une cellule de l'index des segments de voies (m). */
const ROAD_CELL = 32;
/** Côté d'une cellule de l'index des ponts (m). */
const BRIDGE_CELL = 64;
/** Largeur (m) de la bande de raccord entre le tablier d'un pont et le relief, de part et d'autre. */
export const DECK_BLEND = 1.5;
/** Demi-largeur minimale d'un tablier (m). */
const MIN_HALF_DECK = 1.5;

/** Bits de segFlags. */
export const SEG_TUNNEL = 1;
export const SEG_PEDESTRIAN = 2;
export const SEG_BRIDGE = 4;
export const SEG_NAMED = 8;

/** Filtres de recherche de la voie la plus proche. */
export const ROAD_ANY = 0;
export const ROAD_DRIVABLE = 1;
export const ROAD_NAMED = 2;

const scratchRect: Bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };

/** Demi-largeur du tablier d'une arête de pont : chaussée + trottoirs. */
export function halfDeckOf(width: number, sidewalk: number): number {
  return Math.max(MIN_HALF_DECK, width / 2 + sidewalk);
}

export class RoadNetwork {
  readonly graph: RoadGraph;
  readonly nodes: RoadNodeInfo[] = [];
  readonly edges: RoadEdgeInfo[] = [];
  /** 1 si l'arête est un souterrain. */
  readonly edgeTunnel: Uint8Array;
  /** Vitesse limite maximale du graphe (m/s), pour l'heuristique des itinéraires. */
  maxSpeed = 1;

  // ── segments (tous les segments de toutes les polylignes) ──
  readonly segCount: number;
  /** 4 valeurs par segment : ax, az, bx, bz. */
  readonly segXZ: Float32Array;
  readonly segEdge: Int32Array;
  /** Abscisse curviligne du début du segment le long de son arête (m). */
  readonly segS0: Float32Array;
  readonly segFlags: Uint8Array;
  /** Premier segment de chaque arête (edgeCount + 1 valeurs). */
  readonly edgeSegStart: Int32Array;

  // ── index des segments ──
  private gx0 = 0;
  private gz0 = 0;
  private gnx = 1;
  private gnz = 1;
  private cellStart: Uint32Array = new Uint32Array(2);
  private cellItems: Uint32Array = new Uint32Array(0);
  private readonly stamp: Uint32Array;
  private stampNow = 0;

  // ── ponts ──
  private bx0 = 0;
  private bz0 = 0;
  private bnx = 0;
  private bnz = 0;
  private bridgeCellStart: Uint32Array = new Uint32Array(1);
  private bridgeCellItems: Uint32Array = new Uint32Array(0);
  /** Altitude du tablier aux deux extrémités de chaque arête de pont (0 ailleurs). */
  readonly deckYa: Float32Array;
  readonly deckYb: Float32Array;
  readonly halfDeck: Float32Array;
  bridgeEdgeCount = 0;

  // ── résultat de la dernière recherche (lecture immédiate, usage interne) ──
  snapEdge = -1;
  snapSeg = -1;
  /** Abscisse curviligne du point accroché le long de l'arête (m). */
  snapS = 0;
  snapX = 0;
  snapZ = 0;
  snapDist = 0;

  constructor(graph: RoadGraph, terrain: Terrain) {
    this.graph = graph;
    const ne = graph.edges.length;
    this.edgeTunnel = new Uint8Array(ne);
    this.deckYa = new Float32Array(ne);
    this.deckYb = new Float32Array(ne);
    this.halfDeck = new Float32Array(ne);
    this.edgeSegStart = new Int32Array(ne + 1);

    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      this.nodes.push({ id: i, x: n.x, z: n.z, signal: n.signal, crossing: n.crossing, edges: n.edges });
    }
    let segCount = 0;
    let maxSpeed = 1;
    for (let e = 0; e < ne; e++) {
      const ed = graph.edges[e];
      this.edges.push({
        id: e,
        a: ed.a,
        b: ed.b,
        points: ed.points,
        length: ed.length,
        width: ed.width,
        lanesForward: ed.lanesForward,
        lanesBackward: ed.lanesBackward,
        oneway: ed.oneway,
        roadClass: ed.roadClass,
        name: ed.name,
        bridge: ed.bridge,
        sett: ed.surface === 'sett',
        speedLimit: ed.speedLimit,
        sidewalk: ed.sidewalk,
        pedestrianOnly: ed.pedestrianOnly,
      });
      this.edgeTunnel[e] = ed.tunnel ? 1 : 0;
      this.halfDeck[e] = halfDeckOf(ed.width, ed.sidewalk);
      this.edgeSegStart[e] = segCount;
      segCount += Math.max(0, (ed.points.length >> 1) - 1);
      if (!ed.tunnel && !ed.pedestrianOnly && ed.speedLimit > maxSpeed) maxSpeed = ed.speedLimit;
    }
    this.edgeSegStart[ne] = segCount;
    this.maxSpeed = maxSpeed;

    this.segCount = segCount;
    this.segXZ = new Float32Array(segCount * 4);
    this.segEdge = new Int32Array(segCount);
    this.segS0 = new Float32Array(segCount);
    this.segFlags = new Uint8Array(segCount);
    this.stamp = new Uint32Array(segCount);

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    let k = 0;
    for (let e = 0; e < ne; e++) {
      const ed = graph.edges[e];
      const pts = ed.points;
      const flags = (ed.tunnel ? SEG_TUNNEL : 0) | (ed.pedestrianOnly ? SEG_PEDESTRIAN : 0) | (ed.bridge ? SEG_BRIDGE : 0) | (ed.name !== '' ? SEG_NAMED : 0);
      let s = 0;
      for (let i = 2; i + 1 < pts.length; i += 2) {
        const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
        this.segXZ[4 * k] = ax;
        this.segXZ[4 * k + 1] = az;
        this.segXZ[4 * k + 2] = bx;
        this.segXZ[4 * k + 3] = bz;
        this.segEdge[k] = e;
        this.segS0[k] = s;
        this.segFlags[k] = flags;
        s += Math.hypot(bx - ax, bz - az);
        if (ax < minX) minX = ax;
        if (bx < minX) minX = bx;
        if (ax > maxX) maxX = ax;
        if (bx > maxX) maxX = bx;
        if (az < minZ) minZ = az;
        if (bz < minZ) minZ = bz;
        if (az > maxZ) maxZ = az;
        if (bz > maxZ) maxZ = bz;
        k++;
      }
    }
    if (segCount > 0) this.buildGrid(minX, minZ, maxX, maxZ);
    this.buildBridges(terrain);
  }

  // ─────────────────────────────── index des segments ───────────────────────────────

  private buildGrid(minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.gx0 = Math.floor(minX / ROAD_CELL) * ROAD_CELL;
    this.gz0 = Math.floor(minZ / ROAD_CELL) * ROAD_CELL;
    this.gnx = Math.max(1, Math.floor((maxX - this.gx0) / ROAD_CELL) + 1);
    this.gnz = Math.max(1, Math.floor((maxZ - this.gz0) / ROAD_CELL) + 1);
    const counts = new Uint32Array(this.gnx * this.gnz + 1);
    // Deux passes : comptage, puis remplissage (index compact, sans allocation par cellule).
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 0; s < this.segCount; s++) {
        const ax = this.segXZ[4 * s], az = this.segXZ[4 * s + 1], bx = this.segXZ[4 * s + 2], bz = this.segXZ[4 * s + 3];
        const i0 = Math.floor((Math.min(ax, bx) - this.gx0) / ROAD_CELL), i1 = Math.floor((Math.max(ax, bx) - this.gx0) / ROAD_CELL);
        const j0 = Math.floor((Math.min(az, bz) - this.gz0) / ROAD_CELL), j1 = Math.floor((Math.max(az, bz) - this.gz0) / ROAD_CELL);
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            if (i1 > i0 && j1 > j0) {
              scratchRect.minX = this.gx0 + i * ROAD_CELL;
              scratchRect.minZ = this.gz0 + j * ROAD_CELL;
              scratchRect.maxX = scratchRect.minX + ROAD_CELL;
              scratchRect.maxZ = scratchRect.minZ + ROAD_CELL;
              if (!segmentIntersectsRect(ax, az, bx, bz, scratchRect)) continue;
            }
            const c = j * this.gnx + i;
            if (pass === 0) counts[c + 1]++;
            else this.cellItems[counts[c]++] = s;
          }
        }
      }
      if (pass === 0) {
        for (let c = 0; c < this.gnx * this.gnz; c++) counts[c + 1] += counts[c];
        this.cellStart = counts.slice();
        this.cellItems = new Uint32Array(counts[this.gnx * this.gnz]);
      }
    }
  }

  /**
   * Segments de voies dont la cellule touche le rectangle (sans doublon). Écrit leurs indices dans
   * `out` et retourne leur nombre. Réservé aux constructions (chargement de tuile) : `out` grandit.
   */
  querySegments(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number {
    let n = 0;
    if (this.segCount === 0) return 0;
    const i0 = Math.max(0, Math.floor((minX - this.gx0) / ROAD_CELL)), i1 = Math.min(this.gnx - 1, Math.floor((maxX - this.gx0) / ROAD_CELL));
    const j0 = Math.max(0, Math.floor((minZ - this.gz0) / ROAD_CELL)), j1 = Math.min(this.gnz - 1, Math.floor((maxZ - this.gz0) / ROAD_CELL));
    const stamp = ++this.stampNow;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * this.gnx + i;
        for (let p = this.cellStart[c], end = this.cellStart[c + 1]; p < end; p++) {
          const s = this.cellItems[p];
          if (this.stamp[s] === stamp) continue;
          this.stamp[s] = stamp;
          out[n++] = s;
        }
      }
    }
    return n;
  }

  /**
   * Segment de voie le plus proche de (x, z) à moins de maxDist. Résultat dans snapEdge, snapSeg,
   * snapS, snapX, snapZ, snapDist. Aucune allocation.
   * @param allowed si fourni : seules les arêtes e telles que allowed[e] ≠ 0 sont retenues
   */
  nearest(x: number, z: number, maxDist: number, filter: number, allowed: Uint8Array | null = null): boolean {
    this.snapEdge = -1;
    if (this.segCount === 0 || !(maxDist > 0)) return false;
    const reject = filter === ROAD_DRIVABLE ? SEG_TUNNEL | SEG_PEDESTRIAN : SEG_TUNNEL;
    const need = filter === ROAD_NAMED ? SEG_NAMED : 0;
    const xz = this.segXZ, flags = this.segFlags, segEdge = this.segEdge;
    let radius = Math.min(maxDist, ROAD_CELL);
    let best = maxDist * maxDist, bestSeg = -1, bestT = 0;
    for (;;) {
      const i0 = Math.max(0, Math.floor((x - radius - this.gx0) / ROAD_CELL)), i1 = Math.min(this.gnx - 1, Math.floor((x + radius - this.gx0) / ROAD_CELL));
      const j0 = Math.max(0, Math.floor((z - radius - this.gz0) / ROAD_CELL)), j1 = Math.min(this.gnz - 1, Math.floor((z + radius - this.gz0) / ROAD_CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * this.gnx + i;
          for (let p = this.cellStart[c], end = this.cellStart[c + 1]; p < end; p++) {
            const s = this.cellItems[p];
            const f = flags[s];
            if ((f & reject) !== 0 || (f & need) !== need) continue;
            if (allowed !== null && allowed[segEdge[s]] === 0) continue;
            const ax = xz[4 * s], az = xz[4 * s + 1];
            const dx = xz[4 * s + 2] - ax, dz = xz[4 * s + 3] - az;
            const len2 = dx * dx + dz * dz;
            let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const ex = ax + dx * t - x, ez = az + dz * t - z;
            const d2 = ex * ex + ez * ez;
            if (d2 < best) {
              best = d2;
              bestSeg = s;
              bestT = t;
            }
          }
        }
      }
      // Un segment trouvé à moins du rayon exploré est forcément le plus proche.
      if (bestSeg >= 0 && best <= radius * radius) break;
      if (radius >= maxDist) break;
      radius = Math.min(maxDist, Math.max(radius * 2, bestSeg >= 0 ? Math.sqrt(best) : 0));
    }
    if (bestSeg < 0) return false;
    const ax = xz[4 * bestSeg], az = xz[4 * bestSeg + 1];
    const dx = xz[4 * bestSeg + 2] - ax, dz = xz[4 * bestSeg + 3] - az;
    this.snapSeg = bestSeg;
    this.snapEdge = this.segEdge[bestSeg];
    this.snapX = ax + dx * bestT;
    this.snapZ = az + dz * bestT;
    this.snapS = this.segS0[bestSeg] + Math.sqrt(dx * dx + dz * dz) * bestT;
    this.snapDist = Math.sqrt(best);
    return true;
  }

  /** Remplit un RoadSample à partir du résultat de nearest(). */
  fillSample(out: RoadSample): void {
    const s = this.snapSeg;
    const ed = this.edges[this.snapEdge];
    out.edgeId = this.snapEdge;
    out.x = this.snapX;
    out.z = this.snapZ;
    out.heading = Math.atan2(this.segXZ[4 * s + 2] - this.segXZ[4 * s], this.segXZ[4 * s + 3] - this.segXZ[4 * s + 1]);
    out.dist = this.snapDist;
    out.width = ed.width;
    out.name = ed.name;
    out.roadClass = ed.roadClass;
    out.oneway = ed.oneway;
  }

  // ─────────────────────────────── ponts ───────────────────────────────

  /**
   * Altitude des tabliers. Un pont relie l'altitude du sol à ses deux extrémités sans suivre le
   * relief. Quand un pont est fait de plusieurs arêtes à la suite, les nœuds intermédiaires (ceux
   * dont toutes les arêtes sont des ponts) sont interpolés selon la longueur des arêtes.
   */
  private buildBridges(terrain: Terrain): void {
    const g = this.graph;
    const nn = g.nodes.length;
    const y = new Float32Array(nn);
    const interior = new Uint8Array(nn);
    let bridgeEdges = 0;
    for (let e = 0; e < g.edges.length; e++) if (g.edges[e].bridge && !g.edges[e].tunnel) bridgeEdges++;
    this.bridgeEdgeCount = bridgeEdges;
    if (bridgeEdges === 0) return;

    for (let n = 0; n < nn; n++) {
      const nd = g.nodes[n];
      y[n] = sampleTerrain(terrain, nd.x, nd.z);
      let all = nd.edges.length >= 2;
      for (let k = 0; k < nd.edges.length && all; k++) {
        const ed = g.edges[nd.edges[k]];
        if (!ed.bridge || ed.tunnel) all = false;
      }
      interior[n] = all ? 1 : 0;
    }
    const inner: number[] = [];
    for (let n = 0; n < nn; n++) if (interior[n] === 1) inner.push(n);
    // Relaxation de Gauss–Seidel pondérée par 1/longueur : exacte (linéaire) sur une chaîne.
    for (let iter = 0; iter < 200 && inner.length > 0; iter++) {
      let change = 0;
      for (let q = 0; q < inner.length; q++) {
        const n = inner[q];
        const nd = g.nodes[n];
        let sum = 0, wsum = 0;
        for (let k = 0; k < nd.edges.length; k++) {
          const ed = g.edges[nd.edges[k]];
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

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const list: number[] = [];
    for (let e = 0; e < g.edges.length; e++) {
      const ed = g.edges[e];
      if (!ed.bridge || ed.tunnel) continue;
      this.deckYa[e] = y[ed.a];
      this.deckYb[e] = y[ed.b];
      const m = this.halfDeck[e] + DECK_BLEND;
      for (let s = this.edgeSegStart[e]; s < this.edgeSegStart[e + 1]; s++) {
        list.push(s);
        minX = Math.min(minX, this.segXZ[4 * s] - m, this.segXZ[4 * s + 2] - m);
        maxX = Math.max(maxX, this.segXZ[4 * s] + m, this.segXZ[4 * s + 2] + m);
        minZ = Math.min(minZ, this.segXZ[4 * s + 1] - m, this.segXZ[4 * s + 3] - m);
        maxZ = Math.max(maxZ, this.segXZ[4 * s + 1] + m, this.segXZ[4 * s + 3] + m);
      }
    }
    if (list.length === 0) return;
    this.bx0 = Math.floor(minX / BRIDGE_CELL) * BRIDGE_CELL;
    this.bz0 = Math.floor(minZ / BRIDGE_CELL) * BRIDGE_CELL;
    this.bnx = Math.floor((maxX - this.bx0) / BRIDGE_CELL) + 1;
    this.bnz = Math.floor((maxZ - this.bz0) / BRIDGE_CELL) + 1;
    const counts = new Uint32Array(this.bnx * this.bnz + 1);
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 0; q < list.length; q++) {
        const s = list[q];
        const m = this.halfDeck[this.segEdge[s]] + DECK_BLEND;
        const ax = this.segXZ[4 * s], az = this.segXZ[4 * s + 1], bx = this.segXZ[4 * s + 2], bz = this.segXZ[4 * s + 3];
        const i0 = Math.floor((Math.min(ax, bx) - m - this.bx0) / BRIDGE_CELL), i1 = Math.floor((Math.max(ax, bx) + m - this.bx0) / BRIDGE_CELL);
        const j0 = Math.floor((Math.min(az, bz) - m - this.bz0) / BRIDGE_CELL), j1 = Math.floor((Math.max(az, bz) + m - this.bz0) / BRIDGE_CELL);
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const c = j * this.bnx + i;
            if (pass === 0) counts[c + 1]++;
            else this.bridgeCellItems[counts[c]++] = s;
          }
        }
      }
      if (pass === 0) {
        for (let c = 0; c < this.bnx * this.bnz; c++) counts[c + 1] += counts[c];
        this.bridgeCellStart = counts.slice();
        this.bridgeCellItems = new Uint32Array(counts[this.bnx * this.bnz]);
      }
    }
  }

  /**
   * Altitude en tenant compte des ponts : sur un tablier, l'altitude interpolée entre ses deux
   * extrémités ; dans une bande de DECK_BLEND autour, un raccord linéaire avec le relief `ground`
   * (la fonction reste continue). Ailleurs, `ground` inchangé. Aucune allocation.
   */
  deckHeight(x: number, z: number, ground: number): number {
    if (this.bnx === 0) return ground;
    const i = Math.floor((x - this.bx0) / BRIDGE_CELL), j = Math.floor((z - this.bz0) / BRIDGE_CELL);
    if (i < 0 || j < 0 || i >= this.bnx || j >= this.bnz) return ground;
    const c = j * this.bnx + i;
    let p = this.bridgeCellStart[c];
    const end = this.bridgeCellStart[c + 1];
    if (p === end) return ground;
    const xz = this.segXZ;
    let bestD = Infinity, bestY = ground, bestH = 0;
    for (; p < end; p++) {
      const s = this.bridgeCellItems[p];
      const ax = xz[4 * s], az = xz[4 * s + 1];
      const dx = xz[4 * s + 2] - ax, dz = xz[4 * s + 3] - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 >= bestD) continue;
      const e = this.segEdge[s];
      const reach = this.halfDeck[e] + DECK_BLEND;
      if (d2 >= reach * reach) continue;
      bestD = d2;
      bestH = this.halfDeck[e];
      const length = this.edges[e].length;
      const u = length > 0 ? (this.segS0[s] + Math.sqrt(len2) * t) / length : 0;
      bestY = this.deckYa[e] + (this.deckYb[e] - this.deckYa[e]) * u;
    }
    if (bestD === Infinity) return ground;
    const d = Math.sqrt(bestD);
    if (d <= bestH) return bestY;
    return bestY + (ground - bestY) * ((d - bestH) / DECK_BLEND);
  }
}
