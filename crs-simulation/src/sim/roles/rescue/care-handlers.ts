/* =====================================================================================
 * SOINS — gestes d'interaction (mêmes gestes pour le joueur et pour les IA) :
 *
 *   soigner      bilan (5 s : révèle la couleur de tri), puis gestes selon la gravité — pansement compressif
 *                (8 s), compression et immobilisation (12 s), garrot et mise en condition (15 s). Effet : la
 *                blessure cesse de s'aggraver ; les points rendus dépendent de la compétence du soignant. Une
 *                urgence absolue reste à terre : elle est stabilisée, pas guérie — il faut l'évacuer.
 *   rincer_yeux  sérum physiologique (6 s, une dose) : l'exposition au gaz retombe (60 s de gêne ramenées à 20).
 *   remettre     remettre aux secours officiels le blessé que l'on porte (4 s), près d'un pompier ou d'un soignant du SAMU.
 *   evacuer      charger dans l'ambulance le blessé que l'on porte (5 s) : c'est la pose sur le brancard.
 *
 * La trousse de secours et le sérum sont exigés quand le module du matériel est branché (une dose par
 * geste ; si l'objet en main en a déjà consommé une en lançant le geste, on n'en retire pas une seconde).
 * Durées : bible §G.3 et dossier 06 §10.3.
 * ===================================================================================== */

import type {
  EntityId, GameContext, InteractionHandler, InteractionOption, InteractVerb, ItemId, Person, Vehicle,
} from '@/core/contracts';
import type { CareService, CareSession } from './care';
import { injuryRank } from './care';
import {
  BILAN_TIME, CARE_CRITICAL, CARE_LIGHT, CARE_REACH, CARE_SERIOUS, HANDOVER_TIME, LOAD_TIME, RINSE_TIME,
} from './tuning';

/** Ce que ce module utilise du service étendu de santé du module des personnes, quand il est branché. */
interface HealthExtLike {
  rinseEyes(p: Person, byId: EntityId): void;
  extinguish(p: Person, byId: EntityId): void;
  stabilise(p: Person, byId: EntityId): void;
}

/** Un bilan récent n'est pas refait (s). */
const BILAN_VALID = 90;
/** Une urgence absolue stabilisée reste sous ce seuil de points de vie : elle ne se relève pas. */
const CRITICAL_CAP = 24;

