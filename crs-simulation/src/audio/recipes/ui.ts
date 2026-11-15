/* =====================================================================================
 * Recettes : sons d'interface — brefs, propres, sans agressivité.
 * ===================================================================================== */

import type { Kit } from '../kit';

/** Clic de bouton. */
export function uiClic(k: Kit): number {
  const t = k.t;
  k.ping(1750, t, 0.4, 0.012, k.out, 'sine', 1200, 0.001);
  k.burst({ type: 'highpass', f: 3000, peak: 0.12, a: 0.0005, tau: 0.003 });
  return 0.08;
}

/** Validation : deux notes montantes (quinte). */
export function uiValide(k: Kit): number {
  const t = k.t;
  k.ping(660, t, 0.35, 0.06, k.out, 'triangle');
  k.ping(1320, t, 0.08, 0.04);
  k.ping(990, t + 0.09, 0.35, 0.09, k.out, 'triangle');
  k.ping(1980, t + 0.09, 0.08, 0.06);
  return 0.42;
}

/** Alerte : trois bips pressants. */
export function uiAlerte(k: Kit): number {
  const t = k.t;
  const g = k.gain(0, k.out);
  const lp = k.bq('lowpass', 2600, 0.7, g);
  for (let i = 0; i < 3; i++) k.trap(g.gain, t + i * 0.16, 0.32, 0.006, 0.08, 0.02);
  const o = k.osc('square', 880, lp, t, t + 0.5);
  o.frequency.setValueAtTime(880, t);
  o.frequency.setValueAtTime(880, t + 0.16);
  o.frequency.setValueAtTime(1175, t + 0.32);
  return 0.52;
}
