/* =====================================================================================
 * IMMEUBLES — murs, balcons et corniches (logique pure)
 * -------------------------------------------------------------------------------------
 * Un pan de façade est un empilement de bandes horizontales : rez-de-chaussée (prolongé
 * sous le sol par le soubassement), puis une bande par série d'étages de même nature.
 * Coordonnées de texture d'une bande :
 *   u = position en TRAVÉES : 0 au bord de la première fenêtre, n au bord de la dernière ;
 *       les trumeaux d'extrémité ont u < 0 ou u > n (le shader y répète la colonne de mur) ;
 *   v = position en NIVEAUX : 0 au pied, 1 en haut du rez-de-chaussée, 1 + k en haut du
 *       k-ième étage. Une cellule de texture = une travée × un niveau : rien n'est coupé.
 * ===================================================================================== */

import type { Building, BuildingStyle } from '../../mapdata';
import {
  ALT_NONE, CELL_BAY_M, CELL_DOOR, CELL_FLOOR_M, CELL_NOBLE, CELL_RDC, CELL_TYP, LAYER_BETON, LAYER_COUR_RDC, LAYER_COUR_TYP,
  LAYER_PIERRE, LAYER_PIGNON, NB_CONTINUOUS, familyBase, topCell, variantCount,
} from './layers';
import { FLOOR_NOBLE, FLOOR_TOP, FLOOR_TYP, STYLE_PARAMS, floorKind, hash01, layoutBays } from './layout';
import type { BayLayout, StyleParams } from './layout';
import type { MeshData } from './meshdata';
import { WALL_FREE, WALL_HIDDEN, effectiveStyle } from './prepare';
import type { PreparedTile } from './prepare';

/** Niveau de détail géométrique (dérivé de la qualité, puis réduit si la tuile est trop lourde). */
export interface DetailLevel {
  /** Balcons filants en volume (dalle + garde-corps ajouré). Sinon ils sont peints dans la texture. */
  balconies: boolean;
  /** Corniches en saillie. */
  cornices: boolean;
  /** Lucarnes en volume sur les brisis. Sinon elles sont peintes. */
  dormers: boolean;
  /** Souches de cheminées. */
  chimneys: boolean;
  /** Acrotères en volume sur les toits plats, édicules techniques. */
  parapets: boolean;
  /** Abouts de dalles et retours de garde-corps. */
  ends: boolean;
  /** Segments des dômes. */
  domeSegments: number;
  /** Profondeur du soubassement sous le pied du bâtiment (m). */
  skirt: number;
}

/** Période (m) du motif de garde-corps le long d'un balcon. */
export const RAIL_PERIOD_M = 1.4;
/** Hauteur d'un garde-corps de balcon (m). */
export const RAIL_HEIGHT = 1.0;

/** Données par côté d'un anneau (tampons réutilisés). */
export class EdgeSet {
  cap = 64;
  count = 0;
  /** Premier sommet de l'anneau dans PreparedTile.coords. */
  start = 0;
  len = new Float32Array(64);
  /** Abscisse curviligne du début du côté (m). */
  cum = new Float32Array(64);
  /** Normale sortante unitaire. */
  nx = new Float32Array(64);
  nz = new Float32Array(64);
  /** Classement du mur (WALL_*). */
  flag = new Uint8Array(64);
  /** Travées : nombre, largeur, trumeau d'extrémité ; u aux deux bouts du côté. */
  n = new Uint8Array(64);
  w = new Float32Array(64);
  m = new Float32Array(64);
  u0 = new Float32Array(64);
  u1 = new Float32Array(64);
  /** Le côté porte une saillie (balcon, corniche) — recalculé pour chaque saillie. */
  has = new Uint8Array(64);
  perimeter = 0;

  private grow(n: number): void {
    let c = this.cap;
    while (c < n) c *= 2;
    this.cap = c;
    this.len = new Float32Array(c); this.cum = new Float32Array(c); this.nx = new Float32Array(c); this.nz = new Float32Array(c);
    this.flag = new Uint8Array(c); this.n = new Uint8Array(c); this.w = new Float32Array(c); this.m = new Float32Array(c);
    this.u0 = new Float32Array(c); this.u1 = new Float32Array(c); this.has = new Uint8Array(c);
  }

