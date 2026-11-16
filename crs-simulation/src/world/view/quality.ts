/* =====================================================================================
 * VILLE EN 3D — réglages par niveau de qualité (données pures).
 * ===================================================================================== */

import type { QualityLevel } from '../../core/contracts';

export interface CityQuality {
  /** Cellules par côté de la grille de surfaces d'une tuile détaillée (512 m / n = précision du partage des revêtements). */
  rasterSize: number;
  /** Côté (px) d'une couche de l'atlas du sol. */
  atlasSize: number;
  anisotropy: number;
  /** Matériaux de Lambert (pas de reflets spéculaires) au lieu des matériaux standard. */
  lambert: boolean;
  /** Fondu des revêtements aux limites, seconde lecture de texture contre la répétition. */
  blend: boolean;
  detail: boolean;
  /** Rayon (m) de la zone détaillée autour de la caméra (distance au rectangle de la tuile). */
  detailRadius: number;
  /** Distances (m) du fondu du sol vers la texture de couleurs de la tuile. */
  fadeNear: number;
  fadeFar: number;
  /** Bordures en relief, caniveaux, marquages, grilles d'arbres. */
  curbs: boolean;
  gutters: boolean;
  markings: boolean;
  grates: boolean;
  /** Arbres : finesse du houppier (subdivision du volume principal et des volumes secondaires, -1 = aucun), vent, silhouette découpée, ombres portées. */
  crownMain: number;
  crownSide: number;
  /** Au-delà de ce nombre d'arbres, une tuile prend le houppier allégé (un seul volume). */
  denseTrees: number;
  trunkSides: number;
  wind: boolean;
  leafCut: boolean;
  treeShadows: boolean;
  /** Arbres simplifiés sur les tuiles lointaines. */
  farTrees: boolean;
  /** Halos des candélabres. */
  halos: boolean;
  /** Temps de construction accordé par image (ms). */
  budgetMs: number;
  /** Largeur de margelle côté terre (m). */
  copingLand: number;
}

export const CITY_QUALITY: Readonly<Record<QualityLevel, CityQuality>> = {
  bas: {
    rasterSize: 512, atlasSize: 256, anisotropy: 2, lambert: true, blend: false, detail: false, detailRadius: 170, fadeNear: 60, fadeFar: 120,
    curbs: true, gutters: false, markings: true, grates: false, crownMain: 1, crownSide: -1, denseTrees: 300, trunkSides: 5, wind: false, leafCut: false,
    treeShadows: false, farTrees: false, halos: false, budgetMs: 3, copingLand: 1.0,
  },
  moyen: {
    rasterSize: 1024, atlasSize: 512, anisotropy: 4, lambert: false, blend: true, detail: false, detailRadius: 260, fadeNear: 90, fadeFar: 170,
    curbs: true, gutters: true, markings: true, grates: true, crownMain: 1, crownSide: 0, denseTrees: 450, trunkSides: 6, wind: false, leafCut: true,
    treeShadows: true, farTrees: true, halos: true, budgetMs: 5, copingLand: 0.6,
  },
  haut: {
    rasterSize: 2048, atlasSize: 512, anisotropy: 8, lambert: false, blend: true, detail: true, detailRadius: 340, fadeNear: 120, fadeFar: 230,
    curbs: true, gutters: true, markings: true, grates: true, crownMain: 2, crownSide: 1, denseTrees: 500, trunkSides: 8, wind: true, leafCut: true,
    treeShadows: true, farTrees: true, halos: true, budgetMs: 6, copingLand: 0.45,
  },
  ultra: {
    rasterSize: 2048, atlasSize: 512, anisotropy: 16, lambert: false, blend: true, detail: true, detailRadius: 460, fadeNear: 150, fadeFar: 300,
    curbs: true, gutters: true, markings: true, grates: true, crownMain: 2, crownSide: 1, denseTrees: 1000, trunkSides: 10, wind: true, leafCut: true,
    treeShadows: true, farTrees: true, halos: true, budgetMs: 8, copingLand: 0.45,
  },
};

export function cityQuality(level: QualityLevel): CityQuality {
  return CITY_QUALITY[level] ?? CITY_QUALITY.moyen;
}
