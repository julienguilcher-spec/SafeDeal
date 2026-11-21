import { describe, expect, it } from 'vitest';
import {
  FEED_ZOOMS, feedBudget, feedBufferSize, feedModeLabel, feedSize, feedSlowLevel, nextFeedMode, nextZoom, zoomFov,
} from '@/ui/drone/logic';
import { DroneFeedSystem } from '@/ui/drone';

describe('retour vidéo du drone — définition du canevas (netteté)', () => {
  it('écran Retina (×2) : un pixel rendu par pixel affiché, plus de tampon à ×1,5 étiré', () => {
    // constaté avant correction (Playwright, 1440 × 900 ×2) : fenêtre 318 × 178 CSS, tampon 480 × 270 → étiré de 33 %
    expect(feedBufferSize(320, 180, 2, 2)).toEqual({ width: 640, height: 360 });
    expect(feedBufferSize(560, 315, 2, 2)).toEqual({ width: 1120, height: 630 });
    expect(feedBufferSize(320, 180, 1, 2)).toEqual({ width: 320, height: 180 });
  });

  it('densité plafonnée, jamais sous ×1 ; densité invalide : ×1', () => {
    expect(feedBufferSize(320, 180, 3, 2)).toEqual({ width: 640, height: 360 });
    expect(feedBufferSize(320, 180, 2, 1)).toEqual({ width: 320, height: 180 });
    expect(feedBufferSize(320, 180, 2, 0.4)).toEqual({ width: 320, height: 180 });
    expect(feedBufferSize(320, 180, NaN, 2)).toEqual({ width: 320, height: 180 });
    expect(feedBufferSize(320, 180, 0, 2)).toEqual({ width: 320, height: 180 });
  });

  it('budget de pixels : la définition baisse dans les deux sens, format gardé', () => {
    const b = feedBufferSize(1416, 797, 2, 2, 1.3e6);
    expect(b.width * b.height).toBeLessThanOrEqual(1.3e6 * 1.01);
    expect(b.width / b.height).toBeCloseTo(1416 / 797, 2);
    expect(b.width).toBeGreaterThan(1416);          // toujours plus fin que ×1
    // sous le budget : intact
    expect(feedBufferSize(320, 180, 2, 2, 1.3e6)).toEqual({ width: 640, height: 360 });
    expect(feedBufferSize(0, 0, 2, 2).width).toBeGreaterThanOrEqual(2);
  });
});

describe('retour vidéo du drone — formats de fenêtre et zoom optique', () => {
  it('Maj + O : petite → agrandie → plein écran → petite', () => {
    expect(nextFeedMode('small')).toBe('large');
    expect(nextFeedMode('large')).toBe('full');
    expect(nextFeedMode('full')).toBe('small');
    expect(feedModeLabel('full')).toBe('Plein écran');
  });

  it('plein écran : la plus grande image 16:9 dans l’écran, marge de 12 px (Mac 13 pouces)', () => {
    const f = feedSize(1440, 900, 'full');
    expect(f.width).toBeLessThanOrEqual(1440 - 24);
    expect(f.height).toBeLessThanOrEqual(900 - 24);
    expect(f.width).toBeGreaterThan(1300);
    expect(f.width / f.height).toBeCloseTo(16 / 9, 1);
    const tall = feedSize(800, 1200, 'full');
    expect(tall.width).toBe(776);
    // compatibilité : booléen = petite / agrandie
    expect(feedSize(1440, 900, true)).toEqual(feedSize(1440, 900, 'large'));
    expect(feedSize(1440, 900, false)).toEqual({ width: 320, height: 180 });
  });

  it('Alt + O : paliers ×1, ×2, ×4, ×8 en boucle ; champ resserré, pas d’agrandissement au pixel', () => {
    expect(FEED_ZOOMS).toEqual([1, 2, 4, 8]);
    expect(nextZoom(1)).toBe(2);
    expect(nextZoom(8)).toBe(1);
    expect(nextZoom(1, -1)).toBe(8);
    expect(nextZoom(3)).toBe(1);
    expect(zoomFov(50, 1)).toBeCloseTo(50, 6);
    // tan(champ / 2) divisé par le zoom
    for (const z of [2, 4, 8]) {
      expect(Math.tan((zoomFov(50, z) * Math.PI) / 360)).toBeCloseTo(Math.tan((50 * Math.PI) / 360) / z, 9);
    }
    expect(zoomFov(50, 0)).toBeCloseTo(50, 6);
  });
});

