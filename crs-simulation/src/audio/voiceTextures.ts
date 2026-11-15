/* =====================================================================================
 * Textures de voix humaines — synthèse source-filtre calculée en TypeScript pur.
 *
 * Chaque « voix » est une source glottale (dent de scie à bande limitée, adoucie) passée dans
 * trois résonateurs (formants) dont les fréquences glissent d'une voyelle à l'autre. En
 * superposant une dizaine de voix aux hauteurs, débits et timbres différents on obtient :
 *   - renderBabble : le brouhaha d'une foule qui discute (syllabes, phrases, respirations) ;
 *   - renderBoo    : des huées (« hoooou » graves, tenus, qui retombent) ;
 *   - renderScream : des cris de panique (aigus, montée brutale puis chute, voix éraillée) ;
 *   - renderChoir  : une voyelle criée et tenue par un groupe — matière première des slogans,
 *                    que la recette hache ensuite en syllabes.
 * Aucune parole intelligible n'est produite : seulement la prosodie et le timbre.
 * ===================================================================================== */

import { mulberry32 } from './prng';
import type { Vowel } from './prosody';

type F3 = readonly [number, number, number];

/** Formants (Hz) d'une voix d'homme ; multiplier par ~1,17 pour une femme. */
export const FORMANTS: Record<Vowel, F3> = {
  a: [760, 1250, 2600],
  o: [460, 860, 2500],
  e: [430, 1850, 2600],
  i: [300, 2150, 3000],
  u: [330, 800, 2300],
};
const BANDWIDTH: F3 = [90, 120, 170];
const VOWEL_LIST: readonly Vowel[] = ['a', 'o', 'e', 'i', 'u', 'a', 'e'];

interface VoiceEvent {
  /** Début (s) et durée (s). */
  t0: number;
  dur: number;
  /** Hauteur au début, au sommet (40 % de la durée) et à la fin (Hz). */
  f0a: number;
  f0m: number;
  f0b: number;
  /** Voyelle de départ et d'arrivée, facteur d'échelle du conduit vocal. */
  va: Vowel;
  vb: Vowel;
  scale: number;
  amp: number;
  attack: number;
  release: number;
  /** 0..1 : irrégularité de la hauteur et souffle mêlé à la voix. */
  rough: number;
  /** Coupure de la source glottale (Hz) : plus haut = voix plus criée. */
  bright: number;
  /** Poids relatifs des trois formants. */
  w1: number;
  w2: number;
  w3: number;
  /** Voix tenue sur toute la boucle : pas d'enveloppe, phase périodique, préchauffage des filtres. */
  drone: boolean;
}

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Ajoute une voix au tampon `out` (les événements qui dépassent la fin s'enroulent au début). */
function renderVoice(out: Float32Array, sr: number, e: VoiceEvent, rnd: () => number): void {
  const n = out.length;
  const len = Math.max(1, Math.floor(e.dur * sr));
  const start = Math.floor(e.t0 * sr);
  const pre = e.drone ? Math.floor(0.06 * sr) : 0;
  const fa = FORMANTS[e.va];
  const fb = FORMANTS[e.vb];
  const weights = [e.w1, e.w2, e.w3];
  // états des trois résonateurs
  const y1 = [0, 0, 0];
  const y2 = [0, 0, 0];
  const a1 = [0, 0, 0];
  const a2 = [0, 0, 0];
  const g = [0, 0, 0];
  const kLp = 1 - Math.exp((-2 * Math.PI * e.bright) / sr);
  let lp = 0;
  let phase = rnd();
  let dt = e.f0a / sr;
  let env = e.drone ? 1 : 0;
  let envStep = 0;
  let jitter = 0;
  const BLOCK = 32;
  const driftPhase = rnd() * Math.PI * 2;
  for (let i = -pre; i < len; i++) {
    if (((i + pre) & (BLOCK - 1)) === 0) {
      const u = i / len;
      const tSec = i / sr;
      // hauteur : montée vers le sommet à 40 %, puis descente
      let f0: number;
      if (e.drone) {
        f0 = e.f0a * (1 + 0.012 * Math.cos(2 * Math.PI * u + driftPhase));
      } else if (u < 0.4) {
        f0 = e.f0a + (e.f0m - e.f0a) * (u / 0.4);
      } else {
        f0 = e.f0m + (e.f0b - e.f0m) * ((u - 0.4) / 0.6);
      }
      // une voix tenue doit rester périodique sur la boucle : pas de dérive aléatoire de hauteur
      jitter = e.drone ? 0 : jitter * 0.6 + (rnd() * 2 - 1) * e.rough * 0.08;
      dt = (f0 * (1 + jitter)) / sr;
      // formants : la transition de voyelle occupe le premier tiers
      const m = e.drone ? 1 : u < 0 ? 0 : u > 0.35 ? 1 : u / 0.35;
      for (let k = 0; k < 3; k++) {
        const f = (fa[k]! + (fb[k]! - fa[k]!) * m) * e.scale;
        const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
        const r = Math.exp((-Math.PI * BANDWIDTH[k]!) / sr);
        a1[k] = -2 * r * Math.cos(w);
        a2[k] = r * r;
        // gain de crête normalisé à 1 à la fréquence centrale
        g[k] = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r) * weights[k]!;
      }
      if (!e.drone) {
        const up = e.attack > 0 ? Math.min(1, Math.max(0, tSec) / e.attack) : 1;
        const down = e.release > 0 ? Math.min(1, Math.max(0, e.dur - tSec) / e.release) : 1;
        const target = up * up * (3 - 2 * up) * down * down * (3 - 2 * down);
        envStep = (target - env) / BLOCK;
      }
    }
    env += envStep;
    phase += dt;
    if (phase >= 1) phase -= 1;
    const saw = 2 * phase - 1 - polyBlep(phase, dt);
    lp += kLp * (saw - lp);
    const src = lp + (rnd() * 2 - 1) * e.rough * 0.5;
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const v = src - a1[k]! * y1[k]! - a2[k]! * y2[k]!;
      y2[k] = y1[k]!;
      y1[k] = v;
      y += v * g[k]!;
    }
    if (i >= 0) {
      const j = (start + i) % n;
      out[j] = out[j]! + y * env * e.amp;
    }
  }
}

