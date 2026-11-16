/* =====================================================================================
 * MATÉRIEL — types publics du module (objets, usage, projectiles).
 *
 * Les autres modules passent par ctx.actions (ActionApi) et ctx.projectiles (ProjectileApi).
 * Ce fichier décrit le service étendu, facultatif, publié sous la clé « items » :
 *     const items = ctx.service<ItemsApi>(ITEMS_SERVICE);
 * (`import type` autorisé depuis ce fichier, jamais depuis le reste du dossier.)
 * ===================================================================================== */

import type {
  DamageKind, EntityId, ForceMeans, InteractVerb, ItemId, Person, ProjectileKind, SoundId, UpperAnim,
  UseOptions, UseResult, Vec3,
} from '@/core/contracts';

/** Clé du service étendu. */
export const ITEMS_SERVICE = 'items';

/** Événement libre émis par la télécommande de drone : { personId }. */
export const DRONE_TOGGLE_EVENT = 'drone:toggle';
/** Événement libre émis quand une lampe ou un masque change d'état : { personId, item, on }. */
export const ITEM_TOGGLE_EVENT = 'items:toggle';
/** Événement libre émis quand le dispositif de propulsion du lanceur de 56 mm change : { personId, range }. */
export const LAUNCHER_RANGE_EVENT = 'items:launcher_range';

/** Portées du lanceur de 56 mm selon le dispositif de propulsion (m). */
export type LauncherRange = 50 | 100 | 200;

// ───────────────────────────── paramètres d'emploi des objets ─────────────────────────────

/** Famille d'usage : détermine ce que fait use(). */
export type ItemUse =
  | 'shield' | 'melee' | 'racket'
  | 'spray_gas' | 'spray_powder' | 'spray_water' | 'spray_paint'
  | 'throw' | 'launch'
  | 'megaphone' | 'radio' | 'interact' | 'media'
  | 'lamp' | 'mask' | 'sign' | 'umbrella' | 'drone' | 'drop';

/** Façon de viser, pour solveAim. */
export type AimStyle =
  /** Lancer en cloche à la main : angle préféré, puissance ajustée. */
  | 'lob'
  /** Tir tendu à vitesse fixe. */
  | 'direct'
  /** Tir en cloche obligatoire (lanceur de 56 mm) : jamais sous l'angle minimal. */
  | 'cloche'
  /** Objet roulé au sol à retard court : c'est le point atteint à la fin du retard qui est visé. */
  | 'timed'
  /** Tir vers le ciel (fusée). */
  | 'up';

export interface LaunchSpec {
  /** Vitesse initiale à pleine puissance (m/s), pour une personne de carrure moyenne et reposée. */
  speed: number;
  /** Part de cette vitesse à puissance 0 (1 = vitesse fixe : armes et lanceurs). */
  minFraction: number;
  /** Lancer à la main : la force de la personne module la vitesse. */
  byHand: boolean;
  aim: AimStyle;
  /** Angle ajouté au site de visée (rad) : lancer naturellement relevé, inclinaison de crosse, hausse. */
  loft: number;
  /** Bornes de l'angle de départ réel (rad). */
  pitchMin: number;
  pitchMax: number;
  /** Angle de départ que solveAim préfère (rad). */
  preferredPitch: number;
  /** Dispersion angulaire de base (écart-type, rad) et dispersion relative de vitesse. */
  spread: number;
  speedSpread: number;
  /** Hauteur du point de départ en fraction de la taille de la personne, et avancée (m). */
  heightFactor: number;
  forward: number;
  sound: SoundId;
  /** Endurance dépensée par usage. */
  stamina: number;
}

export interface MeleeSpec {
  /** Allonge (m) depuis l'axe du corps, et demi-angle de l'arc de frappe (rad). */
  reach: number;
  arc: number;
  damage: number;
  stun: number;
  knockback: number;
  kind: DamageKind;
  /** Dégâts infligés à une vitrine et à un objet du décor par coup. */
  shopDamage: number;
  propDamage: number;
  /** Instant de l'impact après le début du geste (s). */
  delay: number;
  stamina: number;
}

export interface SpraySpec {
  /** Portée du cône (m) et demi-angle (rad). */
  range: number;
  halfAngle: number;
  /** Durée d'un jet déclenché par un usage (s). */
  burst: number;
}

export interface ItemSpec {
  id: ItemId;
  use: ItemUse;
  /** Quantité donnée par give() quand `count` est omis (charge complète pour les objets à réservoir). */
  dotation: number;
  /**
   * 'unit'   : chaque usage consomme une unité ; la pile disparaît de l'inventaire à zéro (grenades, pavés…) ;
   * 'charge' : chaque usage consomme une charge ; l'objet reste en main, vide (gazeuse, lanceur, LBD…) ;
   * 'none'   : rien n'est consommé.
   */
  consume: 'unit' | 'charge' | 'none';
  /** Temps de mise en main (s) : délai imposé à la sélection. */
  drawTime: number;
  /** Durée de l'animation d'usage (s). */
  useTime: number;
  /** Utilisable assis dans un véhicule. */
  seated: boolean;
  launch: LaunchSpec | null;
  melee: MeleeSpec | null;
  spray: SpraySpec | null;
  /** Verbe d'interaction lancé sur la personne visée (menottes, soins…). */
  verb: InteractVerb | null;
  /** Animation du mode secondaire (null : pose de repos conservée). */
  altAnim: UpperAnim | null;
}

