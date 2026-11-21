/* =====================================================================================
 * FORCES DE L'ORDRE — actions d'arme et riposte de l'unité.
 *
 *   action d'arme  prise en main, visée résolue par ctx.actions.solveAim (tir en cloche des
 *                  grenades), attente de l'alignement de la visée, DERNIER contrôle de licéité à
 *                  l'instant d'agir, emploi par ctx.actions.use, retour de l'objet d'origine. Tir
 *                  tendu (LBD, gazeuse) : jamais avec un collègue dans l'axe — le tireur gagne un
 *                  créneau entre deux boucliers ;
 *   salve de gaz   point de chute décalé AU VENT, à distance de sécurité des lignes ; masques mis
 *                  avant le tir si le vent doit ramener le gaz ; grenades à main jusqu'à 28 m,
 *                  lanceur de 56 mm au-delà ;
 *   LBD            un tireur habilité, sur un individu désigné, auteur de violences à l'instant ;
 *   riposte        compte rendu, avertissement à la foule, lacrymogènes, LBD si l'ordre le permet,
 *                  grenade de désencerclement seulement en cas d'encerclement réel.
 * Plafond de force, licéité et perception : force.ts.
 * ===================================================================================== */

import type { ForceMeans, ItemId, Person } from '@/core/contracts';
import { angleDiff } from '@/core/math';
import { FORCE_USED_EVENT } from './api';
import type { Agent, Unit } from './brain';
import { ACT_AIM, ACT_NONE, ACT_RECOVER, ACT_SELECT } from './brain';
import { forceCap, lawful, recentViolence } from './force';
import type { Kernel } from './kernel';
import { report } from './mcore';
import { attackReport, frame, spell, superior } from './radio';
import * as T from './tuning';

// ───────────────────────────── action d'arme d'un agent ─────────────────────────────

/** Engage une action d'arme : prise en main, visée, emploi, retour de l'objet d'origine. */
export function beginAct(k: Kernel, a: Agent, item: ItemId, means: ForceMeans | '', tx: number, ty: number, tz: number, targetId: number): boolean {
  if (a.act !== ACT_NONE || !a.able || a.p.isPlayer) return false;
  if (k.count(a.p, item) <= 0) return false;
  const held = k.held(a.p);
  a.act = ACT_SELECT;
  a.actItem = item;
  a.actMeans = means;
  a.actT = k.now;
  a.actTx = tx;
  a.actTy = ty;
  a.actTz = tz;
  a.actTarget = targetId;
  a.actRestore = held !== item ? held : '';
  a.actDone = false;
  return true;
}

export function cancelAct(k: Kernel, a: Agent): void {
  if (a.act === ACT_NONE) return;
  if (a.actRestore !== '' && k.count(a.p, a.actRestore) > 0 && a.able) k.ctx.actions.selectById(a.p, a.actRestore);
  else if (a.actRestore === '' && a.actItem !== '' && k.held(a.p) === a.actItem && a.actItem !== 'bouclier' && a.p.poste !== 'lanceur'
    && a.p.poste !== 'lbd' && a.p.poste !== 'extincteur') {
    k.ctx.actions.select(a.p, -1);
  }
  a.act = ACT_NONE;
  a.actItem = '';
  a.actTarget = 0;
  a.postUntil = 0;
}

/** Un collègue se trouve-t-il dans l'axe du tir (couloir de 0,5 m sur les premiers mètres) ? */
function friendInLine(k: Kernel, p: Person, tx: number, tz: number, reach: number): boolean {
  let dx = tx - p.x;
  let dz = tz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.5) return false;
  dx /= d;
  dz /= d;
  const len = d < reach ? d : reach;
  const list = k.people2;
  const n = k.ctx.people.queryRadius(p.x + dx * len * 0.5, p.z + dz * len * 0.5, len * 0.5 + 0.6, list);
  for (let i = 0; i < n; i++) {
    const q = list[i];
    if (q === p || q.faction !== 'police' || q.posture === 'down') continue;
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const along = ex * dx + ez * dz;
    if (along < 0.2 || along > len) continue;
    if (Math.abs(ex * dz - ez * dx) < q.radius + 0.22) return true;
  }
  return false;
}

