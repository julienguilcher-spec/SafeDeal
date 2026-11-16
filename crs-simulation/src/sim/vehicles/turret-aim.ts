/* =====================================================================================
 * Visée des tourelles : géométrie (pivot, bouche du tube, sortie de lance), balistique des
 * grenades (charge, tir en cloche, dérive au vent) et des jets, prévision du point de chute.
 *
 * Gisement d'une tourelle : positif vers la DROITE du véhicule ; cap monde = heading − turretYaw.
 * ===================================================================================== */

import type { TurretDef, Vec3 } from '@/core/contracts';
import { clamp, wrapAngle } from '@/core/math';
import { ITEMS_SERVICE } from './api';
import type { LauncherSpec } from './api';
import { muzzleSpeedFor, simulateShot, solveDirect, solveLob } from './ballistics';
import { jetReach, jetSpeed } from './jet';
import type { VehicleKernel, VehicleRt } from './runtime';

const TWO_PI = Math.PI * 2;
/** Géométrie des armes, alignée sur le modèle affiché : tourillon et berceau du lance-grenades, lance du canon (m). */
export const LAUNCHER_TRUNNION = 0.42;
export const LAUNCHER_REACH = 0.36;
export const NOZZLE_REACH = 1.02;

/** Forme minimale du service des objets dont on lit le coefficient de traînée des projectiles. */
interface ItemsLike {
  projectileSpec?(kind: string): { drag?: number } | undefined;
}

/** Une tourelle fait-elle un tour complet ? */
export function freeYaw(def: TurretDef): boolean {
  return def.yawMax - def.yawMin >= TWO_PI - 0.01;
}

export class TurretAim {
  readonly muzzle: Vec3 = { x: 0, y: 0, z: 0 };
  readonly landing: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly speeds = new Map<LauncherSpec, number[]>();
  private dragKnown = false;
  private drag = 0;

  constructor(private readonly k: VehicleKernel) {}

  reset(): void {
    this.speeds.clear();
    this.dragKnown = false;
  }

  /** Position monde de la tourelle (pivot de l'arme ou de la caméra). */
  pivot(rt: VehicleRt, i: number, out: Vec3): void {
    const v = rt.v;
    const d = v.def.turrets[i]!;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    out.x = v.x - cs * d.x + sn * d.z;
    out.z = v.z + sn * d.x + cs * d.z;
    out.y = v.y + d.y + rt.turrets[i]!.mast * rt.spec.mast;
  }

  /** Sortie de la lance d'un canon à eau (monde), pour une orientation monde donnée. */
  nozzle(rt: VehicleRt, i: number, yaw: number, pitch: number, out: Vec3): void {
    this.pivot(rt, i, out);
    const ch = Math.cos(pitch);
    out.x += Math.sin(yaw) * ch * NOZZLE_REACH;
    out.y += Math.sin(pitch) * NOZZLE_REACH;
    out.z += Math.cos(yaw) * ch * NOZZLE_REACH;
  }

  /** Coefficient de traînée des grenades, lu auprès du module des objets s'il est branché (0 sinon). */
  projectileDrag(kind: string): number {
    if (!this.dragKnown) {
      this.dragKnown = true;
      const items = this.k.ctx.service<ItemsLike>(ITEMS_SERVICE);
      let drag = 0;
      try {
        const spec = items && items.projectileSpec ? items.projectileSpec(kind) : undefined;
        if (spec && typeof spec.drag === 'number' && spec.drag > 0 && spec.drag < 0.1) drag = spec.drag;
      } catch {
        drag = 0;
      }
      this.drag = drag;
      this.speeds.clear();
    }
    return this.drag;
  }

  /** Vitesses initiales des dispositifs de propulsion (une par portée nominale). */
  muzzleSpeeds(L: LauncherSpec, drag: number): number[] {
    let list = this.speeds.get(L);
    if (!list) {
      list = [];
      for (let i = 0; i < L.ranges.length; i++) list.push(muzzleSpeedFor(L.ranges[i]!, drag));
      this.speeds.set(L, list);
    }
    return list;
  }

