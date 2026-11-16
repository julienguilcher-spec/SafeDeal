// Moyens nombreux : seize sections, dix Centaures, dix canons à eau, huit BRAV-M, quatre drones, réellement en jeu ;
// moyens recommandés proportionnés à l’affluence.
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
import { recommendedMeans, defaultDraft } from '@/ui/screens/scenario';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

describe('moyens engagés', () => {
  it('le maximum de la page d’accueil est réellement en jeu', async () => {
    const t = createTestContext({ seed: 9, strict: false, modules: SIM });
    const moyens = { sections: 16, fourgons: 48, centaure: 10, canon_eau: 10, bravm: 8, drone: 4, pompiers: 2, samu: 2, secours_sur_appel: true };
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 400, tension: 0.3, volatility: 0.5, duration: 'standard', extra: { moyens } });
    const { ctx } = t;
    t.step(2);
    const count = (k: string) => ctx.vehicles.list.filter((v) => v.kind === k && v.faction === 'police').length;
    const police = ctx.people.list.filter((p) => p.faction === 'police').length;
    console.log(`en jeu : ${police} agents ; fourgons ${count('fourgon_crs')} ; Centaure ${count('centaure')} ; canons ${count('canon_eau')} ; motos ${count('moto_bravm')} ; drones ${ctx.vehicles.list.filter((v) => v.def.flying).length}`);
    expect(count('centaure')).toBe(10);
    expect(count('canon_eau')).toBe(10);
    expect(count('moto_bravm')).toBeGreaterThanOrEqual(7 * 6);
    expect(police).toBeGreaterThan(16 * 16);
  }, 300000);

  it('moyens recommandés : proportionnés à l’affluence et au risque', () => {
    const small = recommendedMeans({ ...defaultDraft(), crowdSize: 200, volatility: 0.1 });
    const big = recommendedMeans({ ...defaultDraft(), crowdSize: 5000, volatility: 0.8, composition: { ...defaultDraft().composition, black_bloc: 15 } });
    console.log('petite', JSON.stringify(small), '\ngrosse', JSON.stringify(big));
    expect(small.sections).toBeLessThan(big.sections);
    expect(big.centaure).toBeGreaterThanOrEqual(2);
    expect(big.canon_eau).toBeGreaterThanOrEqual(4);
    expect(small.centaure).toBe(0);
  });
});
