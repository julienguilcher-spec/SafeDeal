// Véhicule de police conduit seul au pilote automatique (le joueur passager, ou un engin qui sort seul) arrêté par des
// collègues à pied immobiles sur la chaussée devant lui : des agents rangés à leur place (leur unité, une autre
// compagnie) ne s'écartent pas. Il les contourne au pas s'il reste un couloir libre, au lieu de les attendre pour de bon
// (matrice des points de départ : « libre Esplanade des Invalides gendarme_centaure : attente personne après 35 m »).
import { describe, expect, it } from 'vitest';

import type { RoadSample } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles/api';

async function scenario(faction: 'police' | 'civil') {
  const t = createTestContext({ seed: 4, strict: false, modules: [world, people, vehicles] });
  await t.start({ mode: 'libre', role: 'journaliste', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { 'crowd.none': true } } as never);
  const { ctx } = t;
  const ap = ctx.service<AutopilotApi>('vehicles.autopilot')!;
  // une large avenue à double sens près de la Concorde
  const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
  for (let k = 0; k < 400 && (road.edgeId < 0 || road.oneway || road.width < 12); k++) ctx.world.nearestRoad(-200 + (k % 20) * 20, -200 + Math.floor(k / 20) * 20, road, 15);
  expect(road.width).toBeGreaterThanOrEqual(12);
  const h = road.heading;
  const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx; // (droite du sens de marche)
  // sur sa voie (à droite de l'axe)
  const x0 = road.x + rx * 2.5, z0 = road.z + rz * 2.5;
  const v = ctx.vehicles.spawn('fourgon_crs', x0, z0, h, { faction: 'police' });
  // deux agents à pied immobiles, dans l'axe du fourgon, à 12 et 13 m
  const a = ctx.people.spawn({ kind: faction === 'police' ? 'crs' : 'civil', faction, x: x0 + fx * 12, z: z0 + fz * 12 } as never);
  const b = ctx.people.spawn({ kind: faction === 'police' ? 'crs' : 'civil', faction, x: x0 + fx * 13 + rx * 0.6, z: z0 + fz * 13 + rz * 0.6 } as never);
  const pins = [{ p: a, x: a.x, z: a.z }, { p: b, x: b.x, z: b.z }];
  expect(ap.driveTo(v, road.x + fx * 120, road.z + fz * 120, { inLane: false })).toBe(true);
  let passed = false;
  let worst = 0;
  for (let i = 0; i < 900 && !passed; i++) {
    // (ils tiennent leur place : ni pas de côté, ni recul)
    for (const q of pins) {
      q.p.x = q.x; q.p.z = q.z; q.p.vx = 0; q.p.vz = 0;
    }
    t.step(0.1);
    const st = ap.status(v);
    if (st.state !== 'en_route') worst = Math.max(worst, st.blockedFor);
    passed = (v.x - a.x) * fx + (v.z - a.z) * fz > 6;
  }
  const st = ap.status(v);
  console.log(`${faction} : ${passed ? 'dépassés' : `${st.state}/${st.reason}`} ; arrêt le plus long ${worst.toFixed(0)} s ; blessés ${[a, b].filter((p) => p.health < 100).length}`);
  return { passed, hurt: [a, b].filter((p) => p.health < 100).length };
}

describe('pilote automatique : collègues à pied immobiles devant un véhicule de police', () => {
  it('le fourgon les contourne au pas (sans les toucher) au lieu de les attendre indéfiniment', async () => {
    const r = await scenario('police');
    expect(r.passed).toBe(true);
    expect(r.hurt).toBe(0);
  }, 300000);
});
