/* =====================================================================================
 * DANGERS DIFFUS — accès ponctuels au champ : dépôt (émission), lecture, visibilité, rabattement.
 * Aucune de ces fonctions n'alloue.
 * ===================================================================================== */

import * as cfg from './config';
import type { HazardCellCallback } from './api';
import type { Block, FieldGrid } from './grid';

// Copies locales des constantes : les boucles chaudes ne passent pas par l'objet module à chaque accès
// (sous vitest, un import est un accesseur ; en production le compilateur les aurait de toute façon fondues).
const BLOCK_CELLS = cfg.BLOCK_CELLS;
const BLOCK_MASK = cfg.BLOCK_MASK;
const BLOCK_SHIFT = cfg.BLOCK_SHIFT;
const BLOCK_SIZE = cfg.BLOCK_SIZE;
const BLOCK_AREA = cfg.BLOCK_AREA;
const CELL = cfg.CELL;
const INV_CELL = cfg.INV_CELL;
const DEPOSIT_MIN_RADIUS = cfg.DEPOSIT_MIN_RADIUS;
const DEPOSIT_MAX_RADIUS = cfg.DEPOSIT_MAX_RADIUS;
const GAS_CAP = cfg.GAS_CAP;
const SMOKE_CAP = cfg.SMOKE_CAP;
/** Saturation douce : dépôt intégral jusqu'à la concentration 1, puis décroissant linéairement jusqu'au plafond. */
const SOFT_FROM = 1;
const GAS_SOFT = 1 / (GAS_CAP - SOFT_FROM);
const SMOKE_SOFT = 1 / (SMOKE_CAP - SOFT_FROM);

/** Poids du noyau de dépôt, réutilisés d'un appel à l'autre (rayon ≤ 30 m → au plus 32 × 32 cellules). */
const WEIGHTS = new Float32Array(1024);

/**
 * Dépose du gaz (smoke = false) ou de la fumée colorée autour d'un point.
 *
 * `amount` est la concentration ajoutée au centre ; elle décroît jusqu'à zéro à `radius` selon un
 * profil lisse (1 − d²/r²)². La masse déposée est exactement amount × π r² / 3, quelle que soit la
 * position du point par rapport à la grille (les poids discrets sont normalisés) : un émetteur qui
 * roule ne « pulse » pas. Les cellules bâties ne reçoivent rien (leur part va aux cellules libres).
 * Dans une cellule déjà au-delà de 1, le dépôt s'amenuise et s'annule au plafond (GAS_CAP / SMOKE_CAP).
 * Retourne la masse réellement déposée (concentration × m²).
 */
export function deposit(
  grid: FieldGrid, x: number, z: number, amount: number, radius: number, smoke: boolean, cr: number, cg: number, cb: number,
): number {
  if (!(amount > 0) || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(amount)) return 0;
  let r = Number.isFinite(radius) ? radius : DEPOSIT_MIN_RADIUS;
  if (r < DEPOSIT_MIN_RADIUS) r = DEPOSIT_MIN_RADIUS;
  else if (r > DEPOSIT_MAX_RADIUS) r = DEPOSIT_MAX_RADIUS;
  const r2 = r * r;
  const i0 = Math.floor((x - r) * INV_CELL);
  const i1 = Math.floor((x + r) * INV_CELL);
  const j0 = Math.floor((z - r) * INV_CELL);
  const j1 = Math.floor((z + r) * INV_CELL);

  // 1. poids des cellules libres (alloue les blocs concernés)
  let n = 0;
  let total = 0;
  for (let j = j0; j <= j1; j++) {
    const dz = (j + 0.5) * CELL - z;
    for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * CELL - x;
      const d2 = dx * dx + dz * dz;
      let w = 0;
      if (d2 < r2 && grid.isFree(i, j) && grid.ensure(i >> BLOCK_SHIFT, j >> BLOCK_SHIFT) !== null) {
        const u = 1 - d2 / r2;
        w = u * u;
      }
      WEIGHTS[n++] = w;
      total += w;
    }
  }
  // Rien de libre à portée (émetteur au cœur d'un immeuble, plafond de blocs atteint) : rien n'est déposé.
  if (total <= 1e-6) return 0;

  // 2. dépôt normalisé, avec saturation douce. Le corps est écrit en ligne : aucun nombre réel ne passe
  //    par un appel de fonction (un réel passé à une fonction non intégrée par le compilateur est alloué).
  const scale = (amount * Math.PI * r2) / (3 * total * CELL * CELL);
  const step = grid.step;
  let mass = 0;
  n = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const w = WEIGHTS[n++]!;
      if (w <= 0) continue;
      const b = grid.find(i >> BLOCK_SHIFT, j >> BLOCK_SHIFT);
      if (b === null) continue;
      const k = ((j & BLOCK_MASK) << BLOCK_SHIFT) | (i & BLOCK_MASK);
      b.touched = step;
      if (!smoke) {
        const c = b.gas[k]!;
        if (c >= GAS_CAP) continue;
        let a = w * scale;
        if (c > SOFT_FROM) a *= (GAS_CAP - c) * GAS_SOFT; // au-delà de 1, le dépôt s'amenuise jusqu'au plafond
        if (a > GAS_CAP - c) a = GAS_CAP - c; // un dépôt massif ne dépasse pas le plafond non plus
        const nv = c + a;
        b.gas[k] = nv;
        if (nv > b.gasMax) b.gasMax = nv;
        mass += a;
      } else {
        const c = b.smoke[k]!;
        if (c >= SMOKE_CAP) continue;
        let a = w * scale;
        if (c > SOFT_FROM) a *= (SMOKE_CAP - c) * SMOKE_SOFT;
        if (a > SMOKE_CAP - c) a = SMOKE_CAP - c;
        const nv = c + a;
        b.smokeOn = true;
        b.smokeTouched = step;
        b.smoke[k] = nv;
        b.sr[k] += a * cr;
        b.sg[k] += a * cg;
        b.sb[k] += a * cb;
        if (nv > b.smokeMax) b.smokeMax = nv;
        mass += a;
      }
    }
  }
  return mass * CELL * CELL;
}

