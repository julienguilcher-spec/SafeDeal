/* =====================================================================================
 * Carte de commandement — CONTRAT des fiches (types seulement, aucune logique).
 *
 * Vocabulaire :
 *   repère     ce sur quoi le commandant agit : une rue, une foule, une nasse, un incident, une de ses unités, une
 *              unité qui n'est pas à lui (« cible »), lui-même (« vous »), un point quelconque, une station de métro,
 *              une rue fermée, la proposition de l'adjoint, le véhicule qui bloque sa colonne, un commissariat ;
 *   intention  un des six boutons du bas (Envoyer, Bloquer une rue, Encercler, Disperser, Interpeller, Secours) ;
 *   fiche      le panneau d'un repère : au plus six lignes numérotées + « Autres ordres ici… » ;
 *   Qui        l'unité proposée pour la ligne (bestUnit.ts), changée par U / T / la liste.
 *
 * Qui fait quoi :
 *   intents.ts   buildCard (fiche d'un repère), intentCandidates (repères d'une intention), INTENTS, registres ;
 *   reperes.ts   collectReperes (tous les repères d'une scène), pickAt (sous le pointeur), nextInDirection (flèches),
 *                cardEnvFromCore (lecture de la partie en cours) ;
 *   bestUnit.ts  proposeWho ; preview.ts previewOf / sentenceOf ; sendLine.ts sendCardLine ; legalChain.ts.
 * Chaque paquet de la refonte code contre ces types : les changer, c'est changer le contrat de tous.
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';
import type { IncidentKind, IncidentMeans, IncidentState, RescueKind } from '@/core/extensions';
import type { IconName } from '../core/icons';
import type { MapUnit, UnitSymbol } from '../maps/units';
import type { CommandLevel } from './api';
import type { CommandCore } from './core';
import type { OrderVerb } from './orders';

// ───────────────────────────── repères ─────────────────────────────

export type RepereKind = 'rue' | 'foule' | 'nasse' | 'incident' | 'unite' | 'cible' | 'vous' | 'point' | 'metro' | 'fermeture'
  | 'commissariat' | 'proposition' | 'bloqueur';

/** Chose désignable sur la carte. `key` est stable d'une image à l'autre (sert à garder la visée sur le même repère). */
export interface Repere {
  kind: RepereKind;
  key: string;
  x: number;
  z: number;
  /** Nom affiché à côté de la visée (« Rue de Rivoli », « Tête de cortège — ~300 personnes »). */
  name: string;
  /** Rue : arête du graphe routier (−1 : passage piéton hors voie). */
  roadEdge?: number;
  /** Rue d'issue, foule, nasse : clé de la foule (`SceneCrowdExits.key`). */
  crowdKey?: string;
  incidentId?: number;
  /** Unité (la mienne ou non). */
  squadId?: number;
  /** Commissariat (module des commissariats). */
  stationId?: string;
  /** Rue fermée (identifiant TrafficControlApi). */
  closureId?: number;
  /** Station de métro (identifiant MetroApi). */
  metroId?: number;
  proposalId?: number;
  /** Unité d'un commissariat (entrée du module des commissariats). */
  entryId?: number;
  /** Foule, nasse : rayon du corps (m) pour la désignation au pointeur. */
  radius?: number;
}

export type IntentId = 'envoyer' | 'bloquer' | 'encercler' | 'disperser' | 'interpeller' | 'secours';

/** Une intention du bas de la carte. `code` : touche physique (KeyboardEvent.code), `key` : lettre imprimée. */
export interface IntentDef {
  id: IntentId;
  code: string;
  key: string;
  label: string;
  /** Deuxième ligne du bouton (≤ 30 caractères) et phrase complète de l'info-bulle. */
  sub: string;
  tooltip: string;
  icon: IconName;
  /** Intention qui reste active après un envoi (B, S, I) : la visée passe au repère suivant. */
  sticky: boolean;
}

// ───────────────────────────── lignes de fiche ─────────────────────────────

/** Géométrie d'un ordre (verbe) : point visé, rue barrée, ligne automatique, ligne tracée en deux clics, ordre
 * immédiat (là où est l'unité), cible (targetId), cercle (encerclement au rayon par défaut). */
