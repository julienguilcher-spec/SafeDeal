// Exécution des autres ordres : relève, véhicules, refoulement, protection, escorte, suivi, barrages de rue, gaz sur ordre, obstacle.
import { describe, expect, it } from 'vitest';
import type { ForceReport, Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { fitLine, frontRank, spawnProtesters, startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function able(list: readonly Person[]): Person[] {
  return list.filter((p) => p.vehicleId === 0 && p.posture !== 'down');
}

describe('police — relève, véhicules', () => {
  it('relève : la section fraîche s\'aligne derrière, la section relevée se replie, la relève prend la position', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const old = pt.units.createSection({ x: 0, z: -95, heading: NORTH, layout: 'ligne', callsign: 'MISTRAL 1' });
    const fresh = pt.units.createSection({ x: 0, z: -60, heading: NORTH, callsign: 'MISTRAL 3' });
    ctx.squads.issue(old.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    pt.run(30, 0.5, () => pt.status.of(old.squad.id)!.phase === 'en_place');
    ctx.squads.issue(fresh.squad.id, { type: 'releve', targetId: old.squad.leaderId, x: 0, z: -100 });
    let done = false;
    ctx.events.onAny('police:order_done', (e) => {
      const d = e as { squadId: number; type: string; ok: boolean };
      if (d.type === 'releve' && d.squadId === fresh.squad.id) done = d.ok;
    });
    const t0 = ctx.clock.now;
    pt.run(150, 1, () => done);
    pt.step(5);
    const line = fitLine(frontRank(pt, fresh.squad.id));
    const back = fitLine(frontRank(pt, old.squad.id));
    console.log('relève — faite en', (ctx.clock.now - t0).toFixed(0), 's | la relève tient z =', line.cz.toFixed(1), '(écart', line.error.toFixed(3),
      'm) | la section relevée est à z =', back.cz.toFixed(1), '| ordre de la section relevée :', old.squad.order.type);
    expect(done).toBe(true);
    expect(Math.abs(line.cz + 100)).toBeLessThan(0.5);
    expect(line.error).toBeLessThan(0.5);
    expect(old.squad.order.type).toBe('repli');
    expect(back.cz).toBeGreaterThan(-80);
    expect(ctx.radio.log.some((m) => m.text.includes('Relève effectuée'))).toBe(true);
  });

  it('débarquement des fourgons et mise en ligne, puis rembarquement', async () => {
    const pt = await startPolice([...MODULES, vehicles], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'embarque', vehicles: true });
    expect(sec.people.length).toBe(19);
    const aboard0 = sec.people.filter((p) => p.vehicleId !== 0).length;
    expect(aboard0).toBeGreaterThanOrEqual(18);
    expect(pt.status.of(sec.squad.id)!.phase).toBe('embarque');
    ctx.squads.issue(sec.squad.id, { type: 'debarquer', x: 0, z: -100, heading: NORTH });
    const t0 = ctx.clock.now;
    let out = -1;
    let placed = -1;
    pt.run(90, 0.5, () => {
      const on = sec.people.filter((p) => p.vehicleId !== 0 && p.poste !== 'conducteur').length;
      if (on === 0 && out < 0) out = ctx.clock.now - t0;
      if (pt.status.of(sec.squad.id)!.phase === 'en_place') {
        placed = ctx.clock.now - t0;
        return true;
      }
    });
    const fit = fitLine(frontRank(pt, sec.squad.id));
    console.log('débarquement — tous dehors en', out.toFixed(1), 's, en ligne en', placed.toFixed(1), 's | écart', fit.error.toFixed(3), 'm');
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(12); // un groupe dehors en 10 s
    expect(placed).toBeGreaterThan(0);
    expect(fit.error).toBeLessThan(0.5);
    expect(sec.people.filter((p) => p.poste === 'conducteur').every((p) => p.vehicleId !== 0)).toBe(true);
    // rembarquement
    ctx.squads.issue(sec.squad.id, { type: 'embarquer' });
    pt.run(120, 1, () => pt.status.of(sec.squad.id)!.phase === 'embarque');
    const aboard = sec.people.filter((p) => p.vehicleId !== 0).length;
    console.log('embarquement —', aboard, 'à bord sur', sec.people.length);
    expect(pt.status.of(sec.squad.id)!.phase).toBe('embarque');
    expect(aboard).toBe(aboard0);
  });
});

describe('police — refoulement, protection, escorte, suivi, barrages', () => {
  it('vague de refoulement : au pas, par tronçons, boucliers levés', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -30, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -40, heading: NORTH });
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    ctx.squads.issue(sec.squad.id, { type: 'refoulement', x: 0, z: -110, heading: NORTH });
    let top = 0;
    let worst = 0;
    let raisedWhileMoving = 0;
    let paused = false;
    const t0 = ctx.clock.now;
    pt.run(140, 0.5, () => {
      const front = frontRank(pt, sec.squad.id);
      const info = pt.formation.of(sec.squad.id)!;
      const st = pt.status.of(sec.squad.id)!;
      if (info.moving) {
        for (const p of front) top = Math.max(top, Math.hypot(p.vx, p.vz));
        worst = Math.max(worst, fitLine(front).error);
        raisedWhileMoving = Math.max(raisedWhileMoving, front.filter((p) => p.alt && p.active >= 0 && p.inventory[p.active].id === 'bouclier').length);
      } else if (st.phase === 'action') paused = true;
      return st.phase === 'en_place' && ctx.clock.now - t0 > 20;
    });
    const fit = fitLine(frontRank(pt, sec.squad.id));
    console.log('refoulement — ligne à z =', fit.cz.toFixed(1), 'en', (ctx.clock.now - t0).toFixed(0), 's | vitesse de pointe', top.toFixed(2), 'm/s | pire écart', worst.toFixed(3),
      '| boucliers levés en marche', raisedWhileMoving, '| arrêt entre deux tronçons', paused);
    expect(Math.abs(fit.cz + 110)).toBeLessThan(0.6);
    expect(top).toBeLessThan(2.1);
    expect(worst).toBeLessThan(1);
    expect(raisedWhileMoving).toBeGreaterThanOrEqual(5);
    expect(paused).toBe(true); // 70 m : un tronçon de 50 m, un arrêt, puis 20 m
  });

  it('protéger : écran de boucliers autour de la cible, tourné vers le côté menacé, qui la suit', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: -120, z: 5, heading: Math.PI / 2 });
    const medic = ctx.people.spawn({ kind: 'samu', x: -100, z: 5 });
    ctx.squads.issue(sec.squad.id, { type: 'proteger', targetId: medic.id, heading: Math.PI / 2 });
    pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const front = frontRank(pt, sec.squad.id);
    let outward = 0;
    let dmin = Infinity;
    let dmax = 0;
    for (const p of front) {
      const d = Math.hypot(p.x - medic.x, p.z - medic.z);
      dmin = Math.min(dmin, d);
      dmax = Math.max(dmax, d);
      // chaque bouclier regarde vers l'extérieur
      if (Math.sin(p.heading) * (p.x - medic.x) + Math.cos(p.heading) * (p.z - medic.z) > 0.8 * d) outward++;
    }
    const east = front.filter((p) => p.x > medic.x).length;
    console.log('protéger —', front.length, 'boucliers à', dmin.toFixed(1), '–', dmax.toFixed(1), 'm de la cible,', outward, 'tournés vers l\'extérieur,', east, 'du côté menacé');
    expect(front.length).toBeGreaterThanOrEqual(5);
    expect(dmax - dmin).toBeLessThan(0.6);
    expect(outward).toBe(front.length);
    expect(east).toBeGreaterThan(front.length / 2);
    // la cible se déplace : l'écran suit
    medic.cmd.moveX = 1;
    medic.cmd.gait = 0;
    pt.step(12);
    medic.cmd.moveX = 0;
    pt.step(8);
    const after = frontRank(pt, sec.squad.id);
    for (const p of after) expect(Math.abs(Math.hypot(p.x - medic.x, p.z - medic.z) - dmin)).toBeLessThan(1.2);
    expect(medic.x).toBeGreaterThan(-90);
  });

  it('suivre et escorter : la colonne marche sur la trace de la cible ; l\'escorte l\'encadre', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: -140, z: 6, heading: Math.PI / 2 });
    const guide = ctx.people.spawn({ kind: 'crs', x: -125, z: 6, heading: Math.PI / 2 });
    ctx.squads.issue(sec.squad.id, { type: 'suivre', targetId: guide.id });
    guide.cmd.moveX = 0.85;
    guide.cmd.gait = 0;
    pt.step(40);
    guide.cmd.moveX = 0;
    pt.step(8);
    const members = able(sec.people);
    let far = 0;
    for (const p of members) far = Math.max(far, Math.hypot(p.x - guide.x, p.z - guide.z));
    const lead = ctx.people.get(sec.squad.leaderId)!;
    console.log('suivre — guide à x =', guide.x.toFixed(1), '| chef à', Math.hypot(lead.x - guide.x, lead.z - guide.z).toFixed(1), 'm | dernier à', far.toFixed(1), 'm');
    expect(guide.x).toBeGreaterThan(-90);
    expect(Math.hypot(lead.x - guide.x, lead.z - guide.z)).toBeLessThan(4.5);
    expect(far).toBeLessThan(16);
    expect(pt.formation.of(sec.squad.id)!.formation).toBe('colonne');
    // escorte
    ctx.squads.issue(sec.squad.id, { type: 'escorter', targetId: guide.id });
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    guide.cmd.moveX = 0.8;
    pt.step(20);
    guide.cmd.moveX = 0;
    pt.step(6);
    const front = frontRank(pt, sec.squad.id);
    let ahead = 0;
    for (const p of front) if (p.x > guide.x + 1) ahead++;
    let around = 0;
    for (const p of members) if (Math.hypot(p.x - guide.x, p.z - guide.z) < 9) around++;
    console.log('escorter —', ahead, 'boucliers devant,', around, 'agents à moins de 9 m');
    expect(pt.formation.of(sec.squad.id)!.formation).toBe('escorte');
    expect(ahead).toBe(front.length);
    expect(around).toBe(members.length);
  });

  it('couper la circulation et filtrer : barrage en travers de la voie la plus proche, porte au milieu du barrage filtrant', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 170, z: -100, heading: NORTH });
    // point désigné à côté de l'axe, cap approximatif : le barrage se cale sur la rue des Peupliers (10 m entre façades)
    ctx.squads.issue(sec.squad.id, { type: 'couper_circulation', x: 172, z: -125, heading: NORTH + 0.3 });
    pt.run(60, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    let info = pt.formation.of(sec.squad.id)!;
    const fit = fitLine(frontRank(pt, sec.squad.id));
    console.log('couper — barrage en', info.x.toFixed(1), info.z.toFixed(1), 'front', info.width.toFixed(1), 'm | écart', fit.error.toFixed(3));
    expect(pt.status.of(sec.squad.id)!.phase).toBe('en_place');
    expect(Math.abs(info.x - 170)).toBeLessThan(0.6);
    expect(Math.abs(Math.cos(info.heading) - Math.cos(NORTH))).toBeLessThan(0.02);
    expect(info.width).toBeGreaterThan(8.5);
    expect(info.width).toBeLessThan(10);
    expect(fit.error).toBeLessThan(0.5);
    expect(ctx.radio.log.some((m) => m.text.includes('Circulation coupée'))).toBe(true);
    // barrage filtrant : même ligne, avec une porte de 2 m au milieu
    ctx.squads.issue(sec.squad.id, { type: 'filtrer', x: 170, z: -125, heading: NORTH });
    pt.run(60, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    pt.step(2);
    info = pt.formation.of(sec.squad.id)!;
    const front = frontRank(pt, sec.squad.id);
    const xs = front.map((p) => p.x).sort((a, b) => a - b);
    let door = 0;
    for (let i = 1; i < xs.length; i++) door = Math.max(door, xs[i] - xs[i - 1]);
    console.log('filtrer — porte de', door.toFixed(2), 'm entre deux agents du premier rang');
    expect(door).toBeGreaterThan(2.0);
    expect(door).toBeLessThan(3.4);
  });
});

