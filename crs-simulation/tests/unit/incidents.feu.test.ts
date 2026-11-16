// Incidents — feux : détection, gravité qui monte faute de traitement, extinction, clôture, regroupement des foyers.
import { describe, expect, it } from 'vitest';
import type { GameContext, Prop } from '@/core/contracts';
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
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as incidentsModule } from '@/gameplay/incidents';
import type { IncidentsRecords } from '@/gameplay/incidents';

const MODULES = [world, people, items, hazards, law, props, vehicles, incidentsModule];

async function start(seed = 11) {
  const t = createTestContext({ seed, modules: MODULES });
  // rue du Pont (axe nord-sud, x = 0), loin de la place centrale
  await t.start({ mode: 'test', x: 0, z: -230, extra: { props: { ambientDensity: 0 } } });
  const ctx = t.ctx;
  const incidents = ctx.require<IncidentsApi>(EXT.incidents);
  const records = ctx.require<IncidentsRecords>('incidents.records');
  const ext = ctx.require<PropsExtApi>('props.ext');
  return { t, ctx, incidents, records, ext };
}

/** Point libre sur la chaussée près de (x, z). */
function roadPoint(ctx: GameContext, x: number, z: number): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, 6, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

/** Arrose le point comme le ferait un extincteur (1 unité par seconde) pendant `seconds`. */
function douse(t: { step(s: number): void }, ctx: GameContext, x: number, z: number, seconds: number, rate = 1): void {
  for (let i = 0; i < seconds * 10; i++) {
    ctx.hazards.douse(x, z, 1.5, rate * 0.1);
    t.step(0.1);
  }
}

describe('incidents — feux', () => {
  it('un feu de poubelle crée un incident localisé dont la gravité monte, puis redescend et se clôt quand il est éteint', async () => {
    const { t, ctx, incidents, records, ext } = await start();
    const at = roadPoint(ctx, 0, -230);
    const author = ctx.people.spawn({ kind: 'manifestant', x: at.x + 1.5, z: at.z, profile: 'radical' });
    const bin: Prop = ctx.props.spawn('poubelle', at.x, at.z, 0);
    expect(incidents.list.length).toBe(0);
    expect(ext.ignite(bin, author.id)).toBe(true);
    t.step(0.2);
    expect(incidents.list.length).toBe(1);
    const inc = incidents.list[0];
    expect(inc.kind).toBe('feu_poubelle');
    expect(inc.targetKind).toBe('prop');
    expect(inc.targetId).toBe(bin.id);
    expect(inc.state).toBe('ouvert');
    expect(inc.label.startsWith('Feu de poubelles')).toBe(true);
    const sector = ctx.world.sectorName(at.x, at.z);
    expect(sector.length).toBeGreaterThan(0);
    expect(inc.label).toBe(`Feu de poubelles, ${sector}`);
    console.log('[incidents] libellé :', inc.label, '| urgence', inc.urgency);

    // la gravité monte tant que rien n'est fait
    const curve: number[] = [inc.severity];
    for (let i = 0; i < 6; i++) {
      t.step(10);
      curve.push(inc.severity);
    }
    console.log('[incidents] gravité sans traitement (toutes les 10 s) :', curve.map((v) => v.toFixed(2)).join(' → '));
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] - 1e-9);
    expect(curve[curve.length - 1]).toBeGreaterThan(curve[0] + 0.1);
    expect(inc.state).toBe('ouvert');
    // le feu de la poubelle allume une nappe au sol : elle ne fait pas un second incident
    expect(incidents.list.length).toBe(1);

    // extinction : la gravité redescend, puis l'incident se clôt de lui-même
    const peak = inc.severity;
    douse(t, ctx, bin.x, bin.z, 4);
    const during = inc.severity;
    let closedAfter = -1;
    const t0 = ctx.clock.now;
    for (let i = 0; i < 200 && inc.state !== 'resolu' && inc.state !== 'echoue'; i++) {
      ctx.hazards.douse(bin.x, bin.z, 1.5, 0.1);
      t.step(0.1);
    }
    closedAfter = ctx.clock.now - t0 + 4;
    console.log('[incidents] gravité au pic', peak.toFixed(2), '→ pendant l’arrosage', during.toFixed(2), '| clos après', closedAfter.toFixed(1), 's d’arrosage, état', inc.state);
    expect(during).toBeLessThan(peak);
    expect(bin.state).not.toBe('burning');
    expect(inc.state).toBe('resolu');
    const rec = records.of(inc.id)!;
    expect(rec.outcome).toBe('traite');
    expect(rec.severityPeak).toBeGreaterThan(rec.severityStart);
    expect(rec.closedAt).toBeGreaterThan(rec.createdAt);
    // un incident clos quitte la liste publiée au bout de quelques secondes, la fiche reste
    t.step(15);
    expect(incidents.list.length).toBe(0);
    expect(incidents.get(inc.id)).toBeUndefined();
    expect(records.all.length).toBe(1);
  });
});
