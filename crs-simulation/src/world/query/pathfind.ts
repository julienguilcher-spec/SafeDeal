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
/** Sens interdit d'une voie carrossable à sens unique (empruntable à contresens par une intervention urgente). */
const ADJ_CONTRA = 4;
/** Longueur maximale d'un tronçon pris à contresens (m) et surcoût fixe (s). */
const CONTRA_MAX = 160;
const CONTRA_EXTRA = 15;

// Marqueurs de provenance : départ par l'arête d'accroche vers son nœud b (avant) ou a (arrière).
const FROM_START_FORWARD = -2;
const FROM_START_BACKWARD = -3;

/** Départ orienté d'un itinéraire de véhicule : cap au départ et coût d'un demi-tour (en secondes de trajet). */
export interface PathStart {
  heading: number;
  uturn: number;
  /**
   * Zones à éviter (foule, manifestation) : une voie qui passe à moins de r m d'un centre coûte `cost` s de plus (défaut
   * 240 s) — on la prend seulement s'il n'y a pas d'autre chemin raisonnable.
   */
  avoid?: readonly { x: number; z: number; r: number; cost?: number }[];
  /**
   * Intervention urgente : un court tronçon à sens unique (moins de 160 m) peut être pris à contresens, au pas — son
   * temps de parcours est multiplié par ce facteur (0 : jamais).
   */
  contraflow?: number;
  /**
   * Largeur de chaussée confortable pour le véhicule (m) : une voie plus étroite (passage de service sous une arche,
   * ruelle) coûte cher — empruntée seulement s'il n'y a rien d'autre.
   */
  minWidth?: number;
}

