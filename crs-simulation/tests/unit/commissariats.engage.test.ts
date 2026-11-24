// Engagement d'unités du stock (vraie carte de Paris, commandant place de la Concorde) : la voiture de Police secours
// TV 75-19 devient une patrouille « Au poste », trois à bord, engagement idempotent ; la BRAV-M FAUCON 9 sort ses six
// motos sur ses places, douze policiers en selle ; la section AQUILON 1 ses trois fourgons en file, tout le monde à
// bord ; envoyée en colonne vers la République, elle est « Engagée » et roule deux tons ; un véhicule garé dans lequel
// monte le joueur quitte le stock.
import { describe, expect, it } from 'vitest';

import type { SessionConfig, Vehicle } from '@/core/contracts';
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
  createSystems as commissariats, COMMISSARIATS_SERVICE, COMMISSARIAT_ENGAGED_EVENT,
} from '@/gameplay/commissariats';
import type { CommissariatEngagedEvent, CommissariatsApi } from '@/gameplay/commissariats';
import type { CommandApi } from '@/sim/police/command/api';
import type { PoliceUnitsApi } from '@/sim/police/api';
import { commissariatById } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, traffic, police, law, radio, session, patrols, commissariats];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const REPUBLIQUE = { x: 3123, z: -208 };

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

/** Places (x, z, cap) d'une unité du stock, tête de file d'abord. */
function slotsOf(entryId: string): { x: number; z: number; heading: number }[] {
  const def = commissariatById(entryId.split(':')[0]!)!;
  const tpl = def.stock.find((s) => s.id === entryId)!;
  return tpl.slots.map((i) => def.slots[i]!);
}

