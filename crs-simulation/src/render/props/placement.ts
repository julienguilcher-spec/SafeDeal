/* =====================================================================================
 * RENDU DU DÉCOR — pose des modèles : matrice d'un objet debout, renversé (couché selon sa boîte de
 * collision), porté par une personne ; composition d'une barricade à partir de ses éléments.
 * Logique pure (sans DOM ni Three.js).
 * ===================================================================================== */

import { FALL_NONE, FALL_X, FALL_Z, fallAxis, kindInfo } from './mapping';
import type { KindInfo } from './mapping';
import { hash01, matIdentity, matRotX, matRotY, matRotZ, matTranslate } from './meshbuf';
import type { Mat } from './meshbuf';

const HALF_PI = Math.PI / 2;

/**
 * Ajoute à `m` la transformation qui couche un modèle debout : `axis` FALL_Z (vers l'avant ou
 * l'arrière) ou FALL_X (sur le flanc) ; `positive` choisit le sens. L'objet couché reste centré sur
 * l'origine et repose sur le sol.
 */
export function layDown(m: Mat, info: KindInfo, axis: number, positive: boolean): Mat {
  if (axis === FALL_Z) {
    if (positive) matRotX(matTranslate(m, 0, info.hz, -info.h / 2), HALF_PI);
    else matRotX(matTranslate(m, 0, info.hz, info.h / 2), -HALF_PI);
  } else if (axis === FALL_X) {
    if (positive) matRotZ(matTranslate(m, -info.h / 2, info.hx, 0), -HALF_PI);
    else matRotZ(matTranslate(m, info.h / 2, info.hx, 0), HALF_PI);
  }
  return m;
}

/**
 * Matrice locale → monde d'un objet : position, cap, puis renversement déduit de la boîte de
 * collision, ou port par une personne (soulevé, ou basculé sur ses roues).
 */
export function propMatrix(
  m: Mat, kind: string, id: number, x: number, y: number, z: number, heading: number,
  halfX: number, halfZ: number, height: number, toppled: boolean, carried: boolean, melted: boolean,
): Mat {
  const info = kindInfo(kind);
  matIdentity(m);
  matTranslate(m, x, y, z);
  matRotY(m, heading);
  if (carried) {
    if (info.carry === 'roule') {
      // basculé vers le porteur, qui se tient derrière (-z)
      matRotX(m, -0.3);
    } else {
      matTranslate(m, 0, 0.62, 0);
      matRotX(m, -0.18);
    }
    return m;
  }
  if (toppled && !melted) {
    const axis = fallAxis(info, halfX, halfZ, height);
    if (axis !== FALL_NONE) layDown(m, info, axis, hash01(id * 3 + 1) < 0.5);
  }
  return m;
}

/** Élément d'une barricade dans le repère de celle-ci (même forme que BarricadePart de la simulation). */
export interface PartLike {
  readonly kind: string;
  readonly lx: number;
  readonly lz: number;
  readonly heading: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
}

const SYNTH_KINDS: readonly string[] = [
  'conteneur', 'barriere_vauban', 'poubelle', 'palette', 'velo', 'barriere_chantier', 'table_terrasse', 'chaise',
  'conteneur', 'trottinette', 'poubelle', 'palette', 'chaise', 'velo',
];

/**
 * Composition plausible d'une barricade quand la simulation n'en fournit pas le détail : bacs et
 * corbeilles renversés, barrières, palettes, vélos, mobilier de terrasse, répartis sur la longueur
 * (axe x local) de la boîte de la barricade. Déterministe pour un identifiant donné.
 */
export function synthParts(id: number, halfX: number, halfZ: number): PartLike[] {
  const parts: PartLike[] = [];
  let x = -halfX + 0.3;
  let i = Math.floor(hash01(id) * SYNTH_KINDS.length);
  let guard = 0;
  while (x < halfX - 0.2 && guard++ < 40) {
    const kind = SYNTH_KINDS[i % SYNTH_KINDS.length]!;
    i++;
    const info = kindInfo(kind);
    const lying = info.topple !== 'none';
    // boîte couchée comme le fait la simulation : la hauteur passe sur le petit côté de l'emprise
    let hx = info.hx, hz = info.hz, h = info.h;
    if (lying) {
      if (info.hx >= info.hz) { hz = info.h / 2; h = Math.max(0.15, 2 * info.hz); } else { hx = info.h / 2; h = Math.max(0.15, 2 * info.hx); }
    }
    const r1 = hash01(id * 31 + i * 7), r2 = hash01(id * 17 + i * 13);
    const heading = (r1 - 0.5) * 1.3 + (hx < hz ? HALF_PI : 0);
    const along = Math.abs(Math.cos(heading)) * hx + Math.abs(Math.sin(heading)) * hz;
    parts.push({ kind, lx: x + along * 0.8, lz: (r2 - 0.5) * halfZ * 0.9, heading, halfX: hx, halfZ: hz, height: h });
    x += along * 1.25;
  }
  return parts;
}

/**
 * Matrice d'un élément de barricade : repère de la barricade (`base`) puis position, cap, renversement
 * et un léger déséquilibre — les objets s'appuient les uns sur les autres.
 */
export function partMatrix(m: Mat, base: Mat, part: PartLike, index: number, seed: number): Mat {
  const info = kindInfo(part.kind);
  m.set(base);
  const r1 = hash01(seed * 7 + index * 11), r2 = hash01(seed * 13 + index * 5), r3 = hash01(seed * 3 + index * 17);
  // un élément léger sur trois est juché sur ses voisins
  const light = info.size === 0 || part.kind === 'palette' || part.kind === 'velo' || part.kind === 'barriere_vauban';
  const lift = light && index % 3 === 1 ? 0.18 + r3 * 0.3 : 0;
  matTranslate(m, part.lx, lift, part.lz);
  matRotY(m, part.heading);
  matRotX(m, (r1 - 0.5) * (lift > 0 ? 0.6 : 0.16));
  matRotZ(m, (r2 - 0.5) * (lift > 0 ? 0.5 : 0.12));
  const axis = fallAxis(info, part.halfX, part.halfZ, part.height);
  if (axis !== FALL_NONE) layDown(m, info, axis, r3 < 0.5);
  return m;
}
