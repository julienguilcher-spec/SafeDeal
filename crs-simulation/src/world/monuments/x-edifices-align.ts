/* Lot « édifices » — recalage d'un modèle sur l'emprise réelle. DONNÉES PURES (aucun import de Three.js ni du kit :
 * ce fichier est aussi chargé par collide/*.ts, donc par la simulation sous Node).
 *
 * Chaque monument du lot est DESSINÉ dans le repère de son emprise de référence (collide/<clé>.ts : EMPRISE, relevée
 * dans landmarks.json). Si la carte est régénérée avec un autre point d'ancrage ou un autre cap pour le même contour
 * (c'est arrivé à l'Opéra Bastille pendant la réalisation du lot : cap passé de 196,4° à 220°), le modèle doit
 * suivre : on cherche la pose rigide (rotation + translation) qui amène l'emprise de dessin sur l'emprise du site,
 * sommet pour sommet (meilleur décalage cyclique, dans les deux sens de parcours). */

/** Pose rigide du plan : (x, z) ↦ (tx + x·c − z·s, tz + x·s + z·c). */
export interface Align { c: number; s: number; tx: number; tz: number }

export const ALIGN_ID: Align = { c: 1, s: 0, tx: 0, tz: 0 };

/**
 * Meilleure pose rigide amenant l'anneau `design` sur l'anneau `site` (mêmes sommets, ordre de départ et sens de
 * parcours indifférents). Rend null si les anneaux n'ont pas le même nombre de sommets ou si l'écart quadratique
 * moyen après recalage dépasse `maxRms` mètres (ce n'est pas le même contour).
 */
export function alignRigid(design: ArrayLike<number>, site: ArrayLike<number>, maxRms = 1.2): Align | null {
  const n = design.length >> 1;
  if (n < 3 || site.length !== design.length) return null;
  let cpx = 0, cpz = 0, cqx = 0, cqz = 0;
  for (let i = 0; i < n; i++) { cpx += design[2 * i]; cpz += design[2 * i + 1]; cqx += site[2 * i]; cqz += site[2 * i + 1]; }
  cpx /= n; cpz /= n; cqx /= n; cqz /= n;
  let A = 0, B = 0;
  for (let i = 0; i < n; i++) {
    A += (design[2 * i] - cpx) ** 2 + (design[2 * i + 1] - cpz) ** 2;
    B += (site[2 * i] - cqx) ** 2 + (site[2 * i + 1] - cqz) ** 2;
  }
  let best = -Infinity, bc = 1, bs = 0;
  const score = (dir: number, k: number): void => {
    let S = 0, C = 0;
    for (let i = 0; i < n; i++) {
      const j = (((dir > 0 ? i + k : k - i) % n) + n) % n;
      const px = design[2 * i] - cpx, pz = design[2 * i + 1] - cpz, qx = site[2 * j] - cqx, qz = site[2 * j + 1] - cqz;
      C += px * qx + pz * qz; S += px * qz - pz * qx;
    }
    const h = Math.hypot(S, C);
    if (h > best) { best = h; bc = h > 0 ? C / h : 1; bs = h > 0 ? S / h : 0; }
  };
  score(1, 0);
  const rmsOf = (): number => Math.sqrt(Math.max(0, (A + B - 2 * best) / n));
  if (rmsOf() > 0.3) for (const dir of [1, -1]) for (let k = 0; k < n; k++) score(dir, k);
  if (rmsOf() > maxRms) return null;
  return { c: bc, s: bs, tx: cqx - (cpx * bc - cpz * bs), tz: cqz - (cpx * bs + cpz * bc) };
}

/** Pose du dessin sur le site : identité si le site n'a pas d'emprise ou si elle ne correspond pas au dessin. */
export function alignOf(site: ArrayLike<number>, design: ArrayLike<number>): Align {
  if (site.length < 6) return ALIGN_ID;
  return alignRigid(design, site) ?? ALIGN_ID;
}

/** Applique une pose à un anneau [x0, z0, …] (le sens de parcours est conservé). */
export function applyAlign(ring: ArrayLike<number>, a: Align): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) out.push(a.tx + ring[i] * a.c - ring[i + 1] * a.s, a.tz + ring[i] * a.s + ring[i + 1] * a.c);
  return out;
}
