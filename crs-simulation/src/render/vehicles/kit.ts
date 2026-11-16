/* Boîte à outils de modélisation des véhicules (au-dessus de Geo) : coque par sections, pavillon vitré,
 * portes, roues, optiques, rampe lumineuse, sérigraphie, grilles de protection, plaques…
 *
 * Repère des constructeurs = repère Three local du maillage : +z vers l'avant, +y vers le haut,
 * +x vers la GAUCHE du véhicule (côté conducteur en France). L'origine est au sol, au centre de l'emprise.
 */

import { Geo, LIGHT_NONE, PART_DOOR, PART_SLIDE, SURF_DARK, SURF_FIXED, SURF_GLASS, SURF_METAL } from './geo';
import { tile, tileAspect } from './atlas-layout';
import type { TileName } from './atlas-layout';
import { COL } from './palette';

export { COL } from './palette';

/** Section transversale d'une coque (symétrique) à l'abscisse z. */
export interface Station {
  z: number;
  /** Demi-largeur au plus large. */
  w: number;
  /** Bas et haut de la section. */
  y0: number;
  y1: number;
  /** Chanfrein d'épaule (haut des flancs). */
  round?: number;
  /** Rentrée du bas de caisse. */
  tuck?: number;
  /** Demi-largeur au sommet (défaut : w − round). */
  wTop?: number;
}

/** Les 10 points de l'anneau d'une section (voir shell). */
export function ringOf(s: Station): number[] {
  const r = s.round ?? 0.06, t = s.tuck ?? 0.05;
  const wt = s.wTop ?? s.w - r;
  const z = s.z;
  return [
    0, s.y0, z, s.w - t, s.y0, z, s.w, s.y0 + t, z, s.w, s.y1 - r, z, wt, s.y1, z, 0, s.y1, z,
    -wt, s.y1, z, -s.w, s.y1 - r, z, -s.w, s.y0 + t, z, -(s.w - t), s.y0, z,
  ];
}

/** Arêtes de l'anneau : 0 dessous, 1 bas de caisse, 2 flanc, 3 épaule, 4 dessus (côté +x), puis le miroir 5..9. */
export const EDGE_SIDE = 2;
export const EDGE_SHOULDER = 3;
export const EDGE_TOP = 4;

/**
 * Coque par sections (carrosserie basse, caisse de fourgon, citerne…). Le dessous est peint en sombre.
 * Au loin : anneau réduit à 4 points, sans dessous.
 */
export function shell(g: Geo, far: boolean, stations: readonly Station[], bodyStyle: () => void, capStart = true, capEnd = true, crease = 38): void {
  const from = g.mark();
  if (far) {
    const rings = stations.map((s) => [s.w, s.y0, s.z, s.w, s.y1, s.z, -s.w, s.y1, s.z, -s.w, s.y0, s.z]);
    bodyStyle();
    g.loft(rings, capStart, capEnd, (_k, j) => (j === 3 ? false : undefined));
    return;
  }
  const rings = stations.map(ringOf);
  const lastRing = rings.length - 1;
  g.loft(rings, capStart, capEnd, (k, j) => {
    // dessous de caisse sombre ; les faces d'extrémité (k = −1 et k = dernière section) gardent la teinte de la caisse
    if (k >= 0 && k < lastRing && (j === 0 || j === 9)) g.paint(COL.dark, SURF_DARK);
    else bodyStyle();
  });
  bodyStyle();
  g.smooth(from, crease);
}

/**
 * Portion d'une face de coque entre deux sections, pour y plaquer une optique ou un marquage : `edge` désigne
 * l'arête de l'anneau (EDGE_SIDE, EDGE_SHOULDER, EDGE_TOP), s ∈ [0,1] va de la section a à la section b,
 * t ∈ [0,1] du bas au haut de l'arête. `side` : +1 côté gauche (+x), −1 côté droit. Décalé de `off` vers l'extérieur.
 */
