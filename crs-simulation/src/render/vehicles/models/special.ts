/* Engins spéciaux du maintien de l'ordre : ENGIN LANCEUR D'EAU (police) et CENTAURE (gendarmerie).
 * Valeurs de référence : dossier 02 §4.2 et §4.3 (Centaure 7,5 × 2,94 × 3,82 m, caisse à ≈ 3,0 m, lame avant,
 * lance-grenades téléopéré de 30 tubes ; ELE 9,67 × 2,60 × 3,72 m, deux canons de toit, cabine grillagée). */

import type { VehicleDef } from '@/core/contracts';
import {
  LIGHT_BEACON_A, LIGHT_BEACON_B, LIGHT_BRAKE, LIGHT_HEAD, LIGHT_IND_L, LIGHT_IND_R, LIGHT_NONE, LIGHT_TAIL, PART_BARREL0,
  PART_BARREL1, PART_DOOR, PART_TURRET0, PART_TURRET1, SURF_DARK, SURF_FIXED, SURF_GLASS, SURF_LAMP, SURF_METAL,
} from '../geo';
import type { Geo } from '../geo';
import { COL, EDGE_SIDE, antenna, beacon, decal, grilleOver, lamp, patch, pipe, plate, shell, wheel } from '../kit';
import type { Station } from '../kit';
import { tile } from '../atlas-layout';
import { truckBase } from './trucks';
import { emptyMeta } from './types';
import type { ModelMeta } from './types';

// ── engin lanceur d'eau ───────────────────────────────────────────────────────────────

