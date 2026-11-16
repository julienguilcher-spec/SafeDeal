/* =====================================================================================
 * FOULE — types publics du module src/sim/crowd (à importer en `import type` depuis les autres modules).
 *
 * Services publiés :
 *   ctx.director                               DirectorApi du contrat (phase, tension, carte de tension, stats,
 *                                              parcours déclaré, progression de la tête) ;
 *   ctx.service<MetroApi>(EXT.metro)           stations, affluence, fermeture, filtrage (extensions.ts) ;
 *   ctx.service<CrowdCoreApi>(CROWD_CORE)      cœur de la foule : registre de contrôleurs de comportement par
 *                                              profil, groupes, perception, navigation, cortège, aléas.
 *
 * Événements du contrat émis : crowd:phase, crowd:tension, crowd:chant, person:fled, person:radicalized, sfx.
 * Événements libres (ctx.events.onAny) :
 *   'crowd:alea'      AleaEvent        un aléa commence ou se termine
 *   'crowd:density'   DensityEvent     alerte de compression (≥ 4 personnes/m²) ou danger (≥ 5)
 *   'crowd:metro'     MetroEvent       vague sortie d'une station, fermeture, réouverture, filtrage, report de flux
 *   'crowd:announce'  AnnounceEvent    annonce des organisateurs (départ, arrêt, arrivée, dispersion, prise de parole)
 *   'crowd:help'      HelpEvent        la foule appelle les secours pour un blessé
 *   'crowd:kettle'    KettleEvent      une partie de la foule se sait encerclée (ou ne l'est plus)
 *
 * Clés lues dans SessionConfig.extra (toutes facultatives) :
 *   cause                 string   identifiant de cause (« retraites », « climat »…) — écrit par la page d'accueil
 *   composition           objet    part de chaque famille visuelle — écrit par la page d'accueil
 *   derapage              string   'foule' | 'les_deux' : parts de radicaux et de suiveurs × 1,5 (bible F.1)
 *   options.metro         'ferme'  stations du secteur fermées dès le départ (l'interface le fait aussi par MetroApi)
 *   crowd.scenario        string   type de journée : 'marche_calme' | 'journee_tendue' | 'samedi_sans_organisateur'
 *                                  | 'soir_spontane' | 'soir_de_match'
 *   crowd.route           number[] parcours imposé [x0, z0, x1, z1, …] ; ou string[] : lieux à relier dans l'ordre
 *   crowd.routeId         string   identifiant d'un parcours de la table (voir routes-data.ts)
 *   crowd.destination     string | {x, z}  lieu d'arrivée (le trajet est calculé par les rues)
 *   crowd.static          boolean  rassemblement statique : pas de marche
 *   crowd.closedStations  (string | number)[]  noms (ou identifiants) de stations fermées au départ
 *   crowd.aleas           string[] aléas imposés (identifiants du catalogue) ; crowd.noAleas : true pour aucun
 *   crowd.present         number   part de la foule déjà sur place au début (défaut 0,3)
 *   crowd.sono            boolean  forcer ou interdire le camion sono
 *   crowd.bystanders      number   nombre de badauds en lisière
 *   crowd.none            boolean  aucune manifestation (patrouille)
 * ===================================================================================== */

import type {
  CrowdPhase, EntityId, Person, PersonInit, ProtestProfile, Vec2,
} from '@/core/contracts';
import type { MetroApi } from '@/core/extensions';
import type { CrowdBrain } from './brain';

export type { CrowdBrain } from './brain';

export const CROWD_CORE = 'crowd.core';
export const CROWD_CONTROL_SYSTEM = 'sim:crowd.control';
export const CROWD_DIRECTOR_SYSTEM = 'sim:crowd.director';

export const ALEA_EVENT = 'crowd:alea';
export const DENSITY_EVENT = 'crowd:density';
export const METRO_EVENT = 'crowd:metro';
export const ANNOUNCE_EVENT = 'crowd:announce';
export const HELP_EVENT = 'crowd:help';
export const KETTLE_EVENT = 'crowd:kettle';

/** Famille visuelle (mêmes identifiants et même ordre que le module des archétypes : look.extras.family). */
export type CrowdFamily =
  | 'divers' | 'gilets_jaunes' | 'syndical' | 'etudiants' | 'climat' | 'soignants' | 'agriculteurs' | 'retraites'
  | 'familles' | 'black_bloc';

