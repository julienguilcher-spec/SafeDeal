// Aucun itinéraire ne sort de la carte. Le graphe des voies déborde un peu de la zone jouable ; au-delà, tout est
// « hors carte » pour les collisions. Pour contourner la foule du Trocadéro, l'itinéraire d'une colonne passait par
// le boulevard Delessert puis hors de la carte : la tête butait contre le bord, faisait demi-tour et deux fourgons
// restaient nez à nez.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';

describe('itinéraires : jamais hors de la carte', () => {
  it('à pied et en véhicule, d’un bord à l’autre et autour du Trocadéro (foule à contourner)', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: [world] });
    await t.start({ mode: 'libre', role: 'crs', place: 'Trocadéro', x: -2411, z: 387, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'courte' });
    const w = t.ctx.world;
    const b = w.bounds;
    const inside = (path: number[]): boolean => {
      for (let i = 0; i + 1 < path.length; i += 2) {
        if (!(path[i]! >= b.minX && path[i]! <= b.maxX && path[i + 1]! >= b.minZ && path[i + 1]! <= b.maxZ)) return false;
      }
      return true;
    };
    const path: number[] = [];
    // l'approche de la colonne : depuis l'avenue de New-York vers la zone de stationnement, foule du Trocadéro à éviter
    for (const cost of [240, 600, 2000]) {
      for (const heading of [-0.69, 0.9, 2.4, -2.4]) {
        path.length = 0;
        const ok = w.findPath(-2164, 510, -2478, 320, 'vehicle', path, { heading, uturn: 40, avoid: [{ x: -2411, z: 387, r: 160, cost }] });
        expect(ok).toBe(true);
        expect(inside(path)).toBe(true);
      }
    }
    // d'un bord de la carte à l'autre, et le long des bords
    const m = 60;
    const xs = [b.minX + m, (b.minX + b.maxX) / 2, b.maxX - m];
    const zs = [b.minZ + m, (b.minZ + b.maxZ) / 2, b.maxZ - m];
    let found = 0;
    for (const ax of xs) for (const az of zs) for (const bx of xs) for (const bz of zs) {
      if (ax === bx && az === bz) continue;
      for (const mode of ['vehicle', 'foot'] as const) {
        path.length = 0;
        if (!w.findPath(ax, az, bx, bz, mode, path)) continue;
        found++;
        expect(inside(path)).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(60);
  }, 300000);
});
