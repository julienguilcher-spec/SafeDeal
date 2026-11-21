// BRAV-M du joueur à la Concorde (mode libre, poste pilote) : les motos de son groupe ne sont pas garées derrière la
// grille des Tuileries — ni lui ni ses motos séparés de leur chef par un mur ou une grille.
import { describe, expect, it } from 'vitest';
import type { RayHit } from '@/core/contracts';
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
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

describe('BRAV-M du joueur à la Concorde', () => {
  for (const poste of ['pilote_moto', 'passager_moto']) {
    it(`${poste} : motos et équipiers du même côté de la grille que le chef`, async () => {
      const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la Concorde')!;
      const d: ScenarioDraft = { ...defaultDraft(), role: 'bravm' as never, poste: poste as never, variante: '', place: place.name, x: place.x, z: place.z, crowdSize: 150, seed: 3 };
      d.mode = 'libre';
      d.options = { ...d.options, journee: false };
      const t = createTestContext({ seed: 3, strict: false, modules: SIM });
      await t.start(buildSessionConfig(d));
      const { ctx } = t;
      const me = ctx.player.person()!;
      const squad = ctx.squads.get(me.squadId)!;
      const chief = ctx.people.get(squad.leaderId === me.id ? squad.members.find((id) => id !== me.id)! : squad.leaderId)!;
      const hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
      const cut: string[] = [];
      const check = (what: string, x: number, z: number): void => {
        if (ctx.world.raycast(chief.x, chief.z, x, z, hit) && (hit.kind === 'building' || hit.kind === 'barrier')) {
          cut.push(`${what} (${x.toFixed(0)}, ${z.toFixed(0)}) : ${hit.kind} en (${hit.x.toFixed(0)}, ${hit.z.toFixed(0)})`);
        }
      };
      check('joueur', me.x, me.z);
      const own = new Set<number>(squad.members);
      for (const v of ctx.vehicles.list) {
        if (v.kind !== 'moto_bravm' || Math.hypot(v.x - chief.x, v.z - chief.z) > 60) continue;
        if (v.seats.some((id) => own.has(id)) || Math.hypot(v.x - me.x, v.z - me.z) < 6) check(`moto ${v.id}`, v.x, v.z);
      }
      expect(cut).toEqual([]);
    }, 300000);
  }
});
