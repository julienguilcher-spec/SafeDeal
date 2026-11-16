/* =====================================================================================
 * Rig de caméra : lit l'état du joueur (ctx.player.state : cameraMode, camYaw, camPitch, zoom —
 * écrits par le contrôleur du joueur) et place la caméra pour chacun des neuf modes.
 *
 * Conventions attendues de PlayerState :
 *   - camYaw : cap ABSOLU dans le monde (rad), avant = (sin yaw, cos yaw) — comme Person.aimYaw ;
 *   - camPitch : site (rad), positif = regard vers le haut ;
 *   - zoom : zoom optique, 1 = champ normal (réglage « fov ») ; en vue tactique, il règle l'altitude.
 * Le calcul produit une pose (position + angles + champ), indépendante de Three.js, puis
 * l'applique à la caméra. Aucune allocation par image.
 * ===================================================================================== */

import type * as THREE from 'three';
import type { CameraMode, GameContext, Person, Vehicle } from '@/core/contracts';
import type { RenderCameraApi, TacticalView } from './api';
import {
  cameraSweep, copyPose, createPose, eyeHeight, seatIndexOf, seatedEyeOffset, shoulderPivotHeight, turretIndexOf, zoomedFov,
} from './cameraMath';
import type { CameraPose } from './cameraMath';
import { TAU, clamp, damp, lerp, lerpAngle, noise1, wrapAngle } from './util';

const PITCH_LIMIT = 1.52;
/** Durée du fondu entre deux modes (s). */
const BLEND_TIME = 0.24;
/** Vue tactique : inclinaison (quasi verticale) et hauteur pour un zoom de 1. */
const TACTICAL_PITCH = -1.36;
const TACTICAL_HEIGHT = 150;
/** Drone : pour camPitch = 0, la nacelle regarde déjà vers le bas. */
const DRONE_TILT = 0.6;
/** Téléobjectif : champ vertical pour un zoom de 1 (≈ 70 mm). */
const VIEWFINDER_FOV = 34;

class Tactical implements TacticalView {
  x = 0;
  z = 0;
  height = TACTICAL_HEIGHT;
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

export class CameraRig implements RenderCameraApi {
  readonly pose: CameraPose = createPose();
  readonly tactical = new Tactical();
  readonly free = { x: 0, y: 30, z: 0 };
  vehicleYawFollow = true;
  vehicleAutoCenter = true;
  headBob = 1;
  mode: CameraMode = 'tps';
  tpsDistance = 3.3;

  private readonly target: CameraPose = createPose();
  private readonly from: CameraPose = createPose();
  private blend = 1;
  private lastMode: CameraMode | '' = '';
  private lastPersonId = 0;
  private fresh = true;
  /** Hauteurs lissées (changement de posture). */
  private eyeH = 1.63;
  private pivotH = 1.55;
  /** Cycle de marche pour le balancement de la tête. */
  private bobPhase = 0;
  private bobAmount = 0;
  /** Suivi du véhicule. */
  private vehId = 0;
  private vehHeading = 0;
  private idleLook = 0;
  /** Distance lissée de la caméra de poursuite. */
  private chaseDistance = 8;
  /** Secousses. */
  private shakeAmp = 0;
  private shakeLeft = 0;
  private shakeTotal = 0;
  private time = 0;
  /** Vue d'attente (aucun personnage incarné). */
  private idleAngle = 0;
  private freePlaced = false;

  constructor(private readonly ctx: GameContext, private readonly camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  /** Secousse de caméra : `amount` 0..1 (au-delà : très violent), sur `seconds` secondes. */
  shake(amount: number, seconds: number): void {
    if (!(amount > 0) || !(seconds > 0)) return;
    const a = Math.min(amount, 2.5);
    // la plus forte l'emporte ; une secousse plus faible ne coupe pas la précédente
    const current = this.shakeTotal > 0 ? this.shakeAmp * (this.shakeLeft / this.shakeTotal) : 0;
    if (a >= current) {
      this.shakeAmp = a;
      this.shakeLeft = seconds;
      this.shakeTotal = seconds;
    }
  }

  cut(): void {
    this.fresh = true;
  }

  placeFree(x: number, y: number, z: number): void {
    this.free.x = x;
    this.free.y = y;
    this.free.z = z;
    this.freePlaced = true;
  }

  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    const e = this.camera.matrixWorldInverse.elements;
    const p = this.camera.projectionMatrix.elements;
    const vx = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    const vy = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    const vz = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    if (vz >= -1e-4) return false;
    out.x = (p[0]! * vx + p[8]! * vz) / -vz;
    out.y = (p[5]! * vy + p[9]! * vz) / -vz;
    return true;
  }

