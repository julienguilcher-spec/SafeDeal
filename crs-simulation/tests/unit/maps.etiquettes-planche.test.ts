// Étiquettes de la carte de commandement posées ensemble, par priorité (F1 de la passe de lisibilité, captures
// commande-S0/S1 et commande-tel-S1) :
//  - quatre unités au même endroit (« 19/19 », « 26/26 », « M1 », « MIS » empilés, illisibles) : une pile, UNE étiquette
//    « MISTRAL · 4 unités · 64 », dépliée quand l'une d'elles est sélectionnée ;
//  - la bulle du repère visé passe avant tout, puis l'aperçu, les ordres en cours, les unités ; aucun texte n'en
//    recouvre un autre ; un nom de monument du fond de plan (« Obélisque de Louxor ») est évité quand c'est possible.
import { describe, expect, it } from 'vitest';

import { LabelBoard, placeLabels } from '@/ui/maps/labelLayout';
import type { LabelSlot, PlacedSlot } from '@/ui/maps/labelLayout';
import { commonName, drawOrders, drawUnits, stackLabel } from '@/ui/maps/overlay-units';
import type { UnitLayerOptions } from '@/ui/maps/overlay-units';
import type { MapScene } from '@/ui/maps/scene';
import { MapTransform } from '@/ui/maps/transform';
import type { MapUnit } from '@/ui/maps/units';

