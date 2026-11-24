/* =====================================================================================
 * GROUPES RADICAUX — les gestes élémentaires d'un membre, briques des tâches (tasks.ts).
 *
 * Tenir sa place dans la formation, aller prendre des projectiles là où il y en a, choisir un agent à
 * viser, lancer à l'instant de la salve, tirer au mortier d'artifice, aller au contact, s'en prendre à
 * une vitrine ou à un mobilier, porter un objet jusqu'à la ligne de la barricade. Chaque fonction lance
 * au plus UN geste (acts.ts) et dit si elle l'a fait.
 * ===================================================================================== */

import type { Person, Prop, Shop } from '@/core/contracts';
import type { Acts } from './acts';
import { setBanner, setUmbrella } from './attire';
import { isPoliceUp } from './kernel';
import type { RadKernel } from './kernel';
import { dodge } from './march';
import { RES, TASK, TOOL } from './model';
import type { RadGroup, RadMember } from './model';
import { SIGN } from './signals';
import { SOURCE, memberSource, memberSrc, stockOf } from './supply';
import { isMaterial, nearestMaterial, shutterHolds } from './targets';
import * as R from './tuning';

export function setTask(k: RadKernel, m: RadMember, task: number): void {
  if (m.task === task) return;
  m.task = task;
  m.taskSince = k.now;
  m.step = 0;
  m.tries = 0;
}

/** Tient sa place dans la formation (la conduite est faite à chaque pas par march.ts). */
export function slot(k: RadKernel, m: RadMember): boolean {
  setTask(k, m, TASK.SLOT);
  const g = m.group!;
  const p = m.p;
  const wx = g.ax - g.hz * m.lx - g.hx * m.lz;
  const wz = g.az + g.hx * m.lx - g.hz * m.lz;
  const d2 = (wx - p.x) * (wx - p.x) + (wz - p.z) * (wz - p.z);
  if (d2 > 6) {
    // on n'avance plus alors qu'on est loin de sa place : un objet en travers, un pas de côté
    if (k.now - m.stT > 1.6) {
      const moved = (p.x - m.stX) * (p.x - m.stX) + (p.z - m.stZ) * (p.z - m.stZ);
      m.stX = p.x;
      m.stZ = p.z;
      m.stT = k.now;
      if (moved < 0.3) {
        m.stN++;
        dodge(k, m, wx, wz);
        return true;
      }
    }
    // loin de sa place : tout droit si on la voit, sinon par les rues
    if (d2 > 400 && k.now >= m.dodgeUntil) {
      if (k.ctx.world.lineOfSight(p.x, p.z, wx, wz)) {
        m.b.path = null;
        m.b.pathPending = false;
      } else if (m.b.path === null && !m.b.pathPending) k.core.steering.goTo(p, m.b, wx, wz, R.SPEED_RUN, true);
    }
  }
  return true;
}

/** Celui qui porte un tube, un engin incendiaire ou un outil garde les mains libres : il ne tient pas de parapluie. */
export function shieldBearer(m: RadMember): boolean {
  return (m.tools & (TOOL.MORTAR | TOOL.MOLOTOV | TOOL.HAMMER | TOOL.BAR | TOOL.RACKET)) === 0;
}

export function bannerCount(g: RadGroup): number {
  let n = 0;
  for (let i = 0; i < g.members.length; i++) if (g.members[i]!.banner) n++;
  return n;
}

export function freeHands(m: RadMember): boolean {
  return !m.umbrella && !m.banner;
}

// ───────────────────────────── munitions ─────────────────────────────

/**
 * Va prendre des projectiles : chacun sa source quand elles sont petites, tous au même tas quand il est
 * gros. Retourne false s'il n'y a rien à faire (plein, ou plus rien alentour).
 */
