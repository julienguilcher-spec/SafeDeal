/* =====================================================================================
 * PROJECTILES — service ctx.projectiles (ProjectileApi) et vol de chaque projectile.
 *
 * Les données vivent dans le magasin du cœur (getCore(ctx).stores.projectiles) ; ce fichier y ajoute
 * l'état propre à chaque projectile (Projectile.data), l'intégration balistique, les rebonds, le
 * roulement et l'enchaînement des collisions. Les effets (éclatement, détonation, feu, dégâts) sont
 * dans projectile-effects.ts.
 *
 * Un pas de vol : intégration (gravité, traînée, vent), puis recherche du PREMIER obstacle rencontré
 * sur le segment parcouru — décor (ctx.world.raycast + hauteur du bâti), objets (ctx.props.raycast),
 * véhicules (ctx.vehicles.raycast), vitrines, personnes, sol ou toit. Le reste du pas est abandonné
 * après un choc (au plus 5 cm d'écart à 1/30 s pour un objet lancé à la main).
 * ===================================================================================== */

import type { EntityId, GameContext, Person, Projectile, ProjectileApi, ProjectileKind } from '@/core/contracts';
import { getCore } from '@/core/context';
import type { ProjectileSpec } from './api';
import { GRAVITY, SOLVER_DT, bounceWall, makeFlatSim, resetFlatSim, simulateFlat, stepFlight, stepRoll } from './ballistics';
import {
  HIT_GROUND, HIT_NONE, HIT_PERSON, HIT_PROP, HIT_SHOP, HIT_VEHICLE, HIT_WALL, ProjectileCaster,
} from './projectile-collide';
import {
  AIRBURST_LEAD, FIREWORK_COLORS, GM2L_LANDING_DELAY, MAX_FLIGHT_SECONDS, MAX_PROJECTILES, PALET_EMIT_SECONDS,
  SMOKE_COLOR_CORTEGE, SMOKE_SECONDS, projectileSpec,
} from './projectile-defs';
import type { ProjectileEffects } from './projectile-effects';
import type { ItemsCore } from './shared';

/** État propre à un projectile (rangé dans Projectile.data ; recyclé d'un projectile à l'autre). */
export class ProjState {
  spec: ProjectileSpec = projectileSpec('debris');
  /** Altitude du sol (ou du toit) sous le projectile au pas précédent. */
  floorY = 0;
  /** Au sol, en train de rouler ou de glisser. */
  rolling = false;
  /** Source épuisée (palet ou fumigène éteint) : reste un instant puis disparaît. */
  spent = false;
  /** Accumulateur des dépôts de gaz ou de fumée. */
  emitAcc = 0;
  /** Couleur (fumée, étoile, peinture). */
  color = 0;
  /** Point de départ, pour la distance de tir. */
  originX = 0;
  originZ = 0;
  /** Nombre de chocs subis. */
  impacts = 0;
  /** Durée passée immobile (s). */
  restAge = 0;
  /** Âge avant lequel le tireur, puis les personnes de sa faction, sont ignorés (tir par-dessus l'épaule). */
  ownerGrace = 0.5;
  factionGrace = 0;
  ownerFaction = '';
  /** Dernière personne touchée : elle n'est pas retouchée par le même projectile. */
  ignoreId = 0;
}

const SPIN_MAX = 60;

export class ProjectileSystem implements ProjectileApi {
  readonly list: readonly Projectile[];
  effects!: ProjectileEffects;

  private readonly ctx: GameContext;
  private readonly base: ProjectileApi;
  private readonly pool: ProjState[] = [];
  private readonly caster: ProjectileCaster;
  private readonly sim = makeFlatSim();
  private windX = 0;
  private windZ = 0;
  /** Mode strict du moteur (tests) : les erreurs sont propagées au lieu d'être isolées. */
  private readonly strict: boolean;

  constructor(private readonly core: ItemsCore) {
    this.ctx = core.ctx;
    const engine = getCore(core.ctx);
    this.base = engine.stores.projectiles;
    this.strict = (engine as { strict?: boolean }).strict === true;
    this.list = this.base.list;
    this.caster = new ProjectileCaster(core);
  }

