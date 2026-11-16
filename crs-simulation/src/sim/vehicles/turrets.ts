/* =====================================================================================
 * Tourelles et équipements : lance-grenades du Centaure, canons à eau, lance du fourgon-pompe,
 * caméras (mât du Centaure, nacelle du drone et de l'hélicoptère).
 *
 *   - orientation : Vehicle.turretYaw / turretPitch, écrits pas à pas par un contrôleur, ou rejoints
 *     d'eux-mêmes après aimTurret (angles) ou aimTurretAt (point désigné) ; toujours bornés par
 *     TurretDef et limités en vitesse de pointage ;
 *   - lance-grenades : fireTurret tire une SALVE de 1 à 30 tubes (setSalvo), un coup toutes les
 *     0,3 s ; grenades lacrymogènes de 56 mm créées par ctx.projectiles.spawn, en cloche, avec le
 *     dispositif de propulsion (50 / 100 / 200 m) le plus court qui atteint le point désigné ; la
 *     salve s'ouvre en éventail (nappe de 20 à 60 m). Rechargement de la réserve à l'arrêt (120 s) ;
 *   - canon à eau : fireTurret = détente tenue ; le jet dure tant que l'appel est répété (au moins
 *     tous les quarts de seconde), la cuve se vide au débit du mode ; ravitaillement à l'arrêt ;
 *   - le tireur policier déclare l'emploi de la force : 'lacrymo' par salve, 'canon_eau' quand le
 *     jet atteint quelqu'un.
 * Événement vehicle:turret_fired (à chaque coup de lance-grenades ; au début d'un jet puis deux fois
 * par seconde tant qu'il dure) ; demandes fx 'jet_eau' et sfx 'canon_eau' / 'lanceur_tir'.
 * ===================================================================================== */

import type { EntityId, TurretDef, Vec3, Vehicle } from '@/core/contracts';
import { angleDiff, clamp, wrapAngle } from '@/core/math';
import { ITEMS_SERVICE, SERVICE_EVENT } from './api';
import type { JetMode, LauncherSpec, ServiceEvent, TurretStatus } from './api';
import { muzzleSpeedFor, shotRange, simulateShot, solveDirect, solveLob } from './ballistics';
import { JET_EFFECT_PERIOD, jetFlow, jetReach, jetSpeed, WaterJet } from './jet';
import type { TurretRt, VehicleKernel, VehicleRt } from './runtime';

/** Vitesses de pointage (rad/s) : lacet et site, par type d'équipement. */
const SLEW: Record<TurretDef['kind'], readonly [number, number]> = {
  lance_grenades: [1.2, 0.8],
  canon_eau: [1.0, 0.8],
  camera: [2.6, 2.0],
};
const TWO_PI = Math.PI * 2;
/** Géométrie des armes, alignée sur le modèle affiché : tourillon et berceau du lance-grenades, lance du canon (m). */
const LAUNCHER_TRUNNION = 0.42;
const LAUNCHER_REACH = 0.36;
const NOZZLE_REACH = 1.02;
/** Vitesse en dessous de laquelle le véhicule est « à l'arrêt » pour recharger ou ravitailler (m/s). */
const STILL_SPEED = 0.3;

/** Forme minimale du service des objets dont on lit le coefficient de traînée des projectiles. */
interface ItemsLike {
  projectileSpec?(kind: string): { drag?: number } | undefined;
}

export class TurretSystem {
  private readonly muzzle: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly landing: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly speeds = new Map<LauncherSpec, number[]>();
  private dragKnown = false;
  private drag = 0;

  constructor(private readonly k: VehicleKernel, readonly jet: WaterJet) {}

  reset(): void {
    this.speeds.clear();
    this.dragKnown = false;
  }

  // ───────────────────────────── géométrie et balistique ─────────────────────────────

  /** Position monde de la tourelle (pivot de l'arme ou de la caméra). */
  private pivot(rt: VehicleRt, i: number, out: Vec3): void {
    const v = rt.v;
    const d = v.def.turrets[i]!;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    out.x = v.x - cs * d.x + sn * d.z;
    out.z = v.z + sn * d.x + cs * d.z;
    out.y = v.y + d.y + rt.turrets[i]!.mast * rt.spec.mast;
  }

