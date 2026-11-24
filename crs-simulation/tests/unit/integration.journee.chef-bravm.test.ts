// Journée de service, chef de la BRAV-M (spécification §4.1.6) : la BRAV-M part avec lui ; s'il descend de sa moto au
// départ, elle l'attend (« Montez sur votre moto (E) — la BRAV-M part avec vous ») et repart dès qu'il est en selle ; au
// bout de 20 s, elle part sans lui, mais sa moto et son pilote restent et l'attendent (« Votre moto vous attend — 12 m ») :
// il n'est jamais laissé seul au commissariat, sans personne à commander ni moyen de la rejoindre.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
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
import { JOURNEE_SERVICE, SERVICE_BASES } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, objectives];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(seed: number) {
  const base = SERVICE_BASES[3]!;
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({
    mode: 'libre', role: 'bravm', rank: 'brigadier_chef', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 120, tension: 0.2, volatility: 0.2, duration: 'standard',
    extra: { moyens: MEANS, journee: true, base: { x: base.x, z: base.z, name: base.name }, poste: 'chef_groupe', baseBravm: { x: base.x, z: base.z, name: base.name } },
  } as never);
  const { ctx } = t;
  const me = ctx.player.person()!;
  const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  expect(me.poste).toBe('chef_groupe');
  const moto = ctx.vehicles.get(me.vehicleId)!;
  expect(moto && moto.kind === 'moto_bravm', 'en selle au départ').toBe(true);
  const faucon = ctx.squads.list.find((q) => q.faction === 'police' && q.leaderId === me.id && q.kind === 'groupe')!;
  expect(faucon).toBeTruthy();
  // ses motos : celles des binômes de sa BRAV-M
  const motos = ctx.squads.list.filter((q) => q.parentId === faucon.id && q.vehicleId !== 0).map((q) => ctx.vehicles.get(q.vehicleId)!).filter((v) => v && v.kind === 'moto_bravm');
  expect(motos.length).toBe(6);
  const text = (): string => obj.list.find((o) => o.id === 'journee')?.text ?? '';
  return { t, ctx, me, j, moto, motos, faucon, text };
}

/** Plus grand déplacement (m) des motos depuis `at`. */
function moved(motos: readonly Vehicle[], at: readonly { x: number; z: number }[]): number {
  return Math.max(...motos.map((v, i) => Math.hypot(v.x - at[i]!.x, v.z - at[i]!.z)));
}

function board(ctx: GameContext, me: Person, moto: Vehicle): void {
  me.x = moto.x + 1.5; me.z = moto.z;
  expect(ctx.vehicles.enter(me, moto, 'passenger')).toBe(true);
}

describe('journée de service : le chef de la BRAV-M n’est jamais laissé seul', () => {
  it('il descend de sa moto au départ : la BRAV-M l’attend, puis part avec lui dès qu’il remonte', async () => {
    const { t, ctx, me, j, moto, motos, faucon, text } = await start(11);
    ctx.vehicles.exit(me);
    t.step(2);
    expect(j.stage).toBe('embarquement');
    expect(text()).toBe('Montez sur votre moto (E) — la BRAV-M part avec vous');
    expect(j.readyIn()).toBeGreaterThan(0);
    const at = motos.map((v) => ({ x: v.x, z: v.z }));
    t.step(10);
    // elle l'attend : aucune moto ne part
    expect(moved(motos, at)).toBeLessThan(30);
    board(ctx, me, moto);
    const cmd = ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!;
    const ap = ctx.service<{ isActive(v: Vehicle): boolean }>('vehicles.autopilot')!;
    let goAt = -1;
    const t0 = ctx.clock.now;
    // elle part avec lui : en route, toutes ses motos (la sienne comprise) sous le pilote automatique, colonne lancée
    for (let i = 0; i < 30 && goAt < 0; i++) {
      t.step(0.5);
      if (cmd.special(faucon.id)?.stage === 'route' && motos.every((v) => ap.isActive(v))) goAt = ctx.clock.now - t0;
    }
    console.log(`remonté : BRAV-M en route, toutes ses motos lancées, à +${goAt.toFixed(1)} s ; ${text()}`);
    expect(j.stage).toBe('route');
    expect(goAt).toBeGreaterThanOrEqual(0);
    expect(goAt).toBeLessThanOrEqual(5);
    expect(text()).toMatch(/^En selle, en tête de la BRAV-M/);
    expect(me.vehicleId).toBe(moto.id);
    void at;
  }, 900_000);

  it('il ne remonte pas : 20 s après, la BRAV-M part, sa moto et son pilote l’attendent ; monté, il la rejoint', async () => {
    const { t, ctx, me, j, moto, motos, faucon, text } = await start(11);
    ctx.vehicles.exit(me);
    // il s'éloigne de quelques pas
    me.x += 6;
    const at = motos.map((v) => ({ x: v.x, z: v.z }));
    const mine = { x: moto.x, z: moto.z };
    t.step(24);
    const others = motos.filter((v) => v !== moto);
    const away = (): number => others.filter((v) => Math.hypot(v.x - at[motos.indexOf(v)]!.x, v.z - at[motos.indexOf(v)]!.z) > 50).length;
    for (let i = 0; i < 180 && away() < others.length - 1; i++) t.step(1);
    const pilot = moto.seats[0] !== 0 ? ctx.people.get(moto.seats[0]) : undefined;
    const gone = away();
    console.log(`parti sans lui : ${gone}/${others.length} motos à plus de 50 m ; la sienne à ${Math.hypot(moto.x - mine.x, moto.z - mine.z).toFixed(1)} m de sa place, pilote ${pilot ? pilot.poste : '—'} ; « ${text()} » ; ${faucon.name} ${faucon.order.type}`);
    expect(j.stage).toBe('route');
    expect(gone).toBeGreaterThanOrEqual(others.length - 1);
    // sa moto et son pilote sont restés
    expect(Math.hypot(moto.x - mine.x, moto.z - mine.z)).toBeLessThan(5);
    expect(pilot && pilot.poste === 'pilote_moto').toBe(true);
    expect(text()).toMatch(/^Votre moto vous attend — \d+ m$/);
    expect(ctx.radio.log.some((m) => /Votre moto et son pilote vous attendent/.test(m.text))).toBe(true);
    // il monte : son pilote l'emmène rejoindre la BRAV-M (la moto lui est rendue quand elle l'a rejointe), jusqu'à la zone
    board(ctx, me, moto);
    const ap = ctx.service<{ isActive(v: Vehicle): boolean }>('vehicles.autopilot')!;
    t.step(5);
    expect(ap.isActive(moto), 'sa moto roule (seule, ou dans la colonne de la BRAV-M)').toBe(true);
    expect(text()).toMatch(/^En selle avec la BRAV-M/);
    const dest = j.destination!;
    for (let i = 0; i < 160 && j.stage !== 'sur_place'; i++) t.step(5);
    t.step(30);
    console.log(`arrivée : ${j.stage}, la moto du chef à ${Math.hypot(moto.x - dest.x, moto.z - dest.z).toFixed(0)} m de la zone`);
    expect(j.stage).toBe('sur_place');
    expect(me.vehicleId).toBe(moto.id);
    expect(Math.hypot(moto.x - dest.x, moto.z - dest.z)).toBeLessThan(250);
    // sa moto est de nouveau celle de son binôme (la BRAV-M la commande)
    expect(ctx.squads.get(me.squadId)!.vehicleId).toBe(moto.id);
  }, 900_000);
});
