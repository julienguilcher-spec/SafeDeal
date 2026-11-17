// Nasse : une ligne d'encerclement tenue ne se franchit pas entre deux agents. L'encerclement répartit son effectif
// jusqu'à l'intervalle d'une ligne lâche (2,4 m) et tient alors l'issue pour fermée (police.encerclement) ; le cordon,
// lui, ne naissait qu'en deçà de 1,6 m : avec une seule section sur la place ronde, AUCUN tronçon de l'anneau
// n'existait — un nassé passait entre deux agents de n'importe quelle ligne.
import { describe, expect, it } from 'vitest';
import type { CordonsApi } from '@/core/extensions';
import { EXT } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { ENCIRCLE_CLOSE_ALL } from '@/sim/police/api';
import { frontRank, startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];

describe('police — anneau d’une nasse', () => {
  it('une section seule encercle la place ronde : on ne passe pas entre deux agents d’une même ligne', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const s = pt.units.createSection({ x: 0, z: 46, heading: Math.PI, callsign: 'ORAGE' });
    ctx.squads.issue(s.squad.id, { type: 'encercler', x: 0, z: 0, width: 132, targetId: ENCIRCLE_CLOSE_ALL });
    pt.run(180, 1, () => pt.status.of(s.squad.id)!.phase === 'en_place');
    pt.step(10);
    const cordons = ctx.require<CordonsApi>(EXT.cordons);
    const exits = pt.formation.exits(s.squad.id);
    let lines = 0;
    let pairs = 0;
    let open = 0;
    for (let block = 0; block < exits.length; block++) {
      const front = frontRank(pt, s.squad.id, block);
      if (front.length < 2) continue;
      lines++;
      for (let i = 1; i < front.length; i++) {
        const a = front[i - 1]!;
        const b = front[i]!;
        const gap = Math.hypot(a.x - b.x, a.z - b.z);
        if (gap > 2.6) continue;
        pairs++;
        // de l'intérieur de la place vers l'extérieur, au milieu de l'intervalle
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        const l = Math.hypot(mx, mz);
        if (!cordons.crosses(mx - (mx / l) * 3, mz - (mz / l) * 3, mx + (mx / l) * 3, mz + (mz / l) * 3)) {
          open++;
          console.log(`  intervalle ouvert : ${gap.toFixed(2)} m en (${mx.toFixed(1)}, ${mz.toFixed(1)})`);
        }
      }
    }
    console.log(`[anneau] ${lines} lignes, ${pairs} intervalles de ligne, ${open} franchissables`);
    expect(lines).toBeGreaterThanOrEqual(2);
    expect(pairs).toBeGreaterThan(4);
    expect(open).toBe(0);
  }, 120000);
});
