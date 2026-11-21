/* =====================================================================================
 * DÉCOR DYNAMIQUE — types publics du module (mobilier urbain, vitrines, feux d'objets, barricades).
 *
 * Les autres modules passent par ctx.props (PropApi du contrat). Ce fichier décrit en plus le
 * service étendu, obtenu par
 *     ctx.service<PropsExtApi>(PROPS_EXT_SERVICE)          // clé « props.ext »
 * (`import type` autorisé depuis ce fichier), utile au rendu (composition d'une barricade, état d'un
 * rideau de fer), aux IA (mettre le feu, porter un objet) et aux missions (fermer des rideaux).
 *
 * Événements du contrat émis : prop:spawned / removed / damaged / moved, shop:window / looted /
 * shutter, barricade:built, fire:started / fire:out (targetKind 'prop' ou 'shop'), fx, sfx.
 * Événements libres (ctx.events.onAny) :
 *   'props:barricade_extended'  BarricadeEvent   une barricade existante a absorbé de nouveaux objets
 *   'props:barricade_cleared'   BarricadeEvent   barricade démontée, enfoncée ou dissoute
 *   'props:glass'               GlassEvent       un vitrage de mobilier a éclaté (abribus, panneau…)
 *   'props:shutter_forced'      { id, byId }     un rideau de fer a cédé
 *   'hazards:douse'             ÉCOUTÉ : { x, z, radius, amount } — l'eau ou la poudre éteint nos feux
 * Verbes d'interaction fournis : renverser, pousser, porter, deposer, depaver, ramasser, piller,
 * degager, eteindre, incendier (cibles : objets du décor et vitrines).
 * ===================================================================================== */

import type { EntityId, ItemId, Person, Prop, PropKind, Shop, ShopCategory } from '@/core/contracts';

/** Clé du service étendu publié par le module. */
export const PROPS_EXT_SERVICE = 'props.ext';

/**
 * Clé de SessionConfig.extra sous laquelle une mission peut fournir des réglages (PropsTuning partiel)
 * appliqués dès le chargement de la session : { extra: { props: { ambientDensity: 0.3 } } }.
 */
export const SESSION_EXTRA_KEY = 'props';

export const BARRICADE_EXTENDED_EVENT = 'props:barricade_extended';
export const BARRICADE_CLEARED_EVENT = 'props:barricade_cleared';
export const GLASS_EVENT = 'props:glass';
export const SHUTTER_FORCED_EVENT = 'props:shutter_forced';

export type PropMaterial = 'plastique' | 'metal' | 'bois' | 'verre' | 'pierre' | 'composite';

/** Façon dont un objet se renverse : jamais, couché sur le flanc (bac), à plat (barrière, vélo). */
export type ToppleMode = 'none' | 'lie' | 'flat';

/** Façon dont une personne peut emporter l'objet : non, porté à bout de bras, roulé ou traîné. */
export type CarryMode = 'non' | 'porte' | 'roule';

