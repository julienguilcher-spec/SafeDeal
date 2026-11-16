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

describe('exploration', () => {
  it('déroule une manifestation courte', async () => {
    const t = createCrowdTest({ seed: 7, modules: [world, people, items, hazards, law] });
    const phases: string[] = [];
    t.ctx.events.on('crowd:phase', (e) => phases.push(Math.round(t.ctx.clock.now) + ':' + e.phase));
    await t.start(demoConfig({ duration: 'courte', crowdSize: 300 }));
    const core = t.core;
    console.log('route', core.route.id, Math.round(core.route.length), 'm ; ref', core.corridor.refWidth.toFixed(1), '; stations', core.metro.stations.map((s) => s.name + '(' + (s.entrances.length / 2) + ')').join(', '));
    console.log('sections', core.formation.sections.map((s) => s.kind + ':' + s.size + '[' + s.firstBlock + '-' + s.lastBlock + ']').join(' '), 'blocks', core.formation.blockCount, 'head', core.formation.headS.toFixed(0), 'tail', core.formation.tailS.toFixed(0));
    const t0 = performance.now();
    for (let k = 0; k < 70; k++) {
      t.run(10);
      const d = t.ctx.director;
      const states = new Array(STATE_NAMES.length).fill(0);
      let inside = 0;
      for (const p of core.members) {
        states[brainOf(p)!.state]++;
        if (!t.ctx.world.isFree(p.x, p.z, 0.05)) inside++;
      }
      console.log(String(Math.round(t.ctx.clock.now)).padStart(4), d.phase.padEnd(13), 'pres', String(d.stats.present).padStart(3), 'disp', String(d.stats.dispersed).padStart(3), 'head', d.headProgress.toFixed(0).padStart(4),
        'v', core.formation.headSpeed.toFixed(2), 'tens', d.tension.toFixed(2), 'dens', core.density.max.toFixed(1), 'in', inside, 'cost', t.costPerStep().toFixed(2), 'ms',
        states.map((n, i) => (n ? STATE_NAMES[i] + '=' + n : '')).filter(Boolean).join(' '), core.formation.haltReason);
      if (d.phase === 'terminee' && d.stats.present === 0) break;
    }
    console.log('phases', phases.join(' '), '| wall', Math.round(performance.now() - t0), 'ms', '| paths', core.nav.computed, '| aleas', core.aleas.infos.filter((a) => a.status !== '').map((a) => a.id + ':' + a.status).join(','));
  }, 300000);
});
