// Atelier de l'école « Premiers secours » (ecole-04), joué comme dans le jeu : trois mannequins sont annoncés sur l'aire
// d'exercice, le joueur doit les soigner. Relevé par la recette jouée (tests/unit/playtest.missions-police.test.ts) :
// aucun blessé n'existait et le gardien n'avait pas de trousse — l'atelier échouait toujours au bout de trois minutes,
// et le chapitre 0 de la carrière (« Réussir les quatre ateliers ») ne pouvait jamais être terminé.
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
import type { MissionsApi } from '@/gameplay/missions';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions, objectives];

describe('atelier « Premiers secours »', () => {
  it('les mannequins sont là, le gardien a sa trousse et les soigne : l\'atelier est réussi', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const def = missionById('ecole-04-premiers-secours')!;
    await t.start(missionConfig(def, t.ctx.world) as SessionConfig);
    const { ctx } = t;
    const m = ctx.service<MissionsApi>('missions')!;
    t.step(2);
    const me = ctx.player.person()!;
    expect(ctx.actions.has(me, 'trousse_secours')).toBeGreaterThan(0);
    const soins = m.objectives.filter((r) => r.def.kind === 'soigner');
    expect(soins.length).toBe(3);
    for (const r of soins) {
      expect(r.victims?.length ?? 0, `mannequin de ${r.def.id}`).toBeGreaterThanOrEqual(1);
      for (const id of r.victims!) {
        const v = ctx.people.get(id)!;
        expect(v.health).toBeLessThan(100);
        // sur l'aire d'exercice, à portée de pas du joueur
        expect(Math.hypot(v.x - me.x, v.z - me.z)).toBeLessThan(40);
      }
    }
    // le joueur soigne les mannequins dans l'ordre de l'atelier (inconscient, hémorragie, brûlure)
    for (const r of soins) {
      for (const id of r.victims!) {
        const v = ctx.people.get(id)!;
        me.x = v.x + 0.8;
        me.z = v.z;
        expect(ctx.interactions.startVerb(me, 'soigner', id), `soigner ${r.def.id}`).toBe(true);
        for (let i = 0; i < 30 && r.state === 'actif'; i++) t.step(1);
      }
      expect(r.state, r.def.id).toBe('reussi');
    }
    // la dernière phase se joue puis la mission se termine, réussie, avant l'échec des trois minutes
    for (let i = 0; i < 120 && !m.result; i++) t.step(1);
    expect(m.result?.success, m.result?.summary).toBe(true);
  }, 300000);
});
