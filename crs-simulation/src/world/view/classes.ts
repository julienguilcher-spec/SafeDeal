/* =====================================================================================
 * VILLE EN 3D — natures de sol (« classes ») communes à tout le dossier.
 * -------------------------------------------------------------------------------------
 * Une classe est à la fois : l'indice d'une couche de l'atlas de textures du sol, le code
 * écrit dans la grille de surfaces d'une tuile (raster.ts) et la valeur portée par les sommets
 * des maillages. Logique pure : aucun import de Three.js.
 * ===================================================================================== */

import type { MapSurfaceKind } from '../mapdata';

export const CL_ASPHALT = 0;    // chaussée en enrobé
export const CL_SETT = 1;       // pavés de granit
export const CL_SIDEWALK = 2;   // trottoir en dalles de granit
export const CL_CURB = 3;       // bordure de granit
export const CL_PLAZA = 4;      // dallage clair des places et des rues piétonnes
export const CL_STABILISE = 5;  // sol stabilisé (allées, jardins)
export const CL_GRASS = 6;      // pelouse
export const CL_SOIL = 7;       // massif planté, terre
export const CL_STONE = 8;      // pierre de taille (quais, parapets, ponts, murs)
export const CL_CONCRETE = 9;   // béton (caniveau, séparateurs, chantier)
export const CL_COURT = 10;     // sol de cour d'îlot
export const CL_PAINT = 11;     // peinture routière
export const CL_EARTH = 12;     // terre battue, ballast (chantier, emprise ferroviaire)
export const CL_HEDGE = 13;     // haie
export const CL_PLASTER = 14;   // mur enduit
export const CL_ROADMACRO = 15; // couche de texture seule : rapiéçages et tranchées de la chaussée
/** Nombre de couches de l'atlas du sol. */
export const CLASS_LAYERS = 16;
/** Code de grille seul : eau. */
export const CL_WATER = 16;
/** Code de grille seul : rien de peint (dessiné comme un dallage de trottoir au niveau de la chaussée). */
export const CL_DEFAULT = 31;

/** Masque des bits de classe dans un code de grille. */
export const CODE_CLASS_MASK = 31;
/** Bit « de l'eau sous cette cellule » (tablier au-dessus d'un plan d'eau). */
export const CODE_OVER_WATER = 32;
/** Bit « tablier de pont » d'un code de grille. */
export const CODE_DECK = 64;
/** Bit « pas au niveau de la chaussée » : surface surélevée, tablier ou eau (la nappe de base ne s'y dessine pas). */
export const CODE_NOT_FLUSH = 128;
/** Code de l'eau dans la grille. */
export const CODE_WATER = CL_WATER | CODE_NOT_FLUSH;

/** Surélévation (m) des trottoirs et terre-pleins au-dessus de la chaussée : hauteur de bordure. */
export const CURB_HEIGHT = 0.08;
/** Surélévation des parkings de surface, des terrains de sport et des pelouses et massifs. */
export const PARKING_LIFT = 0.1;
export const SPORT_LIFT = 0.1;
export const PLANTED_LIFT = 0.13;

/** Couleur moyenne (sRGB 0..255) de chaque classe : vue lointaine, mini-carte, repli. */
export const CLASS_COLOR: readonly (readonly [number, number, number])[] = [
  [92, 93, 96],     // asphalte
  [104, 100, 96],   // pavés
  [150, 148, 144],  // trottoir
  [168, 166, 161],  // bordure
  [176, 168, 152],  // dallage
  [196, 178, 142],  // stabilisé
  [86, 118, 62],    // pelouse
  [70, 92, 54],     // massif
  [186, 174, 150],  // pierre
  [140, 138, 134],  // béton
  [128, 124, 116],  // cour
  [226, 226, 220],  // peinture
  [124, 110, 92],   // terre
  [52, 82, 44],     // haie
  [198, 186, 162],  // enduit
  [74, 75, 78],     // (macro chaussée)
  [58, 74, 66],     // eau
];