  /** Sortie de la lance d'un canon à eau (monde), pour une orientation monde donnée. */
  private nozzle(rt: VehicleRt, i: number, yaw: number, pitch: number, out: Vec3): void {
    this.pivot(rt, i, out);
    const ch = Math.cos(pitch);
    out.x += Math.sin(yaw) * ch * NOZZLE_REACH;
    out.y += Math.sin(pitch) * NOZZLE_REACH;
    out.z += Math.cos(yaw) * ch * NOZZLE_REACH;
  }

  /** Coefficient de traînée des grenades, lu auprès du module des objets s'il est branché (0 sinon). */
  private projectileDrag(kind: string): number {
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
  private muzzleSpeeds(L: LauncherSpec, drag: number): number[] {
    let list = this.speeds.get(L);
    if (!list) {
      list = [];
      for (let i = 0; i < L.ranges.length; i++) list.push(muzzleSpeedFor(L.ranges[i]!, drag));
      this.speeds.set(L, list);
    }
    return list;
  }

  /** Calcule l'orientation qui atteint le point désigné ; renseigne wantYaw, wantPitch, inRange (et la charge). */
  private solve(rt: VehicleRt, i: number): void {
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
    if (def.yawMax - def.yawMin < TWO_PI - 0.01 && (yaw < def.yawMin || yaw > def.yawMax)) {
      ok = false;
      yaw = clamp(yaw, def.yawMin, def.yawMax);
    }
    t.wantYaw = yaw;
    t.wantPitch = clamp(pitch, def.pitchMin, def.pitchMax);
    t.inRange = ok;
  }

  // ───────────────────────────── mise à jour ─────────────────────────────

  update(rt: VehicleRt, dt: number): void {
    const v = rt.v;
    const defs = v.def.turrets;
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      const t = rt.turrets[i]!;
      this.orient(rt, i, def, t, dt);
      if (def.kind === 'lance_grenades') this.updateLauncher(rt, i, def, t, dt);
      else if (def.kind === 'canon_eau') this.updateJet(rt, i, t, dt);
      else if (t.mast !== t.mastTarget || t.mastTarget > 0) this.updateMast(rt, t, dt);
    }
  }

  /** Borne l'orientation, la limite en vitesse, et suit le point désigné. */
  private orient(rt: VehicleRt, i: number, def: TurretDef, t: TurretRt, dt: number): void {
    const v = rt.v;
    let yaw = v.turretYaw[i]!;
    let pitch = v.turretPitch[i]!;
    if (yaw !== yaw) yaw = t.prevYaw;
    if (pitch !== pitch) pitch = t.prevPitch;
    if (t.hasTarget) {
      t.aimT -= dt;
      if (t.aimT <= 0) {
        t.aimT = 0.1;
        this.solve(rt, i);
      }
      yaw = t.wantYaw;
      pitch = t.wantPitch;
    } else if (t.manual) {
      yaw = t.wantYaw;
      pitch = t.wantPitch;
    } else if (yaw === t.prevYaw && pitch === t.prevPitch) {
      return; // rien n'a bougé
    }
    const free = def.yawMax - def.yawMin >= TWO_PI - 0.01;
    yaw = free ? wrapAngle(yaw) : clamp(yaw, def.yawMin, def.yawMax);
    pitch = clamp(pitch, def.pitchMin, def.pitchMax);
    const slew = SLEW[def.kind];
    const maxYaw = slew[0] * dt;
    const maxPitch = slew[1] * dt;
    let d = free ? angleDiff(t.prevYaw, yaw) : yaw - t.prevYaw;
    if (d > maxYaw) d = maxYaw;
    else if (d < -maxYaw) d = -maxYaw;
    yaw = free ? wrapAngle(t.prevYaw + d) : t.prevYaw + d;
    d = pitch - t.prevPitch;
    if (d > maxPitch) d = maxPitch;
    else if (d < -maxPitch) d = -maxPitch;
    pitch = t.prevPitch + d;
    v.turretYaw[i] = yaw;
    v.turretPitch[i] = pitch;
    t.prevYaw = yaw;
    t.prevPitch = pitch;
    if (t.manual) {
      // orientation demandée atteinte (ou butée) : fin du pointage
      const wy = free ? wrapAngle(t.wantYaw) : clamp(t.wantYaw, def.yawMin, def.yawMax);
      const wp = clamp(t.wantPitch, def.pitchMin, def.pitchMax);
      if (Math.abs(free ? angleDiff(yaw, wy) : wy - yaw) < 1e-6 && Math.abs(wp - pitch) < 1e-6) t.manual = false;
    }
  }

