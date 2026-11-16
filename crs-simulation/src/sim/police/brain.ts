/* =====================================================================================
 * FORCES DE L'ORDRE — mémoire de l'IA : agent (Person.brain), unité (Squad.brain), bloc de
 * formation, opération détachée. Structures plates, créées une fois et mutées en place :
 * aucune allocation pendant la simulation.
 * ===================================================================================== */

import type { EntityId, ForceMeans, ItemId, Person, Squad, SquadOrder } from '@/core/contracts';
import type { ExitInfo, FormationInfo, UnitPhase, UnitStatus } from './api';

export const AGENT_TAG = 'police.agent';
export const UNIT_TAG = 'police.unit';

// ── classe d'un agent dans une formation ──
/** Premier rang : porteurs de bouclier. */
export const CLS_FRONT = 0;
/** Second rang : lanceurs, LBD, extincteur, chefs de groupe, interpellateurs, opérateurs. */
export const CLS_SECOND = 1;
/** Chefs de section. */
export const CLS_THIRD = 2;
/** Commandement de la compagnie. */
export const CLS_REAR = 3;
/** Hors formation : conducteurs et équipages restés aux véhicules. */
export const CLS_OUT = 4;

// ── formations ──
export const F_NONE = 0;
/** Chacun tient l'endroit où il se trouve. */
export const F_HOLD = 1;
export const F_LINE = 2;
export const F_COLUMN = 3;
export const F_TORTUE = 4;
/** Écran de protection (arc ou anneau) autour d'une cible. */
export const F_SCREEN = 5;
/** Escorte : cadre autour d'un élément en marche. */
export const F_BOX = 6;

// ── opérations détachées ──
export const OP_ARREST = 1;
export const OP_RESCUE = 2;
export const OP_EXTINGUISH = 3;
export const OP_RESUPPLY = 4;
export const OP_CLEAR = 5;
export const OP_GAS = 6;

// ── rôle d'un agent dans une opération ──
export const ROLE_LEAD = 1;
export const ROLE_SECOND = 2;
export const ROLE_COVER = 3;

// ── action d'arme en cours ──
export const ACT_NONE = 0;
export const ACT_SELECT = 1;
export const ACT_AIM = 2;
export const ACT_RECOVER = 3;

/** Mémoire d'un agent (Person.brain). */
export interface Agent {
  readonly tag: typeof AGENT_TAG;
  p: Person;
  /** Unité dont il est membre. */
  home: Unit | null;
  /** Unité qui dirige sa formation. */
  root: Unit | null;
  group: FormGroup | null;
  /** Classe de rôle d'après le poste, et classe retenue dans la formation en cours. */
  baseCls: number;
  cls: number;
  shield: boolean;

  // ── emplacement : repère de la formation (droite, avant, cap relatif), puis monde ──
  lx: number;
  lf: number;
  lh: number;
  rank: number;
  hasSlot: boolean;
  sx: number;
  sz: number;
  sh: number;
  svx: number;
  svz: number;
  /** Clés de tri de l'affectation (ordre des unités, position latérale). */
  key: number;
  lat: number;

  // ── déplacement ──
  /** Vitesse maximale pour rejoindre l'emplacement (m/s). */
  vcap: number;
  lim0: number;
  lim1: number;
  lim2: number;
  limAt: number;
  /** Cap du regard voulu. */
  face: number;
  /** Itinéraire de contournement [x0, z0, …], nombre de valeurs utiles, point courant. */
  path: number[];
  pathN: number;
  pathI: number;
  pathAt: number;
  stuckT: number;
  lastX: number;
  lastZ: number;
  /** Pas de côté en cours (contournement d'un obstacle) : direction et échéance. */
  sideX: number;
  sideZ: number;
  sideUntil: number;
  sideCount: number;
  /** Consigne de déplacement du pas : but, vitesse du but, cap du regard, vitesse maximale. */
  goX: number;
  goZ: number;
  goVx: number;
  goVz: number;
  goFace: number;
  goCap: number;
  /** Laisser passer : décalage momentané de l'emplacement (m), échéance, dernière demande de passage. */
  yieldX: number;
  yieldZ: number;
  yieldUntil: number;
  wayAt: number;
  /** Instant à partir duquel l'agent exécute l'ordre reçu (délai de réaction). */
  reactAt: number;
  thinkAt: number;

