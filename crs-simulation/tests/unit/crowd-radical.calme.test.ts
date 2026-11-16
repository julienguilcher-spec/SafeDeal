// Groupes radicaux — à volatilité nulle il ne se passe RIEN de violent, sur toute la manifestation, même avec
// une forte part de radicaux et de suiveurs, une tension de départ sensible et une ligne d'agents sur le parcours.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { CROWD_RADICAL, CROWD_SIGNALS } from '@/sim/crowd';
import type { RadicalApi, SignalsApi } from '@/sim/crowd';
import { avenueConfig, chantier, createRadicalTest, policeLine } from '@/sim/crowd/radical/testkit';

const MODULES = [world, roles, people, items, hazards, law, props, vehicles];
const VIOLENT = ['jet_projectile', 'violence_agent', 'degradation', 'incendie', 'pillage', 'barricade', 'violence', 'tag', 'dissimulation_visage'];

describe('groupes radicaux — volatilité nulle', () => {
  it('ne produit aucun signe, aucun projectile, aucune casse du début à la fin', async () => {
    const t = createRadicalTest({ seed: 11, modules: MODULES });
    const { ctx, watch } = t;
    await t.start(avenueConfig({ volatility: 0, tension: 0.45 }));
    t.run(1);
    chantier(ctx, 186, 15);
    const line = policeLine(ctx, 300, 0, -Math.PI / 2, 14);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    const signals = ctx.require<SignalsApi>(CROWD_SIGNALS);
    const radicals = t.radicals();
    expect(radicals.length).toBeGreaterThan(10);
    // des groupes d'affinité existent bel et bien : ils ne font rien parce que rien ne les y pousse
    t.run(30);
    expect(api.groups.length).toBeGreaterThan(0);
    let maxHeat = 0;
    let phases = new Set<string>();
    let masked = 0;
    for (let s = 0; s < 1100 && ctx.director.phase !== 'terminee'; s += 5) {
      t.run(5);
      if (api.heat > maxHeat) maxHeat = api.heat;
      phases.add(api.phase);
      masked = Math.max(masked, t.radicals().filter((p) => p.look.faceCover || p.look.outfit === 'black_bloc').length);
    }
    console.log('[radicaux] volatilité 0 : radicaux', radicals.length, '| groupes', api.groups.length, '| chaleur max', maxHeat, '| phases du bloc', [...phases].join(','),
      '| signes', signals.list.length, '| projectiles', watch.thrown, '| infractions', JSON.stringify(watch.offenses), '| phase finale', ctx.director.phase);
    // la manifestation est allée à son terme (dispersion faite ou en cours de fin)
    expect(['dispersion', 'apres_manif', 'terminee']).toContain(ctx.director.phase);
    expect(maxHeat).toBe(0);
    expect([...phases]).toEqual(['dormant']);
    expect(signals.list.length).toBe(0);
    expect(watch.thrown).toBe(0);
    expect(watch.facts.length).toBe(0);
    expect(watch.windowsBroken).toBe(0);
    expect(watch.looted).toBe(0);
    expect(watch.barricades).toBe(0);
    expect(watch.fires).toBe(0);
    expect(watch.policeHurt).toBe(0);
    for (const type of VIOLENT) expect(watch.offenses[type] ?? 0).toBe(0);
    // personne ne s'est masqué ni changé, aucun agent n'a été touché, aucune vitrine n'a souffert
    expect(masked).toBe(0);
    for (const p of line) expect(p.health).toBe(100);
    expect(ctx.props.shops.filter((s) => s.window === 'broken' || s.window === 'cracked' || s.window === 'tagged').length).toBe(0);
    expect(api.stats.thrown + api.stats.volleys + api.stats.windowsAttacked + api.stats.looted + api.stats.barricades).toBe(0);
  }, 900_000);
});
