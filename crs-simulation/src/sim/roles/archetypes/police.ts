/* =====================================================================================
 * ARCHÉTYPES — FORCES DE L'ORDRE : tenues par corps, dotations par poste, grades et galons.
 *
 * Sources : docs/research/00-bible-realisme.md §B (matériel, quantités), §D (apparence), §E (postes,
 * grades) ; docs/research/02-materiel-tenues-vehicules.md §1 et §2 ; docs/research/06-roles-jouables.md
 * §2.3 (fiches de poste), §5.2, §6.2. Décision du commanditaire (BRIEF §1) : le commandant d'unité est
 * aussi l'autorité habilitée — écharpe tricolore, mégaphone et fusée de sommation en dotation.
 * ===================================================================================== */

import type { HeadgearId, ItemId, OutfitId, PersonKind, PolicePoste, PoliceRank, Rng } from '@/core/contracts';
import { RANK_STYLE, VARIANT } from './api';
import type { BodySpec, Draft, Identity, KitTable } from './model';
import { clearCivilExtras, kitAdd, kitAddAll, kitRemove } from './model';
import {
  BOOT_BLACK, BRAV_BLACK, BRAV_HELMET_DARK, BRAV_HELMET_LIGHT, CRS_BAND, CRS_HELMET, CRS_NAVY, GENDARME_DARK,
  GENDARME_GOLD, GENDARME_HELMET, MEDIC_RED, POLICE_ARMBAND, PROTECTION_BLACK, RANK_GOLD, RANK_SILVER, RANK_WHITE, SERVICE_NAVY,
  SUIT_DARK,
} from './palette';

export type PoliceKind = 'crs' | 'commissaire' | 'bravm' | 'gendarme' | 'policier_civil' | 'telepilote';

export const POLICE_KINDS: readonly PoliceKind[] = ['crs', 'commissaire', 'bravm', 'gendarme', 'policier_civil', 'telepilote'];

export function isPoliceKind(kind: PersonKind): kind is PoliceKind {
  return kind === 'crs' || kind === 'commissaire' || kind === 'bravm' || kind === 'gendarme' || kind === 'policier_civil'
    || kind === 'telepilote';
}

export const POLICE_POSTES: readonly PolicePoste[] = [
  'bouclier', 'lanceur', 'lbd', 'extincteur', 'interpellation', 'conducteur', 'operateur', 'chef_groupe',
  'chef_section', 'commandant_unite', 'autorite_civile', 'pilote_moto', 'passager_moto', 'telepilote',
];

export function isPolicePoste(v: string): v is PolicePoste {
  return (POLICE_POSTES as readonly string[]).indexOf(v) >= 0;
}

// ───────────────────────────── grades et galons ─────────────────────────────

export const RANKS: readonly PoliceRank[] = [
  'gardien_stagiaire', 'gardien', 'brigadier', 'brigadier_chef', 'major', 'capitaine', 'commandant', 'commissaire',
];

interface RankDef {
  label: string;
  /** Nombre de galons affichés (chevrons ou barrettes) — même table que le magasin des personnes. */
  bars: number;
  style: number;
  color: number;
  ageMin: number;
  ageMax: number;
}

/**
 * Galons (arrêté du 9 décembre 2019, d'après la bible §D) : stagiaire 1 chevron, gardien 2 chevrons,
 * brigadier-chef 1 barrette argent à raie rouge, major la même + un liseré, capitaine 3 barrettes
 * blanches, commandant 4 ; le commissaire porte une branche de feuilles de chêne, sans barrette.
 */
