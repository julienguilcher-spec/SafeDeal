// Circulation — sirènes deux-tons, piétons qui traversent, cyclistes : les automobilistes se rangent à droite après un
// temps de réaction (certains distraits), le véhicule en intervention passe entre les files sans s'arrêter ; les
// piétons restent au bord du trottoir (un pas en retrait) quand une sirène arrive, ceux qui traversent pressent le pas ;
// traversées aux carrefours et hors passage, les voitures freinent pour eux ; les cyclistes roulent au bord droit et se
// décalent pour laisser passer la sirène.
import { describe, expect, it } from 'vitest';
import type { Person, Vehicle } from '@/core/contracts';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';
import type { CarBrain } from '@/sim/traffic/car-brain';
import type { PedBrain } from '@/sim/traffic/ped-brain';
import { S_CROSS, S_WAIT } from '@/sim/traffic/ped-brain';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import type { TrafficBench, Town } from '@/sim/traffic/testkit';

const DT = 1 / 30;
const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;

function policeVan(b: TrafficBench, x: number, z: number, heading: number): Vehicle {
  const van = b.ctx.vehicles.spawn('fourgon_crs', x, z, heading);
  const crs = b.ctx.people.spawn({ kind: 'crs', x, z });
  expect(b.ctx.vehicles.enter(crs, van, 'driver')).toBe(true);
  return van;
}

const brainOf = (b: TrafficBench, v: Vehicle): CarBrain => b.sys.cars.byVehicle.get(v.id)!;
const pedOf = (p: Person): PedBrain => p.brain as PedBrain;

async function bench(town: Town, seed = 1): Promise<TrafficBench> {
  return createTrafficBench({ seed, world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ } });
}

/** Met un piéton au bord du trottoir sud de la rue est-ouest du milieu, prêt à la traverser vers le nord, en (x, 125,8). */
function readyToCross(b: TrafficBench, town: Town, x: number): Person {
  const p = b.api.spawnPedestrian('passant', x, 125.8)!;
  expect(p).not.toBeNull();
  const br = pedOf(p);
  const edge = town.edgeBetween(town.junction(0, 1), town.junction(1, 1));
  expect(br.edge).toBe(edge);
  br.state = S_WAIT;
  br.tx = x;
  br.tz = 114.2;
  br.nextEdge = edge;
  br.nextDir = br.dir;
  br.nextSide = -br.side;
  br.crossNode = -1;
  br.crossDx = 1;
  br.crossDz = 0;
  br.waited = 0;
  br.timer = 30;
  return p;
}

