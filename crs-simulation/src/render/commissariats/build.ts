/* =====================================================================================
 * RENDU DES COMMISSARIATS — construction des maillages (pur three.js : fonctionne sous Node pour les essais).
 *
 * buildSite(def, groundAt, textured) : l'habillage proche d'un site, en DEUX géométries fusionnées :
 *   - façade : encadrement de porte 2,6 × 3,0 m et son vitrage lettré, seuil, deux potelets, enseigne 4,2 × 0,7 m,
 *     plaque « RÉPUBLIQUE FRANÇAISE », lanterne bleue sur potence, drapeau tricolore sur hampe inclinée
 *     (préfecture : lanterne et drapeau seulement, le monument porte déjà son nom) ;
 *   - sol : un quadrilatère par place réservée (cadre jaune et « POLICE »), posé 2,5 cm au-dessus du sol dessiné.
 * buildFar(defs, groundAt) : UNE géométrie pour tous les sites (lanterne en croix et drapeau, 10 triangles par site),
 * avec un attribut aShow par sommet pour masquer un site sans changer d'appel de dessin.
 * createMaterials() : les deux matériaux partagés des sites proches et celui du maillage lointain ; l'émission (lanterne,
 * enseigne, vitrage éclairé) suit l'uniforme uCNight, mis à jour une fois par image.
 *
 * Repère d'un site : F = point de façade, N = normale de la façade (vers la rue), U = droite d'un passant qui regarde
 * la façade, Y = haut ; P(u, v, w) = F + U·u + Y·(sol + v) + N·w. Caps du jeu : atan2(dx, dz).
 * ===================================================================================== */

import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import type { CommissariatDef, YardSlot } from '@/world/commissariats';
import { REGIONS, WHITE_UV, plateRegion, uvOf } from './atlas';
import type { UvRect } from './atlas';
import { sideOffsets } from './dress';

/** Hauteur du sol dessiné en (x, z). */
export type GroundAt = (x: number, z: number) => number;

type V3 = [number, number, number];

/** Teintes (sRGB) des pièces ; les faces texturées prennent le blanc quand l'atlas existe. */
const C = {
  alu: 0x2b3038,
  stone: 0x9a968c,
  glass: 0x24343b,
  plate: 0x1d3a80,
  plateEdge: 0x1b2a55,
  plaque: 0xe9e4d6,
  bollard: 0x34383e,
  band: 0xe8e8e2,
  iron: 0x1a1d22,
  lantern: 0x2a55d0,
  farLantern: 0x1c46e8,
  lanternCap: 0x182033,
  pole: 0xd8d8d2,
  finial: 0xc9a23a,
  blue: 0x002395,
  white: 0xf4f4f0,
  red: 0xed2939,
  bay: 0xf2c400,
  white1: 0xffffff,
} as const;

/** Intensité d'émission pleine nuit (multiplie la couleur des faces lumineuses, pondérée par leur aGlow). */
export const NIGHT_EMISSION = 1.6;

/** Hauteur au-dessus du sol du marquage des places (avec le décalage de polygones, aucun scintillement). */
export const BAY_LIFT = 0.025;
/** Débord du marquage autour du véhicule (m). */
const BAY_PAD_LEN = 0.3;
const BAY_PAD_WIDTH = 0.35;

// ───────────────────────────── accumulateur de géométrie ─────────────────────────────

const tmpColor = new THREE.Color();

class GeoBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];
  readonly glow: number[] = [];
  readonly show: number[] = [];
  readonly idx: number[] = [];

  constructor(private readonly textured: boolean) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private vertex(p: V3, n: V3, rgb: THREE.Color, u: number, v: number, glow: number): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(rgb.r, rgb.g, rgb.b);
    this.uv.push(u, v);
    this.glow.push(glow);
    this.show.push(1);
  }

  /**
   * Quadrilatère plan p0 (bas gauche), p1 (bas droite), p2 (haut droite), p3 (haut gauche) vu de sa face avant ;
   * l'ordre est retourné si sa normale géométrique ne regarde pas du côté de `n`. `uv` null : pièce unie (case
   * blanche de l'atlas). `hex` : teinte sans atlas (et avec, pour une pièce unie).
   */
  quad(p0: V3, p1: V3, p2: V3, p3: V3, n: V3, hex: number, uv: UvRect | null, glow = 0): void {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const rgb = tmpColor.setHex(uv && this.textured ? C.white1 : hex);
    const base = this.vertexCount;
    const [w0, w1] = WHITE_UV;
    if (uv) {
      this.vertex(p0, n, rgb, uv.u0, uv.v0, glow);
      this.vertex(p1, n, rgb, uv.u1, uv.v0, glow);
      this.vertex(p2, n, rgb, uv.u1, uv.v1, glow);
      this.vertex(p3, n, rgb, uv.u0, uv.v1, glow);
    } else {
      this.vertex(p0, n, rgb, w0, w1, glow);
      this.vertex(p1, n, rgb, w0, w1, glow);
      this.vertex(p2, n, rgb, w0, w1, glow);
      this.vertex(p3, n, rgb, w0, w1, glow);
    }
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Triangle unique (pointe de prisme). */
  tri(p0: V3, p1: V3, p2: V3, n: V3, hex: number, glow = 0): void {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const rgb = tmpColor.setHex(hex);
    const base = this.vertexCount;
    const [w0, w1] = WHITE_UV;
    this.vertex(p0, n, rgb, w0, w1, glow);
    this.vertex(p1, n, rgb, w0, w1, glow);
    this.vertex(p2, n, rgb, w0, w1, glow);
    if (flip) this.idx.push(base, base + 2, base + 1);
    else this.idx.push(base, base + 1, base + 2);
  }

  build(far = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    if (far) {
      const show = new THREE.Float32BufferAttribute(this.show, 1);
      show.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aShow', show);
    }
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ───────────────────────────── repère et volumes ─────────────────────────────

function add(a: V3, b: V3, k = 1): V3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}

function scale(a: V3, k: number): V3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

const UP: V3 = [0, 1, 0];

/** Repère de façade d'un site. */
export interface SiteFrame {
  readonly origin: V3;
  readonly U: V3;
  readonly N: V3;
}

export function siteFrame(def: CommissariatDef, groundAt: GroundAt): SiteFrame {
  const h = def.facade.heading;
  const y = groundAt(def.door.x, def.door.z);
  return {
    origin: [def.facade.x, Number.isFinite(y) ? y : 0, def.facade.z],
    N: [Math.sin(h), 0, Math.cos(h)],
    U: [Math.cos(h), 0, -Math.sin(h)],
  };
}

function at(f: SiteFrame, u: number, v: number, w: number): V3 {
  return [
    f.origin[0] + f.U[0] * u + f.N[0] * w,
    f.origin[1] + v,
    f.origin[2] + f.U[2] * u + f.N[2] * w,
  ];
}

interface FaceStyle {
  readonly hex: number;
  readonly uv?: UvRect | null;
  readonly glow?: number;
}

/**
 * Pavé orienté : centre c, axes orthonormés directs (ax × ay = az), demi-côtés hx, hy, hz. `front` : face +az ;
 * `sides` : faces ±ax et ±az (lanterne) ; `skipBack` : pas de face −az (contre le mur).
 */
function box(
  g: GeoBuilder, c: V3, ax: V3, ay: V3, az: V3, hx: number, hy: number, hz: number,
  base: FaceStyle, opts: { front?: FaceStyle; sides?: FaceStyle; skipBack?: boolean; skipBottom?: boolean } = {},
): void {
  const face = (n: V3, r: V3, t: V3, d: number, hr: number, ht: number, st: FaceStyle): void => {
    const fc = add(c, n, d);
    const p0 = add(add(fc, r, -hr), t, -ht);
    const p1 = add(add(fc, r, hr), t, -ht);
    const p2 = add(add(fc, r, hr), t, ht);
    const p3 = add(add(fc, r, -hr), t, ht);
    g.quad(p0, p1, p2, p3, n, st.hex, st.uv ?? null, st.glow ?? 0);
  };
  const negX = scale(ax, -1), negY = scale(ay, -1), negZ = scale(az, -1);
  face(az, ax, ay, hz, hx, hy, opts.front ?? opts.sides ?? base);
  if (!opts.skipBack) face(negZ, negX, ay, hz, hx, hy, opts.sides ?? base);
  face(ax, negZ, ay, hx, hz, hy, opts.sides ?? base);
  face(negX, az, ay, hx, hz, hy, opts.sides ?? base);
  face(ay, ax, negZ, hy, hx, hz, base);
  if (!opts.skipBottom) face(negY, ax, az, hy, hx, hz, base);
}

/** Pavé dans le repère du site, bornes [u0, u1] × [v0, v1] × [w0, w1]. */
function siteBox(
  g: GeoBuilder, f: SiteFrame, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number,
  base: FaceStyle, opts: { front?: FaceStyle; sides?: FaceStyle; skipBack?: boolean; skipBottom?: boolean } = {},
): void {
  const c = at(f, (u0 + u1) / 2, (v0 + v1) / 2, (w0 + w1) / 2);
  box(g, c, f.U, UP, f.N, (u1 - u0) / 2, (v1 - v0) / 2, (w1 - w0) / 2, base, opts);
}

/** Prisme vertical à 8 pans (potelet), chapeau en éventail si `cap`. */
function prism(g: GeoBuilder, cx: number, cz: number, y0: number, y1: number, r: number, hex: number, cap: boolean): void {
  const n = 8;
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([Math.sin(a), Math.cos(a)]);
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i]!, b = ring[(i + 1) % n]!;
    const mid = norm([a[0] + b[0], 0, a[1] + b[1]]);
    g.quad(
      [cx + a[0] * r, y0, cz + a[1] * r], [cx + b[0] * r, y0, cz + b[1] * r],
      [cx + b[0] * r, y1, cz + b[1] * r], [cx + a[0] * r, y1, cz + a[1] * r], mid, hex, null,
    );
  }
  if (cap) {
    const p0: V3 = [cx + ring[0]![0] * r, y1, cz + ring[0]![1] * r];
    for (let i = 1; i < n - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      g.tri(p0, [cx + a[0] * r, y1, cz + a[1] * r], [cx + b[0] * r, y1, cz + b[1] * r], UP, hex);
    }
  }
}

