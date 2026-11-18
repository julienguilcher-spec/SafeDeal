// Conduite : accélération, freinage, braquage, dérapage, adhérence, pente, boîte, stabilité selon le pas de temps.
import { describe, expect, it } from 'vitest';
import type { Vehicle, VehicleKind } from '@/core/contracts';
import { VEHICLE_KINDS } from '@/sim/vehicles';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { VehicleBench } from '@/sim/vehicles/testkit';

const KMH = 1 / 3.6;
const DT = 1 / 30;

/** Accélère à fond jusqu'à la vitesse demandée ; retourne le temps mis (s). */
function accelerateTo(b: VehicleBench, v: Vehicle, speed: number, limit = 90): number {
  v.cmd.throttle = 1;
  v.cmd.brake = 0;
  let t = 0;
  while (v.speed < speed && t < limit) {
    b.step(DT);
    t += DT;
  }
  return t;
}

/** Freine à fond jusqu'à l'arrêt ; retourne la distance parcourue (m). */
function brakeToStop(b: VehicleBench, v: Vehicle): number {
  const x0 = v.x;
  const z0 = v.z;
  v.cmd.throttle = 0;
  v.cmd.brake = 1;
  let t = 0;
  while (Math.hypot(v.vx, v.vz) > 0.02 && t < 40) {
    b.step(DT);
    t += DT;
  }
  v.cmd.brake = 0;
  return Math.hypot(v.x - x0, v.z - z0);
}

/** Fourchettes plausibles : temps de 0 à 50 km/h (s) et distance d'arrêt depuis 50 km/h (m), sur bitume sec. */
const EXPECTED: Record<string, { accel: [number, number]; brake: [number, number] }> = {
  fourgon_crs: { accel: [6, 9], brake: [10, 16] },
  car_crs: { accel: [12, 20], brake: [12, 20] },
  vl_commandement: { accel: [6, 9.5], brake: [10, 16] },
  voiture_police: { accel: [3.5, 6], brake: [9, 14] },
  voiture_bac: { accel: [3, 5.5], brake: [9, 14] },
  fourgon_cellulaire: { accel: [6.5, 10], brake: [10, 16] },
  centaure: { accel: [9, 15], brake: [12, 20] },
  canon_eau: { accel: [14, 24], brake: [13, 22] },
  moto_bravm: { accel: [2, 4], brake: [9, 14] },
  camion_pompiers: { accel: [8, 14], brake: [11, 18] },
  ambulance: { accel: [5, 8.5], brake: [10, 16] },
  voiture: { accel: [4, 6.5], brake: [9, 14] },
  citadine: { accel: [4.5, 7], brake: [9, 14] },
  suv: { accel: [4, 6.5], brake: [9, 14.5] },
  taxi: { accel: [4, 6.5], brake: [9, 14] },
  utilitaire: { accel: [5, 8.5], brake: [10, 16] },
  camion: { accel: [11, 19], brake: [12, 20] },
  bus: { accel: [11, 18], brake: [12, 20] },
  scooter: { accel: [3.5, 6.5], brake: [10, 16] },
  camion_sono: { accel: [9, 15], brake: [11, 18] },
};

// (le vélo n'atteint pas 50 km/h : il a son propre essai)
const GROUND: VehicleKind[] = VEHICLE_KINDS.filter((k) => k !== 'drone' && k !== 'helicoptere' && k !== 'velo');

