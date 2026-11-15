/* =====================================================================================
 * Magasin des projectiles (ProjectileApi) — données seulement : la balistique, les mèches
 * et les impacts sont l'affaire du module des objets. Émet projectile:spawned.
 * ===================================================================================== */

import type { EntityId, GameContext, Projectile, ProjectileApi, ProjectileKind } from './contracts';

class ProjectileStoreImpl implements ProjectileApi {
  readonly list: Projectile[] = [];
  private readonly byId = new Map<EntityId, Projectile>();

  constructor(private readonly ctx: GameContext) {}

  get(id: EntityId): Projectile | undefined {
    return this.byId.get(id);
  }

  spawn(
    kind: ProjectileKind, ownerId: EntityId,
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
  ): Projectile {
    const p: Projectile = {
      id: this.ctx.newId(),
      kind,
      ownerId,
      x, y, z,
      vx, vy, vz,
      spin: 0,
      age: 0,
      // pas de mèche tant que le module des objets n'en fixe pas une
      fuse: Infinity,
      resting: false,
      emitting: false,
      pickable: false,
      data: null,
    };
    this.list.push(p);
    this.byId.set(p.id, p);
    this.ctx.events.emit('projectile:spawned', { id: p.id, kind, ownerId });
    return p;
  }

  remove(id: EntityId): void {
    const p = this.byId.get(id);
    if (!p) return;
    this.byId.delete(id);
    const list = this.list;
    const idx = list.indexOf(p);
    if (idx >= 0) {
      list[idx] = list[list.length - 1]!;
      list.pop();
    }
  }

  nearestPickable(x: number, z: number, r: number): Projectile | null {
    let best: Projectile | null = null;
    let bestD2 = r * r;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (!p.pickable) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  }

  clear(): void {
    this.list.length = 0;
    this.byId.clear();
  }
}

export function createProjectileStore(ctx: GameContext): ProjectileApi {
  return new ProjectileStoreImpl(ctx);
}
