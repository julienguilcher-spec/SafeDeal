/* Module « rendu des personnages » : système de présentation (ordre VIEW) qui dessine toutes les
 * personnes de ctx.people.list, et registre extensible des modèles d'objets tenus en main.
 *
 * Branchement : ajouter `createSystems` à la racine de composition. Le service étendu
 * ctx.service<PeopleRenderApi>('peopleRender') est publié dès provide(). */

import { SystemOrder } from '@/core/contracts';
import type { EntityId, GameContext, GameSystem, ModuleFactory, Vec3 } from '@/core/contracts';
import type { HeldBone, HeldModelFactory, HeldModelOptions, PeopleRenderApi, PeopleRenderStats } from './api';
import { aliasHeldModel, heldModelKeys, registerHeldModel } from './held';
import { ensureModels } from './models';
import { PeopleRenderer } from './renderer';

export type {
  HeldBone, HeldBuilder, HeldModelFactory, HeldModelOptions, HoldStyle, PeopleRenderApi, PeopleRenderStats,
} from './api';
export { registerHeldModel, aliasHeldModel, heldModelKeys } from './held';
export { PeopleRenderer } from './renderer';

const EMPTY_STATS: PeopleRenderStats = { near: 0, mid: 0, far: 0, items: 0, posed: 0, cpuMs: 0, cpuMsAvg: 0, drawCalls: 0 };

class PeopleRenderSystem implements GameSystem, PeopleRenderApi {
  readonly id = 'render.people';
  readonly order = SystemOrder.VIEW;
  private ctx: GameContext | null = null;
  private renderer: PeopleRenderer | null = null;
  private failed = false;
  private errors = 0;

  get stats(): PeopleRenderStats {
    return this.renderer ? this.renderer.stats : EMPTY_STATS;
  }

  /** Accès au moteur de rendu (bancs d'essai). */
  get engine(): PeopleRenderer | null {
    return this.renderer;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ensureModels();
    ctx.provide<PeopleRenderApi>('peopleRender', this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.ensureRenderer();
  }

  private ensureRenderer(): void {
    const ctx = this.ctx;
    if (this.renderer || this.failed || !ctx || ctx.headless || !ctx.view) return;
    try {
      this.renderer = new PeopleRenderer(ctx, ctx.view);
    } catch (err) {
      this.failed = true;
      console.error('[people] initialisation du rendu des personnages impossible :', err);
    }
  }

  frame(dt: number): void {
    if (!this.renderer) this.ensureRenderer();
    if (!this.renderer) return;
    try {
      this.renderer.frame(dt);
    } catch (err) {
      if (this.errors++ < 5) console.error('[people] erreur pendant le rendu des personnages :', err);
    }
  }

  reset(): void {
    this.renderer?.reset();
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  registerHeldModel(key: string, factory: HeldModelFactory, options?: HeldModelOptions): void {
    registerHeldModel(key, factory, options);
  }

  aliasHeldModel(alias: string, key: string): void {
    aliasHeldModel(alias, key);
  }

  heldModelKeys(): string[] {
    ensureModels();
    return heldModelKeys();
  }

  invalidate(personId?: EntityId): void {
    this.renderer?.invalidate(personId);
  }

  bonePosition(personId: EntityId, bone: HeldBone, out: Vec3): boolean {
    return this.renderer ? this.renderer.bonePosition(personId, bone, out) : false;
  }
}

export const createSystems: ModuleFactory = () => [new PeopleRenderSystem()];
