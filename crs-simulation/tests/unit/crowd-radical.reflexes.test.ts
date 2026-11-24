// Groupes radicaux — deux réactions au contact des forces, avec les vrais modules du matériel et du droit :
//   1. une grenade lacrymogène tombée près du bloc est renvoyée (ramassée et relancée, frappée à la raquette)
//      ou éloignée d'un coup de pied ;
//   2. un camarade interpellé : le groupe tente de le libérer en essaim autour des agents qui le tiennent.
import { describe, expect, it } from 'vitest';
import type { EntityId, Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { CROWD_RADICAL } from '@/sim/crowd';
import type { RadicalApi } from '@/sim/crowd';
import { avenueConfig, chantier, createRadicalTest, policeLine, raiseShields } from '@/sim/crowd/radical/testkit';

const MODULES = [world, roles, people, items, hazards, law, props, vehicles];

describe('groupes radicaux — réactions', () => {
  it('renvoie ou éloigne les grenades lacrymogènes tombées près du bloc', async () => {
    const t = createRadicalTest({ seed: 14, modules: MODULES });
    const { ctx, watch } = t;
    await t.start(avenueConfig());
    t.run(1);
    chantier(ctx, 186, 15);
    const line = policeLine(ctx, 250, 0, -Math.PI / 2, 14);
    t.run(1);
    raiseShields(ctx, line);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    for (let s = 0; s < 240 && api.phase !== 'action'; s += 1) t.run(1);
    expect(api.phase).toBe('action');
    t.run(6);
    // trois grenades à main lancées au milieu du bloc : dix-huit palets fumants
    let returned = 0;
    const returnedBy = new Set<EntityId>();
    const moved = new Map<EntityId, { x: number; z: number }>();
    ctx.events.on('projectile:returned', (e) => {
      const by = ctx.people.get(e.byId);
      if (by && by.faction === 'protest') {
        returned++;
        returnedBy.add(by.id);
      }
    });
    const g = api.groups[0]!;
    for (let i = 0; i < 3; i++) ctx.projectiles.spawn('grenade_lacrymo_main', line[i]!.id, g.x - 2 + i * 2, 0.3, g.z + i - 1, 0, 0, 0);
    t.run(3.5);
    for (const pr of ctx.projectiles.list) if (pr.kind === 'palet_lacrymo') moved.set(pr.id, { x: pr.x, z: pr.z });
    expect(moved.size).toBeGreaterThan(6);
    const usedBefore = watch.thrown;
    // palets déplacés de plus de trois mètres après leur chute : relancés ou poussés du pied (suivis tant qu'ils fument)
    const far = new Set<EntityId>();
    const east = new Set<EntityId>();
    for (let s = 0; s < 22; s += 0.5) {
      t.run(0.5);
      for (const pr of ctx.projectiles.list) {
        const from = moved.get(pr.id);
        if (!from) continue;
        if (Math.hypot(pr.x - from.x, pr.z - from.z) > 3) far.add(pr.id);
        if (pr.x - from.x > 6) east.add(pr.id);
      }
    }
    const displaced = far.size;
    const towardPolice = east.size;
    console.log('[radicaux] grenades : palets suivis', moved.size, '| renvois réussis', returned, 'par', returnedBy.size, 'personnes | palets déplacés', displaced, '| partis vers la ligne', towardPolice,
      '| compteur', api.stats.returned, '| faits', JSON.stringify(watch.count), '| jets pendant ce temps', watch.thrown - usedBefore);
    expect(returned).toBeGreaterThan(0);
    expect(api.stats.returned).toBe(returned);
    expect(watch.count['grenade_renvoyee'] ?? 0).toBe(returned);
    expect(displaced).toBeGreaterThanOrEqual(3);
    expect(towardPolice).toBeGreaterThan(0);
    // ce ne sont pas les porteurs de parapluie ni de banderole qui s'en chargent
    for (const id of returnedBy) {
      const p = ctx.people.get(id)!;
      expect(p.profile).toBe('radical');
    }
  }, 600_000);

  it('tente de libérer un camarade interpellé, en essaim autour des agents qui le tiennent', async () => {
    const t = createRadicalTest({ seed: 21, modules: MODULES });
    const { ctx, watch, radical } = t;
    await t.start(avenueConfig({ tension: 0.55, volatility: 1 }));
    t.run(1);
    chantier(ctx, 186, 15);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    for (let s = 0; s < 240 && api.phase !== 'action'; s += 1) t.run(1);
    expect(api.phase).toBe('action');
    t.run(4);
    // un binôme d'interpellation surgit sur un membre du bloc (ni meneur, ni en plein geste)
    let arrested: Person | null = null;
    let officers: Person[] = [];
    ctx.events.on('person:arrested', (e) => {
      const p = ctx.people.get(e.id);
      if (p && p.profile === 'radical') arrested = p;
    });
    let escaped = false;
    ctx.events.onAny('law:escape', () => {
      escaped = true;
    });
    const k = radical.k;
    for (let attempt = 0; attempt < 6 && arrested === null; attempt++) {
      const group = k.groups.find((g) => g.members.length >= 6)!;
      const target = group.members.filter((m) => m !== group.leader && m.p.custody === 'free' && m.p.posture === 'stand')[attempt % 5]!.p;
      for (const o of officers) ctx.people.remove(o.id);
      const h = Math.atan2(target.x - (target.x + 1), 0);
      officers = [
        ctx.archetypes.spawn('crs', target.x + 0.8, target.z + 0.2, { poste: 'interpellation', heading: h }),
        ctx.archetypes.spawn('crs', target.x + 0.9, target.z - 0.7, { poste: 'interpellation', heading: h }),
      ];
      t.run(0.3);
      ctx.interactions.startVerb(officers[0]!, 'maitriser', target.id);
      for (let s = 0; s < 8 && arrested === null; s += 0.25) t.run(0.25);
    }
    expect(arrested, 'interpellation réussie').not.toBeNull();
    const held = arrested as unknown as Person;
    expect(held.custody).not.toBe('free');
    // le groupe réagit : plan « libérer », essaim autour de l'escorte
    let swarm = 0;
    let plan = false;
    let hits = 0;
    ctx.events.on('person:hurt', (e) => {
      if (officers.some((o) => o.id === e.id)) hits++;
    });
    ctx.events.onAny('people:pushed', (payload) => {
      const e = payload as { targetId: EntityId };
      if (officers.some((o) => o.id === e.targetId)) hits++;
    });
    for (let s = 0; s < 40 && !escaped; s += 0.5) {
      t.run(0.5);
      if (api.groups.some((g) => g.plan === 'liberer')) plan = true;
      const near = t.radicals().filter((p) => p !== held && p.custody === 'free' && Math.hypot(p.x - held.x, p.z - held.z) < 3.5).length;
      if (near > swarm) swarm = near;
    }
    console.log('[radicaux] interpellé', held.name, '| plan « libérer »', plan, '| essaim (radicaux à moins de 3,5 m)', swarm, '| coups et poussées sur l\'escorte', hits,
      '| libéré', escaped, '| compteurs', api.stats.rescuesTried, '/', api.stats.rescuesDone, '| faits', JSON.stringify(watch.count), '| garde à vue', held.custody);
    expect(api.stats.rescuesTried).toBeGreaterThan(0);
    expect(watch.count['liberation_tentee'] ?? 0).toBeGreaterThan(0);
    expect(plan).toBe(true);
    expect(swarm).toBeGreaterThanOrEqual(3);
    expect(hits).toBeGreaterThan(0);
    // les infractions sont déclarées par les modules qui portent le geste (violences sur agent)
    expect((watch.offenses['violence_agent'] ?? 0) + (watch.offenses['rebellion'] ?? 0)).toBeGreaterThan(0);
  }, 600_000);
});