export function patch(g: Geo, a: Station, b: Station, edge: number, s0: number, s1: number, t0: number, t1: number, side: 1 | -1, off = 0.008): void {
  const ra = ringOf(a), rb = ringOf(b);
  const pt = (ring: number[], t: number): [number, number, number] => {
    const i = edge, j = edge + 1;
    return [
      (ring[i * 3]! + (ring[j * 3]! - ring[i * 3]!) * t) * side,
      ring[i * 3 + 1]! + (ring[j * 3 + 1]! - ring[i * 3 + 1]!) * t,
      ring[i * 3 + 2]!,
    ];
  };
  const mix = (t: number, s: number): [number, number, number] => {
    const p = pt(ra, t), q = pt(rb, t);
    return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s];
  };
  const p00 = mix(t0, s0), p10 = mix(t0, s1), p11 = mix(t1, s1), p01 = mix(t1, s0);
  // normale du quadrilatère, orientée vers l'extérieur (du côté de `side`, ou vers le haut pour le dessus)
  const ux = p10[0] - p00[0], uy = p10[1] - p00[1], uz = p10[2] - p00[2];
  const vx = p01[0] - p00[0], vy = p01[1] - p00[1], vz = p01[2] - p00[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const outward = edge === EDGE_TOP ? ny : nx * side;
  if (outward < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const o = (p: [number, number, number]): number[] => [p[0] + nx * off, p[1] + ny * off, p[2] + nz * off];
  g.face([...o(p00), ...o(p10), ...o(p11), ...o(p01)], null, [nx, ny, nz]);
}

// ── pavillon vitré ───────────────────────────────────────────────────────────────────

export interface WindowSpec {
  /** Étendue de la vitre le long de z, au niveau de la ceinture de caisse. */
  z0: number;
  z1: number;
  /** 'glass' (défaut), 'frost' (verre dépoli d'ambulance), 'grille' (vitre + grille de protection). */
  kind?: 'glass' | 'frost' | 'grille';
  /** Côtés concernés (défaut : les deux). */
  side?: 'L' | 'R';
  /** Hauteur relative du bas et du haut de la vitre dans le pavillon (défauts 0,10 et 0,90). */
  t0?: number;
  t1?: number;
}

export interface CabinSpec {
  /** Base avant (pied de pare-brise), toit avant, toit arrière, base arrière. */
  zA: number; zB: number; zC: number; zD: number;
  yBelt: number; yRoof: number;
  wBelt: number; wRoof: number;
  /** Hauteur du chanfrein de toit (défaut 0,05). */
  cap?: number;
  windshield?: boolean;
  rearGlass?: boolean;
  /** Vitres latérales fixes (celles des portes sont émises par door()). */
  side: WindowSpec[];
  /** Grille de protection rabattue devant le pare-brise. */
  grilleFront?: boolean;
  glassColor?: number;
  /** Hauteur relative du bas de la lunette arrière (fourgons : vitres de portes hautes). */
  rearT0?: number;
}

const GLASS_OFF = 0.012;

function cabTop(c: CabinSpec): number { return c.yRoof - (c.cap ?? 0.05); }

/** Point du flanc du pavillon : z au niveau considéré, t = hauteur relative ; côté gauche (+x). */
function cabSidePoint(c: CabinSpec, z: number, t: number, off: number): [number, number, number] {
  const yT = cabTop(c);
  const dy = yT - c.yBelt, dx = c.wBelt - c.wRoof;
  const l = Math.hypot(dy, dx) || 1;
  return [c.wBelt + (c.wRoof - c.wBelt) * t + (dy / l) * off, c.yBelt + dy * t + (dx / l) * off, z];
}

/** Polygone d'une vitre latérale (côté gauche), bords avant et arrière suivant l'inclinaison du pavillon. */
function sideWindowPoly(c: CabinSpec, w: WindowSpec, off: number, margin = 0.05): number[] {
  const t0 = w.t0 ?? 0.1, t1 = w.t1 ?? 0.9;
  const zf = (t: number): number => c.zA + (c.zB - c.zA) * t - margin;
  const zr = (t: number): number => c.zD + (c.zC - c.zD) * t + margin;
  const cl = (z: number, t: number): number => Math.min(Math.max(z, zr(t)), zf(t));
  const a = cabSidePoint(c, cl(w.z0, t0), t0, off), b = cabSidePoint(c, cl(w.z1, t0), t0, off);
  const d = cabSidePoint(c, cl(w.z1, t1), t1, off), e = cabSidePoint(c, cl(w.z0, t1), t1, off);
  return [...a, ...b, ...d, ...e];
}

function sideNormal(c: CabinSpec): [number, number, number] {
  const dy = cabTop(c) - c.yBelt, dx = c.wBelt - c.wRoof;
  const l = Math.hypot(dy, dx) || 1;
  return [dy / l, dx / l, 0];
}

function mirrorPts(p: number[]): number[] {
  const o = p.slice();
  for (let i = 0; i < o.length; i += 3) o[i] = -o[i]!;
  return o;
}

/** Quadrilatère rétréci vers son centre de `m` mètres sur chaque bord (approximation suffisante pour des vitres). */
function inset(p: number[], m: number): number[] {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < 12; i += 3) { cx += p[i]!; cy += p[i + 1]!; cz += p[i + 2]!; }
  cx /= 4; cy /= 4; cz /= 4;
  const o: number[] = [];
  for (let i = 0; i < 12; i += 3) {
    const dx = p[i]! - cx, dy = p[i + 1]! - cy, dz = p[i + 2]! - cz;
    const l = Math.hypot(dx, dy, dz) || 1;
    const k = Math.max(0, 1 - (m * 1.4) / l);
    o.push(cx + dx * k, cy + dy * k, cz + dz * k);
  }
  return o;
}