describe('circulation : sirènes deux-tons', () => {
  it('rue à double sens de 8 m : la file se range à droite après un temps de réaction, le fourgon passe au milieu sans s\'arrêter, puis chacun repart', async () => {
    const town = createTown({ width: 8, sidewalk: 3 });
    const b = await bench(town);
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    // trois automobilistes et un scooter vers l'est, un automobiliste en face
    const ahead = [
      b.api.spawnVehicle('voiture', 20, 122, EAST, 380, 120)!,
      b.api.spawnVehicle('scooter', 38, 122, EAST, 380, 120)!,
      b.api.spawnVehicle('citadine', 56, 122, EAST, 380, 120)!,
      b.api.spawnVehicle('utilitaire', 76, 122, EAST, 380, 120)!,
    ];
    const oncoming = b.api.spawnVehicle('suv', 330, 118, WEST, -140, 120)!;
    const all = [...ahead, oncoming];
    const van = policeVan(b, -90, 120, EAST);
    b.step(1);
    expect(ap.driveTo(van, 380, 120, { urgence: true })).toBe(true);
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    const pulled = all.map(() => false);
    const right = all.map(() => 0);
    const heardAt = all.map(() => -1);
    const delays = all.map(() => -1);
    let vanMin = Infinity;
    const t0 = b.ctx.clock.now;
    const t = runUntil(b, () => ahead.every((v) => van.x > v.x + 8) && van.x > oncoming.x + 8, 90, () => {
      all.forEach((v, i) => {
        const st = b.api.motorist(v);
        const br = brainOf(b, v);
        if (heardAt[i]! < 0 && br.heardFor === van.id) {
          heardAt[i] = b.ctx.clock.now;
          delays[i] = br.reactAt - b.ctx.clock.now;
        }
        if (st?.mode === 'range') {
          pulled[i] = true;
          expect(st.cause).toBe('sirene');
        }
        // écart à droite de l'axe dans son sens de marche
        right[i] = Math.max(right[i]!, v === oncoming ? 120 - v.z : v.z - 120);
      });
      if (van.x > -40 && van.x < 300) vanMin = Math.min(vanMin, van.speed);
    });
    expect(t).toBeGreaterThan(0);
    expect(van.siren).not.toBe(0);
    expect(pulled.every(Boolean)).toBe(true); // tous se sont rangés, le scooter et celui d'en face compris
    // serrés contre le bord droit (voie normale à 2 m de l'axe ; bord de la chaussée à 4 m), sans monter sur le trottoir
    for (let i = 0; i < all.length; i++) {
      const half = all[i]!.def.width / 2;
      expect(right[i]!, all[i]!.kind).toBeGreaterThan(4 - half - 0.6);
      expect(right[i]! + half, all[i]!.kind).toBeLessThan(4.15);
    }
    // personne n'a réagi à l'instant : 0,5 s au moins
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThan(5.6);
    }
    expect(vanMin).toBeGreaterThan(5); // le fourgon ne s'est jamais arrêté derrière eux
    expect(Math.abs(van.z - 120)).toBeLessThan(0.6); // il roule au milieu, entre les deux files
    expect(collisions).toBe(0);
    // la sirène passée, ils repartent
    const tResume = runUntil(b, () => all.every((v) => b.api.motorist(v)?.mode !== 'range' && Math.abs(v.speed) > 2), 30);
    expect(tResume).toBeGreaterThan(0);
    expect(collisions).toBe(0);
    console.log(`sirène en file : ${(t).toFixed(0)} s pour doubler cinq véhicules depuis ${(b.ctx.clock.now - t0 - tResume - t).toFixed(0)} s, fourgon jamais sous ${vanMin.toFixed(1)} m/s, délais de réaction ${delays.map((d) => d.toFixed(1)).join(' / ')} s, écart à l'axe des rangés ${right.map((r) => r.toFixed(1)).join(' / ')} m, reprise en ${tResume.toFixed(1)} s`);
  }, 120000);

  it('délais de réaction : 0,5 à 2 s pour la plupart, quelques distraits plus lents', async () => {
    const town = createTown({ cols: 4, rows: 3, width: 9, sidewalk: 3, spacing: 160 });
    const delays: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const b = await bench(town, seed);
      const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
      const cars: Vehicle[] = [];
      for (let i = 0; i < 3; i++) cars.push(b.api.spawnVehicle(i % 2 === 0 ? 'voiture' : 'citadine', 20 + i * 30, 122.2, EAST, 640, 160)!);
      const van = policeVan(b, -40, 120, EAST);
      b.step(0.5);
      ap.driveTo(van, 640, 160, { urgence: true });
      const seen = new Set<number>();
      runUntil(b, () => seen.size === cars.length, 60, () => {
        for (const v of cars) {
          const br = b.sys.cars.byVehicle.get(v.id);
          if (!br || seen.has(v.id) || br.heardFor !== van.id) continue;
          seen.add(v.id);
          delays.push(br.reactAt - b.ctx.clock.now);
        }
      });
    }
    delays.sort((a, c) => a - c);
    const quick = delays.filter((d) => d <= 2.0).length;
    console.log(`délais de réaction (${delays.length} automobilistes) : ${delays.map((d) => d.toFixed(1)).join(' ')} s`);
    expect(delays.length).toBe(36);
    expect(delays[0]!).toBeGreaterThanOrEqual(0.5);
    expect(delays[delays.length - 1]!).toBeLessThan(5.6);
    expect(quick / delays.length).toBeGreaterThan(0.7);
  }, 180000);

  it('rue étroite à double sens (6 m) : pas la place de se ranger devant elle, l\'automobiliste continue ; celui d\'en face se serre', async () => {
    const town = createTown({ width: 6, sidewalk: 2.5 });
    const b = await bench(town);
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const car = b.api.spawnVehicle('voiture', 30, 121.5, EAST, 380, 120)!;
    const van = policeVan(b, -40, 120, EAST);
    b.step(1);
    ap.driveTo(van, 380, 120, { urgence: true });
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    let pulled = false;
    let minSpeed = Infinity;
    runUntil(b, () => car.x > 100, 30, () => {
      if (b.api.motorist(car)?.mode === 'range') pulled = true;
      if (car.x > 45) minSpeed = Math.min(minSpeed, car.speed);
    });
    expect(pulled).toBe(false); // il ne s'arrête pas pour boucher la rue : il dégage devant elle
    expect(minSpeed).toBeGreaterThan(4);
    expect(collisions).toBe(0);
  }, 60000);
});

