// La chaîne de commandement IA donne un poste au joueur exécutant (radio + objectif suivi au GPS), il rend compte en place.
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
import { createSystems as session, ORDERS_SERVICE } from '@/gameplay/session';
import type { PlayerOrdersApi } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 4, fourgons: 12, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function play(role: PlayableRole) {
  const t = createTestContext({ seed: 31, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role, place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS } });
  const { ctx } = t;
  const orders = ctx.service<PlayerOrdersApi>(ORDERS_SERVICE)!;
  let order = null as PlayerOrdersApi['current'];
  for (let i = 0; i < 24 && !order; i++) { t.step(5); order = orders.current; }
  return { t, ctx, orders, order };
}

describe('ordres de la chaîne de commandement au joueur', () => {
  for (const role of ['operateur_canon_eau', 'gendarme_centaure', 'bravm', 'chef_groupe'] as const) {
    it(`${role} : reçoit un poste, puis rend compte en place`, async () => {
      const { t, ctx, orders, order } = await play(role);
      t.step(15);
      const said = ctx.radio.log.filter((m) => m.channel === 'commandement').map((m) => m.text);
      console.log(`${role} : ${order ? order.text : 'AUCUN ORDRE'} | radio : ${said.filter((x) => /Rendez compte|rejoignez|portez|rendez-vous/i.test(x)).slice(-1)[0]?.slice(0, 160)}`);
      expect(order).not.toBeNull();
      expect(said.some((x) => /Rendez compte|rejoignez|portez|rendez-vous/i.test(x))).toBe(true);
      // le joueur (et son véhicule s'il en a un) arrive sur le point
      const me = ctx.player.person()!;
      const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
      if (v) { v.x = order!.x; v.z = order!.z; } else { me.x = order!.x; me.z = order!.z; }
      t.step(25);
      console.log(`  arrivée : ${orders.current?.arrived} | ${ctx.radio.log.slice(-2).map((m) => m.text).join(' / ')}`);
      expect(orders.current?.arrived).toBe(true);
      expect(ctx.radio.log.some((m) => /en place/.test(m.text))).toBe(true);
    }, 300000);
  }

  it('commandant : ne reçoit pas d’ordres (il les donne)', async () => {
    const { order } = await play('commandant');
    expect(order).toBeNull();
  }, 300000);
});
