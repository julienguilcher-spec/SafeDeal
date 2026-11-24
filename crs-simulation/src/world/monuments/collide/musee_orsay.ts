/* Obstacles du musée d'Orsay (ancienne gare d'Orsay) : le bâtiment plein et la marquise de l'entrée, à l'ouest. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, planOf, solid } from '../x-palais-plan';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  49.9, 38.5, 49.9, 37, 79.1, 37.2, 78.9, 9.5, 93.9, 9.6, 94.1, -26.8, 79.4, -26.9, 79.4, -38.8, -93.7, -37.6, -94.1, 36.3, -92.3, 36.5, -92.3, 38, -90.2, 37.9, -90.2, 38.2, -86, 38.3, -85.9, 37.6, -84.8, 37.5, -84.9, 37.1, -79.4, 37.2, -79.5, 37.6, -78.4, 37.6, -78.4, 38.3, -72.1, 38, -72.1, 37.5, -70, 37.5, -70, 36.7, -59.6, 36.8, -59.6, 37.5, -55.5, 37.5, -55.4, 36.8, -45.1, 36.8, -45.1, 37.5, -40.9, 37.6, -40.9, 36.8, -30.6, 36.8, -30.6, 37.6, -29.4, 37.6, -29.4, 36.8, -16.1, 36.9, -16, 37.7, -11.8, 37.7, -11.8, 36.9, -1.5, 37, -1.5, 37.8, 2.7, 37.7, 2.7, 36.9, 13, 37, 13, 37.8, 17.3, 37.8, 17.3, 37, 27.5, 37.1, 27.5, 37.9, 29.7, 37.8, 29.7, 38.4, 31.8, 38.5, 31.8, 38.8, 36, 38.7, 35.9, 38, 37.1, 38, 37.7, 37.1, 41.8, 37.1, 42.4, 38, 43.5, 38, 43.6, 38.8, 47.9, 38.8, 47.8, 38.5,
];
/** Hauteur de la façade de pierre (corniche) et du sommet de la grande nef vitrée. */
export const H_MUR = 19, H_NEF = 32;
/** Corps principal (hors marquise) : bornes en x ; marquise d'entrée à l'extrémité ouest (+x). */
export const CORPS = { x0: -94.1, x1: 79.2, z0: -38.8, z1: 38.8 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  return collidersToLocal(p, [solid(p.ring, H_NEF)]);
}
