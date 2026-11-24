// « Rentrer au commissariat » (vraie carte de Paris) : le cellulaire de la Cité, engagé puis rappelé avec un
// interpellé à bord, rentre sans deux tons et se gare sur sa place (pas sur la chaussée) ; à l'arrivée l'interpellé
// est remis à l'officier de police judiciaire, la réserve est complétée, l'équipage se repose deux minutes puis repasse
// « Au poste ». Une voiture de Police secours rentre à sa place par le module des patrouilles. Une unité d'ailleurs est
// accueillie sur les places de réserve : la compagnie de la journée de service à sa base, une autre au site le plus
// proche.
import { describe, expect, it } from 'vitest';

import type { Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE } from '@/gameplay/patrols';
import type { PatrolsApi } from '@/gameplay/patrols';
import {
  createSystems as commissariats, COMMISSARIATS_SERVICE, COMMISSARIAT_RETURNED_EVENT,
} from '@/gameplay/commissariats';
import type { CommissariatReturnedEvent, CommissariatsApi, RecallTarget } from '@/gameplay/commissariats';
import type { CommandApi } from '@/sim/police/command/api';
import type { PoliceUnitsApi } from '@/sim/police/api';
import { commissariatById, fileCentre } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, traffic, police, law, radio, session, patrols, commissariats];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(config: Partial<SessionConfig> = {}, seed = 7) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
    tension: 0.1, volatility: 0.1, duration: 'standard', ...config,
    extra: { moyens: MEANS, variante: 'salle', foyers: 0, ...(config.extra ?? {}) },
  } as Partial<SessionConfig>);
  t.step(1);
  return { t, ctx: t.ctx, api: t.ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE) };
}

