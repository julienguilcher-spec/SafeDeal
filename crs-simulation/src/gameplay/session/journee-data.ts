/* =====================================================================================
 * JOURNÉE DE SERVICE — données partagées (base, activation).
 * ===================================================================================== */

import type { SessionConfig } from '@/core/contracts';
import { isPoliceRole } from './roster';

/**
 * Caserne de prise de service : préfecture de police, île de la Cité (parvis Notre-Dame, rue de la Cité) —
 * coordonnées de jeu relevées sur le réseau de voies (rue de la Cité 1910,1304 ; allée des Défenseurs de la caserne
 * de la Cité 1931,1177).
 */
export const SERVICE_BASE = { x: 1935, z: 1290, name: 'caserne de la Cité' } as const;

/** La session est-elle une journée de service (rôle de police, `extra.journee`) ? */
export function isJournee(config: Pick<SessionConfig, 'role' | 'extra'> | null | undefined): boolean {
  return !!config && !!config.extra && config.extra['journee'] === true && isPoliceRole(config.role);
}
