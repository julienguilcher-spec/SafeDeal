/* Obstacles de l'Opéra Garnier : toute l'emprise bâtie est pleine ; s'y ajoute le perron de la façade sud.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW, rectRing } from '../shape2d';
import { alignOf, applyAlign } from '../x-edifices-align';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -50.51, maxX: 50.46, minZ: -74.38, maxZ: 74.37 } as const;

export const EMPRISE: readonly number[] = [
  28.4, 64.7, 33.8, 65, 33.8, 19.9, 36.8, 19.8, 37, 21.5, 39.1, 21.3, 39.2, 20.6, 43.3, 20.7, 43.5, 21.7, 46.3, 21.6,
  46.1, 18.4, 44.1, 18, 44.1, 14.3, 45, 14.2, 45, 13.8, 46.1, 13.3, 45.7, 12, 47.9, 9.8, 49.1, 10.5, 50.5, 7.5,
  49.1, 7.1, 49.1, 3.7, 50.4, 3.4, 49.7, 1.6, 49, 0.7, 48, 1.2, 45.5, -0.9, 45.8, -2.3, 44.1, -3, 44, -6.8,
  45.9, -7.5, 45.8, -10.3, 44, -10.4, 43.8, -9.6, 39.5, -9.5, 39.2, -10.3, 37, -10.3, 37.1, -8.7, 33.7, -8.6, 34, -55,
  28.1, -55, 28.2, -56.4, 27.6, -56.5, 27.8, -63.5, 20.9, -74.1, 9.3, -74.4, 9.7, -64.8, -9.2, -64.7, -9.3, -73.4, -8.8, -73.4,
  -8.9, -74.3, -20.1, -74.3, -27.4, -63.3, -27.2, -56.5, -27.8, -56.6, -27.8, -55.3, -33.7, -55.3, -33.3, -8.7, -37.3, -8.7, -37.1, -10.1,
  -38.4, -10, -38.5, -10.5, -44.7, -10.3, -44.7, -9.9, -46, -9.9, -46, -7.3, -45.2, -7.3, -45, -1.8, -46.1, -1.7, -48.4, 0.1,
  -49.8, 2.1, -50.5, 5.1, -50.3, 7.3, -49.2, 10.1, -47.1, 12.7, -45.1, 13.1, -45, 18.5, -46, 18.6, -46, 21.3, -44.7, 21.2,
  -44.6, 21.8, -38.5, 21.8, -38.4, 21.2, -36.9, 21.3, -36.9, 19.8, -33.3, 19.8, -33.3, 65.1, -28.5, 64.9, -28.5, 72.6, -27.7, 73.2,
  -27.7, 74.4, -24.3, 74.2, -24.4, 73.7, -20.3, 73.5, -20.1, 74.2, -17.3, 74.2, -16.3, 72.1, -12.3, 72, -12, 72.9, -9.8, 72.8,
  -9.4, 72.1, -5.3, 72.1, -5.2, 72.8, -2.5, 72.9, -2.2, 72.1, 1.8, 72.1, 2.1, 72.8, 4.7, 72.7, 5, 72.1, 8.9, 72,
  9.1, 72.8, 11.9, 72.8, 12.4, 72.1, 16.4, 72.1, 16.6, 72.9, 17.5, 73.4, 17.4, 74.3, 20.5, 74.2, 20.4, 73.5, 24.2, 73.6,
  24.4, 74.3, 27.8, 74.2, 27.7, 73.3, 28.1, 73.2, 28.4, 72.6,
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  // les obstacles décrits dans le repère de dessin sont recalés sur l'emprise du site
  const pose = alignOf(site.footprint, EMPRISE);
  const fit = (r: number[]): number[] => applyAlign(r, pose);
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [
    { ring, height: 32, baseY: 0 },
    // perron de la façade principale (dix marches)
    { ring: fit(rectRing(0, 74.4, 52, 2.6)), height: 1.6, baseY: 0 },
  ];
}
