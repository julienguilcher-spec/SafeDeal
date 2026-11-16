// Commandement — drone abattu (ou tombé batterie vide) : l'épave reste au sol, mais l'équipe n'y reste pas attachée ;
// le second appareil décolle après le délai de relève et reprend la surveillance.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];

describe('drone : relève après la perte de l’appareil', () => {
  it('un drone abattu est remplacé par un appareil frais qui reprend l’orbite', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 14, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const team = t.api.createDroneTeam({ x: 60, z: 290, heading: -Math.PI / 2 });
    const pilot = team.leader!;
    t.step(4);
    ctx.squads.issue(team.squad.id, { type: 'avancer', x: 0, z: 150 });
    t.step(30);
    const first = ext.droneOf(pilot.id)!;
    expect(first).not.toBeNull();
    expect(ext.flightStatus(first)!.mode).toBe('orbite');
    // abattu en vol
    ctx.vehicles.damage(first, { amount: 5000, kind: 'impact', sourceId: 0, x: first.x, z: first.z });
    expect(first.state).toBe('wrecked');
    t.step(20);
    // l'épave est au sol
    expect(ext.flightStatus(first)!.mode).toBe('pose');
    t.step(60);
    const second = ext.droneOf(pilot.id);
    console.log('après la perte : appareil', second?.id, '(épave', first.id + ')', second ? ext.flightStatus(second)!.mode : '—', 'état', second?.state);
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first.id);
    expect(second!.state).not.toBe('wrecked');
    expect(['orbite', 'decollage']).toContain(ext.flightStatus(second!)!.mode);
    expect(t.api.special(team.squad.id)!.vehicleId).toBe(second!.id);
  }, 300000);
});
