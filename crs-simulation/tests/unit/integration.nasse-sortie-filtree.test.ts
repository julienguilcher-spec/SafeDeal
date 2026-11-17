// Sortie filtrée d'une nasse, robustesse des interpellations : une foule rassemblée sur l'esplanade de l'Hôtel-de-Ville
// (carte de Paris) est encerclée par une section (nasse), une autre filtre une sortie. Quatre personnes de la nasse
// sont auteurs de faits établis : TOUTES doivent finir interpellées — à la porte, ou rattrapées si elles se sont
// soustraites à la nasse — quels que soient la graine et l'effectif (le moindre changement de trajectoire suffisait à
// en laisser repartir une ou deux : ordre « interpeller » refusé faute d'agent hors du premier rang ; poursuivant qui
// restait à 1,7 m dans le dos d'un fuyard sans jamais l'atteindre).
import { describe, expect, it } from 'vitest';

import type { Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd, CROWD_CORE, CROWD_EVACUATIONS, CROWD_FLAG } from '@/sim/crowd';
import type { CrowdCoreApi, EvacuationsApi } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { ENCIRCLE_CLOSE_ALL, POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi } from '@/sim/police/api';
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

const VARIANTES = [
  { seed: 3, foule: 90 },
  { seed: 7, foule: 120 },
  { seed: 11, foule: 150 },
  { seed: 19, foule: 70 },
  { seed: 23, foule: 110 },
  { seed: 31, foule: 140 },
];

/** Nasse sur l'esplanade, sortie filtrée, quatre auteurs de faits établis dans la nasse : tous finissent interpellés. */
async function scenario(seed: number, foule: number): Promise<void> {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  const { ctx } = t;
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: "Place de l'Hôtel-de-Ville - Esplanade de la Libération", x: S.x, z: S.z,
    crowdSize: foule, tension: 0.1, volatility: 0.1, duration: 'courte',
    extra: {
      moyens: MEANS, variante: 'salle', foyers: 0, 'crowd.noAleas': true, 'crowd.static': true, 'crowd.present': 1, 'crowd.bystanders': 0,
      'traffic.vehicles': 0, 'traffic.pedestrians': 0, 'law.delayScale': 0.25, 'evacuation.controle': 2,
    },
  } as Partial<SessionConfig>);
  const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
  const me = ctx.player.person()!;
  // le commandant se tient à l'écart de la place
  me.x = S.x + 20;
  me.z = S.z - 110;
  t.step(60);
  const members = (): Person[] => core.members.filter((p) => p.custody === 'free' && (core.brain(p)!.flags & CROWD_FLAG.LEAVING) === 0);

  // nasse : une section encercle la place
  const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
  const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  const roadNear = (x: number, z: number): { x: number; z: number } => (ctx.world.nearestRoad(x, z, rs as never, 60) ? { x: rs.x, z: rs.z } : { x, z });
  const ring = roadNear(S.x + 120, S.z + 40);
  const orage = units.createSection({ x: ring.x, z: ring.z, heading: Math.atan2(S.x - ring.x, S.z - ring.z), callsign: 'ORAGE' }).squad;
  ctx.squads.issue(orage.id, { type: 'encercler', x: S.x, z: S.z, width: R * 2, heading: 0, targetId: ENCIRCLE_CLOSE_ALL, issuedBy: me.id });
  t.step(60);
  const inside0 = members().filter((p) => Math.hypot(p.x - S.x, p.z - S.z) < R);
  expect(inside0.length).toBeGreaterThan(foule * 0.4);
  // quatre auteurs de faits, pris çà et là dans la nasse (vus par les agents : faits établis)
  const culprits = [0, 1, 2, 3].map((i) => inside0[Math.floor((i * inside0.length) / 4)]!);
  for (const p of culprits) ctx.law.recordOffense(p, 'jet_projectile', p.x, p.z, 2).witnessed = true;

  // sortie filtrée : une autre section tient une rue qui sort de la place, porte de passage au milieu
  let door: { x: number; z: number } | null = null;
  for (let i = 0; i < 16 && !door; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const px = S.x + Math.sin(ang) * (R + 3);
    const pz = S.z + Math.cos(ang) * (R + 3);
    if (!ctx.world.nearestRoad(px, pz, rs as never, 6)) continue;
    const e = ctx.world.edge(rs.edgeId);
    if (e.pedestrianOnly || !ctx.world.isFree(rs.x, rs.z, 0.5)) continue;
    door = { x: rs.x, z: rs.z };
  }
  expect(door).not.toBeNull();
  const ox = door!.x - S.x, oz = door!.z - S.z, ol = Math.hypot(ox, oz);
  const out = roadNear(door!.x + (ox / ol) * 40, door!.z + (oz / ol) * 40);
  const filtre = units.createSection({ x: out.x, z: out.z, heading: Math.atan2(S.x - out.x, S.z - out.z), callsign: 'FILTRE' }).squad;
  ctx.squads.issue(filtre.id, { type: 'filtrer', x: door!.x, z: door!.z, heading: Math.atan2(S.x - door!.x, S.z - door!.z), width: 0, issuedBy: me.id });
  const evac = ctx.require<EvacuationsApi>(CROWD_EVACUATIONS);
  t.step(2);
  expect(evac.list.length).toBe(1);
  const ev = evac.list[0]!;
  let dead = 0;
  ctx.events.on('person:down', (e) => { if (e.injury === 'dead') dead++; });
  for (let s = 0; s < 90 && ev.active; s++) t.step(10);
  const refus = ctx.radio.log.filter((m) => /FILTRE/.test(m.from) && /Aucun binôme/.test(m.text)).length;
  console.log(`[graine ${seed}, ${foule}] nasse ${inside0.length}, sorties ${ev.out}, interpellations ${ev.arrested}, actif ${ev.active} ; auteurs : ${culprits.map((p) => p.custody).join(', ')} ; refus ${refus}`);
  expect(ev.active).toBe(false);
  expect(culprits.every((p) => p.custody !== 'free')).toBe(true);
  expect(ev.arrested).toBeGreaterThanOrEqual(culprits.length);
  expect(dead).toBe(0);
}

describe('nasse et sortie filtrée : tous les auteurs de faits établis sont interpellés', () => {
  it.each(VARIANTES)('graine $seed, $foule manifestants', async ({ seed, foule }) => {
    await scenario(seed, foule);
  }, 600000);

});
