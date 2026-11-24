// Ordre à pied donné à une unité assise dans ses fourgons (diag-arrivee P1, séquence R5) : les agents descendent
// d'abord, tous les véhicules à la fois, puis exécutent l'ordre ; aucun compte rendu « Tortue formée », « Barrage en
// place »… tant que l'unité est restée à bord. Vraie place de la Concorde, commandant « Déjà sur place ».
import { describe, expect, it } from 'vitest';

import type { GameContext, OrderType, Squad, SquadOrder } from '@/core/contracts';
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
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { AutopilotApi } from '@/sim/vehicles/api';
import { ORDER_DONE_EVENT } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 3, fourgons: 9, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(seed: number, withCommand = false) {
  const t = createTestContext({ seed, strict: false, modules: withCommand ? [...SIM, command] : SIM });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 200, tension: 0.1,
    volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const { ctx } = t;
  const me = ctx.player.person()!;
  let company = ctx.squads.get(me.squadId)!;
  while (company.parentId !== 0) company = ctx.squads.get(company.parentId)!;
  return { t, ctx, me, company };
}

/** Agents de l'unité et de sa descendance (le joueur, les conducteurs et les équipages d'engin exceptés). */
function troops(ctx: GameContext, root: Squad): number[] {
  const out: number[] = [];
  const walk = (s: Squad): void => {
    if (s.kind !== 'equipage') for (const id of s.members) {
      const p = ctx.people.get(id);
      if (p && !p.isPlayer && p.poste !== 'conducteur') out.push(id);
    }
    for (const c of ctx.squads.childrenOf(s.id)) walk(c);
  };
  walk(root);
  return out;
}

function seated(ctx: GameContext, ids: readonly number[]): number {
  return ids.filter((id) => (ctx.people.get(id)?.vehicleId ?? 0) !== 0).length;
}

/** La compagnie embarque (« Suivez-moi en véhicules » donné à pied, R5) : on attend que presque tout le monde soit assis. */
function board(t: ReturnType<typeof createTestContext>, ctx: GameContext, company: Squad, ids: readonly number[]): void {
  ctx.squads.issue(company.id, { type: 'embarquer', issuedBy: ctx.player.state.personId, byPlayer: true });
  for (let i = 0; i < 60 && seated(ctx, ids) < ids.length * 0.9; i++) t.step(1);
}

function orderFor(ctx: GameContext, type: OrderType, x: number, z: number, heading: number): Partial<SquadOrder> & { type: OrderType } {
  return { type, x, z, heading, width: 0, issuedBy: ctx.player.state.personId, byPlayer: true };
}

