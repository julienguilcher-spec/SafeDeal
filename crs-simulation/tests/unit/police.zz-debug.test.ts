import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { spawnProtesters, startPolice, throwAt } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;
describe('debug', () => {
  it('spikes', async () => {
    for (let pass = 0; pass < 1; pass++) {
      const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
      const { ctx } = pt;
      const a = pt.units.createCompany({ x: -150, z: 0, heading: -Math.PI / 2, vehicles: false, layout: 'ligne' });
      const b = pt.units.createCompany({ x: 150, z: 0, heading: Math.PI / 2, vehicles: false, layout: 'ligne' });
      const c = pt.units.createSection({ x: 0, z: -110, heading: NORTH, layout: 'ligne' });
      ctx.squads.issue(a.squad.id, { type: 'ligne', x: -160, z: 0, heading: -Math.PI / 2 });
      ctx.squads.issue(b.squad.id, { type: 'ligne', x: 160, z: 0, heading: Math.PI / 2 });
      ctx.squads.issue(c.squad.id, { type: 'ligne', x: 0, z: -120, heading: NORTH });
      spawnProtesters(ctx, 120, -190, 0, -Math.PI / 2 + Math.PI, 'pacifique', 1.2, 24);
      spawnProtesters(ctx, 120, 190, 0, Math.PI / 2 + Math.PI, 'pacifique', 1.2, 24);
      const radicals = spawnProtesters(ctx, 60, 0, -146, 0, 'radical', 1.2, 10);
      pt.step(40);
      const sys: any = pt.system;
      const mu = (): number => process.memoryUsage().heapUsed;
      let cal = 0; for (let i = 0; i < 200; i++) { const h = mu(); const d = mu() - h; if (d >= 0) cal += d; }
      console.log('calibration memoryUsage', (cal / 200).toFixed(0));
      let label = 'S'; let calls = 0;
      const acc: Record<string, number[]> = { S: [0, 0, 0, 0, 0, 0], M: [0, 0, 0, 0, 0, 0], A: [0, 0, 0, 0, 0, 0] };
      const wrap = (name: string, idx: number): void => {
        const o = sys[name].bind(sys);
        sys[name] = (...args: unknown[]) => { const h0 = mu(); const r = o(...args); const d = mu() - h0; if (d >= 0) { acc[label][idx] += d; acc[label][idx + 1]++; } return r; };
      };
      wrap('thinkUnit', 2);
      wrap('drive', 4);
      const orig = sys.update.bind(sys);
      sys.update = (dt: number) => {
        const h0 = mu();
        orig(dt);
        const d = mu() - h0;
        if (d >= 0) { acc[label][0] += d; acc[label][1]++; }
        calls++;
      };
      const spikes: string[] = [];
      let n = 0;
      const rec = (lab: string) => () => { label = lab; const label2 = lab; void label2; n++; const v = pt.system.lastStepMs; if (v > 1) spikes.push(`${lab}#${n}:${v.toFixed(2)}`); };
      pt.run(20, 1 / 30, rec('S'));
      ctx.squads.issue(a.squad.id, { type: 'avancer', x: -175, z: 0, heading: -Math.PI / 2 });
      ctx.squads.issue(b.squad.id, { type: 'avancer', x: 175, z: 0, heading: Math.PI / 2 });
      ctx.squads.issue(c.squad.id, { type: 'avancer', x: 0, z: -130, heading: NORTH });
      pt.run(10, 1 / 30, rec('M'));
      for (const r of radicals) ctx.actions.give(r, 'pave', 3);
      let k = 0;
      const r2 = rec('A');
      pt.run(20, 1 / 30, (t) => {
        r2();
        if (Math.floor(t * 30) % 6 !== 0) return;
        const r = radicals[k++ % radicals.length];
        if (r.custody === 'free' && r.posture !== 'down') {
          if (ctx.actions.has(r, 'pave') < 2) ctx.actions.give(r, 'pave', 2);
          throwAt(ctx, r, 'pave', (ctx.rng.next() - 0.5) * 8, -130);
        }
      });
      for (const L of ['S', 'M', 'A']) { const v = acc[L]; console.log('pass', L, 'update total/step', (v[0] / v[1]).toFixed(0), '| thinkUnit total', v[2], 'calls', v[3], '| drive total', v[4], 'calls', v[5], '| steps', v[1], calls); }
    }
  });
});
