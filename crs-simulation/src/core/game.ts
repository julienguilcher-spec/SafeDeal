/* =====================================================================================
 * Game — cœur du moteur : modules, démarrage, boucle, isolation des erreurs, mesures.
 *
 * Cycle de vie (docs/ARCHITECTURE.md §2) :
 *   const game = new Game();            // contexte + services neutres
 *   game.addModule(createSystems);      // autant de fois que de modules
 *   await game.boot();                  // tri par `order`, tous les provide(), puis tous les init()
 *   game.run();                         // boucle requestAnimationFrame (navigateur)
 *   await game.ctx.session.start(cfg);  // reset() des systèmes, chargement, session:started
 *
 * Boucle : à chaque image, si la session est en phase « playing », le temps réel écoulé (borné)
 * multiplié par clock.timeScale est découpé en pas égaux ≤ 0,05 s ; pour chaque pas, update(dt)
 * de chaque système dans l'ordre. Puis frame(dtRéel) de chaque système (jamais en headless).
 * step(dt) exécute la même simulation sans frame() : c'est l'outil des tests.
 *
 * Erreurs : une exception dans update()/frame() est journalisée avec l'identifiant du système ;
 * après 5 erreurs consécutives le système est désactivé jusqu'à la prochaine session. En mode
 * `strict` (option du contexte, activée par défaut dans les tests), l'exception est propagée au
 * lieu d'être isolée.
 *
 * Garde-fous : une durée qui n'est pas un nombre fini positif n'avance rien (step(Infinity) ne
 * boucle pas) ; step()/frame() appelés depuis un update() ou un frame() en cours sont refusés
 * (l'horloge n'avance jamais deux fois dans le même pas) ; un init() asynchrone qui ne répond pas
 * est signalé au bout de INIT_WATCHDOG_MS, avec le nom du système en cause.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory, SessionApi } from './contracts';
import { SystemOrder } from './contracts';
import { createContext, getCore } from './context';
import type { ContextOptions, CoreInternals } from './context';

/** Pas de simulation maximal (s). */
export const MAX_STEP = 0.05;
/** Nombre d'erreurs consécutives avant désactivation d'un système. */
export const MAX_CONSECUTIVE_ERRORS = 5;
/** Borne de clock.timeScale prise en compte par la boucle. */
export const MAX_TIME_SCALE = 64;
/** Identifiant du système interne qui fait vivre les services neutres. */
export const NEUTRAL_SYSTEM_ID = 'core:neutral';
/** Clé du service de mesures : ctx.service<PerfApi>('perf') — pour un affichage des performances. */
export const PERF_SERVICE = 'perf';
/** Délai (ms) au bout duquel un init() asynchrone sans réponse est signalé en console. */
export const INIT_WATCHDOG_MS = 10000;

export interface GameOptions extends ContextOptions {
  /** Temps réel maximal pris en compte pour une image (s). Défaut : 0,1. */
  maxFrameDt?: number;
  /** Nombre maximal de pas de simulation par image (avance rapide). Défaut : 40. */
  maxStepsPerFrame?: number;
}

/** Mesures d'un système, pour l'affichage des performances. */
export interface SystemPerf {
  readonly id: string;
  readonly order: number;
  /** Temps passé dans update() pendant la dernière image (ms, tous pas confondus). */
  updateMs: number;
  /** Temps passé dans frame() pendant la dernière image (ms). */
  frameMs: number;
  /** Moyennes glissantes (ms par image). */
  avgUpdateMs: number;
  avgFrameMs: number;
  /** Nombre total d'erreurs levées par le système. */
  errors: number;
  /** Le système n'est plus appelé (trop d'erreurs, ou initialisation échouée). */
  disabled: boolean;
}