export const RANK_DEFS: Readonly<Record<PoliceRank, RankDef>> = {
  gardien_stagiaire: { label: 'Gardien de la paix stagiaire', bars: 1, style: RANK_STYLE.chevrons, color: RANK_SILVER, ageMin: 20, ageMax: 27 },
  gardien: { label: 'Gardien de la paix', bars: 2, style: RANK_STYLE.chevrons, color: RANK_SILVER, ageMin: 22, ageMax: 46 },
  brigadier: { label: 'Brigadier', bars: 1, style: RANK_STYLE.barrette_or, color: RANK_GOLD, ageMin: 28, ageMax: 50 },
  brigadier_chef: { label: 'Brigadier-chef', bars: 1, style: RANK_STYLE.barrette_argent, color: RANK_SILVER, ageMin: 29, ageMax: 52 },
  major: { label: 'Major', bars: 2, style: RANK_STYLE.barrette_argent, color: RANK_SILVER, ageMin: 37, ageMax: 56 },
  capitaine: { label: 'Capitaine', bars: 3, style: RANK_STYLE.barrettes_blanches, color: RANK_WHITE, ageMin: 27, ageMax: 52 },
  commandant: { label: 'Commandant', bars: 4, style: RANK_STYLE.barrettes_blanches, color: RANK_WHITE, ageMin: 37, ageMax: 58 },
  commissaire: { label: 'Commissaire', bars: 0, style: RANK_STYLE.feuilles_chene, color: RANK_SILVER, ageMin: 29, ageMax: 59 },
};

export function rankBars(rank: PoliceRank | null): number {
  return rank ? RANK_DEFS[rank]?.bars ?? 0 : 0;
}

// ───────────────────────────── tenues par corps ─────────────────────────────

interface PoliceOutfit {
  label: string;
  outfit: OutfitId;
  headgear: HeadgearId;
  top: number;
  bottom: number;
  shoes: number;
  backText: string;
  /** Protections 0..1 en tenue complète. */
  armorHead: number;
  armorBody: number;
  /**
   * Teintes de référence du casque et de ses bandes (bible §D). Le rendu des tenues officielles applique
   * ses propres teintes réglementaires : ces valeurs ne sont écrites dans l'apparence que là où elles
   * distinguent deux agents (opérateur de BRAV-M, calot du gendarme).
   */
  helmetColor: number;
  bandColor: number;
  /** Tenue allégée (conducteur, opérateur d'engin) : tenue, coiffe, protections. */
  lightOutfit: OutfitId;
  lightHeadgear: HeadgearId;
  lightArmorBody: number;
  body: BodySpec;
  defaultPoste: PolicePoste | null;
}

/** Agents entraînés mais d'âges variés : condition physique d'un adulte en forme (la charge fait le reste). */
const DUTY_BODY: BodySpec = { women: 0.12, ageMin: 21, ageMax: 54, agePeak: 31, fitMin: 0.97, fitMax: 1.06, vivid: 0 };

