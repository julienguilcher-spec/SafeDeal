import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GameContext, InteractionHandler, InteractionOption, Person, RoadSample,
} from '@/core/contracts';
import { createContext, getCore } from '@/core/context';
import { NOMINAL_BOUNDS, createNullUi, injuryForHealth, isAuthority, makeRayHit } from '@/core/null-services';
import { DESKTOP_HINTS } from '@/core/settings';
import { createTestContext } from '@/core/testing';

function makeCtx(): GameContext {
  return createContext({ headless: true, storage: null, device: DESKTOP_HINTS, seed: 2 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('monde neutre', () => {
  it('plan infini à y = 0, sans collision', () => {
    const w = makeCtx().world;
    expect(w.ready).toBe(true);
    expect(w.tileSize).toBe(512);
    expect(w.bounds).toEqual(NOMINAL_BOUNDS);
    expect(w.heightAt(123, -456)).toBe(0);
    expect(w.heightAt(1e7, 1e7)).toBe(0);
    expect(w.buildingHeightAt(0, 0)).toBe(0);
    expect(w.surfaceAt(0, 0)).toBe('plaza');
    expect(w.waterLevel).toBeLessThan(0);
    const pos = { x: 5, z: 6 };
    expect(w.resolveCircle(pos, 1)).toBe(false);
    expect(pos).toEqual({ x: 5, z: 6 });
    expect(w.isFree(0, 0, 10)).toBe(true);
    expect(w.lineOfSight(0, 0, 500, 500)).toBe(true);
    const hit = makeRayHit();
    hit.hit = true;
    expect(w.raycast(0, 0, 10, 20, hit)).toBe(false);
    expect([hit.hit, hit.kind, hit.t, hit.x, hit.z]).toEqual([false, 'none', 1, 10, 20]);
  });

  it('chemins en ligne droite, graphe vide, lieux vides, tout est chargé', async () => {
    const w = makeCtx().world;
    const path: number[] = [9, 9, 9, 9, 9, 9];
    expect(w.findPath(1, 2, 30, 40, 'foot', path)).toBe(true);
    expect(path).toEqual([1, 2, 30, 40]);
    expect(w.findPath(1, 2, 30, 40, 'vehicle', path)).toBe(true);
    expect([w.nodeCount, w.edgeCount]).toEqual([0, 0]);
    expect(w.node(0).id).toBe(-1);
    expect(w.edge(0).id).toBe(-1);
    expect(w.nearestRoad(0, 0, {} as RoadSample)).toBe(false);
    expect(w.places).toEqual([]);
    expect(w.landmarks).toEqual([]);
    expect(w.placeByName('place de la Concorde')).toBeNull();
    expect(typeof w.sectorName(0, 0)).toBe('string');
    expect(w.isLoaded(1e6, 1e6)).toBe(true);
    await expect(w.whenLoaded(0, 0, 250)).resolves.toBeUndefined();
    expect(w.shopsInTile(0, 0)).toEqual([]);
    expect(w.furnitureInTile(0, 0)).toEqual([]);
    const out = { x: 0, z: 0 };
    let i = 0;
    const rand = () => [0.25, 0.64][i++ % 2]!;
    expect(w.randomFreePoint(100, 200, 10, 'sidewalk', rand, out)).toBe(true);
    expect(Math.hypot(out.x - 100, out.z - 200)).toBeCloseTo(8, 9); // sqrt(0,64) × 10
  });
});

describe('environnement neutre', () => {
  it('midi, temps clair par défaut', () => {
    const env = makeCtx().env;
    const s = env.state;
    expect([s.timeOfDay, s.weather, s.rain, s.fog, s.wetness]).toEqual([12, 'clair', 0, 0, 0]);
    expect([s.windX, s.windZ, s.clockScale]).toEqual([0, 0, 1]);
    expect([s.isNight, s.streetLights]).toEqual([false, false]);
    expect(s.daylight).toBe(1);
    // à midi le soleil est au sud (+z), haut dans le ciel
    expect(s.sunX).toBeCloseTo(0, 9);
    expect(s.sunZ).toBeGreaterThan(0.5);
    expect(s.sunY).toBeGreaterThan(0.5);
    expect(Math.hypot(s.sunX, s.sunY, s.sunZ)).toBeCloseTo(1, 9);
  });

  it('modifiable : heure, météo, vent, échelle de l\'horloge', () => {
    const ctx = makeCtx();
    const env = ctx.env;
    const hours: number[] = [];
    const weathers: string[] = [];
    ctx.events.on('env:hour', (e) => hours.push(e.hour));
    ctx.events.on('env:weather', (e) => weathers.push(e.weather));

    env.setTime(7);
    expect(env.state.timeOfDay).toBe(7);
    expect(env.state.sunX).toBeGreaterThan(0.5); // le matin, le soleil est à l'est
    expect(env.state.isNight).toBe(false);
    env.setTime(7.5); // même heure entière : pas d'événement
    env.setTime(17);
    expect(env.state.sunX).toBeLessThan(-0.5); // en fin d'après-midi, à l'ouest
    expect(env.state.sunY).toBeGreaterThan(0);
    env.setTime(18.5); // le soleil est couché : l'éclairage public s'allume
    expect(env.state.streetLights).toBe(true);
    env.setTime(23);
    expect([env.state.isNight, env.state.streetLights, env.state.daylight]).toEqual([true, true, 0]);
    expect(env.state.sunY).toBeGreaterThan(0); // la nuit, direction de la lune, au-dessus de l'horizon
    expect(Math.hypot(env.state.sunX, env.state.sunY, env.state.sunZ)).toBeCloseTo(1, 9);
    env.setTime(25); // ramené dans 0..24
    expect(env.state.timeOfDay).toBe(1);
    env.setTime(Number.NaN); // ignoré
    expect(env.state.timeOfDay).toBe(1);
    expect(hours).toEqual([7, 17, 18, 23, 1]);

    env.setWeather('averse', true);
    expect([env.state.weather, env.state.rain, env.state.wetness]).toEqual(['averse', 1, 1]);
    env.setWeather('averse');
    env.setWeather('brouillard');
    expect(env.state.fog).toBeGreaterThan(0.5);
    expect(env.state.rain).toBe(0);
    expect(weathers).toEqual(['averse', 'brouillard']);

    env.setWind(3, -2);
    expect([env.state.windX, env.state.windZ]).toEqual([3, -2]);
    env.setClockScale(60);
    expect(env.state.clockScale).toBe(60);
    env.setClockScale(-1);
    expect(env.state.clockScale).toBe(60);
  });
});

describe('dangers et directeur neutres', () => {
  it('aucun gaz, aucune fumée, aucun feu, visibilité parfaite', () => {
    const h = makeCtx().hazards;
    h.emitGas(0, 0, 1, 5);
    h.emitSmoke(0, 0, 1, 5);
    h.ignite(0, 0, 3, 1, 0);
    h.douse(0, 0, 3, 1);
    expect([h.gasAt(0, 0), h.smokeAt(0, 0), h.fireAt(0, 0)]).toEqual([0, 0, 0]);
    expect(h.visibility(0, 0, 100, 100)).toBe(1);
    h.clear();
  });

  it('aucune phase, tension nulle', () => {
    const d = makeCtx().director;
    expect([d.phase, d.tension, d.headProgress]).toEqual(['aucune', 0, 0]);
    d.addTension(0.5, 0, 0, 'essai');
    expect(d.tension).toBe(0);
    expect(d.tensionAt(0, 0)).toBe(0);
    expect(d.route).toEqual([]);
    expect(d.stats).toEqual({ total: 0, present: 0, dispersed: 0, radicals: 0, injured: 0, arrested: 0 });
  });
});

describe('santé neutre', () => {
  it('hurt retire des points de vie, met à terre à zéro, émet person:hurt et person:down', () => {
    const ctx = makeCtx();
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const log: string[] = [];
    ctx.events.on('person:hurt', (e) => log.push(`hurt:${e.id}:${e.healthAfter}:${e.info.kind}`));
    ctx.events.on('person:down', (e) => log.push(`down:${e.id}:${e.injury}:${e.sourceId}`));
    ctx.events.on('person:recovered', (e) => log.push(`up:${e.id}`));
    ctx.events.on('person:treated', (e) => log.push(`treated:${e.id}:${e.byId}`));

    ctx.health.hurt(p, { amount: 30, kind: 'blunt', sourceId: 9, x: 0, z: 0, stun: 2 });
    expect([p.health, p.injury, p.stun, p.posture]).toEqual([70, 'light', 2, 'stand']);
    expect(ctx.health.isIncapacitated(p)).toBe(false);
    ctx.health.hurt(p, { amount: 30, kind: 'impact', sourceId: 9, x: 0, z: 0, stun: 1 });
    expect([p.health, p.injury, p.stun]).toEqual([40, 'serious', 2]); // l'étourdissement le plus long est gardé

    p.cmd.moveX = 1;
    p.vx = 2;
    ctx.health.hurt(p, { amount: 999, kind: 'blast', sourceId: 9, x: 0, z: 0 });
    expect([p.health, p.injury, p.posture]).toEqual([0, 'critical', 'down']);
    expect([p.cmd.moveX, p.vx]).toEqual([0, 0]);
    expect(ctx.health.isIncapacitated(p)).toBe(true);
    expect(log).toEqual([`hurt:${p.id}:70:blunt`, `hurt:${p.id}:40:impact`, `hurt:${p.id}:0:blast`, `down:${p.id}:critical:9`]);

    // à zéro, impossible de relever ; après des soins, oui
    ctx.health.setDown(p, false);
    expect(p.posture).toBe('down');
    ctx.health.heal(p, 35, 4);
    expect([p.health, p.injury, p.posture]).toEqual([35, 'serious', 'down']);
    ctx.health.setDown(p, false);
    expect(p.posture).toBe('stand');
    expect(ctx.health.isIncapacitated(p)).toBe(false);
    ctx.health.heal(p, 500, 4);
    expect([p.health, p.injury]).toEqual([100, 'none']);
    expect(log.slice(4)).toEqual([`treated:${p.id}:4`, `up:${p.id}`, `treated:${p.id}:4`]);
    expect(injuryForHealth(76)).toBe('none');
    expect(injuryForHealth(10)).toBe('critical');
  });

  it('setDown(true) fait lâcher ce qui est porté et n\'émet qu\'une fois', () => {
    const ctx = makeCtx();
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const held = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    cop.carrying = held.id;
    held.heldBy = cop.id;
    let downs = 0;
    ctx.events.on('person:down', () => downs++);
    ctx.health.setDown(cop, true);
    ctx.health.setDown(cop, true);
    expect(downs).toBe(1);
    expect([cop.posture, cop.carrying, held.heldBy]).toEqual(['down', 0, 0]);
  });
});

describe('actions neutres — inventaire réel', () => {
  it('give, has, remove, select', () => {
    const ctx = makeCtx();
    const a = ctx.actions;
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(a.defs).toEqual([]);
    expect(a.def('bouclier')).toBeUndefined();
    expect(a.activeItem(p)).toBeNull();
    expect(a.use(p)).toEqual({ ok: false, reason: 'no_item' });

    const shield = a.give(p, 'bouclier');
    expect(shield).toEqual({ id: 'bouclier', count: 1, state: 1, cooldown: 0 });
    a.give(p, 'grenade_lacrymo', 4);
    const more = a.give(p, 'grenade_lacrymo', 2);
    expect(more.count).toBe(6);
    a.give(p, 'menottes', 2);
    expect(p.inventory.map((s) => s.id)).toEqual(['bouclier', 'grenade_lacrymo', 'menottes']);
    expect([a.has(p, 'grenade_lacrymo'), a.has(p, 'menottes'), a.has(p, 'lbd40')]).toEqual([6, 2, 0]);

    expect(a.select(p, 2)).toBe(true);
    expect(a.activeItem(p)!.id).toBe('menottes');
    expect(a.select(p, 7)).toBe(false);
    expect(a.select(p, 1.5)).toBe(false);
    expect(p.active).toBe(2);
    expect(a.selectById(p, 'grenade_lacrymo')).toBe(true);
    expect(p.active).toBe(1);
    expect(a.selectById(p, 'lbd40')).toBe(false);
    expect(a.use(p)).toEqual({ ok: false, reason: 'forbidden' }); // aucun module d'objets : usage impossible
    expect(a.canUse(p)).toBe(false);
    expect(a.solveAim(p, 10, 0, 10, { yaw: 0, pitch: 0, power: 0, flightTime: 0 })).toBe(false);
    a.setAlt(p, true);
    expect(p.alt).toBe(true);

    // retrait partiel, puis total : la pile disparaît et l'index actif est corrigé
    expect(a.remove(p, 'grenade_lacrymo', 2)).toBe(2);
    expect(a.has(p, 'grenade_lacrymo')).toBe(4);
    expect(p.active).toBe(1);
    a.select(p, 2); // menottes
    expect(a.remove(p, 'grenade_lacrymo', 99)).toBe(4);
    expect(p.inventory.map((s) => s.id)).toEqual(['bouclier', 'menottes']);
    expect(a.activeItem(p)!.id).toBe('menottes'); // l'objet en main reste le même
    expect(a.remove(p, 'menottes')).toBe(2); // sans quantité : tout
    expect([p.active, p.alt]).toEqual([-1, false]);
    expect(a.remove(p, 'lbd40', 1)).toBe(0);
    expect(a.select(p, -1)).toBe(true);
  });
});

describe('interactions neutres — registre fonctionnel', () => {
  interface Trace {
    log: string[];
    handler: InteractionHandler;
  }

  function cuffHandler(ctx: GameContext, duration: number, priority = 5): Trace {
    const log: string[] = [];
    const handler: InteractionHandler = {
      verb: 'menotter',
      find(actor: Person): InteractionOption | null {
        const t = ctx.people.nearest(actor.x, actor.z, 2, (q) => q.faction === 'protest');
        return t ? { verb: 'menotter', targetKind: 'person', targetId: t.id, label: 'Menotter', priority, duration, x: t.x, z: t.z } : null;
      },
      begin: (_a, opt) => {
        log.push('begin:' + opt.targetId);
        return true;
      },
      tick: (_a, _o, elapsed) => {
        log.push('tick:' + elapsed.toFixed(2));
        return true;
      },
      complete: (_a, opt) => {
        log.push('complete:' + opt.targetId);
        const t = ctx.people.get(opt.targetId);
        if (t) t.custody = 'cuffed';
      },
      cancel: () => log.push('cancel'),
    };
    return { log, handler };
  }

  it('options triées par priorité, durée, achèvement', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const target = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    const cuff = cuffHandler(ctx, 0.2);
    ctx.interactions.register(cuff.handler);
    ctx.interactions.register(cuff.handler); // doublon ignoré
    ctx.interactions.register({
      verb: 'parler',
      find: () => ({ verb: 'parler', targetKind: 'person', targetId: target.id, label: 'Parler', priority: 1, duration: 0, x: 1, z: 0 }),
      begin: () => true,
      complete: () => cuff.log.push('parlé'),
    });

    const opts: InteractionOption[] = [];
    expect(ctx.interactions.options(cop, opts)).toBe(2);
    expect(opts.map((o) => o.verb)).toEqual(['menotter', 'parler']);
    expect(ctx.interactions.current(cop)).toBeNull();

    // durée nulle : terminée immédiatement
    expect(ctx.interactions.start(cop, opts[1]!)).toBe(true);
    expect(cuff.log).toEqual(['parlé']);
    expect(ctx.interactions.current(cop)).toBeNull();

    // durée 0,2 s : avance avec la simulation
    expect(ctx.interactions.start(cop, opts[0]!)).toBe(true);
    expect(ctx.interactions.current(cop)!.elapsed).toBe(0);
    t.step(0.1, 0.05);
    expect(ctx.interactions.current(cop)!.elapsed).toBeCloseTo(0.1, 9);
    expect(target.custody).toBe('free');
    t.step(0.15, 0.05);
    expect(ctx.interactions.current(cop)).toBeNull();
    expect(target.custody).toBe('cuffed');
    expect(cuff.log).toEqual([
      'parlé', `begin:${target.id}`, 'tick:0.05', 'tick:0.10', 'tick:0.15', 'tick:0.20', `complete:${target.id}`,
    ]);
  });

  it('annulation : explicite, par tick(), par une nouvelle interaction, par mise hors de combat', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const target = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    const cuff = cuffHandler(ctx, 1);
    ctx.interactions.register(cuff.handler);
    const opts: InteractionOption[] = [];
    ctx.interactions.options(cop, opts);
    const opt = opts[0]!;

    ctx.interactions.start(cop, opt);
    t.step(0.1, 0.05);
    ctx.interactions.cancel(cop);
    expect(ctx.interactions.current(cop)).toBeNull();
    expect(cuff.log.at(-1)).toBe('cancel');
    t.step(2, 0.05);
    expect(target.custody).toBe('free'); // jamais achevée

    // tick() qui refuse
    let allow = true;
    const guarded: InteractionHandler = {
      verb: 'soigner',
      find: () => null,
      begin: () => true,
      tick: () => allow,
      complete: () => cuff.log.push('soigné'),
      cancel: () => cuff.log.push('soin interrompu'),
    };
    ctx.interactions.register(guarded);
    const heal: InteractionOption = { verb: 'soigner', targetKind: 'person', targetId: target.id, label: 'Soigner', priority: 1, duration: 1, x: 0, z: 0 };
    expect(ctx.interactions.start(cop, heal)).toBe(true);
    t.step(0.1, 0.05);
    allow = false;
    t.step(0.05, 0.05);
    expect(ctx.interactions.current(cop)).toBeNull();
    expect(cuff.log.at(-1)).toBe('soin interrompu');

    // une nouvelle interaction remplace la précédente
    allow = true;
    ctx.interactions.start(cop, heal);
    ctx.interactions.start(cop, opt);
    expect(cuff.log.slice(-2)).toEqual(['soin interrompu', `begin:${target.id}`]);
    expect(ctx.interactions.current(cop)!.opt).toBe(opt);

    // acteur mis à terre : interaction annulée au pas suivant
    ctx.health.setDown(cop, true);
    t.step(0.05, 0.05);
    expect(ctx.interactions.current(cop)).toBeNull();
    expect(cuff.log.at(-1)).toBe('cancel');
  });

  it('startVerb, refus de begin(), verbe inconnu, erreur dans un gestionnaire', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const near = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    const far = ctx.people.spawn({ kind: 'manifestant', x: 1.5, z: 0 });
    const cuff = cuffHandler(ctx, 0);
    ctx.interactions.register(cuff.handler);
    expect(ctx.interactions.startVerb(cop, 'menotter', far.id)).toBe(false); // le gestionnaire propose `near`
    expect(ctx.interactions.startVerb(cop, 'piller', near.id)).toBe(false); // verbe sans gestionnaire
    expect(ctx.interactions.startVerb(cop, 'menotter', near.id)).toBe(true);
    expect(near.custody).toBe('cuffed');

    ctx.interactions.register({ verb: 'palper', find: () => null, begin: () => false, complete: () => {} });
    const refuse: InteractionOption = { verb: 'palper', targetKind: 'person', targetId: near.id, label: 'Palper', priority: 1, duration: 0, x: 0, z: 0 };
    expect(ctx.interactions.start(cop, refuse)).toBe(false);
    const unknown: InteractionOption = { ...refuse, verb: 'interviewer' };
    expect(ctx.interactions.start(cop, unknown)).toBe(false);

    // une erreur dans tick() abandonne l'interaction sans faire tomber la simulation
    ctx.interactions.register({
      verb: 'porter', find: () => null, begin: () => true,
      tick: () => {
        throw new Error('gestionnaire cassé');
      },
      complete: () => {},
    });
    const carry: InteractionOption = { ...refuse, verb: 'porter', duration: 1 };
    expect(ctx.interactions.start(cop, carry)).toBe(true);
    expect(() => t.step(0.1, 0.05)).not.toThrow();
    expect(ctx.interactions.current(cop)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('le début d\'une session annule les interactions en cours mais garde les gestionnaires', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    const cuff = cuffHandler(ctx, 5);
    ctx.interactions.register(cuff.handler);
    ctx.interactions.startVerb(cop, 'menotter', 2);
    expect(ctx.interactions.current(cop)).not.toBeNull();
    await t.start();
    expect(cuff.log.at(-1)).toBe('cancel');
    const cop2 = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    const opts: InteractionOption[] = [];
    expect(ctx.interactions.options(cop2, opts)).toBe(1); // gestionnaire toujours enregistré
  });
});

describe('archétypes neutres', () => {
  it('spawn = people.spawn ; equip enregistre le poste ou le profil', () => {
    const ctx = makeCtx();
    const cop = ctx.archetypes.spawn('crs', 3, 4, { rank: 'brigadier', heading: 1 });
    expect(ctx.people.get(cop.id)).toBe(cop);
    expect([cop.kind, cop.x, cop.z, cop.rank, cop.heading]).toEqual(['crs', 3, 4, 'brigadier', 1]);
    expect(cop.inventory).toEqual([]); // personne « nue » : pas de dotation sans module
    ctx.archetypes.equip(cop, 'lanceur');
    expect(cop.poste).toBe('lanceur');
    ctx.archetypes.equip(cop, null);
    expect(cop.poste).toBeNull();
    const man = ctx.archetypes.spawn('manifestant', 0, 0);
    ctx.archetypes.equip(man, 'radical');
    expect([man.profile, man.poste]).toEqual(['radical', null]);
    ctx.archetypes.equip(man, null);
    expect(man.profile).toBeNull();
  });
});

describe('droit neutre', () => {
  it('journal des infractions : gravité, témoins, pire infraction, interpellation fondée', () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const man = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const events: string[] = [];
    ctx.events.on('law:offense', (e) => events.push(`${e.personId}:${e.offense.type}`));
    expect(ctx.law.worstOffense(man)).toBeNull();
    expect(ctx.law.canArrest(man)).toBe(false);

    core.clock.advance(12);
    const tag = ctx.law.recordOffense(man, 'tag', 1, 2);
    expect(tag).toEqual({ type: 'tag', t: 12, x: 1, z: 2, severity: 1, witnessed: false, filmed: false });
    expect(ctx.law.canArrest(man)).toBe(false); // simple contravention

    ctx.people.spawn({ kind: 'crs', x: 10, z: 0 }); // un agent à portée de vue
    const jet = ctx.law.recordOffense(man, 'jet_projectile', 0, 0);
    expect([jet.severity, jet.witnessed]).toEqual([3, true]);
    const custom = ctx.law.recordOffense(man, 'degradation', 500, 500, 5); // loin de tout agent
    expect([custom.severity, custom.witnessed]).toEqual([5, false]);
    expect(man.offenses).toEqual([tag, jet, custom]);
    expect(ctx.law.worstOffense(man)).toBe(custom);
    expect(ctx.law.canArrest(man)).toBe(true);
    expect(events).toEqual([`${man.id}:tag`, `${man.id}:jet_projectile`, `${man.id}:degradation`]);

    // un agent ne témoigne pas de sa propre infraction ; un agent à terre non plus
    const lone = makeCtx();
    const cop = lone.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(lone.law.recordOffense(cop, 'violence', 0, 0).witnessed).toBe(false);
  });

  it('les sommations progressent quand elles sont prononcées par une autorité habilitée', () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const crs = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const com = ctx.people.spawn({ kind: 'commissaire', x: 5, z: 6 });
    expect([isAuthority(crs), isAuthority(com)]).toEqual([false, true]);
    const events: string[] = [];
    ctx.events.on('law:sommation', (e) => events.push(`${e.stage}:${e.byId}:${e.x}:${e.z}:${e.text === ctx.law.sommationText(e.stage)}`));

    expect(ctx.law.roe).toEqual({ dispersionOrdered: false, sommation: 0, sommationAt: 0, underAttack: false, lawfulForce: 1, authorizedForce: 1 });
    expect(ctx.law.sommation(crs)).toBe(0); // refus : pas habilité
    expect(ctx.law.roe.sommation).toBe(0);

    core.clock.advance(4);
    expect(ctx.law.sommation(com)).toBe(1);
    expect([ctx.law.roe.dispersionOrdered, ctx.law.roe.sommationAt, ctx.law.roe.lawfulForce]).toEqual([true, 4, 1]);
    core.clock.advance(4);
    expect(ctx.law.sommation(com)).toBe(2);
    core.clock.advance(4);
    expect(ctx.law.sommation(com)).toBe(3);
    expect([ctx.law.roe.sommation, ctx.law.roe.sommationAt, ctx.law.roe.lawfulForce]).toEqual([3, 12, 3]);
    expect(ctx.law.sommation(com)).toBe(3); // pas d'étape au-delà
    expect(events).toEqual([`1:${com.id}:5:6:true`, `2:${com.id}:5:6:true`, `3:${com.id}:5:6:true`]);

    expect(ctx.law.sommationText(0)).toBe('');
    expect(ctx.law.sommationText(1)).toContain('Obéissance à la loi');
    expect(ctx.law.sommationText(2)).toContain('Première sommation');
    expect(ctx.law.sommationText(3)).toContain('Dernière sommation');

    // un gradé portant l'écharpe est habilité
    crs.look.sash = true;
    expect(isAuthority(crs)).toBe(true);
  });

  it('autorisation hiérarchique, journal de la force (verdict « licite »), reset', () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const man = ctx.people.spawn({ kind: 'manifestant', x: 3, z: 0 });
    const events: string[] = [];
    ctx.events.on('law:authorized', (e) => events.push(`auth:${e.level}:${e.byId}`));
    ctx.events.on('law:force', (e) => events.push(`force:${e.report.means}:${e.report.verdict.kind}`));

    ctx.law.authorize(3, cop.id);
    expect(ctx.law.roe.authorizedForce).toBe(3);
    core.clock.advance(7);
    const v1 = ctx.law.reportForce(cop, 'lacrymo', null, 10, 11);
    const v2 = ctx.law.reportForce(cop, 'baton', man, 3, 0);
    expect([v1.kind, v1.severity, v2.kind]).toEqual(['licite', 0, 'licite']);
    expect(v1.reason.length).toBeGreaterThan(10);
    expect(ctx.law.forceLog.length).toBe(2);
    expect(ctx.law.forceLog[0]).toEqual({ t: 7, byId: cop.id, means: 'lacrymo', targetId: 0, x: 10, z: 11, verdict: v1, filmed: false });
    expect(ctx.law.forceLog[1]!.targetId).toBe(man.id);
    expect(events).toEqual([`auth:3:${cop.id}`, 'force:lacrymo:licite', 'force:baton:licite']);

    ctx.law.reset();
    expect(ctx.law.forceLog.length).toBe(0);
    expect(ctx.law.roe).toEqual({ dispersionOrdered: false, sommation: 0, sommationAt: 0, underAttack: false, lawfulForce: 1, authorizedForce: 1 });
  });
});

