/* Obstacles de la Sainte-Chapelle : l'emprise bâtie (nef unique, contreforts, porche) est pleine.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW } from '../shape2d';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -9.11, maxX: 9.07, minZ: -20.94, maxZ: 20.9 } as const;

export const EMPRISE: readonly number[] = [
  -7.6, -6.5, -7.6, -5, -6.1, -4.9, -6.2, -0.5, -7.8, -0.5, -7.7, 0.8, -6.1, 0.8, -6.3, 5.5, -7.8, 5.4, -7.9, 6.8,
  -6.2, 6.8, -6.3, 10.5, -6.8, 10.6, -7.9, 12.1, -7.9, 13.3, -7, 14.5, -8.8, 14.5, -8.6, 19.1, -6.5, 19.5, -6.6, 20.7,
  -5.4, 20.7, -5.3, 19.3, -3.6, 19.3, -3.6, 20.7, -2.9, 20.8, -2.8, 19.2, 2.9, 19.5, 2.8, 20.8, 3.6, 20.9, 3.7, 19.3,
  5.3, 19.5, 5.2, 20.9, 6.2, 20.9, 6.3, 19.6, 7.6, 19.6, 7.5, 18.6, 6.3, 18.6, 6.2, 14.5, 8, 13.6, 8.1, 11.7,
  6.2, 10.8, 6.4, 6.9, 8.1, 7, 8.1, 5.5, 6.5, 5.5, 6.5, 1, 8.3, 1, 8.3, -0.4, 6.6, -0.4, 6.6, -4.8,
  8.5, -4.7, 8.4, -5.6, 9, -6.1, 8.5, -6.9, 9.1, -10.7, 8.6, -11.8, 6.7, -11.9, 6.7, -13.4, 8.3, -13.5, 8.2, -14.7,
  6.7, -14.5, 5.4, -17.1, 6.6, -18.1, 5.7, -19, 4.4, -17.9, 2.7, -19.2, 3.1, -20.6, 1.9, -20.9, 1.5, -19.4, -0.8, -19.5,
  -1, -20.9, -2.4, -20.6, -2.2, -19.1, -4.1, -18, -5, -19, -5.9, -18.2, -5, -17.1, -5.9, -15.2, -9.1, -16.1, -8.9, -11.1,
  -6, -10.9, -6, -6.5,
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [{ ring, height: 43, baseY: 0 }];
}