describe('conduite : accélération et freinage', () => {
  it('donne un 0 → 50 km/h et une distance de freinage plausibles pour chaque type', async () => {
    const b = await createVehicleBench({ world: createFakeWorld({ surface: 'road' }) });
    const lines: string[] = [];
    GROUND.forEach((kind, i) => {
      const v = b.spawn(kind, i * 200, 0, 0);
      b.driver(v);
      const t50 = accelerateTo(b, v, 50 * KMH);
      const from = v.speed;
      const dist = brakeToStop(b, v);
      const e = EXPECTED[kind]!;
      lines.push(`${kind.padEnd(19)} 0-50 km/h : ${t50.toFixed(1)} s ; arrêt depuis ${(from / KMH).toFixed(0)} km/h : ${dist.toFixed(1)} m`);
      expect(t50, `${kind} : 0 → 50 km/h`).toBeGreaterThan(e.accel[0]);
      expect(t50, `${kind} : 0 → 50 km/h`).toBeLessThan(e.accel[1]);
      expect(dist, `${kind} : freinage`).toBeGreaterThan(e.brake[0]);
      expect(dist, `${kind} : freinage`).toBeLessThan(e.brake[1]);
      // ligne droite : aucune dérive latérale, aucun lacet parasite
      expect(Math.abs(v.x - i * 200)).toBeLessThan(0.01);
      expect(v.heading).toBeCloseTo(0, 6);
    });
    console.log(lines.join('\n'));
  });

  it('un vélo atteint 20 km/h en quelques secondes et s\'arrête en quelques mètres', async () => {
    const b = await createVehicleBench({ world: createFakeWorld({ surface: 'road' }) });
    const v = b.spawn('velo', 0, 0, 0);
    b.driver(v);
    const t20 = accelerateTo(b, v, 20 * KMH);
    const dist = brakeToStop(b, v);
    console.log(`vélo : 0-20 km/h en ${t20.toFixed(1)} s, arrêt en ${dist.toFixed(1)} m`);
    expect(t20).toBeGreaterThan(3);
    expect(t20).toBeLessThan(9);
    expect(dist).toBeGreaterThan(2.5);
    expect(dist).toBeLessThan(7);
    expect(Math.abs(v.x)).toBeLessThan(0.01);
  });

  it('une voiture va plus vite qu\'un blindé, qui va plus vite qu\'un engin lanceur d\'eau', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const times = (['voiture', 'centaure', 'canon_eau'] as const).map((kind, i) => {
      const v = b.spawn(kind, i * 100, 0, 0);
      b.driver(v);
      return accelerateTo(b, v, 50 * KMH);
    });
    expect(times[0]!).toBeLessThan(times[1]!);
    expect(times[1]!).toBeLessThan(times[2]!);
  });

  it('respecte la vitesse maximale du type et la vitesse de marche arrière', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const car = b.spawn('voiture', 0, 0, 0);
    const van = b.spawn('fourgon_crs', 50, 0, 0);
    b.driver(car);
    b.driver(van);
    car.cmd.throttle = 1;
    van.cmd.throttle = 1;
    b.step(120);
    expect(car.speed).toBeLessThanOrEqual(car.def.maxSpeed + 0.01);
    expect(car.speed).toBeGreaterThan(car.def.maxSpeed * 0.96);
    expect(van.speed).toBeLessThanOrEqual(van.def.maxSpeed + 0.01);
    expect(van.speed).toBeGreaterThan(van.def.maxSpeed * 0.95);
    // marche arrière depuis l'arrêt
    const rev = b.spawn('voiture', 100, 0, 0);
    b.driver(rev);
    rev.cmd.throttle = -1;
    b.step(15);
    expect(rev.speed).toBeLessThan(0);
    expect(-rev.speed).toBeLessThanOrEqual(rev.def.maxReverse + 0.01);
    expect(-rev.speed).toBeGreaterThan(rev.def.maxReverse * 0.9);
    expect(rev.gear).toBe(-1);
    expect(rev.z).toBeLessThan(-20);
  });

  it('« reculer » en roulant freine d\'abord, puis engage la marche arrière', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('voiture');
    b.driver(v);
    accelerateTo(b, v, 10);
    v.cmd.throttle = -1;
    b.step(0.3);
    expect(v.braking).toBe(true);
    expect(v.speed).toBeGreaterThan(0);
    expect(v.speed).toBeLessThan(10);
    b.step(6);
    expect(v.speed).toBeLessThan(-1);
  });

  it('frein moteur : pied levé, le véhicule ralentit seul, moins fort qu\'au frein', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('fourgon_crs');
    b.driver(v);
    accelerateTo(b, v, 15);
    v.cmd.throttle = 0;
    const v0 = v.speed;
    b.step(2);
    const coast = (v0 - v.speed) / 2;
    expect(coast).toBeGreaterThan(0.4);
    expect(coast).toBeLessThan(2);
    expect(v.braking).toBe(false);
  });

  it('un passager de plus ralentit nettement une moto', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const solo = b.spawn('moto_bravm', 0, 0, 0);
    const duo = b.spawn('moto_bravm', 30, 0, 0);
    b.driver(solo, 'bravm');
    b.driver(duo, 'bravm');
    const passenger = b.person('bravm', 30, 0);
    expect(b.ctx.vehicles.enter(passenger, duo, 'passenger')).toBe(true);
    const t1 = accelerateTo(b, solo, 50 * KMH);
    const t2 = accelerateTo(b, duo, 50 * KMH);
    expect(t2).toBeGreaterThan(t1 * 1.1);
  });
});

