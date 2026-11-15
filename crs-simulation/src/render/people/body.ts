/* Corps de base : segments arrondis (tête, cou, torse, bassin, bras, avant-bras, mains, cuisses, jambes,
 * pieds) lofés autour de chaque os. Gabarit d'un adulte de 1,75 m ; la tête mesure 1/7,5 de la taille. */

import {
  GeoBuilder, SCALE_HEAD, SCALE_LIMB, SCALE_UNIFORM,
  SLOT_BOTTOM, SLOT_FACELOW, SLOT_FIXED, SLOT_HAIR, SLOT_HAND, SLOT_HEADTOP, SLOT_SHIN, SLOT_SHOES,
  SLOT_SKIN, SLOT_SLEEVE, SLOT_TOP, SLOT_TORSO, type Ring,
} from './geo';
import {
  BONE_ARM_L, BONE_ARM_R, BONE_CHEST, BONE_FOOT_L, BONE_FOOT_R, BONE_FORE_L, BONE_FORE_R, BONE_HAND_L,
  BONE_HAND_R, BONE_HEAD, BONE_NECK, BONE_PELVIS, BONE_SHIN_L, BONE_SHIN_R, BONE_SPINE, BONE_THIGH_L,
  BONE_THIGH_R,
} from './skeleton';
import { PART_BASE, PART_HAND_L_FIST, PART_HAND_L_OPEN, PART_HAND_R_FIST, PART_HAND_R_OPEN } from './parts';

// Profils [y, rx, rz, oz, ox, détailMin] — détailMin : 2 = tous niveaux, 1 = proche et moyen, 0 = proche seul.
export const PELVIS_RINGS: Ring[] = [
  [-0.128, 0.060, 0.055, 0, 0, 1],
  [-0.092, 0.150, 0.098, -0.005, 0, 2],
  [-0.030, 0.172, 0.112, -0.008, 0, 1],
  [0.040, 0.166, 0.108, -0.004, 0, 0],
  [0.100, 0.152, 0.100, 0, 0, 2],
];
export const ABDOMEN_RINGS: Ring[] = [
  [-0.035, 0.150, 0.099, 0, 0, 2],
  [0.050, 0.146, 0.100, 0.004, 0, 0],
  [0.165, 0.158, 0.106, 0.006, 0, 2],
];
export const CHEST_RINGS: Ring[] = [
  [-0.030, 0.157, 0.105, 0.006, 0, 2],
  [0.070, 0.172, 0.117, 0.010, 0, 1],
  [0.160, 0.180, 0.114, 0.004, 0, 2],
  [0.215, 0.176, 0.098, -0.004, 0, 1],
  [0.252, 0.132, 0.080, -0.012, 0, 2],
  [0.275, 0.062, 0.058, -0.016, 0, 1],
];
const NECK_RINGS: Ring[] = [
  [-0.03, 0.055, 0.057, 0, 0, 2],
  [0.10, 0.050, 0.054, 0.006, 0, 2],
];
export const HEAD_RINGS: Ring[] = [
  [-0.030, 0.026, 0.026, 0.052, 0, 1],
  [-0.012, 0.050, 0.060, 0.024, 0, 2],
  [0.022, 0.064, 0.080, 0.010, 0, 0],
  [0.065, 0.073, 0.091, 0.003, 0, 2],
  [0.110, 0.0765, 0.096, 0.000, 0, 1],
  [0.155, 0.072, 0.090, -0.003, 0, 2],
  [0.188, 0.054, 0.068, -0.005, 0, 1],
  [0.204, 0.026, 0.034, -0.006, 0, 2],
];
const UPPER_ARM_RINGS: Ring[] = [
  [0.042, 0.018, 0.020, 0, -0.008, 1],
  [0.026, 0.043, 0.047, 0, -0.006, 2],
  [-0.020, 0.053, 0.057, 0, 0, 1],
  [-0.100, 0.049, 0.053, 0, 0, 0],
  [-0.200, 0.042, 0.045, 0, 0, 1],
  [-0.285, 0.037, 0.039, 0, 0, 2],
  [-0.310, 0.020, 0.022, 0, 0, 1],
];
const FOREARM_RINGS: Ring[] = [
  [0.028, 0.020, 0.022, 0, 0, 1],
  [0.000, 0.038, 0.040, 0, 0, 2],
  [-0.060, 0.041, 0.044, 0, 0, 1],
  [-0.160, 0.033, 0.036, 0, 0, 0],
  [-0.255, 0.0255, 0.030, 0, 0, 2],
  [-0.272, 0.012, 0.014, 0, 0, 1],
];
const THIGH_RINGS: Ring[] = [
  [0.045, 0.045, 0.050, 0, 0, 1],
  [0.000, 0.086, 0.092, 0, 0, 2],
  [-0.100, 0.084, 0.090, -0.004, 0, 1],
  [-0.260, 0.068, 0.073, 0, 0, 0],
  [-0.400, 0.054, 0.057, 0, 0, 1],
  [-0.430, 0.052, 0.055, 0, 0, 2],
  [-0.460, 0.030, 0.030, 0, 0, 1],
];
const SHIN_RINGS: Ring[] = [
  [0.030, 0.030, 0.030, 0, 0, 1],
  [0.000, 0.052, 0.055, 0, 0, 2],
  [-0.100, 0.052, 0.058, -0.010, 0, 1],
  [-0.240, 0.041, 0.045, -0.004, 0, 0],
  [-0.360, 0.034, 0.038, 0, 0, 1],
  [-0.410, 0.036, 0.040, 0, 0, 2],
];
// chaussure : lofée le long de +Z (talon → pointe) après une rotation de 90° autour de X
const SHOE_RINGS: Ring[] = [
  [-0.070, 0.030, 0.034, 0.042, 0, 1],
  [-0.045, 0.044, 0.042, 0.038, 0, 2],
  [0.020, 0.047, 0.040, 0.040, 0, 1],
  [0.090, 0.050, 0.028, 0.050, 0, 2],
  [0.160, 0.046, 0.019, 0.059, 0, 1],
  [0.192, 0.028, 0.013, 0.065, 0, 2],
];
const HAND_OPEN_RINGS: Ring[] = [
  [0.000, 0.021, 0.027, 0, 0, 2],
  [-0.040, 0.0175, 0.043, 0.002, 0, 2],
  [-0.095, 0.0165, 0.046, 0.004, -0.002, 2],
  [-0.145, 0.0145, 0.043, 0.004, -0.010, 2],
  [-0.176, 0.0120, 0.036, 0.004, -0.018, 2],
  [-0.186, 0.0070, 0.022, 0.004, -0.021, 2],
];
const HAND_FIST_RINGS: Ring[] = [
  [0.000, 0.021, 0.027, 0, 0, 2],
  [-0.035, 0.024, 0.042, 0.002, -0.004, 2],
  [-0.085, 0.031, 0.046, 0.002, -0.012, 2],
  [-0.115, 0.027, 0.040, 0.002, -0.014, 2],
  [-0.127, 0.012, 0.020, 0.002, -0.012, 2],
];
const HAND_SIMPLE_RINGS: Ring[] = [
  [0.000, 0.021, 0.027, 0, 0, 2],
  [-0.060, 0.020, 0.041, 0.002, -0.004, 2],
  [-0.140, 0.015, 0.034, 0.003, -0.010, 2],
];