export const FAMILIES: readonly CrowdFamily[] = [
  'divers', 'gilets_jaunes', 'syndical', 'etudiants', 'climat', 'soignants', 'agriculteurs', 'retraites', 'familles',
  'black_bloc',
];

export type CrowdScenario =
  | 'marche_calme' | 'journee_tendue' | 'samedi_sans_organisateur' | 'soir_spontane' | 'soir_de_match';

export interface ChantText { call: string; response: string }

/** Cause de la manifestation du jour, telle que la foule s'en sert. */
export interface CrowdCause {
  id: string;
  label: string;
  summary: string;
  /** Index dans le service 'roles.causes' (−1 s'il est absent). */
  index: number;
  chants: readonly ChantText[];
  /** Organisations FICTIVES qui appellent (noms affichables). */
  orgs: readonly string[];
  color: number;
}

// ───────────────────────────── événements libres ─────────────────────────────

export interface AleaEvent {
  id: string;
  label: string;
  /** 0 = sans gravité, 1 = friction, 2 = sérieux. */
  gravity: number;
  stage: 'debut' | 'fin';
  x: number;
  z: number;
}

export interface DensityEvent {
  level: 'alerte' | 'danger' | 'fin';
  /** Densité équivalente (personnes/m²). */
  density: number;
  x: number;
  z: number;
  /** Personnes dans la zone comprimée. */
  people: number;
}

export interface MetroEvent {
  type: 'vague' | 'fermeture' | 'ouverture' | 'filtrage' | 'report';
  stationId: number;
  name: string;
  /** Personnes concernées (vague sortie, flux reporté). */
  count: number;
  /** Station qui reçoit le report (0 sinon). */
  toStationId: number;
}

export interface AnnounceEvent {
  kind: 'prise_de_parole' | 'depart' | 'arret' | 'reprise' | 'arrivee' | 'dispersion' | 'consigne';
  text: string;
  x: number;
  z: number;
}

export interface HelpEvent { personId: EntityId; byId: EntityId; x: number; z: number }
export interface KettleEvent { enclosed: boolean; x: number; z: number; people: number }

// ───────────────────────────── groupes, cortège, issues ─────────────────────────────

export type GroupKind = 'amis' | 'famille' | 'section' | 'noyau' | 'delegation';

/** Groupe d'affinité : des personnes venues ensemble, qui restent ensemble et repartent ensemble. */
export interface CrowdGroup {
  readonly id: number;
  kind: GroupKind;
  /** Unité correspondante dans ctx.squads (type 'affinite'). */
  squadId: number;
  members: EntityId[];
  profile: ProtestProfile;
  family: CrowdFamily;
  /** Tronçon du cortège (index dans FormationView.sections, −1 hors cortège). */
  section: number;
  /** 0..1 : tirage commun du groupe pour les départs (sommations, dispersion). */
  docility: number;
  /** Instant de départ décidé pour tout le groupe (Infinity : aucun). */
  leaveAt: number;
  /** Issue retenue (index dans CrowdCoreApi.exits, −1). */
  exit: number;
  /** Itinéraire commun vers l'issue. */
  path: number[] | null;
}

export type SectionKind = 'precortege' | 'carre' | 'bloc' | 'divers' | 'queue';

export interface CortegeSection {
  readonly index: number;
  kind: SectionKind;
  /** Libellé français (« Carré de tête », « Cortège syndical »…). */
  label: string;
  family: CrowdFamily;
  /** Unité ctx.squads de type 'cortege'. */
  squadId: number;
  /** Premier et dernier bloc de la chaîne. */
  firstBlock: number;
  lastBlock: number;
  /** Personnes prévues dans le tronçon. */
  size: number;
}

/** Point du parcours : position sur l'axe, tangente unitaire, couloir utilisable. */
export interface RoutePoint {
  x: number;
  z: number;
  /** Tangente unitaire (sens de la marche). */
  tx: number;
  tz: number;
  /** Décalage du milieu du couloir par rapport à l'axe (m, positif à droite du sens de marche). */
  center: number;
  /** Demi-largeur utilisable par le cortège (m). */
  half: number;
  /** Étirement du cortège à cet endroit (1 = largeur de référence). */
  stretch: number;
}

