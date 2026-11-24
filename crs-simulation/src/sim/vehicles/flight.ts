/* =====================================================================================
 * Engins volants : drone du télépilote et hélicoptère.
 *
 * Drone (docs/research/06-roles-jouables.md §9.3) : vol stationnaire stable, commandes
 *   cmd.throttle = avance / recul, cmd.strafe = translation latérale, cmd.lift = montée / descente,
 *   cmd.steer = lacet ; 15 m/s, plafond 120 m et plancher 2 m au-dessus du sol ; il ne traverse pas le
 *   bâti (ctx.world.buildingHeightAt) : il monte de lui-même devant un immeuble plus haut que lui et
 *   s'arrête tant qu'il n'est pas passé au-dessus ; batterie de 30 min (consommation × 1,5 par vent de
 *   plus de 10 m/s), retour automatique à 15 % ; sans batterie, il tombe.
 *   Déployé et rappelé par l'événement libre 'drone:toggle' { personId } : il apparaît près du
 *   télépilote, décolle à 30 m ; rappelé, il revient se poser près de lui et disparaît.
 * Hélicoptère : orbite automatique autour d'un point (300 m de rayon à 400 m de haut par défaut),
 *   nez dans le sens de la marche, incliné dans le virage, caméra pointée sur le centre.
 * Vehicle.y est l'altitude absolue de l'appareil ; Vehicle.vy sa vitesse verticale.
 * ===================================================================================== */

import type { DamageInfo, Person, Vehicle } from '@/core/contracts';
import { angleDiff, wrapAngle } from '@/core/math';
import { DRONE_EVENT, GRAVITY, PLAYER_CONTROL_SERVICE } from './api';
import type { DroneEvent, DroneEventState, FlightSpec, FlightStatus } from './api';
import type { FlightRt, VehicleKernel, VehicleRt } from './runtime';

/** Marge au-dessus des toits (m). */
const ROOF_CLEARANCE = 3;
/** Hauteur de retour automatique au-dessus du sol (m). */
const RETURN_ALTITUDE = 40;
/** Part de batterie qui déclenche le retour automatique. */
export const LOW_BATTERY = 0.15;

/** Forme minimale du contrôleur du joueur : prise en main d'un engin télépiloté. */
interface PlayerControlLike {
  setRemoteVehicle?(id: number): void;
}

export class FlightSystem {
  /** Drone en vol par télépilote. */
  private readonly droneOfPilot = new Map<number, number>();
  private readonly people: Person[] = [];

  constructor(private readonly k: VehicleKernel) {}

  reset(): void {
    this.droneOfPilot.clear();
  }

  /** Hauteur de l'obstacle (sol + bâti) en un point. */
  private obstacleTop(x: number, z: number): number {
    const w = this.k.ctx.world;
    return w.heightAt(x, z) + w.buildingHeightAt(x, z);
  }

  private emit(v: Vehicle, f: FlightRt, state: DroneEventState): void {
    const ev: DroneEvent = { vehicleId: v.id, personId: f.pilotId, state };
    this.k.ctx.events.emitAny(DRONE_EVENT, ev);
  }

  // ───────────────────────────── déploiement du drone ─────────────────────────────

  droneOf(personId: number): Vehicle | null {
    const id = this.droneOfPilot.get(personId);
    if (id === undefined) return null;
    const v = this.k.store.get(id);
    if (!v) {
      this.droneOfPilot.delete(personId);
      return null;
    }
    return v;
  }

  /** Événement 'drone:toggle' : déploie le drone du télépilote, ou le rappelle s'il vole déjà. */
  toggle(personId: number): void {
    const pilot = this.k.ctx.people.get(personId);
    if (!pilot) return;
    const current = this.droneOf(personId);
    if (!current) {
      this.deploy(pilot);
      return;
    }
    const f = this.k.rt(current).flight;
    // déjà sur le chemin du retour : rien à faire de plus
    if (f && f.mode !== 'retour' && f.mode !== 'atterrissage') this.recall(pilot);
  }

