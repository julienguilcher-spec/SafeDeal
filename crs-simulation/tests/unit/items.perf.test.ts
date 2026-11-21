// Matériel — coût par pas de simulation. Les seuils sont volontairement larges (machines de test
// hétérogènes) ; les chiffres utiles sont dans la sortie console. Objectif : moins de 1 ms par pas
// pour 200 projectiles.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createRng } from '@/core/rng';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/items';
import { face, spawn } from '@/sim/items/testkit';

async function setup(people: number): Promise<{ t: TestContext; ctx: GameContext; crowd: Person[] }> {
  const t = createTestContext({ seed: 77, modules: [createSystems] });
  await t.start();
  const { ctx } = t;
  const rng = createRng(5);
  const crowd: Person[] = [];
  for (let i = 0; i < people; i++) {
    crowd.push(ctx.people.spawn({ kind: i % 5 === 0 ? 'crs' : 'manifestant', x: rng.range(-40, 40), z: rng.range(-25, 25) }));
  }
  return { t, ctx, crowd };
}

/** Temps passé dans update() du système « items » pendant un pas (ms). */
function stepCost(t: TestContext, dt: number): number {
  t.game.step(dt);
  const perf = t.game.perf;
  for (let i = 0; i < perf.length; i++) if (perf[i]!.id === 'items') return perf[i]!.updateMs;
  return NaN;
}

/** Médiane, moyenne et 99e centile d'une série de coûts (ms). */
function stats(costs: number[]): { median: number; mean: number; p99: number; worst: number } {
  const sorted = costs.slice().sort((a, b) => a - b);
  return {
    median: sorted[sorted.length >> 1]!,
    mean: costs.reduce((a, b) => a + b, 0) / costs.length,
    p99: sorted[Math.floor(sorted.length * 0.99)]!,
    worst: sorted[sorted.length - 1]!,
  };
}

interface GcObserver { observe(o: { entryTypes: string[] }): void; disconnect(): void }
type GcObserverCtor = new (cb: (list: { getEntries(): unknown[] }) => void) => GcObserver;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Nombre de passages du ramasse-miettes pendant fn (NaN si non mesurable). */
async function gcRuns(fn: () => void): Promise<number> {
  const Ctor = (globalThis as { PerformanceObserver?: GcObserverCtor }).PerformanceObserver;
  if (!Ctor) return Number.NaN;
  let runs = 0;
  let obs: GcObserver;
  try {
    obs = new Ctor((list) => void (runs += list.getEntries().length));
    obs.observe({ entryTypes: ['gc'] });
  } catch {
    return Number.NaN;
  }
  await sleep(30);
  runs = 0;
  fn();
  await sleep(60);
  obs.disconnect();
  return runs;
}

const KINDS = ['pave', 'bouteille', 'grenade_lacrymo_main', 'palet_lacrymo', 'lbd', 'debris', 'gm2l', 'plot_caoutchouc', 'mortier', 'fumigene'];

