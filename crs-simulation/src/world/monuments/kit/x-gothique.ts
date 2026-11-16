/* Kit monuments — GOTHIQUE (lot « édifices ») : pièces réutilisables pour les églises.
 *   lancet()           baie en arc brisé (vitrage + chambranle)
 *   roseWindow()       rose (disque vitré + anneau de pierre)
 *   pinnacle()         pinacle à gâblets
 *   buttress()         contrefort à ressauts et glacis
 *   flyingButtress()   arc-boutant (intrados en quart d'ellipse, chaperon rectiligne)
 *   turret()           tourelle polygonale à flèche
 *   gableWall()        mur pignon
 *   openworkSpire()    flèche ajourée à deux étages, aiguille à crochets, croix et coq
 *   gothicNave() / gothicApse()   vaisseau à niveaux étagés (chapelles, bas-côtés, fenêtres hautes), culées,
 *                      arcs-boutants, toits en appentis et comble ; chevet demi-circulaire assorti
 * Les murs sont peints par un atlas de travées (x-gothique-peint.ts) : un seul appel de dessin pour tous les murs.
 * Fichier ajouté par le lot « édifices » ; il n'est pas réexporté par kit/index.ts : importer '../kit/x-gothique'. */
import { Builder } from './builder';
import { Geo } from './geo';
import { beam, box, cyl, frustum, sphere, sweep } from './shapes';
import { corniceProfile } from './classical';
import { archivolt, openingOutline, type ArchOpening } from './arch';
import { birdGeo } from './sculpture';
import type { MatRef } from './materials';
import { gableRoof, panelXY, ribbonUv, roofQuad, slabXY } from './x-edifices';
import { AJOUR_RAIL, rowWall, type GothicAtlas } from './x-gothique-peint';

// ───────────────────────────── baies ─────────────────────────────

export interface LancetOpts {
  width: number;
  /** Hauteur du seuil au sommet de l'arc. */
  height: number;
  sill?: number;
  /** Largeur et saillie du chambranle. */
  frame?: number; depth?: number;
  /** Flèche de l'arc (par défaut 0,87 × largeur : arc en tiers-point). */
  rise?: number;
  seg?: number;
}

/**
 * Baie en arc brisé dans le plan z = 0 (face vers +z), centrée en x : `glass` porte des UV 0..1 sur le rectangle
 * circonscrit (vitrail peint), `frame` est le chambranle en saillie.
 */
export function lancet(o: LancetOpts): { glass: Geo; frame: Geo } {
  const sill = o.sill ?? 0, seg = o.seg ?? 10;
  const op: ArchOpening = { x: 0, width: o.width, height: sill + o.height, kind: 'ogive', sill, rise: o.rise };
  const { pts } = openingOutline(op, seg);
  return {
    glass: panelXY(pts, -o.width / 2, sill, o.width / 2, sill + o.height),
    frame: archivolt(op, o.frame ?? Math.max(0.2, o.width * 0.1), o.depth ?? 0.25, seg, true),
  };
}

/**
 * Rose : disque vitré dans le plan z = 0 (UV 0..1 sur le carré circonscrit, centre à l'origine, face vers +z) et
 * anneau de pierre mouluré de largeur `frame`, en saillie de `depth`.
 */
export function roseWindow(radius: number, o: { frame?: number; depth?: number; seg?: number } = {}): { glass: Geo; frame: Geo } {
  const seg = o.seg ?? 32, f = o.frame ?? radius * 0.14, d = o.depth ?? 0.35;
  const glass = new Geo(), frame = new Geo();
  const c = glass.vert(0, 0, 0, 0, 0, 1, 0.5, 0.5);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
    glass.vert(radius * x, radius * y, 0, 0, 0, 1, 0.5 + 0.5 * x, 0.5 + 0.5 * y);
  }
  for (let i = 0; i < seg; i++) glass.tri(c, c + 1 + i, c + 2 + i);
  const ro = radius + f, mid = radius + f * 0.45;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    // ébrasement (du vitrage vers l'arête), plat de l'anneau, chant extérieur
    frame.face(radius * c0, radius * s0, 0, radius * c1, radius * s1, 0, mid * c1, mid * s1, d, mid * c0, mid * s0, d);
    frame.face(mid * c0, mid * s0, d, mid * c1, mid * s1, d, ro * c1, ro * s1, d, ro * c0, ro * s0, d);
    frame.face(ro * c0, ro * s0, d, ro * c1, ro * s1, d, ro * c1, ro * s1, 0, ro * c0, ro * s0, 0);
  }
  return { glass, frame };
}

