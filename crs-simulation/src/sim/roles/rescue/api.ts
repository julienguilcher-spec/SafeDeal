/* =====================================================================================
 * SECOURS OFFICIELS — types publics du module src/sim/roles/rescue (à importer en `import type`).
 *
 * Services publiés :
 *   ctx.service<RescueApi>(EXT.rescue)                appel des secours (interface de src/core/extensions.ts) ;
 *   ctx.service<RescueExtApi>(RESCUE_EXT_SERVICE)     équipages, unité d'un appel, évaluation de la sécurité d'une zone, réglages ;
 *   ctx.service<RescueRecords>(RESCUE_RECORDS_SERVICE) journal des interventions (délais, attentes, résultats, tâches du joueur) ;
 *   ctx.service<CareApi>(CARE_SERVICE)                soins : tri des victimes, état de prise en charge, journal des gestes
 *                                                     (partagé avec le module des médecins de rue).
 *
 * Gestes d'interaction enregistrés (ctx.interactions) :
 *   'soigner'      bilan (5 s) puis gestes selon la gravité ; demande une trousse de secours
 *   'rincer_yeux'  sérum physiologique (6 s) : fait retomber l'exposition au gaz
 *   'remettre'     remettre aux secours le blessé que l'on porte (4 s) — coexiste avec le « remettre » des interpellations
 *   'evacuer'      charger dans l'ambulance le blessé que l'on porte (5 s)
 * (« porter », « trainer », « deposer » restent ceux du module des personnes.)
 *
 * Événements libres émis (ctx.events.onAny) — objets réutilisés, ne pas les conserver :
 *   'rescue:call'       RescueCallEvent     changement d'état d'un appel
 *   'rescue:evacuated'  { personId, callId } victime évacuée (elle quitte le jeu avec l'ambulance)
 *   'care:triage'       { id, color, byId }  couleur de tri révélée par un bilan
 *   'care:done'         CareRecord           geste de soin terminé
 * Événements libres écoutés : 'hazards:douse' (crédit des extinctions), 'incidents:closed'.
 *
 * Clés lues dans SessionConfig.extra (facultatives) :
 *   moyens.pompiers / moyens.samu     nombre d'engins et d'équipes engagés (page d'accueil) ; 0 = renfort extérieur, plus long
 *   moyens.secours_sur_appel          false : les secours sont pré-positionnés derrière le dispositif
 *   rescue.delayScale                 multiplicateur des délais de départ (tests, missions)
 *   rescue.staging                    { x, z } point de stationnement imposé des secours pré-positionnés
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';
import type { RescueKind, RescueState } from '@/core/extensions';

export const RESCUE_SYSTEM_ID = 'roles:rescue';
export const RESCUE_EXT_SERVICE = 'rescue.ext';
export const RESCUE_RECORDS_SERVICE = 'rescue.records';
export const CARE_SERVICE = 'roles.care';

export const RESCUE_CALL_EVENT = 'rescue:call';
export const RESCUE_EVACUATED_EVENT = 'rescue:evacuated';
export const CARE_TRIAGE_EVENT = 'care:triage';
export const CARE_DONE_EVENT = 'care:done';

export interface RescueCallEvent {
  callId: number;
  kind: RescueKind;
  state: RescueState;
  previous: RescueState;
}

// ───────────────────────────── soins ─────────────────────────────

/** Couleur de tri (bible §G.3) : vert = marche, jaune = urgence relative, rouge = urgence absolue, noir = décédé. */
export type TriageColor = 'aucun' | 'vert' | 'jaune' | 'rouge' | 'noir';

export type CareVerb = 'soigner' | 'rincer_yeux' | 'remettre' | 'evacuer';

/** Geste de soin terminé (journal). */
export interface CareRecord {
  t: number;
  verb: CareVerb;
  byId: EntityId;
  targetId: EntityId;
  /** Couleur de tri de la victime au moment du geste. */
  triage: TriageColor;
  /** Rang de la blessure avant et après (0 aucune … 4 décès). */
  injuryBefore: number;
  injuryAfter: number;
  /** Exposition au gaz avant le geste. */
  gasBefore: number;
  /** La victime a été stabilisée par ce geste (elle ne s'aggrave plus). */
  stabilised: boolean;
  /** Temps écoulé depuis que la victime attendait des soins (s ; −1 si inconnu). */
  waited: number;
}

/** État de prise en charge d'une personne (créé au premier besoin). */
export interface CareState {
  readonly id: EntityId;
  /** Couleur révélée par le dernier bilan ('aucun' tant qu'aucun bilan n'a été fait). */
  triage: TriageColor;
  evaluatedAt: number;
  /** Instant où le besoin de soins a été constaté pour la première fois (−1 si jamais). */
  needSince: number;
  /** Dernier soin : instant, soignant, points de vie à ce moment. */
  treatedAt: number;
  treatedBy: EntityId;
  treatedHealth: number;
  rinsedAt: number;
  /** Remise aux secours officiels (par un secouriste de rue ou un agent). */
  handedOver: boolean;
  handedAt: number;
  /** Chargée dans une ambulance. */
  loaded: boolean;
  /** Soignant qui s'en occupe en ce moment (réservation entre IA), jusqu'à claimUntil. */
  claimBy: EntityId;
  claimUntil: number;
}