// ───────────────────────────── habillage proche ─────────────────────────────

/** Points remarquables d'un site (bancs d'essai : captures, mesure de la lanterne et de l'enseigne). */
export interface SiteAnchors {
  readonly door: V3;
  readonly lantern: V3;
  /** Centre de l'enseigne (null : pas d'enseigne). */
  readonly sign: V3 | null;
  readonly flag: V3;
  /** Centre et rayon de l'ensemble des places (null : aucune place). */
  readonly bays: { x: number; z: number; radius: number } | null;
}

export interface SiteGeometry {
  /** Façade (null si le site n'a rien à poser sur sa façade — n'arrive pas avec les données actuelles). */
  readonly facade: THREE.BufferGeometry | null;
  /** Places peintes (null : aucune place). */
  readonly ground: THREE.BufferGeometry | null;
  readonly anchors: SiteAnchors;
}

/** Lanterne : potence, corps vitré lettré (quatre faces lumineuses), chapeau, culot. */
function lantern(g: GeoBuilder, f: SiteFrame, u: number, word: 'police' | 'gendarmerie'): V3 {
  const iron: FaceStyle = { hex: C.iron };
  // potence horizontale et jambe de force
  siteBox(g, f, u - 0.025, u + 0.025, 3.53, 3.58, 0, 0.8, iron, { skipBack: true });
  const a = at(f, u, 3.18, 0.02), b = at(f, u, 3.555, 0.52);
  const d = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  box(g, add(a, d, len / 2), f.U, d, cross(f.U, d), 0.018, len / 2, 0.018, iron);
  // tige de suspension, chapeau, toit, corps, culot
  const centre = 0.78;
  siteBox(g, f, u - 0.015, u + 0.015, 3.38, 3.54, centre - 0.015, centre + 0.015, iron);
  siteBox(g, f, u - 0.29, u + 0.29, 3.33, 3.40, centre - 0.29, centre + 0.29, { hex: C.lanternCap });
  siteBox(g, f, u - 0.16, u + 0.16, 3.40, 3.46, centre - 0.16, centre + 0.16, { hex: C.lanternCap }, { skipBottom: true });
  const face: FaceStyle = { hex: C.lantern, uv: uvOf(word === 'police' ? REGIONS.lanterne_police : REGIONS.lanterne_gendarmerie), glow: 0.75 };
  siteBox(g, f, u - 0.24, u + 0.24, 2.76, 3.33, centre - 0.24, centre + 0.24, { hex: C.lantern, glow: 0.75 }, { sides: face });
  siteBox(g, f, u - 0.27, u + 0.27, 2.71, 2.76, centre - 0.27, centre + 0.27, { hex: C.lanternCap });
  return at(f, u, 3.045, centre);
}

