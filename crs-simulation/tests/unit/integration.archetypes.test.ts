// Test d'intégration headless : archétypes réels + matériel réel + droit réel (commandant unique, sommations).
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as roles } from '@/sim/roles';

describe('intégration : archétypes, matériel, droit', () => {
  it('équipe correctement un CRS, le commandant unique et un manifestant, et laisse le commandant faire les sommations', async () => {
    const t = createTestContext({ seed: 3, modules: [world, people, items, hazards, law, roles] });
    await t.start({ mode: 'test', x: 0, z: 0 });
    const { ctx } = t;
    const bouclier = ctx.archetypes.spawn('crs', 2, 2, { poste: 'bouclier', rank: 'gardien' });
    const chef = ctx.archetypes.spawn('crs', 4, 2, { poste: 'commandant_unite', rank: 'commandant' });
    const radical = ctx.archetypes.spawn('manifestant', 20, 2, { profile: 'radical' });
    const pacifique = ctx.archetypes.spawn('manifestant', 22, 2, { profile: 'pacifique' });
    console.log('bouclier:', bouclier.inventory.map((i) => i.id).join(','), '| tenue:', bouclier.look.outfit, bouclier.look.headgear, bouclier.look.backText);
    console.log('commandant:', chef.inventory.map((i) => i.id).join(','), '| écharpe:', chef.look.sash, '| galons:', chef.look.rankBars);
    console.log('radical:', radical.inventory.map((i) => i.id).join(','), '| tenue:', radical.look.outfit, radical.look.headgear);
    console.log('pacifique:', pacifique.inventory.map((i) => i.id).join(','), '| extras:', JSON.stringify(pacifique.look.extras));
    expect(ctx.actions.has(bouclier, 'bouclier')).toBeGreaterThan(0);
    expect(chef.look.sash).toBe(true);
    expect(ctx.actions.has(chef, 'megaphone')).toBeGreaterThan(0);
    expect(bouclier.look.sash).toBe(false);
    // Le simple CRS ne peut pas faire de sommation ; le commandant unique le peut.
    expect(ctx.law.sommation(bouclier)).toBe(0);
    const s1 = ctx.law.sommation(chef);
    console.log('sommation par le commandant → étape', s1, '|', ctx.law.sommationText(s1 as 0 | 1 | 2 | 3));
    expect(s1).toBe(1);
    t.step(5);
  });
});
