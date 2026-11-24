/* =====================================================================================
 * IMMEUBLES — couches de l'atlas de textures (logique pure : indices partagés entre la
 * génération des maillages et la peinture des textures)
 * -------------------------------------------------------------------------------------
 * L'atlas est une texture « tableau » (sampler2DArray) : une couche = une cellule de façade
 * (une travée × un niveau) ou un matériau de toiture. Chaque couche se répète nativement
 * dans les deux directions : pas de marge, pas de bavure entre cellules.
 *
 * Familles de façade : cinq cellules consécutives par variante haussmannienne
 * (rez-de-chaussée, porte, étage courant, étage noble, dernier étage) et quatre pour les
 * autres styles (rez-de-chaussée, porte, étage courant, dernier étage). La cellule « porte »
 * suit TOUJOURS la cellule « rez-de-chaussée » : le shader passe de l'une à l'autre en
 * ajoutant 1 pour la travée qui porte l'entrée.
 * ===================================================================================== */

import type { BuildingStyle } from '../../mapdata';

// Décalages dans une famille
export const CELL_RDC = 0;
export const CELL_DOOR = 1;
export const CELL_TYP = 2;
/** Haussmann seulement. */
export const CELL_NOBLE = 3;
/** Dernier étage : indice 4 en haussmannien, 3 ailleurs. */
export const CELL_TOP_HAUSSMANN = 4;
export const CELL_TOP_OTHER = 3;

export const HAUSSMANN_VARIANTS = 3;
export const FAUBOURG_VARIANTS = 2;
export const MODERN_VARIANTS = 2;
export const MONUMENTAL_VARIANTS = 1;

export const LAYER_HAUSSMANN = 0;                                           // 3 × 5
export const LAYER_FAUBOURG = LAYER_HAUSSMANN + HAUSSMANN_VARIANTS * 5;     // 2 × 4
export const LAYER_MODERN = LAYER_FAUBOURG + FAUBOURG_VARIANTS * 4;         // 2 × 4
export const LAYER_MONUMENTAL = LAYER_MODERN + MODERN_VARIANTS * 4;         // 1 × 4
/** Façade sur cour : rez-de-chaussée puis étage. */
export const LAYER_COUR_RDC = LAYER_MONUMENTAL + MONUMENTAL_VARIANTS * 4;
export const LAYER_COUR_TYP = LAYER_COUR_RDC + 1;
/** Murs aveugles : pignons enduits (2 variantes), béton brut. */
export const LAYER_PIGNON = LAYER_COUR_TYP + 1;
export const LAYER_PIGNON_B = LAYER_PIGNON + 1;
export const LAYER_BETON = LAYER_PIGNON_B + 1;
/** Toitures et accessoires. */
export const LAYER_ZINC_BRISIS = LAYER_BETON + 1;       // zinc à joints debout (pente raide)
export const LAYER_ZINC_LUCARNE = LAYER_ZINC_BRISIS + 1; // même zinc, lucarne peinte (une par travée)
export const LAYER_ARDOISE_BRISIS = LAYER_ZINC_LUCARNE + 1;
export const LAYER_ARDOISE_LUCARNE = LAYER_ARDOISE_BRISIS + 1;
export const LAYER_ZINC_PLAT = LAYER_ARDOISE_LUCARNE + 1; // terrasson
export const LAYER_GRAVIER = LAYER_ZINC_PLAT + 1;         // toit-terrasse
export const LAYER_TUILE = LAYER_GRAVIER + 1;
export const LAYER_SOUCHE = LAYER_TUILE + 1;              // souche de cheminée (côté)
export const LAYER_SOUCHE_TOP = LAYER_SOUCHE + 1;         // dessus de souche (mitrons vus d'en haut)
export const LAYER_PIERRE = LAYER_SOUCHE_TOP + 1;         // pierre lisse (dalles de balcon, corniches)
export const LAYER_LUCARNE_FACE = LAYER_PIERRE + 1;       // face avant d'une lucarne en volume
/** Grain fin (détail de près), échantillonné par le shader. */
export const LAYER_GRAIN = LAYER_LUCARNE_FACE + 1;
export const LAYER_COUNT = LAYER_GRAIN + 1;

/** Dimensions nominales (m) représentées par une cellule de façade. */
export const CELL_BAY_M = 2.8;
export const CELL_FLOOR_M = 3.2;
/** Les matériaux de toiture et les murs aveugles se répètent tous les 2,8 m × 3,2 m. */

/** Valeur de `nBays` qui désactive le calage sur les travées (matériaux continus). */
export const NB_CONTINUOUS = 255;
/** Valeur de `altBay` qui signifie « aucune travée particulière ». */
export const ALT_NONE = 255;

/** Nombre de variantes de façade d'un style. */
export function variantCount(style: BuildingStyle): number {
  switch (style) {
    case 'haussmann': return HAUSSMANN_VARIANTS;
    case 'faubourg': return FAUBOURG_VARIANTS;
    case 'modern': return MODERN_VARIANTS;
    default: return MONUMENTAL_VARIANTS;
  }
}

/** Première couche de la famille (style, variante). */
export function familyBase(style: BuildingStyle, variant: number): number {
  switch (style) {
    case 'haussmann': return LAYER_HAUSSMANN + (variant % HAUSSMANN_VARIANTS) * 5;
    case 'faubourg': return LAYER_FAUBOURG + (variant % FAUBOURG_VARIANTS) * 4;
    case 'modern': return LAYER_MODERN + (variant % MODERN_VARIANTS) * 4;
    default: return LAYER_MONUMENTAL + (variant % MONUMENTAL_VARIANTS) * 4;
  }
}

/** Décalage de la cellule « dernier étage » dans la famille d'un style. */
export function topCell(style: BuildingStyle): number {
  return style === 'haussmann' ? CELL_TOP_HAUSSMANN : CELL_TOP_OTHER;
}
