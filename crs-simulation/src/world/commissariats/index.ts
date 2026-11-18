/* =====================================================================================
 * COMMISSARIATS — point d'entrée des données (pur : importable par toutes les couches, rendu compris).
 *
 *   import { COMMISSARIATS, isHeldVehicle, reservedBays } from '@/world/commissariats';
 *
 * Le calcul et le contrôle de la disposition (layout.ts) ne sont pas réexportés : ils ne servent qu'aux essais sur
 * la vraie carte (import direct de '@/world/commissariats/layout').
 * ===================================================================================== */

export type {
  CommissariatDef, CommissariatKind, CommissariatSeed, CommissariatSign, FrozenLayout, Pose, ReservedBay, StockKind,
  StockSeed, StockTemplate, YardSlot,
} from './data';
export {
  BAC_COLOR, COMMISSARIATS, COMMISSARIAT_SEEDS, SPARE_LEN, SPARE_WIDTH, STOCK_CALLSIGN_PATTERN, VEHICLE_LEN, VEHICLE_WIDTH,
  commissariatById, fileCentre, nearestCommissariat, reservedBays, vehicleLen, vehicleWidth,
} from './data';
export { isHeldVehicle, isReturningHome } from './held';