export function supply(k: RadKernel, acts: Acts, g: RadGroup, m: RadMember): boolean {
  const ctx = k.ctx;
  const p = m.p;
  if (m.task !== TASK.SUPPLY) {
    setTask(k, m, TASK.SUPPLY);
  } else {
    // retour d'un geste : a-t-on quelque chose de plus ?
    k.refreshTools(m);
    m.step++;
    if (m.ammo >= 3 || m.step > 6) return false;
    // ce carré de chaussée ne donne plus rien : on se décale
    if (m.result === RES.FAILED && g.supplyKind === SOURCE.SETT) {
      const x = g.supplyX + (k.rngAct.next() - 0.5) * 9;
      const z = g.supplyZ + (k.rngAct.next() - 0.5) * 9;
      if (ctx.world.surfaceAt(x, z) === 'sett' && ctx.world.isFree(x, z, 0.4)) {
        g.supplyX = x;
        g.supplyZ = z;
      }
    }
  }
  if (!memberSource(k, g, p.x, p.z, R.SUPPLY_NEAR)) return false;
  const src = memberSrc;
  const kind = src.kind;
  if (kind === SOURCE.SETT) {
    // chacun son carré de chaussée, autour du point retenu
    const a = m.b.phase + m.step * 2.1;
    const r = 1 + ((m.p.id * 7 + m.step * 3) % 5) * 0.7;
    let x = src.x + Math.sin(a) * r;
    let z = src.z + Math.cos(a) * r;
    if (ctx.world.surfaceAt(x, z) !== 'sett' || !ctx.world.isFree(x, z, 0.4)) {
      x = src.x;
      z = src.z;
    }
    k.signals.mark(g, SIGN.UNPAVE, x, z, 1, k.now);
    // des pavés déjà descellés attendent en tas : on se sert, un autre continue de dépaver
    const near = ctx.props.queryRadius(x, z, 3.5, k.props);
    for (let i = 0; i < near; i++) {
      const pile = k.props[i]!;
      if (pile.kind !== 'pile_paves' || stockOf(k, pile) <= 0) continue;
      acts.verb(m, 'depaver', pile.id, pile.x, pile.z, Math.max(pile.halfX, pile.halfZ) + 0.95);
      return true;
    }
    acts.verb(m, 'depaver', 0, x, z, 0.7);
    return true;
  }
  k.signals.mark(g, kind === SOURCE.PILE ? SIGN.UNPAVE : SIGN.COLLECT, src.x, src.z, 1, k.now);
  acts.verb(m, kind === SOURCE.PILE ? 'depaver' : 'ramasser', src.id, src.x, src.z, src.reach, NaN, NaN, 30);
  return true;
}

// ───────────────────────────── lancers ─────────────────────────────

/** Agent visé par un lanceur : au hasard parmi ceux qui sont à portée autour de l'agent le plus proche. */
export function pickOfficer(k: RadKernel, g: RadGroup, m: RadMember, range: number): Person | null {
  const a = g.a;
  const list = k.people2;
  const n = k.ctx.people.queryRadius(a.nx, a.nz, 16, list, isPoliceUp);
  if (n === 0) return null;
  const p = m.p;
  let pick: Person | null = null;
  let seen = 0;
  let nearest: Person | null = null;
  let nearestD = Infinity;
  for (let i = 0; i < n; i++) {
    const q = list[i]!;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = q;
    }
    if (d > range || d < 5) continue;
    seen++;
    if (k.rngAct.next() * seen < 1) pick = q;
  }
  return pick ?? (nearestD <= range + 1.5 ? nearest : null);
}

