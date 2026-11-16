/* =====================================================================================
 * Système des véhicules : publie ctx.vehicles (VehicleApi complet, appuyé sur le magasin du cœur),
 * les services 'vehicles.autopilot' et 'vehicles.ext', et fait vivre conduite, collisions, dégâts,
 * sièges, tourelles, vol et feux à chaque pas (ordre SystemOrder.VEHICLES).
 * ===================================================================================== */

import type {
  DamageInfo, EntityId, Faction, GameContext, GameSystem, Person, RayHit, SeatRole, Vec2, Vec3, Vehicle, VehicleApi,
  VehicleDef, VehicleKind,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { getCore } from '@/core/context';
import { genericVehicleDef } from '@/core/stores';
import {
  AUTOPILOT_SERVICE, DOUSE_EVENT, DRONE_TOGGLE_EVENT, FLIPPED_EVENT, VEHICLES_EXT_SERVICE, VEHICLES_SYSTEM_ID,
} from './api';
import type { FlightStatus, JetMode, TurretStatus, VehicleDynamics, VehicleSpec, VehiclesExtApi } from './api';
import { Autopilot } from './autopilot';
import { Collisions } from './collide';
import { DamageSystem } from './damage';
import { createVehicleDefs } from './defs';
import { FlightSystem } from './flight';
import { WaterJet } from './jet';
import { LightSystem } from './lights';
import { GroundPhysics } from './physics';
import { countOccupants, OCCUPANT_MASS, VehicleKernel } from './runtime';
import type { VehicleRt } from './runtime';
import { SeatSystem } from './seats';
import { specFor } from './specs';
import { TurretSystem } from './turrets';

const NO_TURRET: Readonly<TurretStatus> = Object.freeze({
  kind: 'camera', ammo: 0, capacity: 0, reserve: 0, service: -1, firing: false, salvo: 1, queued: 0, mode: 'droit',
  hasTarget: false, inRange: false, targetX: 0, targetZ: 0, mast: 0,
});

export class VehiclesSystem implements GameSystem {
  readonly id = VEHICLES_SYSTEM_ID;
  readonly order = SystemOrder.VEHICLES;

  readonly kernel = new VehicleKernel();
  readonly collisions = new Collisions(this.kernel);
  readonly physics = new GroundPhysics(this.kernel, this.collisions);
  readonly damage = new DamageSystem(this.kernel);
  readonly seats = new SeatSystem(this.kernel, this.damage);
  readonly jet = new WaterJet(this.kernel, this.damage);
  readonly turrets = new TurretSystem(this.kernel, this.jet);
  readonly flight = new FlightSystem(this.kernel);
  readonly autopilot = new Autopilot(this.kernel);
  readonly lights = new LightSystem(this.kernel);
  private readonly unsub: (() => void)[] = [];
  private genericSpec: VehicleSpec | null = null;
  private sweepT = 0;

  readonly api: VehicleApi = this.createApi();
  readonly ext: VehiclesExtApi = this.createExt();

  provide(ctx: GameContext): void {
    const k = this.kernel;
    const core = getCore(ctx);
    k.ctx = ctx;
    k.store = core.stores.vehicles;
    k.store.registerDefs(createVehicleDefs());
    k.rng = ctx.rng.fork('vehicules');
    k.hurtVehicle = (v, amount, kind, sourceId): void => this.damage.apply(k.rt(v), amount, kind, sourceId, true);
    k.exitPerson = (p): boolean => this.seats.exit(p);
    ctx.vehicles = this.api;
    ctx.provide(AUTOPILOT_SERVICE, this.autopilot);
    ctx.provide(VEHICLES_EXT_SERVICE, this.ext);

    const ev = ctx.events;
    this.unsub.push(
      ev.on('vehicle:spawned', (e) => {
        const v = k.store.get(e.id);
        if (!v) return;
        const rt = k.rt(v);
        rt.heatTick = (v.id % 10) * 0.1;
        this.flight.onSpawned(rt);
      }),
      ev.on('vehicle:removed', (e) => {
        const rt = k.peek(e.id);
        if (!rt) return;
        this.flight.onRemoved(rt);
        k.drop(e.id);
      }),
      // un autre module (contrôleur du joueur) a déjà signalé ce changement de sirène : pas de doublon
      ev.on('vehicle:siren', (e) => {
        const rt = k.peek(e.id);
        if (rt) rt.lastSiren = e.siren;
      }),
      ev.on('vehicle:entered', (e) => this.recount(e.vehicleId)),
      ev.on('vehicle:exited', (e) => this.recount(e.vehicleId)),
      ev.onAny(DRONE_TOGGLE_EVENT, (payload) => {
        const id = (payload as { personId?: unknown } | null)?.personId;
        if (typeof id === 'number') this.flight.toggle(id);
      }),
      ev.onAny(DOUSE_EVENT, (payload) => {
        const d = payload as { x?: unknown; z?: unknown; radius?: unknown; amount?: unknown } | null;
        if (!d || typeof d.x !== 'number' || typeof d.z !== 'number' || typeof d.radius !== 'number' || typeof d.amount !== 'number') return;
        this.jet.douseSeen = true;
        this.jet.douseVehicles(d.x, d.z, d.radius, d.amount, 0);
      }),
      ev.onAny(FLIPPED_EVENT, (payload) => {
        const f = payload as { id: EntityId; x: number; z: number };
        this.seats.onFlipped(f.id, f.x, f.z);
      }),
    );
  }

  init(ctx: GameContext): void {
    const handlers = this.seats.createHandlers();
    for (let i = 0; i < handlers.length; i++) ctx.interactions.register(handlers[i]!);
    this.kernel.neutralHealth = ctx.health === getCore(ctx).neutral.health;
  }

  reset(): void {
    const k = this.kernel;
    k.clear();
    k.rng = k.ctx.rng.fork('vehicules');
    k.neutralHealth = k.ctx.health === getCore(k.ctx).neutral.health;
    this.collisions.reset();
    this.seats.reset();
    this.turrets.reset();
    this.flight.reset();
  }

  dispose(): void {
    for (let i = 0; i < this.unsub.length; i++) this.unsub[i]!();
    this.unsub.length = 0;
  }

  private recount(vehicleId: EntityId): void {
    const rt = this.kernel.peek(vehicleId);
    if (!rt) return;
    rt.occupants = countOccupants(rt.v);
    rt.mass = rt.v.def.mass + rt.occupants * OCCUPANT_MASS;
    rt.awake = true;
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const k = this.kernel;
    const rts = k.rts;
    const env = k.ctx.env.state;

    // une fois par seconde : aucune fiche ne doit survivre à son véhicule (retrait sans événement)
    this.sweepT -= dt;
    if (this.sweepT <= 0) {
      this.sweepT = 1;
      for (let i = rts.length - 1; i >= 0; i--) {
        const rt = rts[i]!;
        if (k.store.get(rt.v.id) !== rt.v) k.drop(rt.v.id);
      }
    }

    // commandes, conduite, vol
    for (let i = 0; i < rts.length; i++) {
      const rt = rts[i]!;
      if (rt.v.dormant) continue;
      this.lights.update(rt, env, dt);
      if (rt.flight) {
        this.flight.step(rt, dt);
        continue;
      }
      if (rt.apActive) this.autopilot.update(rt, dt);
      this.physics.step(rt, dt);
    }

    // collisions, une fois tout le monde déplacé
    for (let i = 0; i < rts.length; i++) {
      const rt = rts[i]!;
      const v = rt.v;
      if (rt.dyn.asleep || rt.flight || v.dormant) continue;
      if (v.vx * v.vx + v.vz * v.vz < 0.01 && v.yawRate * v.yawRate < 0.0025) continue;
      this.collisions.propsOf(rt, dt);
      this.collisions.peopleOf(rt);
    }
    this.collisions.vehicles();

    // équipements, occupants, incendie
    for (let i = 0; i < rts.length; i++) {
      const rt = rts[i]!;
      const v = rt.v;
      if (v.dormant) continue;
      if (rt.turrets.length > 0 && this.turrets.busy(rt)) this.turrets.update(rt, dt);
      if (rt.occupants > 0) this.seats.place(rt);
      this.seats.update(rt, dt);
      if (v.state === 'burning') {
        this.damage.burn(rt, dt);
      } else if (v.state !== 'burnt') {
        rt.heatTick -= dt;
        if (rt.heatTick <= 0) {
          rt.heatTick += 1;
          this.damage.heatFromSurroundings(rt, 1);
        }
      }
      if (rt.flipTick >= 0 || rt.flipProgress > 0) this.damage.updateFlip(rt, dt);
    }

    // retraits différés (drone posé et rappelé)
    if (k.removals.length > 0) {
      for (let i = 0; i < k.removals.length; i++) k.ctx.vehicles.remove(k.removals[i]!);
      k.removals.length = 0;
    }
  }

  // ───────────────────────────── VehicleApi ─────────────────────────────

  private createApi(): VehicleApi {
    const k = this.kernel;
    const self = this;
    return {
      get list(): readonly Vehicle[] {
        return k.store.list;
      },
      get defs(): readonly VehicleDef[] {
        return k.store.defs;
      },
      def: (kind: VehicleKind): VehicleDef | undefined => k.store.def(kind),
      get: (id: EntityId): Vehicle | undefined => k.store.get(id),
      spawn: (kind: VehicleKind, x: number, z: number, heading: number, opts?: { color?: number; faction?: Faction }): Vehicle =>
        k.store.spawn(kind, x, z, heading, opts),
      remove: (id: EntityId): void => k.store.remove(id),
      clear: (): void => {
        k.store.clear();
        k.clear();
      },
      queryRadius: (x: number, z: number, r: number, out: Vehicle[]): number => k.store.queryRadius(x, z, r, out),
      enter: (p: Person, v: Vehicle, seat?: number | SeatRole): boolean => self.seats.enter(p, v, seat),
      exit: (p: Person): boolean => self.seats.exit(p),
      damage: (v: Vehicle, d: DamageInfo): void => self.damage.damage(v, d),
      fireTurret: (v: Vehicle, turret: number, byId: EntityId): boolean => self.turrets.fire(v, turret, byId),
      resolveCircle: (pos: Vec2, radius: number, ignoreId?: EntityId): boolean => k.store.resolveCircle(pos, radius, ignoreId),
      raycast: (ax: number, az: number, bx: number, bz: number, out: RayHit, mode?: 'move' | 'sight'): boolean =>
        k.store.raycast(ax, az, bx, bz, out, mode),
    };
  }

  // ───────────────────────────── service étendu ─────────────────────────────

  private createExt(): VehiclesExtApi {
    const k = this.kernel;
    const self = this;
    return {
      tuning: k.tuning,
      spec(kind: VehicleKind): Readonly<VehicleSpec> {
        const def = k.store.def(kind);
        if (def) return specFor(def);
        if (!self.genericSpec) self.genericSpec = specFor(genericVehicleDef('voiture'));
        return self.genericSpec;
      },
      dynamics: (v: Vehicle): Readonly<VehicleDynamics> => k.rt(v).dyn,

      canBoard: (p: Person, v: Vehicle): boolean => self.seats.canBoard(p, v),
      canDrive: (p: Person, v: Vehicle): boolean => self.seats.canDrive(p, v),
      chooseSeat: (p: Person, v: Vehicle): number => (self.seats.canBoard(p, v) ? self.seats.chooseSeat(p, v) : -1),
      driverOf: (v: Vehicle): Person | null => k.driver(k.rt(v)),
      turretOfSeat: (v: Vehicle, seat: number): number => k.rt(v).spec.seatTurret[seat] ?? -1,
      seatOfTurret: (v: Vehicle, turret: number): number => (turret >= 0 ? k.rt(v).spec.seatTurret.indexOf(turret) : -1),
      doorOpen: (v: Vehicle, seat: number): number => self.seats.doorOpen(k.rt(v), seat),
      setLocked(v: Vehicle, locked: boolean): void {
        v.locked = locked;
      },
      setEngine(v: Vehicle, on: boolean): boolean {
        const rt = k.rt(v);
        if (on && ((v.state !== 'ok' && v.state !== 'damaged') || rt.flipped)) return false;
        v.engineOn = on;
        rt.awake = true;
        return true;
      },

      aimTurret: (v: Vehicle, turret: number, yaw: number, pitch: number): void => self.turrets.aim(v, turret, yaw, pitch),
      aimTurretAt: (v: Vehicle, turret: number, x: number, y: number, z: number): boolean => self.turrets.aimAt(v, turret, x, y, z),
      clearTurretTarget: (v: Vehicle, turret: number): void => self.turrets.clearTarget(v, turret),
      setSalvo: (v: Vehicle, turret: number, count: number): number => self.turrets.setSalvo(v, turret, count),
      setJetMode: (v: Vehicle, turret: number, mode: JetMode): void => self.turrets.setJetMode(v, turret, mode),
      turretStatus: (v: Vehicle, turret: number): Readonly<TurretStatus> => self.turrets.status(k.rt(v), turret) ?? NO_TURRET,
      predictImpact: (v: Vehicle, turret: number, out: Vec3): boolean => self.turrets.predict(k.rt(v), turret, out),
      reloadTurret: (v: Vehicle, turret: number): boolean => self.turrets.reload(k.rt(v), turret),
      refill: (v: Vehicle): boolean => self.turrets.refill(k.rt(v)),
      setMast: (v: Vehicle, raised: boolean): void => self.turrets.setMast(k.rt(v), raised),

      setSiren(v: Vehicle, mode: 0 | 1 | 2): void {
        v.siren = v.def.hasSiren ? mode : 0;
        self.lights.update(k.rt(v), k.ctx.env.state, 0);
      },
      cycleSiren(v: Vehicle): void {
        v.siren = v.def.hasSiren ? (((v.siren + 1) % 3) as 0 | 1 | 2) : 0;
        self.lights.update(k.rt(v), k.ctx.env.state, 0);
      },
      setBeacons(v: Vehicle, on: boolean): void {
        v.beacons = on && v.def.hasBeacons;
        if (!v.beacons) v.siren = 0;
        self.lights.update(k.rt(v), k.ctx.env.state, 0);
      },
      setHeadlights(v: Vehicle, on: boolean | 'auto'): void {
        const rt = k.rt(v);
        rt.headlightsAuto = on === 'auto';
        if (on !== 'auto') v.headlights = on;
        self.lights.update(rt, k.ctx.env.state, 0);
      },
      setIndicator(v: Vehicle, side: -1 | 0 | 1): void {
        v.indicator = side;
        self.lights.update(k.rt(v), k.ctx.env.state, 0);
      },
      horn(v: Vehicle, seconds = 0.5): void {
        k.rt(v).hornT = seconds > 0 ? seconds : 0;
      },

      ignite: (v: Vehicle, sourceId: EntityId, intensity?: number): boolean => self.damage.ignite(k.rt(v), sourceId, intensity),
      extinguish: (v: Vehicle, amount: number, byId: EntityId): void => self.damage.extinguish(k.rt(v), amount, byId),
      explode: (v: Vehicle, sourceId: EntityId): void => self.damage.explode(k.rt(v), sourceId),
      flip: (v: Vehicle, byId: EntityId = 0): boolean => self.damage.flip(k.rt(v), byId),
      isFlipped: (v: Vehicle): boolean => k.rt(v).flipped,
      flipProgress: (v: Vehicle): number => k.rt(v).flipProgress,

      deployDrone: (pilot: Person): Vehicle | null => self.flight.deploy(pilot),
      recallDrone: (pilot: Person): boolean => self.flight.recall(pilot),
      droneOf: (personId: EntityId): Vehicle | null => self.flight.droneOf(personId),
      flightStatus: (v: Vehicle): Readonly<FlightStatus> | null => self.flight.status(k.rt(v)),
      takeOff: (v: Vehicle, altitude?: number): boolean => self.flight.takeOff(k.rt(v), altitude),
      flyTo: (v: Vehicle, x: number, z: number, altitude?: number): boolean => self.flight.flyTo(k.rt(v), x, z, altitude),
      orbit: (v: Vehicle, cx: number, cz: number, radius: number, altitude?: number, speed?: number): boolean =>
        self.flight.orbit(k.rt(v), cx, cz, radius, altitude, speed),
      land: (v: Vehicle): boolean => self.flight.land(k.rt(v)),
    };
  }
}

/** Accès au système depuis ses propres tests (jamais depuis un autre module). */
export function createVehiclesSystem(): VehiclesSystem {
  return new VehiclesSystem();
}

export type { VehicleRt };
