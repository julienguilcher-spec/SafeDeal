// Foule — coût par pas à 1 000 manifestants (objectif < 3 ms pour les deux systèmes du module) et absence de
// dérive : pas de NaN, pas d'empilement, personne dans un mur. Modules réels ; la machine de test étant
// partagée, la mesure retenue est la meilleure fenêtre de 30 pas consécutifs (la médiane est donnée pour mémoire).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

describe('foule — performance et stabilité à 1 000 manifestants', () => {
  it('coûte moins de 3 ms par pas et ne dérive pas', async () => {
    const t = createCrowdTest({ seed: 8, modules: [world, people, items, hazards, law] });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 1000, duration: 'courte', tension: 0.2, volatility: 0.4 }));
    expect(ctx.director.stats.total).toBe(1000);
    const report: string[] = [];
    let worstBest = 0;
    let inside = 0;
    let invalid = 0;
    let peakDensity = 0;
    let closest = Infinity;
    const buf: Person[] = [];
    // rassemblement (arrivées), départ, marche avec arrêts, début de la dispersion
    for (const span of [60, 60, 60, 60, 60, 60, 60]) {
      t.bestCost();
      t.run(span);
      const cost = t.bestCost(30);
      if (cost.best > worstBest) worstBest = cost.best;
      report.push(`${Math.round(ctx.clock.now)} s ${ctx.director.phase} ${core.members.length} pers. : ${cost.best.toFixed(2)} ms (médiane ${cost.median.toFixed(2)})`);
      if (core.density.peak > peakDensity) peakDensity = core.density.peak;
      for (const p of core.members) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.cmd.moveX) || !Number.isFinite(p.cmd.moveZ) || !Number.isFinite(p.fear) || !Number.isFinite(p.anger)) invalid++;
        else if (!ctx.world.isFree(p.x, p.z, 0.05)) inside++;
        // empilement : distance au plus proche voisin debout
        const n = ctx.people.queryRadius(p.x, p.z, 0.75, buf);
        for (let i = 0; i < n; i++) {
          const q = buf[i]!;
          if (q === p || q.posture === 'down' || p.posture === 'down' || q.vehicleId !== 0 || p.vehicleId !== 0) continue;
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < closest) closest = d;
        }
      }
    }
    console.log('[foule] coût par pas à 1 000 manifestants (meilleure fenêtre de 30 pas) :\n  ' + report.join('\n  '),
      '\n  densité maximale', peakDensity.toFixed(2), 'pers./m² | plus petite distance entre deux personnes', closest.toFixed(2), 'm | itinéraires calculés', core.nav.computed);
    expect(worstBest).toBeLessThan(3);
    expect(invalid).toBe(0);
    expect(inside).toBe(0);
    // pas d'empilement : jamais deux personnes à moins de 35 cm (les disques font 28 cm de rayon)
    expect(closest).toBeGreaterThan(0.35);
    expect(peakDensity).toBeLessThan(4.6);
    // la manifestation a bien vécu pendant la mesure
    expect(ctx.director.headProgress).toBeGreaterThan(200);
    expect(ctx.director.stats.present + ctx.director.stats.dispersed).toBeGreaterThan(900);
  }, 900_000);
});
