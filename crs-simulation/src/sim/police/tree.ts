/* =====================================================================================
 * FORCES DE L'ORDRE — arborescence des unités : mémoire des unités (Squad.brain) et des agents
 * (Person.brain), qui dirige qui, effectif dirigé par chaque racine de formation.
 *
 * Une unité qui reçoit un ordre de formation devient « racine » : elle dirige ses membres et toute
 * sa descendance, sauf les unités subordonnées qui ont reçu depuis un ordre propre (elles restent
 * racines jusqu'au prochain ordre de formation donné plus haut). Toute unité de faction « police »
 * connue de ctx.squads est prise en charge, quelle que soit son origine.
 * ===================================================================================== */

import type { Squad } from '@/core/contracts';
import { hash2 } from '@/core/rng';
import type { Agent, Unit } from './brain';
import { agentOf, createAgent, createUnit, unitOf } from './brain';
import { classify } from './formation';
import type { Kernel } from './kernel';
import { isAble } from './kernel';

const fresh: Unit[] = [];

function isPoliceSquad(s: Squad): boolean {
  return s.faction === 'police';
}

/** Empreinte de l'arborescence : change quand une unité est créée, retirée, rattachée, ou change d'effectif. */
function signature(k: Kernel): number {
  const list = k.ctx.squads.list;
  let sig = list.length;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!isPoliceSquad(s)) continue;
    sig = (Math.imul(sig, 31) + s.id * 7 + s.parentId * 13 + s.members.length * 17 + s.leaderId + s.vehicleId * 3) | 0;
  }
  return sig;
}

/**
 * Met à jour unités et agents si l'arborescence a changé (ou si `force`). Retourne true dans ce cas.
 * Les racines dont l'effectif a changé sont marquées pour une reformation (reformAt).
 */
export function syncTree(k: Kernel, force: boolean): boolean {
  const sig = signature(k);
  if (!force && sig === k.treeSig) return false;
  k.treeSig = sig;
  const ctx = k.ctx;
  const squads = ctx.squads.list;
  const units = k.units;
  units.length = 0;
  for (let i = 0; i < squads.length; i++) {
    const s = squads[i];
    if (!isPoliceSquad(s)) continue;
    let u = unitOf(s);
    if (!u) {
      u = createUnit(s);
      s.brain = u;
      u.thinkAt = k.now + ((s.id * 0.137) % 0.4);
      fresh.push(u);
    }
    u.children.length = 0;
    u.parent = null;
    u.own.length = 0;
    units.push(u);
  }
  // liens de parenté
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const parent = u.squad.parentId !== 0 ? unitOf(ctx.squads.get(u.squad.parentId)) : null;
    if (parent && parent !== u) {
      u.parent = parent;
      parent.children.push(u);
    }
  }
  // une unité nouvelle manœuvre avec son échelon supérieur tant qu'elle n'a pas reçu d'ordre propre
  for (let i = 0; i < fresh.length; i++) fresh[i].isRoot = fresh[i].parent === null;
  fresh.length = 0;
  // membres directs
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const members = u.squad.members;
    for (let j = 0; j < members.length; j++) {
      const p = ctx.people.get(members[j]);
      if (!p) continue;
      let a = agentOf(p);
      if (!a) {
        a = createAgent(p, (hash2(p.id, 977) % 10007) / 10007);
        p.brain = a;
        a.thinkAt = k.now + a.seed * 0.25;
      }
      a.home = u;
      // conducteurs et équipages restent à leur véhicule
      a.crew = u.squad.kind === 'equipage' || (p.poste === 'conducteur' && (p.vehicleId !== 0 || fleetNear(u)));
      classify(k, a);
      u.own.push(a);
    }
  }
  resolveLeads(k);
  return true;
}

function fleetNear(u: Unit): boolean {
  for (let x: Unit | null = u; x; x = x.parent) if (x.squad.vehicleId !== 0) return true;
  return false;
}

