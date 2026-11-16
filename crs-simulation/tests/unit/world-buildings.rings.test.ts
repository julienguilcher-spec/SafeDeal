// Géométrie plane des anneaux : nettoyage, décalage (inset), simplification, recoupements.
import { describe, expect, it } from 'vitest';
import {
  cleanRing, distanceToRing, insetIsValid, insetRing, pointInRing, ringArea, ringCentroid, ringMainAxis, ringPerimeter, ringSelfIntersects,
  segmentsCross, simplifyRing,
} from '../../src/world/view/buildings/rings';

// Convention de la carte : x = est, z = sud ; antihoraire vu de dessus = aire positive.
// Carré de 10 m, antihoraire vu de dessus : (0,0) → (10,0) → (10,-10) → (0,-10).
const SQUARE = [0, 0, 10, 0, 10, -10, 0, -10];
// « L » concave, antihoraire vu de dessus (z vers le sud : on monte vers le nord en diminuant z)
const L_SHAPE = [0, 0, 20, 0, 20, -8, 8, -8, 8, -20, 0, -20];
const L_AREA = 20 * 8 + 8 * 12;

function buf(n = 64): Float64Array { return new Float64Array(n * 2); }

describe('aires et mesures', () => {
  it("donne une aire positive à un anneau antihoraire vu de dessus, négative dans l'autre sens", () => {
    expect(ringArea(SQUARE)).toBeCloseTo(100, 9);
    expect(ringArea([...SQUARE].reverse().reduce<number[]>((a, _v, i, src) => (i % 2 === 0 ? [...a, src[i + 1], src[i]] : a), []))).toBeCloseTo(-100, 9);
    expect(ringArea(L_SHAPE)).toBeCloseTo(L_AREA, 9);
    expect(ringPerimeter(SQUARE)).toBeCloseTo(40, 9);
  });

  it('localise un point, le centre de gravité, le plus long côté', () => {
    expect(pointInRing(SQUARE, 4, 5, -5)).toBe(true);
    expect(pointInRing(SQUARE, 4, 15, -5)).toBe(false);
    expect(pointInRing(L_SHAPE, 6, 15, -15)).toBe(false);      // dans le creux du L
    expect(pointInRing(L_SHAPE, 6, 4, -15)).toBe(true);
    const c = { x: 0, z: 0 };
    ringCentroid(SQUARE, 4, c);
    expect(c.x).toBeCloseTo(5, 9);
    expect(c.z).toBeCloseTo(-5, 9);
    ringCentroid([1, 1, 1, 1, 1, 1], 3, c);                    // dégénéré : moyenne des sommets
    expect(c.x).toBeCloseTo(1, 9);
    const axis = { x: 0, z: 0 };
    expect(ringMainAxis([0, 0, 30, 0, 30, -5, 0, -5], 4, axis)).toBeCloseTo(30, 9);
    expect(Math.abs(axis.x)).toBeCloseTo(1, 9);
    expect(distanceToRing(SQUARE, 4, 5, -5)).toBeCloseTo(5, 9);
    expect(distanceToRing(SQUARE, 4, 13, 4)).toBeCloseTo(5, 9);
  });
});

