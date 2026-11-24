// Commissariats × BRAV-M à pied (vraie carte de Paris) : FAUCON 9, engagée depuis le 9e, a mis pied à terre (opérateurs
// à pied, pilotes sur les machines) à moins de 250 m de ses places ; « Rentrer au commissariat » la fait remonter en selle et rentrer à moto jusqu'à ses places.
// Le jeu actuel fait aller la BRAV-M à pied vers un point proche (bravm.ts, WALK_LIMIT) : pour un retour au poste, elle
// laissait ses motos là où elle les avait quittées et restait « Retour » sans fin.
import { describe, expect, it } from 'vitest';

import type { OrderType, RoadSample, SessionConfig } from '@/core/contracts';
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
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import { commissariatById } from '@/world/commissariats';
import { FsMapSource, defaultParisDir } from '@/world/query/source-fs';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { entryNumber } from '@/ui/command/commissariatsModel';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, patrols, commissariats, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const available = await new FsMapSource(defaultParisDir()).exists();

describe.skipIf(!available)('BRAV-M du 9e à pied près de ses places : retour au commissariat', () => {
  it('pied à terre à moins de 250 m, « Rentrer au commissariat » : les six motos rentrent dans leurs places', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
      tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', foyers: 0 },
    } as Partial<SessionConfig>);
    t.step(1);
    const ctx = t.ctx;
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const core = ctx.require<CommandCore>('ui.command');
    const def = commissariatById('9e')!;
    await ctx.world.whenLoaded(def.door.x, def.door.z, 400);
    const r = core.engageFromCommissariat(entryNumber('9e:faucon9'));
    expect(r.ok, r.reason).toBe(true);
    const faucon = ctx.squads.get(r.squadId)!;
    const tpl = def.stock.find((s) => s.id === '9e:faucon9')!;
    const bays = tpl.slots.map((i) => def.slots[i]!);
    const hx = bays.reduce((a, s) => a + s.x, 0) / bays.length, hz = bays.reduce((a, s) => a + s.z, 0) / bays.length;
    // un point de la chaussée à 150–220 m des places
    const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    let found = false;
    for (let a = 0; a < 16 && !found; a++) {
      const ang = (a / 16) * Math.PI * 2;
      if (!ctx.world.nearestRoad(hx + Math.sin(ang) * 180, hz + Math.cos(ang) * 180, road, 40)) continue;
      const d = Math.hypot(road.x - hx, road.z - hz);
      found = d > 150 && d < 220;
    }
    expect(found).toBe(true);
    expect(core.issue('colonne', [faucon], [{ x: road.x, z: road.z, heading: 0, width: 0 }]).ok).toBe(true);
    for (let s = 0; s < 60; s++) t.step(2);
    // une manœuvre à pied sur place (« Tenir » le point) : pied à terre, les motos restent là
    const lead0 = ctx.people.get(faucon.leaderId)!;
    expect(core.issue('tenir', [faucon], [{ x: lead0.x, z: lead0.z, heading: 0, width: 0 }]).ok).toBe(true);
    for (let s = 0; s < 30; s++) t.step(2);
    const motos = api.entry('9e:faucon9')!.vehicleIds.map((id) => ctx.vehicles.get(id)!).filter((v) => !!v);
    const leader = ctx.people.get(faucon.leaderId)!;
    // (les pilotes restent sur leurs machines ; les opérateurs, derrière eux, ont mis pied à terre)
    const mounted = motos.filter((v) => v.seats.some((id, k) => k > 0 && id !== 0)).length;
    console.log(`avant le rappel : ${motos.length} motos, ${mounted} avec un opérateur en selle, chef à ${Math.hypot(leader.x - hx, leader.z - hz).toFixed(0)} m des places, motos à ${motos.map((v) => Math.hypot(v.x - hx, v.z - hz).toFixed(0)).join('/')} m`);
    expect(mounted).toBe(0);
    expect(Math.hypot(leader.x - hx, leader.z - hz)).toBeLessThan(250);
    expect(core.issue('retour_poste' as OrderType, [faucon], null).ok).toBe(true);
    expect(api.entry('9e:faucon9')!.state).toBe('retour');
    for (let s = 0; s < 240 && api.entry('9e:faucon9')!.state === 'retour'; s++) t.step(2);
    const e = api.entry('9e:faucon9')!;
    const far = e.vehicleIds.map((id) => ctx.vehicles.get(id)!).filter((v) => !!v).map((v) => Math.hypot(v.x - hx, v.z - hz));
    console.log(`après : ${e.state}, motos à ${far.map((d) => d.toFixed(0)).join('/')} m du centre des places`);
    expect(['repos', 'au_poste']).toContain(e.state);
    for (const d of far) expect(d).toBeLessThan(40);
  }, 900_000);
});
