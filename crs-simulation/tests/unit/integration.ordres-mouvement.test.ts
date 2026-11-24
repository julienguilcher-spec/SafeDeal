// Ordres de mouvement du commandant joueur : les groupes se portent franchement sur le point (colonne puis ligne au-delà
// de 45 m, au trot sur un point éloigné) et y arrivent en temps raisonnable.
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
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 4, fourgons: 12, centaure: 0, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('ordres de mouvement du joueur', () => {
  for (const type of ['avancer', 'tenir'] as const) {
    it(`« ${type} » vers un point de la place à 60-90 m : les groupes y sont en moins de 75 s`, async () => {
      const t = createTestContext({ seed: 31, strict: false, modules: SIM });
      await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
      const { ctx } = t;
      t.step(20);
      const me = ctx.player.person()!;
      const groups = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe').slice(0, 2);
      const targets = groups.map((s, i) => {
        const lead = ctx.people.get(s.members[1] ?? s.members[0])!;
        let x = lead.x + 80 * Math.cos(i * 1.7 + 2), z = lead.z + 80 * Math.sin(i * 1.7 + 2);
        const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' };
        if (ctx.world.nearestRoad(x, z, rs as never, 60)) { x = rs.x; z = rs.z; }
        ctx.squads.issue(s.id, { type, x, z, heading: 0, width: 0, issuedBy: me.id });
        return { x, z };
      });
      const median = (i: number) => {
        const ds = groups[i]!.members.filter((id) => ctx.people.get(id)!.vehicleId === 0).map((id) => { const p = ctx.people.get(id)!; return Math.hypot(p.x - targets[i]!.x, p.z - targets[i]!.z); }).sort((a, b) => a - b);
        return ds[Math.floor(ds.length / 2)]!;
      };
      const d0 = groups.map((_, i) => median(i));
      t.step(75);
      const d1 = groups.map((_, i) => median(i));
      console.log(`« ${type} » : ${groups.map((s, i) => `${s.name} ${d0[i]!.toFixed(0)} → ${d1[i]!.toFixed(0)} m (ordre ${s.order.type})`).join(' ; ')}`);
      for (let i = 0; i < groups.length; i++) {
        expect(groups[i]!.order.issuedBy).toBe(me.id);
        expect(d1[i]!).toBeLessThan(10);
      }
    }, 300000);
  }
});
