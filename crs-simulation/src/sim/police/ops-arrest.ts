/* =====================================================================================
 * FORCES DE L'ORDRE — interpellation (bible §H.1) : le binôme sort par une « porte » ouverte dans
 * la ligne, couvert par deux boucliers, et enchaîne les interactions du module de droit comme le
 * ferait un joueur : maitriser → menotter → escorter → remettre, puis reprend sa place.
 *
 * Où remettre l'interpellé (findHandover) : au fourgon cellulaire du dispositif le plus proche qui a une place — à
 * moins de 80 m le binôme l'y conduit ; plus loin, le fourgon vient (arrest-service.ts) à 20 m derrière la ligne la plus
 * proche et le binôme l'y attend avec l'interpellé ; sans fourgon, un véhicule de l'unité ayant une place (400 m), puis
 * un point de regroupement 'law.handover' ; faute de tout, l'interpellé est gardé derrière la ligne, et le ramassage
 * (arrest-service.ts) le conduit au fourgon dès qu'il y en a un.
 *
 * Autres opérations du même type (OP_ARREST, étapes au-delà de la remise) :
 *   « Confier » / ramassage  le binôme rejoint un interpellé déjà menotté (ou maintenu au sol par le joueur), le prend
 *                            en escorte et le remet (startEscort, étape STAGE_JOIN) ;
 *   « Aller constater »      ordre d'interpeller sans fait constaté : le binôme se porte à 10 m du point (ou de la
 *                            personne désignée), observe et interpelle au premier fait constaté (createWatch, STAGE_WATCH) ;
 *   interpellé remis à un point de regroupement (assis, procédure close) : le fourgon vient à lui, le binôme l'y fait
 *                            monter (startPickup, STAGE_PICKUP).
 * ===================================================================================== */

import type { EntityId, Person, Vehicle } from '@/core/contracts';
import { ARREST_EVENT } from './api';
import type { ArrestService } from './arrest-service';
import { POLICE_ARRESTS_SERVICE } from './arrest-service';
import type { Agent, Op, Unit } from './brain';
import { F_NONE, OP_ARREST, ROLE_LEAD, ROLE_SECOND, createOp } from './brain';
import { recentFlagrant } from './force';
import type { Kernel } from './kernel';
import { report } from './mcore';
import {
  anyTrooper, approachPoint, busy, dist, engage, finish, isCatcher, isHelper, nearest, lineDoor, nextStage, offLine, openDoor, release, setGoal,
  takeCover,
} from './ops-core';
import { fleetOf } from './tree';
import * as T from './tuning';

// ───────────────────────────── étapes et réglages ─────────────────────────────

/** Le binôme rejoint un interpellé déjà menotté (ou maintenu au sol) pour le prendre en escorte. */
export const STAGE_JOIN = 6;
/** « Aller constater » : le binôme observe à distance et interpelle au premier fait constaté. */
export const STAGE_WATCH = 7;
/** Interpellé laissé à un point de regroupement : le fourgon vient, le binôme l'y fait monter. */
export const STAGE_PICKUP = 8;

/** Destinations de la remise (Op.count à l'étape 4). */
const DEST_NONE = 0;
const DEST_VEHICLE = 1;
const DEST_POINT = 2;
/** Fourgon cellulaire appelé : le binôme l'attend au rendez-vous avec l'interpellé. */
const DEST_VAN_COMING = 3;

/** En deçà (m) le binôme conduit l'interpellé au fourgon à pied ; au-delà, le fourgon vient (plan §5.4). */
export const VAN_NEAR = 80;
/** Le fourgon appelé s'arrête à tant de mètres derrière la ligne la plus proche de l'interpellation (m). */
const RDV_BACK = 20;
/** Distance maximale (m) à laquelle on conduit un interpellé à pied jusqu'à un véhicule. */
export const WALK_MAX = 400;
/** Fourgon arrivé au rendez-vous (m), ou arrêté près du binôme (m) : le binôme y conduit l'interpellé. */
const VAN_AT_RDV = 25;
const VAN_CLOSE = 40;
/** Fourgon appelé qui n'est pas arrivé au bout de tant de secondes : on en cherche un autre (ou le même, relancé). */
const VAN_WAIT_MAX = 150;
/**
 * Fourgon appelé qui ne s'est pas rapproché du rendez-vous de VAN_PROGRESS m depuis VAN_STALL s (coincé dans sa file,
 * rue barrée, foule) : s'il est à moins de WALK_MAX m, le binôme y conduit l'interpellé à pied ; sinon un autre
 * fourgon. Un fourgon encore loin du binôme (plus de VAN_STALL_NEAR m : la marche serait longue), ou qui sort encore de
 * sa file (arrest-service.ts pullingOut), a VAN_STALL_FAR s.
 */
const VAN_PROGRESS = 5;
const VAN_STALL = 12;
const VAN_STALL_FAR = 45;
const VAN_STALL_NEAR = 150;
/** Le binôme qui va au-devant du fourgon appelé s'arrête à tant de mètres de lui tant qu'il roule (m). */
const MEET_GAP = 8;
/** Attente totale à l'étape de la remise au-delà de laquelle l'interpellé est gardé sur place (s). */
const HANDOVER_MAX = 240;
const HANDOVER_WAIT_MAX = 480;
/** Le binôme qui rejoint un interpellé y renonce au bout de tant de secondes (s). */
const JOIN_MAX = 75;
/** « Aller constater » : distance d'observation (m), rayon où un auteur est cherché autour du point (m), durée (s). */
export const WATCH_DISTANCE = 10;
const WATCH_SCAN = 15;
const WATCH_MAX = 180;
/** Fait constaté retenu pendant la surveillance : commis depuis moins de tant de secondes (s). */
const WATCH_FRESH = 20;
/** Motif de fin d'une surveillance sans fait constaté (compte rendu : ops.ts opReport). */
export const WATCH_NOTHING = 'Rien constaté sur place.';
/** Ramassage : le fourgon à moins de tant de mètres de l'interpellé, le binôme l'y fait monter (m). */
const PICKUP_REACH = 12;
const PICKUP_MAX = 240;

