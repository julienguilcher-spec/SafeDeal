/* Squelette procédural des personnages : 17 os rigides, proportions d'un adulte de 1,75 m.
 * Repère du modèle : +Z = avant (regard), +Y = haut, +X = GAUCHE du personnage.
 * Au repos (debout, bras le long du corps) tous les repères d'os sont alignés sur le modèle :
 * les membres s'étendent vers -Y depuis leur articulation, le tronc et la tête vers +Y. */

export const BONE_PELVIS = 0;
export const BONE_SPINE = 1;
export const BONE_CHEST = 2;
export const BONE_NECK = 3;
export const BONE_HEAD = 4;
export const BONE_ARM_L = 5;
export const BONE_FORE_L = 6;
export const BONE_HAND_L = 7;
export const BONE_ARM_R = 8;
export const BONE_FORE_R = 9;
export const BONE_HAND_R = 10;
export const BONE_THIGH_L = 11;
export const BONE_SHIN_L = 12;
export const BONE_FOOT_L = 13;
export const BONE_THIGH_R = 14;
export const BONE_SHIN_R = 15;
export const BONE_FOOT_R = 16;
export const BONE_COUNT = 17;

/** Parent de chaque os (-1 = racine). Les parents précèdent toujours leurs enfants. */
export const BONE_PARENT: readonly number[] = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];

/** Taille de référence du gabarit (m). L'échelle d'une personne vaut look.height / REF_HEIGHT. */
export const REF_HEIGHT = 1.75;

/** Hauteur du centre du bassin au repos (échelle 1). */
export const PELVIS_Y = 0.94;
export const HIP_X = 0.092;
export const HIP_DROP = 0.02;
export const L_THIGH = 0.43;
export const L_SHIN = 0.41;
export const ANKLE_H = 0.08;
export const SHOULDER_X = 0.185;
export const SHOULDER_Y = 0.215;
export const SHOULDER_Z = -0.005;
export const L_UPPER = 0.285;
export const L_FORE = 0.255;
/** Distance poignet → centre de la paume (point de prise des objets). */
export const PALM = 0.085;

/** Décalage de chaque os par rapport à son parent (échelle 1, carrure 1) : x, y, z. */
export const BONE_OFFSET: readonly number[] = [
  0, PELVIS_Y, 0,                          // bassin (par rapport au sol)
  0, 0.10, -0.005,                         // lombaires
  0, 0.15, 0,                              // thorax
  0, 0.27, -0.015,                         // cou
  0, 0.085, 0.01,                          // tête (base du crâne)
  SHOULDER_X, SHOULDER_Y, SHOULDER_Z,      // bras gauche
  0, -L_UPPER, 0,                          // avant-bras gauche
  0, -L_FORE, 0,                           // main gauche
  -SHOULDER_X, SHOULDER_Y, SHOULDER_Z,     // bras droit
  0, -L_UPPER, 0,
  0, -L_FORE, 0,
  HIP_X, -HIP_DROP, 0,                     // cuisse gauche
  0, -L_THIGH, 0,                          // jambe gauche
  0, -L_SHIN, 0,                           // pied gauche
  -HIP_X, -HIP_DROP, 0,                    // cuisse droite
  0, -L_THIGH, 0,
  0, -L_SHIN, 0,
];

/** Repères utiles dans le repère du thorax (échelle 1) pour placer les mains. */
export const CHEST_MOUTH_Y = 0.378;
export const CHEST_MOUTH_Z = 0.095;
export const CHEST_EYE_Y = 0.445;
export const CHEST_EYE_Z = 0.085;

/** Taille d'une pose locale : 17 quaternions + position du bassin (x, y, z à l'échelle 1). */
export const LOCAL_SIZE = BONE_COUNT * 4 + 3;
/** Taille d'une pose finale par os dans la texture : quaternion (4) + position (3) + libre (1). */
export const BONE_STRIDE = 8;
