// Allures des unités selon l'urgence de l'ordre : pas soutenu en routine, trot vers un point éloigné, course sur un
// mouvement urgent et à la charge, pas cadencé face à la foule ; le souffle borne la course.
// Avant ce réglage, une section mettait 140 s pour se porter en colonne à 150 m (1,2 m/s, « au pas »).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import type { PeopleLocomotionApi } from '@/sim/people';
import { unitOf } from '@/sim/police/brain';
import { fitLine, frontRank, spawnProtesters, startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length > 0 ? s[Math.floor(s.length / 2)]! : 0;
}

/** Section en ligne dans la rue du Pont (axe x = 0), face au nord, prête à recevoir un ordre. */
async function section(z: number): Promise<{ pt: PoliceTest; sec: ReturnType<PoliceTest['units']['createSection']>; members: Person[] }> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
  const sec = pt.units.createSection({ x: 0, z, heading: NORTH, layout: 'ligne' });
  pt.ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: z - 2, heading: NORTH });
  pt.run(30, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
  return { pt, sec, members: sec.people.filter((p) => p.vehicleId === 0) };
}

/** Colonne vers un point à 150 m : durée jusqu'au compte rendu, vitesse médiane en marche, souffle à l'arrivée. */
async function column150(urgent: boolean): Promise<{ time: number; speed: number; stamina: number; leader: number }> {
  const { pt, sec, members } = await section(-60);
  const { ctx } = pt;
  if (urgent) unitOf(ctx.squads.get(sec.squad.id))!.trotUntil = ctx.clock.now + 200; // appui d'une unité prise à partie
  const t0 = ctx.clock.now;
  ctx.squads.issue(sec.squad.id, { type: 'colonne', x: 0, z: -210, heading: NORTH, width: 0 });
  const speeds: number[] = [];
  let time = -1;
  pt.run(150, 0.25, () => {
    if (pt.formation.of(sec.squad.id)?.moving) speeds.push(median(members.map((p) => Math.hypot(p.vx, p.vz))));
    if (pt.status.of(sec.squad.id)!.phase === 'en_place' && ctx.clock.now - t0 > 3) {
      time = ctx.clock.now - t0;
      return true;
    }
  });
  const lead = ctx.people.get(sec.squad.leaderId)!;
  const stamina = members.reduce((s, p) => s + p.stamina, 0) / members.length;
  return { time, speed: speeds.reduce((s, v) => s + v, 0) / Math.max(1, speeds.length), stamina, leader: Math.hypot(lead.x, lead.z + 210) };
}

