// Fusion des commissariats avec le jeu actuel (vraie carte de Paris) : le mode Patrouille, le Mode libre et deux
// parties de suite fonctionnent avec les véhicules garés en réserve des commissariats.
//   (a) mode Patrouille, chaque départ de chaque équipage : la voiture de l'équipage est une voiture à part (jamais
//       une voiture de la réserve), dégagée des places ; les patrouilles de l'IA ne la doublent pas ;
//   (b) Mode libre, CRS au 9e : le joueur prend une voiture garée en tête de file, elle quitte le stock et il la conduit ;
//   (c) deux parties de suite, une unité engagée dans la première : la seconde repart d'une réserve complète, sans
//       unité de commissariat, véhicule tenu ni place réservée de la partie précédente.
import { describe, expect, it } from 'vitest';

import type { GameContext, SessionConfig, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as input } from '@/input';
import type { InputScriptApi } from '@/input';
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
import { createSystems as session, EQUIPAGE_SERVICE } from '@/gameplay/session';
import type { EquipageApi } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE } from '@/gameplay/patrols';
import type { PatrolsApi } from '@/gameplay/patrols';
import { CREWS, sanitizePatrolSetup, vacationSessionConfig } from '@/gameplay/patrols/model';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import type { CommandApi } from '@/sim/police/command/api';
import { COMMISSARIATS, commissariatById, isHeldVehicle } from '@/world/commissariats';

const SIM = [input, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, patrols, commissariats];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

function held(ctx: GameContext): Vehicle[] {
  return ctx.vehicles.list.filter((v) => isHeldVehicle(ctx, v.id));
}

/** Distance du véhicule à la place réservée la plus proche (tous sites). */
function nearestSlot(v: Vehicle): number {
  let best = Infinity;
  for (const c of COMMISSARIATS) for (const s of c.slots) best = Math.min(best, Math.hypot(s.x - v.x, s.z - v.z));
  return best;
}

