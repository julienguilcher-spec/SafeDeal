/* Obstacles du Monument à la République : l'emmarchement circulaire et le socle du lion, à l'avant. */
import type { MonumentCollider, MonumentSite } from '../types';
import { ngonRing, rectRing } from '../shape2d';

export function colliders(_site: MonumentSite): MonumentCollider[] {
  return [
    { ring: ngonRing(0, 0, 6.6, 20), height: 25, baseY: 0 },
    { ring: rectRing(0, 7.8, 3.0, 5.6), height: 4.2, baseY: 0 },
  ];
}
