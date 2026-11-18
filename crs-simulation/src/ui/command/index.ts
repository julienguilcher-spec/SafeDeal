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
import { barragesApi, kettleBanner } from '../maps/barrages';
import { MapsRuntime } from '../maps/runtime';
import { COMMAND_SERVICE } from './api';
import { CommandCore } from './core';
import { IncidentHud, UnitHud } from './hud';
import { OrderWheelScreen, WHEEL_SCREEN } from './orderWheel';
import { QuickActionsHud, quickBanner } from './quickActions';
import { RADIO_SCREEN, RadioScreen } from './radioScreen';
import { installTacticalParts } from './tacticalParts';
import { TacticalScreen } from './tacticalScreen';
import { installCommissariats } from './commissariatsLink';
import { COMMISSARIATS_SERVICE } from '@/gameplay/commissariats/api';

export type { CommandApi, CommandLevel, CommandScope, IssuedOrder, TacticalOpenData, TacticalTab } from './api';
export { COMMAND_SERVICE } from './api';
export { CommandCore } from './core';
export { TacticalScreen } from './tacticalScreen';
export { installTacticalParts } from './tacticalParts';

export const COMMAND_SYSTEM_ID = 'ui:command';

/** Charge utile des événements 'police:order_refused' et 'police:order_done'. */
interface OrderProblem { squadId: number; type: string; ok?: boolean; reason?: string }
/** Charge utile de l'événement 'police:kettle' (service 'police.barrages'). */
interface KettleEvent { id: number; closed: boolean; inside: number; x: number; z: number }
export const UNIT_WIDGET_ID = 'command.unit';
export const INCIDENT_WIDGET_ID = 'command.incident';
export const QUICK_WIDGET_ID = 'command.quick';
/** Bandeaux du téléphone (proposition de l'adjoint, véhicule qui bloque), en haut au centre. */
export const QUICK_BANNER_WIDGET_ID = 'command.banner';

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
    // module des commissariats branché : « Rentrer au commissariat », fiches des postes, « Plus… › Commissariats »
    if (ctx.service(COMMISSARIATS_SERVICE)) installCommissariats();
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
        // ordres repris au débarquement : propres à la session (les identifiants d'unités sont réattribués)
        core.afterConvoy.clear();
        core.orderForce = 4;
        core.nasse = null;
        core.legalChain.reset();
        this.ordersDirty = true;
      }),
      // nasse fermée (service 'police.barrages') : le commandement en est averti même carte fermée
      ctx.events.onAny('police:kettle', (e) => this.kettleClosed(e as KettleEvent)),
      // un ordre du joueur refusé ou abandonné par l'unité : le motif s'affiche (sinon il croit qu'on l'ignore)
      ctx.events.onAny('police:order_refused', (e) => this.orderProblem(e as OrderProblem, true)),
      ctx.events.onAny('police:order_done', (e) => this.orderProblem(e as OrderProblem, false)),
      // mouvement motorisé : au débarquement, l'unité exécute l'ordre donné
      ctx.events.onAny('command:convoy', (e) => {
        const c = e as { squadId: number; stage: string };
        if (c && typeof c.squadId === 'number') core.onConvoyStage(c.squadId, c.stage);
      }),
    );
    if (!kit) {
      if (!ctx.headless) console.warn('[commandement] boîte à outils d’interface absente : ni carte tactique ni roue d’ordres');
      return;
    }
    // la fiche, les panneaux de côté, Qui, l'aperçu et l'envoi branchés dans la carte de commandement
    installTacticalParts();
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
    let quick: QuickActionsHud | null = null;
    kit.addHudWidget(QUICK_WIDGET_ID, 'left', (host) => (quick = new QuickActionsHud(core, host)));
    kit.addHudWidget(QUICK_BANNER_WIDGET_ID, 'top', (host) => quickBanner(quick, host));
  }

  /** La chaîne légale (sommations, autorisation, ordre) avance avec la simulation, carte fermée comprise. */
  update(): void {
    const ctx = this.ctx;
    if (ctx && this.core) this.core.legalChain.tick(ctx.clock.now);
  }

  frame(): void {
    this.ownMaps?.frame();
    if (this.ordersDirty) this.syncOrdersButton();
  }

  /**
   * Écran tactile : le bouton « Ordres » est montré à tout policier — roue complète pour ceux qui commandent une unité,
   * roue des deux ordres « me suivre » (à pied, en colonne) pour les autres. Masqué hors police (il n'ouvrirait rien).
   * Recalculé à chaque incarnation.
   */
  private syncOrdersButton(): void {
    this.ordersDirty = false;
    const ctx = this.ctx;
    const core = this.core;
    if (!ctx || !core || ctx.player.state.personId === 0) return;
    const touch = ctx.service<{ setButtonVisible(button: 'orders', visible: boolean): void }>('input.touch');
    if (!touch || typeof touch.setButtonVisible !== 'function') return;
    try {
      touch.setButtonVisible('orders', ordersButtonVisible(core));
    } catch (err) {
      console.error('[commandement] bouton « Ordres » de l’écran tactile : mise à jour impossible', err);
    }
  }

  /** Nasse fermée : bandeau « NASSE FERMÉE — lieu — environ N personnes » pour ceux qui voient le dispositif. */
  private kettleClosed(e: KettleEvent): void {
    const ctx = this.ctx;
    const core = this.core;
    if (!ctx || !core || !e || !e.closed || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return;
    if (!core.maps.scene.vis.police) return;
    const api = barragesApi((name) => ctx.service(name));
    const k = api?.kettles.find((q) => q.id === e.id);
    let place = k?.place ?? '';
    if (place === '') {
      const s = ctx.world.sectorName(e.x, e.z);
      place = s && s !== 'secteur inconnu' ? s : '';
    }
    const filter = core.scope().level !== 'lecture' ? ' Carte de commandement : F pour ouvrir une sortie filtrée.' : '';
    ctx.ui.notify(`${kettleBanner({ place, inside: e.inside })}.${filter}`, 'warn', 7);
  }

  private orderProblem(e: OrderProblem, refused: boolean): void {
    const ctx = this.ctx;
    const core = this.core;
    if (!ctx || !core || !e || (!refused && e.ok !== false) || !e.reason) return;
    const s = ctx.squads.get(e.squadId);
    // seulement les unités sous les ordres du joueur (ou la sienne, qu'il appelle à le suivre), pour un ordre qu'il a donné
    if (!s || !(core.canCommand(s.id) || core.followUnit()?.id === s.id) || s.order.issuedBy !== ctx.player.state.personId) return;
    ctx.ui.notify(`${s.name} — ${refused ? 'ordre refusé' : 'ordre abandonné'} : ${e.reason}`, 'warn', 6);
  }

  reset(): void {
    this.core?.invalidateScope();
  }

  dispose(): void {
    for (let i = 0; i < this.unsub.length; i++) this.unsub[i]!();
    this.unsub.length = 0;
    this.kit?.removeHudWidget(UNIT_WIDGET_ID);
    this.kit?.removeHudWidget(INCIDENT_WIDGET_ID);
    this.kit?.removeHudWidget(QUICK_BANNER_WIDGET_ID);
    this.kit?.removeHudWidget(QUICK_WIDGET_ID);
    this.ownMaps?.dispose();
    void this.ctx;
  }
}

/** Bouton tactile « Ordres » : ceux qui commandent, et tout policier pour les ordres « me suivre » à son unité. */
export function ordersButtonVisible(core: CommandCore): boolean {
  return core.scope().level !== 'lecture' || core.followUnit() !== null;
}

export const createSystems: ModuleFactory = () => [new CommandSystem()];
