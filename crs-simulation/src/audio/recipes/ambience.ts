/* =====================================================================================
 * Recettes : ambiances — feu, pluie, vent, rumeur de la ville, tonnerre.
 * Toutes entretenues : jouées en boucle par le système d'ambiance, qui règle leur volume.
 * ===================================================================================== */

import type { Kit } from '../kit';

/** Feu qui crépite (poubelle, barricade, véhicule) : ronflement grave, souffle des flammes, crépitements. */
export function feu(k: Kit): number {
  const m = k.sustain(3, 0.3, 0.5);
  const rg = k.gain(0.5, m);
  k.noise('brown', k.bq('lowpass', 230, 0.7, rg));
  k.lfo('sine', 0.9, 0.12, rg.gain);
  k.lfo('sine', 2.3, 0.08, rg.gain);
  const fg = k.gain(0.22, m);
  const fbp = k.bq('bandpass', 650, 0.6, fg);
  k.noise('pink', fbp);
  k.lfo('sine', 1.7, 0.08, fg.gain);
  k.lfo('sine', 0.41, 150, fbp.frequency);
  // crépitements : deux lectures décalées de la même texture, l'une plus aiguë et plus rapide
  k.tex('crackle', k.bq('highpass', 900, 0.6, k.gain(0.55, m)), 1);
  k.tex('crackle', k.bq('bandpass', 3500, 0.7, k.gain(0.3, m)), 1.6);
  return k.duration;
}

/** Pluie : chuintement continu + crépitement des gouttes sur le sol. */
export function pluie(k: Kit): number {
  const m = k.sustain(3, 0.3, 0.4);
  const lp = k.bq('lowpass', 9000, 0.6, m);
  k.noise('white', k.bq('highpass', 700, 0.6, k.gain(0.2, lp)));
  k.noise('pink', k.bq('bandpass', 2500, 0.5, k.gain(0.32, m)));
  k.tex('drops', k.bq('highpass', 1500, 0.6, k.gain(0.5, m)));
  k.tex('drops', k.bq('lowpass', 1300, 0.6, k.gain(0.5, m)), 0.5);
  return k.duration;
}

/** Vent : souffle dont la hauteur et la force errent lentement, sifflement dans les aigus par rafales. */
export function vent(k: Kit): number {
  const m = k.sustain(3, 0.4, 0.5);
  const g = k.gain(0.75, m);
  const bp = k.bq('bandpass', 430, 1.1, g);
  k.noise('pink', bp);
  k.lfo('sine', 0.11, 170, bp.frequency);
  k.lfo('sine', 0.27, 90, bp.frequency);
  k.lfo('sine', 0.083, 0.22, g.gain);
  k.lfo('sine', 0.31, 0.1, g.gain);
  const wg = k.gain(0.07, m);
  const wbp = k.bq('bandpass', 1500, 4, wg);
  k.noise('white', wbp);
  k.lfo('sine', 0.19, 0.06, wg.gain);
  k.lfo('sine', 0.13, 300, wbp.frequency);
  k.noise('brown', k.bq('lowpass', 130, 0.7, k.gain(0.5, m)));
  return k.duration;
}

/** Rumeur lointaine de la ville : grondement de circulation, chuintement des pneus, lente respiration. */
export function ville(k: Kit): number {
  const m = k.sustain(3, 0.5, 0.5);
  const g = k.gain(0.8, m);
  k.noise('brown', k.bq('lowpass', 170, 0.7, g));
  k.lfo('sine', 0.07, 0.15, g.gain);
  k.lfo('sine', 0.19, 0.08, g.gain);
  const hg = k.gain(0.1, m);
  k.noise('pink', k.bq('bandpass', 800, 0.4, hg));
  k.lfo('sine', 0.11, 0.04, hg.gain);
  // ronflement très grave des moteurs au loin
  k.osc('sawtooth', 55, k.bq('lowpass', 110, 0.7, k.gain(0.06, m)));
  k.osc('sawtooth', 41.5, k.bq('lowpass', 100, 0.7, k.gain(0.05, m)));
  return k.duration;
}

/** Tonnerre : claquement initial puis long roulement grave en plusieurs vagues. */
export function tonnerre(k: Kit): number {
  const t = k.t;
  const dur = 4.5;
  k.burst({ type: 'lowpass', f: 5000, f1: 300, sweep: 0.3, peak: 0.6, a: 0.002, tau: 0.09 });
  const g = k.gain(0, k.out);
  g.gain.setValueAtTime(0, t);
  const waves = 6;
  for (let i = 0; i < waves; i++) {
    const ti = t + 0.05 + (i * (dur - 1.2)) / waves + k.r(0, 0.25);
    g.gain.linearRampToValueAtTime(k.r(0.5, 0.95) * (1 - (0.75 * i) / waves), ti);
    g.gain.linearRampToValueAtTime(k.r(0.15, 0.3) * (1 - (0.75 * i) / waves), ti + k.r(0.25, 0.4));
  }
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = k.bq('lowpass', 800, 0.6, g);
  k.sweep(lp.frequency, t, 800, t + dur, 80);
  k.noise('brown', lp, t, t + dur + 0.05);
  k.noise('pink', k.gain(0.3, lp), t, t + dur + 0.05);
  return dur;
}
