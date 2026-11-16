/* =====================================================================================
 * DANGERS DIFFUS — passes de transport : les quatre boucles chaudes du module.
 *
 * Pour chaque face entre deux cellules voisines : flux = p × c[ouest ou nord] − q × c[est ou sud]
 * (advection amont + diffusion, coefficients par face préparés par solver.ts). Les flux sont
 * accumulés dans les tableaux d[] des deux cellules — celle du bloc voisin pour les faces de bord —
 * puis la passe d'application les ajoute, applique le facteur de conservation et remet d[] à zéro.
 * Comme les flux d'un sous-pas sont tous calculés sur l'état d'avant, l'ordre des blocs est sans effet.
 *
 * Coût par bloc : ≈ 480 faces + 256 cellules par canal (1 canal pour le gaz, 4 pour la fumée :
 * densité + couleur prémultipliée). Aucune allocation, aucun nombre réel passé en argument.
 * ===================================================================================== */

import * as cfg from './config';
import type { Block } from './grid';

// Copies locales des constantes (voir sampling.ts) : indispensables dans ces boucles.
const BLOCK_AREA = cfg.BLOCK_AREA;
const BLOCK_CELLS = cfg.BLOCK_CELLS;
const CELL_EPS = cfg.CELL_EPS;
const GAS_CAP = cfg.GAS_CAP;
const SMOKE_CAP = cfg.SMOKE_CAP;
const LAST = BLOCK_CELLS - 1;
const LAST_ROW = BLOCK_AREA - BLOCK_CELLS;

/** Flux du gaz à travers les faces est et sud de chaque cellule du bloc (bords vers les voisins compris). */
export function fluxGas(b: Block): void {
  const c = b.gas;
  const d = b.dA;
  const pE = b.pE;
  const qE = b.qE;
  const pS = b.pS;
  const qS = b.qS;
  if (b.gasMax > 0) {
    for (let r = 0; r < BLOCK_AREA; r += BLOCK_CELLS) {
      for (let k = r, end = r + LAST; k < end; k++) {
        const f = pE[k]! * c[k]! - qE[k]! * c[k + 1]!;
        d[k] -= f;
        d[k + 1] += f;
      }
    }
    for (let k = 0; k < LAST_ROW; k++) {
      const f = pS[k]! * c[k]! - qS[k]! * c[k + BLOCK_CELLS]!;
      d[k] -= f;
      d[k + BLOCK_CELLS] += f;
    }
  }
  const e = b.e;
  if (e !== null && (b.gasMax > 0 || e.gasMax > 0)) {
    const ce = e.gas;
    const de = e.dA;
    for (let k = LAST, k2 = 0; k < BLOCK_AREA; k += BLOCK_CELLS, k2 += BLOCK_CELLS) {
      const f = pE[k]! * c[k]! - qE[k]! * ce[k2]!;
      d[k] -= f;
      de[k2] += f;
    }
  }
  const s = b.s;
  if (s !== null && (b.gasMax > 0 || s.gasMax > 0)) {
    const cs = s.gas;
    const ds = s.dA;
    for (let k = LAST_ROW, k2 = 0; k < BLOCK_AREA; k++, k2++) {
      const f = pS[k]! * c[k]! - qS[k]! * cs[k2]!;
      d[k] -= f;
      ds[k2] += f;
    }
  }
}

/** Applique les flux et le facteur de conservation ; met à jour le maximum et la somme du bloc. */
export function applyGas(b: Block): void {
  const c = b.gas;
  const d = b.dA;
  const m = b.mG;
  let max = 0;
  let sum = 0;
  for (let k = 0; k < BLOCK_AREA; k++) {
    let v = (c[k]! + d[k]!) * m[k]!;
    d[k] = 0;
    if (v < CELL_EPS) v = 0;
    else {
      if (v > GAS_CAP) v = GAS_CAP; // entassement contre une façade : jamais au-delà du plafond
      sum += v;
      if (v > max) max = v;
    }
    c[k] = v;
  }
  b.gasMax = max;
  b.gasSum = sum;
}

