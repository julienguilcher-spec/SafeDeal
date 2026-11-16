// Foule — densité et compression : une charge dans une rue étroite fermée par une barricade provoque une
// bousculade ; le module doit donner l'alerte (≥ 4 personnes/m²), faire monter la tension, et la foule
// chercher les issues. Rue de 10 m entre façades du quartier d'essai, vraie locomotion.
import { describe, expect, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { DENSITY_EVENT } from '@/sim/crowd';
import type { DensityEvent } from '@/sim/crowd';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

const STREET_X = -430; // rue des Lilas : 10 m entre façades

describe('foule — compression dans une rue étroite', () => {
  it('donne l\'alerte quand une charge tasse la foule contre une barricade', async () => {
    const t = createCrowdTest({ seed: 9, modules: [world, people, items, hazards, law] });
    const { ctx, core } = t;
    const events: DensityEvent[] = [];
    ctx.events.onAny(DENSITY_EVENT, (e) => events.push({ ...(e as DensityEvent) }));
    const reasons: string[] = [];
    ctx.events.on('crowd:tension', (e) => reasons.push(e.reason));
    await t.start(demoConfig({
      crowdSize: 260, x: STREET_X, z: -150, tension: 0.05, volatility: 0.3,
      extra: { 'crowd.present': 1, 'crowd.static': true, 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.sono': false, 'crowd.route': [STREET_X, -155, STREET_X, 140] },
    }));
    const f = core.formation;
    // le rassemblement tient dans la rue : couloir étroit, cortège étiré
    expect(core.corridor.refWidth).toBeLessThan(10);
    t.run(3);
    const all = t.protesters();
    expect(all.length).toBe(260);
    for (const p of all) expect(Math.abs(p.x - STREET_X)).toBeLessThan(5.2);
    const calm = core.density.max;
    expect(calm).toBeLessThan(3);
    expect(events.length).toBe(0);

    // barricade en travers de la rue, 25 m devant la tête
    core.corridor.at(f.headS + 25, core.rp);
    const bz = core.rp.z;
    for (let x = STREET_X - 4.6; x <= STREET_X + 4.6; x += 1.15) ctx.props.spawn('conteneur', x, bz, 0);
    // une section charge depuis l'arrière du rassemblement, en trois bonds
    core.corridor.at(f.tailS - 14, core.rp);
    const squad = ctx.squads.create('section', 'police', 'Alpha 1');
    const line = [];
    for (let i = 0; i < 8; i++) {
      const crs = ctx.people.spawn({ kind: 'crs', faction: 'police', x: STREET_X - 3.5 + i, z: core.rp.z, heading: 0, rank: 'gardien', poste: 'bouclier', squadId: squad.id });
      line.push(crs);
    }
    let peak = 0;
    let pressed = 0;
    for (let bond = 0; bond < 4; bond++) {
      ctx.squads.issue(squad.id, { type: 'charge', x: STREET_X, z: bz, heading: 0 });
      // la ligne avance au pas de charge (ici : commandée par le test, qui tient lieu d'IA des forces)
      for (let k = 0; k < 8; k++) {
        for (const crs of line) {
          crs.cmd.moveX = 0;
          crs.cmd.moveZ = 1;
          crs.cmd.gait = 1;
          crs.cmd.faceMove = true;
        }
        t.run(0.5);
        if (core.density.max > peak) peak = core.density.max;
        pressed = Math.max(pressed, t.protesters().filter((p) => core.density.at(p.x, p.z) >= 4).length);
      }
    }
    for (const crs of line) crs.cmd.moveZ = 0;
    const alerts = events.filter((e) => e.level === 'alerte' || e.level === 'danger');
    console.log('[foule] compression : densité au repos', calm.toFixed(2), '| pic', peak.toFixed(2), '| personnes à ≥ 4/m²', pressed, '| alertes', alerts.map((e) => e.level + ' ' + e.density.toFixed(1)).join(', '),
      '| blessés par écrasement', core.density.crushed, '| motifs', [...new Set(reasons)].join(','));
    // la foule a fui devant la charge et s'est tassée contre la barricade
    expect(reasons).toContain('charge_non_justifiee');
    expect(peak).toBeGreaterThanOrEqual(4);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]!.people).toBeGreaterThanOrEqual(20);
    expect(reasons.some((r) => r === 'compression' || r === 'compression_danger')).toBe(true);
    expect(ctx.director.tensionAt(alerts[0]!.x, alerts[0]!.z)).toBeGreaterThan(0.1);
    // l'alerte est donnée à l'endroit de la bousculade : dans la rue, entre la ligne et la barricade
    expect(Math.abs(alerts[0]!.x - STREET_X)).toBeLessThan(6);
    expect(alerts[0]!.z).toBeLessThan(bz + 3);
    // la peur est là
    const fear = t.protesters().reduce((a, p) => a + p.fear, 0) / Math.max(1, t.protesters().length);
    expect(fear).toBeGreaterThan(0.3);

    // les forces se retirent : la foule cherche les issues et la pression retombe
    for (const crs of line) ctx.people.remove(crs.id);
    ctx.squads.issue(squad.id, { type: 'repli', x: STREET_X, z: -200, heading: Math.PI });
    t.run(40);
    expect(core.density.max).toBeLessThan(4);
    for (const p of t.protesters()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
    }
    expect(events.some((e) => e.level === 'fin')).toBe(true);
  }, 300_000);
});