function offsetPts(p: number[], n: readonly number[], d: number): number[] {
  const o: number[] = [];
  for (let i = 0; i < p.length; i += 3) o.push(p[i]! + n[0]! * d, p[i + 1]! + n[1]! * d, p[i + 2]! + n[2]! * d);
  return o;
}

function quadNormal(p: number[], toward: readonly number[]): [number, number, number] {
  const ux = p[3]! - p[0]!, uy = p[4]! - p[1]!, uz = p[5]! - p[2]!;
  const vx = p[9]! - p[0]!, vy = p[10]! - p[1]!, vz = p[11]! - p[2]!;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  if (nx * toward[0]! + ny * toward[1]! + nz * toward[2]! < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}

/** Grille de protection (treillis à découpe alpha) à `off` devant un vitrage, avec son cadre. */
export function grilleOver(g: Geo, pts: number[], n: readonly number[], off: number, frame = true): void {
  const p = offsetPts(pts, n, off);
  const wM = Math.hypot(p[3]! - p[0]!, p[4]! - p[1]!, p[5]! - p[2]!);
  const hM = Math.hypot(p[9]! - p[0]!, p[10]! - p[1]!, p[11]! - p[2]!);
  // mailles de taille constante dans le monde : la tuile couvre 1,6 m × 0,8 m
  const su = Math.min(1, wM / 1.6), sv = Math.min(1, hM / 0.8);
  g.paint(0x2b2e33, SURF_METAL).tile(tile('grille'));
  g.faceUv(p, [0, 0, su, 0, su, sv, 0, sv], n);
  g.tile(null);
  if (!frame) return;
  g.paint(0x25272b, SURF_METAL);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    g.tube(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!, p[j * 3]!, p[j * 3 + 1]!, p[j * 3 + 2]!, 0.014, 0.014, 4, false, false);
  }
}

/**
 * Pavillon : tronc de pyramide peint (montants, toit) + vitrages rapportés. Au loin : faces directement
 * teintées en verre, sans surépaisseur.
 */