// ───────────────────────────── pinacles, contreforts, arcs-boutants ─────────────────────────────

/** Pinacle : fût carré, gâblets sur les quatre faces, pyramide élancée, fleuron. Base sur y = 0, centré. */
export function pinnacle(w: number, h: number, lod: 0 | 1 = 1): Geo {
  const g = new Geo();
  const hs = h * 0.4;
  g.append(box(w, hs, w, { top: false }));
  g.append(box(w * 1.22, h * 0.035, w * 1.22, { bottom: true }).translate(0, hs, 0));
  if (lod > 0) {
    for (let k = 0; k < 4; k++) g.append(slabXY([-w * 0.5, hs * 0.7, w * 0.5, hs * 0.7, 0, hs * 1.16], 0.05, { back: false, sides: false }).translate(0, 0, w * 0.5 + 0.03).rotateY((k * Math.PI) / 2));
    g.append(box(w * 0.34, h * 0.03, w * 0.34, { bottom: true }).translate(0, h * 0.9, 0));
  }
  g.append(frustum(w * 0.92, w * 0.92, 0, 0, h * 0.565).translate(0, hs + h * 0.035, 0));
  return g;
}

/**
 * Contrefort à ressauts : dos dans le plan z = 0, saillie vers +z, base sur y = 0, centré en x. `steps` ressauts
 * couverts d'un glacis ; la saillie passe de `depth` au pied à `depth × taper` en tête ; le sommet est en bâtière.
 */
export function buttress(w: number, depth: number, h: number, steps = 2, taper = 0.5): Geo {
  const g = new Geo();
  const n = steps + 1;
  for (let k = 0; k < n; k++) {
    const y0 = (k / n) * h, y1 = ((k + 1) / n) * h;
    const d0 = depth * (1 - (1 - taper) * (k / n)), d1 = k === n - 1 ? 0.02 : depth * (1 - (1 - taper) * ((k + 1) / n));
    const s = Math.min((d0 - d1) * 1.25, (y1 - y0) * 0.6);
    g.append(slabXY([0, y0, d0, y0, d0, y1 - s, d1, y1, 0, y1], w, { back: false }).rotateY(-Math.PI / 2));
  }
  return g;
}

/**
 * Arc-boutant dans le plan (x, y), d'épaisseur `t` selon z : pied sur la culée en x = 0 (intrados à y = 0), tête contre
 * le mur en x = span (intrados à y = rise). Intrados en quart d'ellipse, chaperon rectiligne incliné.
 */
export function flyingButtress(span: number, rise: number, t: number, o: { head?: number; foot?: number; seg?: number } = {}): Geo {
  const seg = o.seg ?? 8, head = o.head ?? Math.max(0.9, rise * 0.16);
  const top = rise + head;
  // pied du chaperon : assez haut pour rester au-dessus de l'intrados partout
  let foot = o.foot ?? 0;
  for (let i = 1; i < 12; i++) {
    const s = i / 12, need = (rise * Math.sqrt(2 * s - s * s) + 0.45 - top * s) / (1 - s);
    if (need > foot) foot = need;
  }
  const pts: number[] = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * (Math.PI / 2); pts.push(span * (1 - Math.cos(a)), rise * Math.sin(a)); }
  pts.push(span, top, 0, foot);
  return slabXY(pts, t);
}

