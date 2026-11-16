// Engins volants : drone (déploiement, commandes, plafond, bâti, batterie, rappel) et hélicoptère en orbite.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vec2, Vehicle } from '@/core/contracts';
import { DRONE_EVENT, DRONE_TOGGLE_EVENT, PLAYER_CONTROL_SERVICE } from '@/sim/vehicles';
import type { DroneEvent } from '@/sim/vehicles';
import { createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { VehicleBench } from '@/sim/vehicles/testkit';

const DT = 1 / 30;

/** Déploie le drone d'un télépilote par l'événement libre, comme le fait la télécommande. */
function toggle(b: VehicleBench, pilot: Person): void {
  b.ctx.events.emitAny(DRONE_TOGGLE_EVENT, { personId: pilot.id });
}

function droneEvents(b: VehicleBench): DroneEvent[] {
  const list: DroneEvent[] = [];
  b.ctx.events.onAny(DRONE_EVENT, (e) => list.push({ ...(e as DroneEvent) }));
  return list;
}

/** Drone déployé et en vol stationnaire à son altitude de croisière. */
async function hovering(world = createFakeWorld()): Promise<{ b: VehicleBench; pilot: Person; drone: Vehicle }> {
  const b = await createVehicleBench({ world });
  const pilot = b.person('telepilote', 0, 0);
  toggle(b, pilot);
  const drone = b.ext.droneOf(pilot.id)!;
  expect(drone).toBeTruthy();
  b.step(12);
  expect(b.ext.flightStatus(drone)!.mode).toBe('manuel');
  return { b, pilot, drone };
}

describe('drone du télépilote', () => {
  it('apparaît près du télépilote sur « drone:toggle », décolle à 30 m et tient un vol stationnaire stable', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const events = droneEvents(b);
    const pilot = b.person('telepilote', 10, -5);
    pilot.heading = 1;
    expect(b.ctx.vehicles.list.length).toBe(0);
    toggle(b, pilot);
    expect(b.ctx.vehicles.list.length).toBe(1);
    const drone = b.ctx.vehicles.list[0]!;
    expect(drone.kind).toBe('drone');
    expect(b.ext.droneOf(pilot.id)).toBe(drone);
    expect(Math.hypot(drone.x - pilot.x, drone.z - pilot.z)).toBeLessThan(2);
    expect(drone.y).toBeLessThan(2);
    expect(drone.engineOn).toBe(true);
    expect(events).toEqual([{ vehicleId: drone.id, personId: pilot.id, state: 'decollage' }]);
    b.step(12);
    const st = b.ext.flightStatus(drone)!;
    expect(st.mode).toBe('manuel');
    expect(st.altitude).toBeGreaterThan(29);
    expect(st.altitude).toBeLessThan(31);
    expect(st.battery).toBeGreaterThan(0.99);
    expect(st.pilotId).toBe(pilot.id);
    // stationnaire : sans commande, il ne dérive pas
    const x = drone.x;
    const z = drone.z;
    const y = drone.y;
    b.step(10);
    expect(Math.hypot(drone.x - x, drone.z - z)).toBeLessThan(0.05);
    expect(Math.abs(drone.y - y)).toBeLessThan(0.05);
    expect(Math.abs(drone.vy)).toBeLessThan(0.01);
    expect(drone.rpm).toBeGreaterThan(3000); // hélices en rotation
    // le sol ne l'arrête pas : il n'est pas un obstacle pour les piétons
    const pos: Vec2 = { x: drone.x, z: drone.z };
    expect(b.ctx.vehicles.resolveCircle(pos, 0.3)).toBe(false);
  });

  it('prend la main du joueur : player.control.setRemoteVehicle(id) et caméra « drone », rendues au rappel', async () => {
    const remote: number[] = [];
    const b = await createVehicleBench({
      world: createFakeWorld(),
      setup: (ctx: GameContext) => ctx.provide(PLAYER_CONTROL_SERVICE, { setRemoteVehicle: (id: number) => remote.push(id) }),
    });
    const pilot = b.person('telepilote', 0, 0);
    b.ctx.player.possess(pilot.id, 'telepilote');
    expect(pilot.isPlayer).toBe(true);
    toggle(b, pilot);
    const drone = b.ext.droneOf(pilot.id)!;
    expect(remote).toEqual([drone.id]);
    expect(b.ctx.player.state.cameraMode).toBe('drone');
    b.step(12);
    toggle(b, pilot); // rappel
    expect(remote).toEqual([drone.id, 0]);
    expect(b.ctx.player.state.cameraMode).toBe('tps');
    // un PNJ télépilote ne touche ni à la caméra ni au contrôleur du joueur
    const npc = b.person('telepilote', 30, 0);
    toggle(b, npc);
    expect(remote.length).toBe(2);
    expect(b.ctx.player.state.cameraMode).toBe('tps');
  });

  it('répond aux commandes : avance, translation latérale, lacet, montée', async () => {
    const { b, drone } = await hovering();
    const h0 = drone.heading;
    // avance : dans l'axe du cap, jusqu'à 15 m/s
    drone.cmd.throttle = 1;
    b.step(6);
    expect(drone.speed).toBeGreaterThan(14.5);
    expect(drone.speed).toBeLessThanOrEqual(15.01);
    expect(drone.vx * Math.sin(h0) + drone.vz * Math.cos(h0)).toBeGreaterThan(14.5);
    expect(drone.pitch).toBeLessThan(0.01);
    drone.cmd.throttle = 0;
    b.step(4);
    expect(Math.hypot(drone.vx, drone.vz)).toBeLessThan(0.05); // s'arrête seul
    // translation latérale à droite : le long du vecteur droite = (−cos h, sin h)
    const x = drone.x;
    const z = drone.z;
    drone.cmd.strafe = 1;
    b.step(3);
    drone.cmd.strafe = 0;
    b.step(3);
    const right = (drone.x - x) * -Math.cos(h0) + (drone.z - z) * Math.sin(h0);
    const fwd = (drone.x - x) * Math.sin(h0) + (drone.z - z) * Math.cos(h0);
    expect(right).toBeGreaterThan(20);
    expect(Math.abs(fwd)).toBeLessThan(0.5);
    // lacet à droite : le cap diminue
    drone.cmd.steer = 1;
    b.step(1);
    expect(drone.heading).toBeLessThan(h0 - 1);
    expect(drone.yawRate).toBeLessThan(-1);
    drone.cmd.steer = 0;
    b.step(1);
    expect(Math.abs(drone.yawRate)).toBeLessThan(0.01);
    // montée puis descente
    const y = drone.y;
    drone.cmd.lift = 1;
    b.step(4);
    expect(drone.y).toBeGreaterThan(y + 12);
    drone.cmd.lift = -1;
    b.step(2);
    expect(drone.vy).toBeLessThan(-2);
  });

  it('respecte le plafond de 120 m et le plancher de 2 m au-dessus du sol', async () => {
    const { b, drone } = await hovering();
    drone.cmd.lift = 1;
    let top = 0;
    for (let i = 0; i < 30 * 40; i++) {
      b.step(DT);
      top = Math.max(top, drone.y);
    }
    expect(top).toBeLessThanOrEqual(120.001);
    expect(drone.y).toBeGreaterThan(119.5);
    expect(b.ext.flightStatus(drone)!.altitude).toBeCloseTo(120, 0);
    drone.cmd.lift = -1;
    let low = Infinity;
    for (let i = 0; i < 30 * 60; i++) {
      b.step(DT);
      low = Math.min(low, drone.y);
    }
    expect(low).toBeGreaterThanOrEqual(1.999);
    expect(drone.y).toBeLessThan(2.2);
  });

  it('ne traverse pas un immeuble : il monte de lui-même et passe par-dessus', async () => {
    // immeuble de 45 m en travers de la route du drone (qui vole à 30 m)
    const tower = { minX: -30, maxX: 30, minZ: 60, maxZ: 90, height: 45 };
    const { b, drone } = await hovering(createFakeWorld({ boxes: [tower] }));
    expect(drone.y).toBeLessThan(31);
    drone.cmd.throttle = 1;
    let minClear = Infinity;
    let maxY = 0;
    let crossed = false;
    for (let i = 0; i < 30 * 40 && !crossed; i++) {
      b.step(DT);
      maxY = Math.max(maxY, drone.y);
      const over = drone.x > tower.minX && drone.x < tower.maxX && drone.z > tower.minZ && drone.z < tower.maxZ;
      if (over) minClear = Math.min(minClear, drone.y - tower.height);
      crossed = drone.z > tower.maxZ + 10;
    }
    console.log(`drone : immeuble de 45 m franchi à ${minClear.toFixed(1)} m au-dessus du toit (altitude max ${maxY.toFixed(1)} m)`);
    expect(crossed).toBe(true);
    expect(minClear).toBeGreaterThan(0.9); // jamais dans le volume bâti
    expect(maxY).toBeGreaterThan(47);
    // même chose commandes inversées, sans jamais pouvoir descendre dans le bâtiment
    drone.cmd.throttle = -1;
    drone.cmd.lift = -1;
    let inside = false;
    for (let i = 0; i < 30 * 30; i++) {
      b.step(DT);
      const over = drone.x > tower.minX && drone.x < tower.maxX && drone.z > tower.minZ && drone.z < tower.maxZ;
      if (over && drone.y < tower.height + 0.9) inside = true;
    }
    expect(inside).toBe(false);
    expect(drone.z).toBeLessThan(tower.minZ); // revenu de l'autre côté
  });

  it('un immeuble plus haut que le plafond l\'arrête : il ne le franchit pas et ne le pénètre pas', async () => {
    const tower = { minX: -40, maxX: 40, minZ: 50, maxZ: 80, height: 200 };
    const { b, drone } = await hovering(createFakeWorld({ boxes: [tower] }));
    drone.cmd.throttle = 1;
    let maxZ = -Infinity;
    for (let i = 0; i < 30 * 60; i++) {
      b.step(DT);
      maxZ = Math.max(maxZ, drone.z);
    }
    expect(maxZ).toBeLessThan(tower.minZ);
    expect(drone.y).toBeLessThanOrEqual(120.001);
  });

  it('batterie de 30 min : retour automatique à 15 %, atterrissage près du télépilote, disparition', async () => {
    const { b, pilot, drone } = await hovering();
    const events = droneEvents(b);
    const id = drone.id;
    // il s'éloigne, puis vole jusqu'au seuil
    expect(b.ext.flyTo(drone, 150, 80, 60)).toBe(true);
    b.step(40);
    expect(Math.hypot(drone.x - 150, drone.z - 80)).toBeLessThan(1);
    expect(b.ext.flightStatus(drone)!.altitude).toBeCloseTo(60, 0);
    pilot.x = 20; // le télépilote s'est déplacé entre-temps : c'est le point de départ qui fait foi
    b.step(1800 * 0.85 - 60, 0.05);
    expect(b.ext.flightStatus(drone)!.battery).toBeGreaterThan(0.15);
    expect(events.length).toBe(0);
    b.step(20, 0.05);
    expect(events.map((e) => e.state)).toContain('batterie_faible');
    expect(b.ext.flightStatus(drone)!.mode).toBe('retour');
    b.step(60);
    expect(events.map((e) => e.state)).toEqual(['batterie_faible', 'pose']);
    expect(b.ctx.vehicles.get(id)).toBeUndefined(); // posé et rangé
    expect(b.ext.droneOf(pilot.id)).toBeNull();
    // un nouveau drone peut être déployé (relève)
    toggle(b, pilot);
    expect(b.ext.droneOf(pilot.id)).not.toBeNull();
  });

  it('par grand vent, la batterie s\'use une fois et demie plus vite et le drone dérive', async () => {
    const { b, drone } = await hovering();
    const before = b.ext.flightStatus(drone)!.secondsLeft;
    b.step(60);
    const calm = before - b.ext.flightStatus(drone)!.secondsLeft;
    b.ctx.env.setWind(12, 0);
    const x = drone.x;
    const mid = b.ext.flightStatus(drone)!.secondsLeft;
    b.step(60);
    const windy = mid - b.ext.flightStatus(drone)!.secondsLeft;
    expect(calm).toBeCloseTo(60, 0);
    expect(windy).toBeCloseTo(90, 0);
    expect(drone.x).toBeGreaterThan(x + 20); // poussé sous le vent
  });

  it('rappelé, il revient se poser auprès du télépilote là où celui-ci se trouve, puis disparaît', async () => {
    const { b, pilot, drone } = await hovering();
    const events = droneEvents(b);
    drone.cmd.throttle = 1;
    b.step(8);
    drone.cmd.throttle = 0;
    expect(drone.z).toBeGreaterThan(80);
    pilot.x = 15;
    pilot.z = 10;
    toggle(b, pilot);
    expect(events.map((e) => e.state)).toEqual(['rappel']);
    expect(b.ext.flightStatus(drone)!.mode).toBe('retour');
    let landedAt: { x: number; z: number } | null = null;
    b.ctx.events.on('vehicle:removed', (e) => {
      if (e.id === drone.id) landedAt = { x: drone.x, z: drone.z };
    });
    b.step(40);
    expect(landedAt).not.toBeNull();
    expect(Math.hypot(landedAt!.x - 15, landedAt!.z - 10)).toBeLessThan(1);
    expect(b.ctx.vehicles.list.length).toBe(0);
    expect(events.map((e) => e.state)).toEqual(['rappel', 'pose']);
  });

  it('abattu en vol, il tombe ; quelqu\'un dessous est blessé', async () => {
    const { b, drone } = await hovering();
    const events = droneEvents(b);
    const under = b.person('manifestant', drone.x, drone.z);
    b.ctx.vehicles.damage(drone, { amount: 30, kind: 'impact', sourceId: 0, x: 0, z: 0 });
    expect(drone.state).toBe('wrecked');
    expect(b.ext.flightStatus(drone)!.mode).toBe('chute');
    b.step(1);
    expect(drone.vy).toBeLessThan(-5);
    b.step(5);
    expect(drone.y).toBeCloseTo(0, 3);
    expect(b.ext.flightStatus(drone)!.mode).toBe('pose');
    expect(under.health).toBeLessThan(100);
    expect(events.some((e) => e.state === 'perdu')).toBe(true);
    // il reste au sol, à l'état d'épave
    expect(b.ctx.vehicles.get(drone.id)).toBe(drone);
  });

  it('un drone posé par un autre module décolle, va à un point, orbite et revient sur ordre', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const drone = b.spawn('drone', 5, 5, 0);
    expect(b.ext.flightStatus(drone)!.mode).toBe('pose');
    b.step(1);
    expect(drone.y).toBe(0);
    expect(b.ext.takeOff(drone, 50)).toBe(true);
    b.step(15);
    expect(b.ext.flightStatus(drone)!.altitude).toBeCloseTo(50, 0);
    expect(b.ext.orbit(drone, 100, 100, 40, 50, 8)).toBe(true);
    b.step(60);
    const r = Math.hypot(drone.x - 100, drone.z - 100);
    expect(r).toBeGreaterThan(36);
    expect(r).toBeLessThan(44);
    expect(Math.hypot(drone.vx, drone.vz)).toBeGreaterThan(6);
    expect(b.ext.land(drone)).toBe(true);
    b.step(60);
    expect(b.ext.flightStatus(drone)!.mode).toBe('pose');
    expect(Math.hypot(drone.x - 5, drone.z - 5)).toBeLessThan(1);
    expect(b.ctx.vehicles.get(drone.id)).toBe(drone); // posé, pas retiré : il n'appartient à aucun télépilote
  });
});

