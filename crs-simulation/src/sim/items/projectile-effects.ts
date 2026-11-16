/* =====================================================================================
 * EFFETS DES PROJECTILES — ce qui se passe au contact (sol, mur, objet, véhicule, vitrine, personne)
 * et à la fin du retard (éclatement en palets, détonation, plots, gerbe d'artifice, étoile rouge).
 *
 * Tout dégât passe par ctx.health.hurt (dégâts bruts : les protections sont appliquées par le module
 * de santé d'après DamageInfo.zone). Chaque choc émet projectile:impact, chaque détonation
 * 'explosion' ; le son des chocs et des explosions est déduit de ces événements par le module audio.
 * ===================================================================================== */

import type {
  DamageInfo, EntityId, Person, Projectile, Prop, RayHit, Shop, Vehicle,
} from '@/core/contracts';
import { distSqPointObb } from '@/core/math';
import { ROLL_THRESHOLD, bounceWall, contactGround } from './ballistics';
import {
  BOTTLE_SHARD_DAMAGE, BOTTLE_SHARD_RADIUS, EMIT_PERIOD, FIREWORK_BURN, FIREWORK_RADIUS, FIREWORK_STUN,
  FLARE_COLOR, FLARE_SECONDS, GM2L_BLAST_DAMAGE, GM2L_BLAST_RADIUS, GM2L_GAS_AMOUNT, GM2L_GAS_RADIUS,
  GM2L_STUN_MAX, GM2L_STUN_RADIUS, IMPACT_FUSE, MOLOTOV_BURN, MOLOTOV_POOL_RADIUS, MOLOTOV_SPLASH_RADIUS,
  PALET_AIR_BOOST, PALET_CARRY_AIR, PALET_CARRY_GROUND, PALET_COUNT, PALET_EJECT_MAX, PALET_EJECT_MIN, PALET_LINGER_SECONDS, SMOKE_RADIUS, SMOKE_RATE,
  STING_BLAST_DAMAGE, STING_BLAST_RADIUS, STING_PLOTS, STING_PLOT_SPEED, STING_RADIUS, STING_STUN_MAX,
} from './projectile-defs';
import type { ProjState, ProjectileSystem } from './projectiles';
import { COVER_NONE, COVER_SHIELD, coverOf, isPolice, wearCover } from './shared';
import type { ItemsCore } from './shared';

const TAU = Math.PI * 2;

export class ProjectileEffects {
  private readonly vehicles: Vehicle[] = [];

  constructor(private readonly core: ItemsCore, private readonly sys: ProjectileSystem) {}

  // ───────────────────────────── aides ─────────────────────────────

  private impact(p: Projectile, hitKind: RayHit['kind'] | 'ground', hitId: EntityId): void {
    this.core.ctx.events.emit('projectile:impact', {
      id: p.id, kind: p.kind, ownerId: p.ownerId, x: p.x, y: p.y, z: p.z, hitKind, hitId,
    });
  }

  private owner(p: Projectile): Person | undefined {
    return p.ownerId !== 0 ? this.core.ctx.people.get(p.ownerId) : undefined;
  }

  private energy(p: Projectile, st: ProjState): number {
    return 0.5 * st.spec.mass * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
  }

  /** Le projectile tombe à l'eau. */
  sink(p: Projectile): boolean {
    this.core.fx('eclaboussure', p.x, p.y, p.z, 0.6);
    this.sys.remove(p.id);
    return false;
  }

  // ───────────────────────────── contacts ─────────────────────────────

