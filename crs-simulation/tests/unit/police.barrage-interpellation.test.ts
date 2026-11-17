// Interpellation et secours menés depuis une rue barrée : le binôme et ses boucliers de couverture sortent du SECOND
// rang, jamais du premier. Le premier rang tient la rue de façade à façade : y prendre deux agents (et deux boucliers)
// ouvrait des trous de plusieurs mètres par où la foule passait.
// Quartier d'essai : rue du Pont (14 m entre façades, axe x = 0).
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
const LINE_Z = -100;

/** Plus grand vide en travers de la rue (façades à x = ±7), parmi les agents du premier rang restés sur la ligne. */
function widestGap(front: Person[]): number {
  const xs = front.filter((p) => p.posture !== 'down' && Math.abs(p.z - LINE_Z) < 1.6).map((p) => p.x).sort((a, b) => a - b);
  if (xs.length === 0) return 14;
  let gap = Math.max(xs[0]! + 7, 7 - xs[xs.length - 1]!);
  for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i]! - xs[i - 1]!);
  return gap;
}

async function barred(): Promise<{ pt: PoliceTest; id: number }> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
  const sec = pt.units.createSection({ x: 0, z: -70, heading: Math.PI, vehicles: false });
  pt.ctx.squads.issue(sec.squad.id, { type: 'tenir', x: 0, z: LINE_Z, heading: Math.PI, width: 0 });
  pt.run(90, 1, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
  pt.step(5);
  return { pt, id: sec.squad.id };
}

describe('police — interpellation depuis une rue barrée', () => {
  it('le binôme et la couverture sortent du second rang : le premier rang ne s’ouvre jamais de plus d’une personne', async () => {
    const { pt, id } = await barred();
    const { ctx } = pt;
    const front0 = frontRank(pt, id);
    const base = widestGap(front0);
    // un casseur à 8 m devant la ligne, fait constaté
    const target = ctx.people.spawn({ kind: 'manifestant', x: 1, z: LINE_Z - 8 });
    ctx.law.recordOffense(target, 'degradation', target.x, target.z, 2);
    expect(ctx.law.canArrest(target)).toBe(true);
    ctx.squads.issue(id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z });
    let worst = 0;
    let doorT = 0;
    let crossed = 0;
    const front = new Set(front0.map((p) => p.id));
    const side = new Map<number, number>();
    // de la sortie du binôme jusqu'à l'escorte de l'interpellé (le retour par la ligne relève de barrages.ts)
    pt.run(40, 0.1, () => {
      const gap = widestGap(front0);
      worst = Math.max(worst, gap);
      if (gap > 1.3) doorT += 0.1;
      // personne d'autre que les agents de l'unité ne franchit la ligne
      for (const p of ctx.people.list) {
        if (front.has(p.id) || p.faction === 'police' || Math.abs(p.x) > 7) continue;
        const s = Math.sign(p.z - LINE_Z);
        const was = side.get(p.id);
        if (was !== undefined && was !== s) crossed++;
        side.set(p.id, s);
      }
      return target.custody === 'escorted';
    });
    console.log(`ligne : vide de ${base.toFixed(2)} m au départ, ${worst.toFixed(2)} m au pire pendant l’interpellation (porte ${doorT.toFixed(1)} s) ; cible ${target.custody}`);
    expect(target.custody).toBe('escorted');
    // la porte du binôme a la largeur d'un homme et se referme dès qu'il est passé ; aucun agent du premier rang ne sort
    expect(worst).toBeLessThan(1.6);
    expect(doorT).toBeLessThan(2.5);
    expect(crossed).toBe(0);
  }, 120000);
});
