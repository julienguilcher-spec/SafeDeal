/* =====================================================================================
 * VÉHICULES (simulation) — types publics du module src/sim/vehicles.
 *
 * Les autres modules passent par ctx.vehicles (VehicleApi du contrat). Ce fichier décrit ce que le
 * module publie EN PLUS (`import type` autorisé depuis ce fichier, jamais depuis le reste du dossier) :
 *
 *   ctx.service<AutopilotApi>('vehicles.autopilot')   pilote automatique réutilisable (trafic, convois,
 *                                                     secours, colonnes de fourgons, stationnement) ;
 *   ctx.service<VehiclesExtApi>('vehicles.ext')       tourelles (visée d'un point, salve, mode de jet,
 *                                                     rechargement, ravitaillement), feux et sirènes,
 *                                                     incendie, retournement, vol, règles d'accès.
 *
 * CONVENTIONS (à connaître pour le rendu et les contrôleurs) :
 *   - Vehicle.y          véhicule terrestre : altitude du sol sous lui ; engin volant : altitude de l'appareil ;
 *   - Vehicle.speed      vitesse longitudinale signée (m/s), négative en marche arrière ;
 *   - Vehicle.yawRate    d(heading)/dt (rad/s) : POSITIF = le véhicule tourne à GAUCHE ;
 *   - Vehicle.steerAngle braquage réel des roues (rad) : POSITIF = roues braquées à DROITE (comme
 *                        cmd.steer). Côté rendu (rotation.y = cap) : roue.rotation.y = −steerAngle ;
 *   - Vehicle.pitch      POSITIF = nez relevé (montée, accélération) ;
 *   - Vehicle.roll       POSITIF = le véhicule penche à DROITE (côté droit plus bas). Une voiture qui
 *                        vire à gauche prend du roulis positif ; une moto, elle, penche dans le virage ;
 *   - Vehicle.rpm        tours par minute réels (ralenti … régime maximal du type de moteur) ;
 *   - Vehicle.gear       −1 marche arrière, 0 point mort (moteur coupé, ou personne aux commandes), 1…n ;
 *   - turretYaw          gisement dans le repère du véhicule, POSITIF = vers la DROITE (comme steerAngle
 *                        et cmd.steer) : cap monde de la tourelle = heading − turretYaw. Côté rendu :
 *                        tourelle.rotation.y = −turretYaw. turretPitch positif = canon levé ;
 *   - turretAmmo         tubes chargés (lance-grenades) ou litres d'eau. Les deux canons de l'engin
 *                        lanceur d'eau puisent dans LA MÊME cuve : leurs deux compteurs sont égaux ;
 *   - tourelle ↔ siège   la n-ième place de tireur (SeatRole 'gunner') sert la n-ième tourelle armée ;
 *                        la caméra du mât du Centaure revient au chef d'engin (voir turretOfSeat) ;
 *   - occupant assis     Person.y = Vehicle.y + SeatDef.y − SEAT_FEET_DROP (SeatDef.y = hauteur de
 *                        l'assise) ; posture 'seated', haut du corps 'drive' (conducteur) ou 'ride' ;
 *   - DamageInfo.knockback (jet d'eau, choc) est une vitesse de recul en m/s ; dirX / dirZ en donnent le sens.
 *
 * QUI CONDUIT ? Un véhicule terrestre n'obéit à Vehicle.cmd que si quelqu'un est aux commandes : un
 * occupant au siège conducteur, le pilote automatique de ce module, ou un autre module qui pilote par cmd
 * et le signale en posant Vehicle.brain (non nul). Sinon il reste frein serré. Un engin volant obéit à
 * cmd en mode « manuel » : throttle = avance, strafe = latéral (1 = droite), lift = vertical, steer = lacet.
 *
 * TOURELLES. Un contrôleur peut écrire turretYaw / turretPitch pas à pas (ils sont bornés et limités à la
 * vitesse de pointage), ou appeler aimTurret (angles) / aimTurretAt (point du monde). fireTurret tire dans
 * l'orientation courante : une salve de setSalvo() coups pour le lance-grenades ; pour un canon à eau,
 * l'appel doit être répété à chaque pas (au moins cinq fois par seconde) tant que la détente est tenue.
 *
 * ÉVÉNEMENTS LIBRES (ctx.events.onAny) :
 *   'drone:toggle'         { personId }                      ÉCOUTÉ : déploie ou rappelle le drone du télépilote
 *   'hazards:douse'        { x, z, radius, amount }          ÉCOUTÉ : l'eau éteint les véhicules en feu touchés
 *   'vehicles:drone'       DroneEvent                        décollage, rappel, batterie faible, posé, perdu
 *   'vehicles:flipped'     { id, x, z, byId }                véhicule retourné par un groupe
 *   'vehicles:cleared'     { vehicleId, propId, x, z }       obstacle dégagé à la lame
 *   'vehicles:service'     ServiceEvent                      rechargement / ravitaillement commencé, fini, interrompu
 *   'vehicles:lights'      { id, beacons, headlights, indicator }
 *   'vehicles:autopilot'   { id, state, reason }             changement d'état du pilote automatique
 * ===================================================================================== */

