import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { frontRank, spawnProtesters, startPolice } from '@/sim/police/testkit';
import { agentOf, unitOf } from '@/sim/police/brain';

const MODULES = [world, people, items, hazards, law];

describe('debug', () => {
  it('proteger', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: -120, z: 5, heading: Math.PI / 2 });
    const medic = ctx.people.spawn({ kind: 'samu', x: -100, z: 5 });
    ctx.squads.issue(sec.squad.id, { type: 'proteger', targetId: medic.id, heading: Math.PI / 2 });
    const u = unitOf(sec.squad)!;
    pt.run(40, 2, (t) => {
      const g = u.groups[0];
      console.log(t, 'phase', u.phase, 'medic', medic.x.toFixed(2), medic.z.toFixed(2), 'frame', g.ax.toFixed(2), g.az.toFixed(2), g.ah.toFixed(2), 'moving', g.moving, 'r', g.radius, 'errAll', g.errAll.toFixed(2), 'follow', g.followId);
      console.log(g.front.map((a) => `(${a.p.x.toFixed(1)},${a.p.z.toFixed(1)}→${a.sx.toFixed(1)},${a.sz.toFixed(1)} h${a.p.heading.toFixed(2)}/${a.sh.toFixed(2)})`).join(' '));
      return u.phase === 'en_place';
    });
  });
});
