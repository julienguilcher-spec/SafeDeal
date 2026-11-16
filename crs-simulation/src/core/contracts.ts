/* =====================================================================================
 * CRS SIMULATION FRANCE — CONTRATS INTER-MODULES
 * -------------------------------------------------------------------------------------
 * Ce fichier est la source de vérité des données et services partagés entre modules.
 * Règles :
 *   - Un module n'importe JAMAIS l'implémentation d'un autre module : il dépend de ce
 *     fichier (types) et des utilitaires de src/core/.
 *   - Tout ce qui est « simulation » (src/sim, src/gameplay, src/world/query, src/core)
 *     ne touche ni au DOM ni à Three.js à l'exécution : cela doit tourner sous Node (vitest).
 *   - Unités : mètres, secondes, radians, kilogrammes. Couleurs : entiers 0xRRGGBB.
 *   - Repère : x = est, z = sud, y = haut. Cap h : vecteur avant = (sin h, cos h) en (x, z).
 *   - Pas d'enum TypeScript : unions de chaînes littérales.
 *   - Ce fichier n'est modifié que par l'intégrateur. Pour étendre : voir GameContext.provide().
 * ===================================================================================== */

import type * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────────────
// 1. Bases
// ─────────────────────────────────────────────────────────────────────────────────────

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

/** Identifiant d'entité (> 0). 0 = aucune. Unique toutes catégories confondues pendant une session. */
export type EntityId = number;
export const NO_ENTITY: EntityId = 0;

export type EntityKind = 'person' | 'vehicle' | 'prop' | 'projectile' | 'shop' | 'place';

/** Chaîne ouverte avec autocomplétion sur les valeurs connues. */
export type Open<T extends string> = T | (string & {});

// ─────────────────────────────────────────────────────────────────────────────────────
// 2. Personnes
// ─────────────────────────────────────────────────────────────────────────────────────

export type Faction = 'police' | 'protest' | 'civil' | 'press' | 'medic' | 'rescue';

export type PersonKind =
  // forces de l'ordre
  | 'crs' | 'commissaire' | 'bravm' | 'gendarme' | 'policier_civil' | 'telepilote'
  // secours officiels
  | 'pompier' | 'samu'
  // cortège et abords
  | 'manifestant' | 'street_medic' | 'journaliste' | 'observateur'
  // civils
  | 'passant' | 'touriste' | 'commercant' | 'conducteur' | 'vip';

/** Profil comportemental d'un manifestant (peut évoluer en cours de mission : radicalisation). */
export type ProtestProfile =
  | 'pacifique' | 'famille' | 'militant' | 'service_ordre' | 'meneur'
  | 'opportuniste' | 'radical' | 'pilleur';

export type PoliceRank =
  | 'gardien_stagiaire' | 'gardien' | 'brigadier' | 'brigadier_chef' | 'major'
  | 'capitaine' | 'commandant' | 'commissaire';

/** Poste tenu dans l'unité (détermine l'équipement et le comportement de l'IA). */
export type PolicePoste =
  | 'bouclier' | 'lanceur' | 'lbd' | 'extincteur' | 'interpellation' | 'conducteur'
  | 'operateur' | 'chef_groupe' | 'chef_section' | 'commandant_unite' | 'autorite_civile'
  | 'pilote_moto' | 'passager_moto' | 'telepilote';

export type Posture = 'stand' | 'crouch' | 'kneel' | 'sit' | 'prone' | 'down' | 'seated';

/** Animation du haut du corps (les jambes se déduisent de la vitesse et de la posture). */
export type UpperAnim = Open<
  | 'none' | 'throw' | 'strike' | 'block' | 'shield_carry' | 'aim_long' | 'aim_pistol' | 'spray'
  | 'megaphone' | 'radio' | 'hands_up' | 'fist' | 'clap' | 'carry_sign' | 'carry_banner'
  | 'film' | 'photo' | 'treat' | 'carry_person' | 'drag' | 'pickup' | 'push' | 'cover_face'
  | 'cuffed' | 'umbrella' | 'point' | 'wave' | 'drive' | 'ride' | 'kick' | 'hammer'
  | 'spraypaint' | 'carry_loot' | 'extinguish' | 'remote' | 'cough' | 'restrain'
>;

export type InjuryLevel = 'none' | 'light' | 'serious' | 'critical' | 'dead';

export type OutfitId = Open<
  | 'civil' | 'crs_mo' | 'crs_service' | 'gendarme_mo' | 'bravm' | 'police_civil' | 'commissaire'
  | 'pompier' | 'samu' | 'black_bloc' | 'gilet_fluo' | 'syndical' | 'street_medic' | 'presse'
  | 'observateur' | 'costume' | 'sport'
>;

export type HeadgearId = Open<
  | 'none' | 'casque_crs' | 'casque_gendarme' | 'casque_moto' | 'casque_presse' | 'casque_medic'
  | 'casque_pompier' | 'capuche' | 'casquette' | 'bonnet' | 'cagoule' | 'calot' | 'casquette_police'
>;

/** Apparence — lue par le rendu des personnages. Les champs non compris sont ignorés. */
export interface PersonLook {
  height: number;            // taille en m (1.50 – 1.98)
  build: number;             // carrure (0.85 – 1.25)
  skin: number;
  hair: number;
  hairStyle: number;         // 0 = rasé … n
  top: number;               // couleur du haut
  bottom: number;            // couleur du bas
  shoes: number;
  outfit: OutfitId;
  headgear: HeadgearId;
  visorDown: boolean;
  gasMask: boolean;
  faceCover: boolean;        // foulard / masque
  backText: Open<'' | 'POLICE' | 'CRS' | 'GENDARMERIE' | 'PRESSE' | 'SAMU' | 'SECOURS' | 'OBSERVATEUR'>;
  sash: boolean;             // écharpe tricolore (autorité habilitée)
  armband: number;           // couleur du brassard, 0 = aucun
  vest: number;              // couleur de chasuble / gilet par-dessus, 0 = aucun
  rankBars: number;          // nombre de galons affichés
  backpack: boolean;
  /** Variantes supplémentaires libres (ex. numéro de compagnie, badge). */
  extras?: Record<string, number>;
}

export interface ItemStack {
  id: ItemId;
  /** Quantité / munitions / charges restantes. */
  count: number;
  /** État 0..1 (usure, pression de la gazeuse, batterie…). */
  state: number;
  /** Temps restant avant réutilisation (s). */
  cooldown: number;
}

/** Commande continue écrite par le contrôleur (joueur ou IA), consommée par la locomotion. */
export interface PersonCommand {
  /** Direction de déplacement voulue dans le repère monde, norme 0..1. */
  moveX: number;
  moveZ: number;
  /** 0 = marche, 1 = course, 2 = sprint. */
  gait: 0 | 1 | 2;
  /** Visée voulue (cap et site, radians). */
  aimYaw: number;
  aimPitch: number;
  /** Le corps s'oriente selon le déplacement (true) ou selon la visée (false). */
  faceMove: boolean;
  crouch: boolean;
  jump: boolean;
}

export interface Offense {
  type: OffenseType;
  /** Instant (temps de session, s). */
  t: number;
  x: number;
  z: number;
  /** Gravité 1 (contravention) … 5 (crime). */
  severity: number;
  /** Vu par les forces de l'ordre (flagrant délit exploitable). */
  witnessed: boolean;
  /** Filmé (drone, caméra-piéton, journaliste) : preuve solide. */
  filmed: boolean;
}

export type OffenseType = Open<
  | 'attroupement_apres_sommations' | 'dissimulation_visage' | 'jet_projectile' | 'violence_agent'
  | 'degradation' | 'tag' | 'incendie' | 'pillage' | 'recel' | 'barricade' | 'port_arme'
  | 'rebellion' | 'outrage' | 'entrave_circulation' | 'violence' | 'intrusion'
>;

export type CustodyState = 'free' | 'held' | 'cuffed' | 'escorted' | 'in_vehicle' | 'handed_over';

export interface Person {
  readonly id: EntityId;
  kind: PersonKind;
  faction: Faction;
  /** Nom affichable (fictif) ou indicatif. */
  name: string;

  // ── cinématique (écrite par la locomotion ; les autres lisent) ──
  x: number;
  z: number;
  y: number;                 // altitude des pieds
  vx: number;
  vz: number;
  heading: number;           // orientation du corps
  aimYaw: number;            // direction du regard / de la visée
  aimPitch: number;
  radius: number;            // rayon de collision (≈ 0.28)
  /** Vitesses maximales (m/s) : marche, course, sprint — modulées par charge, blessures, gaz. */
  speedWalk: number;
  speedRun: number;
  speedSprint: number;

