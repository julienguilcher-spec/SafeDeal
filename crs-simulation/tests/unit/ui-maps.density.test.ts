import { describe, expect, it } from 'vitest';
import { aggregateDensity, createDensityGrid, densityAt, densityColor, densityOf } from '@/ui/maps/density';

describe('cartes — agrégation de la densité de foule', () => {
  it('compte chaque personne une fois, dans la bonne cellule', () => {
    const pts = [
      { x: 1, z: 1 }, { x: 2, z: 3 }, { x: 4.9, z: 4.9 }, // même cellule de 5 m
      { x: 6, z: 1 }, // cellule voisine à l'est
      { x: 1, z: 12 }, // deux cellules plus au sud
    ];
    const g = aggregateDensity(pts, pts.length, { cell: 5, maxCols: 64, maxRows: 64 }, createDensityGrid());
    expect(g.total).toBe(5);
    expect(g.cell).toBe(5);
    let sum = 0;
    for (let i = 0; i < g.cols * g.rows; i++) sum += g.counts[i]!;
    expect(sum).toBe(5);
    expect(g.max).toBe(3);
    expect(densityAt(g, 2, 2)).toBeCloseTo(3 / 25, 9);
    expect(densityAt(g, 7, 2)).toBeCloseTo(1 / 25, 9);
    expect(densityAt(g, 2, 13)).toBeCloseTo(1 / 25, 9);
    expect(densityAt(g, 7, 7)).toBe(0);
    expect(densityAt(g, -500, 0)).toBe(0);
  });

  it('la grille est calée sur le monde et garde une cellule de marge', () => {
    const pts = [{ x: 12, z: -7 }, { x: 31, z: 4 }];
    const g = aggregateDensity(pts, 2, { cell: 5, maxCols: 64, maxRows: 64 }, createDensityGrid());
    expect(Math.abs(g.ox % 5)).toBe(0);
    expect(Math.abs(g.oz % 5)).toBe(0);
    expect(g.ox).toBeLessThanOrEqual(12 - 5);
    expect(g.oz).toBeLessThanOrEqual(-7 - 5);
    expect(g.ox + g.cols * g.cell).toBeGreaterThanOrEqual(31 + 5);
    expect(g.oz + g.rows * g.cell).toBeGreaterThanOrEqual(4 + 5);
    // la première et la dernière rangée sont vides (marge pour le lissage)
    for (let c = 0; c < g.cols; c++) {
      expect(densityOf(g, c, 0)).toBe(0);
      expect(densityOf(g, c, g.rows - 1)).toBe(0);
    }
  });

  it('une foule trop étendue double la taille des cellules au lieu de déborder', () => {
    const pts = [{ x: 0, z: 0 }, { x: 990, z: 0 }, { x: 0, z: 400 }];
    const g = aggregateDensity(pts, 3, { cell: 5, maxCols: 64, maxRows: 64 }, createDensityGrid());
    expect(g.cell).toBe(20);
    expect(g.cols).toBeLessThanOrEqual(66);
    expect(g.total).toBe(3);
  });

  it('ne compte que les `count` premiers points et que le disque demandé', () => {
    const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 200, z: 0 }, { x: 3, z: 3 }];
    const all = aggregateDensity(pts, 3, { cell: 5, maxCols: 64, maxRows: 64 }, createDensityGrid());
    expect(all.total).toBe(3);
    const near = aggregateDensity(pts, 4, { cell: 5, maxCols: 64, maxRows: 64, cx: 0, cz: 0, radius: 50 }, createDensityGrid());
    expect(near.total).toBe(3); // le point à 200 m est ignoré
    expect(densityAt(near, 200, 0)).toBe(0);
  });

  it('grille vide sans personne ; la grille est réutilisée sans résidu', () => {
    const g = createDensityGrid();
    aggregateDensity([{ x: 0, z: 0 }, { x: 1, z: 1 }], 2, { cell: 5, maxCols: 64, maxRows: 64 }, g);
    expect(g.total).toBe(2);
    aggregateDensity([], 0, { cell: 5, maxCols: 64, maxRows: 64 }, g);
    expect(g.total).toBe(0);
    expect(g.cols).toBe(0);
    aggregateDensity([{ x: 100, z: 100 }], 1, { cell: 5, maxCols: 64, maxRows: 64 }, g);
    let sum = 0;
    for (let i = 0; i < g.cols * g.rows; i++) sum += g.counts[i]!;
    expect(sum).toBe(1);
  });

  it('couleur : la teinte suit la tension, l\'opacité suit la densité', () => {
    const px = new Uint8ClampedArray(12);
    densityColor(0.2, 0, px, 0);
    densityColor(0.2, 1, px, 4);
    densityColor(2, 0, px, 8);
    expect(px[1]).toBeGreaterThan(px[5]!); // calme : plus de vert que sous tension (rouge)
    expect(px[0]).toBe(255);
    expect(px[11]).toBeGreaterThan(px[3]!); // plus dense : plus opaque
    densityColor(0, 0.5, px, 0);
    expect(px[3]).toBe(0);
  });

  it('300 personnes : agrégation rapide', () => {
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < 300; i++) pts.push({ x: (i * 37) % 180, z: ((i * 91) % 23) - 11 });
    const g = createDensityGrid();
    const t0 = performance.now();
    for (let k = 0; k < 200; k++) aggregateDensity(pts, pts.length, { cell: 5, maxCols: 192, maxRows: 192 }, g);
    const ms = (performance.now() - t0) / 200;
    expect(g.total).toBe(300);
    expect(ms).toBeLessThan(2);
  });
});
