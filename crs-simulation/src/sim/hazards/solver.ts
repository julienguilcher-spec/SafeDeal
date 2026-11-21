/* =====================================================================================
 * DANGERS DIFFUS — transport du gaz et de la fumée sur la grille creuse : entretien des blocs,
 * coefficients de transport, enchaînement des passes (les boucles chaudes sont dans transport.ts).
 *
 * Schéma (volumes finis, explicite, conservatif) : à chaque sous-pas, pour chaque face entre deux
 * cellules voisines,
 *     flux = p × c[côté ouest ou nord] − q × c[côté est ou sud]
 * avec p = max(a, 0) + k et q = max(−a, 0) + k, où a est le nombre de Courant de la dérive sur la
 * face (advection amont) et k le nombre de diffusion. Les faces bâties ou sans bloc voisin sont
 * fermées (p = q = 0) : le gaz ne traverse pas les immeubles. Puis chaque cellule est multipliée par
 * un facteur de conservation qui réunit :
 *   - la dilution verticale (taux de base, accéléré par le vent local et par la pluie) ;
 *   - l'« envol » : là où la dérive converge (nuage poussé contre une façade, fond d'impasse), l'air
 *     monte et emporte l'essentiel du gaz par-dessus les toits ; le reste s'accumule au pied du mur.
 *
 * La dérive locale n'est pas le vent brut : dans une rue, seule la composante d'enfilade passe, la
 * composante de travers est arrêtée par les façades (voir statics.ts). Les coefficients sont
 * recalculés par bloc toutes les 0,8 s environ, de façon étalée ; un bloc en plein vent entouré de
 * blocs en plein vent a des coefficients uniformes (remplissage direct).
 *
 * Stabilité : le nombre de Courant est borné à 0,2 par axe et le nombre de diffusion à 0,05 ; une
 * cellule ne peut donc jamais céder plus que son contenu (4 × 0,2 + 4 × 0,05 = 1). Par grand vent, le
 * pas de champ est découpé en sous-pas (wind.ts) au lieu de dépasser cette borne ; le système les
 * exécute à leur propre cadence, répartis sur les pas du moteur.
 * ===================================================================================== */

import * as cfg from './config';
import type { HazardTuning } from './config';
import { wipeSmoke } from './grid';
import type { Block, FieldGrid } from './grid';
import * as transport from './transport';
import { AXES as STATIC_AXES } from './statics';
import type { StaticBlock, StaticCache } from './statics';
import type { WindModel } from './wind';

// Copies locales des constantes (voir sampling.ts) : indispensables dans les boucles de transport.
const BLOCK_AREA = cfg.BLOCK_AREA;
const BLOCK_CELLS = cfg.BLOCK_CELLS;
const CELL = cfg.CELL;
const COURANT_MAX = cfg.COURANT_MAX;
const FIELD_DT = cfg.FIELD_DT;
const FREE_EPS = cfg.FREE_EPS;
const IDLE_STEPS = cfg.IDLE_STEPS;
const REFRESH_PERIOD = cfg.REFRESH_PERIOD;
const SPREAD_EPS = cfg.SPREAD_EPS;
const STATIC_JOBS_PER_STEP = cfg.STATIC_JOBS_PER_STEP;
const AXES = STATIC_AXES;
const fluxGas = transport.fluxGas;
const applyGas = transport.applyGas;
const fluxSmoke = transport.fluxSmoke;
const applySmoke = transport.applySmoke;

/** Côté du tampon de travail : le bloc et une rangée de cellules de chaque voisin. */
const PADW = BLOCK_CELLS + 2;
const LAST = BLOCK_CELLS - 1;
const LAST_ROW = BLOCK_AREA - BLOCK_CELLS;
const HALF_AXES = AXES / 2;
/** Nombre de diffusion maximal par sous-pas (stabilité : 4 × COURANT_MAX + 4 × K_MAX ≤ 1). */
const K_MAX = 0.05;

export class FieldSolver {
  /** Masse de gaz et de fumée à l'issue du dernier pas de champ (concentration × m²). */
  totalGas = 0;
  totalSmoke = 0;
  /** Sous-pas de transport exécutés (gaz et fumée confondus). */
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
   * Entretien, une fois par période du champ : extension aux blocs voisins des bords chargés,
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

