// Tests ADVERSES du cœur du moteur (4/4) : boucle, session et services — start/end/start, avance
// rapide ×8, durées absurdes, systèmes qui plantent, réentrance, déterminisme, 60 s avec 500 personnes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext, GameSystem, Person, PlaceInfo, SessionConfig } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { Game, MAX_CONSECUTIVE_ERRORS, MAX_STEP } from '@/core/game';
import { launchSessionConfig, parseLaunchParams } from '@/core/launch';
import { makeRayHit } from '@/core/null-services';
import { createRng } from '@/core/rng';
import { defaultSessionConfig } from '@/core/session';
import { DESKTOP_HINTS } from '@/core/settings';
import { createTestContext } from '@/core/testing';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function looseGame(extra: { maxStepsPerFrame?: number } = {}): Game {
  return new Game({ headless: true, storage: null, device: DESKTOP_HINTS, strict: false, ...extra });
}

/** Empreinte de l'état des personnes (positions arrondies au micromètre), pour comparer deux exécutions. */
function fingerprint(ctx: GameContext): string {
  let h = 0;
  for (const p of ctx.people.list) {
    h = (Math.imul(h, 31) + p.id) | 0;
    h = (Math.imul(h, 31) + Math.round(p.x * 1e6)) | 0;
    h = (Math.imul(h, 31) + Math.round(p.z * 1e6)) | 0;
    h = (Math.imul(h, 31) + Math.round(p.health * 1e3)) | 0;
  }
  return `${ctx.people.list.length}:${h}`;
}

/**
 * Petit module de foule pour les tests : marche aléatoire avec évitement des voisins, collisions
 * contre le décor, blessures, apparitions et retraits. N'utilise que le contrat (comme un vrai module).
 */
function crowdModule(count: number): { system: GameSystem; stats: { queries: number; removed: number; spawned: number } } {
  let ctx!: GameContext;
  let rng = null as ReturnType<GameContext['rng']['fork']> | null;
  const near: Person[] = [];
  const pos = { x: 0, z: 0 };
  const hit = makeRayHit();
  const stats = { queries: 0, removed: 0, spawned: 0 };
  const system: GameSystem = {
    id: 'test:foule',
    order: SystemOrder.MOVEMENT,
    init(c) {
      ctx = c;
      ctx.events.on('session:started', () => {
        rng = ctx.rng.fork('foule');
        for (let i = 0; i < count; i++) {
          ctx.people.spawn({ kind: i % 6 === 0 ? 'crs' : 'manifestant', x: rng.range(-25, 25), z: rng.range(-25, 25) });
        }
        for (let i = 0; i < 40; i++) ctx.props.spawn(i % 2 ? 'poubelle' : 'barriere_vauban', rng.range(-25, 25), rng.range(-25, 25), rng.range(0, 6));
        for (let i = 0; i < 6; i++) ctx.vehicles.spawn('fourgon_crs', -30 + i * 12, 28, 0);
      });
    },
    reset() {
      stats.queries = 0;
      stats.removed = 0;
      stats.spawned = 0;
    },
    update(dt) {
      const r = rng!;
      const list = ctx.people.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!;
        if (ctx.health.isIncapacitated(p)) continue;
        // changement de direction de temps en temps
        if (r.chance(dt * 0.5)) {
          const a = r.range(0, Math.PI * 2);
          p.cmd.moveX = Math.sin(a);
          p.cmd.moveZ = Math.cos(a);
        }
        // évitement : s'écarter des voisins trop proches
        let ax = p.cmd.moveX;
        let az = p.cmd.moveZ;
        const n = ctx.people.queryRadius(p.x, p.z, 1.2, near);
        stats.queries++;
        for (let k = 0; k < n; k++) {
          const q = near[k]!;
          if (q === p) continue;
          const dx = p.x - q.x;
          const dz = p.z - q.z;
          const d = Math.hypot(dx, dz) + 1e-6;
          ax += (dx / d) * (1.2 - d);
          az += (dz / d) * (1.2 - d);
        }
        const l = Math.hypot(ax, az);
        if (l > 1) {
          ax /= l;
          az /= l;
        }
        pos.x = p.x + ax * p.speedWalk * dt;
        pos.z = p.z + az * p.speedWalk * dt;
        ctx.world.resolveCircle(pos, p.radius);
        ctx.props.resolveCircle(pos, p.radius);
        ctx.vehicles.resolveCircle(pos, p.radius);
        p.x = pos.x;
        p.z = pos.z;
        p.heading = Math.atan2(ax, az);
        // un peu de violence et de mouvement d'effectif
        if (r.chance(dt * 0.02)) ctx.health.hurt(p, { amount: r.range(5, 60), kind: 'impact', sourceId: 0, x: p.x, z: p.z });
        if (r.chance(dt * 0.01)) {
          ctx.props.raycast(p.x, p.z, p.x + 10, p.z, hit, 'sight');
          ctx.vehicles.raycast(p.x, p.z, p.x, p.z + 10, hit);
          ctx.law.recordOffense(p, 'jet_projectile', p.x, p.z);
          ctx.projectiles.spawn('pave', p.id, p.x, 1.5, p.z, 1, 2, 3);
        }
        if (r.chance(dt * 0.01)) {
          ctx.people.remove(p.id);
          stats.removed++;
          ctx.people.spawn({ kind: 'manifestant', x: r.range(-25, 25), z: r.range(-25, 25) });
          stats.spawned++;
        }
      }
      while (ctx.projectiles.list.length > 30) ctx.projectiles.remove(ctx.projectiles.list[0]!.id);
    },
  };
  return { system, stats };
}

