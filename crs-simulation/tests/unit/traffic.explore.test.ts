import { describe, expect, it } from 'vitest';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createTown, createTrafficBench } from '@/sim/traffic/testkit';

const DT = 1 / 30;

describe('exploration stationnement', () => {
  it('stationnement et trafic', async () => {
    const town = createTown({ signals: [4], width: 16, sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    const t = b.api.tuning;
    t.vehicleDensity = 2.5;
    t.spawnMin = 130; t.spawnMax = 250; t.despawn = 256;
    t.parkedRadius = 230;
    t.parkShare = 0.5;
    t.pedestrianDensity = 0.5;
    t.pedSpawnMin = 10; t.pedSpawnMax = 200; t.pedDespawn = 240;
    let collisions = 0; let parkedEvents = 0;
    b.ctx.events.on('vehicle:collision', (e) => { collisions++; if (collisions < 5) { const v = b.ctx.vehicles.get(e.vehicleId)!; const o = b.ctx.vehicles.get(e.otherId); console.log(`COLLISION t=${b.ctx.clock.now.toFixed(0)} ${e.otherKind} ${e.speed.toFixed(1)} (${v.x.toFixed(1)},${v.z.toFixed(1)}) parked=${b.api.isParked(v)} other (${o?.x.toFixed(1)},${o?.z.toFixed(1)}) parked=${o ? b.api.isParked(o) : '-'}`); } });
    b.ctx.events.onAny('traffic:motorist', (e) => { const ev = e as { state: string; x: number; z: number }; if (ev.state === 'gare') { parkedEvents++; if (parkedEvents < 4) console.log(`GARÉ t=${b.ctx.clock.now.toFixed(0)} en (${ev.x.toFixed(1)}, ${ev.z.toFixed(1)})`); } });
    b.step(1);
    const parked = b.sys.parking.list;
    console.log('garés au départ', parked.length, parked.slice(0, 6).map((p) => `${p.v.kind}(${p.v.x.toFixed(1)},${p.v.z.toFixed(1)},h=${(p.v.heading * 57.3).toFixed(0)})`).join(' '));
    let offRoad = 0;
    for (const p of parked) if (town.surfaceAt(p.v.x, p.v.z) !== 'road') offRoad++;
    console.log('hors chaussée', offRoad);
    for (let i = 0; i < 30 * 240; i++) {
      b.step(DT);
      if (i % 1800 === 1799) {
        const s = b.api.stats;
        let maxStill = 0;
        for (const br of b.sys.cars.list) maxStill = Math.max(maxStill, br.stillT);
        console.log(`t=${b.ctx.clock.now.toFixed(0)} veh=${s.vehicles}/${s.vehicleTarget} parked=${s.parked} peds=${s.pedestrians} collisions=${collisions} garés=${parkedEvents} maxStill=${maxStill} despawned=${s.despawned}`);
      }
    }
    expect(parked.length).toBeGreaterThan(0);
  }, 300000);
});