export type VerbGeom = 'point' | 'street' | 'autoLine' | 'trace' | 'immediate' | 'target' | 'circle';

export type LineAction =
  /** Ordre du catalogue (orders.ts). `targetId` : BARRAGE_LET_PASSERSBY pour « passants admis », entité visée sinon. */
  | { kind: 'verb'; type: OrderType; geom: VerbGeom; targetId?: number; noFact?: boolean }
  /** « Encercler (nasse) » : chaque issue ouverte de la foule reçoit une unité (nasse.ts proposeNasse + acceptNasse). */
  | { kind: 'nasse' }
  /** « Ouvrir une sortie filtrée » d'une nasse fermée (nasse.ts openFilteredExit). */
  | { kind: 'filteredExit' }
  /** « Fermer aux voitures (barrières) » au point (TacticalMap.closeRoad) ; un Qui choisi tient la fermeture. */
  | { kind: 'closeRoad' }
  /** « Fermer le quartier aux voitures » (TacticalMap.closeArea). */
  | { kind: 'closeArea'; radius: number }
  /** Pompiers ou SAMU au point (TacticalMap.callRescue) ; `incidentId` 0 : sans incident. */
  | { kind: 'rescue'; service: 'pompiers' | 'samu'; incidentId: number }
  /**
   * Confier l'incident à un moyen (unité, canon à eau, Centaure, BRAV-M) — comme les boutons du panneau des incidents.
   * `squadId` : l'unité nommée dans le libellé (« Envoyer MISTRAL 3 ») ; c'est le Qui proposé.
   */
  | { kind: 'means'; incidentId: number; means: IncidentMeans; squadId?: number }
  /** « Confier à une autre unité… » : ouvre la liste Qui, puis confie l'incident à l'unité choisie. */
  | { kind: 'assignOther'; incidentId: number }
  | { kind: 'unassign'; incidentId: number }
  | { kind: 'cancelCall'; callId: number }
  | { kind: 'metro'; stationId: number; op: 'close' | 'open' | 'filter' | 'unfilter' }
  | { kind: 'reopen'; closureId: number }
  | { kind: 'reopenAll' }
  /** « Suivez-moi » (core.callFollow) : `column` en véhicules. */
  | { kind: 'follow'; column: boolean }
  /** Centrer la carte sur le repère (aucun ordre). */
  | { kind: 'centre' }
  /** Proposition de l'adjoint : accepter, ou « Plus tard ». */
  | { kind: 'proposal'; accept: boolean }
  /** Sommations : `all` les trois à la suite (chaîne légale), sinon la suivante seulement. */
  | { kind: 'sommation'; all: boolean }
  /** « Négocier un parcours (liaison) » : l'équipe de liaison prend contact avec les organisateurs (crowd.core.setLiaison). */
  | { kind: 'liaison' }
  /** Engager une unité d'un commissariat (P5) : Qui fixé, puis « OÙ L'ENVOYER ? », ordre par défaut `defaultVerb`. */
  | { kind: 'engage'; entryId: number; defaultVerb: OrderType }
  /**
   * Fiche d'une de mes unités : Qui fixé sur elle, puis on choisit OÙ (la fiche du lieu visé s'ouvre). `type` : ordre à
   * mettre en avant sur cette fiche (« Se replier… » → `repli`) ; absent : la ligne par défaut du lieu.
   */
  | { kind: 'sendElsewhere'; type?: OrderType }
  /** Protéger / escorter / suivre une autre unité : Qui fixé, puis on désigne l'unité à couvrir. */
  | { kind: 'pickTarget'; type: 'proteger' | 'escorter' | 'suivre' }
  /** « Autres ordres ici… » : la liste complète du repère dans la fiche. */
  | { kind: 'others' }
  /** « Toutes les unités du poste… » : « Plus… › Commissariats » sur ce poste. */
  | { kind: 'stationList'; stationId: string };

/** Ce qui manque pour qu'une ligne soit permise : sommations restantes, niveau de force à autoriser, en clair. */
export interface LineLock {
  /** Sommations encore à faire (0 : aucune). */
  sommations: number;
  /** Niveau de force que l'ordre suppose (à autoriser). */
  force: ForceLevel;
  /** « sommations 0/3 + autoriser le gaz ». */
  text: string;
}

