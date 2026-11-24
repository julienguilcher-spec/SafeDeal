// Service 'police.commissariats' sur la vraie carte de Paris : à la mise en place, les 32 véhicules du stock sont garés
// sur leurs places figées (police, verrouillés, vides, frein à main), tenus en réserve (holds), sans chevaucher aucun
// autre véhicule, identiques d'une partie à l'autre ; extra.commissariats = false : rien ; rôle CRS ou
// extra.renforts = false : personne ne peut engager ; cinq minutes de manifestation avec une compagnie : aucune unité
// du stock n'apparaît d'elle-même et le commandement automatique ne change pas.
import { describe, expect, it } from 'vitest';

import type { SessionConfig, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import type { CommandApi } from '@/sim/police/command/api';
import { COMMISSARIATS, isHeldVehicle } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, traffic, police, law, radio, session, patrols, commissariats];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const TOTAL = COMMISSARIATS.reduce((n, c) => n + c.stock.reduce((m, s) => m + s.vehicles, 0), 0);

async function start(config: Partial<SessionConfig> = {}, seed = 7, modules = SIM) {
  const t = createTestContext({ seed, strict: false, modules });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
    tension: 0.1, volatility: 0.1, duration: 'standard', ...config,
    extra: { moyens: MEANS, variante: 'salle', foyers: 0, ...(config.extra ?? {}) },
  } as Partial<SessionConfig>);
  return { t, ctx: t.ctx, api: t.ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE) };
}

/** Deux caisses se chevauchent-elles (axes séparateurs) ? */
function overlap(a: Vehicle, b: Vehicle): boolean {
  const boxes = [a, b].map((v) => ({ x: v.x, z: v.z, fx: Math.sin(v.heading), fz: Math.cos(v.heading), hl: v.def.length / 2, hw: v.def.width / 2 }));
  for (const [ax, az] of boxes.flatMap((o) => [[o.fx, o.fz], [o.fz, -o.fx]])) {
    const p = boxes.map((o) => {
      const c = o.x * ax! + o.z * az!;
      const r = Math.abs(o.fx * ax! + o.fz * az!) * o.hl + Math.abs(o.fz * ax! - o.fx * az!) * o.hw;
      return [c - r, c + r] as const;
    });
    if (p[0]![1] < p[1]![0] || p[1]![1] < p[0]![0]) return false;
  }
  return true;
}

function heldVehicles(ctx: { vehicles: { list: readonly Vehicle[] } }, api: CommissariatsApi): Vehicle[] {
  return ctx.vehicles.list.filter((v) => api.holds(v.id));
}

