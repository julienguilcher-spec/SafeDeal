// Engin lanceur d'eau dont le JOUEUR est l'opérateur des canons (place « gunner ») : un ordre de jet ou d'extinction
// donné à son engin par le commandement est une tâche pour lui (session/orders.ts : « extinction », « jet ») ; l'IA de
// l'équipage (command/canon.ts) ne doit pas tirer à sa place avec ses mains — la force employée lui serait imputée
// (registre de l'emploi de la force, compte rendu) sans qu'il ait touché à la détente.
import { describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
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
import { createSystems as session } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 1, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('canon à eau : le joueur est l’opérateur des canons', () => {
  it('un ordre d’extinction donné à son engin ne fait pas tirer l’IA avec l’identité du joueur', async () => {
    const t = createTestContext({ seed: 11, strict: true, modules: SIM });
    await t.start({ mode: 'libre', missionId: '', role: 'operateur_canon_eau', rank: null, place: 'essai', x: -10, z: 15, crowdSize: 0, tension: 0, volatility: 0, duration: 'standard', extra: { moyens: MEANS } } as never);
    const { ctx } = t;
    t.step(2);
    const me = ctx.player.person()!;
    const sq = ctx.squads.get(me.squadId)!;
    const v = ctx.vehicles.get(sq.vehicleId)!;
    expect(v.kind).toBe('canon_eau');
    // le joueur à la place de l'opérateur (canon gauche, place 1), un équipier IA au volant
    if (me.vehicleId !== v.id || me.seat !== 1) {
      if (me.vehicleId !== 0) ctx.vehicles.exit(me);
      const other = v.seats[1] !== 0 ? ctx.people.get(v.seats[1])! : null;
      if (other) ctx.vehicles.exit(other);
      me.x = v.x + 3; me.z = v.z;
      expect(ctx.vehicles.enter(me, v, 1)).toBe(true);
      // l'équipier délogé prend le volant
      if (other && v.seats[0] === 0) { other.x = v.x - 3; other.z = v.z; ctx.vehicles.enter(other, v, 0); }
    }
    // un équipier IA au volant (l'équipage peut encore être à pied au début de la session)
    if (v.seats[0] === 0) {
      const crew = sq.members.map((id) => ctx.people.get(id)!).find((p) => p && !p.isPlayer && p.vehicleId === 0);
      if (crew) { crew.x = v.x - 3; crew.z = v.z; ctx.vehicles.enter(crew, v, 0); }
    }
    expect(v.seats[0], 'un conducteur IA').not.toBe(0);
    // un feu au sol à vingt mètres devant l'engin
    const fx = v.x + Math.sin(v.heading) * 20, fz = v.z + Math.cos(v.heading) * 20;
    ctx.hazards.ignite(fx, fz, 1.5, 1, 0);
    const fired: number[] = [];
    const fire = ctx.vehicles.fireTurret.bind(ctx.vehicles);
    ctx.vehicles.fireTurret = ((vv, i, by) => { if (vv === v) fired.push(by); return fire(vv, i, by); }) as typeof ctx.vehicles.fireTurret;
    // l'ordre vient du commandement (pas du joueur)
    ctx.squads.issue(sq.id, { type: 'eteindre', x: fx, z: fz, targetId: 0, heading: 0, width: 0, issuedBy: 0 });
    t.step(30);
    console.log(`tirs sur l’engin : ${fired.length}, dont ${fired.filter((id) => id === me.id).length} au nom du joueur`);
    expect(fired.filter((id) => id === me.id)).toEqual([]);
    // l'équipage éteint quand même, avec l'autre canon
    expect(fired.length).toBeGreaterThan(0);
  }, 120000);
});
