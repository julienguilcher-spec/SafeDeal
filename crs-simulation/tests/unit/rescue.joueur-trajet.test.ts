// Secours — trajet réaliste du joueur pompier ou soignant du SAMU qui n'est pas le conducteur : l'engin l'attend, son
// conducteur (IA) le conduit deux tons jusqu'aux lieux, tout le monde descend ; la radio est celle des secours.
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
import { RIDE_WAIT_MAX } from '@/sim/roles/rescue/player-ride';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function roadPoint(ctx: GameContext, x: number, z: number, radius = 5): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, radius, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

/** Équipage du joueur comme le crée la mise en place de session : unité « secours », engin, joueur à la deuxième place. */
function playerCrew(ctx: GameContext, kind: 'pompier' | 'samu', x: number, z: number): { me: Person; mates: Person[]; v: Vehicle } {
  const squad = ctx.squads.create('secours', 'rescue', kind === 'pompier' ? 'Sapeurs-pompiers' : 'SAMU');
  const variants = kind === 'pompier' ? [13, 11, 11, 12, 11, 12] : [16, 14, 15];
  const members = variants.map((variant, i) => ctx.archetypes.spawn(kind, x + 4 + i * 0.9, z + 4, { squadId: squad.id, seed: 80 + i, look: { extras: { variant } } }));
  ctx.squads.setLeader(squad.id, members[0].id);
  const v = ctx.vehicles.spawn(kind === 'pompier' ? 'camion_pompiers' : 'ambulance', x, z, 0, { faction: 'rescue' });
  v.cmd.handbrake = true;
  squad.vehicleId = v.id;
  const me = members[1];
  ctx.player.possess(me.id, 'secouriste');
  return { me, mates: members.filter((m) => m !== me), v };
}

/** Le joueur monte comme passager (geste « monter », pas « conduire »). */
function boardAsPassenger(ctx: GameContext, me: Person, v: Vehicle): void {
  me.x = v.x + 3;
  me.z = v.z;
  expect(ctx.vehicles.enter(me, v, 'passenger')).toBe(true);
}

