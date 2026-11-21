// « Barrer la rue » avec passants admis, donné à une unité lointaine : elle embarque, roule, débarque, puis barre la rue —
// avec l'option donnée (elle était perdue : l'ordre repris au débarquement repartait avec targetId 0, personne ne passait).
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
import { BARRAGE_LET_PASSERSBY } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const CONFIG = { mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } } as const;

describe('« Barrer la rue », passants admis, après une colonne motorisée', () => {
  it('l’ordre repris au débarquement garde l’option des passants', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start(CONFIG as never);
    const { ctx } = t;
    t.step(2);
    const core = ctx.service<CommandCore>('ui.command')!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    // à 600 m : mouvement motorisé, « Barrer la rue » repris au débarquement
    expect(core.issue('couper_circulation', [company], [{ x: 239, z: -497, heading: 0, width: 0 }], BARRAGE_LET_PASSERSBY).ok).toBe(true);
    expect(core.afterConvoy.get(company.id)?.targetId).toBe(BARRAGE_LET_PASSERSBY);
    ctx.events.emitAny('command:convoy', { squadId: company.id, stage: 'en_place' });
    expect(company.order.type).toBe('couper_circulation');
    expect(company.order.targetId).toBe(BARRAGE_LET_PASSERSBY);
  }, 300000);
});
