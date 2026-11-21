/* =====================================================================================
 * CIRCULATION — point d'entrée du module src/sim/traffic.
 *
 * Branchement (racine de composition) :
 *   import { createSystems as traffic } from '@/sim/traffic';
 *   game.addModule(traffic);
 *
 * Un système, id 'sim:traffic', ordre SystemOrder.CONTROL + 20 (avant les véhicules et la locomotion). Il publie :
 *   ctx.service<TrafficControlApi>(EXT.traffic)   fermeture de rues (closeRoad, closeArea, open, openAll, isClosed, countNear) ;
 *   ctx.service<TrafficApi>('traffic')            réglages, compteurs, feux, apparitions à la demande.
 * Il s'appuie sur ctx.world (graphe routier), sur le pilote automatique du module des véhicules (service
 * 'vehicles.autopilot') pour faire rouler la circulation, et sur la locomotion du module des personnes pour
 * les piétons. Sans graphe routier il ne fait rien ; sans pilote automatique il n'y a pas de véhicules en
 * circulation (stationnement, piétons et fermetures restent).
 * Types publics : './api' (à importer en `import type` depuis les autres modules).
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { TrafficSystem } from './system';

export * from './api';
export { TrafficSystem } from './system';

/** Fabrique standard du module (docs/ARCHITECTURE.md §2). */
export const createSystems: ModuleFactory = (): GameSystem[] => [new TrafficSystem()];
