// Riposte graduée et réflexes : LBD sur individu identifié, vent et masques, mortiers, engin incendiaire, encerclement réel, fatigue.
import { describe, expect, it } from 'vitest';
import type { ForceReport, Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { fitLine, frontRank, spawnProtesters, startPolice, throwAt } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

async function lineUp(maxForce: 1 | 2 | 3 | 4, extra?: Record<string, unknown>): Promise<{ pt: PoliceTest; sec: ReturnType<PoliceTest['units']['createSection']> }> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100, extra });
  const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne' });
  pt.ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH, maxForce });
  pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
  return { pt, sec };
}

/** Fait lancer des pavés par les radicaux, un toutes les `period` secondes, pendant `seconds`. */
function stoning(pt: PoliceTest, radicals: Person[], seconds: number, period: number, each?: () => void): number {
  const { ctx } = pt;
  let thrown = 0;
  let next = 0;
  let i = 0;
  pt.run(seconds, 0.1, (t) => {
    if (t >= next) {
      const r = radicals[i++ % radicals.length];
      if (r.custody === 'free' && r.posture !== 'down') {
        if (ctx.actions.has(r, 'pave') < 2) ctx.actions.give(r, 'pave', 2);
        if (throwAt(ctx, r, 'pave', (ctx.rng.next() - 0.5) * 8, -100)) {
          thrown++;
          next = t + period;
        }
      }
    }
    if (each) each();
  });
  return thrown;
}

describe('police — LBD', () => {
  it('tire une fois sur un lanceur de pavés identifié, entre 10 et 50 m, jamais à la tête ; jamais sur un pacifique', async () => {
    const { pt, sec } = await lineUp(4);
    const { ctx } = pt;
    const peaceful = spawnProtesters(ctx, 20, 0, -140, 0, 'pacifique', 1.3, 10);
    const radicals = spawnProtesters(ctx, 3, 0, -123, 0, 'radical', 3, 3);
    const lbdShots: number[] = [];
    ctx.events.on('projectile:spawned', (e) => {
      if (e.kind === 'lbd') lbdShots.push(e.ownerId);
    });
    const hits: { id: number; zone: number }[] = [];
    ctx.events.on('person:hurt', (e) => {
      if (e.info.means === 'lbd') hits.push({ id: e.id, zone: e.info.zone ?? -1 });
    });
    let amended = 0;
    ctx.events.onAny('law:force_amended', () => amended++);
    stoning(pt, radicals, 30, 1.2);
    pt.step(10);
    const log = (ctx.law.forceLog as readonly ForceReport[]).filter((r) => r.means === 'lbd');
    console.log('LBD —', lbdShots.length, 'tirs |', log.map((r) => `${r.verdict.kind} sur ${r.targetId}`).join(', '), '| impacts :',
      hits.map((h) => `zone ${h.zone.toFixed(2)}`).join(', '), '| verdicts révisés :', amended);
    expect(lbdShots.length).toBeGreaterThanOrEqual(1);
    expect(lbdShots.length).toBeLessThanOrEqual(6);
    // tireur habilité uniquement, cible = un des lanceurs, verdict licite
    const shooter = sec.people.find((p) => p.poste === 'lbd')!;
    expect(lbdShots.every((id) => id === shooter.id)).toBe(true);
    expect(log.length).toBe(lbdShots.length);
    for (const r of log) {
      expect(r.verdict.kind).toBe('licite');
      expect(radicals.some((p) => p.id === r.targetId)).toBe(true);
    }
    // jamais au-dessus des épaules, jamais un pacifique
    for (const h of hits) {
      expect(h.zone).toBeLessThan(0.86);
      expect(peaceful.some((p) => p.id === h.id)).toBe(false);
    }
    expect(amended).toBe(0);
    expect((ctx.law.forceLog as readonly ForceReport[]).every((r) => r.verdict.kind === 'licite')).toBe(true);
    expect(ctx.radio.log.some((m) => m.text.includes('tir de lanceur de balles de défense'))).toBe(true);
    // l'arme de service n'est jamais sortie
    expect((ctx.law.forceLog as readonly ForceReport[]).some((r) => r.means === 'arme_feu')).toBe(false);
  });
});

