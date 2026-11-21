import { describe, expect, it } from 'vitest';
import {
  GAS_SIGMA, GAS_VISIBLE_MIN, PUFF_ALPHA_MAX, SMOKE_SIGMA, cloudHeight, gasAlbedo, gasOpacity, puffAlpha, shakeFor,
  shakeSeconds, smokeOpacity, smokeShare,
} from '@/render/fx/density';

describe('effets — conversion concentration → densité visuelle', () => {
  it('air pur et concentration sous le seuil : rien à dessiner', () => {
    expect(gasOpacity(0, 2)).toBe(0);
    expect(gasOpacity(GAS_VISIBLE_MIN, 2)).toBe(0);
    expect(gasOpacity(-1, 2)).toBe(0);
    expect(gasOpacity(0.5, 0)).toBe(0);
    expect(smokeOpacity(0, 2)).toBe(0);
    expect(puffAlpha(0, 0, 2)).toBe(0);
    expect(gasOpacity(Number.NaN, 2)).toBe(0);
  });

  it('croissante avec la concentration et avec l\'épaisseur traversée, toujours dans [0, 1[', () => {
    let prev = 0;
    for (let c = 0.02; c <= 2.5; c += 0.02) {
      const a = gasOpacity(c, 2);
      expect(a).toBeGreaterThan(prev);
      expect(a).toBeLessThan(1);
      prev = a;
    }
    prev = 0;
    for (let L = 0.5; L <= 40; L += 0.5) {
      const a = smokeOpacity(0.4, L);
      expect(a).toBeGreaterThan(prev);
      prev = a;
    }
  });

  it('loi de Beer-Lambert : deux bouffées de 2 m masquent autant qu\'une de 4 m (indépendant du niveau de détail)', () => {
    for (const c of [0.05, 0.1, 0.3, 0.7, 1.2]) {
      const two = 1 - (1 - gasOpacity(c, 2)) ** 2;
      expect(two).toBeCloseTo(gasOpacity(c, 4), 10);
      const four = 1 - (1 - smokeOpacity(c, 2)) ** 4;
      expect(four).toBeCloseTo(smokeOpacity(c, 8), 10);
    }
  });

  it('repères de lisibilité : bord du nuage ténu, abords d\'un palet presque opaques sur 10 m', () => {
    // 0,1 = bord du nuage : un voile, pas un mur
    const edge10 = gasOpacity(0.1, 10);
    expect(edge10).toBeGreaterThan(0.3);
    expect(edge10).toBeLessThan(0.7);
    // 0,05 = à peine perceptible sur une cellule
    expect(gasOpacity(0.05, 2)).toBeLessThan(0.08);
    // 0,5 près d'un palet : 10 m de nuage cachent presque tout
    expect(gasOpacity(0.5, 10)).toBeGreaterThan(0.95);
    // fumée d'incendie : épaisse dès 4 m ; les deux coefficients restent du même ordre
    expect(smokeOpacity(0.5, 4)).toBeGreaterThan(0.6);
    expect(SMOKE_SIGMA / GAS_SIGMA).toBeGreaterThan(0.5);
    expect(SMOKE_SIGMA / GAS_SIGMA).toBeLessThan(2);
  });

  it('une bouffée seule est plafonnée ; gaz et fumée se combinent par transmittance', () => {
    expect(puffAlpha(2.5, 2.5, 16)).toBe(PUFF_ALPHA_MAX);
    const g = gasOpacity(0.2, 2);
    const s = smokeOpacity(0.3, 2);
    expect(puffAlpha(0.2, 0.3, 2)).toBeCloseTo(1 - (1 - g) * (1 - s), 10);
    expect(puffAlpha(0.2, 0, 2)).toBeCloseTo(g, 10);
    expect(puffAlpha(0, 0.3, 2)).toBeCloseTo(s, 10);
  });

  it('part de la fumée dans la couleur', () => {
    expect(smokeShare(0.5, 0)).toBe(0);
    expect(smokeShare(0, 0.5)).toBe(1);
    expect(smokeShare(0, 0)).toBe(0);
    const k = smokeShare(0.3, 0.3);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
    expect(smokeShare(0.3, 0.6)).toBeGreaterThan(k);
  });

  it('hauteur du nuage : 2 m pour un voile, 5 m pour un nuage dense (dossier de réalisme : 3 à 5 m)', () => {
    expect(cloudHeight(0)).toBe(2);
    expect(cloudHeight(0.6)).toBe(5);
    expect(cloudHeight(3)).toBe(5);
    let prev = 0;
    for (let c = 0; c <= 0.6; c += 0.05) {
      const h = cloudHeight(c);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
    expect(cloudHeight(0.25)).toBeGreaterThan(3);
  });

  it('le gaz grisonne en s\'épaississant, sans jamais devenir sombre', () => {
    const thin = [0, 0, 0];
    const dense = [0, 0, 0];
    gasAlbedo(0.02, thin);
    gasAlbedo(1.5, dense);
    for (let k = 0; k < 3; k++) {
      expect(dense[k]!).toBeLessThan(thin[k]!);
      expect(dense[k]!).toBeGreaterThan(0.45);
      expect(thin[k]!).toBeLessThan(0.9);
    }
  });
});

describe('effets — secousse de caméra', () => {
  it('décroît avec la distance et s\'annule hors de portée', () => {
    for (const kind of ['vehicule', 'gm2l', 'desencerclement', 'mortier', 'molotov', 'grenade_lacrymo_56', 'inconnu']) {
      let prev = Infinity;
      for (let d = 0; d <= 100; d += 2) {
        const a = shakeFor(kind, 5, d);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(prev);
        prev = a;
      }
      expect(shakeFor(kind, 5, 500)).toBe(0);
    }
  });

  it('hiérarchie des engins : véhicule > assourdissante > désencerclement > mortier > ouverture d\'une lacrymogène', () => {
    const at = (k: string): number => shakeFor(k, 5, 4);
    expect(at('vehicule')).toBeGreaterThan(at('gm2l'));
    expect(at('gm2l')).toBeGreaterThan(at('desencerclement'));
    expect(at('desencerclement')).toBeGreaterThan(at('mortier'));
    expect(at('mortier')).toBeGreaterThan(at('grenade_lacrymo_main'));
    expect(shakeFor('fusee_rouge', 0, 0)).toBe(0);
    // loin d'une assourdissante, rien ; tout près, une vraie secousse
    expect(shakeFor('gm2l', 10, 60)).toBe(0);
    expect(shakeFor('gm2l', 10, 3)).toBeGreaterThan(0.5);
  });

  it('durée proportionnée à l\'amplitude', () => {
    expect(shakeSeconds(0)).toBe(0);
    expect(shakeSeconds(0.1)).toBeGreaterThan(0.15);
    expect(shakeSeconds(1)).toBeLessThan(1);
    expect(shakeSeconds(1)).toBeGreaterThan(shakeSeconds(0.2));
  });
});
