/* =====================================================================================
 * COMMANDEMENT — types publics de src/sim/police/command (à importer en `import type`).
 *
 * Le système 'police.command' (ordre SystemOrder.CONTROL + 5, juste après l'IA des unités) réunit :
 *   - le COMMANDANT IA : le personnage unique qui porte l'écharpe (BRIEF §1) quand le joueur ne
 *     l'incarne pas. Il lit le directeur de foule, les signaux avant-coureurs, l'état de ses unités,
 *     les incidents, et commande par ctx.squads.issue, à la radio, comme le ferait le joueur ;
 *   - l'ADJOINT du joueur-commandant : il ne décide rien, il signale et propose par radio ;
 *   - les UNITÉS SPÉCIALES : BRAV-M (colonne à moto, pied à terre, interception, remontée),
 *     Centaure (abri mobile, salve de la tourelle, lame), engin lanceur d'eau (extinction, jet,
 *     réservoir), drone (télépilote IA, observations) ;
 *   - le CONVOI : arrivée en colonne de fourgons, stationnement aligné, débarquement, rembarquement.
 *
 * SERVICES PUBLIÉS
 *   ctx.service<CommandApi>('police.command')       tout ce qui suit
 *   ctx.service<CommandPost>('command.post')        poste du commandant (véhicule de commandement)
 *
 * ÉVÉNEMENTS LIBRES ÉMIS (ctx.events.onAny)
 *   'command:state'        CommandStateEvent     le commandement d'une compagnie change de phase
 *   'command:decision'     CommandDecision       décision prise par le commandant IA (journal)
 *   'command:proposal'     Proposal              proposition de l'adjoint au joueur-commandant
 *   'command:deployed'     { squadId, posts, held, t }   dispositif initial en place
 *   'command:mission_end'  { squadId, t }        « Fin de mission, retour à la base »
 *   'command:observation'  Observation           observation du drone
 *   'command:special'      SpecialEvent          étape d'une unité spéciale (BRAV-M, Centaure, canon, drone)
 *   'command:convoy'       ConvoyEvent           étape d'un convoi
 *
 * ÉVÉNEMENT LIBRE ÉCOUTÉ (facultatif) : 'crowd:signal' CrowdSignal (signe avant-coureur), en plus
 * du service 'crowd.signals' s'il existe (forme attendue : CrowdSignalsLike ci-dessous).
 *
 * CLÉS LUES DANS session.config.extra (toutes facultatives)
 *   commandement            'ia' | 'joueur' | 'aucun' — force le mode (défaut : IA si le chef de la compagnie
 *                           n'est pas le joueur, adjoint si c'est lui)
 *   commandement.aptitude   nombre 0..1 : qualité du commandant IA (défaut 0,75)
 *   commandement.adjoint    secondes entre deux propositions de l'adjoint (0 : adjoint muet)
 *   poste                   'salle' : salle de commandement (le joueur n'a pas de personnage sur le terrain :
 *                           l'officier IA prononce les sommations sur demande, requestSommation)
 *
 * CONVENTIONS DES ORDRES DES UNITÉS SPÉCIALES (ctx.squads.issue sur l'unité de l'engin ou du groupe)
 *   BRAV-M (groupe « FAUCON n », binômes en selle)
 *     avancer / colonne   x, z : roule en colonne de binômes jusqu'au point (jamais dans une foule)
 *     interpeller         targetId (ou x, z) : interception — colonne, arrêt à 40–80 m, pied à terre
 *                         ensemble, progression à pied, interpellation sur fait constaté, retour, remontée
 *     debarquer           pied à terre sur place ; embarquer : remontée en selle
 *     repli / cesser      abandonne l'action, regagne les machines, remonte
 *   CENTAURE (équipage « CENTAURE n »)
 *     avancer / refoulement  x, z : progression lente, les gendarmes à pied rattachés suivent derrière la caisse
 *     disperser_gaz       x, z : salve de la tourelle vers la zone ; width = nombre de coups (0 : dosage automatique)
 *     degager_barricade   targetId (ou x, z) : vérification de l'obstacle, annonce, poussée à la lame
 *   ENGIN LANCEUR D'EAU (équipage « NEPTUNE n »)
 *     proteger / suivre   targetId = unité ou personne : mise en place 12 m derrière la ligne
 *     eteindre            targetId (ou x, z) : jet sur le feu jusqu'à extinction
 *     refoulement         x, z : jet sur la foule (pluie, puis diffusé, puis jet droit au-delà de 15 m) si le
 *                         niveau autorisé le permet ; sinon refus motivé
 *     ravitailler         repli au point d'eau et plein de la cuve (automatique quand elle est basse)
 *   DRONE (équipe « ICARE »)
 *     avancer             x, z : survol du point ; suivre : targetId = personne ou unité à suivre
 *     libre               le télépilote se place de lui-même au-dessus du point chaud
 *     repli / cesser      rappel et pose
 * ===================================================================================== */