  // ── posture et réflexes ──
  alertUntil: number;
  highGuard: boolean;
  crouch: boolean;
  /** Instant où le masque sera en place (0 : aucune mise en place en cours), et où il pourra être retiré. */
  maskAt: number;
  maskOffAt: number;
  /** Décalage d'évitement d'un danger (feu) appliqué à l'emplacement. */
  avoidX: number;
  avoidZ: number;
  avoidUntil: number;
  /** Obstacle à contourner en rejoignant l'emplacement (personne ou véhicule protégé) : centre et rayon (0 : aucun). */
  obX: number;
  obZ: number;
  obR: number;
  /** Décalage de désordre propre à l'agent (unité bousculée). */
  jx: number;
  jz: number;

  // ── opération détachée ──
  op: Op | null;
  opRole: number;
  /** Point visé par la tâche (remplace l'emplacement tant que op ≠ null). */
  goalX: number;
  goalZ: number;
  goalRun: boolean;
  /** Immobile sur place (geste en cours : saisie, menottage, ravitaillement). */
  hold: boolean;

  // ── action d'arme ──
  act: number;
  actItem: ItemId | '';
  actMeans: ForceMeans | '';
  actT: number;
  actUntil: number;
  actTx: number;
  actTy: number;
  actTz: number;
  actTarget: EntityId;
  actRestore: ItemId | '';
  actPower: number;
  actDone: boolean;
  /** Instant du prochain emploi possible d'un moyen de contact (bouclier, bâton, gazeuse). */
  contactAt: number;
  /** Poste de tir temporaire (créneau entre deux boucliers) : remplace l'emplacement jusqu'à l'échéance. */
  postX: number;
  postZ: number;
  postUntil: number;

  // ── état ──
  /** Garde son emplacement dans la formation (un agent tombé le garde quelques secondes). */
  formable: boolean;
  /** En état d'agir à cet instant : debout, libre, à pied, valide. */
  able: boolean;
  /** Instant où l'agent a cessé d'être en état d'agir (0 : il l'est). */
  downSince: number;
  /** Reste au véhicule (conducteur, équipage). */
  crew: boolean;
  /** Véhicule à rejoindre (embarquement en cours). */
  boardId: EntityId;
  /** Aléa individuel 0..1, fixé à la création. */
  seed: number;
}

/** Bloc de formation : une ligne, une colonne, une tortue, un écran… */
export interface FormGroup {
  kind: number;
  /** Repère : milieu du premier rang (tête pour une colonne), cap. */
  ax: number;
  az: number;
  ah: number;
  /** Vitesse du repère et vitesse de rotation. */
  avx: number;
  avz: number;
  aw: number;
  width: number;
  spacing: number;
  agents: Agent[];
  /** Premier rang, de la gauche vers la droite. */
  front: Agent[];

  // ── déplacement du repère ──
  moving: boolean;
  tx: number;
  tz: number;
  th: number;
  /** Allure nominale et vitesse courante (m/s). */
  speed: number;
  v: number;
  /** Tourner le repère vers la direction de marche. */
  wheel: boolean;

  // ── colonne ──
  files: number;
  path: number[];
  cum: number[];
  pathN: number;
  /** Abscisse de la tête le long de l'itinéraire, et longueur totale. */
  s: number;
  total: number;
  /** Cible suivie (colonne « suivre », écran, escorte) : personne ou véhicule. */
  followId: EntityId;
  radius: number;

  /** Porte ouverte dans le premier rang : abscisse latérale, demi-largeur, échéance (Infinity : permanente). */
  doorX: number;
  doorW: number;
  doorUntil: number;

  /** Emplacements du monde à recalculer. */
  dirty: boolean;
  /** Tous les agents sont à leur emplacement. */
  settled: boolean;

  // ── mesures (premier rang) ──
  errMax: number;
  errRms: number;
  /** Écart maximal de tous les agents du bloc à leur emplacement (m). */
  errAll: number;
  /** Retard maximal d'un agent sur son emplacement dans le sens de la marche (m). */
  lag: number;

  /** Issue tenue (encerclement) : index dans Unit.exits, −1 sinon. */
  exitIndex: number;
}