/**
 * Valeur du champ en un point (gaz ou fumée), interpolée entre les centres des quatre cellules
 * voisines. Les cellules bâties sont exclues de l'interpolation (pas de sous-estimation le long des
 * façades) ; un point situé dans le bâti lit 0. Valeur non bornée (peut dépasser 1 près d'une source).
 */
export function sampleField(grid: FieldGrid, x: number, z: number, smoke: boolean): number {
  if (grid.blocks.length === 0) return 0;
  const fx = x * INV_CELL - 0.5;
  const fz = z * INV_CELL - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const tx = fx - i0;
  const tz = fz - j0;
  const li = i0 & BLOCK_MASK;
  const lj = j0 & BLOCK_MASK;
  if (li < BLOCK_MASK && lj < BLOCK_MASK) {
    // cas courant : les quatre cellules sont dans le même bloc
    const b = grid.find(i0 >> BLOCK_SHIFT, j0 >> BLOCK_SHIFT);
    if (b === null) return 0;
    const c = smoke ? b.smoke : b.gas;
    const k = (lj << BLOCK_SHIFT) | li;
    const solid = b.st.solid;
    if (solid === null) {
      const top = c[k]! + (c[k + 1]! - c[k]!) * tx;
      const bottom = c[k + BLOCK_CELLS]! + (c[k + BLOCK_CELLS + 1]! - c[k + BLOCK_CELLS]!) * tx;
      return top + (bottom - top) * tz;
    }
    const own = k + (tx >= 0.5 ? 1 : 0) + (tz >= 0.5 ? BLOCK_CELLS : 0);
    if (solid[own] !== 0) return 0;
    const w00 = solid[k] !== 0 ? 0 : (1 - tx) * (1 - tz);
    const w10 = solid[k + 1] !== 0 ? 0 : tx * (1 - tz);
    const w01 = solid[k + BLOCK_CELLS] !== 0 ? 0 : (1 - tx) * tz;
    const w11 = solid[k + BLOCK_CELLS + 1] !== 0 ? 0 : tx * tz;
    const wsum = w00 + w10 + w01 + w11;
    if (wsum < 1e-6) return 0;
    return (w00 * c[k]! + w10 * c[k + 1]! + w01 * c[k + BLOCK_CELLS]! + w11 * c[k + BLOCK_CELLS + 1]!) / wsum;
  }
  // à cheval sur plusieurs blocs
  if (cellValue(grid, i0 + (tx >= 0.5 ? 1 : 0), j0 + (tz >= 0.5 ? 1 : 0), smoke) < 0) return 0;
  const v00 = cellValue(grid, i0, j0, smoke);
  const v10 = cellValue(grid, i0 + 1, j0, smoke);
  const v01 = cellValue(grid, i0, j0 + 1, smoke);
  const v11 = cellValue(grid, i0 + 1, j0 + 1, smoke);
  const w00 = v00 < 0 ? 0 : (1 - tx) * (1 - tz);
  const w10 = v10 < 0 ? 0 : tx * (1 - tz);
  const w01 = v01 < 0 ? 0 : (1 - tx) * tz;
  const w11 = v11 < 0 ? 0 : tx * tz;
  const wsum = w00 + w10 + w01 + w11;
  if (wsum < 1e-6) return 0;
  return (w00 * v00 + w10 * v10 + w01 * v01 + w11 * v11) / wsum;
}