describe('secours — trajet de l’engin du joueur (il n’est pas le conducteur)', () => {
  it('pompier : l’engin l’attend avec rappels, son conducteur le conduit deux tons à plus de 500 m, arrêt à distance de lance, tout le monde descend, le feu est éteint, l’engin rentre', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    // (hors de la place ronde du quartier d'essai, où le pilote automatique bute sur le terre-plein)
    const base = roadPoint(ctx, 250, -300, 40);
    const { me, mates, v } = playerCrew(ctx, 'pompier', base.x, base.z);
    rig.step(2);
    // un conteneur brûle à plus de 500 m
    let at = { x: 0, z: 0 };
    for (const [x, z] of [[250, 250], [300, 200], [250, 280], [-300, 250]]) {
      const c = { x, z };
      if (ctx.world.randomFreePoint(x, z, 8, 'road', () => ctx.rng.next(), c) && Math.hypot(c.x - base.x, c.z - base.z) > 520) { at = c; break; }
    }
    expect(Math.hypot(at.x - base.x, at.z - base.z)).toBeGreaterThan(500);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    expect(ctx.require<PropsExtApi>('props.ext').ignite(bin, 0)).toBe(true);
    rig.step(2);
    const fire = api.list.find((i) => i.kind === 'feu_poubelle')!;
    expect(api.assign(fire.id, 'pompiers')).toBe(true);
    const call = rescue.calls[0];
    expect(rig.ext.playerCallId).toBe(call.id);
    const ride = rig.ext.playerRide!;
    expect(ride.stage).toBe('embarquement');
    // la salle des pompiers engage l'engin par son indicatif (« FOURGON <centre> de PARIS : départ pour … »)
    const engage = ctx.radio.log.find((m) => m.from === 'PARIS' && / de PARIS : départ pour /.test(m.text));
    expect(engage).toBeDefined();
    console.log(`[trajet pompier] ${engage!.text} | engin ${ride.callsign}`);
    expect(engage!.text.startsWith(ride.callsign)).toBe(true);
    expect(ctx.radio.log.some((m) => m.from === 'CENTRAL')).toBe(false);

    // l'engin attend le joueur : l'équipage monte, le conducteur attend à sa portière (le volant reste libre) ; rappels
    rig.step(30);
    expect(ride.stage).toBe('embarquement');
    expect(ride.waitLeft).toBeGreaterThan(RIDE_WAIT_MAX - 40);
    expect(Math.hypot(v.x - base.x, v.z - base.z)).toBeLessThan(2);
    expect(v.seats[0]).toBe(0);
    expect(mates.filter((m) => m.vehicleId === v.id).length).toBeGreaterThanOrEqual(mates.length - 1);
    const reminders = ctx.radio.log.filter((m) => m.channel === 'secours' && /on n’attend plus que toi/.test(m.text));
    expect(reminders.length).toBeGreaterThanOrEqual(1);

    // il monte comme passager : le conducteur prend le volant, l'engin part deux tons
    boardAsPassenger(ctx, me, v);
    const tGo = rig.run(20, 0.25, () => ride.stage === 'route');
    expect(tGo).toBeGreaterThanOrEqual(0);
    expect(ride.aiDriving).toBe(true);
    const driver = ctx.people.get(v.seats[0])!;
    expect(driver.isPlayer).toBe(false);
    expect(driver.kind).toBe('pompier');
    expect(me.vehicleId).toBe(v.id);
    rig.step(3);
    expect(v.siren).not.toBe(0);
    expect(v.beacons).toBe(true);
    expect(Math.abs(v.speed)).toBeGreaterThan(1);
    expect(ctx.radio.log.some((m) => m.from === ride.callsign && /bien reçu, fourgon parti/.test(m.text))).toBe(true);

    // il arrive : arrêt à 15–30 m du feu (jamais dessus), tout le monde descend sauf le conducteur
    const tArrive = rig.run(240, 0.5, () => ride.stage === 'sur_place');
    const dStop = Math.hypot(v.x - bin.x, v.z - bin.z);
    console.log(`[trajet pompier] départ à ${Math.hypot(at.x - base.x, at.z - base.z).toFixed(0)} m, sur place en ${(tGo + 3 + tArrive).toFixed(0)} s, engin arrêté à ${dStop.toFixed(1)} m du feu`);
    expect(tArrive).toBeGreaterThan(10);
    expect(dStop).toBeGreaterThan(8);
    expect(dStop).toBeLessThan(40);
    expect(me.vehicleId).toBe(0);
    expect(Math.hypot(me.x - bin.x, me.z - bin.z)).toBeLessThan(40);
    expect(v.siren).toBe(0);
    rig.step(1);
    expect(call.state).toBe('sur_place');
    expect(ctx.radio.log.some((m) => m.from === ride.callsign && /^PARIS de .+ : sur les lieux/.test(m.text))).toBe(true);

    // l'équipage éteint, le compte rendu passe, l'intervention est close
    const tOut = rig.run(120, 0.5, () => bin.state !== 'burning');
    expect(tOut).toBeGreaterThanOrEqual(0);
    const tEnd = rig.run(60, 0.5, () => call.state === 'reparti');
    expect(tEnd).toBeGreaterThanOrEqual(0);
    expect(ctx.radio.log.some((m) => m.from === ride.callsign && /feu éteint/.test(m.text))).toBe(true);
    rig.step(6);
    expect(ctx.radio.log.some((m) => m.from === ride.callsign && /opération terminée.*Disponible/.test(m.text))).toBe(true);
    // l'engin rentre : l'équipage remonte, l'engin attend le joueur, puis rentre au centre (sans sirène)
    expect(ride.stage).toBe('retour');
    boardAsPassenger(ctx, me, v);
    const tHome = rig.run(30, 0.5, () => ride.aiDriving);
    expect(tHome).toBeGreaterThanOrEqual(0);
    rig.step(3);
    expect(v.siren).toBe(0);
    console.log(`[trajet pompier] retour ${ride.destName} (${ride.remaining.toFixed(0)} m)`);

    // la radio entendue est celle des secours : jamais d'indicatif de police
    const secours = ctx.radio.log.filter((m) => m.channel === 'secours');
    console.log(`[trajet pompier] radio : ${secours.map((m) => `${m.from}: ${m.text}`).join(' | ')}`);
    expect(secours.every((m) => !/CENTRAL|MISTRAL|SAPEUR UN/.test(m.text))).toBe(true);
  }, 120000);

  it('l’engin part sans le joueur au bout de deux minutes ; s’il prend le volant, c’est lui qui conduit', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const base = roadPoint(ctx, 0, -300);
    const { me, v } = playerCrew(ctx, 'pompier', base.x, base.z);
    rig.step(2);
    const far = roadPoint(ctx, 0, 300);
    rescue.request('pompiers', far.x, far.z, 0);
    const ride = rig.ext.playerRide!;
    expect(ride.stage).toBe('embarquement');
    // il reste à pied à côté : l'engin attend, puis part sans lui
    rig.step(RIDE_WAIT_MAX - 10);
    expect(ride.stage).toBe('embarquement');
    expect(Math.hypot(v.x - base.x, v.z - base.z)).toBeLessThan(2);
    const tLeft = rig.run(30, 0.5, () => ride.stage === 'route');
    expect(tLeft).toBeGreaterThanOrEqual(0);
    expect(ride.leftBehind).toBe(true);
    expect(me.vehicleId).toBe(0);
    expect(ctx.radio.log.some((m) => /on part sans toi/.test(m.text))).toBe(true);

    // autre session : il prend le volant à l'appel — il conduit lui-même, l'équipage monte avec lui
    const rig2 = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const ctx2 = rig2.ctx;
    const base2 = roadPoint(ctx2, 0, -300);
    const crew2 = playerCrew(ctx2, 'pompier', base2.x, base2.z);
    rig2.step(2);
    const far2 = roadPoint(ctx2, 0, 300);
    rig2.rescue.request('pompiers', far2.x, far2.z, 0);
    expect(ctx2.vehicles.enter(crew2.me, crew2.v, 'driver')).toBe(true);
    rig2.step(1);
    const ride2 = rig2.ext.playerRide!;
    expect(ride2.stage).toBe('aucun');
    expect(ride2.selfDrive).toBe(true);
    const tBoard = rig2.run(30, 0.5, () => crew2.mates.every((m) => m.vehicleId === crew2.v.id));
    expect(tBoard).toBeGreaterThanOrEqual(0);
    expect(ride2.aiDriving).toBe(false);
  }, 120000);

  it('SAMU : l’ambulance l’attend, le conducteur la conduit deux tons jusqu’à la victime, l’équipe descend ; compte rendu « SAMU 75 de SMUR … »', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    // (hors de la place ronde du quartier d'essai, où le pilote automatique bute sur le terre-plein)
    const base = roadPoint(ctx, 250, -300, 40);
    const { me, v } = playerCrew(ctx, 'samu', base.x, base.z);
    rig.step(2);
    let at = { x: 0, z: 0 };
    for (const [x, z] of [[250, 250], [300, 200], [250, 280], [-300, 250]]) {
      const c = { x, z };
      if (ctx.world.randomFreePoint(x, z, 8, 'road', () => ctx.rng.next(), c) && Math.hypot(c.x - base.x, c.z - base.z) > 520) { at = c; break; }
    }
    // la victime est sur le trottoir, à côté de la chaussée
    const victim = ctx.archetypes.spawn('manifestant', at.x + 2, at.z, { profile: 'pacifique', seed: 90 });
    wound(ctx, victim, 'critical');
    rig.step(1);
    const inc = api.list.find((i) => i.kind === 'blesse')!;
    const call = rescue.request('samu', victim.x, victim.z, 0, inc.id);
    expect(rig.ext.playerCallId).toBe(call.id);
    const ride = rig.ext.playerRide!;
    expect(ride.stage).toBe('embarquement');
    expect(ctx.radio.log.some((m) => m.from === 'SAMU 75' && /^SMUR .+ de SAMU 75 : .*départ pour /.test(m.text))).toBe(true);
    rig.step(8);
    boardAsPassenger(ctx, me, v);
    const tGo = rig.run(20, 0.25, () => ride.stage === 'route');
    expect(tGo).toBeGreaterThanOrEqual(0);
    rig.step(3);
    expect(v.siren).not.toBe(0);
    expect(ctx.people.get(v.seats[0])!.kind).toBe('samu');
    const tArrive = rig.run(240, 0.5, () => ride.stage === 'sur_place' || ride.stage === 'evacuation');
    const dStop = Math.hypot(v.x - victim.x, v.z - victim.z);
    console.log(`[trajet SAMU] sur place en ${(tGo + 3 + tArrive).toFixed(0)} s, ambulance à ${dStop.toFixed(1)} m de la victime`);
    expect(tArrive).toBeGreaterThan(10);
    expect(dStop).toBeLessThan(35);
    expect(me.vehicleId).toBe(0);
    rig.step(12);
    const net = ctx.radio.log.filter((m) => m.channel === 'secours');
    console.log(`[trajet SAMU] radio : ${net.map((m) => `${m.from}: ${m.text}`).join(' | ')}`);
    expect(net.some((m) => /^SAMU 75 de SMUR .+ : l’UMH est sur les lieux/.test(m.text))).toBe(true);
    expect(net.every((m) => !/CENTRAL|SANTÉ UN/.test(m.text))).toBe(true);
  }, 120000);
});