/** Opération détachée : quelques agents sortent du rang pour une tâche, puis reprennent leur place. */
export interface Op {
  kind: number;
  /** Unité qui dirige les agents engagés. */
  root: Unit;
  /** Unité qui a reçu l'ordre (ou pris l'initiative) : c'est elle qui rend compte. */
  owner: Unit;
  ordered: boolean;
  /** Instant de l'ordre de tâche auquel l'opération répond (−1 : initiative). */
  taskAt: number;
  stage: number;
  t0: number;
  stageT: number;
  nextAt: number;
  tries: number;
  targetId: EntityId;
  x: number;
  z: number;
  lead: Agent | null;
  second: Agent | null;
  cover1: Agent | null;
  cover2: Agent | null;
  /** Autres agents engagés (dégagement d'une barricade, ravitaillement). */
  extra: Agent[];
  /** Destination (remise, dépôt d'un blessé, véhicule de ravitaillement). */
  destX: number;
  destZ: number;
  destId: EntityId;
  count: number;
  done: boolean;
  ok: boolean;
  reason: string;
}

/** Ce que l'unité perçoit autour d'elle (rafraîchi quelques fois par seconde). */
export interface Sense {
  at: number;
  /** Manifestants à moins de 40 m, à moins de 12 m de la formation, au contact (3 m). */
  crowd: number;
  close: number;
  contact: number;
  /** Auteurs de violences actuelles : nombre et barycentre. */
  violent: number;
  vx: number;
  vz: number;
  /** Individu violent le plus dangereux à portée de LBD (0 si aucun). */
  lbdTargetId: EntityId;
  /** Auteur d'un flagrant délit à portée d'interpellation (0 si aucun). */
  arrestTargetId: EntityId;
  /** Barycentre de la foule proche (pour faire face). */
  cx: number;
  cz: number;
  /** Projectiles reçus récemment : nombre (fenêtre glissante), origine moyenne, dernier instant. */
  incoming: number;
  ox: number;
  oz: number;
  lastIncomingAt: number;
  mortars: number;
  lastMortarAt: number;
  /** Agent blessé récemment. */
  hurtAt: number;
  /** Gaz mesuré sur la formation. */
  gas: number;
  /** Hostiles autour de l'unité, par quadrant (encerclement réel). */
  quadrants: number;
  around: number;
}

/** Données de la manœuvre en cours. */
export interface Maneuver {
  /** Sous-étape. */
  step: number;
  stepT: number;
  /** Repère de départ (retour après une charge) et objectif. */
  x0: number;
  z0: number;
  h0: number;
  gx: number;
  gz: number;
  gh: number;
  /** Distance restante (vague de refoulement), fin de pause. */
  left: number;
  pauseUntil: number;
  /** Unité liée (relève) et cible suivie. */
  otherId: number;
  targetId: EntityId;
  /** Fermeture de rue ou station filtrée à lever en quittant le poste. */
  closureId: number;
  stationId: number;
  /** Déploiement en ligne à l'arrivée d'une colonne. */
  deploy: boolean;
  deployWidth: number;
  /** Salves de gaz tirées, prochaine salve. */
  volleys: number;
  volleyAt: number;
  /** Agents restant à débarquer ou à embarquer. */
  pending: number;
  nextExitAt: number;
}

/** Mémoire d'une unité (Squad.brain). */
export interface Unit {
  readonly tag: typeof UNIT_TAG;
  squad: Squad;
  id: number;
  parent: Unit | null;
  children: Unit[];
  /** L'unité dirige sa propre formation ; sinon `lead` est l'unité qui la dirige. */
  isRoot: boolean;
  lead: Unit;
  /** Unité sœur à laquelle elle s'est jointe pour une opération commune (encerclement partagé). */
  joinedTo: Unit | null;
  /** Véhicules de l'unité autres que Squad.vehicleId (fourgon cellulaire, motos). */
  extraVehicles: EntityId[];
  /** Empreinte de l'effectif dirigé (détection des changements). */
  memberSig: number;
  /** Rang dans le parcours de l'arborescence (contiguïté des unités dans une formation). */
  seq: number;
  /** Tri des unités sœurs (accumulateurs de barycentre, réutilisés à chaque affectation). */
  sortLat: number;
  accLat: number;
  accN: number;
  /** Membres directs, et tous les agents dirigés (racine seulement). */
  own: Agent[];
  agents: Agent[];
  groups: FormGroup[];

