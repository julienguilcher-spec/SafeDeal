// Pilote automatique : véhicule garé loin de toute chaussée carrossable (terrasse de l'Orangerie, à la Concorde). La rue
// la plus proche est la voie Georges-Pompidou, en contrebas, au-delà des murs : l'itinéraire partait tout droit vers
// elle, sur 155 m, à travers murs et grilles — fourgon « bloqué / mur » pour de bon, itinéraire de près de 3 km par les
// quais (partie jouée : chef de groupe à la Concorde, un fourgon de la section laissé à sa place). Il sort par les
// allées jusqu'à la chaussée de la place, puis prend les rues.
import { describe, expect, it } from 'vitest';
import type { RayHit } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';

describe('pilote automatique : départ loin de toute chaussée', () => {
  it('fourgon garé sur la terrasse de l’Orangerie : itinéraire franchissable, par la place, pas par les quais', async () => {
    const t = createTestContext({ seed: 1, strict: false, modules: [world, people, vehicles] });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0, volatility: 0, duration: 'standard' } as never);
    const ctx = t.ctx;
    const v = ctx.vehicles.spawn('fourgon_crs', 102.5, 81.6, -2.29);
    const p = ctx.people.spawn({ kind: 'crs', x: v.x, z: v.z });
    expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
    const ap = ctx.require<AutopilotApi>('vehicles.autopilot');
    expect(ap.driveTo(v, -32, -3)).toBe(true);
    const path: number[] = [];
    expect(ap.plannedPath!(v, path)).toBe(true);
    let len = 0;
    const hit = { hit: false } as RayHit;
    const blocked: string[] = [];
    for (let i = 2; i < path.length; i += 2) {
      len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      if (len < 150 && ctx.world.raycast(path[i - 2]!, path[i - 1]!, path[i]!, path[i + 1]!, hit) && hit.hit) {
        blocked.push(`(${path[i - 2]!.toFixed(0)},${path[i - 1]!.toFixed(0)})→(${path[i]!.toFixed(0)},${path[i + 1]!.toFixed(0)}) : ${hit.kind}`);
      }
    }
    expect(blocked).toEqual([]);
    expect(len).toBeLessThan(800);
    // et il roule : 60 s plus tard, il a quitté la terrasse
    for (let i = 0; i < 60; i++) t.step(1);
    expect(Math.hypot(v.x - 102.5, v.z - 81.6), `${ap.status(v).state}/${ap.status(v).reason}`).toBeGreaterThan(40);
  }, 120000);
});
