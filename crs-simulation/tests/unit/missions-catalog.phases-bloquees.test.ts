// Une phase qui attend un objectif jugé seulement à la fin (« personnalise » que rien ne mesure, « rester dans le
// cortège », « protéger les siens » sans durée, prévention sans liaison…) : cet objectif ne passe jamais à l'état
// atteint en cours de mission, la phase restait donc PHASE_TIMEOUT (cinq minutes) sur place sans que le joueur puisse
// rien y faire. Relevé de la recette jouée depuis l'accueil (tests/unit/playtest.missions-accueil.test.ts) : l'atelier
// « Porter le bouclier » de l'école, annoncé en trois minutes, restait cinq minutes sur « Quinze blocs de mousse » ;
// « Tenir la ligne » attendait de même ses « commandements à la voix », « Ma première manif » ses « dix slogans »
// (22 phases du catalogue dans ce cas).
import { describe, expect, it } from 'vitest';
import type { CrowdPhase, DirectorApi, GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as missions, missionById, PHASE_TIMEOUT } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { isLiaison, isPreserve } from '@/gameplay/missions/objectives';
import type { ObjectiveRun } from '@/gameplay/missions/objectives';

/** Foule calme, sans journée de service (forces déjà sur place). */
const fake: ModuleFactory = () => [{
  id: 'test.scene',
  order: -10,
  provide(ctx: GameContext) {
    const director: DirectorApi = {
      get phase() { return 'rassemblement' as CrowdPhase; }, tension: 0.1, tensionAt: () => 0.1, addTension: () => {},
      stats: { total: 0, present: 0, dispersed: 0, injured: 0, arrested: 0 } as DirectorApi['stats'], route: [], headProgress: 0,
    };
    ctx.director = director;
  },
} as GameSystem];

/** Phases du catalogue qui attendent un objectif jugé seulement à la fin. */
function gatesOnEndJudged(): string[] {
  const out: string[] = [];
  for (const m of MISSIONS) {
    m.phases.forEach((p, i) => {
      if (p.until.kind !== 'objectif') return;
      const id = p.until.id;
      const def = m.objectives.find((o) => o.id === id);
      const run = { def, state: 'actif', progress: 0, held: 0, note: '' } as unknown as ObjectiveRun;
      if (def && isPreserve(run) && !isLiaison(run)) out.push(`${m.id}#${i}`);
    });
  }
  return out;
}

describe('mission : phase qui attend un objectif jugé seulement à la fin', () => {
  it('le catalogue en contient (sinon ce test ne prouve plus rien)', () => {
    expect(gatesOnEndJudged()).toContain('ecole-02-porter-le-bouclier#1');
  });

  it('« Porter le bouclier » : la phase des blocs de mousse ne retient pas l’atelier cinq minutes', async () => {
    const def = missionById('ecole-02-porter-le-bouclier')!;
    expect(def.phases[1]!.until).toEqual({ kind: 'objectif', id: 'o1' });
    const t = createTestContext({ seed: 2, strict: false, modules: [world, roles, people, items, law, missions, fake] });
    await t.start({ mode: 'libre', missionId: def.id, role: 'crs', x: 0, z: 0, crowdSize: 0 });
    const { ctx } = t;
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, rank: 'gardien_stagiaire', poste: 'bouclier' });
    ctx.player.possess(p.id);
    const api = ctx.service<MissionsApi>('missions')!;
    t.step(2);
    expect(api.phaseIndex).toBe(0);
    let entered = -1;
    let left = -1;
    for (let s = 0; s < PHASE_TIMEOUT + 60 && left < 0; s++) {
      t.step(1);
      if (entered < 0 && api.phaseIndex === 1) entered = ctx.clock.now;
      if (entered >= 0 && api.phaseIndex >= 2) left = ctx.clock.now;
    }
    expect(entered).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
    // l'objectif n'est jamais constaté en cours de mission : la phase passe au bout d'un délai court (trois minutes
    // d'atelier), pas au bout du filet de cinq minutes
    expect(left - entered).toBeLessThan(120);
    expect(api.objectives.find((r) => r.def.id === 'o1')!.state).toBe('actif');
  }, 120000);
});