  // ── ordre en cours ──
  /** Ordre de formation en cours d'exécution (copie), ou null. */
  order: SquadOrder | null;
  /** Ordre de tâche en cours (copie), ou null. */
  task: SquadOrder | null;
  /** Dernier ordre connu dans le magasin (objet de Squad.order). */
  storeOrder: SquadOrder | null;
  /** Pendant une tâche : ordre du magasin à rétablir à la fin, et ordre posé entre-temps. */
  restoreOrder: SquadOrder | null;
  placedOrder: SquadOrder | null;
  phase: UnitPhase;
  phaseT: number;
  /** Instant au-delà duquel une mise en place est déclarée faite même si un agent manque. */
  formDeadline: number;
  man: Maneuver;
  /** Ordre reçu, à démarrer au prochain pas. */
  pending: SquadOrder | null;
  ackAt: number;
  ackText: string;
  reported: boolean;

  // ── perception, force ──
  sense: Sense;
  thinkAt: number;
  /** Riposte : avertissement fait, prochaine salve, masques ordonnés. */
  warnedAt: number;
  volleyAt: number;
  masksAt: number;
  lbdAt: number;
  attackReportAt: number;
  windReportAt: number;
  /** Tortue réflexe (mortiers) jusqu'à cet instant. */
  duckUntil: number;
  shieldsUntil: number;

  // ── logistique ──
  fatigue: number;
  /** Pression subie 0..1 (projectiles, contact, gaz), lissée. */
  pressure: number;
  disorder: number;
  reliefAt: number;
  needsRelief: boolean;
  arrests: number;
  ops: Op[];
  /** Effectif formable au dernier calcul des emplacements, et échéance d'une reformation. */
  formed: number;
  reformAt: number;
  /** Encerclement : issues calculées. */
  exits: ExitInfo[];
  /** Unités associées à l'opération (encerclement partagé). */
  joined: Unit[];

  status: UnitStatus;
  info: FormationInfo;
  statusAt: number;
}

export function isAgent(b: unknown): b is Agent {
  return b !== null && typeof b === 'object' && (b as Agent).tag === AGENT_TAG;
}

export function isUnit(b: unknown): b is Unit {
  return b !== null && typeof b === 'object' && (b as Unit).tag === UNIT_TAG;
}

export function agentOf(p: Person | undefined): Agent | null {
  return p && isAgent(p.brain) ? p.brain : null;
}

export function unitOf(s: Squad | undefined): Unit | null {
  return s && isUnit(s.brain) ? s.brain : null;
}

export function createAgent(p: Person, seed: number): Agent {
  return {
    tag: AGENT_TAG, p, home: null, root: null, group: null, baseCls: CLS_SECOND, cls: CLS_SECOND, shield: false,
    lx: 0, lf: 0, lh: 0, rank: 0, hasSlot: false, sx: p.x, sz: p.z, sh: p.heading, svx: 0, svz: 0, key: 0, lat: 0,
    vcap: 2.6, lim0: p.speedWalk, lim1: p.speedRun, lim2: p.speedSprint, limAt: -1, face: p.heading,
    path: [], pathN: 0, pathI: 0, pathAt: -100, stuckT: 0, lastX: p.x, lastZ: p.z, sideX: 0, sideZ: 0, sideUntil: 0, sideCount: 0, yieldX: 0, yieldZ: 0, yieldUntil: 0, wayAt: -100, goX: 0.5, goZ: 0.5, goVx: 0.5, goVz: 0.5, goFace: 0.5, goCap: 0.5,
    reactAt: 0, thinkAt: 0,
    alertUntil: 0, highGuard: false, crouch: false, maskAt: 0, maskOffAt: 0, avoidX: 0, avoidZ: 0, avoidUntil: 0, obX: 0, obZ: 0, obR: 0, jx: 0, jz: 0,
    op: null, opRole: 0, goalX: p.x, goalZ: p.z, goalRun: false, hold: false,
    act: ACT_NONE, actItem: '', actMeans: '', actT: 0, actUntil: 0, actTx: 0, actTy: 0, actTz: 0, actTarget: 0,
    actRestore: '', actPower: 1, actDone: false, contactAt: 0, postX: 0, postZ: 0, postUntil: 0,
    formable: true, able: true, downSince: 0, crew: false, boardId: 0, seed,
  };
}

export function createGroup(): FormGroup {
  return {
    kind: F_NONE, ax: 0, az: 0, ah: 0, avx: 0, avz: 0, aw: 0, width: 0, spacing: 0, agents: [], front: [],
    moving: false, tx: 0, tz: 0, th: 0, speed: 0, v: 0, wheel: false,
    files: 2, path: [], cum: [], pathN: 0, s: 0, total: 0, followId: 0, radius: 0,
    doorX: 0, doorW: 0, doorUntil: 0, dirty: true, settled: false, errMax: 0, errRms: 0, errAll: 0, lag: 0, exitIndex: -1,
  };
}

