import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { decodeRoadGraph, decodeTerrain, decodeTile, parseManifest, sampleTerrain, tilePath } from '../../src/world/mapdata';
import { buildBarriers } from '../../src/world/view/barriers';
import { buildBridges } from '../../src/world/view/bridges';
import { BridgeProfile } from '../../src/world/view/decks';
import { GroundBuilder } from '../../src/world/view/ground';
import { MeshBuf } from '../../src/world/view/meshbuf';
import { createRaster, rasterizeTile } from '../../src/world/view/raster';
import { TileTin } from '../../src/world/view/tin';

const dir = 'public/data/paris/';
describe('scratch', () => {
  it('construit des tuiles de Paris', () => {
    const man = parseManifest(JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')));
    const graph = decodeRoadGraph(JSON.parse(readFileSync(dir + man.files.roadGraph, 'utf8')));
    const terrain = decodeTerrain(JSON.parse(readFileSync(dir + man.files.terrain, 'utf8')));
    const profile = new BridgeProfile(graph, (x, z) => sampleTerrain(terrain, x, z));
    const meshes = { ground: new MeshBuf(65536), volumes: new MeshBuf(8192), cutout: new MeshBuf(4096, true), water: new MeshBuf(4096) };
    for (const [tx, tz, n] of [[0, 0, 1024], [-1, 0, 1024], [3, 0, 2048], [-4, -2, 1024], [2, 1, 2048], [0, 0, 2048]] as const) {
      const tile = decodeTile(JSON.parse(readFileSync(dir + tilePath(tx, tz), 'utf8')));
      let t0 = performance.now();
      const raster = createRaster(tx, tz, n);
      rasterizeTile(raster, tile, graph, tile.roadEdges);
      const tRaster = performance.now() - t0;
      t0 = performance.now();
      const tin = new TileTin(tx, tz, (x, z) => sampleTerrain(terrain, x, z));
      profile.focus(raster.ox, raster.oz, raster.ox + 512, raster.oz + 512);
      const site = { tile, graph, edgeIds: tile.roadEdges, raster, tin, profile, waterLevel: man.waterLevel, ox: raster.ox, oz: raster.oz };
      for (const m of Object.values(meshes)) m.reset();
      const b = new GroundBuilder(site, meshes, { curbs: true, gutters: true, markings: true, grates: true, copingLand: 0.45 });
      let steps = 0, maxStep = 0, last = performance.now();
      for (const _ of b.steps()) { steps++; const now = performance.now(); maxStep = Math.max(maxStep, now - last); last = now; }
      const tGround = performance.now() - t0;
      t0 = performance.now();
      const bs = buildBarriers(site, meshes.volumes, meshes.cutout);
      const br = buildBridges(site, meshes.volumes, man.waterLevel, () => false);
      const tRest = performance.now() - t0;
      console.log(`tuile ${tx}_${tz} n=${n} raster ${tRaster.toFixed(1)} ms, sol ${tGround.toFixed(1)} ms (${steps} étapes, max ${maxStep.toFixed(1)} ms), barrières+ponts ${tRest.toFixed(1)} ms`);
      console.log('  ', JSON.stringify(b.stats), JSON.stringify(bs), JSON.stringify(br));
      console.log(`   ground ${meshes.ground.nv} sommets ${meshes.ground.triangles} tri ${(meshes.ground.gpuBytes / 1e6).toFixed(2)} Mo | volumes ${meshes.volumes.triangles} tri | cutout ${meshes.cutout.triangles} tri | eau ${meshes.water.triangles} tri | decks ${raster.deck.reduce((a, v) => a + v, 0)} rubans ${raster.ribbons.length / 10}`);
    }
  });
});