  hitGround(p: Projectile, st: ProjState, px: number, py: number, pz: number, floor: number): boolean {
    const spec = st.spec;
    const core = this.core;
    const action = spec.onGround;
    const vn = contactGround(
      p, px, py, pz, floor, spec.radius,
      action === 'bounce' ? spec.restitution : 0, action === 'bounce' ? spec.friction : 1,
    );
    st.floorY = floor;
    st.impacts++;
    if (core.ctx.world.surfaceAt(p.x, p.z) === 'water') return this.sink(p);
    switch (action) {
      case 'bounce':
        if (vn > 1.2) {
          this.impact(p, 'ground', 0);
          if (spec.cls === 'heavy') core.fx('poussiere', p.x, p.y, p.z, 0.5);
        }
        if (p.kind === 'grenade_lacrymo_56' && p.fuse > IMPACT_FUSE) p.fuse = IMPACT_FUSE;
        if (p.vy < ROLL_THRESHOLD) {
          p.vy = 0;
          st.rolling = true;
          p.pickable = spec.pickable && !st.spent;
        }
        return true;
      case 'shatter':
        this.impact(p, 'ground', 0);
        return this.shatter(p, null);
      case 'ignite':
        this.impact(p, 'ground', 0);
        return this.ignite(p, null, 1);
      case 'explode':
        this.impact(p, 'ground', 0);
        return this.firework(p, st);
      case 'splat':
        this.impact(p, 'ground', 0);
        return this.splat(p, st);
      default:
        this.impact(p, 'ground', 0);
        core.fx('impact', p.x, p.y, p.z, 0.3);
        this.sys.remove(p.id);
        return false;
    }
  }

  /** Choc contre une paroi verticale de normale (nx, nz) : mur, grille, objet, carrosserie. */
  hitWall(p: Projectile, st: ProjState, nx: number, nz: number, hitKind: RayHit['kind'], hitId: EntityId): boolean {
    const spec = st.spec;
    st.impacts++;
    switch (spec.onWall) {
      case 'bounce': {
        const vn = bounceWall(p, nx, nz, spec.restitution, spec.friction);
        if (vn > 1) this.impact(p, hitKind, hitId);
        if (p.kind === 'grenade_lacrymo_56' && p.fuse > IMPACT_FUSE) p.fuse = IMPACT_FUSE;
        return true;
      }
      case 'shatter':
        this.impact(p, hitKind, hitId);
        return this.shatter(p, null);
      case 'ignite':
        this.impact(p, hitKind, hitId);
        return this.ignite(p, null, 1);
      case 'explode':
        this.impact(p, hitKind, hitId);
        return this.firework(p, st);
      case 'splat':
        this.impact(p, hitKind, hitId);
        return this.splat(p, st);
      default:
        this.impact(p, hitKind, hitId);
        this.core.fx('impact', p.x, p.y, p.z, 0.3);
        this.sys.remove(p.id);
        return false;
    }
  }

  hitProp(p: Projectile, st: ProjState, prop: Prop, nx: number, nz: number): boolean {
    const spec = st.spec;
    const core = this.core;
    const owner = this.owner(p);
    if (spec.onWall === 'splat') {
      core.ctx.props.tag(prop, p.ownerId);
      if (owner) core.recordOffense(owner, 'tag', p.x, p.z);
    } else if (spec.cls !== 'fire' && spec.cls !== 'firework') {
      const amount = this.energy(p, st) * 0.08 * core.tuning.damageScale;
      if (amount >= 1) {
        core.ctx.props.damage(prop, amount, spec.damageKind === 'bullet' ? 'bullet' : 'impact', p.ownerId);
        if (owner && amount >= 5) core.recordOffense(owner, 'degradation', p.x, p.z);
      }
    }
    return this.hitWall(p, st, nx, nz, 'prop', prop.id);
  }

  hitVehicle(p: Projectile, st: ProjState, v: Vehicle, nx: number, nz: number): boolean {
    const spec = st.spec;
    const core = this.core;
    const owner = this.owner(p);
    if (spec.onWall === 'splat') {
      core.fx('peinture', p.x, p.y, p.z, 0.5, st.color);
    } else if (spec.cls !== 'fire' && spec.cls !== 'firework') {
      const amount = this.energy(p, st) * 0.04 * (v.def.armored ? 0.1 : 1) * core.tuning.damageScale;
      if (amount >= 0.5) {
        core.ctx.vehicles.damage(v, {
          amount, kind: spec.damageKind === 'bullet' ? 'bullet' : 'impact', sourceId: p.ownerId,
          item: spec.item ?? undefined, x: p.x, z: p.z,
        });
        // pare-brise et vitres : entre le milieu et le haut de la caisse
        const rel = v.def.height > 0 ? (p.y - v.y) / v.def.height : 0;
        if (spec.cls === 'heavy' && !v.def.armored && rel > 0.45 && rel < 0.95) core.fx('eclats_verre', p.x, p.y, p.z, 0.8);
        if (owner && amount >= 2) core.recordOffense(owner, v.faction === 'police' ? 'violence_agent' : 'degradation', p.x, p.z);
      }
    }
    return this.hitWall(p, st, nx, nz, 'vehicle', v.id);
  }

