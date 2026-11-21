/* =====================================================================================
 * Locomotion — saut et enjambement d'un obstacle bas (cmd.jump).
 *
 * Un saut simple dure 0,5 s : la vitesse horizontale est conservée, les collisions restent
 * actives. Si un obstacle bas (≤ 1,15 m : barrière Vauban, banc, poubelle, jardinière, muret)
 * se trouve juste devant et que le point de réception est libre, le saut devient un
 * enjambement : la personne franchit l'obstacle (mobilier ou muret ignoré pendant le vol).
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { LocomotionSystem } from './locomotion';
import type { PersonExtra } from './shared';
import * as T from './tuning';

/** Profondeurs de franchissement essayées au-delà du point de contact (m). */
const LANDING_DEPTHS: readonly number[] = [0.75, 1.3];

export function tryJump(loco: LocomotionSystem, p: Person, e: PersonExtra, mx: number, mz: number): void {
  if (p.posture !== 'stand' || p.stun > 0 || p.carrying !== 0 || p.custody !== 'free') return;
  if (p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead') return;
  if (p.stamina < T.JUMP_STAMINA) return;
  const ctx = loco.ctx;

  // direction : celle du déplacement voulu, sinon de l'élan, sinon du corps
  let dx: number;
  let dz: number;
  const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  const m = Math.sqrt(mx * mx + mz * mz);
  if (m > 0.1) {
    dx = mx / m;
    dz = mz / m;
  } else if (sp > 0.3) {
    dx = p.vx / sp;
    dz = p.vz / sp;
  } else {
    dx = Math.sin(p.heading);
    dz = Math.cos(p.heading);
  }

  // obstacle le plus proche devant : mobilier, décor, véhicule
  const ax = p.x;
  const az = p.z;
  const bx = ax + dx * T.VAULT_REACH;
  const bz = az + dz * T.VAULT_REACH;
  const hit = loco.hit;
  let vault = 0;
  let dist = Infinity;
  let height = 0;
  if (ctx.props.raycast(ax, az, bx, bz, hit, 'move') && hit.hit) {
    dist = hit.t * T.VAULT_REACH;
    height = hit.height;
    vault = 1;
  }
  if (ctx.world.raycast(ax, az, bx, bz, hit) && hit.hit && hit.t * T.VAULT_REACH < dist) {
    dist = hit.t * T.VAULT_REACH;
    height = hit.height;
    vault = hit.kind === 'barrier' ? 2 : 0;
    if (vault === 0) height = Infinity;
  }
  if (ctx.vehicles.raycast(ax, az, bx, bz, hit, 'move') && hit.hit && hit.t * T.VAULT_REACH < dist) {
    vault = 0;
    height = Infinity;
  }
  if (vault !== 0 && !(height > 0.05 && height <= T.VAULT_MAX_HEIGHT)) vault = 0;

  if (vault !== 0) {
    // point de réception libre de l'autre côté ?
    const pos = loco.pos;
    const r = p.radius;
    let travel = 0;
    for (let i = 0; i < LANDING_DEPTHS.length; i++) {
      const d = dist + r + LANDING_DEPTHS[i]!;
      const lx = ax + dx * d;
      const lz = az + dz * d;
      if (!ctx.world.isFree(lx, lz, r)) continue;
      pos.x = lx;
      pos.z = lz;
      if (ctx.props.resolveCircle(pos, r)) continue;
      if (loco.marks.has(lx, lz) && ctx.vehicles.resolveCircle(pos, r)) continue;
      travel = d;
      break;
    }
    if (travel > 0 && p.stamina >= T.VAULT_STAMINA) {
      let v = sp > T.VAULT_MIN_SPEED ? sp : T.VAULT_MIN_SPEED;
      if (v > T.VAULT_MAX_SPEED) v = T.VAULT_MAX_SPEED;
      p.vx = dx * v;
      p.vz = dz * v;
      e.jumpDur = travel / v;
      e.jumpT = e.jumpDur;
      const hgt = height * 0.75;
      e.jumpH = hgt < T.JUMP_HEIGHT ? T.JUMP_HEIGHT : hgt;
      e.vault = vault;
      p.stamina -= T.VAULT_STAMINA;
      return;
    }
  }

  // saut simple
  e.jumpDur = T.JUMP_TIME;
  e.jumpT = T.JUMP_TIME;
  e.jumpH = T.JUMP_HEIGHT;
  e.vault = 0;
  p.stamina -= T.JUMP_STAMINA;
}
