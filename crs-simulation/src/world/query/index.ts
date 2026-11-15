/* =====================================================================================
 * MONDE (simulation) — point d'entrée du module src/world/query.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as worldQuery } from '@/world/query';
 *   game.addModule(worldQuery);
 * ou, avec des options (tests, bancs d'essai) :
 *   game.addModule(() => createWorldQuerySystems({ source: 'test' }));
 *
 * Le système publie :
 *   ctx.world                      l'implémentation complète de WorldQuery ;
 *   ctx.service('world.data')      les données de carte décodées, pour le rendu (WorldData) ;
 *   ctx.service('world.query')     le même objet que ctx.world, typé WorldQueryExt (méthodes hors contrat).
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { WORLD_DATA_SERVICE, WORLD_QUERY_SERVICE } from './api';
import type { WorldQueryOptions } from './api';
import { WorldQueryImpl } from './world';

export type {
  ColliderLike, ColliderSite, GetColliders, MapSource, ObstacleSegmentView, WorldData, WorldQueryExt, WorldQueryOptions,
  WorldQueryStats, WorldSourceEvent,
} from './api';
export { SURFACE_CODES, WORLD_DATA_SERVICE, WORLD_QUERY_SERVICE, WORLD_SOURCE_EVENT } from './api';
export { FetchMapSource, MemoryMapSource, createTestDistrictSource } from './sources';
export { WorldQueryImpl } from './world';

/** Identifiant du système. */
export const WORLD_QUERY_SYSTEM_ID = 'world:query';

/** Crée le monde seul (sans système) : pour les bancs d'essai et les tests qui n'ont pas besoin du moteur. */
export function createWorldQuery(options: WorldQueryOptions = {}): WorldQueryImpl {
  return new WorldQueryImpl(options);
}

/** Systèmes du module, avec options. */
export function createWorldQuerySystems(options: WorldQueryOptions = {}): GameSystem[] {
  const world = new WorldQueryImpl(options);
  const system: GameSystem = {
    id: WORLD_QUERY_SYSTEM_ID,
    // Avant tout le monde : les autres modules lisent ctx.world dès leur propre provide()/init().
    order: SystemOrder.INPUT - 50,
    provide(ctx: GameContext): void {
      world.attach(ctx);
      ctx.world = world;
      ctx.provide(WORLD_DATA_SERVICE, world.data);
      ctx.provide(WORLD_QUERY_SERVICE, world);
    },
    init(): Promise<void> {
      return world.boot();
    },
    update(dt: number): void {
      world.update(dt);
    },
    reset(): void {
      world.onSessionReset();
    },
    dispose(): void {
      world.dispose();
    },
  };
  return [system];
}

/** Fabrique standard du module (docs/ARCHITECTURE.md §2). */
export const createSystems: ModuleFactory = () => createWorldQuerySystems();
