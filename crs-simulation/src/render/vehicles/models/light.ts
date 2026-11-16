/* Deux-roues et aéronefs : moto de BRAV-M (trail routier), scooter, drone quadricoptère, hélicoptère. */

import type { VehicleDef } from '@/core/contracts';
import {
  LIGHT_BEACON_A, LIGHT_BEACON_B, LIGHT_HEAD, LIGHT_IND_L, LIGHT_IND_R, LIGHT_NONE, LIGHT_TAIL, PART_BIKE_WHEEL, PART_FORK,
  PART_ROTOR, PART_ROTOR_X, SURF_DARK, SURF_FIXED, SURF_GLASS, SURF_LAMP, SURF_METAL,
} from '../geo';
import type { Geo } from '../geo';
import { COL, EDGE_SHOULDER, EDGE_SIDE, EDGE_TOP, decal, lamp, lampBox, patch, pipe, plate, shell, wheel } from '../kit';
import type { Station } from '../kit';
import { tile } from '../atlas-layout';
import { emptyMeta } from './types';
import type { ModelMeta } from './types';

/** Axe de direction des deux-roues (repère Three local) : incliné de 27° vers l'arrière. Même valeur dans le shader. */
export const FORK_AXIS_Y = 0.891;
export const FORK_AXIS_Z = -0.454;

interface BikeFrame { rF: number; rR: number; zF: number; zR: number; headY: number; headZ: number }

/** Roue centrée (deux demi-roues en miroir) : `part` = PART_BIKE_WHEEL pour l'avant, 0 pour l'arrière. */
function bikeWheel(g: Geo, far: boolean, z: number, r: number, w: number, part: number, ratio: number): void {
  g.mirror(() => { wheel(g, far, w / 2, z, r, w / 2, 'moto', false, ratio, true, part); });
}

/** Fourche, garde-boue avant, guidon, rétroviseurs : tout ce qui tourne avec la direction. */
function forkAssembly(g: Geo, far: boolean, f: BikeFrame, barY: number, barZ: number, barHalf: number, fender: () => void, guards: boolean): void {
  g.part(PART_FORK, 0, f.rF, f.zF).light(LIGHT_NONE).tile(null);
  g.paint(0x8f949b, SURF_METAL);
  if (far) {
    g.box(-0.05, 0.05, f.rF, f.headY, f.headZ - 0.04, f.zF + 0.04, 1);
    g.paint(COL.dark, SURF_DARK).box(-barHalf, barHalf, barY - 0.03, barY + 0.03, barZ - 0.03, barZ + 0.03);
    g.noPart();
    return;
  }
  g.mirror(() => { g.tube(0.085, f.rF, f.zF, 0.1, f.headY, f.headZ, 0.026, 0.03, 6, true, true); });
  // garde-boue : arc au-dessus de la roue
  fender();
  const rr = f.rF + 0.035;
  for (let i = 0; i < 4; i++) {
    const a0 = 0.5 + i * 0.5, a1 = 0.5 + (i + 1) * 0.5;
    const p = (a: number, rad: number): number[] => [f.rF + Math.sin(a) * rad, f.zF + Math.cos(a) * rad];
    const q0 = p(a0, rr), q1 = p(a1, rr), q2 = p(a1, rr + 0.02), q3 = p(a0, rr + 0.02);
    g.prism([q0[1]!, q0[0]!, q1[1]!, q1[0]!, q2[1]!, q2[0]!, q3[1]!, q3[0]!], -0.075, 0.075);
  }
  // guidon, poignées, leviers, rétroviseurs
  g.paint(COL.dark, SURF_DARK);
  g.tube(-barHalf, barY, barZ, barHalf, barY, barZ, 0.016, 0.016, 6);
  g.tube(0, f.headY, f.headZ, 0, barY, barZ, 0.03, 0.025, 6, false, false);
  g.mirror(() => {
    g.tube(barHalf - 0.13, barY, barZ, barHalf, barY, barZ, 0.022, 0.022, 6);
    if (guards) g.paint(COL.plastic, SURF_FIXED).cube(barHalf - 0.07, barY, barZ + 0.06, 0.14, 0.09, 0.03);
    g.paint(COL.dark, SURF_DARK).tube(barHalf - 0.16, barY, barZ, barHalf - 0.06, barY + 0.2, barZ - 0.02, 0.008, 0.008, 4, false, false);
    g.cube(barHalf - 0.06, barY + 0.24, barZ - 0.02, 0.12, 0.08, 0.02);
    g.paint(0x6c7884, SURF_GLASS).face([barHalf - 0.115, barY + 0.205, barZ - 0.032, barHalf - 0.005, barY + 0.205, barZ - 0.032, barHalf - 0.005, barY + 0.275, barZ - 0.032, barHalf - 0.115, barY + 0.275, barZ - 0.032], null, [0, 0, -1]);
    g.paint(COL.dark, SURF_DARK);
  });
  g.noPart();
}