/**
 * Poursuite : l'individu « fuit » s'il s'éloigne du binôme à plus de CHASE_FLEE m/s ; une fois sa fuite finie (il ne
 * s'éloigne plus qu'à CHASE_SLOW m/s au plus — moins vite que le pas du binôme), à moins de CHASE_CALM m de lui, le
 * binôme approche au pas (au-delà des 24 m où la foule voit une charge dans des agents qui courent — crowd/behavior.ts).
 */
const CHASE_FLEE = 1.5;
const CHASE_SLOW = 0.8;
const CHASE_CALM = 26;

type ArrestKind = 'arrest' | 'escort' | 'watch' | 'pickup';

/** Données propres aux opérations d'interpellation, à côté de l'Op commune (brain.ts). */
export interface ArrestExtra {
  kind: ArrestKind;
  /** Fourgon cellulaire appelé (véhicule), point de rendez-vous et instant de l'appel. */
  rdvX: number;
  rdvZ: number;
  calledAt: number;
  /** Meilleure distance du fourgon appelé au rendez-vous (m) et instant où elle a été atteinte (s). */
  vanBest: number;
  vanBestAt: number;
  /** « Un interpellé conduit au CELLULAIRE 1 » déjà dit. */
  announced: boolean;
  /** « Confier » : le joueur qui confie ; une demande « faire asseoir » lui a été faite (interpellé sans menottes). */
  fromId: EntityId;
  seatAsked: boolean;
  /** « Aller constater » : personne désignée (0 : le point seul). */
  watchId: EntityId;
  /** L'individu a fui devant le binôme : fuite finie, il est rejoint au pas (voir CHASE_CALM). */
  fled: boolean;
}

const extras = new WeakMap<Op, ArrestExtra>();

function extraOf(op: Op): ArrestExtra {
  let e = extras.get(op);
  if (!e) {
    e = { kind: 'arrest', rdvX: 0, rdvZ: 0, calledAt: -1, vanBest: Infinity, vanBestAt: -1, announced: false, fromId: 0, seatAsked: false, watchId: 0, fled: false };
    extras.set(op, e);
  }
  return e;
}

/** Nature d'une opération d'interpellation (null : une autre opération). */
export function arrestKind(op: Op): ArrestKind | null {
  return op.kind === OP_ARREST ? extraOf(op).kind : null;
}

/** L'unité `owner` (racine `root`) mène-t-elle une surveillance « Aller constater » ? */
export function watching(root: Unit, owner: Unit): boolean {
  for (let i = 0; i < root.ops.length; i++) {
    const op = root.ops[i];
    if (!op.done && op.owner === owner && op.kind === OP_ARREST && op.stage === STAGE_WATCH) return true;
  }
  return false;
}

/** Interpellé qui attend le fourgon appelé (étape de la remise) : son fourgon, ou 0. */
export function waitingVan(op: Op): EntityId {
  return op.kind === OP_ARREST && !op.done && op.stage === 4 && op.count === DEST_VAN_COMING ? op.destId : 0;
}

/** Véhicule vers lequel l'opération conduit (ou attend) un interpellé : une place y est retenue pour lui. */
export function reservedVehicle(op: Op): EntityId {
  if (op.kind !== OP_ARREST || op.done) return 0;
  if (op.stage === 4 && (op.count === DEST_VEHICLE || op.count === DEST_VAN_COMING)) return op.destId;
  if (op.stage === STAGE_PICKUP) return op.destId;
  return 0;
}

/**
 * L'agent a-t-il la charge d'un interpellé — premier ou équipier d'une interpellation dont l'individu est déjà maîtrisé,
 * d'une prise en charge (« Confier », ramassage) ou d'une mise à bord ? Il ne le lâche pas pour embarquer avec son
 * unité : il monte après la remise (special.ts startEmbark / reseat, system.ts drive). Même règle qu'abortOps (ops.ts) :
 * une personne maîtrisée n'est pas abandonnée.
 */
export function withDetainee(a: Agent): boolean {
  const op = a.op;
  return op !== null && !op.done && op.kind === OP_ARREST && op.stage >= 2 && op.stage !== STAGE_WATCH && (op.lead === a || op.second === a);
}

function desk(k: Kernel): ArrestService | undefined {
  return k.ctx.service<ArrestService>(POLICE_ARRESTS_SERVICE);
}

// ───────────────────────────── interpellation ─────────────────────────────

const catcherOrHelper = (a: Agent): boolean => isCatcher(a) || isHelper(a);

/** Agent qui mène l'interpellation (binôme d'interpellation, puis second rang, puis n'importe quel équipier sur ordre). */
function pickLead(root: Unit, within: Unit | null, x: number, z: number, ordered: boolean): Agent | null {
  // rue barrée : le binôme sort du second rang, le premier tient la rue (pas de trou dans le barrage)
  const catcher = offLine(root, isCatcher);
  const helper = offLine(root, isHelper);
  let lead = nearest(root, within, x, z, catcher, null);
  if (!lead) lead = nearest(root, within, x, z, helper, null);
  if (!lead && ordered) lead = nearest(root, within, x, z, offLine(root, anyTrooper), null);
  if (!lead && ordered && root.man.barrage) {
    // Ordre d'interpeller et personne hors du premier rang (rue large : toute la section tient la ligne, y compris le
    // binôme d'interpellation ; ou les agents du second rang gardent déjà des interpellés) : l'ordre n'est pas refusé
    // pour autant — l'agent du rang le plus proche sort par la porte (lineDoor), le rang se referme derrière lui.
    // (Sinon, à une sortie filtrée, chaque auteur retenu à la porte était relâché : « Aucun binôme disponible ».)
    lead = nearest(root, within, x, z, catcherOrHelper, null) ?? nearest(root, within, x, z, anyTrooper, null);
  }
  return lead;
}