describe('retour vidéo du drone — coût sur un portable', () => {
  it('palier de ralentissement avec hystérésis', () => {
    expect(feedSlowLevel(0, 16)).toBe(0);
    expect(feedSlowLevel(0, 26)).toBe(0);
    expect(feedSlowLevel(0, 30)).toBe(1);
    expect(feedSlowLevel(1, 24)).toBe(1);      // pas de va-et-vient
    expect(feedSlowLevel(1, 20)).toBe(0);
    expect(feedSlowLevel(1, 50)).toBe(2);
    expect(feedSlowLevel(2, 40)).toBe(2);
    expect(feedSlowLevel(2, 30)).toBe(1);
    expect(feedSlowLevel(2, 15)).toBe(0);
    expect(feedSlowLevel(0, NaN)).toBe(0);
  });

  it('budget : définition et cadence réduites quand le jeu ralentit', () => {
    const fluide = feedBudget('moyen', 0);
    const lent = feedBudget('moyen', 1);
    const tresLent = feedBudget('moyen', 2);
    expect(fluide.fps).toBe(12);
    expect(lent.pixels).toBeLessThan(fluide.pixels);
    expect(lent.fps).toBeLessThan(fluide.fps);
    expect(tresLent.pixels).toBe(Math.round(fluide.pixels / 2));
    expect(tresLent.fps).toBe(6);
    expect(feedBudget('bas', 0).pixels).toBeLessThan(fluide.pixels);
    expect(feedBudget('inconnu', 0)).toEqual(fluide);
    // la petite fenêtre Retina (640 × 360) tient dans tous les budgets fluides
    expect(feedBudget('bas', 0).pixels).toBeGreaterThan(320 * 180);
    expect(feedBudget('moyen', 2).pixels).toBeGreaterThan(640 * 360);
  });
});

describe('retour vidéo du drone — touche O sans souris (service, sans DOM)', () => {
  function fakeCtx() {
    const drone = { id: 7, kind: 'drone', faction: 'police', dormant: false, state: 'ok', def: { flying: true } };
    const services = new Map<string, unknown>();
    return {
      headless: true,
      provide: (k: string, v: unknown) => services.set(k, v),
      service: (k: string) => services.get(k),
      vehicles: { list: [drone], get: (id: number) => (id === 7 ? drone : undefined) },
      people: { list: [] },
      ui: { notify: () => {} },
      events: { on: () => () => {} },
    };
  }

  it('O ouvre / ferme, Maj + O change le format (ouvre agrandie), Alt + O change le zoom', () => {
    const sys = new DroneFeedSystem();
    const ctx = fakeCtx();
    sys.provide(ctx as never);
    sys.init(ctx as never);
    sys.onFeedKey(false, false);
    expect(sys.open).toBe(true);
    expect(sys.mode).toBe('small');
    sys.onFeedKey(true, false);
    expect(sys.mode).toBe('large');
    expect(sys.large).toBe(true);
    sys.onFeedKey(true, false);
    expect(sys.mode).toBe('full');
    sys.onFeedKey(true, false);
    expect(sys.mode).toBe('small');
    sys.onFeedKey(false, true);
    expect(sys.zoom).toBe(2);
    sys.onFeedKey(false, true);
    sys.onFeedKey(false, true);
    expect(sys.zoom).toBe(8);
    sys.onFeedKey(false, true);
    expect(sys.zoom).toBe(1);
    sys.onFeedKey(false, false);
    expect(sys.open).toBe(false);
    // fermée : Maj + O ouvre directement la fenêtre agrandie
    sys.onFeedKey(true, false);
    expect(sys.open).toBe(true);
    expect(sys.mode).toBe('large');
    sys.setLarge(false);
    expect(sys.mode).toBe('small');
  });
});
