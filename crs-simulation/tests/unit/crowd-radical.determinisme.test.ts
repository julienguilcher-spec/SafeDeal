// Groupes radicaux — déterminisme : la même graine rejoue exactement la même journée (mêmes faits aux mêmes
// instants, mêmes compteurs, mêmes positions) ; une autre graine en donne une autre.
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

async function play(seed: number): Promise<{ log: string; stats: string; where: string; facts: number }> {
  const t = createRadicalTest({ seed, modules: MODULES });
  const { ctx, watch } = t;
  await t.start(avenueConfig({ seed }));
  t.run(1);
  chantier(ctx, 186, 15);
  const line = policeLine(ctx, 250, 0, -Math.PI / 2, 14);
  t.run(1);
  raiseShields(ctx, line);
  t.run(200);
  const api = ctx.require<RadicalApi>(CROWD_RADICAL);
  const log = watch.facts.map((f) => f.t.toFixed(2) + ':' + f.fact + ':' + f.groupId).join('|') + '#' + Object.entries(watch.signs).map(([k, v]) => k + '@' + v.toFixed(2)).join(',');
  let sx = 0;
  let sz = 0;
  for (const p of t.radicals()) {
    sx += p.x;
    sz += p.z;
  }
  return { log, stats: JSON.stringify(api.stats), where: sx.toFixed(3) + ',' + sz.toFixed(3) + ',' + watch.thrown, facts: watch.facts.length };
}

describe('groupes radicaux — déterminisme', () => {
  it('rejoue la même journée avec la même graine', async () => {
    const a = await play(5);
    const b = await play(5);
    const c = await play(6);
    console.log('[radicaux] déterminisme : faits', a.facts, '| projectiles et barycentre', a.where, '| autre graine', c.where, 'faits', c.facts);
    expect(a.facts).toBeGreaterThan(3);
    expect(b.log).toBe(a.log);
    expect(b.stats).toBe(a.stats);
    expect(b.where).toBe(a.where);
    expect(c.log === a.log && c.where === a.where).toBe(false);
  }, 600_000);
});
