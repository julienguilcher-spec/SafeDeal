import { it } from 'vitest';
import type { Vehicle, VehicleKind } from '@/core/contracts';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
const PARKED: VehicleKind[] = ['voiture', 'citadine', 'suv', 'utilitaire', 'taxi', 'fourgon_crs', 'scooter', 'camion', 'bus', 'voiture_police'];
function cpu(): number { const u = process.cpuUsage(); return (u.user + u.system) / 1000; }
function ref(): number { const t = cpu(); let s = 0; for (let i = 0; i < 1e7; i++) s += Math.sin(i * 0.001) * Math.cos(i * 0.002); return cpu() - t + s * 0; }
async function scene(disable: string[]): Promise<number> {
  const b = await createVehicleBench({ world: createFakeWorld() });
  const rng = b.ctx.rng.fork('perf2');
  const list: Vehicle[] = [];
  for (let i = 0; i < 150; i++) {
    const v = b.spawn(PARKED[i % PARKED.length]!, (i % 15) * 40, Math.floor(i / 15) * 40, rng.range(-3, 3));
    v.engineOn = true; v.brain = { test: true }; list.push(v);
  }
  for (let i = 0; i < 200; i++) b.person('passant', rng.range(0, 600), rng.range(0, 400));
  const s = b.sys as any;
  for (const d of disable) {
    if (d === 'ALL') continue;
    const [obj, fn] = d.split('.');
    s[obj!][fn!] = () => false;
  }
  if (disable.includes('ALL')) s.update = () => {};
  const drive = (i: number): void => { if (i % 20 === 0) for (let k = 0; k < list.length; k++) { const v = list[k]!; v.cmd.throttle = v.speed < 8 ? 0.6 : 0; v.cmd.steer = Math.sin(i * 0.01 + k) * 0.5; } };
  for (let i = 0; i < 300; i++) { drive(i); b.t.game.step(1 / 30); }
  const steps = 1500;
  const t0 = cpu();
  for (let i = 0; i < steps; i++) { drive(i + 300); b.t.game.step(1 / 30); }
  return (cpu() - t0) / steps;
}
it('dbg perf cpu', async () => {
  console.log(`référence 1e7 sin·cos : ${ref().toFixed(0)} ms CPU`);
  const full = await scene([]);
  console.log(`complet                 ${full.toFixed(3)} ms CPU/pas`);
  for (const d of [['ALL'], ['collisions.vehicles'], ['collisions.peopleOf'], ['collisions.propsOf'], ['collisions.world'], ['physics.step']]) {
    const t = await scene(d);
    console.log(`sans ${d.join(',').padEnd(18)} ${t.toFixed(3)} ms CPU/pas  (écart ${(full - t).toFixed(3)})`);
  }
  console.log(`référence 1e7 sin·cos : ${ref().toFixed(0)} ms CPU`);
}, 120000);