  /** Remise à zéro de session. */
  reset(): void {
    this.fresh = true;
    this.shakeLeft = 0;
    this.tactical.fresh = true;
    this.vehId = 0;
    this.lastPersonId = 0;
  }

  /** Calcule la pose de l'image et l'applique à la caméra. `aspect` : largeur / hauteur du rendu. */
  update(dt: number, baseFov: number, aspect: number): void {
    const ctx = this.ctx;
    const ps = ctx.player.state;
    this.time = (this.time + dt) % 3600;
    const person = this.person();
    const vehicle = this.vehicle(person);
    const mode = this.resolveMode(ps.cameraMode, person, vehicle);
    const t = this.target;
    t.roll = 0;

    // changement de personnage ou téléportation : coupe franche
    const personId = person ? person.id : 0;
    if (personId !== this.lastPersonId) {
      this.fresh = true;
      this.lastPersonId = personId;
    }

    this.followVehicle(mode, vehicle, dt);
    const yaw = ps.camYaw;
    const pitch = clamp(ps.camPitch, -PITCH_LIMIT, PITCH_LIMIT);
    const zoom = ps.zoom > 0.05 ? ps.zoom : 1;

    switch (mode) {
      case 'fps': this.poseFps(person, yaw, pitch, zoom, baseFov, dt, true, false); break;
      case 'viewfinder': this.poseFps(person, yaw, pitch, zoom, VIEWFINDER_FOV, dt, false, true); break;
      case 'tps': this.poseTps(person, yaw, pitch, zoom, baseFov, dt); break;
      case 'vehicle_ext': this.poseChase(vehicle, yaw, pitch, zoom, baseFov, dt); break;
      case 'vehicle_int': this.poseSeat(vehicle, person, yaw, pitch, zoom, baseFov); break;
      case 'turret': this.poseTurret(vehicle, person, yaw, pitch, zoom, baseFov); break;
      case 'drone': this.poseDrone(vehicle, person, yaw, pitch, zoom, baseFov); break;
      case 'tactical': this.poseTactical(person, yaw, zoom, dt); break;
      case 'free': this.poseFree(yaw, pitch, zoom, baseFov, dt); break;
    }

    // ── fondu entre deux modes (pas après une coupe, ni sur un grand saut) ──
    const pose = this.pose;
    if (this.fresh) {
      copyPose(pose, t);
      this.blend = 1;
    } else {
      if (mode !== this.lastMode) {
        const jump = Math.hypot(t.x - pose.x, t.y - pose.y, t.z - pose.z);
        if (jump < 40) {
          copyPose(this.from, pose);
          this.blend = 0;
        } else {
          this.blend = 1;
        }
      }
      if (this.blend < 1) {
        this.blend = Math.min(1, this.blend + dt / BLEND_TIME);
        const k = this.blend * this.blend * (3 - 2 * this.blend);
        const f = this.from;
        pose.x = lerp(f.x, t.x, k);
        pose.y = lerp(f.y, t.y, k);
        pose.z = lerp(f.z, t.z, k);
        pose.yaw = lerpAngle(f.yaw, t.yaw, k);
        pose.pitch = lerp(f.pitch, t.pitch, k);
        pose.roll = lerp(f.roll, t.roll, k);
        pose.fov = lerp(f.fov, t.fov, k);
        pose.near = t.near;
      } else {
        copyPose(pose, t);
      }
    }
    this.fresh = false;
    this.lastMode = mode;
    this.mode = mode;
    this.apply(dt, aspect);
  }

  // ───────────────────────────── modes ─────────────────────────────

