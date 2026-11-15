/* Obstacles de la colonne de Juillet : la grille circulaire et le soubassement. */
import type { MonumentCollider, MonumentSite } from '../types';
import { ngonRing } from '../shape2d';

export function colliders(_site: MonumentSite): MonumentCollider[] {
  return [
    { ring: ngonRing(0, 0, 8.5, 20), height: 1.6, baseY: 0 },
    { ring: ngonRing(0, 0, 6.8, 16), height: 50.5, baseY: 0 },
  ];
}
