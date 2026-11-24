// Commissariats et ordres directs ensemble (vraie carte de Paris, Concorde, commandant, commissariats chargés) :
//   (e) au début de la partie, personne au repos dans un commissariat ne suit le joueur ni n'est proposé (« A », « Toute
//       la compagnie », U) ; un interpellé va dans un fourgon cellulaire du dispositif, jamais dans un fourgon garé en
//       réserve d'un commissariat ;
//   (f) deux parties de suite : la seconde ne garde ni unité de commissariat engagée, ni ticket d'ordre direct, ni
//       colonne, ni ordre repris au débarquement de la première.
import { describe, expect, it } from 'vitest';

import type { EntityId, GameContext, SessionConfig, Vehicle } from '@/core/contracts';
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
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { entryNumber } from '@/ui/command/commissariatsModel';
import { directEnvFromCore, everyone, whoCycle } from '@/ui/command/direct';
import { COMMISSARIATS, isAtPost, isHeldVehicle } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, patrols, commissariats, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const CONFIG = {
  mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300,
  tension: 0.3, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
} as Partial<SessionConfig>;

interface ArrestsLike { nearestVan(x: number, z: number, op: unknown): Vehicle | null; receives(v: Vehicle, op: unknown): boolean }
interface DirectLike { readonly tickets: readonly unknown[]; give(which?: 'go' | 'autre'): { ok: boolean }; avecMoi(): { ok: boolean } }
interface ConvoyLike { convoyOf(id: number): { stage: string } | null }

/** Unité d'un commissariat (engagée ou non) : son équipage a été créé par le module des commissariats. */
function stationSquads(ctx: GameContext, api: CommissariatsApi): number[] {
  return ctx.squads.list.filter((s) => api.isStationUnit(s.id)).map((s) => s.id);
}

/** L'équipage d'un véhicule (conducteur, sinon un passager), 0 sans personne à bord. */
function crewOf(ctx: GameContext, v: Vehicle): number {
  for (const id of v.seats) {
    const p = id !== 0 ? ctx.people.get(id as EntityId) : undefined;
    if (p && p.squadId !== 0) return p.squadId;
  }
  return 0;
}

async function start(t: ReturnType<typeof createTestContext>) {
  await t.start(CONFIG);
  t.step(3);
  const ctx = t.ctx;
  for (const c of COMMISSARIATS) await ctx.world.whenLoaded(c.door.x, c.door.z, 260);
  t.step(2);
  return {
    ctx, api: ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE), core: ctx.require<CommandCore>('ui.command'),
    direct: ctx.require<DirectLike>('command.direct'), arrests: ctx.require<ArrestsLike>('police.arrests'), cmd: ctx.require<ConvoyLike>('police.command'),
  };
}

