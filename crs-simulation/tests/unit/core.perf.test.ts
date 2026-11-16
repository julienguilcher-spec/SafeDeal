// Mesures de performance du cœur du moteur. Les seuils sont volontairement larges (machines de
// test hétérogènes) : ce fichier sert surtout à produire des chiffres — voir la sortie console.
import { describe, expect, it } from 'vitest';
import type { GameSystem, Person } from '@/core/contracts';
import { createEventBus } from '@/core/events';
import { circleVsObb, segmentVsObb } from '@/core/math';
import { createRng } from '@/core/rng';
import { SpatialHash } from '@/core/spatial';
import { createTestContext } from '@/core/testing';

/**
 * Temps moyen d'un appel de fn, en ms. La mesure est faite en 5 lots et le meilleur lot est retenu :
 * sur une machine partagée, un lot interrompu par un autre processus ne fausse pas le résultat.
 */
function bench(label: string, iterations: number, fn: () => void): number {
  for (let i = 0; i < Math.min(iterations, 200); i++) fn(); // échauffement
  const batch = Math.max(1, Math.ceil(iterations / 5));
  let ms = Infinity;
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < batch; i++) fn();
    const mean = (performance.now() - t0) / batch;
    if (mean < ms) ms = mean;
  }
  console.log(`[perf] ${label} : ${ms < 0.01 ? (ms * 1000).toFixed(2) + ' µs' : ms.toFixed(3) + ' ms'}`);
  return ms;
}

interface GcObserver {
  observe(options: { entryTypes: string[] }): void;
  disconnect(): void;
}
type GcObserverCtor = new (cb: (list: { getEntries(): unknown[] }) => void) => GcObserver;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Nombre de passages du ramasse-miettes pendant fn (Node : entrées « gc » de PerformanceObserver).
 * Zéro passage sur une longue boucle = la boucle n'alloue pas. NaN si non mesurable.
 */
async function gcRuns(fn: () => void): Promise<number> {
  const Ctor = (globalThis as { PerformanceObserver?: GcObserverCtor }).PerformanceObserver;
  if (!Ctor) return Number.NaN;
  let runs = 0;
  let obs: GcObserver;
  try {
    obs = new Ctor((list) => void (runs += list.getEntries().length));
    obs.observe({ entryTypes: ['gc'] });
  } catch {
    return Number.NaN;
  }
  await sleep(30);
  runs = 0;
  fn();
  await sleep(60);
  obs.disconnect();
  return runs;
}

