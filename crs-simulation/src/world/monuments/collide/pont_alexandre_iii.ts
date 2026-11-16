/* Obstacles du pont Alexandre III : les quatre pylônes d'angle (avec la statue assise à leur pied), les socles des
 * lions aux entrées et les deux balustrades. Le tablier reste libre d'une rive à l'autre ; l'arche et les culées sont
 * SOUS la chaussée et ne sont donc pas des obstacles (la simulation est plane : un obstacle bas barrerait le pont). */
import type { MonumentCollider, MonumentSite } from '../types';
import { PA3, PA3_PYLONS, bridgeFrame, designRect, parapetColliders } from '../x-ponts-plan';

/** Cotes partagées avec le modèle (defs/pont_alexandre_iii.ts). */
export const PA3_DIM = {
  /** Pylône : côté du socle, hauteur de pierre, hauteur avec le groupe doré. */
  base: 6.0, stoneH: 17, totalH: 21.8,
  /** Balustrades : de part et d'autre du milieu, entre les pylônes. */
  railFrom: -59.5, railTo: 60.5,
  /** Lions : avancée devant chaque pylône, côté des accès (m). */
  lionOut: 8.2,
} as const;

export function colliders(site: MonumentSite): MonumentCollider[] {
  const f = bridgeFrame(site, PA3);
  const out: MonumentCollider[] = [];
  const rot = Math.atan2(PA3.ux, PA3.uz);          // cap de l'axe dans le repère de référence
  for (const [x, z] of PA3_PYLONS) {
    const sz = Math.sign(z);
    // pylône et statue assise adossée à sa face tournée vers l'accès
    out.push({ ring: designRect(f, x, z, PA3_DIM.base, PA3_DIM.base, rot), height: PA3_DIM.totalH, baseY: 0 });
    out.push({ ring: designRect(f, x, z + sz * (PA3_DIM.base / 2 + 1.3), 3.2, 2.6, rot), height: 5.2, baseY: 0 });
    // lion conduit par un enfant, sur son socle
    out.push({ ring: designRect(f, x - Math.sign(x) * 1.2, z + sz * PA3_DIM.lionOut, 2.2, 4.4, rot), height: 4.4, baseY: 0 });
  }
  for (const c of parapetColliders(f, PA3_DIM.railFrom, PA3_DIM.railTo, 1.15, 0.5)) out.push(c);
  return out;
}
