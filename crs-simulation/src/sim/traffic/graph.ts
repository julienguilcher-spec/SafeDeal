/* =====================================================================================
 * CIRCULATION — copie de travail du graphe routier (ctx.world.node / edge) en tableaux typés :
 * adjacence compacte, nature des nœuds (feu, passage piéton, carrefour, impasse), grille de recherche
 * des nœuds, géométrie le long d'une arête (point à une abscisse, avec décalage latéral), tronçons
 * (suite d'arêtes entre deux carrefours) et plus court chemin en évitant les arêtes fermées.
 *
 * Repère : le long d'une arête, la direction (dx, dz) va de a vers b ; la DROITE de ce sens est (−dz, dx),
 * comme pour un cap h avec avant = (sin h, cos h) et droite = (−cos h, sin h).
 * Reconstruit au début de chaque session et quand la carte change ; aucune allocation ensuite.
 * ===================================================================================== */

import type { RoadClass, WorldQuery } from '@/core/contracts';

export const N_SIGNAL = 1;
export const N_CROSSING = 2;
/** Au moins trois arêtes carrossables : vrai carrefour. */
export const N_JUNCTION = 4;
/** Une seule arête carrossable : impasse ou bord du réseau. */
export const N_DEADEND = 8;

export const E_ONEWAY = 1;
export const E_PED = 2;
export const E_TUNNEL = 4;
export const E_BRIDGE = 8;

export interface EdgePoint { x: number; z: number; dx: number; dz: number }
export interface EdgeHit {
  edge: number;
  /** Abscisse depuis le nœud a (m). */
  s: number;
  /** Écart latéral signé (m), positif à droite du sens a → b. */
  lat: number;
  dist: number;
  /** Point de l'axe le plus proche et direction de l'arête en ce point. */
  x: number; z: number; dx: number; dz: number;
}
export interface ChainInfo { nodeA: number; nodeB: number; length: number; count: number }

const CELL = 32;
const CLASSES: readonly RoadClass[] = [
  'motorway', 'primary', 'secondary', 'tertiary', 'residential', 'pedestrian', 'service', 'footway',
];
const EMPTY_F = new Float32Array(0);
const EMPTY_I = new Int32Array(0);
const EMPTY_B = new Uint8Array(0);

export function makeEdgeHit(): EdgeHit {
  return { edge: -1, s: 0, lat: 0, dist: 0, x: 0, z: 0, dx: 0, dz: 1 };
}

export class RoadCache {
  world: WorldQuery | null = null;
  /** Incrémenté à chaque reconstruction (les itinéraires mémorisés deviennent caducs). */
  stamp = 0;
  nodeCount = 0;
  edgeCount = 0;
  nodeX: Float32Array = EMPTY_F;
  nodeZ: Float32Array = EMPTY_F;
  nodeFlags: Uint8Array = EMPTY_B;
  /** Nombre d'arêtes carrossables incidentes. */
  nodeDeg: Uint8Array = EMPTY_B;
  /** Demi-largeur de la plus large chaussée incidente (m). */
  nodeRadius: Float32Array = EMPTY_F;
  adjStart: Int32Array = EMPTY_I;
  adjEdge: Int32Array = EMPTY_I;
  edgeA: Int32Array = EMPTY_I;
  edgeB: Int32Array = EMPTY_I;
  edgeLen: Float32Array = EMPTY_F;
  edgeWidth: Float32Array = EMPTY_F;
  edgeSpeed: Float32Array = EMPTY_F;
  edgeSidewalk: Float32Array = EMPTY_F;
  edgeFlags: Uint8Array = EMPTY_B;
  edgeClass: Uint8Array = EMPTY_B;
  maxEdgeLen = 0;
  // grille des nœuds
  private minX = 0;
  private minZ = 0;
  private cols = 1;
  private rows = 1;
  private cellStart: Int32Array = EMPTY_I;
  private cellNodes: Int32Array = EMPTY_I;
  // marquage des arêtes déjà vues par une recherche
  private edgeSeen: Uint32Array = new Uint32Array(0);
  private seenGen = 0;
  // plus court chemin
  private g: Float32Array = EMPTY_F;
  private prev: Int32Array = EMPTY_I;
  private mark: Uint32Array = new Uint32Array(0);
  private done: Uint32Array = new Uint32Array(0);
  private gen = 0;
  private heapNode: Int32Array = new Int32Array(256);
  private heapCost: Float32Array = new Float32Array(256);
  private heapSize = 0;
  private readonly tmpNodes: number[] = [];
  private readonly hit: EdgeHit = makeEdgeHit();

