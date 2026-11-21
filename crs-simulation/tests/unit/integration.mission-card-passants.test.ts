// Carte « Ma mission » du CRS de base dont le groupe tient un barrage de rue qui laisse passer les passants :
// « Barrage — <rue> : les manifestants ne passent pas, les passants oui » (lu sur le service 'police.barrages').
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { BARRAGE_LET_PASSERSBY, POLICE_BARRAGES_SERVICE } from '@/sim/police/api';
import type { BarragesApi } from '@/sim/police/api';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, traffic, police, items, props, hazards, law, radio, session, objectives];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('carte « Ma mission » : barrage, passants admis', () => {
  it('« Barrage — <rue> : les manifestants ne passent pas, les passants oui »', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', rank: 'gardien_stagiaire', place: 'essai', x: 0, z: -60, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, 'traffic.vehicles': 0, 'traffic.pedestrians': 0 } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    t.step(5);
    const me = ctx.player.person()!;
    // l'unité la plus haute du joueur (sa compagnie, ou sa section)
    let company = ctx.squads.get(me.squadId)!;
    for (let p = ctx.squads.get(company.parentId); p; p = ctx.squads.get(p.parentId)) company = p;
    console.log('unité', company.kind, company.name, ctx.squads.list.map((q) => q.kind + ':' + q.name).join(', '));
    const chief = ctx.people.get(company.leaderId)!;
    ctx.squads.issue(company.id, { type: 'couper_circulation', x: chief.x, z: chief.z - 15, heading: Math.PI, width: 0, targetId: BARRAGE_LET_PASSERSBY });
    const api = ctx.require<BarragesApi>(POLICE_BARRAGES_SERVICE);
    for (let i = 0; i < 240 && !api.list.some((b) => b.squadId === company.id && b.state !== 'en_route'); i++) t.step(1);
    // le joueur (exécutant) prend sa place dans la ligne
    const slot = ctx.service<{ slotOf(id: number): { x: number; z: number } | null }>('police.slot')!.slotOf(me.id);
    if (slot) { me.x = slot.x; me.z = slot.z; }
    t.step(2);
    console.log('barrages', JSON.stringify(api.list), '| carte :', brief.instruction.title, '—', brief.instruction.detail, '| joueur', me.x.toFixed(0), me.z.toFixed(0));
    expect(api.list.find((b) => b.squadId === company.id)?.passersby).toBe(true);
    expect(brief.instruction.title).toMatch(/^Barrage( — .+)? : les manifestants ne passent pas, les passants oui$/);
  }, 400000);
});
