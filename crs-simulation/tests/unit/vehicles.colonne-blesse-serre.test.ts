// Colonne derrière le joueur en pleine manifestation : le joueur a renversé des manifestants, qui restent allongés sur sa
// trace. Le suivant s'arrête tout près du blessé (son pare-chocs à un ou deux mètres), le véhicule suivant collé derrière
// lui : il ne peut pas reculer pour prendre de l'angle. Il doit quand même contourner le blessé au pas (en braquant), sans
// le toucher — et non attendre pour de bon, « attente/personne », toute la compagnie derrière lui. (Partie jouée à la
// Concorde : le VL de commandement est resté plus de deux minutes devant deux blessés, cinq fourgons derrière.)
import { describe, expect, it } from 'vitest';
import type { GameContext, Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as people } from '@/sim/people';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

function crewed(ctx: GameContext, kind: string, x: number, z: number): Vehicle {
  const v = ctx.vehicles.spawn(kind, x, z, EAST);
  const p = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

describe('colonne : blessé allongé tout près du pare-chocs, suivant collé derrière', () => {
  for (const [kind, lat, gap] of [['vl_commandement', -1.3, 2.2], ['vl_commandement', 1.3, 1.6], ['fourgon_crs', 1.1, 2.0]] as const) {
    it(`le suivant (${kind}) contourne un blessé à ${lat} m de son axe, ${gap} m devant son pare-chocs`, async () => {
      const town = createTown({ width: 12 });
      const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
      const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
      const head = crewed(b.ctx, 'vl_commandement', 70, 121);
      const next = crewed(b.ctx, kind, 56, 121);
      const tail = crewed(b.ctx, 'fourgon_crs', 42, 121);
      expect(ap.follow(next, head.id, 6)).toBe(true);
      expect(ap.follow(tail, next.id, 6)).toBe(true);
      expect(ap.driveTo(head, 380, 121)).toBe(true);
      expect(runUntil(b, () => head.x > 150, 40)).toBeGreaterThan(0);
      // le blessé apparaît sous le nez du suivant (il vient d'être renversé par la tête de colonne) : il pile
      const hurt = b.ctx.people.spawn({ kind: 'manifestant', x: next.x + next.def.length * 0.5 + gap + 4, z: next.z + lat });
      hurt.posture = 'down';
      hurt.stun = 1e6;
      let closest = Infinity;
      const t = runUntil(b, () => next.x > hurt.x + 15, 120, () => {
        hurt.posture = 'down';
        const sn = Math.sin(next.heading), cs = Math.cos(next.heading);
        const rx = hurt.x - next.x, rz = hurt.z - next.z;
        const fwd = rx * sn + rz * cs, side = Math.abs(-rx * cs + rz * sn);
        const d = Math.hypot(Math.max(0, Math.abs(fwd) - next.def.length * 0.5), Math.max(0, side - next.def.width * 0.5));
        if (d < closest) closest = d;
      });
      const st = ap.status(next);
      expect(t, `${st.mode}/${st.state}/${st.reason} x=${next.x.toFixed(1)} blessé x=${hurt.x.toFixed(1)} queue x=${tail.x.toFixed(1)}`).toBeGreaterThan(0);
      expect(closest).toBeGreaterThan(0.3);
    }, 120000);
  }
});
