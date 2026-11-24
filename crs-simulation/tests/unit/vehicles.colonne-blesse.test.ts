// Colonne de police : un blessé allongé sur la chaussée (ou une personne immobile) sur la trace de la tête de colonne.
// Le suivant ne l'écrase pas et ne reste pas planté derrière lui jusqu'à la fin : il le contourne au pas en lui
// laissant de la place. (Partie jouée à la Bastille : le VL de commandement attendait derrière deux blessés allongés
// sur la voie, toute la compagnie derrière lui.)
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

describe('colonne : personne à terre sur la trace du meneur', () => {
  // (un fourgon, plus large, sur l'axe même : le petit pas de côté calculé depuis la voie habituelle ne suffisait pas)
  for (const [kind, lat] of [['vl_commandement', 0.3], ['vl_commandement', 1.0], ['fourgon_crs', 0]] as const) {
    it(`le suivant (${kind}) contourne un blessé allongé à ${lat} m de son axe, sans le toucher`, async () => {
      const town = createTown({ width: 12 });
      const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
      const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
      const head = crewed(b.ctx, 'vl_commandement', 60, 121);
      const next = crewed(b.ctx, kind, 46, 121);
      expect(ap.driveTo(head, 380, 121)).toBe(true);
      expect(ap.follow(next, head.id, 6)).toBe(true);
      expect(runUntil(b, () => head.x > 140, 40)).toBeGreaterThan(0);
      // blessé allongé sur la trace, devant le suivant
      const hurt = b.ctx.people.spawn({ kind: 'manifestant', x: next.x + 14, z: next.z + lat });
      hurt.posture = 'down';
      hurt.stun = 1e6;
      let closest = Infinity;
      const t = runUntil(b, () => next.x > hurt.x + 15, 90, () => {
        hurt.posture = 'down';
        const sn = Math.sin(next.heading), cs = Math.cos(next.heading);
        const rx = hurt.x - next.x, rz = hurt.z - next.z;
        const fwd = rx * sn + rz * cs, side = Math.abs(-rx * cs + rz * sn);
        // distance du blessé à la caisse du véhicule
        const d = Math.hypot(Math.max(0, Math.abs(fwd) - next.def.length * 0.5), Math.max(0, side - next.def.width * 0.5));
        if (d < closest) closest = d;
      });
      const st = ap.status(next);
      expect(t, `${st.mode}/${st.state}/${st.reason} x=${next.x.toFixed(1)} blessé x=${hurt.x.toFixed(1)}`).toBeGreaterThan(0);
      expect(closest).toBeGreaterThan(0.3);
    }, 120000);
  }
});