  // ───────────────────────────── ProjectileApi ─────────────────────────────

  get(id: EntityId): Projectile | undefined {
    return this.base.get(id);
  }

  spawn(
    kind: ProjectileKind, ownerId: EntityId,
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
  ): Projectile {
    if (this.base.list.length >= MAX_PROJECTILES) this.evict();
    const p = this.base.spawn(kind, ownerId, x, y, z, vx, vy, vz);
    this.adopt(p);
    return p;
  }

  /**
   * Fait de la place : retire le plus ancien projectile immobile et éteint ; à défaut le plus ancien
   * qui fume encore au sol ; à défaut le plus ancien en vol (borne ferme).
   */
  private evict(): void {
    const list = this.base.list;
    let best: Projectile | null = null;
    let bestScore = -1;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const score = p.age + (p.resting ? (p.emitting ? 1e6 : 2e6) : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) this.remove(best.id);
  }

  remove(id: EntityId): void {
    const p = this.base.get(id);
    if (!p) return;
    const st = p.data;
    // le magasin du cœur émet projectile:removed ; l'état reste lisible le temps de l'événement
    this.base.remove(id);
    if (st instanceof ProjState && p.data === st) {
      p.data = null;
      this.pool.push(st);
    }
  }

  nearestPickable(x: number, z: number, r: number): Projectile | null {
    return this.base.nearestPickable(x, z, r);
  }

  clear(): void {
    const list = this.base.list;
    const pool = this.pool;
    const before = pool.length;
    for (let i = 0; i < list.length; i++) {
      const st = list[i]!.data;
      if (st instanceof ProjState) pool.push(st);
    }
    try {
      this.base.clear();
    } catch (err) {
      pool.length = before; // vidage interrompu : ces états servent peut-être encore
      throw err;
    }
  }

  // ───────────────────────────── état ─────────────────────────────

  /** État du projectile (créé à la volée pour un projectile apparu hors de ce service). */
  stateOf(p: Projectile): ProjState {
    const d = p.data;
    return d instanceof ProjState ? d : this.adopt(p);
  }

  /** Prépare l'état d'un projectile : gabarit, retard, émission, tolérances de départ. */
  private adopt(p: Projectile): ProjState {
    const st = this.pool.pop() ?? new ProjState();
    const spec = projectileSpec(p.kind);
    const world = this.ctx.world;
    st.spec = spec;
    st.floorY = world.heightAt(p.x, p.z);
    st.rolling = false;
    st.spent = false;
    st.emitAcc = 0;
    st.color = 0;
    st.originX = p.x;
    st.originZ = p.z;
    st.impacts = 0;
    st.restAge = 0;
    st.ignoreId = 0;
    const owner = p.ownerId !== 0 ? this.ctx.people.get(p.ownerId) : undefined;
    st.ownerFaction = owner ? owner.faction : '';
    st.ownerGrace = 0.5;
    st.factionGrace = spec.cls === 'lbd' || spec.cls === 'bullet' || spec.cls === 'firework' ? 0.04 : 0.15;
    p.data = st;
    p.fuse = spec.fuse;
    p.emitting = false;
    p.pickable = false;
    switch (p.kind) {
      case 'palet_lacrymo':
        p.emitting = true;
        p.fuse = PALET_EMIT_SECONDS;
        st.ownerGrace = 0;
        st.factionGrace = 0;
        break;
      case 'plot_caoutchouc':
        st.ownerGrace = 0;
        st.factionGrace = 0;
        break;
      case 'fumigene':
        p.emitting = true;
        p.fuse = SMOKE_SECONDS;
        st.color = SMOKE_COLOR_CORTEGE;
        break;
      case 'mortier':
        st.color = this.core.rng.pick(FIREWORK_COLORS);
        break;
      case 'grenade_lacrymo_56': {
        // s'ouvre en l'air juste avant le point de chute prévu
        const t = this.predictLanding(p, spec, st.floorY);
        if (t > 0) p.fuse = Math.max(0.4, t - AIRBURST_LEAD);
        break;
      }
      case 'gm2l':
        // lancée par un autre module : une vitesse élevée trahit un tir au lanceur (ctx.actions règle
        // lui-même le retard, voir armGm2l)
        if (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz > 25 * 25) {
          const t = this.predictLanding(p, spec, st.floorY);
          if (t > 0) p.fuse = t + GM2L_LANDING_DELAY;
        }
        break;
      default:
        break;
    }
    return st;
  }

