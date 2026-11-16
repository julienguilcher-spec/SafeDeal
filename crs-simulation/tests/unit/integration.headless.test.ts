// Test d'intégration headless : le monde d'essai + les modules de simulation terminés tournent ensemble.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';

describe('intégration headless', () => {
  it('fait tourner 60 s de simulation avec 120 personnes dans le quartier d\'essai', async () => {
    const t = createTestContext({ seed: 7, modules: [world, people, items, hazards, law, props, vehicles] });
    await t.start({ mode: 'test', x: 0, z: 0 });
    const { ctx } = t;
    expect(ctx.world.ready).toBe(true);
    const out = { x: 0, z: 0 };
    let spawned = 0;
    for (let i = 0; i < 120; i++) {
      if (!ctx.world.randomFreePoint(0, 0, 200, 'any', () => ctx.rng.next(), out)) continue;
      const p = ctx.people.spawn({ kind: i % 4 === 0 ? 'crs' : 'manifestant', x: out.x, z: out.z, seed: i });
      p.cmd.moveX = Math.sin(i);
      p.cmd.moveZ = Math.cos(i);
      p.cmd.gait = 0;
      spawned++;
    }
    expect(spawned).toBeGreaterThan(100);
    // Un manifestant reçoit un pavé et le lance ; une grenade lacrymogène est lancée par un CRS.
    const crs = ctx.people.list.find((p) => p.kind === 'crs')!;
    const man = ctx.people.list.find((p) => p.kind === 'manifestant')!;
    ctx.actions.give(man, 'pave', 2);
    ctx.actions.selectById(man, 'pave');
    ctx.actions.give(crs, 'grenade_lacrymo', 2);
    ctx.actions.selectById(crs, 'grenade_lacrymo');
    t.step(2); // le temps de prendre l'objet en main
    const r1 = ctx.actions.use(man, { power: 0.8 });
    const r2 = ctx.actions.use(crs, { power: 0.7 });
    t.step(58);
    // Décor et véhicules : le quartier d'essai a du mobilier et des vitrines ; un fourgon roule 10 s.
    console.log('objets du décor:', ctx.props.list.length, '| vitrines:', ctx.props.shops.length, '| définitions de véhicules:', ctx.vehicles.defs.length);
    expect(ctx.props.list.length).toBeGreaterThan(50);
    expect(ctx.props.shops.length).toBeGreaterThan(20);
    expect(ctx.vehicles.def('fourgon_crs')).toBeDefined();
    expect(ctx.vehicles.def('centaure')).toBeDefined();
    let inRaster = 0;
    let blocked = 0;
    for (const p of ctx.people.list) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      if (ctx.world.buildingHeightAt(p.x, p.z) > 0) inRaster++;
      // Personne réellement dans un obstacle : son centre n'est pas libre, même avec un rayon minuscule.
      if (!ctx.world.isFree(p.x, p.z, 0.05)) blocked++;
    }
    console.log('personnes:', ctx.people.list.length, '| dans une cellule « bâti » de la grille:', inRaster, '| centre dans un obstacle:', blocked);
    expect(blocked).toBe(0);
    console.log('usage pavé:', JSON.stringify(r1), '| usage grenade:', JSON.stringify(r2), '| journal force:', ctx.law.forceLog.length,
      '| infractions du lanceur:', man.offenses.length, '| projectiles restants:', ctx.projectiles.list.length);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});
