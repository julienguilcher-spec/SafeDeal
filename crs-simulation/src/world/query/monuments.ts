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

/** Emprise d'un monument sans obstacles propres : obstacle de secours s'il n'a pas de bâtiment. */
export interface LandmarkFallback extends LandmarkObstacle {
  /** Point d'ancrage du monument. */
  x: number;
  z: number;
}

export interface LandmarkObstacleSet {
  /** Clés des monuments dont les obstacles propres remplacent l'emprise des bâtiments marqués. */
  replaced: Set<string>;
  /** Obstacles propres (piliers, socles…) : permanents, indépendants des tuiles. */
  obstacles: LandmarkObstacle[];
  /**
   * Monuments sans obstacles propres : leurs bâtiments gardent leur emprise ordinaire (plus précise :
   * cours, ailes). L'emprise du monument ne sert d'obstacle que là où aucun bâtiment ne le représente
   * (statue, colonne, fontaine absentes de la couche des bâtiments) — décision prise tuile par tuile.
   */
  fallback: LandmarkFallback[];
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

/** Les deux anneaux ont-ils les mêmes sommets (à 1 mm près, ordre et sens indifférents) ? */
function sameRing(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length || a.length < 6) return false;
  for (let i = 0; i + 1 < a.length; i += 2) {
    let found = false;
    for (let j = 0; j + 1 < b.length && !found; j += 2) found = Math.abs(a[i] - b[j]) < 1e-3 && Math.abs(a[i + 1] - b[j + 1]) < 1e-3;
    if (!found) return false;
  }
  return true;
}

/**
 * Obstacles de tous les monuments de la carte, en coordonnées monde.
 *   - getColliders fournit des obstacles propres au monument (piliers d'un arc…) : ils remplacent
 *     l'emprise de ses bâtiments. Un obstacle dont le dessous est à plus de 2,5 m (voûte, linteau)
 *     n'arrête personne : il est écarté.
 *   - getColliders ne fournit rien, échoue, ou ne fait que rendre l'emprise du site (son repli pour
 *     un monument sans fichier d'obstacles) : le monument passe en « secours » (voir LandmarkObstacleSet).
 * @param skipKeys clés à ignorer en secours (ouvrages portés par une arête du graphe : ponts)
 */
export function buildLandmarkObstacles(landmarks: readonly Landmark[], getColliders: GetColliders | null, skipKeys: ReadonlySet<string>): LandmarkObstacleSet {
  const set: LandmarkObstacleSet = { replaced: new Set<string>(), obstacles: [], fallback: [] };
  for (const lm of landmarks) {
    let list: ReturnType<GetColliders> = null;
    const site: ColliderSite = { footprint: toLocal(lm.footprint, lm.x, lm.z, lm.heading), height: lm.height };
    if (getColliders !== null) {
      try {
        list = getColliders(lm.key, site);
      } catch (err) {
        console.error(`[world] getColliders('${lm.key}') a échoué : emprise ordinaire conservée`, err);
      }
    }
    const own = list !== null && list !== undefined && list.length > 0 && !(list.length === 1 && list[0].baseY <= 0 && sameRing(list[0].ring, site.footprint));
    if (!own || list === null || list === undefined) {
      if (!skipKeys.has(lm.key) && lm.footprint.length >= 6 && lm.height > 0) {
        set.fallback.push({ key: lm.key, ring: Float32Array.from(lm.footprint), top: lm.height, x: lm.x, z: lm.z });
      }
      continue;
    }
    set.replaced.add(lm.key);
    for (const c of list) {
      if (c.baseY > PASS_UNDER_Y || c.ring.length < 6 || !(c.height > 0)) continue;
      set.obstacles.push({ key: lm.key, ring: toWorld(c.ring, lm.x, lm.z, lm.heading), top: c.baseY + c.height });
    }
  }
  return set;
}
