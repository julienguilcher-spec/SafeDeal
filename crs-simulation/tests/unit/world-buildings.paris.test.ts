// Vraies tuiles de Paris (si elles existent) : aucune ne doit planter ni dépasser les budgets.
// Dossier lu : public/data/paris/tiles, ou celui de la variable d'environnement CRS_PARIS_TILES.
import { describe, expect, it } from 'vitest';
import { decodeTerrain, decodeTile, sampleTerrain } from '../../src/world/mapdata';
import type { Terrain, Tile } from '../../src/world/mapdata';
import { DETAIL_TRIANGLE_BUDGET, FAR_TRIANGLE_BUDGET, generateTileFarMesh, generateTileMeshes } from '../../src/world/view/buildings/generate';
import { MeshData } from '../../src/world/view/buildings/meshdata';

// Accès au système de fichiers sans les types de Node (le projet ne les installe pas).
interface NodeFs { existsSync(p: string | URL): boolean; readdirSync(p: string | URL): string[]; readFileSync(p: string | URL, enc: string): string }
const nodeFs = 'node:fs';
const fs = (await import(/* @vite-ignore */ nodeFs)) as NodeFs;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const custom = env.CRS_PARIS_TILES;
const base = custom ? (custom.endsWith('/') ? custom : custom + '/') : new URL('../../public/data/paris/tiles/', import.meta.url);
const fileOf = (name: string): string | URL => (typeof base === 'string' ? base + name : new URL(name, base));
const files = fs.existsSync(base) ? fs.readdirSync(base).filter((f) => /^t_-?\d+_-?\d+\.json$/.test(f)) : [];
// relief réel s'il accompagne les tuiles
const terrainUrl = typeof base === 'string' ? null : new URL('../terrain.json', base);
const terrain: Terrain | null = terrainUrl && fs.existsSync(terrainUrl) ? decodeTerrain(JSON.parse(fs.readFileSync(terrainUrl, 'utf8'))) : null;
const flat = (x: number, z: number): number => (terrain ? sampleTerrain(terrain, x, z) : 0);
const never = (): boolean => false;

function checkMesh(m: MeshData, label: string): void {
  for (let i = 0; i < m.ni; i++) if (m.idx[i] >= m.nv) throw new Error(`${label} : indice hors bornes`);
  for (let i = 0; i < m.nv * 3; i++) if (!Number.isFinite(m.pos[i])) throw new Error(`${label} : position non finie`);
  for (let i = 0; i < m.nv * 2; i++) if (!Number.isFinite(m.uv[i])) throw new Error(`${label} : uv non fini`);
}

/** Nombre de triangles dont le sens contredit la normale de leurs sommets (ils seraient invisibles). */
function countFlipped(m: MeshData): number {
  let flipped = 0;
  for (let t = 0; t < m.ni; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    const ux = m.pos[3 * b] - m.pos[3 * a], uy = m.pos[3 * b + 1] - m.pos[3 * a + 1], uz = m.pos[3 * b + 2] - m.pos[3 * a + 2];
    const vx = m.pos[3 * c] - m.pos[3 * a], vy = m.pos[3 * c + 1] - m.pos[3 * a + 1], vz = m.pos[3 * c + 2] - m.pos[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-5) continue;
    if ((nx * m.nor[3 * a] + ny * m.nor[3 * a + 1] + nz * m.nor[3 * a + 2]) / (l * 127) < -0.2) flipped++;
  }
  return flipped;
}

describe.skipIf(files.length === 0)('génération des immeubles — vraies tuiles de Paris', () => {
  const tiles: Tile[] = files.map((f) => decodeTile(JSON.parse(fs.readFileSync(fileOf(f), 'utf8'))));

  it('version détaillée : toutes les tuiles, toutes les qualités, dans le budget', () => {
    const main = new MeshData(), rail = new MeshData();
    // échauffement du compilateur à la volée, pour des temps représentatifs
    for (let i = 0; i < 3; i++) generateTileMeshes(tiles[i % tiles.length], { quality: 'haut', heightAt: flat, skipLandmark: never, seed: 1 }, main, rail);
    for (const quality of ['bas', 'moyen', 'haut'] as const) {
      let maxTri = 0, maxMs = 0, sumMs = 0, sumTri = 0, degraded = 0, maxKey = '', slowKey = '', flipped = 0, triangles = 0;
      for (const tile of tiles) {
        const t0 = performance.now();
        const st = generateTileMeshes(tile, { quality, heightAt: flat, skipLandmark: never, seed: 1 }, main, rail);
        const ms = performance.now() - t0;
        checkMesh(main, `tuile ${tile.tx},${tile.tz}`);
        checkMesh(rail, `tuile ${tile.tx},${tile.tz} (ajouré)`);
        flipped += countFlipped(main);
        triangles += main.triangles;
        expect(st.triangles).toBeLessThanOrEqual(DETAIL_TRIANGLE_BUDGET);
        if (st.triangles > maxTri) { maxTri = st.triangles; maxKey = `${tile.tx},${tile.tz} (${st.buildings} bât.)`; }
        if (ms > maxMs) { maxMs = ms; slowKey = `${tile.tx},${tile.tz} (${st.buildings} bât.)`; }
        sumMs += ms; sumTri += st.triangles;
        if (st.step > (quality === 'bas' ? 3 : quality === 'moyen' ? 1 : 0)) degraded++;
      }
      console.log(`[${quality}] ${tiles.length} tuiles : max ${maxTri} triangles (${maxKey}), moyenne ${(sumTri / tiles.length) | 0} ; `
        + `génération max ${maxMs.toFixed(1)} ms (${slowKey}), moyenne ${(sumMs / tiles.length).toFixed(1)} ms ; ${degraded} tuile(s) au détail réduit ; `
        + `${flipped} face(s) à l'envers sur ${triangles}`);
      // tolérance : quelques faces sur des emprises réellement tordues (anneaux qui se recoupent)
      expect(flipped).toBeLessThanOrEqual(triangles * 0.0005);
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