export function cabin(g: Geo, far: boolean, c: CabinSpec, bodyStyle: () => void): void {
  const yT = cabTop(c);
  const glassCol = c.glassColor ?? COL.glass;
  const corners = [
    -c.wBelt, c.yBelt, c.zD, c.wBelt, c.yBelt, c.zD, c.wBelt, c.yBelt, c.zA, -c.wBelt, c.yBelt, c.zA,
    -c.wRoof, yT, c.zC, c.wRoof, yT, c.zC, c.wRoof, yT, c.zB, -c.wRoof, yT, c.zB,
  ];
  const capIn = 0.07;
  if (far) {
    // faces : 0 bas (omis), 1 haut, puis côtés i → i+1 : 0 = arrière (−z), 1 = gauche (+x), 2 = avant, 3 = droit
    const q = (i: number, j: number, k: number, l: number): number[] => [
      corners[i * 3]!, corners[i * 3 + 1]!, corners[i * 3 + 2]!, corners[j * 3]!, corners[j * 3 + 1]!, corners[j * 3 + 2]!,
      corners[k * 3]!, corners[k * 3 + 1]!, corners[k * 3 + 2]!, corners[l * 3]!, corners[l * 3 + 1]!, corners[l * 3 + 2]!,
    ];
    const ref = [0, (c.yBelt + yT) / 2, (c.zA + c.zD) / 2];
    bodyStyle();
    g.face(q(4, 5, 6, 7), ref);
    const sideGlass = c.side.length > 0;
    const paintFace = (glass: boolean): void => { if (glass) g.paint(glassCol, SURF_GLASS); else bodyStyle(); };
    paintFace(c.rearGlass !== false); g.face(q(0, 1, 5, 4), ref);
    paintFace(c.windshield !== false); g.face(q(2, 3, 7, 6), ref);
    if (sideGlass) {
      // flancs : peinture, puis une seule bande vitrée couvrant l'étendue des vitres
      bodyStyle(); g.face(q(1, 2, 6, 5), ref); g.face(q(3, 0, 4, 7), ref);
      let z0 = Infinity, z1 = -Infinity;
      for (const w of c.side) { if (w.z0 < z0) z0 = w.z0; if (w.z1 > z1) z1 = w.z1; }
      const band: WindowSpec = { z0, z1 };
      const poly = sideWindowPoly(c, band, 0.02, 0.03);
      const n = sideNormal(c);
      g.paint(glassCol, SURF_GLASS);
      g.face(poly, null, n);
      g.face(mirrorPts(poly), null, [-n[0], n[1], n[2]]);
    } else {
      bodyStyle(); g.face(q(1, 2, 6, 5), ref); g.face(q(3, 0, 4, 7), ref);
    }
    bodyStyle();
    return;
  }
  const from = g.mark();
  bodyStyle();
  g.hexa(corners, 1 | 2);
  // chanfrein de toit
  g.hexa([
    -c.wRoof, yT, c.zC, c.wRoof, yT, c.zC, c.wRoof, yT, c.zB, -c.wRoof, yT, c.zB,
    -(c.wRoof - capIn), c.yRoof, c.zC + capIn, c.wRoof - capIn, c.yRoof, c.zC + capIn,
    c.wRoof - capIn, c.yRoof, c.zB - capIn, -(c.wRoof - capIn), c.yRoof, c.zB - capIn,
  ], 1);
  g.smooth(from, 50);

  g.tile(tile('verre'));
  // pare-brise
  if (c.windshield !== false) {
    const quad = [-c.wBelt, c.yBelt, c.zA, c.wBelt, c.yBelt, c.zA, c.wRoof, yT, c.zB, -c.wRoof, yT, c.zB];
    const n = quadNormal(quad, [0, 0.3, 1]);
    const glass = offsetPts(inset(quad, 0.055), n, GLASS_OFF);
    g.paint(glassCol, SURF_GLASS).tile(tile('verre')).face(glass, null, n);
    // essuie-glaces
    g.tile(null).paint(COL.dark, SURF_DARK);
    const wy = c.yBelt + 0.03, wz = c.zA + 0.012;
    g.tube(c.wBelt * 0.55, wy, wz, c.wBelt * 0.05, wy + (yT - c.yBelt) * 0.42, wz + (c.zB - c.zA) * 0.42 + 0.01, 0.009, 0.006, 4, false, false);
    g.tube(-c.wBelt * 0.15, wy, wz, -c.wBelt * 0.62, wy + (yT - c.yBelt) * 0.42, wz + (c.zB - c.zA) * 0.42 + 0.01, 0.009, 0.006, 4, false, false);
    if (c.grilleFront) grilleOver(g, inset(quad, 0.02), n, 0.06);
  }
  // lunette arrière
  if (c.rearGlass !== false) {
    const quad = [c.wBelt, c.yBelt, c.zD, -c.wBelt, c.yBelt, c.zD, -c.wRoof, yT, c.zC, c.wRoof, yT, c.zC];
    const n = quadNormal(quad, [0, 0.3, -1]);
    let glass = inset(quad, 0.07);
    if (c.rearT0 !== undefined) {
      // vitres hautes : on relève le bord inférieur
      for (const i of [0, 3]) {
        const j = i === 0 ? 9 : 6;
        glass[i] = glass[i]! + (glass[j]! - glass[i]!) * c.rearT0;
        glass[i + 1] = glass[i + 1]! + (glass[j + 1]! - glass[i + 1]!) * c.rearT0;
        glass[i + 2] = glass[i + 2]! + (glass[j + 2]! - glass[i + 2]!) * c.rearT0;
      }
    }
    glass = offsetPts(glass, n, GLASS_OFF);
    g.paint(glassCol, SURF_GLASS).tile(tile('verre')).face(glass, null, n);
  }
  // vitres latérales fixes
  const n = sideNormal(c);
  for (const w of c.side) {
    const poly = sideWindowPoly(c, w, GLASS_OFF);
    const col = w.kind === 'frost' ? COL.glassFrost : glassCol;
    if (w.side !== 'R') {
      g.paint(col, SURF_GLASS).tile(tile('verre')).face(poly, null, n);
      if (w.kind === 'grille') grilleOver(g, sideWindowPoly(c, w, 0, 0.03), n, 0.05);
    }
    if (w.side !== 'L') {
      const nm = [-n[0], n[1], n[2]];
      g.paint(col, SURF_GLASS).tile(tile('verre')).face(mirrorPts(poly), null, nm);
      if (w.kind === 'grille') grilleOver(g, mirrorPts(sideWindowPoly(c, w, 0, 0.03)), nm, 0.05);
    }
  }
  g.tile(null);
  bodyStyle();
}

