// Mode Patrouille : répartiteur d'appels de CENTRAL pendant une vacation (PatrolModeSystem, service 'patrol.mode').
// Vraie session sur le vrai plan de Paris : équipage du joueur, patrouilles de l'IA, foule en veille, foyers, cortèges
// sauvages, feux, compagnie en renfort ; et, en Mode libre, compagnie engagée sur une manifestation sauvage imprévue.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createObjectives } from '@/ui/core/objectives';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import type { FoyersApi, ManifsApi } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE, PATROL_CALL_EVENT, PATROL_MODE_SERVICE } from '@/gameplay/patrols';
import type { DispatchCall, PatrolCallEvent, PatrolModeApi, PatrolsApi } from '@/gameplay/patrols';
import { sanitizePatrolSetup, vacationSessionConfig } from '@/gameplay/patrols/model';
import type { PatrolSetup } from '@/gameplay/patrols/model';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, patrols, objectives];

async function vacation(setup: Partial<PatrolSetup>, seed = 5) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  const cfg = vacationSessionConfig(sanitizePatrolSetup({ seed, ...setup }));
  await t.start(cfg);
  const ctx = t.ctx;
  const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
  const events: PatrolCallEvent[] = [];
  ctx.events.onAny(PATROL_CALL_EVENT, (e) => events.push({ ...(e as PatrolCallEvent) }));
  return { t, ctx, api, events, cfg };
}

/** Avance jusqu'à ce que `cond` soit vraie (pas de 0,5 s), au plus `max` secondes de jeu ; retourne l'instant. */
function until(t: { step(s: number): void; ctx: GameContext }, cond: () => boolean, max: number): number {
  const end = t.ctx.clock.now + max;
  while (!cond() && t.ctx.clock.now < end) t.step(0.5);
  return t.ctx.clock.now;
}

