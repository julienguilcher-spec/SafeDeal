/* Aides du rig de caméra : hauteurs d'yeux, collision de la caméra avec le décor, repérage des
 * sièges et tourelles. Logique pure (aucun Three.js). */

import type { GameContext, Person, RayHit, Vehicle } from '@/core/contracts';

/** Site maximal de la caméra (rad) : on ne bascule jamais au-delà de la verticale. */
export const PITCH_LIMIT = 1.52;

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Cap (rad) : avant = (sin yaw, cos yaw) dans le plan (x, z). */
  yaw: number;
  /** Site (rad) : positif = vers le haut. */
  pitch: number;
  /** Roulis (rad) : positif = l'horizon penche vers la droite. */
  roll: number;
  /** Champ de vision vertical (degrés) et plan proche (m). */
  fov: number;
  near: number;
}

export function createPose(): CameraPose {
  return { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 60, near: 0.2 };
}

export function copyPose(to: CameraPose, from: CameraPose): void {
  to.x = from.x; to.y = from.y; to.z = from.z;
  to.yaw = from.yaw; to.pitch = from.pitch; to.roll = from.roll;
  to.fov = from.fov; to.near = from.near;
}

/** Hauteur des yeux au-dessus des pieds (m) selon la posture et la taille. */
export function eyeHeight(p: Person): number {
  const h = p.look && p.look.height > 0 ? p.look.height : 1.75;
  switch (p.posture) {
    case 'crouch': return 0.6 * h;
    case 'kneel': return 0.62 * h;
    case 'sit': return 0.48 * h;
    case 'seated': return 0.68 * h;
    case 'prone': return 0.16 * h;
    case 'down': return 0.14 * h;
    default: return 0.93 * h;
  }
}

/** Hauteur du pivot de la caméra d'épaule (m au-dessus des pieds). */
export function shoulderPivotHeight(p: Person): number {
  const h = p.look && p.look.height > 0 ? p.look.height : 1.75;
  switch (p.posture) {
    case 'crouch':
    case 'kneel': return 0.66 * h;
    case 'sit':
    case 'seated': return 0.56 * h;
    case 'prone':
    case 'down': return 0.36 * h;
    default: return 0.9 * h;
  }
}

/** Hauteur des yeux d'une personne assise au-dessus du point de siège (m). */
export function seatedEyeOffset(p: Person | null): number {
  const h = p && p.look && p.look.height > 0 ? p.look.height : 1.75;
  return 0.68 * (h / 1.75);
}

/** Champ de vision vertical (degrés) après application d'un zoom optique. */
export function zoomedFov(baseFovDeg: number, zoom: number): number {
  const z = zoom > 0.05 ? zoom : 1;
  if (z === 1) return baseFovDeg;
  return (2 * Math.atan(Math.tan((baseFovDeg * Math.PI) / 360) / z) * 180) / Math.PI;
}

/** Index du siège occupé par la personne (ou du premier siège conducteur). */
export function seatIndexOf(v: Vehicle, p: Person | null): number {
  const seats = v.def.seats;
  if (p) {
    if (p.seat >= 0 && p.seat < seats.length) return p.seat;
    for (let i = 0; i < v.seats.length; i++) if (v.seats[i] === p.id) return i;
  }
  for (let i = 0; i < seats.length; i++) if (seats[i]!.role === 'driver') return i;
  return seats.length > 0 ? 0 : -1;
}

/** Index de la tourelle servie depuis ce siège : le n-ième siège de tireur sert la n-ième tourelle. */
export function turretIndexOf(v: Vehicle, seat: number): number {
  const n = v.def.turrets.length;
  if (n === 0) return -1;
  let gunners = 0;
  const seats = v.def.seats;
  for (let i = 0; i < seats.length && i < seat; i++) if (seats[i]!.role === 'gunner') gunners++;
  return gunners < n ? gunners : n - 1;
}

