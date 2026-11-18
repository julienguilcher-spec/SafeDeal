// Patrouilles engagées depuis un commissariat : deploy() pose la voiture à sa place réservée (rue Chauchat → places du
// 9e), équipage de trois à bord, « Au poste » — aussi en mission, où aucune patrouille n'est mise en place d'office ;
// elle reste immobile et silencieuse jusqu'au premier ordre ; send() la fait partir en urgence ; sendHome() la ramène
// sans deux tons à sa place, où elle repasse « Au poste ». La mise en place ordinaire des patrouilles est inchangée.
import { describe, expect, it } from 'vitest';

import type { SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE, PatrolsSystem } from '@/gameplay/patrols';
import type { PatrolPose, PatrolsApi } from '@/gameplay/patrols';
import { commissariatById } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, police, radio, session, patrols];
const MEANS = { sections: 1, fourgons: 1, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const REPUBLIQUE = { x: 3123, z: -208 };

/** Place de tête d'une unité du stock d'un commissariat. */
function slotOf(siteId: string, entryId: string): { pose: PatrolPose; door: { x: number; z: number } } {
  const def = commissariatById(siteId)!;
  const tpl = def.stock.find((s) => s.id === entryId)!;
  const s = def.slots[tpl.slots[0]!]!;
  return { pose: { x: s.x, z: s.z, heading: s.heading }, door: def.door };
}

async function start(config: Partial<SessionConfig>, seed = 7) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
    tension: 0.2, volatility: 0.2, duration: 'standard', ...config,
    extra: { moyens: MEANS, variante: 'salle', foyers: 0, ...(config.extra ?? {}) },
  } as Partial<SessionConfig>);
  t.step(1);
  return { t, ctx: t.ctx, api: t.ctx.require<PatrolsApi>(PATROLS_SERVICE) };
}

