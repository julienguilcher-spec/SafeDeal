/* =====================================================================================
 * VILLE EN 3D — sol en facettes d'une tuile (logique pure).
 * -------------------------------------------------------------------------------------
 * Le relief de la carte est une grille bilinéaire au pas de 25 m. Le sol dessiné est un réseau
 * de triangles au pas de 8 m : chaque carré est coupé par la même diagonale, et TOUT ce qui est
 * posé au sol (nappe de base, trottoirs, bordures, marquages) lit son altitude dans ce réseau.
 * Une surface surélevée découpée selon ces facettes est donc exactement parallèle au sol : jamais
 * de chaussée qui perce un trottoir, jamais de trottoir qui flotte. L'écart avec heightAt (le
 * relief bilinéaire que lit la simulation) reste sous le centimètre sur 98 % de la carte.
 * ===================================================================================== */

import { TILE_SIZE } from '../mapdata';

/**
 * Côté d'une facette (m) et facettes par côté de tuile. 8 m par défaut ; 16 m en qualité « bas » (téléphone : le
 * sol, premier poste de triangles, est divisé par trois). Réglé par le système de la ville AVANT de construire les
 * tuiles (setTinCell) : toutes les tuiles d'une même qualité partagent le même réseau, et un changement de qualité
 * reconstruit tout. Liaison vivante : les modules qui importent ces valeurs lisent toujours le réglage courant.
 */
export let TIN_CELL = 8;
export let TIN_N = TILE_SIZE / TIN_CELL;

/** Règle le côté des facettes (diviseur du côté de tuile). À n'appeler qu'avant la reconstruction des tuiles. */
export function setTinCell(cell: number): void {
  const n = Math.round(TILE_SIZE / cell);
  if (n < 1 || TILE_SIZE / n === TIN_CELL) return;
  TIN_CELL = TILE_SIZE / n;
  TIN_N = n;
}

export class TileTin {
  readonly ox: number;
  readonly oz: number;
  /** (TIN_N + 1)² altitudes, ligne par ligne. */
  readonly h: Float32Array;

  constructor(tx: number, tz: number, sample: (x: number, z: number) => number) {
    this.ox = tx * TILE_SIZE;
    this.oz = tz * TILE_SIZE;
    const w = TIN_N + 1;
    this.h = new Float32Array(w * w);
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) {
        const y = sample(this.ox + i * TIN_CELL, this.oz + j * TIN_CELL);
        this.h[j * w + i] = Number.isFinite(y) ? y : 0;
      }
    }
  }

  /** Altitude du sol en facettes (hors de la tuile : la facette du bord est prolongée). */
  y(x: number, z: number): number {
    const fx = (x - this.ox) / TIN_CELL, fz = (z - this.oz) / TIN_CELL;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i >= TIN_N) i = TIN_N - 1;
    if (j < 0) j = 0; else if (j >= TIN_N) j = TIN_N - 1;
    const u = fx - i, v = fz - j;
    const w = TIN_N + 1;
    const k = j * w + i;
    const h00 = this.h[k], h11 = this.h[k + w + 1];
    // Diagonale du coin (i, j) au coin (i + 1, j + 1).
    if (u >= v) return h00 + u * (this.h[k + 1] - h00) + v * (h11 - this.h[k + 1]);
    return h00 + u * (h11 - this.h[k + w]) + v * (this.h[k + w] - h00);
  }

  /** Altitudes extrêmes de la tuile. */
  range(out: { min: number; max: number }): void {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < this.h.length; i++) {
      if (this.h[i] < min) min = this.h[i];
      if (this.h[i] > max) max = this.h[i];
    }
    out.min = min;
    out.max = max;
  }
}

// Polygones de travail du découpage (un triangle coupé par 5 demi-plans a au plus 8 sommets).
let bufA = new Float64Array(40);
let bufB = new Float64Array(40);

