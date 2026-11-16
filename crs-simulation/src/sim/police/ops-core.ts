/* =====================================================================================
 * FORCES DE L'ORDRE — opérations détachées, outils communs : choix des agents (le plus proche,
 * libre, du bon poste), engagement et retour au rang, couverture par deux boucliers, porte ouverte
 * dans la ligne, fin d'opération, point d'approche d'un véhicule.
 * ===================================================================================== */

import type { Person, Vehicle } from '@/core/contracts';
import type { Agent, Op, Unit } from './brain';
import { ACT_NONE, CLS_FRONT, CLS_SECOND, F_LINE, F_TORTUE, ROLE_COVER } from './brain';
import type { Kernel } from './kernel';
import * as T from './tuning';

// ───────────────────────────── choix des agents ─────────────────────────────

export function isUnder(a: Agent, unit: Unit | null): boolean {
  if (!unit) return true;
  for (let x = a.home, guard = 0; x && guard < 16; x = x.parent, guard++) if (x === unit) return true;
  return false;
}

export function free(a: Agent): boolean {
  return a.able && a.op === null && a.act === ACT_NONE && !a.p.isPlayer && a.boardId === 0 && a.p.carrying === 0;
}

/** Agent libre le plus proche de (x, z) parmi ceux du poste donné (`poste` null : n'importe quel équipier du second rang). */
export function nearest(root: Unit, within: Unit | null, x: number, z: number, accept: (a: Agent) => boolean, skip: Agent | null): Agent | null {
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

export const isCatcher = (a: Agent): boolean => a.p.poste === 'interpellation' || a.p.poste === 'passager_moto';
export const isHelper = (a: Agent): boolean =>
  a.baseCls === CLS_SECOND && a.p.poste !== 'lanceur' && a.p.poste !== 'lbd' && a.p.poste !== 'extincteur' && a.p.poste !== 'chef_groupe';
export const isShield = (a: Agent): boolean => a.baseCls === CLS_FRONT && a.shield;
export const anyTrooper = (a: Agent): boolean => a.baseCls === CLS_FRONT || a.baseCls === CLS_SECOND;

export function engage(op: Op, a: Agent | null, role: number): void {
  if (!a) return;
  a.op = op;
  a.opRole = role;
  a.hold = false;
  a.goalRun = role !== ROLE_COVER;
  a.goalX = a.p.x;
  a.goalZ = a.p.z;
  a.pathN = 0;
}

export function release(a: Agent | null): void {
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

export function countFrontAble(root: Unit): number {
  let n = 0;
  for (let i = 0; i < root.agents.length; i++) if (root.agents[i].able && isShield(root.agents[i])) n++;
  return n;
}

/** Deux boucliers de couverture, pris au plus près, si la ligne en garde assez pour tenir. */
export function takeCover(op: Op, x: number, z: number, within: Unit | null): void {
  const root = op.root;
  if (countFrontAble(root) < 5) return;
  op.cover1 = nearest(root, within, x, z, isShield, null) ?? nearest(root, null, x, z, isShield, null);
  engage(op, op.cover1, ROLE_COVER);
  op.cover2 = nearest(root, within, x, z, isShield, op.cover1) ?? nearest(root, null, x, z, isShield, op.cover1);
  engage(op, op.cover2, ROLE_COVER);
}

/** Ouvre une porte dans la ligne à l'aplomb du point visé (le binôme sort entre deux boucliers). */
export function openDoor(k: Kernel, a: Agent, x: number, z: number, seconds: number): void {
  const g = a.group;
  if (!g || (g.kind !== F_LINE && g.kind !== F_TORTUE) || g.front.length < 3) return;
  const lat = (x - g.ax) * -Math.cos(g.ah) + (z - g.az) * Math.sin(g.ah);
  const half = g.width * 0.5 - 0.6;
  g.doorX = lat < -half ? -half : lat > half ? half : lat;
  g.doorW = T.DOOR_WIDTH;
  g.doorUntil = k.now + seconds;
  g.dirty = true;
}

export function setGoal(a: Agent | null, x: number, z: number): void {
  if (!a) return;
  a.goalX = x;
  a.goalZ = z;
  a.hold = false;
}

export function finish(k: Kernel, op: Op, ok: boolean, reason: string): void {
  if (op.done) return;
  op.done = true;
  op.ok = ok;
  op.reason = reason;
  releaseAll(op);
  const lead = op.lead;
  if (lead && k.ctx.interactions.current(lead.p)) k.ctx.interactions.cancel(lead.p);
}

export function busy(k: Kernel, a: Agent): boolean {
  return k.ctx.interactions.current(a.p) !== null;
}

export function nextStage(k: Kernel, op: Op, stage: number): void {
  op.stage = stage;
  op.stageT = k.now;
  op.tries = 0;
  op.nextAt = 0;
}

export function dist(a: Person, x: number, z: number): number {
  return Math.sqrt((a.x - x) * (a.x - x) + (a.z - z) * (a.z - z));
}

/**
 * Point où se présenter près d'un véhicule : son flanc gauche, son flanc droit ou son arrière, au plus près
 * de la personne (écrit dans k.v2). On n'a jamais à contourner la caisse.
 */
export function approachPoint(k: Kernel, v: Vehicle, from: Person): void {
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const rx = -fz;
  const rz = fx;
  const side = v.def.width * 0.5 + 1.15;
  const back = v.def.length * 0.5 + 1.3;
  const world = k.ctx.world;
  let best = Infinity;
  let bx = v.x - fx * back;
  let bz = v.z - fz * back;
  for (let i = 0; i < 3; i++) {
    const x = i === 0 ? v.x - fx * back : v.x + rx * (i === 1 ? side : -side);
    const z = i === 0 ? v.z - fz * back : v.z + rz * (i === 1 ? side : -side);
    if (!world.isFree(x, z, 0.3)) continue;
    const d = (x - from.x) * (x - from.x) + (z - from.z) * (z - from.z);
    if (d < best) {
      best = d;
      bx = x;
      bz = z;
    }
  }
  k.v2.x = bx;
  k.v2.z = bz;
}
