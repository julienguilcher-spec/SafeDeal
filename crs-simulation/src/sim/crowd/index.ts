/* =====================================================================================
 * FOULE — point d'entrée du module src/sim/crowd.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as crowd } from '@/sim/crowd';
 *   game.addModule(crowd);
 *
 * Quatre systèmes partagent le même cœur :
 *   'sim:crowd.control'   (SystemOrder.CONTROL)      arrivées, cortège, réflexion et conduite de chaque personne ;
 *   'sim:crowd.radical'   (SystemOrder.CONTROL + 1)  groupes radicaux, bloc, suiveurs, pilleurs (dossier radical/) ;
 *   'sim:crowd.director'  (SystemOrder.RULES)        émotions, densité, phases, tension, aléas, statistiques ;
 *   'sim:crowd.foyers'    (SystemOrder.RULES + 1)    foyers secondaires ailleurs dans Paris (foyers.ts).
 * Services publiés : ctx.director (DirectorApi), EXT.metro (MetroApi), 'crowd.core' (CrowdCoreApi : registre de
 * contrôleurs de comportement par profil — point d'extension des groupes radicaux, voir docs dans api.ts),
 * 'crowd.foyers' (FoyersApi : foyers secondaires en cours).
 * La manifestation est mise en place à 'session:started' d'après ctx.session.config.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { CROWD_CONTROL_SYSTEM, CROWD_DIRECTOR_SYSTEM } from './api';
import { CrowdCore } from './core';
import { bindEvents } from './events';
import { FoyersSystem } from './foyers';
import { createRadicalSystem } from './radical';
import type { RadicalSystem } from './radical';

export * from './api';
export { S as CROWD_STATE, A as CROWD_ACT, F as CROWD_FLAG, STATE_NAMES, brainOf, isCrowdBrain } from './brain';
export { CrowdCore } from './core';
export { FoyersSystem, placeInSentence } from './foyers';
export { ROUTES } from './routes-data';
export { CATALOGUE as ALEA_CATALOGUE } from './aleas-data';
export { CROWD_SIGNALS, CROWD_RADICAL, RADICAL_SYSTEM, SIGNAL_EVENT, BLOC_EVENT, RADICAL_EVENT } from './radical/api';
export type {
  SignalsApi, CrowdSignal, SignalType, SignalEvent, RadicalApi, RadicalGroupView, RadicalStats, RadicalEvent, RadicalFact, BlocEvent,
  BlocPhase, GroupPlan,
} from './radical/api';

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
    if (core.profiling) {
      // mesure par sous-système (essais de performance) : ms cumulées dans core.prof
      const prof = core.prof;
      let t = performance.now();
      const lap = (k: number): void => {
        const n = performance.now();
        prof[k] = prof[k]! + n - t;
        t = n;
      };
      core.adoptPending();
      core.sense.update();
      lap(0);
      core.formation.update(this.ctx, dt, core.now, core.timeScale);
      core.sono.update();
      lap(1);
      core.nav.process();
      lap(2);
      core.behavior.update(dt);
      lap(3);
      core.voices.update();
      lap(4);
      return;
    }
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
    if (core.profiling) {
      const prof = core.prof;
      let t = performance.now();
      core.emotions.update();
      prof[5] = prof[5]! + performance.now() - t;
      t = performance.now();
      core.density.update();
      prof[6] = prof[6]! + performance.now() - t;
      t = performance.now();
      core.director.update(dt);
      core.aleas.update();
      prof[7] = prof[7]! + performance.now() - t;
      return;
    }
    core.emotions.update();
    core.density.update();
    core.director.update(dt);
    core.aleas.update();
  }
}

/**
 * Fabrique du module ; `core`, `radical` et `foyers` sont exposés pour les essais (createCrowdSystems().core).
 * Quatre systèmes : contrôle de la foule, groupes radicaux (juste après), directeur, foyers secondaires.
 */
export function createCrowdSystems(): { systems: GameSystem[]; core: CrowdCore; radical: RadicalSystem; foyers: FoyersSystem } {
  const core = new CrowdCore();
  const radical = createRadicalSystem(core);
  const foyers = new FoyersSystem(core, radical);
  return { systems: [new CrowdControlSystem(core), radical, new CrowdDirectorSystem(core), foyers], core, radical, foyers };
}

export const createSystems: ModuleFactory = (): GameSystem[] => createCrowdSystems().systems;
