// Carte 2D (service world.map2d) : passage monde ↔ écran ; réglages de qualité.
import { describe, expect, it } from 'vitest';
import { CITY_QUALITY, cityQuality } from '../../src/world/view/quality';
import { MAP_NORTH_UP, Map2d } from '../../src/world/view/map2d';

describe('ville — carte 2D, repères', () => {
  const map = new Map2d(() => null);
  const out = { x: 0, y: 0 };
  const back = { x: 0, z: 0 };

  it('nord en haut : l\'est est à droite, le sud en bas, à l\'échelle demandée', () => {
    map.worldToScreen(100, 50, 100, 50, 2, MAP_NORTH_UP, 400, 300, out);
    expect(out.x).toBeCloseTo(200);
    expect(out.y).toBeCloseTo(150);
    map.worldToScreen(140, 50, 100, 50, 2, MAP_NORTH_UP, 400, 300, out);
    expect(out.x).toBeCloseTo(220); // 40 m à l'est = 20 px à droite
    expect(out.y).toBeCloseTo(150);
    map.worldToScreen(100, 90, 100, 50, 2, MAP_NORTH_UP, 400, 300, out);
    expect(out.x).toBeCloseTo(200);
    expect(out.y).toBeCloseTo(170); // 40 m au sud = 20 px vers le bas
  });

  it('carte orientée selon le cap : ce qui est devant le joueur est en haut, sa droite à droite', () => {
    // cap 0 : le joueur regarde le sud (+z) ; sa droite est l'ouest (−x)
    map.worldToScreen(0, 30, 0, 0, 1, 0, 200, 200, out);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(70);
    map.worldToScreen(-30, 0, 0, 0, 1, 0, 200, 200, out);
    expect(out.x).toBeCloseTo(130);
    expect(out.y).toBeCloseTo(100);
    // cap π/2 : le joueur regarde l'est (+x) ; sa droite est le sud (+z)
    map.worldToScreen(30, 0, 0, 0, 1, Math.PI / 2, 200, 200, out);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(70);
    map.worldToScreen(0, 30, 0, 0, 1, Math.PI / 2, 200, 200, out);
    expect(out.x).toBeCloseTo(130);
    expect(out.y).toBeCloseTo(100);
  });

  it('écran → monde est l\'inverse de monde → écran, pour tout cap', () => {
    for (const rot of [MAP_NORTH_UP, 0, 0.7, -2.1, 4.4]) {
      map.worldToScreen(-1234.5, 678.25, -1000, 500, 3.5, rot, 640, 360, out);
      map.screenToWorld(out.x, out.y, -1000, 500, 3.5, rot, 640, 360, back);
      expect(back.x).toBeCloseTo(-1234.5, 6);
      expect(back.z).toBeCloseTo(678.25, 6);
    }
  });

  it('un cap non défini vaut « nord en haut »', () => {
    map.worldToScreen(10, 0, 0, 0, 1, Number.NaN, 100, 100, out);
    expect(out.x).toBeCloseTo(60);
    expect(out.y).toBeCloseTo(50);
  });
});

describe('ville — réglages de qualité', () => {
  it('le budget de construction par image tient dans 8 ms, 5 ms en qualité moyenne', () => {
    expect(CITY_QUALITY.moyen.budgetMs).toBe(5);
    for (const q of Object.values(CITY_QUALITY)) expect(q.budgetMs).toBeLessThanOrEqual(8);
  });

  it('la finesse croît avec la qualité', () => {
    const order = [CITY_QUALITY.bas, CITY_QUALITY.moyen, CITY_QUALITY.haut, CITY_QUALITY.ultra];
    for (let i = 1; i < order.length; i++) {
      expect(order[i].rasterSize).toBeGreaterThanOrEqual(order[i - 1].rasterSize);
      expect(order[i].detailRadius).toBeGreaterThan(order[i - 1].detailRadius);
      expect(order[i].fadeFar).toBeGreaterThan(order[i - 1].fadeFar);
      expect(order[i].fadeFar).toBeLessThanOrEqual(order[i].detailRadius);
    }
    expect(CITY_QUALITY.bas.lambert).toBe(true);
    expect(CITY_QUALITY.haut.lambert).toBe(false);
  });

  it('un niveau inconnu retombe sur la qualité moyenne', () => {
    expect(cityQuality('inconnu' as never)).toBe(CITY_QUALITY.moyen);
  });
});
