/* Obstacles de la préfecture de police (caserne de la Cité) : le bâtiment autour de sa cour ; on entre dans la cour
 * par le porche de la rue de la Cité (véhicules de police). */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, passageColliders, passageWindow, planOf, rectOf, solid, solidsMinus, type Passage } from '../x-palais-plan';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  -51.4, -47.2, -50.9, -47.2, -47.7, -11, -45.6, -11.1, -45, -5.6, -46.3, -5.5, -45.8, 3.6, -45.2, 5.9, -43.9, 5.8, -43.1, 11.2, -45.4, 11.5, -44.5, 22.6, -44, 22.6, -41.1, 57.4, -26.5, 57.7, -26.4, 57.4, 41.5, 59.3, 41.5, 58.7, 51.9, 59, 52.7, 29.8, 46.5, 29.5, 46.2, 40.1, 48.6, 39.8, 48.3, 48.7, 41.7, 48.6, 44, -55, 30.5, -55.6, 30.5, -55.2, -16.1, -57.3, -51.6, -59.3, -52.7, -58.4,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-33.4,25.7] z[-39.9,40.1] (bât. h=26.9)
  [25.7, -37.4, 23.9, 40.1, -25.7, 39.1, -28.2, 9.7, -30.6, 10, -31.2, 4.6, -28.1, 4.4, -29.2, -7.1, -32.3, -6.9, -32.8, -12.3, -30.5, -12.5, -33.4, -39.9],
];
export const H_MUR = 20.8, H_FAITE = 26.9;
/** Cour centrale (au nu des façades). */
export const COUR = { x0: -33.4, z0: -39.9, x1: 25.7, z1: 40.1 } as const;
/** Porche d'entrée des véhicules, aile ouest (traversée selon x). */
export const PORCHE: Passage = { x: -39.6, z: 0.4, width: 9, length: 13.4, rot: Math.PI / 2, height: 7.6, arches: 1, archWidth: 4.8, archHeight: 5.8 };

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const voids = [rectOf(COUR.x0 + 0.5, COUR.z0 + 0.5, COUR.x1 - 0.5, COUR.z1 - 0.5), passageWindow(PORCHE, 0.6)];
  const out: MonumentCollider[] = solidsMinus(p.ring, voids, 4).map((r) => solid(r, H_FAITE));
  for (const c of passageColliders(PORCHE, H_MUR, 0.6)) out.push(c);
  return collidersToLocal(p, out);
}
