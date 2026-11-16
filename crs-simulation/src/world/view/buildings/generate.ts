/* =====================================================================================
 * IMMEUBLES — génération des maillages d'une tuile (logique pure, sans Three.js)
 * -------------------------------------------------------------------------------------
 * generateTileMeshes()  : version détaillée (façades, balcons, corniches, toitures) dans deux
 *                         tampons : le maillage opaque principal et le maillage ajouré
 *                         (garde-corps, mitrons).
 * generateTileFarMesh() : version lointaine — prismes simplifiés teintés, sans mur caché.
 * Les deux respectent un budget de triangles : au-delà, le détail est réduit par paliers.
 * ===================================================================================== */

import type { QualityLevel } from '../../../core/contracts';
import type { Tile } from '../../mapdata';
import { CELL_BAY_M } from './layers';
import { STYLE_PARAMS, setVariationSeed, vhash } from './layout';
import { MeshData } from './meshdata';
import { WALL_FREE, neighborAt, prepareTile } from './prepare';
import type { PreparedTile } from './prepare';
import { hyp, ringArea, simplifyRing } from './rings';
import { SLATE_ROOF_SHARE, TILE_ROOF_SHARE, emitRoof } from './roofs';
import { triIndices, triangulate } from './triangulate';
import { BuildCtx, EdgeSet, chooseDoor, emitLedges, emitWalls } from './walls';
import type { DetailLevel } from './walls';

/** Budgets de triangles par tuile. */
export const DETAIL_TRIANGLE_BUDGET = 250000;
export const FAR_TRIANGLE_BUDGET = 15000;

export interface GenerateOptions {
  quality: QualityLevel;
  heightAt(x: number, z: number): number;
  skipLandmark(key: string): boolean;
  seed: number;
}

const SKIRT = 2;

/** Détail géométrique par qualité, du plus riche au plus pauvre. */
const DETAIL_STEPS: DetailLevel[] = [
  { balconies: true, cornices: true, dormers: true, chimneys: true, parapets: true, ends: true, domeSegments: 16, skirt: SKIRT },
  { balconies: true, cornices: true, dormers: false, chimneys: true, parapets: true, ends: false, domeSegments: 12, skirt: SKIRT },
  { balconies: true, cornices: false, dormers: false, chimneys: true, parapets: false, ends: false, domeSegments: 12, skirt: SKIRT },
  { balconies: false, cornices: false, dormers: false, chimneys: false, parapets: false, ends: false, domeSegments: 8, skirt: SKIRT },
];

/** Palier de détail de départ pour une qualité. */
export function detailStepFor(quality: QualityLevel): number {
  return quality === 'bas' ? 3 : quality === 'moyen' ? 1 : 0;
}

export function detailLevel(step: number): DetailLevel {
  return DETAIL_STEPS[step < 0 ? 0 : step > 3 ? 3 : step];
}

export interface TileMeshStats {
  /** Bâtiments dessinés. */
  buildings: number;
  /** Palier de détail finalement retenu (0 = le plus riche … 3 = le plus pauvre). */
  step: number;
  triangles: number;
}

const ctx = new BuildCtx();
const outerEdges = new EdgeSet();
const holeEdges = new EdgeSet();
/** Trame des façades sur cour. */
const COUR_PARAMS = STYLE_PARAMS.faubourg;

function emitAll(p: PreparedTile, detail: DetailLevel, main: MeshData, rail: MeshData): void {
  main.reset();
  rail.reset();
  const useRail = detail.balconies || detail.chimneys;
  for (let k = 0; k < p.count; k++) {
    ctx.begin(p, k, detail);
    const r0 = p.firstRing[k];
    const blank = ctx.allBlank || ctx.canopy;
    outerEdges.compute(p, r0, blank ? null : ctx.sp);
    if (!blank) chooseDoor(ctx, outerEdges);
    emitWalls(main, ctx, outerEdges, false);
    emitLedges(main, rail, ctx, outerEdges);
    for (let r = 1; r < p.ringCount[k]; r++) {
      holeEdges.compute(p, r0 + r, blank ? null : COUR_PARAMS);
      emitWalls(main, ctx, holeEdges, true);
    }
    emitRoof(main, useRail ? rail : null, ctx, outerEdges);
  }
}

/**
 * Génère les maillages détaillés d'une tuile dans `main` (opaque) et `rail` (ajouré).
 * Les positions sont LOCALES à la tuile (origine tx·512, tz·512).
 * @param budget  nombre maximal de triangles (les deux maillages réunis)
 */
