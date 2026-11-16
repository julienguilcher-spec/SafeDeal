/* Boîte à outils de modélisation — équipements : roues et passages de roue, optiques, rampe lumineuse,
 * gyrophare, antenne, rétroviseurs, plaques, sérigraphie, pare-chocs, calandre, tubes.
 * Même repère que kit.ts : +z vers l'avant, +y vers le haut, +x vers la GAUCHE du véhicule. */

import {
  Geo, LIGHT_BEACON_A, LIGHT_BEACON_B, LIGHT_NONE, PART_WHEEL, PART_WHEEL_STEER, SURF_DARK, SURF_FIXED, SURF_GLASS,
  SURF_LAMP, SURF_METAL, SURF_PLATE, SURF_RUBBER,
} from './geo';
import { tile, tileAspect } from './atlas-layout';
import type { TileName } from './atlas-layout';
import { COL } from './palette';

// ── roues ────────────────────────────────────────────────────────────────────────────

export type WheelStyle = 'tole' | 'alu' | 'pl' | 'moto';

const RIM_TILE: Record<WheelStyle, TileName> = { tole: 'jante_tole', alu: 'jante_alu', pl: 'jante_pl', moto: 'jante_moto' };

/**
 * Roue du côté gauche (+x), face extérieure en x = xOuter ; appeler dans g.mirror() pour la paire.
 * `spinRatio` = rayon de référence du modèle / rayon de cette roue (les roues plus petites tournent plus vite).
 */
export function wheel(
  g: Geo, far: boolean, xOuter: number, z: number, r: number, w: number, style: WheelStyle, steer: boolean,
  spinRatio = 1, lean = false, partOverride = 0, rimTint = 0xffffff,
): void {
  const xc = xOuter - w / 2;
  g.push().translate(xc, r, z);
  g.part(partOverride || (steer ? PART_WHEEL_STEER : PART_WHEEL), 0, 0, 0, spinRatio).light(LIGHT_NONE).tile(null);
  if (far) {
    g.paint(COL.rubber, SURF_RUBBER);
    if (lean) g.lathe(0, 0, [-w / 2, r, w / 2, r, w / 2, 0], 6);
    else {
      g.lathe(0, 0, [-w / 2, r, w / 2, r, w / 2, r * 0.62], 6);
      g.paint(style === 'pl' ? 0x8f9399 : COL.rim, SURF_METAL).lathe(0, 0, [w / 2, r * 0.62, w / 2, 0], 6);
    }
  } else {
    const seg = style === 'pl' ? 20 : 18;
    const from = g.mark();
    g.paint(COL.rubber, SURF_RUBBER);
    g.lathe(0, 0, [-w / 2, 0, -w / 2, r * 0.93, -w / 2 + w * 0.16, r, w / 2 - w * 0.16, r, w / 2, r * 0.93, w / 2, r * 0.69], seg);
    g.smooth(from, 55);
    g.paint(rimTint, SURF_METAL).tile(tile(RIM_TILE[style]));
    const dish = style === 'pl' ? 0.07 : 0.03;
    g.lathe(0, 0, [w / 2, r * 0.69, w / 2 - dish, r * 0.62, w / 2 - dish * 0.7, 0], seg, true, r * 0.69);
    g.tile(null);
  }
  g.pop();
  g.noPart();
}

/** Passage de roue : anneau sombre autour de la roue, plaqué sur le flanc gauche (+x). À appeler dans g.mirror(). */
export function arch(g: Geo, far: boolean, x: number, z: number, r: number, yMin: number): void {
  if (far) return;
  g.noPart().tile(null).paint(COL.dark, SURF_DARK);
  const seg = 10, a0 = -0.28, a1 = Math.PI + 0.28;
  const ri = r * 1.0, ro = r * 1.13;
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const p = (rad: number, t: number): number[] => [x, Math.max(yMin, r + Math.sin(t) * rad), z + Math.cos(t) * rad];
    g.face([...p(ri, t0), ...p(ro, t0), ...p(ro, t1), ...p(ri, t1)], null, [1, 0, 0]);
  }
}

