// Convergence, nasse et évacuation filtrée : deux cortèges déclarés vers deux destinations différentes (place du
// Châtelet, parvis Notre-Dame) trouvent leurs destinations fermées par des barrages (rues fermées) ; ils s'arrêtent,
// leurs organisateurs parlementent puis se détournent — vers la grande place encore atteignable la plus proche : tous
// deux convergent sur l'esplanade de l'Hôtel-de-Ville. Une section les y encercle (nasse), une autre filtre une
// sortie : les manifestants sortent un par un, contrôlés ; ceux contre qui une infraction est retenue sont
// interpellés par l'unité qui filtre. Ni mort ni écrasement.
import { describe, expect, it } from 'vitest';

import type { Person, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd, CROWD_CORE, CROWD_EVACUATIONS, CROWD_FLAG, CROWD_MANIFS, CROWD_STATE } from '@/sim/crowd';
import type { CrowdCoreApi, EvacuationsApi, ManifsApi, ManifView } from '@/sim/crowd';
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
import { MapScene } from '@/ui/maps/scene';

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, traffic, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
/** Esplanade de l'Hôtel-de-Ville (carte de Paris). */
const S = { x: 2219, z: 994 };

describe('cortèges détournés, convergence, nasse et évacuation filtrée', () => {
  it('deux cortèges convergent sur une même place, sont encerclés puis évacués par une sortie filtrée', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    const { ctx } = t;
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place du Trocadéro', x: -2411, z: 387, crowdSize: 60,
      tension: 0.1, volatility: 0.1, duration: 'courte',
      extra: {
        moyens: MEANS, variante: 'salle', foyers: 0, 'crowd.noAleas': true, 'crowd.static': true, 'traffic.vehicles': 0, 'traffic.pedestrians': 0,
        'manifs.rassemblement': 15, 'manifs.cortege': 5000, 'manifs.vitesse': 2, 'manifestations.compagnies': false, 'law.delayScale': 0.25,
        'evacuation.controle': 2,
        manifestations: [
          { place: 'Place des Vosges', x: 3248, z: 1114, crowdSize: 120, cause: 'climat', destination: 'Place du Châtelet' },
          { place: 'Place de la République', crowdSize: 120, cause: 'logement', destination: 'Parvis Notre-Dame - Place Jean-Paul II' },
        ],
      },
    } as Partial<SessionConfig>);
    const api = ctx.require<ManifsApi>(CROWD_MANIFS);
    const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const [a, b] = [api.list[0]!, api.list[1]!];
    expect(a.to).not.toBe(b.to);
    t.step(1);
    // le commandant ferme les rues autour des deux destinations
    const tr = ctx.require<TrafficControlApi>(EXT.traffic);
    const closed = tr.closeArea(1950, 1000, 200, 0).concat(tr.closeArea(1988, 1365, 120, 0));
    expect(closed.length).toBeGreaterThan(10);
    const arrived = (m: ManifView): boolean => m.detours > 0 && Math.hypot(m.headX - S.x, m.headZ - S.z) < 110 && m.headS > 0;
    let k = 0;
    for (; k < 300 && !(arrived(a) && arrived(b)); k++) t.step(10);
    for (const m of [a, b]) console.log(`[convergence] ${m.label} : ${m.detours} détour(s), vers ${m.to}, tête (${m.headX.toFixed(0)}, ${m.headZ.toFixed(0)}), ${m.people} présents, à ${(k * 10)} s`);
    const detours = ctx.radio.log.filter((m) => m.from === 'CENTRAL' && /se détourne/.test(m.text));
    console.log('[convergence] radio :', detours.map((m) => m.text).join(' | '));
    expect(detours.length).toBeGreaterThanOrEqual(2);
    expect(arrived(a)).toBe(true);
    expect(arrived(b)).toBe(true);
    expect(a.to).toBe(b.to);
    // la carte tactique montre les deux parcours détournés
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    expect(scene.manifs.length).toBe(2);
    expect(scene.manifs.every((m) => m.detours > 0 && m.route.length >= 4)).toBe(true);
    expect(scene.closures.length).toBeGreaterThan(10);
    // les deux cortèges rassemblés sur la place
    t.step(60);
    const members = (): Person[] => core.members.filter((p) => {
      const v = api.manifOf(p.id);
      return v !== null && p.custody === 'free' && (core.brain(p)!.flags & CROWD_FLAG.LEAVING) === 0;
    });
    const onSquare = members().filter((p) => Math.hypot(p.x - S.x, p.z - S.z) < 70);
    console.log(`[convergence] sur la place : ${onSquare.length} (cortège A ${onSquare.filter((p) => api.manifOf(p.id) === a).length}, B ${onSquare.filter((p) => api.manifOf(p.id) === b).length})`);
    expect(onSquare.filter((p) => api.manifOf(p.id) === a).length).toBeGreaterThan(40);
    expect(onSquare.filter((p) => api.manifOf(p.id) === b).length).toBeGreaterThan(40);

    // nasse : une section encercle la place
    const me = ctx.player.person()!;
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    const roadNear = (x: number, z: number): { x: number; z: number } => (ctx.world.nearestRoad(x, z, rs as never, 60) ? { x: rs.x, z: rs.z } : { x, z });
    const ring = roadNear(S.x + 120, S.z + 40);
    const orage = units.createSection({ x: ring.x, z: ring.z, heading: Math.atan2(S.x - ring.x, S.z - ring.z), callsign: 'ORAGE' }).squad;
    const R = 45;
    ctx.squads.issue(orage.id, { type: 'encercler', x: S.x, z: S.z, width: R * 2, heading: 0, targetId: ENCIRCLE_CLOSE_ALL, issuedBy: me.id });
    t.step(60);
    const inside0 = members().filter((p) => Math.hypot(p.x - S.x, p.z - S.z) < R);
    const stranded = inside0.filter((p) => core.brain(p)!.state === CROWD_STATE.STRANDED);
    console.log(`[nasse] ${inside0.length} personnes dans la nasse, ${stranded.length} se savent encerclées ; A encerclée : ${a.kettled}, B : ${b.kettled}`);
    expect(inside0.length).toBeGreaterThan(60);
    expect(a.kettled || b.kettled).toBe(true);
    // quelques auteurs de faits (jets) parmi eux
    const culprits = inside0.slice(0, 4);
    // (vus par les agents de la nasse : faits établis)
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
    const inside1 = members().filter((p) => Math.hypot(p.x - S.x, p.z - S.z) < R).length;
    const reports = ctx.radio.log.filter((m) => m.from === 'FILTRE');
    console.log(`[évacuation] sorties ${ev.out}, interpellations ${ev.arrested}, encore dans la nasse ${inside1} (sur ${inside0.length}) ; actif : ${ev.active}`);
    console.log('[évacuation] radio :', reports.map((m) => m.text).join(' | '));
    console.log('[évacuation] auteurs :', culprits.map((p) => p.custody).join(', '));
    expect(ev.out).toBeGreaterThan(inside0.length * 0.5);
    expect(ev.arrested).toBeGreaterThanOrEqual(1);
    expect(culprits.some((p) => p.custody !== 'free')).toBe(true);
    expect(reports.some((m) => /Évacuation|évacuation/.test(m.text) && /sorties/.test(m.text))).toBe(true);
    expect(dead).toBe(0);
    const crushed = ctx.people.list.filter((p) => p.faction === 'protest' && (p.injury === 'critical' || p.injury === 'dead')).length;
    expect(crushed).toBe(0);
  }, 900000);

  it('le cortège principal se détourne devant une rue fermée sur son parcours', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: [world, roles, people, vehicles, crowd, items, props, hazards, traffic, law, radio] });
    const { ctx } = t;
    await t.start({
      mode: 'libre', role: 'journaliste', place: 'Place de la République', x: 3123, z: -208, crowdSize: 200, tension: 0.1, volatility: 0.1,
      duration: 'courte', extra: { foyers: 0, 'crowd.noAleas': true, 'crowd.present': 1, 'traffic.vehicles': 0, 'traffic.pedestrians': 0 },
    } as Partial<SessionConfig>);
    const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const route0 = ctx.director.route.slice();
    // une rue fermée sur le parcours, à 160 m devant la tête
    const at = core.formation.headS + 160;
    const rp = { x: 0, z: 0, tx: 0, tz: 1, center: 0, half: 8, stretch: 1 };
    core.routePoint(at, rp);
    const tr = ctx.require<TrafficControlApi>(EXT.traffic);
    expect(tr.closeRoad(rp.x, rp.z, 0)).not.toBeNull();
    let detoured = false;
    for (let k = 0; k < 90 && !detoured; k++) {
      t.step(10);
      detoured = ctx.radio.log.some((m) => m.from === 'CENTRAL' && /le cortège se détourne|le cortège ne peut plus/.test(m.text));
    }
    const msg = ctx.radio.log.filter((m) => m.from === 'CENTRAL' && /détourne/.test(m.text)).map((m) => m.text);
    console.log('[détour] ', msg.join(' | '), '; tête', core.formation.headS.toFixed(0), 'm ; phase', ctx.director.phase);
    expect(detoured).toBe(true);
    // nouveau parcours : il ne passe plus par la rue fermée
    const route1 = ctx.director.route;
    expect(route1).not.toBe(route0);
    let near = Infinity;
    for (let i = 0; i + 1 < route1.length; i += 2) near = Math.min(near, Math.hypot(route1[i]! - rp.x, route1[i + 1]! - rp.z));
    expect(near).toBeGreaterThan(3);
    // le cortège repart (pas de dispersion pour « parcours coupé »)
    const h = core.formation.headS;
    t.step(90);
    expect(core.formation.headS).toBeGreaterThan(h + 10);
  }, 600000);
});
