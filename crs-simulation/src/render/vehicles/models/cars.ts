/* Voitures : berline, citadine, SUV, taxi, voiture de police sérigraphiée, voiture banalisée de la BAC. Noms génériques,
 * aucune marque. */

import type { VehicleDef } from '@/core/contracts';
import {
  LIGHT_BEACON_A, LIGHT_BEACON_B, LIGHT_BRAKE, LIGHT_HEAD, LIGHT_IND_L, LIGHT_IND_R, LIGHT_NONE, LIGHT_REVERSE, LIGHT_SIGN,
  LIGHT_TAIL, PART_DOME, SURF_DARK, SURF_FIXED, SURF_LAMP, SURF_METAL,
} from '../geo';
import type { Geo } from '../geo';
import {
  COL, EDGE_SIDE, arch, bumper, cabin, decal, decalFree, door, grille, lamp, lampBox, lightbar, patch, plate, policeBand,
  shell, sideMirror, wheel, antenna,
} from '../kit';
import type { CabinSpec, Station, WheelStyle } from '../kit';
import { emptyMeta } from './types';
import type { ModelMeta } from './types';

export interface CarStyle {
  /** Longueur du capot et du coffre, en fraction de la longueur (coffre 0 = bicorps). */
  hood: number;
  deck: number;
  /** Recul du haut du pare-brise et avancée du haut de la lunette (m). */
  rakeF: number;
  rakeR: number;
  clearance: number;
  wheelR: number;
  wheelW: number;
  /** Hauteur de la ceinture de caisse entre garde au sol (0) et toit (1). */
  belt: number;
  rim: WheelStyle;
  /** Deux portes seulement (citadine). */
  twoDoor?: boolean;
  /** Bas de caisse et boucliers en plastique noir, barres de toit (SUV). */
  cladding?: boolean;
  taxi?: boolean;
  police?: boolean;
  /**
   * Voiture banalisée (BAC) : aucune inscription ni rampe ; vitres arrière surteintées ; gyrophare aimanté sur le toit,
   * côté conducteur, posé seulement quand les gyrophares sont en service (pièce PART_DOME) ; feux à éclats bleus dans
   * la calandre.
   */
  unmarked?: boolean;
}

/** Vitrage surteinté (vitres arrière d'une voiture banalisée). */
const TINTED_GLASS = 0x07090b;

export const CAR_STYLES: Readonly<Record<string, CarStyle>> = {
  voiture: { hood: 0.25, deck: 0.13, rakeF: 0.62, rakeR: 0.5, clearance: 0.16, wheelR: 0.32, wheelW: 0.21, belt: 0.57, rim: 'alu' },
  citadine: { hood: 0.21, deck: 0, rakeF: 0.5, rakeR: 0.24, clearance: 0.15, wheelR: 0.29, wheelW: 0.19, belt: 0.58, rim: 'tole', twoDoor: true },
  suv: { hood: 0.24, deck: 0, rakeF: 0.55, rakeR: 0.3, clearance: 0.21, wheelR: 0.36, wheelW: 0.24, belt: 0.6, rim: 'alu', cladding: true },
  taxi: { hood: 0.24, deck: 0.12, rakeF: 0.64, rakeR: 0.52, clearance: 0.15, wheelR: 0.32, wheelW: 0.21, belt: 0.58, rim: 'alu', taxi: true },
  voiture_police: { hood: 0.24, deck: 0, rakeF: 0.55, rakeR: 0.3, clearance: 0.2, wheelR: 0.35, wheelW: 0.23, belt: 0.6, rim: 'tole', cladding: true, police: true },
  voiture_bac: { hood: 0.26, deck: 0.13, rakeF: 0.64, rakeR: 0.52, clearance: 0.15, wheelR: 0.33, wheelW: 0.22, belt: 0.58, rim: 'alu', unmarked: true },
};