/** Petite rafale de bruit (consonne) ajoutée devant certaines syllabes. */
function renderConsonant(out: Float32Array, sr: number, t0: number, dur: number, amp: number, rnd: () => number): void {
  const n = out.length;
  const len = Math.floor(dur * sr);
  const start = Math.floor(t0 * sr);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    lp += 0.35 * (w - lp);
    const u = i / len;
    const j = (start + i) % n;
    out[j] = out[j]! + amp * (w - lp) * Math.sin(Math.PI * u);
  }
}

function peakNormalize(data: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]!);
    if (v > m) m = v;
  }
  if (m > 1e-9) {
    const k = peak / m;
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * k;
  }
  return data;
}

function baseEvent(): VoiceEvent {
  return {
    t0: 0, dur: 0.2, f0a: 120, f0m: 120, f0b: 120, va: 'a', vb: 'a', scale: 1, amp: 1,
    attack: 0.03, release: 0.05, rough: 0.04, bright: 1400, w1: 1, w2: 0.55, w3: 0.22, drone: false,
  };
}

/** Brouhaha de conversation : `voices` personnes qui parlent par phrases de 3 à 9 syllabes. */
export function renderBabble(seconds: number, sr: number, seed: number, voices = 11): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  const e = baseEvent();
  for (let v = 0; v < voices; v++) {
    const female = rnd() < 0.42;
    const base = female ? 185 + 50 * rnd() : 100 + 38 * rnd();
    const level = 0.3 + 0.7 * rnd();           // proche … lointain
    const bright = 800 + 1100 * level;
    const tempo = 0.85 + 0.35 * rnd();
    let t = rnd() * 1.8;
    let prev: Vowel = 'e';
    while (t < seconds) {
      const count = 3 + Math.floor(rnd() * 7);
      for (let s = 0; s < count && t < seconds; s++) {
        const decl = 0.08 - 0.18 * (s / count);  // la voix descend au fil de la phrase
        const last = s === count - 1;
        const dur = ((last ? 0.2 : 0.12) + 0.1 * rnd()) / tempo;
        const f0 = base * (1 + decl) * (0.95 + 0.1 * rnd());
        const vowel = VOWEL_LIST[Math.floor(rnd() * VOWEL_LIST.length)]!;
        if (rnd() < 0.3) renderConsonant(out, sr, t, 0.035, 0.12 * level, rnd);
        e.t0 = t + 0.02;
        e.dur = dur * 0.95;
        e.f0a = f0 * 1.03;
        e.f0m = f0;
        e.f0b = f0 * (last ? 0.9 : 0.97);
        e.va = prev;
        e.vb = vowel;
        e.scale = female ? 1.17 : 1;
        e.amp = level * (0.55 + 0.45 * rnd());
        e.attack = 0.025;
        e.release = last ? 0.09 : 0.045;
        e.rough = 0.03;
        e.bright = bright;
        renderVoice(out, sr, e, rnd);
        prev = vowel;
        t += dur;
      }
      t += 0.35 + 1.3 * rnd();
    }
  }
  return peakNormalize(out, 0.9);
}

