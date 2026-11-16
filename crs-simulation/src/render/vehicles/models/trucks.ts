/* Poids lourds à cabine avancée : camion civil, fourgon-pompe des sapeurs-pompiers, camion sono de manifestation.
 * truckBase() (châssis, cabine, roues, optiques) sert aussi à l'engin lanceur d'eau. */

import type { VehicleDef } from '@/core/contracts';
import {
  LIGHT_BEACON_A, LIGHT_BEACON_B, LIGHT_BRAKE, LIGHT_HEAD, LIGHT_IND_L, LIGHT_IND_R, LIGHT_NONE, LIGHT_REVERSE, LIGHT_TAIL,
  SURF_DARK, SURF_FIXED, SURF_METAL,
} from '../geo';
import type { Geo } from '../geo';
import {
  COL, arch, beacon, bumper, cabin, decal, door, grille, lamp, lightbar, pipe, plate, shell, sideMirror, wheel,
} from '../kit';
import type { CabinSpec, Station } from '../kit';
import { tile } from '../atlas-layout';
import { emptyMeta } from './types';
import type { ModelMeta } from './types';

export interface TruckBaseOptions {
  /** Longueur de la cabine (m). */
  cabLen: number;
  /** Hauteur du toit de cabine. */
  cabTop: number;
  /** Cabine double (deux portes par côté). */
  crew?: boolean;
  /** Essieux arrière (1 ou 2). */
  rearAxles: number;
  wheelR: number;
  /** Grilles de protection sur le pare-brise et les vitres de cabine. */
  grilles?: boolean;
  /** Couleur fixe de la cabine (sinon teinte de l'instance). */
  cabColor?: number;
  bumperColor?: number;
  lightbar?: boolean;
}

export interface TruckAnchors {
  meta: ModelMeta;
  hl: number; hw: number;
  /** Arrière de la cabine, dessus du châssis, toit de cabine. */
  zCab: number; yDeck: number; cabTop: number;
  zF: number; zR: number; r: number;
  yBelt: number;
}

