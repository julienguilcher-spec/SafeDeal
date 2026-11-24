// Foule — le métro comme source d'affluence : service EXT.metro (MetroApi), vagues, fermeture d'une station
// (flux reporté sur la voisine avec retard), sortie filtrée (débit réduit, tension).
import { describe, expect, it } from 'vitest';
import { EXT } from '@/core/extensions';
import type { MetroApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { METRO_EVENT } from '@/sim/crowd';
import type { MetroEvent } from '@/sim/crowd';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

const MODULES = [world, people, items, hazards, law];
const EXTRA = { 'crowd.noAleas': true, 'crowd.bystanders': 0 };

interface Flow { t: number; main: number; quay: number; present: number }

/** Déroule le rassemblement et relève les sorties par station ; `act` intervient à l'instant donné. */
async function gather(act: ((metro: MetroApi, t: number) => void) | null, actAt: number, seconds: number): Promise<{ flow: Flow[]; events: MetroEvent[]; reasons: string[]; names: string[] }> {
  const t = createCrowdTest({ seed: 4, modules: MODULES });
  const { ctx } = t;
  const events: MetroEvent[] = [];
  ctx.events.onAny(METRO_EVENT, (e) => events.push({ ...(e as MetroEvent) }));
  const reasons: string[] = [];
  ctx.events.on('crowd:tension', (e) => reasons.push(e.reason));
  await t.start(demoConfig({ crowdSize: 400, duration: 'standard', extra: EXTRA }));
  const metro = ctx.require<MetroApi>(EXT.metro);
  const flow: Flow[] = [];
  let done = false;
  for (let s = 0; s < seconds; s += 5) {
    if (act && !done && ctx.clock.now >= actAt) {
      act(metro, ctx.clock.now);
      done = true;
    }
    t.run(5);
    flow.push({ t: ctx.clock.now, main: metro.stations[0]!.arrived, quay: metro.stations[1]!.arrived, present: ctx.director.stats.present });
  }
  return { flow, events, reasons, names: metro.stations.map((s) => s.name) };
}

describe('foule — métro', () => {
  it('publie les stations du quartier avec leurs bouches (MetroApi)', async () => {
    const t = createCrowdTest({ seed: 4, modules: MODULES });
    await t.start(demoConfig({ crowdSize: 100, extra: EXTRA }));
    const metro = t.ctx.require<MetroApi>(EXT.metro);
    expect(metro.stations.length).toBe(2);
    const main = metro.stations[0]!;
    const quay = metro.stations[1]!;
    expect(main.name).toBe("Rond-Point de l'Essai");
    // deux bouches précises lues dans les tuiles (service 'world.data'), une pour la station du quai
    expect(main.entrances.length).toBe(4);
    expect(quay.entrances.length).toBe(2);
    expect(Math.hypot(main.entrances[0]!, main.entrances[1]!)).toBeCloseTo(50, 0);
    expect(main.x).toBe(main.entrances[0]);
    expect(main.open && quay.open).toBe(true);
    expect(main.filtered).toBe(false);
    expect(metro.get(main.id)).toBe(main);
    expect(metro.get(99)).toBeUndefined();
    expect(metro.nearest(0, 0, 100)).toBe(main);
    expect(metro.nearest(-24, 290, 50)).toBe(quay);
    expect(metro.nearest(400, -400, 50)).toBeNull();
    // les bouches sont à l'air libre
    for (const s of metro.stations) for (let i = 0; i < s.entrances.length; i += 2) expect(t.ctx.world.isFree(s.entrances[i]!, s.entrances[i + 1]!, 0.3)).toBe(true);
  });

  it('fait sortir les manifestants par vagues, et reporte le flux quand on ferme une station', async () => {
    const open = await gather(null, 0, 170);
    const closed = await gather((metro) => metro.setOpen(metro.stations[0]!.id, false, 0), 30, 330);
    const last = (r: { flow: Flow[] }, before: number): Flow => r.flow.filter((f) => f.t <= before + 0.01).pop()!;

    // ── témoin : les deux stations débitent pendant tout le rassemblement, la plus proche davantage ──
    const o = last(open, 170);
    expect(o.main).toBeGreaterThan(60);
    expect(o.quay).toBeGreaterThan(10);
    expect(o.main).toBeGreaterThan(o.quay);
    const waves = open.events.filter((e) => e.type === 'vague');
    expect(waves.length).toBeGreaterThanOrEqual(6);
    // débit instantané publié (personnes par minute) non nul pendant une vague
    expect(open.flow.length).toBeGreaterThan(20);

    // ── station fermée à t = 30 s : sa bouche se tarit aussitôt ──
    const at30 = last(closed, 35).main;
    const end = last(closed, 330);
    expect(end.main - at30).toBeLessThanOrEqual(1);
    expect(end.main).toBeLessThan(o.main * 0.6);
    expect(closed.events.some((e) => e.type === 'fermeture' && e.name === closed.names[0])).toBe(true);
    const report = closed.events.find((e) => e.type === 'report');
    expect(report).toBeDefined();
    expect(report!.count).toBeGreaterThan(20);
    expect(report!.toStationId).toBe(2);
    // ── le flux est reporté sur la station voisine, AVEC RETARD (60 à 120 s) ──
    const c90 = last(closed, 85);
    const o90 = last(open, 85);
    // juste après la fermeture : pas encore de report (la voisine débite comme dans le témoin)
    expect(c90.quay).toBeLessThanOrEqual(o90.quay + 12);
    // ensuite : nettement plus de monde à la station voisine que dans le témoin
    expect(end.quay).toBeGreaterThan(o.quay + 25);
    const surplus = end.quay - o.quay;
    const lost = o.main - end.main;
    console.log('[foule] métro : témoin', JSON.stringify(o), '| station fermée à 30 s', JSON.stringify(end), '| report annoncé', report!.count, '| surplus à la voisine', surplus, 'pour', lost, 'sorties perdues');
    // ≈ 70 % du flux tari se retrouve à la voisine ; le reste arrive à pied : la foule finit par être là
    expect(surplus).toBeGreaterThan(lost * 0.4);
    expect(surplus).toBeLessThan(lost * 1.05);
    expect(end.present).toBeGreaterThan(o.present * 0.85);
    // le témoin, lui, n'a connu ni fermeture ni report
    expect(open.events.some((e) => e.type === 'fermeture' || e.type === 'report')).toBe(false);
  }, 600_000);

  it('une sortie filtrée ralentit l\'arrivée et fait monter la tension', async () => {
    const free = await gather(null, 0, 120);
    const filtered = await gather((metro) => {
      metro.setFiltered(metro.stations[0]!.id, true, 7);
      metro.setFiltered(metro.stations[1]!.id, true, 7);
    }, 0, 120);
    const a = free.flow[free.flow.length - 1]!;
    const b = filtered.flow[filtered.flow.length - 1]!;
    console.log('[foule] métro filtré : sorties libres', a.main + a.quay, '| filtrées', b.main + b.quay);
    expect(b.main + b.quay).toBeLessThan((a.main + a.quay) * 0.75);
    expect(filtered.events.filter((e) => e.type === 'filtrage').length).toBe(2);
    expect(filtered.reasons).toContain('filtrage_metro');
    expect(free.reasons).not.toContain('filtrage_metro');
  }, 600_000);

  it('stations fermées dès le départ (configuration) : personne n\'en sort, la foule vient autrement', async () => {
    const t = createCrowdTest({ seed: 4, modules: MODULES });
    await t.start(demoConfig({ crowdSize: 200, extra: { ...EXTRA, 'crowd.closedStations': ["Rond-Point de l'Essai"] } }));
    const metro = t.ctx.require<MetroApi>(EXT.metro);
    expect(metro.stations[0]!.open).toBe(false);
    t.run(260);
    expect(metro.stations[0]!.arrived).toBe(0);
    expect(metro.stations[1]!.arrived).toBeGreaterThan(20);
    expect(t.ctx.director.stats.present).toBeGreaterThan(150);
  }, 300_000);
});