/** Lancer de la salve en cours (pavé, bouteille), tir de mortier, engin incendiaire. */
export function volleyShot(k: RadKernel, acts: Acts, g: RadGroup, m: RadMember): boolean {
  // un seul lancer par salve
  if (!freeHands(m) || m.nextThrowAt > g.volleyAt) return false;
  const a = g.a;
  const p = m.p;
  const riot = k.heat >= R.TIER_RIOT;
  const at = g.volleyAt + k.rngAct.next() * R.VOLLEY_SPREAD;
  const d = Math.hypot(a.nx - p.x, a.nz - p.z);
  if (riot && (m.tools & TOOL.MORTAR) !== 0 && d >= 12 && d <= 62) {
    const q = pickOfficer(k, g, m, 60);
    if (q) {
      setTask(k, m, TASK.MORTAR);
      m.nextThrowAt = g.volleyAt + 0.001;
      acts.throwAt(m, 'mortier', q.x, q.y + 1.1, q.z, q.id, at, 2 + (k.rngAct.next() < 0.5 ? 1 : 0));
      return true;
    }
  }
  if (riot && (m.tools & TOOL.MOLOTOV) !== 0) {
    // sur un véhicule de police à portée, sinon au pied de la ligne
    const v = a.vehicleId !== 0 ? k.ctx.vehicles.get(a.vehicleId) : undefined;
    let tx = a.nx + ((p.x - a.nx) / (d || 1)) * 2.5;
    let tz = a.nz + ((p.z - a.nz) / (d || 1)) * 2.5;
    let ty = p.y + 0.1;
    if (v && Math.hypot(v.x - p.x, v.z - p.z) <= R.MOLOTOV_RANGE) {
      tx = v.x;
      tz = v.z;
      ty = v.y + 0.9;
    }
    if (Math.hypot(tx - p.x, tz - p.z) <= R.MOLOTOV_RANGE + 2) {
      setTask(k, m, TASK.MOLOTOV);
      m.nextThrowAt = g.volleyAt + 0.001;
      acts.throwAt(m, 'molotov', tx, ty, tz, 0, at);
      return true;
    }
  }
  if (m.ammo <= 0) return false;
  // premiers jets isolés tant que le palier d'affrontement n'est pas atteint : un lanceur sur trois
  if (k.heat < R.TIER_CLASH && (m.p.id + g.volleys) % 3 !== 0) return false;
  const q = pickOfficer(k, g, m, R.THROW_RANGE);
  if (!q) return false;
  setTask(k, m, TASK.THROW);
  m.nextThrowAt = g.volleyAt + 0.001;
  acts.throwAt(m, k.throwable(m) as 'pave', q.x, q.y + 1.2, q.z, q.id, at);
  return true;
}

/**
 * Tir tendu de mortier d'artifice : de loin (30 à 60 m), en rafale de deux ou trois coups, dès que la ligne
 * est en vue — pas besoin d'avancer avec les lanceurs. Les coups sont ceux du tube apporté dans le sac.
 */
export function mortarBurst(k: RadKernel, acts: Acts, g: RadGroup, m: RadMember): boolean {
  if ((m.tools & TOOL.MORTAR) === 0 || !freeHands(m) || k.now < m.nextThrowAt || k.heat < R.TIER_RIOT) return false;
  const a = g.a;
  if (a.police < 3 || !a.sight) return false;
  const p = m.p;
  const d = Math.hypot(a.nx - p.x, a.nz - p.z);
  if (d < 14 || d > R.MORTAR_MAX + 6) return false;
  const q = pickOfficer(k, g, m, 60);
  if (!q || !k.ctx.world.lineOfSight(p.x, p.z, q.x, q.z)) {
    m.nextThrowAt = k.now + 3;
    return false;
  }
  setTask(k, m, TASK.MORTAR);
  m.nextThrowAt = k.now + 9 + 6 * k.rngAct.next();
  acts.throwAt(m, 'mortier', q.x, q.y + 1.1, q.z, q.id, k.now + 0.6 + k.rngAct.next(), 2 + (k.rngAct.next() < 0.5 ? 1 : 0));
  return true;
}

// ───────────────────────────── contact ─────────────────────────────

