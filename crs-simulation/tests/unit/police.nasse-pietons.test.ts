// Nasse sur une esplanade : les côtés sans rue (trottoirs, esplanade) sont des issues comme les autres. findExits ne
// retenait que les voies du graphe routier qui franchissent le cercle : à l'est de l'esplanade de l'Hôtel-de-Ville
// (vers 2255, 969), aucune rue ne franchit le cercle, ce côté restait ouvert et les nassés sortaient à pied.
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { ENCIRCLE_CLOSE_ALL } from '@/sim/police/api';
import { startPolice } from '@/sim/police/testkit';

const S = { x: 2219, z: 994 };
const R = 45;

describe('police — nasse : passages piétons', () => {
  it('chaque arc libre du cercle de la nasse est une issue tenue (esplanade de l’Hôtel-de-Ville)', async () => {
    const pt = await startPolice([world, people, items, hazards, law], {
      mode: 'libre', place: 'Hôtel de Ville', x: S.x, z: S.z, crowdSize: 0,
      extra: { foyers: 0, 'traffic.vehicles': 0, 'traffic.pedestrians': 0 },
    } as Partial<SessionConfig>);
    const { ctx } = pt;
    const sec = pt.units.createCompany({ x: S.x + 30, z: S.z + 10, heading: 0, vehicles: false });
    ctx.squads.issue(sec.squad.id, { type: 'encercler', x: S.x, z: S.z, width: R * 2, heading: 0, targetId: ENCIRCLE_CLOSE_ALL });
    pt.step(0.2);
    const exits = pt.formation.exits(sec.squad.id);
    console.log('issues :', exits.map((e) => `${e.name || '?'} (${e.x.toFixed(0)}, ${e.z.toFixed(0)}) ${e.width.toFixed(1)} m`).join(' | '));
    // arcs libres du cercle non couverts par une issue
    const open: string[] = [];
    const n = Math.ceil((2 * Math.PI * R) / 1.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = S.x + Math.sin(a) * R;
      const z = S.z + Math.cos(a) * R;
      if (!ctx.world.isFree(x, z, 0.3) || ctx.world.surfaceAt(x, z) === 'water') continue;
      if (exits.some((e) => Math.hypot(e.x - x, e.z - z) <= e.width / 2 + 2)) continue;
      open.push(`(${x.toFixed(0)}, ${z.toFixed(0)})`);
    }
    console.log('points libres hors issues :', open.length, open.slice(0, 20).join(' '));
    expect(open.length).toBe(0);
  }, 120000);
});
