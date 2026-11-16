/* =====================================================================================
 * FORCES DE L'ORDRE — comportement individuel (réflexion de chaque agent, quelques fois par seconde) :
 *
 *   bouclier levé quand des projectiles arrivent, au contact de la foule, pendant un bond ou une
 *   vague ; accroupi derrière le bouclier sous les mortiers d'artifice (tortue réflexe) et en tortue ;
 *   masque à gaz mis quand le gaz atteint l'agent ou que l'unité l'ordonne (8 s, décalées d'un agent
 *   à l'autre), retiré après une minute d'air pur ;
 *   écart d'une nappe de feu ou du point de chute d'un engin incendiaire, puis retour à sa place ;
 *   le porte-extincteur éteint un collègue en feu en moins de 3 s ; un agent en feu recule ;
 *   au contact : coup de bouclier pour repousser, bâton ou gazeuse contre un agresseur — chaque
 *   emploi passe par le contrôle de licéité de force.ts ;
 *   regard tourné vers la menace ; limites d'allure, contournement et déblocage (steer.ts).
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { Agent, FormGroup, Unit } from './brain';
import { ACT_NONE, CLS_FRONT, F_BOX, F_COLUMN, F_HOLD, F_SCREEN, F_TORTUE, OP_RESCUE, ROLE_COVER, ROLE_LEAD } from './brain';
import { lawful, recentViolence } from './force';
import { beginAct } from './weapons';
import type { Kernel } from './kernel';
import { navigate, refreshLimits } from './steer';
import * as T from './tuning';

const burningColleague = (p: Person): boolean => p.faction === 'police' && p.burning > 0.12;
const civilian = (p: Person): boolean => p.faction !== 'police' && p.custody === 'free' && p.vehicleId === 0 && p.posture !== 'down';

function hasCharge(p: Person): boolean {
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) if (inv[i].id === 'extincteur') return inv[i].count > 0 && inv[i].state > 0.02;
  return false;
}

/** La manœuvre en cours porte-t-elle l'unité au contact (bond, charge, vague) ? */
function pushing(u: Unit): boolean {
  const o = u.order;
  if (!o) return false;
  return (o.type === 'refoulement' || o.type === 'charge' || o.type === 'bond_offensif') && (u.phase === 'mouvement' || u.phase === 'action');
}

/** Posture du bouclier et accroupissement. */
function posture(k: Kernel, a: Agent, u: Unit, g: FormGroup | null): void {
  const p = a.p;
  const now = k.now;
  const tortue = g !== null && g.kind === F_TORTUE;
  const duck = now < u.duckUntil;
  a.crouch = (tortue || duck) && a.op === null && a.act === ACT_NONE;
  a.highGuard = tortue && a.rank > 0;
  if (!a.shield || p.carrying !== 0 || (a.op !== null && a.opRole === ROLE_LEAD)) return;
  const front = a.cls === CLS_FRONT || a.opRole === ROLE_COVER;
  const want = tortue || duck || now < a.alertUntil || now < u.shieldsUntil
    || (front && (u.sense.contact > 0 || (pushing(u) && u.order !== null && u.order.type !== 'charge')));
  if (a.act !== ACT_NONE) return;
  if (want && k.held(p) !== 'bouclier') k.ctx.actions.selectById(p, 'bouclier');
  if (p.alt !== want && k.held(p) === 'bouclier') k.ctx.actions.setAlt(p, want);
}

/** Masque à gaz : mis quand le gaz arrive (ou sur ordre de l'unité), retiré après une minute d'air pur. */
function mask(k: Kernel, a: Agent, u: Unit): void {
  const gear = k.gear;
  if (!gear) return;
  const p = a.p;
  const now = k.now;
  const ordered = u.masksAt > 0 && now - u.masksAt < 150;
  const need = ordered || p.gas > 0.1 || k.ctx.hazards.gasAt(p.x, p.z) > T.MASK_ON_GAS;
  if (need) {
    a.maskOffAt = now + T.MASK_OFF_DELAY;
    if (!p.look.gasMask && a.maskAt === 0 && gear.hasMask(p)) a.maskAt = now + T.MASK_DON_TIME * (0.8 + 0.2 * a.seed);
  }
  if (a.maskAt > 0 && now >= a.maskAt) {
    a.maskAt = 0;
    if (a.act === ACT_NONE) gear.setGasMask(p, true);
    else a.maskAt = now + 0.5;
  } else if (p.look.gasMask && !need && now > a.maskOffAt) {
    gear.setGasMask(p, false);
  }
}