/** Tourelle polygonale coiffée d'une flèche : base sur y = 0. `h` = fût, `spireH` = flèche. */
export function turret(r: number, h: number, spireH: number, sides = 8): Geo {
  const g = new Geo();
  g.append(cyl(r, r, h, sides, { flat: true, top: false }));
  g.append(cyl(r * 1.14, r * 1.14, Math.min(0.5, h * 0.04), sides, { flat: true, bottom: true }).translate(0, h, 0));
  g.append(cyl(r * 1.02, 0, spireH, sides, { flat: true, top: false }).translate(0, h + Math.min(0.5, h * 0.04), 0));
  return g;
}

/** Mur pignon d'épaisseur t : largeur w, murs jusqu'à wallH, pointe à wallH + rise. Plan (x, y), centré en x et en z. */
export function gableWall(w: number, wallH: number, rise: number, t: number): Geo {
  return slabXY([-w / 2, 0, w / 2, 0, w / 2, wallH, 0, wallH + rise, -w / 2, wallH], t);
}

// ───────────────────────────── flèche ajourée ─────────────────────────────

export interface OpenSpireOpts {
  /** Rayon de l'octogone du premier étage et hauteur totale jusqu'à la pointe de l'aiguille. */
  radius: number;
  height: number;
  mat: MatRef;
  /** Noyau sombre vu à travers les arcades (par défaut `mat`). */
  matCore?: MatRef;
  /** Croix, boule et coq (dorure). */
  matFinial?: MatRef;
  lod?: 0 | 1;
  rooster?: boolean;
}

/** Un étage ajouré octogonal : poteaux d'angle, arcs brisés, noyau, bandeau, gâbles et pinacles. */
function spireStage(g: Geo, core: Geo, r: number, y0: number, h: number, lod: 0 | 1): number {
  const post = r * 0.15;
  core.append(cyl(r * 0.52, r * 0.46, h, 8, { flat: true, top: false }).translate(0, y0, 0));
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    const x0 = r * Math.sin(a0), z0 = r * Math.cos(a0), x1 = r * Math.sin(a1), z1 = r * Math.cos(a1);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    g.append(box(post, h, post, { top: false }).rotateY(a0).translate(x0, y0, z0));
    // arc brisé : deux rampants qui se rejoignent, linteau, appui
    g.append(beam(x0, y0 + h * 0.52, z0, mx, y0 + h * 0.9, mz, post * 0.6));
    g.append(beam(x1, y0 + h * 0.52, z1, mx, y0 + h * 0.9, mz, post * 0.6));
    g.append(beam(x0, y0 + h * 0.14, z0, x1, y0 + h * 0.14, z1, post * 0.5));
    if (lod > 0) g.append(beam(mx, y0 + h * 0.14, mz, mx, y0 + h * 0.62, mz, post * 0.4));
    // gâble au-dessus du bandeau
    g.append(beam(x0, y0 + h, z0, mx, y0 + h * 1.32, mz, post * 0.5));
    g.append(beam(x1, y0 + h, z1, mx, y0 + h * 1.32, mz, post * 0.5));
    g.append(pinnacle(post * 1.3, h * 0.5, 0).translate(x0, y0 + h, z0));
  }
  g.append(cyl(r * 1.1, r * 1.1, h * 0.05, 8, { flat: true, bottom: true }).translate(0, y0 + h * 0.97, 0));
  return y0 + h * 1.02;
}

/**
 * Flèche ajourée (Notre-Dame, Sainte-Chapelle) : souche évasée, deux étages octogonaux à claire-voie, aiguille à
 * crochets, boule, croix et coq. Base sur y = 0. Retourne l'altitude du sommet.
 */
