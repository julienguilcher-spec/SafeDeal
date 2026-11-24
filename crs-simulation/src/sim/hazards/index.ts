/* =====================================================================================
 * DANGERS DIFFUS (simulation) — point d'entrée du module src/sim/hazards.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as hazards } from '@/sim/hazards';
 *   game.addModule(hazards);
 * ou, avec des réglages (tests, bancs d'essai) :
 *   game.addModule(() => createHazardSystems({ gust: 0 }));
 *
 * Le système publie :
 *   ctx.hazards                               HazardApi complet (gaz, fumée, feu, eau, visibilité) ;
 *   ctx.service<HazardFieldView>('hazards.field')   lecture du champ pour le rendu et le débogage.
 *
 * Fichiers :
 *   api.ts       types publics (service de lecture, événement « hazards:douse »)
 *   config.ts    constantes de grille, réglages physiques sourcés
 *   statics.ts   cache du bâti par cellule, ouverture et axe des rues
 *   grid.ts      grille creuse par blocs, réserve de blocs
 *   wind.ts      dérive, rafales, sautes de vent
 *   solver.ts    entretien des blocs, coefficients de transport (dérive locale, dilution, envol)
 *   transport.ts passes de flux et d'application (boucles chaudes)
 *   sampling.ts  dépôt, lecture interpolée, visibilité, rabattement par l'eau
 *   fires.ts     nappes de feu au sol
 *   system.ts    système de jeu : HazardApi + HazardFieldView
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import type { HazardTuning } from './config';
import { HazardsSystem } from './system';

export type { FireView, HazardCellCallback, HazardDouseEvent, HazardFieldView, HazardStats } from './api';
export { CELL_RECORD, HAZARD_DOUSE_EVENT, HAZARD_FIELD_SERVICE } from './api';
export { CELL as HAZARD_CELL_SIZE, DEFAULT_TUNING, FIELD_DT as HAZARD_FIELD_DT, SMOKE_FIRE_COLOR } from './config';
export type { HazardTuning } from './config';
export { HAZARDS_SYSTEM_ID, HazardsSystem } from './system';

/** Systèmes du module, avec réglages optionnels. */
export function createHazardSystems(tuning: Partial<HazardTuning> = {}): GameSystem[] {
  return [new HazardsSystem(tuning)];
}

/** Fabrique standard du module (docs/ARCHITECTURE.md §2). */
export const createSystems: ModuleFactory = () => createHazardSystems();
