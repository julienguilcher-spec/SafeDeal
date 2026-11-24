import { describe, expect, it } from 'vitest';
import {
  FX_BUDGETS, FX_QUALITY_LEVELS, MAX_CELL_LOD, budgetFor, cellLodFor, detailFactor, nextLodBias, scaledCount,
} from '@/render/fx/budget';

describe('effets — budgets par qualité', () => {
  it('les plafonds croissent strictement avec la qualité', () => {
    const keys = ['maxSprites', 'maxParticles', 'maxPuffs', 'maxFlames', 'maxDecals', 'maxProjectiles', 'emission', 'cloudRadius', 'detailDistance'] as const;
    for (let i = 1; i < FX_QUALITY_LEVELS.length; i++) {
      const lo = FX_BUDGETS[FX_QUALITY_LEVELS[i - 1]!];
      const hi = FX_BUDGETS[FX_QUALITY_LEVELS[i]!];
      for (const k of keys) expect(hi[k], `${k} ${hi.level} > ${lo.level}`).toBeGreaterThan(lo[k]);
      expect(hi.shaderLights).toBeGreaterThanOrEqual(lo.shaderLights);
      expect(hi.trailSegments).toBeGreaterThanOrEqual(lo.trailSegments);
    }
  });

  it('« bas » reste très en dessous de « haut » (téléphone) mais garde de quoi être lisible', () => {
    const bas = FX_BUDGETS.bas;
    const haut = FX_BUDGETS.haut;
    expect(bas.maxSprites).toBeLessThanOrEqual(1000);
    expect(bas.maxSprites).toBeLessThan(haut.maxSprites / 4);
    expect(bas.maxParticles).toBeLessThanOrEqual(500);
    expect(bas.emission).toBeLessThan(0.4);
    expect(bas.atlasTile).toBe(64);
    expect(bas.puffLayers).toBe(1);
    expect(bas.shaderLights).toBeLessThanOrEqual(4);
    // lisible : au moins de quoi dessiner un nuage, une vingtaine de foyers, une salve
    expect(bas.maxPuffs).toBeGreaterThanOrEqual(200);
    expect(bas.maxFlames).toBeGreaterThanOrEqual(40);
    expect(bas.maxProjectiles).toBeGreaterThanOrEqual(150);
    expect(bas.maxDecals).toBeGreaterThanOrEqual(64);
  });

  it('les quads des nuages, des flammes et des particules tiennent dans la couche', () => {
    for (const level of FX_QUALITY_LEVELS) {
      const b = FX_BUDGETS[level];
      // les nuages n'occupent au plus que 72 % de la couche (voir cloud.ts)
      expect(b.maxParticles + b.maxFlames).toBeLessThan(b.maxSprites);
      expect(b.maxSprites * 0.72).toBeGreaterThanOrEqual(b.maxPuffs * b.puffLayers * 0.5);
    }
  });

  it('budgetFor retombe sur « moyen » pour une valeur inconnue', () => {
    expect(budgetFor('bas').level).toBe('bas');
    expect(budgetFor('ultra').level).toBe('ultra');
    expect(budgetFor(undefined).level).toBe('moyen');
    expect(budgetFor('nimporte').level).toBe('moyen');
  });

  it('scaledCount applique le multiplicateur sans jamais descendre sous le minimum', () => {
    expect(scaledCount(10, 1)).toBe(10);
    expect(scaledCount(10, 0.32)).toBe(3);
    expect(scaledCount(1, 0.32)).toBe(1);
    expect(scaledCount(0.4, 0.32, 2)).toBe(2);
    expect(scaledCount(50, 1.4)).toBe(70);
    for (const level of FX_QUALITY_LEVELS) expect(scaledCount(46, FX_BUDGETS[level].emission, 14)).toBeGreaterThanOrEqual(14);
  });

  it('le niveau d\'agrégation des cellules monte avec la distance et la surcharge, dans ses bornes', () => {
    const haut = FX_BUDGETS.haut;
    const bas = FX_BUDGETS.bas;
    expect(cellLodFor(5, haut, 0)).toBe(0);
    expect(cellLodFor(5, bas, 0)).toBe(1);
    let prev = -1;
    for (const d of [0, 20, 44, 46, 100, 111, 200, 221, 1000]) {
      const l = cellLodFor(d, haut, 0);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
    expect(cellLodFor(1000, haut, 0)).toBe(3);
    expect(cellLodFor(1000, haut, 9)).toBe(MAX_CELL_LOD);
    expect(cellLodFor(0, haut, -5)).toBe(0);
    expect(cellLodFor(60, bas, 1)).toBe(cellLodFor(60, bas, 0) + 1);
  });

  it('la surcharge monte au-dessus du budget et ne redescend qu\'avec une marge nette', () => {
    const b = FX_BUDGETS.moyen;
    expect(nextLodBias(0, b.maxPuffs + 1, b)).toBe(1);
    expect(nextLodBias(0, b.maxPuffs, b)).toBe(0);
    expect(nextLodBias(MAX_CELL_LOD, b.maxPuffs * 10, b)).toBe(MAX_CELL_LOD);
    // au niveau plus fin il y aurait environ quatre fois plus de bouffées : on ne redescend pas si cela dépasserait
    expect(nextLodBias(1, Math.floor(b.maxPuffs / 3), b)).toBe(1);
    expect(nextLodBias(1, Math.floor(b.maxPuffs / 5), b)).toBe(0);
    expect(nextLodBias(0, 0, b)).toBe(0);
    // pas d'oscillation : une salve qui donne 3 000 cellules converge vers un niveau stable
    let bias = 0;
    const history: number[] = [];
    for (let i = 0; i < 12; i++) {
      const puffs = Math.ceil(3000 / 4 ** bias);
      bias = nextLodBias(bias, puffs, b);
      history.push(bias);
    }
    expect(new Set(history.slice(4)).size).toBe(1);
    expect(Math.ceil(3000 / 4 ** bias)).toBeLessThanOrEqual(b.maxPuffs);
  });

  it('detailFactor : plein détail de près, rien au-delà de la distance de détail', () => {
    const b = FX_BUDGETS.haut;
    expect(detailFactor(0, b)).toBe(1);
    expect(detailFactor(b.detailDistance * 0.5, b)).toBe(1);
    expect(detailFactor(b.detailDistance * 0.75, b)).toBeCloseTo(0.5, 6);
    expect(detailFactor(b.detailDistance, b)).toBe(0);
    expect(detailFactor(1e6, b)).toBe(0);
  });
});
