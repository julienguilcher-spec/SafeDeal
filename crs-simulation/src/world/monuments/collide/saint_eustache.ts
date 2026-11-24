/* Obstacles de l'église Saint-Eustache : toute l'emprise bâtie est pleine.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW } from '../shape2d';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -24.39, maxX: 24.53, minZ: -54.35, maxZ: 54.35 } as const;

export const EMPRISE: readonly number[] = [
  15.1, -52.6, 11.6, -54.4, 1.1, -48.4, -1.2, -47.6, -3.2, -46, -18, -36.9, -20, -34.9, -24.2, -32.8, -20.6, -25.6, -18, -26.7,
  -19.1, -23.4, -19.4, -19.9, -19.8, -19.9, -20.3, -6.2, -20.8, -5.2, -23.6, -2.6, -24.1, -0.5, -20.9, 2.9, -21.1, 6.5, -24.1, 9.2,
  -24, 10.6, -24.4, 10.7, -23.1, 12.3, -21.2, 11.9, -22.6, 40.3, -18.3, 40.4, -18.2, 46.7, -18.8, 46.6, -18.8, 47.4, -19.4, 47.3,
  -19.6, 49.4, -17.5, 49.5, -17.6, 51.5, -11.1, 52, -11.3, 53.3, -7.2, 53.5, 7.8, 54.4, 7.8, 53.1, 15.7, 53.6, 15.9, 51.5,
  17.9, 51.5, 19.5, 41.9, 18.5, 40.7, 24.1, 14.1, 24.5, 1.5, 23.4, -0.6, 23.2, -23.6, 22.8, -25.9, 20.2, -31.9,
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [{ ring, height: 43, baseY: 0 }];
}