/** Créneau entre deux boucliers le plus proche de l'agent, un pas devant le premier rang. */
function firingPost(a: Agent): boolean {
  const g = a.group;
  if (!g || g.front.length < 2) return false;
  const front = g.front;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i + 1 < front.length; i++) {
    const mx = (front[i].sx + front[i + 1].sx) * 0.5;
    const mz = (front[i].sz + front[i + 1].sz) * 0.5;
    const d = (mx - a.p.x) * (mx - a.p.x) + (mz - a.p.z) * (mz - a.p.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return false;
  const fx = Math.sin(g.ah);
  const fz = Math.cos(g.ah);
  a.postX = (front[best].sx + front[best + 1].sx) * 0.5 + fx * 0.45;
  a.postZ = (front[best].sz + front[best + 1].sz) * 0.5 + fz * 0.45;
  return true;
}

function isDirect(item: ItemId | ''): boolean {
  return item === 'lbd40' || item === 'gazeuse';
}

/** Compte rendu d'un emploi de la force par l'agent (événement libre ; radio pour le LBD). */
function onUsed(k: Kernel, a: Agent): void {
  const u = a.root;
  if (!u || a.actMeans === '') return;
  const p = a.p;
  k.emit(FORCE_USED_EVENT, { squadId: a.home ? a.home.id : u.id, means: a.actMeans, x: a.actTx, z: a.actTz, byId: p.id });
  // une salve partie : on observe son effet avant la suivante (la fatigue allonge l'intervalle)
  if (a.actMeans === 'lacrymo') {
    const next = k.now + T.VOLLEY_INTERVAL * (1 + 0.5 * u.fatigue) - 2;
    if (next > u.volleyAt) u.volleyAt = next;
  }
  if (a.actMeans === 'lbd') {
    const d = Math.round(Math.sqrt((a.actTx - p.x) * (a.actTx - p.x) + (a.actTz - p.z) * (a.actTz - p.z)));
    const home = a.home ?? u;
    k.say(home, frame(superior(k, home, u.order), home.squad.name,
      'UN tir de lanceur de balles de défense, cadre riposte, objectif désigné, ' + spell(d) + ' mètres. Je fais vérifier l’état de l’individu', true), 1, 'unite');
  }
}

/** Fait avancer l'action d'arme d'un agent (appelé à chaque pas tant qu'elle est en cours). */
export function updateAct(k: Kernel, a: Agent): void {
  const p = a.p;
  const ctx = k.ctx;
  if (!a.able) {
    cancelAct(k, a);
    return;
  }
  const now = k.now;
  if (a.act === ACT_SELECT) {
    if (k.held(p) !== a.actItem && !ctx.actions.selectById(p, a.actItem)) {
      cancelAct(k, a);
      return;
    }
    a.act = ACT_AIM;
    return;
  }
  if (a.act === ACT_AIM) {
    let target: Person | null = null;
    if (a.actTarget !== 0) {
      target = ctx.people.get(a.actTarget) ?? null;
      if (!target || target.dormant) {
        cancelAct(k, a);
        return;
      }
      a.actTx = target.x;
      a.actTz = target.z;
      // hauteur visée : jamais au-dessus des épaules (bassin debout, plus bas si la personne est accroupie)
      const zone = a.actItem === 'lbd40' ? (target.posture === 'crouch' ? 0.3 : T.LBD_AIM_ZONE) : 0.45;
      a.actTy = target.y + target.look.height * zone;
    }
    if (now - a.actT > 7) {
      cancelAct(k, a);
      return;
    }
    const sol = k.aim;
    if (!ctx.actions.solveAim(p, a.actTx, a.actTy, a.actTz, sol)) {
      // hors de portée (ou objet pas encore en main) : on laisse une seconde, puis on renonce
      if (now - a.actT > 1.6) cancelAct(k, a);
      return;
    }
    const cmd = p.cmd;
    cmd.aimYaw = sol.yaw;
    cmd.aimPitch = sol.pitch;
    cmd.faceMove = false;
    if (Math.abs(angleDiff(p.aimYaw, sol.yaw)) > 0.04 || Math.abs(p.aimPitch - sol.pitch) > 0.04) return;
    if (!ctx.actions.canUse(p)) return;
    // tir tendu : un créneau dégagé, sinon l'agent gagne un créneau de la ligne
    if (isDirect(a.actItem) && friendInLine(k, p, a.actTx, a.actTz, 7)) {
      if (a.postUntil < now && firingPost(a)) a.postUntil = now + 6;
      return;
    }
    // dernier contrôle au moment d'agir : le cadre peut avoir changé depuis la décision
    if (a.actMeans !== '' && !lawful(k, a, a.actMeans, target, a.actTx, a.actTz)) {
      cancelAct(k, a);
      return;
    }
    if (target && a.actItem === 'lbd40') {
      const d2 = (target.x - p.x) * (target.x - p.x) + (target.z - p.z) * (target.z - p.z);
      if (d2 < T.LBD_MIN * T.LBD_MIN || d2 > T.LBD_MAX * T.LBD_MAX || target.vx * target.vx + target.vz * target.vz > T.LBD_TARGET_SPEED * T.LBD_TARGET_SPEED
        || !k.sight(p.x, p.z, target.x, target.z)) {
        cancelAct(k, a);
        return;
      }
    }
    const res = ctx.actions.use(p, { power: sol.power, targetId: a.actTarget });
    if (res.ok) {
      a.actDone = true;
      a.act = ACT_RECOVER;
      a.actUntil = now + (a.actItem === 'extincteur' || a.actItem === 'gazeuse' ? 1.05 : 0.9);
      onUsed(k, a);
    } else if (res.reason !== 'cooldown') {
      cancelAct(k, a);
    }
    return;
  }
  if (a.act === ACT_RECOVER && now >= a.actUntil) cancelAct(k, a);
}

// ───────────────────────────── décisions de l'unité ─────────────────────────────

const AVERTISSEMENT_GAZ = 'Attention, nous allons employer des grenades lacrymogènes. Écartez-vous.';

/** Barycentre des agents valides (dans k.v2). */
function center(k: Kernel, u: Unit): boolean {
  let x = 0;
  let z = 0;
  let n = 0;
  for (let i = 0; i < u.agents.length; i++) {
    const a = u.agents[i];
    if (!a.able) continue;
    x += a.p.x;
    z += a.p.z;
    n++;
  }
  if (n === 0) return false;
  k.v2.x = x / n;
  k.v2.z = z / n;
  return true;
}

/**
 * Salve de lacrymogènes vers (tx, tz) : point de chute décalé au vent, à distance de sécurité de nos
 * lignes ; si le vent doit ramener le gaz sur l'unité, les masques sont d'abord mis. Retourne le nombre
 * de tireurs engagés (0 : rien de possible maintenant). `within` : restreint aux agents de cette unité.
 */
export function gasVolley(k: Kernel, u: Unit, tx: number, tz: number, maxShots: number, within: Unit | null): number {
  if (!center(k, u)) return 0;
  const cx = k.v2.x;
  const cz = k.v2.z;
  const env = k.ctx.env.state;
  const w = Math.sqrt(env.windX * env.windX + env.windZ * env.windZ);
  let ax = tx;
  let az = tz;
  let wx = 0;
  let wz = 0;
  if (w > T.WIND_MATTERS) {
    // le nuage dérive à 0,8 fois le vent : on vise en amont pour qu'il passe sur l'objectif
    wx = env.windX / w;
    wz = env.windZ / w;
    const lead = Math.min(8, 2 + 2 * w);
    ax -= wx * lead;
    az -= wz * lead;
  }
  let dx = ax - cx;
  let dz = az - cz;
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d < T.GAS_SAFE_DISTANCE) {
    if (d < 0.5) return 0;
    ax = cx + (dx / d) * T.GAS_SAFE_DISTANCE;
    az = cz + (dz / d) * T.GAS_SAFE_DISTANCE;
    dx = ax - cx;
    dz = az - cz;
    d = T.GAS_SAFE_DISTANCE;
  }
  // retour de gaz : le vent porte du point de chute vers l'unité, et le nuage arrive avant de se dissiper
  if (w > T.WIND_MATTERS && -(wx * dx + wz * dz) / d > 0.5 && d / (0.8 * w) < 60) {
    if (u.masksAt === 0 || k.now - u.masksAt > 120) {
      u.masksAt = k.now;
      if (k.now - u.windReportAt > 60) {
        u.windReportAt = k.now;
        report(k, u, 'Vent de face, retour de gaz probable sur la ligne. Je fais mettre les masques');
      }
    }
    if (k.now - u.masksAt < T.MASK_DON_TIME + 1.5) return 0;
  }
  let shots = 0;
  const agents = u.agents;
  // perpendiculaire au tir : les grenades sont réparties de part et d'autre du point visé
  const px = -dz / d;
  const pz = dx / d;
  const y = k.ctx.world.heightAt(ax, az);
  for (let i = 0; i < agents.length && shots < maxShots; i++) {
    const a = agents[i];
    if (!a.able || a.act !== ACT_NONE || a.op !== null || a.p.isPlayer) continue;
    if (within && !isUnderHome(a, within)) continue;
    const p = a.p;
    const off = shots === 0 ? 0 : (shots & 1 ? 5 : -5) * ((shots + 1) >> 1);
    let gx = ax + px * off;
    let gz = az + pz * off;
    const da = Math.sqrt((gx - p.x) * (gx - p.x) + (gz - p.z) * (gz - p.z));
    if (da >= T.HAND_GRENADE_MIN && da <= T.HAND_GRENADE_MAX + 7 && k.count(p, 'grenade_lacrymo') > 0) {
      // un peu trop loin pour le bras : la grenade est lancée au plus loin, dans l'axe du point visé
      if (da > T.HAND_GRENADE_MAX) {
        const f = (T.HAND_GRENADE_MAX - 0.5) / da;
        gx = p.x + (gx - p.x) * f;
        gz = p.z + (gz - p.z) * f;
      }
      if (beginAct(k, a, 'grenade_lacrymo', 'lacrymo', gx, y, gz, 0)) shots++;
    } else if (da >= T.LAUNCHER_MIN && da <= T.LAUNCHER_MAX && k.count(p, 'lanceur_cougar') > 0) {
      if (beginAct(k, a, 'lanceur_cougar', 'lacrymo', gx, y, gz, 0)) shots++;
    }
  }
  return shots;
}

