// Fourgons cellulaires de la mise en place (recensement de diag-interpelles, vraie carte de Paris) :
//  - avec une compagnie, max(2, ⌈foule annoncée / 400⌉) plafonné à 4 : 150 → 2, 600 → 2, 3000 → 4 ; chacun avec son
//    équipage (conducteur au volant, chef de bord à côté, huit places pour les interpellés), rattaché à la compagnie,
//    garé au point de remise : 60 à 100 m derrière la ligne, du côté opposé à la foule ;
//  - chaque mission où des forces de l'ordre sont engagées en a au moins un (un seul pour la BRAV-M sans compagnie) ;
//  - quand la ligne se déplace de plus de 80 m et s'arrête, le point de remise suit et les fourgons s'y rendent ;
//  - journée de service (BRAV-M partie de son propre commissariat) : ils partent avec la colonne, équipage à bord, et
//    prennent la remise à l'arrivée.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, SessionConfig, Squad, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionConfig } from '@/gameplay/missions';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { JOURNEE_SERVICE, basePreload } from '@/gameplay/session';
import { bravmBasePreload } from '@/gameplay/session/journee-data';
import type { JourneeApi } from '@/gameplay/session';
import { REMISE_SERVICE } from '@/gameplay/session/remise';
import type { RemiseApi } from '@/gameplay/session/remise';
import { createObjectives } from '@/ui/core/objectives';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions, objectives];

/** Fourgons cellulaires avec équipage : véhicule, unité de l'équipage. */
function crewedVans(ctx: GameContext): { v: Vehicle; s: Squad }[] {
  const out: { v: Vehicle; s: Squad }[] = [];
  for (const s of ctx.squads.list) {
    const v = s.faction === 'police' && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (v && v.kind === 'fourgon_cellulaire' && s.kind === 'equipage') out.push({ v, s });
  }
  return out;
}

/** Places passagers libres d'un véhicule. */
function freeCells(v: Vehicle): number {
  let n = 0;
  for (let i = 0; i < v.def.seats.length; i++) if (v.def.seats[i]!.role === 'passenger' && v.seats[i] === 0) n++;
  return n;
}

/** Barycentre des manifestants. */
function crowdCentre(ctx: GameContext): { x: number; z: number } {
  let x = 0, z = 0, n = 0;
  for (const p of ctx.people.list) if (p.faction === 'protest') { x += p.x; z += p.z; n++; }
  return { x: x / Math.max(1, n), z: z / Math.max(1, n) };
}

/** Barycentre des agents à pied de la compagnie (hors équipages et motards) : la « ligne ». */
function lineOf(ctx: GameContext, companyId: number): { x: number; z: number } {
  let x = 0, z = 0, n = 0;
  const visit = (s: Squad | undefined): void => {
    if (!s || s.kind === 'equipage' || s.kind === 'binome') return;
    for (const id of s.members) {
      const p = ctx.people.get(id);
      if (p && p.vehicleId === 0) { x += p.x; z += p.z; n++; }
    }
    for (const k of ctx.squads.childrenOf(s.id)) visit(k);
  };
  visit(ctx.squads.get(companyId));
  return { x: x / Math.max(1, n), z: z / Math.max(1, n) };
}

async function freeSession(crowdSize: number, seed: number): Promise<{ t: ReturnType<typeof createTestContext>; ctx: GameContext }> {
  const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la République')!;
  const d: ScenarioDraft = {
    ...defaultDraft(), role: 'commandant' as never, rank: 'commandant' as never, poste: 'commandant_unite' as never, variante: '',
    place: place.name, x: place.x, z: place.z, crowdSize, seed,
  };
  d.mode = 'libre';
  d.options = { ...d.options, journee: false };
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start(buildSessionConfig(d));
  return { t, ctx: t.ctx };
}

