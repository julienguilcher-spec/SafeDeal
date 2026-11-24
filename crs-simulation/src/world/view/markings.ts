/* =====================================================================================
 * VILLE EN 3D — marquages au sol (logique pure).
 * -------------------------------------------------------------------------------------
 * À partir du graphe routier : lignes de voies (axe, séparateurs), couloirs de bus, passages
 * piétons aux nœuds « crossing », lignes d'arrêt aux nœuds à feux. Tout est produit sous forme de
 * quadrilatères au sol en coordonnées monde ; l'appelant leur donne une altitude.
 *
 * Repère d'une arête a → b : d = distance à l'axe, positive à DROITE du sens a → b (on roule à
 * droite : les voies du sens a → b occupent le côté d > 0). Un motif (tirets, bandes) est calé sur
 * l'abscisse curviligne depuis le nœud a : deux tuiles voisines produisent donc les mêmes éléments
 * et chacune ne garde que ceux dont le centre est chez elle.
 * ===================================================================================== */

import type { RoadEdge, RoadGraph } from '../mapdata';

export const MARK_LINE = 0;
export const MARK_CROSSWALK = 1;
export const MARK_STOP = 2;
export const MARK_BUS_LINE = 3;
/** Symbole « BUS ». */
export const GLYPH_BUS = 0;

/** Largeur des lignes de voie (m), de la ligne de couloir de bus, de la ligne d'arrêt. */
export const LINE_WIDTH = 0.15;
export const BUS_LINE_WIDTH = 0.25;
export const STOP_LINE_WIDTH = 0.5;
/** Tirets de rase campagne adaptés à la ville : 3 m de trait, 10 m de vide. */
export const DASH_LENGTH = 3;
export const DASH_PERIOD = 13;
/** Passage piéton : bandes de 0,5 m espacées de 0,5 m, longues de 3,4 m. */
export const ZEBRA_BAND = 0.5;
export const ZEBRA_PERIOD = 1;
export const ZEBRA_LENGTH = 3.4;
/** Marge entre la bordure et la première bande. */
const ZEBRA_MARGIN = 0.25;

export interface MarkingBounds { minX: number; minZ: number; maxX: number; maxZ: number }

export interface MarkingSink {
  /** Quadrilatère au sol, sommets dans l'ordre du contour. */
  quad(x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number, kind: number): void;
  /** Symbole peint centré en (x, z), lu par un conducteur roulant selon `heading`. */
  glyph(x: number, z: number, heading: number, kind: number): void;
}

export interface MarkingProbe {
  /**
   * Distance (m) du point au bord de la chaussée dans la direction (vx, vz), d'après le sol réel ;
   * `fallback` si inconnue.
   */
  roadExtent(x: number, z: number, vx: number, vz: number, fallback: number): number;
}

/** Une arête porte-t-elle une chaussée (pour les carrefours, les passages et les lignes d'arrêt) ? */
export function isCarriage(e: RoadEdge): boolean {
  return !e.tunnel && !e.pedestrianOnly && e.roadClass !== 'footway' && e.roadClass !== 'pedestrian' && e.width >= 3.5;
}

/** Une arête reçoit-elle des lignes de voies ? */
export function hasLaneLines(e: RoadEdge): boolean {
  if (!isCarriage(e) || e.roadClass === 'service') return false;
  const lanes = e.lanesForward + (e.oneway ? 0 : e.lanesBackward);
  return lanes >= 2 && e.width >= 5.6;
}

const cur = { x: 0, z: 0, ux: 0, uz: 1 };

/** Point et tangente unitaire à l'abscisse curviligne s (bornée à la polyligne). Résultat dans un objet réutilisé. */
export function pointAlong(pts: ArrayLike<number>, s: number): { x: number; z: number; ux: number; uz: number } {
  let acc = 0;
  const last = pts.length - 2;
  for (let i = 2; i <= last; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    if (s <= acc + len || i === last) {
      let t = (s - acc) / len;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      cur.x = ax + (bx - ax) * t;
      cur.z = az + (bz - az) * t;
      cur.ux = (bx - ax) / len;
      cur.uz = (bz - az) / len;
      return cur;
    }
    acc += len;
  }
  cur.x = pts[0] ?? 0;
  cur.z = pts[1] ?? 0;
  return cur;
}