export const POLICE_OUTFITS: Readonly<Record<PoliceKind, PoliceOutfit>> = {
  // casque sombre à deux bandes jaunes, tenue marine, protections noires, « POLICE » dans le dos
  crs: {
    label: 'CRS', outfit: 'crs_mo', headgear: 'casque_crs', top: CRS_NAVY, bottom: CRS_NAVY, shoes: BOOT_BLACK,
    backText: 'POLICE', armorHead: 0.85, armorBody: 0.7, helmetColor: CRS_HELMET, bandColor: CRS_BAND,
    lightOutfit: 'crs_service', lightHeadgear: 'calot', lightArmorBody: 0.3, body: DUTY_BODY, defaultPoste: 'bouclier',
  },
  // casque entièrement bleu, insignes or, « GENDARMERIE » dans le dos
  gendarme: {
    label: 'Gendarme mobile', outfit: 'gendarme_mo', headgear: 'casque_gendarme', top: GENDARME_DARK, bottom: GENDARME_DARK,
    shoes: BOOT_BLACK, backText: 'GENDARMERIE', armorHead: 0.85, armorBody: 0.7,
    helmetColor: GENDARME_HELMET, bandColor: 0, lightOutfit: 'gendarme_mo', lightHeadgear: 'calot', lightArmorBody: 0.3,
    body: DUTY_BODY, defaultPoste: 'bouclier',
  },
  // tout en noir, protections lourdes, casque de moto gardé à pied
  bravm: {
    label: 'BRAV-M', outfit: 'bravm', headgear: 'casque_moto', top: BRAV_BLACK, bottom: BRAV_BLACK, shoes: BOOT_BLACK,
    backText: 'POLICE', armorHead: 0.8, armorBody: 0.55, helmetColor: BRAV_HELMET_LIGHT, bandColor: 0,
    lightOutfit: 'bravm', lightHeadgear: 'casque_moto', lightArmorBody: 0.55,
    body: { women: 0.08, ageMin: 24, ageMax: 48, agePeak: 31, fitMin: 1.0, fitMax: 1.08, vivid: 0 }, defaultPoste: 'passager_moto',
  },
  // autorité civile : tenue de service marine ou costume sombre ; écharpe tricolore
  commissaire: {
    label: 'Commissaire', outfit: 'crs_service', headgear: 'casquette_police', top: SERVICE_NAVY, bottom: SERVICE_NAVY,
    shoes: BOOT_BLACK, backText: 'POLICE', armorHead: 0.1, armorBody: 0.3, helmetColor: SERVICE_NAVY, bandColor: 0,
    lightOutfit: 'commissaire', lightHeadgear: 'none', lightArmorBody: 0.3,
    body: { women: 0.34, ageMin: 29, ageMax: 59, agePeak: 42, fitMin: 0.95, fitMax: 1.05, vivid: 0 }, defaultPoste: 'autorite_civile',
  },
  // vêtements de ville ; brassard orange « POLICE » obligatoire
  policier_civil: {
    label: 'Policier en civil', outfit: 'police_civil', headgear: 'none', top: -1, bottom: -1, shoes: -1, backText: 'POLICE',
    armorHead: 0, armorBody: 0.25, helmetColor: 0, bandColor: 0, lightOutfit: 'police_civil', lightHeadgear: 'none',
    lightArmorBody: 0.25, body: { women: 0.25, ageMin: 25, ageMax: 52, agePeak: 34, fitMin: 0.98, fitMax: 1.08, vivid: 0 },
    defaultPoste: null,
  },
  // tenue de service, calot ; posté près du véhicule de commandement
  telepilote: {
    label: 'Télépilote de drone', outfit: 'crs_service', headgear: 'calot', top: SERVICE_NAVY, bottom: SERVICE_NAVY,
    shoes: BOOT_BLACK, backText: 'POLICE', armorHead: 0, armorBody: 0.2, helmetColor: SERVICE_NAVY, bandColor: 0,
    lightOutfit: 'crs_service', lightHeadgear: 'calot', lightArmorBody: 0.2,
    body: { women: 0.28, ageMin: 25, ageMax: 50, agePeak: 33, fitMin: 0.97, fitMax: 1.06, vivid: 0 }, defaultPoste: 'telepilote',
  },
};

// ───────────────────────────── dotations par poste ─────────────────────────────

interface PosteDef {
  label: string;
  kit: KitTable;
  /** Objet en main à la prise de poste. */
  hand: ItemId | '';
  rank: PoliceRank;
  /** Part de gardiens stagiaires à ce poste (jamais au LBD ni au lanceur : habilitations). */
  stagiaires: number;
  /** Caméra-piéton (chefs, porteur de LBD : bible §B). */
  bodycam: boolean;
  radios: number;
  /** Tenue allégée (reste au véhicule ou au poste de commandement). */
  light: boolean;
}

