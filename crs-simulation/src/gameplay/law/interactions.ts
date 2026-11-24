/* =====================================================================================
 * Droit — gestionnaires d'interaction de l'interpellation (ctx.interactions.register).
 *
 *   maitriser  saisir et amener au sol (durée et chances selon l'état, la résistance et la colère
 *              de la personne, l'aide de collègues ; l'échec permet la fuite ou la rébellion)
 *   menotter   entraver la personne maîtrisée
 *   palper     palpation de sécurité : objets dangereux retirés et consignés
 *   escorter     « Emmener » : la personne retenue suit l'agent (ou est assise sur place si elle est déjà escortée)
 *   remettre     à un véhicule de police ayant une place libre (fourgon cellulaire à 12 m, avant tout autre
 *                véhicule ; autre véhicule à 5 m) ou à un point de regroupement
 *   confier      (joueur) au binôme libre le plus proche de son dispositif, 60 m (service 'police.arrests')
 *   faire_venir  (joueur) faire venir le fourgon cellulaire, à plus de 100 m, quand rien d'autre ne s'applique
 *   relacher     remise en liberté
 *   controler    contrôle d'identité, en situation calme
 *
 * Après les trois gestes du joueur (interpeller, menotter, palper), la 4e invite est la meilleure issue
 * (detainee.ts, plan ordres-directs §5.3) : remettre au fourgon (12 m) > confier (60 m) > remettre à un
 * autre véhicule (5 m) > faire venir le fourgon (au-delà de 100 m) > emmener ; « Faire asseoir » en dernier.
 *
 * Même API pour le joueur (touche « Interagir ») et pour les IA (startVerb). Pour « remettre »,
 * une IA peut désigner l'interpellé ou le véhicule de destination. Chaque gestionnaire réutilise
 * son objet d'option : find() n'alloue rien.
 * ===================================================================================== */

import type { EntityId, InteractionHandler, InteractionOption, InteractVerb, Person } from '@/core/contracts';
import type { Kernel } from './kernel';

// en escorte : fourgon cellulaire (12 m) > confier > autre véhicule (5 m) > faire venir > faire asseoir
const PRIORITY_REMETTRE_FOURGON = 92;
const PRIORITY_CONFIER = 91;
const PRIORITY_REMETTRE = 90;
const PRIORITY_MENOTTER = 85;
const PRIORITY_INTERPELLER = 80;
const PRIORITY_PALPER = 70;
// l'interpellé assis à côté de lui, après la palpation : la meilleure issue avant « Emmener »
const PRIORITY_REMETTRE_FOURGON_ASSIS = 69;
const PRIORITY_CONFIER_ASSIS = 68;
const PRIORITY_REMETTRE_ASSIS = 67;
const PRIORITY_FAIRE_VENIR_ASSIS = 66;
const PRIORITY_FAIRE_VENIR = 64;
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
  const ways = k.ways;
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
        cuffed ? 'Emmener ' + target.name : 'Emmener ' + target.name + ' (sans menottes)',
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

  /**
   * Interpellé à remettre : celui que l'agent escorte ; pour le joueur, aussi celui qu'il tient ou qui est assis,
   * menotté, à côté de lui (la remise le relève et le conduit au véhicule).
   */
  function toHandOver(actor: Person): Person | null {
    const escorted = custody.escortedBy(actor);
    if (escorted || !actor.isPlayer) return escorted;
    return ways.detaineeFor(actor);
  }

  const optRemettre = makeOption('remettre');
  const remettre: InteractionHandler = {
    verb: 'remettre',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!custody.canAct(actor)) return null;
      const detainee = toHandOver(actor);
      if (!detainee) return null;
      const dest = k.handover.find(actor);
      if (!dest) return null;
      const escorted = detainee.custody === 'escorted';
      const van = dest.vehicle !== null && dest.vehicle.kind === 'fourgon_cellulaire';
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
      opt.priority = escorted ? (van ? PRIORITY_REMETTRE_FOURGON : PRIORITY_REMETTRE)
        : van ? PRIORITY_REMETTRE_FOURGON_ASSIS : PRIORITY_REMETTRE_ASSIS;
      opt.duration = cfg.handoverTime;
      opt.x = dest.x;
      opt.z = dest.z;
      return opt;
    },
    begin(actor: Person): boolean {
      return toHandOver(actor) !== null && k.handover.find(actor) !== null;
    },
    tick(actor: Person): boolean {
      return toHandOver(actor) !== null;
    },
    complete(actor: Person): void {
      const detainee = toHandOver(actor);
      const dest = detainee ? k.handover.find(actor) : null;
      if (!detainee || !dest) {
        k.notify(actor, 'Remise impossible : plus de place à bord ou point de regroupement trop éloigné.', 'warn', 4);
        return;
      }
      // assis ou maintenu à côté de lui : l'agent le relève et le conduit au véhicule
      if (detainee.custody !== 'escorted' && !custody.escort(actor, detainee)) return;
      custody.handOver(actor, detainee, dest);
    },
  };

  // ───────────────────────────── confier (joueur) ─────────────────────────────

  const optConfier = makeOption('confier');
  const confier: InteractionHandler = {
    verb: 'confier',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!actor.isPlayer || !custody.canAct(actor)) return null;
      const way = ways.bestFor(actor);
      if (!way || way.kind !== 'confier') return null;
      if (targetId !== undefined && targetId !== 0 && targetId !== way.detaineeId) return null;
      const detainee = ctx.people.get(way.detaineeId);
      if (!detainee) return null;
      return fill(optConfier, detainee, way.label, detainee.custody === 'escorted' ? PRIORITY_CONFIER : PRIORITY_CONFIER_ASSIS, 1);
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const d = ways.detaineeFor(actor);
      return d !== null && d.id === opt.targetId;
    },
    tick(actor: Person, opt: InteractionOption): boolean {
      const d = ways.detaineeFor(actor);
      return d !== null && d.id === opt.targetId;
    },
    complete(actor: Person): void {
      ways.confide(actor);
    },
  };

  // ───────────────────────────── faire venir le fourgon (joueur) ─────────────────────────────

  const optFaireVenir = makeOption('faire_venir');
  const faireVenir: InteractionHandler = {
    verb: 'faire_venir',
    find(actor: Person, targetId?: EntityId): InteractionOption | null {
      if (!actor.isPlayer || !custody.canAct(actor)) return null;
      const way = ways.bestFor(actor);
      if (!way || way.kind !== 'faire_venir') return null;
      if (targetId !== undefined && targetId !== 0 && targetId !== way.detaineeId) return null;
      const detainee = ctx.people.get(way.detaineeId);
      if (!detainee) return null;
      // (un appel radio : immédiat ; il garde son interpellé en attendant)
      return fill(optFaireVenir, detainee, way.label, detainee.custody === 'escorted' ? PRIORITY_FAIRE_VENIR : PRIORITY_FAIRE_VENIR_ASSIS, 0);
    },
    begin(actor: Person, opt: InteractionOption): boolean {
      const d = ways.detaineeFor(actor);
      return d !== null && d.id === opt.targetId;
    },
    complete(actor: Person): void {
      ways.callVan(actor.id);
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

  return [maitriser, menotter, palper, escorter, remettre, confier, faireVenir, relacher, controler];
}
