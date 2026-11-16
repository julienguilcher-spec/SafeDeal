// Commandement — convoi : arrivée d'une unité en colonne de fourgons, stationnement aligné, débarquement et mise
// en ligne, puis rembarquement et départ. Quartier d'essai, modules réels (monde, personnes, matériel, dangers,
// droit, mobilier, véhicules, IA de police).
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { ConvoyEvent } from '@/sim/police/command/api';
import { fitLine, frontRank } from '@/sim/police/testkit';
import type { PoliceTest } from '@/sim/police/testkit';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];
const WEST = -Math.PI / 2;

describe('convoi', () => {
  it('arrive en colonne, se gare aligné, débarque en ligne, puis rembarque et repart', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 150, z: 289.5 }, { seed: 21, dt: 1 / 30 });
    const { ctx } = t;
    t.api.tuning.autoAssume = false;
    // une demi-compagnie embarquée, à 260 m de la zone de stationnement
    const cie = t.units.createCompany({ x: 400, z: 289.5, heading: WEST, layout: 'embarque', sections: 2 });
    const fleet = cie.vehicles;
    const total = cie.people.length;
    const aboard0 = cie.people.filter((p) => p.vehicleId !== 0).length;
    const stages: { t: number; stage: string }[] = [];
    ctx.events.onAny('command:convoy', (d) => {
      const e = d as ConvoyEvent;
      if (e.squadId === cie.squad.id) stages.push({ t: ctx.clock.now, stage: e.stage });
    });
    t.step(1);
    const dest = { x: 150, z: 289.5, heading: WEST };
    expect(t.api.arrive(cie.squad.id, dest)).toBe(true);
    // en route : colonne, intervalles réguliers
    let gapMin = Infinity;
    let gapMax = 0;
    let lateral = 0;
    let samples = 0;
    const order = fleet.slice().sort((a, b) => a.x - b.x);
    t.run(600, 0.5, () => {
      const st = t.api.convoyOf(cie.squad.id)!;
      // colonne établie : tous les véhicules roulent (au départ, ils quittent leur stationnement sur deux files)
      if (st.stage === 'route' && fleet.every((v) => Math.abs(v.speed) > 3)) {
        order.sort((a, b) => a.x - b.x);
        for (let i = 1; i < order.length; i++) {
          const gap = Math.hypot(order[i].x - order[i - 1].x, order[i].z - order[i - 1].z) - (order[i].def.length + order[i - 1].def.length) / 2;
          gapMin = Math.min(gapMin, gap);
          gapMax = Math.max(gapMax, gap);
        }
        const zs = order.map((v) => v.z);
        lateral = Math.max(lateral, Math.max(...zs) - Math.min(...zs));
        samples++;
      }
      return st.stage === 'en_place' || st.stage === 'echec';
    });
    const st = t.api.convoyOf(cie.squad.id)!;
    const onFoot = cie.people.filter((p) => p.vehicleId === 0 && p.poste !== 'conducteur');
    const pt: PoliceTest = { t: t.t, ctx, system: t.police, units: t.units, status: t.status, slots: ctx.require('police.slot'), formation: t.formation, tuning: ctx.require('police.tuning'), step: t.step, run: t.run };
    const line = fitLine(frontRank(pt, cie.squad.id));
    const info = t.formation.of(cie.squad.id)!;
    const headings = fleet.map((v) => Math.abs(Math.atan2(Math.sin(v.heading - WEST), Math.cos(v.heading - WEST))));
    const leadX = Math.min(...fleet.map((v) => v.x));
    console.log('convoi :', stages.map((s) => s.stage + '@' + s.t.toFixed(0)).join(' '), '|', fleet.length, 'véhicules,', aboard0, '/', total, 'à bord au départ | colonne : intervalles', gapMin.toFixed(1), 'à', gapMax.toFixed(1), 'm, écart latéral', lateral.toFixed(2), 'm,', samples, 'relevés |',
      'stationnement : écart à l\'axe', st.alignError.toFixed(2), 'm, écart de cap', ((st.headingError * 180) / Math.PI).toFixed(1), '°, garés', st.parked, '| débarqués', onFoot.length, '| ligne : formation', info.formation, ', écart à la droite', line.error.toFixed(2), 'm, premier rang', line.length.toFixed(1), 'm,', (leadX - info.x).toFixed(1), 'm devant le véhicule de tête');
    expect(st.stage).toBe('en_place');
    expect(stages.map((s) => s.stage)).toEqual(['route', 'stationnement', 'debarquement', 'en_place']);
    // colonne de véhicules : en file, intervalles tenus
    expect(samples).toBeGreaterThan(10);
    expect(gapMin).toBeGreaterThan(1.5);
    expect(gapMax).toBeLessThan(25);
    expect(lateral).toBeLessThan(3.5);
    // stationnement aligné : tous garés, dans l'axe, même cap
    expect(st.parked).toBe(fleet.length);
    expect(st.alignError).toBeLessThan(1.2);
    expect(st.headingError).toBeLessThan(0.12);
    expect(Math.max(...headings)).toBeLessThan(0.12);
    // débarquement et mise en place ordonnée : en ligne devant les véhicules
    expect(onFoot.length).toBeGreaterThan(total * 0.75);
    expect(info.formation).toBe('ligne');
    expect(line.error).toBeLessThan(0.5);
    expect(leadX - info.x).toBeGreaterThan(8);

    // rembarquement et départ en colonne
    const exit = { x: -300, z: 289.5 };
    expect(t.api.depart(cie.squad.id, exit)).toBe(true);
    const x0 = Math.min(...fleet.map((v) => v.x));
    t.run(420, 0.5, () => {
      const s = t.api.convoyOf(cie.squad.id)!.stage;
      return s === 'parti';
    });
    const aboard1 = cie.people.filter((p) => p.vehicleId !== 0).length;
    console.log('   restés à pied :', cie.people.filter((p) => p.vehicleId === 0).map((p) => p.poste + '@' + Math.round(p.x) + ',' + Math.round(p.z) + ':' + p.posture + ':' + p.custody).join(' '), '| places libres :', fleet.map((v) => v.kind.slice(0, 6) + ':' + v.seats.filter((x) => x === 0).length + '/' + v.seats.length).join(' '));
    const moved = x0 - Math.min(...fleet.map((v) => v.x));
    console.log('départ :', stages.slice(4).map((s) => s.stage + '@' + s.t.toFixed(0)).join(' '), '| à bord', aboard1, '/', total, '| véhicule de tête avancé de', moved.toFixed(0), 'm');
    expect(stages.some((s) => s.stage === 'rembarquement')).toBe(true);
    expect(stages.some((s) => s.stage === 'depart')).toBe(true);
    expect(aboard1).toBeGreaterThanOrEqual(aboard0 - 2);
    expect(moved).toBeGreaterThan(150);
  }, 600000);
});