describe('circulation : piétons et sirènes', () => {
  it('au bord du trottoir, il ne traverse pas quand une sirène arrive : un pas en arrière, il la regarde passer, puis traverse', async () => {
    const town = createTown({ width: 8, sidewalk: 3 });
    const b = await bench(town);
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const van = policeVan(b, -30, 120, EAST);
    b.step(0.5);
    ap.driveTo(van, 380, 120, { urgence: true });
    b.step(2);
    const p = readyToCross(b, town, 70);
    const z0 = p.z;
    let onRoadBeforePass = 0;
    let backed = 0;
    const tPass = runUntil(b, () => van.x > 80, 30, () => {
      if (p.z < 124) onRoadBeforePass++;
      backed = Math.max(backed, p.z - z0);
    });
    expect(tPass).toBeGreaterThan(0);
    expect(onRoadBeforePass).toBe(0); // resté sur le trottoir tant qu'elle arrivait
    expect(backed).toBeGreaterThan(0.5); // un pas en arrière
    expect(pedOf(p).state).toBe(S_WAIT);
    // elle est passée : il traverse
    const tCross = runUntil(b, () => p.z < 116, 25);
    expect(tCross).toBeGreaterThan(0);
    console.log(`piéton : recul de ${backed.toFixed(1)} m au passage de la sirène, traversée achevée ${tCross.toFixed(1)} s après`);
  }, 60000);

  it('déjà sur la chaussée quand la sirène arrive : il presse le pas jusqu\'au trottoir, et le fourgon ne le touche pas', async () => {
    const town = createTown({ width: 8, sidewalk: 3 });
    const b = await bench(town);
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const p = readyToCross(b, town, 80);
    // il s'engage (rien en vue), puis la sirène arrive
    runUntil(b, () => pedOf(p).state === S_CROSS && p.z < 123.6, 10);
    const van = policeVan(b, -10, 120, EAST);
    ap.driveTo(van, 380, 120, { urgence: true });
    let hurt = 0;
    b.ctx.events.on('person:hurt', () => hurt++);
    let maxSpeed = 0;
    runUntil(b, () => van.x > 100, 30, () => {
      if (pedOf(p).state === S_CROSS) maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vz));
    });
    expect(p.z).toBeLessThan(116); // arrivé de l'autre côté
    expect(maxSpeed).toBeGreaterThan(2.2); // il a couru
    expect(hurt).toBe(0);
  }, 60000);
});