describe('mode Patrouille : répartiteur d’appels', () => {
  it('vacation BAC agitée, premier appel à 5 s : annonce de CENTRAL, prise d’appel, le collègue conduit en urgence', async () => {
    const { t, ctx, api, events } = await vacation({ crew: 'bac', seat: 'chef_bord', departId: 'bac-75n', rythme: 'agite', premier: 5 });
    expect(api.active).toBe(true);
    expect(api.callsign).toBe('BAC 75N');
    const t0 = ctx.clock.now;
    until(t, () => api.current !== null, 10);
    const call = api.current!;
    expect(call).not.toBeNull();
    console.log(`appel n° ${call.id} à ${(call.t - t0).toFixed(1)} s : ${call.label} — ${call.place}, ~${call.people} pers.`);
    expect(call.t - t0).toBeLessThan(10);
    expect(call.state).toBe('annonce');
    expect(events.some((e) => e.call.id === call.id && e.state === 'annonce')).toBe(true);
    // (la radio diffuse les messages l'un après l'autre)
    const heard = (): boolean => ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text.startsWith('BAC 75N de CENTRAL'));
    until(t, heard, 30);
    expect(heard()).toBe(true);
    console.log(ctx.radio.log.filter((m) => m.from === 'CENTRAL').map((m) => m.text).join('\n'));
    // l'événement est réel : foyer, cortège ou feu de la simulation
    if (call.foyerId !== 0) expect(ctx.require<FoyersApi>('crowd.foyers').list.some((f) => f.id === call.foyerId)).toBe(true);
    else if (call.manifId !== 0) expect(ctx.require<ManifsApi>('crowd.manifs').list.some((m) => m.id === call.manifId)).toBe(true);
    else expect(call.fireId).not.toBe(0);
    const me = ctx.player.person()!;
    expect(Math.hypot(call.x - me.x, call.z - me.z)).toBeGreaterThan(450);

    // prise d'appel : objectif GPS, la voiture part en urgence
    expect(api.accept(call.id)).toBe(true);
    expect(call.state).toBe('acceptee');
    const obj = ctx.require<ObjectivesApi>(EXT.objectives);
    const o = obj.list.find((q) => q.id === obj.tracked)!;
    expect(o).toBeDefined();
    expect(o.x).toBeDefined();
    expect(o.text).toContain(call.label);
    const car = ctx.vehicles.get(me.vehicleId)!;
    const ta = ctx.clock.now;
    const tFast = until(t, () => Math.abs(car.speed) > 2, 10);
    console.log(`voiture à ${car.speed.toFixed(1)} m/s après ${(tFast - ta).toFixed(1)} s, deux-tons ${car.siren}, gyrophares ${car.beacons}`);
    expect(Math.abs(car.speed)).toBeGreaterThan(2);
    expect(tFast - ta).toBeLessThan(10);
    expect(car.siren).not.toBe(0);
    expect(car.beacons).toBe(true);
    expect(car.seats[0]).not.toBe(me.id);
    // elle se rapproche de l'appel
    const d0 = Math.hypot(call.x - car.x, call.z - car.z);
    until(t, () => call.state === 'sur_place', 120);
    const d1 = Math.hypot(call.x - car.x, call.z - car.z);
    console.log(`distance à l'appel : ${d0.toFixed(0)} m → ${d1.toFixed(0)} m, état ${call.state}`);
    expect(d1).toBeLessThan(d0 - 200);
    // sur place : deux-tons coupés, renforts, fin d'intervention → appel réglé, le collègue reprend la patrouille
    expect(call.state).toBe('sur_place');
    expect(o.id).toBe(obj.tracked);
    expect(api.requestBackup(call.id, 'samu')).toBe(true);
    expect(api.requestBackup(call.id, 'samu')).toBe(false);
    expect(api.requestBackup(call.id, 'patrouille')).toBe(true);
    expect(call.backup).toEqual(['samu', 'patrouille']);
    expect(api.close(call.id)).toBe(true);
    expect(call.state).toBe('terminee');
    expect(api.current).toBeNull();
    const sum = api.summary();
    expect(sum.accepted).toBe(1);
    expect(sum.resolved).toBe(1);
    expect(sum.backups).toBe(2);
    expect(obj.list.some((q) => q.id === 'patrouille.appel')).toBe(false);
    for (let i = 0; i < 20; i++) t.step(0.5);
    expect(car.siren).toBe(0);
    expect(Math.abs(car.speed)).toBeGreaterThan(1);
    // le joueur descend : l'IA lâche le volant, la voiture s'arrête
    ctx.vehicles.exit(me);
    for (let i = 0; i < 30; i++) t.step(0.5);
    expect(Math.abs(car.speed)).toBeLessThan(0.5);
  }, 600000);

  it('feux et cortège sauvage : de vrais événements de la simulation, clos quand ils finissent', async () => {
    const only = async (types: Record<string, boolean>, seed: number) => {
      const t = createTestContext({ seed, strict: false, modules: SIM });
      const cfg = vacationSessionConfig(sanitizePatrolSetup({ seed, crew: 'bac', seat: 'conducteur', departId: 'bac-75e', rythme: 'agite', premier: 5 }));
      (cfg.extra!['vacation'] as { types: Record<string, boolean> }).types = types;
      await t.start(cfg);
      const api = t.ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
      until(t, () => api.current !== null, 10);
      return { t, ctx: t.ctx, api, call: api.current! };
    };
    const none = { feux: false, rassemblements: false, blocages: false, casseurs: false, manifs: false };
    // feu : l'objet ou la voiture brûle vraiment ; l'appel se clôt quand le feu est éteint
    const f = await only({ ...none, feux: true }, 21);
    expect(f.call.kind).toBe('feu');
    expect(f.call.fireId).not.toBe(0);
    expect(f.call.label).toMatch(/^Feu de (poubelles|conteneur|véhicule)$/);
    until(f.t, () => f.ctx.hazards.fireAt(f.call.x, f.call.z) > 0.05 || (f.ctx.vehicles.get(f.call.fireId)?.state === 'burning'), 30);
    const burning = f.ctx.hazards.fireAt(f.call.x, f.call.z) > 0.05 || f.ctx.vehicles.get(f.call.fireId)?.state === 'burning';
    expect(burning).toBe(true);
    expect(f.api.decline(f.call.id)).toBe(true);
    until(f.t, () => f.call.state === 'terminee', 1000);
    console.log(`${f.call.label}, ${f.call.place} : ${f.call.state} à +${(f.ctx.clock.now - f.call.t).toFixed(0)} s, incident ${f.call.incidentId}`);
    expect(f.call.state).toBe('terminee');
    // cortège sauvage : une vraie manifestation sauvage du module de foule
    const m = await only({ ...none, manifs: true }, 22);
    expect(m.call.kind).toBe('manif_sauvage');
    const view = m.ctx.require<ManifsApi>('crowd.manifs').list.find((q) => q.id === m.call.manifId)!;
    expect(view).toBeDefined();
    expect(view.sauvage).toBe(true);
    expect(m.call.people).toBe(view.declared);
    console.log(`${m.call.label}, ${m.call.place} : ${view.label}, ${view.declared} déclarés`);
  }, 900000);

  it('sans réponse pendant 90 s : CENTRAL confie l’appel à une patrouille de l’IA, qui fait mouvement', async () => {
    const { t, ctx, api } = await vacation({ crew: 'police_secours', seat: 'conducteur', departId: 'tv-75-09', rythme: 'normal', premier: 5 });
    until(t, () => api.current !== null, 10);
    const call = api.current!;
    expect(call).not.toBeNull();
    until(t, () => call.state !== 'annonce', 100);
    console.log(`appel ${call.label} — ${call.place} : ${call.state} à ${(ctx.clock.now - call.t).toFixed(0)} s, confié à ${call.assignedTo}`);
    expect(call.state).toBe('confiee');
    expect(ctx.clock.now - call.t).toBeGreaterThanOrEqual(89);
    expect(ctx.clock.now - call.t).toBeLessThan(92);
    const patrols = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    const p = patrols.list.find((q) => q.name === call.assignedTo)!;
    expect(p).toBeDefined();
    expect(p.name).not.toBe('TV 75-09');
    t.step(1.5);
    expect(p.state).toBe('en_route');
    expect(api.summary().delegated).toBe(1);
    expect(api.current).toBeNull();
    const heard = (): boolean => ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text === `Reçu, ${p.name} prend.`);
    until(t, heard, 30);
    expect(heard()).toBe(true);
    // décliner : confié tout de suite
    until(t, () => api.current !== null, 600);
    const next = api.current!;
    expect(next).not.toBeNull();
    expect(api.decline(next.id)).toBe(true);
    expect(['confiee', 'declinee']).toContain(next.state);
    expect(api.summary().declined).toBe(1);
  }, 600000);

  it('renfort : une compagnie de CRS rejoint le rassemblement et tient le point', async () => {
    const t = createTestContext({ seed: 8, strict: false, modules: SIM });
    const cfg = vacationSessionConfig(sanitizePatrolSetup({ seed: 8, crew: 'bac', seat: 'conducteur', departId: 'bac-75s', rythme: 'calme', premier: 5 }));
    const vac = cfg.extra!['vacation'] as { types: Record<string, boolean> };
    vac.types = { feux: false, rassemblements: true, blocages: false, casseurs: false, manifs: false };
    await t.start(cfg);
    const ctx = t.ctx;
    const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    until(t, () => api.current !== null, 10);
    const call = api.current!;
    expect(call.kind).toBe('rassemblement');
    expect(api.accept(call.id)).toBe(true);
    // une compagnie seulement pour un rassemblement ou un cortège sauvage ; une seule à la fois
    expect(api.requestBackup(call.id, 'compagnie')).toBe(true);
    expect(api.requestBackup(call.id, 'compagnie')).toBe(false);
    expect(call.backup).toEqual(['compagnie']);
    const t0 = ctx.clock.now;
    const companies = () => ctx.squads.list.filter((s) => s.kind === 'compagnie');
    const tc = until(t, () => companies().length > 0, 245);
    expect(companies().length).toBe(1);
    expect(tc - t0).toBeLessThanOrEqual(240);
    expect(tc - t0).toBeGreaterThanOrEqual(119);
    const cie = companies()[0]!;
    const near = (): number => {
      const list: { x: number; z: number }[] = [];
      for (const s of ctx.squads.list) {
        let r = s;
        while (r.parentId !== 0) r = ctx.squads.get(r.parentId)!;
        if (r.id !== cie.id) continue;
        for (const id of s.members) {
          const q = ctx.people.get(id);
          if (q && q.vehicleId === 0) list.push(q);
        }
      }
      if (list.length < 8) return Infinity;
      let x = 0, z = 0;
      for (const q of list) { x += q.x; z += q.z; }
      return Math.hypot(x / list.length - call.x, z / list.length - call.z);
    };
    const ta = until(t, () => near() < 150, 600 - (ctx.clock.now - t0));
    console.log(`compagnie ${cie.name} créée à +${(tc - t0).toFixed(0)} s, à ${near().toFixed(0)} m du rassemblement à +${(ta - t0).toFixed(0)} s`);
    expect(near()).toBeLessThan(150);
    expect(ta - t0).toBeLessThanOrEqual(600);
    // elle tient le point (le commandant ne l'emmène pas ailleurs)
    for (let i = 0; i < 120 && call.state !== 'terminee'; i++) t.step(0.5);
    if (call.state !== 'terminee') expect(near()).toBeLessThan(150);
    expect(api.summary().backups).toBe(1);
  }, 900000);

  it('vacation courte : fin de vacation annoncée, compte rendu au plus tard à 780 s, au moins un appel', async () => {
    const { t, ctx, api } = await vacation({ crew: 'bac', seat: 'conducteur', departId: 'bac-75e', rythme: 'agite', duration: 'courte' }, 13);
    let endedAt = -1;
    ctx.events.on('session:ended', () => { endedAt = ctx.clock.now; });
    const t0 = ctx.clock.now;
    until(t, () => api.ending, 605);
    expect(api.ending).toBe(true);
    const finVacation = (): boolean => ctx.radio.log.some((m) => m.text === 'BAC 75E, fin de vacation, regagnez le service.');
    until(t, () => finVacation() || endedAt >= 0, 30);
    expect(finVacation()).toBe(true);
    until(t, () => endedAt >= 0, 200);
    const sum = api.summary();
    console.log(`fin à +${(endedAt - t0).toFixed(0)} s, phase ${ctx.session.phase}, compte rendu ${JSON.stringify(sum)}`);
    expect(endedAt).toBeGreaterThan(0);
    // (à la trame près : la vacation commence au premier pas de simulation)
    expect(endedAt - t0).toBeLessThanOrEqual(780.5);
    expect(ctx.session.phase).toBe('debrief');
    expect(sum.calls).toBeGreaterThanOrEqual(1);
    expect(sum.duration).toBeGreaterThanOrEqual(600);
    for (const v of Object.values(sum)) expect(Number.isFinite(v)).toBe(true);
    // les appels sans réponse ont été confiés
    expect(api.calls.every((c: DispatchCall) => c.state !== 'annonce')).toBe(true);
  }, 900000);

  it('session « libre » : le répartiteur reste inactif', async () => {
    const t = createTestContext({ seed: 2, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'crs', rank: 'gardien', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 60,
      tension: 0.3, volatility: 0.3, duration: 'courte', extra: { moyens: { sections: 1, fourgons: 2, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true } },
    } as Partial<SessionConfig>);
    const api = t.ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    for (let i = 0; i < 240; i++) t.step(0.5);
    expect(api.active).toBe(false);
    expect(api.callsign).toBe('');
    expect(api.calls.length).toBe(0);
    expect(api.current).toBeNull();
    expect(api.accept(1)).toBe(false);
    expect(api.summary().calls).toBe(0);
  }, 600000);

  it('Mode libre, équipage de patrouille en chef de bord : aucun appel, mais le collègue conduit au pas', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'patrouille', rank: 'gardien', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150,
      tension: 0.3, volatility: 0.3, duration: 'courte',
      extra: {
        poste: 'interpellation', variante: 'police_secours', journee: false, foyers: 0, patrouilles: 0,
        moyens: { sections: 0, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true },
      },
    } as Partial<SessionConfig>);
    const ctx = t.ctx;
    const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    const me = ctx.player.person()!;
    const car = ctx.vehicles.get(me.vehicleId)!;
    expect(car).toBeDefined();
    expect(car.seats[0]).not.toBe(me.id);
    const x0 = car.x, z0 = car.z;
    let vmax = 0;
    until(t, () => {
      vmax = Math.max(vmax, Math.abs(car.speed));
      return vmax > 2;
    }, 30);
    expect(vmax).toBeGreaterThan(2);
    for (let i = 0; i < 60; i++) t.step(0.5);
    console.log(`Mode libre, chef de bord : ${Math.hypot(car.x - x0, car.z - z0).toFixed(0)} m parcourus en 30 s, pointe ${vmax.toFixed(1)} m/s`);
    expect(Math.hypot(car.x - x0, car.z - z0)).toBeGreaterThan(20);
    expect(api.active).toBe(false);
    expect(api.calls.length).toBe(0);
    // le joueur descend : le collègue s'arrête
    ctx.vehicles.exit(me);
    for (let i = 0; i < 30; i++) t.step(0.5);
    expect(Math.abs(car.speed)).toBeLessThan(0.5);
  }, 600000);
});

