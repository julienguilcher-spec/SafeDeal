/* =====================================================================================
 * Joueur — commandes d'un véhicule : place conducteur, place de tireur (tourelle), engin
 * télépiloté (drone).
 *
 * Conventions écrites dans Vehicle :
 *   - cmd.throttle : 1 = accélérer, −1 = marche arrière ; reculer en roulant = freiner d'abord ;
 *   - cmd.steer : −1 gauche … 1 droite (= InputState.moveX) ;
 *   - turretYaw : gisement dans le repère du véhicule, positif = vers la DROITE du véhicule (convention
 *     de src/sim/vehicles et de src/render/vehicles : cap monde de la tourelle = heading − turretYaw) ;
 *     turretPitch : positif = vers le haut ; tous deux bornés par TurretDef ;
 *   - engin volant : throttle = avancer/reculer, strafe = translation latérale (1 = droite),
 *     lift = monter (1) / descendre (−1), steer = rotation vers le cap de la caméra.
 * ===================================================================================== */

import type { GameContext, Person, PlayerState, Vehicle } from '@/core/contracts';
import { turnToward, wrapAngle } from '@/core/math';
import * as T from './tuning';

const FULL_TURN = Math.PI * 2 - 0.01;

function clampUnit(v: number): number {
  return v > 1 ? 1 : v < -1 ? -1 : v === v ? v : 0;
}

export class VehicleControl {
  /** Instant à partir duquel la tourelle peut tirer de nouveau. */
  private nextFire = 0;

  constructor(private readonly ctx: GameContext) {}

  reset(): void {
    this.nextFire = 0;
  }

  /** Relâche toutes les commandes (le frein à main reste où il est). */
  release(v: Vehicle): void {
    const cmd = v.cmd;
    cmd.throttle = 0;
    cmd.steer = 0;
    cmd.brake = 0;
    cmd.horn = false;
    cmd.lift = 0;
    cmd.strafe = 0;
  }

  /** Place conducteur : accélérateur, frein, volant, frein à main, klaxon, sirène, gyrophares, phares. */
  drive(v: Vehicle): void {
    const ctx = this.ctx;
    const input = ctx.input;
    const cmd = v.cmd;
    let fwd = input.moveY > 0 ? input.moveY : 0;
    let back = input.moveY < 0 ? -input.moveY : 0;
    if (input.throttle > fwd) fwd = input.throttle;
    if (input.brake > back) back = input.brake;
    if (fwd > 1) fwd = 1;
    if (back > 1) back = 1;
    const speed = v.speed;
    if (fwd > 0.02 && back > 0.02) {
      // les deux pédales : on freine
      cmd.throttle = 0;
      cmd.brake = back;
    } else if (fwd > 0.02) {
      if (speed < -0.5) {
        cmd.throttle = 0;
        cmd.brake = fwd;
      } else {
        cmd.throttle = fwd;
        cmd.brake = 0;
      }
    } else if (back > 0.02) {
      if (speed > 0.5) {
        cmd.throttle = 0;
        cmd.brake = back;
      } else {
        cmd.throttle = -back;
        cmd.brake = 0;
      }
    } else {
      cmd.throttle = 0;
      cmd.brake = 0;
    }
    cmd.steer = clampUnit(input.moveX);
    cmd.handbrake = input.down('handbrake');
    cmd.horn = input.down('horn');
    cmd.lift = 0;
    cmd.strafe = 0;
    if ((fwd > 0.02 || back > 0.02) && !v.engineOn && v.state !== 'wrecked' && v.state !== 'burnt') v.engineOn = true;

    // avertisseurs
    if (input.pressed('siren') && v.def.hasSiren) {
      const next = ((v.siren + 1) % 3) as 0 | 1 | 2;
      v.siren = next;
      if (next !== 0 && v.def.hasBeacons) v.beacons = true; // pas de deux-tons sans gyrophares
      ctx.events.emit('vehicle:siren', { id: v.id, siren: next });
    }
    if (input.pressed('beacons') && v.def.hasBeacons) {
      v.beacons = !v.beacons;
      if (!v.beacons && v.siren !== 0) {
        v.siren = 0;
        ctx.events.emit('vehicle:siren', { id: v.id, siren: 0 });
      }
    }
    if (input.pressed('headlights')) v.headlights = !v.headlights;
  }

  /**
   * Tourelle servie depuis ce siège : la n-ième place de tireur sert la n-ième tourelle. −1 si aucune.
   * Le CONDUCTEUR d'un engin armé (Centaure, canon à eau, fourgon-pompe) sert aussi l'arme : un seul joueur pilote et
   * tire (choix de jeu : pas de poste d'opérateur séparé) — il reçoit la première tourelle armée.
   */
  turretOf(v: Vehicle, seat: number): number {
    const seats = v.def.seats;
    if (seat === 0 && seats.length > 0 && seats[0]!.role === 'driver') return armedTurret(v);
    if (seat < 0 || seat >= seats.length || seats[seat]!.role !== 'gunner' || v.def.turrets.length === 0) return -1;
    let k = 0;
    for (let i = 0; i < seat; i++) if (seats[i]!.role === 'gunner') k++;
    return k < v.def.turrets.length ? k : v.def.turrets.length - 1;
  }