  /** Yeux de la personne ; `bob` : léger balancement à la marche ; `sway` : tremblement du téléobjectif. */
  private poseFps(p: Person | null, yaw: number, pitch: number, zoom: number, fov: number, dt: number, bob: boolean, sway: boolean): void {
    const t = this.target;
    if (!p) {
      this.poseIdle(dt, fov);
      return;
    }
    const eye = eyeHeight(p);
    this.eyeH = this.fresh ? eye : this.eyeH + (eye - this.eyeH) * damp(10, dt);
    const speed = Math.hypot(p.vx, p.vz);
    // un cycle = deux pas ; la foulée s'allonge avec l'allure
    const stride = 1.45 + Math.min(speed, 6) * 0.22;
    this.bobPhase = (this.bobPhase + (speed * dt) / stride) % 1;
    const wanted = bob && p.posture === 'stand' ? clamp(speed / 1.5, 0, 1.5) * (p.alt ? 0.35 : 1) * this.headBob : 0;
    this.bobAmount += (wanted - this.bobAmount) * damp(8, dt);
    const a = this.bobAmount;
    const s1 = Math.sin(this.bobPhase * TAU);
    const s2 = Math.sin(this.bobPhase * TAU * 2);
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const side = s1 * 0.012 * a;
    // les yeux sont un peu en avant de l'axe du corps
    t.x = p.x + sinY * 0.09 - cosY * side;
    t.z = p.z + cosY * 0.09 + sinY * side;
    t.y = p.y + this.eyeH + s2 * 0.021 * a;
    t.yaw = yaw;
    t.pitch = pitch;
    t.roll = s1 * 0.0035 * a;
    if (sway) {
      // téléobjectif tenu à la main : un tremblement infime, que le grossissement rend sensible
      const amp = 0.0011 * Math.min(zoom, 8) / zoom;
      t.yaw += noise1(this.time * 1.3, 3) * amp;
      t.pitch += noise1(this.time * 1.1, 9) * amp;
    }
    t.fov = zoomedFov(fov, zoom);
    t.near = 0.1;
  }

  /** Par-dessus l'épaule droite, recul lissé, sans traverser les murs. */
  private poseTps(p: Person | null, yaw: number, pitch: number, zoom: number, fov: number, dt: number): void {
    const t = this.target;
    if (!p) {
      this.poseIdle(dt, fov);
      return;
    }
    const ctx = this.ctx;
    const ph = shoulderPivotHeight(p);
    this.pivotH = this.fresh ? ph : this.pivotH + (ph - this.pivotH) * damp(9, dt);
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const py = p.y + this.pivotH;
    // décalage d'épaule vers la droite (droite = (-cos yaw, sin yaw)), réduit si un mur est tout près
    let shoulder = 0.52;
    const sFree = cameraSweep(ctx, p.x, py, p.z, p.x - cosY * (shoulder + 0.25), py, p.z + sinY * (shoulder + 0.25), true);
    if (sFree < 1) shoulder = Math.max(0, sFree * (shoulder + 0.25) - 0.25);
    const ax = p.x - cosY * shoulder;
    const az = p.z + sinY * shoulder;
    const ay = py + 0.1;
    // recul voulu : il se resserre avec le zoom (visée)
    const wanted = clamp(3.3 / Math.sqrt(zoom), 1.1, 6);
    const bx = ax - sinY * cosP * wanted;
    const by = ay - sinP * wanted;
    const bz = az - cosY * cosP * wanted;
    let allowed = wanted;
    const free = cameraSweep(ctx, ax, ay, az, bx, by, bz, true);
    if (free < 1) allowed = Math.max(0.3, free * wanted - 0.32);
    // rapprochement immédiat devant un obstacle, recul progressif ensuite
    if (this.fresh || allowed < this.tpsDistance) this.tpsDistance = allowed;
    else this.tpsDistance += (allowed - this.tpsDistance) * damp(4.5, dt);
    const d = this.tpsDistance;
    t.x = ax - sinY * cosP * d;
    t.z = az - cosY * cosP * d;
    t.y = Math.max(ay - sinP * d, ctx.world.heightAt(t.x, t.z) + 0.22);
    t.yaw = yaw;
    t.pitch = pitch;
    t.fov = zoomedFov(fov * 0.88, zoom);
    t.near = 0.2;
  }