// ───────────────────────────── boucle et temps ─────────────────────────────

describe('adverse — boucle de simulation', () => {
  it('durées absurdes (infini, NaN, négatif, immense) : jamais de boucle sans fin ni d\'horloge corrompue', async () => {
    const game = looseGame();
    let ticks = 0;
    game.addSystem({
      id: 'garde-fou',
      order: 0,
      update: () => {
        // sans ce garde-fou, un moteur qui prendrait « Infinity » au pied de la lettre ne rendrait jamais la main
        if (++ticks >= 2000) game.session.end(false);
      },
    });
    await game.boot();
    await game.session.start(defaultSessionConfig());
    expect(game.step(Number.POSITIVE_INFINITY)).toBe(0);
    expect(game.step(Number.NaN)).toBe(0);
    expect(game.step(-5)).toBe(0);
    expect(game.step(0)).toBe(0);
    expect(game.frame(Number.POSITIVE_INFINITY)).toBe(0);
    expect(game.frame(Number.NaN)).toBe(0);
    expect(ticks).toBe(0);
    expect(game.ctx.clock.now).toBe(0);
    expect(game.session.phase).toBe('playing');
    // échelles de temps absurdes
    for (const scale of [Number.NaN, -1, 0]) {
      game.ctx.clock.timeScale = scale;
      expect(game.step(1)).toBe(0);
    }
    game.ctx.clock.timeScale = Number.POSITIVE_INFINITY; // bornée, pas infinie
    const steps = game.step(0.01);
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThanOrEqual(64);
    expect(Number.isFinite(game.ctx.clock.now)).toBe(true);
    expect(game.ctx.clock.dt).toBeLessThanOrEqual(MAX_STEP + 1e-12);
  });

  it('avance rapide ×8 : 10 s réelles = 80 s simulées, toujours par pas ≤ 0,05 s, sans dérive', async () => {
    const dts: number[] = [];
    const t = createTestContext({ systems: [{ id: 'sonde', order: 0, update: (dt) => void dts.push(dt) }] });
    await t.start();
    t.ctx.clock.timeScale = 8;
    for (let i = 0; i < 600; i++) t.game.step(1 / 60); // dix secondes d'images à 60 Hz
    expect(t.ctx.clock.now).toBeCloseTo(80, 6);
    expect(Math.max(...dts)).toBeLessThanOrEqual(MAX_STEP + 1e-12);
    expect(Math.min(...dts)).toBeGreaterThan(0.03); // pas égaux, pas de miettes
    expect(dts.length).toBe(600 * 3); // 0,1333 s simulée par image → 3 pas de 0,0444 s
    expect(t.ctx.clock.tick).toBe(dts.length);
    expect(dts.reduce((a, b) => a + b, 0)).toBeCloseTo(80, 6);
    // image complète (boucle d'affichage) : à 10 images/s, ×8 → 16 pas par image, rien d'abandonné
    const before = t.ctx.clock.now;
    expect(t.game.frame(0.1)).toBe(16);
    expect(t.ctx.clock.now - before).toBeCloseTo(0.8, 9);
    expect(t.game.stats.droppedTime).toBe(0);
    // la fin de session remet la vitesse normale ; la suivante démarre à ×1
    t.ctx.session.end();
    expect(t.ctx.clock.timeScale).toBe(1);
    t.ctx.clock.timeScale = 8; // réglé au menu : ne doit pas fuir dans la session suivante
    await t.start();
    expect(t.ctx.clock.timeScale).toBe(1);
  });

  it('avance rapide extrême : le nombre de pas par image est borné et le temps non simulé est comptabilisé', async () => {
    const game = looseGame({ maxStepsPerFrame: 10 });
    let n = 0;
    game.addSystem({ id: 'compteur', order: 0, update: () => void n++ });
    await game.boot();
    await game.session.start(defaultSessionConfig());
    game.ctx.clock.timeScale = 64;
    expect(game.frame(0.1)).toBe(10); // 6,4 s demandées, 0,5 s simulée
    expect(n).toBe(10);
    expect(game.ctx.clock.now).toBeCloseTo(0.5, 9);
    expect(game.stats.droppedTime).toBeCloseTo(5.9, 6);
  });

  it('step() ou frame() appelés depuis un update() : refusés, l\'horloge n\'est pas avancée deux fois', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = looseGame();
    let nested = -1;
    let updates = 0;
    game.addSystem({
      id: 'réentrant',
      order: 0,
      update: () => {
        updates++;
        nested = game.step(1) + game.frame(1);
      },
    });
    await game.boot();
    await game.session.start(defaultSessionConfig());
    expect(game.step(0.05)).toBe(1);
    expect(nested).toBe(0);
    expect(updates).toBe(1);
    expect(game.ctx.clock.tick).toBe(1);
    expect(game.ctx.clock.now).toBeCloseTo(0.05, 12);
    expect(error).toHaveBeenCalled();
  });
});

