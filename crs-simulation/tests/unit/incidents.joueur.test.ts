// Incidents — le joueur : exécutant, il reçoit la tâche par radio et elle est notée ; commandant, rien ne lui est attribué d'office.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Prop } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as incidentsModule } from '@/gameplay/incidents';
import { startIncidents } from '@/gameplay/incidents/testkit';
import type { IncidentsRig } from '@/gameplay/incidents/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidentsModule];
const CONFIG = { mode: 'test' as const, x: 0, z: -230, extra: { props: { ambientDensity: 0 } } };

/** Le joueur se place à 2,4 m du foyer, face à lui, et vide son extincteur par jets d'une seconde. */
function extinguish(rig: IncidentsRig, ctx: GameContext, me: Person, bin: Prop, seconds: number): number {
  me.x = bin.x;
  me.z = bin.z + 2.4;
  ctx.player.state.camYaw = Math.atan2(bin.x - me.x, bin.z - me.z);
  expect(ctx.actions.selectById(me, 'extincteur')).toBe(true);
  rig.step(1.5);
  let t = 0;
  while (t < seconds && bin.state === 'burning') {
    ctx.actions.use(me);
    rig.step(0.25);
    t += 0.25;
  }
  return t;
}

describe('incidents — joueur exécutant', () => {
  it('CRS porte-extincteur : la salle lui confie le feu par radio, il l\'éteint, la tâche est notée', async () => {
    const rig = await startIncidents(MODULES, { ...CONFIG, role: 'crs' });
    const { ctx, incidents, records } = rig;
    const at = rig.roadPoint(0, -230);
    const me = ctx.archetypes.spawn('crs', at.x, at.z + 35, { poste: 'extincteur', seed: 70 });
    ctx.player.possess(me.id, 'crs');
    expect(ctx.actions.has(me, 'extincteur')).toBeGreaterThan(0);
    const bin = ctx.props.spawn('poubelle', at.x, at.z, 0);
    expect(ctx.require<PropsExtApi>('props.ext').ignite(bin, 0)).toBe(true);
    rig.step(2);
    const inc = rig.find('feu_poubelle')!;
    expect(incidents.playerIncidentId).toBe(0); // la salle laisse d'abord au commandement le temps de désigner un moyen
    const tGiven = rig.run(20, 0.5, () => incidents.playerIncidentId !== 0);
    expect(tGiven).toBeGreaterThan(3);
    expect(incidents.playerIncidentId).toBe(inc.id);
    expect(inc.state).toBe('assigne');
    expect(inc.means).toBe('joueur');
    const order = ctx.radio.log.find((m) => m.from === 'CENTRAL' && /Vous en êtes chargé/.test(m.text));
    expect(order).toBeDefined();
    expect(order!.text).toContain(inc.label);
    expect(records.playerTasks.length).toBe(1);
    const task = records.playerTasks[0];
    expect(task.success).toBeNull();
    expect(task.distance).toBeGreaterThan(30);
    // il y va, se met en position et éteint
    rig.step(6);
    const used = extinguish(rig, ctx, me, bin, 20);
    expect(bin.state).not.toBe('burning');
    rig.step(4);
    console.log(`[incidents] tâche du joueur : confiée après ${(tGiven + 2).toFixed(1)} s, feu éteint en ${used.toFixed(1)} s d'extincteur — ${task.comment} Note ${task.note}/100`);
    expect(inc.state).toBe('resolu');
    expect(incidents.playerIncidentId).toBe(0);
    expect(task.success).toBe(true);
    expect(task.arrivedAt).toBeGreaterThan(task.assignedAt);
    expect(task.endedAt).toBeGreaterThan(task.arrivedAt);
    expect(task.note).toBeGreaterThanOrEqual(60);
    expect(task.note).toBeLessThanOrEqual(100);
    expect(task.comment).toContain('traité');
    const rec = records.of(inc.id)!;
    expect(rec.byPlayer).toBe(true);
    expect(rec.outcome).toBe('traite');
    expect(rec.means).toBe('joueur');
  });

  it('une tâche abandonnée ou échouée est notée comme telle ; une seule tâche à la fois', async () => {
    const rig = await startIncidents(MODULES, { ...CONFIG, role: 'crs' });
    const { ctx, incidents, records } = rig;
    const ext = ctx.require<PropsExtApi>('props.ext');
    const at = rig.roadPoint(0, -230);
    const me = ctx.archetypes.spawn('crs', at.x, at.z + 30, { poste: 'extincteur', seed: 71 });
    ctx.player.possess(me.id, 'crs');
    const a = ctx.props.spawn('poubelle', at.x, at.z, 0);
    const b = ctx.props.spawn('poubelle', at.x, at.z + 60, 0);
    ext.ignite(a, 0);
    rig.step(1);
    const first = rig.find('feu_poubelle')!;
    // le joueur prend lui-même l'incident (« moi-même »), sans attendre la salle
    expect(incidents.assign(first.id, 'joueur')).toBe(true);
    expect(incidents.playerIncidentId).toBe(first.id);
    ext.ignite(b, 0);
    rig.step(1);
    const second = incidents.list.find((i) => i.targetId === b.id)!;
    // il en prend un autre : le premier redevient un incident à confier, la tâche est notée « abandonnée »
    expect(incidents.assign(second.id, 'joueur')).toBe(true);
    expect(incidents.playerIncidentId).toBe(second.id);
    expect(first.state).toBe('ouvert');
    expect(records.playerTasks.length).toBe(2);
    expect(records.playerTasks[0].success).toBe(false);
    expect(records.playerTasks[0].comment).toContain('abandonnée');
    // il laisse brûler : la poubelle se consume entièrement, la tâche échoue
    incidents.unassign(second.id);
    expect(incidents.playerIncidentId).toBe(0);
    expect(records.playerTasks[1].success).toBe(false);
    // hors de combat, on ne lui confie plus rien
    ctx.health.setDown(me, true, 0);
    expect(incidents.assign(first.id, 'joueur')).toBe(false);
  });

  it('commandant : rien n\'est attribué d\'office, c\'est lui qui délègue', async () => {
    const rig = await startIncidents(MODULES, { ...CONFIG, role: 'commandant' });
    const { ctx, incidents } = rig;
    const at = rig.roadPoint(0, -230);
    const me = ctx.archetypes.spawn('crs', at.x, at.z + 20, { poste: 'commandant_unite', rank: 'commandant', seed: 72 });
    ctx.player.possess(me.id, 'commandant');
    const bin = ctx.props.spawn('poubelle', at.x, at.z, 0);
    ctx.require<PropsExtApi>('props.ext').ignite(bin, 0);
    rig.step(30);
    const inc = rig.find('feu_poubelle')!;
    expect(inc.state).toBe('ouvert');
    expect(incidents.playerIncidentId).toBe(0);
    // l'ordre qu'il donne porte son nom
    const squad = ctx.squads.create('groupe', 'police', 'MISTRAL 1 ALFA');
    ctx.archetypes.spawn('crs', at.x + 12, at.z, { poste: 'extincteur', squadId: squad.id, seed: 73 });
    expect(incidents.assign(inc.id, 'unite', squad.id)).toBe(true);
    expect(squad.order.type).toBe('eteindre');
    expect(squad.order.issuedBy).toBe(me.id);
  });
});