/** Garde la partie du polygone où a·x + b·z + c ≥ 0 (Sutherland–Hodgman, polygone convexe). */
function clipHalf(src: Float64Array, n: number, a: number, b: number, c: number, dst: Float64Array): number {
  let m = 0;
  let px = src[2 * n - 2], pz = src[2 * n - 1];
  let pd = a * px + b * pz + c;
  for (let i = 0; i < n; i++) {
    const x = src[2 * i], z = src[2 * i + 1];
    const d = a * x + b * z + c;
    if (d >= 0) {
      if (pd < 0) {
        const t = pd / (pd - d);
        dst[2 * m] = px + (x - px) * t;
        dst[2 * m + 1] = pz + (z - pz) * t;
        m++;
      }
      dst[2 * m] = x;
      dst[2 * m + 1] = z;
      m++;
    } else if (pd >= 0) {
      const t = pd / (pd - d);
      dst[2 * m] = px + (x - px) * t;
      dst[2 * m + 1] = pz + (z - pz) * t;
      m++;
    }
    px = x;
    pz = z;
    pd = d;
  }
  return m;
}

/** Reçoit un morceau convexe (n sommets dans `poly`, à plat) contenu dans une seule facette. */
export type PieceSink = (poly: Float64Array, n: number) => void;

const AREA_EPS = 1e-5;

function emitIfArea(poly: Float64Array, n: number, sink: PieceSink): void {
  if (n < 3) return;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += poly[2 * j] * poly[2 * i + 1] - poly[2 * i] * poly[2 * j + 1];
  if (Math.abs(area) < AREA_EPS) return;
  sink(poly, n);
}

/**
 * Découpe un triangle selon les facettes de la tuile d'origine (ox, oz) et remet chaque morceau à
 * `sink`. Ce qui dépasse de la tuile est rattaché aux facettes du bord. Aucune allocation.
 */
export function clipTriangleToTin(
  ax: number, az: number, bx: number, bz: number, cx: number, cz: number, ox: number, oz: number, sink: PieceSink,
): void {
  const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
  let i0 = Math.floor((minX - ox) / TIN_CELL), i1 = Math.floor((maxX - ox) / TIN_CELL);
  let j0 = Math.floor((minZ - oz) / TIN_CELL), j1 = Math.floor((maxZ - oz) / TIN_CELL);
  if (i0 < 0) i0 = 0; else if (i0 >= TIN_N) i0 = TIN_N - 1;
  if (i1 < 0) i1 = 0; else if (i1 >= TIN_N) i1 = TIN_N - 1;
  if (j0 < 0) j0 = 0; else if (j0 >= TIN_N) j0 = TIN_N - 1;
  if (j1 < 0) j1 = 0; else if (j1 >= TIN_N) j1 = TIN_N - 1;
  for (let j = j0; j <= j1; j++) {
    const z0 = oz + j * TIN_CELL, z1 = z0 + TIN_CELL;
    for (let i = i0; i <= i1; i++) {
      const x0 = ox + i * TIN_CELL, x1 = x0 + TIN_CELL;
      let src = bufA, dst = bufB;
      src[0] = ax;
      src[1] = az;
      src[2] = bx;
      src[3] = bz;
      src[4] = cx;
      src[5] = cz;
      let n = 3;
      // Les facettes du bord de tuile ne sont pas bornées vers l'extérieur.
      if (i > 0) {
        n = clipHalf(src, n, 1, 0, -x0, dst);
        const t = src; src = dst; dst = t;
        if (n < 3) continue;
      }
      if (i < TIN_N - 1) {
        n = clipHalf(src, n, -1, 0, x1, dst);
        const t = src; src = dst; dst = t;
        if (n < 3) continue;
      }
      if (j > 0) {
        n = clipHalf(src, n, 0, 1, -z0, dst);
        const t = src; src = dst; dst = t;
        if (n < 3) continue;
      }
      if (j < TIN_N - 1) {
        n = clipHalf(src, n, 0, -1, z1, dst);
        const t = src; src = dst; dst = t;
        if (n < 3) continue;
      }
      // Diagonale u = v : (x − x0) − (z − z0) = 0.
      const c = z0 - x0;
      const m1 = clipHalf(src, n, 1, -1, c, dst);
      emitIfArea(dst, m1, sink);
      const m2 = clipHalf(src, n, -1, 1, -c, dst);
      emitIfArea(dst, m2, sink);
    }
  }
}

/** Taille des tampons de travail (tests). */
export function tinScratchCapacity(): number {
  return Math.min(bufA.length, bufB.length) / 2;
}

/** Réinitialise les tampons de travail (libération en fin de partie). */
export function releaseTinScratch(): void {
  bufA = new Float64Array(40);
  bufB = new Float64Array(40);
}