// ───────────────────────────── systèmes défaillants ─────────────────────────────

describe('adverse — systèmes qui plantent', () => {
  it('un système qui plante à chaque pas est isolé puis désactivé ; les autres ne manquent aucun pas', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = looseGame();
    let good = 0;
    let bad = 0;
    const disabled: unknown[] = [];
    game.addSystem({ id: 'avant', order: 10, update: () => void good++ });
    game.addSystem({
      id: 'bogué',
      order: 20,
      update: () => {
        bad++;
        throw new Error('pointeur nul');
      },
    });
    game.addSystem({ id: 'après', order: 30, update: () => void good++ });
    game.ctx.events.onAny('core:system_disabled', (e) => disabled.push(e));
    await game.boot();
    await game.session.start(defaultSessionConfig());
    expect(() => game.step(1)).not.toThrow(); // 20 pas
    expect(good).toBe(40);
    expect(bad).toBe(MAX_CONSECUTIVE_ERRORS);
    expect(disabled).toEqual([{ id: 'bogué', stage: 'update' }]);
    const perf = game.perf.find((p) => p.id === 'bogué')!;
    expect(perf.disabled).toBe(true);
    expect(perf.errors).toBe(MAX_CONSECUTIVE_ERRORS);
    // chaque erreur est signalée avec le nom du système, et la désactivation est annoncée
    const messages = error.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('bogué')).length).toBeGreaterThanOrEqual(MAX_CONSECUTIVE_ERRORS + 1);
    // nouvelle session : le système a de nouveau sa chance
    await game.session.start(defaultSessionConfig());
    expect(perf.disabled).toBe(false);
    game.step(0.05);
    expect(bad).toBe(MAX_CONSECUTIVE_ERRORS + 1);
  });

  it('plantages dans provide(), init() (synchrone, asynchrone), reset() et dispose() : le moteur démarre, tourne et s\'arrête', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = looseGame();
    const calls: string[] = [];
    const boom = (where: string) => (): never => {
      throw new Error(`panne dans ${where}`);
    };
    game.addSystem({ id: 'p', order: 1, provide: boom('provide'), init: () => void calls.push('init:p'), update: () => void calls.push('update:p') });
    game.addSystem({ id: 'i', order: 2, init: boom('init'), update: () => void calls.push('update:i') });
    game.addSystem({ id: 'a', order: 3, init: () => Promise.reject(new Error('panne asynchrone')), update: () => void calls.push('update:a') });
    game.addSystem({ id: 'r', order: 4, reset: boom('reset'), update: () => void calls.push('update:r') });
    game.addSystem({ id: 'd', order: 5, dispose: boom('dispose'), update: () => void calls.push('update:d') });
    game.addSystem({ id: 'ok', order: 6, init: () => void calls.push('init:ok'), dispose: () => void calls.push('dispose:ok'), update: () => void calls.push('update:ok') });
    await expect(game.boot()).resolves.toBeUndefined();
    await game.session.start(defaultSessionConfig());
    expect(game.session.phase).toBe('playing');
    game.step(0.05);
    // p, i et a ont échoué au démarrage : jamais mis à jour ; r, d et ok tournent
    expect(calls).toEqual(['init:ok', 'update:r', 'update:d', 'update:ok']);
    expect(game.perf.filter((p) => p.disabled).map((p) => p.id)).toEqual(['p', 'i', 'a']);
    await game.session.start(defaultSessionConfig()); // un système en échec au démarrage ne ressuscite pas
    expect(game.perf.filter((p) => p.disabled).map((p) => p.id)).toEqual(['p', 'i', 'a']);
    expect(() => game.dispose()).not.toThrow();
    expect(calls).toContain('dispose:ok');
    expect(error.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(game.step(1)).toBe(0); // moteur arrêté : plus rien ne tourne
  });

  it('un init() qui ne répond jamais est signalé par un avertissement nommant le système', async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const game = looseGame();
      let release!: () => void;
      game.addSystem({ id: 'lent', order: 1, init: () => new Promise<void>((r) => (release = r)) });
      const booting = game.boot();
      await vi.advanceTimersByTimeAsync(30000);
      expect(game.booted).toBe(false);
      expect(warn.mock.calls.some((c) => String(c[0]).includes('lent'))).toBe(true);
      release();
      await booting;
      expect(game.booted).toBe(true);
      const count = warn.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60000);
      expect(warn.mock.calls.length).toBe(count); // la surveillance s'arrête avec le démarrage
    } finally {
      vi.useRealTimers();
    }
  });

  it('en mode strict, une erreur d\'abonné pendant le vidage des magasins fait échouer le démarrage de session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = createTestContext();
    await t.start();
    t.ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const off = t.ctx.events.on('person:removed', () => {
      throw new Error('abonné défaillant');
    });
    await expect(t.start()).rejects.toThrow('abonné défaillant');
    expect(t.ctx.session.phase).toBe('menu');
    off();
    await t.start(); // toujours utilisable ensuite
    expect(t.ctx.session.phase).toBe('playing');
    expect(t.ctx.people.list.length).toBe(0);
  });
});

