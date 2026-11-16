// Intégration avec le module des objets (s'il est présent) : les grenades du Centaure, simulées par lui
// (traînée, mèche), arrivent bien sur le point désigné.
import { describe, expect, it } from 'vitest';
import type { ModuleFactory, Projectile } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { VEHICLES_EXT_SERVICE, VehiclesSystem } from '@/sim/vehicles';
import type { VehiclesExtApi } from '@/sim/vehicles';

/** Charge le module des objets sans en dépendre : s'il est absent ou en chantier, le test est sans objet. */
async function loadItems(): Promise<ModuleFactory | null> {
  try {
    const path = '@/sim/items';
    const mod = (await import(/* @vite-ignore */ path)) as { createSystems?: ModuleFactory };
    return typeof mod.createSystems === 'function' ? mod.createSystems : null;
  } catch {
    return null;
  }
}

describe('tourelle du Centaure avec le module des objets', () => {
  it('la grenade simulée par le module des objets tombe sur le point désigné', async () => {
    const items = await loadItems();
    if (!items) {
      console.log('module des objets absent : test sans objet');
      return;
    }
    const t = createTestContext({ modules: [items], systems: [new VehiclesSystem()] });
    await t.ready;
    await t.start();
    const ctx = t.ctx;
    const ext = ctx.require<VehiclesExtApi>(VEHICLES_EXT_SERVICE);
    ext.tuning.dispersion = 0;
    const v = ctx.vehicles.spawn('centaure', 0, 0, 0);
    const gunner = ctx.people.spawn({ kind: 'gendarme', x: 0, z: 0 });
    ctx.vehicles.enter(gunner, v, 'gunner');
    for (const target of [{ x: 20, z: 85 }, { x: -30, z: 40 }]) {
      expect(ext.aimTurretAt(v, 0, target.x, 0, target.z)).toBe(true);
      t.step(3);
      const before = ctx.projectiles.list.length;
      expect(ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(true);
      const p: Projectile | undefined = ctx.projectiles.list[before];
      expect(p).toBeDefined();
      // la grenade s'ouvre en l'air un instant avant son point de chute (le module des objets règle sa mèche) :
      // on la suit jusqu'à sa disparition, puis on prolonge sa trajectoire jusqu'au sol
      let x = p!.x;
      let y = p!.y;
      let z = p!.z;
      let vx = p!.vx;
      let vy = p!.vy;
      let vz = p!.vz;
      let flown = 0;
      for (let i = 0; i < 30 * 14 && ctx.projectiles.get(p!.id) === p; i++) {
        t.step(1 / 30);
        if (ctx.projectiles.get(p!.id) !== p) break;
        x = p!.x; y = p!.y; z = p!.z; vx = p!.vx; vy = p!.vy; vz = p!.vz;
        flown += 1 / 30;
      }
      expect(ctx.projectiles.get(p!.id)).toBeUndefined(); // ouverte en l'air
      expect(flown).toBeGreaterThan(2);
      expect(vy).toBeLessThan(0); // en descente : tir en cloche
      const rest = (vy + Math.sqrt(vy * vy + 2 * 9.81 * Math.max(0, y))) / 9.81;
      const err = Math.hypot(x + vx * rest - target.x, z + vz * rest - target.z);
      console.log(`grenade simulée par le module des objets : ${flown.toFixed(1)} s de vol, ouverture à ${y.toFixed(1)} m de haut, chute prévue à ${err.toFixed(2)} m du point désigné (${target.x} ; ${target.z})`);
      expect(y).toBeLessThan(20);
      expect(err).toBeLessThan(2.5);
      // les palets libérés fument autour du point désigné
      t.step(4);
      const palets = ctx.projectiles.list.filter((q) => q.kind === 'palet_lacrymo');
      if (palets.length > 0) {
        const cx = palets.reduce((a, q) => a + q.x, 0) / palets.length;
        const cz = palets.reduce((a, q) => a + q.z, 0) / palets.length;
        expect(Math.hypot(cx - target.x, cz - target.z)).toBeLessThan(12);
      }
      for (const q of ctx.projectiles.list.slice()) ctx.projectiles.remove(q.id);
      t.step(1);
    }
  });
});
