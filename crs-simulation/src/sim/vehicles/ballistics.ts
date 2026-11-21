/* =====================================================================================
 * Balistique des tourelles : grenades en cloche et jets d'eau.
 *
 * Modèle : pesanteur 9,81 m/s² et traînée quadratique facultative (décélération = k·|v relative à
 * l'air|², même forme que le module des objets, dont le coefficient est lu s'il est branché).
 * Sans traînée, les formules sont exactes ; avec traînée, intégration numérique et dichotomie.
 * Aucune allocation.
 * ===================================================================================== */

import type { Vec3 } from '@/core/contracts';
import { GRAVITY } from './api';

const STEP = 0.02;
const MAX_TIME = 14;

/**
 * Intègre la trajectoire d'un projectile jusqu'à l'altitude `groundY` (en descente). Écrit le point de
 * chute dans `out` et retourne le temps de vol (s).
 */
export function simulateShot(
  x: number, y: number, z: number, vx: number, vy: number, vz: number,
  drag: number, windX: number, windZ: number, groundY: number, out: Vec3,
): number {
  if (!(drag > 0)) {
    // parabole : y + vy·t − g·t²/2 = groundY
    const disc = vy * vy + 2 * GRAVITY * (y - groundY);
    const t = disc > 0 ? (vy + Math.sqrt(disc)) / GRAVITY : 0;
    out.x = x + vx * t;
    out.y = groundY;
    out.z = z + vz * t;
    return t;
  }
  let t = 0;
  while (t < MAX_TIME) {
    const rx = vx - windX;
    const rz = vz - windZ;
    const s = Math.sqrt(rx * rx + vy * vy + rz * rz);
    const k = drag * s;
    const nvx = vx - k * rx * STEP;
    const nvy = vy - (k * vy + GRAVITY) * STEP;
    const nvz = vz - k * rz * STEP;
    const nx = x + (vx + nvx) * 0.5 * STEP;
    const ny = y + (vy + nvy) * 0.5 * STEP;
    const nz = z + (vz + nvz) * 0.5 * STEP;
    if (ny <= groundY && nvy < 0) {
      const f = y - ny > 1e-9 ? (y - groundY) / (y - ny) : 1;
      out.x = x + (nx - x) * f;
      out.y = groundY;
      out.z = z + (nz - z) * f;
      return t + STEP * f;
    }
    x = nx;
    y = ny;
    z = nz;
    vx = nvx;
    vy = nvy;
    vz = nvz;
    t += STEP;
  }
  out.x = x;
  out.y = y;
  out.z = z;
  return t;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/** Portée horizontale (m) d'un tir de vitesse et de site donnés, pour une différence d'altitude dy = cible − bouche. */
export function shotRange(speed: number, pitch: number, dy: number, drag: number): number {
  const vh = speed * Math.cos(pitch);
  const vy = speed * Math.sin(pitch);
  simulateShot(0, 0, 0, vh, vy, 0, drag, 0, 0, dy, scratch);
  return scratch.x;
}

/**
 * Site (rad) du tir EN CLOCHE qui porte à la distance horizontale `dist` ; NaN si elle est hors
 * d'atteinte entre `pitchMin` et `pitchMax` (trop loin pour cette charge, ou trop près).
 */
export function solveLob(speed: number, dist: number, dy: number, drag: number, pitchMin: number, pitchMax: number): number {
  // en cloche : au-dessus de l'angle de portée maximale, la portée décroît quand le site augmente
  let lo = pitchMin > 0.76 ? pitchMin : 0.76;
  let hi = pitchMax;
  if (hi <= lo) return NaN;
  if (!(drag > 0)) {
    const v2 = speed * speed;
    const disc = v2 * v2 - GRAVITY * (GRAVITY * dist * dist + 2 * dy * v2);
    if (disc < 0) return NaN;
    const pitch = Math.atan((v2 + Math.sqrt(disc)) / (GRAVITY * dist));
    return pitch >= pitchMin - 1e-6 && pitch <= pitchMax + 1e-6 ? pitch : NaN;
  }
  if (shotRange(speed, lo, dy, drag) < dist || shotRange(speed, hi, dy, drag) > dist) return NaN;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) * 0.5;
    if (shotRange(speed, mid, dy, drag) > dist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** Site (rad) du tir TENDU (arc bas) qui porte à `dist`, sans traînée ; NaN si hors de portée. */
export function solveDirect(speed: number, dist: number, dy: number): number {
  const v2 = speed * speed;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * dist * dist + 2 * dy * v2);
  if (disc < 0 || dist < 1e-6) return NaN;
  return Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * dist));
}

/** Vitesse initiale (m/s) qui porte à `range` sous 45°, à altitude égale, compte tenu de la traînée. */
export function muzzleSpeedFor(range: number, drag: number): number {
  const vacuum = Math.sqrt(GRAVITY * range);
  if (!(drag > 0)) return vacuum;
  let lo = vacuum;
  let hi = vacuum * 4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    if (shotRange(mid, Math.PI / 4, 0, drag) < range) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}
