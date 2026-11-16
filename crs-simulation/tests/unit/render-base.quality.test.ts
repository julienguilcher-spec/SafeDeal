import { describe, expect, it } from 'vitest';
import {
  QUALITY_LEVELS, QUALITY_PRESETS, baseDrawDistance, effectivePixelRatio, presetFor, shadowsEnabled,
} from '@/render/base/quality';

describe('rendu de base — préréglages de qualité', () => {
  it('définit les quatre niveaux du contrat', () => {
    expect([...QUALITY_LEVELS]).toEqual(['bas', 'moyen', 'haut', 'ultra']);
    for (const level of QUALITY_LEVELS) expect(QUALITY_PRESETS[level].level).toBe(level);
    expect(presetFor('haut')).toBe(QUALITY_PRESETS.haut);
    // niveau inconnu : on retombe sur « moyen »
    expect(presetFor('inconnu')).toBe(QUALITY_PRESETS.moyen);
    expect(presetFor(undefined)).toBe(QUALITY_PRESETS.moyen);
  });

  it('« bas » convient à un téléphone : ni ombre portée, ni anticrénelage, densité de pixels plafonnée', () => {
    const bas = QUALITY_PRESETS.bas;
    expect(bas.shadowMapSize).toBe(0);
    expect(bas.antialias).toBe(false);
    expect(bas.pixelRatioCap).toBeLessThanOrEqual(1.5);
    expect(bas.rainCount).toBeLessThanOrEqual(800);
    expect(bas.pointLights).toBeLessThanOrEqual(2);
    expect(bas.maxDrawDistance).toBeLessThanOrEqual(300);
    expect(bas.cloudOctaves).toBeLessThanOrEqual(3);
    expect(bas.cloudShading).toBe(false);
    expect(bas.screenBlur).toBe(false);
    // un téléphone à densité 3 avec l'échelle de rendu par défaut de « bas » (0,7) : ≈ 1 pixel de rendu par pixel CSS
    const pr = effectivePixelRatio(3, bas, 0.7);
    expect(pr).toBeCloseTo(1.05, 5);
    // 844 × 390 points → moins de 400 000 pixels à calculer
    expect(844 * pr * 390 * pr).toBeLessThan(400000);
  });

  it('chaque niveau coûte au moins autant que le précédent', () => {
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      const a = QUALITY_PRESETS[QUALITY_LEVELS[i - 1]!];
      const b = QUALITY_PRESETS[QUALITY_LEVELS[i]!];
      expect(b.shadowMapSize).toBeGreaterThanOrEqual(a.shadowMapSize);
      expect(b.shadowDistance).toBeGreaterThanOrEqual(a.shadowDistance);
      expect(b.maxDrawDistance).toBeGreaterThan(a.maxDrawDistance);
      expect(b.rainCount).toBeGreaterThan(a.rainCount);
      expect(b.pointLights).toBeGreaterThan(a.pointLights);
      expect(b.spotLights).toBeGreaterThanOrEqual(a.spotLights);
      expect(b.pixelRatioCap).toBeGreaterThanOrEqual(a.pixelRatioCap);
      expect(b.cloudOctaves).toBeGreaterThanOrEqual(a.cloudOctaves);
    }
    // tailles d'ombre : puissances de deux
    for (const level of QUALITY_LEVELS) {
      const s = QUALITY_PRESETS[level].shadowMapSize;
      if (s > 0) expect(Math.log2(s) % 1).toBe(0);
    }
    expect(QUALITY_PRESETS.moyen.antialias).toBe(true);
    expect(QUALITY_PRESETS.ultra.shadowMapSize).toBe(4096);
  });

  it('densité de pixels : celle de l’écran, plafonnée, multipliée par l’échelle de rendu', () => {
    const haut = QUALITY_PRESETS.haut;
    expect(effectivePixelRatio(1, haut, 1)).toBe(1);
    expect(effectivePixelRatio(3, haut, 1)).toBe(2);
    expect(effectivePixelRatio(2, haut, 0.5)).toBe(1);
    // bornes : échelle 0,5 à 1, densité invalide ramenée à 1, jamais sous 0,5
    expect(effectivePixelRatio(2, haut, 0.1)).toBe(1);
    expect(effectivePixelRatio(2, haut, 4)).toBe(2);
    expect(effectivePixelRatio(NaN, haut, 1)).toBe(1);
    expect(effectivePixelRatio(0.5, haut, 0.5)).toBe(0.5);
  });

  it('distance d’affichage : le réglage du joueur, borné par le préréglage', () => {
    expect(baseDrawDistance({ drawDistance: 500 }, QUALITY_PRESETS.haut)).toBe(500);
    expect(baseDrawDistance({ drawDistance: 1500 }, QUALITY_PRESETS.bas)).toBe(300);
    expect(baseDrawDistance({ drawDistance: 20 }, QUALITY_PRESETS.haut)).toBe(100);
    expect(baseDrawDistance({ drawDistance: NaN }, QUALITY_PRESETS.moyen)).toBe(500);
  });

  it('ombres : il faut le réglage ET un préréglage qui en a', () => {
    expect(shadowsEnabled({ shadows: true }, QUALITY_PRESETS.haut)).toBe(true);
    expect(shadowsEnabled({ shadows: false }, QUALITY_PRESETS.haut)).toBe(false);
    expect(shadowsEnabled({ shadows: true }, QUALITY_PRESETS.bas)).toBe(false);
  });
});
