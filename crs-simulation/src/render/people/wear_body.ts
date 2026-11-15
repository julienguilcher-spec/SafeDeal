/* Vêtements et équipements portés sur le tronc et les membres : gilet tactique, protections, chasuble,
 * marquages, écharpe tricolore, brassard, sac à dos, vestes, ceinturon. Rien au niveau « silhouette ». */

import {
  GeoBuilder, SCALE_LIMB, SLOT_ACCENT, SLOT_BAND, SLOT_BOTTOM, SLOT_COVER, SLOT_FIXED, SLOT_PACK, SLOT_TOP,
  SLOT_TORSO, SLOT_VEST, TEXT_BACK, TEXT_CHEST, TEXT_RANK, type Ring,
} from './geo';
import {
  BONE_ARM_L, BONE_ARM_R, BONE_CHEST, BONE_FORE_L, BONE_FORE_R, BONE_PELVIS, BONE_SHIN_L, BONE_SHIN_R,
  BONE_SPINE, BONE_THIGH_R,
} from './skeleton';
import {
  PART_ARMBAND, PART_ARM_GUARDS, PART_BACKPACK, PART_BACK_TEXT, PART_BACK_TEXT_VEST, PART_BELT_GEAR,
  PART_CHASUBLE, PART_CHEST_TEXT, PART_CHEST_TEXT_VEST, PART_COAT, PART_CROSS, PART_HOOD_DOWN, PART_JACKET,
  PART_LEG_GUARDS, PART_LIMB_BANDS, PART_RANK, PART_REFLECT_BANDS, PART_SASH, PART_SCARF, PART_SKIRT,
  PART_SUIT, PART_VEST_TACTICAL,
} from './parts';
import { ABDOMEN_RINGS, CHEST_RINGS } from './body';

const TORSO_POWER = 2.35;
const HPI = Math.PI / 2;

/** Anneaux grossis : dx sur les côtés, dz devant / derrière. */
function grow(rings: readonly Ring[], dx: number, dz: number): Ring[] {
  return rings.map((r) => [r[0], r[1] + dx, r[2] + dz, r[3] ?? 0, r[4] ?? 0, r[5] ?? 2]);
}

