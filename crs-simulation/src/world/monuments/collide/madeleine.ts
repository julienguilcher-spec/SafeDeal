/* Obstacles de l'église de la Madeleine : le haut soubassement et ses deux emmarchements (toute l'emprise) forment
 * un obstacle plein — on ne monte pas sur le péristyle dans le monde plan du jeu.
 * EMPRISE : emprise réelle relevée dans public/data/paris/landmarks.json, dans le repère local du monument au moment
 * du relevé (mètres) — c'est le REPÈRE DE DESSIN du modèle. Elle sert de repli quand le site n'a pas d'emprise (banc
 * d'essai, tests) et de référence pour recaler modèle et obstacles sur l'emprise du site (x-edifices-align.ts).
 * Données pures : aucun import de Three.js ni du kit. */
import type { MonumentCollider, MonumentSite } from '../types';
import { cleanRing, ensureCCW } from '../shape2d';

/** Bornes de l'emprise de dessin. */
export const BOX = { minX: -21.66, maxX: 21.7, minZ: -64.19, maxZ: 64.27 } as const;

export const EMPRISE: readonly number[] = [
  21.7, -64.2, -21.6, -64.2, -21.7, 64.3, 21.6, 64.2,
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  const ring = cleanRing(ensureCCW(site.footprint.length >= 6 ? site.footprint : EMPRISE), 0.2);
  return [{ ring, height: 31.5, baseY: 0 }];
}