/** Gabarit réaliste d'un type d'objet (lecture seule). */
export interface PropDef {
  readonly kind: PropKind;
  /** Nom français avec article, pour les invites (« la poubelle »). */
  readonly label: string;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
  readonly hp: number;
  /** Masse (kg). */
  readonly mass: number;
  readonly material: PropMaterial;
  readonly movable: boolean;
  readonly blocksMove: boolean;
  readonly blocksSight: boolean;
  /** Vitrage : points de vie cumulés du verre (0 = aucun) et nombre de panneaux qui éclatent un à un. */
  readonly glassHp: number;
  readonly panes: number;
  /** Le vitrage est hors de portée d'un coup porté à la main (caméra sur mât). */
  readonly glassHigh: boolean;
  /** Combustible (s de feu, 0 = incombustible) et exposition à la flamme avant de prendre (s). */
  readonly fuel: number;
  readonly igniteSeconds: number;
  /** Rayon de chaleur (m) et intensité 0..1 du foyer à pleine combustion. */
  readonly flameRadius: number;
  readonly flameIntensity: number;
  /** Fumée : unités par seconde à pleine combustion, rayon (m), couleur 0xRRGGBB. */
  readonly smokeRate: number;
  readonly smokeRadius: number;
  readonly smokeColor: number;
  /** Agent extincteur nécessaire (1 ≈ une seconde de jet d'extincteur) et reprise du feu (unités/s). */
  readonly douseNeed: number;
  readonly recovery: number;
  /** Batterie (vélo ou trottinette électrique) : embrasement violent, reprises de feu. */
  readonly battery: number;
  /** Après combustion : hauteur restante (facteur) et obstacle ou non. */
  readonly burntHeight: number;
  readonly burntBlocks: boolean;
  /** Vitesse communiquée par unité de poussée (1 = objet léger), frottement au sol (m/s²). */
  readonly pushFactor: number;
  readonly friction: number;
  readonly topple: ToppleMode;
  /** Vitesse de poussée qui renverse (m/s) et durée du geste « renverser » (s). */
  readonly toppleSpeed: number;
  readonly toppleSeconds: number;
  /** Renversé, l'objet gêne encore le passage. */
  readonly toppledBlocks: boolean;
  /** Cassé, l'objet gêne encore le passage. */
  readonly brokenBlocks: boolean;
  readonly carry: CarryMode;
  /** Volume apporté à une barricade (0 = n'en fait pas partie). */
  readonly bulk: number;
  /** Ce qu'on peut y prendre (pavés d'une pile, bouteilles d'une colonne à verre…). */
  readonly yieldItem: ItemId | null;
  readonly yieldPer: number;
  readonly yieldStock: number;
  readonly yieldSeconds: number;
  /** Débris laissés à la casse (nombre d'objets 'debris'). */
  readonly debris: number;
  /** Attrait pour les casseurs 0..1 (banques, publicité, abribus, caméras en tête). */
  readonly targetAppeal: number;
}

/** Élément d'une barricade, dans le repère de celle-ci (x le long de la barricade, z en travers). */
export interface BarricadePart {
  readonly kind: PropKind;
  readonly lx: number;
  readonly lz: number;
  /** Cap de l'élément relatif à celui de la barricade. */
  readonly heading: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
}

export interface BarricadeEvent {
  id: EntityId;
  x: number;
  z: number;
  /** Nombre d'éléments après l'événement. */
  parts: number;
  byId: EntityId;
}

export interface GlassEvent {
  id: EntityId;
  /** Panneaux encore intacts. */
  panesLeft: number;
  byId: EntityId;
}

/** État détaillé d'une vitrine (au-delà des champs du contrat). */
export interface ShopView {
  /** La boutique a un rideau de fer. */
  hasShutter: boolean;
  /** Le rideau a été forcé : il ne se referme plus et ne protège plus. */
  forced: boolean;
  /** Position visée par le commerçant (0 levé, 1 baissé). */
  shutterTarget: number;
  /** Résistance restante du rideau 0..1. */
  shutterHealth: number;
  /** Résistance restante du vitrage 0..1. */
  glass: number;
  /** Vitrage renforcé (banque, luxe, bijouterie). */
  reinforced: boolean;
  /** Panneaux de bois posés avant la manifestation, résistance restante 0..1 (0 = aucun). */
  boards: number;
  tags: number;
  /** La boutique a entièrement brûlé. */
  burnt: boolean;
  /** Nombre de personnes qui peuvent piller en même temps. */
  maxOccupants: number;
  /** Nombre de charges de butin restantes. */
  lootLeft: number;
}

/** Détail d'un objet (au-delà des champs du contrat). */
export interface PropView {
  def: PropDef;
  maxHp: number;
  /** Panneaux vitrés encore intacts. */
  panesLeft: number;
  /** Progression vers l'embrasement 0..1. */
  heat: number;
  /** Combustible initial (s). */
  fuelMax: number;
  /** Batterie présente (reprises de feu possibles). */
  battery: boolean;
  /** Ressource restante à ramasser (pavés, bouteilles…). */
  yieldLeft: number;
  /** Dernière personne à avoir déplacé l'objet (0 si aucune). */
  movedBy: EntityId;
}

