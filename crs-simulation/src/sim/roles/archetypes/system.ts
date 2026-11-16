/* =====================================================================================
 * SYSTÈME DES ARCHÉTYPES — publie ctx.archetypes (spawn / equip) et les services étendus
 * « roles.archetypes », « roles.causes » et « roles.spawn ».
 *
 * Aucune mise à jour par pas de simulation : tout le travail se fait à la création d'une personne
 * (spawn.ts) et à chaque changement de poste, de profil ou de tenue (equip.ts).
 * ===================================================================================== */

import type { GameContext, GameSystem, Unsubscribe } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { ROLES_ARCHETYPES, ROLES_CAUSES, ROLES_SPAWN } from './api';
import type { ArchetypeExtApi, CausesApi, SpawnHelperApi } from './api';
import { CAUSES } from './causes';
import { ArchetypeCore } from './core';
import { createApi, createHelper } from './services';

export class ArchetypeSystem implements GameSystem {
  readonly id = 'roles.archetypes';
  readonly order = SystemOrder.CONTROL - 50;

  private readonly core = new ArchetypeCore();
  private offs: Unsubscribe[] = [];

  provide(ctx: GameContext): void {
    const core = this.core;
    core.attach(ctx);
    const api = createApi(core);
    ctx.archetypes = api;
    ctx.provide<ArchetypeExtApi>(ROLES_ARCHETYPES, api);
    ctx.provide<CausesApi>(ROLES_CAUSES, CAUSES);
    ctx.provide<SpawnHelperApi>(ROLES_SPAWN, createHelper(core));
  }

  init(ctx: GameContext): void {
    const identities = this.core.identities;
    this.offs.push(ctx.events.on('person:removed', (e) => {
      identities.delete(e.id);
    }));
  }

  /** Nouvelle session : générateurs re-dérivés de la graine, cause et composition du jour relues. */
  reset(): void {
    this.core.reset();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.core.identities.clear();
  }
}
