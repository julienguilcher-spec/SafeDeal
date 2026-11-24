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
import { createSystems as env } from '@/env';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('colonne : point inaccessible en véhicule', () => {
  it('la section le dit à la radio, en clair, et dit ce qu’elle fait à la place', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 100, tension: 0.2, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } } as never);
    t.step(3);
    const ctx = t.ctx;
    const pc = ctx.service<{ arrive(id: number, d: Record<string, unknown>): boolean; convoyOf(id: number): { stage: string } | null }>('police.command')!;
    const sec = ctx.squads.list.find((s) => s.kind === 'section' && s.faction === 'police' && ctx.squads.list.some((g) => g.parentId === s.id && g.vehicleId !== 0))!;
    // un point qu'aucune voie carrossable ne dessert (hors de la carte des rues)
    const tx = 30000, tz = 30000;
    expect(ctx.world.findPath(0, 0, tx, tz, 'vehicle', [])).toBe(false);
    const from = ctx.radio.log.length;
    expect(pc.arrive(sec.id, { x: tx, z: tz, heading: 0, layout: 'file', boardFirst: true, stagger: true, disembark: true })).toBe(true);
    let stage = '';
    for (let i = 0; i < 400 && stage !== 'en_place'; i++) { t.step(1); stage = pc.convoyOf(sec.id)?.stage ?? ''; }
    // (le compte rendu passe sur un réseau de commandement chargé : il est dit dans les quarante secondes)
    t.step(40);
    const said = ctx.radio.log.slice(from).filter((m) => m.from === sec.name).map((m) => m.text);
    console.log(said.join('\n'));
    expect(stage).toBe('en_place');
    expect(said.some((x) => /inaccessible en v[ée]hicule/i.test(x)), said.join('\n')).toBe(true);
  }, 600000);
});