export function truckBase(g: Geo, far: boolean, def: VehicleDef, o: TruckBaseOptions): TruckAnchors {
  const L = def.length, W = def.width;
  const hl = L / 2, hw = W / 2 - 0.02;
  const r = o.wheelR, ww = 0.3;
  const gc = 0.42;
  const yDeck = r * 2 + 0.1;
  const zCab = hl - o.cabLen;
  const yBelt = yDeck + 0.5;
  const cabTop = o.cabTop;
  const meta = emptyMeta(def);
  const cabStyle = (): void => { if (o.cabColor !== undefined) g.paint(o.cabColor, SURF_FIXED); else g.body(); };
  const over = L - def.wheelbase;
  const zF = Math.min(hl - r - 0.25, hl - over * 0.36);
  const zR = zF - def.wheelbase;

  // ── châssis ──
  g.noPart().tile(null).paint(COL.dark, SURF_DARK);
  if (far) g.box(-0.5, 0.5, gc + 0.1, yDeck, -hl + 0.15, zCab, 1 | 2);
  else {
    g.box(-0.48, 0.48, gc + 0.12, yDeck, -hl + 0.1, zCab + 0.3, 2);
    // réservoir, coffre à batteries
    g.paint(COL.steel, SURF_METAL).tube(-hw + 0.3, gc + 0.3, zCab - 0.25, -hw + 0.3, gc + 0.3, zCab - 1.2, 0.26, 0.26, 10);
    g.paint(COL.plastic, SURF_FIXED).box(hw - 0.55, hw - 0.05, gc + 0.05, yDeck - 0.1, zCab - 1.0, zCab - 0.3);
    // barre anti-encastrement
    g.paint(COL.plastic, SURF_FIXED).box(-hw * 0.9, hw * 0.9, gc + 0.05, gc + 0.17, -hl, -hl + 0.1);
  }

  // ── cabine ──
  const stations: Station[] = [
    { z: zCab, w: hw, y0: gc + 0.05, y1: yBelt, round: 0.02, tuck: 0.08 },
    { z: hl - 0.22, w: hw, y0: gc + 0.05, y1: yBelt, round: 0.02, tuck: 0.08 },
    { z: hl, w: hw * 0.96, y0: gc + 0.16, y1: yBelt - 0.02, round: 0.04, tuck: 0.06 },
  ];
  shell(g, far, stations, cabStyle);
  const cab: CabinSpec = {
    zA: hl - 0.02, zB: hl - 0.24, zC: zCab + 0.06, zD: zCab + 0.02, yBelt, yRoof: cabTop, wBelt: hw - 0.015, wRoof: hw - 0.1,
    cap: 0.08, rearGlass: false, grilleFront: o.grilles, side: [],
  };
  const fd1 = hl - 0.3, fd0 = Math.max(zCab + 0.12, fd1 - 1.05);
  if (far) cab.side.push({ z0: o.crew ? zCab + 0.2 : fd0, z1: fd1 });
  cabin(g, far, cab, cabStyle);
  const notch = { z: zF - r * 1.2, y: r * 2.28 };
  const winKind = o.grilles ? 'grille' as const : 'glass' as const;
  door(g, far, { index: 0, side: 'L', z0: fd0, z1: fd1, y0: gc + 0.2, y1: yBelt, hw, window: winKind, notch }, cab, cabStyle);
  door(g, far, { index: 1, side: 'R', z0: fd0, z1: fd1, y0: gc + 0.2, y1: yBelt, hw, window: winKind, notch }, cab, cabStyle);
  meta.doors.push({ index: 0, x: hw, z: (fd0 + fd1) / 2 }, { index: 1, x: -hw, z: (fd0 + fd1) / 2 });
  if (o.crew && fd0 - zCab > 0.9) {
    const rd1 = fd0 - 0.08, rd0 = zCab + 0.14;
    door(g, far, { index: 2, side: 'L', z0: rd0, z1: rd1, y0: gc + 0.2, y1: yBelt, hw, window: winKind }, cab, cabStyle);
    door(g, far, { index: 3, side: 'R', z0: rd0, z1: rd1, y0: gc + 0.2, y1: yBelt, hw, window: winKind }, cab, cabStyle);
    meta.doors.push({ index: 2, x: hw, z: (rd0 + rd1) / 2 }, { index: 3, x: -hw, z: (rd0 + rd1) / 2 });
  }
  if (!far) {
    // marchepieds
    g.paint(COL.plastic, SURF_FIXED);
    g.mirror(() => { g.box(hw - 0.08, hw + 0.015, gc + 0.02, gc + 0.2, fd0, fd1 - 0.2); });
  }

  // ── face avant ──
  const fz = hl + 0.006;
  const s2 = stations[2]!;
  if (!far) {
    grille(g, false, yDeck + 0.12, fz, hw * 1.25, 0.42);
    plate(g, false, gc + 0.3, fz + 0.012, 'F');
    bumper(g, false, hw * 0.98, gc + 0.1, gc + 0.42, hl - 0.085, 0.14, o.bumperColor ?? COL.plastic);
  }
  g.mirror(() => {
    lamp(g, s2.w * 0.74, gc + 0.56, fz + (far ? 0 : 0.0), [1, 0, 0], [0, 1, 0], 0.3, 0.14, COL.headLens, LIGHT_HEAD);
  });
  if (!far) {
    lamp(g, s2.w * 0.93, gc + 0.56, fz, [1, 0, 0], [0, 1, 0], 0.08, 0.14, COL.amber, LIGHT_IND_L);
    lamp(g, -s2.w * 0.93, gc + 0.56, fz, [1, 0, 0], [0, 1, 0], 0.08, 0.14, COL.amber, LIGHT_IND_R);
    g.mirror(() => {
      sideMirror(g, false, hw - 0.01, yBelt + 0.5, hl - 0.32, 0.3, () => g.paint(COL.plastic, SURF_FIXED));
    });
    // pare-soleil
    cabStyle();
    g.box(-hw * 0.9, hw * 0.9, cabTop - 0.1, cabTop - 0.04, hl - 0.24, hl - 0.02);
  }
  meta.head.push(s2.w * 0.74, gc + 0.56, hl, -s2.w * 0.74, gc + 0.56, hl);

  // ── feux arrière sur le châssis ──
  const rz = -hl - 0.004;
  g.mirror(() => {
    lamp(g, hw * 0.78, gc + 0.3, rz, [-1, 0, 0], [0, 1, 0], 0.28, 0.13, COL.redLens, LIGHT_TAIL);
  });
  if (!far) {
    lamp(g, hw * 0.52, gc + 0.3, rz, [-1, 0, 0], [0, 1, 0], 0.12, 0.13, COL.amber, LIGHT_IND_L);
    lamp(g, -hw * 0.52, gc + 0.3, rz, [-1, 0, 0], [0, 1, 0], 0.12, 0.13, COL.amber, LIGHT_IND_R);
    lamp(g, hw * 0.34, gc + 0.3, rz, [-1, 0, 0], [0, 1, 0], 0.1, 0.1, 0xe9ecef, LIGHT_REVERSE);
    lamp(g, -hw * 0.34, gc + 0.3, rz, [-1, 0, 0], [0, 1, 0], 0.1, 0.1, COL.redLens, LIGHT_BRAKE);
    plate(g, false, gc + 0.12, rz - 0.004, 'B');
  }
  meta.tail.push(hw * 0.78, gc + 0.3, -hl, -hw * 0.78, gc + 0.3, -hl);

  // ── roues ──
  const many = o.rearAxles > 1;
  g.mirror(() => {
    wheel(g, far, W / 2, zF, r, ww, 'pl', true, 1, far && many);
    for (let a = 0; a < o.rearAxles; a++) {
      const z = zR - a * (r * 2 + 0.16);
      wheel(g, far, W / 2, z, r, ww * 1.75, 'pl', false, 1, far && many);
      if (!far) {
        // garde-boue
        g.noPart().paint(COL.plastic, SURF_FIXED);
        g.box(hw - ww * 1.8, hw, r * 2 + 0.04, r * 2 + 0.09, z - r * 1.05, z + r * 1.05);
      }
    }
    arch(g, far, hw + 0.004, zF, r, gc + 0.05);
  });

  if (o.lightbar) {
    const by = cabTop + (far ? 0 : 0.03), bz = hl - o.cabLen * 0.5;
    lightbar(g, far, by, bz, Math.min(1.5, W * 0.62));
    meta.beaconA.push(0.45, by + 0.08, bz);
    meta.beaconB.push(-0.45, by + 0.08, bz);
  }
  g.light(LIGHT_NONE);

  meta.wheelRadius = r;
  meta.cockpit = 'truck';
  meta.beltY = yBelt; meta.hoodY = yBelt - 0.25; meta.roofY = cabTop; meta.cowlZ = hl - 0.02; meta.halfWidth = hw;
  meta.grille = !!o.grilles;
  meta.sag = r * 0.22;
  return { meta, hl, hw, zCab, yDeck, cabTop, zF, zR, r, yBelt };
}

