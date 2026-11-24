// Colonne garantie (plan « ordres directs », P17, point 6) : au départ d'une mission, dix motocyclistes de la BRAV-M
// légèrement blessés — les motos, serrées à 3,5 m, se touchaient à chaque freinage de la file. Maintenant : au moins 6 m
// entre deux motos d'une colonne, et un contact à basse vitesse entre deux véhicules de police d'une même colonne ne
// blesse personne (un vrai choc, lui, blesse toujours).
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as people } from '@/sim/people';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';

const EAST = Math.PI / 2;

function moto(ctx: GameContext, x: number, z: number): { v: Vehicle; rider: Person } {
  const v = ctx.vehicles.spawn('moto_bravm', x, z, EAST, { faction: 'police' });
  const rider = ctx.people.spawn({ kind: 'crs', x, z });
  expect(ctx.vehicles.enter(rider, v, 'driver')).toBe(true);
  return { v, rider };
}

describe('motos de la BRAV-M en colonne', () => {
  it('l’intervalle demandé de 3,5 m devient au moins 6 m entre deux motos', async () => {
    const town = createTown({ width: 12 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const list = [moto(b.ctx, 80, 121), moto(b.ctx, 72, 121), moto(b.ctx, 64, 121), moto(b.ctx, 56, 121)];
    expect(ap.convoy(list.map((m) => m.v), 400, 121, { gap: 3.5, speed: 8 })).toBe(true);
    let tightest = Infinity;
    runUntil(b, () => list[0]!.v.x > 300, 60, () => {
      if (list[0]!.v.x < 150) return;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1]!.v, c = list[i]!.v;
        const gap = Math.hypot(a.x - c.x, a.z - c.z) - a.def.length * 0.5 - c.def.length * 0.5;
        if (gap < tightest) tightest = gap;
      }
    });
    expect(tightest).toBeGreaterThan(4.5);
  }, 120000);

  it('un contact au pas entre deux motos d’une même colonne ne blesse pas les motocyclistes ; un choc franc hors colonne, si', async () => {
    const town = createTown({ width: 12 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const lead = moto(b.ctx, 100, 121);
    const next = moto(b.ctx, 97.5, 121);
    expect(ap.convoy([lead.v, next.v], 400, 121, { gap: 3.5 })).toBe(true);
    // la tête pile, le suivant arrive sur elle à 5 m/s (18 km/h)
    lead.v.vx = 0;
    lead.v.vz = 0;
    lead.v.speed = 0;
    next.v.vx = 5;
    next.v.speed = 5;
    const hp = [lead.rider.health, next.rider.health];
    runUntil(b, () => false, 1.5);
    expect([lead.rider.health, next.rider.health]).toEqual(hp);
    // même vitesse, deux motos qui ne roulent pas ensemble (aucune colonne) : le choc blesse
    const a = moto(b.ctx, 200, 140);
    const c = moto(b.ctx, 197.5, 140);
    c.v.vx = 5;
    c.v.speed = 5;
    const hp2 = [a.rider.health, c.rider.health];
    runUntil(b, () => false, 1.5);
    expect(a.rider.health + c.rider.health).toBeLessThan(hp2[0]! + hp2[1]!);
  }, 120000);
});
