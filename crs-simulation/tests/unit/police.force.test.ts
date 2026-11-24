// Emploi gradué de la force : scénario calme (aucune bavure), scénario d'attaque (boucliers, riposte proportionnée, interpellation).
import { describe, expect, it } from 'vitest';
import type { ForceReport, Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { fitLine, frontRank, spawnProtesters, startPolice, throwAt } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function shieldUp(p: Person): boolean {
  const s = p.active >= 0 ? p.inventory[p.active] : undefined;
  return !!s && s.id === 'bouclier' && p.alt;
}

describe('police — scénario calme', () => {
  it('cinq minutes face à des manifestants pacifiques : aucun emploi de force, aucune bavure, la ligne tient', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    // soixante manifestants pacifiques au nord : ils scandent, piétinent, quelques curieux viennent à deux mètres des boucliers
    const crowd = spawnProtesters(ctx, 60, 0, -112, 0, 'pacifique', 1.15, 10);
    const rng = ctx.rng.fork('test.calme');
    const home = crowd.map((p) => ({ x: p.x, z: p.z }));
    const projectiles: string[] = [];
    ctx.events.on('projectile:spawned', (e) => projectiles.push(e.kind));
    let arrests = 0;
    ctx.events.on('person:arrested', () => arrests++);
    pt.run(300, 0.5, (t) => {
      for (let i = 0; i < crowd.length; i++) {
        const p = crowd[i];
        // les six premiers avancent jusqu'à deux mètres de la ligne puis repartent, les autres piétinent autour de leur place
        const curious = i < 6 && Math.floor(t / 40) % 2 === 1;
        const tx = home[i].x + (rng.next() - 0.5) * 1.5;
        const tz = curious ? -102.2 : home[i].z + (rng.next() - 0.5) * 1.5;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        p.cmd.moveX = d > 0.4 ? (dx / d) * 0.6 : 0;
        p.cmd.moveZ = d > 0.4 ? (dz / d) * 0.6 : 0;
        p.cmd.gait = 0;
        p.cmd.faceMove = d > 0.4;
      }
    });
    const log = ctx.law.forceLog as readonly ForceReport[];
    const faults = log.filter((r) => r.verdict.kind !== 'licite');
    const coercive = log.filter((r) => r.means !== 'presence');
    const st = pt.status.of(sec.squad.id)!;
    const fit = fitLine(frontRank(pt, sec.squad.id));
    let raised = 0;
    for (const p of sec.people) if (shieldUp(p)) raised++;
    console.log('scénario calme — journal de la force :', log.length, 'lignes, dont', coercive.length, 'actes de contrainte et', faults.length,
      'fautes | projectiles tirés :', projectiles.length, '| interpellations :', arrests, '| alignement', fit.error.toFixed(3), 'm | fatigue',
      st.fatigue.toFixed(3), '| moral', st.morale.toFixed(2), '| boucliers levés', raised);
    expect(faults.length).toBe(0);
    expect(coercive.length).toBe(0);
    expect(projectiles.length).toBe(0);
    expect(arrests).toBe(0);
    expect(st.forceCap).toBe(1);
    expect(st.underAttack).toBe(false);
    expect(fit.error).toBeLessThan(0.5);
    expect(st.valid).toBe(16);
    // aucun manifestant blessé ni gazé
    for (const p of crowd) {
      expect(p.health).toBe(100);
      expect(p.gas).toBe(0);
      expect(p.custody).toBe('free');
    }
    // aucun message de refus ni d'emploi de la force à la radio
    expect(ctx.radio.log.some((m) => m.text.includes('lacrymog') || m.text.includes('NÉGATIF'))).toBe(false);
  });
});

