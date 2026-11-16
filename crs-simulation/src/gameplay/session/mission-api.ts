/* =====================================================================================
 * CARTE « MA MISSION » — types publics du service 'session.mission' (à importer en `import type`).
 *
 * Pour tout joueur qui reçoit des ordres ou une tâche (CRS de base, stagiaire, équipier d'engin, BRAV-M, télépilote,
 * pompier, SAMU, street medic, journaliste, manifestant) : son unité, qui suivre, UNE consigne en mots simples et le
 * point où aller. Le commandant, le commissaire et le chef de groupe n'en ont pas (ils donnent les ordres).
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import type { Instruction } from './executant';

export const MISSION_SERVICE = 'session.mission';
/** Objectif (GPS) tenu par la carte quand la consigne n'a pas déjà le sien (journée, incident, mission). */
export const MISSION_OBJECTIVE_ID = 'consigne';

/** Famille d'écoute et de carte : police exécutante, secours (pompiers, SAMU), civils (street medic, presse, manifestants). */
export type MissionFamily = 'police' | 'secours' | 'civil';

export interface MissionChief {
  id: EntityId;
  /** « Brigadier-chef Martin ». */
  label: string;
  /** « chef de groupe », « chef de section », « chef d'agrès ». */
  role: string;
  x: number;
  z: number;
  /** Distance au joueur (m). */
  distance: number;
}

export interface MissionBrief {
  /** La carte s'affiche (rôle qui reçoit des ordres ou une tâche, joueur incarné). */
  readonly active: boolean;
  readonly family: MissionFamily;
  /** Titre court de la carte (« CRS — Gardien stagiaire », « Sapeur-pompier »). */
  readonly heading: string;
  /** Chaîne d'unités (« Groupe MISTRAL 1 ALFA — Section MISTRAL 1 — Cie MISTRAL »), '' si aucune. */
  readonly chain: string;
  /** Qui suivre (null si personne). */
  readonly chief: MissionChief | null;
  /** La consigne en cours (une seule). */
  readonly instruction: Instruction;
  /** Incrémenté à chaque nouvelle consigne (surlignage « Nouvel ordre »). */
  readonly seq: number;
  /** Instant (temps de session) de la dernière nouvelle consigne. */
  readonly since: number;
  /** La dernière nouveauté est un ordre du groupe (sinon : nouvelle consigne). */
  readonly isOrder: boolean;
  /** Le joueur s'est éloigné de son groupe. */
  readonly regroup: boolean;
  /** Messages radio masqués récemment (trafic des autres unités). */
  readonly radioHidden: number;
  /** Ce que le joueur entend (« Radio : votre groupe et CENTRAL »). */
  readonly radioLabel: string;
  /** Objectifs déjà présentés par la carte (la liste des objectifs ne les répète pas). */
  readonly covered: readonly string[];
  /** Incrémenté à chaque changement de la carte (texte, chef, unité). */
  readonly version: number;
}
