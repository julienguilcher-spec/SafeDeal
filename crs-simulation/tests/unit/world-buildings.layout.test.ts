// Trame des façades : répartition des travées, découpage en niveaux, composition verticale.
import { describe, expect, it } from 'vitest';
import { BUILDING_STYLES } from '../../src/world/mapdata';
import {
  FLOOR_NOBLE, FLOOR_TOP, FLOOR_TYP, STYLE_PARAMS, floorKind, hash01, layoutBays, layoutFloors, roofHeightFor,
} from '../../src/world/view/buildings/layout';
import type { BayLayout, FloorLayout } from '../../src/world/view/buildings/layout';
import { familyBase, LAYER_COUNT, LAYER_FAUBOURG, LAYER_HAUSSMANN, LAYER_MODERN, LAYER_MONUMENTAL, topCell, variantCount } from '../../src/world/view/buildings/layers';

const bay: BayLayout = { n: 0, width: 0, margin: 0 };
const fl: FloorLayout = { wallH: 0, roofH: 0, rdcH: 0, nUpper: 0, floorH: 0 };

describe('layoutBays — travées par pan de mur', () => {
  it('ne coupe jamais une fenêtre : n entier, n·largeur + 2·trumeau = longueur, largeurs dans les bornes', () => {
    for (const style of BUILDING_STYLES) {
      const p = STYLE_PARAMS[style];
      let previous = 0;
      for (let k = 0; k <= 2400; k++) {
        const length = k * 0.05;
        layoutBays(length, p, bay);
        expect(Number.isInteger(bay.n)).toBe(true);
        expect(bay.n).toBeGreaterThanOrEqual(0);
        expect(bay.n * bay.width + 2 * bay.margin).toBeCloseTo(length, 9);
        if (bay.n >= 1) {
          expect(bay.margin).toBeGreaterThanOrEqual(p.margin - 1e-9);
          expect(bay.width).toBeLessThanOrEqual(p.bayMax + 1e-9);
          expect(bay.width).toBeGreaterThanOrEqual(p.bay * 0.74 - 1e-9);
        }
        if (bay.n >= 2) expect(bay.width).toBeGreaterThanOrEqual(p.bayMin - 1e-9);
        // le nombre de travées ne diminue jamais quand le mur s'allonge
        expect(bay.n).toBeGreaterThanOrEqual(previous);
        previous = bay.n;
      }
    }
  });

  it('laisse aveugles les pans trop courts et garde une travée unique à peine resserrée', () => {
    const p = STYLE_PARAMS.haussmann;
    expect(layoutBays(0, p, bay).n).toBe(0);
    expect(layoutBays(-3, p, bay).n).toBe(0);
    expect(layoutBays(NaN, p, bay).n).toBe(0);
    expect(layoutBays(1.8, p, bay).n).toBe(0);
    expect(layoutBays(2.6, p, bay).n).toBe(1);
    expect(bay.width).toBeCloseTo(2.2, 9);
    expect(layoutBays(3.2, p, bay).n).toBe(1);
    expect(bay.width).toBeCloseTo(2.8, 9);
  });

  it('exemples haussmanniens : la travée reste proche de 2,8 m', () => {
    const p = STYLE_PARAMS.haussmann;
    expect(layoutBays(14.4, p, bay).n).toBe(5);
    expect(bay.width).toBeCloseTo(2.8, 9);
    expect(layoutBays(20, p, bay).n).toBe(7);
    expect(bay.width).toBeCloseTo(2.8, 9);
    expect(layoutBays(60, p, bay).n).toBeGreaterThanOrEqual(20);
    expect(layoutBays(60, p, bay).n).toBeLessThanOrEqual(23);
    // largeur toujours dans 2,55 – 3,05 m sur toute la plage utile
    for (let length = 6; length < 100; length += 0.37) {
      layoutBays(length, p, bay);
      expect(bay.width).toBeGreaterThanOrEqual(2.55 - 1e-9);
      expect(bay.width).toBeLessThanOrEqual(3.05 + 1e-9);
    }
  });
});

