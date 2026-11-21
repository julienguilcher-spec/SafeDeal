// Encerclement de la place ronde du quartier d'essai : issues trouvées dans le graphe routier, toutes tenues (ou une laissée ouverte).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { ENCIRCLE_CLOSE_ALL } from '@/sim/police/api';
import { startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];

interface Gate { name: string; inBox: (p: Person) => boolean; across: (p: Person) => number; half: number; inward: number }

// Les quatre issues de la place : avenue (40 m entre façades) à l'ouest et à l'est, rue du Pont (14 m) au nord et au sud.
const GATES: Gate[] = [
  { name: 'avenue ouest', inBox: (p) => p.x < -58 && p.x > -82 && Math.abs(p.z) < 21, across: (p) => p.z, half: 20, inward: Math.PI / 2 },
  { name: 'avenue est', inBox: (p) => p.x > 58 && p.x < 82 && Math.abs(p.z) < 21, across: (p) => p.z, half: 20, inward: -Math.PI / 2 },
  { name: 'rue du Pont nord', inBox: (p) => p.z < -58 && p.z > -82 && Math.abs(p.x) < 8, across: (p) => p.x, half: 7, inward: 0 },
  { name: 'rue du Pont sud', inBox: (p) => p.z > 58 && p.z < 82 && Math.abs(p.x) < 8, across: (p) => p.x, half: 7, inward: Math.PI },
];

/** Plus grand vide laissé en travers d'une issue (entre deux agents voisins, ou entre un flanc et la façade). */
function widestGap(pt: PoliceTest, gate: Gate): { gap: number; count: number; facing: number } {
  const here = pt.ctx.people.list.filter((p) => p.faction === 'police' && p.posture !== 'down' && gate.inBox(p));
  // premier rang : les agents les plus avancés vers la place (les autres sont derrière eux)
  const xs = here.map((p) => gate.across(p)).sort((a, b) => a - b);
  let gap = xs.length === 0 ? gate.half * 2 : Math.max(xs[0] + gate.half, gate.half - xs[xs.length - 1]);
  for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i] - xs[i - 1]);
  let facing = 0;
  for (const p of here) if (Math.cos(p.heading - gate.inward) > 0.9) facing++;
  return { gap, count: here.length, facing };
}

describe('police — encerclement', () => {
  it('une compagnie ferme toutes les issues de la place ronde', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: 46, heading: Math.PI, vehicles: false });
    expect(cie.people.length).toBe(70);
    ctx.squads.issue(cie.squad.id, { type: 'encercler', x: 0, z: 0, width: 132, targetId: ENCIRCLE_CLOSE_ALL });
    pt.step(0.2);
    const exits = pt.formation.exits(cie.squad.id);
    console.log('issues :', exits.map((e) => `${e.name} (${e.x.toFixed(0)}, ${e.z.toFixed(0)}) largeur ${e.width.toFixed(1)} m, ${e.agents} agents`).join(' | '));
    expect(exits.length).toBe(4);
    const t0 = ctx.clock.now;
    let placed = -1;
    pt.run(180, 1, () => {
      if (pt.status.of(cie.squad.id)!.phase === 'en_place') {
        placed = ctx.clock.now - t0;
        return true;
      }
    });
    pt.step(25); // le temps que les chefs, partis par le tour de la place, rejoignent leur poste derrière les lignes
    expect(placed).toBeGreaterThan(0);
    for (const gate of GATES) {
      const g = widestGap(pt, gate);
      console.log(gate.name, '—', g.count, 'agents, plus grand vide', g.gap.toFixed(2), 'm, tournés vers la place :', g.facing);
      expect(g.count).toBeGreaterThanOrEqual(6);
      // issue tenue : aucun passage de plus de 2,6 m (ligne lâche), flancs compris
      expect(g.gap).toBeLessThan(2.6);
      expect(g.facing).toBe(g.count);
    }
    console.log('bouclage en place en', placed.toFixed(0), 's');
    expect(ctx.radio.log.some((m) => m.text.includes('Bouclage en place') && m.text.includes('toutes les issues sont fermées'))).toBe(true);
    // personne dans un mur
    for (const p of cie.people) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
  });

  it('laisse ouverte l\'issue désignée par l\'ordre, et deux unités se partagent les autres', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const a = pt.units.createSection({ x: -12, z: 46, heading: Math.PI, callsign: 'MISTRAL 1' });
    const b = pt.units.createSection({ x: 12, z: 46, heading: Math.PI, callsign: 'MISTRAL 2' });
    const c = pt.units.createSection({ x: 0, z: 30, heading: Math.PI, callsign: 'MISTRAL 3' });
    // même ordre aux trois sections (comme le fait la carte tactique) : issue de l'est laissée ouverte
    pt.units.encircle([a.squad.id, b.squad.id, c.squad.id], 0, 0, 66, Math.PI / 2);
    pt.step(0.2);
    const root = pt.units.rootOf(a.squad.id);
    expect(pt.units.rootOf(b.squad.id)).toBe(root);
    expect(pt.units.rootOf(c.squad.id)).toBe(root);
    pt.run(180, 1, () => pt.status.of(root)!.phase === 'en_place');
    pt.step(3);
    const exits = pt.formation.exits(root);
    const open = exits.filter((e) => !e.held);
    expect(open.length).toBe(1);
    expect(open[0].x).toBeGreaterThan(55);
    for (const gate of GATES) {
      const g = widestGap(pt, gate);
      console.log(gate.name, '—', g.count, 'agents, plus grand vide', g.gap.toFixed(2), 'm');
      if (gate.name === 'avenue est') expect(g.count).toBe(0);
      else {
        expect(g.count).toBeGreaterThanOrEqual(4);
        expect(g.gap).toBeLessThan(2.6);
      }
    }
    // un nouvel ordre à l'une des sections lui rend son autonomie
    ctx.squads.issue(b.squad.id, { type: 'tenir' });
    pt.step(0.5);
    expect(pt.units.rootOf(b.squad.id)).toBe(b.squad.id);
  });
});
