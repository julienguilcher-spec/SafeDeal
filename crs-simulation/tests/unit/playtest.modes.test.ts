// Robot joueur du mode Patrouille (accueil « modes ») : chaque départ, chaque équipage, chaque place ; les appels
// annoncés existent vraiment dans le monde ; la fin de vacation ramène au service ; une seconde partie dans le même
// processus repart d'un état propre.
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
import { createSystems as traffic } from '@/sim/traffic';
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
import { createSystems as patrols, PATROLS_SERVICE, PATROL_MODE_SERVICE } from '@/gameplay/patrols';
import type { PatrolModeApi, PatrolsApi } from '@/gameplay/patrols';
import { CREWS, sanitizePatrolSetup, vacationSessionConfig } from '@/gameplay/patrols/model';
import type { PatrolSetup } from '@/gameplay/patrols/model';
import { EQUIPAGE_SERVICE } from '@/gameplay/session/equipage';
import type { EquipageApi } from '@/gameplay/session/equipage';

// (comme l'interface, src/ui/core/system.ts : les objectifs sont vidés à chaque nouvelle partie)
const objectives: ModuleFactory = () => {
  const store = createObjectives();
  return [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, store); }, reset() { store.clear(); } } as GameSystem];
};
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, patrols, objectives];

function until(t: { step(s: number): void; ctx: GameContext }, cond: () => boolean, max: number): number {
  const end = t.ctx.clock.now + max;
  while (!cond() && t.ctx.clock.now < end) t.step(0.5);
  return t.ctx.clock.now;
}

function cfgOf(setup: Partial<PatrolSetup>, seed: number): SessionConfig {
  return vacationSessionConfig(sanitizePatrolSetup({ seed, ...setup }));
}