/** Équipier du premier (binôme d'interpellation, sinon second rang). */
function pickSecond(root: Unit, within: Unit | null, x: number, z: number, lead: Agent): Agent | null {
  return nearest(root, within, x, z, offLine(root, isCatcher), lead) ?? nearest(root, within, x, z, offLine(root, isHelper), lead);
}

/** Lance l'interpellation d'une personne par le binôme le plus proche. null si personne n'est disponible. */
export function createArrest(k: Kernel, root: Unit, owner: Unit, target: Person, ordered: boolean): Op | null {
  const within = ordered ? owner : null;
  const lead = pickLead(root, within, target.x, target.z, ordered);
  if (!lead) return null;
  const op = createOp(OP_ARREST, root, owner, k.now);
  op.ordered = ordered;
  op.targetId = target.id;
  op.x = target.x;
  op.z = target.z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  op.second = pickSecond(root, within, target.x, target.z, lead);
  engage(op, op.second, ROLE_SECOND);
  takeCover(op, lead.p.x, lead.p.z, null);
  openDoor(k, lead, target.x, target.z, 5);
  root.ops.push(op);
  k.emit(ARREST_EVENT, { squadId: owner.id, targetId: target.id, byId: lead.p.id, stage: 'sortie' });
  return op;
}

/**
 * « Aller constater » (plan §4.3) : ordre d'interpeller sans fait constaté. Le binôme se porte à WATCH_DISTANCE m du
 * point (ou de la personne désignée, `personId`), observe, et interpelle au premier fait constaté autour ; au bout de
 * WATCH_MAX s sans rien, il rend compte et reprend sa place. null si personne n'est disponible.
 */
export function createWatch(k: Kernel, root: Unit, owner: Unit, x: number, z: number, personId: EntityId): Op | null {
  const lead = pickLead(root, owner, x, z, true);
  if (!lead) return null;
  const op = createOp(OP_ARREST, root, owner, k.now);
  op.ordered = true;
  op.targetId = 0;
  op.x = x;
  op.z = z;
  op.stage = STAGE_WATCH;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  op.second = pickSecond(root, owner, x, z, lead);
  engage(op, op.second, ROLE_SECOND);
  const ex = extraOf(op);
  ex.kind = 'watch';
  ex.watchId = personId;
  openDoor(k, lead, x, z, 5);
  root.ops.push(op);
  return op;
}

/**
 * Le binôme `lead` (avec `second`) prend en charge un interpellé qu'il n'a pas lui-même interpellé : « Confier » du
 * joueur (`fromId` : le joueur), ou ramassage d'un interpellé laissé seul. Menotté ou maintenu au sol : le binôme le
 * rejoint (STAGE_JOIN) ; déjà escorté par `lead` (agent qui le gardait) : la remise commence (étape 4).
 */
export function startEscort(k: Kernel, lead: Agent, second: Agent | null, target: Person, fromId: EntityId): Op | null {
  const root = lead.root;
  if (!root) return null;
  const owner = lead.home ?? root;
  const op = createOp(OP_ARREST, root, owner, k.now);
  op.ordered = false;
  op.targetId = target.id;
  op.x = target.x;
  op.z = target.z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  op.second = second;
  engage(op, second, ROLE_SECOND);
  const ex = extraOf(op);
  ex.kind = 'escort';
  ex.fromId = fromId;
  root.ops.push(op);
  if (target.custody === 'escorted' && target.heldBy === lead.p.id) {
    lead.goalRun = false;
    findHandover(k, op, lead.p);
    nextStage(k, op, 4);
  } else {
    lead.goalRun = dist(target, lead.p.x, lead.p.z) > 8;
    nextStage(k, op, STAGE_JOIN);
  }
  return op;
}

/** Interpellé laissé à un point de regroupement (assis, procédure close) : le fourgon `van` vient, `lead` l'y fait monter. */
export function startPickup(k: Kernel, lead: Agent, second: Agent | null, target: Person, van: Vehicle): Op | null {
  const root = lead.root;
  if (!root) return null;
  const op = createOp(OP_ARREST, root, lead.home ?? root, k.now);
  op.targetId = target.id;
  op.x = target.x;
  op.z = target.z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  op.second = second;
  engage(op, second, ROLE_SECOND);
  op.destId = van.id;
  op.count = DEST_VAN_COMING;
  const ex = extraOf(op);
  ex.kind = 'pickup';
  ex.rdvX = target.x;
  ex.rdvZ = target.z;
  ex.calledAt = k.now;
  root.ops.push(op);
  nextStage(k, op, STAGE_PICKUP);
  return op;
}

// ───────────────────────────── destination de la remise ─────────────────────────────

/** Place de passager libre d'un véhicule (−1 : aucune). */
export function freeSeat(v: Vehicle): number {
  for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') return s;
  return -1;
}

/**
 * Point de rendez-vous du fourgon appelé (écrit dans k.v2) : à la hauteur de l'interpellation, 20 m derrière la ligne
 * dont venait le binôme (son bloc de formation, sinon celui de son unité) — l'interpellé ramené en arrière de la ligne,
 * jamais devant elle, vers la foule —, ramené sur la chaussée la plus proche ; sans ligne, la chaussée près du binôme.
 */
function rendezVous(k: Kernel, op: Op, from: Person): void {
  const lead = op.lead;
  const own = lead && lead.group && lead.group.kind !== F_NONE ? lead.group : null;
  const g = own ?? (op.root.groups.length > 0 ? op.root.groups[0] : null);
  let x = from.x;
  let z = from.z;
  if (g && g.kind !== F_NONE && Math.hypot(g.ax - from.x, g.az - from.z) < 150) {
    const fx = Math.sin(g.ah);
    const fz = Math.cos(g.ah);
    // distance de l'interpellé devant le front de la ligne (négative : déjà derrière)
    const ahead = (from.x - g.ax) * fx + (from.z - g.az) * fz;
    const back = ahead + RDV_BACK;
    if (back > 0) {
      x = from.x - fx * back;
      z = from.z - fz * back;
    }
  }
  const road = k.road;
  if (k.ctx.world.nearestRoad(x, z, road, 40)) {
    x = road.x;
    z = road.z;
  }
  k.v2.x = x;
  k.v2.z = z;
}