  private still(rt: VehicleRt): boolean {
    const v = rt.v;
    return v.vx * v.vx + v.vz * v.vz < STILL_SPEED * STILL_SPEED;
  }

  private serviceEvent(rt: VehicleRt, turret: number, type: ServiceEvent['type'], state: ServiceEvent['state']): void {
    const ev: ServiceEvent = { id: rt.v.id, turret, type, state };
    this.k.ctx.events.emitAny(SERVICE_EVENT, ev);
  }

  // ───────────────────────────── lance-grenades ─────────────────────────────

  private updateLauncher(rt: VehicleRt, i: number, def: TurretDef, t: TurretRt, dt: number): void {
    const v = rt.v;
    if (t.queued > 0) {
      if (v.state !== 'ok' && v.state !== 'damaged') {
        t.queued = 0;
        return;
      }
      t.cooldown -= dt;
      while (t.cooldown <= 0 && t.queued > 0) {
        if (!this.launch(rt, i, def, t)) {
          t.queued = 0;
          break;
        }
        t.cooldown += def.interval;
      }
      return;
    }
    if (t.cooldown > 0) t.cooldown -= dt;
    if (t.serviceT >= 0) {
      // rechargement : à l'arrêt seulement
      if (!this.still(rt)) {
        t.serviceT = -1;
        this.serviceEvent(rt, i, 'rechargement', 'interrompu');
        return;
      }
      t.serviceT += dt;
      if (t.serviceT >= t.serviceDur) {
        const n = Math.min(def.capacity - v.turretAmmo[i]!, t.reserve);
        v.turretAmmo[i] = v.turretAmmo[i]! + n;
        t.reserve -= n;
        t.serviceT = -1;
        this.serviceEvent(rt, i, 'rechargement', 'fin');
      }
    } else if (v.turretAmmo[i] === 0 && t.reserve > 0 && rt.occupants > 0 && this.still(rt)) {
      // tubes vides, engin à l'arrêt depuis quelques secondes : l'équipage recharge de lui-même
      t.idleT += dt;
      if (t.idleT >= 3) {
        t.idleT = 0;
        this.reload(rt, i);
      }
    } else {
      t.idleT = 0;
    }
  }

  /** Tire le coup suivant de la salve en cours. */
  private launch(rt: VehicleRt, i: number, def: TurretDef, t: TurretRt): boolean {
    const v = rt.v;
    if (!(v.turretAmmo[i]! > 0)) return false;
    const ctx = this.k.ctx;
    const L = rt.spec.launchers[i]!;
    const rng = this.k.rng;
    const disp = this.k.tuning.dispersion;
    const m = this.muzzle;
    this.pivot(rt, i, m);
    const pitch = v.turretPitch[i]!;
    let yaw = v.heading - v.turretYaw[i]!;
    // éventail : la salve s'étale d'autant plus qu'elle compte de coups
    const n = t.salvoSize;
    if (n > 1) {
      const width = L.spreadOne + ((L.spreadFull - L.spreadOne) * (n - 1)) / Math.max(1, def.capacity - 1);
      let range: number;
      if (t.hasTarget) {
        const dx = t.tx - m.x;
        const dz = t.tz - m.z;
        range = Math.sqrt(dx * dx + dz * dz);
      } else {
        range = shotRange(t.muzzle, pitch, -def.y, this.projectileDrag(L.projectile));
      }
      const off = width * ((t.salvoIndex + 0.5) / n - 0.5);
      yaw += Math.atan2(off, range > 5 ? range : 5);
    }
    yaw += rng.range(-1, 1) * 0.008 * disp;
    const speed = t.muzzle * (1 + rng.range(-1, 1) * 0.012 * disp);
    const ch = Math.cos(pitch);
    const dx = Math.sin(yaw) * ch;
    const dy = Math.sin(pitch);
    const dz = Math.cos(yaw) * ch;
    // bouche du tube : tourillon au-dessus du pivot, berceau court (mêmes cotes que le modèle affiché)
    const x = m.x + dx * LAUNCHER_REACH;
    const y = m.y + LAUNCHER_TRUNNION + dy * LAUNCHER_REACH;
    const z = m.z + dz * LAUNCHER_REACH;
    ctx.projectiles.spawn(L.projectile, t.queuedBy, x, y, z, dx * speed + v.vx, dy * speed, dz * speed + v.vz);
    v.turretAmmo[i] = v.turretAmmo[i]! - 1;
    t.salvoIndex++;
    t.queued--;
    ctx.events.emit('vehicle:turret_fired', { id: v.id, turret: i, byId: t.queuedBy });
    ctx.events.emit('sfx', { id: 'lanceur_tir', x, y, z, volume: 0.9 });
    ctx.events.emit('fx', { id: 'fumee', x, y, z, size: 0.5, dirX: dx, dirY: dy, dirZ: dz, seconds: 0.6 });
    return true;
  }

