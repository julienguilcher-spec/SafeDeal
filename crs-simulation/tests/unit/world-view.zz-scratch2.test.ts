import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { decodeRoadGraph, decodeTile, parseManifest, tilePath } from '../../src/world/mapdata';
import { createRaster, rasterSteps } from '../../src/world/view/raster';

const dir = 'public/data/paris/';
describe('scratch2', () => {
  it('profil du raster', () => {
    const man = parseManifest(JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')));
    const graph = decodeRoadGraph(JSON.parse(readFileSync(dir + man.files.roadGraph, 'utf8')));
    for (let rep = 0; rep < 3; rep++) for (const [tx, tz, n] of [[0, 0, 2048], [3, 0, 2048], [3, 0, 1024], [3, 0, 512]] as const) {
      const tile = decodeTile(JSON.parse(readFileSync(dir + tilePath(tx, tz), 'utf8')));
      const raster = createRaster(tx, tz, n);
      const it = rasterSteps(raster, tile, graph, tile.roadEdges);
      const times: number[] = [];
      let last = performance.now();
      for (;;) { const r = it.next(); const now = performance.now(); times.push(now - last); last = now; if (r.done) break; }
      const total = times.reduce((a, b) => a + b, 0);
      const top = times.map((t, i) => [t, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 6).map(([t, i]) => `${i}:${t.toFixed(1)}`).join(' ');
      if (rep === 2) console.log(`tuile ${tx}_${tz} n=${n} total ${total.toFixed(1)} ms en ${times.length} étapes ; plus longues : ${top} ; surfaces ${tile.surfaces.length} arêtes ${tile.roadEdges.length}`);
    }
  });
});