  /** Caméra de poursuite derrière le véhicule. */
  private poseChase(v: Vehicle | null, yaw: number, pitch: number, zoom: number, fov: number, dt: number): void {
    const t = this.target;
    if (!v) {
      this.poseIdle(dt, fov);
      return;
    }
    const ctx = this.ctx;
    const def = v.def;
    const speed = Math.abs(v.speed);
    const py = v.y + def.height * 0.78 + 0.55;
    const wanted = (def.length * 1.2 + 3.4 + Math.min(speed, 28) * 0.07) / Math.sqrt(zoom);
    // par défaut la caméra plonge légèrement vers le véhicule
    const pit = clamp(pitch - 0.2, -1.25, 0.45);
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const cosP = Math.cos(pit);
    const sinP = Math.sin(pit);
    const bx = v.x - sinY * cosP * wanted;
    const by = py - sinP * wanted;
    const bz = v.z - cosY * cosP * wanted;
    let allowed = wanted;
    // le rayon part du toit du véhicule ; les autres véhicules ne comptent pas (on heurterait le sien)
    const free = cameraSweep(ctx, v.x, py, v.z, bx, by, bz, false);
    if (free < 1) allowed = Math.max(def.length * 0.45, free * wanted - 0.4);
    if (this.fresh || allowed < this.chaseDistance) this.chaseDistance = allowed;
    else this.chaseDistance += (allowed - this.chaseDistance) * damp(3.5, dt);
    const d = this.chaseDistance;
    t.x = v.x - sinY * cosP * d;
    t.z = v.z - cosY * cosP * d;
    t.y = Math.max(py - sinP * d, ctx.world.heightAt(t.x, t.z) + 0.4);
    t.yaw = yaw;
    t.pitch = pit;
    // la vitesse ouvre un peu le champ
    t.fov = zoomedFov(fov * 0.88 + Math.min(speed, 30) * 0.22, zoom);
    t.near = 0.3;
  }

  /** Place du conducteur (ou du passager) : la tête à hauteur d'yeux au-dessus du siège. */
  private poseSeat(v: Vehicle | null, p: Person | null, yaw: number, pitch: number, zoom: number, fov: number): void {
    const t = this.target;
    if (!v) {
      this.poseFps(p, yaw, pitch, zoom, fov, 0, false, false);
      return;
    }
    const seat = seatIndexOf(v, p);
    const def = v.def;
    let sx = 0;
    let sy = def.height * 0.4;
    let sz = 0;
    if (seat >= 0) {
      const s = def.seats[seat]!;
      sx = s.x; sy = s.y; sz = s.z;
    }
    const eyeY = Math.min(sy + seatedEyeOffset(p), Math.max(sy + 0.3, def.height - 0.14));
    this.vehiclePoint(v, sx, eyeY, sz, t);
    this.vehicleTilt(v, yaw, pitch, t);
    t.fov = zoomedFov(fov, zoom);
    t.near = 0.1;
  }

  /** Poste de tir : la caméra est sur la tourelle et regarde où vise le joueur. */
  private poseTurret(v: Vehicle | null, p: Person | null, yaw: number, pitch: number, zoom: number, fov: number): void {
    const t = this.target;
    if (!v) {
      this.poseFps(p, yaw, pitch, zoom, fov, 0, false, false);
      return;
    }
    const ti = turretIndexOf(v, seatIndexOf(v, p));
    if (ti < 0) {
      // pas de tourelle : on se tient debout dans la trappe de toit
      this.vehiclePoint(v, 0, v.def.height + 0.45, 0, t);
    } else {
      const tu = v.def.turrets[ti]!;
      this.vehiclePoint(v, tu.x, tu.y + 0.32, tu.z, t);
    }
    // légèrement en avant de l'axe, pour voir par-dessus l'affût
    t.x += Math.sin(yaw) * 0.28;
    t.z += Math.cos(yaw) * 0.28;
    this.vehicleTilt(v, yaw, pitch, t);
    t.fov = zoomedFov(fov * 0.92, zoom);
    t.near = 0.15;
  }

