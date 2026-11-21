// Formations des forces de l'ordre dans le quartier d'essai, avec les vrais modules (monde, personnes, matériel, dangers, droit).
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { fitLine, frontRank, lineAngle, startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI; // cap π : face au nord (z décroissant)

describe('police — ligne de barrage', () => {
  it('une section se met en ligne dans une rue : rang rectiligne, perpendiculaire au cap, de façade à façade', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: NORTH });
    expect(sec.people.length).toBe(16);
    pt.step(1);
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -110, heading: NORTH, width: 0 });
    let placedAt = -1;
    pt.run(30, 0.5, (t) => {
      if (pt.status.of(sec.squad.id)!.phase === 'en_place') {
        placedAt = t;
        return true;
      }
    });
    pt.step(2);
    const info = pt.formation.of(sec.squad.id)!;
    const front = frontRank(pt, sec.squad.id);
    const fit = fitLine(front);
    console.log('section en ligne — en place en', placedAt, 's | premier rang:', front.length, '| front', info.width.toFixed(2), 'm | intervalle',
      info.spacing.toFixed(2), 'm | écart à la droite', fit.error.toFixed(3), 'm | écart max aux emplacements', info.slotErrorMax.toFixed(3),
      '| intervalles réels', fit.gapMin.toFixed(2), '–', fit.gapMax.toFixed(2));
    expect(placedAt).toBeGreaterThan(0);
    expect(info.formation).toBe('ligne');
    // rectiligne : objectif ≤ 0,5 m à l'arrêt
    expect(fit.error).toBeLessThan(0.5);
    expect(info.slotErrorMax).toBeLessThan(0.5);
    // perpendiculaire au cap : la droite est est-ouest
    expect(lineAngle(fit.heading, NORTH + Math.PI / 2)).toBeLessThan(0.06);
    // la rue (14 m entre façades) est barrée : front ≥ 12 m, intervalles réguliers
    expect(info.width).toBeGreaterThan(12);
    expect(info.width).toBeLessThan(14);
    expect(fit.gapMax - fit.gapMin).toBeLessThan(0.5);
    // tous regardent vers le nord
    for (const p of front) expect(Math.abs(Math.cos(p.heading) - Math.cos(NORTH))).toBeLessThan(0.1);
  });

  it('la ligne progresse de 40 m d\'un bloc, à vitesse commune, sans dislocation, puis se réaligne', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -60, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -70, heading: NORTH });
    pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const start = fitLine(frontRank(pt, sec.squad.id));
    const t0 = ctx.clock.now;
    ctx.squads.issue(sec.squad.id, { type: 'avancer', x: 0, z: -110, heading: NORTH });
    // prise en compte de l'ordre : en moins de 1,5 s tout le premier rang est en mouvement
    pt.step(1.5);
    const frontEarly = frontRank(pt, sec.squad.id);
    let movingEarly = 0;
    for (const p of frontEarly) if (Math.hypot(p.vx, p.vz) > 0.3) movingEarly++;
    expect(movingEarly).toBe(frontEarly.length);
    let worstLine = 0;
    let worstSlot = 0;
    let worstSpeedSpread = 0;
    let arrivedAt = -1;
    pt.run(80, 0.25, () => {
      const front = frontRank(pt, sec.squad.id);
      const fit = fitLine(front);
      const info = pt.formation.of(sec.squad.id)!;
      if (info.moving) {
        if (fit.error > worstLine) worstLine = fit.error;
        if (info.slotErrorMax > worstSlot) worstSlot = info.slotErrorMax;
        // vitesse commune : écart entre le plus rapide et le plus lent du rang, une fois lancé
        if (ctx.clock.now - t0 > 3) {
          let lo = Infinity;
          let hi = 0;
          for (const p of front) {
            const v = Math.hypot(p.vx, p.vz);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          if (info.moving && hi - lo > worstSpeedSpread) worstSpeedSpread = hi - lo;
        }
      }
      if (pt.status.of(sec.squad.id)!.phase === 'en_place') {
        arrivedAt = ctx.clock.now - t0;
        return true;
      }
    });
    const end = fitLine(frontRank(pt, sec.squad.id));
    console.log('progression de 40 m — durée', arrivedAt.toFixed(1), 's | pire écart à la droite en marche', worstLine.toFixed(3),
      'm | pire écart aux emplacements', worstSlot.toFixed(3), 'm | écart de vitesse dans le rang', worstSpeedSpread.toFixed(2),
      'm/s | à l\'arrivée', end.error.toFixed(3), 'm');
    // hors contact (aucune foule à 40 m) : pas soutenu à 1,9 m/s — l'ancien « pas cadencé » à 1,2 m/s (> 30 s) faisait
    // marcher les agents à l'allure d'une promenade ; face à une foule, la ligne garde le pas cadencé
    expect(arrivedAt).toBeGreaterThan(18);
    expect(arrivedAt).toBeLessThan(40);
    expect(Math.abs((start.cz - end.cz) - 40)).toBeLessThan(0.6);
    // objectif : ≤ 1 m en marche, ≤ 0,5 m à l'arrêt
    expect(worstLine).toBeLessThan(1);
    expect(worstSlot).toBeLessThan(1);
    expect(end.error).toBeLessThan(0.5);
    expect(lineAngle(end.heading, NORTH + Math.PI / 2)).toBeLessThan(0.06);
  });

  it('compagnie en ligne dans l\'avenue : les sections restent groupées, sans croisement, et la ligne se réaligne après une bousculade', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: -150, z: 0 });
    const { ctx } = pt;
    const WEST = -Math.PI / 2;
    const cie = pt.units.createCompany({ x: -140, z: 0, heading: WEST, vehicles: false });
    ctx.squads.issue(cie.squad.id, { type: 'ligne', x: -160, z: 0, heading: WEST, width: 0 });
    pt.run(60, 0.5, () => pt.status.of(cie.squad.id)!.phase === 'en_place');
    pt.step(2);
    const info = pt.formation.of(cie.squad.id)!;
    const front = frontRank(pt, cie.squad.id);
    const fit = fitLine(front);
    // section de chaque agent du premier rang, de gauche à droite : quatre blocs, jamais entremêlés
    const sectionOf = (p: { squadId: number }): number => ctx.squads.get(p.squadId)!.parentId;
    const runs: number[] = [];
    for (const p of front) if (runs.length === 0 || runs[runs.length - 1] !== sectionOf(p)) runs.push(sectionOf(p));
    console.log('compagnie en ligne — front', info.width.toFixed(1), 'm,', front.length, 'agents au premier rang, intervalle', info.spacing.toFixed(2),
      'm, écart', fit.error.toFixed(3), 'm | sections de gauche à droite :', runs.map((id) => ctx.squads.get(id)!.name).join(', '));
    expect(pt.status.of(cie.squad.id)!.phase).toBe('en_place');
    expect(info.width).toBeGreaterThan(38); // avenue de 40 m entre façades
    expect(info.spacing).toBeLessThanOrEqual(1.21);
    expect(fit.error).toBeLessThan(0.5);
    expect(lineAngle(fit.heading, WEST + Math.PI / 2)).toBeLessThan(0.05);
    expect(runs.length).toBe(4);
    expect(new Set(runs).size).toBe(4);
    // second rang à 2 m derrière le premier, chefs de section plus loin, commandant derrière
    const second = cie.people.filter((p) => p.poste === 'chef_groupe');
    for (const p of second) expect(Math.abs(p.x - (fit.cx + 2))).toBeLessThan(0.4);
    const cdt = cie.leader!;
    expect(cdt.x - fit.cx).toBeGreaterThan(6);

    // nouvelle ligne plus étroite, 12 m en avant : l'ordre latéral des agents restés au premier rang est conservé
    const before = front.map((p) => p.id);
    ctx.squads.issue(cie.squad.id, { type: 'ligne', x: -172, z: 0, heading: WEST, width: 26 });
    pt.run(60, 0.5, () => pt.status.of(cie.squad.id)!.phase === 'en_place');
    pt.step(2);
    const after = frontRank(pt, cie.squad.id).map((p) => p.id);
    const kept = before.filter((id) => after.includes(id));
    const keptAfter = after.filter((id) => before.includes(id));
    expect(kept.length).toBeGreaterThanOrEqual(20);
    expect(keptAfter).toEqual(kept);
    const info2 = pt.formation.of(cie.squad.id)!;
    expect(info2.width).toBeCloseTo(26, 1);
    expect(fitLine(frontRank(pt, cie.squad.id)).error).toBeLessThan(0.5);

    // bousculade : cinq agents du premier rang sont projetés à deux mètres ; la ligne se reforme en quelques secondes
    const line = frontRank(pt, cie.squad.id);
    for (let i = 3; i < line.length; i += 6) {
      line[i].x += 1.6 + (i % 2);
      line[i].z += i % 2 ? 0.8 : -0.8;
    }
    ctx.people.rebuildIndex();
    expect(fitLine(line).error).toBeGreaterThan(1);
    // (les agents projetés se retrouvent derrière le second rang, qui s'ouvre pour les laisser regagner leur place)
    const healTime = pt.run(10, 0.25, () => fitLine(frontRank(pt, cie.squad.id)).error < 0.3);
    pt.step(1.5);
    const healed = fitLine(frontRank(pt, cie.squad.id));
    console.log('réalignement après bousculade — ligne reformée en', healTime.toFixed(1), 's, écart final', healed.error.toFixed(3), 'm');
    expect(healTime).toBeLessThan(6);
    expect(healed.error).toBeLessThan(0.3);
    expect(frontRank(pt, cie.squad.id).map((p) => p.id)).toEqual(line.map((p) => p.id));
  });
});
