// Chef de groupe en mission du catalogue : la mission dit où tenir (« Tenir l'angle de la rue Oberkampf ») ; le
// commandement IA ne lui donne pas en plus un « Ordre : Renfort du barrage » ailleurs. Un seul objectif clair à la fois.
// Relevé par la recette jouée (tests/unit/playtest.missions-police.test.ts, cg-01).
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
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
import { createSystems as session, ORDERS_SERVICE } from '@/gameplay/session';
import type { PlayerOrdersApi } from '@/gameplay/session';
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, missions, objectives];

describe('ordres au joueur pendant une mission du catalogue', () => {
  it('chef de groupe (cg-01) : pas d\'« Ordre » du commandement IA en concurrence avec l\'objectif de la mission', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const def = missionById('cg-01-six-dont-moi')!;
    await t.start(missionConfig(def, t.ctx.world) as SessionConfig);
    const { ctx } = t;
    const api = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const orders = ctx.service<PlayerOrdersApi>(ORDERS_SERVICE)!;
    const seen: string[] = [];
    for (let s = 0; s < 90; s += 5) {
      t.step(5);
      for (const o of api.list) if (o.state === 'actif' && o.id === 'ordre') seen.push(`t=${s} ${o.text}`);
    }
    console.log(`objectifs : ${api.list.filter((o) => o.state === 'actif').map((o) => o.text).join(' | ')} ; ordre : ${orders.current?.text ?? 'aucun'}`);
    // l'objectif de la mission est là, suivi par le GPS
    expect(api.list.some((o) => o.id === 'o1' && o.state === 'actif')).toBe(true);
    expect(seen).toEqual([]);
    expect(orders.current).toBeNull();
  }, 300000);
});
