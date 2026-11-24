// Engin armé : un seul joueur pilote et sert l'arme.
import { describe, expect, it } from 'vitest';

import type { PlayableRole } from '@/core/contracts';
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

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

// Un seul joueur pilote l'engin armé et sert son arme (pas de poste d'opérateur séparé).

const MEANS = { sections: 2, fourgons: 6, centaure: 1, canon_eau: 1, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(role: PlayableRole, kind: string) {
  const t = createTestContext({ seed: 11, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role, place: 'essai', x: -10, z: 15, crowdSize: 30, tension: 0, volatility: 0, duration: 'standard', extra: { moyens: MEANS } });
  const { ctx } = t;
  t.step(2);
  const me = ctx.player.person()!;
  const own = ctx.squads.get(me.squadId)!;
  const v = ctx.vehicles.get(own.vehicleId)!;
  expect(v.kind).toBe(kind);
  if (me.vehicleId !== v.id || me.seat !== 0) {
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    if (v.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(v.seats[0])!);
    me.x = v.x + 3; me.z = v.z;
    expect(ctx.vehicles.enter(me, v, 0)).toBe(true);
  }
  return { t, ctx, me, v };
}

describe('engin armé : le conducteur tire', () => {
  it('canon à eau : poste unique « conducteur », il roule et tient le jet des deux canons', async () => {
    const { t, ctx, me, v } = await start('operateur_canon_eau', 'canon_eau');
    expect(me.poste).toBe('conducteur');
    const input = ctx.input as unknown as { down(b: string): boolean; moveY: number };
    const water0 = (v.turretAmmo[0] ?? 0) + (v.turretAmmo[1] ?? 0);
    input.down = (b: string) => b === 'primary';
    input.moveY = 1;
    t.step(3);
    input.down = () => false;
    input.moveY = 0;
    const water1 = (v.turretAmmo[0] ?? 0) + (v.turretAmmo[1] ?? 0);
    console.log(`canon à eau : cuve ${water0} → ${water1.toFixed(0)} l ; vitesse ${v.speed.toFixed(1)} m/s`);
    expect(water1).toBeLessThan(water0 - 20);
    expect(v.speed).toBeGreaterThan(0.4);
  }, 120000);

  it('Centaure : le conducteur tire au lance-grenades', async () => {
    const { t, ctx, me, v } = await start('gendarme_centaure', 'centaure');
    expect(me.poste).toBe('conducteur');
    const input = ctx.input as unknown as { pressed(b: string): boolean };
    const ammo0 = v.turretAmmo[0] ?? 0;
    let once = true;
    input.pressed = (b: string) => { if (b === 'primary' && once) { once = false; return true; } return false; };
    t.step(1);
    input.pressed = () => false;
    console.log(`Centaure : grenades ${ammo0} → ${v.turretAmmo[0]}`);
    expect(v.turretAmmo[0] ?? 0).toBe(ammo0 - 1);
  }, 120000);
});
