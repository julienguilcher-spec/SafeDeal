import { describe, expect, it } from 'vitest';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { S_CROSS, S_WAIT, S_CORNER, S_FLEE } from '@/sim/traffic/ped-brain';
import { createGasHazards, createTown, createTrafficBench } from '@/sim/traffic/testkit';
import type { GasHazards } from '@/sim/traffic/testkit';

const DT = 1 / 30;

describe('exploration piétons', () => {
  it('piétons d\'ambiance', async () => {
    const town = createTown({ signals: [4], buildings: true });
    let gas: GasHazards | null = null;
    const b = await createTrafficBench({
      world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true,
      setup: (ctx) => { gas = createGasHazards(ctx.hazards); ctx.hazards = gas; },
    });
    const t = b.api.tuning;
    t.vehicleDensity = 1.5;
    t.spawnMin = 130; t.spawnMax = 250; t.despawn = 256;
    t.parkedDensity = 0;
    t.pedestrianDensity = 2;
    t.pedSpawnMin = 10; t.pedSpawnMax = 200; t.pedDespawn = 240;
    const count = new Map<number, number>();
    const s0 = (): number => b.api.stats.spawned;
    let onRoad = 0; let samples = 0; let roadWalk = 0;
    const offenders = new Map<number, number>();
    let hurts = 0; let hits = 0; let speedSum = 0; let speedN = 0; let inGas = 0; let gasSamples = 0; let fled = 0;
    b.ctx.events.on('person:hurt', (e) => { hurts++; if (hurts < 5) console.log('HURT', e.info.kind, e.info.amount.toFixed(0), 't=' + b.ctx.clock.now.toFixed(0)); });
    b.ctx.events.on('vehicle:collision', (e) => { if (e.otherKind === 'person') hits++; });
    b.ctx.events.on('person:fled', () => fled++);
    for (let i = 0; i < 30 * 180; i++) {
      b.step(DT);
      if (i === 30 * 90) { gas!.clouds.push({ x: 120, z: 60, radius: 30, level: 0.8 }); console.log('GAZ en (120, 60), rayon 30'); }
      if (i % 15 === 0) {
        for (const br of b.sys.peds.list) {
          const p = br.p;
          samples++;
          if (br.state === 0) { speedSum += Math.hypot(p.vx, p.vz); speedN++; }
          if (gas!.clouds.length > 0) { gasSamples++; if (Math.hypot(p.x - 120, p.z - 60) < 28) inGas++; }
          const s = town.surfaceAt(p.x, p.z);
          if (s === 'road') {
            onRoad++;
            if (br.state !== S_CROSS && br.state !== S_WAIT) { roadWalk++; offenders.set(p.id, (offenders.get(p.id) ?? 0) + 1); }
          }
          count.set(br.state, (count.get(br.state) ?? 0) + 1);
        }
      }
      if (i % 900 === 899) {
        const s = b.api.stats;
        let stuck = 0; let fleeing = 0;
        for (const br of b.sys.peds.list) { stuck += br.stuckTotal; if (br.state === S_FLEE) fleeing++; }
        console.log(`   vitesse moyenne en marche ${(speedSum / Math.max(1, speedN)).toFixed(2)} m/s, déblocages ${stuck}, blessures ${hurts}, chocs véhicule-piéton ${hits}, en fuite ${fleeing}, dans le gaz ${gasSamples ? (100 * inGas / gasSamples).toFixed(1) : '-'}%, réfugiés ${fled}, apparus ${s0()}`);
        console.log(`t=${b.ctx.clock.now.toFixed(0)} peds=${s.pedestrians}/${s.pedestrianTarget} veh=${s.vehicles} onRoad=${(100 * onRoad / samples).toFixed(1)}% roadWalk=${(100 * roadWalk / samples).toFixed(2)}% states=${[...count.entries()].sort((a, c) => a[0] - c[0]).map(([k, v]) => `${k}:${(100 * v / samples).toFixed(0)}%`).join(' ')}`);
      }
    }
    let worst = 0; let worstId = 0;
    for (const [id, n] of offenders) if (n > worst) { worst = n; worstId = id; }
    const wb = b.sys.peds.byPerson.get(worstId);
    if (wb) console.log(`pire : #${worstId} ${worst} relevés sur la chaussée hors traversée, à (${wb.p.x.toFixed(1)}, ${wb.p.z.toFixed(1)}) état ${wb.state} arête ${wb.edge} dir ${wb.dir} côté ${wb.side}`);
    console.log('offenders', offenders.size, 'hurt?');
    expect(samples).toBeGreaterThan(0);
  }, 300000);
});
