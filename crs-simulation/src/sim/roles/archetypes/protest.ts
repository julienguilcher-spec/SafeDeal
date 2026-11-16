/* =====================================================================================
 * ARCHÉTYPES — CORTÈGE : familles visuelles et profils des manifestants.
 *
 * Deux tables se combinent : la FAMILLE VISUELLE dit à quoi la personne ressemble (gilet jaune,
 * chasuble d'une organisation fictive, blouse, cotte, noir du bloc…), le PROFIL dit ce qu'elle porte
 * et comment elle s'équipe (pancarte, drapeau, mégaphone, brassard du service d'ordre, capuche et
 * masque du radical, sac du pilleur). Sources : docs/research/00-bible-realisme.md §B, §D et §F.1 ;
 * docs/research/02-materiel-tenues-vehicules.md §6.2 ; docs/research/03-dynamique-manifestation.md §2.1
 * (les violents arrivent les mains vides et ramassent sur place : ni pavé ni bouteille en dotation).
 * Niveau gameplay uniquement : les objets sont des identifiants de jeu.
 * ===================================================================================== */

import type { ItemId, ProtestProfile, Rng } from '@/core/contracts';
import { CARRY, FAMILY_IDS, PROFILE_IDS } from './api';
import type { VisualFamily } from './api';
import type { BodySpec, Draft, Identity } from './model';
import { kitAdd, noScarf, pickOf } from './model';
import {
  BLOC_ANTHRACITE, BLOC_BLACK, BLOUSE_BLUE, BLOUSE_WHITE, CHASUBLE_COLORS, CLIMATE_GREEN, CLIMATE_YELLOW, FARMER_GREEN,
  FARMER_STRAW, FLUO_YELLOW, SENIOR_BEIGE, SENIOR_GREY, SO_ARMBAND, STUDENT_JEANS, STUDENT_SWEAT,
} from './palette';

/** Façon dont un membre de la famille se radicalise : noir complet, capuche et masque, ou visage découvert. */
type RadicalStyle = 'bloc' | 'masque' | 'decouvert';

interface FamilyDef {
  label: string;
  body: BodySpec;
  /** Proportion de sacs à dos. */
  backpack: number;
  /** Probabilité, pour un marcheur ordinaire, de porter une pancarte / un drapeau (1 pancarte pour 4 : bible §B). */
  sign: number;
  flag: number;
  radical: RadicalStyle;
}

export const FAMILY_DEFS: Readonly<Record<VisualFamily, FamilyDef>> = {
  divers: {
    label: 'Sans étiquette', backpack: 0.3, sign: 0.14, flag: 0.02, radical: 'masque',
    body: { women: 0.46, ageMin: 18, ageMax: 70, agePeak: 32, fitMin: 0.9, fitMax: 1.05, vivid: 0.1 },
  },
  gilets_jaunes: {
    label: 'Gilets jaunes', backpack: 0.25, sign: 0.16, flag: 0.1, radical: 'decouvert',
    body: { women: 0.42, ageMin: 25, ageMax: 70, agePeak: 45, fitMin: 0.88, fitMax: 1.03, vivid: 0.05 },
  },
  syndical: {
    label: 'Cortège syndical', backpack: 0.2, sign: 0.16, flag: 0.3, radical: 'masque',
    body: { women: 0.42, ageMin: 24, ageMax: 64, agePeak: 44, fitMin: 0.88, fitMax: 1.03, vivid: 0.05 },
  },
  etudiants: {
    label: 'Étudiants et lycéens', backpack: 0.75, sign: 0.32, flag: 0.03, radical: 'masque',
    body: { women: 0.52, ageMin: 16, ageMax: 27, agePeak: 20, fitMin: 0.97, fitMax: 1.1, vivid: 0.4 },
  },
  climat: {
    label: 'Militants climat', backpack: 0.5, sign: 0.4, flag: 0.06, radical: 'masque',
    body: { women: 0.56, ageMin: 17, ageMax: 60, agePeak: 26, fitMin: 0.93, fitMax: 1.07, vivid: 0.55 },
  },
  soignants: {
    label: 'Soignants', backpack: 0.15, sign: 0.3, flag: 0.04, radical: 'masque',
    body: { women: 0.72, ageMin: 22, ageMax: 62, agePeak: 36, fitMin: 0.92, fitMax: 1.05, vivid: 0.1 },
  },
  agriculteurs: {
    label: 'Agriculteurs', backpack: 0.1, sign: 0.18, flag: 0.14, radical: 'decouvert',
    body: { women: 0.24, ageMin: 22, ageMax: 66, agePeak: 44, fitMin: 0.95, fitMax: 1.08, vivid: 0.05 },
  },
  retraites: {
    label: 'Retraités', backpack: 0.1, sign: 0.22, flag: 0.05, radical: 'decouvert',
    body: { women: 0.52, ageMin: 60, ageMax: 84, agePeak: 68, fitMin: 0.8, fitMax: 0.95, vivid: 0.05 },
  },
  familles: {
    label: 'Familles', backpack: 0.45, sign: 0.16, flag: 0.03, radical: 'decouvert',
    body: { women: 0.56, ageMin: 27, ageMax: 48, agePeak: 36, fitMin: 0.9, fitMax: 1.03, vivid: 0.2 },
  },
  black_bloc: {
    label: 'Black bloc', backpack: 1, sign: 0, flag: 0, radical: 'bloc',
    body: { women: 0.32, ageMin: 18, ageMax: 34, agePeak: 23, fitMin: 1.0, fitMax: 1.12, vivid: 0 },
  },
};

