// Équipage de patrouille jouable (rôle 'patrouille') : le joueur part à bord de sa voiture garée au bord de la chaussée,
// dans le sens de la circulation, ses deux collègues avec lui — BAC en civil dans la voiture banalisée, Police secours
// en tenue dans la voiture sérigraphiée. Vrai plan de Paris, vraie mise en place de session.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, RoadSample, SessionConfig, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as input } from '@/input';
import type { InputScriptApi } from '@/input';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { RADIO_CALLSIGNS_SERVICE } from '@/gameplay/radio/api';
import type { CallsignBook } from '@/gameplay/radio/api';
import { createSystems as session, EQUIPAGE_SERVICE, JOURNEE_SERVICE, distanceToRoute, manifestationBrief } from '@/gameplay/session';
import type { EquipageApi, JourneeApi } from '@/gameplay/session';
import { createSystems as patrols, BAC_SITES } from '@/gameplay/patrols';
import { sanitizePatrolSetup, vacationSessionConfig } from '@/gameplay/patrols/model';
import type { PatrolSetup } from '@/gameplay/patrols/model';

const SIM = [input, world, roles, people, vehicles, crowd, police, items, props, hazards, law, radio, session, patrols];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 1, samu: 1, secours_sur_appel: true };

async function vacation(setup: Partial<PatrolSetup>, seed = 3) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  const cfg = vacationSessionConfig(sanitizePatrolSetup({ seed, ...setup }));
  await t.start(cfg);
  t.step(0.5);
  return { t, ctx: t.ctx, cfg };
}

function crewOf(ctx: GameContext): { me: Person; car: Vehicle; mates: Person[] } {
  const me = ctx.player.person()!;
  const car = ctx.vehicles.get(me.vehicleId)!;
  const mates = ctx.people.list.filter((p) => p !== me && p.vehicleId === car.id);
  return { me, car, mates };
}

/** La voiture est contre le trottoir de droite de sa voie (ou dans l'axe d'un sens unique), dans le sens de la circulation. */
function rightSide(ctx: GameContext, car: Vehicle): { lateral: number; oneway: boolean; aligned: number } {
  const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  expect(ctx.world.nearestRoad(car.x, car.z, road, 15)).toBe(true);
  // droite = (−cos h, sin h)
  const lateral = (car.x - road.x) * -Math.cos(car.heading) + (car.z - road.z) * Math.sin(car.heading);
  const aligned = Math.cos(car.heading - road.heading);
  return { lateral, oneway: road.oneway, aligned };
}

