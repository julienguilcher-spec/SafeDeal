/* =====================================================================================
 * Module « patrouilles » (src/gameplay/patrols) : voitures de Police secours et de la BAC réparties dans Paris,
 * qui patrouillent, rendent compte à la radio et obéissent aux ordres du joueur gradé (carte tactique).
 *
 * Branchement : `import { createSystems as patrols } from '@/gameplay/patrols'` puis l'ajouter aux modules
 * (après le module de session, dont il lit l'emplacement des forces). Service : ctx.service<PatrolsApi>('police.patrols').
 * Mode Patrouille (vacation, extra.vacation) : répartiteur d'appels de CENTRAL, service ctx.service<PatrolModeApi>('patrol.mode')
 * (mode.ts, planificateur pur calls.ts, modèle partagé model.ts).
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { PatrolModeSystem } from './mode';
import { PatrolsSystem } from './system';

/** Patrouilles de l'IA, puis répartiteur d'appels de la vacation (mode Patrouille, actif seulement en vacation). */
export const createSystems: ModuleFactory = () => [new PatrolsSystem(), new PatrolModeSystem()];

export { PatrolsSystem } from './system';
export { PatrolModeSystem } from './mode';
export { PATROLS_SERVICE, PATROLS_SYSTEM_ID, PATROL_REPORT_EVENT } from './api';
export type { PatrolKind, PatrolReport, PatrolState, PatrolView, PatrolsApi } from './api';
export { PATROL_CALL_EVENT, PATROL_MODE_SERVICE, PATROL_MODE_SYSTEM_ID } from './api';
export type {
  BackupKind, CallKind, CallState, DispatchCall, PatrolCallEvent, PatrolModeApi, VacationConfig, VacationSummary,
} from './api';
export { RYTHMES, callLabel, callText, nextCallAt, pickKind, pickSpot, callSize } from './calls';
export { BAC_SITES, TV_SITES, approx, chooseSites, mood } from './sites';
export type { PatrolSite } from './sites';
