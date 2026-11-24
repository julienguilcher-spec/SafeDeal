/* =====================================================================================
 * Effets visuels — budgets par niveau de qualité (logique pure, testable sous Node).
 *
 * « bas » vise un téléphone : très peu de particules, des bouffées plus grosses et moins
 * nombreuses, quatre lumières dans le shader des fumées. Les plafonds sont des capacités
 * de tampons : rien n'est alloué en cours de jeu.
 * ===================================================================================== */

import type { QualityLevel } from '@/core/contracts';

export interface FxBudget {
  readonly level: QualityLevel;
  /** Quads dessinés au plus par image dans la couche de particules (tout compris). */
  readonly maxSprites: number;
  /** Particules libres simulées en même temps (fumée des incendies, étincelles, eau, débris…). */
  readonly maxParticles: number;
  /** Bouffées des nuages de gaz et de fumée tirées du champ des dangers. */
  readonly maxPuffs: number;
  /** Flammes persistantes (feux au sol, objets, véhicules, personnes). */
  readonly maxFlames: number;
  /** Décalques persistants (les plus anciens s'effacent au-delà). */
  readonly maxDecals: number;
  /** Projectiles dessinés. */
  readonly maxProjectiles: number;
  /** Tronçons de traînée par projectile en vol. */
  readonly trailSegments: number;
  /** Lumières ponctuelles prises en compte par le shader des fumées. */
  readonly shaderLights: number;
  /** Lumières demandées à la réserve du rendu de base ('render.lights'). */
  readonly sceneLights: number;
  /** Rayon de lecture du champ de gaz autour de la caméra (m). */
  readonly cloudRadius: number;
  /** Niveau d'agrégation de base des cellules du champ : 0 = cellule (2 m), 1 = 4 m, 2 = 8 m. */
  readonly cellLod: number;
  /** Nombre de bouffées superposées par cellule dense (phases d'écoulement). */
  readonly puffLayers: number;
  /** Multiplicateur du nombre de particules des recettes (explosion, gerbe, panache). */
  readonly emission: number;
  /** Côté d'une vignette de l'atlas de particules (pixels). */
  readonly atlasTile: number;
  /** Côté de l'atlas des décalques (pixels). */
  readonly decalAtlas: number;
  /** Distance au-delà de laquelle les effets secondaires (braises, traînées) sont abandonnés (m). */
  readonly detailDistance: number;
}

export const FX_BUDGETS: Readonly<Record<QualityLevel, FxBudget>> = {
  bas: {
    level: 'bas', maxSprites: 900, maxParticles: 420, maxPuffs: 300, maxFlames: 56, maxDecals: 96,
    maxProjectiles: 160, trailSegments: 3, shaderLights: 4, sceneLights: 3, cloudRadius: 110, cellLod: 1,
    puffLayers: 1, emission: 0.32, atlasTile: 64, decalAtlas: 512, detailDistance: 45,
  },
  moyen: {
    level: 'moyen', maxSprites: 2600, maxParticles: 1300, maxPuffs: 900, maxFlames: 150, maxDecals: 200,
    maxProjectiles: 300, trailSegments: 5, shaderLights: 6, sceneLights: 6, cloudRadius: 170, cellLod: 1,
    puffLayers: 2, emission: 0.62, atlasTile: 128, decalAtlas: 512, detailDistance: 80,
  },
  haut: {
    level: 'haut', maxSprites: 5200, maxParticles: 2600, maxPuffs: 1800, maxFlames: 280, maxDecals: 320,
    maxProjectiles: 450, trailSegments: 7, shaderLights: 8, sceneLights: 8, cloudRadius: 230, cellLod: 0,
    puffLayers: 2, emission: 1, atlasTile: 128, decalAtlas: 1024, detailDistance: 120,
  },
  ultra: {
    level: 'ultra', maxSprites: 9000, maxParticles: 4500, maxPuffs: 3200, maxFlames: 400, maxDecals: 480,
    maxProjectiles: 600, trailSegments: 9, shaderLights: 8, sceneLights: 10, cloudRadius: 300, cellLod: 0,
    puffLayers: 2, emission: 1.4, atlasTile: 128, decalAtlas: 1024, detailDistance: 160,
  },
};

export const FX_QUALITY_LEVELS: readonly QualityLevel[] = ['bas', 'moyen', 'haut', 'ultra'];

export function budgetFor(level: QualityLevel | string | undefined): FxBudget {
  const b = FX_BUDGETS[level as QualityLevel];
  return b ?? FX_BUDGETS.moyen;
}

/**
 * Nombre de particules d'une recette après application du multiplicateur de qualité.
 * Une recette garde toujours au moins `min` particules : un effet doit rester lisible en « bas ».
 */
export function scaledCount(base: number, emission: number, min = 1): number {
  const n = Math.round(base * emission);
  return n < min ? min : n;
}

/**
 * Niveau d'agrégation d'une cellule du champ selon sa distance à la caméra : fin de près,
 * grossier au loin. `bias` est la surcharge courante (0 en temps normal ; monte quand le nuage
 * dépasse le budget de bouffées). Résultat borné à [0, MAX_CELL_LOD].
 */
export const MAX_CELL_LOD = 4;
export function cellLodFor(distance: number, budget: FxBudget, bias: number): number {
  let lod = budget.cellLod + bias;
  if (distance > 45) lod++;
  if (distance > 110) lod++;
  if (distance > 220) lod++;
  return lod < 0 ? 0 : lod > MAX_CELL_LOD ? MAX_CELL_LOD : lod;
}

/**
 * Régulation de la surcharge : compare le nombre de bouffées obtenu au budget et retourne la
 * nouvelle surcharge (avec hystérésis, pour ne pas osciller d'une reconstruction à l'autre).
 */
export function nextLodBias(bias: number, puffs: number, budget: FxBudget): number {
  if (puffs > budget.maxPuffs) return bias < MAX_CELL_LOD ? bias + 1 : bias;
  // quatre fois moins de bouffées au niveau plus fin : on ne redescend que s'il reste une marge nette
  if (bias > 0 && puffs * 4.6 < budget.maxPuffs) return bias - 1;
  return bias;
}

/**
 * Part des effets secondaires à garder à une distance donnée (1 de près, 0 au-delà de la
 * distance de détail) : sert à espacer braises, étincelles et traînées des foyers lointains.
 */
export function detailFactor(distance: number, budget: FxBudget): number {
  const d = budget.detailDistance;
  if (distance <= d * 0.5) return 1;
  if (distance >= d) return 0;
  return 1 - (distance - d * 0.5) / (d * 0.5);
}
