// Commissariats branchés dans la partie (vraie carte de Paris) : les véhicules garés en réserve d'un commissariat ne
// dérangent aucun autre système.
//   (a) journée de service d'un CRS, patrouilles et commissariats en plus : mêmes attentes que la journée seule, et la
//       compagnie ne prend aucun véhicule de la réserve de la Cité ;
//   (b) journée d'un commandant avec BRAV-M : FAUCON 9, engagée depuis le 9e et envoyée vers la République, n'est
//       entraînée ni à l'aller ni au retour de la journée, la BRAV-M de la session suit la journée comme avant ;
//   (c) près de la Cité, « Me suivre en colonne » ne prend jamais un véhicule de la réserve ;
//   (d) 120 s avec une compagnie près de la Cité : aucun groupe n'escorte un canon à eau garé en réserve ;
//   (e) les places d'un commissariat, sur le parcours d'une manifestation, ne comptent pas comme un barrage ;
//   (f) une voiture civile rangée devant les places du 9e repart une fois la colonne passée.
import { describe, expect, it } from 'vitest';

import type { GameContext, RoadSample, SessionConfig, SquadOrder, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { JOURNEE_SERVICE, SERVICE_BASE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { entryNumber } from '@/ui/command/commissariatsModel';
import { RoadBlocks } from '@/sim/crowd/detour';
import { TRAFFIC_SERVICE } from '@/sim/traffic/api';
import type { TrafficApi } from '@/sim/traffic/api';
import { commissariatById, isHeldVehicle } from '@/world/commissariats';

const BASE = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const SIM = [...BASE, patrols, commissariats];
const REPUBLIQUE = { x: 3123, z: -208, heading: 0, width: 20 };

/** Véhicules garés en réserve (tenus par un commissariat). */
function heldVehicles(ctx: GameContext): Vehicle[] {
  return ctx.vehicles.list.filter((v) => isHeldVehicle(ctx, v.id));
}

/** Commandant, partie libre, sans foule, au lieu donné. */
async function startCommandant(place: string, x: number, z: number, extra: Record<string, unknown> = {}, seed = 9, variante = 'terrain', withUi = false) {
  const t = createTestContext({ seed, strict: false, modules: withUi ? [...SIM, command] : SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place, x, z, crowdSize: 0, tension: 0.1, volatility: 0.1,
    duration: 'standard',
    extra: { moyens: { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true }, variante, foyers: 0, ...extra },
  } as Partial<SessionConfig>);
  t.step(1);
  return { t, ctx: t.ctx, api: t.ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE) };
}

/** Vecteurs avant / côté d'un cap (repère du jeu). */
function axes(h: number): { fx: number; fz: number } {
  return { fx: Math.sin(h), fz: Math.cos(h) };
}

describe('commissariats intégrés à la partie', () => {
  it('(e) détour des manifestations : les places d’un commissariat ne barrent pas la rue (une unité engagée arrêtée, si)', async () => {
    // (la compagnie loin des commissariats : ses agents arrêtés compteraient aussi comme un barrage)
    const { t, ctx, api } = await startCommandant('Place de la Concorde', -10, 15);
    const held = heldVehicles(ctx);
    expect(held.length).toBeGreaterThan(20);
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;
    const blocks = new RoadBlocks();
    const barred = blocks.refresh(ctx, ctx.clock.now);
    // véhicules garés à moins de 5 m de l'axe d'une rue : sans la règle, chacun barrerait sa rue
    const onAxis = held.filter((v) => ctx.world.nearestRoad(v.x, v.z, road, 5) && road.edgeId >= 0);
    const edges = new Set<number>();
    for (const v of onAxis) {
      ctx.world.nearestRoad(v.x, v.z, road, 5);
      edges.add(road.edgeId);
    }
    console.log(`${held.length} véhicules en réserve ; ${onAxis.length} à moins de 5 m de l'axe d'une rue (${edges.size} rues) ; rues barrées : ${[...barred].filter((e) => edges.has(e)).length}`);
    expect(onAxis.length).toBeGreaterThan(0);
    for (const e of edges) expect(barred.has(e)).toBe(false);

    // contre-épreuve : l'unité engagée (équipage à bord, arrêtée sur ses places) compte de nouveau comme un barrage
    const probe = onAxis.find((v) => api.list.some((c) => c.entries.some((e) => e.engageable && e.vehicleIds.length === 1 && e.vehicleIds[0] === v.id)))!;
    expect(probe).toBeDefined();
    const entry = api.list.flatMap((c) => c.entries).find((e) => e.vehicleIds[0] === probe.id)!;
    const r = api.engage(entry.id, ctx.player.state.personId);
    expect(r.ok).toBe(true);
    t.step(1);
    const car = ctx.vehicles.list.find((v) => ctx.squads.get(r.squadId)?.vehicleId === v.id)!;
    expect(isHeldVehicle(ctx, car.id)).toBe(false);
    ctx.world.nearestRoad(car.x, car.z, road, 5);
    blocks.invalidate();
    const after = blocks.refresh(ctx, ctx.clock.now);
    console.log(`contre-épreuve : ${entry.callsign} engagée, rue ${road.edgeId} barrée ${after.has(road.edgeId)}`);
    expect(after.has(road.edgeId)).toBe(true);
  }, 600000);

  it('(f) une voiture rangée devant les places du 9e repart moins de 30 s après le passage de la colonne', async () => {
    // (partie lancée ailleurs : la compagnie ne se gare pas sur les places du 9e ; le joueur vient sur le boulevard)
    const { t, ctx } = await startCommandant('Place de la Concorde', -10, 15);
    const trafficApi = ctx.require<TrafficApi>(TRAFFIC_SERVICE);
    trafficApi.clearAmbient();
    // tête de la file de motos de FAUCON 9 (nez vers la sortie, à l'ouest, boulevard Haussmann)
    const def = commissariatById('9e')!;
    const tpl = def.stock.find((s) => s.id === '9e:faucon9')!;
    const head = def.slots[tpl.slots[0]!]!;
    const other = def.slots[def.stock.find((s) => s.id === '9e:tv19')!.slots[0]!]!;
    const { fx, fz } = axes(head.heading);
    // côté de la chaussée : de la file des motos vers celle de l'autre trottoir
    let sx = other.x - head.x;
    let sz = other.z - head.z;
    const along0 = sx * fx + sz * fz;
    sx -= fx * along0;
    sz -= fz * along0;
    const sl = Math.hypot(sx, sz);
    sx /= sl;
    sz /= sl;
    // la voiture civile roule le long des places, juste devant la tête de file, et va plus loin sur le boulevard
    const cx = head.x + fx * 9 + sx * 2.2;
    const cz = head.z + fz * 9 + sz * 2.2;
    const me = ctx.player.person()!;
    me.x = head.x + sx * 14 - fx * 30;
    me.z = head.z + sz * 14 - fz * 30;
    t.step(1);
    expect(isHeldVehicle(ctx, ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE).entry('9e:faucon9')!.vehicleIds[0]!)).toBe(true);
    const civil = trafficApi.spawnVehicle('voiture', cx, cz, head.heading, cx + fx * 320, cz + fz * 320)!;
    expect(civil).not.toBeNull();
    // la colonne arrive derrière elle, deux-tons : elle se range
    const cop = ctx.vehicles.spawn('voiture_police', cx - fx * 14, cz - fz * 14, head.heading);
    cop.siren = 2;
    cop.beacons = true;
    expect(trafficApi.clearOff(civil, cop.id)).toBe('ok');
    for (let i = 0; i < 30 && !(trafficApi.motorist(civil)?.mode === 'range' && Math.abs(civil.speed) < 0.2); i++) t.step(0.5);
    t.step(10);
    expect(trafficApi.motorist(civil)?.mode).toBe('range');
    // des véhicules de la réserve sont juste derrière elle, dans son couloir : la règle « police arrêtée juste derrière »
    // la retiendrait pour toujours sans le garde
    // (repère de la règle : l'axe de la rue, orienté dans le sens de marche de la voiture)
    const axis = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;
    expect(ctx.world.nearestRoad(civil.x, civil.z, axis, 14)).toBe(true);
    const h = axes(axis.heading);
    if (h.fx * Math.sin(civil.heading) + h.fz * Math.cos(civil.heading) < 0) { h.fx = -h.fx; h.fz = -h.fz; }
    const halfL = civil.def.length * 0.5;
    const behind = heldVehicles(ctx).filter((o) => {
      const rx = o.x - civil.x;
      const rz = o.z - civil.z;
      const along = rx * h.fx + rz * h.fz;
      const lat = -rx * h.fz + rz * h.fx;
      return along < 0 && along > -(halfL + 20) && lat < 1 && lat > -6;
    });
    console.log(`voiture rangée en (${civil.x.toFixed(1)}, ${civil.z.toFixed(1)}) ; ${behind.length} véhicule(s) de la réserve juste derrière`);
    expect(behind.length).toBeGreaterThan(0);
    // la colonne passe : elle est loin devant, deux-tons coupés
    cop.x = civil.x + h.fx * 120;
    cop.z = civil.z + h.fz * 120;
    cop.siren = 0;
    cop.beacons = false;
    let resumed = -1;
    for (let i = 0; i < 60 && resumed < 0; i++) {
      t.step(0.5);
      if (trafficApi.motorist(civil)?.mode !== 'range') resumed = (i + 1) * 0.5;
    }
    console.log(`voiture repartie ${resumed} s après le passage de la colonne (état ${trafficApi.motorist(civil)?.mode})`);
    expect(resumed).toBeGreaterThan(0);
    expect(resumed).toBeLessThanOrEqual(30);
  }, 600000);

  it('(d) 120 s près de la Cité : aucun groupe n’escorte un engin garé en réserve', async () => {
    const { t, ctx } = await startCommandant('Préfecture de police', 1790, 1190);
    const held = new Set(heldVehicles(ctx).map((v) => v.id));
    const engins = heldVehicles(ctx).filter((v) => v.kind === 'canon_eau' || v.kind === 'centaure');
    expect(engins.length).toBeGreaterThan(0);
    // des groupes libres sont à portée d'escorte (400 m)
    const groups = ctx.squads.list.filter((s) => s.kind === 'groupe' && s.faction === 'police');
    const near = groups.filter((g) => {
      const l = ctx.people.get(g.leaderId);
      return l && engins.some((v) => Math.hypot(l.x - v.x, l.z - v.z) < 400);
    });
    expect(near.length).toBeGreaterThan(0);
    const targeted: SquadOrder[] = [];
    ctx.events.on('order:issued', ({ order }) => {
      if (order.targetId && held.has(order.targetId)) targeted.push(order);
    });
    t.step(120);
    const now = ctx.squads.list.filter((s) => s.order.targetId && held.has(s.order.targetId));
    console.log(`${engins.length} engins en réserve, ${near.length} groupes à portée ; ordres visant un véhicule en réserve : ${targeted.length} (en cours : ${now.length})`);
    expect(targeted.length).toBe(0);
    expect(now.length).toBe(0);
    for (const v of engins) expect(isHeldVehicle(ctx, v.id)).toBe(true);
  }, 600000);

  it('(c) près de la Cité, la colonne du joueur au volant (« Me suivre en colonne ») ne prend aucun véhicule de la réserve', async () => {
    // partie lancée au Châtelet (la compagnie n'occupe pas les places de la Cité) ; le commandant prend le volant d'un
    // fourgon de sa compagnie, sur le boulevard du Palais, juste devant les fourgons de la section AQUILON 1 garés en
    // réserve (même modèle) ; son équipe le suit à pied et doit trouver des places à proximité
    const { t, ctx, api } = await startCommandant('Châtelet', 1903, 916);
    const me = ctx.player.person()!;
    const aquilon = api.entry('cite:aquilon1')!;
    const heldVans = aquilon.vehicleIds.map((id) => ctx.vehicles.get(id)!);
    expect(heldVans.length).toBeGreaterThan(0);
    for (const v of heldVans) expect(isHeldVehicle(ctx, v.id)).toBe(true);
    const own = ctx.squads.get(me.squadId)!;
    expect(own).toBeDefined();
    const crew = own.members.map((id) => ctx.people.get(id)!).filter((p) => !p.isPlayer);
    expect(crew.length).toBeGreaterThan(0);
    const van = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs' && !isHeldVehicle(ctx, v.id))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    expect(van).toBeDefined();
    for (const id of van.seats) if (id !== 0) ctx.vehicles.exit(ctx.people.get(id)!);
    // le fourgon est amené sur la chaussée, 25 m devant la tête de file d'AQUILON 1
    const head = heldVans[0]!;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;
    const { fx, fz } = axes(head.heading);
    expect(ctx.world.nearestRoad(head.x + fx * 25, head.z + fz * 25, road, 20)).toBe(true);
    van.x = road.x;
    van.z = road.z;
    van.heading = head.heading;
    van.speed = 0;
    // ses places passagers sont déjà prises (renforts montés avec lui) : son équipe doit trouver d'autres places
    for (let seat = 1; seat < van.seats.length; seat++) {
      const rider = ctx.people.spawn({ kind: 'crs', x: van.x + 3, z: van.z });
      expect(ctx.vehicles.enter(rider, van, 'passenger')).toBe(true);
    }
    for (const p of crew) {
      if (p.vehicleId !== 0) ctx.vehicles.exit(p);
      p.x = van.x + 4;
      p.z = van.z + 2;
    }
    ctx.squads.issue(own.id, { type: 'suivre', targetId: me.id, x: me.x, z: me.z, heading: 0, width: 0, issuedBy: me.id });
    t.step(1);
    const held = heldVehicles(ctx);
    me.x = van.x + 3;
    me.z = van.z;
    expect(ctx.vehicles.enter(me, van, 'driver')).toBe(true);
    let taken = 0;
    for (let i = 0; i < 20; i++) {
      t.step(1);
      for (const v of held) if (v.seats.some((id) => id !== 0)) taken++;
    }
    const gap = Math.min(...heldVans.map((v) => Math.hypot(v.x - van.x, v.z - van.z)));
    console.log(`fourgon du joueur à ${gap.toFixed(0)} m des fourgons d'AQUILON 1 en réserve ; équipe : ${crew.length}, à bord ${crew.filter((p) => p.vehicleId !== 0).length} ; places prises dans la réserve : ${taken}`);
    expect(gap).toBeLessThan(90);
    expect(taken).toBe(0);
    for (const v of held) expect(isHeldVehicle(ctx, v.id)).toBe(true);
  }, 600000);

  it('(a) journée de service d’un CRS, patrouilles et commissariats en plus : mêmes attentes, la réserve de la Cité intacte', async () => {
    const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, journee: true } } as never);
    const { ctx } = t;
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const me = ctx.player.person()!;
    const reserve = heldVehicles(ctx);
    const cite = reserve.filter((v) => Math.hypot(v.x - SERVICE_BASE.x, v.z - SERVICE_BASE.z) < 250);
    console.log(`réserve : ${reserve.length} véhicules, dont ${cite.length} à la Cité ; la compagnie de la journée n'est pas une unité de commissariat`);
    expect(cite.length).toBeGreaterThan(0);
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    expect(api.isStationUnit(company.id)).toBe(false);
    const dBase = Math.hypot(me.x - SERVICE_BASE.x, me.z - SERVICE_BASE.z);
    expect(dBase).toBeLessThan(250);
    t.step(5);
    expect(j.stage).toBe('embarquement');
    t.step(60);
    expect(j.stage).toBe('embarquement');
    expect(ctx.radio.log.some((m) => /n'attend plus que vous/.test(m.text))).toBe(true);
    // il monte dans le véhicule de la compagnie le plus proche où il reste une place (jamais un véhicule de la réserve)
    const seatable = (): Vehicle[] => ctx.vehicles.list.filter((v) => (v.kind === 'fourgon_crs' || v.kind === 'vl_commandement') && v.seats[0] !== 0 && v.seats.some((id, i) => id === 0 && i > 0))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const van = seatable()[0]!;
    expect(van).toBeDefined();
    expect(isHeldVehicle(ctx, van.id)).toBe(false);
    me.x = van.x + 3; me.z = van.z;
    expect(ctx.vehicles.enter(me, van, 'passenger')).toBe(true);
    for (let i = 0; i < 60 && j.stage === 'embarquement'; i++) t.step(5);
    const routeAt = ctx.clock.now;
    const afoot = ctx.people.list.filter((p) => p.faction === 'police' && !p.isPlayer && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down'
      && Math.hypot(p.x - SERVICE_BASE.x, p.z - SERVICE_BASE.z) < 250);
    console.log(`colonne partie (${j.stage}) ; agents restés à pied à la caserne : ${afoot.length} ; réserve de la Cité encore garée : ${cite.filter((v) => isHeldVehicle(ctx, v.id)).length}/${cite.length}`);
    expect(afoot.map((p) => p.poste)).toEqual([]);
    expect(j.stage).toBe('route');
    expect(van.seats[0]).not.toBe(me.id);
    // personne de la compagnie n'est monté dans un véhicule de la réserve : elle reste garée, vide
    for (const v of cite) {
      expect(isHeldVehicle(ctx, v.id)).toBe(true);
      expect(v.seats.every((id) => id === 0)).toBe(true);
    }
    for (let i = 0; i < 120 && j.stage === 'route'; i++) t.step(5);
    const dest = j.destination!;
    console.log(`arrivée après ${(ctx.clock.now - routeAt).toFixed(0)} s : étape ${j.stage} ; joueur à ${Math.hypot(me.x - dest.x, me.z - dest.z).toFixed(0)} m`);
    expect(j.stage).toBe('sur_place');
    expect(me.vehicleId).toBe(0);
    expect(Math.hypot(me.x - dest.x, me.z - dest.z)).toBeLessThan(120);

    t.step(30);
    const cmd = ctx.service<{ endMission(id: number): void; convoyOf(id: number): { stage: string } | null }>('police.command')!;
    cmd.endMission(company.id);
    for (let i = 0; i < 140 && j.stage === 'sur_place'; i++) t.step(5);
    expect(j.stage).toBe('rembarquement');
    t.step(40);
    expect(cmd.convoyOf(company.id)?.stage).toBe('rembarquement');
    const back = seatable()[0]!;
    expect(isHeldVehicle(ctx, back.id)).toBe(false);
    me.x = back.x + 3; me.z = back.z;
    expect(ctx.vehicles.enter(me, back, 'passenger')).toBe(true);
    for (let i = 0; i < 260 && (j.stage === 'retour' || j.stage === 'rembarquement'); i++) t.step(5);
    console.log(`retour : étape ${j.stage} ; joueur à ${Math.hypot(me.x - SERVICE_BASE.x, me.z - SERVICE_BASE.z).toFixed(0)} m de la caserne`);
    expect(j.stage).toBe('intervention_route');
    expect(ctx.radio.log.some((m) => /Changement de mission/.test(m.text))).toBe(true);
    for (let i = 0; i < 200 && j.stage === 'intervention_route'; i++) t.step(5);
    expect(j.stage).toBe('intervention');
    expect(company.order.type).toBe('proteger');
    for (let i = 0; i < 120 && j.stage === 'intervention'; i++) t.step(5);
    expect(j.stage).toBe('rembarquement');
    t.step(20);
    if (me.vehicleId === 0) {
      const v2 = seatable()[0]!;
      me.x = v2.x + 3; me.z = v2.z;
      ctx.vehicles.enter(me, v2, 'passenger');
    }
    for (let i = 0; i < 250 && j.stage !== 'fin'; i++) t.step(5);
    console.log(`fin de journée : étape ${j.stage} ; réserve encore garée : ${heldVehicles(ctx).length}/${reserve.length}`);
    expect(j.stage).toBe('fin');
    for (let i = 0; i < 12 && !ctx.radio.log.some((m) => /fin de service/.test(m.text)); i++) t.step(2);
    expect(ctx.radio.log.some((m) => /fin de service/.test(m.text))).toBe(true);
    // aucune unité de commissariat n'a été créée (personne ne les a engagées)
    expect(ctx.squads.list.some((s) => api.isStationUnit(s.id))).toBe(false);
  }, 3000000);

  it('(b) journée d’un commandant avec BRAV-M : FAUCON 9 envoyée vers la République n’est entraînée ni à l’aller ni au retour', async () => {
    const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 5, strict: false, modules: [...SIM, command] });
    // rassemblement à l'Hôtel de Ville : la colonne de la compagnie part de la Cité, toute proche
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Hôtel de Ville', x: 2211, z: 993, crowdSize: 60, tension: 0.1, volatility: 0.1, duration: 'standard',
      extra: { moyens: MEANS, journee: true, variante: 'salle', foyers: 0 } } as never);
    const { ctx } = t;
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const core = ctx.require<CommandCore>('ui.command');
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    t.step(1);
    expect(j.stage === 'prise_de_service' || j.stage === 'embarquement').toBe(true);
    // (la BRAV-M de la journée est rattachée à la compagnie du commandant : unité de tête, ou fille de la compagnie)
    const sessionBravm = ctx.squads.list.find((s) => (s.parentId === 0 || ctx.squads.get(s.parentId)?.kind === 'compagnie') && s.faction === 'police' && s.kind !== 'compagnie' && !api.isStationUnit(s.id)
      && ctx.squads.list.some((q) => (q.id === s.id || q.parentId === s.id) && q.vehicleId !== 0 && ctx.vehicles.get(q.vehicleId)?.kind === 'moto_bravm'))!;
    expect(sessionBravm).toBeDefined();
    // FAUCON 9 engagée depuis le 9e et envoyée « en véhicules » vers la République (elle part en colonne)
    const r = core.engageFromCommissariat(entryNumber('9e:faucon9'));
    expect(r.ok).toBe(true);
    const faucon = ctx.squads.get(r.squadId)!;
    expect(faucon.name).toBe('FAUCON 9');
    // la carte la connaît dans le même pas (l'ordre de la fiche part aussitôt aux unités sélectionnées sur la carte)
    expect(core.maps.scene.unitModel.get(faucon.id)).toBeDefined();
    expect(core.issue('faire_mouvement', [faucon], [REPUBLIQUE]).ok).toBe(true);
    const tree = (rootId: number): Set<number> => {
      const out = new Set<number>([rootId]);
      for (let k = 0; k < 3; k++) for (const q of ctx.squads.list) if (out.has(q.parentId)) out.add(q.id);
      return out;
    };
    const station = tree(faucon.id);
    const ownTree = tree(sessionBravm.id);
    const toStation: { t: number; type: string; x: number; z: number }[] = [];
    const toSession: { t: number; type: string; x: number; z: number }[] = [];
    ctx.events.on('order:issued', ({ squadId, order }) => {
      if (station.has(squadId)) toStation.push({ t: ctx.clock.now, type: order.type, x: order.x, z: order.z });
      if (ownTree.has(squadId)) toSession.push({ t: ctx.clock.now, type: order.type, x: order.x, z: order.z });
    });
    const near = (o: { x: number; z: number }, p: { x: number; z: number }, r2: number): boolean => Math.hypot(o.x - p.x, o.z - p.z) < r2;

    // aller : l'ordre de mouvement de la journée (vers la zone de stationnement) ne vise que la BRAV-M de la session
    t.step(14);
    const dest = j.destination!;
    expect(dest).not.toBeNull();
    console.log(`aller : FAUCON 9 ${toStation.map((o) => `${o.type}(${o.x.toFixed(0)},${o.z.toFixed(0)})`).join(' ') || '—'} ; BRAV-M de la session ${toSession.map((o) => `${o.type}(${o.x.toFixed(0)},${o.z.toFixed(0)})`).join(' ')}`);
    expect(toSession.some((o) => o.type === 'colonne' && near(o, dest, 40))).toBe(true);
    expect(toStation.some((o) => near(o, dest, 120))).toBe(false);
    expect(faucon.order.type).toBe('colonne');
    expect(near(faucon.order, REPUBLIQUE, 80)).toBe(true);

    // sur place, puis fin de mission : retour de la journée vers la caserne
    for (let i = 0; i < 120 && j.stage !== 'sur_place'; i++) t.step(5);
    console.log(`journée : étape ${j.stage} à ${ctx.clock.now.toFixed(0)} s ; FAUCON 9 à ${(() => { const l = ctx.people.get(faucon.leaderId); return l ? Math.hypot(l.x - REPUBLIQUE.x, l.z - REPUBLIQUE.z).toFixed(0) : '?'; })()} m de la République`);
    expect(j.stage).toBe('sur_place');
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    // fin de mission : le commandant (le joueur) accepte la proposition de son adjoint (regroupement, rembarquement)
    const cmd = ctx.service<{ endMission(id: number): void; proposals: readonly { id: number; key: string }[]; accept(id: number): boolean }>('police.command')!;
    const mark = ctx.clock.now;
    cmd.endMission(company.id);
    for (let i = 0; i < 140 && j.stage === 'sur_place'; i++) {
      t.step(5);
      for (const prop of cmd.proposals) if (prop.key === 'fin') cmd.accept(prop.id);
    }
    console.log(`fin de mission acceptée : étape ${j.stage} à ${ctx.clock.now.toFixed(0)} s`);
    expect(j.stage === 'rembarquement' || j.stage === 'retour').toBe(true);
    t.step(5);
    const backStation = toStation.filter((o) => o.t >= mark);
    const backSession = toSession.filter((o) => o.t >= mark);
    console.log(`retour : FAUCON 9 ${backStation.map((o) => `${o.type}(${o.x.toFixed(0)},${o.z.toFixed(0)})`).join(' ') || '—'} ; BRAV-M de la session ${backSession.map((o) => `${o.type}(${o.x.toFixed(0)},${o.z.toFixed(0)})`).join(' ')}`);
    // la BRAV-M de la session suit la journée vers la caserne ; FAUCON 9 n'y est pas envoyée (la fin de mission du
    // dispositif peut la replier, mais vers son propre commissariat)
    expect(backSession.some((o) => o.type === 'colonne' && near(o, SERVICE_BASE, 60))).toBe(true);
    expect(backStation.some((o) => near(o, SERVICE_BASE, 120))).toBe(false);
    expect(api.isStationUnit(faucon.id)).toBe(true);
    expect(api.entry('9e:faucon9')!.state).not.toBe('au_poste');
  }, 3000000);
});