describe('commissariats — retour', () => {
  it('cellulaire rappelé : interpellé remis, réserve complétée, garé sur sa place, repos 2 min puis au poste', async () => {
    const { t, ctx, api } = await start();
    const returned: CommissariatReturnedEvent[] = [];
    ctx.events.onAny(COMMISSARIAT_RETURNED_EVENT, (e) => returned.push(e as CommissariatReturnedEvent));
    const cmd = ctx.require<CommandApi>('police.command');
    const units = ctx.require<PoliceUnitsApi>('police.units');
    const cite = commissariatById('cite')!;
    const r = api.engage('cite:cellulaire04', ctx.player.state.personId);
    expect(r.ok).toBe(true);
    const entry = api.entry('cite:cellulaire04')!;
    const van = ctx.vehicles.get(entry.vehicleIds[0]!)!;
    const slot = cite.slots[cite.stock.find((s) => s.id === 'cite:cellulaire04')!.slots[0]!]!;

    // aller : quai de la Corse, à quelques centaines de mètres
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    expect(ctx.world.nearestRoad(1760, 900, road, 120)).toBe(true);
    expect(cmd.arrive(r.squadId, { x: road.x, z: road.z, heading: road.heading, layout: 'file', boardFirst: true, stagger: true, disembark: false })).toBe(true);
    for (let k = 0; k < 120 && cmd.convoyOf(r.squadId)?.stage !== 'en_place'; k++) t.step(2);
    console.log(`aller : ${cmd.convoyOf(r.squadId)?.stage}, à ${Math.round(Math.hypot(van.x - slot.x, van.z - slot.z))} m de sa place, ${entry.state} — ${entry.where}`);
    expect(entry.state).toBe('engage');
    expect(Math.hypot(van.x - slot.x, van.z - slot.z)).toBeGreaterThan(150);

    // un interpellé à bord (procédure close : custody 'in_vehicle'), réserve entamée
    const prisoner = ctx.archetypes.spawn('manifestant', van.x + 3, van.z, { heading: 0 });
    prisoner.faction = 'protest';
    let seated = false;
    for (let s = van.seats.length - 1; s >= 0 && !seated; s--) if (van.seats[s] === 0) seated = ctx.vehicles.enter(prisoner, van, s);
    expect(seated).toBe(true);
    prisoner.custody = 'in_vehicle';
    const reserve = units.reserveOf(van.id)!;
    const full = { ...reserve };
    reserve.menottes = 0;
    reserve.gazeuse = 0;

    // retour, comme la carte tactique : vers le centre de la file, sans urgence, sans débarquer
    const target = api.recall(r.squadId) as RecallTarget;
    expect(target).not.toBeNull();
    expect(target.commissariatId).toBe('cite');
    const centre = fileCentre(cite, cite.stock.find((s) => s.id === 'cite:cellulaire04')!);
    expect(Math.hypot(target.x - centre.x, target.z - centre.z)).toBeLessThan(0.01);
    expect(entry.state).toBe('retour');
    expect(cmd.arrive(r.squadId, { x: target.x, z: target.z, heading: target.heading, layout: 'file', boardFirst: true, stagger: true, disembark: false, urgence: false })).toBe(true);
    const t0 = ctx.clock.now;
    let loud = 0, moving = 0;
    for (let k = 0; k < 200 && entry.state === 'retour'; k++) {
      t.step(2);
      if (Math.abs(van.speed) > 1) {
        moving++;
        if (van.siren !== 0 || van.beacons) loud++;
      }
    }
    // (dernière manœuvre jusqu'à la place)
    for (let k = 0; k < 30 && Math.hypot(van.x - slot.x, van.z - slot.z) > 0.6; k++) t.step(2);
    const d = Math.hypot(van.x - slot.x, van.z - slot.z);
    const said = ctx.radio.log.filter((m) => m.from === 'CELLULAIRE 75-04' && m.t >= t0).map((m) => m.text);
    console.log(`retour : ${entry.state} en ${Math.round(ctx.clock.now - t0)} s, à ${d.toFixed(1)} m de sa place | ${said.join(' / ')}`);
    expect(entry.state).toBe('repos');
    expect(moving).toBeGreaterThan(5);
    expect(loud).toBe(0);
    // (stationnement en file de la colonne : le cellulaire s'arrête à 2,4 m de sa place, 2 m de côté — mesuré 3,1 m)
    expect(d).toBeLessThan(3.5);
    expect(ctx.people.get(prisoner.id)).toBeUndefined();
    expect(returned).toEqual([{ commissariatId: 'cite', squadId: r.squadId, detainees: 1, t: returned[0]!.t }]);
    expect(units.reserveOf(van.id)!.menottes).toBe(full.menottes);
    expect(units.reserveOf(van.id)!.gazeuse).toBe(full.gazeuse);
    // l'équipage reste à bord, au repos, dans ses places : exclu des raccourcis
    expect(api.atPost(r.squadId)).toBe(true);
    expect(api.get('cite')!.resting).toBe(1);
    t.step(8);
    expect(ctx.radio.log.some((m) => m.from === 'CELLULAIRE 75-04' && /un interpellé remis à l’officier de police judiciaire/.test(m.text))).toBe(true);

    // deux minutes de repos, puis au poste ; de nouveau engageable (même unité)
    const restEnd = entry.restUntil;
    expect(restEnd - returned[0]!.t).toBeCloseTo(120, 6);
    t.step(Math.max(1, restEnd - ctx.clock.now + 1));
    expect(entry.state).toBe('au_poste');
    expect(api.get('cite')!.available).toBe(4);
    const again = api.engage('cite:cellulaire04');
    expect(again.ok).toBe(true);
    expect(again.squadId).toBe(r.squadId);
    expect(entry.state).toBe('alerte');
  }, 900000);

  it('voiture de Police secours rappelée : rentre à sa place par le module des patrouilles', async () => {
    const { t, ctx, api } = await start();
    const pat = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    const r = api.engage('9e:tv19');
    const entry = api.entry('9e:tv19')!;
    const view = pat.statusOf(r.squadId)!;
    const car = ctx.vehicles.get(view.vehicleId)!;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    expect(ctx.world.nearestRoad(1650, -700, road, 120)).toBe(true);
    expect(pat.send(r.squadId, road.x, road.z)).toBe(true);
    for (let k = 0; k < 100 && view.state !== 'sur_place'; k++) t.step(2);
    expect(entry.state).toBe('engage');
    const target = api.recall(r.squadId)!;
    const neuf = commissariatById('9e')!;
    const slot = neuf.slots[neuf.stock.find((s) => s.id === '9e:tv19')!.slots[0]!]!;
    expect(Math.hypot(target.x - slot.x, target.z - slot.z)).toBeLessThan(0.01);
    expect(pat.sendHome(r.squadId, target)).toBe(true);
    for (let k = 0; k < 200 && entry.state === 'retour'; k++) t.step(2);
    // (dernière manœuvre jusqu'à la place, une fois « Au poste »)
    for (let k = 0; k < 30 && Math.hypot(car.x - slot.x, car.z - slot.z) > 1; k++) t.step(2);
    console.log(`patrouille : ${entry.state}, ${view.state}, à ${Math.hypot(car.x - slot.x, car.z - slot.z).toFixed(1)} m de sa place`);
    expect(entry.state).toBe('repos');
    expect(view.state).toBe('au_poste');
    expect(Math.hypot(car.x - slot.x, car.z - slot.z)).toBeLessThan(3);
  }, 900000);

  it('unités d’ailleurs : la compagnie de la journée rentre à sa base, une autre au site le plus proche', async () => {
    const base = { x: 1350, z: -897, name: 'commissariat du 9e arrondissement (rue Chauchat)' };
    const { ctx, api } = await start({ place: 'Place de la République', x: 3123, z: -208, extra: { journee: true, base } });
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie' && s.faction === 'police')!;
    expect(company).toBeDefined();
    const section = ctx.squads.childrenOf(company.id)[0]!;
    const target = api.recall(section.id)!;
    expect(target.commissariatId).toBe('9e');
    const neuf = commissariatById('9e')!;
    const spare = fileCentre(neuf, null);
    expect(Math.hypot(target.x - spare.x, target.z - spare.z)).toBeLessThan(0.01);
    const adopted = api.entryOf(section.id)!;
    expect(adopted.kind).toBe('adopte');
    expect(adopted.state).toBe('retour');
    expect(api.get('9e')!.entries).toContain(adopted);
    expect(api.isStationUnit(section.id)).toBe(true);

    // une unité hors de la compagnie : le site le plus proche de sa position
    const units = ctx.require<PoliceUnitsApi>('police.units');
    const crew: Person[] = [];
    const eq = units.createEquipage('centaure', { x: 2240, z: 330, heading: 0, callsign: 'CENTAURE 7' });
    units.members(eq.squad.id, crew);
    const t2 = api.recall(eq.squad.id)!;
    expect(t2.commissariatId).toBe('3e');
    expect(api.entryOf(eq.squad.id)!.kind).toBe('adopte');
  }, 600000);
});
