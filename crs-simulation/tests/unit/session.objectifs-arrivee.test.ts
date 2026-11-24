// Ordres de la chaîne de commandement au joueur exécutant : validation à l'arrivée (0 m = validé), toujours un
// objectif en cours (stand-by après « en place »), point atteignable (pas dans un bâtiment).
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, PlayableRole } from '@/core/contracts';
import { createObjectives } from '@/ui/core/objectives';
import { createTestContext } from '@/core/testing';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
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
import { createSystems as session, ORDERS_SERVICE } from '@/gameplay/session';
import type { PlayerOrdersApi } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session/mission-api';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, objectives];
const MEANS = { sections: 4, fourgons: 12, centaure: 1, canon_eau: 1, bravm: 1, drone: 1, pompiers: 0, samu: 0, secours_sur_appel: true };

async function play(role: PlayableRole) {
  const t = createTestContext({ seed: 31, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role, place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS } });
  const { ctx } = t;
  const orders = ctx.service<PlayerOrdersApi>(ORDERS_SERVICE)!;
  for (let i = 0; i < 24 && !orders.current; i++) t.step(5);
  return { t, ctx, orders };
}

/** Pose le joueur (ou son véhicule s'il est à bord) exactement sur le point. */
function teleport(ctx: GameContext, x: number, z: number): void {
  const me = ctx.player.person()!;
  const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
  if (v) { v.x = x; v.z = z; v.vx = 0; v.vz = 0; v.speed = 0; }
  me.x = x; me.z = z;
}

function activeObjectives(ctx: GameContext): string[] {
  const api = ctx.service<ObjectivesApi>(EXT.objectives)!;
  return api.list.filter((o) => o.state === 'actif').map((o) => `${o.id}:${o.text}`);
}

describe('ordres au joueur : arrivée, stand-by', () => {
  for (const role of ['gendarme_centaure', 'operateur_canon_eau', 'bravm', 'chef_groupe', 'telepilote'] as const) {
    it(`${role} : posé à 0 m du point, l'ordre est validé tout de suite ; puis stand-by explicite`, async () => {
      const { t, ctx, orders } = await play(role);
      const o = orders.current;
      expect(o).not.toBeNull();
      // le point donné est atteignable : ni dans un bâtiment, ni dans l'eau
      expect(ctx.world.buildingHeightAt(o!.x, o!.z)).toBe(0);
      expect(ctx.world.isFree(o!.x, o!.z, 0.5)).toBe(true);
      const me = ctx.player.person()!;
      console.log(`${role} : ${o!.text} | véhicule ${me.vehicleId} | ${activeObjectives(ctx).join(' / ')}`);
      teleport(ctx, o!.x, o!.z);
      for (let i = 0; i < 6; i++) { t.step(0.25); teleport(ctx, o!.x, o!.z); }
      expect(orders.current?.arrived).toBe(true);
      // toujours un objectif en cours : stand-by explicite
      t.step(2);
      const act = activeObjectives(ctx);
      console.log(`  après : ${act.join(' / ')}`);
      expect(act.some((x) => /stand-by/i.test(x))).toBe(true);
      const brief = ctx.service<MissionBrief>('session.mission');
      if (brief && brief.active) expect(brief.instruction.title).toMatch(/stand-by/i);
    }, 300000);
  }
});

describe('ordres au joueur : à bord d\'un véhicule', () => {
  for (const [role, seat] of [['gendarme_centaure', 'driver'], ['gendarme_centaure', 'passenger'], ['operateur_canon_eau', 'gunner'], ['bravm', 'driver'], ['chef_groupe', 'passenger']] as const) {
    it(`${role} (${seat}) : véhicule posé sur le point → validé`, async () => {
      const { t, ctx, orders } = await play(role);
      const o = orders.current!;
      expect(o).not.toBeNull();
      const me = ctx.player.person()!;
      const s = ctx.squads.get(me.squadId);
      const v = s && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
      expect(v).toBeDefined();
      // place libre du rôle demandé (on libère au besoin)
      const idx = v!.def.seats.findIndex((d, i) => d.role === seat && v!.seats[i] === 0);
      const at = idx >= 0 ? idx : v!.def.seats.findIndex((d) => d.role === seat);
      const sitting = v!.seats[at]!;
      if (sitting !== 0) ctx.vehicles.exit(ctx.people.get(sitting)!);
      expect(ctx.vehicles.enter(me, v!, at)).toBe(true);
      teleport(ctx, o.x, o.z);
      for (let i = 0; i < 6; i++) { t.step(0.25); teleport(ctx, o.x, o.z); }
      console.log(`${role} ${seat} : ${v!.def.name} | arrivée ${orders.current?.arrived} | ${activeObjectives(ctx).join(' / ')}`);
      expect(orders.current?.arrived).toBe(true);
      expect(activeObjectives(ctx).some((x) => /stand-by/i.test(x))).toBe(true);
    }, 300000);
  }
});

