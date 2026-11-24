// Triangulation de polygones à trous : justesse (aires, sens) et robustesse (aucun plantage).
import { describe, expect, it } from 'vitest';
import { ringArea } from '../../src/world/view/buildings/rings';
import { triIndices, triangulate, triangulatedArea } from '../../src/world/view/buildings/triangulate';

/** Aire signée d'un triangle, même convention que ringArea (positive = antihoraire vu de dessus = normale vers le haut). */
function triArea(coords: number[], t: number): number {
  const a = triIndices[3 * t], b = triIndices[3 * t + 1], c = triIndices[3 * t + 2];
  return ringArea([coords[2 * a], coords[2 * a + 1], coords[2 * b], coords[2 * b + 1], coords[2 * c], coords[2 * c + 1]]);
}

function check(coords: number[], ends: number[], expectedArea: number, expectedTriangles?: number): number {
  const nt = triangulate(coords, ends);
  if (expectedTriangles !== undefined) expect(nt).toBe(expectedTriangles);
  expect(triangulatedArea(coords, nt)).toBeCloseTo(expectedArea, 6);
  const nv = coords.length / 2;
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) expect(triIndices[3 * t + k]).toBeLessThan(nv);
    expect(triArea(coords, t)).toBeGreaterThan(0);                 // tous tournés vers le haut
  }
  return nt;
}

const SQUARE = [0, 0, 10, 0, 10, -10, 0, -10];
const L_SHAPE = [0, 0, 20, 0, 20, -8, 8, -8, 8, -20, 0, -20];

/** Générateur déterministe. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Polygone étoilé (donc simple) autour de (cx, cz), antihoraire vu de dessus. */
function star(r: () => number, n: number, cx: number, cz: number, rMin: number, rMax: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + r() * 0.6) / n) * Math.PI * 2;
    const d = rMin + r() * (rMax - rMin);
    out.push(cx + Math.cos(a) * d, cz - Math.sin(a) * d);
  }
  return out;
}

