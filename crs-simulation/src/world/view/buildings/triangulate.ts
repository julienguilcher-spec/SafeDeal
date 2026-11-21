/* =====================================================================================
 * IMMEUBLES — triangulation de polygones à trous (logique pure)
 * -------------------------------------------------------------------------------------
 * Découpe par « oreilles » sur liste chaînée, avec raccord des trous par ponts, d'après
 * l'algorithme d'earcut (Mapbox, licence ISC), réécrit sur tableaux typés : aucun objet
 * alloué par sommet, tampons réutilisés d'un appel à l'autre.
 *
 * Robustesse : sommets répétés, côtés alignés, anneaux qui se touchent ou se recoupent
 * légèrement, trous hors de l'anneau… ne font jamais planter ni boucler ; au pire, la
 * triangulation est partielle (l'appelant compare l'aire obtenue à l'aire attendue).
 *
 * Sens : les triangles produits tournent comme un anneau extérieur « antihoraire vu de
 * dessus » de mapdata (aire signée positive) : posés à plat dans le repère du jeu, leur
 * normale pointe vers le HAUT (+y).
 * ===================================================================================== */

// Nœuds de la liste chaînée, en colonnes.
let cap = 512;
let nodeX = new Float64Array(cap);
let nodeY = new Float64Array(cap);
let nodeI = new Int32Array(cap);
let nodePrev = new Int32Array(cap);
let nodeNext = new Int32Array(cap);
let nodeCount = 0;

/** Indices des triangles du dernier appel (3 par triangle), valables jusqu'à l'appel suivant. */
export let triIndices = new Uint32Array(1024);
let triCount = 0;

let holeQueue = new Int32Array(16);

function growNodes(): void {
  cap *= 2;
  const x = new Float64Array(cap); x.set(nodeX); nodeX = x;
  const y = new Float64Array(cap); y.set(nodeY); nodeY = y;
  const i = new Int32Array(cap); i.set(nodeI); nodeI = i;
  const p = new Int32Array(cap); p.set(nodePrev); nodePrev = p;
  const n = new Int32Array(cap); n.set(nodeNext); nodeNext = n;
}

function pushTri(a: number, b: number, c: number): void {
  if (3 * triCount + 3 > triIndices.length) {
    const g = new Uint32Array(triIndices.length * 2);
    g.set(triIndices);
    triIndices = g;
  }
  triIndices[3 * triCount] = a;
  triIndices[3 * triCount + 1] = b;
  triIndices[3 * triCount + 2] = c;
  triCount++;
}

/** Crée un nœud et l'insère après `last` (-1 : nouveau cycle). Retourne son indice. */
function insertNode(i: number, x: number, y: number, last: number): number {
  if (nodeCount >= cap) growNodes();
  const p = nodeCount++;
  nodeI[p] = i;
  nodeX[p] = x;
  nodeY[p] = y;
  if (last < 0) {
    nodePrev[p] = p;
    nodeNext[p] = p;
  } else {
    const nx = nodeNext[last];
    nodeNext[p] = nx;
    nodePrev[p] = last;
    nodePrev[nx] = p;
    nodeNext[last] = p;
  }
  return p;
}

function removeNode(p: number): void {
  const n = nodeNext[p], q = nodePrev[p];
  nodeNext[q] = n;
  nodePrev[n] = q;
}

/** Aire signée du triangle (p, q, r) : NÉGATIVE si le coin q est convexe (parcours direct). */
function area(p: number, q: number, r: number): number {
  return (nodeY[q] - nodeY[p]) * (nodeX[r] - nodeX[q]) - (nodeX[q] - nodeX[p]) * (nodeY[r] - nodeY[q]);
}

function equals(a: number, b: number): boolean {
  return nodeX[a] === nodeX[b] && nodeY[a] === nodeY[b];
}

/** Aire signée d'un anneau dans le repère interne (x, y = -z) : positive si direct. */
function signedArea(coords: ArrayLike<number>, start: number, end: number): number {
  let sum = 0;
  for (let i = start, j = end - 1; i < end; j = i++) {
    sum += (coords[2 * j] - coords[2 * i]) * (-coords[2 * i + 1] - coords[2 * j + 1]);
  }
  return sum;
}

