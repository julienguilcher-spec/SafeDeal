// Commandement — équipe drone dont le télépilote est le JOUEUR : l'IA ne doit ni décoller l'appareil à sa place, ni lui
// reprendre les commandes (mise en orbite) une fois qu'il pilote.
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

describe('drone piloté par le joueur', () => {
  it('l’IA de l’équipe ne reprend pas les commandes du télépilote joueur', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 14, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const team = t.api.createDroneTeam({ x: 60, z: 290, heading: -Math.PI / 2 });
    const pilot = team.leader!;
    ctx.player.possess(pilot.id, 'telepilote');
    t.step(4);
    // pas de décollage d'office (il prendrait la caméra du joueur) : le joueur décolle lui-même
    expect(ext.droneOf(pilot.id)).toBeNull();
    const d = ext.deployDrone(pilot)!;
    expect(d).not.toBeNull();
    t.step(12);
    // le commandement (IA) ordonne à l'équipe de se placer au-dessus d'un point
    ctx.squads.issue(team.squad.id, { type: 'avancer', x: 0, z: 150 });
    const modes: string[] = [];
    t.run(10, 0.5, () => { modes.push(ext.flightStatus(d)!.mode); });
    console.log('modes', modes.join(','));
    expect(modes.every((m) => m === 'manuel' || m === 'decollage')).toBe(true);
    // un ordre de repli ne lui arrache pas non plus l'appareil : il le ramène lui-même
    ctx.squads.issue(team.squad.id, { type: 'repli' });
    t.step(2);
    expect(ext.flightStatus(d)!.mode).toBe('manuel');
  }, 120000);
});
