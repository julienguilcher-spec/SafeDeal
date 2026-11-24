/* =====================================================================================
 * Personnes — le « pion » commun au joueur et à toutes les IA.
 *
 *   people.player        (CONTROL)  contrôleur du joueur → ctx.player, service « player.control »
 *   people.locomotion    (MOVEMENT) déplacement, collisions, séparation, endurance, saut, portage
 *   people.interactions  (ACTIONS)  registre et actions à durée → ctx.interactions ;
 *                                   verbes fournis : porter, trainer, deposer, pousser
 *   people.health        (STATUS)   santé et états → ctx.health ; gaz, feu, eau, peur, colère
 *
 * Services étendus et événements libres : voir api.ts. Réglages : tuning.ts.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { HealthSystem } from './health';
import { InteractionSystem } from './interactions';
import { LocomotionSystem } from './locomotion';
import { PlayerController } from './player';
import { PeopleShared } from './shared';

export const createSystems: ModuleFactory = () => {
  const shared = new PeopleShared();
  return [
    new PlayerController(shared),
    new LocomotionSystem(shared),
    new InteractionSystem(shared),
    new HealthSystem(shared),
  ];
};

export type {
  PeopleGearApi, PeopleHealthApi, PeopleInteractionsApi, PeopleLocomotionApi, PlayerControlApi,
} from './api';
export {
  PEOPLE_GEAR_SERVICE, PEOPLE_HEALTH_SERVICE, PEOPLE_INTERACTIONS_SERVICE, PEOPLE_LOCOMOTION_SERVICE,
  PLAYER_CONTROL_SERVICE,
} from './api';