// ───────────────────────────── session ─────────────────────────────

describe('adverse — session', () => {
  it('start / end / start : la deuxième session repart d\'un état rigoureusement neuf', async () => {
    const crowd = crowdModule(120);
    const log: string[] = [];
    const t = createTestContext({ seed: 5, systems: [crowd.system] });
    const ctx = t.ctx;
    ctx.events.on('session:started', () => log.push('started'));
    ctx.events.on('session:ended', (e) => log.push(`ended:${e.toDebrief}`));

    await t.start({ seed: 5 });
    const firstIds = ctx.people.list.map((p) => p.id);
    t.step(8);
    const first = fingerprint(ctx);
    const firstNow = ctx.clock.now;
    // la session laisse des traces partout
    const squad = ctx.squads.create('groupe', 'police', 'Alpha 1');
    ctx.squads.addMember(squad.id, ctx.people.list[0]!.id);
    ctx.player.possess(ctx.people.list[0]!.id, 'commandant');
    ctx.law.authorize(4, 0);
    ctx.radio.say({ channel: 'unite', from: 'Alpha', text: 'En place.', priority: 1 });
    ctx.ui.open('pause');
    ctx.props.addShop({ category: 'banque', x: 0, z: 0, heading: 0, width: 5 });
    ctx.clock.timeScale = 8;

    ctx.session.end(false);
    expect(ctx.session.phase).toBe('menu');
    expect(ctx.session.config).toBeNull();
    expect(t.game.step(1)).toBe(0); // rien ne tourne au menu
    expect(ctx.clock.now).toBe(firstNow);

    // un abonné qui tire au sort pendant le vidage des magasins ne doit pas décaler la suite de la session suivante
    const offDraw = ctx.events.on('person:removed', () => void ctx.rng.next());
    await t.start({ seed: 5 });
    offDraw();
    expect(ctx.rng.next()).toBe(createRng(5).next());
    expect(log).toEqual(['started', 'ended:false', 'started']);
    expect(ctx.clock.now).toBe(0);
    expect(ctx.clock.tick).toBe(0);
    expect(ctx.clock.timeScale).toBe(1);
    expect(ctx.people.list.map((p) => p.id)).toEqual(firstIds); // mêmes identifiants : la numérotation repart
    expect(ctx.squads.list.length).toBe(0);
    expect(ctx.props.shops.length).toBe(0);
    expect(ctx.projectiles.list.length).toBe(0);
    expect(ctx.player.state.personId).toBe(0);
    expect(ctx.player.state.role).toBe('crs');
    expect(ctx.law.roe.authorizedForce).toBe(1);
    expect(ctx.radio.log.length).toBe(0);
    expect(ctx.ui.current).toBeNull();
    expect(ctx.people.list.every((p) => p.squadId === 0 && !p.isPlayer && p.offenses.length === 0 && p.health === 100)).toBe(true);
    t.step(8);
    expect(fingerprint(ctx)).toBe(first); // même graine → même déroulement, au micromètre
    expect(ctx.clock.now).toBeCloseTo(firstNow, 9);

    // et par le compte rendu : end(true) puis start, sans second « session:ended »
    ctx.session.end(true);
    expect(ctx.session.phase).toBe('debrief');
    expect(ctx.session.config).not.toBeNull();
    await t.start({ seed: 6 });
    expect(log).toEqual(['started', 'ended:false', 'started', 'ended:true', 'started']);
    t.step(8);
    expect(fingerprint(ctx)).not.toBe(first); // autre graine → autre déroulement
  });

  it('deux moteurs distincts de même graine donnent la même simulation ; graine différente, une autre', async () => {
    const run = async (seed: number): Promise<string> => {
      const t = createTestContext({ seed, systems: [crowdModule(150).system] });
      await t.start({ seed });
      t.step(12);
      return fingerprint(t.ctx);
    };
    const [a, b, c] = await Promise.all([run(21), run(21), run(22)]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('démarrages en rafale, sans attendre : une seule session naît, toujours la dernière demandée', async () => {
    const t = createTestContext();
    const started: number[] = [];
    const ended: boolean[] = [];
    t.ctx.events.on('session:started', (e) => started.push(e.config.seed));
    t.ctx.events.on('session:ended', (e) => ended.push(e.toDebrief));
    await Promise.all([1, 2, 3, 4, 5].map((seed) => t.ctx.session.start(defaultSessionConfig({ seed }))));
    expect(started).toEqual([5]);
    expect(ended).toEqual([]);
    expect(t.ctx.session.phase).toBe('playing');
    expect(t.ctx.session.config!.seed).toBe(5);
    // rafale pendant une session en cours : une fin, un début
    await Promise.all([6, 7].map((seed) => t.ctx.session.start(defaultSessionConfig({ seed }))));
    expect(started).toEqual([5, 7]);
    expect(ended).toEqual([false]);
  });

  it('fin ou redémarrage depuis un abonné de session:started : tout début a sa fin, aucun état bancal', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    const log: string[] = [];
    ctx.events.on('session:started', (e) => log.push(`started:${e.config.seed}`));
    ctx.events.on('session:ended', () => log.push('ended'));
    // un module de mission refuse la configuration et met fin à la session dès son début
    const off = ctx.events.on('session:started', () => ctx.session.end(false));
    await ctx.session.start(defaultSessionConfig({ seed: 1 }));
    off();
    expect(ctx.session.phase).toBe('menu');
    expect(ctx.session.config).toBeNull();
    expect(log).toEqual(['started:1', 'ended']); // les modules qui se sont installés au début sont prévenus de la fin
    expect(t.game.step(1)).toBe(0);

    // un module relance une autre session depuis session:started (changement de mission à la volée)
    log.length = 0;
    let once = true;
    const off2 = ctx.events.on('session:started', () => {
      if (once) {
        once = false;
        void ctx.session.start(defaultSessionConfig({ seed: 3 }));
      }
    });
    await ctx.session.start(defaultSessionConfig({ seed: 2 }));
    await new Promise<void>((r) => setTimeout(r, 0)); // laisse le second démarrage (asynchrone) aboutir
    off2();
    expect(log).toEqual(['started:2', 'ended', 'started:3']);
    expect(ctx.session.phase).toBe('playing');
    expect(ctx.session.config!.seed).toBe(3);
  });

  it('un système met fin à la session, ou la relance, depuis son update() : pas de pas fantôme', async () => {
    const game = looseGame();
    const log: string[] = [];
    let mode: 'end' | 'restart' | 'none' = 'none';
    game.addSystem({
      id: 'arbitre',
      order: 10,
      reset: () => void log.push('reset'),
      update: () => {
        log.push(`update@${game.ctx.clock.tick}`);
        if (mode === 'end' && game.ctx.clock.tick === 3) game.session.end(true);
        if (mode === 'restart' && game.ctx.clock.tick === 2) void game.session.start(defaultSessionConfig({ seed: 9 }));
      },
    });
    await game.boot();
    await game.session.start(defaultSessionConfig());
    mode = 'end';
    expect(game.step(1)).toBe(3); // 20 pas demandés, 3 exécutés
    expect(game.session.phase).toBe('debrief');
    expect(game.step(1)).toBe(0);

    await game.session.start(defaultSessionConfig());
    log.length = 0;
    mode = 'restart';
    game.step(0.1); // 2 pas ; le second demande un redémarrage (asynchrone)
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(game.session.phase).toBe('playing');
    expect(game.session.config!.seed).toBe(9);
    expect(game.ctx.clock.tick).toBe(0);
    mode = 'none';
    game.step(0.05);
    expect(log).toEqual(['update@1', 'update@2', 'reset', 'update@1']);
  });

  it('un abonné qui recrée des entités pendant la remise à zéro ne laisse ni fantôme ni identifiant en double', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    for (let i = 0; i < 20; i++) ctx.people.spawn({ kind: 'manifestant', x: i, z: 0 });
    for (let i = 0; i < 5; i++) ctx.props.spawn('poubelle', i, 3, 0);
    // module « réapparition » bogué : chaque retrait fait naître un remplaçant, même pendant le vidage
    let respawn = true;
    ctx.events.on('person:removed', (e) => {
      if (respawn) ctx.people.spawn({ kind: 'manifestant', x: e.id, z: 9 });
    });
    ctx.events.on('prop:removed', (e) => {
      if (respawn) ctx.props.spawn('debris', e.id, 9, 0);
    });
    let budget = 60; // le bogue s'épuise de lui-même après quelques dizaines de créations
    ctx.events.on('person:spawned', () => {
      if (--budget <= 0) respawn = false;
    });
    await t.start();
    expect(ctx.people.list.length).toBe(0);
    expect(ctx.props.list.length).toBe(0);
    expect(ctx.people.countIn(0, 0, 1e6)).toBe(0);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('remise à zéro'))).toBe(true);
    // la nouvelle session numérote depuis 1, et chaque identifiant désigne bien son entité
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const b = ctx.props.spawn('poubelle', 1, 0, 0);
    const c = ctx.people.spawn({ kind: 'crs', x: 2, z: 0 });
    expect([a.id, b.id, c.id]).toEqual([1, 2, 3]);
    expect(ctx.people.get(1)).toBe(a);
    expect(ctx.props.get(2)).toBe(b);
    expect(ctx.people.get(3)).toBe(c);
    expect(ctx.people.get(2)).toBeUndefined();
    expect(ctx.people.list).toEqual([a, c]);
  });

  it('configurations de session invalides : assainies avant d\'atteindre les modules', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = createTestContext();
    const seen: SessionConfig[] = [];
    t.ctx.events.on('session:started', (e) => void seen.push(e.config));
    const hostile = {
      ...defaultSessionConfig(),
      crowdSize: Number.NaN, tension: 7, volatility: -3, timeOfDay: Number.POSITIVE_INFINITY, seed: Number.NaN,
      weather: 'tornade', duration: 'éternelle', x: Number.NaN, z: 12,
    } as unknown as SessionConfig;
    await t.ctx.session.start(hostile);
    const cfg = seen[0]!;
    expect(cfg.crowdSize).toBe(0);
    expect(cfg.tension).toBe(1);
    expect(cfg.volatility).toBe(0);
    expect(cfg.timeOfDay >= 0 && cfg.timeOfDay < 24).toBe(true);
    expect(Number.isFinite(cfg.seed)).toBe(true);
    expect(cfg.weather).toBe('clair');
    expect(cfg.duration).toBe('standard');
    expect(Number.isFinite(cfg.x) && Number.isFinite(cfg.z)).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(t.ctx.session.phase).toBe('playing');
    // la configuration de l'appelant n'est pas modifiée
    expect(Number.isNaN(hostile.crowdSize)).toBe(true);
    // valeurs limites légitimes conservées telles quelles
    await t.start({ crowdSize: 2500.4, tension: 1, volatility: 0, timeOfDay: 23.99, seed: -12, duration: 'temps_reel', weather: 'orage' });
    expect(seen[1]).toMatchObject({ crowdSize: 2500, tension: 1, volatility: 0, timeOfDay: 23.99, seed: -12, duration: 'temps_reel', weather: 'orage' });
  });

  it('mode libre : rôle, grade et mission choisis arrivent tels quels aux modules, commandant d\'emblée compris', async () => {
    const t = createTestContext();
    const seen: SessionConfig[] = [];
    t.ctx.events.on('session:started', (e) => seen.push({ ...e.config }));
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', missionId: 'manif_republique', crowdSize: 800, tension: 0.4, volatility: 0.7, duration: 'longue' });
    expect(seen[0]).toMatchObject({ mode: 'libre', role: 'commandant', rank: 'commandant', missionId: 'manif_republique', crowdSize: 800, tension: 0.4, volatility: 0.7, duration: 'longue' });
    // grade par défaut cohérent avec le rôle quand il n'est pas précisé
    expect(defaultSessionConfig({ role: 'commandant' }).rank).toBe('commandant');
    expect(defaultSessionConfig({ role: 'crs' }).rank).toBe('gardien');
    expect(defaultSessionConfig({ role: 'chef_groupe' }).rank).toBe('brigadier_chef');
    expect(defaultSessionConfig({ role: 'manifestant' }).rank).toBeNull();
    expect(defaultSessionConfig({ role: 'journaliste' }).rank).toBeNull();
    expect(defaultSessionConfig({ role: 'crs', rank: 'major' }).rank).toBe('major'); // un choix explicite prime
    // des champs « undefined » ne détruisent pas les valeurs par défaut
    const partial = defaultSessionConfig({ seed: undefined, mode: undefined, weather: undefined } as unknown as Partial<SessionConfig>);
    expect(partial).toMatchObject({ seed: 1, mode: 'test', weather: 'clair' });
    // lancement par l'URL : mode libre, commandant, mission choisie
    const launch = parseLaunchParams('?autostart=paris&mode=libre&role=commandant&mission=manif_bastille&crowd=1200&tension=0.6&duration=courte');
    const cfg = launchSessionConfig(launch);
    expect(cfg).toMatchObject({ mode: 'libre', role: 'commandant', rank: 'commandant', missionId: 'manif_bastille', crowdSize: 1200, tension: 0.6, duration: 'courte' });
    expect(launchSessionConfig(parseLaunchParams('?autostart=paris')).mode).toBe('monde_ouvert');
    expect(launchSessionConfig(parseLaunchParams('?autostart=test&mode=nimporte')).mode).toBe('test');
    // une URL en partie illisible ne fait pas perdre les paramètres valides qui suivent
    const messy = parseLaunchParams('?autostart=test&place=%E0%A4%A&seed=77&role=bravm&&=x&quality=bas');
    expect(messy).toMatchObject({ autostart: 'test', seed: 77, role: 'bravm', quality: 'bas' });
    // createTestContext : un lieu demandé n'est pas écrasé par le point de départ par défaut
    const u = createTestContext();
    const bastille: PlaceInfo = { id: 1, name: 'place de la Bastille', kind: 'square', x: 3300, z: 1400, radius: 90 };
    u.ctx.world = { ...u.ctx.world, placeByName: (n: string) => (n === bastille.name ? bastille : null) };
    const started = await u.start({ place: 'place de la Bastille' });
    expect([started.x, started.z]).toEqual([3300, 1400]);
  });
});

