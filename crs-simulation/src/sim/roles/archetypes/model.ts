/* =====================================================================================
 * ARCHÉTYPES — modèle interne : identité d'une personne (corps, âge, tenue de ville), brouillon
 * d'habillage, et tirages déterministes.
 *
 * Principe : la graine d'une personne fixe une fois pour toutes son IDENTITÉ (sexe, âge, taille,
 * carrure, teint, cheveux, vêtements de ville, condition physique). Les tables de rôles (police,
 * tiers, cortège, civils) habillent ensuite un BROUILLON à partir de cette identité ; changer de
 * poste ou de profil ne refait que l'habillage, jamais le corps.
 * ===================================================================================== */

import type { HeadgearId, ItemId, OutfitId, Rng } from '@/core/contracts';
import { clamp } from '@/core/math';
import { gaussian, weightedIndex } from '@/core/rng';
import { PERSON_SPEED_RUN, PERSON_SPEED_SPRINT, PERSON_SPEED_WALK } from '@/core/stores';
import {
  CAP_COLORS, CIVIL_BOTTOMS, CIVIL_SHOES, CIVIL_TOPS, HAIR_DARK, HAIR_DYED, HAIR_GREY, HAIR_LIGHT, PACK_COLORS,
  SCARF_COLORS, SKIN_TONES, SKIN_WEIGHTS, VIVID_TOPS,
} from './palette';

/** Répartition d'une catégorie de personnes : sexe, âge, condition physique. */
export interface BodySpec {
  /** Part de femmes (0..1). */
  women: number;
  ageMin: number;
  ageMax: number;
  /** Âge le plus fréquent. */
  agePeak: number;
  /** Condition physique : 1 = adulte moyen (multiplie course et sprint). */
  fitMin: number;
  fitMax: number;
  /** Part de vêtements vifs et de cheveux colorés (jeunes, militants climat). */
  vivid: number;
}

/** Ce qui ne change jamais chez une personne. */
export interface Identity {
  seed: number;
  /** 0 = homme, 1 = femme. */
  sex: number;
  age: number;
  child: boolean;
  fitness: number;
  height: number;
  build: number;
  skin: number;
  hair: number;
  hairStyle: number;
  beard: number;
  // ── tenue de ville propre à la personne ──
  top: number;
  bottom: number;
  shoes: number;
  /** Couvre-chef de ville : 'none', 'casquette', 'bonnet' ou 'capuche'. */
  hat: HeadgearId;
  hatColor: number;
  /** 0 aucun, 1 blouson, 2 manteau. */
  jacket: number;
  /** 0 = manches courtes, 1 = longues. */
  sleeves: number;
  shorts: number;
  skirt: number;
  scarf: number;
  scarfColor: number;
  /** Sweat à capuche rabattue. */
  hoodDown: number;
  /** Tirage 0..1 comparé à la proportion de sacs à dos de la catégorie. */
  packRoll: number;
  packColor: number;
  // ── vitesses de base (m/s), hors charge : la locomotion applique le poids de l'équipement ──
  walk: number;
  run: number;
  sprint: number;
  // ── appartenance (manifestants) ──
  family: number;
  cause: number;
  org: number;
  // ── valeurs de base posées par le dernier habillage (pour préserver visière et masque) ──
  baseArmorHead: number;
  baseGas: number;
}

/** Nombre maximal d'objets d'une dotation. */
export const KIT_MAX = 12;

/** Brouillon d'habillage : rempli par les tables de rôles, puis écrit sur la personne. */
export interface Draft {
  top: number;
  bottom: number;
  shoes: number;
  outfit: OutfitId;
  headgear: HeadgearId;
  faceCover: boolean;
  backText: string;
  sash: boolean;
  armband: number;
  vest: number;
  rankBars: number;
  backpack: boolean;
  /** Clés supplémentaires de l'apparence (objet NEUF à chaque habillage). */
  extras: Record<string, number>;
  /** Dotation, dans l'ordre des emplacements. */
  kitIds: ItemId[];
  kitCounts: number[];
  kitN: number;
  /** Objet pris en main à la création ('' = mains libres). */
  hand: ItemId | '';
  armorHead: number;
  armorBody: number;
  gasProtection: number;
}

export function createDraft(): Draft {
  return {
    top: 0, bottom: 0, shoes: 0, outfit: 'civil', headgear: 'none', faceCover: false, backText: '', sash: false,
    armband: 0, vest: 0, rankBars: 0, backpack: false, extras: {},
    kitIds: new Array<ItemId>(KIT_MAX).fill(''), kitCounts: new Array<number>(KIT_MAX).fill(0), kitN: 0, hand: '',
    armorHead: 0, armorBody: 0, gasProtection: 0,
  };
}

