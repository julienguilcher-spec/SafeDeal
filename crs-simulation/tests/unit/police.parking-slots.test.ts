// Unités de police garées sur des places réservées (commissariats) : section, peloton, BRAV-M et équipages posés
// exactement sur les places figées du plan réel ; véhicules en surnombre rangés sans chevauchement ; sans places,
// rangement inchangé (deux files 24 m derrière le point de mise en place) ; repos d'une unité ; équipage de la BAC.
import { describe, expect, it } from 'vitest';

import type { Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { startPolice } from '@/sim/police/testkit';
import { unitOf } from '@/sim/police/brain';
import { commissariatById } from '@/world/commissariats';
import type { CommissariatDef } from '@/world/commissariats';

const MODULES = [world, people, items, hazards, law, vehicles];

/** Places (x, z, cap) d'une unité du stock, tête de file d'abord. */
function parkingOf(siteId: string, entryId: string): { def: CommissariatDef; parking: { x: number; z: number; heading: number }[] } {
  const def = commissariatById(siteId)!;
  const tpl = def.stock.find((s) => s.id === entryId)!;
  return { def, parking: tpl.slots.map((i) => ({ x: def.slots[i]!.x, z: def.slots[i]!.z, heading: def.slots[i]!.heading })) };
}

function angle(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/** Deux caisses (rectangles orientés) se chevauchent-elles ? (axes séparateurs) */
function overlap(a: Vehicle, b: Vehicle, margin = 0): boolean {
  const boxes = [a, b].map((v) => ({ x: v.x, z: v.z, fx: Math.sin(v.heading), fz: Math.cos(v.heading), hl: v.def.length / 2 + margin, hw: v.def.width / 2 + margin }));
  const axes = boxes.flatMap((o) => [[o.fx, o.fz], [o.fz, -o.fx]]);
  for (const [ax, az] of axes) {
    const proj = boxes.map((o) => {
      const c = o.x * ax! + o.z * az!;
      const r = Math.abs(o.fx * ax! + o.fz * az!) * o.hl + Math.abs(o.fz * ax! - o.fx * az!) * o.hw;
      return [c - r, c + r] as const;
    });
    if (proj[0]![1] < proj[1]![0] || proj[1]![1] < proj[0]![0]) return false;
  }
  return true;
}

function expectOnSlots(list: readonly Vehicle[], parking: readonly { x: number; z: number; heading: number }[]): void {
  expect(list.length).toBe(parking.length);
  for (let i = 0; i < list.length; i++) {
    const v = list[i]!, s = parking[i]!;
    expect(Math.hypot(v.x - s.x, v.z - s.z)).toBeLessThan(0.05);
    expect(angle(v.heading, s.heading)).toBeLessThan(0.01);
    expect(v.faction).toBe('police');
  }
}

describe('police — places de stationnement réservées', () => {
  it('section, peloton et BRAV-M posés exactement sur les places des commissariats, tout le monde à bord', async () => {
    // vraie carte de Paris (les places sont posées telles quelles, sans dépendre des tuiles chargées)
    const pt = await startPolice(MODULES, { mode: 'libre', x: 0, z: 0 });
    const { ctx } = pt;

    // section CRS de réserve de la Cité : trois fourgons en file, embarquée
    const cite = parkingOf('cite', 'cite:aquilon1');
    const sec = pt.units.createSection({
      x: cite.def.exit.x, z: cite.def.exit.z, heading: cite.def.exit.heading, section: 1, vehicles: true, drivers: true,
      layout: 'embarque', callsign: 'AQUILON 1', parking: cite.parking,
    });
    expect(sec.squad.name).toBe('AQUILON 1');
    expectOnSlots(sec.vehicles, cite.parking);
    for (const p of sec.people) expect(p.vehicleId).not.toBe(0);
    for (const v of sec.vehicles) expect(Math.abs(v.y - ctx.world.heightAt(v.x, v.z))).toBeLessThan(0.01);

    // peloton de gendarmerie mobile des Célestins : deux fourgons bleus
    const cel = parkingOf('celestins', 'celestins:epervier9');
    const pel = pt.units.createPeloton({
      x: cel.def.exit.x, z: cel.def.exit.z, heading: cel.def.exit.heading, peloton: 1, vehicles: true, drivers: true,
      layout: 'embarque', callsign: 'ÉPERVIER 9', parking: cel.parking,
    });
    expectOnSlots(pel.vehicles, cel.parking);
    for (const p of pel.people) expect(p.vehicleId).not.toBe(0);

    // BRAV-M du 9e : six motos en selle
    const neuf = parkingOf('9e', '9e:faucon9');
    const bravm = pt.units.createBravm(6, { x: neuf.def.exit.x, z: neuf.def.exit.z, heading: neuf.def.exit.heading, mounted: true, callsign: 'FAUCON 9', parking: neuf.parking });
    expectOnSlots(bravm.vehicles, neuf.parking);
    expect(bravm.people.length).toBe(12);
    for (const p of bravm.people) expect(p.vehicleId).not.toBe(0);

    // aucun chevauchement entre tous ces véhicules
    const all = [...sec.vehicles, ...pel.vehicles, ...bravm.vehicles];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlap(all[i]!, all[j]!)).toBe(false);

    // équipage d'engin sur sa place : le cellulaire du 9e n'existe pas, celui de la Cité si
    const cell = parkingOf('cite', 'cite:cellulaire04');
    const eq = pt.units.createEquipage('fourgon_cellulaire', { callsign: 'CELLULAIRE 75-04', parking: cell.parking });
    expectOnSlots(eq.vehicles, cell.parking);
    for (const p of eq.people) expect(p.vehicleId).toBe(eq.vehicles[0]!.id);
  }, 300000);

  it('moins de places que de véhicules : les autres rangés par la recherche habituelle, sans chevauchement', async () => {
    const cite = parkingOf('cite', 'cite:aquilon1');
    // (vraie carte de Paris : mode 'libre' ; le mode 'test' charge le quartier d'essai)
    const pt = await startPolice(MODULES, { mode: 'libre', x: cite.def.door.x, z: cite.def.door.z });
    await pt.ctx.world.whenLoaded(cite.def.door.x, cite.def.door.z, 250);
    const sec = pt.units.createSection({
      x: cite.def.exit.x, z: cite.def.exit.z, heading: cite.def.exit.heading, section: 1, vehicles: true, drivers: true,
      layout: 'embarque', parking: cite.parking.slice(0, 1),
    });
    expect(sec.vehicles.length).toBe(3);
    expectOnSlots(sec.vehicles.slice(0, 1), cite.parking.slice(0, 1));
    const list = pt.ctx.vehicles.list;
    for (const v of sec.vehicles.slice(1)) {
      // pas sur la place réservée suivante (non donnée) : rangé ailleurs, à l'écart de tout autre véhicule
      for (const o of list) if (o !== v) expect(overlap(v, o, 0.2)).toBe(false);
    }
    console.log('rangés hors des places :', sec.vehicles.slice(1).map((v) => `${v.x.toFixed(1)},${v.z.toFixed(1)}`).join(' | '));
  }, 300000);

  it('sans places : rangement habituel (rangs à 24 m et plus derrière le point), identique d’une partie à l’autre', async () => {
    const run = async (): Promise<{ x: number; z: number; heading: number }[]> => {
      const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 }, 11);
      const sec = pt.units.createSection({ x: -150, z: 0, heading: Math.PI / 2, section: 1, vehicles: true, drivers: true, layout: 'embarque' });
      return sec.vehicles.map((v) => ({ x: v.x, z: v.z, heading: v.heading }));
    };
    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
    // la règle de parkSpot (inchangée) : rang n >> 1 à 24 + 7,6 m derrière, files alternées à ∓1,8 m
    const h = Math.PI / 2, fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    // (depuis les véhicules garés en bloc, parkSpot vérifie la caisse réelle du véhicule ; quand elle ne tient pas sur
    // sa file, il prend l'autre, l'axe, puis les rangs de repli (parkAround : 24 à 84 m derrière, files multiples de
    // 1,8 m) — le premier fourgon n'est donc plus forcément sur l'alternance ∓1,8 m)
    for (let n = 0; n < a.length; n++) {
      const dx = a[n]!.x - -150, dz = a[n]!.z - 0;
      const back = -(dx * fx + dz * fz);
      const lat = (dx * rx + dz * rz) / 1.8;
      expect(back).toBeGreaterThanOrEqual(24 - 1e-6);
      expect(back).toBeLessThanOrEqual(84 + 1e-6);
      expect(Math.abs(((back - 24) / 7.6) - Math.round((back - 24) / 7.6))).toBeLessThan(1e-6);
      expect(Math.abs(lat - Math.round(lat))).toBeLessThan(1e-6);
      expect(a[n]!.heading).toBe(h);
    }
    // et jamais deux véhicules sur la même place
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      expect(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.z - a[j]!.z)).toBeGreaterThan(1);
    }
  }, 300000);

  it('rest() : fatigue à zéro, plus de relève demandée, moral remonté', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: -150, z: 0, heading: Math.PI / 2, section: 1, vehicles: true, layout: 'embarque' });
    pt.step(1);
    const tree = [sec.squad, ...ctx.squads.childrenOf(sec.squad.id)];
    for (const s of tree) {
      const u = unitOf(s)!;
      u.fatigue = 0.9;
      u.needsRelief = true;
      s.morale = 0.3;
    }
    expect(pt.status.of(sec.squad.id)!.fatigue).toBeGreaterThan(0.5);
    pt.units.rest(sec.squad.id);
    for (const s of tree) {
      const u = unitOf(s)!;
      expect(u.fatigue).toBe(0);
      expect(u.needsRelief).toBe(false);
      expect(s.morale).toBeGreaterThanOrEqual(0.8);
    }
    const st = pt.status.of(sec.squad.id)!;
    expect(st.fatigue).toBe(0);
    expect(st.needsRelief).toBe(false);
  }, 300000);

  it('createEquipage(voiture_bac) : trois policiers en civil à bord (voiture banalisée, sinon voiture de police)', async () => {
    const neuf = parkingOf('9e', '9e:bac09');
    const pt = await startPolice(MODULES, { mode: 'libre', x: neuf.def.door.x, z: neuf.def.door.z });
    const { ctx } = pt;
    const bac = pt.units.createEquipage('voiture_bac', { parking: neuf.parking });
    const v = bac.vehicles[0]!;
    expect(v.kind).toBe(ctx.vehicles.def('voiture_bac') ? 'voiture_bac' : 'voiture_police');
    expectOnSlots(bac.vehicles, neuf.parking);
    expect(bac.squad.name).toMatch(/^BAC \d+$/);
    expect(bac.people.length).toBe(3);
    for (const p of bac.people) {
      expect(p.kind).toBe('policier_civil');
      expect(p.vehicleId).toBe(v.id);
    }
    expect(v.seats[0]).not.toBe(0);
    expect(ctx.people.get(v.seats[0]!)!.poste).toBe('conducteur');
    const chief = ctx.people.get(bac.squad.leaderId)!;
    expect(chief.rank).toBe('brigadier_chef');
    expect(chief.poste).toBe('interpellation');
  }, 300000);
});
