// Matériel — visée balistique : solveAim puis tir réel, le projectile doit tomber sur la cible.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems, ITEMS_SERVICE } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { aimAt, face, record, spawn } from '@/sim/items/testkit';

async function setup(seed = 1): Promise<TestContext> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start();
  return t;
}

function items(ctx: GameContext): ItemsApi {
  return ctx.require<ItemsApi>(ITEMS_SERVICE);
}

interface Shot { missAtImpact: number; flight: number; predicted: number; impactX: number; impactZ: number }

/**
 * solveAim sur (tx, 0, tz), mise en joue, tir, puis simulation jusqu'au premier contact avec le sol.
 * Retourne l'écart entre ce point de chute et la cible.
 */
function shootAt(t: TestContext, p: Person, tx: number, tz: number, dt = 1 / 30): Shot {
  const { ctx } = t;
  const sol = aimAt(ctx, p, tx, 0, tz);
  expect(sol, `visée vers (${tx}, ${tz})`).not.toBeNull();
  const predicted = sol!.flightTime;
  const impacts = record(ctx, 'projectile:impact');
  const r = ctx.actions.use(p, { power: sol!.power });
  expect(r.ok).toBe(true);
  const id = r.projectileId!;
  const t0 = ctx.clock.now;
  for (let i = 0; i < 2000; i++) {
    t.step(dt, dt);
    const hit = impacts.find((e) => e.id === id && e.hitKind === 'ground');
    if (hit) {
      return { missAtImpact: Math.hypot(hit.x - tx, hit.z - tz), flight: ctx.clock.now - t0, predicted, impactX: hit.x, impactZ: hit.z };
    }
    if (!ctx.projectiles.get(id)) break;
  }
  throw new Error('le projectile n\'a jamais touché le sol');
}

function ready(t: TestContext, p: Person, id: string): void {
  t.ctx.actions.selectById(p, id);
  t.step(1.5);
}