  /** Calcule l'orientation qui atteint le point désigné ; renseigne wantYaw, wantPitch, inRange (et la charge). */
  solve(rt: VehicleRt, i: number): void {
    const v = rt.v;
    const def = v.def.turrets[i]!;
    const t = rt.turrets[i]!;
    const m = this.muzzle;
    this.pivot(rt, i, m);
    if (def.kind === 'lance_grenades') m.y += LAUNCHER_TRUNNION;
    let dx = t.tx - m.x;
    let dz = t.tz - m.z;
    let dist = Math.sqrt(dx * dx + dz * dz);
    const dy = t.ty - m.y;
    let yawWorld = Math.atan2(dx, dz);
    let pitch: number;
    let ok = true;
    if (def.kind === 'lance_grenades') {
      const L = rt.spec.launchers[i]!;
      const drag = this.projectileDrag(L.projectile);
      const speeds = this.muzzleSpeeds(L, drag);
      const env = this.k.ctx.env.state;
      pitch = NaN;
      for (let pass = 0; pass < 2; pass++) {
        pitch = NaN;
        for (let c = 0; c < speeds.length; c++) {
          pitch = solveLob(speeds[c]!, dist, dy, drag, def.pitchMin, def.pitchMax);
          if (pitch === pitch) {
            t.muzzle = speeds[c]!;
            break;
          }
        }
        // dérive due au vent (seulement si les grenades ont de la traînée) : on vise au vent
        if (pitch !== pitch || pass === 1 || !(drag > 0) || (env.windX === 0 && env.windZ === 0)) break;
        const ch = Math.cos(pitch);
        simulateShot(
          m.x, m.y, m.z, Math.sin(yawWorld) * ch * t.muzzle, Math.sin(pitch) * t.muzzle, Math.cos(yawWorld) * ch * t.muzzle,
          drag, env.windX, env.windZ, t.ty, this.landing,
        );
        dx = t.tx - (this.landing.x - t.tx) - m.x;
        dz = t.tz - (this.landing.z - t.tz) - m.z;
        dist = Math.sqrt(dx * dx + dz * dz);
        yawWorld = Math.atan2(dx, dz);
      }
      if (pitch !== pitch) {
        // hors d'atteinte : charge la plus forte à 45° si c'est trop loin, la plus faible au site maximal si c'est trop près
        ok = false;
        const far = dist > L.ranges[0]! * 0.5;
        t.muzzle = far ? speeds[speeds.length - 1]! : speeds[0]!;
        pitch = far ? Math.max(def.pitchMin, Math.PI / 4) : def.pitchMax;
      }
    } else if (def.kind === 'canon_eau') {
      const J = rt.spec.jets[i]!;
      const speed = jetSpeed(J, t.mode);
      // pluie : en cloche si le débattement le permet, sinon comme les autres modes
      pitch = t.mode === 'pluie' ? solveLob(speed, dist, dy, 0, def.pitchMin, def.pitchMax) : NaN;
      if (pitch !== pitch) pitch = solveDirect(speed, dist, dy);
      if (pitch !== pitch || dist > jetReach(J, t.mode)) {
        ok = false;
        pitch = t.mode === 'pluie' ? Math.PI / 4 : 0.5;
      }
    } else {
      pitch = Math.atan2(dy, dist > 1e-6 ? dist : 1e-6);
    }
    if (pitch < def.pitchMin - 1e-6 || pitch > def.pitchMax + 1e-6) ok = false;
    // gisement dans le repère du véhicule : positif = vers la droite (le cap, lui, croît vers la gauche)
    let yaw = wrapAngle(v.heading - yawWorld);
    if (!freeYaw(def) && (yaw < def.yawMin || yaw > def.yawMax)) {
      ok = false;
      yaw = clamp(yaw, def.yawMin, def.yawMax);
    }
    t.wantYaw = yaw;
    t.wantPitch = clamp(pitch, def.pitchMin, def.pitchMax);
    t.inRange = ok;
  }

  /** Point de chute pour l'orientation courante (sol plat à l'altitude du véhicule). */
  predict(rt: VehicleRt, turret: number, out: Vec3): boolean {
    const v = rt.v;
    const def = v.def.turrets[turret];
    if (!def || def.kind === 'camera') return false;
    const t = rt.turrets[turret]!;
    const m = this.muzzle;
    const yaw = v.heading - v.turretYaw[turret]!;
    const pitch = v.turretPitch[turret]!;
    const ch = Math.cos(pitch);
    let speed: number;
    let drag = 0;
    if (def.kind === 'lance_grenades') {
      this.pivot(rt, turret, m);
      m.x += Math.sin(yaw) * ch * LAUNCHER_REACH;
      m.y += LAUNCHER_TRUNNION + Math.sin(pitch) * LAUNCHER_REACH;
      m.z += Math.cos(yaw) * ch * LAUNCHER_REACH;
      drag = this.projectileDrag(rt.spec.launchers[turret]!.projectile);
      speed = t.muzzle;
    } else {
      const J = rt.spec.jets[turret];
      if (!J) return false;
      this.nozzle(rt, turret, yaw, pitch, m);
      speed = jetSpeed(J, t.mode);
    }
    const env = this.k.ctx.env.state;
    simulateShot(
      m.x, m.y, m.z, Math.sin(yaw) * ch * speed, Math.sin(pitch) * speed, Math.cos(yaw) * ch * speed,
      drag, env.windX, env.windZ, v.y, out,
    );
    return true;
  }
}
