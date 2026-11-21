// Embarquement d'un retardataire : le repli « coincé » (montée à bord hors de vue) ne doit pas téléporter un agent
// dans un véhicule lointain, ni se déclencher aussitôt sur un horodatage d'un embarquement précédent.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { agentOf } from '@/sim/police/brain';
import { startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law, vehicles];
const NORTH = Math.PI;

describe('police — embarquement d\'un agent loin de son véhicule', () => {
  it('un ordre d\'embarquement tardif (horodatage ancien) ne fait pas monter à bord un agent à 300 m', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 400 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'embarque', vehicles: true });
    ctx.squads.issue(sec.squad.id, { type: 'debarquer', x: 0, z: -100, heading: NORTH });
    pt.run(90, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const p = sec.people.find((q) => q.vehicleId === 0 && q.poste !== 'conducteur' && !q.isPlayer)!;
    const a = agentOf(p)!;
    const driver = sec.people.find((q) => q.vehicleId !== 0)!;
    const v = ctx.vehicles.get(driver.vehicleId)!;
    expect(v).toBeTruthy();
    // l'agent s'est éloigné (300 m) ; un module (convoi) lui désigne le véhicule comme le fait boardStragglers :
    // boardId seul, l'horodatage boardAt restant celui d'un embarquement d'il y a longtemps
    p.x = v.x + 300;
    p.z = v.z;
    a.boardAt = 1;
    a.boardId = v.id;
    a.hasSlot = false;
    a.pathN = 0;
    pt.step(2);
    console.log('agent à', Math.hypot(p.x - v.x, p.z - v.z).toFixed(0), 'm, à bord :', p.vehicleId);
    expect(p.vehicleId).toBe(0);
  });

  it('un embarquement précédent ne laisse pas d\'horodatage périmé au retardataire suivant', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 400 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'embarque', vehicles: true });
    ctx.squads.issue(sec.squad.id, { type: 'debarquer', x: 0, z: -100, heading: NORTH });
    pt.run(90, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    ctx.squads.issue(sec.squad.id, { type: 'embarquer' });
    pt.run(120, 1, () => pt.status.of(sec.squad.id)!.phase === 'embarque');
    ctx.squads.issue(sec.squad.id, { type: 'debarquer', x: 0, z: -100, heading: NORTH });
    pt.run(90, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    pt.step(5);
    const p = sec.people.find((q) => q.vehicleId === 0 && q.poste !== 'conducteur' && !q.isPlayer)!;
    const a = agentOf(p)!;
    const driver = sec.people.find((q) => q.vehicleId !== 0)!;
    const v = ctx.vehicles.get(driver.vehicleId)!;
    // retardataire désigné par la colonne (boardStragglers) : boardId seul, sans horodatage, à 60 m de son véhicule
    p.x = v.x + 60;
    p.z = v.z;
    a.boardId = v.id;
    a.hasSlot = false;
    a.pathN = 0;
    pt.step(2);
    console.log('agent à', Math.hypot(p.x - v.x, p.z - v.z).toFixed(0), 'm, à bord :', p.vehicleId);
    expect(p.vehicleId).toBe(0);
  });
});