describe('robot joueur : mode Patrouille', () => {
  it('chaque départ de chaque équipage : au volant, garé au bord de la chaussée, collègues à bord, CENTRAL annonce la prise de service', async () => {
    const t = createTestContext({ seed: 1, strict: false, modules: SIM });
    const report: string[] = [];
    for (const crew of CREWS) {
      for (const dep of crew.departs()) {
        const seat = report.length % 2 === 0 ? 'conducteur' : 'chef_bord';
        await t.start(cfgOf({ crew: crew.id, seat, departId: dep.id, rythme: 'calme' }, 11 + report.length));
        const ctx = t.ctx;
        t.step(2);
        const me = ctx.player.person()!;
        const car = ctx.vehicles.get(me.vehicleId);
        const eq = ctx.require<EquipageApi>(EQUIPAGE_SERVICE).current;
        const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
        const d = car ? Math.hypot(car.x - dep.x, car.z - dep.z) : Infinity;
        const aboard = car ? car.seats.filter((id) => id !== 0).length : 0;
        const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
        const onRoad = car ? ctx.world.nearestRoad(car.x, car.z, road, 12) : false;
        const heard = ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text === `${dep.callsign}, prise de service, ${dep.name}.`);
        const companies = ctx.squads.list.filter((s) => s.kind === 'compagnie').length;
        const protesters = ctx.people.list.filter((p) => p.faction === 'protest').length;
        report.push(`${dep.callsign} (${seat}) : ${car?.kind} à ${d.toFixed(0)} m, ${aboard} à bord, rue ${onRoad ? road.name || road.roadClass : 'AUCUNE'}, ${car ? Math.abs(car.speed).toFixed(1) : '-'} m/s, radio ${heard}, ${companies} cie, ${protesters} manif., indicatif ${api.callsign}`);
        expect(car, dep.callsign).toBeDefined();
        expect(car!.kind).toBe(crew.vehicle);
        expect(d, dep.callsign).toBeLessThan(150);
        expect(aboard).toBe(3);
        expect(onRoad).toBe(true);
        expect(eq?.callsign).toBe(dep.callsign);
        expect(api.active).toBe(true);
        expect(api.callsign).toBe(dep.callsign);
        expect(companies).toBe(0);
        expect(protesters).toBe(0);
        if (seat === 'conducteur') expect(car!.seats[0]).toBe(me.id);
        else expect(car!.seats[1]).toBe(me.id);
        until(t, () => ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text === `${dep.callsign}, prise de service, ${dep.name}.`), 20);
        expect(ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text === `${dep.callsign}, prise de service, ${dep.name}.`), dep.callsign).toBe(true);
        // aucune phrase radio cassée
        for (const m of ctx.radio.log) expect(m.text, m.text).not.toMatch(/undefined|NaN|\[object/);
      }
    }
    console.log(report.join('\n'));
  }, 1200000);

  it('vacation agitée, plusieurs graines : chaque appel annoncé existe vraiment là où la carte le dit', async () => {
    const lines: string[] = [];
    for (const seed of [31, 47]) {
      const t = createTestContext({ seed, strict: false, modules: SIM });
      await t.start(cfgOf({ crew: seed % 2 ? 'bac' : 'police_secours', seat: 'chef_bord', departId: 'hasard', rythme: 'agite', premier: 5 }, seed));
      const ctx = t.ctx;
      const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
      const checked = new Set<number>();
      const end = ctx.clock.now + 420;
      while (ctx.clock.now < end) {
        t.step(1);
        for (const c of api.calls) {
          if (checked.has(c.id)) continue;
          checked.add(c.id);
          let real = '';
          if (c.foyerId) {
            const f = ctx.require<FoyersApi>('crowd.foyers').list.find((q) => q.id === c.foyerId);
            real = f ? `foyer ${f.kind} à ${Math.hypot(f.x - c.x, f.z - c.z).toFixed(0)} m` : 'FOYER ABSENT';
            expect(f).toBeDefined();
          } else if (c.manifId) {
            const m = ctx.require<ManifsApi>('crowd.manifs').list.find((q) => q.id === c.manifId);
            real = m ? `cortège ${m.declared} à ${Math.hypot(m.x - c.x, m.z - c.z).toFixed(0)} m` : 'CORTÈGE ABSENT';
            expect(m).toBeDefined();
          } else {
            const v = ctx.vehicles.get(c.fireId);
            const p = ctx.props.get(c.fireId);
            real = v ? `voiture ${v.state}` : p ? `objet ${p.kind}` : 'FEU SANS OBJET';
            expect(v ?? p).toBeDefined();
          }
          lines.push(`[${seed}] +${c.t.toFixed(0)} s ${c.label} — ${c.place}, ~${c.people} : ${real}, état ${c.state}, confié à ${c.assignedTo || '-'}`);
          expect(c.place).not.toMatch(/undefined|^$/);
        }
        // le joueur prend le premier appel proposé et y va (chef de bord : le collègue conduit)
        const cur = api.current;
        if (cur && cur.state === 'annonce') api.accept(cur.id);
      }
      // quelques secondes plus tard, les foules des foyers en cours existent
      const foyers = ctx.require<FoyersApi>('crowd.foyers').list;
      lines.push(`[${seed}] ${api.calls.length} appels, foyers ${foyers.length}, manifestants ${ctx.people.list.filter((p) => p.faction === 'protest').length}, résumé ${JSON.stringify(api.summary())}`);
      for (const m of ctx.radio.log) expect(m.text, m.text).not.toMatch(/undefined|NaN|\[object/);
      expect(api.calls.length).toBeGreaterThanOrEqual(3);
    }
    console.log(lines.join('\n'));
  }, 1800000);

  it('fin de vacation pendant un appel pris : le GPS mène au service, pas à l’appel', async () => {
    const t = createTestContext({ seed: 9, strict: false, modules: SIM });
    // premier appel 20 s avant la fin d'une vacation de 10 min : un rassemblement, qui dure bien plus
    const cfg = cfgOf({ crew: 'bac', seat: 'conducteur', departId: 'bac-75e', rythme: 'agite', premier: 580, duration: 'courte' }, 9);
    (cfg.extra!['vacation'] as { types: Record<string, boolean> }).types = { feux: false, rassemblements: true, blocages: false, casseurs: false, manifs: false };
    await t.start(cfg);
    const ctx = t.ctx;
    const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    until(t, () => api.current !== null, 600);
    const call = api.current!;
    expect(call).not.toBeNull();
    expect(api.accept(call.id)).toBe(true);
    until(t, () => api.ending, 60);
    expect(api.ending).toBe(true);
    t.step(3);
    const obj = ctx.require<ObjectivesApi>(EXT.objectives);
    const tracked = obj.list.find((q) => q.id === obj.tracked);
    console.log(`fin de vacation : appel ${call.state}, objectif suivi « ${tracked?.text} », objectifs ${obj.list.map((q) => q.id).join(', ')}, actuel ${api.current?.state}`);
    expect(tracked?.id).toBe('patrouille.service');
    expect(obj.list.some((q) => q.id === 'patrouille.appel')).toBe(false);
  }, 900000);

  it('appel décliné sans aucune patrouille libre : il reste en attente, sans erreur, et la vacation continue', async () => {
    const t = createTestContext({ seed: 14, strict: false, modules: SIM });
    const cfg = cfgOf({ crew: 'bac', seat: 'conducteur', departId: 'bac-75s', rythme: 'agite', premier: 3 }, 14);
    cfg.extra!['patrouilles'] = 0;
    await t.start(cfg);
    const ctx = t.ctx;
    const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    until(t, () => api.current !== null, 15);
    const call = api.current!;
    expect(api.decline(call.id)).toBe(true);
    expect(call.state).toBe('declinee');
    for (let i = 0; i < 120; i++) t.step(0.5);
    expect(call.state === 'declinee' || call.state === 'terminee').toBe(true);
    const waiting = ctx.radio.log.filter((m) => m.text.includes('l’appel reste en attente')).length;
    console.log(`décliné sans patrouille : ${call.state}, ${waiting} message(s) « reste en attente », appels ${api.calls.length}`);
    // (le nouvel essai toutes les 30 s est silencieux : un seul message)
    expect(waiting).toBe(1);
    expect(ctx.session.phase).toBe('playing');
  }, 600000);

  it('seconde partie dans le même processus : vacation puis Mode libre CRS, puis nouvelle vacation — état propre', async () => {
    const t = createTestContext({ seed: 4, strict: false, modules: SIM });
    await t.start(cfgOf({ crew: 'bac', seat: 'chef_bord', departId: 'bac-75n', rythme: 'agite', premier: 2 }, 4));
    const ctx = t.ctx;
    const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    until(t, () => api.calls.length > 0, 20);
    const c = api.current!;
    api.accept(c.id);
    t.step(5);
    // seconde partie : Mode libre CRS
    await t.start({
      mode: 'libre', role: 'crs', rank: 'gardien', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 80,
      tension: 0.3, volatility: 0.3, duration: 'courte', extra: { journee: false, moyens: { sections: 1, fourgons: 2, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true } },
    } as Partial<SessionConfig>);
    t.step(5);
    const obj = ctx.require<ObjectivesApi>(EXT.objectives);
    const eq = ctx.require<EquipageApi>(EQUIPAGE_SERVICE).current;
    const bacCars = ctx.vehicles.list.filter((v) => v.kind === 'voiture_bac').length;
    console.log(`après la vacation, Mode libre CRS : patrouille ${api.active}, appels ${api.calls.length}, équipage ${JSON.stringify(eq)}, objectifs ${obj.list.map((q) => q.id).join(', ')}, voitures BAC ${bacCars}, foyers ${ctx.require<FoyersApi>('crowd.foyers').list.length}`);
    expect(api.active).toBe(false);
    expect(api.calls.length).toBe(0);
    expect(eq).toBeNull();
    expect(obj.list.some((q) => q.id.startsWith('patrouille.'))).toBe(false);
    expect(ctx.player.state.role).not.toBe('patrouille');
    // nouvelle vacation : appels repartis de 1, résumé à zéro
    await t.start(cfgOf({ crew: 'police_secours', seat: 'conducteur', departId: 'tv-75-01', rythme: 'agite', premier: 3 }, 5));
    expect(api.active).toBe(true);
    expect(api.summary().calls).toBe(0);
    until(t, () => api.calls.length > 0, 20);
    expect(api.calls[0]!.id).toBe(1);
    expect(api.callsign).toBe('TV 75-01');
    const patrolsApi = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    expect(patrolsApi.list.every((p) => p.name !== 'TV 75-01')).toBe(true);
  }, 900000);
});