/** Mesures globales de la boucle. */
export interface GameStats {
  /** Images par seconde (moyenne glissante de la boucle requestAnimationFrame). */
  fps: number;
  /** Temps processeur de la dernière image (ms) : simulation + présentation. */
  frameMs: number;
  simMs: number;
  presentMs: number;
  avgFrameMs: number;
  /** Pas de simulation exécutés pendant la dernière image. */
  steps: number;
  /** Images traitées depuis le démarrage. */
  frames: number;
  /** Temps simulé abandonné parce que maxStepsPerFrame était atteint (s, cumulé). */
  droppedTime: number;
}

/** Service de mesures publié sous la clé « perf » (objets stables, mis à jour à chaque image). */
export interface PerfApi {
  /** Un élément par système, dans l'ordre d'exécution. */
  readonly systems: readonly SystemPerf[];
  readonly stats: Readonly<GameStats>;
}

type Stage = 'provide' | 'init' | 'update' | 'frame' | 'reset' | 'dispose';

interface Slot {
  sys: GameSystem;
  perf: SystemPerf;
  /** Ordre d'exécution (champ `order` du système, 0 s'il est invalide). */
  order: number;
  /** Ordre d'ajout (départage les systèmes de même `order`). */
  seq: number;
  updateErrors: number;
  frameErrors: number;
  accUpdate: number;
  accFrame: number;
  /** provide() ou init() a échoué : le système reste désactivé. */
  bootFailed: boolean;
}

const now: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

const EMA = 0.1;

export class Game {
  readonly ctx: GameContext;
  /** Mesures par système, dans l'ordre d'exécution (stable après boot()). */
  readonly perf: SystemPerf[] = [];
  readonly stats: GameStats = {
    fps: 0, frameMs: 0, simMs: 0, presentMs: 0, avgFrameMs: 0, steps: 0, frames: 0, droppedTime: 0,
  };

  private readonly core: CoreInternals;
  private readonly slots: Slot[] = [];
  private readonly strict: boolean;
  private readonly maxFrameDt: number;
  private readonly maxSteps: number;
  private bootPromise: Promise<void> | null = null;
  private booted_ = false;
  private disposed = false;
  private running = false;
  private rafId = 0;
  private lastTime = -1;
  private seq = 0;
  /** Une image (simulation ou présentation) est en cours : step()/frame() imbriqués sont refusés. */
  private advancing = false;
  private reentryReported = false;

  constructor(options: GameOptions = {}) {
    this.ctx = createContext(options);
    this.core = getCore(this.ctx);
    this.strict = options.strict ?? false;
    this.maxFrameDt = options.maxFrameDt && options.maxFrameDt > 0 ? options.maxFrameDt : 0.1;
    this.maxSteps = options.maxStepsPerFrame && options.maxStepsPerFrame >= 1 ? Math.floor(options.maxStepsPerFrame) : 40;
    this.core.session.setHooks({
      beforeStart: () => this.boot(),
      resetSystems: () => this.resetSystems(),
    });
    const perfApi: PerfApi = { systems: this.perf, stats: this.stats };
    this.ctx.provide(PERF_SERVICE, perfApi);
    // Système interne : interactions neutres et objets poussés, tant que les modules ne les remplacent pas.
    const core = this.core;
    this.addSystem({
      id: NEUTRAL_SYSTEM_ID,
      order: SystemOrder.ACTIONS,
      update: (dt: number) => core.updateNeutral(dt),
    });
  }

  /** Session de jeu (identique à ctx.session). */
  get session(): SessionApi {
    return this.ctx.session;
  }

  /** boot() est terminé. */
  get booted(): boolean {
    return this.booted_;
  }

  /** Systèmes dans l'ordre d'exécution (ordre d'ajout avant boot()). */
  get systems(): readonly GameSystem[] {
    return this.slots.map((s) => s.sys);
  }

  get systemCount(): number {
    return this.slots.length;
  }

  /** La boucle requestAnimationFrame tourne. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Ajoute tous les systèmes d'un module (son `createSystems`). À appeler avant boot(). */
  addModule(factory: ModuleFactory): this {
    const systems = factory();
    for (let i = 0; i < systems.length; i++) this.addSystem(systems[i]!);
    return this;
  }