/** Point de la chaussée (écrit dans k.v2) à la fraction `f` du trajet de l'interpellé (`from`) au fourgon `van`. */
function alongTo(k: Kernel, from: Person, van: Vehicle, f: number): void {
  let x = from.x + (van.x - from.x) * f;
  let z = from.z + (van.z - from.z) * f;
  const road = k.road;
  if (k.ctx.world.nearestRoad(x, z, road, 40)) {
    x = road.x;
    z = road.z;
  }
  k.v2.x = x;
  k.v2.z = z;
}

/** L'opération conduit l'interpellé au véhicule `v` (point d'approche à son flanc ou à l'arrière). */
function toVehicle(k: Kernel, op: Op, v: Vehicle, from: Person): void {
  op.destId = v.id;
  op.count = DEST_VEHICLE;
  approachPoint(k, v, from);
  op.destX = k.v2.x;
  op.destZ = k.v2.z;
}

/** « Un interpellé conduit au CELLULAIRE 1 » : une fois par interpellé, quand son fourgon est fixé. */
function announce(k: Kernel, op: Op, van: Vehicle): void {
  const ex = extraOf(op);
  if (ex.announced) return;
  ex.announced = true;
  const s = desk(k)?.crewOf(van);
  report(k, op.owner, 'Un interpellé conduit au ' + (s ? s.name : 'fourgon cellulaire'), 0, false);
}

/**
 * Destination de la remise. Fourgon cellulaire du dispositif ayant une place (le plus proche de l'interpellé) : à moins
 * de VAN_NEAR m on l'y conduit ; plus loin il est appelé au rendez-vous (DEST_VAN_COMING) — s'il ne peut pas venir et
 * qu'il est à moins de WALK_MAX m, on l'y conduit quand même. Sinon un véhicule de l'unité ayant une place (WALK_MAX m),
 * puis un point de regroupement 'law.handover' (500 m) ; faute de tout, DEST_NONE (gardé derrière la ligne).
 */
function findHandover(k: Kernel, op: Op, from: Person): void {
  const ctx = k.ctx;
  op.destId = 0;
  op.count = DEST_NONE;
  const service = desk(k);
  const van = service ? service.nearestVan(from.x, from.z, op) : null;
  if (van && service) {
    const d = dist(from, van.x, van.z);
    if (d <= VAN_NEAR) {
      toVehicle(k, op, van, from);
      announce(k, op, van);
      return;
    }
    // rendez-vous derrière la ligne ; si le fourgon ne peut pas y venir sans un long détour, plus près de lui, sur le
    // chemin de l'interpellé au fourgon (aux deux tiers, puis au tiers du trajet)
    let rx = 0;
    let rz = 0;
    let called = false;
    for (let attempt = 0; attempt < 3 && !called; attempt++) {
      if (attempt === 0) rendezVous(k, op, from);
      else alongTo(k, from, van, attempt === 1 ? 0.33 : 0.66);
      rx = k.v2.x;
      rz = k.v2.z;
      called = service.call(van, rx, rz, d <= WALK_MAX ? d : Infinity);
    }
    if (called) {
      const ex = extraOf(op);
      ex.rdvX = rx;
      ex.rdvZ = rz;
      ex.calledAt = k.now;
      // (le premier relevé du trajet restant vient au pas suivant : le pilote automatique ne le connaît pas encore —
      // parti de 0, aucun progrès n'était jamais compté et le fourgon, qui roulait, était arrêté « coincé » au bout de
      // VAN_STALL s à 160 m de la porte ; chaque binôme y conduisait ensuite son interpellé à pied)
      ex.vanBest = Infinity;
      ex.vanBestAt = k.now;
      op.destId = van.id;
      op.count = DEST_VAN_COMING;
      announce(k, op, van);
      return;
    }
    if (d <= WALK_MAX) {
      toVehicle(k, op, van, from);
      announce(k, op, van);
      return;
    }
  }
  // pas de fourgon cellulaire : un véhicule de l'unité ayant une place
  let top = op.root;
  while (top.parent) top = top.parent;
  const ids: number[] = k.pathTmp;
  const n = fleetOf(k, top, ids);
  let best: Vehicle | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = ctx.vehicles.get(ids[i]);
    if (!v || v.def.flying || v.kind === 'moto_bravm' || v.kind === 'fourgon_cellulaire' || (v.state !== 'ok' && v.state !== 'damaged')) continue;
    if (freeSeat(v) < 0) continue;
    const d = dist(from, v.x, v.z);
    if (d < bestD && d < WALK_MAX) {
      bestD = d;
      best = v;
    }
  }
  ids.length = 0;
  if (best) {
    toVehicle(k, op, best, from);
    return;
  }
  const handover = k.handover();
  const pts = handover && Array.isArray(handover.points) ? handover.points : null;
  if (pts) {
    let bd = 500;
    for (let i = 0; i < pts.length; i++) {
      const d = dist(from, pts[i].x, pts[i].z);
      if (d < bd) {
        bd = d;
        op.destX = pts[i].x;
        op.destZ = pts[i].z;
        op.count = DEST_POINT;
      }
    }
  }
}

// ───────────────────────────── déroulé ─────────────────────────────

export function updateArrest(k: Kernel, op: Op): void {
  stepArrest(k, op);
  lineDoor(k, op);
}

