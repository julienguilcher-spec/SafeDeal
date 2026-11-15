/* =====================================================================================
 * Utilitaires mathématiques — aucune allocation : scalaires en retour, résultats composés
 * écrits dans un objet `out` fourni par l'appelant (à réutiliser d'un appel à l'autre).
 *
 * Conventions (voir docs/BRIEF.md) :
 *   - plan (x, z) : x = est, z = sud ; y = haut ;
 *   - cap h (radians) : vecteur avant = (sin h, cos h) ; h = 0 regarde vers +z (sud) ;
 *   - repère local « Three.js » d'un objet de cap h (object.rotation.y = h) :
 *       +z local = avant, +x local = GAUCHE de l'objet (repère direct, y vers le haut) ;
 *     monde = (lx·cos h + lz·sin h, −lx·sin h + lz·cos h) ;
 *   - repère « véhicule » du contrat (SeatDef : x droite, z avant) : voir vehicleToWorldX/Z.
 * ===================================================================================== */

import type { Vec2 } from './contracts';

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
/** Tolérance géométrique (m², déterminants…). */
export const EPSILON = 1e-9;

// ───────────────────────────── scalaires ─────────────────────────────

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse de lerp : position de v entre a et b (non bornée ; 0 si a = b). */
export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

/** Transpose v de [inMin, inMax] vers [outMin, outMax], borné aux extrémités. */
export function remap(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + (outMax - outMin) * clamp01(invLerp(inMin, inMax, v));
}

/** Transition douce de Hermite : 0 si x ≤ edge0, 1 si x ≥ edge1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Variante à dérivées première et seconde nulles aux bords. */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Rapproche `current` de `target` d'au plus `maxDelta` (≥ 0), sans dépasser. */
export function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (d > maxDelta) return current + maxDelta;
  if (d < -maxDelta) return current - maxDelta;
  return target;
}

/**
 * Amortissement exponentiel indépendant du pas de temps : même résultat en un pas de dt
 * qu'en n pas de dt/n. `lambda` (1/s) : plus grand = plus vif (≈ 63 % de l'écart comblé en 1/lambda s).
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Fraction de l'écart comblée pendant dt pour un amortissement `lambda` : 1 − e^(−lambda·dt). */
export function dampFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

// ───────────────────────────── angles et caps ─────────────────────────────

/** Ramène un angle dans ]−π, π]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Plus petite rotation signée pour aller de `from` à `to`, dans ]−π, π]. */
export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Tourne `current` vers `target` d'au plus `maxStep` radians (≥ 0) par le plus court chemin. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  if (d > maxStep) return wrapAngle(current + maxStep);
  if (d < -maxStep) return wrapAngle(current - maxStep);
  return wrapAngle(target);
}

/** Interpolation d'angles par le plus court chemin. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDiff(a, b) * t);
}

/** Amortissement exponentiel d'un angle (indépendant du pas de temps). */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return wrapAngle(current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt)));
}

/** Cap d'un vecteur (dx, dz) : atan2(dx, dz). (0, 0) → 0. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Cap pour aller du point A au point B. */
export function headingTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(bx - ax, bz - az);
}

/** Composante x du vecteur avant d'un cap. */
export function forwardX(heading: number): number {
  return Math.sin(heading);
}

/** Composante z du vecteur avant d'un cap. */
export function forwardZ(heading: number): number {
  return Math.cos(heading);
}

/** Composante x du vecteur « à droite » de quelqu'un qui regarde selon le cap (cap 0 = sud → droite = ouest). */
export function rightX(heading: number): number {
  return -Math.cos(heading);
}

/** Composante z du vecteur « à droite ». */
export function rightZ(heading: number): number {
  return Math.sin(heading);
}

/** Relèvement géographique en degrés [0, 360[ : 0 = nord, 90 = est, 180 = sud, 270 = ouest. */
export function compassBearing(heading: number): number {
  const b = (180 - heading * RAD2DEG) % 360;
  return b < 0 ? b + 360 : b;
}

const CARDINALS_FR = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'] as const;

/** Direction cardinale en français (« nord », « sud-est »…) pour un cap. */
export function cardinalFr(heading: number): string {
  return CARDINALS_FR[Math.round(compassBearing(heading) / 45) % 8]!;
}