  // ── état physique ──
  health: number;            // 0..100
  injury: InjuryLevel;
  stamina: number;           // 0..100
  /** Exposition au gaz lacrymogène 0..1 (monte dans le nuage, redescend à l'air libre). */
  gas: number;
  /** Secondes restantes d'étourdissement / aveuglement. */
  stun: number;
  /** 0..1 : la personne brûle. */
  burning: number;
  /** 0..1 : trempée (canon à eau, pluie). */
  wet: number;
  posture: Posture;
  upper: UpperAnim;
  upperT: number;            // temps écoulé dans l'animation du haut du corps (s)
  /** Niveau de protection 0..1 par zone (casque, gilet, masque). */
  armorHead: number;
  armorBody: number;
  gasProtection: number;

  // ── psychologie (surtout foule, mais valable pour tous) ──
  fear: number;              // 0..1
  anger: number;             // 0..1
  profile: ProtestProfile | null;

  // ── police ──
  rank: PoliceRank | null;
  poste: PolicePoste | null;
  /** Matricule RIO affiché (police). */
  rio: string;

  // ── équipement ──
  inventory: ItemStack[];
  /** Index de l'objet en main dans inventory, -1 = mains nues. */
  active: number;
  /** Mode secondaire actif (bouclier levé, visée épaulée…). */
  alt: boolean;
  look: PersonLook;

  // ── liens ──
  squadId: number;           // 0 = aucun
  vehicleId: EntityId;       // 0 = à pied
  seat: number;              // index de siège, -1 = aucun
  /** Entité portée / traînée / tenue (personne interpellée, blessé, objet). */
  carrying: EntityId;
  /** Personne qui me tient / me porte. */
  heldBy: EntityId;

  // ── droit ──
  offenses: Offense[];
  custody: CustodyState;

  // ── contrôle ──
  /** true si cette personne est incarnée par le joueur. */
  isPlayer: boolean;
  cmd: PersonCommand;
  /** Mémoire privée de l'IA qui pilote cette personne (opaque pour les autres modules). */
  brain: unknown;
  /** Drapeau de désactivation (hors zone simulée) : la personne n'est ni mise à jour ni rendue. */
  dormant: boolean;
}

export interface PersonInit {
  kind: PersonKind;
  faction?: Faction;
  x: number;
  z: number;
  heading?: number;
  name?: string;
  profile?: ProtestProfile | null;
  rank?: PoliceRank | null;
  poste?: PolicePoste | null;
  look?: Partial<PersonLook>;
  inventory?: ItemStack[];
  squadId?: number;
  /** Graine pour varier apparence et caractère de façon déterministe. */
  seed?: number;
}

export interface PeopleStore {
  /** Personnes actives (tableau dense, ordre non garanti). Ne pas conserver entre deux images. */
  readonly list: readonly Person[];
  get(id: EntityId): Person | undefined;
  /** Crée une personne « nue » avec des valeurs par défaut cohérentes. Voir ArchetypeApi pour les tenues/dotations. */
  spawn(init: PersonInit): Person;
  remove(id: EntityId): void;
  clear(): void;
  /**
   * Requête spatiale : écrit dans `out` (tronqué au nombre trouvé) et retourne ce nombre. Les personnes `dormant`
   * sont exclues. L'index reflète les positions au dernier rebuildIndex() (appelé par le moteur à chaque pas).
   */
  queryRadius(x: number, z: number, r: number, out: Person[], filter?: (p: Person) => boolean): number;
  nearest(x: number, z: number, r: number, filter?: (p: Person) => boolean): Person | null;
  countIn(x: number, z: number, r: number, filter?: (p: Person) => boolean): number;
  /** À appeler une fois par pas de simulation, après les déplacements (reconstruit l'index spatial). */
  rebuildIndex(): void;
}

