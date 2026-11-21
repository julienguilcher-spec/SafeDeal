/* =====================================================================================
 * Locomotion — vitesse maximale selon l'état de la personne, endurance, et « réflexion lente »
 * (charge portée, résistance à la poussée, nature du sol, densité de foule), recalculée environ
 * deux fois par seconde et par personne, de façon étalée.
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import * as T from './tuning';
import type { PeopleShared, PersonExtra } from './shared';
import { HOLD_DRAG, HOLD_SHOULDER, shieldRaised } from './shared';

/**
 * Valeurs échangées avec la locomotion par champs plutôt que par arguments et valeurs de retour : un
 * nombre flottant passé à une fonction non intégrée par le compilateur est emballé dans un objet à
 * chaque appel ; écrit dans un champ, il ne coûte rien.
 *   limit : vitesse maximale calculée par speedLimit() ; gait : allure réellement retenue (0, 1, 2) ;
 *   hold  : façon dont la personne porte quelqu'un (HOLD_SHOULDER, HOLD_DRAG, ou 0) ;
 *   speed, h : vitesse courante et durée du pas, lues par updateStamina().
 */
export const speedOut = { limit: 0.5, gait: 0, hold: 0, speed: 0.5, h: 0.5 };

function smooth01(a: number, b: number, x: number): number {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/**
 * Vitesse maximale (m/s) pour l'allure demandée, tous effets compris : allures interdites
 * (essoufflé, blessé, étourdi, accroupi, bouclier levé, mains prises), charge de l'équipement,
 * blessures, gaz, étourdissement, portage, menottes, sol, vêtements trempés, densité de foule.
 * Résultat dans speedOut.limit (et speedOut.gait, speedOut.hold).
 */
export function speedLimit(shared: PeopleShared, p: Person, e: PersonExtra, gaitIn: number): void {
  const wetness = shared.wetness;
  let gait = gaitIn >= 2 ? 2 : gaitIn >= 1 ? 1 : 0;
  const inj = p.injury;
  const crouched = p.posture === 'crouch';
  const shield = p.alt && shieldRaised(p);
  const stunned = p.stun > 0;
  if (gait === 2 && (e.winded || stunned || crouched || shield || p.carrying !== 0 || p.custody !== 'free'
    || inj === 'serious' || inj === 'critical')) gait = 1;
  if (gait === 1 && inj === 'critical') gait = 0;
  speedOut.gait = gait;
  speedOut.hold = 0;
  speedOut.limit = 0;
  if (inj === 'dead') return;

  let v = gait === 2 ? p.speedSprint : gait === 1 ? p.speedRun : p.speedWalk;
  if (!(v > 0)) return;
  if (crouched) v = gait === 0 ? p.speedWalk * T.CROUCH_WALK : p.speedWalk;
  if (shield && v > T.SHIELD_RUN_MAX) v = T.SHIELD_RUN_MAX;

  let mul = 1 - T.LOAD_SPEED_K[gait]! * (e.load < T.LOAD_MAX ? e.load : T.LOAD_MAX);
  if (inj !== 'none') {
    mul *= inj === 'light' ? T.INJURY_SPEED_LIGHT : inj === 'serious' ? T.INJURY_SPEED_SERIOUS : T.INJURY_SPEED_CRITICAL;
  }
  if (p.gas > T.GAS_SPEED_FROM) mul *= 1 - T.GAS_SPEED_LOSS * smooth01(T.GAS_SPEED_FROM, T.GAS_SPEED_FULL, p.gas);
  if (stunned) mul *= T.STUN_SPEED;
  if (e.winded && gait >= 1) mul *= T.WINDED_SPEED;
  if (p.custody !== 'free') mul *= T.CUFFED_SPEED;
  if (gait === 2 && wetness > 0) mul *= 1 - T.WET_SPRINT_LOSS * wetness;
  mul *= e.surface;
  if (p.wet > 0) mul *= 1 - T.SOAKED_SPEED_LOSS * p.wet;
  if (e.crowd > T.CROWD_FREE) {
    const k = (e.crowd - T.CROWD_FREE) / (T.CROWD_JAM - T.CROWD_FREE);
    mul *= k >= 1 ? T.CROWD_MIN_FACTOR : 1 - (1 - T.CROWD_MIN_FACTOR) * k;
  }
  v *= mul;

  if (p.carrying !== 0) {
    const ce = shared.peek(p.carrying);
    const mode = ce ? ce.holdMode : 0;
    speedOut.hold = mode;
    const cap = mode === HOLD_SHOULDER ? T.CARRY_SPEED : mode === HOLD_DRAG ? T.DRAG_SPEED : p.speedWalk * T.ESCORT_SPEED_FACTOR;
    if (v > cap) v = cap;
  }
  speedOut.limit = v > 0 ? v : 0;
}

/** Façon dont la personne porte quelqu'un : HOLD_SHOULDER, HOLD_DRAG, ou 0 (rien, escorte, objet). */
export function carryModeOf(shared: PeopleShared, p: Person): number {
  if (p.carrying === 0) return 0;
  const ce = shared.peek(p.carrying);
  return ce ? ce.holdMode : 0;
}

/**
 * Endurance : le sprint et la course consomment, la marche et l'arrêt rendent du souffle. Consommation
 * et récupération dépendent du poids de l'équipement, du masque à gaz, de la visière, du gaz respiré,
 * des blessures, du bouclier tenu levé et du portage d'un blessé.
 * Entrées lues dans speedOut : gait (allure effective), limit (vitesse maximale à cette allure), speed, h.
 */
export function updateStamina(shared: PeopleShared, p: Person, e: PersonExtra): void {
  const gait = speedOut.gait;
  const speed = speedOut.speed;
  const carrying = p.carrying !== 0;
  // au repos et le souffle plein : rien à faire
  if (p.stamina >= 100 && !carrying && (gait === 0 || speed < 0.5)) {
    if (e.winded) e.winded = false;
    return;
  }
  const vmax = speedOut.limit;
  const h = speedOut.h;
  const r = vmax > 0.01 ? (speed < vmax ? speed / vmax : 1) : 0;
  const mask = p.look.gasMask;
  const gasf = p.gas > 0.2 ? (p.gas < 1 ? p.gas : 1) : 0;
  const load = e.load < T.LOAD_MAX ? e.load : T.LOAD_MAX;
  let rate: number;
  // course : l'effort croît de 0 (pas très soutenu, à peine plus vite que la marche) à 1 (pleine foulée) ; un pas
  // rapide de 1,9 m/s en tenue ne doit pas essouffler comme un footing
  if (gait === 2 ? r > 0.35 : gait === 1 && r > T.RUN_EFFORT_FROM) {
    let drain = gait === 2 ? T.STAMINA_SPRINT_DRAIN * r * r : T.STAMINA_RUN_DRAIN * (r - T.RUN_EFFORT_FROM) / (1 - T.RUN_EFFORT_FROM);
    drain *= 1 + load * T.STAMINA_LOAD_K * (gait === 2 ? 1 : T.STAMINA_LOAD_RUN_SHARE);
    if (mask) drain *= T.MASK_DRAIN;
    if (gasf > 0) drain *= 1 + T.GAS_STAMINA * gasf;
    rate = -drain;
  } else {
    const w = p.speedWalk > 0.1 ? speed / p.speedWalk : 0;
    let rec = T.STAMINA_REST + (T.STAMINA_WALK - T.STAMINA_REST) * (w < 1 ? w : 1);
    rec /= 1 + load * T.STAMINA_LOAD_RECOVERY_K;
    if (mask) rec *= T.MASK_RECOVERY;
    if (p.look.visorDown) rec *= T.VISOR_RECOVERY;
    if (gasf > 0) rec *= 1 - T.GAS_STAMINA * gasf;
    const inj = p.injury;
    if (inj !== 'none') rec *= inj === 'light' ? T.STAMINA_INJURY_LIGHT : inj === 'serious' ? T.STAMINA_INJURY_SERIOUS : T.STAMINA_INJURY_CRITICAL;
    if (p.alt && shieldRaised(p)) rec *= T.SHIELD_RECOVERY;
    rate = rec;
  }
  if (carrying) {
    const mode = carryModeOf(shared, p);
    if (mode !== 0) {
      // porter ou traîner quelqu'un : effort continu en mouvement, récupération très réduite à l'arrêt
      if (speed > 0.2) rate = -(mode === HOLD_SHOULDER ? T.CARRY_DRAIN : T.DRAG_DRAIN) * (1 + load * T.STAMINA_LOAD_K);
      else if (rate > 0) rate *= mode === HOLD_SHOULDER ? 0.25 : 0.6;
    }
  }
  let s = p.stamina + rate * h;
  if (!(s > 0)) s = 0;
  else if (s > 100) s = 100;
  p.stamina = s;
  if (e.winded) {
    if (s >= T.WINDED_UNTIL) e.winded = false;
  } else if (s <= T.WINDED_AT && rate < 0) {
    e.winded = true;
    shared.ctx.events.emitAny('people:winded', { id: p.id });
  }
}

/** Masse de l'équipement (kg) : protections portées, sac, objets de l'inventaire (ctx.actions.def(id).weight). */
export function computeLoad(ctx: GameContext, p: Person): number {
  const ah = p.armorHead > 0 ? (p.armorHead < 1 ? p.armorHead : 1) : 0;
  const ab = p.armorBody > 0 ? (p.armorBody < 1 ? p.armorBody : 1) : 0;
  let w = ah * T.WEIGHT_HELMET + ab * T.WEIGHT_BODY_ARMOR + (p.look.backpack ? T.WEIGHT_BACKPACK : 0);
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i]!;
    const def = ctx.actions.def(s.id);
    if (!def || !(def.weight > 0)) continue;
    let units = 1;
    if (def.category === 'throwable' || def.category === 'loot' || def.category === 'medical') {
      units = s.count > 1 ? s.count : 1;
      if (def.maxCount > 0 && units > def.maxCount) units = def.maxCount;
    }
    w += def.weight * units;
  }
  return w;
}

