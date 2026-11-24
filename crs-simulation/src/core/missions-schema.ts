/* =====================================================================================
 * CRS SIMULATION FRANCE — SCHÉMA DES MISSIONS (complément de contracts.ts)
 * -------------------------------------------------------------------------------------
 * Une mission est une DONNÉE déclarative : le catalogue (src/gameplay/missions/catalog/)
 * ne contient que des objets MissionDef ; le cadre de mission (src/gameplay/missions/)
 * les interprète (mise en place, phases, objectifs, échec, évaluation).
 * Types uniquement. Ce fichier n'est modifié que par l'intégrateur.
 * ===================================================================================== */

import type { DurationPreset, PlayableRole, PolicePoste, PoliceRank, ProtestProfile, WeatherKind } from './contracts';

export type MissionType =
  | 'manifestation_declaree' | 'manifestation_interdite' | 'emeute_nocturne' | 'soir_de_match'
  | 'securisation' | 'escorte' | 'evacuation' | 'pillage' | 'protection_secours' | 'barrage'
  | 'interpellation_ciblee' | 'evenement_festif' | 'visite_officielle' | 'catastrophe' | 'patrouille'
  | 'formation';

/** Foule de la mission. Les lieux sont des NOMS de lieux réels connus de la carte (places, rues, ponts, stations). */
export interface MissionCrowd {
  /** Effectif demandé (0 = pas de manifestation). */
  size: number;
  /** Identifiant de cause (pouvoir_achat, retraites, climat, logement, hopital, education, agricole, carburants, libertes, culture…) ou '' s'il n'y a pas de revendication (émeute, soir de match). */
  cause: string;
  /** Tension initiale 0..1. */
  tension: number;
  /** Propension à dégénérer 0..1. */
  volatility: number;
  /** Part de black bloc / groupes radicaux 0..1. */
  radicalShare: number;
  /** Familles visuelles dominantes (gilets_jaunes, syndical, etudiants, climat, soignants, agriculteurs, retraites, familles, supporters, fetards…) avec leur part. */
  families: Record<string, number>;
  /** Parcours déclaré : suite de noms de lieux (vide = rassemblement statique). */
  route: string[];
  /** Part des arrivées par le métro 0..1. */
  metroShare: number;
}

/** Moyens engagés côté forces de l'ordre et secours. */
export interface MissionForces {
  /** Sections de CRS (3 groupes chacune). */
  sections: number;
  fourgons: number;
  /** Pelotons de gendarmes mobiles. */
  pelotons: number;
  centaure: number;
  canonEau: number;
  /** Binômes BRAV-M. */
  bravm: number;
  drone: boolean;
  /** Fourgons de pompiers et ambulances déjà prépositionnés (les autres s'appellent par radio). */
  pompiers: number;
  samu: number;
}

export type ObjectiveKind =
  // forces de l'ordre
  | 'tenir_position' | 'proteger_site' | 'disperser' | 'interpeller' | 'zero_bavure' | 'sommations_regulieres'
  | 'limiter_blesses' | 'limiter_degats' | 'couper_circulation' | 'degager_barricade' | 'escorter' | 'evacuer'
  | 'reperer_signaux' | 'guider_unite' | 'traiter_incidents' | 'releve' | 'prevention'
  // secours
  | 'eteindre' | 'secourir' | 'soigner'
  // presse
  | 'photographier' | 'filmer' | 'publier'
  // manifestant
  | 'rester_dans_cortege' | 'atteindre' | 'ne_pas_etre_interpelle' | 'proteger_les_siens'
  // communs
  | 'survivre' | 'duree' | 'personnalise';

export interface MissionObjective {
  /** Identifiant court unique dans la mission. */
  id: string;
  /** Texte affiché, à l'infinitif (« Tenir le barrage rue Royale pendant cinq minutes »). */
  text: string;
  kind: ObjectiveKind;
  secondary: boolean;
  /** Lieu concerné (nom de lieu réel) s'il y a lieu. */
  place?: string;
  /** Sujet ou cible (clé de monument, type d'incident, type de personne, événement à photographier…). */
  target?: string;
  /** Nombre à atteindre. */
  count?: number;
  /** Durée à tenir (secondes de jeu). */
  seconds?: number;
  /** Plafond à ne pas dépasser (blessés, vitrines brisées…). */
  max?: number;
}