describe('triangulate — polygones simples', () => {
  it('carré convexe', () => {
    check(SQUARE, [4], 100, 2);
  });

  it('le sens de parcours donné est indifférent', () => {
    const cw = [0, 0, 0, -10, 10, -10, 10, 0];
    check(cw, [4], 100, 2);
  });

  it('polygones concaves : L, U, peigne, flèche', () => {
    check(L_SHAPE, [6], 256, 4);
    const u = [0, 0, 30, 0, 30, -20, 22, -20, 22, -6, 8, -6, 8, -20, 0, -20];
    check(u, [8], 30 * 20 - 14 * 14, 6);
    const comb = [0, 0, 50, 0, 50, -10, 45, -10, 45, -3, 35, -3, 35, -10, 30, -10, 30, -3, 20, -3, 20, -10, 15, -10, 15, -3, 5, -3, 5, -10, 0, -10];
    check(comb, [16], ringArea(comb), 14);
    const arrow = [0, 0, 10, -4, 20, 0, 10, -20];
    check(arrow, [4], ringArea(arrow), 2);
  });

  it('polygone à 500 sommets, en un temps raisonnable', () => {
    const p = star(rng(7), 500, 0, 0, 40, 60);
    const t0 = performance.now();
    const nt = check(p, [500], ringArea(p));
    expect(nt).toBe(498);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});

describe('triangulate — polygones à trous', () => {
  it('carré percé d\'une cour carrée', () => {
    const coords = [...SQUARE, 3, -3, 3, -7, 7, -7, 7, -3];
    const nt = check(coords, [4, 8], 100 - 16, 8);
    // aucun triangle ne recouvre la cour
    for (let t = 0; t < nt; t++) {
      const a = triIndices[3 * t], b = triIndices[3 * t + 1], c = triIndices[3 * t + 2];
      const gx = (coords[2 * a] + coords[2 * b] + coords[2 * c]) / 3, gz = (coords[2 * a + 1] + coords[2 * b + 1] + coords[2 * c + 1]) / 3;
      expect(gx > 3 && gx < 7 && gz < -3 && gz > -7).toBe(false);
    }
  });

  it('le sens du trou est indifférent', () => {
    check([...SQUARE, 3, -3, 7, -3, 7, -7, 3, -7], [4, 8], 84, 8);
  });

  it('plusieurs cours, dont une dans le creux d\'une forme concave', () => {
    const outer = [0, 0, 40, 0, 40, -30, 0, -30];
    const h1 = [5, -5, 5, -12, 12, -12, 12, -5];
    const h2 = [20, -6, 20, -24, 34, -24, 34, -6];
    const h3 = [6, -18, 6, -26, 14, -26, 14, -18];
    check([...outer, ...h1, ...h2, ...h3], [4, 8, 12, 16], 1200 - 49 - 252 - 64, 4 + 12 + 2 * 3 - 2);
  });

  it('un trou qui touche le bord extérieur (anneaux découpés aux limites de tuile)', () => {
    // la cour vient s'appuyer sur le côté sud de l'anneau extérieur
    const coords = [...SQUARE, 3, 0, 3, -5, 7, -5, 7, 0];
    const nt = triangulate(coords, [4, 8]);
    expect(nt).toBeGreaterThan(0);
    expect(triangulatedArea(coords, nt)).toBeCloseTo(80, 4);
  });

  it('formes étoilées aléatoires avec cours aléatoires : aire exacte', () => {
    const r = rng(2024);
    for (let k = 0; k < 150; k++) {
      const n = 5 + Math.floor(r() * 40);
      const outer = star(r, n, 0, 0, 30, 45);
      const coords = [...outer];
      const ends = [n];
      let area = ringArea(outer);
      const holes = Math.floor(r() * 4);
      for (let h = 0; h < holes; h++) {
        // cours dans des secteurs distincts, à l'intérieur du rayon minimal
        const a = ((h + 0.5) / holes) * Math.PI * 2;
        const m = 3 + Math.floor(r() * 6);
        const hole = star(r, m, Math.cos(a) * 15, -Math.sin(a) * 15, 2, 5);
        coords.push(...hole);
        ends.push(coords.length / 2);
        area -= ringArea(hole);
      }
      const nt = triangulate(coords, ends);
      expect(Math.abs(triangulatedArea(coords, nt) - area)).toBeLessThan(area * 1e-9 + 1e-6);
      for (let t = 0; t < nt; t++) expect(triArea(coords, t)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('triangulate — entrées dégénérées (aucun plantage, aucune boucle sans fin)', () => {
  it('moins de trois sommets, sommets alignés, sommets confondus', () => {
    expect(triangulate([], [0])).toBe(0);
    expect(triangulate([], [])).toBe(0);
    expect(triangulate([0, 0, 5, 0], [2])).toBe(0);
    expect(triangulate([0, 0, 5, 0, 10, 0, 15, 0], [4])).toBe(0);
    expect(triangulate([3, 3, 3, 3, 3, 3], [3])).toBe(0);
  });

  it('sommets répétés et côtés alignés au milieu d\'un polygone valide', () => {
    const coords = [0, 0, 5, 0, 5, 0, 10, 0, 10, -10, 10, -10, 0, -10, 0, -5];
    const nt = triangulate(coords, [8]);
    expect(triangulatedArea(coords, nt)).toBeCloseTo(100, 6);
  });

  it('nœud papillon et anneau replié sur lui-même', () => {
    const bow = [0, 0, 10, -10, 10, 0, 0, -10];
    const nt = triangulate(bow, [4]);
    expect(nt).toBeLessThanOrEqual(4);
    expect(Number.isFinite(triangulatedArea(bow, nt))).toBe(true);
    const folded = [0, 0, 10, 0, 10, -10, 5, 5, 0, -10];
    expect(() => triangulate(folded, [5])).not.toThrow();
  });

  it('trou hors de l\'anneau, trou plus grand que l\'anneau, trou dégénéré', () => {
    expect(() => triangulate([...SQUARE, 50, 50, 50, 40, 60, 40, 60, 50], [4, 8])).not.toThrow();
    expect(() => triangulate([...SQUARE, -5, 5, -5, -15, 15, -15, 15, 5], [4, 8])).not.toThrow();
    const nt = triangulate([...SQUARE, 5, -5, 5, -5, 5, -5], [4, 7]);
    expect(triangulatedArea([...SQUARE, 5, -5, 5, -5, 5, -5], nt)).toBeCloseTo(100, 6);
    // trou de moins de trois sommets : ignoré
    const nt2 = triangulate([...SQUARE, 4, -4, 6, -6], [4, 6]);
    expect(triangulatedArea([...SQUARE, 4, -4, 6, -6], nt2)).toBeCloseTo(100, 6);
  });

  it('nuages de points aléatoires pris comme anneaux : toujours un résultat fini', () => {
    const r = rng(99);
    const t0 = performance.now();
    for (let k = 0; k < 400; k++) {
      const n = 3 + Math.floor(r() * 30);
      const coords: number[] = [];
      for (let i = 0; i < n; i++) coords.push(Math.round(r() * 20), -Math.round(r() * 20));     // grille : nombreux alignements et doublons
      const ends = [n];
      if (r() < 0.4) { const m = 3 + Math.floor(r() * 5); for (let i = 0; i < m; i++) coords.push(r() * 20, -r() * 20); ends.push(n + m); }
      const nt = triangulate(coords, ends);
      expect(nt).toBeGreaterThanOrEqual(0);
      expect(nt).toBeLessThanOrEqual(coords.length);
      for (let t = 0; t < 3 * nt; t++) expect(triIndices[t]).toBeLessThan(coords.length / 2);
    }
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('coordonnées non finies : pas de plantage', () => {
    expect(() => triangulate([0, 0, NaN, 0, 10, -10, 0, -10], [4])).not.toThrow();
    expect(() => triangulate([0, 0, Infinity, 0, 10, -10, 0, -10], [4])).not.toThrow();
  });
});