import type { CrowdPhase, EntityId, ForceLevel, OrderType, Squad } from '@/core/contracts';
import type { UnitHandle } from '../api';

export const POLICE_COMMAND_SERVICE = 'police.command';
export const COMMAND_POST_SERVICE = 'command.post';
export const COMMAND_SYSTEM_ID = 'police.command';
/** Service facultatif des signes avant-coureurs (module de foule, groupes radicaux). */
export const CROWD_SIGNALS_SERVICE = 'crowd.signals';

export const COMMAND_STATE_EVENT = 'command:state';
export const COMMAND_DECISION_EVENT = 'command:decision';
export const COMMAND_PROPOSAL_EVENT = 'command:proposal';
export const COMMAND_DEPLOYED_EVENT = 'command:deployed';
export const COMMAND_MISSION_END_EVENT = 'command:mission_end';
export const COMMAND_OBSERVATION_EVENT = 'command:observation';
export const COMMAND_SPECIAL_EVENT = 'command:special';
export const COMMAND_CONVOY_EVENT = 'command:convoy';
export const CROWD_SIGNAL_EVENT = 'crowd:signal';

// ───────────────────────────── signes avant-coureurs (forme attendue) ─────────────────────────────

/** Signe avant-coureur (bible F.2) : visages couverts, ralliement, regroupement, parapluies, dépavage… */
export interface CrowdSignal {
  /** Nature libre : 'nebuleuse' | 'visages' | 'ralliement' | 'regroupement' | 'parapluies' | 'depavage' | … */
  kind: string;
  x: number;
  z: number;
  /** Personnes concernées (0 si inconnu). */
  count?: number;
  /** Force du signal 0..1 (défaut 0,5). */
  strength?: number;
  /** Instant du signal (temps de session, s). */
  t?: number;
  id?: number;
}

export interface CrowdSignalsLike {
  /** Signaux actifs (l'un ou l'autre nom est accepté). */
  readonly list?: readonly CrowdSignal[];
  readonly active?: readonly CrowdSignal[];
}

// ───────────────────────────── commandement d'une compagnie ─────────────────────────────

export type CommandMode = 'ia' | 'adjoint';

export type CommandPhase =
  /** Convoi en route ou débarquement en cours. */
  | 'arrivee'
  /** Dispositif initial en cours de mise en place. */
  | 'mise_en_place'
  /** Dispositif en place : accompagnement du cortège, réactions. */
  | 'conduite'
  /** Rembarquement. */
  | 'fin'
  | 'termine';

export type PostKind = 'barrage' | 'site' | 'reserve';
export type PostState = 'prevu' | 'ordonne' | 'tenu' | 'barrieres' | 'leve';

/** Emplacement du dispositif : débouché latéral à barrer, site à protéger, position de la réserve. */
export interface Post {
  kind: PostKind;
  x: number;
  z: number;
  /** Cap de l'unité en place (un barrage latéral fait face au parcours). */
  heading: number;
  /** Largeur à tenir, de façade à façade (m). */
  width: number;
  /** Abscisse le long du parcours (m) ; −1 pour un site ou la réserve. */
  s: number;
  name: string;
  /** Poids dans l'affectation (classe de la voie, largeur, proximité du cortège). */
  importance: number;
  state: PostState;
  /** Unité qui le tient (0 : personne). */
  squadId: number;
  /** Fermeture de rue demandée par le commandant (identifiant TrafficControlApi, 0 : aucune). */
  closureId: number;
  /** Voie interdite aux véhicules (barrage de personnes seulement). */
  pedestrian: boolean;
}

/**
 * Cortège suivi par une compagnie chargée d'une AUTRE manifestation que la principale (forme de ManifView, service
 * 'crowd.manifs' du module de foule) : phase du déroulé, parcours courant, tête et queue, effectifs, tension.
 */
export interface CortegeSource {
  readonly phase: CrowdPhase;
  readonly route: readonly number[];
  readonly headS: number;
  readonly tailS: number;
  readonly people: number;
  readonly planned: number;
  readonly tension: number;
}

