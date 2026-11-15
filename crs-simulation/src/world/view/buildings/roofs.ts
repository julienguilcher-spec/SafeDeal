/* =====================================================================================
 * IMMEUBLES — toitures (logique pure)
 * -------------------------------------------------------------------------------------
 *   mansarde : contour décalé vers l'intérieur côté rue et côté cour (pas côté mitoyen : le
 *              pignon monte droit), brisis raide en zinc ou ardoise, terrasson, lucarnes,
 *              souches de cheminées sur les murs mitoyens ;
 *   plat     : toit-terrasse en retrait derrière un acrotère ;
 *   deux pans: faîtage dans l'axe du bâtiment, pignons maçonnés ;
 *   dôme     : calotte posée sur une dalle.
 * Tout polygone produit un toit : si le décalage du contour échoue (emprise trop étroite,
 * anneau tordu), on retombe sur un contour non décalé, donc un toit plat.
 * ===================================================================================== */

import {
  ALT_NONE, CELL_BAY_M, CELL_FLOOR_M, LAYER_ARDOISE_BRISIS, LAYER_ARDOISE_LUCARNE, LAYER_GRAVIER, LAYER_LUCARNE_FACE, LAYER_PIERRE,
  LAYER_SOUCHE, LAYER_SOUCHE_TOP, LAYER_TUILE, LAYER_ZINC_BRISIS, LAYER_ZINC_LUCARNE, LAYER_ZINC_PLAT, NB_CONTINUOUS,
} from './layers';
import { hash01 } from './layout';
import type { MeshData } from './meshdata';
import { WALL_FREE } from './prepare';
import { distanceToRing, insetIsValid, insetRing, pointInRing, ringArea, ringCentroid } from './rings';
import { triIndices, triangulate, triangulatedArea } from './triangulate';
import type { BuildCtx, EdgeSet } from './walls';

/** Pente du brisis : recul horizontal = hauteur × ce facteur (≈ 67°). */
const BRISIS_RUN = 0.42;
/** Épaisseur d'un acrotère et hauteur dont il dépasse du toit-terrasse (m). */
const PARAPET_T = 0.3;
const PARAPET_H = 0.5;
/** Période (m) des mitrons le long d'une souche. */
export const POT_PERIOD_M = 0.7;

// Tampons du bâtiment courant : anneaux d'origine et anneaux décalés, mêmes indices.
let orig = new Float64Array(1024);
let poly = new Float64Array(1024);
let ringBuf = new Float64Array(512);
let insetBuf = new Float64Array(512);
let dist = new Float32Array(256);
let ringEnds = new Int32Array(16);
const centroid = { x: 0, z: 0 };
// Découpe d'un triangle par le faîtage : jusqu'à 4 sommets (x, z, d).
const clipIn = new Float64Array(9);
const clipOut = new Float64Array(15);

/** Libère les tampons (recréés à la demande). */
export function releaseRoofScratch(): void {
  orig = new Float64Array(1024);
  poly = new Float64Array(1024);
  ringBuf = new Float64Array(512);
  insetBuf = new Float64Array(512);
  dist = new Float32Array(256);
}

/** Copie les anneaux du bâtiment dans `orig` et `poly` ; retourne le nombre total de sommets. */
function loadRings(c: BuildCtx): number {
  const p = c.p, k = c.k;
  const r0 = p.firstRing[k], nr = p.ringCount[k];
  let total = 0;
  for (let r = 0; r < nr; r++) total += p.ringLen[r0 + r];
  if (orig.length < total * 2) { orig = new Float64Array(total * 4); poly = new Float64Array(total * 4); }
  if (ringEnds.length < nr) ringEnds = new Int32Array(nr * 2);
  const s0 = p.ringStart[r0];
  const cs = p.coords;
  // les anneaux d'un bâtiment se suivent dans le tampon commun
  for (let i = 0; i < total * 2; i++) { const v = cs[2 * s0 + i]; orig[i] = v; poly[i] = v; }
  let end = 0;
  for (let r = 0; r < nr; r++) { end += p.ringLen[r0 + r]; ringEnds[r] = end; }
  return total;
}

