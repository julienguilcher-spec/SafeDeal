// Secours — déterminisme (même graine : mêmes délais, mêmes états, mêmes soins), coût par pas avec 1 500 personnes
// et quatre équipages engagés, fonctionnement avec les seuls services neutres.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescueModule, RESCUE_SYSTEM_ID } from '@/sim/roles/rescue';
import type { CareRecord, RescueExtApi, RescueRecords } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function spot(ctx: GameContext, x: number, z: number, radius: number, surface: 'road' | 'sidewalk' | 'any' = 'road'): { x: number; z: number } {
  const out = { x, z };
  if (!ctx.world.randomFreePoint(x, z, radius, surface, () => ctx.rng.next(), out)) throw new Error(`aucun point libre près de (${x} ; ${z})`);
  return out;
}

/** Un feu et un blessé grave, pompiers et SAMU appelés : tout le déroulé jusqu'au départ des deux engins. */
async function play(seed: number): Promise<string> {
  const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA }, seed);
  const { ctx, rescue } = rig;
  const propsExt = ctx.require<PropsExtApi>('props.ext');
  const log: string[] = [];
  const stamp = (): string => ctx.clock.now.toFixed(2);
  ctx.events.onAny('rescue:call', (payload) => {
    const e = payload as { callId: number; state: string };
    const c = rescue.calls.find((k) => k.id === e.callId);
    log.push(`${stamp()} appel ${e.callId} ${e.state} ${c ? c.eta.toFixed(2) + ' ' + c.waitingReason : ''}`);
  });
  ctx.events.onAny('care:done', (payload) => {
    const r = payload as CareRecord;
    log.push(`${stamp()} soin ${r.verb} ${r.byId} → ${r.targetId} ${r.triage} ${r.injuryBefore}>${r.injuryAfter} ${r.stabilised}`);
  });
  ctx.events.onAny('rescue:evacuated', (payload) => log.push(`${stamp()} évacuation ${JSON.stringify(payload)}`));
  ctx.events.on('fire:out', (e) => log.push(`${stamp()} feu éteint ${e.x.toFixed(2)},${e.z.toFixed(2)}`));
  const a = spot(ctx, 0, -230, 5);
  const bin = ctx.props.spawn('conteneur', a.x, a.z, 0);
  propsExt.ignite(bin, 0);
  const b = spot(ctx, 0, -205, 6, 'any');
  const victim = ctx.archetypes.spawn('manifestant', b.x, b.z, { profile: 'pacifique', seed: 3 });
  for (let i = 0; i < 8; i++) {
    const p = spot(ctx, 0, -218, 14, 'any');
    ctx.archetypes.spawn('manifestant', p.x, p.z, { profile: 'pacifique', seed: 40 + i });
  }
  rig.step(8);
  wound(ctx, victim, 'critical');
  const fire = rescue.request('pompiers', bin.x, bin.z, 0);
  const samu = rescue.request('samu', victim.x, victim.z, 0);
  log.push(`délais annoncés ${fire.eta.toFixed(3)} ${samu.eta.toFixed(3)}`);
  rig.run(600, 0.5, () => fire.state === 'reparti' && samu.state === 'reparti');
  rig.step(20);
  const records = ctx.require<RescueRecords>('rescue.records');
  for (const r of records.all) {
    log.push(`fiche ${r.callId} ${r.kind} ${r.departedAt.toFixed(2)} ${r.arrivedAt.toFixed(2)} ${r.leftAt.toFixed(2)} ${r.waited.toFixed(2)} ${r.firesOut} ${r.victimsTreated} ${r.victimsEvacuated} ${r.points}`);
  }
  log.push('radio ' + ctx.radio.log.map((m) => m.t.toFixed(2) + ' ' + m.text).join(' # '));
  let print = '';
  for (const p of ctx.people.list as readonly Person[]) print += `${p.id}:${p.kind}:${p.x.toFixed(2)},${p.z.toFixed(2)},${p.health.toFixed(1)};`;
  for (const v of ctx.vehicles.list) print += `v${v.id}:${v.x.toFixed(2)},${v.z.toFixed(2)};`;
  log.push(print);
  log.push(`états ${rig.states(fire).join('>')} | ${rig.states(samu).join('>')} | victime ${victim.health.toFixed(2)} ${victim.vehicleId !== 0 || ctx.people.get(victim.id) === undefined}`);
  return log.join('\n');
}