describe('circulation : piétons qui traversent', () => {
  it('une voiture freine pour un piéton qui traverse hors passage devant elle, sans le toucher', async () => {
    const town = createTown({ width: 8, sidewalk: 3 });
    const b = await bench(town);
    const car = b.api.spawnVehicle('voiture', 10, 122, EAST, 380, 120)!;
    let hurt = 0;
    let hits = 0;
    b.ctx.events.on('person:hurt', () => hurt++);
    b.ctx.events.on('vehicle:collision', (e) => { if (e.otherKind === 'person') hits++; });
    runUntil(b, () => car.speed > 7.5 && car.x > 50, 15);
    // il ne regarde pas : il s'engage alors que la voiture arrive à 30 km/h, à 18 m
    const p = readyToCross(b, town, 70);
    const br = pedOf(p);
    br.state = S_CROSS;
    br.timer = 30;
    let minSpeed = Infinity;
    const t = runUntil(b, () => car.x > 90, 40, () => {
      if (car.x > 50 && car.x < 72) minSpeed = Math.min(minSpeed, car.speed);
    });
    expect(t).toBeGreaterThan(0);
    expect(minSpeed).toBeLessThan(3); // il a pilé (ou presque)
    expect(hurt + hits).toBe(0);
    expect(p.z).toBeLessThan(117);
  }, 60000);

  it('trois minutes de vie de quartier : traversées aux carrefours et quelques traversées sauvages, personne n\'est heurté ni ne reste sur la chaussée', async () => {
    const town = createTown({ signals: [4], buildings: true, sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    const t = b.api.tuning;
    t.spawnMin = 130;
    t.spawnMax = 250;
    t.despawn = 256;
    t.pedSpawnMin = 10;
    t.pedSpawnMax = 200;
    t.pedDespawn = 240;
    t.vehicleDensity = 1.5;
    t.parkedDensity = 0;
    t.pedestrianDensity = 2;
    let hurt = 0;
    b.ctx.events.on('person:hurt', () => hurt++);
    const jay = new Set<number>();
    const crossings = new Set<number>();
    const onRoad = new Map<number, number>();
    let worstOnRoad = 0;
    for (let i = 0; i < 30 * 180; i++) {
      b.step(DT, DT);
      if (i % 3 !== 0) continue;
      for (const br of b.sys.peds.list) {
        const id = br.p.id;
        if (br.state === S_CROSS) {
          crossings.add(id * 1000 + Math.floor(b.ctx.clock.now / 30));
          if (br.jaywalk) jay.add(id);
        }
        if (town.surfaceAt(br.p.x, br.p.z) === 'road') {
          const n = (onRoad.get(id) ?? 0) + 0.1;
          onRoad.set(id, n);
          worstOnRoad = Math.max(worstOnRoad, n);
        } else {
          onRoad.delete(id);
        }
      }
    }
    console.log(`3 min : ${b.api.stats.pedestrians} piétons, ${crossings.size} traversées, dont ${jay.size} piétons en traversée sauvage, plus long séjour sur la chaussée ${worstOnRoad.toFixed(1)} s, blessés ${hurt}`);
    expect(crossings.size).toBeGreaterThan(20);
    expect(jay.size).toBeGreaterThan(0);
    expect(worstOnRoad).toBeLessThan(25);
    expect(hurt).toBe(0);
  }, 300000);
});

describe('circulation : cyclistes', () => {
  it('le cycliste roule à 15-22 km/h au bord droit ; rattrapé par une sirène, il se décale contre le trottoir et ralentit, puis repart', async () => {
    const town = createTown({ width: 9, sidewalk: 3 });
    const b = await bench(town);
    const ap = b.ctx.require<AutopilotApi>('vehicles.autopilot');
    const bike = b.api.spawnVehicle('velo', 10, 122.5, EAST, 380, 120)!;
    expect(bike.kind).toBe('velo');
    expect(bike.seats[0]).not.toBe(0); // un cycliste en selle
    const br = brainOf(b, bike);
    expect(br.cruise).toBeGreaterThanOrEqual(4);
    expect(br.cruise).toBeLessThanOrEqual(6);
    // croisière : allure et place sur la chaussée (bord à 4,5 m de l'axe)
    let lat = 0;
    let n = 0;
    runUntil(b, () => bike.x > 75, 30, () => {
      if (bike.x > 40) {
        lat += bike.z - 120;
        n++;
      }
    });
    lat /= n;
    expect(bike.speed).toBeGreaterThan(3.8);
    expect(bike.speed).toBeLessThan(6.3);
    expect(lat).toBeGreaterThan(3.0); // au bord droit (une voiture roule à 2,25 m de l'axe)
    expect(lat + 0.3).toBeLessThan(4.5);
    // une sirène arrive derrière lui
    const van = policeVan(b, bike.x - 80, 120, EAST);
    ap.driveTo(van, 380, 120, { urgence: true });
    let pulled = false;
    let minSpeed = Infinity;
    let maxRight = 0;
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    const t = runUntil(b, () => van.x > bike.x + 8, 30, () => {
      if (b.api.motorist(bike)?.mode === 'range') pulled = true;
      if (van.x > bike.x - 25) minSpeed = Math.min(minSpeed, bike.speed);
      maxRight = Math.max(maxRight, bike.z - 120);
    });
    expect(t).toBeGreaterThan(0);
    expect(pulled).toBe(true);
    expect(minSpeed).toBeLessThan(br.cruise - 0.8); // il a ralenti
    expect(maxRight).toBeGreaterThan(lat + 0.15); // il s'est serré davantage
    expect(maxRight + 0.3).toBeLessThan(4.6);
    expect(collisions).toBe(0);
    const tResume = runUntil(b, () => b.api.motorist(bike)?.mode === 'route' && bike.speed > 3.5, 20);
    expect(tResume).toBeGreaterThan(0);
    console.log(`cycliste : ${br.cruise.toFixed(1)} m/s à ${lat.toFixed(2)} m de l'axe ; rangé à ${maxRight.toFixed(2)} m pour la sirène, ${minSpeed.toFixed(1)} m/s au plus lent, reparti ${tResume.toFixed(1)} s après`);
  }, 60000);

  it('une voiture double un cycliste en lui laissant de la place quand personne n\'arrive en face, et reste derrière lui sinon', async () => {
    const town = createTown({ cols: 4, width: 8, sidewalk: 3, spacing: 200 });
    const b = await bench(town);
    const bike = b.api.spawnVehicle('velo', 20, 122.6, EAST, 650, 200)!;
    const car = b.api.spawnVehicle('voiture', -30, 122, EAST, 650, 200)!;
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    let minGap = Infinity;
    const t = runUntil(b, () => car.x > bike.x + 10, 40, () => {
      if (Math.abs(car.x - bike.x) < 3) minGap = Math.min(minGap, Math.abs(bike.z - car.z) - (bike.def.width + car.def.width) / 2);
    });
    expect(t).toBeGreaterThan(0);
    expect(minGap).toBeGreaterThan(0.75); // ≈ 1 m en agglomération
    expect(collisions).toBe(0);
    console.log(`dépassement d'un cycliste en ${t.toFixed(0)} s, ${minGap.toFixed(2)} m entre eux au plus près`);
  }, 60000);

  it('trafic d\'ambiance : une part modeste de cyclistes, moins la nuit et sous la pluie', async () => {
    const count = async (hour: number, weather?: 'pluie'): Promise<{ bikes: number; all: number }> => {
      const town = createTown({ sidewalk: 4 });
      const b = await createTrafficBench({
        world: town, modules: [vehicles], ambient: true,
        session: { x: town.centerX, z: town.centerZ, timeOfDay: hour, ...(weather ? { weather } : {}) },
      });
      const t = b.api.tuning;
      t.spawnMin = 130;
      t.spawnMax = 250;
      t.despawn = 256;
      t.vehicleDensity = 3;
      t.parkedDensity = 0;
      let bikes = 0;
      let all = 0;
      b.ctx.events.on('vehicle:spawned', (e) => {
        const v = b.ctx.vehicles.get(e.id);
        if (!v) return;
        all++;
        if (v.kind === 'velo') bikes++;
      });
      b.step(240, 1 / 15);
      return { bikes, all };
    };
    const day = await count(14);
    const night = await count(2);
    const rain = await count(14, 'pluie');
    const share = (c: { bikes: number; all: number }): number => c.bikes / Math.max(1, c.all);
    console.log(`cyclistes : ${(100 * share(day)).toFixed(0)} % le jour (${day.all} apparitions), ${(100 * share(night)).toFixed(0)} % la nuit, ${(100 * share(rain)).toFixed(0)} % sous la pluie`);
    expect(day.all).toBeGreaterThan(60);
    expect(share(day)).toBeGreaterThan(0.05);
    expect(share(day)).toBeLessThan(0.2);
    expect(share(night)).toBeLessThan(share(day));
    expect(share(rain)).toBeLessThan(share(day));
  }, 240000);
});
