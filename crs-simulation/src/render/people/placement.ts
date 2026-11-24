/* Placement des personnes dont la position affichée ne vient pas de leur propre cinématique : occupants
 * d'un véhicule (assis sur leur siège, cap et assiette du véhicule) et personnes portées ou traînées. */

import type { GameContext, Person } from '@/core/contracts';
import { REF_HEIGHT } from './skeleton';
import { POSTURE_DOWN, POSTURE_SEATED, U_CARRIED, U_CARRY_PERSON, U_DRAG, U_DRAGGED, U_DRIVE, U_RIDE, upperId } from './poseparams';

/** Hauteur d'assise de la posture « assis en véhicule » au-dessus de la racine (échelle 1). */
const SEAT_HEIGHT = 0.45;

/** Résultat réutilisé (aucune allocation par image). */
export class Placement {
  x = 0; y = 0; z = 0; heading = 0;
  pitch = 0; roll = 0; steer = 0;
  /** Animation et posture imposées (-1 = celles de la personne). */
  upper = -1; posture = -1;
  /** La racine est imposée : pas de marche déduite du déplacement. */
  attached = false;
  /** Pas d'ombre de contact (dans un véhicule, sur les épaules de quelqu'un). */
  noBlob = false;

  /**
   * Convention de siège (SeatDef) : x vers la droite du véhicule, y vers le haut, z vers l'avant ; seat.y est
   * la hauteur de l'assise. Assiette : Vehicle.pitch > 0 = nez levé, Vehicle.roll > 0 = penché à droite.
   */
  resolve(ctx: GameContext, p: Person): void {
    this.x = p.x; this.y = p.y; this.z = p.z; this.heading = p.heading;
    this.pitch = 0; this.roll = 0; this.steer = 0;
    this.upper = -1; this.posture = -1; this.attached = false; this.noBlob = false;
    if (p.vehicleId !== 0) {
      const v = ctx.vehicles.get(p.vehicleId);
      if (!v) return;
      const seat = p.seat >= 0 ? v.def.seats[p.seat] : undefined;
      const h = v.heading, sh = Math.sin(h), ch = Math.cos(h);
      const s = p.look.height / REF_HEIGHT;
      if (seat) {
        this.x = v.x + sh * seat.z - ch * seat.x;
        this.z = v.z + ch * seat.z + sh * seat.x;
        this.y = v.y + seat.y - SEAT_HEIGHT * s;
        if (seat.role === 'driver') {
          const ms = v.def.maxSteer > 0 ? v.steerAngle / v.def.maxSteer : 0;
          this.steer = ms > 1 ? 1 : ms < -1 ? -1 : ms;
        }
      } else {
        this.x = v.x; this.z = v.z; this.y = v.y + 0.5 - SEAT_HEIGHT * s;
      }
      this.heading = h;
      this.pitch = -v.pitch;
      this.roll = v.roll;
      this.posture = POSTURE_SEATED;
      const moto = v.kind.indexOf('moto') >= 0 || v.kind === 'scooter' || v.kind === 'velo';
      if (moto) this.upper = U_RIDE;
      else if (seat && seat.role === 'driver') this.upper = U_DRIVE;
      this.attached = true;
      this.noBlob = true;
    } else if (p.heldBy !== 0) {
      const holder = ctx.people.get(p.heldBy);
      if (!holder || holder.carrying !== p.id) return;
      const hu = upperId(holder.upper);
      if (hu === U_CARRY_PERSON) {
        // portée sur l'épaule : la racine est celle du porteur
        this.x = holder.x; this.y = holder.y; this.z = holder.z; this.heading = holder.heading;
        this.upper = U_CARRIED;
        this.attached = true;
        this.noBlob = true;
      } else if (hu === U_DRAG) {
        // traînée : allongée sur le dos, la tête vers celui qui tire
        const dx = p.x - holder.x, dz = p.z - holder.z;
        if (dx * dx + dz * dz > 1e-4) this.heading = Math.atan2(dx, dz);
        this.upper = U_DRAGGED;
        this.posture = POSTURE_DOWN;
      }
    }
  }
}