  // ───────────────────────────── canon à eau ─────────────────────────────

  /** Niveau de la cuve (partagée par tous les canons du véhicule). */
  private tank(rt: VehicleRt): number {
    const defs = rt.v.def.turrets;
    for (let i = 0; i < defs.length; i++) if (defs[i]!.kind === 'canon_eau') return rt.v.turretAmmo[i]!;
    return 0;
  }

  private setTank(rt: VehicleRt, litres: number): void {
    const defs = rt.v.def.turrets;
    for (let i = 0; i < defs.length; i++) if (defs[i]!.kind === 'canon_eau') rt.v.turretAmmo[i] = litres;
  }

  private updateJet(rt: VehicleRt, i: number, t: TurretRt, dt: number): void {
    const v = rt.v;
    const J = rt.spec.jets[i];
    if (!J) return;
    const ctx = this.k.ctx;
    // ravitaillement : à l'arrêt, canon fermé
    if (t.serviceT >= 0) {
      if (!this.still(rt) || t.hold > 0) {
        t.serviceT = -1;
        this.serviceEvent(rt, i, 'ravitaillement', 'interrompu');
      } else {
        const cap = v.def.turrets[i]!.capacity;
        t.serviceT += dt;
        const level = Math.min(cap, this.tank(rt) + (cap / J.refill) * dt);
        this.setTank(rt, level);
        if (level >= cap) {
          t.serviceT = -1;
          this.serviceEvent(rt, i, 'ravitaillement', 'fin');
        }
      }
    }
    let active = false;
    if (t.hold > 0) {
      t.hold -= dt;
      active = this.tank(rt) > 0 && (v.state === 'ok' || v.state === 'damaged');
    }
    if (!active) {
      t.jetOn = false;
      return;
    }
    if (!t.jetOn) {
      t.jetOn = true;
      t.effectT = 0;
      t.fxT = 0;
      t.eventT = 0;
      t.reportT = 0;
      ctx.events.emit('sfx', { id: 'canon_eau', x: v.x, y: v.y + v.def.turrets[i]!.y, z: v.z, volume: 1 });
    }
    // la cuve se vide au débit du mode
    const level = this.tank(rt) - jetFlow(J, t.mode) * dt;
    this.setTank(rt, level > 0 ? level : 0);
    rt.awake = true;

    t.eventT -= dt;
    if (t.eventT <= 0) {
      t.eventT += 0.5;
      ctx.events.emit('vehicle:turret_fired', { id: v.id, turret: i, byId: t.byId });
    }
    t.effectT -= dt;
    const m = this.muzzle;
    const yaw = v.heading - v.turretYaw[i]!;
    const pitch = v.turretPitch[i]!;
    if (t.effectT <= 0) {
      t.effectT += JET_EFFECT_PERIOD;
      if (t.effectT < 0) t.effectT = 0;
      this.nozzle(rt, i, yaw, pitch, m);
      this.jet.trace(rt, t, m.x, m.y, m.z, yaw, pitch, J);
      this.jet.effects(rt, i, J, JET_EFFECT_PERIOD);
    }
    t.fxT -= dt;
    if (t.fxT <= 0) {
      t.fxT += 0.1;
      this.nozzle(rt, i, yaw, pitch, m);
      const ch = Math.cos(pitch);
      ctx.events.emit('fx', {
        id: 'jet_eau', x: m.x, y: m.y, z: m.z, dirX: Math.sin(yaw) * ch, dirY: Math.sin(pitch), dirZ: Math.cos(yaw) * ch,
        size: t.jetLength, seconds: 0.15,
      });
    }
  }

