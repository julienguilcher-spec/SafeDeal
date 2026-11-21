import { describe, expect, it } from 'vitest';
import {
  createRng, gaussian, hash2, hashString, mix32, normalizeSeed, randomInDisc, shuffle, weightedIndex,
} from '@/core/rng';

function take(rng: { next(): number }, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

describe('rng — déterminisme', () => {
  it('même graine → même suite ; graine différente → suite différente', () => {
    const a = take(createRng(12345), 200);
    const b = take(createRng(12345), 200);
    const c = take(createRng(12346), 200);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === c[i]) same++;
    expect(same).toBeLessThan(3);
  });

  it('suite de référence figée (détecte tout changement d\'algorithme)', () => {
    const r = createRng(1);
    const ints = [r.int(0, 1000), r.int(0, 1000), r.int(0, 1000), r.int(0, 1000), r.int(0, 1000)];
    const again = createRng(1);
    expect([again.int(0, 1000), again.int(0, 1000), again.int(0, 1000), again.int(0, 1000), again.int(0, 1000)]).toEqual(ints);
    expect(ints).toMatchInlineSnapshot(`
      [
        184,
        748,
        37,
        267,
        463,
      ]
    `);
  });

  it('next() est dans [0, 1[ et à peu près uniforme', () => {
    const r = createRng(99);
    const buckets = new Array<number>(10).fill(0);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]!++;
      sum += v;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    for (const b of buckets) {
      expect(b).toBeGreaterThan(n / 10 - 600);
      expect(b).toBeLessThan(n / 10 + 600);
    }
  });

  it('range, int, chance, pick', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
      const n = r.int(3, 8);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(8);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(r.int(5, 5)).toBe(5);
    expect(r.int(5, 2)).toBe(5);
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 20000).toBeCloseTo(0.25, 1);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    const items = ['a', 'b', 'c'] as const;
    const picked = new Set<string>();
    for (let i = 0; i < 200; i++) picked.add(r.pick(items));
    expect(picked.size).toBe(3);
    expect(() => r.pick([])).toThrow(/tableau vide/);
  });

  it('reseed repart du début de la suite', () => {
    const r = createRng(5);
    const first = take(r, 20);
    take(r, 50);
    r.reseed(5);
    expect(take(r, 20)).toEqual(first);
    expect(r.seed).toBe(5);
    r.reseed(6);
    expect(take(r, 20)).not.toEqual(first);
  });

  it('graines non entières et négatives', () => {
    expect(normalizeSeed(-1)).toBe(4294967295);
    expect(normalizeSeed(0.5)).toBe(hashString('0.5'));
    expect(take(createRng(0.5), 5)).toEqual(take(createRng(0.5), 5));
    expect(take(createRng(0.5), 5)).not.toEqual(take(createRng(0.25), 5));
    expect(take(createRng(Number.NaN), 5)).toEqual(take(createRng(Number.NaN), 5));
  });
});

describe('rng — fork', () => {
  it('un fork est déterministe et indépendant de la consommation du parent', () => {
    const p1 = createRng(42);
    const f1 = take(p1.fork('foule'), 50);
    const p2 = createRng(42);
    take(p2, 1234); // le parent a beaucoup tiré
    const f2 = take(p2.fork('foule'), 50);
    expect(f2).toEqual(f1);
  });

  it('forker ne consomme pas le parent', () => {
    const a = createRng(8);
    const b = createRng(8);
    a.fork('x');
    a.fork(3);
    expect(take(a, 30)).toEqual(take(b, 30));
  });

  it('labels différents → flux différents ; graines parentes différentes → flux différents', () => {
    const p = createRng(42);
    const a = take(p.fork('a'), 50);
    const b = take(p.fork('b'), 50);
    const n1 = take(p.fork(1), 50);
    const n2 = take(p.fork(2), 50);
    const other = take(createRng(43).fork('a'), 50);
    expect(a).not.toEqual(b);
    expect(n1).not.toEqual(n2);
    expect(a).not.toEqual(other);
    expect(a).not.toEqual(take(createRng(42), 50));
    // un fork de fork reste déterministe
    expect(take(createRng(42).fork('a').fork('b'), 10)).toEqual(take(createRng(42).fork('a').fork('b'), 10));
    expect(take(createRng(42).fork('a').fork('b'), 10)).not.toEqual(take(createRng(42).fork('b').fork('a'), 10));
  });
});

describe('rng — hachage et aides', () => {
  it('hashString est stable, non signé, sensible à chaque caractère', () => {
    expect(hashString('place de la Concorde')).toBe(hashString('place de la Concorde'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('ab')).not.toBe(hashString('ba'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
    for (const s of ['', 'a', 'CRS', 'Élysée', 'x'.repeat(200)]) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(hashString('personne-' + i));
    expect(seen.size).toBe(5000);
  });

  it('mix32 et hash2', () => {
    expect(mix32(1)).not.toBe(mix32(2));
    expect(hash2(1, 2)).not.toBe(hash2(2, 1));
    expect(hash2(1, 2)).toBe(hash2(1, 2));
    const seen = new Set<number>();
    for (let a = 0; a < 70; a++) for (let b = 0; b < 70; b++) seen.add(hash2(a, b));
    expect(seen.size).toBe(4900);
  });

  it('gaussian, shuffle, weightedIndex, randomInDisc', () => {
    const r = createRng(3);
    let sum = 0;
    let sq = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) {
      const g = gaussian(r, 10, 2);
      sum += g;
      sq += (g - 10) * (g - 10);
    }
    expect(sum / n).toBeCloseTo(10, 1);
    expect(Math.sqrt(sq / n)).toBeCloseTo(2, 1);

    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffle(createRng(11), arr.slice());
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(arr);
    expect(shuffled).not.toEqual(arr);
    expect(shuffle(createRng(11), arr.slice())).toEqual(shuffled);

    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) counts[weightedIndex(r, [1, 0, 3, -5])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[3]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeCloseTo(3, 0);
    expect(weightedIndex(r, [])).toBe(-1);
    expect(weightedIndex(r, [0, 0])).toBe(-1);

    const out = { x: 0, z: 0 };
    let far = 0;
    for (let i = 0; i < 20000; i++) {
      randomInDisc(r, 5, out);
      const d = Math.hypot(out.x, out.z);
      expect(d).toBeLessThanOrEqual(5);
      if (d > 5 * Math.SQRT1_2) far++;
    }
    expect(far / 20000).toBeCloseTo(0.5, 1); // uniforme en surface
  });
});