function stepArrest(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const root = op.root;
  const now = k.now;
  if (op.stage === STAGE_WATCH) {
    stepWatch(k, op);
    return;
  }
  const target = ctx.people.get(op.targetId);
  let lead = op.lead;
  if (lead && !lead.able && op.second && op.second.able && (op.stage <= 1 || op.stage === STAGE_JOIN || op.stage === STAGE_PICKUP)) {
    // le premier est hors de combat : son équipier prend la suite
    release(lead);
    lead = op.second;
    op.lead = lead;
    op.second = null;
    lead.opRole = ROLE_LEAD;
    lead.goalRun = true;
    if (op.stage <= 1) nextStage(k, op, 0);
  }
  if (!lead || !lead.able) {
    finish(k, op, false, 'Binôme hors de combat.');
    return;
  }
  if (!target || target.dormant || target.injury === 'dead') {
    finish(k, op, false, 'Individu perdu de vue.');
    return;
  }
  const p = lead.p;
  const g = root.groups.length > 0 ? root.groups[0] : null;
  const second = op.second && op.second.able ? op.second : null;
  switch (op.stage) {
    case 0: {
      if (target.custody !== 'free') {
        finish(k, op, false, 'Individu déjà interpellé.');
        return;
      }
      if (now - op.t0 > T.ARREST_OUT_TIME && !op.ordered) {
        finish(k, op, false, 'Individu hors d’atteinte, le binôme rentre.');
        return;
      }
      if (now - op.t0 > T.ARREST_OUT_TIME * 2.5) {
        finish(k, op, false, 'Individu hors d’atteinte.');
        return;
      }
      if (g && g.kind !== F_NONE && dist(target, g.ax, g.az) > T.ARREST_MAX_RANGE + g.width * 0.5 && !op.ordered) {
        finish(k, op, false, 'Individu trop loin de la ligne.');
        return;
      }
      let dx = target.x - p.x;
      let dz = target.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-3) {
        dx /= d;
        dz /= d;
      }
      // le premier va au contact, le second sur le flanc, les boucliers de part et d'autre. Individu qui s'éloigne
      // (il fuit, ou sort d'une nasse) : le premier vise là où il sera dans un instant, pas 0,8 m derrière lui — sinon,
      // freinant à l'approche de son but, il restait à 1,7 m dans le dos d'un fuyard aussi rapide que lui sans jamais
      // l'atteindre (« Individu hors d'atteinte »).
      const away = target.vx * dx + target.vz * dz;
      // Auteur qui a fui devant le binôme : au bout de sa fuite il s'arrête et se fond dans le groupe — le binôme le
      // rejoint alors AU PAS. Deux agents qui courent sur quelqu'un à moins de 24 m, c'est pour lui une charge (foule,
      // behavior.ts) : il repartait à chaque fois, 30 à 60 m plus loin, devant un binôme essoufflé par sa course
      // d'approche qui ne pouvait plus que trotter — poursuite sans fin (« Auteur en fuite, je reste sur lui », jamais
      // interpellé). Tant qu'il fuit ou s'en va d'un bon pas, le binôme court ; arrêté à portée (ou reculant à petits
      // pas), on marche sur lui et on le saisit.
      const ex = extraOf(op);
      if (away > CHASE_FLEE && d < CHASE_CALM + 10) ex.fled = true;
      const calm = ex.fled && away <= CHASE_SLOW && d < CHASE_CALM;
      lead.goalRun = !calm;
      if (second) second.goalRun = !calm;
      if (away > 0.5 && d < 12) setGoal(lead, target.x + target.vx * 0.8, target.z + target.vz * 0.8);
      else setGoal(lead, target.x - dx * 0.8, target.z - dz * 0.8);
      setGoal(second, target.x - dx * 0.5 - dz * 0.9, target.z - dz * 0.5 + dx * 0.9);
      setGoal(op.cover1, p.x - dz * 1.5 + dx * 0.6, p.z + dx * 1.5 + dz * 0.6);
      setGoal(op.cover2, p.x + dz * 1.5 + dx * 0.6, p.z - dx * 1.5 + dz * 0.6);
      if (d <= T.ARREST_REACH && now >= op.nextAt) {
        if (ctx.interactions.startVerb(p, 'maitriser', target.id)) {
          lead.hold = true;
          op.stage = 1;
          op.stageT = now;
          k.emit(ARREST_EVENT, { squadId: op.owner.id, targetId: target.id, byId: p.id, stage: 'saisie' });
        } else {
          op.tries++;
          op.nextAt = now + 0.7;
          if (op.tries > 10) finish(k, op, false, 'Saisie impossible.');
        }
      }
      break;
    }
    case 1: {
      if (busy(k, lead)) {
        lead.hold = true;
        if (second) setGoal(second, target.x + 0.7, target.z + 0.5);
        break;
      }
      lead.hold = false;
      if (target.custody === 'held') {
        nextStage(k, op, 2);
      } else if (target.custody !== 'free') {
        nextStage(k, op, 3);
      } else {
        // l'individu s'est dégagé : nouvelle tentative s'il est resté à portée
        op.count++;
        if (op.count <= 3 && dist(target, p.x, p.z) < 12) {
          op.stage = 0;
          op.stageT = now;
          op.nextAt = now + 2.2;
        } else {
          finish(k, op, false, 'L’individu s’est dégagé et a pris la fuite.');
        }
      }
      break;
    }
    case 2: {
      // menottage (si des menottes restent), sinon escorte sans entrave
      if (busy(k, lead)) {
        lead.hold = true;
        break;
      }
      lead.hold = false;
      if (target.custody === 'cuffed') {
        nextStage(k, op, 3);
      } else if (target.custody === 'free') {
        op.stage = 0;
        op.nextAt = now + 1;
      } else if (now >= op.nextAt) {
        if (ctx.interactions.startVerb(p, 'menotter', target.id)) {
          lead.hold = true;
        } else {
          op.tries++;
          op.nextAt = now + 0.6;
          if (op.tries > 3) nextStage(k, op, 3);
        }
      }
      break;
    }
    case 3: {
      // les boucliers de couverture rentrent ; l'interpellé est pris en escorte (rue barrée : ils rentrent avec le
      // binôme, par la même porte, au lieu de forcer la ligne chacun de son côté)
      if (!root.man.barrage) {
        if (op.cover1) {
          release(op.cover1);
          op.cover1 = null;
        }
        if (op.cover2) {
          release(op.cover2);
          op.cover2 = null;
        }
      }
      if (busy(k, lead)) {
        lead.hold = true;
        break;
      }
      lead.hold = false;
      if (target.custody === 'escorted' && target.heldBy === p.id) {
        findHandover(k, op, p);
        lead.goalRun = false;
        if (second) second.goalRun = false;
        nextStage(k, op, 4);
        k.emit(ARREST_EVENT, { squadId: op.owner.id, targetId: target.id, byId: p.id, stage: 'escorte' });
      } else if (target.custody === 'escorted') {
        // un autre l'a pris en escorte entre-temps (le joueur, un collègue) : il en a la charge
        finish(k, op, true, '');
        return;
      } else if (target.custody === 'free') {
        op.stage = 0;
        op.nextAt = now + 1;
      } else if (now >= op.nextAt) {
        if (ctx.interactions.startVerb(p, 'escorter', target.id)) lead.hold = true;
        else {
          op.tries++;
          op.nextAt = now + 0.6;
          if (op.tries > 8) finish(k, op, false, 'Escorte impossible.');
        }
      }
      break;
    }
    case 4:
      stepHandover(k, op, lead, second, target);
      break;
    case 5:
      finishArrest(k, op, target, true);
      break;
    case STAGE_JOIN:
      stepJoin(k, op, lead, second, target);
      break;
    case STAGE_PICKUP:
      stepPickup(k, op, lead, second, target);
      break;
    default:
      finish(k, op, false, '');
      break;
  }
}