describe('cleanRing', () => {
  it('retire les sommets répétés et alignés, impose le sens', () => {
    const out = buf();
    // carré avec un point répété, un point au milieu d'un côté, donné dans le sens horaire
    const dirty = [0, 0, 0, -10, 0, -10, 10, -10, 10, -5, 10, 0, 0.01, 0.01];
    const n = cleanRing(dirty, out, true);
    expect(n).toBe(4);
    expect(ringArea(out, n)).toBeCloseTo(100, 6);
    const m = cleanRing(dirty, out, false);
    expect(m).toBe(4);
    expect(ringArea(out, m)).toBeCloseTo(-100, 6);
  });

  it('retire une pointe en épingle (aller-retour)', () => {
    const out = buf();
    const n = cleanRing([0, 0, 10, 0, 10, -10, 5, -10, 5, -30, 5, -10, 0, -10], out, true);
    expect(n).toBe(4);
    expect(ringArea(out, n)).toBeCloseTo(100, 6);
  });

  it('rejette les anneaux dégénérés', () => {
    const out = buf();
    expect(cleanRing([], out, true)).toBe(0);
    expect(cleanRing([0, 0, 5, 5], out, true)).toBe(0);
    expect(cleanRing([0, 0, 5, 0, 10, 0, 20, 0], out, true)).toBe(0);            // tout aligné
    expect(cleanRing([0, 0, 0, 0, 0, 0, 0, 0], out, true)).toBe(0);              // un seul point
    expect(cleanRing([0, 0, 10, 0, 10, -0.01], out, true)).toBe(0);              // aire quasi nulle
    expect(cleanRing([0, 0, NaN, 3, 10, 0, 10, -10], out, true)).toBe(3);        // NaN ignoré
    expect(cleanRing([0, 0, Infinity, 3, 10, 0], out, true)).toBe(0);
  });

  it('ne lit que les nSrc premiers sommets', () => {
    const out = buf();
    const n = cleanRing([...SQUARE, 500, 500, 600, 600], out, true, 0.05, 0.04, 0.5, 4);
    expect(n).toBe(4);
    expect(ringArea(out, n)).toBeCloseTo(100, 9);
  });

  it('conserve la forme d\'un arc finement numérisé à la tolérance près', () => {
    const src: number[] = [];
    for (let i = 0; i < 200; i++) { const a = (i / 200) * Math.PI * 2; src.push(Math.cos(a) * 50, -Math.sin(a) * 50); }
    const out = buf(256);
    const n = cleanRing(src, out, true);
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(200);
    expect(ringArea(out, n)).toBeGreaterThan(Math.PI * 2500 * 0.995);
  });
});

describe('insetRing', () => {
  it('décale un carré vers l\'intérieur', () => {
    const out = buf();
    insetRing(SQUARE, 4, 1, out);
    expect(ringArea(out, 4)).toBeCloseTo(64, 9);
    expect(Array.from(out.subarray(0, 8)).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, -1, 9, -1, 9, -9, 1, -9]);
    expect(insetIsValid(SQUARE, out, 4)).toBe(true);
  });

  it('décale une forme concave : aire exacte du L rétréci', () => {
    const out = buf();
    insetRing(L_SHAPE, 6, 1, out);
    // L de bras 8 → bras 6, longueurs 20 → 18 ; l'angle rentrant garde sa position relative
    expect(ringArea(out, 6)).toBeCloseTo(18 * 6 + 6 * 12, 9);
    expect(insetIsValid(L_SHAPE, out, 6)).toBe(true);
  });

  it('décale un trou (horaire) vers la matière : le trou grandit', () => {
    const hole = [2, -2, 2, -8, 8, -8, 8, -2];           // horaire vu de dessus
    expect(ringArea(hole)).toBeCloseTo(-36, 9);
    const out = buf();
    insetRing(hole, 4, 0.5, out);
    expect(ringArea(out, 4)).toBeCloseTo(-49, 9);
    expect(insetIsValid(hole, out, 4)).toBe(true);
  });

  it('accepte une distance par côté : un côté à 0 ne bouge pas (mur mitoyen)', () => {
    const out = buf();
    // côté 0 : (0,0)→(10,0) (sud) reste en place ; les trois autres reculent de 2
    insetRing(SQUARE, 4, [0, 2, 2, 2], out);
    expect(out[1]).toBeCloseTo(0, 9);          // z du sommet 0 : sur la ligne du côté 0
    expect(out[3]).toBeCloseTo(0, 9);          // z du sommet 1
    expect(out[0]).toBeCloseTo(2, 9);
    expect(out[2]).toBeCloseTo(8, 9);
    expect(ringArea(out, 4)).toBeCloseTo(6 * 8, 9);
  });

  it('détecte un décalage invalide (emprise trop étroite, côté avalé)', () => {
    const strip = [0, 0, 30, 0, 30, -2, 0, -2];
    const out = buf();
    insetRing(strip, 4, 1.5, out);
    expect(insetIsValid(strip, out, 4)).toBe(false);
    insetRing(strip, 4, 0.2, out);
    expect(insetIsValid(strip, out, 4)).toBe(true);
    // pan coupé de 0,28 m entre deux angles saillants : un décalage de 1 m l'avale (le côté se retourne)
    const chamfer = [0, 0, 10, 0, 10, -9.8, 9.8, -10, 0, -10];
    insetRing(chamfer, 5, 1, out);
    expect(insetIsValid(chamfer, out, 5)).toBe(false);
    insetRing(chamfer, 5, 0.2, out);
    expect(insetIsValid(chamfer, out, 5)).toBe(true);
    // un décrochement (angle saillant puis rentrant) survit au décalage : le petit côté est simplement translaté
    const jog = [0, 0, 10, 0, 10, -5, 10.3, -5, 10.3, -10, 0, -10];
    insetRing(jog, 6, 1, out);
    expect(insetIsValid(jog, out, 6)).toBe(true);
    expect(out[6] - out[4]).toBeCloseTo(0.3, 9);
  });

  it('borne les onglets des angles très aigus', () => {
    const spike = [0, 0, 40, -1, 0, -2];
    const out = buf();
    insetRing(spike, 3, 0.5, out);
    for (let i = 0; i < 3; i++) {
      expect(Math.hypot(out[2 * i] - spike[2 * i], out[2 * i + 1] - spike[2 * i + 1])).toBeLessThanOrEqual(0.5 * 2.6 + 1e-9);
    }
  });

  it('reste fini sur des côtés alignés ou de longueur nulle', () => {
    const out = buf();
    insetRing([0, 0, 5, 0, 10, 0, 10, -10, 0, -10], 5, 1, out);
    for (let i = 0; i < 10; i++) expect(Number.isFinite(out[i])).toBe(true);
    expect(out[3]).toBeCloseTo(-1, 9);                    // sommet aligné : décalé perpendiculairement
    insetRing([0, 0, 0, 0, 10, 0, 10, -10], 4, 1, out);
    for (let i = 0; i < 8; i++) expect(Number.isFinite(out[i])).toBe(true);
  });
});