/** Drapeau : portion de hampe tenue par le guindant (m depuis le pied) et chute du battant (m). */
const FLAG_T0 = 1.0;
const FLAG_T1 = 2.0;
const FLAG_DROP = 1.5;

/** Point de la hampe à la distance t de son pied. */
function poleAt(f: SiteFrame, u: number, t: number): V3 {
  const c = Math.SQRT1_2;
  return at(f, u, 3.35 + t * c, 0.02 + t * c);
}

/** Hampe inclinée à 45° vers la rue, pomme dorée, drapeau tricolore pendant (deux faces). */
function flag(g: GeoBuilder, f: SiteFrame, u: number): V3 {
  const len = 2.4;
  const foot = poleAt(f, u, 0), tip = poleAt(f, u, len);
  const d = norm([tip[0] - foot[0], tip[1] - foot[1], tip[2] - foot[2]]);
  box(g, add(foot, d, len / 2), f.U, d, cross(f.U, d), 0.022, len / 2, 0.022, { hex: C.pole });
  box(g, add(tip, d, 0.05), f.U, d, cross(f.U, d), 0.045, 0.05, 0.045, { hex: C.finial });
  // drapeau de façade au repos : le guindant (bande bleue) court le long de la hampe, le battant pend ;
  // 1,0 m le long de la hampe, 1,5 m de chute (proportions 2:3) : bleu contre la hampe, blanc, rouge en bas
  const A = poleAt(f, u, FLAG_T0), B = poleAt(f, u, FLAG_T1);
  const stripes = [C.blue, C.white, C.red];
  for (let i = 0; i < 3; i++) {
    const top = (FLAG_DROP * i) / 3, bottom = (FLAG_DROP * (i + 1)) / 3;
    // décalé d'un centimètre de part et d'autre de la hampe : pas de chevauchement des deux faces
    for (const side of [1, -1]) {
      const off = scale(f.U, 0.01 * side);
      const a = add(A, off), b = add(B, off);
      g.quad(add(a, UP, -bottom), add(b, UP, -bottom), add(b, UP, -top), add(a, UP, -top), scale(f.U, side), stripes[i]!, null);
    }
  }
  return add(poleAt(f, u, (FLAG_T0 + FLAG_T1) / 2), UP, -FLAG_DROP / 2);
}

/** Géométrie des places peintes ; une place = un quadrilatère. */
function bays(g: GeoBuilder, slots: readonly YardSlot[], groundAt: GroundAt): void {
  for (const s of slots) {
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const sx = Math.cos(s.heading), sz = -Math.sin(s.heading);
    const hl = (s.len + BAY_PAD_LEN) / 2, hw = (s.width + BAY_PAD_WIDTH) / 2;
    const yf = groundAt(s.x + fx * hl, s.z + fz * hl);
    const yb = groundAt(s.x - fx * hl, s.z - fz * hl);
    const yF = (Number.isFinite(yf) ? yf : 0) + BAY_LIFT;
    const yB = (Number.isFinite(yb) ? yb : 0) + BAY_LIFT;
    const region = s.len < 3 ? REGIONS.baie_moto : REGIONS.baie;
    // u de la texture dans le sens de la longueur (de l'arrière vers l'avant), v dans la largeur
    g.quad(
      [s.x - fx * hl - sx * hw, yB, s.z - fz * hl - sz * hw],
      [s.x + fx * hl - sx * hw, yF, s.z + fz * hl - sz * hw],
      [s.x + fx * hl + sx * hw, yF, s.z + fz * hl + sz * hw],
      [s.x - fx * hl + sx * hw, yB, s.z - fz * hl + sz * hw],
      UP, C.bay, uvOf(region),
    );
  }
}