/** Membre gauche (side = 1) ou droit (side = -1, géométrie en miroir). */
function limbs(b: GeoBuilder, side: number): void {
  const L = side > 0;
  const rl = b.rad(12, 7, 5);
  b.push();
  if (!L) b.scale(-1, 1, 1);
  // bras
  b.ctx(L ? BONE_ARM_L : BONE_ARM_R, b.detail === 2 ? SLOT_TORSO : SLOT_TOP, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(UPPER_ARM_RINGS, rl);
  b.ctx(L ? BONE_FORE_L : BONE_FORE_R, SLOT_SLEEVE, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(FOREARM_RINGS, rl);
  // main
  const hb = L ? BONE_HAND_L : BONE_HAND_R;
  if (b.detail === 0) {
    b.ctx(hb, SLOT_HAND, L ? PART_HAND_L_OPEN : PART_HAND_R_OPEN, SCALE_UNIFORM).shade(1, 0.7);
    b.loft(HAND_OPEN_RINGS, 8, { power: 2.6 });
    b.cyl(-0.006, -0.040, 0.036, -0.020, -0.100, 0.060, 0.0115, 0.0085, 6);
    b.ctx(hb, SLOT_HAND, L ? PART_HAND_L_FIST : PART_HAND_R_FIST, SCALE_UNIFORM).shade(1, 0.7);
    b.loft(HAND_FIST_RINGS, 8, { power: 2.8 });
    b.cyl(-0.012, -0.050, 0.046, -0.040, -0.098, 0.022, 0.012, 0.010, 6);
  } else {
    b.ctx(hb, SLOT_HAND, PART_BASE, SCALE_UNIFORM).shade(1, 0.7);
    b.loft(HAND_SIMPLE_RINGS, b.rad(8, 5, 4), { power: 2.4 });
  }
  // jambe
  b.ctx(L ? BONE_THIGH_L : BONE_THIGH_R, SLOT_BOTTOM, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(THIGH_RINGS, rl);
  b.ctx(L ? BONE_SHIN_L : BONE_SHIN_R, SLOT_SHIN, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(SHIN_RINGS, rl);
  // pied
  b.ctx(L ? BONE_FOOT_L : BONE_FOOT_R, SLOT_SHOES, PART_BASE, SCALE_UNIFORM).shade(1, 0.55);
  b.push().rotX(Math.PI / 2);
  b.loft(SHOE_RINGS, b.rad(10, 6, 4), { power: 2.6 });
  b.pop();
  b.pop();
}

function face(b: GeoBuilder): void {
  // nez, oreilles, yeux, sourcils, bouche : uniquement au niveau de détail proche
  b.ctx(BONE_HEAD, SLOT_SKIN, PART_BASE, SCALE_HEAD).shade(0.97, 0.6);
  b.ellipsoid(0, 0.058, 0.097, 0.0115, 0.021, 0.015, 6, 4);
  b.ellipsoid(0.0765, 0.075, -0.008, 0.008, 0.026, 0.016, 6, 4);
  b.ellipsoid(-0.0765, 0.075, -0.008, 0.008, 0.026, 0.016, 6, 4);
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_BASE, SCALE_HEAD).tint(0x1a1512, 0.35);
  b.ellipsoid(0.031, 0.088, 0.0855, 0.0105, 0.0055, 0.006, 6, 4);
  b.ellipsoid(-0.031, 0.088, 0.0855, 0.0105, 0.0055, 0.006, 6, 4);
  b.ctx(BONE_HEAD, SLOT_HAIR, PART_BASE, SCALE_HEAD).shade(0.75, 0.9);
  b.push().translate(0.031, 0.1035, 0.0875).rotZ(-0.10);
  b.box(0, 0, 0, 0.030, 0.006, 0.008);
  b.pop();
  b.push().translate(-0.031, 0.1035, 0.0875).rotZ(0.10);
  b.box(0, 0, 0, 0.030, 0.006, 0.008);
  b.pop();
  b.ctx(BONE_HEAD, SLOT_SKIN, PART_BASE, SCALE_HEAD).shade(0.62, 0.6);
  b.box(0, 0.022, 0.0815, 0.036, 0.005, 0.006);
}

/** Corps de base complet pour le niveau de détail du constructeur. */
export function buildBody(b: GeoBuilder): void {
  const rt = b.rad(16, 8, 6);
  const far = b.detail === 2;
  // bassin, abdomen, thorax
  b.ctx(BONE_PELVIS, SLOT_BOTTOM, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(PELVIS_RINGS, rt, { power: 2.4 });
  b.ctx(BONE_SPINE, far ? SLOT_TORSO : SLOT_TOP, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(ABDOMEN_RINGS, rt, { power: 2.4, capStart: false, capEnd: false });
  b.ctx(BONE_CHEST, far ? SLOT_TORSO : SLOT_TOP, PART_BASE, SCALE_LIMB).shade(1, 0.95);
  b.loft(CHEST_RINGS, rt, { power: 2.3, capStart: false });
  // cou et tête
  b.ctx(BONE_NECK, far ? SLOT_FACELOW : SLOT_SKIN, PART_BASE, SCALE_UNIFORM).shade(0.96, 0.6);
  b.loft(NECK_RINGS, b.rad(10, 6, 4), { capStart: false, capEnd: false });
  if (far) {
    // silhouette : bas du visage et dessus de tête de couleurs distinctes (peau / cheveux ou casque)
    b.ctx(BONE_HEAD, SLOT_FACELOW, PART_BASE, SCALE_HEAD).shade(1, 0.6);
    b.loft([[-0.028, 0.034, 0.040, 0.03], [0.02, 0.066, 0.082, 0.008], [0.085, 0.080, 0.098, 0.0]], 6, { capEnd: false });
    b.ctx(BONE_HEAD, SLOT_HEADTOP, PART_BASE, SCALE_HEAD).shade(1, 0.7);
    b.loft([[0.085, 0.084, 0.102, -0.004], [0.165, 0.080, 0.097, -0.004], [0.215, 0.036, 0.046, -0.006]], 6, { capStart: false });
  } else {
    b.ctx(BONE_HEAD, SLOT_SKIN, PART_BASE, SCALE_HEAD).shade(1, 0.6);
    b.loft(HEAD_RINGS, b.rad(14, 8, 6));
    if (b.detail === 0) face(b);
  }
  limbs(b, 1);
  limbs(b, -1);
}
