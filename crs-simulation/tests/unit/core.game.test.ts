import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext, GameSystem, HazardApi, ModuleFactory } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { Game, MAX_CONSECUTIVE_ERRORS, MAX_STEP, NEUTRAL_SYSTEM_ID, PERF_SERVICE } from '@/core/game';
import type { PerfApi } from '@/core/game';
import { defaultSessionConfig } from '@/core/session';
import { DESKTOP_HINTS } from '@/core/settings';

/** Système espion : note chaque appel dans un journal commun. */
function spy(id: string, order: number, log: string[], extra: Partial<GameSystem> = {}): GameSystem {
  return {
    id,
    order,
    provide: () => void log.push(`provide:${id}`),
    init: () => void log.push(`init:${id}`),
    update: () => void log.push(`update:${id}`),
    frame: () => void log.push(`frame:${id}`),
    reset: () => void log.push(`reset:${id}`),
    dispose: () => void log.push(`dispose:${id}`),
    ...extra,
  };
}

function headlessGame(opts: { strict?: boolean; maxStepsPerFrame?: number } = {}): Game {
  return new Game({ headless: true, storage: null, device: DESKTOP_HINTS, ...opts });
}

/** Jeu « navigateur » simulé : frame() est appelé, mais rien ne touche au DOM. */
function windowedGame(): Game {
  return new Game({ headless: false, storage: null, device: DESKTOP_HINTS });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Game — démarrage', () => {
  it('trie par order, appelle tous les provide() puis tous les init()', async () => {
    const log: string[] = [];
    const game = headlessGame();
    // ajoutés dans le désordre, par deux modules
    const moduleA: ModuleFactory = () => [spy('ui', SystemOrder.UI, log), spy('input', SystemOrder.INPUT, log)];
    const moduleB: ModuleFactory = () => [spy('move', SystemOrder.MOVEMENT, log), spy('ctrl', SystemOrder.CONTROL, log)];
    game.addModule(moduleA).addModule(moduleB);
    expect(game.booted).toBe(false);
    expect(game.session.phase).toBe('boot');
    await game.boot();
    expect(game.booted).toBe(true);
    expect(game.session.phase).toBe('menu');
    expect(log).toEqual([
      'provide:input', 'provide:ctrl', 'provide:move', 'provide:ui',
      'init:input', 'init:ctrl', 'init:move', 'init:ui',
    ]);
    expect(game.systems.map((s) => s.id)).toEqual(['input', 'ctrl', 'move', NEUTRAL_SYSTEM_ID, 'ui']);
    expect(game.perf.map((p) => p.id)).toEqual(['input', 'ctrl', 'move', NEUTRAL_SYSTEM_ID, 'ui']);
    expect(game.systemCount).toBe(5);
  });

  it('à order égal, l\'ordre d\'ajout est conservé', async () => {
    const log: string[] = [];
    const game = headlessGame();
    for (const id of ['c', 'a', 'b']) game.addSystem(spy(id, 300, log));
    await game.boot();
    expect(log.slice(0, 3)).toEqual(['provide:c', 'provide:a', 'provide:b']);
  });

  it('les init() asynchrones sont attendus un à un, dans l\'ordre', async () => {
    const log: string[] = [];
    const game = headlessGame();
    const slow = (id: string, order: number, ms: number): GameSystem => ({
      id,
      order,
      init: async () => {
        log.push(`début:${id}`);
        await new Promise((r) => setTimeout(r, ms));
        log.push(`fin:${id}`);
      },
    });
    game.addSystem(slow('b', 200, 1)).addSystem(slow('a', 100, 15)).addSystem({ id: 'c', order: 300, init: () => void log.push('sync:c') });
    const p = game.boot();
    expect(game.booted).toBe(false);
    await p;
    expect(log).toEqual(['début:a', 'fin:a', 'début:b', 'fin:b', 'sync:c']);
    expect(game.boot()).toBe(p); // idempotent
  });

  it('sans init() asynchrone, le boot est terminé dès le retour de boot()', () => {
    const game = headlessGame();
    let api: HazardApi | null = null;
    game.addSystem({
      id: 'hazards',
      order: SystemOrder.HAZARDS,
      provide(ctx: GameContext) {
        api = { ...ctx.hazards, gasAt: () => 0.5 };
        ctx.hazards = api;
      },
    });
    void game.boot();
    expect(game.booted).toBe(true);
    expect(game.ctx.hazards).toBe(api);
    expect(game.ctx.hazards.gasAt(0, 0)).toBe(0.5); // le service du module a remplacé le service neutre
  });

  it('provide() s\'exécute avant tout init() : les services des autres modules sont visibles', async () => {
    const game = headlessGame();
    let seen: unknown;
    game.addSystem({ id: 'consommateur', order: 100, init: (ctx) => void (seen = ctx.service('carriere')) });
    game.addSystem({ id: 'fournisseur', order: 900, provide: (ctx) => ctx.provide('carriere', { grade: 'major' }) });
    await game.boot();
    expect(seen).toEqual({ grade: 'major' });
  });

  it('ajouter un système après boot() est une erreur explicite', async () => {
    const game = headlessGame();
    await game.boot();
    expect(() => game.addSystem({ id: 'tard', order: 1 })).toThrow(/après boot/);
    expect(() => game.addModule(() => [{ id: 'tard', order: 1 }])).toThrow(/tard/);
  });

  it('un init() qui échoue désactive ce système sans bloquer les autres', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log: string[] = [];
    const game = headlessGame();
    game.addSystem(spy('cassé', 100, log, {
      init: () => {
        throw new Error('init impossible');
      },
    }));
    game.addSystem(spy('rejet', 150, log, { init: () => Promise.reject(new Error('rejet asynchrone')) }));
    game.addSystem(spy('sain', 200, log));
    await game.boot();
    expect(game.booted).toBe(true);
    expect(log).toContain('init:sain');
    await game.session.start(defaultSessionConfig());
    log.length = 0;
    game.step(0.02);
    expect(log).toEqual(['update:sain']);
    const perf = Object.fromEntries(game.perf.map((p) => [p.id, p]));
    expect([perf['cassé']!.disabled, perf['rejet']!.disabled, perf['sain']!.disabled]).toEqual([true, true, false]);
    expect(errors.mock.calls.some((c) => String(c[0]).includes('cassé') && String(c[0]).includes('init()'))).toBe(true);
    // un système dont l'initialisation a échoué reste désactivé à la session suivante
    await game.session.start(defaultSessionConfig());
    expect(perf['cassé']!.disabled).toBe(true);
  });

  it('en mode strict, une erreur de démarrage fait échouer boot()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = headlessGame({ strict: true });
    game.addSystem({
      id: 'cassé',
      order: 1,
      provide: () => {
        throw new Error('provide impossible');
      },
    });
    await expect(game.boot()).rejects.toThrow('provide impossible');
  });
});