/** Valeur d'une cellule par ses indices globaux ; 0 si le bloc n'existe pas ; −1 si la cellule est bâtie. */
function cellValue(grid: FieldGrid, ci: number, cj: number, smoke: boolean): number {
  const b = grid.find(ci >> BLOCK_SHIFT, cj >> BLOCK_SHIFT);
  if (b === null) return 0;
  const k = ((cj & BLOCK_MASK) << BLOCK_SHIFT) | (ci & BLOCK_MASK);
  if (b.st.solid !== null && b.st.solid[k] !== 0) return -1;
  return smoke ? b.smoke[k]! : b.gas[k]!;
}

/**
 * Épaisseur optique du segment AB : intégrale de kSmoke × fumée + kGas × max(0, gaz − gasMin),
 * échantillonnée tous les 2 m (au plus 256 points). S'arrête dès que `cutoff` est dépassé.
 */
export function opticalDepth(
  grid: FieldGrid, ax: number, az: number, bx: number, bz: number, kSmoke: number, kGas: number, gasMin: number, cutoff: number,
): number {
  if (grid.blocks.length === 0) return 0;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (!(len >= 0) || !Number.isFinite(len)) return 0;
  let n = Math.ceil(len * INV_CELL);
  if (n < 1) n = 1;
  else if (n > 256) n = 256;
  const ds = len / n;
  const sx = dx / n;
  const sz = dz / n;
  let x = ax + sx * 0.5;
  let z = az + sz * 0.5;
  let tau = 0;
  let cbx = 0x7fffffff;
  let cbz = 0x7fffffff;
  let b: Block | null = null;
  for (let s = 0; s < n; s++, x += sx, z += sz) {
    const ci = Math.floor(x * INV_CELL);
    const cj = Math.floor(z * INV_CELL);
    const nbx = ci >> BLOCK_SHIFT;
    const nbz = cj >> BLOCK_SHIFT;
    if (nbx !== cbx || nbz !== cbz) {
      cbx = nbx;
      cbz = nbz;
      b = grid.find(nbx, nbz);
    }
    if (b === null) continue;
    const k = ((cj & BLOCK_MASK) << BLOCK_SHIFT) | (ci & BLOCK_MASK);
    const g = b.gas[k]! - gasMin;
    tau += ds * (kSmoke * b.smoke[k]! + (g > 0 ? kGas * g : 0));
    if (tau > cutoff) return tau;
  }
  return tau;
}

/**
 * Rabat le gaz et la fumée dans un disque (eau, poudre) : chaque cellule perd la fraction
 * `fraction` × (1 − d²/r²). Retourne la masse de gaz retirée (concentration × m²).
 */
export function washout(grid: FieldGrid, x: number, z: number, radius: number, fraction: number): number {
  if (grid.blocks.length === 0 || !(fraction > 0) || !(radius > 0)) return 0;
  const f = fraction < 1 ? fraction : 1;
  const r2 = radius * radius;
  const i0 = Math.floor((x - radius) * INV_CELL);
  const i1 = Math.floor((x + radius) * INV_CELL);
  const j0 = Math.floor((z - radius) * INV_CELL);
  const j1 = Math.floor((z + radius) * INV_CELL);
  let removed = 0;
  for (let j = j0; j <= j1; j++) {
    const dz = (j + 0.5) * CELL - z;
    for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * CELL - x;
      const d2 = dx * dx + dz * dz;
      // la cellule qui contient le point est toujours traitée, même si son centre est hors du rayon
      const inside = d2 < r2 || (Math.abs(dx) <= CELL * 0.5 && Math.abs(dz) <= CELL * 0.5);
      if (!inside) continue;
      const b = grid.find(i >> BLOCK_SHIFT, j >> BLOCK_SHIFT);
      if (b === null) continue;
      const k = ((j & BLOCK_MASK) << BLOCK_SHIFT) | (i & BLOCK_MASK);
      const u = d2 < r2 ? 1 - d2 / r2 : 0.25;
      const keep = 1 - f * u;
      const g = b.gas[k]!;
      removed += g * (1 - keep);
      b.gas[k] = g * keep;
      if (b.smokeOn) {
        b.smoke[k] *= keep;
        b.sr[k] *= keep;
        b.sg[k] *= keep;
        b.sb[k] *= keep;
      }
    }
  }
  return removed * CELL * CELL;
}

/**
 * Parcourt les cellules dont le gaz ou la fumée atteint `min`. Si radius > 0, seuls les blocs à
 * portée de (cx, cz) sont visités. Retourne le nombre de cellules transmises à `cb`.
 */
