/* =====================================================================================
 * Module d'interface — HUD, menus, page d'accueil, socle (UiApi, UiKit, objectifs).
 *
 * Branchement (racine de composition) :
 *     import { createSystems as ui } from '@/ui';
 *     game.addModule(ui);
 *
 * Le système principal (id 'ui', ordre SystemOrder.UI) publie ctx.ui, EXT.uiKit et
 * EXT.objectives (voir src/ui/core/api.ts). Les sous-modules facultatifs src/ui/maps (cartes)
 * et src/ui/command (carte tactique, roue d'ordres, radio) sont agrégés ici s'ils existent :
 * leur index.ts doit exporter `createSystems: ModuleFactory`. Leurs systèmes viennent APRÈS le
 * système principal : ils trouvent donc EXT.uiKit dès leur init().
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { UiSystem } from './core/system';

interface SubModule {
  createSystems?: ModuleFactory;
}

/** Sous-modules présents dans le dépôt au moment de la construction (objet vide s'il n'y en a aucun). */
const SUB_MODULES = import.meta.glob<SubModule>(['./maps/index.ts', './command/index.ts'], { eager: true });

export const createSystems: ModuleFactory = () => {
  const systems: GameSystem[] = [new UiSystem()];
  for (const path of Object.keys(SUB_MODULES).sort()) {
    const factory = SUB_MODULES[path]?.createSystems;
    if (typeof factory !== 'function') continue;
    try {
      for (const system of factory()) systems.push(system);
    } catch (err) {
      console.error(`[ui] sous-module « ${path} » : création des systèmes impossible`, err);
    }
  }
  return systems;
};

export { UiSystem } from './core/system';
export { HOTKEY_SCREENS, SCENARIOS_SECTION, SCENARIO_AREA_RADIUS, UI_DEBUG_SERVICE, UI_LOADING_EVENT } from './core/api';
export type {
  CauseLike, CrowdFamily, Derapage, Map2dLike, MissionLike, MissionResultLike, SavedScenario, ScenarioExtra, ScenarioMeans,
  ScenarioOptions, ScenariosFile, UiDebugApi, UiLoadingEvent,
} from './core/api';