describe('ordres au joueur : la situation change, le commandant réévalue', () => {
  it('Centaure en stand-by : la foule part à 400 m → nouvel ordre', async () => {
    const { t, ctx, orders } = await play('gendarme_centaure');
    const o = orders.current!;
    teleport(ctx, o.x, o.z);
    t.step(1);
    expect(orders.current?.arrived).toBe(true);
    const before = { x: orders.current!.x, z: orders.current!.z };
    // la foule s'éloigne en bloc vers le nord-ouest
    const shift = (): void => {
      for (const p of ctx.people.list) if (p.faction === 'protest') { p.x = p.x - 280 + (p.id % 7); p.z = p.z + 280 + (p.id % 5); }
    };
    shift();
    let next = null as PlayerOrdersApi['current'];
    for (let i = 0; i < 40; i++) {
      t.step(5);
      const c = orders.current;
      if (c && !c.arrived && Math.hypot(c.x - before.x, c.z - before.z) > 70) { next = c; break; }
    }
    console.log(`nouvel ordre : ${next ? next.text : 'AUCUN'} (${next ? Math.round(Math.hypot(next.x - before.x, next.z - before.z)) : 0} m plus loin)`);
    expect(next).not.toBeNull();
    expect(ctx.radio.log.slice(-30).some((m) => /rendez-vous/i.test(m.text))).toBe(true);
  }, 300000);
});

describe('désignation de tir pour les engins', () => {
  function forceRoe(ctx: GameContext, level: number): void {
    Object.defineProperty(ctx.law.roe, 'lawfulForce', { get: () => level, set: () => undefined, configurable: true });
  }
  function crowdAround(ctx: GameContext, x: number, z: number): void {
    let n = 0;
    for (const p of ctx.people.list) if (p.faction === 'protest' && n++ < 20) { p.x = x + (n % 5) * 2; p.z = z + Math.floor(n / 5) * 2; }
  }

  it('Centaure : hors cadre légal « Tir non autorisé », puis zone désignée, validée par la salve du joueur', async () => {
    const { t, ctx, orders } = await play('gendarme_centaure');
    const me = ctx.player.person()!;
    teleport(ctx, orders.current!.x, orders.current!.z);
    t.step(1);
    forceRoe(ctx, 2);
    // zone à 80 m devant le joueur
    const zx = me.x + 80, zz = me.z;
    crowdAround(ctx, zx, zz);
    const boss = ctx.squads.list.find((s) => s.faction === 'police' && s.kind === 'compagnie');
    ctx.squads.issue(me.squadId, { type: 'disperser_gaz', x: zx, z: zz, width: 6, maxForce: 4, issuedBy: boss ? boss.leaderId : 0 });
    t.step(0.5);
    let c = orders.current!;
    console.log(`hors cadre : ${c.text} | ${c.detail}`);
    expect(c.fire).not.toBeNull();
    expect(c.text).toMatch(/Tir non autorisé : attendez les sommations/);
    expect(activeObjectives(ctx).some((x) => /Tir non autorisé/.test(x))).toBe(true);
    // sommations faites
    forceRoe(ctx, 4);
    crowdAround(ctx, zx, zz);
    t.step(4.5);
    c = orders.current!;
    console.log(`autorisé : ${c.text} | ${c.detail}`);
    expect(c.text).toBe('Tir de lacrymogènes sur la zone désignée');
    expect(c.detail).toMatch(/à \d+ m, (sur votre droite|sur votre gauche|devant vous|derrière vous)/);
    expect(c.fire!.radius).toBeGreaterThan(0);
    expect(c.x).toBeCloseTo(zx, 0);
    // la salve du joueur tombe dans la zone
    ctx.events.emit('projectile:impact', { id: 1, kind: 'grenade_lacrymo_56', ownerId: me.id, x: zx + 5, y: 0, z: zz - 3, hitKind: 'ground', hitId: 0 });
    c = orders.current!;
    console.log(`après salve : ${c.text} | ${ctx.radio.log.slice(-2).map((m) => m.text).join(' / ')}`);
    expect(c.fire).toBeNull();
    expect(activeObjectives(ctx).some((x) => /stand-by/i.test(x))).toBe(true);
  }, 300000);

  it('Canon à eau : « Jet sur le groupe désigné », validé quand le jet du joueur vise la zone', async () => {
    const { t, ctx, orders } = await play('operateur_canon_eau');
    const me = ctx.player.person()!;
    const s = ctx.squads.get(me.squadId)!;
    const v = ctx.vehicles.get(s.vehicleId)!;
    const gi = v.def.seats.findIndex((d) => d.role === 'gunner');
    if (v.seats[gi] !== 0) ctx.vehicles.exit(ctx.people.get(v.seats[gi]!)!);
    expect(ctx.vehicles.enter(me, v, gi)).toBe(true);
    forceRoe(ctx, 3);
    const zx = v.x + Math.sin(v.heading) * 30, zz = v.z + Math.cos(v.heading) * 30;
    crowdAround(ctx, zx, zz);
    ctx.squads.issue(me.squadId, { type: 'refoulement', x: zx, z: zz, maxForce: 3, issuedBy: 0 });
    t.step(0.5);
    const c = orders.current!;
    console.log(`canon : ${c.text} | ${c.detail}`);
    expect(c.text).toBe('Jet sur le groupe désigné');
    // un jet à côté (canon tourné vers l'arrière) ne valide rien
    v.turretYaw[0] = 2.6;
    ctx.events.emit('vehicle:turret_fired', { id: v.id, turret: 0, byId: me.id });
    ctx.events.emit('vehicle:turret_fired', { id: v.id, turret: 0, byId: me.id });
    expect(orders.current!.fire).not.toBeNull();
    // jet du joueur, canon dans l'axe de l'engin (vers la zone)
    v.turretYaw[0] = 0;
    ctx.events.emit('vehicle:turret_fired', { id: v.id, turret: 0, byId: me.id });
    ctx.events.emit('vehicle:turret_fired', { id: v.id, turret: 0, byId: me.id });
    expect(orders.current!.fire).toBeNull();
  }, 300000);
});

