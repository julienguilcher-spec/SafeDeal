/* =====================================================================================
 * ARCHÉTYPES — types publics (à importer en `import type` depuis les autres modules).
 *
 * Services publiés :
 *   ctx.archetypes                                ArchetypeApi du contrat : spawn(kind, x, z, opts), equip(p, poste | profil)
 *   ctx.service<ArchetypeExtApi>('roles.archetypes')  options typées, tenue du bloc, traits, libellés
 *   ctx.service<CausesApi>('roles.causes')        causes, organisations fictives, pancartes, slogans, banderoles
 *   ctx.service<SpawnHelperApi>('roles.spawn')    aide au peuplement : foule, tiers du cortège, unités de police
 *
 * Événement libre émis (ctx.events.emitAny) :
 *   'roles:equipped'  RolesEquippedEvent   une personne vient d'être habillée et dotée (spawn ou equip)
 *
 * ── CLÉS DE Person.look.extras ÉCRITES PAR CE MODULE (toutes numériques) ─────────────────────
 *   cause        index de la cause dans roles.causes.list (manifestants et tiers du cortège)
 *   family       index de la famille visuelle dans FAMILY_IDS (0 = « divers », sans étiquette)
 *   signText     index GLOBAL du texte de pancarte : roles.causes.signText(i) (tous les manifestants en
 *                ont un, même sans pancarte en main : c'est aussi l'annotation au dos d'un gilet jaune)
 *   bannerText   index GLOBAL du texte de banderole : roles.causes.bannerText(i) (porteurs de banderole)
 *   org          index GLOBAL de l'organisation fictive : roles.causes.org(i) (chasuble, drapeau)
 *   company      numéro de compagnie de CRS ou d'escadron (fictif : 70 à 79), affiché « CRS 74 »
 *   section      1 à 4 (0 = commandement) ; group : 1 = A, 2 = B, 3 = C → code dorsal « 2B »
 *   variant      variante du rôle (codes VARIANT ci-dessous)
 *   bloc         1 = tenue noire du bloc portée ; 0 = tenue de ville (le noir est dans le sac)
 *   child        1 = enfant (taille < 1,50 m ; personne protégée pour le module de droit)
 *   unmarked     1 = journaliste sans aucun signe « PRESSE »
 *   sex, age     0 = homme, 1 = femme ; âge en années
 *   rankStyle    dessin du galon (codes RANK_STYLE) ; rankColor : couleur du galon (0xRRGGBB)
 *   radios       nombre de postes radio portés (2 pour les chefs de section, le commandant, l'autorité)
 *   cdt          1 = mention « CDT » à l'arrière du casque (convention de jeu)
 *   camera_pieton 1 = caméra-piéton portée (clé lue par le module de droit)
 * Clés du rendu des personnages que ce module renseigne aussi : helmetColor, bandColor, packColor,
 * coverColor, gloves, jacket, sleeves, shorts, skirt, beard, scarf, goggles, hoodDown.
 * Clés LUES à l'entrée de spawn() dans opts.look.extras : cause, family, signText, bannerText, org,
 * company, section, group, variant, bloc, child, unmarked, sex, age et carry (codes CARRY : objet
 * porté en main imposé). Tout changement d'apparence remplace l'objet extras (le rendu détecte le
 * changement par référence).
 * ===================================================================================== */

import type {
  ArchetypeApi, EntityId, ItemId, Person, PersonInit, PersonKind, PolicePoste, PoliceRank, ProtestProfile, Rng,
} from '@/core/contracts';

export const ROLES_ARCHETYPES = 'roles.archetypes';
export const ROLES_CAUSES = 'roles.causes';
export const ROLES_SPAWN = 'roles.spawn';
export const ROLES_EQUIPPED_EVENT = 'roles:equipped';