  deploy(pilot: Person): Vehicle | null {
    const existing = this.droneOf(pilot.id);
    if (existing) return existing;
    const ctx = this.k.ctx;
    // devant le télépilote, à portée de main
    const x = pilot.x + Math.sin(pilot.heading) * 1.2;
    const z = pilot.z + Math.cos(pilot.heading) * 1.2;
    const v = ctx.vehicles.spawn('drone', x, z, pilot.heading, { faction: pilot.faction });
    const rt = this.k.rt(v);
    const f = rt.flight;
    if (!f || !rt.spec.flight) {
      ctx.vehicles.remove(v.id);
      return null;
    }
    v.y = this.obstacleTop(x, z) + 1.2;
    f.pilotId = pilot.id;
    f.homeX = pilot.x;
    f.homeZ = pilot.z;
    f.removeOnLand = true;
    this.droneOfPilot.set(pilot.id, v.id);
    this.takeOff(rt, rt.spec.flight.cruise);
    this.emit(v, f, 'decollage');
    ctx.events.emit('sfx', { id: 'drone', x: v.x, y: v.y, z: v.z, volume: 0.7 });
    if (pilot.isPlayer) {
      ctx.service<PlayerControlLike>(PLAYER_CONTROL_SERVICE)?.setRemoteVehicle?.(v.id);
      ctx.player.setCameraMode('drone');
    }
    return v;
  }

  recall(pilot: Person): boolean {
    const v = this.droneOf(pilot.id);
    if (!v) return false;
    const rt = this.k.rt(v);
    const f = rt.flight;
    if (!f || f.mode === 'chute') return false;
    f.homeX = pilot.x;
    f.homeZ = pilot.z;
    f.removeOnLand = true;
    if (f.mode === 'pose') {
      this.k.removals.push(v.id);
    } else {
      f.mode = 'retour';
    }
    this.emit(v, f, 'rappel');
    this.releasePlayer(pilot);
    return true;
  }

  /** Rend au joueur la main sur son personnage. */
  private releasePlayer(pilot: Person | undefined): void {
    if (!pilot || !pilot.isPlayer) return;
    const ctx = this.k.ctx;
    ctx.service<PlayerControlLike>(PLAYER_CONTROL_SERVICE)?.setRemoteVehicle?.(0);
    if (ctx.player.state.cameraMode === 'drone') ctx.player.setCameraMode('tps');
  }

  /** Le véhicule disparaît : son télépilote reprend la main. */
  onRemoved(rt: VehicleRt): void {
    const f = rt.flight;
    if (!f || f.pilotId === 0) return;
    if (this.droneOfPilot.get(f.pilotId) === rt.v.id) {
      this.droneOfPilot.delete(f.pilotId);
      this.releasePlayer(this.k.ctx.people.get(f.pilotId));
    }
  }

  // ───────────────────────────── ordres de vol ─────────────────────────────

  takeOff(rt: VehicleRt, altitude?: number): boolean {
    const f = rt.flight;
    const fs = rt.spec.flight;
    const v = rt.v;
    if (!f || !fs || v.state === 'wrecked' || v.state === 'burnt' || f.battery <= 0) return false;
    if (f.mode !== 'pose' && f.mode !== 'atterrissage') return false;
    f.mode = 'decollage';
    f.targetAlt = Math.min(fs.ceiling, Math.max(fs.floor, altitude ?? fs.cruise));
    v.engineOn = true;
    rt.awake = true;
    return true;
  }

  flyTo(rt: VehicleRt, x: number, z: number, altitude?: number): boolean {
    const f = rt.flight;
    const fs = rt.spec.flight;
    if (!f || !fs || f.mode === 'chute') return false;
    if (f.mode === 'pose' && !this.takeOff(rt, altitude)) return false;
    f.targetX = x;
    f.targetZ = z;
    f.targetAlt = Math.min(fs.ceiling, Math.max(fs.floor, altitude ?? Math.max(fs.cruise, f.targetAlt)));
    f.mode = 'aller';
    return true;
  }

  orbit(rt: VehicleRt, cx: number, cz: number, radius: number, altitude?: number, speed?: number): boolean {
    const f = rt.flight;
    const fs = rt.spec.flight;
    if (!f || !fs || f.mode === 'chute') return false;
    if (f.mode === 'pose' && !this.takeOff(rt, altitude)) return false;
    f.orbitCx = cx;
    f.orbitCz = cz;
    f.orbitR = Math.max(5, radius);
    f.orbitSpeed = this.orbitSpeed(rt, fs, f.orbitR, speed);
    f.targetAlt = Math.min(fs.ceiling, Math.max(fs.floor, altitude ?? fs.cruise));
    f.mode = 'orbite';
    return true;
  }