/** Huées : voix graves tenues sur « ou », qui retombent d'une tierce en fin de souffle. */
export function renderBoo(seconds: number, sr: number, seed: number, voices = 12): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  const e = baseEvent();
  for (let v = 0; v < voices; v++) {
    const female = rnd() < 0.25;
    const base = female ? 195 + 55 * rnd() : 105 + 60 * rnd();
    let t = rnd() * 1.4;
    while (t < seconds) {
      const dur = 0.7 + 1.3 * rnd();
      e.t0 = t;
      e.dur = dur;
      e.f0a = base * (1.05 + 0.1 * rnd());
      e.f0m = base;
      e.f0b = base * (0.72 + 0.13 * rnd());
      e.va = 'u';
      e.vb = rnd() < 0.3 ? 'o' : 'u';
      e.scale = female ? 1.17 : 1;
      e.amp = 0.5 + 0.5 * rnd();
      e.attack = 0.12 + 0.13 * rnd();
      e.release = 0.3 + 0.2 * rnd();
      e.rough = 0.07;
      e.bright = 700 + 500 * rnd();
      e.w2 = 0.5;
      e.w3 = 0.1;
      renderVoice(out, sr, e, rnd);
      t += dur + 0.1 + 0.6 * rnd();
    }
  }
  return peakNormalize(out, 0.9);
}

/** Cris de panique : cris aigus (montée brutale, chute) et appels plus graves et brefs. */
export function renderScream(seconds: number, sr: number, seed: number, voices = 9): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  const e = baseEvent();
  for (let v = 0; v < voices; v++) {
    const high = rnd() < 0.62;
    let t = rnd() * 1.6;
    while (t < seconds) {
      if (high) {
        e.dur = 0.35 + 0.95 * rnd();
        e.f0a = 420 + 180 * rnd();
        e.f0m = 700 + 450 * rnd();
        e.f0b = 450 + 250 * rnd();
        e.va = 'a';
        e.vb = rnd() < 0.6 ? 'a' : 'i';
        e.scale = 1.2;
        e.attack = 0.03 + 0.03 * rnd();
        e.release = 0.1 + 0.15 * rnd();
        e.rough = 0.12 + 0.08 * rnd();
        e.bright = 3600;
        e.w2 = 0.8;
        e.w3 = 0.45;
      } else {
        e.dur = 0.25 + 0.35 * rnd();
        e.f0a = 200 + 60 * rnd();
        e.f0m = 260 + 80 * rnd();
        e.f0b = 180 + 50 * rnd();
        e.va = 'e';
        e.vb = rnd() < 0.5 ? 'a' : 'o';
        e.scale = 1;
        e.attack = 0.025;
        e.release = 0.08 + 0.08 * rnd();
        e.rough = 0.1;
        e.bright = 2400;
        e.w2 = 0.7;
        e.w3 = 0.3;
      }
      e.t0 = t;
      e.amp = 0.5 + 0.5 * rnd();
      renderVoice(out, sr, e, rnd);
      t += e.dur + 0.25 + 1.5 * rnd();
    }
  }
  return peakNormalize(out, 0.9);
}

/**
 * Voyelle criée et tenue par un groupe (boucle parfaite : chaque voix fait un nombre entier de
 * périodes sur la durée du tampon).
 */
export function renderChoir(vowel: Vowel, seconds: number, sr: number, seed: number, voices = 12): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  const e = baseEvent();
  for (let v = 0; v < voices; v++) {
    const female = rnd() < 0.4;
    const f0 = female ? 250 + 80 * rnd() : 135 + 50 * rnd();
    const cycles = Math.round(f0 * seconds);
    e.t0 = 0;
    e.dur = seconds;
    e.f0a = e.f0m = e.f0b = cycles / seconds;
    e.va = e.vb = vowel;
    e.scale = (female ? 1.17 : 1) * (0.96 + 0.08 * rnd());
    e.amp = 0.5 + 0.5 * rnd();
    e.rough = 0.05;
    e.bright = 2300 + 700 * rnd();
    e.w1 = 1;
    e.w2 = 0.72;
    e.w3 = 0.36;
    e.drone = true;
    renderVoice(out, sr, e, rnd);
  }
  return peakNormalize(out, 0.9);
}