export interface AssumeOptions {
  /** Force le mode (défaut : IA si le chef n'est pas le joueur, adjoint sinon). */
  mode?: CommandMode;
  /** Qualité du commandant IA 0..1 (défaut : tuning.aptitude). */
  aptitude?: number;
  /** Point de repli des véhicules en fin de mission (« retour à la base ») ; défaut : là d'où le convoi est venu. */
  base?: { x: number; z: number };
}

export interface CommandState {
  squadId: number;
  mode: CommandMode;
  phase: CommandPhase;
  commanderId: EntityId;
  aptitude: number;
  /** Unité tenue en réserve (0 si aucune). */
  reserveId: number;
  /** Dispositif (tableau interne : le lire, ne pas le modifier). */
  posts: readonly Post[];
  /** Instant où le dispositif initial a été déclaré en place (−1 : pas encore). */
  deployedAt: number;
  /** Le commandant est en train de se porter au contact pour les sommations, ou d'attendre un délai légal. */
  sommations: 'aucune' | 'approche' | 'en_cours' | 'force_autorisee' | 'armes_autorisees' | 'halte';
  /** Niveau de force que le commandant a fixé en dernier. */
  authorized: ForceLevel;
  /** « Fin de mission, retour à la base » a été prononcé. */
  missionEnded: boolean;
  /** Fermetures de rues et de stations demandées par le commandant depuis le début. */
  closuresAsked: number;
  stationsClosed: number;
  /** Incidents délégués, et traités, depuis le début. */
  delegated: number;
  resolved: number;
}

export interface CommandStateEvent { squadId: number; phase: CommandPhase; previous: CommandPhase }

/** Décision du commandant IA, telle qu'inscrite au journal. */
export interface CommandDecision {
  t: number;
  /** Compagnie. */
  squadId: number;
  /** Nature : 'dispositif' | 'fermeture' | 'metro' | 'incident' | 'releve' | 'ravitaillement' | 'reserve' | 'sommation'
   *  | 'autorisation' | 'force' | 'interpellation' | 'halte' | 'dispersion' | 'fin'. */
  key: string;
  text: string;
  /** Unité qui a reçu l'ordre (0 si aucune) et type d'ordre ('' si aucun). */
  unitId: number;
  order: OrderType | '';
  x: number;
  z: number;
}

/** Proposition de l'adjoint au joueur-commandant. */
export interface Proposal {
  readonly id: number;
  /** Nature (mêmes valeurs que CommandDecision.key). */
  key: string;
  /** Phrase dite à la radio (« Chef, … je propose … »). */
  text: string;
  x: number;
  z: number;
  /** Instant de la proposition et instant où elle a été dite à la radio (−1 : pas encore). */
  t: number;
  saidAt: number;
  /** Urgence 0..3 (ordre de passage à la radio). */
  priority: number;
  /** accept() peut l'exécuter (les sommations restent au joueur : false). */
  executable: boolean;
}

// ───────────────────────────── situation ─────────────────────────────

export type HotKind = 'violences' | 'casse' | 'feu' | 'barricade' | 'groupe_hostile' | 'compression';

/** Point chaud connu du commandement. */
export interface HotSpot {
  readonly id: number;
  x: number;
  z: number;
  /** Intensité 0..3, qui retombe avec le temps. */
  heat: number;
  kind: HotKind;
  /** Poids cumulé par nature (même ordre que HOT_KINDS). */
  weights: number[];
  firstAt: number;
  lastAt: number;
  /** Vu par une unité, le drone ou la salle (sinon le commandement l'ignore encore). */
  seen: boolean;
  /** Instant à partir duquel le commandant en a connaissance (délai de transmission). */
  knownAt: number;
  /** Les violences visent les forces de l'ordre. */
  againstPolice: boolean;
}

export const HOT_KINDS: readonly HotKind[] = ['violences', 'casse', 'feu', 'barricade', 'groupe_hostile', 'compression'];

/** Observation du drone (nature, volume, attitude). */
export interface Observation {
  t: number;
  /** 'cortege' | 'groupe_hostile' | 'violences' | 'feu' | 'barricade' | 'densite' | 'calme'. */
  kind: string;
  x: number;
  z: number;
  /** Personnes dans le champ. */
  count: number;
  /** Dont auteurs de faits récents. */
  hostile: number;
  /** Drone à l'origine de l'observation. */
  vehicleId: EntityId;
}

