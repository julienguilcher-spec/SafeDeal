// Manœuvres : colonne dans les rues, bond offensif, repli face à la foule, tortue, charge, relève.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { fitLine, frontRank, spawnProtesters, startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function able(list: readonly Person[]): Person[] {
  return list.filter((p) => p.vehicleId === 0 && p.posture !== 'down');
}

describe('police — colonne', () => {
  it('une section en colonne par deux traverse deux carrefours sans se disloquer', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH });
    const members = able(sec.people);
    // rue du Pont vers le nord, rue de la Fontaine vers l'est, rue des Peupliers vers le nord
    ctx.squads.issue(sec.squad.id, { type: 'colonne', x: 170, z: -215, heading: NORTH, width: 0 });
    let worstAll = 0;
    let worstGap = 0;
    let worstLength = 0;
    let arrived = -1;
    let turns = 0;
    let lastHeading = NaN;
    const t0 = ctx.clock.now;
    pt.run(400, 0.5, () => {
      const info = pt.formation.of(sec.squad.id)!;
      if (info.moving) {
        if (info.slotErrorAll > worstAll) worstAll = info.slotErrorAll;
        // personne n'est semé : chaque agent a un voisin à moins de 2 m, la colonne garde sa longueur
        let far = 0;
        let length = 0;
        for (const a of members) {
          let best = Infinity;
          for (const b of members) {
            if (a === b) continue;
            const d = Math.hypot(a.x - b.x, a.z - b.z);
            if (d < best) best = d;
            if (d > length) length = d;
          }
          if (best > far) far = best;
        }
        if (far > worstGap) worstGap = far;
        if (length > worstLength) worstLength = length;
        if (!Number.isNaN(lastHeading) && Math.abs(Math.atan2(Math.sin(info.heading - lastHeading), Math.cos(info.heading - lastHeading))) > 0.5) turns++;
        lastHeading = info.heading;
      }
      if (pt.status.of(sec.squad.id)!.phase === 'en_place') {
        arrived = ctx.clock.now - t0;
        return true;
      }
    });
    const lead = ctx.people.get(sec.squad.leaderId)!;
    console.log('colonne — arrivée en', arrived.toFixed(0), 's | virages', turns, '| pire écart aux emplacements', worstAll.toFixed(2),
      'm | plus grand vide entre voisins', worstGap.toFixed(2), 'm | longueur maximale', worstLength.toFixed(1), 'm | chef à',
      Math.hypot(lead.x - 170, lead.z + 215).toFixed(1), 'm du but');
    expect(arrived).toBeGreaterThan(0);
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(Math.hypot(lead.x - 170, lead.z + 215)).toBeLessThan(2);
    expect(worstAll).toBeLessThan(1.6);
    expect(worstGap).toBeLessThan(2.0);
    // 15 agents derrière le chef, par deux : 8 rangs de 1,2 m ≈ 9,6 m
    expect(worstLength).toBeLessThan(13);
    // personne dans un mur
    for (const p of members) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
  });
});

