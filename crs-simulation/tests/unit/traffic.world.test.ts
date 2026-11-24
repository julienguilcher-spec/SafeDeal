// Circulation — essai avec le vrai module du monde (quartier d'essai) : graphe réel, surfaces réelles, itinéraires réels.
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

const DT = 1 / 30;

describe('circulation dans le quartier d\'essai (vrai module du monde)', () => {
  it('trois minutes de vie civile : véhicules, stationnement, piétons, fermeture d\'un périmètre — sans erreur', async () => {
    const sys = new TrafficSystem();
    const t = createTestContext({
      modules: [() => createWorldQuerySystems({ source: 'test', colliders: null }), vehicles, people],
      systems: [sys],
    });
    await t.ready;
    await t.start({ mode: 'test' });
    const ctx = t.ctx;
    ctx.world.setFocus(0, 0);
    await ctx.world.whenLoaded(0, 0, 900);
    const api = ctx.require<TrafficApi>(TRAFFIC_SERVICE);
    const control = ctx.require<TrafficControlApi>(EXT.traffic);
    api.tuning.vehicleDensity = 2;
    api.tuning.spawnMin = 90;
    api.tuning.pedSpawnMin = 15;
    let signals = 0;
    let junctions = 0;
    for (let n = 0; n < ctx.world.nodeCount; n++) {
      const node = ctx.world.node(n);
      if (node.signal) signals++;
      if (node.edges.length >= 3) junctions++;
    }
    let crashes = 0;
    let hits = 0;
    let hurt = 0;
    ctx.events.on('vehicle:collision', (e) => {
      if (e.otherKind === 'vehicle') crashes++;
      else if (e.otherKind === 'person') hits++;
    });
    ctx.events.on('person:hurt', () => hurt++);
    let samples = 0;
    let onRoad = 0;
    let inBuilding = 0;
    let maxVehicles = 0;
    let maxPeds = 0;
    let worstStop = 0;
    const cpu0 = process.cpuUsage();
    for (let i = 0; i < 30 * 180; i++) {
      t.step(DT, DT);
      if (i === 30 * 100) {
        const closed = control.closeArea(0, 0, 120, 0);
        console.log(`périmètre de 120 m : ${closed.length} rues fermées`);
      }
      if (i % 15 !== 0) continue;
      maxVehicles = Math.max(maxVehicles, api.stats.vehicles);
      maxPeds = Math.max(maxPeds, api.stats.pedestrians);
      for (const br of sys.cars.list) worstStop = Math.max(worstStop, br.stillT);
      for (const br of sys.peds.list) {
        samples++;
        const s = ctx.world.surfaceAt(br.p.x, br.p.z);
        if (s === 'building' || s === 'water') inBuilding++;
        if ((s === 'road' || s === 'sett') && br.state !== S_CROSS && br.state !== S_WAIT) onRoad++;
      }
    }
    const cpu = process.cpuUsage(cpu0);
    const s = api.stats;
    console.log(
      `quartier d'essai (${ctx.world.nodeCount} nœuds, ${ctx.world.edgeCount} arêtes, ${junctions} carrefours, ${signals} feux) : `
      + `jusqu'à ${maxVehicles} véhicules et ${maxPeds} piétons, ${s.parked} garés, ${s.spawned} apparitions, ${s.despawned} disparitions, `
      + `accrochages ${crashes}, piétons heurtés ${hits}, blessés ${hurt}, plus long arrêt ${worstStop} s, déviations ${s.reroutes}, `
      + `piétons sur la chaussée hors traversée ${(100 * onRoad / Math.max(1, samples)).toFixed(1)} %, dans le bâti ${(100 * inBuilding / Math.max(1, samples)).toFixed(1)} %, `
      + `${((cpu.user + cpu.system) / 1000 / 5400).toFixed(3)} ms de processeur par pas (tous modules)`,
    );
    expect(ctx.world.edgeCount).toBeGreaterThan(10);
    expect(maxVehicles).toBeGreaterThan(3);
    expect(maxPeds).toBeGreaterThan(5);
    expect(s.despawned + s.vehicles).toBeGreaterThan(5);
    expect(control.closures.length).toBeGreaterThan(0);
    expect(inBuilding / Math.max(1, samples)).toBeLessThan(0.02);
  }, 300000);
});
