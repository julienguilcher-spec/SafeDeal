// Mesures de coût du module des dangers diffus. Les seuils laissent une marge large (machines de
// test hétérogènes) ; les chiffres utiles sont dans la sortie console ([perf dangers]).
import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { createTestContext } from '@/core/testing';
import { CELL_RECORD, HAZARD_FIELD_SERVICE, HazardsSystem } from '@/sim/hazards';
import type { HazardFieldView } from '@/sim/hazards';
import { startHazards } from '@/sim/hazards/testkit';
import { createWorldQuerySystems } from '@/world/query';

interface GcObserver {
  observe(options: { entryTypes: string[] }): void;
  disconnect(): void;
}
type GcObserverCtor = new (cb: (list: { getEntries(): unknown[] }) => void) => GcObserver;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Nombre de passages du ramasse-miettes pendant fn (NaN si non mesurable). */
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

/**
 * Résumé d'une série de durées de pas (ms) : moyenne, médiane, 95e et 99e centiles, maximum, et
 * moyenne de la meilleure fenêtre de 100 pas. C'est sur cette dernière que portent les assertions :
 * les fichiers de test tournent en parallèle (et la machine fait souvent autre chose), si bien qu'une
 * moyenne brute mesure parfois la charge de la machine plutôt que le module.
 */
function summary(ms: Float64Array): { avg: number; best: number; text: string } {
  const sorted = Array.from(ms).sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  let total = 0;
  let best = Infinity;
  for (let i = 0; i < ms.length; i += 100) {
    let w = 0;
    const end = Math.min(ms.length, i + 100);
    for (let k = i; k < end; k++) w += ms[k]!;
    total += w;
    if (end - i === 100 && w / 100 < best) best = w / 100;
  }
  const avg = total / ms.length;
  return {
    avg,
    best,
    text: `moyenne ${avg.toFixed(3)} ms (meilleure fenêtre de 100 pas : ${best.toFixed(3)}), médiane ${at(0.5).toFixed(3)}, p95 ${at(0.95).toFixed(2)}, p99 ${at(0.99).toFixed(2)}, max ${sorted[sorted.length - 1]!.toFixed(2)}`,
  };
}

/** 60 points d'émission répartis sur une zone d'affrontement de 300 × 120 m (dix grenades à six palets). */
function sixtyEmitters(seed: number): Float64Array {
  const rng = createRng(seed);
  const pts = new Float64Array(120);
  for (let g = 0; g < 10; g++) {
    const gx = rng.range(-150, 150);
    const gz = rng.range(-60, 60);
    for (let p = 0; p < 6; p++) {
      const a = rng.next() * Math.PI * 2;
      const d = rng.range(5, 15);
      pts[(g * 6 + p) * 2] = gx + Math.cos(a) * d;
      pts[(g * 6 + p) * 2 + 1] = gz + Math.sin(a) * d;
    }
  }
  return pts;
}

