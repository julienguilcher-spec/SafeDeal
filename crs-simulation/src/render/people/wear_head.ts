/* Coiffures et couvre-chefs (os de la tête). Aucune pièce au niveau « silhouette » : la couleur du dessus
 * de tête suffit alors à distinguer un casque d'une chevelure. */

import {
  GeoBuilder, SCALE_HEAD, SLOT_BAND, SLOT_COVER, SLOT_FIXED, SLOT_GEAR, SLOT_HAIR, SLOT_TOP, TEXT_BACK,
  type Ring,
} from './geo';
import { BONE_HEAD } from './skeleton';
import {
  PART_BALACLAVA, PART_BEANIE, PART_BEARD, PART_CALOT, PART_CAP, PART_CAP_POLICE, PART_CROSS, PART_FACE_COVER,
  PART_GAS_MASK, PART_GOGGLES, PART_HAIR_AFRO, PART_HAIR_BUN, PART_HAIR_BUZZ, PART_HAIR_LONG, PART_HAIR_MEDIUM,
  PART_HAIR_PONYTAIL, PART_HAIR_SHORT, PART_HELMET_LIGHT, PART_HELMET_MO, PART_HELMET_MOTO, PART_HELMET_POMPIER,
  PART_HELMET_STRIPES, PART_HELMET_TEXT, PART_HOOD_UP,
} from './parts';

const HAIR_SHORT: Ring[] = [
  [0.030, 0.062, 0.070, -0.030, 0, 1],
  [0.085, 0.0805, 0.092, -0.015, 0, 2],
  [0.125, 0.0835, 0.1005, -0.006, 0, 1],
  [0.165, 0.079, 0.097, -0.004, 0, 2],
  [0.198, 0.060, 0.075, -0.005, 0, 1],
  [0.2155, 0.030, 0.040, -0.006, 0, 2],
];

function hair(b: GeoBuilder): void {
  const r = b.rad(14, 8, 6);
  const h = (part: number): void => { b.ctx(BONE_HEAD, SLOT_HAIR, part, SCALE_HEAD).shade(1, 0.85); };
  // 0 : rasé (ombre de cheveux très courte)
  h(PART_HAIR_BUZZ);
  b.shade(0.9, 0.8);
  b.loft([[0.060, 0.072, 0.082, -0.016], [0.105, 0.0775, 0.094, -0.008], [0.155, 0.0735, 0.0915, -0.004], [0.190, 0.0555, 0.070, -0.005], [0.2065, 0.028, 0.037, -0.006]], r, { capStart: false });
  // 1 : court
  h(PART_HAIR_SHORT);
  b.loft(HAIR_SHORT, r, { capStart: false });
  // 2 : mi-long (couvre les oreilles)
  h(PART_HAIR_MEDIUM);
  b.loft([[-0.015, 0.066, 0.062, -0.040, 0, 1], [0.040, 0.083, 0.086, -0.026, 0, 2], [0.105, 0.087, 0.1015, -0.008, 0, 1], [0.165, 0.082, 0.099, -0.004, 0, 2], [0.200, 0.063, 0.078, -0.005, 0, 1], [0.219, 0.030, 0.040, -0.006, 0, 2]], r, { capStart: false });
  // 3 : long (retombe sur les épaules)
  h(PART_HAIR_LONG);
  b.loft([[0.040, 0.083, 0.086, -0.026, 0, 2], [0.105, 0.087, 0.1015, -0.008, 0, 1], [0.165, 0.082, 0.099, -0.004, 0, 2], [0.200, 0.063, 0.078, -0.005, 0, 1], [0.219, 0.030, 0.040, -0.006, 0, 2]], r, { capStart: false });
  b.loft([[-0.150, 0.080, 0.030, -0.078, 0, 2], [-0.060, 0.090, 0.048, -0.064, 0, 1], [0.045, 0.086, 0.070, -0.042, 0, 2]], r, { capEnd: false });
  // 4 : queue de cheval
  h(PART_HAIR_PONYTAIL);
  b.loft(HAIR_SHORT, r, { capStart: false });
  b.cyl(0, 0.130, -0.092, 0, 0.060, -0.150, 0.030, 0.024, b.rad(8, 5, 4));
  b.cyl(0, 0.060, -0.150, 0, -0.060, -0.135, 0.024, 0.010, b.rad(8, 5, 4));
  // 5 : chignon
  h(PART_HAIR_BUN);
  b.loft(HAIR_SHORT, r, { capStart: false });
  b.ellipsoid(0, 0.165, -0.098, 0.040, 0.040, 0.038, b.rad(8, 6, 4), b.rad(6, 4, 3));
  // 6 : afro / volumineux
  h(PART_HAIR_AFRO);
  b.loft([[0.020, 0.086, 0.086, -0.040, 0, 2], [0.085, 0.108, 0.112, -0.026, 0, 1], [0.150, 0.112, 0.118, -0.016, 0, 2], [0.215, 0.090, 0.095, -0.012, 0, 1], [0.246, 0.045, 0.050, -0.010, 0, 2]], r, { capStart: false });
  // barbe
  if (b.detail === 0) {
    h(PART_BEARD);
    b.loft([[-0.037, 0.030, 0.030, 0.050], [-0.014, 0.054, 0.062, 0.027], [0.020, 0.067, 0.078, 0.0145], [0.046, 0.070, 0.074, 0.018]], 12, { capEnd: false });
  }
}

