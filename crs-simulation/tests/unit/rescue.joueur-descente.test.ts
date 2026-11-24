// Secours — le joueur pompier descend de l'engin conduit par l'IA tout près des lieux (rue encombrée, il finit à pied) :
// l'équipage descend avec lui et travaille ; l'engin ne l'attend pas deux minutes pour repartir « sans lui ».
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function roadPoint(ctx: GameContext, x: number, z: number, radius = 5): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, radius, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

function playerCrew(ctx: GameContext, x: number, z: number): { me: Person; mates: Person[]; v: Vehicle } {
  const squad = ctx.squads.create('secours', 'rescue', 'Sapeurs-pompiers');
  const variants = [13, 11, 11, 12, 11, 12];
  const members = variants.map((variant, i) => ctx.archetypes.spawn('pompier', x + 4 + i * 0.9, z + 4, { squadId: squad.id, seed: 80 + i, look: { extras: { variant } } }));
  ctx.squads.setLeader(squad.id, members[0].id);
  const v = ctx.vehicles.spawn('camion_pompiers', x, z, 0, { faction: 'rescue' });
  v.cmd.handbrake = true;
  squad.vehicleId = v.id;
  const me = members[1];
  ctx.player.possess(me.id, 'secouriste');
  return { me, mates: members.filter((m) => m !== me), v };
}

describe('secours — le joueur descend de l’engin près des lieux', () => {
  it('à moins de 140 m des lieux, l’équipage descend avec lui au lieu de l’attendre dans l’engin', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const base = roadPoint(ctx, 250, -300, 40);
    const { me, mates, v } = playerCrew(ctx, base.x, base.z);
    rig.step(2);
    let at = { x: 0, z: 0 };
    for (const [x, z] of [[250, 250], [300, 200], [250, 280], [-300, 250]]) {
      const c = { x, z };
      if (ctx.world.randomFreePoint(x, z, 8, 'road', () => ctx.rng.next(), c) && Math.hypot(c.x - base.x, c.z - base.z) > 520) { at = c; break; }
    }
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    expect(ctx.require<PropsExtApi>('props.ext').ignite(bin, 0)).toBe(true);
    rig.step(2);
    const fire = api.list.find((i) => i.kind === 'feu_poubelle')!;
    expect(api.assign(fire.id, 'pompiers')).toBe(true);
    const call = rescue.calls[0];
    const ride = rig.ext.playerRide!;
    rig.step(4);
    me.x = v.x + 3;
    me.z = v.z;
    expect(ctx.vehicles.enter(me, v, 'passenger')).toBe(true);
    expect(rig.run(20, 0.25, () => ride.stage === 'route')).toBeGreaterThanOrEqual(0);
    // l'engin approche : à 110 m des lieux, le joueur descend et finit à pied
    expect(rig.run(240, 0.25, () => Math.hypot(v.x - bin.x, v.z - bin.z) < 110)).toBeGreaterThanOrEqual(0);
    expect(ride.stage).toBe('route');
    ctx.vehicles.exit(me);
    expect(me.vehicleId).toBe(0);
    me.x = bin.x + 6;
    me.z = bin.z;
    rig.step(15);
    console.log(`[descente] étape ${ride.stage}, équipiers à bord ${mates.filter((m) => m.vehicleId === v.id).length}`);
    // l'équipage ne reste pas assis dans l'engin à attendre un joueur déjà sur les lieux
    expect(ride.stage).not.toBe('embarquement');
    expect(mates.filter((m) => m.vehicleId === v.id).length).toBeLessThanOrEqual(1);
    expect(ride.leftBehind).toBe(false);
    expect(ctx.radio.log.some((m) => /on part sans toi/.test(m.text))).toBe(false);
    expect(call.state).toBe('sur_place');
  }, 120000);
});

describe('secours — ambulance partie sans le joueur', () => {
  it('l’évacuation ne fait pas attendre la victime 45 s pour un joueur resté loin derrière', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const base = roadPoint(ctx, 250, -300, 40);
    const squad = ctx.squads.create('secours', 'rescue', 'SAMU');
    const members = [16, 14, 15].map((variant, i) => ctx.archetypes.spawn('samu', base.x + 4 + i * 0.9, base.z + 4, { squadId: squad.id, seed: 80 + i, look: { extras: { variant } } }));
    ctx.squads.setLeader(squad.id, members[0].id);
    const v = ctx.vehicles.spawn('ambulance', base.x, base.z, 0, { faction: 'rescue' });
    v.cmd.handbrake = true;
    squad.vehicleId = v.id;
    ctx.player.possess(members[1].id, 'secouriste');
    rig.step(2);
    let at = { x: 0, z: 0 };
    for (const [x, z] of [[250, 250], [300, 200], [250, 280], [-300, 250]]) {
      const c = { x, z };
      if (ctx.world.randomFreePoint(x, z, 8, 'road', () => ctx.rng.next(), c) && Math.hypot(c.x - base.x, c.z - base.z) > 520) { at = c; break; }
    }
    const victim = ctx.archetypes.spawn('manifestant', at.x + 2, at.z, { profile: 'pacifique', seed: 90 });
    wound(ctx, victim, 'critical');
    rig.step(1);
    const inc = api.list.find((i) => i.kind === 'blesse')!;
    rescue.request('samu', victim.x, victim.z, 0, inc.id);
    const ride = rig.ext.playerRide!;
    expect(rig.run(200, 0.5, () => ride.stage === 'route')).toBeGreaterThanOrEqual(0);
    expect(ride.leftBehind).toBe(true);
    const tEvac = rig.run(400, 0.5, () => ride.stage === 'evacuation');
    console.log(`[évacuation seule] évacuation après ${tEvac} s`);
    expect(tEvac).toBeGreaterThanOrEqual(0);
    const tRoll = rig.run(60, 0.25, () => ride.aiDriving);
    console.log(`[évacuation seule] l'ambulance part après ${tRoll} s`);
    expect(tRoll).toBeGreaterThanOrEqual(0);
    expect(tRoll).toBeLessThan(20);
  }, 180000);
});
