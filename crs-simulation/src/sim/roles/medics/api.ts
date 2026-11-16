/* =====================================================================================
 * MÉDECINS DE RUE (street medics) — types publics du module src/sim/roles/medics (`import type`).
 *
 * Services publiés :
 *   ctx.service<MedicsRecords>(MEDICS_RECORDS_SERVICE)   tableau de tri du joueur médecin, score de prise en charge,
 *                                                        activité des secouristes bénévoles PNJ ;
 *   ctx.service<MedicsTuning>(MEDICS_TUNING_SERVICE)     réglages (remis à leurs valeurs à chaque session) ;
 *   ctx.service<CareApi>('roles.care')                   soins (créé ici si le module des secours n'est pas branché).
 *
 * Le module pilote toute personne de type 'street_medic' qui n'est pas incarnée par le joueur, d'où
 * qu'elle vienne (mise en place de session, directeur de mission, tiers du cortège).
 *
 * Événements libres émis : 'medics:call' MedicCallEvent — un secouriste de rue signale un cas grave et demande le SAMU.
 * Événements libres écoutés : 'crowd:help' (la foule appelle « Médic ! »), 'care:done', 'rescue:call'.
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import type { TriageColor } from '../rescue/api';

export const MEDICS_SYSTEM_ID = 'roles:medics';
export const MEDICS_RECORDS_SERVICE = 'medics.records';
export const MEDICS_TUNING_SERVICE = 'medics.tuning';
export const MEDIC_CALL_EVENT = 'medics:call';

export interface MedicCallEvent {
  medicId: EntityId;
  victimId: EntityId;
  x: number;
  z: number;
  incidentId: number;
}

/** Une victime connue du joueur médecin (ligne du tableau de tri). */
export interface TriageEntry {
  id: EntityId;
  x: number;
  z: number;
  /** Couleur révélée par un bilan ('aucun' tant qu'elle n'a pas été examinée). */
  color: TriageColor;
  /** Couleur estimée à vue (ce que le joueur peut deviner sans bilan). */
  estimate: TriageColor;
  /** Priorité : plus grand = à traiter d'abord. */
  priority: number;
  /** Temps depuis lequel elle attend des soins (s). */
  waiting: number;
  distance: number;
  /** Quelqu'un s'en occupe déjà. */
  inCare: boolean;
  /** Elle a reçu des soins (elle peut encore attendre son évacuation). */
  treated: boolean;
  /** Elle doit être évacuée par le SAMU. */
  needsEvacuation: boolean;
  /** Signalée par un appel de la foule. */
  called: boolean;
}

/** Geste du joueur médecin et ce qu'il lui vaut. */
export interface MedicEntry {
  t: number;
  /** 'rincage' | 'soin' | 'bilan' | 'remise' | 'transmission' | 'tri' | 'abandon' | 'sac_vide'. */
  what: string;
  targetId: EntityId;
  points: number;
  /** Explication en français. */
  text: string;
}

export interface MedicsRecords {
  /** Score de prise en charge du joueur (barème du dossier 06 §10.4). */
  readonly score: number;
  readonly rinses: number;
  readonly treated: number;
  readonly bilans: number;
  readonly handovers: number;
  /** Bilans transmis au SAMU pour un cas grave. */
  readonly transmissions: number;
  /** Erreurs de tri : une urgence absolue connue a attendu pendant qu'un cas moins grave était traité. */
  readonly triageErrors: number;
  /** Blessés connus laissés sans soins. */
  readonly abandoned: number;
  /** Délai moyen entre le besoin constaté et le geste du joueur (s). */
  readonly meanDelay: number;
  /** Tableau de tri du joueur, le plus urgent d'abord (objets réutilisés d'une mise à jour à l'autre). */
  readonly board: readonly TriageEntry[];
  /** Victime à traiter d'abord (0 si personne). */
  readonly recommendedId: EntityId;
  readonly entries: readonly MedicEntry[];
  /** Activité des secouristes bénévoles PNJ. */
  readonly npc: Readonly<{ medics: number; rinses: number; treated: number; sheltered: number; signalled: number }>;
  summary(): string[];
}

export interface MedicsTuning {
  /** Rayon dans lequel un secouriste repère un blessé ou une personne gazée (m). */
  sightRange: number;
  /** Rayon dans lequel il entend « Médic ! » (m). */
  hearRange: number;
  /** Exposition au gaz à partir de laquelle une personne est prise en charge. */
  gasThreshold: number;
  /** Exposition au gaz à partir de laquelle le secouriste sort du nuage pour se protéger. */
  selfGasLimit: number;
  /** Temps passé auprès d'un cas grave en attendant le SAMU (s). */
  waitForSamu: number;
  /** Distance à laquelle il suit le cortège (m derrière la tête). */
  followBack: number;
}
