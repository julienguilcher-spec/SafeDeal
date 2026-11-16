// Coût du module par pas de simulation avec 150 véhicules (objectif : moins de 1,5 ms), et allocations.
// Les seuils sont larges (machines de test hétérogènes) : ce fichier sert surtout à produire des chiffres.
import { describe, expect, it } from 'vitest';
import type { Vehicle, VehicleKind } from '@/core/contracts';
import { VEHICLES_SYSTEM_ID } from '@/sim/vehicles';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { FakeRoadEdge, FakeRoadNode, VehicleBench } from '@/sim/vehicles/testkit';

const DT = 1 / 30;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface GcObserver { observe(options: { entryTypes: string[] }): void; disconnect(): void }
type GcObserverCtor = new (cb: (list: { getEntries(): unknown[] }) => void) => GcObserver;

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

/** Quadrillage de rues : n × n carrefours espacés de `step` mètres. */
function grid(n: number, step: number): { nodes: FakeRoadNode[]; edges: FakeRoadEdge[] } {
  const nodes: FakeRoadNode[] = [];
  const edges: FakeRoadEdge[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push({ x: i * step, z: j * step });
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i + 1 < n) edges.push({ a: j * n + i, b: j * n + i + 1 });
      if (j + 1 < n) edges.push({ a: j * n + i, b: (j + 1) * n + i });
    }
  }
  return { nodes, edges };
}

/** Temps moyen et maximal passé dans update() du module pendant `steps` pas (ms). */
function measure(b: VehicleBench, steps: number, each?: (i: number) => void): { mean: number; max: number } {
  const perf = b.t.game.perf.find((p) => p.id === VEHICLES_SYSTEM_ID)!;
  let total = 0;
  let max = 0;
  for (let i = 0; i < steps; i++) {
    each?.(i);
    b.t.game.step(DT);
    total += perf.updateMs;
    if (perf.updateMs > max) max = perf.updateMs;
  }
  return { mean: total / steps, max };
}

const PARKED: VehicleKind[] = ['voiture', 'citadine', 'suv', 'utilitaire', 'taxi', 'fourgon_crs', 'scooter', 'camion', 'bus', 'voiture_police'];