  hitShop(p: Projectile, st: ProjState, shop: Shop, nx: number, nz: number): boolean {
    const spec = st.spec;
    const core = this.core;
    const props = core.ctx.props;
    const owner = this.owner(p);
    const before = shop.window;
    if (spec.onWall === 'splat') {
      props.tag(shop, p.ownerId);
      if (owner) core.recordOffense(owner, 'tag', p.x, p.z);
    } else if (spec.cls !== 'fire' && spec.cls !== 'firework') {
      const amount = this.energy(p, st) * 0.2 * core.tuning.damageScale;
      if (amount >= 1) props.damageShop(shop, amount, spec.damageKind === 'bullet' ? 'bullet' : 'impact', p.ownerId);
    }
    if (shop.window !== before) {
      if (shop.window === 'broken') core.fx('eclats_verre', p.x, p.y, p.z, Math.min(3, shop.width * 0.5));
      if (owner && shop.window !== 'tagged') core.recordOffense(owner, 'degradation', p.x, p.z);
    }
    if (shop.window === 'broken' && shop.shutter < 0.5) {
      // vitrine ouverte : l'engin incendiaire met le feu à la boutique, les projectiles inertes y tombent
      if (spec.onWall === 'ignite') {
        this.impact(p, 'building', shop.id);
        props.damageShop(shop, 40, 'burn', p.ownerId);
        return this.ignite(p, null, 1);
      }
      if (spec.cls === 'heavy' || spec.cls === 'lbd' || spec.cls === 'bullet' || (spec.cls === 'small' && !p.emitting)) {
        this.impact(p, 'building', shop.id);
        this.sys.remove(p.id);
        return false;
      }
    }
    return this.hitWall(p, st, nx, nz, 'building', shop.id);
  }

  hitPerson(p: Projectile, st: ProjState, target: Person, zone: number): boolean {
    const spec = st.spec;
    const core = this.core;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
    const hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    // direction horizontale du projectile ; s'il tombe à la verticale, on prend l'axe tireur → cible
    let dirX = 0;
    let dirZ = 0;
    if (hs > 0.5) {
      dirX = p.vx / hs;
      dirZ = p.vz / hs;
    } else {
      const ox = target.x - st.originX;
      const oz = target.z - st.originZ;
      const ol = Math.sqrt(ox * ox + oz * oz);
      if (ol > 1e-6) {
        dirX = ox / ol;
        dirZ = oz / ol;
      }
    }
    const energy = 0.5 * spec.mass * speed * speed;
    const owner = this.owner(p);
    st.ignoreId = target.id;
    st.impacts++;
    this.impact(p, 'person', target.id);
    if (owner && isPolice(target) && (spec.cls !== 'small' || energy > 3)) {
      core.recordOffense(owner, 'violence_agent', p.x, p.z);
    }

    const cover = coverOf(target, -dirX, -dirZ, zone, spec.cls);
    if (cover !== COVER_NONE) {
      wearCover(target, cover, energy);
      core.fx('impact', p.x, p.y, p.z, 0.4);
      switch (spec.onPerson) {
        case 'shatter': return this.shatter(p, target);
        case 'ignite': return this.ignite(p, target, cover === COVER_SHIELD ? 0.3 : 0.6);
        case 'explode': return this.firework(p, st);
        case 'splat': return this.splat(p, st);
        case 'remove':
          this.sys.remove(p.id);
          return false;
        default:
          // dévié : retombe au pied de la protection
          bounceWall(p, -dirX, -dirZ, 0.25, 0.6);
          return true;
      }
    }

    let amount = spec.damageBase + spec.damagePerJoule * energy;
    let stun = spec.stunBase + amount * spec.stunPerDamage;
    if (zone >= 0.86) {
      amount *= spec.headFactor;
      stun *= 1.5;
    } else if (zone < 0.45) {
      amount *= spec.legFactor;
    }
    amount *= core.tuning.damageScale;
    if (amount > 0 || stun > 0) {
      const info: DamageInfo = {
        amount,
        kind: spec.damageKind,
        sourceId: p.ownerId,
        x: p.x,
        z: p.z,
        dirX,
        dirZ,
        zone,
        stun,
        knockback: Math.min(2.5, (spec.mass * speed) / 40),
      };
      if (spec.item) info.item = spec.item;
      if (spec.means && owner && isPolice(owner)) info.means = spec.means;
      core.ctx.health.hurt(target, info);
      if (owner && !isPolice(target) && amount >= 3) core.recordOffense(owner, 'violence', p.x, p.z);
    }

    switch (spec.onPerson) {
      case 'shatter': return this.shatter(p, target);
      case 'ignite': return this.ignite(p, target, 1);
      case 'explode': return this.firework(p, st);
      case 'splat':
        return this.splat(p, st);
      case 'remove':
        this.sys.remove(p.id);
        return false;
      case 'bounce':
        bounceWall(p, -dirX, -dirZ, spec.restitution * 0.5, 0.6);
        return true;
      default:
        // arrêté par le corps : tombe au pied de la personne
        p.vx *= -0.03;
        p.vz *= -0.03;
        if (p.vy > 0) p.vy = 0;
        if (p.kind === 'grenade_lacrymo_56' && p.fuse > IMPACT_FUSE) p.fuse = IMPACT_FUSE;
        return true;
    }
  }

