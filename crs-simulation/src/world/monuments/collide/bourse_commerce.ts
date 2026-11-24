/* Obstacles de la Bourse de commerce : la rotonde (emprise réelle) et la colonne Médicis adossée au sud-est.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW, ngonRing } from '../shape2d';
import { alignOf, applyAlign } from '../x-edifices-align';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -33.37, maxX: 33.37, minZ: -33.48, maxZ: 33.54 } as const;

export const EMPRISE: readonly number[] = [
  -28.8, 17, -28.1, 18, -28.9, 18.9, -27.2, 20.4, -28.7, 22.1, -18.5, 31, -16.9, 29.3, -15.3, 30.8, -14.6, 30.1, -13.5, 30.6,
  -13.2, 30.1, -9.1, 31.7, -9.2, 32.2, -5.8, 32.9, -5.5, 32.5, -0.9, 33, -0.8, 33.5, 0.3, 33.5, 2.6, 33.5, 2.7, 32.9,
  7.3, 32.3, 7.5, 32.8, 10.9, 31.8, 10.8, 31.3, 15.1, 29.6, 15.4, 30, 18.3, 28.3, 18.2, 27.7, 21.9, 24.9, 22.4, 25.3,
  24.9, 22.9, 24.6, 22.4, 27.4, 18.7, 28, 18.9, 29.8, 16.1, 29.3, 15.6, 31.4, 11.2, 31.9, 11.3, 32.8, 8, 32.3, 7.6,
  33.4, 2.8, 33.4, -3.4, 32.3, -7.8, 32.8, -8.1, 31.9, -11.4, 31.3, -11.3, 29.6, -15.1, 30.8, -15.8, 29, -18.9, 28.6, -18.6,
  25.7, -22.4, 26.1, -22.8, 23.7, -25.2, 22.6, -24.3, 19.4, -27, 19.6, -27.6, 16.6, -29.4, 16.3, -29, 12.4, -30.7, 12.5, -31.3,
  9.2, -32.4, 9, -32, 3, -33.5, -3.1, -33, -3.3, -33.4, -6.7, -32.9, -6.7, -32.4, -11, -31.1, -11.3, -31.6, -14.4, -30.3,
  -14.4, -29.7, -18.4, -27.5, -18.8, -27.7, -21.5, -25.6, -21.2, -25.1, -24.5, -21.9, -25.1, -22.1, -27.2, -19.4, -26.8, -19, -30.5, -13.6,
  -32, -7.3, -32.6, -7.3, -33.2, -3.9, -32.6, -3.7, -32.8, 0.9, -33.4, 1.1, -33, 4.5, -32.4, 4.6, -31.5, 9.1, -32, 9.4,
  -30.9, 12.7, -30.2, 12.6, -28.4, 16.6,
];

/** Colonne Médicis : position (repère de dessin) et rayon du fût à la base. */
export const MEDICIS = { x: 33.2, z: -10.1, r: 1.6 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  // les obstacles décrits dans le repère de dessin sont recalés sur l'emprise du site
  const pose = alignOf(site.footprint, EMPRISE);
  const fit = (r: number[]): number[] => applyAlign(r, pose);
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [
    { ring, height: 24, baseY: 0 },
    { ring: fit(ngonRing(MEDICIS.x, MEDICIS.z, MEDICIS.r + 0.5, 10)), height: 31, baseY: 0 },
  ];
}
