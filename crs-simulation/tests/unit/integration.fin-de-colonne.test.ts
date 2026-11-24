// Fin de colonne (diag-terrain J1, spécification §3.3) : quand une colonne s'arrête, les unités que le joueur commande ne
// restent jamais à « débarquer » (la puce disait « DESCEND » indéfiniment : « ils me suivent mais n'ont pas d'ordre »).
//   (a) journée de service, République, graine 5 : le commandant passager de la colonne de sa compagnie (deux sections,
//       la BRAV-M de son commissariat) ; à l'arrêt, chaque unité qu'il commande le suit de nouveau (« AVEC VOUS ») —
//       aucune à « débarquer » vingt secondes après la fin du débarquement ;
//   (b) mode libre, Concorde : le commandant conduit lui-même le VL, toute la compagnie derrière lui en fourgons ; il
//       descend : les groupes débarquent et le suivent à pied dans les quinze secondes.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, Squad, Vehicle } from '@/core/contracts';
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
import { JOURNEE_SERVICE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createSystems as command } from '@/ui/command';
import type { DirectApi } from '@/ui/command/direct/runtime';
import { createObjectives } from '@/ui/core/objectives';

/** Objectifs (« Embarquez : … ») sans l'interface (comme le robot des missions du commandant). */
const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, objectives, command];

/** Unités que le joueur commande (celles qu'il dirige et leurs subordonnées), sans les équipages (cellulaires, engins). */
function ledTree(ctx: GameContext, playerId: number): Squad[] {
  const out: Squad[] = [];
  const add = (s: Squad): void => {
    if (out.indexOf(s) >= 0) return;
    out.push(s);
    for (const k of ctx.squads.childrenOf(s.id)) add(k);
  };
  for (const s of ctx.squads.list) if (s.faction === 'police' && s.leaderId === playerId) add(s);
  return out.filter((s) => s.kind !== 'equipage');
}

/** Unités du joueur qui ne le suivent pas (type d'ordre, ou cible). */
function notFollowing(ctx: GameContext, me: Person): string[] {
  return ledTree(ctx, me.id).filter((s) => s.order.type !== 'suivre' || s.order.targetId !== me.id).map((s) => `${s.name}=${s.order.type}`);
}

/** « AVEC VOUS » : la vue des ordres directs (celle de la ligne d'état) dit que chaque unité est avec lui. */
function notWithMe(ctx: GameContext, me: Person): string[] {
  const direct = ctx.service<DirectApi>('command.direct');
  if (!direct) return ['service command.direct absent'];
  const env = direct.env();
  const ids = new Set(ledTree(ctx, me.id).map((s) => s.id));
  return env.units.filter((u) => ids.has(u.squadId) && !u.avecVous).map((u) => u.name);
}

