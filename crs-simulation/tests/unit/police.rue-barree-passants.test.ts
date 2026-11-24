// Barrage de rue, option « Passants : laissés passer » (targetId = BARRAGE_LET_PASSERSBY) : les passants à pied franchissent
// la ligne dans les deux sens, entre deux agents ; les manifestants (même dispersés, même sans pancarte) restent
// bloqués ; personne n'est blessé et la ligne ne s'ouvre jamais plus large qu'une personne. L'option se change sur une
// unité en place sans qu'elle bouge ; elle survit à la reformation de la ligne ; défaut : personne ne passe.
// Quartier d'essai : rue du Pont (14 m entre façades, axe x = 0).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { CordonsApi, TrafficControlApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as traffic } from '@/sim/traffic';
import { BARRAGE_LET_PASSERSBY, ENCIRCLE_CLOSE_ALL, POLICE_BARRAGES_SERVICE, POLICE_FORMATION_SERVICE } from '@/sim/police/api';
import type { BarragesApi, PoliceFormationApi } from '@/sim/police/api';
import { isPasserby } from '@/sim/police/barrages';
import { CORDON_GAP } from '@/sim/police/tuning';
import { footAround, pathCrossesCordon } from '@/sim/crowd/detour';
import { startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law, traffic];
const CONFIG = { mode: 'test' as const, x: 0, z: 0, extra: { 'traffic.vehicles': 0, 'traffic.pedestrians': 0 } };
const LINE_Z = -100;

function walk(list: readonly Person[], goal: (p: Person, i: number) => { x: number; z: number }, run = false): void {
  list.forEach((p, i) => {
    const g = goal(p, i);
    const dx = g.x - p.x;
    const dz = g.z - p.z;
    const l = Math.hypot(dx, dz);
    p.cmd.moveX = l > 0.3 ? dx / l : 0;
    p.cmd.moveZ = l > 0.3 ? dz / l : 0;
    p.cmd.gait = run ? 1 : 0;
    p.cmd.faceMove = true;
  });
}

function barrageOf(pt: PoliceTest, squadId: number) {
  return pt.ctx.require<BarragesApi>(POLICE_BARRAGES_SERVICE).list.find((b) => b.squadId === squadId);
}

/** Plus grand intervalle entre deux agents voisins du premier rang (m). */
function widestGap(pt: PoliceTest, squadId: number): number {
  const f = pt.ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE).of(squadId);
  if (!f) return Infinity;
  let worst = 0;
  for (let i = 1; i < f.front.length; i++) {
    const a = pt.ctx.people.get(f.front[i - 1]!)!;
    const b = pt.ctx.people.get(f.front[i]!)!;
    worst = Math.max(worst, Math.hypot(a.x - b.x, a.z - b.z));
  }
  return worst;
}

async function barrage(passersby: boolean, type: 'couper_circulation' | 'tenir' = 'couper_circulation') {
  const pt = await startPolice(MODULES, CONFIG);
  const sec = pt.units.createSection({ x: 0, z: -80, heading: Math.PI, vehicles: false, callsign: 'MISTRAL 1' });
  pt.ctx.squads.issue(sec.squad.id, { type, x: 0, z: LINE_Z, heading: Math.PI, width: 0, targetId: passersby ? BARRAGE_LET_PASSERSBY : 0 });
  pt.run(120, 1, () => barrageOf(pt, sec.squad.id)?.state === 'en_place');
  expect(barrageOf(pt, sec.squad.id)?.state).toBe('en_place');
  return { pt, sec };
}

