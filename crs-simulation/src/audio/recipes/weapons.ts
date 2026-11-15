/* =====================================================================================
 * Recettes : armes, grenades, explosions.
 *
 * Principe commun d'une détonation : un claquement large bande de quelques millisecondes (le
 * front d'onde), un corps de bruit dont le filtre se referme très vite (le souffle), un coup
 * grave qui descend (la masse d'air déplacée), puis les échos des façades — une rue parisienne
 * est un canyon : c'est surtout la queue d'échos qui donne l'échelle de l'explosion.
 * ===================================================================================== */

import type { Kit } from '../kit';

type Taps = readonly (readonly [number, number, number])[];

/**
 * Bus saturé : somme → tanh → niveau. Garantit une sortie bornée et donne le grain « micro saturé ».
 * `echoes` : échos de façade [retard s, gain, coupure Hz] prélevés APRÈS la saturation (donc bornés eux aussi).
 * Retourne le nœud d'entrée où brancher les composantes.
 */
export function satBus(k: Kit, drive: number, level: number, echoes?: Taps): GainNode {
  const post = k.gain(level, k.out);
  const ws = k.sat(drive, post);
  const input = k.gain(1, ws);
  if (echoes) k.echoes(ws, echoes, post);
  return input;
}

const STREET_ECHOES: Taps = [
  [0.085, 0.34, 2600], [0.19, 0.22, 1700], [0.33, 0.14, 1200], [0.54, 0.08, 850],
];

/** Lancer de grenade à main : souffle du bras, puis la cuillère qui saute (tintement métallique sec). */
export function grenadeLancer(k: Kit): number {
  const t = k.t;
  k.burst({ kind: 'pink', type: 'bandpass', f: 420, f1: 1900, sweep: 0.16, q: 1.3, peak: 0.55, a: 0.07, tau: 0.05 });
  const t1 = t + 0.085;
  k.burst({ type: 'highpass', f: 3800, peak: 0.3, a: 0.0008, tau: 0.006, t0: t1 });
  k.ping(2140, t1, 0.2, 0.04);
  k.ping(3415, t1, 0.15, 0.03);
  k.ping(5320, t1 + 0.003, 0.09, 0.022);
  // la cuillère retombe au sol un peu plus tard
  const t2 = t + 0.3 + k.r(0, 0.08);
  k.ping(2890, t2, 0.07, 0.02);
  k.ping(4630, t2, 0.05, 0.015);
  return 0.5;
}

/** « Pop » d'une grenade lacrymogène : petit claquement étouffé de l'allumeur, puis le gaz qui part. */
export function grenadePop(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 1.4, 0.8);
  k.ping(210, t, 0.8, 0.035, bus, 'sine', 85);
  k.burst({ type: 'lowpass', f: 2400, f1: 500, sweep: 0.08, q: 0.7, peak: 0.9, tau: 0.03, to: bus });
  k.burst({ type: 'bandpass', f: 1500, q: 1.2, peak: 0.4, tau: 0.02, to: bus });
  // le sifflement démarre aussitôt
  const hiss = k.gain(0, k.out);
  k.trap(hiss.gain, t + 0.03, 0.22, 0.06, 0.25, 0.5);
  const bp = k.bq('bandpass', 5600, 0.8, hiss);
  k.noise('white', bp, t + 0.02, t + 0.9);
  return 0.9;
}

/** Sifflement continu d'un palet lacrymogène qui se consume (entretenu). */
export function gazSifflement(k: Kit): number {
  const m = k.sustain(3, 0.12, 0.5);
  const hp = k.bq('highpass', 2400, 0.7, m);
  const bp = k.bq('bandpass', 6200, 0.7, hp);
  const body = k.gain(0.5, bp);
  k.noise('white', body);
  // légère résonance de l'orifice
  const res = k.gain(0.09, m);
  const rbp = k.bq('bandpass', 3150, 22, res);
  k.noise('white', rbp);
  // souffle irrégulier
  k.lfo('sine', 6.7, 0.07, body.gain);
  k.lfo('sine', 0.63, 0.11, body.gain);
  return k.duration;
}

/** Lanceur de grenades de 56 mm : un « pof » sourd de tube, sans détonation marquée. */
export function lanceurTir(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 1.3, 0.85, [[0.11, 0.2, 900], [0.23, 0.11, 600]]);
  k.ping(150, t, 0.95, 0.075, bus, 'sine', 52);                       // coup grave
  k.burst({ type: 'bandpass', f: 235, q: 5, peak: 1.6, tau: 0.07, to: bus }); // résonance du tube
  k.burst({ type: 'bandpass', f: 470, q: 6, peak: 0.7, tau: 0.045, to: bus });
  k.burst({ kind: 'pink', type: 'lowpass', f: 1700, f1: 400, sweep: 0.1, peak: 0.7, tau: 0.04, to: bus }); // bouffée de gaz
  k.burst({ type: 'highpass', f: 3200, peak: 0.12, tau: 0.004, t0: t + 0.012, to: bus }); // percuteur
  return 0.75;
}

