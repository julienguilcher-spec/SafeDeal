/* =====================================================================================
 * FORCES DE L'ORDRE — opérations détachées : quelques agents sortent du rang pour une tâche,
 * par les mêmes interactions que le joueur (ctx.interactions.startVerb), puis reprennent leur place.
 *
 *   interpellation  le binôme sort par une « porte » ouverte dans la ligne, couvert par deux
 *                   boucliers : maitriser → menotter → escorter → remettre (véhicule de l'unité,
 *                   fourgon cellulaire, ou point de regroupement 'law.handover') ; bible §H.1 ;
 *   secours         un agent va chercher le blessé (traîné sur une courte distance, porté au-delà),
 *                   deux boucliers couvrent ; déposé derrière la ligne ; bible §G.3 ;
 *   extinction      le porte-extincteur se place à 2,4 m du foyer et arrose, couvert par deux boucliers ;
 *   ravitaillement  aller prendre au fourgon de quoi compléter sa dotation (réserve décomptée) ;
 *   dégagement      jusqu'à six agents démontent une barricade à la main (verbe « degager »).
 * ===================================================================================== */

import type { EntityId, ItemId, Person, Prop, SquadOrder, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueApi } from '@/core/extensions';
import { ARREST_EVENT, ORDER_REFUSED_EVENT } from './api';
import type { VehicleReserve } from './api';
import type { Agent, Op, Unit } from './brain';
import {
  ACT_NONE, CLS_FRONT, CLS_SECOND, F_LINE, F_NONE, F_TORTUE, OP_ARREST, OP_CLEAR, OP_EXTINGUISH, OP_GAS, OP_RESCUE, OP_RESUPPLY,
  ROLE_COVER, ROLE_LEAD, ROLE_SECOND, createOp,
} from './brain';
import { beginAct, forceCap, gasVolley, recentFlagrant } from './force';
import type { Kernel } from './kernel';
import { done, report } from './mcore';
import { designate, negative, sectorOf, spell } from './radio';
import { fullLoad } from './roster';
import { fleetOf } from './tree';
import * as T from './tuning';

// ───────────────────────────── choix des agents ─────────────────────────────

function isUnder(a: Agent, unit: Unit | null): boolean {
  if (!unit) return true;
  for (let x = a.home, guard = 0; x && guard < 16; x = x.parent, guard++) if (x === unit) return true;
  return false;
}

function free(a: Agent): boolean {
  return a.able && a.op === null && a.act === ACT_NONE && !a.p.isPlayer && a.boardId === 0 && a.p.carrying === 0;
}

/** Agent libre le plus proche de (x, z) parmi ceux du poste donné (`poste` null : n'importe quel équipier du second rang). */
function nearest(root: Unit, within: Unit | null, x: number, z: number, accept: (a: Agent) => boolean, skip: Agent | null): Agent | null {
  let best: Agent | null = null;
  let bestD = Infinity;
  const agents = root.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a === skip || !free(a) || !accept(a) || !isUnder(a, within)) continue;
    const d = (a.p.x - x) * (a.p.x - x) + (a.p.z - z) * (a.p.z - z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

const isCatcher = (a: Agent): boolean => a.p.poste === 'interpellation' || a.p.poste === 'passager_moto';
const isHelper = (a: Agent): boolean =>
  a.baseCls === CLS_SECOND && a.p.poste !== 'lanceur' && a.p.poste !== 'lbd' && a.p.poste !== 'extincteur' && a.p.poste !== 'chef_groupe';
const isShield = (a: Agent): boolean => a.baseCls === CLS_FRONT && a.shield;
const anyTrooper = (a: Agent): boolean => a.baseCls === CLS_FRONT || a.baseCls === CLS_SECOND;

function engage(op: Op, a: Agent | null, role: number): void {
  if (!a) return;
  a.op = op;
  a.opRole = role;
  a.hold = false;
  a.goalRun = role !== ROLE_COVER;
  a.goalX = a.p.x;
  a.goalZ = a.p.z;
  a.pathN = 0;
}

function release(a: Agent | null): void {
  if (!a) return;
  a.op = null;
  a.opRole = 0;
  a.hold = false;
  a.goalRun = false;
  a.pathN = 0;
}

function releaseAll(op: Op): void {
  release(op.lead);
  release(op.second);
  release(op.cover1);
  release(op.cover2);
  for (let i = 0; i < op.extra.length; i++) release(op.extra[i]);
}

function countFrontAble(root: Unit): number {
  let n = 0;
  for (let i = 0; i < root.agents.length; i++) if (root.agents[i].able && isShield(root.agents[i])) n++;
  return n;
}

/** Deux boucliers de couverture, pris au plus près, si la ligne en garde assez pour tenir. */
function takeCover(op: Op, x: number, z: number, within: Unit | null): void {
  const root = op.root;
  if (countFrontAble(root) < 5) return;
  op.cover1 = nearest(root, within, x, z, isShield, null) ?? nearest(root, null, x, z, isShield, null);
  engage(op, op.cover1, ROLE_COVER);
  op.cover2 = nearest(root, within, x, z, isShield, op.cover1) ?? nearest(root, null, x, z, isShield, op.cover1);
  engage(op, op.cover2, ROLE_COVER);
}

/** Ouvre une porte dans la ligne à l'aplomb du point visé (le binôme sort entre deux boucliers). */
function openDoor(k: Kernel, a: Agent, x: number, z: number, seconds: number): void {
  const g = a.group;
  if (!g || (g.kind !== F_LINE && g.kind !== F_TORTUE) || g.front.length < 3) return;
  const lat = (x - g.ax) * -Math.cos(g.ah) + (z - g.az) * Math.sin(g.ah);
  const half = g.width * 0.5 - 0.6;
  g.doorX = lat < -half ? -half : lat > half ? half : lat;
  g.doorW = T.DOOR_WIDTH;
  g.doorUntil = k.now + seconds;
  g.dirty = true;
}

function setGoal(a: Agent | null, x: number, z: number): void {
  if (!a) return;
  a.goalX = x;
  a.goalZ = z;
  a.hold = false;
}

function finish(k: Kernel, op: Op, ok: boolean, reason: string): void {
  if (op.done) return;
  op.done = true;
  op.ok = ok;
  op.reason = reason;
  releaseAll(op);
  const lead = op.lead;
  if (lead && k.ctx.interactions.current(lead.p)) k.ctx.interactions.cancel(lead.p);
}

function busy(k: Kernel, a: Agent): boolean {
  return k.ctx.interactions.current(a.p) !== null;
}

function nextStage(k: Kernel, op: Op, stage: number): void {
  op.stage = stage;
  op.stageT = k.now;
  op.tries = 0;
  op.nextAt = 0;
}

function dist(a: Person, x: number, z: number): number {
  return Math.sqrt((a.x - x) * (a.x - x) + (a.z - z) * (a.z - z));
}

// ───────────────────────────── interpellation ─────────────────────────────

/** Lance l'interpellation d'une personne par le binôme le plus proche. null si personne n'est disponible. */
export function createArrest(k: Kernel, root: Unit, owner: Unit, target: Person, ordered: boolean): Op | null {
  const within = ordered ? owner : null;
  let lead = nearest(root, within, target.x, target.z, isCatcher, null);
  if (!lead) lead = nearest(root, within, target.x, target.z, isHelper, null);
  if (!lead && ordered) lead = nearest(root, within, target.x, target.z, anyTrooper, null);
  if (!lead) return null;
  const op = createOp(OP_ARREST, root, owner, k.now);
  op.ordered = ordered;
  op.targetId = target.id;
  op.x = target.x;
  op.z = target.z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  op.second = nearest(root, within, target.x, target.z, isCatcher, lead) ?? nearest(root, within, target.x, target.z, isHelper, lead);
  engage(op, op.second, ROLE_SECOND);
  takeCover(op, lead.p.x, lead.p.z, null);
  openDoor(k, lead, target.x, target.z, 5);
  root.ops.push(op);
  k.emit(ARREST_EVENT, { squadId: owner.id, targetId: target.id, byId: lead.p.id, stage: 'sortie' });
  return op;
}

/** Destination de la remise : fourgon cellulaire ou fourgon de l'unité ayant une place, sinon point de regroupement. */
function findHandover(k: Kernel, op: Op, from: Person): void {
  const ctx = k.ctx;
  let top = op.root;
  while (top.parent) top = top.parent;
  const ids: number[] = k.pathTmp;
  const n = fleetOf(k, top, ids);
  let best: Vehicle | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = ctx.vehicles.get(ids[i]);
    if (!v || v.def.flying || v.kind === 'moto_bravm' || (v.state !== 'ok' && v.state !== 'damaged')) continue;
    let seat = false;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') seat = true;
    if (!seat) continue;
    const d = dist(from, v.x, v.z) - (v.kind === 'fourgon_cellulaire' ? 60 : 0);
    if (d < bestD && d < 400) {
      bestD = d;
      best = v;
    }
  }
  ids.length = 0;
  op.destId = 0;
  op.count = 0;
  if (best) {
    op.destId = best.id;
    op.count = 1;
    // on se présente à l'arrière du véhicule
    const reach = best.def.length * 0.5 + 1.5;
    op.destX = best.x - Math.sin(best.heading) * reach;
    op.destZ = best.z - Math.cos(best.heading) * reach;
    return;
  }
  const service = k.handover();
  const pts = service && Array.isArray(service.points) ? service.points : null;
  if (pts) {
    let bd = 500;
    for (let i = 0; i < pts.length; i++) {
      const d = dist(from, pts[i].x, pts[i].z);
      if (d < bd) {
        bd = d;
        op.destX = pts[i].x;
        op.destZ = pts[i].z;
        op.count = 2;
      }
    }
  }
}

