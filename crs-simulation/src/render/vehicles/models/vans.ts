/* Fourgons : fourgon de CRS, véhicule de commandement, fourgon cellulaire, ambulance du SAMU, utilitaire civil. */

import type { VehicleDef } from '@/core/contracts';
import {
  LIGHT_BEACON_A, LIGHT_BEACON_B, LIGHT_BRAKE, LIGHT_HEAD, LIGHT_IND_L, LIGHT_IND_R, LIGHT_NONE, LIGHT_REVERSE, LIGHT_TAIL,
  SURF_FIXED, SURF_LAMP, SURF_METAL,
} from '../geo';
import type { Geo } from '../geo';
import {
  COL, EDGE_SIDE, antenna, arch, beacon, bumper, cabin, decal, decalFree, door, grille, lamp, lightbar, patch, plate,
  policeBand, rearDoors, shell, sideMirror, wheel,
} from '../kit';
import type { CabinSpec, Station } from '../kit';
import { emptyMeta } from './types';
import type { ModelMeta } from './types';

export interface VanStyle {
  /** Vitres latérales par côté derrière les portes avant (la porte coulissante en porte une). */
  windows: number;
  windowKind: 'glass' | 'grille' | 'frost';
  /** Petites vitres hautes grillagées à la place des vitres normales (cellules). */
  slits?: boolean;
  slideDoor: boolean;
  rearWindow: 'glass' | 'grille' | 'none';
  livery: 'none' | 'police' | 'samu';
  lightbar: boolean;
  grilleFront: boolean;
  antennas: number;
  roofBox?: boolean;
  awning?: boolean;
  rearBeacons?: boolean;
}

export const VAN_STYLES: Readonly<Record<string, VanStyle>> = {
  fourgon_crs: { windows: 2, windowKind: 'grille', slideDoor: true, rearWindow: 'grille', livery: 'police', lightbar: true, grilleFront: true, antennas: 1 },
  vl_commandement: { windows: 1, windowKind: 'glass', slideDoor: true, rearWindow: 'none', livery: 'police', lightbar: true, grilleFront: false, antennas: 4, roofBox: true, awning: true },
  fourgon_cellulaire: { windows: 3, windowKind: 'grille', slits: true, slideDoor: false, rearWindow: 'grille', livery: 'police', lightbar: true, grilleFront: false, antennas: 1 },
  ambulance: { windows: 2, windowKind: 'frost', slideDoor: true, rearWindow: 'glass', livery: 'samu', lightbar: true, grilleFront: false, antennas: 1, rearBeacons: true },
  utilitaire: { windows: 0, windowKind: 'glass', slideDoor: true, rearWindow: 'glass', livery: 'none', lightbar: false, grilleFront: false, antennas: 0 },
};

