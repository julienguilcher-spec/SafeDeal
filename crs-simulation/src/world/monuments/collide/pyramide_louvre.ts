/* Obstacles de la pyramide du Louvre : la grande pyramide, ses trois pyramidions et les sept bassins triangulaires. */
import type { MonumentCollider, MonumentSite } from '../types';
import { collidersToLocal, orect, planOf, solid } from '../x-palais-plan';
import { ensureCCW } from '../shape2d';

/** Emprise de référence : le carré de la carte (36,8 m ; la pyramide elle-même mesure 35,42 m de côté). */
export const EMPRISE: readonly number[] = [-18.4, -18.6, -18.4, 18.6, 18.4, 18.6, 18.4, -18.6];
/** Côté et hauteur de la grande pyramide ; côté et hauteur d'un pyramidion. */
export const PYRAMIDE = { side: 35.42, height: 21.64, smallSide: 8.1, smallHeight: 5.0 } as const;
/** Centres des trois pyramidions (au nord, au sud et à l'est de la grande ; ils sont tournés d'un huitième de tour). */
export const PYRAMIDIONS: readonly [number, number][] = [[-46.2, -0.2], [46.2, -0.2], [0.2, -46.2]];
/** Bassins triangulaires (l'entrée, côté +z, reste dégagée). */
export const BASSINS: readonly number[][] = [
  [-18.4, 18.4, -18.4, -18.4, -36, 0],
  [18.4, -18.4, 18.4, 18.4, 36, 0],
  [-17, -18.6, 17, -18.6, 0, -36],
  [-37.6, -37.6, -37.6, -2.6, -2.6, -37.6],
  [37.6, -37.6, 2.6, -37.6, 37.6, -2.6],
  [-37.8, 2.4, -37.8, 37.6, -20.2, 20],
  [37.8, 2.4, 20.2, 20, 37.8, 37.6],
].map((r) => ensureCCW(r));

export function colliders(site: MonumentSite): MonumentCollider[] {
  const p = planOf(site, EMPRISE);
  const out: MonumentCollider[] = [solid(orect(0, 0, PYRAMIDE.side, PYRAMIDE.side), PYRAMIDE.height)];
  for (const [x, z] of PYRAMIDIONS) out.push(solid(orect(x, z, PYRAMIDE.smallSide, PYRAMIDE.smallSide, Math.PI / 4), PYRAMIDE.smallHeight));
  for (const r of BASSINS) out.push(solid(r, 0.45));
  return collidersToLocal(p, out);
}