/** Casque de maintien de l'ordre : coque inclinée, bavolet de nuque, bandes de couleur. */
function helmetMo(b: GeoBuilder): void {
  const r = b.rad(16, 8, 6);
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_HELMET_MO, SCALE_HEAD).shade(1, 0.32);
  b.push().translate(0, 0.10, 0).rotX(-0.28).translate(0, -0.10, 0);
  b.loft([
    [0.085, 0.082, 0.098, -0.006, 0, 1],
    [0.085, 0.097, 0.113, -0.006, 0, 2],
    [0.115, 0.103, 0.122, -0.004, 0, 1],
    [0.165, 0.100, 0.118, -0.004, 0, 2],
    [0.208, 0.078, 0.094, -0.005, 0, 1],
    [0.234, 0.040, 0.050, -0.006, 0, 2],
    [0.240, 0.010, 0.012, -0.006, 0, 1],
  ], r, { capStart: false });
  // bandes (jaunes pour les CRS) : deux anneaux autour de la coque
  b.ctx(BONE_HEAD, SLOT_BAND, PART_HELMET_STRIPES, SCALE_HEAD).shade(1, 0.4);
  b.loft([[0.118, 0.1045, 0.1235, -0.004], [0.133, 0.1045, 0.1235, -0.004]], r, { capStart: false, capEnd: false });
  b.loft([[0.148, 0.1030, 0.1215, -0.004], [0.163, 0.1015, 0.1195, -0.004]], r, { capStart: false, capEnd: false });
  b.pop();
  // bavolet (protège-nuque) : retombe sur la nuque et les côtés du cou
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_HELMET_MO, SCALE_HEAD).tint(0x27282d, 0.75);
  b.loft([[-0.072, 0.082, 0.044, -0.090, 0, 2], [-0.020, 0.074, 0.050, -0.082, 0, 1], [0.060, 0.082, 0.064, -0.066, 0, 2]], r, { capStart: false, capEnd: false });
  if (b.detail === 0) {
    // jugulaire et mentonnière
    b.box(0, -0.030, 0.058, 0.050, 0.022, 0.030);
  }
}

/** Casque de moto intégral (BRAV-M) : coque complète, écran sombre, mentonnière. */
function helmetMoto(b: GeoBuilder): void {
  const r = b.rad(16, 8, 6);
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_HELMET_MOTO, SCALE_HEAD).shade(1, 0.25);
  const shell: Ring[] = [
    [-0.050, 0.070, 0.088, 0.012, 0, 2],
    [-0.030, 0.092, 0.112, 0.010, 0, 1],
    [0.020, 0.108, 0.130, 0.006, 0, 2],
    [0.085, 0.115, 0.136, 0.000, 0, 1],
    [0.150, 0.112, 0.131, -0.002, 0, 2],
    [0.205, 0.088, 0.104, -0.004, 0, 1],
    [0.238, 0.044, 0.054, -0.005, 0, 2],
    [0.245, 0.010, 0.012, -0.005, 0, 1],
  ];
  b.loft(shell, r);
  // écran : bande sombre brillante à hauteur des yeux
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_HELMET_MOTO, SCALE_HEAD).tint(0x1c2228, 0.1);
  b.arc([[0.045, 0.1125, 0.1345, 0.004], [0.090, 0.1165, 0.1375, 0.000], [0.132, 0.1155, 0.1355, -0.001]], b.rad(10, 5, 3), Math.PI * 0.5 - 1.25, Math.PI * 0.5 + 1.25);
  if (b.detail === 0) {
    // aération de mentonnière
    b.ctx(BONE_HEAD, SLOT_FIXED, PART_HELMET_MOTO, SCALE_HEAD).tint(0x34363a, 0.5);
    b.box(0, -0.005, 0.135, 0.05, 0.014, 0.012);
  }
}

