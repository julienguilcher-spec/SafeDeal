// Poste du commandant : terrain (carte complète au véhicule de commandement, comptes rendus seulement à pied) et salle
// de commandement (installé au poste mobile, l'adjoint somme sur ordre).
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { commanderOffPost, visibilityForContext } from '@/ui/maps/visibility';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('poste du commandant', () => {
  it('terrain : carte complète au véhicule de commandement, comptes rendus seulement quand il s’en éloigne', async () => {
    const t = createTestContext({ seed: 4, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'essai', x: -10, z: 15, crowdSize: 150, tension: 0.3, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
    const { ctx } = t;
    t.step(5);
    const me = ctx.player.person()!;
    const pc = ctx.vehicles.list.find((v) => v.kind === 'vl_commandement')!;
    expect(pc).toBeDefined();
    // au véhicule
    me.x = pc.x + 3; me.z = pc.z;
    t.step(1);
    expect(commanderOffPost(ctx)).toBe(false);
    expect(visibilityForContext(ctx).crowd).toBe('full');
    // à 120 m du véhicule
    me.x = pc.x + 120; me.z = pc.z;
    t.step(1);
    console.log('terrain : à pied loin du véhicule →', commanderOffPost(ctx), visibilityForContext(ctx).crowd);
    expect(commanderOffPost(ctx)).toBe(true);
    expect(visibilityForContext(ctx).crowd).toBe('near');
  }, 300000);

  it('salle : installé au poste mobile, vue tactique, carte complète ; l’adjoint à l’écharpe somme sur ordre', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'essai', x: -10, z: 15, crowdSize: 200, tension: 0.4, volatility: 0.5, duration: 'standard', extra: { moyens: MEANS, variante: 'salle' } });
    const { ctx } = t;
    t.step(3);
    const me = ctx.player.person()!;
    const pc = ctx.vehicles.get(me.vehicleId);
    console.log('salle : véhicule', pc?.kind, '| caméra', ctx.player.state.cameraMode);
    expect(pc?.kind).toBe('vl_commandement');
    expect(ctx.player.state.cameraMode).toBe('tactical');
    expect(commanderOffPost(ctx)).toBe(false);
    const deputy = ctx.people.list.find((p) => !p.isPlayer && p.faction === 'police' && p.look.sash);
    expect(deputy).toBeDefined();
    // sommation sur ordre vers la foule
    t.step(90);
    const cmd = ctx.require<{ requestSommation(id: number, x: number, z: number): boolean }>('police.command');
    const company = ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police')!;
    const crowdP = ctx.people.list.filter((p) => p.faction === 'protest');
    // point de sommation : le manifestant qui a le plus de voisins (cœur de l'attroupement)
    let core = crowdP[0]!, best = -1;
    for (const p of crowdP) { const n = ctx.people.countIn(p.x, p.z, 20, (q) => q.faction === 'protest'); if (n > best) { best = n; core = p; } }
    const cx = core.x, cz = core.z;
    expect(cmd.requestSommation(company.id, cx, cz)).toBe(true);
    for (let i = 0; i < 300 && ctx.law.roe.sommation === 0; i++) t.step(1);
    const rec = ctx.service<{ lastRefusal: string }>('law.records');
    const dec = ctx.service<{ decisions: readonly { t: number; key: string; text: string }[]; commands: readonly { sommations: string }[] }>('police.command');
    console.log('salle : refus', rec?.lastRefusal, '| état', dec?.commands.map((c) => c.sommations), '| distance adjoint→foule', Math.round(Math.hypot(deputy!.x - cx, deputy!.z - cz)));
    console.log(dec?.decisions.slice(-6).map((d) => `${d.t.toFixed(0)} ${d.key}: ${d.text.slice(0, 100)}`).join('\n'));
    console.log('salle : étape de sommation atteinte', ctx.law.roe.sommation, 'par', deputy!.name);
    expect(ctx.law.roe.sommation).toBeGreaterThanOrEqual(1);
  }, 300000);
});
