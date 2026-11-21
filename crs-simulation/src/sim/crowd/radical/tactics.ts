/* =====================================================================================
 * GROUPES RADICAUX — décision tactique d'un groupe : que faire maintenant, contre quoi, par où.
 *
 * Chaque plan possible reçoit un intérêt, calculé sur l'appréciation de situation (assess.ts) et sur la
 * chaleur du moment ; le plus intéressant l'emporte. Rien n'est scripté : la même scène rejouée avec
 * une ligne plus nombreuse, du gaz, ou une rue sans mobilier donne un autre choix.
 *
 *   palier « tension » (bloc formé)        jets isolés, tags, mobilier tiré sur la chaussée
 *   palier « affrontement localisé »       salves, vitrines, feux de poubelles, barricade,
 *                                          charge sur un agent isolé, libération d'un interpellé
 *   palier « affrontement généralisé »     mortiers, engins incendiaires, barricade enflammée,
 *                                          véhicules incendiés ou renversés, rideaux forcés
 * Coordination : le bloc borne le nombre de groupes par plan (pas tous sur la même vitrine), fait
 * converger les groupes sur une salve commune, et réserve les cibles.
 * ===================================================================================== */

import { isPoliceUp } from './kernel';
import type { RadKernel } from './kernel';
import { PLAN, TARGET, TOOL } from './model';
import type { RadGroup } from './model';
import { findSource } from './supply';
import { findBarricadeSite, findBin, findBreakTarget, findParkedVehicle, groupTools, materialAround } from './targets';
import * as R from './tuning';

/** Nombre de groupes actuellement engagés dans un plan. */
function engaged(k: RadKernel, plan: number, except: RadGroup): number {
  let n = 0;
  for (let i = 0; i < k.groups.length; i++) {
    const g = k.groups[i]!;
    if (g !== except && g.plan === plan) n++;
  }
  return n;
}

/**
 * Le groupe doit-il rompre tout de suite ? Retourne un motif ('' : non). Pertes, moral, gaz dense,
 * ligne qui avance à moins de seize mètres ou qui charge, engin lanceur d'eau, blindé.
 */
export function mustWithdraw(g: RadGroup): string {
  const a = g.a;
  if (a.able < 2) return 'effectif';
  if (g.size0 > 0 && g.lost / g.size0 >= R.LOSS_BREAK) return 'pertes';
  if (g.morale < R.MORALE_BREAK) return 'moral';
  if (a.gas > R.GAS_BREAK || a.gasField > R.GAS_FIELD_BREAK) return 'gaz';
  if (a.water < R.WATER_KEEP) return 'canon_a_eau';
  if (a.armour < R.ARMOUR_KEEP) return 'blinde';
  // au contact pour libérer un camarade ou submerger un agent isolé, on ne rompt pas pour une ligne proche
  const close = g.plan === PLAN.ASSAULT || g.plan === PLAN.RESCUE;
  if (!close) {
    if (a.dist < R.RETREAT_DIST && a.closing > 0.25 && a.near >= 2) return 'ligne_qui_avance';
    if (a.closing > R.CHARGE_CLOSING && a.dist < 32 && a.near >= 2) return 'charge';
    if (a.dist < 8 && a.near >= 3) return 'contact';
  } else if (a.near >= 8 && a.ratio < 0.5) return 'renforts';
  return '';
}

/**
 * Choisit le plan du groupe pendant une phase d'action et fixe sa cible. Retourne le plan retenu
 * (PLAN.FOLLOW si rien ne vaut la peine : le groupe reste en formation).
 */
