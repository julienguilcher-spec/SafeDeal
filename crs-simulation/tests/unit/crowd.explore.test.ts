import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';
import { STATE_NAMES } from '@/sim/crowd';
import { brainOf } from '@/sim/crowd/brain';

describe('exploration', () => {
  it('gaz', async () => {
    const t = createCrowdTest({ seed: 3, modules: [world, people, items, hazards, law] });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 300, extra: { 'crowd.present': 1, 'crowd.static': true, 'crowd.noAleas': true, 'crowd.bystanders': 0 } }));
    t.run(3);
    ctx.env.setWind(1.2, 0);
    const f = core.formation;
    core.corridor.at((f.headS + f.tailS) * 0.5, core.rp);
    const gx = core.rp.x - core.rp.tz * core.rp.center;
    const gz = core.rp.z + core.rp.tx * core.rp.center;
    ctx.projectiles.spawn('grenade_lacrymo_main', 0, gx - 2, 0.3, gz, 0, 0, 0);
    ctx.projectiles.spawn('grenade_lacrymo_main', 0, gx + 2, 0.3, gz + 1, 0, 0, 0);
    console.log('centre', gx.toFixed(1), gz.toFixed(1));
    for (let k = 0; k < 12; k++) {
      t.run(4);
      const inGas = t.protesters().filter((p) => ctx.hazards.gasAt(p.x, p.z) > 0.08);
      const states = new Array(STATE_NAMES.length).fill(0);
      for (const p of inGas) states[brainOf(p)!.state]++;
      let area = 0;
      let cx = 0, cz = 0;
      for (let dx = -40; dx <= 40; dx += 2) for (let dz = -40; dz <= 40; dz += 2) if (ctx.hazards.gasAt(gx + dx, gz + dz) > 0.08) { area += 4; cx += dx; cz += dz; }
      const sp = inGas.map((p) => Math.hypot(p.vx, p.vz));
      const g = inGas.map((p) => ctx.hazards.gasAt(p.x, p.z)).sort((a, b) => a - b);
      console.log('t', Math.round(ctx.clock.now), 'dans le gaz', inGas.length, states.map((n, i) => (n ? STATE_NAMES[i] + '=' + n : '')).filter(Boolean).join(' '), '| nuage', area, 'm² centre', area ? (cx / (area / 4)).toFixed(0) + ',' + (cz / (area / 4)).toFixed(0) : '-', '| vitesse moy', (sp.reduce((a, b) => a + b, 0) / Math.max(1, sp.length)).toFixed(2), '| gaz med/max', (g[g.length >> 1] ?? 0).toFixed(2), (g[g.length - 1] ?? 0).toFixed(2), '| palets', ctx.projectiles.list.filter((q) => q.emitting).length);
      if (k === 5) for (const p of inGas.slice(0, 8)) { const b = brainOf(p)!; console.log('    id', p.id, STATE_NAMES[b.state], 'pos', (p.x - gx).toFixed(1), (p.z - gz).toFixed(1), 'v', Math.hypot(p.vx, p.vz).toFixed(2), 'tgt', (b.tx - gx).toFixed(1), (b.tz - gz).toFixed(1), 'gas', p.gas.toFixed(2), 'air', ctx.hazards.gasAt(p.x, p.z).toFixed(2), 'stun', p.stun.toFixed(1), 'run', b.run, 'speed', b.speed.toFixed(1), 'posture', p.posture); }
    }
  }, 300000);
});