import type { EntityId, Person, ProjectileKind, Vec3, Vehicle, VehicleKind } from '@/core/contracts';

export const VEHICLES_SYSTEM_ID = 'sim:vehicles';
export const AUTOPILOT_SERVICE = 'vehicles.autopilot';
export const VEHICLES_EXT_SERVICE = 'vehicles.ext';
/** Service facultatif du contrôleur du joueur : { setRemoteVehicle(id) }. */
export const PLAYER_CONTROL_SERVICE = 'player.control';
/** Service facultatif du module des objets : { projectileSpec(kind) → { drag } }. */
export const ITEMS_SERVICE = 'items';

export const DRONE_TOGGLE_EVENT = 'drone:toggle';
export const DOUSE_EVENT = 'hazards:douse';
export const DRONE_EVENT = 'vehicles:drone';
export const FLIPPED_EVENT = 'vehicles:flipped';
export const CLEARED_EVENT = 'vehicles:cleared';
export const SERVICE_EVENT = 'vehicles:service';
export const LIGHTS_EVENT = 'vehicles:lights';
export const AUTOPILOT_EVENT = 'vehicles:autopilot';

/** Les pieds d'un occupant sont à cette distance sous l'assise (m). */
export const SEAT_FEET_DROP = 0.42;
/** Pesanteur utilisée par la conduite et par la balistique des tourelles (m/s²). */
export const GRAVITY = 9.81;

// ───────────────────────────── caractéristiques hors contrat ─────────────────────────────

export interface EngineSpec {
  /** Puissance massique (W/kg) : au-delà de accel × vitesse, l'accélération décroît en 1/v. */
  power: number;
  idle: number;
  redline: number;
  /** Nombre de rapports de la boîte automatique (1 = variateur). */
  gears: number;
  /** Essieu moteur. */
  drive: 'av' | 'ar' | '4x4';
  /** Frein moteur, pied levé (m/s²). */
  engineBrake: number;
  /** Moteur électrique (drone) : pas de carburant, pas d'explosion. */
  electric: boolean;
}

export interface HandlingSpec {
  /** Coefficient d'adhérence des pneus (1 = voiture ; poids lourds plus bas). */
  grip: number;
  /** Rigidité de dérive rapportée à la charge (1/rad). */
  stiffness: number;
  /** Surcroît d'adhérence de l'essieu arrière (> 1 = véhicule sous-vireur, donc sûr). */
  rearBias: number;
  /** Part du poids sur l'essieu avant, à l'arrêt. */
  frontWeight: number;
  /** Hauteur du centre de gravité (m) : transfert de charge. */
  cgHeight: number;
  /** Vitesse à laquelle le braquage utile est divisé par deux (m/s). */
  steerSpeed: number;
  /** Deux-roues : penche dans le virage. */
  twoWheels: boolean;
  /** Roulis (rad par m/s² d'accélération latérale) et tangage (rad par m/s² longitudinal). */
  rollGain: number;
  pitchGain: number;
}

