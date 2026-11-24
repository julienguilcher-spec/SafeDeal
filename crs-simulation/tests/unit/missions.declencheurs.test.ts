// Cadre de mission, défauts relevés par la recette jouée (tests/unit/playtest.missions-police.test.ts) :
//  - en journée de service, la foule passe « départ » pendant le trajet en colonne : la phase de mission qui attend
//    « départ » ne doit pas rester bloquée cinq minutes une fois sur place ;
//  - « prononcer les trois sommations » (objectif principal compté) est réellement validé quand le joueur les prononce,
//    et la phase qui l'attend s'ouvre aussitôt — y compris pour l'élève de l'école, qui reçoit écharpe et mégaphone.
import { describe, expect, it } from 'vitest';
import type { CrowdPhase, DirectorApi, GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as missions, missionById } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';

/** Foule et journée de service pilotées par le test. */
const scene = { phase: 'rassemblement' as CrowdPhase, stage: 'route' };
const fake: ModuleFactory = () => [{
  id: 'test.scene',
  order: -10,
  provide(ctx: GameContext) {
    const director: DirectorApi = {
      get phase() { return scene.phase; }, tension: 0.2, tensionAt: () => 0.2, addTension: () => {},
      stats: { total: 900, present: 900, dispersed: 0, injured: 0, arrested: 0 } as DirectorApi['stats'], route: [], headProgress: 0,
    };
    ctx.director = director;
    ctx.provide('session.journee', { get stage() { return scene.stage; } });
  },
} as GameSystem];

async function start(id: string, kind: string, rank: string, poste: string) {
  const t = createTestContext({ seed: 2, strict: false, modules: [world, roles, people, items, law, missions, fake] });
  await t.start({ mode: 'libre', missionId: id, role: 'crs', x: 0, z: 0, crowdSize: 0 });
  const { ctx } = t;
  const p = ctx.people.spawn({ kind: kind as never, x: 0, z: 0, rank: rank as never, poste: poste as never });
  ctx.player.possess(p.id);
  return { t, ctx, api: ctx.service<MissionsApi>('missions')! };
}

describe('mission : déclencheurs de phase', () => {
  it('la phase qui attend le départ du cortège s\'ouvre à l\'arrivée si la foule est partie pendant le trajet', async () => {
    scene.phase = 'rassemblement';
    scene.stage = 'route';
    const def = missionById('cdt-01-prise-de-commandement')!;
    expect(def.phases[0]!.until).toEqual({ kind: 'phase_foule', phase: 'depart' });
    const { t, api } = await start(def.id, 'commissaire', 'capitaine', 'commandant_unite');
    t.step(5);
    expect(api.phaseIndex).toBe(-1); // la mission attend l'arrivée
    // pendant le trajet : la foule part, puis défile
    scene.phase = 'depart';
    t.step(5);
    scene.phase = 'cortege';
    t.step(5);
    // arrivée sur place : la mission commence, le cortège est déjà parti
    scene.stage = 'sur_place';
    t.step(3);
    expect(api.phaseIndex).toBeGreaterThanOrEqual(0);
    t.step(5);
    expect(api.phaseIndex).toBe(1);
  });

  it('commandant : les trois sommations prononcées valident l\'objectif et ouvrent la phase suivante', async () => {
    scene.phase = 'rassemblement';
    scene.stage = 'sur_place';
    const def = missionById('cdt-11-l-echarpe')!;
    const { t, ctx, api } = await start(def.id, 'commissaire', 'commandant', 'commandant_unite');
    t.step(2);
    const o1 = api.objectives.find((r) => r.def.id === 'o1')!;
    expect(o1.def.kind).toBe('sommations_regulieres');
    // les deux premières phases sont minutées (150 s puis 120 s) ; la troisième attend o1
    t.step(275);
    expect(api.phaseIndex).toBe(2);
    const me = ctx.player.person()!;
    for (let i = 0; i < 3; i++) {
      ctx.law.sommation(me);
      t.step(40);
    }
    expect(ctx.law.roe.sommation).toBe(3);
    expect(o1.state).toBe('reussi');
    expect(api.phaseIndex).toBe(3);
  });

  it('commandant : sans sommation, l\'objectif « prononcer les sommations » n\'est pas compté réussi à la fin', async () => {
    scene.phase = 'rassemblement';
    scene.stage = 'sur_place';
    const { t, api } = await start('cdt-11-l-echarpe', 'commissaire', 'commandant', 'commandant_unite');
    t.step(30);
    api.finish();
    const o1 = api.objectives.find((r) => r.def.id === 'o1')!;
    expect(o1.state).toBe('echoue');
  });

  it('école : l\'élève reçoit écharpe et mégaphone et peut prononcer les sommations de l\'atelier', async () => {
    scene.phase = 'rassemblement';
    scene.stage = 'sur_place';
    const { t, ctx, api } = await start('ecole-03-ecouter-les-sommations', 'crs', 'gardien_stagiaire', 'chef_groupe');
    t.step(85);
    expect(api.phaseIndex).toBe(2);
    const me = ctx.player.person()!;
    expect(me.inventory.some((s) => s.id === 'megaphone')).toBe(true);
    for (let i = 0; i < 3; i++) {
      ctx.law.sommation(me);
      t.step(40);
    }
    const o1 = api.objectives.find((r) => r.def.id === 'o1')!;
    expect(ctx.law.roe.sommation).toBe(3);
    expect(o1.state).toBe('reussi');
    expect(api.phaseIndex).toBe(3);
  });
});

