/* Suivi d'un véhicule par la caméra : rotation solidaire et recentrage automatique. */

import type { CameraMode, GameContext, Vehicle } from '@/core/contracts';
import { damp, wrapAngle } from './util';

/** Délai sans mouvement de regard avant que la caméra de poursuite ne se recentre (s). */
const RECENTER_DELAY = 1.4;

/**
 * En véhicule, la caméra tourne avec lui : on reporte sa rotation sur PlayerState.camYaw (le
 * contrôleur continue d'y ajouter le mouvement de la souris). En vue extérieure, quand le joueur
 * ne regarde plus autour, la caméra revient doucement derrière le véhicule.
 */
export class VehicleFollow {
  private vehId = 0;
  private heading = 0;
  private idleLook = 0;

  reset(): void {
    this.vehId = 0;
  }

  update(ctx: GameContext, mode: CameraMode, v: Vehicle | null, dt: number, yawFollow: boolean, autoCenter: boolean): void {
    const inVehicle = !!v && (mode === 'vehicle_ext' || mode === 'vehicle_int' || mode === 'turret');
    if (!inVehicle || !v) {
      this.vehId = 0;
      return;
    }
    const ps = ctx.player.state;
    if (this.vehId !== v.id) {
      this.vehId = v.id;
      this.heading = v.heading;
      this.idleLook = 0;
      return;
    }
    const turn = wrapAngle(v.heading - this.heading);
    this.heading = v.heading;
    if (yawFollow && turn !== 0 && Math.abs(turn) < 1) ps.camYaw = wrapAngle(ps.camYaw + turn);
    if (mode !== 'vehicle_ext' || !autoCenter) return;
    const input = ctx.input;
    if (input.lookX !== 0 || input.lookY !== 0) this.idleLook = 0;
    else this.idleLook += dt;
    if (this.idleLook > RECENTER_DELAY && Math.abs(v.speed) > 1.5) {
      // derrière le véhicule en marche avant, devant lui en marche arrière soutenue
      const goal = v.speed < -2 ? v.heading + Math.PI : v.heading;
      const diff = wrapAngle(goal - ps.camYaw);
      const rate = Math.min(1, (this.idleLook - RECENTER_DELAY) * 0.8) * 2.2;
      ps.camYaw = wrapAngle(ps.camYaw + diff * damp(rate, dt));
      ps.camPitch += (0 - ps.camPitch) * damp(rate * 0.6, dt);
    }
  }
}
