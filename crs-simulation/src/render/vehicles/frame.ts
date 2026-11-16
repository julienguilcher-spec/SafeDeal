/* Repères du rendu des véhicules — logique pure, sans Three.js ni DOM (testée sous Node).
 *
 * Trois repères coexistent :
 *   1. « véhicule » (contrat SeatDef / TurretDef) : x = vers la DROITE, y = haut, z = vers l'avant ;
 *   2. « Three local » : celui du maillage, qui regarde +z avec object.rotation.y = cap. L'axe +x local
 *      y est la GAUCHE du véhicule : x_three = −x_véhicule ;
 *   3. « monde » : x = est, y = haut, z = sud ; avant = (sin h, cos h), droite = (−cos h, sin h).
 *
 * Assiette (même convention que le rendu des personnages) : Vehicle.pitch > 0 = nez levé,
 * Vehicle.roll > 0 = penché vers la droite. Côté Three, ordre des rotations Y (cap), X, Z :
 *   rotation.y = cap, rotation.x = −pitch, rotation.z = +roll.
 *
 * Angles de commande : steerAngle > 0 = roues braquées à DROITE, turretYaw > 0 = tourelle tournée vers
 * la DROITE, turretPitch > 0 = canon levé. Dans le repère Three local, une rotation positive autour de
 * +y amène +z vers +x (la gauche) : il faut donc inverser le signe (voir steerToThree, etc.).
 */

import type { SeatDef, TurretDef, Vec3 } from '@/core/contracts';

const TAU = Math.PI * 2;

/** Position d'un point du repère « véhicule » dans le repère Three local. */
export function vehicleToThreeLocal(vx: number, vy: number, vz: number, out: Vec3): Vec3 {
  out.x = -vx;
  out.y = vy;
  out.z = vz;
  return out;
}

/** Siège (contrat) → repère Three local du maillage. Un siège à droite (x > 0) a un x local négatif. */
export function seatToThreeLocal(seat: SeatDef, out: Vec3): Vec3 {
  return vehicleToThreeLocal(seat.x, seat.y, seat.z, out);
}

/** Tourelle (contrat) → repère Three local du maillage. */
export function turretToThreeLocal(turret: TurretDef, out: Vec3): Vec3 {
  return vehicleToThreeLocal(turret.x, turret.y, turret.z, out);
}

/** Angle de braquage du contrat (positif = droite) → rotation autour de +y dans le repère Three local. */
export function steerToThree(steerAngle: number): number {
  return -steerAngle;
}

/** Gisement de tourelle du contrat (positif = droite) → rotation autour de +y dans le repère Three local. */
export function turretYawToThree(yaw: number): number {
  return -yaw;
}

/** Site de tourelle du contrat (positif = canon levé) → rotation autour de +x dans le repère Three local. */
export function turretPitchToThree(pitch: number): number {
  return -pitch;
}

/**
 * Matrice 4×4 (ordre colonne, comme THREE.Matrix4.elements) d'un véhicule : translation · Ry(cap) ·
 * Rx(−pitch) · Rz(roll). Écrit 16 nombres dans `out` à partir de `offset`. Aucune allocation.
 */
export function composeVehicleMatrix(
  out: Float32Array | number[], offset: number,
  x: number, y: number, z: number, heading: number, pitch: number, roll: number,
): void {
  const cy = Math.cos(heading), sy = Math.sin(heading);
  const cx = Math.cos(-pitch), sx = Math.sin(-pitch);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  // R = Ry · Rx · Rz
  out[offset] = cy * cz + sy * sx * sz;
  out[offset + 1] = cx * sz;
  out[offset + 2] = -sy * cz + cy * sx * sz;
  out[offset + 3] = 0;
  out[offset + 4] = -cy * sz + sy * sx * cz;
  out[offset + 5] = cx * cz;
  out[offset + 6] = sy * sz + cy * sx * cz;
  out[offset + 7] = 0;
  out[offset + 8] = sy * cx;
  out[offset + 9] = -sx;
  out[offset + 10] = cy * cx;
  out[offset + 11] = 0;
  out[offset + 12] = x;
  out[offset + 13] = y;
  out[offset + 14] = z;
  out[offset + 15] = 1;
}