describe('mission : phases minutées', () => {
  it('« T(n) » est la durée de la phase (comptée depuis son ouverture), pas un instant depuis le début de la mission', async () => {
    scene.phase = 'rassemblement';
    scene.stage = 'sur_place';
    // crs-02 : 150 s à l'angle du faubourg, 210 s de jets, 120 s de sommations, 60 s de bond, puis le retour en ligne
    const def = missionById('crs-02-pluie-de-paves')!;
    const durees = def.phases.slice(0, 4).map((p) => (p.until.kind === 'temps' ? p.until.seconds : -1));
    expect(durees).toEqual([150, 210, 120, 60]);
    const { t, api } = await start(def.id, 'crs', 'gardien_stagiaire', 'bouclier');
    const opened: number[] = [];
    let last = -1;
    for (let s = 0; s < 600; s++) {
      t.step(1);
      if (api.phaseIndex !== last) { last = api.phaseIndex; opened.push(s); }
    }
    // chaque phase minutée dure ce qu'elle annonce : 150, 210, 120 puis 60 s (à une seconde près)
    const ecarts = opened.slice(1, 5).map((s, i) => s - opened[i]!);
    expect(ecarts.length).toBe(4);
    for (let i = 0; i < 4; i++) expect(Math.abs(ecarts[i]! - durees[i]!), `phase ${i + 1}`).toBeLessThanOrEqual(2);
  });
});

describe('mission : échec « trop de blessés »', () => {
  it('« Trop de blessés parmi vos agents » compte les agents blessés, pas les manifestants', async () => {
    scene.phase = 'rassemblement';
    scene.stage = 'sur_place';
    const def = missionById('cdt-04-nuit-des-vitrines')!;
    const f = def.failures.find((x) => x.kind === 'trop_de_blesses')!;
    expect(f.text).toMatch(/agents/);
    const { t, ctx, api } = await start(def.id, 'commissaire', 'capitaine', 'commandant_unite');
    // quarante manifestants blessés, aucun agent : la mission continue
    const stats = ctx.director.stats as { injured: number };
    stats.injured = 40;
    t.step(5);
    expect(api.result, api.result?.summary).toBeNull();
    // sept agents blessés (plafond : six) : échec, pour la raison annoncée
    for (let i = 0; i < 7; i++) {
      const a = ctx.people.spawn({ kind: 'crs', x: 20 + i * 2, z: 20, rank: 'gardien' as never, poste: 'bouclier' as never });
      ctx.health.hurt(a, { amount: 90, kind: 'crush', sourceId: 0, x: a.x, z: a.z, zone: 0.5 });
      expect(a.faction).toBe('police');
      expect(a.injury, 'agent blessé').not.toBe('none');
    }
    t.step(2);
    expect(api.result?.success).toBe(false);
    expect(api.result?.summary).toContain(f.text);
    stats.injured = 0;
  });
});