  /** Drone : la caméra est sous l'appareil, regard plongeant. */
  private poseDrone(v: Vehicle | null, p: Person | null, yaw: number, pitch: number, zoom: number, fov: number): void {
    const t = this.target;
    const drone = this.findDrone(v, p);
    if (drone) {
      t.x = drone.x;
      t.y = drone.y - 0.14;
      t.z = drone.z;
    } else if (p) {
      // pas d'appareil en vol : point de vue stationnaire au-dessus du télépilote
      t.x = p.x;
      t.y = p.y + 45;
      t.z = p.z;
    } else {
      t.x = 0; t.y = 60; t.z = 0;
    }
    t.y = Math.max(t.y, this.ctx.world.heightAt(t.x, t.z) + 0.5);
    t.yaw = yaw;
    t.pitch = clamp(pitch - DRONE_TILT, -1.553, 0.3);
    t.fov = zoomedFov(fov * 0.9, zoom);
    t.near = 0.5;
  }

  /** Vue tactique : haute, presque verticale ; on la déplace et on change d'altitude avec le zoom. */
  private poseTactical(p: Person | null, yaw: number, zoom: number, dt: number): void {
    const t = this.target;
    const tac = this.tactical;
    const ctx = this.ctx;
    if (tac.fresh || this.lastMode !== 'tactical') {
      // à l'ouverture : centrée sur le joueur
      if (p) {
        tac.x = p.x;
        tac.z = p.z;
      }
      tac.sx = tac.x;
      tac.sz = tac.z;
      tac.sh = clamp(TACTICAL_HEIGHT / zoom, 25, 600);
      tac.fresh = false;
    }
    tac.height = clamp(TACTICAL_HEIGHT / zoom, 25, 600);
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    if (tac.inputPan && !ctx.ui.modal) {
      const input = ctx.input;
      const mx = input.moveX;
      const my = input.moveY;
      if (mx !== 0 || my !== 0) {
        const speed = tac.height * (input.down('sprint') ? 2.2 : 1) * dt;
        // avant = (sin yaw, cos yaw) ; droite = (-cos yaw, sin yaw)
        tac.x += (sinY * my - cosY * mx) * speed;
        tac.z += (cosY * my + sinY * mx) * speed;
      }
    }
    const b = ctx.world.bounds;
    if (b && b.maxX > b.minX && Number.isFinite(b.minX) && Number.isFinite(b.maxX)) {
      tac.x = clamp(tac.x, b.minX, b.maxX);
      tac.z = clamp(tac.z, b.minZ, b.maxZ);
    }
    const k = this.fresh ? 1 : damp(9, dt);
    tac.sx += (tac.x - tac.sx) * k;
    tac.sz += (tac.z - tac.sz) * k;
    tac.sh += (tac.height - tac.sh) * (this.fresh ? 1 : damp(7, dt));
    // la caméra recule un peu pour que le point visé soit au centre de l'écran
    const back = tac.sh / Math.tan(-TACTICAL_PITCH);
    t.x = tac.sx - sinY * back;
    t.z = tac.sz - cosY * back;
    t.y = ctx.world.heightAt(tac.sx, tac.sz) + tac.sh;
    t.yaw = yaw;
    t.pitch = TACTICAL_PITCH;
    t.fov = 42;
    t.near = Math.max(1, tac.sh * 0.02);
  }

