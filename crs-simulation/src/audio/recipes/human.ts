/* =====================================================================================
 * Recettes : sons du corps — pas (selon le sol), toux, cri, sifflet, tambour.
 * ===================================================================================== */

import type { Kit } from '../kit';

/** Pas sur sol dur (bitume, trottoir, dalle) : talon mat, clic de semelle, puis la pointe. */
export function pas(k: Kit): number {
  const t = k.t;
  const v = k.r(0.85, 1.15);
  k.ping(104 * v, t, 0.55, 0.02, k.out, 'sine', 60);
  k.burst({ kind: 'pink', type: 'lowpass', f: 720 * v, peak: 0.75, a: 0.001, tau: 0.016 });
  k.burst({ type: 'bandpass', f: 3100 * v, q: 1.2, peak: 0.3, a: 0.0006, tau: 0.005 });
  const t2 = t + k.r(0.045, 0.07);
  k.burst({ kind: 'pink', type: 'bandpass', f: 1500 * v, q: 0.8, peak: 0.3, a: 0.002, tau: 0.018, t0: t2 });
  return 0.24;
}

/** Pas sur pavés : plus claquant, léger second contact (la semelle roule sur l'arête). */
export function pasPave(k: Kit): number {
  const t = k.t;
  const v = k.r(0.9, 1.2);
  k.ping(128 * v, t, 0.5, 0.018, k.out, 'sine', 70);
  k.burst({ type: 'bandpass', f: 2400 * v, q: 1.6, peak: 0.55, a: 0.0006, tau: 0.007 });
  k.burst({ kind: 'pink', type: 'lowpass', f: 900, peak: 0.6, tau: 0.014 });
  k.burst({ type: 'bandpass', f: 3400 * v, q: 2, peak: 0.22, tau: 0.005, t0: t + k.r(0.03, 0.055) });
  return 0.22;
}

/** Pas sur gravier ou stabilisé : crissement granuleux. */
export function pasGravier(k: Kit): number {
  const t = k.t;
  const g = k.gain(0, k.out);
  k.trap(g.gain, t, 0.75, 0.012, 0.05, 0.11);
  const bp = k.bq('bandpass', k.r(2600, 4200), 0.6, g);
  k.tex('crackle', bp, k.r(2.2, 3.2), t, t + 0.22);
  k.burst({ kind: 'pink', type: 'bandpass', f: 3600, q: 0.6, peak: 0.3, a: 0.004, tau: 0.04 });
  k.ping(92, t, 0.3, 0.02, k.out, 'sine', 58);
  return 0.3;
}

/** Pas sur l'herbe ou la terre : froissement doux, presque pas d'aigu. */
export function pasHerbe(k: Kit): number {
  const t = k.t;
  const g = k.gain(0, k.out);
  k.trap(g.gain, t, 0.5, 0.02, 0.02, 0.09);
  k.noise('pink', k.bq('lowpass', k.r(1100, 1600), 0.6, g), t, t + 0.18);
  k.ping(88, t, 0.4, 0.028, k.out, 'sine', 55);
  return 0.24;
}

/** Pas dans l'eau ou sur sol détrempé : le talon, puis l'éclaboussure. */
export function pasEau(k: Kit): number {
  const t = k.t;
  k.ping(100, t, 0.4, 0.02, k.out, 'sine', 60);
  k.burst({ kind: 'pink', type: 'lowpass', f: 700, peak: 0.5, tau: 0.015 });
  k.burst({ type: 'bandpass', f: 2600, f1: 1100, sweep: 0.12, q: 0.7, peak: 0.55, a: 0.006, tau: 0.06, t0: t + 0.01 });
  const g = k.gain(0, k.out);
  k.perc(g.gain, t + 0.03, 0.3, 0.02, 0.07);
  k.tex('drops', k.bq('highpass', 2500, 0.7, g), 1.4, t + 0.02, t + 0.34);
  return 0.36;
}

/** Toux : deux ou trois quintes explosives (gaz lacrymogène). */
export function toux(k: Kit): number {
  const t = k.t;
  const count = k.rnd() < 0.5 ? 2 : 3;
  const f0 = k.r(105, 150);
  let ti = t;
  for (let i = 0; i < count; i++) {
    const amp = (i === 0 ? 1 : 0.7) * k.r(0.8, 1);
    const tau = k.r(0.04, 0.06);
    // souffle expulsé, coloré par le conduit vocal
    const g = k.gain(0, k.out);
    k.perc(g.gain, ti, amp, 0.008, tau);
    const src = k.noise('white', undefined, ti, ti + 0.4);
    src.connect(k.bq('bandpass', 620, 2, k.gain(1.0, g)));
    src.connect(k.bq('bandpass', 1450, 2.5, k.gain(0.8, g)));
    src.connect(k.bq('bandpass', 2800, 3, k.gain(0.35, g)));
    // voisement bref qui retombe
    const vg = k.gain(0, k.out);
    k.perc(vg.gain, ti + 0.01, 0.35 * amp, 0.01, tau * 0.8);
    const o = k.osc('sawtooth', f0 * 1.5, k.bq('bandpass', 700, 1.5, vg), ti, ti + 0.4);
    k.sweep(o.frequency, ti, f0 * 1.5, ti + 0.12, f0 * 0.8);
    ti += k.r(0.2, 0.28);
  }
  return ti - t + 0.25;
}

