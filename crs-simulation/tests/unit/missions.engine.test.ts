// Cadre de mission : une vraie mission du catalogue jouée de bout en bout, sans affichage, sur la carte de Paris,
// avec tous les modules de simulation (même liste que src/main.ts).
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionById, missionConfig, MISSIONS } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, missions];

async function play(id: string, seconds: number) {
  const t = createTestContext({ seed: 3, strict: false, modules: SIM });
  // première session (monde ouvert) : la carte de Paris est chargée, ses lieux deviennent résolubles
  await t.start({ mode: 'monde_ouvert', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { 'crowd.none': true } });
  const def = missionById(id)!;
  const cfg = missionConfig(def, t.ctx.world);
  t.ctx.session.end(false);
  await t.start(cfg);
  const ctx: GameContext = t.ctx;
  const api = ctx.require<MissionsApi>('missions');
  const banners: string[] = [];
  const phases: number[] = [];
  const realBanner = ctx.ui.banner.bind(ctx.ui);
  ctx.ui.banner = (title: string, sub?: string, s?: number) => { banners.push(title); realBanner(title, sub, s); };
  for (let s = 0; s < seconds && ctx.session.phase === 'playing'; s += 2) {
    t.step(2);
    if (phases[phases.length - 1] !== api.phaseIndex) phases.push(api.phaseIndex);
  }
  return { t, ctx, api, def, cfg, banners, phases };
}

describe('cadre de mission', () => {
  it('le catalogue est exposé à la page d\'accueil, avec une configuration complète par mission', async () => {
    const t = createTestContext({ seed: 1, modules: SIM });
    await t.start({ mode: 'test', x: 0, z: 0 });
    const api = t.ctx.require<MissionsApi>('missions');
    expect(api.catalog.length).toBe(MISSIONS.length);
    const e = api.catalog[0] as { id: string; config: { missionId: string; role: string; extra: Record<string, unknown> } };
    expect(e.config.missionId).toBe(e.id);
    expect(e.config.extra['moyens']).toBeDefined();
  });

  it('joue « crs-01 » sur Paris : phases enchaînées, objectifs mesurés, fin de mission et compte rendu noté', async () => {
    const { ctx, api, def, cfg, banners, phases } = await play('crs-01-premier-samedi', 720);
    console.log('MISSION', JSON.stringify({
      lieu: def.place, x: cfg.x, z: cfg.z, parcours: (cfg.extra?.['crowd.route'] as number[] | undefined)?.length ?? 0,
      phases, bandeaux: banners, phaseSession: ctx.session.phase,
      objectifs: api.objectives.map((o) => `${o.def.kind}:${o.state}:${o.note}`),
      resultat: api.result && { reussite: api.result.success, note: api.result.score, mention: api.result.grade, resume: api.result.summary },
    }, null, 1));
    expect(cfg.x).toBeDefined();
    expect(phases.length).toBeGreaterThanOrEqual(3);
    expect(banners.length).toBeGreaterThanOrEqual(3);
    expect(api.result).not.toBeNull();
    expect(api.result!.lines.length).toBeGreaterThanOrEqual(def.objectives.length);
    expect(ctx.session.phase).toBe('debrief');
  }, 900000);
});