// ───────────────────────────── repères locaux ─────────────────────────────

/** Local Three.js (+x gauche, +z avant) → décalage monde, composante x. */
export function localToWorldX(lx: number, lz: number, heading: number): number {
  return lx * Math.cos(heading) + lz * Math.sin(heading);
}

/** Local Three.js (+x gauche, +z avant) → décalage monde, composante z. */
export function localToWorldZ(lx: number, lz: number, heading: number): number {
  return -lx * Math.sin(heading) + lz * Math.cos(heading);
}

/** Décalage monde → local Three.js, composante x (gauche). */
export function worldToLocalX(dx: number, dz: number, heading: number): number {
  return dx * Math.cos(heading) - dz * Math.sin(heading);
}

/** Décalage monde → local Three.js, composante z (avant). */
export function worldToLocalZ(dx: number, dz: number, heading: number): number {
  return dx * Math.sin(heading) + dz * Math.cos(heading);
}

/** Repère véhicule du contrat (right = vers la droite, fwd = vers l'avant) → décalage monde, composante x. */
export function vehicleToWorldX(right: number, fwd: number, heading: number): number {
  return -right * Math.cos(heading) + fwd * Math.sin(heading);
}

/** Repère véhicule du contrat (right, fwd) → décalage monde, composante z. */
export function vehicleToWorldZ(right: number, fwd: number, heading: number): number {
  return right * Math.sin(heading) + fwd * Math.cos(heading);
}

// ───────────────────────────── vecteurs et distances ─────────────────────────────

export function lenSq(x: number, z: number): number {
  return x * x + z * z;
}

