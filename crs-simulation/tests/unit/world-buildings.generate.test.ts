// Génération complète d'une tuile (sans rendu) : budgets, robustesse, relief.
import { describe, expect, it } from 'vitest';
import { decodeMapData, decodeTerrain, sampleTerrain } from '../../src/world/mapdata';
import type { Tile } from '../../src/world/mapdata';
import { generateTestDistrict } from '../../src/world/testDistrict';
import { DETAIL_TRIANGLE_BUDGET, FAR_TRIANGLE_BUDGET, generateTileFarMesh, generateTileMeshes } from '../../src/world/view/buildings/generate';
import { MeshData } from '../../src/world/view/buildings/meshdata';

const raw = generateTestDistrict({ seed: 1 });
const data = decodeMapData(raw);
const terrain = decodeTerrain(raw.terrain);
const heightAt = (x: number, z: number): number => sampleTerrain(terrain, x, z);
const never = (): boolean => false;

describe('génération des immeubles — quartier d\'essai', () => {
  it('produit un maillage cohérent pour chaque tuile et chaque qualité', () => {
    const main = new MeshData(), rail = new MeshData();
    for (const tile of data.tiles) {
      for (const quality of ['bas', 'moyen', 'haut', 'ultra'] as const) {
        const t0 = performance.now();
        const st = generateTileMeshes(tile, { quality, heightAt, skipLandmark: never, seed: 1 }, main, rail);
        const ms = performance.now() - t0;
        console.log(`tuile ${tile.tx},${tile.tz} ${quality} : ${st.buildings} bâtiments, ${main.triangles} + ${rail.triangles} triangles, ${main.nv} sommets, palier ${st.step}, ${ms.toFixed(1)} ms`);
        expect(st.triangles).toBeLessThanOrEqual(DETAIL_TRIANGLE_BUDGET);
        expect(main.triangles).toBeGreaterThan(0);
        // indices valides, positions finies
        for (let i = 0; i < main.ni; i++) expect(main.idx[i]).toBeLessThan(main.nv);
        for (let i = 0; i < main.nv * 3; i++) if (!Number.isFinite(main.pos[i])) throw new Error('position non finie');
      }
    }
  });

  it('version lointaine : budget respecté', () => {
    const far = new MeshData();
    for (const tile of data.tiles) {
      const t0 = performance.now();
      const st = generateTileFarMesh(tile, { quality: 'haut', heightAt, skipLandmark: never, seed: 1 }, far);
      console.log(`lointain ${tile.tx},${tile.tz} : ${st.buildings} bâtiments, ${far.triangles} triangles, palier ${st.step}, ${(performance.now() - t0).toFixed(1)} ms`);
      expect(far.triangles).toBeLessThanOrEqual(FAR_TRIANGLE_BUDGET);
      expect(far.triangles).toBeGreaterThan(0);
    }
  });
});
