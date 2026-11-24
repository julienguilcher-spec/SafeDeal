// Intégration avec le vrai module du monde (quartier d'essai) : collisions contre le bâti réel, itinéraires réels, coût.
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameContext, RoadSample, Vec2, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { AUTOPILOT_SERVICE, VEHICLES_EXT_SERVICE, VehiclesSystem } from '@/sim/vehicles';
import type { AutopilotApi, VehiclesExtApi } from '@/sim/vehicles';
import { createWorldQuerySystems } from '@/world/query';

const DT = 1 / 30;
let t: TestContext;
let ctx: GameContext;
let autopilot: AutopilotApi;
let ext: VehiclesExtApi;
const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

function cpuMs(): number {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
}

/** Milieu d'une rue carrossable assez longue, et son cap. */
function roadSpots(count: number, minLength = 60): { x: number; z: number; heading: number; edge: number }[] {
  const out: { x: number; z: number; heading: number; edge: number }[] = [];
  const w = ctx.world;
  for (let e = 0; e < w.edgeCount && out.length < count; e++) {
    const ed = w.edge(e);
    if (ed.pedestrianOnly || ed.bridge || ed.length < minLength || ed.width < 6) continue;
    const p = ed.points;
    const n = p.length >> 1;
    const i = Math.max(0, (n >> 1) - 1);
    const ax = p[i * 2]!;
    const az = p[i * 2 + 1]!;
    const bx = p[i * 2 + 2]!;
    const bz = p[i * 2 + 3]!;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    if (!w.isFree(x, z, 2.5) || w.surfaceAt(x, z) === 'water') continue;
    out.push({ x, z, heading: Math.atan2(bx - ax, bz - az), edge: e });
  }
  return out;
}

beforeAll(async () => {
  t = createTestContext({
    modules: [() => createWorldQuerySystems({ source: 'test', colliders: null })],
    systems: [new VehiclesSystem()],
  });
  await t.ready;
  await t.start({ mode: 'test' });
  ctx = t.ctx;
  ctx.world.setFocus(0, 0);
  await ctx.world.whenLoaded(0, 0, 900);
  autopilot = ctx.require<AutopilotApi>(AUTOPILOT_SERVICE);
  ext = ctx.require<VehiclesExtApi>(VEHICLES_EXT_SERVICE);
});