/** Étape 4 : l'interpellé est conduit (ou attend avec le binôme) jusqu'à sa destination, puis remis. */
function stepHandover(k: Kernel, op: Op, lead: Agent, second: Agent | null, target: Person): void {
  const ctx = k.ctx;
  const now = k.now;
  const p = lead.p;
  const g = op.root.groups.length > 0 ? op.root.groups[0] : null;
  if (target.custody === 'free') {
    // évadé pendant l'escorte
    if (dist(target, p.x, p.z) < 10 && extraOf(op).kind === 'arrest') {
      lead.goalRun = true;
      op.t0 = now;
      nextStage(k, op, 0);
    } else finish(k, op, false, 'L’interpellé s’est échappé.');
    return;
  }
  if (target.custody === 'in_vehicle' || target.custody === 'handed_over') {
    nextStage(k, op, 5);
    return;
  }
  if (target.custody !== 'escorted' || target.heldBy !== p.id) {
    // lâché (agent bousculé, interpellé repris par un autre) : il est rejoint, ou un autre en a la charge
    if (target.custody === 'cuffed' || target.custody === 'held') nextStage(k, op, STAGE_JOIN);
    else finish(k, op, true, '');
    return;
  }
  let gx = op.destX;
  let gz = op.destZ;
  if (op.count === DEST_NONE) {
    // ni véhicule ni point de regroupement : l'interpellé est gardé derrière la ligne
    if (g && g.kind !== F_NONE) {
      gx = g.ax - Math.sin(g.ah) * (T.RANK4_BACK + 4);
      gz = g.az - Math.cos(g.ah) * (T.RANK4_BACK + 4);
    } else {
      gx = p.x;
      gz = p.z;
    }
  } else if (op.count === DEST_VEHICLE) {
    const v = ctx.vehicles.get(op.destId);
    const service = desk(k);
    if (!v || (v.kind === 'fourgon_cellulaire' && service && !service.receives(v, op))) {
      // le véhicule est parti (transfert, ordre du joueur) ou plein : une autre destination
      findHandover(k, op, p);
      return;
    }
    // le point d'approche est fixé une fois pour toutes tant que le véhicule ne bouge pas
    if ((op.destX - v.x) * (op.destX - v.x) + (op.destZ - v.z) * (op.destZ - v.z) > 36) {
      approachPoint(k, v, p);
      op.destX = k.v2.x;
      op.destZ = k.v2.z;
    }
    gx = op.destX;
    gz = op.destZ;
  } else if (op.count === DEST_VAN_COMING) {
    const ex = extraOf(op);
    const v = ctx.vehicles.get(op.destId);
    const service = desk(k);
    if (!v || !service || !service.receives(v, op) || now - ex.calledAt > VAN_WAIT_MAX) {
      // le fourgon ne vient pas (pris par un autre ordre, plein, bloqué) : on en cherche un autre
      findHandover(k, op, p);
      return;
    }
    const left = Math.hypot(v.x - ex.rdvX, v.z - ex.rdvZ);
    const route = service.remaining(v, ex.rdvX, ex.rdvZ);
    if (route < ex.vanBest - VAN_PROGRESS) {
      ex.vanBest = route;
      ex.vanBestAt = now;
    }
    // (un fourgon qui sort de sa file — garé pare-chocs contre pare-chocs derrière les fourgons de la compagnie, il
    // déboîte, recule, repart — a le délai long : retenu au bout de VAN_STALL s alors qu'il se dégageait, il laissait
    // le binôme conduire l'interpellé à pied sur 130 m ; mission cdt-01 : à bord en 144 s, 87 s quand on le laisse sortir)
    const stall = dist(p, v.x, v.z) > VAN_STALL_NEAR || service.pullingOut(v) ? VAN_STALL_FAR : VAN_STALL;
    const stalled = now - ex.vanBestAt > stall && left >= VAN_AT_RDV;
    if (stalled && dist(p, v.x, v.z) > WALK_MAX) {
      findHandover(k, op, p);
      return;
    }
    if (stalled || ((left < VAN_AT_RDV || dist(p, v.x, v.z) < VAN_CLOSE) && Math.abs(v.speed) < 0.5)) {
      // le fourgon est là (ou il ne passe pas : on y va à pied) : il s'arrête où il est, le binôme y va
      service.hold(v);
      toVehicle(k, op, v, p);
      gx = op.destX;
      gz = op.destZ;
    } else {
      // le binôme va au-devant du fourgon avec l'interpellé (ils se rejoignent à mi-chemin), jusqu'à quelques mètres de
      // lui tant qu'il roule — au plus jusqu'au rendez-vous, au bord de la chaussée (jamais au milieu de la voie)
      const dv = dist(p, v.x, v.z);
      const dr = dist(p, ex.rdvX, ex.rdvZ);
      if (dv > MEET_GAP && dv < dr + 15) {
        gx = p.x + ((v.x - p.x) / dv) * (dv - MEET_GAP);
        gz = p.z + ((v.z - p.z) / dv) * (dv - MEET_GAP);
      } else if (dr > 4) {
        gx = ex.rdvX + ((p.x - ex.rdvX) / dr) * 4;
        gz = ex.rdvZ + ((p.z - ex.rdvZ) / dr) * 4;
      } else {
        gx = p.x;
        gz = p.z;
      }
    }
  }
  setGoal(lead, gx, gz);
  if (second) setGoal(second, p.x - Math.sin(p.heading) * 1.1, p.z - Math.cos(p.heading) * 1.1);
  // (rue barrée) les boucliers suivent le binôme jusque derrière la ligne
  setGoal(op.cover1, p.x - Math.sin(p.heading) * 2.2, p.z - Math.cos(p.heading) * 2.2);
  setGoal(op.cover2, p.x - Math.sin(p.heading) * 3.2, p.z - Math.cos(p.heading) * 3.2);
  const d = dist(p, gx, gz);
  if (busy(k, lead)) {
    lead.hold = true;
    return;
  }
  if (op.count !== DEST_VAN_COMING && d < 1.4 && now >= op.nextAt) {
    if (op.count === DEST_NONE) {
      // gardé derrière la ligne : l'agent le tient en escorte (il n'est pas laissé seul) ; le ramassage
      // (arrest-service.ts) l'emmène au fourgon dès qu'il y en a un
      finishArrest(k, op, target, false);
      return;
    }
    // le fourgon cellulaire est désigné à la remise (le module de droit prendrait sinon le véhicule le plus proche, un
    // fourgon de troupe garé à côté) ; au bout de trois essais, n'importe quel véhicule à portée
    const v = op.count === DEST_VEHICLE ? ctx.vehicles.get(op.destId) : undefined;
    const aim = v && v.kind === 'fourgon_cellulaire' && op.tries < 3 ? v.id : target.id;
    if (ctx.interactions.startVerb(p, 'remettre', aim)) {
      lead.hold = true;
    } else {
      op.tries++;
      op.nextAt = now + 1;
      if (op.tries > 6) {
        findHandover(k, op, p);
        op.tries = 0;
        if (op.count === DEST_NONE) op.nextAt = now + 0.5;
      }
    }
  }
  const limit = op.count === DEST_VAN_COMING ? HANDOVER_WAIT_MAX : HANDOVER_MAX;
  if (now - op.stageT > limit) {
    // remise impossible : l'agent garde l'interpellé (le ramassage reprendra quand un fourgon pourra venir)
    finishArrest(k, op, target, false);
  }
}