/** Camion civil : cabine à la teinte de l'instance, caisse fourgon claire. */
export function buildCamion(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const H = def.height;
  const a = truckBase(g, far, def, { cabLen: 2.0, cabTop: Math.min(H - 0.5, 2.85), rearAxles: 1, wheelR: 0.5 });
  const { hl, hw, zCab, yDeck } = a;
  const boxStyle = (): void => { g.paint(0xdcdfe3, SURF_FIXED); };
  const z1 = zCab - 0.14;
  shell(g, far, [
    { z: -hl, w: hw, y0: yDeck, y1: H, round: 0.03, tuck: 0.02 },
    { z: z1, w: hw, y0: yDeck, y1: H, round: 0.03, tuck: 0.02 },
  ], boxStyle);
  if (!far) {
    // portes arrière (traits), ferrures, déflecteur de cabine
    g.paint(0x9a9ea4, SURF_METAL);
    const rz = -hl - 0.006;
    g.box(-0.012, 0.012, yDeck + 0.05, H - 0.05, rz - 0.004, rz);
    for (const x of [-hw * 0.5, hw * 0.5]) g.tube(x, yDeck + 0.1, rz - 0.01, x, H - 0.1, rz - 0.01, 0.014, 0.014, 5);
    g.mirror(() => { for (const y of [0.25, 0.5, 0.75]) g.box(hw - 0.02, hw + 0.004, yDeck + (H - yDeck) * y, yDeck + (H - yDeck) * y + 0.02, -hl + 0.02, z1 - 0.02); });
    g.body();
    g.hexa([
      -hw * 0.9, a.cabTop, zCab + 0.1, hw * 0.9, a.cabTop, zCab + 0.1, hw * 0.9, a.cabTop, hl - 0.5, -hw * 0.9, a.cabTop, hl - 0.5,
      -hw * 0.9, H - 0.05, zCab + 0.1, hw * 0.9, H - 0.05, zCab + 0.1, hw * 0.8, a.cabTop + 0.05, hl - 0.6, -hw * 0.8, a.cabTop + 0.05, hl - 0.6,
    ], 1);
  }
  a.meta.fire = [0, a.cabTop * 0.8, hl - 1.0, 0, H * 0.7, -1, 0, H * 0.7, -hl + 1.2];
  return a.meta;
}

