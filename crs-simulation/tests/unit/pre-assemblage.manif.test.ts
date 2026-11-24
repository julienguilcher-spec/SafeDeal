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

async function run(volatility: number, tension: number, seconds: number) {
  {
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
    await t.start({ mode: 'test', x: 0, z: 0, crowdSize: 200, tension, volatility, duration: 'standard', timeOfDay: 15 });
    const phases: string[] = [];
    ctx.events.on('crowd:phase', (e) => phases.push(e.phase));
    const offenses: Record<string, number> = {};
    ctx.events.on('law:offense', (e) => { offenses[e.offense.type] = (offenses[e.offense.type] ?? 0) + 1; });
    let windows = 0; let fires = 0; let thrown = 0; let maxT = 0;
    ctx.events.on('shop:window', (e) => { if (e.state === 'broken') windows++; });
    ctx.events.on('fire:started', () => { fires++; });
    ctx.events.on('projectile:spawned', (e) => { const o = ctx.people.get(e.ownerId); if (o && o.faction === 'protest') thrown++; });
    ctx.events.on('crowd:tension', () => { maxT = Math.max(maxT, ctx.director.tension); });
    let worst = 0;
    const t0 = performance.now();
    for (let s = 0; s < seconds; s += 5) {
      const a = performance.now();
      t.step(5);
      worst = Math.max(worst, (performance.now() - a) / (5 * 30));
    }
    const wall = performance.now() - t0;
    maxT = Math.max(maxT, ctx.director.tension);
    const pol = ctx.people.list.filter((p) => p.faction === 'police');
    const man = ctx.people.list.filter((p) => p.faction === 'protest');
    const verdicts: Record<string, number> = {};
    for (const f of ctx.law.forceLog) verdicts[f.verdict.kind] = (verdicts[f.verdict.kind] ?? 0) + 1;
    const disabled = game.perf.filter((p) => p.disabled).map((p) => p.id);
    // moyenne glissante du temps de update() par système (le champ s'appelle avgUpdateMs : « avgMs » n'existe pas)
    const top = [...game.perf].sort((a, b) => b.avgUpdateMs - a.avgUpdateMs).slice(0, 6)
      .map((p) => `${p.id}=${p.avgUpdateMs.toFixed(2)}ms`);
    console.log(JSON.stringify({
      phases, phaseFinale: ctx.director.phase, tension: +ctx.director.tension.toFixed(2), stats: ctx.director.stats,
      policiers: pol.length, policiersATerre: pol.filter((p) => p.posture === 'down').length,
      manifestants: man.length, sommation: ctx.law.roe.sommation, forceAutorisee: ctx.law.roe.authorizedForce,
      emploisDeForce: ctx.law.forceLog.length, verdicts, radio: ctx.radio.log.length,
      projectiles: ctx.projectiles.list.length, objets: ctx.props.list.length, vehicules: ctx.vehicles.list.length,
      volatility, tensionMax: +maxT.toFixed(2), infractions: offenses, vitrinesBrisees: windows, feux: fires, projectilesManifestants: thrown, msMoyenParPas: +(wall / (seconds * 30)).toFixed(2), msPireMoyenneSur5s: +worst.toFixed(2), systemesDesactives: disabled, plusCouteux: top, erreurs: errors,
    }, null, 1));
    const rad = ctx.service<{ heat: number; phase: string; actAt: number; stats: unknown; groups: readonly { plan?: unknown; size?: number }[] }>('crowd.radical');
    if (rad) console.log('RADICAUX', JSON.stringify({ heat: +rad.heat.toFixed(2), phase: rad.phase, actAt: rad.actAt, groupes: rad.groups.length, stats: rad.stats }));
    const cmdApi = ctx.service<{ commands: readonly { phase: string; mode: string; sommations: string }[]; decisions: readonly { t: number; key: string; text: string }[]; hotspots: readonly { kind: string; x: number; z: number }[] }>('police.command');
    if (cmdApi) console.log('COMMANDEMENT', JSON.stringify({ etats: cmdApi.commands.map((c) => ({ phase: c.phase, mode: c.mode, sommations: c.sommations })), pointsChauds: cmdApi.hotspots.length, decisions: cmdApi.decisions.slice(-12).map((d) => `${d.t.toFixed(0)}s ${d.key}: ${d.text.slice(0, 90)}`) }, null, 1));
    for (const p of ctx.people.list) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(errors).toEqual([]);
    expect(disabled).toEqual([]);
    expect(pol.length).toBeGreaterThan(40);
    expect(phases.length).toBeGreaterThan(1);
    return { thrown, windows, fires, maxT, offenses: Object.values(offenses).reduce((a, b) => a + b, 0) };
  }
}

describe('pré-assemblage : manifestation complète en headless', () => {
  it('une forte propension à dégénérer produit de la violence, une faible n\'en produit pas', async () => {
    const hot = await run(0.8, 0.35, 1200);
    const calm = await run(0.05, 0.2, 600);
    expect(hot.maxT).toBeGreaterThan(0.5);
    expect(hot.thrown + hot.windows + hot.fires).toBeGreaterThan(5);
    expect(calm.thrown + calm.windows + calm.fires).toBeLessThan(hot.thrown + hot.windows + hot.fires);
  }, 900000);
});
