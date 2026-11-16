// Secours — sapeurs-pompiers : appel, trajet, attente tant que la zone est hostile, intervention, départ.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import { startRescue } from '@/sim/roles/rescue/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, incidents, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function roadPoint(ctx: GameContext, x: number, z: number): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, 5, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

function crewOf(ctx: GameContext, squadId: number): Person[] {
  const s = ctx.squads.get(squadId);
  return s ? s.members.map((id) => ctx.people.get(id)!).filter(Boolean) : [];
}

describe('secours — sapeurs-pompiers', () => {
  it('appelés pour un feu en zone calme : ils arrivent par la rue, éteignent à la lance et repartent', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const propsExt = ctx.require<PropsExtApi>('props.ext');
    const at = roadPoint(ctx, 0, -230);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    expect(propsExt.ignite(bin, 0)).toBe(true);
    rig.step(20);
    expect(bin.state).toBe('burning');

    const call = rescue.request('pompiers', bin.x, bin.z, 0);
    expect(call.state).toBe('demande');
    expect(call.eta).toBeGreaterThan(10);
    const eta0 = call.eta;
    // même demande répétée : même appel
    expect(rescue.request('pompiers', bin.x + 3, bin.z, 0)).toBe(call);
    expect(rescue.calls.length).toBe(1);

    const tRoute = rig.run(60, 0.5, () => call.state !== 'demande');
    expect(tRoute).toBeGreaterThan(2);
    expect(call.state).toBe('en_route');
    expect(call.vehicleId).not.toBe(0);
    const v = ctx.vehicles.get(call.vehicleId)!;
    expect(v.kind).toBe('camion_pompiers');
    const squadId = rig.ext.squadOf(call.id);
    const crew = crewOf(ctx, squadId);
    expect(crew.length).toBe(6);
    expect(crew.every((p) => p.kind === 'pompier' && p.vehicleId === v.id)).toBe(true);
    const start = Math.hypot(v.x - bin.x, v.z - bin.z);
    expect(start).toBeGreaterThan(150);
    expect(v.siren).not.toBe(0);

    const tScene = rig.run(240, 0.5, () => call.state === 'sur_place');
    console.log(`[pompiers] départ à ${start.toFixed(0)} m, temps estimé ${eta0.toFixed(0)} s, sur place ${(tRoute + tScene).toFixed(0)} s après l'appel`);
    expect(tScene).toBeGreaterThan(5);
    expect(call.state).toBe('sur_place');
    expect(Math.hypot(v.x - bin.x, v.z - bin.z)).toBeLessThan(40);
    expect(ctx.world.buildingHeightAt(v.x, v.z)).toBe(0);

    const tOut = rig.run(120, 0.5, () => bin.state !== 'burning');
    console.log(`[pompiers] feu éteint ${tOut.toFixed(1)} s après l'arrivée (établissement de la lance compris) | cuve : ${rig.ext.crews[0]?.water.toFixed(0)} l`);
    expect(tOut).toBeGreaterThan(8); // l'établissement prend du temps
    expect(tOut).toBeLessThan(60);
    // les porte-lance sont descendus ; le conducteur est resté à la pompe
    expect(crew.filter((p) => p.vehicleId === 0).length).toBeGreaterThanOrEqual(3);

    const tLeft = rig.run(120, 0.5, () => call.state === 'reparti');
    expect(tLeft).toBeGreaterThanOrEqual(0);
    expect(rig.states(call)).toEqual(['en_route', 'sur_place', 'reparti']);
    const rec = rig.records.of(call.id)!;
    expect(rec.firesOut).toBeGreaterThanOrEqual(1);
    expect(rec.arrivedAt).toBeGreaterThan(rec.requestedAt);
    expect(rec.leftAt).toBeGreaterThan(rec.arrivedAt);
    expect(rec.waited).toBe(0);
    // l'engin quitte la carte avec son équipage
    const tGone = rig.run(300, 1, () => ctx.vehicles.get(v.id) === undefined);
    console.log(`[pompiers] reparti ${tLeft.toFixed(0)} s après l'extinction, hors carte ${tGone.toFixed(0)} s plus tard | radio :`,
      ctx.radio.log.filter((m) => m.channel === 'secours').map((m) => m.text).join(' / '));
    expect(tGone).toBeGreaterThanOrEqual(0);
    expect(crew.every((p) => ctx.people.get(p.id) === undefined)).toBe(true);
    expect(ctx.squads.get(squadId)).toBeUndefined();
  });
});