export interface FormationView {
  /** Abscisse de la tête et de la queue le long du parcours (m). */
  readonly headS: number;
  readonly tailS: number;
  /** Vitesse de la tête (m/s). */
  readonly headSpeed: number;
  /** La tête est à l'arrêt volontaire (arrêt de marche, barrage, aléa). */
  readonly halted: boolean;
  /** Motif de l'arrêt en cours ('' si aucun) : 'pause' | 'barrage' | 'alea:…' | 'arrivee'. */
  readonly haltReason: string;
  readonly sections: readonly CortegeSection[];
  readonly blockCount: number;
  /** Abscisse et vitesse d'un bloc de la chaîne. */
  blockS(block: number): number;
  blockSpeed(block: number): number;
  /** Bloc d'une personne (−1 si elle n'a pas de place dans le cortège). */
  blockOf(p: Person): number;
  /** Position de l'emplacement d'une personne ; false si elle n'en a pas. */
  slotPosition(p: Person, out: Vec2): boolean;
  /** Arrête la tête `seconds` secondes (motif libre). */
  halt(seconds: number, reason: string): void;
  /** Arrête un bloc (et, par accordéon, ceux qui le suivent). */
  holdBlock(block: number, seconds: number): void;
  /** Véhicule sono (0 s'il n'y en a pas). */
  readonly sonoVehicleId: EntityId;
}

export interface CrowdExit {
  readonly index: number;
  kind: 'metro' | 'rue';
  x: number;
  z: number;
  /** Station (identifiant MetroApi) pour une bouche, 0 sinon. */
  stationId: number;
  open: boolean;
}

/** Ce que l'on voit des forces de l'ordre autour d'un point. */
export interface PoliceSight {
  /** Agent le plus proche. */
  id: EntityId;
  x: number;
  z: number;
  dist: number;
  /** Agents dans le rayon demandé. */
  count: number;
  /** Vitesse de rapprochement du plus proche (m/s, positive s'il vient vers le point). */
  closing: number;
}

export interface AleaInfo {
  id: string;
  label: string;
  gravity: number;
  /** Instant prévu (s de session) ; −1 si non tiré pour cette mission. */
  at: number;
  /** 'prevu' | 'en_cours' | 'termine' | 'ecarte' (conditions non réunies) | '' (non tiré). */
  status: string;
}

// ───────────────────────────── contrôleurs de comportement ─────────────────────────────

/**
 * Contrôleur de comportement : prend la main sur les personnes d'un profil. Le cœur le consulte à chaque
 * réflexion de la personne (quelques fois par seconde), APRÈS avoir tenu ses émotions à jour et écarté les
 * cas où personne ne pilote (joueur, personne à terre, interpellée, à bord d'un véhicule).
 */
export interface BehaviorController {
  readonly id: string;
  /** Plus grand = consulté d'abord (défaut 0). */
  readonly priority?: number;
  /**
   * Réflexion. Retourner true pour prendre (ou garder) la main : l'état de la personne devient S.CUSTOM et le
   * cœur ne décide rien pour elle à ce tour. Retourner false pour laisser le comportement par défaut (un
   * radical sans contrôleur se conduit comme un militant agité). `dt` : temps depuis sa dernière réflexion (s).
   */
  think(p: Person, brain: CrowdBrain, core: CrowdCoreApi, dt: number): boolean;
  /**
   * Pilotage à chaque pas quand le contrôleur a la main. S'il est absent, le cœur conduit la personne vers
   * (brain.tx, brain.tz) à brain.speed (au pas de course si brain.run), en suivant brain.path s'il existe :
   * il suffit alors d'appeler core.goTo() dans think().
   */
  steer?(p: Person, brain: CrowdBrain, core: CrowdCoreApi, dt: number): void;
  /** Le contrôleur perd la main (retour au comportement par défaut) ou la personne quitte le jeu. */
  release?(p: Person, brain: CrowdBrain): void;
}

export interface SpawnOptions extends Omit<PersonInit, 'kind' | 'x' | 'z' | 'profile'> {
  family?: CrowdFamily;
  /** false : ne compte pas dans les statistiques de la manifestation (défaut true). */
  counted?: boolean;
  /** Groupe d'affinité auquel le rattacher (identifiant CrowdGroup.id). */
  group?: number;
}