// ── portes ───────────────────────────────────────────────────────────────────────────

export interface DoorSpec {
  /** Indice de porte 0..3 (attribut d'instance) : 0 avant gauche, 1 avant droite, 2 arrière / hayon, 3 latérale droite. */
  index: number;
  side: 'L' | 'R';
  z0: number;
  z1: number;
  /** Bas et haut du panneau de porte (bas de caisse, ceinture). */
  y0: number;
  y1: number;
  /** Demi-largeur de la caisse à cet endroit. */
  hw: number;
  /** Porte coulissante (vers l'arrière) au lieu de battante (charnière à l'avant). */
  slide?: boolean;
  /** Vitre de porte (découpée dans le flanc du pavillon) : type, ou false pour une porte pleine. */
  window?: 'glass' | 'grille' | 'frost' | false;
  /** Bornes relatives de la vitre dans le pavillon. */
  t0?: number;
  t1?: number;
  /** Encoche au-dessus d'un passage de roue : en avant de `z`, le panneau ne descend que jusqu'à `y`. */
  notch?: { z: number; y: number };
  /** Marquages solidaires du panneau mobile : appelé avec l'abscisse x du plan de la porte (léger retrait compris). */
  extra?: (x: number) => void;
}

/**
 * Porte latérale ouvrante : embrasure sombre fixe + panneau de caisse et vitre mobiles (pièce PART_DOOR ou
 * PART_SLIDE). La charnière est au bord avant. Au loin : rien (le flanc de la coque suffit).
 */
export function door(g: Geo, far: boolean, d: DoorSpec, c: CabinSpec | null, bodyStyle: () => void): void {
  if (far) return;
  const s = d.side === 'L' ? 1 : -1;
  const x = d.hw * s;
  const gap = 0.012;
  const hingeZ = d.z1;
  // embrasure (fixe) et contour du panneau (deux rectangles s'il y a une encoche de passage de roue)
  const rects: number[][] = d.notch && d.notch.z < d.z1 && d.notch.z > d.z0
    ? [[d.z0, d.notch.z, d.y0], [d.notch.z, d.z1, d.notch.y]]
    : [[d.z0, d.z1, d.y0]];
  g.noPart().light(LIGHT_NONE).tile(null).paint(COL.interior, SURF_DARK);
  for (const q of rects) {
    g.face([x + 0.006 * s, q[2]!, q[0]!, x + 0.006 * s, q[2]!, q[1]!, x + 0.006 * s, d.y1, q[1]!, x + 0.006 * s, d.y1, q[0]!], null, [s, 0, 0]);
  }
  const hasWin = c !== null && d.window !== false && d.window !== undefined;
  let winPoly: number[] | null = null;
  let n: number[] = [s, 0, 0];
  if (c && hasWin) {
    const w: WindowSpec = { z0: d.z0 + 0.03, z1: d.z1 - 0.03, t0: d.t0, t1: d.t1 };
    const sn = sideNormal(c);
    n = [sn[0] * s, sn[1], sn[2]];
    const back = sideWindowPoly(c, w, 0.004, 0.04);
    winPoly = sideWindowPoly(c, w, 0.016, 0.04);
    if (s < 0) { g.face(mirrorPts(back), null, n); winPoly = mirrorPts(winPoly); } else g.face(back, null, n);
  }
  // panneau mobile
  g.part(d.slide ? PART_SLIDE : PART_DOOR, x, 0, hingeZ, (d.index + 1) * (x >= 0 ? 1 : -1));
  bodyStyle();
  const xs = x + 0.022 * s;
  for (let i = 0; i < rects.length; i++) {
    const q = rects[i]!;
    const za = q[0]! + (i === 0 ? gap : 0), zb = q[1]! - (i === rects.length - 1 ? gap : 0);
    g.face([xs, q[2]! + gap, za, xs, q[2]! + gap, zb, xs, d.y1 - gap * 0.3, zb, xs, d.y1 - gap * 0.3, za], null, [s, 0, 0]);
    // face intérieure (garniture), visible quand la porte est ouverte
    g.paint(0x2a2c30, SURF_FIXED);
    const xi = xs - 0.012 * s;
    g.face([xi, q[2]! + gap, za, xi, q[2]! + gap, zb, xi, d.y1 - gap * 0.3, zb, xi, d.y1 - gap * 0.3, za], null, [-s, 0, 0]);
    bodyStyle();
  }
  // poignée
  g.paint(COL.plastic, SURF_FIXED);
  const hz = d.slide ? d.z1 - 0.16 : d.z0 + 0.16;
  g.cube(xs + 0.012 * s, d.y1 - 0.1, hz, 0.024, 0.03, 0.13);
  if (d.extra) { d.extra(xs + 0.004 * s); g.tile(null); }
  if (winPoly) {
    const col = d.window === 'frost' ? COL.glassFrost : c!.glassColor ?? COL.glass;
    g.paint(col, SURF_GLASS).tile(tile('verre')).face(winPoly, null, n);
    g.face(offsetPts(winPoly, n, -0.01), null, [-n[0]!, -n[1]!, -n[2]!]);
    if (d.window === 'grille') {
      const w: WindowSpec = { z0: d.z0 + 0.03, z1: d.z1 - 0.03, t0: d.t0, t1: d.t1 };
      const base = sideWindowPoly(c!, w, 0, 0.03);
      grilleOver(g, s < 0 ? mirrorPts(base) : base, n, 0.05);
    }
    g.tile(null);
  }
  g.noPart();
  bodyStyle();
}

