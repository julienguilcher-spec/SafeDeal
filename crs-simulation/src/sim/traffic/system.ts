/* =====================================================================================
 * CIRCULATION — système du module (ordre SystemOrder.CONTROL + 20) : publie le service de fermeture
 * de rues (EXT.traffic) et le service 'traffic', tient à jour la copie du graphe routier, écoute les
 * dangers (détonations, incendies) et fait vivre circulation, stationnement et piétons civils.
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, Person, PersonKind, ProjectileKind, SessionConfig, Vehicle, VehicleKind,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { WorldData } from '@/world/query/api';
import { JAM_EVENT, TRAFFIC_SERVICE, TRAFFIC_SYSTEM_ID } from './api';
import type { ClearOffResult, MotoristStatus, SignalColor, TrafficApi } from './api';
import { blockerAhead, registerClearOff } from './car-clear';
import { Cars } from './cars';
import { Closures } from './closures';
import type { EdgeHit, EdgePoint } from './graph';
import { E_ONEWAY, makeEdgeHit } from './graph';
import { Parking } from './parking';
import { Peds } from './peds';
import { TrafficKernel, makeStats } from './shared';
import { AMBER, Boxes, GREEN, RED, Signals } from './signals';
import { resetTuning } from './tuning';

const WORLD_DATA_SERVICE = 'world.data';
const WORLD_SOURCE_EVENT = 'world:source';
/** Rayon du périmètre fermé par l'option de départ « circulation coupée » (m) : celui de la page d'accueil. */
const START_AREA_RADIUS = 350;

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
function factor(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(4, v)) : fallback;
}

export class TrafficSystem implements GameSystem {
  readonly id = TRAFFIC_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 20;

  readonly kernel = new TrafficKernel();
  readonly signals = new Signals(this.kernel.cache, this.kernel.tuning);
  readonly boxes = new Boxes();
  readonly closures = new Closures(this.kernel.cache, this.kernel.tuning);
  readonly cars = new Cars(this.kernel);
  readonly parking = new Parking(this.kernel, this.cars);
  readonly peds = new Peds(this.kernel);
  readonly api: TrafficApi = this.createApi();

  private readonly unsub: (() => void)[] = [];
  private graphDirty = true;
  private slowT = 0;
  private jammed = false;
  private jamX = 0;
  private jamZ = 0;
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly ep: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly protest = (p: Person): boolean => p.faction === 'protest' && p.vehicleId === 0;

  provide(ctx: GameContext): void {
    const k = this.kernel;
    k.ctx = ctx;
    k.signals = this.signals;
    k.boxes = this.boxes;
    k.closures = this.closures;
    k.peds = this.peds;
    k.rng = ctx.rng.fork('circulation');
    this.cars.parking = this.parking;
    this.closures.attach(ctx);
    this.closures.counter = (x, z, r, out): void => this.cars.countNear(x, z, r, out);
    ctx.provide(EXT.traffic, this.closures);
    ctx.provide(TRAFFIC_SERVICE, this.api);
  }