export type PhaseTrigger =
  | { kind: 'temps'; seconds: number }
  | { kind: 'phase_foule'; phase: string }
  | { kind: 'tension'; above: number }
  | { kind: 'objectif'; id: string }
  | { kind: 'fin' };

export interface MissionRadioLine {
  /** Indicatif de l'émetteur (« TN 75 », « Alpha 1 », « Salle »…). */
  from: string;
  text: string;
}

export interface MissionPhase {
  id: string;
  /** Titre affiché en bandeau. */
  title: string;
  /** Ce qui se passe, en une à trois phrases. */
  text: string;
  /** Condition de passage à la phase suivante. */
  until: PhaseTrigger;
  /** Messages radio émis au début de la phase. */
  radio: MissionRadioLine[];
  /** Aléas imposés au début de la phase (libellés libres, interprétés au mieux par le directeur). */
  events: string[];
}

export type FailureKind =
  | 'joueur_hors_combat' | 'site_envahi' | 'bavure_grave' | 'revocation' | 'trop_de_blesses' | 'interpelle'
  | 'ligne_enfoncee' | 'victime_non_secourue' | 'temps' | 'personnalise';

export interface MissionFailure {
  kind: FailureKind;
  /** Texte affiché en cas d'échec. */
  text: string;
  /** Seuil éventuel. */
  value?: number;
}

/** Note de renseignement remise avant la mission (phase de préparation). */
export interface MissionIntel {
  /** Effectif et ambiance attendus, en une phrase. */
  expected: string;
  /** Appréciation de la part de radicaux (« une centaine d'individus déterminés », « aucun signalement »). */
  radicals: string;
  /** Points chauds prévisibles (noms de lieux réels). */
  hotspots: string[];
  /** Conseils de préparation (mesures préventives, dispositif). */
  advice: string[];
}

export interface MissionDef {
  /** Identifiant stable en minuscules, ex. « crs-01-premiere-ligne ». */
  id: string;
  title: string;
  /** Accroche d'une ou deux phrases. */
  pitch: string;
  /** Briefing complet (situation, mission, exécution, consignes), en paragraphes séparés par une ligne vide. */
  briefing: string;
  /** Rôle principal de la mission. */
  role: PlayableRole;
  /** Autres rôles dans lesquels la même situation peut être jouée (missions miroirs). */
  altRoles: PlayableRole[];
  rank: PoliceRank | null;
  poste: PolicePoste | null;
  /** Profil du joueur s'il est manifestant. */
  profile: ProtestProfile | null;
  type: MissionType;
  /** Lieu de départ (nom de lieu réel connu de la carte). */
  place: string;
  /** Heure de début 0..24. */
  timeOfDay: number;
  weather: WeatherKind;
  /** Direction d'où vient le vent (degrés, 0 = nord) et force (m/s). */
  windFrom: number;
  windSpeed: number;
  duration: DurationPreset;
  crowd: MissionCrowd;
  forces: MissionForces;
  intel: MissionIntel;
  phases: MissionPhase[];
  objectives: MissionObjective[];
  failures: MissionFailure[];
  /** Aléas possibles (libellés), tirés au hasard par le directeur. */
  randomEvents: string[];
  /** Ce qui rend la mission unique, en une phrase. */
  unique: string;
  /** 1 (facile) … 5 (très difficile). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Chapitre de la carrière (0 = école), ou -1 si hors carrière. */
  chapter: number;
  /** Identifiant de la mission dont celle-ci est le miroir (même scène, autre rôle), ou ''. */
  mirrorOf: string;
  tags: string[];
}

/** Chapitre de la carrière. */
export interface CareerChapter {
  index: number;
  title: string;
  /** Grade tenu pendant le chapitre. */
  rank: PoliceRank;
  description: string;
  /** Missions du chapitre (identifiants). */
  missions: string[];
  /** Condition de passage au chapitre suivant, en français. */
  requirement: string;
  /** Nombre de missions à réussir et note moyenne minimale (A = 4 … E = 0). */
  requiredMissions: number;
  requiredAverage: number;
  /** Déblocages obtenus à la fin du chapitre (habilitations, matériels, rôles). */
  unlocks: string[];
}
