// Carte « Ma mission » : quand le chef de groupe est hors de combat (tué, grièvement blessé), le CRS ne doit pas être
// envoyé « suivre » son corps : la carte passe au chef de l'échelon au-dessus (chef de section).
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { EXT } from '@/core/extensions';
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
import { createSystems as session, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, objectives];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('carte « Ma mission » : chef de groupe hors de combat', () => {
  it('le CRS suit le chef de section, plus le corps de son chef de groupe', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', rank: 'gardien_stagiaire', place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS } });
    const { ctx } = t;
    t.step(20);
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const me = ctx.player.person()!;
    const group = ctx.squads.get(me.squadId)!;
    const section = ctx.squads.get(group.parentId)!;
    expect(brief.chief?.id).toBe(group.leaderId);
    const lead = ctx.people.get(group.leaderId)!;
    lead.health = 0;
    lead.injury = 'dead';
    t.step(2);
    console.log(`chef tué : ${brief.chief?.role} ${brief.chief?.label} | ${brief.instruction.source} « ${brief.instruction.title} »`);
    expect(brief.chief?.id).not.toBe(lead.id);
    if (section.leaderId !== 0 && section.leaderId !== lead.id) expect(brief.chief?.id).toBe(section.leaderId);
  }, 300000);
});