function updateArrest(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const root = op.root;
  const now = k.now;
  const target = ctx.people.get(op.targetId);
  let lead = op.lead;
  if (lead && !lead.able && op.second && op.second.able && op.stage <= 1) {
    // le premier est hors de combat : son équipier prend la suite
    release(lead);
    lead = op.second;
    op.lead = lead;
    op.second = null;
    lead.opRole = ROLE_LEAD;
    lead.goalRun = true;
    nextStage(k, op, 0);
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
      // le premier va au contact, le second sur le flanc, les boucliers de part et d'autre
      setGoal(lead, target.x - dx * 0.8, target.z - dz * 0.8);
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
          op.count = op.count;
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
      // les boucliers de couverture rentrent ; l'interpellé est pris en escorte
      if (op.cover1) {
        release(op.cover1);
        op.cover1 = null;
      }
      if (op.cover2) {
        release(op.cover2);
        op.cover2 = null;
      }
      if (busy(k, lead)) {
        lead.hold = true;
        break;
      }
      lead.hold = false;
      if (target.custody === 'escorted') {
        findHandover(k, op, p);
        lead.goalRun = false;
        if (second) second.goalRun = false;
        nextStage(k, op, 4);
        k.emit(ARREST_EVENT, { squadId: op.owner.id, targetId: target.id, byId: p.id, stage: 'escorte' });
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
    case 4: {
      if (target.custody === 'free') {
        // évadé pendant l'escorte
        if (dist(target, p.x, p.z) < 10) {
          lead.goalRun = true;
          nextStage(k, op, 0);
        } else finish(k, op, false, 'L’interpellé s’est échappé.');
        return;
      }
      if (target.custody === 'in_vehicle' || target.custody === 'handed_over') {
        nextStage(k, op, 5);
        break;
      }
      let gx = op.destX;
      let gz = op.destZ;
      if (op.count === 0) {
        // ni véhicule ni point de regroupement : l'interpellé est gardé derrière la ligne
        if (g && g.kind !== F_NONE) {
          gx = g.ax - Math.sin(g.ah) * (T.RANK4_BACK + 4);
          gz = g.az - Math.cos(g.ah) * (T.RANK4_BACK + 4);
        } else {
          gx = p.x;
          gz = p.z;
        }
      } else if (op.count === 1) {
        const v = ctx.vehicles.get(op.destId);
        if (!v) {
          findHandover(k, op, p);
          break;
        }
        const reach = v.def.length * 0.5 + 1.5;
        gx = op.destX = v.x - Math.sin(v.heading) * reach;
        gz = op.destZ = v.z - Math.cos(v.heading) * reach;
      }
      setGoal(lead, gx, gz);
      if (second) setGoal(second, p.x - Math.sin(p.heading) * 1.1, p.z - Math.cos(p.heading) * 1.1);
      const d = dist(p, gx, gz);
      if (busy(k, lead)) {
        lead.hold = true;
        break;
      }
      if (d < 1.4 && now >= op.nextAt) {
        if (op.count === 0) {
          // faire asseoir l'interpellé et le garder
          ctx.interactions.startVerb(p, 'escorter', target.id);
          finishArrest(k, op, target, false);
          return;
        }
        if (ctx.interactions.startVerb(p, 'remettre', target.id)) {
          lead.hold = true;
        } else {
          op.tries++;
          op.nextAt = now + 1;
          if (op.tries > 6) {
            findHandover(k, op, p);
            op.tries = 0;
            if (op.count === 0) op.nextAt = now + 0.5;
          }
        }
      }
      if (now - op.stageT > 240) finish(k, op, false, 'Remise impossible.');
      break;
    }
    case 5:
      finishArrest(k, op, target, true);
      break;
    default:
      finish(k, op, false, '');
      break;
  }
}

function finishArrest(k: Kernel, op: Op, target: Person, handed: boolean): void {
  const owner = op.owner;
  const root = op.root;
  root.arrests++;
  if (owner !== root) owner.arrests++;
  const o = k.ctx.law.worstOffense(target);
  const fact = o ? (o.type === 'jet_projectile' ? 'jet de projectile sur agents' : o.type === 'violence_agent' ? 'violences sur agent'
    : o.type === 'incendie' ? 'incendie volontaire' : o.type === 'degradation' ? 'dégradations' : o.type === 'pillage' ? 'vol en réunion' : 'fait constaté') : 'fait constaté';
  const body = 'UN interpellé pour ' + fact + (o && o.filmed ? ', fait filmé' : '') + (handed
    ? (op.count === 1 ? '. Remis au véhicule' : '. Remis à l’officier de police judiciaire au point de regroupement')
    : '. Gardé derrière la ligne, demande un véhicule pour la remise');
  report(k, owner, body);
  if (root.squad.morale < 1) root.squad.morale = Math.min(1, root.squad.morale + 0.03);
  k.emit(ARREST_EVENT, { squadId: owner.id, targetId: target.id, byId: op.lead ? op.lead.p.id : 0, stage: handed ? 'remise' : 'garde' });
  finish(k, op, true, '');
}

// ───────────────────────────── secours ─────────────────────────────

function carriable(victim: Person): boolean {
  return victim.posture === 'down' && victim.heldBy === 0 && victim.vehicleId === 0 && !victim.dormant
    && victim.custody !== 'in_vehicle' && victim.custody !== 'handed_over';
}

export function createRescue(k: Kernel, root: Unit, owner: Unit, victim: Person, ordered: boolean): Op | null {
  const within = ordered ? owner : null;
  let lead = nearest(root, within, victim.x, victim.z, isHelper, null);
  if (!lead) lead = nearest(root, within, victim.x, victim.z, isCatcher, null);
  if (!lead) lead = nearest(root, null, victim.x, victim.z, anyTrooper, null);
  if (!lead) return null;
  const op = createOp(OP_RESCUE, root, owner, k.now);
  op.ordered = ordered;
  op.targetId = victim.id;
  op.x = victim.x;
  op.z = victim.z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  takeCover(op, victim.x, victim.z, null);
  openDoor(k, lead, victim.x, victim.z, 6);
  // point de dépôt : derrière la ligne
  const g = root.groups.length > 0 ? root.groups[0] : null;
  if (g && g.kind !== F_NONE) {
    const lat = Math.max(-g.width * 0.4, Math.min(g.width * 0.4, (victim.x - g.ax) * -Math.cos(g.ah) + (victim.z - g.az) * Math.sin(g.ah)));
    op.destX = g.ax - Math.cos(g.ah) * lat - Math.sin(g.ah) * T.RESCUE_DROP_BACK;
    op.destZ = g.az + Math.sin(g.ah) * lat - Math.cos(g.ah) * T.RESCUE_DROP_BACK;
  } else {
    const s = root.sense;
    let dx = victim.x - s.cx;
    let dz = victim.z - s.cz;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d;
    dz /= d;
    op.destX = victim.x + dx * 12;
    op.destZ = victim.z + dz * 12;
  }
  root.ops.push(op);
  return op;
}

function updateRescue(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const now = k.now;
  const victim = ctx.people.get(op.targetId);
  const lead = op.lead;
  if (!lead || !lead.able) {
    finish(k, op, false, 'Agent de secours hors de combat.');
    return;
  }
  if (!victim) {
    finish(k, op, false, 'Blessé introuvable.');
    return;
  }
  if (now - op.t0 > T.RESCUE_TIMEOUT) {
    finish(k, op, false, 'Extraction interrompue.');
    return;
  }
  const p = lead.p;
  const s = op.root.sense;
  // direction de la menace vue du blessé : les boucliers s'interposent
  let tx = s.cx - victim.x;
  let tz = s.cz - victim.z;
  const tl = Math.sqrt(tx * tx + tz * tz) || 1;
  tx /= tl;
  tz /= tl;
  const bx = op.stage >= 2 ? p.x : victim.x;
  const bz = op.stage >= 2 ? p.z : victim.z;
  setGoal(op.cover1, bx + tx * 1.4 - tz * 0.6, bz + tz * 1.4 + tx * 0.6);
  setGoal(op.cover2, bx + tx * 1.4 + tz * 0.6, bz + tz * 1.4 - tx * 0.6);
  switch (op.stage) {
    case 0: {
      if (victim.posture !== 'down' && victim.heldBy === 0) {
        finish(k, op, true, 'Le blessé s’est relevé.');
        return;
      }
      if (victim.heldBy !== 0 && victim.heldBy !== p.id) {
        finish(k, op, true, 'Blessé déjà pris en charge.');
        return;
      }
      let dx = victim.x - p.x;
      let dz = victim.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= d;
      dz /= d;
      setGoal(lead, victim.x - dx * 0.9, victim.z - dz * 0.9);
      if (d <= 1.4 && now >= op.nextAt && carriable(victim)) {
        // traîné sur une courte distance (0,6 m/s), porté sur l'épaule au-delà (1,2 m/s)
        const far = dist(victim, op.destX, op.destZ) > 14;
        if (ctx.interactions.startVerb(p, far ? 'porter' : 'trainer', victim.id) || ctx.interactions.startVerb(p, far ? 'trainer' : 'porter', victim.id)) {
          lead.hold = true;
          nextStage(k, op, 1);
        } else {
          op.tries++;
          op.nextAt = now + 0.8;
          if (op.tries > 8) finish(k, op, false, 'Impossible de dégager le blessé.');
        }
      }
      break;
    }
    case 1:
      if (busy(k, lead)) {
        lead.hold = true;
        break;
      }
      lead.hold = false;
      if (p.carrying === victim.id) {
        lead.goalRun = false;
        nextStage(k, op, 2);
      } else {
        op.stage = 0;
        op.nextAt = now + 0.5;
      }
      break;
    case 2: {
      if (p.carrying !== victim.id) {
        op.stage = 0;
        lead.goalRun = true;
        break;
      }
      setGoal(lead, op.destX, op.destZ);
      if (dist(p, op.destX, op.destZ) < 1.3) {
        lead.hold = true;
        if (!ctx.interactions.startVerb(p, 'deposer', victim.id)) {
          op.tries++;
          if (op.tries > 20) finish(k, op, false, 'Dépôt impossible.');
          break;
        }
        nextStage(k, op, 3);
      }
      break;
    }
    case 3:
      if (busy(k, lead)) {
        lead.hold = true;
        break;
      }
      if (p.carrying === victim.id) {
        op.stage = 2;
        break;
      }
      rescued(k, op, victim);
      break;
    default:
      finish(k, op, false, '');
      break;
  }
}

function rescued(k: Kernel, op: Op, victim: Person): void {
  const ctx = k.ctx;
  const owner = op.owner;
  const agent = victim.faction === 'police';
  const sec = sectorOf(k, victim.x, victim.z);
  k.say(owner, 'CENTRAL ICI ' + owner.squad.name.toUpperCase() + '. URGENT. UN ' + (agent ? 'agent' : 'manifestant') + ' blessé évacué derrière la ligne'
    + (sec !== '' ? ', ' + sec : '') + '. Demande SANTÉ sur place, je sécurise. PARLEZ.', 2, 'commandement');
  const rescue = ctx.service<RescueApi>(EXT.rescue);
  const incidents = ctx.service<IncidentsApi>(EXT.incidents);
  let incidentId = 0;
  if (incidents) {
    for (let i = 0; i < incidents.list.length; i++) {
      const inc = incidents.list[i];
      if (inc.targetKind === 'person' && inc.targetId === victim.id && inc.state !== 'resolu' && inc.state !== 'echoue') incidentId = inc.id;
    }
  }
  if (rescue && (victim.injury === 'serious' || victim.injury === 'critical')) {
    rescue.request('samu', victim.x, victim.z, op.lead ? op.lead.p.id : 0, incidentId || undefined);
  } else if (incidents && incidentId !== 0) {
    incidents.close(incidentId, true, op.lead ? op.lead.p.id : 0);
  }
  // secouriste de l'unité : premiers gestes, s'il y en a un de disponible
  const medic = nearest(op.root, null, victim.x, victim.z, (a) => k.count(a.p, 'trousse_secours') > 0, op.lead);
  if (medic && dist(medic.p, victim.x, victim.z) < 12) ctx.interactions.startVerb(medic.p, 'soigner', victim.id);
  ctx.director.addTension(-0.04, victim.x, victim.z, 'Blessé secouru par les forces');
  finish(k, op, true, '');
}

// ───────────────────────────── extinction ─────────────────────────────

function extinguisherLeft(k: Kernel, p: Person): number {
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) if (inv[i].id === 'extincteur') return inv[i].state > 0.02 ? inv[i].count : 0;
  return 0;
}

