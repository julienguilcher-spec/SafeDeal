// « Avec moi » : le commandant au volant désigne sur la carte tactique une unité engagée ailleurs ; elle embarque dans
// son fourgon et prend place dans sa colonne, derrière lui ; une unité lointaine vient d'abord en véhicules.
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

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('ordre « avec moi »', () => {
  it('une unité tenue en dispositif rejoint la colonne du commandant quand il l’appelle', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
    const { ctx } = t;
    t.step(5);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const groups = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe' && s.vehicleId !== 0 && ctx.vehicles.get(s.vehicleId)?.kind === 'fourgon_crs');
    // un groupe tient sa position (engagé : il ne part pas d'office avec le commandant)
    const held = groups[groups.length - 1]!;
    const lead = ctx.people.get(held.leaderId)!;
    ctx.squads.issue(held.id, { type: 'tenir', x: lead.x, z: lead.z, heading: 0, width: 0, issuedBy: me.id });
    t.step(2);
    // le commandant prend le volant du VL
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (vl.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(vl.seats[0])!);
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    t.step(20);
    expect(held.order.type).toBe('tenir');
    // « avec moi »
    const res = core.issue('avec_moi', [held], null);
    expect(res.ok).toBe(true);
    for (let i = 0; i < 12; i++) t.step(5);
    const van = ctx.vehicles.get(held.vehicleId)!;
    const aboard = held.members.filter((id) => ctx.people.get(id)!.vehicleId === van.id).length;
    const ap = ctx.service<{ status(v: unknown): { mode: string; leaderId: number } }>('vehicles.autopilot')!;
    const st = ap.status(van);
    console.log(`avec moi : ordre ${held.order.type} ; ${aboard}/${held.members.length} à bord ; fourgon ${st.mode} derrière ${st.leaderId}`);
    expect(aboard).toBeGreaterThanOrEqual(held.members.length - 1);
    expect(st.mode).toBe('follow');
  }, 600000);
});
