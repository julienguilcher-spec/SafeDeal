// Collisions : décor (monde factice), objets (service de décor factice), véhicules, personnes.
import { describe, expect, it } from 'vitest';
import type { GameEvents, Vehicle } from '@/core/contracts';
import { getCore } from '@/core/context';
import { CLEARED_EVENT } from '@/sim/vehicles';
import { createFakeWorld, createRecordingProps, createVehicleBench } from '@/sim/vehicles/testkit';
import type { RecordingProps, VehicleBench } from '@/sim/vehicles/testkit';

const KMH = 1 / 3.6;
const DT = 1 / 30;

function reach(b: VehicleBench, v: Vehicle, speed: number): void {
  v.cmd.throttle = 1;
  let t = 0;
  while (v.speed < speed && t < 60) {
    b.step(DT);
    t += DT;
  }
}

function collisions(b: VehicleBench): GameEvents['vehicle:collision'][] {
  const list: GameEvents['vehicle:collision'][] = [];
  b.ctx.events.on('vehicle:collision', (e) => list.push({ ...e }));
  return list;
}

/** Mur en travers de la route à z = 100 (épaisseur 2 m, haut de 8 m). */
const WALL = { minX: -40, maxX: 40, minZ: 100, maxZ: 102, height: 8 };

describe('collisions contre le décor', () => {
  it('un choc frontal à 50 km/h arrête la voiture contre le mur et l\'abîme', async () => {
    const b = await createVehicleBench({ world: createFakeWorld({ boxes: [WALL] }) });
    const events = collisions(b);
    const v = b.spawn('voiture', 0, 40, 0);
    const driver = b.driver(v);
    reach(b, v, 50 * KMH);
    const speed = v.speed;
    let maxFront = -Infinity;
    let hitYet = false;
    for (let i = 0; i < 150; i++) {
      // 50 km/h tenus jusqu'au choc, puis pied levé
      hitYet = hitYet || events.length > 0;
      v.cmd.throttle = !hitYet && v.speed < 50 * KMH ? 1 : 0;
      v.cmd.brake = hitYet ? 1 : 0;
      b.step(DT);
      maxFront = Math.max(maxFront, v.z + v.def.length / 2);
    }
    expect(maxFront).toBeLessThan(100.05); // jamais dans le mur
    expect(v.z + v.def.length / 2).toBeGreaterThan(94); // arrêté devant lui, après un léger rebond
    expect(Math.abs(v.speed)).toBeLessThan(1);
    const hit = events.find((e) => e.otherKind === 'world');
    expect(hit).toBeDefined();
    expect(hit!.speed).toBeGreaterThan(speed * 0.8);
    expect(hit!.z).toBeGreaterThan(98);
    expect(v.health).toBeLessThan(60);
    expect(v.health).toBeGreaterThan(0);
    expect(v.state).toBe('damaged');
    expect(driver.health).toBeLessThan(100); // secoué à 50 km/h
    expect(driver.health).toBeGreaterThan(50);
  });

  it('les dégâts croissent avec la vitesse : rien à 5 km/h, épave à 90 km/h', async () => {
    const b = await createVehicleBench({ world: createFakeWorld({ boxes: [{ ...WALL, minZ: 300, maxZ: 302 }] }) });
    const states: GameEvents['vehicle:state'][] = [];
    b.ctx.events.on('vehicle:state', (e) => states.push({ ...e }));
    const slow = b.spawn('voiture', -10, 290, 0);
    const fast = b.spawn('voiture', 10, 60, 0);
    const dSlow = b.driver(slow);
    const dFast = b.driver(fast);
    for (let i = 0; i < 30 * 30; i++) {
      slow.cmd.throttle = slow.speed < 5 * KMH ? 0.3 : 0;
      fast.cmd.throttle = 1;
      b.step(DT);
    }
    expect(slow.health).toBeGreaterThan(99);
    expect(slow.state).toBe('ok');
    expect(dSlow.health).toBe(100);
    expect(fast.health).toBe(0);
    expect(fast.state).toBe('wrecked');
    expect(fast.engineOn).toBe(false);
    expect(states.some((s) => s.id === fast.id && s.state === 'wrecked')).toBe(true);
    expect(dFast.health).toBeLessThan(60);
    // l'épave est évacuée par son conducteur encore valide
    expect(dFast.vehicleId).toBe(0);
  });

  it('glisse le long d\'un mur abordé de biais au lieu de s\'y planter', async () => {
    // mur le long de la route, côté x = 6 ; approche à 20° environ
    const side = { minX: 6, maxX: 8, minZ: -50, maxZ: 400, height: 8 };
    const b = await createVehicleBench({ world: createFakeWorld({ boxes: [side] }) });
    const v = b.spawn('voiture', -12, 0, -0.35); // cap légèrement vers −x… (cap négatif = vers l'ouest)
    v.heading = -0.35 + 0.7; // vers +x : avant = (sin h, cos h)
    b.driver(v);
    reach(b, v, 40 * KMH);
    v.cmd.throttle = 0.3;
    let maxRight = -Infinity;
    for (let i = 0; i < 30 * 6; i++) {
      b.step(DT);
      maxRight = Math.max(maxRight, v.x + v.def.width / 2);
    }
    expect(maxRight).toBeLessThan(6.6); // l'emprise ne traverse pas le mur (les coins peuvent l'effleurer)
    expect(v.speed).toBeGreaterThan(5); // il continue de rouler
    expect(Math.abs(v.heading)).toBeLessThan(0.15); // remis dans l'axe du mur
    expect(v.z).toBeGreaterThan(60);
    expect(v.health).toBeGreaterThan(40); // tôle froissée, pas détruite
  });

  it('un blindé encaisse le même choc presque sans dommage', async () => {
    const b = await createVehicleBench({ world: createFakeWorld({ boxes: [WALL] }) });
    const car = b.spawn('voiture', -10, 20, 0);
    const tank = b.spawn('centaure', 10, 20, 0);
    b.driver(car);
    b.driver(tank, 'gendarme');
    for (let i = 0; i < 30 * 25; i++) {
      for (const v of [car, tank]) v.cmd.throttle = v.speed < 30 * KMH ? 1 : 0;
      b.step(DT);
    }
    expect(car.health).toBeLessThan(90);
    expect(tank.health).toBeGreaterThan(97);
    expect(100 - tank.health).toBeLessThan((100 - car.health) * 0.25);
  });

  it('ne traverse jamais un mur mince, même à pleine vitesse et au pas de temps maximal', async () => {
    const thin = { minX: -40, maxX: 40, minZ: 600, maxZ: 600.3, height: 3 };
    const b = await createVehicleBench({ world: createFakeWorld({ boxes: [thin] }) });
    const v = b.spawn('moto_bravm', 0, 0, 0);
    b.driver(v, 'bravm');
    v.cmd.throttle = 1;
    let maxZ = 0;
    for (let i = 0; i < 20 * 40; i++) {
      b.step(0.05, 0.05);
      maxZ = Math.max(maxZ, v.z);
    }
    expect(maxZ).toBeGreaterThan(590);
    expect(maxZ).toBeLessThan(600);
  });
});

