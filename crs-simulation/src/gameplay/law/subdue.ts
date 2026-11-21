/* =====================================================================================
 * Droit — maîtrise d'une personne : saisie, lutte, issue.
 *
 * L'agent agrippe la personne (lien tenir / être tenu) pendant la durée de la maîtrise ; à la fin,
 * un tirage décide : elle est amenée au sol (Custody.arrest) ou elle se dégage — fuite si elle a
 * peur, rébellion (coup porté à l'agent, infraction constatée) si elle est en colère.
 *
 *   chances = 0,92 − 0,75 × résistance + 0,15 par collègue à moins de 3 m (2 au plus)
 *             − gêne de l'agent (gaz, blessure), bornées à [0,10 ; 0,99] ; 1 si la personne est hors de combat
 *   durée   = (1,2 + 2,8 × résistance) × (1 − 0,25 par collègue), 0,8 s au moins
 *   résistance : profil (pacifique 0,15 … radical 0,8) modulé par la colère, la peur, le souffle,
 *                les blessures, le gaz, l'étourdissement, la posture (mains en l'air, assis, à terre)
 * ===================================================================================== */

import type { EntityId, Person, Vec2 } from '@/core/contracts';
import type { Kernel } from './kernel';

/** Résistance de base selon le profil (0 docile … 1 se débat violemment). */
const PROFILE_RESISTANCE: Readonly<Record<string, number>> = {
  pacifique: 0.15, famille: 0.05, militant: 0.45, service_ordre: 0.35, meneur: 0.5,
  opportuniste: 0.45, radical: 0.8, pilleur: 0.65,
};
const FACTION_RESISTANCE: Readonly<Record<string, number>> = {
  protest: 0.3, civil: 0.2, press: 0.1, medic: 0.1, rescue: 0.05, police: 0,
};

/** Distance de saisie : au-delà, la personne tenue est ramenée au contact (m). */
const GRIP_SLACK = 1.3;
export const GRIP_LENGTH = 1;
/** Durée maximale d'une tentative de maîtrise avant abandon (s). */
const GRIP_TIMEOUT = 12;
/** Délai imposé à l'agent après une maîtrise manquée (s). */
const FAIL_COOLDOWN = 2;
/** Rayon dans lequel un collègue prête main-forte (m), et nombre de collègues utiles. */
const HELP_RADIUS = 3;
const HELP_MAX = 2;

const scratchPos: Vec2 = { x: 0, z: 0 };

/**
 * Contrainte de saisie : ramène `p` à `length` mètres de (ax, az) s'il s'en est éloigné de plus de
 * `slack` (sans traverser le décor).
 */
export function tether(k: Kernel, p: Person, ax: number, az: number, slack: number, length: number): void {
  const dx = p.x - ax;
  const dz = p.z - az;
  const d2 = dx * dx + dz * dz;
  if (d2 <= slack * slack) return;
  const d = Math.sqrt(d2);
  const world = k.ctx.world;
  const pos = scratchPos;
  pos.x = ax + (dx / d) * length;
  pos.z = az + (dz / d) * length;
  world.resolveCircle(pos, p.radius);
  p.x = pos.x;
  p.z = pos.z;
  p.y = world.heightAt(pos.x, pos.z);
}

