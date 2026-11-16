/* =====================================================================================
 * Itinéraires : A* sur le graphe routier, avec un tas binaire.
 *
 *   - mode 'vehicle' : respecte les sens uniques, exclut les voies piétonnes ; le coût est le
 *     temps de parcours (longueur / vitesse limite), ce qui préfère les grands axes ;
 *   - mode 'foot' : toutes les arêtes dans les deux sens ; le coût est la longueur ;
 *   - les souterrains sont exclus dans les deux modes (non praticables en surface) ;
 *   - les extrémités sont accrochées à la voie la plus proche ; la polyligne résultante suit
 *     la géométrie des rues : [départ, accroche, …sommets des voies…, accroche, arrivée].
 *
 * Les tableaux de travail sont alloués une fois (taille du graphe) et réutilisés : aucune
 * allocation par requête, hormis la croissance du tableau `out` fourni par l'appelant (il est
 * réécrit en place : le réutiliser d'un appel à l'autre évite toute réallocation).
 * ===================================================================================== */

import type { RoadNetwork } from './roads';
import { ROAD_ANY, ROAD_DRIVABLE } from './roads';

/** Distance maximale d'accroche d'une extrémité au réseau (m). */
export const PATH_SNAP_DISTANCE = 250;
/** Vitesse plancher pour le coût en temps (m/s) : une voie à vitesse inconnue reste empruntable. */
const MIN_SPEED = 2.5;
/** Deux points plus proches que cela sont confondus dans la polyligne (m). */
const MERGE_EPS = 0.05;

const ADJ_FORWARD = 1;
const ADJ_VEHICLE = 2;

// Marqueurs de provenance : départ par l'arête d'accroche vers son nœud b (avant) ou a (arrière).
const FROM_START_FORWARD = -2;
const FROM_START_BACKWARD = -3;

export class PathFinder {
  private readonly net: RoadNetwork;
  // Adjacence compacte : pour le nœud n, les entrées [adjStart[n], adjStart[n + 1][.
  private readonly adjStart: Int32Array;
  private readonly adjEdge: Int32Array;
  private readonly adjTo: Int32Array;
  private readonly adjFlags: Uint8Array;
  private readonly adjFoot: Float32Array;
  private readonly adjVehicle: Float32Array;
  // État de la recherche (réinitialisé paresseusement par tampon de génération).
  private readonly g: Float32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly parentNode: Int32Array;
  private readonly parentAdj: Int32Array;
  private generation = 0;
  // Tas binaire (file de priorité sur f = g + h).
  private heapNode: Int32Array = new Int32Array(256);
  private heapF: Float32Array = new Float32Array(256);
  private heapSize = 0;
  // Pile de reconstruction du chemin.
  private chain: Int32Array = new Int32Array(256);
  /** Nombre de nœuds développés par la dernière recherche (diagnostic). */
  expanded = 0;
  /** 1 pour les arêtes du réseau principal de chaque mode (voir labelMainComponents). */
  readonly footMain: Uint8Array;
  readonly vehicleMain: Uint8Array;
  /** Composante connexe (à pied) de chaque arête ; -1 pour un souterrain. */
  private readonly footComponent: Int32Array;

