/* Obstacles de l'arc de triomphe du Carrousel : quatre piles (avec les piédestaux des colonnes) ; on passe sous les
 * trois baies, d'une grande face à l'autre. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, overhead, planOf, rectOf, solid } from '../x-palais-plan';

/** Emprise de référence (relevé de la carte : mur de 18,4 × 7 m, piédestaux des huit colonnes en saillie). */
export const EMPRISE: readonly number[] = [
  9.1, 3.5, 8.8, -1.8, 9.2, -1.9, 9.2, -3.4, 8.6, -3.3, 8.6, -5, 7, -5, 7, -3.4, 4, -3.4, 4.1, -5.1, 2.3, -5.1, 2.3, -3.5, -2.4, -3.5, -2.4, -5.1, -4.1, -5.2, -4.1, -3.5, -7.1, -3.5, -7, -5, -8.7, -5, -8.6, -3.5, -9.2, -3.5, -9.2, 3.4, -8.8, 3.4, -8.8, 5.1, -7.1, 5.1, -7, 3.4, -4.2, 3.5, -4.2, 5.1, -2.6, 5.1, -2.6, 3.5, 2.3, 3.5, 2.3, 5.1, 3.9, 5.2, 4, 3.5, 6.8, 3.5, 6.9, 5.2, 8.5, 5.2, 8.5, 3.5,
];
/** Cotes : largeur, épaisseur, hauteur sans le quadrige ; baie centrale et baies latérales (largeur, hauteur sous clef). */
export const ARC = {
  W: 18.4, D: 7.0, H: 14.6,
  bigW: 4.45, bigH: 8.3, smallW: 2.7, smallH: 5.6, smallX: 5.55,
  /** Axes des colonnes (x) et de leur rangée (z). */
  colX: [3.25, 7.85], colZ: 4.3,
  entabY: 8.9, entabTop: 11.0,
} as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const A = ARC, zp = A.colZ + 0.85;
  const out: MonumentCollider[] = [];
  for (const s of [-1, 1]) {
    out.push(solid(rectOf(s * (A.bigW / 2 + 0.05), -zp, s * (A.smallX - A.smallW / 2 - 0.05), zp), A.H));
    out.push(solid(rectOf(s * (A.smallX + A.smallW / 2 + 0.05), -zp, s * (A.W / 2), zp), A.H));
  }
  out.push(overhead(rectOf(-A.W / 2, -A.D / 2, A.W / 2, A.D / 2), A.smallH - A.smallW / 2, A.H));
  return collidersToLocal(p, out);
}