export const PROFILE_LABELS: Readonly<Record<ProtestProfile, string>> = {
  pacifique: 'Manifestant pacifique',
  famille: 'Famille',
  militant: 'Militant',
  service_ordre: 'Service d’ordre',
  meneur: 'Meneur',
  opportuniste: 'Suiveur',
  radical: 'Radical',
  pilleur: 'Pilleur',
};

export function isProtestProfile(v: string): v is ProtestProfile {
  return (PROFILE_IDS as readonly string[]).indexOf(v) >= 0;
}

export function familyIndex(family: VisualFamily): number {
  const i = FAMILY_IDS.indexOf(family);
  return i < 0 ? 0 : i;
}

export function familyAt(index: number): VisualFamily {
  return FAMILY_IDS[index | 0] ?? 'divers';
}

/**
 * Affinité famille × profil (poids relatifs, estimés) : qui trouve-t-on dans quelle famille ? Colonnes dans
 * l'ordre de PROFILE_IDS : pacifique, famille, militant, service d'ordre, meneur, suiveur, radical, pilleur.
 * Un zéro interdit la combinaison (pas de service d'ordre dans le bloc, pas de radical chez les familles).
 */
export const AFFINITY: Readonly<Record<VisualFamily, readonly number[]>> = {
  divers: [10, 1.5, 0.5, 0, 0.3, 4, 1.2, 3],
  gilets_jaunes: [10, 0.8, 1.5, 0, 0.6, 4, 2, 0.5],
  syndical: [5, 0.6, 12, 4, 0.8, 0.5, 0.1, 0],
  etudiants: [10, 0.2, 3, 0.5, 0.6, 5, 1, 0.4],
  climat: [10, 2, 4, 0.6, 0.6, 1, 0.2, 0],
  soignants: [10, 0.8, 5, 0.8, 0.5, 0.2, 0, 0],
  agriculteurs: [10, 1, 6, 1, 0.6, 1, 0.3, 0],
  retraites: [10, 2, 3, 0.3, 0.2, 0, 0, 0],
  familles: [4, 12, 0.5, 0, 0, 0, 0, 0],
  black_bloc: [0, 0, 0, 0, 0.4, 2.5, 12, 1],
};