export function buildCar(g: Geo, far: boolean, def: VehicleDef, st: CarStyle): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2, hw = W / 2 - 0.02;
  const gc = st.clearance, r = st.wheelR;
  const hatch = st.deck <= 0;
  const yBelt = gc + (H - gc) * st.belt;
  const zA = hl - L * st.hood;
  const zB = zA - st.rakeF;
  const zD = hatch ? -hl + 0.1 : -hl + L * st.deck;
  const zC = zD + st.rakeR;
  const yNose = yBelt - 0.14;
  const yDeck = hatch ? yBelt : yBelt - 0.02;
  const over = L - def.wheelbase;
  const zF = hl - over * 0.46, zR = zF - def.wheelbase;
  const body = (): void => { g.body(); };
  const clad = (): void => { if (st.cladding) g.paint(COL.plastic, SURF_FIXED); else g.body(0.92); };

  // ── caisse ──
  const stations: Station[] = hatch ? [
    { z: -hl, w: hw * 0.84, y0: gc + 0.17, y1: yBelt - 0.12, round: 0.05, tuck: 0.04 },
    { z: -hl + 0.08, w: hw * 0.97, y0: gc + 0.03, y1: yBelt - 0.01 },
    { z: -hl + 0.26, w: hw, y0: gc, y1: yBelt },
    { z: zA, w: hw, y0: gc, y1: yBelt },
    { z: hl - 0.38, w: hw * 0.99, y0: gc, y1: yNose + 0.07 },
    { z: hl - 0.1, w: hw * 0.94, y0: gc + 0.03, y1: yNose },
    { z: hl, w: hw * 0.8, y0: gc + 0.17, y1: yNose - 0.16, round: 0.05, tuck: 0.04 },
  ] : [
    { z: -hl, w: hw * 0.82, y0: gc + 0.17, y1: yDeck - 0.2, round: 0.05, tuck: 0.04 },
    { z: -hl + 0.09, w: hw * 0.96, y0: gc + 0.03, y1: yDeck - 0.03 },
    { z: -hl + 0.3, w: hw, y0: gc, y1: yDeck },
    { z: zD, w: hw, y0: gc, y1: yBelt },
    { z: zA, w: hw, y0: gc, y1: yBelt },
    { z: hl - 0.38, w: hw * 0.99, y0: gc, y1: yNose + 0.07 },
    { z: hl - 0.1, w: hw * 0.94, y0: gc + 0.03, y1: yNose },
    { z: hl, w: hw * 0.8, y0: gc + 0.17, y1: yNose - 0.16, round: 0.05, tuck: 0.04 },
  ];
  const last = stations.length - 1;
  if (far) {
    const keep = hatch ? [0, 2, 3, 4, last] : [0, 2, 3, 4, 5, last];
    shell(g, true, keep.map((i) => stations[i]!), body);
  } else {
    shell(g, false, stations, body);
  }

  // ── pavillon ──
  const cab: CabinSpec = {
    zA, zB, zC, zD, yBelt, yRoof: H, wBelt: hw - 0.035, wRoof: hw - 0.2,
    side: [],
  };
  if (st.unmarked) cab.rearGlassColor = TINTED_GLASS;
  const zMid = (zB + zC) / 2 + 0.12;
  const frontDoor = { z0: zMid, z1: Math.min(zA - 0.02, zF - r * 1.28) };
  const rearDoorZ0 = Math.max(zR + r * 0.6, zD + 0.12);
  if (st.twoDoor) cab.side.push({ z0: zD, z1: zMid - 0.07 });
  else if (hatch) cab.side.push({ z0: zD, z1: rearDoorZ0 - 0.06 });
  if (far) cab.side.push({ z0: zD, z1: zA });
  cabin(g, far, cab, body);

  // ── portes ──
  const meta = emptyMeta(def);
  const sill = gc + 0.09;
  const policeDoor = (side: 'L' | 'R') => (x: number): void => {
    if (!st.police) return;
    decal(g, 'police', side, x, sill + (yBelt - sill) * 0.5, (frontDoor.z0 + frontDoor.z1) / 2, (yBelt - sill) * 0.42);
  };
  door(g, far, { index: 0, side: 'L', z0: frontDoor.z0, z1: frontDoor.z1, y0: sill, y1: yBelt, hw, window: 'glass', extra: policeDoor('L') }, cab, body);
  door(g, far, { index: 1, side: 'R', z0: frontDoor.z0, z1: frontDoor.z1, y0: sill, y1: yBelt, hw, window: 'glass', extra: policeDoor('R') }, cab, body);
  meta.doors.push({ index: 0, x: hw, z: (frontDoor.z0 + frontDoor.z1) / 2 }, { index: 1, x: -hw, z: (frontDoor.z0 + frontDoor.z1) / 2 });
  if (!st.twoDoor) {
    const band = (side: 'L' | 'R') => (x: number): void => {
      if (!st.police) return;
      policeBand(g, side, x, sill + (yBelt - sill) * 0.5, rearDoorZ0 + 0.02, zMid - 0.04, (yBelt - sill) * 0.3, zMid - 0.04);
    };
    // vitres des portes arrière : surteintées sur une voiture banalisée
    const rearCab = st.unmarked ? { ...cab, glassColor: TINTED_GLASS } : cab;
    door(g, far, { index: 2, side: 'L', z0: rearDoorZ0, z1: zMid - 0.02, y0: sill, y1: yBelt, hw, window: 'glass', extra: band('L') }, rearCab, body);
    door(g, far, { index: 3, side: 'R', z0: rearDoorZ0, z1: zMid - 0.02, y0: sill, y1: yBelt, hw, window: 'glass', extra: band('R') }, rearCab, body);
    meta.doors.push({ index: 2, x: hw, z: (rearDoorZ0 + zMid) / 2 }, { index: 3, x: -hw, z: (rearDoorZ0 + zMid) / 2 });
  }

  // ── roues et passages de roue ──
  g.mirror(() => {
    wheel(g, far, W / 2, zF, r, st.wheelW, st.rim, true);
    wheel(g, far, W / 2, zR, r, st.wheelW, st.rim, false);
    arch(g, far, hw + 0.004, zF, r, gc);
    arch(g, far, hw + 0.004, zR, r, gc);
  });

  // ── face avant ──
  const s6 = stations[last - 1]!, s7 = stations[last]!;
  const capY0 = s7.y0 + 0.04, capY1 = s7.y1 - 0.05;
  const fz = hl + 0.006;
  if (!far) {
    grille(g, false, capY0 + (capY1 - capY0) * 0.6, fz, hw * 0.78, (capY1 - capY0) * 0.62);
    g.paint(COL.plastic, SURF_FIXED).tile(null);
    g.panel(0, capY0 + 0.035, fz, [1, 0, 0], [0, 1, 0], hw * 1.3, 0.07);
    plate(g, false, capY0 + 0.05, fz + 0.004, 'F');
    bumper(g, false, hw * 0.93, gc + 0.04, gc + 0.165, hl - 0.07, 0.11, st.cladding ? COL.plastic : 0x2f3136);
  }
  g.mirror(() => {
    lamp(g, hw * 0.61, capY1 - 0.055, fz, [1, 0, 0], [0, 1, 0], hw * 0.36, 0.1, COL.headLens, LIGHT_HEAD, far ? 0 : 0.012);
    if (!far) {
      g.paint(COL.headLens, SURF_LAMP).light(LIGHT_HEAD);
      patch(g, s6, s7, EDGE_SIDE, 0.1, 0.96, 0.62, 0.97, 1);
      g.light(LIGHT_NONE);
    }
  });
  if (!far) {
    g.paint(COL.amber, SURF_LAMP).light(LIGHT_IND_L); patch(g, s6, s7, EDGE_SIDE, 0.15, 0.9, 0.42, 0.58, 1);
    g.light(LIGHT_IND_R); patch(g, s6, s7, EDGE_SIDE, 0.15, 0.9, 0.42, 0.58, -1);
    g.light(LIGHT_NONE);
  }
  meta.head.push(hw * 0.61, capY1 - 0.055, hl, -hw * 0.61, capY1 - 0.055, hl);

  // ── face arrière ──
  const s0 = stations[0]!, s1 = stations[1]!;
  const rY0 = s0.y0 + 0.04, rY1 = s0.y1 - 0.04;
  const rz = -hl - 0.006;
  g.mirror(() => {
    lamp(g, s0.w * 0.72, rY1 - 0.07, rz, [-1, 0, 0], [0, 1, 0], s0.w * 0.42, 0.13, COL.redLens, LIGHT_TAIL);
  });
  if (!far) {
    g.paint(COL.redLens, SURF_LAMP).light(LIGHT_TAIL);
    patch(g, s0, s1, EDGE_SIDE, 0.04, 0.9, 0.6, 0.95, 1); patch(g, s0, s1, EDGE_SIDE, 0.04, 0.9, 0.6, 0.95, -1);
    g.paint(COL.amber, SURF_LAMP).light(LIGHT_IND_L); patch(g, s0, s1, EDGE_SIDE, 0.1, 0.85, 0.42, 0.57, 1);
    g.light(LIGHT_IND_R); patch(g, s0, s1, EDGE_SIDE, 0.1, 0.85, 0.42, 0.57, -1);
    lamp(g, s0.w * 0.3, rY1 - 0.07, rz, [-1, 0, 0], [0, 1, 0], s0.w * 0.2, 0.06, 0xe9ecef, LIGHT_REVERSE);
    lamp(g, 0, H - 0.085, zC + 0.012 - 0.06, [-1, 0, 0], [0, 1, 0], 0.3, 0.025, COL.redLens, LIGHT_BRAKE);
    plate(g, false, rY0 + (rY1 - rY0) * 0.42, rz - 0.004, 'B');
    bumper(g, false, hw * 0.94, gc + 0.04, gc + 0.165, -hl + 0.07, 0.11, st.cladding ? COL.plastic : 0x2f3136);
    // échappement
    g.paint(COL.steel, SURF_METAL).tube(-hw * 0.55, gc + 0.03, -hl + 0.16, -hw * 0.55, gc + 0.03, -hl + 0.01, 0.03, 0.03, 6, false, true);
  }
  meta.tail.push(s0.w * 0.72, rY1 - 0.07, -hl, -s0.w * 0.72, rY1 - 0.07, -hl);

  // ── détails ──
  g.mirror(() => { sideMirror(g, far, hw - 0.01, yBelt + 0.03, zA - 0.22, 0.17, body); });
  if (!far) {
    // bas de caisse
    clad();
    g.mirror(() => { g.box(hw - 0.01, hw + 0.012, gc + 0.01, sill, zR + r * 1.18, zF - r * 1.18); });
    if (st.cladding) {
      // barres de toit
      g.paint(COL.plastic, SURF_FIXED);
      g.mirror(() => { g.box(hw - 0.3, hw - 0.26, H, H + 0.035, zC + 0.1, zB - 0.12); });
    }
    antenna(g, false, 0, H, zC + 0.25, 0.28, 0.5);
    body();
  }

  // ── variantes ──
  if (st.taxi) {
    const sy = H + (far ? 0 : 0.02), sz = (zB + zC) / 2 + 0.25;
    if (!far) g.paint(COL.plastic, SURF_FIXED).box(-0.2, 0.2, H, sy, sz - 0.07, sz + 0.07);
    g.paint(0xf6f0d0, SURF_LAMP).light(LIGHT_SIGN).box(-0.19, 0.19, sy, sy + 0.13, sz - 0.06, sz + 0.06);
    if (!far) {
      decal(g, 'taxi', 'F', 0, sy + 0.065, sz + 0.062, 0.115, 0.34, undefined, 0xffffff, LIGHT_SIGN);
      decal(g, 'taxi', 'B', 0, sy + 0.065, sz - 0.062, 0.115, 0.34, undefined, 0xffffff, LIGHT_SIGN);
    }
    g.light(LIGHT_NONE);
  }
  if (st.police) {
    lightbar(g, far, H + (far ? 0 : 0.03), (zB + zC) / 2 + 0.2, Math.min(1.15, W * 0.62));
    meta.beaconA.push(0.36, H + 0.1, (zB + zC) / 2 + 0.2);
    meta.beaconB.push(-0.36, H + 0.1, (zB + zC) / 2 + 0.2);
    // capot : « POLICE » lisible de face ; hayon ; bande tricolore avant
    const s5 = stations[last - 2]!;
    const hy = (s5.y1 + yBelt) / 2 + 0.012, hz = (zA + s5.z) / 2;
    // pente et longueur du capot, comptées de l'avant (s5) vers le pied de pare-brise (zA) : le « haut » du texte
    // remonte vers le pare-brise et la normale (droite × haut) pointe vers le ciel et l'avant. Avec zA − s5.z (négatif),
    // le panneau était retourné vers le sol, de hauteur négative, enfoui sous le capot : seuls dépassaient des bouts de
    // lettres renversées, sombres, au pied du pare-brise
    const slope = Math.atan2(yBelt - s5.y1, s5.z - zA);
    decalFree(g, 'police', 0, hy, hz, [1, 0, 0], [0, Math.sin(slope), -Math.cos(slope)], Math.min(0.24, (s5.z - zA) * 0.55));
    if (!far) {
      decal(g, 'police', 'B', 0, rY1 - 0.09 + 0.2, rz - 0.002, 0.13);
      g.mirror(() => { /* liseré bleu de bas de caisse */ g.paint(COL.policeBlue, SURF_FIXED).box(hw + 0.012, hw + 0.016, sill + 0.01, sill + 0.06, zR + r * 1.25, zF - r * 1.25); });
    } else {
      // au loin, les portes ne sont pas émises : le même « POLICE » est posé sur le flanc de la coque (au lieu d'un
      // aplat bleu qui faisait changer le marquage au passage d'un niveau de détail à l'autre)
      const ty = sill + (yBelt - sill) * 0.5, tz = (frontDoor.z0 + frontDoor.z1) / 2, th = (yBelt - sill) * 0.42;
      decal(g, 'police', 'L', hw + 0.01, ty, tz, th);
      decal(g, 'police', 'R', -hw - 0.01, ty, tz, th);
    }
  }
  if (st.unmarked) {
    // gyrophare aimanté : sur le pavillon, au-dessus du conducteur (côté gauche, +x), posé par le chef de bord à la
    // fenêtre ; le vertex shader ne le montre que lorsque les gyrophares sont en service
    const dx = Math.min(0.32, hw - 0.42), dz = zB - 0.3, dr = 0.085;
    g.part(PART_DOME, dx, H, dz).tile(null);
    if (far) {
      g.paint(COL.blueLens, SURF_LAMP).light(LIGHT_BEACON_A).box(dx - dr, dx + dr, H, H + dr * 1.5, dz - dr, dz + dr);
    } else {
      // socle aimanté noir, puis cloche bleue
      g.paint(COL.dark, SURF_DARK).light(LIGHT_NONE).tube(dx, H - 0.004, dz, dx, H + 0.022, dz, dr * 1.15, dr * 1.1, 10, false, true);
      g.paint(COL.blueLens, SURF_LAMP).light(LIGHT_BEACON_A);
      g.tube(dx, H + 0.022, dz, dx, H + 0.022 + dr * 0.8, dz, dr, dr * 0.92, 10, false, false);
      g.dome(dx, H + 0.022 + dr * 0.8, dz, dr * 0.92, 10, 2, 0.6);
    }
    g.light(LIGHT_NONE).noPart();
    meta.beaconA.push(dx, H + 0.12, dz);
    if (!far) {
      // feux à éclats dans la calandre, de part et d'autre (groupe A à gauche, B à droite)
      const gy = capY0 + (capY1 - capY0) * 0.6;
      lampBox(g, hw * 0.3, hw * 0.42, gy - 0.02, gy + 0.02, fz - 0.004, fz + 0.012, COL.blueLens, LIGHT_BEACON_A);
      lampBox(g, -hw * 0.42, -hw * 0.3, gy - 0.02, gy + 0.02, fz - 0.004, fz + 0.012, COL.blueLens, LIGHT_BEACON_B);
    }
    meta.beaconB.push(-hw * 0.36, capY0 + (capY1 - capY0) * 0.6, hl);
  }
  body();

  meta.wheelRadius = r;
  meta.fire = [0, yNose + 0.1, hl - L * st.hood * 0.5, 0, H * 0.75, (zB + zC) / 2, 0, yBelt, -hl + 0.5];
  meta.cockpit = 'car';
  meta.beltY = yBelt; meta.hoodY = yNose + 0.07; meta.roofY = H; meta.cowlZ = zA; meta.halfWidth = hw;
  meta.sag = r * 0.26;
  return meta;
}
