/* =====================================================================================
 * ARCHÉTYPES — SECOURS, PRESSE, OBSERVATEURS : sapeurs-pompiers, SAMU, street medics,
 * journalistes (photographe, reporter d'images, équipe de direct) et observateurs associatifs.
 *
 * Sources : docs/research/00-bible-realisme.md §D ; docs/research/02-materiel-tenues-vehicules.md §6.2 ;
 * docs/research/06-roles-jouables.md §10 (secours) et §11 (journaliste : trois métiers ; aucun signe
 * distinctif n'est obligatoire, un journaliste sans marquage existe) ; §13 (observateur).
 * ===================================================================================== */

import type { PersonKind, Rng } from '@/core/contracts';
import { VARIANT } from './api';
import type { BodySpec, Draft, Identity } from './model';
import { kitAdd } from './model';
import {
  BOOT_BLACK, MEDIC_BLUE, MEDIC_RED, MEDIC_WHITE, OBSERVER_BLUE, OBSERVER_VEST, POMPIER_BAND, POMPIER_HELMET,
  POMPIER_NAVY, PRESS_ARMBAND, PRESS_HELMET_BLACK, PRESS_HELMET_WHITE, SAMU_BLUE, SAMU_WHITE,
} from './palette';

export type TiersKind = 'pompier' | 'samu' | 'street_medic' | 'journaliste' | 'observateur';

export function isTiersKind(kind: PersonKind): kind is TiersKind {
  return kind === 'pompier' || kind === 'samu' || kind === 'street_medic' || kind === 'journaliste' || kind === 'observateur';
}

export const TIERS_BODY: Readonly<Record<TiersKind, BodySpec>> = {
  pompier: { women: 0.08, ageMin: 20, ageMax: 45, agePeak: 28, fitMin: 1.04, fitMax: 1.12, vivid: 0 },
  samu: { women: 0.5, ageMin: 25, ageMax: 58, agePeak: 37, fitMin: 0.95, fitMax: 1.05, vivid: 0 },
  street_medic: { women: 0.5, ageMin: 20, ageMax: 45, agePeak: 27, fitMin: 0.97, fitMax: 1.08, vivid: 0.25 },
  journaliste: { women: 0.4, ageMin: 23, ageMax: 58, agePeak: 34, fitMin: 0.95, fitMax: 1.06, vivid: 0.05 },
  observateur: { women: 0.5, ageMin: 24, ageMax: 68, agePeak: 40, fitMin: 0.9, fitMax: 1.02, vivid: 0.05 },
};

/** Variantes d'un journaliste et leurs poids : photographe, reporter d'images, équipe de direct. */
const PRESS_VARIANTS = [VARIANT.photographe, VARIANT.reporter_images, VARIANT.direct];
const POMPIER_VARIANTS = [VARIANT.porte_lance, VARIANT.porte_lance, VARIANT.secours_victime, VARIANT.secours_victime, VARIANT.chef_agres];
const SAMU_VARIANTS = [VARIANT.medecin, VARIANT.infirmier, VARIANT.ambulancier];

function pickVariant(rng: Rng, variant: number, allowed: readonly number[]): number {
  const roll = rng.next();
  if (allowed.indexOf(variant) >= 0) return variant;
  return allowed[Math.floor(roll * allowed.length)]!;
}

function uniformLook(d: Draft): void {
  const e = d.extras;
  e.sleeves = 1;
  e.scarf = 0;
  delete e.shorts;
  delete e.skirt;
  delete e.hoodDown;
  d.backpack = false;
  d.faceCover = false;
}

/**
 * Habille et dote un secouriste, un journaliste ou un observateur.
 * `unmarked` : journaliste sans aucun signe « PRESSE » (−1 : tiré d'après la graine, 15 %).
 */
