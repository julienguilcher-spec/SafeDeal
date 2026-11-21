/* =====================================================================================
 * Générateur pseudo-aléatoire déterministe (sfc32) — toute la simulation passe par ctx.rng.
 *
 *   - createRng(seed) : même graine → même suite, sur toutes les machines ;
 *   - fork(label) : générateur dérivé INDÉPENDANT. Il ne dépend que de la graine d'origine du
 *     parent et du label : il ne consomme pas le parent, et son flux ne change pas selon le nombre
 *     de tirages déjà effectués ailleurs. Deux fork() avec le même label donnent donc le même flux :
 *     utiliser un label distinct par usage (nom du module, identifiant d'entité…).
 * ===================================================================================== */

import type { Rng, Vec2 } from './contracts';

/** Rng du contrat, plus la graine et la possibilité de la réinitialiser (réservé au cœur du moteur). */
export interface SeededRng extends Rng {
  /** Graine d'origine normalisée (entier non signé 32 bits). */
  readonly seed: number;
  /** Repart du début de la suite associée à `seed`. */
  reseed(seed: number): void;
  fork(label: string | number): SeededRng;
}

/** Hachage FNV-1a 32 bits d'une chaîne, avec avalanche finale. Retourne un entier non signé. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Avalanche 32 bits (finaliseur de murmur3) : entier quelconque → entier non signé bien mélangé. */
export function mix32(n: number): number {
  let h = n | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Combine deux entiers en un hachage 32 bits non signé (ordre significatif). */
export function hash2(a: number, b: number): number {
  return mix32(Math.imul(mix32(a) ^ 0x9e3779b9, 0x85ebca6b) + mix32(b + 0x7f4a7c15));
}

/** Ramène une graine quelconque (entier, flottant, NaN…) à un entier non signé 32 bits. */
export function normalizeSeed(seed: number): number {
  return Number.isInteger(seed) ? seed >>> 0 : hashString(String(seed));
}

class Sfc32 implements SeededRng {
  seed = 0;
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed: number) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    const s = normalizeSeed(seed);
    this.seed = s;
    this.a = mix32(s + 0x9e3779b9);
    this.b = mix32(s + 0x3c6ef372);
    this.c = mix32(s + 0xdaa66d2b);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.u32();
  }

  /** Entier non signé 32 bits. */
  private u32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  next(): number {
    return this.u32() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxExclusive: number): number {
    if (!(maxExclusive > minInclusive)) return minInclusive;
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('[rng] pick() sur un tableau vide');
    return items[Math.floor(this.next() * items.length)]!;
  }

  fork(label: string | number): SeededRng {
    const l = typeof label === 'number' && Number.isInteger(label) ? mix32(label) : hashString(String(label));
    return new Sfc32(hash2(this.seed, l));
  }
}

/** Crée un générateur déterministe. */
export function createRng(seed: number): SeededRng {
  return new Sfc32(seed);
}

// ───────────────────────────── aides (fonctionnent avec n'importe quel Rng) ─────────────────────────────

/** Tirage gaussien (Box-Muller). */
export function gaussian(rng: Rng, mean = 0, sd = 1): number {
  let u = rng.next();
  if (u < 1e-12) u = 1e-12;
  const v = rng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
}

/** Mélange sur place (Fisher-Yates) ; retourne le même tableau. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Index tiré selon des poids positifs (−1 si la somme est nulle ou le tableau vide). */
export function weightedIndex(rng: Rng, weights: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i]! > 0 ? weights[i]! : 0;
  if (!(total > 0)) return -1;
  let r = rng.next() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (!(w > 0)) continue;
    last = i;
    if (r < w) return i;
    r -= w;
  }
  return last;
}

/** Point uniforme dans un disque de rayon `radius` centré sur l'origine (écrit dans `out`). */
export function randomInDisc(rng: Rng, radius: number, out: Vec2): Vec2 {
  const a = rng.next() * 6.283185307179586;
  const r = Math.sqrt(rng.next()) * radius;
  out.x = Math.cos(a) * r;
  out.z = Math.sin(a) * r;
  return out;
}
