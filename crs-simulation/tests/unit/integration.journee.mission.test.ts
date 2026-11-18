// Mission en journée de service : départ d'une caserne ou d'un commissariat choisi selon le lieu (ni sur place, ni à
// l'autre bout de Paris), trajet en colonne, et la mission ne commence qu'à l'arrivée sur place.
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
import { createSystems as missions } from '@/gameplay/missions';
import { JOURNEE_SERVICE, SERVICE_BASES, basePreload, serviceBaseFor } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, missions];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('base de prise de service', () => {
  it('choisit une base entre 1,2 et 3,2 km du lieu (la Cité de préférence)', () => {
    const places: [string, number, number][] = [
      ['République', 3123, -208], ['Bastille', 3542, 1395], ['Concorde', -10, 15], ['Étoile', -1920, -906],
      ['Opéra', 811, -564], ['Trocadéro', -2411, 387], ['Invalides', -596, 626], ['Hôtel de Ville', 2211, 993], ['Châtelet', 1903, 916],
    ];
    for (const [name, x, z] of places) {
      const b = serviceBaseFor(x, z);
      const d = Math.hypot(b.x - x, b.z - z);
      console.log(`${name} → ${b.name} (${d.toFixed(0)} m)`);
      expect(d).toBeGreaterThan(1000);
      expect(d).toBeLessThan(3400);
    }
    expect(serviceBaseFor(3123, -208)).toBe(SERVICE_BASES[0]);
  });
});

describe('mission en journée de service', () => {
  it('commandant : part de la base, la mission démarre à l’arrivée', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
    await t.start({
      mode: 'carriere', missionId: 'cdt-01-prise-de-commandement', role: 'commandant', place: 'Hôtel de Ville', x: 2211, z: 993,
      crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, journee: true, preload: [basePreload()] },
    });
    const { ctx } = t;
    const base = ctx.session.config!.extra!['base'] as { x: number; z: number; name: string };
    const me = ctx.player.person()!;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const m = ctx.service<{ phaseIndex: number; current: unknown }>('missions')!;
    const dBase = Math.hypot(me.x - base.x, me.z - base.z);
    console.log(`base : ${base.name} ; joueur à ${dBase.toFixed(0)} m ; à ${Math.hypot(me.x - 2211, me.z - 993).toFixed(0)} m du lieu`);
    expect(base.name).not.toBe('caserne de la Cité'); // l'Hôtel de Ville est à 500 m de la Cité : trajet trop court
    expect(dBase).toBeLessThan(250);
    t.step(20);
    expect(['embarquement', 'route']).toContain(j.stage);
    expect(m.current).toBeTruthy();
    expect(m.phaseIndex).toBe(-1); // la mission attend l'arrivée
    // (le joueur reste à pied à la base : la colonne l'attend, puis part sans lui ; la sortie du commissariat du 1er est
    // longue — voir le cas connu de playtest.colonne-ia — : la colonne débarquait alors à la base, à 1,8 km du lieu, et
    // la journée la disait « sur place » ; elle finit désormais le trajet)
    for (let i = 0; i < 400 && j.stage !== 'sur_place'; i++) t.step(5);
    t.step(2);
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs' && v.seats[0] !== 0);
    const near = vans.filter((v) => Math.hypot(v.x - 2211, v.z - 993) < 250).length;
    console.log(`arrivée à ${ctx.clock.now.toFixed(0)} s : ${j.stage} ; phase de mission ${m.phaseIndex} ; fourgons à moins de 250 m du lieu : ${near}/${vans.length}`);
    expect(j.stage).toBe('sur_place');
    expect(near).toBeGreaterThan(vans.length / 2);
    // la compagnie débarque au lieu (la ligne se forme devant le fourgon le plus proche, pas devant le VL resté à la base)
    const company = ctx.squads.list.find((q) => q.kind === 'compagnie')!;
    console.log(`ordre de la compagnie : ${company.order.type} (${Math.round(company.order.x)}, ${Math.round(company.order.z)})`);
    expect(Math.hypot(company.order.x - 2211, company.order.z - 993)).toBeLessThan(300);
    expect(m.phaseIndex).toBeGreaterThanOrEqual(0);
  }, 900000);
});