describe('équipage de patrouille du joueur', () => {
  it('vacation BAC 75N, au volant : en civil dans la voiture banalisée, garée au bord de la chaussée près de la gare Saint-Lazare', async () => {
    const { t, ctx, cfg } = await vacation({ crew: 'bac', seat: 'conducteur', departId: 'bac-75n', rank: 'gardien' });
    const { me, car, mates } = crewOf(ctx);
    const site = BAC_SITES.find((s) => s.callsign === 'BAC 75N')!;
    const d = Math.hypot(car.x - site.x, car.z - site.z);
    const side = rightSide(ctx, car);
    console.log(`BAC 75N : voiture à ${d.toFixed(0)} m du site, décalage à droite ${side.lateral.toFixed(2)} m, sens unique ${side.oneway}`);
    expect(me.kind).toBe('policier_civil');
    expect(me.faction).toBe('police');
    expect(car.kind).toBe('voiture_bac');
    expect(car.faction).toBe('police');
    expect(d).toBeLessThan(120);
    expect(car.def.seats[me.seat]!.role).toBe('driver');
    expect(mates.length).toBe(2);
    for (const p of mates) {
      expect(p.kind).toBe('policier_civil');
      expect(p.squadId).toBe(me.squadId);
    }
    // contre le trottoir de droite, dans le sens de la voie quand elle est à sens unique
    expect(side.lateral).toBeGreaterThanOrEqual(-0.05);
    if (side.oneway) expect(side.aligned).toBeGreaterThan(0.9);
    else expect(Math.abs(side.aligned)).toBeGreaterThan(0.9);
    // unité « BAC 75N » commandée par le joueur, sans ordre « suivre » ; aucune compagnie, aucune journée de service
    const squad = ctx.squads.get(me.squadId)!;
    expect(squad.kind).toBe('equipage');
    expect(squad.name).toBe('BAC 75N');
    expect(squad.leaderId).toBe(me.id);
    expect(squad.vehicleId).toBe(car.id);
    expect(squad.order.type).not.toBe('suivre');
    expect(ctx.squads.list.some((s) => s.kind === 'compagnie' || s.kind === 'section')).toBe(false);
    expect(ctx.vehicles.list.some((v) => v.kind === 'fourgon_crs')).toBe(false);
    expect(ctx.service<JourneeApi>(JOURNEE_SERVICE)?.stage ?? 'inactif').toBe('inactif');
    // service de l'équipage, indicatif radio, prise de service, caméra du véhicule
    expect(ctx.require<EquipageApi>(EQUIPAGE_SERVICE).current).toEqual({ squadId: squad.id, vehicleId: car.id, callsign: 'BAC 75N' });
    expect(ctx.require<CallsignBook>(RADIO_CALLSIGNS_SERVICE).callsign(me)).toBe('BAC 75N');
    expect(ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text === 'BAC 75N, prise de service, secteur gare Saint-Lazare.')).toBe(true);
    expect(ctx.player.state.cameraMode).toBe('vehicle_ext');
    expect(cfg.extra!['journee']).toBe(false);
    // le joueur prend la route : la voiture roule, l'équipage reste à bord
    const script = ctx.require<InputScriptApi>('input.script');
    script.setMove(0, 1);
    for (let i = 0; i < 6; i++) t.step(0.5);
    script.setMove(0, 0);
    console.log(`après 3 s d'accélération : ${car.speed.toFixed(1)} m/s`);
    expect(Math.abs(car.speed)).toBeGreaterThan(1);
    expect(ctx.people.list.filter((p) => p.vehicleId === car.id).length).toBe(3);
  }, 300000);

  it('chef de bord : le joueur est passager avant, un collègue de l’IA tient le volant', async () => {
    const { ctx } = await vacation({ crew: 'bac', seat: 'chef_bord', departId: 'bac-75e', rank: 'brigadier_chef' });
    const { me, car, mates } = crewOf(ctx);
    expect(car.kind).toBe('voiture_bac');
    expect(car.def.seats[me.seat]!.role).toBe('passenger');
    expect(me.seat).toBe(1);
    expect(me.rank).toBe('brigadier_chef');
    const driver = ctx.people.get(car.seats[0]!)!;
    expect(driver).toBeDefined();
    expect(driver.isPlayer).toBe(false);
    expect(driver.poste).toBe('conducteur');
    expect(mates.length).toBe(2);
    expect(ctx.squads.get(me.squadId)!.leaderId).toBe(me.id);
    expect(ctx.squads.get(me.squadId)!.name).toBe('BAC 75E');
  }, 300000);

  it('Police secours : en tenue, dans la voiture sérigraphiée, indicatif du commissariat', async () => {
    const { ctx, cfg } = await vacation({ crew: 'police_secours', seat: 'conducteur', departId: 'tv-75-09' });
    const { me, car, mates } = crewOf(ctx);
    const depart = (cfg.extra!['vacation'] as { depart: { x: number; z: number; callsign: string } }).depart;
    expect(car.kind).toBe('voiture_police');
    expect(me.kind).not.toBe('policier_civil');
    expect(mates.length).toBe(2);
    expect(Math.hypot(car.x - depart.x, car.z - depart.z)).toBeLessThan(120);
    expect(ctx.squads.get(me.squadId)!.name).toBe(depart.callsign);
    expect(ctx.require<CallsignBook>(RADIO_CALLSIGNS_SERVICE).callsign(me)).toBe(depart.callsign.toUpperCase());
  }, 300000);

  it('la voiture banalisée est une voiture de police à deux-tons', async () => {
    const t = createTestContext({ seed: 1, strict: false, modules: [world, vehicles] });
    await t.ready;
    const def = t.ctx.vehicles.def('voiture_bac')!;
    expect(def).toBeDefined();
    expect(def.faction).toBe('police');
    expect(def.hasSiren).toBe(true);
    expect(def.hasBeacons).toBe(true);
  });

  it('Mode libre, rôle patrouille, 300 manifestants : la compagnie est engagée, l’équipage se gare hors du couloir de la foule, sans journée de service', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'patrouille', rank: 'gardien', place: 'Place de la République', x: BAC_SITES[1]!.x, z: BAC_SITES[1]!.z,
      crowdSize: 300, tension: 0.3, volatility: 0.4, duration: 'standard',
      extra: { moyens: MEANS, poste: 'conducteur', variante: 'bac', journee: true },
    } as Partial<SessionConfig>);
    t.step(1);
    const { ctx } = t;
    const { me, car, mates } = crewOf(ctx);
    const route = ctx.director.route;
    const protestersNear = ctx.people.countIn(car.x, car.z, 20, (p) => p.faction === 'protest');
    const company = ctx.squads.list.filter((s) => s.kind === 'compagnie');
    console.log(`Mode libre : ${company.length} compagnie(s), voiture à ${distanceToRoute(route, car.x, car.z).toFixed(0)} m du parcours, ${protestersNear} manifestant(s) à moins de 20 m`);
    expect(car.kind).toBe('voiture_bac');
    expect(mates.length).toBe(2);
    expect(company.length).toBeGreaterThanOrEqual(1);
    expect(ctx.squads.get(me.squadId)!.parentId).toBe(0);
    expect(company.some((c) => c.leaderId === me.id)).toBe(false);
    expect(distanceToRoute(route, car.x, car.z)).toBeGreaterThan(30);
    expect(protestersNear).toBe(0);
    // aucune journée de service pour une voiture seule, même si la clé le demande
    expect(ctx.service<JourneeApi>(JOURNEE_SERVICE)?.stage ?? 'inactif').toBe('inactif');
    // la compagnie ne suit pas la voiture de l'équipage quand elle démarre
    const script = ctx.require<InputScriptApi>('input.script');
    script.setMove(0, 1);
    t.step(4);
    script.setMove(0, 0);
    const following = ctx.squads.list.filter((s) => s.kind !== 'equipage' && s.faction === 'police' && (s.order.type === 'embarquer' || s.order.type === 'colonne'));
    expect(following.length).toBe(0);
  }, 300000);

  it('briefing de prise de service : nom de la manifestation et organisateurs', () => {
    expect(manifestationBrief(undefined)).toBe('Manifestation déclarée');
    expect(manifestationBrief({ causeLabel: 'Retraites' })).toBe('Manifestation déclarée (retraites)');
    expect(manifestationBrief({ 'manif.nom': '  Marche   pour le climat ', causeLabel: 'Climat', 'manif.organisateurs': 'collectif' }))
      .toBe('Manifestation déclarée « Marche pour le climat » (climat), à l’appel d’un collectif');
    expect(manifestationBrief({ 'manif.nom': 'Retraites : on lâche rien', 'manif.organisateurs': 'intersyndicale' }))
      .toBe('Manifestation déclarée « Retraites : on lâche rien », à l’appel de l’intersyndicale');
    expect(manifestationBrief({ 'manif.organisateurs': 'aucun' })).toBe('Manifestation non déclarée, sans organisateur ni service d’ordre');
    expect(manifestationBrief({ 'manif.nom': 'x'.repeat(90) }).length).toBeLessThan(90);
  });
});