describe('police — scénario d\'attaque', () => {
  it('jets de pavés : boucliers levés, avertissement, riposte au gaz licite, puis interpellation menée jusqu\'à la remise', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: NORTH, layout: 'ligne', vehicles: true });
    expect(sec.vehicles.length).toBe(3);
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    const crowd = spawnProtesters(ctx, 24, 0, -136, 0, 'pacifique', 1.3, 8);
    const radicals = spawnProtesters(ctx, 6, 0, -123, 0, 'radical', 2.2, 6);
    pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    expect(pt.status.of(sec.squad.id)!.phase).toBe('en_place');
    const shields = sec.people.filter((p) => p.inventory.some((s) => s.id === 'bouclier'));
    expect(shields.filter(shieldUp).length).toBe(0); // bouclier bas tant que rien ne vole

    const gas: { x: number; z: number }[] = [];
    const policeShots: string[] = [];
    ctx.events.on('projectile:spawned', (e) => {
      const owner = ctx.people.get(e.ownerId);
      if (owner && owner.faction === 'police' && e.kind !== 'palet_lacrymo') policeShots.push(e.kind);
    });
    ctx.events.on('projectile:impact', (e) => {
      const owner = ctx.people.get(e.ownerId);
      if (owner && owner.faction === 'police' && e.kind === 'grenade_lacrymo_main') gas.push({ x: e.x, z: e.z });
    });
    // phase 1 : les six radicaux lancent des pavés sur la ligne pendant 24 s
    for (const r of radicals) ctx.actions.give(r, 'pave', 3);
    for (const r of radicals) ctx.actions.selectById(r, 'pave');
    pt.step(1.5);
    const tAttack = ctx.clock.now;
    let firstThrow = -1;
    let shieldsUpAt = -1;
    let thrown = 0;
    pt.run(24, 0.1, (t) => {
      const k = Math.floor(t / 0.1);
      if (k % 8 === 0) {
        const r = radicals[(k / 8) % radicals.length];
        if (r.custody === 'free' && r.posture !== 'down') {
          ctx.actions.give(r, 'pave', 1);
          if (throwAt(ctx, r, 'pave', (ctx.rng.next() - 0.5) * 8, -100)) {
            thrown++;
            if (firstThrow < 0) firstThrow = ctx.clock.now;
          }
        }
      }
      if (firstThrow >= 0 && shieldsUpAt < 0 && shields.filter(shieldUp).length >= shields.length - 1) shieldsUpAt = ctx.clock.now - firstThrow;
    });
    const st = pt.status.of(sec.squad.id)!;
    const log = ctx.law.forceLog as readonly ForceReport[];
    console.log('attaque —', thrown, 'pavés lancés | boucliers levés', shieldsUpAt.toFixed(2), 's après le premier jet | riposte :', policeShots.join(', ') || 'aucune',
      '| journal :', log.map((r) => `${r.means}:${r.verdict.kind}`).join(' '), '| plafond', st.forceCap, '| blessés', st.injured);
    expect(thrown).toBeGreaterThan(10);
    expect(shieldsUpAt).toBeGreaterThanOrEqual(0);
    expect(shieldsUpAt).toBeLessThan(1.5);
    // riposte proportionnée : avertissement à la foule, puis lacrymogènes à main seulement (pas de LBD : l'ordre ne l'autorise pas)
    expect(ctx.radio.log.some((m) => m.channel === 'public' && m.text.includes('grenades lacrymogènes'))).toBe(true);
    expect(policeShots.length).toBeGreaterThan(0);
    expect(policeShots.every((kind) => kind === 'grenade_lacrymo_main')).toBe(true);
    expect(policeShots.length).toBeLessThanOrEqual(6);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((r) => r.verdict.kind === 'licite')).toBe(true);
    expect(log.some((r) => r.means === 'lbd' || r.means === 'arme_feu' || r.means === 'desencerclement')).toBe(false);
    // les grenades tombent sur le groupe violent (à 23 m de la ligne), pas sur les pacifiques 13 m plus loin
    for (const g of gas) expect(Math.abs(g.z + 123)).toBeLessThan(9);

    // phase 2 : les jets cessent ; ordre d'interpeller l'un des lanceurs, resté sur place
    pt.step(20);
    const target = radicals.find((r) => r.custody === 'free' && r.posture !== 'down' && ctx.law.canArrest(r))!;
    expect(target).toBeDefined();
    let handed = 0;
    ctx.events.on('person:handed_over', (e) => {
      if (e.id === target.id) handed++;
    });
    ctx.squads.issue(sec.squad.id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z });
    let doneAt = -1;
    const tArrest = ctx.clock.now;
    pt.run(240, 0.5, () => {
      if (target.custody === 'in_vehicle' || target.custody === 'handed_over') {
        doneAt = ctx.clock.now - tArrest;
        return true;
      }
    });
    console.log('interpellation — état de la cible :', target.custody, '| remise en', doneAt.toFixed(0), 's | messages :',
      ctx.radio.log.filter((m) => m.text.includes('interpell')).map((m) => m.text).join(' / '));
    expect(doneAt).toBeGreaterThan(0);
    expect(handed).toBe(1);
    expect(ctx.radio.log.some((m) => m.text.includes('UN interpellé pour'))).toBe(true);
    // le binôme reprend sa place, la ligne est reformée
    pt.step(40);
    const after = pt.status.of(sec.squad.id)!;
    expect(after.detached).toBe(0);
    expect(after.arrests).toBe(1);
    expect(fitLine(frontRank(pt, sec.squad.id)).error).toBeLessThan(0.5);
    expect((ctx.law.forceLog as readonly ForceReport[]).every((r) => r.verdict.kind === 'licite')).toBe(true);
    expect(ctx.clock.now - tAttack).toBeGreaterThan(0);
    expect(crowd.every((p) => p.custody === 'free')).toBe(true);
  });
});
