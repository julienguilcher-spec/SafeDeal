// Essai de pré-assemblage (intégrateur) : TOUS les modules de simulation ensemble, sans navigateur.
// Une manifestation de 200 personnes qui dégénère, une compagnie de CRS commandée par l'IA, incidents et secours.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as traffic } from '@/sim/traffic';

describe('pré-assemblage : manifestation complète en headless', () => {
  it('fait tourner 10 minutes de manifestation agitée avec tous les modules de simulation', async () => {
    const errors: string[] = [];
    const t = createTestContext({
      seed: 11,
      strict: false,
      modules: [world, people, items, hazards, law, props, vehicles, roles, radio, crowd, police, incidents, rescue, medics, traffic],
    });
    const { ctx, game } = t;
    ctx.events.onAny('core:system_disabled', (p) => errors.push('système désactivé : ' + JSON.stringify(p)));
    ctx.events.on('session:started', () => {
      const units = ctx.service<{ createCompany(o?: unknown): unknown }>('police.units');
      if (units) units.createCompany({ x: 40, z: 40 });
    });
    await t.start({ mode: 'test', x: 0, z: 0, crowdSize: 200, tension: 0.35, volatility: 0.8, duration: 'courte', timeOfDay: 15 });
    const phases: string[] = [];
    ctx.events.on('crowd:phase', (e) => phases.push(e.phase));
    let worst = 0;
    const t0 = performance.now();
    for (let s = 0; s < 600; s += 5) {
      const a = performance.now();
      t.step(5);
      worst = Math.max(worst, (performance.now() - a) / (5 * 30));
    }
    const wall = performance.now() - t0;
    const pol = ctx.people.list.filter((p) => p.faction === 'police');
    const man = ctx.people.list.filter((p) => p.faction === 'protest');
    const verdicts: Record<string, number> = {};
    for (const f of ctx.law.forceLog) verdicts[f.verdict.kind] = (verdicts[f.verdict.kind] ?? 0) + 1;
    const disabled = game.perf.filter((p: { disabled?: boolean }) => p.disabled).map((p: { id: string }) => p.id);
    const top = [...game.perf].sort((a: { avgMs?: number }, b: { avgMs?: number }) => (b.avgMs ?? 0) - (a.avgMs ?? 0)).slice(0, 6)
      .map((p: { id: string; avgMs?: number }) => `${p.id}=${(p.avgMs ?? 0).toFixed(2)}ms`);
    console.log(JSON.stringify({
      phases, phaseFinale: ctx.director.phase, tension: +ctx.director.tension.toFixed(2), stats: ctx.director.stats,
      policiers: pol.length, policiersATerre: pol.filter((p) => p.posture === 'down').length,
      manifestants: man.length, sommation: ctx.law.roe.sommation, forceAutorisee: ctx.law.roe.authorizedForce,
      emploisDeForce: ctx.law.forceLog.length, verdicts, radio: ctx.radio.log.length,
      projectiles: ctx.projectiles.list.length, objets: ctx.props.list.length, vehicules: ctx.vehicles.list.length,
      msMoyenParPas: +(wall / (600 * 30)).toFixed(2), msPireMoyenneSur5s: +worst.toFixed(2), systemesDesactives: disabled, plusCouteux: top, erreurs: errors,
    }, null, 1));
    for (const p of ctx.people.list) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(errors).toEqual([]);
    expect(disabled).toEqual([]);
    expect(pol.length).toBeGreaterThan(40);
    expect(phases.length).toBeGreaterThan(1);
  }, 600000);
});
