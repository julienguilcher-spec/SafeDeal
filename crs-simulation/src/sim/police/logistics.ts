/* =====================================================================================
 * FORCES DE L'ORDRE — logistique et état des unités : effectifs, munitions par agent et réserve
 * des véhicules, fatigue (une unité qui tient longtemps sous pression s'épuise, perd en efficacité
 * et demande sa relève par radio), moral, désordre sous une pression réelle (pertes de plus de
 * 25 %, moral effondré) et reformation dix secondes après. Publie l'état pour l'interface
 * ('police.status').
 * ===================================================================================== */

import type { AmmoCount, FormationName, UnitStatus } from './api';
import { RELIEF_REQUESTED_EVENT } from './api';
import type { Agent, Unit } from './brain';
import { F_BOX, F_COLUMN, F_HOLD, F_LINE, F_NONE, F_SCREEN, F_TORTUE, isHoldOrder } from './brain';
import { forceCap, underAttack } from './force';
import type { Kernel } from './kernel';
import { report } from './mcore';
import { spell } from './radio';
import { fleetOf } from './tree';
import * as T from './tuning';

function zero(a: AmmoCount): void {
  a.lacrymoMain = 0;
  a.lacrymoLanceur = 0;
  a.gm2l = 0;
  a.lbd = 0;
  a.desencerclement = 0;
  a.extincteur = 0;
  a.gazeuse = 0;
  a.menottes = 0;
}

function addInventory(a: AmmoCount, agent: Agent): void {
  const inv = agent.p.inventory;
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i];
    switch (s.id) {
      case 'grenade_lacrymo': a.lacrymoMain += s.count; break;
      case 'lanceur_cougar': a.lacrymoLanceur += s.count; break;
      case 'grenade_gm2l': a.gm2l += s.count; break;
      case 'lbd40': a.lbd += s.count; break;
      case 'grenade_desencerclement': a.desencerclement += s.count; break;
      case 'extincteur': a.extincteur += s.state > 0.02 ? s.count : 0; break;
      case 'gazeuse': a.gazeuse += s.count; break;
      case 'menottes': a.menottes += s.count; break;
      default: break;
    }
  }
}

function isUnder(a: Agent, unit: Unit): boolean {
  for (let x = a.home, guard = 0; x && guard < 16; x = x.parent, guard++) if (x === unit) return true;
  return false;
}

function formationName(u: Unit): FormationName {
  if (u.groups.length === 0) return 'aucune';
  if (u.groups.length > 1) return 'encerclement';
  switch (u.groups[0].kind) {
    case F_LINE: return 'ligne';
    case F_COLUMN: return 'colonne';
    case F_TORTUE: return 'tortue';
    case F_SCREEN: return 'ecran';
    case F_BOX: return 'escorte';
    case F_HOLD: return 'libre';
    default: return 'aucune';
  }
}

const fleet: number[] = [];

/** État d'une unité (objet de l'unité, recalculé au plus quatre fois par seconde). */
export function statusOf(k: Kernel, u: Unit): UnitStatus {
  const st = u.status;
  if (k.now - u.statusAt < 0.25 && u.statusAt >= 0) return st;
  u.statusAt = k.now;
  const lead = u.lead;
  const whole = lead === u;
  st.squadId = u.id;
  st.name = u.squad.name;
  st.rootId = lead.id;
  let total = 0;
  let valid = 0;
  let injured = 0;
  let down = 0;
  let detached = 0;
  let embarked = 0;
  let stamina = 0;
  let x = 0;
  let z = 0;
  zero(st.ammo);
  const agents = lead.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!whole && !isUnder(a, u)) continue;
    const p = a.p;
    total++;
    const out = p.posture === 'down' || p.health <= 0 || p.injury === 'serious' || p.injury === 'critical' || p.injury === 'dead' || p.custody !== 'free';
    if (out) down++;
    else {
      valid++;
      stamina += p.stamina;
      x += p.x;
      z += p.z;
    }
    if (p.injury !== 'none') injured++;
    if (a.op !== null) detached++;
    if (p.vehicleId !== 0) embarked++;
    addInventory(st.ammo, a);
  }
  st.total = total;
  st.valid = valid;
  st.injured = injured;
  st.down = down;
  st.detached = detached;
  st.embarked = embarked;
  st.stamina = valid > 0 ? stamina / valid : 0;
  zero(st.reserve);
  const n = fleetOf(k, u, fleet);
  for (let i = 0; i < n; i++) {
    const r = k.reserveOf(k.ctx.vehicles.get(fleet[i]));
    if (!r) continue;
    st.reserve.lacrymoMain += r.lacrymoMain;
    st.reserve.lacrymoLanceur += r.lacrymoLanceur;
    st.reserve.gm2l += r.gm2l;
    st.reserve.lbd += r.lbd;
    st.reserve.desencerclement += r.desencerclement;
    st.reserve.extincteur += r.extincteur;
    st.reserve.gazeuse += r.gazeuse;
    st.reserve.menottes += r.menottes;
  }
  st.fatigue = lead.fatigue;
  st.morale = u.squad.morale;
  st.order = u.task ? u.task.type : lead.order ? lead.order.type : u.squad.order.type;
  st.phase = whole || u.task ? u.phase : lead.phase;
  st.formation = formationName(lead);
  st.needsRelief = lead.needsRelief;
  st.underAttack = underAttack(k, lead);
  st.forceCap = forceCap(k, lead);
  st.arrests = u.arrests;
  const g = lead.groups.length > 0 ? lead.groups[0] : null;
  st.alignError = g && g.kind !== F_NONE ? g.errMax : 0;
  if (whole && g && g.kind !== F_NONE && lead.groups.length === 1) {
    st.x = g.ax;
    st.z = g.az;
    st.heading = g.ah;
  } else if (valid > 0) {
    st.x = x / valid;
    st.z = z / valid;
    st.heading = g ? g.ah : 0;
  }
  return st;
}

