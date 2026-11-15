/* =====================================================================================
 * Textures sonores procédurales — calculées échantillon par échantillon en TypeScript pur
 * (aucune dépendance à WebAudio : testables sous Node, utilisables dans n'importe quel
 * BaseAudioContext une fois copiées dans un AudioBuffer).
 *
 * Toutes les textures bouclent sans raccord audible : soit les événements « s'enroulent »
 * autour de la fin du tampon, soit la fin est fondue dans le début.
 * ===================================================================================== */

import { mulberry32 } from './prng';
import { renderBabble, renderBoo, renderChoir, renderScream } from './voiceTextures';

export interface Texture {
  data: Float32Array;
  sampleRate: number;
}

export type TextureId =
  | 'white' | 'pink' | 'brown' | 'crackle' | 'drops'
  | 'babble' | 'boo' | 'scream'
  | 'choir_a' | 'choir_o' | 'choir_e' | 'choir_i' | 'choir_u';

export const TEXTURE_IDS: readonly TextureId[] = [
  'white', 'pink', 'brown', 'crackle', 'drops', 'babble', 'boo', 'scream',
  'choir_a', 'choir_o', 'choir_e', 'choir_i', 'choir_u',
];

const cache = new Map<TextureId, Texture>();

/** Texture (calculée au premier appel, puis gardée en mémoire pour toute la page). */
export function getTexture(id: TextureId): Texture {
  let t = cache.get(id);
  if (!t) {
    t = build(id);
    cache.set(id, t);
  }
  return t;
}

/** La texture est-elle déjà calculée ? (le moteur précalcule les plus lourdes une par image) */
export function hasTexture(id: TextureId): boolean {
  return cache.has(id);
}

function build(id: TextureId): Texture {
  switch (id) {
    case 'white': return { data: whiteNoise(2.0, 44100, 11), sampleRate: 44100 };
    case 'pink': return { data: pinkNoise(3.0, 44100, 23), sampleRate: 44100 };
    case 'brown': return { data: brownNoise(4.0, 44100, 37), sampleRate: 44100 };
    case 'crackle': return { data: crackle(4.0, 44100, 41), sampleRate: 44100 };
    case 'drops': return { data: drops(3.0, 44100, 53), sampleRate: 44100 };
    // 22 050 Hz : bande passante suffisante pour des voix, et fréquence admise par tous les navigateurs
    case 'babble': return { data: renderBabble(8.0, 22050, 61), sampleRate: 22050 };
    case 'boo': return { data: renderBoo(5.0, 22050, 67), sampleRate: 22050 };
    case 'scream': return { data: renderScream(5.0, 22050, 71), sampleRate: 22050 };
    case 'choir_a': return { data: renderChoir('a', 2.4, 22050, 101), sampleRate: 22050 };
    case 'choir_o': return { data: renderChoir('o', 2.4, 22050, 103), sampleRate: 22050 };
    case 'choir_e': return { data: renderChoir('e', 2.4, 22050, 107), sampleRate: 22050 };
    case 'choir_i': return { data: renderChoir('i', 2.4, 22050, 109), sampleRate: 22050 };
    case 'choir_u': return { data: renderChoir('u', 2.4, 22050, 113), sampleRate: 22050 };
  }
}

// ───────────────────────────── outils ─────────────────────────────

/** Ramène la crête à `peak` (ne fait rien sur un tampon nul). */
export function normalize(data: Float32Array, peak = 0.9): Float32Array {
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

/**
 * Rend un bruit bouclable : `src` contient n + fade échantillons ; les `fade` derniers sont fondus
 * (puissance constante) dans les `fade` premiers. Retourne un tampon de n échantillons.
 */
export function loopable(src: Float32Array, fade: number): Float32Array {
  const n = src.length - fade;
  const out = new Float32Array(n);
  out.set(src.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    const a = Math.sin(u * Math.PI * 0.5); // début qui monte
    const b = Math.cos(u * Math.PI * 0.5); // queue qui descend
    out[i] = src[i]! * a + src[n + i]! * b;
  }
  return out;
}

// ───────────────────────────── bruits colorés ─────────────────────────────

export function whiteNoise(seconds: number, sr: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = (rnd() * 2 - 1) * 0.9;
  return out;
}

/** Bruit rose (−3 dB/octave) : filtre de Paul Kellet. */
export function pinkNoise(seconds: number, sr: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const fade = Math.floor(0.25 * sr);
  const n = Math.floor(seconds * sr) + fade;
  const tmp = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    tmp[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return normalize(loopable(tmp, fade), 0.9);
}

/** Bruit brun (−6 dB/octave) : intégrateur à fuite. */
export function brownNoise(seconds: number, sr: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const fade = Math.floor(0.5 * sr);
  const n = Math.floor(seconds * sr) + fade;
  const tmp = new Float32Array(n);
  let y = 0;
  let hp = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    y = y * 0.9975 + w * 0.04;
    // coupe l'infra-grave (< 12 Hz) qui ne ferait que consommer de la dynamique
    hp += 0.0017 * (y - hp);
    tmp[i] = y - hp;
  }
  return normalize(loopable(tmp, fade), 0.9);
}

// ───────────────────────────── crépitements, gouttes ─────────────────────────────

/** Crépitement de feu : claquements secs de force très inégale, quelques « pocs » plus graves. */
export function crackle(seconds: number, sr: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  const count = Math.floor(seconds * 22);
  for (let c = 0; c < count; c++) {
    const start = Math.floor(rnd() * n);
    const force = Math.pow(rnd(), 3);          // beaucoup de petits, peu de gros
    const amp = 0.08 + 0.92 * force;
    const len = Math.floor(sr * (0.0015 + 0.012 * force));
    const tau = len * 0.22;
    let lp = 0;
    const tone = 0.25 + 0.6 * rnd();           // couleur : sec et aigu … plus mat
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      lp += tone * (w - lp);
      const j = (start + i) % n;
      out[j] = out[j]! + amp * (w - lp * 0.7) * Math.exp(-i / tau);
    }
    if (force > 0.72) {
      // « poc » : bulle de sève qui éclate, composante grave brève
      const f = 90 + 140 * rnd();
      const plen = Math.floor(sr * 0.03);
      for (let i = 0; i < plen; i++) {
        const j = (start + i) % n;
        out[j] = out[j]! + 0.5 * amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (plen * 0.3));
      }
    }
  }
  return normalize(out, 0.9);
}

/** Gouttes de pluie : nuée d'impacts minuscules (clics secs) et de « plocs » brefs sur sol mouillé. */
export function drops(seconds: number, sr: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  const count = Math.floor(seconds * 700);
  for (let c = 0; c < count; c++) {
    const start = Math.floor(rnd() * n);
    const amp = 0.05 + 0.95 * Math.pow(rnd(), 4);
    if (rnd() < 0.7) {
      const len = Math.floor(sr * (0.0006 + 0.002 * rnd()));
      for (let i = 0; i < len; i++) {
        const j = (start + i) % n;
        out[j] = out[j]! + amp * (rnd() * 2 - 1) * (1 - i / len);
      }
    } else {
      const f = 1800 + 5000 * rnd();
      const len = Math.floor(sr * (0.003 + 0.006 * rnd()));
      for (let i = 0; i < len; i++) {
        const j = (start + i) % n;
        // fréquence qui descend légèrement : signature d'une goutte dans une flaque
        const ph = (2 * Math.PI * f * i * (1 - 0.25 * (i / len))) / sr;
        out[j] = out[j]! + 0.7 * amp * Math.sin(ph) * Math.exp(-i / (len * 0.3));
      }
    }
  }
  return normalize(out, 0.9);
}
