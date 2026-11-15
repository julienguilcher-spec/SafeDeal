/* =====================================================================================
 * Aides de test : un moteur complet sans rendu, pour les tests Node (vitest) de tous les modules.
 *
 *   const t = createTestContext({ seed: 7, modules: [createSystems] });
 *   await t.start({ crowdSize: 50 });      // boot (si besoin) + session « test » en phase playing
 *   t.step(5);                             // 5 s simulées par pas de 1/30 s
 *   expect(t.ctx.people.list.length).toBe(…);
 *
 * Particularités du contexte de test :
 *   - headless (ctx.view === null, frame() jamais appelé), sauvegarde en mémoire, appareil de
 *     référence « bureau » : rien ne dépend de la machine qui exécute les tests ;
 *   - services neutres partout où aucun module n'est fourni (monde = plan infini à y = 0) ;
 *   - mode strict par défaut : une exception dans provide/init/update/reset fait échouer le test
 *     au lieu d'être isolée (passer `strict: false` pour tester l'isolation) ;
 *   - le boot commence dès la création : si aucun init() n'est asynchrone, les services des
 *     modules sont déjà en place au retour de createTestContext(). Sinon, attendre `ready`.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory, SessionConfig } from './contracts';
import { Game } from './game';
import { defaultSessionConfig } from './session';
import { DESKTOP_HINTS } from './settings';

export interface TestContextOptions {
  /** Graine par défaut des sessions démarrées par start() (défaut 1). */
  seed?: number;
  /** Fabriques de modules à brancher (leur `createSystems`). */
  modules?: readonly ModuleFactory[];
  /** Systèmes isolés à brancher en plus. */
  systems?: readonly GameSystem[];
  /** Propager les exceptions des systèmes (défaut true). */
  strict?: boolean;
  /** Journalisation bavarde (défaut false). */
  debug?: boolean;
}

export interface TestContext {
  readonly game: Game;
  readonly ctx: GameContext;
  /** Résolue quand le boot (provide + init) est terminé. */
  readonly ready: Promise<void>;
  /**
   * Avance la simulation de `seconds` secondes par pas de `dt` (défaut 1/30 s, borné à 0,05 s
   * par le moteur). Sans effet tant qu'aucune session n'est en phase « playing ».
   */
  step(seconds: number, dt?: number): void;
  /** Démarre une session d'essai (valeurs par défaut complétées par `partial`) ; retourne la configuration utilisée. */
  start(partial?: Partial<SessionConfig>): Promise<SessionConfig>;
}

export function createTestContext(options: TestContextOptions = {}): TestContext {
  const seed = options.seed ?? 1;
  const game = new Game({
    headless: true,
    seed,
    storage: null,
    device: DESKTOP_HINTS,
    strict: options.strict ?? true,
    debug: options.debug ?? false,
  });
  if (options.modules) for (const m of options.modules) game.addModule(m);
  if (options.systems) for (const s of options.systems) game.addSystem(s);
  const ready = game.boot();
  // un échec du boot est signalé à celui qui attend `ready` ou appelle start(), pas en rejet non géré
  ready.catch(() => {});

  return {
    game,
    ctx: game.ctx,
    ready,
    step(seconds: number, dt: number = 1 / 30): void {
      if (!(seconds > 0) || !(dt > 0)) return;
      const n = Math.max(1, Math.round(seconds / dt));
      const h = seconds / n;
      for (let i = 0; i < n; i++) game.step(h);
    },
    async start(partial: Partial<SessionConfig> = {}): Promise<SessionConfig> {
      await ready;
      const config = defaultSessionConfig({ seed, x: 0, z: 0, ...partial });
      await game.ctx.session.start(config);
      return game.ctx.session.config ?? config;
    },
  };
}
