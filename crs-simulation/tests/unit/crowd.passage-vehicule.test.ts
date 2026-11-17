// Foule — un véhicule de police ou de secours qui veut passer : deux-tons (ou arrêté par eux, pilote automatique en
// route), les manifestants devant son pare-chocs s'écartent sur le côté, puis reviennent à leur place. Plainte du
// joueur : la colonne restait plantée derrière des manifestants immobiles, deux-tons hurlants, sans fin.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as law } from '@/gameplay/law';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

const MODULES = [world, people, items, hazards, vehicles, law];
const QUIET = { 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.present': 1 };

/** Manifestants debout devant le pare-chocs, dans la largeur du véhicule (plus 0,6 m de chaque côté). */
function inFront(ctx: GameContext, v: Vehicle, list: Person[]): Person[] {
  const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
  return list.filter((p) => {
    const rx = p.x - v.x, rz = p.z - v.z;
    const fwd = rx * sn + rz * cs;
    const lat = -rx * cs + rz * sn;
    return p.posture !== 'down' && fwd > v.def.length * 0.5 && fwd < v.def.length * 0.5 + 7 && Math.abs(lat) < v.def.width * 0.5 + 0.6;
  });
}

describe('foule — passage d\'un véhicule prioritaire', () => {
  it('deux-tons : les manifestants devant le fourgon s\'écartent de son passage', async () => {
    const t = createCrowdTest({ seed: 3, modules: MODULES });
    const { ctx } = t;
    await t.start(demoConfig({ crowdSize: 160, extra: { ...QUIET } }));
    t.run(25);
    const crowd = t.protesters().filter((p) => brainOf(p) !== null);
    // fourgon posé au milieu du rassemblement, nez vers l'endroit le plus dense
    let best: Person = crowd[0]!;
    let bestN = -1;
    for (const p of crowd) {
      const n = crowd.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4).length;
      if (n > bestN) { bestN = n; best = p; }
    }
    // (recul de 9 m depuis le cœur du groupe, dans une direction libre)
    let van: Vehicle | null = null;
    for (let k = 0; k < 16 && !van; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = best.x - Math.sin(a) * 9, z = best.z - Math.cos(a) * 9;
      if (!ctx.world.isFree(x, z, 1.6)) continue;
      for (const p of crowd) if (Math.hypot(p.x - x, p.z - z) < 3.5) { p.x += (p.x - x) * 1.5; p.z += (p.z - z) * 1.5; }
      van = ctx.vehicles.spawn('fourgon_crs', x, z, a);
    }
    expect(van).not.toBeNull();
    const v = van!;
    const driver = ctx.people.spawn({ kind: 'crs', x: v.x + 2, z: v.z });
    expect(ctx.vehicles.enter(driver, v, 'driver')).toBe(true);
    v.engineOn = true;
    t.run(1);
    const before = inFront(ctx, v, crowd).length;
    expect(before, 'personne devant le fourgon : scénario mal posé').toBeGreaterThanOrEqual(3);
    // deux-tons, fourgon à l'arrêt (il attend qu'on lui ouvre le passage)
    v.siren = 1;
    t.run(6);
    const after = inFront(ctx, v, crowd).length;
    console.log(`devant le fourgon : ${before} manifestants, ${after} après 6 s de deux-tons`);
    expect(after).toBeLessThanOrEqual(Math.floor(before * 0.3));
    // le véhicule passé (éteint, reparti), on revient à sa place : plus personne ne fuit le fourgon
    v.siren = 0;
    t.run(20);
    expect(crowd.filter((p) => brainOf(p) && brainOf(p)!.state === 5).length).toBeLessThan(crowd.length * 0.5);
  }, 120000);
});