describe('Game — boucle de simulation', () => {
  it('update() seulement en phase « playing », dans l\'ordre, avec un dt ≤ 0,05 s', async () => {
    const log: string[] = [];
    const dts: number[] = [];
    const game = headlessGame();
    game.addSystem(spy('b', 200, log)).addSystem(spy('a', 100, log, { update: (dt) => void (log.push('update:a'), dts.push(dt)) }));
    await game.boot();
    log.length = 0;
    expect(game.step(0.03)).toBe(0); // au menu : rien
    expect(log).toEqual([]);

    await game.session.start(defaultSessionConfig());
    log.length = 0;
    expect(game.step(0.03)).toBe(1);
    expect(log).toEqual(['update:a', 'update:b']);
    expect(dts).toEqual([0.03]);

    // 0,12 s → 3 pas égaux de 0,04 s
    log.length = 0;
    dts.length = 0;
    expect(game.step(0.12)).toBe(3);
    expect(log).toEqual(['update:a', 'update:b', 'update:a', 'update:b', 'update:a', 'update:b']);
    for (const dt of dts) expect(dt).toBeCloseTo(0.04, 12);
    // multiples exacts et valeurs limites
    for (const total of [0.05, 0.1, 0.15, 0.35, 0.0501, 1 / 30, 1 / 60, 0.2]) {
      dts.length = 0;
      const n = game.step(total);
      expect(n).toBe(Math.ceil(total / MAX_STEP - 1e-9));
      expect(dts.length).toBe(n);
      for (const dt of dts) expect(dt).toBeLessThanOrEqual(MAX_STEP);
      expect(dts.reduce((s, d) => s + d, 0)).toBeCloseTo(total, 12);
    }
    expect(game.step(0)).toBe(0);
    expect(game.step(-1)).toBe(0);
    expect(game.step(Number.NaN)).toBe(0);
  });

  it('l\'horloge avance avec la simulation : now, dt, tick', async () => {
    const game = headlessGame();
    const seen: { now: number; dt: number; tick: number }[] = [];
    game.addSystem({ id: 'obs', order: 1, update: () => void seen.push({ now: game.ctx.clock.now, dt: game.ctx.clock.dt, tick: game.ctx.clock.tick }) });
    await game.session.start(defaultSessionConfig()); // start() attend le boot
    expect([game.ctx.clock.now, game.ctx.clock.dt, game.ctx.clock.tick]).toEqual([0, 0, 0]);
    game.step(0.02);
    game.step(0.03);
    expect(seen.length).toBe(2);
    expect(seen[0]).toEqual({ now: 0.02, dt: 0.02, tick: 1 }); // pendant update, now = fin du pas
    expect(seen[1]!.now).toBeCloseTo(0.05, 12);
    expect(seen[1]!.tick).toBe(2);
    for (let i = 0; i < 300; i++) game.step(1 / 30);
    expect(game.ctx.clock.now).toBeCloseTo(10.05, 9);
    expect(game.ctx.clock.tick).toBe(302);
  });

  it('pause : la simulation et l\'horloge sont figées, puis reprennent', async () => {
    const log: string[] = [];
    const game = headlessGame();
    game.addSystem(spy('a', 100, log));
    await game.session.start(defaultSessionConfig());
    game.step(0.05);
    const t = game.ctx.clock.now;
    game.session.pause(true);
    log.length = 0;
    expect(game.step(1)).toBe(0);
    expect(log).toEqual([]);
    expect(game.ctx.clock.now).toBe(t);
    game.session.pause(false);
    expect(game.step(0.05)).toBe(1);
    expect(game.ctx.clock.now).toBeCloseTo(t + 0.05, 12);
  });

  it('avance rapide : clock.timeScale multiplie le temps simulé, toujours par pas ≤ 0,05 s', async () => {
    const dts: number[] = [];
    const game = headlessGame();
    game.addSystem({ id: 'a', order: 1, update: (dt) => void dts.push(dt) });
    await game.session.start(defaultSessionConfig());

    game.ctx.clock.timeScale = 8;
    expect(game.step(1 / 60)).toBe(3); // 0,133 s simulées → 3 pas
    expect(game.ctx.clock.now).toBeCloseTo(8 / 60, 12);
    for (const dt of dts) expect(dt).toBeLessThanOrEqual(MAX_STEP);

    // une seconde réelle à ×8, image par image
    const t0 = game.ctx.clock.now;
    for (let i = 0; i < 60; i++) game.step(1 / 60);
    expect(game.ctx.clock.now - t0).toBeCloseTo(8, 9);

    // ralenti
    dts.length = 0;
    game.ctx.clock.timeScale = 0.25;
    game.step(0.04);
    expect(dts).toEqual([0.01]);

    // échelle nulle ou invalide : rien n'avance
    const frozen = game.ctx.clock.now;
    for (const scale of [0, -3, Number.NaN]) {
      game.ctx.clock.timeScale = scale;
      expect(game.step(0.05)).toBe(0);
    }
    expect(game.ctx.clock.now).toBe(frozen);
  });

  it('le nombre de pas par image est borné ; le temps non simulé est comptabilisé', async () => {
    const game = headlessGame({ maxStepsPerFrame: 10 });
    let updates = 0;
    game.addSystem({ id: 'a', order: 1, update: () => void updates++ });
    await game.session.start(defaultSessionConfig());
    game.ctx.clock.timeScale = 64;
    expect(game.frame(0.1)).toBe(10); // 6,4 s demandées, 10 × 0,05 = 0,5 s simulées
    expect(updates).toBe(10);
    expect(game.ctx.clock.now).toBeCloseTo(0.5, 12);
    expect(game.stats.droppedTime).toBeCloseTo(5.9, 9);
    expect(game.stats.steps).toBe(10);
    // step() manuel : jamais borné, le temps demandé est simulé en entier
    game.ctx.clock.timeScale = 1;
    expect(game.step(60)).toBe(1200);
    expect(game.ctx.clock.now).toBeCloseTo(60.5, 9);
    expect(game.stats.droppedTime).toBeCloseTo(5.9, 9);
  });

  it('système mal formé : identifiant obligatoire, order invalide ramené à 0', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = headlessGame();
    expect(() => game.addSystem({ order: 1 } as GameSystem)).toThrow(/identifiant/);
    game.addSystem({ id: 'z', order: 10 });
    game.addSystem({ id: 'sans-ordre', order: Number.NaN });
    game.addSystem({ id: 'a', order: -5 });
    game.addSystem({ id: 'z', order: 20 }); // identifiant en double : simple avertissement
    await game.boot();
    expect(game.systems.map((s) => s.id)).toEqual(['a', 'sans-ordre', 'z', 'z', NEUTRAL_SYSTEM_ID]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('un système qui met fin à la session interrompt les pas restants de l\'image', async () => {
    const game = headlessGame();
    let updates = 0;
    game.addSystem({
      id: 'arbitre',
      order: 1,
      update: () => {
        updates++;
        if (updates === 2) game.session.end(true);
      },
    });
    await game.session.start(defaultSessionConfig());
    expect(game.step(0.5)).toBe(2); // 10 pas prévus, 2 exécutés
    expect(game.session.phase).toBe('debrief');
    expect(game.step(0.5)).toBe(0);
  });

  it('l\'index spatial des personnes est à jour à chaque pas, même sans module de locomotion', async () => {
    const game = headlessGame();
    const ctx = game.ctx;
    let found = -1;
    game.addSystem({ id: 'requête', order: SystemOrder.CONTROL, update: () => void (found = ctx.people.countIn(100, 0, 1)) });
    game.addSystem({ id: 'marche', order: SystemOrder.MOVEMENT, update: () => void (ctx.people.list[0]!.x += 20) });
    await game.session.start(defaultSessionConfig());
    ctx.people.spawn({ kind: 'passant', x: 0, z: 0 });
    for (let i = 0; i < 80; i++) ctx.people.spawn({ kind: 'passant', x: -500 - i * 4, z: 0 });
    for (let i = 0; i < 5; i++) game.step(0.03); // la personne avance de 20 m par pas
    expect(ctx.people.list[0]!.x).toBe(100);
    expect(found).toBe(0); // au 5e pas, la requête (avant le déplacement) la voit encore à 80 m
    game.step(0.03);
    expect(found).toBe(1); // au pas suivant, l'index a suivi
  });
});

describe('Game — frame() et boucle d\'affichage', () => {
  it('frame() n\'est jamais appelé en headless', async () => {
    const log: string[] = [];
    const game = headlessGame();
    game.addSystem(spy('a', 100, log));
    await game.session.start(defaultSessionConfig());
    log.length = 0;
    game.frame(0.02);
    game.step(0.02);
    expect(log).toEqual(['update:a', 'update:a']);
  });

  it('hors headless : frame(dtRéel) à chaque image, après la simulation, même au menu et en pause', async () => {
    const log: string[] = [];
    const frames: number[] = [];
    const game = windowedGame();
    expect(game.ctx.headless).toBe(false);
    game.addSystem(spy('rendu', SystemOrder.VIEW, log, { update: undefined, frame: (dt) => void (log.push('frame:rendu'), frames.push(dt)) }));
    game.addSystem(spy('sim', SystemOrder.MOVEMENT, log));
    await game.boot();
    log.length = 0;
    game.frame(0.016); // au menu
    expect(log).toEqual(['frame:sim', 'frame:rendu']);

    await game.session.start(defaultSessionConfig());
    game.ctx.clock.timeScale = 4;
    log.length = 0;
    frames.length = 0;
    game.frame(0.03); // 0,12 s simulées → 3 pas, puis une seule présentation
    expect(log).toEqual(['update:sim', 'update:sim', 'update:sim', 'frame:sim', 'frame:rendu']);
    expect(frames).toEqual([0.03]); // frame() reçoit le temps réel, pas le temps simulé

    game.session.pause(true);
    log.length = 0;
    game.frame(0.016);
    expect(log).toEqual(['frame:sim', 'frame:rendu']);
    // step() ne présente jamais
    game.session.pause(false);
    log.length = 0;
    game.step(0.01);
    expect(log).toEqual(['update:sim']);
  });

  it('run() pilote la boucle par requestAnimationFrame, avec un dt borné', async () => {
    const callbacks: ((t: number) => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const cancelled: number[] = [];
    vi.stubGlobal('cancelAnimationFrame', (id: number) => void cancelled.push(id));
    const tick = (t: number): void => callbacks.shift()!(t);

    const game = windowedGame();
    const frames: number[] = [];
    let updates = 0;
    game.addSystem({ id: 'a', order: 1, update: () => void updates++, frame: (dt) => void frames.push(dt) });
    await game.session.start(defaultSessionConfig());
    game.run();
    game.run(); // déjà lancée : sans effet
    expect(game.isRunning).toBe(true);
    expect(callbacks.length).toBe(1);

    tick(1000); // première image : dt = 0
    tick(1016);
    tick(1032);
    expect(frames.length).toBe(3);
    expect(frames[0]).toBe(0);
    expect(frames[1]).toBeCloseTo(0.016, 9);
    expect(updates).toBe(2);
    expect(game.ctx.clock.now).toBeCloseTo(0.032, 9);
    expect(game.stats.fps).toBeGreaterThan(55);
    expect(game.stats.fps).toBeLessThan(70);

    tick(9000); // onglet resté en arrière-plan 8 s : dt borné à 0,1 s
    expect(frames[3]).toBeCloseTo(0.1, 9);
    expect(game.ctx.clock.now).toBeCloseTo(0.132, 9);
    expect(game.stats.frames).toBe(4);

    game.stop();
    expect(game.isRunning).toBe(false);
    expect(cancelled.length).toBe(1);
    const pending = callbacks.shift();
    pending?.(9016); // une image déjà planifiée ne fait plus rien
    expect(frames.length).toBe(4);
  });

  it('run() est sans effet (avec avertissement) quand requestAnimationFrame n\'existe pas', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = headlessGame();
    await game.boot();
    game.run();
    expect(game.isRunning).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('dispose() arrête tout et appelle dispose() des systèmes en ordre inverse', async () => {
    const log: string[] = [];
    const game = headlessGame();
    game.addSystem(spy('a', 100, log)).addSystem(spy('b', 200, log));
    await game.session.start(defaultSessionConfig());
    log.length = 0;
    game.dispose();
    game.dispose();
    expect(log).toEqual(['dispose:b', 'dispose:a']);
    expect(game.step(0.05)).toBe(0);
  });
});

describe('Game — isolation des erreurs', () => {
  it('une exception dans update() est journalisée et n\'arrête pas les autres systèmes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log: string[] = [];
    const game = headlessGame();
    let fail = true;
    game.addSystem(spy('avant', 100, log));
    game.addSystem(spy('fragile', 200, log, {
      update: () => {
        if (fail) throw new Error('division par zéro');
        log.push('update:fragile');
      },
    }));
    game.addSystem(spy('après', 300, log));
    await game.session.start(defaultSessionConfig());
    log.length = 0;
    expect(() => game.step(0.02)).not.toThrow();
    expect(log).toEqual(['update:avant', 'update:après']);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toBe('[core] erreur dans update() du système « fragile »');
    expect((errors.mock.calls[0]![1] as Error).message).toBe('division par zéro');
    const perf = game.perf.find((p) => p.id === 'fragile')!;
    expect([perf.errors, perf.disabled]).toEqual([1, false]);

    // l'erreur disparaît : le système reprend normalement
    fail = false;
    log.length = 0;
    game.step(0.02);
    expect(log).toEqual(['update:avant', 'update:fragile', 'update:après']);
  });

  it('après 5 erreurs consécutives, le système est désactivé avec un message clair', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = headlessGame();
    let calls = 0;
    let healthy = 0;
    const disabled: unknown[] = [];
    game.ctx.events.onAny('core:system_disabled', (e) => disabled.push(e));
    game.addSystem({
      id: 'cassé',
      order: 100,
      update: () => {
        calls++;
        throw new Error('toujours en panne');
      },
      frame: () => void calls++,
    });
    game.addSystem({ id: 'sain', order: 200, update: () => void healthy++ });
    await game.session.start(defaultSessionConfig());
    for (let i = 0; i < 12; i++) game.step(0.02);
    expect(calls).toBe(MAX_CONSECUTIVE_ERRORS); // plus jamais appelé ensuite
    expect(healthy).toBe(12);
    const perf = game.perf.find((p) => p.id === 'cassé')!;
    expect([perf.disabled, perf.errors]).toEqual([true, 5]);
    const messages = errors.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('erreur dans update()')).length).toBe(5);
    expect(messages.at(-1)).toContain('système « cassé » désactivé après 5 erreurs consécutives dans update()');
    expect(disabled).toEqual([{ id: 'cassé', stage: 'update' }]);
  });

  it('des erreurs non consécutives ne désactivent pas le système', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = headlessGame();
    let n = 0;
    game.addSystem({
      id: 'intermittent',
      order: 100,
      update: () => {
        n++;
        if (n % 2 === 0) throw new Error('une fois sur deux');
      },
    });
    await game.session.start(defaultSessionConfig());
    for (let i = 0; i < 40; i++) game.step(0.02);
    expect(n).toBe(40);
    const perf = game.perf[0]!.id === 'intermittent' ? game.perf[0]! : game.perf[1]!;
    expect([perf.disabled, perf.errors]).toEqual([false, 20]);
  });

  it('les erreurs de frame() sont comptées séparément ; un système désactivé est réactivé à la session suivante', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = windowedGame();
    let updates = 0;
    let frames = 0;
    let broken = true;
    game.addSystem({
      id: 'rendu',
      order: 1000,
      update: () => void updates++,
      frame: () => {
        frames++;
        if (broken) throw new Error('contexte WebGL perdu');
      },
    });
    await game.session.start(defaultSessionConfig());
    for (let i = 0; i < 4; i++) game.frame(0.02);
    expect(game.perf.find((p) => p.id === 'rendu')!.disabled).toBe(false); // 4 erreurs de frame, update réussit entre-temps
    game.frame(0.02);
    expect(game.perf.find((p) => p.id === 'rendu')!.disabled).toBe(true);
    game.frame(0.02);
    expect([updates, frames]).toEqual([5, 5]); // ni update ni frame ne sont plus appelés

    broken = false;
    await game.session.start(defaultSessionConfig());
    expect(game.perf.find((p) => p.id === 'rendu')!.disabled).toBe(false);
    game.frame(0.02);
    expect([updates, frames]).toEqual([6, 6]);
  });

  it('une exception dans reset() n\'empêche pas la session de démarrer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log: string[] = [];
    const game = headlessGame();
    game.addSystem(spy('a', 100, log, {
      reset: () => {
        throw new Error('reset raté');
      },
    }));
    game.addSystem(spy('b', 200, log));
    await game.session.start(defaultSessionConfig());
    expect(game.session.phase).toBe('playing');
    expect(log).toContain('reset:b');
    expect(errors.mock.calls.some((c) => String(c[0]).includes('reset() du système « a »'))).toBe(true);
  });

  it('en mode strict, l\'exception est propagée (pour faire échouer les tests)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = headlessGame({ strict: true });
    game.addSystem({
      id: 'cassé',
      order: 1,
      update: () => {
        throw new Error('visible');
      },
    });
    await game.session.start(defaultSessionConfig());
    expect(() => game.step(0.02)).toThrow('visible');
    for (let i = 0; i < 10; i++) expect(() => game.step(0.02)).toThrow('visible'); // jamais désactivé en strict
  });
});