/**
 * Habillage proche d'un site. `textured` : l'atlas est disponible (faces texturées en blanc par sommet) ; sinon les
 * teintes par sommet seules (Node, repli).
 */
export function buildSite(def: CommissariatDef, groundAt: GroundAt, textured: boolean): SiteGeometry {
  const f = siteFrame(def, groundAt);
  const g = new GeoBuilder(textured);
  const side = sideOffsets(def);
  let sign: V3 | null = null;
  if (def.sign !== 'none') {
    const alu: FaceStyle = { hex: C.alu };
    // encadrement : deux montants, linteau (enfoncés de 25 cm dans le mur, descendus sous le trottoir)
    siteBox(g, f, -1.3, -1.08, -0.3, 3.0, -0.25, 0.22, alu, { skipBack: true });
    siteBox(g, f, 1.08, 1.3, -0.3, 3.0, -0.25, 0.22, alu, { skipBack: true });
    siteBox(g, f, -1.08, 1.08, 2.72, 3.0, -0.25, 0.22, alu, { skipBack: true });
    // seuil de pierre
    siteBox(g, f, -1.3, 1.3, -0.3, 0.06, -0.25, 0.45, { hex: C.stone }, { skipBack: true, skipBottom: true });
    // vitrage lettré, légèrement éclairé la nuit (hall allumé)
    const glassUv = uvOf(def.sign === 'gendarmerie' ? REGIONS.vitre_gendarmerie : REGIONS.vitre_police);
    g.quad(at(f, -1.08, 0.06, 0.06), at(f, 1.08, 0.06, 0.06), at(f, 1.08, 2.72, 0.06), at(f, -1.08, 2.72, 0.06), f.N, C.glass, glassUv, 0.35);
    // enseigne (rétroéclairée la nuit)
    const plate = plateRegion(def.id);
    siteBox(g, f, -2.1, 2.1, 3.2, 3.9, -0.1, 0.06, { hex: C.plateEdge }, {
      front: { hex: C.plate, uv: plate ? uvOf(plate) : null, glow: 0.45 }, skipBack: true,
    });
    sign = at(f, 0, 3.55, 0.06);
    // plaque « RÉPUBLIQUE FRANÇAISE »
    siteBox(g, f, -2.0, -1.45, 1.55, 1.95, -0.05, 0.025, { hex: C.plaque }, {
      front: { hex: C.plaque, uv: uvOf(REGIONS.plaque_rf) }, skipBack: true,
    });
    // deux potelets anthracite à bande blanche, sur le trottoir devant la porte
    for (const u of [-1.75, 1.75]) {
      const p = at(f, u, 0, 1.35);
      prism(g, p[0], p[2], f.origin[1] - 0.25, f.origin[1] + 0.95, 0.1, C.bollard, true);
      prism(g, p[0], p[2], f.origin[1] + 0.74, f.origin[1] + 0.82, 0.104, C.band, false);
    }
  }
  const lanternAt = lantern(g, f, side.lantern, def.sign === 'gendarmerie' ? 'gendarmerie' : 'police');
  const flagAt = flag(g, f, side.flag);
  const facade = g.vertexCount > 0 ? g.build() : null;

  let ground: THREE.BufferGeometry | null = null;
  let bayInfo: SiteAnchors['bays'] = null;
  if (def.slots.length > 0) {
    const gg = new GeoBuilder(textured);
    bays(gg, def.slots, groundAt);
    ground = gg.build();
    let cx = 0, cz = 0;
    for (const s of def.slots) { cx += s.x; cz += s.z; }
    cx /= def.slots.length; cz /= def.slots.length;
    let r = 0;
    for (const s of def.slots) r = Math.max(r, Math.hypot(s.x - cx, s.z - cz) + (s.len + BAY_PAD_LEN) / 2);
    bayInfo = { x: cx, z: cz, radius: r };
  }
  return {
    facade,
    ground,
    anchors: { door: at(f, 0, 1.2, 0.06), lantern: lanternAt, sign, flag: flagAt, bays: bayInfo },
  };
}

// ───────────────────────────── maillage lointain ─────────────────────────────

/** Côté du carré de lanterne lointaine (m) : un peu plus grand que la lanterne, il en tient lieu de halo. */
const FAR_LANTERN = 2.0;