  get ready(): boolean {
    return this.world !== null && this.edgeCount > 0;
  }

  matches(world: WorldQuery): boolean {
    return this.world === world && this.nodeCount === world.nodeCount && this.edgeCount === world.edgeCount;
  }

  clear(): void {
    this.world = null;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.stamp++;
  }

  /** Recopie le graphe. `tunnel` signale les arêtes souterraines (absentes du contrat RoadEdgeInfo). */
  build(world: WorldQuery, tunnel?: (edge: number) => boolean): void {
    const nc = world.nodeCount;
    const ec = world.edgeCount;
    this.world = world;
    this.nodeCount = nc;
    this.edgeCount = ec;
    this.stamp++;
    this.nodeX = new Float32Array(nc);
    this.nodeZ = new Float32Array(nc);
    this.nodeFlags = new Uint8Array(nc);
    this.nodeDeg = new Uint8Array(nc);
    this.nodeRadius = new Float32Array(nc);
    this.edgeA = new Int32Array(ec);
    this.edgeB = new Int32Array(ec);
    this.edgeLen = new Float32Array(ec);
    this.edgeWidth = new Float32Array(ec);
    this.edgeSpeed = new Float32Array(ec);
    this.edgeSidewalk = new Float32Array(ec);
    this.edgeFlags = new Uint8Array(ec);
    this.edgeClass = new Uint8Array(ec);
    this.edgeSeen = new Uint32Array(ec);
    this.g = new Float32Array(nc);
    this.prev = new Int32Array(nc);
    this.mark = new Uint32Array(nc);
    this.done = new Uint32Array(nc);
    this.seenGen = 0;
    this.gen = 0;
    this.maxEdgeLen = 0;

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let n = 0; n < nc; n++) {
      const info = world.node(n);
      this.nodeX[n] = info.x;
      this.nodeZ[n] = info.z;
      this.nodeFlags[n] = (info.signal ? N_SIGNAL : 0) | (info.crossing ? N_CROSSING : 0);
      if (info.x < minX) minX = info.x;
      if (info.x > maxX) maxX = info.x;
      if (info.z < minZ) minZ = info.z;
      if (info.z > maxZ) maxZ = info.z;
    }
    const count = new Int32Array(nc + 1);
    for (let e = 0; e < ec; e++) {
      const info = world.edge(e);
      const a = info.a;
      const b = info.b;
      this.edgeA[e] = a;
      this.edgeB[e] = b;
      this.edgeLen[e] = info.length;
      this.edgeWidth[e] = info.width;
      this.edgeSpeed[e] = info.speedLimit > 1 ? info.speedLimit : 8.33;
      this.edgeSidewalk[e] = info.sidewalk;
      const ci = CLASSES.indexOf(info.roadClass);
      this.edgeClass[e] = ci < 0 ? 4 : ci;
      const ped = info.pedestrianOnly || info.roadClass === 'footway' || info.roadClass === 'pedestrian';
      this.edgeFlags[e] = (info.oneway ? E_ONEWAY : 0) | (ped ? E_PED : 0) | (tunnel && tunnel(e) ? E_TUNNEL : 0)
        | (info.bridge ? E_BRIDGE : 0);
      if (info.length > this.maxEdgeLen) this.maxEdgeLen = info.length;
      if (a >= 0 && a < nc) count[a + 1]!++;
      if (b >= 0 && b < nc && b !== a) count[b + 1]!++;
    }
    for (let n = 0; n < nc; n++) count[n + 1]! += count[n]!;
    this.adjStart = count;
    const fill = new Int32Array(nc);
    const adj = new Int32Array(count[nc] ?? 0);
    for (let e = 0; e < ec; e++) {
      const a = this.edgeA[e]!;
      const b = this.edgeB[e]!;
      if (a >= 0 && a < nc) adj[count[a]! + fill[a]!++] = e;
      if (b >= 0 && b < nc && b !== a) adj[count[b]! + fill[b]!++] = e;
    }
    this.adjEdge = adj;
    for (let n = 0; n < nc; n++) {
      let deg = 0;
      let radius = 0;
      for (let k = count[n]!; k < count[n + 1]!; k++) {
        const e = adj[k]!;
        if ((this.edgeFlags[e]! & (E_PED | E_TUNNEL)) !== 0) continue;
        deg++;
        const hw = this.edgeWidth[e]! * 0.5;
        if (hw > radius) radius = hw;
      }
      this.nodeDeg[n] = deg > 255 ? 255 : deg;
      this.nodeRadius[n] = radius > 14 ? 14 : radius;
      if (deg >= 3) this.nodeFlags[n]! |= N_JUNCTION;
      else if (deg === 1) this.nodeFlags[n]! |= N_DEADEND;
    }

