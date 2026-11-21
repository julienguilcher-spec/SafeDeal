/* Kit monuments — murs percés d'arcs, arcades, voûtes en berceau à caissons. */
import { Builder } from './builder';
import { Geo } from './geo';
import { triangulate } from './shapes';
import type { MatRef } from './materials';

export type ArchKind = 'plein_cintre' | 'surbaisse' | 'ogive' | 'plat';

export interface ArchOpening {
  /** Axe de la baie le long du mur (m, 0 = milieu du mur). */
  x: number;
  width: number;
  /** Hauteur sous clef (sommet de l'arc) depuis la base du mur. */
  height: number;
  kind?: ArchKind;
  /** Flèche de l'arc pour 'surbaisse' et 'ogive' (par défaut : largeur / 5 et 0,87 × largeur). */
  rise?: number;
  /** Altitude du seuil (fenêtre haute) ; 0 par défaut (porte, arche). */
  sill?: number;
}

export interface ArchBlockOpts {
  width: number;
  height: number;
  depth: number;
  openings: ArchOpening[];
  mat: MatRef;
  /** Matériau de la voûte (intrados) : 'caissons' pour une voûte à caissons. Par défaut `mat`. */
  matVault?: MatRef;
  /** Nombre de caissons autour de l'arc et en profondeur (UV calées sur des caissons entiers). */
  coffers?: { around: number; across: number };
  /** Matériau des piédroits (faces intérieures verticales). Par défaut `mat`. */
  matJamb?: MatRef;
  /** Segments par arc. */
  seg?: number;
  /** Faces à produire (toutes par défaut sauf le dessous). */
  front?: boolean; back?: boolean; left?: boolean; right?: boolean; top?: boolean;
}

/** Points (x, y) du contour d'une baie, du pied gauche au pied droit, en passant par l'arc. `arcFrom` = index du 1er point d'arc. */
export function openingOutline(o: ArchOpening, seg = 12): { pts: number[]; arcFrom: number; arcTo: number } {
  const hw = o.width / 2, sill = o.sill ?? 0, kind = o.kind ?? 'plein_cintre';
  const pts: number[] = [o.x - hw, sill];
  let arcFrom = 1, arcTo = 1;
  if (kind === 'plat') {
    pts.push(o.x - hw, o.height, o.x + hw, o.height);
    arcFrom = 1; arcTo = 2;
  } else if (kind === 'plein_cintre') {
    const hs = Math.max(sill, o.height - hw);
    const ry = o.height - hs;                      // demi-ellipse si la hauteur manque
    arcFrom = pts.length >> 1;
    for (let i = 0; i <= seg; i++) { const a = Math.PI - (i / seg) * Math.PI; pts.push(o.x + hw * Math.cos(a), hs + ry * Math.sin(a)); }
    arcTo = (pts.length >> 1) - 1;
  } else if (kind === 'surbaisse') {
    const rise = Math.min(o.rise ?? o.width / 5, hw);
    const R = (hw * hw + rise * rise) / (2 * rise), cy = o.height - R, phi = Math.asin(Math.min(1, hw / R));
    arcFrom = pts.length >> 1;
    for (let i = 0; i <= seg; i++) { const a = Math.PI / 2 + phi - (i / seg) * 2 * phi; pts.push(o.x + R * Math.cos(a), cy + R * Math.sin(a)); }
    arcTo = (pts.length >> 1) - 1;
  } else {
    // ogive : deux arcs centrés sur la ligne des naissances
    const rise = Math.max(o.rise ?? o.width * 0.87, hw * 1.01), hs = o.height - rise;
    const c = (rise * rise - hw * hw) / o.width, R = c + hw;
    const a1 = Math.atan2(rise, -c);               // angle au sommet vu du centre de l'arc gauche (centre à x + c)
    const half = Math.max(2, seg >> 1);
    arcFrom = pts.length >> 1;
    for (let i = 0; i <= half; i++) { const a = Math.PI - (i / half) * (Math.PI - a1); pts.push(o.x + c + R * Math.cos(a), hs + R * Math.sin(a)); }
    for (let i = 1; i <= half; i++) { const a = Math.PI - a1 - (i / half) * (Math.PI - a1); pts.push(o.x - c + R * Math.cos(a), hs + R * Math.sin(a)); }
    arcTo = (pts.length >> 1) - 1;
  }
  pts.push(o.x + hw, sill);
  return { pts, arcFrom, arcTo };
}

