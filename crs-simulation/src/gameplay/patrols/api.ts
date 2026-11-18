/* =====================================================================================
 * PATROUILLES — types publics de src/gameplay/patrols (à importer en `import type`).
 *
 * Service ctx.service<PatrolsApi>('police.patrols') : voitures de police (Police secours « TV 75-xx », BAC « BAC 75x »)
 * réparties dans Paris, chacune à partir d'un commissariat réel. Elles patrouillent d'elles-mêmes dans leur secteur,
 * rendent compte à la radio (canal commandement) de ce qu'elles voient, et obéissent aux ordres du joueur gradé donnés
 * par ctx.squads.issue (carte tactique) : mouvement vers un point (urgence, deux tons), tenir / cesser (sur place),
 * libre (« reprendre la patrouille »).
 *
 * Événement libre émis : 'patrol:report' PatrolReport (compte rendu radio d'une patrouille).
 * Clé lue dans session.config.extra : 'patrouilles' — nombre de voitures (0 : aucune ; défaut 'auto' : 5 pour un rôle
 * de police hors mission, 0 en mission).
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';

export const PATROLS_SERVICE = 'police.patrols';
export const PATROLS_SYSTEM_ID = 'gameplay.patrols';
export const PATROL_REPORT_EVENT = 'patrol:report';

export type PatrolKind = 'tv' | 'bac';

/**
 * patrouille : roule dans son secteur, à l'allure de la circulation ;
 * en_route   : se rend sur un point désigné (urgence : deux tons et gyrophares) ;
 * sur_place  : arrivée, ou arrêtée sur ordre (tenir, cesser) : elle y reste jusqu'à « libre » ou délai ;
 * mission    : exécute un autre ordre (protéger, interpeller…) piloté par le module de police ;
 * hors_service : véhicule détruit ou équipage absent.
 */
export type PatrolState = 'patrouille' | 'en_route' | 'sur_place' | 'mission' | 'hors_service';

export interface PatrolView {
  readonly squadId: number;
  readonly vehicleId: EntityId;
  readonly name: string;
  readonly kind: PatrolKind;
  state: PatrolState;
  /** Libellé court de l'état pour l'interface (« Patrouille », « En route (urgence) », « Sur place »…). */
  label: string;
  /** Commissariat de rattachement et centre du secteur. */
  readonly home: string;
  readonly homeX: number;
  readonly homeZ: number;
  /** Point désigné (en route, sur place), sinon le prochain point de patrouille. */
  tx: number;
  tz: number;
  /** Lieu du point désigné (« place de la République »), '' en patrouille. */
  target: string;
}

export interface PatrolReport {
  squadId: number;
  name: string;
  /** Nature : 'foyer' | 'incident' | 'feu' | 'vehicule' | 'foule' | 'arrivee' | 'ras' | 'reprise' | 'depart'. */
  key: string;
  text: string;
  x: number;
  z: number;
  t: number;
}

export interface PatrolsApi {
  readonly list: readonly PatrolView[];
  isPatrol(squadId: number): boolean;
  statusOf(squadId: number): PatrolView | null;
  /** Envoie la patrouille sur un point (urgence) : ordre « avancer » donné à son unité. false si inconnue. */
  send(squadId: number, x: number, z: number, issuedBy?: EntityId): boolean;
  /** Reprise de la patrouille (ordre « libre »). */
  resume(squadId: number, issuedBy?: EntityId): boolean;
}

// ── mode Patrouille (vacation du joueur) : types du répartiteur d'appels, définis dans model.ts ──
export { PATROL_CALL_EVENT, PATROL_MODE_SERVICE, PATROL_MODE_SYSTEM_ID } from './model';
export type {
  BackupKind, CallKind, CallState, DispatchCall, PatrolCallEvent, PatrolModeApi, VacationConfig, VacationSummary,
} from './model';
