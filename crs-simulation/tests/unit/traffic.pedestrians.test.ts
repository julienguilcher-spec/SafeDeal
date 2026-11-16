// Circulation — piétons civils : trottoirs, traversées, attente aux feux, fuite devant le gaz et les détonations,
// refuge dans le métro, badauds devant un cortège, densité selon l'heure, la météo et la manifestation.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi, MetroStation } from '@/core/extensions';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { PedBrain } from '@/sim/traffic/ped-brain';
import { S_CROSS, S_FLEE, S_LEAVE, S_WAIT, S_WALK, S_WATCH } from '@/sim/traffic/ped-brain';
import { createGasHazards, createTown, createTrafficBench, runUntil } from '@/sim/traffic/testkit';
import type { GasHazards, TrafficBench, Town } from '@/sim/traffic/testkit';

const DT = 1 / 30;

function tuneTown(b: TrafficBench): void {
  const t = b.api.tuning;
  t.spawnMin = 130;
  t.spawnMax = 250;
  t.despawn = 256;
  t.pedSpawnMin = 10;
  t.pedSpawnMax = 200;
  t.pedDespawn = 240;
}

async function gasBench(town: Town, extra?: (ctx: GameContext) => void): Promise<{ b: TrafficBench; gas: GasHazards }> {
  let gas: GasHazards | null = null;
  const b = await createTrafficBench({
    world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ },
    setup: (ctx) => {
      gas = createGasHazards(ctx.hazards);
      ctx.hazards = gas;
      extra?.(ctx);
    },
  });
  return { b, gas: gas! };
}

/** Une quinzaine de passants sur le trottoir sud de la rue est-ouest du milieu, entre les deux premiers carrefours. */
function strollers(b: TrafficBench, n = 14): Person[] {
  const list: Person[] = [];
  for (let i = 0; i < n; i++) {
    const p = b.api.spawnPedestrian(i % 4 === 0 ? 'touriste' : 'passant', 24 + i * 5.2, 125 + (i % 3) * 0.7);
    expect(p).not.toBeNull();
    list.push(p!);
  }
  return list;
}

const brainOf = (p: Person): PedBrain => p.brain as PedBrain;

