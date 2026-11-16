/* =====================================================================================
 * FORCES DE L'ORDRE — emploi gradué de la force, strictement dans le cadre.
 *
 * Plafond : un agent n'emploie jamais un moyen au-dessus de min(ordre.maxForce, roe.lawfulForce),
 * sauf riposte immédiate et proportionnée (jusqu'aux lacrymogènes) quand des violences viennent
 * d'être exercées contre son unité. Avant chaque emploi au-dessus du contact, le verdict du module
 * de droit est demandé à blanc ('law.advisor') : pas de verdict « licite », pas de tir.
 *
 * Gradation (docs/research/00-bible-realisme.md §A) : présence → boucliers levés → avertissement à
 * la foule → grenades lacrymogènes (à main jusqu'à 28 m, au lanceur de 56 mm au-delà, tir en
 * cloche calculé par ctx.actions.solveAim, point de chute décalé AU VENT et masques mis si le gaz
 * doit revenir sur la ligne) → LBD sur un individu identifié, auteur de violences constatées à
 * l'instant, entre 11 et 45 m, visé au bassin, immobile ou lent, depuis un créneau de la ligne →
 * grenade de désencerclement seulement si l'unité est réellement encerclée. L'arme de service
 * n'est jamais employée par l'IA.
 * ===================================================================================== */

import type { ForceLevel, ForceMeans, Offense, Person } from '@/core/contracts';
import { FORCE_LEVEL_OF } from '@/core/contracts';
import type { Agent, FormGroup, Unit } from './brain';
import { F_NONE } from './brain';
import type { Kernel } from './kernel';
import * as T from './tuning';

// ───────────────────────────── plafond de force ─────────────────────────────

/** Des violences ont-elles visé l'unité à l'instant (cadre de la riposte directe) ? */
export function underAttack(k: Kernel, u: Unit): boolean {
  const roe = k.ctx.law.roe;
  if (!roe.underAttack) return false;
  const s = u.sense;
  if (k.now - s.lastIncomingAt < 30 || k.now - s.hurtAt < 30) return true;
  const g = u.groups.length > 0 ? u.groups[0] : null;
  return !!g && !!k.advisor && k.advisor.riposteAt(g.ax, g.az);
}

/** Niveau de force que l'unité s'autorise : ordre reçu, cadre légal, riposte immédiate. */
export function forceCap(k: Kernel, u: Unit): ForceLevel {
  const roe = k.ctx.law.roe;
  const ordered = u.squad.order.maxForce;
  let cap: ForceLevel = ordered < roe.lawfulForce ? ordered : roe.lawfulForce;
  if (underAttack(k, u)) {
    const r: ForceLevel = roe.lawfulForce < 3 ? roe.lawfulForce : 3;
    if (r > cap) cap = r;
  }
  return cap;
}

function capOfAgent(k: Kernel, a: Agent): ForceLevel {
  const home = a.home;
  const root = a.root;
  if (!home || !root) return 1;
  const roe = k.ctx.law.roe;
  const ordered = home.squad.order.maxForce;
  let cap: ForceLevel = ordered < roe.lawfulForce ? ordered : roe.lawfulForce;
  if (underAttack(k, root)) {
    const r: ForceLevel = roe.lawfulForce < 3 ? roe.lawfulForce : 3;
    if (r > cap) cap = r;
  }
  return cap;
}

/** Cet emploi serait-il licite maintenant (plafond de l'unité, puis verdict à blanc du droit) ? */
export function lawful(k: Kernel, a: Agent, means: ForceMeans, target: Person | null, x: number, z: number): boolean {
  if (means === 'arme_feu') return false;
  if (FORCE_LEVEL_OF[means] > capOfAgent(k, a)) return false;
  if (target && (target.custody !== 'free' || target.posture === 'down' || target.faction === 'police')) {
    if (means !== 'contact') return false;
  }
  const advisor = k.advisor;
  if (advisor) return advisor.assess(a.p, means, target, x, z).kind === 'licite';
  return true;
}

// ───────────────────────────── violences constatées ─────────────────────────────

function isViolentType(type: string): boolean {
  return type === 'jet_projectile' || type === 'violence_agent' || type === 'incendie' || type === 'violence' || type === 'rebellion';
}

function isFlagrantType(type: string): boolean {
  return isViolentType(type) || type === 'degradation' || type === 'pillage' || type === 'port_arme' || type === 'barricade';
}

/** Violence constatée la plus récente de cette personne dans la fenêtre donnée (null sinon). */
export function recentViolence(p: Person, now: number, window: number): Offense | null {
  const list = p.offenses;
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (now - o.t > window) continue;
    if (o.witnessed && o.severity >= 3 && isViolentType(o.type)) return o;
  }
  return null;
}

/** Flagrant délit constaté (violence ou atteinte aux biens) dans la fenêtre donnée. */
export function recentFlagrant(p: Person, now: number, window: number): Offense | null {
  const list = p.offenses;
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (now - o.t > window) continue;
    if ((o.witnessed || o.filmed) && o.severity >= 2 && isFlagrantType(o.type)) return o;
  }
  return null;
}