/** Au contact d'une personne des forces : frapper avec ce qu'on a, repousser, ou lancer de près. */
export function engage(k: RadKernel, acts: Acts, m: RadMember, q: Person): boolean {
  const p = m.p;
  const d = Math.hypot(q.x - p.x, q.z - p.z);
  setTask(k, m, TASK.MELEE);
  if (freeHands(m) && m.ammo > 0 && d > 6 && d < 20 && (m.p.id + ((k.now * 0.5) | 0)) % 2 === 0) {
    acts.throwAt(m, k.throwable(m) as 'pave', q.x, q.y + 1.0, q.z, q.id, k.now + 0.2);
    return true;
  }
  setUmbrella(k, m, false);
  const item = (m.tools & TOOL.BAR) !== 0 ? 'barre' : (m.tools & TOOL.HAMMER) !== 0 ? 'marteau' : '';
  if (item === '' && (q.posture === 'down' || q.posture === 'prone')) {
    // à mains nues on ne peut rien contre quelqu'un à terre : on fait cercle
    acts.goto(m, q.x + Math.sin(m.b.phase) * 1.6, q.z + Math.cos(m.b.phase) * 1.6, 0.8, R.SPEED_RUN, true, 6);
    return true;
  }
  acts.strike(m, item, q.x, q.z, q.id, 2, item === 'barre' ? 1.25 : item === 'marteau' ? 0.95 : 0.85, 12);
  return true;
}

// ───────────────────────────── casse ─────────────────────────────

export function attackShop(k: RadKernel, acts: Acts, m: RadMember, s: Shop): boolean {
  const nx = Math.sin(s.heading);
  const nz = Math.cos(s.heading);
  const tx = Math.cos(s.heading);
  const tz = -Math.sin(s.heading);
  // chacun son morceau de façade
  const span = Math.max(0, s.width * 0.5 - 0.6);
  const off = span * (((m.p.id * 37) % 100) / 50 - 1);
  const fx = s.x + tx * off;
  const fz = s.z + tz * off;
  const tool = (m.tools & TOOL.BAR) !== 0 ? 'barre' : (m.tools & TOOL.HAMMER) !== 0 ? 'marteau' : '';
  const shut = shutterHolds(k, s);
  if (tool !== '' && freeHands(m)) {
    setTask(k, m, TASK.BREAK);
    acts.strike(m, tool, fx + nx * 0.05, fz + nz * 0.05, 0, shut ? 6 : 3, tool === 'barre' ? 1.15 : 0.9, 20);
    return true;
  }
  if (shut) return false;
  if ((m.tools & TOOL.PAINT) !== 0 && s.window === 'intact' && freeHands(m) && m.step < 2) {
    setTask(k, m, TASK.TAG);
    if (m.step === 0) {
      m.step = 1;
      acts.strike(m, 'bombe_peinture', fx + nx * 0.05, fz + nz * 0.05, 0, 1, 1.05, 15);
    } else {
      // le temps d'écrire
      m.step = 2;
      acts.wait(m, 4.2, false);
    }
    return true;
  }
  if (m.ammo > 0 && freeHands(m) && s.window !== 'boarded') {
    const d = Math.hypot(s.x - m.p.x, s.z - m.p.z);
    // de face, à bonne distance : ni collé à la vitre ni de biais
    if (d >= 5 && d <= 24 && (m.p.x - s.x) * nx + (m.p.z - s.z) * nz > 2.5) {
      setTask(k, m, TASK.THROW);
      acts.throwAt(m, k.throwable(m) as 'pave', fx, s.y + 1.3, fz, 0, k.now + k.rngAct.next() * 1.5);
      return true;
    }
  }
  return false;
}

export function attackProp(k: RadKernel, acts: Acts, m: RadMember, pr: Prop): boolean {
  const tool = (m.tools & TOOL.BAR) !== 0 ? 'barre' : (m.tools & TOOL.HAMMER) !== 0 ? 'marteau' : '';
  if (pr.kind === 'camera' || tool === '') {
    if (m.ammo > 0 && freeHands(m)) {
      const d = Math.hypot(pr.x - m.p.x, pr.z - m.p.z);
      if (d >= 5 && d <= 22) {
        setTask(k, m, TASK.THROW);
        acts.throwAt(m, k.throwable(m) as 'pave', pr.x, pr.y + Math.min(pr.height * 0.8, 4.5), pr.z, 0, k.now + k.rngAct.next() * 1.5);
        return true;
      }
    }
    return false;
  }
  if (!freeHands(m)) return false;
  setTask(k, m, TASK.BREAK);
  acts.strike(m, tool, pr.x, pr.z, 0, 3, Math.max(pr.halfX, pr.halfZ) + (tool === 'barre' ? 1.0 : 0.8), 20);
  return true;
}

