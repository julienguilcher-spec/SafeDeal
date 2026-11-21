/* =====================================================================================
 * SYSTÈME DU MATÉRIEL — assemble l'inventaire, les usages et les projectiles, publie ctx.actions,
 * ctx.projectiles et le service étendu « items », et fait vivre le tout à chaque pas.
 *
 * Ordre d'un pas : délais des objets → animations d'usage → coups de mêlée arrivés à l'impact →
 * jets continus → masques et lampes → projectiles (vol, chocs, retards, émissions).
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, ItemId, Person, ProjectileKind, Unsubscribe, UseOptions, UseResult, Vec3,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { Actions } from './actions';
import { createActions } from './actions';
import { predictImpact, sampleTrajectory } from './aim';
import type { ItemSpec, ItemsApi, ItemsTuning, LauncherRange, ProjectileSpec } from './api';
import { ITEMS_SERVICE } from './api';
import { itemDef } from './defs';
import { activeItem, selectById } from './inventory';
import { registerInteractions, returnByHand } from './interact';
import { projectileSpec } from './projectile-defs';
import { ProjectileEffects } from './projectile-effects';
import { ProjectileSystem } from './projectiles';
import { DEFAULT_TUNING, ItemsCore, LAUNCHER_RANGES, activeId, useFail } from './shared';
import { itemSpec } from './specs';
import { updateStrikes } from './use-melee';
import { lampOn, updateLamps, updateMasks } from './use-misc';
import { updateSprays } from './use-spray';

export class ItemsSystem implements GameSystem {
  readonly id = 'items';
  readonly order = SystemOrder.ACTIONS;

  private readonly core = new ItemsCore();
  private projectiles!: ProjectileSystem;
  private actions!: Actions;
  private offs: Unsubscribe[] = [];

  provide(ctx: GameContext): void {
    const core = this.core;
    core.attach(ctx);
    this.projectiles = new ProjectileSystem(core);
    this.projectiles.effects = new ProjectileEffects(core, this.projectiles);
    this.actions = createActions(core, this.projectiles);
    ctx.actions = this.actions;
    ctx.projectiles = this.projectiles;
    ctx.provide<ItemsApi>(ITEMS_SERVICE, this.createApi());
  }

  init(ctx: GameContext): void {
    const core = this.core;
    registerInteractions(core, this.projectiles);
    this.offs.push(ctx.events.on('person:removed', (e) => {
      core.launcherMode.delete(e.id);
      core.maskBase.delete(e.id);
      core.dropAnim(e.id);
    }));
    this.offs.push(ctx.events.on('person:down', (e) => {
      // une personne mise à terre baisse son bouclier, son parapluie, son arme
      const p = ctx.people.get(e.id);
      if (p) {
        p.alt = false;
        core.dropAnim(p.id);
      }
    }));
  }

  update(dt: number): void {
    const core = this.core;
    core.tickCooldowns(dt);
    this.updateAnims(dt);
    updateStrikes(core, dt);
    updateSprays(core, this.projectiles, dt);
    updateMasks(core, dt);
    updateLamps(core, dt);
    this.projectiles.update(dt);
  }

  reset(): void {
    this.core.reset();
    this.projectiles.clear();
    // les réglages reviennent à leurs valeurs de référence à chaque session
    Object.assign(this.core.tuning, DEFAULT_TUNING);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** Tient à jour le temps des animations d'usage, puis rend la pose de repos de l'objet en main. */
  private updateAnims(dt: number): void {
    const core = this.core;
    const list = core.anims;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i]!;
      const p = core.ctx.people.get(a.personId);
      // un autre système a changé la pose : l'animation ne nous appartient plus
      if (!p || p.upper !== a.anim) {
        list[i] = list[list.length - 1]!;
        list.pop();
        continue;
      }
      a.elapsed += dt;
      p.upperT = a.elapsed;
      if (a.elapsed >= a.duration) {
        list[i] = list[list.length - 1]!;
        list.pop();
        const stack = activeItem(p);
        const def = stack ? itemDef(stack.id) : undefined;
        const spec = stack ? itemSpec(stack.id) : undefined;
        p.upper = def ? (p.alt && spec && spec.altAnim ? spec.altAnim : def.idleAnim) : 'none';
        p.upperT = 0;
      }
    }
  }

  private createApi(): ItemsApi {
    const core = this.core;
    const projectiles = this.projectiles;
    const actions = this.actions;
    const scratch: Person[] = [];
    return {
      get tuning(): ItemsTuning {
        return core.tuning;
      },
      spec(id: ItemId): Readonly<ItemSpec> | undefined {
        return itemSpec(id);
      },
      projectileSpec(kind: ProjectileKind): Readonly<ProjectileSpec> {
        return projectileSpec(kind);
      },
      useItem(p: Person, id: ItemId, opts?: UseOptions): UseResult {
        const inv = p.inventory;
        let slot = -1;
        for (let i = 0; i < inv.length; i++) {
          if (inv[i]!.id === id) {
            slot = i;
            break;
          }
        }
        if (slot < 0) return useFail('no_item');
        const spec = itemSpec(id);
        // lampe, masque, radio, télécommande : utilisables sans lâcher ce qu'on tient
        const quick = !!spec && (spec.use === 'lamp' || spec.use === 'mask' || spec.use === 'radio' || spec.use === 'drone');
        if (!quick && p.active !== slot) selectById(core, p, id);
        return actions.useSlot(p, quick ? slot : p.active, opts);
      },
      launcherRange(p: Person): LauncherRange {
        return LAUNCHER_RANGES[core.launcherIndex(p)]!;
      },
      setLauncherRange(p: Person, range: LauncherRange): void {
        const i = LAUNCHER_RANGES.indexOf(range);
        if (i >= 0) core.setLauncherIndex(p, i);
      },
      shieldRaised(p: Person): boolean {
        const s = activeItem(p);
        return !!s && s.id === 'bouclier' && p.alt && s.state > 0;
      },
      umbrellaOpen(p: Person): boolean {
        const s = activeItem(p);
        return !!s && s.id === 'parapluie' && p.alt && s.state > 0;
      },
      lampOn,
      maskOn(p: Person): boolean {
        return p.look.gasMask;
      },
      concealedAt(x: number, z: number): boolean {
        // un parapluie ouvert masque son porteur et ses voisins immédiats
        const n = core.ctx.people.queryRadius(x, z, 1.2, scratch);
        for (let i = 0; i < n; i++) {
          const q = scratch[i]!;
          if (q.alt && activeId(q) === 'parapluie') return true;
        }
        return false;
      },
      returnProjectile(p: Person, projectileId: EntityId, power?: number): boolean {
        const proj = projectiles.get(projectileId);
        return proj ? returnByHand(core, projectiles, p, proj, power) : false;
      },
      predictImpact(p: Person, power: number, out: Vec3): boolean {
        return predictImpact(core, p, power, out);
      },
      sampleTrajectory(p: Person, power: number, out: number[], maxPoints?: number): number {
        return sampleTrajectory(core, p, power, out, maxPoints);
      },
    };
  }
}
