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

/** Temps processeur consommé par le processus (ms) : insensible à la charge de la machine de test. */
function cpuMs(): number {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
}

/** Charge de référence (10 millions de sin·cos) : situe la vitesse du processeur qui exécute les tests. */
function reference(): number {
  const t = cpuMs();
  let s = 0;
  for (let i = 0; i < 1e7; i++) s += Math.sin(i * 0.001) * Math.cos(i * 0.002);
  return cpuMs() - t + s * 0;
}

/**
 * Coût d'un pas de simulation (ms de processeur, moyenne sur `steps` pas) : moteur + module des véhicules,
 * seul module branché. On mesure du temps processeur et non du temps réel, car la machine de test est partagée.
 */
function measure(b: VehicleBench, steps: number, each?: (i: number) => void): number {
  const t0 = cpuMs();
  for (let i = 0; i < steps; i++) {
    each?.(i);
    b.t.game.step(DT);
  }
  return (cpuMs() - t0) / steps;
}

const PARKED: VehicleKind[] = ['voiture', 'citadine', 'suv', 'utilitaire', 'taxi', 'fourgon_crs', 'scooter', 'camion', 'bus', 'voiture_police'];

describe('performances des véhicules', () => {
  it('150 véhicules en ville : 40 en circulation sous pilote automatique, 110 garés, 120 piétons', async () => {
    // boulevard circulaire à sens unique (carré de 240 m de côté) : la circulation ne se bloque pas d'elle-même
    const corners: FakeRoadNode[] = [{ x: 0, z: 0 }, { x: 0, z: 240 }, { x: 240, z: 240 }, { x: 240, z: 0 }];
    const ring: FakeRoadEdge[] = [0, 1, 2, 3].map((i) => ({ a: i, b: (i + 1) % 4, oneway: true, width: 8 }));
    const b = await createVehicleBench({ world: createFakeWorld({ nodes: corners, edges: ring }) });
    expect(b.t.game.perf.some((p) => p.id === VEHICLES_SYSTEM_ID)).toBe(true);
    const rng = b.ctx.rng.fork('perf');
    // véhicules garés à l'extérieur du boulevard, le long de ses quatre côtés
    for (let i = 0; i < 110; i++) {
      const side = i % 4;
      const d = 15 + Math.floor(i / 4) * 7.6;
      const kind = PARKED[i % PARKED.length]!;
      if (side === 0) b.spawn(kind, -7.5, d, 0);
      else if (side === 1) b.spawn(kind, d, 247.5, Math.PI / 2);
      else if (side === 2) b.spawn(kind, 247.5, 240 - d, Math.PI);
      else b.spawn(kind, 240 - d, -7.5, -Math.PI / 2);
    }
    // circulation : chaque véhicule vise le carrefour suivant, puis le suivant…
    const moving: Vehicle[] = [];
    const next: number[] = [];
    for (let i = 0; i < 40; i++) {
      const side = i % 4;
      const d = 20 + Math.floor(i / 4) * 21;
      const kind: VehicleKind = i % 8 === 0 ? 'fourgon_crs' : i % 5 === 0 ? 'bus' : 'voiture';
      const v = side === 0 ? b.spawn(kind, 0, d, 0) : side === 1 ? b.spawn(kind, d, 240, Math.PI / 2)
        : side === 2 ? b.spawn(kind, 240, 240 - d, Math.PI) : b.spawn(kind, 240 - d, 0, -Math.PI / 2);
      moving.push(v);
      next.push((side + 1) % 4);
    }
    const dispatch = (k: number): void => {
      // destination au milieu du côté suivant
      const a = corners[next[k]!]!;
      const c = corners[(next[k]! + 1) % 4]!;
      b.autopilot.driveTo(moving[k]!, (a.x + c.x) / 2, (a.z + c.z) / 2);
      next[k] = (next[k]! + 1) % 4;
    };
    for (let k = 0; k < moving.length; k++) dispatch(k);
    // piétons sur le trottoir intérieur
    for (let i = 0; i < 120; i++) {
      const d = rng.range(15, 225);
      const side = i % 4;
      if (side === 0) b.person('passant', 7, d);
      else if (side === 1) b.person('passant', d, 233);
      else if (side === 2) b.person('passant', 233, d);
      else b.person('passant', d, 7);
    }
    expect(b.ctx.vehicles.list.length).toBe(150);
    let arrivals = 0;
    const redispatch = (i: number): void => {
      if (i % 15 !== 0) return;
      for (let k = 0; k < moving.length; k++) {
        if (b.autopilot.status(moving[k]!).state !== 'arrive') continue;
        arrivals++;
        dispatch(k);
      }
    };
    measure(b, 600, redispatch); // mise en température
    const ref = reference();
    const cost = measure(b, 3000, redispatch);
    const awake = b.ctx.vehicles.list.filter((v) => !b.ext.dynamics(v).asleep).length;
    const rolling = moving.filter((v) => Math.abs(v.speed) > 0.5).length;
    console.log(`[perf] 150 véhicules en ville (${awake} éveillés, ${rolling} roulent, ${arrivals} trajets terminés) : ${cost.toFixed(3)} ms de processeur par pas (référence ${ref.toFixed(0)} ms)`);
    expect(rolling).toBeGreaterThan(25);
    expect(awake).toBeLessThanOrEqual(42); // les véhicules garés dorment
    expect(arrivals).toBeGreaterThan(40);
    for (const v of b.ctx.vehicles.list) expect(v.health).toBe(100); // personne ne s'est accroché
    expect(cost).toBeLessThan(1.5);
  }, 60000);

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
    const cost = measure(b, 1500, drive);
    const rolling = list.filter((v) => Math.abs(v.speed) > 0.5).length;
    console.log(`[perf] 150 véhicules tous en mouvement (${rolling} roulent), 200 personnes : ${cost.toFixed(3)} ms de processeur par pas`);
    expect(rolling).toBeGreaterThan(100);
    expect(cost).toBeLessThan(1.5);
  }, 60000);

  it('150 véhicules garés ne coûtent presque rien', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    for (let i = 0; i < 150; i++) b.spawn(PARKED[i % PARKED.length]!, (i % 15) * 20, Math.floor(i / 15) * 20, 0);
    measure(b, 120);
    const cost = measure(b, 6000);
    console.log(`[perf] 150 véhicules garés : ${(cost * 1000).toFixed(1)} µs de processeur par pas`);
    expect(b.ctx.vehicles.list.every((v) => b.ext.dynamics(v).asleep)).toBe(true);
    expect(cost).toBeLessThan(0.1);
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