// ───────────────────────────── services et endurance ─────────────────────────────

/** Toutes les propriétés de GameContext et les membres de chaque service, d'après contracts.ts. */
const CONTEXT_SHAPE: Record<string, readonly string[]> = {
  events: ['on', 'once', 'emit', 'onAny', 'emitAny'],
  clock: ['now', 'dt', 'tick', 'timeScale'],
  rng: ['next', 'range', 'int', 'chance', 'pick', 'fork'],
  settings: ['values', 'set', 'reset'],
  save: ['read', 'write', 'remove', 'exportAll', 'importAll', 'wipe'],
  session: ['phase', 'config', 'start', 'end', 'pause'],
  people: ['list', 'get', 'spawn', 'remove', 'clear', 'queryRadius', 'nearest', 'countIn', 'rebuildIndex'],
  projectiles: ['list', 'get', 'spawn', 'remove', 'nearestPickable', 'clear'],
  vehicles: ['list', 'defs', 'def', 'get', 'spawn', 'remove', 'clear', 'queryRadius', 'enter', 'exit', 'damage', 'fireTurret', 'resolveCircle', 'raycast'],
  props: ['list', 'shops', 'addShop', 'removeShop', 'get', 'shop', 'spawn', 'remove', 'clear', 'queryRadius', 'shopsNear', 'damage', 'damageShop', 'loot', 'push', 'tag', 'resolveCircle', 'raycast'],
  squads: ['list', 'get', 'create', 'remove', 'addMember', 'removeMember', 'setLeader', 'issue', 'childrenOf', 'clear'],
  world: [
    'ready', 'bounds', 'tileSize', 'attribution', 'heightAt', 'surfaceAt', 'buildingHeightAt', 'waterLevel', 'resolveCircle', 'isFree',
    'raycast', 'lineOfSight', 'nodeCount', 'edgeCount', 'node', 'edge', 'nearestRoad', 'findPath', 'randomFreePoint', 'places',
    'landmarks', 'placeByName', 'sectorName', 'setFocus', 'isLoaded', 'whenLoaded', 'shopsInTile', 'furnitureInTile',
  ],
  env: ['state', 'setTime', 'setWeather', 'setClockScale', 'setWind'],
  hazards: ['emitGas', 'emitSmoke', 'gasAt', 'smokeAt', 'ignite', 'fireAt', 'douse', 'visibility', 'clear'],
  health: ['hurt', 'heal', 'setDown', 'isIncapacitated'],
  actions: ['def', 'defs', 'activeItem', 'select', 'selectById', 'use', 'setAlt', 'canUse', 'solveAim', 'give', 'remove', 'has'],
  interactions: ['register', 'options', 'start', 'startVerb', 'cancel', 'current'],
  archetypes: ['spawn', 'equip'],
  law: ['roe', 'forceLog', 'recordOffense', 'worstOffense', 'canArrest', 'sommation', 'sommationText', 'authorize', 'reportForce', 'reset'],
  director: ['phase', 'tension', 'tensionAt', 'addTension', 'stats', 'route', 'headProgress'],
  radio: ['say', 'log', 'clear'],
  player: ['state', 'person', 'vehicle', 'possess', 'setCameraMode', 'toggleCamera'],
  input: ['device', 'moveX', 'moveY', 'lookX', 'lookY', 'throttle', 'brake', 'wheel', 'pointerLocked', 'down', 'pressed', 'released', 'rumble'],
  ui: ['notify', 'subtitle', 'banner', 'open', 'close', 'modal', 'current'],
  audio: ['play', 'stop', 'speak', 'setListener'],
};

