// Étiquettes de la carte :
//  - suivi des ordres : les unités qui ont le même ordre au même endroit partagent une étiquette (« 1A 1B 1C · BARRENT
//    · ~2 min ») ; les étiquettes restantes ne se chevauchent jamais (décalages 0, −16, +16, −32 px ; celles des unités
//    arrivées cèdent la place d'abord) — cas des captures de l'inventaire (« 4B · EN AVANT » ×3, deux lignes côte à
//    côte « 2A · LIGNE » / « 2B · LIGNE ») ;
//  - noms de lieux : écrits à leur taille dès la première image (ils sortaient en corps 100 tant que la largeur du
//    texte n'était pas en cache — « ourse du Travail » géant à la première ouverture de la carte).
import { describe, expect, it } from 'vitest';

import type { PlaceInfo, WorldQuery } from '@/core/contracts';
import { LabelPlacer, drawPlaceLabels } from '@/ui/maps/basemap-labels';
import { LABEL_HEIGHT, layoutOrderLabels } from '@/ui/maps/overlay-units';
import type { OrderLabelItem, PlacedLabel } from '@/ui/maps/overlay-units';

/** Largeur approchée d'un texte en gras 9,5 px. */
const measure = (s: string): number => s.length * 5.6;

function item(code: string, type: string, x: number, y: number, extra: Partial<OrderLabelItem> = {}): OrderLabelItem {
  return { code, type, targetId: 0, x, y, arrived: false, dist: 145, eta: 80, color: '#58a6ff', ...extra };
}

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

function noOverlap(list: readonly PlacedLabel[]): void {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i]!, list[j]!), `${list[i]!.text} / ${list[j]!.text}`).toBe(false);
  }
}

describe('étiquettes des ordres en cours — regroupement et chevauchements', () => {
  it('trois unités, même ordre, même rue : une seule étiquette au pluriel', () => {
    const out = layoutOrderLabels([
      item('1A', 'couper_circulation', 400, 300, { eta: 70 }),
      item('1B', 'couper_circulation', 412, 304, { eta: 115 }),
      item('1C', 'couper_circulation', 396, 296, { eta: 90 }),
    ], measure);
    expect(out.length).toBe(1);
    expect(out[0]!.text).toBe('1A 1B 1C · BARRENT · ~2 min');
    expect(out[0]!.codes).toEqual(['1A', '1B', '1C']);
  });

  it('« 4B · EN AVANT » ×3 de l’inventaire : trois fois le même point → une étiquette, jamais le type brut', () => {
    const out = layoutOrderLabels([
      item('4B', 'avancer', 500, 200), item('4B', 'avancer', 500, 200), item('4B', 'avancer', 501, 199),
    ], measure);
    expect(out.length).toBe(1);
    expect(out[0]!.text).toBe('4B 4B 4B · AVANCENT · ~1 min');
    const raw = layoutOrderLabels([item('1C', 'couper_circulation', 10, 10, { dist: 275, eta: 160 })], measure);
    expect(raw[0]!.text).toBe('1C · BARRE · 275 m · ~3 min');
    expect(raw[0]!.text).not.toMatch(/COUPER_CIRCULATION|_/);
    // ordre inconnu : l'étiquette garde l'unité et le suivi, sans mot inventé
    const unknown = layoutOrderLabels([item('2B', 'ordre_inconnu', 10, 10)], measure);
    expect(unknown[0]!.text).toBe('2B · 145 m · ~1 min');
  });

  it('deux lignes côte à côte (« 2A · LIGNE » / « 2B · LIGNE ») : deux étiquettes qui ne se chevauchent pas', () => {
    const items = [
      item('2A', 'ligne', 300, 250, { dist: 120 }),
      item('2B', 'ligne', 350, 252, { dist: 130 }),
    ];
    const out = layoutOrderLabels(items, measure);
    expect(out.length).toBe(2);
    noOverlap(out);
    expect(out.map((l) => l.text)).toEqual(['2A · EN LIGNE · 120 m · ~1 min', '2B · EN LIGNE · 130 m · ~1 min']);
    // la seconde est décalée d'un cran (−16 px) au lieu d'écrire par-dessus la première
    expect(out[1]!.y).toBe(252 - 16);
  });

  it('barrage avec passants admis : son étiquette le dit ; arrivée : « EN PLACE »', () => {
    const out = layoutOrderLabels([
      item('3A', 'couper_circulation', 100, 100, { targetId: -2, arrived: true }),
      item('3B', 'couper_circulation', 104, 100, { targetId: -2, arrived: true }),
    ], measure);
    expect(out.map((l) => l.text)).toEqual(['3A 3B · BARRENT (PASSANTS) · EN PLACE']);
  });

  it('place comptée : les étiquettes des unités arrivées cèdent la place les premières', () => {
    // quatre ordres différents au même endroit occupent les quatre décalages ; la cinquième (arrivée) n'a plus de place
    const types = ['ligne', 'avancer', 'charge', 'repli'];
    const items = types.map((t, i) => item(`${i + 1}A`, t, 600, 400));
    items.unshift(item('9C', 'filtrer', 600, 400, { arrived: true }));
    const out = layoutOrderLabels(items, measure);
    noOverlap(out);
    expect(out.length).toBe(4);
    expect(out.some((l) => l.codes.includes('9C'))).toBe(false);
    expect(out.map((l) => l.y).sort((a, b) => a - b)).toEqual([368, 384, 400, 416]);
    for (const l of out) expect(l.h).toBe(LABEL_HEIGHT);
  });

  it('beaucoup d’unités autour d’une place : aucune paire d’étiquettes dessinées ne se chevauche', () => {
    const items: OrderLabelItem[] = [];
    const types = ['couper_circulation', 'filtrer', 'ligne', 'avancer', 'colonne'];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      items.push(item(`${(i % 5) + 1}${'ABC'[i % 3]}`, types[i % types.length]!, 400 + Math.cos(a) * 60, 300 + Math.sin(a) * 40, { arrived: i % 4 === 0 }));
    }
    const out = layoutOrderLabels(items, measure);
    expect(out.length).toBeGreaterThan(3);
    noOverlap(out);
  });
});