describe('collisions contre les personnes', () => {
  it('heurte un piéton à 30 km/h : blessé par ctx.health.hurt de type « vehicle », événement, pas de déclaration pour un civil', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const events = collisions(b);
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const v = b.spawn('voiture', 0, 0, 0);
    const driver = b.driver(v, 'conducteur');
    const walker = b.person('passant', 0.2, 60);
    reach(b, v, 30 * KMH);
    v.cmd.throttle = 0.2;
    b.step(8);
    const hit = hurts.find((h) => h.id === walker.id);
    expect(hit).toBeDefined();
    expect(hit!.info.kind).toBe('vehicle');
    expect(hit!.info.sourceId).toBe(driver.id);
    expect(hit!.info.amount).toBeGreaterThan(30);
    expect(hit!.info.amount).toBeLessThan(90);
    expect(hit!.info.knockback).toBeGreaterThan(4); // projeté
    expect(hit!.info.dirZ!).toBeGreaterThan(0.7); // dans le sens de la marche…
    expect(hit!.info.dirX!).toBeGreaterThan(0.2); // … et du côté où il se trouvait (x = 0,2 : à gauche de l'axe)
    expect(hit!.info.means).toBeUndefined();
    expect(walker.health).toBeLessThan(70);
    expect(hurts.filter((h) => h.id === walker.id).length).toBe(1); // un choc, pas un par pas de simulation
    const ev = events.find((e) => e.otherKind === 'person');
    expect(ev).toBeDefined();
    expect(ev!.otherId).toBe(walker.id);
    expect(ev!.speed).toBeGreaterThan(6);
    expect(b.ctx.law.forceLog.length).toBe(0);
    // le piéton n'est plus sous la voiture
    const dx = walker.x - v.x;
    const dz = walker.z - v.z;
    expect(Math.abs(dx) > v.def.width / 2 || Math.abs(dz) > v.def.length / 2).toBe(true);
  });

  it('conducteur policier : le choc est déclaré comme emploi de la force « vehicule »', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('fourgon_crs', 0, 0, 0);
    const driver = b.driver(v, 'crs');
    const target = b.person('manifestant', 0, 50);
    reach(b, v, 25 * KMH);
    v.cmd.throttle = 0.2;
    b.step(8);
    const log = b.ctx.law.forceLog;
    expect(log.length).toBe(1);
    expect(log[0]!.means).toBe('vehicule');
    expect(log[0]!.byId).toBe(driver.id);
    expect(log[0]!.targetId).toBe(target.id);
    expect(target.health).toBeLessThan(80);
  });

  it('repousse la foule à très basse vitesse sans blesser personne, et s\'en trouve freiné', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const v = b.spawn('voiture', 0, 0, 0);
    b.driver(v, 'conducteur');
    const free = b.spawn('voiture', 30, 0, 0);
    b.driver(free, 'conducteur');
    const crowd = [];
    for (let i = 0; i < 6; i++) crowd.push(b.person('manifestant', -0.75 + i * 0.3, 4 + (i % 2) * 0.5));
    const z0 = crowd.map((p) => p.z);
    // au pas (≈ 5 km/h) : même conduite sur les deux voitures
    let top = 0;
    for (let i = 0; i < 30 * 10; i++) {
      for (const car of [v, free]) car.cmd.throttle = car.speed < 1.3 ? 0.7 : 0;
      b.step(DT);
      top = Math.max(top, v.speed, free.speed);
    }
    expect(top).toBeLessThan(1.9); // sous le seuil de choc
    expect(hurts.length).toBe(0);
    for (const p of crowd) expect(p.health).toBe(100);
    // les personnes ont été poussées devant le pare-chocs
    expect(crowd.filter((p, i) => p.z > z0[i]! + 0.5).length).toBeGreaterThanOrEqual(5);
    const front = v.z + v.def.length / 2;
    for (const p of crowd) {
      const inside = Math.abs(p.x - v.x) < v.def.width / 2 - 0.05 && p.z < front - 0.05 && p.z > v.z - v.def.length / 2;
      expect(inside).toBe(false);
    }
    // la foule retient la voiture : elle a moins avancé que sa jumelle sur chaussée libre
    expect(v.z).toBeLessThan(free.z * 0.85);
  });

  it('écrase une personne à terre : dégâts de type « crush »', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const v = b.spawn('fourgon_crs', 0, 0, 0);
    b.driver(v, 'conducteur');
    const lying = b.person('manifestant', 0, 12);
    lying.posture = 'down';
    for (let i = 0; i < 30 * 14; i++) {
      v.cmd.throttle = v.speed < 1.2 ? 0.2 : 0;
      b.step(DT);
    }
    const h = hurts.find((x) => x.id === lying.id);
    expect(h).toBeDefined();
    expect(h!.info.kind).toBe('crush');
    expect(lying.health).toBeLessThan(85);
  });

  it('n\'inflige rien à quelqu\'un qui vient buter contre un véhicule à l\'arrêt', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    b.spawn('voiture', 0, 0, 0);
    const runner = b.person('manifestant', 3, 0);
    for (let i = 0; i < 60; i++) {
      runner.x -= 0.1; // court vers la portière
      runner.vx = -3;
      b.step(DT);
    }
    expect(hurts.length).toBe(0);
    expect(runner.health).toBe(100);
  });
});

