// Groupes radicaux — volatilité maximale, tension forte : c'est une émeute. Engins incendiaires et mortiers
// d'artifice (en quantité limitée : la dotation des sacs, rien de plus), véhicules en stationnement incendiés ou
// renversés à plusieurs, agent isolé pris à partie, puis dispersion en petits groupes par les rues adjacentes,
// regroupement plus loin et manifestation sauvage.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { BLOC_EVENT, CROWD_RADICAL } from '@/sim/crowd';
import type { BlocEvent, RadicalApi } from '@/sim/crowd';
import { avenueConfig, chantier, createRadicalTest, policeLine, raiseShields } from '@/sim/crowd/radical/testkit';

const MODULES = [world, roles, people, items, hazards, law, props, vehicles];

function count(list: Person[], item: string): number {
  let n = 0;
  for (const p of list) for (const s of p.inventory) if (s.id === item) n += s.count;
  return n;
}

describe('groupes radicaux — émeute', () => {
  it('emploie mortiers et engins incendiaires dans la limite des dotations, s\'en prend aux véhicules, puis se disperse par les rues adjacentes', async () => {
    const t = createRadicalTest({ seed: 31, modules: MODULES });
    const { ctx, core, watch, radical } = t;
    const phases: { t: number; phase: string; x: number; z: number }[] = [];
    ctx.events.onAny(BLOC_EVENT, (payload) => {
      const e = payload as BlocEvent;
      phases.push({ t: ctx.clock.now, phase: e.phase, x: e.x, z: e.z });
    });
    await t.start(avenueConfig({ tension: 0.8, volatility: 1, crowdSize: 260 }));
    t.run(1);
    chantier(ctx, 186, 15);
    chantier(ctx, 192, -15);
    // des voitures en stationnement le long du trottoir, à l'écart de la ligne
    const cars = [ctx.vehicles.spawn('citadine', 172, 12.5, Math.PI / 2), ctx.vehicles.spawn('voiture', 164, 12.5, Math.PI / 2), ctx.vehicles.spawn('citadine', 178, -12.5, Math.PI / 2)];
    const line = policeLine(ctx, 255, 0, -Math.PI / 2, 16, 1.1);
    // un fourgon derrière la ligne, et un agent resté seul sur le trottoir d'en face
    const van = ctx.vehicles.spawn('fourgon_crs', 266, 0, -Math.PI / 2);
    t.run(1);
    raiseShields(ctx, line);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    const radicals = t.radicals();
    // dotation du jour fixée pour l'essai (dans les sacs dès le départ) : trois engins incendiaires, deux tubes
    for (let i = 0; i < 3; i++) ctx.actions.give(radicals[2 + i * 5]!, 'molotov', 1);
    for (let i = 0; i < 2; i++) ctx.actions.give(radicals[4 + i * 7]!, 'mortier');
    const mortars0 = count(radicals, 'mortier');
    const molotovs0 = count(radicals, 'molotov');
    const carriers = radicals.filter((p) => p.inventory.some((st) => st.id === 'mortier' || st.id === 'molotov'));
    let maxHeat = 0;
    let wild = false;
    let scatterAt = -1;
    let teams = 0;
    let exits: number[] = [];
    let routeAtScatter: number[] = [];
    let baseAtScatter = '';
    for (let s = 0; s < 520; s += 1) {
      t.run(1);
      if (api.heat > maxHeat) maxHeat = api.heat;
      if (api.phase === 'sauvage') wild = true;
      if (scatterAt < 0 && api.stats.scatters > 0) {
        scatterAt = ctx.clock.now;
        // issues retenues à l'instant de la dispersion, et temps de la manifestation à cet instant
        exits = radical.bloc.exits.slice();
        routeAtScatter = Array.from(core.route.points);
        baseAtScatter = core.director.base;
      }
      if (scatterAt > 0 && ctx.clock.now - scatterAt > 8 && ctx.clock.now - scatterAt < 10) {
        // petits groupes : les membres d'un même groupe ne courent pas tous au même endroit
        const k = radical.k;
        for (const g of k.groups) teams = Math.max(teams, new Set(g.members.map((m) => m.team)).size);
      }
      if (wild && ctx.clock.now - scatterAt > 60) break;
    }
    const mortarsLeft = count(carriers, 'mortier');
    const molotovsLeft = count(carriers, 'molotov');
    console.log('[radicaux] porteurs', carriers.map((p) => p.id + ':' + (ctx.people.get(p.id) ? p.profile + '/' + p.posture + '/' + p.injury : 'parti') + ' ' + p.inventory.filter((st) => st.id === 'mortier' || st.id === 'molotov').map((st) => st.id + '×' + st.count).join('+')).join(' | '));
    console.log('[radicaux] émeute : chaleur max', maxHeat.toFixed(2), '| phases', phases.map((p) => p.phase + '@' + p.t.toFixed(0)).join(' → '));
    console.log('[radicaux] dotations : mortiers', mortars0, '→ tirés', api.stats.mortars, '(reste', mortarsLeft + ') | engins incendiaires', molotovs0, '→ lancés', api.stats.molotovs, '(reste', molotovsLeft + ')',
      '| véhicules incendiés', api.stats.vehiclesLit, '| renversés', api.stats.vehiclesFlipped, '| états', cars.map((c) => c.state + (radical.k.vehExt?.isFlipped(c) ? '/retourné' : '')).join(','), '| fourgon', van.state, van.burning.toFixed(2));
    console.log('[radicaux] faits', JSON.stringify(watch.count), '| stats', JSON.stringify(api.stats));
    expect(maxHeat).toBeGreaterThan(0.8);
    // ── dotations limitées : jamais plus de tirs que ce que les sacs contenaient ──
    expect(api.stats.mortars).toBeLessThanOrEqual(mortars0);
    expect(api.stats.molotovs).toBeLessThanOrEqual(molotovs0);
    if (mortars0 > 0) expect(api.stats.mortars).toBeGreaterThan(0);
    if (molotovs0 > 0) expect(api.stats.molotovs).toBeGreaterThan(0);
    expect(mortarsLeft).toBe(mortars0 - api.stats.mortars);
    expect(molotovsLeft).toBe(molotovs0 - api.stats.molotovs);
    // ── salves nourries, véhicules pris pour cibles ──
    expect(api.stats.volleys).toBeGreaterThanOrEqual(3);
    expect(api.stats.vehiclesLit + api.stats.vehiclesFlipped + cars.filter((c) => c.state !== 'ok').length).toBeGreaterThan(0);
    // ── repli : dispersion par les rues adjacentes, en petits groupes, puis regroupement hors du parcours ──
    expect(api.stats.scatters).toBeGreaterThan(0);
    expect(teams).toBeGreaterThanOrEqual(2);
    expect(watch.count['dispersion'] ?? 0).toBeGreaterThan(0);
    expect(watch.count['regroupement'] ?? 0).toBeGreaterThan(0);
    console.log('[radicaux] dispersion à', scatterAt.toFixed(0), 's (temps de la manifestation :', baseAtScatter + ') | issues',
      exits.map((v) => v.toFixed(0)).join(' '), '| équipes par groupe', teams);
    expect(exits.length).toBeGreaterThanOrEqual(4);
    // les issues sont des rues adjacentes, hors du parcours du cortège. Depuis que le cortège se détourne devant
    // un barrage (rue fermée), ce parcours n'est plus l'avenue de départ : on mesure contre le tracé en vigueur à
    // l'instant de la dispersion
    expect(routeAtScatter.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < exits.length; i += 2) {
      let d = Infinity;
      for (let j = 0; j + 3 < routeAtScatter.length; j += 2) {
        const ax = routeAtScatter[j]!, az = routeAtScatter[j + 1]!;
        const dx = routeAtScatter[j + 2]! - ax, dz = routeAtScatter[j + 3]! - az;
        const l2 = dx * dx + dz * dz;
        const u = l2 > 1e-6 ? Math.max(0, Math.min(1, ((exits[i]! - ax) * dx + (exits[i + 1]! - az) * dz) / l2)) : 0;
        d = Math.min(d, Math.hypot(exits[i]! - (ax + dx * u), exits[i + 1]! - (az + dz * u)));
      }
      expect(d).toBeGreaterThan(30);
      // et pas du côté des forces
      expect(Math.hypot(exits[i]! - 255, exits[i + 1]!)).toBeGreaterThan(45);
    }
    expect(wild).toBe(true);
  }, 600_000);
});
