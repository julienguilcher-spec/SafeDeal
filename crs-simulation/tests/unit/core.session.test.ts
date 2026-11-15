import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSystem, PlaceInfo, SessionConfig, WorldQuery } from '@/core/contracts';
import { getCore } from '@/core/context';
import { DEBUG_GLOBAL, installDebugApi } from '@/core/debug';
import { Game } from '@/core/game';
import { LAUNCH_SERVICE, launchSessionConfig, parseLaunchParams } from '@/core/launch';
import { createRng } from '@/core/rng';
import { START_LOAD_RADIUS, defaultSessionConfig, sessionDurationSeconds } from '@/core/session';
import type { SessionPhaseEvent } from '@/core/session';
import { DESKTOP_HINTS } from '@/core/settings';
import { createTestContext } from '@/core/testing';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Monde factice : journalise les appels et permet de retarder le chargement. */
function fakeWorld(base: WorldQuery, log: string[], gate?: Promise<void>): WorldQuery {
  const place: PlaceInfo = { id: 1, name: 'place de la République', kind: 'square', x: 1200, z: -300, radius: 80 };
  return {
    ...base,
    places: [place],
    placeByName: (name: string) => (name.toLowerCase() === place.name.toLowerCase() ? place : null),
    setFocus: (x: number, z: number) => void log.push(`setFocus:${x},${z}`),
    whenLoaded: async (x: number, z: number, r: number) => {
      log.push(`whenLoaded:${x},${z},${r}`);
      if (gate) await gate;
      log.push('chargé');
    },
  };
}

