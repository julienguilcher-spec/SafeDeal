/* =====================================================================================
 * SAMU — travail sur place : tri, soins, évacuation.
 *
 *   tri          toutes les personnes qui ont besoin de soins autour du point d'appel (et celles qu'on
 *                vient de leur remettre) sont classées : urgence absolue, urgence relative, blessés
 *                légers et personnes gênées par le gaz ; les corps passent en dernier ;
 *   soins        le médecin prend la première, l'infirmier la suivante : bilan, gestes, rinçage ;
 *   évacuation   une urgence absolue (ou un blessé sérieux resté à terre après les soins) est portée
 *                jusqu'aux portes arrière et chargée ; une ambulance n'emporte qu'un patient couché :
 *                s'il en reste, une autre équipe est demandée pour la même intervention.
 * Une équipe venue à pied (pas de module de véhicules) emporte le blessé sur l'épaule.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi } from '@/core/extensions';
import { injuryRank } from './care';
import { ROLE_DOCTOR, ROLE_DRIVER, ROLE_NURSE, T_CASUALTY, T_STANDBY, ableBody } from './crew';
import type { CallRec, Crew, RescueKernel, Rescuer } from './crew';
import { R_BUSY, R_DONE, R_LOADED, R_NEEDS_EVAC, S_DECIDE, S_EVAC_PICKUP } from './crew-tasks';
import type { CrewTasks } from './crew-tasks';
import { holdFacing } from './nav';
import type { RescueRadio } from './radio';
import { NO_VICTIM_LEAVE, WORK_RADIUS } from './tuning';

export class MedicalWork {
  private readonly near: Person[] = [];
  private readonly scores: number[] = [];

  constructor(private readonly k: RescueKernel, private readonly tasks: CrewTasks, private readonly radio: RescueRadio) {}

  /** La personne relève-t-elle de l'équipe médicale ? */
  private needs(crew: Crew, q: Person): boolean {
    const care = this.k.care;
    if (q.faction === 'rescue' && crew.memberOf(q.id)) return false;
    if (q.dormant || q.vehicleId !== 0) return false;
    if (q.heldBy !== 0 && !crew.memberOf(q.heldBy)) return false; // encore portée vers nous
    if (care.needsCare(q) || care.needsEvacuation(q)) return true;
    return care.needsRinse(q) && q.gas > 0.3;
  }

  /** Victimes à traiter, les plus urgentes d'abord (dans crew.victims). Retourne leur nombre. */
  triage(crew: Crew, x: number, z: number): number {
    const k = this.k;
    const care = k.care;
    const n = k.ctx.people.queryRadius(x, z, WORK_RADIUS + 8, this.near);
    const out = crew.victims;
    const scores = this.scores;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const q = this.near[i];
      if (!this.needs(crew, q)) continue;
      const st = care.state(q.id);
      // au-delà du rayon de travail, seules les victimes remises à l'équipe comptent
      if (Math.hypot(q.x - x, q.z - z) > WORK_RADIUS && !(st && st.handedOver)) continue;
      // déjà stabilisée et sans place dans l'ambulance : elle attend la suivante
      if (st && st.treatedAt >= 0 && !care.needsCare(q) && !care.needsRinse(q) && crew.patientId !== 0) continue;
      let score = care.priority(q);
      if (st && st.handedOver) score += 60;
      // insertion triée
      let j = c - 1;
      if (c < out.length) out[c] = q;
      else out.push(q);
      if (c >= scores.length) scores.push(0);
      while (j >= 0 && scores[j] < score) {
        out[j + 1] = out[j];
        scores[j + 1] = scores[j];
        j--;
      }
      out[j + 1] = q;
      scores[j + 1] = score;
      c++;
    }
    out.length = c;
    return c;
  }

  /** Un pas de réflexion de l'équipe sur place. Retourne true quand il n'y a plus rien à faire. */
  think(crew: Crew, call: CallRec, _dt: number): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const count = this.triage(crew, call.x, call.z);
    if (count > 0) {
      crew.lastVictimAt = now;
      crew.foundWork = true;
    }
    let working = false;
    const members = crew.members;
    for (let i = 0; i < members.length; i++) {
      const r = members[i];
      const p = r.p;
      if (p.isPlayer || !ableBody(ctx, p)) continue;
      if (r.role === ROLE_DRIVER && crew.vehicle && !crew.onFoot) continue; // l'ambulancier reste au volant, prêt à partir
      if (p.vehicleId !== 0) {
        ctx.vehicles.exit(p);
        if (p.vehicleId !== 0) continue;
      }
      if (r.role !== ROLE_DOCTOR && r.role !== ROLE_NURSE && r.role !== ROLE_DRIVER) continue;
      if (this.carer(crew, call, r)) working = true;
    }
    if (working) return false;
    // plus personne à traiter : s'il n'y a jamais eu de victime, on cherche un moment avant de repartir
    if (!crew.foundWork) return now - crew.phaseAt >= NO_VICTIM_LEAVE;
    return now - crew.lastVictimAt >= 2 || crew.patientId !== 0;
  }

  /** Un pas d'un soignant. Retourne true tant qu'il est occupé. */
  private carer(crew: Crew, call: CallRec, r: Rescuer): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const p = r.p;
    // celui qui porte le patient d'une équipe à pied ne fait plus rien d'autre
    if (crew.onFoot && crew.patientId !== 0 && p.carrying === crew.patientId) return false;
    if (r.task !== T_CASUALTY) {
      let next: Person | null = null;
      for (let i = 0; i < crew.victims.length; i++) {
        const q = crew.victims[i];
        const claimed = k.care.claimedBy(q.id);
        if (claimed !== 0 && claimed !== p.id) continue;
        next = q;
        break;
      }
      if (!next) {
        // rien pour lui : il se tient près du collègue qui travaille, ou du point d'appel
        r.task = T_STANDBY;
        if (!this.tasks.busy(p)) {
          if (Math.hypot(call.x - p.x, call.z - p.z) > 4) r.walker.goTo(ctx, p, call.x, call.z, 3);
          else {
            r.walker.stop(p);
            holdFacing(p, call.x, call.z);
          }
        }
        return false;
      }
      this.tasks.takeCasualty(r, next, p.x, p.z);
      // l'équipe médicale soigne sur place : elle ne déplace la victime que pour l'évacuer
    }
    const canLoad = crew.patientId === 0 || crew.patientId === r.targetId;
    const res = this.tasks.casualty(crew, r, canLoad);
    if (res === R_BUSY) {
      // le médecin est en train de porter le patient vers l'ambulance : il est réservé
      if (r.stage >= S_EVAC_PICKUP && crew.patientId === 0) crew.patientId = r.targetId;
      return true;
    }
    const victim = ctx.people.get(r.targetId);
    if (res === R_LOADED && victim) {
      crew.patientId = victim.id;
      call.record.victimsTreated++;
      call.record.victimsEvacuated++;
      this.radio.evacuation(call, crew, injuryRank(victim.injury) >= 3 ? 'critique' : 'sérieuse');
    } else if (res === R_NEEDS_EVAC && victim) {
      // pas de place : elle est stabilisée et attend l'ambulance suivante
      if (crew.patientId === r.targetId) crew.patientId = 0;
      call.record.victimsTreated++;
      crew.leftBehind++;
      this.askAgain(call, victim);
    } else if (res === R_DONE && victim) {
      if (k.care.state(victim.id)?.treatedBy === p.id || r.stage >= S_DECIDE) call.record.victimsTreated++;
      if (crew.patientId === r.targetId) crew.patientId = 0;
    } else if (crew.patientId === r.targetId && (!victim || victim.vehicleId === 0)) {
      crew.patientId = 0;
    }
    this.tasks.release(r);
    return true;
  }

  /** Une victime à évacuer reste sur place : une autre ambulance est demandée pour elle. */
  private askAgain(call: CallRec, victim: Person): void {
    const k = this.k;
    const rescue = k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return;
    // l'appel en cours occupe déjà ce lieu : la demande est déposée et partira quand celui-ci sera clos
    k.pendingSamu.push({ x: victim.x, z: victim.z, victimId: victim.id, incidentId: call.incidentId, after: call.id });
  }
}
