/* =====================================================================================
 * Dégâts, incendie, explosion et retournement des véhicules.
 *
 *   santé 100 → 0 : ok → endommagé (< 50) → épave (0). Le blindage divise les dégâts reçus.
 *   Incendie (docs/research/00-bible-realisme.md, G.4) :
 *     - un véhicule s'embrase quand sa « chaleur » atteint 1 : dégâts de brûlure (cocktail Molotov),
 *       feu au sol sous lui (ctx.hazards.fireAt) ou véhicule en flammes à moins de 2 m ;
 *     - il brûle progressivement (embrasement complet en 2 à 4 min pour une voiture), fume
 *       (emitSmoke, fumée noire), chauffe le sol (ignite), ses pneus éclatent, son réservoir peut
 *       exploser (événement 'explosion', dégâts alentour) ; ses occupants évacuent ;
 *     - l'eau l'éteint : 1 unité d'agent ≈ 1 s d'extincteur ; 65 unités pour un véhicule embrasé
 *       (20 à 30 s de canon à eau), 15 pour un début d'incendie (un extincteur n'y suffit plus ensuite) ;
 *     - le feu fini, il reste une carcasse calcinée ('burnt'), toujours un obstacle.
 *   Retournement : un groupe (6 personnes pendant 8 s par défaut) couche une voiture légère sur le flanc.
 * Événements : vehicle:state, fire:started, fire:out, explosion, 'vehicles:flipped'.
 * ===================================================================================== */

import type { DamageInfo, DamageKind, EntityId, Person, Prop, Vehicle, VehicleState } from '@/core/contracts';
import { FLIPPED_EVENT } from './api';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Agent extincteur nécessaire pour éteindre un véhicule entièrement embrasé. */
export const DOUSE_FULL = 65;
/** Distance (entre emprises) à laquelle un véhicule en feu en embrase un autre (m). */
const SPREAD_RANGE = 2;
const SMOKE_COLOR = 0x141414;
const BURNT_COLOR = 0x1a1a1a;

export class DamageSystem {
  private readonly people: Person[] = [];
  private readonly props: Prop[] = [];
  private readonly near: Vehicle[] = [];

  constructor(private readonly k: VehicleKernel) {}

  private setState(v: Vehicle, state: VehicleState): void {
    if (v.state === state) return;
    v.state = state;
    this.k.ctx.events.emit('vehicle:state', { id: v.id, state });
  }

  /** État correspondant à la santé, hors incendie. */
  private stateForHealth(v: Vehicle): VehicleState {
    return v.health <= 0 ? 'wrecked' : v.health < 50 ? 'damaged' : 'ok';
  }

  /** VehicleApi.damage : point d'entrée unique des dégâts faits à un véhicule. */
  damage(v: Vehicle, d: DamageInfo): void {
    if (!(d.amount > 0) || v.state === 'burnt') return;
    const rt = this.k.rt(v);
    this.apply(rt, d.amount, d.kind, d.sourceId);
  }

  /**
   * Applique des dégâts. `raw` : montant déjà pondéré par la robustesse du véhicule (chocs calculés par
   * le sous-système des collisions) ; sinon le blindage et la nature des dégâts s'appliquent ici.
   */
  apply(rt: VehicleRt, amount: number, kind: DamageKind, sourceId: EntityId, raw = false): void {
    const v = rt.v;
    if (!(amount > 0) || v.state === 'burnt') return;
    const spec = rt.spec;
    if (kind === 'gas' || kind === 'water') return;
    if (kind === 'burn') {
      // la brûlure prépare ou attise l'incendie plus qu'elle n'entame la structure
      if (v.state === 'burning') {
        v.burning = Math.min(1, v.burning + amount / (spec.fire.ignition * 6));
      } else {
        rt.heat += amount / spec.fire.ignition;
        if (sourceId !== 0) rt.fireSource = sourceId;
        if (rt.heat >= 1) this.ignite(rt, rt.fireSource, 0.06);
      }
      amount *= 0.25;
    }
    let scale = 1;
    if (!raw) {
      scale = spec.toughness;
      if (kind === 'blast') scale = Math.min(1, spec.toughness * 2.5);
      else if (kind === 'bullet' && v.def.armored) scale = 0;
    }
    const dealt = amount * scale;
    if (!(dealt > 0)) return;
    v.health -= dealt;
    if (v.health < 0) v.health = 0;
    this.k.wake(rt);
    if (v.state === 'ok' || v.state === 'damaged') {
      const next = this.stateForHealth(v);
      if (next !== v.state) {
        this.setState(v, next);
        if (next === 'wrecked') this.onWrecked(rt);
      }
    }
  }