/** Nombre de chaussées qui arrivent au nœud. */
export function carriageDegree(graph: RoadGraph, node: number): number {
  const nd = graph.nodes[node];
  if (nd === undefined) return 0;
  let deg = 0;
  for (let k = 0; k < nd.edges.length; k++) if (isCarriage(graph.edges[nd.edges[k]])) deg++;
  return deg;
}

/**
 * Recul (m) des marquages d'une arête à l'approche d'un de ses nœuds : à un carrefour, la
 * demi-largeur de la plus large des autres chaussées plus une marge ; à un passage piéton en
 * pleine voie, la demi-longueur des bandes. Jamais plus de 40 % de l'arête.
 */
export function setbackAt(graph: RoadGraph, edgeId: number, node: number): number {
  const ed = graph.edges[edgeId];
  const nd = graph.nodes[node];
  if (ed === undefined || nd === undefined) return 0;
  let back = 0;
  if (carriageDegree(graph, node) >= 3) {
    let widest = 0;
    for (let k = 0; k < nd.edges.length; k++) {
      const other = graph.edges[nd.edges[k]];
      if (nd.edges[k] === edgeId || !isCarriage(other)) continue;
      if (other.width > widest) widest = other.width;
    }
    back = widest / 2 + 1.5;
    if (nd.crossing || nd.signal) back += ZEBRA_LENGTH + 0.6;
  } else if (nd.crossing) {
    back = ZEBRA_LENGTH / 2 + 0.4;
  }
  return Math.min(back, ed.length * 0.4);
}

function inside(b: MarkingBounds, x: number, z: number): boolean {
  return x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
}

/** Trait de s0 à s1 le long de l'arête, à la distance d de l'axe (droite positive), large de w. */
function strokeAlong(pts: ArrayLike<number>, s0: number, s1: number, d: number, w: number, kind: number, sink: MarkingSink): void {
  const p = pointAlong(pts, s0);
  const ax = p.x, az = p.z, arx = -p.uz, arz = p.ux;
  const q = pointAlong(pts, s1);
  const bx = q.x, bz = q.z, brx = -q.uz, brz = q.ux;
  const lo = d - w / 2, hi = d + w / 2;
  sink.quad(ax + arx * lo, az + arz * lo, ax + arx * hi, az + arz * hi, bx + brx * hi, bz + brz * hi, bx + brx * lo, bz + brz * lo, kind);
}

/** Ligne (continue ou en tirets) entre les abscisses s0 et s1 ; ne garde que les éléments centrés dans `bounds`. */
function lineAlong(
  pts: ArrayLike<number>, s0: number, s1: number, d: number, w: number, dashed: boolean, kind: number, bounds: MarkingBounds, sink: MarkingSink,
): void {
  if (dashed) {
    // Motif calé sur l'origine de l'arête.
    for (let s = Math.ceil(s0 / DASH_PERIOD) * DASH_PERIOD; s + DASH_LENGTH <= s1; s += DASH_PERIOD) {
      const c = pointAlong(pts, s + DASH_LENGTH / 2);
      if (!inside(bounds, c.x - c.uz * d, c.z + c.ux * d)) continue;
      strokeAlong(pts, s, s + DASH_LENGTH, d, w, kind, sink);
    }
    return;
  }
  const STEP = 4;
  for (let s = Math.floor(s0 / STEP) * STEP; s < s1; s += STEP) {
    const a = Math.max(s, s0), b = Math.min(s + STEP, s1);
    if (b - a < 0.05) continue;
    const c = pointAlong(pts, (a + b) / 2);
    if (!inside(bounds, c.x - c.uz * d, c.z + c.ux * d)) continue;
    strokeAlong(pts, a, b, d, w, kind, sink);
  }
}

/**
 * Lignes de voies d'une arête : axe entre les deux sens, séparateurs de voies, couloir de bus sur
 * les grands axes à trois voies et plus par sens. Retourne le nombre de lignes tracées.
 */
