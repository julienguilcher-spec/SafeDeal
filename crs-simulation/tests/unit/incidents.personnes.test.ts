// Incidents — personnes et lieux : blessés, agent à terre, agent isolé, pillage, barricade, automobiliste, doublons, API.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import type { PropsExtApi } from '@/sim/props/api';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import { createSystems as incidentsModule } from '@/gameplay/incidents';
import { douse, startIncidents, wound } from '@/gameplay/incidents/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidentsModule];
const CONFIG = { mode: 'test' as const, x: 0, z: -230, extra: { props: { ambientDensity: 0 } } };

describe('incidents — blessés et agents', () => {
  it('blessé à terre : urgence selon la gravité, gravité qui monte faute de soins, clôture quand il se relève', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx, incidents } = rig;
    const at = rig.roadPoint(0, -230);
    // une simple chute ne fait pas un incident
    const faller = ctx.archetypes.spawn('manifestant', at.x + 12, at.z, { profile: 'pacifique', seed: 1 });
    ctx.health.setDown(faller, true, 0);
    rig.step(8);
    expect(faller.posture).toBe('stand');
    expect(incidents.list.length).toBe(0);

    // un blessé sérieux reste sonné quelques secondes puis se relève souvent seul : pas d'incident non plus
    const dazed = ctx.archetypes.spawn('manifestant', at.x + 16, at.z, { profile: 'pacifique', seed: 3 });
    wound(ctx, dazed, 'serious');
    rig.step(14);
    expect(dazed.posture).toBe('stand');
    expect(incidents.list.length).toBe(0);

    // celui-ci ne se relève pas (malaise) : signalé une fois le doute levé, urgence relative
    const victim = ctx.archetypes.spawn('manifestant', at.x, at.z, { profile: 'pacifique', seed: 2 });
    wound(ctx, victim, 'serious');
    ctx.require<{ knockDown(p: Person, seconds: number, sourceId: number): void }>('people.health').knockDown(victim, 0, 0);
    rig.step(5);
    expect(incidents.list.length).toBe(0);
    rig.step(8);
    const inc = rig.find('blesse')!;
    expect(inc.urgency).toBe(2);
    expect(inc.label.startsWith('Blessé à terre')).toBe(true);
    expect(inc.targetKind).toBe('person');
    // son état devient critique : urgence vitale, aggravation portée au journal, annonce radio
    wound(ctx, victim, 'critical');
    rig.step(2);
    expect(inc.urgency).toBe(3);
    expect(inc.label.startsWith('Blessé grave')).toBe(true);
    const rec = rig.records.of(inc.id)!;
    expect(rec.aggravated).toBe(true);
    // faute de soins, elle s'affaiblit : la gravité monte
    const s0 = inc.severity;
    const h0 = victim.health;
    rig.step(60);
    console.log(`[incidents] blessé grave sans soins pendant 60 s : santé ${h0.toFixed(0)} → ${victim.health.toFixed(0)}, gravité ${s0.toFixed(2)} → ${inc.severity.toFixed(2)}`);
    expect(victim.health).toBeLessThan(h0);
    expect(inc.severity).toBeGreaterThan(s0);
    expect(ctx.radio.log.some((m) => m.priority === 2 && /URGENT/.test(m.text))).toBe(true);
    // soigné et remis sur pied : la cause disparaît, l'incident se clôt de lui-même
    ctx.health.heal(victim, 60, 0);
    rig.step(6);
    expect(victim.posture).toBe('stand');
    expect(inc.state).toBe('resolu');
    expect(rec.outcome).toBe('traite');
  });

  it('agent à terre et doublons : deux blessés voisins font un seul incident, un policier un incident distinct', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx, incidents } = rig;
    const at = rig.roadPoint(0, -230);
    const a = ctx.archetypes.spawn('manifestant', at.x, at.z, { profile: 'pacifique', seed: 11 });
    const b = ctx.archetypes.spawn('manifestant', at.x + 2.5, at.z + 1, { profile: 'militant', seed: 12 });
    const far = ctx.archetypes.spawn('manifestant', at.x + 1, at.z + 40, { profile: 'pacifique', seed: 13 });
    const crs = ctx.archetypes.spawn('crs', at.x - 2, at.z, { poste: 'bouclier', seed: 14 });
    const keepDown = (p: Person): void => ctx.require<{ knockDown(p: Person, seconds: number, sourceId: number): void }>('people.health').knockDown(p, 0, 0);
    wound(ctx, a, 'serious');
    keepDown(a);
    wound(ctx, b, 'critical');
    wound(ctx, far, 'serious');
    keepDown(far);
    wound(ctx, crs, 'serious');
    rig.step(1.5);
    // l'urgence absolue et l'agent à terre sont signalés tout de suite ; les blessés sérieux une fois le doute levé
    expect(incidents.list.map((i) => i.kind).sort()).toEqual(['agent_a_terre', 'blesse']);
    keepDown(crs);
    rig.step(13);
    const list = incidents.list.filter((i) => i.state !== 'resolu' && i.state !== 'echoue');
    console.log('[incidents] blessés :', list.map((i) => `${i.kind} « ${i.label} » urgence ${i.urgency}`).join(' | '));
    expect(list.filter((i) => i.kind === 'blesse').length).toBe(2);
    expect(list.filter((i) => i.kind === 'agent_a_terre').length).toBe(1);
    const group = list.find((i) => i.kind === 'blesse' && Math.hypot(i.x - at.x, i.z - at.z) < 6)!;
    expect(group.label.startsWith('2 blessés')).toBe(true);
    expect(group.targetId).toBe(b.id); // la victime la plus atteinte est la cible
    expect(group.urgency).toBe(3);
    expect(rig.records.of(group.id)!.merged).toBe(1);
    const officer = list.find((i) => i.kind === 'agent_a_terre')!;
    expect(officer.urgency).toBe(3);
    expect(officer.targetId).toBe(crs.id);
    expect(officer.label.startsWith('Agent à terre')).toBe(true);
    // API : l'incident ouvert le plus proche, par nature
    expect(incidents.nearest(at.x, at.z, 10, 'blesse')).toBe(group);
    expect(incidents.nearest(at.x, at.z, 10, 'agent_a_terre')).toBe(officer);
    expect(incidents.nearest(at.x + 300, at.z, 10)).toBeNull();
    // une déclaration venue d'un autre module pour la même personne ne crée pas de doublon
    expect(incidents.open('blesse', a.x, a.z, 'person', a.id, 2)).toBe(group);
    expect(incidents.list.length).toBe(3);
    // un des deux blessés se relève : l'incident reste ouvert pour l'autre
    ctx.health.heal(a, 60, 0);
    rig.step(6);
    expect(group.state).toBe('ouvert');
    expect(group.label.startsWith('Blessé grave')).toBe(true);
    // clôture explicite
    incidents.close(officer.id, true, crs.id);
    expect(officer.state).toBe('resolu');
  });

  it('agent isolé : un agent seul au milieu d\'hostiles est signalé, puis l\'incident se clôt quand des collègues le rejoignent', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx, incidents } = rig;
    const at = rig.roadPoint(0, -230);
    const squad = ctx.squads.create('groupe', 'police', 'MISTRAL 2 BRAVO');
    const lone = ctx.archetypes.spawn('crs', at.x, at.z, { poste: 'interpellation', squadId: squad.id, seed: 21 });
    const mates: Person[] = [];
    for (let i = 0; i < 4; i++) mates.push(ctx.archetypes.spawn('crs', at.x + i, at.z + 45, { poste: 'bouclier', squadId: squad.id, seed: 22 + i }));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const h = ctx.archetypes.spawn('manifestant', at.x + Math.sin(a) * 4, at.z + Math.cos(a) * 4, { profile: 'radical', seed: 30 + i });
      h.anger = 0.9;
    }
    rig.step(2);
    expect(rig.find('agent_isole')).toBeUndefined(); // il faut que cela dure
    const t = rig.run(15, 0.5, () => rig.find('agent_isole') !== undefined);
    expect(t).toBeGreaterThan(1);
    const inc = rig.find('agent_isole')!;
    console.log(`[incidents] agent isolé signalé après ${(t + 2).toFixed(1)} s : « ${inc.label} », urgence ${inc.urgency}, gravité ${inc.severity.toFixed(2)}`);
    expect(inc.targetId).toBe(lone.id);
    expect(inc.urgency).toBe(3);
    // un groupe sans hostiles autour n'est pas « isolé »
    expect(incidents.list.length).toBe(1);
    // ses collègues le rejoignent
    for (const m of mates) {
      m.x = lone.x + 1 + mates.indexOf(m) * 0.8;
      m.z = lone.z + 1.5;
    }
    const closed = rig.run(20, 0.5, () => inc.state === 'resolu');
    expect(closed).toBeGreaterThan(3);
    expect(inc.state).toBe('resolu');
  });
});

