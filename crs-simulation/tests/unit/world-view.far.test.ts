// Maillage du sol d'une tuile lointaine (logique pure) : fleuve à son niveau, jupes contre la fente avec une tuile détaillée.
import { describe, expect, it } from 'vitest';
import { CL_ASPHALT, CODE_WATER } from '../../src/world/view/classes';
import { createRaster } from '../../src/world/view/raster';
import type { TileRaster } from '../../src/world/view/raster';
import { FAR_GRID, farGroundMesh } from '../../src/world/view/tiles';

const GROUND = 7, LEVEL = 0;

/** Grille 256 × 256 (2 m) : de l'eau sur les rangées [z0, z1) (m), de la chaussée ailleurs. */
function riverRaster(z0: number, z1: number): TileRaster {
  const r = createRaster(0, 0, 256);
  r.codes.fill(CL_ASPHALT);
  for (let j = 0; j < 256; j++) {
    const z = (j + 0.5) * 2;
    if (z >= z0 && z < z1) for (let i = 0; i < 256; i++) r.codes[j * 256 + i] = CODE_WATER;
  }
  r.hasWater = z1 > z0;
  return r;
}

const W = FAR_GRID + 1, STEP = 512 / FAR_GRID;
const nodeY = (pos: Float32Array, i: number, j: number): number => pos[3 * (j * W + i) + 1];

describe('ville 3D — sol lointain', () => {
  it('sans eau : la grille seule, sans triangle de plus', () => {
    const m = farGroundMesh(riverRaster(0, 0), () => GROUND, LEVEL);
    expect(m.idx.length / 3).toBe(FAR_GRID * FAR_GRID * 2);
    expect(m.pos.length / 3).toBe(W * W);
  });

  it('un nœud dont les 16 m alentour sont surtout de l\'eau est au niveau du fleuve, même avec une berge à moins de 4 m', () => {
    // eau de z = 200 à 226 m : le nœud z = 224 a 10 m d'eau sur les 16 m qui l'entourent, mais la berge à 2 m
    // (l'ancienne règle, « de l'eau sur les 8 m autour du nœud », le laissait au niveau du quai : une bosse dans le fleuve)
    const m = farGroundMesh(riverRaster(200, 226), () => GROUND, LEVEL);
    expect(nodeY(m.pos, 5, Math.round(208 / STEP))).toBe(LEVEL);
    expect(nodeY(m.pos, 5, Math.round(224 / STEP))).toBe(LEVEL);
    // les nœuds de la berge restent au niveau du sol
    expect(nodeY(m.pos, 5, Math.round(192 / STEP))).toBe(GROUND);
    expect(nodeY(m.pos, 5, Math.round(240 / STEP))).toBe(GROUND);
  });

  it('là où le fleuve touche le bord, une jupe tournée vers la tuile voisine descend sous l\'eau', () => {
    // le fleuve passe le bord z = 0 entre x = 0 et 512 ; les nœuds du bord sont au niveau du quai (eau sur 2 m seulement)
    const m = farGroundMesh(riverRaster(0, 2), () => GROUND, LEVEL);
    expect(nodeY(m.pos, 3, 0)).toBe(GROUND);
    const tris = m.idx.length / 3;
    expect(tris).toBeGreaterThan(FAR_GRID * FAR_GRID * 2);
    let skirts = 0;
    for (let t = FAR_GRID * FAR_GRID * 2; t < tris; t++) {
      const v = [0, 1, 2].map((k) => {
        const i = m.idx[3 * t + k];
        return [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]];
      });
      // jupes du bord z = 0 (l'eau touche aussi le premier segment des bords x = 0 et x = 512)
      if (v.some((p) => p[2] !== 0)) continue;
      // normale vers -z (vers la tuile voisine, d'où on la regarde)
      const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
      const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      expect(e1[0] * e2[1] - e1[1] * e2[0]).toBeLessThan(0);
      expect(Math.min(...v.map((p) => p[1]))).toBeLessThan(LEVEL);
      expect(Math.max(...v.map((p) => p[1]))).toBe(GROUND);
      skirts++;
    }
    // une jupe (deux triangles) par segment du bord
    expect(skirts).toBe(FAR_GRID * 2);
  });

  it('les jupes des quatre bords regardent vers l\'extérieur', () => {
    // eau partout : chaque bord a sa jupe
    const m = farGroundMesh(riverRaster(0, 512), () => GROUND, LEVEL);
    const tris = m.idx.length / 3;
    expect(tris).toBe(FAR_GRID * FAR_GRID * 2 + 4 * FAR_GRID * 2);
    for (let t = FAR_GRID * FAR_GRID * 2; t < tris; t++) {
      const v = [0, 1, 2].map((k) => {
        const i = m.idx[3 * t + k];
        return [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]];
      });
      const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
      const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const cx = (v[0][0] + v[1][0] + v[2][0]) / 3 - 256, cz = (v[0][2] + v[1][2] + v[2][2]) / 3 - 256;
      expect(nx * cx + nz * cz).toBeGreaterThan(0);
    }
  });
});
