// Véhicule de police retenu par des piétons sur un trajet SANS urgence (retour « sans deux-tons ») : la session lui fait
// donner du deux-tons pour que la foule s'écarte (session/engins.ts) — puis, la voie libre, la sirène s'arrête. Avant :
// une fois allumée, elle restait allumée jusqu'au bout du trajet, sur un retour à la base au pas.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import type { ModuleFactory } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as people } from '@/sim/people';
import type { AutopilotApi } from '@/sim/vehicles';
import { EnginsSystem } from '@/gameplay/session/engins';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;
const engins: ModuleFactory = () => [new EnginsSystem()];

function crewed(ctx: GameContext, kind: string, x: number, z: number): Vehicle {
  const v = ctx.vehicles.spawn(kind as never, x, z, EAST, { faction: 'police' });
  const p = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

describe('engins : deux-tons donné pour des piétons sur un trajet sans urgence', () => {
  it('la sirène s’arrête une fois la voie libre', async () => {
    const town = createTown({ width: 14 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people, engins], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const v = crewed(b.ctx, 'fourgon_crs', 60, 121);
    expect(ap.driveTo(v, 380, 121)).toBe(true);
    expect(ap.status(v).urgence).toBe(false);
    expect(runUntil(b, () => v.x > 90, 30)).toBeGreaterThan(0);
    // des passants immobiles en travers de la rue, devant le fourgon
    const row: Person[] = [];
    for (let k = -3; k <= 3; k++) row.push(b.ctx.people.spawn({ kind: 'passant', x: v.x + 14, z: 121 + k * 0.9 }));
    const spots = row.map((p) => ({ x: p.x, z: p.z }));
    const hold = (): void => row.forEach((p, i) => { p.x = spots[i]!.x; p.z = spots[i]!.z; p.vx = 0; p.vz = 0; });
    expect(runUntil(b, () => v.siren !== 0, 30, hold), 'deux-tons pour les piétons').toBeGreaterThan(0);
    // ils s'écartent : la voie est libre, le fourgon repart
    for (const p of row) b.ctx.people.remove(p.id);
    const x0 = v.x;
    expect(runUntil(b, () => v.x > x0 + 60, 40)).toBeGreaterThan(0);
    b.step(3);
    expect(v.siren, `${ap.status(v).mode}/${ap.status(v).state}`).toBe(0);
  }, 120000);
});
