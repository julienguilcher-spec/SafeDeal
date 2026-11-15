/* Apparence : traduit un PersonLook du contrat en palette de couleurs, masque de pièces et cellules de
 * texte, écrits dans une ligne de la texture d'apparence. Logique pure (ni Three.js ni DOM). */

import type { PersonLook } from '@/core/contracts';
import {
  PALETTE_SIZE, SLOT_ACCENT, SLOT_BAND, SLOT_BOTTOM, SLOT_COVER, SLOT_FACELOW, SLOT_GEAR, SLOT_HAIR,
  SLOT_HAND, SLOT_HEADTOP, SLOT_PACK, SLOT_SHIN, SLOT_SHOES, SLOT_SKIN, SLOT_SLEEVE, SLOT_TOP, SLOT_TORSO,
  SLOT_VEST,
} from './geo';
import {
  MASK_BITS, PART_ARMBAND, PART_ARM_GUARDS, PART_BACKPACK, PART_BACK_TEXT, PART_BACK_TEXT_VEST, PART_BADGE, PART_BADGE_VEST,
  PART_BALACLAVA, PART_BEANIE, PART_BEARD, PART_BELT_GEAR, PART_CALOT, PART_CAP, PART_CAP_POLICE,
  PART_CHASUBLE, PART_CHEST_TEXT, PART_CHEST_TEXT_VEST, PART_COAT, PART_CROSS, PART_FACE_COVER,
  PART_GAS_MASK, PART_GOGGLES, PART_HAIR_AFRO, PART_HAIR_BUN, PART_HAIR_BUZZ, PART_HAIR_LONG,
  PART_HAIR_MEDIUM, PART_HAIR_PONYTAIL, PART_HAIR_SHORT, PART_HAND_L_FIST, PART_HAND_L_OPEN,
  PART_HAND_R_FIST, PART_HAND_R_OPEN, PART_HELMET_LIGHT, PART_HELMET_MO, PART_HELMET_MOTO,
  PART_HELMET_POMPIER, PART_HELMET_STRIPES, PART_HELMET_TEXT, PART_HOOD_DOWN, PART_HOOD_UP, PART_JACKET,
  PART_LEG_GUARDS, PART_LIMB_BANDS, PART_RANK, PART_REFLECT_BANDS, PART_SASH, PART_SCARF, PART_SKIRT,
  PART_SUIT, PART_VEST_TACTICAL,
} from './parts';

/** Largeur d'une ligne de la texture d'apparence (texels RGBA). */
export const LOOK_W = PALETTE_SIZE + 2;
export const LOOK_OPT = PALETTE_SIZE;
export const LOOK_TEXT = PALETTE_SIZE + 1;

/** Couleurs de référence des tenues officielles (sRGB). */
export const UNIFORM = {
  crsNavy: 0x26304e,
  crsVest: 0x2c303b,
  crsHelmet: 0x222a3e,
  crsStripe: 0xf2c200,
  gendarmeBlue: 0x1f2740,
  gendarmeVest: 0x2b2d34,
  gendarmeHelmet: 0x2259c0,
  bravmJacket: 0x2f3138,
  bravmTrousers: 0x2a2c33,
  bravmHelmet: 0xe8ebee,
  policeArmband: 0xff5a1f,
  serviceNavy: 0x27325a,
  pompierNavy: 0x232842,
  pompierBand: 0xd9d14a,
  pompierHelmet: 0xcdd2d8,
  samuWhite: 0xeef0f2,
  samuBlue: 0x1d3f8a,
  samuBand: 0x9fb0c8,
  blocBlack: 0x2d2d31,
  fluoYellow: 0xd9f000,
  syndicalRed: 0xc8161d,
  medicWhite: 0xf0f0ee,
  observerBlue: 0x2a6fd6,
  bootBlack: 0x2a2a2d,
  gloveBlack: 0x2e2e32,
} as const;

/** Informations annexes renvoyées au rendu. */
export interface LookInfo {
  /** 0 = aucune visière ; 1 = visière MO relevée ; 2 = baissée ; 3 = écran de casque de pompier. */
  visor: number;
  /** La personne porte un équipement volumineux (pour la silhouette lointaine). */
  helmeted: boolean;
}

