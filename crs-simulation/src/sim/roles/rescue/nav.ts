/* =====================================================================================
 * DÉPLACEMENT À PIED d'un secouriste ou d'un médecin de rue : il écrit person.cmd, comme le joueur.
 *
 *   - but proche et en vue directe : ligne droite ;
 *   - sinon itinéraire par les rues (ctx.world.findPath, mode 'foot'), suivi point par point en coupant
 *     dès que le point suivant est en vue ;
 *   - un véhicule ou un objet en travers de sa route est contourné en longeant son flanc, toujours du même
 *     côté tant que l'obstacle est là (pas d'hésitation devant un engin à contourner) ;
 *   - s'il piétine quand même (foule, recoin), il fait un pas de côté puis recalcule.
 * Aucune allocation en régime établi : le tableau de l'itinéraire est réutilisé.
 * ===================================================================================== */

import type { GameContext, Person, RayHit } from '@/core/contracts';

/** Portée à laquelle un but ou un point de passage « en vue » est rejoint en ligne droite (m). */
const SIGHT_RANGE = 70;
const WAYPOINT_REACH = 1.6;
/** Distance à laquelle on regarde devant soi pour contourner un véhicule ou un objet (m). */
const LOOK_AHEAD = 2.4;
/** Demi-largeur du couloir sondé devant soi : un obstacle frôlé de l'épaule est contourné lui aussi (m). */
const SHOULDER = 0.42;
const hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

/** La voie est-elle libre de tout mur entre deux points ? */
export function clearLine(ctx: GameContext, ax: number, az: number, bx: number, bz: number): boolean {
  return !ctx.world.raycast(ax, az, bx, bz, hit) || hit.t >= 0.985;
}

export class Walker {
  private readonly path: number[] = [];
  private count = 0;
  private idx = 0;
  private gx = 0;
  private gz = 0;
  active = false;
  private direct = true;
  private arriveDist = 0.7;
  private checkAt = 0;
  private lastX = 0;
  private lastZ = 0;
  private stuck = 0;
  private sideUntil = 0;
  private side = 1;
  private shortcutAt = 0;
  // contournement d'un véhicule ou d'un objet
  private avoidAt = 0;
  private avoiding = false;
  private avoidX = 0;
  private avoidZ = 0;
  private avoidSide = 1;
  private avoidKeep = 0;

  /** Fixe le but. Ne recalcule l'itinéraire que si le but a bougé de plus de 1,5 m. */
  goTo(ctx: GameContext, p: Person, x: number, z: number, arriveDist = 0.7): void {
    this.arriveDist = arriveDist;
    if (this.active) {
      const dx = x - this.gx;
      const dz = z - this.gz;
      if (dx * dx + dz * dz < 2.25) {
        this.gx = x;
        this.gz = z;
        if (this.count >= 2) {
          this.path[this.count * 2 - 2] = x;
          this.path[this.count * 2 - 1] = z;
        }
        return;
      }
    }
    this.gx = x;
    this.gz = z;
    this.active = true;
    this.stuck = 0;
    this.avoiding = false;
    this.plan(ctx, p);
  }

  private plan(ctx: GameContext, p: Person): void {
    const dx = this.gx - p.x;
    const dz = this.gz - p.z;
    this.idx = 0;
    this.count = 0;
    this.direct = true;
    if (dx * dx + dz * dz <= SIGHT_RANGE * SIGHT_RANGE && clearLine(ctx, p.x, p.z, this.gx, this.gz)) return;
    if (ctx.world.findPath(p.x, p.z, this.gx, this.gz, 'foot', this.path) && this.path.length >= 4) {
      this.count = this.path.length >> 1;
      this.idx = 1; // le premier point est le départ
      this.direct = false;
      this.smooth(ctx, p);
    }
  }

  /**
   * Coupe au plus court : droit au but s'il est en vue, sinon vers le plus lointain des prochains points
   * de passage en vue (on ne revient pas en arrière chercher le premier nœud de l'itinéraire).
   */
  private smooth(ctx: GameContext, p: Person): void {
    const gdx = this.gx - p.x;
    const gdz = this.gz - p.z;
    if (gdx * gdx + gdz * gdz <= SIGHT_RANGE * SIGHT_RANGE && clearLine(ctx, p.x, p.z, this.gx, this.gz)) {
      this.direct = true;
      return;
    }
    const last = this.idx + 3 < this.count - 1 ? this.idx + 3 : this.count - 1;
    for (let i = last; i > this.idx; i--) {
      const nx = this.path[i * 2];
      const nz = this.path[i * 2 + 1];
      const ndx = nx - p.x;
      const ndz = nz - p.z;
      if (ndx * ndx + ndz * ndz < SIGHT_RANGE * SIGHT_RANGE && clearLine(ctx, p.x, p.z, nx, nz)) {
        this.idx = i;
        return;
      }
    }
  }

  /** Un véhicule ou un objet barre-t-il le couloir devant soi ? Le résultat est dans `hit`. */
  private blockedAhead(ctx: GameContext, p: Person, dx: number, dz: number, ahead: number): boolean {
    for (let k = 0; k < 3; k++) {
      // au centre, puis à hauteur de chaque épaule
      const off = k === 0 ? 0 : k === 1 ? SHOULDER : -SHOULDER;
      const sx = p.x - dz * off;
      const sz = p.z + dx * off;
      const ax = sx + dx * LOOK_AHEAD;
      const az = sz + dz * LOOK_AHEAD;
      if ((ctx.vehicles.raycast(sx, sz, ax, az, hit, 'move') || ctx.props.raycast(sx, sz, ax, az, hit, 'move')) && hit.t < ahead && hit.id !== p.carrying) {
        return true;
      }
    }
    return false;
  }

