// Journée de service : prise de service à la caserne de la Cité, embarquement (la colonne attend le joueur), trajet
// en colonne conduit par l’IA, débarquement sur place avec son groupe, puis retour à la caserne et fin de service.
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
import { JOURNEE_SERVICE, SERVICE_BASE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('journée de service', () => {
  it('CRS : caserne → embarquement (on l’attend) → colonne en urgence → débarquement à République → retour', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, journee: true } });
    const { ctx } = t;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const me = ctx.player.person()!;
    const dBase = Math.hypot(me.x - SERVICE_BASE.x, me.z - SERVICE_BASE.z);
    console.log(`départ : joueur à ${dBase.toFixed(0)} m de la caserne ; étape ${j.stage}`);
    expect(dBase).toBeLessThan(250);
    t.step(5);
    expect(j.stage).toBe('embarquement');
    // la colonne attend le joueur : 60 s plus tard, elle n'est pas partie
    t.step(60);
    expect(j.stage).toBe('embarquement');
    const said = ctx.radio.log.map((m) => m.text);

    expect(said.some((x) => /n'attend plus que vous/.test(x))).toBe(true);
    // il monte dans le véhicule de la compagnie le plus proche où il reste une place (celui que l'objectif lui indique)
    const van = ctx.vehicles.list.filter((v) => (v.kind === 'fourgon_crs' || v.kind === 'vl_commandement') && v.seats.some((id, i) => id === 0 && i > 0))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    expect(van).toBeDefined();
    me.x = van.x + 3; me.z = van.z;
    expect(ctx.vehicles.enter(me, van, 'passenger')).toBe(true);
    let routeAt = -1;
    for (let i = 0; i < 60 && j.stage === 'embarquement'; i++) t.step(5);
    routeAt = ctx.clock.now;
    console.log(`colonne partie (${j.stage}) ; destination ${j.destination?.name} ; sirène ${van.siren}`);
    expect(j.stage).toBe('route');
    expect(van.seats[0]).not.toBe(me.id); // c'est l'IA qui conduit
    for (let i = 0; i < 120 && j.stage === 'route'; i++) t.step(5);
    const dest = j.destination!;
    console.log(`arrivée après ${(ctx.clock.now - routeAt).toFixed(0)} s : étape ${j.stage} ; joueur à pied ${me.vehicleId === 0} à ${Math.hypot(me.x - dest.x, me.z - dest.z).toFixed(0)} m de la zone de stationnement`);
    expect(j.stage).toBe('sur_place');
    expect(me.vehicleId).toBe(0);
    expect(Math.hypot(me.x - dest.x, me.z - dest.z)).toBeLessThan(120);

    // fin de mission prononcée : rembarquement, la colonne attend le joueur, puis retour à la caserne
    t.step(30);
    const cmd = ctx.service<{ endMission(id: number): void; convoyOf(id: number): { stage: string } | null }>('police.command')!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    cmd.endMission(company.id);
    for (let i = 0; i < 80 && j.stage === 'sur_place'; i++) t.step(5);
    console.log(`fin de mission : étape ${j.stage} ; convoi ${cmd.convoyOf(company.id)?.stage}`);
    expect(j.stage).toBe('rembarquement');
    t.step(40);
    expect(cmd.convoyOf(company.id)?.stage).toBe('rembarquement'); // on l'attend
    const back = ctx.vehicles.list.filter((v) => (v.kind === 'fourgon_crs' || v.kind === 'vl_commandement') && v.seats.some((id, i) => id === 0 && i > 0))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    me.x = back.x + 3; me.z = back.z;
    expect(ctx.vehicles.enter(me, back, 'passenger')).toBe(true);
    for (let i = 0; i < 260 && (j.stage === 'retour' || j.stage === 'rembarquement'); i++) t.step(5);
    console.log(`retour : étape ${j.stage} ; joueur à ${Math.hypot(me.x - SERVICE_BASE.x, me.z - SERVICE_BASE.z).toFixed(0)} m de la caserne`);

    // seconde intervention : feux dans un autre quartier, la colonne y va, cordon, puis retour
    expect(j.stage).toBe('intervention_route');
    expect(ctx.radio.log.some((m) => /Changement de mission/.test(m.text))).toBe(true);
    for (let i = 0; i < 200 && j.stage === 'intervention_route'; i++) t.step(5);
    const site = j.destination!;
    console.log(`intervention : étape ${j.stage} ; ${site.name} ; joueur à pied ${me.vehicleId === 0} à ${Math.hypot(me.x - site.x, me.z - site.z).toFixed(0)} m ; ordre de la compagnie ${company.order.type}`);
    expect(j.stage).toBe('intervention');
    expect(company.order.type).toBe('proteger');
    for (let i = 0; i < 120 && j.stage === 'intervention'; i++) t.step(5);
    expect(j.stage).toBe('rembarquement');
    t.step(20);
    if (me.vehicleId === 0) {
      const v2 = ctx.vehicles.list.filter((v) => (v.kind === 'fourgon_crs' || v.kind === 'vl_commandement') && v.seats.some((id, i) => id === 0 && i > 0))
        .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
      me.x = v2.x + 3; me.z = v2.z;
      ctx.vehicles.enter(me, v2, 'passenger');
    }
    for (let i = 0; i < 250 && j.stage !== 'fin'; i++) t.step(5);
    console.log(`fin de journée : étape ${j.stage}`);
    expect(j.stage).toBe('fin');
    expect(ctx.radio.log.some((m) => /fin de service/.test(m.text))).toBe(true);
  }, 3000000);
});
