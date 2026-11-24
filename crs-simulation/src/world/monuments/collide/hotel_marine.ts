/* Obstacles de l'hôtel de la Marine (place de la Concorde, côté est de la rue Royale).
 * Le rez-de-chaussée de la façade est une galerie à arcades : on y marche, sous la loggia. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, overhead, planOf, rectOf, solid, solidsMinus } from '../x-palais-plan';

/** Emprise de référence (repère canonique : murs alignés, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  -44.3, -32.6, -44.7, 7.8, -45.2, 7.8, -45.3, 8.4, -47.1, 8.4, -47, 31.1, -45.2, 31, -45.2, 31.7, -41.9, 31.7, -41.9, 32.6, -27.5, 32.6, -27.6, 31.6, -24.2, 31.6, -24.3, 31.1, 0.2, 31, 24.3, 31, 24.3, 31.6, 27.5, 31.5, 27.6, 32.5, 41.9, 32.5, 41.9, 31.5, 45.2, 31.5, 45.2, 31, 47, 31, 47.1, 16.6, 45.2, 16.6, 45.2, 16.1, 44.5, 16.1, 44.5, -12.9, 44.8, -13, 44.3, -31.4, 14.7, -31.4, 14.6, -23.5, -0.3, -23.5, -0.2, -32.3,
];
/** Cours intérieures. */
export const COURS: readonly number[][] = [
  // cour x[-32.3,9.8] z[-9.9,11.6] (bât. h=26.1)
  [9.7, -9.9, 9.8, 11.5, -32.3, 11.6, -32.2, -9.8],
  // cour x[19.3,34.9] z[-10.0,11.4] (bât. h=26.1)
  [34.8, 11.3, 19.3, 11.4, 19.3, -9.9, 34.9, -10],
  // cour x[-36.3,-14.7] z[-26.3,-19.1] (bât. h=26.1)
  [-16.3, -19.2, -18.7, -19.3, -18.8, -20.9, -20.9, -21, -20.9, -19.2, -30.2, -19.1, -30.2, -20.7, -36.3, -20.9, -36.3, -26.2, -14.9, -26.3, -14.7, -21, -16.3, -20.9],
];
/** Façade sur la place : extrémités, nu du soubassement central, mur des pavillons, profondeur de la galerie. */
export const FACADE = { x0: -45.2, x1: 45.2, z: 31.0, pavZ: 31.55, pavW: 20.9, loggia: 3.6, baseDepth: 0.9, top: 19.6 } as const;

/** Emprise du corps de bâtiment : l'emprise réelle, creusée de la galerie centrale et du socle des avant-corps. */
export function bodyRing(ring: ArrayLike<number>): number[] {
  const F = FACADE, xa = F.x0 + F.pavW, xb = F.x1 - F.pavW;
  const voids = [rectOf(xa, F.z - F.loggia, xb, F.z + 6)];
  for (const s of [-1, 1]) { const xp = s < 0 ? F.x0 + F.pavW / 2 : F.x1 - F.pavW / 2; voids.push(rectOf(xp - 7.25, F.pavZ, xp + 7.25, F.pavZ + 6)); }
  const pieces = solidsMinus(ring, voids, 20);
  let best = pieces[0] ?? Array.from(ring), area = 0;
  for (const p of pieces) { let a = 0; for (let i = 0, j = (p.length >> 1) - 1; i < p.length >> 1; j = i++) a += p[2 * j] * p[2 * i + 1] - p[2 * i] * p[2 * j + 1]; if (Math.abs(a) > area) { area = Math.abs(a); best = p; } }
  return best;
}

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const F = FACADE, xa = F.x0 + F.pavW, xb = F.x1 - F.pavW, L = xb - xa;
  const out: MonumentCollider[] = [solid(bodyRing(p.ring), 22)];
  // socles des avant-corps des pavillons
  for (const s of [-1, 1]) { const xp = s < 0 ? F.x0 + F.pavW / 2 : F.x1 - F.pavW / 2; out.push(solid(rectOf(xp - 7.2, F.pavZ - 0.2, xp + 7.2, F.pavZ + 1.0), 22)); }
  // douze piles de la galerie, puis la loggia au-dessus (on passe dessous)
  const pitch = L / 11;
  for (let i = 0; i <= 11; i++) {
    const w = i === 0 || i === 11 ? pitch * 0.2 : pitch * 0.4;
    const x = i === 0 ? xa + w / 2 : i === 11 ? xb - w / 2 : xa + i * pitch;
    out.push(solid(orect(x, F.z - F.baseDepth / 2, w, F.baseDepth), 7.4));
  }
  out.push(overhead(rectOf(xa, F.z - F.loggia - 0.2, xb, F.z), 3.7, 22));
  return collidersToLocal(p, out);
}
