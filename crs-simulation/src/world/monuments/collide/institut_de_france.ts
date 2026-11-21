/* Obstacles de l'Institut de France (quai de Conti) : le palais plein. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, planOf, solid } from '../x-palais-plan';

/** Emprise de référence (repère du monument : la façade sur le quai regarde +z ; les ailes arrière, sur la rue Mazarine, sont de biais). */
export const EMPRISE: readonly number[] = [
  49.8, 66.8, 51.8, 71.7, 62.7, 72.5, 61.6, 88.7, 81.5, 90.1, 82.9, 68.9, 57.5, 67.2, 45.5, 31.8, 25.9, 30.6, 26, 29.3, 24.3, 29.2, 24.4, 28.6, 5.1, 27.5, -63.3, -90.1, -82.9, -78.5, -79.4, -72.7, -67.4, -79.9, -51.7, -52.9, -54.1, -51.6, -53.5, -50.7, -48.5, -42.2, -47.3, -42.9, -20.9, 2.3, -22.3, 3.1, -16.8, 12.2, -38.7, 24.9, -43.8, 15.7, -44.3, 15.9, -44.8, 15.5, -51.5, 3.8, -49.4, 2.6, -61.7, -18.4, -63.6, -17.2, -64, -17.6, -68.8, -25.6, -70.7, -29.3, -70.1, -29.5, -75.4, -38.7, -81.8, -34.9, -54.7, 13.3, -55.9, 14.9, -49.8, 32, -45.2, 29.4, -43.2, 33.1, -44.8, 33.1, -48.2, 81.4, -28, 82.8, -27.1, 66.5, -16.2, 67.3, -13.4, 62.5, -8.7, 57.6, -2.3, 53.9, 4.9, 52, 4.9, 53, 9.9, 53.4, 9.6, 58.4, 11.6, 58.6, 11.4, 60.5, 16.5, 60.8, 16.5, 59, 20.2, 59.3, 20.1, 61, 25, 61.3, 25.1, 59.4, 27.1, 59.5, 28.5, 55.6, 27.4, 54.4, 32.5, 54.8, 32.5, 53.7, 39.8, 56.6, 44.4, 60.1, 47.6, 63.6,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-34.9,5.9] z[20.8,61.5] (bât. h=18.6)
  [5.9, 39.7, 5.4, 46.9, 1.8, 49, 0, 45.9, -17.6, 56.4, -16, 59.4, -19.9, 61.5, -25.8, 58.4, -34.9, 43, -34.4, 35.2, -31.1, 33.3, -29.4, 36.1, -11.7, 25.8, -13.3, 23, -9.3, 20.8, -3.3, 23.9],
  // cour x[9.8,28.0] z[36.6,54.3] (bât. h=18.6)
  [28, 44.6, 26.8, 50.4, 22.6, 53.8, 20.1, 54.3, 13.7, 53, 10.5, 50.1, 9.8, 43.9, 11.5, 39.5, 19.8, 36.6, 24, 37.7, 25.7, 39.3],
  // cour x[33.1,42.4] z[37.7,49.0] (bât. h=18.6)
  [42.4, 45.8, 40.8, 49, 33.1, 48.4, 33.8, 37.7, 39.9, 38.2],
];
export const H_MUR = 16.6, H_FAITE = 21;
/** Coupole : centre du tambour, rayon ; axe de la façade (x), plan du portique de la chapelle (z). */
export const COUPOLE = { x: 18.8, z: 45.4, r: 8.7, drumTop: 30.5, top: 46 } as const;
export const PORTIQUE = { x: 18.4, z: 58.8, width: 17.6 } as const;
/** Pavillons d'extrémité des deux ailes en quart de cercle : centre, largeur, profondeur. */
export const PAVILLONS: readonly { x: number; z: number; w: number; d: number; rot: number }[] = [
  { x: -37.8, z: 74.6, w: 21, d: 16.6, rot: -0.07 }, { x: 72.2, z: 79.4, w: 21.6, d: 21.4, rot: -0.07 },
];

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  return collidersToLocal(p, [solid(p.ring, H_FAITE)]);
}