describe('fin de colonne : personne n’est laissé à « débarquer »', () => {
  it('journée de service, République : le commandant passager — à l’arrêt, toute sa compagnie le suit de nouveau', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, journee: true } } as never);
    const { ctx } = t;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const me = ctx.player.person()!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    // étapes de la colonne de la compagnie, avec leur instant
    const stages: { stage: string; t: number }[] = [];
    ctx.events.onAny('command:convoy', (e) => {
      const c = e as { squadId: number; stage: string };
      if (c.squadId === company.id) stages.push({ stage: c.stage, t: ctx.clock.now });
    });
    t.step(5);
    expect(j.stage).toBe('embarquement');
    // la colonne attend le commandant : pas de compte à rebours (−1), ou le délai du départ
    expect(j.readyIn()).toBeGreaterThanOrEqual(-1);
    // il monte là où l'objectif « Embarquez » l'envoie
    const e = obj.list.find((o) => /^Embarquez/.test(o.text) && o.x !== undefined)!;
    expect(e).toBeTruthy();
    const v = ctx.vehicles.list.filter((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && x.seats.some((id, i) => i > 0 && id === 0))[0]!;
    me.x = v.x + 3; me.z = v.z;
    expect(ctx.vehicles.enter(me, v, 'passenger')).toBe(true);
    for (let i = 0; i < 160 && j.stage !== 'sur_place'; i++) t.step(5);
    expect(j.stage).toBe('sur_place');
    const stop = stages.find((s) => s.stage === 'stationnement') ?? stages.find((s) => s.stage === 'debarquement');
    expect(stop, `étapes ${stages.map((s) => s.stage).join(',')}`).toBeTruthy();
    // le débarquement fini, chaque unité le suit de nouveau
    let unloaded = -1;
    let rejoined = -1;
    for (let i = 0; i < 240; i++) {
      t.step(0.5);
      const st = stages[stages.length - 1]!;
      if (unloaded < 0 && (st.stage === 'en_place' || st.stage === 'parti')) unloaded = st.t;
      if (rejoined < 0 && notFollowing(ctx, me).length === 0) rejoined = ctx.clock.now;
      if (unloaded >= 0 && ctx.clock.now - unloaded > 20) break;
    }
    const stopAt = stop!.t;
    console.log(`colonne : ${stages.map((s) => `${s.stage}@${(s.t - stopAt).toFixed(0)}`).join(' ')} ; toutes « suivre » à +${(rejoined - stopAt).toFixed(1)} s après l'arrêt (débarquement fini à +${(unloaded - stopAt).toFixed(1)} s) ; ${ledTree(ctx, me.id).map((s) => `${s.name}=${s.order.type}`).join(', ')}`);
    expect(unloaded).toBeGreaterThanOrEqual(0);
    expect(notFollowing(ctx, me)).toEqual([]);
    expect(ledTree(ctx, me.id).filter((s) => s.order.type === 'debarquer').map((s) => s.name)).toEqual([]);
    // dans les quinze secondes après la fin du débarquement (et jamais plus de 45 s après l'arrêt de la colonne)
    expect(rejoined).toBeGreaterThanOrEqual(0);
    expect(rejoined - unloaded).toBeLessThanOrEqual(15);
    expect(rejoined - stopAt).toBeLessThanOrEqual(45);
    // la ligne d'état : « AVEC VOUS »
    expect(notWithMe(ctx, me)).toEqual([]);
    // et elles le suivent vraiment : il marche 40 m, ses agents à pied restent autour de lui
    const input = ctx.input as { moveY: number };
    input.moveY = 0.5;
    t.step(20);
    input.moveY = 0;
    t.step(15);
    const agents = ledTree(ctx, me.id).flatMap((s) => s.members.map((id) => ctx.people.get(id)!))
      .filter((p) => p && !p.isPlayer && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down' && p.poste !== 'conducteur');
    const near = agents.filter((p) => Math.hypot(p.x - me.x, p.z - me.z) < 60).length;
    console.log(`après 40 m à pied : ${near}/${agents.length} agents à moins de 60 m`);
    expect(near).toBeGreaterThanOrEqual(Math.ceil(agents.length * 0.8));
  }, 1_800_000);

  it('mode libre, Concorde : le commandant conduit le VL, sa compagnie suit en fourgons ; il descend — tous le suivent à pied', async () => {
    const t = createTestContext({ seed: 32, strict: false, modules: SIM });
    const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', 'crowd.none': true } } as never);
    const { ctx } = t;
    t.step(3);
    const me = ctx.player.person()!;
    expect(notFollowing(ctx, me)).toEqual([]);
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (vl.seats[0] !== 0) {
      const o = ctx.people.get(vl.seats[0])!;
      ctx.vehicles.exit(o);
      for (let i = 1; i < vl.seats.length; i++) if (vl.seats[i] === 0 && ctx.vehicles.enter(o, vl, i)) break;
    }
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    // il attend que tout le monde soit monté, puis roule 200 m
    t.step(40);
    const ap = ctx.service<{ status(v: Vehicle): { mode: string } }>('vehicles.autopilot')!;
    const input = ctx.input as { moveY: number; moveX: number };
    const x0 = vl.x, z0 = vl.z;
    for (let k = 0; k < 600 && Math.hypot(vl.x - x0, vl.z - z0) < 200; k++) {
      input.moveY = vl.speed < 7 ? 0.6 : 0;
      t.step(0.1);
    }
    input.moveY = -1;
    for (let k = 0; k < 60 && Math.abs(vl.speed) > 0.2; k++) t.step(0.1);
    input.moveY = 0;
    t.step(20);
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs' && ap.status(v).mode === 'follow');
    console.log(`VL à ${Math.round(Math.hypot(vl.x - x0, vl.z - z0))} m ; ${vans.length} fourgons en colonne derrière lui`);
    expect(vans.length).toBeGreaterThan(0);
    // il descend
    ctx.vehicles.exit(me);
    const out = ctx.clock.now;
    let all = -1;
    for (let i = 0; i < 90 && all < 0; i++) {
      t.step(0.5);
      if (notFollowing(ctx, me).length === 0) all = ctx.clock.now - out;
    }
    console.log(`descendu : toutes ses unités le suivent à +${all.toFixed(1)} s ; ${ledTree(ctx, me.id).map((s) => `${s.name}=${s.order.type}`).join(', ')}`);
    expect(all).toBeGreaterThanOrEqual(0);
    expect(all).toBeLessThanOrEqual(15);
    t.step(20);
    expect(ledTree(ctx, me.id).filter((s) => s.order.type === 'debarquer').map((s) => s.name)).toEqual([]);
    expect(notWithMe(ctx, me)).toEqual([]);
    // tout le monde est descendu (sauf les conducteurs), aucun fourgon ne roule plus
    const seated = ledTree(ctx, me.id).flatMap((s) => s.members.map((id) => ctx.people.get(id)!))
      .filter((p) => p && !p.isPlayer && p.vehicleId !== 0 && p.poste !== 'conducteur');
    expect(seated.map((p) => p.poste)).toEqual([]);
  }, 900_000);
});
