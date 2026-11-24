// Patrouilles : un équipage entièrement hors de combat (menotté, inconscient) ne rend plus compte à la radio et la
// voiture passe « Hors service » sur la carte tactique (sinon : des R.A.S. d'une voiture dont tout l'équipage est à terre).
import { describe, expect, it } from 'vitest';

import type { SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols, PATROLS_SERVICE } from '@/gameplay/patrols';
import type { PatrolsApi } from '@/gameplay/patrols';

const SIM = [world, roles, people, vehicles, police, radio, session, patrols];
const MEANS = { sections: 1, fourgons: 1, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('patrouille dont l’équipage est hors de combat', () => {
  it('plus de compte rendu radio, état « Hors service »', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
      tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, variante: 'salle', patrouilles: 2, foyers: 0 },
    } as Partial<SessionConfig>);
    t.step(1);
    const ctx = t.ctx;
    const api = ctx.require<PatrolsApi>(PATROLS_SERVICE);
    expect(api.list.length).toBe(2);
    const p = api.list[0]!;
    // tout l'équipage menotté
    for (const id of ctx.squads.get(p.squadId)!.members) ctx.people.get(id)!.custody = 'cuffed';
    const t0 = ctx.clock.now;
    t.step(900);
    const said = ctx.radio.log.filter((m) => m.from === p.name && m.t > t0 + 2);
    expect(said.map((m) => m.text)).toEqual([]);
    expect(p.state).toBe('hors_service');
  }, 300000);
});
