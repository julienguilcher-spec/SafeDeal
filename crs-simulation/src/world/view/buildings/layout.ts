/* =====================================================================================
 * IMMEUBLES — trame des façades (logique pure)
 * -------------------------------------------------------------------------------------
 * Une façade est une grille : des TRAVÉES (une fenêtre par travée) dans la largeur, des
 * NIVEAUX dans la hauteur. La texture d'une cellule représente exactement une travée sur un
 * niveau ; on calcule donc un nombre ENTIER de travées par pan de mur et de niveaux par
 * hauteur, et on ajuste légèrement leur taille : aucune fenêtre n'est jamais coupée.
 * ===================================================================================== */

import type { BuildingStyle, RoofShape, BuildingKind } from '../../mapdata';

/** Paramètres de trame d'un style de façade (mètres). */
export interface StyleParams {
  /** Largeur nominale d'une travée, et bornes admises après ajustement. */
  bay: number;
  bayMin: number;
  bayMax: number;
  /** Hauteur nominale du rez-de-chaussée et bornes. */
  rdc: number;
  rdcMin: number;
  rdcMax: number;
  /** Hauteur nominale d'un étage courant et bornes. */
  floor: number;
  floorMin: number;
  floorMax: number;
  /** Trumeau minimal à chaque extrémité d'un pan de mur. */
  margin: number;
}

export const STYLE_PARAMS: Record<BuildingStyle, StyleParams> = {
  haussmann: { bay: 2.8, bayMin: 2.55, bayMax: 3.05, rdc: 4.0, rdcMin: 3.2, rdcMax: 5.0, floor: 3.2, floorMin: 2.75, floorMax: 3.7, margin: 0.2 },
  faubourg: { bay: 2.7, bayMin: 2.4, bayMax: 3.0, rdc: 3.5, rdcMin: 2.8, rdcMax: 4.4, floor: 3.0, floorMin: 2.6, floorMax: 3.5, margin: 0.2 },
  modern: { bay: 3.0, bayMin: 2.7, bayMax: 3.3, rdc: 3.8, rdcMin: 3.0, rdcMax: 4.8, floor: 3.1, floorMin: 2.7, floorMax: 3.6, margin: 0.1 },
  monumental: { bay: 3.6, bayMin: 3.2, bayMax: 4.1, rdc: 5.0, rdcMin: 3.6, rdcMax: 6.5, floor: 4.6, floorMin: 3.7, floorMax: 5.6, margin: 0.3 },
};

// ─────────────────────────────────────────────────────────────────────────────────────
// Travées
// ─────────────────────────────────────────────────────────────────────────────────────

export interface BayLayout {
  /** Nombre de travées (0 : pan de mur trop court, laissé aveugle). */
  n: number;
  /** Largeur réelle d'une travée (m). */
  width: number;
  /** Trumeau à chaque extrémité (m) : n·width + 2·margin = longueur du pan. */
  margin: number;
}

/** Une travée seule peut être resserrée jusqu'à cette fraction de la largeur nominale. */
const SINGLE_BAY_SQUEEZE = 0.74;

/**
 * Répartit des travées sur un pan de mur de longueur `length`.
 * Garanties : n entier ≥ 0 ; n·width + 2·margin = length ; margin ≥ p.margin (si n > 0) ;
 * bayMin ≤ width ≤ bayMax dès que n ≥ 2 ; pour n = 1, width ≥ 0,74·bay ; n croît avec length.
 */
