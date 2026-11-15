/* Aides mathématiques du rendu des personnages (aucune dépendance, aucune allocation à l'usage). */

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;

const LUT_N = 4096;
const LUT_K = LUT_N / TAU;
const LUT = new Float64Array(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) LUT[i] = Math.sin((i / LUT_N) * TAU);

/** Sinus rapide (table + interpolation linéaire, erreur < 2e-7). */
export function fsin(x: number): number {
  let f = x * LUT_K;
  const fl = Math.floor(f);
  f -= fl;
  const i = fl & (LUT_N - 1);
  const a = LUT[i];
  return a + (LUT[i + 1] - a) * f;
}

/** Cosinus rapide. */
export function fcos(x: number): number {
  return fsin(x + HALF_PI);
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, x: number): number {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** Courbe en S sur 0..1. */
export function ease(t: number): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** Ramène un angle dans ]-π, π]. */
export function wrapPi(a: number): number {
  if (a > Math.PI || a < -Math.PI) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    a -= Math.PI;
  }
  return a;
}

/** Partie fractionnaire positive. */
export function fract(x: number): number {
  return x - Math.floor(x);
}

/** Hachage entier 32 bits (déterministe). */
export function hash32(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hachage -> [0, 1). */
export function hash01(n: number): number {
  return hash32(n) / 4294967296;
}

/** Bruit lisse 1D (valeur), période ~1, sortie -1..1. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i * 374761393 + ((seed * 65536) | 0)) * 2 - 1;
  const b = hash01((i + 1) * 374761393 + ((seed * 65536) | 0)) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// ── quaternions dans des tableaux plats (x, y, z, w) ────────────────────────────────

export type NumArray = Float64Array | Float32Array | number[];

/** out[o..] = a[ao..] * b[bo..] (out peut être a ou b). */
export function qmul(out: NumArray, o: number, a: NumArray, ao: number, b: NumArray, bo: number): void {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** q = qY(ry) * qX(rx) * qZ(rz) — tronc, tête : lacet d'abord (extérieur), puis tangage, puis roulis. */
export function qEulerYXZ(out: NumArray, o: number, rx: number, ry: number, rz: number): void {
  const sx = fsin(rx * 0.5), cx = fcos(rx * 0.5);
  const sy = fsin(ry * 0.5), cy = fcos(ry * 0.5);
  const sz = fsin(rz * 0.5), cz = fcos(rz * 0.5);
  const a = sx * cz, b = -sx * sz, c = cx * sz, d = cx * cz;
  out[o] = cy * a + sy * c;
  out[o + 1] = cy * b + sy * d;
  out[o + 2] = cy * c - sy * a;
  out[o + 3] = cy * d - sy * b;
}

/** q = qX(rx) * qZ(rz) * qY(ry) — membres : torsion autour de l'os, puis abduction, puis flexion. */
export function qEulerXZY(out: NumArray, o: number, rx: number, ry: number, rz: number): void {
  const sx = fsin(rx * 0.5), cx = fcos(rx * 0.5);
  const sy = fsin(ry * 0.5), cy = fcos(ry * 0.5);
  const sz = fsin(rz * 0.5), cz = fcos(rz * 0.5);
  const a = -sz * sy, b = cz * sy, c = sz * cy, d = cz * cy;
  out[o] = cx * a + sx * d;
  out[o + 1] = cx * b - sx * c;
  out[o + 2] = cx * c + sx * b;
  out[o + 3] = cx * d - sx * a;
}

/** Rotation pure autour de X. */
export function qAxisX(out: NumArray, o: number, rx: number): void {
  out[o] = fsin(rx * 0.5);
  out[o + 1] = 0;
  out[o + 2] = 0;
  out[o + 3] = fcos(rx * 0.5);
}

/**
 * Quaternion à partir d'une base orthonormée directe (colonnes X, Y, Z).
 * Algorithme classique, robuste (branche selon la plus grande composante).
 */
export function qFromBasis(
  out: NumArray, o: number,
  xx: number, xy: number, xz: number,
  yx: number, yy: number, yz: number,
  zx: number, zy: number, zz: number,
): void {
  const tr = xx + yy + zz;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (yz - zy) / s;
    y = (zx - xz) / s;
    z = (xy - yx) / s;
  } else if (xx > yy && xx > zz) {
    const s = Math.sqrt(1 + xx - yy - zz) * 2;
    w = (yz - zy) / s;
    x = 0.25 * s;
    y = (yx + xy) / s;
    z = (zx + xz) / s;
  } else if (yy > zz) {
    const s = Math.sqrt(1 + yy - xx - zz) * 2;
    w = (zx - xz) / s;
    x = (yx + xy) / s;
    y = 0.25 * s;
    z = (zy + yz) / s;
  } else {
    const s = Math.sqrt(1 + zz - xx - yy) * 2;
    w = (xy - yx) / s;
    x = (zx + xz) / s;
    y = (zy + yz) / s;
    z = 0.25 * s;
  }
  out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = w;
}
