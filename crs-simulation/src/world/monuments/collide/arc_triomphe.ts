/* Obstacles de l'Arc de triomphe : quatre piles pleines (avec les piédestaux des groupes sculptés), la dalle
 * de la tombe du Soldat inconnu, et la masse des voûtes au-dessus des passages (on passe dessous). */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';

const W = 44.82, D = 22.21, H = 49.54, BIG_W = 14.62, SMALL_W = 8.44;
/** Naissance de la petite voûte : 18,68 m sous clef − rayon 4,22 m. */
const VAULT_BASE = 18.68 - SMALL_W / 2;

export function colliders(_site: MonumentSite): MonumentCollider[] {
  const out: MonumentCollider[] = [];
  const pierW = (W - BIG_W) / 2, pierD = (D - SMALL_W) / 2;
  const px = BIG_W / 2 + pierW / 2, pz = SMALL_W / 2 + pierD / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push({ ring: rectRing(sx * px, sz * pz, pierW, pierD), height: VAULT_BASE, baseY: 0 });
      // piédestal du groupe sculpté, en saillie de 2,3 m sur la grande face
      out.push({ ring: rectRing(sx * px, sz * (D / 2 + 1.15), 8.6, 2.3), height: 17.4, baseY: 0 });
    }
  }
  // tombe du Soldat inconnu, sous la grande arche
  out.push({ ring: rectRing(0, 2.2, 2.6, 6.0), height: 0.5, baseY: 0 });
  // voûtes et attique : toute l'emprise, au-dessus des passages
  out.push({ ring: rectRing(0, 0, W, D), height: H - VAULT_BASE, baseY: VAULT_BASE });
  return out;
}