describe('recoupements', () => {
  it('segmentsCross', () => {
    expect(segmentsCross(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
    expect(segmentsCross(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false);
    expect(segmentsCross(0, 0, 10, 0, 10, 0, 10, 10)).toBe(false);     // extrémité commune
  });

  it('ringSelfIntersects', () => {
    expect(ringSelfIntersects(SQUARE, 4)).toBe(false);
    expect(ringSelfIntersects(L_SHAPE, 6)).toBe(false);
    expect(ringSelfIntersects([0, 0, 10, -10, 10, 0, 0, -10], 4)).toBe(true);     // nœud papillon
  });
});

describe('simplifyRing', () => {
  it('réduit un cercle en restant à la tolérance', () => {
    const src: number[] = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; src.push(Math.cos(a) * 20, -Math.sin(a) * 20); }
    const out = buf(128);
    const n = simplifyRing(src, 96, 1.0, out);
    expect(n).toBeLessThan(24);
    expect(n).toBeGreaterThanOrEqual(6);
    // chaque sommet conservé est un sommet d'origine
    for (let i = 0; i < n; i++) expect(Math.hypot(out[2 * i], out[2 * i + 1])).toBeCloseTo(20, 6);
    // chaque sommet d'origine est à moins de la tolérance du contour simplifié
    for (let i = 0; i < 96; i++) expect(distanceToRing(out, n, src[2 * i], src[2 * i + 1])).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(ringArea(out, n)).toBeGreaterThan(Math.PI * 400 * 0.85);
  });

  it('garde les angles d\'un rectangle crénelé et retire les créneaux fins', () => {
    const src = [0, 0, 10, 0, 10, -0.4, 10.5, -0.4, 10.5, 0, 30, 0, 30, -12, 0, -12];
    const out = buf();
    const n = simplifyRing(src, 8, 1.5, out);
    expect(n).toBe(4);
    expect(ringArea(out, n)).toBeCloseTo(360, 0);
  });

  it('recopie tel quel un petit anneau ou une tolérance nulle', () => {
    const out = buf();
    expect(simplifyRing(SQUARE, 4, 5, out)).toBe(4);
    expect(simplifyRing(L_SHAPE, 6, 0, out)).toBe(6);
    expect(Array.from(out.subarray(0, 12))).toEqual(L_SHAPE);
  });

  it('ne dégénère jamais : un anneau qui s\'effondrerait est recopié', () => {
    // fine lame : toute simplification à 5 m la réduirait à un segment
    const blade = [0, 0, 40, 0, 40, -1, 20, -1.2, 0, -1];
    const out = buf();
    const n = simplifyRing(blade, 5, 5, out);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(Math.abs(ringArea(out, n))).toBeGreaterThan(0.5);
  });
});
