// Incidents — déterminisme (même graine : même journal), coût par pas avec 1 500 personnes et 2 500 objets,
// fonctionnement avec les seuls services neutres.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Prop } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
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
import { createSystems as incidentsModule, INCIDENTS_SYSTEM_ID } from '@/gameplay/incidents';
import type { IncidentEvent, IncidentsRecords } from '@/gameplay/incidents';
import { startIncidents, wound } from '@/gameplay/incidents/testkit';
import { createSystems as rescueModule } from '@/sim/roles/rescue';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidentsModule, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function knockDown(ctx: GameContext, p: Person): void {
  ctx.require<{ knockDown(p: Person, seconds: number, sourceId: number): void }>('people.health').knockDown(p, 0, 0);
}

/** Un déroulé complet : deux feux, deux blessés, délégation aux pompiers et au SAMU, puis le journal. */
async function play(seed: number): Promise<string> {
  const rig = await startIncidents(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA }, seed);
  const { ctx, incidents } = rig;
  const propsExt = ctx.require<PropsExtApi>('props.ext');
  const log: string[] = [];
  const stamp = (): string => ctx.clock.now.toFixed(2);
  for (const type of ['incidents:opened', 'incidents:updated', 'incidents:closed']) {
    ctx.events.onAny(type, (payload) => {
      const e = payload as IncidentEvent;
      const inc = incidents.get(e.id);
      log.push(`${stamp()} ${type} ${e.id} ${e.kind} ${e.change} ${inc ? inc.state + ' ' + inc.severity.toFixed(3) + ' u' + inc.urgency + ' ' + inc.x.toFixed(2) + ',' + inc.z.toFixed(2) : ''}`);
    });
  }
  ctx.events.onAny('rescue:call', (payload) => {
    const e = payload as { callId: number; state: string };
    log.push(`${stamp()} appel ${e.callId} ${e.state}`);
  });
  // positions tirées du générateur de la session : elles dépendent de la graine
  const spot = (radius: number): { x: number; z: number } => {
    const out = { x: 0, z: -230 };
    if (!ctx.world.randomFreePoint(0, -230, radius, 'road', () => ctx.rng.next(), out)) throw new Error('aucun point libre');
    return out;
  };
  const a = spot(4);
  const binA = ctx.props.spawn('conteneur', a.x, a.z, 0);
  const b = spot(40);
  const binB = ctx.props.spawn('poubelle', b.x, b.z + 30, 0);
  const crowd: Person[] = [];
  for (let i = 0; i < 14; i++) {
    const p = spot(18);
    crowd.push(ctx.archetypes.spawn('manifestant', p.x, p.z, { profile: i % 5 === 0 ? 'radical' : 'pacifique', seed: 100 + i }));
  }
  propsExt.ignite(binA, crowd[0].id);
  propsExt.ignite(binB, crowd[5].id);
  rig.step(6);
  wound(ctx, crowd[3], 'critical');
  wound(ctx, crowd[7], 'serious');
  knockDown(ctx, crowd[7]);
  rig.step(14);
  for (const inc of incidents.list) {
    if (inc.state !== 'ouvert') continue;
    if (inc.kind.startsWith('feu')) incidents.assign(inc.id, 'pompiers');
    else if (inc.kind === 'blesse') incidents.assign(inc.id, 'samu');
  }
  rig.step(200);
  const records = ctx.require<IncidentsRecords>('incidents.records');
  for (const r of records.all) log.push(`fiche ${r.id} ${r.kind} ${r.outcome} ${r.severityPeak.toFixed(3)} ${r.createdAt.toFixed(2)} ${r.closedAt.toFixed(2)} ${r.label}`);
  log.push('radio ' + ctx.radio.log.map((m) => m.t.toFixed(2) + ' ' + m.text).join(' # '));
  log.push('bilan ' + JSON.stringify(records.stats()));
  let print = '';
  for (const p of ctx.people.list as readonly Person[]) print += `${p.id}:${p.x.toFixed(2)},${p.z.toFixed(2)},${p.health.toFixed(1)};`;
  log.push(print);
  return log.join('\n');
}

describe('incidents — déterminisme', () => {
  it('même graine : mêmes incidents, mêmes instants, mêmes messages radio ; autre graine : déroulé différent', async () => {
    const a = await play(77);
    const b = await play(77);
    const c = await play(78);
    const lines = a.split('\n');
    expect(lines.filter((l) => l.includes('incidents:opened')).length).toBeGreaterThanOrEqual(3);
    expect(lines.filter((l) => l.includes('incidents:closed')).length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.includes('appel'))).toBe(true);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    console.log(`[incidents] déterminisme : ${lines.length} lignes de journal identiques (graine 77), dont ${lines.filter((l) => l.includes('incidents:')).length} événements d'incident`);
  }, 240_000);
});

/** Résumé d'une série de durées (ms) : moyenne, meilleure fenêtre de 100 pas, 95e centile, maximum. */
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

