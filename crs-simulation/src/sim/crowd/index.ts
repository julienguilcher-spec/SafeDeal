/* =====================================================================================
 * FOULE — point d'entrée du module src/sim/crowd.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as crowd } from '@/sim/crowd';
 *   game.addModule(crowd);
 *
 * Deux systèmes partagent le même cœur :
 *   'sim:crowd.control'   (SystemOrder.CONTROL)  arrivées, cortège, réflexion et conduite de chaque personne ;
 *   'sim:crowd.director'  (SystemOrder.RULES)    émotions, densité, phases, tension, aléas, statistiques.
 * Services publiés : ctx.director (DirectorApi), EXT.metro (MetroApi), 'crowd.core' (CrowdCoreApi : registre de
 * contrôleurs de comportement par profil — point d'extension des groupes radicaux, voir docs dans api.ts).
 * La manifestation est mise en place à 'session:started' d'après ctx.session.config.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { CROWD_CONTROL_SYSTEM, CROWD_DIRECTOR_SYSTEM } from './api';
import { CrowdCore } from './core';
import { bindEvents } from './events';

export * from './api';
export { S as CROWD_STATE, A as CROWD_ACT, F as CROWD_FLAG, STATE_NAMES, brainOf, isCrowdBrain } from './brain';
export { CrowdCore } from './core';
export { ROUTES } from './routes-data';
export { CATALOGUE as ALEA_CATALOGUE } from './aleas-data';

/** Contrôleurs : arrivées, cortège, comportement individuel. */
class CrowdControlSystem implements GameSystem {
  readonly id = CROWD_CONTROL_SYSTEM;
  readonly order = SystemOrder.CONTROL;
  private ctx!: GameContext;

  constructor(readonly core: CrowdCore) {}

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.core.provide(ctx);
  }

  init(): void {
    bindEvents(this.core);
  }

  reset(): void {
    this.core.reset();
  }

  update(dt: number): void {
    const core = this.core;
    core.now = this.ctx.clock.now;
    core.metro.update(dt);
    if (!core.active) return;
    core.adoptPending();
    core.sense.update();
    core.formation.update(this.ctx, dt, core.now, core.timeScale);
    core.sono.update();
    core.nav.process();
    core.behavior.update(dt);
    core.voices.update();
  }
}

/** Règles : émotions, densité, directeur, aléas. */
class CrowdDirectorSystem implements GameSystem {
  readonly id = CROWD_DIRECTOR_SYSTEM;
  readonly order = SystemOrder.RULES;
  private ctx!: GameContext;

  constructor(readonly core: CrowdCore) {}

  provide(ctx: GameContext): void {
    this.ctx = ctx;
  }

  update(dt: number): void {
    const core = this.core;
    if (!core.active) return;
    core.now = this.ctx.clock.now;
    core.emotions.update();
    core.density.update();
    core.director.update(dt);
    core.aleas.update();
  }
}

/** Fabrique du module ; `core` est exposé pour les essais (createCrowdSystems().core). */
export function createCrowdSystems(): { systems: GameSystem[]; core: CrowdCore } {
  const core = new CrowdCore();
  return { systems: [new CrowdControlSystem(core), new CrowdDirectorSystem(core)], core };
}

export const createSystems: ModuleFactory = (): GameSystem[] => createCrowdSystems().systems;