  /** Le véhicule devient une épave : moteur coupé, sirène éteinte, occupants dehors. */
  private onWrecked(rt: VehicleRt): void {
    const v = rt.v;
    v.engineOn = false;
    if (rt.occupants > 0 && rt.evacT < 0) rt.evacT = 0.8;
    if (rt.flight && rt.flight.mode !== 'pose') rt.flight.mode = 'chute';
  }

  // ───────────────────────────── incendie ─────────────────────────────

  /** Met le feu au véhicule. false s'il ne peut plus brûler. */
  ignite(rt: VehicleRt, sourceId: EntityId, intensity = 0.06): boolean {
    const v = rt.v;
    if (v.state === 'burnt') return false;
    if (v.state === 'burning') {
      if (intensity > v.burning) v.burning = Math.min(1, intensity);
      return true;
    }
    const f = rt.spec.fire;
    const rng = this.k.rng;
    rt.spreadTime = rng.range(f.spreadMin, f.spreadMax);
    rt.burnTime = rng.range(f.burnMin, f.burnMax);
    rt.burnElapsed = 0;
    rt.maxBurning = 0;
    rt.fireSource = sourceId;
    rt.heat = 1;
    rt.exploded = false;
    // le réservoir explosera-t-il, et à quel stade de l'incendie ?
    rt.explodeAt = rng.chance(Math.min(1, f.explosion * this.k.tuning.explosionChance)) ? rng.range(0.55, 0.9) : 2;
    rt.popsLeft = rt.spec.handling.twoWheels ? 2 : rt.spec.flight ? 0 : 4;
    rt.nextPop = rng.range(0.25, 0.5);
    rt.fireTick = 0;
    v.burning = Math.max(0.02, Math.min(1, intensity));
    v.engineOn = false;
    this.k.wake(rt);
    this.setState(v, 'burning');
    this.k.ctx.events.emit('fire:started', { x: v.x, z: v.z, targetKind: 'vehicle', targetId: v.id, sourceId });
    if (rt.occupants > 0 && rt.evacT < 0) rt.evacT = 0.6;
    return true;
  }

  /** Dépose de l'agent extincteur sur le véhicule (1 = une seconde d'extincteur portatif). */
  extinguish(rt: VehicleRt, amount: number, byId: EntityId): void {
    const v = rt.v;
    if (!(amount > 0)) return;
    if (v.state !== 'burning') {
      // un véhicule mouillé s'échauffe moins vite
      rt.heat = Math.max(0, rt.heat - amount * 0.1);
      return;
    }
    v.burning -= amount / DOUSE_FULL;
    if (v.burning <= 0) this.endFire(rt, byId);
  }

  private endFire(rt: VehicleRt, byId: EntityId): void {
    const v = rt.v;
    v.burning = 0;
    rt.heat = 0;
    const charred = rt.maxBurning >= 0.75;
    if (charred) {
      v.health = 0;
      v.color = BURNT_COLOR;
      v.siren = 0;
      v.beacons = false;
      v.headlights = false;
      this.setState(v, 'burnt');
    } else {
      this.setState(v, this.stateForHealth(v));
    }
    this.k.ctx.events.emit('fire:out', { x: v.x, z: v.z, targetKind: 'vehicle', targetId: v.id, byId });
  }