/** Contexte 2D factice : enregistre les textes écrits (boîte approchée), mesure 5,6 px par caractère. */
function fakeCanvas(): { g: CanvasRenderingContext2D; texts: { s: string; x0: number; y0: number; x1: number; y1: number }[] } {
  const texts: { s: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic' };
  let tx = 0, ty = 0;
  const size = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  const g = new Proxy({}, {
    get(_t, k: string) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * size() * 0.56 });
      if (k === 'translate') return (x: number, y: number) => { tx += x; ty += y; };
      if (k === 'save' || k === 'restore') return () => { if (k === 'restore') { tx = 0; ty = 0; } };
      if (k === 'fillText') {
        return (s: string, x: number, y: number) => {
          const w = s.length * size() * 0.56, h = size();
          const ax = x + tx, ay = y + ty;
          const x0 = state.textAlign === 'center' ? ax - w / 2 : state.textAlign === 'left' || state.textAlign === 'start' ? ax : ax - w;
          const y0 = state.textBaseline === 'middle' ? ay - h / 2 : state.textBaseline === 'top' ? ay : ay - h;
          texts.push({ s, x0, y0, x1: x0 + w, y1: y0 + h });
        };
      }
      if (k in state) return state[k];
      return () => undefined;
    },
    set(_t, k: string, v) { state[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, texts };
}

function unit(key: number, name: string, code: string, symbol: MapUnit['symbol'], x: number, z: number, valid: number): MapUnit {
  return {
    key, squadId: key, vehicleId: 0, symbol, faction: 'police', name, code, x, z, heading: 0, parentKey: 0, depth: 0, childCount: 0,
    total: valid, valid, injured: 0, morale: 1, ammo: -1, order: null, orderDist: 0, embarked: false, hasPlayer: false, leaderId: 0,
    own: valid, status: '', patrol: false, stamp: 0,
  };
}

function scene(units: MapUnit[]): MapScene {
  return { units, unitModel: new Map(units.map((u) => [u.key, u])), routes: new Map() } as unknown as MapScene;
}

function view(): MapTransform {
  const t = new MapTransform();
  t.setSize(940, 690);
  t.setCenter(0, 0);
  t.setMpp(0.5);
  return t;
}

function options(labels: LabelBoard | null, selection: Set<number> | null = null): UnitLayerOptions {
  return { compact: false, selection, hoverKey: 0, commandable: null, size: 15, labels };
}

const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean =>
  a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.y0 < b.y1 - 0.5 && a.y1 > b.y0 + 0.5;

function pairs<T extends { s: string; x0: number; y0: number; x1: number; y1: number }>(list: readonly T[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlap(list[i]!, list[j]!)) out.push(`${list[i]!.s} / ${list[j]!.s}`);
  return out;
}

/** Capture S0 : la compagnie, la section et deux groupes à quelques mètres les uns des autres, à l'échelle de la carte. */
const S0 = (): MapUnit[] => [
  unit(1, 'MISTRAL', 'MIS', 'compagnie', 0, 0, 3),
  unit(2, 'MISTRAL 1', 'M1', 'section', 1.5, 1, 19),
  unit(3, 'MISTRAL 1 ALFA', '1A', 'groupe', 3, -1, 26),
  unit(4, 'MISTRAL 1 BRAVO', '1B', 'groupe', 2, 2.5, 16),
];

describe('carte de commandement — étiquettes posées par priorité, sans chevauchement', () => {
  it('quatre unités au même endroit : sans planche, leurs textes se recouvraient (capture S0)', () => {
    const { g, texts } = fakeCanvas();
    drawUnits(g, view(), scene(S0()), options(null));
    expect(pairs(texts).length).toBeGreaterThan(0);
  });

  it('avec la planche : une pile, UNE étiquette « MISTRAL · 4 unités · 64 », aucun chevauchement', () => {
    const { g, texts } = fakeCanvas();
    const board = new LabelBoard();
    board.reset();
    drawUnits(g, view(), scene(S0()), options(board));
    board.flush(g, 940, 690);
    expect(board.last.map((l) => l.text)).toEqual(['MISTRAL · 4 unités · 64']);
    expect(pairs(texts)).toEqual([]);
  });

  it('une unité de la pile sélectionnée : la pile se déplie, chaque texte à une place libre ou retiré', () => {
    const { g, texts } = fakeCanvas();
    const board = new LabelBoard();
    board.reset();
    drawUnits(g, view(), scene(S0()), options(board, new Set([2])));
    board.flush(g, 940, 690);
    const shown = board.last.map((l) => l.text);
    // l'unité sélectionnée a son étiquette (posée avant les autres)
    expect(shown.some((s) => s.startsWith('M1 · 19/19'))).toBe(true);
    expect(shown.some((s) => /unités/.test(s))).toBe(false);
    expect(pairs(texts)).toEqual([]);
  });

  it('S1 : l’étiquette d’ordre « M1 1A 1B 1C · BARRENT » ne recouvre ni l’étiquette d’unité ni la bulle, et évite le nom du monument', () => {
    const { g, texts } = fakeCanvas();
    const t = view();
    const units = S0();
    // la section et ses groupes en route vers le même barrage, à 60 m au sud
    for (const u of units.slice(1)) {
      u.order = { type: 'couper_circulation', x: 0, z: -60, heading: 0, width: 12, targetId: 0, maxForce: 1, issuedAt: 0, issuedBy: 1 };
      u.orderDist = 60;
    }
    const sc = scene(units);
    const board = new LabelBoard();
    board.reset();
    // nom de monument du fond de plan, juste sous l'étiquette d'ordre
    const p = { x: 0, y: 0 };
    t.worldToScreen(0, -60, p);
    board.avoid(p.x - 60, p.y - 22, p.x + 60, p.y - 6);
    // bulle du repère visé, sur le point du barrage
    board.pill([{ s: '◎ VOIE GEORGES-POMPIDOU', size: 14, color: '#ffe680', weight: 800 }], p.x, p.y, 24, '#ffd60a', 100, 'above', true);
    drawOrders(g, t, sc, options(board));
    drawUnits(g, t, sc, options(board));
    board.flush(g, 940, 690);
    const placed = board.last.map((l) => ({ s: l.text, x0: l.x, y0: l.y, x1: l.x + l.w, y1: l.y + l.h }));
    expect(placed.some((l) => /BARRENT/.test(l.s))).toBe(true);
    expect(placed[0]!.s).toBe('◎ VOIE GEORGES-POMPIDOU');
    expect(pairs(placed)).toEqual([]);
    // ni la bulle ni l'étiquette d'ordre sur le nom du monument
    const lm = { s: 'Obélisque', x0: p.x - 60, y0: p.y - 22, x1: p.x + 60, y1: p.y - 6 };
    for (const l of placed) expect(overlap(l, lm), l.s).toBe(false);
    expect(pairs(texts.filter((x) => x.s !== ''))).toEqual([]);
  });

  it('placeLabels : priorité, place libre, retrait du moins important, bulle toujours écrite', () => {
    const slot = (x: number, y: number, w: number, priority: number, required = false, mode: LabelSlot['mode'] = 'center'): LabelSlot =>
      ({ x, y, w, h: 13, r: 0, mode, priority, required });
    const out: PlacedSlot[] = [];
    // trois étiquettes au même point dans un cadre minuscule : deux places seulement
    placeLabels([slot(50, 30, 80, 40), slot(50, 30, 80, 50), slot(50, 30, 80, 100, true)], [], [], 100, 45, out);
    // la bulle (100) prend la première place, l'ordre (50) la suivante, l'unité (40) n'est pas écrite
    expect(out[2]!.y).toBeCloseTo(30 - 6.5, 5);
    expect(Number.isNaN(out[1]!.x)).toBe(false);
    expect(Number.isNaN(out[0]!.x)).toBe(true);
    // obstacle mou : évité quand une autre place existe
    placeLabels([slot(200, 200, 60, 40)], [], [170, 190, 230, 210], 400, 400, out);
    expect(out[0]!.y + 13 <= 190 || out[0]!.y >= 210).toBe(true);
  });

  it('indicatif commun d’une pile', () => {
    expect(commonName(['MISTRAL 1 ALFA', 'MISTRAL 1', 'MISTRAL'])).toBe('MISTRAL');
    expect(commonName(['MISTRAL 1 ALFA', 'MISTRAL 1 BRAVO'])).toBe('MISTRAL 1');
    expect(commonName(['TV 75-07', 'CENTAURE 2'])).toBe('TV 75-07');
    expect(stackLabel([{ name: 'MISTRAL 1 ALFA', valid: 8, total: 9, squadId: 3, key: 3, parentKey: 0 }, { name: 'MISTRAL 1 BRAVO', valid: 9, total: 9, squadId: 4, key: 4, parentKey: 0 }])).toBe('MISTRAL 1 · 2 unités · 17');
    // l'effectif d'une unité compte ses subordonnées : un supérieur et sa subordonnée dans la même pile ne comptent
    // qu'une fois (compagnie MISTRAL : 45 valides, dont la section MISTRAL 1 : 26, dont ALFA : 9)
    const parents = new Map([[1, 0], [2, 1], [3, 2]]);
    expect(stackLabel([
      { name: 'MISTRAL', valid: 45, total: 46, squadId: 1, key: 1, parentKey: 0 },
      { name: 'MISTRAL 1 ALFA', valid: 9, total: 9, squadId: 3, key: 3, parentKey: 2 },
    ], (k) => parents.get(k) ?? 0)).toBe('MISTRAL · 2 unités · 45');
    expect(stackLabel([
      { name: 'MISTRAL 1', valid: 26, total: 26, squadId: 2, key: 2, parentKey: 1 },
      { name: 'MISTRAL 1 ALFA', valid: 9, total: 9, squadId: 3, key: 3, parentKey: 2 },
    ])).toBe('MISTRAL 1 · 2 unités · 26');
  });
});
