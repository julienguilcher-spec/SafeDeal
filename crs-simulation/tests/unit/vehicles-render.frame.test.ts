/* Repères du rendu des véhicules : repère véhicule (x droite, z avant) → Three local → monde. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SeatDef, TurretDef } from '@/core/contracts';
import { vehicleToWorldX, vehicleToWorldZ } from '@/core/math';
import {
  EYE_ABOVE_SEAT, advanceWheelAngle, composeVehicleMatrix, pack2, pack4, rotateAboutX, rotateAboutY, seatEyeWorld,
  seatToThreeLocal, seatWorldPosition, steerToThree, steeringWheelAngle, transformPoint, turretDirVehicle, turretDirWorld,
  turretMuzzleWorld, turretPitchToThree, turretToThreeLocal, turretYawToThree, vehiclePointToWorld, SRGB_TO_LINEAR,
} from '@/render/vehicles/frame';

const seat = (x: number, y: number, z: number): SeatDef => ({ role: 'passenger', x, y, z, exitX: 0, exitZ: 0 });
const pose = (heading: number, pitch = 0, roll = 0, x = 0, y = 0, z = 0) => ({ x, y, z, heading, pitch, roll });
const v3 = () => ({ x: 0, y: 0, z: 0 });

describe('repère véhicule → Three local', () => {
  it('un siège à droite (x > 0) a un x local Three négatif : +x local est la GAUCHE', () => {
    const out = seatToThreeLocal(seat(0.45, 0.9, 1.2), v3());
    expect(out.x).toBeCloseTo(-0.45);
    expect(out.y).toBeCloseTo(0.9);
    expect(out.z).toBeCloseTo(1.2);
  });

  it('même convention pour les tourelles', () => {
    const t: TurretDef = { kind: 'canon_eau', x: -0.6, y: 3.2, z: 1.9, yawMin: -1, yawMax: 1, pitchMin: 0, pitchMax: 1, capacity: 1, interval: 1 };
    const out = turretToThreeLocal(t, v3());
    expect(out.x).toBeCloseTo(0.6);
    expect(out.z).toBeCloseTo(1.9);
  });
});

describe('repère véhicule → monde', () => {
  it('cap 0 (vers +z, le sud) : le siège de droite est à l\'ouest (−x), le siège avant au sud (+z)', () => {
    const right = seatWorldPosition(pose(0, 0, 0, 100, 5, 200), seat(0.5, 1, 0), v3());
    expect(right.x).toBeCloseTo(99.5);
    expect(right.z).toBeCloseTo(200);
    expect(right.y).toBeCloseTo(6);
    const front = seatWorldPosition(pose(0, 0, 0, 100, 5, 200), seat(0, 1, 1.4), v3());
    expect(front.x).toBeCloseTo(100);
    expect(front.z).toBeCloseTo(201.4);
  });

  it('cap π/2 (vers +x, l\'est) : le siège de droite est au sud (+z)', () => {
    const p = seatWorldPosition(pose(Math.PI / 2), seat(0.5, 0, 0), v3());
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0.5);
  });

  it('coïncide avec vehicleToWorldX/Z du cœur pour tous les caps (à plat)', () => {
    for (let i = 0; i < 16; i++) {
      const h = (i / 16) * Math.PI * 2 - Math.PI;
      const p = vehiclePointToWorld(pose(h, 0, 0, 10, 0, -4), 0.7, 0.3, -1.9, v3());
      expect(p.x).toBeCloseTo(10 + vehicleToWorldX(0.7, -1.9, h), 6);
      expect(p.z).toBeCloseTo(-4 + vehicleToWorldZ(0.7, -1.9, h), 6);
      expect(p.y).toBeCloseTo(0.3, 6);
    }
  });

  it('le siège de droite est bien à droite : produit vectoriel avant × droite vers le bas', () => {
    for (const h of [0, 0.7, 2.1, -1.3, Math.PI]) {
      const o = seatWorldPosition(pose(h), seat(0, 0, 0), v3());
      const r = seatWorldPosition(pose(h), seat(1, 0, 0), v3());
      const f = seatWorldPosition(pose(h), seat(0, 0, 1), v3());
      const rx = r.x - o.x, rz = r.z - o.z, fx = f.x - o.x, fz = f.z - o.z;
      // avant = (sin h, cos h), droite = (−cos h, sin h)
      expect(fx).toBeCloseTo(Math.sin(h));
      expect(fz).toBeCloseTo(Math.cos(h));
      expect(rx).toBeCloseTo(-Math.cos(h));
      expect(rz).toBeCloseTo(Math.sin(h));
      // repère (x est, y haut, z sud) direct : avant × haut = droite
      expect(fz * 0 - 0 * 1).toBeCloseTo(0);
      expect(0 * 0 - fz * 1).toBeCloseTo(rx);   // (f × up).x = fy·0 − fz·1
      expect(fx * 1 - 0).toBeCloseTo(rz);       // (f × up).z = fx·1 − fy·0
    }
  });

  it('assiette : nez levé (pitch > 0) soulève l\'avant ; roulis positif abaisse le côté droit', () => {
    const nose = vehiclePointToWorld(pose(0.4, 0.1, 0), 0, 0, 2, v3());
    expect(nose.y).toBeGreaterThan(0.15);
    const rightSide = vehiclePointToWorld(pose(0.4, 0, 0.1), 1, 0, 0, v3());
    const leftSide = vehiclePointToWorld(pose(0.4, 0, 0.1), -1, 0, 0, v3());
    expect(rightSide.y).toBeLessThan(-0.05);
    expect(leftSide.y).toBeGreaterThan(0.05);
  });

  it('l\'œil d\'un occupant est au-dessus de l\'assise', () => {
    const e = seatEyeWorld(pose(1.1, 0, 0, 3, 2, 1), seat(-0.4, 0.95, 1.3), v3());
    expect(e.y).toBeCloseTo(2 + 0.95 + EYE_ABOVE_SEAT);
  });
});

describe('matrice de véhicule', () => {
  it('est identique à celle de Three.js (rotation.set(−pitch, cap, roll, "YXZ"))', () => {
    const m = new Float32Array(16);
    for (const [h, p, r] of [[0, 0, 0], [1.2, 0, 0], [-2.4, 0.15, -0.08], [0.3, -0.2, 0.25]] as const) {
      composeVehicleMatrix(m, 0, 4, 1.5, -7, h, p, r);
      const o = new THREE.Object3D();
      o.rotation.set(-p, h, r, 'YXZ');
      o.position.set(4, 1.5, -7);
      o.updateMatrix();
      for (let i = 0; i < 16; i++) expect(m[i]!).toBeCloseTo(o.matrix.elements[i]!, 5);
    }
  });

  it('transformPoint applique rotation et translation', () => {
    const m = new Float32Array(16);
    composeVehicleMatrix(m, 0, 10, 0, 20, Math.PI / 2, 0, 0);
    // +z local (l'avant) part vers +x monde quand le cap vaut π/2
    const p = transformPoint(m, 0, 0, 0, 3, v3());
    expect(p.x).toBeCloseTo(13);
    expect(p.z).toBeCloseTo(20);
  });
});

describe('angles de commande', () => {
  it('braquage à droite (positif) = rotation négative autour de +y local', () => {
    expect(steerToThree(0.4)).toBeCloseTo(-0.4);
    // une roue braquée à droite pointe vers −x local (la droite du véhicule)
    const out = { x: 0, z: 0 };
    rotateAboutY(0, 1, steerToThree(0.5), out);
    expect(out.x).toBeLessThan(0);
    expect(out.z).toBeGreaterThan(0);
  });

  it('tourelle : gisement positif vers la droite, site positif vers le haut', () => {
    const d = turretDirVehicle(Math.PI / 2, 0, v3());
    expect(d.x).toBeCloseTo(1);
    expect(d.z).toBeCloseTo(0);
    const up = turretDirVehicle(0, 0.5, v3());
    expect(up.y).toBeGreaterThan(0.4);
    expect(up.z).toBeGreaterThan(0.8);
    // mêmes rotations que le shader : site autour de x puis gisement autour de y, dans le repère Three local
    const yz = { y: 0, z: 0 }, xz = { x: 0, z: 0 };
    rotateAboutX(0, 1, turretPitchToThree(0.5), yz);
    expect(yz.y).toBeCloseTo(Math.sin(0.5));
    rotateAboutY(0, yz.z, turretYawToThree(Math.PI / 2), xz);
    expect(-xz.x).toBeCloseTo(Math.cos(0.5));  // x véhicule = −x Three : vers la droite
    expect(xz.z).toBeCloseTo(0);
  });

  it('direction monde d\'une tourelle tournée à droite = droite du véhicule', () => {
    for (const h of [0, 0.9, -2.2]) {
      const d = turretDirWorld(pose(h), Math.PI / 2, 0, v3());
      expect(d.x).toBeCloseTo(-Math.cos(h));
      expect(d.z).toBeCloseTo(Math.sin(h));
      expect(d.y).toBeCloseTo(0);
    }
  });

  it('bouche du canon : devant le pivot de la tourelle, dans l\'axe de tir', () => {
    const t: TurretDef = { kind: 'canon_eau', x: 0.6, y: 3.2, z: 1.9, yawMin: -1, yawMax: 1, pitchMin: 0, pitchMax: 1, capacity: 1, interval: 1 };
    const carrier = { ...pose(0, 0, 0, 0, 0, 0), turretYaw: [0], turretPitch: [0], def: { turrets: [t] } };
    const pos = v3(), dir = v3();
    expect(turretMuzzleWorld(carrier, 0, pos, dir)).toBe(true);
    expect(dir.z).toBeCloseTo(1);
    expect(pos.x).toBeCloseTo(-0.6);     // tourelle à droite (x = +0,6) → x monde négatif au cap 0
    expect(pos.y).toBeCloseTo(3.2);
    expect(pos.z).toBeCloseTo(1.9 + 1.02);
    expect(turretMuzzleWorld(carrier, 3, pos, dir)).toBe(false);
  });

  it('volant : démultiplié et borné', () => {
    expect(steeringWheelAngle(0.1)).toBeCloseTo(1.4);
    expect(steeringWheelAngle(5)).toBeCloseTo(Math.PI * 2.5);
    expect(steeringWheelAngle(-5)).toBeCloseTo(-Math.PI * 2.5);
  });
});

describe('roues', () => {
  it('marche avant : le haut de la roue part vers l\'avant (+z)', () => {
    const a = advanceWheelAngle(0, 5, 0.01, 0.32);
    expect(a).toBeGreaterThan(0);
    const out = { y: 0, z: 0 };
    rotateAboutX(0.32, 0, a, out);    // point haut de la roue
    expect(out.z).toBeGreaterThan(0);
  });

  it('tourne de distance / rayon et reste dans [0, 2π)', () => {
    expect(advanceWheelAngle(0, 3.2, 0.1, 0.32)).toBeCloseTo(1.0);
    let a = 0;
    for (let i = 0; i < 1000; i++) a = advanceWheelAngle(a, 30, 0.016, 0.3);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(Math.PI * 2);
    const back = advanceWheelAngle(0.1, -4, 0.1, 0.4);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(back).toBeLessThan(Math.PI * 2);
    expect(advanceWheelAngle(1, 5, 0.1, 0)).toBe(1);
  });
});

describe('compactage des attributs d\'instance', () => {
  it('pack2 : deux niveaux de 4 bits, décodables comme dans le shader', () => {
    const lo = (p: number) => (p % 16) / 15, hi = (p: number) => Math.floor(p / 16) / 15;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.4, 0.8]] as const) {
      const p = pack2(a, b);
      expect(lo(p)).toBeCloseTo(a, 1);
      expect(hi(p)).toBeCloseTo(b, 1);
    }
    expect(pack2(-3, 9)).toBe(15 * 16);
  });

  it('pack4 : quatre portes sur 16 bits', () => {
    const door = (p: number, i: number) => (Math.floor(p / Math.pow(16, i)) % 16) / 15;
    const p = pack4(1, 0, 0.5, 1);
    expect(door(p, 0)).toBeCloseTo(1);
    expect(door(p, 1)).toBeCloseTo(0);
    expect(door(p, 2)).toBeCloseTo(0.5, 1);
    expect(door(p, 3)).toBeCloseTo(1);
    expect(p).toBeLessThan(65536);
    expect(Number.isInteger(p)).toBe(true);
  });

  it('table sRGB → linéaire', () => {
    expect(SRGB_TO_LINEAR[0]).toBe(0);
    expect(SRGB_TO_LINEAR[255]).toBeCloseTo(1);
    const c = new THREE.Color().setHex(0x808080);
    expect(SRGB_TO_LINEAR[0x80]!).toBeCloseTo(c.r, 4);
  });
});