/** LBD 40 : un « toc » sec et court, plus aigu que le lanceur de 56. */
export function lbdTir(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 1.4, 0.85, [[0.09, 0.2, 1500], [0.2, 0.1, 1000]]);
  k.burst({ type: 'highpass', f: 1300, peak: 0.6, a: 0.0005, tau: 0.009, to: bus });
  k.ping(265, t, 0.9, 0.035, bus, 'sine', 95);
  k.burst({ type: 'bandpass', f: 520, q: 7, peak: 1.3, tau: 0.04, to: bus });
  k.burst({ type: 'lowpass', f: 3000, f1: 700, sweep: 0.05, peak: 0.6, tau: 0.02, to: bus });
  return 0.55;
}

/** Grenade assourdissante (GM2L, ASSD) : détonation très forte, longue queue d'échos. */
export function detonation(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 2.2, 0.92, STREET_ECHOES);
  k.burst({ type: 'highpass', f: 400, peak: 1.6, a: 0.0004, tau: 0.006, to: bus });                 // front d'onde
  k.burst({ type: 'lowpass', f: 10000, f1: 260, sweep: 0.45, q: 0.6, peak: 1.5, tau: 0.15, to: bus }); // souffle
  k.burst({ kind: 'pink', type: 'bandpass', f: 700, q: 0.7, peak: 0.9, tau: 0.1, to: bus });
  k.ping(96, t, 1.5, 0.26, bus, 'sine', 31);                                                         // coup grave
  // roulement grave qui traîne
  const tail = k.gain(0, k.out);
  k.perc(tail.gain, t + 0.02, 0.4, 0.06, 0.55);
  const tlp = k.bq('lowpass', 190, 0.6, tail);
  k.noise('brown', tlp, t, t + 2.3);
  return 2.2;
}

/** Grenade de désencerclement : détonation plus sèche, puis la pluie de plots de caoutchouc sur le sol. */
export function desencerclement(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 2.0, 0.9, [[0.08, 0.3, 2400], [0.18, 0.18, 1600], [0.31, 0.1, 1100]]);
  k.burst({ type: 'highpass', f: 500, peak: 1.5, a: 0.0004, tau: 0.005, to: bus });
  k.burst({ type: 'lowpass', f: 11000, f1: 480, sweep: 0.22, q: 0.6, peak: 1.4, tau: 0.085, to: bus });
  k.ping(118, t, 1.3, 0.13, bus, 'sine', 44);
  // 14 plots qui ricochent : petits « tac » mats, de plus en plus espacés
  for (let i = 0; i < 14; i++) {
    const ti = t + 0.05 + 0.5 * Math.pow(k.rnd(), 1.6);
    k.burst({ type: 'bandpass', f: k.r(900, 2400), q: 2.2, peak: k.r(0.1, 0.26), tau: k.r(0.006, 0.014), t0: ti });
  }
  return 1.5;
}

/** Coup de feu d'arme de poing : claquement très bref et très fort, échos de rue. */
export function tirArme(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 2.4, 0.9, [[0.07, 0.3, 3200], [0.16, 0.2, 2100], [0.31, 0.12, 1400], [0.5, 0.07, 1000]]);
  k.burst({ type: 'highpass', f: 900, peak: 1.8, a: 0.0003, tau: 0.0035, to: bus });
  k.burst({ type: 'lowpass', f: 8000, f1: 900, sweep: 0.07, q: 0.6, peak: 1.2, tau: 0.03, to: bus });
  k.ping(185, t, 0.9, 0.04, bus, 'sine', 68);
  return 1.1;
}

/** Pétard : claquement sec et aigu, presque sans grave. */
export function petard(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 1.8, 0.8, [[0.09, 0.24, 2600], [0.2, 0.12, 1500]]);
  k.burst({ type: 'highpass', f: 1500, peak: 1.4, a: 0.0003, tau: 0.003, to: bus });
  k.burst({ type: 'bandpass', f: 2600, q: 0.6, peak: 1.0, tau: 0.018, to: bus });
  k.ping(310, t, 0.4, 0.018, bus, 'sine', 120);
  return 0.6;
}

/** Tir de mortier d'artifice : départ sourd du tube, puis la bombe qui monte en sifflant. */
export function mortierTir(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 1.4, 0.8);
  k.ping(190, t, 0.9, 0.06, bus, 'sine', 68);
  k.burst({ kind: 'pink', type: 'lowpass', f: 1300, peak: 0.8, tau: 0.045, to: bus });
  // traînée : chuintement dont la hauteur monte
  const fizz = k.gain(0, k.out);
  k.trap(fizz.gain, t + 0.03, 0.3, 0.05, 0.5, 0.3);
  const bp = k.bq('bandpass', 1500, 3, fizz);
  k.sweep(bp.frequency, t + 0.03, 1500, t + 0.85, 4800);
  k.noise('white', bp, t + 0.02, t + 1.0);
  // sifflement
  const wg = k.gain(0, k.out);
  k.trap(wg.gain, t + 0.05, 0.1, 0.08, 0.45, 0.3);
  const w = k.osc('sine', 1100, wg, t + 0.04, t + 1.0);
  k.sweep(w.frequency, t + 0.05, 1100, t + 0.85, 2900);
  k.lfo('sine', 27, 55, w.frequency, t + 0.04);
  return 1.0;
}

