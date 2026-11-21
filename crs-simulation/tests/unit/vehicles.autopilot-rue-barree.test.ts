// Pilote automatique d'un véhicule de police (hors circulation civile) arrêté devant un obstacle FIXE qui ferme la
// chaussée — station de vélos sur la voie, véhicules garés sans conducteur en travers — et qu'il ne peut contourner : il
// signale l'endroit et prend un autre itinéraire. Avant, il restait « bloqué / obstacle » pour de bon, loin du point, et
// sa colonne arrivait sans lui (partie jouée : commissariat du 7e → Bastille, le fourgon du joueur arrêté à 540 m du
// point devant la station de vélos de la rue, en (2891, 1452)).
import { describe, expect, it } from 'vitest';

import type { RoadSample, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as props } from '@/sim/props';
import type { AutopilotApi } from '@/sim/vehicles/api';

/** Point de l'itinéraire à `at` m du départ, et le cap du tronçon. */
function along(path: number[], at: number): { x: number; z: number; h: number } | null {
  let acc = 0;
  for (let i = 2; i + 1 < path.length; i += 2) {
    const ax = path[i - 2]!, az = path[i - 1]!, bx = path[i]!, bz = path[i + 1]!;
    const l = Math.hypot(bx - ax, bz - az);
    if (acc + l >= at && l > 1) {
      const t = (at - acc) / l;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, h: Math.atan2(bx - ax, bz - az) };
    }
    acc += l;
  }
  return null;
}

/**
 * Fourgon de police posé sur la rue la plus proche de (x, z), cap de la rue, envoyé à 350 m devant lui par les rues ;
 * `bar` : véhicules garés sans conducteur en travers de toute la rue, sur son itinéraire, à 30 m ; `twoWay` : départ
 * dans une rue à double sens.
 */
async function scenario(x: number, z: number, bar: boolean, twoWay = false) {
  const t = createTestContext({ seed: 5, strict: false, modules: [world, vehicles, props] });
  await t.start({ mode: 'libre', role: 'journaliste', place: 'essai', x, z, crowdSize: 0, extra: { 'crowd.none': true } } as never);
  const { ctx } = t;
  await ctx.world.whenLoaded(x, z, 600);
  const ap = ctx.service<AutopilotApi>('vehicles.autopilot')!;
  const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
  expect(ctx.world.nearestRoad(x, z, road, 30)).toBe(true);
  if (twoWay) {
    // (une rue à double sens : le demi-tour y est permis — un sens unique barré n'a pas d'autre issue légale)
    for (let k = 0; k < 400 && (road.oneway || road.width < 8); k++) ctx.world.nearestRoad(x + (k % 20) * 15, z + Math.floor(k / 20) * 15, road, 30);
    expect(road.oneway).toBe(false);
  }
  const v: Vehicle = ctx.vehicles.spawn('fourgon_crs', road.x, road.z, road.heading, { faction: 'police' });
  expect(ctx.world.nearestRoad(road.x + Math.sin(road.heading) * 350, road.z + Math.cos(road.heading) * 350, road, 80)).toBe(true);
  const dest = { x: road.x, z: road.z };
  let placed = 0;
  if (bar) {
    const path: number[] = [];
    expect(ctx.world.findPath(v.x, v.z, dest.x, dest.z, 'vehicle', path, { heading: v.heading, uturn: 200 })).toBe(true);
    const p = along(path, 30)!;
    expect(p).not.toBeNull();
    expect(ctx.world.nearestRoad(p.x, p.z, road, 10)).toBe(true);
    const half = road.width * 0.5 + 4;
    const rx = Math.cos(p.h), rz = -Math.sin(p.h);
    for (let o = -half; o <= half; o += 2.2, placed++) ctx.vehicles.spawn('utilitaire', p.x + rx * o, p.z + rz * o, p.h + Math.PI / 2, { faction: 'civil' });
  }
  expect(ap.driveTo(v, dest.x, dest.z)).toBe(true);
  let worstBlocked = 0;
  let arrived = false;
  for (let i = 0; i < 4500 && !arrived; i++) {
    t.step(0.1);
    const st = ap.status(v);
    if (st.state === 'bloque' || st.state === 'attente') worstBlocked = Math.max(worstBlocked, st.blockedFor);
    arrived = st.state === 'arrive' || Math.hypot(v.x - dest.x, v.z - dest.z) < 15;
  }
  const st = ap.status(v);
  console.log(`(${x}, ${z})${bar ? ` : ${placed} véhicules garés en travers` : ''} ; ${arrived ? 'arrivé' : `${st.mode}/${st.state}/${st.reason}`} à ${Math.hypot(v.x - dest.x, v.z - dest.z).toFixed(0)} m du point ; arrêt le plus long ${worstBlocked.toFixed(0)} s`);
  expect(arrived, 'le véhicule rejoint le point par un autre chemin').toBe(true);
  expect(worstBlocked).toBeLessThan(30);
}

describe('pilote automatique : rue barrée par un obstacle fixe infranchissable', () => {
  it('station de vélos sur la chaussée (rue de la partie jouée vers Bastille) : le fourgon prend un autre itinéraire', async () => {
    await scenario(2880, 1460, false);
  }, 300000);
  it('véhicules garés sans conducteur en travers de la rue : le fourgon prend un autre itinéraire', async () => {
    await scenario(2700, 1300, true, true);
  }, 300000);
});