/** Fabrique d'archétypes : apparence, dotation et caractéristiques réalistes par type de personne. */
export interface ArchetypeApi {
  spawn(kind: PersonKind, x: number, z: number, opts?: Omit<PersonInit, 'kind' | 'x' | 'z'>): Person;
  /** Ré-équipe une personne existante (changement de poste, de tenue). */
  equip(p: Person, poste: PolicePoste | ProtestProfile | null): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 3. Objets, actions, dégâts
// ─────────────────────────────────────────────────────────────────────────────────────

export type ItemId = Open<
  // forces de l'ordre
  | 'bouclier' | 'baton' | 'tonfa' | 'gazeuse' | 'grenade_lacrymo' | 'grenade_gm2l'
  | 'grenade_desencerclement' | 'lanceur_cougar' | 'lbd40' | 'pistolet' | 'menottes' | 'radio'
  | 'megaphone' | 'extincteur' | 'lampe' | 'masque_gaz' | 'fusee_sommation' | 'telecommande_drone'
  // manifestants
  | 'pave' | 'bouteille' | 'molotov' | 'mortier' | 'fumigene' | 'pancarte' | 'banderole' | 'drapeau'
  | 'parapluie' | 'bombe_peinture' | 'marteau' | 'barre' | 'telephone' | 'butin' | 'raquette'
  // secours
  | 'trousse_secours' | 'serum_physiologique' | 'brancard' | 'lance_incendie'
  // presse
  | 'appareil_photo' | 'camera_tv' | 'micro'
>;

export type ItemCategory =
  | 'defense' | 'melee' | 'spray' | 'throwable' | 'launcher' | 'firearm' | 'restraint' | 'comms'
  | 'tool' | 'medical' | 'media' | 'sign' | 'loot';

/**
 * Niveau dans la gradation de l'emploi de la force :
 * 0 aucun · 1 présence, contact (poussée au bouclier, maîtrise à mains nues) · 2 bâton, gazeuse à main ·
 * 3 lacrymogène (grenades à main et au lanceur), canon à eau · 4 GM2L, désencerclement, LBD · 5 arme à feu.
 */
export type ForceLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type ForceMeans =
  | 'presence' | 'contact' | 'baton' | 'gazeuse' | 'lacrymo' | 'canon_eau' | 'gm2l'
  | 'desencerclement' | 'lbd' | 'arme_feu' | 'vehicule';

/** Correspondance de référence entre un moyen et son niveau dans la gradation (droit, objets et IA l'utilisent tous). */
export const FORCE_LEVEL_OF: Readonly<Record<ForceMeans, ForceLevel>> = {
  presence: 1,
  contact: 1,
  baton: 2,
  gazeuse: 2,
  lacrymo: 3,
  canon_eau: 3,
  gm2l: 4,
  desencerclement: 4,
  lbd: 4,
  arme_feu: 5,
  vehicule: 4,
};

export interface ItemDef {
  id: ItemId;
  /** Nom français affiché. */
  name: string;
  category: ItemCategory;
  description: string;
  twoHanded: boolean;
  /** Clé du modèle tenu en main (rendu des personnages). */
  heldModel: string;
  /** Animation du haut du corps au repos avec l'objet en main, et pendant l'usage. */
  idleAnim: UpperAnim;
  useAnim: UpperAnim;
  /** Pictogramme (caractère ou identifiant) pour l'interface. */
  icon: string;
  maxCount: number;
  weight: number;
  /** Délai entre deux usages (s). */
  cooldown: number;
  /** Portée utile mini/maxi (m) — sert à l'IA et au réticule. */
  rangeMin: number;
  rangeMax: number;
  forceLevel: ForceLevel;
  forceMeans: ForceMeans | null;
  /** Projectile émis à l'usage, s'il y en a un. */
  projectile: ProjectileKind | null;
  /** Habilitation requise (carrière). */
  habilitation: string | null;
}

export interface UseOptions {
  /** Puissance 0..1 (lancer). Par défaut 1. */
  power?: number;
  /** Cible explicite (IA) : personne visée. */
  targetId?: EntityId;
}

export type UseFailure = 'no_item' | 'cooldown' | 'empty' | 'posture' | 'blocked' | 'forbidden';
export interface UseResult { ok: boolean; reason?: UseFailure; projectileId?: EntityId }

export interface AimSolution { yaw: number; pitch: number; power: number; flightTime: number }

/** Actions liées aux objets : même API pour le joueur et pour toutes les IA. */
export interface ActionApi {
  def(id: ItemId): ItemDef | undefined;
  readonly defs: readonly ItemDef[];
  /** Objet en main (ou null). */
  activeItem(p: Person): ItemStack | null;
  select(p: Person, slot: number): boolean;
  selectById(p: Person, id: ItemId): boolean;
  /** Usage principal de l'objet en main, dans la direction de visée de la personne. */
  use(p: Person, opts?: UseOptions): UseResult;
  /** Mode secondaire maintenu (lever le bouclier, épauler). */
  setAlt(p: Person, active: boolean): void;
  canUse(p: Person, slot?: number): boolean;
  /** Calcule la visée balistique pour atteindre un point avec l'objet en main. false si hors de portée. */
  solveAim(p: Person, tx: number, ty: number, tz: number, out: AimSolution): boolean;
  give(p: Person, id: ItemId, count?: number): ItemStack;
  remove(p: Person, id: ItemId, count?: number): number;
  has(p: Person, id: ItemId): number;
}

export type DamageKind =
  | 'impact' | 'blunt' | 'blast' | 'burn' | 'gas' | 'water' | 'bullet' | 'vehicle' | 'crush' | 'fall';

export interface DamageInfo {
  amount: number;
  kind: DamageKind;
  /** Personne à l'origine (0 si inconnue / environnement). */
  sourceId: EntityId;
  item?: ItemId;
  means?: ForceMeans;
  x: number;
  z: number;
  /** Direction du coup (unitaire) pour le recul. */
  dirX?: number;
  dirZ?: number;
  /** Hauteur d'impact relative (0 pieds … 1 tête). */
  zone?: number;
  stun?: number;
  knockback?: number;
}

/** Santé et états : seul point d'entrée pour blesser / soigner une personne. */
export interface HealthApi {
  hurt(target: Person, d: DamageInfo): void;
  heal(target: Person, amount: number, byId: EntityId): void;
  /** Met à terre (blessé) ou relève. */
  setDown(target: Person, down: boolean, sourceId?: EntityId): void;
  isIncapacitated(p: Person): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 4. Projectiles
// ─────────────────────────────────────────────────────────────────────────────────────

export type ProjectileKind = Open<
  | 'grenade_lacrymo_main' | 'grenade_lacrymo_56' | 'palet_lacrymo' | 'gm2l' | 'desencerclement'
  | 'plot_caoutchouc' | 'lbd' | 'balle' | 'fusee_rouge'
  | 'pave' | 'bouteille' | 'molotov' | 'mortier' | 'fumigene' | 'oeuf_peinture' | 'debris'
>;

export interface Projectile {
  readonly id: EntityId;
  kind: ProjectileKind;
  ownerId: EntityId;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Rotation propre (rad) pour le rendu. */
  spin: number;
  /** Âge (s) et durée de vie restante (s). */
  age: number;
  fuse: number;
  /** Au sol / en train d'émettre (grenade lacrymogène). */
  resting: boolean;
  emitting: boolean;
  /** Peut être ramassé / renvoyé. */
  pickable: boolean;
  data: unknown;
}

export interface ProjectileApi {
  readonly list: readonly Projectile[];
  get(id: EntityId): Projectile | undefined;
  spawn(kind: ProjectileKind, ownerId: EntityId, x: number, y: number, z: number, vx: number, vy: number, vz: number): Projectile;
  remove(id: EntityId): void;
  /** Projectile ramassable le plus proche (pour renvoyer une grenade). */
  nearestPickable(x: number, z: number, r: number): Projectile | null;
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 5. Dangers diffus : gaz, fumée, feu, eau
// ─────────────────────────────────────────────────────────────────────────────────────

export interface HazardApi {
  /** Lacrymogène : ajoute de la concentration autour d'un point. */
  emitGas(x: number, z: number, amount: number, radius: number): void;
  /** Fumée opaque (incendie, fumigène). color = 0xRRGGBB. */
  emitSmoke(x: number, z: number, amount: number, radius: number, color?: number): void;
  /** Concentration de gaz lacrymogène (0 = air pur, 1 = insoutenable). */
  gasAt(x: number, z: number): number;
  /** Opacité de fumée 0..1 (gêne la vue des IA et du joueur). */
  smokeAt(x: number, z: number): number;
  /** Allume une nappe de feu au sol. */
  ignite(x: number, z: number, radius: number, intensity: number, sourceId: EntityId): void;
  fireAt(x: number, z: number): number;
  /** Eau ou poudre : éteint le feu, rabat gaz et fumée, mouille. */
  douse(x: number, z: number, radius: number, amount: number): void;
  /** Visibilité entre deux points en tenant compte de la fumée (0 = rien, 1 = parfaite). */
  visibility(ax: number, az: number, bx: number, bz: number): number;
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 6. Véhicules
// ─────────────────────────────────────────────────────────────────────────────────────

export type VehicleKind = Open<
  | 'fourgon_crs' | 'car_crs' | 'vl_commandement' | 'voiture_police' | 'fourgon_cellulaire'
  | 'centaure' | 'canon_eau' | 'moto_bravm' | 'camion_pompiers' | 'ambulance'
  | 'voiture' | 'citadine' | 'suv' | 'taxi' | 'utilitaire' | 'camion' | 'bus' | 'scooter'
  | 'camion_sono' | 'drone' | 'helicoptere'
>;

export type SeatRole = 'driver' | 'gunner' | 'passenger';

export interface SeatDef {
  role: SeatRole;
  /**
   * Position du siège dans le repère du véhicule : x = vers la DROITE du véhicule, y = haut, z = vers l'avant.
   * Passage au monde : position + droite·x + avant·z, avec avant = (sin h, cos h) et droite = (−cos h, sin h).
   * Attention côté rendu : avec object.rotation.y = h et un modèle regardant +z, l'axe +x local de Three.js est la
   * GAUCHE du véhicule ; un siège se place donc à x local Three = −seat.x. Même convention pour TurretDef.
   */
  x: number; y: number; z: number;
  /** Point de sortie au sol dans le repère du véhicule. */
  exitX: number; exitZ: number;
}

export interface TurretDef {
  /** Type d'armement / d'équipement de tourelle. */
  kind: 'lance_grenades' | 'canon_eau' | 'camera';
  x: number; y: number; z: number;
  yawMin: number; yawMax: number; pitchMin: number; pitchMax: number;
  /** Munitions (tubes) ou litres d'eau. */
  capacity: number;
  /** Intervalle entre deux tirs (s). */
  interval: number;
}

export interface VehicleDef {
  kind: VehicleKind;
  name: string;
  faction: Faction;
  length: number; width: number; height: number;
  mass: number;
  wheelbase: number;
  /** m/s */
  maxSpeed: number;
  maxReverse: number;
  /** m/s² */
  accel: number;
  brake: number;
  /** Angle de braquage maximal (rad). */
  maxSteer: number;
  seats: SeatDef[];
  turrets: TurretDef[];
  armored: boolean;
  /** Lame / pare-buffle : peut pousser barricades et épaves. */
  canPush: boolean;
  hasSiren: boolean;
  hasBeacons: boolean;
  /** Couleur de carrosserie par défaut. */
  color: number;
  /** Engin volant (drone, hélicoptère). */
  flying: boolean;
}

export interface VehicleCommand {
  /** -1 (marche arrière) … 1 (accélération). */
  throttle: number;
  /** -1 (gauche) … 1 (droite). */
  steer: number;
  /** 0..1 */
  brake: number;
  handbrake: boolean;
  horn: boolean;
  /** Engins volants : montée/descente -1..1 et translation latérale -1..1. */
  lift: number;
  strafe: number;
}

export type VehicleState = 'ok' | 'damaged' | 'wrecked' | 'burning' | 'burnt';

export interface Vehicle {
  readonly id: EntityId;
  kind: VehicleKind;
  def: VehicleDef;
  faction: Faction;
  x: number; y: number; z: number;
  heading: number;
  pitch: number;
  roll: number;
  vx: number; vz: number; vy: number;
  /** Vitesse longitudinale signée (m/s). */
  speed: number;
  yawRate: number;
  /** Braquage réel des roues (rad). */
  steerAngle: number;
  rpm: number;
  gear: number;
  health: number;            // 0..100
  state: VehicleState;
  burning: number;           // 0..1
  /** 0 = éteinte, 1 = deux-tons, 2 = variante. */
  siren: 0 | 1 | 2;
  beacons: boolean;
  headlights: boolean;
  indicator: -1 | 0 | 1;
  braking: boolean;
  /** Occupants par index de siège (0 si vide). */
  seats: EntityId[];
  /**
   * Orientation des tourelles (repère véhicule). Gisement turretYaw positif = vers la DROITE du véhicule : cap monde de
   * la tourelle = heading − turretYaw. Site turretPitch positif = canon levé.
   */
  turretYaw: number[];
  turretPitch: number[];
  /** Munitions / eau restantes par tourelle. */
  turretAmmo: number[];
  color: number;
  plate: string;
  locked: boolean;
  /** Moteur en marche. */
  engineOn: boolean;
  cmd: VehicleCommand;
  /** Mémoire privée du pilote automatique (trafic, convoi). */
  brain: unknown;
  dormant: boolean;
}

export interface VehicleApi {
  readonly list: readonly Vehicle[];
  readonly defs: readonly VehicleDef[];
  def(kind: VehicleKind): VehicleDef | undefined;
  get(id: EntityId): Vehicle | undefined;
  spawn(kind: VehicleKind, x: number, z: number, heading: number, opts?: { color?: number; faction?: Faction }): Vehicle;
  remove(id: EntityId): void;
  clear(): void;
  queryRadius(x: number, z: number, r: number, out: Vehicle[]): number;
  /** Fait monter une personne (siège précis ou premier siège libre du rôle demandé). */
  enter(p: Person, v: Vehicle, seat?: number | SeatRole): boolean;
  exit(p: Person): boolean;
  damage(v: Vehicle, d: DamageInfo): void;
  /** Tir de la tourelle dans son orientation courante. */
  fireTurret(v: Vehicle, turret: number, byId: EntityId): boolean;
  /** Collision d'un disque avec les véhicules (repousse `pos`). */
  resolveCircle(pos: Vec2, radius: number, ignoreId?: EntityId): boolean;
  /** Les engins volants sont ignorés. */
  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit, mode?: 'move' | 'sight'): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 7. Objets du décor dynamiques, mobilier urbain, vitrines
// ─────────────────────────────────────────────────────────────────────────────────────

export type PropKind = Open<
  | 'poubelle' | 'conteneur' | 'barriere_vauban' | 'barriere_chantier' | 'banc' | 'abribus' | 'kiosque'
  | 'colonne_morris' | 'panneau_pub' | 'potelet' | 'velo' | 'trottinette' | 'palette' | 'pile_paves'
  | 'table_terrasse' | 'chaise' | 'candelabre' | 'feu_tricolore' | 'distributeur' | 'fontaine_wallace'
  | 'barricade' | 'debris' | 'cone' | 'jardiniere' | 'echafaudage' | 'sanisette' | 'station_velo'
  // types propres à la carte
  | 'boite_aux_lettres' | 'arceau_velo' | 'panneau' | 'statue' | 'mat_drapeau' | 'bouche_incendie' | 'horodateur'
  | 'armoire_technique' | 'colonne_verre' | 'horloge' | 'camera' | 'autre'
>;

export type PropState = 'intact' | 'damaged' | 'broken' | 'burning' | 'burnt';

export interface Prop {
  readonly id: EntityId;
  kind: PropKind;
  x: number; y: number; z: number;
  heading: number;
  /** Demi-dimensions de la boîte de collision orientée. */
  halfX: number;
  halfZ: number;
  height: number;
  hp: number;
  state: PropState;
  burning: number;
  /** Combustible restant (s de feu). */
  fuel: number;
  movable: boolean;
  /** Renversé. */
  toppled: boolean;
  blocksMove: boolean;
  blocksSight: boolean;
  /** Nombre de tags. */
  tags: number;
  carriedBy: EntityId;
  /** Vitesse quand poussé / projeté. */
  vx: number; vz: number;
  dormant: boolean;
}

export type ShopCategory = Open<
  | 'banque' | 'luxe' | 'mode' | 'bijouterie' | 'alimentation' | 'supermarche' | 'cafe_restaurant'
  | 'restauration_rapide' | 'pharmacie' | 'tabac_presse' | 'telephonie' | 'agence' | 'hotel' | 'autre'
>;

export type WindowState = 'intact' | 'tagged' | 'cracked' | 'broken' | 'boarded';

export interface Shop {
  readonly id: EntityId;
  /** Nom d'enseigne FICTIF. */
  name: string;
  category: ShopCategory;
  /** Milieu de la vitrine. */
  x: number; y: number; z: number;
  /** Cap de la normale sortante de la façade. */
  heading: number;
  width: number;
  window: WindowState;
  /** Rideau de fer baissé 0..1. */
  shutter: number;
  /** Marchandise restante 0..1 et valeur d'attrait pour les pilleurs. */
  stock: number;
  appeal: number;
  burning: number;
  /** Nombre de personnes actuellement à l'intérieur (pillage). */
  occupants: number;
  dormant: boolean;
}

export interface ShopInit {
  category: ShopCategory;
  /** Milieu de la vitrine. */
  x: number;
  z: number;
  /** Cap de la normale sortante de la façade. */
  heading: number;
  width: number;
  /** Nom d'enseigne fictif (par défaut : libellé générique de la catégorie). */
  name?: string;
  stock?: number;
  appeal?: number;
  shutter?: number;
}

export interface PropApi {
  readonly list: readonly Prop[];
  readonly shops: readonly Shop[];
  /** Crée une vitrine (le module du mobilier les crée depuis world.shopsInTile à l'arrivée d'une tuile). */
  addShop(init: ShopInit): Shop;
  removeShop(id: EntityId): void;
  get(id: EntityId): Prop | undefined;
  shop(id: EntityId): Shop | undefined;
  spawn(kind: PropKind, x: number, z: number, heading: number): Prop;
  remove(id: EntityId): void;
  clear(): void;
  queryRadius(x: number, z: number, r: number, out: Prop[], filter?: (p: Prop) => boolean): number;
  shopsNear(x: number, z: number, r: number, out: Shop[]): number;
  damage(prop: Prop, amount: number, kind: DamageKind, byId: EntityId): void;
  damageShop(shop: Shop, amount: number, kind: DamageKind, byId: EntityId): void;
  /** Prélève de la marchandise ; retourne la quantité obtenue (0 si vide/fermé). */
  loot(shop: Shop, byId: EntityId): number;
  /** Pousse / renverse / déplace un objet mobile. */
  push(prop: Prop, dirX: number, dirZ: number, force: number, byId: EntityId): void;
  tag(target: Prop | Shop, byId: EntityId): void;
  resolveCircle(pos: Vec2, radius: number): boolean;
  /** mode 'move' : objets qui bloquent le passage ; 'sight' : objets qui bloquent la vue ; défaut : les deux. */
  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit, mode?: 'move' | 'sight'): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 8. Monde statique : relief, collisions, navigation, lieux
// ─────────────────────────────────────────────────────────────────────────────────────

export type SurfaceKind =
  | 'road' | 'sidewalk' | 'plaza' | 'sett' | 'park' | 'gravel' | 'water' | 'building' | 'bridge'
  | 'quay' | 'interior' | 'void';

export interface RayHit {
  hit: boolean;
  /** Fraction du segment (0..1). */
  t: number;
  x: number; z: number;
  nx: number; nz: number;
  kind: 'none' | 'building' | 'barrier' | 'prop' | 'vehicle' | 'person';
  id: EntityId;
  /** Hauteur de l'obstacle (m au-dessus du sol), pour les projectiles. */
  height: number;
}

export type RoadClass =
  | 'motorway' | 'primary' | 'secondary' | 'tertiary' | 'residential' | 'pedestrian' | 'service' | 'footway';

export interface RoadSample {
  edgeId: number;
  /** Point le plus proche sur l'axe de la voie. */
  x: number; z: number;
  /** Cap de la voie en ce point (sens de numérisation). */
  heading: number;
  /** Distance au point demandé (m). */
  dist: number;
  /** Largeur de chaussée (m). */
  width: number;
  name: string;
  roadClass: RoadClass;
  oneway: boolean;
}

export interface RoadNodeInfo {
  id: number;
  x: number; z: number;
  signal: boolean;
  crossing: boolean;
  /** Arêtes incidentes. */
  edges: readonly number[];
}

export interface RoadEdgeInfo {
  id: number;
  a: number;                 // nœud de départ
  b: number;                 // nœud d'arrivée
  /** Polyligne [x0, z0, x1, z1, …]. */
  points: ArrayLike<number>;
  length: number;
  width: number;
  lanesForward: number;
  lanesBackward: number;
  oneway: boolean;
  roadClass: RoadClass;
  name: string;
  bridge: boolean;
  /** Pavés. */
  sett: boolean;
  /** m/s */
  speedLimit: number;
  sidewalk: number;
  /** Interdite aux véhicules. */
  pedestrianOnly: boolean;
}

export type PlaceKind =
  | 'square' | 'street' | 'bridge' | 'quay' | 'garden' | 'district' | 'monument' | 'station' | 'institution';

export interface PlaceInfo {
  id: number;
  name: string;
  kind: PlaceKind;
  x: number; z: number;
  radius: number;
}

export interface LandmarkInfo {
  key: string;
  name: string;
  x: number; z: number; y: number;
  heading: number;
  height: number;
  /** Emprise au sol [x0, z0, x1, z1, …]. */
  footprint: ArrayLike<number>;
}

export interface MapShopInfo {
  /** Index stable dans la tuile. */
  index: number;
  x: number; z: number;
  heading: number;
  width: number;
  category: ShopCategory;
}

export interface MapFurnitureInfo {
  index: number;
  kind: string;
  x: number; z: number;
  heading: number;
}

export interface WorldBounds { minX: number; minZ: number; maxX: number; maxZ: number }

export interface WorldQuery {
  /** Données de base chargées (graphe, relief, lieux). */
  readonly ready: boolean;
  readonly bounds: WorldBounds;
  readonly tileSize: number;
  /** Attribution des données cartographiques (à afficher dans le jeu). */
  readonly attribution: string;