export interface CareApi {
  /** Couleur de tri d'une personne d'après son état réel (les IA n'ont pas besoin de bilan pour trier). */
  triage(p: Person): TriageColor;
  /** Priorité de prise en charge : plus grand = à traiter d'abord (rouge > jaune > vert ; noir en dernier). */
  priority(p: Person): number;
  /** La personne a-t-elle besoin du geste « soigner » ? */
  needsCare(p: Person): boolean;
  /** A-t-elle besoin d'un rinçage des yeux ? */
  needsRinse(p: Person): boolean;
  /** Doit-elle être évacuée par les secours officiels (urgence absolue, ou à terre et gravement atteinte) ? */
  needsEvacuation(p: Person): boolean;
  state(id: EntityId): CareState | undefined;
  /** Réserve une victime pour un soignant pendant `seconds` ; false si un autre s'en occupe déjà. */
  claim(targetId: EntityId, byId: EntityId, seconds: number): boolean;
  release(targetId: EntityId, byId: EntityId): void;
  claimedBy(targetId: EntityId): EntityId;
  /** Journal des gestes de la session. */
  readonly log: readonly CareRecord[];
  /** Nombre de gestes en cours. */
  readonly activeCount: number;
}

// ───────────────────────────── secours ─────────────────────────────

/** Évaluation de la sécurité d'une zone d'intervention. */
export interface SafetyReport {
  safe: boolean;
  /** Une unité protège la zone (ordre « proteger » ou « escorter » à proximité, ou zone tenue par les forces). */
  protected: boolean;
  /** Motif en français quand la zone n'est pas sûre ('' sinon). */
  reason: string;
  /** Niveau de danger 0..1 (pour l'interface). */
  danger: number;
}

/** Vue d'un équipage pour l'interface et les missions. */
export interface CrewView {
  readonly id: number;
  readonly kind: RescueKind;
  readonly squadId: number;
  readonly vehicleId: EntityId;
  readonly callId: number;
  /** 'veille' pré-positionné, sans appel ; puis les états de l'appel. */
  readonly state: 'veille' | RescueState;
  readonly playerLed: boolean;
  readonly size: number;
  /** Eau restante dans la cuve (litres ; −1 sans engin-pompe). */
  readonly water: number;
}

export interface RescueTuning {
  /** Délai avant le départ après l'appel : régulation, départ de l'engin (s, bornes du tirage). */
  dispatchMin: number;
  dispatchMax: number;
  /** Multiplicateur des délais (SessionConfig.extra['rescue.delayScale']). */
  delayScale: number;
  /** Distance d'où partent les secours quand la carte est plus grande (m, le long des rues). */
  originDistance: number;
  /** Distance d'arrêt quand la zone n'est pas sûre (m). */
  standoff: number;
  /** Distance d'arrêt de l'engin-pompe et de l'ambulance sur une zone sûre (m). */
  workDistanceFire: number;
  workDistanceCare: number;
  /** Agent extincteur déposé par seconde et par lance (1 = une seconde d'extincteur portatif), et débit (l/s). */
  hoseRate: number;
  hoseFlow: number;
  /** Temps d'établissement de la lance à l'arrivée (s). */
  hoseSetup: number;
  /** Effectif d'un engin-pompe et d'une équipe médicale. */
  pompiersCrew: number;
  samuCrew: number;
  /** Nombre d'équipages simultanés par service. */
  maxPompiers: number;
  maxSamu: number;
  /** Seuils de sécurité : tension locale, hostiles proches, gaz. */
  unsafeTension: number;
  unsafeHostiles: number;
  unsafeGas: number;
  /** Les équipages se replient quand ils sont pris à partie. */
  retreatWhenAttacked: boolean;
}

/** Fiche d'une intervention (une par appel). */
export interface RescueRecord {
  readonly callId: number;
  kind: RescueKind;
  incidentId: number;
  x: number;
  z: number;
  requestedAt: number;
  /** Départ, arrivée sur place, départ des lieux (−1 si jamais). */
  departedAt: number;
  arrivedAt: number;
  leftAt: number;
  /** Temps passé à attendre la sécurisation (s) et dernier motif. */
  waited: number;
  waitReason: string;
  firesOut: number;
  victimsTreated: number;
  victimsEvacuated: number;
  /** Membres de l'équipage blessés pendant l'intervention. */
  crewHurt: number;
  /** L'équipage a dû se replier sous les projectiles. */
  retreats: number;
  playerLed: boolean;
  cancelled: boolean;
  /** Points selon le barème du dossier 06 §10.4 (feu éteint +12, urgence relative +10, urgence absolue +25,
   *  équipe blessée faute de protection −25, victime attendue plus de 4 min −10). */
  points: number;
}

export interface RescueRecords {
  readonly all: readonly RescueRecord[];
  of(callId: number): RescueRecord | undefined;
  /** Délai moyen entre l'appel et l'arrivée sur place (s ; 0 si aucune arrivée). */
  meanArrival(): number;
  /** Total des points des interventions menées par le joueur. */
  playerPoints(): number;
  summary(): string[];
}

export interface RescueExtApi {
  readonly tuning: RescueTuning;
  readonly crews: readonly CrewView[];
  /** Unité (ctx.squads) de l'équipage engagé sur un appel ; 0 tant qu'aucun n'est parti. */
  squadOf(callId: number): number;
  /** Évalue la sécurité d'une zone pour un service donné, vue depuis un point d'approche (objet réutilisé). */
  assess(kind: RescueKind, x: number, z: number, fromX: number, fromZ: number): Readonly<SafetyReport>;
  /** Crée un équipage pré-positionné (engin garé, équipage à bord) ; il répondra aux appels. null si impossible. */
  stage(kind: RescueKind, x: number, z: number, heading: number): CrewView | null;
  /** Appel en cours confié à l'équipage du joueur (0 si aucun). */
  readonly playerCallId: number;
}