export function buildMoto(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2, k = L / 2.25;
  const meta = emptyMeta(def);
  const rF = 0.34 * k, rR = 0.32 * k;
  const zF = hl - rF;
  const zR = Math.max(-hl + rR + 0.04, zF - def.wheelbase);
  const headY = rF + 0.66 * k, headZ = zF + ((headY - rF) / FORK_AXIS_Y) * FORK_AXIS_Z;
  const f: BikeFrame = { rF, rR, zF, zR, headY, headZ };
  const body = (): void => { g.body(); };
  g.noPart().tile(null);

  bikeWheel(g, far, zF, rF, 0.12 * k, PART_BIKE_WHEEL, 1);
  bikeWheel(g, far, zR, rR, 0.17 * k, 0, rF / rR);
  forkAssembly(g, far, f, headY + 0.13 * k, headZ - 0.06, W / 2 - 0.005, () => g.paint(0x1c1d20, SURF_FIXED), true);

  const seatY = 0.86 * k;
  // ── moteur, cadre, bras oscillant ──
  g.paint(0x2b2d31, SURF_METAL);
  if (far) {
    g.box(-0.16, 0.16, 0.28 * k, seatY - 0.1, zR + 0.25, headZ - 0.05);
  } else {
    g.box(-0.17, 0.17, 0.3 * k, 0.66 * k, -0.28 * k, 0.3 * k);
    g.mirror(() => {
      // cylindres à plat et pare-carters
      g.paint(0x3a3d42, SURF_METAL).tube(0.17, 0.48 * k, 0.12 * k, 0.33, 0.48 * k, 0.12 * k, 0.085, 0.085, 8);
      g.paint(0x8d9299, SURF_METAL);
      pipe(g, [0.15, 0.68 * k, 0.32 * k, 0.36, 0.56 * k, 0.26 * k, 0.36, 0.4 * k, 0.2 * k, 0.15, 0.32 * k, 0.1 * k], 0.014, 5);
      g.paint(0x2b2d31, SURF_METAL).prism([zR, rR - 0.03, zR, rR + 0.05, -0.2 * k, 0.5 * k, -0.2 * k, 0.36 * k], 0.09, 0.13);
    });
    // échappement côté droit
    g.paint(0x9a9ea4, SURF_METAL).tube(-0.2, 0.4 * k, -0.2 * k, -0.22, 0.52 * k, zR - 0.05, 0.035, 0.035, 6, false, false);
    g.tube(-0.22, 0.52 * k, zR - 0.05, -0.24, 0.6 * k, zR - 0.42 * k, 0.06, 0.065, 8);
    // sabot moteur
    g.paint(COL.plastic, SURF_FIXED).box(-0.14, 0.14, 0.24 * k, 0.3 * k, -0.25 * k, 0.4 * k);
  }
  // ── réservoir, bec et tête de fourche ──
  const st: Station[] = [
    { z: -0.14 * k, w: 0.14, y0: 0.7 * k, y1: seatY + 0.03, round: 0.05, tuck: 0.04 },
    { z: 0.08 * k, w: 0.2, y0: 0.68 * k, y1: 1.0 * k, round: 0.07, tuck: 0.05 },
    { z: 0.36 * k, w: 0.19, y0: 0.7 * k, y1: 1.03 * k, round: 0.07, tuck: 0.05 },
    { z: headZ + 0.2, w: 0.15, y0: 0.82 * k, y1: 1.06 * k, round: 0.05, tuck: 0.04 },
    { z: headZ + 0.34, w: 0.1, y0: 0.9 * k, y1: 1.04 * k, round: 0.04, tuck: 0.03 },
  ];
  shell(g, far, far ? [st[0]!, st[2]!, st[4]!] : st, body);
  const noseZ = headZ + 0.34;
  if (!far) {
    // bec avant (au-dessus de la roue) et bulle haute
    body();
    g.prism([noseZ - 0.05, 0.9 * k, noseZ + 0.3, 0.86 * k, noseZ + 0.3, 0.9 * k, noseZ - 0.05, 0.98 * k], -0.07, 0.07);
    g.paint(0x54626e, SURF_GLASS).tile(tile('verre'));
    g.face([-0.17, 1.04 * k, noseZ - 0.02, 0.17, 1.04 * k, noseZ - 0.02, 0.14, H, noseZ - 0.2, -0.14, H, noseZ - 0.2], null, [0, 0.3, 1]);
    g.face([-0.17, 1.04 * k, noseZ - 0.02, 0.17, 1.04 * k, noseZ - 0.02, 0.14, H, noseZ - 0.2, -0.14, H, noseZ - 0.2], null, [0, -0.3, -1]);
    g.tile(null);
    // tableau de bord
    g.paint(COL.dark, SURF_DARK).cube(0, 1.08 * k, noseZ - 0.12, 0.2, 0.08, 0.04);
  } else {
    g.paint(0x54626e, SURF_GLASS).face([-0.16, 1.04 * k, noseZ, 0.16, 1.04 * k, noseZ, 0.14, H, noseZ - 0.2, -0.14, H, noseZ - 0.2], null, [0, 0.3, 1]);
  }
  // phare double et feux bleus de calandre
  lamp(g, 0, 0.97 * k, noseZ + 0.012, [1, 0, 0], [0, 1, 0], 0.16, 0.08, COL.headLens, LIGHT_HEAD);
  lampBox(g, 0.12, 0.17, 0.93 * k, 0.99 * k, noseZ - 0.06, noseZ - 0.01, COL.blueLens, LIGHT_BEACON_A);
  lampBox(g, -0.17, -0.12, 0.93 * k, 0.99 * k, noseZ - 0.06, noseZ - 0.01, COL.blueLens, LIGHT_BEACON_B);
  meta.head.push(0, 0.97 * k, noseZ);
  meta.beaconA.push(0.15, 0.96 * k, noseZ);
  meta.beaconB.push(-0.15, 0.96 * k, noseZ);

  // ── selle biplace, coque arrière, top-case ──
  const caseZ1 = -hl + 0.46 * k, caseY0 = seatY + 0.1;
  if (far) {
    g.paint(COL.dark, SURF_DARK).box(-0.15, 0.15, seatY - 0.12, seatY, zR - 0.1, -0.1 * k);
    g.paint(0x1f2023, SURF_FIXED).box(-0.2, 0.2, caseY0, caseY0 + 0.32 * k, -hl, caseZ1);
  } else {
    g.paint(0x101113, SURF_FIXED);
    g.hexa([
      -0.15, seatY - 0.06, -0.72 * k, 0.15, seatY - 0.06, -0.72 * k, 0.13, seatY - 0.06, -0.12 * k, -0.13, seatY - 0.06, -0.12 * k,
      -0.14, seatY + 0.06, -0.72 * k, 0.14, seatY + 0.06, -0.72 * k, 0.12, seatY, -0.12 * k, -0.12, seatY, -0.12 * k,
    ]);
    body();
    g.hexa([
      -0.12, seatY - 0.2, zR - 0.1, 0.12, seatY - 0.2, zR - 0.1, 0.14, seatY - 0.2, -0.14 * k, -0.14, seatY - 0.2, -0.14 * k,
      -0.13, seatY - 0.06, -hl + 0.3 * k, 0.13, seatY - 0.06, -hl + 0.3 * k, 0.15, seatY - 0.06, -0.14 * k, -0.15, seatY - 0.06, -0.14 * k,
    ]);
    // porte-bagages et top-case
    g.paint(0x8d9299, SURF_METAL).box(-0.16, 0.16, caseY0 - 0.03, caseY0, -hl + 0.02, caseZ1 + 0.05);
    const from = g.mark();
    g.paint(0x1f2023, SURF_FIXED);
    g.hexa([
      -0.2, caseY0, -hl, 0.2, caseY0, -hl, 0.2, caseY0, caseZ1, -0.2, caseY0, caseZ1,
      -0.22, caseY0 + 0.32 * k, -hl, 0.22, caseY0 + 0.32 * k, -hl, 0.21, caseY0 + 0.32 * k, caseZ1 - 0.02, -0.21, caseY0 + 0.32 * k, caseZ1 - 0.02,
    ]);
    g.smooth(from, 50);
    // garde-boue et support de plaque
    g.paint(COL.plastic, SURF_FIXED).prism([zR - rR * 0.2, rR * 2 + 0.03, zR - rR - 0.1, rR * 1.5, zR - rR - 0.12, rR * 1.5 + 0.02, zR - rR * 0.2, rR * 2 + 0.06], -0.08, 0.08);
    plate(g, false, rR * 1.55, zR - rR - 0.125, 'B', 0.21, 0.13);
    lamp(g, 0.13, seatY - 0.05, -hl + 0.31 * k, [-1, 0, 0], [0, 1, 0], 0.05, 0.03, COL.amber, LIGHT_IND_L);
    lamp(g, -0.13, seatY - 0.05, -hl + 0.31 * k, [-1, 0, 0], [0, 1, 0], 0.05, 0.03, COL.amber, LIGHT_IND_R);
    // repose-pieds
    g.paint(0x8d9299, SURF_METAL);
    g.mirror(() => { g.tube(0.12, 0.36 * k, -0.2 * k, 0.26, 0.36 * k, -0.2 * k, 0.014, 0.014, 5); g.tube(0.12, 0.5 * k, -0.52 * k, 0.24, 0.5 * k, -0.52 * k, 0.014, 0.014, 5); });
  }
  lamp(g, 0, seatY - 0.02, -hl + 0.295 * k - (far ? 0.3 : 0), [-1, 0, 0], [0, 1, 0], 0.12, 0.04, COL.redLens, LIGHT_TAIL);
  lampBox(g, -0.05, 0.05, caseY0 + 0.32 * k, caseY0 + 0.32 * k + 0.04, -hl + 0.02, -hl + 0.08, COL.blueLens, LIGHT_BEACON_A);
  meta.tail.push(0, seatY - 0.02, -hl + 0.3 * k);
  meta.beaconA.push(0, caseY0 + 0.36 * k, -hl + 0.05);
  body();

  meta.wheelRadius = rF;
  meta.fire = [0, 0.7 * k, 0];
  meta.cockpit = 'bike';
  meta.beltY = headY + 0.13 * k; meta.hoodY = 1.04 * k; meta.roofY = H; meta.cowlZ = noseZ; meta.halfWidth = W / 2;
  meta.sag = rF * 0.2;
  return meta;
}