const DENSITY_AREA = Math.PI * T.CROWD_RADIUS * T.CROWD_RADIUS;

/** Ordres qui tiennent une position (même liste que l'IA de police, src/sim/police/brain.ts : isHoldOrder). */
function isHoldOrder(type: string): boolean {
  return type === 'ligne' || type === 'tenir' || type === 'tortue' || type === 'encercler' || type === 'proteger'
    || type === 'couper_circulation' || type === 'filtrer';
}

/** Réflexion lente d'une personne : résistance à la poussée, sol, densité ; `heavy` : recalcule aussi la charge. */
export function refreshSlow(ctx: GameContext, shared: PeopleShared, p: Person, e: PersonExtra, heavy: boolean): void {
  const wetness = shared.wetness;
  // résistance à la poussée : carrure, bouclier levé, unité qui tient une ligne
  let w = p.look.build > 0.5 ? p.look.build : 1;
  if (p.alt && shieldRaised(p)) w *= T.RESIST_SHIELD;
  if (p.squadId !== 0 && p.faction === 'police') {
    const sq = ctx.squads.get(p.squadId);
    // « avancer » jusqu'à une rue : arrivée, l'unité la barre et s'arc-boute comme une ligne qui tient
    if (sq && (isHoldOrder(sq.order.type) || (sq.order.type === 'avancer' && p.vx * p.vx + p.vz * p.vz < 0.25))) w *= T.RESIST_LINE;
  }
  if (p.stun > 0.3 || p.injury === 'serious' || p.injury === 'critical') w *= 0.6;
  shared.setResist(p.id, w);

  // nature du sol : pavés glissants sous la pluie, sols meubles plus lents
  const s = ctx.world.surfaceAt(p.x, p.z);
  let grip = 1 - T.WET_GRIP_LOSS * wetness;
  let surf = 1;
  if (s === 'sett') grip = 1 - T.WET_SETT_GRIP_LOSS * wetness;
  else if (s === 'park' || s === 'gravel') surf = T.SOFT_GROUND_SPEED;
  else if (s === 'water') surf = 0.4;
  e.grip = grip > 0.3 ? grip : 0.3;
  e.surface = surf;

  // densité de foule (la personne elle-même est comptée)
  const n = ctx.people.countIn(p.x, p.z, T.CROWD_RADIUS);
  e.crowd += (n / DENSITY_AREA - e.crowd) * (e.fresh ? 1 : 0.5);

  // geste de portage resté sans personne portée
  if (p.carrying === 0 && (p.upper === 'carry_person' || p.upper === 'drag')) {
    p.upper = 'none';
    p.upperT = 0;
  }
  if (heavy || e.fresh) e.load = computeLoad(ctx, p);
  e.fresh = false;
}