  /**
   * Conducteur d'un engin armé : il conduit (clavier / stick gauche / gâchettes) ET vise au regard (souris / stick
   * droit). Tir : clic gauche, ou RB à la manette (RT est l'accélérateur). Les deux canons à eau tirent ensemble.
   */
  driverGunner(p: Person, v: Vehicle, st: PlayerState, dt: number): void {
    const input = this.ctx.input;
    const button = input.device === 'gamepad' ? 'item_next' : 'primary';
    const turrets = v.def.turrets;
    const first = armedTurret(v);
    if (first < 0) return;
    const def = turrets[first]!;
    const trigger = def.kind === 'canon_eau' ? input.down(button) : input.pressed(button);
    for (let i = first; i < turrets.length; i++) {
      if (turrets[i]!.kind !== def.kind) continue;
      this.gunner(p, v, i, st, dt, trigger);
    }
  }

  /** Place de tireur : la tourelle suit le regard à vitesse bornée ; l'action principale tire (ou `trigger` imposé). */
  gunner(p: Person, v: Vehicle, turret: number, st: PlayerState, dt: number, trigger?: boolean): void {
    const ctx = this.ctx;
    const def = v.def.turrets[turret];
    if (!def) return;
    // lacet : relatif au cap du véhicule, borné
    // gisement positif vers la droite : cap monde de la tourelle = heading − turretYaw (aligné à l'assemblage sur
    // src/sim/vehicles et src/render/vehicles ; l'ancien signe faisait partir la tourelle en miroir du regard)
    let wantYaw = wrapAngle(v.heading - st.camYaw);
    const limited = def.yawMax - def.yawMin < FULL_TURN;
    if (limited) wantYaw = wantYaw < def.yawMin ? def.yawMin : wantYaw > def.yawMax ? def.yawMax : wantYaw;
    const cur = v.turretYaw[turret] ?? 0;
    const maxYaw = T.TURRET_YAW_RATE * dt;
    if (limited) {
      const d = wantYaw - cur;
      v.turretYaw[turret] = d > maxYaw ? cur + maxYaw : d < -maxYaw ? cur - maxYaw : wantYaw;
    } else {
      v.turretYaw[turret] = turnToward(cur, wantYaw, maxYaw);
    }
    // site
    let wantPitch = st.camPitch;
    wantPitch = wantPitch < def.pitchMin ? def.pitchMin : wantPitch > def.pitchMax ? def.pitchMax : wantPitch;
    const curP = v.turretPitch[turret] ?? 0;
    const maxP = T.TURRET_PITCH_RATE * dt;
    const dp = wantPitch - curP;
    v.turretPitch[turret] = dp > maxP ? curP + maxP : dp < -maxP ? curP - maxP : wantPitch;

    // tir : jet continu pour le canon à eau, coup par coup pour le lance-grenades
    if (def.kind === 'camera') return;
    const input = ctx.input;
    const wants = trigger !== undefined ? trigger : def.kind === 'canon_eau' ? input.down('primary') : input.pressed('primary');
    const now = ctx.clock.now;
    if (wants && now >= this.nextFire) {
      if (ctx.vehicles.fireTurret(v, turret, p.id)) this.nextFire = now + (def.interval > 0 ? def.interval : 0);
    }
  }

  /** Engin télépiloté : les commandes du joueur pilotent cet engin au lieu du personnage. */
  remote(v: Vehicle, st: PlayerState): void {
    const input = this.ctx.input;
    const cmd = v.cmd;
    if (!v.def.flying) {
      this.drive(v);
      return;
    }
    cmd.throttle = clampUnit(input.moveY);
    cmd.strafe = clampUnit(input.moveX);
    let lift = 0;
    if (input.down('jump')) lift += 1;
    if (input.down('crouch')) lift -= 1;
    if (input.device === 'gamepad') lift += input.throttle - input.brake;
    cmd.lift = clampUnit(lift);
    // rotation : l'engin s'aligne sur le cap de la caméra (steer > 0 = vers la droite = cap décroissant)
    cmd.steer = clampUnit(wrapAngle(v.heading - st.camYaw) * 2.5);
    cmd.brake = 0;
    cmd.handbrake = false;
    cmd.horn = false;
    if (!v.engineOn && v.state !== 'wrecked' && v.state !== 'burnt') v.engineOn = true;
    // nacelle : la caméra embarquée suit le site du regard
    const cam = v.def.turrets[0];
    if (cam && cam.kind === 'camera') {
      const pitch = st.camPitch;
      v.turretPitch[0] = pitch < cam.pitchMin ? cam.pitchMin : pitch > cam.pitchMax ? cam.pitchMax : pitch;
      v.turretYaw[0] = 0;
    }
  }
}

/** Première tourelle armée d'un véhicule (canon à eau, lance-grenades ; pas la caméra du mât). −1 si aucune. */
export function armedTurret(v: Vehicle): number {
  const t = v.def.turrets;
  for (let i = 0; i < t.length; i++) if (t[i]!.kind !== 'camera') return i;
  return -1;
}
