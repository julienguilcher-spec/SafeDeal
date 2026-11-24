/* =====================================================================================
 * Module « transfert » (src/gameplay/transfer) : transfert des interpellés au commissariat par les fourgons
 * cellulaires, « toujours un fourgon sur place » (relève), fourgon demandé tout seul pour une patrouille, remise au
 * commissariat d'une voiture qui y arrive avec ses interpellés (plan ordres-directs §5.5, §5.1, §5.7).
 *
 * Branchement : `import { createSystems as transfer } from '@/gameplay/transfer'` puis l'ajouter aux modules APRÈS le
 * module des commissariats (il se sert de ses sites, de son rappel et de son événement d'arrivée ; sans lui, le
 * transfert se fait hors de la carte). Service : ctx.service<TransferApi>('transfer').
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { VanLabelsSystem } from './labels';
import { TransferSystem } from './system';

/** Transfert et étiquettes des fourgons cellulaires (« CELLULAIRE 1 · 3/8 » dans le monde et sur les cartes). */
export const createSystems: ModuleFactory = () => [new TransferSystem(), new VanLabelsSystem()];

export {
  TransferSystem, TRANSFER_SERVICE, TRANSFER_SYSTEM_ID, TRANSFER_DEPARTED_EVENT, TRANSFER_DELIVERED_EVENT,
  TRANSFER_RELIEF_EVENT,
} from './system';
export type {
  TransferApi, TransferDelivery, TransferDepartResult, TransferDepartedEvent, TransferDeliveredEvent, TransferPatrolRequest,
  TransferReliefEvent, TransferStage, TransferVanView,
} from './system';
export { VAN_INTRO_SECONDS, VAN_LABEL_NEAR, VAN_LABELS_SERVICE, VAN_LABELS_SYSTEM_ID, VanLabelsSystem, vanLabel } from './labels';
export type { VanLabelsApi } from './labels';
