// Mouvement motorisé implicite : l'ordre repris au débarquement ne doit pas écraser un ordre plus récent du joueur,
// ni survivre d'une session à l'autre.
import { describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const CONFIG = { mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } } as const;

describe('ordre repris après une colonne motorisée', () => {
  it('un ordre plus récent du joueur annule l’ordre en attente ; rien ne survit à une nouvelle session', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start(CONFIG as never);
    const { ctx } = t;
    t.step(2);
    const core = ctx.service<CommandCore>('ui.command')!;
    // une section (le commandant n'en fait pas partie) : l'unité du joueur à pied ne part jamais en véhicules
    // (ordres-directs §2.1, direct/travel.ts motorizes)
    const company = ctx.squads.list.find((s) => s.kind === 'section')!;
    const lead = ctx.people.get(company.leaderId)!;
    // « tenir » à 600 m : mouvement motorisé, « tenir » repris au débarquement
    expect(core.issue('tenir', [company], [{ x: 239, z: -497, heading: 0, width: 20 }]).ok).toBe(true);
    expect(core.afterConvoy.has(company.id)).toBe(true);
    // contrordre : « tenir » sur place (pas de mouvement motorisé)
    expect(core.issue('tenir', [company], [{ x: lead.x + 5, z: lead.z, heading: 1, width: 20 }]).ok).toBe(true);
    // la colonne lancée plus tôt finit son débarquement
    ctx.events.emitAny('command:convoy', { squadId: company.id, stage: 'en_place' });
    expect(Math.hypot(company.order.x - (lead.x + 5), company.order.z - lead.z)).toBeLessThan(1);

    // nouvelle session : une colonne IA de la même unité ne reprend pas un ordre de la session précédente
    expect(core.issue('tenir', [company], [{ x: 239, z: -497, heading: 0, width: 20 }]).ok).toBe(true);
    expect(core.afterConvoy.size).toBeGreaterThan(0);
    await t.start(CONFIG as never);
    expect(core.afterConvoy.size).toBe(0);
  }, 300000);
});