/** Répartition d'âge et de condition physique selon la famille et le profil. */
export function protestBody(family: VisualFamily, profile: ProtestProfile | null, out: BodySpec): BodySpec {
  const b = FAMILY_DEFS[family].body;
  out.women = b.women;
  out.ageMin = b.ageMin;
  out.ageMax = b.ageMax;
  out.agePeak = b.agePeak;
  out.fitMin = b.fitMin;
  out.fitMax = b.fitMax;
  out.vivid = b.vivid;
  if (profile === 'radical' || profile === 'opportuniste' || profile === 'pilleur') {
    // interpellés réels : surtout de 20 à 28 ans, un bon tiers de jeunes femmes (dossier 03 §2.2)
    if (family !== 'retraites' && family !== 'gilets_jaunes' && family !== 'agriculteurs') {
      out.ageMin = Math.min(out.ageMin, 17);
      out.ageMax = Math.min(out.ageMax, 36);
      out.agePeak = Math.min(out.agePeak, 23);
    }
    out.women = Math.min(out.women, 0.34);
    out.fitMin = Math.max(out.fitMin, 0.98);
    out.fitMax = Math.max(out.fitMax, 1.1);
  } else if (profile === 'service_ordre') {
    out.women = Math.min(out.women, 0.25);
    out.ageMin = Math.max(out.ageMin, 28);
    out.ageMax = Math.max(Math.min(out.ageMax, 60), out.ageMin + 6);
    out.agePeak = Math.max(out.ageMin, Math.min(46, out.ageMax));
    out.fitMin = Math.max(out.fitMin, 0.95);
  } else if (profile === 'meneur') {
    out.ageMin = Math.max(out.ageMin, family === 'etudiants' ? 18 : 24);
    if (out.ageMax <= out.ageMin) out.ageMax = out.ageMin + 6;
    out.agePeak = clampTo(out.agePeak, out.ageMin, out.ageMax);
  }
  return out;
}