/** Service 'crowd.core'. */
export interface CrowdCoreApi {
  /** Une manifestation est en cours dans cette session. */
  readonly active: boolean;
  /** Personnes pilotées par le module (tableau interne : ne pas le modifier ni le conserver). */
  readonly members: readonly Person[];
  readonly groups: readonly CrowdGroup[];
  /** Phase du déroulé, sans les états superposés « tension » et « affrontement ». */
  readonly basePhase: CrowdPhase;
  readonly cause: Readonly<CrowdCause>;
  readonly volatility: number;
  /** Échelle de temps de la mission (1 = durée standard de 25 min). */
  readonly timeScale: number;
  readonly formation: FormationView;
  readonly metro: MetroApi;
  readonly exits: readonly CrowdExit[];
  readonly aleas: readonly AleaInfo[];

  /** Mémoire de foule d'une personne (null si le module ne la pilote pas). */
  brain(p: Person): CrowdBrain | null;
  group(id: number): CrowdGroup | undefined;

  // ── registre de contrôleurs ──
  /** Enregistre un contrôleur pour un profil ('*' : tous). Retourne la fonction de retrait. */
  registerController(profile: ProtestProfile | 'badaud' | '*', controller: BehaviorController): () => void;

  // ── émotions, légitimité, tension ──
  tensionAt(x: number, z: number): number;
  /** Légitimité perçue de l'action des forces (0..1) et cohésion (0..1) du tronçon de 50 m. */
  legitimacyAt(x: number, z: number): number;
  cohesionAt(x: number, z: number): number;
  addLegitimacy(x: number, z: number, delta: number): void;
  addCohesion(x: number, z: number, delta: number): void;
  /** Ajoute peur et colère aux personnes de la foule dans un rayon (atténuation avec la distance) ; retourne leur nombre. */
  stir(x: number, z: number, radius: number, fear: number, anger: number): number;
  /** Signale un acte violent visible (rend « justifiée » une riposte proche pendant 60 s). */
  markViolence(x: number, z: number): void;
  recentViolence(x: number, z: number, radius?: number): boolean;

  // ── perception ──
  /** Forces de l'ordre à pied dans le rayon ; false si aucune. */
  nearestPolice(x: number, z: number, radius: number, out: PoliceSight): boolean;
  /** Manifestants dans le rayon (couverture pour agir, densité). */
  coverAt(x: number, z: number, radius: number): number;
  /** Densité équivalente à cet endroit (personnes/m²). */
  densityAt(x: number, z: number): number;
  /** Point du parcours à l'abscisse s. */
  routePoint(s: number, out: RoutePoint): void;

  // ── navigation ──
  /** Fixe la destination d'une personne (itinéraire par les rues demandé si elle est loin ou masquée). */
  goTo(p: Person, x: number, z: number, speed?: number, run?: boolean): void;
  /** Fait quitter la manifestation à une personne (issue la plus adaptée par défaut) : elle est retirée une fois sortie. */
  leave(p: Person, exit?: number): void;
  /** Rend une personne au comportement par défaut à son prochain tour de réflexion. */
  release(p: Person): void;

  // ── population ──
  /** Crée un manifestant pris en charge par le module (hors cortège : il se place en queue ou suit son contrôleur). */
  spawn(profile: ProtestProfile, x: number, z: number, opts?: SpawnOptions): Person | null;
  /** Change le profil d'une personne : événement person:radicalized et ctx.archetypes.equip. */
  setProfile(p: Person, to: ProtestProfile): void;
  /** Crée un groupe d'affinité à partir de personnes existantes. */
  createGroup(kind: GroupKind, members: readonly Person[]): CrowdGroup;

  // ── déroulé ──
  /** Déclenche un aléa du catalogue tout de suite ; false s'il est inconnu ou si ses conditions ne sont pas réunies. */
  triggerAlea(id: string): boolean;
  /** Équipe de liaison au contact des organisateurs : hausses de tension × 0,7 et décroissance doublée (bible F.4). */
  setLiaison(active: boolean): void;
  /** Les organisateurs annoncent la dispersion maintenant. */
  announceDispersal(): void;
}
