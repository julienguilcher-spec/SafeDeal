// Circulation — véhicules civils conduits par le pilote automatique du module des véhicules et régulés par le
// module de circulation : feu rouge, distances, priorité, cinq minutes sans accrochage, densité, stationnement.
import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@/core/contracts';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { MODE_DONE } from '@/sim/traffic/car-brain';
import { createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import type { TrafficBench, Town } from '@/sim/traffic/testkit';
import { FAR_STOP } from '@/sim/traffic/tuning';

const DT = 1 / 30;
const EAST = Math.PI / 2;
const SOUTH = 0;

/** Avance jusqu'au début d'un rouge pour le sens donné au carrefour (le feu vient de passer au rouge). */
function waitForRed(b: TrafficBench, node: number, heading: number): void {
  let guard = 0;
  while (b.api.signal(node, heading) === 'rouge' && guard++ < 6000) b.step(DT, DT);
  while (b.api.signal(node, heading) !== 'rouge' && guard++ < 12000) b.step(DT, DT);
}

function tuneTown(b: TrafficBench): void {
  const t = b.api.tuning;
  t.spawnMin = 130;
  t.spawnMax = 250;
  t.despawn = 256;
  t.parkedRadius = 230;
  t.pedSpawnMin = 10;
  t.pedSpawnMax = 200;
  t.pedDespawn = 240;
}

describe('circulation : feu rouge et distances', () => {
  it('trois véhicules s\'arrêtent au feu rouge sans franchir la ligne, gardent leurs distances, repartent au vert', async () => {
    const town = createTown({ signals: [4] });
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const node = town.junction(1, 1);
    expect(b.api.signal(town.junction(0, 0), EAST)).toBe('aucun');
    waitForRed(b, node, EAST);
    // le feu de l'axe transversal n'est jamais vert en même temps
    const cars = [0, 1, 2].map((i) => b.api.spawnVehicle('voiture', 40 - i * 14, 122, EAST, 380, 120));
    for (const v of cars) expect(v).not.toBeNull();
    const list = cars as Vehicle[];
    for (const v of list) {
      expect(b.api.isTraffic(v)).toBe(true);
      expect(v.engineOn).toBe(true);
      const driver = b.ctx.people.get(v.seats[0]!);
      expect(driver?.kind).toBe('conducteur');
      expect(driver?.vehicleId).toBe(v.id);
    }
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    const line = 120 - FAR_STOP; // rue de 8 m à double sens : ligne à 16 m du centre du carrefour
    let maxNoseOnRed = -Infinity;
    let stoppedTogether = false;
    let minGap = Infinity;
    let causeSeen = '';
    let bothGreen = 0;
    let redTime = 0;
    const tGreen = runUntil(b, () => b.api.signal(node, EAST) === 'vert', 60, () => {
      redTime += DT;
      if (b.api.signal(node, EAST) !== 'rouge' && b.api.signal(node, SOUTH) !== 'rouge') bothGreen++;
      for (const v of list) maxNoseOnRed = Math.max(maxNoseOnRed, v.x + v.def.length * 0.5);
      if (list.every((v) => Math.abs(v.speed) < 0.05)) {
        stoppedTogether = true;
        minGap = Math.min(minGap, list[0]!.x - list[1]!.x - list[0]!.def.length, list[1]!.x - list[2]!.x - list[1]!.def.length);
        causeSeen = b.api.motorist(list[0]!)?.cause ?? '';
      }
    });
    expect(tGreen).toBeGreaterThan(15); // le rouge a duré
    expect(bothGreen).toBe(0);
    expect(stoppedTogether).toBe(true);
    expect(maxNoseOnRed).toBeLessThan(line + 0.3); // personne n'a franchi la ligne au rouge
    expect(maxNoseOnRed).toBeGreaterThan(line - 2.5); // le premier est bien venu jusqu'à la ligne
    expect(minGap).toBeGreaterThan(1.2); // distance de sécurité à l'arrêt
    expect(minGap).toBeLessThan(6);
    expect(causeSeen).toBe('feu');
    expect(b.api.motorist(list[0]!)?.mode).toBe('arret');
    // ils sont restés sur leur voie de droite (rue de 8 m : voie à 2 m de l'axe)
    for (const v of list) expect(Math.abs(v.z - 122)).toBeLessThan(1.3);
    const n = b.control.countNear(120, 120, 60);
    expect(n.stopped).toBe(3);
    expect(n.moving).toBe(0);
    // au vert : tous franchissent le carrefour
    const tPass = runUntil(b, () => list.every((v) => v.x > 140), 30);
    expect(tPass).toBeGreaterThan(0);
    expect(tPass).toBeLessThan(22);
    expect(collisions).toBe(0);
    console.log(`feu rouge : rouge vu pendant ${redTime.toFixed(0)} s, pare-chocs le plus avancé à ${(line - maxNoseOnRed).toFixed(2)} m de la ligne, intervalle minimal à l'arrêt ${minGap.toFixed(2)} m, carrefour franchi ${tPass.toFixed(1)} s après le vert`);
  }, 120000);

  it('carrefour sans feux : deux véhicules qui se présentent ensemble passent l\'un après l\'autre', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ } });
    const a = b.api.spawnVehicle('voiture', 40, 122, EAST, 380, 120)!;
    const c = b.api.spawnVehicle('citadine', 118, 40, SOUTH, 120, 380)!;
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    let together = 0;
    let waited = false;
    let minDist = Infinity;
    const t = runUntil(b, () => a.x > 160 && c.z > 160, 80, () => {
      const inA = Math.hypot(a.x - 120, a.z - 120) < 7;
      const inC = Math.hypot(c.x - 120, c.z - 120) < 7;
      if (inA && inC) together++;
      minDist = Math.min(minDist, Math.hypot(a.x - c.x, a.z - c.z));
      if (b.api.motorist(a)?.cause === 'carrefour' || b.api.motorist(c)?.cause === 'carrefour') waited = true;
    });
    expect(t).toBeGreaterThan(0);
    expect(together).toBe(0); // jamais tous les deux au milieu du carrefour
    expect(waited).toBe(true); // l'un des deux a cédé le passage
    expect(collisions).toBe(0);
    expect(minDist).toBeGreaterThan(5);
    console.log(`carrefour sans feux : les deux ont passé en ${t.toFixed(1)} s, distance minimale ${minDist.toFixed(1)} m`);
  }, 120000);
});