export interface FarGeometry {
  readonly geometry: THREE.BufferGeometry;
  /** Plage de sommets de chaque site (ordre des données). */
  readonly ranges: readonly { readonly start: number; readonly count: number }[];
}

/** Lanterne (deux carrés en croix) et drapeau (trois bandes) de chaque site, en une géométrie. Matériau double face. */
export function buildFar(defs: readonly CommissariatDef[], groundAt: GroundAt): FarGeometry {
  const g = new GeoBuilder(false);
  const ranges: { start: number; count: number }[] = [];
  for (const def of defs) {
    const start = g.vertexCount;
    const f = siteFrame(def, groundAt);
    const side = sideOffsets(def);
    const c = at(f, side.lantern, 3.045, 0.78);
    const h = FAR_LANTERN / 2;
    for (const axis of [f.U, f.N]) {
      const n = cross(axis, UP);
      g.quad(add(add(c, axis, -h), UP, -h), add(add(c, axis, h), UP, -h), add(add(c, axis, h), UP, h), add(add(c, axis, -h), UP, h), n, C.farLantern, null, 1);
    }
    const A = poleAt(f, side.flag, FLAG_T0), B = poleAt(f, side.flag, FLAG_T1);
    const stripes = [C.blue, C.white, C.red];
    for (let i = 0; i < 3; i++) {
      const top = (FLAG_DROP * i) / 3, bottom = (FLAG_DROP * (i + 1)) / 3;
      g.quad(add(A, UP, -bottom), add(B, UP, -bottom), add(B, UP, -top), add(A, UP, -top), f.U, stripes[i]!, null);
    }
    ranges.push({ start, count: g.vertexCount - start });
  }
  return { geometry: g.build(true), ranges };
}

// ───────────────────────────── matériaux ─────────────────────────────

export interface CommissariatMaterials {
  /** Façades de tous les sites proches (émission par sommet : lanterne, enseigne, vitrage). */
  readonly facade: THREE.Material;
  /** Places peintes de tous les sites proches (découpe alpha, décalage de polygones). */
  readonly ground: THREE.Material;
  /** Maillage lointain (sans éclairage, double face, masquage par site). */
  readonly far: THREE.Material;
  /** Niveau d'émission (nuit × intensité), partagé par les trois matériaux. */
  readonly uNight: { value: number };
  dispose(): void;
}

type Shader = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };

/** Les matériaux partagés ; `texture` null : couleurs par sommet seules. */
export function createMaterials(texture: THREE.Texture | null, quality: QualityLevel): CommissariatMaterials {
  const uNight = { value: 0 };
  const low = quality === 'bas';
  const lit = (extra: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial => {
    const common = { vertexColors: true, map: texture, ...extra };
    return low ? new THREE.MeshLambertMaterial(common) : new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.05, ...common });
  };

  const facade = lit({});
  facade.name = 'commissariats-facade';
  facade.onBeforeCompile = (shader: Shader): void => {
    shader.uniforms['uCNight'] = uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vCGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCNight;\nvarying float vCGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vCGlow * uCNight;');
  };
  facade.customProgramCacheKey = (): string => 'commissariats-facade';

  const ground = lit({
    alphaTest: texture ? 0.45 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  ground.name = 'commissariats-places';

  const far = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  far.name = 'commissariats-lointain';
  far.onBeforeCompile = (shader: Shader): void => {
    shader.uniforms['uCNight'] = uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aShow;\nvarying float vCGlow;')
      // site masqué : tous ses sommets ramenés en un point, triangles dégénérés (même appel de dessin)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= aShow;\nvCGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCNight;\nvarying float vCGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n'
        + 'float cNight = clamp( uCNight / ' + NIGHT_EMISSION.toFixed(2) + ', 0.0, 1.0 );\n'
        + 'diffuseColor.rgb *= mix( mix( 0.8, 0.1, cNight ), 0.7 + 1.8 * cNight, vCGlow );');
  };
  far.customProgramCacheKey = (): string => 'commissariats-lointain';

  return {
    facade, ground, far, uNight,
    dispose(): void {
      facade.dispose();
      ground.dispose();
      far.dispose();
    },
  };
}