  /**
   * Vitesse d'orbite : celle demandée, bornée à ce que l'appareil peut tenir sur ce rayon (l'accélération
   * centripète v²/R ne doit pas dépasser ce qu'il sait fournir). Par défaut, une allure de surveillance.
   */
  private orbitSpeed(rt: VehicleRt, fs: FlightSpec, radius: number, speed: number | undefined): number {
    const hold = Math.sqrt(0.8 * fs.accel * radius);
    if (speed !== undefined && speed !== 0) return Math.sign(speed) * Math.min(Math.abs(speed), hold, rt.v.def.maxSpeed);
    return Math.min(rt.v.def.maxSpeed * 0.55, Math.sqrt(0.5 * fs.accel * radius));
  }

  land(rt: VehicleRt): boolean {
    const f = rt.flight;
    if (!f || f.mode === 'pose' || f.mode === 'chute') return false;
    f.mode = 'retour';
    return true;
  }

  /** Un hélicoptère qui apparaît est déjà en vol, en orbite autour de son point d'apparition. */
  onSpawned(rt: VehicleRt): void {
    const f = rt.flight;
    const fs = rt.spec.flight;
    if (!f || !fs || fs.type !== 'helico') return;
    const v = rt.v;
    const ground = this.k.ctx.world.heightAt(v.x, v.z);
    const radius = 300;
    f.orbitCx = v.x;
    f.orbitCz = v.z;
    f.orbitR = radius;
    f.orbitSpeed = this.orbitSpeed(rt, fs, radius, undefined);
    f.targetAlt = fs.cruise;
    f.mode = 'orbite';
    // placé d'emblée sur le cercle, à l'altitude d'orbite, dans le sens de la marche
    v.x += Math.sin(v.heading) * radius;
    v.z += Math.cos(v.heading) * radius;
    v.y = ground + fs.cruise;
    v.heading = wrapAngle(v.heading - Math.PI / 2);
    v.engineOn = true;
    v.beacons = true;
  }

  // ───────────────────────────── mise à jour ─────────────────────────────

