/* =====================================================================================
 * FOULE — aides de test : un jeu headless avec le quartier d'essai et les modules réels (monde,
 * personnes, matériel, dangers, droit), plus la foule. Réservé aux tests (tests/unit/crowd.*.test.ts).
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { brainOf } from './brain';
import type { CrowdCore } from './core';
import { createCrowdSystems } from './index';

export interface CrowdTest extends TestContext {
  core: CrowdCore;
  /** Manifestants pilotés (hors badauds). */
  protesters(): Person[];
  /** Avance par pas de 0,05 s (le plus grand pas du moteur) : deux fois moins de pas qu'à 30 Hz. */
  run(seconds: number): void;
  /** Temps moyen passé dans les deux systèmes de la foule, par pas (ms), depuis le dernier appel. */
  costPerStep(): number;
}

export interface CrowdTestOptions {
  seed?: number;
  /** Modules à brancher avant la foule (monde, personnes, matériel…). */
  modules?: readonly ModuleFactory[];
  systems?: readonly GameSystem[];
}

/** Monte un jeu de test avec la foule ; les autres modules sont fournis par l'appelant. */
export function createCrowdTest(options: CrowdTestOptions = {}): CrowdTest {
  const crowd = createCrowdSystems();
  let acc = 0;
  let steps = 0;
  // enveloppes de mesure : temps passé dans update() des deux systèmes
  const timed = crowd.systems.map((s): GameSystem => ({
    id: s.id,
    order: s.order,
    provide: s.provide ? (ctx: GameContext) => s.provide!(ctx) : undefined,
    init: s.init ? (ctx: GameContext) => s.init!(ctx) : undefined,
    reset: s.reset ? () => s.reset!() : undefined,
    update: (dt: number) => {
      const t = performance.now();
      s.update!(dt);
      acc += performance.now() - t;
      if (s === crowd.systems[0]) steps++;
    },
  }));
  const t = createTestContext({ seed: options.seed ?? 1, modules: options.modules, systems: [...(options.systems ?? []), ...timed] });
  return {
    ...t,
    core: crowd.core,
    protesters(): Person[] {
      const out: Person[] = [];
      for (const p of crowd.core.members) {
        const b = brainOf(p);
        if (b && (b.flags & 1) === 0 && p.faction === 'protest') out.push(p);
      }
      return out;
    },
    run(seconds: number): void {
      t.step(seconds, 0.05);
    },
    costPerStep(): number {
      const v = steps > 0 ? acc / steps : 0;
      acc = 0;
      steps = 0;
      return v;
    },
  };
}

/** Configuration de session « quartier d'essai » pour une manifestation. */
export function demoConfig(partial: Partial<SessionConfig> = {}): Partial<SessionConfig> {
  return { mode: 'test', x: 0, z: 0, crowdSize: 300, tension: 0.1, volatility: 0.2, duration: 'standard', ...partial };
}
