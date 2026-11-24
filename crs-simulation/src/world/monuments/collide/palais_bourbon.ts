/* Obstacles du palais Bourbon (Assemblée nationale) : site sensible, clos. Le palais est plein, emmarchement de la
 * colonnade compris (il est fermé par des grilles), ainsi que les piédestaux des quatre statues du parvis. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, planOf, solid } from '../x-palais-plan';
import { transformRing } from '../shape2d';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  27.7, 72.3, 30, 59.5, 56.4, 57.1, 54.9, 38.3, 48.3, 39, 48.2, 37.6, 38.7, 38.5, 38.7, 37.2, 31.1, 38, 31.4, 39.3, 22.3, 40.1, 22.5, 41.7, 18.8, 42.1, 19.8, 50.5, 14.5, 51, 12.3, 26.9, 13.5, 26.1, 12.6, 15.3, 11.3, 14.8, 9.6, 2.2, 11.5, -1.1, 36.5, -2.9, 36.4, -3.2, 50.9, -4.6, 51.5, 1.2, 65.2, 0, 65.2, -0.8, 66.2, -0.9, 66.6, -2.6, 67.7, -4.1, 69.3, -5.1, 70.7, -5.2, 70.3, -9.6, 57.4, -8.4, 56.6, -21.1, 69.3, -22.2, 66, -62.3, 53.8, -61.3, 52.3, -78.6, 64.4, -79.7, 63.2, -92.6, -15.2, -82.1, -15.3, -81.7, -15.9, -81.7, -15.6, -79, -16.2, -78.9, -16.2, -78.3, -24.1, -77.4, -24.5, -79, -26, -78.8, -26.1, -77.1, -29.5, -76.7, -29.8, -78.4, -31.2, -78.3, -31.3, -76.7, -39.4, -75.8, -39.9, -76.2, -40.3, -78.3, -40.7, -78.6, -52.6, -77, -53.9, -65.2, -70.7, 48.6, -69.8, 50.5, -68.5, 51.3, -67.1, 51.6, -60.4, 51, -59.5, 53.1, -57.5, 54.7, -55.3, 55.2, -52.5, 54.4, -52.8, 55.6, -55.6, 56, -56.6, 61.4, -49.2, 63, -49.4, 63.9, -46.1, 64.7, -46.6, 67, -40.1, 68.4, -39.6, 66.3, -36.4, 66.8, -40.4, 84.1, 0.8, 92.6, 4.2, 76.9, 3.8, 76.8, 5.7, 67.4,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-52.6,9.4] z[-71.4,23.6] (bât. h=11.7)
  [2.5, -51.7, 1.5, -51.4, 2.6, -44.3, 1.8, -44.2, 3.6, -32.6, 4.6, -32.6, 5.6, -25.4, 6.6, -25.4, 9.4, -8.5, -5.9, -7.3, -4.6, 5.9, -3.1, 5.7, -1.7, 20.8, -12, 21.5, -12.3, 16.8, -24.5, 17.9, -24.1, 22.8, -34.6, 23.6, -35.9, 8.6, -34.3, 8.6, -35.7, -4.4, -48.2, -3.4, -48.1, -1.7, -50.7, -1.3, -51.3, -19.8, -50.3, -19.8, -50.5, -27.2, -49.4, -27.4, -49.9, -39.2, -50.9, -39.2, -51, -46.8, -52.1, -46.7, -52.6, -64.5, -39.5, -65.5, -38.7, -68.8, -30.4, -69.8, -30.3, -68.4, -29, -68.5, -29.1, -69.9, -24.6, -70.4, -24.4, -68.9, -23.3, -69.1, -23.3, -70.5, -15.3, -71.4, -13.9, -67.8, -0.2, -69],
  // cour x[9.4,43.0] z[-76.6,-56.3] (bât. h=11.7)
  [43, -59.2, 11.1, -56.3, 9.4, -73.6, 41.3, -76.6],
  // cour x[19.6,39.3] z[-43.1,-16.4] (bât. h=11.7)
  [39.3, -18.1, 21.7, -16.4, 19.6, -41.5, 37.2, -43.1],
];
export const H_MUR = 11.7;
/**
 * Colonnade (façade nord, vers la Seine) : volontairement désaxée par rapport au palais pour répondre à la
 * Madeleine. Repère du portique : origine au milieu du pied de l'emmarchement, +z vers le quai.
 */
export const COLONNADE = { ox: -19.8, oz: 88.35, rot: -0.2034, width: 42.1, depth: 17.6, stepsRun: 9.2, baseY: 4.5, colH: 14, colD: 1.45, entabH: 3, pediment: 6.2 } as const;
/** Bâtiment de l'hémicycle, derrière la colonnade : centre, largeur, profondeur, rotation. */
export const HEMICYCLE = { x: -11.3, z: 53.9, w: 76.9, d: 43.9, rot: 0.096 } as const;
/** Statues assises du parvis (repère du portique) : Sully, L'Hospital, d'Aguesseau, Colbert. */
export const STATUES: readonly [number, number][] = [[-32, 9], [-20.8, 9], [20, 9], [29.4, 9]];

/** Point du repère du portique → repère du monument. */
export function fromPortico(x: number, z: number): [number, number] {
  const p = transformRing([x, z], COLONNADE.ox, COLONNADE.oz, COLONNADE.rot);
  return [p[0], p[1]];
}

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const out: MonumentCollider[] = [solid(p.ring, 28)];
  for (const [x, z] of STATUES) { const c = fromPortico(x, z); out.push(solid(orect(c[0], c[1], 3, 3, COLONNADE.rot), 6)); }
  return collidersToLocal(p, out);
}