export function buildScooter(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2, k = L / 1.9;
  const meta = emptyMeta(def);
  const r = 0.23 * k;
  const zF = hl - r - 0.01;
  const zR = Math.max(-hl + r + 0.12, zF - def.wheelbase);
  const headY = r + 0.6 * k, headZ = zF + ((headY - r) / FORK_AXIS_Y) * FORK_AXIS_Z;
  const f: BikeFrame = { rF: r, rR: r, zF, zR, headY, headZ };
  const body = (): void => { g.body(); };
  g.noPart().tile(null);
  bikeWheel(g, far, zF, r, 0.11 * k, PART_BIKE_WHEEL, 1);
  bikeWheel(g, far, zR, r, 0.13 * k, 0, 1);
  const barY = Math.min(H - 0.2, headY + 0.2 * k);
  forkAssembly(g, far, f, barY, headZ - 0.04, W / 2 - 0.005, body, false);

  // tablier avant, plancher, coque sous selle
  body();
  const apZ = headZ + 0.1;
  const from = g.mark();
  g.prism([apZ + 0.12, 0.24 * k, apZ + 0.16, headY - 0.1, apZ + 0.02, headY + 0.08, apZ - 0.1, headY + 0.04, apZ - 0.08, 0.26 * k], -0.2, 0.2);
  if (!far) g.smooth(from, 40);
  g.paint(COL.plastic, SURF_FIXED).box(-0.19, 0.19, 0.16 * k, 0.25 * k, zR + 0.38 * k, apZ + 0.1);
  const seatY = 0.76 * k;
  const st: Station[] = [
    { z: -hl + 0.02, w: 0.1, y0: 0.5 * k, y1: seatY - 0.12, round: 0.04, tuck: 0.03 },
    { z: zR - 0.05, w: 0.18, y0: 0.34 * k, y1: seatY - 0.06, round: 0.05, tuck: 0.04 },
    { z: zR + 0.45 * k, w: 0.18, y0: 0.24 * k, y1: seatY - 0.06, round: 0.05, tuck: 0.04 },
    { z: zR + 0.58 * k, w: 0.15, y0: 0.24 * k, y1: seatY - 0.2, round: 0.04, tuck: 0.03 },
  ];
  shell(g, far, far ? [st[0]!, st[1]!, st[3]!] : st, body);
  g.paint(0x101113, SURF_FIXED).box(-0.15, 0.15, seatY - 0.06, seatY, zR - 0.12, zR + 0.52 * k, 1);
  lamp(g, 0, headY - 0.02, apZ + 0.15, [1, 0, 0], [0, 1, 0], 0.14, 0.1, COL.headLens, LIGHT_HEAD);
  lamp(g, 0, seatY - 0.2, -hl + 0.012, [-1, 0, 0], [0, 1, 0], 0.12, 0.05, COL.redLens, LIGHT_TAIL);
  if (!far) {
    lamp(g, 0.16, headY - 0.14, apZ + 0.14, [1, 0, 0], [0, 1, 0], 0.05, 0.04, COL.amber, LIGHT_IND_L);
    lamp(g, -0.16, headY - 0.14, apZ + 0.14, [1, 0, 0], [0, 1, 0], 0.05, 0.04, COL.amber, LIGHT_IND_R);
    plate(g, false, 0.42 * k, -hl + 0.005, 'B', 0.21, 0.13);
    // poignée de maintien et béquille
    g.paint(0x8d9299, SURF_METAL);
    pipe(g, [0.12, seatY - 0.03, zR - 0.05, 0.12, seatY + 0.03, -hl + 0.06, -0.12, seatY + 0.03, -hl + 0.06, -0.12, seatY - 0.03, zR - 0.05], 0.012, 5);
  }
  body();
  meta.head.push(0, headY - 0.02, apZ + 0.15);
  meta.tail.push(0, seatY - 0.2, -hl);
  meta.wheelRadius = r;
  meta.fire = [0, 0.5 * k, 0];
  meta.cockpit = 'bike';
  meta.beltY = barY; meta.hoodY = headY; meta.roofY = H; meta.cowlZ = apZ; meta.halfWidth = W / 2;
  meta.sag = r * 0.2;
  return meta;
}

