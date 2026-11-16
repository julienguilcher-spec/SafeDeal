import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { frontRank, spawnProtesters, startPolice } from '@/sim/police/testkit';
import { agentOf, unitOf } from '@/sim/police/brain';

const MODULES = [world, people, items, hazards, law, vehicles];
const NORTH = Math.PI;

describe('debug', () => {
  it('embarquer', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'embarque', vehicles: true });
    ctx.squads.issue(sec.squad.id, { type: 'debarquer', x: 0, z: -100, heading: NORTH });
    pt.run(90, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    console.log('vehicles', sec.vehicles.map((v) => `${v.id}:${v.kind}(${v.x.toFixed(1)},${v.z.toFixed(1)}) seats ${v.seats.join(',')}`).join(' | '));
    ctx.squads.issue(sec.squad.id, { type: 'embarquer' });
    const u = unitOf(sec.squad)!;
    const a18 = agentOf(sec.people.find((p) => p.id === 18)!)!;
    pt.run(100, 1, (t) => {
      if (t > 22 && t < 50) console.log(t, "a18", a18.p.x.toFixed(2), a18.p.z.toFixed(2), "v", a18.p.vx.toFixed(2), a18.p.vz.toFixed(2), "pathN", a18.pathN, a18.pathI, a18.path.slice(0, 8).map((v) => v.toFixed(1)).join(","), "stuck", a18.stuckT.toFixed(1), "side", (a18.sideUntil - ctx.clock.now).toFixed(1));
      if (t % 5 !== 0) return false;
      console.log(t, 'phase', u.phase, 'step', u.man.step, 'pending', u.man.pending);
      console.log(sec.people.map((p) => { const a = agentOf(p)!; return `${p.id}${p.poste![0]}:b${a.boardId}(${p.x.toFixed(1)},${p.z.toFixed(1)})${a.able ? '' : 'X'}${p.vehicleId ? 'V' + p.vehicleId : ''}${a.pathN ? 'P' + a.pathN : ''}`; }).join(' '));
      return u.phase === 'embarque';
    });
    console.log('vehicles', sec.vehicles.map((v) => `${v.id}:${v.kind}(${v.x.toFixed(1)},${v.z.toFixed(1)}) seats ${v.seats.join(',')}`).join(' | '));
  });
});
