// Vraies tuiles de Paris (si elles existent) : aucune ne doit planter ni dépasser les budgets.
// Dossier lu : public/data/paris/tiles, ou celui de la variable d'environnement CRS_PARIS_TILES.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeTile } from '../../src/world/mapdata';
import type { Tile } from '../../src/world/mapdata';
import { DETAIL_TRIANGLE_BUDGET, FAR_TRIANGLE_BUDGET, generateTileFarMesh, generateTileMeshes } from '../../src/world/view/buildings/generate';
import { MeshData } from '../../src/world/view/buildings/meshdata';

const dir = process.env.CRS_PARIS_TILES ?? path.resolve(__dirname, '../../public/data/paris/tiles');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^t_-?\d+_-?\d+\.json$/.test(f)) : [];
const flat = (): number => 0;
const never = (): boolean => false;

function checkMesh(m: MeshData, label: string): void {
  for (let i = 0; i < m.ni; i++) if (m.idx[i] >= m.nv) throw new Error(`${label} : indice hors bornes`);
  for (let i = 0; i < m.nv * 3; i++) if (!Number.isFinite(m.pos[i])) throw new Error(`${label} : position non finie`);
  for (let i = 0; i < m.nv * 2; i++) if (!Number.isFinite(m.uv[i])) throw new Error(`${label} : uv non fini`);
}

describe.skipIf(files.length === 0)('génération des immeubles — vraies tuiles de Paris', () => {
  const tiles: Tile[] = files.map((f) => decodeTile(JSON.parse(readFileSync(path.join(dir, f), 'utf8'))));

  it('version détaillée : toutes les tuiles, toutes les qualités, dans le budget', () => {
    const main = new MeshData(), rail = new MeshData();
    // échauffement du compilateur à la volée, pour des temps représentatifs
    for (let i = 0; i < 3; i++) generateTileMeshes(tiles[i % tiles.length], { quality: 'haut', heightAt: flat, skipLandmark: never, seed: 1 }, main, rail);
    for (const quality of ['bas', 'moyen', 'haut'] as const) {
      let maxTri = 0, maxMs = 0, sumMs = 0, sumTri = 0, degraded = 0, maxKey = '', slowKey = '';
      for (const tile of tiles) {
        const t0 = performance.now();
        const st = generateTileMeshes(tile, { quality, heightAt: flat, skipLandmark: never, seed: 1 }, main, rail);
        const ms = performance.now() - t0;
        checkMesh(main, `tuile ${tile.tx},${tile.tz}`);
        checkMesh(rail, `tuile ${tile.tx},${tile.tz} (ajouré)`);
        expect(st.triangles).toBeLessThanOrEqual(DETAIL_TRIANGLE_BUDGET);
        if (st.triangles > maxTri) { maxTri = st.triangles; maxKey = `${tile.tx},${tile.tz} (${st.buildings} bât.)`; }
        if (ms > maxMs) { maxMs = ms; slowKey = `${tile.tx},${tile.tz} (${st.buildings} bât.)`; }
        sumMs += ms; sumTri += st.triangles;
        if (st.step > (quality === 'bas' ? 3 : quality === 'moyen' ? 1 : 0)) degraded++;
      }
      console.log(`[${quality}] ${tiles.length} tuiles : max ${maxTri} triangles (${maxKey}), moyenne ${(sumTri / tiles.length) | 0} ; `
        + `génération max ${maxMs.toFixed(1)} ms (${slowKey}), moyenne ${(sumMs / tiles.length).toFixed(1)} ms ; ${degraded} tuile(s) au détail réduit`);
    }
  });

  it('version lointaine : toutes les tuiles dans le budget', () => {
    const far = new MeshData();
    let maxTri = 0, maxMs = 0, maxStep = 0, sumTri = 0;
    for (const tile of tiles) {
      const t0 = performance.now();
      const st = generateTileFarMesh(tile, { quality: 'haut', heightAt: flat, skipLandmark: never, seed: 1 }, far);
      const ms = performance.now() - t0;
      checkMesh(far, `lointain ${tile.tx},${tile.tz}`);
      expect(far.triangles).toBeLessThanOrEqual(FAR_TRIANGLE_BUDGET);
      maxTri = Math.max(maxTri, far.triangles); maxMs = Math.max(maxMs, ms); maxStep = Math.max(maxStep, st.step); sumTri += far.triangles;
    }
    console.log(`[lointain] max ${maxTri} triangles, moyenne ${(sumTri / tiles.length) | 0}, génération max ${maxMs.toFixed(1)} ms, palier de simplification max ${maxStep}`);
  });
});