describe('performances des véhicules', () => {
  it('150 véhicules en ville : 40 en circulation sous pilote automatique, 110 garés, 120 piétons', async () => {
    const g = grid(5, 120);
    const b = await createVehicleBench({ world: createFakeWorld({ nodes: g.nodes, edges: g.edges }) });
    const rng = b.ctx.rng.fork('perf');
    // véhicules garés le long des rues (hors chaussée)
    for (let i = 0; i < 110; i++) {
      const row = i % 5;
      b.spawn(PARKED[i % PARKED.length]!, 20 + Math.floor(i / 5) * 20, row * 120 + 6.5, Math.PI / 2);
    }
    // circulation
    const moving: Vehicle[] = [];
    const dispatch = (v: Vehicle): void => {
      const n = g.nodes[rng.int(0, g.nodes.length)]!;
      b.autopilot.driveTo(v, n.x + rng.range(-30, 30), n.z, {});
    };
    for (let i = 0; i < 40; i++) {
      const v = b.spawn(i % 8 === 0 ? 'fourgon_crs' : i % 5 === 0 ? 'bus' : 'voiture', (i % 5) * 120 - 1.75, 15 + Math.floor(i / 5) * 60, 0);
      moving.push(v);
      dispatch(v);
    }
    // piétons sur les trottoirs et aux carrefours
    for (let i = 0; i < 120; i++) b.person('passant', rng.range(0, 480), (i % 5) * 120 + (i % 2 === 0 ? 5 : -5));
    expect(b.ctx.vehicles.list.length).toBe(150);
    const redispatch = (i: number): void => {
      if (i % 30 !== 0) return;
      for (const v of moving) {
        const st = b.autopilot.status(v).state;
        if (st !== 'en_route' && st !== 'attente') dispatch(v);
      }
    };
    measure(b, 600, redispatch); // mise en température
    const res = measure(b, 1800, redispatch);
    const awake = b.ctx.vehicles.list.filter((v) => !b.ext.dynamics(v).asleep).length;
    const rolling = moving.filter((v) => Math.abs(v.speed) > 0.5).length;
    console.log(`[perf] 150 véhicules en ville (${awake} éveillés, ${rolling} roulent) : ${res.mean.toFixed(3)} ms par pas en moyenne, ${res.max.toFixed(2)} ms au pire`);
    expect(rolling).toBeGreaterThan(15);
    expect(res.mean).toBeLessThan(1.5);
  });

  it('pire cas : 150 véhicules tous en mouvement, au milieu de 200 personnes', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const rng = b.ctx.rng.fork('perf2');
    const list: Vehicle[] = [];
    for (let i = 0; i < 150; i++) {
      const v = b.spawn(PARKED[i % PARKED.length]!, (i % 15) * 40, Math.floor(i / 15) * 40, rng.range(-3, 3));
      v.engineOn = true;
      v.brain = { test: true }; // conduit par un autre module, sans conducteur
      list.push(v);
    }
    for (let i = 0; i < 200; i++) b.person('passant', rng.range(0, 600), rng.range(0, 400));
    const drive = (i: number): void => {
      if (i % 20 !== 0) return;
      for (let k = 0; k < list.length; k++) {
        const v = list[k]!;
        v.cmd.throttle = v.speed < 8 ? 0.6 : 0;
        v.cmd.steer = Math.sin(i * 0.01 + k) * 0.5;
      }
    };
    measure(b, 300, drive);
    const res = measure(b, 1200, drive);
    const rolling = list.filter((v) => Math.abs(v.speed) > 0.5).length;
    console.log(`[perf] 150 véhicules tous en mouvement (${rolling} roulent) : ${res.mean.toFixed(3)} ms par pas en moyenne, ${res.max.toFixed(2)} ms au pire`);
    expect(rolling).toBeGreaterThan(100);
    expect(res.mean).toBeLessThan(4);
  });

  it('150 véhicules garés ne coûtent presque rien', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    for (let i = 0; i < 150; i++) b.spawn(PARKED[i % PARKED.length]!, (i % 15) * 20, Math.floor(i / 15) * 20, 0);
    measure(b, 120);
    const res = measure(b, 1200);
    console.log(`[perf] 150 véhicules garés : ${(res.mean * 1000).toFixed(1)} µs par pas`);
    expect(b.ctx.vehicles.list.every((v) => b.ext.dynamics(v).asleep)).toBe(true);
    expect(res.mean).toBeLessThan(0.3);
  });

  it('n\'alloue pas dans la boucle : une minute de circulation sans passage notable du ramasse-miettes', async () => {
    const g = grid(4, 120);
    const b = await createVehicleBench({ world: createFakeWorld({ nodes: g.nodes, edges: g.edges }) });
    const list: Vehicle[] = [];
    for (let i = 0; i < 60; i++) {
      const v = b.spawn('voiture', (i % 4) * 120 - 1.75, 10 + Math.floor(i / 4) * 22, 0);
      v.engineOn = true;
      v.brain = { test: true };
      list.push(v);
    }
    for (let i = 0; i < 60; i++) b.person('passant', (i % 4) * 120 + 5, i * 5);
    const run = (steps: number): void => {
      for (let i = 0; i < steps; i++) {
        if (i % 30 === 0) for (const v of list) v.cmd.throttle = v.speed < 6 ? 0.5 : 0;
        b.t.game.step(DT);
      }
    };
    run(300);
    const runs = await gcRuns(() => run(1800));
    console.log(`[perf] ramasse-miettes pendant 60 s simulées (60 véhicules roulants, 60 piétons) : ${runs} passage(s)`);
    if (!Number.isNaN(runs)) expect(runs).toBeLessThanOrEqual(2);
  });
});