export function buildDrone(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const meta = emptyMeta(def);
  const hl = L / 2, hw = W / 2;
  const body = (): void => { g.body(); };
  g.noPart().tile(null);
  const y0 = H * 0.3, y1 = H * 0.78;
  shell(g, far, [
    { z: -hl * 0.55, w: hw * 0.3, y0: y0 + H * 0.05, y1: y1 - H * 0.05, round: H * 0.1, tuck: H * 0.08 },
    { z: -hl * 0.3, w: hw * 0.36, y0, y1, round: H * 0.12, tuck: H * 0.1 },
    { z: hl * 0.4, w: hw * 0.36, y0, y1, round: H * 0.12, tuck: H * 0.1 },
    { z: hl * 0.6, w: hw * 0.26, y0: y0 + H * 0.06, y1: y1 - H * 0.1, round: H * 0.1, tuck: H * 0.08 },
  ], body);
  const mx = hw * 0.86, mz = hl * 0.78, my = H * 0.7;
  const rp = Math.min(hw, hl) * 0.42;
  let i = 0;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = mx * sx, z = mz * sz;
      g.noPart().paint(0x2a2c30, SURF_FIXED);
      // bras et moteur
      g.tube(hw * 0.3 * sx, H * 0.55, hl * 0.25 * sz, x, my - H * 0.12, z, H * 0.07, H * 0.06, far ? 4 : 6, false, false);
      g.tube(x, my - H * 0.22, z, x, my, z, H * 0.1, H * 0.1, far ? 5 : 8);
      if (!far) g.tube(x, 0, z, x, my - H * 0.22, z, H * 0.03, H * 0.04, 4, true, false);
      // hélice bipale
      g.part(PART_ROTOR, x, my, z, (i % 2 === 0 ? 1 : -1) * (1 + i * 0.07));
      g.paint(0x1a1b1e, SURF_FIXED);
      g.box(x - rp, x + rp, my + H * 0.02, my + H * 0.045, z - rp * 0.1, z + rp * 0.1);
      if (!far) g.box(x - rp * 0.1, x + rp * 0.1, my + H * 0.02, my + H * 0.045, z - rp, z + rp);
      g.noPart();
      i++;
    }
  }
  // nacelle caméra sous le nez, feux
  g.paint(0x18191c, SURF_FIXED);
  if (far) g.cube(0, H * 0.2, hl * 0.5, hw * 0.24, H * 0.3, hw * 0.24);
  else {
    g.ball(0, H * 0.2, hl * 0.5, H * 0.17, 8, 2);
    g.paint(0xffffff, SURF_FIXED).tile(tile('optique')).panel(0, H * 0.2, hl * 0.5 + H * 0.175, [1, 0, 0], [0, 1, 0], H * 0.24, H * 0.24).tile(null);
  }
  lampBox(g, -hw * 0.2, hw * 0.2, y1 - H * 0.2, y1 - H * 0.1, hl * 0.6, hl * 0.62, 0xe8ffe8, LIGHT_HEAD);
  lampBox(g, -hw * 0.2, hw * 0.2, y1 - H * 0.2, y1 - H * 0.1, -hl * 0.57, -hl * 0.55, COL.redLens, LIGHT_TAIL);
  lampBox(g, -hw * 0.06, hw * 0.06, y1, y1 + H * 0.06, -hl * 0.1, hl * 0.02, COL.blueLens, LIGHT_BEACON_A);
  body();
  meta.head.push(0, y1 - H * 0.15, hl * 0.62);
  meta.tail.push(0, y1 - H * 0.15, -hl * 0.57);
  meta.beaconA.push(0, y1 + H * 0.05, 0);
  meta.rotor = true;
  meta.wheelRadius = 0;
  meta.fire = [0, H * 0.5, 0];
  meta.cockpit = 'none';
  meta.sag = 0;
  return meta;
}

