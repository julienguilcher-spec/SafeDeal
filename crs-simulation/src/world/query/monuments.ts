/* =====================================================================================
 * Obstacles des monuments.
 *
 * Si src/world/monuments/colliders.ts existe (module de présentation, écrit par ailleurs, qui
 * exporte getColliders(clé, site) en données pures), les bâtiments marqués d'une clé de monument
 * sont remplacés par les obstacles du modèle (piliers d'un arc, socle d'une colonne…). Sinon,
 * leur emprise ordinaire sert d'obstacle. Le fichier est facultatif : import.meta.glob ne
 * retourne rien s'il est absent, et hors de Vite (Node seul) la fonction n'existe pas.
 * ===================================================================================== */

import type { Landmark } from '../mapdata';
import type { ColliderSite, GetColliders } from './api';

/** Hauteur libre au-delà de laquelle on passe sous un obstacle (voûte, tablier). */
export const PASS_UNDER_Y = 2.5;

let loading: Promise<GetColliders | null> | null = null;

/** Charge getColliders s'il existe (une seule fois). Ne lève jamais. */
export function loadMonumentColliders(): Promise<GetColliders | null> {
  if (loading === null) {
    loading = (async (): Promise<GetColliders | null> => {
      let loaders: Record<string, () => Promise<unknown>> = {};
      try {
        loaders = import.meta.glob('../monuments/colliders.ts');
      } catch {
        return null; // hors de Vite : pas de import.meta.glob
      }
      const keys = Object.keys(loaders);
      if (keys.length === 0) return null;
      try {
        const mod = (await loaders[keys[0]]()) as { getColliders?: unknown };
        if (typeof mod.getColliders === 'function') return mod.getColliders as GetColliders;
        console.warn('[world] src/world/monuments/colliders.ts n\'exporte pas getColliders : emprises ordinaires conservées');
      } catch (err) {
        console.warn('[world] obstacles des monuments indisponibles : emprises ordinaires conservées', err);
      }
      return null;
    })();
  }
  return loading;
}

/** Obstacle d'un monument en coordonnées monde. */
export interface LandmarkObstacle {
  key: string;
  /** Anneau monde [x0, z0, …]. */
  ring: Float32Array;
  /** Hauteur du dessus de l'obstacle au-dessus du sol (m). */
  top: number;
}

export interface LandmarkObstacleSet {
  /** Clés des monuments dont les obstacles remplacent l'emprise des bâtiments marqués. */
  replaced: Set<string>;
  obstacles: LandmarkObstacle[];
}

/** Anneau monde → repère local du monument (origine à l'ancrage, façade vers +z). */
function toLocal(ring: ArrayLike<number>, ox: number, oz: number, heading: number): number[] {
  const c = Math.cos(heading), s = Math.sin(heading);
  const out: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i] - ox, z = ring[i + 1] - oz;
    out.push(x * c - z * s, x * s + z * c);
  }
  return out;
}

/** Anneau local → monde (rotation de `heading` comme rotation.y, puis translation). */
function toWorld(ring: ArrayLike<number>, ox: number, oz: number, heading: number): Float32Array {
  const c = Math.cos(heading), s = Math.sin(heading);
  const out = new Float32Array(ring.length & ~1);
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i], z = ring[i + 1];
    out[i] = ox + x * c + z * s;
    out[i + 1] = oz - x * s + z * c;
  }
  return out;
}

/**
 * Obstacles de tous les monuments de la carte, en coordonnées monde. Un obstacle dont le dessous
 * est à plus de 2,5 m (voûte, linteau) n'arrête personne : il est écarté. Un monument pour lequel
 * getColliders ne retourne rien garde son emprise ordinaire (il n'est pas dans `replaced`).
 */
export function buildLandmarkObstacles(landmarks: readonly Landmark[], getColliders: GetColliders | null): LandmarkObstacleSet {
  const set: LandmarkObstacleSet = { replaced: new Set<string>(), obstacles: [] };
  if (getColliders === null) return set;
  for (const lm of landmarks) {
    const site: ColliderSite = { footprint: toLocal(lm.footprint, lm.x, lm.z, lm.heading), height: lm.height };
    let list: ReturnType<GetColliders>;
    try {
      list = getColliders(lm.key, site);
    } catch (err) {
      console.error(`[world] getColliders('${lm.key}') a échoué : emprise ordinaire conservée`, err);
      continue;
    }
    if (list === null || list === undefined || list.length === 0) continue;
    set.replaced.add(lm.key);
    for (const c of list) {
      if (c.baseY > PASS_UNDER_Y || c.ring.length < 6 || !(c.height > 0)) continue;
      set.obstacles.push({ key: lm.key, ring: toWorld(c.ring, lm.x, lm.z, lm.heading), top: c.baseY + c.height });
    }
  }
  return set;
}