// ───────────────────────────── unités spéciales, convoi ─────────────────────────────

export type SpecialKind = 'bravm' | 'centaure' | 'canon_eau' | 'drone';

export interface SpecialStatus {
  squadId: number;
  kind: SpecialKind;
  /** Étape lisible ('repos', 'route', 'pied_a_terre', 'approche', 'interpellation', 'retour', 'salve', 'poussee', 'jet', 'ravitaillement', 'vol'…). */
  stage: string;
  /** Engin principal (moto de tête, Centaure, engin lanceur d'eau, drone). */
  vehicleId: EntityId;
  /** Ordre en cours ('' si aucun). */
  order: OrderType | '';
  /** Eau restante (l), tubes chargés, batterie 0..1, selon l'engin ; −1 sans objet. */
  supply: number;
  /** Cible suivie ou visée (0 si aucune). */
  targetId: EntityId;
  x: number;
  z: number;
}

export interface SpecialEvent { squadId: number; kind: SpecialKind; stage: string; ok: boolean; reason: string }

export type ConvoyStage = 'route' | 'stationnement' | 'debarquement' | 'en_place' | 'rembarquement' | 'depart' | 'parti' | 'echec';

export interface ConvoyDestination {
  /** Point de stationnement (milieu du rang de véhicules) et cap des véhicules garés. */
  x: number;
  z: number;
  heading: number;
  /** Disposition du stationnement (défaut : 'file' le long de la voie). */
  layout?: 'bataille' | 'epi' | 'file';
  /** Milieu et cap de la ligne formée après le débarquement (défaut : 15 m devant les véhicules, même cap). */
  lineX?: number;
  lineZ?: number;
  lineHeading?: number;
  /** false : les unités restent à bord à l'arrivée (défaut true). */
  disembark?: boolean;
  /**
   * true : l'unité embarque d'abord (ordre « embarquer », retardataires, et le joueur s'il en fait partie : la colonne
   * l'attend) ; la colonne ne part qu'ensuite. Défaut false : départ immédiat avec ceux qui sont à bord.
   */
  boardFirst?: boolean;
  /**
   * true : départ ÉCHELONNÉ plutôt qu'en file accrochée — le véhicule le plus avancé part d'abord, le suivant quand
   * il a dégagé ; chacun roule au point par le même itinéraire et s'arrête derrière le précédent. Sûr depuis un
   * stationnement en bloc (ordre de mouvement donné par le joueur).
   */
  stagger?: boolean;
}

export interface ConvoyStatus {
  squadId: number;
  stage: ConvoyStage;
  vehicles: number;
  /** Véhicules arrivés et garés. */
  parked: number;
  /** Écart maximal d'un véhicule garé à sa place (m) et à son cap (rad) ; −1 tant que le rang n'est pas formé. */
  alignError: number;
  headingError: number;
  t0: number;
}

export interface ConvoyEvent { squadId: number; stage: ConvoyStage }

export interface DroneTeamOptions {
  x?: number;
  z?: number;
  heading?: number;
  callsign?: string;
  parentId?: number;
  /** Faire décoller l'appareil tout de suite (défaut true). */
  deploy?: boolean;
}

// ───────────────────────────── poste du commandant ─────────────────────────────

/** Poste de commandement (docs/INTEGRATION-NOTES.md) : richesse de la carte tactique du joueur-commandant. */
export interface CommandPost {
  /** Le commandant (joueur ou IA) est à bord du véhicule de commandement ou à moins de 8 m. */
  readonly atVehicle: boolean;
  readonly vehicleId: EntityId;
  /** Véhicule détruit ou incendié : poste perdu. */
  readonly lost: boolean;
  /** Commandant concerné (0 si aucune compagnie n'est commandée). */
  readonly commanderId: EntityId;
}

// ───────────────────────────── réglages ─────────────────────────────

