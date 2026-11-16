// Secours — aléas : sans module de véhicules (à pied), barricade en travers, prise à partie (repli), annulation, secours pré-positionnés, file d'attente.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
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
import { startRescue, wound } from '@/sim/roles/rescue/testkit';

const BASE = [world, people, items, hazards, law, props];
const MODULES = [...BASE, vehicles, incidents, rescueModule];
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

describe('secours — sans module de véhicules', () => {
  it('les pompiers arrivent à pied, éteignent, et repartent ; le SAMU emporte la victime sur l\'épaule', async () => {
    const rig = await startRescue([...BASE, incidents, rescueModule], { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    expect(ctx.service('vehicles.autopilot')).toBeUndefined();
    const at = roadPoint(ctx, 0, -230);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    ctx.require<PropsExtApi>('props.ext').ignite(bin, 0);
    const call = rescue.request('pompiers', bin.x, bin.z, 0);
    const tRoute = rig.run(60, 0.5, () => call.state === 'en_route');
    expect(tRoute).toBeGreaterThanOrEqual(0);
    expect(call.vehicleId).toBe(0);
    const crew = crewOf(ctx, rig.ext.squadOf(call.id));
    expect(crew.length).toBe(6);
    const start = Math.hypot(crew[0].x - bin.x, crew[0].z - bin.z);
    expect(start).toBeGreaterThan(40);
    const tScene = rig.run(240, 0.5, () => call.state === 'sur_place');
    expect(tScene).toBeGreaterThan(5);
    const tOut = rig.run(90, 0.5, () => bin.state !== 'burning');
    expect(tOut).toBeGreaterThanOrEqual(0);
    const tLeft = rig.run(90, 0.5, () => call.state === 'reparti');
    expect(tLeft).toBeGreaterThanOrEqual(0);
    console.log(`[à pied] pompiers partis de ${start.toFixed(0)} m, sur place en ${tScene.toFixed(0)} s, feu éteint en ${tOut.toFixed(0)} s, repartis ${tLeft.toFixed(0)} s plus tard`);
    for (const p of crew) expect(ctx.world.isFree(p.x, p.z, 0.1)).toBe(true);
    const tGone = rig.run(400, 1, () => crew.every((p) => ctx.people.get(p.id) === undefined));
    expect(tGone).toBeGreaterThanOrEqual(0);

    // SAMU à pied : la victime est emportée, puis quitte le jeu avec l'équipe
    const victim = ctx.people.spawn({ kind: 'manifestant', x: at.x + 2, z: at.z + 3, profile: 'pacifique' });
    wound(ctx, victim, 'critical');
    const samu = rescue.request('samu', victim.x, victim.z, 0);
    const tCarried = rig.run(400, 0.5, () => victim.heldBy !== 0 && (rig.care.state(victim.id)?.treatedAt ?? -1) >= 0);
    expect(tCarried).toBeGreaterThanOrEqual(0);
    expect(ctx.people.get(victim.heldBy)!.kind).toBe('samu');
    let evacuated = false;
    ctx.events.onAny('rescue:evacuated', (e) => {
      if ((e as { personId: number }).personId === victim.id) evacuated = true;
    });
    const tEvac = rig.run(500, 1, () => ctx.people.get(victim.id) === undefined);
    console.log(`[à pied] SAMU : victime soignée et prise sur l'épaule ${tCarried.toFixed(0)} s après l'appel, hors carte ${tEvac.toFixed(0)} s plus tard`);
    expect(tEvac).toBeGreaterThanOrEqual(0);
    expect(evacuated).toBe(true);
    expect(samu.state).toBe('reparti');
    expect(rig.records.of(samu.id)!.victimsEvacuated).toBe(1);
  });
});

describe('secours — itinéraire coupé, prise à partie, annulation', () => {
  it('une barricade en travers de la rue : arrêt à distance, motif « rue barrée » ; ils passent quand elle est dégagée', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const at = roadPoint(ctx, 0, -230);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    ctx.require<PropsExtApi>('props.ext').ignite(bin, 0);
    const call = rescue.request('pompiers', bin.x, bin.z, 0);
    rig.run(60, 0.5, () => call.state === 'en_route');
    const v = ctx.vehicles.get(call.vehicleId)!;
    // l'engin arrive par le nord ou par le sud de la rue : la barricade est dressée de ce côté, à 22 m du feu
    rig.run(200, 0.25, () => Math.hypot(v.x - bin.x, v.z - bin.z) < 110);
    const side = v.z > bin.z ? 1 : -1;
    const barricades = [-3.2, 3.2].map((dx) => ctx.props.spawn('barricade', at.x + dx, bin.z + side * 22, Math.PI / 2));
    const tWait = rig.run(60, 0.5, () => call.state === 'en_attente');
    expect(tWait).toBeGreaterThanOrEqual(0);
    rig.step(3);
    console.log(`[barricade] arrêt à ${Math.hypot(v.x - bin.x, v.z - bin.z).toFixed(0)} m, motif « ${call.waitingReason} »`);
    expect(call.waitingReason).toContain('barricade');
    expect(Math.hypot(v.x - bin.x, v.z - bin.z)).toBeGreaterThan(30);
    rig.step(15);
    expect(call.state).toBe('en_attente');
    for (const b of barricades) ctx.props.remove(b.id);
    const tScene = rig.run(90, 0.5, () => call.state === 'sur_place');
    expect(tScene).toBeGreaterThanOrEqual(0);
    expect(rig.records.of(call.id)!.waited).toBeGreaterThan(10);
    expect(rig.records.of(call.id)!.waitReason).toContain('barricade');
  });

  it('pris à partie pendant l\'extinction : ils ne se défendent pas, remontent, reculent à distance et attendent une protection', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const at = roadPoint(ctx, 0, -230);
    const car = ctx.vehicles.spawn('voiture', at.x, at.z, 0);
    ctx.require<import('@/sim/vehicles/api').VehiclesExtApi>('vehicles.ext').ignite(car, 0, 1);
    const call = rescue.request('pompiers', car.x, car.z, 0);
    const tScene = rig.run(300, 0.5, () => call.state === 'sur_place');
    expect(tScene).toBeGreaterThanOrEqual(0);
    const v = ctx.vehicles.get(call.vehicleId)!;
    const crew = crewOf(ctx, rig.ext.squadOf(call.id));
    rig.step(6);
    const d0 = Math.hypot(v.x - car.x, v.z - car.z);
    // des pavés tombent sur les porte-lance
    const thrower = ctx.people.spawn({ kind: 'manifestant', x: at.x + 30, z: at.z, profile: 'radical' });
    const target = crew.find((p) => p.vehicleId === 0)!;
    for (let i = 0; i < 3; i++) {
      ctx.events.emit('projectile:impact', { id: 0, kind: 'pave', ownerId: thrower.id, x: target.x + i * 0.5, y: 0, z: target.z, hitKind: 'ground', hitId: 0 });
    }
    rig.step(1);
    expect(call.state).toBe('en_attente');
    expect(call.waitingReason).toContain('pris à partie');
    expect(ctx.radio.log.some((m) => m.channel === 'secours' && /pris à partie/.test(m.text))).toBe(true);
    const tBack = rig.run(60, 0.5, () => crew.every((p) => p.vehicleId === v.id) && Math.hypot(v.x - car.x, v.z - car.z) > d0 + 15);
    console.log(`[repli] engin à ${d0.toFixed(0)} m du feu → ${Math.hypot(v.x - car.x, v.z - car.z).toFixed(0)} m après ${tBack.toFixed(0)} s ; aucun usage de la force :`,
      ctx.law.forceLog.length, 'emploi(s) déclaré(s)');
    expect(tBack).toBeGreaterThanOrEqual(0);
    expect(ctx.law.forceLog.length).toBe(0);
    expect(rig.records.of(call.id)!.retreats).toBe(1);
    expect(ctx.world.buildingHeightAt(v.x, v.z)).toBe(0);
    // le calme revenu, ils reprennent l'intervention
    const tAgain = rig.run(120, 0.5, () => call.state === 'sur_place');
    expect(tAgain).toBeGreaterThanOrEqual(0);
    expect(rig.states(call).slice(0, 5)).toEqual(['en_route', 'sur_place', 'en_attente', 'en_route', 'sur_place']);
  });

  it('annulation en route : l\'engin fait demi-tour et quitte la carte ; l\'incident clos annule de lui-même l\'appel', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const at = roadPoint(ctx, 0, -230);
    const bin = ctx.props.spawn('poubelle', at.x, at.z, 0);
    ctx.require<PropsExtApi>('props.ext').ignite(bin, 0);
    rig.step(2);
    const fire = api.list[0];
    expect(api.assign(fire.id, 'pompiers')).toBe(true);
    const call = rescue.calls[0];
    rig.run(60, 0.5, () => call.state === 'en_route');
    rig.step(5);
    // le feu est éteint par d'autres avant leur arrivée : l'incident se clôt, l'appel n'a plus d'objet
    for (let i = 0; i < 100 && bin.state === 'burning'; i++) {
      ctx.hazards.douse(bin.x, bin.z, 1.5, 0.3);
      rig.step(0.1);
    }
    rig.step(5);
    expect(fire.state).toBe('resolu');
    expect(call.state).toBe('annule');
    const vid = call.vehicleId;
    const tGone = rig.run(300, 1, () => ctx.vehicles.get(vid) === undefined);
    expect(tGone).toBeGreaterThanOrEqual(0);
    expect(rig.records.of(call.id)!.cancelled).toBe(true);
    // un appel clos quitte la liste publiée au bout d'un moment
    rig.step(35);
    expect(rescue.calls.length).toBe(0);
    expect(rig.records.all.length).toBe(1);
  });
});

