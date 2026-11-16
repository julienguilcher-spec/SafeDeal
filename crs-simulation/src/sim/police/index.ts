/* =====================================================================================
 * FORCES DE L'ORDRE — point d'entrée du module src/sim/police.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as police } from '@/sim/police';
 *   game.addModule(police);
 *
 * Un système, id 'police.ai', ordre SystemOrder.CONTROL. Il publie :
 *   ctx.service<PoliceUnitsApi>('police.units')          construction des unités
 *   ctx.service<PoliceStatusApi>('police.status')        état des unités (interface, commandement)
 *   ctx.service<PoliceSlotApi>('police.slot')            emplacement réservé (joueur équipier)
 *   ctx.service<PoliceFormationApi>('police.formation')  géométrie et alignement mesuré
 *   ctx.service<PoliceTuning>('police.tuning')           réglages
 * Types publics et conventions des ordres : './api' (à importer en `import type`).
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { PoliceSystem } from './system';

export * from './api';
export { PoliceSystem } from './system';

/** Fabrique standard du module (docs/ARCHITECTURE.md §2). */
export const createSystems: ModuleFactory = (): GameSystem[] => [new PoliceSystem()];
