/* =====================================================================================
 * CIRCULATION — types publics du module src/sim/traffic (à importer en `import type`).
 *
 * Services publiés :
 *   ctx.service<TrafficControlApi>(EXT.traffic)   fermeture de rues (interface de src/core/extensions.ts,
 *                                                 implémentée telle quelle) ;
 *   ctx.service<TrafficApi>(TRAFFIC_SERVICE)      réglages, compteurs, feux tricolores, apparition à la
 *                                                 demande d'un automobiliste ou d'un passant (missions).
 *
 * Événements libres émis (ctx.events.onAny) :
 *   'traffic:closed'    ClosureEvent     une rue vient d'être fermée (barrières en cours de pose)
 *   'traffic:barred'    ClosureEvent     le barrage est en place (toutes les barrières posées)
 *   'traffic:opened'    ClosureEvent     une rue est rouverte
 *   'traffic:gate'      GateEvent        un barrage s'ouvre ou se referme pour laisser passer un véhicule
 *   'traffic:motorist'  MotoristEvent    automobiliste bloqué, libéré, en fuite, qui abandonne son véhicule,
 *                                        qui fait demi-tour, qui se gare
 *   'traffic:jam'       JamEvent         un bouchon se forme ou se résorbe (file d'au moins 4 véhicules)
 *
 * Clés lues dans SessionConfig.extra (toutes facultatives) :
 *   options.circulation   'coupee'   périmètre fermé autour du lieu dès le départ (rayon 350 m, barrières
 *                                    déjà en place) ; l'interface le demande aussi par closeArea : sans effet double
 *   traffic.none          boolean    aucune vie civile (ni véhicules, ni stationnement, ni piétons)
 *   traffic.vehicles      number     multiplicateur de la densité de véhicules en circulation (0 = aucun)
 *   traffic.parked        number     multiplicateur du stationnement (0 = rues vides, « enlèvement des véhicules »)
 *   traffic.pedestrians   number     multiplicateur de la densité de piétons civils (0 = aucun)
 *   traffic.closed        {x, z}[]   points de rues fermées dès le départ
 *   traffic.closedArea    {x, z, radius}   périmètre fermé dès le départ
 *   traffic.signals       boolean    false : feux tricolores éteints (priorité aux carrefours seulement)
 *
 * CONVENTIONS
 *   - Un véhicule de la circulation est conduit par le pilote automatique du module des véhicules (service
 *     'vehicles.autopilot') ; ce module ne fait que le RÉGULER : il lui donne sa destination, ou un point
 *     d'arrêt (ligne de feu, carrefour occupé, barrage, bas-côté pour laisser passer une sirène).
 *     Vehicle.brain porte la fiche du véhicule (objet opaque) tant qu'un automobiliste le conduit.
 *   - Un véhicule en stationnement a brain === null, moteur coupé, portes verrouillées ; il n'appartient
 *     plus au module dès qu'on y touche (déplacé, endommagé, incendié, occupé).
 *   - Un piéton civil écrit person.cmd comme toute IA ; person.brain porte sa fiche (objet opaque).
 * ===================================================================================== */

import type { EntityId, Person, PersonKind, Vehicle, VehicleKind } from '@/core/contracts';

export const TRAFFIC_SYSTEM_ID = 'sim:traffic';
export const TRAFFIC_SERVICE = 'traffic';

export const CLOSED_EVENT = 'traffic:closed';
export const BARRED_EVENT = 'traffic:barred';
export const OPENED_EVENT = 'traffic:opened';
export const GATE_EVENT = 'traffic:gate';
export const MOTORIST_EVENT = 'traffic:motorist';
export const JAM_EVENT = 'traffic:jam';

export interface ClosureEvent { id: number; edgeId: number; x: number; z: number; heading: number; squadId: number; byId: EntityId }
export interface GateEvent { id: number; open: boolean; vehicleId: EntityId }
export type MotoristState = 'bloque' | 'libere' | 'fuite' | 'abandon' | 'demi_tour' | 'gare';
export interface MotoristEvent { vehicleId: EntityId; personId: EntityId; state: MotoristState; x: number; z: number }
export interface JamEvent { x: number; z: number; vehicles: number; state: 'forme' | 'resorbe' }

/** Couleur d'un feu pour un sens de circulation. */
export type SignalColor = 'vert' | 'orange' | 'rouge' | 'aucun';

/** Ce qui retient un véhicule de la circulation. */
export type BlockCause = '' | 'feu' | 'carrefour' | 'file' | 'personne' | 'obstacle' | 'fermeture' | 'sirene' | 'mur';