describe('police — rue barrée : passants bloqués ou laissés passer', () => {
  it('règle du passant : civils, presse et street medics à pied ; jamais un manifestant, même dispersé', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    const mk = (kind: Person['kind'], faction?: Person['faction']) => ctx.people.spawn({ kind, x: 0, z: -40, ...(faction ? { faction } : {}) });
    expect(isPasserby(mk('passant'))).toBe(true);
    expect(isPasserby(mk('touriste'))).toBe(true);
    expect(isPasserby(mk('commercant'))).toBe(true);
    expect(isPasserby(mk('journaliste'))).toBe(true);
    expect(isPasserby(mk('street_medic'))).toBe(true);
    expect(isPasserby(mk('observateur'))).toBe(true);
    // manifestant : faction « protest », qu'il défile ou s'en aille ; ni le déguisé en civil
    expect(isPasserby(mk('manifestant'))).toBe(false);
    expect(isPasserby(mk('manifestant', 'civil'))).toBe(false);
    expect(isPasserby(mk('passant', 'protest'))).toBe(false);
    expect(isPasserby(mk('crs'))).toBe(false);
    const held = mk('passant');
    held.custody = 'cuffed';
    expect(isPasserby(held)).toBe(false);
  }, 120000);

  it('« laissés passer » : les passants franchissent la ligne dans les deux sens, aucun manifestant, aucun blessé, pas de trou', async () => {
    const { pt, sec } = await barrage(true);
    const { ctx } = pt;
    const b = barrageOf(pt, sec.squad.id)!;
    expect(b.passersby).toBe(true);
    expect(b.covered).toBeGreaterThanOrEqual(0.95);
    // la rue reste fermée aux véhicules
    expect(ctx.require<TrafficControlApi>(EXT.traffic).isClosed(b.edgeId)).toBe(true);
    // 30 manifestants au nord veulent passer : ils se massent contre la moitié ouest de la ligne ; 8 passants de chaque
    // côté la traversent par la moitié est, juste à côté d'eux
    const crowd: Person[] = [];
    for (let i = 0; i < 30; i++) crowd.push(ctx.people.spawn({ kind: 'manifestant', x: -6 + (i % 6) * 1.0, z: -112 - Math.floor(i / 6) * 1.2 }));
    const north: Person[] = [];
    const south: Person[] = [];
    // chacun tient sa droite : les deux flots ne se croisent pas dans le même intervalle
    const lane = (i: number) => 0.4 + (i % 4) * 0.6;
    for (let i = 0; i < 8; i++) south.push(ctx.people.spawn({ kind: i % 3 === 0 ? 'journaliste' : 'passant', x: lane(i), z: -86 - Math.floor(i / 4) * 2 }));
    for (let i = 0; i < 8; i++) north.push(ctx.people.spawn({ kind: i % 3 === 0 ? 'touriste' : 'passant', x: lane(i) + 2.6, z: -116 - Math.floor(i / 4) * 2 }));
    const passers = north.concat(south);
    let worstGap = 0;
    let protestersAcross = 0;
    let closest = Infinity;
    pt.run(120, 0.5, () => {
      walk(crowd, (p) => ({ x: p.x, z: -40 }));
      walk(south, (p, i) => ({ x: lane(i), z: -150 }));
      walk(north, (p, i) => ({ x: lane(i) + 2.6, z: -60 }));
      worstGap = Math.max(worstGap, widestGap(pt, sec.squad.id));
      // le passant passe ENTRE deux agents, pas à travers l'un d'eux
      for (const p of passers) for (const a of sec.people) closest = Math.min(closest, Math.hypot(p.x - a.x, p.z - a.z));
      protestersAcross = Math.max(protestersAcross, crowd.filter((p) => p.z > LINE_Z + 2.5).length);
      return south.every((p) => p.z < LINE_Z - 4) && north.every((p) => p.z > LINE_Z + 4);
    });
    const crossedS = south.filter((p) => p.z < LINE_Z - 4).length;
    const crossedN = north.filter((p) => p.z > LINE_Z + 4).length;
    const hurt = crowd.concat(passers, sec.people).filter((p) => p.injury !== 'none').length;
    console.log(`passants passés : ${crossedS}/8 vers le nord, ${crossedN}/8 vers le sud en ${ctx.clock.now.toFixed(0)} s ; manifestants passés ${protestersAcross} ; blessés ${hurt} ; plus grand intervalle ${worstGap.toFixed(2)} m ; passant au plus près d'un agent ${closest.toFixed(2)} m`);
    expect(crossedS).toBe(8);
    expect(crossedN).toBe(8);
    expect(protestersAcross).toBe(0);
    expect(hurt).toBe(0);
    // la ligne fait place au passant sans s'ouvrir : jamais un intervalle où passerait un manifestant
    expect(worstGap).toBeLessThanOrEqual(CORDON_GAP);
    expect(closest).toBeGreaterThan(0.4);
    expect(barrageOf(pt, sec.squad.id)?.state).toBe('en_place');
  }, 400000);

  it('« bloqués » (défaut) : aucun passant ne franchit', async () => {
    const { pt, sec } = await barrage(false, 'tenir');
    const { ctx } = pt;
    expect(barrageOf(pt, sec.squad.id)?.passersby).toBe(false);
    const south: Person[] = [];
    for (let i = 0; i < 6; i++) south.push(ctx.people.spawn({ kind: 'passant', x: -5 + i * 2, z: -86 }));
    pt.run(45, 0.5, () => walk(south, (p, i) => ({ x: -5 + i * 2, z: -150 })));
    expect(south.filter((p) => p.z < LINE_Z).length).toBe(0);
  }, 300000);

  it('l’option change sur l’unité en place sans qu’elle bouge ; elle survit à la reformation de la ligne', async () => {
    const { pt, sec } = await barrage(false);
    const { ctx } = pt;
    const f0 = ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE).of(sec.squad.id)!;
    const x0 = f0.x;
    const z0 = f0.z;
    const closures0 = ctx.require<TrafficControlApi>(EXT.traffic).closures.map((c) => c.id).join(',');
    const before = sec.people.map((p) => ({ x: p.x, z: p.z }));
    // même ordre, redonné avec l'option (le point désigné est à 3 m du premier)
    ctx.squads.issue(sec.squad.id, { type: 'couper_circulation', x: 2, z: LINE_Z - 1, heading: Math.PI, width: 0, targetId: BARRAGE_LET_PASSERSBY });
    pt.step(1);
    let b = barrageOf(pt, sec.squad.id)!;
    expect(b.passersby).toBe(true);
    expect(b.state).toBe('en_place');
    // la rue n'a pas été rouverte puis refermée
    expect(ctx.require<TrafficControlApi>(EXT.traffic).closures.map((c) => c.id).join(',')).toBe(closures0);
    pt.step(4);
    const f1 = ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE).of(sec.squad.id)!;
    expect(Math.hypot(f1.x - x0, f1.z - z0)).toBeLessThan(0.05);
    const moved = Math.max(...sec.people.map((p, i) => Math.hypot(p.x - before[i]!.x, p.z - before[i]!.z)));
    expect(moved).toBeLessThan(0.6);
    console.log(ctx.radio.log.slice(-3).map((m) => m.from + ' : ' + m.text).join('\n'));
    expect(ctx.radio.log.some((m) => /passants/i.test(m.text))).toBe(true);
    // un agent hors de combat : la ligne se reforme, l'option reste
    const victim = sec.people.find((p) => p.poste !== 'chef_section' && p.poste !== 'chef_groupe')!;
    victim.posture = 'down';
    victim.injury = 'serious';
    pt.step(8);
    b = barrageOf(pt, sec.squad.id)!;
    expect(b.passersby).toBe(true);
    const cordons = ctx.require<CordonsApi>(EXT.cordons);
    let admitted = 0;
    for (let i = 0; i < cordons.count; i++) admitted += cordons.admits![i]!;
    expect(admitted).toBe(cordons.count);
    // retour à « bloqués »
    ctx.squads.issue(sec.squad.id, { type: 'couper_circulation', x: 0, z: LINE_Z, heading: Math.PI, width: 0, targetId: 0 });
    pt.step(1);
    expect(barrageOf(pt, sec.squad.id)!.passersby).toBe(false);
  }, 300000);

  it('itinéraire à pied : un passant passe par la rue barrée qui le laisse passer, un manifestant la contourne', async () => {
    const { pt } = await barrage(true);
    const { ctx } = pt;
    const cordons = ctx.require<CordonsApi>(EXT.cordons);
    const direct: number[] = [];
    expect(ctx.world.findPath(0, -60, 0, -140, 'foot', direct)).toBe(true);
    expect(pathCrossesCordon(cordons, direct)).toBe(true);
    expect(pathCrossesCordon(cordons, direct, true)).toBe(false);
    const around: number[] = [];
    expect(footAround(ctx, 0, -60, 0, -140, cordons, around)).toBe(true);
    expect(pathCrossesCordon(cordons, around)).toBe(false);
  }, 300000);

  it('une ligne d’encerclement ne laisse jamais passer les passants, même avec −1 / −2 en targetId', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: Math.PI, vehicles: false });
    ctx.squads.issue(sec.squad.id, { type: 'encercler', x: 0, z: -130, width: 40, heading: 0, targetId: ENCIRCLE_CLOSE_ALL });
    pt.step(60);
    expect(barrageOf(pt, sec.squad.id)).toBeUndefined();
    const cordons = ctx.require<CordonsApi>(EXT.cordons);
    for (let i = 0; i < cordons.count; i++) expect(cordons.admits![i]).toBe(0);
    ctx.squads.issue(sec.squad.id, { type: 'encercler', x: 0, z: -130, width: 40, heading: 0, targetId: BARRAGE_LET_PASSERSBY });
    pt.step(30);
    for (let i = 0; i < cordons.count; i++) expect(cordons.admits![i]).toBe(0);
  }, 300000);
});
