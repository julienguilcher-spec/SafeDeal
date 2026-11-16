// Cycle de vie des sessions : un état gardé d'une partie à l'autre ne doit pas toucher la partie suivante
// (les identifiants repartent du même compteur : un id retenu désigne une NOUVELLE entité).
import { describe, expect, it } from 'vitest';

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
import type { SessionConfig } from '@/core/contracts';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const CMD: Partial<SessionConfig> = { mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } };

describe('cycle de vie — état retenu entre deux sessions', () => {
  it('un mouvement motorisé interrompu par la fin de partie ne se rejoue pas sur l’unité de même id de la partie suivante', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start(CMD);
    const { ctx } = t;
    t.step(3);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const group = ctx.squads.list.find((s) => s.faction === 'police' && s.kind === 'groupe' && s.vehicleId !== 0)!;
    // ordre lointain : la colonne embarque, l'ordre est repris au débarquement
    const res = core.issue('tenir', [group], [{ x: me.x + 900, z: me.z, heading: 0, width: 0 }]);
    expect(res.ok).toBe(true);
    expect(core.afterConvoy.has(group.id)).toBe(true);
    // fin de partie avant l'arrivée, nouvelle partie
    ctx.session.end(false);
    await t.start({ ...CMD, seed: 13 } as Partial<SessionConfig>);
    t.step(2);
    const same = ctx.squads.get(group.id);
    expect(same).toBeTruthy();
    const before = same!.order.type;
    // la nouvelle unité de même id termine un débarquement : elle ne doit pas recevoir l'ordre de l'ancienne partie
    ctx.events.emitAny('command:convoy', { squadId: group.id, stage: 'en_place' });
    expect(core.afterConvoy.size).toBe(0);
    expect(same!.order.type).toBe(before);
  }, 600000);

  it('« avec moi » : l’échéance de ralliement à la colonne repart à zéro avec l’horloge de la nouvelle partie', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start(CMD);
    const { ctx } = t;
    t.step(2);
    const me = ctx.player.person()!;
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (vl.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(vl.seats[0])!);
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    // une longue partie (une heure de jeu) au volant
    (ctx.clock as { now: number }).now += 3600;
    t.step(2);
    ctx.session.end(false);
    await t.start(CMD);
    const follow = t.game.systems.find((s) => s.id === 'session.follow') as unknown as { nextJoin: number } | undefined;
    expect(follow).toBeTruthy();
    // l'horloge repart de zéro : le ralliement ne doit pas attendre une heure
    expect(follow!.nextJoin).toBeLessThanOrEqual(ctx.clock.now + 3);
  }, 600000);
});