// ───────────────────────────── noms de lieux à la première image ─────────────────────────────

/** Contexte 2D minimal qui note la police de chaque texte écrit. */
function recorder(): { g: CanvasRenderingContext2D; written: { text: string; font: string }[] } {
  const written: { text: string; font: string }[] = [];
  const state = { font: '10px sans-serif' };
  const g = {
    get font() { return state.font; },
    set font(f: string) { state.font = f; },
    textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, strokeStyle: '', fillStyle: '', lineJoin: 'miter',
    measureText: (s: string) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: s.length * (m ? Number(m[1]) : 10) * 0.55 };
    },
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, beginPath: () => {}, moveTo: () => {},
    lineTo: () => {}, closePath: () => {}, fill: () => {}, strokeText: () => {},
    fillText: (text: string) => written.push({ text, font: state.font }),
  };
  return { g: g as unknown as CanvasRenderingContext2D, written };
}

describe('fond de plan — noms de lieux à leur taille dès la première image', () => {
  it('le premier dessin (largeurs pas encore en cache) écrit chaque nom à son corps, jamais en corps 100', () => {
    const places: PlaceInfo[] = [
      { name: 'Bourse du Travail (essai)', kind: 'square', x: 0, z: 0 } as PlaceInfo,
      { name: 'Square du Temple (essai)', kind: 'garden', x: 200, z: 150 } as PlaceInfo,
      { name: 'Hôtel de Ville (essai)', kind: 'monument', x: -220, z: -160 } as PlaceInfo,
    ];
    const worldQ = { places, landmarks: [{ name: 'Colonne de Juillet (essai)', x: 100, z: -200 }] } as unknown as WorldQuery;
    for (const pr of [1, 2]) {
      const { g, written } = recorder();
      const placer = new LabelPlacer();
      placer.reset(1600 * pr, 1200 * pr, pr);
      // 1 m/px, vue de 1 600 × 1 200 px centrée sur l'origine
      drawPlaceLabels(g, worldQ, placer, -800, -600, 800, 600, pr, 800 * pr, 600 * pr, pr, 1, 0);
      expect(written.length).toBe(4);
      for (const w of written) {
        expect(w.font, w.text).not.toMatch(/100px/);
        const size = Number(/(\d+(?:\.\d+)?)px/.exec(w.font)![1]);
        expect(size, w.text).toBeLessThanOrEqual(12 * pr);
        expect(size, w.text).toBeGreaterThanOrEqual(10 * pr);
      }
      // les jardins restent en italique
      expect(written.find((w) => w.text.startsWith('Square'))!.font).toMatch(/^italic /);
    }
  });
});