export interface CommandTuning {
  /** L'IA prend d'elle-même le commandement de toute compagnie dont le chef n'est pas le joueur. */
  autoAssume: boolean;
  /** Qualité du commandant IA 0 (médiocre : lent, sans anticipation) … 1 (excellent). */
  aptitude: number;
  /** Secondes entre deux propositions de l'adjoint (0 : muet). */
  adjointInterval: number;
  /** Période de réflexion du commandant (s). */
  thinkInterval: number;
  /** Horizon du dispositif le long du parcours, devant la tête du cortège (m). */
  horizon: number;
  /** Distance au-delà de la queue du cortège à laquelle un barrage latéral est levé (m). */
  liftBehind: number;
  /** Intensité d'un point chaud à partir de laquelle le commandant réagit. */
  reactHeat: number;
  /** Portée de mégaphone visée pour les sommations (m, bornée par le droit). */
  megaphoneRange: number;
  /** BRAV-M : distance d'arrêt avant l'objectif (m), vitesse en colonne (m/s), vitesse près de piétons (m/s). */
  bravmStandoff: number;
  bravmSpeed: number;
  bravmSlow: number;
  /** Centaure : allure avec des gendarmes à pied derrière (m/s) et vitesse de poussée (m/s). */
  centaurePace: number;
  centaurePush: number;
  /** Engin lanceur d'eau : recul derrière la ligne (m), seuil de cuve basse (part), distance minimale du jet droit (m). */
  canonBehind: number;
  canonLow: number;
  canonMinStraight: number;
  /** Drone : hauteur de travail (m) et rayon d'orbite (m). */
  droneAltitude: number;
  droneOrbit: number;
  /** Convoi : intervalle entre véhicules (m) et vitesse (m/s). */
  convoyGap: number;
  convoySpeed: number;
}

// ───────────────────────────── service ─────────────────────────────

export interface CommandApi {
  readonly tuning: CommandTuning;

  // ── commandement ──
  /** L'IA prend le commandement de la compagnie (ou l'adjoint se met au service du joueur qui la commande). */
  assume(companySquadId: number, options?: AssumeOptions): boolean;
  /** L'IA rend le commandement (les unités gardent leurs ordres en cours). */
  release(companySquadId: number): void;
  /**
   * Confie à la compagnie une autre manifestation que la principale : son dispositif, ses barrages et sa fin de
   * mission suivent ce cortège (null : retour au cortège principal). false si la compagnie n'est pas commandée.
   */
  assignCortege?(companySquadId: number, source: CortegeSource | null): boolean;
  /** État du commandement (objet stable par compagnie), ou null. */
  stateOf(companySquadId: number): CommandState | null;
  /** Compagnies commandées (ou conseillées). */
  readonly commands: readonly CommandState[];
  /** Rattache un moyen (BRAV-M, Centaure, canon à eau, drone, peloton) à une compagnie : le commandant en dispose. */
  attach(companySquadId: number, unitSquadId: number): void;
  /** Les gendarmes à pied de cette unité progressent derrière ce Centaure quand il avance. */
  escort(centaureSquadId: number, footSquadId: number): void;
  /** Demande la fin de mission (script de mission, joueur) : rembarquement puis message de fin. */
  endMission(companySquadId: number): void;
  /**
   * Sommation sur ordre (salle de commandement) : l'officier IA de la compagnie se porte à portée de mégaphone
   * de (x, z) et prononce l'étape suivante. false s'il n'y a pas d'officier IA habilité.
   */
  requestSommation(companySquadId: number, x: number, z: number): boolean;

  // ── situation ──
  /** Points chauds connus (tableau interne). */
  readonly hotspots: readonly HotSpot[];
  /** Dernières observations du drone (tableau interne, les plus récentes à la fin). */
  readonly observations: readonly Observation[];
  /** Journal des décisions du commandant IA depuis le début de la session. */
  readonly decisions: readonly CommandDecision[];

  // ── adjoint ──
  readonly proposals: readonly Proposal[];
  /** Exécute la proposition au nom du joueur. false si elle n'existe plus ou n'est pas exécutable. */
  accept(proposalId: number): boolean;
  dismiss(proposalId: number): void;

  // ── unités spéciales ──
  /** Équipe du drone (télépilote et opérateur image), créée à pied ; l'appareil décolle si `deploy`. */
  createDroneTeam(options?: DroneTeamOptions): UnitHandle;
  /** État d'une unité spéciale (objet stable), ou null si l'unité n'en est pas une. */
  special(squadId: number): SpecialStatus | null;
  /** Unités spéciales connues. */
  readonly specials: readonly SpecialStatus[];

  // ── convoi ──
  /** Arrivée en colonne de véhicules jusqu'à `dest`, stationnement aligné, débarquement et mise en ligne. */
  arrive(squadId: number, dest: ConvoyDestination): boolean;
  /** Rembarquement, puis départ en colonne vers `exit` s'il est fourni. */
  depart(squadId: number, exit?: { x: number; z: number }): boolean;
  convoyOf(squadId: number): ConvoyStatus | null;
}

export type { Squad };
