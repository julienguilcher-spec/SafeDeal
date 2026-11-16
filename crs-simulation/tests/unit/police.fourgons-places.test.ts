// Une unité dont l'arrière est bâti (façade, grille, arbre) a quand même ses véhicules : sans filet, la compagnie
// postée dos à un bâtiment commençait SANS fourgons (trois essais seulement, tous dans le mur) et restait à pied —
// c'est ce qui arrivait à la caserne de la Cité, dos à la Sainte-Chapelle.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, police, items, props];

describe('véhicules de l’unité : toujours une place', () => {
  it('compagnie dos à un bâtiment (caserne de la Cité) : fourgons garés hors des murs, sans se chevaucher', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Île de la Cité', x: 1760, z: 1225, crowdSize: 0, tension: 0.2, volatility: 0.2, duration: 'standard' });
    const { ctx } = t;
    const units = ctx.service<PoliceUnitsApi>(POLICE_UNITS_SERVICE)!;
    // derrière ce point (cap −135°), à 24 m et au-delà : le bâti du Palais
    const x = 1787.8, z = 1183.3, heading = -2.356;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    expect(ctx.world.isFree(x - fx * 24, z - fz * 24, 1.3)).toBe(false);
    const cie = units.createCompany({ x, z, heading, sections: 1, vehicles: true, drivers: true });
    const vans = cie.vehicles.filter((v) => v.kind === 'fourgon_crs');
    expect(vans.length).toBeGreaterThanOrEqual(3);
    for (const v of cie.vehicles) {
      const hx = Math.sin(v.heading), hz = Math.cos(v.heading);
      // la caisse entière est hors du bâti et des murs, sur un sol où l'on roule
      expect(ctx.world.isFree(v.x, v.z, 1.2)).toBe(true);
      expect(ctx.world.isFree(v.x + hx * 2.4, v.z + hz * 2.4, 1.1)).toBe(true);
      expect(ctx.world.isFree(v.x - hx * 2.4, v.z - hz * 2.4, 1.1)).toBe(true);
      expect(['water', 'building', 'interior', 'park']).not.toContain(ctx.world.surfaceAt(v.x, v.z));
      // à portée de l'unité (pas à l'autre bout du quartier)
      expect(Math.hypot(v.x - x, v.z - z)).toBeLessThan(200);
      for (const o of cie.vehicles) if (o !== v) expect(Math.hypot(o.x - v.x, o.z - v.z)).toBeGreaterThan(3);
    }
    // chaque groupe a son fourgon
    const groups = ctx.squads.list.filter((s) => /MISTRAL 1 (ALFA|BRAVO|CHARLIE)/.test(s.name));
    expect(groups.length).toBe(3);
    for (const g of groups) expect(g.vehicleId).not.toBe(0);
  }, 300000);
});