function isUnderHome(a: Agent, unit: Unit): boolean {
  for (let x = a.home, guard = 0; x && guard < 16; x = x.parent, guard++) if (x === unit) return true;
  return false;
}

/** Tir de LBD sur l'individu désigné par le superviseur. Retourne true si un tireur est engagé. */
export function lbdShot(k: Kernel, u: Unit, target: Person): boolean {
  const agents = u.agents;
  let best: Agent | null = null;
  let bestD = Infinity;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.able || a.act !== ACT_NONE || a.op !== null || a.p.isPlayer || k.count(a.p, 'lbd40') <= 0) continue;
    const d = Math.sqrt((target.x - a.p.x) * (target.x - a.p.x) + (target.z - a.p.z) * (target.z - a.p.z));
    if (d < T.LBD_MIN || d > T.LBD_MAX) continue;
    if (Math.abs(d - 28) < bestD) {
      bestD = Math.abs(d - 28);
      best = a;
    }
  }
  if (!best) return false;
  if (!lawful(k, best, 'lbd', target, target.x, target.z)) {
    // le droit ne juge le tir qu'avec le lanceur en main : sans service de conseil, on s'en tient au plafond
    return false;
  }
  return beginAct(k, best, 'lbd40', 'lbd', target.x, target.y + target.look.height * T.LBD_AIM_ZONE, target.z, target.id);
}

