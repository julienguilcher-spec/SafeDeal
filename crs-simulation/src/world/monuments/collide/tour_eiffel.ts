/* Obstacles de la Tour Eiffel : les quatre piliers (soubassements de 25 m et grilles), et au-dessus des têtes
 * les plateformes et le fût. On circule librement entre les piliers et sous les arcs (74 m de passage). */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';

const OUT0 = 62.45, IN0 = 37.12;

export function colliders(_site: MonumentSite): MonumentCollider[] {
  const out: MonumentCollider[] = [];
  const side = OUT0 - IN0 + 1.2, mid = (OUT0 + IN0) / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ ring: rectRing(sx * mid, sz * mid, side, side), height: 50, baseY: 0 });
  // premier étage (poutres de ceinture dès 50 m), deuxième étage, fût supérieur
  out.push({ ring: rectRing(0, 0, 70.7, 70.7), height: 12.3, baseY: 50 });
  out.push({ ring: rectRing(0, 0, 41, 41), height: 11, baseY: 110.5 });
  out.push({ ring: rectRing(0, 0, 27, 27), height: 208.5, baseY: 121.5 });
  return out;
}
