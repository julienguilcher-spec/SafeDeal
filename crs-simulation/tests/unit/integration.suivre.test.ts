// L'unité suit le joueur qui a une responsabilité : colonne de BRAV-M derrière sa moto, groupe qui embarque dans le
// fourgon du chef de groupe, escorte de CRS derrière le canon à eau.
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
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

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const COMPANY = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 1, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

/** Le joueur prend le volant du véhicule de ce type le plus proche (le conducteur IA lui cède la place). */
function takeWheel(ctx: GameContext, kind: string) {
  const me = ctx.player.person()!;
  const own = ctx.squads.get(me.squadId);
  const ownV = own && own.vehicleId ? ctx.vehicles.get(own.vehicleId) : undefined;
  const v = ownV && ownV.kind === kind ? ownV : ctx.vehicles.list.filter((x) => x.kind === kind).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
  if (me.vehicleId !== 0) ctx.vehicles.exit(me);
  if (v.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(v.seats[0])!);
  me.x = v.x + 3; me.z = v.z;
  expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
  return { me, v };
}

/** Le joueur roule tout droit (entrée clavier simulée : flèche avant à mi-course). */
function drive(t: ReturnType<typeof createTestContext>, ctx: GameContext, seconds: number): void {
  const input = ctx.input as { moveY: number; moveX: number };
  input.moveY = 0.5;
  input.moveX = 0;
  t.step(seconds);
  input.moveY = 0;
}