describe('police — gaz et vent', () => {
  it('vent de face : les masques sont mis avant le tir, le gaz est déposé en amont du groupe violent', async () => {
    const { pt, sec } = await lineUp(1);
    const { ctx } = pt;
    // vent du nord (de la foule vers la ligne) : 3 m/s vers le sud
    ctx.env.setWind(0, 3);
    const radicals = spawnProtesters(ctx, 4, 0, -122, 0, 'radical', 2.5, 4);
    const impacts: { z: number; masked: number }[] = [];
    ctx.events.on('projectile:impact', (e) => {
      const o = ctx.people.get(e.ownerId);
      if (o && o.faction === 'police' && e.kind === 'grenade_lacrymo_main') {
        impacts.push({ z: e.z, masked: sec.people.filter((p) => p.look.gasMask).length });
      }
    });
    stoning(pt, radicals, 40, 1.5);
    const masked = sec.people.filter((p) => p.look.gasMask).length;
    const worstGas = Math.max(...sec.people.map((p) => p.gas));
    console.log('vent de face —', impacts.length, 'grenades, points de chute z =', impacts.map((i) => i.z.toFixed(1)).join(', '),
      '| masques au premier impact :', impacts[0]?.masked, '| masques ensuite :', masked, '| exposition maximale d\'un agent :', worstGas.toFixed(2));
    expect(impacts.length).toBeGreaterThan(0);
    // les masques étaient mis avant la première grenade
    expect(impacts[0].masked).toBeGreaterThanOrEqual(14);
    // points de chute en amont (au nord) du groupe violent : le nuage dérive sur lui
    for (const i of impacts) expect(i.z).toBeLessThan(-122);
    expect(ctx.radio.log.some((m) => m.text.includes('retour de gaz') && m.text.includes('masques'))).toBe(true);
    // personne n'est incommodé sur la ligne
    expect(worstGas).toBeLessThan(0.35);
    expect((ctx.law.forceLog as readonly ForceReport[]).every((r) => r.verdict.kind === 'licite')).toBe(true);
  });
});

describe('police — mortiers, engins incendiaires', () => {
  it('sous les mortiers d\'artifice : tortue réflexe, accroupis derrière les boucliers', async () => {
    const { pt, sec } = await lineUp(1);
    const { ctx } = pt;
    const shooter = spawnProtesters(ctx, 1, 0, -135, 0, 'radical')[0];
    // trois tirs tendus de mortier vers la ligne
    for (let i = 0; i < 3; i++) {
      ctx.projectiles.spawn('mortier', shooter.id, shooter.x + i - 1, ctx.world.heightAt(shooter.x, shooter.z) + 1.4, shooter.z + 0.5, (i - 1) * 2, 2.5, 34);
      pt.step(0.6);
    }
    pt.step(0.8);
    const shields = sec.people.filter((p) => p.inventory.some((s) => s.id === 'bouclier') && p.posture !== 'down');
    const crouched = sec.people.filter((p) => p.posture === 'crouch').length;
    const raised = shields.filter((p) => p.alt && p.active >= 0 && p.inventory[p.active].id === 'bouclier').length;
    console.log('mortiers — accroupis', crouched, '/', sec.people.length, '| boucliers levés', raised, '/', shields.length);
    expect(crouched).toBeGreaterThanOrEqual(sec.people.length - 2);
    expect(raised).toBe(shields.length);
    // le calme revenu, l'unité se relève et la ligne est intacte
    pt.step(12);
    expect(sec.people.filter((p) => p.posture === 'crouch').length).toBe(0);
    expect(fitLine(frontRank(pt, sec.squad.id)).error).toBeLessThan(0.5);
  });

  it('engin incendiaire : les agents s\'écartent de la nappe de feu, puis reprennent leur place ; avec un extincteur, le feu est éteint', async () => {
    const { pt, sec } = await lineUp(1);
    const { ctx } = pt;
    // 1. sans extincteur disponible : la ligne s'ouvre autour du foyer tant qu'il brûle
    const bearer = sec.people.find((p) => p.poste === 'extincteur')!;
    ctx.actions.remove(bearer, 'extincteur');
    const front = frontRank(pt, sec.squad.id);
    const mid = front[Math.floor(front.length / 2)];
    const fx = mid.x;
    const fz = mid.z - 0.6;
    ctx.hazards.ignite(fx, fz, 1.25, 1, 0);
    ctx.events.emit('fire:started', { x: fx, z: fz, targetKind: 'ground', targetId: 0, sourceId: 0 });
    pt.step(3);
    let minDist = Infinity;
    let inFire = 0;
    let burned = 0;
    pt.run(8, 0.25, () => {
      for (const p of sec.people) {
        minDist = Math.min(minDist, Math.hypot(p.x - fx, p.z - fz));
        if (ctx.hazards.fireAt(p.x, p.z) > 0.2) inFire++;
        burned = Math.max(burned, p.burning);
      }
    });
    expect(ctx.hazards.fireAt(fx, fz)).toBeGreaterThan(0.5);
    console.log('engin incendiaire — distance minimale au foyer :', minDist.toFixed(2), 'm | agents dans les flammes :', inFire, '| brûlure maximale', burned.toFixed(2));
    expect(minDist).toBeGreaterThan(1.5);
    expect(inFire).toBe(0);
    // le feu éteint de lui-même (une quarantaine de secondes), chacun reprend sa place
    pt.step(50);
    expect(ctx.hazards.fireAt(fx, fz)).toBe(0);
    expect(fitLine(frontRank(pt, sec.squad.id)).error).toBeLessThan(0.5);
    // 2. extincteur rendu : une nouvelle nappe au pied de la ligne est éteinte d'initiative
    ctx.actions.give(bearer, 'extincteur');
    ctx.actions.selectById(bearer, 'extincteur');
    ctx.hazards.ignite(fx, fz, 1.25, 1, 0);
    ctx.events.emit('fire:started', { x: fx, z: fz, targetKind: 'ground', targetId: 0, sourceId: 0 });
    const t0 = ctx.clock.now;
    let outAt = -1;
    pt.run(20, 0.25, () => {
      if (ctx.hazards.fireAt(fx, fz) <= 0.01) {
        outAt = ctx.clock.now - t0;
        return true;
      }
    });
    console.log('feu au pied de la ligne — éteint d\'initiative en', outAt.toFixed(1), 's');
    expect(outAt).toBeGreaterThan(0);
    expect(outAt).toBeLessThan(12);
    pt.step(10);
    expect(fitLine(frontRank(pt, sec.squad.id)).error).toBeLessThan(0.5);
    expect(pt.status.of(sec.squad.id)!.detached).toBe(0);
  });
});