/**
 * Mur épais percé de baies cintrées : face avant dans le plan z = +depth/2, base sur y = 0, centré en x.
 * Produit les deux parements, les joues, le dessus, les piédroits et les voûtes (intrados).
 */
export function archBlock(b: Builder, o: ArchBlockOpts): void {
  const hw = o.width / 2, hd = o.depth / 2, seg = o.seg ?? 14;
  const outlines = o.openings.slice().sort((p, q) => p.x - q.x).map((op) => ({ op, ...openingOutline(op, seg) }));
  // contour du parement (x, y) : bas-gauche → baies au sol → bas-droite → haut
  const contour: number[] = [-hw, 0];
  const holes: number[][] = [];
  for (const ol of outlines) {
    if ((ol.op.sill ?? 0) > 0) { holes.push(ol.pts); continue; }
    for (let i = 0; i < ol.pts.length; i++) contour.push(ol.pts[i]);
  }
  contour.push(hw, 0, hw, o.height, -hw, o.height);
  const tris = triangulate(contour, holes);
  const all: number[] = contour.slice();
  for (const h of holes) for (const v of h) all.push(v);
  const wall = new Geo();
  const addFace = (z: number, front: boolean): void => {
    const first = wall.vertexCount;
    for (let i = 0; i < all.length; i += 2) wall.vert(all[i], all[i + 1], z, 0, 0, front ? 1 : -1, front ? all[i] : -all[i], all[i + 1]);
    // `triangulate` rend des triangles antihoraires pour un second axe orienté vers le bas : on inverse pour la face avant
    for (let i = 0; i < tris.length; i += 3) {
      if (front) wall.tri(first + tris[i], first + tris[i + 2], first + tris[i + 1]);
      else wall.tri(first + tris[i], first + tris[i + 1], first + tris[i + 2]);
    }
  };
  if (o.front !== false) addFace(hd, true);
  if (o.back !== false) addFace(-hd, false);
  if (o.right !== false) wall.face(hw, 0, hd, hw, 0, -hd, hw, o.height, -hd, hw, o.height, hd);
  if (o.left !== false) wall.face(-hw, 0, -hd, -hw, 0, hd, -hw, o.height, hd, -hw, o.height, -hd);
  if (o.top !== false) wall.face(-hw, o.height, hd, hw, o.height, hd, hw, o.height, -hd, -hw, o.height, -hd);
  b.add(o.mat, wall);
  // piédroits et voûtes
  const jamb = new Geo(), vault = new Geo();
  for (const ol of outlines) {
    const p = ol.pts, n = p.length >> 1;
    let arcLen = 0;
    for (let i = ol.arcFrom; i < ol.arcTo; i++) arcLen += Math.hypot(p[2 * i + 2] - p[2 * i], p[2 * i + 3] - p[2 * i + 1]);
    let run = 0;
    for (let i = 0; i < n - 1; i++) {
      const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * i + 2], by = p[2 * i + 3];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-6) continue;
      const inArc = i >= ol.arcFrom && i < ol.arcTo;
      if (!inArc) { jamb.face(ax, ay, hd, ax, ay, -hd, bx, by, -hd, bx, by, hd); continue; }
      // voûte : normales lissées, UV (profondeur, développé de l'arc)
      const nrm = (k: number): [number, number] => {
        const k0 = Math.max(ol.arcFrom, k - 1), k1 = Math.min(ol.arcTo, k + 1);
        const dx = p[2 * k1] - p[2 * k0], dy = p[2 * k1 + 1] - p[2 * k0 + 1];
        const dl = Math.hypot(dx, dy) || 1;
        return [dy / dl, -dx / dl];
      };
      const [n0x, n0y] = nrm(i), [n1x, n1y] = nrm(i + 1);
      const us = o.coffers ? o.coffers.across / o.depth : 1, vs = o.coffers ? o.coffers.around / (arcLen || 1) : 1;
      const a = vault.vert(ax, ay, hd, n0x, n0y, 0, 0, run * vs);
      const bb = vault.vert(ax, ay, -hd, n0x, n0y, 0, o.depth * us, run * vs);
      const c = vault.vert(bx, by, -hd, n1x, n1y, 0, o.depth * us, (run + l) * vs);
      const d = vault.vert(bx, by, hd, n1x, n1y, 0, 0, (run + l) * vs);
      vault.quad(a, bb, c, d);
      run += l;
    }
    // seuil d'une fenêtre haute
    const sill = ol.op.sill ?? 0;
    if (sill > 0) jamb.face(p[0], sill, hd, p[2 * (n - 1)], sill, hd, p[2 * (n - 1)], sill, -hd, p[0], sill, -hd);
  }
  b.add(o.matJamb ?? o.mat, jamb);
  b.add(o.matVault ?? o.mat, vault);
}