/** Fourgon-pompe des sapeurs-pompiers : cabine double, caisse à rideaux, échelle, « SAPEURS-POMPIERS ». */
export function buildPompiers(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const H = def.height;
  const cabTop = H - 0.12;
  const a = truckBase(g, far, def, { cabLen: 2.95, cabTop, crew: true, rearAxles: 1, wheelR: 0.48, bumperColor: 0xe9ebee, lightbar: true });
  const { hl, hw, zCab, yDeck, meta } = a;
  const red = (): void => { g.body(); };
  const z1 = zCab - 0.06;
  const top = H - 0.2;
  shell(g, far, [
    { z: -hl, w: hw, y0: yDeck - 0.35, y1: top, round: 0.04, tuck: 0.03 },
    { z: z1, w: hw, y0: yDeck - 0.35, y1: top, round: 0.04, tuck: 0.03 },
  ], red);
  const xs = hw + 0.012;
  const bodyLen = z1 + hl;
  // rideaux métalliques : deux par flanc
  const sh0 = yDeck - 0.15, sh1 = top - 0.62;
  for (const s of [1, -1]) {
    const face = s > 0 ? 'L' as const : 'R' as const;
    if (far) {
      g.paint(0xb9bdc3, SURF_METAL);
      g.face([xs * s, sh0, -hl + 0.15, xs * s, sh0, z1 - 0.15, xs * s, sh1, z1 - 0.15, xs * s, sh1, -hl + 0.15], null, [s, 0, 0]);
    } else {
      const n = 2;
      const wEach = (bodyLen - 0.3 - (n - 1) * 0.08) / n;
      for (let i = 0; i < n; i++) {
        const zc = -hl + 0.15 + wEach / 2 + i * (wEach + 0.08);
        decal(g, 'rideau', face, xs * s, (sh0 + sh1) / 2, zc, sh1 - sh0, wEach, [0, 0, 1, Math.min(1, (sh1 - sh0) / 1.3)]);
      }
    }
    // marquage au-dessus des rideaux et bande réfléchissante
    decal(g, 'pompiers', face, xs * s, top - 0.31, (-hl + z1) / 2, Math.min(0.46, (bodyLen - 0.3) / 5.2));
    if (!far) decal(g, 'damier', face, xs * s, yDeck + 0.42, (zCab + hl - 0.3) / 2, 0.14, hl - 0.3 - zCab - 0.2);
  }
  // arrière : rideau, chevrons
  if (!far) {
    decal(g, 'rideau', 'B', 0, (sh0 + sh1) / 2, -hl - 0.012, sh1 - sh0, hw * 1.5, [0, 0, 1, Math.min(1, (sh1 - sh0) / 1.3)]);
    decal(g, 'chevrons', 'B', 0, top - 0.32, -hl - 0.012, 0.5, hw * 1.7);
    // échelle à coulisse sur le toit, côté droit
    g.paint(0xc9ccd1, SURF_METAL);
    const ly = top + 0.12, lx = -hw + 0.55;
    g.tube(lx - 0.2, ly, -hl + 0.1, lx - 0.2, ly, z1 + 0.5, 0.025, 0.025, 5);
    g.tube(lx + 0.2, ly, -hl + 0.1, lx + 0.2, ly, z1 + 0.5, 0.025, 0.025, 5);
    const rungs = Math.floor((bodyLen + 0.4) / 0.32);
    for (let i = 0; i < rungs; i++) {
      const z = -hl + 0.2 + i * 0.32;
      g.tube(lx - 0.2, ly, z, lx + 0.2, ly, z, 0.015, 0.015, 4, false, false);
    }
    for (const z of [-hl + 0.4, z1 - 0.1]) g.box(lx - 0.24, lx + 0.24, top, ly - 0.02, z - 0.03, z + 0.03);
    // dévidoir et tuyaux d'aspiration côté gauche
    g.paint(0x2a2c30, SURF_FIXED).tube(hw - 0.35, top + 0.1, -hl + 0.2, hw - 0.35, top + 0.1, z1 - 0.2, 0.09, 0.09, 8);
    g.paint(COL.fireYellow, SURF_FIXED).box(-hw * 0.96, hw * 0.96, a.yBelt - 0.18, a.yBelt - 0.1, hl + 0.004, hl + 0.012);
  }
  beacon(g, far, hw - 0.25, top, -hl + 0.25, LIGHT_BEACON_A, 0.085);
  beacon(g, far, -(hw - 0.25), top, -hl + 0.25, LIGHT_BEACON_B, 0.085);
  meta.beaconA.push(hw - 0.25, top + 0.12, -hl + 0.25);
  meta.beaconB.push(-(hw - 0.25), top + 0.12, -hl + 0.25);
  red();
  meta.fire = [0, cabTop * 0.8, hl - 1.2, 0, top * 0.8, -hl + 1.2];
  return meta;
}

