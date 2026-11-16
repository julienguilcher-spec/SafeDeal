/* =====================================================================================
 * JOURNÉE DE SERVICE — données partagées (base, activation).
 * ===================================================================================== */

import type { SessionConfig } from '@/core/contracts';
import { isPoliceRole } from './roster';

/**
 * Caserne de prise de service : préfecture de police, île de la Cité, entrée du boulevard du Palais (chaussée de 15 m,
 * coordonnées relevées sur le réseau de voies : 1755,1228). Le parvis Notre-Dame, piéton, ne laissait pas de place aux
 * motos de la BRAV-M ni aux engins.
 */
export const SERVICE_BASE = { x: 1760, z: 1225, name: 'caserne de la Cité' } as const;

export interface ServiceBase {
  readonly x: number;
  readonly z: number;
  readonly name: string;
}

/**
 * Lieux de prise de service, par ordre de préférence : la caserne de la Cité (point central), puis des commissariats
 * d'arrondissement (adresses réelles, projetées sur la carte). On part de la première base située entre
 * BASE_MIN_DIST et BASE_MAX_DIST du rassemblement : un vrai trajet en colonne, sans traverser tout Paris.
 */
export const SERVICE_BASES: readonly ServiceBase[] = [
  SERVICE_BASE,
  { x: 767, z: -119, name: 'commissariat du 1er arrondissement (marché Saint-Honoré)' },
  { x: 1412, z: -897, name: 'commissariat du 9e arrondissement (rue Chauchat)' },
  { x: 2255, z: 271, name: 'commissariat du 3e arrondissement (rue aux Ours)' },
  { x: -640, z: -96, name: 'commissariat du 8e arrondissement (Grand Palais)' },
  { x: -765, z: 738, name: 'commissariat du 7e arrondissement (rue Fabert)' },
];
export const BASE_MIN_DIST = 1200;
export const BASE_MAX_DIST = 3200;

/** Base retenue pour un rassemblement en (x, z) (même règle que le préchargement de la session). */
export function serviceBaseFor(x: number, z: number): ServiceBase {
  let best: ServiceBase = SERVICE_BASE;
  let bestGap = Infinity;
  for (const b of SERVICE_BASES) {
    const d = Math.hypot(b.x - x, b.z - z);
    const gap = d < BASE_MIN_DIST ? BASE_MIN_DIST - d : d > BASE_MAX_DIST ? d - BASE_MAX_DIST : 0;
    if (gap === 0) return b;
    if (gap < bestGap) { bestGap = gap; best = b; }
  }
  return best;
}

/**
 * Entrée de préchargement (`extra.preload`) : la session choisit la base selon le point de départ réel (lieu résolu
 * sur la carte), l'écrit dans `extra.base` et charge ses données avant la mise en place.
 */
export function basePreload(): { candidates: ServiceBase[]; minDist: number; maxDist: number; as: string } {
  return { candidates: SERVICE_BASES.slice(), minDist: BASE_MIN_DIST, maxDist: BASE_MAX_DIST, as: 'base' };
}

/** Base de prise de service d'une session (choisie au démarrage), la Cité à défaut. */
export function baseOf(config: Pick<SessionConfig, 'extra'> | null | undefined): ServiceBase {
  const b = config && config.extra ? config.extra['base'] : undefined;
  if (b && typeof b === 'object') {
    const o = b as { x?: unknown; z?: unknown; name?: unknown };
    if (typeof o.x === 'number' && typeof o.z === 'number' && Number.isFinite(o.x) && Number.isFinite(o.z)) {
      return { x: o.x, z: o.z, name: typeof o.name === 'string' && o.name ? o.name : 'base de prise de service' };
    }
  }
  return SERVICE_BASE;
}

/** La session est-elle une journée de service (rôle de police, `extra.journee`) ? */
export function isJournee(config: Pick<SessionConfig, 'role' | 'extra'> | null | undefined): boolean {
  return !!config && !!config.extra && config.extra['journee'] === true && isPoliceRole(config.role);
}