  constructor(net: RoadNetwork) {
    this.net = net;
    const nn = net.nodes.length;
    const edges = net.graph.edges;
    this.adjStart = new Int32Array(nn + 1);
    for (let e = 0; e < edges.length; e++) {
      if (net.edgeTunnel[e] === 1) continue;
      this.adjStart[edges[e].a + 1]++;
      this.adjStart[edges[e].b + 1]++;
    }
    for (let n = 0; n < nn; n++) this.adjStart[n + 1] += this.adjStart[n];
    const total = this.adjStart[nn];
    this.adjEdge = new Int32Array(total);
    this.adjTo = new Int32Array(total);
    this.adjFlags = new Uint8Array(total);
    this.adjFoot = new Float32Array(total);
    this.adjVehicle = new Float32Array(total);
    const cursor = this.adjStart.slice(0, nn);
    for (let e = 0; e < edges.length; e++) {
      if (net.edgeTunnel[e] === 1) continue;
      const ed = edges[e];
      const time = ed.length / Math.max(MIN_SPEED, ed.speedLimit);
      const drivable = !ed.pedestrianOnly;
      // a → b : toujours permis aux véhicules si la voie est carrossable.
      let k = cursor[ed.a]++;
      this.adjEdge[k] = e;
      this.adjTo[k] = ed.b;
      this.adjFlags[k] = ADJ_FORWARD | (drivable ? ADJ_VEHICLE : 0);
      this.adjFoot[k] = ed.length;
      this.adjVehicle[k] = time;
      // b → a : interdit aux véhicules sur un sens unique.
      k = cursor[ed.b]++;
      this.adjEdge[k] = e;
      this.adjTo[k] = ed.a;
      this.adjFlags[k] = drivable && !ed.oneway ? ADJ_VEHICLE : 0;
      this.adjFoot[k] = ed.length;
      this.adjVehicle[k] = time;
    }
    this.g = new Float32Array(nn);
    this.seen = new Uint32Array(nn);
    this.closed = new Uint32Array(nn);
    this.parentNode = new Int32Array(nn);
    this.parentAdj = new Int32Array(nn);
    this.footMain = new Uint8Array(edges.length);
    this.vehicleMain = new Uint8Array(edges.length);
    this.footComponent = new Int32Array(edges.length).fill(-1);
    this.labelMainComponents();
  }

