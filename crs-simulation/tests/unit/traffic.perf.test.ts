// Circulation — coût par pas avec 120 véhicules en circulation et 200 piétons civils (objectif : moins de 2 ms pour le module).
import { describe, expect, it } from 'vitest';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createTown, createTrafficBench } from '@/sim/traffic/testkit';

const DT = 1 / 30;

/** Charge de référence : dix millions de sin·cos (pour situer la machine, souvent très chargée). */
function referenceMs(): number {
  const c0 = process.cpuUsage();
  let acc = 0;
  for (let i = 0; i < 10_000_000; i++) acc += Math.sin(i) * Math.cos(i);
  const c = process.cpuUsage(c0);
  return acc === Infinity ? 0 : (c.user + c.system) / 1000;
}

describe('circulation : performances', () => {
  it('120 véhicules et 200 piétons : coût du module par pas, coût total, ramasse-miettes', async () => {
    const town = createTown({ cols: 5, rows: 5, signals: [12, 6, 8, 16, 18, 2, 22], sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    const t = b.api.tuning;
    t.spawnMin = 70;
    t.spawnMax = 385;
    t.despawn = 400;
    t.pedSpawnMin = 8;
    t.pedSpawnMax = 330;
    t.pedDespawn = 380;
    t.parkedDensity = 0;
    t.vehicleBase = 600;
    t.vehicleMax = 120;
    t.pedestrianBase = 900;
    t.pedestrianMax = 200;
    // montée en charge
    for (let i = 0; i < 30 * 70; i++) b.step(DT, DT);
    const s = b.api.stats;
    expect(s.vehicles).toBeGreaterThanOrEqual(110);
    expect(s.pedestrians).toBeGreaterThanOrEqual(190);

    // mesure du seul module de circulation : temps processeur de son update(), relevé autour de chaque appel
    const sys = b.sys;
    const original = sys.update.bind(sys);
    let trafficUs = 0;
    let worstUs = 0;
    let calls = 0;
    sys.update = (dt: number): void => {
      const c0 = process.cpuUsage();
      original(dt);
      const c = process.cpuUsage(c0);
      const us = c.user + c.system;
      trafficUs += us;
      if (us > worstUs) worstUs = us;
      calls++;
    };
    const ref = referenceMs();
    const gc0 = (globalThis as { performance?: { eventCounts?: unknown } }).performance ? process.memoryUsage().heapUsed : 0;
    const steps = 30 * 40;
    let moving = 0;
    let crashes = 0;
    b.ctx.events.on('vehicle:collision', (e) => {
      if (e.otherKind === 'vehicle') crashes++;
    });
    const total0 = process.cpuUsage();
    for (let i = 0; i < steps; i++) {
      b.step(DT, DT);
      if (i % 30 === 0) for (const br of sys.cars.list) if (Math.abs(br.v.speed) > 1) moving++;
    }
    const total = process.cpuUsage(total0);
    sys.update = original;
    const heapGrowth = (process.memoryUsage().heapUsed - gc0) / 1e6;
    const trafficMs = trafficUs / 1000 / calls;
    const totalMs = (total.user + total.system) / 1000 / steps;
    console.log(
      `performances (${s.vehicles} véhicules, ${s.pedestrians} piétons, pas de 1/30 s, charge de référence ${ref.toFixed(0)} ms) : `
      + `module de circulation ${trafficMs.toFixed(3)} ms par pas (pire pas ${(worstUs / 1000).toFixed(2)} ms), `
      + `tous modules ${totalMs.toFixed(3)} ms par pas, ${(moving / 40).toFixed(0)} véhicules en mouvement en moyenne, `
      + `accrochages ${crashes}, itinéraires calculés ${town.pathCalls}, tas ${heapGrowth >= 0 ? '+' : ''}${heapGrowth.toFixed(1)} Mo sur 40 s simulées`,
    );
    expect(calls).toBe(steps);
    expect(trafficMs).toBeLessThan(2); // objectif de la mission
    expect(moving / 40).toBeGreaterThan(40); // la circulation circule
  }, 300000);
});