describe('Mode libre : manifestation sauvage imprévue', () => {
  it('une compagnie IA est engagée sur la manifestation sauvage née en cours de partie', async () => {
    const t = createTestContext({ seed: 6, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'crs', rank: 'gardien', place: 'Place de la République', x: 3123, z: -208, crowdSize: 400,
      tension: 0.3, volatility: 0.3, duration: 'standard',
      extra: {
        moyens: { sections: 1, fourgons: 2, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true },
        imprevus: { sauvages: 1, premier: 60 }, journee: false, foyers: 0, patrouilles: 0,
      },
    } as Partial<SessionConfig>);
    const ctx = t.ctx;
    const manifs = ctx.require<ManifsApi>('crowd.manifs');
    const before = ctx.squads.list.filter((s) => s.kind === 'compagnie').length;
    until(t, () => manifs.list.some((m) => m.sauvage), 90);
    const wild = manifs.list.find((m) => m.sauvage)!;
    expect(wild).toBeDefined();
    const tw = ctx.clock.now;
    expect(wild.companyId).toBe(0);
    // 180 à 300 s plus tard, une compagnie lui est confiée
    const te = until(t, () => wild.companyId !== 0 || wild.phase === 'terminee', 310);
    console.log(`manifestation sauvage ${wild.label} (${wild.declared}) : compagnie ${wild.companyId} à +${(te - tw).toFixed(0)} s, phase ${wild.phase}`);
    expect(wild.companyId).not.toBe(0);
    expect(te - tw).toBeGreaterThanOrEqual(179);
    expect(te - tw).toBeLessThanOrEqual(301);
    expect(ctx.squads.list.filter((s) => s.kind === 'compagnie').length).toBe(before + 1);
    expect(ctx.radio.log.length).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) t.step(0.5);
    expect(ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text.includes('cortège sauvage'))).toBe(true);
  }, 900000);
});
