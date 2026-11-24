// Foule — une manifestation « standard » de 300 personnes, de bout en bout, dans le quartier d'essai avec
// les modules réels (monde, personnes, matériel, dangers, droit) : phases, cortège, métro, dispersion.
import { beforeAll, describe, expect, it } from 'vitest';
import type { CrowdPhase } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { METRO_EVENT } from '@/sim/crowd';
import type { MetroEvent } from '@/sim/crowd';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

interface Sample { t: number; phase: CrowdPhase; present: number; head: number; speed: number; marching: boolean }

const run = {
  phases: [] as { t: number; phase: CrowdPhase; previous: CrowdPhase }[],
  samples: [] as Sample[],
  inside: 0,
  notFinite: 0,
  offRoute: 0,
  fled: 0,
  removedWithoutFled: 0,
  waves: [] as { t: number; station: string; count: number }[],
  presentAtStart: 0,
  total: 0,
  endTime: 0,
  dispersed: 0,
  presentEnd: 0,
  routeLength: 0,
  peakDensity: 0,
  alerts: 0,
  arrivedByStation: [] as { name: string; arrived: number; departed: number }[],
  maxHeadBack: 0,
  chants: 0,
  cost: { best: 0, median: 0 },
  wall: 0,
};

beforeAll(async () => {
  const t = createCrowdTest({ seed: 11, modules: [world, people, items, hazards, law] });
  const { ctx, core } = t;
  ctx.events.on('crowd:phase', (e) => run.phases.push({ t: ctx.clock.now, phase: e.phase, previous: e.previous }));
  const fledIds = new Set<number>();
  ctx.events.on('person:fled', (e) => {
    run.fled++;
    fledIds.add(e.id);
  });
  ctx.events.on('person:removed', (e) => {
    const p = ctx.people.get(e.id);
    if (p && p.faction === 'protest' && !fledIds.has(e.id)) run.removedWithoutFled++;
  });
  ctx.events.on('crowd:chant', () => run.chants++);
  ctx.events.onAny(METRO_EVENT, (payload) => {
    const e = payload as MetroEvent;
    if (e.type === 'vague') run.waves.push({ t: ctx.clock.now, station: e.name, count: e.count });
  });
  await t.start(demoConfig({ crowdSize: 300, duration: 'standard', tension: 0.1, volatility: 0.15 }));
  run.presentAtStart = ctx.director.stats.present;
  run.total = ctx.director.stats.total;
  run.routeLength = core.route.length;
  const t0 = performance.now();
  let lastHead = ctx.director.headProgress;
  let measured = false;
  for (let k = 0; k < 600; k++) {
    t.run(5);
    const d = ctx.director;
    run.samples.push({ t: ctx.clock.now, phase: d.phase, present: d.stats.present, head: d.headProgress, speed: core.formation.headSpeed, marching: core.formation.marching });
    if (lastHead - d.headProgress > run.maxHeadBack) run.maxHeadBack = lastHead - d.headProgress;
    lastHead = d.headProgress;
    for (const p of core.members) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.cmd.moveX) || !Number.isFinite(p.cmd.moveZ)) run.notFinite++;
      // centre dans un obstacle (immeuble, monument, eau) : même critère que le test d'intégration du dépôt
      else if (!ctx.world.isFree(p.x, p.z, 0.05)) run.inside++;
      const b = brainOf(p)!;
      if ((b.state === 1 || b.state === 2) && b.slot >= 0) {
        core.formation.sample(b.slot, core.slot);
        if (Math.hypot(core.slot.x - p.x, core.slot.z - p.z) > 30) run.offRoute++;
      }
    }
    // coût mesuré pendant la marche seulement (le reste du temps la foule est plus légère)
    if (!measured && d.phase === 'cortege') {
      t.bestCost();
      measured = true;
    } else if (measured && run.cost.best === 0 && d.phase === 'dispersion') run.cost = t.bestCost(30);
    if (d.phase === 'terminee' && core.members.length === 0) break;
  }
  run.wall = performance.now() - t0;
  run.endTime = ctx.clock.now;
  run.dispersed = ctx.director.stats.dispersed;
  run.presentEnd = ctx.director.stats.present;
  run.peakDensity = core.density.peak;
  run.alerts = core.density.alerts;
  run.arrivedByStation = core.metro.stations.map((s) => ({ name: s.name, arrived: s.arrived, departed: s.departed }));
  console.log('[foule] déroulé standard : phases', run.phases.map((p) => Math.round(p.t) + ':' + p.phase).join(' '), '| fin', Math.round(run.endTime), 's | parcours', Math.round(run.routeLength),
    'm | tête', Math.round(lastHead), 'm | stations', JSON.stringify(run.arrivedByStation), '| densité max', run.peakDensity.toFixed(2), '| coût/pas meilleur', run.cost.best.toFixed(3), 'médian', run.cost.median.toFixed(3),
    'ms | temps réel', Math.round(run.wall / 1000), 's');
}, 900_000);