/** État lisible d'un automobiliste (objet stable par véhicule, mis à jour en place). */
export interface MotoristStatus {
  /** 'route' roule vers sa destination ; 'arret' tenu à un point d'arrêt ; 'range' rangé pour une sirène ;
   *  'stationne' en train de se garer ; 'fuite' s'éloigne d'un danger ; 'abandonne' véhicule laissé sur place. */
  mode: 'route' | 'arret' | 'range' | 'stationne' | 'fuite' | 'abandonne';
  cause: BlockCause;
  /** Temps passé immobilisé hors feu rouge (s). */
  blockedFor: number;
  /** Peur du conducteur 0..1. */
  fear: number;
  /** Incident 'automobiliste_bloque' ouvert pour ce véhicule (0 si aucun). */
  incidentId: number;
}

/** Réglages modifiables à chaud ; ils reviennent aux valeurs par défaut à chaque session. */
export interface TrafficTuning {
  /** Vie civile automatique autour du joueur (véhicules, stationnement, piétons). */
  ambient: boolean;
  /** Multiplicateurs de densité (1 = normal). */
  vehicleDensity: number;
  parkedDensity: number;
  pedestrianDensity: number;
  /** Effectifs de référence à midi par temps clair, avant Settings.crowdScale. */
  vehicleBase: number;
  parkedBase: number;
  pedestrianBase: number;
  /** Plafonds absolus (après crowdScale). */
  vehicleMax: number;
  parkedMax: number;
  pedestrianMax: number;
  /** Couronne d'apparition des véhicules autour du joueur (m) et distance de disparition. */
  spawnMin: number;
  spawnMax: number;
  despawn: number;
  /** Rayon du stationnement et couronne d'apparition des piétons (m). */
  parkedRadius: number;
  pedSpawnMin: number;
  pedSpawnMax: number;
  pedDespawn: number;
  /** Feux tricolores en service. */
  signals: boolean;
  /** Durées d'un feu (s) : vert de l'axe principal, vert de l'axe secondaire, orange, rouge de dégagement. */
  greenMain: number;
  greenCross: number;
  amber: number;
  allRed: number;
  /** Pose d'un barrage : délai avant la première barrière et durée totale (s) ; 0 = immédiat. */
  barrierDelay: number;
  barrierTime: number;
  /** Patience moyenne d'un automobiliste arrêté par une foule ou un barrage (s). */
  patience: number;
  /** Part des automobilistes qui se garent en arrivant. */
  parkShare: number;
  /** Les automobilistes pris dans une émeute prennent peur (fuite, abandon du véhicule). */
  panic: boolean;
  /** Incidents 'automobiliste_bloque' déclarés au service EXT.incidents. */
  incidents: boolean;
  /** Comptes rendus radio des fermetures et réouvertures. */
  radio: boolean;
}

export interface TrafficStats {
  /** Véhicules de la circulation (avec conducteur), dont à l'arrêt hors feu rouge. */
  vehicles: number;
  blocked: number;
  parked: number;
  abandoned: number;
  pedestrians: number;
  fleeing: number;
  /** Effectifs visés à cet instant. */
  vehicleTarget: number;
  pedestrianTarget: number;
  closures: number;
  /** Compteurs de session. */
  spawned: number;
  despawned: number;
  reroutes: number;
  uturns: number;
  honks: number;
  abandons: number;
  incidents: number;
}

export interface TrafficApi {
  readonly tuning: TrafficTuning;
  readonly stats: Readonly<TrafficStats>;
  /**
   * Couleur du feu au nœud `nodeId` pour un véhicule qui y arrive avec le cap `heading` ('aucun' sans feu).
   * Sert au rendu des feux tricolores et aux autres IA de conduite.
   */
  signal(nodeId: number, heading: number): SignalColor;
  /** Couleur du feu rencontré par un véhicule placé en (x, z) et roulant selon `heading`, dans les `range` m devant lui. */
  signalAhead(x: number, z: number, heading: number, range?: number): SignalColor;
  /** Un piéton peut-il traverser maintenant la rue de cap `streetHeading` au nœud donné ? */
  pedestrianGreen(nodeId: number, streetHeading: number): boolean;
  /** Fait apparaître un automobiliste qui se rend au point donné par les rues. null si impossible. */
  spawnVehicle(kind: VehicleKind, x: number, z: number, heading: number, destX: number, destZ: number): Vehicle | null;
  /** Fait apparaître un véhicule en stationnement (verrouillé, moteur coupé). */
  spawnParked(kind: VehicleKind, x: number, z: number, heading: number): Vehicle;
  /** Fait apparaître un piéton civil sur le trottoir le plus proche. null si aucune rue à proximité. */
  spawnPedestrian(kind: PersonKind, x: number, z: number): Person | null;
  /** État d'un véhicule de la circulation ; null s'il n'en fait pas partie. */
  motorist(v: Vehicle): Readonly<MotoristStatus> | null;
  /** Le véhicule est-il géré par ce module (circulation ou stationnement) ? */
  isTraffic(v: Vehicle): boolean;
  isParked(v: Vehicle): boolean;
  /** La personne est-elle un piéton civil de ce module ? */
  isPedestrian(p: Person): boolean;
  /** Retire toute la vie civile de ce module (les fermetures de rues restent). */
  clearAmbient(): void;
}
