// Colonne derrière le joueur : des agents à pied immobiles en travers de la rue, en deux rangs décalés (une ligne de CRS
// en quinconce, là où le joueur s'est faufilé). Le suivant ne peut pas les contourner d'un seul décalage : il passe le
// premier rang par la droite, puis le second par la gauche, de proche en proche. Avant : le couloir de contournement
// était recontrôlé sur toute sa longueur, il butait sur le second rang, le véhicule attendait cinq secondes, renonçait et
// recommençait indéfiniment (partie jouée à la Bastille : les deux motos de la BRAV-M ne quittaient pas la place).
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
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

describe('colonne : agents immobiles en quinconce sur la trace du meneur', () => {
  for (const kind of ['moto_bravm'] as const) {
    it(`le suivant (${kind}) passe les deux rangs sans toucher personne`, async () => {
      const town = createTown({ width: 14 });
      const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
      const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
      const head = crewed(b.ctx, kind, 70, 121);
      const next = crewed(b.ctx, kind, 56, 121);
      expect(ap.driveTo(head, 380, 121)).toBe(true);
      expect(ap.follow(next, head.id, 6)).toBe(true);
      expect(runUntil(b, () => head.x > 160, 40)).toBeGreaterThan(0);
      // (la tête est passée : les agents se sont rangés derrière elle, sur sa trace)
      const zc = head.z;
      const x1 = next.x + 16;
      const row: Person[] = [];
      for (const [dx, lat] of [[0, -3.2], [0.3, -1.8], [0.5, -0.4], [8, 1.6], [8.4, 3.0], [8.2, 4.4]] as const) {
        // (à droite du sens de marche : +z)
        row.push(b.ctx.people.spawn({ kind: 'crs', x: x1 + dx, z: zc + lat }));
      }
      const spots = row.map((p) => ({ x: p.x, z: p.z }));
      let closest = Infinity;
      const t = runUntil(b, () => next.x > x1 + 25, 120, () => {
        // (ils tiennent leur place)
        row.forEach((p, i) => { p.x = spots[i]!.x; p.z = spots[i]!.z; p.vx = 0; p.vz = 0; });
        const sn = Math.sin(next.heading), cs = Math.cos(next.heading);
        for (const p of row) {
          const rx = p.x - next.x, rz = p.z - next.z;
          const fwd = rx * sn + rz * cs, side = Math.abs(-rx * cs + rz * sn);
          const d = Math.hypot(Math.max(0, Math.abs(fwd) - next.def.length * 0.5), Math.max(0, side - next.def.width * 0.5)) - p.radius;
          if (d < closest) closest = d;
        }
      });
      const st = ap.status(next);
      expect(t, `${st.mode}/${st.state}/${st.reason} x=${next.x.toFixed(1)} z=${next.z.toFixed(1)} rangs x=${x1.toFixed(1)}`).toBeGreaterThan(0);
      expect(closest).toBeGreaterThan(0.1);
    }, 120000);
  }
});
