/* =====================================================================================
 * Interactions fournies par le module des personnes :
 *   porter   — charger sur l'épaule une personne à terre (2,5 s), quel que soit son camp ;
 *              on avance ensuite à 1,2 m/s au plus, et l'effort épuise ;
 *   trainer  — la tirer au sol par les aisselles (0,8 s) : 0,6 m/s, possible accroupi ou fatigué ;
 *   deposer  — la déposer (1,2 s depuis l'épaule, immédiat si elle est traînée) ;
 *   pousser  — repousser quelqu'un des deux mains (immédiat) : recul, déséquilibre, chute possible ;
 *              pour un policier, l'emploi de la force est déclaré (moyen « contact »).
 * Debout, « porter » est proposé en premier ; accroupi ou à bout de souffle, c'est « traîner ».
 * ===================================================================================== */

import type {
  EntityId, GameContext, InteractionHandler, InteractionOption, InteractVerb, Person, Rng,
} from '@/core/contracts';
import type { PeopleShared } from './shared';
import { HOLD_DRAG, HOLD_OTHER, HOLD_SHOULDER, shieldRaised } from './shared';
import * as T from './tuning';

function makeOption(verb: InteractVerb): InteractionOption {
  return { verb, targetKind: 'person', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
}

/** L'acteur peut-il se servir de ses deux mains pour aider ou repousser quelqu'un ? */
function handsFree(ctx: GameContext, actor: Person): boolean {
  return actor.carrying === 0 && actor.heldBy === 0 && actor.vehicleId === 0 && actor.custody === 'free'
    && actor.stun <= T.INTERRUPT_STUN && !actor.dormant && !ctx.health.isIncapacitated(actor)
    && (actor.posture === 'stand' || actor.posture === 'crouch' || actor.posture === 'kneel');
}

export function createPeopleHandlers(
  ctx: GameContext, shared: PeopleShared, addGesture: (p: Person) => void,
): InteractionHandler[] {
  const near: Person[] = [];
  let rng: Rng = ctx.rng.fork('people.interactions');
  ctx.events.on('session:started', () => {
    rng = ctx.rng.fork('people.interactions');
  });

  /** Blessé que l'on peut emporter : à terre pour de bon, pas déjà tenu, pas dans un véhicule. */
  function carriable(actor: Person, t: Person | undefined): t is Person {
    if (!t || t === actor || t.dormant || t.posture !== 'down' || t.heldBy !== 0 || t.vehicleId !== 0) return false;
    if (t.custody === 'in_vehicle' || t.custody === 'handed_over') return false;
    // quelqu'un qui a simplement chuté et va se relever seul n'a pas besoin d'être porté
    const e = shared.peek(t.id);
    if (e && e.downTimer > 0 && t.injury !== 'serious' && t.injury !== 'critical' && t.injury !== 'dead') return false;
    const dx = t.x - actor.x;
    const dz = t.z - actor.z;
    return dx * dx + dz * dz <= T.CARRY_REACH * T.CARRY_REACH;
  }

  function findCasualty(actor: Person, targetId: EntityId | undefined): Person | null {
    if (targetId !== undefined) {
      const t = ctx.people.get(targetId);
      return carriable(actor, t) ? t : null;
    }
    const n = ctx.people.queryRadius(actor.x, actor.z, T.CARRY_REACH, near);
    let best: Person | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const t = near[i]!;
      if (!carriable(actor, t)) continue;
      const dx = t.x - actor.x;
      const dz = t.z - actor.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function casualtyLabel(verb: string, actor: Person, t: Person): string {
    if (t.injury === 'dead') return `${verb} le corps`;
    if (t.faction === 'police' && actor.faction === 'police') return `${verb} le collègue blessé`;
    return `${verb} le blessé`;
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

  /** Mains libres pour le portage : bouclier baissé, objet rangé. */
  function freeHands(actor: Person): void {
    ctx.actions.setAlt(actor, false);
    actor.alt = false;
    if (actor.active !== -1) {
      ctx.actions.select(actor, -1);
      actor.active = -1;
    }
  }

  // ───────────────────────────── porter ─────────────────────────────

  const carryOpt = makeOption('porter');
  const porter: InteractionHandler = {
    verb: 'porter',
    find(actor, targetId) {
      if (!handsFree(ctx, actor)) return null;
      if (actor.injury !== 'none' && actor.injury !== 'light') return null;
      if (actor.stamina < T.CARRY_MIN_STAMINA) return null;
      const t = findCasualty(actor, targetId);
      if (!t) return null;
      const crouched = actor.posture !== 'stand';
      return fill(carryOpt, t, casualtyLabel('Porter', actor, t), crouched ? 50 : 70, T.CARRY_TIME);
    },
    begin(actor, opt) {
      if (!handsFree(ctx, actor) || !carriable(actor, ctx.people.get(opt.targetId))) return false;
      freeHands(actor);
      actor.upper = 'pickup';
      actor.upperT = 0;
      return true;
    },
    tick(actor, opt, _elapsed, dt) {
      if (!carriable(actor, ctx.people.get(opt.targetId))) return false;
      actor.upperT += dt;
      return true;
    },
    complete(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      if (!carriable(actor, t)) {
        if (actor.upper === 'pickup') actor.upper = 'none';
        return;
      }
      shared.attach(actor, t, HOLD_SHOULDER);
    },
    cancel(actor) {
      if (actor.upper === 'pickup') {
        actor.upper = 'none';
        actor.upperT = 0;
      }
    },
  };

  // ───────────────────────────── traîner ─────────────────────────────

  const dragOpt = makeOption('trainer');
  const trainer: InteractionHandler = {
    verb: 'trainer',
    find(actor, targetId) {
      if (!handsFree(ctx, actor)) return null;
      const t = findCasualty(actor, targetId);
      if (!t) return null;
      return fill(dragOpt, t, casualtyLabel('Traîner', actor, t), 60, T.DRAG_TIME);
    },
    begin(actor, opt) {
      if (!handsFree(ctx, actor) || !carriable(actor, ctx.people.get(opt.targetId))) return false;
      freeHands(actor);
      actor.upper = 'pickup';
      actor.upperT = 0;
      return true;
    },
    tick(actor, opt, _elapsed, dt) {
      if (!carriable(actor, ctx.people.get(opt.targetId))) return false;
      actor.upperT += dt;
      return true;
    },
    complete(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      if (!carriable(actor, t)) {
        if (actor.upper === 'pickup') actor.upper = 'none';
        return;
      }
      shared.attach(actor, t, HOLD_DRAG);
    },
    cancel(actor) {
      if (actor.upper === 'pickup') {
        actor.upper = 'none';
        actor.upperT = 0;
      }
    },
  };

  // ───────────────────────────── déposer ─────────────────────────────

  const dropOpt = makeOption('deposer');
  /** Personne portée ou traînée par l'acteur du fait de ce module (pas une escorte). */
  function carried(actor: Person): Person | null {
    if (actor.carrying === 0) return null;
    const t = ctx.people.get(actor.carrying);
    if (!t || t.heldBy !== actor.id) return null;
    const e = shared.peek(t.id);
    return e && e.holdMode !== HOLD_OTHER ? t : null;
  }
  const deposer: InteractionHandler = {
    verb: 'deposer',
    find(actor, targetId) {
      const t = carried(actor);
      if (!t || (targetId !== undefined && targetId !== t.id)) return null;
      if (ctx.health.isIncapacitated(actor)) return null;
      const onShoulder = shared.of(t).holdMode === HOLD_SHOULDER;
      return fill(dropOpt, t, onShoulder ? 'Déposer le blessé' : 'Lâcher le blessé', 95, onShoulder ? T.DROP_TIME : 0);
    },
    begin(actor, opt) {
      const t = carried(actor);
      return t !== null && t.id === opt.targetId;
    },
    tick(actor, opt) {
      const t = carried(actor);
      return t !== null && t.id === opt.targetId;
    },
    complete(actor, opt) {
      const t = carried(actor);
      if (!t || t.id !== opt.targetId) return;
      shared.release(actor, true);
      // remise sur pied entre-temps : la personne se relèvera d'elle-même
      const e = shared.of(t);
      if (t.posture === 'down' && t.health > T.HEALTH_CRITICAL && t.injury !== 'dead' && e.downTimer <= 0) {
        e.downTimer = T.RECOVER_AFTER_HEAL;
      }
    },
  };

  // ───────────────────────────── pousser ─────────────────────────────

  const pushOpt = makeOption('pousser');
  function pushable(actor: Person, t: Person | undefined): t is Person {
    if (!t || t === actor || t.dormant || t.vehicleId !== 0 || t.heldBy !== 0) return false;
    if (t.posture === 'down' || t.posture === 'prone' || t.posture === 'seated') return false;
    const reach = actor.radius + t.radius + T.PUSH_REACH;
    const dx = t.x - actor.x;
    const dz = t.z - actor.z;
    return dx * dx + dz * dz <= reach * reach;
  }
  const pousser: InteractionHandler = {
    verb: 'pousser',
    find(actor, targetId) {
      if (!handsFree(ctx, actor) || actor.stamina < T.PUSH_STAMINA) return null;
      if (ctx.clock.now < shared.of(actor).pushReadyAt) return null;
      let best: Person | null = null;
      if (targetId !== undefined) {
        const t = ctx.people.get(targetId);
        if (pushable(actor, t)) best = t;
      } else {
        // sans cible désignée : la personne d'un autre camp la plus proche, face à soi
        const fx = Math.sin(actor.aimYaw);
        const fz = Math.cos(actor.aimYaw);
        const n = ctx.people.queryRadius(actor.x, actor.z, actor.radius + 0.4 + T.PUSH_REACH, near);
        let bestD = Infinity;
        for (let i = 0; i < n; i++) {
          const t = near[i]!;
          if (t.faction === actor.faction || !pushable(actor, t)) continue;
          const dx = t.x - actor.x;
          const dz = t.z - actor.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 1e-4 && (dx * fx + dz * fz) / d < 0.5) continue;
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
      }
      if (!best) return null;
      return fill(pushOpt, best, 'Repousser', 15, 0);
    },
    begin(actor, opt) {
      return handsFree(ctx, actor) && actor.stamina >= T.PUSH_STAMINA && ctx.clock.now >= shared.of(actor).pushReadyAt
        && pushable(actor, ctx.people.get(opt.targetId));
    },
    complete(actor, opt) {
      const t = ctx.people.get(opt.targetId);
      if (!pushable(actor, t)) return;
      const ae = shared.of(actor);
      const now = ctx.clock.now;
      ae.pushReadyAt = now + T.PUSH_COOLDOWN;
      ae.upperUntil = now + T.PUSH_ANIM;
      actor.upper = 'push';
      actor.upperT = 0;
      addGesture(actor);
      actor.stamina = actor.stamina > T.PUSH_STAMINA ? actor.stamina - T.PUSH_STAMINA : 0;

      // direction de la poussée
      let dx = t.x - actor.x;
      let dz = t.z - actor.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-4) {
        dx /= d;
        dz /= d;
      } else {
        dx = Math.sin(actor.aimYaw);
        dz = Math.cos(actor.aimYaw);
      }
      // force : carrure et état de celui qui pousse, résistance de celui qui est poussé
      let force = T.PUSH_SPEED * (actor.look.build > 0.5 ? actor.look.build : 1);
      if (actor.injury === 'light') force *= 0.8;
      if (ae.winded) force *= 0.7;
      const resist = shared.resistOf(t.id);
      const braced = shieldRaised(t) && -(dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) > T.SHIELD_ARC_COS;
      let v = force / (0.5 + 0.5 * resist);
      if (braced) v *= 0.6;
      t.vx += dx * v;
      t.vz += dz * v;
      if (!braced && t.stun < T.PUSH_STUN) t.stun = T.PUSH_STUN;
      ctx.interactions.cancel(t);
      const anger = t.anger + 0.06;
      t.anger = anger < 1 ? anger : 1;
      const fear = t.fear + 0.03;
      t.fear = fear < 1 ? fear : 1;

      // chute : surtout de dos, en pleine course, ou déjà diminué
      let fall = 0.08;
      if (dx * Math.sin(t.heading) + dz * Math.cos(t.heading) > 0.5) fall += 0.25;
      if (t.vx * t.vx + t.vz * t.vz > 9) fall += 0.2;
      if (t.injury !== 'none') fall += 0.2;
      fall /= resist > 1 ? resist : 1;
      const fell = !braced && rng.chance(fall);
      if (fell) ctx.health.setDown(t, true, actor.id);

      // droit : un policier déclare l'emploi de la force ; repousser un policier est une violence
      if (actor.faction === 'police') ctx.law.reportForce(actor, 'contact', t, t.x, t.z);
      else if (t.faction === 'police') ctx.law.recordOffense(actor, 'violence_agent', actor.x, actor.z, 2);
      ctx.events.emitAny('people:pushed', { byId: actor.id, targetId: t.id, fell });
    },
  };

  return [porter, trainer, deposer, pousser];
}