describe('circulation : piétons sur les trottoirs', () => {
  it('trois minutes de vie de quartier : ils marchent sur les trottoirs, traversent aux carrefours, attendent aux feux', async () => {
    const town = createTown({ signals: [4], buildings: true, sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [vehicles, people], session: { x: town.centerX, z: town.centerZ }, ambient: true });
    tuneTown(b);
    b.api.tuning.vehicleDensity = 1.5;
    b.api.tuning.parkedDensity = 0;
    b.api.tuning.pedestrianDensity = 2;
    let samples = 0;
    let onRoadWalking = 0;
    let onRoadCrossing = 0;
    let inBuilding = 0;
    let waiting = 0;
    let speedSum = 0;
    let speedN = 0;
    let hurt = 0;
    let badCross = 0;
    let lightCross = 0;
    b.ctx.events.on('person:hurt', () => hurt++);
    const kinds = new Set<string>();
    const wasWaiting = new Set<number>();
    const moved = new Map<number, { x: number; z: number }>();
    for (let i = 0; i < 30 * 180; i++) {
      b.step(DT, DT);
      for (const br of b.sys.peds.list) {
        // début d'une traversée au carrefour à feux : les véhicules de la rue traversée doivent avoir le rouge
        if (br.state === S_WAIT) wasWaiting.add(br.p.id);
        else if (br.state === S_CROSS && wasWaiting.has(br.p.id)) {
          wasWaiting.delete(br.p.id);
          if (br.crossNode === town.junction(1, 1) && br.waited < 24) {
            lightCross++;
            const ctrl = b.sys.signals.crossingCtrl(br.crossNode)!;
            if (b.sys.signals.redLeft(ctrl, br.crossDx, br.crossDz, b.ctx.clock.now) <= 0) badCross++;
          }
        } else wasWaiting.delete(br.p.id);
      }
      if (i % 10 !== 0) continue;
      for (const br of b.sys.peds.list) {
        const p = br.p;
        samples++;
        kinds.add(p.kind);
        if (!moved.has(p.id)) moved.set(p.id, { x: p.x, z: p.z });
        const s = town.surfaceAt(p.x, p.z);
        if (s === 'building') inBuilding++;
        if (s === 'road') {
          if (br.state === S_CROSS || br.state === S_WAIT) onRoadCrossing++;
          else onRoadWalking++;
        }
        if (br.state === S_WAIT) waiting++;
        if (br.state === S_WALK) {
          speedSum += Math.hypot(p.vx, p.vz);
          speedN++;
        }
      }
    }
    const st = b.api.stats;
    let travelled = 0;
    let n = 0;
    for (const br of b.sys.peds.list) {
      const m = moved.get(br.p.id);
      if (m) {
        travelled += Math.hypot(br.p.x - m.x, br.p.z - m.z);
        n++;
      }
    }
    console.log(`piétons : ${st.pedestrians} présents (visé ${st.pedestrianTarget}), ${(100 * onRoadWalking / samples).toFixed(2)} % du temps sur la chaussée hors traversée, ${(100 * onRoadCrossing / samples).toFixed(1)} % en traversée, ${(100 * waiting / samples).toFixed(1)} % en attente au bord du trottoir, vitesse de marche ${(speedSum / speedN).toFixed(2)} m/s, ${lightCross} traversées au carrefour à feux dont ${badCross} au mauvais moment, blessés ${hurt}`);
    expect(st.pedestrianTarget).toBeGreaterThan(30);
    expect(st.pedestrians).toBeGreaterThan(st.pedestrianTarget * 0.8);
    expect(onRoadWalking / samples).toBeLessThan(0.005); // sur les trottoirs
    expect(inBuilding).toBe(0);
    expect(onRoadCrossing).toBeGreaterThan(20); // ils traversent, aux carrefours
    expect(onRoadCrossing / samples).toBeLessThan(0.12);
    expect(waiting).toBeGreaterThan(0); // et attendent avant de traverser
    expect(speedSum / speedN).toBeGreaterThan(0.85);
    expect(speedSum / speedN).toBeLessThan(1.5);
    expect(travelled / n).toBeGreaterThan(15); // ils vont quelque part
    expect(lightCross).toBeGreaterThan(0);
    expect(badCross).toBe(0);
    expect(hurt).toBe(0);
    expect(kinds.has('passant')).toBe(true);
    for (const k of kinds) expect(['passant', 'touriste', 'commercant']).toContain(k);
    for (const br of b.sys.peds.list) {
      expect(b.api.isPedestrian(br.p)).toBe(true);
      expect(br.p.brain).toBe(br);
      expect(br.p.faction).toBe('civil');
    }
  }, 300000);

  it('densité : heure, météo, réglage du nombre de PNJ ; la vie civile s\'efface quand la manifestation occupe la rue', async () => {
    const town = createTown({ sidewalk: 4 });
    const b = await createTrafficBench({ world: town, modules: [people], session: { x: town.centerX, z: town.centerZ, timeOfDay: 13 }, ambient: true });
    tuneTown(b);
    b.api.tuning.vehicleDensity = 0;
    b.api.tuning.parkedDensity = 0;
    b.step(15);
    const noon = b.sys.peds.target();
    expect(noon).toBeGreaterThan(20);
    expect(b.api.stats.pedestrians).toBeGreaterThan(noon * 0.8);
    b.ctx.env.setTime(3);
    expect(b.sys.peds.target()).toBeLessThan(noon * 0.15);
    b.ctx.env.setTime(13);
    b.ctx.env.setWeather('averse', true);
    expect(b.sys.peds.target()).toBeLessThan(noon * 0.4);
    b.ctx.env.setWeather('clair', true);
    b.ctx.settings.set('crowdScale', 2);
    expect(b.sys.peds.target()).toBeGreaterThan(noon * 1.7);
    b.ctx.settings.set('crowdScale', 1);
    expect(b.sys.peds.target()).toBe(noon);
    // un cortège de 150 personnes arrive autour du joueur
    for (let i = 0; i < 150; i++) {
      b.ctx.people.spawn({ kind: 'manifestant', faction: 'protest', x: town.centerX - 30 + (i % 30) * 2, z: town.centerZ - 4 + Math.floor(i / 30) * 2 });
    }
    b.step(2);
    const during = b.sys.peds.target();
    expect(during).toBeLessThan(noon * 0.2);
    b.step(60);
    expect(b.api.stats.pedestrians).toBeLessThan(noon * 0.6); // les passants sont partis ou ne sont pas remplacés
    console.log(`densité piétonne : ${noon} à 13 h par temps clair, ${during} quand 150 manifestants occupent la rue, ${b.api.stats.pedestrians} encore présents une minute plus tard`);
  }, 120000);
});