describe('l’unité suit le joueur', () => {
  it('BRAV-M : le joueur pilote sa moto, ses équipiers montent sur les autres motos et le suivent en colonne', async () => {
    const t = createTestContext({ seed: 6, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'bravm', rank: 'brigadier', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { poste: 'pilote_moto', 'crowd.none': true } });
    const { ctx } = t;
    t.step(2);
    const me = ctx.player.person()!;
    const squad = ctx.squads.get(me.squadId)!;
    expect(squad.leaderId).toBe(me.id);
    const moto = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId)! : ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (me.vehicleId === 0) ctx.vehicles.enter(me, moto, 'driver');
    t.step(20);
    const mates = squad.members.map((id) => ctx.people.get(id)!).filter((p) => !p.isPlayer);
    const aboard = mates.filter((p) => p.vehicleId !== 0).length;
    const x0 = moto.x, z0 = moto.z;
    moto.siren = 1;
    drive(t, ctx, 12);
    const others = ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm' && v !== moto && v.seats[0] !== 0);
    const moved = others.map((v) => Math.round(Math.hypot(v.x - moto.x, v.z - moto.z)));
    console.log(`BRAV-M : ${aboard}/${mates.length} équipiers en selle ; moto du joueur à ${Math.round(Math.hypot(moto.x - x0, moto.z - z0))} m ; motos suiveuses à ${moved.join(', ')} m de lui ; sirènes ${others.map((v) => v.siren).join(',')}`);
    expect(aboard).toBeGreaterThanOrEqual(Math.min(3, mates.length));
    expect(others.length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(moto.x - x0, moto.z - z0)).toBeGreaterThan(40);
    for (const d of moved) expect(d).toBeLessThan(60);
    expect(others.every((v) => v.siren === 1)).toBe(true);
  }, 300000);

  it('chef de groupe : il prend le volant du fourgon, son groupe embarque ; il descend, tout le monde descend', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'chef_groupe', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { moyens: MEANS, 'crowd.none': true } });
    const { ctx } = t;
    t.step(2);
    const me = ctx.player.person()!;
    const squad = ctx.squads.get(me.squadId)!;
    const van = ctx.vehicles.get(squad.vehicleId) ?? ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    me.x = van.x + 3; me.z = van.z;
    ctx.vehicles.exit(van.seats[0] !== 0 ? ctx.people.get(van.seats[0])! : me);
    expect(ctx.vehicles.enter(me, van, 'driver')).toBe(true);
    t.step(30);
    const mates = squad.members.map((id) => ctx.people.get(id)!).filter((p) => !p.isPlayer);
    const inVan = mates.filter((p) => p.vehicleId === van.id).length;
    console.log(`chef de groupe : ${inVan}/${mates.length} équipiers à bord du fourgon (${van.def.seats.length} places)`);
    expect(inVan).toBeGreaterThanOrEqual(Math.min(mates.length, van.def.seats.length - 1) - 1);
    ctx.vehicles.exit(me);
    t.step(3);
    expect(mates.filter((p) => p.vehicleId !== 0).length).toBe(0);
  }, 300000);

  it('canon à eau : l’équipage monte à ses postes, le groupe d’escorte embarque dans son fourgon et suit l’engin', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'operateur_canon_eau', place: 'essai', x: -10, z: 15, crowdSize: 30, tension: 0, volatility: 0, duration: 'standard', extra: { moyens: COMPANY } });
    const { ctx } = t;
    t.step(5);
    const { me, v } = takeWheel(ctx, 'canon_eau');
    const crew = ctx.squads.get(me.squadId)!;
    const escort = ctx.squads.list.find((s) => s.parentId === crew.id)!;
    expect(escort).toBeDefined();
    t.step(45);
    const van = ctx.vehicles.get(escort.vehicleId)!;
    const crewAboard = crew.members.filter((id) => ctx.people.get(id)!.vehicleId === v.id).length;
    const escortAboard = escort.members.filter((id) => ctx.people.get(id)!.vehicleId === van.id).length;
    const d0 = Math.hypot(van.x - v.x, van.z - v.z);
    v.siren = 1;
    const input = ctx.input as { moveY: number };
    input.moveY = 1; t.step(8); input.moveY = 0; t.step(6);
    const d1 = Math.hypot(van.x - v.x, van.z - v.z);
    console.log(`canon à eau : équipage ${crewAboard}/${crew.members.length} à bord ; escorte ${escort.name} ${escortAboard}/${escort.members.length} dans son fourgon ; écart ${d0.toFixed(0)} → ${d1.toFixed(0)} m ; sirène escorte ${van.siren}`);
    expect(crewAboard).toBe(crew.members.length);
    expect(escortAboard).toBe(escort.members.length);
    expect(d1).toBeLessThan(d0);
    expect(van.siren).toBe(1);
  }, 300000);

  it('commandant au volant : toute la compagnie embarque, suit en colonne, puis débarque en ligne et le suit (le canon garde son équipage)', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', place: 'essai', x: -10, z: 15, crowdSize: 30, tension: 0, volatility: 0, duration: 'standard', extra: { moyens: COMPANY, variante: 'terrain' } });
    const { ctx } = t;
    t.step(5);
    const { me, v } = takeWheel(ctx, 'vl_commandement');
    t.step(45);
    const groups = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe' && s.vehicleId !== 0);
    const embarked = groups.filter((s) => s.order.type === 'embarquer' && s.members.filter((id) => ctx.people.get(id)!.vehicleId !== 0).length >= s.members.length - 1);
    v.siren = 1;
    const input = ctx.input as { moveY: number };
    input.moveY = 1; t.step(8); input.moveY = 0; t.step(6);
    const vans = embarked.map((s) => ctx.vehicles.get(s.vehicleId)!);
    console.log(`commandant : ${embarked.length}/${groups.length} groupes embarqués ; fourgons à ${vans.map((x) => Math.round(Math.hypot(x.x - v.x, x.z - v.z))).join(', ')} m ; sirènes ${vans.map((x) => x.siren).join('')}`);
    expect(embarked.length).toBeGreaterThanOrEqual(4);
    expect(vans.every((x) => x.siren === 1)).toBe(true);
    ctx.vehicles.exit(me);
    t.step(10);
    const cannon = ctx.squads.list.find((s) => s.kind === 'equipage' && ctx.vehicles.get(s.vehicleId)?.kind === 'canon_eau')!;
    // (ils débarquent en ligne à côté de leur fourgon, puis le suivent à pied : jamais laissés à « débarquer » — sauf le
    // groupe repris pour l'escorte à pied du canon à eau, un seul : « tout le monde me suit » ne retient pas l'escorte d'un
    // blindé, spécification « ordres directs » §3.3, session/engins.ts)
    const guards = (s: (typeof groups)[number]) => (s.order.type === 'proteger' || s.order.type === 'suivre') && s.order.targetId === cannon.vehicleId;
    const follows = (s: (typeof groups)[number]) => s.order.type === 'suivre' && s.order.targetId === me.id;
    expect(groups.filter((s) => !(s.order.type === 'debarquer' || follows(s) || guards(s))).map((s) => `${s.name}=${s.order.type}`)).toEqual([]);
    for (let i = 0; i < 20 && !groups.every((s) => follows(s) || guards(s)); i++) t.step(2);
    expect(groups.filter((s) => !follows(s) && !guards(s)).map((s) => `${s.name}=${s.order.type}`)).toEqual([]);
    expect(groups.filter(guards).length).toBeLessThanOrEqual(1);
    expect(groups.filter(follows).length).toBeGreaterThanOrEqual(groups.length - 1);
    expect(cannon.members.filter((id) => ctx.people.get(id)!.vehicleId !== 0).length).toBe(cannon.members.length);
  }, 300000);

  it('Centaure : jamais seul — le second Centaure et l’escorte suivent l’engin du joueur', async () => {
    const t = createTestContext({ seed: 8, strict: false, modules: SIM });
    const moyens = { ...COMPANY, centaure: 2 };
    await t.start({ mode: 'libre', role: 'gendarme_centaure', place: 'essai', x: -10, z: 15, crowdSize: 30, tension: 0, volatility: 0, duration: 'standard', extra: { moyens } });
    const { ctx } = t;
    t.step(5);
    const { v } = takeWheel(ctx, 'centaure');
    const other = ctx.vehicles.list.find((q) => q.kind === 'centaure' && q !== v)!;
    expect(other).toBeDefined();
    const d0 = Math.hypot(other.x - v.x, other.z - v.z);
    t.step(45);
    v.siren = 1;
    const input = ctx.input as { moveY: number };
    input.moveY = 1; t.step(10); input.moveY = 0; t.step(8);
    const d1 = Math.hypot(other.x - v.x, other.z - v.z);
    const ap = ctx.service<{ status(v: unknown): { mode: string; leaderId: number } }>('vehicles.autopilot')!;
    console.log(`second Centaure : conducteur ${other.seats[0] ? 'oui' : 'non'}, ${ap.status(other).mode}, écart ${d0.toFixed(0)} → ${d1.toFixed(0)} m, sirène ${other.siren}`);
    expect(other.seats[0]).not.toBe(0);
    expect(ap.status(other).mode).toBe('follow');
    expect(d1).toBeLessThan(Math.max(40, d0));
  }, 300000);
});