export function layoutBays(length: number, p: StyleParams, out: BayLayout): BayLayout {
  out.n = 0;
  out.width = p.bay;
  out.margin = length > 0 ? length / 2 : 0;
  if (!(length > 0)) return out;
  const usable = length - 2 * p.margin;
  const single = p.bay * SINGLE_BAY_SQUEEZE;
  if (usable < single) return out;
  // plus grand nombre de travées qui tiennent à la largeur minimale ; au moins une
  let n = Math.floor(usable / p.bayMin + 1e-9);
  if (n < 1) n = 1;
  // on préfère la largeur la plus proche du nominal : essayer n et n - 1
  let w = usable / n;
  if (n > 1) {
    const w2 = usable / (n - 1);
    if (w2 <= p.bayMax && Math.abs(w2 - p.bay) < Math.abs(w - p.bay)) { n--; w = w2; }
  }
  if (w > p.bayMax) w = p.bayMax;       // le reste part dans les trumeaux d'extrémité
  out.n = n;
  out.width = w;
  out.margin = (length - n * w) / 2;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Niveaux
// ─────────────────────────────────────────────────────────────────────────────────────

export interface FloorLayout {
  /** Hauteur du mur de façade, du pied à l'égout du toit (m). */
  wallH: number;
  /** Hauteur réservée au toit (m) : wallH + roofH = hauteur totale. */
  roofH: number;
  /** Hauteur du rez-de-chaussée (m). */
  rdcH: number;
  /** Nombre d'étages au-dessus du rez-de-chaussée. */
  nUpper: number;
  /** Hauteur d'un étage (m) : rdcH + nUpper·floorH = wallH. */
  floorH: number;
}

/** Hauteur réservée au toit selon sa forme. `span` = largeur approximative du bâtiment (m). */
export function roofHeightFor(roof: RoofShape, height: number, span: number, kind: BuildingKind): number {
  if (kind === 'roof') return Math.min(0.5, height * 0.5);
  if (height < 4.5) return roof === 'flat' ? 0 : Math.min(height * 0.3, 1.2);
  switch (roof) {
    case 'mansard': return Math.min(3.3, Math.max(2.2, height * 0.16));
    case 'gabled': return Math.min(4.0, Math.max(1.2, span * 0.28), height * 0.35);
    case 'dome': return Math.min(Math.max(span * 0.45, 1.5), height * 0.5);
    default: return 0;      // toit plat : le mur monte jusqu'en haut (l'acrotère est dans l'épaisseur)
  }
}

/**
 * Découpe la hauteur d'un bâtiment en rez-de-chaussée + étages.
 * `levels` (rez-de-chaussée compris) est respecté s'il donne des étages de hauteur plausible ;
 * sinon le nombre d'étages est recalculé d'après la hauteur.
 * Garantie : rdcH + nUpper·floorH = wallH (au flottant près), nUpper ≥ 0.
 */
export function layoutFloors(height: number, roofH: number, levels: number, p: StyleParams, out: FloorLayout): FloorLayout {
  const h = height > 0.5 ? height : 0.5;
  let rh = roofH < 0 ? 0 : roofH;
  if (rh > h - 0.4) rh = Math.max(0, h - 0.4);
  const wallH = h - rh;
  out.wallH = wallH;
  out.roofH = rh;
  // trop bas pour un étage : un seul niveau
  if (wallH < p.rdcMin + p.floorMin) {
    out.rdcH = wallH;
    out.nUpper = 0;
    out.floorH = p.floor;
    return out;
  }
  let nUpper = -1;
  if (levels >= 2) {
    const f = (wallH - p.rdc) / (levels - 1);
    if (f >= p.floorMin && f <= p.floorMax) nUpper = levels - 1;
    else {
      // essayer en laissant varier le rez-de-chaussée dans ses bornes
      const fLo = (wallH - p.rdcMax) / (levels - 1), fHi = (wallH - p.rdcMin) / (levels - 1);
      if (fHi >= p.floorMin && fLo <= p.floorMax) nUpper = levels - 1;
    }
  }
  if (nUpper < 0) {
    nUpper = Math.round((wallH - p.rdc) / p.floor);
    if (nUpper < 1) nUpper = 1;
  }
  // hauteur d'étage dans ses bornes, le rez-de-chaussée absorbe l'écart
  let f = (wallH - p.rdc) / nUpper;
  if (f < p.floorMin) f = p.floorMin;
  if (f > p.floorMax) f = p.floorMax;
  let rdc = wallH - nUpper * f;
  if (rdc < p.rdcMin || rdc > p.rdcMax) {
    // bornes incompatibles avec ce nombre d'étages : on ajuste le nombre, puis on répartit
    while (rdc < p.rdcMin && nUpper > 1) { nUpper--; rdc = wallH - nUpper * f; }
    while (rdc > p.rdcMax) { nUpper++; rdc = wallH - nUpper * f; if (rdc < p.rdcMin) break; }
    if (rdc < p.rdcMin || rdc > p.rdcMax) {
      rdc = rdc < p.rdcMin ? p.rdcMin : p.rdcMax;
      f = (wallH - rdc) / nUpper;
    }
  }
  out.rdcH = rdc;
  out.nUpper = nUpper;
  out.floorH = f;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Composition verticale : quelle cellule pour quel étage
// ─────────────────────────────────────────────────────────────────────────────────────

/** Nature d'un étage (au-dessus du rez-de-chaussée). */
export const FLOOR_TYP = 0;
export const FLOOR_NOBLE = 1;
export const FLOOR_TOP = 2;

/**
 * Nature de l'étage `k` (0 = premier étage) d'une façade de `nUpper` étages.
 * Haussmannien : étage noble à balcon filant au 2ᵉ étage (au 1ᵉʳ si l'immeuble est bas), balcon
 * filant et corniche au dernier étage carré ; les autres styles n'ont qu'un dernier étage
 * distinct (corniche, attique).
 */
export function floorKind(style: BuildingStyle, k: number, nUpper: number): number {
  if (k === nUpper - 1 && (nUpper >= 2 || style !== 'haussmann')) return FLOOR_TOP;
  if (style === 'haussmann') {
    const noble = nUpper >= 4 ? 1 : 0;
    if (k === noble) return FLOOR_NOBLE;
  }
  return FLOOR_TYP;
}

/** Générateur déterministe entier → [0, 1) (hachage 32 bits), pour varier sans Math.random. */
export function hash01(a: number, b: number = 0): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

let variation = 0;

/** Fixe la graine des variations d'aspect (teintes, variantes de façade, matériaux de toit). */
export function setVariationSeed(seed: number): void {
  variation = Math.imul(seed | 0, 0x9e3779b1) | 0;
}

/**
 * Tirage stable 0..1 pour un bâtiment : dépend de son identifiant, d'un sujet `k` (teinte,
 * variante…) et de la graine fixée par setVariationSeed. Le même bâtiment a donc le même aspect
 * dans la version détaillée et dans la version lointaine.
 */
export function vhash(id: number, k: number): number {
  return hash01(id ^ variation, k);
}