describe('conduite : direction et adhérence', () => {
  it('tourne au rayon de braquage du type à basse vitesse', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    GROUND.forEach((kind, i) => {
      const v = b.spawn(kind, i * 200, 0, 0);
      b.driver(v);
      v.cmd.steer = 1;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let s = 0; s < 30 * 45; s++) {
        v.cmd.throttle = v.speed < 2 ? 0.4 : 0;
        b.step(DT);
        if (s > 150) {
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minZ = Math.min(minZ, v.z);
          maxZ = Math.max(maxZ, v.z);
        }
      }
      const radius = (maxX - minX + (maxZ - minZ)) / 4;
      // rayon cinématique du centre de la caisse : essieu arrière à L / tan(braquage)
      const rear = v.def.wheelbase / Math.tan(v.def.maxSteer);
      const kin = Math.hypot(rear, v.def.wheelbase * 0.5);
      expect(radius, `${kind} : rayon de braquage`).toBeGreaterThan(kin * 0.92);
      expect(radius, `${kind} : rayon de braquage`).toBeLessThan(kin * 1.2);
      // volant à droite : le cap diminue (lacet négatif)
      expect(v.yawRate).toBeLessThan(0);
      expect(v.steerAngle).toBeGreaterThan(0);
    });
    // ordres de grandeur réels : ≈ 4 à 5 m pour une voiture, 8 à 9 m pour un autocar
    const car = b.ctx.vehicles.def('voiture')!;
    expect(car.wheelbase / Math.tan(car.maxSteer)).toBeGreaterThan(3.5);
    expect(car.wheelbase / Math.tan(car.maxSteer)).toBeLessThan(5);
  });

  it('sous-vire quand on braque à fond trop vite : la trajectoire s\'élargit, sans tête-à-queue', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('voiture');
    b.driver(v);
    accelerateTo(b, v, 70 * KMH);
    v.cmd.throttle = 0.35;
    v.cmd.steer = 1;
    b.step(1.2);
    const dyn = b.ext.dynamics(v);
    const lateral = Math.abs(v.speed * v.yawRate);
    // l'accélération latérale plafonne à l'adhérence (0,9 g sur bitume sec)…
    expect(lateral).toBeGreaterThan(5);
    expect(lateral).toBeLessThan(0.9 * 9.81 * 1.08);
    // … donc le rayon réel est bien plus grand que celui que donnerait le braquage des roues
    const actualRadius = Math.abs(v.speed / v.yawRate);
    const wheelRadius = v.def.wheelbase / Math.tan(Math.abs(v.steerAngle));
    expect(actualRadius).toBeGreaterThan(wheelRadius * 1.8);
    expect(dyn.skid).toBeGreaterThan(0.2);
    // l'arrière tient : dérive modérée
    expect(Math.abs(dyn.slipAngle)).toBeLessThan(0.2);
  });

  it('dérape au frein à main : l\'arrière décroche et la voiture se met en travers', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const run = async (handbrake: boolean): Promise<{ slip: number; turned: number }> => {
      const v = b.spawn('voiture', handbrake ? 0 : 300, 0, 0);
      b.driver(v);
      accelerateTo(b, v, 60 * KMH);
      v.cmd.throttle = 0;
      v.cmd.steer = 1;
      v.cmd.handbrake = handbrake;
      const h0 = v.heading;
      let slip = 0;
      for (let i = 0; i < 36; i++) {
        b.step(DT);
        slip = Math.max(slip, Math.abs(b.ext.dynamics(v).slipAngle));
      }
      return { slip, turned: Math.abs(v.heading - h0) };
    };
    const normal = await run(false);
    const drift = await run(true);
    expect(normal.slip).toBeLessThan(0.3);
    expect(drift.slip).toBeGreaterThan(0.5); // plus de 30° de dérive
    expect(drift.slip).toBeGreaterThan(normal.slip * 3);
    expect(drift.turned).toBeGreaterThan(normal.turned * 1.3);
  });

  it('glisse sur les pavés mouillés : on freine bien plus long et on démarre moins fort', async () => {
    const world = createFakeWorld({ surface: (x) => (x > 50 ? 'sett' : 'road') });
    const b = await createVehicleBench({ world });
    const dry = b.spawn('voiture', 0, 0, 0);
    b.driver(dry);
    const tDry = accelerateTo(b, dry, 50 * KMH);
    const dDry = brakeToStop(b, dry);

    const drySett = b.spawn('voiture', 100, 0, 0);
    b.driver(drySett);
    accelerateTo(b, drySett, 50 * KMH);
    const dDrySett = brakeToStop(b, drySett);

    b.ctx.env.setWeather('averse', true);
    expect(b.ctx.env.state.wetness).toBeGreaterThan(0.9);
    const wet = b.spawn('voiture', 200, 0, 0);
    b.driver(wet);
    const tWet = accelerateTo(b, wet, 50 * KMH);
    const grip = b.ext.dynamics(wet).grip;
    const dWet = brakeToStop(b, wet);
    console.log(`freinage depuis 50 km/h — bitume sec ${dDry.toFixed(1)} m, pavés secs ${dDrySett.toFixed(1)} m, pavés mouillés ${dWet.toFixed(1)} m`);
    expect(grip).toBeLessThan(0.45);
    expect(dDrySett).toBeGreaterThan(dDry * 1.05);
    expect(dWet).toBeGreaterThan(dDry * 1.8);
    expect(dWet).toBeLessThan(dDry * 3.5);
    expect(tWet).toBeGreaterThan(tDry * 1.15);

    // en virage, la même vitesse ne passe plus : accélération latérale plafonnée plus bas
    wet.cmd.brake = 0;
    accelerateTo(b, wet, 50 * KMH);
    wet.cmd.throttle = 0.2;
    wet.cmd.steer = 1;
    b.step(1.2);
    expect(Math.abs(wet.speed * wet.yawRate)).toBeLessThan(0.45 * 9.81);
  });

  it('une moto penche dans le virage, une voiture verse vers l\'extérieur', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const moto = b.spawn('moto_bravm', 0, 0, 0);
    const car = b.spawn('voiture', 200, 0, 0);
    b.driver(moto, 'bravm');
    b.driver(car);
    // les deux véhicules sont amenés ensemble à 10 m/s
    for (let i = 0; i < 30 * 12; i++) {
      for (const v of [moto, car]) v.cmd.throttle = v.speed < 10 ? 1 : 0;
      b.step(DT);
    }
    expect(moto.speed).toBeGreaterThan(9);
    expect(car.speed).toBeGreaterThan(9);
    for (const v of [moto, car]) {
      v.cmd.throttle = 0.15;
      v.cmd.steer = -0.3; // à gauche
    }
    b.step(2.5);
    expect(moto.yawRate).toBeGreaterThan(0.1); // tourne à gauche : cap croissant
    // moto : roulis négatif (penche à gauche, dans le virage), égal à atan(v·ω / g) en virage établi
    const lean = Math.atan((moto.speed * moto.yawRate) / 9.81);
    expect(lean).toBeGreaterThan(0.15);
    expect(moto.roll).toBeLessThan(-0.15);
    expect(Math.abs(moto.roll + lean)).toBeLessThan(0.06);
    expect(Math.abs(moto.roll)).toBeLessThan(0.8); // jamais plus que l'adhérence ne le permet
    // voiture : roulis positif (verse à droite, vers l'extérieur), quelques degrés
    expect(car.roll).toBeGreaterThan(0.005);
    expect(car.roll).toBeLessThan(0.1);
  });

  it('transfert de charge : la caisse se cabre à l\'accélération et plonge au freinage', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('fourgon_crs');
    b.driver(v);
    v.cmd.throttle = 1;
    b.step(1.5);
    expect(v.pitch).toBeGreaterThan(0.005);
    expect(b.ext.dynamics(v).accelLong).toBeGreaterThan(1);
    accelerateTo(b, v, 15);
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    b.step(0.8);
    expect(v.pitch).toBeLessThan(-0.01);
    expect(b.ext.dynamics(v).accelLong).toBeLessThan(-4);
    expect(v.braking).toBe(true);
  });
});

