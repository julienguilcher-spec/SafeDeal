/* =====================================================================================
 * FORCES DE L'ORDRE — point d'entrée du module src/sim/police.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as police } from '@/sim/police';
 *   game.addModule(police);
 *
 * Deux systèmes : 'police.ai' (ordre SystemOrder.CONTROL, IA des unités) et 'police.command' (ordre
 * CONTROL + 5 : commandant IA, adjoint du joueur-commandant, unités spéciales, convois — voir
 * ./command/api.ts ; services 'police.command' et 'command.post'). Le premier publie :
 *   ctx.service<PoliceUnitsApi>('police.units')          construction des unités
 *   ctx.service<PoliceStatusApi>('police.status')        état des unités (interface, commandement)
 *   ctx.service<PoliceSlotApi>('police.slot')            emplacement réservé (joueur équipier)
 *   ctx.service<PoliceFormationApi>('police.formation')  géométrie et alignement mesuré
 *   ctx.service<PoliceTuning>('police.tuning')           réglages
 * Types publics et conventions des ordres : './api' (à importer en `import type`).
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { CommandSystem } from './command/system';
import { PoliceSystem } from './system';

export * from './api';
export { PoliceSystem } from './system';
export { CommandSystem } from './command/system';

/** Fabrique standard du module (docs/ARCHITECTURE.md §2) : IA des unités et commandement. */
export const createSystems: ModuleFactory = (): GameSystem[] => [new PoliceSystem(), new CommandSystem()];