describe('incidents — pillage, barricade, automobiliste, véhicule', () => {
  it('pillage : ouvert au premier vol, il s\'aggrave tant qu\'il dure, puis se clôt sans traitement quand les pilleurs sont partis', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx } = rig;
    const at = rig.roadPoint(0, -230);
    const shop = ctx.props.addShop({ category: 'telephonie', x: at.x + 3, z: at.z - 5, heading: 0, width: 5 });
    const looter = ctx.archetypes.spawn('manifestant', shop.x, shop.z + 1, { profile: 'pilleur', seed: 7 });
    for (let i = 0; i < 6; i++) {
      ctx.events.emit('shop:looted', { id: shop.id, byId: looter.id, amount: 0.05 });
      rig.step(5);
    }
    const inc = rig.find('pillage')!;
    expect(inc.label.startsWith('Pillage en cours')).toBe(true);
    expect(inc.severity).toBeGreaterThan(0.5);
    expect(rig.t.ctx.radio.log.some((m) => /illage/.test(m.text))).toBe(true);
    const t = rig.run(60, 1, () => inc.state !== 'ouvert');
    expect(t).toBeGreaterThan(20);
    expect(inc.state).toBe('echoue');
    const rec = rig.records.of(inc.id)!;
    expect(rec.outcome).toBe('cause_disparue');
    expect(rec.assignedAt).toBe(-1);
    expect(rig.records.stats().neverAssigned).toBe(1);
    expect(rig.records.stats().score).toBeLessThan(100);
  });

  it('barricade, automobiliste bloqué, véhicule en feu : chacun son incident, clos quand la cause disparaît', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx, incidents } = rig;
    const at = rig.roadPoint(0, -230);
    // barricade
    const barricade = ctx.props.spawn('barricade', at.x, at.z + 20, 0);
    rig.step(1);
    const obstacle = rig.find('barricade')!;
    expect(obstacle.targetId).toBe(barricade.id);
    expect(obstacle.label.startsWith('Barricade')).toBe(true);
    // la barricade prend feu : c'est une autre tâche (éteindre), au même endroit
    ctx.require<PropsExtApi>('props.ext').ignite(barricade, 0);
    rig.step(1);
    const burning = rig.find('feu_barricade')!;
    expect(burning).toBeDefined();
    expect(burning.urgency).toBeGreaterThanOrEqual(2);
    expect(incidents.list.length).toBe(2);
    douse(rig, barricade.x, barricade.z, 30, 3);
    rig.step(4);
    expect(burning.state).toBe('resolu');
    expect(obstacle.state).toBe('ouvert');
    ctx.props.remove(barricade.id);
    rig.step(2);
    expect(obstacle.state).toBe('resolu');

    // automobiliste bloqué (signalé par le module de circulation), puis libéré
    const car = ctx.vehicles.spawn('citadine', at.x, at.z - 25, 0);
    ctx.events.emitAny('traffic:motorist', { vehicleId: car.id, personId: 0, state: 'bloque', x: car.x, z: car.z });
    rig.step(1);
    const motorist = rig.find('automobiliste_bloque')!;
    expect(motorist.targetKind).toBe('vehicle');
    expect(motorist.label.startsWith('Automobiliste bloqué')).toBe(true);
    // le module de circulation déclare aussi l'incident par l'API : pas de doublon
    expect(incidents.open('automobiliste_bloque', car.x, car.z, 'vehicle', car.id, 1)).toBe(motorist);
    ctx.events.emitAny('traffic:motorist', { vehicleId: car.id, personId: 0, state: 'libere', x: car.x, z: car.z });
    expect(motorist.state).toBe('resolu');

    // véhicule en feu : urgent, un extincteur ne suffit pas (délégation à une unité refusée)
    const squad = ctx.squads.create('groupe', 'police', 'MISTRAL 1 ALFA');
    ctx.archetypes.spawn('crs', at.x + 10, at.z, { poste: 'extincteur', squadId: squad.id, seed: 40 });
    ctx.require<VehiclesExtApi>('vehicles.ext').ignite(car, 0, 1);
    const t = rig.run(120, 1, () => rig.find('feu_vehicule') !== undefined && rig.find('feu_vehicule')!.severity > 0.3);
    expect(t).toBeGreaterThanOrEqual(0);
    const fire = rig.find('feu_vehicule')!;
    expect(fire.label.startsWith('Véhicule en feu')).toBe(true);
    expect(fire.urgency).toBeGreaterThanOrEqual(2);
    const refused = incidents.assign(fire.id, 'unite', squad.id);
    console.log(`[incidents] véhicule en feu : gravité ${fire.severity.toFixed(2)}, intensité ${car.burning.toFixed(2)}, extincteur ${refused ? 'accepté' : 'refusé'}`);
    if (car.burning >= 0.35) expect(refused).toBe(false);
  });
});
