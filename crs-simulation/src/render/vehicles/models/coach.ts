/* Grands véhicules de transport de personnes : bus urbain et car de transport de CRS. */

import type { VehicleDef } from '@/core/contracts';
import {
  LIGHT_BRAKE, LIGHT_HEAD, LIGHT_IND_L, LIGHT_IND_R, LIGHT_NONE, LIGHT_REVERSE, LIGHT_SIGN, LIGHT_TAIL, PART_SLIDE,
  SURF_DARK, SURF_FIXED, SURF_GLASS,
} from '../geo';
import type { Geo } from '../geo';
import { COL, arch, bumper, decal, lamp, lightbar, plate, shell, wheel } from '../kit';
import type { Station } from '../kit';
import { tile } from '../atlas-layout';
import { emptyMeta } from './types';
import type { ModelMeta } from './types';

export function buildCoach(g: Geo, far: boolean, def: VehicleDef, kind: 'bus' | 'car_crs'): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2, hw = W / 2 - 0.02;
  const bus = kind === 'bus';
  const gc = bus ? 0.3 : 0.38;
  const r = 0.5, ww = 0.3;
  const body = (): void => { g.body(); };
  const meta = emptyMeta(def);
  const over = L - def.wheelbase;
  const zF = hl - over * (bus ? 0.45 : 0.42), zR = zF - def.wheelbase;

  // ── caisse ──
  const stations: Station[] = [
    { z: -hl, w: hw * 0.95, y0: gc + 0.12, y1: H - 0.14, round: 0.1, tuck: 0.06 },
    { z: -hl + 0.2, w: hw, y0: gc, y1: H, round: 0.16, tuck: 0.06 },
    { z: hl - 0.3, w: hw, y0: gc, y1: H, round: 0.16, tuck: 0.06 },
    { z: hl, w: hw * 0.94, y0: gc + 0.1, y1: H - 0.16, round: 0.1, tuck: 0.06 },
  ];
  shell(g, far, stations, body, true, true, 42);

  // ── vitrage ──
  const wy0 = bus ? gc + 0.95 : gc + 1.45;
  const wy1 = H - (bus ? 0.55 : 0.5);
  const glassX = hw + 0.012;
  const bandZ0 = -hl + 0.55, bandZ1 = hl - 0.45;
  // portes (côté droit) : avant, et milieu pour le bus
  const doors: { index: number; z0: number; z1: number }[] = bus
    ? [{ index: 1, z0: hl - 1.75, z1: hl - 0.5 }, { index: 3, z0: -0.9, z1: 0.45 }]
    : [{ index: 1, z0: hl - 1.6, z1: hl - 0.6 }];
  const glass = (x: number, z0: number, z1: number, y0: number, y1: number): void => {
    const s = x > 0 ? 1 : -1;
    g.paint(COL.glass, SURF_GLASS).tile(tile('verre'));
    g.face([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], null, [s, 0, 0]);
    g.tile(null);
  };
  if (far) {
    glass(glassX, bandZ0, bandZ1, wy0, wy1);
    glass(-glassX, bandZ0, bandZ1, wy0, wy1);
  } else {
    const bay = bus ? 1.5 : 1.35;
    const n = Math.max(1, Math.round((bandZ1 - bandZ0) / bay));
    const step = (bandZ1 - bandZ0) / n;
    for (let i = 0; i < n; i++) {
      const z0 = bandZ0 + i * step + 0.04, z1 = bandZ0 + (i + 1) * step - 0.04;
      glass(glassX, z0, z1, wy0, wy1);
      // côté droit : on laisse la place des portes
      let blocked = false;
      for (const d of doors) if (z1 > d.z0 - 0.05 && z0 < d.z1 + 0.05) blocked = true;
      if (!blocked) glass(-glassX, z0, z1, wy0, wy1);
    }
    for (const d of doors) {
      // embrasure sombre puis vantaux vitrés coulissants
      g.noPart().paint(COL.interior, SURF_DARK);
      g.face([-hw - 0.006, gc + 0.12, d.z0, -hw - 0.006, gc + 0.12, d.z1, -hw - 0.006, wy1 + 0.1, d.z1, -hw - 0.006, wy1 + 0.1, d.z0], null, [-1, 0, 0]);
      g.part(PART_SLIDE, -hw, 0, d.z1, -(d.index + 1));
      body();
      const xd = -hw - 0.022;
      g.face([xd, gc + 0.14, d.z0 + 0.02, xd, gc + 0.14, d.z1 - 0.02, xd, wy1 + 0.08, d.z1 - 0.02, xd, wy1 + 0.08, d.z0 + 0.02], null, [-1, 0, 0]);
      const mid = (d.z0 + d.z1) / 2;
      glass(xd - 0.006, d.z0 + 0.08, mid - 0.03, gc + 0.45, wy1);
      glass(xd - 0.006, mid + 0.03, d.z1 - 0.08, gc + 0.45, wy1);
      g.noPart();
      meta.doors.push({ index: d.index, x: -hw, z: mid });
    }
  }

  // ── face avant : grand pare-brise plat, girouette, optiques ──
  const fz = hl + 0.008;
  const fw = hw * 0.9;
  const wsY0 = bus ? gc + 0.85 : gc + 1.25, wsY1 = H - (bus ? 0.62 : 0.5);
  g.paint(COL.glass, SURF_GLASS).tile(tile('verre'));
  g.face([-fw, wsY0, fz, fw, wsY0, fz, fw, wsY1, fz, -fw, wsY1, fz], null, [0, 0, 1]);
  g.tile(null);
  if (bus) {
    // girouette lumineuse
    if (far) lamp(g, 0, wsY1 + 0.19, fz, [1, 0, 0], [0, 1, 0], fw * 1.5, 0.22, 0x2a2010, LIGHT_SIGN);
    else {
      g.paint(COL.dark, SURF_DARK).panel(0, wsY1 + 0.19, fz, [1, 0, 0], [0, 1, 0], fw * 1.7, 0.3);
      decal(g, 'girouette', 'F', 0, wsY1 + 0.19, fz + 0.004, 0.24, undefined, undefined, 0xffffff, LIGHT_SIGN);
    }
  }
  g.mirror(() => {
    lamp(g, hw * 0.68, gc + 0.42, fz, [1, 0, 0], [0, 1, 0], 0.36, 0.14, COL.headLens, LIGHT_HEAD, far ? 0 : 0.02);
  });
  if (!far) {
    lamp(g, hw * 0.86, gc + 0.62, fz, [1, 0, 0], [0, 1, 0], 0.12, 0.09, COL.amber, LIGHT_IND_L);
    lamp(g, -hw * 0.86, gc + 0.62, fz, [1, 0, 0], [0, 1, 0], 0.12, 0.09, COL.amber, LIGHT_IND_R);
    plate(g, false, gc + 0.3, fz + 0.004, 'F');
    bumper(g, false, hw * 0.96, gc + 0.02, gc + 0.18, hl - 0.07, 0.12);
    // essuie-glaces et rétroviseurs en « oreilles »
    g.paint(COL.dark, SURF_DARK);
    g.tube(fw * 0.5, wsY0 + 0.03, fz + 0.01, fw * 0.15, wsY0 + (wsY1 - wsY0) * 0.6, fz + 0.01, 0.012, 0.008, 4, false, false);
    g.tube(-fw * 0.5, wsY0 + 0.03, fz + 0.01, -fw * 0.15, wsY0 + (wsY1 - wsY0) * 0.6, fz + 0.01, 0.012, 0.008, 4, false, false);
    g.mirror(() => {
      g.paint(COL.plastic, SURF_FIXED);
      g.tube(hw - 0.05, wsY1 - 0.05, hl - 0.12, hw + 0.22, wsY1 - 0.25, hl + 0.02, 0.02, 0.018, 5, false, false);
      g.cube(hw + 0.24, wsY1 - 0.5, hl + 0.02, 0.1, 0.42, 0.2);
    });
  }
  meta.head.push(hw * 0.68, gc + 0.42, hl, -hw * 0.68, gc + 0.42, hl);

  // ── face arrière ──
  const rz = -hl - 0.008;
  g.mirror(() => {
    lamp(g, hw * 0.82, gc + 0.75, rz, [-1, 0, 0], [0, 1, 0], 0.14, 0.42, COL.redLens, LIGHT_TAIL);
  });
  if (!far) {
    lamp(g, hw * 0.82, gc + 1.08, rz, [-1, 0, 0], [0, 1, 0], 0.14, 0.14, COL.amber, LIGHT_IND_L);
    lamp(g, -hw * 0.82, gc + 1.08, rz, [-1, 0, 0], [0, 1, 0], 0.14, 0.14, COL.amber, LIGHT_IND_R);
    lamp(g, hw * 0.6, gc + 0.6, rz, [-1, 0, 0], [0, 1, 0], 0.14, 0.12, 0xe9ecef, LIGHT_REVERSE);
    lamp(g, 0, H - 0.3, rz, [-1, 0, 0], [0, 1, 0], 0.5, 0.05, COL.redLens, LIGHT_BRAKE);
    // lunette arrière (car) ou trappe moteur ajourée (bus)
    if (!bus) {
      g.paint(COL.glass, SURF_GLASS).tile(tile('verre'));
      g.face([hw * 0.85, wy0, rz, -hw * 0.85, wy0, rz, -hw * 0.85, wy1, rz, hw * 0.85, wy1, rz], null, [0, 0, -1]);
      g.tile(null);
    }
    g.paint(0xffffff, SURF_FIXED).tile(tile('calandre'));
    g.panel(0, gc + 0.62, rz, [-1, 0, 0], [0, 1, 0], hw * 1.0, 0.5);
    g.tile(null);
    plate(g, false, gc + 0.22, rz - 0.004, 'B');
    bumper(g, false, hw * 0.96, gc + 0.02, gc + 0.16, -hl + 0.07, 0.12);
  }
  meta.tail.push(hw * 0.82, gc + 0.75, -hl, -hw * 0.82, gc + 0.75, -hl);

  // ── roues ──
  g.mirror(() => {
    wheel(g, far, W / 2, zF, r, ww, 'pl', true);
    wheel(g, far, W / 2, zR, r, ww * 1.7, 'pl', false);
    arch(g, far, hw + 0.004, zF, r, gc);
    arch(g, far, hw + 0.004, zR, r, gc);
  });

  // ── livrée et toit ──
  if (bus) {
    // bandeau clair au-dessus des vitres
    g.paint(0xeef0ee, SURF_FIXED);
    g.mirror(() => { g.face([glassX, wy1 + 0.06, bandZ0, glassX, wy1 + 0.06, bandZ1, glassX, wy1 + 0.34, bandZ1, glassX, wy1 + 0.34, bandZ0], null, [1, 0, 0]); });
    if (!far) {
      g.paint(0xd7dadd, SURF_FIXED).box(-0.8, 0.8, H, H + 0.16, -hl + 1.2, -hl + 3.4).box(-0.7, 0.7, H, H + 0.12, 0.6, 2.4);
    }
  } else {
    // car de transport : « POLICE », liseré bleu, soutes
    const ty = gc + 0.98;
    decal(g, 'police', 'L', hw + 0.014, ty, -0.6, 0.48);
    decal(g, 'police', 'R', -(hw + 0.014), ty, -0.6, 0.48);
    g.paint(COL.policeBlue, SURF_FIXED);
    g.mirror(() => { g.face([glassX, wy0 - 0.16, bandZ0, glassX, wy0 - 0.16, bandZ1, glassX, wy0 - 0.08, bandZ1, glassX, wy0 - 0.08, bandZ0], null, [1, 0, 0]); });
    if (!far) {
      // trappes de soute
      g.paint(COL.dark, SURF_DARK);
      g.mirror(() => {
        for (let i = 0; i < 3; i++) {
          const z0 = zR + r * 1.6 + i * 1.55;
          if (z0 + 1.4 > zF - r * 1.5) break;
          g.face([hw + 0.006, gc + 0.12, z0, hw + 0.006, gc + 0.12, z0 + 1.45, hw + 0.006, gc + 0.14, z0 + 1.45, hw + 0.006, gc + 0.14, z0], null, [1, 0, 0]);
          g.face([hw + 0.006, gc + 0.12, z0, hw + 0.006, gc + 0.12, z0 + 0.02, hw + 0.006, gc + 0.72, z0 + 0.02, hw + 0.006, gc + 0.72, z0], null, [1, 0, 0]);
          g.face([hw + 0.006, gc + 0.7, z0, hw + 0.006, gc + 0.7, z0 + 1.45, hw + 0.006, gc + 0.72, z0 + 1.45, hw + 0.006, gc + 0.72, z0], null, [1, 0, 0]);
        }
      });
      g.paint(0xd7dadd, SURF_FIXED).box(-0.75, 0.75, H, H + 0.18, -1.6, 0.8);
      decal(g, 'police', 'B', 0, gc + 1.2, rz - 0.004, 0.3);
    }
    lightbar(g, far, H + (far ? 0 : 0.03), hl - 1.0, 1.3);
    meta.beaconA.push(0.4, H + 0.1, hl - 1.0);
    meta.beaconB.push(-0.4, H + 0.1, hl - 1.0);
  }
  body();
  g.light(LIGHT_NONE);

  meta.wheelRadius = r;
  meta.fire = [0, H * 0.6, hl - 1.5, 0, H * 0.7, 0, 0, H * 0.6, -hl + 1.5, 0, H * 0.9, -hl + 4];
  meta.cockpit = 'truck';
  meta.beltY = wsY0; meta.hoodY = wsY0 - 0.2; meta.roofY = H; meta.cowlZ = hl; meta.halfWidth = hw;
  meta.sag = r * 0.22;
  return meta;
}
