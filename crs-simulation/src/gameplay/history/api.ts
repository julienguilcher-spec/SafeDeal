/* =====================================================================================
 * HISTORIQUE — contrat du service 'history' (lu par l'écran « historique », la page d'accueil et le
 * compte rendu). Types et constantes uniquement, aucun DOM.
 *
 * Chaque partie jouée est inscrite à sa fin (événement session:ended) dans la section « historique »
 * de la sauvegarde : date et heure réelles, mode, rôle, grade, lieu, mission, durée, résultat, chiffres
 * clés, bilan de carrière et configuration (pour la rejouer). Les HISTORY_MAX dernières parties sont
 * gardées ; les cumuls (parties, heures de jeu, interpellations…) portent sur toutes les parties
 * inscrites depuis le dernier effacement, même celles qui ne sont plus dans la liste.
 * ===================================================================================== */

import type { GameMode, PlayableRole, PoliceRank, SessionConfig, WeatherKind } from '@/core/contracts';

/** Clé du service publié par le module. */
export const HISTORY_SERVICE = 'history';
/** Section de la sauvegarde (ctx.save) où l'historique est rangé. */
export const HISTORY_SAVE_SECTION = 'historique';
/** Événement libre émis après chaque changement de l'historique (charge utile : HistoryEntry, ou null après effacement). */
export const HISTORY_UPDATED_EVENT = 'history:updated';
/** Nombre de parties gardées dans la liste (les plus anciennes sont retirées au-delà ; les cumuls restent). */
export const HISTORY_MAX = 200;
/** Temps simulé minimal (s) pour qu'une partie soit inscrite : un départ annulé aussitôt n'est pas une partie. */
export const HISTORY_MIN_SECONDS = 10;
/** Taille maximale (caractères JSON) de la configuration gardée pour « Rejouer » ; au-delà, elle n'est pas gardée. */
export const HISTORY_MAX_CONFIG_CHARS = 12000;

/** Issue d'une partie. */
export type HistoryOutcome =
  /** Mission accomplie. */
  | 'reussie'
  /** Mission terminée sans être réussie (échec, objectifs incomplets). */
  | 'echouee'
  /** Mission abandonnée en cours de route. */
  | 'interrompue'
  /** Partie sans mission, menée jusqu'au compte rendu. */
  | 'terminee'
  /** Partie sans mission, quittée pour revenir à l'accueil. */
  | 'quittee';

/** Chiffres clés d'une partie (ensemble de la session, toutes unités confondues sauf mention). */
export interface HistoryFigures {
  /** Interpellations. */
  arrests: number;
  /** Personnes blessées (blessure grave ou pire, ou blessés comptés par le directeur de foule). */
  injured: number;
  /** Actes de force déclarés, et ceux hors du cadre légal. */
  forceUses: number;
  forceFaults: number;
  /** Actes de force du joueur lui-même. */
  playerForceUses: number;
  /** Sommations prononcées. */
  sommations: number;
  /** Départs de feu (hors personnes) et feux éteints. */
  fires: number;
  firesOut: number;
  /** Soins prodigués. */
  treated: number;
  /** Manifestants (effectif atteint) et dispersés. */
  crowd: number;
  dispersed: number;
  /** Incidents signalés et traités (module des incidents). */
  incidents: number;
  incidentsTreated: number;
  /** Régularité de l'emploi de la force (0..100 ; celle du joueur pour un rôle de police), null si non mesurée. */
  lawScore: number | null;
}

/** Résultat de mission retenu. */
export interface HistoryMissionResult {
  success: boolean;
  /** Note sur 100. */
  score: number;
  /** Mention (« B — Bien »). */
  grade: string;
  summary: string;
}

/** Bilan de carrière d'une partie jouée en mode carrière. */
export interface HistoryCareer {
  /** Note retenue (A … E). */
  grade: string;
  success: boolean;
  promoted: boolean;
  newRank?: PoliceRank;
  /** Sanction inscrite au dossier (intitulé), le cas échéant. */
  sanction?: string;
  message: string;
}

/** Une partie de l'historique. */
export interface HistoryEntry {
  id: string;
  /** Début (lancement) et fin de la partie, heure réelle (ms depuis l'époque Unix). */
  startedAt: number;
  endedAt: number;
  /** Temps de jeu réel (s) : temps passé à jouer, hors chargement et pauses. */
  playSeconds: number;
  /** Temps écoulé dans la simulation (s), avance rapide comprise. */
  simSeconds: number;
  mode: GameMode;
  role: PlayableRole;
  rank: PoliceRank | null;
  /** Lieu de départ (nom), '' si inconnu. */
  place: string;
  timeOfDay: number;
  weather: WeatherKind;
  crowdSize: number;
  missionId: string;
  /** Titre de la mission ('' pour une partie libre). */
  missionTitle: string;
  /** Journée de service : dernière étape atteinte ('' si la partie n'en était pas une). */
  journee: string;
  outcome: HistoryOutcome;
  /** La partie s'est close sur le compte rendu (sinon : retour direct à l'accueil). */
  debrief: boolean;
  result: HistoryMissionResult | null;
  figures: HistoryFigures;
  career: HistoryCareer | null;
  /** Configuration de la session, pour « Rejouer ce scénario » (null si trop volumineuse). */
  config: SessionConfig | null;
}

/** Cumuls depuis le dernier effacement de l'historique. */
export interface HistoryTotals {
  sessions: number;
  /** Temps de jeu réel cumulé (s). */
  playSeconds: number;
  simSeconds: number;
  missions: number;
  missionsSucceeded: number;
  arrests: number;
  injured: number;
  forceUses: number;
  forceFaults: number;
  sommations: number;
  fires: number;
  firesOut: number;
  treated: number;
  promotions: number;
  sanctions: number;
  /** Première et dernière partie inscrites (ms ; 0 si aucune). */
  firstAt: number;
  lastAt: number;
  /** Parties par rôle. */
  byRole: Partial<Record<PlayableRole, number>>;
}

/** Contenu de la section « historique » de la sauvegarde. */
export interface HistoryFile {
  v: 1;
  /** Parties, de la plus ancienne à la plus récente. */
  entries: HistoryEntry[];
  totals: HistoryTotals;
}

export interface HistoryApi {
  /** Parties gardées, de la plus récente à la plus ancienne (relues dans la sauvegarde à chaque appel). */
  readonly entries: readonly HistoryEntry[];
  readonly totals: Readonly<HistoryTotals>;
  /** Dernière partie inscrite pendant cette séance de jeu (null sinon). */
  readonly last: HistoryEntry | null;
  get(id: string): HistoryEntry | null;
  /** La partie en cours sera inscrite à sa fin (assez jouée) : sert au compte rendu, affiché juste avant. */
  willRecord(): boolean;
  /** Configuration à relancer pour rejouer une partie (copie), ou null si elle n'a pas été gardée. */
  replayConfig(id: string): SessionConfig | null;
  /** Efface l'historique et ses cumuls. */
  clear(): void;
}
