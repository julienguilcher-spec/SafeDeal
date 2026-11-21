// Contexte de test sans rendu (headless) sur la carte de Paris : déroulement reproductible.
// Les tuiles étaient lues de façon asynchrone (lecture disque) : celles qui étaient prêtes à un pas donné, et l'ordre
// dans lequel leurs obstacles entraient dans le monde, dépendaient de la vitesse du disque et de la charge de la
// machine. Une tuile demandée pendant la simulation (cortège qui avance, nasse loin du joueur) ne se chargeait jamais
// tant que le test ne rendait pas la main. Même graine, même code : deux exécutions divergeaient (203 / 201 personnes
// dans la nasse, 154 / 141 sorties). En headless, chaque tuile est désormais chargée au moment où elle est demandée.
import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import type { WorldQueryExt } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, traffic, law, radio, session];
/** Esplanade de l'Hôtel-de-Ville, à 4,6 km du Trocadéro. */
const S = { x: 2219, z: 994 };

describe('monde headless : chargement des tuiles reproductible', () => {
  it('une tuile demandée pendant la simulation est chargée sur-le-champ, sans attendre le disque', async () => {
    const t = createTestContext({ seed: 3, modules: [world] });
    await t.start({ mode: 'libre', place: 'Place du Trocadéro', x: -2411, z: 387 } as Partial<SessionConfig>);
    const w = t.ctx.world as unknown as WorldQueryExt;
    // au départ : toutes les tuiles du rayon de chargement sont prêtes, aucune lecture en cours
    expect(w.stats().tilesLoaded).toBeGreaterThan(4);
    expect(w.stats().tilesLoading).toBe(0);
    t.step(1);
    expect(t.ctx.world.isLoaded(S.x, S.z)).toBe(false);
    const segments = w.stats().segments;
    // demande faite pendant un pas de simulation (ce que fait le module des cortèges) : prête au retour
    void t.ctx.world.whenLoaded(S.x, S.z, 100);
    expect(t.ctx.world.isLoaded(S.x, S.z)).toBe(true);
    expect(w.stats().tilesLoading).toBe(0);
    // ses immeubles font obstacle dès maintenant
    expect(w.stats().segments).toBeGreaterThan(segments);
  }, 120000);

  it('même graine, même scénario : deux exécutions dans le même processus donnent exactement le même état', async () => {
    const run = async (): Promise<string> => {
      const t = createTestContext({ seed: 7, strict: false, modules: SIM });
      await t.start({
        mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place du Trocadéro', x: -2411, z: 387, crowdSize: 60,
        tension: 0.1, volatility: 0.1, duration: 'courte',
        extra: {
          variante: 'salle', foyers: 0, 'crowd.noAleas': true, 'traffic.vehicles': 0, 'traffic.pedestrians': 0,
          'manifs.rassemblement': 15, 'manifs.vitesse': 2,
          manifestations: [{ place: 'Place des Vosges', x: 3248, z: 1114, crowdSize: 80, cause: 'climat', destination: "Place de l'Hôtel-de-Ville - Esplanade de la Libération" }],
        },
      } as Partial<SessionConfig>);
      t.step(90);
      const w = t.ctx.world as unknown as WorldQueryExt;
      const tiles = w.stats().tilesLoaded;
      const state = t.ctx.people.list.map((p) => `${p.id}:${p.x.toFixed(4)},${p.z.toFixed(4)},${p.custody}`).join(';');
      return `${tiles} tuiles | ${t.ctx.people.list.length} personnes | ${t.ctx.radio.log.length} messages | ${state}`;
    };
    const a = await run();
    const b = await run();
    console.log(`[déterminisme] ${a.slice(0, a.indexOf(' | ', a.indexOf('messages')))}`);
    expect(b).toBe(a);
  }, 300000);
});