const hasExtinguisher = (a: Agent): boolean => {
  const inv = a.p.inventory;
  for (let i = 0; i < inv.length; i++) if (inv[i].id === 'extincteur') return inv[i].count > 0 && inv[i].state > 0.02;
  return false;
};

/** Le foyer brûle-t-il encore ? Écrit sa position dans op.x, op.z. */
function fireAlive(k: Kernel, op: Op): boolean {
  const ctx = k.ctx;
  if (op.targetId > 0) {
    const person = ctx.people.get(op.targetId);
    if (person) {
      op.x = person.x;
      op.z = person.z;
      return person.burning > 0.03;
    }
    const prop: Prop | undefined = ctx.props.get(op.targetId);
    if (prop) {
      op.x = prop.x;
      op.z = prop.z;
      return prop.burning > 0.03 || prop.state === 'burning';
    }
    const v = ctx.vehicles.get(op.targetId);
    if (v) {
      op.x = v.x;
      op.z = v.z;
      return v.burning > 0.03 || v.state === 'burning';
    }
  }
  return ctx.hazards.fireAt(op.x, op.z) > 0.03;
}

export function createExtinguish(k: Kernel, root: Unit, owner: Unit, x: number, z: number, targetId: EntityId, ordered: boolean): Op | null {
  const within = ordered ? owner : null;
  const lead = nearest(root, within, x, z, hasExtinguisher, null) ?? (ordered ? nearest(root, null, x, z, hasExtinguisher, null) : null);
  if (!lead) return null;
  const op = createOp(OP_EXTINGUISH, root, owner, k.now);
  op.ordered = ordered;
  op.targetId = targetId;
  op.x = x;
  op.z = z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  // un foyer au pied de la ligne s'éteint depuis le rang ; au-delà, deux boucliers couvrent
  if (dist(lead.p, x, z) > 6) {
    takeCover(op, x, z, null);
    openDoor(k, lead, x, z, 5);
  }
  root.ops.push(op);
  return op;
}

