/* Module « rendu du mobilier urbain, des vitrines et des barricades » : système de présentation
 * (ordre VIEW) qui dessine ctx.props.list et ctx.props.shops — modèles procéduraux du mobilier
 * parisien dans tous leurs états, devantures des commerces, barricades, candélabres et feux la nuit.
 *
 * Branchement : ajouter `createSystems` à la racine de composition. Le service
 * ctx.service<PropsRenderApi>('propsRender') est publié dès provide(). Le module ne dépend que du
 * contrat ; sans ctx.view (mode headless, ou rendu de base pas encore branché) il ne fait rien. */

import { SystemOrder } from '@/core/contracts';
import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { PROPS_RENDER_KEY } from './api';
import type { PropsRenderApi, PropsRenderStats } from './api';
import { PropsRenderer } from './renderer';

export type { PropsRenderApi, PropsRenderStats } from './api';
export { PROPS_EXT_KEY, PROPS_RENDER_KEY, RENDER_LIGHTS_KEY, RENDER_UNIFORMS_KEY } from './api';
export { PropsRenderer } from './renderer';
export { MODEL_KEYS, modelFor, kindInfo } from './mapping';

const EMPTY_STATS: PropsRenderStats = {
  props: 0, shops: 0, chunks: 0, builtChunks: 0, dynamic: 0, halos: 0, lights: 0, drawCalls: 0, shadowCalls: 0, triangles: 0,
  cpuMs: 0, cpuMsAvg: 0, cpuMsMax: 0, rebuilds: 0, rewrites: 0, rebuildMs: 0, models: 0, signs: 0, atlasUploads: 0,
};

class PropsRenderSystem implements GameSystem, PropsRenderApi {
  readonly id = 'render.props';
  /** Après le rendu de base (même ordre, ajouté ensuite) : ses uniformes de l'image sont déjà à jour. */
  readonly order = SystemOrder.VIEW;
  private ctx: GameContext | null = null;
  private renderer: PropsRenderer | null = null;
  private failed = false;
  private errors = 0;
  private mode: 'lointain' | 'masque' = 'lointain';

  get stats(): PropsRenderStats {
    return this.renderer ? this.renderer.stats : EMPTY_STATS;
  }

  /** Accès au moteur (bancs d'essai). */
  get engine(): PropsRenderer | null {
    return this.renderer;
  }

  get dormantMode(): 'lointain' | 'masque' {
    return this.mode;
  }

  set dormantMode(value: 'lointain' | 'masque') {
    if (value === this.mode) return;
    this.mode = value;
    if (this.renderer) {
      this.renderer.dormantMode = value;
      this.renderer.invalidate();
    }
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<PropsRenderApi>(PROPS_RENDER_KEY, this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.ensureRenderer();
  }

  /** Le rendu de base peut être branché après ce module : le moteur est créé dès que ctx.view existe. */
  private ensureRenderer(): void {
    const ctx = this.ctx;
    if (this.renderer || this.failed || !ctx || ctx.headless || !ctx.view) return;
    try {
      this.renderer = new PropsRenderer(ctx, ctx.view);
      this.renderer.dormantMode = this.mode;
    } catch (err) {
      this.failed = true;
      console.error('[props] initialisation du rendu du décor impossible :', err);
    }
  }

  frame(dt: number): void {
    if (!this.renderer) this.ensureRenderer();
    if (!this.renderer) return;
    try {
      this.renderer.frame(dt);
    } catch (err) {
      if (this.errors++ < 5) console.error('[props] erreur pendant le rendu du décor :', err);
    }
  }

  invalidate(): void {
    this.renderer?.invalidate();
  }

  resetPeak(): void {
    if (this.renderer) this.renderer.stats.cpuMsMax = 0;
  }

  reset(): void {
    this.errors = 0;
    try {
      this.renderer?.reset();
    } catch (err) {
      console.error('[props] remise à zéro du rendu du décor impossible :', err);
    }
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }
}

export const createSystems: ModuleFactory = () => [new PropsRenderSystem()];