  // ── relief et surfaces ──
  heightAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): SurfaceKind;
  /** Hauteur du bâti au-dessus du sol en ce point (0 hors bâtiment). */
  buildingHeightAt(x: number, z: number): number;
  /** Niveau de l'eau de la Seine (y). */
  readonly waterLevel: number;

  // ── collisions avec le décor statique (bâtiments, murs, grilles, eau) ──
  /** Repousse le disque hors des obstacles (modifie pos). true s'il y a eu contact. */
  resolveCircle(pos: Vec2, radius: number): boolean;
  isFree(x: number, z: number, radius: number): boolean;
  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean;
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean;

  // ── réseau de rues ──
  readonly nodeCount: number;
  readonly edgeCount: number;
  node(id: number): RoadNodeInfo;
  edge(id: number): RoadEdgeInfo;
  nearestRoad(x: number, z: number, out: RoadSample, maxDist?: number): boolean;
  /** Itinéraire. Écrit une polyligne [x0, z0, x1, z1, …] dans `out`. false si aucun chemin. */
  findPath(ax: number, az: number, bx: number, bz: number, mode: 'foot' | 'vehicle', out: number[]): boolean;
  /** Point libre aléatoire (trottoir ou chaussée) autour d'un point — pour faire apparaître des PNJ. */
  randomFreePoint(x: number, z: number, radius: number, surface: 'sidewalk' | 'road' | 'any', rand: () => number, out: Vec2): boolean;

