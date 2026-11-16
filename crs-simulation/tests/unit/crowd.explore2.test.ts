import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';
import { brainOf } from '@/sim/crowd/brain';
import { STATE_NAMES } from '@/sim/crowd';

describe('exploration 2', () => {
  it('densité à 1000', async () => {
    const t = createCrowdTest({ seed: 7, modules: [world, people, items, hazards, law] });
    await t.start(demoConfig({ duration: 'courte', crowdSize: 1000 }));
    const core = t.core;
    const f = core.formation;
    for (let k = 0; k < 12; k++) {
      t.run(20);
      // cellule la plus dense
      let best = 0, bx = 0, bz = 0;
      for (const p of core.members) {
        const d = core.density.at(p.x, p.z);
        if (d > best) { best = d; bx = p.x; bz = p.z; }
      }
      const states = new Array(STATE_NAMES.length).fill(0);
      let n = 0;
      for (const p of core.members) {
        if (Math.hypot(p.x - bx, p.z - bz) < 4) { states[brainOf(p)!.state]++; n++; }
      }
      const sp = core.corridor.project(bx, bz, (f.headS + f.tailS) / 2, 2000);
      core.corridor.at(sp, core.rp);
      console.log('t', Math.round(t.ctx.clock.now), 'dens max', best.toFixed(2), 'at', bx.toFixed(0), bz.toFixed(0), 's', sp.toFixed(0), 'half', core.rp.half.toFixed(1), 'stretch', core.rp.stretch.toFixed(2), 'head', f.headS.toFixed(0), 'tail', f.tailS.toFixed(0), 'n<4m', n, states.map((c, i) => (c ? STATE_NAMES[i] + '=' + c : '')).filter(Boolean).join(' '));
    }
  }, 300000);
});
