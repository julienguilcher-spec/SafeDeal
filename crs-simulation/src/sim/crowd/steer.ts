/* =====================================================================================
 * FOULE — conduite à chaque pas : chaque personne pilotée écrit Person.cmd (déplacement voulu, allure,
 * regard) d'après son état. Aucune position n'est jamais écrite : la locomotion fait le reste, avec ses
 * collisions. Boucle chaude : aucune allocation.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { A, S } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import * as T from './tuning';

const REACH2 = T.WAYPOINT_REACH * T.WAYPOINT_REACH;

export class Steering {
  constructor(private readonly core: CrowdCore) {}

  /** Fixe une destination ; l'itinéraire par les rues est demandé si elle est loin ou masquée. */
  goTo(p: Person, b: CrowdBrain, x: number, z: number, speed: number, run: boolean): void {
    const far = Math.hypot(x - b.tx, z - b.tz) > 3;
    b.tx = x;
    b.tz = z;
    b.speed = speed;
    b.run = run;
    if (!far && (b.path !== null || b.pathPending)) return;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > 28 || (d > 6 && !this.core.ctx.world.lineOfSight(p.x, p.z, x, z))) this.core.nav.request(b);
    else b.path = null;
  }

  stop(p: Person, b: CrowdBrain): void {
    const cmd = p.cmd;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
    cmd.faceMove = false;
    if (b.lookX === b.lookX) {
      const dx = b.lookX - p.x;
      const dz = b.lookZ - p.z;
      if (dx * dx + dz * dz > 0.04) cmd.aimYaw = Math.atan2(dx, dz);
    }
  }

  /** Vers un point, à la vitesse voulue. Retourne true une fois arrivé. */
  drive(p: Person, b: CrowdBrain, gx: number, gz: number, speed: number, run: boolean, arrive: number): boolean {
    const dx = gx - p.x;
    const dz = gz - p.z;
    const d2 = dx * dx + dz * dz;
    if (!(d2 > arrive * arrive)) {
      this.stop(p, b);
      return true;
    }
    const d = Math.sqrt(d2);
    let v = speed;
    if (d < 1.5 && v > 0.4 + d * 0.9) v = 0.4 + d * 0.9;
    const cmd = p.cmd;
    let m: number;
    if (run && v > p.speedWalk) {
      if (v > p.speedRun) {
        cmd.gait = 2;
        m = v / p.speedSprint;
      } else {
        cmd.gait = 1;
        m = v / p.speedRun;
      }
    } else {
      cmd.gait = 0;
      m = v / p.speedWalk;
    }
    if (m > 1) m = 1;
    const k = m / d;
    cmd.moveX = dx * k;
    cmd.moveZ = dz * k;
    if (b.state === S.HOLD && b.lookX === b.lookX) {
      // à reculons, face à ce que l'on surveille
      cmd.faceMove = false;
      cmd.aimYaw = Math.atan2(b.lookX - p.x, b.lookZ - p.z);
    } else cmd.faceMove = true;
    return false;
  }

  /** Suit l'itinéraire s'il y en a un, puis va droit au but. */
  private follow(p: Person, b: CrowdBrain, arrive: number): boolean {
    const path = b.path;
    if (path !== null) {
      const i = b.pathI * 2;
      if (i + 1 < path.length) {
        const wx = path[i]!;
        const wz = path[i + 1]!;
        const dx = wx - p.x;
        const dz = wz - p.z;
        const d2 = dx * dx + dz * dz;
        // dernier sommet tout près du but : inutile d'y passer
        if (d2 < REACH2 || (i + 2 >= path.length && (wx - b.tx) * (wx - b.tx) + (wz - b.tz) * (wz - b.tz) < 9)) {
          b.pathI++;
        } else {
          // chacun marche un peu à côté de la ligne idéale : pas de file indienne
          const d = Math.sqrt(d2);
          const sway = b.sway * (d < 6 ? d / 6 : 1);
          this.drive(p, b, wx - (dz / d) * sway, wz + (dx / d) * sway, b.speed, b.run, 0);
          return false;
        }
      } else b.path = null;
    }
    return this.drive(p, b, b.tx, b.tz, b.speed, b.run, arrive);
  }

  /** Tient sa place dans le cortège (rassemblé ou en marche). */
  private slot(p: Person, b: CrowdBrain, loose: boolean): void {
    const core = this.core;
    const f = core.formation;
    if (b.slot < 0 || b.slot >= f.slotCount) {
      this.stop(p, b);
      return;
    }
    const s = core.slot;
    f.sample(b.slot, s);
    const ex = s.x - p.x;
    const ez = s.z - p.z;
    const d2 = ex * ex + ez * ez;
    const moving = s.v > 0.05;
    const cmd = p.cmd;
    if (!moving && d2 < (loose ? 1.4 : 0.2)) {
      cmd.moveX = 0;
      cmd.moveZ = 0;
      cmd.gait = 0;
      cmd.faceMove = false;
      if (b.lookX === b.lookX) cmd.aimYaw = Math.atan2(b.lookX - p.x, b.lookZ - p.z);
      else cmd.aimYaw = Math.atan2(s.tx, s.tz);
      return;
    }
    let vx = s.tx * s.v + ex * T.SLOT_GAIN;
    let vz = s.tz * s.v + ez * T.SLOT_GAIN;
    let sp = Math.sqrt(vx * vx + vz * vz);
    // loin derrière : on trottine pour recoller
    const far = d2 > 150;
    const max = far ? T.RUN_CATCHUP : T.WALK_MAX * b.pace * (1 - 0.2 * b.fatigue);
    if (sp > max) {
      const k = max / sp;
      vx *= k;
      vz *= k;
      sp = max;
    }
    if (sp < 0.06) {
      cmd.moveX = 0;
      cmd.moveZ = 0;
      return;
    }
    let base = p.speedWalk;
    cmd.gait = 0;
    if (sp > base) {
      base = p.speedRun;
      cmd.gait = 1;
    }
    let m = 1 / base;
    if (sp * m > 1) m = 1 / sp;
    cmd.moveX = vx * m;
    cmd.moveZ = vz * m;
    cmd.faceMove = true;
  }

  step(p: Person, b: CrowdBrain, dt: number): void {
    if (p.custody !== 'free' || p.heldBy !== 0 || p.vehicleId !== 0 || p.posture === 'down') return;
    if (b.act !== A.NONE) p.upperT += dt;
    switch (b.state) {
      case S.MARCH:
        this.slot(p, b, false);
        break;
      case S.GATHER:
        this.slot(p, b, true);
        break;
      case S.SIT: {
        const cmd = p.cmd;
        cmd.moveX = 0;
        cmd.moveZ = 0;
        cmd.faceMove = false;
        if (p.posture === 'stand' && p.vx * p.vx + p.vz * p.vz < 0.04) p.posture = 'sit';
        break;
      }
      case S.CUSTOM: {
        const c = b.controller;
        if (c !== null && c.steer !== undefined) c.steer(p, b, this.core.api, dt);
        else this.follow(p, b, 0.6);
        break;
      }
      case S.WATCH:
      case S.BYSTAND:
      case S.LINGER:
      case S.REGROUP:
        this.follow(p, b, 0.9);
        break;
      case S.STRANDED:
        this.follow(p, b, 1.6);
        break;
      default:
        this.follow(p, b, 0.5);
        break;
    }
  }
}
