/* =====================================================================================
 * CARRIÈRE — contrat du service 'career' (lu par l'écran « carriere », la page d'accueil
 * en mode carrière et le compte rendu). Types et constantes uniquement, aucun DOM.
 * ===================================================================================== */

import type { PlayableRole, PoliceRank } from '@/core/contracts';
import type { CareerChapter } from '@/core/missions-schema';
import type { MissionResult } from '@/gameplay/missions/system';

/** Clé du service publié par le module. */
export const CAREER_SERVICE = 'career';
/** Section de la sauvegarde (ctx.save) où la progression est rangée. */
export const CAREER_SAVE_SECTION = 'carriere';
/** Événement libre émis après chaque changement de la progression (charge utile : CareerOutcome ou null après remise à zéro). */
export const CAREER_UPDATED_EVENT = 'career:updated';
/** Événement libre émis par le cadre de mission à la fin d'une mission (charge utile : MissionResult). */
export const MISSION_FINISHED_EVENT = 'mission:finished';

/** Note d'une mission (A = 4 … E = 0). */
export type CareerGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type SanctionKind = 'avertissement' | 'blame' | 'retrogradation';

/** Meilleur résultat obtenu sur une mission. */
export interface CareerMissionRecord {
  /** Meilleure note obtenue (toutes tentatives confondues). */
  best: CareerGrade;
  /** La mission a été réussie au moins une fois. */
  success: boolean;
  /** Nombre de parties jouées jusqu'au compte rendu. */
  plays: number;
  /** Date de la dernière partie (ms depuis l'époque Unix). */
  lastAt: number;
}

/** Sanction inscrite au dossier. */
export interface CareerSanction {
  at: number;
  kind: SanctionKind;
  reason: string;
  /** Mission au cours de laquelle la faute a été relevée. */
  missionId: string;
}

/** Progression enregistrée (section « carriere » de la sauvegarde). */
export interface CareerProgress {
  /** Chapitre courant du parcours principal (0 = école … 8 = semaine de mobilisation). */
  chapter: number;
  /** Grade tenu : celui du chapitre courant. */
  rank: PoliceRank;
  /** Résultats par identifiant de mission. */
  results: Record<string, CareerMissionRecord>;
  sanctions: CareerSanction[];
  /** Déblocages obtenus (habilitations, matériels, rôles), dans l'ordre d'obtention. */
  unlocked: string[];
  /** Chapitres terminés (parcours principal, détachements, regards croisés), dans l'ordre. */
  completed: number[];
}

export type ChapterStatus = 'done' | 'current' | 'locked';

/** Chapitre du catalogue, avec son état dans la progression. */
export interface CareerChapterView extends CareerChapter {
  status: ChapterStatus;
  /** Missions du chapitre réussies au moins une fois. */
  succeeded: number;
  /** Missions du chapitre jouées au moins une fois. */
  played: number;
  /** Moyenne (A = 4 … E = 0) des meilleures missions réussies retenues pour l'exigence, ou null si aucune. */
  average: number | null;
  /** Exigence remplie (missions réussies en nombre et moyenne suffisante). */
  requirementMet: boolean;
  /** Avancement lisible : « 3 / 5 missions réussies, moyenne B (B exigée) ». */
  progressLabel: string;
}

/** Disponibilité d'une mission dans la carrière. */
export interface MissionAvailability {
  available: boolean;
  /** Raison du verrou (vide si disponible). */
  reason: string;
  /** Chapitre de la mission (-1 si hors carrière ou inconnue). */
  chapter: number;
}

/** Ce que l'enregistrement d'un résultat a changé. */
export interface CareerOutcome {
  missionId: string;
  title: string;
  grade: CareerGrade;
  success: boolean;
  promoted: boolean;
  newRank?: PoliceRank;
  /** Dernier chapitre terminé par ce résultat, s'il y en a un. */
  chapterDone?: number;
  sanction?: CareerSanction;
  /** Bilan en une ou deux phrases (« Encore 2 missions à réussir… »). */
  message: string;
}

