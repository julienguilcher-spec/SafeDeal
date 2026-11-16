/* =====================================================================================
 * IMMEUBLES — accessoires de toiture (logique pure)
 * -------------------------------------------------------------------------------------
 * Lucarnes en volume sur les brisis et souches de cheminées (avec leurs mitrons) sur les
 * murs mitoyens : ce qui découpe la silhouette des toits de Paris sur le ciel.
 * ===================================================================================== */

import { ALT_NONE, CELL_BAY_M, CELL_FLOOR_M, LAYER_LUCARNE_FACE, LAYER_SOUCHE, LAYER_SOUCHE_TOP, LAYER_ZINC_PLAT, NB_CONTINUOUS } from './layers';
import { vhash } from './layout';
import type { MeshData } from './meshdata';
import { WALL_FREE } from './prepare';
import { hyp } from './rings';
import { roofTint } from './roofs';
import type { BuildCtx, EdgeSet } from './walls';

/** Période (m) des mitrons le long d'une souche. */
export const POT_PERIOD_M = 0.7;

/**
 * Lucarnes en volume : une par travée des murs libres de l'anneau extérieur (6 triangles chacune).
 * `orig` : anneau extérieur du bâtiment (le contour de l'égout).
 */
export function emitDormers(m: MeshData, c: BuildCtx, es: EdgeSet, orig: Float64Array, yEave: number, rise: number, run: number): void {
  const n = es.count;
  const hb = rise * 0.24, ht = Math.min(rise * 0.86, hb + 1.6);
  const eb = (run * hb) / rise, et = (run * ht) / rise;      // recul du brisis en bas et en haut de la lucarne
  if (et - eb < 0.25 || ht - hb < 0.7) return;
  for (let i = 0; i < n; i++) {
    const nb = es.n[i];
    if (nb === 0 || es.flag[i] !== WALL_FREE) continue;
    const j = i + 1 < n ? i + 1 : 0;
    const ax = orig[2 * i], az = orig[2 * i + 1];
    const len = es.len[i];
    const dx = (orig[2 * j] - ax) / len, dz = (orig[2 * j + 1] - az) / len;
    const inx = -es.nx[i], inz = -es.nz[i];       // vers l'intérieur
    const w = es.w[i];
    const half = Math.min(0.62, w * 0.24);
    // travées de la façade dont l'axe tombe sur ce pan (une façade courbe s'étend sur plusieurs pans)
    const bFirst = Math.max(0, Math.ceil((es.off[i] - es.m[i]) / w - 0.5));
    for (let b = bFirst; b < nb; b++) {
      const t = es.m[i] + (b + 0.5) * w - es.off[i];
      if (t >= len) break;
      if (t < half || t > len - half) continue;        // trop près d'un pli : la lucarne dépasserait du pan
      const cx = ax + dx * t, cz = az + dz * t;
      // quatre coins de la face avant (plan vertical au recul eb), deux coins arrière (recul et)
      const lx = cx - dx * half + inx * eb, lz = cz - dz * half + inz * eb;
      const rx = cx + dx * half + inx * eb, rz = cz + dz * half + inz * eb;
      const blx = cx - dx * half + inx * et, blz = cz - dz * half + inz * et;
      const brx = cx + dx * half + inx * et, brz = cz + dz * half + inz * et;
      const y0 = yEave + hb, y1 = yEave + ht;
      // face avant : la cellule de lucarne entière
      m.tint(c.tr, c.tg, c.tb);
      m.facade(LAYER_LUCARNE_FACE, 1, c.seed + es.run[i] * 13 + b * 7 + 5, ALT_NONE);
      m.nx = es.nx[i]; m.ny = 0; m.nz = es.nz[i];
      m.quad(lx, y0, lz, 0.02, 0.02, rx, y0, rz, 0.98, 0.02, rx, y1, rz, 0.98, 0.98, lx, y1, lz, 0.02, 0.98);
      // dessus et joues en zinc
      roofTint(m, c, 0.95);
      m.facade(LAYER_ZINC_PLAT, NB_CONTINUOUS, 0, ALT_NONE);
      m.nx = 0; m.ny = 1; m.nz = 0;
      m.quad(lx, y1, lz, 0, 0, rx, y1, rz, 0.4, 0, brx, y1, brz, 0.4, 0.3, blx, y1, blz, 0, 0.3);
      m.ensure(6, 6);
      roofTint(m, c, 0.8);
      m.nx = -dx; m.ny = 0; m.nz = -dz;
      let a = m.vertex(lx, y0, lz, 0, 0);
      m.vertex(lx, y1, lz, 0, 0.3);
      m.vertex(blx, y1, blz, 0.3, 0.3);
      m.tri(a, a + 1, a + 2);
      m.nx = dx; m.ny = 0; m.nz = dz;
      a = m.vertex(rx, y0, rz, 0, 0);
      m.vertex(rx, y1, rz, 0, 0.3);
      m.vertex(brx, y1, brz, 0.3, 0.3);
      m.tri(a, a + 2, a + 1);
    }
  }
}

/**
 * Souche de cheminée : parallélépipède d'axe (dx, dz), centré en (cx, cz), de demi-longueur hl et
 * demi-épaisseur hd, de yb à yt. `rail` reçoit la silhouette des mitrons (plan ajouré).
 */
