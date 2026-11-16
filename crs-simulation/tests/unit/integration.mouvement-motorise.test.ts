// Mouvement motorisé : le commandant désigne un point éloigné, la compagnie embarque (on l’attend), roule en colonne
// jusqu’au point et y débarque ; un ordre « ligne » lointain est exécuté après le débarquement.
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

describe('mouvement motorisé sur ordre', () => {
  it('« Faire mouvement » à 900 m : embarquement, colonne, débarquement sur le point', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
    const { ctx } = t;
    t.step(5);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    // point : place de la Madeleine (environ 600 m au nord)
    const target = { x: 239, z: -497 };
    const res = core.issue('faire_mouvement', [company], [{ x: target.x, z: target.z, heading: 0, width: 0 }]);
    expect(res.ok).toBe(true);
    t.step(20);
    const cmd = ctx.service<{ convoyOf(id: number): { stage: string } | null }>('police.command')!;
    console.log('après l’ordre :', JSON.stringify(cmd.convoyOf(company.id)));
    // le commandant monte en passager dans son véhicule
    const vl = ctx.vehicles.list.filter((v) => v.faction === 'police' && !v.def.flying && v.seats[0] !== 0 && v.seats.some((id, i) => id === 0 && i > 0))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    me.x = vl.x + 2.5; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'passenger')).toBe(true);
    for (let i = 0; i < 120 && cmd.convoyOf(company.id)?.stage !== 'en_place'; i++) t.step(5);
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs');
    const near = vans.filter((v) => Math.hypot(v.x - target.x, v.z - target.z) < 120).length;
    const agents = ctx.people.list.filter((p) => p.faction === 'police' && Math.hypot(p.x - target.x, p.z - target.z) < 150).length;
    console.log(`colonne : ${cmd.convoyOf(company.id)?.stage} ; fourgons au point ${near}/${vans.length} ; agents sur place ${agents} ; temps ${Math.round(ctx.clock.now)} s`);
    expect(cmd.convoyOf(company.id)?.stage).toBe('en_place');
    expect(near).toBeGreaterThanOrEqual(Math.max(1, vans.length - 1));
    expect(agents).toBeGreaterThan(15);
  }, 900000);
});