describe('incidents — coût', () => {
  it('1 500 personnes, 2 500 objets, 60 agents : coût par pas au calme, puis avec 24 incidents ouverts', async () => {
    const rig = await startIncidents([world, people, items, hazards, law, props, vehicles, roles, incidentsModule], { mode: 'test', x: 0, z: 0, extra: { props: { ambientDensity: 0 } } }, 3);
    const { ctx, incidents, t } = rig;
    const propsExt = ctx.require<PropsExtApi>('props.ext');
    const out = { x: 0, z: 0 };
    const rnd = (): number => ctx.rng.next();
    const crowd: Person[] = [];
    for (let i = 0; i < 1440; i++) {
      if (!ctx.world.randomFreePoint(0, 0, 330, 'any', rnd, out)) continue;
      crowd.push(ctx.people.spawn({ kind: 'manifestant', x: out.x, z: out.z, profile: i % 12 === 0 ? 'radical' : 'pacifique' }));
    }
    const agents: Person[] = [];
    for (let i = 0; i < 60; i++) {
      if (!ctx.world.randomFreePoint(0, 0, 330, 'road', rnd, out)) continue;
      agents.push(ctx.archetypes.spawn('crs', out.x, out.z, { seed: 500 + i }));
    }
    const bins: Prop[] = [];
    const kinds = ['poubelle', 'barriere_vauban', 'cone', 'banc', 'potelet'] as const;
    let placed = 0;
    for (let i = 0; i < 2500; i++) {
      if (!ctx.world.randomFreePoint(0, 0, 330, 'any', rnd, out)) continue;
      const p = ctx.props.spawn(kinds[i % kinds.length], out.x, out.z, 0);
      placed++;
      if (p.kind === 'poubelle') bins.push(p);
    }
    expect(crowd.length).toBeGreaterThan(1400);
    expect(placed).toBeGreaterThan(2300);
    t.step(3);
    const perf = t.game.perf.find((p) => p.id === INCIDENTS_SYSTEM_ID)!;
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
    const openQuiet = incidents.list.filter((i) => i.state !== 'resolu' && i.state !== 'echoue').length;

    // 12 feux, 8 blessés graves à terre, 4 incidents signalés à la main
    for (let i = 0; i < 12; i++) propsExt.ignite(bins[i * 7], crowd[i].id);
    for (let i = 0; i < 8; i++) wound(ctx, crowd[100 + i * 40], 'critical');
    const manual = ['pillage', 'barricade', 'automobiliste_bloque', 'pillage'] as const;
    for (let i = 0; i < manual.length; i++) incidents.open(manual[i], agents[i].x + 30, agents[i].z, 'none', 0, 2);
    measure(90);
    const active = incidents.list.filter((i) => i.state !== 'resolu' && i.state !== 'echoue').length;
    const busy = summary(measure(600));
    const total = t.game.perf.reduce((s, p) => s + p.avgUpdateMs, 0);
    console.log(`[incidents] coût par pas — ${ctx.people.list.length} personnes, ${ctx.props.list.length} objets :\n  au calme (${openQuiet} incident ouvert) : ${quiet.text}\n  ${active} incidents ouverts : ${busy.text}\n  (tous systèmes confondus : environ ${total.toFixed(1)} ms par pas)`);
    expect(active).toBeGreaterThanOrEqual(18);
    // objectif : bien moins d'une demi-milliseconde par pas
    expect(quiet.best).toBeLessThan(0.5);
    expect(busy.best).toBeLessThan(0.5);
  }, 240_000);
});

describe('incidents — services neutres', () => {
  it('seul, sans aucun autre module : ouverture, regroupement, délégation refusée proprement, joueur, clôture, journal', async () => {
    const t = createTestContext({ seed: 5, modules: [incidentsModule] });
    await t.start({ mode: 'test' });
    const ctx = t.ctx;
    const incidents = ctx.require<IncidentsApi>(EXT.incidents);
    const records = ctx.require<IncidentsRecords>('incidents.records');
    const a = incidents.open('feu_poubelle', 10, 10, 'none', 0);
    const again = incidents.open('feu_poubelle', 12, 11, 'none', 0);
    expect(again).toBe(a); // doublon voisin : même incident
    const far = incidents.open('pillage', 200, 0, 'none', 0, 3);
    expect(far).not.toBe(a);
    expect(a.label.length).toBeGreaterThan(5);
    t.step(5);
    // aucun moyen n'existe : les délégations sont refusées sans erreur, l'incident reste ouvert
    expect(incidents.assign(a.id, 'unite', 1)).toBe(false);
    expect(incidents.assign(a.id, 'pompiers')).toBe(false);
    expect(incidents.assign(far.id, 'canon_eau')).toBe(false);
    expect(a.state).toBe('ouvert');
    expect(incidents.assign(999, 'unite', 1)).toBe(false);
    t.step(30);
    expect(a.severity).toBeGreaterThan(0);
    incidents.close(a.id, true);
    incidents.close(far.id, false);
    t.step(1);
    expect(a.state).toBe('resolu');
    expect(far.state).toBe('echoue');
    expect(records.all.length).toBe(2);
    expect(records.summary().length).toBeGreaterThan(0);
    expect(incidents.playerIncidentId).toBe(0);
    t.step(40);
  });
});