export const lookInfo: LookInfo = { visor: 0, helmeted: false };

function lin(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const pal = new Float32Array(PALETTE_SIZE * 3);
const mask = new Uint32Array(3);

function setc(slot: number, hex: number): void {
  pal[slot * 3] = lin(((hex >> 16) & 255) / 255);
  pal[slot * 3 + 1] = lin(((hex >> 8) & 255) / 255);
  pal[slot * 3 + 2] = lin((hex & 255) / 255);
}

function copyc(dst: number, src: number): void {
  pal[dst * 3] = pal[src * 3];
  pal[dst * 3 + 1] = pal[src * 3 + 1];
  pal[dst * 3 + 2] = pal[src * 3 + 2];
}

function on(part: number): void {
  mask[(part / MASK_BITS) | 0] |= 1 << (part % MASK_BITS);
}

const HAIR_PARTS = [PART_HAIR_BUZZ, PART_HAIR_SHORT, PART_HAIR_MEDIUM, PART_HAIR_LONG, PART_HAIR_PONYTAIL, PART_HAIR_BUN, PART_HAIR_AFRO];
const CAP_COLORS = [0x1c2430, 0x2b2b2e, 0x6b1f24, 0x25402c, 0x3a3f55, 0x8a8f96, 0x20242c, 0x4a3a2a];
const PACK_COLORS = [0x2a2a2e, 0x333a48, 0x5a2226, 0x274a36, 0x4a4128, 0x2b3c60, 0x60646a, 0x26262a];
const HELMET_CIVIL = [0x26272b, 0xe6e6e2, 0x8a1418, 0x3a404a];

/**
 * Écrit dans `out` (à partir de `o`, LOOK_W × 4 nombres) la palette, le masque de pièces et les cellules
 * de texte d'une personne. `variant` : entier propre à la personne ; `fistL` / `fistR` : poing fermé
 * (objet en main) ; `wet`, `burning` : 0..1 ; `cellOf` : cellule d'atlas d'un texte (0 = aucune) ;
 * `compact` : la personne n'est pas debout (les pans rigides — manteau, jupe — sont alors raccourcis).
 */
export function resolveLook(
  look: PersonLook, variant: number, fistL: boolean, fistR: boolean, wet: number, burning: number,
  cellOf: (text: string) => number, out: Float32Array, o: number, compact = false,
): LookInfo {
  mask[0] = 0; mask[1] = 0; mask[2] = 0;
  const ex = look.extras;
  const outfit = look.outfit;
  const v = variant;

  // ── couleurs de base ──
  setc(SLOT_SKIN, look.skin);
  setc(SLOT_HAIR, look.hair);
  setc(SLOT_TOP, look.top);
  setc(SLOT_BOTTOM, look.bottom);
  setc(SLOT_SHOES, look.shoes);
  setc(SLOT_VEST, look.vest || 0x888888);
  setc(SLOT_GEAR, CAP_COLORS[v & 7]);
  setc(SLOT_ACCENT, look.armband || 0x7a1c22);
  setc(SLOT_BAND, 0xe8e8e4);
  setc(SLOT_COVER, 0x2a2a2e);
  setc(SLOT_PACK, PACK_COLORS[(v >> 3) & 7]);
  let gloves = 0;           // couleur de gants (0 = mains nues)
  let shortSleeves = false;
  let bareLegs = false;
  let backText: string = look.backText;
  let chestText = '';
  let vestTac = false;
  let chas = false;
  let jacket = 0;            // 0 aucun, 1 blouson, 2 manteau
  let hoodDown = false;
  let scarf = false;
  let uniformed = false;
  let badge = false;

  switch (outfit) {
    case 'crs_mo':
      uniformed = true;
      setc(SLOT_TOP, UNIFORM.crsNavy); setc(SLOT_BOTTOM, UNIFORM.crsNavy); setc(SLOT_SHOES, UNIFORM.bootBlack);
      setc(SLOT_VEST, UNIFORM.crsVest); setc(SLOT_GEAR, UNIFORM.crsHelmet); setc(SLOT_BAND, UNIFORM.crsStripe);
      gloves = UNIFORM.gloveBlack; vestTac = true;
      on(PART_ARM_GUARDS); on(PART_LEG_GUARDS); on(PART_BELT_GEAR);
      if (!backText) backText = 'POLICE';
      chestText = 'POLICE';
      badge = true;
      break;
    case 'gendarme_mo':
      uniformed = true;
      setc(SLOT_TOP, UNIFORM.gendarmeBlue); setc(SLOT_BOTTOM, UNIFORM.gendarmeBlue); setc(SLOT_SHOES, UNIFORM.bootBlack);
      setc(SLOT_VEST, UNIFORM.gendarmeVest); setc(SLOT_GEAR, UNIFORM.gendarmeHelmet); setc(SLOT_BAND, 0xdfe3ea);
      gloves = UNIFORM.gloveBlack; vestTac = true;
      on(PART_ARM_GUARDS); on(PART_LEG_GUARDS); on(PART_BELT_GEAR);
      if (!backText) backText = 'GENDARMERIE';
      chestText = 'GENDARMERIE';
      break;
    case 'bravm':
      uniformed = true;
      setc(SLOT_TOP, UNIFORM.bravmJacket); setc(SLOT_BOTTOM, UNIFORM.bravmTrousers); setc(SLOT_SHOES, UNIFORM.bootBlack);
      setc(SLOT_GEAR, UNIFORM.bravmHelmet); setc(SLOT_VEST, UNIFORM.bravmJacket);
      gloves = UNIFORM.gloveBlack; vestTac = true;
      on(PART_ARM_GUARDS); on(PART_BELT_GEAR);
      if (!backText) backText = 'POLICE';
      chestText = 'POLICE';
      break;
    case 'crs_service':
      uniformed = true;
      setc(SLOT_TOP, UNIFORM.serviceNavy); setc(SLOT_BOTTOM, UNIFORM.serviceNavy); setc(SLOT_SHOES, UNIFORM.bootBlack);
      setc(SLOT_GEAR, UNIFORM.serviceNavy);
      jacket = 1; on(PART_BELT_GEAR);
      if (!backText) backText = 'POLICE';
      chestText = 'POLICE';
      badge = true;
      break;
    case 'police_civil':
      setc(SLOT_ACCENT, look.armband || UNIFORM.policeArmband);
      on(PART_ARMBAND); on(PART_BELT_GEAR);
      jacket = 1;
      chestText = 'POLICE';
      setc(SLOT_GEAR, HELMET_CIVIL[0]);
      break;
    case 'commissaire':
      on(PART_SUIT);
      setc(SLOT_ACCENT, 0x1c2a4a);
      jacket = ((v >> 5) & 1) ? 2 : 1;
      setc(SLOT_GEAR, UNIFORM.serviceNavy);
      break;
    case 'costume':
      on(PART_SUIT);
      setc(SLOT_ACCENT, [0x6a1020, 0x1c2a4a, 0x2c2c30, 0x3a4a2a][(v >> 6) & 3]);
      jacket = 1;
      break;
    case 'pompier':
      uniformed = true;
      setc(SLOT_TOP, UNIFORM.pompierNavy); setc(SLOT_BOTTOM, UNIFORM.pompierNavy); setc(SLOT_SHOES, UNIFORM.bootBlack);
      setc(SLOT_GEAR, UNIFORM.pompierHelmet); setc(SLOT_BAND, UNIFORM.pompierBand);
      gloves = 0x2a2a2c; jacket = 2;
      on(PART_LIMB_BANDS);
      chestText = backText;
      break;
    case 'samu':
      uniformed = true;
      setc(SLOT_TOP, UNIFORM.samuWhite); setc(SLOT_BOTTOM, UNIFORM.samuBlue); setc(SLOT_SHOES, 0x18181a);
      setc(SLOT_BAND, UNIFORM.samuBand); setc(SLOT_GEAR, 0xf2f2f0);
      jacket = 1;
      on(PART_LIMB_BANDS);
      if (!backText) backText = 'SAMU';
      chestText = backText;
      break;
    case 'black_bloc':
      setc(SLOT_TOP, UNIFORM.blocBlack); setc(SLOT_BOTTOM, (v & 1) ? 0x303035 : 0x33363d); setc(SLOT_SHOES, 0x2a2a2c);
      setc(SLOT_GEAR, 0x2d2d31); setc(SLOT_PACK, 0x34343a); setc(SLOT_COVER, 0x29292c);
      gloves = (v >> 4) & 1 ? UNIFORM.gloveBlack : 0;
      hoodDown = look.headgear !== 'capuche';
      if (look.faceCover && ((v >> 5) & 3) !== 0) on(PART_GOGGLES);
      break;
    case 'gilet_fluo':
      setc(SLOT_VEST, look.vest || UNIFORM.fluoYellow);
      chas = true; on(PART_REFLECT_BANDS);
      break;
    case 'syndical':
      setc(SLOT_VEST, look.vest || UNIFORM.syndicalRed);
      chas = true;
      break;
    case 'street_medic':
      setc(SLOT_VEST, look.vest || UNIFORM.medicWhite);
      setc(SLOT_GEAR, 0xf2f2ee); setc(SLOT_PACK, 0x8a1418);
      chas = true; on(PART_CROSS);
      break;
    case 'presse':
      setc(SLOT_GEAR, HELMET_CIVIL[(v >> 6) & 1]);
      setc(SLOT_BAND, ((v >> 6) & 1) ? 0x18181a : 0xf0f0ec);
      setc(SLOT_ACCENT, look.armband || 0xf0f0ec);
      if (!backText) backText = 'PRESSE';
      chestText = backText;
      jacket = 1;
      break;
    case 'observateur':
      setc(SLOT_VEST, look.vest || UNIFORM.observerBlue);
      setc(SLOT_GEAR, 0x2d6cdf); setc(SLOT_BAND, 0xf0f0ec);
      chas = true;
      if (!backText) backText = 'OBSERVATEUR';
      break;
    case 'sport':
      hoodDown = ((v >> 2) & 3) === 0;
      shortSleeves = ((v >> 4) & 3) === 0;
      break;
    default: {
      // civils : variété déterministe (blouson, manteau, capuche, manches courtes, écharpe)
      const j = v & 3;
      if (j < 2) jacket = ((v >> 11) & 7) === 0 ? 2 : 1;
      else {
        hoodDown = ((v >> 2) & 3) === 0;
        shortSleeves = ((v >> 4) & 7) < 2;
      }
      scarf = ((v >> 7) & 15) === 0;
      if (look.vest) { chas = true; }
      break;
    }
  }
  if (!uniformed && look.vest && !chas) chas = true;

  // options libres (extras)
  if (ex) {
    if (ex.jacket !== undefined) { jacket = ex.jacket | 0; if (jacket > 0) shortSleeves = false; }
    if (ex.sleeves !== undefined) shortSleeves = ex.sleeves === 0;
    if (ex.shorts) bareLegs = true;
    if (ex.skirt) { if (!compact) on(PART_SKIRT); bareLegs = true; }
    if (ex.beard) on(PART_BEARD);
    if (ex.scarf !== undefined) scarf = ex.scarf > 0;
    if (ex.gloves) gloves = ex.gloves;
    if (ex.helmetColor) setc(SLOT_GEAR, ex.helmetColor);
    if (ex.bandColor) setc(SLOT_BAND, ex.bandColor);
    if (ex.packColor) setc(SLOT_PACK, ex.packColor);
    if (ex.coverColor) setc(SLOT_COVER, ex.coverColor);
    if (ex.goggles) on(PART_GOGGLES);
    if (ex.hoodDown !== undefined) hoodDown = ex.hoodDown > 0;
  }

  if (compact && jacket === 2) jacket = 1;

  // ── tête ──
  let helmeted = false;
  let visor = 0;
  let hairAllowed = 2;       // 2 = toutes coiffures, 1 = coiffures plates, 0 = aucune
  let headTop = SLOT_HAIR;
  let faceLow = SLOT_SKIN;
  switch (look.headgear) {
    case 'casque_crs':
      on(PART_HELMET_MO); on(PART_HELMET_STRIPES); helmeted = true; hairAllowed = 0; headTop = SLOT_GEAR;
      if (outfit !== 'crs_mo' && !(ex && ex.helmetColor)) { setc(SLOT_GEAR, UNIFORM.crsHelmet); setc(SLOT_BAND, UNIFORM.crsStripe); }
      visor = look.visorDown ? 2 : 1;
      break;
    case 'casque_gendarme':
      on(PART_HELMET_MO); helmeted = true; hairAllowed = 0; headTop = SLOT_GEAR;
      if (outfit !== 'gendarme_mo' && !(ex && ex.helmetColor)) setc(SLOT_GEAR, UNIFORM.gendarmeHelmet);
      visor = look.visorDown ? 2 : 1;
      break;
    case 'casque_moto':
      on(PART_HELMET_MOTO); helmeted = true; hairAllowed = 0; headTop = SLOT_GEAR; faceLow = SLOT_GEAR;
      if (outfit !== 'bravm' && !(ex && ex.helmetColor)) setc(SLOT_GEAR, HELMET_CIVIL[(v >> 8) & 3]);
      break;
    case 'casque_presse':
      on(PART_HELMET_LIGHT); on(PART_HELMET_TEXT); helmeted = true; hairAllowed = 0; headTop = SLOT_GEAR;
      break;
    case 'casque_medic':
      on(PART_HELMET_LIGHT); on(PART_CROSS); helmeted = true; hairAllowed = 0; headTop = SLOT_GEAR;
      if (!(ex && ex.helmetColor)) setc(SLOT_GEAR, 0xf2f2ee);
      break;
    case 'casque_pompier':
      on(PART_HELMET_POMPIER); helmeted = true; hairAllowed = 0; headTop = SLOT_GEAR;
      if (outfit !== 'pompier' && !(ex && ex.helmetColor)) { setc(SLOT_GEAR, UNIFORM.pompierHelmet); setc(SLOT_BAND, UNIFORM.pompierBand); }
      visor = look.visorDown ? 3 : 0;
      break;
    case 'capuche': on(PART_HOOD_UP); hairAllowed = 0; headTop = SLOT_TOP; hoodDown = false; break;
    case 'casquette': on(PART_CAP); hairAllowed = 1; headTop = SLOT_GEAR; break;
    case 'bonnet': on(PART_BEANIE); hairAllowed = 1; headTop = SLOT_GEAR; break;
    case 'cagoule': on(PART_BALACLAVA); hairAllowed = 0; headTop = SLOT_GEAR; faceLow = SLOT_GEAR; if (!(ex && ex.helmetColor)) setc(SLOT_GEAR, 0x262629); break;
    case 'calot': on(PART_CALOT); hairAllowed = 1; if (!(ex && ex.helmetColor)) setc(SLOT_GEAR, UNIFORM.serviceNavy); break;
    case 'casquette_police': on(PART_CAP_POLICE); hairAllowed = 1; headTop = SLOT_GEAR; if (!(ex && ex.helmetColor)) setc(SLOT_GEAR, UNIFORM.serviceNavy); break;
    default: break;
  }
  if (hairAllowed > 0) {
    let hs = look.hairStyle | 0;
    if (hs >= 0 && hs < HAIR_PARTS.length) {
      if (hairAllowed === 1 && hs === 6) hs = 1;
      on(HAIR_PARTS[hs]);
    } else if (hs >= HAIR_PARTS.length && hairAllowed === 2) {
      headTop = SLOT_SKIN;    // crâne chauve
    }
  }
  if (look.gasMask) {
    on(PART_GAS_MASK); faceLow = SLOT_COVER; setc(SLOT_COVER, 0x2a2c2f);
  } else if (look.faceCover && look.headgear !== 'cagoule' && look.headgear !== 'casque_moto') {
    on(PART_FACE_COVER); faceLow = SLOT_COVER;
  }

  // ── tronc ──
  let torso = SLOT_TOP;
  if (vestTac) {
    on(PART_VEST_TACTICAL); torso = SLOT_VEST;
    if (backText) on(PART_BACK_TEXT_VEST);
    if (chestText) on(PART_CHEST_TEXT_VEST);
    if (badge) on(PART_BADGE_VEST);
    if (look.rankBars > 0) on(PART_RANK);
  } else {
    if (chas) { on(PART_CHASUBLE); torso = SLOT_VEST; }
    if (backText) on(PART_BACK_TEXT);
    if (chestText && (uniformed || outfit === 'presse')) on(PART_CHEST_TEXT);
    if (badge) on(PART_BADGE);
    if (jacket === 1 && !chas) on(PART_JACKET);
    else if (jacket === 2 && !chas) on(PART_COAT);
    if (hoodDown && !look.backpack) on(PART_HOOD_DOWN);
    if (scarf && !look.faceCover && !look.gasMask) { on(PART_SCARF); setc(SLOT_COVER, CAP_COLORS[(v >> 9) & 7]); }
  }
  if (look.sash) on(PART_SASH);
  if (look.armband) { on(PART_ARMBAND); if (!chestText) chestText = backText; }
  if (look.backpack) on(PART_BACKPACK);

  // ── membres ──
  if (shortSleeves) copyc(SLOT_SLEEVE, SLOT_SKIN); else copyc(SLOT_SLEEVE, SLOT_TOP);
  if (bareLegs) copyc(SLOT_SHIN, SLOT_SKIN); else copyc(SLOT_SHIN, SLOT_BOTTOM);
  if (gloves) setc(SLOT_HAND, gloves); else copyc(SLOT_HAND, SLOT_SKIN);
  on(fistL ? PART_HAND_L_FIST : PART_HAND_L_OPEN);
  on(fistR ? PART_HAND_R_FIST : PART_HAND_R_OPEN);

  // ── silhouette lointaine ──
  copyc(SLOT_HEADTOP, headTop);
  copyc(SLOT_FACELOW, faceLow);
  copyc(SLOT_TORSO, torso);

  // ── états : vêtements mouillés (plus sombres), suie des brûlures ──
  if (wet > 0.02 || burning > 0.02) {
    const kw = 1 - 0.32 * (wet > 1 ? 1 : wet);
    const kb = 1 - 0.75 * (burning > 1 ? 1 : burning);
    for (let s = 0; s < PALETTE_SIZE; s++) {
      const cloth = s !== SLOT_SKIN && s !== SLOT_HAIR && s !== SLOT_GEAR && s !== SLOT_BAND;
      const k = (cloth ? kw : 1) * kb;
      pal[s * 3] *= k; pal[s * 3 + 1] *= k; pal[s * 3 + 2] *= k;
    }
  }

  // ── écriture ──
  for (let s = 0; s < PALETTE_SIZE; s++) {
    out[o + s * 4] = pal[s * 3];
    out[o + s * 4 + 1] = pal[s * 3 + 1];
    out[o + s * 4 + 2] = pal[s * 3 + 2];
    out[o + s * 4 + 3] = 0;
  }
  const oo = o + LOOK_OPT * 4;
  out[oo] = mask[0]; out[oo + 1] = mask[1]; out[oo + 2] = mask[2]; out[oo + 3] = 0;
  const ot = o + LOOK_TEXT * 4;
  out[ot] = backText ? cellOf(backText) : 0;
  out[ot + 1] = chestText ? cellOf(chestText) : 0;
  out[ot + 2] = look.rankBars > 0 ? cellOf('#' + Math.min(6, look.rankBars | 0)) : 0;
  out[ot + 3] = 0;

  lookInfo.visor = visor;
  lookInfo.helmeted = helmeted;
  return lookInfo;
}

/** Signature numérique d'un look : change dès qu'un champ pris en compte change (détection à bas coût). */
export function lookSignature(look: PersonLook): number {
  return look.height * 1009 + look.build * 7919 + look.skin * 1.0000001 + look.hair * 3.0000003 + look.hairStyle * 131
    + look.top * 5.0000007 + look.bottom * 7.0000011 + look.shoes * 11.0000013 + look.armband * 13.0000017
    + look.vest * 17.0000019 + look.rankBars * 257 + (look.visorDown ? 1031 : 0) + (look.gasMask ? 2053 : 0)
    + (look.faceCover ? 4099 : 0) + (look.sash ? 8209 : 0) + (look.backpack ? 16411 : 0);
}