// ── équipements ──────────────────────────────────────────────────────────────────────

/**
 * Optique plane : centre, « droite » et « haut » du panneau, dimensions, couleur de lentille, code de feu.
 * `bezel` > 0 ajoute un enjoliveur sombre de cette largeur autour de la lentille (indispensable sur une caisse blanche).
 */
export function lamp(
  g: Geo, cx: number, cy: number, cz: number, right: readonly number[], up: readonly number[], w: number, h: number,
  color: number, code: number, bezel = 0,
): void {
  g.tile(null);
  if (bezel > 0) {
    // l'enjoliveur est posé juste derrière la lentille, le long de la normale droite × haut
    const nx = right[1]! * up[2]! - right[2]! * up[1]!, ny = right[2]! * up[0]! - right[0]! * up[2]!, nz = right[0]! * up[1]! - right[1]! * up[0]!;
    const nl = Math.hypot(nx, ny, nz) || 1;
    g.paint(0x1c1d20, SURF_FIXED).light(LIGHT_NONE);
    g.panel(cx - (nx / nl) * 0.003, cy - (ny / nl) * 0.003, cz - (nz / nl) * 0.003, right, up, w + bezel * 2, h + bezel * 2);
  }
  g.paint(color, SURF_LAMP).light(code);
  g.panel(cx, cy, cz, right, up, w, h);
  g.light(LIGHT_NONE);
}

/** Optique en relief (petit pavé). */
export function lampBox(g: Geo, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, code: number): void {
  g.tile(null).paint(color, SURF_LAMP).light(code);
  g.box(x0, x1, y0, y1, z0, z1);
  g.light(LIGHT_NONE);
}

/**
 * Rampe lumineuse de toit à LED : socle sombre, deux blocs bleus (groupes A à gauche et B à droite), centre
 * clair. Dimensions réelles ≈ 1,1–1,4 × 0,30 × 0,08 m (dossier 02 §4.8).
 */
export function lightbar(g: Geo, far: boolean, y: number, z: number, width: number, depth = 0.3, height = 0.1): void {
  const hw = width / 2;
  g.noPart().tile(null);
  if (far) {
    lampBox(g, 0.02, hw, y, y + height, z - depth / 2, z + depth / 2, COL.blueLens, LIGHT_BEACON_A);
    lampBox(g, -hw, -0.02, y, y + height, z - depth / 2, z + depth / 2, COL.blueLens, LIGHT_BEACON_B);
    return;
  }
  g.paint(COL.plastic, SURF_FIXED).box(-hw, hw, y, y + 0.025, z - depth / 2, z + depth / 2);
  // pieds
  g.box(-hw * 0.7 - 0.03, -hw * 0.7 + 0.03, y - 0.03, y, z - 0.05, z + 0.05);
  g.box(hw * 0.7 - 0.03, hw * 0.7 + 0.03, y - 0.03, y, z - 0.05, z + 0.05);
  const from = g.mark();
  const seg = (x0: number, x1: number, code: number, color: number): void => {
    g.paint(color, SURF_LAMP).light(code);
    g.hexa([
      x0, y + 0.025, z - depth / 2, x1, y + 0.025, z - depth / 2, x1, y + 0.025, z + depth / 2, x0, y + 0.025, z + depth / 2,
      x0 + 0.01, y + height, z - depth / 2 + 0.03, x1 - 0.01, y + height, z - depth / 2 + 0.03,
      x1 - 0.01, y + height, z + depth / 2 - 0.03, x0 + 0.01, y + height, z + depth / 2 - 0.03,
    ], 1);
  };
  seg(hw * 0.18, hw, LIGHT_BEACON_A, COL.blueLens);
  seg(-hw, -hw * 0.18, LIGHT_BEACON_B, COL.blueLens);
  g.light(LIGHT_NONE);
  seg(-hw * 0.18, hw * 0.18, LIGHT_NONE, 0xdfe4ea);
  g.light(LIGHT_NONE);
  g.smooth(from, 60);
}

