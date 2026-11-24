// Compte rendu d'un bouclage trop mince : une seule section (seize agents) pour un cercle de 45 m sur l'esplanade de
// l'Hôtel-de-Ville — une douzaine d'issues, plus de 250 m de front. Elle ne tient pas toutes les issues : son chef le dit
// et demande un renfort, comme un barrage de rue trop court (« Largeur insuffisante… »), au lieu d'annoncer « toutes les
// issues sont fermées ». (Une compagnie sur une place ronde, police.encerclement, les ferme bien toutes.)
import { describe, expect, it } from 'vitest';

import type { SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { ENCIRCLE_CLOSE_ALL, POLICE_FORMATION_SERVICE, POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceFormationApi, PoliceUnitsApi } from '@/sim/police/api';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, traffic, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
/** Esplanade de l'Hôtel-de-Ville. */
const S = { x: 2219, z: 994 };
const R = 45;

describe('bouclage trop mince : compte rendu honnête', () => {
  it.each([3, 7])('graine %i : une section seule sur l’esplanade rend compte d’un bouclage incomplet', async (seed) => {
    const t = createTestContext({ seed, strict: false, modules: SIM });
    const { ctx } = t;
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: "Place de l'Hôtel-de-Ville - Esplanade de la Libération", x: S.x, z: S.z,
      crowdSize: 60, tension: 0.1, volatility: 0.1, duration: 'courte',
      extra: { moyens: MEANS, variante: 'salle', foyers: 0, 'crowd.noAleas': true, 'crowd.static': true, 'crowd.present': 1, 'crowd.bystanders': 0, 'traffic.vehicles': 0, 'traffic.pedestrians': 0 },
    } as Partial<SessionConfig>);
    const me = ctx.player.person()!;
    me.x = S.x + 20;
    me.z = S.z - 110;
    t.step(20);
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    const ring = ctx.world.nearestRoad(S.x + 120, S.z + 40, rs as never, 60) ? { x: rs.x, z: rs.z } : { x: S.x + 120, z: S.z + 40 };
    const sec = units.createSection({ x: ring.x, z: ring.z, heading: Math.atan2(S.x - ring.x, S.z - ring.z), callsign: 'ORAGE' });
    ctx.squads.issue(sec.squad.id, { type: 'encercler', x: S.x, z: S.z, width: R * 2, heading: 0, targetId: ENCIRCLE_CLOSE_ALL, issuedBy: me.id });
    let report = '';
    for (let s = 0; s < 200 && report === ''; s++) {
      t.step(1);
      report = ctx.radio.log.find((m) => /Bouclage/.test(m.text))?.text ?? '';
    }
    const fo = ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE);
    const exits = fo.exits(sec.squad.id);
    const total = exits.reduce((a, e) => a + (e.held ? e.width : 0), 0);
    console.log(`[bouclage ${seed}] ${exits.length} issues, ${total.toFixed(0)} m, ${sec.people.length} agents : ${report}`);
    expect(report).not.toBe('');
    expect(total).toBeGreaterThan(sec.people.length * 3 * 2);
    expect(report).not.toMatch(/toutes les issues sont fermées/);
    expect(report).toMatch(/Bouclage incomplet/);
    expect(report).toMatch(/renfort/);
  }, 600000);
});
