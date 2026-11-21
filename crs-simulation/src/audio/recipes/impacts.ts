/* =====================================================================================
 * Recettes : chocs et bris — verre, bouclier, sol, bâton, tôle, rideau de fer, collision.
 * Un objet frappé sonne par ses modes propres (partiels inharmoniques qui s'éteignent chacun à
 * sa vitesse) : plastique = peu de partiels très amortis, métal = beaucoup de partiels longs,
 * verre = éclats très aigus et brefs.
 * ===================================================================================== */

import type { Kit } from '../kit';
import { satBus } from './weapons';

/** Vitrine brisée : fracas large bande, puis les éclats qui tintent en tombant. */
export function verreBrise(k: Kit): number {
  const t = k.t;
  // l'objet traverse la vitre
  k.ping(175, t, 0.3, 0.03, k.out, 'sine', 90);
  k.burst({ type: 'highpass', f: 1100, peak: 0.95, a: 0.0008, tau: 0.028 });
  k.burst({ type: 'bandpass', f: 3600, q: 0.9, peak: 0.55, a: 0.002, tau: 0.06 });
  // tintements : fréquences élevées, de plus en plus rares
  for (let i = 0; i < 18; i++) {
    const u = k.rnd();
    const ti = t + 0.035 + 1.15 * Math.pow(u, 1.8);
    const f = 2100 * Math.pow(4.6, k.rnd());
    const peak = k.r(0.07, 0.2) * (1 - 0.55 * u);
    const tau = k.r(0.018, 0.085);
    k.ping(f, ti, peak, tau);
    if (i % 3 === 0) k.ping(f * 1.52, ti, peak * 0.5, tau * 0.7);
  }
  // éclats qui glissent et s'entrechoquent au sol
  const sg = k.gain(0, k.out);
  k.perc(sg.gain, t + 0.04, 0.32, 0.05, 0.33);
  const hp = k.bq('highpass', 3200, 0.7, sg);
  k.tex('crackle', hp, 1.9, t + 0.02, t + 1.6);
  return 1.6;
}

/** Projectile sur un bouclier en polycarbonate : « toc » mat et creux, très amorti. */
export function impactBouclier(k: Kit): number {
  const t = k.t;
  k.burst({ type: 'bandpass', f: 950, q: 2.5, peak: 1.5, a: 0.0008, tau: 0.016 });
  k.ping(310, t, 0.5, 0.045);
  k.ping(640, t, 0.34, 0.032);
  k.ping(1270, t, 0.2, 0.018);
  k.ping(142, t, 0.5, 0.035, k.out, 'sine', 78);     // le bras encaisse
  k.burst({ type: 'highpass', f: 2600, peak: 0.12, tau: 0.004, t0: t + 0.028 }); // sangle, visière
  return 0.36;
}

/** Pavé ou objet lourd sur la chaussée : choc sourd, claquement minéral, deux rebonds. */
export function impactSol(k: Kit): number {
  const t = k.t;
  hit(k, t, 1);
  const t2 = t + k.r(0.15, 0.22);
  hit(k, t2, 0.36);
  hit(k, t2 + k.r(0.1, 0.15), 0.15);
  return 0.6;
}

function hit(k: Kit, t0: number, s: number): void {
  k.ping(122, t0, 0.75 * s, 0.045, k.out, 'sine', 55);
  k.burst({ type: 'bandpass', f: k.r(2300, 3000), q: 1.5, peak: 0.9 * s, a: 0.0008, tau: 0.011, t0 });
  k.burst({ kind: 'pink', type: 'lowpass', f: 900, peak: 0.6 * s, tau: 0.028, t0 });
}

/** Coup de bâton de défense : le sifflement du geste, puis l'impact mat. */
export function coupBaton(k: Kit): number {
  const t = k.t;
  const sw = k.gain(0, k.out);
  k.trap(sw.gain, t, 0.3, 0.06, 0.02, 0.04);
  const bp = k.bq('bandpass', 1100, 2.2, sw);
  k.sweep(bp.frequency, t, 1100, t + 0.11, 2700);
  k.noise('pink', bp, t, t + 0.16);
  const th = t + 0.11;
  k.ping(172, th, 0.85, 0.042, k.out, 'sine', 74);
  k.burst({ type: 'lowpass', f: 2200, peak: 0.7, a: 0.0008, tau: 0.018, t0: th });
  k.burst({ type: 'bandpass', f: 800, q: 2, peak: 0.8, tau: 0.03, t0: th });
  return 0.42;
}

