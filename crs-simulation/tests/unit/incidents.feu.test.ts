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

  it('doublons : trois bacs en feu côte à côte et la nappe au sol font UN incident ; un feu plus loin en fait un autre', async () => {
    const { t, ctx, incidents, records, ext } = await start(12);
    const at = roadPoint(ctx, 0, -230);
    const bins: Prop[] = [];
    for (let i = 0; i < 3; i++) bins.push(ctx.props.spawn('conteneur', at.x + (i - 1) * 2.4, at.z, 0));
    const far = ctx.props.spawn('poubelle', at.x, at.z + 45, 0);
    for (const b of bins) expect(ext.ignite(b, 0)).toBe(true);
    expect(ext.ignite(far, 0)).toBe(true);
    // un engin incendiaire tombe au pied des bacs : même feu
    ctx.hazards.ignite(at.x + 0.5, at.z + 1, 1.25, 1, 0);
    t.step(12);
    const active = incidents.list.filter((i) => i.state === 'ouvert');
    console.log('[incidents] feux :', active.map((i) => `« ${i.label} » (${i.targetKind} ${i.targetId}) gravité ${i.severity.toFixed(2)}`).join(' | '));
    expect(active.length).toBe(2);
    const group = active.find((i) => Math.hypot(i.x - at.x, i.z - at.z) < 6)!;
    const single = active.find((i) => i !== group)!;
    expect(records.of(group.id)!.merged).toBe(2);
    expect(records.of(single.id)!.merged).toBe(0);
    expect(single.targetId).toBe(far.id);
    // trois foyers pèsent plus lourd qu'un seul au même âge
    expect(group.severity).toBeGreaterThan(single.severity);
    // éteindre un seul bac ne clôt pas l'incident ; les éteindre tous, si
    for (let i = 0; i < 80 && bins[0].state === 'burning'; i++) {
      ctx.hazards.douse(bins[0].x, bins[0].z, 0.8, 0.2);
      t.step(0.1);
    }
    t.step(4);
    expect(group.state).toBe('ouvert');
    for (let i = 0; i < 400 && bins.some((b) => b.state === 'burning'); i++) {
      for (const b of bins) ctx.hazards.douse(b.x, b.z, 1.5, 0.3);
      t.step(0.1);
    }
    t.step(5);
    expect(bins.every((b) => b.state !== 'burning')).toBe(true);
    expect(group.state).toBe('resolu');
    expect(single.state).toBe('ouvert');
  });

  it('feu au sol : signalé seulement s\'il dure ; non traité, un feu qui se propage est porté « aggravé » au journal', async () => {
    const { t, ctx, incidents, records, ext } = await start(13);
    const at = roadPoint(ctx, 0, -230);
    // nappe au sol (engin incendiaire) : rien pendant les premières secondes
    ctx.hazards.ignite(at.x, at.z, 1.25, 1, 0);
    t.step(3);
    expect(incidents.list.length).toBe(0);
    t.step(4);
    expect(incidents.list.length).toBe(1);
    const ground = incidents.list[0];
    expect(ground.kind).toBe('feu_poubelle');
    expect(ground.targetKind).toBe('place');
    expect(ground.label.startsWith('Feu sur la chaussée')).toBe(true);
    // elle s'éteint d'elle-même en une demi-minute : clos sans traitement (personne n'a rien fait)
    t.step(50);
    expect(ground.state).toBe('echoue');
    expect(records.of(ground.id)!.outcome).toBe('cause_disparue');

    // une poubelle brûle contre un conteneur : le feu gagne le voisin
    const bin = ctx.props.spawn('poubelle', at.x, at.z + 30, 0);
    const bac = ctx.props.spawn('conteneur', at.x + 1.65, at.z + 30, 0);
    expect(ext.ignite(bin, 0)).toBe(true);
    t.step(2);
    const inc = incidents.list.find((i) => i.targetId === bin.id)!;
    let spread = -1;
    for (let i = 0; i < 140 && spread < 0; i++) {
      t.step(1);
      if (bac.state === 'burning') spread = i;
    }
    expect(spread).toBeGreaterThan(20);
    t.step(3);
    const rec = records.of(inc.id)!;
    console.log(`[incidents] propagation au conteneur après ${spread} s : aggravations ${rec.aggravations}, gravité ${rec.severityStart.toFixed(2)} → ${inc.severity.toFixed(2)}, urgence ${inc.urgency}`);
    expect(rec.merged).toBe(1);
    expect(rec.aggravated).toBe(true);
    expect(inc.severity).toBeGreaterThan(rec.severityStart + 0.2);
    expect(records.stats().aggravated).toBe(1);
    expect(records.summary().some((l) => /aggravé/.test(l))).toBe(true);
  });
});
