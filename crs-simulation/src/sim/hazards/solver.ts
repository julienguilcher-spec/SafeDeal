/* =====================================================================================
 * DANGERS DIFFUS — transport du gaz et de la fumée sur la grille creuse.
 *
 * Schéma (volumes finis, explicite, conservatif) : à chaque sous-pas, pour chaque face entre deux
 * cellules voisines,
 *     flux = p × c[amont côté ouest/nord] − q × c[côté est/sud]
 * avec p = max(a, 0) + k et q = max(−a, 0) + k, où a est le nombre de Courant de la dérive sur la
 * face (advection amont) et k le nombre de diffusion. Les faces bâties ou sans bloc voisin sont
 * fermées (p = q = 0) : le gaz ne traverse pas les immeubles. Puis chaque cellule est multipliée par
 * un facteur de conservation qui réunit :
 *   - la dilution verticale (taux de base, × vent local, × pluie, réduite dans une rue étroite) ;
 *   - l'« envol » : là où la dérive converge (nuage poussé contre une façade, fond d'impasse), l'air
 *     monte et emporte le gaz par-dessus les toits au lieu de l'entasser au pied du mur.
 *
 * La dérive locale n'est pas le vent brut : dans une rue, seule la composante d'enfilade passe, la
 * composante de travers est arrêtée par les façades (voir statics.ts). Les coefficients sont
 * recalculés par bloc toutes les 0,8 s environ, de façon étalée ; un bloc en plein vent entouré de
 * blocs en plein vent a des coefficients uniformes (remplissage direct).
 *
 * Coût : passe de flux ≈ 2 × 240 faces, passe d'application 256 cellules, par bloc et par canal
 * (1 canal pour le gaz, 4 pour la fumée : densité + couleur prémultipliée).
 * ===================================================================================== */

import {
  BLOCK_AREA, BLOCK_CELLS, CELL, CELL_EPS, COURANT_MAX, FIELD_DT, FREE_EPS, IDLE_STEPS, REFRESH_PERIOD,
  SPREAD_EPS, STATIC_JOBS_PER_STEP,
} from './config';
import type { HazardTuning } from './config';
import { wipeSmoke } from './grid';
import type { Block, FieldGrid } from './grid';
import { AXES } from './statics';
import type { StaticBlock, StaticCache } from './statics';
import type { WindModel } from './wind';

/** Côté du tampon de travail : le bloc et une rangée de cellules de chaque voisin. */
const PADW = BLOCK_CELLS + 2;
const LAST = BLOCK_CELLS - 1;
const LAST_ROW = BLOCK_AREA - BLOCK_CELLS;
const HALF_AXES = AXES / 2;
/** Nombre de diffusion maximal par sous-pas (stabilité : 4 × COURANT_MAX + 4 × K_MAX ≤ 1). */
const K_MAX = 0.05;

export class FieldSolver {
  /** Masse de gaz et de fumée après le dernier pas (concentration × m²). */
  totalGas = 0;
  totalSmoke = 0;
  /** Pas de champ exécutés (gaz et fumée confondus). */
  fieldSteps = 0;

  // tampons de travail du recalcul des coefficients (18 × 18)
  private readonly ux = new Float32Array(PADW * PADW);
  private readonly uz = new Float32Array(PADW * PADW);
  private readonly enc = new Float32Array(PADW * PADW);
  private readonly closed = new Uint8Array(PADW * PADW);

  // paramètres du sous-pas courant
  private alpha = 0;
  private kd = 0;
  private lamG = 0;
  private lamS = 0;

  private readonly onStaticReady: (st: StaticBlock) => void;

  constructor(
    private readonly grid: FieldGrid,
    private readonly statics: StaticCache,
    private readonly wind: WindModel,
    private readonly tuning: HazardTuning,
  ) {
    this.onStaticReady = (st: StaticBlock): void => {
      const b = this.grid.find(st.bx, st.bz);
      if (b !== null) markAround(b);
    };
  }

  reset(): void {
    this.totalGas = 0;
    this.totalSmoke = 0;
    this.fieldSteps = 0;
  }

  /** Tous les coefficients sont à recalculer (changement du nombre de sous-pas, saute de vent brutale). */
  markAllDirty(): void {
    const blocks = this.grid.blocks;
    for (let i = 0; i < blocks.length; i++) blocks[i]!.dirty = true;
  }

