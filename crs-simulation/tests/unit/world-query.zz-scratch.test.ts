import { describe, it, expect } from 'vitest';
import { createWorldQuery } from '@/world/query';
import { FsMapSource } from '@/world/query/source-fs';
import { seededRandom } from '@/world/query/testkit';

describe('exploration', () => {
  it('itinéraires Paris', async () => {
    const name = 'node:perf_hooks';
    const { PerformanceObserver } = (await import(/* @vite-ignore */ name)) as { PerformanceObserver: new (cb: (list: { getEntries(): unknown[] }) => void) => { observe(o: { entryTypes: string[] }): void; disconnect(): void } };
    let gcs = 0;
    const obs = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
    obs.observe({ entryTypes: ['gc'] });
    const w = createWorldQuery({ source: 'paris', parisSource: new FsMapSource() });
    await w.boot();
    const rand = seededRandom(11);
    const b = w.bounds;
    const ends = new Float64Array(800);
    for (let i = 0; i < 200; i++) { ends[4 * i] = b.minX + rand() * (b.maxX - b.minX); ends[4 * i + 1] = b.minZ + rand() * (b.maxZ - b.minZ); ends[4 * i + 2] = b.minX + rand() * (b.maxX - b.minX); ends[4 * i + 3] = b.minZ + rand() * (b.maxZ - b.minZ); }
    const path: number[] = [];
    for (let rep = 0; rep < 4; rep++) {
      for (const mode of ['foot', 'vehicle'] as const) {
        await new Promise((r) => setTimeout(r, 20));
        const before = gcs;
        const t0 = performance.now();
        let found = 0, pts = 0;
        for (let i = 0; i < 200; i++) if (w.findPath(ends[4 * i], ends[4 * i + 1], ends[4 * i + 2], ends[4 * i + 3], mode, path)) { found++; pts += path.length >> 1; }
        const ms = performance.now() - t0;
        await new Promise((r) => setTimeout(r, 20));
        console.log(`rep ${rep} ${mode}: 200 itinéraires ${ms.toFixed(1)} ms (${(ms * 5).toFixed(0)} µs l'unité), ${found} trouvés, ${(pts / found).toFixed(0)} points en moyenne, GC ${gcs - before}`);
      }
    }
    obs.disconnect();
    expect(true).toBe(true);
  }, 600000);
});
