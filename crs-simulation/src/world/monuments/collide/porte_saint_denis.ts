/* Obstacles de la porte Saint-Denis : les deux piles (chacune percée d'une porte piétonne) ; on passe sous la grande
 * arche de 8 m et par les deux petites portes. Les voûtes et l'attique sont au-dessus des têtes. */
import type { MonumentCollider, MonumentSite } from '../types';
import { rectRing } from '../shape2d';

/** Cotes réelles (Blondel, 1672) : 24,65 m de haut, 25 m de large, 5 m d'épaisseur ; arche de 8 m sur 15,35 m sous clef. */
export const PSD = { W: 25, H: 24.65, D: 5, archW: 8, archH: 15.35, doorX: 8.6, doorW: 1.7, doorH: 3.6, entabY: 18.4, entabTop: 21.2 } as const;

export function colliders(_site: MonumentSite): MonumentCollider[] {
  const out: MonumentCollider[] = [];
  const d = PSD.D + 0.6;
  for (const s of [-1, 1]) {
    const x0 = PSD.archW / 2, x1 = PSD.doorX - PSD.doorW / 2, x2 = PSD.doorX + PSD.doorW / 2, x3 = PSD.W / 2;
    out.push({ ring: rectRing(s * (x0 + x1) / 2, 0, x1 - x0, d), height: PSD.H, baseY: 0 });
    out.push({ ring: rectRing(s * (x2 + x3) / 2, 0, x3 - x2, d), height: PSD.H, baseY: 0 });
    // linteau de la petite porte : naissance de son cintre
    out.push({ ring: rectRing(s * PSD.doorX, 0, PSD.doorW, d), height: PSD.H - (PSD.doorH - PSD.doorW / 2), baseY: PSD.doorH - PSD.doorW / 2 });
  }
  // grande voûte et attique : au-dessus de la naissance de l'arc
  const spring = PSD.archH - PSD.archW / 2;
  out.push({ ring: rectRing(0, 0, PSD.archW, d), height: PSD.H - spring, baseY: spring });
  return out;
}