export function buildCanonEau(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const H = def.height;
  // positions des canons : celles du contrat si elles existent, sinon deux canons de toit à l'avant de la citerne
  const turrets = def.turrets.filter((t) => t.kind === 'canon_eau');
  const tp: [number, number, number][] = turrets.length
    ? turrets.slice(0, 2).map((t) => [-t.x, t.y, t.z])
    : [[0.62, H - 0.5, def.length / 2 - 2.9], [-0.62, H - 0.5, def.length / 2 - 2.9]];
  const cabTop = Math.min(2.95, H - 0.75);
  const a = truckBase(g, far, def, { cabLen: 2.35, cabTop, rearAxles: 2, wheelR: 0.52, grilles: true, frontInset: 0.26, bumperColor: 0x2a2c30, lightbar: true });
  const { hl, hw, zCab, yDeck, meta } = a;
  const white = (): void => { g.body(); };
  const tankTop = Math.min(H - 0.55, Math.min(...tp.map((p) => p[1])) - 0.12);
  const z1 = zCab - 0.08;

  // ── citerne : caisse à pans coupés ──
  const st: Station[] = [
    { z: -hl + 0.05, w: hw * 0.96, y0: yDeck - 0.3, y1: tankTop - 0.1, round: 0.3, tuck: 0.05, wTop: hw * 0.6 },
    { z: -hl + 0.35, w: hw, y0: yDeck - 0.3, y1: tankTop, round: 0.34, tuck: 0.05, wTop: hw * 0.68 },
    { z: z1, w: hw, y0: yDeck - 0.3, y1: tankTop, round: 0.34, tuck: 0.05, wTop: hw * 0.68 },
  ];
  shell(g, far, st, white, true, true, 30);
  const xs = hw + 0.012;
  const sideMid = (yDeck + tankTop - 0.34) / 2;
  // « POLICE » et liseré bleu sur chaque flanc
  for (const s of [1, -1]) {
    const face = s > 0 ? 'L' as const : 'R' as const;
    decal(g, 'police', face, xs * s, sideMid + 0.28, (-hl + z1) / 2 + 0.3, 0.62);
    g.paint(COL.policeBlue, SURF_FIXED);
    g.face([xs * s, yDeck + 0.34, -hl + 0.4, xs * s, yDeck + 0.34, z1 - 0.05, xs * s, yDeck + 0.5, z1 - 0.05, xs * s, yDeck + 0.5, -hl + 0.4], null, [s, 0, 0]);
    if (!far) {
      // coffres latéraux à rideau sous la citerne
      for (let i = 0; i < 3; i++) {
        const zc = -hl + 1.0 + i * 1.55;
        if (zc + 0.7 > z1) break;
        decal(g, 'rideau', face, xs * s, yDeck - 0.02, zc, 0.52, 1.35, [0, 0, 1, 0.4]);
      }
    }
  }
  if (!far) {
    decal(g, 'police', 'B', 0, sideMid + 0.2, -hl + 0.05 - 0.012, 0.36);
    decal(g, 'chevrons', 'B', 0, yDeck + 0.1, -hl + 0.05 - 0.012, 0.5, hw * 1.7);
    // passerelle de toit et garde-corps
    g.paint(0x9aa0a6, SURF_METAL);
    const ry = tankTop + 0.02, rw = hw * 0.66;
    g.box(-rw, rw, tankTop, ry, -hl + 0.4, z1 - 0.1);
    g.mirror(() => {
      pipe(g, [rw, ry, -hl + 0.5, rw, ry + 0.42, -hl + 0.5, rw, ry + 0.42, z1 - 1.6, rw, ry, z1 - 1.6], 0.018, 5);
      g.tube(rw, ry, (-hl + z1) / 2 - 0.5, rw, ry + 0.42, (-hl + z1) / 2 - 0.5, 0.016, 0.016, 5, false, false);
    });
    // échelle arrière
    g.tube(hw * 0.5, yDeck, -hl + 0.02, hw * 0.5, tankTop, -hl + 0.02, 0.02, 0.02, 5);
    g.tube(hw * 0.5 + 0.38, yDeck, -hl + 0.02, hw * 0.5 + 0.38, tankTop, -hl + 0.02, 0.02, 0.02, 5);
    for (let y = yDeck + 0.2; y < tankTop - 0.1; y += 0.3) g.tube(hw * 0.5, y, -hl + 0.02, hw * 0.5 + 0.38, y, -hl + 0.02, 0.014, 0.014, 4, false, false);
    // trappes de remplissage, caméras périphériques
    g.paint(0xd7dadd, SURF_FIXED).tube(0, tankTop, -hl + 1.4, 0, tankTop + 0.1, -hl + 1.4, 0.32, 0.32, 12, false, true);
    g.tube(0, tankTop, -hl + 3.2, 0, tankTop + 0.1, -hl + 3.2, 0.32, 0.32, 12, false, true);
    g.paint(COL.plastic, SURF_FIXED);
    for (const [cx, cz] of [[hw - 0.1, -hl + 0.3], [-(hw - 0.1), -hl + 0.3], [hw - 0.1, z1 - 0.3], [-(hw - 0.1), z1 - 0.3]] as const) {
      g.cube(cx, tankTop - 0.36, cz, 0.1, 0.1, 0.14);
    }
  }

  // ── pare-buffle : cadre tubulaire et tôle, devant la cabine en retrait ──
  const gcB = 0.5, fz = hl;
  const zc = a.zFront;
  if (far) {
    g.paint(0x2a2c30, SURF_FIXED).box(-hw * 0.95, hw * 0.95, gcB, a.yBelt - 0.1, zc, fz, 1 | 4);
  } else {
    g.paint(0x2f3237, SURF_METAL);
    const bz = fz - 0.045, by1 = a.yBelt + 0.02;
    g.mirror(() => {
      // montants, jambes de force vers la cabine, retour protège-phare
      g.tube(hw * 0.9, gcB, bz, hw * 0.9, by1, bz, 0.045, 0.045, 6);
      g.tube(hw * 0.36, gcB, bz, hw * 0.36, by1 + 0.14, bz, 0.04, 0.04, 6);
      g.tube(hw * 0.9, by1, bz, hw * 0.62, by1 + 0.14, bz, 0.04, 0.04, 6, false, false);
      g.tube(hw * 0.9, gcB + 0.5, bz, hw * 0.9, gcB + 0.5, zc + 0.02, 0.035, 0.035, 5, false, false);
      g.tube(hw * 0.9, gcB + 0.08, bz, hw * 0.9, gcB + 0.08, zc + 0.02, 0.035, 0.035, 5, false, false);
    });
    for (const y of [gcB + 0.06, gcB + 0.34, (gcB + by1) / 2 + 0.16]) g.tube(-hw * 0.9, y, bz, hw * 0.9, y, bz, 0.04, 0.04, 6);
    g.tube(-hw * 0.62, by1 + 0.14, bz, hw * 0.62, by1 + 0.14, bz, 0.04, 0.04, 6);
    // tôle de protection basse et plaque
    g.paint(0x26282c, SURF_FIXED).box(-hw * 0.88, hw * 0.88, gcB - 0.06, gcB + 0.3, bz - 0.1, bz - 0.04);
  }

  // ── canons à eau ──
  for (let i = 0; i < tp.length; i++) {
    const [tx, ty, tz] = tp[i]!;
    const yawPart = i === 0 ? PART_TURRET0 : PART_TURRET1;
    const pitchPart = i === 0 ? PART_BARREL0 : PART_BARREL1;
    if (far) {
      // au loin : un bloc pour la tourelle, un tube pour la lance
      g.part(yawPart, tx, ty, tz);
      g.paint(0x2c2f34, SURF_METAL).box(tx - 0.16, tx + 0.16, tankTop, ty + 0.1, tz - 0.16, tz + 0.16, 1);
      g.part(pitchPart, tx, ty, tz);
      g.paint(0xc8ccd1, SURF_METAL).tube(tx, ty, tz - 0.2, tx, ty, tz + 1.0, 0.075, 0.05, 4, false, true);
      g.noPart();
      continue;
    }
    // socle fixe
    g.noPart().paint(0x3a3d42, SURF_METAL);
    g.tube(tx, tankTop, tz, tx, ty - 0.2, tz, 0.2, 0.17, 10, false, true);
    // tourelle (gisement) : fût, berceau, écran et caméra
    g.part(yawPart, tx, ty, tz);
    g.paint(0x2c2f34, SURF_METAL).tube(tx, ty - 0.2, tz, tx, ty - 0.02, tz, 0.14, 0.12, 10, false, true);
    g.box(tx - 0.17, tx - 0.11, ty - 0.1, ty + 0.16, tz - 0.1, tz + 0.1);
    g.box(tx + 0.11, tx + 0.17, ty - 0.1, ty + 0.16, tz - 0.1, tz + 0.1);
    g.paint(COL.plastic, SURF_FIXED).cube(tx + 0.25, ty + 0.1, tz + 0.02, 0.12, 0.12, 0.2);
    g.paint(0xffffff, SURF_FIXED).tile(tile('optique')).panel(tx + 0.25, ty + 0.1, tz + 0.124, [1, 0, 0], [0, 1, 0], 0.1, 0.1).tile(null);
    // canon (site) : lance et buse, tourillon sur l'axe de gisement
    g.part(pitchPart, tx, ty, tz);
    g.paint(0xc8ccd1, SURF_METAL);
    const seg = 10;
    g.tube(tx, ty, tz - 0.22, tx, ty, tz + 0.75, 0.075, 0.062, seg, true, false);
    g.paint(0x2a2c30, SURF_METAL).tube(tx, ty, tz + 0.75, tx, ty, tz + 1.02, 0.062, 0.04, seg, false, true);
    {
      g.tube(tx, ty, tz + 0.7, tx, ty, tz + 0.78, 0.085, 0.085, seg);
      // projecteur solidaire du canon
      g.paint(COL.plastic, SURF_FIXED).tube(tx, ty + 0.17, tz + 0.05, tx, ty + 0.17, tz + 0.22, 0.07, 0.08, 8, true, false);
      g.paint(COL.headLens, SURF_LAMP).light(LIGHT_HEAD).tube(tx, ty + 0.17, tz + 0.22, tx, ty + 0.17, tz + 0.225, 0.08, 0.08, 8, false, true);
      g.light(LIGHT_NONE);
    }
    g.noPart();
  }

  // mât de caméras périphériques à l'arrière du toit : c'est lui qui donne la hauteur hors tout
  g.noPart().paint(0x2a2f38, SURF_METAL);
  g.tube(0, tankTop, -hl + 0.7, 0, H - 0.14, -hl + 0.7, 0.05, 0.04, far ? 4 : 8, false, false);
  g.paint(COL.plastic, SURF_FIXED).cube(0, H - 0.07, -hl + 0.7, 0.22, 0.14, 0.22);
  if (!far) {
    g.paint(0xffffff, SURF_FIXED).tile(tile('optique'));
    g.panel(0, H - 0.07, -hl + 0.7 - 0.112, [-1, 0, 0], [0, 1, 0], 0.11, 0.11);
    g.panel(0.112, H - 0.07, -hl + 0.7, [0, 0, -1], [0, 1, 0], 0.11, 0.11);
    g.panel(-0.112, H - 0.07, -hl + 0.7, [0, 0, 1], [0, 1, 0], 0.11, 0.11);
    g.tile(null);
  }
  // gyrophares arrière
  beacon(g, far, hw * 0.6, tankTop - 0.1, -hl + 0.2, LIGHT_BEACON_A, 0.085);
  beacon(g, far, -hw * 0.6, tankTop - 0.1, -hl + 0.2, LIGHT_BEACON_B, 0.085);
  meta.beaconA.push(hw * 0.6, tankTop + 0.05, -hl + 0.2);
  meta.beaconB.push(-hw * 0.6, tankTop + 0.05, -hl + 0.2);
  white();
  meta.fire = [0, cabTop * 0.8, hl - 1.2, 0, tankTop * 0.8, -hl + 2];
  return meta;
}

