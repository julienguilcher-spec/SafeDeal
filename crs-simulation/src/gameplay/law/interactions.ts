/* =====================================================================================
 * Droit — gestionnaires d'interaction de l'interpellation (ctx.interactions.register).
 *
 *   maitriser  saisir et amener au sol (durée et chances selon l'état, la résistance et la colère
 *              de la personne, l'aide de collègues ; l'échec permet la fuite ou la rébellion)
 *   menotter   entraver la personne maîtrisée
 *   palper     palpation de sécurité : objets dangereux retirés et consignés
 *   escorter   la personne retenue suit l'agent (ou est assise sur place si elle est déjà escortée)
 *   remettre   à un véhicule de police ayant une place libre ou à un point de regroupement
 *   relacher   remise en liberté
 *   controler  contrôle d'identité, en situation calme
 *
 * Même API pour le joueur (touche « Interagir ») et pour les IA (startVerb). Pour « remettre »,
 * une IA peut désigner l'interpellé ou le véhicule de destination. Chaque gestionnaire réutilise
 * son objet d'option : find() n'alloue rien.
 * ===================================================================================== */

import type { EntityId, InteractionHandler, InteractionOption, InteractVerb, Person } from '@/core/contracts';
import type { Kernel } from './kernel';

const PRIORITY_REMETTRE = 90;
const PRIORITY_MENOTTER = 85;
const PRIORITY_INTERPELLER = 80;
const PRIORITY_PALPER = 70;
const PRIORITY_ESCORTER = 60;
const PRIORITY_RELACHER_INFONDE = 35;
const PRIORITY_ESCORTER_SANS_MENOTTES = 30;
const PRIORITY_ASSEOIR = 20;
const PRIORITY_RELACHER = 15;
const PRIORITY_CONTROLER = 14;
const PRIORITY_MAITRISER_SANS_FAIT = 12;

/** Tolérance sur la portée quand la cible est imposée (IA) ou pendant l'action (m). */
const REACH_MARGIN = 0.7;
/** Vitesse au-delà de laquelle une personne ne se prête pas à un contrôle (m/s). */
const CONTROL_MAX_SPEED = 1.6;