  stop(p: Person): void {
    this.active = false;
    if (p.isPlayer) return;
    p.cmd.moveX = 0;
    p.cmd.moveZ = 0;
  }

  /** Distance restante à vol d'oiseau jusqu'au but. */
  remaining(p: Person): number {
    return this.active ? Math.hypot(this.gx - p.x, this.gz - p.z) : 0;
  }

  /**
   * Avance d'un pas : écrit la commande de déplacement. Retourne true quand le but est atteint
   * (la commande est alors remise à zéro).
   */
  step(ctx: GameContext, p: Person, gait: 0 | 1 | 2): boolean {
    if (!this.active || p.isPlayer) return !this.active;
    const now = ctx.clock.now;
    const cmd = p.cmd;
    const gdx = this.gx - p.x;
    const gdz = this.gz - p.z;
    const gd2 = gdx * gdx + gdz * gdz;
    if (gd2 <= this.arriveDist * this.arriveDist) {
      this.active = false;
      cmd.moveX = 0;
      cmd.moveZ = 0;
      return true;
    }
    let tx = this.gx;
    let tz = this.gz;
    if (!this.direct) {
      // point de passage courant ; on passe au suivant dès qu'il est atteint, ou en vue directe
      while (this.idx < this.count - 1) {
        const wx = this.path[this.idx * 2];
        const wz = this.path[this.idx * 2 + 1];
        const dx = wx - p.x;
        const dz = wz - p.z;
        if (dx * dx + dz * dz > WAYPOINT_REACH * WAYPOINT_REACH) break;
        this.idx++;
      }
      if (now >= this.shortcutAt) {
        this.shortcutAt = now + 0.5;
        this.smooth(ctx, p);
      }
      if (this.direct || this.idx >= this.count - 1) {
        // dernier tronçon : droit au but s'il est en vue, sinon le dernier point de la rue
        this.idx = this.count - 1;
      } else {
        tx = this.path[this.idx * 2];
        tz = this.path[this.idx * 2 + 1];
      }
    }
    let dx = tx - p.x;
    let dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-4) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 0;
    }
    // piétinement : un pas de côté, puis nouvel itinéraire
    if (now >= this.checkAt) {
      this.checkAt = now + 1;
      const mx = p.x - this.lastX;
      const mz = p.z - this.lastZ;
      this.lastX = p.x;
      this.lastZ = p.z;
      if (mx * mx + mz * mz < 0.09 && p.posture === 'stand') {
        this.stuck++;
        if (this.stuck >= 2) {
          this.side = -this.side;
          this.sideUntil = now + 0.9;
          if (this.stuck >= 4) {
            this.stuck = 0;
            this.plan(ctx, p);
          }
        }
      } else {
        this.stuck = 0;
      }
    }
    // véhicule ou objet droit devant : on longe son flanc (relevé toutes les 0,15 s)
    if (now >= this.avoidAt && (dx !== 0 || dz !== 0)) {
      this.avoidAt = now + 0.15;
      const ahead = d < LOOK_AHEAD ? d / LOOK_AHEAD : 1;
      this.avoiding = false;
      if (this.blockedAhead(ctx, p, dx, dz, ahead)) {
        let tx2 = -hit.nz;
        let tz2 = hit.nx;
        if (now >= this.avoidKeep) this.avoidSide = tx2 * dx + tz2 * dz >= 0 ? 1 : -1;
        this.avoidKeep = now + 2;
        if (this.avoidSide < 0) {
          tx2 = -tx2;
          tz2 = -tz2;
        }
        // le long du flanc, en s'en écartant un peu
        let vx = tx2 + hit.nx * 0.3;
        let vz = tz2 + hit.nz * 0.3;
        const vl = Math.sqrt(vx * vx + vz * vz) || 1;
        vx /= vl;
        vz /= vl;
        this.avoidX = vx;
        this.avoidZ = vz;
        this.avoiding = true;
      }
    }
    if (this.avoiding) {
      dx = this.avoidX;
      dz = this.avoidZ;
    } else if (now < this.sideUntil) {
      const sx = -dz * this.side;
      const sz = dx * this.side;
      dx = dx * 0.35 + sx * 0.94;
      dz = dz * 0.35 + sz * 0.94;
    }
    cmd.moveX = dx;
    cmd.moveZ = dz;
    // on ralentit à l'approche pour s'arrêter juste
    cmd.gait = gd2 < 9 && gait > 0 ? 0 : gait;
    cmd.faceMove = true;
    if (dx !== 0 || dz !== 0) cmd.aimYaw = Math.atan2(dx, dz);
    cmd.aimPitch = 0;
    return false;
  }
}

/** Arrête net une personne et la tourne vers un point. */
export function holdFacing(p: Person, x: number, z: number): void {
  if (p.isPlayer) return;
  const cmd = p.cmd;
  cmd.moveX = 0;
  cmd.moveZ = 0;
  const dx = x - p.x;
  const dz = z - p.z;
  if (dx * dx + dz * dz > 0.01) cmd.aimYaw = Math.atan2(dx, dz);
  cmd.faceMove = false;
}