  /** Vol libre (débogage) : on vole dans la direction du regard. */
  private poseFree(yaw: number, pitch: number, zoom: number, fov: number, dt: number): void {
    const t = this.target;
    const f = this.free;
    const ctx = this.ctx;
    if (this.lastMode !== 'free' && !this.freePlaced) {
      // on part de là où se trouve la caméra
      f.x = this.pose.x;
      f.y = this.pose.y;
      f.z = this.pose.z;
    }
    this.freePlaced = false;
    const input = ctx.input;
    const speed = (input.down('sprint') ? 60 : 14) * dt;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const cosP = Math.cos(pitch);
    const my = input.moveY;
    const mx = input.moveX;
    f.x += (sinY * cosP * my - cosY * mx) * speed;
    f.z += (cosY * cosP * my + sinY * mx) * speed;
    f.y += Math.sin(pitch) * my * speed;
    if (input.down('jump')) f.y += speed;
    if (input.down('crouch')) f.y -= speed;
    t.x = f.x;
    t.y = f.y;
    t.z = f.z;
    t.yaw = yaw;
    t.pitch = pitch;
    t.fov = zoomedFov(fov, zoom);
    t.near = 0.2;
  }

  /** Aucun personnage incarné (menu, chargement) : lent travelling circulaire au-dessus du point de départ. */
  private poseIdle(dt: number, fov: number): void {
    const t = this.target;
    const ctx = this.ctx;
    const cfg = ctx.session.config;
    const cx = cfg && typeof cfg.x === 'number' ? cfg.x : 0;
    const cz = cfg && typeof cfg.z === 'number' ? cfg.z : 0;
    this.idleAngle = (this.idleAngle + dt * 0.035) % TAU;
    const a = this.idleAngle;
    const r = 70;
    t.x = cx + Math.sin(a) * r;
    t.z = cz + Math.cos(a) * r;
    t.y = ctx.world.heightAt(cx, cz) + 34;
    // regard vers le centre
    t.yaw = a + Math.PI;
    t.pitch = -0.36;
    t.fov = fov * 0.8;
    t.near = 0.5;
  }

  // ───────────────────────────── aides ─────────────────────────────

  private person(): Person | null {
    const ctx = this.ctx;
    const p = ctx.player.person();
    if (p) return p;
    const id = ctx.player.state.personId;
    return id ? ctx.people.get(id) ?? null : null;
  }

  private vehicle(p: Person | null): Vehicle | null {
    const ctx = this.ctx;
    const v = ctx.player.vehicle();
    if (v) return v;
    return p && p.vehicleId ? ctx.vehicles.get(p.vehicleId) ?? null : null;
  }

  /** Le mode demandé, corrigé s'il est incohérent avec la situation (à pied / en véhicule). */
  private resolveMode(mode: CameraMode, p: Person | null, v: Vehicle | null): CameraMode {
    const riding = !!v && !v.def.flying && !!p && p.vehicleId === v.id;
    switch (mode) {
      case 'fps': return riding ? 'vehicle_int' : 'fps';
      case 'tps': return riding ? 'vehicle_ext' : 'tps';
      case 'vehicle_int': return v ? 'vehicle_int' : 'fps';
      case 'vehicle_ext': return v ? 'vehicle_ext' : 'tps';
      case 'turret': return v ? 'turret' : 'fps';
      default: return mode;
    }
  }

  /**
   * En véhicule, la caméra tourne avec lui : on reporte sa rotation sur PlayerState.camYaw (le
   * contrôleur continue d'y ajouter le mouvement de la souris). En vue extérieure, quand le joueur
   * ne regarde plus autour, la caméra revient doucement derrière le véhicule.
   */
  private followVehicle(mode: CameraMode, v: Vehicle | null, dt: number): void {
    const inVehicle = !!v && (mode === 'vehicle_ext' || mode === 'vehicle_int' || mode === 'turret');
    if (!inVehicle || !v) {
      this.vehId = 0;
      return;
    }
    const ps = this.ctx.player.state;
    if (this.vehId !== v.id) {
      this.vehId = v.id;
      this.vehHeading = v.heading;
      this.idleLook = 0;
      return;
    }
    const turn = wrapAngle(v.heading - this.vehHeading);
    this.vehHeading = v.heading;
    if (this.vehicleYawFollow && turn !== 0 && Math.abs(turn) < 1) ps.camYaw = wrapAngle(ps.camYaw + turn);
    if (mode !== 'vehicle_ext' || !this.vehicleAutoCenter) return;
    const input = this.ctx.input;
    if (input.lookX !== 0 || input.lookY !== 0) this.idleLook = 0;
    else this.idleLook += dt;
    if (this.idleLook > 1.4 && Math.abs(v.speed) > 1.5) {
      // derrière le véhicule en marche avant, devant lui en marche arrière soutenue
      const goal = v.speed < -2 ? v.heading + Math.PI : v.heading;
      const diff = wrapAngle(goal - ps.camYaw);
      const rate = Math.min(1, (this.idleLook - 1.4) * 0.8) * 2.2;
      ps.camYaw = wrapAngle(ps.camYaw + diff * damp(rate, dt));
      ps.camPitch += (0 - ps.camPitch) * damp(rate * 0.6, dt);
    }
  }