describe('radio neutre', () => {
  it('journal horodaté + événement radio:message', () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const got: string[] = [];
    ctx.events.on('radio:message', (e) => got.push(`${e.t}:${e.msg.from}:${e.msg.text}`));
    core.clock.advance(2);
    ctx.radio.say({ channel: 'commandement', from: 'TI 100', text: 'Alpha, tenez la ligne.', priority: 1 });
    core.clock.advance(1);
    ctx.radio.say({ channel: 'unite', from: 'Alpha 1', text: 'Reçu.', priority: 0, personId: 4 });
    expect(ctx.radio.log).toEqual([
      { channel: 'commandement', from: 'TI 100', text: 'Alpha, tenez la ligne.', priority: 1, t: 2 },
      { channel: 'unite', from: 'Alpha 1', text: 'Reçu.', priority: 0, personId: 4, t: 3 },
    ]);
    expect(got).toEqual(['2:TI 100:Alpha, tenez la ligne.', '3:Alpha 1:Reçu.']);
    for (let i = 0; i < 1200; i++) ctx.radio.say({ channel: 'public', from: 'x', text: String(i), priority: 0 });
    expect(ctx.radio.log.length).toBeLessThanOrEqual(500); // journal borné
    expect(ctx.radio.log.at(-1)!.text).toBe('1199');
    ctx.radio.clear();
    expect(ctx.radio.log.length).toBe(0);
  });
});