  /**
   * Repère le « réseau principal » de chaque mode, pour le repli des accroches :
   *   - à pied : la plus grande composante connexe (sens ignorés) ;
   *   - en véhicule : la plus grande composante FORTEMENT connexe (on peut y aller de partout à
   *     partout malgré les sens uniques).
   * Un bout d'allée isolé, ou un sens unique qui ne fait qu'entrer dans la carte, n'en font pas partie.
   */
  private labelMainComponents(): void {
    const nn = this.net.nodes.length;
    const edges = this.net.graph.edges;
    if (nn === 0) return;
    // À pied : union-find.
    const parent = new Int32Array(nn);
    for (let i = 0; i < nn; i++) parent[i] = i;
    const find = (i: number): number => {
      let r = i;
      while (parent[r] !== r) r = parent[r];
      while (parent[i] !== r) {
        const next = parent[i];
        parent[i] = r;
        i = next;
      }
      return r;
    };
    for (let e = 0; e < edges.length; e++) {
      if (this.net.edgeTunnel[e] === 1) continue;
      const ra = find(edges[e].a), rb = find(edges[e].b);
      if (ra !== rb) parent[ra] = rb;
    }
    const size = new Int32Array(nn);
    for (let e = 0; e < edges.length; e++) if (this.net.edgeTunnel[e] === 0) size[find(edges[e].a)]++;
    let mainFoot = -1, best = 0;
    for (let i = 0; i < nn; i++) {
      if (size[i] > best) {
        best = size[i];
        mainFoot = i;
      }
    }
    for (let e = 0; e < edges.length; e++) {
      if (this.net.edgeTunnel[e] === 1) continue;
      const root = find(edges[e].a);
      this.footComponent[e] = root;
      if (root === mainFoot) this.footMain[e] = 1;
    }

    // En véhicule : composantes fortement connexes (Tarjan, itératif).
    const index = new Int32Array(nn).fill(-1);
    const low = new Int32Array(nn);
    const onStack = new Uint8Array(nn);
    const scc = new Int32Array(nn).fill(-1);
    const stack = new Int32Array(nn);
    const callNode = new Int32Array(nn);
    const callEdge = new Int32Array(nn);
    let stackTop = 0, counter = 0, sccCount = 0;
    const adjStart = this.adjStart, adjTo = this.adjTo, adjFlags = this.adjFlags;
    for (let root = 0; root < nn; root++) {
      if (index[root] !== -1) continue;
      let depth = 0;
      callNode[0] = root;
      callEdge[0] = adjStart[root];
      index[root] = low[root] = counter++;
      stack[stackTop++] = root;
      onStack[root] = 1;
      while (depth >= 0) {
        const n = callNode[depth];
        let k = callEdge[depth];
        let descended = false;
        for (const end = adjStart[n + 1]; k < end; k++) {
          if ((adjFlags[k] & ADJ_VEHICLE) === 0) continue;
          const to = adjTo[k];
          if (index[to] === -1) {
            callEdge[depth] = k + 1;
            depth++;
            callNode[depth] = to;
            callEdge[depth] = adjStart[to];
            index[to] = low[to] = counter++;
            stack[stackTop++] = to;
            onStack[to] = 1;
            descended = true;
            break;
          }
          if (onStack[to] === 1 && index[to] < low[n]) low[n] = index[to];
        }
        if (descended) continue;
        if (low[n] === index[n]) {
          for (;;) {
            const m = stack[--stackTop];
            onStack[m] = 0;
            scc[m] = sccCount;
            if (m === n) break;
          }
          sccCount++;
        }
        depth--;
        if (depth >= 0 && low[n] < low[callNode[depth]]) low[callNode[depth]] = low[n];
      }
    }
    const sccSize = new Int32Array(sccCount);
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (this.net.edgeTunnel[e] === 1 || ed.pedestrianOnly) continue;
      if (scc[ed.a] === scc[ed.b]) sccSize[scc[ed.a]]++;
    }
    let mainScc = -1;
    best = 0;
    for (let c = 0; c < sccCount; c++) {
      if (sccSize[c] > best) {
        best = sccSize[c];
        mainScc = c;
      }
    }
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (this.net.edgeTunnel[e] === 1 || ed.pedestrianOnly) continue;
      if (scc[ed.a] === mainScc && scc[ed.b] === mainScc) this.vehicleMain[e] = 1;
    }
  }

  // ─────────────────────────────── tas binaire ───────────────────────────────

  private push(node: number, f: number): void {
    if (this.heapSize === this.heapNode.length) {
      const nodes = new Int32Array(this.heapSize * 2);
      nodes.set(this.heapNode);
      this.heapNode = nodes;
      const fs = new Float32Array(this.heapSize * 2);
      fs.set(this.heapF);
      this.heapF = fs;
    }
    const hn = this.heapNode, hf = this.heapF;
    let i = this.heapSize++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (hf[parent] <= f) break;
      hn[i] = hn[parent];
      hf[i] = hf[parent];
      i = parent;
    }
    hn[i] = node;
    hf[i] = f;
  }

  /** Retire et retourne le nœud de plus petit f (le tas ne doit pas être vide). */
  private pop(): number {
    const hn = this.heapNode, hf = this.heapF;
    const top = hn[0];
    const n = --this.heapSize;
    if (n > 0) {
      const node = hn[n], f = hf[n];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && hf[child + 1] < hf[child]) child++;
        if (hf[child] >= f) break;
        hn[i] = hn[child];
        hf[i] = hf[child];
        i = child;
      }
      hn[i] = node;
      hf[i] = f;
    }
    return top;
  }

  // ─────────────────────────────── recherche ───────────────────────────────

  /**
   * Itinéraire de (ax, az) à (bx, bz). Écrit la polyligne [x0, z0, x1, z1, …] dans `out` (vidé
   * au préalable). false si une extrémité est trop loin du réseau ou s'il n'existe aucun chemin.
   */
  find(ax: number, az: number, bx: number, bz: number, vehicle: boolean, out: number[]): boolean {
    // Le tableau de l'appelant est réécrit en place puis ajusté à la bonne longueur : le vider
    // d'abord (length = 0) ferait réallouer son contenu à chaque appel.
    this.count = 0;
    // 1. Accroche à la voie la plus proche de chaque extrémité.
    let found = this.search(ax, az, bx, bz, vehicle, out, false, false);
    if (!found) {
      // 2. Repli : une extrémité accrochée hors du réseau principal (bout d'allée isolé, îlot desservi
      //    par un souterrain, sens unique sans issue au bord de la carte) est raccrochée à celui-ci.
      const main = vehicle ? this.vehicleMain : this.footMain;
      const startOff = this.lastStartEdge >= 0 && main[this.lastStartEdge] === 0;
      const endOff = this.lastEndEdge >= 0 && main[this.lastEndEdge] === 0;
      if (startOff || endOff) found = this.search(ax, az, bx, bz, vehicle, out, startOff, endOff);
    }
    const n = found ? this.count : 0;
    if (out.length !== n) out.length = n;
    return found;
  }

  /** Nombre de valeurs écrites dans le tableau de sortie par la recherche en cours. */
  private count = 0;

  private lastStartEdge = -1;
  private lastEndEdge = -1;

  /** Une recherche A* ; `startMain` / `endMain` : accrocher l'extrémité au réseau principal du mode. */
  private search(ax: number, az: number, bx: number, bz: number, vehicle: boolean, out: number[], startMain: boolean, endMain: boolean): boolean {
    this.count = 0;
    const net = this.net;
    const filter = vehicle ? ROAD_DRIVABLE : ROAD_ANY;
    const main = vehicle ? this.vehicleMain : this.footMain;
    this.lastStartEdge = -1;
    this.lastEndEdge = -1;
    if (!net.nearest(ax, az, PATH_SNAP_DISTANCE, filter, startMain ? main : null)) return false;
    const startEdge = net.snapEdge, startS = net.snapS, startX = net.snapX, startZ = net.snapZ;
    if (!net.nearest(bx, bz, PATH_SNAP_DISTANCE, filter, endMain ? main : null)) return false;
    const endEdge = net.snapEdge, endS = net.snapS, endX = net.snapX, endZ = net.snapZ;
    this.lastStartEdge = startEdge;
    this.lastEndEdge = endEdge;
    // À pied, deux arêtes de composantes différentes ne sont reliées par rien : inutile de chercher.
    if (!vehicle && this.footComponent[startEdge] !== this.footComponent[endEdge]) return false;

    const edges = net.graph.edges;
    const es = edges[startEdge], ee = edges[endEdge];
    const startRate = vehicle ? 1 / Math.max(MIN_SPEED, es.speedLimit) : 1;
    const endRate = vehicle ? 1 / Math.max(MIN_SPEED, ee.speedLimit) : 1;
    // Coût minimal par mètre, pour une heuristique admissible.
    const hRate = vehicle ? 1 / Math.max(MIN_SPEED, net.maxSpeed) : 1;
    const startBackOk = !vehicle || !es.oneway;
    const endBackOk = !vehicle || !ee.oneway;

    // Trajet direct le long d'une même arête.
    let bestTotal = Infinity;
    let bestEnd = -1; // -1 : aucun ; -2 : direct ; sinon nœud final
    if (startEdge === endEdge && (endS >= startS || startBackOk)) {
      bestTotal = Math.abs(endS - startS) * startRate;
      bestEnd = -2;
    }

    const gen = ++this.generation;
    const g = this.g, seen = this.seen, closed = this.closed, parentNode = this.parentNode, parentAdj = this.parentAdj;
    const nodes = net.nodes;
    this.heapSize = 0;
    this.expanded = 0;

    // Germes : les deux nœuds de l'arête de départ.
    {
      const nb = es.b;
      g[nb] = (es.length - startS) * startRate;
      seen[nb] = gen;
      parentNode[nb] = -1;
      parentAdj[nb] = FROM_START_FORWARD;
      this.push(nb, g[nb] + Math.hypot(nodes[nb].x - endX, nodes[nb].z - endZ) * hRate);
      if (startBackOk) {
        const na = es.a;
        const cost = startS * startRate;
        if (seen[na] !== gen || cost < g[na]) {
          g[na] = cost;
          seen[na] = gen;
          parentNode[na] = -1;
          parentAdj[na] = FROM_START_BACKWARD;
          this.push(na, cost + Math.hypot(nodes[na].x - endX, nodes[na].z - endZ) * hRate);
        }
      }
    }

    const adjStart = this.adjStart, adjTo = this.adjTo, adjFlags = this.adjFlags;
    const adjCost = vehicle ? this.adjVehicle : this.adjFoot;
    while (this.heapSize > 0) {
      // Le plus petit f restant ne peut plus améliorer la meilleure arrivée connue : terminé.
      if (this.heapF[0] >= bestTotal) break;
      const n = this.pop();
      if (closed[n] === gen) continue;
      closed[n] = gen;
      this.expanded++;
      const gn = g[n];
      // Arrivée par un nœud de l'arête d'accroche finale.
      if (n === ee.a) {
        const total = gn + endS * endRate;
        if (total < bestTotal) {
          bestTotal = total;
          bestEnd = n;
        }
      }
      if (n === ee.b && endBackOk) {
        const total = gn + (ee.length - endS) * endRate;
        if (total < bestTotal) {
          bestTotal = total;
          bestEnd = n;
        }
      }
      for (let k = adjStart[n], end = adjStart[n + 1]; k < end; k++) {
        if (vehicle && (adjFlags[k] & ADJ_VEHICLE) === 0) continue;
        const to = adjTo[k];
        if (closed[to] === gen) continue;
        const cost = gn + adjCost[k];
        if (seen[to] === gen && cost >= g[to]) continue;
        g[to] = cost;
        seen[to] = gen;
        parentNode[to] = n;
        parentAdj[to] = k;
        this.push(to, cost + Math.hypot(nodes[to].x - endX, nodes[to].z - endZ) * hRate);
      }
    }
    if (bestEnd === -1) return false;

    // ── polyligne ──
    this.emit(out, ax, az);
    this.emit(out, startX, startZ);
    if (bestEnd === -2) {
      this.emitEdgeRange(out, startEdge, startS, endS);
    } else {
      // Remonte la chaîne des provenances jusqu'au germe.
      let count = 0;
      let n = bestEnd;
      while (parentAdj[n] >= 0) {
        if (count === this.chain.length) {
          const bigger = new Int32Array(count * 2);
          bigger.set(this.chain);
          this.chain = bigger;
        }
        this.chain[count++] = parentAdj[n];
        n = parentNode[n];
      }
      // Tronçon de départ : du point d'accroche au premier nœud.
      this.emitEdgeRange(out, startEdge, startS, parentAdj[n] === FROM_START_FORWARD ? es.length : 0);
      for (let i = count - 1; i >= 0; i--) {
        const k = this.chain[i];
        const e = this.adjEdge[k];
        const length = edges[e].length;
        if ((adjFlags[k] & ADJ_FORWARD) !== 0) this.emitEdgeRange(out, e, 0, length);
        else this.emitEdgeRange(out, e, length, 0);
      }
      // Tronçon d'arrivée : du dernier nœud au point d'accroche.
      this.emitEdgeRange(out, endEdge, bestEnd === ee.a ? 0 : ee.length, endS);
    }
    this.emit(out, endX, endZ);
    this.emit(out, bx, bz);
    return true;
  }

  /** Ajoute un point, sauf s'il est confondu avec le précédent. */
  private emit(out: number[], x: number, z: number): void {
    const n = this.count;
    if (n >= 2) {
      const dx = out[n - 2] - x, dz = out[n - 1] - z;
      if (dx * dx + dz * dz < MERGE_EPS * MERGE_EPS) return;
    }
    out[n] = x;
    out[n + 1] = z;
    this.count = n + 2;
  }

  /**
   * Ajoute les points de l'arête entre les abscisses s0 et s1 (dans un sens ou dans l'autre),
   * extrémités comprises : le point exact en s0, les sommets intermédiaires, le point exact en s1.
   */
  private emitEdgeRange(out: number[], edge: number, s0: number, s1: number): void {
    const pts = this.net.graph.edges[edge].points;
    const np = pts.length >> 1;
    if (np < 2) return;
    const forward = s1 >= s0;
    const lo = forward ? s0 : s1, hi = forward ? s1 : s0;
    if (forward) {
      let s = 0;
      for (let i = 0; i + 1 < np; i++) {
        const x0 = pts[2 * i], z0 = pts[2 * i + 1], x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const e = s + len;
        if (e >= lo && s <= hi && len > 0) {
          const ta = lo > s ? (lo - s) / len : 0;
          const tb = hi < e ? (hi - s) / len : 1;
          this.emit(out, x0 + (x1 - x0) * ta, z0 + (z1 - z0) * ta);
          this.emit(out, x0 + (x1 - x0) * tb, z0 + (z1 - z0) * tb);
        }
        s = e;
      }
    } else {
      // Sens inverse : on parcourt les segments du dernier au premier.
      let total = 0;
      for (let i = 0; i + 1 < np; i++) total += Math.hypot(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]);
      let e = total;
      for (let i = np - 2; i >= 0; i--) {
        const x0 = pts[2 * i], z0 = pts[2 * i + 1], x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const s = e - len;
        if (e >= lo && s <= hi && len > 0) {
          const ta = lo > s ? (lo - s) / len : 0;
          const tb = hi < e ? (hi - s) / len : 1;
          this.emit(out, x0 + (x1 - x0) * tb, z0 + (z1 - z0) * tb);
          this.emit(out, x0 + (x1 - x0) * ta, z0 + (z1 - z0) * ta);
        }
        e = s;
      }
    }
  }
}