export interface CardLine {
  label: string;
  /** Explication en une ligne (jargon expliqué : « la BRAV-M : policiers à moto… »). */
  explain: string;
  icon: IconName;
  action: LineAction;
  /**
   * Emploi collectif de la force AVANT la dernière sommation, permis (⚖) : l'ordre part, le joueur en répond (S3
   * demande confirmation). Faux pour une ligne bloquée (`lock`) ou sans force collective.
   */
  coercive: boolean;
  /** Ligne que la loi ne permet pas encore (🔒) : ce qui manque. null sinon. */
  lock: LineLock | null;
  /** La ligne s'adresse à Qui (une unité est proposée et peut être changée). */
  needsWho: boolean;
  /** Rappel de règle (orange, sous la phrase « Ce qui va se passer »), '' si aucun. */
  rule: string;
}

/** Fiche d'un repère. `lines` ≤ 6 ; `others` : « Autres ordres ici… » (vide : la ligne n'est pas montrée). */
export interface Card {
  repere: Repere;
  /** En-tête (« ⛔ BLOQUER UNE RUE » quand une intention est active, sinon le nom du repère en majuscules). */
  title: string;
  /** Sous-titre d'une ligne (« Rue de Rivoli · à 120 m de la foule · personne ne la tient »). */
  sub: string;
  /** Lignes d'information (sommations, relève conseillée, conseil de moyens, note de rôle). */
  notes: string[];
  lines: CardLine[];
  others: CardLine[];
  /** Indice (dans `lines`) de la ligne surlignée d'emblée. */
  defaultLine: number;
  /** Repères empilés sous le clic (onglets de l'en-tête) ; `[repere]` par défaut. */
  stack: Repere[];
  /**
   * Qui est imposé par le repère (fiche d'une de mes unités : elle-même) ; null : Qui est proposé par le jeu
   * (bestUnit.ts) et peut être changé.
   */
  whoFixed: number[] | null;
}

// ───────────────────────────── environnement des fiches ─────────────────────────────

/** Issue d'une foule (copie de SceneExit). */
export interface CardExit {
  x: number;
  z: number;
  heading: number;
  width: number;
  street: string;
  edgeId: number;
  held: boolean;
  squadId: number;
  mode: string;
}

/** Foule (cortège, manifestation, foyer, nasse) et ses issues. */
export interface CardCrowd {
  /** Clé de SceneCrowdExits (« c » cortège principal, « m3 », « f2 », « k1 »). */
  key: string;
  /** Nom en clair (« Tête de cortège », « Rassemblement — place de la République »). */
  name: string;
  /** Lieu (« place de la République »), '' s'il est inconnu. */
  place: string;
  x: number;
  z: number;
  radius: number;
  people: number;
  /** Tension 0..1. */
  tension: number;
  /** Sens de marche (cap, rad) pour un cortège en marche ; NaN sinon. */
  heading: number;
  /** Foule principale de la mission (le cortège). */
  main: boolean;
  exits: readonly CardExit[];
  /** Nasse détectée (0 : aucune) et fermée (toutes les issues tenues). */
  kettleId: number;
  closed: boolean;
}

export interface CardIncident {
  id: number;
  kind: IncidentKind;
  x: number;
  z: number;
  urgency: 1 | 2 | 3;
  state: IncidentState;
  means: IncidentMeans;
  /** Unité chargée (0 : aucune) et son nom (« NEPTUNE 1 »), '' si aucune. */
  squadId: number;
  assignee: string;
  /** Lieu (« rue Royale »). */
  place: string;
  /** Âge (s). */
  age: number;
  /** Entité visée par un ordre sur l'incident (personne à interpeller, barricade), 0 si aucune. */
  targetId: number;
  /** Appel de secours en cours lié à l'incident (0 : aucun) et le véhicule de secours (0 : pas encore parti). */
  callId: number;
  callVehicleId: number;
}

