import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';
import { STATE_NAMES } from '@/sim/crowd';
import { brainOf } from '@/sim/crowd/brain';

const STREET_X = -430;
describe('exploration', () => {
  it('compression', async () => {
    const t = createCrowdTest({ seed: 9, modules: [world, people, items, hazards, law] });
    const { ctx, core } = t;
    await t.start(demoConfig({
      crowdSize: 260, x: STREET_X, z: -150, tension: 0.05, volatility: 0.3,
      extra: { 'crowd.present': 1, 'crowd.static': true, 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.sono': false, 'crowd.route': [STREET_X, -155, STREET_X, 140] },
    }));
    const f = core.formation;
    t.run(3);
    core.corridor.at(f.headS + 25, core.rp);
    const bz = core.rp.z;
    for (let x = STREET_X - 4.6; x <= STREET_X + 4.6; x += 1.15) ctx.props.spawn('conteneur', x, bz, 0);
    core.corridor.at(f.tailS - 14, core.rp);
    const squad = ctx.squads.create('section', 'police', 'Alpha 1');
    const line = [];
    for (let i = 0; i < 8; i++) line.push(ctx.people.spawn({ kind: 'crs', faction: 'police', x: STREET_X - 3.5 + i, z: core.rp.z, heading: 0, rank: 'gardien', poste: 'bouclier', squadId: squad.id }));
    console.log('head', f.headS.toFixed(0), 'tail', f.tailS.toFixed(0), 'barricade z', bz.toFixed(0), 'crs z', core.rp.z.toFixed(0), 'half', core.rp.half.toFixed(1), 'props', ctx.props.list.length);
    const snap = (label: string): void => {
      const zs = t.protesters().map((p) => p.z).sort((a, b) => a - b);
      const q = (k: number): string => zs[Math.floor(k * (zs.length - 1))]!.toFixed(0);
      const states = new Array(STATE_NAMES.length).fill(0);
      for (const p of core.members) states[brainOf(p)!.state]++;
      const fear = t.protesters().reduce((a, p) => a + p.fear, 0) / zs.length;
      console.log(label, 't', ctx.clock.now.toFixed(1), 'z min/25/50/75/max', q(0), q(0.25), q(0.5), q(0.75), q(1), 'crs z', line[0]!.z.toFixed(0), 'dens', core.density.max.toFixed(2), 'fear', fear.toFixed(2), states.map((n, i) => (n ? STATE_NAMES[i] + '=' + n : '')).filter(Boolean).join(' '));
    };
    snap('avant');
    for (let bond = 0; bond < 13; bond++) {
      ctx.squads.issue(squad.id, { type: 'charge', x: STREET_X, z: bz, heading: 0 });
      for (let k = 0; k < 8; k++) {
        for (const crs of line) { crs.cmd.moveX = 0; crs.cmd.moveZ = 1; crs.cmd.gait = 1; crs.cmd.faceMove = true; }
        t.run(0.5);
        if (k % 4 === 3) snap('bond ' + bond);
      }
    }
  }, 300000);
});