  /** Explosion du réservoir : souffle, éclats, embrasement total. */
  explode(rt: VehicleRt, sourceId: EntityId): void {
    const v = rt.v;
    if (rt.exploded || v.state === 'burnt') return;
    rt.exploded = true;
    const ctx = this.k.ctx;
    const R = rt.spec.fire.blastRadius > 0 ? rt.spec.fire.blastRadius : 5;
    if (v.state !== 'burning') this.ignite(rt, sourceId, 1);
    rt.explodeAt = 2;
    v.burning = 1;
    v.health = 0;
    rt.maxBurning = 1;
    const y = v.y + v.def.height * 0.4;
    ctx.events.emit('explosion', { kind: 'vehicule', x: v.x, y, z: v.z, radius: R, sourceId });
    ctx.events.emit('fx', { id: 'explosion', x: v.x, y, z: v.z, size: R });
    ctx.events.emit('sfx', { id: 'explosion_vehicule', x: v.x, y, z: v.z, volume: 1 });
    ctx.hazards.ignite(v.x, v.z, rt.halfL + 1.5, 1, sourceId);
    ctx.hazards.emitSmoke(v.x, v.z, 3, R, SMOKE_COLOR);

    // personnes : souffle décroissant avec la distance
    const reach = R + 2;
    const n = ctx.people.queryRadius(v.x, v.z, reach + rt.radius, this.people);
    for (let i = 0; i < n; i++) {
      const p = this.people[i]!;
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const d = Math.max(0, Math.sqrt(dx * dx + dz * dz) - rt.halfW);
      if (d >= reach) continue;
      const f = 1 - d / reach;
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      const info: DamageInfo = {
        amount: 8 + 70 * f * f, kind: 'blast', sourceId, x: v.x, z: v.z, dirX: dx / l, dirZ: dz / l, zone: 0.6,
        stun: 1 + 3 * f, knockback: 2 + 6 * f,
      };
      ctx.health.hurt(p, info);
    }
    // véhicules voisins
    const nv = this.k.store.queryRadius(v.x, v.z, reach, this.near);
    for (let i = 0; i < nv; i++) {
      const o = this.near[i]!;
      if (o === v) continue;
      const ort = this.k.rt(o);
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const d = Math.max(0, Math.sqrt(dx * dx + dz * dz) - ort.radius);
      const f = 1 - Math.min(1, d / reach);
      this.apply(ort, 45 * f, 'blast', sourceId);
      this.apply(ort, 20 * f, 'burn', sourceId);
    }
    // mobilier
    const np = ctx.props.queryRadius(v.x, v.z, reach, this.props);
    for (let i = 0; i < np; i++) {
      const prop = this.props[i]!;
      const dx = prop.x - v.x;
      const dz = prop.z - v.z;
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      const f = 1 - Math.min(1, l / reach);
      ctx.props.damage(prop, 120 * f, 'blast', sourceId);
      if (prop.movable) ctx.props.push(prop, dx / l, dz / l, 6 * f, sourceId);
    }
    if (rt.occupants > 0) this.hurtInside(rt, 60, 'blast', sourceId);
    if (rt.flight && rt.flight.mode !== 'pose') rt.flight.mode = 'chute';
  }

  private hurtInside(rt: VehicleRt, amount: number, kind: DamageKind, sourceId: EntityId): void {
    const ctx = this.k.ctx;
    const seats = rt.v.seats;
    for (let i = 0; i < seats.length; i++) {
      if (seats[i] === 0) continue;
      const p = ctx.people.get(seats[i]!);
      if (p) ctx.health.hurt(p, { amount, kind, sourceId, x: rt.v.x, z: rt.v.z, zone: 0.6 });
    }
  }