/** Ceinturon de tout agent : bâton à poignée latérale, aérosol (7 jets), menottes + 5 liens, radio, masque, arme. */
const BELT: KitTable = [['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['radio', 1], ['masque_gaz', 1], ['pistolet', 15]];

export const POSTE_DEFS: Readonly<Record<PolicePoste, PosteDef>> = {
  bouclier: {
    label: 'Porteur de bouclier', hand: 'bouclier', rank: 'gardien', stagiaires: 0.14, bodycam: false, radios: 1, light: false,
    kit: [['bouclier', 1], ...BELT],
  },
  // lanceur de 56 mm : 8 grenades au lanceur, 4 à main, 2 assourdissantes-lacrymogènes
  lanceur: {
    label: 'Lanceur de grenades', hand: 'lanceur_cougar', rank: 'gardien', stagiaires: 0, bodycam: false, radios: 1, light: false,
    kit: [['lanceur_cougar', 8], ['grenade_lacrymo', 4], ['grenade_gm2l', 2], ...BELT],
  },
  // un tireur habilité par section : 6 munitions, caméra-piéton
  lbd: {
    label: 'Porteur de LBD', hand: 'lbd40', rank: 'gardien', stagiaires: 0, bodycam: true, radios: 1, light: false,
    kit: [['lbd40', 6], ...BELT],
  },
  // second rang, sans bouclier : 15 s de poudre
  extincteur: {
    label: 'Porte-extincteur', hand: 'extincteur', rank: 'gardien', stagiaires: 0.14, bodycam: false, radios: 1, light: false,
    kit: [['extincteur', 15], ...BELT],
  },
  // mains libres, menottes en premier ; une grenade de désencerclement pour se dégager
  interpellation: {
    label: 'Interpellateur', hand: '', rank: 'gardien', stagiaires: 0, bodycam: false, radios: 1, light: false,
    kit: [['menottes', 6], ['tonfa', 1], ['gazeuse', 7], ['grenade_desencerclement', 1], ['radio', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  conducteur: {
    label: 'Conducteur', hand: '', rank: 'gardien', stagiaires: 0.08, bodycam: false, radios: 1, light: true,
    kit: [['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['lampe', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  operateur: {
    label: 'Opérateur', hand: '', rank: 'gardien', stagiaires: 0, bodycam: false, radios: 1, light: true,
    kit: [['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['lampe', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  // superviseur des tirs : radio, caméra-piéton, 2 lacrymogènes à main, 1 désencerclement
  chef_groupe: {
    label: 'Chef de groupe', hand: '', rank: 'brigadier_chef', stagiaires: 0, bodycam: true, radios: 1, light: false,
    kit: [['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['grenade_lacrymo', 2], ['grenade_desencerclement', 1], ['menottes', 6], ['lampe', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  chef_section: {
    label: 'Chef de section', hand: '', rank: 'major', stagiaires: 0, bodycam: true, radios: 2, light: false,
    kit: [['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['lampe', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  // commandant unique : ni bouclier ni lanceur ; mégaphone et 4 fusées rouges pour les sommations
  commandant_unite: {
    label: 'Commandant d’unité', hand: '', rank: 'commandant', stagiaires: 0, bodycam: true, radios: 2, light: false,
    kit: [['megaphone', 1], ['fusee_sommation', 4], ['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['masque_gaz', 1], ['pistolet', 15]],
  },
  autorite_civile: {
    label: 'Autorité civile', hand: '', rank: 'commissaire', stagiaires: 0, bodycam: false, radios: 2, light: false,
    kit: [['megaphone', 1], ['fusee_sommation', 4], ['radio', 1], ['menottes', 6], ['lampe', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  // le pilote reste près des machines : radio, bâton, arme de service
  pilote_moto: {
    label: 'Pilote de moto', hand: '', rank: 'gardien', stagiaires: 0, bodycam: false, radios: 1, light: false,
    kit: [['radio', 1], ['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['masque_gaz', 1], ['pistolet', 15]],
  },
  // l'opérateur met pied à terre et intervient : bâton, aérosol, menottes
  passager_moto: {
    label: 'Opérateur de BRAV-M', hand: '', rank: 'gardien', stagiaires: 0, bodycam: false, radios: 1, light: false,
    kit: [['tonfa', 1], ['gazeuse', 7], ['menottes', 6], ['radio', 1], ['masque_gaz', 1], ['pistolet', 15]],
  },
  telepilote: {
    label: 'Télépilote', hand: 'telecommande_drone', rank: 'brigadier_chef', stagiaires: 0, bodycam: false, radios: 1, light: true,
    kit: [['telecommande_drone', 1], ['radio', 1], ['lampe', 1], ['pistolet', 15]],
  },
};

/** Agent sans poste : ceinturon seul. */
const NO_POSTE: PosteDef = {
  label: 'Équipier', hand: '', rank: 'gardien', stagiaires: 0, bodycam: false, radios: 1, light: false, kit: BELT,
};
/** Policier en civil sans poste : bâton télescopique, aérosol, menottes, radio, lampe, arme. */
const CIVIL_KIT: KitTable = [['radio', 1], ['baton', 1], ['gazeuse', 7], ['menottes', 6], ['lampe', 1], ['pistolet', 15]];

export function posteDef(poste: PolicePoste | null): PosteDef {
  return (poste && POSTE_DEFS[poste]) || NO_POSTE;
}

/** Dotation type d'un poste pour un corps donné (identifiants d'objets, dans l'ordre des emplacements). */
export function policeKit(kind: PoliceKind, poste: PolicePoste | null): ItemId[] {
  const table = kind === 'policier_civil' && !poste ? CIVIL_KIT : posteDef(poste).kit;
  const out: ItemId[] = [];
  for (let i = 0; i < table.length; i++) {
    let id = table[i]![0];
    if (kind === 'policier_civil') {
      if (id === 'bouclier') continue;
      if (id === 'tonfa') id = 'baton';
    }
    if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

/** Poste par défaut d'un corps quand l'appelant n'en précise pas. */
export function defaultPoste(kind: PoliceKind): PolicePoste | null {
  return POLICE_OUTFITS[kind].defaultPoste;
}

/** Grade par défaut d'un poste (quelques gardiens stagiaires aux postes qui n'exigent pas d'habilitation). */
export function defaultRank(kind: PoliceKind, poste: PolicePoste | null, rng: Rng): PoliceRank {
  if (kind === 'commissaire') return 'commissaire';
  const def = posteDef(poste);
  const roll = rng.next();
  if (def.stagiaires > 0 && roll < def.stagiaires) return 'gardien_stagiaire';
  // un chef de section sur quatre est un officier
  if (poste === 'chef_section' && roll > 0.75) return 'capitaine';
  if (poste === 'telepilote' && roll > 0.45) return 'gardien';
  return def.rank;
}

/** Répartition d'âge d'un agent selon son grade. */
export function policeBody(kind: PoliceKind, rank: PoliceRank | null, out: BodySpec): BodySpec {
  const base = POLICE_OUTFITS[kind].body;
  out.women = base.women;
  out.fitMin = base.fitMin;
  out.fitMax = base.fitMax;
  out.vivid = 0;
  const r = rank ? RANK_DEFS[rank] : undefined;
  out.ageMin = r ? Math.max(r.ageMin, base.ageMin) : base.ageMin;
  out.ageMax = r ? Math.min(r.ageMax, base.ageMax + 6) : base.ageMax;
  if (out.ageMax <= out.ageMin) out.ageMax = out.ageMin + 4;
  out.agePeak = (out.ageMin * 2 + out.ageMax) / 3;
  return out;
}

/** Le poste se tient-il en tenue allégée (au véhicule) pour cette variante ? */
function isLight(poste: PolicePoste | null, variant: number): boolean {
  if (!poste) return false;
  if (poste === 'operateur') return variant === VARIANT.aucune || variant === VARIANT.chef_engin;
  return POSTE_DEFS[poste].light;
}

/**
 * Habille et dote un agent des forces de l'ordre.
 * `variant` : spécialité d'un poste « operateur » à pied (radio, secouriste, vidéo, liaison) ou tenue
 * de l'autorité civile (tenue, civil). L'écharpe tricolore est réservée à l'autorité habilitée.
 */
export function dressPolice(
  d: Draft, id: Identity, kind: PoliceKind, poste: PolicePoste | null, rank: PoliceRank | null, variant: number, rng: Rng,
): void {
  const o = POLICE_OUTFITS[kind];
  const pd = posteDef(poste);
  const e = d.extras;
  const light = isLight(poste, variant);

  // ── tenue ──
  if (kind === 'policier_civil') {
    // vêtements de ville de la personne, blouson, brassard orange
    d.outfit = 'police_civil';
    d.armband = POLICE_ARMBAND;
    // un policier en civil sur cinq garde un casque de moto sombre
    d.headgear = rng.next() < 0.2 ? 'casque_moto' : id.hat === 'capuche' ? 'none' : id.hat;
    if (d.headgear === 'casque_moto') e.helmetColor = PROTECTION_BLACK;
    d.armorHead = d.headgear === 'casque_moto' ? 0.6 : 0;
    d.armorBody = o.armorBody;
    if (e.jacket === 0) e.jacket = 1;
    e.sleeves = 1;
    delete e.shorts;
    delete e.skirt;
    delete e.packColor;
  } else if (kind === 'commissaire') {
    // variante tirée d'après la graine si elle n'est pas imposée : une fois sur deux en civil
    const civil = variant === VARIANT.civil || (variant !== VARIANT.tenue && rng.next() < 0.5);
    clearCivilExtras(e);
    if (civil) {
      d.outfit = o.lightOutfit;
      d.headgear = o.lightHeadgear;
      d.top = SUIT_DARK;
      d.bottom = SUIT_DARK;
      d.armorHead = 0;
      e.variant = VARIANT.civil;
    } else {
      d.outfit = o.outfit;
      d.headgear = o.headgear;
      d.top = o.top;
      d.bottom = o.bottom;
      d.armorHead = o.armorHead;
      e.variant = VARIANT.tenue;
    }
    d.shoes = BOOT_BLACK;
    d.armorBody = o.armorBody;
  } else {
    clearCivilExtras(e);
    d.outfit = light ? o.lightOutfit : o.outfit;
    d.headgear = light ? o.lightHeadgear : o.headgear;
    d.top = o.top;
    d.bottom = o.bottom;
    d.shoes = o.shoes;
    d.armorHead = light && o.lightHeadgear !== o.headgear ? 0 : o.armorHead;
    d.armorBody = light ? o.lightArmorBody : o.armorBody;
    // BRAV-M : casque clair des motocyclistes pour le pilote, sombre pour l'opérateur (estimé)
    if (kind === 'bravm' && poste !== 'pilote_moto') e.helmetColor = BRAV_HELMET_DARK;
    // gendarme sans casque : calot aux couleurs de la tenue
    if (kind === 'gendarme' && light) e.helmetColor = o.top;
  }
  d.backText = o.backText;
  d.backpack = false;
  d.faceCover = false;
  d.vest = 0;

  // ── grade et insignes ──
  const rd = rank ? RANK_DEFS[rank] : undefined;
  d.rankBars = rd ? rd.bars : 0;
  if (rd) {
    e.rankStyle = rd.style;
    e.rankColor = kind === 'gendarme' ? GENDARME_GOLD : rd.color;
  }
  // l'insigne tricolore n'est porté que par l'autorité habilitée (commandant unique ou autorité civile)
  d.sash = kind === 'commissaire' || poste === 'commandant_unite' || poste === 'autorite_civile';
  if (poste === 'commandant_unite') e.cdt = 1;
  if (pd.bodycam || kind === 'commissaire') e.camera_pieton = 1;
  e.radios = kind === 'commissaire' ? 2 : pd.radios;

  // ── dotation ──
  if (kind === 'policier_civil' && !poste) kitAddAll(d, CIVIL_KIT);
  else kitAddAll(d, pd.kit);
  d.hand = pd.hand;
  if (kind === 'policier_civil') {
    // en civil : bâton télescopique à la place du bâton à poignée latérale, pas de bouclier
    if (poste) {
      kitRemove(d, 'tonfa');
      kitRemove(d, 'bouclier');
      kitAdd(d, 'baton', 1);
    }
  }
  if (poste === 'operateur' && variant !== VARIANT.aucune) {
    e.variant = variant;
    if (variant === VARIANT.radio) {
      e.radios = 2;
    } else if (variant === VARIANT.secouriste) {
      // secouriste-vidéo du groupe de commandement : sac de secours, caméra
      kitAdd(d, 'trousse_secours', 10);
      kitAdd(d, 'serum_physiologique', 20);
      d.backpack = true;
      e.packColor = MEDIC_RED;
      e.camera_pieton = 1;
    } else if (variant === VARIANT.video) {
      kitAdd(d, 'telephone', 1);
      e.camera_pieton = 1;
    } else if (variant === VARIANT.liaison) {
      kitAdd(d, 'megaphone', 1);
    }
  }
  d.gasProtection = 0;
}

/** Libellé français d'un grade ('' si aucun). */
export function rankLabel(rank: PoliceRank | null): string {
  return rank ? RANK_DEFS[rank]?.label ?? '' : '';
}