/** Unité visible sur la carte (la mienne ou non). */
export interface CardUnit {
  squadId: number;
  /** Clé de MapUnit (> 0 unité, < 0 véhicule hors unité). */
  key: number;
  name: string;
  symbol: UnitSymbol;
  x: number;
  z: number;
  total: number;
  valid: number;
  /** Moral 0..1 ; munitions collectives (−1 inconnu). */
  morale: number;
  ammo: number;
  /** Ordre en cours (null : aucun). */
  order: { type: OrderType; x: number; z: number; targetId: number; issuedAt: number } | null;
  /** Lieu de l'ordre en cours (« rue Royale »), '' sans ordre. */
  orderPlace: string;
  /** État en clair (« en route », « en place », « Patrouille ») ; '' sinon. */
  status: string;
  embarked: boolean;
  /** L'unité a des véhicules (embarquer / débarquer ont un sens). */
  hasVehicles: boolean;
  /** Sous les ordres du joueur (core.canCommand). */
  mine: boolean;
  patrol: boolean;
  /** Commissariat d'attache (unité venue d'un poste), '' sinon. */
  homeStation: string;
  /** Entité à viser pour la protéger / l'escorter / la suivre (véhicule, sinon chef). */
  targetEntity: number;
  /** Unité supérieure (0 : aucune) ; le joueur en fait partie. */
  parentId: number;
  hasPlayer: boolean;
}

export interface CardClosure {
  id: number;
  x: number;
  z: number;
  /** Nom de la rue. */
  name: string;
  /** Unité qui tient la fermeture, '' : barrières seules. */
  heldBy: string;
}

export interface CardMetro {
  id: number;
  name: string;
  x: number;
  z: number;
  open: boolean;
  filtered: boolean;
  /** Arrivées par minute. */
  inflow: number;
}

export interface CardProposal {
  id: number;
  key: string;
  text: string;
  x: number;
  z: number;
  /** accept() peut l'exécuter (les sommations restent au joueur). */
  executable: boolean;
}

/** Unité d'un commissariat telle que la fiche du poste la montre (module des commissariats, P5). */
export interface CardStationEntry {
  entryId: number;
  /** Indicatif (« TV 75-19 ») et nature en clair (« voiture de police secours, 3 gardiens »). */
  name: string;
  what: string;
  /** 'pret' (« Au poste — prête »), 'alerte' (« En alerte »), autre : non engageable. */
  state: string;
  stateLabel: string;
  /** Délai d'arrivée estimé au point visé (s). */
  eta: number;
  /** Ordre par défaut de l'unité une fois engagée. */
  defaultVerb: OrderType;
  icon: IconName;
}

export interface CardStation {
  id: string;
  /** « Commissariat du 9e » ; rue (« rue Chauchat »). */
  name: string;
  street: string;
  x: number;
  z: number;
  /** Distance (m) et délai deux-tons (s) jusqu'au point visé. */
  distance: number;
  eta: number;
  entries: readonly CardStationEntry[];
  /** La mission permet d'engager des renforts (`extra.renforts` ≠ false). */
  renforts: boolean;
}

export interface CardPlayer {
  x: number;
  z: number;
  /** « Commandant Carlier ». */
  title: string;
  inVehicle: boolean;
}

export interface CardRoad {
  edgeId: number;
  x: number;
  z: number;
  heading: number;
  width: number;
  name: string;
}

/**
 * Tout ce que les fiches lisent de la partie, sous une forme étroite et testable (cardEnvFromCore la remplit depuis
 * la partie en cours ; les tests la construisent à la main).
 */