    // grille des nœuds (tri par comptage)
    if (nc === 0) {
      minX = 0;
      minZ = 0;
      maxX = 0;
      maxZ = 0;
    }
    this.minX = minX;
    this.minZ = minZ;
    this.cols = Math.floor((maxX - minX) / CELL) + 1;
    this.rows = Math.floor((maxZ - minZ) / CELL) + 1;
    const cells = this.cols * this.rows;
    const cs = new Int32Array(cells + 1);
    for (let n = 0; n < nc; n++) cs[this.cellOf(this.nodeX[n]!, this.nodeZ[n]!) + 1]!++;
    for (let c = 0; c < cells; c++) cs[c + 1]! += cs[c]!;
    const cf = new Int32Array(cells);
    const cn = new Int32Array(nc);
    for (let n = 0; n < nc; n++) {
      const c = this.cellOf(this.nodeX[n]!, this.nodeZ[n]!);
      cn[cs[c]! + cf[c]!++] = n;
    }
    this.cellStart = cs;
    this.cellNodes = cn;
  }

  private cellOf(x: number, z: number): number {
    let cx = Math.floor((x - this.minX) / CELL);
    let cz = Math.floor((z - this.minZ) / CELL);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cz < 0) cz = 0;
    else if (cz >= this.rows) cz = this.rows - 1;
    return cz * this.cols + cx;
  }

  // ───────────────────────────── nœuds ─────────────────────────────

  isVehicle(e: number): boolean {
    return (this.edgeFlags[e]! & (E_PED | E_TUNNEL)) === 0;
  }

  other(e: number, node: number): number {
    return this.edgeA[e] === node ? this.edgeB[e]! : this.edgeA[e]!;
  }

  /** Nœud situé à moins de `tol` m du point (sommet d'un itinéraire), ou −1. */
  nodeAt(x: number, z: number, tol = 0.3): number {
    if (this.nodeCount === 0) return -1;
    const cx0 = Math.max(0, Math.floor((x - tol - this.minX) / CELL));
    const cx1 = Math.min(this.cols - 1, Math.floor((x + tol - this.minX) / CELL));
    const cz0 = Math.max(0, Math.floor((z - tol - this.minZ) / CELL));
    const cz1 = Math.min(this.rows - 1, Math.floor((z + tol - this.minZ) / CELL));
    let best = -1;
    let bestD = tol * tol;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cz * this.cols + cx;
        for (let k = this.cellStart[c]!; k < this.cellStart[c + 1]!; k++) {
          const n = this.cellNodes[k]!;
          const dx = this.nodeX[n]! - x;
          const dz = this.nodeZ[n]! - z;
          const d = dx * dx + dz * dz;
          if (d <= bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    return best;
  }

  /** Nœuds dans un disque ; écrit dans `out` et retourne leur nombre. */
  nodesInRadius(x: number, z: number, r: number, out: number[]): number {
    let n = 0;
    if (this.nodeCount === 0) return 0;
    const cx0 = Math.max(0, Math.floor((x - r - this.minX) / CELL));
    const cx1 = Math.min(this.cols - 1, Math.floor((x + r - this.minX) / CELL));
    const cz0 = Math.max(0, Math.floor((z - r - this.minZ) / CELL));
    const cz1 = Math.min(this.rows - 1, Math.floor((z + r - this.minZ) / CELL));
    const r2 = r * r;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cz * this.cols + cx;
        for (let k = this.cellStart[c]!; k < this.cellStart[c + 1]!; k++) {
          const id = this.cellNodes[k]!;
          const dx = this.nodeX[id]! - x;
          const dz = this.nodeZ[id]! - z;
          if (dx * dx + dz * dz <= r2) out[n++] = id;
        }
      }
    }
    return n;
  }

  // ───────────────────────────── géométrie d'une arête ─────────────────────────────

  /** Point à l'abscisse `s` (depuis a, bornée) décalé de `lat` m à droite du sens a → b. */
  pointAt(e: number, s: number, lat: number, out: EdgePoint): void {
    const pts = this.world!.edge(e).points;
    const n = pts.length >> 1;
    let ax = pts[0]!;
    let az = pts[1]!;
    let dx = 0;
    let dz = 1;
    let t = 0;
    let left = s > 0 ? s : 0;
    for (let i = 1; i < n; i++) {
      const bx = pts[i * 2]!;
      const bz = pts[i * 2 + 1]!;
      const ex = bx - ax;
      const ez = bz - az;
      const l = Math.sqrt(ex * ex + ez * ez);
      if (l < 1e-6) continue;
      dx = ex / l;
      dz = ez / l;
      if (left <= l || i === n - 1) {
        t = left < l ? left : l;
        break;
      }
      left -= l;
      ax = bx;
      az = bz;
    }
    out.x = ax + dx * t - dz * lat;
    out.z = az + dz * t + dx * lat;
    out.dx = dx;
    out.dz = dz;
  }

  /** Projette un point sur l'arête. */
  project(e: number, x: number, z: number, out: EdgeHit): void {
    const pts = this.world!.edge(e).points;
    const n = pts.length >> 1;
    let best = Infinity;
    let acc = 0;
    out.edge = e;
    out.s = 0;
    out.lat = 0;
    out.x = pts[0]!;
    out.z = pts[1]!;
    out.dx = 0;
    out.dz = 1;
    for (let i = 1; i < n; i++) {
      const ax = pts[i * 2 - 2]!;
      const az = pts[i * 2 - 1]!;
      const ex = pts[i * 2]! - ax;
      const ez = pts[i * 2 + 1]! - az;
      const l2 = ex * ex + ez * ez;
      if (l2 < 1e-12) continue;
      const l = Math.sqrt(l2);
      let t = ((x - ax) * ex + (z - az) * ez) / l2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = ax + ex * t;
      const pz = az + ez * t;
      const rx = x - px;
      const rz = z - pz;
      const d2 = rx * rx + rz * rz;
      if (d2 < best) {
        best = d2;
        out.s = acc + l * t;
        out.x = px;
        out.z = pz;
        out.dx = ex / l;
        out.dz = ez / l;
        out.lat = rx * (-out.dz) + rz * out.dx;
      }
      acc += l;
    }
    out.dist = best === Infinity ? 0 : Math.sqrt(best);
  }

  /** Direction unitaire de l'arête au départ du nœud donné (vers l'intérieur de l'arête). */
  dirFrom(e: number, node: number, out: EdgePoint): void {
    const pts = this.world!.edge(e).points;
    const n = pts.length >> 1;
    let ax: number;
    let az: number;
    let bx: number;
    let bz: number;
    if (this.edgeA[e] === node) {
      ax = pts[0]!;
      az = pts[1]!;
      bx = pts[2]!;
      bz = pts[3]!;
    } else {
      ax = pts[n * 2 - 2]!;
      az = pts[n * 2 - 1]!;
      bx = pts[n * 2 - 4]!;
      bz = pts[n * 2 - 3]!;
    }
    const ex = bx - ax;
    const ez = bz - az;
    const l = Math.sqrt(ex * ex + ez * ez);
    out.x = ax;
    out.z = az;
    out.dx = l > 1e-6 ? ex / l : 0;
    out.dz = l > 1e-6 ? ez / l : 1;
  }

  /** Arête carrossable la plus proche d'un point (souterrains et voies piétonnes exclus). */
  nearestVehicleEdge(x: number, z: number, maxDist: number, out: EdgeHit): boolean {
    const nodes = this.tmpNodes;
    const reach = Math.min(maxDist + this.maxEdgeLen, maxDist + 400);
    const n = this.nodesInRadius(x, z, reach, nodes);
    const gen = ++this.seenGen;
    const hit = this.hit;
    let best = maxDist;
    let found = false;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      for (let k = this.adjStart[node]!; k < this.adjStart[node + 1]!; k++) {
        const e = this.adjEdge[k]!;
        if (this.edgeSeen[e] === gen) continue;
        this.edgeSeen[e] = gen;
        if (!this.isVehicle(e)) continue;
        this.project(e, x, z, hit);
        if (hit.dist <= best) {
          best = hit.dist;
          found = true;
          out.edge = e;
          out.s = hit.s;
          out.lat = hit.lat;
          out.dist = hit.dist;
          out.x = hit.x;
          out.z = hit.z;
          out.dx = hit.dx;
          out.dz = hit.dz;
        }
      }
    }
    return found;
  }

  // ───────────────────────────── tronçons ─────────────────────────────

  /**
   * Tronçon de rue contenant l'arête : toutes les arêtes carrossables enchaînées par des nœuds de degré 2,
   * d'un carrefour (ou d'une impasse) à l'autre. Écrit les arêtes dans l'ordre de nodeA vers nodeB, avec
   * dans `dirs` +1 si l'arête est parcourue de a vers b dans ce sens, −1 sinon.
   */
  chain(e: number, edges: number[], dirs: number[], info: ChainInfo): void {
    // remonte vers l'amont depuis a
    let first = e;
    let node = this.edgeA[e]!;
    let guard = 0;
    while (this.nodeDeg[node] === 2 && guard++ < 64) {
      const next = this.nextInChain(node, first);
      if (next < 0 || next === e) break;
      first = next;
      node = this.other(next, node);
    }
    info.nodeA = node;
    let n = 0;
    let length = 0;
    let cur = first;
    guard = 0;
    for (;;) {
      const forward = this.edgeA[cur] === node;
      edges[n] = cur;
      dirs[n] = forward ? 1 : -1;
      n++;
      length += this.edgeLen[cur]!;
      node = this.other(cur, node);
      if (this.nodeDeg[node] !== 2 || guard++ >= 64) break;
      const next = this.nextInChain(node, cur);
      if (next < 0 || next === first) break;
      cur = next;
    }
    edges.length = n;
    dirs.length = n;
    info.nodeB = node;
    info.length = length;
    info.count = n;
  }

  private nextInChain(node: number, from: number): number {
    for (let k = this.adjStart[node]!; k < this.adjStart[node + 1]!; k++) {
      const e = this.adjEdge[k]!;
      if (e !== from && this.isVehicle(e)) return e;
    }
    return -1;
  }

  /** Point à l'abscisse `s` d'un tronçon (direction dans le sens du tronçon), décalé de `lat` m à droite. */
  chainPoint(edges: readonly number[], dirs: readonly number[], s: number, lat: number, out: EdgePoint): number {
    let left = s > 0 ? s : 0;
    const n = edges.length;
    for (let i = 0; i < n; i++) {
      const e = edges[i]!;
      const len = this.edgeLen[e]!;
      if (left <= len || i === n - 1) {
        const d = dirs[i]!;
        const local = d > 0 ? left : len - left;
        this.pointAt(e, local, lat * d, out);
        if (d < 0) {
          out.dx = -out.dx;
          out.dz = -out.dz;
        }
        return e;
      }
      left -= len;
    }
    return -1;
  }

  // ───────────────────────────── plus court chemin ─────────────────────────────

  private push(node: number, cost: number): void {
    if (this.heapSize >= this.heapNode.length) {
      const hn = new Int32Array(this.heapNode.length * 2);
      hn.set(this.heapNode);
      this.heapNode = hn;
      const hc = new Float32Array(this.heapCost.length * 2);
      hc.set(this.heapCost);
      this.heapCost = hc;
    }
    let i = this.heapSize++;
    const hn = this.heapNode;
    const hc = this.heapCost;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hc[p]! <= cost) break;
      hn[i] = hn[p]!;
      hc[i] = hc[p]!;
      i = p;
    }
    hn[i] = node;
    hc[i] = cost;
  }

  private pop(): number {
    const hn = this.heapNode;
    const hc = this.heapCost;
    const top = hn[0]!;
    const last = --this.heapSize;
    if (last > 0) {
      const node = hn[last]!;
      const cost = hc[last]!;
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= last) break;
        if (c + 1 < last && hc[c + 1]! < hc[c]!) c++;
        if (hc[c]! >= cost) break;
        hn[i] = hn[c]!;
        hc[i] = hc[c]!;
        i = c;
      }
      hn[i] = node;
      hc[i] = cost;
    }
    return top;
  }

  /**
   * Plus court chemin en temps entre deux nœuds, par les voies carrossables, sens uniques respectés, sans
   * emprunter les arêtes marquées dans `closed`. Écrit la suite des nœuds dans `out` (départ et arrivée
   * compris). false si aucun chemin (ou au-delà de `maxSeconds` de trajet).
   */
  route(from: number, to: number, closed: Uint8Array | null, out: number[], maxSeconds = 400): boolean {
    out.length = 0;
    if (from < 0 || to < 0 || from >= this.nodeCount || to >= this.nodeCount) return false;
    const gen = ++this.gen;
    const g = this.g;
    const mark = this.mark;
    const done = this.done;
    this.heapSize = 0;
    g[from] = 0;
    mark[from] = gen;
    this.prev[from] = -1;
    this.push(from, 0);
    let found = from === to;
    while (!found && this.heapSize > 0) {
      const cost = this.heapCost[0]!;
      const node = this.pop();
      if (done[node] === gen) continue;
      done[node] = gen;
      if (node === to) {
        found = true;
        break;
      }
      if (cost > maxSeconds) break;
      for (let k = this.adjStart[node]!; k < this.adjStart[node + 1]!; k++) {
        const e = this.adjEdge[k]!;
        const f = this.edgeFlags[e]!;
        if ((f & (E_PED | E_TUNNEL)) !== 0) continue;
        if ((f & E_ONEWAY) !== 0 && this.edgeA[e] !== node) continue;
        if (closed !== null && closed[e] !== 0) continue;
        const next = this.other(e, node);
        if (done[next] === gen) continue;
        const c = cost + this.edgeLen[e]! / this.edgeSpeed[e]!;
        if (mark[next] === gen && c >= g[next]!) continue;
        mark[next] = gen;
        g[next] = c;
        this.prev[next] = node;
        this.push(next, c);
      }
    }
    if (!found) return false;
    let n = 0;
    for (let node = to; node >= 0; node = this.prev[node]!) {
      out[n++] = node;
      if (node === from) break;
    }
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      const t = out[i]!;
      out[i] = out[j]!;
      out[j] = t;
    }
    out.length = n;
    return true;
  }
}
