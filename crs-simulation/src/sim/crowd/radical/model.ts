/* =====================================================================================
 * GROUPES RADICAUX — données internes : membre, groupe d'affinité, appréciation de situation.
 * Champs plats et numériques : les boucles de pilotage les lisent à chaque pas, sans allocation.
 * ===================================================================================== */

import type { EntityId, InteractVerb, ItemId, Person } from '@/core/contracts';
import type { CrowdBrain } from '../brain';
import type { GroupPlan } from './api';

/** Plans d'un groupe (index dans PLAN_NAMES). */
export const PLAN = {
  FOLLOW: 0, RALLY: 1, PREPARE: 2, VOLLEY: 3, ASSAULT: 4, RESCUE: 5, BARRICADE: 6, BREAK: 7, ARSON: 8, FLIP: 9,
  RESUPPLY: 10, FALLBACK: 11, SCATTER: 12, REGROUP: 13, MELT: 14,
} as const;

export const PLAN_NAMES: readonly GroupPlan[] = [
  'suivre', 'rallier', 'preparer', 'salve', 'assaut', 'liberer', 'barricade', 'casse', 'incendie', 'renverser',
  'ravitailler', 'recul', 'dispersion', 'regroupement', 'fusion',
];

/** Tâche individuelle d'un membre dans le plan de son groupe. */
export const TASK = {
  /** Rendu au comportement par défaut du cœur de la foule. */
  NONE: 0,
  /** Tient sa place dans la formation du groupe. */
  SLOT: 1,
  CHANGE: 2,
  SUPPLY: 3,
  THROW: 4,
  MORTAR: 5,
  MOLOTOV: 6,
  MELEE: 7,
  BREAK: 8,
  TAG: 9,
  CARRY: 10,
  IGNITE: 11,
  FLIP: 12,
  RETURN: 13,
  LOOT: 14,
  /** Court vers un point (dispersion, regroupement, fuite avec un butin). */
  RUN: 15,
  SIGNAL: 16,
} as const;

/** Geste élémentaire en cours (machine d'actions, acts.ts). */
export const ACT = { NONE: 0, GOTO: 1, VERB: 2, THROW: 3, STRIKE: 4, KICK: 5, RACKET: 6, WAIT: 7 } as const;

/** Issue du dernier geste. */
export const RES = { RUNNING: 0, DONE: 1, FAILED: 2 } as const;

/** Nature du membre. */
export const KIND = { RADICAL: 0, FOLLOWER: 1, LOOTER: 2 } as const;

/** Outils et objets détenus (masque de bits, relu de l'inventaire). */
export const TOOL = {
  BANNER: 1, UMBRELLA: 2, HAMMER: 4, BAR: 8, MORTAR: 16, MOLOTOV: 32, PAINT: 64, RACKET: 128, SMOKE: 256, PAVE: 512,
  BOTTLE: 1024, LOOT: 2048,
} as const;

/** Nature de la cible d'un groupe. */
export const TARGET = { NONE: 0, POLICE: 1, PERSON: 2, SHOP: 3, PROP: 4, VEHICLE: 5, PLACE: 6 } as const;

export interface RadMember {
  readonly p: Person;
  readonly b: CrowdBrain;
  kind: number;
  group: RadGroup | null;
  tools: number;
  /** Projectiles à lancer détenus (pavés + bouteilles). */
  ammo: number;
  toolsAt: number;

  // ── formation : place dans le groupe (repère du groupe : latéral vers la droite, profondeur vers l'arrière) ──
  lx: number;
  lz: number;

  // ── tâche ──
  task: number;
  taskSince: number;
  taskUntil: number;
  /** Étape de la tâche (libre selon la tâche) et essais infructueux. */
  step: number;
  tries: number;
  /** Cible de la tâche : entité, point. */
  tId: EntityId;
  tx: number;
  tz: number;

  // ── geste élémentaire ──
  act: number;
  actStage: number;
  actSince: number;
  actUntil: number;
  actX: number;
  actY: number;
  actZ: number;
  actId: EntityId;
  actItem: ItemId | '';
  actVerb: InteractVerb | '';
  /** Distance d'arrêt (GOTO), portée du geste (VERB), coups restants (STRIKE). */
  actReach: number;
  actCount: number;
  /** Instant avant lequel le geste ne part pas (salve coordonnée). */
  actNotBefore: number;
  /** Point vers lequel se tourner pendant le geste (NaN : vers la cible). */
  actFX: number;
  actFZ: number;
  /** Détection de blocage pendant une approche : repère, instant, échecs. */
  stX: number;
  stZ: number;
  stT: number;
  stN: number;
  /** Écart de contournement en cours (on bute sur un objet) : jusqu'à cet instant. */
  dodgeUntil: number;
  result: number;
  /** Index dans la liste des membres en train d'agir (−1 sinon). */
  actIndex: number;

