// Patrouilles : voitures de Police secours et de la BAC réparties dans Paris. Elles patrouillent seules, rendent compte
// à la radio, figurent toutes sur la carte tactique (même loin du joueur), et le commandant les envoie sur un point
// (urgence, deux-tons) ; « libre » leur fait reprendre la patrouille.
import { describe, expect, it } from 'vitest';

import type { GameContext, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE, PatrolsSystem, chooseSites, approx } from '@/gameplay/patrols';
import type { PatrolsApi } from '@/gameplay/patrols';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { MapScene } from '@/ui/maps/scene';
import { createShown, visibleUnits } from '@/ui/maps/overlay-units';
import { UnitModel, unitCode } from '@/ui/maps/units';
import { visibilityFor } from '@/ui/maps/visibility';

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, law, radio, session, patrols, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const DEMO = { x: -10, z: 15 };

async function start(extra: Record<string, unknown> = {}, seed = 7) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: DEMO.x, z: DEMO.z, crowdSize: 60,
    tension: 0.3, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'salle', ...extra },
  } as Partial<SessionConfig>);
  t.step(1);
  return { t, ctx: t.ctx, api: t.ctx.require<PatrolsApi>(PATROLS_SERVICE) };
}

function vehicleOf(ctx: GameContext, id: number) {
  return ctx.vehicles.get(id)!;
}

