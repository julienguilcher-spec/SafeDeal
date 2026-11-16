/* =====================================================================================
 * VILLE EN 3D — grille de surfaces d'une tuile (logique pure).
 * -------------------------------------------------------------------------------------
 * Les polygones de la carte se recouvrent largement (îlot sous trottoir, place sous chaussée,
 * parc sous allée…) : l'ordre du tableau `surfaces` est l'ordre de superposition. Pour ne jamais
 * dessiner deux surfaces l'une sur l'autre (scintillement), la tuile est d'abord « aplatie » :
 * une grille n × n dont chaque cellule porte la classe de la surface du dessus. Cette grille
 *   - devient la texture qui dit à la nappe de base quel revêtement dessiner en chaque point ;
 *   - sert aux décisions de construction (bordure seulement face à une chaussée, grille d'arbre
 *     seulement sur un sol dur, largeur réelle d'un passage piéton, piles de pont dans l'eau) ;
 *   - donne la texture de couleurs de la vue lointaine.
 * Ordre de peinture (le même que la grille de la simulation, src/world/query/surfaces.ts) :
 * surfaces de la carte, voies piétonnes du graphe, chaussées du graphe là où la carte n'a rien,
 * pavés le long des arêtes pavées, tabliers des ponts.
 * ===================================================================================== */

import { TILE_SIZE } from '../mapdata';
import type { RoadEdge, RoadGraph, Surface, Tile } from '../mapdata';
import {
  CLASS_COLOR, CL_ASPHALT, CL_DEFAULT, CL_GRASS, CL_PLAZA, CL_SETT, CL_SIDEWALK, CL_SOIL, CL_STABILISE, CL_WATER, CODE_CLASS_MASK, CODE_DECK,
  CODE_NOT_FLUSH, CODE_OVER_WATER, CODE_WATER, CURB_HEIGHT, PARKING_LIFT, PLANTED_LIFT, SPORT_LIFT, isGreen, styleOfSurface,
} from './classes';
import type { SurfaceStyle } from './classes';

/**
 * Cellule que rien n'a peinte : en ville, ce qui n'est rien d'autre est de l'espace public piéton.
 * Elle garde ce code (CL_DEFAULT) et se dessine comme un dallage de trottoir au niveau de la chaussée.
 */
const CODE_UNSET = CL_DEFAULT;

export interface TileRaster {
  /** Cellules par côté. */
  readonly n: number;
  /** Côté d'une cellule (m). */
  readonly cell: number;
  readonly ox: number;
  readonly oz: number;
  /** n × n codes : classe (5 bits) | CODE_DECK | CODE_NOT_FLUSH. Ligne j = z croissant. */
  readonly codes: Uint8Array;
  /** Par surface de la tuile : style retenu. */
  styles: SurfaceStyle[];
  /** Par surface de la tuile : 1 si elle sert de tablier de pont (surface dure qui recouvre l'eau). */
  deck: Uint8Array;
  /** La tuile contient de l'eau. */
  hasWater: boolean;
  /** Tabliers de repli : quadrilatères [x0,z0,…,x3,z3, classe, surélévation] des ponts sans emprise fournie. */
  ribbons: number[];
}

export function createRaster(tx: number, tz: number, n: number): TileRaster {
  return {
    n, cell: TILE_SIZE / n, ox: tx * TILE_SIZE, oz: tz * TILE_SIZE, codes: new Uint8Array(n * n), styles: [], deck: new Uint8Array(0),
    hasWater: false, ribbons: [],
  };
}

/** Code de la cellule qui contient le point (bords ramenés dans la grille). */
export function codeAt(r: TileRaster, x: number, z: number): number {
  let i = Math.floor((x - r.ox) / r.cell), j = Math.floor((z - r.oz) / r.cell);
  if (i < 0) i = 0; else if (i >= r.n) i = r.n - 1;
  if (j < 0) j = 0; else if (j >= r.n) j = r.n - 1;
  return r.codes[j * r.n + i];
}

/** Classe de revêtement d'un code (sans les bits d'état ; le sol par défaut est un dallage de trottoir). */
export function classOfCode(code: number): number {
  const cls = code & CODE_CLASS_MASK;
  return cls === CL_DEFAULT ? CL_SIDEWALK : cls;
}

/** Classe de revêtement au point. */
export function classAt(r: TileRaster, x: number, z: number): number {
  return classOfCode(codeAt(r, x, z));
}