  // ───────────────────────────── émission et retard ─────────────────────────────

  /** Dépôt périodique de gaz (palet) ou de fumée (fumigène) à la position courante. */
  emit(p: Projectile, st: ProjState, dt: number): void {
    st.emitAcc += dt;
    if (st.emitAcc < EMIT_PERIOD) return;
    st.emitAcc -= EMIT_PERIOD;
    const core = this.core;
    if (p.kind === 'fumigene') {
      core.ctx.hazards.emitSmoke(p.x, p.z, SMOKE_RATE * EMIT_PERIOD, SMOKE_RADIUS, st.color);
    } else {
      core.ctx.hazards.emitGas(p.x, p.z, core.tuning.paletGasRate * EMIT_PERIOD, core.tuning.paletGasRadius);
    }
  }

  /** Fin du retard. Retourne false si le projectile a disparu. */
  onFuse(p: Projectile, st: ProjState): boolean {
    switch (st.spec.fuseAction) {
      case 'burst': return this.burst(p, st);
      case 'gm2l': return this.detonateGm2l(p);
      case 'sting': return this.detonateSting(p, st);
      case 'firework': return this.firework(p, st);
      case 'flare': return this.flare(p);
      case 'remove':
        if (p.emitting) {
          // source épuisée : le palet ou la torche reste un instant au sol, éteint
          p.emitting = false;
          p.pickable = false;
          st.spent = true;
          p.fuse = PALET_LINGER_SECONDS;
          return true;
        }
        this.sys.remove(p.id);
        return false;
      default:
        p.fuse = Infinity;
        return true;
    }
  }

