// Objectifs principaux sans moyen d'action du joueur :
//  - crs-10 o2 « Signaler le passant suspect à la radio » (reperer_signaux) ne comptait que les signes avant-coureurs
//    des groupes radicaux (crowd.signals), absents d'une nuit calme de dix passants : le compte rendu radio du joueur
//    (écran radio, « Compte rendu de situation ») n'y faisait rien, et la phase « homme au téléphone » attendait 300 s ;
//  - cdt-12 o1 « Obtenir un parcours négocié par la liaison » (prevention/liaison) n'était jugé qu'à la fin sur les
//    dégâts : l'équipe de liaison au contact des organisateurs (crowd.core.setLiaison) ne l'atteignait pas.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
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
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import { createObjectives } from '@/ui/core/objectives';
import type { MissionsApi } from '@/gameplay/missions';
import type { CrowdCoreApi } from '@/sim/crowd/api';
import { conclude } from '@/gameplay/missions/objectives';
import type { EvalEnv, ObjectiveRun } from '@/gameplay/missions/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions, objectives];


async function start(id: string) {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const def = missionById(id)!;
  await t.start(missionConfig(def, t.ctx.world) as SessionConfig);
  const m = t.ctx.service<MissionsApi>('missions')!;
  for (let i = 0; i < 900 && !m.current?.phases || (i < 900 && m.phaseIndex < 0); i++) t.step(1);
  return { t, ctx: t.ctx, m, def };
}

/** Compte rendu radio du joueur (comme le bouton « Compte rendu de situation »), attendu jusqu'à sa diffusion. */
function report(ctx: GameContext, step: (s: number) => void, body: string): boolean {
  const me = ctx.player.person()!;
  const text = `CENTRAL ICI MISTRAL UN ALFA. ${body} PARLEZ.`;
  ctx.radio.say({ channel: 'commandement', from: 'MISTRAL 1 ALFA', personId: me.id, priority: 1, text });
  for (let i = 0; i < 120; i++) {
    step(1);
    if (ctx.radio.log.some((e) => e.text === text)) return true;
  }
  return false;
}

describe('objectifs atteignables par une action du joueur', () => {
  it('crs-10 : le compte rendu radio du joueur, quand il y a à signaler, atteint « Signaler le passant suspect »', async () => {
    const { t, ctx, m } = await start('crs-10-garde-de-nuit');
    const o2 = () => m.objectives.find((r) => r.def.id === 'o2')!;
    // un compte rendu sans rien à signaler (première phase) ne compte pas
    expect(report(ctx, (s) => t.step(s), 'Position place Beauvau. Rien à signaler.'), 'compte rendu diffusé').toBe(true);
    t.step(1);
    if (m.phaseIndex < 2) expect(o2().state).toBe('actif');
    for (let i = 0; i < 400 && m.phaseIndex < 2; i++) t.step(1);
    expect(m.phaseIndex, 'phase « homme au téléphone »').toBe(2);
    t.step(20);
    expect(report(ctx, (s) => t.step(s), 'Position place Beauvau. Nature : un individu filme la grille. Attitude : calme.')).toBe(true);
    t.step(2);
    console.log(`crs-10 o2 : ${o2().state} — ${o2().note} ; phase ${m.phaseIndex + 1}`);
    expect(o2().state).toBe('reussi');
    expect(m.phaseIndex, 'la phase suivante s\'ouvre sans attendre 300 s').toBe(3);
  }, 900000);

  it('cdt-12 : l\'équipe de liaison au contact des organisateurs atteint « Obtenir un parcours négocié »', async () => {
    const { t, ctx, m } = await start('cdt-12-dialogue-d-abord');
    const o1 = () => m.objectives.find((r) => r.def.id === 'o1')!;
    t.step(5);
    expect(o1().state).toBe('actif');
    ctx.require<CrowdCoreApi>('crowd.core').setLiaison(true);
    t.step(2);
    console.log(`cdt-12 o1 : ${o1().state} — ${o1().note}`);
    expect(o1().state).toBe('reussi');
  }, 900000);
  it('sans ordre de liaison (absent de l\'interface), « parcours négocié » reste jugé à la fin sur les dégâts', () => {
    const def = missionById('cdt-12-dialogue-d-abord')!.objectives.find((o) => o.id === 'o1')!;
    const run = (): ObjectiveRun => ({ def, state: 'actif', progress: 0, held: 0, at: null, note: '', decidedAt: -1 });
    const env = (windows: number, liaison: boolean) => ({ tracker: { windows, fires: 0, liaison }, elapsed: 600 }) as unknown as EvalEnv;
    const calm = run();
    conclude(calm, env(1, false), false);
    expect(calm.state, 'peu de dégâts : la prévention a porté').toBe('reussi');
    const broken = run();
    conclude(broken, env(5, false), false);
    expect(broken.state).toBe('echoue');
  });
});
