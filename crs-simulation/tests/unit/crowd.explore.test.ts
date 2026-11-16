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
  it('restes', async () => {
    const t = createCrowdTest({ seed: 11, modules: [world, people, items, hazards, law] });
    await t.start(demoConfig({ crowdSize: 300, duration: 'standard', tension: 0.1, volatility: 0.15 }));
    const core = t.core;
    const ctx = t.ctx;
    let reported = 0;
    for (let k = 0; k < 400; k++) {
      t.run(5);
      for (const p of core.members) {
        const b = brainOf(p)!;
        if ((b.state === 1 || b.state === 2) && b.slot >= 0 && reported < 6) {
          core.formation.sample(b.slot, core.slot);
          const d = Math.hypot(core.slot.x - p.x, core.slot.z - p.z);
          if (d > 30) {
            reported++;
            console.log('OFF t', Math.round(ctx.clock.now), 'id', p.id, STATE_NAMES[b.state], 'd', d.toFixed(1), 'pos', p.x.toFixed(1), p.z.toFixed(1), 'slot', core.slot.x.toFixed(1), core.slot.z.toFixed(1), 'flags', b.flags, 'posture', p.posture, 'custody', p.custody, 'since', (ctx.clock.now - b.stateSince).toFixed(1), 'phase', ctx.director.phase, 'profile', p.profile, 'head', core.formation.headS.toFixed(0), 'tail', core.formation.tailS.toFixed(0), 'slotS', core.formation.slotS(b.slot).toFixed(0));
          }
        }
      }
      if (ctx.clock.now > 1700) break;
    }
    console.log('reste', core.members.length, 'exits', core.nav.exits.map((e) => e.index + ':' + e.kind + '@' + Math.round(e.x) + ',' + Math.round(e.z) + (e.open ? '' : 'x')).join(' '));
    for (const p of core.members) {
      const b = brainOf(p)!;
      console.log('  id', p.id, p.kind, p.profile, STATE_NAMES[b.state], 'pos', p.x.toFixed(1), p.z.toFixed(1), 'v', Math.hypot(p.vx, p.vz).toFixed(2), 'tgt', b.tx.toFixed(1), b.tz.toFixed(1), 'exit', b.exit, 'path', b.path ? b.pathI + '/' + b.path.length / 2 : 'none', 'pend', b.pathPending, 'flags', b.flags, 'posture', p.posture, 'health', p.health.toFixed(0), p.injury, 'custody', p.custody, 'veh', p.vehicleId, 'leaveAt', b.leaveAt.toFixed(0), 'stuck', b.stuck, 'free', ctx.world.isFree(p.x, p.z, 0.3), 'gas', p.gas.toFixed(2));
    }
  }, 900000);
});
