/* Obstacles au sol des monuments — DONNÉES PURES (aucun import de Three.js) : ce fichier et tout
 * collide/<clé>.ts sont aussi chargés par la simulation sous Node. */
import type { LandmarkInfo } from '@/core/contracts';
import type { MonumentCollider, MonumentSite } from './types';
import { canonicalKey, keyFromPath, registerAlias } from './keys';
import { ensureCCW, transformRing, worldRingToLocal } from './shape2d';

type CollideModule = { colliders?: (site: MonumentSite) => MonumentCollider[]; alias?: string };

const modules = import.meta.glob('./collide/*.ts', { eager: true }) as Record<string, CollideModule>;

const table = new Map<string, (site: MonumentSite) => MonumentCollider[]>();
for (const path of Object.keys(modules)) {
  const fn = modules[path].colliders;
  if (typeof fn === 'function') table.set(keyFromPath(path), fn);
  // alias de carte : collide/<alias>.ts exporte `alias = '<clé cible>'` (mêmes obstacles que la cible)
  else if (typeof modules[path].alias === 'string') registerAlias(keyFromPath(path), modules[path].alias as string);
  else console.error(`[monuments] collide/${keyFromPath(path)}.ts n'exporte ni « colliders » ni « alias »`);
}

const NO_SITE: MonumentSite = { footprint: [], height: 0 };

/** Clés disposant d'un fichier collide/. */
export function listColliderKeys(): string[] {
  return [...table.keys()].sort();
}

/**
 * Obstacles d'un monument dans son repère LOCAL. Sans fichier collide/<clé>.ts, l'emprise du site (si elle
 * existe) sert d'obstacle plein de la hauteur indiquée : suffisant pour un bâtiment ordinaire.
 */
export function getColliders(key: string, site: MonumentSite = NO_SITE): MonumentCollider[] {
  const fn = table.get(key) ?? table.get(canonicalKey(key));
  if (fn) return fn(site);
  if (site.footprint.length >= 6) return [{ ring: ensureCCW(site.footprint), height: site.height > 0 ? site.height : 20, baseY: 0 }];
  return [];
}

/** Site local d'un repère de carte (emprise monde → repère du monument). */
export function siteOfLandmark(lm: Pick<LandmarkInfo, 'x' | 'z' | 'heading' | 'height' | 'footprint'>): MonumentSite {
  return { footprint: worldRingToLocal(lm.footprint, lm.x, lm.z, lm.heading), height: lm.height };
}

/** Obstacles d'un monument de la carte, anneaux exprimés en coordonnées MONDE (prêts pour les collisions). */
export function getWorldColliders(lm: Pick<LandmarkInfo, 'key' | 'x' | 'z' | 'heading' | 'height' | 'footprint'>): MonumentCollider[] {
  const local = getColliders(lm.key, siteOfLandmark(lm));
  return local.map((c) => ({ ring: transformRing(c.ring, lm.x, lm.z, lm.heading), height: c.height, baseY: c.baseY }));
}
