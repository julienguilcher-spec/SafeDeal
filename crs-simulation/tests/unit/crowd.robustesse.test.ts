// Foule — robustesse : le module tourne seul (services neutres partout), ne pilote jamais la personne incarnée
// par le joueur, ni une personne interpellée ; le camion sono suit son guide quand le module des véhicules est là.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

describe('foule — robustesse', () => {
  it('fonctionne seule, avec les services neutres (aucun autre module branché)', async () => {
    const t = createCrowdTest({ seed: 2 });
    const phases: string[] = [];
    t.ctx.events.on('crowd:phase', (e) => phases.push(e.phase));
    await t.start(demoConfig({ crowdSize: 120, duration: 'courte', volatility: 0.5 }));
    expect(t.ctx.director.phase).toBe('rassemblement');
    expect(t.ctx.director.route.length).toBeGreaterThanOrEqual(4);
    expect(t.core.metro.stations.length).toBe(0); // le monde neutre n'a pas de station : tout le monde vient à pied
    t.run(400);
    // sans locomotion personne ne bouge, mais rien ne casse : les phases s'enchaînent, les commandes sont saines
    expect(phases).toContain('depart');
    expect(phases).toContain('cortege');
    expect(phases).toContain('dispersion');
    expect(t.ctx.director.headProgress).toBeGreaterThan(50);
    for (const p of t.core.members) {
      expect(Number.isFinite(p.cmd.moveX) && Number.isFinite(p.cmd.moveZ)).toBe(true);
      expect(Math.hypot(p.cmd.moveX, p.cmd.moveZ)).toBeLessThanOrEqual(1.0001);
    }
    // une seconde session repart de zéro
    await t.start(demoConfig({ crowdSize: 30, duration: 'courte' }));
    expect(t.ctx.director.stats.total).toBe(30);
    expect(t.ctx.director.stats.dispersed).toBe(0);
    expect(t.ctx.director.phase).toBe('rassemblement');
    t.run(5);
  }, 300_000);

  it('ne pilote jamais la personne du joueur ni une personne interpellée', async () => {
    const t = createCrowdTest({ seed: 2, modules: [world] });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 80, duration: 'courte', extra: { 'crowd.present': 1, 'crowd.noAleas': true } }));
    t.run(1);
    const mine = t.protesters()[10]!;
    const held = t.protesters()[20]!;
    // un rôle « manifestant » incarné : le joueur prend la place d'un marcheur
    mine.isPlayer = true;
    mine.cmd.moveX = 0.123;
    mine.cmd.moveZ = -0.456;
    mine.cmd.gait = 2;
    held.custody = 'cuffed';
    held.cmd.moveX = 0.5;
    held.cmd.moveZ = 0.25;
    t.run(120);
    expect(mine.cmd.moveX).toBe(0.123);
    expect(mine.cmd.moveZ).toBe(-0.456);
    expect(mine.cmd.gait).toBe(2);
    expect(held.cmd.moveX).toBe(0.5);
    expect(held.cmd.moveZ).toBe(0.25);
    // les autres, eux, sont bien commandés (le cortège est parti)
    expect(core.formation.marching).toBe(true);
    const walking = t.protesters().filter((p) => p !== mine && p !== held && Math.hypot(p.cmd.moveX, p.cmd.moveZ) > 0.2).length;
    expect(walking).toBeGreaterThan(40);
    // le joueur compte toujours parmi les présents
    expect(brainOf(mine)).not.toBeNull();
    expect(ctx.director.stats.present).toBe(80 - (80 - core.members.filter((p) => p.faction === 'protest').length));
  }, 300_000);

  it('le camion sono avance au pas derrière son guide (module des véhicules réel, pilote automatique)', async () => {
    const t = createCrowdTest({ seed: 6, modules: [world, people, items, hazards, vehicles, law] });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 300, duration: 'standard', extra: { 'crowd.present': 1, 'crowd.noAleas': true, 'crowd.bystanders': 0, cause: 'retraites' } }));
    const f = core.formation;
    const truck = ctx.vehicles.get(f.sonoVehicleId);
    expect(truck).toBeDefined();
    if (!truck || ctx.service('vehicles.autopilot') === undefined) return;
    const x0 = truck.x;
    const z0 = truck.z;
    t.run(20);
    // un conducteur est monté, le camion attend pendant le rassemblement
    expect(truck.seats[0]).not.toBe(0);
    expect(Math.hypot(truck.x - x0, truck.z - z0)).toBeLessThan(2);
    const s0 = core.corridor.project(truck.x, truck.z, f.headS - 40, 400);
    t.run(165 + 60 + 150);
    expect(ctx.director.phase).toBe('cortege');
    const s1 = core.corridor.project(truck.x, truck.z, f.headS - 40, 600);
    const moved = s1 - s0;
    console.log('[foule] camion sono : avancé de', moved.toFixed(0), 'm le long du parcours en', 215, 's de marche ; vitesse', truck.speed.toFixed(2), 'm/s ; tête à', f.headS.toFixed(0), 'm');
    // il a suivi le cortège, au pas, sans doubler la tête ni rester au départ
    expect(moved).toBeGreaterThan(60);
    expect(s1).toBeLessThan(f.headS - 5);
    expect(s1).toBeGreaterThan(f.tailS);
    expect(Math.abs(truck.speed)).toBeLessThan(2.5);
    // personne sous ses roues
    for (const p of t.protesters()) expect(p.injury === 'critical' || p.injury === 'dead').toBe(false);
  }, 600_000);
});
