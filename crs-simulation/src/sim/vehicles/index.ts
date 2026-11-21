/* =====================================================================================
 * VÉHICULES (simulation) — point d'entrée du module src/sim/vehicles.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as vehicles } from '@/sim/vehicles';
 *   game.addModule(vehicles);
 *
 * Le système (ordre SystemOrder.VEHICLES) publie :
 *   ctx.vehicles                              VehicleApi complet (21 types de véhicules définis) ;
 *   ctx.service('vehicles.autopilot')         AutopilotApi : driveTo, follow, convoy, park, parkRow, stop, status ;
 *   ctx.service('vehicles.ext')               VehiclesExtApi : tourelles, feux, incendie, vol, règles d'accès.
 * et enregistre les gestionnaires d'interaction 'monter', 'conduire', 'descendre', 'renverser'.
 * Types publics : './api' (à importer en `import type` depuis les autres modules).
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { VehiclesSystem } from './system';

export * from './api';
export { VEHICLE_KINDS, createVehicleDefs } from './defs';
export { VehiclesSystem } from './system';

/** Fabrique standard du module (docs/ARCHITECTURE.md §2). */
export const createSystems: ModuleFactory = (): GameSystem[] => [new VehiclesSystem()];