/** Écart d'une zone dangereuse (feu, engin incendiaire qui arrive) : l'emplacement est décalé hors de la zone. */
function avoidDanger(k: Kernel, a: Agent, tx: number, tz: number): void {
  const dangers = k.dangers;
  const p = a.p;
  let ax = 0;
  let az = 0;
  for (let i = 0; i < dangers.length; i++) {
    const d = dangers[i];
    const dx = tx - d.x;
    const dz = tz - d.z;
    const r = d.r + 0.5;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    const dist = Math.sqrt(d2);
    // on s'écarte dans la direction déjà la plus courte ; pile au centre : vers l'arrière de l'agent
    let ux: number;
    let uz: number;
    if (dist > 0.15) {
      ux = dx / dist;
      uz = dz / dist;
    } else {
      ux = -Math.sin(p.heading);
      uz = -Math.cos(p.heading);
    }
    ax += ux * (r - dist + 0.4);
    az += uz * (r - dist + 0.4);
  }
  if (p.burning > 0.15) {
    // en feu : deux rangs en arrière, vers le porte-extincteur
    ax -= Math.sin(a.sh) * 3;
    az -= Math.cos(a.sh) * 3;
  }
  if (ax !== 0 || az !== 0) {
    a.avoidX = ax;
    a.avoidZ = az;
    a.avoidUntil = k.now + 1.2;
  }
}

/** Le porte-extincteur éteint un collègue en feu à portée. */
function quenchColleague(k: Kernel, a: Agent): boolean {
  const p = a.p;
  if (a.act !== ACT_NONE || (a.op !== null && a.opRole === ROLE_LEAD) || !hasCharge(p)) return false;
  const n = k.ctx.people.queryRadius(p.x, p.z, 9, k.people2, burningColleague);
  let best: Person | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = k.people2[i];
    if (q === p) continue;
    const d = (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  if (!best) return false;
  const d = Math.sqrt(bestD);
  if (d > 3.2) {
    // trop loin pour le jet : il s'approche
    a.postX = best.x - ((best.x - p.x) / d) * 2;
    a.postZ = best.z - ((best.z - p.z) / d) * 2;
    a.postUntil = k.now + 2.5;
    return true;
  }
  return beginAct(k, a, 'extincteur', '', best.x, best.y + 0.9, best.z, best.id);
}

/** Au contact : coup de bouclier pour repousser, bâton ou gazeuse contre un agresseur. */
function contact(k: Kernel, a: Agent, u: Unit): void {
  const p = a.p;
  const now = k.now;
  if (now < a.contactAt || a.act !== ACT_NONE || p.carrying !== 0) return;
  if (a.op !== null && a.opRole !== ROLE_COVER) return;
  const list = k.people2;
  const n = k.ctx.people.queryRadius(p.x, p.z, T.GAZEUSE_RANGE, list, civilian);
  if (n === 0) return;
  const fx = Math.sin(a.face);
  const fz = Math.cos(a.face);
  const roe = k.ctx.law.roe;
  // refoulement licite : manœuvre en cours après les sommations, ou riposte
  const coercive = pushing(u) && (roe.underAttack || (roe.sommation === 3 && roe.lawfulForce >= 2));
  for (let i = 0; i < n; i++) {
    const q = list[i];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05 || (dx * fx + dz * fz) / d < 0.35) continue;
    const violent = recentViolence(q, now, T.VIOLENT_WINDOW) !== null;
    if (a.shield && k.held(p) === 'bouclier') {
      if (d < 1.1 && (violent || coercive) && lawful(k, a, 'contact', q, q.x, q.z)) {
        if (beginAct(k, a, 'bouclier', 'contact', q.x, q.y + 1, q.z, q.id)) a.contactAt = now + 1.8;
        return;
      }
      continue;
    }
    if (!violent) continue;
    if (d < T.BATON_RANGE && (k.count(p, 'tonfa') > 0 || k.count(p, 'baton') > 0) && lawful(k, a, 'baton', q, q.x, q.z)) {
      if (beginAct(k, a, k.count(p, 'tonfa') > 0 ? 'tonfa' : 'baton', 'baton', q.x, q.y + 0.8, q.z, q.id)) a.contactAt = now + 1.4;
      return;
    }
    if (d >= 1.2 && k.count(p, 'gazeuse') > 0 && a.p.poste !== 'lanceur' && a.p.poste !== 'lbd' && a.p.poste !== 'extincteur'
      && lawful(k, a, 'gazeuse', q, q.x, q.z)) {
      if (beginAct(k, a, 'gazeuse', 'gazeuse', q.x, q.y + 1.4, q.z, q.id)) a.contactAt = now + 3.5;
      return;
    }
  }
}

