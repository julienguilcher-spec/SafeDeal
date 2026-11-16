/* =====================================================================================
 * VILLE EN 3D — point d'entrée du module src/world/view (hors immeubles : voir buildings/).
 *
 * Branchement (racine de composition) :
 *   import { createSystems as worldView } from '@/world/view';
 *   game.addModule(worldView);
 * ou, avec des options (bancs d'essai) :
 *   game.addModule(() => createWorldViewSystems({ baseUrl: '../data/paris/' }));
 *
 * Le système (id « world:view », ordre SystemOrder.WORLD_VIEW) publie :
 *   ctx.service<Map2dApi>('world.map2d')     carte 2D vectorielle (mini-carte, GPS, carte tactique) ;
 *   ctx.service<WorldViewApi>('world.view')  mesures, surélévation du sol dessiné, construction forcée.
 * Il lit : ctx.view (scène, caméra, qualité, distance d'affichage), ctx.env.state, le service
 * « world.data » et les événements du monde ; et, s'il existe, le service « world.monuments »
 * (ou « monuments ») de forme { has(clé) } pour ne pas extruder un bâtiment qu'un monument remplace.
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '../../core/contracts';
import type { WorldViewOptions } from './api';
import { WorldViewSystem } from './system';

export type { FarTileProvider, Map2dApi, Map2dOptions, WorldViewApi, WorldViewOptions, WorldViewStats } from './api';
export { WORLD_MAP2D_SERVICE, WORLD_VIEW_SERVICE } from './api';
export { MAP_NORTH_UP } from './map2d';
export { CURB_HEIGHT } from './classes';
export { CITY_QUALITY } from './quality';

/** Systèmes du module, avec options. */
export function createWorldViewSystems(options: WorldViewOptions = {}): GameSystem[] {
  return [new WorldViewSystem(options)];
}

/** Fabrique standard du module (docs/ARCHITECTURE.md §2). */
export const createSystems: ModuleFactory = () => createWorldViewSystems();
