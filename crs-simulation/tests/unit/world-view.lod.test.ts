// Niveaux de détail et file de construction de la ville en 3D (logique pure).
import { describe, expect, it } from 'vitest';
import {
  DETAIL_KEEP_FACTOR, DETAIL_KEEP_MARGIN, FAR_KEEP_FACTOR, FAR_KEEP_MARGIN, FAR_PRIORITY_BONUS, jobPriority, runSlice, sortJobs, tileDistance,
  wantedLod,
} from '../../src/world/view/lod';
import type { BuildJob, Lod } from '../../src/world/view/lod';

describe('ville 3D — distance à une tuile', () => {
  it('vaut 0 dans la tuile et la distance au rectangle dehors', () => {
    expect(tileDistance(0, 0, 100, 400)).toBe(0);
    expect(tileDistance(0, 0, 512 + 30, 100)).toBeCloseTo(30);
    expect(tileDistance(0, 0, -40, 100)).toBeCloseTo(40);
    expect(tileDistance(0, 0, 512 + 30, 512 + 40)).toBeCloseTo(50);
    expect(tileDistance(-2, 1, -1024 + 10, 512 + 10)).toBe(0);
    expect(tileDistance(-2, 1, -1100, 512 + 10)).toBeCloseTo(76);
  });
});

describe('ville 3D — niveau voulu et hystérésis', () => {
  const p = { detailRadius: 300, drawDistance: 1500 };

  it('détaillé près, lointain jusqu\'à la distance d\'affichage, rien au-delà', () => {
    expect(wantedLod(0, 0, p)).toBe(2);
    expect(wantedLod(300, 0, p)).toBe(2);
    expect(wantedLod(301, 0, p)).toBe(1);
    expect(wantedLod(1500, 0, p)).toBe(1);
    expect(wantedLod(1501, 0, p)).toBe(0);
  });

  it('une tuile détaillée le reste dans la marge, puis redescend', () => {
    const keep = 300 * DETAIL_KEEP_FACTOR + DETAIL_KEEP_MARGIN;
    expect(wantedLod(keep - 1, 2, p)).toBe(2);
    expect(wantedLod(keep + 1, 2, p)).toBe(1);
    // la même distance ne fait pas monter une tuile lointaine
    expect(wantedLod(keep - 1, 1, p)).toBe(1);
  });

  it('une tuile lointaine reste affichée dans la marge, puis disparaît', () => {
    const keep = 1500 * FAR_KEEP_FACTOR + FAR_KEEP_MARGIN;
    expect(wantedLod(keep - 1, 1, p)).toBe(1);
    expect(wantedLod(keep - 1, 2, p)).toBe(1);
    expect(wantedLod(keep + 1, 1, p)).toBe(0);
    expect(wantedLod(keep - 1, 0, p)).toBe(0);
  });

  it('un va-et-vient autour d\'un seuil ne change le niveau qu\'une fois', () => {
    let lod: Lod = 0;
    let changes = 0;
    const path = [280, 310, 295, 320, 290, 330, 300, 340, 305, 360, 310, 300, 290];
    for (const d of path) {
      const next = wantedLod(d, lod, p);
      if (next !== lod) changes++;
      lod = next;
    }
    // monte au détail au premier point, y reste malgré les allers-retours entre 280 et 360 m (seuil de redescente : 378 m)
    expect(changes).toBe(1);
    expect(lod).toBe(2);
  });

  it('la zone détaillée ne dépasse jamais la distance d\'affichage', () => {
    expect(wantedLod(250, 0, { detailRadius: 400, drawDistance: 200 })).toBe(0);
    expect(wantedLod(150, 0, { detailRadius: 400, drawDistance: 200 })).toBe(2);
  });
});

describe('ville 3D — ordre de la file', () => {
  const job = (key: string, lod: 1 | 2, dist: number): BuildJob => ({ key, tx: 0, tz: 0, lod, dist });

  it('trie par distance, les versions lointaines en avance', () => {
    const jobs = [job('a', 2, 0), job('b', 2, 200), job('a', 1, 0), job('c', 1, 600), job('b', 1, 200), job('d', 1, 100)];
    const order = sortJobs(jobs).map((j) => `${j.key}${j.lod}`);
    // lointaines proches d'abord (peu coûteuses : la ville apparaît), puis le détail de la tuile la plus proche
    expect(order).toEqual(['a1', 'd1', 'a2', 'b1', 'b2', 'c1']);
  });

  it('à distance égale, la version lointaine d\'une tuile précède sa version détaillée', () => {
    expect(jobPriority(job('a', 1, 120))).toBeLessThan(jobPriority(job('a', 2, 120)));
    expect(jobPriority(job('a', 2, 120)) - jobPriority(job('a', 1, 120))).toBe(FAR_PRIORITY_BONUS);
  });

  it('ordre stable par clé à égalité', () => {
    const order = sortJobs([job('2_1', 1, 50), job('1_1', 1, 50), job('1_0', 1, 50)]).map((j) => j.key);
    expect(order).toEqual(['1_0', '1_1', '2_1']);
  });
});

describe('ville 3D — exécution par tranches', () => {
  function* steps(n: number, log: number[], frameAt = -1): Generator<number, void, void> {
    for (let i = 0; i < n; i++) {
      log.push(i);
      yield i === frameAt ? 1 : 0;
    }
  }

  it('s\'arrête quand le budget est dépensé, reprend où il en était', () => {
    let clock = 0;
    const now = (): number => clock;
    const log: number[] = [];
    const work = (function* (): Generator<number, void, void> {
      for (let i = 0; i < 10; i++) {
        log.push(i);
        clock += 2; // chaque étape coûte 2 ms
        yield 0;
      }
    })();
    expect(runSlice(work, 5, now)).toBe('budget');
    expect(log).toEqual([0, 1, 2]); // 3 étapes : 6 ms ≥ 5 ms
    expect(runSlice(work, 5, now)).toBe('budget');
    expect(log).toEqual([0, 1, 2, 3, 4, 5]);
    expect(runSlice(work, 100, now)).toBe('done');
    expect(log.length).toBe(10);
  });

  it('exécute toujours au moins une étape, même sans budget', () => {
    const log: number[] = [];
    const work = steps(3, log);
    expect(runSlice(work, 0, () => 0)).toBe('budget');
    expect(log).toEqual([0]);
  });

  it('une étape qui rend 1 termine l\'image', () => {
    const log: number[] = [];
    const work = steps(6, log, 2);
    expect(runSlice(work, 1e9, () => 0)).toBe('frame');
    expect(log).toEqual([0, 1, 2]);
    expect(runSlice(work, 1e9, () => 0)).toBe('done');
    expect(log).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('mesure la plus longue étape, la deuxième et le total, avec leur nom', () => {
    let clock = 0;
    const costs = [1, 7, 3, 12, 2];
    let phase = '';
    const work = (function* (): Generator<number, void, void> {
      for (let i = 0; i < costs.length; i++) {
        phase = `étape ${i}`;
        clock += costs[i];
        yield 0;
      }
    })();
    const spent = { maxStepMs: 0, secondStepMs: 0, totalMs: 0, maxLabel: '', secondLabel: '' };
    expect(runSlice(work, 1e9, () => clock, spent, () => phase)).toBe('done');
    expect(spent.maxStepMs).toBe(12);
    expect(spent.maxLabel).toBe('étape 3');
    expect(spent.secondStepMs).toBe(7);
    expect(spent.secondLabel).toBe('étape 1');
    expect(spent.totalMs).toBe(25);
  });
});