export interface FireSpec {
  /** Dégâts de brûlure cumulés qui embrasent le véhicule. */
  ignition: number;
  /** Secondes passées dans un feu vif (intensité 1) avant embrasement. */
  igniteTime: number;
  /** Durée de l'embrasement complet (s), tirée entre ces deux bornes. */
  spreadMin: number;
  spreadMax: number;
  /** Durée du feu une fois complet (s). */
  burnMin: number;
  burnMax: number;
  /** Probabilité d'explosion du réservoir pendant l'incendie. */
  explosion: number;
  /** Rayon de l'explosion (m). */
  blastRadius: number;
}

export type JetMode = 'droit' | 'diffus' | 'pluie';

export interface JetSpec {
  /** Débit en jet droit (l/s) ; diffusé et pluie en consomment moins. */
  flow: number;
  /** Vitesse efficace de sortie du jet droit (m/s) : fixe la portée. */
  speed: number;
  /** Portée maximale et portée utile en jet droit (m). */
  range: number;
  useful: number;
  /** Durée d'un plein (s). */
  refill: number;
  /** Agent extincteur déposé par seconde de jet (1 = une seconde d'extincteur portatif). */
  douse: number;
  /** Lance de pompiers : jamais un moyen de force (aucune déclaration, recul réduit). */
  rescue: boolean;
}

export interface LauncherSpec {
  projectile: ProjectileKind;
  /** Portées des dispositifs de propulsion (m), de la plus courte à la plus longue. */
  ranges: readonly number[];
  /** Tubes de rechange emportés. */
  reserve: number;
  /** Durée d'un rechargement complet, à l'arrêt (s). */
  reloadTime: number;
  /** Largeur de la nappe à l'arrivée pour 1 coup et pour une salve complète (m). */
  spreadOne: number;
  spreadFull: number;
}

export interface FlightSpec {
  type: 'drone' | 'helico';
  /** Vitesses verticales maximales (m/s). */
  climb: number;
  descent: number;
  /** Accélération horizontale (m/s²) et vitesse de lacet (rad/s). */
  accel: number;
  yawRate: number;
  /** Plafond et plancher au-dessus du sol (m). */
  ceiling: number;
  floor: number;
  /** Autonomie (s) ; 0 = illimitée (hélicoptère). */
  battery: number;
  /** Altitude prise au décollage automatique (m au-dessus du sol). */
  cruise: number;
}

/** Caractéristiques d'un type de véhicule qui ne figurent pas dans VehicleDef. */
export interface VehicleSpec {
  kind: VehicleKind;
  engine: EngineSpec;
  handling: HandlingSpec;
  fire: FireSpec;
  /** Multiplicateur des dégâts reçus (blindage, robustesse). */
  toughness: number;
  /** Peut être retourné par un groupe. */
  flippable: boolean;
  /** Durée pour monter ou descendre (s). */
  boardTime: number;
  /** Tourelle commandée depuis chaque siège (−1 = aucune), même longueur que VehicleDef.seats. */
  seatTurret: readonly number[];
  /** Paramètres par tourelle (même longueur que VehicleDef.turrets). */
  jets: readonly (JetSpec | null)[];
  launchers: readonly (LauncherSpec | null)[];
  flight: FlightSpec | null;
  /** Lame : masse immobilisée la plus lourde qu'elle déplace (kg) ; 0 sans lame. */
  pushMass: number;
  /** Course du mât de caméra (m) ; 0 sans mât. */
  mast: number;
}

/** Réglages modifiables en cours de partie (tests, options). */
export interface VehicleTuning {
  /** Accélère tous les incendies de véhicules (1 = durées réalistes). */
  fireTimeScale: number;
  /** Multiplicateur de la probabilité d'explosion (0 = jamais). */
  explosionChance: number;
  /** Multiplicateur des dégâts de collision. */
  crashDamage: number;
  /** Nombre de personnes et durée de référence pour retourner une voiture. */
  flipPeople: number;
  flipSeconds: number;
  /** Dispersion des tirs de tourelle (0 = parfaits). */
  dispersion: number;
}

