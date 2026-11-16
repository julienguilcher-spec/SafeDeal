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

/** La session est-elle une journée de service (rôle de police, `extra.journee`) ? */
export function isJournee(config: Pick<SessionConfig, 'role' | 'extra'> | null | undefined): boolean {
  return !!config && !!config.extra && config.extra['journee'] === true && isPoliceRole(config.role);
}
