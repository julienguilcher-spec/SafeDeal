// Suivant qui rejoint la trace de son meneur (session/follow.ts lui passe la trace) : le point de la trace qu'il « voit »
// et qu'il rejoint tout droit doit être atteignable tout droit. Une grille (enclos de l'obélisque à la Concorde, grilles
// d'un square) arrête les véhicules sans arrêter la vue : rejoindre la trace à travers elle, c'était rester « bloqué/mur »
// contre elle pour de bon, toute la colonne derrière. On la contourne par les rues.
import { describe, expect, it } from 'vitest';
import type { GameContext, RayHit, Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as people } from '@/sim/people';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

function crewed(ctx: GameContext, kind: string, x: number, z: number, heading: number): Vehicle {
  const v = ctx.vehicles.spawn(kind, x, z, heading);
  const p = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

/** Intersection de deux segments : paramètre sur le premier (0..1), ou -1. */
function cross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

describe('suivant : rejoindre la trace du meneur sans traverser une grille', () => {
  it('le point de la trace vu à travers une grille est rejoint par les rues', async () => {
    const town = createTown({ width: 8 });
    // grille au coin du carrefour (120, 0) : elle laisse voir la rue Nord-Sud, elle ne laisse pas passer
    const G = [104, 6, 116, 6] as const;
    const base = town.raycast.bind(town);
    (town as { raycast: typeof town.raycast }).raycast = (ax: number, az: number, bx: number, bz: number, out: RayHit): boolean => {
      const t = cross(ax, az, bx, bz, G[0], G[1], G[2], G[3]);
      if (t >= 0) {
        out.hit = true; out.t = t; out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.nx = 0; out.nz = az < G[1] ? -1 : 1;
        out.kind = 'barrier'; out.id = 0; out.height = 1.2;
        return true;
      }
      return base(ax, az, bx, bz, out);
    };
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    // meneur déjà parti vers le nord sur la rue Nord-Sud 1 ; trace : du carrefour vers le nord
    const lead = crewed(b.ctx, 'vl_commandement', 122, 60, 0);
    const trail: number[] = [];
    for (let z = 14; z <= 56; z += 3) trail.push(122, z);
    const v = crewed(b.ctx, 'fourgon_crs', 100, -1.5, EAST);
    // (trace passée comme le fait session/follow.ts : paramètre du pilote automatique, hors de l'interface publique)
    const pilot = ap as unknown as { follow(v: Vehicle, leaderId: number, distance: number, trail: readonly number[]): boolean };
    expect(pilot.follow(v, lead.id, 6, trail)).toBe(true);
    const rt = (ap as unknown as { k: { rt(v: Vehicle): { ap: { path: number[]; n: number } } } }).k.rt(v).ap;
    // premiers tronçons de l'itinéraire (jusqu'à la trace) : aucun ne traverse la grille
    let crossed = '';
    for (let i = 1; i < rt.n && i < 12; i++) {
      const ax = rt.path[i * 2 - 2]!, az = rt.path[i * 2 - 1]!, bx = rt.path[i * 2]!, bz = rt.path[i * 2 + 1]!;
      if (cross(ax, az, bx, bz, G[0], G[1], G[2], G[3]) >= 0) crossed = `(${ax.toFixed(0)},${az.toFixed(0)}) → (${bx.toFixed(0)},${bz.toFixed(0)})`;
    }
    expect(crossed, 'tronçon à travers la grille').toBe('');
  });
});
