/* Petites fonctions mathématiques du module « environnement » (autonome : aucune dépendance hors contrats). */

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

/** Interpolation lissée de Hermite : 0 sous `a`, 1 au-dessus de `b`. */
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

/** Ramène des degrés dans [0, 360[. */
export function wrapDeg(d: number): number {
  d = d % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * Approche `target` avec un lissage exponentiel (constante `rate` en 1/s) dont la vitesse est
 * plafonnée à `maxRate` par seconde : transitions douces au départ comme à l'arrivée.
 */
export function approach(value: number, target: number, rate: number, maxRate: number, dt: number): number {
  const diff = target - value;
  if (diff === 0) return value;
  let step = diff * (1 - Math.exp(-rate * dt));
  const cap = maxRate * dt;
  if (step > cap) step = cap;
  else if (step < -cap) step = -cap;
  // fin de course : on se pose exactement sur la cible
  if (Math.abs(diff - step) < 1e-5) return target;
  return value + step;
}

/** Hachage entier → flottant [0, 1) (déterministe, sans état). */
export function hash01(n: number): number {
  let h = (n | 0) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Bruit de valeur 1D lisse dans [-1, 1], déterministe : `seed` décale le motif.
 * Sert aux rafales de vent et aux variations lentes de la météo.
 */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i + seed * 7919);
  const b = hash01(i + 1 + seed * 7919);
  return (a + (b - a) * u) * 2 - 1;
}