export class Subduing {
  /** Maîtrises en cours : agent, personne saisie, instant de début. */
  readonly targets: Person[] = [];
  private readonly actors: Person[] = [];
  private readonly since: number[] = [];
  private readonly cooldown = new Map<EntityId, number>();
  /** Personnes qui se sont déjà dégagées d'une saisie (risque de fuite établi). */
  private readonly loose = new Set<EntityId>();

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.targets.length = 0;
    this.actors.length = 0;
    this.since.length = 0;
    this.cooldown.clear();
    this.loose.clear();
  }

  /** L'agent sort-il d'une maîtrise manquée ? */
  onCooldown(actor: Person): boolean {
    const until = this.cooldown.get(actor.id);
    return until !== undefined && this.k.ctx.clock.now < until;
  }

  /** La personne s'est-elle déjà dégagée d'une saisie ? */
  brokeLoose(targetId: EntityId): boolean {
    return this.loose.has(targetId);
  }

  /** Résistance que la personne oppose à la saisie (0 docile … 1). */
  resistance(target: Person): number {
    if (target.posture === 'down' || target.posture === 'prone' || this.k.ctx.health.isIncapacitated(target)) return 0.03;
    const base = (target.profile ? PROFILE_RESISTANCE[target.profile] : undefined) ?? FACTION_RESISTANCE[target.faction] ?? 0.25;
    let r = base * (0.6 + 0.6 * target.anger) + 0.1 * target.fear;
    r *= 0.55 + 0.45 * (target.stamina / 100);
    if (target.health < 50) r *= 0.6;
    r *= 1 - 0.5 * target.gas * (1 - target.gasProtection);
    if (target.stun > 0) r *= 0.25;
    if (target.upper === 'hands_up') r *= 0.2;
    else if (target.posture === 'sit' || target.posture === 'kneel') r *= 0.4;
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }

  private helpers(actor: Person, target: Person): number {
    const n = this.k.eyes.helpersNear(target.x, target.z, HELP_RADIUS, actor.id);
    return n > HELP_MAX ? HELP_MAX : n;
  }

  /** Chances de réussir la maîtrise. */
  chance(actor: Person, target: Person): number {
    if (this.k.ctx.health.isIncapacitated(target)) return 1;
    let chance = 0.92 - 0.75 * this.resistance(target) + 0.15 * this.helpers(actor, target);
    chance -= 0.2 * actor.gas * (1 - actor.gasProtection);
    if (actor.health < 50) chance -= 0.1;
    return chance < 0.1 ? 0.1 : chance > 0.99 ? 0.99 : chance;
  }

  /** Durée de la maîtrise : plus la personne résiste, plus c'est long ; l'aide de collègues l'abrège. */
  duration(actor: Person, target: Person): number {
    const d = (1.2 + 2.8 * this.resistance(target)) * (1 - 0.25 * this.helpers(actor, target));
    return d < 0.8 ? 0.8 : d;
  }

  /** Début de la saisie : la personne est agrippée, l'issue se joue à la fin de la maîtrise. */
  begin(actor: Person, target: Person): boolean {
    if (!this.k.custody.canAct(actor) || this.onCooldown(actor)) return false;
    if (target.custody !== 'free' || target.heldBy !== 0 || target.vehicleId !== 0 || target.faction === 'police') return false;
    if (actor.carrying !== 0) return false;
    target.heldBy = actor.id;
    actor.carrying = target.id;
    actor.upper = 'restrain';
    actor.upperT = 0;
    this.actors.push(actor);
    this.targets.push(target);
    this.since.push(this.k.ctx.clock.now);
    return true;
  }

  /** La saisie tient-elle encore ? */
  holds(actor: Person, target: Person): boolean {
    return target.heldBy === actor.id && target.custody === 'free' && this.k.ctx.people.get(target.id) === target;
  }

  /** Fin de la saisie (réussie, manquée ou interrompue) ; `release` défait la prise. */
  end(actor: Person, release: boolean): void {
    const i = this.actors.indexOf(actor);
    if (i < 0) return;
    const target = this.targets[i]!;
    const last = this.actors.length - 1;
    this.actors[i] = this.actors[last]!;
    this.targets[i] = this.targets[last]!;
    this.since[i] = this.since[last]!;
    this.actors.pop();
    this.targets.pop();
    this.since.pop();
    if (release) {
      if (target.heldBy === actor.id) target.heldBy = 0;
      if (actor.carrying === target.id) actor.carrying = 0;
      if (actor.upper === 'restrain') actor.upper = 'none';
    }
  }

  /** Issue de la maîtrise : la personne est amenée au sol, ou se dégage (fuite ou rébellion). */
  resolve(actor: Person, target: Person): boolean {
    const k = this.k;
    const success = k.rng.next() < this.chance(actor, target);
    this.end(actor, !success);
    if (success) {
      k.custody.arrest(actor, target, this.loose.has(target.id));
      return true;
    }
    this.breakFree(actor, target);
    return false;
  }

  private breakFree(actor: Person, target: Person): void {
    const k = this.k;
    const ctx = k.ctx;
    this.cooldown.set(actor.id, ctx.clock.now + FAIL_COOLDOWN);
    this.loose.add(target.id);
    let violence = 0.2 + 0.6 * target.anger;
    if (target.profile === 'radical' || target.profile === 'pilleur') violence += 0.2;
    if (k.eyes.protectedKind(target) !== '') violence = 0;
    const rebels = k.rng.next() < violence;
    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (rebels) {
      // résistance violente : rébellion, constatée par l'agent lui-même
      k.offenses.record(target, 'rebellion', target.x, target.z, undefined, true);
      target.anger = target.anger + 0.2 > 1 ? 1 : target.anger + 0.2;
      ctx.health.hurt(actor, {
        amount: 4 + k.rng.next() * 6, kind: 'blunt', sourceId: target.id, x: actor.x, z: actor.z,
        dirX: -dx / d, dirZ: -dz / d, zone: 0.6, stun: 0.4, knockback: 0.5,
      });
      k.notify(actor, target.name + ' se débat et vous frappe : rébellion.', 'alert', 5);
    } else {
      if (target.fear < 0.85) target.fear = 0.85;
      k.notify(actor, target.name + ' se dégage et prend la fuite.', 'warn', 4);
    }
    // élan pour se dégager (le contrôleur de la personne reprend la main ensuite)
    target.cmd.moveX = dx / d;
    target.cmd.moveZ = dz / d;
    target.cmd.gait = 2;
    ctx.events.emitAny('law:arrest_failed', { id: target.id, byId: actor.id, outcome: rebels ? 'rebellion' : 'fuite' });
  }

  /** Après la locomotion : la personne agrippée ne s'éloigne pas ; les saisies rompues sont défaites. */
  update(): void {
    const ctx = this.k.ctx;
    const people = ctx.people;
    const now = ctx.clock.now;
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const actor = this.actors[i]!;
      const target = this.targets[i]!;
      if (people.get(actor.id) !== actor || !this.holds(actor, target) || ctx.health.isIncapacitated(actor) ||
        now - this.since[i]! > GRIP_TIMEOUT) {
        this.end(actor, true);
        continue;
      }
      tether(this.k, target, actor.x, actor.z, GRIP_SLACK, GRIP_LENGTH);
      target.vx = 0;
      target.vz = 0;
    }
  }

  /** Une personne a quitté le jeu. */
  onRemoved(id: EntityId): void {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      if (this.actors[i]!.id === id || this.targets[i]!.id === id) this.end(this.actors[i]!, true);
    }
    this.cooldown.delete(id);
    this.loose.delete(id);
  }
}
