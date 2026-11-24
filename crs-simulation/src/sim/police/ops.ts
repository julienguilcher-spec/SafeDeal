/* =====================================================================================
 * FORCES DE L'ORDRE — opérations détachées : quelques agents sortent du rang pour une tâche, par
 * les mêmes interactions que le joueur (ctx.interactions.startVerb), puis reprennent leur place.
 *
 *   startTask()  prise en compte d'un ordre de tâche (interpeller, secourir, eteindre,
 *                degager_barricade, disperser_gaz, ravitailler) : la formation ne change pas ;
 *   autoOps()    initiatives de l'unité : interpellation d'un flagrant délit à portée, secours
 *                d'un collègue à terre, extinction d'un feu au pied de la ligne ;
 *   updateOps()  avancement de chaque opération ; abortOps() sur ordre de cesser.
 * Détail : ops-arrest.ts (interpellation), ops-rescue.ts (secours, extinction), ops-supply.ts
 * (ravitaillement, dégagement, gaz sur ordre), ops-core.ts (outils communs).
 * ===================================================================================== */

import type { EntityId, SquadOrder } from '@/core/contracts';
import type { Op, Unit } from './brain';
import { F_NONE, OP_ARREST, OP_CLEAR, OP_EXTINGUISH, OP_GAS, OP_RESCUE, OP_RESUPPLY, createOp } from './brain';
import { forceCap, recentFlagrant } from './force';
import type { Kernel } from './kernel';
import { STAGE_WATCH, WATCH_NOTHING, arrestKind, createArrest, createWatch, updateArrest } from './ops-arrest';
import { finish } from './ops-core';
import { carriable, createExtinguish, createRescue, updateExtinguish, updateRescue } from './ops-rescue';
import { createClear, isParticipant, resupplyNext, updateClear, updateGas, updateResupply } from './ops-supply';
import { sectorOf } from './radio';
import * as T from './tuning';

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
    // « Aller constater » (plan §4.3) : personne n'a rien commis au point, ou la personne désignée n'a commis aucun fait
    // constaté — l'ordre n'est pas refusé : le binôme se porte à 10 m, observe, et interpelle au premier fait constaté
    // (jamais une interpellation sans fait constaté). La surveillance précédente de l'unité cesse.
    if (!target || !ctx.law.canArrest(target)) {
      const ops = root.ops;
      for (let i = 0; i < ops.length; i++) if (ops[i].owner === owner && ops[i].kind === OP_ARREST && ops[i].stage === STAGE_WATCH) finish(k, ops[i], false, '');
      const watched = target && target.custody === 'free' ? target.id : 0;
      return createWatch(k, root, owner, target ? target.x : o.x, target ? target.z : o.z, watched) ? '' : 'Aucun binôme d’interpellation disponible.';
    }
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
    return resupplyNext(k, owner) ? '' : 'Rien à compléter, ou aucune réserve à portée.';
  }
  return 'Ordre inconnu.';
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
    // une personne déjà maîtrisée n'est pas abandonnée : l'interpellation va à son terme (une surveillance « Aller
    // constater », elle, cesse)
    if (op.kind === OP_ARREST && op.stage >= 2 && op.stage !== STAGE_WATCH) continue;
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
    case OP_ARREST:
      if (op.ok || op.reason === '') return '';
      if (op.reason === WATCH_NOTHING) return 'Rien constaté sur place, aucun interpellé. Je reprends ma place';
      return (arrestKind(op) === 'escort' ? 'Interpellé non pris en charge. ' : 'Interpellation non aboutie. ') + op.reason;
    case OP_RESCUE: return op.ok ? (op.reason !== '' ? op.reason : '') : 'Extraction non aboutie. ' + op.reason;
    case OP_EXTINGUISH: return op.ok ? 'Feu éteint' + (sectorOf(k, op.x, op.z) !== '' ? ', ' + sectorOf(k, op.x, op.z) : '') : op.reason;
    case OP_CLEAR: return op.ok ? 'Barricade dégagée, passage ouvert' : op.reason;
    case OP_GAS: return op.reason;
    default: return '';
  }
}

export { resupplyNext };
