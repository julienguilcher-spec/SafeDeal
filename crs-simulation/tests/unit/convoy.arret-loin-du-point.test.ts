// Colonne de fourgons envoyée vers un point qu'elle ne peut pas atteindre (au-delà du bord est de la carte, à l'est
// de la place de la République) : elle s'arrête au plus près et le dit à la radio, avec la distance qui reste.
// Défaut d'origine : la colonne débarquait en silence à plus de cent mètres du point — le chef la croyait sur place.
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
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('colonne arrêtée loin de son point', () => {
  it('point inaccessible (bord est de la carte) : la colonne le dit à la radio', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
    const { ctx } = t;
    t.step(5);
    const core = ctx.service<CommandCore>('ui.command')!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    const far = { x: 0, z: 0 } as { x: number; z: number };
    expect(ctx.world.nearestRoad(3123 + 700, -150, far as never, 200)).toBe(true);
    // (le point demandé est au-delà du bord de la zone jouable)
    expect(ctx.world.surfaceAt(far.x, far.z)).toBe('void');
    expect(core.issue('faire_mouvement', [company], [{ x: far.x, z: far.z, heading: 0, width: 0 }]).ok).toBe(true);
    const cmd = ctx.service<{ convoyOf(id: number): { stage: string } | null }>('police.command')!;
    let rolled = false;
    for (let i = 0; i < 300; i++) {
      t.step(5);
      const st = cmd.convoyOf(company.id)?.stage;
      if (st === 'route') rolled = true;
      if (rolled && (st === 'debarquement' || st === 'en_place')) break;
    }
    t.step(3);
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs');
    const d = vans.map((v) => Math.round(Math.hypot(v.x - far.x, v.z - far.z)));
    const said = ctx.radio.log.map((l: { text: string }) => l.text).filter((x: string) => /du point/.test(x));
    console.log(`  ${cmd.convoyOf(company.id)?.stage} ; fourgons à ${d.join(' / ')} m du point ; ${said.join(' / ')}`);
    expect(rolled).toBe(true);
    // arrêtée loin du point : elle le dit
    expect(Math.min(...d)).toBeGreaterThan(120);
    expect(said.join(' ')).toMatch(/Colonne arrêtée à \d+ mètres du point, accès bloqué/);
  }, 900000);
});
