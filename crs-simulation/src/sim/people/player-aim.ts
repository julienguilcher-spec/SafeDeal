/* =====================================================================================
 * Joueur — visée : personne sous le réticule (tolérance angulaire, ligne de vue) et point visé
 * au sol. Le rayon part des yeux du personnage, dans la direction de la caméra.
 * ===================================================================================== */

import type { GameContext, Person, PlayerState, RayHit } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import * as T from './tuning';

const KEEP = 3;

export class AimProbe {
  private readonly near: Person[] = [];
  private readonly hit: RayHit = makeRayHit();
  private readonly best: (Person | null)[] = [null, null, null];
  private readonly score = new Float64Array(KEEP);

  constructor(private readonly ctx: GameContext) {}

  /** Hauteur des yeux au-dessus des pieds. */
  eyeHeight(p: Person): number {
    return p.look.height * (p.posture === 'crouch' || p.posture === 'kneel' || p.posture === 'sit' ? T.EYE_CROUCH : T.EYE_STAND);
  }

  /**
   * Met à jour aimedPersonId et aimX/aimZ. (ox, oy, oz) : origine du rayon ; yaw/pitch : direction ;
   * `self` : personne à ignorer ; `wide` : tolérance verticale élargie (caméra à la troisième personne).
   */
  update(st: PlayerState, self: Person, ox: number, oy: number, oz: number, yaw: number, pitch: number, wide: boolean): void {
    const ctx = this.ctx;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const tanP = Math.tan(pitch);

    // ── point visé au sol ──
    const groundY = ctx.world.heightAt(self.x, self.z);
    const eyeAbove = oy - groundY;
    let reach = T.AIM_GROUND_RANGE;
    if (tanP < -0.005 && eyeAbove > 0) {
      const d = eyeAbove / -tanP;
      if (d < reach) reach = d;
    }
    let ax = ox + fx * reach;
    let az = oz + fz * reach;
    const hit = this.hit;
    let wall = reach;
    if (ctx.world.raycast(ox, oz, ax, az, hit) && hit.hit) {
      wall = hit.t * reach;
      ax = hit.x;
      az = hit.z;
    }

    // ── personne sous le réticule ──
    let tol = T.AIM_TOLERANCE;
    if (ctx.input.device === 'gamepad' && ctx.settings.values.aimAssist) tol *= 2;
    const tolV = wide ? 0.14 : 0.03;
    const range = T.AIM_RANGE < wall + 0.5 ? T.AIM_RANGE : wall + 0.5;
    const n = ctx.people.queryRadius(ox, oz, range, this.near);
    const best = this.best;
    const score = this.score;
    best[0] = best[1] = best[2] = null;
    score[0] = score[1] = score[2] = Infinity;
    for (let i = 0; i < n; i++) {
      const t = this.near[i]!;
      if (t === self || t.heldBy === self.id) continue;
      const dx = t.x - ox;
      const dz = t.z - oz;
      const fwd = dx * fx + dz * fz;
      if (fwd < 0.3) continue;
      const side = dx * fz - dz * fx;
      const perp = side < 0 ? -side : side;
      if (perp > t.radius + 0.12 + fwd * tol) continue;
      // hauteur du rayon à cette distance, comparée à la silhouette
      const rayY = oy + tanP * fwd;
      const top = t.y + (t.posture === 'down' || t.posture === 'prone' ? 0.45 : t.posture === 'stand' ? t.look.height : t.look.height * 0.7);
      const slack = 0.12 + fwd * tolV;
      if (rayY < t.y - slack || rayY > top + slack) continue;
      const s = perp + fwd * 0.012;
      // insertion parmi les trois meilleurs candidats
      for (let k = 0; k < KEEP; k++) {
        if (s < score[k]!) {
          for (let m = KEEP - 1; m > k; m--) {
            score[m] = score[m - 1]!;
            best[m] = best[m - 1]!;
          }
          score[k] = s;
          best[k] = t;
          break;
        }
      }
    }
    let aimed: Person | null = null;
    for (let k = 0; k < KEEP && !aimed; k++) {
      const t = best[k];
      if (!t) break;
      if (this.visible(self, ox, oz, t)) aimed = t;
    }
    best[0] = best[1] = best[2] = null;

    if (aimed) {
      st.aimedPersonId = aimed.id;
      st.aimX = aimed.x;
      st.aimZ = aimed.z;
    } else {
      st.aimedPersonId = 0;
      st.aimX = ax;
      st.aimZ = az;
    }
  }

  /** Ligne de vue dégagée : ni mur, ni mobilier opaque, ni véhicule, ni fumée épaisse. */
  private visible(self: Person, ox: number, oz: number, t: Person): boolean {
    const ctx = this.ctx;
    if (!ctx.world.lineOfSight(ox, oz, t.x, t.z)) return false;
    const hit = this.hit;
    if (ctx.props.raycast(ox, oz, t.x, t.z, hit, 'sight') && hit.hit && hit.t < 0.97) return false;
    if (self.vehicleId === 0 && t.vehicleId === 0 && ctx.vehicles.raycast(ox, oz, t.x, t.z, hit, 'sight') && hit.hit && hit.t < 0.97) return false;
    return ctx.hazards.visibility(ox, oz, t.x, t.z) > 0.25;
  }
}
