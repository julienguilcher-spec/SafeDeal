// Colonne garantie (plan « ordres directs », P17, point 5) : un fourgon cellulaire arrêté nez contre un candélabre (quai,
// près de la Bastille, (1682, 857)) ne reculait pas — « bloqué / obstacle » pour de bon, le pilote automatique n'ayant
// aucune reprise devant un objet fixe (seulement devant un mur). Il recule maintenant de quoi braquer, puis repart.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as props } from '@/sim/props';
import type { AutopilotApi } from '@/sim/vehicles';

describe('pilote automatique : nez contre le mobilier fixe', () => {
  for (const [tx, tz] of [[1500, 900], [1700, 1100], [1600, 700]] as const) {
    it(`le fourgon cellulaire collé à un candélabre recule et repart vers (${tx}, ${tz})`, async () => {
      const t = createTestContext({ seed: 21, strict: false, modules: [world, people, vehicles, props] });
      await t.start({ mode: 'libre', role: 'commandant', place: 'Place de la Bastille', x: 1682, z: 857 } as never);
      t.step(1);
      const ctx = t.ctx;
      const ap = ctx.require<AutopilotApi>('vehicles.autopilot');
      const lamp = ctx.props.list.find((p) => p.kind === 'candelabre' && Math.hypot(p.x - 1683.1, p.z - 854.4) < 0.5);
      expect(lamp).toBeTruthy();
      const v = ctx.vehicles.spawn('fourgon_cellulaire', 0, 0, 0, { faction: 'police' });
      // tourné vers le candélabre, le pare-chocs à 45 cm de lui
      const h = Math.atan2(lamp!.x - 1682.3, lamp!.z - 857.8);
      const d = v.def.length * 0.5 + 0.45;
      v.x = lamp!.x - Math.sin(h) * d;
      v.z = lamp!.z - Math.cos(h) * d;
      v.heading = h;
      const driver = ctx.people.spawn({ kind: 'crs', x: v.x + 3, z: v.z });
      expect(ctx.vehicles.enter(driver, v, 'driver')).toBe(true);
      expect(ap.driveTo(v, tx, tz)).toBe(true);
      const x0 = v.x, z0 = v.z;
      let stuck = 0;
      for (let s = 0; s < 120; s++) {
        t.step(1);
        if (ap.status(v).state === 'bloque' && Math.hypot(v.x - x0, v.z - z0) < 5) stuck++;
      }
      const st = ap.status(v);
      const msg = `(${v.x.toFixed(0)}, ${v.z.toFixed(0)}) ${st.mode}/${st.state}/${st.reason}, ${stuck} s bloqué sur place`;
      expect(Math.hypot(v.x - x0, v.z - z0), msg).toBeGreaterThan(40);
      expect(stuck, msg).toBeLessThan(30);
    }, 300000);
  }
});
