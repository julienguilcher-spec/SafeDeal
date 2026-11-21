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
  'conteneur', 'barriere_vauban', 'palette', 'velo', 'poubelle', 'chaise', 'conteneur', 'barriere_chantier', 'table_terrasse',
  'trottinette', 'poubelle', 'palette', 'conteneur', 'velo', 'barriere_vauban', 'chaise',
];
/** Rangs de la liste où une composition peut commencer : toujours par un bac roulant. */
const SYNTH_STARTS: readonly number[] = [0, 6, 12];

/**
 * Composition plausible d'une barricade quand la simulation n'en fournit pas le détail : bacs et
 * corbeilles renversés, barrières, palettes, vélos, mobilier de terrasse, répartis sur la longueur
 * (axe x local) de la boîte de la barricade. Déterministe pour un identifiant donné.
 */
export function synthParts(id: number, halfX: number, halfZ: number): PartLike[] {
  const parts: PartLike[] = [];
  let x = -halfX + 0.3;
  let i = SYNTH_STARTS[Math.floor(hash01(id) * SYNTH_STARTS.length)]!;
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
    parts.push({ kind, lx: x + along * 0.7, lz: (r2 - 0.5) * halfZ * 0.9, heading, halfX: hx, halfZ: hz, height: h });
    // les éléments se chevauchent : un tas, pas un alignement
    x += along * (info.size === 0 ? 0.55 : 0.95);
  }
  return parts;
}

/** Hauteur d'appui offerte par un élément couché (bac, corbeille) aux objets jetés par-dessus. */
function supportHeight(part: PartLike): number {
  return part.kind === 'conteneur' || part.kind === 'poubelle' ? part.height : 0;
}

/**
 * Matrice d'un élément de barricade : repère de la barricade (`base`), puis une pose de TAS —
 *   - bacs et corbeilles couchés au sol, comme les a laissés la simulation ;
 *   - barrières dressées de biais, appuyées sur le tas ; palettes calées debout ;
 *   - vélos, trottinettes, tables et chaises jetés par-dessus l'appui le plus proche, de travers.
 * `height` : hauteur de la barricade (sommet visé du tas) ; `burnt` : barricade calcinée (le plastique
 * fondu n'est plus couché ni empilé). Déterministe pour une graine donnée.
 */
export function partMatrix(
  m: Mat, base: Mat, part: PartLike, index: number, seed: number, parts: readonly PartLike[], height: number, burnt = false,
): Mat {
  const info = kindInfo(part.kind);
  m.set(base);
  if (burnt && info.burn === 'fond') {
    // plastique fondu : une flaque au sol, à l'endroit de l'objet
    matTranslate(m, part.lx, 0, part.lz);
    matRotY(m, part.heading);
    return m;
  }
  const r1 = hash01(seed * 7 + index * 11), r2 = hash01(seed * 13 + index * 5), r3 = hash01(seed * 3 + index * 17);
  const kind = info.model;
  if (kind === 'barriere_vauban' || kind === 'barriere_chantier') {
    // dressée, penchée de 35 à 55° vers l'un ou l'autre côté ; une grande grille est couchée plus bas
    const side = index % 2 === 0 ? 1 : -1;
    const lean = (kind === 'barriere_chantier' ? 0.7 : 0.5) + r1 * 0.3;
    matTranslate(m, part.lx, 0, part.lz - side * Math.sin(lean) * info.h * 0.42);
    matRotY(m, part.heading + (r2 - 0.5) * 0.3);
    matRotX(m, side * lean);
    matRotZ(m, (r3 - 0.5) * 0.18);
    return m;
  }
  if (kind === 'palette') {
    // calée debout contre le tas
    const side = index % 2 === 0 ? -1 : 1;
    const lean = 0.5 + r1 * 0.6;
    matTranslate(m, part.lx, 0.38 * Math.cos(lean) + 0.05, part.lz + side * 0.25);
    matRotY(m, part.heading + (r2 - 0.5) * 0.5);
    matRotX(m, side * (Math.PI / 2 - lean));
    return m;
  }
  const light = kind === 'velo' || kind === 'trottinette' || kind === 'chaise' || kind === 'table_terrasse' || kind === 'cone';
  let lx = part.lx, lift = 0;
  if (light) {
    // posé sur l'appui le plus proche (à moins de 1,6 m), sinon sur ses voisins à mi-hauteur
    let best = 1.6, bestH = 0, bestX = lx;
    for (let i = 0; i < parts.length; i++) {
      const h = supportHeight(parts[i]!);
      const d = Math.abs(parts[i]!.lx - lx);
      if (h > 0 && d < best) { best = d; bestH = h; bestX = parts[i]!.lx; }
    }
    if (bestH > 0 && !burnt) {
      lx = bestX + (r2 - 0.5) * 0.5;
      lift = bestH * (0.75 + r3 * 0.25);
    } else {
      lift = Math.max(0, height - part.height) * (0.25 + r3 * 0.3);
    }
    lift = Math.min(lift, Math.max(0, height - part.height * 0.5));
  }
  matTranslate(m, lx, lift, part.lz * (light ? 0.5 : 1));
  matRotY(m, part.heading);
  matRotX(m, (r1 - 0.5) * (light ? 0.9 : 0.16));
  matRotZ(m, (r2 - 0.5) * (light ? 0.7 : 0.12));
  const axis = fallAxis(info, part.halfX, part.halfZ, part.height);
  if (axis !== FALL_NONE) layDown(m, info, axis, r3 < 0.5);
  return m;
}
