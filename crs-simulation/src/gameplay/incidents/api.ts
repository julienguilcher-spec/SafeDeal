/* =====================================================================================
 * INCIDENTS — types publics du module src/gameplay/incidents (à importer en `import type`).
 *
 * Services publiés :
 *   ctx.service<IncidentsApi>(EXT.incidents)                    incidents à traiter (interface de src/core/extensions.ts,
 *                                                               implémentée telle quelle) ;
 *   ctx.service<IncidentsRecords>(INCIDENTS_RECORDS_SERVICE)    journal pour l'évaluation : délais de prise en charge,
 *                                                               incidents aggravés, tâches confiées au joueur ;
 *   ctx.service<IncidentsTuning>(INCIDENTS_TUNING_SERVICE)      réglages modifiables (remis à leurs valeurs à chaque session).
 *
 * Événements libres émis (ctx.events.onAny) — les objets sont réutilisés, ne pas les conserver :
 *   'incidents:opened'   IncidentEvent    un incident vient d'être créé
 *   'incidents:updated'  IncidentEvent    affectation, début de traitement, aggravation, fusion d'un doublon, réouverture
 *   'incidents:closed'   IncidentEvent    clôture (resolved = traité ; sinon la cause a disparu d'elle-même ou l'échec est acté)
 *
 * Événements libres ÉCOUTÉS (tous facultatifs) :
 *   'hazards:douse'            { x, z, radius, amount }      un feu est arrosé : preuve de traitement
 *   'police:order_done'        { squadId, type, ok, reason } fin d'une tâche confiée à une unité
 *   'traffic:motorist'         { vehicleId, state, x, z }    automobiliste bloqué / libéré
 *   'crowd:help'               { personId, x, z }            la foule appelle les secours pour un blessé
 *   'props:barricade_extended' / 'props:barricade_cleared'  { id, … }
 *   'rescue:evacuated'         { personId, callId }          victime évacuée par les secours
 *
 * Clés lues dans SessionConfig.extra (facultatives) :
 *   incidents.detection   boolean   false : aucune détection automatique (seuls les incidents créés par open())
 *   incidents.dispatch    boolean   false : pas d'attribution automatique au joueur exécutant
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import type { IncidentKind, IncidentMeans } from '@/core/extensions';

export const INCIDENTS_SYSTEM_ID = 'gameplay:incidents';
export const INCIDENTS_RECORDS_SERVICE = 'incidents.records';
export const INCIDENTS_TUNING_SERVICE = 'incidents.tuning';

export const INCIDENT_OPENED_EVENT = 'incidents:opened';
export const INCIDENT_UPDATED_EVENT = 'incidents:updated';
export const INCIDENT_CLOSED_EVENT = 'incidents:closed';

export type IncidentChange = 'ouvert' | 'assigne' | 'en_cours' | 'aggrave' | 'fusion' | 'rouvert' | 'clos';

export interface IncidentEvent {
  id: number;
  kind: IncidentKind;
  change: IncidentChange;
  /** Clôture : l'incident a été traité. */
  resolved: boolean;
  byId: EntityId;
}

/** Façon dont un incident s'est terminé. */
export type IncidentOutcome =
  /** Encore ouvert. */
  | 'en_cours'
  /** Traité par le moyen désigné (ou par une intervention constatée). */
  | 'traite'
  /** La cause a disparu sans intervention (le feu a tout consumé, le blessé s'est relevé, le pillage a pris fin). */
  | 'cause_disparue'
  /** Clos sur un échec (victime décédée, moyen hors de combat, clôture explicite non résolue). */
  | 'echec';

/** Fiche d'un incident dans le journal (une par incident, conservée après la clôture). */
export interface IncidentRecord {
  readonly id: number;
  kind: IncidentKind;
  label: string;
  x: number;
  z: number;
  /** Urgence la plus haute atteinte. */
  urgency: 1 | 2 | 3;
  createdAt: number;
  /** Première affectation, début du traitement, clôture (temps de session ; −1 si jamais). */
  assignedAt: number;
  startedAt: number;
  closedAt: number;
  /** Dernier moyen désigné et dernière unité chargée. */
  means: IncidentMeans;
  squadId: number;
  severityStart: number;
  severityPeak: number;
  severityEnd: number;
  /** L'incident s'est aggravé faute de traitement (propagation, état de la victime, urgence relevée). */
  aggravated: boolean;
  /** Nombre d'aggravations constatées. */
  aggravations: number;
  /** Nombre de doublons regroupés dans cet incident (foyers voisins, victimes proches). */
  merged: number;
  /** Nombre d'affectations successives (1 = traité par le premier moyen désigné). */
  assignments: number;
  outcome: IncidentOutcome;
  /** Confié au joueur à un moment donné. */
  byPlayer: boolean;
  /** Une victime de cet incident est décédée. */
  death: boolean;
}