/** Applique une matrice 4×4 (ordre colonne) à un point du repère Three local. */
export function transformPoint(m: Float32Array | number[], offset: number, lx: number, ly: number, lz: number, out: Vec3): Vec3 {
  out.x = m[offset]! * lx + m[offset + 4]! * ly + m[offset + 8]! * lz + m[offset + 12]!;
  out.y = m[offset + 1]! * lx + m[offset + 5]! * ly + m[offset + 9]! * lz + m[offset + 13]!;
  out.z = m[offset + 2]! * lx + m[offset + 6]! * ly + m[offset + 10]! * lz + m[offset + 14]!;
  return out;
}

/** Applique seulement la rotation d'une matrice 4×4 (ordre colonne) à une direction. */
export function transformDir(m: Float32Array | number[], offset: number, lx: number, ly: number, lz: number, out: Vec3): Vec3 {
  out.x = m[offset]! * lx + m[offset + 4]! * ly + m[offset + 8]! * lz;
  out.y = m[offset + 1]! * lx + m[offset + 5]! * ly + m[offset + 9]! * lz;
  out.z = m[offset + 2]! * lx + m[offset + 6]! * ly + m[offset + 10]! * lz;
  return out;
}

const scratch = new Float32Array(16);

/** Pose minimale d'un véhicule (sous-ensemble de Vehicle) utilisée par les conversions. */
export interface VehiclePose {
  x: number; y: number; z: number; heading: number; pitch: number; roll: number;
}

/**
 * Point du repère « véhicule » (x droite, y haut, z avant) → monde, assiette comprise.
 * À plat (pitch = roll = 0), équivaut à position + droite·x + avant·z avec droite = (−cos h, sin h).
 */
export function vehiclePointToWorld(v: VehiclePose, vx: number, vy: number, vz: number, out: Vec3): Vec3 {
  composeVehicleMatrix(scratch, 0, v.x, v.y, v.z, v.heading, v.pitch, v.roll);
  return transformPoint(scratch, 0, -vx, vy, vz, out);
}

/** Position monde d'un siège. */
export function seatWorldPosition(v: VehiclePose, seat: SeatDef, out: Vec3): Vec3 {
  return vehiclePointToWorld(v, seat.x, seat.y, seat.z, out);
}

/** Hauteur des yeux d'un occupant assis au-dessus de l'assise (m) : même hypothèse que l'habitacle. */
export const EYE_ABOVE_SEAT = 0.72;
/** Avancée des yeux par rapport au point d'assise (m). */
export const EYE_AHEAD_OF_SEAT = 0.06;

/** Point de vue du conducteur ou d'un passager (monde) : sert à placer la caméra intérieure. */
export function seatEyeWorld(v: VehiclePose, seat: SeatDef, out: Vec3): Vec3 {
  return vehiclePointToWorld(v, seat.x, seat.y + EYE_ABOVE_SEAT, seat.z + EYE_AHEAD_OF_SEAT, out);
}

/**
 * Direction du canon d'une tourelle dans le repère « véhicule » (x droite, y haut, z avant) pour un
 * gisement et un site donnés : gisement 0 = vers l'avant, +π/2 = vers la droite ; site > 0 = vers le haut.
 */
export function turretDirVehicle(yaw: number, pitch: number, out: Vec3): Vec3 {
  const cp = Math.cos(pitch);
  out.x = Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = Math.cos(yaw) * cp;
  return out;
}

