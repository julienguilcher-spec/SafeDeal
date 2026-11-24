// Stationnement (pilote automatique, park / parkRow) d'un véhicule déjà dans l'axe de sa place, tourné comme elle, la
// place quelques mètres devant lui — la tête d'une colonne arrivée au point, que le rang en file fait avancer de quelques
// mètres. Le point d'approche (en arrière de la place, pour s'aligner de loin) tombait derrière lui : l'itinéraire, calculé
// dans le sens où il est tourné, faisait le tour du quartier (plus de 900 m) pour revenir se garer à 4 m de là, et toute
// la colonne attendait son stationnement.
import { describe, expect, it } from 'vitest';

import type { RoadSample } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles/api';

describe('pilote automatique : se garer quand la place est juste devant, dans l’axe', () => {
  for (const ahead of [4, 9, 14]) {
    it(`place à ${ahead} m devant : il avance s’y garer (pas de tour du quartier)`, async () => {
      const t = createTestContext({ seed: 5, strict: false, modules: [world, vehicles] });
      await t.start({ mode: 'libre', role: 'journaliste', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { 'crowd.none': true } } as never);
      const { ctx } = t;
      const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
      const probe = { ...road };
      let found = false;
      for (let k = 0; k < 900 && !found; k++) {
        const px = -900 + (k % 30) * 60, pz = -900 + Math.floor(k / 30) * 60;
        if (!ctx.world.nearestRoad(px, pz, road, 10) || road.width < 9) continue;
        found = [-40, -20, 20, 40].every((d) => ctx.world.nearestRoad(road.x + Math.sin(road.heading) * d, road.z + Math.cos(road.heading) * d, probe, 3)
          && Math.abs(Math.sin(probe.heading - road.heading)) < 0.08);
      }
      expect(found).toBe(true);
      const h = road.heading;
      const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
      const v = ctx.vehicles.spawn('fourgon_crs', road.x + rx * 2 - fx * ahead, road.z + rz * 2 - fz * ahead, h, { faction: 'police' });
      const ap = ctx.service<AutopilotApi>('vehicles.autopilot')!;
      const slot = { x: road.x + rx * 2, z: road.z + rz * 2 };
      expect(ap.park(v, slot.x, slot.z, h)).toBe(true);
      const x0 = v.x, z0 = v.z;
      let far = 0;
      let done = false;
      for (let i = 0; i < 1200 && !done; i++) {
        t.step(0.1);
        far = Math.max(far, Math.hypot(v.x - x0, v.z - z0));
        done = ap.status(v).state === 'arrive';
      }
      const err = Math.hypot(v.x - slot.x, v.z - slot.z);
      console.log(`place à ${ahead} m : ${done ? 'garé' : ap.status(v).state} en ${ctx.clock.now.toFixed(0)} s, à ${err.toFixed(1)} m de la place ; éloignement maximal ${far.toFixed(0)} m`);
      expect(done).toBe(true);
      expect(err).toBeLessThan(1);
      // il ne s'éloigne pas de plus d'une vingtaine de mètres (il peut reculer pour se représenter, pas faire le tour du quartier)
      expect(far).toBeLessThan(25);
    }, 300000);
  }
});
