/* =====================================================================================
 * AVANCE RAPIDE — système de simulation (ordre INPUT + 10), sans DOM ni rendu.
 *
 * Le bouton « fast_forward » (touche « . », bouton « Avance » de l'écran tactile) bascule la vitesse de
 * la simulation entre ×1 et ×FAST_FORWARD_SCALE (ctx.clock.timeScale, que la boucle du cœur découpe en
 * pas ≤ 0,05 s). Sert à passer les temps morts d'une mission (rassemblement, attente d'une relève).
 * La bascule est ignorée quand un écran bloquant est ouvert ; la vitesse normale revient à chaque
 * nouvelle session (le cœur remet l'horloge à ×1) et à la fin de la session.
 *
 * Service : ctx.service<TimeWarpApi>('session.timewarp').
 * ===================================================================================== */

import type { GameContext, GameSystem, Unsubscribe } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';

export const TIME_WARP_SERVICE = 'session.timewarp';
export const TIME_WARP_SYSTEM_ID = 'session.timewarp';
/** Vitesse de l'avance rapide. */
export const FAST_FORWARD_SCALE = 4;

export interface TimeWarpApi {
  /** L'avance rapide est-elle enclenchée ? */
  readonly fast: boolean;
  /** Enclenche ou coupe l'avance rapide (même effet que le bouton). */
  set(fast: boolean): void;
}

export class TimeWarpSystem implements GameSystem {
  readonly id = TIME_WARP_SYSTEM_ID;
  readonly order = SystemOrder.INPUT + 10;

  private ctx!: GameContext;
  private fast = false;
  /** Le bouton était tenu au pas précédent (la bascule se fait sur le front, une fois par appui). */
  private held = false;
  private readonly offs: Unsubscribe[] = [];

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const self = this;
    const api: TimeWarpApi = {
      get fast(): boolean {
        return self.fast;
      },
      set: (fast: boolean) => this.set(fast, false),
    };
    ctx.provide<TimeWarpApi>(TIME_WARP_SERVICE, api);
  }

  init(ctx: GameContext): void {
    this.offs.push(ctx.events.on('session:ended', () => this.set(false, false)));
  }

  reset(): void {
    this.fast = false;
    this.held = false;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  update(): void {
    const ctx = this.ctx;
    // un autre module a repris la main sur l'horloge (temps ralenti de la carte tactique, fin de session)
    if (this.fast && ctx.clock.timeScale !== FAST_FORWARD_SCALE && !ctx.ui.modal) this.fast = false;
    const down = !ctx.ui.modal && ctx.input.down('fast_forward');
    if (down && !this.held) this.set(!this.fast, true);
    this.held = down;
  }

  private set(fast: boolean, announce: boolean): void {
    const ctx = this.ctx;
    if (fast === this.fast) return;
    this.fast = fast;
    ctx.clock.timeScale = fast ? FAST_FORWARD_SCALE : 1;
    if (announce) ctx.ui.notify(fast ? `Avance rapide ×${FAST_FORWARD_SCALE}` : 'Vitesse normale', 'info', 2);
  }
}