describe('conduite : relief, boîte, robustesse', () => {
  it('suit la pente du terrain (assiette, altitude) ; en côte on accélère moins, à l\'arrêt on tient au frein', async () => {
    // pente de 8 % vers +z
    const world = createFakeWorld({ height: (_x, z) => z * 0.08 });
    const b = await createVehicleBench({ world });
    const up = b.spawn('fourgon_crs', 0, 0, 0);
    b.driver(up);
    const tUp = accelerateTo(b, up, 30 * KMH);
    expect(up.pitch).toBeGreaterThan(0.05); // nez relevé en montée
    expect(up.y).toBeCloseTo(up.z * 0.08, 1);
    expect(up.vy).toBeGreaterThan(0.3);
    const down = b.spawn('fourgon_crs', 40, 0, Math.PI);
    b.driver(down);
    const tDown = accelerateTo(b, down, 30 * KMH);
    expect(down.pitch).toBeLessThan(-0.05);
    expect(tUp).toBeGreaterThan(tDown * 1.3);

    // garé sans conducteur dans la pente : il ne bouge pas
    const parked = b.spawn('voiture', 80, 10, 0);
    b.step(5);
    expect(parked.z).toBeCloseTo(10, 3);
    expect(b.ext.dynamics(parked).asleep).toBe(true);
    // conducteur à bord, sans frein : il recule dans la pente
    const rolling = b.spawn('voiture', 120, 10, 0);
    b.driver(rolling);
    b.step(4);
    expect(rolling.z).toBeLessThan(9.5);
    expect(rolling.speed).toBeLessThan(-0.3);
    // au frein, il s'arrête et tient
    rolling.cmd.brake = 1;
    b.step(3);
    const z = rolling.z;
    b.step(3);
    expect(rolling.z).toBeCloseTo(z, 3);
  });

  it('boîte automatique : les rapports montent avec la vitesse, le régime reste entre ralenti et régime maxi', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('voiture');
    expect(v.gear).toBe(0);
    expect(v.rpm).toBe(0);
    expect(v.engineOn).toBe(false);
    b.driver(v); // le conducteur met le contact
    expect(v.engineOn).toBe(true);
    b.step(1);
    expect(v.rpm).toBeGreaterThan(700);
    expect(v.rpm).toBeLessThan(1000);
    const spec = b.ext.spec('voiture');
    v.cmd.throttle = 1;
    let maxGear = 0;
    let maxRpm = 0;
    let shifts = 0;
    let last = v.gear;
    for (let i = 0; i < 30 * 40; i++) {
      b.step(DT);
      if (v.gear !== last) shifts++;
      last = v.gear;
      maxGear = Math.max(maxGear, v.gear);
      maxRpm = Math.max(maxRpm, v.rpm);
      expect(v.rpm).toBeGreaterThanOrEqual(spec.engine.idle * 0.9);
      expect(v.rpm).toBeLessThanOrEqual(spec.engine.redline + 1);
    }
    expect(maxGear).toBe(spec.engine.gears);
    expect(shifts).toBe(spec.engine.gears - 1); // montée franche, sans pompage
    expect(maxRpm).toBeGreaterThan(spec.engine.redline * 0.75);
    // à l'arrêt, retour en première puis moteur coupé à la descente du conducteur
    brakeToStop(b, v);
    b.step(6);
    expect(v.gear).toBe(1);
    b.ctx.vehicles.exit(b.ext.driverOf(v)!);
    b.step(2);
    expect(v.engineOn).toBe(false);
    expect(v.gear).toBe(0);
    expect(v.rpm).toBeLessThan(50);
  });

  it('donne la même trajectoire quel que soit le pas de temps', async () => {
    const results: { x: number; z: number; h: number; speed: number }[] = [];
    for (const dt of [1 / 20, 1 / 30, 1 / 60, 1 / 120]) {
      const b = await createVehicleBench({ world: createFakeWorld() });
      const v = b.spawn('voiture_police');
      b.driver(v);
      // départ, slalom, freinage : 14 s de conduite scriptée
      const steps = Math.round(14 / dt);
      for (let i = 0; i < steps; i++) {
        const t = i * dt;
        v.cmd.throttle = t < 6 ? 1 : t < 10 ? 0.4 : 0;
        v.cmd.steer = t > 3 && t < 10 ? 0.35 * Math.sin((t - 3) * 1.4) : 0;
        v.cmd.brake = t > 11 ? 0.6 : 0;
        b.step(dt, dt);
      }
      expect(Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.heading)).toBe(true);
      results.push({ x: v.x, z: v.z, h: v.heading, speed: v.speed });
    }
    const ref = results[3]!;
    const travelled = Math.hypot(ref.x, ref.z);
    expect(travelled).toBeGreaterThan(80);
    for (const r of results) {
      expect(Math.hypot(r.x - ref.x, r.z - ref.z), 'écart de position').toBeLessThan(travelled * 0.03);
      expect(Math.abs(r.h - ref.h), 'écart de cap').toBeLessThan(0.06);
      expect(Math.abs(r.speed - ref.speed)).toBeLessThan(0.5);
    }
  });

  it('reste stable dans les cas extrêmes : commandes brutales, pas maximal, valeurs invalides', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const kinds: VehicleKind[] = ['voiture', 'moto_bravm', 'bus', 'centaure', 'scooter'];
    const list = kinds.map((kind, i) => {
      const v = b.spawn(kind, i * 300, 0, 0);
      b.driver(v);
      return v;
    });
    const rng = b.ctx.rng.fork('essai');
    for (let i = 0; i < 20 * 60; i++) {
      for (const v of list) {
        if (i % 10 === 0) {
          v.cmd.throttle = rng.range(-1, 1);
          v.cmd.steer = rng.chance(0.5) ? (rng.chance(0.5) ? 1 : -1) : 0;
          v.cmd.brake = rng.chance(0.2) ? 1 : 0;
          v.cmd.handbrake = rng.chance(0.15);
        }
      }
      b.step(0.05, 0.05);
    }
    for (const v of list) {
      expect(Number.isFinite(v.x + v.z + v.heading + v.speed + v.yawRate + v.rpm), v.kind).toBe(true);
      expect(Math.abs(v.speed), v.kind).toBeLessThanOrEqual(v.def.maxSpeed + 0.5);
      expect(Math.abs(v.yawRate), v.kind).toBeLessThan(6);
      expect(Math.abs(v.steerAngle), v.kind).toBeLessThanOrEqual(v.def.maxSteer + 1e-9);
      expect(v.heading).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
      expect(v.heading).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    // commandes invalides : ignorées
    const v = list[0]!;
    v.cmd.throttle = Number.NaN;
    v.cmd.steer = Number.NaN;
    v.cmd.brake = Number.NaN;
    b.step(1);
    expect(Number.isFinite(v.x + v.z + v.heading + v.speed)).toBe(true);
  });

  it('un véhicule sans conducteur ni pilote ne répond pas aux commandes ; un module qui pose `brain` le pilote', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('voiture');
    v.cmd.throttle = 1;
    b.step(3);
    expect(v.z).toBe(0);
    expect(v.braking).toBe(true); // frein de stationnement
    v.engineOn = true;
    v.brain = { module: 'trafic' };
    b.step(3);
    expect(v.z).toBeGreaterThan(5);
  });

  it('endort les véhicules à l\'arrêt et les réveille à la première commande', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const v = b.spawn('voiture');
    b.driver(v);
    b.step(1);
    expect(b.ext.dynamics(v).asleep).toBe(true);
    v.cmd.throttle = 0.5;
    b.step(0.5);
    expect(b.ext.dynamics(v).asleep).toBe(false);
    expect(v.speed).toBeGreaterThan(0.3);
    // braquer à l'arrêt tourne les roues sans déplacer le véhicule
    const p = b.spawn('voiture', 50, 0, 0);
    b.driver(p);
    b.step(1);
    p.cmd.steer = -1;
    b.step(1);
    expect(p.steerAngle).toBeCloseTo(-p.def.maxSteer, 5);
    expect(p.x).toBe(50);
  });
});
