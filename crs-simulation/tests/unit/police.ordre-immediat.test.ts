// Section ou compagnie fraîchement créée qui reçoit aussitôt un ordre de formation ou de mouvement : toute sa
// descendance s'y met (aucun agent laissé à l'ancienne formation), les agents rejoignent leur emplacement ou le but,
// et l'unité ne rend compte « en place » qu'une fois le gros de ses agents à son emplacement.
import { describe, expect, it } from 'vitest';

import type { OrderType, Person, SquadOrder } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { IN_PLACE_EVENT } from '@/sim/police/api';
import { startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const NORTH = Math.PI;

function foot(pt: PoliceTest, people: readonly Person[]): Person[] {
  return people.filter((p) => p.vehicleId === 0 && p.poste !== 'conducteur');
}

/** Agents à moins de `tol` mètres de leur emplacement. */
function onSlot(pt: PoliceTest, people: readonly Person[], tol: number): number {
  return people.filter((p) => { const d = pt.slots.distanceToSlot(p.id); return d >= 0 && d <= tol; }).length;
}

const CASES: { type: OrderType; order: Partial<SquadOrder>; company?: boolean }[] = [
  { type: 'ligne', order: { x: 0, z: -140, heading: NORTH } },
  { type: 'tenir', order: { x: 0, z: -125, heading: NORTH } },
  { type: 'colonne', order: { x: 0, z: -160, heading: NORTH } },
  { type: 'avancer', order: { x: 0, z: -125, heading: NORTH } },
  { type: 'avancer', order: { x: 0, z: -190, heading: NORTH } },
  { type: 'repli', order: { x: 0, z: -60, heading: NORTH } },
  { type: 'couper_circulation', order: { x: 0, z: -130, heading: NORTH } },
  { type: 'filtrer', order: { x: 0, z: -130, heading: NORTH } },
  { type: 'ligne', order: { x: 0, z: -150, heading: NORTH }, company: true },
  { type: 'colonne', order: { x: 0, z: -175, heading: NORTH }, company: true },
];

describe('ordre donné dès la création de l’unité', () => {
  for (const c of CASES) {
    it(`${c.company ? 'compagnie' : 'section'} fraîche : « ${c.type} » vers (${c.order.x}, ${c.order.z})`, async () => {
      const pt = await startPolice([world, people, items, hazards, law], { mode: 'test', x: 0, z: -100 });
      const { ctx } = pt;
      pt.step(3);
      const h = c.company ? pt.units.createCompany({ x: 0, z: -95, heading: NORTH, vehicles: false }) : pt.units.createSection({ x: 0, z: -95, heading: NORTH });
      const ppl = foot(pt, h.people);
      let placedOk = -1;
      ctx.events.onAny(IN_PLACE_EVENT, (e) => {
        if ((e as { squadId: number }).squadId === h.squad.id && placedOk < 0) placedOk = onSlot(pt, ppl, 1.5);
      });
      ctx.squads.issue(h.squad.id, { type: c.type, heading: 0, width: 0, ...c.order } as SquadOrder);
      pt.run(150, 1, () => placedOk >= 0);
      pt.step(2);
      // toute la descendance manœuvre avec l'unité qui a reçu l'ordre
      const roots = new Set(ppl.map((p) => pt.units.rootOf(p.squadId)));
      const near = onSlot(pt, ppl, 1.5);
      console.log(`${c.type}${c.company ? ' (compagnie)' : ''} : en place avec ${placedOk}/${ppl.length} à leur emplacement ; ${near} maintenant ; racines ${[...roots].join(',')}`);
      expect(roots.size).toBe(1);
      expect([...roots][0]).toBe(h.squad.id);
      expect(placedOk).toBeGreaterThanOrEqual(Math.ceil(ppl.length * 0.66));
      expect(near).toBeGreaterThanOrEqual(Math.ceil(ppl.length * 0.8));
    }, 120000);
  }
});