export function openworkSpire(b: Builder, o: OpenSpireOpts): number {
  const R = o.radius, H = o.height, lod = o.lod ?? 1;
  const g = new Geo(), core = new Geo();
  g.append(cyl(R * 1.5, R * 1.08, H * 0.07, 8, { flat: true, top: false }));
  let y = H * 0.07;
  y = spireStage(g, core, R, y, H * 0.165, lod);
  y = spireStage(g, core, R * 0.76, y, H * 0.12, lod);
  const rn = R * 0.6, hn = H - y;
  g.append(cyl(rn, R * 0.03, hn, 8, { flat: true, top: false }).translate(0, y, 0));
  if (lod > 0) {
    // crochets le long des huit arêtes
    const n = 11;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1), r = rn * (1 - t) + R * 0.03 * t, sz = Math.max(0.1, R * 0.11 * (1 - t * 0.6));
        g.append(box(sz, sz * 1.1, sz, { bottom: true }).rotateY(a).translate((r + sz * 0.35) * s, y + hn * t, (r + sz * 0.35) * c));
      }
    }
  }
  b.add(o.mat, g);
  b.add(o.matCore ?? o.mat, core);
  // boule, croix, coq
  const f = new Geo(), br = Math.max(0.22, R * 0.09);
  f.append(sphere(br, 8, 5).translate(0, H + br * 0.6, 0));
  const ch = Math.max(2.2, H * 0.045);
  f.append(box(br * 0.45, ch, br * 0.45).translate(0, H + br, 0));
  f.append(box(ch * 0.55, br * 0.45, br * 0.45).translate(0, H + br + ch * 0.62, 0));
  let top = H + br + ch;
  if (o.rooster !== false) { f.append(birdGeo('coq', Math.max(0.9, R * 0.3)).translate(0, top, 0)); top += Math.max(0.9, R * 0.3) * 1.0; }
  b.add(o.matFinial ?? o.mat, f);
  return top;
}

// ───────────────────────────── vaisseau et chevet ─────────────────────────────

export interface NaveTier {
  /** Demi-largeur extérieure du mur de ce niveau ; altitudes du bas et du haut de sa partie visible. */
  half: number; y0: number; y1: number;
  /** Rangée de l'atlas peinte sur ce mur. */
  row: string;
  /** Balustrade ajourée au sommet. */
  rail?: boolean;
}

export interface NaveSpec {
  atlas: GothicAtlas;
  /** Pierre des culées, corniches et arcs-boutants ; couverture ; claire-voie à découpe alpha (balustrades). */
  stone: MatRef; roof: MatRef; ajour?: MatRef;
  /** Niveaux du plus bas et plus extérieur (chapelles) au plus haut (fenêtres hautes). */
  tiers: NaveTier[];
  /** Hauteur du comble au-dessus du dernier niveau. */
  roofRise: number;
  /** Culée au droit de chaque travée : épaisseur (le long du mur), débord extérieur, pénétration, hauteur, pinacle. */
  pier?: { w: number; out: number; inn: number; h: number; pinnacle: number };
  /** Arc-boutant : altitudes du pied (sur la culée) et de la tête (contre le mur), épaisseur ; seconde volée facultative. */
  flying?: { y0: number; y1: number; t: number; land?: number; second?: { y0: number; y1: number; land: number } };
  /** Contrefort plat du mur haut, au droit des arcs-boutants : largeur, saillie, pinacle au-dessus de la corniche. */
  strip?: { w: number; d: number; pinnacle?: number };
  lod: 0 | 1;
}