describe('secours — zone hostile', () => {
  it('ils s\'arrêtent à distance tant que la zone est hostile (motif renseigné), interviennent une fois protégés, puis repartent', async () => {
    const { createSystems: police } = await import('@/sim/police');
    const rig = await startRescue([...MODULES, police], { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const propsExt = ctx.require<PropsExtApi>('props.ext');
    const incidentsApi = ctx.require<import('@/core/extensions').IncidentsApi>('incidents');
    const at = roadPoint(ctx, 0, -230);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    expect(propsExt.ignite(bin, 0)).toBe(true);
    // un groupe hostile tient les abords du feu
    const hostiles: Person[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = ctx.archetypes.spawn('manifestant', bin.x + Math.sin(a) * 6, bin.z + Math.cos(a) * 6, { profile: 'radical', seed: 100 + i });
      hostiles.push(p);
    }
    rig.step(3);
    const fire = incidentsApi.list.find((i) => i.kind === 'feu_poubelle')!;
    expect(fire).toBeDefined();
    expect(incidentsApi.assign(fire.id, 'pompiers')).toBe(true);
    expect(rescue.calls.length).toBe(1);
    const call = rescue.calls[0];
    expect(call.incidentId).toBe(fire.id);
    expect(fire.state).toBe('assigne');
    expect(fire.means).toBe('pompiers');

    // ils arrivent… et s'arrêtent à distance
    const tWait = rig.run(240, 0.5, () => call.state === 'en_attente');
    expect(tWait).toBeGreaterThan(0);
    const v = ctx.vehicles.get(call.vehicleId)!;
    rig.step(6);
    const dStop = Math.hypot(v.x - bin.x, v.z - bin.z);
    console.log(`[pompiers] zone hostile : arrêt à ${dStop.toFixed(0)} m du feu, motif « ${call.waitingReason} »`);
    expect(call.state).toBe('en_attente');
    expect(call.waitingReason).toContain('foule hostile');
    expect(dStop).toBeGreaterThan(35);
    expect(Math.abs(v.speed)).toBeLessThan(0.5);
    const crew = crewOf(ctx, rig.ext.squadOf(call.id));
    expect(crew.every((p) => p.vehicleId === v.id)).toBe(true); // personne ne descend
    expect(bin.state).toBe('burning');
    // l'attente est signalée : incident « secours bloqués », annonce radio de l'équipage
    rig.step(4);
    const blocked = incidentsApi.list.find((i) => i.kind === 'secours_bloques');
    expect(blocked).toBeDefined();
    expect(blocked!.label.startsWith('Secours bloqués')).toBe(true);
    expect(ctx.radio.log.some((m) => m.channel === 'secours' && m.priority === 2 && /arrêtés à la limite de la zone/.test(m.text))).toBe(true);
    // ils attendent aussi longtemps qu'il le faut
    rig.step(20);
    expect(call.state).toBe('en_attente');
    expect(rig.records.of(call.id)!.waited).toBeGreaterThan(20);

    // le commandement confie l'incident à une section : ordre « proteger » sur la zone d'intervention
    const units = ctx.require<import('@/sim/police/api').PoliceUnitsApi>('police.units');
    // elle part de 75 m, du côté opposé à l'engin
    const side = v.z > bin.z ? -1 : 1;
    const sec = units.createSection({ x: bin.x, z: bin.z + side * 75, heading: side > 0 ? Math.PI : 0, layout: 'colonne', vehicles: false });
    const orders: string[] = [];
    ctx.events.on('order:issued', (e) => {
      if (e.squadId === sec.squad.id) orders.push(e.order.type);
    });
    expect(incidentsApi.assign(blocked!.id, 'unite', sec.squad.id)).toBe(true);
    expect(orders).toEqual(['proteger']);
    expect(Math.hypot(sec.squad.order.x - bin.x, sec.squad.order.z - bin.z)).toBeLessThan(3);
    // tant que l'unité n'est pas sur place, l'ordre seul ne suffit pas : ils attendent encore
    rig.step(2);
    expect(call.state).toBe('en_attente');
    // la section se déploie autour du feu ; la foule hostile est toujours là, mais la zone est protégée
    const tGo = rig.run(150, 0.5, () => call.state !== 'en_attente');
    expect(tGo).toBeGreaterThan(2);
    expect(hostiles.every((h) => ctx.people.get(h.id) === h)).toBe(true);
    expect(rig.ext.assess('pompiers', bin.x, bin.z, v.x, v.z).protected).toBe(true);
    expect(call.waitingReason).toBe('');
    const tScene = rig.run(120, 0.5, () => call.state === 'sur_place');
    expect(tScene).toBeGreaterThanOrEqual(0);
    const tOut = rig.run(120, 0.5, () => bin.state !== 'burning');
    expect(tOut).toBeGreaterThanOrEqual(0);
    const tLeft = rig.run(120, 0.5, () => call.state === 'reparti');
    expect(tLeft).toBeGreaterThanOrEqual(0);
    console.log(`[pompiers] reprise ${tGo.toFixed(0)} s après la protection, sur place ${tScene.toFixed(0)} s plus tard, feu éteint en ${tOut.toFixed(0)} s | états :`,
      rig.states(call).join(' → '));
    expect(rig.states(call)).toEqual(['en_route', 'en_attente', 'en_route', 'sur_place', 'reparti']);
    // les deux incidents sont clos : le feu est traité, les secours ne sont plus bloqués
    rig.step(3);
    expect(fire.state).toBe('resolu');
    expect(blocked!.state).toBe('resolu');
  });
});