/** Explosion d'une bombe d'artifice : claquement brillant, puis le crépitement des étoiles. */
export function mortierExplosion(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 2.0, 0.9, [[0.1, 0.28, 2600], [0.22, 0.17, 1700], [0.4, 0.09, 1100]]);
  k.burst({ type: 'highpass', f: 700, peak: 1.6, a: 0.0004, tau: 0.004, to: bus });
  k.burst({ type: 'lowpass', f: 13000, f1: 700, sweep: 0.2, q: 0.6, peak: 1.3, tau: 0.065, to: bus });
  k.ping(142, t, 1.0, 0.11, bus, 'sine', 50);
  // crépitement : texture de claquements, aiguë, qui s'éteint
  const cg = k.gain(0, k.out);
  k.perc(cg.gain, t + 0.09, 0.55, 0.08, 0.42);
  const hp = k.bq('highpass', 3800, 0.7, cg);
  k.tex('crackle', hp, 2.4, t + 0.05, t + 2.0);
  return 2.0;
}

/** Cocktail Molotov : la bouteille éclate, puis l'embrasement (« whoumf ») et les premières flammes. */
export function molotov(k: Kit): number {
  const t = k.t;
  // verre
  k.burst({ type: 'highpass', f: 1800, peak: 0.7, a: 0.0008, tau: 0.025 });
  for (let i = 0; i < 7; i++) {
    k.ping(k.r(2600, 8200), t + 0.02 + 0.25 * k.rnd() * k.rnd(), k.r(0.05, 0.14), k.r(0.015, 0.05));
  }
  embrasementInto(k, t + 0.06, 1);
  return 2.0;
}

/** Embrasement seul (départ de feu). */
export function embrasement(k: Kit): number {
  embrasementInto(k, k.t, 0.85);
  return 1.9;
}

function embrasementInto(k: Kit, t0: number, level: number): void {
  // souffle de l'inflammation : grave, enflé puis retombant
  const wg = k.gain(0, k.out);
  wg.gain.setValueAtTime(0, t0);
  wg.gain.linearRampToValueAtTime(0.85 * level, t0 + 0.16);
  wg.gain.setTargetAtTime(0, t0 + 0.2, 0.32);
  const lp = k.bq('lowpass', 300, 0.8, wg);
  k.sweep(lp.frequency, t0, 300, t0 + 0.2, 900);
  lp.frequency.setTargetAtTime(350, t0 + 0.22, 0.3);
  k.noise('pink', lp, t0, t0 + 1.9);
  const rg = k.gain(0, k.out);
  k.perc(rg.gain, t0, 0.5 * level, 0.12, 0.4);
  const rlp = k.bq('lowpass', 140, 0.7, rg);
  k.noise('brown', rlp, t0, t0 + 1.9);
  // flammes
  const cg = k.gain(0, k.out);
  k.trap(cg.gain, t0 + 0.12, 0.3 * level, 0.25, 0.7, 0.75);
  const bp = k.bq('bandpass', 2600, 0.5, cg);
  k.tex('crackle', bp, 1.2, t0 + 0.1, t0 + 1.95);
}

/** Explosion d'un véhicule : double coup très grave (réservoir), débris métalliques, souffle de feu. */
export function explosionVehicule(k: Kit): number {
  const t = k.t;
  const bus = satBus(k, 2.4, 0.95, [[0.13, 0.36, 1800], [0.29, 0.25, 1200], [0.5, 0.16, 900], [0.85, 0.09, 600]]);
  k.burst({ type: 'highpass', f: 300, peak: 1.5, a: 0.0005, tau: 0.008, to: bus });
  k.burst({ type: 'lowpass', f: 7500, f1: 170, sweep: 0.9, q: 0.6, peak: 1.6, tau: 0.36, to: bus });
  k.ping(72, t, 1.6, 0.42, bus, 'sine', 24);
  k.ping(56, t + 0.13, 1.1, 0.5, bus, 'sine', 22);
  k.burst({ kind: 'pink', type: 'bandpass', f: 450, q: 0.6, peak: 0.9, a: 0.02, tau: 0.3, to: bus });
  // débris de tôle qui retombent
  for (let i = 0; i < 9; i++) {
    const ti = t + 0.18 + 1.5 * k.rnd();
    const f = k.r(280, 2400);
    k.ping(f, ti, k.r(0.04, 0.12), k.r(0.05, 0.22));
    k.ping(f * 1.47, ti, 0.03, 0.05);
    k.burst({ type: 'bandpass', f: k.r(1800, 4200), q: 1.5, peak: 0.1, tau: 0.01, t0: ti });
  }
  // souffle des flammes
  const fg = k.gain(0, k.out);
  k.perc(fg.gain, t + 0.1, 0.32, 0.3, 0.8);
  const fbp = k.bq('lowpass', 700, 0.6, fg);
  k.noise('pink', fbp, t + 0.05, t + 3.0);
  return 3.0;
}