/** Surélévation (m) du sol dessiné, d'après le code de la cellule (trottoir, parking, pelouse…). */
export function liftOfCode(code: number): number {
  if ((code & CODE_NOT_FLUSH) === 0 || code === CODE_WATER) return 0;
  const cls = code & CODE_CLASS_MASK;
  if (cls === CL_SIDEWALK) return CURB_HEIGHT;
  if ((code & CODE_DECK) !== 0) return 0;
  if (cls === CL_GRASS || cls === CL_SOIL) return PLANTED_LIFT;
  if (cls === CL_STABILISE) return SPORT_LIFT;
  if (cls === CL_ASPHALT) return PARKING_LIFT;
  return CURB_HEIGHT;
}

// ─────────────────────────────── remplissage ───────────────────────────────

/** Règles de peinture : comment une cellule réagit à un nouveau code (voir applyRule). */
export const RULE_SET = 0;        // écrit le code
export const RULE_GREEN = 1;      // écrit `alt` au lieu du code si la cellule est un espace vert au niveau du sol
export const RULE_DECK = 2;       // tablier : respecte les surfaces surélevées voisines, retient l'eau du dessous
export const RULE_FOOT = 3;       // allée : stabilisé, seulement sur un espace vert au niveau du sol
export const RULE_FLUSH_TO = 4;   // voie piétonne : classe `code` sur tout sol au niveau de la chaussée, hors chaussée
export const RULE_ROAD_WEAK = 5;  // chaussée du graphe : seulement là où la carte ne dit rien (ou une place)
export const RULE_ROAD_FULL = 6;  // chaussée du graphe : partout sauf sur l'eau
export const RULE_SETT = 7;       // pavés : seulement sur de l'enrobé, en gardant les bits d'état

/** Nouveau code d'une cellule (ou -1 pour ne rien changer). Fonction unique : le moteur JavaScript la met en ligne. */
function applyRule(rule: number, code: number, alt: number, cur: number): number {
  switch (rule) {
    case RULE_SET:
      return code;
    case RULE_GREEN:
      return (cur & CODE_NOT_FLUSH) === 0 && isGreen(cur & CODE_CLASS_MASK) ? alt : code;
    case RULE_DECK:
      if (cur === CODE_WATER || (cur & CODE_OVER_WATER) !== 0) return code | CODE_OVER_WATER;
      if ((cur & CODE_NOT_FLUSH) !== 0 && (cur & CODE_DECK) === 0) return -1;
      return code;
    case RULE_FOOT:
      return (cur & CODE_NOT_FLUSH) === 0 && isGreen(cur & CODE_CLASS_MASK) ? CL_STABILISE : -1;
    case RULE_FLUSH_TO: {
      if ((cur & CODE_NOT_FLUSH) !== 0) return -1;
      const c = cur & CODE_CLASS_MASK;
      if (c === CL_ASPHALT || c === CL_SETT) return -1;
      return isGreen(c) && code === CL_PLAZA ? CL_STABILISE : code;
    }
    case RULE_ROAD_WEAK:
      return cur === CODE_UNSET || cur === CL_PLAZA ? CL_ASPHALT : -1;
    case RULE_ROAD_FULL:
      return cur === CODE_WATER ? -1 : CL_ASPHALT;
    case RULE_SETT:
      return (cur & CODE_CLASS_MASK) === CL_ASPHALT ? (cur & ~CODE_CLASS_MASK) | CL_SETT : -1;
    default:
      return -1;
  }
}

let crossings = new Float64Array(128);

/**
 * Remplit un polygone (anneau extérieur + trous, règle de parité, centres de cellules), sur les
 * lignes rowFrom..rowTo de la grille (pour étaler un grand polygone sur plusieurs images).
 * Retourne la dernière ligne que le polygone peut toucher.
 */
