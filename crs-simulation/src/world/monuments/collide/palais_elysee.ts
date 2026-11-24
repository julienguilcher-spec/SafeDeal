/* Obstacles du palais de l'Élysée : site sensible, entièrement clos. L'hôtel et ses ailes sont pleins (le portail de
 * la rue du Faubourg-Saint-Honoré est fermé par sa grille), et le jardin est ceint de murs jusqu'à la grille du Coq. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, passageWindow, planOf, solid, type Passage } from '../x-palais-plan';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  18.7, 51.5, 19.6, 52.3, 19.4, 53.8, 53.6, 60.2, 55.9, 58.2, 50.6, -17.8, 46.4, -17.8, 45.8, -26.4, 45.3, -26.5, 44.2, -59.1, 43.1, -60.2, 23.8, -59.5, 22.2, -57.7, 23.5, -25.4, 19.6, -25.3, 19.5, -26.1, 4.2, -25.5, 4.2, -26.2, -5.1, -25.7, -5.1, -25.1, -20.1, -24.3, -19.5, -8.2, -44.5, -7.2, -45, -17.3, -44.4, -18.2, -45.1, -25.7, -50.1, -25.4, -50.2, -26.1, -51.1, -26.1, -51.1, -25.3, -55.9, -25.1, -55.5, -16.7, -53.8, -16.7, -53.2, 0, -54.7, 0, -54.2, 8.6, -49.4, 8.4, -47.9, 41, -14, 47.4, -13.6, 46.1, -12.5, 45.7,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-15.8,19.7] z[-7.0,43.8] (bât. h=14.3)
  [-15.8, -5.4, 17.5, -7, 19.7, 34.6, 16.8, 34.7, 16, 39.4, 12, 42.7, -4.2, 43.8, -6.7, 43.2, -9.5, 41.1, -11, 38.6, -11.2, 35.8, -14.2, 35.9],
  // cour x[27.2,43.8] z[12.6,45.0] (bât. h=14.3)
  [27.2, 13.2, 42.5, 12.6, 43.8, 44.3, 28.7, 45],
  // cour x[-40.1,-23.3] z[8.4,36.6] (bât. h=14.3)
  [-40.1, 9, -24.6, 8.4, -23.3, 36, -38.7, 36.6],
  // cour x[29.9,37.5] z[-8.6,3.3] (bât. h=14.3)
  [30.6, 3.3, 29.9, -8.3, 37, -8.6, 37.5, 3],
];
export const H_MUR = 10.6, H_FAITE = 15;
/** Portail d'honneur, rue du Faubourg-Saint-Honoré (fermé par une grille). */
export const PORTAIL: Passage = { x: 3.26, z: 45.38, width: 9.4, length: 7, rot: -0.187, height: 9.4, arches: 1, archWidth: 4.2, archHeight: 7 };
/** Clôture du jardin (du pavillon ouest à la grille du Coq, avenue Gabriel, puis retour à l'aile est). */
export const CLOTURE_OUEST: readonly number[] = [-55.9, -25.4, -65.1, -199.7, -47.1, -202.2, -25.8, -223.1, -11.3, -224.4];
export const CLOTURE_EST: readonly number[] = [-3.3, -223.2, 3.5, -222.2, 11.7, -219.6, 22.2, -211.7, 26, -203.6, 37.4, -197.1, 49.5, -29.4, 50.4, -18];
/** Grille du Coq : centre et orientation (elle regarde l'avenue Gabriel, vers −z). */
export const GRILLE_COQ = { x: -7.3, z: -223.8, rot: Math.PI - 0.15, width: 8 } as const;

function wallColliders(path: readonly number[], h: number, out: MonumentCollider[]): void {
  for (let i = 0; i + 3 < path.length; i += 2) {
    const ax = path[i], az = path[i + 1], bx = path[i + 2], bz = path[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) continue;
    out.push(solid(orect((ax + bx) / 2, (az + bz) / 2, len + 0.3, 0.7, Math.atan2(-(bz - az), bx - ax)), h));
  }
}

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const out: MonumentCollider[] = [solid(p.ring, H_FAITE), solid(passageWindow(PORTAIL, 0.4), 11)];
  wallColliders(CLOTURE_OUEST, 3.2, out);
  wallColliders(CLOTURE_EST, 3.2, out);
  out.push(solid(orect(GRILLE_COQ.x, GRILLE_COQ.z, GRILLE_COQ.width + 2.4, 1.0, GRILLE_COQ.rot), 6));
  return collidersToLocal(p, out);
}
