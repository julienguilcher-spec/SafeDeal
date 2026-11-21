/* =====================================================================================
 * DÉCOR DYNAMIQUE — géométrie des barricades : écart entre deux boîtes orientées, boîte orientée
 * englobant un tas d'objets selon son axe principal. Fonctions pures, sans allocation.
 * ===================================================================================== */

import { distSqPointObb } from '@/core/math';

/** Boîte orientée au sol (les champs utiles d'un objet du décor). */
export interface Box {
  x: number;
  z: number;
  heading: number;
  halfX: number;
  halfZ: number;
}

/** Boîte orientée ajustée sur un tas : centre, cap, demi-dimensions, et son grand axe (ax, az) unitaire. */
export interface FittedBox {
  x: number;
  z: number;
  heading: number;
  halfX: number;
  halfZ: number;
  ax: number;
  az: number;
}

function capsuleToBox(a: Box, b: Box): number {
  const long = a.halfX >= a.halfZ;
  const r = long ? a.halfZ : a.halfX;
  const e = (long ? a.halfX : a.halfZ) - r;
  // grand axe de a dans le monde
  const ux = long ? Math.cos(a.heading) : Math.sin(a.heading);
  const uz = long ? -Math.sin(a.heading) : Math.cos(a.heading);
  let best = distSqPointObb(a.x, a.z, b.x, b.z, b.halfX, b.halfZ, b.heading);
  if (e > 0.05) {
    const d1 = distSqPointObb(a.x + ux * e, a.z + uz * e, b.x, b.z, b.halfX, b.halfZ, b.heading);
    const d2 = distSqPointObb(a.x - ux * e, a.z - uz * e, b.x, b.z, b.halfX, b.halfZ, b.heading);
    if (d1 < best) best = d1;
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best) - r;
  return d > 0 ? d : 0;
}

/**
 * Distance bord à bord approchée de deux boîtes : chacune est vue tour à tour comme une capsule le long
 * de son grand axe (centre et deux extrémités) mesurée contre la boîte exacte de l'autre. Exacte pour deux
 * boîtes côte à côte ou bout à bout ; légèrement surestimée pour deux boîtes en coin.
 */
export function boxGap(a: Box, b: Box): number {
  const d1 = capsuleToBox(a, b);
  const d2 = capsuleToBox(b, a);
  return d1 < d2 ? d1 : d2;
}

/**
 * Boîte orientée englobant les `n` premières boîtes de `boxes`, alignée sur l'axe principal du tas
 * (analyse en composantes principales des coins). Convention du contrat : le demi-grand côté halfX est
 * porté par l'axe local x, de direction monde (cos h, −sin h).
 */
export function fitBox(boxes: readonly Box[], n: number, out: FittedBox): FittedBox {
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += boxes[i]!.x;
    cz += boxes[i]!.z;
  }
  cx /= n;
  cz /= n;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (let i = 0; i < n; i++) {
    const p = boxes[i]!;
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    for (let k = 0; k < 4; k++) {
      const lx = k & 1 ? p.halfX : -p.halfX;
      const lz = k & 2 ? p.halfZ : -p.halfZ;
      const dx = p.x + lx * c + lz * s - cx;
      const dz = p.z - lx * s + lz * c - cz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ax = Math.cos(theta);
  const az = Math.sin(theta);
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = boxes[i]!;
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    for (let k = 0; k < 4; k++) {
      const lx = k & 1 ? p.halfX : -p.halfX;
      const lz = k & 2 ? p.halfZ : -p.halfZ;
      const dx = p.x + lx * c + lz * s - cx;
      const dz = p.z - lx * s + lz * c - cz;
      const u = dx * ax + dz * az;
      const v = -dx * az + dz * ax;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  const uMid = (uMin + uMax) * 0.5;
  const vMid = (vMin + vMax) * 0.5;
  out.x = cx + ax * uMid - az * vMid;
  out.z = cz + az * uMid + ax * vMid;
  out.heading = Math.atan2(-az, ax);
  out.halfX = (uMax - uMin) * 0.5;
  out.halfZ = (vMax - vMin) * 0.5;
  out.ax = ax;
  out.az = az;
  return out;
}
