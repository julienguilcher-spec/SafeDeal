/* Obstacles de l'hôtel de Crillon et de la façade de Gabriel qui le prolonge jusqu'à la rue Royale. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, planOf, rectOf, solid } from '../x-palais-plan';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  -16.4, 29.2, -16.6, 43.7, -11.5, 44.3, -11.5, 45.3, 2.8, 45.4, 2.8, 44.4, 6, 44.5, 6.1, 43.9, 15.6, 44.1, 15.7, 6.1, 16.2, 6.1, 16.6, -45.4, -14.9, -44.7, -13.4, 15.7, -13.8, 15.7, -14.1, 28.8, -14.5, 28.8, -14.6, 29.3,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-2.2,9.8] z[-40.1,-18.5] (bât. h=26.6)
  [9.1, -18.9, -1.7, -18.5, -2, -26.6, -0.4, -26.6, -0.4, -27.5, -0.6, -34.8, -2.2, -34.9, -2.2, -39.6, 2.2, -39.8, 2.5, -38.7, 5.5, -38.9, 5.9, -40, 9.7, -40.1, 9.8, -38.1, 8.8, -37.8, 8.4, -21.3, 9.2, -20.9],
  // cour x[-0.7,8.9] z[-1.2,14.7] (bât. h=26.6)
  [8.9, 14.7, -0.7, 14.5, -0.4, -1.2, 8.9, -1.1],
  // cour x[10.2,13.9] z[-12.5,-9.0] (bât. h=26.6)
  [13.9, -12.5, 13.8, -10.2, 12.9, -9.2, 10.3, -9, 10.2, -12.3],
];
/**
 * Façade jumelle de celle de l'hôtel de la Marine : elle court sur 94 m, de la rue Boissy-d'Anglas à la rue Royale.
 * L'hôtel de Crillon n'en occupe que le pavillon ouest et les premières travées ; le reste est plaqué devant les
 * immeubles voisins (hôtels des n° 4 à 8). z : nu du soubassement plaqué ; pavZ : mur des pavillons.
 */
export const FACADE = { x0: -16.6, x1: 77.2, wallZ: 44.1, z: 45.4, pavZ: 45.4, pavW: 20.9, baseDepth: 1.3, top: 19.6 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const F = FACADE;
  const out: MonumentCollider[] = [solid(p.ring, 23)];
  // placage de la colonnade devant les immeubles voisins, et socles des deux avant-corps
  out.push(solid(rectOf(F.x0 + 0.5, F.wallZ - 0.4, F.x1, F.z), 21));
  for (const s of [-1, 1]) { const xp = s < 0 ? F.x0 + F.pavW / 2 : F.x1 - F.pavW / 2; out.push(solid(rectOf(xp - 7.2, F.pavZ - 0.2, xp + 7.2, F.pavZ + 1.05), 22)); }
  return collidersToLocal(p, out);
}