  init(ctx: GameContext): void {
    const k = this.kernel;
    // « Faire circuler ce véhicule » : un policier à pied fait dégager un véhicule arrêté qui barre la voie
    registerClearOff(ctx, this.api);
    const ev = ctx.events;
    const dangers = k.dangers;
    this.unsub.push(
      ev.on('session:started', (e) => this.onSession(e.config)),
      ev.onAny(WORLD_SOURCE_EVENT, () => {
        this.graphDirty = true;
      }),
      ev.on('vehicle:removed', (e) => this.cars.onVehicleRemoved(e.id)),
      ev.on('person:removed', (e) => {
        const b = this.peds.byPerson.get(e.id);
        if (b) this.peds.forget(b);
      }),
      // ── dangers : les civils s'en éloignent ──
      ev.on('explosion', (e) => dangers.add(e.x, e.z, Math.max(45, e.radius * 4), 1, ctx.clock.now + 14)),
      ev.on('projectile:impact', (e) => {
        const level = impactFear(e.kind);
        if (level > 0) dangers.add(e.x, e.z, level > 0.7 ? 40 : 14, level, ctx.clock.now + (level > 0.7 ? 10 : 5));
      }),
      ev.on('fire:started', (e) => dangers.add(e.x, e.z, 22, 0.6, ctx.clock.now + 20)),
      ev.on('person:down', (e) => {
        const p = ctx.people.get(e.id);
        if (p && e.sourceId !== 0) dangers.add(p.x, p.z, 14, 0.45, ctx.clock.now + 10);
      }),
      ev.on('vehicle:state', (e) => {
        if (e.state !== 'burning' && e.state !== 'wrecked') return;
        const v = ctx.vehicles.get(e.id);
        if (v) dangers.add(v.x, v.z, 28, 0.7, ctx.clock.now + 25);
      }),
      ev.on('sfx', (e) => {
        if (e.x === undefined || e.z === undefined) return;
        if (e.id === 'detonation' || e.id === 'mortier_explosion' || e.id === 'tir_arme' || e.id === 'desencerclement') {
          dangers.add(e.x, e.z, 40, 0.85, ctx.clock.now + 9);
        }
      }),
    );
  }

  reset(): void {
    const k = this.kernel;
    resetTuning(k.tuning);
    Object.assign(k.stats, makeStats());
    k.rng = k.ctx.rng.fork('circulation');
    k.sessionVehicles = 1;
    k.sessionParked = 1;
    k.sessionPedestrians = 1;
    k.crowd = 0;
    k.protestNear = 0;
    k.hasFocus = false;
    k.dangers.reset();
    k.obstructions.reset();
    k.sirens.reset();
    this.signals.reset();
    this.boxes.reset();
    this.cars.reset();
    this.peds.reset();
    this.parking.reset(k.ctx.session.config ? k.ctx.session.config.seed : 1);
    this.closures.reset();
    this.graphDirty = true;
    this.slowT = 0;
    this.jammed = false;
  }

  dispose(): void {
    for (let i = 0; i < this.unsub.length; i++) this.unsub[i]!();
    this.unsub.length = 0;
  }

  /** Recopie le graphe routier si la carte a changé. */
  private ensureGraph(): void {
    const k = this.kernel;
    const world = k.ctx.world;
    if (!this.graphDirty && k.cache.matches(world)) return;
    this.graphDirty = false;
    if (world.edgeCount === 0 || world.nodeCount === 0) {
      k.cache.clear();
    } else {
      // les souterrains ne figurent pas dans RoadEdgeInfo : on les lit dans les données de carte si elles sont là
      const data = k.ctx.service<WorldData>(WORLD_DATA_SERVICE);
      let edges: WorldData['roadGraph']['edges'] | null = null;
      try {
        edges = data ? data.roadGraph.edges : null;
      } catch {
        edges = null;
      }
      const same = edges !== null && edges.length === world.edgeCount;
      k.cache.build(world, same ? (e: number): boolean => edges![e]!.tunnel === true : undefined);
    }
    this.signals.reset();
    this.boxes.reset();
    this.closures.onGraph();
  }

