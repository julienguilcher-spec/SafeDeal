/* Obstacles du Petit Palais : l'emprise bâtie est pleine (le jardin intérieur n'est pas accessible depuis la rue) ;
 * s'y ajoute le grand escalier du porche.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW, rectRing } from '../shape2d';
import { alignOf, applyAlign } from '../x-edifices-align';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -65.2, maxX: 65.18, minZ: -44.8, maxZ: 44.84 } as const;

export const EMPRISE: readonly number[] = [
  65.2, 28.6, 64.7, 25.3, 63.3, 21.4, 62, 19.3, 61.9, 17.5, 60.1, 17.4, 39.6, -33.6, 40.4, -36.3, 40.1, -39.4, 39.2, -41.3,
  37.4, -43.3, 34.5, -44.6, 32.1, -44.8, 29.2, -43.9, 26.9, -42, 5.3, -41.8, 4.8, -42.1, 4.8, -43, 1.7, -42.9, -6.4, -42.8,
  -6.4, -42, -7.1, -41.8, -28.4, -41.5, -31.2, -43.8, -34.8, -44.7, -37.8, -44, -40.4, -41.9, -41.7, -39.7, -42.2, -36.8, -40.9, -32.8,
  -60.4, 18.5, -62.2, 18.6, -62.3, 20.3, -64.7, 25.7, -65.2, 29.7, -64.8, 33.1, -63.4, 37, -62.1, 39.1, -62, 41, -60.2, 41,
  -60.3, 41.8, -49.3, 41.7, -49.3, 40.8, -47.6, 40.8, -47.5, 38.9, -11.9, 38.7, -10.2, 40, -11, 40, -11, 43.5, -10.2, 43.5,
  -10.2, 44.8, -5.7, 44.8, -5.7, 43.3, -4.9, 43.2, -4.8, 42, -4.1, 41.2, -2.9, 41.1, 0.1, 42, 5, 41.2, 5.7, 42,
  5.7, 44.6, 10.3, 44.5, 10.3, 43.4, 11.1, 43.3, 11.1, 39.7, 10.2, 39.8, 11.9, 38.4, 47.5, 38.1, 47.6, 40, 49.4, 39.9,
  49.5, 40.7, 60.3, 40.7, 60.3, 39.8, 62.1, 39.8, 62.2, 38, 65, 32.2,
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  // les obstacles décrits dans le repère de dessin sont recalés sur l'emprise du site
  const pose = alignOf(site.footprint, EMPRISE);
  const fit = (r: number[]): number[] => applyAlign(r, pose);
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [
    { ring, height: 16, baseY: 0 },
    // grand escalier du porche d'entrée
    { ring: fit(rectRing(0, 48.4, 20, 7.4)), height: 4.5, baseY: 0 },
  ];
}