/** Remet le brouillon à la tenue de ville de la personne, sans dotation. */
export function resetDraft(d: Draft, id: Identity): void {
  d.top = id.top;
  d.bottom = id.bottom;
  d.shoes = id.shoes;
  d.outfit = 'civil';
  d.headgear = id.hat;
  d.faceCover = false;
  d.backText = '';
  d.sash = false;
  d.armband = 0;
  d.vest = 0;
  d.rankBars = 0;
  d.backpack = false;
  const e: Record<string, number> = { sex: id.sex, age: id.age, jacket: id.jacket, sleeves: id.sleeves };
  if (id.shorts) e.shorts = 1;
  if (id.skirt) e.skirt = 1;
  if (id.beard) e.beard = 1;
  if (id.scarf) {
    e.scarf = 1;
    e.coverColor = id.scarfColor;
  } else {
    e.scarf = 0;
  }
  if (id.hoodDown && id.hat !== 'capuche') e.hoodDown = 1;
  if (id.hat === 'casquette' || id.hat === 'bonnet') e.helmetColor = id.hatColor;
  e.packColor = id.packColor;
  if (id.child) e.child = 1;
  d.extras = e;
  d.kitN = 0;
  d.hand = '';
  d.armorHead = 0;
  d.armorBody = 0;
  d.gasProtection = 0;
}

/** Ajoute un objet à la dotation du brouillon (cumule si déjà présent). */
export function kitAdd(d: Draft, id: ItemId, count = 1): void {
  for (let i = 0; i < d.kitN; i++) {
    if (d.kitIds[i] === id) {
      d.kitCounts[i] = d.kitCounts[i]! + count;
      return;
    }
  }
  if (d.kitN >= KIT_MAX) return;
  d.kitIds[d.kitN] = id;
  d.kitCounts[d.kitN] = count;
  d.kitN++;
}

/** Retire un objet de la dotation du brouillon. */
export function kitRemove(d: Draft, id: ItemId): void {
  for (let i = 0; i < d.kitN; i++) {
    if (d.kitIds[i] !== id) continue;
    for (let j = i + 1; j < d.kitN; j++) {
      d.kitIds[j - 1] = d.kitIds[j]!;
      d.kitCounts[j - 1] = d.kitCounts[j]!;
    }
    d.kitN--;
    if (d.hand === id) d.hand = '';
    return;
  }
}

export function kitHas(d: Draft, id: ItemId): boolean {
  for (let i = 0; i < d.kitN; i++) if (d.kitIds[i] === id) return true;
  return false;
}

/** Dotation déclarée dans une table : couples [objet, quantité]. */
export type KitTable = readonly (readonly [ItemId, number])[];

export function kitAddAll(d: Draft, table: KitTable): void {
  for (let i = 0; i < table.length; i++) kitAdd(d, table[i]![0], table[i]![1]);
}

// ───────────────────────────── tirages ─────────────────────────────

/** Loi triangulaire sur [min, max] de mode `peak`. */
export function triangular(rng: Rng, min: number, max: number, peak: number): number {
  if (!(max > min)) return min;
  const c = clamp(peak, min, max);
  const f = (c - min) / (max - min);
  const u = rng.next();
  return u < f ? min + Math.sqrt(u * (max - min) * (c - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - c));
}

export function pickOf<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.int(0, items.length)]!;
}

/** Coiffures (0 rasé, 1 court, 2 mi-long, 3 long, 4 queue de cheval, 5 chignon, 6 volumineux, 7 chauve). */
const HAIR_MEN = [14, 50, 12, 3, 2, 1, 6, 10];
const HAIR_MEN_OLD = [10, 40, 6, 1, 0, 0, 2, 38];
const HAIR_WOMEN = [1, 12, 26, 30, 16, 9, 6, 0];
const HAIR_WOMEN_OLD = [0, 34, 34, 10, 4, 16, 2, 0];
/** Coupes réglementaires ou pratiques sous un casque. */
const HAIR_MEN_DUTY = [34, 52, 4, 0, 0, 0, 0, 10];
const HAIR_WOMEN_DUTY = [0, 12, 10, 0, 34, 44, 0, 0];
const HATS: readonly HeadgearId[] = ['none', 'casquette', 'bonnet', 'capuche'];
const HAT_WEIGHTS = [74, 10, 11, 5];
const HAT_WEIGHTS_OLD = [70, 16, 14, 0];

/** Facteurs de vitesse selon l'âge : marche, puis course et sprint. */
function walkFactor(age: number): number {
  if (age < 14) return 0.84;
  if (age <= 60) return 1;
  return clamp(1 - (age - 60) * 0.0065, 0.8, 1);
}
function runFactor(age: number): number {
  if (age < 14) return 0.74 + (age - 7) * 0.012;
  if (age <= 35) return 1;
  if (age <= 60) return 1 - (age - 35) * 0.004;
  return clamp(0.9 - (age - 60) * 0.0125, 0.55, 0.9);
}

/**
 * Crée l'identité d'une personne à partir d'un générateur DÉJÀ semé avec sa graine.
 * `duty` : coupe de cheveux de service (forces de l'ordre, secours).
 * `sex`, `age` : imposés s'ils sont ≥ 0.
 */
