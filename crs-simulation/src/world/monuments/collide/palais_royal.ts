/* Obstacles du Palais-Royal : le palais et la Comédie-Française ; la cour d'honneur (colonnes rayées) et la cour de
 * la galerie d'Orléans sont ouvertes — on y entre du jardin, par les colonnades, ou par les passages des ailes. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, passageColliders, passageWindow, planOf, rectOf, solid, solidsMinus, type Passage } from '../x-palais-plan';
import { ngonRing, signedArea } from '../shape2d';

/** Emprise de référence (repère du monument : murs alignés sur les axes, façade vers +z, origine au centre). */
export const EMPRISE: readonly number[] = [
  71.5, 11.5, 71.4, 5.7, 71, 4.9, 69.4, 4.2, 69.4, 3.8, 69.7, -6.3, 71.2, -6.8, 71.5, -7.6, 71.9, -68.4, 58.8, -68.3, 58.9, -62.3, -32, -61.8, -32.1, -67.6, -45.4, -67.9, -44.9, -5.3, -71.8, -5.1, -71.9, 36.7, -65, 36.4, -65.2, 44.4, -28.5, 44.3, -28.6, 35.3, -10.8, 35.1, -10.6, 61.8, -9.6, 61.8, -9.3, 64.6, -6.7, 65.8, -1.5, 66.2, -1.6, 66.7, -0.6, 66.7, -0.3, 65.4, 9.7, 65.6, 10, 67, 10.9, 67, 10.9, 66.5, 12.4, 66.5, 12.4, 65.7, 11.3, 65.2, 11.4, 62.2, 11.8, 62, 11.6, 36.9, 12.1, 36.3, 20.8, 36.3, 21.1, 37, 23, 36.9, 23.1, 36.4, 38.6, 36.4, 38.6, 37, 40.2, 37, 40.3, 36.2, 49.7, 36.4, 50, 63.2, 50.4, 66.4, 49.3, 67.4, 51.3, 67.4, 51.2, 68, 52.1, 68, 52.4, 66.7, 62.5, 66.9, 62.8, 68.2, 63.7, 68.4, 63.7, 67.8, 64.9, 67.6, 69.1, 67.7, 70.5, 67.1, 71.4, 63.9,
];
export const H_MUR = 16, H_FAITE = 21;
/** Les deux cours ouvertes (cour d'honneur au sud, cour de la galerie d'Orléans au nord) : un seul vide, ouvert sur le jardin. */
export const COURS_OUVERTES = { x0: -19.6, x1: 46.7, z0: -64, z1: 17.7 } as const;
/** Colonnades de la galerie d'Orléans : plans des deux doubles rangées (z), entraxe des colonnes. */
export const COLONNADES = { z: [-34.7, -60.3], gap: 2.3, pitch: 3.3, colH: 5.6 } as const;
/** Passages des ailes : péristyle de Chartres et passage de Montpensier (ouest), passage de la cour des Fontaines (est). */
export const PASSAGES: readonly Passage[] = [
  { x: -32.2, z: -10.7, width: 8, length: 25.6, rot: Math.PI / 2, height: 7, arches: 1, archWidth: 4.4, archHeight: 5.6 },
  { x: -32.4, z: -47.5, width: 8, length: 26, rot: Math.PI / 2, height: 7, arches: 1, archWidth: 4.4, archHeight: 5.6 },
  { x: 58.2, z: -1.6, width: 8, length: 23.4, rot: Math.PI / 2, height: 7, arches: 1, archWidth: 4.4, archHeight: 5.6 },
];
/** Colonnes de la cour d'honneur : trame de 3,19 m, 20 × 13 fûts rayés de hauteurs variées. */
export const COLONNES = { x0: -17, z0: -29.6, pitch: 3.19, nx: 20, nz: 13, d: 0.61 } as const;
/** Hauteur d'une colonne de la trame (m) : vagues diagonales, de la simple base au fût de 3 m. */
export function hauteurColonne(i: number, j: number): number {
  const steps = [0.32, 0.62, 0.93, 1.55, 2.2, 3.1];
  return steps[(i * 2 + j * 5 + ((i * j) % 3)) % steps.length];
}
/** Portique à arcades fermant la cour de l'Horloge sur la place du Palais-Royal. */
export const ECRAN = { x0: 11.7, x1: 49.9, z: 65.6, depth: 2.2, height: 6.4, count: 7 } as const;

/** Emprise bâtie : l'emprise de la carte, privée des deux cours ouvertes. */
export function bodyRing(ring: ArrayLike<number>): number[] {
  const C = COURS_OUVERTES;
  const pieces = solidsMinus(ring, [rectOf(C.x0, C.z0, C.x1, C.z1)], 50);
  let best = pieces[0] ?? Array.from(ring);
  for (const q of pieces) if (signedArea(q) > signedArea(best)) best = q;
  return best;
}

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const K = COLONNES, E = ECRAN, L = COLONNADES, C = COURS_OUVERTES;
  const out: MonumentCollider[] = solidsMinus(bodyRing(p.ring), PASSAGES.map((g) => passageWindow(g, 0.45)), 4).map((r) => solid(r, H_FAITE));
  for (const g of PASSAGES) for (const c of passageColliders(g, H_MUR, 0.45)) out.push(c);
  // colonnes rayées : seules celles qui dépassent le genou font obstacle
  for (let i = 0; i < K.nx; i++) for (let j = 0; j < K.nz; j++) {
    const h = hauteurColonne(i, j);
    if (h >= 0.9) out.push(solid(ngonRing(K.x0 + i * K.pitch, K.z0 + j * K.pitch, K.d / 2 + 0.05, 6), h));
  }
  // colonnades : une paire de colonnes par travée
  for (const z of L.z) for (let x = C.x0 + 1.2; x < C.x1 - 0.5; x += L.pitch) out.push(solid(orect(x, z, 0.8, L.gap + 0.8), L.colH + 1));
  // piles du portique de la cour de l'Horloge
  const pitch = (E.x1 - E.x0) / E.count;
  for (let i = 0; i <= E.count; i++) out.push(solid(orect(E.x0 + i * pitch, E.z, pitch * 0.36, E.depth), E.height));
  return collidersToLocal(p, out);
}
