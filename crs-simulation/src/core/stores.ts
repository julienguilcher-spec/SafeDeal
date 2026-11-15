/* =====================================================================================
 * Magasins d'entités du cœur : point d'entrée unique.
 * Ils équipent le contexte tant qu'aucun module spécialisé ne les remplace, et peuvent servir
 * de base à ces modules (import depuis '@/core/stores').
 * ===================================================================================== */

export {
  createPeopleStore, defaultFactionOf,
  PERSON_RADIUS, PERSON_SPEED_WALK, PERSON_SPEED_RUN, PERSON_SPEED_SPRINT, PEOPLE_CELL_SIZE,
} from './store-people';
export { createSquadStore, rankLevel } from './store-squads';
export { createProjectileStore } from './store-projectiles';
export { createVehicleStore, genericVehicleDef, plateFor } from './store-vehicles';
export type { VehicleStore } from './store-vehicles';
export { createPropStore, propDefaults, PROP_DEFAULTS } from './store-props';
export type { PropStore, PropDefaults, ShopInit } from './store-props';