  /** Durée de vol prévue jusqu'au sol (plat, à l'altitude `floorY`) ; −1 si aucun contact en 60 s. */
  private predictLanding(p: Projectile, spec: ProjectileSpec, floorY: number): number {
    const env = this.ctx.env.state;
    resetFlatSim(this.sim, p.x, p.y, p.z, p.vx, p.vy, p.vz);
    simulateFlat(this.sim, spec, floorY, env.windX, env.windZ, SOLVER_DT, 60, true);
    return this.sim.impactT;
  }

  /**
   * Règle le retard d'une grenade assourdissante-lacrymogène selon son mode de lancement : tirée au
   * lanceur, elle détone juste après son point de chute prévu ; lancée à la main, après son retard propre.
   */
  armGm2l(p: Projectile, launched: boolean): void {
    const st = this.stateOf(p);
    p.fuse = st.spec.fuse;
    if (!launched) return;
    const t = this.predictLanding(p, st.spec, st.floorY);
    if (t > 0) p.fuse = t + GM2L_LANDING_DELAY;
  }

  /**
   * Relance un projectile (renvoi d'un palet, coup de raquette) : il repart en vol avec la vitesse
   * donnée, change de propriétaire et n'est plus ramassable tant qu'il vole.
   */
  relaunch(p: Projectile, by: Person, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const st = this.stateOf(p);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.resting = false;
    p.pickable = false;
    p.ownerId = by.id;
    st.rolling = false;
    st.restAge = 0;
    st.ignoreId = 0;
    st.floorY = this.ctx.world.heightAt(x, z);
    st.originX = x;
    st.originZ = z;
    st.ownerFaction = by.faction;
    st.ownerGrace = p.age + 0.5;
    st.factionGrace = p.age + 0.15;
  }

  // ───────────────────────────── simulation ─────────────────────────────

