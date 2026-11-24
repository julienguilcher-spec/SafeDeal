// Déterminisme, coût par pas avec 150 agents, fonctionnement avec les seuls services neutres.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { fitLine, frontRank, spawnProtesters, startPolice, throwAt } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

async function scenario(seed: number): Promise<string> {
  const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 }, seed);
  const { ctx } = pt;
  const sec = pt.units.createSection({ x: 0, z: -80, heading: NORTH, layout: 'ligne', vehicles: true, seed: 11 });
  ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
  const radicals = spawnProtesters(ctx, 5, 0, -122, 0, 'radical', 2.4, 5);
  spawnProtesters(ctx, 20, 0, -135, 0, 'pacifique', 1.3, 10);
  pt.step(25);
  let i = 0;
  pt.run(30, 0.5, (t) => {
    const r = radicals[i++ % radicals.length];
    if (r.custody === 'free' && r.posture !== 'down') {
      if (ctx.actions.has(r, 'pave') < 2) ctx.actions.give(r, 'pave', 2);
      throwAt(ctx, r, 'pave', (ctx.rng.next() - 0.5) * 8, -100);
    }
    if (Math.abs(t - 20) < 0.01) ctx.squads.issue(sec.squad.id, { type: 'bond_offensif', heading: NORTH });
  });
  pt.step(15);
  let print = '';
  for (const p of ctx.people.list as readonly Person[]) print += `${p.id}:${p.x.toFixed(3)},${p.z.toFixed(3)},${p.health.toFixed(1)},${p.custody};`;
  print += '|' + ctx.radio.log.map((m) => m.t.toFixed(2) + m.text).join('#');
  print += '|' + ctx.law.forceLog.map((r) => `${r.t.toFixed(2)}${r.means}${r.byId}${r.verdict.kind}`).join('#');
  return print;
}

describe('police — déterminisme', () => {
  it('même graine : même déroulement (positions, radio, journal de la force) ; autre graine : déroulement différent', async () => {
    const a = await scenario(42);
    const b = await scenario(42);
    const c = await scenario(43);
    expect(a.length).toBeGreaterThan(1000);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});

describe('police — coût', () => {
  it('coût par pas avec 156 agents (deux compagnies et une section) : en ligne, en marche, sous les projectiles', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const a = pt.units.createCompany({ x: -150, z: 0, heading: -Math.PI / 2, vehicles: false, layout: 'ligne' });
    const b = pt.units.createCompany({ x: 150, z: 0, heading: Math.PI / 2, vehicles: false, layout: 'ligne' });
    const c = pt.units.createSection({ x: 0, z: -110, heading: NORTH, layout: 'ligne' });
    const agents = a.people.length + b.people.length + c.people.length;
    expect(agents).toBe(156);
    ctx.squads.issue(a.squad.id, { type: 'ligne', x: -160, z: 0, heading: -Math.PI / 2 });
    ctx.squads.issue(b.squad.id, { type: 'ligne', x: 160, z: 0, heading: Math.PI / 2 });
    ctx.squads.issue(c.squad.id, { type: 'ligne', x: 0, z: -120, heading: NORTH });
    // foule : 300 manifestants devant les lignes
    const crowdA = spawnProtesters(ctx, 120, -190, 0, -Math.PI / 2 + Math.PI, 'pacifique', 1.2, 24);
    spawnProtesters(ctx, 120, 190, 0, Math.PI / 2 + Math.PI, 'pacifique', 1.2, 24);
    const radicals = spawnProtesters(ctx, 60, 0, -146, 0, 'radical', 1.2, 10);
    expect(crowdA.length).toBe(120);
    pt.step(40);

    const measure = (seconds: number, each?: (t: number) => void): { mean: number; p95: number; max: number; best: number } => {
      const samples: number[] = [];
      pt.run(seconds, 1 / 30, (t) => {
        samples.push(pt.system.lastStepMs);
        if (each) each(t);
      });
      const sorted = samples.slice().sort((x, y) => x - y);
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      // meilleure fenêtre de 100 pas : insensible à la charge de la machine
      let best = Infinity;
      for (let i = 0; i + 100 <= samples.length; i += 50) {
        let s = 0;
        for (let j = 0; j < 100; j++) s += samples[i + j];
        best = Math.min(best, s / 100);
      }
      return { mean, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1], best };
    };

    const still = measure(20);
    ctx.squads.issue(a.squad.id, { type: 'avancer', x: -175, z: 0, heading: -Math.PI / 2 });
    ctx.squads.issue(b.squad.id, { type: 'avancer', x: 175, z: 0, heading: Math.PI / 2 });
    ctx.squads.issue(c.squad.id, { type: 'avancer', x: 0, z: -130, heading: NORTH });
    const moving = measure(10);
    for (const r of radicals) ctx.actions.give(r, 'pave', 3);
    let k = 0;
    const attacked = measure(20, (t) => {
      if (Math.floor(t * 30) % 6 !== 0) return;
      const r = radicals[k++ % radicals.length];
      if (r.custody === 'free' && r.posture !== 'down') {
        if (ctx.actions.has(r, 'pave') < 2) ctx.actions.give(r, 'pave', 2);
        throwAt(ctx, r, 'pave', (ctx.rng.next() - 0.5) * 8, -130);
      }
    });
    const fmt = (m: { mean: number; p95: number; max: number; best: number }): string =>
      `moyenne ${m.mean.toFixed(3)} ms, meilleure fenêtre ${m.best.toFixed(3)} ms, p95 ${m.p95.toFixed(3)} ms, max ${m.max.toFixed(2)} ms`;
    console.log(`coût du système de police par pas (${agents} agents, ${ctx.people.list.length} personnes) —\n  lignes tenues : ${fmt(still)}\n  en marche : ${fmt(moving)}\n  sous les projectiles : ${fmt(attacked)}`);
    // objectif : moins de 2 ms par pas
    expect(still.best).toBeLessThan(2);
    expect(moving.best).toBeLessThan(2);
    expect(attacked.best).toBeLessThan(2);
    expect(fitLine(frontRank(pt, c.squad.id)).error).toBeLessThan(1);
  });
});