/** Culée, arc(s)-boutant(s) et contrefort haut du côté +x, dans le plan z = 0 (à tourner / refléter ensuite). */
function pierUnit(s: NaveSpec): Geo {
  const g = new Geo();
  const t0 = s.tiers[0], last = s.tiers[s.tiers.length - 1];
  if (s.pier) {
    const p = s.pier, len = p.out + p.inn, cx = t0.half + (p.out - p.inn) / 2;
    g.append(box(len + 0.7, p.h * 0.42, p.w + 0.3, { top: false }).translate(cx + 0.35, 0, 0));
    g.append(box(len, p.h * 0.58, p.w, { top: false }).translate(cx, p.h * 0.42, 0));
    g.append(frustum(len + 0.7, p.w + 0.3, len, p.w, 0.7, { top: false }).translate(cx + 0.35, p.h * 0.42 - 0.7, 0));
    // chaperon en bâtière et pinacle sur la partie extérieure
    g.append(slabXY([-len / 2, 0, len / 2, 0, len / 2 - p.w * 0.4, p.w * 0.9, -len / 2, p.w * 1.7], p.w).translate(cx, p.h, 0));
    if (p.pinnacle > 0) g.append(pinnacle(Math.min(p.w, 1.5) * 0.95, p.pinnacle, s.lod).translate(t0.half + p.out - p.w * 0.55, p.h + p.w * 0.25, 0));
  }
  if (s.flying && s.pier) {
    const f = s.flying, land = s.tiers[f.land ?? s.tiers.length - 1], xFoot = t0.half - s.pier.inn;
    const span = xFoot - land.half;
    if (span > 0.5) g.append(flyingButtress(span, f.y1 - f.y0, f.t, { seg: s.lod > 0 ? 8 : 5 }).scale(-1, 1, 1).translate(xFoot, f.y0, 0));
    if (f.second) {
      const l2 = s.tiers[f.second.land], sp2 = xFoot - l2.half;
      if (sp2 > 0.5) g.append(flyingButtress(sp2, f.second.y1 - f.second.y0, f.t * 0.85, { seg: s.lod > 0 ? 6 : 4 }).scale(-1, 1, 1).translate(xFoot, f.second.y0, 0));
    }
  }
  if (s.strip) {
    const st = s.strip;
    g.append(box(st.d, last.y1 - last.y0, st.w, { top: false }).translate(last.half + st.d / 2, last.y0, 0));
    if (st.pinnacle) g.append(pinnacle(st.w * 0.8, st.pinnacle, 0).translate(last.half + st.d * 0.5, last.y1, 0));
  }
  return g;
}

export interface NaveBuildOpts {
  /** false : pas de comble (le monument pose le sien). */
  roof?: boolean;
  /** Indices de travée (0..bays) sans culée (contre une tour, un transept). */
  skip?: number[];
  /** Côtés construits : [−x, +x]. */
  sides?: [boolean, boolean];
}

/**
 * Vaisseau gothique droit d'axe z, de z = 0 à z = `length`, centré sur x = 0 : murs étagés peints, corniches,
 * appentis, comble à deux versants, culées et arcs-boutants à chaque limite de travée.
 */
export function gothicNave(b: Builder, s: NaveSpec, length: number, bays: number, o: NaveBuildOpts = {}): void {
  const wallsG = new Geo(), stone = new Geo(), roof = new Geo(), rail = new Geo();
  const sides = o.sides ?? [true, true];
  for (const sg of [-1, 1]) {
    if (!sides[sg < 0 ? 0 : 1]) continue;
    for (let k = 0; k < s.tiers.length; k++) {
      const t = s.tiers[k], x = sg * t.half;
      const az = sg > 0 ? length : 0, bz = sg > 0 ? 0 : length;
      wallsG.append(rowWall(s.atlas, t.row, x, az, x, bz, t.y0, t.y1, { bays }));
      stone.append(sweep(corniceProfile(t.y1 - 0.45, 0.45, 0.32, true), [x, az, x, bz]));
      if (t.rail && s.ajour) rail.append(ribbonUv([x + sg * 0.2, az, x + sg * 0.2, bz], t.y1, t.y1 + 1.15, false, 1.1, AJOUR_RAIL[0], AJOUR_RAIL[1]));
      const up = s.tiers[k + 1];
      if (up) {
        if (sg > 0) roof.append(roofQuad(t.half, length, t.half, 0, t.y1, up.half, 0, up.half, length, up.y0));
        else roof.append(roofQuad(-t.half, 0, -t.half, length, t.y1, -up.half, length, -up.half, 0, up.y0));
      }
    }
  }
  const last = s.tiers[s.tiers.length - 1];
  if (o.roof !== false) roof.append(gableRoof(last.half + 0.35, 0, length, s.roofRise).translate(0, last.y1, 0));
  if (s.pier || s.strip) {
    const unit = pierUnit(s), mirror = unit.clone().scale(-1, 1, 1);
    for (let i = 0; i <= bays; i++) {
      if (o.skip && o.skip.includes(i)) continue;
      const z = (i / bays) * length;
      if (sides[1]) stone.append(unit.clone().translate(0, 0, z));
      if (sides[0]) stone.append(mirror.clone().translate(0, 0, z));
    }
  }
  b.add(s.atlas.key, wallsG);
  b.add(s.stone, stone);
  b.add(s.roof, roof);
  if (s.ajour && rail.triangleCount > 0) b.add(s.ajour, rail);
}

