/* Petites fonctions mathématiques du module « rendu de base » (autonome : aucune dépendance hors contrats). */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Ramène un angle dans ]-π, π]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Interpole deux angles par le plus court chemin. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Facteur de lissage exponentiel indépendant de la cadence : 1 - e^(-rate·dt). */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Hachage entier → flottant [0, 1). */
export function hash01(n: number): number {
  let h = (n | 0) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Bruit de valeur 1D lisse dans [-1, 1]. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i + seed * 7919);
  const b = hash01(i + 1 + seed * 7919);
  return (a + (b - a) * u) * 2 - 1;
}

/** Couleur 0xRRGGBB (sRGB) → composantes linéaires écrites dans `out` à partir de `o`. */
export function hexToLinear(hex: number, out: Float32Array | number[], o = 0): void {
  out[o] = srgbToLinear(((hex >> 16) & 255) / 255);
  out[o + 1] = srgbToLinear(((hex >> 8) & 255) / 255);
  out[o + 2] = srgbToLinear((hex & 255) / 255);
}

export function srgbToLinear(c: number): number {
  return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminance relative d'une couleur linéaire. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
