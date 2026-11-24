// États entretenus : exposition au gaz (service de dangers factice), masque à gaz et visière, feu, eau.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameEvents, Person } from '@/core/contracts';
import { createNullActions } from '@/core/null-services';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PeopleGearApi, PeopleHealthApi, PeopleLocomotionApi } from '@/sim/people';
import { createFakeHazards } from '@/sim/people/testkit';
import type { FakeHazards } from '@/sim/people/testkit';

async function setup(violence: 'sobre' | 'realiste' = 'realiste'): Promise<{ t: TestContext; ctx: GameContext; hz: FakeHazards }> {
  const t = createTestContext({ modules: [createSystems] });
  t.ctx.settings.set('violence', violence);
  await t.start();
  const hz = createFakeHazards();
  t.ctx.hazards = hz;
  return { t, ctx: t.ctx, hz };
}

function record<K extends keyof GameEvents>(ctx: GameContext, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  ctx.events.on(name, (e) => out.push({ ...e }));
  return out;
}

const actions = createNullActions();

describe('gaz lacrymogène', () => {
  it("l'exposition monte dans le nuage en ≈ 3 s, fait tousser et ralentit", async () => {
    const { t, ctx, hz } = await setup();
    const loco = ctx.require<PeopleLocomotionApi>('people.locomotion');
    const sfx = record(ctx, 'sfx');
    hz.emitGas(0, 0, 1, 10); // nuage dense de 10 m de rayon
    const inside = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const outside = ctx.people.spawn({ kind: 'manifestant', x: 30, z: 0 });
    t.step(1);
    expect(inside.gas).toBeGreaterThan(0.2);
    expect(inside.gas).toBeLessThan(0.5);
    t.step(2.5);
    expect(inside.gas).toBeGreaterThan(0.95);
    expect(outside.gas).toBe(0);
    // vitesse × 0,6 ; toux audible
    expect(loco.speedLimit(inside, 1)).toBeCloseTo(inside.speedRun * 0.6, 2);
    t.step(8);
    const coughs = sfx.filter((s) => s.id === 'toux');
    expect(coughs.length).toBeGreaterThanOrEqual(2);
    expect(coughs.length).toBeLessThanOrEqual(6);
    expect(inside.fear).toBeGreaterThan(0.1);
  });

  it('à l\'air libre la gêne retombe : moitié en 20 s, effets forts dissipés en 60 s, longue traîne', async () => {
    const { t, ctx, hz } = await setup();
    hz.emitGas(0, 0, 1, 10);
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    t.step(5);
    expect(p.gas).toBeCloseTo(1, 2);
    hz.clear();
    t.step(20);
    expect(p.gas).toBeGreaterThan(0.42);
    expect(p.gas).toBeLessThan(0.58);
    t.step(40);
    expect(p.gas).toBeLessThan(0.16);
    expect(p.gas).toBeGreaterThan(0.08);
    t.step(120); // gêne légère pendant quelques minutes
    expect(p.gas).toBeGreaterThan(0.02);
    expect(p.gas).toBeLessThan(0.08);
  });

  it('un masque à gaz protège presque totalement, un foulard retarde seulement', async () => {
    const { t, ctx, hz } = await setup();
    hz.emitGas(0, 0, 1, 50);
    const bare = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const scarf = ctx.people.spawn({ kind: 'manifestant', x: 3, z: 0 });
    scarf.gasProtection = 0.5;
    const masked = ctx.people.spawn({ kind: 'crs', x: 6, z: 0 });
    masked.gasProtection = 0.97;
    t.step(3);
    expect(bare.gas).toBeGreaterThan(0.85);
    expect(scarf.gas).toBeLessThan(0.4); // ≈ 8 s pour être vraiment gêné
    expect(masked.gas).toBeLessThan(0.05);
    t.step(8);
    expect(scarf.gas).toBeGreaterThan(0.7);
    expect(scarf.gas).toBeLessThanOrEqual(0.75);
    expect(masked.gas).toBeLessThan(0.05);
  });

  it('mettre le masque : il faut en avoir un ; protection, apparence et retour à l\'état antérieur', async () => {
    const { ctx } = await setup();
    const gear = ctx.require<PeopleGearApi>('people.gear');
    const none = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    expect(gear.hasMask(none)).toBe(false);
    expect(gear.setGasMask(none, true)).toBe(false);
    expect(none.look.gasMask).toBe(false);
    const crs = ctx.people.spawn({ kind: 'crs', x: 5, z: 0 });
    actions.give(crs, 'masque_gaz', 1);
    crs.gasProtection = 0.1;
    expect(gear.setGasMask(crs, true)).toBe(true);
    expect(crs.look.gasMask).toBe(true);
    expect(crs.gasProtection).toBe(0.97);
    expect(gear.setGasMask(crs, false)).toBe(true);
    expect(crs.look.gasMask).toBe(false);
    expect(crs.gasProtection).toBe(0.1);
    // visière : protège le visage, et se relève sans dérive de la protection
    const head = crs.armorHead;
    expect(gear.hasVisor(crs)).toBe(true);
    expect(gear.setVisor(crs, true)).toBe(true);
    expect(crs.look.visorDown).toBe(true);
    expect(crs.armorHead).toBeCloseTo(head + 0.12, 5);
    gear.setVisor(crs, false);
    gear.setVisor(crs, true);
    gear.setVisor(crs, false);
    expect(crs.armorHead).toBeCloseTo(head, 10);
    expect(gear.setVisor(none, true)).toBe(false); // pas de casque à visière
  });

  it('exposition forte de plus de 40 s : la personne se plie en deux ; le rinçage accélère la récupération', async () => {
    const { t, ctx, hz } = await setup();
    const ext = ctx.require<PeopleHealthApi>('people.health');
    hz.emitGas(0, 0, 1, 50);
    const a = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'manifestant', x: 3, z: 0 });
    t.step(30);
    expect(a.stun).toBe(0);
    t.step(15);
    expect(a.stun).toBeGreaterThan(0.5);
    hz.clear();
    ext.rinseEyes(b, 99);
    t.step(15);
    expect(b.gas).toBeLessThan(a.gas * 0.5);
  });

  it('un coup de type « gas » (gazeuse à main) augmente directement l\'exposition, selon la protection', async () => {
    const { ctx } = await setup();
    const bare = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const masked = ctx.people.spawn({ kind: 'crs', x: 5, z: 0 });
    masked.gasProtection = 0.97;
    for (const p of [bare, masked]) ctx.health.hurt(p, { amount: 30, kind: 'gas', sourceId: 0, x: p.x, z: 1 });
    expect(bare.gas).toBeCloseTo(0.6, 5);
    expect(masked.gas).toBeLessThan(0.03);
    expect(bare.health).toBeGreaterThan(98);
  });
});

