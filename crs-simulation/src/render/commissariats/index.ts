/* Module « rendu des commissariats » : système de présentation (ordre VIEW) qui habille les sept sites de police
 * réels de src/world/commissariats — encadrement de porte, enseigne, lanterne bleue « POLICE » allumée la nuit,
 * drapeau tricolore, plaque « RÉPUBLIQUE FRANÇAISE », places réservées peintes — et les montre de loin (lanternes et
 * drapeaux de tous les sites en un seul appel de dessin).
 *
 * Branchement : ajouter `createSystems` à la racine de composition, après le rendu du décor. Le service
 * ctx.service<CommissariatsRenderApi>('render.commissariats') est publié dès provide(). Le module ne lit que le
 * contrat et '@/world/commissariats' ; sans ctx.view (mode headless) il ne fait rien. */

import type { ModuleFactory } from '@/core/contracts';
import { CommissariatsRenderSystem } from './system';

export type { CommissariatsRenderApi, CommissariatsRenderStats } from './api';
export { COMMISSARIATS_RENDER_KEY } from './api';
export { CommissariatsRenderer, CommissariatsRenderSystem, BUILD_RADIUS, farRadius, nearRadius } from './system';
export type { RenderHost, ViewLike } from './system';

export const createSystems: ModuleFactory = () => [new CommissariatsRenderSystem()];