/** Direction monde du canon d'une tourelle (assiette du véhicule comprise). */
export function turretDirWorld(v: VehiclePose, yaw: number, pitch: number, out: Vec3): Vec3 {
  turretDirVehicle(yaw, pitch, out);
  composeVehicleMatrix(scratch, 0, 0, 0, 0, v.heading, v.pitch, v.roll);
  return transformDir(scratch, 0, -out.x, out.y, out.z, out);
}

/** Véhicule vu par les conversions de tourelle (sous-ensemble de Vehicle). */
export interface TurretCarrier extends VehiclePose {
  turretYaw: readonly number[];
  turretPitch: readonly number[];
  def: { turrets: readonly TurretDef[] };
}

/** Hauteur du tourillon du lance-grenades au-dessus du pivot de tourelle (même valeur que le modèle). */
export const LAUNCHER_TRUNNION = 0.42;

/**
 * Bouche du canon d'une tourelle (monde) et direction de tir (unitaire), assiette comprise. La longueur du
 * canon dépend de l'équipement : lance du canon à eau 1,02 m, berceau du lance-grenades 0,36 m.
 */
export function turretMuzzleWorld(v: TurretCarrier, turret: number, outPos: Vec3, outDir: Vec3): boolean {
  const td = v.def.turrets[turret];
  if (!td) return false;
  const yaw = v.turretYaw[turret] ?? 0, pitch = v.turretPitch[turret] ?? 0;
  turretDirWorld(v, yaw, pitch, outDir);
  const reach = td.kind === 'canon_eau' ? 1.02 : td.kind === 'lance_grenades' ? 0.36 : 0.2;
  const lift = td.kind === 'lance_grenades' ? LAUNCHER_TRUNNION : 0;
  vehiclePointToWorld(v, td.x, td.y + lift, td.z, outPos);
  outPos.x += outDir.x * reach;
  outPos.y += outDir.y * reach;
  outPos.z += outDir.z * reach;
  return true;
}

/**
 * Rotation d'un point autour de l'axe +x du repère Three local (essieu) : angle > 0 fait avancer le haut
 * de la roue vers +z (marche avant). Même formule que le shader.
 */
export function rotateAboutX(y: number, z: number, angle: number, out: { y: number; z: number }): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.y = y * c - z * s;
  out.z = y * s + z * c;
}

/** Rotation d'un point autour de l'axe +y du repère Three local : angle > 0 amène +z vers +x (la gauche). */
export function rotateAboutY(x: number, z: number, angle: number, out: { x: number; z: number }): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.x = x * c + z * s;
  out.z = -x * s + z * c;
}

/** Fait tourner la roue de la distance parcourue : angle (rad) ramené dans [0, 2π). */
export function advanceWheelAngle(angle: number, speed: number, dt: number, radius: number): number {
  if (!(radius > 1e-4)) return angle;
  let a = angle + (speed * dt) / radius;
  a %= TAU;
  if (a < 0) a += TAU;
  return a;
}

/** Angle du volant (rad) pour un braquage de roues donné : démultiplication typique, bornée à 1,25 tour. */
export function steeringWheelAngle(steerAngle: number, ratio = 14): number {
  const a = steerAngle * ratio;
  const max = Math.PI * 2.5;
  return a > max ? max : a < -max ? -max : a;
}

/** Table de conversion sRGB (0..255) → linéaire (0..1), pour écrire les couleurs d'instance sans allocation. */
export const SRGB_TO_LINEAR: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/** Compacte deux niveaux 0..1 en un flottant (16 niveaux chacun) : lo + 16·hi. Décodé par le shader. */
export function pack2(lo: number, hi: number): number {
  const a = lo <= 0 ? 0 : lo >= 1 ? 15 : Math.round(lo * 15);
  const b = hi <= 0 ? 0 : hi >= 1 ? 15 : Math.round(hi * 15);
  return a + 16 * b;
}

/** Compacte quatre niveaux 0..1 (16 niveaux chacun) en un flottant exact (16 bits). */
export function pack4(a: number, b: number, c: number, d: number): number {
  return pack2(a, b) + 256 * pack2(c, d);
}