describe('commissariats — stock garé', () => {
  it('32 véhicules sur leurs places, police, verrouillés, vides, frein à main ; tenus ; sans chevauchement ; déterministes', async () => {
    expect(TOTAL).toBe(32);
    const { t, ctx, api } = await start();
    expect(api.enabled).toBe(true);
    expect(api.canDispatch).toBe(true);
    expect(api.list.map((c) => c.id)).toEqual(COMMISSARIATS.map((c) => c.id));
    const held = heldVehicles(ctx, api);
    // les places occupées (journalisées) font des véhicules « virtuels » : il en manque d'autant
    let stockVehicles = 0;
    for (const c of api.list) for (const e of c.entries) stockVehicles += e.vehicles;
    expect(stockVehicles).toBe(32);
    console.log(`véhicules garés : ${held.length} / 32`);
    expect(held.length).toBeGreaterThanOrEqual(30);
    const slots = COMMISSARIATS.flatMap((c) => c.slots);
    for (const v of held) {
      const d = Math.min(...slots.map((s) => Math.hypot(s.x - v.x, s.z - v.z)));
      expect(d).toBeLessThan(0.5);
      expect(v.faction).toBe('police');
      expect(v.locked).toBe(true);
      expect(v.engineOn).toBe(false);
      expect(v.cmd.handbrake).toBe(true);
      expect(v.seats.every((s) => s === 0)).toBe(true);
      expect(isHeldVehicle(ctx, v.id)).toBe(true);
    }
    // chaque véhicule garé est rattaché à son unité, qui le liste
    for (const c of api.list) for (const e of c.entries) for (const id of e.vehicleIds) expect(api.holds(id)).toBe(true);
    // genres : tous les véhicules de police du jeu
    const kinds = new Set(held.map((v) => v.kind));
    for (const k of ['fourgon_crs', 'canon_eau', 'fourgon_cellulaire', 'car_crs', 'vl_commandement', 'centaure', 'voiture_police', 'moto_bravm']) {
      expect(kinds.has(k)).toBe(true);
    }
    // aucun chevauchement, ni à la mise en place ni une fois la circulation garée autour
    const check = (): void => {
      const list = ctx.vehicles.list;
      for (const v of held) for (const o of list) if (o !== v && !o.def.flying) expect(overlap(v, o), `${v.kind} ${v.id} / ${o.kind} ${o.id}`).toBe(false);
    };
    check();
    t.step(5);
    check();
    for (const v of held) expect(api.holds(v.id)).toBe(true);
    // les compteurs : tout est disponible (hors dispositif exclu)
    const cite = api.get('cite')!;
    expect(cite.available).toBe(4);
    expect(api.get('9e')!.available).toBe(3);
    expect(api.entry('cite:car1')!.engageable).toBe(false);

    // même graine, même partie : mêmes véhicules aux mêmes places
    const again = await start();
    const a = held.map((v) => `${v.kind}@${v.x.toFixed(2)},${v.z.toFixed(2)}`);
    const b = heldVehicles(again.ctx, again.api).map((v) => `${v.kind}@${v.x.toFixed(2)},${v.z.toFixed(2)}`);
    expect(b).toEqual(a);
  }, 600000);

  it('journée de service à la caserne de la Cité : places prises par la compagnie sautées, aucun chevauchement', async () => {
    const base = { x: 1760, z: 1225, name: 'caserne de la Cité' };
    const { ctx, api } = await start({ place: 'Place de la République', x: 3123, z: -208, extra: { journee: true, base } });
    const held = heldVehicles(ctx, api);
    let stock = 0, virtual = 0;
    for (const c of api.list) for (const e of c.entries) {
      stock += e.vehicles;
      virtual += e.vehicles - e.vehicleIds.length;
    }
    console.log(`Cité en journée : ${held.length} véhicules garés, ${virtual} sans place (créés à l'engagement)`);
    expect(stock).toBe(32);
    expect(held.length + virtual).toBe(32);
    for (const v of held) for (const o of ctx.vehicles.list) if (o !== v && !o.def.flying) expect(overlap(v, o), `${v.kind} / ${o.kind}`).toBe(false);
    // une unité dont un véhicule n'avait pas de place s'engage quand même, sans chevauchement
    const withVirtual = api.list.flatMap((c) => c.entries).find((e) => e.engageable && e.vehicleIds.length < e.vehicles);
    if (withVirtual) {
      const r = api.engage(withVirtual.id);
      expect(r.ok).toBe(true);
      expect(withVirtual.vehicleIds.length).toBe(withVirtual.vehicles);
      console.log(`${withVirtual.callsign} engagée : ${withVirtual.vehicles} véhicule(s)`);
    }
  }, 300000);

  it('places occupées : véhicules sans place (« virtuels »), créés à l’engagement sans chevauchement', async () => {
    // sans le module de session : la mise en place est déclenchée ici, après avoir garé des voitures sur des places
    const t = createTestContext({ seed: 3, strict: false, modules: [world, roles, people, vehicles, police, law, radio, patrols, commissariats] });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', x: 1700, z: 1200, crowdSize: 0 } as Partial<SessionConfig>);
    const { ctx } = t;
    ctx.player.state.role = 'commandant';
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const cite = COMMISSARIATS.find((c) => c.id === 'cite')!;
    const neptune = cite.stock.find((s) => s.id === 'cite:neptune11')!;
    // une berline sur la place de NEPTUNE 11, d'autres sur les trois places de réserve
    const blockers = [neptune.slots[0]!, ...cite.slots.map((s, i) => (s.spare ? i : -1)).filter((i) => i >= 0)]
      .map((i) => ctx.vehicles.spawn('voiture', cite.slots[i]!.x, cite.slots[i]!.z, cite.slots[i]!.heading));
    ctx.events.emitAny('session:setup', { playerId: 0 });
    expect(api.enabled).toBe(true);
    const entry = api.entry('cite:neptune11')!;
    expect(entry.vehicles).toBe(1);
    expect(entry.vehicleIds.length).toBe(0);
    expect(heldVehicles(ctx, api).length).toBe(31);
    // les berlines parties, l'engin est posé sur sa place
    for (const b of blockers) ctx.vehicles.remove(b.id);
    const r = api.engage('cite:neptune11');
    expect(r.ok).toBe(true);
    const canon = ctx.vehicles.get(entry.vehicleIds[0]!)!;
    expect(canon.kind).toBe('canon_eau');
    const slot = cite.slots[neptune.slots[0]!]!;
    expect(Math.hypot(canon.x - slot.x, canon.z - slot.z)).toBeLessThan(0.05);
    for (const o of ctx.vehicles.list) if (o !== canon) expect(overlap(canon, o), o.kind).toBe(false);
  }, 300000);

  it('extra.commissariats = false : aucun véhicule garé, service inactif', async () => {
    const { ctx, api } = await start({ extra: { commissariats: false } });
    expect(api.enabled).toBe(false);
    expect(api.canDispatch).toBe(false);
    expect(api.list.length).toBe(0);
    expect(heldVehicles(ctx, api).length).toBe(0);
    expect(api.engage('9e:tv19').ok).toBe(false);
  }, 300000);

  it('rôle CRS : lecture seule ; extra.renforts = false : moyens fixés', async () => {
    const crs = await start({ role: 'crs', rank: 'gardien' });
    expect(crs.api.enabled).toBe(true);
    expect(crs.api.canDispatch).toBe(false);
    const r = crs.api.engage('9e:tv19');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Seul le commandant engage les moyens des commissariats');
    expect(r.squadId).toBe(0);
    expect(crs.api.entry('9e:tv19')!.state).toBe('au_poste');
    expect(heldVehicles(crs.ctx, crs.api).length).toBeGreaterThanOrEqual(30);

    const fixed = await start({ extra: { renforts: false } });
    expect(fixed.api.enabled).toBe(true);
    expect(fixed.api.canDispatch).toBe(false);
    expect(fixed.api.engage('cite:aquilon1').reason).toBe('Moyens fixés par l’ordre d’opération');
    // un véhicule hors dispositif ne s'engage jamais
    const cmd = await start();
    expect(cmd.api.engage('cite:pc1').ok).toBe(false);
    expect(cmd.api.engage('inconnu').reason).toBe('Unité inconnue');
  }, 300000);

  it('cinq minutes de manifestation avec une compagnie : aucune unité du stock n’apparaît, commandement inchangé', async () => {
    const config: Partial<SessionConfig> = {
      place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.3, volatility: 0.3, extra: { foyers: 0 },
    };
    const withCrowd = (list: typeof SIM) => [...list.slice(0, 5), crowd, ...list.slice(5)];
    /** Cinq minutes de partie : unités créées et compagnies commandées par l'IA (ou conseillées). */
    const run = async (modules: typeof SIM) => {
      const t = createTestContext({ seed: 11, strict: false, modules });
      await t.start({
        mode: 'libre', role: 'commandant', rank: 'commandant', duration: 'standard', ...config,
        extra: { moyens: MEANS, variante: 'salle', ...config.extra },
      } as Partial<SessionConfig>);
      const squads0 = t.ctx.squads.list.length;
      for (let k = 0; k < 30; k++) t.step(10, 0.05);
      const cmd = t.ctx.service<CommandApi>('police.command');
      return { t, squads0, commands: cmd ? cmd.commands.map((c) => `${t.ctx.squads.get(c.squadId)?.name ?? c.squadId}:${c.mode}`) : [] };
    };
    const ref = await run(withCrowd(SIM.filter((m) => m !== commissariats)));
    const got = await run(withCrowd(SIM));
    const { ctx } = got.t;
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const callsigns = new Set(COMMISSARIATS.flatMap((c) => c.stock.map((s) => s.callsign)));
    for (const s of ctx.squads.list) {
      expect(callsigns.has(s.name), s.name).toBe(false);
      expect(api.isStationUnit(s.id)).toBe(false);
    }
    // le commandement automatique se comporte comme sans les commissariats
    expect(got.commands).toEqual(ref.commands);
    expect(heldVehicles(ctx, api).length).toBe(32);
    for (const c of api.list) for (const e of c.entries) expect(e.state).toBe('au_poste');
    console.log(`unités : ${got.squads0} → ${ctx.squads.list.length} (sans commissariats : ${ref.squads0} → ${ref.t.ctx.squads.list.length}) ; commandements ${got.commands.length}`);
  }, 900000);
});
