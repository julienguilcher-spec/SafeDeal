import { describe, it, expect } from 'vitest';
import type { RayHit, RoadSample } from '@/core/contracts';
import { createWorldQuery } from '@/world/query';
import { seededRandom } from '@/world/query/testkit';

describe('exploration', () => {
  it('allocations', async () => {
    const name = 'node:perf_hooks';
    const { PerformanceObserver } = (await import(/* @vite-ignore */ name)) as { PerformanceObserver: new (cb: (list: { getEntries(): unknown[] }) => void) => { observe(o: { entryTypes: string[] }): void; disconnect(): void } };
    let gcs = 0;
    const obs = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
    obs.observe({ entryTypes: ['gc'] });
    const w = createWorldQuery({ source: 'test' });
    await w.boot();
    w.setFocus(0, 0);
    await w.whenLoaded(0, 0, 800);
    const rand = seededRandom(5);
    const pts = new Float64Array(4000);
    for (let i = 0; i < 4000; i++) pts[i] = (rand() - 0.5) * 1000;
    const hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
    const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    const pos = { x: 0.5, z: 0.5 };
    const path: number[] = [];
    const out = { x: 0.5, z: 0.5 };
    const cases: Record<string, (i: number, k: number) => number> = {
      vide: () => 0,
      resolveCircle: (i) => { pos.x = pts[i]; pos.z = pts[i + 1]; return w.resolveCircle(pos, 0.3) ? 1 : 0; },
      raycast: (i) => (w.raycast(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], hit) ? 1 : 0),
      lineOfSight: (i) => (w.lineOfSight(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) ? 1 : 0),
      heightAt: (i) => w.heightAt(pts[i], pts[i + 1]),
      surfaceCodeAt: (i) => w.surfaceCodeAt(pts[i], pts[i + 1]),
      surfaceAt: (i) => w.surfaceAt(pts[i], pts[i + 1]).length,
      buildingHeightAt: (i) => w.buildingHeightAt(pts[i], pts[i + 1]),
      isFree: (i) => (w.isFree(pts[i], pts[i + 1], 0.4) ? 1 : 0),
      nearestRoad: (i) => (w.nearestRoad(pts[i], pts[i + 1], sample) ? sample.dist : 0),
      findPathFoot: (i, k) => (k % 20 === 0 && w.findPath(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], 'foot', path) ? path.length : 0),
      findPathVehicle: (i, k) => (k % 20 === 0 && w.findPath(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], 'vehicle', path) ? path.length : 0),
      randomFreePoint: (i, k) => (k % 10 === 0 && w.randomFreePoint(pts[i], pts[i + 1], 60, 'any', rand, out) ? out.x : 0),
      sectorName: (i, k) => (k % 10 === 0 ? w.sectorName(pts[i], pts[i + 1]).length : 0),
      placeByName: (_i, k) => (k % 10 === 0 ? (w.placeByName('essai')?.id ?? 0) : 0),
      isLoaded: (i) => (w.isLoaded(pts[i], pts[i + 1]) ? 1 : 0),
    };
    for (const [label, fn] of Object.entries(cases)) {
      let acc = 0;
      for (let k = 0; k < 100000; k++) acc += fn((k % 1000) * 4, k);
      await new Promise((r) => setTimeout(r, 30));
      const before = gcs;
      const t0 = performance.now();
      for (let k = 0; k < 1000000; k++) acc += fn((k % 1000) * 4, k);
      const ms = performance.now() - t0;
      await new Promise((r) => setTimeout(r, 30));
      console.log(`${label.padEnd(18)} ${ms.toFixed(0).padStart(6)} ms  GC ${gcs - before}  (${acc.toFixed(0)})`);
    }
    obs.disconnect();
    expect(true).toBe(true);
  }, 600000);
});
