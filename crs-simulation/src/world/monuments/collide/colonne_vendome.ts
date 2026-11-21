/* Obstacles de la colonne Vendôme : la grille carrée et le piédestal. */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';

export function colliders(_site: MonumentSite): MonumentCollider[] {
  return [
    { ring: rectRing(0, 0, 10.4, 10.4), height: 1.5, baseY: 0 },
    { ring: rectRing(0, 0, 7.6, 7.6), height: 44.3, baseY: 0 },
  ];
}