describe('circulation : réactions des piétons', () => {
  it('ils fuient un nuage de gaz lacrymogène, en courant, puis se calment à distance', async () => {
    const town = createTown({ sidewalk: 4 });
    const { b, gas } = await gasBench(town);
    const list = strollers(b);
    b.step(4);
    for (const p of list) expect(brainOf(p).state).not.toBe(S_FLEE);
    gas.clouds.push({ x: 60, z: 124, radius: 26, level: 0.8 });
    const inside0 = list.filter((p) => Math.hypot(p.x - 60, p.z - 124) < 24).length;
    expect(inside0).toBeGreaterThanOrEqual(6);
    const fled = new Set<number>();
    let maxSpeed = 0;
    let maxFleeing = 0;
    const t = runUntil(b, () => list.every((p) => Math.hypot(p.x - 60, p.z - 124) > 28), 40, () => {
      for (const p of list) {
        if (brainOf(p).state === S_FLEE) fled.add(p.id);
        maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vz));
      }
      maxFleeing = Math.max(maxFleeing, b.api.stats.fleeing);
    });
    expect(t).toBeGreaterThan(0); // plus personne dans le nuage
    expect(t).toBeLessThan(25);
    expect(fled.size).toBeGreaterThanOrEqual(inside0); // tous ceux que le gaz a touchés ont fui
    expect(maxSpeed).toBeGreaterThan(3); // en courant
    expect(maxFleeing).toBeGreaterThanOrEqual(inside0 - 2);
    for (const p of list) if (fled.has(p.id)) expect(p.fear).toBeGreaterThan(0.3);
    // ceux qui étaient loin du nuage n'ont pas paniqué
    expect(fled.size).toBeLessThan(list.length);
    // le nuage se dissipe : ils se calment et reprennent leur promenade
    gas.clouds.length = 0;
    b.step(60);
    for (const p of list) {
      expect(brainOf(p).state).not.toBe(S_FLEE);
      expect(p.upper).not.toBe('cover_face');
    }
    expect(list.some((p) => brainOf(p).state === S_WALK)).toBe(true);
    console.log(`gaz : ${inside0} piétons dans le nuage, zone évacuée en ${t.toFixed(1)} s, pointe de vitesse ${maxSpeed.toFixed(1)} m/s, ${fled.size} en fuite sur ${list.length}`);
  }, 120000);

  it('ils fuient une détonation ; avec une bouche de métro ouverte à portée, ils s\'y réfugient', async () => {
    const town = createTown({ sidewalk: 4 });
    const { b } = await gasBench(town);
    const list = strollers(b);
    b.step(3);
    const before = list.map((p) => Math.hypot(p.x - 60, p.z - 120));
    b.ctx.events.emit('explosion', { kind: 'gm2l', x: 60, y: 0, z: 120, radius: 8, sourceId: 0 });
    b.step(12);
    let farther = 0;
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(list[i]!.x - 60, list[i]!.z - 120);
      if (before[i]! < 30) {
        expect(d).toBeGreaterThan(before[i]! + 12); // les proches se sont éloignés
        farther++;
      }
    }
    expect(farther).toBeGreaterThanOrEqual(6);

    // même scène avec une station de métro : les fuyards y descendent
    const station: MetroStation = { id: 1, name: 'Station du Test', x: 140, z: 126, entrances: [140, 126], open: true, filtered: false, inflow: 0, arrived: 0 };
    const metro: MetroApi = {
      stations: [station],
      get: (id) => (id === 1 ? station : undefined),
      nearest: (x, z, r) => (Math.hypot(x - station.x, z - station.z) <= r ? station : null),
      setOpen: (_id, open) => {
        station.open = open;
      },
      setFiltered: () => {},
    };
    const second = await gasBench(town, (ctx) => ctx.provide(EXT.metro, metro));
    const walkers = strollers(second.b);
    second.b.step(3);
    const gone: number[] = [];
    second.b.ctx.events.on('person:fled', (e) => gone.push(e.id));
    second.b.ctx.events.emit('explosion', { kind: 'gm2l', x: 20, y: 0, z: 120, radius: 8, sourceId: 0 });
    second.b.step(45);
    expect(gone.length).toBeGreaterThanOrEqual(3);
    for (const id of gone) {
      expect(walkers.some((p) => p.id === id)).toBe(true);
      expect(second.b.ctx.people.list.some((p) => p.id === id)).toBe(false); // descendu dans le métro
    }
    // station fermée : personne ne s'y réfugie
    station.open = false;
    const third = await gasBench(town, (ctx) => ctx.provide(EXT.metro, metro));
    strollers(third.b);
    third.b.step(3);
    const gone3: number[] = [];
    third.b.ctx.events.on('person:fled', (e) => gone3.push(e.id));
    third.b.ctx.events.emit('explosion', { kind: 'gm2l', x: 20, y: 0, z: 120, radius: 8, sourceId: 0 });
    third.b.step(45);
    expect(gone3.length).toBe(0);
    console.log(`détonation : ${farther} piétons proches se sont éloignés ; avec une station ouverte, ${gone.length} s'y sont réfugiés`);
  }, 180000);

  it('devant un cortège paisible ils se serrent contre les façades, regardent, certains filment ; si la tension monte ils s\'en vont', async () => {
    const town = createTown({ sidewalk: 4 });
    const { b } = await gasBench(town);
    const list = strollers(b);
    b.step(3);
    // un cortège sur la chaussée
    const march: Person[] = [];
    for (let i = 0; i < 24; i++) {
      march.push(b.ctx.people.spawn({ kind: 'manifestant', faction: 'protest', x: 30 + (i % 12) * 4.5, z: 118.5 + Math.floor(i / 12) * 2.5 }));
    }
    const watched = new Set<number>();
    const filmed = new Set<number>();
    const left = new Set<number>();
    runUntil(b, () => false, 40, () => {
      for (const p of list) {
        const br = brainOf(p);
        if (br.state === S_WATCH) watched.add(p.id);
        if (p.upper === 'film') filmed.add(p.id);
        if (br.state === S_LEAVE) left.add(p.id);
      }
    });
    expect(watched.size + left.size).toBeGreaterThanOrEqual(8); // ils ont réagi au cortège
    expect(watched.size).toBeGreaterThanOrEqual(2);
    expect(filmed.size).toBeGreaterThanOrEqual(1);
    for (const p of list) if (watched.has(p.id)) expect(brainOf(p).jitter).toBeGreaterThanOrEqual(0.85); // côté façades
    // la colère gagne le cortège : plus personne ne reste à regarder
    for (const p of march) p.anger = 0.9;
    b.step(12);
    for (const p of list) {
      if (b.ctx.people.list.indexOf(p) < 0) continue;
      const near = march.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 20);
      if (near) expect([S_FLEE, S_CROSS]).toContain(brainOf(p).state);
      expect(p.upper).not.toBe('film');
    }
    console.log(`cortège : ${watched.size} badauds, dont ${filmed.size} qui filment ; ${left.size} sont partis d'eux-mêmes`);
  }, 120000);
});
