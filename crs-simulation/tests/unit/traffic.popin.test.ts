// Circulation — pas d'apparition sous les yeux du joueur : un véhicule d'ambiance naît hors de sa vue (derrière
// les façades, hors champ), jamais au bout d'une avenue rectiligne qu'il regarde.
import { describe, expect, it } from 'vitest';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createTown, createTrafficBench } from '@/sim/traffic/testkit';

describe('circulation : apparitions hors de la vue du joueur', () => {
  it('aucun véhicule d\'ambiance n\'apparaît dans la ligne de vue du joueur', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ, timeOfDay: 18 }, ambient: true });
    const t = b.api.tuning;
    t.spawnMin = 130;
    t.spawnMax = 250;
    t.despawn = 256;
    t.vehicleDensity = 2;
    t.pedestrianDensity = 0;
    t.parkedDensity = 0;
    let spawned = 0;
    let inView = 0;
    b.ctx.events.on('vehicle:spawned', (e) => {
      const v = b.ctx.vehicles.get(e.id);
      if (!v) return;
      spawned++;
      if (b.sys.kernel.visible(v.x, v.z)) inView++;
    });
    b.step(60);
    expect(spawned).toBeGreaterThan(10);
    expect(inView).toBe(0);
  }, 120000);
});