describe('Game — mesures', () => {
  it('temps par système (update et frame) et statistiques globales', async () => {
    const game = windowedGame();
    const burn = (ms: number): void => {
      const end = performance.now() + ms;
      while (performance.now() < end) { /* attente active */ }
    };
    game.addSystem({ id: 'lourd', order: 100, update: () => burn(3) });
    game.addSystem({ id: 'léger', order: 200, update: () => {} });
    game.addSystem({ id: 'rendu', order: 1000, frame: () => burn(2) });
    await game.session.start(defaultSessionConfig());
    game.frame(0.1); // 2 pas de simulation + 1 présentation
    const perf = Object.fromEntries(game.perf.map((p) => [p.id, p]));
    expect(perf['lourd']!.updateMs).toBeGreaterThanOrEqual(5.9); // 2 × 3 ms
    expect(perf['lourd']!.updateMs).toBeLessThan(60);
    expect(perf['lourd']!.frameMs).toBe(0);
    expect(perf['léger']!.updateMs).toBeLessThan(1);
    expect(perf['rendu']!.frameMs).toBeGreaterThanOrEqual(1.9);
    expect(perf['rendu']!.updateMs).toBe(0);
    expect(perf['lourd']!.avgUpdateMs).toBeGreaterThan(0);
    expect(game.stats.steps).toBe(2);
    expect(game.stats.simMs).toBeGreaterThanOrEqual(5.9);
    expect(game.stats.presentMs).toBeGreaterThanOrEqual(1.9);
    expect(game.stats.frameMs).toBeCloseTo(game.stats.simMs + game.stats.presentMs, 6);
    expect(game.stats.frames).toBe(1);
    // les mêmes mesures sont publiées pour l'interface : ctx.service<PerfApi>('perf')
    const api = game.ctx.require<PerfApi>(PERF_SERVICE);
    expect(api.systems).toBe(game.perf);
    expect(api.stats).toBe(game.stats);
    expect(api.systems.map((p) => p.id)).toEqual(['lourd', 'léger', NEUTRAL_SYSTEM_ID, 'rendu']);
    // l'image suivante remet les compteurs instantanés à zéro
    game.session.pause(true);
    game.frame(0.016);
    expect(perf['lourd']!.updateMs).toBe(0);
    expect(perf['lourd']!.avgUpdateMs).toBeGreaterThan(0); // la moyenne glissante, elle, décroît doucement
  });
});