describe('police — bond offensif, charge, repli, tortue', () => {
  it('bond offensif : ruée de 15 à 25 m au trot, arrêt net, réalignement', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -40, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -50, heading: NORTH });
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const before = fitLine(frontRank(pt, sec.squad.id));
    const t0 = ctx.clock.now;
    ctx.squads.issue(sec.squad.id, { type: 'bond_offensif', x: 0, z: -72, heading: NORTH });
    let top = 0;
    let worst = 0;
    let done = -1;
    pt.run(40, 0.1, () => {
      const front = frontRank(pt, sec.squad.id);
      for (const p of front) top = Math.max(top, Math.hypot(p.vx, p.vz));
      const info = pt.formation.of(sec.squad.id)!;
      if (info.moving) worst = Math.max(worst, fitLine(front).error);
      const st = pt.status.of(sec.squad.id)!;
      if (st.phase === 'en_place' && ctx.clock.now - t0 > 3) {
        done = ctx.clock.now - t0;
        return true;
      }
    });
    const after = fitLine(frontRank(pt, sec.squad.id));
    const advance = before.cz - after.cz;
    console.log('bond offensif — avance', advance.toFixed(1), 'm en', done.toFixed(1), 's | vitesse de pointe', top.toFixed(2),
      'm/s | pire écart en marche', worst.toFixed(3), 'm | après réalignement', after.error.toFixed(3), 'm');
    expect(advance).toBeGreaterThan(15);
    expect(advance).toBeLessThan(25.5);
    expect(top).toBeGreaterThan(1.9); // au trot (2,3 m/s), pas au pas
    expect(top).toBeLessThan(3.4);
    expect(worst).toBeLessThan(1);
    expect(after.error).toBeLessThan(0.5);
    expect(done).toBeLessThan(25);
    // compte rendu radio à la réception et à l'exécution
    const log = ctx.radio.log.map((m) => m.text);
    expect(log.some((m) => m.includes('REÇU') && m.includes('bond offensif'))).toBe(true);
    expect(log.some((m) => m.includes('Bond effectué'))).toBe(true);
  });

  it('repli : la ligne recule en ordre, face à la foule', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    spawnProtesters(ctx, 40, 0, -118, 0, 'pacifique', 1.1, 10); // foule au nord, tournée vers la ligne
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const before = fitLine(frontRank(pt, sec.squad.id));
    ctx.squads.issue(sec.squad.id, { type: 'repli', x: 0, z: -75, heading: NORTH });
    let worst = 0;
    let turned = 0;
    let top = 0;
    const t0 = ctx.clock.now;
    let done = -1;
    pt.run(80, 0.25, () => {
      const front = frontRank(pt, sec.squad.id);
      const info = pt.formation.of(sec.squad.id)!;
      if (info.moving) {
        worst = Math.max(worst, fitLine(front).error);
        for (const p of front) {
          // le corps reste tourné vers le nord (la foule) pendant le recul
          const off = Math.abs(Math.atan2(Math.sin(p.heading - NORTH), Math.cos(p.heading - NORTH)));
          if (off > turned) turned = off;
          top = Math.max(top, Math.hypot(p.vx, p.vz));
        }
      }
      if (pt.status.of(sec.squad.id)!.phase === 'en_place' && ctx.clock.now - t0 > 3) {
        done = ctx.clock.now - t0;
        return true;
      }
    });
    const after = fitLine(frontRank(pt, sec.squad.id));
    console.log('repli — recul de', (after.cz - before.cz).toFixed(1), 'm en', done.toFixed(1), 's | pire écart', worst.toFixed(3),
      'm | rotation maximale du corps', (turned * 57.3).toFixed(0), '° | vitesse de pointe', top.toFixed(2), 'm/s');
    expect(after.cz - before.cz).toBeGreaterThan(24);
    expect(after.cz - before.cz).toBeLessThan(26);
    expect(worst).toBeLessThan(1);
    expect(turned).toBeLessThan(0.5);
    expect(top).toBeLessThan(1.75); // recul au pas (0,9 m/s, rattrapage borné à 1,6), pas une fuite
    expect(after.error).toBeLessThan(0.5);
  });

  it('tortue : deux rangs serrés, boucliers levés, tout le monde accroupi', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'tortue', x: 0, z: -60, heading: NORTH });
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    pt.step(2);
    const info = pt.formation.of(sec.squad.id)!;
    const members = able(sec.people);
    let raised = 0;
    let shields = 0;
    let crouched = 0;
    for (const p of members) {
      const s = p.active >= 0 ? p.inventory[p.active] : undefined;
      if (p.inventory.some((i) => i.id === 'bouclier')) {
        shields++;
        if (s && s.id === 'bouclier' && p.alt) raised++;
      }
      if (p.posture === 'crouch') crouched++;
    }
    let spread = 0;
    for (const a of members) for (const b of members) spread = Math.max(spread, Math.hypot(a.x - b.x, a.z - b.z));
    console.log('tortue — boucliers levés', raised, '/', shields, '| accroupis', crouched, '/', members.length, '| encombrement', spread.toFixed(1), 'm | intervalle', info.spacing.toFixed(2));
    expect(info.formation).toBe('tortue');
    expect(raised).toBe(shields);
    expect(crouched).toBe(members.length);
    expect(spread).toBeLessThan(5);
    // en tortue, la progression se fait à 0,6 m/s
    ctx.squads.issue(sec.squad.id, { type: 'avancer', x: 0, z: -72, heading: NORTH });
    let top = 0;
    pt.run(40, 0.25, () => {
      for (const p of members) top = Math.max(top, Math.hypot(p.vx, p.vz));
      return pt.status.of(sec.squad.id)!.phase === 'en_place' && !pt.formation.of(sec.squad.id)!.moving && top > 0.2;
    });
    expect(top).toBeLessThan(1.2); // 0,6 m/s, rattrapage compris
    expect(pt.formation.of(sec.squad.id)!.formation).toBe('tortue');
  });

  it('charge : course jusqu\'à la limite, sifflet, arrêt, retour au pas sur la ligne de départ', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -30, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -40, heading: NORTH });
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const before = fitLine(frontRank(pt, sec.squad.id));
    let whistle = 0;
    ctx.events.on('sfx', (e) => {
      if (e.id === 'sifflet') whistle++;
    });
    ctx.squads.issue(sec.squad.id, { type: 'charge', x: 0, z: -80, heading: NORTH });
    let top = 0;
    let far = 0;
    pt.run(90, 0.25, () => {
      const front = frontRank(pt, sec.squad.id);
      for (const p of front) top = Math.max(top, Math.hypot(p.vx, p.vz));
      far = Math.max(far, before.cz - fitLine(front).cz);
      return pt.status.of(sec.squad.id)!.phase === 'en_place' && whistle > 0;
    });
    const after = fitLine(frontRank(pt, sec.squad.id));
    console.log('charge — portée', far.toFixed(1), 'm | vitesse de pointe', top.toFixed(2), 'm/s | sifflet', whistle, '| retour à', Math.abs(after.cz - before.cz).toFixed(2), 'm du départ');
    expect(whistle).toBe(1);
    expect(far).toBeGreaterThan(30);
    expect(far).toBeLessThan(61);
    expect(top).toBeGreaterThan(3);
    expect(Math.abs(after.cz - before.cz)).toBeLessThan(0.6);
    expect(after.error).toBeLessThan(0.5);
    // une charge reste un contact : aucun emploi de force au-dessus du niveau licite n'est inscrit
    expect(ctx.law.forceLog.filter((r) => r.verdict.kind !== 'licite').length).toBe(0);
  });
});