describe('secours — moyens engagés', () => {
  it('secours pré-positionnés : ils partent de leur stationnement, plus vite, et y reviennent ; un seul engin : le second appel attend', async () => {
    const rig = await startRescue(MODULES, {
      mode: 'test', x: 0, z: -230, extra: { ...EXTRA, 'rescue.delayScale': 1, moyens: { pompiers: 1, samu: 0, secours_sur_appel: false } },
    });
    const { ctx, rescue } = rig;
    expect(rig.ext.crews.length).toBe(1);
    const staged = rig.ext.crews[0];
    expect(staged.state).toBe('veille');
    expect(staged.kind).toBe('pompiers');
    const v = ctx.vehicles.get(staged.vehicleId)!;
    const home = { x: v.x, z: v.z };
    const dHome = Math.hypot(home.x - 0, home.z + 230);
    expect(dHome).toBeGreaterThan(60);
    expect(dHome).toBeLessThan(260);
    const at = roadPoint(ctx, 0, -230);
    const a = ctx.props.spawn('poubelle', at.x, at.z, 0);
    const far = roadPoint(ctx, 170, -230);
    const b = ctx.props.spawn('poubelle', far.x, far.z, 0);
    const propsExt = ctx.require<PropsExtApi>('props.ext');
    propsExt.ignite(a, 0);
    propsExt.ignite(b, 0);
    const first = rescue.request('pompiers', a.x, a.z, 0);
    expect(first.eta).toBeLessThan(60); // délai de départ court, trajet court
    const second = rescue.request('pompiers', b.x, b.z, 0);
    expect(second).not.toBe(first);
    const tRoute = rig.run(30, 0.5, () => first.state === 'en_route');
    expect(tRoute).toBeLessThanOrEqual(10.5);
    expect(first.vehicleId).toBe(v.id);
    rig.step(20);
    // un seul engin engagé sur la mission : le second appel attend qu'il se libère
    expect(second.state).toBe('demande');
    expect(second.waitingReason).toContain('tous les moyens sont engagés');
    const tDone = rig.run(300, 1, () => first.state === 'reparti');
    expect(tDone).toBeGreaterThanOrEqual(0);
    const tSecond = rig.run(400, 1, () => second.state === 'sur_place');
    console.log(`[moyens] stationnement à ${dHome.toFixed(0)} m ; premier appel : départ ${tRoute.toFixed(0)} s, terminé ${(tRoute + 20 + tDone).toFixed(0)} s ; second appel servi ${tSecond.toFixed(0)} s plus tard`);
    expect(tSecond).toBeGreaterThanOrEqual(0);
    expect(second.vehicleId).toBe(v.id);
    const tBack = rig.run(400, 1, () => second.state === 'reparti' && rig.ext.crews[0].state === 'veille');
    expect(tBack).toBeGreaterThanOrEqual(0);
    expect(ctx.vehicles.get(v.id)).toBe(v); // l'engin pré-positionné ne quitte pas la carte
    expect(Math.hypot(v.x - home.x, v.z - home.z)).toBeLessThan(30);
  });
});