describe('secours — déterminisme', () => {
  it('même graine : mêmes délais, mêmes états aux mêmes instants, mêmes soins ; autre graine : déroulé différent', async () => {
    const a = await play(21);
    const b = await play(21);
    const c = await play(22);
    const lines = a.split('\n');
    expect(lines.some((l) => l.includes('sur_place'))).toBe(true);
    expect(lines.some((l) => l.includes('soin soigner'))).toBe(true);
    expect(lines.some((l) => l.includes('feu éteint'))).toBe(true);
    expect(lines[lines.length - 1]).toMatch(/reparti \| .*reparti/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    console.log(`[secours] déterminisme : ${lines.length} lignes identiques (graine 21) — ${lines[lines.length - 1]}`);
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

describe('secours — coût', () => {
  it('1 500 personnes : coût par pas sans appel, puis avec deux engins-pompes et deux ambulances engagés (trajet, travail sur place)', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: 0, extra: { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.15 } }, 9);
    const { ctx, rescue, t } = rig;
    const propsExt = ctx.require<PropsExtApi>('props.ext');
    const ext = ctx.require<RescueExtApi>('rescue.ext');
    const out = { x: 0, z: 0 };
    const rnd = (): number => ctx.rng.next();
    const crowd: Person[] = [];
    for (let i = 0; i < 1470; i++) {
      // sur les trottoirs : la chaussée reste libre pour les engins
      if (!ctx.world.randomFreePoint(0, 0, 330, 'sidewalk', rnd, out)) continue;
      crowd.push(ctx.people.spawn({ kind: 'manifestant', x: out.x, z: out.z, profile: 'pacifique' }));
    }
    expect(crowd.length).toBeGreaterThan(1400);
    t.step(2);
    const perf = t.game.perf.find((p) => p.id === RESCUE_SYSTEM_ID)!;
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
    const idle = summary(measure(300));

    // deux feux et deux blessés graves, à quatre endroits de la rue du Pont
    const fireA = spot(ctx, 0, -230, 5);
    const fireB = spot(ctx, 0, -150, 6);
    const binA = ctx.props.spawn('conteneur', fireA.x, fireA.z, 0);
    const binB = ctx.props.spawn('conteneur', fireB.x, fireB.z, 0);
    propsExt.ignite(binA, 0);
    propsExt.ignite(binB, 0);
    const vA = ctx.archetypes.spawn('manifestant', fireA.x + 2, fireA.z + 14, { profile: 'pacifique', seed: 1 });
    const vB = ctx.archetypes.spawn('manifestant', fireB.x - 2, fireB.z + 12, { profile: 'pacifique', seed: 2 });
    wound(ctx, vA, 'critical');
    wound(ctx, vB, 'critical');
    const calls = [
      rescue.request('pompiers', binA.x, binA.z, 0),
      rescue.request('pompiers', binB.x, binB.z, 0),
      rescue.request('samu', vA.x, vA.z, 0),
      rescue.request('samu', vB.x, vB.z, 0),
    ];
    expect(new Set(calls).size).toBe(4);
    // trajet : tous partis
    let guard = 0;
    while (calls.some((c) => c.state === 'demande') && guard++ < 1800) t.game.step(1 / 30);
    expect(calls.every((c) => c.state !== 'demande')).toBe(true);
    expect(ext.crews.length).toBe(4);
    const travel = summary(measure(300));
    // sur place : on attend le premier arrivé, puis on mesure le travail (lance, soins, brancardage)
    guard = 0;
    while (!calls.some((c) => c.state === 'sur_place') && guard++ < 7200) t.game.step(1 / 30);
    expect(calls.some((c) => c.state === 'sur_place')).toBe(true);
    const work = summary(measure(900));
    const total = t.game.perf.reduce((s, p) => s + p.avgUpdateMs, 0);
    console.log(`[secours] coût par pas — ${ctx.people.list.length} personnes, ${ext.crews.length} équipages (${calls.map((c) => c.state).join(', ')}) :\n  sans appel : ${idle.text}\n  quatre engins en route : ${travel.text}\n  travail sur place : ${work.text}\n  (tous systèmes confondus : environ ${total.toFixed(1)} ms par pas)`);
    // objectif : bien moins d'une demi-milliseconde par pas
    expect(idle.best).toBeLessThan(0.1);
    expect(travel.best).toBeLessThan(0.5);
    expect(work.best).toBeLessThan(0.5);
  }, 300_000);
});

describe('secours — services neutres', () => {
  it('seul, sans aucun autre module : les appels sont acceptés, suivis, puis annulés proprement faute d\'accès', async () => {
    const t = createTestContext({ seed: 5, modules: [rescueModule] });
    await t.start({ mode: 'test' });
    const ctx = t.ctx;
    const rescue = ctx.require<RescueApi>(EXT.rescue);
    const ext = ctx.require<RescueExtApi>('rescue.ext');
    const fire = rescue.request('pompiers', 50, 50, 0);
    const samu = rescue.request('samu', -40, 20, 0);
    expect(fire.state).toBe('demande');
    expect(fire.eta).toBeGreaterThan(0);
    t.step(60);
    expect(fire.state).toBe('en_route');
    expect(ext.crews.length).toBe(2);
    // rien ne fait avancer les personnes sur le plan neutre : au bout du délai de garde, les appels sont annulés
    t.step(200);
    expect(fire.state).toBe('annule');
    expect(samu.state).toBe('annule');
    expect(fire.waitingReason.length).toBeGreaterThan(0);
    expect(ext.crews.length).toBe(0);
    expect(ctx.people.list.length).toBe(0);
    // annulation immédiate d'un appel pas encore parti
    const again = rescue.request('samu', 10, 10, 0);
    rescue.cancel(again.id);
    t.step(2);
    expect(again.state).toBe('annule');
    expect(ctx.require<RescueRecords>('rescue.records').summary().length).toBeGreaterThan(0);
  });
});
