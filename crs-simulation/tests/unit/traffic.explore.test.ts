import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@/core/contracts';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';
import { createTown, createTrafficBench } from '@/sim/traffic/testkit';

const DT = 1 / 30;

describe('exploration', () => {
  it('circulation d\'ambiance', async () => {
    const town = createTown({ signals: [4, 1, 7] });
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    const t = b.api.tuning;
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    t.pedestrianDensity = 0;
    t.parkedDensity = 0;
    t.vehicleDensity = 4.4;
    t.spawnMin = 130;
    t.spawnMax = 285;
    t.despawn = 300;
    let collisions = 0;
    const desc = (v: Vehicle | undefined): string => {
      if (!v) return '?';
      const br = b.sys.cars.byVehicle.get(v.id);
      const st = ap.status(v);
      return `#${v.id} ${v.kind} (${v.x.toFixed(1)},${v.z.toFixed(1)}) h=${(v.heading * 57.3).toFixed(0)} u=${v.speed.toFixed(1)} mode=${br?.mode} cause=${br?.cause} hold=${br?.holdCause} age=${br ? (b.ctx.clock.now - br.bornAt).toFixed(0) : '-'} ap=${st.state}/${st.reason} s=${br?.route.s.toFixed(0)}/${br?.route.total.toFixed(0)} cpNext=${br?.route.cpNext}/${br?.route.cpCount} still=${br?.stillT}`;
    };
    b.ctx.events.on('vehicle:collision', (e) => {
      collisions++;
      if (collisions < 6) console.log(`COLLISION t=${b.ctx.clock.now.toFixed(1)} ${e.otherKind} speed=${e.speed.toFixed(1)}\n   ${desc(b.ctx.vehicles.get(e.vehicleId))}\n   ${desc(b.ctx.vehicles.get(e.otherId))}`);
    });
    let dumped = false;
    for (let i = 0; i < 30 * 70; i++) {
      b.step(DT);
      if (i % 300 === 299) {
        const s = b.api.stats;
        let still = 0;
        for (const br of b.sys.cars.list) if (br.stillT > 8) still++;
        console.log(`t=${b.ctx.clock.now.toFixed(0)} veh=${s.vehicles}/${s.vehicleTarget} still>8s=${still} collisions=${collisions}`);
        if (still >= 3 && !dumped) {
          dumped = true;
          // autour du carrefour le plus encombré
          for (const br of b.sys.cars.list) if (Math.hypot(br.v.x - 240, br.v.z - 120) < 30) console.log('   ' + desc(br.v));
        }
      }
    }
    expect(collisions).toBeLessThan(1000);
  }, 300000);
});