export interface CardEnv {
  level: CommandLevel;
  canTraffic: boolean;
  canSommation: boolean;
  canAuthorize: boolean;
  canMetro: boolean;
  canDelegate: boolean;
  /** Variante « salle de commandement » : l'officier sur place fait les sommations (requestSommation). */
  salle: boolean;
  /** Sommations prononcées (0..3), force que la loi permet, force autorisée, unités attaquées (riposte). */
  sommations: number;
  lawful: ForceLevel;
  authorised: ForceLevel;
  underAttack: boolean;
  /** Riposte permise près de ce point (violences récentes contre les forces de l'ordre). */
  riposteAt(x: number, z: number): boolean;
  /** Ce que T sélectionne : « compagnie », « section » ou « groupe ». */
  command: 'compagnie' | 'section' | 'groupe';
  crowds: readonly CardCrowd[];
  incidents: readonly CardIncident[];
  units: readonly CardUnit[];
  closures: readonly CardClosure[];
  metro: readonly CardMetro[];
  proposals: readonly CardProposal[];
  stations: readonly CardStation[];
  player: CardPlayer | null;
  /** Véhicule qui bloque la colonne du joueur (police.obstacle.blocked()). */
  blocked: { x: number; z: number; street: string } | null;
  /** Pompiers et SAMU peuvent être appelés (service des secours présent). */
  hasRescue: boolean;
  /** Unités choisies par le joueur (Qui) : la première intention « Envoyer » part de leur objectif. */
  selection: readonly number[];
  /** Temps de session (s), pour les durées (« ordre donné il y a 3 min »). */
  now: number;
  /** Le point est assez loin de cette unité pour qu'elle y aille en véhicules (core.ts, 250 m). */
  farFor(x: number, z: number, squadId: number): boolean;
  /** Voie nommée la plus proche à moins de `maxDist` m, null sinon. */
  roadAt(x: number, z: number, maxDist: number): CardRoad | null;
  /** Nom du secteur (« place de la Concorde »). */
  placeName(x: number, z: number): string;
  /** Vent au sol (m/s, repère monde) pour l'aperçu du gaz ; absent ou null : inconnu. */
  wind?: { x: number; z: number } | null;
  /**
   * Équipe de liaison (crowd.core.setLiaison) : false = elle peut être mise au contact des organisateurs du cortège
   * (ligne « Négocier un parcours (liaison) » de la fiche de la foule principale), true = c'est déjà fait ; absent ou
   * null = pas de liaison possible (service absent, ou joueur qui ne commande pas l'ensemble du dispositif).
   */
  liaison?: boolean | null;
  /**
   * Un auteur de fait constaté, interpellable, se trouve-t-il à moins de `radius` m du point ? Absent : inconnu (la fiche
   * promet alors l'interpellation comme avant).
   */
  offenderAt?(x: number, z: number, radius: number): boolean;
}

// ───────────────────────────── Qui (bestUnit.ts, C1B) ─────────────────────────────

export interface WhoCandidate {
  squadIds: number[];
  /** « Section MISTRAL 2 », « Toute la compagnie », « 5 unités choisies par le jeu ». */
  label: string;
  mode: 'pied' | 'vehicules';
  /** Délai d'arrivée estimé (s) et distance (m). */
  eta: number;
  distance: number;
  /** Ce que l'unité fait déjà (« sans ordre », « tient une ligne (la quittera) »). */
  busy: string;
  /** Unité d'un commissariat à engager à l'envoi (entrée du module des commissariats). */
  fromStation?: number;
  /**
   * Le joueur, à pied, fait partie de l'unité qui part en véhicules : sa colonne l'attend pour démarrer (jusqu'à 5 min,
   * sim/police/command/convoy.ts awaitPlayer). La phrase de la fiche le dit.
   */
  waitsForYou?: boolean;
}

export interface WhoEnv {
  card: CardEnv;
  /** Unités déjà choisies par le joueur (liste Qui, U, T, Maj+clic, fiche d'unité) : prises telles quelles. */
  selection: readonly number[];
  /** Ce que T sélectionne (compagnie / section / groupe du joueur) et son libellé. */
  whole: { squadIds: number[]; label: string } | null;
  /** Unités qui tiennent un barrage (nasse.holdingSquads). */
  holding: ReadonlySet<number>;
  canCommand(squadId: number): boolean;
  /** Unités à écarter (au poste, en alerte : module des commissariats). */
  exclude?(squadId: number): boolean;
  /** Renforts des commissariats pour la liste Qui. */
  stationCandidates?(): WhoCandidate[];
  /** Unités choisies pour une nasse autour de la foule (nasse.ts), null si impossible. */
  nasse?(crowdKey: string): { squadIds: number[]; label: string } | null;
  /**
   * Unité qui doit recevoir une tâche de force `force` (le gaz) pour que la simulation l'exécute : l'unité elle-même
   * quand elle manœuvre seule, ou quand l'ordre de la formation qui l'entraîne permet ce niveau ; sinon cette
   * formation (police.units.rootOf). Absent : l'unité elle-même.
   */
  forceRoot?(squadId: number, force: number): number;
}

