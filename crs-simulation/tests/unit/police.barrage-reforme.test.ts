// Un barrage qui perd un agent (évacué, relevé) se resserre (reform) : il doit rester un barrage — de façade à façade et coude à coude,
// et la porte d'un barrage filtrant doit rester ouverte. reform() reconstruisait toute ligne sans porte et avec
// l'intervalle d'une ligne lâche (2,4 m) : la sortie filtrée se refermait, ou des trous d'un mètre et demi s'ouvraient.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { frontRank, startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];

/** Plus grand vide en travers de la rue du Pont (façades à x = ±7), premier rang compris. */
function widestGap(front: Person[]): number {
  const xs = front.filter((p) => p.posture !== 'down').map((p) => p.x).sort((a, b) => a - b);
  let gap = Math.max(xs[0]! + 7, 7 - xs[xs.length - 1]!);
  for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i]! - xs[i - 1]!);
  return gap;
}

async function placed(type: 'filtrer' | 'tenir'): Promise<{ pt: PoliceTest; id: number }> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
  const sec = pt.units.createSection({ x: 0, z: -70, heading: Math.PI, vehicles: false });
  pt.ctx.squads.issue(sec.squad.id, { type, x: 0, z: -100, heading: Math.PI, width: 0 });
  pt.run(90, 1, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
  pt.step(5);
  return { pt, id: sec.squad.id };
}

describe('police — barrage qui se resserre', () => {
  it('un barrage filtrant garde sa porte après la perte d’un agent', async () => {
    const { pt, id } = await placed('filtrer');
    const before = widestGap(frontRank(pt, id));
    // un agent du premier rang, loin de la porte, quitte le dispositif (évacué, relevé)
    const front = frontRank(pt, id);
    const out = front[0]!;
    pt.ctx.people.remove(out.id);
    pt.step(8);
    const after = frontRank(pt, id);
    const gap = widestGap(after.filter((p) => p !== out));
    console.log(`porte avant ${before.toFixed(2)} m, après ${gap.toFixed(2)} m ; ${after.length} au premier rang`);
    expect(before).toBeGreaterThan(2.2);
    expect(gap).toBeGreaterThan(2.2);
  }, 120000);

  it('une rue barrée qui perd un agent reste tenue coude à coude', async () => {
    const { pt, id } = await placed('tenir');
    const front = frontRank(pt, id);
    const out = front[Math.floor(front.length / 2)]!;
    pt.ctx.people.remove(out.id);
    pt.step(8);
    const after = frontRank(pt, id).filter((p) => p !== out);
    const xs = after.map((p) => p.x).sort((a, b) => a - b);
    let inner = 0;
    for (let i = 1; i < xs.length; i++) inner = Math.max(inner, xs[i]! - xs[i - 1]!);
    console.log(`après la perte : ${after.length} au premier rang, plus grand intervalle ${inner.toFixed(2)} m`);
    expect(inner).toBeLessThan(1.3);
  }, 120000);
});