/** STAGE_JOIN : le binôme rejoint l'interpellé, le menotte s'il ne l'est pas, le prend en escorte. */
function stepJoin(k: Kernel, op: Op, lead: Agent, second: Agent | null, target: Person): void {
  const ctx = k.ctx;
  const now = k.now;
  const p = lead.p;
  const c = target.custody;
  if (c === 'free' || c === 'in_vehicle' || c === 'handed_over') {
    finish(k, op, c !== 'free', c === 'free' ? 'L’interpellé s’est échappé.' : '');
    return;
  }
  if (busy(k, lead)) {
    lead.hold = true;
    return;
  }
  lead.hold = false;
  if (c === 'escorted' && target.heldBy === p.id) {
    // pris en escorte (ci-dessous) : la remise commence
    findHandover(k, op, p);
    lead.goalRun = false;
    nextStage(k, op, 4);
    k.emit(ARREST_EVENT, { squadId: op.owner.id, targetId: target.id, byId: p.id, stage: 'escorte' });
    return;
  }
  let dx = target.x - p.x;
  let dz = target.z - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-3) {
    dx /= d;
    dz /= d;
  }
  setGoal(lead, target.x - dx * 0.8, target.z - dz * 0.8);
  setGoal(second, target.x - dx * 0.5 - dz * 0.9, target.z - dz * 0.5 + dx * 0.9);
  lead.goalRun = d > 8;
  // (à portée de main : les gestes du droit portent jusqu'à 2,7 m ; un agent arrêté à 1,8 m par un collègue ou un
  // véhicule n'attend pas indéfiniment le dernier pas)
  if (d <= T.ARREST_REACH + 0.8) {
    if (c === 'escorted') {
      const holder = target.heldBy !== 0 ? ctx.people.get(target.heldBy) : undefined;
      // escorté sans menottes par le joueur : il le fait asseoir (maintenu au sol), le binôme le menotte
      const ex = extraOf(op);
      if (holder && holder.isPlayer && !ex.seatAsked && target.upper !== 'cuffed') ex.seatAsked = ctx.interactions.startVerb(holder, 'escorter', target.id);
    } else if (c === 'held') {
      nextStage(k, op, 2);
      return;
    } else if (c === 'cuffed' && now >= op.nextAt) {
      // menotté : le binôme le prend en escorte d'ici même (l'étape 3 ne le ramènerait pas près de lui s'il a été
      // écarté par un véhicule ou un collègue au dernier pas)
      if (ctx.interactions.startVerb(p, 'escorter', target.id)) lead.hold = true;
      else op.nextAt = now + 0.6;
    }
  }
  if (now - op.stageT > JOIN_MAX) finish(k, op, false, 'Interpellé non rejoint.');
}