describe('joueur neutre', () => {
  it('état par défaut, possess, changement de personne', () => {
    const ctx = makeCtx();
    const pl = ctx.player;
    expect(pl.state).toEqual({
      personId: 0, role: 'crs', cameraMode: 'tps', camYaw: 0, camPitch: 0, zoom: 1, controlEnabled: true,
      charge: 0, prompt: null, aimedPersonId: 0, aimX: 0, aimZ: 0,
    });
    expect(pl.person()).toBeNull();
    expect(pl.vehicle()).toBeNull();

    const events: string[] = [];
    ctx.events.on('player:possessed', (e) => events.push(`${e.personId}:${e.role}`));
    const a = ctx.people.spawn({ kind: 'crs', x: 3, z: 4, heading: 0.7 });
    const b = ctx.people.spawn({ kind: 'journaliste', x: 9, z: 9 });
    pl.possess(a.id, 'commandant');
    expect(pl.person()).toBe(a);
    expect([a.isPlayer, pl.state.role, pl.state.camYaw]).toEqual([true, 'commandant', 0.7]);
    pl.possess(b.id); // rôle inchangé si non précisé
    expect([a.isPlayer, b.isPlayer, pl.state.personId, pl.state.role]).toEqual([false, true, b.id, 'commandant']);
    pl.possess(b.id, 'journaliste');
    expect(events).toEqual([`${a.id}:commandant`, `${b.id}:commandant`, `${b.id}:journaliste`]);

    pl.possess(424242); // personne inconnue : plus personne n'est incarné
    expect([pl.state.personId, b.isPlayer, pl.person()]).toEqual([0, false, null]);
    pl.possess(a.id);
    ctx.people.remove(a.id); // la personne incarnée disparaît
    expect(pl.person()).toBeNull();
  });

  it('caméra : bascule à pied et en véhicule', () => {
    const ctx = makeCtx();
    const pl = ctx.player;
    const modes: string[] = [];
    ctx.events.on('player:camera', (e) => modes.push(e.mode));
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    pl.possess(p.id);
    pl.toggleCamera();
    expect(pl.state.cameraMode).toBe('fps');
    pl.toggleCamera();
    expect(pl.state.cameraMode).toBe('tps');
    pl.setCameraMode('tactical');
    pl.setCameraMode('tactical'); // inchangé : pas d'événement
    pl.toggleCamera();
    expect(pl.state.cameraMode).toBe('tps');

    const v = ctx.vehicles.spawn('voiture', 0, 0, 0);
    ctx.vehicles.enter(p, v, 'driver');
    expect(pl.vehicle()).toBe(v);
    pl.toggleCamera();
    expect(pl.state.cameraMode).toBe('vehicle_ext');
    pl.toggleCamera();
    expect(pl.state.cameraMode).toBe('vehicle_int');
    pl.possess(p.id); // ré-incarnation en véhicule : mode véhicule conservé
    expect(pl.state.cameraMode).toBe('vehicle_int');
    expect(modes).toEqual(['fps', 'tps', 'tactical', 'tps', 'vehicle_ext', 'vehicle_int']);
  });
});

