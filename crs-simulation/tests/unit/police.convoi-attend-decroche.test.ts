// Colonne de l'IA (police/command/convoy.ts) arrivée au point alors qu'un de ses fourgons, resté loin derrière, finit le
// trajet seul : s'il est arrêté un moment en route (feu, file, piétons), le fourgon ne doit pas être arrêté là où il est
// (pilote coupé) pour débarquer son équipage à des centaines de mètres du point — le joueur passager avec lui (journée
// de service : caserne de la Cité → République, joueur à 736 m du point). Depuis les ordres directs, la colonne ne
// l'attend plus pour débarquer les autres (trente secondes de stationnement au plus) : lui finit le trajet, et ses
// passagers descendent à sa place.
import { describe, expect, it } from 'vitest';

import type { RoadSample, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi } from '@/sim/police/api';

interface Ap { status(v: Vehicle): { mode: string; state: string; reason: string; blockedFor: number } }

describe('colonne de l’IA : un fourgon décroché arrêté en route', () => {
  it('la colonne l’attend au stationnement au lieu de débarquer sans lui', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: [world, roles, people, vehicles, police] });
    await t.start({ mode: 'libre', role: 'journaliste', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { 'crowd.none': true } } as never);
    const { ctx } = t;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
    const probe = { ...road };
    let found = false;
    for (let k = 0; k < 900 && !found; k++) {
      const px = -900 + (k % 30) * 60, pz = -900 + Math.floor(k / 30) * 60;
      if (!ctx.world.nearestRoad(px, pz, road, 10) || road.oneway || road.width < 9) continue;
      found = [-40, -20, 20, 40].every((d) => ctx.world.nearestRoad(road.x + Math.sin(road.heading) * d, road.z + Math.cos(road.heading) * d, probe, 3)
        && Math.abs(Math.sin(probe.heading - road.heading)) < 0.08 && !probe.oneway);
    }
    expect(found).toBe(true);
    const h = road.heading;
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const units = ctx.service<PoliceUnitsApi>(POLICE_UNITS_SERVICE)!;
    const sec = units.createSection({ x: road.x + rx * 6, z: road.z + rz * 6, heading: h, vehicles: true, drivers: true, layout: 'embarque' });
    const list = sec.vehicles;
    expect(list.length).toBeGreaterThanOrEqual(3);
    list.forEach((v, i) => {
      v.x = road.x - fx * i * 9 + rx * 2;
      v.z = road.z - fz * i * 9 + rz * 2;
      v.heading = h;
      v.vx = 0; v.vz = 0; v.speed = 0;
    });
    // le point : à ~250 m de là par les rues
    const path: number[] = [];
    let dest: { x: number; z: number } | null = null;
    for (let k = 0; k < 16 && !dest; k++) {
      const a = h + (k / 16) * Math.PI * 2;
      if (!ctx.world.nearestRoad(road.x + Math.sin(a) * 250, road.z + Math.cos(a) * 250, probe, 40)) continue;
      path.length = 0;
      if (ctx.world.findPath(road.x, road.z, probe.x, probe.z, 'vehicle', path, { heading: h, uturn: 200 }) && path.length >= 4) dest = { x: probe.x, z: probe.z };
    }
    expect(dest).not.toBeNull();
    const cmd = ctx.service<{ arrive(id: number, d: { x: number; z: number; heading: number; disembark?: boolean }): boolean; convoyOf(id: number): { stage: string } | null }>('police.command')!;
    const ap = ctx.service<Ap>('vehicles.autopilot')!;
    // (rang garé dans le sens d'arrivée : la colonne se range sans manœuvre)
    const n = path.length;
    const arriveH = Math.atan2(path[n - 2]! - path[n - 4]!, path[n - 1]! - path[n - 3]!);
    expect(cmd.arrive(sec.squad.id, { x: dest!.x, z: dest!.z, heading: arriveH })).toBe(true);
    // le dernier fourgon décroche : arrêté au départ (file, feu, piétons) jusqu'à ce que les autres soient garés, et 30 s encore
    const last = list[list.length - 1]!;
    const hold = { x: last.x, z: last.z, heading: last.heading };
    const pin = (): void => { last.x = hold.x; last.z = hold.z; last.heading = hold.heading; last.vx = 0; last.vz = 0; last.speed = 0; };
    const lead = list[0]!;
    let releaseAt = -1;
    let disembarkFar = -1;
    // passagers du fourgon décroché : là où ils descendent
    const riders = last.seats.slice(1).filter((id) => id !== 0).map((id) => ctx.people.get(id)!).filter((p) => p);
    const outAt = new Map<number, number>();
    for (let i = 0; i < 2400; i++) {
      // (relâché 30 s après que les autres se sont garés)
      if (releaseAt < 0 && cmd.convoyOf(sec.squad.id)!.stage !== 'route' && list.every((v) => v === last || ap.status(v).mode === 'idle')) releaseAt = ctx.clock.now + 30;
      if (releaseAt < 0 || ctx.clock.now < releaseAt) pin();
      t.step(0.25);
      const st = cmd.convoyOf(sec.squad.id)!.stage;
      if (disembarkFar < 0 && (st === 'debarquement' || st === 'en_place')) disembarkFar = Math.hypot(last.x - dest!.x, last.z - dest!.z);
      for (const p of riders) if (!outAt.has(p.id) && p.vehicleId === 0) outAt.set(p.id, Math.hypot(p.x - dest!.x, p.z - dest!.z));
      if (disembarkFar >= 0 && i % 4 === 0 && ctx.clock.now > releaseAt + 120) break;
    }
    const s = ap.status(last);
    console.log(`débarquement avec le dernier fourgon à ${disembarkFar.toFixed(0)} m du point ; à la fin : ${Math.hypot(last.x - dest!.x, last.z - dest!.z).toFixed(0)} m (${s.mode}/${s.state}${s.reason ? '/' + s.reason : ''})`);
    const out = [...outAt.values()].map((d) => Math.round(d));
    console.log(`passagers du fourgon décroché descendus à ${out.join(' / ')} m du point (${riders.length} à bord au départ)`);
    // la colonne débarque sans l'attendre (elle ne retient plus tout le monde assis), mais lui finit le trajet : son
    // pilote n'est pas coupé loin du point, ses passagers descendent à sa place — pas à des centaines de mètres
    expect(disembarkFar, 'la colonne débarque').toBeGreaterThanOrEqual(0);
    expect(Math.hypot(last.x - dest!.x, last.z - dest!.z)).toBeLessThan(160);
    expect(riders.length).toBeGreaterThan(0);
    expect(out.length, 'tous ses passagers sont descendus').toBe(riders.length);
    expect(Math.max(...out)).toBeLessThan(160);
  }, 300000);
});
