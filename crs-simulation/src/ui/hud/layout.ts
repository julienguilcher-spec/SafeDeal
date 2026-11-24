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

/**
 * Rangée de gauche de la surcouche tactile (Radio, pastille « Ordre prêt », « ⟳ À qui ») : distance au bas de l'écran,
 * hauteur, bords gauche et droit, à l'échelle 1 — copie de input/touch/layouts.ts COMMS_ROW (les tests vérifient
 * qu'elles sont égales). La mini-carte et la zone de gauche du HUD restent hors de ce rectangle.
 */
export const TOUCH_COMMS_ROW = { bottom: 136, height: 54, left: 18, right: 268 } as const;
/** Bord gauche de la zone de gauche du HUD en tactile (css/hud.ts) : à droite de la rangée, 8 px d'écart. */
export const TOUCH_LEFT_ZONE_X = 276;

/** Rectangle de la rangée de gauche de la surcouche tactile, en pixels d'écran. */
export function touchCommsRect(width: number, height: number, safeLeft = 0, safeBottom = 0): { left: number; right: number; top: number; bottom: number } {
  const s = touchScale(width, height);
  const r = TOUCH_COMMS_ROW;
  return {
    left: safeLeft + r.left * s, right: safeLeft + r.right * s,
    top: height - safeBottom - (r.bottom + r.height) * s, bottom: height - safeBottom - r.bottom * s,
  };
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
 * Centre vertical (px) de la zone de gauche (« Avec moi », « Secours ici », « Vue drone », proposition de l'adjoint),
 * ou null pour la laisser au milieu de l'écran. Elle descend sous ce qui est en haut (`above` : la zone du haut à
 * gauche — état, mini-carte — et, au téléphone, celle du haut au centre — pastille d'unité, bandeaux) quand elle le
 * chevauche en largeur, mais ne descend jamais sur ce qui est en bas (état physique, tableau de bord, barre d'objets
 * tactile : `floor`, haut de la zone du bas) : sur un téléphone, la proposition de l'adjoint passait sur la barre
 * d'objets et l'état physique. Quand la place manque entre les deux, le bas l'emporte — la zone mord sur le bas de la
 * mini-carte plutôt que de cacher des boutons.
 */
export function leftZoneCenter(zone: ScreenBox, above: ScreenBox | readonly ScreenBox[], floor: number, screenHeight: number): number | null {
  if (zone.height <= 0) return null;
  const half = zone.height / 2;
  let center = screenHeight / 2;
  let moved = false;
  const boxes: readonly ScreenBox[] = Array.isArray(above) ? above : [above as ScreenBox];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (!(b.height > 0 && zone.left < b.right && zone.right > b.left)) continue;
    const under = b.bottom + 8 + half;
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

/** Largeur en deçà de laquelle un sous-titre n'est plus lisible (px) : il passe alors au-dessus de la zone de gauche. */
export const SUBTITLE_MIN_WIDTH = 200;
/** Largeur minimale des sous-titres quand ils restent à droite de la zone de gauche pour ne pas couvrir le haut (px). */
export const SUBTITLE_NARROW_WIDTH = 140;
/** Hauteur de la bande réservée aux sous-titres (px) : deux lignes et leurs marges. */
const SUBTITLE_BAND = 64;
/** Haut de la bande qu'un élément du haut peut mordre sans gêner deux lignes de sous-titres (marge de la réserve, px). */
const SUBTITLE_SLACK = 20;

/**
 * Placement des sous-titres par rapport à la zone de gauche (« Secours », « À pied », « En colonne », proposition de
 * l'adjoint) : distance au bas de l'écran (`bottom`) et bord gauche de la bande (`edge`, −1 = bande normale).
 * - la zone n'est pas à leur hauteur : bande normale, juste au-dessus de la zone du bas ;
 * - elle l'est et il reste la place d'un sous-titre lisible à sa droite (`baseRight` = début des commandes de droite) :
 *   ils passent à sa droite ;
 * - sinon (téléphone en véhicule : les boutons « À pied » / « En colonne » vont presque jusqu'aux pédales) : ils
 *   passent AU-DESSUS de la zone, à droite de la zone du haut à gauche (mini-carte) si elle est à cette hauteur —
 *   resserrés dans 160 px, ils recouvraient « En colonne » et « Plus tard ».
 * `bottomTop` : haut de la zone du bas (px depuis le haut de l'écran).
 * `keepOut` : ce qui est en haut au centre (boussole, pastille d'unité, bandeaux du téléphone : proposition de
 * l'adjoint, véhicule qui bloque). Les sous-titres ne remontent pas dessus : si la bande au-dessus de la zone de
 * gauche le couvrirait, ils restent à droite de la zone, plus étroits (au moins SUBTITLE_NARROW_WIDTH).
 */
export function subtitlePlacement(
  screenWidth: number, screenHeight: number, baseLeft: number, baseRight: number, bottomTop: number,
  zone: ScreenBox | null, above: ScreenBox | null, keepOut: ScreenBox | null = null,
): { bottom: number; edge: number } {
  let bottom = Math.round(screenHeight - bottomTop + 8);
  let edge = -1;
  const beside = (b: ScreenBox, bandBottom: number): boolean =>
    b.height > 0 && b.bottom > bandBottom - SUBTITLE_BAND && b.top < bandBottom && b.right < screenWidth * 0.75;
  if (zone && beside(zone, screenHeight - bottom)) {
    edge = Math.round(zone.right + 8);
    if (baseRight - Math.max(baseLeft, edge) < SUBTITLE_MIN_WIDTH && zone.top > screenHeight * 0.3) {
      const right = { bottom, edge };
      bottom = Math.round(screenHeight - zone.top + 8);
      edge = above && beside(above, screenHeight - bottom) ? Math.round(above.right + 8) : -1;
      if (keepOut && keepOut.height > 0 && baseRight - right.edge >= SUBTITLE_NARROW_WIDTH) {
        const bandBottom = screenHeight - bottom;
        const left = edge >= 0 ? Math.max(baseLeft, edge) : baseLeft;
        if (keepOut.bottom > bandBottom - SUBTITLE_BAND + SUBTITLE_SLACK && keepOut.top < bandBottom && keepOut.left < baseRight && keepOut.right > left) return right;
      }
    }
  }
  return { bottom, edge };
}