  /** Échauffement par un feu extérieur ; à appeler à basse cadence (dt = temps écoulé depuis le dernier appel). */
  heatFromSurroundings(rt: VehicleRt, dt: number): void {
    const v = rt.v;
    if (v.state === 'burning' || v.state === 'burnt') return;
    const hz = this.k.ctx.hazards;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const half = rt.halfL * 0.6;
    let fireHere = hz.fireAt(v.x, v.z);
    const front = hz.fireAt(v.x + sn * half, v.z + cs * half);
    const rear = hz.fireAt(v.x - sn * half, v.z - cs * half);
    if (front > fireHere) fireHere = front;
    if (rear > fireHere) fireHere = rear;
    if (fireHere > 0.05) {
      rt.heat += (fireHere * dt * this.k.tuning.fireTimeScale) / rt.spec.fire.igniteTime;
      if (rt.heat >= 1) this.ignite(rt, rt.fireSource, 0.05);
    } else if (rt.heat > 0) {
      rt.heat = Math.max(0, rt.heat - dt / 40);
    }
  }

  /** Avance l'incendie d'un véhicule en feu. */
  burn(rt: VehicleRt, dt: number): void {
    const v = rt.v;
    const ctx = this.k.ctx;
    const scale = this.k.tuning.fireTimeScale;
    const sdt = dt * scale;
    // embrasement progressif, puis feu établi jusqu'à épuisement du combustible
    if (rt.burnElapsed < rt.burnTime) {
      if (v.burning < 1) v.burning = Math.min(1, v.burning + sdt / rt.spreadTime);
      else rt.burnElapsed += sdt;
    } else {
      v.burning -= sdt / 60;
      if (v.burning <= 0) {
        rt.maxBurning = 1;
        this.endFire(rt, 0);
        return;
      }
    }
    if (v.burning > rt.maxBurning) rt.maxBurning = v.burning;
    // la structure y passe : épave avant même l'embrasement complet
    const cap = 100 * (1 - rt.maxBurning / 0.7);
    if (v.health > cap) v.health = cap > 0 ? cap : 0;

    // réservoir
    if (!rt.exploded && v.burning >= rt.explodeAt) {
      this.explode(rt, rt.fireSource);
      return;
    }
    // pneus qui éclatent
    if (rt.popsLeft > 0 && v.burning >= rt.nextPop) {
      rt.popsLeft--;
      rt.nextPop = v.burning + this.k.rng.range(0.05, 0.2);
      ctx.events.emit('sfx', { id: 'petard', x: v.x, y: v.y + 0.3, z: v.z, volume: 0.9 });
      ctx.events.emit('fx', { id: 'etincelles', x: v.x, y: v.y + 0.4, z: v.z, size: 1.2 });
    }

    // fumée, chaleur au sol, propagation, occupants : deux fois par seconde
    rt.fireTick -= dt;
    if (rt.fireTick > 0) return;
    const period = 0.5;
    rt.fireTick += period;
    if (rt.fireTick < 0) rt.fireTick = 0;
    ctx.hazards.emitSmoke(v.x, v.z, v.burning * 1.2 * period, 1.5 + rt.halfL * 0.6, SMOKE_COLOR);
    ctx.hazards.ignite(v.x, v.z, rt.halfW + 0.3 + v.burning * (rt.halfL * 0.5), v.burning, rt.fireSource);
    if (rt.occupants > 0) this.hurtInside(rt, 14 * v.burning * period, 'burn', rt.fireSource);
    if (v.burning > 0.4) {
      const reach = rt.radius + SPREAD_RANGE;
      const n = this.k.store.queryRadius(v.x, v.z, reach, this.near);
      for (let i = 0; i < n; i++) {
        const o = this.near[i]!;
        if (o === v || o.state === 'burning' || o.state === 'burnt' || o.def.flying) continue;
        const ort = this.k.rt(o);
        // distance approchée entre emprises : centres moins les demi-largeurs
        const dx = o.x - v.x;
        const dz = o.z - v.z;
        const gap = Math.sqrt(dx * dx + dz * dz) - rt.halfW - ort.halfW;
        if (gap > rt.halfL + ort.halfL + SPREAD_RANGE) continue;
        ort.heat += (v.burning * period * scale) / (ort.spec.fire.igniteTime * 2.5);
        if (ort.heat >= 1) this.ignite(ort, rt.fireSource, 0.05);
      }
    }
  }