export function generateTileMeshes(
  tile: Tile, opts: GenerateOptions, main: MeshData, rail: MeshData, budget: number = DETAIL_TRIANGLE_BUDGET,
): TileMeshStats {
  setVariationSeed(opts.seed);
  const p = prepareTile(tile, opts.heightAt, opts.skipLandmark, opts.seed, true);
  let step = detailStepFor(opts.quality);
  // réserve d'emblée la place probable (sommets par sommet d'emprise, mesuré sur Paris) : évite
  // d'agrandir les tampons par doublements successifs sur la première tuile dense
  const perVertex = step === 0 ? 46 : step === 1 ? 36 : 14;
  main.reset();
  main.ensure(p.nVerts * perVertex, p.nVerts * perVertex * 1.5);
  for (;;) {
    emitAll(p, DETAIL_STEPS[step], main, rail);
    if (main.triangles + rail.triangles <= budget || step >= DETAIL_STEPS.length - 1) break;
    step++;
  }
  return { buildings: p.count, step, triangles: main.triangles + rail.triangles };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Version lointaine
// ─────────────────────────────────────────────────────────────────────────────────────

/** Paliers de simplification : tolérance du contour (m), aire minimale d'un bâtiment (m²), aire minimale d'une cour conservée. */
const FAR_STEPS = [
  { tol: 1.2, minArea: 12, minHole: 220 },
  { tol: 2.5, minArea: 25, minHole: 600 },
  { tol: 4.0, minArea: 45, minHole: 1e9 },
  { tol: 6.5, minArea: 90, minHole: 1e9 },
  { tol: 10, minArea: 160, minHole: 1e9 },
];

let farSrc = new Float64Array(1024);
let farRings = new Float64Array(1024);
let farEnds = new Int32Array(16);

/** Indice de matériau de couverture pour le shader lointain : 0 zinc, 1 ardoise, 2 terrasse, 3 tuile. */
function farRoofKind(roof: string, id: number): number {
  if (roof === 'flat') return 2;
  if (roof === 'gabled') return vhash(id, 67) < TILE_ROOF_SHARE ? 3 : 0;
  return vhash(id, 61) < SLATE_ROOF_SHARE ? 1 : 0;
}

/** Couleur de façade vue de loin (0..1), par style. */
function farWallColor(m: MeshData, style: string, id: number): void {
  const a = vhash(id, 11), c = vhash(id, 23);
  if (style === 'haussmann' || style === 'monumental') {
    const l = 0.84 + 0.2 * a, w = (c - 0.45) * 0.09;
    m.tint(0.78 * l * (1 + w), 0.70 * l, 0.55 * l * (1 - w * 1.4));
  } else if (style === 'faubourg') {
    const l = 0.88 + 0.14 * a;
    m.tint(0.84 * l, 0.81 * l, (0.72 + 0.06 * c) * l);
  } else {
    const l = 0.8 + 0.24 * a;
    m.tint(0.66 * l, 0.68 * l, 0.69 * l);
  }
}

function emitFar(p: PreparedTile, stepIndex: number, out: MeshData): number {
  const step = FAR_STEPS[stepIndex];
  out.reset();
  const cs = p.coords;
  let drawn = 0;
  for (let k = 0; k < p.count; k++) {
    const b = p.building[k];
    if (p.area[k] < step.minArea && b.height < 14) continue;
    const r0 = p.firstRing[k];
    const n0 = p.ringLen[r0], s0 = p.ringStart[r0];
    let need = n0;
    for (let r = 1; r < p.ringCount[k]; r++) need += p.ringLen[r0 + r];
    if (farSrc.length < need * 2) { farSrc = new Float64Array(need * 4); farRings = new Float64Array(need * 4); }
    if (farEnds.length < p.ringCount[k]) farEnds = new Int32Array(p.ringCount[k] * 2);
    // anneau extérieur simplifié
    for (let i = 0; i < 2 * n0; i++) farSrc[i] = cs[2 * s0 + i];
    let total = simplifyRing(farSrc, n0, step.tol, farRings);
    if (total < 3) continue;
    let nr = 1;
    farEnds[0] = total;
    // grandes cours seulement
    for (let r = 1; r < p.ringCount[k]; r++) {
      const s = p.ringStart[r0 + r], n = p.ringLen[r0 + r];
      for (let i = 0; i < 2 * n; i++) farSrc[i] = cs[2 * s + i];
      if (Math.abs(ringArea(farSrc, n)) < step.minHole) continue;
      const sub = farRings.subarray(2 * total);
      const m = simplifyRing(farSrc, n, step.tol * 0.6, sub);
      if (m < 3) continue;
      total += m;
      farEnds[nr++] = total;
    }
    const y0 = p.baseY[k];
    const yFoot = y0 - 1, yTop = y0 + b.height;
    const wallH = p.wallH[k];
    const levels = 1 + p.nUpper[k];
    // v = 0 au pied, `levels` à l'égout ; au-dessus, le shader peint la couverture
    const vPerM = levels / Math.max(wallH, 0.5);
    const vFoot = -1 * vPerM, vTop = b.height * vPerM;
    const roofKind = farRoofKind(b.roof, b.id);
    const seed = (p.rand[k] * 256) | 0;
    farWallColor(out, b.kind === 'construction' || b.kind === 'industrial' || b.kind === 'parking' ? 'modern' : b.style, b.id);
    out.facade(levels, roofKind, seed, b.kind === 'roof' ? 1 : 0);
    const myTop = yTop;
    let start = 0;
    for (let r = 0; r < nr; r++) {
      const n = farEnds[r] - start;
      let cum = 0;
      for (let i = 0; i < n; i++) {
        const j = i + 1 < n ? i + 1 : 0;
        const ax = farRings[2 * (start + i)], az = farRings[2 * (start + i) + 1];
        const bx = farRings[2 * (start + j)], bz = farRings[2 * (start + j) + 1];
        const dx = bx - ax, dz = bz - az;
        const len = hyp(dx, dz);
        const u0 = cum / CELL_BAY_M;
        cum += len;
        if (len < 0.3) continue;
        const nx = -dz / len, nz = dx / len;
        // mur masqué par un voisin au moins aussi haut : inutile de loin
        const nb = neighborAt(p, ax + dx * 0.5 + nx * 0.6, az + dz * 0.5 + nz * 0.6, k);
        if (nb >= 0 && p.baseY[nb] + p.building[nb].height >= myTop - 1.5) {
          if (len < 6) continue;
          const nb2 = neighborAt(p, ax + dx * 0.2 + nx * 0.6, az + dz * 0.2 + nz * 0.6, k);
          const nb3 = neighborAt(p, ax + dx * 0.8 + nx * 0.6, az + dz * 0.8 + nz * 0.6, k);
          if (nb2 >= 0 && nb3 >= 0 && p.baseY[nb2] + p.building[nb2].height >= myTop - 1.5 && p.baseY[nb3] + p.building[nb3].height >= myTop - 1.5) continue;
        }
        out.nx = nx; out.ny = 0; out.nz = nz;
        const u1 = u0 + len / CELL_BAY_M;
        out.ensure(4, 6);
        out.shade = 0.8;
        const a = out.vertex(ax, yFoot, az, u0, vFoot);
        out.vertex(bx, yFoot, bz, u1, vFoot);
        out.shade = 1;
        out.vertex(bx, yTop, bz, u1, vTop);
        out.vertex(ax, yTop, az, u0, vTop);
        out.quadIdx(a, a + 1, a + 2, a + 3);
      }
      start = farEnds[r];
    }
    // couverture
    const nt = triangulate(farRings, farEnds, nr);
    if (nt > 0) {
      out.ensure(total, nt * 3);
      const base = out.nv;
      out.nx = 0; out.ny = 1; out.nz = 0;
      for (let i = 0; i < total; i++) out.vertex(farRings[2 * i], yTop, farRings[2 * i + 1], 0, levels + 0.5);
      for (let t = 0; t < nt; t++) out.tri(base + triIndices[3 * t], base + triIndices[3 * t + 1], base + triIndices[3 * t + 2]);
    }
    drawn++;
  }
  return drawn;
}

/**
 * Génère la version lointaine d'une tuile dans `out` : prismes aux contours simplifiés.
 * Attribut « façade » d'un sommet : (nombre de niveaux, matériau de couverture, graine, auvent).
 */
export function generateTileFarMesh(tile: Tile, opts: GenerateOptions, out: MeshData, budget: number = FAR_TRIANGLE_BUDGET): TileMeshStats {
  setVariationSeed(opts.seed);
  const p = prepareTile(tile, opts.heightAt, opts.skipLandmark, opts.seed, false);
  let step = opts.quality === 'bas' ? 1 : 0;
  let drawn = 0;
  for (;;) {
    drawn = emitFar(p, step, out);
    if (out.triangles <= budget || step >= FAR_STEPS.length - 1) break;
    step++;
  }
  return { buildings: drawn, step, triangles: out.triangles };
}

/** Nombre de murs libres d'une tuile préparée (diagnostic). */
export function countFreeWalls(p: PreparedTile): number {
  let n = 0;
  for (let i = 0; i < p.nVerts; i++) if (p.wall[i] === WALL_FREE) n++;
  return n;
}
