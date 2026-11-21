/* Obstacles d'une fontaine de la Concorde : la margelle circulaire du bassin (on ne traverse pas l'eau) et le massif central. */
import type { MonumentCollider, MonumentSite } from '../types';
import { ngonRing } from '../shape2d';

export function colliders(_site: MonumentSite): MonumentCollider[] {
  return [
    { ring: ngonRing(0, 0, 8.75, 20), height: 0.8, baseY: 0 },
    { ring: ngonRing(0, 0, 3.6, 12), height: 9.2, baseY: 0 },
  ];
}