export interface CareerApi {
  /** Progression courante (lecture seule : ne pas modifier l'objet). */
  readonly progress: Readonly<CareerProgress>;
  /** Chapitres du catalogue avec leur état (recalculés après chaque changement). */
  readonly chapters: readonly CareerChapterView[];
  /** Bilan du dernier résultat enregistré pendant cette séance de jeu (null sinon). */
  readonly last: CareerOutcome | null;
  isMissionAvailable(id: string): boolean;
  missionStatus(id: string): MissionAvailability;
  /** Rôles ouverts par le grade de carrière (voir ROLES_BY_RANK dans rules.ts). */
  availableRoles(): PlayableRole[];
  /** Enregistre un résultat de mission (appelé d'office en mode carrière) et sauvegarde. */
  record(result: MissionResult): CareerOutcome;
  /** Recommence la carrière : efface la section de la sauvegarde. */
  reset(): void;
}

/** Ordre des grades, du plus bas au plus haut. */
export const RANK_ORDER: readonly PoliceRank[] = [
  'gardien_stagiaire', 'gardien', 'brigadier', 'brigadier_chef', 'major', 'capitaine', 'commandant', 'commissaire',
];

/** Intitulés des grades employés dans les messages de carrière. */
export const CAREER_RANK_LABELS: Readonly<Record<PoliceRank, string>> = {
  gardien_stagiaire: 'Gardien stagiaire',
  gardien: 'Gardien de la paix',
  brigadier: 'Brigadier',
  brigadier_chef: 'Brigadier-chef',
  major: 'Major',
  capitaine: 'Capitaine',
  commandant: 'Commandant',
  commissaire: 'Commissaire',
};

/** Rôles civils : toujours ouverts en carrière (leurs missions ont leurs propres conditions). */
export const CIVIL_ROLES: readonly PlayableRole[] = ['street_medic', 'secouriste', 'journaliste', 'manifestant'];

/**
 * Rôles des forces de l'ordre ouverts à partir d'un grade de carrière (cumulatifs) : CRS dès l'école,
 * les spécialités dès la titularisation, chef de groupe dès brigadier-chef, commandant dès capitaine.
 */
export const ROLES_BY_RANK: readonly { from: PoliceRank; roles: readonly PlayableRole[] }[] = [
  { from: 'gardien_stagiaire', roles: ['crs'] },
  { from: 'gardien', roles: ['bravm', 'operateur_canon_eau', 'telepilote', 'gendarme_centaure'] },
  { from: 'brigadier_chef', roles: ['chef_groupe'] },
  { from: 'capitaine', roles: ['commandant'] },
];

/** Grade de carrière à partir duquel un rôle s'ouvre (null pour un rôle civil, toujours ouvert, ou inconnu). */
export function rankOpeningRole(role: PlayableRole): PoliceRank | null {
  for (const step of ROLES_BY_RANK) if (step.roles.indexOf(role) >= 0) return step.from;
  return null;
}

export const GRADE_VALUES: Readonly<Record<CareerGrade, number>> = { A: 4, B: 3, C: 2, D: 1, E: 0 };
export const GRADE_LETTERS: readonly CareerGrade[] = ['E', 'D', 'C', 'B', 'A'];

/** Rang d'un grade dans RANK_ORDER (-1 s'il est inconnu). */
export function rankIndex(rank: PoliceRank | null | undefined): number {
  return rank ? RANK_ORDER.indexOf(rank) : -1;
}

/** Lettre d'une moyenne (arrondie vers le bas : 2,9 donne C, pour ne jamais annoncer une moyenne non atteinte). */
export function gradeLetter(average: number): CareerGrade {
  const i = Math.max(0, Math.min(4, Math.floor(average + 1e-6)));
  return GRADE_LETTERS[i]!;
}
