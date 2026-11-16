/* =====================================================================================
 * SECOURS — gestes élémentaires d'un secouriste à pied, communs aux pompiers et au SAMU :
 * regagner l'engin, et prendre en charge une victime (la rejoindre, la dégager d'un danger en la
 * portant, rincer, soigner, la charger dans l'ambulance). Tout passe par ctx.interactions
 * (« porter », « trainer », « deposer », « soigner », « rincer_yeux », « evacuer ») comme le ferait
 * le joueur, et par person.cmd pour se déplacer.
 * ===================================================================================== */

import type { EntityId, Person, Vehicle } from '@/core/contracts';
import { injuryRank } from './care';
import { T_BOARD, T_CASUALTY, T_IDLE, ableBody } from './crew';
import type { Crew, RescueKernel, Rescuer } from './crew';
import { holdFacing } from './nav';
import type { Spawner } from './spawn';

// ── étapes de la prise en charge d'une victime (Rescuer.stage) ──
export const S_APPROACH = 0;
export const S_PICKUP = 1;
export const S_PICKUP_WAIT = 2;
export const S_CARRY = 3;
export const S_DROP_WAIT = 4;
export const S_CARE = 5;
export const S_CARE_WAIT = 6;
export const S_DECIDE = 7;
export const S_EVAC_PICKUP = 8;
export const S_EVAC_PICKUP_WAIT = 9;
export const S_EVAC_CARRY = 10;
export const S_EVAC_LOAD_WAIT = 11;
export const S_STAY = 12;

/** Issue d'un pas de prise en charge. */
export const R_BUSY = 0;
/** Soins terminés, la victime n'a plus besoin de rien sur place. */
export const R_DONE = 1;
/** Soignée, mais elle doit être évacuée par une ambulance. */
export const R_NEEDS_EVAC = 2;
/** Chargée dans l'ambulance (ou sur l'épaule d'un équipier à pied). */
export const R_LOADED = 3;
/** Abandon : victime disparue, relevée, prise par quelqu'un d'autre, ou geste impossible. */
export const R_GIVE_UP = 4;

const REACH = 1.35;
/** Sans approcher de son but depuis ce temps (s), un porteur fait au mieux d'où il est. */
const REACH_PATIENCE = 6;
/** Distance au centre de l'ambulance en deçà de laquelle le brancard peut être chargé (m ; le geste « evacuer » accepte 5 m). */
const LOAD_REACH = 4.6;

export class CrewTasks {
  constructor(private readonly k: RescueKernel, private readonly spawner: Spawner) {}

  busy(p: Person): boolean {
    return this.k.ctx.interactions.current(p) !== null;
  }

  /** Fait avancer la marche de chaque membre (à chaque pas de simulation). */
  stepWalkers(crew: Crew): void {
    const ctx = this.k.ctx;
    const members = crew.members;
    for (let i = 0; i < members.length; i++) {
      const r = members[i];
      const p = r.p;
      if (p.isPlayer || p.vehicleId !== 0 || !r.walker.active) continue;
      if (!ableBody(ctx, p) || this.busy(p)) {
        p.cmd.moveX = 0;
        p.cmd.moveZ = 0;
        continue;
      }
      // au pas quand on porte quelqu'un, au trot sinon
      r.walker.step(ctx, p, p.carrying !== 0 ? 0 : 1);
    }
  }

  /** Point où se présenter pour monter : le flanc de l'engin le plus proche. */
  private doorPoint(v: Vehicle, p: Person, out: { x: number; z: number }): void {
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    // droite du véhicule = (−cos h, sin h)
    const side = (p.x - v.x) * -ch + (p.z - v.z) * sh >= 0 ? 1 : -1;
    const off = v.def.width * 0.5 + 0.9;
    out.x = v.x - ch * off * side;
    out.z = v.z + sh * off * side;
  }

  private readonly door = { x: 0, z: 0 };

  /** Regagne l'engin et monte à bord. Retourne true une fois à bord (ou si le membre ne peut plus agir). */
  board(crew: Crew, r: Rescuer): boolean {
    const ctx = this.k.ctx;
    const p = r.p;
    const v = crew.vehicle;
    if (!v || p.vehicleId === v.id) return true;
    if (!ableBody(ctx, p)) return true;
    if (r.task !== T_BOARD) {
      r.task = T_BOARD;
      r.stage = 0;
      ctx.interactions.cancel(p);
      if (p.carrying !== 0) ctx.interactions.startVerb(p, 'deposer', p.carrying);
    }
    this.doorPoint(v, p, this.door);
    const d = Math.hypot(this.door.x - p.x, this.door.z - p.z);
    if (d <= 1.5) {
      r.walker.stop(p);
      if (p.carrying === 0 && !this.busy(p)) this.spawner.seat(p, v, r.role, crew.members.indexOf(r));
      return p.vehicleId === v.id;
    }
    r.walker.goTo(ctx, p, this.door.x, this.door.z, 1.2);
    return false;
  }