// ───────────────────────────── paramètres physiques des projectiles ─────────────────────────────

/** Gabarit d'un projectile : sert à savoir ce qui l'arrête (bouclier, parapluie, banderole). */
export type ProjectileClass = 'small' | 'heavy' | 'grenade' | 'lbd' | 'bullet' | 'firework' | 'fire';

/** Ce que fait le projectile au contact du sol, d'un obstacle ou d'une personne. */
export type ContactAction = 'bounce' | 'stop' | 'shatter' | 'ignite' | 'explode' | 'splat' | 'remove';

/** Ce qui se passe à la fin du retard. */
export type FuseAction = 'none' | 'burst' | 'gm2l' | 'sting' | 'firework' | 'smoke' | 'flare' | 'remove';

export interface ProjectileSpec {
  kind: ProjectileKind;
  cls: ProjectileClass;
  /** Masse (kg) et rayon de collision (m). */
  mass: number;
  radius: number;
  /** Coefficient de traînée k (1/m) : décélération = k × |v relative à l'air|². */
  drag: number;
  /** Rebond : part de la vitesse normale restituée, part de la vitesse tangentielle perdue. */
  restitution: number;
  friction: number;
  /** Décélération au sol (roulement ou glissement) en fraction de g. */
  roll: number;
  /** Retard par défaut (s) ; Infinity = aucun. */
  fuse: number;
  fuseAction: FuseAction;
  onGround: ContactAction;
  onWall: ContactAction;
  onPerson: ContactAction;
  /** Dégâts au contact d'une personne : base + parJoule × énergie cinétique ; multiplicateur à la tête et aux jambes. */
  damageBase: number;
  damagePerJoule: number;
  headFactor: number;
  legFactor: number;
  damageKind: DamageKind;
  /** Étourdissement de base (s) et par point de dégâts. */
  stunBase: number;
  stunPerDamage: number;
  /** Durée de vie au repos (s) avant disparition. */
  lifetime: number;
  /** Ramassable / renvoyable une fois au sol. */
  pickable: boolean;
  /** Vitesse de rotation propre en vol (rad/s). */
  spinRate: number;
  /** Moyen de force déclaré dans les dégâts quand le tireur est policier ou gendarme. */
  means: ForceMeans | null;
  /** Objet à l'origine (pour DamageInfo.item). */
  item: ItemId | null;
}

// ───────────────────────────── réglages ─────────────────────────────

/** Réglages modifiables en cours de partie (options d'accessibilité, tests, bancs d'essai). */
export interface ItemsTuning {
  /** Multiplicateur global de la dispersion (0 = tirs parfaits). */
  dispersion: number;
  /** Multiplicateur de dispersion appliqué au joueur (son imprécision vient déjà de sa main). */
  playerDispersion: number;
  /** Probabilité qu'un PNJ réussisse à renvoyer un palet (le joueur réussit toujours). */
  returnSuccess: number;
  /** Lacrymogène émis par un palet (unités de concentration par seconde) et rayon du dépôt (m). */
  paletGasRate: number;
  paletGasRadius: number;
  /** Multiplicateur général des dégâts infligés par les objets et projectiles. */
  damageScale: number;
}

// ───────────────────────────── service étendu ─────────────────────────────

export interface ItemsApi {
  readonly tuning: ItemsTuning;
  /** Paramètres d'emploi d'un objet (lecture seule). */
  spec(id: ItemId): Readonly<ItemSpec> | undefined;
  /** Paramètres physiques d'un type de projectile (gabarit « débris » pour un type inconnu). */
  projectileSpec(kind: ProjectileKind): Readonly<ProjectileSpec>;
  /** Usage d'un objet de l'inventaire sans changer l'objet en main (masque, lampe, radio…). */
  useItem(p: Person, id: ItemId, opts?: UseOptions): UseResult;
  /** Dispositif de propulsion sélectionné sur le lanceur de 56 mm de cette personne. */
  launcherRange(p: Person): LauncherRange;
  setLauncherRange(p: Person, range: LauncherRange): void;
  /** Bouclier en main et levé. */
  shieldRaised(p: Person): boolean;
  /** Parapluie en main et ouvert. */
  umbrellaOpen(p: Person): boolean;
  lampOn(p: Person): boolean;
  maskOn(p: Person): boolean;
  /** Un parapluie ouvert masque-t-il ce point aux caméras (drone, journalistes) ? */
  concealedAt(x: number, z: number): boolean;
  /** Renvoie un projectile ramassable dans la direction de visée de la personne. false si impossible ou raté. */
  returnProjectile(p: Person, projectileId: EntityId, power?: number): boolean;
  /**
   * Aide à la visée : point de chute prévu (sol plat à hauteur des pieds, sans obstacle) pour l'objet en main,
   * la visée courante et la puissance donnée. false si l'objet ne lance rien.
   */
  predictImpact(p: Person, power: number, out: Vec3): boolean;
  /**
   * Trajectoire prévue : écrit des triplets (x, y, z) dans `out` (tronqué au nombre écrit) et retourne le
   * nombre de points (au plus maxPoints).
   */
  sampleTrajectory(p: Person, power: number, out: number[], maxPoints?: number): number;
}