/**
 * Décale tous les anneaux vers la matière et écrit le résultat dans `poly`.
 * `outerDist` : décalage par côté de l'anneau extérieur ; `holeDist` : décalage des cours.
 * Un anneau dont le décalage est invalide est réessayé à mi-distance, puis laissé tel quel.
 * Retourne le facteur appliqué à l'anneau extérieur (1, 0,5 ou 0).
 */
function insetAll(c: BuildCtx, outerDist: Float32Array, holeDist: number): number {
  const p = c.p, k = c.k;
  const r0 = p.firstRing[k], nr = p.ringCount[k];
  const n = p.ringLen[r0];
  if (ringBuf.length < n * 2) { ringBuf = new Float64Array(n * 4); insetBuf = new Float64Array(n * 4); }
  let factor = 0;
  for (let i = 0; i < 2 * n; i++) ringBuf[i] = orig[i];
  for (let attempt = 0; attempt < 2; attempt++) {
    insetRing(ringBuf, n, outerDist, insetBuf);
    if (insetIsValid(ringBuf, insetBuf, n)) {
      for (let i = 0; i < 2 * n; i++) poly[i] = insetBuf[i];
      factor = attempt === 0 ? 1 : 0.5;
      break;
    }
    for (let i = 0; i < n; i++) outerDist[i] *= 0.5;
  }
  // cours : décalage vers la masse bâtie, à condition de rester dans le contour extérieur décalé
  let off = n;
  for (let r = 1; r < nr; r++) {
    const m = p.ringLen[r0 + r];
    if (ringBuf.length < m * 2) { ringBuf = new Float64Array(m * 4); insetBuf = new Float64Array(m * 4); }
    for (let i = 0; i < 2 * m; i++) ringBuf[i] = orig[2 * off + i];
    let d = factor > 0 ? holeDist : 0;
    for (let attempt = 0; attempt < 2 && d > 0; attempt++) {
      insetRing(ringBuf, m, d, insetBuf);
      let ok = insetIsValid(ringBuf, insetBuf, m);
      for (let i = 0; ok && i < m; i++) if (!pointInRing(poly, n, insetBuf[2 * i], insetBuf[2 * i + 1])) ok = false;
      if (ok) {
        for (let i = 0; i < 2 * m; i++) poly[2 * off + i] = insetBuf[i];
        break;
      }
      d *= 0.5;
    }
    off += m;
  }
  return factor;
}

/** Aire attendue du polygone `src` (extérieur moins trous). */
function expectedArea(src: Float64Array, nr: number): number {
  let a = 0, start = 0;
  for (let r = 0; r < nr; r++) {
    const n = ringEnds[r] - start;
    let s = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      s += src[2 * (start + i)] * src[2 * (start + j) + 1] - src[2 * (start + j)] * src[2 * (start + i) + 1];
    }
    a += r === 0 ? Math.abs(s / 2) : -Math.abs(s / 2);
    start = ringEnds[r];
  }
  return a;
}

/**
 * Triangule `poly` et vérifie l'aire couverte. Si le résultat est incomplet, `poly` est remis à
 * l'identique de `orig` (contour non décalé) et retriangulé. Retourne le nombre de triangles et
 * indique par `polyIsOrig` si le repli a eu lieu.
 */
let polyIsOrig = false;
function triangulatePoly(nr: number, total: number): number {
  polyIsOrig = false;
  let nt = triangulate(poly, ringEnds, nr);
  const want = expectedArea(poly, nr);
  const got = triangulatedArea(poly, nt);
  if (nt === 0 || Math.abs(got - want) > Math.max(0.5, want * 0.03)) {
    for (let i = 0; i < total * 2; i++) poly[i] = orig[i];
    polyIsOrig = true;
    nt = triangulate(poly, ringEnds, nr);
  }
  return nt;
}