// ───────────────────────────── pilote automatique ─────────────────────────────

export interface DriveOptions {
  /** Vitesse de croisière voulue (m/s). Par défaut : limite de la voie (30 km/h si inconnue). */
  speed?: number;
  /** Intervention urgente : sirène et feux, allure plus vive, fermetures de rues franchies. */
  urgence?: boolean;
  /** S'arrêter cette distance (m) avant la destination. */
  stopBefore?: number;
  /** Engin à lame : pousser objets et épaves au lieu de s'arrêter devant. */
  pushThrough?: boolean;
  /**
   * Rouler au bord droit de la chaussée : distance (m) entre le flanc droit et la bordure (cycliste). Par défaut,
   * au milieu de la voie de droite.
   */
  kerb?: number;
  /**
   * Le véhicule roule déjà sur sa voie (circulation) : l'itinéraire part de l'axe de la rue à sa hauteur et le
   * décalage de voie part de son écart réel à l'axe, au lieu de partir de sa position (ce qui le ferait dériver
   * vers le trottoir jusqu'au carrefour suivant). Par défaut false.
   */
  inLane?: boolean;
  /**
   * Zones à contourner si possible (foule, manifestation) : l'itinéraire évite les voies qui y passent, sauf s'il n'y a
   * pas d'autre chemin raisonnable. Gardées pour les nouveaux itinéraires du même trajet.
   */
  avoid?: readonly { x: number; z: number; r: number; cost?: number }[];
}

export interface ConvoyOptions extends DriveOptions {
  /** Intervalle entre deux véhicules, pare-chocs à pare-chocs (m). Défaut 6. */
  gap?: number;
}

export type AutopilotMode = 'idle' | 'drive' | 'follow' | 'park' | 'stop';
export type AutopilotState = 'repos' | 'en_route' | 'manoeuvre' | 'attente' | 'bloque' | 'arrive' | 'echec';
export type AutopilotReason =
  | '' | 'personne' | 'vehicule' | 'obstacle' | 'fermeture' | 'mur' | 'sans_itineraire' | 'hors_service' | 'meneur_perdu';
export type ParkLayout = 'bataille' | 'epi' | 'file';

/** État lisible du pilote automatique d'un véhicule (objet stable par véhicule, mis à jour en place). */
export interface AutopilotStatus {
  mode: AutopilotMode;
  state: AutopilotState;
  reason: AutopilotReason;
  /** Distance restant à parcourir le long de l'itinéraire (m). */
  remaining: number;
  /** Vitesse visée à cet instant (m/s). */
  targetSpeed: number;
  /** Temps passé arrêté devant un obstacle (s). */
  blockedFor: number;
  /** Meneur suivi (véhicule ou personne), 0 sinon. */
  leaderId: EntityId;
  urgence: boolean;
}

export interface AutopilotApi {
  /** Conduit le véhicule jusqu'au point par les rues (ctx.world.findPath, mode 'vehicle'). false si impossible. */
  driveTo(v: Vehicle, x: number, z: number, options?: DriveOptions): boolean;
  /** Suit un meneur (véhicule ou personne) sur sa trace ; `distance` = intervalle entre mon pare-chocs et lui (m, défaut 6). */
  follow(v: Vehicle, leaderId: EntityId, distance?: number): boolean;
  /** Colonne : le premier conduit jusqu'au point, les autres suivent à intervalle régulier et s'arrêtent alignés. */
  convoy(list: readonly Vehicle[], x: number, z: number, options?: ConvoyOptions): boolean;
  /** Se gare au point donné, dans le cap donné (manœuvre d'approche, d'alignement et de reprise). */
  park(v: Vehicle, x: number, z: number, heading: number): boolean;
  /** Stationnement aligné de plusieurs véhicules autour du point : en bataille, en épi ou en file. */
  parkRow(list: readonly Vehicle[], x: number, z: number, heading: number, layout?: ParkLayout, spacing?: number): boolean;
  /**
   * Nouvel itinéraire vers la même destination depuis la position et le cap actuels (conduite ou suivi en cours),
   * sans rien changer d'autre : allure, urgence, place dans la colonne. false si impossible (l'ancien est gardé).
   */
  reroute?(v: Vehicle, pushThrough?: boolean, avoid?: DriveOptions['avoid']): boolean;
  /** Arrête le véhicule et rend la main. */
  stop(v: Vehicle): void;
  status(v: Vehicle): Readonly<AutopilotStatus>;
  isActive(v: Vehicle): boolean;
}

