/* =====================================================================================
 * COMMANDEMENT — types publics du module src/ui/command.
 *
 * Écrans enregistrés auprès de UiKit :
 *   'carte_tactique'  carte de commandement (non bloquante pour la simulation) ;
 *                     ctx.ui.open('carte_tactique', { x?, z?, mpp?, incidentId?, squadId?, tab? })
 *   'roue_ordres'     roue d'ordres rapide en vue de jeu (touche « Ordres » maintenue ou brève)
 *   'radio'           panneau radio : journal et messages rapides
 * Éléments de HUD (zone 'top') : 'command.unit' (mon unité), 'command.incident' (incident confié).
 * Service : ctx.service<CommandApi>('ui.command').
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';

export const COMMAND_SERVICE = 'ui.command';

/**
 * Section de « Plus… » (carte de commandement) : l'ancien onglet de droite. Nom conservé pour les modules et les tests
 * qui ouvrent la carte sur une liste (« incidents », « circulation »…) ; 'commissariats' : la liste des postes (P5).
 */
export type TacticalTab = 'ordres' | 'incidents' | 'circulation' | 'journal' | 'commissariats';

/** Données d'ouverture de l'écran 'carte_tactique'. */
export interface TacticalOpenData {
  x?: number;
  z?: number;
  mpp?: number;
  /** Incident à mettre en avant : sa fiche s'ouvre. */
  incidentId?: number;
  /** Unité à mettre en avant : sa fiche s'ouvre. */
  squadId?: number;
  /** Commissariat à mettre en avant (identifiant du site, « 9e ») : sa fiche s'ouvre. */
  commissariatId?: string;
  /** Section de « Plus… » à ouvrir d'emblée (« Tous les incidents et secours », « Circulation et métro »…). */
  tab?: TacticalTab;
}

/** États de l'écran de la carte de commandement (tacticalState.ts), pour les modules qui s'y branchent. */
export type {
  CardState, PendingWhere, SentState, TacticalInput, TacticalSheet, TacticalStateView,
} from './tacticalState';

/** Étendue du commandement du joueur. */
export type CommandLevel = 'tout' | 'unite' | 'lecture';

export interface CommandScope {
  level: CommandLevel;
  /** Unités que le joueur peut commander (identifiants de ctx.squads). */
  squadIds: ReadonlySet<number>;
  /** Unité propre du joueur : celle qu'il commande au plus haut niveau, sinon celle dont il fait partie (0 si aucune). */
  ownSquadId: number;
  /** Fixer le niveau de force autorisé (ctx.law.authorize). */
  canAuthorize: boolean;
  /** Prononcer les sommations (autorité habilitée). */
  canSommation: boolean;
  canTraffic: boolean;
  canMetro: boolean;
  /** Déléguer un incident, appeler les secours. */
  canDelegate: boolean;
  /** Libellé affiché (« Commandant — toute la compagnie », « Lecture seule »). */
  label: string;
}

/** Ordre donné par l'interface (trace pour les tests et le journal). */
export interface IssuedOrder {
  squadId: number;
  type: OrderType;
  x: number;
  z: number;
  heading: number;
  width: number;
  targetId: number;
  maxForce: ForceLevel;
  t: number;
}

export interface CommandApi {
  /** Étendue du commandement du joueur, recalculée à la demande. */
  scope(): CommandScope;
  /** Derniers ordres donnés par l'interface (les 50 plus récents). */
  readonly issued: readonly IssuedOrder[];
  /** Plafond de force que le joueur applique à ses ordres (≤ force autorisée). */
  orderForce: ForceLevel;
}