  /** Grenade lacrymogène : s'ouvre et disperse ses palets, qui fument chacun de leur côté. */
  private burst(p: Projectile, st: ProjState): boolean {
    const core = this.core;
    const rng = core.rng;
    const airborne = !st.rolling && !p.resting && p.y - st.floorY > 0.6;
    core.ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: 1, sourceId: p.ownerId });
    core.fx('gaz', p.x, p.y, p.z, 2, undefined, 2);
    const base = rng.next() * TAU;
    // en l'air, les palets gardent une part de l'élan de la grenade : leur gerbe retombe centrée sur
    // le point de chute visé ; au sol, la charge d'ouverture les fait sauter tout autour
    const carry = airborne ? PALET_CARRY_AIR : PALET_CARRY_GROUND;
    const boost = airborne ? PALET_AIR_BOOST : 1;
    for (let i = 0; i < PALET_COUNT; i++) {
      // directions réparties tout autour, avec un peu d'aléa
      const a = base + (i * TAU) / PALET_COUNT + rng.range(-0.3, 0.3);
      const v = rng.range(PALET_EJECT_MIN, PALET_EJECT_MAX) * boost;
      const vy = airborne ? p.vy * 0.2 + rng.range(-0.5, 2.5) : rng.range(3, 5.5);
      const palet = this.sys.spawn(
        'palet_lacrymo', p.ownerId, p.x, p.y + 0.05, p.z,
        p.vx * carry + Math.sin(a) * v, vy, p.vz * carry + Math.cos(a) * v,
      );
      const ps = this.sys.stateOf(palet);
      ps.emitAcc = (i * EMIT_PERIOD) / PALET_COUNT;
      ps.floorY = st.floorY;
      ps.originX = st.originX;
      ps.originZ = st.originZ;
    }
    this.sys.remove(p.id);
    return false;
  }

  /**
   * Souffle et sidération autour d'une détonation : étourdissement décroissant jusqu'à `radius`
   * (le casque atténue), dégâts de souffle sous `blastRadius`. Retourne le nombre de personnes atteintes.
   */
  private shock(
    p: Projectile, radius: number, stunMax: number, blastRadius: number, blastDamage: number, gas: number,
  ): number {
    const core = this.core;
    const ctx = core.ctx;
    const owner = this.owner(p);
    const spec = this.sys.stateOf(p).spec;
    const means = spec.means && owner && isPolice(owner) ? spec.means : undefined;
    const people = core.people2;
    const n = ctx.people.queryRadius(p.x, p.z, radius, people);
    let policeHit = false;
    for (let i = 0; i < n; i++) {
      const q = people[i]!;
      if (q.vehicleId !== 0) continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const k = 1 - d / radius;
      if (k <= 0) continue;
      const stun = stunMax * k * k * (1 - 0.4 * q.armorHead);
      const amount = d < blastRadius ? blastDamage * (1 - d / blastRadius) * core.tuning.damageScale : 0;
      const info: DamageInfo = {
        amount, kind: 'blast', sourceId: p.ownerId, x: p.x, z: p.z,
        dirX: d > 1e-6 ? dx / d : 0, dirZ: d > 1e-6 ? dz / d : 0, zone: 0.5, stun, knockback: k * 1.2,
      };
      if (spec.item) info.item = spec.item;
      if (means) info.means = means;
      if (gas > 0) {
        const g = q.gas + gas * k * (1 - (q.gasProtection > 1 ? 1 : q.gasProtection < 0 ? 0 : q.gasProtection));
        q.gas = g > 1 ? 1 : g;
      }
      ctx.health.hurt(q, info);
      if (isPolice(q)) policeHit = true;
    }
    if (owner && policeHit) core.recordOffense(owner, 'violence_agent', p.x, p.z);
    return n;
  }

  /** Grenade assourdissante-lacrymogène : détonation et nuage instantané. */
  private detonateGm2l(p: Projectile): boolean {
    const core = this.core;
    core.ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: GM2L_STUN_RADIUS, sourceId: p.ownerId });
    core.fx('explosion', p.x, p.y, p.z, 2);
    core.fx('flash', p.x, p.y + 0.3, p.z, 3, 0xffffff, 0.15);
    core.fx('gaz', p.x, p.y, p.z, GM2L_GAS_RADIUS, undefined, 4);
    core.ctx.hazards.emitGas(p.x, p.z, GM2L_GAS_AMOUNT, GM2L_GAS_RADIUS);
    this.shock(p, GM2L_STUN_RADIUS, GM2L_STUN_MAX, GM2L_BLAST_RADIUS, GM2L_BLAST_DAMAGE, 0.5);
    this.sys.remove(p.id);
    return false;
  }

  /** Grenade de désencerclement : détonation et projection horizontale des plots de caoutchouc. */
  private detonateSting(p: Projectile, st: ProjState): boolean {
    const core = this.core;
    const rng = core.rng;
    core.ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: STING_RADIUS, sourceId: p.ownerId });
    core.fx('explosion', p.x, p.y, p.z, 1.5);
    core.fx('flash', p.x, p.y + 0.3, p.z, 2.5, 0xffffff, 0.12);
    this.shock(p, STING_RADIUS, STING_STUN_MAX, STING_BLAST_RADIUS, STING_BLAST_DAMAGE, 0);
    const base = rng.next() * TAU;
    const y = (p.y > st.floorY + 0.1 ? p.y : st.floorY + 0.1) + 0.1;
    for (let i = 0; i < STING_PLOTS; i++) {
      const a = base + (i * TAU) / STING_PLOTS + rng.range(-0.12, 0.12);
      const pitch = rng.range(0.02, 0.22);
      const v = STING_PLOT_SPEED * rng.range(0.9, 1.1);
      const cp = Math.cos(pitch);
      const plot = this.sys.spawn('plot_caoutchouc', p.ownerId, p.x, y, p.z, Math.sin(a) * cp * v, Math.sin(pitch) * v, Math.cos(a) * cp * v);
      this.sys.stateOf(plot).floorY = st.floorY;
    }
    this.sys.remove(p.id);
    return false;
  }

  /** Mortier d'artifice : gerbe lumineuse, brûlure légère et étourdissement à proximité. */
  private firework(p: Projectile, st: ProjState): boolean {
    const core = this.core;
    const ctx = core.ctx;
    ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: FIREWORK_RADIUS, sourceId: p.ownerId });
    core.fx('feu_artifice', p.x, p.y, p.z, 3, st.color, 1.2);
    core.fx('etincelles', p.x, p.y, p.z, 2, st.color, 0.8);
    const owner = this.owner(p);
    const people = core.people2;
    const n = ctx.people.queryRadius(p.x, p.z, FIREWORK_RADIUS, people);
    let policeHit = false;
    for (let i = 0; i < n; i++) {
      const q = people[i]!;
      if (q.vehicleId !== 0) continue;
      // l'explosion peut avoir lieu en hauteur : distance en trois dimensions jusqu'au buste
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const dy = q.y + 1.1 - p.y;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let k = 1 - d / FIREWORK_RADIUS;
      if (k <= 0) continue;
      const dh = Math.sqrt(dx * dx + dz * dz);
      // un bouclier levé face à la gerbe en arrête l'essentiel
      if (dh > 1e-6 && coverOf(q, -dx / dh, -dz / dh, 0.6, 'firework') === COVER_SHIELD) k *= 0.35;
      ctx.health.hurt(q, {
        amount: FIREWORK_BURN * k * core.tuning.damageScale, kind: 'burn', sourceId: p.ownerId, item: 'mortier',
        x: p.x, z: p.z, dirX: dh > 1e-6 ? dx / dh : 0, dirZ: dh > 1e-6 ? dz / dh : 0, zone: 0.7,
        stun: FIREWORK_STUN * k * (1 - 0.3 * q.armorHead), knockback: 0.3 * k,
      });
      if (isPolice(q)) policeHit = true;
    }
    if (owner && policeHit) core.recordOffense(owner, 'violence_agent', p.x, p.z);
    this.sys.remove(p.id);
    return false;
  }

  /** Fusée de sommation : étoile rouge visible de toute la place. */
  private flare(p: Projectile): boolean {
    const core = this.core;
    core.ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: 0, sourceId: p.ownerId });
    core.fx('feu_artifice', p.x, p.y, p.z, 6, FLARE_COLOR, FLARE_SECONDS);
    this.sys.remove(p.id);
    return false;
  }

  /** Bouteille : elle éclate ; les éclats touchent les jambes des personnes proches. */
  private shatter(p: Projectile, direct: Person | null): boolean {
    const core = this.core;
    const ctx = core.ctx;
    core.fx('eclats_verre', p.x, p.y, p.z, 0.6);
    const people = core.people2;
    const n = ctx.people.queryRadius(p.x, p.z, BOTTLE_SHARD_RADIUS, people);
    for (let i = 0; i < n; i++) {
      const q = people[i]!;
      if (q === direct || q.vehicleId !== 0) continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const k = 1 - d / BOTTLE_SHARD_RADIUS;
      if (k <= 0) continue;
      const ux = d > 1e-6 ? dx / d : 0;
      const uz = d > 1e-6 ? dz / d : 0;
      if (coverOf(q, -ux, -uz, 0.3, 'small') !== COVER_NONE) continue;
      ctx.health.hurt(q, {
        amount: BOTTLE_SHARD_DAMAGE * k * core.tuning.damageScale, kind: 'impact', sourceId: p.ownerId,
        item: 'bouteille', x: p.x, z: p.z, dirX: ux, dirZ: uz, zone: 0.25, stun: 0, knockback: 0,
      });
    }
    this.sys.remove(p.id);
    return false;
  }

  /**
   * Engin incendiaire : nappe de feu (ctx.hazards.ignite), personnes éclaboussées enflammées,
   * véhicules et objets touchés par les flammes. `directFactor` atténue l'effet sur la personne
   * touchée de plein fouet quand une protection l'a arrêté.
   */
  private ignite(p: Projectile, direct: Person | null, directFactor: number): boolean {
    const core = this.core;
    const ctx = core.ctx;
    const owner = this.owner(p);
    ctx.events.emit('explosion', { kind: p.kind, x: p.x, y: p.y, z: p.z, radius: MOLOTOV_POOL_RADIUS, sourceId: p.ownerId });
    core.fx('eclats_verre', p.x, p.y, p.z, 0.5);
    core.fx('feu', p.x, p.y, p.z, MOLOTOV_POOL_RADIUS * 2, undefined, 2);
    ctx.hazards.ignite(p.x, p.z, MOLOTOV_POOL_RADIUS, 1, p.ownerId);
    if (owner) core.recordOffense(owner, 'incendie', p.x, p.z);

    const people = core.people2;
    const n = ctx.people.queryRadius(p.x, p.z, MOLOTOV_SPLASH_RADIUS, people);
    let policeHit = false;
    for (let i = 0; i < n; i++) {
      const q = people[i]!;
      if (q.vehicleId !== 0) continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      let k = q === direct ? directFactor : 1 - d / MOLOTOV_SPLASH_RADIUS;
      if (k <= 0) continue;
      const ux = d > 1e-6 ? dx / d : 0;
      const uz = d > 1e-6 ? dz / d : 0;
      if (q !== direct && coverOf(q, -ux, -uz, 0.4, 'fire') === COVER_SHIELD) k *= 0.3;
      const burning = 0.25 + 0.65 * k;
      if (burning > q.burning) q.burning = burning;
      ctx.health.hurt(q, {
        amount: MOLOTOV_BURN * k * core.tuning.damageScale, kind: 'burn', sourceId: p.ownerId, item: 'molotov',
        x: p.x, z: p.z, dirX: ux, dirZ: uz, zone: 0.4, stun: 0, knockback: 0,
      });
      if (isPolice(q)) policeHit = true;
    }
    if (owner && policeHit) core.recordOffense(owner, 'violence_agent', p.x, p.z);

    // véhicules léchés par les flammes
    if (ctx.vehicles.list.length > 0) {
      const vehicles = this.vehicles;
      const nv = ctx.vehicles.queryRadius(p.x, p.z, MOLOTOV_POOL_RADIUS + 8, vehicles);
      for (let i = 0; i < nv; i++) {
        const v = vehicles[i]!;
        if (v.def.flying) continue;
        const r = MOLOTOV_POOL_RADIUS + 0.2;
        if (distSqPointObb(p.x, p.z, v.x, v.z, v.def.width * 0.5, v.def.length * 0.5, v.heading) > r * r) continue;
        const armored = v.def.armored;
        ctx.vehicles.damage(v, {
          amount: (armored ? 2 : 15) * core.tuning.damageScale, kind: 'burn', sourceId: p.ownerId, item: 'molotov', x: p.x, z: p.z,
        });
        const burning = armored ? 0.05 : 0.3;
        if (burning > v.burning) v.burning = burning;
        if (owner && v.faction === 'police') core.recordOffense(owner, 'violence_agent', p.x, p.z);
      }
    }
    // mobilier pris dans la nappe
    if (ctx.props.list.length > 0) {
      const props = core.props;
      const np = ctx.props.queryRadius(p.x, p.z, MOLOTOV_POOL_RADIUS, props);
      for (let i = 0; i < np; i++) ctx.props.damage(props[i]!, 15, 'burn', p.ownerId);
    }
    this.sys.remove(p.id);
    return false;
  }

  /** Œuf de peinture : il éclate en tache de couleur. */
  private splat(p: Projectile, st: ProjState): boolean {
    this.core.fx('peinture', p.x, p.y, p.z, 0.6, st.color !== 0 ? st.color : 0xd9382e);
    this.sys.remove(p.id);
    return false;
  }
}
