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

// ───────────────────────────── collisions disque / boîte orientée ─────────────────────────────

/**
 * Disque (px, pz, radius) contre disque (cx, cz, cr). S'ils se chevauchent, écrit dans `out` le
 * déplacement minimal à AJOUTER au centre du premier disque pour le sortir, et retourne true.
 */
export function circleVsCircle(
  px: number, pz: number, radius: number, cx: number, cz: number, cr: number, out: Vec2,
): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  const sum = radius + cr;
  const d2 = dx * dx + dz * dz;
  if (d2 >= sum * sum) {
    out.x = 0;
    out.z = 0;
    return false;
  }
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const k = (sum - d) / d;
    out.x = dx * k;
    out.z = dz * k;
  } else {
    // centres confondus : direction arbitraire mais déterministe
    out.x = sum;
    out.z = 0;
  }
  return true;
}

/** Carré de la distance d'un point à une boîte orientée (0 si le point est dedans). */
export function distSqPointObb(
  px: number, pz: number, cx: number, cz: number, halfX: number, halfZ: number, heading: number,
): number {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const dx = px - cx;
  const dz = pz - cz;
  const lx = Math.abs(dx * c - dz * s) - halfX;
  const lz = Math.abs(dx * s + dz * c) - halfZ;
  const ox = lx > 0 ? lx : 0;
  const oz = lz > 0 ? lz : 0;
  return ox * ox + oz * oz;
}

/**
 * Disque contre boîte orientée (centre cx/cz, demi-dimensions halfX le long de l'axe local x,
 * halfZ le long de l'axe avant, cap `heading`). S'il y a chevauchement, écrit dans `out` le vecteur
 * de sortie minimal à AJOUTER au centre du disque, et retourne true. Gère le centre à l'intérieur
 * de la boîte (sortie par la face la plus proche).
 */
export function circleVsObb(
  px: number, pz: number, radius: number,
  cx: number, cz: number, halfX: number, halfZ: number, heading: number, out: Vec2,
): boolean {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const dx = px - cx;
  const dz = pz - cz;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const qx = lx < -halfX ? -halfX : lx > halfX ? halfX : lx;
  const qz = lz < -halfZ ? -halfZ : lz > halfZ ? halfZ : lz;
  const ox = lx - qx;
  const oz = lz - qz;
  const d2 = ox * ox + oz * oz;
  let pushX: number;
  let pushZ: number;
  if (d2 > 1e-12) {
    if (d2 >= radius * radius) {
      out.x = 0;
      out.z = 0;
      return false;
    }
    const d = Math.sqrt(d2);
    const k = (radius - d) / d;
    pushX = ox * k;
    pushZ = oz * k;
  } else {
    const penX = halfX - Math.abs(lx);
    const penZ = halfZ - Math.abs(lz);
    if (penX < penZ) {
      pushX = (lx >= 0 ? 1 : -1) * (penX + radius);
      pushZ = 0;
    } else {
      pushX = 0;
      pushZ = (lz >= 0 ? 1 : -1) * (penZ + radius);
    }
  }
  out.x = pushX * c + pushZ * s;
  out.z = -pushX * s + pushZ * c;
  return true;
}

// ───────────────────────────── intersections de segments ─────────────────────────────

/** Résultat d'une intersection segment-segment. */
export interface SegmentHit {
  /** Fraction le long de AB (0..1). */
  t: number;
  /** Fraction le long de CD (0..1). */
  u: number;
  x: number;
  z: number;
}

/** Résultat d'un lancer de segment contre une forme. */
export interface SegmentCast {
  /** Fraction du segment au point d'entrée (0..1). */
  t: number;
  /** Normale sortante de la forme au point d'entrée (unitaire, repère monde). */
  nx: number;
  nz: number;
}

/**
 * Intersection des segments AB et CD. Les segments parallèles ou colinéaires ne se coupent pas
 * (retourne false). Si `out` est fourni, il reçoit t, u et le point d'intersection.
 */
export function segmentSegment(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number, out?: SegmentHit,
): boolean {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (den > -1e-12 && den < 1e-12) return false;
  const qx = cx - ax;
  const qz = cz - az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return false;
  if (out) {
    out.t = t;
    out.u = u;
    out.x = ax + rx * t;
    out.z = az + rz * t;
  }
  return true;
}

/**
 * Segment AB contre disque. Retourne true s'il le touche ; `out.t` = fraction d'entrée,
 * `out.nx/nz` = normale au point d'entrée. Si A est déjà dans le disque : t = 0, normale de A vers l'extérieur.
 */
export function segmentVsCircle(
  ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number, out: SegmentCast,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) {
    const l = Math.sqrt(fx * fx + fz * fz);
    out.t = 0;
    if (l > 1e-9) {
      out.nx = fx / l;
      out.nz = fz / l;
    } else {
      const dl = Math.sqrt(dx * dx + dz * dz);
      out.nx = dl > 1e-9 ? -dx / dl : 0;
      out.nz = dl > 1e-9 ? -dz / dl : 0;
    }
    return true;
  }
  const a = dx * dx + dz * dz;
  if (a < 1e-18) return false;
  const b = fx * dx + fz * dz;
  if (b >= 0) return false; // s'éloigne du disque
  const disc = b * b - a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0 || t > 1) return false;
  out.t = t;
  out.nx = (fx + dx * t) / r;
  out.nz = (fz + dz * t) / r;
  return true;
}

/**
 * Segment AB contre boîte orientée. Retourne true s'il la touche ; `out.t` = fraction d'entrée,
 * `out.nx/nz` = normale de la face touchée (repère monde). Si A est dans la boîte : t = 0 et la normale
 * est l'opposé de la direction du segment.
 */
export function segmentVsObb(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, halfX: number, halfZ: number, heading: number, out: SegmentCast,
): boolean {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const rax = ax - cx;
  const raz = az - cz;
  const lax = rax * c - raz * s;
  const laz = rax * s + raz * c;
  const wdx = bx - ax;
  const wdz = bz - az;
  const ldx = wdx * c - wdz * s;
  const ldz = wdx * s + wdz * c;

  let tmin = 0;
  let tmax = 1;
  let nLx = 0;
  let nLz = 0;

  // tranche x
  if (ldx > -1e-12 && ldx < 1e-12) {
    if (lax < -halfX || lax > halfX) return false;
  } else {
    const inv = 1 / ldx;
    let t1 = (-halfX - lax) * inv;
    let t2 = (halfX - lax) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nLx = sign;
      nLz = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  // tranche z
  if (ldz > -1e-12 && ldz < 1e-12) {
    if (laz < -halfZ || laz > halfZ) return false;
  } else {
    const inv = 1 / ldz;
    let t1 = (-halfZ - laz) * inv;
    let t2 = (halfZ - laz) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nLx = 0;
      nLz = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }

  out.t = tmin;
  if (nLx === 0 && nLz === 0) {
    // départ à l'intérieur de la boîte
    const l = Math.sqrt(wdx * wdx + wdz * wdz);
    out.nx = l > 1e-9 ? -wdx / l : 0;
    out.nz = l > 1e-9 ? -wdz / l : 0;
  } else {
    out.nx = nLx * c + nLz * s;
    out.nz = -nLx * s + nLz * c;
  }
  return true;
}
