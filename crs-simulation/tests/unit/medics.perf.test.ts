// Médecins de rue — déterminisme (même graine : mêmes gestes aux mêmes instants), coût par pas avec 1 500 personnes
// et douze secouristes au travail, fonctionnement avec les seuls services neutres.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import type { CareApi, CareRecord } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';
import { createSystems as medicsModule, MEDICS_SYSTEM_ID } from '@/sim/roles/medics';
import type { MedicsRecords } from '@/sim/roles/medics';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule, medicsModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function spot(ctx: GameContext, x: number, z: number, radius: number, surface: 'road' | 'sidewalk' | 'any' = 'any'): { x: number; z: number } {
  const out = { x, z };
  if (!ctx.world.randomFreePoint(x, z, radius, surface, () => ctx.rng.next(), out)) throw new Error(`aucun point libre près de (${x} ; ${z})`);
  return out;
}

/** Trois secouristes, un nuage de gaz sur un groupe, deux blessés : tous les gestes jusqu'au calme. */
async function play(seed: number): Promise<string> {
  const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA }, seed);
  const { ctx } = rig;
  const log: string[] = [];
  const stamp = (): string => ctx.clock.now.toFixed(2);
  ctx.events.onAny('care:done', (payload) => {
    const r = payload as CareRecord;
    log.push(`${stamp()} ${r.verb} ${r.byId} → ${r.targetId} ${r.triage} ${r.injuryBefore}>${r.injuryAfter} gaz ${r.gasBefore.toFixed(3)}`);
  });
  ctx.events.onAny('medics:call', (payload) => log.push(`${stamp()} signalement ${JSON.stringify(payload)}`));
  ctx.events.onAny('rescue:call', (payload) => log.push(`${stamp()} secours ${JSON.stringify(payload)}`));
  const crowd: Person[] = [];
  for (let i = 0; i < 16; i++) {
    const p = spot(ctx, 0, -230, 12);
    crowd.push(ctx.archetypes.spawn('manifestant', p.x, p.z, { profile: 'pacifique', seed: 200 + i }));
  }
  const medics: Person[] = [];
  for (let i = 0; i < 3; i++) {
    const p = spot(ctx, 0, -212, 8);
    medics.push(ctx.archetypes.spawn('street_medic', p.x, p.z, { seed: 60 + i }));
  }
  rig.step(2);
  for (let i = 0; i < 6; i++) crowd[i].gas = 0.4 + 0.1 * i;
  wound(ctx, crowd[8], 'critical');
  wound(ctx, crowd[11], 'light');
  rig.step(150);
  const rec = ctx.require<MedicsRecords>('medics.records');
  log.push('bilan ' + JSON.stringify(rec.npc));
  let print = '';
  for (const p of ctx.people.list as readonly Person[]) print += `${p.id}:${p.kind}:${p.x.toFixed(2)},${p.z.toFixed(2)},${p.health.toFixed(1)},${p.gas.toFixed(3)};`;
  log.push(print);
  return log.join('\n');
}

describe('médecins de rue — déterminisme', () => {
  it('même graine : mêmes gestes, mêmes victimes, mêmes instants ; autre graine : déroulé différent', async () => {
    const a = await play(31);
    const b = await play(31);
    const c = await play(32);
    const lines = a.split('\n');
    expect(lines.filter((l) => l.includes('rincer_yeux')).length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.includes('soigner'))).toBe(true);
    expect(lines.some((l) => l.includes('signalement'))).toBe(true);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    console.log(`[medics] déterminisme : ${lines.length} lignes identiques (graine 31) — ${lines[lines.length - 2]}`);
  }, 300_000);
});

function summary(samples: number[]): { mean: number; best: number; p95: number; max: number; text: string } {
  const sorted = samples.slice().sort((x, y) => x - y);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  let best = Infinity;
  for (let i = 0; i + 100 <= samples.length; i += 50) {
    let s = 0;
    for (let j = 0; j < 100; j++) s += samples[i + j];
    best = Math.min(best, s / 100);
  }
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  return { mean, best, p95, max, text: `moyenne ${mean.toFixed(4)} ms, meilleure fenêtre ${best.toFixed(4)} ms, p95 ${p95.toFixed(3)} ms, max ${max.toFixed(2)} ms` };
}