describe('dangers diffus : coût', () => {
  it('60 émetteurs simultanés : moins de 1,5 ms par pas de simulation', async () => {
    const dt = 1 / 30;
    const lines: string[] = [];
    for (const [label, wind, built] of [
      ['air calme, terrain dégagé', [0, 0], null],
      ['vent 3 m/s, terrain dégagé', [3, 1], null],
      ['vent 3 m/s, quartier de rues de 12 m (îlots de 60 m)', [3, 1], (x: number, z: number): boolean => {
        const u = ((x % 72) + 72) % 72;
        const v = ((z % 72) + 72) % 72;
        return u > 12 && v > 12;
      }],
    ] as const) {
      const rig = await startHazards({ seed: 11, wind: [wind[0], wind[1]], built: built ?? undefined });
      const pts = sixtyEmitters(4);
      const emit = (): void => {
        for (let i = 0; i < 60; i++) rig.hazards.emitGas(pts[i * 2]!, pts[i * 2 + 1]!, 0.5 * dt, 2.5);
      };
      // montée en régime : 10 s d'émission (nuages formés, blocs alloués, code optimisé)
      for (let s = 0; s < 300; s++) {
        emit();
        rig.t.game.step(dt);
      }
      // mesure : 30 s d'émission continue des 60 palets
      const steps = 900;
      const ms = new Float64Array(steps);
      for (let s = 0; s < steps; s++) {
        const t0 = performance.now();
        emit();
        rig.t.game.step(dt);
        ms[s] = performance.now() - t0;
      }
      const sum = summary(ms);
      const st = rig.view.stats;
      lines.push(`${label} : ${sum.text} ; ${st.blocks} blocs (${st.blocks * 256} cellules), ${st.substeps} sous-pas`);
      expect(sum.best).toBeLessThan(1.5);
      expect(st.blocks).toBeGreaterThan(20);
    }
    console.log('[perf dangers] 60 émetteurs, par pas de 1/30 s (60 emitGas + update du module)\n  ' + lines.join('\n  '));
  });

  it('60 émetteurs dans les rues du quartier d\'essai (vrai module du monde, bâti réel)', async () => {
    const dt = 1 / 30;
    const system = new HazardsSystem();
    const t = createTestContext({ seed: 3, modules: [() => createWorldQuerySystems({ source: 'test' }), () => [system]] });
    await t.start({ mode: 'test', x: 100, z: -150 });
    t.ctx.env.setWind(3, 1);
    const view = t.ctx.require<HazardFieldView>(HAZARD_FIELD_SERVICE);
    // 60 palets posés au hasard sur la voie publique (ni dans un immeuble, ni dans une cour d'îlot)
    const rng = createRng(31);
    const pts = new Float64Array(120);
    for (let i = 0; i < 60;) {
      const x = rng.range(-100, 400);
      const z = rng.range(-400, 100);
      const surface = t.ctx.world.surfaceAt(x, z);
      if (surface !== 'road' && surface !== 'sidewalk' && surface !== 'sett') continue;
      pts[i * 2] = x;
      pts[i * 2 + 1] = z;
      i++;
    }
    const emit = (): void => {
      for (let i = 0; i < 60; i++) t.ctx.hazards.emitGas(pts[i * 2]!, pts[i * 2 + 1]!, 0.5 * dt, 2.5);
    };
    // premier contact : lecture du bâti (256 appels par bloc) et analyse des rues, étalée sur les pas suivants
    const cold = new Float64Array(300);
    for (let s = 0; s < 300; s++) {
      const t0 = performance.now();
      emit();
      t.game.step(dt);
      cold[s] = performance.now() - t0;
    }
    const steps = 900;
    const ms = new Float64Array(steps);
    for (let s = 0; s < steps; s++) {
      const t0 = performance.now();
      emit();
      t.game.step(dt);
      ms[s] = performance.now() - t0;
    }
    const warm = summary(ms);
    const st = view.stats;
    let inBuilding = 0;
    view.forEachActiveCell((x, z) => {
      if (t.ctx.world.buildingHeightAt(x, z) > 0) inBuilding++;
    }, 1e-4);
    console.log(
      `[perf dangers] 60 émetteurs dans le quartier d'essai (bâti réel), vent 3 m/s : ${warm.text} ; ${st.blocks} blocs, ${st.staticBlocks} blocs de bâti en cache\n`
      + `  dix premières secondes (bâti lu et analysé, code à froid) : ${summary(cold).text}`,
    );
    expect(inBuilding).toBe(0);
    expect(st.blocks).toBeGreaterThan(30);
    expect(warm.best).toBeLessThan(1.5);
  });

  it('lectures : 1 500 personnes interrogent gaz, fumée et feu à chaque pas', async () => {
    const rig = await startHazards({ seed: 2, wind: [2, 0] });
    const dt = 1 / 30;
    const pts = sixtyEmitters(7);
    for (let i = 0; i < 8; i++) rig.hazards.ignite(pts[i * 14]!, pts[i * 14 + 1]!, 1.5, 1, 0);
    for (let s = 0; s < 300; s++) {
      for (let i = 0; i < 60; i++) rig.hazards.emitGas(pts[i * 2]!, pts[i * 2 + 1]!, 0.5 * dt, 2.5);
      rig.t.game.step(dt);
    }
    const rng = createRng(9);
    const people = new Float64Array(3000);
    for (let i = 0; i < 1500; i++) {
      people[i * 2] = rng.range(-170, 170);
      people[i * 2 + 1] = rng.range(-80, 80);
    }
    const h = rig.hazards;
    // accumulateurs locaux, résultat dans un tableau typé : rien n'est alloué par le test lui-même
    const sink = new Float64Array(2);
    const pass = (): void => {
      let acc = 0;
      for (let i = 0; i < 1500; i++) {
        const x = people[i * 2]!;
        const z = people[i * 2 + 1]!;
        acc += h.gasAt(x, z) + h.smokeAt(x, z) + h.fireAt(x, z);
      }
      sink[0] += acc;
    };
    const sight = (): void => {
      let acc = 0;
      for (let i = 0; i < 500; i++) acc += h.visibility(people[i * 2]!, people[i * 2 + 1]!, people[i * 2 + 1000]!, people[i * 2 + 1001]!);
      sink[1] += acc;
    };
    // meilleure de dix séries (voir summary) : la mesure ne doit pas dépendre de la charge de la machine
    const bestOf = (fn: () => void, repeat: number): number => {
      for (let k = 0; k < repeat; k++) fn();
      let best = Infinity;
      for (let serie = 0; serie < 10; serie++) {
        const t0 = performance.now();
        for (let k = 0; k < repeat; k++) fn();
        const each = (performance.now() - t0) / repeat;
        if (each < best) best = each;
      }
      return best;
    };
    const ms = bestOf(pass, 20);
    const visMs = bestOf(sight, 10);
    console.log(
      `[perf dangers] 1 500 × (gasAt + smokeAt + fireAt) : ${ms.toFixed(3)} ms (${((ms * 1e6) / 4500).toFixed(0)} ns la lecture) ; `
      + `500 visibility() sur des segments de 0 à 380 m : ${visMs.toFixed(3)} ms (${((visMs * 1000) / 500).toFixed(2)} µs l'unité)`,
    );
    expect(sink[0]).toBeGreaterThan(0);
    expect(sink[1]).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1.5);
    expect(visMs).toBeLessThan(1.5);
  });

  it('régime établi : aucune allocation dans la boucle (ramasse-miettes au repos)', async () => {
    const rig = await startHazards({ seed: 5, wind: [2, 1] });
    const dt = 1 / 30;
    const pts = sixtyEmitters(8);
    const h = rig.hazards;
    // Le résultat va dans un tableau typé : une variable capturée par la fermeture allouerait un nombre à
    // chaque écriture, et la mesure compterait les allocations du test au lieu de celles du module.
    const sink = new Float64Array(1);
    const cells = new Float32Array(CELL_RECORD * 40000);
    const run = (steps: number): void => {
      let n = 0;
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < 60; i++) h.emitGas(pts[i * 2]!, pts[i * 2 + 1]!, 0.5 * dt, 2.5);
        h.emitSmoke(0, 0, 0.3 * dt, 3, 0xd62828);
        rig.t.game.step(dt);
        n += rig.view.collectActiveCells(cells, 0.02);
      }
      sink[0] += n;
    };
    run(2700); // 90 s : le nuage a atteint son étendue d'équilibre, la réserve de blocs est constituée
    const before = rig.view.stats.blocks + rig.view.stats.pooledBlocks;
    const runs = await gcRuns(() => run(1800)); // une minute de jeu
    const st = rig.view.stats;
    const created = st.blocks + st.pooledBlocks - before;
    console.log(
      `[perf dangers] une minute de jeu en régime établi (60 émetteurs + fumigène + pas + collectActiveCells) : `
      + `${runs} passage(s) du ramasse-miettes ; ${st.blocks} blocs actifs, ${st.pooledBlocks} en réserve, ${created} créé(s) pendant la mesure`,
    );
    expect(sink[0]).toBeGreaterThan(0);
    // tolérance : la mesure capte aussi l'activité de fond du processus de test
    if (!Number.isNaN(runs)) expect(runs).toBeLessThanOrEqual(5);
  });
});