describe('performances du cœur', () => {
  it('grille spatiale : reconstruction et requêtes', () => {
    interface Dot { x: number; z: number }
    const rng = createRng(1);
    const mk = (n: number): Dot[] => Array.from({ length: n }, () => ({ x: rng.range(-150, 150), z: rng.range(-150, 150) }));
    const d500 = mk(500);
    const d2000 = mk(2000);
    const g500 = new SpatialHash<Dot>(3, 1024);
    const g2000 = new SpatialHash<Dot>(3, 1024);
    const r500 = bench('reconstruction de la grille, 500 éléments', 2000, () => g500.rebuild(d500));
    const r2000 = bench('reconstruction de la grille, 2 000 éléments', 500, () => g2000.rebuild(d2000));
    const out: Dot[] = [];
    let k = 0;
    const q = bench('2 000 requêtes de voisinage (r = 1,5 m) parmi 2 000 éléments', 200, () => {
      for (let i = 0; i < 2000; i++) {
        const d = d2000[i]!;
        k += g2000.query(d.x, d.z, 1.5, out);
      }
    });
    const q10 = bench('2 000 requêtes de perception (r = 10 m) parmi 2 000 éléments', 50, () => {
      for (let i = 0; i < 2000; i++) {
        const d = d2000[i]!;
        k += g2000.count(d.x, d.z, 10);
      }
    });
    expect(k).toBeGreaterThan(0);
    expect(r500).toBeLessThan(2);
    expect(r2000).toBeLessThan(8);
    expect(q).toBeLessThan(20);
    expect(q10).toBeLessThan(80);

  });

  it('aucune allocation dans les requêtes ni les reconstructions (ramasse-miettes au repos)', async () => {
    interface Dot { x: number; z: number }
    const rng = createRng(5);
    const out: Dot[] = [];
    const nearby = (d: Dot): boolean => d.x > -1e9;
    /** 800 000 appels à résultats de taille très variable (0 à ~80 éléments) + 100 reconstructions. */
    const workload = (grid: SpatialHash<Dot>, dots: Dot[]) => (): void => {
      for (let n = 0; n < 100; n++) {
        grid.rebuild(dots);
        for (let i = 0; i < 2000; i++) {
          const d = dots[i]!;
          grid.query(d.x, d.z, i % 3 === 0 ? 14 : 2, out);
          grid.query(d.x + 1000, d.z, 2, out); // résultat vide
          grid.count(d.x, d.z, 6, nearby);
          grid.nearest(d.x, d.z, 6);
        }
      }
    };
    // Coordonnées entières : V8 passe les arguments sans les emballer, la mesure isole donc le moteur.
    const ints: Dot[] = Array.from({ length: 2000 }, () => ({ x: rng.int(-150, 150), z: rng.int(-150, 150) }));
    const hotInts = workload(new SpatialHash<Dot>(3, 1024), ints);
    // Coordonnées flottantes : V8 alloue un nombre emballé (~12 octets) par argument flottant d'un appel non inliné.
    const floats: Dot[] = Array.from({ length: 2000 }, () => ({ x: rng.range(-150, 150), z: rng.range(-150, 150) }));
    const hotFloats = workload(new SpatialHash<Dot>(3, 1024), floats);
    hotInts(); // échauffement : les tableaux prennent leur taille de croisière
    hotFloats();

    // témoin : la même charge, écrite naïvement (tableau vidé par length = 0), doit être vue par la mesure
    const naive: Dot[] = [];
    const control = await gcRuns(() => {
      for (let n = 0; n < 400; n++) {
        for (let i = 0; i < 2000; i++) {
          naive.length = 0;
          for (let k = 0; k < 1 + (i % 40); k++) naive.push(ints[k]!);
        }
      }
    });
    const runsInts = await gcRuns(hotInts);
    const runsFloats = await gcRuns(hotFloats);
    console.log(
      `[perf] ramasse-miettes pendant 800 000 requêtes + 100 reconstructions : ${runsInts} passage(s) en coordonnées entières, ` +
        `${runsFloats} en coordonnées flottantes (témoin « length = 0 puis push », 800 000 remplissages : ${control})`,
    );
    if (control > 0) {
      // tolérance d'un passage : un ramasse-miettes étranger à la boucle peut tomber pendant la mesure
      expect(runsInts).toBeLessThanOrEqual(1);
      expect(runsFloats).toBeLessThan(control);
    }
  });

  it('magasin des personnes : création, index, requêtes filtrées', async () => {
    const t = createTestContext({ seed: 2 });
    await t.start();
    const ctx = t.ctx;
    const rng = createRng(3);
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) {
      ctx.people.spawn({ kind: i % 5 === 0 ? 'crs' : 'manifestant', x: rng.range(-120, 120), z: rng.range(-120, 120) });
    }
    const spawnMs = performance.now() - t0;
    console.log(`[perf] création de 2 000 personnes : ${spawnMs.toFixed(1)} ms (${((spawnMs / 2000) * 1000).toFixed(1)} µs par personne)`);
    const police = (p: Person): boolean => p.faction === 'police';
    const out: Person[] = [];
    const rebuild = bench('people.rebuildIndex(), 2 000 personnes', 500, () => ctx.people.rebuildIndex());
    let found = 0;
    const query = bench('2 000 × people.queryRadius(r = 2 m) + 2 000 × nearest(police, 15 m)', 50, () => {
      const list = ctx.people.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        found += ctx.people.queryRadius(p.x, p.z, 2, out);
        if (ctx.people.nearest(p.x, p.z, 15, police)) found++;
      }
    });
    expect(found).toBeGreaterThan(0);
    expect(spawnMs).toBeLessThan(400);
    expect(rebuild).toBeLessThan(8);
    expect(query).toBeLessThan(120);
  });

  it('boucle de jeu : surcoût du moteur par pas, avec 30 systèmes', async () => {
    const systems: GameSystem[] = [];
    let calls = 0;
    for (let i = 0; i < 30; i++) systems.push({ id: 's' + i, order: i * 40, update: () => void calls++ });
    const t = createTestContext({ systems });
    await t.start();
    for (let i = 0; i < 500; i++) t.ctx.people.spawn({ kind: 'manifestant', x: (i % 25) * 2, z: Math.floor(i / 25) * 2 });
    const step = bench('un pas de simulation : 30 systèmes vides + index de 500 personnes', 5000, () => t.game.step(1 / 60));
    expect(calls).toBeGreaterThan(30 * 5000);
    expect(step).toBeLessThan(1.5);
    const t0 = performance.now();
    t.step(60); // une minute simulée
    const minute = performance.now() - t0;
    console.log(`[perf] une minute simulée (1 800 pas, 500 personnes) : ${minute.toFixed(0)} ms, soit × ${(60000 / minute).toFixed(0)} le temps réel`);
    expect(minute).toBeLessThan(3000);
  });

  it('bus d\'événements et géométrie', () => {
    const bus = createEventBus();
    let n = 0;
    for (let i = 0; i < 8; i++) bus.on('fx', () => void n++);
    const payload = { id: 'gaz', x: 0, y: 0, z: 0 } as const;
    const emit = bench('1 000 émissions vers 8 abonnés', 2000, () => {
      for (let i = 0; i < 1000; i++) bus.emit('fx', payload);
    });
    expect(n).toBeGreaterThan(0);
    expect(emit).toBeLessThan(5);

    const out = { x: 0, z: 0 };
    const cast = { t: 0, nx: 0, nz: 0 };
    let hits = 0;
    const geo = bench('10 000 × (disque contre boîte orientée + segment contre boîte orientée)', 500, () => {
      for (let i = 0; i < 10000; i++) {
        const a = i * 0.37;
        if (circleVsObb(Math.cos(a) * 3, Math.sin(a) * 3, 0.5, 0, 0, 2.5, 1, a * 0.1, out)) hits++;
        if (segmentVsObb(-10, Math.sin(a) * 4, 10, Math.cos(a) * 4, 0, 0, 2.5, 1, a * 0.1, cast)) hits++;
      }
    });
    expect(hits).toBeGreaterThan(0);
    expect(geo).toBeLessThan(10);
  });
});