export class PathFinder {
  private readonly net: RoadNetwork;
  // Adjacence compacte : pour le nœud n, les entrées [adjStart[n], adjStart[n + 1][.
  private readonly adjStart: Int32Array;
  private readonly adjEdge: Int32Array;
  private readonly adjTo: Int32Array;
  private readonly adjFlags: Uint8Array;
  private readonly adjFoot: Float32Array;
  private readonly adjVehicle: Float32Array;
  // Coordonnées des nœuds, à plat (l'heuristique les lit à chaque arête développée).
  private readonly nodeX: Float64Array;
  /** Cap en quittant le nœud a (resp. b) le long de chaque arête. */
  private readonly leaveA: Float32Array;
  private readonly leaveB: Float32Array;
  private readonly nodeZ: Float64Array;
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
      this.adjFlags[k] = drivable && !ed.oneway ? ADJ_VEHICLE : drivable ? ADJ_CONTRA : 0;
      this.adjFoot[k] = ed.length;
      this.adjVehicle[k] = time;
    }
    // cap au départ de chaque extrémité d'arête (pour le coût des virages serrés)
    this.leaveA = new Float32Array(edges.length);
    this.leaveB = new Float32Array(edges.length);
    for (let e = 0; e < edges.length; e++) {
      const pts = edges[e].points;
      const np = pts.length >> 1;
      if (np < 2) continue;
      this.leaveA[e] = Math.atan2(pts[2] - pts[0], pts[3] - pts[1]);
      this.leaveB[e] = Math.atan2(pts[2 * np - 4] - pts[2 * np - 2], pts[2 * np - 3] - pts[2 * np - 1]);
    }
    this.nodeX = new Float64Array(nn);
    this.nodeZ = new Float64Array(nn);
    for (let n = 0; n < nn; n++) {
      this.nodeX[n] = net.nodes[n].x;
      this.nodeZ[n] = net.nodes[n].z;
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

  /** Distance à vol d'oiseau du nœud à l'arrivée. */
  private heuristic(node: number, endX: number, endZ: number): number {
    const dx = this.nodeX[node] - endX, dz = this.nodeZ[node] - endZ;
    return Math.sqrt(dx * dx + dz * dz);
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
  find(ax: number, az: number, bx: number, bz: number, vehicle: boolean, out: number[], start?: PathStart): boolean {
    // Le tableau de l'appelant est réécrit en place puis ajusté à la bonne longueur : le vider
    // d'abord (length = 0) ferait réallouer son contenu à chaque appel.
    this.count = 0;
    this.startHeading = start && Number.isFinite(start.heading) ? start.heading : NaN;
    this.uturnCost = start && start.uturn > 0 ? start.uturn : 0;
    this.avoid = vehicle && start && start.avoid && start.avoid.length > 0 ? start.avoid : undefined;
    this.contra = vehicle && start && start.contraflow && start.contraflow > 0 ? start.contraflow : 0;
    this.minWidth = vehicle && start && start.minWidth && start.minWidth > 0 ? start.minWidth : 0;
    if (this.avoid) {
      const ne = this.net.graph.edges.length;
      if (this.edgePenalty.length !== ne) {
        this.edgePenalty = new Float32Array(ne);
        this.edgePenaltyGen = new Uint32Array(ne);
      }
      this.penaltyGen++;
    }
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
  /** Cap du véhicule au départ (NaN : indifférent) et coût d'un demi-tour au départ (unités du coût du mode). */
  private startHeading = NaN;
  private uturnCost = 0;
  private avoid: PathStart['avoid'] = undefined;
  private contra = 0;
  private minWidth = 0;
  /** Surcoût d'évitement de chaque arête pour la recherche en cours (calculé à la demande). */
  private edgePenalty: Float32Array = new Float32Array(0);
  private edgePenaltyGen: Uint32Array = new Uint32Array(0);
  private penaltyGen = 0;

  /** Surcoût de la portion [s0, s1] (abscisses) d'une arête qui traverse une zone à éviter (0 sinon). */
  private penaltyOfRange(edge: number, s0: number, s1: number): number {
    const avoid = this.avoid;
    if (!avoid || avoid.length === 0) return 0;
    const lo = s0 < s1 ? s0 : s1, hi = s0 < s1 ? s1 : s0;
    const pts = this.net.graph.edges[edge].points;
    const np = pts.length >> 1;
    let pen = 0;
    for (let a = 0; a < avoid.length; a++) {
      const z0 = avoid[a]!;
      const r2 = z0.r * z0.r;
      let acc = 0;
      let hit = false;
      for (let i = 0; i + 1 < np && !hit; i++) {
        const ax = pts[2 * i], az = pts[2 * i + 1];
        const dx = pts[2 * i + 2] - ax, dz = pts[2 * i + 3] - az;
        const l = Math.sqrt(dx * dx + dz * dz);
        const e = acc + l;
        if (e >= lo && acc <= hi && l > 1e-6) {
          const ta = lo > acc ? (lo - acc) / l : 0, tb = hi < e ? (hi - acc) / l : 1;
          let t = ((z0.x - ax) * dx + (z0.z - az) * dz) / (l * l);
          if (t < ta) t = ta;
          else if (t > tb) t = tb;
          const ex = z0.x - (ax + dx * t), ez = z0.z - (az + dz * t);
          hit = ex * ex + ez * ez < r2;
        }
        acc = e;
      }
      if (hit) pen += z0.cost ?? 240;
    }
    return pen;
  }

  /** Surcoût d'une arête qui traverse une zone à éviter (0 sinon). */
  private penaltyOf(edge: number): number {
    const avoid = this.avoid;
    if (!avoid || avoid.length === 0) return 0;
    if (this.edgePenaltyGen[edge] === this.penaltyGen) return this.edgePenalty[edge]!;
    const pts = this.net.graph.edges[edge].points;
    const np = pts.length >> 1;
    let pen = 0;
    for (let a = 0; a < avoid.length; a++) {
      const z0 = avoid[a]!;
      const r2 = z0.r * z0.r;
      let hit = false;
      for (let i = 0; i + 1 < np && !hit; i++) {
        const ax = pts[2 * i], az = pts[2 * i + 1];
        const dx = pts[2 * i + 2] - ax, dz = pts[2 * i + 3] - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 1e-9 ? ((z0.x - ax) * dx + (z0.z - az) * dz) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const ex = z0.x - (ax + dx * t), ez = z0.z - (az + dz * t);
        hit = ex * ex + ez * ez < r2;
      }
      if (hit) pen += z0.cost ?? 240;
    }
    this.edgePenalty[edge] = pen;
    this.edgePenaltyGen[edge] = this.penaltyGen;
    return pen;
  }

  /** Surcoût d'un virage au nœud (s) : nul jusqu'à 110°, puis croissant jusqu'au demi-tour. */
  private sharpTurn(inHeading: number, outHeading: number): number {
    let d = outHeading - inHeading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const a = d < 0 ? -d : d;
    if (a < 1.9) return 0;
    if (a > 2.8) return 200;
    return 25 + (a - 1.9) * 150;
  }

  /** Cap (atan2(dx, dz)) de l'arête dans le sens a → b à l'abscisse s. */
  private tangentAt(edge: number, s: number): number {
    const pts = this.net.graph.edges[edge].points;
    const np = pts.length >> 1;
    let acc = 0;
    for (let i = 0; i + 1 < np; i++) {
      const dx = pts[2 * i + 2] - pts[2 * i], dz = pts[2 * i + 3] - pts[2 * i + 1];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (acc + len >= s || i + 2 >= np) return Math.atan2(dx, dz);
      acc += len;
    }
    return 0;
  }

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
    const contra = this.contra;
    const startBackOk = !vehicle || !es.oneway || (contra > 0 && !es.pedestrianOnly && es.length < CONTRA_MAX);
    const endBackOk = !vehicle || !ee.oneway || (contra > 0 && !ee.pedestrianOnly && ee.length < CONTRA_MAX);
    // à contresens sur l'arête de départ ou d'arrivée : même tarif qu'un tronçon à contresens
    const startBackRate = vehicle && es.oneway ? contra : 1;
    const endBackRate = vehicle && ee.oneway ? contra : 1;
    // Départ orienté (véhicule) : partir dans le sens opposé à son cap coûte un demi-tour ; dans une rue étroite, le
    // tour du pâté de maisons revient moins cher qu'une manœuvre impossible.
    let forwardExtra = 0;
    let backwardExtra = 0;
    if (vehicle && this.uturnCost > 0 && !Number.isNaN(this.startHeading)) {
      const t = this.tangentAt(startEdge, startS);
      const dot = Math.cos(this.startHeading - t);
      if (dot < -0.25) forwardExtra = this.uturnCost;
      else if (dot > 0.25) backwardExtra = this.uturnCost;
    }

    // Trajet direct le long d'une même arête.
    let bestTotal = Infinity;
    let bestEnd = -1; // -1 : aucun ; -2 : direct ; sinon nœud final
    if (startEdge === endEdge && (endS >= startS || startBackOk)) {
      bestTotal = Math.abs(endS - startS) * startRate * (endS >= startS ? 1 : startBackRate) + (endS >= startS ? forwardExtra : backwardExtra + (startBackRate > 1 ? CONTRA_EXTRA : 0));
      bestEnd = -2;
    }

    const gen = ++this.generation;
    const g = this.g, seen = this.seen, closed = this.closed, parentNode = this.parentNode, parentAdj = this.parentAdj;
    const nodeX = this.nodeX, nodeZ = this.nodeZ;
    this.heapSize = 0;
    this.expanded = 0;

    // Germes : les deux nœuds de l'arête de départ.
    {
      const nb = es.b;
      // (l'arête de départ ne coûte que dans le sens où l'on traverse la zone)
      g[nb] = (es.length - startS) * startRate + forwardExtra + this.penaltyOfRange(startEdge, startS, es.length);
      seen[nb] = gen;
      parentNode[nb] = -1;
      parentAdj[nb] = FROM_START_FORWARD;
      this.push(nb, g[nb] + this.heuristic(nb, endX, endZ) * hRate);
      if (startBackOk) {
        const na = es.a;
        const cost = startS * startRate * startBackRate + (startBackRate > 1 ? CONTRA_EXTRA : 0) + backwardExtra + this.penaltyOfRange(startEdge, 0, startS);
        if (seen[na] !== gen || cost < g[na]) {
          g[na] = cost;
          seen[na] = gen;
          parentNode[na] = -1;
          parentAdj[na] = FROM_START_BACKWARD;
          this.push(na, cost + this.heuristic(na, endX, endZ) * hRate);
        }
      }
    }

    const adjStart = this.adjStart, adjTo = this.adjTo, adjFlags = this.adjFlags;
    const adjCost = vehicle ? this.adjVehicle : this.adjFoot;
    // virages en épingle coûteux pour un véhicule piloté (départ orienté demandé) : un fourgon ne prend pas un virage à
    // 150° d'un boulevard dans une rue de 5 m — il fait le tour par la rue suivante
    const turns = vehicle && this.uturnCost > 0;
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
        const total = gn + (ee.length - endS) * endRate * endBackRate + (endBackRate > 1 ? CONTRA_EXTRA : 0);
        if (total < bestTotal) {
          bestTotal = total;
          bestEnd = n;
        }
      }
      // cap d'arrivée au nœud (virages serrés : voir sharpTurn)
      const pk = parentAdj[n];
      let inHeading = NaN;
      if (turns) {
        if (pk >= 0) {
          const pe = this.adjEdge[pk];
          inHeading = (adjFlags[pk] & ADJ_FORWARD) !== 0 ? this.leaveB[pe] + Math.PI : this.leaveA[pe] + Math.PI;
        } else if (pk === FROM_START_FORWARD) {
          inHeading = this.leaveB[startEdge] + Math.PI;
        } else if (pk === FROM_START_BACKWARD) {
          inHeading = this.leaveA[startEdge] + Math.PI;
        }
      }
      for (let k = adjStart[n], end = adjStart[n + 1]; k < end; k++) {
        let contraCost = 0;
        if (vehicle && (adjFlags[k] & ADJ_VEHICLE) === 0) {
          if (contra === 0 || (adjFlags[k] & ADJ_CONTRA) === 0 || edges[this.adjEdge[k]].length > CONTRA_MAX) continue;
          contraCost = adjCost[k] * (contra - 1) + CONTRA_EXTRA;
        }
        const to = adjTo[k];
        if (closed[to] === gen) continue;
        let cost = gn + adjCost[k] + contraCost + (this.avoid ? this.penaltyOf(this.adjEdge[k]) : 0);
        if (this.minWidth > 0) {
          const ed = edges[this.adjEdge[k]];
          if (ed.width > 0 && ed.width < this.minWidth) cost += adjCost[k] * 3 + 120;
        }
        if (turns && !Number.isNaN(inHeading)) {
          const ek = this.adjEdge[k];
          const out = (adjFlags[k] & ADJ_FORWARD) !== 0 ? this.leaveA[ek] : this.leaveB[ek];
          cost += this.sharpTurn(inHeading, out);
        }
        if (seen[to] === gen && cost >= g[to]) continue;
        g[to] = cost;
        seen[to] = gen;
        parentNode[to] = n;
        parentAdj[to] = k;
        const hx = nodeX[to] - endX, hz = nodeZ[to] - endZ;
        this.push(to, cost + Math.sqrt(hx * hx + hz * hz) * hRate);
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
        const len = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
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
      for (let i = 0; i + 1 < np; i++) {
        const dx = pts[2 * i + 2] - pts[2 * i], dz = pts[2 * i + 3] - pts[2 * i + 1];
        total += Math.sqrt(dx * dx + dz * dz);
      }
      let e = total;
      for (let i = np - 2; i >= 0; i--) {
        const x0 = pts[2 * i], z0 = pts[2 * i + 1], x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
        const len = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
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
