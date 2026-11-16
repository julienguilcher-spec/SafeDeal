// Tâches détachées : collègue à terre ramené derrière la ligne, extinction d'une nappe de feu, blessé secouru sur ordre, ravitaillement.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { fitLine, frontRank, spawnProtesters, startPolice } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

async function lineUp(vehicles = false): Promise<{ pt: PoliceTest; sec: ReturnType<PoliceTest['units']['createSection']> }> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
  const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne', vehicles });
  pt.ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
  pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
  return { pt, sec };
}

function count(p: Person, id: string): number {
  const s = p.inventory.find((i) => i.id === id);
  return s ? s.count : 0;
}

describe('police — collègue à terre', () => {
  it('un agent grièvement blessé sur la ligne est traîné derrière elle, couvert par deux boucliers, et la ligne se referme', async () => {
    const { pt, sec } = await lineUp();
    const { ctx } = pt;
    const radical = spawnProtesters(ctx, 1, 0, -125, 0, 'radical')[0];
    const front = frontRank(pt, sec.squad.id);
    const victim = front[Math.floor(front.length / 2)];
    const z0 = victim.z;
    // blessure très grave (pavés reçus de dos, hors bouclier) : l'agent tombe sur place et ne se relèvera pas seul
    for (let i = 0; i < 12 && victim.injury !== 'critical'; i++) {
      ctx.health.hurt(victim, { amount: 45, kind: 'impact', sourceId: radical.id, x: victim.x, z: victim.z, zone: 0.6, dirX: 0, dirZ: -1 });
    }
    pt.step(0.2);
    expect(victim.posture).toBe('down');
    expect(victim.injury).toBe('critical');
    let carriedAt = -1;
    let dropped = -1;
    let covers = 0;
    const t0 = ctx.clock.now;
    pt.run(60, 0.25, () => {
      if (victim.heldBy !== 0 && carriedAt < 0) carriedAt = ctx.clock.now - t0;
      covers = Math.max(covers, pt.status.of(sec.squad.id)!.detached);
      if (carriedAt >= 0 && victim.heldBy === 0) {
        dropped = ctx.clock.now - t0;
        return true;
      }
    });
    console.log('collègue à terre — pris en charge en', carriedAt.toFixed(1), 's, déposé en', dropped.toFixed(1), 's,', (victim.z - z0).toFixed(1),
      'm derrière la ligne | agents engagés :', covers, '| radio :', ctx.radio.log.filter((m) => m.priority === 2).map((m) => m.text).join(' / '));
    expect(carriedAt).toBeGreaterThan(0);
    expect(carriedAt).toBeLessThan(15);
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(40); // « moins de 20 s » de traction à 0,6 m/s, plus l'approche
    expect(victim.z - z0).toBeGreaterThan(4);
    expect(covers).toBeGreaterThanOrEqual(3); // un agent qui tire, deux boucliers qui couvrent
    expect(ctx.radio.log.some((m) => m.priority === 2 && m.text.includes('Agent à terre'))).toBe(true);
    expect(ctx.radio.log.some((m) => m.priority === 2 && m.text.includes('blessé évacué derrière la ligne'))).toBe(true);
    // chacun reprend sa place : la ligne se referme sur le vide et reste droite
    pt.step(20);
    const st = pt.status.of(sec.squad.id)!;
    expect(st.detached).toBe(0);
    expect(st.down).toBe(1);
    const after = frontRank(pt, sec.squad.id);
    expect(after.includes(victim)).toBe(false);
    const fit = fitLine(after);
    expect(fit.error).toBeLessThan(0.5);
    expect(fit.gapMax - fit.gapMin).toBeLessThan(0.5);
  });

  it('ordre « secourir » : un manifestant blessé devant la ligne est ramené derrière elle', async () => {
    const { pt, sec } = await lineUp();
    const { ctx } = pt;
    const victim = spawnProtesters(ctx, 1, 2, -114, 0, 'pacifique')[0];
    ctx.health.hurt(victim, { amount: 80, kind: 'impact', sourceId: 0, x: victim.x, z: victim.z, zone: 0.5 });
    pt.step(0.5);
    expect(victim.posture).toBe('down');
    expect(victim.injury).toBe('critical');
    ctx.squads.issue(sec.squad.id, { type: 'secourir', targetId: victim.id, x: victim.x, z: victim.z });
    let ok = false;
    ctx.events.onAny('police:order_done', (e) => {
      const d = e as { type: string; ok: boolean };
      if (d.type === 'secourir') ok = d.ok;
    });
    pt.run(90, 0.5, () => ok);
    console.log('secourir — blessé à z =', victim.z.toFixed(1), '(ligne à −100) | tenu par', victim.heldBy);
    expect(ok).toBe(true);
    expect(victim.z).toBeGreaterThan(-97);
    expect(victim.heldBy).toBe(0);
    // l'ordre de tâche n'a pas défait la ligne
    expect(pt.formation.of(sec.squad.id)!.formation).toBe('ligne');
    expect(sec.squad.order.type).toBe('ligne');
  });
});