  /**
   * Calcule longueurs, normales et travées des côtés d'un anneau.
   * @param bays  null : aucun côté n'a de travées (murs aveugles) ; sinon la trame à appliquer aux murs libres.
   */
  compute(p: PreparedTile, ring: number, bays: StyleParams | null): void {
    const s = p.ringStart[ring], n = p.ringLen[ring];
    if (n > this.cap) this.grow(n);
    this.count = n;
    this.start = s;
    const cs = p.coords;
    let cum = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      const dx = cs[2 * (s + j)] - cs[2 * (s + i)], dz = cs[2 * (s + j) + 1] - cs[2 * (s + i) + 1];
      const len = Math.hypot(dx, dz);
      this.len[i] = len;
      this.cum[i] = cum;
      if (len > 1e-6) { this.nx[i] = -dz / len; this.nz[i] = dx / len; } else { this.nx[i] = 0; this.nz[i] = 0; }
      const flag = len < 0.05 ? WALL_HIDDEN : p.wall[s + i];
      this.flag[i] = flag;
      if (flag === WALL_FREE && bays !== null) {
        layoutBays(len, bays, bayOut);
        this.n[i] = bayOut.n > 250 ? 250 : bayOut.n;
        this.w[i] = bayOut.width;
        this.m[i] = bayOut.margin;
        if (bayOut.n > 0) {
          const nb = this.n[i];
          const w = (len - 2 * bayOut.margin) / nb;        // identique à width, sauf si n a été plafonné
          this.w[i] = w;
          this.u0[i] = -bayOut.margin / w;
          this.u1[i] = nb + bayOut.margin / w;
        } else {
          this.u0[i] = 0;
          this.u1[i] = 0;
        }
      } else {
        this.n[i] = 0;
        this.w[i] = CELL_BAY_M;
        this.m[i] = len / 2;
        this.u0[i] = cum / CELL_BAY_M;
        this.u1[i] = (cum + len) / CELL_BAY_M;
      }
      cum += len;
    }
    this.perimeter = cum;
  }
}

const bayOut: BayLayout = { n: 0, width: 0, margin: 0 };

/** Contexte du bâtiment en cours de génération (un seul objet, réutilisé). */
export class BuildCtx {
  p!: PreparedTile;
  k = 0;
  b!: Building;
  style: BuildingStyle = 'haussmann';
  sp: StyleParams = STYLE_PARAMS.haussmann;
  detail!: DetailLevel;
  /** Première couche de la famille de façade, décalage de la cellule « dernier étage ». */
  family = 0;
  topOffset = 0;
  /** Couche des murs aveugles de ce bâtiment. */
  blankLayer = LAYER_PIGNON;
  /** Tous les murs sont aveugles (chantier, parking, entrepôt). */
  allBlank = false;
  /** Auvent ou halle : pas de murs, seulement une couverture. */
  canopy = false;
  y0 = 0;
  wallH = 0;
  roofH = 0;
  rdcH = 0;
  floorH = 0;
  nUpper = 0;
  /** Graine 0..255 du bâtiment (éclairage des fenêtres) et nombre aléatoire 0..1. */
  seed = 0;
  rand = 0;
  /** Teinte du bâtiment (0..1). */
  tr = 1;
  tg = 1;
  tb = 1;
  /** Côté de l'anneau extérieur qui porte l'entrée, et sa travée (-1 : aucun). */
  doorEdge = -1;
  doorBay = 0;
  /** Le style a des balcons filants (haussmannien). */
  hasBalconies = false;

  begin(p: PreparedTile, k: number, detail: DetailLevel): void {
    this.p = p;
    this.k = k;
    const b = p.building[k];
    this.b = b;
    this.detail = detail;
    const style = effectiveStyle(b);
    this.style = style;
    this.sp = STYLE_PARAMS[style] ?? STYLE_PARAMS.haussmann;
    const rand = p.rand[k];
    this.rand = rand;
    this.seed = (rand * 256) | 0;
    const variant = Math.floor(hash01(b.id, 77) * variantCount(style));
    this.family = familyBase(style, variant);
    this.topOffset = topCell(style);
    this.y0 = p.baseY[k];
    this.wallH = p.wallH[k];
    this.roofH = p.roofH[k];
    this.rdcH = p.rdcH[k];
    this.floorH = p.floorH[k];
    this.nUpper = p.nUpper[k];
    this.canopy = b.kind === 'roof';
    this.allBlank = b.kind === 'construction' || b.kind === 'parking' || b.kind === 'industrial' || this.canopy;
    this.blankLayer = this.allBlank || style === 'modern' ? LAYER_BETON : LAYER_PIGNON + (hash01(b.id, 5) < 0.5 ? 0 : 1);
    this.hasBalconies = style === 'haussmann' && !this.allBlank && this.nUpper >= 2;
    this.doorEdge = -1;
    buildingTint(style, b.id, this);
  }
}