/** Portes arrière battantes d'un fourgon (deux vantaux, même indice de porte). `z` = face arrière. */
export function rearDoors(
  g: Geo, far: boolean, index: number, hw: number, y0: number, y1: number, z: number, bodyStyle: () => void,
  window: 'glass' | 'grille' | 'none' = 'glass', text?: { name: TileName; y: number; h: number },
): void {
  if (far) return;
  g.noPart().tile(null).paint(COL.interior, SURF_DARK);
  g.face([hw, y0, z - 0.006, -hw, y0, z - 0.006, -hw, y1, z - 0.006, hw, y1, z - 0.006], null, [0, 0, -1]);
  for (const s of [1, -1]) {
    g.part(PART_DOOR, hw * s, 0, z, (index + 1) * s);
    bodyStyle();
    const xa = hw * s - 0.012 * s, xb = 0.008 * s;
    const zz = z - 0.022;
    g.face([xa, y0 + 0.012, zz, xb, y0 + 0.012, zz, xb, y1 - 0.012, zz, xa, y1 - 0.012, zz], null, [0, 0, -1]);
    g.paint(0x2a2c30, SURF_FIXED);
    g.face([xa, y0 + 0.012, zz + 0.012, xb, y0 + 0.012, zz + 0.012, xb, y1 - 0.012, zz + 0.012, xa, y1 - 0.012, zz + 0.012], null, [0, 0, 1]);
    bodyStyle();
    if (window !== 'none') {
      const wy0 = y0 + (y1 - y0) * 0.58, wy1 = y1 - (y1 - y0) * 0.1;
      const wxa = hw * s * 0.86, wxb = hw * s * 0.14;
      const quad = [wxa, wy0, zz - 0.006, wxb, wy0, zz - 0.006, wxb, wy1, zz - 0.006, wxa, wy1, zz - 0.006];
      g.paint(COL.glass, SURF_GLASS).tile(tile('verre')).face(quad, null, [0, 0, -1]).tile(null);
      if (window === 'grille') grilleOver(g, quad, [0, 0, -1], 0.04);
    }
    // poignée centrale
    g.paint(COL.plastic, SURF_FIXED).cube(0.07 * s, y0 + (y1 - y0) * 0.42, zz - 0.014, 0.05, 0.16, 0.026);
    if (text) {
      // le vantail gauche (+x, à gauche pour qui regarde l'arrière) porte la première moitié du texte
      const tw = Math.min(hw * 1.8, text.h * tileAspect(text.name));
      g.paint(0xffffff, SURF_FIXED).tile(tile(text.name));
      g.panel((tw / 4) * s, text.y, zz - 0.004, [-1, 0, 0], [0, 1, 0], tw / 2, text.h, s > 0 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1]);
      g.tile(null);
    }
  }
  g.noPart();
  bodyStyle();
}

export * from './kit-equip';
