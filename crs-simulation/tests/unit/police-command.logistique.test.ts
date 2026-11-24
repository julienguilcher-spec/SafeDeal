// Commandant IA : réserves des fourgons épuisées et unités à court de grenades → demande de ravitaillement à la
// logistique (service 'session.supply'), réserves complétées après le délai.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { PlayerSupplySystem } from '@/sim/police/supply-player';
import type { PlayerSupplyApi } from '@/sim/police/api';
import { PLAYER_SUPPLY_SERVICE } from '@/sim/police/api';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law];

describe('commandant IA — logistique', () => {
  it('fourgons vides, grenades épuisées : la logistique est demandée puis les réserves sont complétées', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: -100, extra: { 'commandement.aptitude': 0.9 } }, { seed: 5, systems: [new PlayerSupplySystem()] });
    const { ctx } = t;
    const supply = ctx.require<PlayerSupplyApi>(PLAYER_SUPPLY_SERVICE);
    supply.restockDelay = 30;
    const cie = t.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: true });
    t.step(5);
    for (const v of cie.vehicles) {
      const r = t.units.reserveOf(v.id);
      if (r) for (const k of Object.keys(r)) if (k !== 'vehicleId') (r as unknown as Record<string, number>)[k] = 0;
    }
    const members: Person[] = [];
    t.units.members(cie.squad.id, members);
    for (const p of members) {
      ctx.actions.remove(p, 'grenade_lacrymo');
      const l = p.inventory.find((s) => s.id === 'lanceur_cougar');
      if (l) l.count = 0;
    }
    let asked = -1;
    t.run(200, 1, () => {
      if (asked < 0 && supply.pendingUntil(cie.squad.id) >= 0) asked = ctx.clock.now;
      return asked >= 0;
    });
    console.log('demande à t =', asked.toFixed(0), '|', ctx.radio.log.filter((m) => m.text.includes('ravitaillement') || m.text.includes('Ravitaillement')).map((m) => m.text).join(' / '));
    expect(asked).toBeGreaterThan(0);
    t.step(35);
    const van = cie.vehicles.find((v) => v.kind === 'fourgon_crs')!;
    expect(t.units.reserveOf(van.id)!.lacrymoMain).toBe(12);
    expect(ctx.radio.log.some((m) => m.text.includes('Ravitaillement arrivé, zone de stationnement'))).toBe(true);
  }, 120000);
});