/** Construit le cycle d'un anneau (sommets start..end-1), dans le sens direct ou indirect. */
function linkedList(coords: ArrayLike<number>, start: number, end: number, direct: boolean): number {
  let last = -1;
  if (direct === signedArea(coords, start, end) > 0) {
    for (let i = start; i < end; i++) last = insertNode(i, coords[2 * i], -coords[2 * i + 1], last);
  } else {
    for (let i = end - 1; i >= start; i--) last = insertNode(i, coords[2 * i], -coords[2 * i + 1], last);
  }
  if (last >= 0 && equals(last, nodeNext[last])) {
    removeNode(last);
    last = nodeNext[last];
  }
  return last;
}

/** Retire les sommets répétés ou alignés. */
function filterPoints(start: number, end: number): number {
  if (start < 0) return start;
  if (end < 0) end = start;
  let p = start;
  let again: boolean;
  let guard = nodeCount * 4 + 16;
  do {
    again = false;
    if (equals(p, nodeNext[p]) || area(nodePrev[p], p, nodeNext[p]) === 0) {
      removeNode(p);
      p = end = nodePrev[p];
      if (p === nodeNext[p]) break;
      again = true;
    } else {
      p = nodeNext[p];
    }
  } while ((again || p !== end) && guard-- > 0);
  return end;
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py)
    && (ax - px) * (by - py) >= (bx - px) * (ay - py)
    && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

function isEar(ear: number): boolean {
  const a = nodePrev[ear], b = ear, c = nodeNext[ear];
  if (area(a, b, c) >= 0) return false;       // coin rentrant : pas une oreille
  const ax = nodeX[a], bx = nodeX[b], cx = nodeX[c], ay = nodeY[a], by = nodeY[b], cy = nodeY[c];
  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);
  let p = nodeNext[c];
  while (p !== a) {
    const px = nodeX[p], py = nodeY[p];
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1
      && !(px === ax && py === ay)
      && pointInTriangle(ax, ay, bx, by, cx, cy, px, py)
      && area(nodePrev[p], p, nodeNext[p]) >= 0) return false;
    p = nodeNext[p];
  }
  return true;
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function onSegment(p: number, q: number, r: number): boolean {
  return nodeX[q] <= Math.max(nodeX[p], nodeX[r]) && nodeX[q] >= Math.min(nodeX[p], nodeX[r])
    && nodeY[q] <= Math.max(nodeY[p], nodeY[r]) && nodeY[q] >= Math.min(nodeY[p], nodeY[r]);
}

function intersects(p1: number, q1: number, p2: number, q2: number): boolean {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function locallyInside(a: number, b: number): boolean {
  return area(nodePrev[a], a, nodeNext[a]) < 0
    ? area(a, b, nodeNext[a]) >= 0 && area(a, nodePrev[a], b) >= 0
    : area(a, b, nodePrev[a]) < 0 || area(a, nodeNext[a], b) < 0;
}

function intersectsPolygon(a: number, b: number): boolean {
  let p = a;
  do {
    const n = nodeNext[p];
    if (nodeI[p] !== nodeI[a] && nodeI[n] !== nodeI[a] && nodeI[p] !== nodeI[b] && nodeI[n] !== nodeI[b]
      && intersects(p, n, a, b)) return true;
    p = n;
  } while (p !== a);
  return false;
}

function middleInside(a: number, b: number): boolean {
  let p = a;
  let inside = false;
  const px = (nodeX[a] + nodeX[b]) / 2, py = (nodeY[a] + nodeY[b]) / 2;
  do {
    const n = nodeNext[p];
    if ((nodeY[p] > py) !== (nodeY[n] > py) && nodeY[n] !== nodeY[p]
      && px < ((nodeX[n] - nodeX[p]) * (py - nodeY[p])) / (nodeY[n] - nodeY[p]) + nodeX[p]) inside = !inside;
    p = n;
  } while (p !== a);
  return inside;
}

function isValidDiagonal(a: number, b: number): boolean {
  if (nodeI[nodeNext[a]] === nodeI[b] || nodeI[nodePrev[a]] === nodeI[b] || intersectsPolygon(a, b)) return false;
  if (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b)
    && (area(nodePrev[a], a, nodePrev[b]) !== 0 || area(a, nodePrev[b], b) !== 0)) return true;
  return equals(a, b) && area(nodePrev[a], a, nodeNext[a]) > 0 && area(nodePrev[b], b, nodeNext[b]) > 0;
}

