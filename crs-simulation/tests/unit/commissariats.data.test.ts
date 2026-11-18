// Commissariats — données figées (pur : aucune carte chargée).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { COMMISSARIATS_SERVICE } from '@/gameplay/commissariats/api';
import { BRAVM_BASES, SERVICE_BASES } from '@/gameplay/session/journee-data';
import { COMPANY_CALLSIGNS } from '@/sim/police/roster';
import { createVehicleDefs } from '@/sim/vehicles/defs';
import {
  BAC_COLOR, COMMISSARIATS, COMMISSARIAT_SEEDS, STOCK_CALLSIGN_PATTERN, VEHICLE_LEN, VEHICLE_WIDTH, commissariatById,
  fileCentre, isHeldVehicle, nearestCommissariat, reservedBays,
} from '@/world/commissariats';
import { slotsOverlap } from '@/world/commissariats/layout';

/** Emprise de la carte : manifeste des données de Paris s'il est présent, sinon ses valeurs connues. */
function mapBounds(): { minX: number; minZ: number; maxX: number; maxZ: number } {
  try {
    const m = JSON.parse(readFileSync(join(process.cwd(), 'public/data/paris/manifest.json'), 'utf8')) as {
      bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
    };
    return m.bounds;
  } catch {
    return { minX: -2656.28, minZ: -1375.38, maxX: 3757.91, maxZ: 1738.61 };
  }
}

const allTemplates = COMMISSARIATS.flatMap((c) => c.stock.map((t) => ({ c, t })));

