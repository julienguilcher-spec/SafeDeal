// Pilote automatique : un mobilier LONG posé le long du trottoir (abribus de 4,2 m, parallèle à la chaussée) ne ferme pas
// la rue. Le capteur le prenait pour un cercle de sa plus grande demi-dimension (2,1 m) : dans une rue de 5,2 m, il
// « barrait » la chaussée. Partie jouée (commandant passager, mission « Le pré-cortège », graine 7) : la tête de colonne,
// rue Commines, s'arrêtait à 1,2 m de l'abribus en (3249, 420), signalait la rue fermée, tentait un demi-tour entre les
// façades et restait là pour de bon — le commandant à bord, à 390 m de la place de la République où sa compagnie
// arrivait sans lui. Avant de tenir l'objet pour un barrage et de signaler la rue fermée, le pilote regarde maintenant
// sa vraie emprise — la boîte orientée de la collision — : le véhicule marque l'arrêt devant lui (prudence, une
// reprise), puis passe, sans autre itinéraire ni demi-tour.
import { describe, expect, it } from 'vitest';

import type { Prop, RoadSample, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as props } from '@/sim/props';
import type { AutopilotApi } from '@/sim/vehicles/api';

async function drivePast(kind: 'vl_commandement' | 'fourgon_crs') {
  const t = createTestContext({ seed: 7, strict: false, modules: [world, vehicles, props] });
  await t.start({ mode: 'libre', role: 'journaliste', place: 'essai', x: 3230, z: 425, crowdSize: 0, extra: { 'crowd.none': true } } as never);
  const { ctx } = t;
  await ctx.world.whenLoaded(3230, 425, 600);
  const ap = ctx.service<AutopilotApi>('vehicles.autopilot')!;
  // l'abribus de la rue Commines : il existe, il est long, et il borde la chaussée
  const found: Prop[] = [];
  const n = ctx.props.queryRadius(3249.5, 419.7, 4, found);
  const shelter = found.slice(0, n).find((p) => p.kind === 'abribus');
  expect(shelter, 'abribus de la rue Commines').toBeDefined();
  expect(Math.max(shelter!.halfX, shelter!.halfZ)).toBeGreaterThan(1.5);
  const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
  expect(ctx.world.nearestRoad(3233, 427, road, 12)).toBe(true);
  // départ rue Commines, 18 m avant l'abribus, dans le sens de la rue ; point : 90 m plus loin dans la même rue
  const v: Vehicle = ctx.vehicles.spawn(kind, road.x, road.z, Math.atan2(3333 - 3233, 361 - 427), { faction: 'police' });
  const dest = { x: 3310, z: 376 };
  expect(ctx.world.nearestRoad(dest.x, dest.z, road, 12)).toBe(true);
  dest.x = road.x; dest.z = road.z;
  const hp0 = shelter!.hp;
  expect(ap.driveTo(v, dest.x, dest.z, { urgence: true })).toBe(true);
  let worst = 0;
  let passedAt = -1;
  let farthest = 0;
  const x0 = v.x, z0 = v.z;
  const len = Math.hypot(dest.x - x0, dest.z - z0);
  for (let i = 0; i < 900 && passedAt < 0; i++) {
    t.step(0.1);
    const st = ap.status(v);
    if (st.state === 'bloque' || st.state === 'attente') worst = Math.max(worst, st.blockedFor);
    farthest = Math.max(farthest, Math.abs((v.x - x0) * (dest.z - z0) - (v.z - z0) * (dest.x - x0)) / len);
    if (Math.hypot(v.x - dest.x, v.z - dest.z) < 12 || st.state === 'arrive') passedAt = i / 10;
  }
  const st = ap.status(v);
  console.log(`${kind} rue Commines : ${passedAt >= 0 ? `passé en ${passedAt.toFixed(0)} s` : `${st.mode}/${st.state}/${st.reason} à ${Math.hypot(v.x - dest.x, v.z - dest.z).toFixed(0)} m du point`} ; arrêt le plus long ${worst.toFixed(1)} s ; abribus ${shelter!.state}`);
  expect(passedAt, 'le véhicule dépasse l’abribus et continue sa rue').toBeGreaterThanOrEqual(0);
  expect(passedAt).toBeLessThan(60);
  expect(worst, 'un arrêt de prudence devant l’abribus, jamais un blocage').toBeLessThan(25);
  // sans demi-tour ni détour : il a suivi sa rue (jamais à plus de 12 m de la droite départ → point)
  expect(farthest).toBeLessThan(12);
  // il est passé à côté, pas dedans
  expect(shelter!.state).toBe('intact');
  expect(shelter!.hp).toBe(hp0);
  expect(v.health).toBeGreaterThan(98);
}

describe('pilote automatique : mobilier long au bord du trottoir', () => {
  it('le véhicule de commandement passe devant l’abribus de la rue Commines', async () => {
    await drivePast('vl_commandement');
  }, 300000);
  it('un fourgon (plus large) y passe aussi', async () => {
    await drivePast('fourgon_crs');
  }, 300000);
});