describe('police — allures selon l\'urgence', () => {
  it('les limites d\'allure d\'un porteur de bouclier en tenue sont réalistes', async () => {
    const { pt, sec } = await section(-60);
    const loco = pt.ctx.require<PeopleLocomotionApi>('people.locomotion');
    const shield = sec.people.find((p) => p.inventory.some((i) => i.id === 'bouclier'))!;
    const lim = [0, 1, 2].map((g) => loco.speedLimit(shield, g as 0 | 1 | 2));
    console.log('porteur de bouclier —', loco.loadOf(shield).toFixed(1), 'kg | marche / trot / course', lim.map((v) => v.toFixed(2)).join(' / '), 'm/s');
    expect(lim[0]).toBeGreaterThan(1.1);
    expect(lim[0]).toBeLessThan(1.5);
    expect(lim[1]).toBeGreaterThan(2.6);
    expect(lim[1]).toBeLessThan(3.3);
    expect(lim[2]).toBeGreaterThan(4.2);
    expect(lim[2]).toBeLessThan(5.5);
  });

  it('colonne vers un point à 150 m : au trot, arrivée bien avant 90 s ; sur un mouvement urgent, plus vite encore', async () => {
    const routine = await column150(false);
    const urgent = await column150(true);
    console.log('colonne 150 m — routine', routine.time.toFixed(1), 's à', routine.speed.toFixed(2), 'm/s (souffle', routine.stamina.toFixed(0),
      ') | urgente', urgent.time.toFixed(1), 's à', urgent.speed.toFixed(2), 'm/s (souffle', urgent.stamina.toFixed(0), ')');
    expect(routine.time).toBeGreaterThan(0);
    expect(routine.time).toBeLessThan(80);
    expect(routine.leader).toBeLessThan(2);
    // trot : 2,4 à 3,2 m/s, pas 1,2 m/s
    expect(routine.speed).toBeGreaterThan(2.3);
    expect(routine.speed).toBeLessThan(3.2);
    expect(urgent.time).toBeGreaterThan(0);
    expect(urgent.time).toBeLessThan(routine.time - 4);
    expect(urgent.speed).toBeGreaterThan(routine.speed);
    expect(urgent.leader).toBeLessThan(2);
    // la course use le souffle davantage que le trot
    expect(urgent.stamina).toBeLessThan(routine.stamina);
  }, 120000);

  it('charge : la ligne court à plus de 4 m/s, plus vite qu\'une colonne au trot', async () => {
    const { pt, sec } = await section(-30);
    const { ctx } = pt;
    const before = fitLine(frontRank(pt, sec.squad.id));
    ctx.squads.issue(sec.squad.id, { type: 'charge', x: 0, z: -80, heading: NORTH });
    const t0 = ctx.clock.now;
    let top = 0;
    let reached30 = -1;
    pt.run(30, 0.1, () => {
      const front = frontRank(pt, sec.squad.id);
      top = Math.max(top, median(front.map((p) => Math.hypot(p.vx, p.vz))));
      if (reached30 < 0 && before.cz - fitLine(front).cz >= 30) reached30 = ctx.clock.now - t0;
      return reached30 > 0;
    });
    console.log('charge — vitesse médiane de pointe du premier rang', top.toFixed(2), 'm/s | 30 m couverts en', reached30.toFixed(1), 's');
    expect(top).toBeGreaterThan(4);
    // 30 m (départ arrêté, prise de la ligne comprise) en moins de 12 s : au trot ce serait plus de 13 s
    expect(reached30).toBeGreaterThan(0);
    expect(reached30).toBeLessThan(12);
  });

  it('ligne qui se porte en avant : pas soutenu hors contact, pas cadencé face à une foule proche', async () => {
    const speedOf = async (crowd: boolean): Promise<number> => {
      const { pt, sec } = await section(-60);
      const { ctx } = pt;
      if (crowd) spawnProtesters(ctx, 30, 0, -98, 0, 'pacifique', 1.2, 10);
      pt.step(1);
      ctx.squads.issue(sec.squad.id, { type: 'avancer', x: 0, z: -80, heading: NORTH });
      // vitesse du repère de la ligne (le premier rang la suit d'un bloc), une fois lancée
      const t0 = ctx.clock.now;
      const z0 = fitLine(frontRank(pt, sec.squad.id)).cz;
      let t1 = -1;
      pt.run(40, 0.1, () => {
        const done = fitLine(frontRank(pt, sec.squad.id)).cz <= z0 - 16;
        if (done) t1 = ctx.clock.now - t0;
        return done;
      });
      return t1 > 0 ? 16 / t1 : 0;
    };
    const free = await speedOf(false);
    const contact = await speedOf(true);
    console.log('avancer en ligne (16 m, départ arrêté) — hors contact', free.toFixed(2), 'm/s | face à la foule', contact.toFixed(2), 'm/s');
    // vitesse moyenne sur 16 m, départ arrêté compris : ≈ 1,9 m/s hors contact, ≈ 1,2 m/s face à la foule
    expect(free).toBeGreaterThan(1.4);
    expect(free).toBeLessThan(2.1);
    expect(contact).toBeGreaterThan(0.8);
    expect(contact).toBeLessThan(1.3);
    expect(free).toBeGreaterThan(contact * 1.3);
  });
});