  // ── état ──
  /** Le contrôleur avait la main à la dernière réflexion. */
  held: boolean;
  black: boolean;
  masked: boolean;
  umbrella: boolean;
  banner: boolean;
  /** Tenue d'origine déjà notée (pour redevenir un manifestant ordinaire). */
  wasBlack: boolean;
  wasMasked: boolean;
  maskAt: number;
  changeAt: number;
  nextThrowAt: number;
  nextScan: number;
  nextReflex: number;
  /** Équipe de dispersion (index du point de ralliement). */
  team: number;
  /** Hors de combat (à terre, interpellé) depuis cet instant ; −1 : valide. */
  lostAt: number;
  /** Projectiles lancés et pris depuis le début. */
  thrown: number;
  collected: number;
  /** Actes commis à visage découvert ou non (pour la décision de se fondre). */
  acts: number;
}

/** Appréciation de la situation locale d'un groupe (rapport de force), refaite à chaque réflexion. */
export interface Assessment {
  /** Agents valides à pied à moins de 110 m, et à moins de 30 m. */
  police: number;
  near: number;
  /** Barycentre des agents retenus. */
  px: number;
  pz: number;
  /** Agent le plus proche. */
  nearId: EntityId;
  nx: number;
  nz: number;
  dist: number;
  /** Vitesse de rapprochement des forces (m/s ; négative : elles reculent). */
  closing: number;
  /** Direction de la ligne (axe principal, unitaire). */
  lineX: number;
  lineZ: number;
  /** Endurance moyenne des agents 0..1 et part de boucliers levés. */
  stamina: number;
  shields: number;
  /** Agent isolé ou à terre le plus proche (0 : aucun). */
  isolatedId: EntityId;
  isolatedDist: number;
  downId: EntityId;
  downDist: number;
  /** Camarade interpellé à portée (0 : aucun), agents autour de lui. */
  heldId: EntityId;
  heldX: number;
  heldZ: number;
  heldEscort: number;
  /** Distance à l'engin lanceur d'eau, au blindé, au véhicule de police le plus proche (Infinity : aucun). */
  water: number;
  armour: number;
  vehicleId: EntityId;
  vehicleDist: number;
  /** Gaz : exposition moyenne des membres, concentration au point du groupe. */
  gas: number;
  gasField: number;
  /** Manifestants autour (couverture). */
  cover: number;
  /** Membres valides. */
  able: number;
  /** Rapport de force (> 1 : favorable). */
  ratio: number;
  /** Ligne de vue du point du groupe au barycentre des forces. */
  sight: boolean;
}

export function makeAssessment(): Assessment {
  return {
    police: 0, near: 0, px: 0, pz: 0, nearId: 0, nx: 0, nz: 0, dist: Infinity, closing: 0, lineX: 1, lineZ: 0, stamina: 1,
    shields: 0, isolatedId: 0, isolatedDist: Infinity, downId: 0, downDist: Infinity, heldId: 0, heldX: 0, heldZ: 0,
    heldEscort: 0, water: Infinity, armour: Infinity, vehicleId: 0, vehicleDist: Infinity, gas: 0, gasField: 0, cover: 0,
    able: 0, ratio: 1, sight: false,
  };
}

/** Chantier de barricade d'un groupe. */
export interface BarricadeSite {
  active: boolean;
  x: number;
  z: number;
  /** Direction en travers de la rue (unitaire) et direction de la rue. */
  ax: number;
  az: number;
  rx: number;
  rz: number;
  /** Demi-largeur à barrer (m). */
  half: number;
  /** Objets posés, volume posé. */
  placed: number;
  bulk: number;
  barricadeId: EntityId;
  lit: boolean;
  startedAt: number;
}

export interface RadGroup {
  readonly id: number;
  squadId: number;
  name: string;
  readonly members: RadMember[];
  readonly followers: RadMember[];
  size0: number;
  leader: RadMember | null;
  morale: number;
  cohesion: number;

  plan: number;
  planSince: number;
  planUntil: number;
  stage: number;
  stageSince: number;
  /** Étape dont le code d'entrée a déjà tourné (−1 : aucune). */
  entered: number;
  /** Plan à reprendre après un ravitaillement. */
  resume: number;
  nextThink: number;

  // ── point du groupe (ancre) : position, orientation, déplacement groupé ──
  ax: number;
  az: number;
  hx: number;
  hz: number;
  destX: number;
  destZ: number;
  path: number[] | null;
  pathI: number;
  speed: number;
  arrived: boolean;
  cols: number;
  /** Formation serrée (bloc) ou lâche. */
  tight: boolean;
  /** Rang dans le bloc (0 : groupe de tête, porteur de la banderole). */
  rank: number;

  // ── cible ──
  tKind: number;
  tId: EntityId;
  tx: number;
  tz: number;