  /** Avance le gaz d'un sous-pas (FIELD_DT ÷ nombre de sous-pas : FIELD_DT entier par vent modéré). */
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
    for (let i = 0; i < n; i++) fluxGas(blocks[i]!);
    for (let i = 0; i < n; i++) applyGas(blocks[i]!);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += blocks[i]!.gasSum;
    this.totalGas = sum * CELL * CELL;
  }

  /** Avance la fumée d'un sous-pas (seuls les blocs qui en transportent sont parcourus). */
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
    for (let i = 0; i < n; i++) if (blocks[i]!.smokeOn) fluxSmoke(blocks[i]!);
    for (let i = 0; i < n; i++) if (blocks[i]!.smokeOn) applySmoke(blocks[i]!);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += blocks[i]!.smokeSum;
    this.totalSmoke = sum * CELL * CELL;
  }

  /** Dérive locale (m/s) dans la cellule k d'un bloc de bâti donné, écrite dans `out` (nulle dans le bâti). */
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
    // ne compter que les cellules dont la voisine d'en face est libre : inutile d'étendre le champ dans un immeuble
    const nst = nb !== null ? nb.st : this.statics.peek(nbx, nbz);
    if (nst === null) return;
    const solid = nst.solid;
    if (solid !== null) {
      mg = 0;
      ms = 0;
      for (let t = 0, k = start, f = facing; t < BLOCK_CELLS; t++, k += stride, f += stride) {
        if (solid[f] !== 0) continue;
        if (gas[k]! > mg) mg = gas[k]!;
        if (smoke[k]! > ms) ms = smoke[k]!;
      }
      if (mg <= SPREAD_EPS && ms <= SPREAD_EPS) return;
    }
    if (nb === null) {
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

    // Les bornes sont écrites en ligne (pas de petite fonction recevant un réel : voir sampling.ts).
    const cmax = COURANT_MAX;

    // Cas courant en terrain dégagé : plein vent ici et chez les quatre voisins → coefficients uniformes.
    if (
      b.st.uniform && b.w !== null && b.e !== null && b.n !== null && b.s !== null
      && b.w.st.uniform && b.e.st.uniform && b.n.st.uniform && b.s.st.uniform
    ) {
      let aE = w.driftX * alpha;
      let aS = w.driftZ * alpha;
      if (aE > cmax) aE = cmax; else if (aE < -cmax) aE = -cmax;
      if (aS > cmax) aS = cmax; else if (aS < -cmax) aS = -cmax;
      const f = 1 + t.windDecay * w.speed;
      const keepG = 1 - lamG * f;
      const keepS = 1 - lamS * f;
      b.pE.fill((aE > 0 ? aE : 0) + kd);
      b.qE.fill((aE < 0 ? -aE : 0) + kd);
      b.pS.fill((aS > 0 ? aS : 0) + kd);
      b.qS.fill((aS < 0 ? -aS : 0) + kd);
      b.mG.fill(keepG > 0 ? keepG : 0);
      b.mS.fill(keepS > 0 ? keepS : 0);
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
    const liftOff = t.liftOff;
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
          aE = 0.5 * (vx + ux[P + 1]!) * alpha;
          if (aE > cmax) aE = cmax; else if (aE < -cmax) aE = -cmax;
          pE[k] = (aE > 0 ? aE : 0) + kd;
          qE[k] = (aE < 0 ? -aE : 0) + kd;
        } else {
          pE[k] = 0;
          qE[k] = 0;
        }
        if (closed[P + PADW] === 0) {
          aS = 0.5 * (vz + uz[P + PADW]!) * alpha;
          if (aS > cmax) aS = cmax; else if (aS < -cmax) aS = -cmax;
          pS[k] = (aS > 0 ? aS : 0) + kd;
          qS[k] = (aS < 0 ? -aS : 0) + kd;
        } else {
          pS[k] = 0;
          qS[k] = 0;
        }
        if (closed[P - 1] === 0) {
          aW = 0.5 * (ux[P - 1]! + vx) * alpha;
          if (aW > cmax) aW = cmax; else if (aW < -cmax) aW = -cmax;
        }
        if (closed[P - PADW] === 0) {
          aN = 0.5 * (uz[P - PADW]! + vz) * alpha;
          if (aN > cmax) aN = cmax; else if (aN < -cmax) aN = -cmax;
        }
        // convergence de la dérive (div < 0) : l'air monte, une part du gaz s'envole au lieu de s'entasser
        const div = aE - aW + aS - aN;
        let lift = 1;
        if (div < 0) {
          lift = 1 + liftOff * div;
          if (lift < 0) lift = 0;
        }
        const f = (1 - retention * enc[P]!) * (1 + windDecay * Math.sqrt(vx * vx + vz * vz));
        const keepG = 1 - lamG * f;
        const keepS = 1 - lamS * f;
        mG[k] = keepG > 0 ? keepG * lift : 0;
        mS[k] = keepS > 0 ? keepS * lift : 0;
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

/** Le bloc et ses quatre voisins recalculeront leurs coefficients. */
function markAround(b: Block): void {
  b.dirty = true;
  if (b.w !== null) b.w.dirty = true;
  if (b.e !== null) b.e.dirty = true;
  if (b.n !== null) b.n.dirty = true;
  if (b.s !== null) b.s.dirty = true;
}
