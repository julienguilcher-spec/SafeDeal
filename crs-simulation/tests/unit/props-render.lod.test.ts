// Rendu du décor — sélection du niveau de détail.
import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE, LOD_CONFIGS, LOD_HYSTERESIS, chunkCoord, chunkDistance, chunkKey, chunkLevel, lodConfig, objectLod, shopLod,
} from '@/render/props/mapping';
import type { Quality } from '@/render/props/mapping';

const QUALITIES: Quality[] = ['bas', 'moyen', 'haut', 'ultra'];

describe('rendu du décor — niveau d\'un morceau', () => {
  it('le niveau croît avec la distance, puis le morceau est masqué', () => {
    for (const q of QUALITIES) {
      const cfg = LOD_CONFIGS[q];
      let prev = -2;
      for (let d = 0; d < cfg.cap; d += 5) {
        const l = chunkLevel(d, d, cfg, -1);
        expect(l).toBeGreaterThanOrEqual(prev);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThanOrEqual(3);
        prev = l;
      }
      expect(chunkLevel(cfg.cap + 1, cfg.cap + 1, cfg, -1)).toBe(-1);
    }
  });

  it('seuils exacts en qualité haute', () => {
    const cfg = LOD_CONFIGS.haut;
    expect(chunkLevel(0, 0, cfg, -1)).toBe(0);
    expect(chunkLevel(cfg.d0 - 1, cfg.d0 - 1, cfg, -1)).toBe(0);
    expect(chunkLevel(cfg.d0 + 1, cfg.d0 + 1, cfg, -1)).toBe(1);
    expect(chunkLevel(cfg.d1 + 1, cfg.d1 + 1, cfg, -1)).toBe(2);
    expect(chunkLevel(cfg.d2 + 1, cfg.d2 + 1, cfg, -1)).toBe(3);
  });

  it('la qualité basse n\'utilise jamais les modèles détaillés', () => {
    expect(chunkLevel(0, 0, LOD_CONFIGS.bas, -1)).toBe(1);
    expect(LOD_CONFIGS.bas.shadowLevel).toBe(-1);
    expect(LOD_CONFIGS.bas.atlas).toBeLessThan(LOD_CONFIGS.haut.atlas);
  });

  it('une meilleure qualité ne donne jamais moins de détail à distance égale', () => {
    for (let d = 0; d < 800; d += 7) {
      let prev = 99;
      for (const q of QUALITIES) {
        const l = chunkLevel(d, d, LOD_CONFIGS[q], -1);
        const rank = l < 0 ? 4 : l;
        expect(rank, `${q} à ${d} m`).toBeLessThanOrEqual(prev);
        prev = rank;
      }
    }
  });

  it('hystérésis : un morceau garde son niveau détaillé dans la marge, mais gagne en détail sans délai', () => {
    const cfg = LOD_CONFIGS.haut;
    const just = cfg.d0 * 1.05;
    expect(chunkLevel(just, just, cfg, -1)).toBe(1);
    expect(chunkLevel(just, just, cfg, 0)).toBe(0);
    const beyond = cfg.d0 * LOD_HYSTERESIS + 0.5;
    expect(chunkLevel(beyond, beyond, cfg, 0)).toBe(1);
    // en se rapprochant : bascule immédiate
    expect(chunkLevel(cfg.d0 - 0.5, cfg.d0 - 0.5, cfg, 1)).toBe(0);
    // limite d'affichage : même marge
    expect(chunkLevel(cfg.cap * 1.05, cfg.cap * 1.05, cfg, 3)).toBe(3);
    expect(chunkLevel(cfg.cap * 1.05, cfg.cap * 1.05, cfg, -1)).toBe(-1);
    expect(chunkLevel(cfg.cap * LOD_HYSTERESIS + 1, cfg.cap * LOD_HYSTERESIS + 1, cfg, 3)).toBe(-1);
  });

  it('caméra haute : visible si elle est au-dessus du morceau, mais en version lointaine', () => {
    const cfg = LOD_CONFIGS.haut;
    expect(chunkLevel(0, 500, cfg, -1)).toBe(3);
    expect(chunkLevel(0, 200, cfg, -1)).toBe(2);
  });

  it('la distance d\'affichage du rendu de base borne celle du module', () => {
    const cfg = LOD_CONFIGS.ultra;
    expect(chunkLevel(400, 400, cfg, -1, 300)).toBe(-1);
    expect(chunkLevel(250, 250, cfg, -1, 300)).toBeGreaterThanOrEqual(0);
    expect(chunkLevel(NaN, NaN, cfg, -1)).toBe(-1);
  });

  it('une qualité inconnue prend le réglage moyen', () => {
    expect(lodConfig('nimporte')).toBe(LOD_CONFIGS.moyen);
    expect(lodConfig('ultra')).toBe(LOD_CONFIGS.ultra);
  });
});

describe('rendu du décor — niveau d\'un objet dans son morceau', () => {
  it('près : tout est dessiné ; loin : les petits objets disparaissent, puis les moyens', () => {
    for (const size of [0, 1, 2]) {
      expect(objectLod(0, size)).toBe(0);
      expect(objectLod(1, size)).toBe(1);
    }
    expect(objectLod(2, 0)).toBe(-1);
    expect(objectLod(2, 1)).toBe(2);
    expect(objectLod(2, 2)).toBe(2);
    expect(objectLod(3, 0)).toBe(-1);
    expect(objectLod(3, 1)).toBe(-1);
    expect(objectLod(3, 2)).toBe(2);
    expect(objectLod(-1, 2)).toBe(-1);
  });

  it('un objet endormi n\'est dessiné qu\'en version lointaine', () => {
    expect(objectLod(0, 2, true)).toBe(2);
    expect(objectLod(1, 1, true)).toBe(2);
    expect(objectLod(0, 0, true)).toBe(-1);
    expect(shopLod(0, true)).toBe(2);
    expect(shopLod(0, false)).toBe(0);
    expect(shopLod(3, true)).toBe(3);
    expect(shopLod(-1)).toBe(-1);
  });
});

describe('rendu du décor — découpage en morceaux', () => {
  it('coordonnées et clés', () => {
    expect(CHUNK_SIZE).toBe(128);
    expect(chunkCoord(0)).toBe(0);
    expect(chunkCoord(127.9)).toBe(0);
    expect(chunkCoord(128)).toBe(1);
    expect(chunkCoord(-0.1)).toBe(-1);
    const keys = new Set<number>();
    for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) keys.add(chunkKey(x, z));
    expect(keys.size).toBe(81 * 81);
  });

  it('distance d\'un point au carré d\'un morceau', () => {
    expect(chunkDistance(10, 10, 0, 0)).toBe(0);
    expect(chunkDistance(-30, 64, 0, 0)).toBeCloseTo(30, 6);
    expect(chunkDistance(128 + 30, 128 + 40, 0, 0)).toBeCloseTo(50, 6);
    expect(chunkDistance(300, 64, 1, 0)).toBeCloseTo(44, 6);
  });
});