  update(dt: number): void {
    const list = this.base.list;
    if (list.length === 0) return;
    const env = this.ctx.env.state;
    this.windX = env.windX;
    this.windZ = env.windZ;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (!p) continue; // un effet a retiré plusieurs projectiles pendant ce pas
      try {
        this.step(p, dt);
      } catch (err) {
        // un service extérieur a levé une erreur : le projectile fautif est retiré, les autres continuent
        console.error(`[items] projectile « ${p.kind} » abandonné après une erreur`, err);
        this.remove(p.id);
        if (this.strict) throw err; // en mode strict (tests), l'erreur doit rester visible
      }
    }
  }

  /** Fait avancer un projectile d'un pas : mouvement, émission, retard, durée de vie. */
  private step(p: Projectile, dt: number): void {
    const effects = this.effects;
    const st = this.stateOf(p);
    p.age += dt;
    if (!p.resting && !(st.rolling ? this.roll(p, st, dt) : this.fly(p, st, dt))) return;
    if (p.emitting) effects.emit(p, st, dt);
    p.fuse -= dt;
    if (p.fuse <= 0 && !effects.onFuse(p, st)) return;
    if (p.resting) {
      if (p.fuse === Infinity) {
        st.restAge += dt;
        if (st.restAge >= st.spec.lifetime) this.remove(p.id);
      }
    } else if (p.age > MAX_FLIGHT_SECONDS && !st.rolling) {
      this.remove(p.id);
    }
  }

  /** Un pas de vol. Retourne false si le projectile a disparu. */
  private fly(p: Projectile, st: ProjState, dt: number): boolean {
    const spec = st.spec;
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    stepFlight(p, spec.drag, this.windX, this.windZ, dt);
    p.spin += spec.spinRate * dt;

    const world = this.ctx.world;
    const ground = world.heightAt(p.x, p.z);
    let floor = ground;
    if (p.y - ground < 60) {
      const roof = world.buildingHeightAt(p.x, p.z);
      if (roof > 0) floor += roof;
    }
    const caster = this.caster;
    const kind = caster.cast(p, st, px, py, pz, ground, floor);
    if (kind === HIT_NONE) {
      st.floorY = floor;
      if (p.y < floor - 50) {
        this.remove(p.id);
        return false;
      }
      return true;
    }
    const effects = this.effects;
    // place le projectile au point de contact
    const t = caster.t;
    if (kind !== HIT_GROUND) {
      p.x = px + (p.x - px) * t + caster.nx * 0.03;
      p.z = pz + (p.z - pz) * t + caster.nz * 0.03;
      p.y = py + (p.y - py) * t;
    }
    switch (kind) {
      case HIT_GROUND: return effects.hitGround(p, st, px, py, pz, caster.floor);
      case HIT_WALL: return effects.hitWall(p, st, caster.nx, caster.nz, caster.wallKind, 0);
      case HIT_PROP: return effects.hitProp(p, st, caster.prop!, caster.nx, caster.nz);
      case HIT_VEHICLE: return effects.hitVehicle(p, st, caster.vehicle!, caster.nx, caster.nz);
      case HIT_SHOP: return effects.hitShop(p, st, caster.shop!, caster.nx, caster.nz);
      case HIT_PERSON: return effects.hitPerson(p, st, caster.person!, caster.zone);
      default: return true;
    }
  }

  /** Un pas de roulement au sol. Retourne false si le projectile a disparu. */
  private roll(p: Projectile, st: ProjState, dt: number): boolean {
    const spec = st.spec;
    const px = p.x;
    const pz = p.z;
    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    const stopped = stepRoll(p, spec.roll * GRAVITY, dt);
    let spin = (speed / (spec.radius > 0.01 ? spec.radius : 0.01)) * dt;
    if (spin > SPIN_MAX * dt) spin = SPIN_MAX * dt;
    p.spin += spin;

    const ctx = this.ctx;
    const hit = this.core.hit;
    if (p.x !== px || p.z !== pz) {
      // parois : décor, objets, véhicules
      let blocked = false;
      if (ctx.world.raycast(px, pz, p.x, p.z, hit) && hit.height > 0.05) blocked = true;
      else if (ctx.props.list.length > 0 && ctx.props.raycast(px, pz, p.x, p.z, hit, 'move')) blocked = true;
      else if (ctx.vehicles.list.length > 0 && ctx.vehicles.raycast(px, pz, p.x, p.z, hit, 'move')) blocked = true;
      if (blocked) {
        p.x = hit.x + hit.nx * 0.03;
        p.z = hit.z + hit.nz * 0.03;
        bounceWall(p, hit.nx, hit.nz, spec.restitution, spec.friction);
      }
    }
    const world = ctx.world;
    const ground = world.heightAt(p.x, p.z);
    let floor = ground;
    const roof = world.buildingHeightAt(p.x, p.z);
    if (roof > 0) {
      if (st.floorY - ground > roof - 0.5) {
        floor += roof; // roule sur un toit
      } else {
        // pied de façade sans segment de collision : demi-tour
        p.x = px;
        p.z = pz;
        p.vx = -p.vx * spec.restitution;
        p.vz = -p.vz * spec.restitution;
      }
    }
    if (p.y - spec.radius - floor > 0.08) {
      // plus rien dessous (bord de toit, quai) : il retombe
      st.rolling = false;
      p.pickable = false;
      st.floorY = floor;
      return true;
    }
    p.y = floor + spec.radius;
    st.floorY = floor;
    if (stopped) {
      p.vx = 0;
      p.vz = 0;
      p.vy = 0;
      p.resting = true;
      st.restAge = 0;
      if (world.surfaceAt(p.x, p.z) === 'water') return this.effects.sink(p);
    }
    return true;
  }
}