const TOLE_MODES: readonly number[] = [142, 233, 317, 468, 611, 853, 1190, 1570, 2210, 2960];

/** Coup sur une tôle (carrosserie, panneau, palissade) : nombreux partiels inharmoniques, longue résonance qui « flotte ». */
export function tole(k: Kit): number {
  toleInto(k, k.t, 1, TOLE_MODES.length);
  return 1.6;
}

function toleInto(k: Kit, t0: number, level: number, modes: number, to: AudioNode = k.out): void {
  // la tôle qui fléchit module légèrement toute la résonance
  const bus = k.gain(level, to);
  k.lfo('sine', k.r(9, 14), 0.25 * level, bus.gain, t0);
  k.burst({ type: 'bandpass', f: 2500, q: 0.8, peak: 0.7, a: 0.0008, tau: 0.01, t0, to: bus });
  k.ping(96, t0, 0.5, 0.05, bus, 'sine', 60);
  for (let i = 0; i < modes; i++) {
    const f = TOLE_MODES[i]! * k.r(0.96, 1.04);
    k.ping(f, t0, 0.3 / (1 + i * 0.25), 0.3 / (1 + i * 0.3), bus);
  }
}

/** Rideau de fer qui descend : cliquetis régulier des lames, grondement, claquement final au sol. */
export function rideauFer(k: Kit): number {
  const t = k.t;
  const roll = 1.75;
  // lames : bruit métallique haché par un train d'impulsions
  const gate = k.gain(0, k.out);
  const env = k.gain(0, gate);
  k.trap(env.gain, t, 0.6, 0.08, roll - 0.2, 0.1);
  const b1 = k.bq('bandpass', 1850, 2.5, env);
  const b2 = k.bq('bandpass', 3300, 3, env);
  const src = k.noise('white', b1, t, t + roll + 0.1);
  src.connect(b2);
  const p = k.pulse(15, 0.28, gate.gain, t);
  p.frequency.setValueAtTime(13, t);
  p.frequency.linearRampToValueAtTime(19, t + roll);
  // tintement des lames
  const ring = k.gain(0, gate);
  k.trap(ring.gain, t, 0.1, 0.08, roll - 0.2, 0.1);
  k.osc('square', 523, k.bq('bandpass', 1040, 4, ring), t, t + roll + 0.1);
  // grondement du tablier dans ses coulisses
  const rg = k.gain(0, k.out);
  k.trap(rg.gain, t, 0.5, 0.1, roll - 0.25, 0.15);
  k.noise('brown', k.bq('lowpass', 210, 0.7, rg), t, t + roll + 0.1);
  // butée au sol
  toleInto(k, t + roll, 0.8, 6);
  k.ping(92, t + roll, 0.8, 0.07, k.out, 'sine', 44);
  return 2.5;
}

/** Collision de véhicule : choc sourd, froissement de tôle, bris de verre. */
export function collision(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 1.6, 0.85);
  k.ping(98, t, 1.2, 0.09, bus, 'sine', 40);
  k.burst({ kind: 'pink', type: 'lowpass', f: 1400, f1: 300, sweep: 0.2, peak: 1.2, tau: 0.07, to: bus });
  // froissement : bruit médium granuleux
  const cg = k.gain(0, bus);
  k.perc(cg.gain, t, 0.9, 0.01, 0.14);
  k.tex('crackle', k.bq('bandpass', 1500, 0.7, cg), 0.7, t, t + 1.0);
  toleInto(k, t + 0.01, 0.7, 7, bus);
  for (let i = 0; i < 6; i++) {
    k.ping(k.r(2800, 8000), t + 0.05 + 0.4 * k.rnd(), k.r(0.04, 0.11), k.r(0.015, 0.05), bus);
  }
  return 1.3;
}