export function createRayHit(): RayHit {
  return { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
}

const hit = createRayHit();

/**
 * Collision de la caméra avec le décor : parcourt le segment du pivot (ax, ay, az) vers la position
 * voulue (bx, by, bz) et retourne la fraction 0..1 du segment réellement libre. Un obstacle ne
 * bloque que si la caméra passe plus bas que son sommet (on voit par-dessus une barrière).
 * `withVehicles` : tenir compte des véhicules (désactivé quand on suit son propre véhicule).
 */
export function cameraSweep(
  ctx: GameContext, ax: number, ay: number, az: number, bx: number, by: number, bz: number, withVehicles: boolean,
): number {
  let free = 1;
  const dx = bx - ax;
  const dz = bz - az;
  if (dx * dx + dz * dz < 1e-8) return 1;
  const world = ctx.world;
  hit.hit = false;
  if (world.raycast(ax, az, bx, bz, hit) && hit.hit) free = Math.min(free, blockedAt(ctx, ay, by));
  hit.hit = false;
  if (ctx.props.raycast(ax, az, bx, bz, hit, 'sight') && hit.hit) free = Math.min(free, blockedAt(ctx, ay, by));
  if (withVehicles) {
    hit.hit = false;
    if (ctx.vehicles.raycast(ax, az, bx, bz, hit, 'sight') && hit.hit) free = Math.min(free, blockedAt(ctx, ay, by));
  }
  return free;
}

/** Fraction libre pour l'impact courant : 1 si la caméra passe au-dessus de l'obstacle. */
function blockedAt(ctx: GameContext, ay: number, by: number): number {
  const t = hit.t < 0 ? 0 : hit.t > 1 ? 1 : hit.t;
  const yAt = ay + (by - ay) * t;
  const top = ctx.world.heightAt(hit.x, hit.z) + (hit.height > 0 ? hit.height : 1e6);
  return yAt < top + 0.3 ? t : 1;
}

/** Point exprimé dans le repère du véhicule (x = droite, y = haut, z = avant) → monde, écrit dans la pose. */
export function vehiclePoint(v: Vehicle, lx: number, ly: number, lz: number, out: CameraPose): void {
  const s = Math.sin(v.heading);
  const c = Math.cos(v.heading);
  // avant = (sin h, cos h) ; droite = (-cos h, sin h)
  out.x = v.x + -c * lx + s * lz;
  out.z = v.z + s * lx + c * lz;
  out.y = v.y + ly;
}

/**
 * Orientation à bord : celle du joueur, plus une part du tangage et du roulis du véhicule
 * (hypothèse : tangage positif = nez levé, roulis positif = penché à droite).
 */
export function vehicleTilt(v: Vehicle, yaw: number, pitch: number, out: CameraPose): void {
  const rel = yaw - v.heading;
  const c = Math.cos(rel);
  const s = Math.sin(rel);
  const k = 0.7;
  const p = pitch + (v.pitch * c + v.roll * s) * k;
  out.yaw = yaw;
  out.pitch = p < -PITCH_LIMIT ? -PITCH_LIMIT : p > PITCH_LIMIT ? PITCH_LIMIT : p;
  out.roll = (v.roll * c - v.pitch * s) * k;
}

/** Engin volant piloté : celui du joueur, sinon celui où il a un siège, sinon le drone le plus proche de lui. */
export function findDrone(list: readonly Vehicle[], v: Vehicle | null, p: Person | null): Vehicle | null {
  if (v && v.def.flying) return v;
  let best: Vehicle | null = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (!c.def.flying || c.dormant) continue;
    if (p) {
      for (let s = 0; s < c.seats.length; s++) if (c.seats[s] === p.id) return c;
    }
    const d = p ? (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z) : 0;
    // les drones avant les hélicoptères
    const score = d + (c.kind === 'drone' ? 0 : 1e9);
    if (score < bestD) {
      bestD = score;
      best = c;
    }
  }
  return best;
}
