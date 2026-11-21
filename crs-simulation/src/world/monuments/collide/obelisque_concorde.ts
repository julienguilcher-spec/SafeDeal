/* Obstacles de l'obélisque de la Concorde : la grille carrée qui l'entoure (on ne s'approche pas du piédestal). */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';

export function colliders(_site: MonumentSite): MonumentCollider[] {
  return [
    { ring: rectRing(0, 0, 9.6, 9.6), height: 1.3, baseY: 0 },
    { ring: rectRing(0, 0, 4.7, 4.7), height: 33.4, baseY: 0 },
  ];
}
