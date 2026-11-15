/* Module « monuments » : monuments de Paris modélisés procéduralement.
 * Racine de composition : `game.use(createSystems)`. Les autres modules n'importent que `./api` (types). */
import type { ModuleFactory } from '@/core/contracts';
import { MonumentSystem } from './system';

export const createSystems: ModuleFactory = () => [new MonumentSystem()];

export { getMonument, hasMonument, listMonuments } from './registry';
export { getColliders, getWorldColliders, siteOfLandmark, listColliderKeys } from './colliders';
export { canonicalKey } from './keys';
export type { MonumentsApi, MonumentsStats } from './api';
export type { MonumentCollider, MonumentDef, MonumentFrame, MonumentSite } from './types';