/** Flux de la fumée et de sa couleur prémultipliée (quatre canaux, mêmes coefficients). */
export function fluxSmoke(b: Block): void {
  const c = b.smoke;
  const cr = b.sr;
  const cg = b.sg;
  const cb = b.sb;
  const d = b.dA;
  const dr = b.dR;
  const dg = b.dG;
  const db = b.dB;
  const pE = b.pE;
  const qE = b.qE;
  const pS = b.pS;
  const qS = b.qS;
  if (b.smokeMax > 0) {
    for (let r = 0; r < BLOCK_AREA; r += BLOCK_CELLS) {
      for (let k = r, end = r + LAST; k < end; k++) {
        const p = pE[k]!;
        const q = qE[k]!;
        let f = p * c[k]! - q * c[k + 1]!;
        d[k] -= f;
        d[k + 1] += f;
        f = p * cr[k]! - q * cr[k + 1]!;
        dr[k] -= f;
        dr[k + 1] += f;
        f = p * cg[k]! - q * cg[k + 1]!;
        dg[k] -= f;
        dg[k + 1] += f;
        f = p * cb[k]! - q * cb[k + 1]!;
        db[k] -= f;
        db[k + 1] += f;
      }
    }
    for (let k = 0; k < LAST_ROW; k++) {
      const p = pS[k]!;
      const q = qS[k]!;
      const k2 = k + BLOCK_CELLS;
      let f = p * c[k]! - q * c[k2]!;
      d[k] -= f;
      d[k2] += f;
      f = p * cr[k]! - q * cr[k2]!;
      dr[k] -= f;
      dr[k2] += f;
      f = p * cg[k]! - q * cg[k2]!;
      dg[k] -= f;
      dg[k2] += f;
      f = p * cb[k]! - q * cb[k2]!;
      db[k] -= f;
      db[k2] += f;
    }
  }
  const e = b.e;
  if (e !== null && e.smokeOn && (b.smokeMax > 0 || e.smokeMax > 0)) {
    for (let k = LAST, k2 = 0; k < BLOCK_AREA; k += BLOCK_CELLS, k2 += BLOCK_CELLS) {
      const p = pE[k]!;
      const q = qE[k]!;
      let f = p * c[k]! - q * e.smoke[k2]!;
      d[k] -= f;
      e.dA[k2] += f;
      f = p * cr[k]! - q * e.sr[k2]!;
      dr[k] -= f;
      e.dR[k2] += f;
      f = p * cg[k]! - q * e.sg[k2]!;
      dg[k] -= f;
      e.dG[k2] += f;
      f = p * cb[k]! - q * e.sb[k2]!;
      db[k] -= f;
      e.dB[k2] += f;
    }
  }
  const s = b.s;
  if (s !== null && s.smokeOn && (b.smokeMax > 0 || s.smokeMax > 0)) {
    for (let k = LAST_ROW, k2 = 0; k < BLOCK_AREA; k++, k2++) {
      const p = pS[k]!;
      const q = qS[k]!;
      let f = p * c[k]! - q * s.smoke[k2]!;
      d[k] -= f;
      s.dA[k2] += f;
      f = p * cr[k]! - q * s.sr[k2]!;
      dr[k] -= f;
      s.dR[k2] += f;
      f = p * cg[k]! - q * s.sg[k2]!;
      dg[k] -= f;
      s.dG[k2] += f;
      f = p * cb[k]! - q * s.sb[k2]!;
      db[k] -= f;
      s.dB[k2] += f;
    }
  }
}

/** Applique les flux de fumée ; une cellule sous le seuil perd aussi sa couleur. */
export function applySmoke(b: Block): void {
  const c = b.smoke;
  const cr = b.sr;
  const cg = b.sg;
  const cb = b.sb;
  const d = b.dA;
  const dr = b.dR;
  const dg = b.dG;
  const db = b.dB;
  const m = b.mS;
  let max = 0;
  let sum = 0;
  for (let k = 0; k < BLOCK_AREA; k++) {
    let mk = m[k]!;
    let v = (c[k]! + d[k]!) * mk;
    d[k] = 0;
    if (v < CELL_EPS) {
      c[k] = 0;
      cr[k] = 0;
      cg[k] = 0;
      cb[k] = 0;
    } else {
      if (v > SMOKE_CAP) {
        mk *= SMOKE_CAP / v; // la couleur prémultipliée suit la densité plafonnée
        v = SMOKE_CAP;
      }
      c[k] = v;
      cr[k] = (cr[k]! + dr[k]!) * mk;
      cg[k] = (cg[k]! + dg[k]!) * mk;
      cb[k] = (cb[k]! + db[k]!) * mk;
      sum += v;
      if (v > max) max = v;
    }
    dr[k] = 0;
    dg[k] = 0;
    db[k] = 0;
  }
  b.smokeMax = max;
  b.smokeSum = sum;
}
