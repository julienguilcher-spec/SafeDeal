// Exploration temporaire (à supprimer).
import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles/api';
import { startCommand } from '@/sim/police/command/testkit';

describe('exploration', () => {
  it('poussée', async () => {
    const t = await startCommand([world, people, items, hazards, law, props, vehicles], { mode: 'test', x: 0, z: 200 }, { seed: 10 });
    const { ctx } = t;
    t.api.tuning.autoAssume = false;
    const cie = t.units.createCompany({ x: 400, z: 289.5, heading: -Math.PI / 2, layout: 'embarque', sections: 2 });
    const ap = ctx.require<AutopilotApi>('vehicles.autopilot');
    t.step(1);
    console.log('arrive', t.api.arrive(cie.squad.id, { x: 150, z: 289.5, heading: -Math.PI / 2 }));
    for (let k = 0; k < 14; k++) {
      t.step(10);
      console.log('t', ctx.clock.now.toFixed(0), t.api.convoyOf(cie.squad.id)!.stage, cie.vehicles.map((v) => v.kind.slice(0, 4) + ':' + v.x.toFixed(0) + ',' + v.z.toFixed(0) + ':' + v.speed.toFixed(1) + ':' + ap.status(v).state.slice(0, 4) + '/' + ap.status(v).reason.slice(0, 4) + ':d' + (v.seats[0] !== 0 ? 1 : 0)).join(' | '));
    }
  }, 600000);
});