function updateExtinguish(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const now = k.now;
  const lead = op.lead;
  if (!lead || !lead.able) {
    finish(k, op, false, 'Porte-extincteur hors de combat.');
    return;
  }
  const alive = fireAlive(k, op);
  const p = lead.p;
  if (!alive && now - op.t0 > 0.5) {
    ctx.director.addTension(-0.04, op.x, op.z, 'Feu éteint par les forces');
    finish(k, op, true, '');
    return;
  }
  if (extinguisherLeft(k, p) <= 0 && lead.act === ACT_NONE) {
    finish(k, op, false, 'Extincteur vide, feu non maîtrisé. Demande l’engin lanceur d’eau ou les pompiers.');
    return;
  }
  if (now - op.t0 > 90) {
    finish(k, op, false, 'Feu trop important pour un extincteur. Demande l’engin lanceur d’eau ou les pompiers.');
    return;
  }
  // rayon du foyer : un véhicule ou une barricade se combat de plus loin
  let stand = T.EXTINGUISH_RANGE;
  const v = op.targetId > 0 ? ctx.vehicles.get(op.targetId) : undefined;
  if (v) stand = Math.max(v.def.length, v.def.width) * 0.5 + 1.6;
  let dx = op.x - p.x;
  let dz = op.z - p.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= d;
  dz /= d;
  const s = op.root.sense;
  let tx = s.cx - op.x;
  let tz = s.cz - op.z;
  const tl = Math.sqrt(tx * tx + tz * tz) || 1;
  tx /= tl;
  tz /= tl;
  setGoal(op.cover1, p.x + tx * 1.5 - tz * 0.7, p.z + tz * 1.5 + tx * 0.7);
  setGoal(op.cover2, p.x + tx * 1.5 + tz * 0.7, p.z + tz * 1.5 - tx * 0.7);
  if (d > stand + 0.35 || d < stand - 0.9) {
    setGoal(lead, op.x - dx * stand, op.z - dz * stand);
    if (d > stand + 1.2) return;
  } else {
    lead.hold = true;
  }
  if (lead.act !== ACT_NONE || now < op.nextAt) return;
  // objet du décor : le verbe « eteindre » du module du mobilier tient le jet ; sinon jets d'une seconde
  if (op.targetId > 0 && ctx.props.get(op.targetId) && k.held(p) === 'extincteur') {
    if (busy(k, lead)) return;
    if (ctx.interactions.startVerb(p, 'eteindre', op.targetId)) return;
  }
  if (busy(k, lead)) return;
  beginAct(k, lead, 'extincteur', '', op.x, ctx.world.heightAt(op.x, op.z) + 0.3, op.z, 0);
  op.nextAt = now + 0.3;
}