  /** Affecte une victime à un membre. */
  takeCasualty(r: Rescuer, victim: Person, safeX: number, safeZ: number): void {
    r.task = T_CASUALTY;
    r.stage = S_APPROACH;
    r.targetId = victim.id;
    r.targetKind = 'person';
    r.sx = safeX;
    r.sz = safeZ;
    r.tries = 0;
    r.nextAt = 0;
  }

  release(r: Rescuer): void {
    if (r.targetId !== 0) this.k.care.release(r.targetId, r.p.id);
    r.task = T_IDLE;
    r.stage = 0;
    r.targetId = 0;
    r.tries = 0;
  }

  /** La victime est-elle exposée là où elle se trouve (feu tout près, gaz dense) ? */
  inDanger(crew: Crew, victim: Person): boolean {
    const ctx = this.k.ctx;
    if (ctx.hazards.fireAt(victim.x, victim.z) > 0.03 || ctx.hazards.gasAt(victim.x, victim.z) > 0.4) return true;
    for (let i = 0; i < crew.fireCount; i++) {
      const f = crew.fires[i];
      const d = Math.hypot(f.x - victim.x, f.z - victim.z);
      if (d < f.r + 6) return true;
    }
    return false;
  }

  /**
   * Un pas de la prise en charge d'une victime. `evacuate` : l'équipage peut la charger (ambulance libre,
   * ou équipe à pied qui l'emporte). Retourne R_BUSY tant que ce n'est pas fini.
   */
  /** Le porteur n'approche plus de son but depuis plusieurs secondes (`d` : distance restante). */
  private cannotReach(r: Rescuer, d: number): boolean {
    const now = this.k.now;
    if (d < r.reachBest - 0.4) {
      r.reachBest = d;
      r.reachAt = now;
      return false;
    }
    return now - r.reachAt > REACH_PATIENCE;
  }