describe('fourgons cellulaires de la mise en place', () => {
  for (const [size, want] of [[150, 2], [600, 2], [3000, 4]] as const) {
    it(`${size} manifestants : ${want} fourgons avec équipage, 60 à 100 m derrière la ligne, dos à la foule`, async () => {
      const { t, ctx } = await freeSession(size, 11);
      t.step(1);
      const me = ctx.player.person()!;
      const company = ctx.squads.get(me.squadId)!;
      const vans = crewedVans(ctx);
      const line = lineOf(ctx, company.id);
      const foule = crowdCentre(ctx);
      const rows = vans.map(({ v, s }) => `${s.name} à ${Math.hypot(v.x - line.x, v.z - line.z).toFixed(0)} m, ${freeCells(v)} places`);
      console.log(`[${size}]`, rows.join(' ; '));
      expect(vans.length).toBe(want);
      // plus aucun fourgon cellulaire sans équipage
      expect(ctx.vehicles.list.filter((v) => v.kind === 'fourgon_cellulaire').length).toBe(want);
      const remise = ctx.service<RemiseApi>(REMISE_SERVICE)!;
      const point = remise.point();
      expect(point, 'point de remise fixé').not.toBeNull();
      expect(remise.vans().length).toBe(want);
      for (const { v, s } of vans) {
        expect(s.parentId, `${s.name} rattaché à la compagnie`).toBe(company.id);
        expect(s.name).toMatch(/^CELLULAIRE [1-4]$/);
        const driver = v.seats[0] ? ctx.people.get(v.seats[0]) : undefined;
        expect(driver?.faction, `${s.name} : conducteur au volant`).toBe('police');
        expect(s.members.length, `${s.name} : équipage de deux`).toBe(2);
        expect(freeCells(v), `${s.name} : huit places pour les interpellés`).toBe(8);
        const d = Math.hypot(v.x - line.x, v.z - line.z);
        expect(d, `${s.name} à 60–100 m de la ligne`).toBeGreaterThanOrEqual(55);
        expect(d).toBeLessThanOrEqual(105);
        // dos à la foule : de l'autre côté de la ligne
        const behind = (v.x - line.x) * (foule.x - line.x) + (v.z - line.z) * (foule.z - line.z);
        expect(behind, `${s.name} du côté opposé à la foule`).toBeLessThan(0);
      }
      const d0 = Math.hypot(point!.x - line.x, point!.z - line.z);
      expect(d0).toBeGreaterThanOrEqual(55);
      expect(d0).toBeLessThanOrEqual(105);
    }, 300000);
  }

  it('la ligne se déplace de plus de 80 m et s’arrête : le point de remise suit, les fourgons s’y rendent', async () => {
    const { t, ctx } = await freeSession(600, 11);
    t.step(1);
    const me = ctx.player.person()!;
    const company = ctx.squads.get(me.squadId)!;
    const remise = ctx.service<RemiseApi>(REMISE_SERVICE)!;
    const before = remise.point()!;
    // le commandant s'éloigne de 150 m par les rues : toute la compagnie le suit (« suivre » donné au départ)
    const path: number[] = [];
    const goal = { x: me.x, z: me.z };
    let found = false;
    for (let a = 0; a < 16 && !found; a++) {
      const gx = me.x + Math.sin(a * Math.PI / 8) * 150, gz = me.z + Math.cos(a * Math.PI / 8) * 150;
      path.length = 0;
      const surf = ctx.world.surfaceAt(gx, gz);
      if (ctx.world.isFree(gx, gz, 1) && (surf === 'road' || surf === 'plaza' || surf === 'sidewalk') && ctx.world.findPath(me.x, me.z, gx, gz, 'foot', path)) {
        goal.x = gx;
        goal.z = gz;
        found = true;
      }
    }
    expect(found, 'un point à 150 m').toBe(true);
    me.x = goal.x;
    me.z = goal.z;
    me.y = ctx.world.heightAt(goal.x, goal.z);
    ctx.people.rebuildIndex();
    let moved = false;
    for (let s = 0; s < 240 && !moved; s += 2) {
      t.step(2);
      const p = remise.point();
      if (p && Math.hypot(p.x - before.x, p.z - before.z) > 40) moved = true;
    }
    expect(moved, 'nouveau point de remise').toBe(true);
    const line = lineOf(ctx, company.id);
    const point = remise.point()!;
    const d = Math.hypot(point.x - line.x, point.z - line.z);
    console.log(`nouveau point à ${d.toFixed(0)} m de la ligne`);
    expect(d).toBeLessThanOrEqual(110);
    // les fourgons rejoignent leur place, au pilote automatique (sans sirène)
    let near = 0;
    for (let s = 0; s < 120; s += 2) {
      t.step(2);
      near = crewedVans(ctx).filter(({ v }) => Math.hypot(v.x - line.x, v.z - line.z) < 115).length;
      if (near === crewedVans(ctx).length) break;
    }
    console.log(`fourgons près de la nouvelle ligne : ${near} sur ${crewedVans(ctx).length}`);
    expect(near).toBe(crewedVans(ctx).length);
  }, 600000);

  it('journée de service : les fourgons cellulaires partent avec la colonne, équipage à bord, et prennent la remise à l’arrivée', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    const moyens = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 600,
      tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens, journee: true, preload: [basePreload(), bravmBasePreload()] },
    });
    const { ctx } = t;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const me = ctx.player.person()!;
    const vans0 = crewedVans(ctx);
    expect(vans0.length).toBe(2);
    const start = vans0.map(({ v }) => ({ x: v.x, z: v.z }));
    // le commandant monte dans son véhicule de commandement : la colonne part
    for (let i = 0; i < 12 && j.stage !== 'embarquement'; i++) t.step(5);
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement' && v.seats.some((id, k) => id === 0 && k > 0))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    me.x = vl.x + 3;
    me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'passenger')).toBe(true);
    for (let i = 0; i < 60 && j.stage === 'embarquement'; i++) t.step(5);
    expect(j.stage).toBe('route');
    // (la colonne traverse Paris : jusqu'à vingt minutes)
    for (let i = 0; i < 240 && j.stage === 'route'; i++) t.step(5);
    expect(j.stage).toBe('sur_place');
    const dest = j.destination!;
    // descendu, il reste là : les fourgons ont roulé avec la colonne, leur équipage à bord
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    const remise = ctx.service<RemiseApi>(REMISE_SERVICE)!;
    // (le débarquement de la colonne dure jusqu'à deux minutes ; le point est fixé quand la ligne est formée et arrêtée)
    for (let i = 0; i < 150 && remise.point() === null; i++) t.step(2);
    const point = remise.point();
    const rows = crewedVans(ctx).map(({ v, s }, k) => `${s.name} : parti de ${Math.hypot(v.x - start[k]!.x, v.z - start[k]!.z).toFixed(0)} m, à ${Math.hypot(v.x - dest.x, v.z - dest.z).toFixed(0)} m de la zone, conducteur ${v.seats[0] !== 0}`);
    console.log(rows.join(' ; '), point ? `point de remise à ${Math.hypot(point.x - dest.x, point.z - dest.z).toFixed(0)} m de la zone` : 'aucun point de remise');
    for (const { v, s } of crewedVans(ctx)) {
      expect(Math.hypot(v.x - dest.x, v.z - dest.z), `${s.name} arrivé avec la colonne`).toBeLessThan(260);
      expect(v.seats[0], `${s.name} : conducteur à bord`).not.toBe(0);
    }
    expect(point, 'point de remise fixé après le débarquement').not.toBeNull();
    const company0 = ctx.squads.get(me.squadId)!;
    const line = lineOf(ctx, company0.id);
    const dl = Math.hypot(point!.x - line.x, point!.z - line.z);
    console.log(`point de remise à ${dl.toFixed(0)} m de la ligne`);
    expect(dl, 'point de remise derrière la ligne, pas à l’autre bout du quartier').toBeLessThan(150);
  }, 900000);

  it('chaque mission où des forces de l’ordre sont engagées a au moins un fourgon cellulaire avec équipage', async () => {
    const rows: string[] = [];
    const missing: string[] = [];
    for (const def of MISSIONS) {
      const t = createTestContext({ seed: 7, strict: false, modules: SIM });
      await t.ready;
      const cfg = missionConfig(def, t.ctx.world) as SessionConfig;
      cfg.mode = 'carriere';
      // (forces déjà sur place : la journée de service n'est pas l'objet de ce recensement)
      await t.start(cfg);
      const { ctx } = t;
      const policeHere = ctx.people.list.some((p) => p.faction === 'police');
      const patrol = def.role === 'patrouille';
      const vans = crewedVans(ctx);
      const companies = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'compagnie').length;
      rows.push(`${def.id} : ${vans.length} fourgon(s), ${companies} compagnie(s)${policeHere ? '' : ', aucune force'}`);
      if (policeHere && !patrol && vans.length === 0) missing.push(def.id);
      if (companies > 0 && vans.length < 2) missing.push(`${def.id} (compagnie, ${vans.length} fourgon)`);
      if (companies === 0 && vans.length > 1) missing.push(`${def.id} (sans compagnie, ${vans.length} fourgons)`);
      t.game.dispose();
    }
    console.log(rows.join('\n'));
    expect(missing).toEqual([]);
  }, 1800000);
});