  private updateMast(rt: VehicleRt, t: TurretRt, dt: number): void {
    const v = rt.v;
    // le mât se rentre de lui-même dès que l'engin roule
    if (t.mastTarget > 0 && v.vx * v.vx + v.vz * v.vz > 36) t.mastTarget = 0;
    const step = dt * 0.5;
    if (t.mast < t.mastTarget) t.mast = Math.min(t.mastTarget, t.mast + step);
    else if (t.mast > t.mastTarget) t.mast = Math.max(t.mastTarget, t.mast - step);
  }

  // ───────────────────────────── API ─────────────────────────────

  /** VehicleApi.fireTurret : tir dans l'orientation courante. */
  fire(v: Vehicle, turret: number, byId: EntityId): boolean {
    const def = v.def.turrets[turret];
    if (!def) return false;
    if (v.state !== 'ok' && v.state !== 'damaged') return false;
    const rt = this.k.rt(v);
    const t = rt.turrets[turret]!;
    const ctx = this.k.ctx;
    if (def.kind === 'lance_grenades') {
      if (t.queued > 0 || t.cooldown > 0 || t.serviceT >= 0) return false;
      const ammo = v.turretAmmo[turret]!;
      if (!(ammo > 0)) return false;
      const n = Math.max(1, Math.min(t.salvo, ammo));
      t.salvoSize = n;
      t.salvoIndex = 0;
      t.queued = n;
      t.queuedBy = byId;
      t.cooldown = 0;
      rt.awake = true;
      if (!this.launch(rt, turret, def, t)) {
        t.queued = 0;
        return false;
      }
      t.cooldown = def.interval;
      // déclaration de l'emploi de la force : une fois par salve
      const gunner = byId !== 0 ? ctx.people.get(byId) : undefined;
      if (gunner && gunner.faction === 'police') {
        let x = t.tx;
        let z = t.tz;
        if (!t.hasTarget && this.predict(rt, turret, this.landing)) {
          x = this.landing.x;
          z = this.landing.z;
        }
        ctx.law.reportForce(gunner, 'lacrymo', null, x, z);
      }
      return true;
    }
    if (def.kind === 'canon_eau') {
      if (!rt.spec.jets[turret] || !(this.tank(rt) > 0)) return false;
      t.hold = 0.25;
      t.byId = byId;
      rt.awake = true;
      return true;
    }
    return false; // une caméra ne tire pas
  }

  aim(v: Vehicle, turret: number, yaw: number, pitch: number): void {
    if (!v.def.turrets[turret]) return;
    const t = this.k.rt(v).turrets[turret]!;
    t.hasTarget = false;
    t.inRange = false;
    // la tourelle rejoint cette orientation à sa vitesse de pointage
    t.manual = true;
    t.wantYaw = yaw;
    t.wantPitch = pitch;
    this.k.wake(this.k.rt(v));
  }

  aimAt(v: Vehicle, turret: number, x: number, y: number, z: number): boolean {
    if (!v.def.turrets[turret]) return false;
    const rt = this.k.rt(v);
    const t = rt.turrets[turret]!;
    t.hasTarget = true;
    t.manual = false;
    t.tx = x;
    t.ty = y;
    t.tz = z;
    t.aimT = 0.1;
    this.solve(rt, turret);
    this.k.wake(rt);
    return t.inRange;
  }

  clearTarget(v: Vehicle, turret: number): void {
    if (!v.def.turrets[turret]) return;
    const t = this.k.rt(v).turrets[turret]!;
    t.hasTarget = false;
    t.inRange = false;
  }

