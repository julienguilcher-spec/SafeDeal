/* Choix du niveau de détail des véhicules — logique pure (testée sous Node). */

import type { QualityLevel } from '@/core/contracts';

/** 0 = modèle détaillé, 1 = modèle lointain (≤ 300 triangles), 2 = non affiché. */
export type VehicleLod = 0 | 1 | 2;
export const LOD_NEAR: VehicleLod = 0;
export const LOD_FAR: VehicleLod = 1;
export const LOD_HIDDEN: VehicleLod = 2;

export interface VehicleQuality {
  /** Distance (m) jusqu'à laquelle une voiture de 4,5 m garde son modèle détaillé. */
  near: number;
  /** Distance maximale d'affichage (m), bornée ensuite par ViewApi.drawDistance. */
  far: number;
  /** Nombre visé de modèles détaillés simultanés : au-delà, la distance « near » est réduite. */
  maxNear: number;
  /** Distance d'affichage des halos et des éclats lumineux (m). */
  glow: number;
  /** Nombre maximal de quads lumineux (halos, éclats, flammes). */
  maxFx: number;
  /** Les modèles détaillés projettent une ombre. */
  shadows: boolean;
  /** Projecteur réel pour les phares du véhicule du joueur (demandé au service facultatif 'render.lights'). */
  playerHeadlamp: boolean;
  /** Côté de l'atlas de marquages (px). */
  atlasSize: number;
}

export const VEHICLE_QUALITY: Readonly<Record<QualityLevel, VehicleQuality>> = {
  bas: { near: 22, far: 220, maxNear: 8, glow: 120, maxFx: 256, shadows: false, playerHeadlamp: false, atlasSize: 1024 },
  moyen: { near: 36, far: 340, maxNear: 16, glow: 200, maxFx: 512, shadows: true, playerHeadlamp: true, atlasSize: 2048 },
  haut: { near: 55, far: 460, maxNear: 28, glow: 280, maxFx: 768, shadows: true, playerHeadlamp: true, atlasSize: 2048 },
  ultra: { near: 80, far: 600, maxNear: 48, glow: 360, maxFx: 1024, shadows: true, playerHeadlamp: true, atlasSize: 2048 },
};

/** Marge d'hystérésis : il faut s'éloigner de 12 % au-delà du seuil pour perdre le détail (évite le battement). */
export const LOD_HYSTERESIS = 0.12;

/**
 * Facteur de taille : un gros véhicule garde son détail plus loin (un bus de 12 m occupe à 100 m autant
 * d'écran qu'une citadine à 35 m). Borné pour que les très petits engins (drone) ne disparaissent pas trop tôt.
 */
export function lodSizeFactor(length: number): number {
  const f = length / 4.5;
  return f < 0.6 ? 0.6 : f > 2.6 ? 2.6 : f;
}

/**
 * Niveau de détail d'un véhicule.
 * @param prev   niveau à l'image précédente (hystérésis)
 * @param dist   distance à la caméra (m)
 * @param length longueur du véhicule (m)
 * @param q      préréglage de qualité
 * @param maxDistance distance d'affichage courante (ViewApi.drawDistance)
 * @param nearScale   réduction dynamique de la distance « near » (1 = aucune) quand trop de modèles détaillés
 */
export function chooseLod(
  prev: VehicleLod, dist: number, length: number, q: VehicleQuality, maxDistance: number, nearScale = 1,
): VehicleLod {
  const size = lodSizeFactor(length);
  const far = Math.min(q.far * Math.max(1, size * 0.8), maxDistance > 0 ? maxDistance : q.far);
  const near = Math.min(q.near * size * nearScale, far * 0.9);
  const hideAt = prev === LOD_HIDDEN ? far : far * (1 + LOD_HYSTERESIS);
  if (dist > hideAt) return LOD_HIDDEN;
  const nearAt = prev === LOD_NEAR ? near * (1 + LOD_HYSTERESIS) : near;
  return dist <= nearAt ? LOD_NEAR : LOD_FAR;
}

/**
 * Ajuste le facteur de réduction de la distance « near » d'après le nombre de modèles détaillés affichés
 * à l'image précédente : au-dessus du budget on resserre, bien en dessous on relâche. Résultat dans [0,35 ; 1].
 */
export function adaptNearScale(scale: number, nearCount: number, budget: number): number {
  let s = scale;
  if (nearCount > budget) s *= 0.94;
  else if (nearCount < budget * 0.7) s *= 1.03;
  return s < 0.35 ? 0.35 : s > 1 ? 1 : s;
}