  /**
   * Entretien, une fois par pas de champ du gaz : extension aux blocs voisins des bords chargés,
   * libération des blocs vides, analyse différée du bâti, rafraîchissement étalé des coefficients.
   */
  maintain(): void {
    const grid = this.grid;
    const blocks = grid.blocks;
    const step = ++grid.step;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!;
      if (b.st.stale) this.reattach(b);
      const gasHigh = b.gasMax > SPREAD_EPS;
      const smokeHigh = b.smokeOn && b.smokeMax > SPREAD_EPS;
      if (gasHigh || smokeHigh) {
        b.touched = step;
        this.spread(b, 0, step);
        this.spread(b, 1, step);
        this.spread(b, 2, step);
        this.spread(b, 3, step);
      } else if (b.gasMax >= FREE_EPS || b.smokeMax >= FREE_EPS) {
        b.touched = step;
      } else if (step - b.touched > IDLE_STEPS) {
        grid.release(b); // le dernier bloc a pris sa place : le revisiter
        i--;
        continue;
      }
      if (b.smokeOn) {
        if (b.smokeMax >= FREE_EPS) b.smokeTouched = step;
        else if (step - b.smokeTouched > IDLE_STEPS) wipeSmoke(b);
      }
    }
    this.statics.runJobs(STATIC_JOBS_PER_STEP, this.onStaticReady);
    this.prepare();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!;
      if (b.dirty || (b.serial + step) % REFRESH_PERIOD === 0) this.refresh(b);
    }
  }

  /** Avance le gaz de FIELD_DT. */
  stepGas(): void {
    const blocks = this.grid.blocks;
    const n = blocks.length;
    this.fieldSteps++;
    if (n === 0) {
      this.totalGas = 0;
      return;
    }
    this.prepare();
    for (let i = 0; i < n; i++) if (blocks[i]!.dirty) this.refresh(blocks[i]!);
    let sum = 0;
    for (let s = this.wind.substeps; s > 0; s--) {
      for (let i = 0; i < n; i++) fluxGas(blocks[i]!);
      sum = 0;
      for (let i = 0; i < n; i++) sum += applyGas(blocks[i]!);
    }
    this.totalGas = sum * CELL * CELL;
  }

  /** Avance la fumée de FIELD_DT (seuls les blocs qui en transportent sont parcourus). */
  stepSmoke(): void {
    const blocks = this.grid.blocks;
    const n = blocks.length;
    this.fieldSteps++;
    if (n === 0) {
      this.totalSmoke = 0;
      return;
    }
    this.prepare();
    for (let i = 0; i < n; i++) if (blocks[i]!.dirty) this.refresh(blocks[i]!);
    let sum = 0;
    for (let s = this.wind.substeps; s > 0; s--) {
      for (let i = 0; i < n; i++) if (blocks[i]!.smokeOn) fluxSmoke(blocks[i]!);
      sum = 0;
      for (let i = 0; i < n; i++) if (blocks[i]!.smokeOn) sum += applySmoke(blocks[i]!);
    }
    this.totalSmoke = sum * CELL * CELL;
  }

  /** Dérive locale (m/s) dans la cellule k d'un bloc de bâti donné ; écrit dans ux[P], uz[P], enc[P]. */
  velocityOf(st: StaticBlock, k: number, out: { x: number; z: number }): void {
    const w = this.wind;
    const solid = st.solid;
    if (solid !== null && solid[k] !== 0) {
      out.x = 0;
      out.z = 0;
      return;
    }
    const axis = st.axis;
    if (axis === null) {
      out.x = w.driftX;
      out.z = w.driftZ;
      return;
    }
    const a = axis[k]!;
    const b = (a + HALF_AXES) % AXES;
    const al = st.along![k]! / 255;
    const ac = st.across![k]! / 255;
    out.x = al * w.projX[a]! + ac * w.projX[b]!;
    out.z = al * w.projZ[a]! + ac * w.projZ[b]!;
  }

  // ───────────────────────────── entretien ─────────────────────────────

  /** Le bâti du bloc a été invalidé (tuile chargée ou déchargée) : le redemander et vider les cellules devenues bâties. */
  private reattach(b: Block): void {
    this.statics.release(b.st);
    const st = this.statics.acquire(b.bx, b.bz);
    if (st === null) return;
    b.st = st;
    const solid = st.solid;
    if (solid !== null) {
      for (let k = 0; k < BLOCK_AREA; k++) {
        if (solid[k] === 0) continue;
        b.gas[k] = 0;
        b.smoke[k] = 0;
        b.sr[k] = 0;
        b.sg[k] = 0;
        b.sb[k] = 0;
      }
    }
    markAround(b);
  }

  /**
   * Bord `side` du bloc (0 ouest, 1 est, 2 nord, 3 sud) : s'il porte du gaz ou de la fumée au-dessus
   * du seuil, le bloc voisin est alloué (sauf s'il n'offre que du bâti en regard) et maintenu en vie.
   */
  private spread(b: Block, side: number, step: number): void {
    let start = 0;
    let stride = BLOCK_CELLS;
    let facing = LAST;
    let nb = b.w;
    let nbx = b.bx - 1;
    let nbz = b.bz;
    if (side === 1) {
      start = LAST;
      facing = 0;
      nb = b.e;
      nbx = b.bx + 1;
    } else if (side === 2) {
      stride = 1;
      facing = LAST_ROW;
      nb = b.n;
      nbx = b.bx;
      nbz = b.bz - 1;
    } else if (side === 3) {
      start = LAST_ROW;
      stride = 1;
      facing = 0;
      nb = b.s;
      nbx = b.bx;
      nbz = b.bz + 1;
    }
    const gas = b.gas;
    const smoke = b.smoke;
    let mg = 0;
    let ms = 0;
    for (let t = 0, k = start; t < BLOCK_CELLS; t++, k += stride) {
      if (gas[k]! > mg) mg = gas[k]!;
      if (smoke[k]! > ms) ms = smoke[k]!;
    }
    if (mg <= SPREAD_EPS && ms <= SPREAD_EPS) return;
    if (nb === null) {
      const nst = this.statics.peek(nbx, nbz);
      if (nst === null) return;
      const solid = nst.solid;
      if (solid !== null) {
        // ne compter que les cellules dont la voisine d'en face est libre
        mg = 0;
        ms = 0;
        for (let t = 0, k = start, f = facing; t < BLOCK_CELLS; t++, k += stride, f += stride) {
          if (solid[f] !== 0) continue;
          if (gas[k]! > mg) mg = gas[k]!;
          if (smoke[k]! > ms) ms = smoke[k]!;
        }
        if (mg <= SPREAD_EPS && ms <= SPREAD_EPS) return;
      }
      nb = this.grid.ensure(nbx, nbz);
      if (nb === null) return;
    }
    nb.touched = step;
    if (ms > SPREAD_EPS) {
      nb.smokeOn = true;
      nb.smokeTouched = step;
    }
  }

  // ───────────────────────────── coefficients ─────────────────────────────

  /** Paramètres du sous-pas d'après le vent, la pluie et le nombre de sous-pas courants. */
  private prepare(): void {
    const t = this.tuning;
    const w = this.wind;
    const dt = FIELD_DT / w.substeps;
    this.alpha = dt / CELL;
    let kd = ((t.diffusion + t.windDiffusion * w.speed) * dt) / (CELL * CELL);
    if (kd > K_MAX) kd = K_MAX;
    this.kd = kd;
    const rain = 1 + t.rainDecay * w.rain;
    this.lamG = t.gasDecay * rain * dt;
    this.lamS = t.smokeDecay * rain * dt;
  }

  /** Recalcule les coefficients de transport d'un bloc pour la dérive courante. */
  private refresh(b: Block): void {
    b.dirty = false;
    const t = this.tuning;
    const w = this.wind;
    const alpha = this.alpha;
    const kd = this.kd;
    const lamG = this.lamG;
    const lamS = this.lamS;

    // Cas courant en terrain dégagé : plein vent ici et chez les quatre voisins → coefficients uniformes.
    if (
      b.st.uniform && b.w !== null && b.e !== null && b.n !== null && b.s !== null
      && b.w.st.uniform && b.e.st.uniform && b.n.st.uniform && b.s.st.uniform
    ) {
      const aE = courant(w.driftX * alpha);
      const aS = courant(w.driftZ * alpha);
      const f = 1 + t.windDecay * w.speed;
      b.pE.fill((aE > 0 ? aE : 0) + kd);
      b.qE.fill((aE < 0 ? -aE : 0) + kd);
      b.pS.fill((aS > 0 ? aS : 0) + kd);
      b.qS.fill((aS < 0 ? -aS : 0) + kd);
      b.mG.fill(positive(1 - lamG * f));
      b.mS.fill(positive(1 - lamS * f));
      return;
    }

    // Cas général : dérive locale du bloc et d'une rangée de cellules de chaque voisin.
    const ux = this.ux;
    const uz = this.uz;
    const enc = this.enc;
    const closed = this.closed;
    for (let j = 0; j < BLOCK_CELLS; j++) {
      const row = j * BLOCK_CELLS;
      const prow = (j + 1) * PADW + 1;
      for (let i = 0; i < BLOCK_CELLS; i++) this.load(b.st, row + i, prow + i);
      // ouest et est
      if (b.w !== null) this.load(b.w.st, row + LAST, prow - 1); else closed[prow - 1] = 1;
      if (b.e !== null) this.load(b.e.st, row, prow + BLOCK_CELLS); else closed[prow + BLOCK_CELLS] = 1;
    }
    const south = (BLOCK_CELLS + 1) * PADW + 1;
    for (let i = 0; i < BLOCK_CELLS; i++) {
      if (b.n !== null) this.load(b.n.st, LAST_ROW + i, 1 + i); else closed[1 + i] = 1;
      if (b.s !== null) this.load(b.s.st, i, south + i); else closed[south + i] = 1;
    }

    const pE = b.pE;
    const qE = b.qE;
    const pS = b.pS;
    const qS = b.qS;
    const mG = b.mG;
    const mS = b.mS;
    const windDecay = t.windDecay;
    const retention = t.canyonRetention;
    for (let j = 0; j < BLOCK_CELLS; j++) {
      for (let i = 0; i < BLOCK_CELLS; i++) {
        const k = j * BLOCK_CELLS + i;
        const P = (j + 1) * PADW + i + 1;
        if (closed[P] !== 0) {
          pE[k] = 0; qE[k] = 0; pS[k] = 0; qS[k] = 0; mG[k] = 0; mS[k] = 0;
          continue;
        }
        const vx = ux[P]!;
        const vz = uz[P]!;
        let aE = 0;
        let aS = 0;
        let aW = 0;
        let aN = 0;
        if (closed[P + 1] === 0) {
          aE = courant(0.5 * (vx + ux[P + 1]!) * alpha);
          pE[k] = (aE > 0 ? aE : 0) + kd;
          qE[k] = (aE < 0 ? -aE : 0) + kd;
        } else {
          pE[k] = 0;
          qE[k] = 0;
        }
        if (closed[P + PADW] === 0) {
          aS = courant(0.5 * (vz + uz[P + PADW]!) * alpha);
          pS[k] = (aS > 0 ? aS : 0) + kd;
          qS[k] = (aS < 0 ? -aS : 0) + kd;
        } else {
          pS[k] = 0;
          qS[k] = 0;
        }
        if (closed[P - 1] === 0) aW = courant(0.5 * (ux[P - 1]! + vx) * alpha);
        if (closed[P - PADW] === 0) aN = courant(0.5 * (uz[P - PADW]! + vz) * alpha);
        // convergence de la dérive (div < 0) : l'air monte, le gaz s'envole au lieu de s'entasser
        const div = aE - aW + aS - aN;
        const lift = div < 0 ? positive(1 + div) : 1;
        const f = (1 - retention * enc[P]!) * (1 + windDecay * Math.sqrt(vx * vx + vz * vz));
        mG[k] = positive(1 - lamG * f) * lift;
        mS[k] = positive(1 - lamS * f) * lift;
      }
    }
  }

  /** Charge dans le tampon de travail (case P) la dérive locale de la cellule k d'un bloc de bâti. */
  private load(st: StaticBlock, k: number, P: number): void {
    const solid = st.solid;
    if (solid !== null && solid[k] !== 0) {
      this.closed[P] = 1;
      return;
    }
    this.closed[P] = 0;
    const w = this.wind;
    const axis = st.axis;
    if (axis === null) {
      this.ux[P] = w.driftX;
      this.uz[P] = w.driftZ;
      this.enc[P] = 0;
      return;
    }
    const a = axis[k]!;
    const c = (a + HALF_AXES) % AXES;
    const al = st.along![k]! / 255;
    const ac = st.across![k]! / 255;
    this.ux[P] = al * w.projX[a]! + ac * w.projX[c]!;
    this.uz[P] = al * w.projZ[a]! + ac * w.projZ[c]!;
    this.enc[P] = 1 - ac;
  }
}