function makeOption(verb: InteractVerb): InteractionOption {
  return { verb, targetKind: 'person', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
}

/** Compétence du soignant 0..1 : médecin et infirmier du SAMU, sapeur-pompier, secouriste formé, autre. */
export function careSkill(actor: Person): number {
  switch (actor.kind) {
    case 'samu': return 1;
    case 'pompier': return 0.8;
    case 'street_medic': return 0.6;
    default: return actor.faction === 'police' ? 0.6 : 0.4;
  }
}

export function createCareHandlers(ctx: GameContext, care: CareService): InteractionHandler[] {
  const near: Person[] = [];
  const nearVehicles: Vehicle[] = [];

  function able(actor: Person): boolean {
    return actor.vehicleId === 0 && actor.heldBy === 0 && actor.custody === 'free' && !actor.dormant && actor.stun <= 0.2
      && !ctx.health.isIncapacitated(actor) && (actor.posture === 'stand' || actor.posture === 'crouch' || actor.posture === 'kneel');
  }

  /** L'acteur a-t-il de quoi faire le geste ? (exigé seulement si le module du matériel connaît l'objet) */
  function hasKit(actor: Person, item: ItemId): boolean {
    return ctx.actions.def(item) === undefined || ctx.actions.has(actor, item) > 0;
  }

  function kitCount(actor: Person, item: ItemId): number {
    return ctx.actions.def(item) === undefined ? -1 : ctx.actions.has(actor, item);
  }

  /** Retire une dose, sauf si l'objet en main en a déjà retiré une en lançant le geste. */
  function spendKit(actor: Person, item: ItemId, before: number): void {
    if (before < 0) return;
    if (ctx.actions.has(actor, item) >= before) ctx.actions.remove(actor, item, 1);
  }

  function inReach(actor: Person, t: Person, slack: number): boolean {
    const dx = t.x - actor.x;
    const dz = t.z - actor.z;
    const r = CARE_REACH + t.radius + slack;
    return dx * dx + dz * dz <= r * r;
  }

  function fill(opt: InteractionOption, t: Person, label: string, priority: number, duration: number): InteractionOption {
    opt.targetKind = 'person';
    opt.targetId = t.id;
    opt.label = label;
    opt.priority = priority;
    opt.duration = duration;
    opt.x = t.x;
    opt.z = t.z;
    return opt;
  }

  function face(actor: Person, t: Person): void {
    if (actor.isPlayer) return;
    const dx = t.x - actor.x;
    const dz = t.z - actor.z;
    if (dx * dx + dz * dz > 0.01) actor.cmd.aimYaw = Math.atan2(dx, dz);
    actor.cmd.faceMove = false;
  }

  function beginGesture(actor: Person): void {
    actor.upper = 'treat';
    actor.upperT = 0;
  }

  function endGesture(actor: Person): void {
    if (actor.upper === 'treat') {
      actor.upper = 'none';
      actor.upperT = 0;
    }
    care.close(actor);
  }

  // ───────────────────────────── soigner ─────────────────────────────

  function treatable(actor: Person, t: Person | undefined): t is Person {
    return !!t && t !== actor && !t.dormant && t.vehicleId === 0 && t.heldBy === 0 && inReach(actor, t, 0) && care.needsCare(t);
  }

  function findPatient(actor: Person, targetId: EntityId | undefined, ok: (actor: Person, t: Person | undefined) => t is Person): Person | null {
    if (targetId !== undefined) {
      const t = ctx.people.get(targetId);
      return ok(actor, t) ? t : null;
    }
    const n = ctx.people.queryRadius(actor.x, actor.z, CARE_REACH + 0.5, near);
    let best: Person | null = null;
    let bestP = -Infinity;
    for (let i = 0; i < n; i++) {
      const t = near[i];
      if (!ok(actor, t)) continue;
      const pr = care.priority(t);
      if (pr > bestP) {
        bestP = pr;
        best = t;
      }
    }
    return best;
  }

  function bilanTime(t: Person): number {
    const st = care.state(t.id);
    return st && st.evaluatedAt >= 0 && ctx.clock.now - st.evaluatedAt < BILAN_VALID ? 0 : BILAN_TIME;
  }

  function careTime(actor: Person, t: Person): number {
    const rank = injuryRank(t.injury);
    let gestures = rank >= 4 ? 0 : rank === 3 ? CARE_CRITICAL : rank === 2 ? CARE_SERIOUS : CARE_LIGHT;
    if (actor.kind === 'samu') gestures *= 0.8;
    return bilanTime(t) + gestures;
  }

  const treatOpt = makeOption('soigner');
  const soigner: InteractionHandler = {
    verb: 'soigner',
    find(actor, targetId) {
      if (!able(actor) || actor.carrying !== 0 || !hasKit(actor, 'trousse_secours')) return null;
      const t = findPatient(actor, targetId, treatable);
      if (!t) return null;
      const rank = injuryRank(t.injury);
      const label = rank >= 4 ? 'Examiner la personne'
        : t.faction === 'police' && actor.faction === 'police' ? 'Soigner le collègue' : 'Soigner le blessé';
      // un blessé grave se soigne avant de se porter ; un blessé léger passe après les autres gestes
      const priority = rank >= 4 ? 30 : rank >= 2 || t.posture === 'down' ? 78 : 55;
      return fill(treatOpt, t, label, priority, careTime(actor, t));
    },
    begin(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      if (!able(actor) || actor.carrying !== 0 || !treatable(actor, t)) return false;
      const session: CareSession = {
        actor, target: t, verb: 'soigner', bilan: bilanTime(t), triaged: false, kitBefore: kitCount(actor, 'trousse_secours'),
        injuryBefore: injuryRank(t.injury), gasBefore: t.gas,
      };
      care.open(session);
      care.noteNeed(t);
      beginGesture(actor);
      face(actor, t);
      return true;
    },
    tick(actor, opt, elapsed, dt) {
      const t = ctx.people.get(opt.targetId);
      const s = care.sessionOf(actor);
      if (!t || !s || t.vehicleId !== 0 || (t.heldBy !== 0 && t.heldBy !== actor.id) || !inReach(actor, t, 0.7)) return false;
      actor.upperT += dt;
      face(actor, t);
      if (!s.triaged && elapsed >= s.bilan) {
        s.triaged = true;
        care.reveal(t, actor.id);
      }
      return true;
    },
    complete(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      const s = care.sessionOf(actor);
      if (!t || !s) {
        endGesture(actor);
        return;
      }
      const triage = s.triaged ? care.ensure(t.id).triage : care.reveal(t, actor.id);
      const rank = injuryRank(t.injury);
      const skill = careSkill(actor);
      const ext = ctx.service<HealthExtLike>('people.health');
      let stabilised = false;
      if (t.burning > 0) {
        if (ext) ext.extinguish(t, actor.id);
        else t.burning = 0;
      }
      if (rank >= 1 && rank <= 3) {
        if (ext) ext.stabilise(t, actor.id);
        stabilised = true;
        let amount: number;
        if (rank === 3) {
          // urgence absolue : mise en condition, sans la relever
          amount = Math.min(4 + 8 * skill, CRITICAL_CAP - t.health);
        } else if (rank === 2) {
          amount = 6 + 16 * skill;
        } else {
          amount = 10 + 20 * skill;
        }
        if (amount > 0) ctx.health.heal(t, amount, actor.id);
      }
      const st = care.ensure(t.id);
      st.treatedAt = ctx.clock.now;
      st.treatedBy = actor.id;
      st.treatedHealth = t.health;
      spendKit(actor, 'trousse_secours', s.kitBefore);
      care.record('soigner', actor, t, triage, s.injuryBefore, s.gasBefore, stabilised);
      endGesture(actor);
    },
    cancel(actor) {
      endGesture(actor);
    },
  };

  // ───────────────────────────── rincer les yeux ─────────────────────────────

  function rinsable(actor: Person, t: Person | undefined): t is Person {
    return !!t && t !== actor && !t.dormant && t.vehicleId === 0 && inReach(actor, t, 0) && care.needsRinse(t);
  }

  const rinseOpt = makeOption('rincer_yeux');
  const rincer: InteractionHandler = {
    verb: 'rincer_yeux',
    find(actor, targetId) {
      if (!able(actor) || actor.carrying !== 0 || !hasKit(actor, 'serum_physiologique')) return null;
      const t = findPatient(actor, targetId, rinsable);
      if (!t) return null;
      return fill(rinseOpt, t, 'Rincer les yeux', 58, RINSE_TIME);
    },
    begin(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      if (!able(actor) || actor.carrying !== 0 || !rinsable(actor, t)) return false;
      care.open({
        actor, target: t, verb: 'rincer_yeux', bilan: 0, triaged: true, kitBefore: kitCount(actor, 'serum_physiologique'),
        injuryBefore: injuryRank(t.injury), gasBefore: t.gas,
      });
      care.noteNeed(t);
      beginGesture(actor);
      face(actor, t);
      return true;
    },
    tick(actor, opt, _elapsed, dt) {
      const t = ctx.people.get(opt.targetId);
      if (!t || t.vehicleId !== 0 || !inReach(actor, t, 0.7)) return false;
      actor.upperT += dt;
      face(actor, t);
      return true;
    },
    complete(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      const s = care.sessionOf(actor);
      if (!t || !s) {
        endGesture(actor);
        return;
      }
      const ext = ctx.service<HealthExtLike>('people.health');
      if (ext) {
        ext.rinseEyes(t, actor.id); // la gêne retombe trois fois plus vite pendant 30 s
      } else {
        t.gas *= 0.35;
      }
      // le plus gros est chassé tout de suite ; la personne est rassurée
      t.gas *= 0.7;
      t.fear *= 0.7;
      const st = care.ensure(t.id);
      st.rinsedAt = ctx.clock.now;
      spendKit(actor, 'serum_physiologique', s.kitBefore);
      care.record('rincer_yeux', actor, t, care.triage(t), s.injuryBefore, s.gasBefore, false);
      endGesture(actor);
    },
    cancel(actor) {
      endGesture(actor);
    },
  };

  // ───────────────────────────── remettre aux secours ─────────────────────────────

  /** Blessé porté ou traîné par l'acteur (pas une personne interpellée). */
  function carried(actor: Person): Person | null {
    if (actor.carrying === 0) return null;
    const t = ctx.people.get(actor.carrying);
    return t && t.heldBy === actor.id && t.posture === 'down' && t.custody === 'free' ? t : null;
  }

  function rescuerNear(actor: Person): Person | null {
    const n = ctx.people.queryRadius(actor.x, actor.z, 4, near);
    for (let i = 0; i < n; i++) {
      const q = near[i];
      if (q === actor || q.faction !== 'rescue' || q.vehicleId !== 0 || ctx.health.isIncapacitated(q)) continue;
      return q;
    }
    return null;
  }

  /** Dépose le blessé porté : les liens sont défaits ici (le module des personnes tolère la rupture du lien par un tiers). */
  function letGo(actor: Person, t: Person): void {
    actor.carrying = 0;
    t.heldBy = 0;
    if (actor.upper === 'carry_person' || actor.upper === 'drag') {
      actor.upper = 'none';
      actor.upperT = 0;
    }
  }

  const handOpt = makeOption('remettre');
  const remettre: InteractionHandler = {
    verb: 'remettre',
    find(actor, targetId) {
      if (actor.faction === 'rescue' || actor.vehicleId !== 0 || ctx.health.isIncapacitated(actor)) return null;
      const t = carried(actor);
      if (!t || (targetId !== undefined && targetId !== t.id) || !rescuerNear(actor)) return null;
      return fill(handOpt, t, 'Remettre aux secours', 96, HANDOVER_TIME);
    },
    begin(actor, opt) {
      const t = carried(actor);
      if (!t || t.id !== opt.targetId || !rescuerNear(actor)) return false;
      care.open({ actor, target: t, verb: 'remettre', bilan: 0, triaged: true, kitBefore: -1, injuryBefore: injuryRank(t.injury), gasBefore: t.gas });
      return true;
    },
    tick(actor, opt) {
      const t = carried(actor);
      return t !== null && t.id === opt.targetId;
    },
    complete(actor, opt) {
      const t = carried(actor);
      const s = care.sessionOf(actor);
      care.close(actor);
      if (!t || t.id !== opt.targetId) return;
      letGo(actor, t);
      const st = care.ensure(t.id);
      st.handedOver = true;
      st.handedAt = ctx.clock.now;
      care.noteNeed(t);
      care.record('remettre', actor, t, care.triage(t), s ? s.injuryBefore : injuryRank(t.injury), t.gas, false);
    },
    cancel(actor) {
      care.close(actor);
    },
  };

  // ───────────────────────────── charger dans l'ambulance ─────────────────────────────

  /** Ambulance utilisable à portée, avec une place pour le brancard. Écrit la place dans seatOut[0]. */
  const seatOut = [-1];
  function ambulanceNear(actor: Person): Vehicle | null {
    const n = ctx.vehicles.queryRadius(actor.x, actor.z, 5, nearVehicles);
    for (let i = 0; i < n; i++) {
      const v = nearVehicles[i];
      if (v.kind !== 'ambulance' || v.state === 'wrecked' || v.state === 'burning' || v.state === 'burnt' || Math.abs(v.speed) > 0.5) continue;
      // la dernière place libre est celle du brancard
      for (let s = v.seats.length - 1; s >= 0; s--) {
        if (v.seats[s] === 0 && v.def.seats[s].role === 'passenger') {
          seatOut[0] = s;
          return v;
        }
      }
    }
    return null;
  }

  const loadOpt = makeOption('evacuer');
  const evacuer: InteractionHandler = {
    verb: 'evacuer',
    find(actor, targetId) {
      if (actor.vehicleId !== 0 || ctx.health.isIncapacitated(actor)) return null;
      const t = carried(actor);
      if (!t || (targetId !== undefined && targetId !== t.id) || !ambulanceNear(actor)) return null;
      return fill(loadOpt, t, 'Charger dans l’ambulance', 97, LOAD_TIME);
    },
    begin(actor, opt) {
      const t = carried(actor);
      if (!t || t.id !== opt.targetId || !ambulanceNear(actor)) return false;
      care.open({ actor, target: t, verb: 'evacuer', bilan: 0, triaged: true, kitBefore: -1, injuryBefore: injuryRank(t.injury), gasBefore: t.gas });
      return true;
    },
    tick(actor, opt) {
      const t = carried(actor);
      return t !== null && t.id === opt.targetId;
    },
    complete(actor, opt) {
      const t = carried(actor);
      const s = care.sessionOf(actor);
      care.close(actor);
      if (!t || t.id !== opt.targetId) return;
      const v = ambulanceNear(actor);
      if (!v) return;
      letGo(actor, t);
      if (!ctx.vehicles.enter(t, v, seatOut[0])) return; // place prise entre-temps : le blessé est posé au sol
      const st = care.ensure(t.id);
      st.loaded = true;
      care.record('evacuer', actor, t, care.triage(t), s ? s.injuryBefore : injuryRank(t.injury), t.gas, false);
    },
    cancel(actor) {
      care.close(actor);
    },
  };

  return [soigner, rincer, remettre, evacuer];
}