export function fillRings(
  r: TileRaster, rings: readonly ArrayLike<number>[], code: number, rule = RULE_SET, alt = 0, rowFrom = 0, rowTo = 1e9,
): number {
  let minZ = Infinity, maxZ = -Infinity, edges = 0;
  for (let q = 0; q < rings.length; q++) {
    const ring = rings[q];
    edges += ring.length >> 1;
    for (let i = 1; i < ring.length; i += 2) {
      if (ring[i] < minZ) minZ = ring[i];
      if (ring[i] > maxZ) maxZ = ring[i];
    }
  }
  if (edges < 3) return -1;
  if (crossings.length < edges) crossings = new Float64Array(edges * 2);
  const xs = crossings;
  const n = r.n, inv = 1 / r.cell, codes = r.codes;
  const last = Math.min(n - 1, Math.floor((maxZ - r.oz) * inv - 0.5));
  const j0 = Math.max(0, rowFrom, Math.ceil((minZ - r.oz) * inv - 0.5)), j1 = Math.min(last, rowTo);
  for (let j = j0; j <= j1; j++) {
    const z = r.oz + (j + 0.5) * r.cell;
    let m = 0;
    for (let q = 0; q < rings.length; q++) {
      const ring = rings[q];
      const count = ring.length >> 1;
      for (let a = 0, b = count - 1; a < count; b = a++) {
        const za = ring[2 * a + 1], zb = ring[2 * b + 1];
        if (za > z === zb > z) continue;
        const xa = ring[2 * a], xb = ring[2 * b];
        const x = xa + ((z - za) * (xb - xa)) / (zb - za);
        let k = m++;
        while (k > 0 && xs[k - 1] > x) {
          xs[k] = xs[k - 1];
          k--;
        }
        xs[k] = x;
      }
    }
    const row = j * n;
    for (let k = 0; k + 1 < m; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - r.ox) * inv - 0.5)), i1 = Math.min(n - 1, Math.ceil((xs[k + 1] - r.ox) * inv - 0.5) - 1);
      if (i1 < i0) continue;
      if (rule === RULE_SET) {
        codes.fill(code, row + i0, row + i1 + 1);
        continue;
      }
      for (let i = row + i0, end = row + i1; i <= end; i++) {
        const next = applyRule(rule, code, alt, codes[i]);
        if (next >= 0) codes[i] = next;
      }
    }
  }
  return last;
}

/** Peint un segment épaissi (rayon `rad`, bouts arrondis) selon une règle (voir applyRule). */
export function paintCapsule(r: TileRaster, ax: number, az: number, bx: number, bz: number, rad: number, rule: number, code: number): void {
  const n = r.n, inv = 1 / r.cell, codes = r.codes;
  const j0 = Math.max(0, Math.ceil((Math.min(az, bz) - rad - r.oz) * inv - 0.5)), j1 = Math.min(n - 1, Math.floor((Math.max(az, bz) + rad - r.oz) * inv - 0.5));
  if (j0 > j1) return;
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const il = len2 > 0 ? 1 / len2 : 0;
  const r2 = rad * rad;
  const flatSeg = Math.abs(dz) < 1e-6;
  for (let j = j0; j <= j1; j++) {
    const zr = r.oz + (j + 0.5) * r.cell;
    // Portion du segment à moins de `rad` (en z) de la ligne : borne les colonnes à parcourir.
    let t0 = 0, t1 = 1;
    if (!flatSeg) {
      const ta = (zr - rad - az) / dz, tb = (zr + rad - az) / dz;
      t0 = Math.min(ta, tb);
      t1 = Math.max(ta, tb);
      if (t0 < 0) t0 = 0; else if (t0 > 1) t0 = 1;
      if (t1 < 0) t1 = 0; else if (t1 > 1) t1 = 1;
    }
    const xa = ax + dx * t0, xb = ax + dx * t1;
    const i0 = Math.max(0, Math.ceil((Math.min(xa, xb) - rad - r.ox) * inv - 0.5)), i1 = Math.min(n - 1, Math.floor((Math.max(xa, xb) + rad - r.ox) * inv - 0.5));
    const pz = zr - az;
    const row = j * n;
    for (let i = i0; i <= i1; i++) {
      const px = r.ox + (i + 0.5) * r.cell - ax;
      let t = (px * dx + pz * dz) * il;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = px - dx * t, ez = pz - dz * t;
      if (ex * ex + ez * ez > r2) continue;
      const next = applyRule(rule, code, 0, codes[row + i]);
      if (next >= 0) codes[row + i] = next;
    }
  }
}

