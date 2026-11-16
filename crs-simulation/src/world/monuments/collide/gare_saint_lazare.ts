/* Obstacles de la gare Saint-Lazare : le bâtiment des voyageurs et la halle des voies, pleins. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, planOf, solid } from '../x-palais-plan';
import { transformRing } from '../shape2d';

/** Emprise de référence (repère du monument ; la façade, côté +z, est de biais de 8° environ). */
export const EMPRISE: readonly number[] = [
  -112.4, -65.4, -118.9, -63.6, -118.8, -62.3, -119.3, -62.3, -120.6, -63.6, -122.4, -63.5, -123.7, -62.3, -122.2, 94.4, -109.8, 96.2, -109.5, 94.7, -74.5, 99.8, -74.6, 101.2, -62.1, 103, -61.7, 100.4, -55.7, 101.3, -53.6, 101.8, -54.1, 105.3, 20.8, 115.7, 21.3, 112.2, 23.5, 112.4, 29.4, 113.2, 29.1, 115.6, 41.4, 117.3, 41.6, 116.2, 76.9, 121.1, 76.8, 122.1, 88.5, 124.1, 123.7, 28.2, 109.5, 22.7, 110, 21.4, 104.8, 19.3, 87.5, -53.3, 107.9, -73.5, 57.2, -124.1, 48.8, -119.9,
];
/** Hauteur des murs du bâtiment des voyageurs, de la halle, du faîte des verrières. */
export const H_FACADE = 21, H_HALLE = 12, H_VERRIERE = 19.5;
/**
 * Façade sur la rue Saint-Lazare (cours du Havre et de Rome) : repère posé au milieu de la façade, +z vers la rue.
 * `depth` : profondeur du bâtiment des voyageurs.
 */
export const FACADE = { ox: -16.85, oz: 109.25, rot: -0.14, half: 106.4, depth: 24 } as const;

/** Point du repère de la façade → repère du monument. */
export function fromFacade(x: number, z: number): [number, number] {
  const p = transformRing([x, z], FACADE.ox, FACADE.oz, FACADE.rot);
  return [p[0], p[1]];
}
/** Bande du bâtiment des voyageurs (rectangle orienté, dans le repère du monument). */
export function facadeStrip(): number[] {
  const c = fromFacade(0, -FACADE.depth / 2 + 2);
  return orect(c[0], c[1], FACADE.half * 2 + 6, FACADE.depth + 4, FACADE.rot);
}

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  return collidersToLocal(p, [solid(p.ring, 26)]);
}
