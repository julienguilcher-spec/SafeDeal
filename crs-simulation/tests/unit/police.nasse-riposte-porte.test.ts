// Riposte proportionnée à la porte d'une nasse filtrée : un auteur de faits retenu au contrôle se débat et frappe
// l'agent qui l'interpelle. L'unité qui filtre ne riposte pas aux lacrymogènes sur la file de nassés calmes qui
// attendent à la porte : la résistance à l'interpellation se règle au contact, par le binôme. (Le coup porté à l'agent
// marquait toute l'unité « attaquée » : grenades à main et lanceur de 56 mm tirés sur la porte, dans la file.)
// (Sortie filtrée d'une nasse, robustesse des interpellations : une foule rassemblée sur l'esplanade de l'Hôtel-de-Ville
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
import { ARREST_EVENT, ENCIRCLE_CLOSE_ALL, FORCE_USED_EVENT, POLICE_UNITS_SERVICE } from '@/sim/police/api';
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

describe('nasse filtrée : pas de gaz sur la file quand un interpellé résiste', () => {
  it.each([13, 7])('graine %i', async (seed) => {
    const t = createTestContext({ seed, strict: false, modules: SIM });
    const { ctx } = t;
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: "Place de l'Hôtel-de-Ville - Esplanade de la Libération", x: S.x, z: S.z,
      crowdSize: 80, tension: 0.1, volatility: 0.1, duration: 'courte',
      extra: {
        moyens: MEANS, variante: 'salle', foyers: 0, 'crowd.noAleas': true, 'crowd.static': true, 'crowd.present': 1, 'crowd.bystanders': 0,
        'traffic.vehicles': 0, 'traffic.pedestrians': 0, 'law.delayScale': 0.25, 'evacuation.controle': 2,
      },
    } as Partial<SessionConfig>);
    const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const me = ctx.player.person()!;
    me.x = S.x + 20;
    me.z = S.z - 110;
    t.step(60);
    const members = (): Person[] => core.members.filter((p) => p.custody === 'free' && (core.brain(p)!.flags & CROWD_FLAG.LEAVING) === 0);
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    const roadNear = (x: number, z: number): { x: number; z: number } => (ctx.world.nearestRoad(x, z, rs as never, 60) ? { x: rs.x, z: rs.z } : { x, z });
    const ring = roadNear(S.x + 120, S.z + 40);
    const orage = units.createSection({ x: ring.x, z: ring.z, heading: Math.atan2(S.x - ring.x, S.z - ring.z), callsign: 'ORAGE' }).squad;
    ctx.squads.issue(orage.id, { type: 'encercler', x: S.x, z: S.z, width: R * 2, heading: 0, targetId: ENCIRCLE_CLOSE_ALL, issuedBy: me.id });
    t.step(60);
    const inside0 = members().filter((p) => Math.hypot(p.x - S.x, p.z - S.z) < R);
    expect(inside0.length).toBeGreaterThan(20);
    // un auteur de faits établis dans la nasse
    const culprit = inside0[Math.floor(inside0.length / 2)]!;
    ctx.law.recordOffense(culprit, 'jet_projectile', culprit.x, culprit.z, 2).witnessed = true;
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
    t.step(2);
    const evac = ctx.require<EvacuationsApi>(CROWD_EVACUATIONS);
    expect(evac.list.length).toBe(1);
    // l'auteur retenu à la porte frappe l'agent qui le saisit (résistance à l'interpellation)
    let struck = -1;
    ctx.events.onAny(ARREST_EVENT, (e) => {
      const d = e as { squadId: number; targetId: number; byId: number; stage: string };
      if (struck >= 0 || d.targetId !== culprit.id || (d.stage !== 'sortie' && d.stage !== 'saisie')) return;
      const agent = ctx.people.get(d.byId);
      if (!agent) return;
      struck = ctx.clock.now;
      ctx.health.hurt(agent, { amount: 6, kind: 'blunt', sourceId: culprit.id, x: agent.x, z: agent.z });
    });
    const gas: string[] = [];
    ctx.events.onAny(FORCE_USED_EVENT, (e) => {
      const d = e as { squadId: number; means: string; x: number; z: number };
      if (d.means !== 'lacrymo') return;
      gas.push(`${d.means} à ${Math.hypot(d.x - door!.x, d.z - door!.z).toFixed(0)} m de la porte, t=${ctx.clock.now.toFixed(0)}`);
    });
    let gasOnQueue = 0;
    ctx.events.on('projectile:spawned', (e) => {
      if (e.kind === 'grenade_lacrymo_main' || e.kind === 'grenade_lacrymo_56' || e.kind === 'palet_lacrymo') gasOnQueue++;
    });
    for (let s = 0; s < 240 && (struck < 0 || ctx.clock.now - struck < 30); s++) t.step(1);
    console.log(`[riposte ${seed}] coup porté : ${struck >= 0 ? 'oui' : 'non'} ; lacrymogènes : ${gas.length} (${gas.join(' | ')}) ; projectiles ${gasOnQueue} ; auteur ${culprit.custody}`);
    expect(struck).toBeGreaterThanOrEqual(0);
    expect(gas).toEqual([]);
    expect(gasOnQueue).toBe(0);
  }, 600000);
});
