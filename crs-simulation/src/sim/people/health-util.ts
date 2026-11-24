/* Santé — petites fonctions partagées par health.ts et health-status.ts. */

import type { InjuryLevel, Person } from '@/core/contracts';
import * as T from './tuning';

/** Niveau de blessure correspondant à des points de vie (hors décès) : mêmes seuils que le service neutre. */
export function injuryFor(health: number): InjuryLevel {
  if (health > T.HEALTH_LIGHT) return 'none';
  if (health > T.HEALTH_SERIOUS) return 'light';
  if (health > T.HEALTH_CRITICAL) return 'serious';
  return 'critical';
}

/** Sensibilité à la peur : les forces de l'ordre et les plus aguerris encaissent mieux. */
export function fearSusceptibility(p: Person): number {
  if (p.faction === 'police' || p.faction === 'rescue') return 0.35;
  switch (p.profile) {
    case 'radical': return 0.5;
    case 'meneur':
    case 'service_ordre': return 0.6;
    case 'famille': return 1.5;
    default: return 1;
  }
}