  setSalvo(v: Vehicle, turret: number, count: number): number {
    const def = v.def.turrets[turret];
    if (!def || def.kind !== 'lance_grenades') return 0;
    const t = this.k.rt(v).turrets[turret]!;
    t.salvo = Math.max(1, Math.min(def.capacity, Math.round(count) || 1));
    return t.salvo;
  }

  setJetMode(v: Vehicle, turret: number, mode: JetMode): void {
    const def = v.def.turrets[turret];
    if (!def || def.kind !== 'canon_eau') return;
    const t = this.k.rt(v).turrets[turret]!;
    t.mode = mode;
    t.aimT = 0;
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

  reload(rt: VehicleRt, turret: number): boolean {
    const v = rt.v;
    const def = v.def.turrets[turret];
    const L = rt.spec.launchers[turret];
    if (!def || !L || def.kind !== 'lance_grenades') return false;
    const t = rt.turrets[turret]!;
    const missing = def.capacity - v.turretAmmo[turret]!;
    if (t.serviceT >= 0 || t.queued > 0 || missing <= 0 || t.reserve <= 0 || !this.still(rt)) return false;
    if (v.state !== 'ok' && v.state !== 'damaged') return false;
    t.serviceT = 0;
    t.serviceDur = (L.reloadTime * Math.min(missing, t.reserve)) / def.capacity;
    rt.awake = true;
    this.serviceEvent(rt, turret, 'rechargement', 'debut');
    return true;
  }

  /** Lance le plein de la cuve. */
  refill(rt: VehicleRt): boolean {
    const v = rt.v;
    if (!this.still(rt) || (v.state !== 'ok' && v.state !== 'damaged')) return false;
    const defs = v.def.turrets;
    for (let i = 0; i < defs.length; i++) {
      if (defs[i]!.kind !== 'canon_eau' || !rt.spec.jets[i]) continue;
      const t = rt.turrets[i]!;
      if (t.serviceT >= 0) return true;
      if (v.turretAmmo[i]! >= defs[i]!.capacity) return false;
      t.serviceT = 0;
      t.serviceDur = rt.spec.jets[i]!.refill;
      t.hold = 0;
      rt.awake = true;
      this.serviceEvent(rt, i, 'ravitaillement', 'debut');
      return true;
    }
    return false;
  }

  setMast(rt: VehicleRt, raised: boolean): void {
    if (!(rt.spec.mast > 0)) return;
    const defs = rt.v.def.turrets;
    for (let i = 0; i < defs.length; i++) {
      if (defs[i]!.kind === 'camera') rt.turrets[i]!.mastTarget = raised ? 1 : 0;
    }
    rt.awake = true;
  }

  /** Une tourelle a-t-elle encore du travail (salve, jet, service, mât) ? Le véhicule ne doit alors pas être négligé. */
  busy(rt: VehicleRt): boolean {
    const ts = rt.turrets;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]!;
      if (t.queued > 0 || t.hold > 0 || t.jetOn || t.serviceT >= 0 || t.hasTarget || t.manual || t.mast !== t.mastTarget) return true;
      if (rt.v.turretYaw[i] !== t.prevYaw || rt.v.turretPitch[i] !== t.prevPitch) return true;
    }
    return false;
  }

  status(rt: VehicleRt, turret: number): Readonly<TurretStatus> | null {
    const v = rt.v;
    const def = v.def.turrets[turret];
    if (!def) return null;
    const t = rt.turrets[turret]!;
    const s = t.status;
    s.kind = def.kind;
    s.ammo = v.turretAmmo[turret]!;
    s.capacity = def.capacity;
    s.reserve = t.reserve;
    s.service = t.serviceT < 0 ? -1 : def.kind === 'canon_eau' ? s.ammo / Math.max(1, def.capacity) : Math.min(1, t.serviceT / Math.max(1e-6, t.serviceDur));
    s.firing = def.kind === 'canon_eau' ? t.jetOn : t.queued > 0;
    s.salvo = t.salvo;
    s.queued = t.queued;
    s.mode = t.mode;
    s.hasTarget = t.hasTarget;
    s.inRange = t.hasTarget && t.inRange;
    s.targetX = t.tx;
    s.targetZ = t.tz;
    s.mast = t.mast;
    return s;
  }
}