describe('police — encerclement réel, fatigue', () => {
  it('grenade de désencerclement : seulement quand le groupe est réellement encerclé par des violents', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    // un groupe isolé au milieu de l'avenue, autorisé au niveau 4
    const grp = pt.units.createGroup({ type: 'intervention', x: -150, z: 6, heading: Math.PI / 2 });
    ctx.squads.issue(grp.squad.id, { type: 'tenir', maxForce: 4 });
    pt.step(3);
    const shots: string[] = [];
    ctx.events.on('projectile:spawned', (e) => {
      const o = ctx.people.get(e.ownerId);
      if (o && o.faction === 'police' && e.kind === 'desencerclement') shots.push(e.kind);
    });
    // douze radicaux tout autour, à sept mètres, qui lancent des pavés
    const ring: Person[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', profile: 'radical', x: -150 + Math.sin(a) * 7.5, z: 6 + Math.cos(a) * 7.5, seed: 500 + i });
      ring.push(p);
    }
    let next = 0;
    let i = 0;
    pt.run(30, 0.1, (t) => {
      if (t < next) return;
      const r = ring[i++ % ring.length];
      if (r.custody !== 'free' || r.posture === 'down') return;
      if (ctx.actions.has(r, 'pave') < 2) ctx.actions.give(r, 'pave', 2);
      if (throwAt(ctx, r, 'pave', -150, 6)) next = t + 0.5;
    });
    const log = (ctx.law.forceLog as readonly ForceReport[]);
    console.log('encerclement réel — grenades de désencerclement :', shots.length, '| journal :', log.map((r) => `${r.means}:${r.verdict.kind}`).join(' '));
    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(shots.length).toBeLessThanOrEqual(2);
    expect(log.filter((r) => r.means === 'desencerclement').every((r) => r.verdict.kind === 'licite')).toBe(true);
    expect(log.every((r) => r.verdict.kind === 'licite')).toBe(true);
  });

  it('une unité tenue longtemps sous pression s\'épuise et demande sa relève par radio', async () => {
    const { pt, sec } = await lineUp(1);
    const { ctx } = pt;
    pt.tuning.fatigueTime = 60; // épuisement accéléré pour l'essai (réglage normal : dix minutes sous pression)
    pt.tuning.autoRiposte = false;
    const radicals = spawnProtesters(ctx, 4, 0, -122, 0, 'radical', 2.5, 4);
    let requested = 0;
    ctx.events.onAny('police:relief_requested', () => requested++);
    const f0 = pt.status.of(sec.squad.id)!.fatigue;
    stoning(pt, radicals, 90, 1.5);
    const st = pt.status.of(sec.squad.id)!;
    console.log('fatigue —', f0.toFixed(2), '→', st.fatigue.toFixed(2), '| moral', st.morale.toFixed(2), '| demandes de relève :', requested);
    expect(st.fatigue).toBeGreaterThan(0.7);
    expect(st.needsRelief).toBe(true);
    expect(requested).toBeGreaterThanOrEqual(1);
    expect(ctx.radio.log.some((m) => m.text.includes('Demande relève'))).toBe(true);
    expect(st.morale).toBeLessThan(0.9);
    // sans riposte autorisée, aucun emploi de la force
    expect((ctx.law.forceLog as readonly ForceReport[]).filter((r) => r.means !== 'presence').length).toBe(0);
  });
});
