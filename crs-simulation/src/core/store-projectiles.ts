/* =====================================================================================
 * Magasin des projectiles (ProjectileApi) — données seulement : la balistique, les mèches
 * et les impacts sont l'affaire du module des objets.
 * Événements : projectile:spawned à la création ; projectile:removed au retrait (remove et clear) —
 * le projectile est alors sorti de `list`, mais get(id) le renvoie encore le temps de l'événement.
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
    const list = this.list;
    const idx = list.indexOf(p);
    if (idx < 0) return; // retrait déjà en cours (appel ré-entrant depuis projectile:removed)
    list[idx] = list[list.length - 1]!;
    list.pop();
    try {
      this.ctx.events.emit('projectile:removed', { id });
    } finally {
      this.byId.delete(id);
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
        // comparaison écrite ainsi : un projectile en position invalide (NaN) n'est jamais retenu
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  }

  clear(): void {
    if (this.list.length === 0) return;
    const all = this.list.slice();
    this.list.length = 0;
    try {
      for (let i = 0; i < all.length; i++) this.ctx.events.emit('projectile:removed', { id: all[i]!.id });
    } finally {
      for (let i = 0; i < all.length; i++) this.byId.delete(all[i]!.id);
    }
  }
}

export function createProjectileStore(ctx: GameContext): ProjectileApi {
  return new ProjectileStoreImpl(ctx);
}