/** Émet les triangles de la dernière triangulation à l'altitude y (normale vers le haut, ou vers le bas si `down`). */
function emitCap(m: MeshData, c: BuildCtx, src: Float64Array, total: number, nt: number, y: number, down: boolean): void {
  if (nt === 0) return;
  const ax = c.p.axisX[c.k], az = c.p.axisZ[c.k];
  m.ensure(total, nt * 3);
  const base = m.nv;
  m.nx = 0; m.ny = down ? -1 : 1; m.nz = 0;
  for (let i = 0; i < total; i++) {
    const x = src[2 * i], z = src[2 * i + 1];
    m.vertex(x, y, z, (x * ax + z * az) / CELL_BAY_M, (-x * az + z * ax) / CELL_FLOOR_M);
  }
  for (let t = 0; t < nt; t++) {
    const a = base + triIndices[3 * t], b = base + triIndices[3 * t + 1], d = base + triIndices[3 * t + 2];
    if (down) m.tri(a, d, b); else m.tri(a, b, d);
  }
}

/** Teinte de couverture : zinc et ardoise varient peu. */
function roofTint(m: MeshData, c: BuildCtx, k = 1): void {
  const v = (0.86 + 0.16 * hash01(c.b.id, 41)) * k;
  m.tint(v, v, v * (1 + 0.02 * (c.rand - 0.5)));
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Couronne : bande entre le contour d'origine et le contour décalé
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Émet, pour chaque côté de chaque anneau, la face reliant le contour d'origine (altitude yBot)
 * au contour décalé (altitude yTop) : brisis d'une mansarde (incliné côté libre, vertical côté
 * mitoyen), ou attique vertical si le décalage est nul.
 */