describe('patrouilles de police dans Paris', () => {
  it('nombre de voitures : réglage, automatique pour un rôle de police, aucune en mission ni pour un manifestant', () => {
    expect(PatrolsSystem.count({ role: 'commandant' })).toBe(5);
    expect(PatrolsSystem.count({ role: 'crs', missionId: '' })).toBe(5);
    expect(PatrolsSystem.count({ role: 'crs', missionId: 'crs-01' })).toBe(0);
    expect(PatrolsSystem.count({ role: 'manifestant' })).toBe(0);
    expect(PatrolsSystem.count({ role: 'commandant', extra: { patrouilles: 3 } })).toBe(3);
    expect(PatrolsSystem.count({ role: 'commandant', extra: { patrouilles: 0 } })).toBe(0);
    expect(PatrolsSystem.count({ role: 'crs', missionId: 'crs-01', extra: { patrouilles: 2 } })).toBe(2);
    // dispersion : le choix des lieux évite la manifestation et éloigne les voitures les unes des autres
    const sites = chooseSites(6, [{ x: DEMO.x, z: DEMO.z, radius: 700 }], () => 0.5, () => true);
    expect(sites.length).toBe(6);
    for (const s of sites) expect(Math.hypot(s.x - DEMO.x, s.z - DEMO.z)).toBeGreaterThan(500);
    for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) expect(Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.z - sites[j]!.z)).toBeGreaterThan(600);
    expect(sites.some((s) => s.kind === 'bac')).toBe(true);
    expect(approx(47)).toBe('une cinquantaine de');
    expect(unitCode('TV 75-09')).toBe('T09');
    expect(unitCode('BAC 75N')).toBe('BN');
    expect(unitCode('MISTRAL 2 ALFA')).toBe('2A');
  });

  it('mise en place dispersée, patrouille autonome, comptes rendus radio, carte tactique complète', async () => {
    const { t, ctx, api } = await start({ foyers: 1, 'foyers.delai': 20 });
    const list = api.list;
    expect(list.length).toBe(5);
    // dispersées : deux à deux à plus de 300 m, toutes loin de la manifestation, équipage à bord
    const start0 = new Map<number, { x: number; z: number }>();
    for (const p of list) {
      const v = vehicleOf(ctx, p.vehicleId);
      // Police secours en voiture sérigraphiée, BAC en voiture banalisée
      expect(v.kind).toBe(p.kind === 'bac' ? 'voiture_bac' : 'voiture_police');
      expect(v.faction).toBe('police');
      const sq = ctx.squads.get(p.squadId)!;
      expect(sq.faction).toBe('police');
      expect(sq.vehicleId).toBe(v.id);
      expect(sq.members.length).toBeGreaterThanOrEqual(2);
      for (const id of sq.members) expect(ctx.people.get(id)!.vehicleId).toBe(v.id);
      expect(Math.hypot(v.x - DEMO.x, v.z - DEMO.z)).toBeGreaterThan(400);
      start0.set(p.squadId, { x: v.x, z: v.z });
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = vehicleOf(ctx, list[i]!.vehicleId), b = vehicleOf(ctx, list[j]!.vehicleId);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(300);
      }
    }
    // elles roulent : chacune s'est éloignée d'au moins 200 m de son point de départ en 3 min
    const far = new Map<number, number>();
    let samples = 0, sirens = 0;
    for (let k = 0; k < 36; k++) {
      t.step(5);
      for (const p of list) {
        const v = vehicleOf(ctx, p.vehicleId);
        const s = start0.get(p.squadId)!;
        far.set(p.squadId, Math.max(far.get(p.squadId) ?? 0, Math.hypot(v.x - s.x, v.z - s.z)));
        samples++;
        if (v.siren !== 0) sirens++;
      }
    }
    // en patrouille, pas de deux-tons (sauf, brièvement, pour se dégager d'une foule)
    expect(sirens / samples).toBeLessThan(0.1);
    console.log('éloignement max (m) :', list.map((p) => `${p.name} ${Math.round(far.get(p.squadId)!)}`).join(', '));
    for (const p of list) {
      expect(p.state).toBe('patrouille');
      expect(far.get(p.squadId)!).toBeGreaterThan(200);
    }
    // comptes rendus : sur le canal commandement, au nom des voitures, débit borné
    const names = new Set(list.map((p) => p.name));
    const reports = ctx.radio.log.filter((m) => m.channel === 'commandement' && names.has(m.from));
    for (const m of reports) console.log(`[${Math.round(m.t)}] ${m.from} : ${m.text}`);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < reports.length; i++) expect(reports[i]!.t - reports[i - 1]!.t).toBeGreaterThanOrEqual(0);
    expect(reports.length).toBeLessThan(25);

    // carte tactique : toutes les voitures, même à des kilomètres du joueur, avec leur symbole et leur état
    const me = ctx.player.person()!;
    const model = new UnitModel();
    const units = model.refresh(ctx, visibilityFor('commandant'));
    let farthest = 0;
    for (const p of list) {
      const u = units.find((q) => q.squadId === p.squadId);
      expect(u, p.name).toBeDefined();
      expect(u!.symbol).toBe('patrouille');
      expect(u!.patrol).toBe(true);
      expect(u!.status).toBe('Patrouille');
      const v = vehicleOf(ctx, p.vehicleId);
      expect(Math.hypot(u!.x - v.x, u!.z - v.z)).toBeLessThan(3);
      farthest = Math.max(farthest, Math.hypot(u!.x - me.x, u!.z - me.z));
    }
    expect(farthest).toBeGreaterThan(1000);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    const shown = visibleUnits(scene, 4, false, createShown()).units;
    for (const p of list) expect(shown.some((u) => u.squadId === p.squadId), p.name).toBe(true);
    // le commandant les commande toutes
    const core = ctx.service<CommandCore>('ui.command')!;
    for (const p of list) expect(core.canCommand(p.squadId)).toBe(true);
    // le foyer secondaire figure sur la carte, avec son lieu et son effectif
    const foyers = ctx.service<{ list: readonly { id: number; people: number }[] }>('crowd.foyers')!;
    if (foyers.list.length > 0) {
      expect(scene.foyers.length).toBe(foyers.list.length);
      expect(scene.foyers[0]!.people).toBeGreaterThan(0);
      expect(scene.foyers[0]!.name).not.toBe('');
    }
  }, 300000);

  it('ordre du commandant : la voiture s’y rend en urgence, rend compte sur place, puis reprend la patrouille sur « libre »', async () => {
    const { t, ctx, api } = await start({ foyers: 0 }, 9);
    const core = ctx.service<CommandCore>('ui.command')!;
    // la voiture la plus proche de la Madeleine ; le point : la Madeleine
    const target = { x: 239, z: -497 };
    const list = [...api.list].sort((a, b) => {
      const va = vehicleOf(ctx, a.vehicleId), vb = vehicleOf(ctx, b.vehicleId);
      return Math.hypot(va.x - target.x, va.z - target.z) - Math.hypot(vb.x - target.x, vb.z - target.z);
    });
    const p = list[0]!;
    const squad = ctx.squads.get(p.squadId)!;
    const v = vehicleOf(ctx, p.vehicleId);
    const d0 = Math.hypot(v.x - target.x, v.z - target.z);
    // « Faire mouvement » : pour une voiture de patrouille, ni colonne ni débarquement — elle s'y rend elle-même
    const res = core.issue('faire_mouvement', [squad], [{ x: target.x, z: target.z, heading: 0, width: 0 }]);
    expect(res.ok).toBe(true);
    expect(squad.order.type).toBe('avancer');
    t.step(3);
    expect(p.state).toBe('en_route');
    let sirens = false;
    let maxSpeed = 0;
    for (let k = 0; k < 120 && p.state === 'en_route'; k++) {
      t.step(2);
      sirens = sirens || v.siren !== 0;
      maxSpeed = Math.max(maxSpeed, Math.abs(v.speed));
    }
    const d1 = Math.hypot(v.x - target.x, v.z - target.z);
    console.log(`${p.name} : ${Math.round(d0)} m → ${Math.round(d1)} m, ${p.state}, vitesse max ${(maxSpeed * 3.6).toFixed(0)} km/h, t=${Math.round(ctx.clock.now)} s`);
    expect(p.state).toBe('sur_place');
    expect(d1).toBeLessThan(70);
    expect(sirens).toBe(true);
    expect(maxSpeed).toBeGreaterThan(30 / 3.6);
    // elle reste sur place
    t.step(30);
    // (compte rendu d'arrivée lu après ces 30 s : il part dès l'arrivée, mais attend que le canal se libère — une
    // émission en cours le retarde de quelques secondes, et le lire à la seconde même de l'arrivée dépendait du hasard)
    const said = ctx.radio.log.filter((m) => m.from === p.name).map((m) => m.text);
    console.log(said.join('\n'));
    expect(said.some((s) => /faisons mouvement/.test(s))).toBe(true);
    expect(said.some((s) => /Sur place/.test(s))).toBe(true);
    expect(p.state).toBe('sur_place');
    expect(Math.hypot(v.x - target.x, v.z - target.z)).toBeLessThan(70);
    // carte : en état « Sur place »
    const u = new UnitModel().refresh(ctx, visibilityFor('commandant')).find((q) => q.squadId === p.squadId)!;
    expect(u.status).toBe('Sur place');
    // « libre » : reprise de la patrouille, sans deux-tons
    expect(core.issue('libre', [squad], null).ok).toBe(true);
    t.step(3);
    expect(p.state).toBe('patrouille');
    let moved = 0;
    for (let k = 0; k < 20; k++) {
      t.step(3);
      moved = Math.max(moved, Math.hypot(v.x - target.x, v.z - target.z));
    }
    expect(moved).toBeGreaterThan(d1 + 60);
    expect(v.siren).toBe(0);
  }, 300000);

  it('rôle de manifestant : aucune voiture ; réglage « patrouilles: 0 » : aucune', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'manifestant', place: 'Place de la Concorde', x: DEMO.x, z: DEMO.z, crowdSize: 20, tension: 0.2, volatility: 0.2, duration: 'standard' } as Partial<SessionConfig>);
    t.step(1);
    expect(t.ctx.require<PatrolsApi>(PATROLS_SERVICE).list.length).toBe(0);
    const t2 = createTestContext({ seed: 3, strict: false, modules: SIM });
    await t2.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: DEMO.x, z: DEMO.z, crowdSize: 20, tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, patrouilles: 0 } } as Partial<SessionConfig>);
    t2.step(1);
    expect(t2.ctx.require<PatrolsApi>(PATROLS_SERVICE).list.length).toBe(0);
  }, 120000);
});
