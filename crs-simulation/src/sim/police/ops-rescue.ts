/* =====================================================================================
 * FORCES DE L'ORDRE — secours et extinction.
 *
 *   secours     un agent va chercher le blessé (traîné sur une courte distance, porté au-delà :
 *               interactions « trainer », « porter », « deposer »), deux boucliers s'interposent
 *               entre lui et la foule ; le blessé est déposé derrière la ligne (bible §G.3) ;
 *   extinction  le porte-extincteur se place à 2,4 m du foyer et arrose par jets d'une seconde
 *               (ou tient le jet par le verbe « eteindre » sur un objet du décor), couvert par deux
 *               boucliers dès que le foyer est à plus de six mètres du rang.
 * ===================================================================================== */

import type { EntityId, Person, Prop } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueApi } from '@/core/extensions';
import type { Agent, Op, Unit } from './brain';
import { ACT_NONE, F_NONE, OP_EXTINGUISH, OP_RESCUE, ROLE_LEAD, createOp } from './brain';
import { beginAct } from './weapons';
import type { Kernel } from './kernel';
import {
  anyTrooper, busy, dist, engage, finish, isCatcher, isHelper, lineDoor, nearest, nextStage, offLine, openDoor, setGoal, takeCover,
} from './ops-core';
import { sectorOf } from './radio';
import * as T from './tuning';

// ───────────────────────────── secours ─────────────────────────────

export function carriable(victim: Person): boolean {
  return victim.posture === 'down' && victim.heldBy === 0 && victim.vehicleId === 0 && !victim.dormant
    && victim.custody !== 'in_vehicle' && victim.custody !== 'handed_over';
}

export function createRescue(k: Kernel, root: Unit, owner: Unit, victim: Person, ordered: boolean): Op | null {
  const within = ordered ? owner : null;
  // rue barrée : l'agent de secours sort du second rang, le premier tient la rue (pas de trou dans le barrage)
  let lead = nearest(root, within, victim.x, victim.z, offLine(root, isHelper), null);
  if (!lead) lead = nearest(root, within, victim.x, victim.z, offLine(root, isCatcher), null);
  if (!lead) lead = nearest(root, null, victim.x, victim.z, offLine(root, anyTrooper), null);
  // personne au second rang (avenue large : tout le monde monte en ligne) : un blessé ne reste pas à terre, le plus
  // proche du premier rang va le chercher
  if (!lead && root.man.barrage) lead = nearest(root, null, victim.x, victim.z, anyTrooper, null);
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

export function updateRescue(k: Kernel, op: Op): void {
  stepRescue(k, op);
  lineDoor(k, op);
}

function stepRescue(k: Kernel, op: Op): void {
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

export function extinguisherLeft(p: Person): number {
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

export function updateExtinguish(k: Kernel, op: Op): void {
  stepExtinguish(k, op);
  lineDoor(k, op);
}

function stepExtinguish(k: Kernel, op: Op): void {
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
  if (extinguisherLeft(p) <= 0 && lead.act === ACT_NONE) {
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
