// Aléas des phases de mission : annoncés par la salle et traduits en effets réels (averse, feu, blessé).
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { PhaseAleas } from '@/gameplay/missions/aleas';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, session];

describe('aléas des phases', () => {
  it('averse, départ de feu, blessé : annoncés et réellement joués', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', place: 'essai', x: -10, z: 15, crowdSize: 120, tension: 0.2, volatility: 0.2, duration: 'standard', weather: 'clair' });
    const { ctx } = t;
    t.step(20);
    const a = new PhaseAleas();
    a.play(ctx, 'Averse de deux minutes');
    expect(ctx.env.state.weather).toBe('averse');
    a.play(ctx, 'Une trottinette électrique prend feu');
    t.step(1);
    a.play(ctx, 'Un manifestant glisse sur le pavé mouillé');
    t.step(30);
    const inc = ctx.service<IncidentsApi>(EXT.incidents)!;
    const kinds = inc.list.map((i) => i.kind);
    console.log(`aléas : météo ${ctx.env.state.weather} ; incidents ${kinds.join(', ')} ; radio « ${ctx.radio.log.filter((m) => m.from === 'SALLE').map((m) => m.text).join(' | ')} »`);
    expect(kinds).toContain('blesse');
    expect(kinds.some((k) => k.startsWith('feu'))).toBe(true);
    expect(ctx.radio.log.filter((m) => m.from === 'SALLE').length).toBeGreaterThanOrEqual(2);
  }, 300000);
});