describe('circulation : trafic d\'ambiance', () => {
  it('cinq minutes de circulation autour du joueur : aucun accrochage, le trafic s\'écoule, apparitions à distance', async () => {
    const town = createTown({ signals: [4, 1, 7], sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    tuneTown(b);
    b.api.tuning.vehicleDensity = 2.2;
    const spawnDist: number[] = [];
    const kinds = new Set<string>();
    b.ctx.events.on('vehicle:spawned', (e) => {
      const v = b.ctx.vehicles.get(e.id);
      if (v) {
        spawnDist.push(Math.hypot(v.x - town.centerX, v.z - town.centerZ));
        kinds.add(v.kind);
      }
    });
    let crashes = 0;
    let hits = 0;
    b.ctx.events.on('vehicle:collision', (e) => {
      if (e.otherKind === 'vehicle') crashes++;
      else if (e.otherKind === 'person') hits++;
    });
    let hurt = 0;
    b.ctx.events.on('person:hurt', () => hurt++);
    let minCenter = Infinity;
    let worstStop = 0;
    let moving = 0;
    let samples = 0;
    let redRunners = 0;
    const cpu0 = process.cpuUsage();
    const lastDist = new Map<number, number>();
    // instant où chaque feu est passé au rouge, par carrefour et par axe (0 : nord-sud, 1 : est-ouest)
    const redSince = new Map<number, number>();
    for (let i = 0; i < 30 * 300; i++) {
      b.step(DT, DT);
      for (const j of [4, 1, 7]) {
        for (let axis = 0; axis < 2; axis++) {
          const key = j * 2 + axis;
          if (b.api.signal(j, axis * EAST) !== 'rouge') redSince.delete(key);
          else if (!redSince.has(key)) redSince.set(key, b.ctx.clock.now);
        }
      }
      // franchissement d'une ligne de feu : le feu de ce sens ne doit pas être au rouge depuis plus de 2,5 s
      // (un véhicule engagé à l'orange puis ralenti par celui qui le précède finit de passer au début du rouge)
      for (const br of b.sys.cars.list) {
        const v = br.v;
        for (const j of [4, 1, 7]) {
          const node = town.node(j);
          const rx = node.x - v.x;
          const rz = node.z - v.z;
          const d = Math.hypot(rx, rz);
          const key = v.id * 16 + j;
          const prev = lastDist.get(key);
          lastDist.set(key, d);
          const nose = FAR_STOP - v.def.length * 0.5;
          if (prev === undefined || !(prev > nose && d <= nose)) continue;
          const toward = (rx * Math.sin(v.heading) + rz * Math.cos(v.heading)) / d;
          if (toward <= 0.95 || v.speed <= 1 || b.api.signal(j, v.heading) !== 'rouge') continue;
          const since = redSince.get(j * 2 + (Math.abs(Math.sin(v.heading)) > 0.7 ? 1 : 0));
          if (since !== undefined && b.ctx.clock.now - since > 2.5) redRunners++;
        }
      }
      if (i % 15 !== 0) continue;
      const cars = b.sys.cars.list;
      for (let x = 0; x < cars.length; x++) {
        const vx = cars[x]!.v;
        worstStop = Math.max(worstStop, cars[x]!.stillT);
        samples++;
        if (Math.abs(vx.speed) > 1) moving++;
        for (let y = x + 1; y < cars.length; y++) {
          const vy = cars[y]!.v;
          minCenter = Math.min(minCenter, Math.hypot(vx.x - vy.x, vx.z - vy.z));
        }

      }
    }
    const cpu = process.cpuUsage(cpu0);
    const s = b.api.stats;
    console.log(`5 min d'ambiance : ${s.vehicles} véhicules (visé ${s.vehicleTarget}), ${s.pedestrians} piétons, ${s.spawned} apparitions, ${s.despawned} disparitions, accrochages ${crashes}, piétons heurtés ${hits}, feux rouges grillés ${redRunners}, distance minimale entre deux véhicules ${minCenter.toFixed(2)} m, plus long arrêt ${worstStop} s, en mouvement ${(100 * moving / samples).toFixed(0)} % du temps, ${((cpu.user + cpu.system) / 1000 / 9000).toFixed(3)} ms de processeur par pas (tous modules)`);
    expect(crashes).toBe(0);
    expect(hits).toBe(0);
    expect(hurt).toBe(0);
    expect(minCenter).toBeGreaterThan(2);
    expect(s.vehicleTarget).toBeGreaterThan(15);
    expect(s.vehicles).toBeGreaterThan(s.vehicleTarget * 0.7);
    expect(s.despawned).toBeGreaterThan(40); // le trafic traverse la zone et en sort
    expect(worstStop).toBeLessThan(160); // pas de nœud de circulation durable
    expect(moving / samples).toBeGreaterThan(0.5);
    expect(redRunners).toBe(0); // personne n'a franchi une ligne de feu au rouge
    // apparitions loin du joueur, types de véhicules variés
    const vehicleSpawns = spawnDist.filter((d) => d > 0);
    expect(Math.min(...vehicleSpawns)).toBeGreaterThan(b.api.tuning.spawnMin - 3);
    expect(kinds.size).toBeGreaterThan(3);
    for (const k of kinds) expect(['voiture', 'citadine', 'suv', 'taxi', 'utilitaire', 'scooter', 'bus']).toContain(k);
  }, 300000);

  it('densité : heure, réglage du nombre de PNJ, options de session ; remise à zéro entre deux sessions', async () => {
    const town = createTown({});
    const b = await createTrafficBench({ world: town, modules: [vehicles], session: { x: town.centerX, z: town.centerZ, timeOfDay: 18 }, ambient: true });
    tuneTown(b);
    b.api.tuning.vehicleDensity = 2;
    b.api.tuning.pedestrianDensity = 0;
    b.step(40);
    const evening = b.sys.cars.target();
    expect(evening).toBeGreaterThan(8);
    expect(b.api.stats.vehicles).toBeGreaterThan(evening * 0.6);
    b.ctx.env.setTime(3.5);
    const night = b.sys.cars.target();
    expect(night).toBeLessThan(evening * 0.25);
    b.ctx.env.setTime(18);
    b.ctx.settings.set('crowdScale', 0.5);
    expect(b.sys.cars.target()).toBeLessThanOrEqual(Math.ceil(evening * 0.5) + 1);
    b.ctx.settings.set('crowdScale', 1);
    // l'excédent s'efface (hors champ, ou en sortant de la zone)
    b.ctx.env.setTime(3.5);
    b.step(120);
    expect(b.api.stats.vehicles).toBeLessThan(evening * 0.6);
    // nouvelle session : tout est remis à zéro, et l'option « aucune vie civile » est respectée
    await b.t.start({ x: town.centerX, z: town.centerZ, timeOfDay: 18, extra: { traffic: { none: true } } });
    expect(b.sys.cars.list.length).toBe(0);
    expect(b.api.stats.spawned).toBe(0);
    expect(b.api.tuning.ambient).toBe(false);
    b.step(20);
    expect(b.ctx.vehicles.list.length).toBe(0);
    expect(b.ctx.people.list.length).toBe(0);
    // session suivante : la circulation revient, avec un multiplicateur de densité
    await b.t.start({ x: town.centerX, z: town.centerZ, timeOfDay: 18, extra: { traffic: { vehicles: 0, parked: 0, pedestrians: 0 } } });
    tuneTown(b);
    expect(b.api.tuning.ambient).toBe(true);
    b.step(10);
    expect(b.sys.cars.target()).toBe(0);
    expect(b.ctx.vehicles.list.length).toBe(0);
  }, 180000);

  it('sans module de véhicules : pas de trafic roulant, mais rien ne plante', async () => {
    const town = createTown({ width: 16 });
    const b = await createTrafficBench({ world: town, session: { x: town.centerX, z: town.centerZ }, ambient: true });
    tuneTown(b);
    b.step(10);
    expect(b.sys.cars.list.length).toBe(0);
    expect(b.api.spawnVehicle('voiture', -140, 122, EAST, 380, 120)).toBeNull();
    expect(b.api.stats.parked).toBeGreaterThan(10); // le stationnement, lui, ne dépend que du magasin du cœur
    expect(b.control.closeRoad(60, 120, 0)).not.toBeNull();
  }, 60000);
});

describe('circulation : stationnement', () => {
  async function wideTown(seed = 1): Promise<{ b: TrafficBench; town: Town }> {
    const town = createTown({ signals: [4], width: 16, sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles], seed, session: { x: town.centerX, z: town.centerZ }, ambient: true });
    tuneTown(b);
    b.api.tuning.vehicleDensity = 0;
    b.api.tuning.pedestrianDensity = 0;
    return { b, town };
  }

  it('des véhicules garés le long des trottoirs : sur la chaussée, à l\'écart des carrefours, endormis, déterministes', async () => {
    const { b, town } = await wideTown();
    b.step(1);
    const parked = b.sys.parking.list.map((p) => p.v);
    expect(parked.length).toBeGreaterThan(30);
    expect(parked.length).toBeLessThanOrEqual(b.sys.parking.cap());
    for (const v of parked) {
      expect(b.api.isParked(v)).toBe(true);
      expect(b.api.isTraffic(v)).toBe(true);
      expect(b.api.motorist(v)).toBeNull();
      expect(town.surfaceAt(v.x, v.z)).toBe('road');
      expect(v.engineOn).toBe(false);
      expect(v.locked).toBe(true);
      expect(v.brain).toBeNull();
      expect(v.seats.every((s) => s === 0)).toBe(true);
      expect(v.faction).toBe('civil');
      // le long du trottoir : entre 5,5 et 7,9 m de l'axe d'une chaussée de 16 m, parallèle à la rue
      const dx = Math.min(...[0, 120, 240].map((c) => Math.abs(v.x - c)));
      const dz = Math.min(...[0, 120, 240].map((c) => Math.abs(v.z - c)));
      const off = Math.min(dx, dz);
      expect(off).toBeGreaterThan(5.5);
      expect(off).toBeLessThan(7.9);
      const along = dx < dz ? Math.abs(Math.cos(v.heading)) : Math.abs(Math.sin(v.heading));
      expect(along).toBeGreaterThan(0.99);
      // pas de stationnement aux abords d'un carrefour
      for (let j = 0; j < 9; j++) expect(Math.hypot(v.x - town.node(j).x, v.z - town.node(j).z)).toBeGreaterThan(14);
    }
    // deux véhicules garés ne se chevauchent pas
    let minPair = Infinity;
    for (let i = 0; i < parked.length; i++) for (let j = i + 1; j < parked.length; j++) minPair = Math.min(minPair, Math.hypot(parked[i]!.x - parked[j]!.x, parked[i]!.z - parked[j]!.z));
    expect(minPair).toBeGreaterThan(4.5);
    // immobiles et sans coût : toujours à la même place une minute plus tard
    const before = parked.map((v) => `${v.kind}:${v.x.toFixed(2)},${v.z.toFixed(2)}`);
    b.step(30);
    expect(parked.map((v) => `${v.kind}:${v.x.toFixed(2)},${v.z.toFixed(2)}`)).toEqual(before);
    // même graine, mêmes rues : mêmes voitures aux mêmes places
    const again = await wideTown();
    again.b.step(1);
    expect(again.b.sys.parking.list.map((p) => `${p.v.kind}:${p.v.x.toFixed(2)},${p.v.z.toFixed(2)}`)).toEqual(before);
    // un véhicule déplacé (poussé, volé, retourné) n'appartient plus au module, mais reste dans le monde
    const moved = parked[0]!;
    moved.x += 1.2;
    b.step(2);
    expect(b.api.isParked(moved)).toBe(false);
    expect(b.ctx.vehicles.get(moved.id)).toBe(moved);
    console.log(`stationnement : ${parked.length} véhicules garés, deux voisins à ${minPair.toFixed(2)} m au plus près`);
  }, 120000);

  it('le stationnement ne gêne pas la circulation ; un automobiliste arrivé se gare et s\'en va à pied', async () => {
    const town = createTown({ width: 16, sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    tuneTown(b);
    b.api.tuning.vehicleDensity = 0;
    b.api.tuning.pedestrianDensity = 0;
    b.step(1);
    const parkedBefore = b.api.stats.parked;
    expect(parkedBefore).toBeGreaterThan(30);
    let collisions = 0;
    b.ctx.events.on('vehicle:collision', () => collisions++);
    // traversée de la ville entre deux rangées de voitures garées, sans y toucher
    const v = b.api.spawnVehicle('utilitaire', -140, 123.2, EAST, 300, 120)!;
    const brain = b.sys.cars.byVehicle.get(v.id)!;
    const t = runUntil(b, () => brain.mode === MODE_DONE, 120);
    expect(t).toBeGreaterThan(0);
    expect(collisions).toBe(0);
    expect(Math.abs(v.x - 300)).toBeLessThan(3);
    // arrivé : une place libre devant lui ? il s'y gare
    const gare: { vehicleId: number; state: string }[] = [];
    b.ctx.events.onAny('traffic:motorist', (e) => gare.push(e as { vehicleId: number; state: string }));
    const driverId = brain.driverId;
    brain.ambient = true;
    let offered = false;
    for (let i = 0; i < 4 && !offered; i++) offered = b.sys.parking.offer(brain);
    if (!offered) {
      console.log('stationnement : aucune place libre devant le véhicule dans ce tirage (manœuvre non vérifiée ici)');
      return;
    }
    const tPark = runUntil(b, () => gare.some((g) => g.state === 'gare' && g.vehicleId === v.id), 90);
    expect(tPark).toBeGreaterThan(0);
    expect(b.api.isParked(v)).toBe(true);
    expect(b.api.motorist(v)).toBeNull();
    expect(v.engineOn).toBe(false);
    expect(town.surfaceAt(v.x, v.z)).toBe('road');
    expect(Math.abs(v.z - 120)).toBeGreaterThan(5.5); // le long du trottoir
    const driver = b.ctx.people.get(driverId)!;
    expect(driver.vehicleId).toBe(0);
    expect(b.api.isPedestrian(driver)).toBe(true); // il s'en va à pied
    expect(b.api.stats.parked).toBe(parkedBefore + 1);
    console.log(`stationnement : garé en ${tPark.toFixed(0)} s à ${Math.abs(v.z - 120).toFixed(1)} m de l'axe`);
  }, 180000);
});