  /** Début de session : graphe, graines, options de départ lues dans SessionConfig.extra. */
  private onSession(config: SessionConfig): void {
    const k = this.kernel;
    this.graphDirty = true;
    this.ensureGraph();
    this.parking.reset(config.seed);
    k.refocus();
    const extra = record(config.extra);
    if (!extra) return;
    const tr = record(extra.traffic);
    if (tr) {
      if (tr.none === true) k.tuning.ambient = false;
      if (tr.signals === false) k.tuning.signals = false;
      k.sessionVehicles = factor(tr.vehicles, 1);
      k.sessionParked = factor(tr.parked, 1);
      k.sessionPedestrians = factor(tr.pedestrians, 1);
      const closed = tr.closed;
      if (Array.isArray(closed)) {
        for (const c of closed) {
          const pt = record(c);
          if (pt && typeof pt.x === 'number' && typeof pt.z === 'number') this.closures.closeRoadInstant(pt.x, pt.z);
        }
      }
      const area = record(tr.closedArea);
      if (area && typeof area.x === 'number' && typeof area.z === 'number' && typeof area.radius === 'number') {
        this.closures.closeAreaWith(area.x, area.z, area.radius, 0, true);
      }
    }
    const options = record(extra.options);
    if (options && options.circulation === 'coupee' && config.x !== undefined && config.z !== undefined) {
      this.closures.closeAreaWith(config.x, config.z, START_AREA_RADIUS, 0, true);
    }
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const k = this.kernel;
    const ctx = k.ctx;
    this.ensureGraph();
    k.refocus();
    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 1;
      // place prise par la manifestation autour du joueur : la vie civile s'efface
      k.protestNear = k.hasFocus ? ctx.people.countIn(k.focusX, k.focusZ, 150, this.protest) : 0;
      k.crowd = k.protestNear > 0 ? Math.min(1, ctx.people.countIn(k.focusX, k.focusZ, 60, this.protest) / 120) : 0;
      k.stats.closures = this.closures.closures.length;
      let blocked = 0;
      let bx = 0;
      let bz = 0;
      for (let i = 0; i < this.cars.list.length; i++) {
        const b = this.cars.list[i]!;
        if (b.blockedT <= 0) continue;
        blocked++;
        bx += b.v.x;
        bz += b.v.z;
      }
      k.stats.blocked = blocked;
      // bouchon : annoncé à partir de quatre véhicules immobilisés, levé quand il n'en reste presque plus
      if (!this.jammed && blocked >= 4) {
        this.jammed = true;
        this.jamX = bx / blocked;
        this.jamZ = bz / blocked;
        ctx.events.emitAny(JAM_EVENT, { x: this.jamX, z: this.jamZ, vehicles: blocked, state: 'forme' });
      } else if (this.jammed && blocked <= 1) {
        this.jammed = false;
        ctx.events.emitAny(JAM_EVENT, { x: this.jamX, z: this.jamZ, vehicles: blocked, state: 'resorbe' });
      }
    }
    this.closures.update(dt);
    if (!k.cache.ready) return;
    this.cars.update(dt);
    this.parking.update(dt);
    this.peds.update(dt);
  }

  // ───────────────────────────── service 'traffic' ─────────────────────────────

  private color(state: number): SignalColor {
    return state === GREEN ? 'vert' : state === AMBER ? 'orange' : state === RED ? 'rouge' : 'aucun';
  }

  private createApi(): TrafficApi {
    const self = this;
    const k = this.kernel;
    return {
      tuning: k.tuning,
      stats: k.stats,
      signal(nodeId: number, heading: number): SignalColor {
        if (!k.cache.ready || nodeId < 0 || nodeId >= k.cache.nodeCount) return 'aucun';
        const ctrl = self.signals.crossingCtrl(nodeId);
        if (!ctrl) return 'aucun';
        return self.color(self.signals.state(ctrl, Math.sin(heading), Math.cos(heading), k.ctx.clock.now));
      },
      signalAhead(x: number, z: number, heading: number, range = 60): SignalColor {
        return self.signalAhead(x, z, heading, range);
      },
      pedestrianGreen(nodeId: number, streetHeading: number): boolean {
        if (!k.cache.ready || nodeId < 0 || nodeId >= k.cache.nodeCount) return true;
        const ctrl = self.signals.crossingCtrl(nodeId);
        if (!ctrl || !k.tuning.signals) return true;
        return self.signals.redLeft(ctrl, Math.sin(streetHeading), Math.cos(streetHeading), k.ctx.clock.now) > 3;
      },
      spawnVehicle(kind: VehicleKind, x: number, z: number, heading: number, destX: number, destZ: number): Vehicle | null {
        self.ensureGraph();
        const b = self.cars.create(kind, x, z, heading, destX, destZ, false);
        return b ? b.v : null;
      },
      spawnParked(kind: VehicleKind, x: number, z: number, heading: number): Vehicle {
        return self.parking.spawnParked(kind, x, z, heading);
      },
      spawnPedestrian(kind: PersonKind, x: number, z: number): Person | null {
        self.ensureGraph();
        return self.peds.spawnAt(kind, x, z);
      },
      motorist(v: Vehicle): Readonly<MotoristStatus> | null {
        const b = self.cars.byVehicle.get(v.id);
        return b ? b.status : null;
      },
      isTraffic: (v: Vehicle): boolean => self.cars.byVehicle.has(v.id) || self.parking.isParked(v),
      isParked: (v: Vehicle): boolean => self.parking.isParked(v),
      isPedestrian: (p: Person): boolean => self.peds.byPerson.has(p.id),
      clearAmbient(): void {
        k.tuning.ambient = false;
        for (let i = self.cars.list.length - 1; i >= 0; i--) self.cars.despawn(self.cars.list[i]!);
        self.parking.clear();
        self.peds.clear();
      },
      clearOff(v: Vehicle, byId: EntityId): ClearOffResult {
        const b = self.cars.byVehicle.get(v.id);
        if (!b) return self.parking.isParked(v) || self.cars.abandoned.indexOf(v.id) >= 0 || v.seats[0] === 0 ? 'sans_conducteur' : 'impossible';
        if (!self.cars.ap || !k.cache.ready) return 'impossible';
        return self.cars.clearer.start(b, byId, false) ? 'ok' : 'impossible';
      },
      blockerAhead: (v: Vehicle, range = 25): Vehicle | null => blockerAhead(k.ctx, v, range),
    };
  }

  /** Premier feu rencontré en suivant la rue devant le point, dans la limite de `range` mètres. */
  private signalAhead(x: number, z: number, heading: number, range: number): SignalColor {
    const k = this.kernel;
    const c = k.cache;
    const hit = this.hit;
    if (!c.ready || !c.nearestVehicleEdge(x, z, 12, hit)) return 'aucun';
    const hx = Math.sin(heading);
    const hz = Math.cos(heading);
    let e = hit.edge;
    const forward = hit.dx * hx + hit.dz * hz >= 0;
    let node = forward ? c.edgeB[e]! : c.edgeA[e]!;
    let dist = forward ? c.edgeLen[e]! - hit.s : hit.s;
    const ep = this.ep;
    for (let hop = 0; hop < 16 && dist <= range; hop++) {
      c.dirFrom(e, node, ep);
      const inX = -ep.dx;
      const inZ = -ep.dz;
      const ctrl = this.signals.crossingCtrl(node);
      if (ctrl) return this.color(this.signals.state(ctrl, inX, inZ, k.ctx.clock.now));
      let best = -1;
      let bestDot = 0.3;
      for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
        const e2 = c.adjEdge[j]!;
        if (e2 === e || !c.isVehicle(e2)) continue;
        if ((c.edgeFlags[e2]! & E_ONEWAY) !== 0 && c.edgeA[e2] !== node) continue;
        c.dirFrom(e2, node, ep);
        const dot = ep.dx * inX + ep.dz * inZ;
        if (dot > bestDot) {
          bestDot = dot;
          best = e2;
        }
      }
      if (best < 0) break;
      e = best;
      dist += c.edgeLen[e]!;
      node = c.other(e, node);
    }
    return 'aucun';
  }
}

/** Frayeur causée par l'impact d'un projectile (0 = aucune). */
function impactFear(kind: ProjectileKind): number {
  switch (kind) {
    case 'gm2l':
    case 'desencerclement':
    case 'mortier':
    case 'balle':
      return 0.9;
    case 'molotov':
      return 0.85;
    case 'lbd':
    case 'grenade_lacrymo_56':
      return 0.5;
    case 'pave':
    case 'bouteille':
      return 0.35;
    default:
      return 0;
  }
}