describe('session — déroulement complet en headless', () => {
  it('start : loading → reset des systèmes → chargement du monde → session:started → playing', async () => {
    const log: string[] = [];
    const t = createTestContext({
      seed: 5,
      systems: [
        { id: 'a', order: 100, reset: () => void log.push('reset:a') },
        { id: 'b', order: 200, reset: () => void log.push('reset:b') },
      ],
    });
    const ctx = t.ctx;
    ctx.world = fakeWorld(ctx.world, log);
    ctx.events.onAny('session:phase', (e) => {
      const ev = e as SessionPhaseEvent;
      log.push(`phase:${ev.previous}>${ev.phase}`);
    });
    ctx.events.on('session:started', (e) => log.push(`started:${ctx.session.phase}:${e.config.x},${e.config.z}`));
    expect(ctx.session.phase).toBe('menu');
    expect(ctx.session.config).toBeNull();

    const cfg = await t.start({ place: 'Place de la République', x: undefined, z: undefined, timeOfDay: 21, weather: 'pluie' });
    expect(log).toEqual([
      'phase:menu>loading',
      'reset:a', 'reset:b',
      'setFocus:1200,-300',
      `whenLoaded:1200,-300,${START_LOAD_RADIUS}`,
      'chargé',
      'started:loading:1200,-300', // émis avant le passage en « playing »
      'phase:loading>playing',
    ]);
    expect(START_LOAD_RADIUS).toBe(250);
    expect(ctx.session.phase).toBe('playing');
    expect(ctx.session.config).toBe(cfg);
    expect([cfg.x, cfg.z, cfg.mode, cfg.seed]).toEqual([1200, -300, 'test', 5]); // point de départ résolu recopié
    // heure et météo de la configuration appliquées à l'environnement
    expect([ctx.env.state.timeOfDay, ctx.env.state.weather]).toEqual([21, 'pluie']);
  });

  it('point de départ : coordonnées prioritaires, sinon lieu, sinon centre du monde', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log: string[] = [];
    const t = createTestContext();
    t.ctx.world = fakeWorld(t.ctx.world, log);
    let cfg = await t.start({ place: 'place de la République', x: 10, z: 20 });
    expect([cfg.x, cfg.z]).toEqual([10, 20]);
    cfg = await t.start({ place: 'lieu inexistant', x: undefined, z: undefined });
    expect([cfg.x, cfg.z]).toEqual([0, 0]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('lieu inexistant');
    cfg = await t.start({ place: '', x: undefined, z: undefined });
    expect([cfg.x, cfg.z]).toEqual([0, 0]);
    // monde dont l'emprise ne contient pas l'origine : départ au centre de l'emprise
    t.ctx.world = { ...t.ctx.world, bounds: { minX: 100, minZ: 200, maxX: 300, maxZ: 600 } };
    cfg = await t.start({ place: '', x: undefined, z: undefined });
    expect([cfg.x, cfg.z]).toEqual([200, 400]);
    // la configuration fournie n'est pas modifiée
    const mine = defaultSessionConfig({ place: 'place de la République' });
    await t.ctx.session.start(mine);
    expect(mine.x).toBeUndefined();
    expect(t.ctx.session.config).not.toBe(mine);
    expect(t.ctx.session.config!.x).toBe(1200);
  });

  it('start remet à zéro horloge, identifiants, générateur aléatoire, magasins et journaux', async () => {
    const t = createTestContext({ seed: 9 });
    const ctx = t.ctx;
    await t.start({ seed: 77 });
    const firstRandom = [ctx.rng.next(), ctx.rng.next(), ctx.rng.next()];
    const cop = ctx.people.spawn({ kind: 'commissaire', x: 0, z: 0 });
    const firstId = cop.id;
    const firstLook = { ...cop.look };
    ctx.vehicles.spawn('voiture', 5, 5, 0);
    ctx.props.spawn('poubelle', 1, 1, 0);
    getCore(ctx).stores.props.addShop({ category: 'banque', x: 0, z: 9, heading: 0, width: 5 });
    ctx.projectiles.spawn('pave', 0, 0, 1, 0, 0, 0, 0);
    const sq = ctx.squads.create('groupe', 'police', 'Alpha');
    ctx.squads.addMember(sq.id, cop.id);
    ctx.law.sommation(cop);
    ctx.law.reportForce(cop, 'lacrymo', null, 0, 0);
    ctx.radio.say({ channel: 'unite', from: 'Alpha', text: 'Essai', priority: 1 });
    ctx.player.possess(cop.id, 'commissaire');
    ctx.clock.timeScale = 4;
    t.step(3);
    expect(ctx.clock.now).toBeCloseTo(12, 9);

    await t.start({ seed: 77 });
    expect([ctx.clock.now, ctx.clock.tick, ctx.clock.dt, ctx.clock.timeScale]).toEqual([0, 0, 0, 1]);
    expect([ctx.people.list.length, ctx.vehicles.list.length, ctx.props.list.length, ctx.props.shops.length]).toEqual([0, 0, 0, 0]);
    expect([ctx.projectiles.list.length, ctx.squads.list.length]).toEqual([0, 0]);
    expect([ctx.law.roe.sommation, ctx.law.forceLog.length, ctx.radio.log.length]).toEqual([0, 0, 0]);
    expect([ctx.player.state.personId, ctx.player.state.role]).toEqual([0, 'crs']);
    // même graine → mêmes tirages, mêmes identifiants, même apparence : session reproductible
    expect([ctx.rng.next(), ctx.rng.next(), ctx.rng.next()]).toEqual(firstRandom);
    const again = ctx.people.spawn({ kind: 'commissaire', x: 0, z: 0 });
    expect(again.id).toBe(firstId);
    expect(again.look).toEqual(firstLook);
    const reference = createRng(77);
    expect(firstRandom).toEqual([reference.next(), reference.next(), reference.next()]); // ctx.rng suit bien config.seed

    // autre graine → autre session
    await t.start({ seed: 78 });
    expect(ctx.rng.next()).not.toBe(firstRandom[0]);
  });

  it('pause et fin de session : phases et événements', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    const log: string[] = [];
    ctx.events.on('session:paused', (e) => log.push(`paused:${e.paused}`));
    ctx.events.on('session:ended', (e) => log.push(`ended:${e.toDebrief}:${ctx.session.phase}:${ctx.session.config !== null}`));

    ctx.session.pause(true); // au menu : sans effet
    ctx.session.end(); // au menu : sans effet
    expect(log).toEqual([]);

    await t.start();
    ctx.session.pause(false); // pas en pause : sans effet
    ctx.session.pause(true);
    ctx.session.pause(true);
    expect(ctx.session.phase).toBe('paused');
    ctx.session.pause(false);
    expect(ctx.session.phase).toBe('playing');

    ctx.clock.timeScale = 8;
    ctx.session.end(true);
    expect(ctx.session.phase).toBe('debrief');
    expect(ctx.session.config).not.toBeNull(); // conservée pour le compte rendu
    expect(ctx.clock.timeScale).toBe(1);
    ctx.session.end(true); // déjà au compte rendu
    ctx.session.end(false); // retour au menu, sans second événement
    expect(ctx.session.phase).toBe('menu');
    expect(ctx.session.config).toBeNull();

    await t.start();
    ctx.session.pause(true);
    ctx.session.end(); // depuis la pause, vers le menu
    expect(ctx.session.phase).toBe('menu');
    expect(log).toEqual(['paused:true', 'paused:false', 'ended:true:debrief:true', 'paused:true', 'ended:false:menu:true']);
  });

  it('redémarrer pendant une session la termine d\'abord proprement', async () => {
    const t = createTestContext();
    const log: string[] = [];
    t.ctx.events.on('session:started', (e) => log.push('started:' + e.config.seed));
    t.ctx.events.on('session:ended', (e) => log.push('ended:' + e.toDebrief));
    await t.start({ seed: 1 });
    await t.start({ seed: 2 });
    expect(log).toEqual(['started:1', 'ended:false', 'started:2']);
    expect(t.ctx.session.phase).toBe('playing');
    expect(t.ctx.session.config!.seed).toBe(2);
  });

  it('un démarrage remplacé ou annulé pendant le chargement s\'abandonne de lui-même', async () => {
    const log: string[] = [];
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const t = createTestContext();
    const ctx = t.ctx;
    ctx.world = fakeWorld(ctx.world, log, gate);
    ctx.events.on('session:started', (e) => log.push('started:' + e.config.seed));

    const first = ctx.session.start(defaultSessionConfig({ seed: 1 }));
    const second = ctx.session.start(defaultSessionConfig({ seed: 2 }));
    await Promise.resolve();
    expect(ctx.session.phase).toBe('loading');
    open();
    await Promise.all([first, second]);
    expect(log.filter((l) => l.startsWith('started'))).toEqual(['started:2']); // un seul démarrage effectif
    expect(ctx.session.config!.seed).toBe(2);

    // annulation pendant le chargement
    let open2!: () => void;
    ctx.world = fakeWorld(ctx.world, log, new Promise<void>((r) => (open2 = r)));
    ctx.session.end();
    log.length = 0;
    const third = ctx.session.start(defaultSessionConfig({ seed: 3 }));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.session.phase).toBe('loading');
    ctx.session.end();
    expect(ctx.session.phase).toBe('menu');
    open2();
    await third;
    expect(ctx.session.phase).toBe('menu');
    expect(log.some((l) => l.startsWith('started'))).toBe(false);
  });

  it('si le chargement du monde échoue, start() rejette et le jeu revient au menu', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    ctx.world = { ...ctx.world, whenLoaded: () => Promise.reject(new Error('tuile introuvable')) };
    await expect(t.start()).rejects.toThrow('tuile introuvable');
    expect(ctx.session.phase).toBe('menu');
    expect(ctx.session.config).toBeNull();
    ctx.world = { ...ctx.world, whenLoaded: () => Promise.resolve() };
    await t.start(); // toujours utilisable
    expect(ctx.session.phase).toBe('playing');
  });

  it('start() attend la fin du boot', async () => {
    const log: string[] = [];
    const game = new Game({ headless: true, storage: null, device: DESKTOP_HINTS });
    const slow: GameSystem = {
      id: 'lent',
      order: 1,
      init: async () => {
        await new Promise((r) => setTimeout(r, 10));
        log.push('init');
      },
      reset: () => void log.push('reset'),
    };
    game.addSystem(slow);
    game.ctx.events.on('session:started', () => log.push('started'));
    await game.session.start(defaultSessionConfig()); // boot() jamais appelé explicitement
    expect(log).toEqual(['init', 'reset', 'started']);
  });
});

