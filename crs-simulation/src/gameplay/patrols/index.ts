/* =====================================================================================
 * Module « patrouilles » (src/gameplay/patrols) : voitures de Police secours et de la BAC réparties dans Paris,
 * qui patrouillent, rendent compte à la radio et obéissent aux ordres du joueur gradé (carte tactique).
 *
 * Branchement : `import { createSystems as patrols } from '@/gameplay/patrols'` puis l'ajouter aux modules
 * (après le module de session, dont il lit l'emplacement des forces). Service : ctx.service<PatrolsApi>('police.patrols').
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { PatrolsSystem } from './system';

export const createSystems: ModuleFactory = () => [new PatrolsSystem()];

export { PatrolsSystem } from './system';
export { PATROLS_SERVICE, PATROLS_SYSTEM_ID, PATROL_REPORT_EVENT } from './api';
export type { PatrolKind, PatrolReport, PatrolState, PatrolView, PatrolsApi } from './api';
export { BAC_SITES, TV_SITES, approx, chooseSites, mood } from './sites';
export type { PatrolSite } from './sites';