const notPolice = (p: Person): boolean => p.faction !== 'police' && p.vehicleId === 0;

/**
 * Perception de l'unité : foule proche, auteurs de violences (barycentre), cible possible du LBD,
 * auteur d'un flagrant délit à portée d'interpellation, encerclement, gaz sur la formation.
 */
export function senseUnit(k: Kernel, u: Unit): void {
  const s = u.sense;
  const ctx = k.ctx;
  const now = k.now;
  s.at = now;
  const g: FormGroup | null = u.groups.length > 0 && u.groups[0].kind !== F_NONE ? u.groups[0] : null;
  let cx: number;
  let cz: number;
  let ch: number;
  let half: number;
  if (g) {
    cx = g.ax;
    cz = g.az;
    ch = g.ah;
    half = g.width * 0.5;
  } else {
    let n = 0;
    cx = 0;
    cz = 0;
    for (let i = 0; i < u.agents.length; i++) {
      if (!u.agents[i].able) continue;
      cx += u.agents[i].p.x;
      cz += u.agents[i].p.z;
      n++;
    }
    if (n === 0) {
      s.crowd = s.close = s.contact = s.violent = 0;
      s.lbdTargetId = s.arrestTargetId = 0;
      return;
    }
    cx /= n;
    cz /= n;
    ch = 0;
    half = 4;
  }
  const fx = Math.sin(ch);
  const fz = Math.cos(ch);
  const list = k.people;
  const n = ctx.people.queryRadius(cx, cz, T.SENSE_RADIUS, list, notPolice);
  let crowd = 0;
  let close = 0;
  let contact = 0;
  let violent = 0;
  let vx = 0;
  let vz = 0;
  let sx = 0;
  let sz = 0;
  let sn = 0;
  let quadrants = 0;
  let around = 0;
  let lbd: Person | null = null;
  let lbdScore = 0;
  let arrest: Person | null = null;
  let arrestD = k.tuning.autoArrestRange;
  for (let i = 0; i < n; i++) {
    const p = list[i];
    if (p.custody !== 'free' || p.health <= 0) continue;
    const dx = p.x - cx;
    const dz = p.z - cz;
    const fwd = dx * fx + dz * fz;
    const lat = dx * -fz + dz * fx;
    // distance à la ligne (segment du premier rang)
    const over = Math.abs(lat) - half;
    const dl = over > 0 ? Math.sqrt(over * over + fwd * fwd) : Math.abs(fwd);
    const participant = p.faction === 'protest';
    if (participant) {
      const d2 = dx * dx + dz * dz;
      if (d2 < 1600) {
        crowd++;
        if (d2 < 900 && p.posture !== 'down') {
          sx += p.x;
          sz += p.z;
          sn++;
        }
      }
      if (dl < 12) close++;
      if (dl < 3 && fwd > -1.5 && p.posture !== 'down') contact++;
    }
    if (p.offenses.length === 0) continue;
    const v = recentViolence(p, now, T.VIOLENT_WINDOW);
    if (v) {
      violent++;
      vx += p.x;
      vz += p.z;
      if (dl < T.SURROUNDED_RADIUS) {
        around++;
        quadrants |= 1 << ((Math.atan2(dx, dz) + Math.PI) / (Math.PI * 0.5) & 3);
      }
      // cible du LBD : auteur de violences à l'instant, debout, lent, dans la plage de distance, en vue
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= T.LBD_MIN && d <= T.LBD_MAX && (p.posture === 'stand' || p.posture === 'crouch')
        && p.vx * p.vx + p.vz * p.vz <= T.LBD_TARGET_SPEED * T.LBD_TARGET_SPEED && p.faction === 'protest') {
        const score = v.severity * 10 - Math.abs(d - 28) * 0.2 - (now - v.t);
        if (score > lbdScore || !lbd) {
          lbdScore = score;
          lbd = p;
        }
      }
    }
    // flagrant délit à portée d'un binôme d'interpellation
    if (dl < arrestD && fwd > -4 && (v || recentFlagrant(p, now, T.FLAGRANT_WINDOW)) && ctx.law.canArrest(p)) {
      arrestD = dl;
      arrest = p;
    }
  }
  s.crowd = crowd;
  s.close = close;
  s.contact = contact;
  s.violent = violent;
  if (violent > 0) {
    s.vx = vx / violent;
    s.vz = vz / violent;
  }
  if (sn > 0) {
    s.cx = sx / sn;
    s.cz = sz / sn;
  } else {
    s.cx = cx + fx * 20;
    s.cz = cz + fz * 20;
  }
  s.quadrants = quadrants;
  s.around = around;
  s.lbdTargetId = lbd && k.sight(cx, cz, lbd.x, lbd.z) ? lbd.id : 0;
  s.arrestTargetId = arrest ? arrest.id : 0;
  s.gas = ctx.hazards.gasAt(cx, cz);
  // fenêtre glissante des projectiles reçus
  if (now - s.lastIncomingAt > 10) s.incoming = 0;
  if (now - s.lastMortarAt > 6) s.mortars = 0;
}
