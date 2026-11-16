/* =====================================================================================
 * Systèmes du rendu de base.
 *
 *   'render.base'    (ordre VIEW)      crée le renderer dans #game, publie ctx.view et les services
 *                                      étendus ; à chaque image : caméra, ciel, lumière, pluie, effets.
 *   'render.present' (ordre VIEW + 90) appelle renderer.render une fois que tous les systèmes de
 *                                      présentation d'ordre VIEW ont mis leurs objets à jour, et
 *                                      avant l'interface (UI).
 *
 * En mode headless (tests Node) ou si WebGL est indisponible, rien n'est créé : ctx.view reste nul.
 * ===================================================================================== */

import { SystemOrder } from '@/core/contracts';
import type { GameContext, GameSystem } from '@/core/contracts';
import {
  RENDER_BASE_SERVICE, RENDER_CAMERA_SERVICE, RENDER_LIGHTS_SERVICE, RENDER_UNIFORMS_SERVICE,
} from './api';
import type { RenderBaseApi, RenderCameraApi, RenderLightsApi, RenderUniformsApi } from './api';
import { RenderView } from './view';

/** Le rendu passe après tous les systèmes d'ordre VIEW (personnages, véhicules, effets) et avant l'interface. */
export const PRESENT_ORDER = SystemOrder.VIEW + 90;

export class RenderBaseSystem implements GameSystem {
  readonly id = 'render.base';
  readonly order = SystemOrder.VIEW;
  view: RenderView | null = null;
  private ctx: GameContext | null = null;
  private errors = 0;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    if (ctx.headless || typeof document === 'undefined') return;
    try {
      const container = document.getElementById('game') ?? this.createContainer();
      const view = new RenderView(ctx, container);
      this.view = view;
      ctx.view = view;
      ctx.provide<RenderLightsApi>(RENDER_LIGHTS_SERVICE, view.lights);
      ctx.provide<RenderUniformsApi>(RENDER_UNIFORMS_SERVICE, view.shared);
      ctx.provide<RenderCameraApi>(RENDER_CAMERA_SERVICE, view.rig);
      ctx.provide<RenderBaseApi>(RENDER_BASE_SERVICE, view);
    } catch (err) {
      this.view = null;
      console.error('[render] création du rendu 3D impossible (WebGL indisponible ?)', err);
    }
  }

  /** Page sans conteneur #game (banc d'essai minimal) : on en crée un qui remplit la fenêtre. */
  private createContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'game';
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.overflow = 'hidden';
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  frame(dt: number): void {
    const view = this.view;
    if (!view) return;
    try {
      view.prepare(dt);
    } catch (err) {
      if (this.errors++ < 5) console.error('[render] erreur pendant la préparation de l’image', err);
    }
  }

  reset(): void {
    this.view?.reset();
  }

  dispose(): void {
    const view = this.view;
    if (!view) return;
    this.view = null;
    if (this.ctx && this.ctx.view === view) this.ctx.view = null;
    view.dispose();
  }
}

export class RenderPresentSystem implements GameSystem {
  readonly id = 'render.present';
  readonly order = PRESENT_ORDER;
  private errors = 0;

  constructor(private readonly base: RenderBaseSystem) {}

  frame(dt: number): void {
    const view = this.base.view;
    if (!view) return;
    try {
      view.present(dt);
    } catch (err) {
      if (this.errors++ < 5) console.error('[render] erreur pendant le rendu', err);
    }
  }
}