describe('interface, audio et entrées neutres', () => {
  it('l\'interface journalise en console en mode debug seulement', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const quiet = createNullUi(false);
    quiet.notify('Bonjour');
    quiet.banner('Titre');
    quiet.subtitle('Alpha', 'Reçu');
    expect(info).not.toHaveBeenCalled();

    const ui = createNullUi(true);
    ui.notify('Sommation en cours', 'warn', 3);
    ui.subtitle('Commissaire', 'Dispersez-vous.');
    ui.banner('Mission', 'Place de la République');
    expect(info.mock.calls.map((c) => String(c[0]))).toEqual([
      '[ui] notification (warn) : Sommation en cours',
      '[ui] sous-titre — Commissaire : Dispersez-vous.',
      '[ui] bandeau : Mission — Place de la République',
    ]);
    expect([ui.modal, ui.current]).toEqual([false, null]);
    ui.open('briefing', { id: 1 });
    expect([ui.modal, ui.current]).toEqual([false, 'briefing']);
    ui.close('pause'); // autre écran : sans effet
    expect(ui.current).toBe('briefing');
    ui.close();
    expect(ui.current).toBeNull();
  });

  it('audio sans effet, entrées à zéro', () => {
    const ctx = makeCtx();
    const h1 = ctx.audio.play('sirene_police', { x: 0, z: 0, loop: true });
    const h2 = ctx.audio.play('pas');
    expect(h1).toBeGreaterThan(0);
    expect(h2).not.toBe(h1);
    ctx.audio.stop(h1, 0.5);
    ctx.audio.speak('Obéissance à la loi.', { radio: true });
    ctx.audio.setListener(0, 1.7, 0, 0);

    const i = ctx.input;
    expect([i.moveX, i.moveY, i.lookX, i.lookY, i.throttle, i.brake, i.wheel]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect([i.device, i.pointerLocked]).toEqual(['kbm', false]);
    expect([i.down('primary'), i.pressed('interact'), i.released('jump')]).toEqual([false, false, false]);
    i.rumble(1, 0.2);
  });
});

describe('contexte — services supplémentaires', () => {
  it('provide / service / require, view nul en headless', () => {
    const ctx = makeCtx();
    expect(ctx.headless).toBe(true);
    expect(ctx.view).toBeNull();
    expect(ctx.service('missions')).toBeUndefined();
    expect(() => ctx.require('missions')).toThrow(/missions/);
    const api = { list: () => ['m1'] };
    ctx.provide('missions', api);
    expect(ctx.service<typeof api>('missions')).toBe(api);
    expect(ctx.require<typeof api>('missions').list()).toEqual(['m1']);
    ctx.provide('missions', 42); // remplacement
    expect(ctx.service('missions')).toBe(42);
    ctx.provide('faux', false); // une valeur « fausse » reste un service présent
    expect(ctx.require('faux')).toBe(false);
    expect(() => getCore({} as GameContext)).toThrow();
  });
});