export function edgeLines(graph: RoadGraph, edgeId: number, bounds: MarkingBounds, sink: MarkingSink): number {
  const ed = graph.edges[edgeId];
  if (ed === undefined || !hasLaneLines(ed)) return 0;
  const lf = Math.max(0, ed.lanesForward), lb = ed.oneway ? 0 : Math.max(0, ed.lanesBackward);
  const lanes = lf + lb;
  const s0 = setbackAt(graph, edgeId, ed.a), s1 = ed.length - setbackAt(graph, edgeId, ed.b);
  if (s1 - s0 < 6) return 0;
  const W = ed.width, lw = W / lanes;
  const pts = ed.points;
  // Position de la séparation entre les deux sens (d > 0 : côté du sens a → b).
  const mid = W / 2 - lf * lw;
  let count = 0;
  if (lf > 0 && lb > 0) {
    lineAlong(pts, s0, s1, mid, LINE_WIDTH, lanes === 2, MARK_LINE, bounds, sink);
    count++;
  }
  const major = ed.roadClass === 'primary' || ed.roadClass === 'secondary';
  for (let k = 1; k < lf; k++) {
    const bus = major && lf >= 3 && k === lf - 1;
    lineAlong(pts, s0, s1, mid + k * lw, bus ? BUS_LINE_WIDTH : LINE_WIDTH, !bus, bus ? MARK_BUS_LINE : MARK_LINE, bounds, sink);
    count++;
    if (bus) busGlyphs(pts, s0, s1, W / 2 - lw / 2, false, bounds, sink);
  }
  for (let k = 1; k < lb; k++) {
    const bus = major && lb >= 3 && k === lb - 1;
    lineAlong(pts, s0, s1, mid - k * lw, bus ? BUS_LINE_WIDTH : LINE_WIDTH, !bus, bus ? MARK_BUS_LINE : MARK_LINE, bounds, sink);
    count++;
    if (bus) busGlyphs(pts, s0, s1, -W / 2 + lw / 2, true, bounds, sink);
  }
  return count;
}

function busGlyphs(pts: ArrayLike<number>, s0: number, s1: number, d: number, reverse: boolean, bounds: MarkingBounds, sink: MarkingSink): void {
  for (let s = Math.ceil((s0 + 12) / 90) * 90; s < s1 - 10; s += 90) {
    const c = pointAlong(pts, s);
    const x = c.x - c.uz * d, z = c.z + c.ux * d;
    if (!inside(bounds, x, z)) continue;
    sink.glyph(x, z, Math.atan2(reverse ? -c.ux : c.ux, reverse ? -c.uz : c.uz), GLYPH_BUS);
  }
}

/**
 * Bandes d'un passage piéton centré en (cx, cz) sur une chaussée de direction (ux, uz), qui s'étend
 * de `left` mètres à gauche à `right` mètres à droite de l'axe. Retourne le nombre de bandes.
 */
export function crosswalk(cx: number, cz: number, ux: number, uz: number, left: number, right: number, sink: MarkingSink): number {
  const vx = -uz, vz = ux;
  const from = -left + ZEBRA_MARGIN, to = right - ZEBRA_MARGIN;
  const span = to - from;
  if (span < ZEBRA_BAND) return 0;
  // Nombre entier de bandes, réparties de façon symétrique entre les deux bordures.
  const n = Math.max(1, Math.floor((span + (ZEBRA_PERIOD - ZEBRA_BAND)) / ZEBRA_PERIOD));
  const used = n * ZEBRA_PERIOD - (ZEBRA_PERIOD - ZEBRA_BAND);
  const start = from + (span - used) / 2;
  const h = ZEBRA_LENGTH / 2;
  for (let k = 0; k < n; k++) {
    const d0 = start + k * ZEBRA_PERIOD, d1 = d0 + ZEBRA_BAND;
    sink.quad(
      cx + vx * d0 - ux * h, cz + vz * d0 - uz * h, cx + vx * d1 - ux * h, cz + vz * d1 - uz * h,
      cx + vx * d1 + ux * h, cz + vz * d1 + uz * h, cx + vx * d0 + ux * h, cz + vz * d0 + uz * h, MARK_CROSSWALK,
    );
  }
  return n;
}

const NO_PROBE: MarkingProbe = { roadExtent: (_x, _z, _vx, _vz, fallback) => fallback };

/** Point et direction d'une arête à la distance `dist` d'un de ses nœuds ; la direction pointe VERS le nœud. */
function towardNode(ed: RoadEdge, node: number, dist: number): { x: number; z: number; ux: number; uz: number } {
  if (ed.b === node) return pointAlong(ed.points, ed.length - dist);
  const p = pointAlong(ed.points, dist);
  p.ux = -p.ux;
  p.uz = -p.uz;
  return p;
}

