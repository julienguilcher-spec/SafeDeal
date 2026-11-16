// Murs de quai ramenés hors des chaussées (logique pure) : un mur qui longe une voie dans son emprise est reposé à
// son bord, du même côté ; un mur qui la traverse est coupé dans l'emprise ; un mur à l'écart n'est pas touché.
import { describe, expect, it } from 'vitest';
import type { Barrier } from '@/world/mapdata';
import { clearQuayWalls, clearTrees } from '@/world/query/quaywalls';
import type { QuayRoads } from '@/world/query/quaywalls';

/** Une voie rectiligne le long de l'axe x (z = 0), large de `width`, de x = −100 à x = 100. */
function straightRoad(width: number): QuayRoads {
  const r = {
    snapEdge: -1, snapX: 0, snapZ: 0, snapDist: 0,
    edges: [{ width }],
    nearest(x: number, z: number, maxDist: number): boolean {
      const cx = Math.max(-100, Math.min(100, x));
      const d = Math.hypot(x - cx, z);
      if (d > maxDist) { r.snapEdge = -1; return false; }
      r.snapEdge = 0; r.snapX = cx; r.snapZ = 0; r.snapDist = d;
      return true;
    },
  };
  return r;
}

const wall = (pts: number[]): Barrier => ({ kind: 'quay_wall', height: 4, points: Float32Array.from(pts) });

describe('murs de quai hors des chaussées', () => {
  it('un mur qui longe la voie dans son emprise est reposé à son bord, du même côté', () => {
    const barriers = [wall([-40, 2, 40, 2])]; // à 2 m de l'axe d'une voie de 8 m : en pleine chaussée
    const moved = clearQuayWalls(barriers, straightRoad(8));
    expect(moved).toBeGreaterThan(0);
    expect(barriers.length).toBe(1);
    const p = barriers[0]!.points;
    for (let i = 1; i < p.length; i += 2) {
      expect(p[i]!).toBeGreaterThan(4.3); // hors de la demi-largeur (4 m), avec une marge
      expect(p[i]!).toBeLessThan(5.5);
    }
    expect(p[0]!).toBeCloseTo(-40, 0);
    expect(p[p.length - 2]!).toBeCloseTo(40, 0);
  });

  it('un mur de l’autre côté de l’axe reste de son côté', () => {
    const barriers = [wall([-20, -1.5, 20, -1.5])];
    clearQuayWalls(barriers, straightRoad(8));
    const p = barriers[0]!.points;
    for (let i = 1; i < p.length; i += 2) expect(p[i]!).toBeLessThan(-4.3);
  });

  it('un mur qui traverse la voie est coupé dans son emprise', () => {
    const barriers = [wall([0, -30, 0, 30])];
    clearQuayWalls(barriers, straightRoad(8));
    expect(barriers.length).toBe(2);
    for (const b of barriers) {
      for (let i = 1; i < b.points.length; i += 2) expect(Math.abs(b.points[i]!)).toBeGreaterThan(4.2);
    }
  });

  it('un mur à l’écart, les autres barrières et une tuile sans réseau ne sont pas touchés', () => {
    const far = wall([-40, 12, 40, 12]);
    const hedge: Barrier = { kind: 'hedge', height: 1.2, points: Float32Array.from([-10, 9, 10, 9]) };
    const barriers = [far, hedge];
    expect(clearQuayWalls(barriers, straightRoad(8))).toBe(0);
    expect(barriers[0]).toBe(far);
    expect(barriers[1]).toBe(hedge);
    expect(clearQuayWalls([wall([-40, 2, 40, 2])], null)).toBe(0);
  });

  it('une grille qui longe la rue à l’intérieur de sa chaussée est reposée à son bord', () => {
    const barriers: Barrier[] = [{ kind: 'fence', height: 1.8, points: Float32Array.from([-10, 1, 10, 1]) }];
    expect(clearQuayWalls(barriers, straightRoad(8))).toBeGreaterThan(0);
    expect(barriers.length).toBe(1);
    for (let i = 1; i < barriers[0]!.points.length; i += 2) expect(barriers[0]!.points[i]!).toBeGreaterThan(4.3);
  });

  it('une grille qui coupe une rue est ouverte dans son emprise ; un portail n’est pas touché', () => {
    const fence: Barrier = { kind: 'fence', height: 1.8, points: Float32Array.from([10, -20, 10, 20]) };
    const gate: Barrier = { kind: 'gate', height: 2, points: Float32Array.from([30, -3, 30, 3]) };
    const barriers = [fence, gate];
    clearQuayWalls(barriers, straightRoad(8));
    expect(barriers.filter((b) => b.kind === 'fence').length).toBe(2);
    expect(barriers.some((b) => b === gate)).toBe(true);
    for (const b of barriers) {
      if (b.kind !== 'fence') continue;
      for (let i = 1; i < b.points.length; i += 2) expect(Math.abs(b.points[i]!)).toBeGreaterThan(4.2);
    }
  });

  it('un arbre posé dans la rue est décalé au bord, du même côté ; un arbre du trottoir ne bouge pas', () => {
    const trees = { count: 3, x: Float32Array.from([0, 10, 20]), z: Float32Array.from([1.5, -2, 7]), height: Float32Array.from([12, 12, 12]), crownRadius: Float32Array.from([3, 3, 3]) };
    expect(clearTrees(trees, straightRoad(8))).toBe(2);
    expect(trees.z[0]!).toBeGreaterThan(4.5);
    expect(trees.z[1]!).toBeLessThan(-4.5);
    expect(trees.z[2]!).toBeCloseTo(7, 5);
    expect(trees.x[0]!).toBeCloseTo(0, 5);
  });
});
