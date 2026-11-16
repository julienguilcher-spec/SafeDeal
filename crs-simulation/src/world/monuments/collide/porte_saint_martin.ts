/* Obstacles de la porte Saint-Martin : quatre piles à bossages ; on passe sous l'arche centrale et sous les deux
 * arches latérales. Les voûtes et l'attique sont au-dessus des têtes. */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';

/** Cotes réelles (Bullet, 1674) : 18 m de haut et de large ; arche centrale plus haute que les deux latérales. */
export const PSM = { W: 18, H: 18, D: 4.5, midW: 5.6, midH: 10.2, sideX: 5.75, sideW: 2.9, sideH: 5.6, entabY: 12.4, entabTop: 14.3 } as const;

export function colliders(_site: MonumentSite): MonumentCollider[] {
  const out: MonumentCollider[] = [];
  const d = PSM.D + 0.5;
  for (const s of [-1, 1]) {
    const x0 = PSM.midW / 2, x1 = PSM.sideX - PSM.sideW / 2, x2 = PSM.sideX + PSM.sideW / 2, x3 = PSM.W / 2;
    out.push({ ring: rectRing(s * (x0 + x1) / 2, 0, x1 - x0, d), height: PSM.H, baseY: 0 });
    out.push({ ring: rectRing(s * (x2 + x3) / 2, 0, x3 - x2, d), height: PSM.H, baseY: 0 });
    const spring = PSM.sideH - PSM.sideW / 2;
    out.push({ ring: rectRing(s * PSM.sideX, 0, PSM.sideW, d), height: PSM.H - spring, baseY: spring });
  }
  const spring = PSM.midH - PSM.midW / 2;
  out.push({ ring: rectRing(0, 0, PSM.midW, d), height: PSM.H - spring, baseY: spring });
  return out;
}