/**
 * Chevet demi-circulaire assorti à gothicNave : centre à l'origine, raccordé au vaisseau en z = 0, arrondi vers −z.
 * `segs` pans ; une culée et un arc-boutant rayonnant à chaque limite de pan (`ends` : y compris aux deux extrémités).
 */
export function gothicApse(b: Builder, s: NaveSpec, segs: number, o: { ends?: boolean; roof?: boolean } = {}): void {
  const wallsG = new Geo(), stone = new Geo(), roof = new Geo(), rail = new Geo();
  const dir = (i: number): [number, number] => { const a = (i / segs) * Math.PI; return [Math.cos(a), -Math.sin(a)]; };
  for (let k = 0; k < s.tiers.length; k++) {
    const t = s.tiers[k], up = s.tiers[k + 1];
    const path: number[] = [];
    for (let i = 0; i <= segs; i++) { const [dx, dz] = dir(i); path.push(t.half * dx, t.half * dz); }
    for (let i = 0; i < segs; i++) {
      wallsG.append(rowWall(s.atlas, t.row, path[2 * i], path[2 * i + 1], path[2 * i + 2], path[2 * i + 3], t.y0, t.y1));
      if (up) {
        const [d0x, d0z] = dir(i), [d1x, d1z] = dir(i + 1);
        roof.append(roofQuad(path[2 * i], path[2 * i + 1], path[2 * i + 2], path[2 * i + 3], t.y1, up.half * d1x, up.half * d1z, up.half * d0x, up.half * d0z, up.y0));
      }
    }
    stone.append(sweep(corniceProfile(t.y1 - 0.45, 0.45, 0.32, true), path));
    if (t.rail && s.ajour) {
      const rp: number[] = [];
      for (let i = 0; i <= segs; i++) { const [dx, dz] = dir(i); rp.push((t.half + 0.2) * dx, (t.half + 0.2) * dz); }
      rail.append(ribbonUv(rp, t.y1, t.y1 + 1.15, false, 1.1, AJOUR_RAIL[0], AJOUR_RAIL[1]));
    }
  }
  const last = s.tiers[s.tiers.length - 1];
  if (o.roof !== false) {
    const r = last.half + 0.35, yb = last.y1, yt = last.y1 + s.roofRise;
    for (let i = 0; i < segs; i++) {
      const [d0x, d0z] = dir(i), [d1x, d1z] = dir(i + 1);
      roof.face3(r * d0x, yb, r * d0z, r * d1x, yb, r * d1z, 0, yt, 0, 0, 0, r * (Math.PI / segs), 0, r * (Math.PI / segs) * 0.5, Math.hypot(r, s.roofRise));
    }
  }
  if (s.pier || s.strip) {
    const unit = pierUnit(s);
    for (let i = o.ends ? 0 : 1; i <= (o.ends ? segs : segs - 1); i++) stone.append(unit.clone().rotateY((i / segs) * Math.PI));
  }
  b.add(s.atlas.key, wallsG);
  b.add(s.stone, stone);
  b.add(s.roof, roof);
  if (s.ajour && rail.triangleCount > 0) b.add(s.ajour, rail);
}