/** Casque léger (vélo / skate) : presse, secouristes de rue, observateurs. */
function helmetLight(b: GeoBuilder): void {
  const r = b.rad(14, 8, 6);
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_HELMET_LIGHT, SCALE_HEAD).shade(1, 0.35);
  b.push().translate(0, 0.11, 0).rotX(-0.20).translate(0, -0.11, 0);
  b.loft([
    [0.098, 0.079, 0.096, -0.004, 0, 1],
    [0.098, 0.092, 0.109, -0.004, 0, 2],
    [0.145, 0.094, 0.111, -0.003, 0, 2],
    [0.196, 0.076, 0.091, -0.004, 0, 1],
    [0.224, 0.040, 0.050, -0.005, 0, 2],
    [0.230, 0.010, 0.012, -0.005, 0, 1],
  ], r, { capStart: false });
  // bandeau de marquage (PRESSE…) à l'avant et à l'arrière
  b.ctx(BONE_HEAD, SLOT_BAND, PART_HELMET_TEXT, SCALE_HEAD).shade(1, 0.5);
  b.textKind = TEXT_BACK;
  const band: Ring[] = [[0.112, 0.0945, 0.1115, -0.004], [0.150, 0.0955, 0.1125, -0.003]];
  b.arc(band, b.rad(8, 4, 2), Math.PI * 0.5 + 0.72, Math.PI * 0.5 - 0.72);
  b.arc(band, b.rad(8, 4, 2), Math.PI * 1.5 + 0.72, Math.PI * 1.5 - 0.72);
  b.textKind = 0;
  b.pop();
  if (b.detail === 0) {
    b.ctx(BONE_HEAD, SLOT_FIXED, PART_HELMET_LIGHT, SCALE_HEAD).tint(0x2a2a2e, 0.8);
    b.box(0.070, 0.030, 0.020, 0.006, 0.120, 0.016);
    b.box(-0.070, 0.030, 0.020, 0.006, 0.120, 0.016);
    b.box(0, -0.033, 0.040, 0.10, 0.008, 0.016);
  }
  // croix rouge (secouristes de rue) sur le devant du casque
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_CROSS, SCALE_HEAD).tint(0xd0141c, 0.5);
  b.push().translate(0, 0.186, 0.098).rotX(-0.62);
  if (b.detail === 0) {
    b.box(0, 0, 0, 0.060, 0.018, 0.006);
    b.box(0, 0, 0, 0.018, 0.060, 0.006);
  } else {
    b.quad(-0.03, -0.009, 0.006, 0.03, -0.009, 0.006, 0.03, 0.009, 0.006, -0.03, 0.009, 0.006);
    b.quad(-0.009, -0.03, 0.006, 0.009, -0.03, 0.006, 0.009, 0.03, 0.006, -0.009, 0.03, 0.006);
  }
  b.pop();
}