// ───────────────────────────── ravitaillement ─────────────────────────────

const SUPPLY: readonly (readonly [ItemId, keyof VehicleReserve])[] = [
  ['grenade_lacrymo', 'lacrymoMain'], ['lanceur_cougar', 'lacrymoLanceur'], ['grenade_gm2l', 'gm2l'], ['lbd40', 'lbd'],
  ['grenade_desencerclement', 'desencerclement'], ['extincteur', 'extincteur'], ['gazeuse', 'gazeuse'], ['menottes', 'menottes'],
];

/** Ce qui manque à l'agent par rapport à la dotation de son poste (nombre d'unités, tous objets confondus). */
export function shortage(k: Kernel, a: Agent): number {
  let n = 0;
  const p = a.p;
  for (let i = 0; i < SUPPLY.length; i++) {
    const full = fullLoad(p.poste, SUPPLY[i][0]);
    if (full <= 0) continue;
    const have = SUPPLY[i][0] === 'extincteur' ? extinguisherLeft(k, p) : k.count(p, SUPPLY[i][0]);
    if (have < full) n += full - have;
  }
  return n;
}

function supplyVehicle(k: Kernel, a: Agent, wanted: EntityId): Vehicle | null {
  const ctx = k.ctx;
  const named = wanted > 0 ? ctx.vehicles.get(wanted) : undefined;
  if (named && k.reserveOf(named)) return named;
  for (let x: Unit | null = a.home; x; x = x.parent) {
    const v = x.squad.vehicleId !== 0 ? ctx.vehicles.get(x.squad.vehicleId) : undefined;
    const r = k.reserveOf(v);
    if (v && r && r.lacrymoMain + r.lacrymoLanceur + r.lbd + r.extincteur > 0) return v;
  }
  const n = ctx.vehicles.queryRadius(a.p.x, a.p.z, 200, k.vehicles);
  let best: Vehicle | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = k.vehicles[i];
    const r = k.reserveOf(v);
    if (!r || r.lacrymoMain + r.lacrymoLanceur + r.lbd + r.extincteur <= 0) continue;
    const d = dist(a.p, v.x, v.z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function createResupply(k: Kernel, root: Unit, owner: Unit, a: Agent, v: Vehicle): Op {
  const op = createOp(OP_RESUPPLY, root, owner, k.now);
  op.ordered = true;
  op.lead = a;
  op.destId = v.id;
  engage(op, a, ROLE_LEAD);
  a.goalRun = false;
  root.ops.push(op);
  return op;
}

function updateResupply(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const a = op.lead;
  const v = ctx.vehicles.get(op.destId);
  if (!a || !a.able || !v) {
    finish(k, op, false, '');
    return;
  }
  const p = a.p;
  const reach = v.def.length * 0.5 + 1.3;
  const gx = v.x - Math.sin(v.heading) * reach;
  const gz = v.z - Math.cos(v.heading) * reach;
  if (op.stage === 0) {
    setGoal(a, gx, gz);
    if (dist(p, gx, gz) < 1.5) {
      a.hold = true;
      nextStage(k, op, 1);
    } else if (k.now - op.t0 > 150) finish(k, op, false, '');
  } else if (k.now - op.stageT >= T.RESUPPLY_TIME) {
    const r = k.reserveOf(v);
    if (r) {
      for (let i = 0; i < SUPPLY.length; i++) {
        const id = SUPPLY[i][0];
        const key = SUPPLY[i][1];
        const full = fullLoad(p.poste, id);
        if (full <= 0) continue;
        const have = id === 'extincteur' ? extinguisherLeft(k, p) : k.count(p, id);
        const stock = r[key] as number;
        const take = Math.min(full - have, stock);
        if (take <= 0) continue;
        (r[key] as number) = stock - take;
        if (id === 'extincteur') {
          // appareil échangé contre un plein
          ctx.actions.remove(p, 'extincteur');
          const st = ctx.actions.give(p, 'extincteur', full);
          st.state = 1;
          ctx.actions.selectById(p, 'extincteur');
        } else {
          ctx.actions.give(p, id, take);
        }
        op.count += take;
      }
    }
    finish(k, op, true, '');
  } else {
    a.hold = true;
  }
}

// ───────────────────────────── dégagement d'une barricade ─────────────────────────────

function clearable(prop: Prop | undefined): prop is Prop {
  return !!prop && !prop.dormant;
}

export function createClear(k: Kernel, root: Unit, owner: Unit, prop: Prop): Op | null {
  const op = createOp(OP_CLEAR, root, owner, k.now);
  op.ordered = true;
  op.targetId = prop.id;
  op.x = prop.x;
  op.z = prop.z;
  // jusqu'à six agents, les mains libres de préférence
  for (let i = 0; i < 6; i++) {
    const a = nearest(root, owner, prop.x, prop.z, isHelper, null) ?? nearest(root, owner, prop.x, prop.z, isCatcher, null)
      ?? (i < 4 ? nearest(root, owner, prop.x, prop.z, anyTrooper, null) : null);
    if (!a) break;
    op.extra.push(a);
    engage(op, a, ROLE_SECOND);
    a.goalRun = false;
  }
  if (op.extra.length === 0) return null;
  root.ops.push(op);
  return op;
}

function updateClear(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const now = k.now;
  const prop = ctx.props.get(op.targetId);
  if (!clearable(prop) || (!prop.blocksMove && prop.kind !== 'barricade')) {
    finish(k, op, true, '');
    return;
  }
  if (prop.burning > 0.3) {
    finish(k, op, false, 'Barricade en feu : à éteindre avant de la dégager.');
    return;
  }
  if (now - op.t0 > 180) {
    finish(k, op, false, 'Barricade trop lourde à la main. Demande le Centaure.');
    return;
  }
  const reach = Math.max(prop.halfX, prop.halfZ) + 0.9;
  const n = op.extra.length;
  let working = 0;
  let able = 0;
  for (let i = 0; i < n; i++) {
    const a = op.extra[i];
    if (!a.able) continue;
    able++;
    // répartis autour de l'obstacle, du côté de l'unité
    const ang = prop.heading + Math.PI * 0.5 + ((i - (n - 1) / 2) * 0.9) / Math.max(1, n * 0.5);
    let sx = Math.sin(ang);
    let sz = Math.cos(ang);
    if ((a.p.x - prop.x) * sx + (a.p.z - prop.z) * sz < 0) {
      sx = -sx;
      sz = -sz;
    }
    const lat = (i - (n - 1) / 2) * 1.1;
    const gx = prop.x + sx * reach - sz * lat;
    const gz = prop.z + sz * reach + sx * lat;
    if (busy(k, a)) {
      a.hold = true;
      working++;
      continue;
    }
    a.hold = false;
    setGoal(a, gx, gz);
    if (dist(a.p, gx, gz) < 0.9 && now >= op.nextAt) {
      if (ctx.interactions.startVerb(a.p, 'degager', prop.id)) {
        a.hold = true;
        working++;
        op.count++;
      } else {
        op.tries++;
      }
    }
  }
  if (able === 0) finish(k, op, false, 'Équipe de dégagement hors de combat.');
  else if (working === 0 && op.tries > 40 && op.count === 0) finish(k, op, false, 'Impossible de dégager l’obstacle à la main. Demande le Centaure.');
}

// ───────────────────────────── dispersion au gaz (sur ordre) ─────────────────────────────

const AVERTISSEMENT = 'Attention, nous allons employer des grenades lacrymogènes. Écartez-vous.';
const isParticipant = (p: Person): boolean => p.faction === 'protest' && p.custody === 'free' && p.posture !== 'down';

function updateGas(k: Kernel, op: Op): void {
  const now = k.now;
  const owner = op.owner;
  const root = op.root;
  if (op.stage === 0) {
    // moyen de niveau 3 : il faut l'ordre ET le cadre légal (ou la riposte)
    const cap = forceCap(k, owner.isRoot ? owner : root);
    const ordered = owner.squad.order.maxForce;
    if (cap < 3 || ordered < 3) {
      const why = ordered < 3 ? 'lacrymogènes non autorisés par l’ordre reçu (niveau ' + spell(ordered) + ')'
        : 'cadre légal non réuni : sommations non faites et aucune violence contre l’unité';
      k.say(owner, negative(owner.squad.name, 'Emploi des ' + why + '. Je fais part de mes objections et je tiens la position'), 1, 'unite');
      k.emit(ORDER_REFUSED_EVENT, { squadId: owner.id, type: 'disperser_gaz', reason: why });
      finish(k, op, false, 'refus');
      return;
    }
    k.ctx.radio.say({ channel: 'public', from: owner.squad.name, text: AVERTISSEMENT, priority: 1, personId: owner.squad.leaderId || undefined });
    nextStage(k, op, 1);
    op.nextAt = now + T.WARNING_DELAY;
    return;
  }
  if (now < op.nextAt) return;
  const present = k.ctx.people.countIn(op.x, op.z, 16, isParticipant);
  if (op.count > 0 && present < 3) {
    finish(k, op, true, 'Zone traitée, ' + spell(op.count) + (op.count > 1 ? ' grenades lacrymogènes consommées' : ' grenade lacrymogène consommée') + ', la zone se vide');
    return;
  }
  if (op.tries >= 3) {
    finish(k, op, true, 'Lacrymogènes employés, ' + spell(op.count) + ' grenades consommées, effet partiel');
    return;
  }
  const shots = gasVolley(k, root, op.x, op.z, 3, owner.isRoot ? null : owner);
  if (shots > 0) {
    op.count += shots;
    op.tries++;
    op.nextAt = now + 11;
    op.stageT = now;
  } else {
    op.nextAt = now + 1;
    if (now - op.stageT > 22) finish(k, op, false, op.count > 0 ? '' : 'Tir impossible : objectif hors de portée, munitions épuisées ou cadre non réuni.');
  }
}

// ───────────────────────────── ordres de tâche ─────────────────────────────

/**
 * Prise en compte d'un ordre de tâche donné à `owner` (ses spécialistes sortent du rang, la formation ne
 * change pas). Retourne un motif d'échec, ou '' si la tâche est lancée.
 */
export function startTask(k: Kernel, owner: Unit, o: SquadOrder): string {
  const ctx = k.ctx;
  const root = owner.lead;
  const type = o.type;
  if (type === 'interpeller') {
    let target = o.targetId > 0 ? ctx.people.get(o.targetId) : undefined;
    if (!target || target.faction === 'police') {
      // à défaut de cible désignée : l'auteur d'un fait constaté le plus proche du point
      let bestD = 30 * 30;
      const n = ctx.people.queryRadius(o.x, o.z, 30, k.people);
      target = undefined;
      for (let i = 0; i < n; i++) {
        const p = k.people[i];
        if (p.faction === 'police' || p.custody !== 'free' || !recentFlagrant(p, k.now, 120) || !ctx.law.canArrest(p)) continue;
        const d = (p.x - o.x) * (p.x - o.x) + (p.z - o.z) * (p.z - o.z);
        if (d < bestD) {
          bestD = d;
          target = p;
        }
      }
    }
    if (!target) return 'Aucun individu à interpeller sur fait constaté.';
    if (!ctx.law.canArrest(target)) return 'Aucun fait constaté contre ' + designate(target) + ' : interpellation non fondée, je ne l’exécute pas.';
    return createArrest(k, root, owner, target, true) ? '' : 'Aucun binôme d’interpellation disponible.';
  }
  if (type === 'secourir') {
    let victim = o.targetId > 0 ? ctx.people.get(o.targetId) : undefined;
    if (!victim) {
      let bestD = 40 * 40;
      const n = ctx.people.queryRadius(o.x, o.z, 40, k.people);
      for (let i = 0; i < n; i++) {
        const p = k.people[i];
        if (!carriable(p) || (p.injury !== 'serious' && p.injury !== 'critical')) continue;
        const d = (p.x - o.x) * (p.x - o.x) + (p.z - o.z) * (p.z - o.z);
        if (d < bestD) {
          bestD = d;
          victim = p;
        }
      }
    }
    if (!victim) return 'Aucun blessé à terre au point indiqué.';
    return createRescue(k, root, owner, victim, true) ? '' : 'Aucun agent disponible pour l’extraction.';
  }
  if (type === 'eteindre') {
    let x = o.x;
    let z = o.z;
    let id = o.targetId;
    const person = id > 0 ? ctx.people.get(id) : undefined;
    const prop = id > 0 ? ctx.props.get(id) : undefined;
    const v = id > 0 ? ctx.vehicles.get(id) : undefined;
    if (person) {
      x = person.x;
      z = person.z;
    } else if (prop) {
      x = prop.x;
      z = prop.z;
    } else if (v) {
      x = v.x;
      z = v.z;
    } else {
      id = 0;
      // objet en feu au point désigné, s'il y en a un
      const n = ctx.props.queryRadius(x, z, 3, k.props);
      for (let i = 0; i < n; i++) if (k.props[i].burning > 0.05) id = k.props[i].id;
    }
    return createExtinguish(k, root, owner, x, z, id, true) ? '' : 'Pas d’extincteur disponible. Demande l’engin lanceur d’eau ou les pompiers.';
  }
  if (type === 'degager_barricade') {
    let prop = o.targetId > 0 ? ctx.props.get(o.targetId) : undefined;
    if (!prop) {
      const n = ctx.props.queryRadius(o.x, o.z, 25, k.props);
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const q = k.props[i];
        if (q.kind !== 'barricade' && !(q.blocksMove && (q.toppled || q.state === 'broken' || q.state === 'burnt'))) continue;
        const d = (q.x - o.x) * (q.x - o.x) + (q.z - o.z) * (q.z - o.z) - (q.kind === 'barricade' ? 100 : 0);
        if (d < bestD) {
          bestD = d;
          prop = q;
        }
      }
    }
    if (!prop) return 'Aucune barricade au point indiqué.';
    return createClear(k, root, owner, prop) ? '' : 'Aucun agent disponible pour dégager.';
  }
  if (type === 'disperser_gaz') {
    const op = createOp(OP_GAS, root, owner, k.now);
    op.ordered = true;
    op.x = o.x;
    op.z = o.z;
    root.ops.push(op);
    return '';
  }
  if (type === 'ravitailler') {
    owner.man.targetId = o.targetId;
    return resupplyNext(k, owner, true) ? '' : 'Rien à compléter, ou aucune réserve à portée.';
  }
  return 'Ordre inconnu.';
}

/** Envoie au ravitaillement les agents à qui il manque quelque chose, quelques-uns à la fois. Retourne false s'il n'y a plus rien à faire. */
export function resupplyNext(k: Kernel, owner: Unit, first: boolean): boolean {
  const root = owner.lead;
  let running = 0;
  for (let i = 0; i < root.ops.length; i++) if (root.ops[i].kind === OP_RESUPPLY && root.ops[i].owner === owner && !root.ops[i].done) running++;
  let started = 0;
  const agents = root.agents;
  for (let i = 0; i < agents.length && running + started < T.RESUPPLY_PARALLEL; i++) {
    const a = agents[i];
    if (!free(a) || !isUnder(a, owner) || shortage(k, a) <= 0) continue;
    const v = supplyVehicle(k, a, owner.man.targetId);
    if (!v) continue;
    // la réserve doit contenir au moins un objet utile à cet agent
    const r = k.reserveOf(v)!;
    let useful = false;
    for (let j = 0; j < SUPPLY.length; j++) {
      const full = fullLoad(a.p.poste, SUPPLY[j][0]);
      if (full <= 0) continue;
      const have = SUPPLY[j][0] === 'extincteur' ? extinguisherLeft(k, a.p) : k.count(a.p, SUPPLY[j][0]);
      if (have < full && (r[SUPPLY[j][1]] as number) > 0) useful = true;
    }
    if (!useful) continue;
    createResupply(k, root, owner, a, v);
    started++;
  }
  return running + started > 0 || (first && false);
}

// ───────────────────────────── boucle ─────────────────────────────

/** Fait avancer les opérations d'une racine ; retire celles qui sont terminées. `ended` reçoit chaque opération finie. */
export function updateOps(k: Kernel, root: Unit, ended: (op: Op) => void): void {
  const ops = root.ops;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (!op.done) {
      switch (op.kind) {
        case OP_ARREST: updateArrest(k, op); break;
        case OP_RESCUE: updateRescue(k, op); break;
        case OP_EXTINGUISH: updateExtinguish(k, op); break;
        case OP_RESUPPLY: updateResupply(k, op); break;
        case OP_CLEAR: updateClear(k, op); break;
        case OP_GAS: updateGas(k, op); break;
        default: finish(k, op, false, ''); break;
      }
    }
    if (op.done) {
      ops.splice(i, 1);
      ended(op);
    }
  }
}