  step(rt: VehicleRt, dt: number): void {
    const f = rt.flight;
    const fs = rt.spec.flight;
    if (!f || !fs) return;
    const v = rt.v;
    const world = this.k.ctx.world;
    const ground = world.heightAt(v.x, v.z);
    const here = ground + world.buildingHeightAt(v.x, v.z);

    if (f.mode === 'pose') {
      v.vx = 0;
      v.vz = 0;
      v.vy = 0;
      v.speed = 0;
      v.yawRate = 0;
      v.rpm = 0;
      v.gear = 0;
      this.fillStatus(rt, f, fs, ground);
      return;
    }
    if (f.mode === 'chute') {
      this.fall(rt, f, here, dt);
      this.fillStatus(rt, f, fs, ground);
      return;
    }

    // ── batterie ──
    if (f.battery !== Infinity) {
      const env = this.k.ctx.env.state;
      const windy = env.windX * env.windX + env.windZ * env.windZ > 100;
      f.battery -= dt * (windy ? 1.5 : 1);
      if (f.battery <= 0) {
        f.battery = 0;
        f.mode = 'chute';
        v.engineOn = false;
        this.emit(v, f, 'perdu');
        return;
      }
      if (!f.lowWarned && f.battery <= fs.battery * LOW_BATTERY) {
        f.lowWarned = true;
        if (f.mode !== 'retour' && f.mode !== 'atterrissage') f.mode = 'retour';
        this.emit(v, f, 'batterie_faible');
        const pilot = this.k.ctx.people.get(f.pilotId);
        if (pilot && pilot.isPlayer) this.k.ctx.ui.notify('Batterie du drone faible : retour automatique.', 'warn', 4);
      }
    }
    // télépilote hors de combat ou disparu : retour automatique
    if (f.pilotId !== 0 && f.mode !== 'retour' && f.mode !== 'atterrissage') {
      const pilot = this.k.ctx.people.get(f.pilotId);
      if (!pilot || this.k.ctx.health.isIncapacitated(pilot)) f.mode = 'retour';
    }

    // ── consignes : avance, latéral, vertical (m/s) et lacet (rad/s, positif = à gauche) ──
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const vmax = v.def.maxSpeed;
    let wantX = 0;
    let wantZ = 0;
    let wantVy = 0;
    let wantYaw = 0;
    const alt = v.y - ground;
    const mode = f.mode;
    if (mode === 'manuel') {
      const c = v.cmd;
      const fwd = clampUnit(c.throttle) * vmax;
      const side = clampUnit(c.strafe) * vmax * 0.8;
      // droite = (−cos h, sin h)
      wantX = sn * fwd - cs * side;
      wantZ = cs * fwd + sn * side;
      const lift = clampUnit(c.lift);
      wantVy = lift > 0 ? lift * fs.climb : lift * fs.descent;
      wantYaw = -clampUnit(c.steer) * fs.yawRate;
    } else if (mode === 'decollage') {
      wantVy = this.climbTo(ground + f.targetAlt, v.y, fs);
      if (alt >= f.targetAlt - 0.5) f.mode = fs.type === 'helico' ? 'orbite' : 'manuel';
    } else if (mode === 'aller' || mode === 'retour') {
      const tx = mode === 'retour' ? f.homeX : f.targetX;
      const tz = mode === 'retour' ? f.homeZ : f.targetZ;
      const dx = tx - v.x;
      const dz = tz - v.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const cruise = mode === 'retour' ? Math.max(RETURN_ALTITUDE, Math.min(alt, fs.ceiling)) : f.targetAlt;
      wantVy = this.climbTo(ground + cruise, v.y, fs);
      if (d > 0.6) {
        // vitesse d'approche : on freine à l'arrivée
        const speed = Math.min(vmax, Math.sqrt(2 * fs.accel * 0.6 * d));
        wantX = (dx / d) * speed;
        wantZ = (dz / d) * speed;
        wantYaw = clampAbs(angleDiff(v.heading, Math.atan2(dx, dz)) * 2, fs.yawRate);
      } else if (mode === 'retour') {
        f.mode = 'atterrissage';
      } else {
        f.mode = 'manuel';
      }
    } else if (mode === 'atterrissage') {
      wantVy = -Math.min(fs.descent, 0.6 + (v.y - here) * 0.6);
      const dx = f.homeX - v.x;
      const dz = f.homeZ - v.z;
      wantX = dx * 1.5;
      wantZ = dz * 1.5;
      if (v.y - here <= 0.25) {
        this.touchDown(rt, f, here);
        this.fillStatus(rt, f, fs, ground);
        return;
      }
    } else if (mode === 'orbite') {
      const dx = v.x - f.orbitCx;
      const dz = v.z - f.orbitCz;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const rx = dx / d;
      const rz = dz / d;
      // tangente (sens horaire vu du ciel pour une vitesse positive) + rappel vers le cercle
      const dir = f.orbitSpeed >= 0 ? 1 : -1;
      const sp = Math.abs(f.orbitSpeed);
      const far = d - f.orbitR;
      if (far > 12) {
        // loin du cercle : transit en ligne droite vers lui (une spirale à vitesse radiale bornée mettait des
        // dizaines de secondes à rejoindre une orbite serrée), freinage à l'arrivée sur le cercle
        const s = Math.min(vmax, Math.sqrt(2 * fs.accel * 0.6 * far));
        wantX = -rx * s;
        wantZ = -rz * s;
      } else {
        const corr = clampAbs((f.orbitR - d) * 0.4, sp * 0.6);
        wantX = -rz * dir * sp + rx * corr;
        wantZ = rx * dir * sp + rz * corr;
      }
      wantVy = this.climbTo(world.heightAt(f.orbitCx, f.orbitCz) + f.targetAlt, v.y, fs);
      wantYaw = clampAbs(angleDiff(v.heading, Math.atan2(wantX, wantZ)) * 2, fs.yawRate * 2);
    }

    // ── évitement du bâti : monter devant un obstacle plus haut que soi ──
    const sp2 = wantX * wantX + wantZ * wantZ;
    let blocked = false;
    if (sp2 > 0.01 && mode !== 'atterrissage') {
      const sp = Math.sqrt(sp2);
      const look = 2 + Math.sqrt(v.vx * v.vx + v.vz * v.vz) * 1.2;
      const ax = v.x + (wantX / sp) * look;
      const az = v.z + (wantZ / sp) * look;
      const mx = v.x + (wantX / sp) * look * 0.5;
      const mz = v.z + (wantZ / sp) * look * 0.5;
      const top = Math.max(this.obstacleTop(ax, az), this.obstacleTop(mx, mz));
      if (v.y < top + ROOF_CLEARANCE) {
        blocked = true;
        if (wantVy < fs.climb) wantVy = fs.climb;
        // on n'avance vers l'obstacle qu'une fois passé au-dessus
        wantX = 0;
        wantZ = 0;
      }
    }
    // plafond et plancher
    const ceiling = ground + fs.ceiling;
    if (v.y >= ceiling && wantVy > 0 && !blocked) wantVy = 0;
    const floor = here + (mode === 'atterrissage' ? 0 : here > ground ? ROOF_CLEARANCE * 0.5 : fs.floor);
    if (mode !== 'atterrissage' && mode !== 'decollage' && v.y <= floor && wantVy < 0) wantVy = 0;

    // ── dynamique : accélération bornée, dérive au vent ──
    const env = this.k.ctx.env.state;
    const drift = fs.type === 'drone' ? 0.12 : 0.03;
    const tvx = wantX + env.windX * drift;
    const tvz = wantZ + env.windZ * drift;
    const maxDv = fs.accel * dt;
    let dvx = tvx - v.vx;
    let dvz = tvz - v.vz;
    const dv = Math.sqrt(dvx * dvx + dvz * dvz);
    if (dv > maxDv) {
      dvx *= maxDv / dv;
      dvz *= maxDv / dv;
    }
    const axW = dvx / dt;
    const azW = dvz / dt;
    v.vx += dvx;
    v.vz += dvz;
    const maxDvy = fs.accel * 0.8 * dt;
    const dvy = wantVy - v.vy;
    v.vy += dvy > maxDvy ? maxDvy : dvy < -maxDvy ? -maxDvy : dvy;
    const yawAcc = fs.yawRate * 4 * dt;
    const dyr = wantYaw - v.yawRate;
    v.yawRate += dyr > yawAcc ? yawAcc : dyr < -yawAcc ? -yawAcc : dyr;
    v.heading = wrapAngle(v.heading + v.yawRate * dt);

    // ── déplacement : jamais dans un volume bâti ──
    let nx = v.x + v.vx * dt;
    let nz = v.z + v.vz * dt;
    let ny = v.y + v.vy * dt;
    if (ny < this.obstacleTop(nx, nz) + 1 && mode !== 'atterrissage') {
      // on essaie de glisser le long de la façade, sinon on s'arrête
      if (ny >= this.obstacleTop(nx, v.z) + 1) {
        nz = v.z;
        v.vz = 0;
      } else if (ny >= this.obstacleTop(v.x, nz) + 1) {
        nx = v.x;
        v.vx = 0;
      } else {
        nx = v.x;
        nz = v.z;
        v.vx = 0;
        v.vz = 0;
      }
    }
    const g2 = world.heightAt(nx, nz);
    const top2 = g2 + world.buildingHeightAt(nx, nz);
    if (ny > g2 + fs.ceiling) {
      ny = g2 + fs.ceiling;
      if (v.vy > 0) v.vy = 0;
    }
    const minY = top2 + (mode === 'atterrissage' ? 0 : mode === 'decollage' ? 0.2 : top2 > g2 ? 1 : fs.floor);
    if (ny < minY) {
      ny = minY;
      if (v.vy < 0) v.vy = 0;
    }
    v.x = nx;
    v.z = nz;
    v.y = ny;

    // ── sorties ──
    const sn2 = Math.sin(v.heading);
    const cs2 = Math.cos(v.heading);
    v.speed = v.vx * sn2 + v.vz * cs2;
    const aFwd = axW * sn2 + azW * cs2;
    const aLeft = axW * cs2 - azW * sn2;
    const k = 1 - Math.exp(-dt * 6);
    if (fs.type === 'helico') {
      // virage incliné : l'appareil penche vers l'intérieur
      const bank = Math.atan((v.speed * v.yawRate) / GRAVITY);
      v.roll += (-bank - v.roll) * k;
      v.pitch += (-aFwd * 0.02 - Math.abs(v.speed) * 0.0015 - v.pitch) * k;
    } else {
      // un multirotor s'incline du côté où il accélère
      v.pitch += (-aFwd * 0.035 - v.pitch) * k;
      v.roll += (-aLeft * 0.035 - v.roll) * k;
    }
    const eng = rt.spec.engine;
    const load = Math.min(1, 0.45 + Math.abs(v.vy) / (fs.climb * 2) + Math.sqrt(v.vx * v.vx + v.vz * v.vz) / (vmax * 3));
    v.rpm = eng.idle + (eng.redline - eng.idle) * load;
    v.gear = 1;
    v.braking = false;
    v.steerAngle = 0;
    this.fillStatus(rt, f, fs, ground);
  }

