/* =====================================================================================
 * GROUPES RADICAUX — point d'entrée du sous-module src/sim/crowd/radical.
 *
 * Black bloc, émeutiers, suiveurs et pilleurs : des contrôleurs de comportement branchés sur le cœur de
 * la foule (registre par profil). Le système est créé par createCrowdSystems() de '@/sim/crowd' : rien
 * à ajouter dans la racine de composition. Voir api.ts pour les services ('crowd.signals',
 * 'crowd.radical'), les événements libres et les clés de configuration.
 * ===================================================================================== */

import type { CrowdCore } from '../core';
import { RadicalSystem } from './system';

export * from './api';
export { RadicalSystem } from './system';
export { PLAN, PLAN_NAMES, TASK, BLOC, KIND } from './model';
export type { RadGroup, RadMember } from './model';

/** Crée le système des groupes radicaux, attaché au cœur de la foule. */
export function createRadicalSystem(core: CrowdCore): RadicalSystem {
  return new RadicalSystem(core);
}
