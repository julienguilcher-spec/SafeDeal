// Embarquement : l'agent qui rejoint son véhicule contourne ce qui le sépare de sa portière. Plaqué contre un autre
// véhicule garé entre lui et son fourgon (bloc garé serré, fourgon voisin), il restait face à la caisse, à pousser,
// sans jamais embarquer : le contournement par un coin du véhicule écartait tous les coins dès que l'agent touchait la
// caisse (marge de 0,3 m autour de la boîte, l'agent lui-même dedans), et l'itinéraire piéton ignore les véhicules.
import { describe, expect, it } from 'vitest';
import type { Person, Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { agentOf } from '@/sim/police/brain';
import { startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law, vehicles];
const NORTH = Math.PI;

/** Section débarquée, en place ; un agent à pied et son fourgon. */
async function scene(): Promise<{ pt: PoliceTest; p: Person; v: Vehicle }> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 400 });
  const { ctx } = pt;
  const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'embarque', vehicles: true });
  ctx.squads.issue(sec.squad.id, { type: 'debarquer', x: 0, z: -100, heading: NORTH });
  pt.run(90, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
  const p = sec.people.find((q) => q.vehicleId === 0 && q.poste !== 'conducteur' && !q.isPlayer)!;
  const driver = sec.people.find((q) => q.vehicleId !== 0)!;
  return { pt, p, v: ctx.vehicles.get(driver.vehicleId)! };
}

describe('police — embarquement : contourner ce qui sépare l’agent de sa portière', () => {
  for (const side of [1, -1]) {
    it(`agent plaqué contre un fourgon garé entre lui et le sien (côté ${side > 0 ? 'droit' : 'gauche'})`, async () => {
      const { pt, p, v } = await scene();
      const { ctx } = pt;
      // fourgon voisin garé côte à côte, flanc contre flanc (deux files du bloc, 3,6 m d'axe en axe) ; l'agent, de
      // l'autre côté du voisin, contre sa caisse
      const dx = Math.cos(v.heading) * side, dz = -Math.sin(v.heading) * side;
      const ox = v.x + dx * 3.6, oz = v.z + dz * 3.6;
      expect(ctx.world.isFree(ox + dx * 2, oz + dz * 2, 3.2)).toBe(true);
      const ob = ctx.vehicles.spawn('fourgon_crs', ox, oz, v.heading, { faction: 'police' });
      p.x = ob.x + dx * (ob.def.width * 0.5 + 0.35);
      p.z = ob.z + dz * (ob.def.width * 0.5 + 0.35);
      const a = agentOf(p)!;
      a.boardId = v.id;
      a.boardAt = 0;
      a.hasSlot = false;
      a.pathN = 0;
      // (bien avant le repli « coincé hors de vue », 30 s et plus)
      let t = 0;
      for (; t < 25 && p.vehicleId === 0; t += 0.5) pt.step(0.5);
      console.log(`côté ${side} : à bord ${p.vehicleId === v.id ? 'en ' + t + ' s' : 'NON'} ; agent à ${Math.hypot(p.x - v.x, p.z - v.z).toFixed(1)} m du fourgon`);
      expect(p.vehicleId).toBe(v.id);
    }, 120000);
  }
});