// ── Centaure ──────────────────────────────────────────────────────────────────────────

export function buildCentaure(g: Geo, far: boolean, def: VehicleDef): ModelMeta {
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2, hw = W / 2 - 0.02;
  const meta = emptyMeta(def);
  const r = 0.66, ww = 0.44;
  const blue = (): void => { g.body(); };
  const blueDark = (): void => { g.body(0.72); };
  // tourelleau : position du contrat si elle existe ; la caisse culmine à 3,0 m (ou sous le tourelleau)
  const tdef = def.turrets.find((t) => t.kind === 'lance_grenades');
  const hullTop = Math.min(H - 0.78, tdef ? tdef.y : 3.0);
  const tur: [number, number, number] = tdef ? [-tdef.x, Math.max(tdef.y, hullTop), tdef.z] : [0, hullTop, -0.3];
  const over = L - def.wheelbase;
  const zF = hl - Math.min(over * 0.42, 1.75), zR = zF - def.wheelbase;
  const yFloor = r * 2 + 0.06;      // dessous de la caisse haute, au-dessus des roues
  const zNose = hl - 0.42;          // la lame occupe les 40 derniers centimètres
  const zCowl = zNose - 1.45;       // pied de pare-brise
  const zRoofF = zCowl - 0.5;       // haut de pare-brise
  const zRear = -hl + 0.16;
  const yHood = yFloor + 0.62;

  // ── caisse basse (entre les roues) ──
  g.noPart().tile(null);
  blueDark();
  if (far) g.box(-(hw - ww - 0.1), hw - ww - 0.1, 0.5, yFloor, zRear + 0.3, zNose - 0.2, 2);
  else {
    const lw = hw - ww - 0.08;
    g.prism([zRear + 0.2, yFloor, zRear + 0.5, 0.48, zNose - 0.5, 0.48, zNose - 0.05, 0.85, zNose - 0.05, yFloor], -lw, lw);
    // ponts et arbres
    g.paint(COL.dark, SURF_DARK);
    g.tube(-hw + ww, r, zF, hw - ww, r, zF, 0.13, 0.13, 8, false, false);
    g.tube(-hw + ww, r, zR, hw - ww, r, zR, 0.13, 0.13, 8, false, false);
  }

  // ── caisse haute blindée, à pans coupés ──
  const st: Station[] = [
    { z: zRear, w: hw * 0.9, y0: yFloor + 0.1, y1: hullTop - 0.12, round: 0.24, tuck: 0.14, wTop: hw * 0.62 },
    { z: zRear + 0.3, w: hw, y0: yFloor, y1: hullTop, round: 0.3, tuck: 0.16, wTop: hw * 0.7 },
    { z: zRoofF, w: hw, y0: yFloor, y1: hullTop, round: 0.3, tuck: 0.16, wTop: hw * 0.7 },
    { z: zCowl, w: hw * 0.98, y0: yFloor, y1: yHood + 0.12, round: 0.14, tuck: 0.16, wTop: hw * 0.8 },
    { z: zNose - 0.3, w: hw * 0.94, y0: yFloor, y1: yHood, round: 0.12, tuck: 0.14, wTop: hw * 0.76 },
    { z: zNose, w: hw * 0.86, y0: yFloor + 0.12, y1: yHood - 0.26, round: 0.1, tuck: 0.1 },
  ];
  shell(g, far, far ? [st[0]!, st[1]!, st[2]!, st[3]!, st[5]!] : st, blue, true, true, 28);

  // ── vitrages blindés ──
  const glassCol = 0x1c2a33;
  // pare-brise en deux panneaux sur le pan incliné
  const wsY0 = yHood + 0.22, wsY1 = hullTop - 0.2;
  const wsAt = (y: number): number => zCowl + ((y - (yHood + 0.12)) / (hullTop - (yHood + 0.12))) * (zRoofF - zCowl);
  const wsN = [0, zCowl - zRoofF, hullTop - yHood - 0.12];
  for (const s of [1, -1]) {
    const x0 = 0.09 * s, x1 = hw * 0.66 * s;
    const quad = [x0, wsY0, wsAt(wsY0), x1, wsY0, wsAt(wsY0), x1 * 0.96, wsY1, wsAt(wsY1), x0, wsY1, wsAt(wsY1)];
    const nl = Math.hypot(wsN[1]!, wsN[2]!);
    const off = quad.map((v, i) => (i % 3 === 1 ? v + (wsN[1]! / nl) * 0.02 : i % 3 === 2 ? v + (wsN[2]! / nl) * 0.02 : v));
    g.paint(glassCol, SURF_GLASS).tile(tile('verre')).face(off, null, wsN).tile(null);
    if (!far) grilleOver(g, quad, [0, wsN[1]! / nl, wsN[2]! / nl], 0.07);
  }
  // vitres latérales : porte de cabine puis trois épiscopes du compartiment arrière
  const sideX = hw + 0.012;
  const winY0 = yFloor + 0.92, winY1 = Math.min(hullTop - 0.36, winY0 + 0.5);
  const sideWin = (s: number, z0: number, z1: number, y0: number, y1: number): void => {
    const x = sideX * s;
    g.paint(glassCol, SURF_GLASS).tile(tile('verre'));
    g.face([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], null, [s, 0, 0]);
    g.tile(null);
    if (!far) {
      // encadrement d'acier
      g.paint(0x8a93a6, SURF_METAL);
      const f = 0.03;
      g.box(Math.min(x, x + 0.012 * s), Math.max(x, x + 0.012 * s), y0 - f, y0, z0 - f, z1 + f);
      g.box(Math.min(x, x + 0.012 * s), Math.max(x, x + 0.012 * s), y1, y1 + f, z0 - f, z1 + f);
      g.box(Math.min(x, x + 0.012 * s), Math.max(x, x + 0.012 * s), y0, y1, z0 - f, z0);
      g.box(Math.min(x, x + 0.012 * s), Math.max(x, x + 0.012 * s), y0, y1, z1, z1 + f);
    }
  };
  const cabZ1 = zRoofF - 0.08, cabZ0 = cabZ1 - 0.95;
  for (const s of [1, -1]) {
    if (far) {
      sideWin(s, zRear + 1.0, cabZ1 - 0.2, winY0, winY1);
      continue;
    }
    // porte de cabine ouvrante
    g.noPart().paint(COL.interior, SURF_DARK);
    const xa = (hw + 0.006) * s;
    g.face([xa, yFloor + 0.06, cabZ0, xa, yFloor + 0.06, cabZ1, xa, hullTop - 0.34, cabZ1, xa, hullTop - 0.34, cabZ0], null, [s, 0, 0]);
    g.part(PART_DOOR, hw * s, 0, cabZ1, (s > 0 ? 1 : 2) * s);
    blue();
    const xd = (hw + 0.024) * s;
    g.face([xd, yFloor + 0.08, cabZ0 + 0.015, xd, yFloor + 0.08, cabZ1 - 0.015, xd, hullTop - 0.36, cabZ1 - 0.015, xd, hullTop - 0.36, cabZ0 + 0.015], null, [s, 0, 0]);
    g.paint(glassCol, SURF_GLASS).tile(tile('verre'));
    const xw = (hw + 0.03) * s;
    g.face([xw, winY0, cabZ0 + 0.2, xw, winY0, cabZ1 - 0.15, xw, winY1 + 0.08, cabZ1 - 0.15, xw, winY1 + 0.08, cabZ0 + 0.2], null, [s, 0, 0]);
    g.tile(null).paint(COL.plastic, SURF_FIXED).cube((hw + 0.04) * s, yFloor + 0.75, cabZ0 + 0.14, 0.03, 0.05, 0.16);
    g.noPart();
    meta.doors.push({ index: s > 0 ? 0 : 1, x: hw * s, z: (cabZ0 + cabZ1) / 2 });
    // épiscopes
    const span = cabZ0 - 0.25 - (zRear + 0.75);
    for (let i = 0; i < 3; i++) {
      const zc = zRear + 0.75 + span * ((i + 0.5) / 3);
      sideWin(s, zc - 0.3, zc + 0.3, winY0 + 0.04, winY1 - 0.02);
      // sabord de tir sous la vitre
      g.paint(0x10131a, SURF_METAL).tube(sideX * s, winY0 - 0.2, zc, (sideX + 0.02) * s, winY0 - 0.2, zc, 0.06, 0.06, 8, false, true);
    }
    // marchepied
    g.paint(COL.dark, SURF_METAL);
    pipe(g, [hw * s, yFloor + 0.02, cabZ0 + 0.1, (hw + 0.14) * s, yFloor - 0.4, cabZ0 + 0.1, (hw + 0.14) * s, yFloor - 0.4, cabZ1 - 0.1, hw * s, yFloor + 0.02, cabZ1 - 0.1], 0.022, 5);
  }

  // ── marquages ──
  const markY = yFloor + 0.62, markZ = (zRear + 0.4 + cabZ0) / 2;
  const markH = Math.min(0.4, (cabZ0 - zRear - 0.6) / 7.2);
  decal(g, 'gendarmerie', 'L', sideX + 0.002, markY, markZ, markH);
  decal(g, 'gendarmerie', 'R', -sideX - 0.002, markY, markZ, markH);
  if (!far) {
    // plaques de blindage rapportées (lignes de tôle et rivets, teintées par la carrosserie)
    for (const s of [1, -1]) {
      g.body(0.97); g.tile(tile('blindage'));
      g.panel((sideX - 0.006) * s, yFloor + 0.52, markZ, s > 0 ? [0, 0, -1] : [0, 0, 1], [0, 1, 0], cabZ0 - zRear - 0.5, 0.95);
      g.tile(null);
    }
  }

  // ── arrière : porte de débarquement, feux protégés ──
  const rz = zRear - 0.008;
  if (!far) {
    g.noPart().paint(COL.interior, SURF_DARK);
    g.face([0.62, yFloor + 0.16, rz, -0.62, yFloor + 0.16, rz, -0.62, hullTop - 0.42, rz, 0.62, hullTop - 0.42, rz], null, [0, 0, -1]);
    g.part(PART_DOOR, -0.62, 0, zRear, -3);
    blue();
    g.face([0.6, yFloor + 0.18, rz - 0.02, -0.6, yFloor + 0.18, rz - 0.02, -0.6, hullTop - 0.44, rz - 0.02, 0.6, hullTop - 0.44, rz - 0.02], null, [0, 0, -1]);
    g.paint(glassCol, SURF_GLASS).tile(tile('verre'));
    g.face([0.25, winY0 + 0.05, rz - 0.026, -0.25, winY0 + 0.05, rz - 0.026, -0.25, winY1, rz - 0.026, 0.25, winY1, rz - 0.026], null, [0, 0, -1]);
    g.tile(null);
    decal(g, 'gendarmerie', 'B', 0, yFloor + 0.62, rz - 0.026, 0.15);
    g.paint(COL.plastic, SURF_FIXED).cube(0.45, yFloor + 0.9, rz - 0.04, 0.16, 0.05, 0.04);
    g.noPart();
    meta.doors.push({ index: 2, x: 0, z: zRear });
    // suspentes de la marche arrière
    g.paint(COL.dark, SURF_METAL);
    g.mirror(() => { g.tube(0.7, yFloor - 0.32, -hl + 0.02, 0.7, yFloor + 0.1, zRear, 0.025, 0.025, 5); });
    plate(g, false, yFloor + 0.3, rz - 0.004, 'B', 0.52, 0.11, hw * 0.55);
  }
  // marche arrière repliable
  g.noPart().paint(COL.dark, SURF_METAL).box(-0.7, 0.7, yFloor - 0.35, yFloor - 0.3, -hl, zRear, far ? 1 : 0);
  g.mirror(() => {
    lamp(g, hw * 0.74, yFloor + 0.42, rz - (far ? 0 : 0.002), [-1, 0, 0], [0, 1, 0], 0.16, 0.24, COL.redLens, LIGHT_TAIL);
  });
  if (!far) {
    lamp(g, hw * 0.74, yFloor + 0.66, rz - 0.002, [-1, 0, 0], [0, 1, 0], 0.16, 0.1, COL.amber, LIGHT_IND_L);
    lamp(g, -hw * 0.74, yFloor + 0.66, rz - 0.002, [-1, 0, 0], [0, 1, 0], 0.16, 0.1, COL.amber, LIGHT_IND_R);
    lamp(g, 0, hullTop - 0.3, rz - 0.002, [-1, 0, 0], [0, 1, 0], 0.4, 0.05, COL.redLens, LIGHT_BRAKE);
  }
  meta.tail.push(hw * 0.74, yFloor + 0.42, zRear, -hw * 0.74, yFloor + 0.42, zRear);

  // ── avant : phares protégés sur les pans du capot ──
  const s4 = st[4]!, s5 = st[5]!;
  g.paint(COL.headLens, SURF_LAMP).light(LIGHT_HEAD);
  if (far) {
    g.mirror(() => { g.face([hw * 0.5, yHood - 0.5, zNose + 0.01, hw * 0.8, yHood - 0.5, zNose + 0.01, hw * 0.8, yHood - 0.32, zNose + 0.01, hw * 0.5, yHood - 0.32, zNose + 0.01], null, [0, 0, 1]); });
  } else {
    patch(g, s4, s5, EDGE_SIDE, 0.25, 0.9, 0.45, 0.85, 1, 0.012);
    patch(g, s4, s5, EDGE_SIDE, 0.25, 0.9, 0.45, 0.85, -1, 0.012);
    g.paint(COL.amber, SURF_LAMP).light(LIGHT_IND_L); patch(g, s4, s5, EDGE_SIDE, 0.25, 0.9, 0.22, 0.4, 1, 0.012);
    g.light(LIGHT_IND_R); patch(g, s4, s5, EDGE_SIDE, 0.25, 0.9, 0.22, 0.4, -1, 0.012);
    g.light(LIGHT_NONE);
    // grille de calandre blindée et persiennes de capot
    g.paint(0xffffff, SURF_FIXED).tile(tile('calandre'));
    g.panel(0, (s5.y0 + s5.y1) / 2 + 0.02, zNose + 0.008, [1, 0, 0], [0, 1, 0], s5.w * 1.5, (s5.y1 - s5.y0) * 0.7);
    g.tile(null);
    blueDark();
    for (let i = 0; i < 4; i++) g.box(-hw * 0.5, hw * 0.5, yHood + 0.03 + i * 0.006, yHood + 0.045 + i * 0.006, zNose - 0.6 - i * 0.2, zNose - 0.5 - i * 0.2);
  }
  g.light(LIGHT_NONE);
  meta.head.push(hw * 0.86, yHood - 0.25, zNose - 0.1, -hw * 0.86, yHood - 0.25, zNose - 0.1);

  // ── lame de dégagement ──
  const bladeY0 = 0.38, bladeY1 = bladeY0 + 0.95;
  const bw = W / 2;
  blueDark();
  if (far) {
    g.hexa([
      -bw, bladeY0, hl - 0.16, bw, bladeY0, hl - 0.16, bw, bladeY0, hl, -bw, bladeY0, hl,
      -bw, bladeY1, hl - 0.3, bw, bladeY1, hl - 0.3, bw, bladeY1, hl - 0.16, -bw, bladeY1, hl - 0.16,
    ], 1);
  } else {
    const from = g.mark();
    // profil concave : bas en avant, creux au milieu, haut qui revient vers l'avant
    const prof = [
      hl, bladeY0, hl - 0.12, bladeY0 + 0.3, hl - 0.15, bladeY0 + 0.62, hl - 0.06, bladeY1,
      hl - 0.14, bladeY1, hl - 0.24, bladeY0 + 0.62, hl - 0.2, bladeY0 + 0.3, hl - 0.07, bladeY0,
    ];
    // profil non convexe : on l'extrude en trois prismes convexes empilés
    for (let i = 0; i < 3; i++) {
      const a = i * 2, b = (7 - i) * 2;
      g.prism([prof[a]!, prof[a + 1]!, prof[a + 2]!, prof[a + 3]!, prof[b - 2]!, prof[b - 1]!, prof[b]!, prof[b + 1]!], -bw, bw);
    }
    g.smooth(from, 35);
    // lame d'usure et joues latérales
    g.paint(0x6f747b, SURF_METAL).box(-bw, bw, bladeY0 - 0.04, bladeY0 + 0.04, hl - 0.075, hl + 0.0);
    blueDark();
    g.mirror(() => {
      g.prism([hl - 0.02, bladeY0, hl - 0.06, bladeY1, hl - 0.36, bladeY1 - 0.1, hl - 0.3, bladeY0], bw - 0.03, bw);
      // bras de poussée et vérins
      g.prism([hl - 0.2, bladeY0 + 0.15, hl - 0.2, bladeY0 + 0.4, zNose - 0.5, 0.95, zNose - 0.5, 0.7], hw * 0.5, hw * 0.5 + 0.1);
      g.paint(COL.chrome, SURF_METAL).tube(hw * 0.3, yHood - 0.45, zNose - 0.05, hw * 0.3, bladeY0 + 0.7, hl - 0.22, 0.035, 0.035, 6);
      blueDark();
    });
    plate(g, false, bladeY1 - 0.16, hl - 0.045, 'F');
  }

  // ── roues ──
  g.mirror(() => {
    wheel(g, far, W / 2, zF, r, ww, 'pl', true, 1, false, 0, 0x7d838b);
    wheel(g, far, W / 2, zR, r, ww, 'pl', false, 1, false, 0, 0x7d838b);
    if (!far) {
      // ailes anguleuses au-dessus des roues
      blueDark();
      for (const z of [zF, zR]) {
        g.prism([z - r * 1.15, yFloor - 0.02, z - r * 0.7, yFloor + 0.05, z + r * 0.7, yFloor + 0.05, z + r * 1.15, yFloor - 0.02], hw - ww - 0.06, hw + 0.0);
      }
    }
  });

  // ── toit : tourelleau lance-grenades téléopéré ──
  const [tx, ty, tz] = tur;
  g.noPart().paint(0x232830, SURF_METAL);
  g.tube(tx, hullTop, tz, tx, ty + 0.06, tz, 0.42, 0.4, far ? 6 : 14, false, true);
  g.part(PART_TURRET0, tx, ty, tz);
  blueDark();
  const topY = H - 0.1;
  const trunY = ty + 0.42;
  if (far) {
    g.box(tx - 0.3, tx + 0.3, ty + 0.06, topY - 0.1, tz - 0.3, tz + 0.3, 1);
  } else {
    const from = g.mark();
    g.hexa([
      tx - 0.32, ty + 0.06, tz - 0.36, tx + 0.32, ty + 0.06, tz - 0.36, tx + 0.32, ty + 0.06, tz + 0.34, tx - 0.32, ty + 0.06, tz + 0.34,
      tx - 0.24, topY - 0.1, tz - 0.3, tx + 0.24, topY - 0.1, tz - 0.3, tx + 0.24, topY - 0.1, tz + 0.2, tx - 0.24, topY - 0.1, tz + 0.2,
    ], 1);
    g.smooth(from, 30);
    // bloc optronique (caméra jour / thermique) au sommet
    g.paint(COL.plastic, SURF_FIXED).cube(tx - 0.02, topY - 0.02, tz + 0.02, 0.3, 0.16, 0.3);
    g.paint(0xffffff, SURF_FIXED).tile(tile('optique'));
    g.panel(tx - 0.09, topY - 0.02, tz + 0.172, [1, 0, 0], [0, 1, 0], 0.12, 0.12);
    g.panel(tx + 0.07, topY - 0.02, tz + 0.172, [1, 0, 0], [0, 1, 0], 0.1, 0.1);
    g.tile(null);
  }
  // berceaux multi-tubes de part et d'autre (site commun, tourillon sur l'axe)
  g.part(PART_BARREL0, tx, trunY, tz);
  for (const s of [1, -1]) {
    const cx = tx + 0.56 * s;
    g.paint(0x1d2128, SURF_METAL);
    g.cube(cx, trunY, tz + 0.08, 0.44, 0.4, 0.56);
    if (!far) {
      // face avant : 15 tubes par berceau, 30 au total
      g.paint(0xffffff, SURF_FIXED).tile(tile('tubes'));
      g.panel(cx, trunY, tz + 0.365, [1, 0, 0], [0, 1, 0], 0.42, 0.38);
      g.tile(null);
      g.paint(0x1d2128, SURF_METAL).tube(tx + 0.3 * s, trunY, tz, cx - 0.2 * s, trunY, tz, 0.07, 0.07, 6, false, false);
    }
  }
  g.noPart();

  // ── toit : mât de caméras, antennes, gyrophares, trappes ──
  const mx = -hw * 0.42, mz = zRear + 0.7;
  g.paint(0x2a2f38, SURF_METAL);
  g.tube(mx, hullTop, mz, mx, H - 0.24, mz, 0.06, 0.045, far ? 4 : 8, false, false);
  g.paint(COL.plastic, SURF_FIXED);
  if (far) g.cube(mx, H - 0.12, mz, 0.24, 0.24, 0.24);
  else {
    g.ball(mx, H - 0.13, mz, 0.13, 10, 3);
    g.paint(0xffffff, SURF_FIXED).tile(tile('optique'));
    g.panel(mx, H - 0.13, mz + 0.132, [1, 0, 0], [0, 1, 0], 0.13, 0.13);
    g.panel(mx + 0.132, H - 0.13, mz, [0, 0, -1], [0, 1, 0], 0.13, 0.13);
    g.panel(mx - 0.132, H - 0.13, mz, [0, 0, 1], [0, 1, 0], 0.13, 0.13);
    g.tile(null);
    antenna(g, false, hw * 0.5, hullTop, zRear + 0.5, 0.75, 0.3);
    antenna(g, false, hw * 0.3, hullTop, zRear + 0.9, 0.7, 0.3);
    // trappes et haut-parleur
    g.paint(0x18213a, SURF_FIXED);
    g.tube(hw * 0.35, hullTop, zRoofF - 0.5, hw * 0.35, hullTop + 0.05, zRoofF - 0.5, 0.3, 0.3, 12, false, true);
    g.tube(-hw * 0.35, hullTop, zRoofF - 0.5, -hw * 0.35, hullTop + 0.05, zRoofF - 0.5, 0.3, 0.3, 12, false, true);
    g.paint(0xc9ccd1, SURF_FIXED).tube(0, hullTop + 0.12, zRoofF - 0.1, 0, hullTop + 0.12, zRoofF + 0.1, 0.07, 0.12, 8, true, true);
    // diffuseurs lacrymogènes au bas de caisse
    g.paint(0x10131a, SURF_METAL);
    g.mirror(() => { for (let i = 0; i < 4; i++) g.cube(hw + 0.02, yFloor + 0.14, zRear + 0.9 + i * 0.75, 0.06, 0.1, 0.16); });
  }
  beacon(g, far, hw * 0.52, hullTop, zRoofF - 0.12, LIGHT_BEACON_A, 0.08);
  beacon(g, far, -hw * 0.52, hullTop, zRoofF - 0.12, LIGHT_BEACON_B, 0.08);
  meta.beaconA.push(hw * 0.52, hullTop + 0.12, zRoofF - 0.12);
  meta.beaconB.push(-hw * 0.52, hullTop + 0.12, zRoofF - 0.12);
  blue();

  meta.wheelRadius = r;
  meta.fire = [0, yHood + 0.2, zNose - 0.7, 0, hullTop * 0.8, -0.5];
  meta.cockpit = 'armored';
  meta.beltY = wsY0; meta.hoodY = yHood + 0.12; meta.roofY = hullTop; meta.cowlZ = zCowl; meta.halfWidth = hw;
  meta.grille = true;
  meta.sag = r * 0.12;
  return meta;
}