describe('hélicoptère', () => {
  it('apparaît en vol et décrit une orbite régulière autour de son point d\'apparition', async () => {
    const b = await createVehicleBench({ world: createFakeWorld() });
    const helo = b.spawn('helicoptere', 100, -200, 0.3);
    const st = b.ext.flightStatus(helo)!;
    expect(st.mode).toBe('orbite');
    expect(helo.y).toBeGreaterThan(300);
    expect(helo.engineOn).toBe(true);
    let minR = Infinity;
    let maxR = 0;
    let minAlt = Infinity;
    let maxAlt = 0;
    let swept = 0;
    let lastAngle = Math.atan2(helo.x - 100, helo.z + 200);
    for (let i = 0; i < 30 * 120; i++) {
      b.step(DT);
      const r = Math.hypot(helo.x - 100, helo.z + 200);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minAlt = Math.min(minAlt, helo.y);
      maxAlt = Math.max(maxAlt, helo.y);
      const a = Math.atan2(helo.x - 100, helo.z + 200);
      let d = a - lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      swept += d;
      lastAngle = a;
    }
    console.log(`hélicoptère : rayon ${minR.toFixed(0)}–${maxR.toFixed(0)} m, altitude ${minAlt.toFixed(0)}–${maxAlt.toFixed(0)} m, ${(Math.abs(swept) / (2 * Math.PI)).toFixed(2)} tour en 2 min`);
    expect(minR).toBeGreaterThan(270);
    expect(maxR).toBeLessThan(330);
    expect(minAlt).toBeGreaterThan(390);
    expect(maxAlt).toBeLessThan(410);
    expect(Math.abs(swept)).toBeGreaterThan(Math.PI * 2 * 1.5); // un tour et demi en deux minutes
    expect(swept).toBeLessThan(0); // sens horaire vu du ciel
    expect(helo.speed).toBeGreaterThan(24); // ≈ 100 km/h : allure de surveillance
    expect(helo.speed).toBeLessThan(31);
    expect(Math.abs(helo.roll)).toBeGreaterThan(0.1); // incliné dans le virage
    expect(Math.abs(helo.roll)).toBeLessThan(0.8);
    expect(b.ext.flightStatus(helo)!.battery).toBe(1); // pas de batterie
    // il ne gêne personne au sol
    const pos: Vec2 = { x: helo.x, z: helo.z };
    expect(b.ctx.vehicles.resolveCircle(pos, 1)).toBe(false);
    // nouvelle zone à surveiller
    expect(b.ext.orbit(helo, 500, 500, 200, 350)).toBe(true);
    b.step(180);
    const r = Math.hypot(helo.x - 500, helo.z - 500);
    expect(r).toBeGreaterThan(180);
    expect(r).toBeLessThan(220);
    expect(helo.y).toBeGreaterThan(340);
    expect(helo.y).toBeLessThan(360);
  });
});