/** Réflexion d'un agent : posture, masque, dangers, contact, regard, navigation. */
export function thinkAgent(k: Kernel, a: Agent, interval: number): void {
  const u = a.root;
  if (!u) return;
  const p = a.p;
  const now = k.now;
  const g = a.group;
  if (now - a.limAt > 0.9) refreshLimits(k, a);

  // point visé par le déplacement
  let tx = a.sx;
  let tz = a.sz;
  let boarding = false;
  if (a.boardId !== 0) {
    const v = k.ctx.vehicles.get(a.boardId);
    if (v) {
      tx = v.x;
      tz = v.z;
      boarding = true;
    }
  } else if (a.op !== null) {
    tx = a.goalX;
    tz = a.goalZ;
  } else if (now < a.postUntil) {
    tx = a.postX;
    tz = a.postZ;
  }
  // allure maximale pour rejoindre : la formation en marche impose la sienne ; la fatigue ralentit
  const tired = 1 - 0.3 * u.fatigue;
  if (a.op !== null) a.vcap = (a.goalRun ? 3.6 : 1.6) * tired;
  else if (g && g.moving) a.vcap = g.speed * 1.4 + 0.3;
  else a.vcap = T.SPEED_JOIN * tired;

  // écran ou escorte : l'élément protégé se contourne, on ne le bouscule pas
  a.obR = 0;
  if (g && g.followId !== 0 && (g.kind === F_SCREEN || g.kind === F_BOX) && a.op === null) {
    const tv = k.ctx.vehicles.get(g.followId);
    const tp = tv ? undefined : k.ctx.people.get(g.followId);
    if (tv) {
      a.obX = tv.x;
      a.obZ = tv.z;
      a.obR = Math.hypot(tv.def.length, tv.def.width) * 0.5 + 0.7;
    } else if (tp) {
      a.obX = tp.x;
      a.obZ = tp.z;
      a.obR = 1.0;
    }
  }

  posture(k, a, u, g);
  mask(k, a, u);
  if (a.op === null || a.opRole === ROLE_COVER) avoidDanger(k, a, tx, tz);
  if (a.op === null || a.op.kind !== OP_RESCUE) quenchColleague(k, a);
  if (u.sense.contact > 0 || u.sense.violent > 0) contact(k, a, u);

  // désordre de l'unité bousculée : chacun dérive autour de sa place
  if (u.disorder > 0.02) {
    const ang = a.seed * 6.283 + Math.floor(now * 0.5 + a.seed * 7) * 2.4;
    a.jx = Math.sin(ang) * T.DISORDER_SPREAD * u.disorder;
    a.jz = Math.cos(ang) * T.DISORDER_SPREAD * u.disorder;
  } else if (a.jx !== 0 || a.jz !== 0) {
    a.jx = 0;
    a.jz = 0;
  }

  // regard : cap de la formation ; hors formation alignée, vers la foule proche
  if (a.op !== null) {
    if (a.opRole === ROLE_COVER) a.face = Math.atan2(u.sense.cx - p.x, u.sense.cz - p.z);
    else a.face = Math.atan2(a.op.x - p.x, a.op.z - p.z);
  } else if (g && g.kind === F_HOLD && u.sense.crowd > 0) {
    a.face = Math.atan2(u.sense.cx - p.x, u.sense.cz - p.z);
  } else {
    a.face = a.sh;
  }

  if (!a.hold && (a.op !== null || a.hasSlot || boarding)) navigate(k, a, tx, tz, interval);
}

/** L'agent regarde-t-il où il va (colonne en marche) plutôt que vers la menace ? */
export function looksAhead(a: Agent): boolean {
  const g = a.group;
  return g !== null && g.kind === F_COLUMN;
}
