// Circulation — essai sur la vraie carte de Paris (exécuté seulement si public/data/paris est présent).
import { describe, expect, it } from 'vitest';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as people } from '@/sim/people';
import { TRAFFIC_SERVICE, TrafficSystem } from '@/sim/traffic';
import type { TrafficApi } from '@/sim/traffic';
import { S_CROSS, S_WAIT } from '@/sim/traffic/ped-brain';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createWorldQuerySystems } from '@/world/query';
import { FsMapSource, defaultParisDir } from '@/world/query/source-fs';

const DT = 1 / 30;
const available = await new FsMapSource(defaultParisDir()).exists();
if (!available) console.log('[circulation] carte de Paris absente : essai non exécuté');

describe.skipIf(!available)('circulation sur la vraie carte de Paris', () => {
  it('deux minutes autour de la place de l\'Opéra : trafic, feux, stationnement, piétons, fermeture d\'un périmètre', async () => {
    const sys = new TrafficSystem();
    const t = createTestContext({
      modules: [() => createWorldQuerySystems({ source: 'paris', colliders: null }), vehicles, people],
      systems: [sys],
    });
    await t.ready;
    // place de l'Opéra : carrefour à forte circulation (dossier 04)
    const x = 811;
    const z = -564;
    await t.start({ mode: 'libre', x, z, timeOfDay: 17 });
    const ctx = t.ctx;
    ctx.world.setFocus(x, z);
    await ctx.world.whenLoaded(x, z, 700);
    const api = ctx.require<TrafficApi>(TRAFFIC_SERVICE);
    const control = ctx.require<TrafficControlApi>(EXT.traffic);
    expect(sys.kernel.cache.nodeCount).toBe(ctx.world.nodeCount);
    let crashes = 0;
    let hits = 0;
    let wall = 0;
    ctx.events.on('vehicle:collision', (e) => {
      if (e.otherKind === 'vehicle') crashes++;
      else if (e.otherKind === 'person') hits++;
      else if (e.otherKind === 'world') wall++;
    });
    let samples = 0;
    let onRoad = 0;
    let inBuilding = 0;
    let maxVehicles = 0;
    let maxPeds = 0;
    let worstStop = 0;
    let moving = 0;
    let vs = 0;
    let trafficUs = 0;
    const original = sys.update.bind(sys);
    sys.update = (dt: number): void => {
      const c0 = process.cpuUsage();
      original(dt);
      const c = process.cpuUsage(c0);
      trafficUs += c.user + c.system;
    };
    const cpu0 = process.cpuUsage();
    const steps = 30 * 120;
    for (let i = 0; i < steps; i++) {
      t.step(DT, DT);
      if (i === 30 * 80) {
        const closed = control.closeArea(x, z, 150, 0);
        console.log(`périmètre de 150 m autour de l'Opéra : ${closed.length} rues fermées`);
        expect(closed.length).toBeGreaterThan(3);
      }
      if (i % 15 !== 0) continue;
      maxVehicles = Math.max(maxVehicles, api.stats.vehicles);
      maxPeds = Math.max(maxPeds, api.stats.pedestrians);
      for (const br of sys.cars.list) {
        worstStop = Math.max(worstStop, br.stillT);
        vs++;
        if (Math.abs(br.v.speed) > 1) moving++;
      }
      for (const br of sys.peds.list) {
        samples++;
        const s = ctx.world.surfaceAt(br.p.x, br.p.z);
        if (s === 'building' || s === 'water') inBuilding++;
        if ((s === 'road' || s === 'sett') && br.state !== S_CROSS && br.state !== S_WAIT) onRoad++;
      }
    }
    sys.update = original;
    const cpu = process.cpuUsage(cpu0);
    const s = api.stats;
    console.log(
      `Paris, place de l'Opéra, 17 h (${ctx.world.nodeCount} nœuds, ${ctx.world.edgeCount} arêtes) : jusqu'à ${maxVehicles} véhicules (visé ${s.vehicleTarget}) et ${maxPeds} piétons (visé ${s.pedestrianTarget}), `
      + `${s.parked} garés, ${s.spawned} apparitions, ${s.despawned} disparitions, en mouvement ${(100 * moving / Math.max(1, vs)).toFixed(0)} % du temps, `
      + `accrochages ${crashes}, contacts avec le décor ${wall}, piétons heurtés ${hits}, plus long arrêt ${worstStop} s, déviations ${s.reroutes}, `
      + `piétons sur la chaussée hors traversée ${(100 * onRoad / Math.max(1, samples)).toFixed(1)} %, dans le bâti ou l'eau ${(100 * inBuilding / Math.max(1, samples)).toFixed(1)} %, `
      + `module de circulation ${(trafficUs / 1000 / steps).toFixed(3)} ms par pas, tous modules ${((cpu.user + cpu.system) / 1000 / steps).toFixed(3)} ms par pas`,
    );
    expect(maxVehicles).toBeGreaterThan(5);
    expect(maxPeds).toBeGreaterThan(10);
    expect(control.closures.length).toBeGreaterThan(3);
    expect(trafficUs / 1000 / steps).toBeLessThan(2);
  }, 300000);
});
