// Sortie filtrée d'une nasse, robustesse des interpellations : une foule rassemblée sur l'esplanade de l'Hôtel-de-Ville
// (carte de Paris) est encerclée par une section (nasse), une autre filtre une sortie. Quatre personnes de la nasse
// sont auteurs de faits établis : TOUTES doivent finir interpellées — à la porte, ou rattrapées si elles se sont
// soustraites à la nasse — quels que soient la graine et l'effectif (le moindre changement de trajectoire suffisait à
// en laisser repartir une ou deux : ordre « interpeller » refusé faute d'agent hors du premier rang ; poursuivant qui
// restait à 1,7 m dans le dos d'un fuyard sans jamais l'atteindre).
// La nasse ne fuit pas : chaque personne prise dans la nasse en sort par la porte filtrée ou interpellée — aucune ne
// passe l'anneau ailleurs (mesuré : où chacun franchit pour la première fois le cercle des lignes). Une section qui
// trottait vers sa porte faisait « fuir » les nassés à travers l'anneau ; un nassé poussé sur la lisière du cercle
// « n'était plus nassé » et s'en allait par l'intervalle de deux agents.
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

const VARIANTES = [
  { seed: 3, foule: 90 },
  { seed: 7, foule: 120 },
  { seed: 11, foule: 150 },
  { seed: 19, foule: 70 },
  { seed: 23, foule: 110 },
  { seed: 31, foule: 140 },
  { seed: 43, foule: 160 },
  { seed: 5, foule: 100 },
  { seed: 13, foule: 80 },
];

/** Au-delà de ce rayon (m), on a franchi l'anneau (lignes tenues à R + 3 m) ; à moins de PORTE m de la porte, par elle. */
const DEHORS = R + 8;
const PORTE = 15;

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
  const formation = ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE);
  let front: string[] = [];
  // où chaque nassé franchit l'anneau pour la première fois : par la porte, ou ailleurs (fuite)
  const crossed = new Map<number, { t: number; porte: number; x: number; z: number }>();
  for (let s = 0; s < 900 && ev.active; s++) {
    t.step(1);
    if (s === 40) front = (formation.of(filtre.id, 0)?.front ?? []).map((id) => ctx.people.get(id)?.poste ?? '?');
    for (const p of inside0) {
      if (crossed.has(p.id) || p.custody !== 'free' || Math.hypot(p.x - S.x, p.z - S.z) < DEHORS) continue;
      crossed.set(p.id, { t: s, porte: Math.hypot(p.x - door!.x, p.z - door!.z), x: p.x, z: p.z });
    }
  }
  const leaks = [...crossed].filter(([, c]) => c.porte > PORTE);
  const byDoor = [...crossed].filter(([, c]) => c.porte <= PORTE).length;
  const arrested = inside0.filter((p) => p.custody !== 'free').length;
  for (const p of inside0) {
    if (crossed.has(p.id) || p.custody !== 'free') continue;
    const b = core.brain(p);
    console.log(`  resté : ${p.id} à ${Math.hypot(p.x - S.x, p.z - S.z).toFixed(1)} m du centre, ${p.posture}, état ${b ? b.state : 'parti'}`);
  }
  for (const [id, c] of leaks) console.log(`  fuite : ${id} à t+${c.t} s, (${c.x.toFixed(0)}, ${c.z.toFixed(0)}), à ${c.porte.toFixed(0)} m de la porte`);
  const refus = ctx.radio.log.filter((m) => /FILTRE/.test(m.from) && /Aucun binôme/.test(m.text)).length;
  console.log(`[graine ${seed}, ${foule}] nasse ${inside0.length}, sorties ${ev.out} (dont ${byDoor} nassés, ${Math.round((100 * byDoor) / inside0.length)} %), interpellations ${ev.arrested}, fuites ${leaks.length}, actif ${ev.active} ; auteurs : ${culprits.map((p) => p.custody).join(', ')} ; refus ${refus}`);
  expect(ev.active).toBe(false);
  // le barrage filtrant garde son binôme d'interpellation derrière la ligne, prêt à saisir à la porte
  expect(front.length).toBeGreaterThan(4);
  expect(front).not.toContain('interpellation');
  // aucune fuite : chaque nassé est sorti par la porte ou a été interpellé
  expect(leaks.map(([id]) => id)).toEqual([]);
  expect(byDoor + arrested).toBe(inside0.length);
  expect(culprits.every((p) => p.custody !== 'free')).toBe(true);
  expect(ev.arrested).toBeGreaterThanOrEqual(culprits.length);
  expect(dead).toBe(0);
}

describe('nasse et sortie filtrée : tous les auteurs de faits établis sont interpellés', () => {
  it.each(VARIANTES)('graine $seed, $foule manifestants', async ({ seed, foule }) => {
    await scenario(seed, foule);
  }, 600000);

});