// ───────────────────────────── barricade ─────────────────────────────

/** Emplacement n° `index` sur la ligne du chantier : au centre d'abord, puis de part et d'autre. */
export function siteSlot(g: RadGroup, index: number, out: { x: number; z: number }): void {
  const s = g.site;
  const perRow = Math.max(1, Math.floor((2 * s.half) / R.BARRICADE_SPACING));
  const row = Math.floor(index / perRow);
  const i = index % perRow;
  const lateral = ((i + 1) >> 1) * R.BARRICADE_SPACING * ((i & 1) === 1 ? 1 : -1);
  out.x = s.x + s.ax * lateral + s.rx * row * 0.9;
  out.z = s.z + s.az * lateral + s.rz * row * 0.9;
}

/** Porte un objet mobile jusqu'à la ligne de la barricade et l'y pose. */
export function carry(k: RadKernel, acts: Acts, g: RadGroup, m: RadMember, light: boolean): boolean {
  const ctx = k.ctx;
  const p = m.p;
  const s = g.site;
  if (!s.active) return false;
  // la ligne brûle déjà : on n'y porte plus rien (ce qu'on tenait est posé là où l'on est)
  if (s.lit || ctx.hazards.fireAt(s.x, s.z) > 0.03) {
    if (p.carrying !== 0) ctx.interactions.startVerb(p, 'deposer', p.carrying);
    return false;
  }
  if (m.task !== TASK.CARRY) setTask(k, m, TASK.CARRY);
  else if (m.tries >= 3 && p.carrying === 0) return false;
  k.signals.mark(g, SIGN.FURNITURE, s.x, s.z, 1, k.now);
  // côté d'où l'on travaille : celui du groupe
  const side = (g.ax - s.x) * s.rx + (g.az - s.z) * s.rz >= 0 ? 1 : -1;
  if (p.carrying !== 0) {
    if (m.step === 2) {
      // arrivé (ou bloqué) : on pose, face à l'emplacement
      m.step = 3;
      acts.verb(m, 'deposer', p.carrying, p.x, p.z, 1.5, m.tx, m.tz, 6);
      return true;
    }
    const idx = g.assigned++;
    siteSlot(g, idx, k.v2);
    m.tx = k.v2.x;
    m.tz = k.v2.z;
    m.step = 2;
    acts.goto(m, m.tx + s.rx * side * 1.05, m.tz + s.rz * side * 1.05, 0.5, 1.6, false, 45);
    return true;
  }
  if (m.step === 3) {
    // posé
    if (m.tId !== 0) {
      const pr = ctx.props.get(m.tId);
      if (pr) {
        s.placed++;
        s.bulk += R.BARRICADE_BULK_OF[pr.kind] ?? 0.5;
        if (s.placed === 1) k.emit('barricade_commencee', g, s.x, s.z, 1, 0);
      }
      if (k.claims.get(m.tId) === g.id) k.claims.delete(m.tId);
    }
    m.tId = 0;
    m.step = 0;
  } else if (m.step === 1) {
    // la prise a échoué
    if (m.tId !== 0 && k.claims.get(m.tId) === g.id) k.claims.delete(m.tId);
    m.tId = 0;
    m.step = 0;
    m.tries++;
  }
  const pr = nearestMaterial(k, g, p.x, p.z, light);
  if (!pr || !isMaterial(pr)) return false;
  k.claims.set(pr.id, g.id);
  m.tId = pr.id;
  m.step = 1;
  setUmbrella(k, m, false);
  setBanner(k, m, false);
  if (p.active >= 0) ctx.actions.select(p, -1);
  acts.verb(m, 'porter', pr.id, pr.x, pr.z, Math.max(pr.halfX, pr.halfZ) + 0.9, NaN, NaN, 40);
  return true;
}

// ───────────────────────────── tâche selon le plan ─────────────────────────────
