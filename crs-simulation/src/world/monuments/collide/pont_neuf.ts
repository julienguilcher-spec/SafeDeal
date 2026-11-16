/* Obstacles du Pont Neuf (grand bras) : les deux parapets de pierre et le piédestal de la statue équestre d'Henri IV
 * sur le terre-plein. Le tablier reste libre d'une rive à l'autre ; arches et piles sont sous la chaussée. */
import type { MonumentCollider, MonumentSite } from '../types';
import { HENRI_IV, PONT_NEUF, bridgeFrame, designRect, parapetColliders } from '../x-ponts-plan';

/** Cotes partagées avec le modèle : piédestal (long × large × haut), emmarchement. */
export const HENRI_IV_DIM = { pedL: 4.6, pedW: 2.5, pedH: 4.5, stepL: 6.0, stepW: 3.9, stepH: 0.55, total: 9.6 } as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const f = bridgeFrame(site, PONT_NEUF);
  const out = parapetColliders(f, f.s0 - 2, f.s1 + 2, 1.05, 0.45);
  // le piédestal est allongé dans le sens du cheval : cap local 90° → sa longueur suit l'axe x du repère de référence
  out.push({ ring: designRect(f, HENRI_IV.x, HENRI_IV.z, HENRI_IV_DIM.stepL, HENRI_IV_DIM.stepW), height: HENRI_IV_DIM.total, baseY: 0 });
  return out;
}