/** Relie a et b par un pont : coupe un anneau en deux, ou soude un trou à l'anneau extérieur. */
function splitPolygon(a: number, b: number): number {
  const a2 = insertNode(nodeI[a], nodeX[a], nodeY[a], -1);
  const b2 = insertNode(nodeI[b], nodeX[b], nodeY[b], -1);
  const an = nodeNext[a], bp = nodePrev[b];
  nodeNext[a] = b; nodePrev[b] = a;
  nodeNext[a2] = an; nodePrev[an] = a2;
  nodeNext[b2] = a2; nodePrev[a2] = b2;
  nodeNext[bp] = b2; nodePrev[b2] = bp;
  return b2;
}

function cureLocalIntersections(start: number): number {
  let p = start;
  let guard = nodeCount * 2 + 16;
  do {
    const a = nodePrev[p], n = nodeNext[p], b = nodeNext[n];
    if (!equals(a, b) && intersects(a, p, n, b) && locallyInside(a, b) && locallyInside(b, a)) {
      pushTri(nodeI[a], nodeI[p], nodeI[b]);
      removeNode(p);
      removeNode(n);
      p = start = b;
    }
    p = nodeNext[p];
  } while (p !== start && guard-- > 0);
  return filterPoints(p, -1);
}

function splitEarcut(start: number, depth: number): void {
  let a = start;
  do {
    let b = nodeNext[nodeNext[a]];
    while (b !== nodePrev[a]) {
      if (nodeI[a] !== nodeI[b] && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, nodeNext[a]);
        c = filterPoints(c, nodeNext[c]);
        earcutLinked(a, 0, depth + 1);
        earcutLinked(c, 0, depth + 1);
        return;
      }
      b = nodeNext[b];
    }
    a = nodeNext[a];
  } while (a !== start);
}

function earcutLinked(ear: number, pass: number, depth: number): void {
  if (ear < 0 || depth > 64) return;
  let stop = ear;
  // borne de sécurité : chaque tour retire un sommet ou avance ; jamais plus de n² tours utiles
  let guard = nodeCount * nodeCount + 64;
  while (nodePrev[ear] !== nodeNext[ear] && guard-- > 0) {
    const prev = nodePrev[ear], next = nodeNext[ear];
    if (isEar(ear)) {
      pushTri(nodeI[prev], nodeI[ear], nodeI[next]);
      removeNode(ear);
      ear = nodeNext[next];
      stop = nodeNext[next];
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (pass === 0) {
        earcutLinked(filterPoints(ear, -1), 1, depth);
      } else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear, -1));
        earcutLinked(ear, 2, depth);
      } else if (pass === 2) {
        splitEarcut(ear, depth);
      }
      break;
    }
  }
}

function getLeftmost(start: number): number {
  let p = start, leftmost = start;
  do {
    if (nodeX[p] < nodeX[leftmost] || (nodeX[p] === nodeX[leftmost] && nodeY[p] < nodeY[leftmost])) leftmost = p;
    p = nodeNext[p];
  } while (p !== start);
  return leftmost;
}

function sectorContainsSector(m: number, p: number): boolean {
  return area(nodePrev[m], m, nodePrev[p]) < 0 && area(nodeNext[p], m, nodeNext[m]) < 0;
}

