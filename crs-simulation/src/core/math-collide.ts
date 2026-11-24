/* =====================================================================================
 * Collisions et intersections dans le plan (x, z) — partie de '@/core/math' (qui ré-exporte tout).
 * Aucune allocation : les résultats composés sont écrits dans un objet `out` fourni par l'appelant.
 * Boîte orientée : centre (cx, cz), demi-dimension halfX le long de son axe local x, halfZ le long
 * de son axe avant, cap `heading` (même convention que object.rotation.y).
 *
 * Valeurs invalides : une forme ou un segment dont une coordonnée n'est pas un nombre fini (NaN,
 * infini) ne touche rien — les fonctions répondent « pas de contact » et n'écrivent jamais de NaN
 * dans `out`. Une entité corrompue par un bogue ne contamine donc pas celles qui la croisent.
 * ===================================================================================== */

import type { Vec2 } from './contracts';

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
  // écrit ainsi, le test écarte aussi les valeurs NaN
  if (!(d2 < sum * sum) || !(sum > 0) || sum === Infinity) {
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
  if (lx !== lx || lz !== lz) return Infinity; // boîte ou point invalide (NaN) : infiniment loin
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
  // forme, cap ou disque invalide (NaN, dimension négative) : aucun contact, aucune poussée
  if (!(d2 >= 0) || !(halfX >= 0) || !(halfZ >= 0) || !(radius >= 0) || radius === Infinity) {
    out.x = 0;
    out.z = 0;
    return false;
  }
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
  // « v − v === 0 » n'est vrai que pour un nombre fini : segment, centre ou rayon invalide → pas de contact
  if (!(dx - dx === 0 && dz - dz === 0 && fx - fx === 0 && fz - fz === 0 && r >= 0)) return false;
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
  if (!(t >= 0 && t <= 1)) return false;
  out.t = t;
  // normale = du centre vers le point d'entrée ; rayon nul ou infime : à défaut, l'opposé du segment
  const nx = fx + dx * t;
  const nz = fz + dz * t;
  const nl = Math.sqrt(nx * nx + nz * nz);
  if (nl > 1e-9) {
    out.nx = nx / nl;
    out.nz = nz / nl;
  } else {
    const dl = Math.sqrt(a);
    out.nx = -dx / dl;
    out.nz = -dz / dl;
  }
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
  // « v − v === 0 » n'est vrai que pour un nombre fini : boîte, cap ou segment invalide → pas de contact
  if (!(lax - lax === 0 && laz - laz === 0 && ldx - ldx === 0 && ldz - ldz === 0 && halfX >= 0 && halfZ >= 0)) return false;

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