describe('solveAim puis tir : précision sans dispersion', () => {
  it('grenade lacrymogène à main à 20 m : tombe à moins de 2 m de la cible', async () => {
    const t = await setup();
    const { ctx } = t;
    items(ctx).tuning.dispersion = 0;
    const p = spawn(ctx, 'crs', 3, -2, 0, ['grenade_lacrymo']);
    ready(t, p, 'grenade_lacrymo');
    const s = shootAt(t, p, 3 + 12, -2 + 16); // 20 m en diagonale
    console.log(`[visée] grenade à main, 20 m : écart ${s.missAtImpact.toFixed(2)} m, vol ${s.flight.toFixed(2)} s (prévu ${s.predicted.toFixed(2)} s)`);
    expect(s.missAtImpact).toBeLessThan(2);
    expect(s.missAtImpact).toBeLessThan(0.5);
    expect(Math.abs(s.flight - s.predicted)).toBeLessThan(0.1);
  });

  it('pavé à 8 m (puissance réduite) et à 22 m (pleine force)', async () => {
    const t = await setup();
    const { ctx } = t;
    items(ctx).tuning.dispersion = 0;
    const p = spawn(ctx, 'manifestant', 0, 0, 0);
    ctx.actions.give(p, 'pave', 3);
    ready(t, p, 'pave');
    const near = shootAt(t, p, 0, 8);
    t.step(2);
    const far = shootAt(t, p, -22, 0);
    console.log(`[visée] pavé : 8 m → ${near.missAtImpact.toFixed(2)} m ; 22 m → ${far.missAtImpact.toFixed(2)} m`);
    expect(near.missAtImpact).toBeLessThan(0.5);
    expect(far.missAtImpact).toBeLessThan(0.5);
  });

  it('grenade tirée au lanceur de 56 mm à 50, 100 et 200 m : tombe à moins de 2 m de la cible', async () => {
    const t = await setup();
    const { ctx } = t;
    items(ctx).tuning.dispersion = 0;
    const p = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar']);
    ctx.actions.give(p, 'grenade_gm2l', 2);
    ready(t, p, 'grenade_gm2l');
    for (const [d, range] of [[50, 50], [100, 100], [200, 200], [75, 100], [140, 200]] as const) {
      ctx.actions.give(p, 'grenade_gm2l', 1);
      const s = shootAt(t, p, d * 0.6, d * 0.8);
      console.log(`[visée] lanceur 56, ${d} m : écart ${s.missAtImpact.toFixed(2)} m, vol ${s.flight.toFixed(2)} s, dispositif ${items(ctx).launcherRange(p)} m, site ${(p.aimPitch * 180 / Math.PI + 30).toFixed(1)}°`);
      expect(s.missAtImpact, `${d} m`).toBeLessThan(2);
      expect(s.missAtImpact, `${d} m`).toBeLessThan(0.6);
      // l'IA a choisi le dispositif de propulsion le plus court qui porte
      expect(items(ctx).launcherRange(p)).toBe(range);
      // tir en cloche : jamais sous 30°
      expect(p.aimPitch).toBeGreaterThanOrEqual(-1e-9);
      t.step(9);
    }
  });

  it('reste juste quel que soit le pas de simulation (1/20, 1/30, 1/60 s)', async () => {
    for (const dt of [1 / 20, 1 / 30, 1 / 60]) {
      const t = await setup();
      const { ctx } = t;
      items(ctx).tuning.dispersion = 0;
      const p = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar', 'grenade_lacrymo']);
      ctx.actions.give(p, 'grenade_gm2l', 2);
      ready(t, p, 'grenade_gm2l');
      const far = shootAt(t, p, 0, 100, dt);
      ready(t, p, 'grenade_lacrymo');
      const near = shootAt(t, p, 20, 0, dt);
      console.log(`[visée] pas ${(1 / dt).toFixed(0)} Hz : 100 m → ${far.missAtImpact.toFixed(2)} m ; 20 m → ${near.missAtImpact.toFixed(2)} m`);
      expect(far.missAtImpact).toBeLessThan(1);
      expect(near.missAtImpact).toBeLessThan(0.5);
    }
  });

  it('compense le vent de travers et le déplacement du tireur', async () => {
    const t = await setup();
    const { ctx } = t;
    items(ctx).tuning.dispersion = 0;
    ctx.env.setWind(6, -3);
    const p = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar', 'grenade_lacrymo']);
    ctx.actions.give(p, 'grenade_gm2l', 2);
    ready(t, p, 'grenade_gm2l');
    const windy = shootAt(t, p, 0, 100);
    // sans correction (même site, cap droit sur la cible), la dérive est de plusieurs mètres
    face(p, 0, p.aimPitch);
    t.step(9);
    ctx.actions.give(p, 'grenade_gm2l', 1);
    const impacts = record(ctx, 'projectile:impact');
    const id = ctx.actions.use(p).projectileId!;
    t.step(14);
    const raw = impacts.find((e) => e.id === id && e.hitKind === 'ground')!;
    const drift = Math.abs(raw.x);
    console.log(`[visée] vent 6,7 m/s : écart corrigé ${windy.missAtImpact.toFixed(2)} m ; dérive sans correction ${drift.toFixed(1)} m`);
    expect(windy.missAtImpact).toBeLessThan(1);
    expect(drift).toBeGreaterThan(3);
    // tireur en mouvement : sa vitesse s'ajoute à celle de la grenade
    ctx.env.setWind(0, 0);
    ready(t, p, 'grenade_lacrymo');
    p.vx = 3;
    p.vz = 0;
    const moving = shootAt(t, p, p.x, p.z + 18);
    expect(moving.missAtImpact).toBeLessThan(0.6);
  });

  it('grenade de désencerclement roulée : détone à moins de 2 m du point visé', async () => {
    const t = await setup();
    const { ctx } = t;
    items(ctx).tuning.dispersion = 0;
    const p = spawn(ctx, 'crs', 0, 0, 0, ['grenade_desencerclement']);
    ready(t, p, 'grenade_desencerclement');
    const sol = aimAt(ctx, p, 9, 0, 12)!; // 15 m
    expect(sol).not.toBeNull();
    const booms = record(ctx, 'explosion');
    expect(ctx.actions.use(p, { power: sol.power }).ok).toBe(true);
    t.step(2);
    expect(booms.length).toBe(1);
    expect(booms[0]!.kind).toBe('desencerclement');
    const miss = Math.hypot(booms[0]!.x - 9, booms[0]!.z - 12);
    console.log(`[visée] désencerclement roulée à 15 m : détonation à ${miss.toFixed(2)} m du point visé, ${booms[0]!.y.toFixed(2)} m du sol`);
    expect(miss).toBeLessThan(2);
    // roulée au ras du sol : elle détone au sol
    expect(booms[0]!.y).toBeLessThan(0.3);
  });
});

