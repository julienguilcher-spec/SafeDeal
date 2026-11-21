/* =====================================================================================
 * PATROUILLE (interface) — sous-module agrégé par src/ui/index.ts.
 *
 * Pendant une vacation (mode Patrouille : session portant extra.vacation), le répartiteur de CENTRAL (service
 * 'patrol.mode', src/gameplay/patrols/mode.ts) annonce des appels. Ce module les montre au joueur :
 *   - élément de HUD 'patrol.dispatch' (zone de gauche) : carte d'appel « hud-appel » (Prendre l'appel / Décliner,
 *     puis Renforts / Fin d'intervention), pastille « Appel en cours » au bout de 20 s, touches Y et Maj + Y ;
 *   - la section « Appel en cours » de l'écran radio (chemin manette) est construite par src/ui/command/radioScreen.ts
 *     avec le même panneau (CallPanel, dispatch.ts) ;
 *   - le compte rendu de vacation est ajouté à l'écran « debrief » (src/ui/screens/debrief.ts, format.ts).
 * Hors vacation, l'élément de HUD reste masqué et ne fait rien. Sans DOM (tests Node), rien n'est enregistré.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { UiKit } from '@/core/extensions';
import { PatrolDispatchHud } from './dispatch';

export const PATROL_UI_SYSTEM_ID = 'ui:patrol';
export const PATROL_WIDGET_ID = 'patrol.dispatch';

export class PatrolUiSystem implements GameSystem {
  readonly id = PATROL_UI_SYSTEM_ID;
  // après le commandement (UI + 10) : la carte d'appel s'ajoute à la zone de gauche, devant les actions rapides
  readonly order = SystemOrder.UI + 11;
  private kit: UiKit | undefined;

  init(ctx: GameContext): void {
    if (ctx.headless || typeof document === 'undefined') return;
    const kit = (this.kit = ctx.service<UiKit>(EXT.uiKit));
    if (!kit) {
      console.warn('[patrouille] boîte à outils d’interface absente : pas de carte d’appel');
      return;
    }
    kit.addHudWidget(PATROL_WIDGET_ID, 'left', (host) => new PatrolDispatchHud(ctx, host));
  }

  dispose(): void {
    this.kit?.removeHudWidget(PATROL_WIDGET_ID);
  }
}

export const createSystems: ModuleFactory = () => [new PatrolUiSystem()];

export { CALL_KEY, CallPanel, PatrolDispatchHud, callKeyLabel, patrolMode } from './dispatch';
export * from './format';