describe('commissariats et ordres directs', () => {
  it('(e) personne au commissariat ne suit le joueur ; un interpellé ne va jamais dans un fourgon de la réserve ; (f) deux parties de suite', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: SIM });
    let { ctx, api, core, direct, arrests, cmd } = await start(t);
    const me = ctx.player.person()!;
    expect(api.enabled).toBe(true);

    // (e) — personne au repos dans un commissariat ne suit le joueur
    const followers = ctx.squads.list.filter((s) => s.faction === 'police' && s.order.type === 'suivre' && s.order.targetId === me.id);
    expect(followers.length).toBeGreaterThan(0);
    for (const s of followers) {
      expect(api.isStationUnit(s.id), s.name).toBe(false);
      expect(isAtPost(ctx, s.id), s.name).toBe(false);
    }
    // ni proposé par les ordres directs : unités, U, « Toute la compagnie »
    const env = directEnvFromCore(core);
    const station = new Set(stationSquads(ctx, api));
    for (const u of env.units) expect(station.has(u.squadId) && isAtPost(ctx, u.squadId), u.name).toBe(false);
    for (const k of whoCycle(env)) if (k.startsWith('u')) expect(isAtPost(ctx, Number(k.slice(1))), k).toBe(false);
    const all = everyone(env);
    expect(all).toBeTruthy();
    for (const id of all!.squadIds) expect(isAtPost(ctx, id)).toBe(false);
    // aucun véhicule de la réserve n'a été pris par une unité de la partie
    const held = ctx.vehicles.list.filter((v) => isHeldVehicle(ctx, v.id));
    expect(held.length).toBeGreaterThan(20);
    for (const v of held) for (const id of v.seats) if (id !== 0) expect(api.isStationUnit(ctx.people.get(id as EntityId)!.squadId)).toBe(true);

    // (e) — fourgons cellulaires : ceux de la réserve (garés, ou leur équipage au poste) ne reçoivent personne ; le
    // fourgon le plus proche d'un interpellé pris à côté de l'un d'eux est un fourgon du dispositif (ou aucun)
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_cellulaire');
    const reserveVans = vans.filter((v) => isHeldVehicle(ctx, v.id) || (crewOf(ctx, v) !== 0 && isAtPost(ctx, crewOf(ctx, v))));
    const ownVans = vans.filter((v) => reserveVans.indexOf(v) < 0);
    expect(reserveVans.length, 'des fourgons cellulaires dans les commissariats').toBeGreaterThan(0);
    expect(ownVans.length, 'les fourgons cellulaires de la compagnie').toBeGreaterThanOrEqual(2);
    for (const v of reserveVans) {
      expect(arrests.receives(v, null), `fourgon de réserve ${v.id}`).toBe(false);
      const pick = arrests.nearestVan(v.x + 3, v.z, null);
      if (pick) expect(reserveVans.indexOf(pick), `fourgon choisi près de la réserve ${v.id}`).toBe(-1);
    }
    for (const v of ownVans) expect(arrests.receives(v, null)).toBe(true);
    const nearMe = arrests.nearestVan(me.x, me.z, null);
    expect(nearMe && ownVans.indexOf(nearMe) >= 0, 'le fourgon du dispositif près du joueur').toBe(true);

    // « En colonne » à la BRAV-M en selle pour un point à 600 m : la radio dit « à moto », jamais « En file, à pied »
    const faucon = ctx.squads.list.find((s) => s.faction === 'police' && /^FAUCON \d+$/.test(s.name) && !api.isStationUnit(s.id))!;
    expect(faucon, 'la BRAV-M de la compagnie').toBeTruthy();
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    const lead = ctx.people.get(ctx.squads.childrenOf(faucon.id)[0]!.leaderId)!;
    expect(ctx.world.nearestRoad(lead.x + 600, lead.z, road as never, 200)).toBe(true);
    const n0 = ctx.radio.log.length;
    expect(core.issue('colonne', [faucon], [{ x: road.x, z: road.z, heading: road.heading, width: 0 }]).ok).toBe(true);
    const line = ctx.radio.log.slice(n0).map((m) => m.text).find((s) => s.includes(faucon.name))!;
    expect(line, 'l’ordre à la radio').toBeTruthy();
    expect(line).toMatch(/Mouvement à moto, en colonne/);
    expect(line).not.toMatch(/à pied/);

    // (f) — première partie : un ordre direct (« A », tout le monde avec moi), une unité de commissariat engagée et
    // envoyée en véhicules, puis une seconde partie
    expect(direct.avecMoi().ok).toBe(true);
    // (même chemin que la fiche du commissariat, touche C : l'étendue du commandement est recalculée)
    const r = core.engageFromCommissariat(entryNumber('cite:aquilon1'));
    expect(r.ok, r.reason).toBe(true);
    const sq = ctx.squads.get(r.squadId)!;
    expect(core.issue('faire_mouvement', [sq], [{ x: me.x + 40, z: me.z, heading: 0, width: 0 }]).ok).toBe(true);
    t.step(20);
    expect(cmd.convoyOf(sq.id), 'la colonne de la section engagée').not.toBeNull();
    expect(direct.tickets.length).toBeGreaterThan(0);
    const oldIds = ctx.squads.list.map((s) => s.id);

    ({ ctx, api, core, direct, arrests, cmd } = await start(t));
    const me2 = ctx.player.person()!;
    expect(direct.tickets.length, 'aucun ticket de la partie précédente').toBe(0);
    expect(core.afterConvoy.size).toBe(0);
    for (const e of api.list.flatMap((c) => c.entries)) {
      expect(e.squadId, e.id).toBe(0);
      expect(e.state, e.id).toBe('au_poste');
    }
    for (const id of oldIds) {
      const st = cmd.convoyOf(id);
      if (st) expect(['en_place', 'annule', 'parti'], `colonne ${id}`).toContain(st.stage);
    }
    for (const s of ctx.squads.list) {
      if (s.order.type === 'suivre' && s.order.targetId === me2.id) expect(api.isStationUnit(s.id), s.name).toBe(false);
    }
    const env2 = directEnvFromCore(core);
    for (const u of env2.units) expect(isAtPost(ctx, u.squadId), u.name).toBe(false);
  }, 900000);
});