  // ── lieux ──
  readonly places: readonly PlaceInfo[];
  readonly landmarks: readonly LandmarkInfo[];
  placeByName(name: string): PlaceInfo | null;
  /** Nom du secteur pour la radio (« place de la Concorde », « avenue des Champs-Élysées »…). */
  sectorName(x: number, z: number): string;

  // ── chargement par secteurs ──
  /** Indique le centre d'intérêt (joueur/caméra) : charge les tuiles alentour. */
  setFocus(x: number, z: number): void;
  /** Les données détaillées (collisions fines) sont-elles chargées ici ? */
  isLoaded(x: number, z: number): boolean;
  /** Promesse résolue quand toutes les tuiles dans le rayon sont prêtes (écran de chargement). */
  whenLoaded(x: number, z: number, radius: number): Promise<void>;
  /** Contenu cartographique d'une tuile chargée (vitrines, mobilier) ; tableaux vides si non chargée. */
  shopsInTile(tx: number, tz: number): readonly MapShopInfo[];
  furnitureInTile(tx: number, tz: number): readonly MapFurnitureInfo[];
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 9. Unités, ordres, radio
// ─────────────────────────────────────────────────────────────────────────────────────

export type SquadKind =
  | 'binome' | 'groupe' | 'section' | 'compagnie' | 'peloton' | 'equipage' | 'affinite' | 'cortege' | 'secours';

export type OrderType = Open<
  | 'libre' | 'suivre' | 'tenir' | 'ligne' | 'colonne' | 'tortue' | 'avancer' | 'bond_offensif'
  | 'charge' | 'refoulement' | 'repli' | 'encercler' | 'disperser_gaz' | 'interpeller' | 'proteger'
  | 'embarquer' | 'debarquer' | 'degager_barricade' | 'escorter' | 'cesser'
  // traitement d'un incident : éteindre un feu (targetId ou point), aller chercher un blessé ou un agent à terre
  | 'eteindre' | 'secourir' | 'releve' | 'ravitailler' | 'couper_circulation' | 'filtrer'
>;

export interface SquadOrder {
  type: OrderType;
  /** Point de référence de l'ordre (centre de la ligne, objectif). */
  x: number;
  z: number;
  /** Cap de la formation (direction vers laquelle elle fait face). */
  heading: number;
  /** Largeur de front souhaitée (m), 0 = automatique. */
  width: number;
  targetId: EntityId;
  /** Niveau de force maximal autorisé par celui qui ordonne. */
  maxForce: ForceLevel;
  issuedAt: number;
  issuedBy: EntityId;
}

export interface Squad {
  readonly id: number;
  kind: SquadKind;
  faction: Faction;
  /** Indicatif radio (« Alpha 1 ») ou nom du groupe. */
  name: string;
  leaderId: EntityId;
  members: EntityId[];
  parentId: number;
  vehicleId: EntityId;
  order: SquadOrder;
  /** 0..1 : cohésion / moral. */
  morale: number;
  brain: unknown;
}

export interface SquadApi {
  readonly list: readonly Squad[];
  get(id: number): Squad | undefined;
  create(kind: SquadKind, faction: Faction, name: string, parentId?: number): Squad;
  remove(id: number): void;
  addMember(squadId: number, personId: EntityId): void;
  removeMember(personId: EntityId): void;
  setLeader(squadId: number, personId: EntityId): void;
  /**
   * Donne un ordre (joueur gradé, commandement IA ou script de mission). Champs omis : point et cap du chef d'unité,
   * maxForce = law.roe.authorizedForce, issuedBy = 0. Pas de cascade automatique vers les unités subordonnées.
   */
  issue(squadId: number, order: Partial<SquadOrder> & { type: OrderType }): void;
  /** Unités subordonnées directes. */
  childrenOf(squadId: number): Squad[];
  clear(): void;
}

export type RadioChannel = 'commandement' | 'unite' | 'secours' | 'presse' | 'public';

export interface RadioMessage {
  channel: RadioChannel;
  /** Indicatif ou nom de l'émetteur. */
  from: string;
  text: string;
  /** 0 = ambiance, 1 = normal, 2 = urgent. */
  priority: 0 | 1 | 2;
  /** Personne qui parle (pour l'animation et la spatialisation), si connue. */
  personId?: EntityId;
  /** Voix synthétique à utiliser (indice libre). */
  voice?: number;
}

export interface RadioApi {
  /** Diffuse un message : sous-titre, journal, voix. */
  say(msg: RadioMessage): void;
  readonly log: readonly (RadioMessage & { t: number })[];
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 10. Droit : sommations, emploi de la force, infractions, interpellations
// ─────────────────────────────────────────────────────────────────────────────────────

/** 0 = aucune, 1 = annonce (« Obéissance à la loi »), 2 = première sommation, 3 = dernière sommation. */
export type SommationStage = 0 | 1 | 2 | 3;

export interface RoeState {
  /** L'attroupement a été constaté et la dispersion décidée par l'autorité habilitée. */
  dispersionOrdered: boolean;
  sommation: SommationStage;
  /** Instant de la dernière sommation (s). */
  sommationAt: number;
  /** Des violences sont exercées contre les forces de l'ordre (riposte immédiate permise). */
  underAttack: boolean;
  /** Niveau de force maximal licite à cet instant, d'après le contexte. */
  lawfulForce: ForceLevel;
  /** Niveau de force maximal autorisé par la hiérarchie (ordre reçu). */
  authorizedForce: ForceLevel;
}

export type ForceVerdictKind = 'licite' | 'disproportionne' | 'sans_sommation' | 'non_autorise' | 'cible_illegitime' | 'interdit';

export interface ForceVerdict {
  kind: ForceVerdictKind;
  /** Explication en français, affichable dans le rapport de fin de mission. */
  reason: string;
  /** Gravité de la faute 0 (aucune) … 5 (faute lourde). */
  severity: number;
}

export interface ForceReport {
  t: number;
  byId: EntityId;
  means: ForceMeans;
  targetId: EntityId;
  x: number;
  z: number;
  verdict: ForceVerdict;
  /** L'acte a été filmé par un tiers. */
  filmed: boolean;
}

export interface LawApi {
  readonly roe: RoeState;
  readonly forceLog: readonly ForceReport[];
  /** Enregistre une infraction commise par une personne (témoins et preuves calculés par le module). */
  recordOffense(p: Person, type: OffenseType, x: number, z: number, severity?: number): Offense;
  /** Infraction la plus grave retenue contre la personne (null si rien). */
  worstOffense(p: Person): Offense | null;
  /** L'interpellation de cette personne serait-elle fondée ? */
  canArrest(p: Person): boolean;
  /** Sommation suivante, prononcée par `by` (doit être autorité habilitée). Retourne l'étape atteinte, ou l'étape inchangée si refus. */
  sommation(by: Person): SommationStage;
  /** Texte réglementaire d'une étape de sommation. */
  sommationText(stage: SommationStage): string;
  /** Fixe le niveau de force autorisé par la hiérarchie. */
  authorize(level: ForceLevel, byId: EntityId): void;
  /** Déclare un emploi de la force : évalue sa licéité, l'inscrit au journal, émet les événements. */
  reportForce(by: Person, means: ForceMeans, target: Person | null, x: number, z: number): ForceVerdict;
  reset(): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 11. Foule : phases et tension
// ─────────────────────────────────────────────────────────────────────────────────────

export type CrowdPhase =
  | 'aucune' | 'rassemblement' | 'depart' | 'cortege' | 'tension' | 'affrontement' | 'dispersion'
  | 'apres_manif' | 'terminee';

export interface CrowdStats {
  total: number;
  present: number;
  dispersed: number;
  radicals: number;
  injured: number;
  arrested: number;
}

export interface DirectorApi {
  readonly phase: CrowdPhase;
  /** Tension globale 0..1. */
  readonly tension: number;
  tensionAt(x: number, z: number): number;
  /** Ajoute (ou retire si négatif) de la tension localisée, avec un motif pour le rapport. */
  addTension(amount: number, x: number, z: number, reason: string): void;
  readonly stats: CrowdStats;
  /** Parcours déclaré du cortège [x0, z0, x1, z1, …] (vide si aucun). */
  readonly route: readonly number[];
  /** Position de la tête de cortège le long du parcours (m). */
  readonly headProgress: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 12. Interactions contextuelles (touche « Interagir » et IA)
// ─────────────────────────────────────────────────────────────────────────────────────

export type InteractVerb = Open<
  | 'maitriser' | 'menotter' | 'palper' | 'escorter' | 'remettre' | 'relacher' | 'soigner' | 'rincer_yeux'
  | 'porter' | 'trainer' | 'deposer' | 'monter' | 'descendre' | 'conduire' | 'ramasser' | 'renvoyer'
  | 'pousser' | 'renverser' | 'piller' | 'ouvrir' | 'parler' | 'controler' | 'equiper' | 'briefing'
  | 'depaver' | 'eteindre' | 'interviewer' | 'degager' | 'incendier'
>;

export interface InteractionOption {
  verb: InteractVerb;
  targetKind: EntityKind;
  targetId: EntityId;
  /** Texte de l'invite (« Menotter », « Monter dans le fourgon »…). */
  label: string;
  /** Plus grand = prioritaire quand plusieurs options sont proches. */
  priority: number;
  /** Durée de l'action (s), 0 = immédiate. */
  duration: number;
  x: number;
  z: number;
}

export interface InteractionHandler {
  verb: InteractVerb;
  /**
   * Meilleure cible disponible pour cet acteur, ou null. Appelé ~5 fois/s pour le joueur.
   * Si `targetId` est fourni (IA, startVerb), ne considérer que cette cible.
   */
  find(actor: Person, targetId?: EntityId): InteractionOption | null;
  /** Début de l'action. Retourner false pour refuser. */
  begin(actor: Person, opt: InteractionOption): boolean;
  /** Pendant l'action (durée > 0). Retourner false pour l'interrompre. */
  tick?(actor: Person, opt: InteractionOption, elapsed: number, dt: number): boolean;
  complete(actor: Person, opt: InteractionOption): void;
  cancel?(actor: Person, opt: InteractionOption): void;
}

export interface InteractionApi {
  register(handler: InteractionHandler): void;
  /** Options disponibles pour une personne, triées par priorité décroissante. */
  options(actor: Person, out: InteractionOption[]): number;
  /** Lance une interaction (joueur ou IA). */
  start(actor: Person, opt: InteractionOption): boolean;
  /** Raccourci IA : cherche et lance le verbe demandé sur la cible donnée. */
  startVerb(actor: Person, verb: InteractVerb, targetId: EntityId): boolean;
  cancel(actor: Person): void;
  /** Interaction en cours pour cette personne. */
  current(actor: Person): { opt: InteractionOption; elapsed: number } | null;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 13. Environnement : heure et météo
// ─────────────────────────────────────────────────────────────────────────────────────

export type WeatherKind = 'clair' | 'nuageux' | 'couvert' | 'pluie' | 'averse' | 'brouillard' | 'orage';

export interface EnvState {
  /** Heure locale 0..24. */
  timeOfDay: number;
  /** Secondes de jeu par seconde réelle pour l'horloge (1 = temps réel). */
  clockScale: number;
  weather: WeatherKind;
  rain: number;              // 0..1
  fog: number;               // 0..1
  clouds: number;            // 0..1
  wetness: number;           // 0..1 sol mouillé
  /** Vent au sol (m/s) dans le repère monde. */
  windX: number;
  windZ: number;
  /** Direction VERS le soleil (ou la lune la nuit), unitaire. */
  sunX: number; sunY: number; sunZ: number;
  /** 0 (nuit noire) … 1 (plein jour). */
  daylight: number;
  isNight: boolean;
  /** Éclairage public allumé. */
  streetLights: boolean;
}

export interface EnvApi {
  readonly state: EnvState;
  setTime(hour: number): void;
  setWeather(kind: WeatherKind, immediate?: boolean): void;
  setClockScale(scale: number): void;
  setWind(x: number, z: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 14. Joueur, entrées, caméra
// ─────────────────────────────────────────────────────────────────────────────────────

export type PlayableRole =
  | 'crs' | 'chef_groupe' | 'commandant' | 'commissaire' | 'bravm' | 'gendarme_centaure'
  | 'operateur_canon_eau' | 'telepilote' | 'street_medic' | 'secouriste' | 'journaliste' | 'manifestant';

export type CameraMode = 'fps' | 'tps' | 'vehicle_int' | 'vehicle_ext' | 'turret' | 'drone' | 'tactical' | 'viewfinder' | 'free';

export interface PlayerState {
  /** Personne incarnée (0 si aucune). */
  personId: EntityId;
  role: PlayableRole;
  cameraMode: CameraMode;
  /** Orientation de la caméra (rad). */
  camYaw: number;
  camPitch: number;
  /** Zoom optique courant (1 = normal). */
  zoom: number;
  /** Les commandes du personnage sont actives (false pendant un menu, une cinématique). */
  controlEnabled: boolean;
  /** Puissance de lancer en cours de charge 0..1 (pour le HUD). */
  charge: number;
  /** Invite d'interaction courante (null si aucune). */
  prompt: InteractionOption | null;
  /** Personne visée / survolée par le réticule. */
  aimedPersonId: EntityId;
  /** Point visé au sol. */
  aimX: number;
  aimZ: number;
}

export interface PlayerApi {
  readonly state: PlayerState;
  person(): Person | null;
  vehicle(): Vehicle | null;
  /** Incarne une personne existante. */
  possess(personId: EntityId, role?: PlayableRole): void;
  setCameraMode(mode: CameraMode): void;
  /** Bascule FPS ↔ TPS (ou intérieur ↔ extérieur en véhicule). */
  toggleCamera(): void;
}

export type InputDevice = 'kbm' | 'gamepad' | 'touch';

export type Button =
  | 'primary' | 'secondary' | 'interact' | 'reload' | 'sprint' | 'crouch' | 'jump'
  | 'item_next' | 'item_prev' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8' | 'slot9'
  | 'radio' | 'orders' | 'map' | 'tactical' | 'camera' | 'pause' | 'flashlight' | 'mask' | 'visor'
  | 'siren' | 'beacons' | 'horn' | 'handbrake' | 'headlights' | 'megaphone' | 'fast_forward'
  | 'zoom_in' | 'zoom_out' | 'ui_accept' | 'ui_back' | 'ui_up' | 'ui_down' | 'ui_left' | 'ui_right';

export interface InputState {
  readonly device: InputDevice;
  /** Déplacement : x = droite (+1), y = avant (+1). Sert aussi au volant (x) et à l'accélérateur (y). */
  readonly moveX: number;
  readonly moveY: number;
  /** Rotation de caméra à appliquer CETTE image (radians), déjà mise à l'échelle par la sensibilité. */
  readonly lookX: number;
  readonly lookY: number;
  /** Gâchettes analogiques 0..1 (manette) ; sinon 0/1 dérivés des boutons. */
  readonly throttle: number;
  readonly brake: number;
  readonly wheel: number;
  readonly pointerLocked: boolean;
  down(b: Button): boolean;
  pressed(b: Button): boolean;
  released(b: Button): boolean;
  /** Vibration manette / téléphone (si disponible). */
  rumble(strength: number, seconds: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 15. Interface, audio, effets
// ─────────────────────────────────────────────────────────────────────────────────────

export type NoticeKind = 'info' | 'ok' | 'warn' | 'alert';

export type ScreenId = Open<
  | 'menu_principal' | 'pause' | 'parametres' | 'chargement' | 'briefing' | 'debrief' | 'carriere'
  | 'mode_libre' | 'missions' | 'editeur' | 'garage' | 'personnalisation' | 'vestiaire' | 'planning'
  | 'carte' | 'carte_tactique' | 'inventaire' | 'credits'
>;

export interface UiApi {
  notify(text: string, kind?: NoticeKind, seconds?: number): void;
  /** Sous-titre (radio, mégaphone, dialogues). */
  subtitle(speaker: string, text: string, seconds?: number): void;
  /** Grand bandeau (début de mission, changement de phase). */
  banner(title: string, subtitle?: string, seconds?: number): void;
  open(screen: ScreenId, data?: unknown): void;
  close(screen?: ScreenId): void;
  /** Un écran bloquant est ouvert (le jeu doit ignorer les commandes du personnage). */
  readonly modal: boolean;
  readonly current: ScreenId | null;
}

export type SoundId = Open<
  | 'pas' | 'grenade_lancer' | 'grenade_pop' | 'gaz_sifflement' | 'lanceur_tir' | 'lbd_tir' | 'detonation'
  | 'desencerclement' | 'verre_brise' | 'impact_bouclier' | 'impact_sol' | 'coup_baton' | 'feu' | 'explosion_vehicule'
  | 'mortier_tir' | 'mortier_explosion' | 'molotov' | 'canon_eau' | 'sirene_police' | 'sirene_pompiers'
  | 'sirene_samu' | 'klaxon' | 'moteur' | 'radio_bip' | 'megaphone' | 'foule_calme' | 'foule_slogans'
  | 'foule_huees' | 'foule_panique' | 'toux' | 'cri' | 'menottes' | 'spray' | 'extincteur' | 'tir_arme'
  | 'declencheur_photo' | 'drone' | 'pluie' | 'vent' | 'ville' | 'sifflet' | 'tambour' | 'petard' | 'tole'
  | 'rideau_fer' | 'ui_clic' | 'ui_valide' | 'ui_alerte'
>;

export interface SoundOptions {
  x?: number;
  y?: number;
  z?: number;
  volume?: number;
  pitch?: number;
  loop?: boolean;
}

export interface AudioApi {
  /** Joue un son (spatialisé si x/z fournis). Retourne un identifiant pour l'arrêter. */
  play(id: SoundId, opts?: SoundOptions): number;
  stop(handle: number, fadeSeconds?: number): void;
  /** Synthèse vocale française (radio, mégaphone). */
  speak(text: string, opts?: { voice?: number; radio?: boolean; volume?: number; x?: number; z?: number }): void;
  setListener(x: number, y: number, z: number, yaw: number): void;
}

export type FxId = Open<
  | 'gaz' | 'fumee' | 'feu' | 'etincelles' | 'explosion' | 'flash' | 'eclats_verre' | 'poussiere'
  | 'jet_eau' | 'eclaboussure' | 'traceur' | 'feu_artifice' | 'peinture' | 'debris' | 'poudre' | 'sang'
  | 'trace_brulure' | 'tag' | 'impact'
>;

export interface ViewApi {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Groupe racine des objets du monde (pour y ajouter ses maillages). */
  readonly world: THREE.Group;
  readonly quality: QualityLevel;
  /** Distance d'affichage courante (m). */
  readonly drawDistance: number;
  /** Position de la caméra (lecture). */
  readonly camX: number;
  readonly camY: number;
  readonly camZ: number;
  /** Secousse de caméra (explosion proche…). */
  shake(amount: number, seconds: number): void;
  /** Voile d'écran (gaz dans les yeux, flash, eau sur la visière) 0..1. */
  setScreenEffect(effect: 'gas' | 'flash' | 'wet' | 'pain' | 'visor', amount: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 16. Réglages, sauvegarde, session
// ─────────────────────────────────────────────────────────────────────────────────────

export type QualityLevel = 'bas' | 'moyen' | 'haut' | 'ultra';
export type ViolenceLevel = 'sobre' | 'realiste';
export type DurationPreset = 'courte' | 'standard' | 'longue' | 'temps_reel';

export interface Settings {
  quality: QualityLevel;
  /** Échelle de résolution du rendu (0.5 – 1). */
  renderScale: number;
  shadows: boolean;
  /** Multiplicateur du nombre de PNJ (0.25 – 2). */
  crowdScale: number;
  drawDistance: number;
  fov: number;
  mouseSensitivity: number;
  gamepadSensitivity: number;
  touchSensitivity: number;
  invertY: boolean;
  volumeMaster: number;
  volumeEffects: number;
  volumeVoices: number;
  volumeAmbience: number;
  voiceSynthesis: boolean;
  subtitles: boolean;
  violence: ViolenceLevel;
  /** Aides : marqueurs d'objectifs, contours des suspects, visée assistée à la manette. */
  hudMarkers: boolean;
  aimAssist: boolean;
  vibration: boolean;
  /** Affichage des performances. */
  showFps: boolean;
}

export interface SettingsApi {
  readonly values: Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
}

export interface SaveApi {
  /** Lit une section de la sauvegarde (objet JSON) ou la valeur par défaut. */
  read<T>(section: string, fallback: T): T;
  write<T>(section: string, value: T): void;
  remove(section: string): void;
  /** Exporte / importe toute la sauvegarde en JSON. */
  exportAll(): string;
  importAll(json: string): boolean;
  wipe(): void;
}

export type GameMode = 'carriere' | 'libre' | 'monde_ouvert' | 'editeur' | 'test';
export type SessionPhase = 'boot' | 'menu' | 'loading' | 'playing' | 'paused' | 'debrief';

export interface SessionConfig {
  mode: GameMode;
  /** Identifiant de mission du catalogue (ou '' pour une session libre). */
  missionId: string;
  role: PlayableRole;
  rank: PoliceRank | null;
  /** Lieu de départ (nom de lieu connu du monde) ou coordonnées. x/z priment s'ils sont fournis ; après start(), ils sont toujours renseignés. */
  place: string;
  x?: number;
  z?: number;
  timeOfDay: number;
  weather: WeatherKind;
  /** Effectif de manifestants demandé (avant application de Settings.crowdScale). */
  crowdSize: number;
  /** Tension initiale 0..1 et propension à dégénérer 0..1. */
  tension: number;
  volatility: number;
  duration: DurationPreset;
  seed: number;
  /** Paramètres supplémentaires propres à la mission. */
  extra?: Record<string, unknown>;
}

export interface SessionApi {
  readonly phase: SessionPhase;
  readonly config: SessionConfig | null;
  /** Démarre une session : réinitialise les systèmes, charge la zone, puis émet 'session:started'. */
  start(config: SessionConfig): Promise<void>;
  /** Termine la session en cours et revient au menu (ou au compte rendu). */
  end(toDebrief?: boolean): void;
  pause(paused: boolean): void;
}

export interface Clock {
  /** Temps de session simulé (s), figé en pause. Pendant update(dt), c'est l'instant de FIN du pas courant. */
  readonly now: number;
  /** Pas de simulation courant (s). */
  readonly dt: number;
  /** Numéro d'image de simulation. */
  readonly tick: number;
  /** Multiplicateur de vitesse de simulation (avance rapide). */
  timeScale: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 17. Événements
// ─────────────────────────────────────────────────────────────────────────────────────

/** Carte des événements du jeu. Les modules communiquent surtout par ce biais. */
export interface GameEvents {
  // session
  'session:started': { config: SessionConfig };
  'session:ended': { toDebrief: boolean };
  'session:paused': { paused: boolean };
  'session:phase': { phase: SessionPhase; previous: SessionPhase };
  // monde
  'world:tile_loaded': { tx: number; tz: number };
  'world:tile_unloaded': { tx: number; tz: number };
  'env:hour': { hour: number };
  'env:weather': { weather: WeatherKind };
  // personnes
  'person:spawned': { id: EntityId };
  'person:removed': { id: EntityId };
  'person:hurt': { id: EntityId; info: DamageInfo; healthAfter: number };
  'person:down': { id: EntityId; injury: InjuryLevel; sourceId: EntityId };
  'person:recovered': { id: EntityId };
  'person:treated': { id: EntityId; byId: EntityId };
  'person:arrested': { id: EntityId; byId: EntityId; lawful: boolean };
  'person:handed_over': { id: EntityId; byId: EntityId };
  'person:released': { id: EntityId; byId: EntityId };
  'person:fled': { id: EntityId };
  'person:radicalized': { id: EntityId; from: ProtestProfile; to: ProtestProfile };
  // objets, projectiles
  'item:used': { personId: EntityId; item: ItemId; x: number; z: number; targetId: EntityId };
  'projectile:spawned': { id: EntityId; kind: ProjectileKind; ownerId: EntityId };
  'projectile:impact': { id: EntityId; kind: ProjectileKind; ownerId: EntityId; x: number; y: number; z: number; hitKind: RayHit['kind'] | 'ground'; hitId: EntityId };
  'projectile:returned': { id: EntityId; byId: EntityId };
  'projectile:removed': { id: EntityId };
  'explosion': { kind: ProjectileKind | 'vehicule'; x: number; y: number; z: number; radius: number; sourceId: EntityId };
  // dangers
  'fire:started': { x: number; z: number; targetKind: EntityKind | 'ground'; targetId: EntityId; sourceId: EntityId };
  'fire:out': { x: number; z: number; targetKind: EntityKind | 'ground'; targetId: EntityId; byId: EntityId };
  // décor
  'prop:spawned': { id: EntityId };
  'prop:removed': { id: EntityId };
  'prop:damaged': { id: EntityId; state: PropState; byId: EntityId };
  'prop:moved': { id: EntityId; byId: EntityId };
  'shop:window': { id: EntityId; state: WindowState; byId: EntityId };
  'shop:looted': { id: EntityId; byId: EntityId; amount: number };
  'shop:shutter': { id: EntityId; closed: boolean };
  'barricade:built': { id: EntityId; x: number; z: number };
  // véhicules
  'vehicle:spawned': { id: EntityId };
  'vehicle:removed': { id: EntityId };
  'vehicle:entered': { vehicleId: EntityId; personId: EntityId; seat: number };
  'vehicle:exited': { vehicleId: EntityId; personId: EntityId };
  'vehicle:collision': { vehicleId: EntityId; otherKind: EntityKind | 'world'; otherId: EntityId; speed: number; x: number; z: number };
  'vehicle:state': { id: EntityId; state: VehicleState };
  'vehicle:siren': { id: EntityId; siren: 0 | 1 | 2 };
  'vehicle:turret_fired': { id: EntityId; turret: number; byId: EntityId };
  // commandement, droit
  'order:issued': { squadId: number; order: SquadOrder };
  'radio:message': { msg: RadioMessage; t: number };
  'law:sommation': { stage: SommationStage; byId: EntityId; x: number; z: number; text: string };
  'law:offense': { personId: EntityId; offense: Offense };
  'law:force': { report: ForceReport };
  'law:authorized': { level: ForceLevel; byId: EntityId };
  // foule
  'crowd:phase': { phase: CrowdPhase; previous: CrowdPhase };
  'crowd:tension': { tension: number; delta: number; reason: string; x: number; z: number };
  'crowd:chant': { x: number; z: number; text: string; intensity: number };
  // joueur
  'player:possessed': { personId: EntityId; role: PlayableRole };
  'player:camera': { mode: CameraMode };
  'media:shot': { byId: EntityId; x: number; z: number; subject: string; value: number };
  // présentation (permettent à la simulation de demander un effet sans dépendre du rendu ni de l'audio)
  'fx': { id: FxId; x: number; y: number; z: number; size?: number; dirX?: number; dirY?: number; dirZ?: number; color?: number; seconds?: number };
  'sfx': { id: SoundId; x?: number; y?: number; z?: number; volume?: number; pitch?: number };
  // réglages
  'settings:changed': { key: keyof Settings };
}

export type EventName = keyof GameEvents;
export type Unsubscribe = () => void;

export interface EventBus {
  on<K extends EventName>(name: K, handler: (payload: GameEvents[K]) => void): Unsubscribe;
  once<K extends EventName>(name: K, handler: (payload: GameEvents[K]) => void): Unsubscribe;
  emit<K extends EventName>(name: K, payload: GameEvents[K]): void;
  /** Événements libres hors contrat (préfixe conseillé : nom du module). */
  onAny(name: string, handler: (payload: unknown) => void): Unsubscribe;
  emitAny(name: string, payload: unknown): void;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 18. Contexte de jeu et systèmes
// ─────────────────────────────────────────────────────────────────────────────────────

export interface Rng {
  /** Flottant uniforme [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /**
   * Générateur dérivé indépendant et déterministe : il ne dépend que de la graine d'origine et du label (il ne
   * consomme pas le parent ; même label → même flux). ctx.rng est re-semé avec config.seed au début de chaque
   * session, avant les reset() : créer ses dérivés dans reset() ou sur 'session:started', pas dans init().
   */
  fork(label: string | number): Rng;
}

/**
 * Contexte passé à tous les systèmes. Chaque service est fourni par un module ; tant qu'un module
 * n'est pas branché, un service « neutre » (sans effet, valeurs par défaut) le remplace, de sorte
 * que le jeu et les tests tournent avec n'importe quel sous-ensemble de modules.
 */
export interface GameContext {
  readonly events: EventBus;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly settings: SettingsApi;
  readonly save: SaveApi;
  readonly session: SessionApi;
  /** true hors navigateur (tests Node) : aucun rendu, aucun DOM. */
  readonly headless: boolean;

  // magasins d'entités
  people: PeopleStore;
  projectiles: ProjectileApi;
  vehicles: VehicleApi;
  props: PropApi;
  squads: SquadApi;

  // services de simulation
  world: WorldQuery;
  env: EnvApi;
  hazards: HazardApi;
  health: HealthApi;
  actions: ActionApi;
  interactions: InteractionApi;
  archetypes: ArchetypeApi;
  law: LawApi;
  director: DirectorApi;
  radio: RadioApi;
  player: PlayerApi;

  // présentation
  input: InputState;
  ui: UiApi;
  audio: AudioApi;
  /** null en mode headless. */
  view: ViewApi | null;

  /** Services supplémentaires définis par les modules (missions, carrière, médias…), typés par leur api.ts. */
  provide<T>(key: string, service: T): void;
  service<T>(key: string): T | undefined;
  /** Comme service(), mais lève une erreur explicite si absent. */
  require<T>(key: string): T;
  /** Alloue un identifiant d'entité unique. */
  newId(): EntityId;
}

/** Ordres d'exécution conseillés (croissants). */
export const SystemOrder = {
  INPUT: 100,
  /** Contrôleurs : le joueur et les IA écrivent les commandes. */
  CONTROL: 200,
  VEHICLES: 300,
  MOVEMENT: 400,
  /** Objets, projectiles, interactions. */
  ACTIONS: 500,
  HAZARDS: 600,
  /** Santé, états. */
  STATUS: 700,
  /** Droit, directeur de foule, missions, carrière. */
  RULES: 800,
  WORLD_VIEW: 900,
  VIEW: 1000,
  UI: 1100,
  AUDIO: 1200,
} as const;

export interface GameSystem {
  readonly id: string;
  readonly order: number;
  /** 1. Publier ses services dans le contexte (avant tout init). */
  provide?(ctx: GameContext): void;
  /** 2. Initialisation : tous les services sont disponibles. */
  init?(ctx: GameContext): void | Promise<void>;
  /** Simulation : pas variable borné (dt ≤ 0,05 s), non appelé en pause ni dans les menus. */
  update?(dt: number): void;
  /** Présentation : chaque image, même en pause (dt réel). Jamais appelé en mode headless. */
  frame?(dt: number): void;
  /** Remise à zéro entre deux sessions (avant le chargement de la suivante). */
  reset?(): void;
  dispose?(): void;
}

/** Chaque module exporte, depuis son index.ts, une fonction de ce type. */
export type ModuleFactory = () => GameSystem[];
