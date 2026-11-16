// Secours — rôles jouables : le joueur pompier reçoit l'appel et son équipage travaille avec lui ; le joueur du SAMU soigne, charge et évacue.
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
import type { IncidentsRecords } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';
import type { RescueRig } from '@/sim/roles/rescue/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function roadPoint(ctx: GameContext, x: number, z: number): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, 5, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

/** Équipage du joueur, comme le crée la mise en place de session : une unité « secours », son engin, le joueur à la deuxième place. */
function playerCrew(ctx: GameContext, kind: 'pompier' | 'samu', x: number, z: number): { me: Person; mates: Person[]; v: Vehicle } {
  const squad = ctx.squads.create('secours', 'rescue', kind === 'pompier' ? 'SAPEUR 1' : 'SANTÉ 1');
  const variants = kind === 'pompier' ? [13, 11, 11, 12] : [16, 14, 15];
  const members = variants.map((variant, i) => ctx.archetypes.spawn(kind, x + 3 + i * 0.9, z + 3, { squadId: squad.id, seed: 80 + i, look: { extras: { variant } } }));
  const v = ctx.vehicles.spawn(kind === 'pompier' ? 'camion_pompiers' : 'ambulance', x, z, Math.PI, { faction: 'rescue' });
  squad.vehicleId = v.id;
  const me = members[1];
  ctx.player.possess(me.id, 'secouriste');
  return { me, mates: members.filter((m) => m !== me), v };
}

/** Le joueur conduit jusqu'au point donné (le trajet lui-même relève de la conduite : ici l'engin est déplacé d'un coup). */
function driveTo(rig: RescueRig, v: Vehicle, x: number, z: number, heading: number): void {
  v.x = x;
  v.z = z;
  v.heading = heading;
  rig.step(0.5);
}

describe('secours — le joueur pompier', () => {
  it('l\'appel lui est attribué par radio, son équipage monte avec lui, éteint à la lance sur place, et l\'intervention est notée', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const base = roadPoint(ctx, 0, -300);
    const { me, mates, v } = playerCrew(ctx, 'pompier', base.x, base.z);
    const at = roadPoint(ctx, 0, -200);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    expect(ctx.require<PropsExtApi>('props.ext').ignite(bin, 0)).toBe(true);
    rig.step(3);
    const fire = api.list.find((i) => i.kind === 'feu_poubelle')!;
    expect(api.playerIncidentId).toBe(0);

    // le commandement demande les pompiers : c'est l'équipage du joueur qui est engagé
    expect(api.assign(fire.id, 'pompiers')).toBe(true);
    const call = rescue.calls[0];
    expect(rig.ext.playerCallId).toBe(call.id);
    expect(call.state).toBe('en_route');
    expect(call.vehicleId).toBe(v.id);
    expect(api.playerIncidentId).toBe(fire.id);
    expect(fire.means).toBe('joueur');
    expect(ctx.radio.log.some((m) => m.from === 'CENTRAL' && /SAPEUR UN ICI CENTRAL.*Vous êtes engagé/.test(m.text))).toBe(true);
    expect(rig.ext.crews.length).toBe(1);
    expect(rig.ext.crews[0].playerLed).toBe(true);
    // aucun engin PNJ n'est parti à sa place
    expect(ctx.vehicles.list.filter((x) => x.kind === 'camion_pompiers').length).toBe(1);

    // il prend le volant : ses équipiers montent
    expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
    const tBoard = rig.run(30, 0.5, () => mates.every((m) => m.vehicleId === v.id));
    expect(tBoard).toBeGreaterThanOrEqual(0);
    // il conduit jusqu'au feu, se gare à une quinzaine de mètres et descend
    driveTo(rig, v, at.x, at.z - 15, 0);
    rig.step(1);
    expect(call.state).toBe('sur_place');
    expect(ctx.vehicles.exit(me)).toBe(true);
    const tOut = rig.run(90, 0.5, () => bin.state !== 'burning');
    expect(tOut).toBeGreaterThan(5);
    expect(mates.filter((m) => m.vehicleId === 0).length).toBeGreaterThanOrEqual(2);
    const tEnd = rig.run(30, 0.5, () => call.state === 'reparti');
    expect(tEnd).toBeGreaterThanOrEqual(0);
    const rec = rig.records.of(call.id)!;
    const task = ctx.require<IncidentsRecords>('incidents.records').playerTasks[0];
    console.log(`[joueur pompier] équipiers à bord en ${tBoard.toFixed(1)} s ; feu éteint par l'équipage ${tOut.toFixed(1)} s après l'arrivée ; ${rec.points} points ; tâche : ${task.comment} Note ${task.note}/100`);
    expect(rec.playerLed).toBe(true);
    expect(rec.firesOut).toBeGreaterThanOrEqual(1);
    expect(rec.points).toBeGreaterThanOrEqual(12);
    expect(fire.state).toBe('resolu');
    expect(api.playerIncidentId).toBe(0);
    expect(task.success).toBe(true);
    expect(task.note).toBeGreaterThan(50);
    expect(rig.records.playerPoints()).toBe(rec.points);
    // l'équipage est de nouveau disponible : il le suit, et remonte quand il reprend le volant
    expect(rig.ext.playerCallId).toBe(0);
    rig.step(5);
    expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
    const tBack = rig.run(40, 0.5, () => mates.every((m) => m.vehicleId === v.id));
    expect(tBack).toBeGreaterThanOrEqual(0);
  });
});