function tacticalVest(b: GeoBuilder): void {
  const rt = b.rad(16, 8, 6);
  b.ctx(BONE_CHEST, SLOT_VEST, PART_VEST_TACTICAL, SCALE_LIMB).shade(1, 0.8);
  b.loft([
    [-0.040, 0.168, 0.124, 0.007, 0, 2],
    [0.070, 0.184, 0.137, 0.010, 0, 1],
    [0.160, 0.190, 0.132, 0.004, 0, 2],
    [0.215, 0.176, 0.112, -0.004, 0, 1],
    [0.250, 0.124, 0.092, -0.012, 0, 2],
  ], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  b.ctx(BONE_SPINE, SLOT_VEST, PART_VEST_TACTICAL, SCALE_LIMB).shade(1, 0.8);
  b.loft([
    [-0.030, 0.160, 0.112, 0.004, 0, 2],
    [-0.030, 0.166, 0.120, 0.004, 0, 2],
    [0.060, 0.163, 0.121, 0.007, 0, 0],
    [0.172, 0.170, 0.127, 0.008, 0, 2],
  ], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  if (b.detail === 0) {
    // poches et porte-équipements
    b.ctx(BONE_SPINE, SLOT_VEST, PART_VEST_TACTICAL, SCALE_LIMB).shade(0.82, 0.85);
    b.box(-0.085, 0.060, 0.131, 0.060, 0.090, 0.030);
    b.box(-0.010, 0.060, 0.134, 0.060, 0.090, 0.030);
    b.box(0.070, 0.055, 0.132, 0.070, 0.100, 0.034);
    b.ctx(BONE_CHEST, SLOT_VEST, PART_VEST_TACTICAL, SCALE_LIMB).shade(0.82, 0.85);
    b.box(0.095, 0.085, 0.142, 0.050, 0.095, 0.030);   // radio sur la poitrine gauche
    b.ctx(BONE_CHEST, SLOT_FIXED, PART_VEST_TACTICAL, SCALE_LIMB).tint(0x2a2b2f, 0.5);
    b.cyl(0.112, 0.130, 0.152, 0.114, 0.160, 0.150, 0.005, 0.004, 5);
  }
}

function guards(b: GeoBuilder, side: number): void {
  const L = side > 0;
  const rl = b.rad(12, 7, 5);
  b.push();
  if (!L) b.scale(-1, 1, 1);
  // épaulière et coudière / protège-avant-bras (coques rigides noires)
  b.ctx(L ? BONE_ARM_L : BONE_ARM_R, SLOT_FIXED, PART_ARM_GUARDS, SCALE_LIMB).tint(0x2c2e34, 0.4);
  b.loft([[0.062, 0.020, 0.022, 0, 0.004, 1], [0.034, 0.058, 0.060, 0, 0.004, 2], [-0.030, 0.064, 0.067, 0, 0.005, 1], [-0.120, 0.057, 0.060, 0, 0.004, 2]], rl, { capEnd: false });
  b.ctx(L ? BONE_FORE_L : BONE_FORE_R, SLOT_FIXED, PART_ARM_GUARDS, SCALE_LIMB).tint(0x2c2e34, 0.4);
  b.loft([[0.060, 0.030, 0.034, -0.016, 0, 1], [0.020, 0.048, 0.054, -0.010, 0, 2], [-0.040, 0.049, 0.054, -0.006, 0, 1], [-0.200, 0.038, 0.042, -0.003, 0, 2]], rl, { capEnd: false });
  // jambière : genouillère, tibia, cou-de-pied
  b.ctx(L ? BONE_SHIN_L : BONE_SHIN_R, SLOT_FIXED, PART_LEG_GUARDS, SCALE_LIMB).tint(0x2b2d32, 0.4);
  b.loft([[0.090, 0.034, 0.024, 0.040, 0, 1], [0.045, 0.058, 0.042, 0.032, 0, 2], [-0.020, 0.058, 0.044, 0.026, 0, 1], [-0.150, 0.050, 0.040, 0.020, 0, 0], [-0.340, 0.043, 0.036, 0.018, 0, 2], [-0.398, 0.046, 0.044, 0.024, 0, 1]], rl, { capEnd: false });
  b.pop();
}

function markings(b: GeoBuilder): void {
  const off = b.detail === 0 ? 0.0035 : 0.009;
  const seg = b.rad(8, 4, 2);
  // texte dorsal sur vêtement léger (ou chasuble) puis sur gilet tactique
  const backThin: Ring[] = [[0.085, 0.180 + off, 0.1235 + off, 0.008], [0.140, 0.188 + off, 0.1225 + off, 0.005], [0.195, 0.185 + off, 0.113 + off, -0.001]];
  const backVest: Ring[] = [[0.085, 0.186 + off, 0.1365 + off, 0.009], [0.140, 0.190 + off, 0.133 + off, 0.006], [0.195, 0.184 + off, 0.121 + off, 0.000]];
  b.ctx(BONE_CHEST, SLOT_TORSO, PART_BACK_TEXT, SCALE_LIMB).shade(1, 0.85);
  b.textKind = TEXT_BACK;
  b.arc(backThin, seg, 1.5 * Math.PI + 0.78, 1.5 * Math.PI - 0.78, TORSO_POWER);
  b.ctx(BONE_CHEST, SLOT_TORSO, PART_BACK_TEXT_VEST, SCALE_LIMB).shade(1, 0.8);
  b.textKind = TEXT_BACK;
  b.arc(backVest, seg, 1.5 * Math.PI + 0.78, 1.5 * Math.PI - 0.78, TORSO_POWER);
  // petit marquage sur la poitrine gauche
  const frontThin: Ring[] = [[0.150, 0.188 + off, 0.1235 + off, 0.006], [0.180, 0.187 + off, 0.119 + off, 0.003]];
  const frontVest: Ring[] = [[0.168, 0.191 + off, 0.1335 + off, 0.004], [0.198, 0.187 + off, 0.124 + off, 0.000]];
  b.ctx(BONE_CHEST, SLOT_TORSO, PART_CHEST_TEXT, SCALE_LIMB).shade(1, 0.85);
  b.textKind = TEXT_CHEST;
  b.arc(frontThin, b.rad(4, 2, 1), HPI - 0.14, HPI - 0.70, TORSO_POWER);
  b.ctx(BONE_CHEST, SLOT_TORSO, PART_CHEST_TEXT_VEST, SCALE_LIMB).shade(1, 0.8);
  b.textKind = TEXT_CHEST;
  b.arc(frontVest, b.rad(4, 2, 1), HPI - 0.14, HPI - 0.70, TORSO_POWER);
  // galons au centre de la poitrine
  if (b.detail === 0) {
    b.ctx(BONE_CHEST, SLOT_TORSO, PART_RANK, SCALE_LIMB).shade(0.8, 0.8);
    b.textKind = TEXT_RANK;
    b.arc([[0.095, 0.1905, 0.1415, 0.009], [0.150, 0.1935, 0.1385, 0.006]], 3, HPI + 0.115, HPI - 0.115, TORSO_POWER);
  }
  b.textKind = 0;
}

function chasuble(b: GeoBuilder): void {
  const rt = b.rad(16, 8, 6);
  b.ctx(BONE_CHEST, SLOT_VEST, PART_CHASUBLE, SCALE_LIMB).shade(1, 0.9);
  b.loft(grow(CHEST_RINGS.slice(0, 5), 0.008, 0.008), rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  b.ctx(BONE_SPINE, SLOT_VEST, PART_CHASUBLE, SCALE_LIMB).shade(1, 0.9);
  b.loft([[-0.090, 0.150, 0.096, -0.004, 0, 2], [-0.090, 0.182, 0.125, -0.004, 0, 2], [-0.035, 0.172, 0.119, 0.0, 0, 1], ...grow(ABDOMEN_RINGS.slice(1), 0.008, 0.008)], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  // bandes rétroréfléchissantes (gilet de haute visibilité)
  b.ctx(BONE_SPINE, SLOT_FIXED, PART_REFLECT_BANDS, SCALE_LIMB).tint(0xc9cdd2, 0.35);
  const o = b.detail === 0 ? 0.011 : 0.016;
  b.loft([[0.000, 0.148 + o, 0.099 + o, 0.002], [0.045, 0.146 + o, 0.100 + o, 0.004]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  b.ctx(BONE_CHEST, SLOT_FIXED, PART_REFLECT_BANDS, SCALE_LIMB).tint(0xc9cdd2, 0.35);
  b.loft([[-0.020, 0.159 + o, 0.107 + o, 0.006], [0.025, 0.166 + o, 0.112 + o, 0.008]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  // croix rouge (secouristes de rue) devant et derrière
  b.ctx(BONE_CHEST, SLOT_FIXED, PART_CROSS, SCALE_LIMB).tint(0xd0141c, 0.6);
  b.box(0, 0.110, 0.1385, 0.100, 0.030, 0.006);
  b.box(0, 0.110, 0.1385, 0.030, 0.100, 0.006);
  b.box(0, 0.120, -0.1255, 0.130, 0.036, 0.006);
  b.box(0, 0.120, -0.1255, 0.036, 0.130, 0.006);
}

/** Écharpe tricolore portée en bandoulière, de l'épaule droite à la hanche gauche. */
function sash(b: GeoBuilder): void {
  const r = b.rad(24, 12, 8);
  b.push().translate(0.0165, 0.0235, 0.004).rotZ(-1.005);
  const rx = 0.295, rz = 0.1375;
  const colors = [0xef4135, 0xf6f6f2, 0x0055a4];   // rouge en bas, blanc, bleu vers le col
  for (let i = 0; i < 3; i++) {
    b.ctx(BONE_CHEST, SLOT_FIXED, PART_SASH, SCALE_LIMB).tint(colors[i], 0.55);
    const y0 = -0.048 + i * 0.032, y1 = y0 + 0.032;
    b.loft([[y0, rx, rz, 0.004], [y1, rx, rz, 0.004]], r, { capStart: false, capEnd: false });
  }
  // nœud et pans frangés d'or sur la hanche gauche
  if (b.detail === 0) {
    b.ctx(BONE_CHEST, SLOT_FIXED, PART_SASH, SCALE_LIMB).tint(0x0055a4, 0.55);
    b.ellipsoid(rx + 0.004, 0, 0.02, 0.022, 0.050, 0.030, 8, 5);
    b.pop();
    b.ctx(BONE_CHEST, SLOT_FIXED, PART_SASH, SCALE_LIMB);
    b.tint(0xef4135, 0.55); b.box(0.190, -0.300, 0.030, 0.012, 0.150, 0.022);
    b.tint(0xf6f6f2, 0.55); b.box(0.190, -0.300, 0.052, 0.012, 0.150, 0.022);
    b.tint(0x0055a4, 0.55); b.box(0.190, -0.300, 0.074, 0.012, 0.150, 0.022);
    b.tint(0xc9a227, 0.4); b.box(0.190, -0.388, 0.052, 0.014, 0.030, 0.070);
  } else {
    b.pop();
  }
}

function clothing(b: GeoBuilder): void {
  const rt = b.rad(16, 8, 6);
  // blouson : ourlet sur les hanches et col
  b.ctx(BONE_SPINE, SLOT_TOP, PART_JACKET, SCALE_LIMB).shade(0.94, 0.95);
  b.loft([[-0.110, 0.150, 0.096, -0.004, 0, 2], [-0.110, 0.187, 0.127, -0.004, 0, 2], [-0.040, 0.174, 0.120, 0.000, 0, 1], [0.070, 0.160, 0.112, 0.004, 0, 2]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  b.ctx(BONE_CHEST, SLOT_TOP, PART_JACKET, SCALE_LIMB).shade(0.86, 0.95);
  b.loft([[0.238, 0.094, 0.084, -0.010, 0, 2], [0.292, 0.070, 0.070, -0.014, 0, 2]], b.rad(12, 6, 5), { capStart: false, capEnd: false });
  // manteau / parka : pan jusqu'à mi-cuisse
  b.ctx(BONE_SPINE, SLOT_TOP, PART_COAT, SCALE_LIMB).shade(0.96, 0.95);
  b.loft([[-0.345, 0.196, 0.160, 0.0, 0, 2], [-0.345, 0.212, 0.178, 0.0, 0, 2], [-0.200, 0.192, 0.150, 0.0, 0, 1], [-0.030, 0.171, 0.120, 0.002, 0, 1], [0.070, 0.161, 0.113, 0.004, 0, 2]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  b.ctx(BONE_CHEST, SLOT_TOP, PART_COAT, SCALE_LIMB).shade(0.86, 0.95);
  b.loft([[0.238, 0.096, 0.086, -0.010, 0, 2], [0.300, 0.072, 0.072, -0.014, 0, 2]], b.rad(12, 6, 5), { capStart: false, capEnd: false });
  // capuche rabattue dans le dos
  b.ctx(BONE_CHEST, SLOT_TOP, PART_HOOD_DOWN, SCALE_LIMB).shade(0.9, 1);
  b.ellipsoid(0, 0.245, -0.098, 0.115, 0.075, 0.062, b.rad(10, 6, 4), b.rad(6, 4, 3));
  // jupe
  b.ctx(BONE_PELVIS, SLOT_BOTTOM, PART_SKIRT, SCALE_LIMB).shade(0.95, 0.95);
  b.loft([[-0.300, 0.190, 0.165, 0.0, 0, 2], [-0.300, 0.205, 0.182, 0.0, 0, 2], [-0.100, 0.186, 0.140, -0.004, 0, 1], [0.085, 0.158, 0.106, 0, 0, 2]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  // costume : chemise claire en V et cravate
  {
    const o = b.detail === 0 ? 0.003 : 0.008;
    const lv: number[][] = [[0.065, 0.004, 0.1285], [0.150, 0.034, 0.1215], [0.238, 0.060, 0.0900]];
    b.ctx(BONE_CHEST, SLOT_FIXED, PART_SUIT, SCALE_LIMB).tint(0xeeeeea, 0.8);
    for (let i = 0; i < 2; i++) {
      const [y0, w0, z0] = lv[i], [y1, w1, z1] = lv[i + 1];
      b.quad(-w0, y0, z0 + o, w0, y0, z0 + o, w1, y1, z1 + o, -w1, y1, z1 + o);
    }
    b.ctx(BONE_CHEST, SLOT_ACCENT, PART_SUIT, SCALE_LIMB).shade(1, 0.7);
    const tv: number[][] = [[0.075, 0.006, 0.1290], [0.105, 0.017, 0.1270], [0.210, 0.011, 0.1030], [0.236, 0.016, 0.0920]];
    for (let i = 0; i < 3; i++) {
      const [y0, w0, z0] = tv[i], [y1, w1, z1] = tv[i + 1];
      b.quad(-w0, y0, z0 + o * 2, w0, y0, z0 + o * 2, w1, y1, z1 + o * 2, -w1, y1, z1 + o * 2);
    }
  }
  // écharpe de cou
  b.ctx(BONE_CHEST, SLOT_COVER, PART_SCARF, SCALE_LIMB).shade(1, 1);
  b.loft([[0.228, 0.100, 0.090, -0.008, 0, 2], [0.262, 0.094, 0.090, -0.006, 0, 1], [0.300, 0.076, 0.080, -0.006, 0, 2]], b.rad(12, 6, 5), { capStart: false });
}

function gearAndBags(b: GeoBuilder): void {
  const rt = b.rad(16, 8, 6);
  // ceinturon et accessoires (étui de cuisse droit, porte-menottes, porte-chargeur)
  b.ctx(BONE_PELVIS, SLOT_FIXED, PART_BELT_GEAR, SCALE_LIMB).tint(0x26272b, 0.5);
  b.loft([[0.060, 0.166, 0.115, -0.002], [0.105, 0.160, 0.110, 0.0]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  if (b.detail === 0) {
    b.box(0.150, 0.060, 0.050, 0.040, 0.085, 0.060);
    b.box(-0.060, 0.070, -0.110, 0.070, 0.070, 0.035);
    b.box(0.070, 0.070, 0.112, 0.050, 0.060, 0.030);
    b.tint(0x8a8d92, 0.3);
    b.box(0, 0.082, 0.117, 0.040, 0.034, 0.010);
  }
  b.ctx(BONE_THIGH_R, SLOT_FIXED, PART_BELT_GEAR, SCALE_LIMB).tint(0x26272b, 0.5);
  b.box(-0.098, -0.090, 0.012, 0.040, 0.170, 0.080);
  // sac à dos
  b.ctx(BONE_CHEST, SLOT_PACK, PART_BACKPACK, SCALE_LIMB).shade(1, 0.9);
  b.loft([[-0.140, 0.110, 0.050, -0.166, 0, 2], [-0.085, 0.138, 0.070, -0.180, 0, 1], [0.140, 0.132, 0.064, -0.176, 0, 1], [0.215, 0.100, 0.046, -0.158, 0, 2]], b.rad(12, 6, 5), { power: 3.2 });
  if (b.detail === 0) {
    b.shade(0.75, 0.9);
    b.box(0.105, 0.150, 0.020, 0.036, 0.240, 0.250);
    b.box(-0.105, 0.150, 0.020, 0.036, 0.240, 0.250);
    b.box(0, -0.020, -0.248, 0.150, 0.110, 0.022);
  }
  // brassard (bras gauche) et son marquage
  b.ctx(BONE_ARM_L, SLOT_ACCENT, PART_ARMBAND, SCALE_LIMB).shade(1, 0.8);
  const ao = b.detail === 0 ? 0.004 : 0.008;
  b.loft([[-0.080, 0.0505 + ao, 0.0545 + ao, 0], [-0.170, 0.0445 + ao, 0.0475 + ao, 0]], b.rad(12, 7, 5), { capStart: false, capEnd: false });
  b.ctx(BONE_ARM_L, SLOT_ACCENT, PART_ARMBAND, SCALE_LIMB).shade(1, 0.8);
  b.textKind = TEXT_CHEST;
  b.arc([[-0.150, 0.047 + ao * 1.6, 0.050 + ao * 1.6, 0], [-0.100, 0.0505 + ao * 1.6, 0.054 + ao * 1.6, 0]], b.rad(5, 3, 2), 0.95, -0.95);
  b.textKind = 0;
  // bandes rétroréfléchissantes des manches, des jambes et de la veste (pompiers, SAMU)
  const lo = b.detail === 0 ? 0.004 : 0.008;
  for (const side of [1, -1]) {
    b.push();
    if (side < 0) b.scale(-1, 1, 1);
    b.ctx(side > 0 ? BONE_FORE_L : BONE_FORE_R, SLOT_BAND, PART_LIMB_BANDS, SCALE_LIMB).shade(1, 0.35);
    b.loft([[-0.150, 0.034 + lo, 0.037 + lo, 0], [-0.195, 0.031 + lo, 0.034 + lo, 0]], b.rad(10, 6, 5), { capStart: false, capEnd: false });
    b.ctx(side > 0 ? BONE_ARM_L : BONE_ARM_R, SLOT_BAND, PART_LIMB_BANDS, SCALE_LIMB).shade(1, 0.35);
    b.loft([[-0.150, 0.046 + lo, 0.049 + lo, 0], [-0.195, 0.043 + lo, 0.046 + lo, 0]], b.rad(10, 6, 5), { capStart: false, capEnd: false });
    b.ctx(side > 0 ? BONE_SHIN_L : BONE_SHIN_R, SLOT_BAND, PART_LIMB_BANDS, SCALE_LIMB).shade(1, 0.35);
    b.loft([[-0.250, 0.041 + lo, 0.045 + lo, -0.004], [-0.300, 0.038 + lo, 0.042 + lo, -0.002]], b.rad(10, 6, 5), { capStart: false, capEnd: false });
    b.pop();
  }
  b.ctx(BONE_SPINE, SLOT_BAND, PART_LIMB_BANDS, SCALE_LIMB).shade(1, 0.35);
  b.loft([[-0.010, 0.149 + lo * 1.5, 0.099 + lo * 1.5, 0.001], [0.040, 0.146 + lo * 1.5, 0.100 + lo * 1.5, 0.004]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
  b.ctx(BONE_CHEST, SLOT_BAND, PART_LIMB_BANDS, SCALE_LIMB).shade(1, 0.35);
  b.loft([[0.105, 0.176 + lo * 1.5, 0.117 + lo * 1.5, 0.008], [0.150, 0.180 + lo * 1.5, 0.115 + lo * 1.5, 0.005]], rt, { power: TORSO_POWER, capStart: false, capEnd: false });
}

export function buildBodywear(b: GeoBuilder): void {
  if (b.detail === 2) return;
  tacticalVest(b);
  if (b.detail === 0) { guards(b, 1); guards(b, -1); }
  markings(b);
  chasuble(b);
  sash(b);
  clothing(b);
  gearAndBags(b);
}