/** Interrompt les opérations d'une racine (toutes, ou celles de l'unité `within` et de sa descendance). */
export function abortOps(k: Kernel, root: Unit, within: Unit | null, reason: string): void {
  for (let i = 0; i < root.ops.length; i++) {
    const op = root.ops[i];
    if (op.done) continue;
    if (within) {
      let under = false;
      for (let x: Unit | null = op.owner; x; x = x.parent) if (x === within) under = true;
      if (!under) continue;
    }
    // une personne déjà maîtrisée n'est pas abandonnée : l'interpellation va à son terme
    if (op.kind === OP_ARREST && op.stage >= 2) continue;
    if (op.kind === OP_RESCUE && op.stage >= 2) continue;
    finish(k, op, false, reason);
  }
}

/** Initiative de l'unité : interpellation d'un flagrant délit à portée, secours d'un collègue à terre, feu au pied de la ligne. */
export function autoOps(k: Kernel, root: Unit): void {
  if (root.ops.length >= T.OPS_MAX) return;
  const ctx = k.ctx;
  const s = root.sense;
  const t = k.tuning;
  const type = root.order ? root.order.type : 'libre';
  const steady = root.phase === 'en_place' || root.phase === 'repos' || root.phase === 'mise_en_place';
  // secours d'un collègue à terre
  if (t.autoRescue) {
    for (let i = 0; i < root.agents.length; i++) {
      const a = root.agents[i];
      const p = a.p;
      if (a.able || p.posture !== 'down' || p.vehicleId !== 0 || p.heldBy !== 0) continue;
      if (p.injury !== 'serious' && p.injury !== 'critical') continue;
      if (hasOpOn(root, OP_RESCUE, p.id)) continue;
      // déjà à l'abri derrière la ligne : pas d'extraction
      const g = root.groups.length > 0 ? root.groups[0] : null;
      if (g && g.kind !== F_NONE && (p.x - g.ax) * Math.sin(g.ah) + (p.z - g.az) * Math.cos(g.ah) < -(T.RESCUE_DROP_BACK - 2.5)) continue;
      if (createRescue(k, root, a.home ?? root, p, false)) return;
    }
  }
  if (!steady) return;
  // flagrant délit à portée : le binôme sort de lui-même si le niveau autorisé le permet
  if (t.autoArrest && s.arrestTargetId !== 0 && type !== 'repli' && type !== 'embarquer' && forceCap(k, root) >= 1
    && !hasOpKind(root, OP_ARREST)) {
    const target = ctx.people.get(s.arrestTargetId);
    if (target && target.custody === 'free' && ctx.law.canArrest(target)) {
      // pas au milieu d'un groupe hostile compact : le binôme serait isolé
      const hostile = ctx.people.countIn(target.x, target.z, 5, isParticipant) - 1;
      if (hostile <= T.ARREST_CROWD_LIMIT) {
        if (createArrest(k, root, root, target, false)) return;
      }
    }
  }
  // feu au pied de la ligne : le porte-extincteur l'éteint
  const dangers = k.dangers;
  for (let i = 0; i < dangers.length; i++) {
    const d = dangers[i];
    if (!d.fire || ctx.hazards.fireAt(d.x, d.z) < 0.1) continue;
    const g = root.groups.length > 0 ? root.groups[0] : null;
    if (!g || g.kind === F_NONE) continue;
    const fwd = (d.x - g.ax) * Math.sin(g.ah) + (d.z - g.az) * Math.cos(g.ah);
    const lat = Math.abs((d.x - g.ax) * -Math.cos(g.ah) + (d.z - g.az) * Math.sin(g.ah));
    if (fwd < -10 || fwd > 7 || lat > g.width * 0.5 + 4) continue;
    if (hasOpAt(root, OP_EXTINGUISH, d.x, d.z)) continue;
    if (createExtinguish(k, root, root, d.x, d.z, 0, false)) return;
  }
}