export function buildHelico(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const meta = emptyMeta(def);
  const hl = L / 2, k = H / 3.5;
  const cw = Math.min(W / 2 - 0.12, 0.95 * k);          // demi-largeur de cabine
  const body = (): void => { g.body(); };
  g.noPart().tile(null);
  const belly = 0.55 * k, roof = 2.3 * k;
  const zNose = hl, zCab0 = hl - L * 0.4;               // la cabine occupe les 40 % avant
  // ── fuselage ──
  const st: Station[] = [
    { z: -hl + 0.15, w: 0.1, y0: 1.82 * k, y1: 2.12 * k, round: 0.06, tuck: 0.06 },
    { z: zCab0 - L * 0.12, w: 0.2 * k, y0: 1.5 * k, y1: 2.15 * k, round: 0.12, tuck: 0.12 },
    { z: zCab0, w: cw * 0.86, y0: belly + 0.12, y1: roof, round: 0.4 * k, tuck: 0.3 * k },
    { z: zNose - 1.9 * k, w: cw, y0: belly, y1: roof, round: 0.42 * k, tuck: 0.32 * k },
    { z: zNose - 0.75 * k, w: cw * 0.9, y0: belly + 0.05, y1: roof - 0.5 * k, round: 0.45 * k, tuck: 0.32 * k },
    { z: zNose - 0.12 * k, w: cw * 0.45, y0: belly + 0.35 * k, y1: 1.45 * k, round: 0.25 * k, tuck: 0.2 * k },
    { z: zNose, w: cw * 0.15, y0: 0.95 * k, y1: 1.2 * k, round: 0.08 * k, tuck: 0.06 * k },
  ];
  shell(g, far, far ? [st[0]!, st[1]!, st[2]!, st[3]!, st[4]!, st[6]!] : st, body, true, true, 50);
  // verrière : pare-brise bombé et vitres latérales, plaqués sur la coque
  g.paint(0x1a2836, SURF_GLASS).tile(tile('verre'));
  if (far) {
    g.face([-cw * 0.8, 1.5 * k, zNose - 0.5 * k, cw * 0.8, 1.5 * k, zNose - 0.5 * k, cw * 0.7, roof - 0.15, zNose - 1.6 * k, -cw * 0.7, roof - 0.15, zNose - 1.6 * k], null, [0, 0.5, 1]);
  } else {
    for (const s of [1, -1] as const) {
      patch(g, st[3]!, st[4]!, EDGE_SHOULDER, 0.05, 0.98, 0.05, 0.98, s, 0.015);
      patch(g, st[3]!, st[4]!, EDGE_TOP, 0.25, 0.98, 0.0, 0.85, s, 0.015);
      patch(g, st[4]!, st[5]!, EDGE_SHOULDER, 0.02, 0.9, 0.05, 0.98, s, 0.015);
      patch(g, st[4]!, st[5]!, EDGE_TOP, 0.02, 0.9, 0.0, 0.85, s, 0.015);
      patch(g, st[3]!, st[4]!, EDGE_SIDE, 0.08, 0.95, 0.45, 0.98, s, 0.015);
      patch(g, st[4]!, st[5]!, EDGE_SIDE, 0.05, 0.85, 0.5, 0.98, s, 0.015);
      // porte arrière de cabine
      patch(g, st[2]!, st[3]!, EDGE_SIDE, 0.35, 0.92, 0.5, 0.95, s, 0.015);
    }
  }
  g.tile(null);
  // capot des turbines, mât, rotor principal
  const mastZ = zNose - 2.6 * k, rotorY = H - 0.22 * k;
  body();
  if (far) g.box(-cw * 0.5, cw * 0.5, roof, roof + 0.45 * k, mastZ - 1.6 * k, mastZ + 0.6 * k, 1);
  else {
    const from = g.mark();
    g.hexa([
      -cw * 0.62, roof - 0.05, mastZ - 1.9 * k, cw * 0.62, roof - 0.05, mastZ - 1.9 * k, cw * 0.62, roof - 0.05, mastZ + 0.9 * k, -cw * 0.62, roof - 0.05, mastZ + 0.9 * k,
      -cw * 0.4, roof + 0.5 * k, mastZ - 1.4 * k, cw * 0.4, roof + 0.5 * k, mastZ - 1.4 * k, cw * 0.4, roof + 0.42 * k, mastZ + 0.4 * k, -cw * 0.4, roof + 0.42 * k, mastZ + 0.4 * k,
    ], 1);
    g.smooth(from, 50);
    // tuyères
    g.paint(0x3a3d42, SURF_METAL);
    g.mirror(() => { g.tube(cw * 0.35, roof + 0.25 * k, mastZ - 1.5 * k, cw * 0.45, roof + 0.3 * k, mastZ - 2.1 * k, 0.12 * k, 0.1 * k, 8, false, true); });
  }
  g.paint(0x2a2c30, SURF_METAL).tube(0, roof + 0.4 * k, mastZ, 0, rotorY, mastZ, 0.07 * k, 0.06 * k, far ? 5 : 8, false, false);
  g.part(PART_ROTOR, 0, rotorY, mastZ, 1);
  g.paint(0x2a2c30, SURF_METAL).tube(0, rotorY - 0.04, mastZ, 0, rotorY + 0.1 * k, mastZ, 0.16 * k, 0.12 * k, far ? 5 : 8);
  const R = 5.1 * k;
  g.paint(0x1c1d20, SURF_FIXED);
  for (let i = 0; i < 4; i++) {
    g.push().translate(0, rotorY, mastZ).rotY((i * Math.PI) / 2);
    g.box(-0.14 * k, 0.14 * k, 0.03, 0.06, 0.3 * k, R);
    if (!far) g.paint(0xd8c020, SURF_FIXED).box(-0.14 * k, 0.14 * k, 0.03, 0.061, R - 0.25 * k, R).paint(0x1c1d20, SURF_FIXED);
    g.pop();
  }
  g.noPart();
  // ── poutre de queue, dérive, rotor anticouple caréné, empennage ──
  const zTail = -hl + 0.15;
  body();
  const finTop = H - 0.05 * k;
  g.prism([zTail + 1.1 * k, 1.75 * k, zTail + 0.25 * k, finTop, zTail - 0.15, finTop, zTail - 0.1, 1.3 * k, zTail + 0.75 * k, 1.25 * k], -0.06, 0.06);
  const fy = 1.95 * k, fz = zTail + 0.42 * k, fr = 0.42 * k;
  g.paint(0x10131a, SURF_DARK);
  if (!far) {
    for (const s of [1, -1]) g.tube(0.062 * s, fy, fz, 0.066 * s, fy, fz, fr, fr, 12, false, true);
    g.part(PART_ROTOR_X, 0, fy, fz, 3.1);
    g.paint(0x8d9299, SURF_METAL);
    for (let i = 0; i < 3; i++) {
      g.push().translate(0, fy, fz).rotX((i * Math.PI) / 3);
      g.box(-0.075, 0.075, -0.03, 0.03, -fr * 0.9, fr * 0.9);
      g.pop();
    }
    g.noPart();
  }
  body();
  g.box(-1.1 * k, 1.1 * k, 1.92 * k, 1.97 * k, zTail + 1.5 * k, zTail + 2.0 * k);
  if (!far) g.mirror(() => { g.box(1.06 * k, 1.1 * k, 1.7 * k, 2.2 * k, zTail + 1.45 * k, zTail + 2.05 * k); });
  // ── patins ──
  g.paint(0x2a2c30, SURF_METAL);
  const skidX = Math.min(W / 2 - 0.04, cw + 0.12);
  g.mirror(() => {
    g.tube(skidX, 0.04, zCab0 - 0.2, skidX, 0.04, zNose - 0.9 * k, 0.04, 0.04, far ? 4 : 6);
    if (!far) {
      g.tube(skidX, 0.04, zNose - 0.9 * k, skidX, 0.22, zNose - 0.55 * k, 0.04, 0.03, 6, false, true);
      g.tube(skidX, 0.04, zCab0 + 0.3, cw * 0.55, belly + 0.1, zCab0 + 0.3, 0.035, 0.035, 5, false, false);
      g.tube(skidX, 0.04, zNose - 1.5 * k, cw * 0.55, belly + 0.05, zNose - 1.5 * k, 0.035, 0.035, 5, false, false);
    } else {
      g.tube(skidX, 0.04, zCab0 + 1.0, cw * 0.55, belly + 0.1, zCab0 + 1.0, 0.035, 0.035, 4, false, false);
    }
  });
  // ── caméra gyrostabilisée, projecteur, feux, marquage ──
  if (!far) {
    g.paint(0x18191c, SURF_FIXED).ball(cw * 0.55, belly - 0.05, zNose - 1.0 * k, 0.2 * k, 10, 3);
    g.paint(0xffffff, SURF_FIXED).tile(tile('optique')).panel(cw * 0.55, belly - 0.05, zNose - 1.0 * k + 0.202 * k, [1, 0, 0], [0, 1, 0], 0.2 * k, 0.2 * k).tile(null);
    g.paint(COL.plastic, SURF_FIXED).tube(-cw * 0.6, belly - 0.02, zNose - 1.4 * k, -cw * 0.6, belly - 0.02, zNose - 1.1 * k, 0.16 * k, 0.18 * k, 10, true, false);
    g.paint(COL.headLens, SURF_LAMP).light(LIGHT_HEAD).tube(-cw * 0.6, belly - 0.02, zNose - 1.1 * k, -cw * 0.6, belly - 0.02, zNose - 1.095 * k, 0.18 * k, 0.18 * k, 10, false, true);
    g.light(LIGHT_NONE);
  }
  lampBox(g, -0.05, 0.05, finTop, finTop + 0.06, zTail, zTail + 0.1, 0xff2a20, LIGHT_BEACON_A);
  lampBox(g, -0.05, 0.05, belly - 0.06, belly, zCab0 + 0.6, zCab0 + 0.7, 0xff2a20, LIGHT_BEACON_B);
  lampBox(g, cw - 0.02, cw + 0.03, 1.3 * k, 1.36 * k, zCab0 + 1.0, zCab0 + 1.08, 0xff2a20, LIGHT_TAIL);
  lampBox(g, -cw - 0.03, -cw + 0.02, 1.3 * k, 1.36 * k, zCab0 + 1.0, zCab0 + 1.08, 0x30ff60, LIGHT_TAIL);
  const markH = 0.19 * k;
  const markZ = zCab0 - L * 0.12 - markH * 3.5 - 0.15;
  decal(g, 'gendarmerie', 'L', 0.2 * k + 0.012, 1.86 * k, markZ, markH);
  decal(g, 'gendarmerie', 'R', -0.2 * k - 0.012, 1.86 * k, markZ, markH);
  body();
  meta.head.push(-cw * 0.6, belly, zNose - 1.1 * k);
  meta.tail.push(0, 2.0 * k, zTail);
  meta.beaconA.push(0, finTop + 0.06, zTail);
  meta.beaconB.push(0, belly - 0.06, zCab0 + 0.65);
  meta.rotor = true;
  meta.wheelRadius = 0;
  meta.fire = [0, 1.5 * k, zNose - 2 * k, 0, 2.4 * k, mastZ];
  meta.cockpit = 'none';
  meta.sag = 0;
  return meta;
}