/** Casque de sapeur-pompier (type F1) : coque haute, cimier, bavolet. */
function helmetPompier(b: GeoBuilder): void {
  const r = b.rad(16, 8, 6);
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_HELMET_POMPIER, SCALE_HEAD).shade(1, 0.16);
  b.push().translate(0, 0.10, 0).rotX(-0.22).translate(0, -0.10, 0);
  b.loft([
    [0.080, 0.084, 0.100, -0.004, 0, 1],
    [0.080, 0.100, 0.118, -0.004, 0, 2],
    [0.120, 0.106, 0.127, -0.003, 0, 1],
    [0.175, 0.103, 0.123, -0.004, 0, 2],
    [0.220, 0.082, 0.098, -0.005, 0, 1],
    [0.248, 0.042, 0.052, -0.006, 0, 2],
    [0.254, 0.010, 0.012, -0.006, 0, 1],
  ], r, { capStart: false });
  // cimier (arête d'avant en arrière)
  b.push().translate(0, 0.238, -0.006).rotX(Math.PI / 2);
  b.loft([[-0.100, 0.010, 0.006, 0], [-0.060, 0.016, 0.020, 0], [0.050, 0.016, 0.022, 0], [0.105, 0.010, 0.006, 0]], b.rad(6, 4, 3));
  b.pop();
  // plaque frontale
  b.ctx(BONE_HEAD, SLOT_BAND, PART_HELMET_POMPIER, SCALE_HEAD).shade(1, 0.3);
  b.arc([[0.115, 0.1075, 0.1285, -0.003], [0.158, 0.1055, 0.1255, -0.004]], b.rad(6, 3, 2), Math.PI * 0.5 - 0.5, Math.PI * 0.5 + 0.5);
  b.pop();
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_HELMET_POMPIER, SCALE_HEAD).tint(0x2a2b30, 0.75);
  b.loft([[-0.076, 0.084, 0.046, -0.092, 0, 2], [-0.020, 0.076, 0.052, -0.084, 0, 1], [0.058, 0.084, 0.066, -0.068, 0, 2]], r, { capStart: false, capEnd: false });
}

function softHeadwear(b: GeoBuilder): void {
  const r = b.rad(14, 8, 6);
  // capuche relevée (couleur du haut)
  b.ctx(BONE_HEAD, SLOT_TOP, PART_HOOD_UP, SCALE_HEAD).shade(0.93, 1);
  b.loft([
    [-0.075, 0.105, 0.082, -0.030, 0, 2],
    [-0.010, 0.100, 0.100, -0.024, 0, 1],
    [0.075, 0.095, 0.101, -0.023, 0, 2],
    [0.130, 0.093, 0.104, -0.016, 0, 1],
    [0.170, 0.088, 0.104, -0.008, 0, 2],
    [0.212, 0.066, 0.080, -0.008, 0, 1],
    [0.232, 0.030, 0.038, -0.008, 0, 2],
  ], r, { capStart: false });
  // casquette
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_CAP, SCALE_HEAD).shade(1, 0.9);
  b.loft([[0.118, 0.0795, 0.0985, -0.002, 0, 2], [0.165, 0.0765, 0.0945, -0.003, 0, 1], [0.200, 0.058, 0.072, -0.004, 0, 2], [0.2155, 0.030, 0.038, -0.004, 0, 1]], r, { capStart: false });
  b.push().translate(0, 0.122, 0.092).rotX(0.16);
  b.loft([[0.000, 0.070, 0.006, 0], [0.050, 0.060, 0.005, 0], [0.078, 0.036, 0.004, 0]], b.rad(8, 5, 4));
  b.pop();
  // bonnet
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_BEANIE, SCALE_HEAD).shade(1, 1);
  b.loft([[0.080, 0.081, 0.094, -0.012, 0, 2], [0.128, 0.0845, 0.105, -0.006, 0, 1], [0.180, 0.075, 0.092, -0.005, 0, 2], [0.216, 0.046, 0.056, -0.005, 0, 1], [0.230, 0.015, 0.020, -0.005, 0, 2]], r, { capStart: false });
  // cagoule : tout sauf une fente pour les yeux
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_BALACLAVA, SCALE_HEAD).shade(1, 1);
  b.loft([[-0.060, 0.060, 0.062, 0.006, 0, 2], [-0.020, 0.058, 0.068, 0.022, 0, 1], [0.025, 0.0685, 0.085, 0.009, 0, 2], [0.070, 0.0775, 0.0955, 0.003, 0, 2]], r, { capStart: false, capEnd: false });
  b.loft([[0.103, 0.0805, 0.100, 0.000, 0, 2], [0.155, 0.076, 0.094, -0.003, 0, 1], [0.190, 0.057, 0.071, -0.005, 0, 2], [0.2085, 0.028, 0.036, -0.006, 0, 1]], r, { capStart: false });
  // calot (bonnet de police)
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_CALOT, SCALE_HEAD).shade(1, 0.95);
  b.loft([[0.168, 0.066, 0.098, -0.004, 0, 2], [0.205, 0.050, 0.092, -0.004, 0, 2], [0.224, 0.016, 0.070, -0.004, 0, 2]], b.rad(10, 6, 4), { capStart: false });
  // casquette de police : coiffe plate, bandeau, visière vernie
  b.ctx(BONE_HEAD, SLOT_GEAR, PART_CAP_POLICE, SCALE_HEAD).shade(1, 0.9);
  b.loft([[0.130, 0.081, 0.099, -0.002, 0, 2], [0.172, 0.090, 0.108, -0.002, 0, 1], [0.192, 0.092, 0.110, -0.002, 0, 2], [0.203, 0.060, 0.072, -0.002, 0, 2]], r, { capStart: false });
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_CAP_POLICE, SCALE_HEAD).tint(0x222327, 0.22);
  b.push().translate(0, 0.128, 0.090).rotX(0.30);
  b.loft([[0.000, 0.074, 0.006, 0], [0.045, 0.064, 0.005, 0], [0.066, 0.040, 0.004, 0]], b.rad(8, 5, 4));
  b.pop();
  if (b.detail === 0) {
    b.ctx(BONE_HEAD, SLOT_FIXED, PART_CAP_POLICE, SCALE_HEAD).tint(0xc8ccd4, 0.3);
    b.box(0, 0.162, 0.105, 0.024, 0.024, 0.006);
  }
}