describe('véhicules dans le quartier d\'essai (vrai module du monde)', () => {
  it('une voiture lancée contre une façade s\'y arrête : jamais dans le bâti', () => {
    const spots = roadSpots(6);
    expect(spots.length).toBeGreaterThan(3);
    let hits = 0;
    ctx.events.on('vehicle:collision', (e) => {
      if (e.otherKind === 'world') hits++;
    });
    let crashed = 0;
    for (const s of spots.slice(0, 4)) {
      // perpendiculairement à la rue : droit dans l'immeuble d'en face
      const v = ctx.vehicles.spawn('voiture', s.x, s.z, s.heading + Math.PI / 2);
      const driver = ctx.people.spawn({ kind: 'conducteur', x: s.x, z: s.z });
      ctx.vehicles.enter(driver, v, 'driver');
      v.cmd.throttle = 1;
      let inside = false;
      for (let i = 0; i < 30 * 12; i++) {
        t.game.step(DT);
        if (ctx.world.buildingHeightAt(v.x, v.z) > 0) inside = true;
        expect(Number.isFinite(v.x + v.z + v.heading)).toBe(true);
      }
      expect(inside, `voiture dans le bâti près de (${s.x.toFixed(0)} ; ${s.z.toFixed(0)})`).toBe(false);
      if (v.health < 100) crashed++;
      ctx.vehicles.remove(v.id);
      ctx.people.remove(driver.id);
    }
    expect(hits).toBeGreaterThan(0);
    expect(crashed).toBeGreaterThan(0);
  });

  it('le pilote automatique traverse le quartier par les rues, sans toucher un mur', () => {
    const spots = roadSpots(40);
    // deux rues éloignées l'une de l'autre
    let a = spots[0]!;
    let b = spots[1]!;
    let best = 0;
    for (const p of spots) {
      for (const q of spots) {
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (d > best && d < 700) {
          best = d;
          a = p;
          b = q;
        }
      }
    }
    expect(best).toBeGreaterThan(250);
    const path: number[] = [];
    expect(ctx.world.findPath(a.x, a.z, b.x, b.z, 'vehicle', path)).toBe(true);
    let length = 0;
    for (let i = 2; i < path.length; i += 2) length += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
    const v = ctx.vehicles.spawn('fourgon_crs', a.x, a.z, a.heading);
    expect(autopilot.driveTo(v, b.x, b.z)).toBe(true);
    let wallHits = 0;
    const off = ctx.events.on('vehicle:collision', (e) => {
      if (e.vehicleId === v.id && e.otherKind === 'world') wallHits++;
    });
    let inside = false;
    let maxOff = 0;
    let time = 0;
    const limit = length / 4 + 90;
    while (time < limit && autopilot.status(v).state !== 'arrive') {
      t.game.step(DT);
      time += DT;
      if (ctx.world.buildingHeightAt(v.x, v.z) > 0) inside = true;
      if (ctx.world.nearestRoad(v.x, v.z, sample, 40)) maxOff = Math.max(maxOff, sample.dist - sample.width / 2);
    }
    off();
    const st = autopilot.status(v);
    console.log(`quartier d'essai : ${length.toFixed(0)} m d'itinéraire en ${time.toFixed(0)} s (${st.state}/${st.reason}), ${wallHits} contact(s) avec le décor, écart max hors chaussée ${maxOff.toFixed(1)} m, santé ${v.health.toFixed(0)}`);
    expect(st.state).toBe('arrive');
    expect(Math.hypot(v.x - b.x, v.z - b.z)).toBeLessThan(4);
    expect(inside).toBe(false);
    expect(v.health).toBeGreaterThan(95);
    expect(maxOff).toBeLessThan(3); // reste sur la chaussée (au pire mord un trottoir dans un virage serré)
    ctx.vehicles.remove(v.id);
  });

  it('coût par pas avec 150 véhicules dans le vrai monde : 30 pilotés, 120 garés', () => {
    const spots = roadSpots(200, 40);
    expect(spots.length).toBeGreaterThan(30);
    const list: Vehicle[] = [];
    const pos: Vec2 = { x: 0, z: 0 };
    // garés au bord des rues
    for (let i = 0; list.length < 120 && i < 2000; i++) {
      const s = spots[i % spots.length]!;
      const ed = ctx.world.edge(s.edge);
      const along = ((i / spots.length) | 0) * 7 - 14;
      const side = ed.width / 2 - 1.2;
      pos.x = s.x + Math.sin(s.heading) * along - Math.cos(s.heading) * side;
      pos.z = s.z + Math.cos(s.heading) * along + Math.sin(s.heading) * side;
      if (!ctx.world.isFree(pos.x, pos.z, 2.6)) continue;
      list.push(ctx.vehicles.spawn(i % 7 === 0 ? 'fourgon_crs' : 'voiture', pos.x, pos.z, s.heading));
    }
    expect(list.length).toBe(120);
    const moving: Vehicle[] = [];
    for (let i = 0; i < 30; i++) {
      const s = spots[(i * 5) % spots.length]!;
      const v = ctx.vehicles.spawn('voiture', s.x + Math.sin(s.heading) * 20, s.z + Math.cos(s.heading) * 20, s.heading);
      moving.push(v);
      const d = spots[(i * 11 + 7) % spots.length]!;
      autopilot.driveTo(v, d.x, d.z);
    }
    const steps = 1500;
    for (let i = 0; i < 200; i++) t.game.step(DT);
    const t0 = cpuMs();
    for (let i = 0; i < steps; i++) {
      if (i % 60 === 0) {
        for (let k = 0; k < moving.length; k++) {
          const st = autopilot.status(moving[k]!).state;
          if (st === 'en_route' || st === 'attente' || st === 'manoeuvre') continue;
          const d = spots[(i + k * 13) % spots.length]!;
          autopilot.driveTo(moving[k]!, d.x, d.z);
        }
      }
      t.game.step(DT);
    }
    const cost = (cpuMs() - t0) / steps;
    const rolling = moving.filter((v) => Math.abs(v.speed) > 0.5).length;
    const asleep = ctx.vehicles.list.filter((v) => ext.dynamics(v).asleep).length;
    console.log(`[perf] vrai monde, 150 véhicules (${rolling} roulent, ${asleep} dorment) : ${cost.toFixed(3)} ms de processeur par pas, moteur et monde compris`);
    expect(ctx.vehicles.list.length).toBe(150);
    expect(cost).toBeLessThan(1.5);
    for (const v of ctx.vehicles.list) expect(ctx.world.buildingHeightAt(v.x, v.z)).toBe(0);
  }, 60000);
});
