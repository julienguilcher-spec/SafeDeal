/* =====================================================================================
 * VILLE EN 3D — triangulation de polygones à trous (logique pure).
 * -------------------------------------------------------------------------------------
 * Découpe par « oreilles » sur liste chaînée, avec raccord des trous à l'anneau extérieur et
 * reprises en cas d'anneau imparfait (côtés qui se touchent, points confondus) : les contours
 * de la carte découpés par tuile en produisent. Même principe que la bibliothèque earcut,
 * réécrit ici (aucune dépendance), sans table de hachage : les anneaux font au plus quelques
 * centaines de sommets.
 * ===================================================================================== */

interface Node {
  /** Indice du sommet dans le tableau de coordonnées. */
  i: number;
  x: number;
  y: number;
  prev: Node;
  next: Node;
  steiner: boolean;
}

function makeNode(i: number, x: number, y: number): Node {
  const n = { i, x, y, steiner: false } as Node;
  n.prev = n;
  n.next = n;
  return n;
}

function insertNode(i: number, x: number, y: number, last: Node | null): Node {
  const p = makeNode(i, x, y);
  if (last === null) return p;
  p.next = last.next;
  p.prev = last;
  last.next.prev = p;
  last.next = p;
  return p;
}

function removeNode(p: Node): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
}

function signedArea(data: ArrayLike<number>, start: number, end: number): number {
  let sum = 0;
  for (let i = start, j = end - 2; i < end; i += 2) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

function linkedList(data: ArrayLike<number>, start: number, end: number, clockwise: boolean): Node | null {
  let last: Node | null = null;
  if (clockwise === signedArea(data, start, end) > 0) {
    for (let i = start; i < end; i += 2) last = insertNode(i >> 1, data[i], data[i + 1], last);
  } else {
    for (let i = end - 2; i >= start; i -= 2) last = insertNode(i >> 1, data[i], data[i + 1], last);
  }
  if (last !== null && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

function equals(a: Node, b: Node): boolean {
  return a.x === b.x && a.y === b.y;
}

function area(p: Node, q: Node, r: Node): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function filterPoints(start: Node | null, end?: Node | null): Node | null {
  if (start === null) return start;
  if (!end) end = start;
  let p = start;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);
  return end;
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

function isEar(ear: Node): boolean {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false; // sommet rentrant
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !(ax === p.x && ay === p.y) && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function onSegment(p: Node, q: Node, r: Node): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function intersects(p1: Node, q1: Node, p2: Node, q2: Node): boolean {
  const o1 = sign(area(p1, q1, p2)), o2 = sign(area(p1, q1, q2)), o3 = sign(area(p2, q2, p1)), o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function locallyInside(a: Node, b: Node): boolean {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

function middleInside(a: Node, b: Node): boolean {
  let p = a, inside = false;
  const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}

function intersectsPolygon(a: Node, b: Node): boolean {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function isValidDiagonal(a: Node, b: Node): boolean {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b)
    && ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0))
      || (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0));
}

function splitPolygon(a: Node, b: Node): Node {
  const a2 = makeNode(a.i, a.x, a.y), b2 = makeNode(b.i, b.x, b.y);
  const an = a.next, bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

function cureLocalIntersections(start: Node, out: number[]): Node | null {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      out.push(a.i, p.i, b.i);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}

function splitEarcut(start: Node, out: number[]): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c: Node | null = splitPolygon(a, b);
        const a2 = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a2, out, 0);
        earcutLinked(c, out, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function earcutLinked(ear: Node | null, out: number[], pass: number): void {
  if (ear === null) return;
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev: Node = ear.prev, next: Node = ear.next;
    if (isEar(ear)) {
      out.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      // Plus aucune oreille : on nettoie, on répare les petits croisements, puis on coupe le polygone en deux.
      if (pass === 0) earcutLinked(filterPoints(ear), out, 1);
      else if (pass === 1) {
        const cured = cureLocalIntersections(filterPoints(ear) as Node, out);
        earcutLinked(cured, out, 2);
      } else if (pass === 2) splitEarcut(ear, out);
      break;
    }
  }
}

function getLeftmost(start: Node): Node {
  let p = start, leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}

function sectorContainsSector(m: Node, p: Node): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

function findHoleBridge(hole: Node, outerNode: Node): Node | null {
  let p = outerNode;
  const hx = hole.x, hy = hole.y;
  let qx = -Infinity;
  let m: Node | null = null;
  // Rayon horizontal vers la gauche depuis le trou : premier côté de l'anneau extérieur rencontré.
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (m === null) return null;
  const stop = m;
  const mx = m.x, my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

function eliminateHole(hole: Node, outerNode: Node): Node {
  const bridge = findHoleBridge(hole, outerNode);
  if (bridge === null) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next) as Node;
}

/**
 * Triangule un polygone. `data` = coordonnées à plat [x0, y0, x1, y1, …] de l'anneau extérieur suivi
 * des trous ; `holeStarts` = indice (en sommets) du premier sommet de chaque trou. Le sens des
 * anneaux est indifférent. Retourne des indices de sommets, trois par triangle (le sens des
 * triangles n'est pas garanti : l'appelant l'impose).
 */
export function triangulate(data: ArrayLike<number>, holeStarts: readonly number[] | null, out: number[] = []): number[] {
  out.length = 0;
  const hasHoles = holeStarts !== null && holeStarts.length > 0;
  const outerLen = hasHoles ? (holeStarts as readonly number[])[0] * 2 : data.length;
  let outerNode = linkedList(data, 0, outerLen, true);
  if (outerNode === null || outerNode.next === outerNode.prev) return out;
  if (hasHoles) {
    const starts = holeStarts as readonly number[];
    const queue: Node[] = [];
    for (let k = 0; k < starts.length; k++) {
      const start = starts[k] * 2;
      const end = k < starts.length - 1 ? starts[k + 1] * 2 : data.length;
      const list = linkedList(data, start, end, false);
      if (list === null) continue;
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }
    queue.sort((a, b) => a.x - b.x);
    for (let k = 0; k < queue.length; k++) outerNode = eliminateHole(queue[k], outerNode as Node);
  }
  earcutLinked(outerNode, out, 0);
  return out;
}

/** Aire (m²) couverte par une triangulation : pour contrôler qu'aucun morceau n'a été perdu. */
export function triangulatedArea(data: ArrayLike<number>, tris: readonly number[]): number {
  let sum = 0;
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = tris[t] * 2, b = tris[t + 1] * 2, c = tris[t + 2] * 2;
    sum += Math.abs((data[b] - data[a]) * (data[c + 1] - data[a + 1]) - (data[c] - data[a]) * (data[b + 1] - data[a + 1])) / 2;
  }
  return sum;
}