function courant(a: number): number {
  return a > COURANT_MAX ? COURANT_MAX : a < -COURANT_MAX ? -COURANT_MAX : a;
}

function positive(v: number): number {
  return v > 0 ? v : 0;
}

/** Le bloc et ses quatre voisins recalculeront leurs coefficients. */
function markAround(b: Block): void {
  b.dirty = true;
  if (b.w !== null) b.w.dirty = true;
  if (b.e !== null) b.e.dirty = true;
  if (b.n !== null) b.n.dirty = true;
  if (b.s !== null) b.s.dirty = true;
}

// ───────────────────────────── passes de transport (boucles chaudes) ─────────────────────────────

/** Flux du gaz à travers les faces est et sud de chaque cellule du bloc (bords vers les voisins compris). */
function fluxGas(b: Block): void {
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

/** Applique les flux et le facteur de conservation ; retourne la somme des concentrations du bloc. */
function applyGas(b: Block): number {
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
      sum += v;
      if (v > max) max = v;
    }
    c[k] = v;
  }
  b.gasMax = max;
  b.gasSum = sum;
  return sum;
}

/** Flux de la fumée et de sa couleur prémultipliée (quatre canaux, mêmes coefficients). */
function fluxSmoke(b: Block): void {
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
function applySmoke(b: Block): number {
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
    const mk = m[k]!;
    const v = (c[k]! + d[k]!) * mk;
    d[k] = 0;
    if (v < CELL_EPS) {
      c[k] = 0;
      cr[k] = 0;
      cg[k] = 0;
      cb[k] = 0;
    } else {
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
  return sum;
}