function faceGear(b: GeoBuilder): void {
  const r = b.rad(12, 7, 5);
  // masque à gaz : pièce faciale, oculaire panoramique, cartouche filtrante
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_GAS_MASK, SCALE_HEAD).tint(0x2a2c2f, 0.6);
  b.loft([[-0.040, 0.046, 0.046, 0.040, 0, 2], [-0.010, 0.064, 0.074, 0.022, 0, 1], [0.050, 0.079, 0.094, 0.010, 0, 2], [0.118, 0.081, 0.098, 0.004, 0, 2]], r, { capEnd: false });
  b.tint(0x4a5560, 0.1);
  b.arc([[0.060, 0.0815, 0.0975, 0.010], [0.112, 0.0835, 0.1005, 0.005]], b.rad(8, 4, 3), Math.PI * 0.5 - 0.95, Math.PI * 0.5 + 0.95);
  b.tint(0x35383c, 0.45);
  b.cyl(0.028, 0.012, 0.085, 0.066, -0.008, 0.150, 0.040, 0.040, b.rad(10, 6, 5));
  if (b.detail === 0) {
    b.tint(0x242527, 0.8);
    b.loft([[0.060, 0.082, 0.100, -0.004], [0.078, 0.082, 0.100, -0.004]], 12, { capStart: false, capEnd: false });
  }
  // foulard / masque sur le bas du visage
  b.ctx(BONE_HEAD, SLOT_COVER, PART_FACE_COVER, SCALE_HEAD).shade(1, 1);
  b.loft([[-0.052, 0.052, 0.050, 0.028, 0, 2], [-0.015, 0.060, 0.070, 0.021, 0, 1], [0.030, 0.0705, 0.087, 0.010, 0, 2], [0.070, 0.0775, 0.0955, 0.004, 0, 2]], r, { capEnd: false });
  // lunettes de protection
  b.ctx(BONE_HEAD, SLOT_FIXED, PART_GOGGLES, SCALE_HEAD).tint(0x29292c, 0.6);
  b.loft([[0.074, 0.0795, 0.0975, 0.002, 0, 2], [0.104, 0.0800, 0.0985, 0.001, 0, 2]], r, { capStart: false, capEnd: false });
  b.tint(0x55636e, 0.08);
  b.arc([[0.072, 0.082, 0.101, 0.004], [0.106, 0.083, 0.102, 0.003]], b.rad(8, 4, 3), Math.PI * 0.5 - 0.85, Math.PI * 0.5 + 0.85);
}

export function buildHeadwear(b: GeoBuilder): void {
  if (b.detail === 2) return;
  hair(b);
  helmetMo(b);
  helmetMoto(b);
  helmetLight(b);
  helmetPompier(b);
  softHeadwear(b);
  faceGear(b);
}
