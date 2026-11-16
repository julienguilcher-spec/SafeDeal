// Banc comparatif de SpatialHash (ancien / nouveau) : meilleure répétition sur 300, robuste à la charge.
import { describe, it } from 'vitest';
import { createRng } from '@/core/rng';
import { SpatialHash } from '@/core/spatial';

interface P { x: number; z: number; id: number; police: boolean }

function best(reps: number, fn: () => void): number {
  for (let i = 0; i < 30; i++) fn();
  let m = Infinity;
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    fn();
    const d = performance.now() - t0;
    if (d < m) m = d;
  }
  return m;
}

describe('banc', () => {
  it('requêtes', () => {
    const rng = createRng(1);
    const pts: P[] = [];
    for (let i = 0; i < 1500; i++) pts.push({ id: i, x: rng.range(-14, 14), z: rng.range(-14, 14), police: i % 8 === 0 }); // ≈ 1,9 pers./m²
    const grid = new SpatialHash<P>(1.2, 2048);
    grid.rebuild(pts);
    const out: P[] = [];
    let sink = 0;
    const q1 = best(300, () => { for (let i = 0; i < pts.length; i++) sink += grid.query(pts[i]!.x, pts[i]!.z, 1.0, out); });
    const big = new SpatialHash<P>(3, 1024);
    big.rebuild(pts);
    const q2 = best(300, () => { for (let i = 0; i < pts.length; i++) sink += big.count(pts[i]!.x, pts[i]!.z, 2.5); });
    const isPolice = (p: P): boolean => p.police;
    const q3 = best(300, () => { for (let i = 0; i < pts.length; i++) sink += big.query(pts[i]!.x, pts[i]!.z, 2.0, out, isPolice); });
    const q4 = best(100, () => { for (let i = 0; i < pts.length; i++) if (big.nearest(pts[i]!.x, pts[i]!.z, 15, isPolice)) sink++; });
    const q5 = best(300, () => { big.rebuild(pts); });
    console.log(`[banc] 1500×query(1 m, cellule 1,2) ${q1.toFixed(3)} ms | 1500×count(2,5 m) ${q2.toFixed(3)} ms | 1500×query(2 m, filtre) ${q3.toFixed(3)} ms | 1500×nearest(15 m, filtre) ${q4.toFixed(3)} ms | rebuild ${q5.toFixed(4)} ms | ${sink}`);
  });
});