describe('solveAim : portée et choix', () => {
  it('refuse les cibles hors de portée', async () => {
    const t = await setup();
    const { ctx } = t;
    const a = ctx.actions;
    const out = { yaw: 0, pitch: 0, power: 0, flightTime: 0 };
    const p = spawn(ctx, 'crs', 0, 0, 0, ['grenade_lacrymo', 'lanceur_cougar', 'lbd40', 'tonfa', 'grenade_desencerclement']);
    expect(a.solveAim(p, 0, 0, 20, out)).toBe(false); // mains nues
    a.selectById(p, 'grenade_lacrymo');
    expect(a.solveAim(p, 0, 0, 25, out)).toBe(true);
    expect(out.power).toBeGreaterThan(0.7);
    expect(a.solveAim(p, 0, 0, 45, out)).toBe(false);
    expect(a.solveAim(p, 0, 0, 6, out)).toBe(true);
    expect(out.power).toBeLessThan(0.3);
    a.selectById(p, 'lanceur_cougar');
    expect(a.solveAim(p, 0, 0, 12, out)).toBe(false); // trop près pour un tir en cloche
    expect(a.solveAim(p, 0, 0, 320, out)).toBe(false);
    expect(a.solveAim(p, 0, 0, 200, out)).toBe(true);
    a.selectById(p, 'grenade_desencerclement');
    expect(a.solveAim(p, 0, 0, 14, out)).toBe(true);
    expect(a.solveAim(p, 0, 0, 60, out)).toBe(false);
    // objet sans projectile : visée géométrique, vraie à portée de l'objet
    a.selectById(p, 'tonfa');
    expect(a.solveAim(p, 0, 1, 1, out)).toBe(true);
    expect(out.yaw).toBeCloseTo(0);
    expect(a.solveAim(p, 3, 1, 0, out)).toBe(false);
    expect(out.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('ne change pas le dispositif de propulsion du joueur dans son dos', async () => {
    const t = await setup();
    const { ctx } = t;
    const out = { yaw: 0, pitch: 0, power: 0, flightTime: 0 };
    const p = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar']);
    ctx.actions.selectById(p, 'lanceur_cougar');
    p.isPlayer = true;
    expect(items(ctx).launcherRange(p)).toBe(100);
    expect(ctx.actions.solveAim(p, 0, 0, 180, out)).toBe(false); // hors de portée avec le dispositif de 100 m
    expect(items(ctx).launcherRange(p)).toBe(100);
    expect(ctx.actions.solveAim(p, 0, 0, 90, out)).toBe(true);
    p.isPlayer = false;
    expect(ctx.actions.solveAim(p, 0, 0, 180, out)).toBe(true);
    expect(items(ctx).launcherRange(p)).toBe(200);
  });

  it('aide à la visée : le point de chute prévu est celui du tir réel', async () => {
    const t = await setup();
    const { ctx } = t;
    items(ctx).tuning.dispersion = 0;
    const p = spawn(ctx, 'crs', 5, 5, 0, ['grenade_lacrymo']);
    ready(t, p, 'grenade_lacrymo');
    face(p, 0.7, 0.35);
    const predicted = { x: 0, y: 0, z: 0 };
    expect(items(ctx).predictImpact(p, 0.75, predicted)).toBe(true);
    const path: number[] = [];
    const n = items(ctx).sampleTrajectory(p, 0.75, path, 24);
    expect(n).toBeGreaterThan(8);
    expect(path.length).toBe(n * 3);
    expect(Math.hypot(path[path.length - 3]! - predicted.x, path[path.length - 1]! - predicted.z)).toBeLessThan(1);
    const impacts = record(ctx, 'projectile:impact');
    const id = ctx.actions.use(p, { power: 0.75 }).projectileId!;
    t.step(2.1);
    const hit = impacts.find((e) => e.id === id && e.hitKind === 'ground')!;
    expect(Math.hypot(hit.x - predicted.x, hit.z - predicted.z)).toBeLessThan(0.3);
    ctx.actions.select(p, -1);
    expect(items(ctx).predictImpact(p, 1, predicted)).toBe(false);
  });
});

describe('dispersion', () => {
  it('les lancers réels se répartissent autour de la cible, davantage si le lanceur est épuisé et gazé', async () => {
    const t = await setup(42);
    const { ctx } = t;
    const spread = (tired: boolean, d: number): { mean: number; worst: number; distinct: number } => {
      const misses: number[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const p = spawn(ctx, 'manifestant', i * 40, tired ? 500 : d * 100, 0);
        p.look.build = 1;
        ctx.actions.give(p, 'pave', 1);
        ready(t, p, 'pave');
        if (tired) {
          p.stamina = 10;
          p.gas = 0.8;
        }
        const s = shootAt(t, p, p.x, p.z + d);
        misses.push(s.missAtImpact);
        seen.add(s.impactX.toFixed(3));
      }
      misses.sort((a, b) => a - b);
      return { mean: misses.reduce((a, b) => a + b, 0) / misses.length, worst: misses[misses.length - 1]!, distinct: seen.size };
    };
    const ref = spread(false, 20);
    const fresh = spread(false, 12);
    const tired = spread(true, 12);
    console.log(`[dispersion] pavé à 20 m : écart moyen ${ref.mean.toFixed(2)} m (pire ${ref.worst.toFixed(2)} m) ; à 12 m : ${fresh.mean.toFixed(2)} m, épuisé et gazé : ${tired.mean.toFixed(2)} m`);
    // dossier 03 : dispersion de l'ordre de ± 3 m à 20 m
    expect(ref.distinct).toBe(30);
    expect(ref.mean).toBeGreaterThan(0.5);
    expect(ref.mean).toBeLessThan(3);
    expect(ref.worst).toBeLessThan(8);
    expect(tired.mean).toBeGreaterThan(fresh.mean * 1.8);
  });
});