/** Teinte d'un bâtiment : légère variation autour de la couleur de la texture, stable par identifiant. */
function buildingTint(style: BuildingStyle, id: number, out: { tr: number; tg: number; tb: number }): void {
  const a = hash01(id, 11), c = hash01(id, 23), d = hash01(id, 31);
  let r = 1, g = 1, b = 1;
  if (style === 'haussmann' || style === 'monumental') {
    // pierre de taille : du blond ravalé au gris patiné
    const light = 0.84 + 0.2 * a;
    const warm = (c - 0.45) * 0.09;
    r = light * (1 + warm); g = light; b = light * (1 - warm * 1.4);
    if (d < 0.12) { r *= 0.9; g *= 0.9; b *= 0.92; }       // façade encrassée
  } else if (style === 'faubourg') {
    // enduits : crème, blanc cassé, gris perle, ocre pâle, rosé
    const pick = (c * 5) | 0;
    const light = 0.88 + 0.14 * a;
    if (pick === 0) { r = 1; g = 0.97; b = 0.89; }
    else if (pick === 1) { r = 1; g = 1; b = 0.98; }
    else if (pick === 2) { r = 0.93; g = 0.94; b = 0.95; }
    else if (pick === 3) { r = 0.99; g = 0.91; b = 0.79; }
    else { r = 1; g = 0.92; b = 0.88; }
    r *= light; g *= light; b *= light;
  } else {
    // moderne : bétons et panneaux du blanc au gris chaud
    const light = 0.8 + 0.24 * a;
    const warm = (c - 0.5) * 0.06;
    r = light * (1 + warm); g = light; b = light * (1 - warm);
  }
  out.tr = r > 1 ? 1 : r;
  out.tg = g > 1 ? 1 : g;
  out.tb = b > 1 ? 1 : b;
}

/** Choisit le côté et la travée qui portent l'entrée de l'immeuble (plus long mur libre). */
export function chooseDoor(c: BuildCtx, es: EdgeSet): void {
  let best = -1, bestLen = 0;
  for (let i = 0; i < es.count; i++) {
    if (es.flag[i] !== WALL_FREE || es.n[i] === 0) continue;
    if (es.len[i] > bestLen) { bestLen = es.len[i]; best = i; }
  }
  c.doorEdge = best;
  if (best >= 0) {
    const n = es.n[best];
    c.doorBay = n <= 2 ? 0 : Math.min(n - 1, Math.floor(n / 2 - (c.rand < 0.5 && n % 2 === 0 ? 1 : 0)));
  }
}

/** Assombrissement du pied des murs (occlusion ambiante de la rue). */
const FOOT_SHADE = 0.74;
/** Assombrissement du haut de l'étage situé sous un balcon filant. */
const UNDER_BALCONY_SHADE = 0.84;

/**
 * Émet les murs d'un anneau.
 * @param courtyard  l'anneau est une cour intérieure (façade simple)
 */