describe('police — gaz sur ordre, obstacle', () => {
  it('« disperser_gaz » est refusé sans cadre légal, exécuté après les sommations du commandant', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100, extra: { 'law.delayScale': 0.05, 'law.attroupement': true } });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -80, heading: NORTH, sections: 1, vehicles: false });
    ctx.squads.issue(cie.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    const crowd = spawnProtesters(ctx, 40, 0, -125, 0, 'militant', 1.2, 10);
    pt.run(40, 0.5, () => pt.status.of(cie.squad.id)!.phase === 'en_place');
    // 1. aucun cadre : l'unité refuse, rien n'est tiré
    let refused = 0;
    ctx.events.onAny('police:order_refused', () => refused++);
    const shots: string[] = [];
    ctx.events.on('projectile:spawned', (e) => {
      const o = ctx.people.get(e.ownerId);
      if (o && o.faction === 'police' && e.kind !== 'palet_lacrymo') shots.push(e.kind);
    });
    ctx.squads.issue(cie.squad.id, { type: 'disperser_gaz', x: 0, z: -125, maxForce: 3 });
    pt.step(8);
    expect(refused).toBe(1);
    expect(shots.length).toBe(0);
    expect(ctx.radio.log.some((m) => m.text.includes('NÉGATIF') && m.text.includes('sommations'))).toBe(true);
    expect(cie.squad.order.type).toBe('ligne'); // l'ordre de formation est rétabli
    // 2. le commandant (écharpe, mégaphone) fait l'annonce et les deux sommations
    const cdt = cie.leader!;
    for (let i = 0; i < 3; i++) {
      const stage = ctx.law.sommation(cdt);
      expect(stage).toBe(i + 1);
      pt.step(3);
    }
    pt.step(4);
    expect(ctx.law.roe.lawfulForce).toBeGreaterThanOrEqual(3);
    let ok: boolean | null = null;
    ctx.events.onAny('police:order_done', (e) => {
      const d = e as { type: string; ok: boolean };
      if (d.type === 'disperser_gaz') ok = d.ok;
    });
    ctx.squads.issue(cie.squad.id, { type: 'disperser_gaz', x: 0, z: -125, maxForce: 3 });
    pt.run(60, 1, () => ok !== null);
    const log = ctx.law.forceLog as readonly ForceReport[];
    console.log('gaz sur ordre — tirs :', shots.join(', '), '| journal :', log.map((r) => `${r.means}:${r.verdict.kind}`).join(' '), '| fait :', ok);
    expect(shots.length).toBeGreaterThan(0);
    // après deux sommations sans réitération : grenades à main seulement, toutes licites
    expect(shots.every((s) => s === 'grenade_lacrymo_main')).toBe(true);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((r) => r.verdict.kind === 'licite')).toBe(true);
    expect(crowd.some((p) => p.gas > 0.1)).toBe(true);
  });

  it('« degager_barricade » : une équipe enlève l\'obstacle désigné à la main', async () => {
    const pt = await startPolice([...MODULES, props], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const debris = ctx.props.spawn('debris', 1, -109, 0);
    let ok: boolean | null = null;
    ctx.events.onAny('police:order_done', (e) => {
      const d = e as { type: string; ok: boolean };
      if (d.type === 'degager_barricade') ok = d.ok;
    });
    ctx.squads.issue(sec.squad.id, { type: 'degager_barricade', targetId: debris.id, x: 1, z: -109 });
    pt.run(60, 0.5, () => ok !== null);
    console.log('dégager — fait :', ok, '| objet encore là :', ctx.props.get(debris.id) !== undefined);
    expect(ok).toBe(true);
    expect(ctx.props.get(debris.id)).toBeUndefined();
    pt.step(15);
    expect(pt.status.of(sec.squad.id)!.detached).toBe(0);
  });
});
