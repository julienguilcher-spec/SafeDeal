// Rôles civils : (1) le filtre d'écoute du métier est posé dès le début de la session — aucun message de police
// de la mise en place (t = 0) n'est entendu par un journaliste ou un manifestant ; (2) la carte « Ma mission » du
// manifestant suit sa variante : service d'ordre et radical ne reçoivent pas la consigne du pacifique.
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
import type { MissionBrief } from '@/gameplay/session/mission-api';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePlaces } from '@/world/mapdata';
import type { RawPlaces } from '@/world/mapdata';
import { missionConfig } from '@/gameplay/missions';
import { MISSIONS } from '@/gameplay/missions/catalog';

const CARTE = decodePlaces(JSON.parse(readFileSync(resolve(__dirname, '../../public/data/paris/places.json'), 'utf8')) as RawPlaces);

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, patrols, missions];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function start(role: PlayableRole, variante?: string) {
  const t = createTestContext({ seed: 5, strict: true, modules: SIM });
  await t.start({
    mode: 'libre', role, place: 'Place de la République', x: 3123, z: -208, crowdSize: 120, tension: 0.4, volatility: 0.4,
    duration: 'standard', extra: { ...(variante ? { variante } : {}), moyens: MEANS },
  });
  return t;
}

describe('rôles civils : écoute et carte « Ma mission »', () => {
  for (const id of ['journaliste-07', 'manifestant-05', 'pompier-06']) {
    it(`${id} : aucun message de police entendu, même à la mise en place`, async () => {
      const def = MISSIONS.find((m) => m.id.startsWith(id))!;
      expect(def).toBeTruthy();
      const at = CARTE.find((q) => q.name.toLowerCase() === def.place.toLowerCase())!;
      const t = createTestContext({ seed: 5, strict: true, modules: SIM });
      await t.start({ ...missionConfig(def, null), x: at.x, z: at.z });
      t.step(3);
      const ctl = t.ctx.service<{ muted(m: unknown): boolean }>('radio.control')!;
      const heard = t.ctx.radio.log.filter((m) => !ctl.muted(m) && (m.channel === 'commandement' || m.channel === 'unite'));
      expect(heard.map((m) => `${m.from} : ${m.text}`)).toEqual([]);
    }, 120000);
  }

  it('manifestant : consigne propre au service d\'ordre et au radical', async () => {
    const titles: Record<string, string> = {};
    for (const v of ['pacifique', 'service_ordre', 'radical']) {
      const t = await start('manifestant', v);
      t.step(3);
      const brief = t.ctx.service<MissionBrief>('session.mission')!;
      expect(brief.active).toBe(true);
      titles[v] = `${brief.instruction.title} | ${brief.instruction.detail ?? ''}`;
    }
    console.log(titles);
    expect(titles['service_ordre']).not.toBe(titles['pacifique']);
    expect(titles['radical']).not.toBe(titles['pacifique']);
    expect(titles['radical']).not.toBe(titles['service_ordre']);
  }, 180000);
});
