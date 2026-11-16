/* Obstacles de l'hôtel des Invalides : l'hôtel sur son emprise (on entre dans la cour d'honneur par le portail nord),
 * l'église Saint-Louis et l'église du Dôme, qui occupent l'échancrure sud de l'emprise. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, passageColliders, passageWindow, planOf, rectOf, solid, solidsMinus, type Passage } from '../x-palais-plan';
import { ngonRing } from '../shape2d';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  98.5, -2.4, 124.5, -2.3, 136.5, -7, 136.3, -58.9, 136.8, -58.8, 136.8, -70.2, 136.3, -70.3, 136.2, -115.9, 136.8, -116, 136.9, -127.6, 38.6, -127.5, 38.2, -61.6, 30.3, -61.8, 30.3, -14.7, 19.9, -14.8, 19.9, -6.9, 14.2, -6.9, 14.2, -8.2, 12.6, -8.2, 12.5, -6.9, 10.6, -6.8, 10.5, -1.4, -1.9, -1.3, -14.4, -1.4, -14.5, -6.7, -23.9, -7, -24, -14.9, -33.9, -15.1, -33.8, -62.3, -41.9, -62.4, -42, -118.4, -41.6, -118.4, -41.6, -127.7, -136.4, -128, -136.9, -2.2, -102.5, -2.5, -102.6, 6.3, -98.6, 6.3, -98.7, 50.4, -99.5, 50.4, -99.6, 51.2, -99.6, 64.4, -98.7, 64.4, -98.8, 108.2, -102.9, 108.2, -103, 126.4, -85.8, 126.6, -85.8, 121.8, -19.4, 122, -17.7, 122.3, -15.4, 123.4, -13.6, 125.8, -12.7, 125.8, -12.2, 127.9, 6.7, 128, 7.2, 126, 8.3, 126, 10.3, 123.5, 11.8, 122.7, 13.9, 122.3, 80.9, 122.7, 81.1, 127.1, 98.2, 127.2, 98.4, 109.3, 94.4, 109.2, 94.6, 65.1, 95.4, 65.1, 95.4, 64, 95.3, 51, 94.4, 51.1, 94.5, 6.7, 98.5, 6.8,
];
/** Cours intérieures (relevé de la carte, simplifié à 0,6 m). */
export const COURS: readonly number[][] = [
  // cour x[-35.0,30.2] z[5.9,109.4] (bât. h=22.4)
  [-33.5, 50.2, -34.7, 50.1, -34.4, 10.9, -29.4, 10.8, -29.3, 5.9, -9.8, 6.1, -9.7, 6.8, 25.2, 6.3, 25.4, 11.1, 30.2, 10.9, 28.8, 65.2, 29.7, 65.2, 29.6, 104.5, 24.8, 104.4, 24.5, 109.4, -9.4, 108.2, -10.5, 109.2, -30.2, 108.9, -30.2, 104.1, -35, 104.1, -34.7, 65, -33.6, 65],
  // cour x[42.9,81.5] z[6.3,51.5] (bât. h=22.4)
  [42.9, 51.4, 43.2, 6.3, 81.5, 6.4, 81.5, 51.5],
  // cour x[-85.9,-47.8] z[6.0,51.0] (bât. h=22.4)
  [-85.7, 6, -47.8, 6.2, -47.9, 51, -85.9, 50.9],
  // cour x[-85.9,-47.9] z[63.9,108.9] (bât. h=22.4)
  [-85.7, 63.9, -47.9, 64, -48.3, 108.9, -85.9, 108.6],
  // cour x[42.1,77.3] z[65.2,109.4] (bât. h=22.4)
  [77.3, 65.3, 77.2, 109.4, 42.4, 109.3, 42.1, 65.2],
  // cour x[43.3,85.8] z[-61.3,-6.7] (bât. h=10.9)
  [85.8, -11.3, 81.7, -11.3, 81.6, -6.7, 43.3, -6.9, 43.4, -45, 47.8, -45, 48, -61.3, 85.6, -61.1],
  // cour x[48.2,85.9] z[-116.4,-73.0] (bât. h=10.9)
  [85.6, -73, 48.2, -73.1, 48.6, -116.4, 85.9, -116.3],
  // cour x[96.6,125.4] z[-61.2,-10.8] (bât. h=10.9)
  [125.4, -10.8, 96.8, -11.3, 96.6, -61.2, 125.3, -61.2],
  // cour x[96.7,125.2] z[-116.4,-73.1] (bât. h=10.9)
  [125.1, -73.1, 96.7, -73.1, 96.9, -116.4, 125.2, -116],
  // cour x[-85.4,-47.2] z[-45.4,-7.0] (bât. h=14.9)
  [-47.5, -7, -85.4, -7.1, -85.4, -11.2, -84.4, -11.2, -84.3, -45.4, -47.2, -45.3],
  // cour x[-127.8,-93.8] z[-45.6,-11.6] (bât. h=14.9)
  [-93.8, -11.7, -127.8, -11.6, -127.8, -45.6, -116, -45.6, -115.9, -37.8, -104, -37.9, -104.1, -45.6, -93.9, -45.5],
  // cour x[-86.9,-54.7] z[-118.5,-91.4] (bât. h=14.9)
  [-54.8, -91.4, -85.5, -91.6, -86.9, -92.8, -86.6, -118.5, -54.7, -118.4],
  // cour x[-127.6,-96.2] z[-82.4,-54.6] (bât. h=14.9)
  [-96.2, -80.4, -96.5, -54.6, -127.5, -54.6, -127.5, -66.2, -124.5, -66.2, -124.6, -71.2, -127.6, -71.2, -127.6, -82.4, -97.9, -82.2],
  // cour x[-127.8,-100.5] z[-118.7,-92.5] (bât. h=14.9)
  [-100.5, -92.6, -127.4, -92.5, -127.8, -118.7, -100.7, -118.7],
  // cour x[-87.3,-54.9] z[-82.4,-57.7] (bât. h=14.9)
  [-55, -74.9, -63.2, -74.9, -63.3, -69.1, -54.9, -69.1, -55.1, -57.9, -73.9, -57.8, -74, -65.3, -80, -65.3, -80, -57.7, -87.3, -57.7, -87.1, -80.6, -85.5, -82.4, -54.9, -82.3],
];
/** Hauteur des murs à la corniche et du faîte des combles. */
export const H_MUR = 17.2, H_FAITE = 23;
/** Portail nord : passage voûté de l'esplanade à la cour d'honneur. */
export const PORTAIL: Passage = { x: -2.4, z: 118.7, width: 9, length: 18.8, rot: 0, height: 9.2, arches: 1, archWidth: 4.8, archHeight: 7.4 };
/** Cour d'honneur (au nu des galeries). */
export const COUR_HONNEUR = { x0: -35, z0: 5.9, x1: 30.2, z1: 109.4 } as const;
/** Église Saint-Louis (nef) et église du Dôme (plan carré, tambour, dôme) : relevé des bâtiments de la carte. */
export const NEF = { x0: -18.6, x1: 14.8, z0: -70, z1: -2.4, wallH: 19, ridge: 25 } as const;
export const DOME = { x: -1.3, z: -105.4, side: 54, baseH: 28, drumR: 12.6, drumY: 30, colH: 12.5, atticTop: 55, domeR: 13, domeH: 26, top: 107 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const C = COUR_HONNEUR, D = DOME;
  const voids = [rectOf(C.x0 + 0.3, C.z0 + 0.3, C.x1 - 0.3, C.z1 - 0.3), passageWindow(PORTAIL, 0.45)];
  const out: MonumentCollider[] = solidsMinus(p.ring, voids, 4).map((r) => solid(r, H_FAITE));
  for (const c of passageColliders(PORTAIL, H_MUR, 0.45)) out.push(c);
  out.push(solid(rectOf(NEF.x0, NEF.z0, NEF.x1, NEF.z1), NEF.ridge));
  out.push(solid(orect(D.x, D.z, D.side, D.side), D.baseH));
  out.push(solid(rectOf(D.x - 12, D.z - D.side / 2 - 5.5, D.x + 12, D.z - D.side / 2 + 1), 3));
  out.push({ ring: ngonRing(D.x, D.z, D.drumR + 2, 16), height: D.top - D.baseH, baseY: D.baseH });
  return collidersToLocal(p, out);
}
