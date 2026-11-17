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
/**
 * Largeur sous laquelle le HUD passe aussi en disposition compacte : dans une fenêtre d'ordinateur de 960 px, la
 * disposition large faisait se recouvrir le panneau de situation, la boussole et le bandeau d'unité.
 */
export const COMPACT_WIDTH = 1100;

/** Disposition compacte pour cette taille de fenêtre ? */
export function isCompact(width: number, height: number): boolean {
  return height < COMPACT_HEIGHT || width < COMPACT_WIDTH;
}

/** Rectangle d'écran (pixels CSS), forme minimale d'un DOMRect. */
export interface ScreenBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
}

/**
 * Centre vertical (px) de la zone de gauche (« Secours », « Vue drone », proposition de l'adjoint), ou null pour la
 * laisser au milieu de l'écran. Elle descend sous la zone du haut à gauche (état, mini-carte) quand elle la
 * chevauche, mais ne descend jamais sur ce qui est en bas (état physique, tableau de bord, barre d'objets tactile :
 * `floor`, haut de la zone du bas) : sur un téléphone, la proposition de l'adjoint passait sur la barre d'objets
 * et l'état physique. Quand la place manque entre les deux, le bas l'emporte — la zone mord sur le bas de la
 * mini-carte plutôt que de cacher des boutons.
 */
export function leftZoneCenter(zone: ScreenBox, above: ScreenBox, floor: number, screenHeight: number): number | null {
  if (zone.height <= 0) return null;
  const half = zone.height / 2;
  let center = screenHeight / 2;
  let moved = false;
  if (above.height > 0 && zone.left < above.right && zone.right > above.left) {
    const under = above.bottom + 8 + half;
    if (under > center) {
      center = under;
      moved = true;
    }
  }
  const max = floor - 8 - half;
  if (center > max) {
    center = Math.max(max, half + 4);
    moved = true;
  }
  return moved ? Math.round(center) : null;
}