describe('secours — le joueur soignant du SAMU', () => {
  it('il soigne (bilan puis gestes, une dose de la trousse), porte la victime, la charge dans l\'ambulance et l\'évacue', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, role: 'secouriste', extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const base = roadPoint(ctx, 0, -300);
    const { me, v } = playerCrew(ctx, 'samu', base.x, base.z);
    const at = roadPoint(ctx, 0, -200);
    const victim = ctx.archetypes.spawn('manifestant', at.x, at.z, { profile: 'pacifique', seed: 90 });
    wound(ctx, victim, 'critical');
    rig.step(1);
    const inc = api.list.find((i) => i.kind === 'blesse')!;
    const call = rescue.request('samu', victim.x, victim.z, 0, inc.id);
    expect(rig.ext.playerCallId).toBe(call.id);
    expect(api.playerIncidentId).toBe(inc.id);

    // il arrive en ambulance, descend, s'agenouille près de la victime
    ctx.vehicles.enter(me, v, 'driver');
    driveTo(rig, v, at.x, at.z - 9, 0);
    ctx.vehicles.exit(me);
    me.x = victim.x + 0.9;
    me.z = victim.z;
    rig.step(0.3);
    const opts: import('@/core/contracts').InteractionOption[] = [];
    ctx.interactions.options(me, opts);
    console.log('[joueur samu] gestes proposés près de la victime :', opts.map((o) => `${o.label} (${o.duration.toFixed(0)} s)`).join(', '));
    expect(opts[0].verb).toBe('soigner'); // un blessé grave se soigne avant de se porter
    expect(opts[0].duration).toBeCloseTo(5 + 15 * 0.8, 5); // bilan 5 s + gestes d'une urgence absolue (équipe médicale)
    const kit0 = ctx.actions.has(me, 'trousse_secours');
    const h0 = victim.health;
    expect(ctx.interactions.start(me, opts[0])).toBe(true);
    rig.step(6);
    expect(rig.care.state(victim.id)!.triage).toBe('rouge'); // le bilan révèle la couleur de tri
    rig.step(12);
    expect(ctx.interactions.current(me)).toBeNull();
    expect(ctx.actions.has(me, 'trousse_secours')).toBe(kit0 - 1);
    expect(victim.health).toBeGreaterThan(h0);
    expect(victim.posture).toBe('down'); // stabilisée, pas guérie
    const hStable = victim.health;
    rig.step(10);
    expect(victim.health).toBeGreaterThanOrEqual(hStable - 1e-6);
    // plus rien à soigner : le geste proposé devient « porter »
    ctx.interactions.options(me, opts);
    expect(opts[0].verb).toBe('porter');
    expect(ctx.interactions.startVerb(me, 'soigner', victim.id)).toBe(false);
    expect(ctx.interactions.start(me, opts[0])).toBe(true);
    rig.step(4);
    expect(me.carrying).toBe(victim.id);
    // aux portes arrière de l'ambulance : « charger »
    me.x = v.x - Math.sin(v.heading) * (v.def.length * 0.5 + 1.2);
    me.z = v.z - Math.cos(v.heading) * (v.def.length * 0.5 + 1.2);
    rig.step(0.3);
    ctx.interactions.options(me, opts);
    expect(opts[0].verb).toBe('evacuer');
    expect(ctx.interactions.start(me, opts[0])).toBe(true);
    rig.step(6);
    expect(victim.vehicleId).toBe(v.id);
    expect(me.carrying).toBe(0);
    expect(v.seats[v.seats.length - 1]).toBe(victim.id);
    // il la conduit au point de rassemblement des victimes (là où l'ambulance stationnait)
    ctx.vehicles.enter(me, v, 'driver');
    driveTo(rig, v, base.x, base.z, Math.PI);
    const tEnd = rig.run(20, 0.5, () => call.state === 'reparti');
    expect(tEnd).toBeGreaterThanOrEqual(0);
    expect(ctx.people.get(victim.id)).toBeUndefined();
    rig.step(2);
    const rec = rig.records.of(call.id)!;
    console.log(`[joueur samu] victime évacuée : ${rec.victimsTreated} soignée, ${rec.victimsEvacuated} évacuée, ${rec.points} points ; incident ${inc.state}`);
    expect(rec.victimsEvacuated).toBe(1);
    expect(rec.points).toBe(25);
    expect(inc.state).toBe('resolu');
    expect(ctx.require<IncidentsRecords>('incidents.records').playerTasks[0].success).toBe(true);
  });
});
