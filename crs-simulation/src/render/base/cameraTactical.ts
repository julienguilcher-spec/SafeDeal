/* Vue tactique du rig de caméra : point du sol visé, altitude, déplacement. */

import type { TacticalView } from './api';

/** Inclinaison de la vue (quasi verticale) et hauteur de la caméra pour un zoom de 1. */
export const TACTICAL_PITCH = -1.36;
export const TACTICAL_HEIGHT = 150;

export class Tactical implements TacticalView {
  x = 0;
  z = 0;
  height = TACTICAL_HEIGHT;
  zoom = 1;
  inputPan = true;
  /** Position lissée réellement affichée. */
  sx = 0;
  sz = 0;
  sh = TACTICAL_HEIGHT;
  fresh = true;

  setCenter(x: number, z: number): void {
    if (Number.isFinite(x) && Number.isFinite(z)) {
      this.x = x;
      this.z = z;
    }
  }

  pan(dx: number, dz: number): void {
    if (Number.isFinite(dx) && Number.isFinite(dz)) {
      this.x += dx;
      this.z += dz;
    }
  }
}