/** STAGE_PICKUP : l'interpellé remis à un point attend, assis ; le fourgon vient près de lui, le binôme l'y fait monter. */
function stepPickup(k: Kernel, op: Op, lead: Agent, second: Agent | null, target: Person): void {
  const ctx = k.ctx;
  const now = k.now;
  const p = lead.p;
  if (target.custody !== 'handed_over') {
    finish(k, op, target.custody === 'in_vehicle', '');
    return;
  }
  const service = desk(k);
  const v = ctx.vehicles.get(op.destId);
  if (!v || !service || !service.receives(v, op) || now - op.stageT > PICKUP_MAX) {
    finish(k, op, false, '');
    return;
  }
  const d = dist(target, p.x, p.z);
  setGoal(lead, target.x + 0.9, target.z);
  setGoal(second, target.x - 0.9, target.z);
  lead.goalRun = d > 8;
  if (d > 1.8 || Math.abs(v.speed) > 0.3 || dist(target, v.x, v.z) > PICKUP_REACH) return;
  const seat = freeSeat(v);
  if (seat < 0 || !ctx.vehicles.enter(target, v, seat)) return;
  target.custody = 'in_vehicle';
  announce(k, op, v);
  k.emit(ARREST_EVENT, { squadId: op.owner.id, targetId: target.id, byId: p.id, stage: 'remise' });
  finish(k, op, true, '');
}

/** « Aller constater » : observation à distance, interpellation au premier fait constaté. */
function stepWatch(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const now = k.now;
  const lead = op.lead;
  if (!lead || !lead.able) {
    finish(k, op, false, 'Binôme hors de combat.');
    return;
  }
  // l'ordre a été remplacé (nouvelle tâche, ordre de formation) : la surveillance cesse, sans compte rendu
  const owner = op.owner;
  if (op.taskAt >= 0 && (!owner.task || owner.task.issuedAt !== op.taskAt || (owner.storeOrder !== null && owner.storeOrder.issuedAt > op.taskAt))) {
    finish(k, op, false, '');
    return;
  }
  const ex = extraOf(op);
  const p = lead.p;
  let wx = op.x;
  let wz = op.z;
  const watched = ex.watchId !== 0 ? ctx.people.get(ex.watchId) : undefined;
  const followed = watched !== undefined && !watched.dormant && watched.custody === 'free' && watched.injury !== 'dead' && watched.vehicleId === 0;
  if (followed) {
    wx = watched.x;
    wz = watched.z;
  }
  if (now >= op.nextAt) {
    op.nextAt = now + 0.5;
    const offender = watchOffender(k, followed ? watched : null, wx, wz);
    if (offender) {
      // fait constaté : interpellation, comme un ordre d'interpeller l'auteur désigné
      op.targetId = offender.id;
      op.x = offender.x;
      op.z = offender.z;
      op.t0 = now;
      lead.goalRun = true;
      takeCover(op, p.x, p.z, null);
      openDoor(k, lead, offender.x, offender.z, 5);
      ex.kind = 'arrest';
      nextStage(k, op, 0);
      k.emit(ARREST_EVENT, { squadId: owner.id, targetId: offender.id, byId: p.id, stage: 'sortie' });
      return;
    }
  }
  // poste d'observation : à WATCH_DISTANCE m du point, du côté d'où vient le binôme
  const d = dist(p, wx, wz);
  if (d > WATCH_DISTANCE + 1.5 || d < WATCH_DISTANCE - 4) {
    const ux = d > 1e-3 ? (p.x - wx) / d : 0;
    const uz = d > 1e-3 ? (p.z - wz) / d : 1;
    setGoal(lead, wx + ux * WATCH_DISTANCE, wz + uz * WATCH_DISTANCE);
    lead.goalRun = d > 30;
    const second = op.second && op.second.able ? op.second : null;
    setGoal(second, wx + ux * WATCH_DISTANCE - uz * 1.4, wz + uz * WATCH_DISTANCE + ux * 1.4);
  }
  if (now - op.stageT > WATCH_MAX) finish(k, op, false, WATCH_NOTHING);
}

/** Auteur d'un fait constaté pendant la surveillance : la personne désignée d'abord, sinon la plus proche du point. */
function watchOffender(k: Kernel, watched: Person | null, x: number, z: number): Person | null {
  const ctx = k.ctx;
  if (watched && ctx.law.canArrest(watched)) return watched;
  const n = ctx.people.queryRadius(x, z, WATCH_SCAN, k.people);
  let best: Person | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = k.people[i];
    if (q.faction === 'police' || q.custody !== 'free' || q.vehicleId !== 0 || q.dormant) continue;
    if (!recentFlagrant(q, k.now, WATCH_FRESH) || !ctx.law.canArrest(q)) continue;
    const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function finishArrest(k: Kernel, op: Op, target: Person, handed: boolean): void {
  const owner = op.owner;
  const root = op.root;
  const own = extraOf(op).kind === 'arrest';
  // (« Confier », ramassage : l'interpellation n'est pas de cette unité, seule la remise l'est)
  if (own) {
    root.arrests++;
    if (owner !== root) owner.arrests++;
  }
  // la remise elle-même est annoncée par le module de droit (heure, qualification) ; l'unité ne rend compte
  // à la radio que si l'interpellé reste gardé derrière la ligne, faute de véhicule ou de point de regroupement
  if (!handed && own) {
    const o = k.ctx.law.worstOffense(target);
    const fact = o ? (o.type === 'jet_projectile' ? 'jet de projectile sur agents' : o.type === 'violence_agent' ? 'violences sur agent'
      : o.type === 'incendie' ? 'incendie volontaire' : o.type === 'degradation' ? 'dégradations' : o.type === 'pillage' ? 'vol en réunion' : 'fait constaté') : 'fait constaté';
    report(k, owner, 'UN interpellé pour ' + fact + (o && o.filmed ? ', fait filmé' : '') + '. Gardé derrière la ligne, demande un véhicule pour la remise');
  }
  if (own && root.squad.morale < 1) root.squad.morale = Math.min(1, root.squad.morale + 0.03);
  k.emit(ARREST_EVENT, { squadId: owner.id, targetId: target.id, byId: op.lead ? op.lead.p.id : 0, stage: handed ? 'remise' : 'garde' });
  finish(k, op, true, '');
}