export interface RolesEquippedEvent {
  id: EntityId;
  /** true : première dotation (spawn) ; false : ré-équipement (equip, changement de tenue). */
  spawned: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Familles visuelles, profils, variantes
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Famille visuelle d'un manifestant (BRIEF §1). Les neuf dernières sont celles que règle la page
 * d'accueil (mêmes identifiants que SessionConfig.extra.composition) ; « divers » désigne les
 * participants sans étiquette, en tenue de ville (précortège, sympathisants, badauds entraînés).
 */
export type VisualFamily =
  | 'divers' | 'gilets_jaunes' | 'syndical' | 'etudiants' | 'climat' | 'soignants' | 'agriculteurs'
  | 'retraites' | 'familles' | 'black_bloc';

/** Ordre stable : l'index d'une famille est la valeur de look.extras.family. */
export const FAMILY_IDS: readonly VisualFamily[] = [
  'divers', 'gilets_jaunes', 'syndical', 'etudiants', 'climat', 'soignants', 'agriculteurs', 'retraites',
  'familles', 'black_bloc',
];

/** Ordre stable des profils (index utilisé par les tables de composition). */
export const PROFILE_IDS: readonly ProtestProfile[] = [
  'pacifique', 'famille', 'militant', 'service_ordre', 'meneur', 'opportuniste', 'radical', 'pilleur',
];

/** Variantes d'un rôle (valeur de look.extras.variant). 0 = variante tirée d'après la graine. */
export const VARIANT = {
  aucune: 0,
  // forces de l'ordre, poste « operateur » hors véhicule (groupe de commandement)
  radio: 1,
  secouriste: 2,
  video: 3,
  liaison: 4,
  chef_engin: 5,
  // autorité civile
  tenue: 6,
  civil: 7,
  // journaliste
  photographe: 8,
  reporter_images: 9,
  direct: 10,
  // sapeur-pompier
  porte_lance: 11,
  secours_victime: 12,
  chef_agres: 13,
  // SAMU
  medecin: 14,
  infirmier: 15,
  ambulancier: 16,
  // commerçant
  cafe: 17,
  boutique: 18,
  alimentation: 19,
} as const;
export type VariantId = keyof typeof VARIANT;

/** Objet tenu en main imposé à la création (valeur de look.extras.carry, lue puis retirée). */
export const CARRY = {
  auto: 0,
  rien: 1,
  pancarte: 2,
  drapeau: 3,
  banderole: 4,
  parapluie: 5,
  megaphone: 6,
} as const;
export type CarryId = keyof typeof CARRY;

/** Dessin du galon (look.extras.rankStyle) — docs/research/00-bible-realisme.md §D. */
export const RANK_STYLE = {
  aucun: 0,
  /** Chevrons argent : gardien stagiaire (1), gardien de la paix (2). */
  chevrons: 1,
  /** Barrette argent à raie rouge : brigadier-chef (1), major (1 + liseré = 2). */
  barrette_argent: 2,
  /** Barrettes blanches des officiers : capitaine (3), commandant (4). */
  barrettes_blanches: 3,
  /** Branche de feuilles de chêne du commissaire (aucune barrette). */
  feuilles_chene: 4,
  /** Barrette or à raie rouge : ancien grade de brigadier (supprimé le 1er août 2023). */
  barrette_or: 5,
} as const;

// ─────────────────────────────────────────────────────────────────────────────────────
// Causes, organisations, pancartes
// ─────────────────────────────────────────────────────────────────────────────────────

export type OrgKind = 'intersyndicale' | 'syndicat' | 'collectif' | 'association' | 'coordination';

/** Organisation FICTIVE qui appelle à manifester (aucune organisation réelle). */
export interface OrgDef {
  /** Nom complet, affichable sur une banderole ou un camion sono. */
  name: string;
  /** Sigle court (chasuble, ballon, drapeau). */
  sigle: string;
  kind: OrgKind;
  /** Couleur de l'organisation (chasubles, drapeaux, ballons), 0xRRGGBB. */
  color: number;
}

/** Slogan scandé : un meneur lance l'appel, la foule répond. */
export interface ChantDef {
  call: string;
  response: string;
}

export interface CrowdMix {
  /** Part de chaque famille visuelle (somme = 1 ; familles absentes = 0). */
  families: Readonly<Partial<Record<VisualFamily, number>>>;
  /** Part de chaque profil (somme = 1). */
  profiles: Readonly<Record<ProtestProfile, number>>;
}

export interface CauseDef {
  /** Identifiant stable (« retraites », « climat »…) : c'est SessionConfig.extra.cause. */
  id: string;
  /** Libellé français (« Retraites »). */
  label: string;
  /** Une phrase neutre : ce que demandent les manifestants. */
  summary: string;
  /** Organisations fictives qui appellent. */
  orgs: readonly OrgDef[];
  /** Textes de pancartes (25 au moins), courts, écrits à la main. */
  signs: readonly string[];
  /** Slogans scandés (10) : appel et réponse. */
  chants: readonly ChantDef[];
  /** Textes de banderole de tête. */
  banners: readonly string[];
  /** Couleurs dominantes du cortège (drapeaux, ballons, fumigènes), 0xRRGGBB. */
  colors: readonly number[];
  /** Composition type de la foule. */
  mix: CrowdMix;
}

/** Cause enregistrée : sa définition et la place de ses textes dans les tables globales. */
export interface CauseInfo extends CauseDef {
  /** Index dans `list` (valeur de look.extras.cause). */
  readonly index: number;
  /** Premier index global de ses pancartes, et leur nombre. */
  readonly signBase: number;
  readonly signCount: number;
  readonly bannerBase: number;
  readonly bannerCount: number;
  readonly orgBase: number;
  readonly orgCount: number;
}

export interface CausesApi {
  readonly list: readonly CauseInfo[];
  /** Cause par identifiant (ou par index) ; undefined si inconnue. */
  get(id: string | number): CauseInfo | undefined;
  /** Nombre total de textes de pancartes, toutes causes confondues. */
  readonly signCount: number;
  /** Texte de pancarte d'index global `index` ('' hors bornes). */
  signText(index: number): string;
  /** Le même texte coupé en lignes équilibrées (pour une pancarte : 3 lignes au plus). */
  signLines(index: number): readonly string[];
  /** Tire un texte de pancarte de la cause ; retourne son index GLOBAL (−1 si cause inconnue). */
  pick(cause: string | number, rng: Rng): number;
  readonly bannerCount: number;
  bannerText(index: number): string;
  pickBanner(cause: string | number, rng: Rng): number;
  /** Tire un slogan scandé de la cause (null si cause inconnue). */
  pickChant(cause: string | number, rng: Rng): ChantDef | null;
  readonly orgCount: number;
  /** Organisation fictive d'index global `index`. */
  org(index: number): OrgDef | undefined;
  /** Cause d'un texte de pancarte (index global) ; undefined hors bornes. */
  causeOfSign(index: number): CauseInfo | undefined;
  /**
   * Texte que porte actuellement la personne : banderole si elle en tient une, sinon sa pancarte ;
   * null si elle n'a ni l'une ni l'autre dans sa dotation.
   */
  heldText(p: Person): string | null;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Aide au peuplement
// ─────────────────────────────────────────────────────────────────────────────────────

/** Type de journée (docs/research/03-dynamique-manifestation.md §2.3) : fixe la part de chaque profil. */
export type CrowdScenario =
  | 'marche_calme' | 'journee_tendue' | 'samedi_sans_organisateur' | 'soir_spontane' | 'soir_de_match';

export interface CrowdComposition {
  /** Parts (ou poids) des familles visuelles ; par défaut celles de la cause. */
  families?: Readonly<Partial<Record<VisualFamily, number>>>;
  /** Parts (ou poids) des profils ; par défaut celles du scénario, sinon celles de la cause. */
  profiles?: Readonly<Partial<Record<ProtestProfile, number>>>;
  scenario?: CrowdScenario;
  /** 0..1 : déplace des suiveurs vers les radicaux (SessionConfig.volatility). */
  volatility?: number;
  /** Part d'enfants parmi les « famille » de la famille « familles » (défaut 0,25 ; 0 pour aucun). */
  children?: number;
  /** false : ne pas désigner de porteurs de banderole (défaut true). */
  banners?: boolean;
}

/** Une personne à créer. */
export interface CrowdSlot {
  kind: PersonKind;
  profile: ProtestProfile | null;
  family: VisualFamily;
  /** Objet imposé en main (porteurs de la banderole de tête, parapluies du bloc) ; absent = d'après la graine. */
  carry?: CarryId;
  /** true : enfant accompagné. */
  child?: boolean;
  /** Variante (tiers du cortège : photographe, reporter d'images…). */
  variant?: VariantId;
}

export type UnitType =
  | 'groupe_appui' | 'groupe_intervention' | 'groupe_commandement' | 'section' | 'demi_compagnie' | 'compagnie'
  | 'peloton_gm' | 'escadron' | 'bravm_groupe' | 'bravm_unite' | 'equipage_centaure' | 'equipage_canon_eau'
  | 'equipe_drone' | 'equipe_liaison' | 'autorite' | 'pompiers' | 'samu';

export interface UnitOptions {
  /** Numéro de la section (1 à 4) pour un groupe ou une section isolés. Défaut 1. */
  section?: number;
  /** Ajoute les conducteurs restés aux véhicules (un fourgon par groupe). Défaut false. */
  drivers?: boolean;
  /**
   * Le chef de l'unité est le commandant unique du dispositif (écharpe, mégaphone, sommations).
   * Défaut : true pour « compagnie » et « autorite », false sinon.
   */
  authority?: boolean;
}

/** Un poste à pourvoir dans une unité. */
export interface UnitSlot {
  kind: PersonKind;
  poste: PolicePoste | null;
  rank: PoliceRank | null;
  /** Section (1 à 4 ; 0 = commandement de la compagnie ou unité sans section). */
  section: number;
  /** Groupe tactique : 'A' appui, 'B' intervention, 'C' commandement ; '' sans objet. */
  group: 'A' | 'B' | 'C' | '';
  /** Libellé français du poste (« Porteur de bouclier », « Secouriste-vidéo »…). */
  label: string;
  variant?: VariantId;
  /** Chef de son groupe / de sa section / de l'unité (pour SquadApi.setLeader). */
  leads: '' | 'groupe' | 'section' | 'unite';
}

export interface SpawnHelperApi {
  /**
   * Composition d'une foule de `count` manifestants pour une cause : liste de personnes à créer, dans
   * l'ordre du cortège (précortège et bloc, carré de tête, blocs des organisations, cortèges divers),
   * mélangée à l'intérieur de chaque famille. Les parts des familles sont respectées à une personne
   * près ; celles des profils au mieux de ce que les familles permettent.
   * `composition` accepte aussi directement les parts par famille de la page d'accueil.
   */
  crowd(
    cause: string | number, count: number,
    composition?: CrowdComposition | Readonly<Partial<Record<VisualFamily, number>>> | null, rng?: Rng,
  ): CrowdSlot[];
  /** Tiers du cortège pour `count` manifestants : journalistes, observateurs, street medics (table F.1 de la bible). */
  bystanders(count: number, scenario?: CrowdScenario, rng?: Rng): CrowdSlot[];
  /** Postes d'une unité (docs/research/00-bible-realisme.md §E.1 et §E.2). */
  policeUnit(type: UnitType, opts?: UnitOptions): UnitSlot[];
  /** Types d'unités connus. */
  readonly unitTypes: readonly UnitType[];
  /** Crée la personne d'une case de foule (cause : celle de la session par défaut). */
  spawnSlot(slot: CrowdSlot, x: number, z: number, opts?: ArchetypeOptions): Person;
  /** Crée la personne d'un poste d'unité (numéro de compagnie : celui de la session par défaut). */
  spawnUnitSlot(slot: UnitSlot, x: number, z: number, opts?: ArchetypeOptions): Person;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Service étendu des archétypes
// ─────────────────────────────────────────────────────────────────────────────────────

/** Options de création typées (équivalent lisible des clés de look.extras). */
export interface ArchetypeOptions extends Omit<PersonInit, 'kind' | 'x' | 'z'> {
  family?: VisualFamily;
  /** Identifiant ou index de cause. */
  cause?: string | number;
  variant?: VariantId;
  carry?: CarryId;
  child?: boolean;
  /** Manifestant du bloc : true = déjà en noir, false = encore en tenue de ville. */
  bloc?: boolean;
  /** Journaliste sans signe distinctif. */
  unmarked?: boolean;
  company?: number;
  section?: number;
  group?: 'A' | 'B' | 'C';
  /** Index global d'organisation fictive (couleur de chasuble). */
  org?: number;
  /** Index global de texte de pancarte imposé. */
  signText?: number;
}

/** Ce que le module sait d'une personne qu'il a habillée. */
export interface ArchetypeTraits {
  readonly seed: number;
  /** 0 = homme, 1 = femme. */
  readonly sex: number;
  readonly age: number;
  /** Condition physique (1 = adulte moyen) : fixe les vitesses de base. */
  readonly fitness: number;
  readonly family: VisualFamily;
  /** Index de cause (−1 : sans objet). */
  readonly cause: number;
}

/** Réglages de session du module (lus dans SessionConfig.extra au début de chaque session). */
export interface ArchetypeSessionDefaults {
  /** Index de la cause de la manifestation du jour. */
  cause: number;
  /** Numéro de compagnie des CRS engagés. */
  company: number;
}

export interface ArchetypeExtApi extends ArchetypeApi {
  /** Comme spawn(), avec des options typées (famille, cause, variante, compagnie…). */
  spawnEx(kind: PersonKind, x: number, z: number, opts?: ArchetypeOptions): Person;
  /**
   * Fait enfiler (true) ou retirer (false) la tenue noire du bloc à un manifestant, sans changer son
   * profil : c'est le « changement de tenue » des radicaux. Retourne false si la personne n'est pas
   * un manifestant.
   */
  setBlocAttire(p: Person, on: boolean): boolean;
  /** La personne porte-t-elle la tenue noire du bloc ? */
  inBlocAttire(p: Person): boolean;
  /** Change la famille visuelle d'un manifestant (il se rhabille en conséquence). */
  setFamily(p: Person, family: VisualFamily): boolean;
  /** Traits d'une personne habillée par ce module (null sinon). */
  traits(id: EntityId): ArchetypeTraits | null;
  /** Famille visuelle d'une personne (« divers » par défaut). */
  familyOf(p: Person): VisualFamily;
  /** Cause défendue par une personne (index ; −1 si aucune). */
  causeOf(p: Person): number;
  /** Code dorsal de groupe (« 2B ») d'un agent ; '' sans objet. */
  groupCode(p: Person): string;
  /** Masse de l'équipement porté (kg) : protections, sac, objets (d'après ctx.actions.def). */
  loadKg(p: Person): number;
  /** Libellés français. */
  kindLabel(kind: PersonKind): string;
  posteLabel(poste: PolicePoste | null): string;
  profileLabel(profile: ProtestProfile | null): string;
  rankLabel(rank: PoliceRank | null): string;
  familyLabel(family: VisualFamily): string;
  /** Dotation type d'un poste ou d'un profil (identifiants d'objets, dans l'ordre des emplacements). */
  kitOf(kind: PersonKind, role: PolicePoste | ProtestProfile | null): readonly ItemId[];
  readonly session: Readonly<ArchetypeSessionDefaults>;
  /** Fixe la cause du jour et le numéro de compagnie (sinon : SessionConfig.extra, puis graine). */
  setSession(defaults: Partial<ArchetypeSessionDefaults>): void;
}
