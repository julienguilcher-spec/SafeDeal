/* =====================================================================================
 * FORCES DE L'ORDRE — interpellation (bible §H.1) : le binôme sort par une « porte » ouverte dans
 * la ligne, couvert par deux boucliers, et enchaîne les interactions du module de droit comme le
 * ferait un joueur : maitriser → menotter → escorter → remettre (fourgon cellulaire ou fourgon de
 * l'unité ayant une place, sinon point de regroupement 'law.handover'), puis reprend sa place.
 * ===================================================================================== */

import type { Person, Vehicle } from '@/core/contracts';
import { ARREST_EVENT } from './api';
import type { Agent, Op, Unit } from './brain';
import { F_NONE, OP_ARREST, ROLE_LEAD, ROLE_SECOND, createOp } from './brain';
import type { Kernel } from './kernel';
import { report } from './mcore';
import {
  anyTrooper, approachPoint, busy, dist, engage, finish, isCatcher, isHelper, nearest, lineDoor, nextStage, offLine, openDoor, release, setGoal,
  takeCover,
} from './ops-core';
import { fleetOf } from './tree';
import * as T from './tuning';

// ───────────────────────────── interpellation ─────────────────────────────

const catcherOrHelper = (a: Agent): boolean => isCatcher(a) || isHelper(a);

/** Lance l'interpellation d'une personne par le binôme le plus proche. null si personne n'est disponible. */
export function createArrest(k: Kernel, root: Unit, owner: Unit, target: Person, ordered: boolean): Op | null {
  const within = ordered ? owner : null;
  // rue barrée : le binôme sort du second rang, le premier tient la rue (pas de trou dans le barrage)
  const catcher = offLine(root, isCatcher);
  const helper = offLine(root, isHelper);
  let lead = nearest(root, within, target.x, target.z, catcher, null);
  if (!lead) lead = nearest(root, within, target.x, target.z, helper, null);
  if (!lead && ordered) lead = nearest(root, within, target.x, target.z, offLine(root, anyTrooper), null);
  if (!lead && ordered && root.man.barrage) {
    // Ordre d'interpeller et personne hors du premier rang (rue large : toute la section tient la ligne, y compris le
    // binôme d'interpellation ; ou les agents du second rang gardent déjà des interpellés) : l'ordre n'est pas refusé
    // pour autant — l'agent du rang le plus proche sort par la porte (lineDoor), le rang se referme derrière lui.
    // (Sinon, à une sortie filtrée, chaque auteur retenu à la porte était relâché : « Aucun binôme disponible ».)
    lead = nearest(root, within, target.x, target.z, catcherOrHelper, null) ?? nearest(root, within, target.x, target.z, anyTrooper, null);
  }
  if (!lead) return null;
  const op = createOp(OP_ARREST, root, owner, k.now);
  op.ordered = ordered;
  op.targetId = target.id;
  op.x = target.x;
  op.z = target.z;
  op.lead = lead;
  engage(op, lead, ROLE_LEAD);
  op.second = nearest(root, within, target.x, target.z, catcher, lead) ?? nearest(root, within, target.x, target.z, helper, lead);
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
    approachPoint(k, best, from);
    op.destX = k.v2.x;
    op.destZ = k.v2.z;
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

export function updateArrest(k: Kernel, op: Op): void {
  stepArrest(k, op);
  lineDoor(k, op);
}

function stepArrest(k: Kernel, op: Op): void {
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
      // le premier va au contact, le second sur le flanc, les boucliers de part et d'autre. Individu qui s'éloigne
      // (il fuit, ou sort d'une nasse) : le premier vise là où il sera dans un instant, pas 0,8 m derrière lui — sinon,
      // freinant à l'approche de son but, il restait à 1,7 m dans le dos d'un fuyard aussi rapide que lui sans jamais
      // l'atteindre (« Individu hors d'atteinte »).
      const away = target.vx * dx + target.vz * dz;
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
        // le point d'approche est fixé une fois pour toutes tant que le véhicule ne bouge pas
        if ((op.destX - v.x) * (op.destX - v.x) + (op.destZ - v.z) * (op.destZ - v.z) > 36) {
          approachPoint(k, v, p);
          op.destX = k.v2.x;
          op.destZ = k.v2.z;
        }
        gx = op.destX;
        gz = op.destZ;
      }
      setGoal(lead, gx, gz);
      if (second) setGoal(second, p.x - Math.sin(p.heading) * 1.1, p.z - Math.cos(p.heading) * 1.1);
      // (rue barrée) les boucliers suivent le binôme jusque derrière la ligne
      setGoal(op.cover1, p.x - Math.sin(p.heading) * 2.2, p.z - Math.cos(p.heading) * 2.2);
      setGoal(op.cover2, p.x - Math.sin(p.heading) * 3.2, p.z - Math.cos(p.heading) * 3.2);
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
  // la remise elle-même est annoncée par le module de droit (heure, qualification) ; l'unité ne rend compte
  // à la radio que si l'interpellé reste gardé derrière la ligne, faute de véhicule ou de point de regroupement
  if (!handed) {
    const o = k.ctx.law.worstOffense(target);
    const fact = o ? (o.type === 'jet_projectile' ? 'jet de projectile sur agents' : o.type === 'violence_agent' ? 'violences sur agent'
      : o.type === 'incendie' ? 'incendie volontaire' : o.type === 'degradation' ? 'dégradations' : o.type === 'pillage' ? 'vol en réunion' : 'fait constaté') : 'fait constaté';
    report(k, owner, 'UN interpellé pour ' + fact + (o && o.filmed ? ', fait filmé' : '') + '. Gardé derrière la ligne, demande un véhicule pour la remise');
  }
  if (root.squad.morale < 1) root.squad.morale = Math.min(1, root.squad.morale + 0.03);
  k.emit(ARREST_EVENT, { squadId: owner.id, targetId: target.id, byId: op.lead ? op.lead.p.id : 0, stage: handed ? 'remise' : 'garde' });
  finish(k, op, true, '');
}
