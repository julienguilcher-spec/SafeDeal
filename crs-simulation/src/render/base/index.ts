/* Module « rendu de base » : renderer, préréglages de qualité, ciel, soleil et lune, ombres,
 * brouillard, pluie, caméra, effets d'écran, lumières dynamiques.
 *
 * Branchement : ajouter `createSystems` à la racine de composition, AVANT les autres modules de
 * rendu (à ordre égal, les systèmes s'exécutent dans l'ordre d'ajout : la caméra est ainsi placée
 * avant que les personnages et les véhicules ne se dessinent). ctx.view et les services
 * 'render.lights', 'render.uniforms', 'render.camera', 'render.base' sont publiés dès provide(). */

import type { ModuleFactory } from '@/core/contracts';
import { RenderBaseSystem, RenderPresentSystem } from './system';

export type {
  DynamicLight, DynamicLightInit, RenderBaseApi, RenderCameraApi, RenderLightsApi, RenderStats, RenderUniformsApi,
  SharedUniforms, TacticalView, WetOptions,
} from './api';
export {
  RENDER_BASE_SERVICE, RENDER_CAMERA_SERVICE, RENDER_LIGHTS_SERVICE, RENDER_UNIFORMS_SERVICE,
} from './api';
export { QUALITY_LEVELS, QUALITY_PRESETS, presetFor } from './quality';
export type { QualityPreset } from './quality';
export { RenderBaseSystem, RenderPresentSystem, PRESENT_ORDER } from './system';
export { RenderView } from './view';

export const createSystems: ModuleFactory = () => {
  const base = new RenderBaseSystem();
  return [base, new RenderPresentSystem(base)];
};