function makeOption(verb: InteractVerb): InteractionOption {
  return { verb, targetKind: 'person', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
}

export function createArrestHandlers(k: Kernel): InteractionHandler[] {
  const ctx = k.ctx;
  const cfg = k.cfg;
  const custody = k.custody;
  const subdue = k.subdue;
  const controls = k.controls;
  const scratch: Person[] = [];
  let self: Person | null = null;

  function within(a: Person, b: Person, r: number): boolean {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz <= r * r;
  }

  // ── filtres (créés une fois ; `self` est l'agent en cours d'examen) ──
  const isFreeCivilian = (p: Person): boolean =>
    p !== self && p.faction !== 'police' && p.custody === 'free' && p.heldBy === 0 && p.vehicleId === 0 && p.injury !== 'dead';
  const isHeld = (p: Person): boolean => p.custody === 'held' && custody.holdFor(p.id) !== null;
  const isUnsearched = (p: Person): boolean => {
    if (p.custody !== 'held' && p.custody !== 'cuffed' && p.custody !== 'escorted') return false;
    const rec = custody.holdFor(p.id);
    return rec !== null && !rec.searched;
  };
  const isEscortable = (p: Person): boolean =>
    (p.custody === 'cuffed' || p.custody === 'held') && custody.holdFor(p.id) !== null;
  const isDetained = (p: Person): boolean => p.custody === 'held' || p.custody === 'cuffed' || p.custody === 'escorted';
  const isControllable = (p: Person): boolean =>
    isFreeCivilian(p) && p.posture !== 'down' && p.posture !== 'prone' && !controls.recent(p.id) &&
    p.vx * p.vx + p.vz * p.vz <= CONTROL_MAX_SPEED * CONTROL_MAX_SPEED;

  /**
   * Cible d'un verbe : la cible imposée si elle convient, sinon la personne visée par le joueur,
   * sinon la plus proche à portée (devant l'agent de préférence).
   */
  function pick(actor: Person, targetId: EntityId | undefined, range: number, accept: (p: Person) => boolean): Person | null {
    self = actor;
    if (targetId !== undefined && targetId !== 0) {
      const p = ctx.people.get(targetId);
      return p && !p.dormant && accept(p) && within(actor, p, range + REACH_MARGIN) ? p : null;
    }
    if (actor.isPlayer) {
      const aimed = ctx.people.get(ctx.player.state.aimedPersonId);
      if (aimed && !aimed.dormant && accept(aimed) && within(actor, aimed, range)) return aimed;
    }
    const n = ctx.people.queryRadius(actor.x, actor.z, range, scratch, accept);
    let best: Person | null = null;
    let bestScore = Infinity;
    const fx = Math.sin(actor.aimYaw);
    const fz = Math.cos(actor.aimYaw);
    for (let i = 0; i < n; i++) {
      const p = scratch[i]!;
      const dx = p.x - actor.x;
      const dz = p.z - actor.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      // une personne dans le dos compte comme un mètre plus loin
      const score = d + (d > 0.01 && (dx * fx + dz * fz) / d < 0 ? 1 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  function fill(opt: InteractionOption, target: Person, label: string, priority: number, duration: number): InteractionOption {
    opt.targetKind = 'person';
    opt.targetId = target.id;
    opt.label = label;
    opt.priority = priority;
    opt.duration = duration;
    opt.x = target.x;
    opt.z = target.z;
    return opt;
  }

  function targetOf(opt: InteractionOption): Person | null {
    return ctx.people.get(opt.targetId) ?? null;
  }

  // ───────────────────────────── maîtriser ─────────────────────────────

  const optMaitriser = makeOption('maitriser');
  const maitriser: InteractionHandler = {
    verb: 'maitriser',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor) || actor.carrying !== 0 || subdue.onCooldown(actor)) return null;
      self = actor;
      let target: Person | null = null;
      if (targetId !== undefined && targetId !== 0) {
        target = pick(actor, targetId, cfg.reach, isFreeCivilian);
        if (!target) return null;
      } else if (actor.isPlayer) {
        // le joueur désigne d'abord la personne qu'il vise
        const aimed = ctx.people.get(ctx.player.state.aimedPersonId);
        if (aimed && !aimed.dormant && isFreeCivilian(aimed) && within(actor, aimed, cfg.reach)) target = aimed;
      }
      if (!target) {
        // à portée, l'auteur d'un fait établi passe avant toute autre personne
        const n = ctx.people.queryRadius(actor.x, actor.z, cfg.reach, scratch, isFreeCivilian);
        let bestScore = Infinity;
        for (let i = 0; i < n; i++) {
          const p = scratch[i]!;
          const dx = p.x - actor.x;
          const dz = p.z - actor.z;
          const score = Math.sqrt(dx * dx + dz * dz) + (k.offenses.canArrest(p) ? 0 : 100);
          if (score < bestScore) {
            bestScore = score;
            target = p;
          }
        }
      }
      if (!target) return null;
      const founded = k.offenses.canArrest(target);
      return fill(
        optMaitriser, target,
        founded ? 'Interpeller ' + target.name : 'Maîtriser ' + target.name + ' (aucun fait constaté)',
        founded ? PRIORITY_INTERPELLER : PRIORITY_MAITRISER_SANS_FAIT,
        subdue.duration(actor, target),
      );
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && within(actor, target, cfg.reach + REACH_MARGIN) && subdue.begin(actor, target);
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && subdue.holds(actor, target) && within(actor, target, cfg.reach + 1);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (!target || !subdue.holds(actor, target)) {
        subdue.end(actor, true);
        return;
      }
      subdue.resolve(actor, target);
    },
    cancel(actor: Person): void {
      subdue.end(actor, true);
    },
  };

  // ───────────────────────────── menotter ─────────────────────────────

  const optMenotter = makeOption('menotter');
  const menotter: InteractionHandler = {
    verb: 'menotter',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor)) return null;
      const target = pick(actor, targetId, cfg.reach, isHeld);
      if (!target) return null;
      const helped = k.eyes.helpersNear(target.x, target.z, 3, actor.id) > 0;
      return fill(optMenotter, target, 'Menotter ' + target.name, PRIORITY_MENOTTER, helped ? cfg.cuffTime * 0.75 : cfg.cuffTime);
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      if (!target || !isHeld(target) || !within(actor, target, cfg.reach + REACH_MARGIN)) return false;
      if (!custody.hasCuffs(actor)) {
        k.notify(actor, 'Plus de menottes ni de liens : faites appel à un collègue ou escortez la personne sans entrave.', 'warn', 5);
        return false;
      }
      actor.upper = 'restrain';
      actor.upperT = 0;
      return true;
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && isHeld(target) && within(actor, target, cfg.reach + 1);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (target) custody.cuff(actor, target);
      if (actor.upper === 'restrain') actor.upper = 'none';
    },
    cancel(actor: Person): void {
      if (actor.upper === 'restrain' && actor.carrying === 0) actor.upper = 'none';
    },
  };

  // ───────────────────────────── palper ─────────────────────────────

  const optPalper = makeOption('palper');
  const palper: InteractionHandler = {
    verb: 'palper',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor)) return null;
      const target = pick(actor, targetId, cfg.reach, isUnsearched);
      if (!target) return null;
      return fill(optPalper, target, 'Palpation de sécurité', PRIORITY_PALPER, cfg.searchTime);
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      if (!target || !isUnsearched(target) || !within(actor, target, cfg.reach + REACH_MARGIN)) return false;
      actor.upper = 'restrain';
      actor.upperT = 0;
      return true;
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && isDetained(target) && within(actor, target, cfg.reach + 1);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (target && isDetained(target)) custody.search(actor, target);
      if (actor.upper === 'restrain') actor.upper = 'none';
    },
    cancel(actor: Person): void {
      if (actor.upper === 'restrain' && actor.carrying === 0) actor.upper = 'none';
    },
  };

  // ───────────────────────────── escorter ─────────────────────────────

  const optEscorter = makeOption('escorter');
  const escorter: InteractionHandler = {
    verb: 'escorter',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor)) return null;
      const current = custody.escortedBy(actor);
      if (current) {
        // déjà en escorte : proposer de faire asseoir la personne
        if (targetId !== undefined && targetId !== 0 && targetId !== current.id) return null;
        return fill(optEscorter, current, 'Faire asseoir ' + current.name, PRIORITY_ASSEOIR, 1);
      }
      const target = pick(actor, targetId, cfg.reach, isEscortable);
      if (!target) return null;
      if (actor.carrying !== 0 && actor.carrying !== target.id) return null;
      const cuffed = target.custody === 'cuffed';
      return fill(
        optEscorter, target,
        cuffed ? 'Escorter ' + target.name : 'Escorter ' + target.name + ' (sans menottes)',
        cuffed ? PRIORITY_ESCORTER : PRIORITY_ESCORTER_SANS_MENOTTES, cfg.escortTime,
      );
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && isDetained(target) && custody.holdFor(target.id) !== null && within(actor, target, cfg.reach + REACH_MARGIN);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (!target) return;
      if (target.custody === 'escorted') custody.seat(actor, target);
      else custody.escort(actor, target);
    },
  };

  // ───────────────────────────── remettre ─────────────────────────────

  const optRemettre = makeOption('remettre');
  const remettre: InteractionHandler = {
    verb: 'remettre',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor)) return null;
      const detainee = custody.escortedBy(actor);
      if (!detainee) return null;
      const dest = k.handover.find(actor);
      if (!dest) return null;
      let id = detainee.id;
      if (targetId !== undefined && targetId !== 0 && targetId !== detainee.id) {
        // une IA peut désigner le véhicule de destination plutôt que l'interpellé
        if (!dest.vehicle || dest.vehicle.id !== targetId) return null;
        id = targetId;
      }
      const opt = optRemettre;
      opt.targetKind = id === detainee.id ? 'person' : 'vehicle';
      opt.targetId = id;
      opt.label = 'Remettre ' + detainee.name + ' (' + dest.label + ')';
      opt.priority = PRIORITY_REMETTRE;
      opt.duration = cfg.handoverTime;
      opt.x = dest.x;
      opt.z = dest.z;
      return opt;
    },
    begin(actor: Person): boolean {
      return custody.escortedBy(actor) !== null && k.handover.find(actor) !== null;
    },
    tick(actor: Person): boolean {
      return custody.escortedBy(actor) !== null;
    },
    complete(actor: Person): void {
      const detainee = custody.escortedBy(actor);
      const dest = detainee ? k.handover.find(actor) : null;
      if (!detainee || !dest) {
        k.notify(actor, 'Remise impossible : plus de place à bord ou point de regroupement trop éloigné.', 'warn', 4);
        return;
      }
      custody.handOver(actor, detainee, dest);
    },
  };

  // ───────────────────────────── relâcher ─────────────────────────────

  const optRelacher = makeOption('relacher');
  const relacher: InteractionHandler = {
    verb: 'relacher',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor)) return null;
      const target = custody.escortedBy(actor) ?? pick(actor, targetId, cfg.reach, isDetained);
      if (!target || (targetId !== undefined && targetId !== 0 && targetId !== target.id)) return null;
      const rec = custody.holdFor(target.id);
      return fill(
        optRelacher, target, 'Relâcher ' + target.name,
        rec && !rec.founded ? PRIORITY_RELACHER_INFONDE : PRIORITY_RELACHER, cfg.releaseTime,
      );
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && isDetained(target) && within(actor, target, cfg.reach + REACH_MARGIN);
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && isDetained(target) && within(actor, target, cfg.reach + 1.5);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (target && custody.release(actor, target)) {
        k.notify(actor, target.name + ' est remis en liberté.', 'info', 4);
      }
    },
  };

  // ───────────────────────────── contrôler ─────────────────────────────

  const optControler = makeOption('controler');
  const controler: InteractionHandler = {
    verb: 'controler',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor) || actor.carrying !== 0) return null;
      // un contrôle d'identité ne se fait pas sous les projectiles
      if (k.attack.near(actor.x, actor.z, cfg.riposteRadius) || ctx.director.tensionAt(actor.x, actor.z) >= 0.6) return null;
      const target = pick(actor, targetId, cfg.reach + 0.2, isControllable);
      if (!target) return null;
      return fill(optControler, target, "Contrôler l'identité de " + target.name, PRIORITY_CONTROLER, cfg.controlTime);
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      if (!target || !isControllable(target) || !within(actor, target, cfg.reach + 0.2 + REACH_MARGIN)) return false;
      if (target.anger > 0.7 && k.eyes.protectedKind(target) === '') {
        k.notify(actor, target.name + ' refuse le contrôle et s\'éloigne.', 'warn', 4);
        return false;
      }
      controls.begin(target);
      actor.upper = 'point';
      actor.upperT = 0;
      return true;
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const target = targetOf(opt);
      return target !== null && target.custody === 'free' && within(actor, target, cfg.reach + 1.5);
    },
    complete(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (actor.upper === 'point') actor.upper = 'none';
      if (target) controls.complete(actor, target);
    },
    cancel(actor: Person, opt: InteractionOption): void {
      const target = targetOf(opt);
      if (actor.upper === 'point') actor.upper = 'none';
      if (target) controls.end(target);
    },
  };

  return [maitriser, menotter, palper, escorter, remettre, relacher, controler];
}
