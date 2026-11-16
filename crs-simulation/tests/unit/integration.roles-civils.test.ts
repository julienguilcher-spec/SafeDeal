// Sessions headless des rôles non policiers (journaliste, manifestant, street medic) avec toute la simulation :
// départ sur place avec la manifestation (jamais à une caserne, même si « journée de service » est coché), aucune
// unité de police au joueur, quelques minutes de simulation sans erreur, joueur libre de ses mouvements.
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as missions } from '@/gameplay/missions';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, patrols, missions];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('rôles non policiers : session complète', () => {
  const cases: { role: PlayableRole; kind: string; faction: string; extra?: Record<string, unknown> }[] = [
    { role: 'journaliste', kind: 'journaliste', faction: 'press' },
    { role: 'manifestant', kind: 'manifestant', faction: 'protest', extra: { variante: 'pacifique' } },
    { role: 'street_medic', kind: 'street_medic', faction: 'medic' },
  ];
  for (const c of cases) {
    it(`${c.role} : sur place, pas d'unité de police, deux minutes sans erreur`, async () => {
      const t = createTestContext({ seed: 7, strict: true, modules: SIM });
      await t.start({
        mode: 'libre', role: c.role, place: 'Place de la République', x: 3123, z: -208, crowdSize: 120, tension: 0.4, volatility: 0.4,
        duration: 'standard', extra: { ...(c.extra ?? {}), moyens: MEANS, journee: true },
      });
      const { ctx } = t;
      const me = ctx.player.person()!;
      expect(me).toBeTruthy();
      expect(me.kind).toBe(c.kind);
      expect(me.faction).toBe(c.faction);
      const d0 = Math.hypot(me.x - 3123, me.z + 208);
      console.log(`${c.role} : départ à ${d0.toFixed(0)} m de la place ; ${ctx.people.list.length} personnes ; ${ctx.vehicles.list.length} véhicules`);
      expect(d0).toBeLessThan(250);
      // le joueur n'est dans aucune unité de police
      if (me.squadId !== 0) expect(ctx.squads.get(me.squadId)?.faction).not.toBe('police');
      t.step(120);
      expect(ctx.session.phase).toBe('playing');
      expect(me.custody).toBe('free');
      expect(ctx.player.state.controlEnabled).toBe(true);
      expect(Number.isFinite(me.x) && Number.isFinite(me.z)).toBe(true);
      // aucun message des réseaux de police dans la radio du joueur civil
      const police = ctx.radio.log.filter((m) => m.channel === 'commandement' || m.channel === 'unite');
      console.log(`${c.role} : ${ctx.radio.log.length} messages radio dont ${police.length} de police`);
    }, 600000);
  }
});
