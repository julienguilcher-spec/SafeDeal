// Chaque rôle qui roule a son véhicule (motos de la BRAV-M, canon à eau, Centaure, drone), avec ou sans journée de
// service (caserne loin du rassemblement : sa zone est chargée aussi).
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
import type { PlayableRole } from '@/core/contracts';
import { SERVICE_BASE } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 4, fourgons: 12, centaure: 1, canon_eau: 1, bravm: 1, drone: 1, pompiers: 1, samu: 1, secours_sur_appel: true };
const KIND: Record<string, string> = { bravm: 'moto_bravm', operateur_canon_eau: 'canon_eau', gendarme_centaure: 'centaure', telepilote: 'voiture_police' };

describe('chaque rôle qui roule a son véhicule', () => {
  for (const journee of [true, false]) {
    for (const role of Object.keys(KIND) as PlayableRole[]) {
      it(`${role}${journee ? ' (journée de service)' : ''}`, async () => {
        const t = createTestContext({ seed: 4, strict: false, modules: SIM });
        const extra: Record<string, unknown> = { moyens: MEANS, journee };
        if (journee) extra['preload'] = [{ x: SERVICE_BASE.x, z: SERVICE_BASE.z }];
        await t.start({ mode: 'libre', missionId: '', role, place: 'Place de la République', x: 3123, z: -208, crowdSize: 300, tension: 0.2, volatility: 0.3, duration: 'standard', extra });
        const { ctx } = t;
        t.step(2);
        const me = ctx.player.person()!;
        const own = ctx.squads.get(me.squadId)!;
        const v = own.vehicleId ? ctx.vehicles.get(own.vehicleId) : undefined;
        const near = ctx.vehicles.list.filter((q) => q.kind === KIND[role] && Math.hypot(q.x - me.x, q.z - me.z) < 80).length;
        console.log(`${role} journée=${journee} : véhicule d'unité ${v ? v.kind : 'AUCUN'}, ${near} « ${KIND[role]} » à moins de 80 m`);
        expect(v).toBeDefined();
        expect(near).toBeGreaterThanOrEqual(1);
      }, 300000);
    }
  }
});
