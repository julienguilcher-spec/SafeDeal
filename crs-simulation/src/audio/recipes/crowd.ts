/* =====================================================================================
 * Recettes : lits de foule — murmure, slogans scandés, huées, panique.
 *
 * La matière vient des textures de voix (voiceTextures.ts). Les slogans sont SCANDÉS : la recette
 * découpe le texte (k.text, ou un slogan générique fictif) en syllabes, puis hache des voyelles
 * criées en chœur selon ce rythme, avec une attaque de consonne sur chaque syllabe et deux
 * copies retardées (une foule n'est jamais parfaitement ensemble).
 * ===================================================================================== */

import type { Kit } from '../kit';
import { chantBeats, syllabify, type Beat, type Syllable, type Vowel } from '../prosody';
import type { TextureId } from '../textures';

/** Slogans génériques et fictifs (aucun mouvement réel), utilisés quand aucun texte n'est fourni. */
export const GENERIC_SLOGANS: readonly string[] = [
  'On lâche rien, on lâche rien !',
  'Tous ensemble, tous ensemble, ouais !',
  'Retrait, retrait, retrait du projet !',
  'La rue, elle est à nous !',
  'Résistance ! Résistance !',
  'On est là, on est là !',
  'Assez, assez, assez de mépris !',
  'Écoutez-nous ! Écoutez-nous !',
];

/** Murmure d'une foule calme : conversations mêlées, sur deux plans (proche et lointain). */
export function fouleCalme(k: Kit): number {
  const m = k.sustain(3, 0.4, 0.5);
  const hp = k.bq('highpass', 130, 0.6, m);
  k.tex('babble', k.gain(0.75, hp));
  k.tex('babble', k.bq('lowpass', 1300, 0.6, k.gain(0.6, hp)), 0.91);
  return k.duration;
}

/** Huées : « hoooou » graves, tenus, par vagues. */
export function fouleHuees(k: Kit): number {
  const m = k.sustain(3, 0.3, 0.5);
  const hp = k.bq('highpass', 110, 0.6, m);
  k.tex('boo', k.gain(0.7, hp));
  k.tex('boo', k.gain(0.5, hp), 1.07);
  k.tex('babble', k.bq('lowpass', 1500, 0.6, k.gain(0.2, hp)), 0.8);
  return k.duration;
}

/** Panique : cris aigus, appels, brouhaha précipité, piétinement. */
export function foulePanique(k: Kit): number {
  const m = k.sustain(3, 0.25, 0.5);
  const hp = k.bq('highpass', 160, 0.6, m);
  k.tex('scream', k.gain(0.6, hp));
  k.tex('scream', k.gain(0.45, hp), 1.12);
  k.tex('babble', k.gain(0.4, hp), 1.28);
  // course désordonnée : chocs sourds et serrés
  k.tex('crackle', k.bq('lowpass', 700, 0.7, k.gain(0.35, m)), 0.45);
  return k.duration;
}

const syl: Syllable[] = [];
const beats: Beat[] = [];
const CHOIR: Record<Vowel, TextureId> = { a: 'choir_a', o: 'choir_o', e: 'choir_e', i: 'choir_i', u: 'choir_u' };

/**
 * Slogan scandé. Joué une fois : le slogan est répété pour durer ≈ 3 s. En boucle, le moteur
 * relance la recette à chaque période (k.period) : la scansion continue en mesure, avec un
 * nouveau slogan générique si aucun texte n'est imposé.
 */
export function fouleSlogans(k: Kit): number {
  const text = k.text || GENERIC_SLOGANS[Math.floor(k.rnd() * GENERIC_SLOGANS.length)]!;
  syllabify(text, syl);
  if (syl.length > 14) syl.length = 14;
  const beat = k.r(0.27, 0.32);
  const phrase = Math.max(beat * 2, chantBeats(syl, beat, beats));
  const repeats = Math.min(4, Math.max(1, Math.round(3 / phrase)));
  const total = phrase * repeats;
  const t = k.t;
  const end = t + total + 0.3;

  const post = k.gain(0.62, k.out);
  const bus = k.bq('highpass', 220, 0.6, post);
  // la foule n'attaque pas d'un bloc : deux copies en retard
  k.echoes(bus, [[0.055, 0.5, 6000], [0.12, 0.28, 2600]], post);

  const gains: Partial<Record<Vowel, GainNode>> = {};
  for (let i = 0; i < beats.length; i++) {
    const v = beats[i]!.vowel;
    if (!gains[v]) {
      const g = k.gain(0, bus);
      k.tex(CHOIR[v], g, 1, t, end);
      gains[v] = g;
    }
  }
  const cons = k.gain(0, bus);
  k.noise('white', k.bq('bandpass', 2800, 1, cons), t, end);

  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i]!;
      const tb = t + r * phrase + b.t;
      const g = gains[b.vowel]!;
      g.gain.setTargetAtTime(b.stress ? 1 : 0.78, tb, 0.014);
      g.gain.setTargetAtTime(0, tb + b.len, 0.032);
      // attaque de consonne
      cons.gain.setTargetAtTime(0.28, Math.max(t, tb - 0.03), 0.006);
      cons.gain.setTargetAtTime(0, Math.max(t + 0.001, tb - 0.004), 0.01);
    }
  }
  k.period = total;
  return total + 0.3;
}