/** Camion sono de manifestation : plateau à ridelles, murs d'enceintes, portique et banderoles. */
export function buildSono(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const H = def.height;
  const a = truckBase(g, far, def, { cabLen: 2.0, cabTop: Math.min(2.7, H - 0.4), rearAxles: 1, wheelR: 0.44, cabColor: 0xeceef0 });
  const { hl, hw, zCab, yDeck, meta } = a;
  const z1 = zCab - 0.1;
  const deck = yDeck + 0.08;
  // plateau et ridelles
  g.paint(0x6b5a45, SURF_FIXED).tile(far ? null : tile('plancher'));
  g.box(-hw, hw, yDeck, deck, -hl, z1);
  g.tile(null);
  const turq = 0x1fa3a3;
  g.paint(0xcfd3d7, SURF_FIXED);
  const rail = deck + 0.5;
  if (far) {
    g.box(-hw, hw, deck, rail, -hl, z1, 1 | 2);
  } else {
    g.mirror(() => { g.box(hw - 0.04, hw, deck, rail, -hl, z1); });
    g.box(-hw, hw, deck, rail, z1 - 0.04, z1);
    g.box(-hw, hw, deck, rail, -hl, -hl + 0.04);
  }
  // murs d'enceintes : pile avant (vers l'arrière et les côtés) et pile arrière
  const speaker = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, faces: ('L' | 'R' | 'B' | 'F')[]): void => {
    g.paint(0x141518, SURF_FIXED).cube(cx, cy, cz, sx, sy, sz);
    if (far) return;
    for (const f of faces) {
      if (f === 'L') decal(g, 'enceinte', 'L', cx + sx / 2 + 0.004, cy, cz, sy * 0.92, sz * 0.92);
      if (f === 'R') decal(g, 'enceinte', 'R', cx - sx / 2 - 0.004, cy, cz, sy * 0.92, sz * 0.92);
      if (f === 'B') decal(g, 'enceinte', 'B', cx, cy, cz - sz / 2 - 0.004, sy * 0.92, sx * 0.92);
      if (f === 'F') decal(g, 'enceinte', 'F', cx, cy, cz + sz / 2 + 0.004, sy * 0.92, sx * 0.92);
    }
  };
  const sy = 0.85;
  for (let level = 0; level < 2; level++) {
    const y = deck + sy / 2 + level * sy;
    speaker(hw * 0.5, y, z1 - 0.5, hw * 0.92, sy, 0.8, ['L', 'B']);
    speaker(-hw * 0.5, y, z1 - 0.5, hw * 0.92, sy, 0.8, ['R', 'B']);
  }
  speaker(hw * 0.5, deck + sy / 2, -hl + 0.5, hw * 0.92, sy, 0.8, ['L', 'B']);
  speaker(-hw * 0.5, deck + sy / 2, -hl + 0.5, hw * 0.92, sy, 0.8, ['R', 'B']);
  // groupe électrogène
  if (!far) g.paint(0xd0a020, SURF_FIXED).cube(0, deck + 0.3, z1 - 1.4, 0.9, 0.6, 0.6);
  // portique tubulaire
  const topY = H - 0.06;
  if (!far) {
    g.paint(0x8d9299, SURF_METAL);
    for (const z of [-hl + 0.06, z1 - 0.06]) {
      pipe(g, [hw - 0.03, deck, z, hw - 0.03, topY, z, -(hw - 0.03), topY, z, -(hw - 0.03), deck, z], 0.03);
    }
    g.mirror(() => { g.tube(hw - 0.03, topY, -hl + 0.06, hw - 0.03, topY, z1 - 0.06, 0.03, 0.03, 6); });
  }
  // banderoles des deux flancs, sous la traverse haute, et calicot arrière
  const bh = Math.min(0.85, (z1 + hl - 0.1) / 5.33);
  decal(g, 'banderole', 'L', hw + 0.012, topY - 0.04 - bh / 2, (z1 - hl) / 2, bh);
  decal(g, 'banderole', 'R', -hw - 0.012, topY - 0.04 - bh / 2, (z1 - hl) / 2, bh);
  if (!far) {
    g.paint(turq, SURF_FIXED);
    g.face([hw * 0.9, rail + 0.05, -hl - 0.01, -hw * 0.9, rail + 0.05, -hl - 0.01, -hw * 0.9, rail + 0.5, -hl - 0.01, hw * 0.9, rail + 0.5, -hl - 0.01], null, [0, 0, -1]);
    // fanions
    for (let i = 0; i < 6; i++) {
      const x = -hw + 0.2 + i * ((hw * 2 - 0.4) / 5);
      g.paint(i % 2 ? turq : 0xf2c94c, SURF_FIXED);
      g.face([x - 0.1, topY, z1 - 0.06, x + 0.1, topY, z1 - 0.06, x, topY - 0.26, z1 - 0.06], null, [0, 0, 1]);
      g.face([x - 0.1, topY, -hl + 0.06, x + 0.1, topY, -hl + 0.06, x, topY - 0.26, -hl + 0.06], null, [0, 0, -1]);
    }
  }
  g.body();
  meta.fire = [0, a.cabTop * 0.8, hl - 1.0, 0, deck + 1.0, -1];
  return meta;
}

// optiques communes exportées pour l'engin lanceur d'eau
export { LIGHT_BRAKE, LIGHT_IND_L, LIGHT_IND_R, LIGHT_REVERSE };