/** Compteurs, pour l'affichage de débogage, les incidents et les tests. */
export interface PropsStats {
  props: number;
  shops: number;
  awake: number;
  moving: number;
  carried: number;
  burning: number;
  burningShops: number;
  barricades: number;
  /** Tuiles peuplées et tuiles en attente de peuplement. */
  tiles: number;
  pendingTiles: number;
  /** Compteurs de session. */
  windowsBroken: number;
  looted: number;
  firesStarted: number;
  barricadesBuilt: number;
}

/**
 * Réglages du module, modifiables à chaud. Ils reviennent aux valeurs par défaut au début de chaque
 * session (puis reçoivent SessionConfig.extra.props, voir SESSION_EXTRA_KEY) et par resetTuning().
 */
export interface PropsTuning {
  /** Mobilier ajouté quand la carte en manque : 0 = rien, 1 = normal, 2 = dense. */
  ambientDensity: number;
  /** Mise en sommeil des objets loin de toute personne. */
  dormancy: boolean;
  /** Rayon d'éveil autour du joueur (m). */
  wakeRadius: number;
  /** Les commerçants baissent leur rideau quand la tension monte. */
  shopkeepers: boolean;
  /** Multiplicateurs généraux. */
  damageScale: number;
  fireSpread: number;
  /** Poussée des objets par la lame des engins : 'auto' = seulement si aucun module de véhicules n'est branché. */
  blade: 'auto' | 'on' | 'off';
  /** Objets traités par pas lors du peuplement d'une tuile en cours de jeu. */
  populateBudget: number;
  /** Déclarer les infractions et la tension (désactivable pour un bac à sable). */
  consequences: boolean;
}

export interface PropsExtApi {
  readonly tuning: PropsTuning;
  resetTuning(): void;
  readonly stats: Readonly<PropsStats>;
  /** Gabarit d'un type d'objet (générique si inconnu). */
  def(kind: PropKind): PropDef;
  /** Détail d'un objet créé par ce module ; null pour un objet étranger. `out` réutilisable. */
  propView(prop: Prop, out?: PropView): PropView | null;
  shopView(shop: Shop, out?: ShopView): ShopView | null;
  /** Éléments d'une barricade (tableau stable tant que la barricade ne change pas ; vide sinon). */
  barricadeParts(id: EntityId): readonly BarricadePart[];
  /** Met le feu à un objet combustible. false s'il ne peut pas brûler (incombustible, mouillé, déjà calciné). */
  ignite(prop: Prop, byId: EntityId): boolean;
  extinguish(prop: Prop, byId: EntityId): void;
  igniteShop(shop: Shop, byId: EntityId): boolean;
  extinguishShop(shop: Shop, byId: EntityId): void;
  /** Renverse un objet dans une direction. */
  topple(prop: Prop, dirX: number, dirZ: number, byId: EntityId): boolean;
  /** Fait porter (ou rouler) un objet par une personne ; drop() le repose devant elle. */
  carry(prop: Prop, by: Person): boolean;
  drop(by: Person): boolean;
  /** Le pillage de cette vitrine aboutirait-il maintenant ? */
  lootable(shop: Shop): boolean;
  /** Ordonne le rideau d'une boutique (mission, commerçant joué) ; instant = sans délai de manœuvre. */
  setShutter(shop: Shop, closed: boolean, instant?: boolean): boolean;
  /** Type de mobilier de la carte → type d'objet du jeu ('' si la carte ne doit rien créer). */
  mapKind(kind: string): PropKind | '';
  /** Catégorie → nom d'enseigne fictif (déterministe pour une graine donnée). */
  shopName(category: ShopCategory, seed: number): string;
  /** Termine tout de suite le peuplement des tuiles en attente. */
  flushTiles(): void;
  /** Peuple (ou repeuple) une tuile d'après ctx.world ; retourne le nombre d'objets créés. */
  populateTile(tx: number, tz: number): number;
}
