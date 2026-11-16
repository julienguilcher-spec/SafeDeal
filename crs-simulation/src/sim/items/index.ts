/* =====================================================================================
 * MATÉRIEL — objets, usage, projectiles et balistique.
 *
 *   ctx.actions      ActionApi : table des objets, inventaire, use / setAlt / canUse, solveAim
 *   ctx.projectiles  ProjectileApi : projectiles simulés (vol, rebonds, chocs, retards, effets)
 *   service « items » (ItemsApi, voir api.ts) : réglages, paramètres d'emploi, aide à la visée
 *
 * Brancher : game.addModule(createSystems). Aucune dépendance sur un autre module : dangers, santé,
 * décor, véhicules, droit et interactions sont atteints par les services du contexte.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { ItemsSystem } from './system';

export const createSystems: ModuleFactory = () => [new ItemsSystem()];

export { ITEMS_SERVICE, DRONE_TOGGLE_EVENT, ITEM_TOGGLE_EVENT, LAUNCHER_RANGE_EVENT } from './api';
export type {
  ItemsApi, ItemsTuning, ItemSpec, LaunchSpec, MeleeSpec, SpraySpec, ProjectileSpec, LauncherRange,
} from './api';