/** Tâche confiée au joueur exécutant (pompier, médecin, porte-extincteur, équipage…) et sa note. */
export interface PlayerTaskRecord {
  incidentId: number;
  kind: IncidentKind;
  label: string;
  /** Instant où la tâche a été confiée, où le joueur est arrivé sur place, où elle s'est terminée (−1 si jamais). */
  assignedAt: number;
  arrivedAt: number;
  endedAt: number;
  /** Distance à parcourir au moment de l'affectation (m). */
  distance: number;
  /** Délai d'arrivée attendu pour cette distance (s). */
  expectedArrival: number;
  /** null tant que la tâche est en cours. */
  success: boolean | null;
  /** Gravité au moment de l'affectation et à la fin. */
  severityAtStart: number;
  severityAtEnd: number;
  /** Note sur 100 (0 tant que la tâche est en cours). */
  note: number;
  /** Appréciation en français (« Feu éteint en 48 s — intervention rapide »). */
  comment: string;
}

export interface IncidentStats {
  total: number;
  open: number;
  /** Traités, clos sans traitement (cause disparue), échecs. */
  treated: number;
  lapsed: number;
  failed: number;
  aggravated: number;
  /** Incidents jamais confiés à quiconque. */
  neverAssigned: number;
  /** Délai moyen entre l'apparition et la première affectation (s ; 0 si aucune). */
  meanAssignDelay: number;
  /** Délai moyen entre l'apparition et le début du traitement (s ; 0 si aucun). */
  meanTreatmentDelay: number;
  /** Délai moyen entre l'apparition et la clôture des incidents traités (s). */
  meanResolution: number;
  /** Victimes décédées faute de prise en charge. */
  deaths: number;
  /** Note d'ensemble 0..100 pour l'évaluation (100 = tout traité vite, rien d'aggravé). */
  score: number;
}

export interface IncidentsRecords {
  /** Toutes les fiches de la session, dans l'ordre de création. */
  readonly all: readonly IncidentRecord[];
  /** Tâches confiées au joueur. */
  readonly playerTasks: readonly PlayerTaskRecord[];
  of(id: number): IncidentRecord | undefined;
  /** Statistiques recalculées à l'appel (objet réutilisé). */
  stats(): Readonly<IncidentStats>;
  /** Lignes du compte rendu en français, une par incident marquant, puis la synthèse. */
  summary(): string[];
}

/** Réglages du module (valeurs par défaut dans tuning.ts). */
export interface IncidentsTuning {
  /** Détection automatique à partir des événements et de l'état du monde. */
  detection: boolean;
  /** Attribution automatique des incidents au joueur quand son rôle est exécutant. */
  autoDispatch: boolean;
  /** Annonces et comptes rendus radio. */
  radio: boolean;
  /** Rayon de regroupement des foyers voisins (m) ; rayon élargi pour véhicules, barricades et boutiques. */
  mergeFire: number;
  mergeFireBig: number;
  /** Rayon de regroupement des victimes proches (m). */
  mergeVictims: number;
  mergeBarricades: number;
  mergeLooting: number;
  /** Un feu au sol n'est signalé que s'il dure (s) : un engin incendiaire isolé s'éteint seul. */
  groundFireConfirm: number;
  /** Une personne à terre sans blessure grave n'est signalée qu'après ce délai (s). */
  downConfirm: number;
  /** Durée pendant laquelle un incident clos reste dans la liste (s). */
  closedLinger: number;
  /** Sans début de traitement après ce délai (s), l'affectation tombe et l'incident redevient « ouvert ». */
  assignTimeout: number;
  /** Agent isolé : distance du collègue le plus proche (m), rayon et nombre d'hostiles, durée de confirmation (s). */
  isolatedFriendRange: number;
  isolatedHostileRange: number;
  isolatedHostiles: number;
  isolatedConfirm: number;
  /** Délai avant qu'un incident urgent et sans moyen soit proposé d'office au joueur exécutant (s). */
  dispatchDelay: number;
  /** Portée de l'attribution automatique au joueur à pied (m) et en véhicule (m). */
  dispatchRangeFoot: number;
  dispatchRangeVehicle: number;
}