describe('adverse — services du contexte et endurance', () => {
  it('TOUS les services de GameContext sont présents, complets et neutres (aucun effet, aucune exception)', async () => {
    const t = createTestContext();
    const ctx = t.ctx as unknown as Record<string, Record<string, unknown>>;
    for (const [service, members] of Object.entries(CONTEXT_SHAPE)) {
      expect(ctx[service], `ctx.${service}`).toBeTruthy();
      for (const m of members) expect(ctx[service]![m], `ctx.${service}.${m}`).not.toBeUndefined();
    }
    for (const fn of ['provide', 'service', 'require', 'newId']) expect(typeof ctx[fn], `ctx.${fn}`).toBe('function');
    expect(t.ctx.headless).toBe(true);
    expect(t.ctx.view).toBeNull();
    await t.start();
    const c = t.ctx;
    const p = c.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const q = c.archetypes.spawn('manifestant', 3, 0, { profile: 'radical' });
    const v = c.vehicles.spawn('canon_eau', 10, 0, 0);
    const o = c.props.spawn('poubelle', 5, 5, 0);
    const shop = c.props.addShop({ category: 'luxe', x: 0, z: 9, heading: 0, width: 6 });
    const hit = makeRayHit();
    const pos = { x: 1, z: 1 };
    const path: number[] = [];
    // chaque méthode neutre répond par une valeur saine
    expect(() => {
      c.hazards.emitGas(0, 0, 1, 5);
      c.hazards.emitSmoke(0, 0, 1, 5, 0x222222);
      c.hazards.ignite(0, 0, 2, 1, p.id);
      c.hazards.douse(0, 0, 2, 1);
      c.hazards.clear();
      c.director.addTension(0.5, 0, 0, 'essai');
      c.audio.stop(c.audio.play('sifflet', { x: 0, z: 0 }), 0.2);
      c.audio.speak('Dispersez-vous.', { radio: true });
      c.audio.setListener(0, 1.7, 0, 0);
      c.ui.notify('essai', 'warn', 2);
      c.ui.subtitle('Alpha', 'Reçu.', 2);
      c.ui.banner('Mission', 'Place de la Concorde', 3);
      c.ui.close();
      c.input.rumble(1, 0.2);
      c.archetypes.equip(p, 'lanceur');
      c.archetypes.equip(q, 'pilleur');
      c.actions.setAlt(p, true);
      c.player.possess(p.id, 'crs');
      c.player.toggleCamera();
      c.player.setCameraMode('tactical');
      c.env.setTime(21);
      c.env.setWeather('averse', true);
      c.radio.say({ channel: 'commandement', from: 'Autorité', text: 'Dernière sommation.', priority: 2 });
      c.props.tag(o, q.id);
      c.props.tag(shop, q.id);
      c.props.damageShop(shop, 40, 'blunt', q.id);
      c.vehicles.damage(v, { amount: 10, kind: 'impact', sourceId: q.id, x: 10, z: 0 });
      c.world.setFocus(0, 0);
    }).not.toThrow();
    expect([c.hazards.gasAt(0, 0), c.hazards.smokeAt(0, 0), c.hazards.fireAt(0, 0), c.hazards.visibility(0, 0, 9, 9)]).toEqual([0, 0, 0, 1]);
    expect([c.director.phase, c.director.tension, c.director.tensionAt(0, 0), c.director.headProgress, c.director.route.length]).toEqual(['aucune', 0, 0, 0, 0]);
    expect([c.input.moveX, c.input.moveY, c.input.lookX, c.input.down('primary'), c.input.pressed('jump'), c.input.released('pause')]).toEqual([0, 0, 0, false, false, false]);
    expect([c.ui.modal, c.world.heightAt(3, 3), c.world.isFree(0, 0, 1), c.world.lineOfSight(0, 0, 9, 9), c.world.resolveCircle(pos, 0.3)]).toEqual([false, 0, true, true, false]);
    expect(c.world.raycast(0, 0, 9, 9, hit)).toBe(false);
    expect(c.world.findPath(0, 0, 9, 9, 'foot', path)).toBe(true);
    expect(path).toEqual([0, 0, 9, 9]);
    expect(c.world.placeByName('place de la Concorde')).toBeNull();
    expect(typeof c.world.sectorName(0, 0)).toBe('string');
    await expect(c.world.whenLoaded(0, 0, 250)).resolves.toBeUndefined();
    expect(c.actions.use(p).ok).toBe(false);
    expect(c.actions.canUse(p)).toBe(false);
    expect(c.actions.give(p, 'bouclier', 1).count).toBe(1);
    expect(c.actions.has(p, 'bouclier')).toBe(1);
    expect(c.interactions.options(p, [])).toBe(0);
    expect(c.interactions.startVerb(p, 'menotter', q.id)).toBe(false);
    expect(c.law.sommationText(3)).toMatch(/Dernière sommation/);
    expect(c.law.canArrest(q)).toBe(false);
    expect(c.law.reportForce(p, 'baton', q, 3, 0).kind).toBe('licite');
    expect(c.vehicles.fireTurret(v, 0, p.id)).toBe(false); // gabarit générique : pas de tourelle
    expect(c.props.loot(shop, q.id)).toBeGreaterThan(0); // vitrine brisée à l'instant
    expect(c.env.state.isNight).toBe(true);
    expect(c.env.state.rain).toBe(1);
    expect(c.player.person()).toBe(p);
    expect(() => c.require('service.inexistant')).toThrow(/service.inexistant/);
    expect(c.service('service.inexistant')).toBeUndefined();
    t.step(1);
    expect(c.clock.now).toBeCloseTo(1, 9);
  });

  it('60 secondes de simulation avec 500 personnes, des objets, des véhicules et du roulement : aucune erreur', async () => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    const crowd = crowdModule(500);
    const t = createTestContext({ seed: 2025, systems: [crowd.system] });
    const ctx = t.ctx;
    let busErrors = 0;
    ctx.events.onAny('core:system_disabled', () => void busErrors++);
    await t.start({ seed: 2025, crowdSize: 500, tension: 0.5, volatility: 0.5 });
    expect(ctx.people.list.length).toBe(500);
    const t0 = performance.now();
    t.step(60); // 1 800 pas de 1/30 s, en mode strict : la moindre exception fait échouer le test
    const ms = performance.now() - t0;
    console.log(
      `[adverse] 60 s simulées, 500 personnes (évitement, collisions décor et véhicules, retraits et apparitions) : ${ms.toFixed(0)} ms ` +
        `soit ${(ms / 1800).toFixed(3)} ms par pas | ${crowd.stats.queries} requêtes de voisinage | ${crowd.stats.removed} retraits`,
    );
    expect(ctx.clock.now).toBeCloseTo(60, 6);
    expect(ctx.clock.tick).toBe(1800);
    expect(ctx.session.phase).toBe('playing');
    expect(ctx.people.list.length).toBe(500);
    expect(crowd.stats.removed).toBeGreaterThan(50);
    expect(crowd.stats.queries).toBeGreaterThan(400000);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(busErrors).toBe(0);
    expect(t.game.perf.every((p) => !p.disabled && p.errors === 0)).toBe(true);
    // état sain : tout le monde est quelque part, les magasins sont cohérents
    const ids = new Set<number>();
    for (const p of ctx.people.list) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.health)).toBe(true);
      expect(Math.abs(p.x) < 500 && Math.abs(p.z) < 500).toBe(true);
      expect(ctx.people.get(p.id)).toBe(p);
      ids.add(p.id);
    }
    expect(ids.size).toBe(500);
    expect(ctx.people.countIn(0, 0, 1e6)).toBe(500);
    expect(ctx.projectiles.list.length).toBeLessThanOrEqual(30);
  }, 120000);
});