describe('commissariats : données figées', () => {
  it('sept sites, identifiants uniques, 32 véhicules', () => {
    expect(COMMISSARIATS).toHaveLength(7);
    expect(COMMISSARIATS.map((c) => c.id)).toEqual(COMMISSARIAT_SEEDS.map((s) => s.id));
    expect(new Set(COMMISSARIATS.map((c) => c.id)).size).toBe(7);
    expect(new Set(allTemplates.map(({ t }) => t.id)).size).toBe(allTemplates.length);
    const vehicles = allTemplates.reduce((n, { t }) => n + t.vehicles, 0);
    expect(vehicles).toBe(32);
    for (const c of COMMISSARIATS) expect(commissariatById(c.id)).toBe(c);
    expect(commissariatById('inconnu')).toBeUndefined();
  });

  it('chaque porte et chaque place est à 150 m au moins du bord de la carte', () => {
    const b = mapBounds();
    const inside = (x: number, z: number): number => Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
    for (const c of COMMISSARIATS) {
      expect(inside(c.door.x, c.door.z), c.id).toBeGreaterThanOrEqual(150);
      expect(inside(c.exit.x, c.exit.z), c.id).toBeGreaterThanOrEqual(150);
      for (const s of c.slots) expect(inside(s.x, s.z), `${c.id} (${s.x}, ${s.z})`).toBeGreaterThanOrEqual(150);
    }
  });

  it('chaque base de journée et de BRAV-M est à moins de 120 m de la porte du site du même arrondissement', () => {
    for (const base of [...SERVICE_BASES, ...BRAVM_BASES]) {
      const m = /(\d+)(?:er|e) arrondissement/.exec(base.name);
      const site = m
        ? COMMISSARIATS.find((c) => c.kind !== 'prefecture' && c.arrondissement === Number(m[1]))
        : COMMISSARIATS.find((c) => c.kind === 'prefecture');
      expect(site, base.name).toBeDefined();
      const d = Math.hypot(site!.door.x - base.x, site!.door.z - base.z);
      expect(d, `${base.name} → ${site!.id}`).toBeLessThanOrEqual(120);
      expect(nearestCommissariat(base.x, base.z)?.id, base.name).toBe(site!.id);
    }
  });

  it('chaque unité : autant de places que de véhicules, d\'un seul tenant, dans une seule file, tête d\'abord', () => {
    for (const { c, t } of allTemplates) {
      const label = `${c.id} ${t.callsign}`;
      expect(t.slots, label).toHaveLength(t.vehicles);
      for (let i = 1; i < t.slots.length; i++) expect(t.slots[i], label).toBe(t.slots[i - 1]! + 1);
      const file = c.slots[t.slots[0]!]!.file;
      for (const i of t.slots) {
        const s = c.slots[i]!;
        expect(s.file, label).toBe(file);
        expect(s.spare, label).toBe(false);
        expect(Math.abs(s.heading - c.slots[t.slots[0]!]!.heading), label).toBeLessThan(0.01);
      }
      // la tête est la place la plus en aval (sens du cap) ; les suivantes reculent
      const head = c.slots[t.slots[0]!]!;
      const fx = Math.sin(head.heading);
      const fz = Math.cos(head.heading);
      for (let k = 1; k < t.slots.length; k++) {
        const a = c.slots[t.slots[k - 1]!]!;
        const b = c.slots[t.slots[k]!]!;
        expect((b.x - a.x) * fx + (b.z - a.z) * fz, label).toBeLessThan(0);
      }
    }
  });

  it('au moins 30 % de places de réserve, dont une file de deux', () => {
    let total = 0;
    let vehicles = 0;
    for (const c of COMMISSARIATS) {
      const v = c.stock.reduce((n, t) => n + t.vehicles, 0);
      vehicles += v;
      total += c.slots.length;
      expect(c.slots.length, c.id).toBeGreaterThanOrEqual(Math.ceil(1.3 * v));
      const spares = c.slots.filter((s) => s.spare);
      expect(spares.length, c.id).toBeGreaterThanOrEqual(2);
      // chaque place appartient à une seule unité, ou à la réserve
      const owned = new Set(c.stock.flatMap((t) => t.slots));
      c.slots.forEach((s, i) => expect(owned.has(i) !== s.spare, `${c.id} place ${i}`).toBe(true));
    }
    expect(total).toBeGreaterThanOrEqual(Math.ceil(1.3 * vehicles));
    expect(reservedBays()).toHaveLength(total);
  });

  it('aucune place n\'en recouvre une autre ; chaque place contient son véhicule', () => {
    const defs = new Map(createVehicleDefs().map((d) => [d.kind as string, d]));
    for (const [kind, len] of Object.entries(VEHICLE_LEN)) {
      const d = defs.get(kind);
      if (!d) continue; // voiture_bac : définition facultative (voiture_police à défaut)
      expect(len, kind).toBeGreaterThanOrEqual(d.length);
      expect(VEHICLE_WIDTH[kind]!, kind).toBeGreaterThanOrEqual(d.width - 1e-6);
    }
    for (const c of COMMISSARIATS) {
      for (let i = 0; i < c.slots.length; i++) {
        for (let j = 0; j < i; j++) expect(slotsOverlap(c.slots[i]!, c.slots[j]!, 0.4), `${c.id} ${i}/${j}`).toBe(false);
      }
      for (const t of c.stock) {
        for (const i of t.slots) {
          expect(c.slots[i]!.len, `${c.id} ${t.callsign}`).toBeGreaterThanOrEqual(VEHICLE_LEN[t.vehicle]!);
          expect(c.slots[i]!.width, `${c.id} ${t.callsign}`).toBeGreaterThanOrEqual(VEHICLE_WIDTH[t.vehicle]!);
        }
      }
    }
    // d'un site à l'autre non plus
    const bays = reservedBays();
    for (let i = 0; i < bays.length; i++) {
      for (let j = 0; j < i; j++) {
        if (bays[i]!.commissariatId === bays[j]!.commissariatId) continue;
        expect(slotsOverlap(bays[i]!, bays[j]!, 0.4)).toBe(false);
      }
    }
  });

  it('indicatifs uniques, au bon format, hors de la numérotation des compagnies', () => {
    const calls = allTemplates.map(({ t }) => t.callsign);
    expect(new Set(calls).size).toBe(calls.length);
    for (const call of calls) {
      expect(call).toMatch(STOCK_CALLSIGN_PATTERN);
      for (const company of COMPANY_CALLSIGNS) expect(call.startsWith(company), call).toBe(false);
    }
  });

  it('stock conforme : véhicules hors dispositif non engageables, libellés en français', () => {
    const cite = commissariatById('cite')!;
    const hors = cite.stock.filter((t) => t.kind === 'hors_dispositif');
    expect(hors.map((t) => t.vehicle).sort()).toEqual(['car_crs', 'vl_commandement']);
    for (const { t } of allTemplates) {
      expect(t.engageable).toBe(t.kind !== 'hors_dispositif');
      expect(t.label.length).toBeGreaterThan(5);
      if (t.kind === 'bac') expect(t.vehicle).toBe('voiture_bac');
    }
    expect(commissariatById('9e')!.stock.find((t) => t.kind === 'bravm')).toMatchObject({ callsign: 'FAUCON 9', vehicles: 6, vehicle: 'moto_bravm' });
    expect(commissariatById('celestins')!.sign).toBe('gendarmerie');
    expect(cite.sign).toBe('none');
    expect(BAC_COLOR).toBe(0x2e3238);
  });

  it('centre de file : milieu des places d\'une unité ; réserve pour une unité adoptée', () => {
    const c = commissariatById('9e')!;
    const bravm = c.stock.find((t) => t.kind === 'bravm')!;
    const f = fileCentre(c, bravm);
    const a = c.slots[bravm.slots[0]!]!;
    const b = c.slots[bravm.slots[bravm.slots.length - 1]!]!;
    expect(f.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(f.z).toBeCloseTo((a.z + b.z) / 2, 6);
    expect(f.heading).toBe(a.heading);
    const spare = fileCentre(c, null);
    const spares = c.slots.filter((s) => s.spare);
    const near = Math.min(...spares.map((s) => Math.hypot(s.x - spare.x, s.z - spare.z)));
    expect(near).toBeLessThan(12);
  });

  it('nearestCommissariat : le plus proche, avec filtre', () => {
    const cite = commissariatById('cite')!;
    expect(nearestCommissariat(cite.door.x + 5, cite.door.z)?.id).toBe('cite');
    expect(nearestCommissariat(cite.door.x, cite.door.z, (c) => c.id !== 'cite')?.id).not.toBe('cite');
    expect(nearestCommissariat(0, 0, () => false)).toBeNull();
  });
});

describe('isHeldVehicle', () => {
  it('false sans le service, true avec un service qui tient le véhicule', async () => {
    const t = createTestContext({ modules: [] });
    await t.ready;
    expect(isHeldVehicle(t.ctx, 42)).toBe(false);
    t.ctx.provide(COMMISSARIATS_SERVICE, { holds: (id: number) => id === 42 });
    expect(isHeldVehicle(t.ctx, 42)).toBe(true);
    expect(isHeldVehicle(t.ctx, 7)).toBe(false);
  });

  it('un service sans holds() (forme inattendue) ne tient rien', () => {
    expect(isHeldVehicle({ service: () => ({}) as never }, 1)).toBe(false);
    expect(isHeldVehicle({ service: () => undefined }, 1)).toBe(false);
  });
});