describe('commissariats fusionnés avec le jeu actuel', () => {
  it('(a) mode Patrouille : la voiture de l’équipage est à part, dégagée de la réserve, sans patrouille en double', async () => {
    const t = createTestContext({ seed: 1, strict: false, modules: SIM });
    const report: string[] = [];
    let n = 0;
    for (const crew of CREWS) {
      for (const dep of crew.departs()) {
        await t.start(vacationSessionConfig(sanitizePatrolSetup({ seed: 21 + n, crew: crew.id, seat: 'conducteur', departId: dep.id, rythme: 'calme' })));
        n++;
        const ctx = t.ctx;
        t.step(2);
        const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
        const me = ctx.player.person()!;
        const car = ctx.vehicles.get(me.vehicleId)!;
        expect(car, dep.callsign).toBeDefined();
        const eq = ctx.require<EquipageApi>(EQUIPAGE_SERVICE).current!;
        expect(eq.vehicleId).toBe(car.id);
        const reserve = held(ctx);
        // la réserve est en place, la voiture de l'équipage n'en fait pas partie
        expect(api.enabled).toBe(true);
        expect(reserve.length).toBeGreaterThan(20);
        expect(isHeldVehicle(ctx, car.id)).toBe(false);
        // dégagée : aucun véhicule de la réserve ne la touche
        let gap = Infinity;
        for (const v of reserve) {
          const d = Math.hypot(v.x - car.x, v.z - car.z) - (v.def.length + car.def.length) * 0.5;
          gap = Math.min(gap, d);
        }
        expect(gap, dep.callsign).toBeGreaterThan(0.5);
        // patrouilles de l'IA : indicatifs distincts de celui du joueur, aucune voiture de la réserve, aucune sur une place
        const pat = ctx.require<PatrolsApi>(PATROLS_SERVICE);
        const names = pat.list.map((p) => p.name);
        expect(names).not.toContain(dep.callsign);
        expect(new Set(names).size).toBe(names.length);
        for (const p of pat.list) {
          expect(p.vehicleId).not.toBe(car.id);
          expect(isHeldVehicle(ctx, p.vehicleId)).toBe(false);
          expect(nearestSlot(ctx.vehicles.get(p.vehicleId)!), p.name).toBeGreaterThan(2);
        }
        // aucune unité de commissariat engagée d'office
        expect(api.list.every((c) => c.entries.every((e) => e.squadId === 0))).toBe(true);
        report.push(`${dep.callsign} : voiture ${car.kind} à ${gap.toFixed(1)} m de la réserve (${reserve.length} véh.), ${names.length} patrouilles IA`);
      }
    }
    console.log(report.join('\n'));
  }, 1200000);

  it('(b) Mode libre au 9e : le joueur prend une voiture garée en tête de file et la conduit', async () => {
    const def = commissariatById('9e')!;
    const t = createTestContext({ seed: 4, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'crs', place: 'Commissariat du 9e', x: def.door.x, z: def.door.z, crowdSize: 0, tension: 0.1,
      volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, foyers: 0, journee: false },
    } as Partial<SessionConfig>);
    t.step(1);
    const ctx = t.ctx;
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    // voiture de tête de sa file (rien devant elle dans son axe) : TV 75-19 est garée derrière la BAC du 9e
    const ahead = (v: Vehicle): boolean => ctx.vehicles.list.some((o) => {
      if (o === v) return false;
      const dx = o.x - v.x, dz = o.z - v.z;
      const a = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
      return a > 0 && a < 12 && Math.abs(-dx * Math.cos(v.heading) + dz * Math.sin(v.heading)) < 2.5;
    });
    const entry = api.get('9e')!.entries.find((e) => (e.kind === 'bac' || e.kind === 'police_secours') && e.vehicleIds.length === 1
      && !ahead(ctx.vehicles.get(e.vehicleIds[0]!)!))!;
    expect(entry).toBeDefined();
    const car = ctx.vehicles.get(entry.vehicleIds[0]!)!;
    expect(isHeldVehicle(ctx, car.id)).toBe(true);
    const before = api.get('9e')!.available;
    const me = ctx.player.person()!;
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    me.x = car.x + 2;
    me.z = car.z;
    expect(ctx.vehicles.enter(me, car, 'driver')).toBe(true);
    t.step(0.5);
    expect(isHeldVehicle(ctx, car.id)).toBe(false);
    expect(entry.vehicles).toBe(0);
    expect(entry.state).toBe('indisponible');
    expect(api.get('9e')!.available).toBe(before - 1);
    const x0 = car.x, z0 = car.z;
    const script = ctx.require<InputScriptApi>('input.script');
    car.cmd.handbrake = false;
    script.setMove(0, 1);
    for (let i = 0; i < 8; i++) {
      t.step(0.5);
      if (process.env.DBG) console.log(`t${i} v=${car.speed.toFixed(2)} thr=${car.cmd.throttle} br=${car.cmd.brake} hb=${car.cmd.handbrake} cam=${ctx.player.state.cameraMode} pos=${car.x.toFixed(1)},${car.z.toFixed(1)} h=${car.heading.toFixed(2)} free=${ctx.world.isFree(car.x + Math.sin(car.heading) * 4, car.z + Math.cos(car.heading) * 4, 1)}`);
    }
    script.setMove(0, 0);
    if (process.env.DBG) {
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const o of ctx.vehicles.list) {
        const dx = o.x - car.x, dz = o.z - car.z;
        if (o !== car && Math.hypot(dx, dz) < 12) console.log(`veh ${o.kind} ${o.faction} held=${isHeldVehicle(ctx, o.id)} avant=${(dx * fx + dz * fz).toFixed(1)} lat=${(-dx * fz + dz * fx).toFixed(1)} v=${o.speed.toFixed(1)}`);
      }
      for (const o of ctx.people.list) {
        const dx = o.x - car.x, dz = o.z - car.z;
        if (Math.hypot(dx, dz) < 8 && o.vehicleId === 0) console.log(`pers ${o.kind} ${o.faction} avant=${(dx * fx + dz * fz).toFixed(1)} lat=${(-dx * fz + dz * fx).toFixed(1)}`);
      }
      const nearP: never[] = [];
      console.log('props', ctx.props.queryRadius(car.x + fx * 3, car.z + fz * 3, 3, nearP as never), JSON.stringify((nearP as { kind?: string; x: number; z: number }[]).map((q) => [q.kind, (q.x - car.x).toFixed(1), (q.z - car.z).toFixed(1)])));
    }
    const moved = Math.hypot(car.x - x0, car.z - z0);
    console.log(`${entry.callsign} prise par le joueur : ${moved.toFixed(1)} m en 4 s, ${car.speed.toFixed(1)} m/s`);
    expect(moved).toBeGreaterThan(3);
    // aucune unité de la session n'a pris de véhicule de la réserve
    for (const v of held(ctx)) expect(v.seats.every((id) => id === 0)).toBe(true);
  }, 600000);

  it('(c) deux parties de suite : la seconde repart d’une réserve complète, sans reste de la première', async () => {
    const t = createTestContext({ seed: 9, strict: false, modules: SIM });
    const cfg = {
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
      tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'salle', foyers: 0 },
    } as Partial<SessionConfig>;
    await t.start(cfg);
    t.step(1);
    let ctx = t.ctx;
    let api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const first = held(ctx).length;
    const views1 = api.list.map((c) => `${c.id}:${c.available}`).join(',');
    // une unité engagée et partie, une voiture de Police secours engagée
    const r = api.engage('cite:cellulaire04', ctx.player.state.personId);
    expect(r.ok).toBe(true);
    const cmd = ctx.require<CommandApi>('police.command');
    expect(cmd.arrive(r.squadId, { x: 1760, z: 900, heading: 0, layout: 'file', boardFirst: true, stagger: true, disembark: false })).toBe(true);
    const ps = api.list.flatMap((c) => c.entries).find((e) => e.kind === 'police_secours' && e.engageable)!;
    const r2 = api.engage(ps.id, ctx.player.state.personId);
    expect(r2.ok).toBe(true);
    t.step(30);
    expect(held(ctx).length).toBeLessThan(first);
    const oldSquads = [r.squadId, r2.squadId];

    await t.start(cfg);
    t.step(1);
    ctx = t.ctx;
    api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const second = held(ctx).length;
    const views2 = api.list.map((c) => `${c.id}:${c.available}`).join(',');
    console.log(`réserve : ${first} puis ${second} véhicules ; sites ${views1} / ${views2}`);
    expect(second).toBe(first);
    expect(views2).toBe(views1);
    for (const e of api.list.flatMap((c) => c.entries)) {
      expect(e.squadId, e.id).toBe(0);
      expect(['au_poste'], e.id).toContain(e.state);
      for (const id of e.vehicleIds) expect(ctx.vehicles.get(id), e.id).toBeDefined();
    }
    for (const id of oldSquads) {
      expect(api.isStationUnit(id)).toBe(false);
    }
    // la voiture de Police secours n'est plus suivie par le module des patrouilles
    const pat = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    expect(pat.list.some((p) => p.name === ps.callsign)).toBe(false);
    // chaque véhicule tenu est sur une place (aucun hors de sa place, aucun empilé)
    const hv = held(ctx);
    for (const v of hv) expect(nearestSlot(v)).toBeLessThan(0.5);
    for (let i = 0; i < hv.length; i++) for (let j = i + 1; j < hv.length; j++) expect(Math.hypot(hv[i]!.x - hv[j]!.x, hv[i]!.z - hv[j]!.z)).toBeGreaterThan(1.5);
  }, 600000);

  it('(d) rappel « Rentrer au commissariat » avec le joueur au volant : la colonne l’attend, sans deux-tons ni retrait de voitures ; il rend le volant, un équipier le reprend', async () => {
    const t = createTestContext({ seed: 6, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
      tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', foyers: 0 },
    } as Partial<SessionConfig>);
    t.step(1);
    const ctx = t.ctx;
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const cmd = ctx.require<CommandApi>('police.command');
    const r = api.engage('cite:cellulaire04', ctx.player.state.personId);
    expect(r.ok).toBe(true);
    const entry = api.entry('cite:cellulaire04')!;
    const van = ctx.vehicles.get(entry.vehicleIds[0]!)!;
    const cite = commissariatById('cite')!;
    const slot = cite.slots[cite.stock.find((s) => s.id === 'cite:cellulaire04')!.slots[0]!]!;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    expect(ctx.world.nearestRoad(1760, 900, road, 120)).toBe(true);
    expect(cmd.arrive(r.squadId, { x: road.x, z: road.z, heading: road.heading, layout: 'file', boardFirst: true, stagger: true, disembark: false })).toBe(true);
    // l'équipage est à bord : la colonne d'un véhicule part tout de suite (pas deux minutes d'« embarquement »)
    t.step(30);
    const left = Math.hypot(van.x - slot.x, van.z - slot.z);
    expect(left).toBeGreaterThan(10);
    for (let k = 0; k < 120 && cmd.convoyOf(r.squadId)?.stage !== 'en_place'; k++) t.step(2);
    console.log(`aller : à ${left.toFixed(0)} m de sa place après 30 s ; ${cmd.convoyOf(r.squadId)?.stage} à ${Math.hypot(van.x - road.x, van.z - road.z).toFixed(0)} m du point en ${ctx.clock.now.toFixed(0)} s`);
    expect(cmd.convoyOf(r.squadId)?.stage).toBe('en_place');
    // le commandant prend le volant du cellulaire (son conducteur passe derrière)
    const me = ctx.player.person()!;
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    const drv = ctx.people.get(van.seats[0]!);
    if (drv) {
      ctx.vehicles.exit(drv);
      ctx.vehicles.enter(drv, van, 'passenger');
    }
    me.x = van.x + 2;
    me.z = van.z;
    expect(ctx.vehicles.enter(me, van, 'driver')).toBe(true);
    const target = api.recall(r.squadId)!;
    expect(target).not.toBeNull();
    expect(cmd.arrive(r.squadId, { x: target.x, z: target.z, heading: target.heading, layout: 'file', boardFirst: true, stagger: true, disembark: false, urgence: false })).toBe(true);
    // voitures civiles proches retirées de la chaussée (le recyclage de la circulation au loin ne compte pas)
    let removed = 0;
    const near = new Set<number>();
    const offRm = ctx.events.on('vehicle:removed', ({ id }) => { if (near.has(id)) removed++; });
    let awaited = false, loud = 0;
    for (let k = 0; k < 30; k++) {
      near.clear();
      for (const o of ctx.vehicles.list) if (o.faction !== 'police' && Math.hypot(o.x - van.x, o.z - van.z) < 40) near.add(o.id);
      t.step(1);
      if (cmd.convoyOf(r.squadId)?.awaitingDriver) awaited = true;
      if (van.siren !== 0 || van.beacons) loud++;
    }
    offRm();
    console.log(`joueur au volant : étape ${cmd.convoyOf(r.squadId)?.stage}, attend le joueur ${awaited}, deux-tons ${loud} s, voitures retirées ${removed}, état ${entry.state}`);
    expect(awaited).toBe(true);
    expect(loud).toBe(0);
    expect(removed).toBe(0);
    expect(entry.state).toBe('retour');
    expect(ctx.radio.log.some((m) => /vous êtes au volant/.test(m.text))).toBe(true);
    // il rend le volant et s'écarte sur le trottoir : un équipier le reprend, le cellulaire repart sans deux-tons
    ctx.vehicles.exit(me);
    me.x = van.x + Math.cos(van.heading) * 8;
    me.z = van.z - Math.sin(van.heading) * 8;
    if (!ctx.world.isFree(me.x, me.z, 0.4)) { me.x = van.x - Math.cos(van.heading) * 8; me.z = van.z + Math.sin(van.heading) * 8; }
    const x0 = van.x, z0 = van.z;
    let moved = 0;
    for (let k = 0; k < 200 && entry.state === 'retour'; k++) {
      t.step(2);
      moved = Math.max(moved, Math.hypot(van.x - x0, van.z - z0));
      if (van.siren !== 0 || van.beacons) loud++;
    }
    for (let k = 0; k < 30 && Math.hypot(van.x - slot.x, van.z - slot.z) > 0.6; k++) t.step(2);
    const d = Math.hypot(van.x - slot.x, van.z - slot.z);
    console.log(`retour : ${entry.state}, roulé ${moved.toFixed(0)} m, à ${d.toFixed(1)} m de sa place, conducteur ${van.seats[0] !== 0}, deux-tons ${loud}`);
    expect(van.seats[0]).not.toBe(0);
    expect(van.seats[0]).not.toBe(me.id);
    expect(moved).toBeGreaterThan(30);
    expect(loud).toBe(0);
    // (jamais repassée « engagée » par ses propres relances de retour)
    expect(['retour', 'repos', 'au_poste']).toContain(entry.state);
  }, 900000);
});
