// « Gros de la foule » visé par les ordres au joueur : avec deux cortèges à 2 km l'un de l'autre, le poste est donné
// près du plus gros, pas à mi-chemin dans un quartier vide.
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { PlayerOrdersSystem } from '@/gameplay/session/orders';

function person(id: number, x: number, z: number) {
  return { id, x, z, faction: 'protest', custody: 'free', posture: 'stand' };
}

describe('ordres au joueur : gros de la foule', () => {
  it('deux cortèges éloignés : le centre est dans le plus gros, pas entre les deux', () => {
    const list = [] as ReturnType<typeof person>[];
    for (let i = 0; i < 120; i++) list.push(person(i + 1, (i % 12) * 2, Math.floor(i / 12) * 2));
    for (let i = 0; i < 80; i++) list.push(person(i + 500, 2000 + (i % 10) * 2, Math.floor(i / 10) * 2));
    const ctx = { people: { list }, events: { on: () => () => undefined } } as unknown as GameContext;
    const sys = new PlayerOrdersSystem();
    sys.init(ctx);
    const c = (sys as unknown as { crowdCenter(): { x: number; z: number } | null }).crowdCenter();
    expect(c).not.toBeNull();
    // le plus gros cortège est autour de (11, 9) ; la moyenne de tous tomberait vers x = 810
    expect(Math.hypot(c!.x - 11, c!.z - 9)).toBeLessThan(40);
  });

  it('poste d\'appui tombé dans un bâtiment : ramené au sol libre (atteignable, « 0 m » possible)', () => {
    const list = [] as ReturnType<typeof person>[];
    for (let i = 0; i < 30; i++) list.push(person(i + 1, (i % 6) * 2, 60 + Math.floor(i / 6) * 2));
    // bâtiment entre z = -30 et z = -10 : le point « 20 m derrière le barrage » (0, -20) tombe dedans
    const inside = (z: number): boolean => z < -10 && z > -30;
    const post = { kind: 'barrage', x: 0, z: 0, heading: 0, name: 'Rue Royale', state: 'tenu' };
    const ctx = {
      people: { list },
      events: { on: () => () => undefined },
      clock: { now: 100 },
      session: { config: { role: 'gendarme_centaure' } },
      service: (n: string) => (n === 'police.command' ? { commands: [{ squadId: 1, phase: 'dispositif', posts: [post] }], hotspots: [] } : undefined),
      world: {
        edgeCount: 0,
        isFree: (_x: number, z: number) => !inside(z),
        buildingHeightAt: (_x: number, z: number) => (inside(z) ? 15 : 0),
        resolveCircle: (p: { x: number; z: number }) => { if (inside(p.z)) { p.z = -8; return true; } return false; },
        sectorName: () => 'secteur',
        nearestRoad: () => false,
      },
    } as unknown as GameContext;
    const sys = new PlayerOrdersSystem();
    sys.init(ctx);
    const me = { id: 999, x: 0, z: -200, vehicleId: 0, squadId: 0 };
    const want = (sys as unknown as { decide(me: unknown, kind: string): { x: number; z: number } | null }).decide(me, 'engin');
    expect(want).not.toBeNull();
    expect(inside(want!.z)).toBe(false);
  });
});
