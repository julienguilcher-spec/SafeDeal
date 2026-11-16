/* =====================================================================================
 * HUD — géométrie partagée avec la surcouche tactile du module d'entrées.
 * Les cotes de la surcouche (docs/modules/entrees.md) sont données sur un écran de 844 × 390 et
 * multipliées par cette échelle ; le HUD décale ses zones et ses marqueurs avec la même.
 * ===================================================================================== */

/** Échelle de la surcouche tactile pour une taille d'écran (entre 0,82 et 1,45). */
export function touchScale(width: number, height: number): number {
  const s = Math.min(width / 844, height / 390);
  return s < 0.82 ? 0.82 : s > 1.45 ? 1.45 : s;
}

/** Hauteur d'écran sous laquelle le HUD passe en disposition compacte (téléphone en paysage). */
export const COMPACT_HEIGHT = 520;
