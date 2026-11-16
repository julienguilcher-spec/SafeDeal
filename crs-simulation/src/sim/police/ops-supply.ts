/* =====================================================================================
 * FORCES DE L'ORDRE — ravitaillement, dégagement d'une barricade, dispersion au gaz sur ordre.
 *
 *   ravitaillement  l'agent va au fourgon compléter la dotation de son poste ; la réserve du
 *                   véhicule est décomptée ; trois agents au plus hors du rang à la fois ;
 *   dégagement      jusqu'à six agents démontent l'obstacle à la main (verbe « degager ») ;
 *   gaz sur ordre   refusé si l'ordre ou le cadre légal ne permettent pas le niveau 3 ; sinon
 *                   avertissement à la foule, puis salves espacées tant que la zone reste occupée.
 * ===================================================================================== */

import type { EntityId, ItemId, Person, Prop, Vehicle } from '@/core/contracts';
import { ORDER_REFUSED_EVENT } from './api';
import type { VehicleReserve } from './api';
import type { Agent, Op, Unit } from './brain';
import { OP_CLEAR, OP_RESUPPLY, ROLE_LEAD, ROLE_SECOND, createOp } from './brain';
import { forceCap } from './force';
import { gasVolley } from './weapons';
import type { Kernel } from './kernel';
import { anyTrooper, approachPoint, busy, dist, engage, finish, free, isCatcher, isHelper, isUnder, nearest, nextStage, setGoal } from './ops-core';
import { extinguisherLeft } from './ops-rescue';
import { negative, spell } from './radio';
import { fullLoad } from './roster';
import * as T from './tuning';

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
    const have = SUPPLY[i][0] === 'extincteur' ? extinguisherLeft(p) : k.count(p, SUPPLY[i][0]);
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
  op.taskAt = owner.task ? owner.task.issuedAt : -1;
  op.lead = a;
  op.destId = v.id;
  engage(op, a, ROLE_LEAD);
  a.goalRun = false;
  root.ops.push(op);
  return op;
}

export function updateResupply(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const a = op.lead;
  const v = ctx.vehicles.get(op.destId);
  if (!a || !a.able || !v) {
    finish(k, op, false, '');
    return;
  }
  const p = a.p;
  if (op.destX === 0 && op.destZ === 0) {
    approachPoint(k, v, p);
    op.destX = k.v2.x;
    op.destZ = k.v2.z;
  }
  const gx = op.destX;
  const gz = op.destZ;
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
        const have = id === 'extincteur' ? extinguisherLeft(p) : k.count(p, id);
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

/** Envoie au ravitaillement les agents à qui il manque quelque chose, quelques-uns à la fois. Retourne false s'il n'y a plus rien à faire. */
export function resupplyNext(k: Kernel, owner: Unit): boolean {
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
      const have = SUPPLY[j][0] === 'extincteur' ? extinguisherLeft(a.p) : k.count(a.p, SUPPLY[j][0]);
      if (have < full && (r[SUPPLY[j][1]] as number) > 0) useful = true;
    }
    if (!useful) continue;
    createResupply(k, root, owner, a, v);
    started++;
  }
  return running + started > 0;
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

export function updateClear(k: Kernel, op: Op): void {
  const ctx = k.ctx;
  const now = k.now;
  const prop = ctx.props.get(op.targetId);
  if (!clearable(prop)) {
    finish(k, op, true, '');
    return;
  }
  // objet redressé ou remis en état : plus rien à dégager
  if (op.count > 0 && prop.kind !== 'barricade' && prop.kind !== 'debris' && !prop.toppled && prop.state !== 'broken' && prop.state !== 'burnt') {
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
export const isParticipant = (p: Person): boolean => p.faction === 'protest' && p.custody === 'free' && p.posture !== 'down';

export function updateGas(k: Kernel, op: Op): void {
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