function hasOpKind(root: Unit, kind: number): boolean {
  for (let i = 0; i < root.ops.length; i++) if (root.ops[i].kind === kind && !root.ops[i].done) return true;
  return false;
}

function hasOpOn(root: Unit, kind: number, targetId: EntityId): boolean {
  for (let i = 0; i < root.ops.length; i++) if (root.ops[i].kind === kind && root.ops[i].targetId === targetId && !root.ops[i].done) return true;
  return false;
}

function hasOpAt(root: Unit, kind: number, x: number, z: number): boolean {
  for (let i = 0; i < root.ops.length; i++) {
    const op = root.ops[i];
    if (op.kind === kind && !op.done && (op.x - x) * (op.x - x) + (op.z - z) * (op.z - z) < 9) return true;
  }
  return false;
}

/** Texte du compte rendu de fin d'une opération menée sur ordre. */
export function opReport(k: Kernel, op: Op): string {
  if (op.reason === 'refus') return '';
  switch (op.kind) {
    case OP_ARREST: return op.ok ? '' : 'Interpellation non aboutie. ' + op.reason;
    case OP_RESCUE: return op.ok ? (op.reason !== '' ? op.reason : '') : 'Extraction non aboutie. ' + op.reason;
    case OP_EXTINGUISH: return op.ok ? 'Feu éteint' + (sectorOf(k, op.x, op.z) !== '' ? ', ' + sectorOf(k, op.x, op.z) : '') : op.reason;
    case OP_CLEAR: return op.ok ? 'Barricade dégagée, passage ouvert' : op.reason;
    case OP_GAS: return op.reason;
    default: return '';
  }
}

export { done as taskDone };