  /** Ajoute un système. À appeler avant boot(). */
  addSystem(system: GameSystem): this {
    if (!system || typeof system.id !== 'string' || system.id === '') {
      throw new Error('[core] système sans identifiant : chaque GameSystem doit avoir un `id`');
    }
    if (this.bootPromise) {
      throw new Error(`[core] système « ${system.id} » ajouté après boot() : ajouter les modules avant de démarrer`);
    }
    let order = system.order;
    if (typeof order !== 'number' || !Number.isFinite(order)) {
      console.warn(`[core] système « ${system.id} » : champ \`order\` invalide, 0 utilisé`);
      order = 0;
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]!.sys.id === system.id) {
        console.warn(`[core] deux systèmes portent l'identifiant « ${system.id} »`);
        break;
      }
    }
    const perf: SystemPerf = {
      id: system.id, order, updateMs: 0, frameMs: 0, avgUpdateMs: 0, avgFrameMs: 0, errors: 0, disabled: false,
    };
    this.slots.push({
      sys: system, perf, order, seq: this.seq++, updateErrors: 0, frameErrors: 0, accUpdate: 0, accFrame: 0, bootFailed: false,
    });
    this.perf.push(perf);
    return this;
  }

  /**
   * Démarre le moteur : tri des systèmes par `order` (à égalité, ordre d'ajout), tous les provide(),
   * puis tous les init() — attendus un à un. Idempotent : les appels suivants renvoient la même promesse.
   * Si aucun init() n'est asynchrone, tout est terminé au retour de l'appel (avant même le `await`).
   */
  boot(): Promise<void> {
    if (!this.bootPromise) this.bootPromise = this.doBoot();
    return this.bootPromise;
  }

  private async doBoot(): Promise<void> {
    const ctx = this.ctx;
    this.slots.sort((a, b) => a.order - b.order || a.seq - b.seq);
    this.perf.length = 0;
    for (let i = 0; i < this.slots.length; i++) this.perf.push(this.slots[i]!.perf);

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      if (!slot.sys.provide) continue;
      try {
        slot.sys.provide(ctx);
      } catch (err) {
        this.fail(slot, 'provide', err);
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      if (!slot.sys.init || slot.bootFailed) continue;
      try {
        const result = slot.sys.init(ctx);
        if (result && typeof (result as Promise<void>).then === 'function') await this.watched(slot.sys.id, result);
      } catch (err) {
        this.fail(slot, 'init', err);
      }
    }
    this.booted_ = true;
    this.core.session.markBooted();
  }

  /**
   * Attend un init() asynchrone en surveillant sa durée : s'il n'a pas répondu au bout de
   * INIT_WATCHDOG_MS, un avertissement nomme le système (écran de chargement bloqué : init() qui
   * attend ctx.session.start(), ressource qui ne se charge pas…). L'attente continue ensuite.
   */
  private async watched(id: string, pending: Promise<void>): Promise<void> {
    const g = globalThis as {
      setTimeout?: (cb: () => void, ms: number) => unknown;
      clearTimeout?: (handle: never) => void;
    };
    if (typeof g.setTimeout !== 'function') return pending;
    const timer = g.setTimeout(() => {
      console.warn(
        `[core] init() du système « ${id} » n'a pas répondu depuis ${INIT_WATCHDOG_MS / 1000} s : le démarrage attend toujours ` +
          '(un init() ne doit pas attendre ctx.session.start(), qui attend lui-même la fin du démarrage)',
      );
    }, INIT_WATCHDOG_MS);
    // sous Node, cette minuterie ne doit pas retenir le processus à elle seule
    (timer as { unref?: () => void } | null)?.unref?.();
    try {
      await pending;
    } finally {
      if (typeof g.clearTimeout === 'function') g.clearTimeout(timer as never);
    }
  }

  /**
   * Avance la simulation de `dt` secondes (× clock.timeScale), sans appeler frame() et sans limite
   * de durée : step(60) simule une minute entière, par pas ≤ 0,05 s. Sans effet hors de la phase
   * « playing », ou si `dt` n'est pas un nombre fini positif. Retourne le nombre de pas exécutés.
   */
  step(dt: number): number {
    return this.advance(dt, false);
  }

  /**
   * Traite une image complète : simulation (au plus maxStepsPerFrame pas) puis frame() de chaque
   * système (hors headless). C'est ce qu'appelle la boucle requestAnimationFrame.
   */
  frame(dtReal: number): number {
    return this.advance(dtReal, true);
  }

  /** Lance la boucle requestAnimationFrame (sans effet hors navigateur : utiliser step()). */
  run(): void {
    if (this.running || this.disposed) return;
    const g = globalThis as { requestAnimationFrame?: (cb: (t: number) => void) => number };
    if (typeof g.requestAnimationFrame !== 'function') {
      console.warn('[core] requestAnimationFrame indisponible : la boucle ne tourne pas, utiliser step()');
      return;
    }
    const raf = g.requestAnimationFrame.bind(globalThis);
    this.running = true;
    this.lastTime = -1;
    const loop = (t: number): void => {
      if (!this.running) return;
      this.rafId = raf(loop);
      let dt = this.lastTime < 0 ? 0 : (t - this.lastTime) / 1000;
      this.lastTime = t;
      if (dt > 0) this.stats.fps += (1 / dt - this.stats.fps) * (this.stats.fps === 0 ? 1 : EMA);
      if (!(dt >= 0)) dt = 0;
      if (dt > this.maxFrameDt) dt = this.maxFrameDt;
      this.advance(dt, true);
    };
    this.rafId = raf(loop);
  }

  /** Arrête la boucle requestAnimationFrame. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    const g = globalThis as { cancelAnimationFrame?: (id: number) => void };
    if (typeof g.cancelAnimationFrame === 'function') g.cancelAnimationFrame(this.rafId);
  }

  /** Arrête la boucle et appelle dispose() sur chaque système (ordre inverse). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i]!;
      if (!slot.sys.dispose) continue;
      try {
        slot.sys.dispose();
      } catch (err) {
        console.error(`[core] erreur dans dispose() du système « ${slot.sys.id} »`, err);
      }
    }
  }

  // ───────────────────────────── boucle ─────────────────────────────

  private advance(dtReal: number, present: boolean): number {
    if (!this.booted_ || this.disposed) return 0;
    if (this.advancing) {
      // appelé depuis un update() ou un frame() : avancer l'horloge au milieu d'un pas corromprait la simulation
      if (!this.reentryReported) {
        this.reentryReported = true;
        console.error(
          '[core] step()/frame() appelé pendant une image en cours (depuis un système ?) : appel ignoré ' +
            '(signalé une seule fois)',
        );
      }
      return 0;
    }
    // une durée infinie ou NaN ne simule rien (step(Infinity) bouclerait sans fin)
    const dt = dtReal > 0 && dtReal !== Infinity ? dtReal : 0;
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      slots[i]!.accUpdate = 0;
      slots[i]!.accFrame = 0;
    }
    this.advancing = true;
    let steps = 0;
    let t0 = 0;
    let t1 = 0;
    let t2 = 0;
    try {
      t0 = now();
      if (dt > 0 && this.ctx.session.phase === 'playing') steps = this.simulate(dt, present);
      t1 = now();
      if (present && !this.ctx.headless) this.present(dt);
      t2 = now();
    } finally {
      this.advancing = false;
    }

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const p = s.perf;
      p.updateMs = s.accUpdate;
      p.frameMs = s.accFrame;
      p.avgUpdateMs += (s.accUpdate - p.avgUpdateMs) * EMA;
      p.avgFrameMs += (s.accFrame - p.avgFrameMs) * EMA;
    }
    const st = this.stats;
    st.simMs = t1 - t0;
    st.presentMs = t2 - t1;
    st.frameMs = t2 - t0;
    st.avgFrameMs += (st.frameMs - st.avgFrameMs) * EMA;
    st.steps = steps;
    st.frames++;
    return steps;
  }

  /** Découpe le temps simulé en pas égaux ≤ MAX_STEP et les exécute (`capped` : borne du nombre de pas). */
  private simulate(dtReal: number, capped: boolean): number {
    const clock = this.core.clock;
    let scale = clock.timeScale;
    if (!(scale > 0)) return 0;
    if (scale > MAX_TIME_SCALE) scale = MAX_TIME_SCALE;
    let simDt = dtReal * scale;
    let n = Math.ceil(simDt / MAX_STEP - 1e-9);
    if (n < 1) n = 1;
    if (capped && n > this.maxSteps) {
      this.stats.droppedTime += simDt - this.maxSteps * MAX_STEP;
      n = this.maxSteps;
      simDt = n * MAX_STEP;
    }
    let h = simDt / n;
    if (h > MAX_STEP) h = MAX_STEP;
    let done = 0;
    for (let s = 0; s < n; s++) {
      if (this.ctx.session.phase !== 'playing') break; // un système a mis en pause ou terminé la session
      this.stepOnce(h);
      done++;
    }
    return done;
  }

  private stepOnce(h: number): void {
    const ctx = this.ctx;
    this.core.clock.advance(h);
    // index spatial des personnes à jour pour les contrôleurs, même sans module de locomotion
    try {
      ctx.people.rebuildIndex();
    } catch (err) {
      console.error('[core] reconstruction de l\'index des personnes impossible', err);
      if (this.strict) throw err;
    }
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      if (slot.perf.disabled || !slot.sys.update) continue;
      const t = now();
      try {
        slot.sys.update(h);
        slot.updateErrors = 0;
      } catch (err) {
        slot.accUpdate += now() - t;
        this.fail(slot, 'update', err);
        continue;
      }
      slot.accUpdate += now() - t;
    }
  }

  private present(dtReal: number): void {
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      if (slot.perf.disabled || !slot.sys.frame) continue;
      const t = now();
      try {
        slot.sys.frame(dtReal);
        slot.frameErrors = 0;
      } catch (err) {
        slot.accFrame += now() - t;
        this.fail(slot, 'frame', err);
        continue;
      }
      slot.accFrame += now() - t;
    }
  }

  /** reset() de tous les systèmes (début de session) ; les systèmes désactivés pour erreurs sont réactivés. */
  private resetSystems(): void {
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      slot.updateErrors = 0;
      slot.frameErrors = 0;
      if (slot.bootFailed) continue;
      slot.perf.disabled = false;
      if (!slot.sys.reset) continue;
      try {
        slot.sys.reset();
      } catch (err) {
        this.fail(slot, 'reset', err);
      }
    }
  }

  /** Journalise une erreur de système et applique la politique d'isolation. */
  private fail(slot: Slot, stage: Stage, err: unknown): void {
    const id = slot.sys.id;
    slot.perf.errors++;
    console.error(`[core] erreur dans ${stage}() du système « ${id} »`, err);
    if (stage === 'provide' || stage === 'init') {
      slot.bootFailed = true;
      slot.perf.disabled = true;
      console.error(`[core] système « ${id} » désactivé : son ${stage}() a échoué`);
    } else if (stage === 'update' || stage === 'frame') {
      const count = stage === 'update' ? ++slot.updateErrors : ++slot.frameErrors;
      if (count >= MAX_CONSECUTIVE_ERRORS && !this.strict) {
        slot.perf.disabled = true;
        console.error(
          `[core] système « ${id} » désactivé après ${count} erreurs consécutives dans ${stage}() : ` +
            'il ne sera plus appelé avant la prochaine session',
        );
        this.ctx.events.emitAny('core:system_disabled', { id, stage });
      }
    }
    if (this.strict) throw err;
  }
}
