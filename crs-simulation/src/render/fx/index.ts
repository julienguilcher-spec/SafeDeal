/* Module « effets visuels » : gaz lacrymogène, fumée, feu, jets d'eau, explosions, étincelles,
 * décalques persistants et rendu des projectiles.
 *
 * Branchement : ajouter `createSystems` à la racine de composition, après le rendu de base (qui
 * fournit ctx.view). Le service ctx.service<FxRenderApi>('render.fx') est publié dès provide().
 * Sans ctx.view (mode headless, WebGL indisponible), le module ne fait rien. */

import type { ModuleFactory } from '@/core/contracts';
import { FxSystem } from './system';

export type {
  FxDynamicLight, FxEmitOptions, FxFireView, FxHazardField, FxLightsApi, FxPropsExt, FxRenderApi, FxRenderBase,
  FxRenderStats, FxVehiclesRender,
} from './api';
export {
  FX_HAZARD_FIELD_KEY, FX_LIGHTS_KEY, FX_PROPS_EXT_KEY, FX_RENDER_BASE_KEY, FX_RENDER_SERVICE, FX_VEHICLES_RENDER_KEY,
} from './api';
export { FX_BUDGETS, FX_QUALITY_LEVELS, budgetFor } from './budget';
export type { FxBudget } from './budget';
export { FX_SYSTEM_ID, FxSystem } from './system';

export const createSystems: ModuleFactory = () => [new FxSystem()];
