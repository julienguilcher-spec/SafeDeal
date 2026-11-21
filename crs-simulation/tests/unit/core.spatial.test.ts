import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { SpatialHash } from '@/core/spatial';

interface Dot {
  id: number;
  x: number;
  z: number;
  off?: boolean;
}

function makeDots(n: number, seed: number, spread = 200): Dot[] {
  const rng = createRng(seed);
  const dots: Dot[] = [];
  for (let i = 0; i < n; i++) dots.push({ id: i, x: rng.range(-spread, spread), z: rng.range(-spread, spread) });
  return dots;
}

function brute(dots: Dot[], x: number, z: number, r: number, filter?: (d: Dot) => boolean): number[] {
  return dots
    .filter((d) => (d.x - x) ** 2 + (d.z - z) ** 2 <= r * r && (!filter || filter(d)))
    .map((d) => d.id)
    .sort((a, b) => a - b);
}

const ids = (out: Dot[]): number[] => out.map((d) => d.id).sort((a, b) => a - b);

describe('grille de hachage spatiale', () => {
  it('query retourne exactement les éléments du disque (comparaison avec la force brute)', () => {
    const dots = makeDots(1500, 1);
    const grid = new SpatialHash<Dot>(4, 64); // petite capacité initiale : force l'agrandissement
    grid.rebuild(dots);
    expect(grid.size).toBe(1500);
    const rng = createRng(2);
    const out: Dot[] = [];
    for (let i = 0; i < 300; i++) {
      const x = rng.range(-220, 220);
      const z = rng.range(-220, 220);
      const r = rng.range(0, 60);
      const n = grid.query(x, z, r, out);
      expect(n).toBe(out.length);
      expect(ids(out)).toEqual(brute(dots, x, z, r));
    }
    // requête très large (bascule sur le balayage linéaire) et rayon infini
    expect(grid.query(0, 0, 5000, out)).toBe(1500);
    expect(grid.query(0, 0, Infinity, out)).toBe(1500);
    expect(grid.query(0, 0, -1, out)).toBe(0);
    expect(out.length).toBe(0);
    expect(grid.query(0, 0, Number.NaN, out)).toBe(0);
  });

  it('coordonnées négatives et limites de cellules', () => {
    const grid = new SpatialHash<Dot>(4);
    const dots: Dot[] = [
      { id: 0, x: -0.001, z: -0.001 }, { id: 1, x: 0, z: 0 }, { id: 2, x: -4, z: 4 }, { id: 3, x: 3.999, z: -4.001 },
      { id: 4, x: -1000.5, z: 2000.25 },
    ];
    for (const d of dots) grid.insert(d);
    const out: Dot[] = [];
    grid.query(0, 0, 0.01, out);
    expect(ids(out)).toEqual([0, 1]);
    grid.query(0, 0, 6, out);
    expect(ids(out)).toEqual([0, 1, 2, 3]);
    grid.query(-1000, 2000, 1, out);
    expect(ids(out)).toEqual([4]);
    // rayon inclus : un point exactement à r est retenu
    expect(grid.count(-4 - 3, 4, 3)).toBe(1);
  });

  it('filtre, count et nearest', () => {
    const dots = makeDots(800, 3);
    const grid = new SpatialHash<Dot>(5);
    grid.rebuild(dots);
    const even = (d: Dot): boolean => d.id % 2 === 0;
    const out: Dot[] = [];
    const rng = createRng(4);
    for (let i = 0; i < 100; i++) {
      const x = rng.range(-200, 200);
      const z = rng.range(-200, 200);
      const r = rng.range(1, 80);
      grid.query(x, z, r, out, even);
      const expected = brute(dots, x, z, r, even);
      expect(ids(out)).toEqual(expected);
      expect(grid.count(x, z, r, even)).toBe(expected.length);
      expect(grid.count(x, z, r)).toBe(brute(dots, x, z, r).length);
      const near = grid.nearest(x, z, r, even);
      if (expected.length === 0) {
        expect(near).toBeNull();
      } else {
        let best = Infinity;
        for (const id of expected) best = Math.min(best, (dots[id]!.x - x) ** 2 + (dots[id]!.z - z) ** 2);
        expect((near!.x - x) ** 2 + (near!.z - z) ** 2).toBeCloseTo(best, 9);
        expect(even(near!)).toBe(true);
      }
    }
    expect(new SpatialHash<Dot>().nearest(0, 0, 10)).toBeNull();
  });

  it('le tableau de sortie est réutilisé et tronqué à la bonne longueur', () => {
    const grid = new SpatialHash<Dot>(4);
    const dots = makeDots(50, 5, 10);
    grid.rebuild(dots);
    const out: Dot[] = [];
    expect(grid.query(0, 0, 100, out)).toBe(50);
    expect(out.length).toBe(50);
    const n = grid.query(0, 0, 3, out);
    expect(out.length).toBe(n);
    expect(n).toBeLessThan(50);
    expect(grid.query(900, 900, 1, out)).toBe(0);
    expect(out.length).toBe(0);
  });

  it('insert / remove / update incrémentaux', () => {
    const grid = new SpatialHash<Dot>(4, 16);
    const a: Dot = { id: 1, x: 1, z: 1 };
    const b: Dot = { id: 2, x: 2, z: 2 };
    const c: Dot = { id: 3, x: 50, z: 50 };
    const sa = grid.insert(a);
    const sb = grid.insert(b);
    grid.insert(c);
    expect(grid.size).toBe(3);
    const out: Dot[] = [];
    grid.query(0, 0, 5, out);
    expect(ids(out)).toEqual([1, 2]);

    grid.remove(sa);
    grid.remove(sa); // retirer deux fois est sans effet
    expect(grid.size).toBe(2);
    grid.query(0, 0, 5, out);
    expect(ids(out)).toEqual([2]);

    // l'emplacement libéré est réutilisé
    const d: Dot = { id: 4, x: -3, z: 0 };
    expect(grid.insert(d)).toBe(sa);
    grid.query(0, 0, 5, out);
    expect(ids(out)).toEqual([2, 4]);

    // déplacement : update() ré-indexe l'élément à sa nouvelle cellule.
    // (Des éléments de remplissage éloignés garantissent que la requête passe bien par la grille
    // et non par le balayage linéaire réservé aux requêtes plus larges que le contenu.)
    for (let i = 0; i < 40; i++) grid.insert({ id: 100 + i, x: 1000 + i * 10, z: -1000 });
    b.x = 200;
    b.z = 200;
    grid.query(200, 200, 2, out);
    expect(ids(out)).toEqual([]); // pas encore ré-indexé : la grille le croit toujours près de l'origine
    grid.update(sb);
    grid.query(200, 200, 2, out);
    expect(ids(out)).toEqual([2]);
    grid.query(0, 0, 5, out);
    expect(ids(out)).toEqual([4]);
    for (let i = 0; i < 40; i++) expect(grid.removeItem(grid.nearest(1000 + i * 10, -1000, 1)!)).toBe(true);

    expect(grid.removeItem(c)).toBe(true);
    expect(grid.removeItem(c)).toBe(false);
    expect(grid.size).toBe(2);
    grid.clear();
    expect(grid.size).toBe(0);
    expect(grid.query(0, 0, 1000, out)).toBe(0);
  });

  it('rebuild après déplacement, avec éléments écartés', () => {
    const dots = makeDots(400, 6);
    const grid = new SpatialHash<Dot>(3);
    grid.rebuild(dots);
    const rng = createRng(7);
    for (const d of dots) {
      d.x += rng.range(-30, 30);
      d.z += rng.range(-30, 30);
      d.off = d.id % 5 === 0;
    }
    grid.rebuild(dots, (d) => d.off === true);
    expect(grid.size).toBe(320);
    const out: Dot[] = [];
    for (let i = 0; i < 100; i++) {
      const x = rng.range(-200, 200);
      const z = rng.range(-200, 200);
      grid.query(x, z, 25, out);
      expect(ids(out)).toEqual(brute(dots, x, z, 25, (d) => !d.off));
    }
    // reconstruire avec moins d'éléments ne laisse pas de fantômes
    grid.rebuild(dots.slice(0, 10));
    expect(grid.size).toBe(10);
    expect(grid.query(0, 0, 1e6, out)).toBe(10);
  });

  it('updateAll ré-indexe tous les éléments déplacés', () => {
    const dots = makeDots(300, 8);
    const grid = new SpatialHash<Dot>(4);
    for (const d of dots) grid.insert(d);
    const rng = createRng(9);
    for (const d of dots) {
      d.x = rng.range(-100, 100);
      d.z = rng.range(-100, 100);
    }
    grid.updateAll();
    const out: Dot[] = [];
    for (let i = 0; i < 60; i++) {
      const x = rng.range(-100, 100);
      const z = rng.range(-100, 100);
      grid.query(x, z, 12, out);
      expect(ids(out)).toEqual(brute(dots, x, z, 12));
    }
  });

  it('queryBox', () => {
    const dots = makeDots(600, 10);
    const grid = new SpatialHash<Dot>(4);
    grid.rebuild(dots);
    const out: Dot[] = [];
    const rng = createRng(11);
    for (let i = 0; i < 60; i++) {
      const x0 = rng.range(-200, 150);
      const z0 = rng.range(-200, 150);
      const x1 = x0 + rng.range(0, 90);
      const z1 = z0 + rng.range(0, 90);
      const n = grid.queryBox(x0, z0, x1, z1, out);
      const expected = dots.filter((d) => d.x >= x0 && d.x <= x1 && d.z >= z0 && d.z <= z1).map((d) => d.id).sort((a, b) => a - b);
      expect(n).toBe(expected.length);
      expect(ids(out)).toEqual(expected);
    }
  });

  it('une requête imbriquée dans un filtre ne perturbe pas la requête englobante', () => {
    const dots = makeDots(200, 12, 30);
    const grid = new SpatialHash<Dot>(4);
    grid.rebuild(dots);
    const lonely = (d: Dot): boolean => grid.count(d.x, d.z, 3) === 1; // personne d'autre à moins de 3 m
    const out: Dot[] = [];
    grid.query(0, 0, 40, out, lonely);
    const expected = dots.filter((d) => d.x * d.x + d.z * d.z <= 1600 && brute(dots, d.x, d.z, 3).length === 1).map((d) => d.id).sort((a, b) => a - b);
    expect(ids(out)).toEqual(expected);
    const near = grid.nearest(0, 0, 40, (d) => grid.nearest(d.x + 100, d.z, 1) === null && d.id % 2 === 0);
    const evens = dots.filter((d) => d.id % 2 === 0 && d.x * d.x + d.z * d.z <= 1600);
    evens.sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z));
    expect(near).toBe(evens[0] ?? null);
  });
});