/** Gyrophare isolé (dôme bleu sur embase). */
export function beacon(g: Geo, far: boolean, x: number, y: number, z: number, code: number, r = 0.075): void {
  g.noPart().tile(null);
  if (far) { lampBox(g, x - r, x + r, y, y + r * 1.5, z - r, z + r, COL.blueLens, code); return; }
  g.paint(COL.plastic, SURF_FIXED).tube(x, y, z, x, y + 0.03, z, r * 1.1, r * 1.1, 8, false, true);
  g.paint(COL.blueLens, SURF_LAMP).light(code);
  g.tube(x, y + 0.03, z, x, y + 0.03 + r * 0.9, z, r, r * 0.92, 8, false, false);
  g.dome(x, y + 0.03 + r * 0.9, z, r * 0.92, 8, 2, 0.55);
  g.light(LIGHT_NONE);
}

/** Antenne fouet. */
export function antenna(g: Geo, far: boolean, x: number, y: number, z: number, len: number, tilt = 0.12): void {
  if (far) return;
  g.noPart().tile(null).paint(COL.dark, SURF_DARK);
  g.tube(x, y, z, x, y + 0.05, z, 0.018, 0.012, 5, false, false);
  g.tube(x, y + 0.05, z, x, y + len, z - len * tilt, 0.006, 0.003, 4, false, true);
}

/** Rétroviseur extérieur gauche (+x) ; appeler dans g.mirror(). */
export function sideMirror(g: Geo, far: boolean, x: number, y: number, z: number, size: number, bodyStyle: () => void): void {
  if (far) return;
  g.noPart().tile(null).paint(COL.plastic, SURF_FIXED);
  g.tube(x - 0.02, y, z, x + size * 0.55, y + 0.02, z, 0.014, 0.012, 4, false, false);
  bodyStyle();
  g.cube(x + size * 0.75, y + 0.03, z, size * 0.6, size, size * 0.42);
  g.paint(0x6c7884, SURF_GLASS).face([
    x + size * 0.48, y + 0.03 - size * 0.42, z - size * 0.215, x + size * 1.02, y + 0.03 - size * 0.42, z - size * 0.215,
    x + size * 1.02, y + 0.03 + size * 0.42, z - size * 0.215, x + size * 0.48, y + 0.03 + size * 0.42, z - size * 0.215,
  ], null, [0, 0, -1]);
  bodyStyle();
}

/** Plaque d'immatriculation (texture dédiée) : face 'F' (avant) ou 'B' (arrière). */
export function plate(g: Geo, far: boolean, cy: number, z: number, face: 'F' | 'B', w = 0.52, h = 0.11, cx = 0): void {
  if (far) return;
  g.noPart().light(LIGHT_NONE).paint(0xffffff, SURF_PLATE);
  // les coordonnées de texture brutes (0..1) sont converties par le shader selon l'emplacement de plaque de l'instance
  const dir = face === 'F' ? 1 : -1;
  const right = [dir, 0, 0];
  const rx = (right[0]! * w) / 2;
  g.rawPlate([cx - rx, cy - h / 2, z, cx + rx, cy - h / 2, z, cx + rx, cy + h / 2, z, cx - rx, cy + h / 2, z], [0, 0, dir]);
  g.paint(COL.dark, SURF_DARK);
}

export type Face = 'L' | 'R' | 'F' | 'B' | 'T';

const FACE_RIGHT: Record<Face, readonly number[]> = { L: [0, 0, -1], R: [0, 0, 1], F: [1, 0, 0], B: [-1, 0, 0], T: [-1, 0, 0] };
const FACE_UP: Record<Face, readonly number[]> = { L: [0, 1, 0], R: [0, 1, 0], F: [0, 1, 0], B: [0, 1, 0], T: [0, 0, 1] };

/**
 * Marquage (texte ou bande) lisible depuis l'extérieur de la face indiquée : L = flanc gauche (+x), R = flanc
 * droit, F = avant, B = arrière, T = toit. Hauteur donnée ; largeur déduite de la tuile sauf si `w` est fourni.
 * Couleur multipliée : blanc par défaut (la tuile porte sa propre couleur).
 */
