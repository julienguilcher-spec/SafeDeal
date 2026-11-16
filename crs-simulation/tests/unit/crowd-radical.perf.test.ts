// Groupes radicaux — coût par pas avec au moins 150 radicaux actifs (bloc formé, salves sur une ligne, casse,
// barricade, repli) : objectif moins de 2 ms par pas pour le système des radicaux, réflexion des contrôleurs
// comprise. La mesure est prise en temps processeur (insensible à la charge de la machine d'essai) ; le temps
// d'horloge est relevé à côté, pour information.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { CROWD_RADICAL } from '@/sim/crowd';
import type { RadicalApi } from '@/sim/crowd';
import { avenueConfig, chantier, createRadicalTest, policeLine, raiseShields } from '@/sim/crowd/radical/testkit';

const MODULES = [world, roles, people, items, hazards, law, props, vehicles];

/** Temps processeur consommé par le processus (ms). */
function cpuNow(): number {
  const c = process.cpuUsage();
  return (c.user + c.system) / 1000;
}

describe('groupes radicaux — performance', () => {
  it('tient moins de 2 ms par pas avec 150 radicaux actifs', async () => {
    const t = createRadicalTest({ seed: 3, modules: MODULES });
    const { ctx, radical } = t;
    await t.start(avenueConfig({ crowdSize: 520, tension: 0.6, volatility: 1 }, { composition: { black_bloc: 0.7, divers: 0.2, etudiants: 0.1 } }));
    t.run(1);
    chantier(ctx, 186, 15);
    chantier(ctx, 192, -15);
    chantier(ctx, 150, 15);
    const line = policeLine(ctx, 262, 0, -Math.PI / 2, 24, 1.1);
    t.run(1);
    raiseShields(ctx, line);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    const radicals = t.radicals().length;
    for (let s = 0; s < 240 && api.phase !== 'formation'; s += 1) t.run(1);
    expect(api.phase).toBe('formation');
    // mesure de la formation du bloc jusqu'au repli : fenêtres d'une seconde (20 pas)
    // la mesure a son propre coût (deux lectures d'horloge par réflexion) : on le chiffre pour le signaler
    const c0 = cpuNow();
    for (let i = 0; i < 20000; i++) cpuNow();
    const perCall = (cpuNow() - c0) / 20000;
    let calls = 0;
    radical.profiling = true;
    radical.profClock = (): number => {
      calls++;
      return cpuNow();
    };
    const windows: number[] = [];
    let held = 0;
    let acting = 0;
    let steps = 0;
    let total = 0;
    let wall = 0;
    let sawAction = false;
    for (let w = 0; w < 200; w++) {
      radical.cost = 0;
      const tick0 = ctx.clock.tick;
      const w0 = performance.now();
      t.run(1);
      wall += performance.now() - w0;
      const n = ctx.clock.tick - tick0;
      windows.push(radical.cost / n);
      total += radical.cost;
      steps += n;
      const k = radical.k;
      let h = 0;
      for (const m of k.all) if (m.held) h++;
      if (h > held) held = h;
      if (k.acting.length > acting) acting = k.acting.length;
      if (api.phase === 'action') sawAction = true;
    }
    radical.profiling = false;
    windows.sort((a, b) => a - b);
    const best = windows[0]!;
    const median = windows[windows.length >> 1]!;
    const p90 = windows[Math.floor(windows.length * 0.9)]!;
    const worst = windows[windows.length - 1]!;
    const mean = total / steps;
    const overhead = (calls * perCall) / steps;
    console.log('[radicaux] performance : radicaux', radicals, '| groupes', api.groups.length, '| personnes pilotées au plus (radicaux et suiveurs)', held,
      '| gestes simultanés au plus', acting, '| coût par pas, temps processeur (ms) : moyenne', mean.toFixed(3), '| médiane', median.toFixed(3),
      '| 9e décile', p90.toFixed(3), '| meilleure seconde', best.toFixed(3), '| pire seconde', worst.toFixed(3), '| pas mesurés', steps,
      '| dont coût de la mesure elle-même (non retranché)', overhead.toFixed(3),
      '| jeu entier, temps d\'horloge (ms/pas, machine chargée)', (wall / steps).toFixed(2), '| salves', api.stats.volleys, '| projectiles', api.stats.thrown,
      '| mortiers', api.stats.mortars, '| barricades', api.stats.barricades);
    expect(radicals).toBeGreaterThanOrEqual(150);
    expect(held).toBeGreaterThanOrEqual(150);
    expect(sawAction).toBe(true);
    expect(api.stats.volleys).toBeGreaterThan(0);
    expect(mean).toBeLessThan(2);
    expect(median).toBeLessThan(2);
  }, 900_000);
});
