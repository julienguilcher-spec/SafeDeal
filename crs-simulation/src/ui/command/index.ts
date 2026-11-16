/* =====================================================================================
 * COMMANDEMENT — point d'entrée du module src/ui/command.
 *
 * Branchement (racine de composition), après le socle de l'interface et le module des cartes :
 *     import { createSystems as command } from '@/ui/command';
 *     game.addModule(command);
 *
 * Le système (ordre UI + 10) publie ctx.service<CommandApi>('ui.command') et enregistre auprès de
 * UiKit les écrans 'carte_tactique', 'roue_ordres' et 'radio' ainsi que les éléments de HUD
 * 'command.unit' et 'command.incident' (zone 'top'). Il s'appuie sur le service 'ui.maps' du
 * module des cartes ; s'il manque, il crée son propre moteur de cartes.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { UiKit } from '@/core/extensions';
import { MAPS_SERVICE } from '../maps/api';
import { MapsRuntime } from '../maps/runtime';
import { COMMAND_SERVICE } from './api';
import { CommandCore } from './core';
import { IncidentHud, UnitHud } from './hud';
import { OrderWheelScreen, WHEEL_SCREEN } from './orderWheel';
import { QuickActionsHud } from './quickActions';
import { RADIO_SCREEN, RadioScreen } from './radioScreen';
import { TacticalScreen } from './tacticalScreen';

export type { CommandApi, CommandLevel, CommandScope, IssuedOrder, TacticalOpenData, TacticalTab } from './api';
export { COMMAND_SERVICE } from './api';
export { CommandCore } from './core';
export { TacticalScreen } from './tacticalScreen';

export const COMMAND_SYSTEM_ID = 'ui:command';
export const UNIT_WIDGET_ID = 'command.unit';
export const INCIDENT_WIDGET_ID = 'command.incident';
export const QUICK_WIDGET_ID = 'command.quick';

export class CommandSystem implements GameSystem {
  readonly id = COMMAND_SYSTEM_ID;
  // même ordre que les cartes : ajouté après elles, ce système passe après (ordre d'ajout à égalité)
  readonly order = SystemOrder.UI + 10;
  core: CommandCore | null = null;
  /** Carte tactique actuellement ouverte (null sinon) : pour les tests et le débogage. */
  tactical: TacticalScreen | null = null;
  private ownMaps: MapsRuntime | null = null;
  private kit: UiKit | undefined;
  private ctx: GameContext | null = null;
  private readonly unsub: (() => void)[] = [];
  /** Le bouton tactile « Ordres » est à remontrer ou à masquer (nouvelle incarnation). */
  private ordersDirty = false;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    // le moteur des cartes est publié par le module des cartes (branché avant celui-ci) ; à défaut, on crée le nôtre
    let maps = ctx.service<MapsRuntime>(MAPS_SERVICE);
    if (!maps || typeof maps.use !== 'function') maps = this.ownMaps = new MapsRuntime(ctx);
    this.core = new CommandCore(ctx, maps, undefined);
    ctx.provide(COMMAND_SERVICE, this.core);
  }

  init(ctx: GameContext): void {
    const core = this.core!;
    const kit = (this.kit = ctx.headless ? undefined : ctx.service<UiKit>(EXT.uiKit));
    core.kit = kit;
    this.unsub.push(
      ctx.events.on('player:possessed', () => {
        core.invalidateScope();
        this.ordersDirty = true;
      }),
      ctx.events.on('session:started', () => {
        core.invalidateScope();
        core.issued.length = 0;
        core.orderForce = 4;
        this.ordersDirty = true;
      }),
    );
    if (!kit) {
      if (!ctx.headless) console.warn('[commandement] boîte à outils d’interface absente : ni carte tactique ni roue d’ordres');
      return;
    }
    kit.registerScreen('carte_tactique', (host, data) => {
      const screen = new TacticalScreen(core, host, data);
      this.tactical = screen;
      const dispose = screen.dispose.bind(screen);
      screen.dispose = () => {
        if (this.tactical === screen) this.tactical = null;
        dispose();
      };
      return screen;
    }, { modal: true, pauses: false, hidesHud: true });
    kit.registerScreen(WHEEL_SCREEN, (host) => new OrderWheelScreen(core, host), { modal: true, pauses: false, hidesHud: false });
    kit.registerScreen(RADIO_SCREEN, (host) => new RadioScreen(core, host), { modal: true, pauses: false, hidesHud: false });
    kit.addHudWidget(UNIT_WIDGET_ID, 'top', (host) => new UnitHud(core, host));
    kit.addHudWidget(INCIDENT_WIDGET_ID, 'top', (host) => new IncidentHud(core, host));
    // carte tactique et secours en un clic, à gauche sous la mini-carte
    kit.addHudWidget(QUICK_WIDGET_ID, 'left', (host) => new QuickActionsHud(core, host));
  }

  frame(): void {
    this.ownMaps?.frame();
    if (this.ordersDirty) this.syncOrdersButton();
  }

  /**
   * Écran tactile : le bouton « Ordres » n'est montré qu'à ceux qui commandent une unité (chef de groupe, de
   * section, commandant). Pour un équipier il n'ouvrirait rien : il est masqué. Recalculé à chaque incarnation.
   */
  private syncOrdersButton(): void {
    this.ordersDirty = false;
    const ctx = this.ctx;
    const core = this.core;
    if (!ctx || !core || ctx.player.state.personId === 0) return;
    const touch = ctx.service<{ setButtonVisible(button: 'orders', visible: boolean): void }>('input.touch');
    if (!touch || typeof touch.setButtonVisible !== 'function') return;
    try {
      touch.setButtonVisible('orders', core.scope().level !== 'lecture');
    } catch (err) {
      console.error('[commandement] bouton « Ordres » de l’écran tactile : mise à jour impossible', err);
    }
  }

  reset(): void {
    this.core?.invalidateScope();
  }

  dispose(): void {
    for (let i = 0; i < this.unsub.length; i++) this.unsub[i]!();
    this.unsub.length = 0;
    this.kit?.removeHudWidget(UNIT_WIDGET_ID);
    this.kit?.removeHudWidget(INCIDENT_WIDGET_ID);
    this.kit?.removeHudWidget(QUICK_WIDGET_ID);
    this.ownMaps?.dispose();
    void this.ctx;
  }
}

export const createSystems: ModuleFactory = () => [new CommandSystem()];