function clampTo(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ───────────────────────────── tenue de la famille ─────────────────────────────

const DARK_TOPS: readonly number[] = [0x17181b, 0x23272e, 0x2a2f38, 0x1f2a44, 0x34383f];
const WORK_BLUE = 0x2f4468;
const FARM_BOOTS: readonly number[] = [0x2a2f24, 0x1b1d22, 0x3a3328];

/** Tenue noire du bloc : capuche, visage masqué, lunettes, gants, sac à dos (bible §D). */
function blocAttire(d: Draft, rng: Rng, full: boolean): void {
  const e = d.extras;
  const headRoll = rng.next();
  const goggleRoll = rng.next();
  const gloveRoll = rng.next();
  const jacketRoll = rng.next();
  d.outfit = 'black_bloc';
  d.top = BLOC_BLACK;
  d.bottom = rng.next() < 0.6 ? BLOC_BLACK : BLOC_ANTHRACITE;
  d.shoes = 0x141414;
  d.vest = 0;
  d.armband = 0;
  d.backText = '';
  d.backpack = true;
  d.faceCover = true;
  // la plupart en capuche ; quelques casques de moto ou cagoules chez les plus équipés
  d.headgear = full && headRoll > 0.93 ? 'casque_moto' : full && headRoll > 0.88 ? 'cagoule' : 'capuche';
  d.armorHead = d.headgear === 'casque_moto' ? 0.55 : 0.1;
  d.armorBody = full ? 0.15 : 0.05;
  const goggles = goggleRoll < (full ? 0.85 : 0.3);
  if (goggles) e.goggles = 1; else delete e.goggles;
  if (gloveRoll < (full ? 0.85 : 0.3)) e.gloves = BLOC_ANTHRACITE; else delete e.gloves;
  d.gasProtection = goggles ? 0.5 : 0.3;
  // casque, sac et foulard : le rendu de la tenue du bloc applique ses noirs
  delete e.helmetColor;
  delete e.packColor;
  noScarf(e);
  e.jacket = jacketRoll < 0.5 ? 1 : 0;
  e.sleeves = 1;
  e.bloc = 1;
  delete e.hoodDown;
  delete e.shorts;
  delete e.skirt;
}

/**
 * Tenue de la famille visuelle, avant le profil. `orgColor` : couleur de l'organisation fictive
 * (chasuble syndicale) ; 0 = couleur de repli tirée d'après la graine.
 */
function dressFamily(d: Draft, id: Identity, family: VisualFamily, orgColor: number, rng: Rng): void {
  const e = d.extras;
  const fd = FAMILY_DEFS[family];
  const a = rng.next();
  const b = rng.next();
  const c = rng.next();
  d.backpack = id.packRoll < fd.backpack;
  switch (family) {
    case 'gilets_jaunes':
      // gilet de haute visibilité à deux bandes, annoté au dos ; bonnet fréquent
      d.outfit = 'gilet_fluo';
      d.vest = FLUO_YELLOW;
      if (d.headgear === 'none' && a < 0.3) d.headgear = 'bonnet';
      if (d.headgear === 'capuche') d.headgear = 'bonnet';
      break;
    case 'syndical':
      // chasuble aux couleurs d'une organisation fictive, casquette assortie une fois sur quatre
      d.outfit = 'syndical';
      d.vest = orgColor || pickOf(rng, CHASUBLE_COLORS);
      if (a < 0.25) {
        d.headgear = 'casquette';
        e.helmetColor = d.vest;
      } else if (d.headgear === 'capuche') {
        d.headgear = 'none';
      }
      break;
    case 'etudiants':
      // jean, sweat à capuche, sac à dos
      if (a < 0.45) {
        d.top = b < 0.5 ? STUDENT_SWEAT : d.top;
        e.jacket = 0;
        e.sleeves = 1;
        if (d.headgear !== 'capuche') e.hoodDown = 1;
      }
      if (c < 0.6) d.bottom = STUDENT_JEANS;
      break;
    case 'climat':
      // vêtements colorés, vert et jaune dominants
      if (a < 0.55) d.top = b < 0.6 ? CLIMATE_GREEN : CLIMATE_YELLOW;
      if (d.headgear === 'capuche') d.headgear = 'none';
      break;
    case 'soignants':
      // blouse blanche par-dessus les vêtements, ou tenue de bloc bleu pâle
      if (a < 0.8) {
        d.top = BLOUSE_WHITE;
        e.jacket = 2;
        if (b < 0.3) d.bottom = BLOUSE_WHITE;
      } else {
        d.top = BLOUSE_BLUE;
        d.bottom = BLOUSE_BLUE;
        e.jacket = 0;
      }
      e.sleeves = 1;
      noScarf(e);
      delete e.hoodDown;
      delete e.shorts;
      delete e.skirt;
      if (d.headgear !== 'bonnet') d.headgear = 'none';
      break;
    case 'agriculteurs': {
      // cotte de travail verte ou bleue, bottes, casquette
      const cotte = a < 0.7 ? FARMER_GREEN : WORK_BLUE;
      d.top = cotte;
      d.bottom = cotte;
      d.shoes = pickOf(rng, FARM_BOOTS);
      e.jacket = 0;
      e.sleeves = 1;
      delete e.shorts;
      delete e.skirt;
      delete e.hoodDown;
      if (b < 0.5) {
        d.headgear = 'casquette';
        e.helmetColor = c < 0.5 ? FARMER_STRAW : FARMER_GREEN;
      } else if (d.headgear === 'capuche') {
        d.headgear = 'bonnet';
      }
      break;
    }
    case 'retraites':
      // tons beiges et gris, manteau, écharpe
      if (a < 0.6) d.top = b < 0.5 ? SENIOR_BEIGE : SENIOR_GREY;
      if (d.headgear === 'capuche') d.headgear = c < 0.5 ? 'casquette' : 'none';
      delete e.shorts;
      break;
    case 'familles':
      if (d.headgear === 'capuche') d.headgear = 'none';
      break;
    case 'black_bloc':
      // avant de se changer : vêtements sombres ordinaires, le noir est dans le sac
      d.top = DARK_TOPS[Math.floor(a * DARK_TOPS.length)]!;
      d.backpack = true;
      e.packColor = BLOC_ANTHRACITE;
      if (d.headgear !== 'capuche') e.hoodDown = 1;
      e.jacket = 0;
      e.sleeves = 1;
      delete e.skirt;
      delete e.shorts;
      break;
    default:
      break;
  }
}

// ───────────────────────────── profil : accessoires et dotation ─────────────────────────────

interface ToolChance {
  item: ItemId;
  p: number;
  count: number;
}

/**
 * Outils du noyau radical, par membre (bible §B : 1 parapluie pour 5, 1 marteau ou barre pour 8,
 * 1 tube de mortier pour 15 ; engins incendiaires rares). Rien de plus : le reste se ramasse dans la rue.
 */
const RADICAL_TOOLS: readonly ToolChance[] = [
  { item: 'parapluie', p: 0.2, count: 1 },
  { item: 'marteau', p: 0.08, count: 1 },
  { item: 'barre', p: 0.045, count: 1 },
  { item: 'bombe_peinture', p: 0.15, count: 12 },
  { item: 'fumigene', p: 0.1, count: 1 },
  { item: 'mortier', p: 0.067, count: 6 },
  { item: 'molotov', p: 0.035, count: 1 },
  { item: 'raquette', p: 0.08, count: 1 },
  { item: 'masque_gaz', p: 0.15, count: 1 },
];
const PILLEUR_TOOLS: readonly ToolChance[] = [
  { item: 'barre', p: 0.2, count: 1 },
  { item: 'marteau', p: 0.15, count: 1 },
];

/** Tirages des outils, faits une fois par personne avant tout autre tirage dépendant de la tenue. */
const toolRolls = new Float64Array(RADICAL_TOOLS.length);

function addTools(d: Draft, tools: readonly ToolChance[]): void {
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i]!;
    if (toolRolls[i]! < t.p) kitAdd(d, t.item, t.count);
  }
}

