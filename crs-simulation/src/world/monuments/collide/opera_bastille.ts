/* Obstacles de l'Opéra Bastille : toute l'emprise bâtie est pleine ; le grand escalier et son portique carré, vers
 * la place, font partie de l'emprise.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW } from '../shape2d';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -57.03, maxX: 56.97, minZ: -150.86, maxZ: 150.93 } as const;

export const EMPRISE: readonly number[] = [
  -18, 104.8, -20.5, 105.9, -18.6, 109.9, -14, 116, -11.8, 118.2, -2.2, 125.1, 3.2, 127.3, 8.2, 128.6, 13.6, 129.3, 19.8, 129.2,
  20.3, 133.9, 19.2, 134, 19.7, 142.7, 21.1, 141.4, 22.3, 150.9, 29.1, 144.3, 36.3, 139.2, 33.5, 132, 35.5, 130.8, 35.1, 130,
  33.1, 130.8, 31.4, 126.2, 36.6, 123.7, 40.9, 120.8, 47.2, 114.8, 50.4, 110.2, 53, 105.5, 55.3, 99.3, 56.3, 95, 56.8, 89.3,
  56.7, 87.4, 56.1, 87.4, 55.1, 79, 56.4, 78.7, 56.4, 72.6, 55.3, 72.8, 55.3, 70.3, 55.8, 70.3, 55.9, 5.2, 56.4, 5.2,
  56.5, 1.4, 56, 1.5, 56.2, -9.4, 53.3, -9.4, 53.2, 3, 48.8, 4.1, 43.5, 3.4, 39.2, 4.2, 38.2, -0.2, 45.3, -1.8,
  43.8, -8.5, 46.5, -9.7, 49.8, -12.3, 53.9, -18.6, 56.5, -26.6, 57, -29.9, 56.7, -36.5, 55.2, -36.2, 54.2, -41, 55.5, -41.4,
  53.1, -47.3, 51.4, -50.1, 47.5, -54.6, 44.2, -57.1, 39, -60, 34.9, -61, 31.4, -60.8, 29.9, -67.4, 22.9, -65.8, 22.3, -68.4,
  36.4, -72, 36.4, -72.5, 35.7, -72.5, 35.7, -73.8, 36.4, -73.7, 36.4, -74.2, 44.7, -74.3, 44.6, -73.8, 48.4, -74.7, 48.3, -75.3,
  47.2, -75.3, 47.3, -77.3, 56.7, -77.2, 56.7, -77.9, 53.6, -77.8, 54.3, -150.8, 31.8, -150.9, 31, -107.4, 28.5, -107.4, 24.6, -103.3,
  24.1, -103.6, 8.3, -85.9, 8.1, -68.1, -51.4, -4.8, -50.6, -0.7, -53.7, 2.3, -55.9, 5.8, -57, 10.3, -56.8, 13.9, -55.3, 13.7,
  -55.1, 14.7, -56.6, 15.1, -56.1, 16.3, -52.4, 21.5, -48.2, 24.1, -44.8, 24.8, -43, 32.9, -48.5, 34.2, -48.2, 34.9, -45.3, 34.3,
  -44.5, 38.2, -45.7, 38.5, -30.9, 76.5, -29.9, 76.4, -28.7, 81.6, -25.3, 91.5, -26.1, 91.8, -23.8, 97.9, -20.9, 97.1,
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [{ ring, height: 30, baseY: 0 }];
}