export function len(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

export function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function dot2(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

/** Produit vectoriel 2D (déterminant) : ax·bz − az·bx. */
export function cross2(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

/** Normalise `v` sur place ; retourne la longueur d'origine (vecteur nul laissé à zéro). */
export function normalize2(v: Vec2): number {
  const l = Math.sqrt(v.x * v.x + v.z * v.z);
  if (l > 1e-12) {
    v.x /= l;
    v.z /= l;
  } else {
    v.x = 0;
    v.z = 0;
  }
  return l;
}

/** Limite la norme de `v` à `maxLen` (sur place) ; retourne la norme finale. */
export function clampLength2(v: Vec2, maxLen: number): number {
  const l2 = v.x * v.x + v.z * v.z;
  if (l2 <= maxLen * maxLen) return Math.sqrt(l2);
  const k = maxLen / Math.sqrt(l2);
  v.x *= k;
  v.z *= k;
  return maxLen;
}

// ───────────────────────────── point / segment / polygone ─────────────────────────────

/** Paramètre t ∈ [0, 1] du point du segment AB le plus proche de P. */
export function segmentParam(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const l2 = abx * abx + abz * abz;
  if (l2 < 1e-12) return 0;
  const t = ((px - ax) * abx + (pz - az) * abz) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Carré de la distance du point P au segment AB. */
export function distSqPointSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const t = segmentParam(px, pz, ax, az, bx, bz);
  const dx = px - (ax + (bx - ax) * t);
  const dz = pz - (az + (bz - az) * t);
  return dx * dx + dz * dz;
}

/** Écrit dans `out` le point du segment AB le plus proche de P ; retourne son paramètre t ∈ [0, 1]. */
export function closestPointOnSegment(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number, out: Vec2,
): number {
  const t = segmentParam(px, pz, ax, az, bx, bz);
  out.x = ax + (bx - ax) * t;
  out.z = az + (bz - az) * t;
  return t;
}

/**
 * Point dans un polygone (règle pair-impair) sur tableau plat [x0, z0, x1, z1, …].
 * `count` = nombre de sommets (par défaut tout le tableau), `offset` = index du premier nombre.
 * Le polygone est implicitement fermé ; le sens de parcours est indifférent.
 */
export function pointInPolygon(
  px: number, pz: number, poly: ArrayLike<number>, count: number = poly.length >> 1, offset = 0,
): boolean {
  let inside = false;
  let jx = poly[offset + (count - 1) * 2]!;
  let jz = poly[offset + (count - 1) * 2 + 1]!;
  for (let i = 0; i < count; i++) {
    const ix = poly[offset + i * 2]!;
    const iz = poly[offset + i * 2 + 1]!;
    if ((iz > pz) !== (jz > pz) && px < ((jx - ix) * (pz - iz)) / (jz - iz) + ix) inside = !inside;
    jx = ix;
    jz = iz;
  }
  return inside;
}

/** Aire signée d'un polygone plat [x0, z0, …] (signe selon le sens de parcours). */
export function polygonArea(poly: ArrayLike<number>, count: number = poly.length >> 1, offset = 0): number {
  let a = 0;
  let jx = poly[offset + (count - 1) * 2]!;
  let jz = poly[offset + (count - 1) * 2 + 1]!;
  for (let i = 0; i < count; i++) {
    const ix = poly[offset + i * 2]!;
    const iz = poly[offset + i * 2 + 1]!;
    a += jx * iz - ix * jz;
    jx = ix;
    jz = iz;
  }
  return a * 0.5;
}

// ───────────────────────────── polylignes plates [x0, z0, x1, z1, …] ─────────────────────────────

/** Longueur d'une polyligne plate. `count` = nombre de points. */
export function polylineLength(points: ArrayLike<number>, count: number = points.length >> 1): number {
  let total = 0;
  for (let i = 1; i < count; i++) {
    const dx = points[i * 2]! - points[i * 2 - 2]!;
    const dz = points[i * 2 + 1]! - points[i * 2 - 1]!;
    total += Math.sqrt(dx * dx + dz * dz);
  }
  return total;
}

/**
 * Point situé à l'abscisse curviligne `s` (m) le long de la polyligne, borné aux extrémités.
 * Écrit le point dans `out` et retourne le cap du tronçon à cet endroit (0 si moins de 2 points).
 */
export function pointOnPolyline(
  points: ArrayLike<number>, s: number, out: Vec2, count: number = points.length >> 1,
): number {
  if (count <= 0) {
    out.x = 0;
    out.z = 0;
    return 0;
  }
  if (count === 1) {
    out.x = points[0]!;
    out.z = points[1]!;
    return 0;
  }
  let remaining = s < 0 ? 0 : s;
  let heading = 0;
  for (let i = 1; i < count; i++) {
    const ax = points[i * 2 - 2]!;
    const az = points[i * 2 - 1]!;
    const dx = points[i * 2]! - ax;
    const dz = points[i * 2 + 1]! - az;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l > 1e-9) heading = Math.atan2(dx, dz);
    if (remaining <= l || i === count - 1) {
      const t = l > 1e-9 ? (remaining < l ? remaining / l : 1) : 0;
      out.x = ax + dx * t;
      out.z = az + dz * t;
      return heading;
    }
    remaining -= l;
  }
  return heading;
}

/**
 * Projette P sur la polyligne : écrit le point le plus proche dans `out` et retourne son abscisse
 * curviligne (m depuis le premier point).
 */
export function projectOnPolyline(
  px: number, pz: number, points: ArrayLike<number>, out: Vec2, count: number = points.length >> 1,
): number {
  if (count <= 0) {
    out.x = px;
    out.z = pz;
    return 0;
  }
  let bestD2 = Infinity;
  let bestS = 0;
  let bx = points[0]!;
  let bz = points[1]!;
  let acc = 0;
  for (let i = 1; i < count; i++) {
    const ax = points[i * 2 - 2]!;
    const az = points[i * 2 - 1]!;
    const cx = points[i * 2]!;
    const cz = points[i * 2 + 1]!;
    const dx = cx - ax;
    const dz = cz - az;
    const l = Math.sqrt(dx * dx + dz * dz);
    const t = segmentParam(px, pz, ax, az, cx, cz);
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const d2 = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = acc + l * t;
      bx = qx;
      bz = qz;
    }
    acc += l;
  }
  out.x = bx;
  out.z = bz;
  return bestS;
}

// ───────────────────────────── collisions et intersections ─────────────────────────────
// circleVsCircle, distSqPointObb, circleVsObb, segmentSegment, segmentVsCircle, segmentVsObb

export * from './math-collide';