describe('robot joueur : Mode libre, curseur « Imprévu »', () => {
  it('partie courte : chaque cran change ce qui se déclare autour de la manifestation', async () => {
    const { buildSessionConfig, defaultDraft, sanitizeDraft } = await import('@/ui/screens/scenario');
    const out: string[] = [];
    const counts: Record<number, { foyers: number; sauvages: number; named: boolean }> = {};
    for (const level of [0, 2, 3] as const) {
      const draft = sanitizeDraft({
        ...defaultDraft(), mode: 'libre', role: 'crs', crowdSize: 800, duration: 'courte', imprevu: level, seed: 77,
        place: 'Place de la République', x: 3123, z: -208, manifNom: 'Marche des essais', organisateurs: 'collectif',
        options: { ...defaultDraft().options, journee: false },
      });
      const cfg = buildSessionConfig(draft);
      const t = createTestContext({ seed: 77, strict: false, modules: SIM });
      await t.start(cfg);
      const ctx = t.ctx;
      const foyers = ctx.require<FoyersApi>('crowd.foyers');
      const manifs = ctx.require<ManifsApi>('crowd.manifs');
      const seenF = new Set<number>();
      const seenS = new Set<number>();
      let ended = -1;
      ctx.events.on('session:ended', () => { if (ended < 0) ended = ctx.clock.now; });
      while (ctx.clock.now < 600 && ended < 0) {
        t.step(2);
        for (const f of foyers.list) seenF.add(f.id);
        for (const m of manifs.list) if (m.sauvage) seenS.add(m.id);
      }
      counts[level] = { foyers: seenF.size, sauvages: seenS.size, named: ctx.radio.log.some((m) => m.from === 'CENTRAL' && m.text.includes('« Marche des essais »')) };
      const named = ctx.radio.log.some((m) => m.text.includes('Marche des essais'));
      out.push(`cran ${level} : ${seenF.size} foyers, ${seenS.size} manifestations sauvages en ${ctx.clock.now.toFixed(0)} s (fin ${ended.toFixed(0)}), nom cité à la radio ${named}, extra ${JSON.stringify({ f: cfg.extra!['foyers'], i: cfg.extra!['imprevus'] })}`);
    }
    console.log(out.join('\n'));
    // le nom choisi est annoncé par CENTRAL au début (forces déjà sur place : pas de briefing de prise de service)
    for (const c of Object.values(counts)) expect(c.named).toBe(true);
    expect(counts[0]!.foyers).toBe(0);
    expect(counts[0]!.sauvages).toBe(0);
    expect(counts[2]!.foyers).toBeGreaterThanOrEqual(1);
    expect(counts[2]!.sauvages).toBe(1);
    expect(counts[3]!.sauvages).toBe(2);
    expect(counts[3]!.foyers).toBeGreaterThan(counts[2]!.foyers - 1);
  }, 1800000);
});

