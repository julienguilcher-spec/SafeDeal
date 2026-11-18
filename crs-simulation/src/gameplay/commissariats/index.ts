/* =====================================================================================
 * Module « commissariats » (src/gameplay/commissariats) : stock d'unités des sept sites de police réels (véhicules
 * garés dans leurs places réservées), engagement par le commandant, retour au commissariat (remise des interpellés,
 * réserves, repos).
 *
 * Branchement : `import { createSystems as commissariats } from '@/gameplay/commissariats'` puis l'ajouter aux modules
 * APRÈS le module des patrouilles (dont il se sert pour les voitures de Police secours et de la BAC) et le module de
 * session (il garnit les places à la mise en place). Service : ctx.service<CommissariatsApi>('police.commissariats').
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { CommissariatsSystem } from './system';

export const createSystems: ModuleFactory = () => [new CommissariatsSystem()];

export { CommissariatsSystem } from './system';
export {
  COMMISSARIATS_SERVICE, COMMISSARIATS_SYSTEM_ID, COMMISSARIAT_ENGAGED_EVENT, COMMISSARIAT_RETURNED_EVENT,
  COMMISSARIAT_STOCK_EVENT,
} from './api';
export type {
  CommissariatEngagedEvent, CommissariatReturnedEvent, CommissariatStockEvent, CommissariatView, CommissariatsApi,
  EngageResult, EntryState, RecallTarget, StockEntryView,
} from './api';
export { atName, homeName } from './texts';
