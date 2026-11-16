import { it } from 'vitest';
import type { Vehicle, VehicleKind } from '@/core/contracts';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
const PARKED: VehicleKind[] = ['voiture', 'citadine', 'suv', 'utilitaire', 'taxi', 'fourgon_crs', 'scooter', 'camion', 'bus', 'voiture_police'];
function wrap(obj: any, name: string, acc: Record<string, { t: number; n: number; max: number }>, label: string): void {
  const orig = obj[name].bind(obj);
  acc[label] = { t: 0, n: 0, max: 0 };
  obj[name] = (...args: unknown[]) => {
    const t0 = performance.now();
    const r = orig(...args);
    const d = performance.now() - t0;
    acc[label]!.t += d; acc[label]!.n++; if (d > acc[label]!.max) acc[label]!.max = d;
    return r;
  };
}
it('dbg perf', async () => {
  const b = await createVehicleBench({ world: createFakeWorld() });
  const rng = b.ctx.rng.fork('perf2');
  const list: Vehicle[] = [];
  for (let i = 0; i < 150; i++) {
    const v = b.spawn(PARKED[i % PARKED.length]!, (i % 15) * 40, Math.floor(i / 15) * 40, rng.range(-3, 3));
    v.engineOn = true; v.brain = { test: true }; list.push(v);
  }
  for (let i = 0; i < 200; i++) b.person('passant', rng.range(0, 600), rng.range(0, 400));
  const acc: Record<string, { t: number; n: number; max: number }> = {};
  const s = b.sys as any;
  wrap(s.physics, 'step', acc, 'physics.step');
  wrap(s.collisions, 'propsOf', acc, 'collide.props');
  wrap(s.collisions, 'peopleOf', acc, 'collide.people');
  wrap(s.collisions, 'vehicles', acc, 'collide.vehicles');
  wrap(s.collisions, 'world', acc, 'collide.world');
  wrap(s.lights, 'update', acc, 'lights');
  wrap(s.seats, 'update', acc, 'seats.update');
  wrap(s.damage, 'heatFromSurroundings', acc, 'heat');
  wrap(s.turrets, 'busy', acc, 'turrets.busy');
  let collisions = 0;
  b.ctx.events.on('vehicle:collision', () => collisions++);
  let hurts = 0;
  b.ctx.events.on('person:hurt', () => hurts++);
  const steps = 900;
  let worst = 0; let worstI = 0;
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    if (i % 20 === 0) for (let k = 0; k < list.length; k++) { const v = list[k]!; v.cmd.throttle = v.speed < 8 ? 0.6 : 0; v.cmd.steer = Math.sin(i * 0.01 + k) * 0.5; }
    const t1 = performance.now();
    b.t.game.step(1 / 30);
    const d = performance.now() - t1;
    if (d > worst) { worst = d; worstI = i; }
  }
  const total = performance.now() - t0;
  console.log(`total ${(total / steps).toFixed(3)} ms/pas ; pire ${worst.toFixed(1)} ms au pas ${worstI} ; collisions ${collisions} ; blessures ${hurts}`);
  for (const [k, v] of Object.entries(acc)) console.log(`${k.padEnd(20)} ${(v.t / steps).toFixed(4)} ms/pas  (${(v.n / steps).toFixed(0)} appels/pas, max ${v.max.toFixed(2)} ms)`);
});
