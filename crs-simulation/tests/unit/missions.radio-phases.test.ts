// Messages des phases d'une mission : un indicatif radio (« MISTRAL 1 », « CENTRAL », « SANTÉ 1 ») passe sur son réseau,
// une voix entendue sur place (« AMIE », « MÉGAPHONE », « CHEF DE GROUPE ») sur le canal public. Relevé par la recette
// jouée : tout émetteur écrit en capitales partait sur le réseau de commandement de la police, si bien que le
// manifestant, qui n'a pas la radio de police, n'entendait aucune des voix de sa propre mission.
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

import { isRadioCallsign } from '@/gameplay/missions/catalog/dsl';

async function heard(id: string, seconds: number) {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const def = missionById(id)!;
  await t.start(missionConfig(def, t.ctx.world) as SessionConfig);
  const { ctx } = t;
  const subs: string[] = [];
  const real = ctx.ui.subtitle.bind(ctx.ui);
  ctx.ui.subtitle = (from: string, text: string, d?: number) => { subs.push(from); real(from, text, d); };
  t.step(seconds);
  return { def, ctx, subs };
}

describe('messages des phases de mission', () => {
  it('manifestant : les voix de la première phase (amie, mégaphone du cortège) sont entendues', async () => {
    const { def, ctx, subs } = await heard('manifestant-01-ma-premiere-manif', 40);
    const voix = def.phases[0]!.radio.filter((l) => !isRadioCallsign(l.from)).map((l) => l.from);
    expect(voix.length).toBeGreaterThan(0);
    for (const v of voix) {
      expect(ctx.radio.log.find((e) => e.from === v)?.channel, v).toBe('public');
      expect(subs, `voix « ${v} » entendue`).toContain(v);
    }
  }, 300000);

  it('CRS : l\'indicatif radio passe sur le réseau de commandement, la voix du chef sur le canal public', async () => {
    const { def, ctx } = await heard('crs-02-pluie-de-paves', 40);
    for (const l of def.phases[0]!.radio) {
      const e = ctx.radio.log.find((m) => m.from === l.from);
      expect(e?.channel, l.from).toBe(isRadioCallsign(l.from) ? 'commandement' : 'public');
    }
  }, 300000);
});
