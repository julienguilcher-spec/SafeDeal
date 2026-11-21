/* =====================================================================================
 * DANGERS DIFFUS — vent vu par les nuages.
 *
 * Dérive = vent au sol (ctx.env.state.windX / windZ) × 0,8, modulée par une turbulence lente et
 * déterministe : rafales (± 20 % de vitesse), sautes de direction (± 11°) et, par air calme, un
 * léger brassage tournant qui évite un nuage parfaitement immobile. Les phases sont tirées une fois
 * par session dans un générateur dérivé de ctx.rng : même graine → même vent.
 * ===================================================================================== */

import type { EnvState, Rng } from '@/core/contracts';
import { TAU } from '@/core/math';
import * as cfg from './config';
import type { HazardTuning } from './config';
import * as statics from './statics';

const COURANT_MAX = cfg.COURANT_MAX;
const CELL = cfg.CELL;
const FIELD_DT = cfg.FIELD_DT;
const MAX_SUBSTEPS = cfg.MAX_SUBSTEPS;
const AXES = statics.AXES;
const AXIS_X = statics.AXIS_X;
const AXIS_Z = statics.AXIS_Z;

/** Périodes (s) des trois ondes de rafale et de saute : incommensurables, de 6 à 37 s. */
const GUST_PERIODS = [11.3, 6.1, 23.9];
const VEER_PERIODS = [17.7, 8.3, 37.1];
const WEIGHTS = [1, 0.6, 0.5];
const WEIGHT_SUM = 2.1;
/** Période du brassage par air calme (s). */
const MEANDER_PERIOD = 47;

export class WindModel {
  /** Dérive moyenne courante des nuages (m/s). */
  driftX = 0;
  driftZ = 0;
  speed = 0;
  /** Pluie courante 0..1. */
  rain = 0;
  /** Sous-pas d'advection nécessaires pour le vent établi (stable tant que le vent moyen ne change pas). */
  substeps = 1;
  /** Projection de la dérive sur chaque axe d'analyse des rues : (dérive · axe) × axe. */
  readonly projX = new Float64Array(AXES);
  readonly projZ = new Float64Array(AXES);

  private readonly gustPhase = [0, 0, 0];
  private readonly veerPhase = [0, 0, 0];
  private meanderPhase = 0;

  constructor(private readonly tuning: HazardTuning) {}

  /** Tire les phases de la turbulence (début de session). */
  reset(rng: Rng): void {
    for (let i = 0; i < 3; i++) {
      this.gustPhase[i] = rng.next() * TAU;
      this.veerPhase[i] = rng.next() * TAU;
    }
    this.meanderPhase = rng.next() * TAU;
    this.driftX = 0;
    this.driftZ = 0;
    this.speed = 0;
    this.rain = 0;
    this.substeps = 1;
    this.projX.fill(0);
    this.projZ.fill(0);
  }

  /** Met à jour la dérive pour l'instant `now` (s). Retourne true si le nombre de sous-pas a changé. */
  update(now: number, env: EnvState): boolean {
    const t = this.tuning;
    const wx = Number.isFinite(env.windX) ? env.windX : 0;
    const wz = Number.isFinite(env.windZ) ? env.windZ : 0;
    let gust = 0;
    let veer = 0;
    for (let i = 0; i < 3; i++) {
      gust += WEIGHTS[i]! * Math.sin((TAU * now) / GUST_PERIODS[i]! + this.gustPhase[i]!);
      veer += WEIGHTS[i]! * Math.sin((TAU * now) / VEER_PERIODS[i]! + this.veerPhase[i]!);
    }
    const factor = t.driftFactor * (1 + (t.gust * gust) / WEIGHT_SUM);
    const angle = (t.veer * veer) / WEIGHT_SUM;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const ma = (TAU * now) / MEANDER_PERIOD + this.meanderPhase;
    let dx = (wx * ca - wz * sa) * factor + t.meander * Math.cos(ma);
    let dz = (wx * sa + wz * ca) * factor + t.meander * Math.sin(ma);

    // sous-pas : dimensionnés sur le vent établi et ses rafales maximales, pas sur l'instantané
    const steady = Math.sqrt(wx * wx + wz * wz) * t.driftFactor * (1 + t.gust) + t.meander;
    let n = Math.ceil((steady * FIELD_DT) / (CELL * COURANT_MAX) - 1e-9);
    if (n < 1) n = 1;
    if (n > MAX_SUBSTEPS) n = MAX_SUBSTEPS;
    const changed = n !== this.substeps;
    this.substeps = n;

    // au-delà de ce que les sous-pas permettent, la dérive est plafonnée (tempête)
    const limit = (COURANT_MAX * CELL * n) / FIELD_DT;
    const sp = Math.sqrt(dx * dx + dz * dz);
    if (sp > limit) {
      dx *= limit / sp;
      dz *= limit / sp;
    }
    this.driftX = dx;
    this.driftZ = dz;
    this.speed = sp > limit ? limit : sp;
    this.rain = env.rain > 0 ? (env.rain < 1 ? env.rain : 1) : 0;
    for (let a = 0; a < AXES; a++) {
      const p = dx * AXIS_X[a]! + dz * AXIS_Z[a]!;
      this.projX[a] = p * AXIS_X[a]!;
      this.projZ[a] = p * AXIS_Z[a]!;
    }
    return changed;
  }
}