describe('collisions contre les objets du décor', () => {
  async function benchWithProps(): Promise<{ b: VehicleBench; props: RecordingProps }> {
    let props!: RecordingProps;
    const b = await createVehicleBench({
      world: createFakeWorld(),
      setup: (ctx) => {
        props = createRecordingProps(ctx.props);
        ctx.props = props;
      },
    });
    return { b, props };
  }

  it('renverse et projette le mobilier léger sans s\'arrêter', async () => {
    const { b, props } = await benchWithProps();
    const events = collisions(b);
    const v = b.spawn('voiture', 0, 0, 0);
    const driver = b.driver(v, 'conducteur');
    const bin = b.ctx.props.spawn('poubelle', 0.3, 40, 0);
    const chair = b.ctx.props.spawn('chaise', -0.4, 55, 0);
    reach(b, v, 30 * KMH);
    v.cmd.throttle = 0.3;
    // le service factice a remplacé ctx.props : on fait vivre ici le magasin du cœur (objets projetés)
    const store = getCore(b.ctx).stores.props;
    for (let i = 0; i < 30 * 6; i++) {
      b.step(DT);
      store.update(DT);
    }
    expect(v.z).toBeGreaterThan(70);
    expect(v.speed).toBeGreaterThan(5);
    for (const p of [bin, chair]) {
      expect(p.toppled).toBe(true);
      const pushes = props.calls.filter((c) => c.type === 'push' && c.propId === p.id);
      expect(pushes.length).toBeGreaterThan(0);
      expect(pushes[0]!.byId).toBe(driver.id);
      expect(pushes[0]!.dirZ).toBeGreaterThan(0.5); // vers l'avant
      expect(pushes[0]!.amount).toBeGreaterThan(5);
    }
    expect(bin.z).toBeGreaterThan(43); // projetée à plusieurs mètres
    expect(props.calls.some((c) => c.type === 'damage' && c.propId === bin.id && c.kind === 'vehicle')).toBe(true);
    expect(events.some((e) => e.otherKind === 'prop' && e.otherId === bin.id)).toBe(true);
    // deux objets heurtés à près de 40 km/h : pare-chocs marqué, rien de plus
    expect(v.health).toBeGreaterThan(90);
    expect(v.health).toBeLessThan(100);
    expect(v.state).toBe('ok');
  });

  it('une barricade arrête une voiture ordinaire', async () => {
    const { b } = await benchWithProps();
    const v = b.spawn('voiture', 0, 0, 0);
    b.driver(v, 'conducteur');
    const barricade = b.ctx.props.spawn('barricade', 0, 30, 0);
    for (let i = 0; i < 30 * 12; i++) {
      v.cmd.throttle = v.speed < 5 ? 0.6 : 0.2;
      b.step(DT);
    }
    expect(v.z + v.def.length / 2).toBeLessThan(30 - barricade.halfZ + 0.1);
    expect(barricade.blocksMove).toBe(true);
    expect(barricade.z).toBeCloseTo(30, 5);
    expect(v.health).toBeLessThan(100);
  });

  it('la lame du Centaure pousse la barricade, la disloque en quelques secondes et ouvre le passage', async () => {
    const { b, props } = await benchWithProps();
    const cleared: unknown[] = [];
    b.ctx.events.onAny(CLEARED_EVENT, (e) => cleared.push(e));
    const moved: GameEvents['prop:moved'][] = [];
    b.ctx.events.on('prop:moved', (e) => moved.push(e));
    const v = b.spawn('centaure', 0, 0, 0);
    const pilot = b.driver(v, 'gendarme');
    const barricade = b.ctx.props.spawn('barricade', 0, 20, 0);
    expect(barricade.blocksMove).toBe(true);
    let contactAt = -1;
    let clearedAt = -1;
    let t = 0;
    for (let i = 0; i < 30 * 30 && clearedAt < 0; i++) {
      // poussée à 5-8 km/h
      v.cmd.throttle = v.speed < 1.8 ? 0.7 : 0;
      b.step(DT);
      t += DT;
      if (contactAt < 0 && props.calls.some((c) => c.type === 'damage' && c.propId === barricade.id)) contactAt = t;
      if (!barricade.blocksMove) clearedAt = t;
    }
    expect(contactAt).toBeGreaterThan(0);
    expect(clearedAt).toBeGreaterThan(contactAt);
    const duration = clearedAt - contactAt;
    console.log(`barricade dégagée à la lame en ${duration.toFixed(1)} s, repoussée de ${(barricade.z - 20).toFixed(1)} m`);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(6); // dossier de réalisme : 2 à 4 s pour un obstacle léger
    expect(barricade.z).toBeGreaterThan(21.5); // repoussée devant la lame
    expect(barricade.state).toBe('broken');
    expect(barricade.toppled).toBe(true);
    const work = props.calls.filter((c) => c.type === 'damage' && c.propId === barricade.id);
    expect(work.every((c) => c.kind === 'crush' && c.byId === pilot.id)).toBe(true);
    expect(cleared.length).toBe(1);
    expect((cleared[0] as { vehicleId: number; propId: number }).propId).toBe(barricade.id);
    expect(moved.some((m) => m.id === barricade.id)).toBe(true);
    expect(v.health).toBe(100); // la lame est faite pour cela
    // passage ouvert : l'engin continue
    const z = v.z;
    for (let i = 0; i < 30 * 4; i++) {
      v.cmd.throttle = v.speed < 1.8 ? 0.7 : 0;
      b.step(DT);
    }
    expect(v.z).toBeGreaterThan(z + 4);
  });

  it('un candélabre arrête net une voiture ; un potelet cède sous un camion', async () => {
    const { b } = await benchWithProps();
    const car = b.spawn('voiture', 0, 0, 0);
    b.driver(car, 'conducteur');
    const lamp = b.ctx.props.spawn('candelabre', 0, 60, 0);
    const truck = b.spawn('camion', 40, 0, 0);
    b.driver(truck, 'conducteur');
    const post = b.ctx.props.spawn('potelet', 40, 80, 0);
    for (let i = 0; i < 30 * 25; i++) {
      for (const v of [car, truck]) v.cmd.throttle = v.speed < 40 * KMH ? 1 : 0.1;
      b.step(DT);
    }
    expect(lamp.state).not.toBe('broken');
    expect(car.z + car.def.length / 2).toBeLessThan(60);
    expect(car.health).toBeLessThan(70);
    expect(post.state).toBe('broken');
    expect(truck.z).toBeGreaterThan(100);
  });
});