export function buildVan(g: Geo, far: boolean, def: VehicleDef, st: VanStyle): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2, hw = W / 2 - 0.02;
  const gc = 0.2;
  const r = Math.min(0.39, Math.max(0.33, H * 0.145));
  const ww = 0.24;
  const yBelt = gc + Math.min(1.08, (H - gc) * 0.46);
  const yCab = Math.min(H, gc + 1.82);
  const highRoof = H - yCab > 0.12;
  const zA = hl - 0.6;
  const zB = zA - 0.5;
  const zD = -hl + 0.02, zC = -hl + 0.05;
  const yN1 = yBelt - 0.17, yN2 = yBelt - 0.36;
  const over = L - def.wheelbase;
  const zF = hl - over * 0.43, zR = zF - def.wheelbase;
  const body = (): void => { g.body(); };
  const meta = emptyMeta(def);

  // ── caisse basse ──
  const stations: Station[] = [
    { z: -hl, w: hw * 0.975, y0: gc + 0.14, y1: yBelt, round: 0.02 },
    { z: -hl + 0.1, w: hw, y0: gc, y1: yBelt, round: 0.02 },
    { z: zA, w: hw, y0: gc, y1: yBelt, round: 0.02 },
    { z: hl - 0.3, w: hw * 0.99, y0: gc, y1: yN1 },
    { z: hl - 0.08, w: hw * 0.95, y0: gc + 0.03, y1: yN2 },
    { z: hl, w: hw * 0.85, y0: gc + 0.19, y1: yN2 - 0.2, round: 0.05, tuck: 0.04 },
  ];
  shell(g, far, far ? [stations[0]!, stations[2]!, stations[3]!, stations[5]!] : stations, body);

  // ── cabine et caisse haute ──
  const wBelt = hw - 0.018, wCab = hw - 0.085;
  const cab: CabinSpec = {
    zA, zB, zC, zD, yBelt, yRoof: yCab, wBelt, wRoof: wCab, cap: highRoof ? 0.012 : 0.06,
    rearGlass: false, grilleFront: st.grilleFront, side: [],
  };
  // répartition des vitres latérales entre la porte avant et l'arrière
  const fd0 = zA - 1.1, fd1 = zA - 0.04;
  const bayStart = fd0 - 0.1;
  const bayLen = 1.12;
  const slideZ1 = bayStart, slideZ0 = bayStart - bayLen;
  const wins: { z0: number; z1: number }[] = [];
  for (let i = 0; i < st.windows; i++) {
    const z1 = bayStart - i * (bayLen + 0.08) - 0.06;
    const z0 = z1 - bayLen + 0.12;
    if (z0 > -hl + 0.5) wins.push({ z0, z1 });
  }
  const t0 = st.slits ? 0.5 : 0.1, t1 = st.slits ? 0.82 : 0.9;
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i]!;
    // la première baie du côté droit appartient à la porte coulissante
    if (i === 0 && st.slideDoor) cab.side.push({ z0: w.z0, z1: w.z1, kind: st.windowKind, side: 'L', t0, t1 });
    else cab.side.push({ z0: w.z0, z1: w.z1, kind: st.windowKind, t0, t1 });
  }
  if (far) cab.side.push({ z0: wins.length ? wins[wins.length - 1]!.z0 : fd0, z1: zA });
  cabin(g, far, cab, body);
  if (highRoof) {
    const from = g.mark();
    body();
    const wTop = wCab - 0.07;
    g.hexa([
      -wCab, yCab - 0.012, zC, wCab, yCab - 0.012, zC, wCab, yCab - 0.012, zB, -wCab, yCab - 0.012, zB,
      -wTop, H, zC + 0.05, wTop, H, zC + 0.05, wTop, H, zB - 0.42, -wTop, H, zB - 0.42,
    ], 1);
    if (!far) g.smooth(from, 45);
  }

  // ── portes ──
  const sill = gc + 0.1;
  const notch = { z: zF - r * 1.22, y: r * 2.3 };
  const bandY = yBelt - 0.21, bandH = 0.17, bandFront = fd1 - 0.02;
  const frontExtra = (side: 'L' | 'R') => (x: number): void => {
    if (st.livery === 'police') policeBand(g, side, x, bandY, fd0 + 0.02, fd1 - 0.02, bandH, bandFront);
    if (st.livery === 'samu') { g.paint(COL.samuBlue, SURF_FIXED); g.panel(x, bandY, (fd0 + fd1) / 2, side === 'L' ? [0, 0, -1] : [0, 0, 1], [0, 1, 0], fd1 - fd0 - 0.04, bandH); }
  };
  door(g, far, { index: 0, side: 'L', z0: fd0, z1: fd1, y0: sill, y1: yBelt, hw, window: 'glass', notch, extra: frontExtra('L') }, cab, body);
  door(g, far, { index: 1, side: 'R', z0: fd0, z1: fd1, y0: sill, y1: yBelt, hw, window: 'glass', notch, extra: frontExtra('R') }, cab, body);
  meta.doors.push({ index: 0, x: hw, z: (fd0 + fd1) / 2 }, { index: 1, x: -hw, z: (fd0 + fd1) / 2 });
  if (st.slideDoor) {
    const hasWin = wins.length > 0;
    door(g, far, {
      index: 3, side: 'R', z0: slideZ0, z1: slideZ1, y0: sill, y1: yBelt, hw, slide: true,
      window: hasWin ? st.windowKind : false, t0, t1,
      extra: (x: number): void => {
        if (st.livery === 'police') policeBand(g, 'R', x, bandY, slideZ0 + 0.02, slideZ1 - 0.02, bandH, bandFront);
        if (st.livery === 'samu') { g.paint(COL.samuBlue, SURF_FIXED); g.panel(x, bandY, (slideZ0 + slideZ1) / 2, [0, 0, 1], [0, 1, 0], slideZ1 - slideZ0 - 0.04, bandH); }
      },
    }, cab, body);
    meta.doors.push({ index: 3, x: -hw, z: (slideZ0 + slideZ1) / 2 });
    if (!far) {
      // rail de la porte coulissante
      g.paint(COL.plastic, SURF_FIXED).box(-hw - 0.012, -hw - 0.004, yBelt - 0.035, yBelt - 0.015, slideZ0 - bayLen * 0.9, slideZ0);
    }
  }
  const rearText = st.livery === 'police' ? { name: 'police' as const, y: yBelt - 0.12, h: 0.24 }
    : st.livery === 'samu' ? { name: 'chevrons' as const, y: gc + 0.25 + (yBelt - gc - 0.25) * 0.45, h: (yBelt - gc - 0.25) * 0.8 } : undefined;
  rearDoors(g, far, 2, hw * 0.93, gc + 0.25, yCab - 0.08, -hl, body, st.rearWindow, rearText);
  meta.doors.push({ index: 2, x: 0, z: -hl });

  // ── sérigraphie fixe ──
  if (st.livery === 'police') {
    const xs = hw + 0.012;
    const rear0 = -hl + 0.12;
    const segEndL = fd0 - 0.02, segEndR = st.slideDoor ? slideZ0 - 0.02 : fd0 - 0.02;
    if (!far) {
      policeBand(g, 'L', xs, bandY, rear0, segEndL, bandH, bandFront);
      policeBand(g, 'R', -xs, bandY, rear0, segEndR, bandH, bandFront);
    } else {
      g.paint(COL.policeBlue, SURF_FIXED);
      g.mirror(() => { g.face([xs, bandY - bandH / 2, rear0, xs, bandY - bandH / 2, fd1, xs, bandY + bandH / 2, fd1, xs, bandY + bandH / 2, rear0], null, [1, 0, 0]); });
    }
    // « POLICE » sur le panneau arrière de chaque flanc, au-dessus de la ceinture
    const panelZ = (rear0 + (wins.length ? wins[wins.length - 1]!.z0 : slideZ0)) / 2;
    const panelLen = (wins.length ? wins[wins.length - 1]!.z0 : slideZ0) - rear0;
    const th = Math.min(0.34, panelLen / 4.6);
    const ty = st.slits ? yBelt + (yCab - yBelt) * 0.25 : yBelt + (yCab - yBelt) * 0.5;
    const tx = wBelt + (wCab - wBelt) * ((ty - yBelt) / (yCab - yBelt)) + 0.016;
    if (panelLen > 0.9 || st.slits) {
      decal(g, 'police', 'L', tx, ty, st.slits ? (rear0 + fd0) / 2 : panelZ, st.slits ? 0.3 : th);
      decal(g, 'police', 'R', -tx, ty, st.slits ? (rear0 + slideZ0) / 2 - 0.2 : panelZ, st.slits ? 0.3 : th);
    } else if (!far) {
      decal(g, 'police', 'L', xs, bandY - 0.3, panelZ, 0.2);
      decal(g, 'police', 'R', -xs, bandY - 0.3, panelZ, 0.2);
    }
    // capot
    const slope = Math.atan2(yN1 - yN2, 0.22);
    decalFree(g, 'police', 0, (yN1 + yN2) / 2 + 0.03, hl - 0.19, [1, 0, 0], [0, Math.sin(slope), -Math.cos(slope)], 0.17);
  } else if (st.livery === 'samu') {
    const xs = hw + 0.012;
    const rear0 = -hl + 0.12;
    g.paint(COL.samuBlue, SURF_FIXED);
    const segEndR = st.slideDoor ? slideZ0 - 0.02 : fd0 - 0.02;
    g.face([xs, bandY - bandH / 2, rear0, xs, bandY - bandH / 2, far ? fd1 : fd0 - 0.02, xs, bandY + bandH / 2, far ? fd1 : fd0 - 0.02, xs, bandY + bandH / 2, rear0], null, [1, 0, 0]);
    g.face([-xs, bandY - bandH / 2, rear0, -xs, bandY - bandH / 2, far ? fd1 : segEndR, -xs, bandY + bandH / 2, far ? fd1 : segEndR, -xs, bandY + bandH / 2, rear0], null, [-1, 0, 0]);
    const ty = yBelt + (yCab - yBelt) * 0.5;
    const tx = wBelt + (wCab - wBelt) * 0.5 + 0.016;
    const tz = -hl + 0.85;
    decal(g, 'samu', 'L', tx, ty, tz, 0.42);
    decal(g, 'samu', 'R', -tx, ty, tz, 0.42);
    if (!far) {
      const slope = Math.atan2(yN1 - yN2, 0.22);
      decalFree(g, 'ambulance', 0, (yN1 + yN2) / 2 + 0.03, hl - 0.19, [1, 0, 0], [0, Math.sin(slope), -Math.cos(slope)], 0.13);
      // damier jaune de bas de caisse
      decal(g, 'damier', 'L', xs, sill + 0.14, (rear0 + fd0) / 2, 0.16, fd0 - rear0 - 0.1);
      decal(g, 'damier', 'R', -xs, sill + 0.14, (rear0 + segEndR) / 2, 0.16, segEndR - rear0 - 0.1);
    }
  }

  // ── roues ──
  g.mirror(() => {
    wheel(g, far, W / 2, zF, r, ww, 'tole', true);
    wheel(g, far, W / 2, zR, r, ww, 'tole', false);
    arch(g, far, hw + 0.004, zF, r, gc);
    arch(g, far, hw + 0.004, zR, r, gc);
  });

  // ── face avant ──
  const s4 = stations[4]!, s5 = stations[5]!;
  const capY0 = s5.y0 + 0.04, capY1 = s5.y1 - 0.05;
  const fz = hl + 0.006;
  if (!far) {
    grille(g, false, capY0 + (capY1 - capY0) * 0.62, fz, hw * 0.8, (capY1 - capY0) * 0.6);
    plate(g, false, capY0 + 0.06, fz + 0.004, 'F');
    bumper(g, false, hw * 0.95, gc + 0.05, gc + 0.185, hl - 0.075, 0.12, 0x33363b);
  }
  g.mirror(() => {
    lamp(g, hw * 0.66, capY1 - 0.07, fz, [1, 0, 0], [0, 1, 0], hw * 0.32, 0.13, COL.headLens, LIGHT_HEAD, far ? 0 : 0.018);
    if (!far) {
      g.paint(COL.headLens, SURF_LAMP).light(LIGHT_HEAD); patch(g, s4, s5, EDGE_SIDE, 0.1, 0.96, 0.6, 0.96, 1);
      g.light(LIGHT_NONE);
    }
  });
  if (!far) {
    g.paint(COL.amber, SURF_LAMP).light(LIGHT_IND_L); patch(g, s4, s5, EDGE_SIDE, 0.15, 0.9, 0.42, 0.56, 1);
    g.light(LIGHT_IND_R); patch(g, s4, s5, EDGE_SIDE, 0.15, 0.9, 0.42, 0.56, -1);
    g.light(LIGHT_NONE);
  }
  meta.head.push(hw * 0.66, capY1 - 0.07, hl, -hw * 0.66, capY1 - 0.07, hl);

  // ── face arrière : feux verticaux de part et d'autre des portes ──
  const rz = -hl - 0.024;
  const lx = hw * 0.965;
  g.mirror(() => {
    lamp(g, lx, yBelt - 0.18, rz, [-1, 0, 0], [0, 1, 0], 0.085, 0.3, COL.redLens, LIGHT_TAIL);
    if (!far) {
      lamp(g, lx, yBelt - 0.42, rz, [-1, 0, 0], [0, 1, 0], 0.085, 0.12, 0xe9ecef, LIGHT_REVERSE);
    }
  });
  if (!far) {
    lamp(g, lx, yBelt + 0.04, rz, [-1, 0, 0], [0, 1, 0], 0.085, 0.1, COL.amber, LIGHT_IND_L);
    lamp(g, -lx, yBelt + 0.04, rz, [-1, 0, 0], [0, 1, 0], 0.085, 0.1, COL.amber, LIGHT_IND_R);
    lamp(g, 0, yCab - 0.04, rz + 0.01, [-1, 0, 0], [0, 1, 0], 0.4, 0.03, COL.redLens, LIGHT_BRAKE);
    plate(g, false, gc + 0.33, rz - 0.004, 'B');
    bumper(g, false, hw * 0.96, gc + 0.03, gc + 0.2, -hl + 0.05, 0.12);
    // marchepied arrière
    g.paint(COL.steel, SURF_METAL).box(-hw * 0.7, hw * 0.7, gc + 0.02, gc + 0.05, -hl - 0.14, -hl - 0.02);
  }
  meta.tail.push(lx, yBelt - 0.18, -hl, -lx, yBelt - 0.18, -hl);

  // ── équipements ──
  g.mirror(() => { sideMirror(g, far, hw - 0.01, yBelt + 0.12, zA - 0.2, 0.24, () => g.paint(COL.plastic, SURF_FIXED)); });
  const roofFrontZ = highRoof ? zB - 0.42 : zB;
  if (st.lightbar) {
    const by = (highRoof ? H : yCab) + (far ? 0 : 0.03), bz = roofFrontZ - 0.35;
    lightbar(g, far, by, bz, Math.min(1.35, W * 0.66));
    meta.beaconA.push(0.42, by + 0.08, bz);
    meta.beaconB.push(-0.42, by + 0.08, bz);
  }
  if (st.rearBeacons) {
    const by = highRoof ? H : yCab;
    beacon(g, far, hw - 0.3, by, -hl + 0.3, LIGHT_BEACON_A);
    beacon(g, far, -(hw - 0.3), by, -hl + 0.3, LIGHT_BEACON_B);
    meta.beaconA.push(hw - 0.3, by + 0.1, -hl + 0.3);
    meta.beaconB.push(-(hw - 0.3), by + 0.1, -hl + 0.3);
  }
  if (!far) {
    const top = highRoof ? H : yCab;
    for (let i = 0; i < st.antennas; i++) {
      const ax = st.antennas === 1 ? hw * 0.5 : (i % 2 === 0 ? 1 : -1) * hw * 0.55;
      const az = st.antennas === 1 ? -hl + 1.0 : -hl + 0.7 + Math.floor(i / 2) * 1.5;
      antenna(g, false, ax, top, az, st.antennas > 1 ? 1.5 : 0.9, 0.08);
    }
    if (st.roofBox) {
      // climatiseur et dôme de transmission
      g.paint(0xd9dce0, SURF_FIXED).box(-0.42, 0.42, top, top + 0.2, -0.6, 0.5);
      g.paint(0xe8eaec, SURF_FIXED).dome(0, top, -hl + 1.5, 0.3, 10, 3, 0.75);
    }
    if (st.awning) {
      // store banne enroulé sur le flanc droit
      g.paint(0xc9ccd1, SURF_FIXED).tube(-(wCab + 0.06), top - 0.12, -hl + 0.5, -(wCab + 0.06), top - 0.12, fd0 - 0.2, 0.06, 0.06, 8);
    }
    // feux de gabarit et grille d'aération de toit
    g.paint(0xc4c8cd, SURF_FIXED).box(-0.22, 0.22, top, top + 0.04, -hl + 2.0, -hl + 2.4);
  }
  body();

  meta.wheelRadius = r;
  meta.fire = [0, yN1 + 0.15, hl - 0.35, 0, yCab * 0.8, zA - 0.7, 0, yCab * 0.8, -hl + 1.2];
  meta.cockpit = 'van';
  meta.beltY = yBelt; meta.hoodY = yN1; meta.roofY = yCab; meta.cowlZ = zA; meta.halfWidth = hw;
  meta.grille = st.grilleFront;
  meta.sag = r * 0.26;
  return meta;
}
