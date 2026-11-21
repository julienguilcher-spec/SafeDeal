/* =====================================================================================
 * Recettes : matériel — menottes, gazeuse, extincteur, appareil photo, canon à eau.
 * ===================================================================================== */

import type { Kit } from '../kit';

/** Menottes : le cliquet qui file (clics de plus en plus serrés), puis le verrouillage. */
export function menottes(k: Kit): number {
  const t = k.t;
  for (let i = 0; i < 9; i++) {
    const ti = t + 0.34 * Math.pow(i / 9, 0.8);
    k.burst({ type: 'bandpass', f: k.r(4200, 5000), q: 3, peak: 0.55, a: 0.0005, tau: 0.0035, t0: ti });
    k.ping(3100, ti, 0.11, 0.01);
  }
  const tc = t + 0.42;
  k.burst({ type: 'bandpass', f: 2200, q: 2, peak: 0.8, a: 0.0005, tau: 0.008, t0: tc });
  k.ping(1850, tc, 0.2, 0.028);
  k.ping(2740, tc, 0.14, 0.022);
  // la chaînette
  k.ping(5200, t + 0.05, 0.05, 0.02);
  k.ping(6900, tc + 0.06, 0.05, 0.025);
  return 0.7;
}

/** Gazeuse (aérosol lacrymogène) : chuintement aigu et serré (entretenu). */
export function spray(k: Kit): number {
  const m = k.sustain(1.0, 0.02, 0.07);
  const hp = k.bq('highpass', 2600, 0.7, m);
  const body = k.gain(0.55, k.bq('bandpass', 5400, 0.7, hp));
  k.noise('white', body);
  k.noise('white', k.bq('bandpass', 7400, 12, k.gain(0.18, m)));   // sifflement de la buse
  k.lfo('sine', 23, 0.06, body.gain);
  return k.duration;
}

/** Extincteur à poudre : départ brutal, puis un souffle large et grave (entretenu). */
export function extincteur(k: Kit): number {
  const m = k.sustain(1.6, 0.03, 0.25);
  const src = k.noise('white');
  src.connect(k.bq('bandpass', 2300, 0.5, k.gain(0.7, m)));
  src.connect(k.bq('highpass', 5000, 0.7, k.gain(0.22, m)));
  k.noise('pink', k.bq('lowpass', 900, 0.6, k.gain(0.55, m)));
  // coup de bélier à l'ouverture de la poignée
  k.burst({ type: 'lowpass', f: 3000, peak: 0.5, a: 0.002, tau: 0.04 });
  k.lfo('sine', 11, 0.05, m.gain);
  return k.duration;
}

/** Déclencheur d'appareil photo reflex : miroir, rideau, retour du miroir. */
export function declencheurPhoto(k: Kit): number {
  const t = k.t;
  k.burst({ type: 'bandpass', f: 1800, q: 2, peak: 0.9, a: 0.0005, tau: 0.005 });
  k.ping(300, t, 0.25, 0.008, k.out, 'sine', 180);
  k.burst({ type: 'highpass', f: 4200, peak: 0.5, a: 0.0004, tau: 0.0025, t0: t + 0.018 });
  k.burst({ type: 'bandpass', f: 3200, q: 2, peak: 0.7, a: 0.0004, tau: 0.0035, t0: t + 0.075 });
  k.burst({ type: 'bandpass', f: 1500, q: 2, peak: 0.7, a: 0.0005, tau: 0.007, t0: t + 0.095 });
  // moteur d'armement
  const g = k.gain(0, k.out);
  k.trap(g.gain, t + 0.1, 0.07, 0.01, 0.07, 0.03);
  k.osc('sawtooth', 620, k.bq('bandpass', 1250, 3, g), t + 0.1, t + 0.24);
  return 0.26;
}

/** Canon à eau : jet sous pression (bruit large bande), impact de l'eau, pompe (entretenu). */
export function canonEau(k: Kit): number {
  const m = k.sustain(3, 0.18, 0.35);
  // jet
  const jet = k.gain(0.5, m);
  const hp = k.bq('highpass', 500, 0.7, jet);
  k.noise('white', k.bq('bandpass', 2800, 0.4, hp));
  // turbulence : le niveau du jet varie de façon irrégulière
  k.lfo('sine', 3.1, 0.07, jet.gain);
  k.lfo('sine', 7.7, 0.05, jet.gain);
  // gerbe : gouttes et éclaboussures
  k.tex('drops', k.bq('highpass', 3000, 0.7, k.gain(0.22, m)), 1.3);
  // masse d'eau
  k.noise('brown', k.bq('lowpass', 260, 0.7, k.gain(0.5, m)));
  // pompe
  const pump = k.bq('lowpass', 320, 0.8, k.gain(0.2, m));
  k.osc('sawtooth', 86, pump);
  k.osc('sawtooth', 129.5, k.gain(0.6, pump));
  return k.duration;
}
