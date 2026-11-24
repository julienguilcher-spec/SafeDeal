// Test d'intégration headless : la mise en place de session avec la FOULE et la CIRCULATION réelles (modules livrés
// pendant l'assemblage 1), sur la vraie carte, place de la Concorde.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import type { SessionSetupApi } from '@/gameplay/session';

const FULL = [world, roles, people, vehicles, traffic, crowd, items, props, hazards, law, radio, session];

describe('intégration : session avec foule et circulation', () => {
  it('une manifestation se met en place autour du groupe du joueur et tourne trois minutes sans erreur', async () => {
    const t = createTestContext({ seed: 17, modules: FULL });
    await t.start({
      mode: 'libre', role: 'crs', rank: 'gardien', place: 'Place de la Concorde', x: -3.3, z: 11.8, crowdSize: 240, tension: 0.3, volatility: 0.3,
      duration: 'standard', extra: { poste: 'lanceur', cause: 'retraites' },
    });
    const { ctx } = t;
    const s = ctx.require<SessionSetupApi>('session.setup').summary!;
    const me = ctx.player.person()!;
    expect(me.isPlayer).toBe(true);
    expect(me.poste).toBe('lanceur');
    expect(ctx.squads.get(me.squadId)!.members.length).toBe(6);
    // la circulation fournit les piétons civils : la mise en place ne pose pas de passants figés
    expect(s.bystanders).toBe(0);
    const count = (): { manif: number; civils: number; voitures: number } => ({
      manif: ctx.people.list.filter((p) => p.kind === 'manifestant').length,
      civils: ctx.people.list.filter((p) => p.faction === 'civil').length,
      voitures: ctx.vehicles.list.filter((v) => v.faction === 'civil').length,
    });
    const at0 = count();
    const t0 = process.cpuUsage();
    const tick0 = ctx.clock.tick;
    for (let i = 0; i < 6; i++) t.step(30);
    const steps = ctx.clock.tick - tick0;
    const cpu = process.cpuUsage(t0);
    const at3 = count();
    const d = ctx.director;
    console.log(`au départ : ${JSON.stringify(at0)} ; après 3 min : ${JSON.stringify(at3)} ; phase « ${d.phase} », tension ${d.tension.toFixed(2)}, présents ${d.stats.present}/${d.stats.total}`);
    console.log(`coût : ${((cpu.user + cpu.system) / 1000 / steps).toFixed(2)} ms de processeur par pas (${steps} pas, ${ctx.people.list.length} personnes, ${ctx.vehicles.list.length} véhicules)`);
    expect(d.phase).not.toBe('aucune');
    expect(at3.manif).toBeGreaterThan(40);
    expect(d.stats.total).toBeGreaterThan(40);
    for (const p of ctx.people.list) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    for (const v of ctx.vehicles.list) expect(Number.isFinite(v.x) && Number.isFinite(v.z)).toBe(true);
    // les collègues du joueur n'ont pas été emportés par la foule ni par une IA (ils tiennent leur place)
    const squad = ctx.squads.get(me.squadId)!;
    for (const id of squad.members) {
      const p = ctx.people.get(id)!;
      expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThan(12);
    }
    // le joueur lance une grenade vers la foule : gaz, et la foule le ressent (tension ou peur)
    expect(ctx.actions.selectById(me, 'grenade_lacrymo')).toBe(true);
    t.step(2);
    const tensionBefore = d.tension;
    expect(ctx.actions.use(me, { power: 0.9 }).ok).toBe(true);
    t.step(20);
    console.log(`après la grenade : tension ${tensionBefore.toFixed(2)} → ${d.tension.toFixed(2)}, journal de la force ${ctx.law.forceLog.length}`);
    expect(ctx.law.forceLog.length).toBeGreaterThanOrEqual(1);
  }, 120000);
});
