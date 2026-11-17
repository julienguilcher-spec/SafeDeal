// Itinéraires à pied (findPath 'foot') : les tronçons d'accès hors du réseau des rues — du point de départ à la voie la
// plus proche, de la voie au point d'arrivée — ne traversent ni mur, ni grille, ni monument. Cas relevé en partie jouée :
// le dernier tronçon menait droit au centre de la place de la République ou de l'Étoile, à travers le socle du monument.
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';

let ctx: GameContext;

beforeAll(async () => {
  const t = createTestContext({ seed: 1, strict: false, modules: [world] });
  await t.start({ mode: 'libre', role: 'crs', place: 'Place de la Concorde', x: -10, z: 15 } as never);
  ctx = t.ctx;
});

/** Premier tronçon de l'itinéraire qu'un objet de largeur 2·half ne peut pas parcourir (−1 si aucun). */
function crossing(path: number[], half: number, from: number, to: number): string {
  const w = ctx.world;
  for (let i = from; i < to; i++) {
    const ax = path[i * 2]!, az = path[i * 2 + 1]!, bx = path[i * 2 + 2]!, bz = path[i * 2 + 3]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const nx = -(bz - az) / len * half, nz = (bx - ax) / len * half;
    for (const k of [-1, 0, 1]) {
      const hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none' as const, id: 0, height: 0 };
      if (w.raycast(ax + nx * k, az + nz * k, bx + nx * k, bz + nz * k, hit as never) && hit.hit) {
        return `tronçon ${i} (${ax.toFixed(0)},${az.toFixed(0)})→(${bx.toFixed(0)},${bz.toFixed(0)}) : ${hit.kind} en (${hit.x.toFixed(1)},${hit.z.toFixed(1)})`;
      }
    }
  }
  return '';
}

describe('itinéraires : tronçons d\'accès dégagés', () => {
  it('à pied vers le centre de la place de la République ou de l\'Étoile : pas à travers le socle du monument', () => {
    for (const [x, z, tx, tz] of [[3000, -100, 3115, -199], [-1800, -800, -1920, -904]] as const) {
      const path: number[] = [];
      expect(ctx.world.findPath(x, z, tx, tz, 'foot', path), `itinéraire vers ${tx},${tz}`).toBe(true);
      const n = path.length >> 1;
      expect(crossing(path, 0.25, Math.max(0, n - 4), n - 1), `${tx},${tz}`).toBe('');
      expect(crossing(path, 0.25, 0, Math.min(n - 1, 3)), `${x},${z}`).toBe('');
    }
  });
});