describe('layoutFloors — niveaux par hauteur', () => {
  it('rez-de-chaussée + n·étage = hauteur du mur, étages dans les bornes du style', () => {
    for (const style of BUILDING_STYLES) {
      const p = STYLE_PARAMS[style];
      for (let h = 2; h <= 70; h += 0.3) {
        for (const levels of [0, 1, 2, 4, 6, 7, 9, 15, 40]) {
          for (const roofH of [0, 1.5, 3.2]) {
            layoutFloors(h, roofH, levels, p, fl);
            expect(fl.wallH + fl.roofH).toBeCloseTo(h, 9);
            expect(fl.rdcH + fl.nUpper * fl.floorH).toBeCloseTo(fl.wallH, 9);
            expect(Number.isInteger(fl.nUpper)).toBe(true);
            expect(fl.nUpper).toBeGreaterThanOrEqual(0);
            expect(fl.rdcH).toBeGreaterThan(0);
            if (fl.nUpper > 0) {
              expect(fl.floorH).toBeGreaterThanOrEqual(p.floorMin - 1e-9);
              expect(fl.floorH).toBeLessThanOrEqual(p.floorMax + 1e-9);
              expect(fl.rdcH).toBeGreaterThanOrEqual(p.rdcMin - 1e-9);
              expect(fl.rdcH).toBeLessThanOrEqual(p.rdcMax + 1e-9);
            }
          }
        }
      }
    }
  });

  it('respecte le nombre de niveaux de la carte quand il est plausible', () => {
    const p = STYLE_PARAMS.haussmann;
    // immeuble de 6 niveaux, 22 m dont 3 m de comble : rez-de-chaussée + 5 étages
    layoutFloors(22, 3, 6, p, fl);
    expect(fl.nUpper).toBe(5);
    expect(fl.rdcH).toBeCloseTo(4, 9);
    expect(fl.floorH).toBeCloseTo(3, 9);
    // 7 niveaux du quartier d'essai (7 × 3,1 + 3)
    layoutFloors(24.9, 3.3, 7, p, fl);
    expect(fl.nUpper).toBe(6);
  });

  it('recalcule un nombre de niveaux invraisemblable d\'après la hauteur', () => {
    const p = STYLE_PARAMS.haussmann;
    layoutFloors(20, 0, 2, p, fl);           // « 2 niveaux » pour 20 m : faux
    expect(fl.nUpper).toBe(5);
    layoutFloors(20, 0, 30, p, fl);          // « 30 niveaux » pour 20 m : faux
    expect(fl.nUpper).toBe(5);
    layoutFloors(20, 0, 0, p, fl);           // inconnu
    expect(fl.nUpper).toBe(5);
  });

  it('bâtiments bas : un seul niveau ; hauteurs absurdes : résultat fini', () => {
    const p = STYLE_PARAMS.haussmann;
    layoutFloors(3.5, 0, 1, p, fl);
    expect(fl.nUpper).toBe(0);
    expect(fl.rdcH).toBeCloseTo(3.5, 9);
    layoutFloors(0, 5, 3, p, fl);
    expect(fl.wallH).toBeGreaterThan(0);
    expect(Number.isFinite(fl.rdcH)).toBe(true);
    layoutFloors(4, 10, 3, p, fl);           // toit plus haut que le bâtiment : écrêté
    expect(fl.wallH).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(fl.wallH + fl.roofH).toBeCloseTo(4, 9);
  });

  it('roofHeightFor : comble d\'environ 3 m en mansarde, rien en toit plat', () => {
    expect(roofHeightFor('flat', 25, 12, 'generic')).toBe(0);
    expect(roofHeightFor('mansard', 22, 12, 'generic')).toBeGreaterThanOrEqual(2.2);
    expect(roofHeightFor('mansard', 22, 12, 'generic')).toBeLessThanOrEqual(3.3);
    expect(roofHeightFor('gabled', 12, 8, 'generic')).toBeGreaterThan(1);
    expect(roofHeightFor('gabled', 12, 8, 'generic')).toBeLessThanOrEqual(4);
    expect(roofHeightFor('dome', 6.5, 9, 'kiosk')).toBeLessThanOrEqual(3.25);
    expect(roofHeightFor('mansard', 3, 5, 'generic')).toBeLessThanOrEqual(1.2);
    expect(roofHeightFor('mansard', 5, 20, 'roof')).toBeLessThanOrEqual(0.5);
  });
});

describe('composition verticale', () => {
  it('haussmannien : étage noble au 2ᵉ, balcon et corniche au dernier étage', () => {
    const kinds = [0, 1, 2, 3, 4].map((k) => floorKind('haussmann', k, 5));
    expect(kinds).toEqual([FLOOR_TYP, FLOOR_NOBLE, FLOOR_TYP, FLOOR_TYP, FLOOR_TOP]);
    expect([0, 1, 2].map((k) => floorKind('haussmann', k, 3))).toEqual([FLOOR_NOBLE, FLOOR_TYP, FLOOR_TOP]);
    expect(floorKind('haussmann', 0, 1)).toBe(FLOOR_NOBLE);
  });

  it('autres styles : seul le dernier étage est distinct', () => {
    for (const style of ['faubourg', 'modern', 'monumental'] as const) {
      expect([0, 1, 2, 3].map((k) => floorKind(style, k, 4))).toEqual([FLOOR_TYP, FLOOR_TYP, FLOOR_TYP, FLOOR_TOP]);
      expect(floorKind(style, 0, 1)).toBe(FLOOR_TOP);
    }
  });

  it('couches de l\'atlas : familles disjointes, toutes dans l\'atlas, porte = rez-de-chaussée + 1', () => {
    const seen = new Set<number>();
    for (const style of BUILDING_STYLES) {
      for (let v = 0; v < variantCount(style); v++) {
        const base = familyBase(style, v);
        for (let c = 0; c <= topCell(style); c++) {
          expect(seen.has(base + c)).toBe(false);
          seen.add(base + c);
          expect(base + c).toBeLessThan(LAYER_COUNT);
        }
      }
    }
    expect(seen.size).toBe(3 * 5 + 2 * 4 + 2 * 4 + 1 * 4);
    expect([LAYER_HAUSSMANN, LAYER_FAUBOURG, LAYER_MODERN, LAYER_MONUMENTAL]).toEqual([0, 15, 23, 31]);
    expect(LAYER_COUNT).toBeLessThanOrEqual(250);          // l'indice de couche tient sur un octet
  });

  it('hash01 : déterministe, dans [0, 1[, bien réparti', () => {
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const v = hash01(i, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(i, 7)).toBe(v);
      sum += v;
    }
    expect(sum / 5000).toBeGreaterThan(0.47);
    expect(sum / 5000).toBeLessThan(0.53);
    expect(hash01(1, 2)).not.toBe(hash01(2, 1));
  });
});