  /** Vitesse verticale pour rejoindre une altitude. */
  private climbTo(targetY: number, y: number, fs: FlightSpec): number {
    const d = targetY - y;
    return d > 0 ? Math.min(fs.climb, d * 1.2) : Math.max(-fs.descent, d * 1.2);
  }

  private touchDown(rt: VehicleRt, f: FlightRt, groundY: number): void {
    const v = rt.v;
    v.y = groundY;
    v.vx = 0;
    v.vz = 0;
    v.vy = 0;
    v.speed = 0;
    v.yawRate = 0;
    v.pitch = 0;
    v.roll = 0;
    v.engineOn = false;
    f.mode = 'pose';
    this.emit(v, f, 'pose');
    if (f.removeOnLand) this.k.removals.push(v.id);
  }

  /** Chute libre d'un appareil sans moteur ; à l'impact, il est détruit et blesse qui se trouve dessous. */
  private fall(rt: VehicleRt, f: FlightRt, groundY: number, dt: number): void {
    const v = rt.v;
    v.vy -= GRAVITY * dt;
    if (v.vy < -18) v.vy = -18; // traînée
    v.vx *= Math.exp(-dt * 0.8);
    v.vz *= Math.exp(-dt * 0.8);
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.y += v.vy * dt;
    v.roll += dt * 3;
    v.rpm = 0;
    if (v.y > groundY) return;
    const impact = -v.vy;
    v.y = groundY;
    v.vx = 0;
    v.vz = 0;
    v.vy = 0;
    v.speed = 0;
    v.roll = 0.6;
    f.mode = 'pose';
    f.removeOnLand = false;
    const ctx = this.k.ctx;
    this.k.hurtVehicle(v, 200, 'fall', 0, v.x, v.z);
    ctx.events.emit('sfx', { id: 'tole', x: v.x, y: v.y, z: v.z, volume: 0.6 });
    const n = ctx.people.queryRadius(v.x, v.z, 0.8 + rt.radius, this.people);
    for (let i = 0; i < n; i++) {
      const p = this.people[i]!;
      if (p.vehicleId !== 0) continue;
      const info: DamageInfo = {
        amount: Math.min(60, 4 + impact * (v.def.mass < 5 ? 0.6 : 6)), kind: 'impact', sourceId: f.pilotId, x: v.x, z: v.z, zone: 0.95,
        stun: 0.8,
      };
      ctx.health.hurt(p, info);
    }
    this.emit(v, f, 'perdu');
    this.releasePlayer(ctx.people.get(f.pilotId));
    // l'épave reste au sol, mais ce n'est plus l'appareil du télépilote : il peut en déployer un autre (relève)
    if (f.pilotId !== 0 && this.droneOfPilot.get(f.pilotId) === v.id) this.droneOfPilot.delete(f.pilotId);
  }

  /** État de vol à jour (objet stable par appareil). null pour un véhicule terrestre. */
  status(rt: VehicleRt): Readonly<FlightStatus> | null {
    const f = rt.flight;
    const fs = rt.spec.flight;
    if (!f || !fs) return null;
    this.fillStatus(rt, f, fs, this.k.ctx.world.heightAt(rt.v.x, rt.v.z));
    return f.status;
  }

  private fillStatus(rt: VehicleRt, f: FlightRt, fs: FlightSpec, ground: number): void {
    const s: FlightStatus = f.status;
    const v = rt.v;
    s.mode = f.mode;
    s.altitude = v.y - ground;
    s.battery = fs.battery > 0 ? f.battery / fs.battery : 1;
    s.secondsLeft = f.battery;
    s.pilotId = f.pilotId;
    const dx = v.x - f.homeX;
    const dz = v.z - f.homeZ;
    s.homeDistance = Math.sqrt(dx * dx + dz * dz);
  }
}

function clampUnit(v: number): number {
  return v !== v ? 0 : v < -1 ? -1 : v > 1 ? 1 : v;
}

function clampAbs(v: number, max: number): number {
  return v > max ? max : v < -max ? -max : v;
}