function bitCount4(v: number): number {
  return (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);
}

/**
 * Riposte de l'unité aux violences qu'elle subit (appelée quelques fois par seconde) : compte rendu,
 * avertissement, lacrymogènes sur la concentration hostile, LBD sur un individu identifié, grenade de
 * désencerclement si l'unité est réellement encerclée.
 */
export function decideForce(k: Kernel, u: Unit): void {
  const s = u.sense;
  const now = k.now;
  const attacked = now - s.lastIncomingAt < 12 || now - s.hurtAt < 12;
  if (!attacked) return;
  if (now - u.attackReportAt > 60) {
    u.attackReportAt = now;
    let hurt = 0;
    for (let i = 0; i < u.agents.length; i++) if (u.agents[i].p.injury !== 'none') hurt++;
    k.say(u, attackReport(k, u, superior(k, u, u.order), hurt), hurt > 0 ? 2 : 1, u.parent ? 'unite' : 'commandement');
  }
  if (!k.tuning.autoRiposte) return;
  const cap = forceCap(k, u);
  const sustained = s.incoming >= T.RIPOSTE_PROJECTILES || now - s.hurtAt < 12 || s.mortars > 0;
  if (sustained && cap >= 3) {
    const tx = s.violent > 0 ? s.vx : s.ox;
    const tz = s.violent > 0 ? s.vz : s.oz;
    if (now - u.warnedAt > 90) {
      // avertissement à la foule avant d'employer la force, chaque fois que c'est possible
      u.warnedAt = now;
      u.volleyAt = now + T.WARNING_DELAY;
      k.ctx.radio.say({ channel: 'public', from: u.squad.name, text: AVERTISSEMENT_GAZ, priority: 1, personId: u.squad.leaderId || undefined });
      report(k, u, 'Violences sur l’unité. J’emploie la force d’initiative, cadre violences et voies de fait. Avertissement fait à la foule');
    } else if (now >= u.volleyAt) {
      // l'intervalle complet entre deux salves court à partir du départ effectif d'une grenade (onUsed)
      u.volleyAt = now + (gasVolley(k, u, tx, tz, 2, null) > 0 ? 4 : 1.5);
    }
  }
  if (cap >= 4 && s.lbdTargetId !== 0 && now >= u.lbdAt) {
    const target = k.ctx.people.get(s.lbdTargetId);
    if (target && recentViolence(target, now, T.VIOLENT_WINDOW) && lbdShot(k, u, target)) u.lbdAt = now + 6;
    else u.lbdAt = now + 1;
  }
  // encerclement réel : hostiles violents au contact dans trois quadrants au moins
  if (cap >= 4 && s.around >= T.SURROUNDED_COUNT && bitCount4(s.quadrants) >= 3) desencerclement(k, u);
}