/** Peint une polyligne épaissie en rendant la main dès que le travail accumulé dépasse ~80 000 cellules. */
function* paintPolylineSteps(r: TileRaster, pts: ArrayLike<number>, rad: number, rule: number, code: number, work: { cells: number }): Generator<void, void, void> {
  const inv2 = 1 / (r.cell * r.cell);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    // Ne coûte que ce qui tombe dans la tuile (à peu près).
    if (Math.max(ax, bx) + rad < r.ox || Math.min(ax, bx) - rad > r.ox + TILE_SIZE || Math.max(az, bz) + rad < r.oz || Math.min(az, bz) - rad > r.oz + TILE_SIZE) continue;
    // Un long segment très large est peint par tronçons, pour pouvoir s'arrêter entre deux.
    const len = Math.hypot(bx - ax, bz - az);
    const parts = Math.max(1, Math.ceil(len / Math.max(16, 3 * rad)));
    for (let k = 0; k < parts; k++) {
      const t0 = k / parts, t1 = (k + 1) / parts;
      paintCapsule(r, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, rad, rule, code);
      work.cells += (len / parts + 2 * rad) * 2 * rad * inv2 + 200;
      if (work.cells > 80000) {
        work.cells = 0;
        yield;
      }
    }
  }
}

function ringsOf(s: Surface): ArrayLike<number>[] {
  return s.holes.length === 0 ? [s.outer] : [s.outer, ...s.holes];
}

const HARD_KINDS: ReadonlySet<string> = new Set(['road', 'sidewalk', 'median', 'pedestrian', 'plaza']);

/** Un côté de la surface passe-t-il au-dessus de l'eau ? (trois sondes par côté, comme la simulation) */
function overlapsWater(r: TileRaster, s: Surface): boolean {
  const rings = ringsOf(s);
  for (let q = 0; q < rings.length; q++) {
    const ring = rings[q];
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[2 * j], az = ring[2 * j + 1], bx = ring[2 * i], bz = ring[2 * i + 1];
      for (let k = 1; k <= 3; k++) {
        if (codeAt(r, ax + ((bx - ax) * k) / 4, az + ((bz - az) * k) / 4) === CODE_WATER) return true;
      }
    }
  }
  return false;
}

/** Demi-largeur du tablier d'une arête de pont : chaussée + trottoirs (même règle que la simulation). */
export function halfDeckOf(edge: RoadEdge): number {
  return Math.max(1.5, edge.width / 2 + edge.sidewalk);
}

/**
 * Y a-t-il dans la tuile une surface au sol placée APRÈS une surface surélevée dans l'ordre de
 * superposition (elle la recouvre) ? Jamais dans la carte de Paris ; possible avec d'autres ordres.
 */
export function flushOverRaised(tile: Tile): boolean {
  let afterRoad = false, raised = false;
  for (let i = 0; i < tile.surfaces.length; i++) {
    const kind = tile.surfaces[i].kind;
    const style = styleOfSurface(kind, afterRoad);
    if (kind === 'road' || kind === 'sidewalk' || kind === 'median') afterRoad = true;
    if (kind === 'water') continue;
    if (style.raised) raised = true;
    else if (raised) return true;
  }
  return false;
}

/**
 * Rasterise une tuile, par étapes (le générateur rend la main entre deux lots de polygones pour
 * que la construction puisse être étalée sur plusieurs images).
 * @param edgeIds arêtes du graphe à prendre en compte (celles de la tuile et de ses abords)
 */
