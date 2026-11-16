import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '@/render/base/cameraRig';
import { eyeHeight, seatIndexOf, turretIndexOf, zoomedFov } from '@/render/base/cameraMath';
import { createFakeRenderContext, makeVehicleDef } from '@/render/base/dev/fakeContext';
import type { CameraMode } from '@/core/contracts';

const DEG = Math.PI / 180;

function setup() {
  const fake = createFakeRenderContext({ headless: true });
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 8000);
  const rig = new CameraRig(fake.ctx, camera);
  const player = fake.controls.addPerson(0, 0, 0);
  fake.controls.possess(player);
  const frame = (dt = 1 / 60, n = 1): void => {
    for (let i = 0; i < n; i++) rig.update(dt, 70, 16 / 9);
  };
  const set = (mode: CameraMode, yaw = 0, pitch = 0, zoom = 1): void => {
    fake.controls.player.cameraMode = mode;
    fake.controls.player.camYaw = yaw;
    fake.controls.player.camPitch = pitch;
    fake.controls.player.zoom = zoom;
  };
  /** Direction du regard de la caméra dans le monde. */
  const forward = (): THREE.Vector3 => camera.getWorldDirection(new THREE.Vector3());
  return { ...fake, camera, rig, player, frame, set, forward };
}

describe('rendu de base — rig de caméra', () => {
  it('convention d’orientation : cap h ⇒ avant = (sin h, cos h) ; site positif vers le haut', () => {
    const t = setup();
    for (const [yaw, fx, fz] of [[0, 0, 1], [Math.PI / 2, 1, 0], [Math.PI, 0, -1], [-Math.PI / 2, -1, 0]] as const) {
      t.set('fps', yaw, 0);
      t.rig.cut();
      t.frame();
      const f = t.forward();
      expect(f.x).toBeCloseTo(fx, 5);
      expect(f.z).toBeCloseTo(fz, 5);
      expect(f.y).toBeCloseTo(0, 5);
    }
    t.set('fps', 0, 30 * DEG);
    t.rig.cut();
    t.frame();
    expect(t.forward().y).toBeCloseTo(0.5, 5);
    // la droite de la caméra est bien la droite du contrat : (-cos h, sin h)
    t.set('fps', 0, 0);
    t.rig.cut();
    t.frame();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(t.camera.quaternion);
    expect(right.x).toBeCloseTo(-1, 5);
    expect(right.z).toBeCloseTo(0, 5);
  });

  it('fps : aux yeux de la personne, selon sa taille et sa posture', () => {
    const t = setup();
    t.set('fps');
    t.frame();
    expect(t.rig.mode).toBe('fps');
    expect(t.camera.position.y).toBeCloseTo(eyeHeight(t.player), 3);
    expect(t.camera.position.y).toBeGreaterThan(1.55);
    expect(t.camera.position.y).toBeLessThan(1.75);
    expect(Math.hypot(t.camera.position.x, t.camera.position.z)).toBeLessThan(0.15);
    expect(t.camera.fov).toBeCloseTo(70, 3);
    // accroupi : la vue descend en douceur, sans saut
    t.player.posture = 'crouch';
    t.frame();
    expect(t.camera.position.y).toBeGreaterThan(1.4);
    t.frame(1 / 60, 90);
    expect(t.camera.position.y).toBeCloseTo(eyeHeight(t.player), 2);
    expect(t.camera.position.y).toBeLessThan(1.15);
  });

  it('fps : léger balancement à la marche, nul à l’arrêt', () => {
    const t = setup();
    t.set('fps');
    t.frame(1 / 60, 30);
    const still = t.camera.position.y;
    t.frame(1 / 60, 30);
    expect(t.camera.position.y).toBeCloseTo(still, 6);
    // marche à 1,5 m/s
    t.player.vz = 1.5;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 240; i++) {
      t.player.z += 1.5 / 60;
      t.frame();
      min = Math.min(min, t.camera.position.y);
      max = Math.max(max, t.camera.position.y);
    }
    expect(max - min).toBeGreaterThan(0.015);
    expect(max - min).toBeLessThan(0.07);   // « léger »
    // réglage d'accessibilité : balancement coupé
    t.rig.headBob = 0;
    t.frame(1 / 60, 60);
    min = Infinity;
    max = -Infinity;
    for (let i = 0; i < 120; i++) {
      t.frame();
      min = Math.min(min, t.camera.position.y);
      max = Math.max(max, t.camera.position.y);
    }
    expect(max - min).toBeLessThan(0.002);
  });

  it('tps : derrière l’épaule droite, à environ 3,3 m', () => {
    const t = setup();
    t.set('tps', 0, 0);
    t.frame(1 / 60, 5);
    // regard vers +z : la caméra est derrière (z < 0) et à droite ; droite = (-cos 0, sin 0) = (-1, 0)
    expect(t.camera.position.z).toBeLessThan(-3);
    expect(t.camera.position.x).toBeLessThan(-0.3);
    expect(t.rig.tpsDistance).toBeCloseTo(3.3, 2);
    expect(t.camera.position.y).toBeGreaterThan(1.4);
    // le zoom (visée) rapproche et resserre le champ
    const fov = t.camera.fov;
    t.set('tps', 0, 0, 2);
    t.frame(1 / 60, 60);
    expect(t.rig.tpsDistance).toBeLessThan(2.5);
    expect(t.camera.fov).toBeLessThan(fov * 0.6);
  });

  it('tps : la caméra ne traverse pas les murs (collision par ctx.world.raycast)', () => {
    const t = setup();
    // un immeuble de 20 m juste derrière le joueur : façade à z = -1,2
    t.controls.boxes.push({ x0: -30, x1: 30, z0: -20, z1: -1.2, h: 20 });
    t.set('tps', 0, 0);
    t.frame(1 / 60, 5);
    expect(t.controls.raycasts).toBeGreaterThan(0);
    expect(t.camera.position.z).toBeGreaterThan(-1.2);     // devant la façade
    expect(t.rig.tpsDistance).toBeLessThan(1.2);
    // on regarde vers le haut : la caméra descend mais reste au-dessus du sol
    t.set('tps', 0, 60 * DEG);
    t.frame(1 / 60, 5);
    expect(t.camera.position.y).toBeGreaterThan(0.2);
    // le mur disparaît : la caméra recule progressivement, pas d'un coup
    t.controls.boxes.length = 0;
    t.set('tps', 0, 0);
    t.frame();
    expect(t.rig.tpsDistance).toBeLessThan(1.6);
    t.frame(1 / 60, 180);
    expect(t.rig.tpsDistance).toBeGreaterThan(3.2);
  });

  it('tps : une barrière basse ne bloque pas la caméra qui passe au-dessus', () => {
    const t = setup();
    t.controls.boxes.push({ x0: -30, x1: 30, z0: -2.2, z1: -1.8, h: 1.1 });
    t.set('tps', 0, -20 * DEG);   // regard plongeant : la caméra est haute
    t.frame(1 / 60, 5);
    expect(t.rig.tpsDistance).toBeGreaterThan(3);
    // regard horizontal : la caméra passerait dans la barrière, elle se rapproche
    const low = setup();
    low.controls.boxes.push({ x0: -30, x1: 30, z0: -2.2, z1: -1.8, h: 1.9 });
    low.set('tps', 0, 0);
    low.frame(1 / 60, 5);
    expect(low.rig.tpsDistance).toBeLessThan(1.8);
  });

  it('véhicule extérieur : caméra de poursuite derrière le véhicule, qui tourne avec lui', () => {
    const t = setup();
    const van = t.controls.addVehicle(makeVehicleDef(), 0, 0, 0);
    t.controls.possess(t.player, van, 0);
    t.set('vehicle_ext', 0, 0);
    t.frame(1 / 60, 5);
    expect(t.rig.mode).toBe('vehicle_ext');
    expect(t.camera.position.z).toBeLessThan(-8);          // derrière (le véhicule regarde +z)
    expect(t.camera.position.y).toBeGreaterThan(3);         // au-dessus du toit
    expect(t.forward().y).toBeLessThan(-0.1);               // légèrement plongeante
    // le véhicule tourne d'un quart de tour : le rig reporte la rotation sur camYaw
    for (let i = 0; i < 90; i++) {
      van.heading += (Math.PI / 2) / 90;
      t.frame();
    }
    expect(t.controls.player.camYaw).toBeCloseTo(Math.PI / 2, 2);
    expect(t.camera.position.x).toBeLessThan(-8);           // toujours derrière : le véhicule regarde +x
    // option désactivée : la caméra ne suit plus la rotation
    t.rig.vehicleYawFollow = false;
    t.rig.vehicleAutoCenter = false;
    van.heading += 0.5;
    t.frame();
    expect(t.controls.player.camYaw).toBeCloseTo(Math.PI / 2, 2);
  });

  it('véhicule extérieur : recentrage derrière le véhicule quand le joueur ne regarde plus autour', () => {
    const t = setup();
    const van = t.controls.addVehicle(makeVehicleDef(), 0, 0, 0);
    t.controls.possess(t.player, van, 0);
    t.set('vehicle_ext', 1.2, 0.3);    // le joueur regarde sur le côté
    van.speed = 8;
    t.frame(1 / 60, 60);
    expect(t.controls.player.camYaw).toBeCloseTo(1.2, 3);   // pas encore : délai de 1,4 s
    t.frame(1 / 60, 400);
    expect(Math.abs(t.controls.player.camYaw)).toBeLessThan(0.05);
    // tant que le joueur bouge la souris, pas de recentrage
    t.set('vehicle_ext', 1.2, 0);
    t.controls.input.lookX = 0.01;
    t.frame(1 / 60, 300);
    expect(t.controls.player.camYaw).toBeCloseTo(1.2, 3);
  });

  it('véhicule intérieur : à la place du conducteur, à hauteur d’yeux au-dessus du siège', () => {
    const t = setup();
    const def = makeVehicleDef();
    const van = t.controls.addVehicle(def, 10, 5, Math.PI / 2);   // le véhicule regarde +x
    t.controls.possess(t.player, van, 0);
    t.set('vehicle_int', Math.PI / 2, 0);
    t.frame();
    expect(t.rig.mode).toBe('vehicle_int');
    const seat = def.seats[0]!;
    // siège (x = droite, z = avant) ; cap π/2 : avant = (1, 0), droite = (0, 1)
    expect(t.camera.position.x).toBeCloseTo(10 + seat.z, 3);
    expect(t.camera.position.z).toBeCloseTo(5 + seat.x, 3);
    expect(t.camera.position.y).toBeGreaterThan(seat.y + 0.55);
    expect(t.camera.position.y).toBeLessThan(def.height);
    expect(seatIndexOf(van, t.player)).toBe(0);
    // demandé 'fps' en étant à bord : le rig corrige vers la vue intérieure
    t.set('fps', Math.PI / 2, 0);
    t.frame();
    expect(t.rig.mode).toBe('vehicle_int');
    // demandé 'vehicle_int' à pied : vue subjective
    t.controls.possess(t.player, null);
    t.set('vehicle_int');
    t.frame();
    expect(t.rig.mode).toBe('fps');
  });

  it('tourelle : la caméra est sur l’affût du tireur', () => {
    const t = setup();
    const def = makeVehicleDef();
    const van = t.controls.addVehicle(def, 0, 0, 0);
    t.controls.possess(t.player, van, 1);    // siège de tireur
    t.set('turret', 0.4, -0.1);
    t.frame();
    expect(t.rig.mode).toBe('turret');
    expect(turretIndexOf(van, 1)).toBe(0);
    expect(t.camera.position.y).toBeGreaterThan(def.turrets[0]!.y);
    expect(t.camera.position.y).toBeLessThan(def.turrets[0]!.y + 0.6);
    const f = t.forward();
    expect(Math.atan2(f.x, f.z)).toBeCloseTo(0.4, 3);
  });

  it('drone : à la position de l’engin volant, regard plongeant', () => {
    const t = setup();
    const drone = t.controls.addVehicle(makeVehicleDef({ kind: 'drone', flying: true, seats: [], turrets: [], height: 0.2 }), 12, -7, 0, 60);
    t.set('drone', 0, 0);
    t.frame();
    expect(t.rig.mode).toBe('drone');
    expect(t.camera.position.x).toBeCloseTo(12, 3);
    expect(t.camera.position.z).toBeCloseTo(-7, 3);
    expect(t.camera.position.y).toBeGreaterThan(59);
    expect(t.forward().y).toBeLessThan(-0.5);     // camPitch = 0 ⇒ déjà ≈ 35° sous l'horizon
    // jamais plus haut que légèrement au-dessus de l'horizon, jamais au-delà de la verticale
    t.set('drone', 0, 1.4);
    t.frame();
    expect(t.forward().y).toBeLessThan(0.31);
    t.set('drone', 0, -1.5);
    t.rig.cut();
    t.frame();
    expect(t.forward().y).toBeGreaterThan(-1.0001);
    expect(t.forward().y).toBeLessThan(-0.99);
    // sans engin volant : point de vue stationnaire au-dessus du joueur
    t.controls.vehicles.length = 0;
    expect(drone.def.flying).toBe(true);
    t.rig.cut();
    t.frame();
    expect(t.camera.position.y).toBeGreaterThan(40);
  });

  it('tactique : haute, quasi verticale, centrée sur le joueur, zoomable et déplaçable', () => {
    const t = setup();
    t.player.x = 40;
    t.player.z = -20;
    t.set('tactical', 0, 0, 1);
    t.frame();
    expect(t.rig.mode).toBe('tactical');
    expect(t.rig.tactical.x).toBeCloseTo(40, 5);
    expect(t.rig.tactical.z).toBeCloseTo(-20, 5);
    expect(t.camera.position.y).toBeCloseTo(150, 0);
    expect(t.forward().y).toBeLessThan(-0.97);     // à moins de 13° de la verticale
    // le centre de la vue est au centre de l'écran
    const p = { x: 0, y: 0 };
    expect(t.rig.project(40, 0, -20, p)).toBe(true);
    expect(Math.abs(p.x)).toBeLessThan(0.02);
    expect(Math.abs(p.y)).toBeLessThan(0.02);
    // zoom : on descend ; dézoom : on monte, dans des bornes
    t.set('tactical', 0, 0, 3);
    t.frame(1 / 60, 120);
    expect(t.camera.position.y).toBeCloseTo(50, 0);
    t.set('tactical', 0, 0, 0.01);
    t.frame(1 / 60, 200);
    expect(t.camera.position.y).toBeLessThanOrEqual(601);
    // déplacement par les axes de ctx.input : « avant » = vers le haut de l'écran = +z ici
    t.set('tactical', 0, 0, 1);
    t.frame(1 / 60, 200);
    const z0 = t.rig.tactical.z;
    t.controls.input.moveY = 1;
    t.frame(1 / 60, 60);
    expect(t.rig.tactical.z).toBeGreaterThan(z0 + 100);
    t.controls.input.moveY = 0;
    // API : recentrage et déplacement explicites
    t.rig.tactical.setCenter(5, 6);
    t.rig.tactical.pan(1, -1);
    expect(t.rig.tactical.x).toBe(6);
    expect(t.rig.tactical.z).toBe(5);
    // un écran d'interface ouvert gèle le déplacement au clavier
    t.controls.modal = true;
    t.controls.input.moveX = 1;
    t.frame(1 / 60, 30);
    expect(t.rig.tactical.x).toBe(6);
  });

  it('viseur : téléobjectif, champ étroit selon le zoom', () => {
    const t = setup();
    t.set('viewfinder', 0, 0, 1);
    t.frame();
    expect(t.rig.mode).toBe('viewfinder');
    expect(t.camera.fov).toBeLessThan(40);
    const wide = t.camera.fov;
    t.set('viewfinder', 0, 0, 8);
    t.rig.cut();
    t.frame();
    expect(t.camera.fov).toBeLessThan(wide / 6);
    expect(t.camera.fov).toBeGreaterThan(2);
    expect(t.camera.position.y).toBeCloseTo(eyeHeight(t.player), 2);
    expect(zoomedFov(60, 1)).toBe(60);
    expect(zoomedFov(60, 2)).toBeCloseTo(32.2, 1);
  });

  it('vol libre : part de la position courante et vole dans la direction du regard', () => {
    const t = setup();
    t.set('tps');
    t.frame(1 / 60, 5);
    const start = t.camera.position.clone();
    t.set('free', 0, 0);
    t.frame();
    expect(t.rig.mode).toBe('free');
    expect(t.rig.free.x).toBeCloseTo(start.x, 3);
    t.controls.input.moveY = 1;
    t.frame(1 / 60, 60);
    expect(t.rig.free.z).toBeGreaterThan(start.z + 12);
    t.controls.input.moveY = 0;
    t.controls.input.down.add('jump');
    t.frame(1 / 60, 60);
    expect(t.rig.free.y).toBeGreaterThan(start.y + 12);
    t.controls.input.down.clear();
    t.rig.placeFree(100, 50, -30);
    t.frame(1 / 60, 30);
    expect(t.camera.position.x).toBeCloseTo(100, 1);
    expect(t.camera.position.y).toBeCloseTo(50, 1);
  });

  it('fondu entre deux modes, coupe franche au changement de personnage', () => {
    const t = setup();
    t.set('fps');
    t.frame(1 / 60, 5);
    const eye = t.camera.position.clone();
    t.set('tps');
    t.frame();
    // une image après : encore tout près des yeux
    expect(t.camera.position.distanceTo(eye)).toBeLessThan(0.6);
    t.frame(1 / 60, 30);
    expect(t.camera.position.distanceTo(eye)).toBeGreaterThan(3);
    // autre personnage, loin : pas de travelling à travers la carte
    const other = t.controls.addPerson(500, 300, 0);
    t.controls.possess(other);
    t.frame();
    expect(t.camera.position.x).toBeGreaterThan(495);
  });

  it('secousse : bornée, amortie, puis la caméra retrouve exactement sa pose', () => {
    const t = setup();
    t.set('fps');
    t.frame(1 / 60, 5);
    const rest = t.camera.position.clone();
    const restQ = t.camera.quaternion.clone();
    t.rig.shake(1, 0.5);
    let maxMove = 0;
    let maxAngle = 0;
    for (let i = 0; i < 20; i++) {
      t.frame();
      maxMove = Math.max(maxMove, t.camera.position.distanceTo(rest));
      maxAngle = Math.max(maxAngle, t.camera.quaternion.angleTo(restQ));
    }
    expect(maxMove).toBeGreaterThan(0.005);
    expect(maxMove).toBeLessThan(0.12);
    expect(maxAngle).toBeGreaterThan(0.002);
    expect(maxAngle).toBeLessThan(0.06);
    t.frame(1 / 60, 40);
    expect(t.camera.position.distanceTo(rest)).toBeLessThan(1e-6);
    expect(t.camera.quaternion.angleTo(restQ)).toBeLessThan(1e-6);
    // valeurs absurdes ignorées
    t.rig.shake(-1, 1);
    t.rig.shake(1, 0);
    t.rig.shake(NaN, 1);
    t.frame();
    expect(t.camera.position.distanceTo(rest)).toBeLessThan(1e-6);
  });

  it('sans personnage incarné : vue d’attente au-dessus du point de départ, sans erreur', () => {
    const t = setup();
    t.controls.possess(null);
    for (const mode of ['fps', 'tps', 'vehicle_ext', 'vehicle_int', 'turret', 'drone', 'tactical', 'viewfinder', 'free'] as CameraMode[]) {
      t.set(mode);
      t.frame(1 / 60, 3);
      expect(Number.isFinite(t.camera.position.x + t.camera.position.y + t.camera.position.z)).toBe(true);
      expect(t.camera.position.y).toBeGreaterThan(0.4);
    }
  });

  it('coût : un rig coûte quelques microsecondes par image, sans allocation notable', () => {
    const t = setup();
    t.controls.boxes.push({ x0: -30, x1: 30, z0: -20, z1: -1.2, h: 20 });
    t.set('tps', 0.3, -0.1);
    t.frame(1 / 60, 100);
    const t0 = performance.now();
    for (let i = 0; i < 20000; i++) t.rig.update(1 / 60, 70, 16 / 9);
    const us = ((performance.now() - t0) / 20000) * 1000;
    expect(us).toBeLessThan(60);
  });
});