/** Cri (douleur, colère, appel) : voix criée dont la hauteur monte puis retombe. */
export function cri(k: Kit): number {
  const t = k.t;
  const dur = k.r(0.45, 0.75);
  const f0 = k.r(215, 300);
  const g = k.gain(0, k.out);
  k.trap(g.gain, t, 0.9, 0.035, dur * 0.55, dur * 0.4);
  // formants d'un « a » crié
  const f1 = k.bq('bandpass', 880, 5, k.gain(1, g));
  const f2 = k.bq('bandpass', 1350, 6, k.gain(0.75, g));
  const f3 = k.bq('bandpass', 2750, 7, k.gain(0.4, g));
  const src = k.gain(1);
  src.connect(f1);
  src.connect(f2);
  src.connect(f3);
  const end = t + dur + 0.05;
  const o1 = k.osc('sawtooth', f0, src, t, end);
  const o2 = k.osc('sawtooth', f0 * 1.007, k.gain(0.6, src), t, end);
  for (const o of [o1, o2]) {
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * k.r(1.25, 1.5), t + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f0 * k.r(0.75, 0.9), t + dur);
  }
  // voix éraillée : souffle et tremblement
  k.noise('white', k.gain(0.22, src), t, end);
  k.lfo('sine', k.r(48, 70), 0.2, g.gain, t);
  return dur + 0.08;
}

/** Sifflet à roulette : note aiguë roulée, parfois deux coups brefs puis un long. */
export function sifflet(k: Kit): number {
  const t = k.t;
  const f = k.r(2850, 3350);
  const g = k.gain(0, k.out);
  let end: number;
  if (k.rnd() < 0.6) {
    k.trap(g.gain, t, 0.5, 0.015, k.r(0.28, 0.42), 0.05);
    end = t + 0.52;
  } else {
    k.trap(g.gain, t, 0.5, 0.012, 0.09, 0.03);
    k.trap(g.gain, t + 0.17, 0.5, 0.012, 0.09, 0.03);
    k.trap(g.gain, t + 0.34, 0.5, 0.012, 0.22, 0.05);
    end = t + 0.66;
  }
  // la bille : la note est hachée ~45 fois par seconde et vacille en hauteur
  const roll = k.r(40, 52);
  const trem = k.gain(0.55, g);
  k.lfo('sine', roll, 0.45, trem.gain, t);
  const o = k.osc('sine', f, trem, t, end);
  k.osc('sine', f * 2.01, k.gain(0.18, trem), t, end);
  k.lfo('sine', roll, 110, o.frequency, t);
  // souffle
  k.noise('white', k.bq('bandpass', f, 3.5, k.gain(0.3, g)), t, end);
  return end - t;
}

/** Tambour : grosse caisse de cortège ; au-delà de pitch 1,4 la recette ajoute le timbre d'une caisse claire. */
export function tambour(k: Kit): number {
  const t = k.t;
  k.ping(116, t, 0.95, 0.15, k.out, 'sine', 66);
  k.ping(192, t, 0.3, 0.06, k.out, 'sine', 150);
  k.burst({ kind: 'pink', type: 'lowpass', f: 2600, peak: 0.45, a: 0.0008, tau: 0.008 });
  const snare = Math.min(1, Math.max(0, (k.pitch - 1.3) / 0.6));
  if (snare > 0) k.burst({ type: 'bandpass', f: 2300, q: 0.6, peak: 0.6 * snare, tau: 0.05 });
  return 0.55;
}

/**
 * Batterie de cortège : deux mesures à 104 à la noire — grosse caisse sur les temps, caisse claire
 * en contretemps, roulement en fin de phrase. Durée exactement égale à deux mesures : la boucle
 * se relance en rythme.
 */
export function batucada(k: Kit): number {
  const beat = 60 / 104;
  const t = k.t;
  for (let bar = 0; bar < 2; bar++) {
    for (let b = 0; b < 4; b++) {
      const tb = t + (bar * 4 + b) * beat;
      // grosse caisse
      k.ping(108, tb, b === 0 ? 0.9 : 0.7, 0.13, k.out, 'sine', 62);
      k.burst({ kind: 'pink', type: 'lowpass', f: 2200, peak: 0.3, tau: 0.008, t0: tb });
      // caisse claire sur les contretemps
      const ts = tb + beat * 0.5;
      k.burst({ type: 'bandpass', f: 2400, q: 0.6, peak: 0.38, tau: 0.04, t0: ts });
      k.ping(215, ts, 0.25, 0.04, k.out, 'sine', 170);
      // doubles croches en fin de deuxième mesure
      if (bar === 1 && b === 3) {
        for (let s = 1; s < 4; s++) {
          k.burst({ type: 'bandpass', f: 2400, q: 0.6, peak: 0.2 + 0.07 * s, tau: 0.03, t0: tb + (beat * s) / 4 });
        }
      }
    }
  }
  return beat * 8;
}

/** Acouphène après une détonation proche : sifflement aigu qui s'estompe. */
export function acouphene(k: Kit): number {
  const t = k.t;
  const g = k.gain(0, k.out);
  k.perc(g.gain, t, 0.16, 0.08, 1.5);
  k.osc('sine', 4150, g, t, t + 6);
  k.osc('sine', 6020, k.gain(0.5, g), t, t + 6);
  return 6;
}