export function createIdentity(
  rng: Rng, seed: number, spec: BodySpec, child: boolean, duty: boolean, sex: number, age: number,
): Identity {
  // l'ordre des tirages est figé : il garantit qu'une même graine redonne la même personne
  const sexRoll = rng.next();
  const ageRoll = child ? 7 + Math.floor(rng.next() * 7.999) : Math.round(triangular(rng, spec.ageMin, spec.ageMax, spec.agePeak));
  const s = sex === 0 || sex === 1 ? sex : sexRoll < spec.women ? 1 : 0;
  const a = age >= 0 ? Math.round(age) : ageRoll;
  const isChild = child || a < 15;
  const old = a >= 60;

  let height: number;
  if (isChild) {
    height = clamp(1.2 + (a - 7) * 0.042 + gaussian(rng, 0, 0.035), 1.12, 1.48);
  } else {
    const mean = (s === 1 ? 1.635 : 1.762) - (old ? 0.02 : 0);
    height = clamp(gaussian(rng, mean, s === 1 ? 0.06 : 0.068), 1.5, 1.98);
  }
  const fitness = spec.fitMin + (spec.fitMax - spec.fitMin) * rng.next();
  const build = clamp(gaussian(rng, 1 + (a > 45 ? 0.03 : 0) + (fitness - 1) * 0.25, 0.07), 0.85, 1.25);

  const tone = Math.max(0, weightedIndex(rng, SKIN_WEIGHTS));
  const skin = SKIN_TONES[tone]!;
  const hairRoll = rng.next();
  const hairPick = rng.next();
  const greyP = a >= 62 ? 0.82 : a >= 48 ? 0.34 : a >= 38 ? 0.08 : 0;
  let hair: number;
  if (hairRoll < greyP) hair = HAIR_GREY[Math.floor(hairPick * HAIR_GREY.length)]!;
  else if (!duty && a < 32 && rng.next() < spec.vivid * 0.35) hair = HAIR_DYED[Math.floor(hairPick * HAIR_DYED.length)]!;
  else if (tone >= 3 || hairPick < 0.56) hair = HAIR_DARK[Math.floor(rng.next() * HAIR_DARK.length)]!;
  else hair = HAIR_LIGHT[Math.floor(rng.next() * HAIR_LIGHT.length)]!;
  const styles = duty ? (s === 1 ? HAIR_WOMEN_DUTY : HAIR_MEN_DUTY) : s === 1 ? (old ? HAIR_WOMEN_OLD : HAIR_WOMEN) : old || a > 50 ? HAIR_MEN_OLD : HAIR_MEN;
  const hairStyle = isChild ? (s === 1 ? 2 + rng.int(0, 3) : 1) : Math.max(0, weightedIndex(rng, styles));
  const beard = s === 0 && a >= 20 && rng.next() < (duty ? 0.18 : 0.3) ? 1 : 0;

  // tenue de ville
  const vividTop = rng.next() < spec.vivid;
  const top = vividTop ? pickOf(rng, VIVID_TOPS) : pickOf(rng, CIVIL_TOPS);
  const bottom = pickOf(rng, CIVIL_BOTTOMS);
  const shoes = pickOf(rng, CIVIL_SHOES);
  const hat = HATS[Math.max(0, weightedIndex(rng, old ? HAT_WEIGHTS_OLD : HAT_WEIGHTS))]!;
  const hatColor = pickOf(rng, CAP_COLORS);
  const jacketRoll = rng.next();
  const coatP = old ? 0.42 : 0.18;
  const jacket = jacketRoll < coatP ? 2 : jacketRoll < coatP + 0.5 ? 1 : 0;
  const sleeves = jacket === 0 && rng.next() < 0.22 ? 0 : 1;
  const legRoll = rng.next();
  const skirt = s === 1 && legRoll < 0.07 ? 1 : 0;
  const shorts = !skirt && !old && legRoll > 0.975 ? 1 : 0;
  const scarf = rng.next() < (old ? 0.26 : 0.1) ? 1 : 0;
  const scarfColor = pickOf(rng, SCARF_COLORS);
  const hoodDown = jacket === 0 && rng.next() < 0.3 ? 1 : 0;
  const packRoll = rng.next();
  const packColor = pickOf(rng, PACK_COLORS);

  // vitesses de base : âge, condition physique et petite dispersion individuelle
  const wf = walkFactor(a);
  const rf = runFactor(a);
  const spread = 0.96 + 0.08 * rng.next();
  return {
    seed, sex: s, age: a, child: isChild, fitness, height, build, skin, hair, hairStyle, beard,
    top, bottom, shoes, hat, hatColor, jacket, sleeves, shorts, skirt, scarf, scarfColor, hoodDown, packRoll, packColor,
    walk: PERSON_SPEED_WALK * wf * spread,
    run: PERSON_SPEED_RUN * rf * fitness * spread,
    sprint: PERSON_SPEED_SPRINT * rf * fitness * spread,
    family: 0, cause: -1, org: -1, baseArmorHead: 0, baseGas: 0,
  };
}
