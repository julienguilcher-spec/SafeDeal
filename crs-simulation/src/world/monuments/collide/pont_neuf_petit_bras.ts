/* Obstacles du Pont Neuf (petit bras) : les deux parapets de pierre. Le tablier reste libre de l'île à la rive gauche. */
import type { MonumentCollider, MonumentSite } from '../types';
import { PONT_NEUF_PETIT_BRAS, bridgeFrame, parapetColliders } from '../x-ponts-plan';

export function colliders(site: MonumentSite): MonumentCollider[] {
  const f = bridgeFrame(site, PONT_NEUF_PETIT_BRAS);
  return parapetColliders(f, f.s0 - 2, f.s1 + 2, 1.05, 0.45);
}