  // ───────────────────────────── retournement ─────────────────────────────

  /** Un participant pousse pendant ce pas (appelé par le gestionnaire d'interaction 'renverser'). */
  pushFlip(rt: VehicleRt, by: Person): void {
    const tick = this.k.ctx.clock.tick;
    if (rt.flipTick !== tick) {
      rt.flipTick = tick;
      rt.flipPushers = 0;
    }
    rt.flipPushers++;
    rt.flipBy = by.id;
    this.k.wake(rt);
  }

  /** Le véhicule peut-il être retourné par un groupe ? */
  canFlip(rt: VehicleRt): boolean {
    const v = rt.v;
    return rt.spec.flippable && !rt.flipped && v.state !== 'burning' && v.state !== 'burnt' && rt.occupants === 0 &&
      v.vx * v.vx + v.vz * v.vz < 0.25;
  }

  /** Avance le retournement : effort du pas précédent, bascule, animation du roulis. */
  updateFlip(rt: VehicleRt, dt: number): void {
    const v = rt.v;
    if (rt.flipped) {
      // la caisse finit de basculer sur le flanc
      if (rt.flipRoll !== 0 && v.roll !== rt.flipRoll) {
        const step = dt * 2.2;
        v.roll = Math.abs(rt.flipRoll - v.roll) <= step ? rt.flipRoll : v.roll + Math.sign(rt.flipRoll - v.roll) * step;
      }
      return;
    }
    if (rt.flipProgress <= 0 && rt.flipTick < 0) return;
    const tick = this.k.ctx.clock.tick;
    const t = this.k.tuning;
    const pushers = rt.flipTick >= tick - 1 ? rt.flipPushers : 0;
    const needed = Math.max(1, Math.ceil(t.flipPeople * 0.5 * Math.min(1.5, v.def.mass / 1300)));
    if (pushers >= needed && this.canFlip(rt)) {
      rt.flipProgress += (pushers * dt) / (t.flipPeople * t.flipSeconds * Math.max(0.7, v.def.mass / 1300));
      // la caisse se soulève à mesure
      v.roll = rt.groundRoll + rt.flipProgress * 0.5;
      if (rt.flipProgress >= 1) this.flip(rt, rt.flipBy);
    } else if (rt.flipProgress > 0) {
      // le groupe a lâché : la voiture retombe sur ses roues
      rt.flipProgress = Math.max(0, rt.flipProgress - dt * 0.5);
      v.roll = rt.groundRoll + rt.flipProgress * 0.5;
      if (rt.flipProgress === 0) rt.flipTick = -1;
    }
  }

  /** Couche le véhicule sur le flanc : épave immobile, toujours un obstacle. */
  flip(rt: VehicleRt, byId: EntityId): boolean {
    const v = rt.v;
    if (rt.flipped || v.state === 'burnt') return false;
    rt.flipped = true;
    rt.flipProgress = 1;
    rt.flipRoll = Math.PI * 0.5 + 0.12;
    v.engineOn = false;
    v.vx = 0;
    v.vz = 0;
    v.yawRate = 0;
    v.speed = 0;
    v.siren = 0;
    if (v.health > 20) v.health = 20;
    this.k.wake(rt);
    if (v.state !== 'burning') {
      this.setState(v, 'wrecked');
      this.onWrecked(rt);
    }
    const ctx = this.k.ctx;
    ctx.events.emit('sfx', { id: 'tole', x: v.x, y: v.y + 0.5, z: v.z, volume: 1 });
    ctx.events.emitAny(FLIPPED_EVENT, { id: v.id, x: v.x, z: v.z, byId });
    return true;
  }
}
