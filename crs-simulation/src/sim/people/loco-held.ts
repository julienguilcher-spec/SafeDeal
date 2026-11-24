/* =====================================================================================
 * Locomotion — personnes dont la position dépend de quelqu'un ou de quelque chose d'autre :
 * occupants d'un véhicule (recalés sur leur siège) et personnes tenues (portées sur l'épaule,
 * traînées au sol, ou escortées par un lien posé par un autre module — interpellation).
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import { turnToward } from '@/core/math';
import type { LocomotionSystem } from './locomotion';
import { HOLD_DRAG, HOLD_OTHER, HOLD_SHOULDER } from './shared';
import * as T from './tuning';

/** Occupant d'un véhicule : position du siège dans le monde (même convention que SeatDef). */
export function syncSeat(ctx: GameContext, p: Person): void {
  const v = ctx.vehicles.get(p.vehicleId);
  if (!v) {
    // véhicule disparu sans avoir fait descendre ses occupants : la personne est libérée sur place
    ctx.vehicles.exit(p);
    if (p.vehicleId !== 0) {
      p.vehicleId = 0;
      p.seat = -1;
    }
    if (p.posture === 'seated') p.posture = 'stand';
    return;
  }
  const seat = p.seat >= 0 ? v.def.seats[p.seat] : undefined;
  if (seat) {
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    p.x = v.x + sh * seat.z - ch * seat.x;
    p.z = v.z + ch * seat.z + sh * seat.x;
  } else {
    p.x = v.x;
    p.z = v.z;
  }
  p.y = v.y;
  p.vx = v.vx;
  p.vz = v.vz;
  p.heading = v.heading;
}

/** Personne tenue : elle suit son porteur, qui vient d'être déplacé. */
export function followHolder(loco: LocomotionSystem, h: Person, dt: number): void {
  const ctx = loco.ctx;
  const he = loco.shared.of(h);
  const holder = ctx.people.get(h.heldBy);
  if (!holder || holder.carrying !== h.id) {
    // lien rompu (porteur disparu, ou qui tient autre chose) : la personne est rendue à elle-même
    h.heldBy = 0;
    he.holdMode = HOLD_OTHER;
    h.vx = 0;
    h.vz = 0;
    return;
  }
  if (holder.dormant) return;
  if (holder.vehicleId !== 0) {
    h.x = holder.x;
    h.z = holder.z;
    h.y = holder.y;
    h.vx = holder.vx;
    h.vz = holder.vz;
    return;
  }
  const mode = he.holdMode;

  if (mode === HOLD_SHOULDER) {
    // sur l'épaule : même racine que le porteur (le rendu place le corps)
    h.x = holder.x;
    h.z = holder.z;
    h.y = holder.y;
    h.heading = holder.heading;
    h.vx = holder.vx;
    h.vz = holder.vz;
    if (holder.upper !== 'carry_person') {
      holder.upper = 'carry_person';
      holder.upperT = 0;
    } else {
      holder.upperT += dt;
    }
    return;
  }

  const down = h.posture === 'down';
  if (mode === HOLD_DRAG || down) {
    // traînée : le corps suit comme une remorque, à bout de bras
    let dx = h.x - holder.x;
    let dz = h.z - holder.z;
    let d = Math.sqrt(dx * dx + dz * dz);
    if (!(d > 1e-4)) {
      dx = -Math.sin(holder.heading);
      dz = -Math.cos(holder.heading);
      d = 1;
    }
    if (mode === HOLD_DRAG || d > T.DRAG_DISTANCE) {
      const k = T.DRAG_DISTANCE / d;
      h.vx = holder.vx;
      h.vz = holder.vz;
      loco.pos.x = holder.x + dx * k;
      loco.pos.z = holder.z + dz * k;
      loco.collide(h, he);
      h.y = ctx.world.heightAt(h.x, h.z);
      h.heading = Math.atan2(h.x - holder.x, h.z - holder.z);
    } else {
      h.vx = 0;
      h.vz = 0;
    }
    if (mode === HOLD_DRAG) {
      if (holder.upper !== 'drag') {
        holder.upper = 'drag';
        holder.upperT = 0;
      } else {
        holder.upperT += dt;
      }
    }
    return;
  }

  // escorte : la personne marche juste devant son gardien, tenue par le bras
  const sh = Math.sin(holder.heading);
  const ch = Math.cos(holder.heading);
  const tx = holder.x + sh * T.ESCORT_AHEAD - ch * T.ESCORT_SIDE;
  const tz = holder.z + ch * T.ESCORT_AHEAD + sh * T.ESCORT_SIDE;
  const dx = tx - h.x;
  const dz = tz - h.z;
  const d2 = dx * dx + dz * dz;
  let nx = tx;
  let nz = tz;
  if (d2 <= 9) {
    // rattrapage amorti ; au-delà de 3 m (lien posé de loin), la personne est amenée directement
    const k = 1 - Math.exp(-14 * dt);
    nx = h.x + dx * k;
    nz = h.z + dz * k;
  }
  h.vx = holder.vx;
  h.vz = holder.vz;
  loco.pos.x = nx;
  loco.pos.z = nz;
  loco.collide(h, he);
  h.y = ctx.world.heightAt(h.x, h.z);
  h.heading = turnToward(h.heading, holder.heading, 8 * dt);
}