function angle(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function expectOnSlots(list: readonly Vehicle[], entryId: string): void {
  const slots = slotsOf(entryId);
  expect(list.length).toBe(slots.length);
  for (let i = 0; i < list.length; i++) {
    expect(Math.hypot(list[i]!.x - slots[i]!.x, list[i]!.z - slots[i]!.z)).toBeLessThan(0.05);
    expect(angle(list[i]!.heading, slots[i]!.heading)).toBeLessThan(0.01);
  }
}

describe('commissariats — engagement', () => {
  it('TV 75-19 : patrouille au poste, trois à bord, idempotent ; FAUCON 9 : six motos, douze en selle', async () => {
    const { t, ctx, api } = await start();
    const engaged: CommissariatEngagedEvent[] = [];
    ctx.events.onAny(COMMISSARIAT_ENGAGED_EVENT, (e) => engaged.push(e as CommissariatEngagedEvent));
    const pat = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    const neuf = api.get('9e')!;
    expect(neuf.available).toBe(3);

    // Police secours
    const tv = api.entry('9e:tv19')!;
    const parked = tv.vehicleIds[0]!;
    expect(api.holds(parked)).toBe(true);
    const r = api.engage('9e:tv19', ctx.player.state.personId);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('');
    expect(r.defaultVerb).toBe('avancer');
    expect(ctx.vehicles.get(parked)).toBeUndefined();
    expect(api.holds(parked)).toBe(false);
    const view = pat.statusOf(r.squadId)!;
    expect(view.state).toBe('au_poste');
    expect(view.home).toBe('commissariat du 9e');
    const car = ctx.vehicles.get(view.vehicleId)!;
    expectOnSlots([car], '9e:tv19');
    const squad = ctx.squads.get(r.squadId)!;
    expect(squad.name).toBe('TV 75-19');
    expect(squad.members.length).toBe(3);
    for (const m of squad.members) expect(ctx.people.get(m)!.vehicleId).toBe(car.id);
    expect(tv.state).toBe('alerte');
    expect(tv.squadId).toBe(r.squadId);
    expect(api.entryOf(r.squadId)).toBe(tv);
    expect(api.isStationUnit(r.squadId)).toBe(true);
    expect(api.atPost(r.squadId)).toBe(true);
    expect(engaged).toEqual([{ commissariatId: '9e', entryId: '9e:tv19', squadId: r.squadId, t: ctx.clock.now }]);
    // (en alerte, toujours compté au commissariat)
    expect(api.get('9e')!.available).toBe(3);
    // idempotent : même unité, rien de plus
    const vehiclesBefore = ctx.vehicles.list.length;
    const squadsBefore = ctx.squads.list.length;
    const again = api.engage('9e:tv19');
    expect(again.ok).toBe(true);
    expect(again.squadId).toBe(r.squadId);
    expect(ctx.vehicles.list.length).toBe(vehiclesBefore);
    expect(ctx.squads.list.length).toBe(squadsBefore);
    expect(engaged.length).toBe(1);

    // BRAV-M
    const fb = api.engage('9e:faucon9');
    expect(fb.ok).toBe(true);
    expect(fb.defaultVerb).toBe('colonne');
    const units = ctx.require<PoliceUnitsApi>('police.units');
    const crew: import('@/core/contracts').Person[] = [];
    units.members(fb.squadId, crew);
    expect(crew.length).toBe(12);
    expect(crew.length).toBe(api.entry('9e:faucon9')!.crew);
    for (const p of crew) expect(p.vehicleId).not.toBe(0);
    const group = ctx.squads.get(fb.squadId)!;
    expect(group.name).toBe('FAUCON 9');
    const motos = ctx.squads.childrenOf(group.id).map((b) => ctx.vehicles.get(b.vehicleId)!);
    expect(motos.every((m) => m.kind === 'moto_bravm')).toBe(true);
    expectOnSlots(motos, '9e:faucon9');
    expect(ctx.squads.childrenOf(group.id).map((b) => b.name)).toEqual(['FAUCON 9-1', 'FAUCON 9-2', 'FAUCON 9-3', 'FAUCON 9-4', 'FAUCON 9-5', 'FAUCON 9-6']);
    expect(api.entryOf(ctx.squads.childrenOf(group.id)[2]!.id)!.id).toBe('9e:faucon9');
    t.step(20);
    expect(ctx.radio.log.some((m) => m.from === 'TV 75-19' && /Équipage prêt au commissariat du 9e, en attente de destination/.test(m.text))).toBe(true);
    expect(ctx.radio.log.some((m) => m.from === 'FAUCON 9' && /au commissariat du 9e/.test(m.text))).toBe(true);
  }, 300000);

  it('toutes les unités engageables : véhicules sur leurs places, effectif annoncé = effectif créé, tout le monde à bord', async () => {
    const { ctx, api } = await start();
    const units = ctx.require<PoliceUnitsApi>('police.units');
    const crew: import('@/core/contracts').Person[] = [];
    const report: string[] = [];
    const wrong: string[] = [];
    for (const site of api.list) {
      for (const e of site.entries) {
        if (!e.engageable) {
          expect(api.engage(e.id).ok).toBe(false);
          continue;
        }
        const r = api.engage(e.id);
        expect(r.ok, e.id).toBe(true);
        units.members(r.squadId, crew);
        report.push(`${e.callsign} ${crew.length}/${e.crew}`);
        if (crew.length !== e.crew) wrong.push(`${e.callsign} : ${crew.length} créés, ${e.crew} annoncés`);
        for (const p of crew) expect(p.vehicleId, `${e.callsign} ${p.poste}`).not.toBe(0);
        const vs = e.vehicleIds.map((id) => ctx.vehicles.get(id)!);
        expect(vs.every((v) => v.faction === 'police')).toBe(true);
        expectOnSlots(vs, e.id);
        expect(e.state).toBe('alerte');
      }
    }
    console.log(report.join(' | '));
    expect(wrong).toEqual([]);
    // les deux véhicules hors dispositif restent garés
    expect(api.entry('cite:car1')!.state).toBe('au_poste');
    expect(api.holds(api.entry('cite:pc1')!.vehicleIds[0]!)).toBe(true);
  }, 300000);

  it('AQUILON 1 : trois fourgons en file, tous à bord ; en colonne vers la République : engagée, deux tons', async () => {
    const { t, ctx, api } = await start();
    const r = api.engage('cite:aquilon1');
    expect(r.ok).toBe(true);
    expect(r.defaultVerb).toBe('faire_mouvement');
    const sec = ctx.squads.get(r.squadId)!;
    expect(sec.name).toBe('AQUILON 1');
    const entry = api.entry('cite:aquilon1')!;
    const vs = entry.vehicleIds.map((id) => ctx.vehicles.get(id)!);
    expect(vs.every((v) => v.kind === 'fourgon_crs')).toBe(true);
    expectOnSlots(vs, 'cite:aquilon1');
    const units = ctx.require<PoliceUnitsApi>('police.units');
    const crew: import('@/core/contracts').Person[] = [];
    units.members(r.squadId, crew);
    console.log(`AQUILON 1 : ${crew.length} agents (affiché : ${entry.crew})`);
    expect(crew.length).toBe(entry.crew);
    for (const p of crew) expect(p.vehicleId).not.toBe(0);
    expect(api.get('cite')!.available).toBe(4);

    // mouvement en véhicules (comme la carte tactique) vers la place de la République
    const cmd = ctx.require<CommandApi>('police.command');
    const lead = ctx.people.get(sec.leaderId)!;
    expect(cmd.arrive(sec.id, {
      x: REPUBLIQUE.x, z: REPUBLIQUE.z, heading: Math.atan2(REPUBLIQUE.x - lead.x, REPUBLIQUE.z - lead.z), layout: 'file',
      boardFirst: true, stagger: true, disembark: true,
    })).toBe(true);
    let sirens = 0, samples = 0;
    for (let k = 0; k < 90; k++) {
      t.step(2);
      const st = cmd.convoyOf(sec.id);
      for (const v of vs) {
        if (st && st.stage === 'route' && Math.abs(v.speed) > 2) {
          samples++;
          if (v.siren !== 0) sirens++;
        }
      }
      if (entry.state === 'engage' && samples > 60) break;
    }
    console.log(`état ${entry.state} — ${entry.where} ; sirène ${sirens}/${samples}`);
    expect(entry.state).toBe('engage');
    expect(entry.where).not.toBe('');
    expect(api.atPost(sec.id)).toBe(false);
    expect(api.get('cite')!.available).toBe(3);
    expect(api.get('cite')!.engaged).toBe(1);
    expect(samples).toBeGreaterThan(20);
    expect(sirens / samples).toBeGreaterThan(0.8);
  }, 600000);

  it('un véhicule garé dans lequel monte le joueur quitte le stock', async () => {
    const { ctx, api } = await start();
    const entry = api.entry('cite:aquilon1')!;
    const id = entry.vehicleIds[1]!;
    const van = ctx.vehicles.get(id)!;
    const me = ctx.player.person()!;
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    me.x = van.x + 2;
    me.z = van.z;
    expect(ctx.vehicles.enter(me, van, 'driver')).toBe(true);
    expect(api.holds(id)).toBe(false);
    expect(entry.vehicles).toBe(2);
    expect(entry.vehicleIds).not.toContain(id);
    expect(entry.state).toBe('au_poste');
    // engagée ensuite : deux fourgons seulement, l'équipage réparti à bord
    const r = api.engage('cite:aquilon1');
    expect(r.ok).toBe(true);
    expect(entry.vehicles).toBe(2);
    expect(entry.vehicleIds).not.toContain(id);
    expect(ctx.vehicles.get(id)).toBe(van);
    expect(van.seats[0]).toBe(me.id);
    // une unité à un seul véhicule pris devient indisponible
    const cell = api.entry('cite:cellulaire04')!;
    const cv = ctx.vehicles.get(cell.vehicleIds[0]!)!;
    ctx.vehicles.exit(me);
    expect(ctx.vehicles.enter(me, cv, 'driver')).toBe(true);
    expect(cell.vehicles).toBe(0);
    expect(cell.state).toBe('indisponible');
    expect(api.engage('cite:cellulaire04').reason).toBe('Unité indisponible');
  }, 300000);
});
