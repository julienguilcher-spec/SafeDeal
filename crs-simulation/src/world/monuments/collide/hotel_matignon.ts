/* Obstacles de l'hôtel de Matignon (57 rue de Varenne) : site sensible, clos. Portail fermé, hôtel plein. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, passageWindow, planOf, solid, type Passage } from '../x-palais-plan';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  30, 37.3, 30.7, -27.3, 24.7, -27, 24.6, -22.7, 16.9, -22.3, 16.5, -36.7, 8.8, -36.5, 8.9, -35.7, 1.1, -35.5, -1, -37.3, -5.7, -36.9, -8, -35, -15.4, -34.8, -15.6, -35.6, -23.1, -35.5, -22.8, -24.7, -30.7, -24.3, -26.8, 27.3, -17.6, 28.8, -16.6, 27.3, -14.7, 26.4, -13.3, 26.3, -13.2, 27, -12.3, 27.1, -12.4, 26.3, -12, 27, -11.1, 27, -11.2, 26.2, -7.7, 26.2, -7.7, 26.9, -6.8, 26.9, -6.8, 26.1, -6.5, 26.9, -5.5, 26.9, -5.6, 26.1, -3.8, 26.3, -2.4, 26.8, -0.9, 29, -1, 31.6,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-24.5,3.7] z[-17.5,25.7] (bât. h=20.1)
  [-22.5, -16.7, -15.3, -16.9, -13.2, -15.3, -8.6, -15.4, -6.8, -17.2, 0.4, -17.5, 0.4, -13.5, 2.9, -13.5, 3.7, 15.6, 1.8, 15.6, 0.9, 20.1, -1.3, 22.7, -3.8, 24.2, -7.7, 24.9, -7.7, 25.7, -13.7, 25, -19.3, 22, -21.2, 16.2, -23.4, 16.4, -24.5, -12.8, -22.4, -12.7],
  // cour x[4.1,24.4] z[2.8,18.9] (bât. h=20.1)
  [7.7, 3.3, 24.4, 2.8, 24.2, 18.4, 4.4, 18.9, 4.1, 6.8, 7.7, 5.7],
  // cour x[11.4,18.6] z[-13.8,-3.9] (bât. h=20.1)
  [11.5, -10.9, 11.4, -13.8, 16.7, -13.8, 18.6, -11.9, 18.6, -4, 13.9, -3.9, 13.6, -11],
];
export const H_MUR = 11.4, H_FAITE = 15;
/** Portail de la rue de Varenne, au fond de son hémicycle (fermé). */
export const PORTAIL: Passage = { x: -9.3, z: 25.85, width: 7.4, length: 3, rot: -0.03, height: 8.6, arches: 1, archWidth: 3.6, archHeight: 6.2 };

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  return collidersToLocal(p, [solid(p.ring, H_FAITE), solid(passageWindow(PORTAIL, 0.4), 10)]);
}
