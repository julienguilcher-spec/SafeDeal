/* =====================================================================================
 * MISSIONS — module : cadre de mission (déroulé, objectifs, échecs, compte rendu) et catalogue.
 * Branchement : import { createSystems as missions } from '@/gameplay/missions'.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { MissionSystem } from './system';

export { MissionSystem, PHASE_TIMEOUT } from './system';
export type { MissionsApi, MissionResult, MissionResultLine } from './system';
export { missionConfig, missionComposition, missionCause, resolveRoute } from './config';
export { MISSIONS, missionById, missionsFor } from './catalog';

export const createSystems: ModuleFactory = () => [new MissionSystem()];