export function emitWalls(m: MeshData, c: BuildCtx, es: EdgeSet, courtyard: boolean): void {
  const cs = c.p.coords;
  const s = es.start, n = es.count;
  const y0 = c.y0, yFoot = y0 - c.detail.skirt, yRdc = y0 + c.rdcH, yTop = y0 + c.wallH;
  const hf = c.floorH, nUpper = c.nUpper;
  const vFoot = -c.detail.skirt / c.rdcH;
  for (let i = 0; i < n; i++) {
    const flag = es.flag[i];
    if (flag === WALL_HIDDEN) continue;
    const j = i + 1 < n ? i + 1 : 0;
    const ax = cs[2 * (s + i)], az = cs[2 * (s + i) + 1], bx = cs[2 * (s + j)], bz = cs[2 * (s + j) + 1];
    m.nx = es.nx[i]; m.ny = 0; m.nz = es.nz[i];
    const u0 = es.u0[i], u1 = es.u1[i];

    if (c.canopy) {
      // auvent : simple bandeau de rive sous la couverture
      const yb = yTop - Math.min(0.5, c.wallH * 0.5);
      m.tint(c.tr, c.tg, c.tb);
      m.facade(LAYER_BETON, NB_CONTINUOUS, 0, ALT_NONE);
      m.quad(ax, yb, az, u0, 0, bx, yb, bz, u1, 0, bx, yTop, bz, u1, 0.15, ax, yTop, az, u0, 0.15);
      continue;
    }

    if (flag !== WALL_FREE || c.allBlank) {
      // mur aveugle : pignon enduit ou béton, d'un seul tenant
      m.tint(c.tr * 0.96, c.tg * 0.96, c.tb * 0.96);
      m.facade(c.blankLayer, NB_CONTINUOUS, 0, ALT_NONE);
      m.ensure(4, 6);
      m.shade = FOOT_SHADE;
      const a = m.vertex(ax, yFoot, az, u0, -c.detail.skirt / CELL_FLOOR_M);
      m.vertex(bx, yFoot, bz, u1, -c.detail.skirt / CELL_FLOOR_M);
      m.shade = 1;
      m.vertex(bx, yTop, bz, u1, c.wallH / CELL_FLOOR_M);
      m.vertex(ax, yTop, az, u0, c.wallH / CELL_FLOOR_M);
      m.quadIdx(a, a + 1, a + 2, a + 3);
      continue;
    }

    const nb = es.n[i];
    const seed = c.seed + i * 13;
    m.tint(c.tr, c.tg, c.tb);

    if (courtyard) {
      // façade sur cour : deux bandes, sans ornement
      m.ensure(8, 12);
      m.facade(LAYER_COUR_RDC, nb, seed, ALT_NONE);
      m.shade = FOOT_SHADE;
      let a = m.vertex(ax, yFoot, az, u0, vFoot);
      m.vertex(bx, yFoot, bz, u1, vFoot);
      m.shade = 1;
      m.vertex(bx, yRdc, bz, u1, 1);
      m.vertex(ax, yRdc, az, u0, 1);
      m.quadIdx(a, a + 1, a + 2, a + 3);
      if (nUpper > 0) {
        m.facade(LAYER_COUR_TYP, nb, seed, ALT_NONE);
        a = m.vertex(ax, yRdc, az, u0, 1);
        m.vertex(bx, yRdc, bz, u1, 1);
        m.vertex(bx, yTop, bz, u1, 1 + nUpper);
        m.vertex(ax, yTop, az, u0, 1 + nUpper);
        m.quadIdx(a, a + 1, a + 2, a + 3);
      }
      continue;
    }

    // façade sur rue : rez-de-chaussée…
    m.ensure(4 + 4 * (nUpper > 4 ? 4 : nUpper), 6 + 6 * (nUpper > 4 ? 4 : nUpper));
    const single = nUpper === 0;
    // un bâtiment d'un seul niveau prend la cellule « dernier étage » si elle existe pour finir par une corniche
    m.facade(c.family + CELL_RDC, nb, seed, i === c.doorEdge ? c.doorBay : ALT_NONE);
    m.shade = FOOT_SHADE;
    let a = m.vertex(ax, yFoot, az, u0, vFoot);
    m.vertex(bx, yFoot, bz, u1, vFoot);
    m.shade = !single && c.hasBalconies && floorKind(c.style, 0, nUpper) === FLOOR_NOBLE ? UNDER_BALCONY_SHADE : 1;
    m.vertex(bx, yRdc, bz, u1, 1);
    m.vertex(ax, yRdc, az, u0, 1);
    m.shade = 1;
    m.quadIdx(a, a + 1, a + 2, a + 3);
    // … puis une bande par série d'étages de même nature
    let k0 = 0;
    while (k0 < nUpper) {
      const kind = floorKind(c.style, k0, nUpper);
      let k1 = k0 + 1;
      while (k1 < nUpper && floorKind(c.style, k1, nUpper) === kind) k1++;
      const cell = kind === FLOOR_NOBLE ? CELL_NOBLE : kind === FLOOR_TOP ? c.topOffset : CELL_TYP;
      m.facade(c.family + cell, nb, seed, ALT_NONE);
      const ya = yRdc + k0 * hf, yb = k1 === nUpper ? yTop : yRdc + k1 * hf;
      a = m.vertex(ax, ya, az, u0, 1 + k0);
      m.vertex(bx, ya, bz, u1, 1 + k0);
      if (c.hasBalconies && k1 < nUpper && floorKind(c.style, k1, nUpper) !== FLOOR_TYP) m.shade = UNDER_BALCONY_SHADE;
      m.vertex(bx, yb, bz, u1, 1 + k1);
      m.vertex(ax, yb, az, u0, 1 + k1);
      m.shade = 1;
      m.quadIdx(a, a + 1, a + 2, a + 3);
      k0 = k1;
    }
  }
  m.shade = 1;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Saillies : balcons filants et corniches
// ─────────────────────────────────────────────────────────────────────────────────────

/** En deçà de cette valeur de (1 + n₀·n₁), l'angle est trop aigu pour un onglet : about droit. */
const MITER_MIN = 0.3;

/**
 * Émet une saillie horizontale continue (dalle de balcon ou corniche) le long des côtés marqués
 * dans es.has, avec onglets aux angles. `rail` non nul : garde-corps ajouré posé sur le nez de dalle.
 * @param yBot, yTop  dessous et dessus de la saillie
 * @param depth       saillie (m)
 */
export function emitLedge(
  m: MeshData, rail: MeshData | null, c: BuildCtx, es: EdgeSet, yBot: number, yTop: number, depth: number, withTop: boolean,
): void {
  const cs = c.p.coords;
  const s = es.start, n = es.count;
  const ends = c.detail.ends;
  m.facade(LAYER_PIERRE, NB_CONTINUOUS, 0, ALT_NONE);
  for (let i = 0; i < n; i++) {
    if (!es.has[i]) continue;
    const j = i + 1 < n ? i + 1 : 0, h = i > 0 ? i - 1 : n - 1;
    const ax = cs[2 * (s + i)], az = cs[2 * (s + i) + 1], bx = cs[2 * (s + j)], bz = cs[2 * (s + j) + 1];
    const nx = es.nx[i], nz = es.nz[i];
    // about côté A
    let oax = nx * depth, oaz = nz * depth, squareA = true;
    if (es.has[h]) {
      const d = 1 + es.nx[h] * nx + es.nz[h] * nz;
      if (d > MITER_MIN) { oax = ((es.nx[h] + nx) * depth) / d; oaz = ((es.nz[h] + nz) * depth) / d; squareA = false; }
    }
    // about côté B
    let obx = nx * depth, obz = nz * depth, squareB = true;
    if (es.has[j]) {
      const d = 1 + es.nx[j] * nx + es.nz[j] * nz;
      if (d > MITER_MIN) { obx = ((es.nx[j] + nx) * depth) / d; obz = ((es.nz[j] + nz) * depth) / d; squareB = false; }
    }
    const pax = ax + oax, paz = az + oaz, pbx = bx + obx, pbz = bz + obz;
    const ua = es.cum[i] / CELL_BAY_M, ub = (es.cum[i] + es.len[i]) / CELL_BAY_M;
    const vd = depth / CELL_FLOOR_M, vt = (yTop - yBot) / CELL_FLOOR_M;
    m.tint(c.tr, c.tg, c.tb);
    // nez (face avant)
    m.nx = nx; m.ny = 0; m.nz = nz;
    m.shade = 0.97;
    m.quad(pax, yBot, paz, ua, 0, pbx, yBot, pbz, ub, 0, pbx, yTop, pbz, ub, vt, pax, yTop, paz, ua, vt);
    // dessous (dans l'ombre)
    m.nx = 0; m.ny = -1; m.nz = 0;
    m.shade = 0.62;
    m.quad(ax, yBot, az, ua, 0, bx, yBot, bz, ub, 0, pbx, yBot, pbz, ub, vd, pax, yBot, paz, ua, vd);
    // dessus
    if (withTop) {
      m.nx = 0; m.ny = 1; m.nz = 0;
      m.shade = 0.9;
      m.quad(ax, yTop, az, ua, 0, pax, yTop, paz, ua, vd, pbx, yTop, pbz, ub, vd, bx, yTop, bz, ub, 0);
    }
    // abouts droits
    if (ends) {
      const dx = (bx - ax) / (es.len[i] || 1), dz = (bz - az) / (es.len[i] || 1);
      m.shade = 0.85;
      if (squareA) {
        m.nx = -dx; m.ny = 0; m.nz = -dz;
        m.quad(ax, yBot, az, 0, 0, pax, yBot, paz, vd, 0, pax, yTop, paz, vd, vt, ax, yTop, az, 0, vt);
      }
      if (squareB) {
        m.nx = dx; m.ny = 0; m.nz = dz;
        m.quad(pbx, yBot, pbz, 0, 0, bx, yBot, bz, vd, 0, bx, yTop, bz, vd, vt, pbx, yTop, pbz, 0, vt);
      }
    }
    m.shade = 1;
    if (rail !== null) {
      // garde-corps : un quadrilatère ajouré (double face) sur le nez de dalle ; v ∈ [0,5 ; 1] de la texture
      const ru0 = es.cum[i] / RAIL_PERIOD_M, ru1 = (es.cum[i] + es.len[i]) / RAIL_PERIOD_M;
      const yr = yTop + RAIL_HEIGHT;
      rail.nx = nx; rail.ny = 0; rail.nz = nz;
      const inx = nx * 0.04, inz = nz * 0.04;         // légèrement en retrait du nez
      rail.quad(pax - inx, yTop, paz - inz, ru0, 0.5, pbx - inx, yTop, pbz - inz, ru1, 0.5, pbx - inx, yr, pbz - inz, ru1, 1, pax - inx, yr, paz - inz, ru0, 1);
      if (ends) {
        const rd = depth / RAIL_PERIOD_M;
        if (squareA) rail.quad(ax, yTop, az, 0, 0.5, pax - inx, yTop, paz - inz, rd, 0.5, pax - inx, yr, paz - inz, rd, 1, ax, yr, az, 0, 1);
        if (squareB) rail.quad(pbx - inx, yTop, pbz - inz, 0, 0.5, bx, yTop, bz, rd, 0.5, bx, yr, bz, rd, 1, pbx - inx, yr, pbz - inz, 0, 1);
      }
    }
  }
  m.shade = 1;
}

/** Marque dans es.has les murs libres d'au moins `minLen` mètres ; retourne leur nombre. */
export function markLedgeEdges(es: EdgeSet, minLen: number): number {
  let count = 0;
  for (let i = 0; i < es.count; i++) {
    const ok = es.flag[i] === WALL_FREE && es.len[i] >= minLen;
    es.has[i] = ok ? 1 : 0;
    if (ok) count++;
  }
  return count;
}

/**
 * Balcons filants (étage noble et dernier étage) et corniche d'un immeuble, sur l'anneau extérieur.
 */
export function emitLedges(m: MeshData, rail: MeshData, c: BuildCtx, es: EdgeSet): void {
  if (c.allBlank || c.canopy) return;
  const d = c.detail;
  const yRdc = c.y0 + c.rdcH;
  if (d.balconies && c.hasBalconies) {
    if (markLedgeEdges(es, 0.9) > 0) {
      for (let k = 0; k < c.nUpper; k++) {
        const kind = floorKind(c.style, k, c.nUpper);
        if (kind !== FLOOR_NOBLE && kind !== FLOOR_TOP) continue;
        const y = yRdc + k * c.floorH;
        const depth = kind === FLOOR_NOBLE ? 0.75 : 0.6;
        emitLedge(m, rail, c, es, y - 0.17, y + 0.03, depth, true);
      }
    }
  }
  if (d.cornices && c.style !== 'modern' && c.wallH > 3) {
    if (markLedgeEdges(es, 0.6) > 0) {
      const yTop = c.y0 + c.wallH;
      const depth = c.style === 'monumental' ? 0.55 : c.style === 'haussmann' ? 0.42 : 0.28;
      emitLedge(m, null, c, es, yTop - (c.style === 'faubourg' ? 0.22 : 0.34), yTop + 0.02, depth, true);
    }
  }
}