describe('robot joueur : Mode libre, point de départ des colonnes', () => {
  it('« Commissariat du 9e » : la journée de service part bien du 9e, « Déjà sur place » : pas de journée', async () => {
    const { buildSessionConfig, defaultDraft, sanitizeDraft } = await import('@/ui/screens/scenario');
    const out: string[] = [];
    for (const depart of ['arr-9', 'arr-7', 'sur_place'] as const) {
      const draft = sanitizeDraft({ ...defaultDraft(), mode: 'libre', role: 'crs', crowdSize: 300, depart, seed: 12, place: 'Place de la République', x: 3123, z: -208 });
      const cfg = buildSessionConfig(draft);
      const t = createTestContext({ seed: 12, strict: false, modules: SIM });
      await t.start(cfg);
      t.step(1);
      const ctx = t.ctx;
      const base = ctx.session.config!.extra!['base'] as { x: number; z: number; name: string } | undefined;
      const me = ctx.player.person()!;
      out.push(`${depart} : journée ${String(cfg.extra!['journee'])}, base ${base?.name ?? '-'}, joueur à ${base ? Math.hypot(me.x - base.x, me.z - base.z).toFixed(0) : '-'} m de la base, ${Math.hypot(me.x - 3123, me.z + 208).toFixed(0)} m du rassemblement`);
      if (depart === 'sur_place') {
        expect(cfg.extra!['journee']).toBe(false);
        expect(Math.hypot(me.x - 3123, me.z + 208)).toBeLessThan(600);
      } else {
        expect(base?.name).toContain(depart === 'arr-9' ? '9e' : '7e');
        expect(Math.hypot(me.x - base!.x, me.z - base!.z)).toBeLessThan(250);
      }
    }
    console.log(out.join('\n'));
  }, 900000);
});