describe('createTestContext', () => {
  it('contexte headless, services neutres, modules branchés dès la création', async () => {
    const log: string[] = [];
    const t = createTestContext({
      seed: 3,
      modules: [() => [{ id: 'mod', order: 500, provide: (ctx) => ctx.provide('mod', 'ok'), update: (dt) => void log.push(dt.toFixed(4)) }]],
    });
    expect(t.ctx.headless).toBe(true);
    expect(t.ctx.view).toBeNull();
    expect(t.game.booted).toBe(true); // aucun init asynchrone : déjà démarré
    expect(t.ctx.service('mod')).toBe('ok');
    expect(t.ctx.world.heightAt(5, 5)).toBe(0);
    expect(getCore(t.ctx).save.persistent).toBe(false);
    expect(t.ctx.settings.values.quality).toBe('haut');

    t.step(1); // aucune session : rien ne tourne
    expect(log).toEqual([]);
    const cfg = await t.start({ crowdSize: 120, role: 'commandant' });
    expect(cfg).toMatchObject({ mode: 'test', seed: 3, crowdSize: 120, role: 'commandant', x: 0, z: 0 });
    t.step(1);
    expect(log.length).toBe(30);
    expect(new Set(log)).toEqual(new Set(['0.0333']));
    expect(t.ctx.clock.now).toBeCloseTo(1, 9);
    t.step(0.5, 0.05);
    expect(log.length).toBe(40);
    t.step(0);
    t.step(-1);
    expect(log.length).toBe(40);
    await expect(t.ready).resolves.toBeUndefined();
  });

  it('mode strict par défaut : une exception dans un système fait échouer le test', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad: GameSystem = {
      id: 'bogue',
      order: 1,
      update: () => {
        throw new Error('bogue de module');
      },
    };
    const strict = createTestContext({ systems: [bad] });
    await strict.start();
    expect(() => strict.step(0.1)).toThrow('bogue de module');
    const lenient = createTestContext({ systems: [bad], strict: false });
    await lenient.start();
    expect(() => lenient.step(1)).not.toThrow();
    // un init() qui échoue est signalé par ready et par start()
    const broken = createTestContext({ systems: [{ id: 'x', order: 1, init: () => Promise.reject(new Error('init raté')) }] });
    await expect(broken.ready).rejects.toThrow('init raté');
    await expect(broken.start()).rejects.toThrow('init raté');
  });

  it('mode strict : une exception dans un gestionnaire d\'événement fait aussi échouer le test', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const strict = createTestContext();
    strict.ctx.events.on('person:spawned', () => {
      throw new Error('abonné cassé');
    });
    await strict.start();
    expect(() => strict.ctx.people.spawn({ kind: 'passant', x: 0, z: 0 })).toThrow('abonné cassé');
    expect(strict.ctx.people.list.length).toBe(1); // la personne existe tout de même
    // retrait : l'exception est relancée mais le magasin reste cohérent
    strict.ctx.events.on('person:removed', () => {
      throw new Error('abonné cassé au retrait');
    });
    const id = strict.ctx.people.list[0]!.id;
    expect(() => strict.ctx.people.remove(id)).toThrow('abonné cassé au retrait');
    expect(strict.ctx.people.get(id)).toBeUndefined();
    expect(strict.ctx.people.list.length).toBe(0);

    // une erreur pendant le démarrage (abonné de session:started) fait échouer start() et ramène au menu
    const failing = createTestContext();
    failing.ctx.events.once('session:started', () => {
      throw new Error('mission impossible à peupler');
    });
    await expect(failing.start()).rejects.toThrow('mission impossible à peupler');
    expect([failing.ctx.session.phase, failing.ctx.session.config]).toEqual(['menu', null]);
    await failing.start(); // l'abonné fautif était à usage unique : le démarrage suivant réussit
    expect(failing.ctx.session.phase).toBe('playing');

    const lenient = createTestContext({ strict: false });
    lenient.ctx.events.on('person:spawned', () => {
      throw new Error('abonné cassé');
    });
    await lenient.start();
    expect(() => lenient.ctx.people.spawn({ kind: 'passant', x: 0, z: 0 })).not.toThrow();
  });

  it('deux contextes de même graine évoluent à l\'identique (simulation déterministe)', async () => {
    const run = async (seed: number): Promise<number[]> => {
      const t = createTestContext({
        seed,
        systems: [{
          id: 'marche-aléatoire',
          order: 400,
          update(dt: number) {
            for (const p of t.ctx.people.list) {
              p.x += (t.ctx.rng.next() - 0.5) * dt * 10;
              p.z += (t.ctx.rng.next() - 0.5) * dt * 10;
            }
          },
        }],
      });
      await t.start();
      for (let i = 0; i < 50; i++) t.ctx.people.spawn({ kind: 'manifestant', x: i, z: 0 });
      t.step(4);
      return t.ctx.people.list.flatMap((p) => [p.x, p.z, p.look.height]);
    };
    const a = await run(11);
    const b = await run(11);
    const c = await run(12);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('paramètres de lancement', () => {
  it('lit les paramètres d\'URL documentés', () => {
    const p = parseLaunchParams('?autostart=paris&place=place%20de%20la%20Bastille&quality=bas&seed=42&nomenu=1&debug=1');
    expect(p).toMatchObject({ autostart: 'paris', place: 'place de la Bastille', quality: 'bas', seed: 42, nomenu: true, debug: true });
    expect(p.raw).toEqual({ autostart: 'paris', place: 'place de la Bastille', quality: 'bas', seed: '42', nomenu: '1', debug: '1' });
    expect(LAUNCH_SERVICE).toBe('launch');

    const none = parseLaunchParams('');
    expect(none).toMatchObject({ autostart: null, place: null, quality: null, seed: null, nomenu: false, debug: false, role: null, time: null });
    expect(parseLaunchParams('?autostart=test').autostart).toBe('test');
    expect(parseLaunchParams('?autostart=1').autostart).toBe('test');
    expect(parseLaunchParams('?autostart').autostart).toBe('test');
    expect(parseLaunchParams('?autostart=0').autostart).toBeNull();
    expect(parseLaunchParams('?nomenu=0').nomenu).toBe(false);
    expect(parseLaunchParams('?quality=extreme').quality).toBeNull();
    expect(parseLaunchParams('?seed=manif-du-1er-mai').seed).toBe(parseLaunchParams('?seed=manif-du-1er-mai').seed);
    expect(Number.isInteger(parseLaunchParams('?seed=manif').seed)).toBe(true);
    expect(parseLaunchParams('?place=Champs+%C3%89lys%C3%A9es').place).toBe('Champs Élysées');
    expect(() => parseLaunchParams('?place=%E0%A4%A&x=%')).not.toThrow(); // URL mal formée
    const full = parseLaunchParams('?role=commandant&rank=commandant&time=21.5&weather=pluie&crowd=800&tension=0.6&volatility=2&mission=m12&duration=longue&x=10&z=-20');
    expect(full).toMatchObject({ role: 'commandant', rank: 'commandant', time: 21.5, weather: 'pluie', crowd: 800, tension: 0.6, volatility: 2, mission: 'm12', duration: 'longue', x: 10, z: -20 });
    expect(parseLaunchParams('?role=pirate&time=99&weather=neige').role).toBeNull();
    expect(parseLaunchParams('?time=99').time).toBeNull();
  });

  it('configuration par défaut et durées des préréglages', () => {
    const cfg = defaultSessionConfig();
    expect(cfg).toEqual({
      mode: 'test', missionId: '', role: 'crs', rank: 'gardien', place: '', timeOfDay: 14, weather: 'clair',
      crowdSize: 0, tension: 0, volatility: 0, duration: 'standard', seed: 1,
    });
    // mode libre : rôle, grade et mission au choix (commandant d'emblée, par exemple)
    const libre = defaultSessionConfig({ mode: 'libre', role: 'commandant', rank: 'commandant', missionId: 'manif-republique', duration: 'longue' });
    expect(libre).toMatchObject({ mode: 'libre', role: 'commandant', rank: 'commandant', missionId: 'manif-republique', duration: 'longue' });
    expect([sessionDurationSeconds('courte'), sessionDurationSeconds('standard'), sessionDurationSeconds('longue')]).toEqual([600, 1500, 2700]);
    expect(sessionDurationSeconds('temps_reel')).toBe(Infinity);
  });

  it('launchSessionConfig construit la session du démarrage automatique', () => {
    const test = launchSessionConfig(parseLaunchParams('?autostart=test&seed=7'));
    expect(test).toMatchObject({ mode: 'test', place: '', seed: 7, missionId: '' });
    expect(test.x).toBeUndefined();
    const paris = launchSessionConfig(parseLaunchParams('?autostart=paris'));
    expect(paris).toMatchObject({ mode: 'monde_ouvert', place: 'place de la Concorde', seed: 1 });
    const custom = launchSessionConfig(parseLaunchParams('?autostart=paris&place=Bastille&role=commandant&rank=commandant&time=21&weather=pluie&crowd=800&tension=0.6&volatility=2&mission=m12&duration=longue&x=10&z=-20'));
    expect(custom).toMatchObject({
      place: 'Bastille', role: 'commandant', rank: 'commandant', timeOfDay: 21, weather: 'pluie', crowdSize: 800,
      tension: 0.6, volatility: 1, missionId: 'm12', duration: 'longue', x: 10, z: -20,
    });
    const keys: (keyof SessionConfig)[] = ['mode', 'missionId', 'role', 'rank', 'place', 'timeOfDay', 'weather', 'crowdSize', 'tension', 'volatility', 'duration', 'seed'];
    for (const k of keys) expect(test[k], k).not.toBeUndefined();
  });
});

describe('API de débogage (window.__CRS)', () => {
  it('ready, game, ctx, start, step, teleport, summary', async () => {
    const target: Record<string, unknown> = {};
    const game = new Game({ headless: true, storage: null, device: DESKTOP_HINTS, seed: 4 });
    game.addSystem({ id: 'vide', order: 300, update: () => {} });
    const api = installDebugApi(game, target);
    expect(target[DEBUG_GLOBAL]).toBe(api);
    expect([api.ready, api.error, api.game, api.ctx]).toEqual([false, null, game, game.ctx]);
    expect(api.step(1)).toBe(0); // aucune session
    let s = api.summary();
    expect([s.ready, s.phase, s.headless, s.view, s.time, s.tick]).toEqual([false, 'boot', true, false, 0, 0]);

    const cfg = await api.start({ seed: 21, crowdSize: 10 });
    expect(cfg).toMatchObject({ seed: 21, crowdSize: 10, mode: 'test' });
    api.ready = true;
    expect(api.step(2)).toBe(60);
    const ctx = game.ctx;
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    for (let i = 0; i < 4; i++) ctx.people.spawn({ kind: 'manifestant', x: 10 + i, z: 0 });
    ctx.vehicles.spawn('voiture', 0, 9, 0);
    ctx.props.spawn('banc', 3, 3, 0);
    ctx.projectiles.spawn('pave', 0, 0, 0, 0, 0, 0, 0);
    ctx.squads.create('groupe', 'police', 'Alpha');
    ctx.player.possess(p.id, 'chef_groupe');

    s = api.summary();
    expect(s).toMatchObject({
      ready: true, phase: 'playing', seed: 21, tick: 60, timeScale: 1,
      entities: { people: 5, vehicles: 1, props: 1, shops: 0, projectiles: 1, squads: 1 },
      player: { personId: p.id, role: 'chef_groupe', x: 0, z: 0 },
    });
    expect(s.time).toBeCloseTo(2, 9);
    expect(s.systems.map((x) => x.id)).toEqual(['vide', 'core:neutral']);
    for (const sys of s.systems) {
      expect(sys.updateMs).toBeGreaterThanOrEqual(0);
      expect([sys.errors, sys.disabled]).toEqual([0, false]);
    }
    expect(s.stats.steps).toBe(1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // sérialisable (page.evaluate des tests e2e)

    // téléportation du joueur à pied, puis en véhicule
    expect(api.teleport(50, -40)).toEqual({ x: 50, y: 0, z: -40 });
    expect([p.x, p.z]).toEqual([50, -40]);
    expect(ctx.people.countIn(50, -40, 1)).toBe(1); // index spatial à jour
    const v = ctx.vehicles.spawn('voiture', 0, 0, 0);
    ctx.vehicles.enter(p, v, 'driver');
    v.speed = 12;
    api.teleport(-7, 8);
    expect([v.x, v.z, v.speed, p.x, p.z]).toEqual([-7, 8, 0, -7, 8]);
    // sans personne incarnée : seul le centre de chargement du monde bouge
    ctx.player.possess(0);
    expect(api.teleport(1, 2)).toEqual({ x: 1, y: 0, z: 2 });
    expect([getCore(ctx).neutral.world.focusX, getCore(ctx).neutral.world.focusZ]).toEqual([1, 2]);
  });
});