// ───────────────────────────── service étendu ─────────────────────────────

export interface TurretStatus {
  kind: 'lance_grenades' | 'canon_eau' | 'camera';
  ammo: number;
  capacity: number;
  /** Tubes de rechange (lance-grenades). */
  reserve: number;
  /** Avancement du rechargement ou du ravitaillement 0..1 ; −1 si aucun en cours. */
  service: number;
  /** Jet en cours (canon à eau) ou salve en cours (lance-grenades). */
  firing: boolean;
  /** Nombre de coups de la prochaine salve, et coups restant à partir dans la salve en cours. */
  salvo: number;
  queued: number;
  mode: JetMode;
  /** Un point est désigné, et il est atteignable. */
  hasTarget: boolean;
  inRange: boolean;
  targetX: number;
  targetZ: number;
  /** Mât de caméra : déploiement 0..1. */
  mast: number;
}

export type DroneEventState = 'decollage' | 'rappel' | 'batterie_faible' | 'pose' | 'perdu';
export interface DroneEvent { vehicleId: EntityId; personId: EntityId; state: DroneEventState }
export interface ServiceEvent { id: EntityId; turret: number; type: 'rechargement' | 'ravitaillement'; state: 'debut' | 'fin' | 'interrompu' }

export type FlightMode = 'pose' | 'decollage' | 'manuel' | 'aller' | 'orbite' | 'retour' | 'atterrissage' | 'chute';

export interface FlightStatus {
  mode: FlightMode;
  /** Hauteur au-dessus du sol (m). */
  altitude: number;
  /** Batterie 0..1 (1 pour un engin sans batterie). */
  battery: number;
  /** Secondes de vol restantes (Infinity sans batterie). */
  secondsLeft: number;
  pilotId: EntityId;
  /** Distance au point de retour (m). */
  homeDistance: number;
}

/** Grandeurs de conduite en lecture seule (tableau de bord, effets, IA). */
export interface VehicleDynamics {
  /** Vitesse de glissement latéral (m/s, positif vers la gauche) et angle de dérive (rad). */
  lateralSpeed: number;
  slipAngle: number;
  /** Accélérations longitudinale et latérale de la caisse (m/s²). */
  accelLong: number;
  accelLat: number;
  /** Adhérence courante du sol (coefficient). */
  grip: number;
  /** 0..1 : les pneus glissent (dérapage, blocage). */
  skid: number;
  /** Endormi : à l'arrêt, sans commande (ne coûte rien). */
  asleep: boolean;
}

export interface VehiclesExtApi {
  readonly tuning: VehicleTuning;
  spec(kind: VehicleKind): Readonly<VehicleSpec>;
  dynamics(v: Vehicle): Readonly<VehicleDynamics>;

  // ── accès, sièges, moteur ──
  /** La personne a-t-elle le droit de monter (verrou, véhicule de police, état) ? */
  canBoard(p: Person, v: Vehicle): boolean;
  canDrive(p: Person, v: Vehicle): boolean;
  /** Siège que prendrait cette personne (porte la plus proche et rôle), −1 si aucun. */
  chooseSeat(p: Person, v: Vehicle): number;
  driverOf(v: Vehicle): Person | null;
  /** Tourelle commandée depuis un siège (−1 si aucune), et inversement. */
  turretOfSeat(v: Vehicle, seat: number): number;
  seatOfTurret(v: Vehicle, turret: number): number;
  /** Ouverture de la porte associée à un siège 0..1 (pour le rendu). */
  doorOpen(v: Vehicle, seat: number): number;
  setLocked(v: Vehicle, locked: boolean): void;
  /** Met le moteur en marche ou le coupe. false si impossible (épave, incendie). */
  setEngine(v: Vehicle, on: boolean): boolean;