// ───────────────────────────── aperçu (preview.ts, C1B) ─────────────────────────────

export type CardPreviewKind = 'street' | 'arrows' | 'line' | 'nasse' | 'circle' | 'gas' | 'rescue' | 'route' | 'none';

export interface CardPreview {
  kind: CardPreviewKind;
  /** Point principal, cap, largeur (rue, ligne), rayon (cercle, gaz). */
  x: number;
  z: number;
  heading: number;
  width: number;
  radius: number;
  /** Texte écrit sur la carte (« Rue de Rivoli — personne ne passe, dans les deux sens »). */
  label: string;
  /** Barrage : passants admis ; barrage filtrant. */
  passersby: boolean;
  filter: boolean;
  /** Flèches de chaque unité de Qui vers le point (« à pied · 2 min »). */
  arrows: { squadId: number; fromX: number; fromZ: number; toX: number; toZ: number; text: string; vehicles: boolean }[];
  /** Nasse : chaque unité → sa rue (« 1A → rue X »). */
  segments: { squadId: number; ax: number; az: number; bx: number; bz: number; label: string }[];
  /** Gaz : vent (m/s, monde). */
  wind: { x: number; z: number } | null;
  /** Chaîne légale : étapes numérotées dessinées près de la foule. */
  steps: string[];
  service: 'pompiers' | 'samu' | '';
}

// ───────────────────────────── envoi (sendLine.ts, C1B) ─────────────────────────────

/** Ce que l'envoi d'une ligne demande à la carte tactique (méthodes publiques existantes de TacticalMap). */
export interface SendMapLike {
  issueImmediate(verb: OrderVerb): boolean;
  issuePoint(verb: OrderVerb, x: number, z: number, face: number, targetId?: number, targetName?: string): boolean;
  issueLine(verb: OrderVerb, ax: number, az: number, bx: number, bz: number): boolean;
  issueArea(verb: OrderVerb, cx: number, cz: number, px: number, pz: number): boolean;
  closeRoad(x: number, z: number): void;
  closeArea(x: number, z: number, radius: number): void;
  callRescue(kind: RescueKind, x: number, z: number, incidentId: number): void;
  assignToUnit(incidentId: number, u: MapUnit): boolean;
}

export interface SendEnv {
  core: CommandCore;
  map: SendMapLike;
  /** Fixe les unités sélectionnées (TacticalState) avant un ordre de la carte. */
  setSelection(squadIds: readonly number[]): void;
  card: CardEnv;
  /** Ligne tracée en deux clics (« Tracer la ligne moi-même »), null sinon. */
  trace: { ax: number; az: number; bx: number; bz: number } | null;
  /** Centrer la carte (ligne « Centrer la carte »). */
  centre?(x: number, z: number): void;
}

// ───────────────────────────── chaîne légale (legalChain.ts, C1B) ─────────────────────────────

export type LegalStepKind = 'sommations' | 'authorize' | 'request' | 'issue';

export interface LegalStep {
  kind: LegalStepKind;
  /** « les 3 sommations, par vous au mégaphone (~1 min 30) ». */
  label: string;
}

/** Ce que S3 a fait confirmer : la ligne, Qui, le lieu, et les étapes dans l'ordre. */
export interface LegalPlan {
  line: CardLine;
  who: WhoCandidate | null;
  where: Repere;
  steps: LegalStep[];
  /** Niveau de force à autoriser (0 : déjà autorisé). */
  level: ForceLevel;
  /** Les sommations sont faites par l'officier de la compagnie (requestSommation). */
  viaOfficer: boolean;
  /** Titre (« Dispersion au gaz — Tête de cortège »). */
  title: string;
}

export type LegalStage = 'sommation' | 'autorisation' | 'attente' | 'ordre' | 'fini' | 'refus' | 'annule';

export interface LegalStatus {
  stage: LegalStage;
  /** Sommations faites (0..3) et secondes avant la suivante. */
  sommation: number;
  nextIn: number;
  /** « Dispersion au gaz — sommation 2 sur 3 dans 25 s ». */
  text: string;
  /** Motif d'arrêt en une ligne (« Approchez-vous à portée de mégaphone… »), '' sinon. */
  reason: string;
  title: string;
}
