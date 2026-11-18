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

/*
 * Commissariats d'arrondissement : adresses réelles, projetées sur la carte, le point posé SUR LA VOIE devant l'entrée
 * (relevé sur le réseau de rues : chaussée libre, avec une sortie). Les coordonnées d'origine tombaient dans
 * l'emprise des bâtiments (1er, 7e, 8e, 9e) : la BRAV-M du 9e ne trouvait aucune place pour ses motos et partait de
 * la caserne de la compagnie, et l'emplacement des forces était cherché au hasard autour d'un îlot.
 */
const COMMISSARIAT_1 = { x: 781, z: -211, name: 'commissariat du 1er arrondissement (marché Saint-Honoré)' } as const;
const COMMISSARIAT_9 = { x: 1350, z: -897, name: 'commissariat du 9e arrondissement (rue Chauchat)' } as const;
const COMMISSARIAT_3 = { x: 2255, z: 271, name: 'commissariat du 3e arrondissement (rue aux Ours)' } as const;
const COMMISSARIAT_8 = { x: -535, z: -130, name: 'commissariat du 8e arrondissement (Grand Palais)' } as const;
const COMMISSARIAT_7 = { x: -731, z: 738, name: 'commissariat du 7e arrondissement (rue Fabert)' } as const;

/**
 * Lieux de prise de service, par ordre de préférence : la caserne de la Cité (point central), puis des commissariats
 * d'arrondissement. On part de la première base située entre BASE_MIN_DIST et BASE_MAX_DIST du rassemblement : un
 * vrai trajet en colonne, sans traverser tout Paris.
 */
export const SERVICE_BASES: readonly ServiceBase[] = [
  SERVICE_BASE, COMMISSARIAT_1, COMMISSARIAT_9, COMMISSARIAT_3, COMMISSARIAT_8, COMMISSARIAT_7,
];
export const BASE_MIN_DIST = 1200;
export const BASE_MAX_DIST = 3200;

/**
 * Points de départ de la BRAV-M en journée de service : un autre commissariat que la compagnie (on se rejoint sur
 * place). Ordre de préférence ; le 1er arrondissement en dernier (souvent la base de la compagnie).
 */
export const BRAVM_BASES: readonly ServiceBase[] = [COMMISSARIAT_9, COMMISSARIAT_3, COMMISSARIAT_8, COMMISSARIAT_7, COMMISSARIAT_1];

/** Préchargement de la base de la BRAV-M (écrite dans `extra.baseBravm`). */
export function bravmBasePreload(): { candidates: ServiceBase[]; minDist: number; maxDist: number; as: string } {
  return { candidates: BRAVM_BASES.slice(), minDist: 900, maxDist: 3500, as: 'baseBravm' };
}

/** Base de départ de la BRAV-M (null : avec la compagnie). */
export function bravmBaseOf(config: Pick<SessionConfig, 'extra'> | null | undefined): ServiceBase | null {
  const b = config && config.extra ? config.extra['baseBravm'] : undefined;
  if (!b || typeof b !== 'object') return null;
  const o = b as { x?: unknown; z?: unknown; name?: unknown };
  if (typeof o.x !== 'number' || typeof o.z !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.z)) return null;
  const main = baseOf(config);
  if (Math.hypot(main.x - o.x, main.z - o.z) < 300) return null;
  return { x: o.x, z: o.z, name: typeof o.name === 'string' ? o.name : 'commissariat' };
}

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

/**
 * La session est-elle une journée de service (rôle de police, `extra.journee`) ? Jamais pour l'équipage de patrouille :
 * une voiture seule part de son secteur, sans prise de service à la caserne ni trajet en colonne.
 */
export function isJournee(config: Pick<SessionConfig, 'role' | 'extra'> | null | undefined): boolean {
  return !!config && !!config.extra && config.extra['journee'] === true && isPoliceRole(config.role) && config.role !== 'patrouille';
}
