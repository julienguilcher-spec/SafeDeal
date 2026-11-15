/* =====================================================================================
 * Recettes : radio et mégaphone.
 *
 * La synthèse vocale du navigateur ne passe pas par WebAudio : on ne peut pas la filtrer. Le
 * « grain » radio ou mégaphone vient donc de l'habillage joué autour d'elle — bips d'ouverture
 * et de fermeture, souffle, clic et accroche de larsen. Quand aucune voix française n'est
 * disponible, la recette `megaphone` produit à la place une voix nasillarde INDISTINCTE qui
 * suit la prosodie du texte : on entend que quelqu'un parle dans un porte-voix, le sens passe
 * par les sous-titres.
 * ===================================================================================== */

import type { Kit } from '../kit';
import { speechBeats, syllabify, type Beat, type Syllable } from '../prosody';
import { FORMANTS } from '../voiceTextures';

/** Ouverture d'un message radio : bip aigu puis ouverture du squelch. */
export function radioBip(k: Kit): number {
  const t = k.t;
  const g = k.gain(0, k.out);
  k.trap(g.gain, t, 0.32, 0.004, 0.065, 0.012);
  k.osc('sine', 1320, g, t, t + 0.1);
  k.burst({ type: 'bandpass', f: 2200, q: 0.6, peak: 0.35, a: 0.002, tau: 0.03, t0: t + 0.08 });
  return 0.24;
}

/** Fin de message : retombée du squelch puis double bip descendant. */
export function radioFin(k: Kit): number {
  const t = k.t;
  k.burst({ type: 'bandpass', f: 1800, q: 0.6, peak: 0.45, a: 0.002, tau: 0.035 });
  const g = k.gain(0, k.out);
  k.trap(g.gain, t + 0.09, 0.3, 0.004, 0.04, 0.01);
  k.trap(g.gain, t + 0.18, 0.3, 0.004, 0.055, 0.012);
  const o = k.osc('sine', 1050, g, t + 0.08, t + 0.3);
  o.frequency.setValueAtTime(1050, t + 0.08);
  o.frequency.setValueAtTime(880, t + 0.17);
  return 0.32;
}

/** Souffle radio sous la voix : bruit de bande téléphonique et parasites (entretenu). */
export function radioSouffle(k: Kit): number {
  const m = k.sustain(2, 0.03, 0.08);
  // bande téléphonique 380–3 200 Hz, pentes raides
  const lp = k.bq('lowpass', 3200, 0.8, k.bq('lowpass', 3200, 0.6, m));
  const hp = k.bq('highpass', 380, 0.7, lp);
  k.noise('white', k.gain(0.36, hp));
  k.tex('crackle', k.bq('bandpass', 2200, 0.8, k.gain(0.4, hp)), 1.5);
  return k.duration;
}

/** Mise en route d'un mégaphone : clic de la gâchette et brève accroche de larsen. */
export function megaphoneClic(k: Kit): number {
  megaClick(k, k.t);
  return 0.32;
}

function megaClick(k: Kit, t: number): void {
  k.burst({ type: 'bandpass', f: 1800, q: 1.5, peak: 0.6, a: 0.0005, tau: 0.005, t0: t });
  k.ping(240, t, 0.3, 0.012);
  const g = k.gain(0, k.out);
  k.trap(g.gain, t + 0.03, 0.1, 0.04, 0.07, 0.1);
  const o = k.osc('sine', 2700, g, t + 0.02, t + 0.3);
  k.sweep(o.frequency, t + 0.03, 2700, t + 0.22, 3150);
}

/** Fond d'un mégaphone ouvert : souffle d'amplificateur et ronflette (entretenu). */
export function megaphoneFond(k: Kit): number {
  const m = k.sustain(2, 0.03, 0.1);
  k.noise('white', k.bq('bandpass', 1900, 0.5, k.gain(0.16, m)));
  k.osc('sawtooth', 100, k.bq('lowpass', 320, 0.7, k.gain(0.07, m)));
  return k.duration;
}

const DEFAULT_ANNOUNCE = 'Obéissance à la loi. Dispersez-vous.';
const syl: Syllable[] = [];
const beats: Beat[] = [];

/**
 * Voix de mégaphone indistincte : source vocale grave, deux formants qui suivent les voyelles du
 * texte (k.text), enveloppe syllabique, puis toute la couleur d'un porte-voix — bande étroite
 * 500–3 400 Hz, bosse à 1,3 kHz, forte saturation, écho sur les façades.
 */
export function megaphone(k: Kit): number {
  syllabify(k.text || DEFAULT_ANNOUNCE, syl);
  const total = speechBeats(syl, 0.92, k.rnd, beats);
  megaClick(k, k.t);
  const t0 = k.t + 0.24;
  const end = t0 + total + 0.1;

  const post = k.gain(0.5, k.out);
  k.echoes(post, [[0.16, 0.3, 1900], [0.34, 0.16, 1300]], k.out);
  const lp = k.bq('lowpass', 3400, 0.8, post);
  const sat = k.sat(3.5, lp);
  const pk = k.bq('peaking', 1300, 1.5, sat, 9);
  const hp = k.bq('highpass', 500, 0.8, pk);

  const env = k.gain(0, hp);
  const f1 = k.bq('bandpass', 600, 4, k.gain(1.6, env));
  const f2 = k.bq('bandpass', 1400, 5, k.gain(1.3, env));
  const src = k.gain(1);
  src.connect(f1);
  src.connect(f2);
  src.connect(k.gain(0.12, env));
  const f0 = 118;
  const o = k.osc('sawtooth', f0, src, t0 - 0.02, end);
  k.noise('white', k.gain(0.1, src), t0 - 0.02, end);
  const cons = k.gain(0, hp);
  k.noise('white', k.bq('bandpass', 2600, 1, cons), t0 - 0.05, end);

  let phraseStart = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i]!;
    const tb = t0 + b.t;
    const f = FORMANTS[b.vowel];
    env.gain.setTargetAtTime(b.stress ? 1 : 0.8, tb, 0.012);
    env.gain.setTargetAtTime(0.04, tb + b.len * 0.8, 0.028);
    f1.frequency.setTargetAtTime(f[0], tb, 0.02);
    f2.frequency.setTargetAtTime(f[1], tb, 0.02);
    // intonation : la voix descend au fil du groupe, remonte sur la syllabe accentuée
    const decl = 1.08 - 0.16 * Math.min(1, (i - phraseStart) / 8);
    o.frequency.setTargetAtTime(f0 * decl * (b.stress ? 1.1 : 1), tb, 0.03);
    if (k.rnd() < 0.55) {
      cons.gain.setTargetAtTime(0.35, tb - 0.035, 0.006);
      cons.gain.setTargetAtTime(0, tb - 0.012, 0.008);
    }
    if (syl[i]!.pause) phraseStart = i + 1;
  }
  env.gain.setTargetAtTime(0, t0 + total, 0.03);
  megaClickOff(k, t0 + total + 0.12);
  return 0.24 + total + 0.6;
}

function megaClickOff(k: Kit, t: number): void {
  k.burst({ type: 'bandpass', f: 1500, q: 1.5, peak: 0.4, a: 0.0005, tau: 0.005, t0: t });
}