export function forEachCell(
  grid: FieldGrid, cb: HazardCellCallback, min: number, cx: number, cz: number, radius: number,
): number {
  const blocks = grid.blocks;
  const limited = radius > 0;
  // demi-diagonale d'un bloc : tout bloc dont le centre est plus loin ne peut pas toucher le disque
  const reach = radius + BLOCK_SIZE * 0.7072;
  const reach2 = reach * reach;
  let count = 0;
  for (let n = 0; n < blocks.length; n++) {
    const b = blocks[n]!;
    if (b.gasMax < min && b.smokeMax < min) continue;
    const ox = b.bx * BLOCK_SIZE;
    const oz = b.bz * BLOCK_SIZE;
    if (limited) {
      const dx = ox + BLOCK_SIZE * 0.5 - cx;
      const dz = oz + BLOCK_SIZE * 0.5 - cz;
      if (dx * dx + dz * dz > reach2) continue;
    }
    const gas = b.gas;
    const smoke = b.smoke;
    const hasSmoke = b.smokeOn;
    for (let k = 0; k < BLOCK_AREA; k++) {
      const g = gas[k]!;
      const s = hasSmoke ? smoke[k]! : 0;
      if (g < min && s < min) continue;
      const color = s > 1e-6 ? packColor(b.sr[k]!, b.sg[k]!, b.sb[k]!, s) : 0;
      cb(ox + ((k & BLOCK_MASK) + 0.5) * CELL, oz + ((k >> BLOCK_SHIFT) + 0.5) * CELL, g, s, color);
      count++;
    }
  }
  return count;
}

/**
 * Variante sans rappel : écrit les cellules actives dans `out` par paquets de 5 nombres
 * (x, z, gaz, fumée, couleur) et retourne le nombre de cellules écrites (borné par out.length / 5).
 * Aucun nombre n'est passé en argument de fonction : aucune allocation, même sans optimisation.
 */
export function collectCells(
  grid: FieldGrid, out: Float32Array, min: number, cx: number, cz: number, radius: number,
): number {
  const blocks = grid.blocks;
  const limited = radius > 0;
  const reach = radius + BLOCK_SIZE * 0.7072;
  const reach2 = reach * reach;
  const capacity = Math.floor(out.length / 5);
  let count = 0;
  for (let n = 0; n < blocks.length && count < capacity; n++) {
    const b = blocks[n]!;
    if (b.gasMax < min && b.smokeMax < min) continue;
    const ox = b.bx * BLOCK_SIZE;
    const oz = b.bz * BLOCK_SIZE;
    if (limited) {
      const dx = ox + BLOCK_SIZE * 0.5 - cx;
      const dz = oz + BLOCK_SIZE * 0.5 - cz;
      if (dx * dx + dz * dz > reach2) continue;
    }
    const gas = b.gas;
    const smoke = b.smoke;
    const hasSmoke = b.smokeOn;
    for (let k = 0; k < BLOCK_AREA && count < capacity; k++) {
      const g = gas[k]!;
      const s = hasSmoke ? smoke[k]! : 0;
      if (g < min && s < min) continue;
      const o = count * 5;
      out[o] = ox + ((k & BLOCK_MASK) + 0.5) * CELL;
      out[o + 1] = oz + ((k >> BLOCK_SHIFT) + 0.5) * CELL;
      out[o + 2] = g;
      out[o + 3] = s;
      if (s > 1e-6) {
        const inv = 255 / s;
        let cr = b.sr[k]! * inv;
        let cg = b.sg[k]! * inv;
        let cb = b.sb[k]! * inv;
        if (cr > 255) cr = 255;
        if (cg > 255) cg = 255;
        if (cb > 255) cb = 255;
        out[o + 4] = ((cr + 0.5) << 16) | ((cg + 0.5) << 8) | ((cb + 0.5) | 0);
      } else {
        out[o + 4] = 0;
      }
      count++;
    }
  }
  return count;
}

/** Couleur 0xRRGGBB à partir des composantes prémultipliées et de la densité. */
function packColor(pr: number, pg: number, pb: number, density: number): number {
  const inv = 255 / density;
  let r = pr * inv;
  let g = pg * inv;
  let b = pb * inv;
  if (r > 255) r = 255;
  if (g > 255) g = 255;
  if (b > 255) b = 255;
  return ((r + 0.5) << 16) | ((g + 0.5) << 8) | ((b + 0.5) | 0);
}

/** Somme exacte d'un canal sur toute la grille (concentration × m²). */
export function totalMass(grid: FieldGrid, smoke: boolean): number {
  const blocks = grid.blocks;
  let sum = 0;
  for (let n = 0; n < blocks.length; n++) {
    const c = smoke ? blocks[n]!.smoke : blocks[n]!.gas;
    let s = 0;
    for (let k = 0; k < c.length; k++) s += c[k]!;
    sum += s;
  }
  return sum * CELL * CELL;
}