export function* rasterSteps(r: TileRaster, tile: Tile, graph: RoadGraph, edgeIds: readonly number[]): Generator<void, void, void> {
  const codes = r.codes;
  codes.fill(CODE_UNSET);
  const surfaces = tile.surfaces;
  r.styles = new Array<SurfaceStyle>(surfaces.length);
  r.deck = new Uint8Array(surfaces.length);
  r.ribbons.length = 0;
  // Un polygone est peint par bandes de lignes : au plus ~100 000 cellules entre deux pauses.
  const band = Math.max(32, Math.round(100000 / r.n));
  // 1. Surfaces de la carte, dans leur ordre de superposition.
  let afterRoad = false, explicitRoads = false, hasWater = false;
  let work = 0;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    const style = styleOfSurface(s.kind, afterRoad);
    r.styles[i] = style;
    if (s.kind === 'road') explicitRoads = true;
    if (s.kind === 'road' || s.kind === 'sidewalk' || s.kind === 'median') afterRoad = true;
    let code = style.cls, rule = RULE_SET, alt = 0;
    if (s.kind === 'water') {
      hasWater = true;
      code = CODE_WATER;
    } else if (style.raised) {
      code = style.cls | CODE_NOT_FLUSH;
    } else if (style.clsOnGreen >= 0) {
      rule = RULE_GREEN;
      alt = style.clsOnGreen;
    }
    const rings = ringsOf(s);
    let minZ = Infinity;
    for (let k = 1; k < s.outer.length; k += 2) if (s.outer[k] < minZ) minZ = s.outer[k];
    for (let from = Math.max(0, Math.floor((minZ - r.oz) / r.cell)); ; from += band) {
      const last = fillRings(r, rings, code, rule, alt, from, from + band - 1);
      work += 40 + s.outer.length;
      if (from + band > last) break;
      yield;
    }
    if (work > 1200) {
      work = 0;
      yield;
    }
  }
  r.hasWater = hasWater;
  const cap = { cells: 0 };
  yield;
  // 2. Voies piétonnes du graphe : allées de jardin en stabilisé, rues piétonnes dallées.
  for (let k = 0; k < edgeIds.length; k++) {
    const ed = graph.edges[edgeIds[k]];
    if (ed === undefined || ed.tunnel || ed.bridge || !ed.pedestrianOnly) continue;
    const rad = Math.max(0.75, ed.width / 2);
    if (ed.surface === 'sett') yield* paintPolylineSteps(r, ed.points, rad, RULE_FLUSH_TO, CL_SETT, cap);
    else if (ed.surface === 'gravel') yield* paintPolylineSteps(r, ed.points, rad, RULE_FLUSH_TO, CL_STABILISE, cap);
    else if (ed.roadClass === 'pedestrian') yield* paintPolylineSteps(r, ed.points, rad, RULE_FLUSH_TO, CL_PLAZA, cap);
    else yield* paintPolylineSteps(r, ed.points, rad, RULE_FOOT, 0, cap);
  }
  yield;
  // 3. Chaussées du graphe : la carte fait foi si elle fournit les emprises ; l'arête ne comble que les zones sans information.
  for (let k = 0; k < edgeIds.length; k++) {
    const ed = graph.edges[edgeIds[k]];
    if (ed === undefined || ed.tunnel || ed.bridge || ed.pedestrianOnly) continue;
    yield* paintPolylineSteps(r, ed.points, ed.width / 2, explicitRoads ? RULE_ROAD_WEAK : RULE_ROAD_FULL, 0, cap);
  }
  yield;
  // 4. Tabliers : surfaces dures de la carte qui recouvrent l'eau.
  if (hasWater) {
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (!HARD_KINDS.has(s.kind) || !overlapsWater(r, s)) continue;
      r.deck[i] = 1;
    }
    yield;
    for (let i = 0; i < surfaces.length; i++) {
      if (r.deck[i] === 0) continue;
      fillRings(r, ringsOf(surfaces[i]), r.styles[i].cls | CODE_DECK | CODE_NOT_FLUSH, RULE_DECK);
      yield;
    }
  }
  // 5. Ponts sans emprise fournie (convention du format : le tablier vient de l'arête) : rubans de repli.
  for (let k = 0; k < edgeIds.length; k++) {
    const ed = graph.edges[edgeIds[k]];
    if (ed === undefined || ed.tunnel || !ed.bridge) continue;
    buildRibbons(r, ed);
  }
  yield;
  // 6. Pavés : connus du seul graphe, reportés sur les chaussées le long des arêtes pavées.
  for (let k = 0; k < edgeIds.length; k++) {
    const ed = graph.edges[edgeIds[k]];
    if (ed === undefined || ed.tunnel || ed.surface !== 'sett' || ed.pedestrianOnly) continue;
    yield* paintPolylineSteps(r, ed.points, ed.width / 2 + 4, RULE_SETT, 0, cap);
  }
}

/** Rasterisation d'un seul tenant (vue lointaine, tests). */
export function rasterizeTile(r: TileRaster, tile: Tile, graph: RoadGraph, edgeIds: readonly number[]): TileRaster {
  const it = rasterSteps(r, tile, graph, edgeIds);
  while (!it.next().done) { /* tout d'un coup */ }
  return r;
}

/**
 * Ruban de repli d'une arête de pont : si moins de la moitié de son axe (dans la tuile) est déjà
 * couverte par un tablier de la carte, la chaussée et les deux trottoirs sont générés segment par
 * segment (quadrilatères convexes, découpés ensuite par le maillage) et peints dans la grille.
 */