export function decal(
  g: Geo, name: TileName, face: Face, cx: number, cy: number, cz: number, h: number, w?: number,
  sub?: readonly number[], tint = 0xffffff, lightCode: number = LIGHT_NONE,
): void {
  const width = w ?? h * tileAspect(name);
  g.paint(tint, lightCode !== LIGHT_NONE ? SURF_LAMP : SURF_FIXED).light(lightCode).tile(tile(name));
  g.panel(cx, cy, cz, FACE_RIGHT[face], FACE_UP[face], width, h, sub);
  g.tile(null).light(LIGHT_NONE);
}

/** Marquage sur un plan quelconque (capot incliné) : vecteurs « droite » et « haut » explicites. */
export function decalFree(g: Geo, name: TileName, cx: number, cy: number, cz: number, right: readonly number[], up: readonly number[], h: number, w?: number, tint = 0xffffff): void {
  const width = w ?? h * tileAspect(name);
  g.light(LIGHT_NONE).paint(tint, SURF_FIXED).tile(tile(name));
  g.panel(cx, cy, cz, right, up, width, h);
  g.tile(null);
}

/** Pare-chocs : pavé sombre en travers (avant si z > 0). */
export function bumper(g: Geo, far: boolean, hw: number, y0: number, y1: number, z: number, depth: number, color: number = COL.plastic): void {
  if (far) return;
  g.noPart().tile(null).paint(color, SURF_FIXED);
  const z0 = z > 0 ? z - depth * 0.4 : z - depth * 0.6, z1 = z > 0 ? z + depth * 0.6 : z + depth * 0.4;
  const from = g.mark();
  const zi = z > 0 ? z0 : z1, zo = z > 0 ? z1 : z0;
  g.hexa([
    -hw, y0, zi, hw, y0, zi, hw * 0.9, y0, zo, -hw * 0.9, y0, zo,
    -hw, y1, zi, hw, y1, zi, hw * 0.9, y1, zo, -hw * 0.9, y1, zo,
  ]);
  g.smooth(from, 50);
}

/** Calandre texturée sur la face avant. */
export function grille(g: Geo, far: boolean, cy: number, z: number, w: number, h: number): void {
  if (far) return;
  g.noPart().paint(0xffffff, SURF_FIXED).tile(tile('calandre'));
  g.panel(0, cy, z, [1, 0, 0], [0, 1, 0], w, h);
  g.tile(null);
}

/**
 * Bande de sérigraphie le long d'un flanc (L ou R), segment de z0 (arrière) à z1 (avant) d'une bande qui commence
 * (motif tricolore oblique) à l'abscisse `front` et file vers l'arrière. Plusieurs segments (caisse, portes) se
 * raccordent sans couture puisque la texture est indexée sur la position le long de la bande.
 */
export function policeBand(g: Geo, face: 'L' | 'R', x: number, y: number, z0: number, z1: number, h: number, front: number): void {
  const natural = h * tileAspect('bande_police');
  const uAt = (z: number): number => Math.min(0.985, Math.max(0, (front - z) / natural));
  // côté gauche, la « droite » du panneau va vers l'arrière : s = 0 est à l'avant. Côté droit, c'est l'inverse.
  const sub = face === 'L' ? [uAt(z1), 0, uAt(z0), 1] : [uAt(z0), 0, uAt(z1), 1];
  g.light(LIGHT_NONE).paint(0xffffff, SURF_FIXED).tile(tile('bande_police'));
  g.panel(x, y, (z0 + z1) / 2, FACE_RIGHT[face], FACE_UP[face], z1 - z0, h, sub);
  g.tile(null);
}

/** Barre tubulaire (pare-buffle, galerie, arceau) passant par une suite de points. */
export function pipe(g: Geo, pts: readonly number[], r: number, seg = 6): void {
  for (let i = 0; i + 5 < pts.length; i += 3) {
    g.tube(pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, pts[i + 4]!, pts[i + 5]!, r, r, seg, i === 0, i + 6 >= pts.length);
  }
}