export function dressTiers(d: Draft, id: Identity, kind: TiersKind, variant: number, unmarked: number, rng: Rng): void {
  const e = d.extras;
  switch (kind) {
    case 'pompier': {
      // sapeur-pompier de Paris : tenue marine à bandes rétroréfléchissantes, casque chromé
      const v = pickVariant(rng, variant, POMPIER_VARIANTS);
      uniformLook(d);
      d.outfit = 'pompier';
      d.headgear = 'casque_pompier';
      d.top = POMPIER_NAVY;
      d.bottom = POMPIER_NAVY;
      d.shoes = BOOT_BLACK;
      d.backText = 'SAPEURS-POMPIERS';
      d.armorHead = 0.8;
      d.armorBody = 0.5;
      d.gasProtection = 0.2;
      e.helmetColor = POMPIER_HELMET;
      e.bandColor = POMPIER_BAND;
      e.gloves = 0x2a2a2c;
      e.jacket = 2;
      e.variant = v;
      if (v === VARIANT.porte_lance) {
        kitAdd(d, 'lance_incendie', 1);
        kitAdd(d, 'extincteur', 15);
        kitAdd(d, 'radio', 1);
        kitAdd(d, 'lampe', 1);
        d.hand = 'lance_incendie';
      } else if (v === VARIANT.secours_victime) {
        kitAdd(d, 'trousse_secours', 10);
        kitAdd(d, 'serum_physiologique', 20);
        kitAdd(d, 'brancard', 1);
        kitAdd(d, 'radio', 1);
        d.backpack = true;
        e.packColor = MEDIC_RED;
      } else {
        kitAdd(d, 'radio', 1);
        kitAdd(d, 'trousse_secours', 10);
        kitAdd(d, 'extincteur', 15);
        kitAdd(d, 'lampe', 1);
        e.radios = 2;
      }
      break;
    }
    case 'samu': {
      // équipe médicale : tenue blanche et bleue à bandes, « SAMU » dans le dos, sac rouge
      const v = pickVariant(rng, variant, SAMU_VARIANTS);
      uniformLook(d);
      d.outfit = 'samu';
      d.headgear = 'none';
      d.top = SAMU_WHITE;
      d.bottom = SAMU_BLUE;
      d.shoes = 0x18181a;
      d.backText = 'SAMU';
      e.jacket = 1;
      e.variant = v;
      kitAdd(d, 'trousse_secours', 10);
      kitAdd(d, 'serum_physiologique', 20);
      if (v === VARIANT.ambulancier) kitAdd(d, 'brancard', 1);
      kitAdd(d, 'radio', 1);
      if (v !== VARIANT.ambulancier) {
        d.backpack = true;
        e.packColor = MEDIC_RED;
      }
      d.hand = '';
      break;
    }
    case 'street_medic': {
      // secouriste bénévole : tee-shirt ou chasuble à croix, casque de skate, masque, lunettes, sac à dos
      const helmetRoll = rng.next();
      const crossRoll = rng.next();
      const maskRoll = rng.next();
      const gasMaskRoll = rng.next();
      d.outfit = 'street_medic';
      d.headgear = 'casque_medic';
      d.vest = MEDIC_WHITE;
      d.armband = crossRoll < 0.5 ? MEDIC_RED : MEDIC_BLUE;
      d.backpack = true;
      d.faceCover = maskRoll < 0.6;
      d.armorHead = 0.45;
      d.gasProtection = d.faceCover ? 0.5 : 0.25;
      e.helmetColor = helmetRoll < 0.65 ? 0xf2f2ee : MEDIC_RED;
      e.packColor = MEDIC_RED;
      e.goggles = 1;
      e.scarf = 0;
      delete e.skirt;
      kitAdd(d, 'serum_physiologique', 20);
      kitAdd(d, 'trousse_secours', 10);
      kitAdd(d, 'telephone', 1);
      if (gasMaskRoll < 0.5) kitAdd(d, 'masque_gaz', 1);
      d.hand = '';
      break;
    }
    case 'journaliste': {
      const v = pickVariant(rng, variant, PRESS_VARIANTS);
      const unmarkedRoll = rng.next();
      const helmetRoll = rng.next();
      const maskRoll = rng.next();
      const camRoll = rng.next();
      const bare = unmarked === 1 || (unmarked < 0 && unmarkedRoll < 0.15);
      e.variant = v;
      if (bare) {
        // aucun signe n'est obligatoire : seul le matériel en main le distingue de la foule
        e.unmarked = 1;
        d.outfit = 'civil';
        d.headgear = id.hat === 'capuche' ? 'none' : id.hat;
        d.backpack = true;
      } else {
        d.outfit = 'presse';
        d.headgear = 'casque_presse';
        d.backText = 'PRESSE';
        d.armband = PRESS_ARMBAND;
        d.armorHead = 0.5;
        d.armorBody = 0.2;
        d.backpack = v !== VARIANT.direct;
        const white = helmetRoll < 0.4;
        e.helmetColor = white ? PRESS_HELMET_WHITE : PRESS_HELMET_BLACK;
        e.bandColor = white ? PRESS_HELMET_BLACK : PRESS_HELMET_WHITE;
        e.jacket = 1;
        e.sleeves = 1;
        e.goggles = maskRoll < 0.5 ? 1 : 0;
        if (e.goggles === 0) delete e.goggles;
      }
      if (v === VARIANT.photographe) {
        kitAdd(d, 'appareil_photo', 24);
        kitAdd(d, 'telephone', 1);
        d.hand = 'appareil_photo';
      } else if (v === VARIANT.reporter_images) {
        // journaliste reporter d'images : tourne et prend le son, seul
        kitAdd(d, 'camera_tv', 1);
        kitAdd(d, 'micro', 1);
        kitAdd(d, 'telephone', 1);
        d.hand = 'camera_tv';
      } else {
        // équipe de direct : micro en main, téléphone sur stabilisateur ; un sur deux tient la caméra
        if (camRoll < 0.5) {
          kitAdd(d, 'camera_tv', 1);
          kitAdd(d, 'micro', 1);
          d.hand = 'camera_tv';
        } else {
          kitAdd(d, 'micro', 1);
          d.hand = 'micro';
        }
        kitAdd(d, 'telephone', 1);
      }
      if (!bare && maskRoll < 0.6) kitAdd(d, 'masque_gaz', 1);
      break;
    }
    default: {
      // observateur associatif : chasuble blanche siglée, coiffe bleue, carnet et téléphone
      const hatRoll = rng.next();
      const camRoll = rng.next();
      d.outfit = 'observateur';
      d.vest = OBSERVER_VEST;
      d.backText = 'OBSERVATEUR';
      d.headgear = hatRoll < 0.7 ? 'casquette' : hatRoll < 0.85 ? 'bonnet' : 'none';
      d.armorHead = d.headgear === 'none' ? 0 : 0.1;
      d.gasProtection = 0.2;
      d.backpack = id.packRoll < 0.6;
      e.helmetColor = OBSERVER_BLUE;
      e.goggles = 1;
      kitAdd(d, 'telephone', 1);
      if (camRoll < 0.3) kitAdd(d, 'appareil_photo', 24);
      d.hand = 'telephone';
      break;
    }
  }
}

export const TIERS_LABELS: Readonly<Record<TiersKind, string>> = {
  pompier: 'Sapeur-pompier',
  samu: 'SAMU',
  street_medic: 'Street medic',
  journaliste: 'Journaliste',
  observateur: 'Observateur',
};
