/* =====================================================================================
 * Santé et états (ordre STATUS) — publie ctx.health, seul point d'entrée pour blesser ou
 * soigner une personne.
 *
 * hurt() : zone touchée (tête, tronc, jambes) → protection (armorHead, armorBody), bouclier levé
 * face au coup (bloqué ou très réduit, son « impact_bouclier »), recul, étourdissement, niveau de
 * blessure par seuils de points de vie, mise à terre. Les blessés graves s'aggravent lentement
 * sans soins (health-status.ts). Le décès n'est possible que pour les causes les plus graves
 * (arme à feu, véhicule, feu, explosion d'engin, chute, écrasement) et en violence « réaliste » ;
 * sinon la personne reste inconsciente, dans un état critique.
 * ===================================================================================== */

import type {
  DamageInfo, DamageKind, EntityId, GameContext, GameSystem, HealthApi, InjuryLevel, Person, Rng,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { PEOPLE_GEAR_SERVICE, PEOPLE_HEALTH_SERVICE } from './api';
import type { PeopleGearApi, PeopleHealthApi } from './api';
import { hasMask, hasVisor, setGasMask, setVisor } from './gear';
import { StatusPass } from './health-status';
import { fearSusceptibility, injuryFor } from './health-util';
import type { PeopleShared, PersonExtra } from './shared';
import { shieldRaised } from './shared';
import * as T from './tuning';

/** Part de la protection qui joue contre chaque type de dégât. */
const ARMOR_EFFECT: Record<DamageKind, number> = {
  impact: 0.85, blunt: 0.75, blast: 0.5, burn: 0.4, gas: 0, water: 0.5, bullet: 0.6, vehicle: 0.15, crush: 0.1, fall: 0.2,
};
/** Part du dégât qui traverse un bouclier levé face au coup (1 = le bouclier ne sert à rien). */
const SHIELD_PASS: Record<DamageKind, number> = {
  impact: 0, blunt: 0.1, blast: 0.4, burn: 0.45, gas: 1, water: 0.3, bullet: 0.15, vehicle: 1, crush: 1, fall: 1,
};
/** Recul par point de dégât (m/s) quand l'appelant n'en fournit pas. */
const KNOCKBACK_PER_DAMAGE: Record<DamageKind, number> = {
  impact: 0.03, blunt: 0.04, blast: 0.08, burn: 0, gas: 0, water: 0.12, bullet: 0.03, vehicle: 0.15, crush: 0, fall: 0,
};
/** Dégâts appliqués au corps entier (la zone n'a pas de sens). */
const WHOLE_BODY: Record<DamageKind, boolean> = {
  impact: false, blunt: false, blast: true, burn: true, gas: true, water: true, bullet: false, vehicle: true, crush: true, fall: true,
};
/** Probabilité de décès quand un coup grave amène les points de vie à zéro (violence « réaliste »). */
const LETHALITY: Record<DamageKind, number> = {
  impact: 0, blunt: 0, blast: 0.35, burn: 0.35, gas: 0, water: 0, bullet: 0.6, vehicle: 0.5, crush: 0.5, fall: 0.4,
};

export class HealthSystem implements GameSystem {
  readonly id = 'people.health';
  readonly order = SystemOrder.STATUS;

  ctx!: GameContext;
  rng!: Rng;
  readonly api: HealthApi;
  readonly ext: PeopleHealthApi;
  private readonly status: StatusPass;
  /** DamageInfo réutilisé pour les dégâts internes (brûlure, malaise). */
  readonly scratch: DamageInfo = { amount: 0, kind: 'burn', sourceId: 0, x: 0, z: 0 };

  constructor(readonly shared: PeopleShared) {
    this.api = {
      hurt: (target, d) => this.hurt(target, d),
      heal: (target, amount, byId) => this.heal(target, amount, byId),
      setDown: (target, down, sourceId) => this.setDown(target, down, sourceId ?? 0),
      isIncapacitated: (p) => p.posture === 'down' || p.health <= 0 || p.injury === 'dead' || p.injury === 'critical',
    };
    const self = this;
    this.ext = {
      rinseEyes: (p, byId) => this.rinseEyes(p, byId),
      extinguish: (p, byId) => this.extinguish(p, byId),
      stabilise: (p, byId) => this.stabilise(p, byId),
      knockDown: (p, seconds, sourceId) => this.knockDown(p, seconds, sourceId),
      get psychDecay(): boolean {
        return self.status.psychDecay;
      },
      set psychDecay(v: boolean) {
        self.status.psychDecay = v;
      },
    };
    this.status = new StatusPass(this);
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.shared.bind(ctx);
    this.rng = ctx.rng.fork('people.health');
    ctx.health = this.api;
    ctx.provide(PEOPLE_HEALTH_SERVICE, this.ext);
    const shared = this.shared;
    const gear: PeopleGearApi = {
      hasMask: (p) => hasMask(ctx, p),
      hasVisor: (p) => hasVisor(p),
      setGasMask: (p, on) => setGasMask(ctx, p, shared.of(p), on),
      setVisor: (p, down) => setVisor(p, shared.of(p), down),
    };
    ctx.provide(PEOPLE_GEAR_SERVICE, gear);
  }

  init(ctx: GameContext): void {
    // un autre module (extincteur, lance, canon à eau) signale qu'il a éteint une personne
    ctx.events.on('fire:out', (ev) => {
      if (ev.targetKind !== 'person' || ev.targetId === 0) return;
      const p = ctx.people.get(ev.targetId);
      if (p && p.burning > 0) {
        p.burning = 0;
        const e = this.shared.peek(p.id);
        if (e) e.wasBurning = false;
      }
    });
  }

  reset(): void {
    this.rng = this.ctx.rng.fork('people.health');
    this.shared.clear();
    this.status.reset();
  }

  update(dt: number): void {
    this.status.update(dt);
  }

  // ───────────────────────────── blesser ─────────────────────────────

  hurt(target: Person, d: DamageInfo): void {
    if (target.injury === 'dead') return;
    const ctx = this.ctx;
    const e = this.shared.of(target);
    const kind = d.kind;
    let amount = d.amount > 0 ? d.amount : 0;

    // direction du coup : fournie, sinon déduite de la position de l'auteur ou du point d'impact
    let dirX = d.dirX !== undefined ? d.dirX : 0;
    let dirZ = d.dirZ !== undefined ? d.dirZ : 0;
    let dl = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (!(dl > 1e-6)) {
      let sx = d.x;
      let sz = d.z;
      const src = d.sourceId !== 0 ? ctx.people.get(d.sourceId) : undefined;
      if (src && src !== target) {
        sx = src.x;
        sz = src.z;
      }
      dirX = target.x - sx;
      dirZ = target.z - sz;
      dl = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (!(dl > 0.02)) dl = 0;
    }
    const hasDir = dl > 0;
    if (hasDir) {
      dirX /= dl;
      dirZ /= dl;
    } else {
      dirX = 0;
      dirZ = 0;
    }

    const whole = WHOLE_BODY[kind] === true;
    const zone = d.zone !== undefined ? (d.zone < 0 ? 0 : d.zone > 1 ? 1 : d.zone) : T.ZONE_DEFAULT;

    // ── bouclier levé, coup venant de l'avant ──
    let knockMul = 1;
    let stunMul = 1;
    let blocked = false;
    if (hasDir && target.alt && amount > 0 && target.posture !== 'down' && target.vehicleId === 0 && shieldRaised(target)) {
      const facing = -(dirX * Math.sin(target.heading) + dirZ * Math.cos(target.heading));
      if (facing >= T.SHIELD_ARC_COS && (whole || shieldCovers(target, zone))) {
        const pass = SHIELD_PASS[kind];
        if (pass !== undefined && pass < 1) {
          blocked = true;
          const cost = amount * T.SHIELD_STAMINA_K;
          target.stamina -= cost < T.SHIELD_STAMINA_MAX ? cost : T.SHIELD_STAMINA_MAX;
          if (target.stamina < 0) target.stamina = 0;
          const vol = amount / 30;
          ctx.events.emit('sfx', {
            id: 'impact_bouclier', x: target.x, y: target.y + 1.1, z: target.z, volume: vol < 0.3 ? 0.3 : vol > 1 ? 1 : vol,
          });
          ctx.events.emit('fx', {
            id: 'impact', x: target.x + Math.sin(target.heading) * 0.4, y: target.y + 1.1,
            z: target.z + Math.cos(target.heading) * 0.4, size: 0.3, dirX: -dirX, dirY: 0.3, dirZ: -dirZ,
          });
          amount *= pass;
          knockMul = T.SHIELD_KNOCKBACK;
          stunMul = pass;
          ctx.events.emitAny('people:blocked', { id: target.id, info: d });
        }
      }
    }

    // ── zone et protection ──
    let armor: number;
    let zoneMul = 1;
    let head = false;
    if (whole) {
      armor = target.armorBody * 0.75 + target.armorHead * 0.25;
    } else if (zone >= T.ZONE_HEAD) {
      head = true;
      armor = target.armorHead;
      zoneMul = T.HEAD_DAMAGE;
    } else if (zone < T.ZONE_LEGS) {
      armor = target.armorBody * T.LEG_ARMOR;
      zoneMul = T.LEG_DAMAGE;
    } else {
      armor = target.armorBody;
    }
    armor = armor > 0 ? (armor < 1 ? armor : 1) : 0;
    const pre = amount * zoneMul;
    let dmg = pre * (1 - armor * (ARMOR_EFFECT[kind] ?? 0.5));

    // ── effets propres au type de dégât ──
    if (kind === 'gas') {
      const prot = target.gasProtection > 0 ? (target.gasProtection < 1 ? target.gasProtection : 1) : 0;
      const g = target.gas + pre * T.GAS_HIT_DOSE * (1 - prot);
      target.gas = g < 1 ? g : 1;
      dmg *= T.GAS_HIT_HEALTH;
    } else if (kind === 'water') {
      const w = target.wet + pre * T.WATER_HIT_WET;
      target.wet = w < 1 ? w : 1;
      if (target.burning > 0) this.extinguish(target, d.sourceId);
    } else if (kind === 'burn' && pre > 0) {
      let ig = pre / T.BURN_IGNITE_REF;
      if (ig > 1) ig = 1;
      ig *= (1 - armor * 0.5) * (1 - target.wet * 0.8);
      if (ig > target.burning) target.burning = ig;
    }

    // ── étourdissement ──
    let stun: number;
    if (d.stun !== undefined) {
      stun = d.stun > 0 ? d.stun * (1 - (target.armorHead > 0 ? (target.armorHead < 1 ? target.armorHead : 1) : 0) * 0.3) : 0;
    } else if (head && (kind === 'impact' || kind === 'blunt' || kind === 'bullet')) {
      stun = dmg * 0.06;
    } else if (kind === 'blast') {
      stun = dmg * 0.05;
    } else if (kind === 'vehicle' || kind === 'fall') {
      stun = dmg * 0.04;
    } else {
      stun = 0;
    }
    stun *= stunMul;
    if (stun > T.STUN_MAX) stun = T.STUN_MAX;
    if (stun > target.stun) target.stun = stun;

    // ── recul ──
    let kb = d.knockback !== undefined ? (d.knockback > 0 ? d.knockback : 0) : pre * (KNOCKBACK_PER_DAMAGE[kind] ?? 0);
    kb *= knockMul / (target.look.build > 0.5 ? target.look.build : 1);
    if (kb > T.KNOCKBACK_MAX) kb = T.KNOCKBACK_MAX;
    if (kb > 0 && hasDir && target.vehicleId === 0 && target.heldBy === 0) {
      target.vx += dirX * kb;
      target.vz += dirZ * kb;
    } else {
      kb = 0;
    }

    if (!(dmg > 0)) dmg = 0;
    if (blocked && dmg <= 0 && stun <= 0) return; // coup entièrement arrêté par le bouclier

    this.applyDamage(target, e, dmg, d, dirX, dirZ, zone, head, stun, kb);
  }

  /** Retire les points de vie, met à jour blessure, psychologie, effets, événements, mise à terre, décès. */
  private applyDamage(
    target: Person, e: PersonExtra, dmg: number, d: DamageInfo, dirX: number, dirZ: number,
    zone: number, head: boolean, stun: number, kb: number,
  ): void {
    const ctx = this.ctx;
    const kind = d.kind;
    const now = ctx.clock.now;
    let health = target.health - dmg;
    let dead = false;
    if (health <= 0) {
      health = 0;
      // décès : causes les plus graves uniquement, et seulement en violence « réaliste »
      if (dmg >= T.LETHAL_MIN_DAMAGE && this.canDie() && isGrave(d) && this.rng.chance(LETHALITY[kind] ?? 0)) dead = true;
      else health = 1;
    }
    target.health = health;
    e.lastKind = kind;
    e.lastSource = d.sourceId;
    e.hurtAt = now;
    if (dmg >= T.REOPEN_DAMAGE) {
      e.lastGrave = isGrave(d) || (e.lastGrave && !e.treated);
      e.treated = false;
    }

    // psychologie : la douleur fait peur et met en colère (surtout quand elle vient d'un camp adverse)
    if (dmg > 0) {
      const src = d.sourceId !== 0 ? ctx.people.get(d.sourceId) : undefined;
      const hostile = src !== undefined && src.faction !== target.faction;
      const f = target.fear + dmg * T.FEAR_PER_DAMAGE * fearSusceptibility(target);
      target.fear = f < 1 ? f : 1;
      const a = target.anger + dmg * T.ANGER_PER_DAMAGE * (hostile ? 1.5 : 0.6);
      target.anger = a < 1 ? a : 1;
    }

    // effets
    if (dmg >= T.BLOOD_MIN_DAMAGE && isBloody(kind) && ctx.settings.values.violence === 'realiste') {
      const size = dmg / 40;
      ctx.events.emit('fx', {
        id: 'sang', x: target.x, y: target.y + zone * target.look.height, z: target.z,
        size: size < 0.2 ? 0.2 : size > 1 ? 1 : size, dirX, dirY: 0.2, dirZ,
      });
    }
    if (dmg >= T.CRY_MIN_DAMAGE && now - e.cryAt >= T.CRY_INTERVAL && !dead) {
      e.cryAt = now;
      const vol = dmg / 40;
      ctx.events.emit('sfx', {
        id: 'cri', x: target.x, y: target.y + 1.5, z: target.z, volume: vol < 0.4 ? 0.4 : vol > 1 ? 1 : vol,
        pitch: 0.85 + ((target.id * 37) % 100) / 285,
      });
    }

    if (dead) {
      this.kill(target, e, d.sourceId, kind, d);
      return;
    }
    const worse = injuryFor(health);
    if (rank(worse) > rank(target.injury)) target.injury = worse;
    ctx.events.emit('person:hurt', { id: target.id, info: d, healthAfter: health });

    // mise à terre
    if (target.posture !== 'down' && target.vehicleId === 0) {
      if (health <= T.HEALTH_CRITICAL) {
        this.goDown(target, e, d.sourceId, 0);
      } else if ((dmg >= T.KNOCKDOWN_DAMAGE && kind !== 'burn' && kind !== 'gas') || kb >= T.KNOCKDOWN_KNOCKBACK
        || (head && stun >= T.KNOCKDOWN_HEAD_STUN)) {
        let t = this.rng.range(T.DOWN_TIME_MIN, T.DOWN_TIME_MAX);
        if (target.injury === 'serious') t *= T.DOWN_TIME_SERIOUS;
        this.goDown(target, e, d.sourceId, t > stun ? t : stun);
      }
    } else if (target.posture === 'down' && health <= T.HEALTH_CRITICAL) {
      e.downTimer = 0; // ne se relèvera pas seule
    }
  }

  /**
   * Dégât interne sans direction ni zone (brûlure continue, saignement, malaise).
   * `emit` : publier person:hurt ; `lethal` : arriver à zéro tue (violence « réaliste » uniquement).
   */
  damageDirect(
    target: Person, e: PersonExtra, dmg: number, kind: DamageKind, sourceId: EntityId, emit: boolean, lethal: boolean,
  ): void {
    if (target.injury === 'dead' || !(dmg > 0)) return;
    const d = this.scratch;
    d.amount = dmg;
    d.kind = kind;
    d.sourceId = sourceId;
    d.x = target.x;
    d.z = target.z;
    let health = target.health - dmg;
    if (lethal && this.canDie()) {
      if (health <= 0) {
        this.kill(target, e, sourceId, kind, d);
        return;
      }
    } else if (health < 1) {
      // cause non mortelle : la personne reste inconsciente, dans un état critique, sans mourir
      health = target.health < 1 ? target.health : 1;
    }
    target.health = health;
    const worse = injuryFor(health);
    if (rank(worse) > rank(target.injury)) target.injury = worse;
    if (emit) this.ctx.events.emit('person:hurt', { id: target.id, info: d, healthAfter: health });
    if (health <= T.HEALTH_CRITICAL) {
      if (target.posture !== 'down' && target.vehicleId === 0) this.goDown(target, e, sourceId, 0);
      else e.downTimer = 0;
    }
  }

  private canDie(): boolean {
    return this.ctx.settings.values.violence === 'realiste';
  }

  private kill(target: Person, e: PersonExtra, sourceId: EntityId, kind: DamageKind, d: DamageInfo): void {
    const ctx = this.ctx;
    target.health = 0;
    target.injury = 'dead';
    target.stun = 0;
    e.downTimer = 0;
    ctx.events.emit('person:hurt', { id: target.id, info: d, healthAfter: 0 });
    if (target.posture !== 'down' && target.vehicleId === 0) {
      this.goDown(target, e, sourceId, 0);
    } else {
      ctx.events.emit('person:down', { id: target.id, injury: 'dead', sourceId });
    }
    ctx.events.emitAny('people:died', { id: target.id, sourceId, kind });
  }

  // ───────────────────────────── à terre, relevé ─────────────────────────────

  /** Met à terre ; `seconds` > 0 : la personne se relèvera seule si son état le permet. */
  private goDown(target: Person, e: PersonExtra, sourceId: EntityId, seconds: number): void {
    const ctx = this.ctx;
    if (target.posture === 'down') {
      if (seconds <= 0) e.downTimer = 0;
      return;
    }
    target.posture = 'down';
    target.cmd.moveX = 0;
    target.cmd.moveZ = 0;
    target.cmd.jump = false;
    e.downTimer = seconds > 0 ? seconds : 0;
    e.jumpT = 0;
    e.vault = 0;
    // une personne à terre lâche ce qu'elle porte et abandonne ce qu'elle faisait
    if (target.carrying !== 0) {
      if (!this.shared.release(target, false)) {
        const carried = ctx.people.get(target.carrying);
        if (carried) {
          if (carried.heldBy === target.id) carried.heldBy = 0;
        } else {
          const prop = ctx.props.get(target.carrying);
          if (prop && prop.carriedBy === target.id) prop.carriedBy = 0;
        }
        target.carrying = 0;
      }
    }
    ctx.interactions.cancel(target);
    ctx.events.emit('person:down', { id: target.id, injury: target.injury, sourceId });
  }

  setDown(target: Person, down: boolean, sourceId: EntityId): void {
    const e = this.shared.of(target);
    if (down) {
      // assis dans un véhicule, on ne tombe pas : la personne reste sur son siège
      if (target.posture === 'down' || target.vehicleId !== 0) return;
      // une personne valide mise à terre (bousculade, plaquage) se relève d'elle-même si rien ne la retient
      const transient = target.health > T.HEALTH_CRITICAL && target.injury !== 'dead';
      this.goDown(target, e, sourceId, transient ? this.rng.range(T.DOWN_TIME_MIN, T.DOWN_TIME_MAX) : 0);
    } else {
      if (target.posture !== 'down' || target.health <= 0 || target.injury === 'dead') return;
      target.posture = 'stand';
      e.downTimer = 0;
      this.ctx.events.emit('person:recovered', { id: target.id });
    }
  }

  knockDown(p: Person, seconds: number, sourceId: EntityId): void {
    if (p.injury === 'dead' || p.vehicleId !== 0) return;
    const e = this.shared.of(p);
    if (p.posture === 'down') {
      e.downTimer = seconds > 0 ? seconds : 0;
      return;
    }
    this.goDown(p, e, sourceId, seconds);
  }

  // ───────────────────────────── soigner ─────────────────────────────

  heal(target: Person, amount: number, byId: EntityId): void {
    if (target.injury === 'dead' || !(amount > 0)) return;
    const e = this.shared.of(target);
    let h = target.health + amount;
    if (h > 100) h = 100;
    target.health = h;
    target.injury = injuryFor(h);
    e.treated = true;
    // remise sur pied : la personne se relèvera d'elle-même dans un instant, si rien ne la retient
    if (target.posture === 'down' && h > T.HEALTH_CRITICAL) e.downTimer = T.RECOVER_AFTER_HEAL;
    this.ctx.events.emit('person:treated', { id: target.id, byId });
  }

  stabilise(p: Person, byId: EntityId): void {
    if (p.injury === 'dead') return;
    const e = this.shared.of(p);
    if (e.treated) return;
    e.treated = true;
    this.ctx.events.emit('person:treated', { id: p.id, byId });
  }

  rinseEyes(p: Person, byId: EntityId): void {
    if (p.injury === 'dead') return;
    this.shared.of(p).rinseT = T.GAS_RINSE_TIME;
    this.ctx.events.emit('person:treated', { id: p.id, byId });
  }

  extinguish(p: Person, byId: EntityId): void {
    if (!(p.burning > 0)) return;
    p.burning = 0;
    const e = this.shared.of(p);
    if (e.wasBurning) {
      e.wasBurning = false;
      this.ctx.events.emit('fire:out', { x: p.x, z: p.z, targetKind: 'person', targetId: p.id, byId });
    }
  }
}

function rank(i: InjuryLevel): number {
  switch (i) {
    case 'light': return 1;
    case 'serious': return 2;
    case 'critical': return 3;
    case 'dead': return 4;
    default: return 0;
  }
}

/** Zones couvertes par le bouclier : debout du genou au menton ; parade haute si la visée est levée ; tout le corps accroupi. */
function shieldCovers(p: Person, zone: number): boolean {
  if (p.posture === 'crouch' || p.posture === 'kneel') return true;
  if (p.aimPitch > T.SHIELD_PARRY_PITCH) return zone >= T.SHIELD_PARRY_LOW;
  return zone >= T.SHIELD_LOW && zone <= T.SHIELD_HIGH;
}

function isBloody(kind: DamageKind): boolean {
  return kind === 'impact' || kind === 'blunt' || kind === 'bullet' || kind === 'blast' || kind === 'vehicle'
    || kind === 'crush' || kind === 'fall';
}

/** Cause pouvant entraîner la mort : arme à feu, véhicule, feu, chute, écrasement, explosion d'un engin (pas les moyens de force intermédiaire). */
function isGrave(d: DamageInfo): boolean {
  switch (d.kind) {
    case 'bullet':
      return d.means !== 'lbd' && d.item !== 'lbd40';
    case 'blast':
      return d.means !== 'gm2l' && d.means !== 'desencerclement' && d.means !== 'lacrymo';
    case 'vehicle':
    case 'burn':
    case 'crush':
    case 'fall':
      return true;
    default:
      return false;
  }
}
