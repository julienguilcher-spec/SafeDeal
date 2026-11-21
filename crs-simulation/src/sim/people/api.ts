/* =====================================================================================
 * Personnes — services étendus publiés par le module (à importer avec `import type`).
 *
 *   ctx.health / ctx.interactions / ctx.player                → contrat (HealthApi, InteractionApi, PlayerApi)
 *   ctx.service<PlayerControlApi>('player.control')           → engin télépiloté, masque, champ de vision
 *   ctx.service<PeopleLocomotionApi>('people.locomotion')     → essoufflement, charge, densité, pression
 *   ctx.service<PeopleHealthApi>('people.health')             → rinçage des yeux, extinction, mise à terre minutée
 *   ctx.service<PeopleGearApi>('people.gear')                 → masque à gaz et visière (IA comprises)
 *   ctx.service<PeopleInteractionsApi>('people.interactions') → options ciblées, progression
 *
 * Événements libres émis (ctx.events.onAny) :
 *   'people:blocked'   { id, info }                 coup arrêté par un bouclier (aucun person:hurt)
 *   'people:died'      { id, sourceId, kind }       décès (violence « réaliste » uniquement)
 *   'people:carried'   { byId, targetId, mode }     blessé chargé sur l'épaule ('porter') ou traîné ('trainer')
 *   'people:dropped'   { byId, targetId }
 *   'people:pushed'    { byId, targetId, fell }
 *   'people:winded'    { id }                       à bout de souffle
 *   'interaction:started' | 'interaction:completed' | 'interaction:cancelled'  { actorId, verb, targetId }
 *   'player:use_failed' { reason }                  l'objet en main n'a pas pu servir
 *   'player:remote'    { vehicleId }                début / fin de télépilotage
 * ===================================================================================== */

import type { EntityId, InteractionOption, Person } from '@/core/contracts';

export const PLAYER_CONTROL_SERVICE = 'player.control';
export const PEOPLE_LOCOMOTION_SERVICE = 'people.locomotion';
export const PEOPLE_HEALTH_SERVICE = 'people.health';
export const PEOPLE_GEAR_SERVICE = 'people.gear';
export const PEOPLE_INTERACTIONS_SERVICE = 'people.interactions';

export interface PlayerControlApi {
  /** Engin télépiloté par le joueur (0 = aucun) : ses commandes pilotent cet engin au lieu du personnage. */
  readonly remoteVehicleId: EntityId;
  setRemoteVehicle(id: EntityId): void;
  /** Mise en place ou retrait du masque à gaz en cours : progression 0..1 (0 = rien en cours). */
  readonly maskProgress: number;
  /** Facteur de champ de vision dû à la visière (0,85) et au masque (0,7) ; 1 = normal. Pour la caméra. */
  readonly fovScale: number;
  /** La bascule « accroupi » du joueur est enfoncée. */
  readonly crouching: boolean;
  /** Tourelle servie par le joueur (-1 s'il n'est pas tireur). */
  readonly turretIndex: number;
}

export interface PeopleLocomotionApi {
  /** À bout de souffle : plus de sprint tant que le souffle n'est pas revenu. */
  isWinded(p: Person): boolean;
  /** En l'air (saut ou enjambement). */
  isAirborne(p: Person): boolean;
  /** Masse de l'équipement porté (kg). */
  loadOf(p: Person): number;
  /** Densité de foule autour de la personne (personnes/m²), rafraîchie environ deux fois par seconde. */
  densityAt(p: Person): number;
  /** Compression subie 0..1 (1 = écrasement dangereux). */
  pressureOf(p: Person): number;
  /** Vitesse maximale actuelle (m/s) pour une allure donnée, tous effets compris. */
  speedLimit(p: Person, gait: 0 | 1 | 2): number;
}

export interface PeopleHealthApi {
  /** Rinçage des yeux (sérum physiologique) : la gêne du gaz retombe trois fois plus vite pendant 30 s. */
  rinseEyes(p: Person, byId: EntityId): void;
  /** Éteint une personne en feu (extincteur, couverture). */
  extinguish(p: Person, byId: EntityId): void;
  /** Stabilise une blessure sans rendre de points de vie : elle cesse de s'aggraver. */
  stabilise(p: Person, byId: EntityId): void;
  /** Met à terre pour une durée donnée (0 = jusqu'à ce qu'on la relève). */
  knockDown(p: Person, seconds: number, sourceId: EntityId): void;
  /** Le retour au calme (peur, colère) est-il géré par ce module ? Mettre à false si un autre module s'en charge. */
  psychDecay: boolean;
}

export interface PeopleGearApi {
  /** La personne dispose-t-elle d'un masque à gaz (objet 'masque_gaz' ou masque déjà porté) ? */
  hasMask(p: Person): boolean;
  /** Son casque a-t-il une visière ? */
  hasVisor(p: Person): boolean;
  /** Met ou retire le masque immédiatement (l'IA gère elle-même son délai). false si impossible. */
  setGasMask(p: Person, on: boolean): boolean;
  setVisor(p: Person, down: boolean): boolean;
}

export interface PeopleInteractionsApi {
  /** Options disponibles sur une cible précise (0 = toutes cibles), triées par priorité décroissante. */
  optionsFor(actor: Person, targetId: EntityId, out: InteractionOption[]): number;
  /** Progression 0..1 de l'action en cours (0 si aucune). */
  progress(actor: Person): number;
  /** Nombre d'actions à durée en cours. */
  readonly activeCount: number;
}
