/* =====================================================================================
 * CARTES — point d'entrée du module src/ui/maps.
 *
 * Branchement (racine de composition), après le socle de l'interface (qui fournit EXT.uiKit) :
 *     import { createSystems as maps } from '@/ui/maps';
 *     game.addModule(maps);
 *
 * Le système (ordre UI + 10) publie :
 *     ctx.service<MapsApi>('ui.maps')        repère GPS, cible suivie, itinéraire (api.ts) ;
 *     ctx.service<Map2dService>('world.map2d')  SEULEMENT si aucun module ne le fournit déjà : le fond
 *                                            de plan de repli (draw + render), dessiné d'après ctx.world.
 * Il enregistre auprès de UiKit l'écran 'carte' (plan de Paris) et l'élément de HUD 'maps.minimap'
 * (zone 'top-left'). Sans UiKit (module d'interface absent), il ne fait rien d'autre que publier.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { UiKit } from '@/core/extensions';
import { MAP2D_SERVICE, MAPS_SERVICE } from './api';
import { Minimap } from './minimap';
import { PlanScreen } from './planScreen';
import { MapsRuntime } from './runtime';

export type { GpsTarget, Map2dOptions, Map2dService, MapVisibility, MapsApi, PlanOpenData } from './api';
export { MAP2D_SERVICE, MAPS_SERVICE } from './api';
export { MapsRuntime } from './runtime';
export { PlanScreen } from './planScreen';

export const MAPS_SYSTEM_ID = 'ui:maps';
export const MINIMAP_WIDGET_ID = 'maps.minimap';

export class MapsSystem implements GameSystem {
  readonly id = MAPS_SYSTEM_ID;
  readonly order = SystemOrder.UI + 10;
  runtime: MapsRuntime | null = null;
  /** Mini-carte en service (null tant que le HUD ne l'a pas créée). */
  minimap: Minimap | null = null;
  /** Plan actuellement ouvert (null sinon) : pour les tests et le débogage. */
  plan: PlanScreen | null = null;
  private kit: UiKit | undefined;

  provide(ctx: GameContext): void {
    this.runtime = new MapsRuntime(ctx);
    ctx.provide(MAPS_SERVICE, this.runtime);
    // Le fond de plan de repli sert aussi aux autres écrans (mini-plan de la page d'accueil)
    // tant qu'aucun module du monde ne publie le sien.
    if (!ctx.headless && ctx.service(MAP2D_SERVICE) === undefined) ctx.provide(MAP2D_SERVICE, this.runtime.fallback);
  }

  init(ctx: GameContext): void {
    if (ctx.headless) return;
    const runtime = this.runtime!;
    const kit = (this.kit = ctx.service<UiKit>(EXT.uiKit));
    if (!kit) {
      console.warn('[cartes] boîte à outils d’interface absente : ni mini-carte ni plan');
      return;
    }
    kit.registerScreen('carte', (host, data) => {
      const screen = new PlanScreen(ctx, kit, runtime, host, data);
      this.plan = screen;
      const dispose = screen.dispose.bind(screen);
      screen.dispose = () => {
        if (this.plan === screen) this.plan = null;
        dispose();
      };
      return screen;
    }, { modal: true, pauses: true, hidesHud: true });
    kit.addHudWidget(MINIMAP_WIDGET_ID, 'top-left', (host) => {
      const m = new Minimap(ctx, runtime, host);
      this.minimap = m;
      return m;
    });
  }

  frame(): void {
    this.runtime?.frame();
  }

  reset(): void {
    this.runtime?.scene.invalidate();
    this.runtime?.gps.reset();
  }

  dispose(): void {
    this.kit?.removeHudWidget(MINIMAP_WIDGET_ID);
    this.runtime?.dispose();
  }
}

export const createSystems: ModuleFactory = () => [new MapsSystem()];