describe('collisions entre véhicules', () => {
  it('une voiture qui en percute une autre à l\'arrêt la projette, et les deux sont abîmées', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const events = collisions(b);
    const a = b.spawn('voiture', 0, 0, 0);
    const parked = b.spawn('voiture', 0, 60, 0);
    b.driver(a, 'conducteur');
    reach(b, a, 40 * KMH);
    a.cmd.throttle = 0;
    const before = a.speed;
    let peak = 0;
    for (let i = 0; i < 30 * 6; i++) {
      b.step(DT);
      peak = Math.max(peak, parked.speed);
    }
    expect(parked.z).toBeGreaterThan(61); // repoussée
    expect(peak).toBeGreaterThan(before * 0.25); // elle a reçu une bonne part de l'élan
    expect(peak).toBeLessThan(before);
    expect(a.health).toBeLessThan(90);
    expect(parked.health).toBeLessThan(90);
    const ev = events.find((e) => e.otherKind === 'vehicle');
    expect(ev).toBeDefined();
    expect(ev!.speed).toBeGreaterThan(8);
    // plus aucun chevauchement
    expect(parked.z - a.z).toBeGreaterThan(a.def.length - 0.05);
    // frein de stationnement : elle finit par s'arrêter
    b.step(5);
    expect(Math.abs(parked.speed)).toBeLessThan(0.05);
  });

  it('un autocar balaie une citadine, pas l\'inverse', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const bus = b.spawn('car_crs', 0, 0, 0);
    const small = b.spawn('citadine', 0, 60, 0);
    b.driver(bus, 'crs');
    reach(b, bus, 30 * KMH);
    const v0 = bus.speed;
    for (let i = 0; i < 30 * 12 && small.health === 100; i++) {
      bus.cmd.throttle = bus.speed < 30 * KMH ? 1 : 0;
      b.step(DT);
    }
    bus.cmd.throttle = 0;
    b.step(0.3);
    expect(small.health).toBeLessThan(100);
    expect(bus.speed).toBeGreaterThan(v0 * 0.75);
    expect(100 - small.health).toBeGreaterThan((100 - bus.health) * 3);

    const car = b.spawn('citadine', 200, 0, 0);
    const big = b.spawn('car_crs', 200, 60, 0);
    b.driver(car, 'conducteur');
    reach(b, car, 30 * KMH);
    for (let i = 0; i < 30 * 10 && car.health === 100; i++) {
      car.cmd.throttle = car.speed < 30 * KMH ? 1 : 0;
      b.step(DT);
    }
    car.cmd.throttle = 0;
    b.step(2);
    expect(car.health).toBeLessThan(100);
    expect(big.z).toBeLessThan(60.6);
    expect(Math.abs(car.speed)).toBeLessThan(1.5);
  });

  it('le Centaure repousse une épave à la lame ; un autocar de 18 t dépasse ce qu\'elle peut déplacer', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const tank = b.spawn('centaure', 0, 0, 0);
    b.driver(tank, 'gendarme');
    const wreck = b.spawn('voiture', 0, 14, Math.PI / 2); // en travers
    b.ctx.vehicles.damage(wreck, { amount: 1000, kind: 'impact', sourceId: 0, x: 0, z: 14 });
    expect(wreck.state).toBe('wrecked');
    const h = wreck.health;
    for (let i = 0; i < 30 * 15; i++) {
      tank.cmd.throttle = tank.speed < 2 ? 0.8 : 0.1;
      b.step(DT);
    }
    expect(wreck.z).toBeGreaterThan(20); // poussée sur plusieurs mètres
    expect(tank.z).toBeGreaterThan(8);
    expect(tank.health).toBe(100);
    expect(wreck.health).toBe(h);

    const tank2 = b.spawn('centaure', 100, 0, 0);
    b.driver(tank2, 'gendarme');
    const coach = b.spawn('car_crs', 100, 16, Math.PI / 2);
    b.ctx.vehicles.damage(coach, { amount: 1000, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    for (let i = 0; i < 30 * 15; i++) {
      tank2.cmd.throttle = tank2.speed < 2 ? 0.8 : 0.1;
      b.step(DT);
    }
    expect(coach.z).toBeLessThan(17.5);

    // une voiture ordinaire ne déplace pas une épave de fourgon en poussant
    const car = b.spawn('voiture', 200, 0, 0);
    b.driver(car, 'conducteur');
    const van = b.spawn('fourgon_crs', 200, 9, Math.PI / 2);
    b.ctx.vehicles.damage(van, { amount: 1000, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    for (let i = 0; i < 30 * 10; i++) {
      car.cmd.throttle = car.speed < 1 ? 0.5 : 0;
      b.step(DT);
    }
    expect(van.z).toBeLessThan(10.5);
  });
});
