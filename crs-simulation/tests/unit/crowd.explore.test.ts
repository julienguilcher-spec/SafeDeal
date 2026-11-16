// Exploration provisoire (sera remplacée par les vrais tests).
import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';
import { STATE_NAMES } from '@/sim/crowd';
import { brainOf } from '@/sim/crowd/brain';

const SIZE = Number(process.env.CROWD_SIZE ?? 300);
const DUR = (process.env.CROWD_DUR ?? 'courte') as 'courte' | 'standard';
const EVERY = Number(process.env.CROWD_EVERY ?? 10);

describe('exploration', () => {
  it('déroule une manifestation', async () => {
    const t = createCrowdTest({ seed: Number(process.env.CROWD_SEED ?? 7), modules: [world, people, items, hazards, law] });
    const phases: string[] = [];
    t.ctx.events.on('crowd:phase', (e) => phases.push(Math.round(t.ctx.clock.now) + ':' + e.phase));
    await t.start(demoConfig({ duration: DUR, crowdSize: SIZE, volatility: Number(process.env.CROWD_VOL ?? 0.2) }));
    const core = t.core;
    core.profiling = true;
    console.log('route', core.route.id, Math.round(core.route.length), 'm ; ref', core.corridor.refWidth.toFixed(1));
    console.log('sections', core.formation.sections.map((s) => s.kind + ':' + s.size + '[' + s.firstBlock + '-' + s.lastBlock + ']').join(' '), 'blocks', core.formation.blockCount, 'head', core.formation.headS.toFixed(0), 'tail', core.formation.tailS.toFixed(0));
    const t0 = performance.now();
    let maxCost = 0;
    for (let k = 0; k < 400; k++) {
      t.run(EVERY);
      const d = t.ctx.director;
      const states = new Array(STATE_NAMES.length).fill(0);
      let inside = 0;
      let off = 0;
      for (const p of core.members) {
        const b = brainOf(p)!;
        states[b.state]++;
        if (!t.ctx.world.isFree(p.x, p.z, 0.05)) inside++;
        if ((b.state === 1 || b.state === 2) && b.slot >= 0) {
          core.formation.sample(b.slot, core.slot);
          if (Math.hypot(core.slot.x - p.x, core.slot.z - p.z) > 4) off++;
        }
      }
      const cost = t.costPerStep();
      const bc = t.bestCost(20);
      const prof = Array.from(core.prof).map((v) => (v / (EVERY * 20)).toFixed(2)).join('/');
      core.prof.fill(0);
      if (cost > maxCost) maxCost = cost;
      console.log(String(Math.round(t.ctx.clock.now)).padStart(4), d.phase.padEnd(13), 'pres', String(d.stats.present).padStart(4), 'disp', String(d.stats.dispersed).padStart(4), 'head', d.headProgress.toFixed(0).padStart(4),
        'v', core.formation.headSpeed.toFixed(2), 'tens', d.tension.toFixed(2), 'dens', core.density.max.toFixed(1), 'in', inside, 'off', off, 'cost', cost.toFixed(2), 'best', bc.best.toFixed(3), 'med', bc.median.toFixed(3), prof, 'thk', core.behavior.thinks,
        states.map((n, i) => (n ? STATE_NAMES[i] + '=' + n : '')).filter(Boolean).join(' '), core.formation.haltReason);
      if (d.phase === 'terminee' && core.members.length === 0) break;
    }
    console.log('phases', phases.join(' '), '| wall', Math.round(performance.now() - t0), 'ms', '| maxCost', maxCost.toFixed(2), '| paths', core.nav.computed, '| aleas', core.aleas.infos.filter((a) => a.status !== '').map((a) => a.id + ':' + a.status).join(','), '| peak dens', core.density.peak.toFixed(1), 'alerts', core.density.alerts);
  }, 900000);
});
