// Exploration temporaire (à supprimer) : quartier d'essai, foule, stations, parcours.
import { describe, it } from 'vitest';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';
import { EXT } from '@/core/extensions';
import type { MetroApi } from '@/core/extensions';

describe('exploration', () => {
  it('décrit le monde d\'essai', async () => {
    const t = createCrowdTest({ seed: 11, modules: [world, people, items, hazards, law, props, vehicles] });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 300, duration: 'courte', tension: 0.1, volatility: 0.15, x: 0, z: 0 }));
    console.log('landmarks', JSON.stringify(ctx.world.landmarks.map((l) => ({ k: l.key, n: l.name, x: l.x, z: l.z }))));
    console.log('places', JSON.stringify(ctx.world.places.map((p) => ({ n: p.name, k: p.kind, x: Math.round(p.x), z: Math.round(p.z), r: p.radius }))));
    const metro = ctx.service<MetroApi>(EXT.metro);
    console.log('stations', JSON.stringify(metro?.stations.map((s) => ({ id: s.id, n: s.name, x: Math.round(s.x), z: Math.round(s.z), open: s.open }))));
    const r = ctx.director.route;
    const pts: string[] = [];
    for (let i = 0; i < r.length; i += 2) pts.push(Math.round(r[i]!) + ',' + Math.round(r[i + 1]!));
    console.log('route', pts.join(' | '), 'len', core.route.length);
    console.log('phase', ctx.director.phase, 'stats', JSON.stringify(ctx.director.stats));
    const t0 = performance.now();
    let last = '';
    for (let k = 0; k < 180; k++) {
      t.run(5);
      const d = ctx.director;
      const line = d.phase;
      if (line !== last) {
        console.log('t=', Math.round(ctx.clock.now), 'phase', d.phase, 'tension', d.tension.toFixed(2), 'head', Math.round(d.headProgress), 'present', d.stats.present, 'tailS', Math.round(core.formation.tailS));
        last = line;
      }
    }
    console.log('wall ms', Math.round(performance.now() - t0), 'people', ctx.people.list.length, 'head', Math.round(ctx.director.headProgress), 'present', ctx.director.stats.present);
  }, 600000);
});