describe('foule — déroulé standard de 300 personnes', () => {
  it('enchaîne toutes les phases dans l\'ordre et se termine', () => {
    const order: CrowdPhase[] = ['rassemblement', 'depart', 'cortege', 'dispersion', 'apres_manif', 'terminee'];
    const base = run.phases.map((p) => p.phase).filter((p) => p !== 'tension' && p !== 'affrontement');
    expect(base).toEqual(order);
    // durées mises à l'échelle du préréglage standard (25 min) : 12 %, 4 %, 44 % de 1 500 s
    const at = (phase: CrowdPhase): number => run.phases.find((p) => p.phase === phase)!.t;
    expect(at('rassemblement')).toBeLessThan(1);
    expect(at('depart')).toBeGreaterThan(170);
    expect(at('depart')).toBeLessThan(260);
    expect(at('cortege') - at('depart')).toBeGreaterThan(50);
    expect(at('cortege') - at('depart')).toBeLessThan(75);
    expect(at('dispersion') - at('cortege')).toBeGreaterThan(200);
    expect(at('dispersion') - at('cortege')).toBeLessThan(700);
    expect(at('terminee')).toBeLessThan(1500 + 3 * 300 + 60);
    // chaque transition porte la phase précédente
    for (let i = 1; i < run.phases.length; i++) expect(run.phases[i]!.previous).toBe(run.phases[i - 1]!.phase);
  });

  it('se termine parce que la foule est partie : moins de 5 % de présents, tous comptés dispersés', () => {
    expect(run.total).toBe(300);
    expect(run.presentEnd).toBe(0);
    expect(run.dispersed).toBeGreaterThanOrEqual(295);
    expect(run.fled).toBeGreaterThanOrEqual(run.dispersed);
    expect(run.removedWithoutFled).toBe(0);
    const end = run.phases.find((p) => p.phase === 'terminee')!;
    const sample = run.samples.find((s) => s.t >= end.t)!;
    expect(sample.present).toBeLessThanOrEqual(0.05 * 300 + 1);
  });

  it('la tête de cortège progresse le long du parcours à 3 – 4 km/h entre deux arrêts, sans jamais reculer', () => {
    const march = run.samples.filter((s) => s.marching);
    expect(march.length).toBeGreaterThan(60);
    const first = march[0]!;
    const last = march[march.length - 1]!;
    const gained = last.head - first.head;
    // de 300 à 700 m en durée standard (bible F.2 : un tronçon de 500 à 700 m, arrêts compris)
    expect(gained).toBeGreaterThan(250);
    expect(gained).toBeLessThan(run.routeLength);
    expect(run.maxHeadBack).toBeLessThan(0.01);
    const moving = march.filter((s) => s.speed > 0.5).map((s) => s.speed);
    expect(moving.length).toBeGreaterThan(30);
    for (const v of moving) expect(v).toBeLessThanOrEqual(1.12);
    const cruise = moving.filter((v) => v > 0.8).length / moving.length;
    expect(cruise).toBeGreaterThan(0.7);
    // des arrêts de marche ont eu lieu (effet d'accordéon)
    expect(march.filter((s) => s.speed < 0.05).length).toBeGreaterThan(3);
    // allure moyenne arrêts compris : nettement sous l'allure de marche
    const mean = gained / (last.t - first.t);
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.95);
  });

  it('personne ne traverse un immeuble, aucune valeur invalide, le cortège ne se disloque pas', () => {
    expect(run.notFinite).toBe(0);
    expect(run.inside).toBe(0);
    expect(run.offRoute).toBe(0);
    expect(run.peakDensity).toBeLessThan(4);
    expect(run.alerts).toBe(0);
  });

  it('arrivée par le métro : un tiers sur place, des vagues pendant le rassemblement, puis des renforts', () => {
    // ≈ 30 % déjà là au début (organisateurs compris)
    expect(run.presentAtStart).toBeGreaterThan(300 * 0.24);
    expect(run.presentAtStart).toBeLessThan(300 * 0.4);
    const depart = run.phases.find((p) => p.phase === 'depart')!.t;
    const gather = run.waves.filter((w) => w.t < depart);
    expect(gather.length).toBeGreaterThanOrEqual(4);
    for (const w of run.waves) {
      expect(w.count).toBeGreaterThanOrEqual(1);
      expect(w.count).toBeLessThanOrEqual(84);
    }
    // vagues espacées de 20 à 40 s par station (jamais deux vagues de la même station à moins de 15 s)
    const byStation = new Map<string, number[]>();
    for (const w of run.waves) byStation.set(w.station, [...(byStation.get(w.station) ?? []), w.t]);
    for (const times of byStation.values()) for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThan(15);
    // la foule grossit pendant le rassemblement, puis encore après le départ (renforts)
    const atDepart = run.samples.find((s) => s.t >= depart)!.present;
    expect(atDepart).toBeGreaterThan(300 * 0.6);
    expect(atDepart).toBeLessThan(300 * 0.97);
    const peak = Math.max(...run.samples.map((s) => s.present));
    expect(peak).toBeGreaterThanOrEqual(295);
    expect(run.waves.filter((w) => w.t > depart).length).toBeGreaterThanOrEqual(1);
    // plus de la moitié des arrivants sont sortis du métro
    const byMetro = run.arrivedByStation.reduce((a, s) => a + s.arrived, 0);
    expect(byMetro).toBeGreaterThan((300 - run.presentAtStart) * 0.4);
    expect(byMetro).toBeLessThan(300 - run.presentAtStart);
  });

  it('à la dispersion, une partie de la foule repart par les bouches de métro ouvertes', () => {
    const departed = run.arrivedByStation.reduce((a, s) => a + s.departed, 0);
    expect(departed).toBeGreaterThan(20);
    expect(departed).toBeLessThan(run.dispersed);
    expect(run.chants).toBeGreaterThan(20);
  });

  it('coût de la foule par pas (300 personnes) sous 1 ms sur la meilleure fenêtre', () => {
    expect(run.cost.best).toBeLessThan(1);
  });
});