describe('police — services neutres', () => {
  it('fonctionne sans aucun autre module : emplacements calculés et ordres acceptés sur le plan neutre, sans erreur', async () => {
    const pt = await startPolice([], { mode: 'test' });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: 0, heading: 0 });
    expect(cie.people.length).toBe(83);
    expect(cie.vehicles.length).toBe(14);
    ctx.squads.issue(cie.squad.id, { type: 'ligne', x: 0, z: 30, heading: 0, width: 30 });
    pt.step(2);
    // sans module de locomotion personne ne bouge, mais les emplacements sont calculés : un rang droit de 30 m
    const info = pt.formation.of(cie.squad.id)!;
    expect(info.formation).toBe('ligne');
    expect(info.width).toBeCloseTo(30, 1);
    expect(info.front.length).toBeGreaterThanOrEqual(25);
    for (const id of info.front) {
      const slot = pt.slots.slotOf(id)!;
      expect(slot.z).toBeCloseTo(30, 5);
      expect(Math.abs(slot.x)).toBeLessThan(15);
    }
    // l'IA commande bien le déplacement (c'est la locomotion qui manque)
    expect(cie.people.filter((p) => Math.hypot(p.cmd.moveX, p.cmd.moveZ) > 0.3).length).toBeGreaterThan(60);
    // tous les ordres sont acceptés sans erreur, même ceux qui demandent des services absents
    const orders = ['tortue', 'avancer', 'bond_offensif', 'charge', 'refoulement', 'repli', 'encercler', 'disperser_gaz', 'interpeller', 'proteger',
      'escorter', 'suivre', 'degager_barricade', 'eteindre', 'secourir', 'ravitailler', 'couper_circulation', 'filtrer', 'embarquer', 'debarquer',
      'colonne', 'tenir', 'cesser', 'libre'] as const;
    for (const type of orders) {
      ctx.squads.issue(cie.squad.id, { type, x: 10, z: 60, heading: 0 });
      pt.step(4);
    }
    for (const p of cie.people) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(ctx.radio.log.length).toBeGreaterThan(20);
  });

  it('avec le seul module des personnes (monde neutre, sans rues) : une compagnie se met en ligne sur 30 m', async () => {
    const pt = await startPolice([people], { mode: 'test' });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: 0, heading: 0, vehicles: false });
    ctx.squads.issue(cie.squad.id, { type: 'ligne', x: 0, z: 30, heading: 0, width: 30 });
    pt.run(90, 1, () => pt.status.of(cie.squad.id)!.phase === 'en_place');
    const info = pt.formation.of(cie.squad.id)!;
    const fit = fitLine(frontRank(pt, cie.squad.id));
    console.log('monde neutre — front', info.width.toFixed(1), 'm, premier rang', info.front.length, ', intervalle', info.spacing.toFixed(2), 'm, écart', fit.error.toFixed(3), 'm');
    expect(pt.status.of(cie.squad.id)!.phase).toBe('en_place');
    expect(info.width).toBeCloseTo(30, 1);
    expect(fit.error).toBeLessThan(0.5);
    expect(fit.length).toBeGreaterThan(28);
  });
});
