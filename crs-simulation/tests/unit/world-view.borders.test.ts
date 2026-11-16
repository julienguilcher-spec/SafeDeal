// Bandes de bordure le long d'un contour (bordures de trottoir, caniveaux, margelles).
import { describe, expect, it } from 'vitest';
import { borderStrip, miterOffsets, onTileBorder, walkRing } from '../../src/world/view/borders';

// Carré de 10 m, antihoraire « vu de dessus » (x vers l'est, z vers le sud) : la matière est à gauche de chaque côté.
const SQUARE = [0, 0, 10, 0, 10, -10, 0, -10];

function quadArea(q: number[], o: number): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    a += q[o + 2 * i] * q[o + 2 * j + 1] - q[o + 2 * j] * q[o + 2 * i + 1];
  }
  return Math.abs(a) / 2;
}

describe('ville 3D — onglets d\'un contour', () => {
  it('chaque sommet d\'un carré reçoit la diagonale sortante, de longueur √2', () => {
    const m = miterOffsets(SQUARE);
    // sommet (0, 0) : côtés sud (z = 0) et ouest (x = 0) → vers (−1, +1)
    expect(m[0]).toBeCloseTo(-1);
    expect(m[1]).toBeCloseTo(1);
    // sommet (10, −10) : vers (+1, −1)
    expect(m[4]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(-1);
    for (let i = 0; i < 4; i++) expect(Math.hypot(m[2 * i], m[2 * i + 1])).toBeCloseTo(Math.SQRT2);
  });

  it('borne la longueur aux angles très aigus', () => {
    const spike = [0, 0, 10, 0, 0, -0.2];
    const m = miterOffsets(spike, undefined, 2.2);
    for (let i = 0; i < 3; i++) expect(Math.hypot(m[2 * i], m[2 * i + 1])).toBeLessThanOrEqual(2.2 + 1e-6);
  });

  it('la normale sortante d\'un côté est (−dz, dx)', () => {
    const normals: number[] = [];
    walkRing(SQUARE, miterOffsets(SQUARE), 100, (s) => normals.push(s.nx, s.nz));
    const want = [0, 1, 1, 0, 0, -1, -1, 0];
    expect(normals.length).toBe(8);
    for (let i = 0; i < 8; i++) expect(normals[i]).toBeCloseTo(want[i]);
  });
});

describe('ville 3D — bande de bordure', () => {
  it('bordure intérieure de 0,2 m sur un carré : jointive, de la bonne surface', () => {
    const out: number[] = [];
    const n = borderStrip(SQUARE, 0.2, 100, null, out);
    expect(n).toBe(4);
    // aire d'un cadre de largeur 0,2 dans un carré de 10 : 10² − 9,6² = 7,84
    let area = 0;
    for (let q = 0; q < n; q++) area += quadArea(out, q * 8);
    expect(area).toBeCloseTo(7.84, 5);
    // jointive : le bord intérieur de fin d'un côté est le bord intérieur de début du suivant
    for (let q = 0; q < n; q++) {
      const next = ((q + 1) % n) * 8;
      expect(out[q * 8 + 4]).toBeCloseTo(out[next + 6], 6);
      expect(out[q * 8 + 5]).toBeCloseTo(out[next + 7], 6);
    }
    // le premier côté va de (0,0) à (10,0) ; son bord intérieur est à z = −0,2, de x = 0,2 à x = 9,8
    expect(out.slice(0, 8).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, 10, 0, 9.8, -0.2, 0.2, -0.2]);
  });

  it('largeur négative : la bande est posée à l\'extérieur (caniveau)', () => {
    const out: number[] = [];
    borderStrip(SQUARE, -0.3, 100, null, out);
    // côté sud : le caniveau est au sud (z > 0)
    expect(out[5]).toBeCloseTo(0.3);
    expect(out[7]).toBeCloseTo(0.3);
    let area = 0;
    for (let q = 0; q < 4; q++) area += quadArea(out, q * 8);
    expect(area).toBeCloseTo(10.6 * 10.6 - 100, 5);
  });

  it('découpe les côtés par tronçons et ne garde que ceux que retient le filtre', () => {
    const all: number[] = [];
    expect(borderStrip(SQUARE, 0.2, 2.5, null, all)).toBe(16);
    // seuls les tronçons qui donnent sur une « chaussée » située au sud (normale vers +z)
    const south: number[] = [];
    const kept = borderStrip(SQUARE, 0.2, 2.5, (_mx, _mz, nx, nz) => nz > 0.5 && Math.abs(nx) < 0.5, south);
    expect(kept).toBe(4);
    for (let q = 0; q < kept; q++) {
      expect(south[q * 8 + 1]).toBeCloseTo(0);
      expect(south[q * 8 + 3]).toBeCloseTo(0);
    }
    // largeur constante en cours de côté, onglet aux deux bouts
    expect(south[8 + 7]).toBeCloseTo(-0.2);
    expect(south[8 + 6]).toBeCloseTo(2.5);
  });

  it('un trou (anneau horaire) reçoit sa bordure du côté de la matière', () => {
    // trou carré de 2 m dans une dalle : la matière est AUTOUR du trou
    const hole = [4, -4, 4, -6, 6, -6, 6, -4];
    const out: number[] = [];
    borderStrip(hole, 0.2, 100, null, out);
    // premier côté : de (4,−4) à (4,−6), le long de x = 4 ; la matière est à l'ouest : bord « intérieur » à x = 3,8
    expect(out[4]).toBeCloseTo(3.8);
    expect(out[6]).toBeCloseTo(3.8);
  });
});

describe('ville 3D — côtés posés sur une limite de tuile', () => {
  it('reconnaît les artefacts du découpage par tuile', () => {
    expect(onTileBorder(512, 100, 512, 300, 512, 0, 512)).toBe(true);
    expect(onTileBorder(600, 0.03, 700, 0.01, 512, 0, 512)).toBe(true);
    expect(onTileBorder(1024, 100, 1024, 300, 512, 0, 512)).toBe(true);
    expect(onTileBorder(512, 100, 520, 300, 512, 0, 512)).toBe(false);
    expect(onTileBorder(600, 100, 700, 100, 512, 0, 512)).toBe(false);
  });
});
