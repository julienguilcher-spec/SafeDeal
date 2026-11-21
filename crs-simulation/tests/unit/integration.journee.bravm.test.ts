// Journée de service avec la BRAV-M : chaque unité part de sa base (la compagnie de la caserne, la BRAV-M de son
// commissariat) et tout le monde se retrouve à la zone de stationnement ; aucune colonne ne reste figée au départ.
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
import { JOURNEE_SERVICE, basePreload } from '@/gameplay/session';
import { bravmBasePreload } from '@/gameplay/session/journee-data';
import type { JourneeApi } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('journée de service — BRAV-M', () => {
  it('la BRAV-M et la compagnie partent chacune de leur base et se retrouvent sur place', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'bravm', rank: 'brigadier_chef', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard',
      extra: { moyens: MEANS, journee: true, poste: 'pilote_moto', preload: [basePreload(), bravmBasePreload()] } });
    const { ctx } = t;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const me = ctx.player.person()!;
    const faucon = ctx.squads.list.find((s) => s.name === 'FAUCON 1')!;
    const motos = ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm' && Math.hypot(v.x - me.x, v.z - me.z) > 50);
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs');
    expect(faucon).toBeDefined();
    t.step(40);
    // le joueur, chef de bord, est parti en tête de ses motards
    const dest = j.destination!;
    me.x = dest.x + 30; me.z = dest.z;
    for (let i = 0; i < 20; i++) t.step(50);
    const near = (v: { x: number; z: number }, r: number): boolean => Math.hypot(v.x - dest.x, v.z - dest.z) < r;
    console.log(`BRAV-M : ${motos.filter((v) => near(v, 80)).length}/${motos.length} motos sur place ; fourgons ${vans.map((v) => Math.hypot(v.x - dest.x, v.z - dest.z).toFixed(0)).join(' ')} m ; étape ${j.stage}`);
    // toutes les motos (une moto arrêtée en route, « en position » à des kilomètres, n'arrivait jamais)
    expect(motos.filter((v) => near(v, 80)).length).toBe(motos.length);
    expect(vans.filter((v) => near(v, 150)).length).toBeGreaterThanOrEqual(2);
  }, 900000);
});
