/* Obstacles de la tour Saint-Jacques : la base est OUVERTE par quatre arcades (on passe sous la voûte, autour de la
 * statue de Pascal) ; seules les quatre piles d'angle et le socle de la statue sont pleins au sol.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW, rectRing } from '../shape2d';
import { alignOf, applyAlign } from '../x-edifices-align';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -6.65, maxX: 6.61, minZ: -6.12, maxZ: 6.19 } as const;

export const EMPRISE: readonly number[] = [
  -5.6, 6.2, 5.4, 6.1, 5.6, 4, 6.5, 4, 6.6, -4.2, 5.9, -4.2, 6, -6.1, -6.4, -5.9, -6.2, -2.5, -6.7, -2.4,
];

/** Demi-côté du fût (nu des murs), côté des piles d'angle, hauteur sous voûte des arcades. */
export const TSJ = { half: 4.8, pier: 3.1, vault: 8.2 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  // les obstacles décrits dans le repère de dessin sont recalés sur l'emprise du site
  const pose = alignOf(site.footprint, EMPRISE);
  const fit = (r: number[]): number[] => applyAlign(r, pose);
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  const out: MonumentCollider[] = [];
  const c = TSJ.half + 1.5 - TSJ.pier / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ ring: fit(rectRing(sx * c, sz * c, TSJ.pier, TSJ.pier)), height: 50, baseY: 0 });
  // statue de Blaise Pascal, sous la voûte
  out.push({ ring: fit(rectRing(0, 0, 1.8, 1.8)), height: 4.4, baseY: 0 });
  // le fût au-dessus des arcades : on passe dessous
  out.push({ ring, height: 54 - TSJ.vault, baseY: TSJ.vault });
  return out;
}
