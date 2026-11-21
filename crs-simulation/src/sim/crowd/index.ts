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
 *   'sim:crowd.foyers'    (SystemOrder.RULES + 1)    foyers secondaires ailleurs dans Paris (foyers.ts) ;
 *   'sim:crowd.manifs'    (SystemOrder.RULES + 2)    manifestations déclarées simultanées (manifs.ts) ;
 *   'sim:crowd.evacuation'(SystemOrder.RULES + 3)    évacuation filtrée d'une nasse (evacuation.ts).
 * Les cortèges se détournent devant les rues fermées (detour.ts).
 * Services publiés : ctx.director (DirectorApi), EXT.metro (MetroApi), 'crowd.core' (CrowdCoreApi : registre de
 * contrôleurs de comportement par profil — point d'extension des groupes radicaux, voir docs dans api.ts),
 * 'crowd.foyers' (FoyersApi : foyers secondaires en cours, déclaration à la volée), 'crowd.manifs' (ManifsApi :
 * manifestations simultanées, déclaration à la volée, manifestations sauvages des imprévus).
 * La manifestation est mise en place à 'session:started' d'après ctx.session.config.
 * Mode veille (extra['crowd.veille'] = true, mode Patrouille) : le cœur est actif sans manifestation principale —
 * phase 'aucune', aucun parcours, aucun aléa du cortège ; seuls vivent les foyers et les manifestations déclarés.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { CROWD_CONTROL_SYSTEM, CROWD_DIRECTOR_SYSTEM } from './api';
import { CrowdCore } from './core';
import { bindEvents } from './events';
import { EvacuationSystem } from './evacuation';
import { FoyersSystem } from './foyers';
import { ManifsSystem } from './manifs';
import { createRadicalSystem } from './radical';
import type { RadicalSystem } from './radical';

export * from './api';
export { S as CROWD_STATE, A as CROWD_ACT, F as CROWD_FLAG, STATE_NAMES, brainOf, isCrowdBrain } from './brain';
export { CrowdCore, CROWD_VEILLE_KEY } from './core';
export { FoyersSystem, PARIS_PLACES, placeInSentence } from './foyers';
export { MANIF_PLACES, ManifsSystem, readImprevus, readManifSpecs } from './manifs';
export type { ManifSpec } from './manifs';
export { EvacuationSystem } from './evacuation';
export { Rerouter, RoadBlocks, closureAhead, enclosedAt, planDetour } from './detour';
export type { Detour } from './detour';
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
export function createCrowdSystems(): {
  systems: GameSystem[]; core: CrowdCore; radical: RadicalSystem; foyers: FoyersSystem; manifs: ManifsSystem; evacuation: EvacuationSystem;
} {
  const core = new CrowdCore();
  const radical = createRadicalSystem(core);
  const foyers = new FoyersSystem(core, radical);
  const manifs = new ManifsSystem(core, radical);
  const evacuation = new EvacuationSystem(core);
  return {
    systems: [new CrowdControlSystem(core), radical, new CrowdDirectorSystem(core), foyers, manifs, evacuation], core, radical, foyers, manifs, evacuation,
  };
}

export const createSystems: ModuleFactory = (): GameSystem[] => createCrowdSystems().systems;