  readonly a: Assessment;
  ammo: number;
  throwers: number;
  /** Instant de la salve en cours, nombre de salves, prochaine salve possible. */
  volleyAt: number;
  volleys: number;
  nextVolley: number;
  /** Vagues de lancers restantes avant le recul. */
  rounds: number;
  bold: boolean;
  readonly site: BarricadeSite;
  /** Source de projectiles retenue : objet (0 : chaussée pavée), point. */
  supplyId: EntityId;
  supplyX: number;
  supplyZ: number;
  supplyKind: number;
  /** Point de ralliement après dispersion. */
  rallyX: number;
  rallyZ: number;
  /** Signes en cours, par type (identifiant du signe, 0 : aucun). */
  readonly signs: Int32Array;
  black: boolean;
  lost: number;
  lastLossAt: number;
  /** Compte rendu du dernier plan : a-t-il abouti ? */
  planOk: boolean;
  /** Le groupe a rompu (pertes, moral) : il ne reprendra pas l'action dans ce cycle. */
  broken: boolean;
  /** Motif du dernier repli. */
  why: string;
  /** Objets de barricade attribués (compteur d'emplacements). */
  assigned: number;
  /** Fin du délai de ré-examen du plan. */
  reviewAt: number;
  /** La rue n'offre plus rien à lancer : pas de nouvelle recherche avant cet instant. */
  noAmmoUntil: number;
  /** Le groupe s'est déjà déplacé pour ce ravitaillement. */
  travelled: boolean;
  /** Dernier instant où un membre prenait des projectiles. */
  lastSupplyAt: number;
  /** Cibles déjà traitées par ce groupe (pour ne pas y revenir). */
  readonly done: EntityId[];
}

export function makeSite(): BarricadeSite {
  return { active: false, x: 0, z: 0, ax: 1, az: 0, rx: 0, rz: 1, half: 4, placed: 0, bulk: 0, barricadeId: 0, lit: false, startedAt: 0 };
}

export function createMember(p: Person, b: CrowdBrain, kind: number, now: number): RadMember {
  return {
    p, b, kind, group: null, tools: 0, ammo: 0, toolsAt: -1, lx: 0, lz: 0,
    task: TASK.NONE, taskSince: now, taskUntil: 0, step: 0, tries: 0, tId: 0, tx: p.x, tz: p.z,
    act: ACT.NONE, actStage: 0, actSince: 0, actUntil: 0, actX: 0, actY: 0, actZ: 0, actId: 0, actItem: '', actVerb: '',
    actReach: 0, actCount: 0, actNotBefore: 0, actFX: NaN, actFZ: NaN, stX: p.x, stZ: p.z, stT: now, stN: 0, dodgeUntil: 0, result: RES.DONE,
    actIndex: -1,
    held: false, black: false, masked: false, umbrella: false, banner: false, wasBlack: false, wasMasked: false,
    maskAt: Infinity, changeAt: Infinity, nextThrowAt: 0, nextScan: 0, nextReflex: 0, team: 0, lostAt: -1, thrown: 0,
    collected: 0, acts: 0,
  };
}

export function createGroup(id: number, now: number): RadGroup {
  return {
    id, squadId: 0, name: '', members: [], followers: [], size0: 0, leader: null, morale: 0.7, cohesion: 1,
    plan: PLAN.FOLLOW, planSince: now, planUntil: Infinity, stage: 0, stageSince: now, entered: -1, resume: PLAN.FOLLOW,
    nextThink: now,
    ax: 0, az: 0, hx: 0, hz: 1, destX: 0, destZ: 0, path: null, pathI: 0, speed: 0, arrived: true, cols: 4, tight: false, rank: 0,
    tKind: TARGET.NONE, tId: 0, tx: 0, tz: 0, a: makeAssessment(), ammo: 0, throwers: 0, volleyAt: -1, volleys: 0, nextVolley: 0, rounds: 0,
    bold: false, site: makeSite(), supplyId: 0, supplyX: 0, supplyZ: 0, supplyKind: 0, rallyX: 0, rallyZ: 0,
    signs: new Int32Array(8), black: false, lost: 0, lastLossAt: -1e9, planOk: true, broken: false, why: '', assigned: 0,
    reviewAt: 0, noAmmoUntil: 0, travelled: false, lastSupplyAt: 0, done: [],
  };
}

/** Membre valide : ni à terre, ni interpellé, ni à bord d'un véhicule, encore dans le jeu. */
export function isAble(m: RadMember): boolean {
  const p = m.p;
  return m.b.index >= 0 && p.custody === 'free' && p.heldBy === 0 && p.posture !== 'down' && p.vehicleId === 0 && !p.dormant;
}

/** Phases du bloc (index dans BLOC_NAMES). */
export const BLOC = { DORMANT: 0, SIGNS: 1, FORMING: 2, ACTION: 3, RETREAT: 4, WILD: 5, MELTED: 6 } as const;

/** État commun à tous les groupes : la coordination du bloc. */
export interface BlocState {
  phase: number;
  phaseSince: number;
  /** Point du bloc et direction de marche. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Instant prévu du passage à l'acte et échelle de l'avance des signes. */
  actAt: number;
  lead: number;
  /** Le signal de ralliement a été donné (instant, −1 sinon). */
  signalAt: number;
  /** Horloge commune des salves. */
  volleyAt: number;
  /** Points de dispersion par les rues adjacentes [x0, z0, …] et point de regroupement. */
  readonly exits: number[];
  rallyX: number;
  rallyZ: number;
}