describe('coût par pas', () => {
  it('200 projectiles en vol au-dessus de 300 personnes', async () => {
    const { t, ctx } = await setup(300);
    const rng = createRng(9);
    const dt = 1 / 30;
    // on maintient 200 projectiles en l'air : chaque projectile retombé ou disparu est remplacé
    const refill = (): void => {
      const list = ctx.projectiles.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!;
        if (p.resting && !p.emitting) ctx.projectiles.remove(p.id);
      }
      let flying = 0;
      for (let i = 0; i < list.length; i++) if (!list[i]!.resting) flying++;
      while (flying < 200) {
        const kind = KINDS[rng.int(0, KINDS.length)]!;
        const a = rng.range(0, Math.PI * 2);
        const v = rng.range(8, 22);
        ctx.projectiles.spawn(kind, 0, rng.range(-40, 40), rng.range(1.5, 2), rng.range(-25, 25), Math.sin(a) * v, rng.range(2, 14), Math.cos(a) * v);
        flying++;
      }
    };
    for (let i = 0; i < 120; i++) { // échauffement
      refill();
      t.game.step(dt);
    }
    const costs: number[] = [];
    let flyingSum = 0;
    let countSum = 0;
    const steps = 900;
    for (let i = 0; i < steps; i++) {
      refill();
      let flying = 0;
      for (const p of ctx.projectiles.list) if (!p.resting) flying++;
      flyingSum += flying;
      countSum += ctx.projectiles.list.length;
      costs.push(stepCost(t, dt));
    }
    const s = stats(costs);
    console.log(`[perf items] ${(flyingSum / steps).toFixed(0)} projectiles en vol (${(countSum / steps).toFixed(0)} en tout, palets et fumigènes au sol compris), 300 personnes : médiane ${s.median.toFixed(3)} ms par pas, moyenne ${s.mean.toFixed(3)} ms, 99e centile ${s.p99.toFixed(2)} ms, pire pas ${s.worst.toFixed(2)} ms`);
    // objectif : moins de 1 ms par pas (la médiane ignore les pauses du ramasse-miettes et de la machine de test)
    expect(s.median).toBeLessThan(1);
    expect(s.mean).toBeLessThan(4);
  });

  it('200 projectiles en vol haut (aucun choc) et 200 palets qui fument au sol : aucune allocation', async () => {
    const { t, ctx } = await setup(300);
    const dt = 1 / 30;
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      ctx.projectiles.spawn('grenade_lacrymo_56', 0, rng.range(-40, 40), 4000, rng.range(-25, 25), rng.range(-5, 5), 0, rng.range(-5, 5)).fuse = Infinity;
    }
    for (let i = 0; i < 200; i++) {
      const p = ctx.projectiles.spawn('palet_lacrymo', 0, rng.range(-40, 40), 0.025, rng.range(-25, 25), 0, 0, 0);
      p.fuse = 1e9;
    }
    for (let i = 0; i < 90; i++) t.game.step(dt); // les palets se posent
    expect(ctx.projectiles.list.filter((p) => p.resting).length).toBe(200);
    const costs: number[] = [];
    const steps = 600;
    const gc = await gcRuns(() => {
      for (let i = 0; i < steps; i++) costs.push(stepCost(t, dt));
    });
    const s = stats(costs);
    console.log(`[perf items] 200 en vol libre + 200 palets émetteurs au repos : médiane ${s.median.toFixed(3)} ms par pas, moyenne ${s.mean.toFixed(3)} ms ; passages du ramasse-miettes sur ${steps} pas : ${gc}`);
    expect(ctx.projectiles.list.length).toBe(400);
    expect(s.median).toBeLessThan(1);
    // boucle sans allocation : au plus un passage dû au banc de mesure lui-même
    if (!Number.isNaN(gc)) expect(gc).toBeLessThanOrEqual(2);
  });

  it('visée et usage : coût d\'un appel', async () => {
    const { t, ctx } = await setup(300);
    const out = { yaw: 0, pitch: 0, power: 1, flightTime: 0 };
    const bench = (label: string, n: number, fn: () => void): number => {
      for (let i = 0; i < Math.min(n, 50); i++) fn();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) fn();
      const us = ((performance.now() - t0) / n) * 1000;
      console.log(`[perf items] ${label} : ${us.toFixed(1)} µs`);
      return us;
    };
    const p = spawn(ctx, 'crs', 100, 100, 0, ['grenade_lacrymo', 'lanceur_cougar', 'lbd40', 'tonfa']);
    ctx.actions.selectById(p, 'grenade_lacrymo');
    const lob = bench('solveAim, grenade à main à 20 m', 2000, () => ctx.actions.solveAim(p, 100, 0, 120, out));
    ctx.actions.selectById(p, 'lbd40');
    const direct = bench('solveAim, LBD à 30 m', 2000, () => ctx.actions.solveAim(p, 100, 1.2, 130, out));
    ctx.actions.selectById(p, 'lanceur_cougar');
    const cloche = bench('solveAim, lanceur 56 à 150 m (choix du dispositif compris)', 500, () => ctx.actions.solveAim(p, 100, 0, 250, out));
    ctx.env.setWind(5, 2);
    const windy = bench('solveAim, lanceur 56 à 150 m par vent de 5 m/s', 300, () => ctx.actions.solveAim(p, 100, 0, 250, out));
    ctx.env.setWind(0, 0);
    ctx.actions.selectById(p, 'tonfa');
    face(p, 0);
    t.step(1);
    const check = bench('canUse', 20000, () => ctx.actions.canUse(p));
    expect(lob).toBeLessThan(2000);
    expect(direct).toBeLessThan(2000);
    expect(cloche).toBeLessThan(5000);
    expect(windy).toBeLessThan(10000);
    expect(check).toBeLessThan(50);
  });
});