/** Algorithme d'Eberly : sommet de l'anneau extérieur visible depuis le sommet le plus à gauche du trou. */
function findHoleBridge(hole: number, outerNode: number): number {
  let p = outerNode;
  const hx = nodeX[hole], hy = nodeY[hole];
  let qx = -Infinity;
  let m = -1;
  if (equals(hole, p)) return p;
  do {
    const n = nodeNext[p];
    if (equals(hole, n)) return n;
    if (hy <= nodeY[p] && hy >= nodeY[n] && nodeY[n] !== nodeY[p]) {
      const x = nodeX[p] + ((hy - nodeY[p]) * (nodeX[n] - nodeX[p])) / (nodeY[n] - nodeY[p]);
      if (x <= hx && x > qx) {
        qx = x;
        m = nodeX[p] < nodeX[n] ? p : n;
        if (x === hx) return m;
      }
    }
    p = n;
  } while (p !== outerNode);
  if (m < 0) return -1;
  const stop = m;
  const mx = nodeX[m], my = nodeY[m];
  let tanMin = Infinity;
  p = m;
  do {
    const px = nodeX[p], py = nodeY[p];
    if (hx >= px && px >= mx && hx !== px
      && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, px, py)) {
      const tan = Math.abs(hy - py) / (hx - px);
      if (locallyInside(p, hole)
        && (tan < tanMin || (tan === tanMin && (px > nodeX[m] || (px === nodeX[m] && sectorContainsSector(m, p)))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = nodeNext[p];
  } while (p !== stop);
  return m;
}

function eliminateHole(hole: number, outerNode: number): number {
  const bridge = findHoleBridge(hole, outerNode);
  if (bridge < 0) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, nodeNext[bridgeReverse]);
  return filterPoints(bridge, nodeNext[bridge]);
}

/**
 * Triangule un polygone.
 * @param coords    sommets [x0, z0, x1, z1, …] de tous les anneaux, à la suite
 * @param ringEnds  pour chaque anneau, l'indice (en sommets) qui suit son dernier sommet ;
 *                  l'anneau 0 est l'extérieur, les suivants sont des trous. Le sens des anneaux
 *                  est indifférent.
 * @param nRings    nombre d'anneaux à lire dans ringEnds (défaut : tous)
 * @returns le nombre de triangles ; leurs indices de sommets sont dans `triIndices`.
 */
export function triangulate(coords: ArrayLike<number>, ringEnds: ArrayLike<number>, nRings: number = ringEnds.length): number {
  nodeCount = 0;
  triCount = 0;
  if (nRings < 1) return 0;
  const outerEnd = ringEnds[0];
  if (outerEnd < 3) return 0;
  let outerNode = linkedList(coords, 0, outerEnd, true);
  if (outerNode < 0 || nodeNext[outerNode] === nodePrev[outerNode]) return 0;

  if (nRings > 1) {
    if (holeQueue.length < nRings) holeQueue = new Int32Array(nRings * 2);
    let nq = 0;
    for (let r = 1; r < nRings; r++) {
      const start = ringEnds[r - 1], end = ringEnds[r];
      if (end - start < 3) continue;
      const list = linkedList(coords, start, end, false);
      if (list < 0 || list === nodeNext[list]) continue;
      holeQueue[nq++] = getLeftmost(list);
    }
    // tri par abscisse croissante (insertion : peu de trous)
    for (let i = 1; i < nq; i++) {
      const h = holeQueue[i];
      let j = i - 1;
      while (j >= 0 && (nodeX[holeQueue[j]] > nodeX[h] || (nodeX[holeQueue[j]] === nodeX[h] && nodeY[holeQueue[j]] > nodeY[h]))) {
        holeQueue[j + 1] = holeQueue[j];
        j--;
      }
      holeQueue[j + 1] = h;
    }
    for (let i = 0; i < nq; i++) outerNode = eliminateHole(holeQueue[i], outerNode);
  }
  earcutLinked(outerNode, 0, 0);
  return triCount;
}

/** Somme des aires (m², positives) des triangles du dernier appel. */
export function triangulatedArea(coords: ArrayLike<number>, count: number): number {
  let s = 0;
  for (let t = 0; t < count; t++) {
    const a = triIndices[3 * t], b = triIndices[3 * t + 1], c = triIndices[3 * t + 2];
    const ax = coords[2 * a], az = coords[2 * a + 1];
    s += Math.abs((coords[2 * b] - ax) * (coords[2 * c + 1] - az) - (coords[2 * b + 1] - az) * (coords[2 * c] - ax)) / 2;
  }
  return s;
}
