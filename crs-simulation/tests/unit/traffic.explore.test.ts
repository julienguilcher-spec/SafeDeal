import { describe, expect, it } from 'vitest';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createTown, createTrafficBench } from '@/sim/traffic/testkit';

const DT = 1 / 30;

describe('exploration', () => {
  it('circulation d\'ambiance 5 minutes', async () => {
    const town = createTown({ signals: [4, 1, 7] });
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    const t = b.api.tuning;
    t.pedestrianDensity = 0;
    t.parkedDensity = 0;
    t.vehicleDensity = 4.4;
    t.spawnMin = 130;
    t.spawnMax = 285;
    t.despawn = 300;
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', (e) => {
      collisions++;
      const v = b.ctx.vehicles.get(e.vehicleId)!;
      console.log(`COLLISION t=${b.ctx.clock.now.toFixed(1)} ${e.otherKind} speed=${e.speed.toFixed(1)} at ${e.x.toFixed(0)},${e.z.toFixed(0)} veh ${e.vehicleId} (${v?.kind}) other ${e.otherId}`);
    });
    const cpu0 = process.cpuUsage();
    for (let i = 0; i < 30 * 300; i++) {
      b.step(DT);
      if (i % 900 === 899) {
        const s = b.api.stats;
        let still = 0;
        let maxStill = 0;
        for (const br of b.sys.cars.list) { if (br.stillT > 8) still++; maxStill = Math.max(maxStill, br.stillT); }
        console.log(`t=${b.ctx.clock.now.toFixed(0)} veh=${s.vehicles}/${s.vehicleTarget} blocked=${s.blocked} still>8s=${still} maxStill=${maxStill} spawned=${s.spawned} despawned=${s.despawned} reroutes=${s.reroutes} collisions=${collisions} paths=${town.pathCalls}`);
        if (still > 0) for (const br of b.sys.cars.list) if (br.stillT > 8) console.log(`   still: veh ${br.v.id} ${br.v.kind} at ${br.v.x.toFixed(0)},${br.v.z.toFixed(0)} mode=${br.mode} cause=${br.cause} hold=${br.holdCause} still=${br.stillT}`);
      }
    }
    const cpu = process.cpuUsage(cpu0);
    console.log(`cpu ${(cpu.user / 1000).toFixed(0)} ms pour 9000 pas`);
    expect(collisions).toBeLessThan(1000);
  }, 300000);
});