/** Ce que devient un polygone de la carte : classe, surélévation, et s'il est dessiné en volume. */
export interface SurfaceStyle {
  /** Classe (couche de texture). */
  cls: number;
  /** Classe quand le polygone recouvre un espace vert (allée de jardin), sinon -1. */
  clsOnGreen: number;
  /** true : polygone surélevé dessiné en géométrie ; false : peint dans la nappe de base. */
  raised: boolean;
  /** Surélévation (m) au-dessus de la chaussée. */
  lift: number;
}

const FLUSH = (cls: number, clsOnGreen = -1): SurfaceStyle => ({ cls, clsOnGreen, raised: false, lift: 0 });
const RAISED = (cls: number, lift: number): SurfaceStyle => ({ cls, clsOnGreen: -1, raised: true, lift });

const STYLE_EARLY: Readonly<Record<MapSurfaceKind, SurfaceStyle>> = {
  plaza: FLUSH(CL_PLAZA, CL_STABILISE),
  road: FLUSH(CL_ASPHALT),
  sidewalk: RAISED(CL_SIDEWALK, CURB_HEIGHT),
  pedestrian: FLUSH(CL_PLAZA, CL_STABILISE),
  median: RAISED(CL_SIDEWALK, CURB_HEIGHT),
  parking: RAISED(CL_ASPHALT, PARKING_LIFT),
  construction: FLUSH(CL_EARTH),
  courtyard: FLUSH(CL_COURT),
  park: FLUSH(CL_STABILISE),
  garden: FLUSH(CL_STABILISE),
  grass: FLUSH(CL_GRASS),
  gravel: FLUSH(CL_STABILISE),
  quay: FLUSH(CL_SETT),
  sports: FLUSH(CL_STABILISE),
  cemetery: FLUSH(CL_STABILISE),
  rail: FLUSH(CL_EARTH),
  water: { cls: CL_WATER, clsOnGreen: -1, raised: false, lift: 0 },
};

/** Après la première chaussée du tableau : pelouses, massifs et terrains de sport sont posés par-dessus la voirie. */
const STYLE_LATE: Partial<Record<MapSurfaceKind, SurfaceStyle>> = {
  grass: RAISED(CL_GRASS, PLANTED_LIFT),
  garden: RAISED(CL_SOIL, PLANTED_LIFT),
  sports: RAISED(CL_STABILISE, SPORT_LIFT),
};

/**
 * Style d'un polygone de la carte. `afterRoad` : une chaussée ou un trottoir le précède dans le
 * tableau des surfaces (l'ordre du tableau est l'ordre de superposition).
 */
export function styleOfSurface(kind: MapSurfaceKind, afterRoad: boolean): SurfaceStyle {
  if (afterRoad) {
    const late = STYLE_LATE[kind];
    if (late !== undefined) return late;
  }
  return STYLE_EARLY[kind] ?? STYLE_EARLY.plaza;
}

/** La classe est-elle une chaussée (enrobé ou pavés) ? */
export function isCarriageway(cls: number): boolean {
  return cls === CL_ASPHALT || cls === CL_SETT;
}

/** La classe est-elle un sol dur piéton (pour les grilles d'arbres) ? */
export function isHardGround(cls: number): boolean {
  return cls === CL_DEFAULT || cls === CL_SIDEWALK || cls === CL_PLAZA || cls === CL_COURT || cls === CL_CURB || cls === CL_CONCRETE;
}

/** La classe est-elle un espace vert ou sablé (une allée y devient du stabilisé) ? */
export function isGreen(cls: number): boolean {
  return cls === CL_STABILISE || cls === CL_GRASS || cls === CL_SOIL;
}

/** Hachage entier → [0, 1[ (variations stables : teintes, tailles). */
export function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Hachage de deux entiers → [0, 1[. */
export function hash2(a: number, b: number): number {
  return hash01(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
}