export function choosePlan(k: RadKernel, g: RadGroup): number {
  const a = g.a;
  const heat = k.heat;
  const clash = heat >= R.TIER_CLASH;
  const riot = heat >= R.TIER_RIOT;
  const tools = groupTools(g);
  let best = 0.12;
  let plan: number = PLAN.FOLLOW;
  let kind = 0;
  let id = 0;
  let tx = g.ax;
  let tz = g.az;

  // ── libérer un camarade interpellé : l'essaim autour de l'escorte ──
  if (a.heldId !== 0 && clash && a.heldEscort <= R.RESCUE_ESCORT_MAX && a.able >= 4) {
    const local = a.able / Math.max(1, a.heldEscort);
    let u = 0.55 + 0.25 * g.morale + 0.1 * Math.min(2, local) - 0.1 * engaged(k, PLAN.RESCUE, g);
    if (local < 1) u -= 0.4;
    if (!g.done.includes(a.heldId) && u > best) {
      best = u;
      plan = PLAN.RESCUE;
      kind = TARGET.PERSON;
      id = a.heldId;
      tx = a.heldX;
      tz = a.heldZ;
    }
  }

  // ── charge au contact d'un agent isolé ou à terre ──
  if (clash && a.able >= 4) {
    const targetId = a.downId !== 0 && a.downDist < R.ASSAULT_RANGE ? a.downId : a.isolatedId;
    const d = targetId === a.downId ? a.downDist : a.isolatedDist;
    if (targetId !== 0 && d < R.ASSAULT_RANGE && !k.claimedByOther(g, targetId)) {
      const q = k.ctx.people.get(targetId);
      if (q) {
        // les collègues à portée de secours comptent : on ne charge pas au pied d'une ligne
        const mates = k.ctx.people.countIn(q.x, q.z, 14, isPoliceUp) - (q.posture === 'down' ? 0 : 1);
        let u = 0.5 + 0.25 * g.morale + (a.stamina < 0.4 ? 0.1 : 0) - mates * 0.14 - d * 0.004;
        if (riot) u += 0.08;
        if (u > best && mates <= 3) {
          best = u;
          plan = PLAN.ASSAULT;
          kind = TARGET.PERSON;
          id = targetId;
          tx = q.x;
          tz = q.z;
        }
      }
    }
  }

  // ── salves sur une ligne ──
  if (a.police >= 3 && a.dist < 100 && a.sight) {
    const hasFire = riot && (tools & (TOOL.MORTAR | TOOL.MOLOTOV)) !== 0;
    // de quoi lancer ? sinon on commence par aller en chercher, si la rue en offre
    const short = g.ammo < Math.max(2, g.throwers * 0.4) && !hasFire;
    // la rue n'a plus rien donné tout à l'heure : on fait avec ce qu'on a, ou autre chose
    const dry = k.now < g.noAmmoUntil;
    const source = short ? (dry ? g.ammo >= 2 : findSource(k, g, g.ax, g.az, R.SUPPLY_FAR)) : true;
    if (source) {
      // une ligne qui recule ou des agents épuisés : on en profite ; une ligne fraîche et nombreuse : moins
      let u = 0.42 + 0.2 * Math.min(1.5, a.ratio) + (a.closing < -0.4 ? 0.15 : 0) + (a.stamina < 0.4 ? 0.1 : 0);
      // la rue n'offre qu'un front : deux groupes y tiennent côte à côte et s'entraînent l'un l'autre ; pendant
      // qu'ils occupent la ligne, les suivants font autre chose (casse, barricade, feux) et prendront le relais
      const front = engaged(k, PLAN.VOLLEY, g);
      u += front < R.FRONT_GROUPS ? 0.06 * front : -R.FRONT_CROWDED * (front - R.FRONT_GROUPS + 1);
      u -= Math.max(0, a.dist - 60) * 0.003;
      if (!clash) u -= 0.12;
      // pas tout le bloc à la recherche de projectiles en même temps
      if (short) u -= 0.06 + 0.001 * Math.hypot(g.supplyX - g.ax, g.supplyZ - g.az) + (dry ? 0.1 : 0.12 * engaged(k, PLAN.RESUPPLY, g));
      if (u > best) {
        best = u;
        plan = short && !dry ? PLAN.RESUPPLY : PLAN.VOLLEY;
        kind = TARGET.POLICE;
        id = 0;
        tx = a.px;
        tz = a.pz;
      }
    }
  }

  // ── barricade en travers de la rue ──
  if (clash && a.able >= 4 && !g.site.lit && engaged(k, PLAN.BARRICADE, g) === 0) {
    const built = g.site.active && g.site.barricadeId !== 0;
    if (built && riot && Math.hypot(g.site.x - g.ax, g.site.z - g.az) < 60 && k.ctx.props.get(g.site.barricadeId) !== undefined) {
      // elle est debout et tout est permis maintenant : on y met le feu
      const u = 0.52;
      if (u > best) {
        best = u;
        plan = PLAN.BARRICADE;
        kind = TARGET.PLACE;
        id = 0;
        tx = g.site.x;
        tz = g.site.z;
      }
    }
    if (!built && materialAround(k, g.ax, g.az, R.BARRICADE_COLLECT) >= 4) {
      let u = 0.4 + (a.police > 0 && a.dist > R.BARRICADE_FROM_POLICE ? 0.14 : 0) + (a.closing > 0.1 && a.dist > 45 ? 0.1 : 0);
      if (a.police > 0 && a.dist < R.BARRICADE_FROM_POLICE - 6) u -= 0.4;
      if (riot) u += 0.05;
      if (u > best) {
        best = u;
        plan = PLAN.BARRICADE;
        kind = TARGET.PLACE;
        id = 0;
        tx = g.ax;
        tz = g.az;
      }
    }
  }

  // ── casse ciblée ──
  if (clash || (tools & TOOL.PAINT) !== 0) {
    const saveK = g.tKind;
    const saveId = g.tId;
    const saveX = g.tx;
    const saveZ = g.tz;
    const interest = findBreakTarget(k, g, R.BREAK_RADIUS);
    if (interest > 0 && clash) {
      const u = 0.28 + 0.4 * interest - 0.08 * engaged(k, PLAN.BREAK, g) - (a.police > 0 && a.dist < 30 ? 0.25 : 0);
      if (u > best) {
        best = u;
        plan = PLAN.BREAK;
        kind = g.tKind;
        id = g.tId;
        tx = g.tx;
        tz = g.tz;
      }
    }
    g.tKind = saveK;
    g.tId = saveId;
    g.tx = saveX;
    g.tz = saveZ;
  }

  // ── feux : poubelles au palier d'affrontement, véhicules au palier supérieur ──
  if (clash && engaged(k, PLAN.ARSON, g) === 0) {
    const v = riot ? findParkedVehicle(k, g, 60, false) : null;
    if (v) {
      const u = 0.5 + ((tools & TOOL.MOLOTOV) !== 0 ? 0.08 : 0) - (a.police > 0 && a.dist < 30 ? 0.2 : 0);
      if (u > best) {
        best = u;
        plan = PLAN.ARSON;
        kind = TARGET.VEHICLE;
        id = v.id;
        tx = v.x;
        tz = v.z;
      }
    } else {
      const bin = findBin(k, g, 40);
      if (bin) {
        const u = 0.36 - (a.police > 0 && a.dist < 25 ? 0.2 : 0);
        if (u > best) {
          best = u;
          plan = PLAN.ARSON;
          kind = TARGET.PROP;
          id = bin.id;
          tx = bin.x;
          tz = bin.z;
        }
      }
    }
  }

  // ── renverser une voiture à plusieurs ──
  if (riot && a.able >= 5 && engaged(k, PLAN.FLIP, g) === 0) {
    const v = findParkedVehicle(k, g, 50, true);
    if (v) {
      const u = 0.4 - (a.police > 0 && a.dist < 30 ? 0.2 : 0);
      if (u > best) {
        best = u;
        plan = PLAN.FLIP;
        kind = TARGET.VEHICLE;
        id = v.id;
        tx = v.x;
        tz = v.z;
      }
    }
  }

  if (plan !== PLAN.FOLLOW) {
    g.tKind = kind;
    g.tId = id;
    g.tx = tx;
    g.tz = tz;
    if (id !== 0 && kind !== TARGET.POLICE) k.claim(g, id);
    if (plan === PLAN.BARRICADE && !(g.site.active && g.site.barricadeId !== 0) && !findBarricadeSite(k, g)) return PLAN.FOLLOW;
    if (plan === PLAN.RESUPPLY) g.resume = PLAN.VOLLEY;
  }
  return plan;
}