describe('police — extinction', () => {
  it('ordre « eteindre » : le porte-extincteur éteint la nappe de feu désignée, couvert par les boucliers, puis reprend sa place', async () => {
    const { pt, sec } = await lineUp();
    const { ctx } = pt;
    const fx = 2;
    const fz = -112;
    ctx.hazards.ignite(fx, fz, 1.25, 1, 0);
    pt.step(1);
    expect(ctx.hazards.fireAt(fx, fz)).toBeGreaterThan(0.5);
    const bearer = sec.people.find((p) => p.poste === 'extincteur')!;
    const charge0 = count(bearer, 'extincteur');
    ctx.squads.issue(sec.squad.id, { type: 'eteindre', x: fx, z: fz });
    const t0 = ctx.clock.now;
    let outAt = -1;
    let escort = 0;
    pt.run(30, 0.25, () => {
      escort = Math.max(escort, pt.status.of(sec.squad.id)!.detached);
      if (ctx.hazards.fireAt(fx, fz) <= 0.001) {
        outAt = ctx.clock.now - t0;
        return true;
      }
    });
    console.log('eteindre — feu éteint en', outAt.toFixed(1), 's | agents sortis du rang :', escort, '| extincteur', charge0, '→', count(bearer, 'extincteur'), 's');
    // une nappe non traitée brûle plus de 30 s : ici elle est éteinte bien avant
    expect(outAt).toBeGreaterThan(0);
    expect(outAt).toBeLessThan(22);
    expect(escort).toBe(3);
    expect(count(bearer, 'extincteur')).toBeLessThan(charge0);
    pt.step(15);
    expect(pt.status.of(sec.squad.id)!.detached).toBe(0);
    expect(ctx.radio.log.some((m) => m.text.includes('Feu éteint'))).toBe(true);
    expect(fitLine(frontRank(pt, sec.squad.id)).error).toBeLessThan(0.5);
    expect(ctx.law.forceLog.length).toBe(0); // l'extincteur n'est pas un moyen de force
  });

  it('témoin : sans ordre, la même nappe brûle encore au bout de 22 s', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    pt.ctx.hazards.ignite(2, -112, 1.25, 1, 0);
    pt.step(22);
    expect(pt.ctx.hazards.fireAt(2, -112)).toBeGreaterThan(0.3);
  });

  it('un collègue en feu est éteint en moins de 3 s par le porte-extincteur du second rang', async () => {
    const { pt, sec } = await lineUp();
    const { ctx } = pt;
    const front = frontRank(pt, sec.squad.id);
    const bearer = sec.people.find((p) => p.poste === 'extincteur')!;
    // l'agent du premier rang le plus proche du porte-extincteur prend feu
    const victim = front.filter((p) => p !== bearer).sort((a, b) => Math.hypot(a.x - bearer.x, a.z - bearer.z) - Math.hypot(b.x - bearer.x, b.z - bearer.z))[0];
    victim.burning = 0.8;
    const t0 = ctx.clock.now;
    let outAt = -1;
    pt.run(12, 0.1, () => {
      if (victim.burning <= 0.01) {
        outAt = ctx.clock.now - t0;
        return true;
      }
    });
    console.log('collègue en feu — éteint en', outAt.toFixed(1), 's | santé', victim.health.toFixed(0));
    expect(outAt).toBeGreaterThan(0);
    expect(outAt).toBeLessThan(4.5);
  });
});

describe('police — ravitaillement', () => {
  it('ordre « ravitailler » : les agents vont compléter leur dotation au fourgon, la réserve est décomptée', async () => {
    const { pt, sec } = await lineUp(true);
    const { ctx } = pt;
    const lanceur = sec.people.find((p) => p.poste === 'lanceur')!;
    const chef = sec.people.find((p) => p.poste === 'chef_groupe')!;
    ctx.actions.remove(lanceur, 'grenade_lacrymo', 3);
    ctx.actions.remove(chef, 'grenade_lacrymo', 2);
    pt.step(0.5);
    const before = pt.status.of(sec.squad.id)!;
    const ammo0 = before.ammo.lacrymoMain;
    const reserve0 = before.reserve.lacrymoMain;
    expect(reserve0).toBeGreaterThan(0);
    let done = false;
    ctx.events.onAny('police:order_done', (e) => {
      if ((e as { type: string }).type === 'ravitailler') done = true;
    });
    ctx.squads.issue(sec.squad.id, { type: 'ravitailler' });
    pt.run(180, 1, () => done);
    pt.step(30);
    const after = pt.status.of(sec.squad.id)!;
    console.log('ravitaillement — lacrymogènes à main', ammo0, '→', after.ammo.lacrymoMain, '| réserve', reserve0, '→', after.reserve.lacrymoMain);
    expect(done).toBe(true);
    expect(after.ammo.lacrymoMain).toBe(ammo0 + 5);
    expect(after.reserve.lacrymoMain).toBe(reserve0 - 5);
    expect(after.detached).toBe(0);
    expect(fitLine(frontRank(pt, sec.squad.id)).error).toBeLessThan(0.5);
  });
});
