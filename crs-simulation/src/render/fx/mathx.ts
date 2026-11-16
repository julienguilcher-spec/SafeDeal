/* =====================================================================================
 * Effets visuels — petits outils numériques sans dépendance (testables sous Node).
 *
 * Le hasard des effets ne passe JAMAIS par ctx.rng : la présentation ne doit pas consommer le
 * générateur de la simulation (une image de plus ou de moins changerait le déroulé d'une mission).
 * ===================================================================================== */

export const TAU = Math.PI * 2;

/** Générateur pseudo-aléatoire rapide (xorshift32), propre aux effets visuels. */
export class FxRandom {
  private s: number;

  constructor(seed = 0x9e3779b9) {
    this.s = (seed | 0) || 0x1234567;
  }

  reseed(seed: number): void {
    this.s = (seed | 0) || 0x1234567;
  }

  /** Flottant uniforme [0, 1). */
  next(): number {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s;
    return (s >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Flottant uniforme [-1, 1). */
  signed(): number {
    return this.next() * 2 - 1;
  }

  int(maxExclusive: number): number {
    return (this.next() * maxExclusive) | 0;
  }
}

/** Hachage entier → [0, 1). */
export function hash01(n: number): number {
  let h = (n | 0) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Hachage de deux entiers → entier 32 bits non signé. */
export function hash2i(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hachage de trois entiers → entier 32 bits non signé. */
export function hash3i(a: number, b: number, c: number): number {
  return hash2i(hash2i(a, b), c);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  return smooth01((x - e0) / (e1 - e0));
}

/** Composante sRGB 0..255 → linéaire 0..1 (les couleurs du contrat sont des 0xRRGGBB sRGB). */
export function srgbToLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const LIN_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN_TABLE[i] = srgbToLinear(i);

/** Composantes linéaires d'une couleur 0xRRGGBB (table précalculée, sans allocation). */
export function linR(hex: number): number {
  return LIN_TABLE[(hex >>> 16) & 255]!;
}
export function linG(hex: number): number {
  return LIN_TABLE[(hex >>> 8) & 255]!;
}
export function linB(hex: number): number {
  return LIN_TABLE[hex & 255]!;
}

/** Bruit de valeur 1D lissé, périodique nulle part, dans [0, 1]. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i * 15731 + ((seed * 789221) | 0));
  const b = hash01((i + 1) * 15731 + ((seed * 789221) | 0));
  return a + (b - a) * f * f * (3 - 2 * f);
}