  casualty(crew: Crew, r: Rescuer, evacuate: boolean): number {
    const k = this.k;
    const ctx = k.ctx;
    const p = r.p;
    const now = k.now;
    const victim = ctx.people.get(r.targetId);
    if (!victim || victim.dormant) return R_GIVE_UP;
    const mine = victim.heldBy === p.id;
    if (victim.heldBy !== 0 && !mine) return R_GIVE_UP; // quelqu'un d'autre l'emporte
    if (victim.vehicleId !== 0) return r.stage >= S_EVAC_CARRY ? R_LOADED : R_GIVE_UP;
    k.care.claim(victim.id, p.id, 20);
    k.care.noteNeed(victim);
    if (this.busy(p)) {
      r.walker.stop(p);
      return R_BUSY;
    }
    if (now < r.nextAt) return R_BUSY;
    const d = Math.hypot(victim.x - p.x, victim.z - p.z);
    switch (r.stage) {
      case S_APPROACH:
        if (d > REACH) {
          r.walker.goTo(ctx, p, victim.x, victim.z, 1.1);
          return R_BUSY;
        }
        r.walker.stop(p);
        holdFacing(p, victim.x, victim.z);
        r.stage = victim.posture === 'down' && this.inDanger(crew, victim) ? S_PICKUP : S_CARE;
        return R_BUSY;

      case S_PICKUP:
      case S_EVAC_PICKUP: {
        if (victim.posture !== 'down') {
          r.stage = r.stage === S_PICKUP ? S_CARE : S_DECIDE;
          return R_BUSY;
        }
        if (d > REACH + 0.3) {
          r.walker.goTo(ctx, p, victim.x, victim.z, 1.1);
          return R_BUSY;
        }
        r.walker.stop(p);
        if (ctx.interactions.startVerb(p, 'porter', victim.id) || ctx.interactions.startVerb(p, 'trainer', victim.id)) {
          r.stage = r.stage === S_PICKUP ? S_PICKUP_WAIT : S_EVAC_PICKUP_WAIT;
          return R_BUSY;
        }
        r.nextAt = now + 0.8;
        if (++r.tries > 6) {
          // impossible de la soulever : on la soigne sur place
          r.tries = 0;
          if (r.stage === S_PICKUP) r.stage = S_CARE;
          else return R_NEEDS_EVAC;
        }
        return R_BUSY;
      }

      case S_PICKUP_WAIT:
      case S_EVAC_PICKUP_WAIT:
        if (mine) {
          r.stage = r.stage === S_PICKUP_WAIT ? S_CARRY : S_EVAC_CARRY;
          r.tries = 0;
          r.reachBest = Infinity;
          r.reachAt = now;
        } else {
          r.stage = r.stage === S_PICKUP_WAIT ? S_PICKUP : S_EVAC_PICKUP;
          r.nextAt = now + 0.4;
        }
        return R_BUSY;

      case S_CARRY: {
        if (!mine) {
          r.stage = S_APPROACH;
          return R_BUSY;
        }
        // (point inaccessible — mobilier, véhicule en travers : après quelques secondes sans s'en approcher, il la pose là)
        if (Math.hypot(r.sx - p.x, r.sz - p.z) > 1.2 && !this.cannotReach(r, Math.hypot(r.sx - p.x, r.sz - p.z))) {
          r.walker.goTo(ctx, p, r.sx, r.sz, 1);
          return R_BUSY;
        }
        r.walker.stop(p);
        if (ctx.interactions.startVerb(p, 'deposer', victim.id)) r.stage = S_DROP_WAIT;
        else if (++r.tries > 10) return R_GIVE_UP;
        return R_BUSY;
      }

      case S_DROP_WAIT:
        r.stage = mine ? S_CARRY : S_CARE;
        r.tries = 0;
        return R_BUSY;

      case S_CARE: {
        if (d > REACH + 0.2) {
          r.walker.goTo(ctx, p, victim.x, victim.z, 1.1);
          return R_BUSY;
        }
        r.walker.stop(p);
        holdFacing(p, victim.x, victim.z);
        const rank = injuryRank(victim.injury);
        // une personne seulement gênée par le gaz : rinçage ; une blessée : soins d'abord, rinçage ensuite
        const rinse = k.care.needsRinse(victim) && victim.gas > 0.25;
        const treat = k.care.needsCare(victim);
        let verb: 'soigner' | 'rincer_yeux' | '' = '';
        if (treat && (rank >= 2 || !rinse)) verb = 'soigner';
        else if (rinse) verb = 'rincer_yeux';
        else if (treat) verb = 'soigner';
        if (verb === '') {
          r.stage = S_DECIDE;
          return R_BUSY;
        }
        if (ctx.interactions.startVerb(p, verb, victim.id)) {
          r.stage = S_CARE_WAIT;
          return R_BUSY;
        }
        r.nextAt = now + 0.7;
        if (++r.tries > 5) r.stage = S_DECIDE; // plus de matériel, ou geste refusé
        return R_BUSY;
      }

      case S_CARE_WAIT:
        r.stage = S_CARE; // un autre geste peut suivre (soins puis rinçage)
        return R_BUSY;

      case S_DECIDE: {
        if (!k.care.needsEvacuation(victim)) {
          // sérieusement atteinte et encore à terre : on attend de voir si elle se relève après les soins
          if (injuryRank(victim.injury) === 2 && victim.posture === 'down') {
            const st = k.care.state(victim.id);
            if (st && st.treatedAt >= 0 && now - st.treatedAt <= 4.2) return R_BUSY;
          }
          return R_DONE;
        }
        if (!evacuate) return R_NEEDS_EVAC;
        r.stage = S_EVAC_PICKUP;
        r.tries = 0;
        return R_BUSY;
      }

      case S_EVAC_CARRY: {
        if (!mine) {
          r.stage = S_EVAC_PICKUP;
          return R_BUSY;
        }
        const v = crew.vehicle;
        if (!v || crew.onFoot) return R_LOADED; // équipe à pied : il l'emporte sur l'épaule
        // portes arrière de l'ambulance
        const back = v.def.length * 0.5 + 1.3;
        const bx = v.x - Math.sin(v.heading) * back;
        const bz = v.z - Math.cos(v.heading) * back;
        // (portes arrière inaccessibles : au pied de l'ambulance, il charge par où il peut)
        const dDoor = Math.hypot(bx - p.x, bz - p.z);
        if (dDoor > 1.3 && !(this.cannotReach(r, dDoor) && Math.hypot(v.x - p.x, v.z - p.z) < LOAD_REACH)) {
          r.walker.goTo(ctx, p, bx, bz, 1);
          return R_BUSY;
        }
        r.walker.stop(p);
        if (ctx.interactions.startVerb(p, 'evacuer', victim.id)) {
          r.stage = S_EVAC_LOAD_WAIT;
        } else {
          r.nextAt = now + 0.8;
          if (++r.tries > 8) {
            ctx.interactions.startVerb(p, 'deposer', victim.id);
            return R_NEEDS_EVAC;
          }
        }
        return R_BUSY;
      }

      case S_EVAC_LOAD_WAIT:
        if (victim.vehicleId !== 0) return R_LOADED;
        r.stage = mine ? S_EVAC_CARRY : S_EVAC_PICKUP;
        return R_BUSY;

      default:
        return R_DONE;
    }
  }

  /** Reste auprès d'une victime stabilisée (en attendant l'ambulance). */
  stayWith(r: Rescuer, victimId: EntityId): void {
    const ctx = this.k.ctx;
    const victim = ctx.people.get(victimId);
    if (!victim) return;
    const p = r.p;
    const d = Math.hypot(victim.x - p.x, victim.z - p.z);
    if (d > 1.8) {
      r.walker.goTo(ctx, p, victim.x, victim.z, 1.3);
    } else {
      r.walker.stop(p);
      holdFacing(p, victim.x, victim.z);
    }
  }
}
