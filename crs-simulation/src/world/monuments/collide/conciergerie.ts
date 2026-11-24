/* Obstacles de la Conciergerie (quai de l'Horloge) : le corps de bâtiment et ses quatre tours. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, planOf, solid } from '../x-palais-plan';
import { ngonRing } from '../shape2d';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  -63.3, -29, -63.3, -5.9, -61.2, -5.8, -60.9, -5, -61.3, 24, -51.8, 24.1, -51.7, 22.1, -6.9, 23.8, -6.7, 25.5, -6, 26.8, -4.1, 28.1, -2.5, 28.5, 0, 27.7, 1.3, 26.5, 2, 25, 1.9, 22.6, 6.8, 22.8, 6.5, 24.5, 6.8, 26.7, 8.6, 28.7, 11.4, 29.3, 13.7, 28.4, 15.2, 26, 45.9, 24.6, 48.6, 26.1, 49.7, 26.1, 52.7, 24.5, 54, 22.7, 63.3, 21.7, 63.2, -29.3,
];
export const H_MUR = 18, H_FAITE = 26;
/** Tours rondes du quai, d'est en ouest : César, d'Argent (jumelles), Bonbec. Centre, rayon, hauteur du fût, du toit. */
export const TOURS: readonly { x: number; z: number; r: number; h: number; roofH: number }[] = [
  { x: -4.1, z: 23.9, r: 5.5, h: 23, roofH: 9.5 },
  { x: 10.8, z: 24.2, r: 5.5, h: 23, roofH: 9.5 },
  { x: 49.1, z: 19.7, r: 6.1, h: 19.5, roofH: 9 },
];
/** Tour de l'Horloge, carrée, à l'angle du boulevard du Palais (côté −x). */
export const HORLOGE = { x: -57.3, z: 18.7, w: 11.6, d: 11.4, h: 37, top: 47 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const out: MonumentCollider[] = [solid(p.ring, H_FAITE)];
  for (const t of TOURS) out.push(solid(ngonRing(t.x, t.z, t.r + 0.3, 12), t.h + t.roofH));
  out.push(solid(orect(HORLOGE.x, HORLOGE.z, HORLOGE.w, HORLOGE.d), HORLOGE.top));
  return collidersToLocal(p, out);
}
