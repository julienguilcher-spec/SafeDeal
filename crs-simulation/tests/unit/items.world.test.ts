// Matériel — intégration avec le vrai monde statique (src/world/query, quartier d'essai) : façades,
// hauteur du bâti, toits. Si le module du monde ne se charge pas, ces tests sont ignorés.
import { beforeAll, describe, expect, it } from 'vitest';
import type { WorldQuery } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems, ITEMS_SERVICE } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { aimAt, face, record, spawn } from '@/sim/items/testkit';

let world: WorldQuery | null = null;

beforeAll(async () => {
  try {
    // import dynamique : si le module du monde change ou ne se charge plus, ces tests sont ignorés, pas en échec
    const { createWorldQuery } = await import('@/world/query');
    const w = createWorldQuery({ source: 'test' });
    await w.boot();
    w.setFocus(0, 0);
    await w.whenLoaded(0, 0, 800);
    world = w;
  } catch (err) {
    console.warn('[items] monde d\'essai indisponible : tests d\'intégration ignorés', err);
  }
});

async function setup() {
  const t = createTestContext({ seed: 21, modules: [createSystems] });
  await t.start();
  t.ctx.world = world!;
  const items = t.ctx.require<ItemsApi>(ITEMS_SERVICE);
  items.tuning.dispersion = 0;
  return { t, ctx: t.ctx, items };
}

describe('projectiles dans le quartier d\'essai', () => {
  it('un pavé lancé contre une façade la heurte et retombe sur le trottoir', async (test) => {
    if (!world) return test.skip();
    const { t, ctx } = await setup();
    // trottoir nord de l'avenue : façade en z = −20 (voir tests/unit/world-query.collision.test.ts)
    expect(ctx.world.buildingHeightAt(100, -25)).toBeGreaterThan(3);
    const impacts = record(ctx, 'projectile:impact');
    const m = spawn(ctx, 'manifestant', 100, -8);
    ctx.actions.give(m, 'pave', 2);
    ctx.actions.selectById(m, 'pave');
    t.step(1);
    face(m, Math.PI, 0.1); // vers le nord (−z)
    const id = ctx.actions.use(m, { power: 1 }).projectileId!;
    t.step(4);
    const wall = impacts.find((e) => e.id === id && e.hitKind === 'building');
    expect(wall, 'choc sur la façade').toBeDefined();
    expect(wall!.z).toBeGreaterThan(-20.2);
    expect(wall!.z).toBeLessThan(-19.8);
    expect(wall!.y).toBeGreaterThan(0.3);
    const stone = ctx.projectiles.get(id)!;
    expect(stone.resting).toBe(true);
    expect(stone.z).toBeGreaterThan(-20);
    expect(stone.z).toBeLessThan(-12);
    expect(ctx.world.buildingHeightAt(stone.x, stone.z)).toBe(0);
  });

  it('une grenade tirée en cloche par-dessus l\'immeuble se pose sur le toit', async (test) => {
    if (!world) return test.skip();
    const { t, ctx } = await setup();
    const roof = ctx.world.buildingHeightAt(100, -28) + ctx.world.heightAt(100, -28);
    const impacts = record(ctx, 'projectile:impact');
    const booms = record(ctx, 'explosion');
    // tireur dans l'avenue, 66 m plus à l'ouest ; la grenade retombe presque à la verticale sur le toit
    const crs = spawn(ctx, 'crs', 40, -2, 0, ['lanceur_cougar']);
    ctx.actions.give(crs, 'grenade_gm2l', 1);
    ctx.actions.selectById(crs, 'grenade_gm2l');
    t.step(1.5);
    const sol = aimAt(ctx, crs, 100, roof, -28)!;
    expect(sol).not.toBeNull();
    const id = ctx.actions.use(crs).projectileId!;
    t.step(sol.flightTime + 1.5);
    const landing = impacts.find((e) => e.id === id && e.hitKind === 'ground');
    expect(landing, 'la grenade a touché le toit').toBeDefined();
    expect(landing!.y).toBeGreaterThan(roof - 0.5);
    expect(Math.hypot(landing!.x - 100, landing!.z + 28)).toBeLessThan(2);
    // le retard était réglé pour une chute au niveau de la rue : elle attend sur le toit, puis détone
    t.step(4);
    expect(booms.length).toBe(1);
    expect(booms[0]!.y).toBeGreaterThan(roof - 0.5);
  });

  it('coût par pas avec les collisions réelles : 200 projectiles dans l\'avenue', async (test) => {
    if (!world) return test.skip();
    const { t, ctx } = await setup();
    for (let i = 0; i < 300; i++) ctx.people.spawn({ kind: 'manifestant', x: 40 + (i % 60) * 2, z: -12 + Math.floor(i / 60) * 4 });
    const kinds = ['pave', 'bouteille', 'grenade_lacrymo_main', 'lbd', 'debris', 'gm2l', 'mortier'];
    let seed = 1;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const costs: number[] = [];
    const dt = 1 / 30;
    for (let s = 0; s < 420; s++) {
      const list = ctx.projectiles.list;
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.resting && !list[i]!.emitting) ctx.projectiles.remove(list[i]!.id);
      let flying = 0;
      for (let i = 0; i < list.length; i++) if (!list[i]!.resting) flying++;
      while (flying < 200) {
        const a = rnd() * Math.PI * 2;
        const v = 8 + rnd() * 14;
        ctx.projectiles.spawn(kinds[Math.floor(rnd() * kinds.length)]!, 0, 40 + rnd() * 120, 1.7, -12 + rnd() * 20, Math.sin(a) * v, 2 + rnd() * 12, Math.cos(a) * v);
        flying++;
      }
      t.game.step(dt);
      if (s >= 120) {
        const perf = t.game.perf.find((p) => p.id === 'items');
        costs.push(perf ? perf.updateMs : NaN);
      }
    }
    costs.sort((a, b) => a - b);
    const median = costs[costs.length >> 1]!;
    const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
    console.log(`[perf items] monde réel (quartier d'essai), 200 projectiles en vol, 300 personnes : médiane ${median.toFixed(3)} ms par pas, moyenne ${mean.toFixed(3)} ms`);
    expect(median).toBeLessThan(1.5);
    // aucun projectile n'a traversé une façade : tous ceux qui reposent au sol sont hors du bâti ou sur un toit
    for (const p of ctx.projectiles.list) {
      if (!p.resting) continue;
      const roof = ctx.world.buildingHeightAt(p.x, p.z);
      if (roof > 0) expect(p.y - ctx.world.heightAt(p.x, p.z)).toBeGreaterThan(roof - 0.5);
    }
  });
});