function angle(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

describe('patrouilles engagées depuis un commissariat', () => {
  it('deploy en mission : au poste, trois à bord, immobile 15 min ; send() en urgence ; sendHome() sans deux tons jusqu’à sa place', async () => {
    const config: Partial<SessionConfig> = { mode: 'carriere', missionId: 'crs-01-premier-samedi' };
    expect(PatrolsSystem.count({ role: 'commandant', missionId: 'crs-01-premier-samedi' })).toBe(0);
    const { t, ctx, api } = await start(config);
    expect(api.list.length).toBe(0);
    const { pose, door } = slotOf('9e', '9e:tv19');
    const id = api.deploy('tv', 'TV 75-19', 'commissariat du 9e', pose, door);
    expect(id).toBeGreaterThan(0);
    expect(api.isPatrol(id)).toBe(true);
    const view = api.statusOf(id)!;
    expect(view.state).toBe('au_poste');
    expect(view.label).toBe('Au poste');
    expect(view.home).toBe('commissariat du 9e');
    const v = ctx.vehicles.get(view.vehicleId)!;
    expect(v.kind).toBe('voiture_police');
    expect(v.faction).toBe('police');
    expect(Math.hypot(v.x - pose.x, v.z - pose.z)).toBeLessThan(0.05);
    expect(angle(v.heading, pose.heading)).toBeLessThan(0.01);
    const squad = ctx.squads.get(id)!;
    expect(squad.name).toBe('TV 75-19');
    expect(squad.members.length).toBe(3);
    for (const m of squad.members) expect(ctx.people.get(m)!.vehicleId).toBe(v.id);
    expect(v.seats[0]).not.toBe(0);

    // au poste : immobile et silencieuse pendant un quart d'heure
    const t0 = ctx.clock.now;
    let drift = 0;
    for (let k = 0; k < 30; k++) {
      t.step(30);
      drift = Math.max(drift, Math.hypot(v.x - pose.x, v.z - pose.z));
    }
    expect(drift).toBeLessThan(0.5);
    expect(view.state).toBe('au_poste');
    expect(ctx.radio.log.filter((m) => m.from === 'TV 75-19' && m.t > t0)).toEqual([]);

    // engagée : en urgence vers la place de la République
    expect(api.send(id, REPUBLIQUE.x, REPUBLIQUE.z)).toBe(true);
    t.step(2);
    expect(view.state).toBe('en_route');
    let sirens = 0, samples = 0;
    for (let k = 0; k < 200 && view.state === 'en_route'; k++) {
      t.step(2);
      if (Math.abs(v.speed) > 2) {
        samples++;
        if (v.siren !== 0) sirens++;
      }
    }
    console.log(`aller : ${view.state}, à ${Math.round(Math.hypot(v.x - REPUBLIQUE.x, v.z - REPUBLIQUE.z))} m de République, sirène ${sirens}/${samples}`);
    expect(samples).toBeGreaterThan(10);
    expect(sirens / samples).toBeGreaterThan(0.8);
    expect(Math.hypot(v.x - pose.x, v.z - pose.z)).toBeGreaterThan(500);

    // retour au commissariat, sans deux tons
    const t1 = ctx.clock.now;
    expect(api.sendHome(id, pose)).toBe(true);
    expect(view.state).toBe('en_route');
    expect(view.label).toBe('Retour au poste');
    let loud = 0, moving = 0;
    for (let k = 0; k < 450 && view.state !== 'au_poste'; k++) {
      t.step(2);
      if (Math.abs(v.speed) > 1) {
        moving++;
        if (v.siren !== 0 || v.beacons) loud++;
      }
    }
    t.step(20);
    const d = Math.hypot(v.x - pose.x, v.z - pose.z);
    const said = ctx.radio.log.filter((m) => m.from === 'TV 75-19' && m.t >= t1).map((m) => m.text);
    console.log(`retour : ${view.state} en ${Math.round(ctx.clock.now - t1)} s, à ${d.toFixed(1)} m de sa place, cap ${(angle(v.heading, pose.heading) * 180 / Math.PI).toFixed(0)}° | ${said.join(' / ')}`);
    expect(view.state).toBe('au_poste');
    expect(view.label).toBe('Au poste');
    expect(moving).toBeGreaterThan(10);
    expect(loud).toBe(0);
    expect(d).toBeLessThan(15);
    expect(said.length).toBeGreaterThanOrEqual(2);
    expect(said.some((m) => m.includes('Je rentre au commissariat du 9e, sans urgence'))).toBe(true);
    expect(said.some((m) => m.includes('Au poste, commissariat du 9e'))).toBe(true);
    for (const m of squad.members) expect(ctx.people.get(m)!.vehicleId).toBe(v.id);
  }, 900000);

  it('deploy BAC : trois policiers en civil, voiture banalisée quand elle est définie, sinon voiture de police', async () => {
    const { ctx, api } = await start({ extra: { patrouilles: 0 } } as Partial<SessionConfig>);
    const { pose, door } = slotOf('9e', '9e:bac09');
    const id = api.deploy('bac', 'BAC 75-09', 'commissariat du 9e', pose, door);
    const view = api.statusOf(id)!;
    const v = ctx.vehicles.get(view.vehicleId)!;
    expect(view.kind).toBe('bac');
    expect(view.state).toBe('au_poste');
    expect(v.kind).toBe(ctx.vehicles.def('voiture_bac') ? 'voiture_bac' : 'voiture_police');
    const squad = ctx.squads.get(id)!;
    expect(squad.members.length).toBe(3);
    for (const m of squad.members) {
      const p = ctx.people.get(m)!;
      expect(p.kind).toBe('policier_civil');
      expect(p.vehicleId).toBe(v.id);
    }
  }, 300000);

  it('mise en place ordinaire inchangée et identique à graine égale', async () => {
    const snapshot = async () => {
      const { ctx, api } = await start({ extra: { patrouilles: 5 } } as Partial<SessionConfig>, 13);
      return api.list.map((p) => {
        const v = ctx.vehicles.get(p.vehicleId)!;
        const crew = ctx.squads.get(p.squadId)!.members.map((m) => {
          const q = ctx.people.get(m)!;
          return `${q.kind}/${q.poste}/${q.rank}`;
        });
        return { name: p.name, kind: p.kind, home: p.home, state: p.state, vehicle: v.kind, x: v.x, z: v.z, heading: v.heading, crew };
      });
    };
    const a = await snapshot();
    const b = await snapshot();
    expect(a.length).toBe(5);
    expect(b).toEqual(a);
    for (const p of a) {
      expect(p.state).toBe('patrouille');
      // (voiture banalisée pour la BAC seulement quand le module des véhicules la définit)
      expect(['voiture_police', 'voiture_bac']).toContain(p.vehicle);
      if (p.kind === 'tv') expect(p.vehicle).toBe('voiture_police');
    }
  }, 300000);
});