/**
 * Marquages d'un nœud : passage(s) piéton(s) s'il est « crossing », ligne(s) d'arrêt s'il est à
 * feux. En pleine voie (une ou deux chaussées), un seul passage au nœud ; à un carrefour, un passage
 * en retrait sur chaque branche. Retourne le nombre de quadrilatères produits.
 */
export function nodeMarkings(graph: RoadGraph, node: number, sink: MarkingSink, probe: MarkingProbe = NO_PROBE): number {
  const nd = graph.nodes[node];
  if (nd === undefined || (!nd.crossing && !nd.signal)) return 0;
  const deg = carriageDegree(graph, node);
  if (deg === 0) return 0;
  let count = 0;
  let zebraAtNode = false;
  for (let k = 0; k < nd.edges.length; k++) {
    const edgeId = nd.edges[k];
    const ed = graph.edges[edgeId];
    if (!isCarriage(ed) || ed.length < 4) continue;
    const half = ed.width / 2;
    const back = setbackAt(graph, edgeId, node);
    if (nd.crossing) {
      if (deg >= 3) {
        const p = towardNode(ed, node, Math.max(ZEBRA_LENGTH / 2, back - ZEBRA_LENGTH / 2 - 0.3));
        const px = p.x, pz = p.z, ux = p.ux, uz = p.uz;
        const left = probe.roadExtent(px, pz, uz, -ux, half), right = probe.roadExtent(px, pz, -uz, ux, half);
        count += crosswalk(px, pz, ux, uz, left, right, sink);
      } else if (!zebraAtNode) {
        zebraAtNode = true;
        const p = towardNode(ed, node, 0);
        const ux = p.ux, uz = p.uz;
        const left = probe.roadExtent(nd.x, nd.z, uz, -ux, half), right = probe.roadExtent(nd.x, nd.z, -uz, ux, half);
        count += crosswalk(nd.x, nd.z, ux, uz, left, right, sink);
      }
    }
    if (nd.signal) {
      // Voies qui ARRIVENT au nœud par cette arête.
      const arriving = ed.b === node ? ed.lanesForward : ed.oneway ? 0 : ed.lanesBackward;
      if (arriving <= 0) continue;
      const lanes = Math.max(1, ed.lanesForward + (ed.oneway ? 0 : ed.lanesBackward));
      const dist = (deg >= 3 ? back : nd.crossing ? ZEBRA_LENGTH / 2 + 0.4 : 0) + 0.7;
      if (ed.length < dist + 2) continue;
      const p = towardNode(ed, node, dist);
      const px = p.x, pz = p.z, ux = p.ux, uz = p.uz;
      // Dans le sens de la marche, les voies qui arrivent sont à droite de la séparation des sens.
      const rx = -uz, rz = ux;
      const right = probe.roadExtent(px, pz, rx, rz, half);
      const from = lanes === arriving ? -probe.roadExtent(px, pz, -rx, -rz, half) : right - (arriving * ed.width) / lanes;
      const h = STOP_LINE_WIDTH / 2;
      sink.quad(
        px + rx * from - ux * h, pz + rz * from - uz * h, px + rx * right - ux * h, pz + rz * right - uz * h,
        px + rx * right + ux * h, pz + rz * right + uz * h, px + rx * from + ux * h, pz + rz * from + uz * h, MARK_STOP,
      );
      count++;
    }
  }
  return count;
}

/**
 * Tous les marquages d'une tuile : lignes des arêtes données (parties situées dans `bounds`) et
 * marquages des nœuds situés dans `bounds`.
 */
export function tileMarkings(
  graph: RoadGraph, edgeIds: readonly number[], bounds: MarkingBounds, sink: MarkingSink, probe: MarkingProbe = NO_PROBE,
): void {
  const seen = new Set<number>();
  for (let k = 0; k < edgeIds.length; k++) {
    const ed = graph.edges[edgeIds[k]];
    if (ed === undefined) continue;
    edgeLines(graph, edgeIds[k], bounds, sink);
    for (let q = 0; q < 2; q++) {
      const n = q === 0 ? ed.a : ed.b;
      if (seen.has(n)) continue;
      seen.add(n);
      const nd = graph.nodes[n];
      if (nd !== undefined && inside(bounds, nd.x, nd.z)) nodeMarkings(graph, n, sink, probe);
    }
  }
}