function emitStack(
  m: MeshData, rail: MeshData | null, c: BuildCtx, cx: number, cz: number, dx: number, dz: number, hl: number, hd: number, yb: number, yt: number,
): void {
  const px = -dz, pz = dx;              // perpendiculaire
  const x0 = cx - dx * hl - px * hd, z0 = cz - dz * hl - pz * hd;
  const x1 = cx + dx * hl - px * hd, z1 = cz + dz * hl - pz * hd;
  const x2 = cx + dx * hl + px * hd, z2 = cz + dz * hl + pz * hd;
  const x3 = cx - dx * hl + px * hd, z3 = cz - dz * hl + pz * hd;
  const ul = (2 * hl) / CELL_BAY_M, ud = (2 * hd) / CELL_BAY_M;
  const v0 = 1 - (yt - yb) / CELL_FLOOR_M;
  m.tint(c.tr * 0.98, c.tg * 0.97, c.tb * 0.95);
  m.facade(LAYER_SOUCHE, NB_CONTINUOUS, 0, ALT_NONE);
  // quatre côtés (sens direct vu de dehors)
  m.nx = -px; m.ny = 0; m.nz = -pz;
  m.quad(x1, yb, z1, 0, v0, x0, yb, z0, ul, v0, x0, yt, z0, ul, 1, x1, yt, z1, 0, 1);
  m.nx = dx; m.ny = 0; m.nz = dz;
  m.quad(x2, yb, z2, 0, v0, x1, yb, z1, ud, v0, x1, yt, z1, ud, 1, x2, yt, z2, 0, 1);
  m.nx = px; m.ny = 0; m.nz = pz;
  m.quad(x3, yb, z3, 0, v0, x2, yb, z2, ul, v0, x2, yt, z2, ul, 1, x3, yt, z3, 0, 1);
  m.nx = -dx; m.ny = 0; m.nz = -dz;
  m.quad(x0, yb, z0, 0, v0, x3, yb, z3, ud, v0, x3, yt, z3, ud, 1, x0, yt, z0, 0, 1);
  // dessus : mitrons vus d'en haut
  const pots = Math.max(1, Math.round((2 * hl) / POT_PERIOD_M));
  m.facade(LAYER_SOUCHE_TOP, NB_CONTINUOUS, 0, ALT_NONE);
  m.nx = 0; m.ny = 1; m.nz = 0;
  m.quad(x0, yt, z0, 0, 0, x3, yt, z3, 0, 1, x2, yt, z2, pots, 1, x1, yt, z1, pots, 0);
  if (rail !== null) {
    // silhouette des mitrons : un plan vertical dans l'axe de la souche ; v ∈ [0 ; 0,5] de la texture
    const ax = cx - dx * hl, az = cz - dz * hl, bx = cx + dx * hl, bz = cz + dz * hl;
    rail.nx = px; rail.ny = 0; rail.nz = pz;
    // (la texture porte deux mitrons par période : u = nombre de mitrons / 2)
    rail.quad(ax, yt, az, 0, 0.02, bx, yt, bz, pots / 2, 0.02, bx, yt + 0.5, bz, pots / 2, 0.48, ax, yt + 0.5, az, 0, 0.48);
  }
}

/**
 * Souches sur les murs mitoyens d'une mansarde, le long du bord haut du pignon.
 * `poly` : anneau extérieur décalé (le contour du terrasson).
 */
export function emitChimneys(m: MeshData, rail: MeshData | null, c: BuildCtx, es: EdgeSet, poly: Float64Array, yTop: number): void {
  const n = es.count;
  let placed = 0;
  for (let i = 0; i < n && placed < 6; i++) {
    if (es.flag[i] === WALL_FREE) continue;
    const j = i + 1 < n ? i + 1 : 0;
    const qax = poly[2 * i], qaz = poly[2 * i + 1], qbx = poly[2 * j], qbz = poly[2 * j + 1];
    const lx = qbx - qax, lz = qbz - qaz;
    const len = hyp(lx, lz);
    if (len < 2.4) continue;
    const dx = lx / len, dz = lz / len;
    const inx = -es.nx[i], inz = -es.nz[i];
    const h1 = vhash(c.b.id, 100 + i), h2 = vhash(c.b.id, 200 + i);
    // une longue souche (ou deux sur un grand pignon), adossée au mur mitoyen
    const count = len > 9 ? 2 : 1;
    for (let q = 0; q < count; q++) {
      const t = count === 1 ? 0.38 + 0.24 * h1 : q === 0 ? 0.24 + 0.06 * h1 : 0.7 + 0.08 * h2;
      const hl = Math.min(len * (count === 1 ? 0.36 : 0.19), 0.9 + 1.5 * (q === 0 ? h2 : h1));
      const hd = 0.27;
      const cx = qax + lx * t + inx * (hd + 0.04), cz = qaz + lz * t + inz * (hd + 0.04);
      emitStack(m, rail, c, cx, cz, dx, dz, hl, hd, yTop - 0.05, yTop + 1.25 + 0.9 * (q === 0 ? h1 : h2));
      placed++;
    }
  }
}