function createSense(): Sense {
  return {
    at: -100, crowd: 0, close: 0, contact: 0, violent: 0, vx: 0, vz: 0, lbdTargetId: 0, arrestTargetId: 0, cx: 0, cz: 0,
    incoming: 0, ox: 0, oz: 0, lastIncomingAt: -100, mortars: 0, lastMortarAt: -100, hurtAt: -100, gas: 0, quadrants: 0, around: 0,
  };
}

function createManeuver(): Maneuver {
  return {
    step: 0, stepT: 0, x0: 0, z0: 0, h0: 0, gx: 0, gz: 0, gh: 0, left: 0, pauseUntil: 0, otherId: 0, targetId: 0,
    closureId: 0, stationId: 0, deploy: false, deployWidth: 0, volleys: 0, volleyAt: 0, pending: 0, nextExitAt: 0,
  };
}

export function emptyAmmo(): UnitStatus['ammo'] {
  return { lacrymoMain: 0, lacrymoLanceur: 0, gm2l: 0, lbd: 0, desencerclement: 0, extincteur: 0, gazeuse: 0, menottes: 0 };
}

export function createUnit(squad: Squad): Unit {
  const status: UnitStatus = {
    squadId: squad.id, name: squad.name, total: 0, valid: 0, injured: 0, down: 0, detached: 0, embarked: 0,
    ammo: emptyAmmo(), reserve: emptyAmmo(), fatigue: 0, morale: squad.morale, stamina: 100, order: squad.order.type,
    phase: 'repos', formation: 'aucune', alignError: 0, needsRelief: false, underAttack: false, forceCap: 1,
    x: 0, z: 0, heading: 0, arrests: 0, rootId: squad.id,
  };
  const info: FormationInfo = {
    formation: 'aucune', x: 0, z: 0, heading: 0, width: 0, spacing: 0, front: [], slotErrorMax: 0, slotErrorRms: 0, slotErrorAll: 0,
    lineError: 0, moving: false, blocks: 0,
  };
  const u: Unit = {
    tag: UNIT_TAG, squad, id: squad.id, parent: null, children: [], isRoot: true, lead: null as unknown as Unit, joinedTo: null, extraVehicles: [], memberSig: 0, seq: 0, sortLat: 0, accLat: 0, accN: 0,
    own: [], agents: [], groups: [], order: null, task: null, storeOrder: squad.order, restoreOrder: null, placedOrder: null, phase: 'repos', phaseT: 0, formDeadline: 0, man: createManeuver(), pending: null,
    ackAt: 0, ackText: '', reported: true,
    sense: createSense(), thinkAt: 0, warnedAt: -100, volleyAt: 0, masksAt: 0, lbdAt: 0, attackReportAt: -100, windReportAt: -100,
    duckUntil: 0, shieldsUntil: 0,
    fatigue: 0, pressure: 0, disorder: 0, reliefAt: -1000, needsRelief: false, arrests: 0, ops: [], formed: 0, reformAt: 0,
    exits: [], joined: [], status, info, statusAt: -100,
  };
  u.lead = u;
  return u;
}

export function createOp(kind: number, root: Unit, owner: Unit, now: number): Op {
  return {
    kind, root, owner, ordered: false, taskAt: -1, stage: 0, t0: now, stageT: now, nextAt: 0, tries: 0, targetId: 0, x: 0, z: 0,
    lead: null, second: null, cover1: null, cover2: null, extra: [], destX: 0, destZ: 0, destId: 0, count: 0,
    done: false, ok: false, reason: '',
  };
}

/** Types d'ordres qui ne changent pas la formation : seuls des spécialistes sortent du rang. */
export function isTaskOrder(type: string): boolean {
  return type === 'interpeller' || type === 'eteindre' || type === 'secourir' || type === 'ravitailler'
    || type === 'degager_barricade' || type === 'disperser_gaz';
}

/** Ordres qui tiennent une position (résistance à la poussée, boucliers prêts). */
export function isHoldOrder(type: string): boolean {
  return type === 'ligne' || type === 'tenir' || type === 'tortue' || type === 'encercler' || type === 'proteger'
    || type === 'couper_circulation' || type === 'filtrer';
}