function desencerclement(k: Kernel, u: Unit): void {
  const s = u.sense;
  for (let i = 0; i < u.agents.length; i++) {
    const a = u.agents[i];
    if (!a.able || a.act !== ACT_NONE || a.op !== null || a.p.isPlayer || k.count(a.p, 'grenade_desencerclement') <= 0) continue;
    if (a.contactAt > k.now) continue;
    const p = a.p;
    let dx = s.vx - p.x;
    let dz = s.vz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1) continue;
    dx /= d;
    dz /= d;
    const reach = d < 9 ? Math.max(6.5, d) : 9;
    const tx = p.x + dx * reach;
    const tz = p.z + dz * reach;
    if (!lawful(k, a, 'desencerclement', null, tx, tz)) return;
    if (beginAct(k, a, 'grenade_desencerclement', 'desencerclement', tx, p.y, tz, 0)) {
      a.contactAt = k.now + 20;
      // une seule grenade : les autres porteurs attendent de voir l'effet
      for (let j = 0; j < u.agents.length; j++) if (u.agents[j].contactAt < k.now + 15 && k.count(u.agents[j].p, 'grenade_desencerclement') > 0) u.agents[j].contactAt = k.now + 15;
      report(k, u, 'Unité encerclée et prise à partie. Grenade de désencerclement lancée au ras du sol', 2);
    }
    return;
  }
}