/**
 * Fatigue, moral et désordre d'une unité racine (appelé à chaque réflexion de l'unité, `dt` secondes
 * depuis la précédente).
 */
export function updateCondition(k: Kernel, u: Unit, dt: number): void {
  const s = u.sense;
  const now = k.now;
  const sq = u.squad;
  const attacked = now - s.lastIncomingAt < 8 || now - s.hurtAt < 8;
  let total = 0;
  let valid = 0;
  let shields = 0;
  let front = 0;
  for (let i = 0; i < u.agents.length; i++) {
    const a = u.agents[i];
    if (a.crew) continue;
    total++;
    if (a.able || a.p.vehicleId !== 0) valid++;
    if (a.shield && a.able) {
      front++;
      if (a.p.alt) shields++;
    }
  }
  // pression subie : projectiles, contact de la foule, gaz, boucliers tenus levés
  let target = (attacked ? 0.5 : 0) + (s.contact > 0 ? 0.25 * Math.min(1, s.contact / 4) : 0) + (s.gas > 0.1 ? 0.2 : 0)
    + (front > 0 ? 0.15 * (shields / front) : 0);
  if (target > 1) target = 1;
  u.pressure += (target - u.pressure) * (1 - Math.exp(-dt / 4));
  const type = u.order ? u.order.type : 'libre';
  const resting = (type === 'libre' || u.phase === 'embarque' || u.phase === 'repos') && !attacked && s.close === 0;
  if (resting) u.fatigue -= dt / T.FATIGUE_REST_TIME;
  else {
    const g = u.groups.length > 0 ? u.groups[0] : null;
    const effort = g && g.moving && g.speed > 2 ? 1 / 500 : 0;
    u.fatigue += dt * (1 / T.FATIGUE_HOLD_TIME + u.pressure / k.tuning.fatigueTime + effort);
  }
  if (u.fatigue < 0) u.fatigue = 0;
  else if (u.fatigue > 1) u.fatigue = 1;

  // moral : pertes, fatigue, violences subies sans pouvoir riposter
  const losses = total > 0 ? 1 - valid / total : 0;
  let morale = 1 - 0.7 * losses - 0.25 * u.fatigue - (attacked && forceCap(k, u) < 3 ? 0.15 : 0) - 0.1 * u.pressure;
  // le commandant à pied, au contact de ses unités, soutient leur moral (BRIEF §1)
  const cdt = k.commander;
  if (cdt && cdt.vehicleId === 0 && cdt.posture !== 'down' && cdt.health > 0 && u.status.valid > 0) {
    const dx = cdt.x - u.status.x;
    const dz = cdt.z - u.status.z;
    if (dx * dx + dz * dz < 50 * 50) morale += 0.08;
  }
  if (morale < 0) morale = 0;
  else if (morale > 1) morale = 1;
  const rate = morale < sq.morale ? 20 : 60;
  sq.morale += (morale - sq.morale) * (1 - Math.exp(-dt / rate));
  for (let i = 0; i < k.units.length; i++) {
    const c = k.units[i];
    if (c !== u && c.lead === u) c.squad.morale = sq.morale;
  }

  // désordre : seulement sous une pression réelle ; l'unité se reforme dès qu'elle cesse
  const shaken = losses > T.DISORDER_LOSSES || sq.morale < 0.25;
  if (shaken && (attacked || s.contact > 0)) u.disorder += dt / 2;
  else u.disorder -= dt / T.DISORDER_RECOVER;
  if (u.disorder < 0) u.disorder = 0;
  else if (u.disorder > 1) u.disorder = 1;

  // demande de relève
  const worn = u.fatigue >= k.tuning.reliefAt || (total >= 4 && valid / total < T.RELIEF_VALID_RATIO);
  if (worn && (isHoldOrder(type) || type === 'refoulement' || type === 'libre') && now - u.reliefAt > T.RELIEF_REPEAT) {
    u.reliefAt = now;
    u.needsRelief = true;
    report(k, u, (u.fatigue >= k.tuning.reliefAt ? 'Unité éprouvée, en ligne sous pression depuis trop longtemps' : 'Pertes sensibles')
      + '. ' + spell(valid) + ' valides sur ' + spell(total) + '. Demande relève sur place', 2);
    k.emit(RELIEF_REQUESTED_EVENT, { squadId: u.id, fatigue: u.fatigue, valid, total });
  } else if (!worn && u.fatigue < k.tuning.reliefAt * 0.6) {
    u.needsRelief = false;
  }
}