describe('médecins de rue — coût', () => {
  it('1 500 personnes, douze secouristes : coût par pas au calme, puis avec 60 personnes gazées et 12 blessés', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: 0, extra: EXTRA }, 13);
    const { ctx, t } = rig;
    const out = { x: 0, z: 0 };
    const rnd = (): number => ctx.rng.next();
    const crowd: Person[] = [];
    for (let i = 0; i < 1488; i++) {
      if (!ctx.world.randomFreePoint(0, 0, 330, 'any', rnd, out)) continue;
      crowd.push(ctx.people.spawn({ kind: 'manifestant', x: out.x, z: out.z, profile: 'pacifique' }));
    }
    const medics: Person[] = [];
    for (let i = 0; i < 12; i++) {
      const anchor = crowd[i * 120];
      const p = spot(ctx, anchor.x, anchor.z, 10);
      medics.push(ctx.archetypes.spawn('street_medic', p.x, p.z, { seed: 300 + i }));
    }
    expect(ctx.people.list.length).toBeGreaterThan(1450);
    t.step(2);
    const perf = t.game.perf.find((p) => p.id === MEDICS_SYSTEM_ID)!;
    expect(perf).toBeDefined();
    const measure = (steps: number): number[] => {
      const samples: number[] = [];
      for (let i = 0; i < steps; i++) {
        t.game.step(1 / 30);
        samples.push(perf.updateMs);
      }
      return samples;
    };
    measure(60);
    const quiet = summary(measure(450));
    // autour de chaque secouriste : cinq personnes gazées et un blessé
    const near: Person[] = [];
    let gassed = 0;
    let wounded = 0;
    for (const m of medics) {
      const n = ctx.people.queryRadius(m.x, m.z, 30, near, (q) => q.kind === 'manifestant' && q.gas === 0 && q.injury === 'none');
      for (let i = 0; i < n && i < 6; i++) {
        if (i < 5) {
          near[i].gas = 0.5 + 0.08 * i;
          gassed++;
        } else {
          wound(ctx, near[i], i % 2 === 0 ? 'critical' : 'serious');
          wounded++;
        }
      }
    }
    measure(30);
    const busy = summary(measure(900));
    const rec = ctx.require<MedicsRecords>('medics.records');
    const total = t.game.perf.reduce((s, p) => s + p.avgUpdateMs, 0);
    console.log(`[medics] coût par pas — ${ctx.people.list.length} personnes, ${rec.npc.medics} secouristes :\n  au calme : ${quiet.text}\n  ${gassed} gazés et ${wounded} blessés à prendre en charge : ${busy.text}\n  en 30 s : ${rec.npc.rinses} rinçages, ${rec.npc.treated} soins, ${rec.npc.sheltered} mises à l'abri, ${rec.npc.signalled} signalements\n  (tous systèmes confondus : environ ${total.toFixed(1)} ms par pas)`);
    expect(rec.npc.medics).toBe(12);
    expect(rec.npc.rinses + rec.npc.treated).toBeGreaterThan(5);
    // objectif : bien moins d'une demi-milliseconde par pas
    expect(quiet.best).toBeLessThan(0.3);
    expect(busy.best).toBeLessThan(0.5);
  }, 300_000);
});

describe('médecins de rue — services neutres', () => {
  it('seul, sans aucun autre module : le service de soins est créé, un secouriste est pris en compte, rien ne lève d\'erreur', async () => {
    const t = createTestContext({ seed: 5, modules: [medicsModule] });
    await t.start({ mode: 'test' });
    const ctx = t.ctx;
    const rec = ctx.require<MedicsRecords>('medics.records');
    expect(ctx.service<CareApi>('roles.care')).toBeDefined();
    const medic = ctx.people.spawn({ kind: 'street_medic', x: 0, z: 0 });
    const gassed = ctx.people.spawn({ kind: 'manifestant', x: 4, z: 2 });
    gassed.gas = 0.8;
    const down = ctx.people.spawn({ kind: 'manifestant', x: -5, z: 3 });
    down.posture = 'down';
    down.injury = 'serious';
    down.health = 40;
    t.step(60);
    expect(rec.npc.medics).toBe(1);
    expect(rec.score).toBe(0);
    expect(rec.board.length).toBe(0);
    expect(rec.summary().length).toBeGreaterThan(0);
    // le secouriste est commandé (il veut rejoindre quelqu'un), jamais déplacé directement
    expect(medic.x).toBe(0);
    expect(medic.z).toBe(0);
    expect(Math.abs(medic.cmd.moveX) + Math.abs(medic.cmd.moveZ)).toBeGreaterThan(0);
  });
});