function carryItem(code: number): ItemId | '' {
  switch (code) {
    case CARRY.pancarte: return 'pancarte';
    case CARRY.drapeau: return 'drapeau';
    case CARRY.banderole: return 'banderole';
    case CARRY.parapluie: return 'parapluie';
    case CARRY.megaphone: return 'megaphone';
    default: return '';
  }
}

export interface ProtestOptions {
  family: VisualFamily;
  profile: ProtestProfile | null;
  /** Objet en main imposé (codes CARRY ; 0 = d'après la graine). */
  carry: number;
  /** Tenue noire du bloc portée (par défaut : toute la famille « black_bloc »). */
  bloc: boolean;
  /** Couleur de l'organisation fictive (0 = aucune). */
  orgColor: number;
}

/**
 * Habille et dote un manifestant. Deux générateurs : `lookRng` (tenue de la famille, stable d'un
 * profil à l'autre) et `kitRng` (accessoires et outils du profil).
 */
export function dressProtester(d: Draft, id: Identity, o: ProtestOptions, lookRng: Rng, kitRng: Rng): void {
  const e = d.extras;
  const fd = FAMILY_DEFS[o.family];
  const profile = o.profile;
  dressFamily(d, id, o.family, o.orgColor, lookRng);

  // enfant accompagné : ni accessoire ni dotation
  if (id.child) {
    d.faceCover = false;
    d.backpack = id.packRoll < 0.3;
    if (d.headgear === 'capuche') d.headgear = 'bonnet';
    const item = carryItem(o.carry);
    if (item === 'pancarte' || item === 'drapeau') {
      kitAdd(d, item, 1);
      d.hand = item;
    }
    return;
  }

  // tirages du profil, dans un ordre fixe
  const phoneRoll = kitRng.next();
  const carryRoll = kitRng.next();
  const r1 = kitRng.next();
  const r2 = kitRng.next();
  const r3 = kitRng.next();
  // outils : toujours tirés, ici, pour que la dotation ne dépende pas de la tenue portée (noir ou ville)
  for (let i = 0; i < toolRolls.length; i++) toolRolls[i] = kitRng.next();
  let signP = fd.sign;
  let flagP = fd.flag;
  let phoneP = 0.9;
  let inBloc = false;

  switch (profile) {
    case 'famille':
      signP *= 0.5;
      flagP *= 0.5;
      d.faceCover = false;
      break;
    case 'militant':
      // drapeaux et pancartes de l'organisation : deux fois plus de porteurs que chez les simples marcheurs
      signP = Math.min(0.4, signP * 1.5);
      flagP = Math.min(0.45, flagP * 2 + 0.04);
      if (r1 < 0.04) kitAdd(d, 'fumigene', 1);
      break;
    case 'service_ordre':
      // brassard du service d'ordre, mains libres pour la chaîne humaine, casquette sombre une fois sur deux
      d.armband = SO_ARMBAND;
      signP = 0;
      flagP = 0;
      phoneP = 1;
      if (r1 < 0.5) {
        d.headgear = 'casquette';
        e.helmetColor = 0x20242c;
      } else if (d.headgear === 'capuche') {
        d.headgear = 'none';
      }
      d.faceCover = false;
      break;
    case 'meneur':
      signP = 0;
      flagP = 0;
      phoneP = 1;
      break;
    case 'opportuniste':
      // suiveur : sweat à capuche, foulard autour du cou, sac à dos fréquent
      signP *= 0.5;
      flagP = 0;
      if (o.family !== 'gilets_jaunes' && o.family !== 'syndical') d.backpack = d.backpack || id.packRoll < 0.45;
      if (d.headgear === 'none' && e.jacket === 0) e.hoodDown = 1;
      if (r1 < 0.35) {
        e.scarf = 1;
        e.coverColor = 0x2a2a2e;
      }
      break;
    case 'radical':
      signP = 0;
      flagP = 0;
      phoneP = 0.7;
      break;
    case 'pilleur':
      signP = 0;
      flagP = 0;
      phoneP = 0.8;
      break;
    default:
      break;
  }

  if (o.bloc) {
    // tenue noire complète (famille du bloc, ou changement de tenue demandé)
    inBloc = true;
    blocAttire(d, kitRng, profile === 'radical' || profile === 'meneur');
  } else if (profile === 'radical' && o.family !== 'black_bloc') {
    if (fd.radical === 'masque') {
      // enfile capuche et masque, range tout signe d'appartenance
      d.outfit = 'civil';
      d.vest = 0;
      d.armband = 0;
      d.headgear = 'capuche';
      d.faceCover = true;
      d.backpack = true;
      d.armorHead = 0.1;
      d.armorBody = 0.05;
      const goggles = r2 < 0.5;
      if (goggles) e.goggles = 1;
      if (r3 < 0.4) e.gloves = 0x17181b;
      d.gasProtection = goggles ? 0.5 : 0.3;
      e.scarf = 0;
      e.coverColor = BLOC_ANTHRACITE;
      delete e.hoodDown;
    } else {
      // « déterminé qui reste » : garde sa tenue, visage souvent découvert, parfois lunettes et foulard
      d.faceCover = r2 < 0.45;
      if (r3 < 0.35) e.goggles = 1;
      if (d.headgear === 'none') d.headgear = r1 < 0.5 ? 'casquette' : 'bonnet';
      d.gasProtection = d.faceCover ? (e.goggles ? 0.5 : 0.3) : 0;
      if (d.faceCover) {
        e.scarf = 0;
        e.coverColor = 0x2a2a2e;
      }
    }
  } else if (profile === 'pilleur' && o.family !== 'black_bloc') {
    // capuche, cache-cou une fois sur deux, sac vide
    d.outfit = 'civil';
    d.vest = 0;
    d.armband = 0;
    d.headgear = 'capuche';
    d.backpack = true;
    d.top = DARK_TOPS[Math.floor(r2 * DARK_TOPS.length)]!;
    d.faceCover = r3 < 0.5;
    d.gasProtection = d.faceCover ? 0.3 : 0;
    e.coverColor = BLOC_ANTHRACITE;
    e.packColor = BLOC_ANTHRACITE;
    e.scarf = 0;
    delete e.hoodDown;
  }
  if (!inBloc) e.bloc = 0;

  // ── dotation ──
  let hand: ItemId | '' = carryItem(o.carry);
  if (o.carry === CARRY.auto) {
    if (profile === 'meneur') hand = 'megaphone';
    else if (inBloc || o.family === 'black_bloc') hand = '';
    else if (carryRoll < signP) hand = 'pancarte';
    else if (carryRoll < signP + flagP) hand = 'drapeau';
  }
  if (hand) kitAdd(d, hand, 1);
  if (profile === 'meneur' && hand !== 'megaphone') kitAdd(d, 'megaphone', 1);
  if (phoneRoll < phoneP) kitAdd(d, 'telephone', 1);
  if (profile === 'radical') addTools(d, RADICAL_TOOLS);
  else if (profile === 'pilleur') addTools(d, PILLEUR_TOOLS);
  else if (profile === 'meneur' && inBloc) kitAdd(d, 'fumigene', 1);
  d.hand = hand;
}

/** Dotation type d'un profil (pour l'interface : tout ce qu'un membre PEUT porter). */
export function profileKit(profile: ProtestProfile | null): readonly ItemId[] {
  switch (profile) {
    case 'meneur': return ['megaphone', 'telephone'];
    case 'radical': return ['telephone', ...RADICAL_TOOLS.map((t) => t.item)];
    case 'pilleur': return ['telephone', ...PILLEUR_TOOLS.map((t) => t.item)];
    case 'militant': return ['drapeau', 'pancarte', 'telephone', 'fumigene'];
    case 'service_ordre': return ['telephone'];
    default: return ['pancarte', 'drapeau', 'telephone'];
  }
}