  /** Point exprimé dans le repère du véhicule (x = droite, y = haut, z = avant) → monde, dans la pose. */
  private vehiclePoint(v: Vehicle, lx: number, ly: number, lz: number, out: CameraPose): void {
    const s = Math.sin(v.heading);
    const c = Math.cos(v.heading);
    // avant = (sin h, cos h) ; droite = (-cos h, sin h)
    out.x = v.x + -c * lx + s * lz;
    out.z = v.z + s * lx + c * lz;
    out.y = v.y + ly;
  }

  /** Orientation à bord : celle du joueur, plus le tangage et le roulis du véhicule. */
  private vehicleTilt(v: Vehicle, yaw: number, pitch: number, out: CameraPose): void {
    const rel = yaw - v.heading;
    const c = Math.cos(rel);
    const s = Math.sin(rel);
    const k = 0.7;
    out.yaw = yaw;
    out.pitch = clamp(pitch + (v.pitch * c + v.roll * s) * k, -PITCH_LIMIT, PITCH_LIMIT);
    out.roll = (v.roll * c - v.pitch * s) * k;
  }

  /** Engin volant piloté : celui du joueur, sinon le drone le plus proche de lui. */
  private findDrone(v: Vehicle | null, p: Person | null): Vehicle | null {
    if (v && v.def.flying) return v;
    const list = this.ctx.vehicles.list;
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (!c.def.flying || c.dormant) continue;
      if (p) {
        for (let s = 0; s < c.seats.length; s++) if (c.seats[s] === p.id) return c;
      }
      const d = p ? (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z) : 0;
      // les drones avant les hélicoptères
      const score = d + (c.kind === 'drone' ? 0 : 1e9);
      if (score < bestD) {
        bestD = score;
        best = c;
      }
    }
    return best;
  }

  /** Reporte la pose (plus les secousses) sur la caméra Three.js. */
  private apply(dt: number, aspect: number): void {
    const cam = this.camera;
    const pose = this.pose;
    let x = pose.x;
    let y = pose.y;
    let z = pose.z;
    let yaw = pose.yaw;
    let pitch = pose.pitch;
    let roll = pose.roll;
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = Math.max(0, this.shakeLeft / this.shakeTotal);
      const a = this.shakeAmp * k * k;
      const tt = this.time * 31;
      // le champ étroit d'un téléobjectif amplifie les secousses : on les ramène au champ
      const f = Math.min(1, pose.fov / 60);
      yaw += noise1(tt, 1) * 0.022 * a * f;
      pitch += noise1(tt, 2) * 0.02 * a * f;
      roll += noise1(tt * 0.8, 3) * 0.028 * a * f;
      x += noise1(tt, 4) * 0.05 * a;
      y += noise1(tt, 5) * 0.05 * a;
      z += noise1(tt, 6) * 0.05 * a;
    }
    cam.position.set(x, y, z);
    // une caméra Three.js regarde vers -z : cap h ⇒ rotation.y = h + π ; ordre YXZ = cap, site, roulis
    cam.rotation.set(pitch, yaw + Math.PI, -roll);
    let changed = false;
    if (Math.abs(cam.fov - pose.fov) > 0.01) {
      cam.fov = pose.fov;
      changed = true;
    }
    if (Math.abs(cam.near - pose.near) > 1e-4) {
      cam.near = pose.near;
      changed = true;
    }
    if (aspect > 0 && Math.abs(cam.aspect - aspect) > 1e-5) {
      cam.aspect = aspect;
      changed = true;
    }
    if (changed) cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
}
