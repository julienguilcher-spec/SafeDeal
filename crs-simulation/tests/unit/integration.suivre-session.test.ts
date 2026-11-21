// Colonne du joueur : la revue périodique des unités appelées « avec moi » repart à zéro à chaque session
// (l'horloge de session repart de 0 ; une échéance héritée de la session précédente la bloquerait).
import { describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { GameContext } from '@/core/contracts';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const CONFIG = { mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } };

function drive(ctx: GameContext): void {
  const me = ctx.player.person()!;
  const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
  if (vl.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(vl.seats[0])!);
  me.x = vl.x + 3; me.z = vl.z;
  expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
}

describe('suivre le chef : deux sessions de suite', () => {
  it('une unité appelée « avec moi » rejoint la colonne dès la deuxième session', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start(CONFIG as never);
    drive(t.ctx);
    for (let i = 0; i < 40; i++) t.step(5);
    // nouvelle session
    await t.start(CONFIG as never);
    const { ctx } = t;
    t.step(5);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const groups = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe' && s.vehicleId !== 0 && ctx.vehicles.get(s.vehicleId)?.kind === 'fourgon_crs');
    const held = groups[groups.length - 1]!;
    const lead = ctx.people.get(held.leaderId)!;
    ctx.squads.issue(held.id, { type: 'tenir', x: lead.x, z: lead.z, heading: 0, width: 0, issuedBy: me.id });
    t.step(2);
    drive(ctx);
    t.step(10);
    expect(held.order.type).toBe('tenir');
    expect(core.issue('avec_moi', [held], null).ok).toBe(true);
    for (let i = 0; i < 4; i++) t.step(5);
    // revue toutes les 3 s : l'unité a reçu l'ordre d'embarquer pour prendre place dans la colonne
    console.log(`session 2 : t=${Math.round(ctx.clock.now)} s ; ordre ${held.order.type}`);
    expect(['embarquer', 'colonne', 'escorter']).toContain(held.order.type);
  }, 600000);
});
