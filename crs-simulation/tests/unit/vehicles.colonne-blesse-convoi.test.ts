// Colonne de l'IA (convoy : départ de la caserne, mouvement motorisé) : un blessé allongé sur la chaussée devant un
// suivant arrêté. Le suivant de la colonne du joueur le contournait déjà au pas ; celui d'une colonne de l'IA attendait
// derrière lui jusqu'à la fin (la règle exigeait !ap.convoy) — partie jouée Cité → République : le fourgon du joueur
// planté « attente / personne » à 3,6 m d'un blessé, la colonne arrivée sans lui, à 2 km.
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

describe('colonne de l’IA : personne à terre devant un suivant', () => {
  for (const [kind, lat] of [['fourgon_crs', 0], ['fourgon_crs', 0.8]] as const) {
    it(`le suivant de la colonne (${kind}) contourne un blessé allongé à ${lat} m de son axe, sans le toucher`, async () => {
      const town = createTown({ width: 12 });
      const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
      const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
      const head = crewed(b.ctx, 'vl_commandement', 60, 121);
      const next = crewed(b.ctx, kind, 46, 121);
      expect(ap.convoy([head, next], 380, 121)).toBe(true);
      expect(runUntil(b, () => head.x > 100, 40)).toBeGreaterThan(0);
      // blessé allongé sur la trace, devant le suivant
      const hurt = b.ctx.people.spawn({ kind: 'manifestant', x: next.x + 12, z: next.z + lat });
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
      expect(t, `${st.mode}/${st.state}/${st.reason} x=${next.x.toFixed(1)} blessé x=${hurt.x.toFixed(1)}`).toBeGreaterThan(0);
      expect(closest).toBeGreaterThan(0.3);
    }, 120000);
  }
});