function buildRibbons(r: TileRaster, ed: RoadEdge): void {
  const pts = ed.points;
  const maxX = r.ox + TILE_SIZE, maxZ = r.oz + TILE_SIZE;
  let inside = 0, covered = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 4));
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps, z = az + ((bz - az) * s) / steps;
      if (x < r.ox || x >= maxX || z < r.oz || z >= maxZ) continue;
      inside++;
      if ((codeAt(r, x, z) & CODE_DECK) !== 0) covered++;
    }
  }
  if (inside === 0 || covered * 2 >= inside) return;
  const halfRoad = Math.max(1, ed.width / 2);
  const half = halfDeckOf(ed);
  const sett = ed.surface === 'sett';
  const roadCls = ed.pedestrianOnly ? (sett ? CL_SETT : CL_PLAZA) : sett ? CL_SETT : CL_ASPHALT;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    // Léger recouvrement aux coudes pour ne pas laisser de coin ouvert.
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const ext = i + 3 < pts.length ? Math.min(half, 3) * 0.5 : 0;
    const ex = bx + ux * ext, ez = bz + uz * ext;
    const nx = -uz, nz = ux;
    const push = (d0: number, d1: number, cls: number, lift: number): void => {
      // Sens antihoraire « vu de dessus » (la matière à gauche de chaque côté).
      r.ribbons.push(
        ax + nx * d0, az + nz * d0, ax + nx * d1, az + nz * d1, ex + nx * d1, ez + nz * d1, ex + nx * d0, ez + nz * d0, cls, lift,
      );
      const ring = [ax + nx * d0, az + nz * d0, ax + nx * d1, az + nz * d1, ex + nx * d1, ez + nz * d1, ex + nx * d0, ez + nz * d0];
      fillRings(r, [ring], cls | CODE_DECK | CODE_NOT_FLUSH, RULE_DECK);
    };
    push(-halfRoad, halfRoad, roadCls, 0);
    if (half > halfRoad + 0.3) {
      push(halfRoad, half, CL_SIDEWALK, CURB_HEIGHT);
      push(-half, -halfRoad, CL_SIDEWALK, CURB_HEIGHT);
    }
  }
}

// ─────────────────────────────── vue lointaine ───────────────────────────────

/**
 * Texture de couleurs d'une tuile vue de loin : `size` × `size` pixels RVBA (sRGB). Alpha = 0 sur
 * l'eau (le shader y met le reflet du ciel), 255 ailleurs. Chaque pixel prend la classe majoritaire
 * de quatre sondes. `palette` : couleur de chaque classe (par défaut CLASS_COLOR).
 */
export function bakeMacro(
  r: TileRaster, size: number, out?: Uint8Array, palette: readonly (readonly [number, number, number])[] = CLASS_COLOR,
): Uint8Array {
  const px = out ?? new Uint8Array(size * size * 4);
  const n = r.n, codes = r.codes;
  const ratio = n / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let cr = 0, cg = 0, cb = 0, water = 0;
      for (let s = 0; s < 4; s++) {
        const fi = Math.min(n - 1, Math.floor((i + 0.25 + 0.5 * (s & 1)) * ratio));
        const fj = Math.min(n - 1, Math.floor((j + 0.25 + 0.5 * (s >> 1)) * ratio));
        const code = codes[fj * n + fi];
        const cls = code === CODE_WATER ? CL_WATER : classOfCode(code);
        if (cls === CL_WATER) water++;
        const c = palette[cls] ?? CLASS_COLOR[cls] ?? CLASS_COLOR[CL_SIDEWALK];
        cr += c[0];
        cg += c[1];
        cb += c[2];
      }
      const o = (j * size + i) * 4;
      px[o] = cr >> 2;
      px[o + 1] = cg >> 2;
      px[o + 2] = cb >> 2;
      px[o + 3] = water >= 2 ? 0 : 255;
    }
  }
  return px;
}

/** Proportion de cellules d'eau dans le rectangle de cellules [i0, i1] × [j0, j1] (bornes comprises, ramenées dans la grille). */
export function waterShare(r: TileRaster, i0: number, j0: number, i1: number, j1: number): number {
  const n = r.n;
  if (i0 < 0) i0 = 0;
  if (j0 < 0) j0 = 0;
  if (i1 >= n) i1 = n - 1;
  if (j1 >= n) j1 = n - 1;
  let water = 0, total = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      total++;
      if (r.codes[j * n + i] === CODE_WATER) water++;
    }
  }
  return total > 0 ? water / total : 0;
}
