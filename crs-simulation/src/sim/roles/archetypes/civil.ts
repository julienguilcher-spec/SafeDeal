/* =====================================================================================
 * ARCHÉTYPES — CIVILS : passant, touriste, commerçant, conducteur, personnalité officielle.
 *
 * Sources : docs/research/00-bible-realisme.md §D (palette neutre, sacs de courses, téléphone levé,
 * tablier) ; docs/research/03-dynamique-manifestation.md §2.1 (badaud, touriste, commerçant).
 * La personnalité officielle ne porte PAS d'écharpe : dans le jeu, l'insigne tricolore est réservé
 * à l'autorité habilitée à prononcer les sommations.
 * ===================================================================================== */

import type { ItemId, PersonKind, Rng } from '@/core/contracts';
import { VARIANT } from './api';
import type { BodySpec, Draft, Identity } from './model';
import { kitAdd, pickOf } from './model';
import { APRON_COLORS, SUIT_COLORS, VIVID_TOPS } from './palette';

export type CivilKind = 'passant' | 'touriste' | 'commercant' | 'conducteur' | 'vip';

export function isCivilKind(kind: PersonKind): kind is CivilKind {
  return kind === 'passant' || kind === 'touriste' || kind === 'commercant' || kind === 'conducteur' || kind === 'vip';
}

export const CIVIL_BODY: Readonly<Record<CivilKind, BodySpec>> = {
  passant: { women: 0.5, ageMin: 16, ageMax: 82, agePeak: 36, fitMin: 0.88, fitMax: 1.05, vivid: 0.1 },
  touriste: { women: 0.5, ageMin: 18, ageMax: 72, agePeak: 38, fitMin: 0.88, fitMax: 1.03, vivid: 0.4 },
  commercant: { women: 0.45, ageMin: 22, ageMax: 64, agePeak: 42, fitMin: 0.9, fitMax: 1.03, vivid: 0.05 },
  conducteur: { women: 0.4, ageMin: 20, ageMax: 70, agePeak: 40, fitMin: 0.88, fitMax: 1.03, vivid: 0.08 },
  vip: { women: 0.42, ageMin: 36, ageMax: 68, agePeak: 52, fitMin: 0.88, fitMax: 1.0, vivid: 0 },
};

export const CIVIL_LABELS: Readonly<Record<CivilKind, string>> = {
  passant: 'Passant',
  touriste: 'Touriste',
  commercant: 'Commerçant',
  conducteur: 'Conducteur',
  vip: 'Personnalité officielle',
};

const SHOP_VARIANTS = [VARIANT.cafe, VARIANT.boutique, VARIANT.alimentation];

/** Habille et dote un civil. `variant` : type de commerce (café, boutique, alimentation). */
export function dressCivil(d: Draft, id: Identity, kind: CivilKind, variant: number, rng: Rng): void {
  const e = d.extras;
  const a = rng.next();
  const b = rng.next();
  const c = rng.next();
  switch (kind) {
    case 'touriste':
      // tenue de voyage : couleurs vives, casquette, sac à dos, appareil en bandoulière
      if (a < 0.4) d.top = pickOf(rng, VIVID_TOPS);
      if (d.headgear === 'none' && b < 0.35) d.headgear = 'casquette';
      if (d.headgear === 'capuche') d.headgear = 'casquette';
      d.backpack = id.packRoll < 0.65;
      kitAdd(d, 'telephone', 1);
      if (c < 0.4) kitAdd(d, 'appareil_photo', 24);
      d.hand = 'telephone';
      break;
    case 'commercant': {
      // tablier par-dessus les vêtements (noir au café, vert ou blanc dans l'alimentation), chemise en boutique
      const v = SHOP_VARIANTS.indexOf(variant) >= 0 ? variant : SHOP_VARIANTS[Math.floor(a * SHOP_VARIANTS.length)]!;
      e.variant = v;
      d.headgear = 'none';
      d.backpack = false;
      e.jacket = 0;
      e.scarf = 0;
      delete e.hoodDown;
      delete e.shorts;
      if (v === VARIANT.cafe) {
        d.vest = APRON_COLORS[0]!;
        d.top = 0xe9e7df;
        d.bottom = 0x17181b;
        e.sleeves = 1;
      } else if (v === VARIANT.alimentation) {
        d.vest = b < 0.5 ? APRON_COLORS[1]! : APRON_COLORS[2]!;
        e.sleeves = c < 0.5 ? 0 : 1;
      } else {
        d.top = b < 0.5 ? 0xe9e7df : 0x1f2a44;
        e.jacket = c < 0.4 ? 1 : 0;
        e.sleeves = 1;
      }
      kitAdd(d, 'telephone', 1);
      break;
    }
    case 'conducteur':
      // automobiliste : ni sac ni couvre-chef encombrant
      if (d.headgear === 'capuche') d.headgear = 'none';
      d.backpack = false;
      if (a < 0.92) kitAdd(d, 'telephone', 1);
      break;
    case 'vip': {
      // costume ou tailleur sombre
      const suit = SUIT_COLORS[Math.floor(a * SUIT_COLORS.length)]!;
      d.outfit = 'costume';
      d.top = suit;
      d.bottom = suit;
      d.shoes = 0x141414;
      d.headgear = 'none';
      d.backpack = false;
      e.jacket = 1;
      e.sleeves = 1;
      e.scarf = 0;
      delete e.hoodDown;
      delete e.shorts;
      kitAdd(d, 'telephone', 1);
      break;
    }
    default:
      // passant, riverain : tenue de ville ; un sur cinq a un sac
      d.backpack = id.packRoll < 0.22;
      if (a < 0.85) kitAdd(d, 'telephone', 1);
      break;
  }
}

/** Dotation type (pour l'interface). */
export const CIVIL_KITS: Readonly<Record<CivilKind, readonly ItemId[]>> = {
  passant: ['telephone'],
  touriste: ['telephone', 'appareil_photo'],
  commercant: ['telephone'],
  conducteur: ['telephone'],
  vip: ['telephone'],
};