function emitBrisis(m: MeshData, c: BuildCtx, es: EdgeSet, yBot: number, yTop: number, slate: boolean, paintedDormers: boolean): void {
  const p = c.p, k = c.k;
  const r0 = p.firstRing[k], nr = p.ringCount[k];
  const rise = yTop - yBot;
  let off = 0;
  for (let r = 0; r < nr; r++) {
    const n = p.ringLen[r0 + r];
    let cum = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      const ax = orig[2 * (off + i)], az = orig[2 * (off + i) + 1], bx = orig[2 * (off + j)], bz = orig[2 * (off + j) + 1];
      const qax = poly[2 * (off + i)], qaz = poly[2 * (off + i) + 1], qbx = poly[2 * (off + j)], qbz = poly[2 * (off + j) + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      const c0 = cum;
      cum += len;
      if (len < 0.05) continue;
      const party = r === 0 && es.flag[i] !== WALL_FREE;
      // abscisses des sommets hauts, projetés sur le côté (les joints du zinc restent verticaux)
      const ta = ((qax - ax) * dx + (qaz - az) * dz) / (len * len);
      const tb = ((qbx - ax) * dx + (qbz - az) * dz) / (len * len);
      if (party) {
        // pignon : le mur mitoyen monte droit jusqu'au terrasson
        m.tint(c.tr * 0.96, c.tg * 0.96, c.tb * 0.96);
        m.facade(c.blankLayer, NB_CONTINUOUS, 0, ALT_NONE);
        m.nx = -dz / len; m.ny = 0; m.nz = dx / len;
        const u0 = c0 / CELL_BAY_M, du = len / CELL_BAY_M;
        const v0 = c.wallH / CELL_FLOOR_M, v1 = (c.wallH + rise) / CELL_FLOOR_M;
        m.quad(ax, yBot, az, u0, v0, bx, yBot, bz, u0 + du, v0, qbx, yTop, qbz, u0 + tb * du, v1, qax, yTop, qaz, u0 + ta * du, v1);
        continue;
      }
      if (!m.normalFrom(ax, yBot, az, bx, yBot, bz, (qax + qbx) / 2, yTop, (qaz + qbz) / 2)) continue;
      roofTint(m, c);
      const nb = r === 0 ? es.n[i] : 0;
      if (paintedDormers && nb > 0) {
        // lucarnes peintes : une par travée, calée sur les fenêtres de la façade
        m.facade(slate ? LAYER_ARDOISE_LUCARNE : LAYER_ZINC_LUCARNE, nb, c.seed + i * 13 + 5, ALT_NONE);
        const u0 = es.u0[i], du = es.u1[i] - es.u0[i];
        m.quad(ax, yBot, az, u0, 0, bx, yBot, bz, u0 + du, 0, qbx, yTop, qbz, u0 + tb * du, 1, qax, yTop, qaz, u0 + ta * du, 1);
      } else {
        m.facade(slate ? LAYER_ARDOISE_BRISIS : LAYER_ZINC_BRISIS, NB_CONTINUOUS, 0, ALT_NONE);
        const u0 = c0 / CELL_BAY_M, du = len / CELL_BAY_M;
        const run = Math.hypot((qax + qbx) / 2 - (ax + bx) / 2, (qaz + qbz) / 2 - (az + bz) / 2);
        const v1 = Math.hypot(rise, run) / CELL_FLOOR_M;
        m.quad(ax, yBot, az, u0, 0, bx, yBot, bz, u0 + du, 0, qbx, yTop, qbz, u0 + tb * du, v1, qax, yTop, qaz, u0 + ta * du, v1);
      }
    }
    off += n;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Accessoires : lucarnes, souches de cheminées
// ─────────────────────────────────────────────────────────────────────────────────────

/** Lucarnes en volume : une par travée des murs libres de l'anneau extérieur (6 triangles chacune). */
function emitDormers(m: MeshData, c: BuildCtx, es: EdgeSet, yEave: number, rise: number, run: number): void {
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
    for (let b = 0; b < nb; b++) {
      const t = es.m[i] + (b + 0.5) * w;
      const cx = ax + dx * t, cz = az + dz * t;
      // quatre coins de la face avant (plan vertical au recul eb), deux coins arrière (recul et)
      const lx = cx - dx * half + inx * eb, lz = cz - dz * half + inz * eb;
      const rx = cx + dx * half + inx * eb, rz = cz + dz * half + inz * eb;
      const blx = cx - dx * half + inx * et, blz = cz - dz * half + inz * et;
      const brx = cx + dx * half + inx * et, brz = cz + dz * half + inz * et;
      const y0 = yEave + hb, y1 = yEave + ht;
      // face avant : la cellule de lucarne entière
      m.tint(c.tr, c.tg, c.tb);
      m.facade(LAYER_LUCARNE_FACE, 1, c.seed + i * 13 + b * 7 + 5, ALT_NONE);
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

/** Souches sur les murs mitoyens d'une mansarde (le long du bord haut du pignon). */
function emitChimneys(m: MeshData, rail: MeshData | null, c: BuildCtx, es: EdgeSet, yTop: number): void {
  const n = es.count;
  let placed = 0;
  for (let i = 0; i < n && placed < 6; i++) {
    if (es.flag[i] === WALL_FREE) continue;
    const j = i + 1 < n ? i + 1 : 0;
    const qax = poly[2 * i], qaz = poly[2 * i + 1], qbx = poly[2 * j], qbz = poly[2 * j + 1];
    const lx = qbx - qax, lz = qbz - qaz;
    const len = Math.hypot(lx, lz);
    if (len < 2.4) continue;
    const dx = lx / len, dz = lz / len;
    const inx = -es.nx[i], inz = -es.nz[i];
    const h1 = hash01(c.b.id, 100 + i), h2 = hash01(c.b.id, 200 + i);
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

// ─────────────────────────────────────────────────────────────────────────────────────
// Formes de toit
// ─────────────────────────────────────────────────────────────────────────────────────

function emitMansard(m: MeshData, rail: MeshData | null, c: BuildCtx, es: EdgeSet): void {
  const p = c.p, k = c.k;
  const nr = p.ringCount[k];
  const total = loadRings(c);
  const n = es.count;
  const yEave = c.y0 + c.wallH, yTop = yEave + c.roofH;
  const run = c.roofH * BRISIS_RUN;
  if (dist.length < n) dist = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) dist[i] = es.flag[i] === WALL_FREE ? run : 0;
  const factor = insetAll(c, dist, run);
  const nt = triangulatePoly(nr, total);
  const slate = hash01(c.b.id, 61) < (c.style === 'monumental' ? 0.7 : 0.3);
  const sloped = factor > 0 && !polyIsOrig;
  const dormers3d = c.detail.dormers && sloped && factor === 1 && !c.allBlank;
  emitBrisis(m, c, es, yEave, yTop, slate, sloped && !dormers3d && !c.allBlank);
  roofTint(m, c, 1.04);
  m.facade(LAYER_ZINC_PLAT, NB_CONTINUOUS, 0, ALT_NONE);
  emitCap(m, c, poly, total, nt, yTop, false);
  if (dormers3d) emitDormers(m, c, es, yEave, c.roofH, run);
  if (c.detail.chimneys && sloped && c.roofH >= 1.6 && !c.allBlank) emitChimneys(m, rail, c, es, yTop);
}

function emitFlat(m: MeshData, c: BuildCtx): void {
  const p = c.p, k = c.k;
  const nr = p.ringCount[k];
  const total = loadRings(c);
  const yTop = c.y0 + c.wallH + c.roofH;
  const n = p.ringLen[p.firstRing[k]];
  let parapet = c.detail.parapets && c.wallH > 4 && p.area[k] > 30;
  if (parapet) {
    if (dist.length < n) dist = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) dist[i] = PARAPET_T;
    parapet = insetAll(c, dist, PARAPET_T) === 1;
  }
  let nt = triangulatePoly(nr, total);
  if (polyIsOrig) parapet = false;
  roofTint(m, c, 0.95);
  if (!parapet) {
    if (!polyIsOrig) { for (let i = 0; i < total * 2; i++) poly[i] = orig[i]; nt = triangulate(poly, ringEnds, nr); }
    m.facade(LAYER_GRAVIER, NB_CONTINUOUS, 0, ALT_NONE);
    emitCap(m, c, poly, total, nt, yTop, false);
    return;
  }
  // toit-terrasse en contrebas de l'acrotère
  const yRoof = yTop - PARAPET_H;
  m.facade(LAYER_GRAVIER, NB_CONTINUOUS, 0, ALT_NONE);
  emitCap(m, c, poly, total, nt, yRoof, false);
  // dessus et face intérieure de l'acrotère
  const r0 = p.firstRing[k];
  let off = 0;
  for (let r = 0; r < nr; r++) {
    const rn = p.ringLen[r0 + r];
    let cum = 0;
    for (let i = 0; i < rn; i++) {
      const j = i + 1 < rn ? i + 1 : 0;
      const ax = orig[2 * (off + i)], az = orig[2 * (off + i) + 1], bx = orig[2 * (off + j)], bz = orig[2 * (off + j) + 1];
      const qax = poly[2 * (off + i)], qaz = poly[2 * (off + i) + 1], qbx = poly[2 * (off + j)], qbz = poly[2 * (off + j) + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = cum / CELL_BAY_M, u1 = (cum + len) / CELL_BAY_M;
      cum += len;
      if (len < 0.05) continue;
      m.tint(c.tr * 0.97, c.tg * 0.97, c.tb * 0.97);
      m.facade(LAYER_PIERRE, NB_CONTINUOUS, 0, ALT_NONE);
      m.nx = 0; m.ny = 1; m.nz = 0;
      m.quad(ax, yTop, az, u0, 0, bx, yTop, bz, u1, 0, qbx, yTop, qbz, u1, 0.1, qax, yTop, qaz, u0, 0.1);
      const ql = Math.hypot(qbx - qax, qbz - qaz);
      if (ql < 0.05) continue;
      // face intérieure : tournée vers le toit
      m.nx = (bz - az) / len; m.ny = 0; m.nz = -(bx - ax) / len;
      m.shade = 0.8;
      m.quad(qbx, yRoof, qbz, u1, 0, qax, yRoof, qaz, u0, 0, qax, yTop, qaz, u0, 0.16, qbx, yTop, qbz, u1, 0.16);
      m.shade = 1;
    }
    off += rn;
  }
  // édicule technique sur les grands toits modernes
  if (c.style === 'modern' && p.area[k] > 220 && nr === 1) {
    ringCentroid(poly, n, centroid);
    if (pointInRing(poly, n, centroid.x, centroid.z) && distanceToRing(poly, n, centroid.x, centroid.z) > 3.2) {
      const ax = p.axisX[k], az = p.axisZ[k];
      m.tint(c.tr * 0.92, c.tg * 0.92, c.tb * 0.92);
      const hl = 1.5 + c.rand, hd = 1.2;
      const px = -az, pz = ax;
      const cx = centroid.x, cz = centroid.z;
      const x0 = cx - ax * hl - px * hd, z0 = cz - az * hl - pz * hd, x1 = cx + ax * hl - px * hd, z1 = cz + az * hl - pz * hd;
      const x2 = cx + ax * hl + px * hd, z2 = cz + az * hl + pz * hd, x3 = cx - ax * hl + px * hd, z3 = cz - az * hl + pz * hd;
      const yb = yRoof, yt = yRoof + 2.3;
      m.facade(c.blankLayer, NB_CONTINUOUS, 0, ALT_NONE);
      m.nx = -px; m.ny = 0; m.nz = -pz;
      m.quad(x1, yb, z1, 0, 0, x0, yb, z0, 1, 0, x0, yt, z0, 1, 0.7, x1, yt, z1, 0, 0.7);
      m.nx = ax; m.ny = 0; m.nz = az;
      m.quad(x2, yb, z2, 0, 0, x1, yb, z1, 0.8, 0, x1, yt, z1, 0.8, 0.7, x2, yt, z2, 0, 0.7);
      m.nx = px; m.ny = 0; m.nz = pz;
      m.quad(x3, yb, z3, 0, 0, x2, yb, z2, 1, 0, x2, yt, z2, 1, 0.7, x3, yt, z3, 0, 0.7);
      m.nx = -ax; m.ny = 0; m.nz = -az;
      m.quad(x0, yb, z0, 0, 0, x3, yb, z3, 0.8, 0, x3, yt, z3, 0.8, 0.7, x0, yt, z0, 0, 0.7);
      m.facade(LAYER_GRAVIER, NB_CONTINUOUS, 0, ALT_NONE);
      m.nx = 0; m.ny = 1; m.nz = 0;
      m.quad(x0, yt, z0, 0, 0, x3, yt, z3, 0, 0.8, x2, yt, z2, 1, 0.8, x1, yt, z1, 1, 0);
    }
  }
}

/** Auvent, halle : une couverture mince, visible dessus et dessous. */
function emitCanopy(m: MeshData, c: BuildCtx): void {
  const nr = c.p.ringCount[c.k];
  const total = loadRings(c);
  const nt = triangulatePoly(nr, total);
  const yTop = c.y0 + c.wallH + c.roofH;
  roofTint(m, c);
  m.facade(LAYER_ZINC_PLAT, NB_CONTINUOUS, 0, ALT_NONE);
  emitCap(m, c, poly, total, nt, yTop, false);
  m.shade = 0.6;
  emitCap(m, c, poly, total, nt, yTop - Math.min(0.5, c.wallH * 0.5), true);
  m.shade = 1;
}

/** Coupe le triangle de clipIn (3 × [x, z, d]) par le demi-plan side·d ≥ 0 ; retourne le nombre de sommets écrits dans clipOut. */
function clipTriangle(side: number): number {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const di = clipIn[3 * i + 2] * side, dj = clipIn[3 * j + 2] * side;
    if (di >= 0) {
      clipOut[3 * n] = clipIn[3 * i]; clipOut[3 * n + 1] = clipIn[3 * i + 1]; clipOut[3 * n + 2] = clipIn[3 * i + 2];
      n++;
    }
    if ((di > 0 && dj < 0) || (di < 0 && dj > 0)) {
      const t = di / (di - dj);
      clipOut[3 * n] = clipIn[3 * i] + (clipIn[3 * j] - clipIn[3 * i]) * t;
      clipOut[3 * n + 1] = clipIn[3 * i + 1] + (clipIn[3 * j + 1] - clipIn[3 * i + 1]) * t;
      clipOut[3 * n + 2] = 0;
      n++;
    }
  }
  return n;
}

function emitGabled(m: MeshData, c: BuildCtx, es: EdgeSet): void {
  const p = c.p, k = c.k;
  const nr = p.ringCount[k];
  const total = loadRings(c);
  const nt = triangulatePoly(nr, total);
  const yEave = c.y0 + c.wallH;
  const H = c.roofH;
  const ax = p.axisX[k], az = p.axisZ[k], mid = p.midSpan[k];
  const half = Math.max(p.halfSpan[k], 0.5);
  const slope = H / half;
  const sl = Math.sqrt(1 + slope * slope);
  const tile = hash01(c.b.id, 67) < 0.35;
  roofTint(m, c, tile ? 1 : 0.98);
  m.facade(tile ? LAYER_TUILE : LAYER_ZINC_BRISIS, NB_CONTINUOUS, 0, ALT_NONE);
  // versants : chaque triangle du plan est coupé par le faîtage, puis relevé
  for (let t = 0; t < nt; t++) {
    for (let q = 0; q < 3; q++) {
      const v = triIndices[3 * t + q];
      const x = poly[2 * v], z = poly[2 * v + 1];
      clipIn[3 * q] = x; clipIn[3 * q + 1] = z; clipIn[3 * q + 2] = -x * az + z * ax - mid;
    }
    for (let side = -1; side <= 1; side += 2) {
      const nv = clipTriangle(side);
      if (nv < 3) continue;
      m.ensure(nv, (nv - 2) * 3);
      // normale du versant : le toit descend quand |d| augmente
      m.normal(side * slope * -az, 1, side * slope * ax);
      const base = m.nv;
      for (let q = 0; q < nv; q++) {
        const x = clipOut[3 * q], z = clipOut[3 * q + 1];
        const d = Math.abs(clipOut[3 * q + 2]);
        const h = H * (1 - d / half);
        m.vertex(x, yEave + (h > 0 ? h : 0), z, (x * ax + z * az) / CELL_BAY_M, (d * sl) / CELL_FLOOR_M);
      }
      for (let q = 1; q + 1 < nv; q++) m.tri(base, base + q, base + q + 1);
    }
  }
  // pignons et murs gouttereaux au-dessus de l'égout
  m.tint(c.tr * 0.96, c.tg * 0.96, c.tb * 0.96);
  m.facade(c.blankLayer, NB_CONTINUOUS, 0, ALT_NONE);
  const r0 = p.firstRing[k];
  let off = 0;
  const v0 = c.wallH / CELL_FLOOR_M;
  for (let r = 0; r < nr; r++) {
    const rn = p.ringLen[r0 + r];
    let cum = 0;
    for (let i = 0; i < rn; i++) {
      const j = i + 1 < rn ? i + 1 : 0;
      const x0 = orig[2 * (off + i)], z0 = orig[2 * (off + i) + 1], x1 = orig[2 * (off + j)], z1 = orig[2 * (off + j) + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const u0 = cum / CELL_BAY_M;
      cum += len;
      if (len < 0.05) continue;
      const d0 = -x0 * az + z0 * ax - mid, d1 = -x1 * az + z1 * ax - mid;
      const h0 = Math.max(0, H * (1 - Math.abs(d0) / half)), h1 = Math.max(0, H * (1 - Math.abs(d1) / half));
      if (h0 < 0.03 && h1 < 0.03 && d0 * d1 >= 0) continue;
      m.nx = -(z1 - z0) / len; m.ny = 0; m.nz = (x1 - x0) / len;
      const u1 = u0 + len / CELL_BAY_M;
      if (d0 * d1 < 0) {
        // le côté franchit le faîtage : pignon en pointe
        const t = d0 / (d0 - d1);
        const xm = x0 + (x1 - x0) * t, zm = z0 + (z1 - z0) * t, um = u0 + (u1 - u0) * t;
        m.quad(x0, yEave, z0, u0, v0, xm, yEave, zm, um, v0, xm, yEave + H, zm, um, v0 + H / CELL_FLOOR_M, x0, yEave + h0, z0, u0, v0 + h0 / CELL_FLOOR_M);
        m.quad(xm, yEave, zm, um, v0, x1, yEave, z1, u1, v0, x1, yEave + h1, z1, u1, v0 + h1 / CELL_FLOOR_M, xm, yEave + H, zm, um, v0 + H / CELL_FLOOR_M);
      } else {
        m.quad(x0, yEave, z0, u0, v0, x1, yEave, z1, u1, v0, x1, yEave + h1, z1, u1, v0 + h1 / CELL_FLOOR_M, x0, yEave + h0, z0, u0, v0 + h0 / CELL_FLOOR_M);
      }
    }
    off += rn;
  }
  void es;
}

function emitDome(m: MeshData, rail: MeshData | null, c: BuildCtx, es: EdgeSet): void {
  const p = c.p, k = c.k;
  const nr = p.ringCount[k];
  const n = p.ringLen[p.firstRing[k]];
  const total = loadRings(c);
  ringCentroid(orig, n, centroid);
  const inside = nr === 1 && pointInRing(orig, n, centroid.x, centroid.z);
  const radius = inside ? distanceToRing(orig, n, centroid.x, centroid.z) * 0.96 : 0;
  if (radius < 0.8 || c.roofH < 0.5) {
    emitMansard(m, rail, c, es);       // repli : brisis + terrasson (ou attique droit)
    return;
  }
  const nt = triangulatePoly(nr, total);
  const yEave = c.y0 + c.wallH;
  roofTint(m, c, 0.97);
  m.facade(LAYER_ZINC_PLAT, NB_CONTINUOUS, 0, ALT_NONE);
  emitCap(m, c, poly, total, nt, yEave, false);
  // calotte : anneaux de parallèles, sommets partagés (normales lisses)
  const S = c.detail.domeSegments, R = S >= 12 ? 4 : 3;
  const H = c.roofH;
  const slate = hash01(c.b.id, 61) < 0.6;
  m.facade(slate ? LAYER_ARDOISE_BRISIS : LAYER_ZINC_BRISIS, NB_CONTINUOUS, 0, ALT_NONE);
  m.ensure(R * (S + 1) + S, R * S * 6);
  const base = m.nv;
  const uRep = Math.max(2, Math.round((2 * Math.PI * radius) / CELL_BAY_M));
  for (let r = 0; r < R; r++) {
    const phi = (r / R) * (Math.PI / 2);
    const cr = Math.cos(phi), sr = Math.sin(phi);
    for (let s = 0; s <= S; s++) {
      const th = (s / S) * Math.PI * 2;
      const ct = Math.cos(th), st = Math.sin(th);
      m.normal((ct * cr) / radius, sr / H, (st * cr) / radius);
      m.vertex(centroid.x + ct * cr * radius, yEave + sr * H, centroid.z + st * cr * radius, (s / S) * uRep, (phi * Math.max(radius, H)) / CELL_FLOOR_M);
    }
  }
  // Sens : th croît de +x vers +z ; vu de dehors, la face (r, s) → (r, s+1) tourne à l'envers du sens direct.
  for (let r = 0; r + 1 < R; r++) {
    for (let s = 0; s < S; s++) {
      const a = base + r * (S + 1) + s, b = a + 1, d = a + (S + 1), e = d + 1;
      m.tri(a, d, b);
      m.tri(b, d, e);
    }
  }
  // calotte sommitale : un sommet par secteur pour garder des uv propres
  const top = base + R * (S + 1);
  const last = base + (R - 1) * (S + 1);
  m.normal(0, 1, 0);
  for (let s = 0; s < S; s++) m.vertex(centroid.x, yEave + H, centroid.z, ((s + 0.5) / S) * uRep, ((Math.PI / 2) * Math.max(radius, H)) / CELL_FLOOR_M);
  for (let s = 0; s < S; s++) m.tri(last + s, top + s, last + s + 1);
}

/** Émet la toiture du bâtiment courant. `es` : côtés de l'anneau extérieur (travées comprises). */
export function emitRoof(m: MeshData, rail: MeshData | null, c: BuildCtx, es: EdgeSet): void {
  if (c.canopy) { emitCanopy(m, c); return; }
  const roof = c.b.roof;
  // sans hauteur réservée au toit, le mur monte jusqu'en haut : toit-terrasse
  if (c.roofH <= 0 || roof === 'flat') { emitFlat(m, c); return; }
  if (roof === 'mansard') emitMansard(m, rail, c, es);
  else if (roof === 'gabled') emitGabled(m, c, es);
  else if (roof === 'dome') emitDome(m, rail, c, es);
  else emitFlat(m, c);
}

/** Aire signée de l'anneau extérieur décalé du dernier toit émis (pour les tests). */
export function lastRoofInsetArea(n: number): number {
  return ringArea(poly, n);
}