describe('ordre à pied à une unité assise dans ses fourgons', () => {
  it('ligne, tenir, tortue, rue barrée : ils descendent (premier ≤ 2 s, tous ≤ 8 s) puis la manœuvre est faite', async () => {
    const { t, ctx, me, company } = await start(21);
    const ids = troops(ctx, company);
    const done: Array<{ squadId: number; type: string; ok: boolean }> = [];
    ctx.events.onAny(ORDER_DONE_EVENT, (e) => done.push(e as { squadId: number; type: string; ok: boolean }));
    const cases: OrderType[] = ['ligne', 'tenir', 'tortue', 'couper_circulation'];
    for (const type of cases) {
      board(t, ctx, company, ids);
      const before = seated(ctx, ids);
      expect(before).toBeGreaterThanOrEqual(Math.floor(ids.length * 0.9));
      // point d'ordre : 30 m devant le commandant, dans la rue qui longe les fourgons
      const h = me.heading;
      const x = me.x + Math.sin(h) * 30;
      const z = me.z + Math.cos(h) * 30;
      const radioFrom = ctx.radio.log.length;
      done.length = 0;
      ctx.squads.issue(company.id, orderFor(ctx, type, x, z, h));
      let firstOut = -1;
      let allOut = -1;
      let doneAt = -1;
      let tortueAt = -1;
      let tortueSeated = -1;
      for (let s = 0; s < 90 && doneAt < 0; s += 0.5) {
        t.step(0.5);
        const n = seated(ctx, ids);
        if (firstOut < 0 && n < before) firstOut = s + 0.5;
        if (allOut < 0 && n === 0) allOut = s + 0.5;
        if (tortueAt < 0 && ctx.radio.log.slice(radioFrom).some((m) => /Tortue formée/.test(m.text))) {
          tortueAt = s + 0.5;
          tortueSeated = n;
        }
        if (done.some((e) => e.squadId === company.id && e.type === type && e.ok)) doneAt = s + 0.5;
      }
      t.step(4);
      const reports = ctx.radio.log.slice(radioFrom).map((m) => m.text).filter((x) => !/REÇU/.test(x));
      console.log(`${type} : ${before}/${ids.length} assis ; premier dehors ${firstOut} s ; tous dehors ${allOut} s ; manœuvre faite ${doneAt} s ; ordre ${company.order.type} ; comptes rendus : ${reports.join(' | ')}`);
      expect(firstOut).toBeGreaterThan(0);
      expect(firstOut).toBeLessThanOrEqual(2);
      expect(allOut).toBeGreaterThan(0);
      expect(allOut).toBeLessThanOrEqual(8);
      expect(doneAt).toBeGreaterThan(0);
      expect(company.order.type).toBe(type);
      if (type === 'tortue') {
        expect(tortueAt).toBeGreaterThan(0);
        expect(tortueSeated).toBe(0);
      }
    }
  }, 900000);

  it('ordre de l’IA à une unité dont le fourgon est en route : personne ne descend, et aucun « Tortue formée » ni « Barrage en place »', async () => {
    const { t, ctx, company } = await start(21);
    // un groupe et son fourgon : il embarque, puis son fourgon part au loin sous le pilote automatique
    const group = ctx.squads.list.find((s) => s.faction === 'police' && s.kind === 'groupe' && s.vehicleId !== 0 && ctx.vehicles.get(s.vehicleId)?.kind === 'fourgon_crs' && s.parentId !== 0)!;
    expect(group).toBeDefined();
    void company;
    const ids = troops(ctx, group);
    ctx.squads.issue(group.id, { type: 'embarquer', issuedBy: 0 });
    for (let i = 0; i < 60 && seated(ctx, ids) < ids.length; i++) t.step(1);
    const aboard = seated(ctx, ids);
    expect(aboard).toBeGreaterThanOrEqual(ids.length - 1);
    const van = ctx.vehicles.get(group.vehicleId)!;
    // le conducteur au volant
    expect(van.seats[0]).not.toBe(0);
    const ap = ctx.service<AutopilotApi>('vehicles.autopilot')!;
    const x0 = van.x;
    const z0 = van.z;
    expect(ap.driveTo(van, van.x + 600, van.z + 200)).toBe(true);
    t.step(4);
    const radioFrom = ctx.radio.log.length;
    // ordre de l'IA (pas du joueur) pendant que le fourgon roule : il ne s'arrête pas pour eux
    ctx.squads.issue(group.id, { type: 'tortue', x: van.x, z: van.z, heading: van.heading, width: 0, issuedBy: 0 });
    for (let i = 0; i < 20; i++) t.step(1);
    const reports = ctx.radio.log.slice(radioFrom).map((m) => m.text);
    console.log(`fourgon en route (${Math.hypot(van.x - x0, van.z - z0).toFixed(0)} m parcourus, ${ap.status(van).mode}/${ap.status(van).state}) : ${seated(ctx, ids)}/${ids.length} assis (${aboard} au départ) ; radio : ${reports.join(' | ')}`);
    // le fourgon est en route sous le pilote automatique (arrêté ou non dans la circulation de la place)
    expect(ap.status(van).mode).toBe('drive');
    expect(Math.hypot(van.x - x0, van.z - z0)).toBeGreaterThan(3);
    expect(seated(ctx, ids)).toBe(aboard);
    expect(reports.some((x) => /Tortue formée|Barrage en place|Bond effectué/.test(x))).toBe(false);
  }, 600000);

  it('séquence R5 par le commandement du joueur : « Suivez-moi en véhicules » à pied, puis Ligne, Tenir, Bond, Tortue — chaque ordre fait bouger les agents', async () => {
    const { t, ctx, me, company } = await start(21, true);
    const core = ctx.service<CommandCore>('ui.command')!;
    const ids = troops(ctx, company);
    expect(core.callFollow(true).ok).toBe(true);
    for (let i = 0; i < 40 && seated(ctx, ids) < ids.length * 0.8; i++) t.step(1);
    const aboard = seated(ctx, ids);
    console.log(`« Suivez-moi en véhicules » à pied : ${aboard}/${ids.length} assis`);
    expect(aboard).toBeGreaterThanOrEqual(Math.floor(ids.length * 0.8));
    const h = me.heading;
    const x = me.x + Math.sin(h) * 25;
    const z = me.z + Math.cos(h) * 25;
    for (const type of ['ligne', 'tenir', 'bond_offensif', 'tortue'] as OrderType[]) {
      const before = seated(ctx, ids);
      const pos = new Map(ids.map((id) => [id, { x: ctx.people.get(id)!.x, z: ctx.people.get(id)!.z }]));
      const res = core.issue(type, [company], [{ x, z, heading: h, width: 0 }]);
      expect(res.ok).toBe(true);
      expect(company.order.byPlayer).toBe(true);
      t.step(10);
      const moved = ids.filter((id) => {
        const p = ctx.people.get(id)!;
        const p0 = pos.get(id)!;
        return Math.hypot(p.x - p0.x, p.z - p0.z) > 2;
      }).length;
      const after = seated(ctx, ids);
      console.log(`${type} : ${before} → ${after} assis, ${moved} agents ont bougé de plus de 2 m en 10 s`);
      expect(after).toBe(0);
      if (before > 0) expect(moved).toBeGreaterThanOrEqual(Math.floor(before * 0.8));
      expect(company.order.type).toBe(type);
    }
  }, 900000);
});