export interface ArcadeOpts {
  /** Longueur totale du mur. */
  length: number;
  height: number;
  depth: number;
  /** Nombre d'arches. */
  count: number;
  /** Largeur d'une arche (par défaut 62 % de l'entraxe) et hauteur sous clef (par défaut 82 % de la hauteur). */
  archWidth?: number;
  archHeight?: number;
  kind?: ArchKind;
  mat: MatRef;
  matVault?: MatRef;
  seg?: number;
}

/** Arcade : mur percé de `count` arches régulières (même repère qu'archBlock). */
export function arcade(b: Builder, o: ArcadeOpts): void {
  const pitch = o.length / o.count;
  const w = o.archWidth ?? pitch * 0.62, h = o.archHeight ?? o.height * 0.82;
  const openings: ArchOpening[] = [];
  for (let i = 0; i < o.count; i++) openings.push({ x: -o.length / 2 + (i + 0.5) * pitch, width: w, height: h, kind: o.kind });
  archBlock(b, { width: o.length, height: o.height, depth: o.depth, openings, mat: o.mat, matVault: o.matVault, seg: o.seg ?? 10 });
}

/**
 * Archivolte : bandeau de largeur `width` suivant l'arc d'une baie, en saillie de `depth` vers +z depuis le
 * plan z = 0 (même repère (x, y) que la baie). `jambs` prolonge le bandeau le long des piédroits (chambranle).
 */
export function archivolt(op: ArchOpening, width: number, depth: number, seg = 14, jambs = false): Geo {
  const g = new Geo();
  const { pts, arcFrom, arcTo } = openingOutline(op, seg);
  const n = pts.length >> 1;
  const from = jambs ? 0 : arcFrom, to = jambs ? n - 1 : arcTo;
  const out: number[] = [];
  for (let k = from; k <= to; k++) {
    const k0 = Math.max(from, k - 1), k1 = Math.min(to, k + 1);
    const dx = pts[2 * k1] - pts[2 * k0], dy = pts[2 * k1 + 1] - pts[2 * k0 + 1];
    const dl = Math.hypot(dx, dy) || 1;
    out.push(pts[2 * k] - (dy / dl) * width, pts[2 * k + 1] + (dx / dl) * width);
  }
  for (let k = from; k < to; k++) {
    const i = k - from;
    const px = pts[2 * k], py = pts[2 * k + 1], qx = pts[2 * k + 2], qy = pts[2 * k + 3];
    const ox = out[2 * i], oy = out[2 * i + 1], rx = out[2 * i + 2], ry = out[2 * i + 3];
    g.face(px, py, depth, qx, qy, depth, rx, ry, depth, ox, oy, depth);          // parement
    g.face(ox, oy, depth, rx, ry, depth, rx, ry, 0, ox, oy, 0);                  // chant extérieur
    g.face(px, py, 0, qx, qy, 0, qx, qy, depth, px, py, depth);                  // retour d'intrados
  }
  return g;
}