/** Recalcule qui dirige qui et l'effectif de chaque racine. */
export function resolveLeads(k: Kernel): void {
  const units = k.units;
  const roots = k.roots;
  roots.length = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.parent && !u.joinedTo) u.isRoot = true;
    if (u.joinedTo && (!u.joinedTo.isRoot || units.indexOf(u.joinedTo) < 0)) {
      u.joinedTo = null;
      u.isRoot = true;
    }
  }
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    let x: Unit = u;
    let guard = 0;
    while (guard++ < 16) {
      if (x.joinedTo) {
        x = x.joinedTo;
        break;
      }
      if (x.isRoot || !x.parent) break;
      x = x.parent;
    }
    u.lead = x;
    if (u.isRoot && !u.joinedTo) roots.push(u);
  }
  for (let i = 0; i < roots.length; i++) roots[i].agents.length = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const lead = u.lead;
    for (let j = 0; j < u.own.length; j++) {
      const a = u.own[j];
      if (a.root !== lead) {
        // changement de direction : l'emplacement dans l'ancienne formation est rendu
        a.root = lead;
        a.group = null;
        a.hasSlot = false;
      }
      lead.agents.push(a);
    }
  }
  // effectif changé : reformation
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i];
    let sig = r.agents.length;
    for (let j = 0; j < r.agents.length; j++) sig = (Math.imul(sig, 33) + r.agents[j].p.id) | 0;
    if (sig !== r.memberSig) {
      r.memberSig = sig;
      if (r.reformAt === 0 || r.reformAt > k.now) r.reformAt = k.now;
    }
  }
}

/** Durée pendant laquelle un agent tombé garde son emplacement (il se relève le plus souvent seul). */
const SLOT_KEEP = 5;

/**
 * Met à jour l'état de chaque agent d'une racine : `able` (en état d'agir maintenant) et `formable` (garde
 * son emplacement : un agent jeté à terre le garde quelques secondes, un blessé grave le rend aussitôt).
 * Retourne le nombre d'agents qui gardent un emplacement.
 */
export function refreshFormable(k: Kernel, root: Unit): number {
  const ctx = k.ctx;
  const agents = root.agents;
  let n = 0;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const p = a.p;
    const present = !a.crew && p.vehicleId === 0 && !p.dormant && ctx.people.get(p.id) === p;
    const able = present && isAble(ctx, p);
    a.able = able;
    if (able) {
      a.downSince = 0;
      a.formable = true;
    } else if (!present || p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead' || p.custody !== 'free' || p.health <= 0) {
      a.formable = false;
    } else {
      if (a.downSince === 0) a.downSince = k.now;
      a.formable = k.now - a.downSince <= SLOT_KEEP;
    }
    if (a.formable) n++;
  }
  return n;
}

/** Agents aptes d'une racine, écrits dans `out` (tronqué) ; retourne leur nombre. */
export function formables(root: Unit, out: Agent[]): number {
  const agents = root.agents;
  let n = 0;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    // un agent en route vers son véhicule ne prend plus de place dans la formation
    if (!a.formable || a.boardId !== 0) continue;
    if (n < out.length) out[n] = a;
    else out.push(a);
    n++;
  }
  out.length = n;
  return n;
}

/** L'unité `u` appartient-elle à la descendance de `ancestor` (elle-même comprise) ? */
export function isUnder(u: Unit | null, ancestor: Unit): boolean {
  for (let x = u, guard = 0; x && guard < 16; x = x.parent, guard++) if (x === ancestor) return true;
  return false;
}

/** Applique `fn` à l'unité et à toute sa descendance. */
export function eachDescendant(u: Unit, fn: (d: Unit) => void): void {
  fn(u);
  for (let i = 0; i < u.children.length; i++) eachDescendant(u.children[i], fn);
}

/** Véhicules de l'unité et de sa descendance (Squad.vehicleId et véhicules supplémentaires), sans doublon. */
export function fleetOf(k: Kernel, u: Unit, out: number[]): number {
  out.length = 0;
  const add = (d: Unit): void => {
    const v = d.squad.vehicleId;
    if (v !== 0 && out.indexOf(v) < 0 && k.ctx.vehicles.get(v)) out.push(v);
    for (let i = 0; i < d.extraVehicles.length; i++) {
      const e = d.extraVehicles[i];
      if (out.indexOf(e) < 0 && k.ctx.vehicles.get(e)) out.push(e);
    }
  };
  eachDescendant(u, add);
  return out.length;
}