describe('feu', () => {
  it('dans les flammes la personne s\'enflamme, brûle, prend peur ; sortie du feu, elle s\'éteint avec le temps', async () => {
    const { t, ctx, hz } = await setup();
    const started = record(ctx, 'fire:started');
    const out = record(ctx, 'fire:out');
    const hurt = record(ctx, 'person:hurt');
    const fx = record(ctx, 'fx');
    hz.ignite(0, 0, 2, 1, 0);
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    t.step(1.2);
    expect(p.burning).toBeGreaterThan(0.9);
    expect(started).toEqual([{ x: 0, z: 0, targetKind: 'person', targetId: p.id, sourceId: 0 }]);
    expect(p.health).toBeLessThan(97);
    expect(p.fear).toBeGreaterThan(0.3);
    expect(fx.some((f) => f.id === 'feu')).toBe(true);
    // elle sort du feu
    p.x = 20;
    const h0 = p.health;
    t.step(4);
    expect(p.burning).toBeGreaterThan(0.3);
    expect(p.health).toBeLessThan(h0);
    expect(hurt.some((h) => h.info.kind === 'burn')).toBe(true);
    t.step(8);
    expect(p.burning).toBe(0);
    expect(out.length).toBe(1);
    expect(out[0]!.targetId).toBe(p.id);
    const h1 = p.health;
    t.step(1);
    expect(p.health).toBeGreaterThan(h1 - 1); // ne brûle plus (seule la blessure s'aggrave lentement)
  });

  it("l'eau éteint : personne trempée, jet d'eau, extinction par un tiers", async () => {
    const { t, ctx } = await setup();
    const ext = ctx.require<PeopleHealthApi>('people.health');
    const mk = (x: number): Person => {
      const p = ctx.people.spawn({ kind: 'manifestant', x, z: 0 });
      ctx.health.hurt(p, { amount: 30, kind: 'burn', sourceId: 0, x, z: 0 }); // cocktail : embrasement complet
      return p;
    };
    const dry = mk(0);
    const soaked = mk(10);
    const hosed = mk(20);
    const helped = mk(30);
    expect(dry.burning).toBe(1);
    soaked.wet = 1;
    ctx.health.hurt(hosed, { amount: 4, kind: 'water', sourceId: 0, x: 20, z: 5, dirX: 0, dirZ: -1 });
    ext.extinguish(helped, 42);
    expect(hosed.burning).toBe(0);
    expect(hosed.wet).toBeGreaterThan(0.3);
    expect(helped.burning).toBe(0);
    t.step(1);
    expect(soaked.burning).toBe(0);
    expect(dry.burning).toBeGreaterThan(0.8);
  });

  it('une tenue ignifugée s\'enflamme moins vite ; en violence « sobre » le feu ne tue pas', async () => {
    const { t, ctx, hz } = await setup('sobre');
    hz.ignite(0, 0, 30, 0.6, 0);
    const civil = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const crs = ctx.people.spawn({ kind: 'crs', x: 5, z: 0 });
    t.step(0.8);
    expect(crs.burning).toBeLessThan(civil.burning * 0.65);
    t.step(60);
    expect(civil.injury).toBe('critical');
    expect(civil.health).toBe(1);
    expect(civil.posture).toBe('down');
  });

  it('en violence « réaliste », rester dans le feu est mortel', async () => {
    const { t, ctx, hz } = await setup('realiste');
    hz.ignite(0, 0, 30, 1, 0);
    const civil = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    t.step(30);
    expect(civil.injury).toBe('dead');
    expect(civil.burning).toBe(0);
  });
});

describe('eau', () => {
  it('la pluie mouille peu à peu, puis on sèche', async () => {
    const { t, ctx } = await setup();
    const p = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    ctx.env.setWeather('averse', true);
    t.step(30);
    expect(p.wet).toBeGreaterThan(0.5);
    ctx.env.setWeather('clair', true);
    const w = p.wet;
    t.step(60);
    expect(p.wet).toBeLessThan(w - 0.2);
    expect(p.wet).toBeGreaterThan(0);
  });
});