  // ── tourelles ──
  /** Oriente la tourelle (repère véhicule, bornée par TurretDef) et oublie le point désigné. */
  aimTurret(v: Vehicle, turret: number, yaw: number, pitch: number): void;
  /**
   * Désigne un point du monde : la tourelle se pointe d'elle-même (balistique en cloche pour le
   * lance-grenades, trajectoire du jet pour le canon) et le suit tant que le véhicule bouge.
   * false si le point est hors de portée ou hors du débattement.
   */
  aimTurretAt(v: Vehicle, turret: number, x: number, y: number, z: number): boolean;
  clearTurretTarget(v: Vehicle, turret: number): void;
  /** Nombre de coups de la prochaine salve (1 à la capacité) ; retourne la valeur retenue. */
  setSalvo(v: Vehicle, turret: number, count: number): number;
  setJetMode(v: Vehicle, turret: number, mode: JetMode): void;
  turretStatus(v: Vehicle, turret: number): Readonly<TurretStatus>;
  /** Point de chute prévu pour l'orientation courante (sol plat à l'altitude du véhicule). */
  predictImpact(v: Vehicle, turret: number, out: Vec3): boolean;
  /** Rechargement du lance-grenades : à l'arrêt seulement. */
  reloadTurret(v: Vehicle, turret: number): boolean;
  /** Plein d'eau : à l'arrêt seulement. */
  refill(v: Vehicle): boolean;
  /** Lève ou rentre le mât de caméra. */
  setMast(v: Vehicle, raised: boolean): void;

  // ── feux, sirène, klaxon ──
  setSiren(v: Vehicle, mode: 0 | 1 | 2): void;
  /** Cycle éteinte → deux-tons → variante → éteinte. */
  cycleSiren(v: Vehicle): void;
  setBeacons(v: Vehicle, on: boolean): void;
  /** Phares : true / false, ou 'auto' (allumés la nuit et par mauvaise visibilité quand le moteur tourne). */
  setHeadlights(v: Vehicle, on: boolean | 'auto'): void;
  setIndicator(v: Vehicle, side: -1 | 0 | 1): void;
  /** Coup de klaxon d'une durée donnée (s). */
  horn(v: Vehicle, seconds?: number): void;

  // ── incendie, dégâts ──
  /** Met le feu au véhicule (cocktail Molotov, propagation). false s'il ne peut plus brûler. */
  ignite(v: Vehicle, sourceId: EntityId, intensity?: number): boolean;
  /** Dépose de l'agent extincteur (1 = une seconde d'extincteur portatif). */
  extinguish(v: Vehicle, amount: number, byId: EntityId): void;
  explode(v: Vehicle, sourceId: EntityId): void;
  /** Retourne immédiatement le véhicule (script de mission). */
  flip(v: Vehicle, byId?: EntityId): boolean;
  isFlipped(v: Vehicle): boolean;
  /** Avancement du retournement par un groupe 0..1. */
  flipProgress(v: Vehicle): number;

  // ── engins volants ──
  /** Déploie le drone du télépilote (ou renvoie celui déjà en vol). */
  deployDrone(pilot: Person): Vehicle | null;
  recallDrone(pilot: Person): boolean;
  droneOf(personId: EntityId): Vehicle | null;
  flightStatus(v: Vehicle): Readonly<FlightStatus> | null;
  takeOff(v: Vehicle, altitude?: number): boolean;
  /** Vol automatique vers un point, à une hauteur donnée au-dessus du sol. */
  flyTo(v: Vehicle, x: number, z: number, altitude?: number): boolean;
  /** Orbite autour d'un point (sens horaire vu du ciel si speed > 0). */
  orbit(v: Vehicle, cx: number, cz: number, radius: number, altitude?: number, speed?: number): boolean;
  /** Retour au point de départ et atterrissage. */
  land(v: Vehicle): boolean;
}
