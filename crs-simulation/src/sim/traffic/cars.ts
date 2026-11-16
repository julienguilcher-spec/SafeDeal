/* =====================================================================================
 * CIRCULATION — gestionnaire des véhicules civils en circulation : apparition autour du joueur,
 * disparition hors champ, densité, itinéraires (destination, déviation autour des rues fermées et des
 * chaussées bloquées), ordres donnés au pilote automatique du module des véhicules.
 *
 * Le pilote automatique (service 'vehicles.autopilot') conduit : direction, allure, distances, piétons,
 * obstacles, demi-tours. Ce module RÉGULE : il lui donne la destination (« roule »), un point d'arrêt
 * (« tiens-toi à la ligne ») ou un point sur le bas-côté (« range-toi »). L'itinéraire mémorisé ici est
 * exactement celui que suit le pilote : ctx.world.findPath est appelé avec les mêmes arguments juste avant
 * driveTo. La réflexion de chaque automobiliste (car-think.ts) est étalée : quatre fois par seconde.
 * ===================================================================================== */

import type { EntityId, RoadSample, Vehicle, VehicleKind } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import type { AutopilotApi, DriveOptions, VehiclesExtApi } from '@/sim/vehicles/api';
import { MOTORIST_EVENT } from './api';
import type { MotoristState } from './api';
import { CarBrain, MODE_GO, MODE_HOLD, MODE_PARK, MODE_PULL } from './car-brain';
import { CarThinker } from './car-think';
import type { EdgeHit, EdgePoint } from './graph';
import { E_ONEWAY, makeEdgeHit } from './graph';
import type { Parking } from './parking';
import type { ControlPoint, RoutePoint } from './route';
import { CP_BOX } from './route';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';
import {
  CAR_COLORS, CAR_THINK, CITY_SPEED, TRAFFIC_MIX, classWeight, hourFactor, weatherCarFactor,
} from './tuning';

const AUTOPILOT_SERVICE = 'vehicles.autopilot';
const VEHICLES_EXT_SERVICE = 'vehicles.ext';
const CLASS_NAMES = ['motorway', 'primary', 'secondary', 'tertiary', 'residential', 'pedestrian', 'service', 'footway'] as const;

export class Cars {
  readonly list: CarBrain[] = [];
  readonly byVehicle = new Map<EntityId, CarBrain>();
  /** Véhicules laissés sur place par leur conducteur (ils restent : cibles, matériau de barricade). */
  readonly abandoned: EntityId[] = [];
  ap: AutopilotApi | undefined;
  ext: VehiclesExtApi | undefined;
  parking: Parking | null = null;
  readonly thinker: CarThinker;
  /** Facteur local selon le type des voies autour du joueur (grands axes : plus de trafic). */
  roadFactor = 1;

  private popT = 0;
  private serviceT = 0;
  private roadT = 0;
  private readonly buf: number[] = [];
  private readonly nodes: number[] = [];
  private readonly routeNodes: number[] = [];
  private readonly near: Vehicle[] = [];
  private readonly pt: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly rp: RoutePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly road: RoadSample = makeRoadSample();
  private readonly opts: DriveOptions = {};
  private mask: Uint8Array = new Uint8Array(0);
  private readonly chainEdges: number[] = [];
  private readonly chainDirs: number[] = [];
  private readonly chainInfo = { nodeA: -1, nodeB: -1, length: 0, count: 0 };
  private destX = 0;
  private destZ = 0;

  constructor(readonly k: TrafficKernel) {
    this.thinker = new CarThinker(k, this);
  }

  reset(): void {
    this.list.length = 0;
    this.byVehicle.clear();
    this.abandoned.length = 0;
    this.popT = 0;
    this.serviceT = 0;
    this.roadT = 0;
    this.roadFactor = 1;
    this.thinker.reset();
  }

  private services(): void {
    const ctx = this.k.ctx;
    this.ap = ctx.service<AutopilotApi>(AUTOPILOT_SERVICE);
    this.ext = ctx.service<VehiclesExtApi>(VEHICLES_EXT_SERVICE);
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    this.serviceT -= dt;
    if (this.serviceT <= 0) {
      this.serviceT = 2;
      this.services();
    }
    this.thinker.update(dt);
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      b.thinkT -= dt;
      if (b.thinkT > 0) continue;
      b.thinkT += CAR_THINK;
      if (b.thinkT < 0) b.thinkT = 0;
      this.thinker.think(b);
    }
    this.popT -= dt;
    if (this.popT <= 0) {
      this.popT = 0.5;
      this.populate();
    }
    k.stats.vehicles = list.length;
    k.stats.abandoned = this.abandoned.length;
  }

  // ───────────────────────────── population ─────────────────────────────

  /** Effectif visé autour du joueur : heure, météo, type de voies, réglage du nombre de PNJ, manifestation. */
  target(): number {
    const k = this.k;
    const t = k.tuning;
    if (!t.ambient || !k.hasFocus || !this.ap || !k.cache.ready) return 0;
    const env = k.ctx.env.state;
    const scale = k.ctx.settings.values.crowdScale;
    const n = t.vehicleBase * t.vehicleDensity * k.sessionVehicles * hourFactor(env.timeOfDay) * weatherCarFactor(env.weather)
      * scale * this.roadFactor * (1 - 0.85 * k.crowd);
    const max = Math.min(t.vehicleMax, Math.round(t.vehicleMax * Math.max(0.25, scale)));
    return Math.max(0, Math.min(max, Math.round(n)));
  }

  private populate(): void {
    const k = this.k;
    const t = k.tuning;
    const list = this.list;
    this.roadT -= 0.5;
    if (this.roadT <= 0) {
      this.roadT = 6;
      this.measureRoads();
    }
    const target = this.target();
    k.stats.vehicleTarget = target;
    const now = k.ctx.clock.now;
    const far2 = t.despawn * t.despawn;
    const mid2 = t.spawnMin * t.spawnMin * 0.5;
    let excess = list.length - target;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if (!b.ambient) continue;
      const d2 = k.distToFocus2(b.v.x, b.v.z);
      if (d2 > far2) {
        this.despawn(b);
        excess--;
      } else if (excess > 0 && d2 > mid2 && now - b.bornAt > 20 && !k.visible(b.v.x, b.v.z)) {
        this.despawn(b);
        excess--;
      }
    }
    if (!k.hasFocus || !t.ambient) return;
    // les épaves laissées loin derrière finissent par disparaître, hors champ
    if (this.abandoned.length > 12) this.sweepAbandoned();
    if (list.length < target) {
      for (let attempt = 0; attempt < 3; attempt++) if (this.trySpawn()) break;
    }
  }

  /** Poids moyen des voies autour du joueur : sur une avenue il passe plus de monde que dans une impasse. */
  private measureRoads(): void {
    const k = this.k;
    const c = k.cache;
    if (!c.ready || !k.hasFocus) return;
    const nodes = this.nodes;
    const n = c.nodesInRadius(k.focusX, k.focusZ, 180, nodes);
    let sum = 0;
    let len = 0;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
        const e = c.adjEdge[j]!;
        if (c.edgeA[e] !== node || !c.isVehicle(e)) continue;
        const l = c.edgeLen[e]!;
        sum += classWeight(CLASS_NAMES[c.edgeClass[e]!]!) * l;
        len += l;
      }
    }
    // 1 pour un quartier de rues ordinaires et d'artères mêlées (poids moyen ≈ 1,6)
    this.roadFactor = len > 0 ? Math.max(0.3, Math.min(1.6, sum / len / 1.6)) : 0;
  }

  private sweepAbandoned(): void {
    const k = this.k;
    const ctx = k.ctx;
    for (let i = this.abandoned.length - 1; i >= 0 && this.abandoned.length > 8; i--) {
      const v = ctx.vehicles.get(this.abandoned[i]!);
      if (!v) {
        this.abandoned.splice(i, 1);
        continue;
      }
      if (v.state === 'ok' && v.burning === 0 && k.distToFocus2(v.x, v.z) > 260 * 260 && !k.visible(v.x, v.z)) {
        this.abandoned.splice(i, 1);
        ctx.vehicles.remove(v.id);
      }
    }
  }

  /** Tente de faire apparaître un véhicule dans la couronne d'apparition. */
  private trySpawn(): boolean {
    const k = this.k;
    const c = k.cache;
    const t = k.tuning;
    const rng = k.rng;
    const ctx = k.ctx;
    const nodes = this.nodes;
    const n = c.nodesInRadius(k.focusX, k.focusZ, t.spawnMax, nodes);
    if (n === 0) return false;
    const min2 = t.spawnMin * t.spawnMin;
    const pt = this.pt;
    for (let attempt = 0; attempt < 6; attempt++) {
      const node = nodes[rng.int(0, n)]!;
      const deg = c.adjStart[node + 1]! - c.adjStart[node]!;
      if (deg === 0) continue;
      const e = c.adjEdge[c.adjStart[node]! + rng.int(0, deg)]!;
      if (!c.isVehicle(e) || k.closures.isClosed(e)) continue;
      const w = c.edgeWidth[e]!;
      if (w < 3.2 || rng.next() > classWeight(CLASS_NAMES[c.edgeClass[e]!]!) / 3.2) continue;
      const len = c.edgeLen[e]!;
      const s = rng.next() * len;
      const oneway = (c.edgeFlags[e]! & E_ONEWAY) !== 0;
      c.pointAt(e, s, 0, pt);
      // sens : plutôt vers le joueur, pour traverser la zone
      let dir = 1;
      if (!oneway) {
        const toward = (k.focusX - pt.x) * pt.dx + (k.focusZ - pt.z) * pt.dz;
        dir = (toward >= 0) === rng.chance(0.75) ? 1 : -1;
      }
      const lane = oneway ? 0 : Math.min(w * 0.25, 3.2);
      c.pointAt(e, s, lane * dir, pt);
      const x = pt.x;
      const z = pt.z;
      const d2 = k.distToFocus2(x, z);
      if (d2 < min2 || d2 > t.spawnMax * t.spawnMax) continue;
      if (!ctx.world.isLoaded(x, z)) continue;
      if (ctx.vehicles.queryRadius(x, z, 14, this.near) > 0) continue;
      if (ctx.people.countIn(x, z, 5) > 0) continue;
      if (ctx.hazards.fireAt(x, z) > 0 || k.dangers.at(x, z) > 0.2) continue;
      if (!this.pickDestination(x, z)) continue;
      // type de véhicule
      let total = 0;
      for (let i = 0; i < TRAFFIC_MIX.length; i++) if (w >= TRAFFIC_MIX[i]!.minWidth) total += TRAFFIC_MIX[i]!.weight;
      let roll = rng.next() * total;
      let kind: VehicleKind = 'voiture';
      for (let i = 0; i < TRAFFIC_MIX.length; i++) {
        const m = TRAFFIC_MIX[i]!;
        if (w < m.minWidth) continue;
        roll -= m.weight;
        if (roll <= 0) {
          kind = m.kind;
          break;
        }
      }
      const heading = Math.atan2(pt.dx * dir, pt.dz * dir);
      const b = this.create(kind, x, z, heading, this.destX, this.destZ, true);
      if (!b) continue;
      // il apparaît déjà lancé
      const u0 = Math.min(c.edgeSpeed[e]!, CITY_SPEED) * 0.6;
      b.v.vx = pt.dx * dir * u0;
      b.v.vz = pt.dz * dir * u0;
      b.v.speed = u0;
      return true;
    }
    return false;
  }

  /** Destination d'un automobiliste : un point du réseau de l'autre côté de la zone. Écrit destX / destZ. */
  pickDestination(fromX: number, fromZ: number): boolean {
    const k = this.k;
    const c = k.cache;
    const t = k.tuning;
    const rng = k.rng;
    const nodes = this.routeNodes;
    const cx = k.hasFocus ? k.focusX : fromX;
    const cz = k.hasFocus ? k.focusZ : fromZ;
    const n = c.nodesInRadius(cx, cz, t.spawnMax + 60, nodes);
    if (n === 0) return false;
    const ax = fromX - cx;
    const az = fromZ - cz;
    const min = t.spawnMin * 0.8;
    let fallback = -1;
    for (let attempt = 0; attempt < 10; attempt++) {
      const node = nodes[rng.int(0, n)]!;
      if (c.nodeDeg[node] === 0) continue;
      const dx = c.nodeX[node]! - cx;
      const dz = c.nodeZ[node]! - cz;
      const fx = c.nodeX[node]! - fromX;
      const fz = c.nodeZ[node]! - fromZ;
      if (fx * fx + fz * fz < 120 * 120) continue;
      fallback = node;
      if (dx * dx + dz * dz < min * min) continue;
      // de l'autre côté : angle de plus de 80° avec la direction d'où il vient
      if (ax * dx + az * dz > 0.17 * Math.sqrt((ax * ax + az * az) * (dx * dx + dz * dz))) continue;
      this.destX = c.nodeX[node]!;
      this.destZ = c.nodeZ[node]!;
      return true;
    }
    if (fallback < 0) return false;
    this.destX = c.nodeX[fallback]!;
    this.destZ = c.nodeZ[fallback]!;
    return true;
  }

  /** Donne une nouvelle destination à un automobiliste d'ambiance. */
  newDestination(b: CarBrain): boolean {
    if (!this.pickDestination(b.v.x, b.v.z)) return false;
    b.destX = this.destX;
    b.destZ = this.destZ;
    b.hasVia = false;
    return true;
  }

  /** Crée un véhicule, son conducteur, son itinéraire, et le confie au pilote automatique. */
  create(kind: VehicleKind, x: number, z: number, heading: number, destX: number, destZ: number, ambient: boolean): CarBrain | null {
    const k = this.k;
    const ctx = k.ctx;
    if (!this.ap) this.services();
    if (!this.ap || !k.cache.ready) return null;
    const color = kind === 'taxi' || kind === 'bus' ? undefined : CAR_COLORS[k.rng.int(0, CAR_COLORS.length)]!;
    const v = ctx.vehicles.spawn(kind, x, z, heading, color === undefined ? undefined : { color });
    const driver = ctx.archetypes.spawn('conducteur', x, z, { heading });
    if (!ctx.vehicles.enter(driver, v, 'driver')) {
      ctx.people.remove(driver.id);
      ctx.vehicles.remove(v.id);
      return null;
    }
    const b = new CarBrain(v);
    b.driverId = driver.id;
    b.ambient = ambient;
    b.destX = destX;
    b.destZ = destZ;
    b.thinkT = k.rng.next() * CAR_THINK;
    b.patience = k.tuning.patience * (0.6 + k.rng.next() * 0.9);
    b.bornAt = ctx.clock.now;
    b.closureStamp = k.closures.stamp;
    b.graphStamp = k.cache.stamp;
    v.engineOn = true;
    v.brain = b;
    this.list.push(b);
    this.byVehicle.set(v.id, b);
    if (!this.retarget(b, false) || !this.drive(b)) {
      this.despawn(b);
      return null;
    }
    k.stats.spawned++;
    return b;
  }

  /** Retire le véhicule et son conducteur du monde. */
  despawn(b: CarBrain): void {
    const ctx = this.k.ctx;
    const v = b.v;
    this.forget(b, false);
    const driver = ctx.people.get(b.driverId);
    if (driver && driver.vehicleId === v.id) {
      for (let i = 0; i < v.seats.length; i++) if (v.seats[i] === driver.id) v.seats[i] = 0;
      driver.vehicleId = 0;
      driver.seat = -1;
      ctx.people.remove(driver.id);
    }
    if (ctx.vehicles.get(v.id) === v) ctx.vehicles.remove(v.id);
    this.k.stats.despawned++;
  }

  /** Oublie la fiche (le véhicule reste dans le monde). */
  forget(b: CarBrain, keepAsAbandoned: boolean): void {
    const k = this.k;
    const v = b.v;
    const r = b.route;
    for (let i = r.cpNext; i < r.cpCount; i++) {
      const cp = r.cps[i]!;
      if ((cp.kind & CP_BOX) !== 0) k.boxes.release(cp.node, v.id);
    }
    if (b.passRec) b.passRec.permits.delete(v.id);
    this.closeIncident(b, false);
    const i = this.list.indexOf(b);
    if (i >= 0) {
      this.list[i] = this.list[this.list.length - 1]!;
      this.list.pop();
    }
    this.byVehicle.delete(v.id);
    if (v.brain === b) v.brain = null;
    if (keepAsAbandoned && this.abandoned.indexOf(v.id) < 0) this.abandoned.push(v.id);
  }

  /** Le véhicule vient d'être retiré du monde par un autre module. */
  onVehicleRemoved(id: EntityId): void {
    const b = this.byVehicle.get(id);
    if (b) {
      const driver = this.k.ctx.people.get(b.driverId);
      this.forget(b, false);
      if (driver && driver.vehicleId === id) this.k.ctx.people.remove(driver.id);
    }
    const i = this.abandoned.indexOf(id);
    if (i >= 0) this.abandoned.splice(i, 1);
  }

  // ───────────────────────────── itinéraires ─────────────────────────────

  /** Installe la polyligne de `buf` comme itinéraire : points de contrôle, réservations conservées, barrages. */
  private install(b: CarBrain): void {
    const k = this.k;
    const r = b.route;
    const buf = this.buf;
    const v = b.v;
    const now = k.ctx.clock.now;
    r.setPath(buf, buf.length >> 1);
    r.buildControlPoints(k.cache, k.signals);
    for (let i = 0; i < r.cpCount; i++) {
      const cp = r.cps[i]!;
      // carrefour déjà réservé (on repart d'une ligne d'arrêt) : la réservation suit le nouvel itinéraire
      if ((cp.kind & CP_BOX) !== 0 && k.boxes.holds(cp.node, v.id, now)) {
        k.boxes.release(cp.node, v.id);
        cp.cleared = k.boxes.request(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
      }
    }
    k.closures.scan(r.pts, r.cum, r.n, 0, v);
    b.blockS = k.closures.blockS;
    b.passS = k.closures.passS;
    b.passRec = k.closures.passRec;
    b.holdCp = null;
  }

  private path(b: CarBrain, x: number, z: number): boolean {
    const v = b.v;
    const buf = this.buf;
    return this.k.ctx.world.findPath(v.x, v.z, x, z, 'vehicle', buf) && buf.length >= 4;
  }

  private clean(b: CarBrain, avoid: boolean): boolean {
    const r = b.route;
    return b.blockS < 0 && !(avoid && this.k.obstructions.blocks(r.pts, r.cum, r.n, 0));
  }

  /**
   * Choisit l'itinéraire : direct vers la destination ; sinon déviation par un point de passage calculé sur le
   * graphe sans les rues fermées (ni, si `avoid`, les chaussées signalées bloquées : demi-tour si la rue est à
   * double sens) ; sinon, pour la circulation d'ambiance, une autre destination ; sinon l'itinéraire direct,
   * au bout duquel il attendra devant le barrage. false si aucun itinéraire n'existe.
   */
  retarget(b: CarBrain, avoid: boolean): boolean {
    const k = this.k;
    const c = k.cache;
    b.hasVia = false;
    const direct = this.path(b, b.destX, b.destZ);
    if (direct) {
      this.install(b);
      if (this.clean(b, avoid)) return true;
    }
    if (k.closures.recs.length > 0 || avoid) {
      const start = this.nodeNear(b.v, avoid);
      const end = c.nearestVehicleEdge(b.destX, b.destZ, 60, this.hit) ? this.endNode(this.hit, b.destX, b.destZ) : -1;
      const nodes = this.routeNodes;
      if (start >= 0 && end >= 0 && c.route(start, end, this.closedMask(avoid), nodes) && nodes.length >= 2) {
        const last = nodes.length - 1;
        let prev = -1;
        for (let f = 0; f < 4; f++) {
          const idx = Math.max(1, Math.min(last, Math.round(last * FRACTIONS[f]!)));
          if (idx === prev) continue;
          prev = idx;
          const via = nodes[idx]!;
          const vx = c.nodeX[via]!;
          const vz = c.nodeZ[via]!;
          if (!this.path(b, vx, vz)) continue;
          this.install(b);
          if (!this.clean(b, avoid)) continue;
          b.hasVia = idx < last;
          b.viaX = vx;
          b.viaZ = vz;
          k.stats.reroutes++;
          return true;
        }
      }
    }
    if (b.ambient && k.hasFocus) {
      for (let i = 0; i < 3; i++) {
        if (!this.pickDestination(b.v.x, b.v.z) || !this.path(b, this.destX, this.destZ)) continue;
        this.install(b);
        if (!this.clean(b, avoid)) continue;
        b.destX = this.destX;
        b.destZ = this.destZ;
        k.stats.reroutes++;
        return true;
      }
    }
    if (avoid) return false;
    if (!this.path(b, b.destX, b.destZ)) return false;
    this.install(b);
    return true;
  }

  /** Arêtes interdites au calcul de déviation : rues fermées, et tronçons signalés bloqués si `avoid`. */
  private closedMask(avoid: boolean): Uint8Array {
    const k = this.k;
    const closed = k.closures.closedEdges;
    if (!avoid || k.obstructions.active === 0) return closed;
    if (this.mask.length !== closed.length) this.mask = new Uint8Array(closed.length);
    this.mask.set(closed);
    const list = k.obstructions.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      if (o.until < 0 || !k.cache.nearestVehicleEdge(o.x, o.z, 10, this.hit)) continue;
      k.cache.chain(this.hit.edge, this.chainEdges, this.chainDirs, this.chainInfo);
      for (let j = 0; j < this.chainEdges.length; j++) this.mask[this.chainEdges[j]!] = 1;
    }
    return this.mask;
  }

  /** Nœud vers lequel roule le véhicule ; `behind` : celui qu'il a dans le dos (demi-tour), si la rue le permet. */
  private nodeNear(v: Vehicle, behind: boolean): number {
    const c = this.k.cache;
    const hit = this.hit;
    if (!c.nearestVehicleEdge(v.x, v.z, 25, hit)) return -1;
    const e = hit.edge;
    const fwd = Math.sin(v.heading) * hit.dx + Math.cos(v.heading) * hit.dz >= 0;
    const oneway = (c.edgeFlags[e]! & E_ONEWAY) !== 0;
    if (oneway) return c.edgeB[e]!;
    return fwd !== behind ? c.edgeB[e]! : c.edgeA[e]!;
  }

  private endNode(hit: EdgeHit, x: number, z: number): number {
    const c = this.k.cache;
    const a = c.edgeA[hit.edge]!;
    const b = c.edgeB[hit.edge]!;
    const da = (c.nodeX[a]! - x) * (c.nodeX[a]! - x) + (c.nodeZ[a]! - z) * (c.nodeZ[a]! - z);
    const db = (c.nodeX[b]! - x) * (c.nodeX[b]! - x) + (c.nodeZ[b]! - z) * (c.nodeZ[b]! - z);
    return da <= db ? a : b;
  }

  // ───────────────────────────── ordres au pilote automatique ─────────────────────────────

  /** « Roule » : vers la destination (ou le point de passage), selon l'itinéraire déjà installé. */
  drive(b: CarBrain): boolean {
    const ap = this.ap;
    if (!ap) return false;
    const o = this.opts;
    o.urgence = b.passing;
    o.stopBefore = undefined;
    o.pushThrough = undefined;
    o.speed = b.fleeing ? CITY_SPEED * 1.35 : undefined;
    b.mode = MODE_GO;
    b.holdCp = null;
    b.replanAt = -1;
    return ap.driveTo(b.v, b.hasVia ? b.viaX : b.destX, b.hasVia ? b.viaZ : b.destZ, o);
  }

  /** Recalcule l'itinéraire depuis la position courante puis « roule » (départ d'une ligne d'arrêt). */
  go(b: CarBrain): boolean {
    if (!this.path(b, b.hasVia ? b.viaX : b.destX, b.hasVia ? b.viaZ : b.destZ)) return false;
    this.install(b);
    return this.drive(b);
  }

  /** « Tiens-toi à la ligne » : arrêt du pare-chocs à la ligne d'arrêt du point de contrôle. */
  holdAt(b: CarBrain, cp: ControlPoint): void {
    const ap = this.ap;
    if (!ap) return;
    const r = b.route;
    const v = b.v;
    b.mode = MODE_HOLD;
    b.holdCp = cp;
    if (cp.stopS - (r.s + b.halfL) < 1.5) {
      ap.stop(v); // déjà à la ligne : il freine sur place
      return;
    }
    const p = this.rp;
    r.sample(cp.stopS, p);
    // Le point d'arrêt est posé à 20 cm de l'axe : le pilote automatique y reconnaît « un point de la rue »
    // et s'arrête sur sa voie de droite. Posé exactement sur l'axe, il serait confondu avec le point
    // d'accroche de l'itinéraire (ctx.world.findPath fusionne les points à moins de 5 cm) et le pilote
    // viendrait s'arrêter au milieu de la chaussée.
    const o = this.opts;
    o.urgence = false;
    o.speed = undefined;
    o.pushThrough = undefined;
    o.stopBefore = b.halfL + 0.6;
    if (!ap.driveTo(v, p.x - p.dz * AXIS_NUDGE, p.z + p.dx * AXIS_NUDGE, o)) ap.stop(v);
  }

  /** « Range-toi » : s'arrête au bord droit de la chaussée pour laisser passer une sirène. */
  pullOver(b: CarBrain, forId: EntityId, seconds: number): void {
    const ap = this.ap;
    if (!ap) return;
    const k = this.k;
    const r = b.route;
    const v = b.v;
    const u = Math.abs(v.speed);
    const p = this.rp;
    r.sample(Math.min(r.total, r.s + Math.max(8, u * 1.6 + 6)), p);
    const road = this.road;
    let off = 0;
    if (k.ctx.world.nearestRoad(p.x, p.z, road, 8)) off = road.width * 0.5 - b.halfW - 0.35;
    b.mode = MODE_PULL;
    b.holdCp = null;
    b.pullFor = forId;
    b.pullUntil = k.ctx.clock.now + seconds;
    const o = this.opts;
    o.urgence = false;
    o.speed = undefined;
    o.pushThrough = undefined;
    o.stopBefore = undefined;
    // droite du sens de marche = (−dz, dx)
    if (off < 1.1 || !ap.driveTo(v, p.x - p.dz * off, p.z + p.dx * off, o)) ap.stop(v);
  }

  /** « Gare-toi » sur la place donnée. */
  park(b: CarBrain, slot: number, x: number, z: number, heading: number): boolean {
    const ap = this.ap;
    if (!ap || !ap.park(b.v, x, z, heading)) return false;
    b.mode = MODE_PARK;
    b.holdCp = null;
    b.parkSlot = slot;
    b.parkUntil = this.k.ctx.clock.now + 70;
    return true;
  }

  // ───────────────────────────── fin de course ─────────────────────────────

  /** Le conducteur quitte son véhicule et s'enfuit à pied ; le véhicule reste sur place. */
  abandon(b: CarBrain): void {
    const k = this.k;
    const ctx = k.ctx;
    const v = b.v;
    const driver = ctx.people.get(b.driverId);
    if (this.ap) this.ap.stop(v);
    if (this.ext) this.ext.setEngine(v, false);
    else v.engineOn = false;
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    v.cmd.handbrake = true;
    const x = v.x;
    const z = v.z;
    this.emit(b, 'abandon');
    this.forget(b, true);
    k.stats.abandons++;
    if (driver && driver.vehicleId === v.id && ctx.vehicles.exit(driver) && k.peds) {
      const fromX = k.dangers.at(x, z) > 0 ? k.dangers.lastX : x;
      const fromZ = k.dangers.at(x, z) > 0 ? k.dangers.lastZ : z;
      k.peds.adopt(driver, true, fromX, fromZ);
    }
  }

  emit(b: CarBrain, state: MotoristState): void {
    this.k.ctx.events.emitAny(MOTORIST_EVENT, { vehicleId: b.v.id, personId: b.driverId, state, x: b.v.x, z: b.v.z });
  }

  openIncident(b: CarBrain, urgency: 1 | 2 | 3): void {
    const k = this.k;
    if (b.status.incidentId !== 0 || !k.tuning.incidents) return;
    const api = k.ctx.service<IncidentsApi>(EXT.incidents);
    this.emit(b, 'bloque');
    k.stats.incidents++;
    if (!api) {
      b.status.incidentId = -1; // pas de service d'incidents : l'événement libre suffit
      return;
    }
    b.status.incidentId = api.open('automobiliste_bloque', b.v.x, b.v.z, 'vehicle', b.v.id, urgency).id;
  }

  closeIncident(b: CarBrain, resolved: boolean): void {
    const id = b.status.incidentId;
    if (id === 0) return;
    b.status.incidentId = 0;
    if (resolved) this.emit(b, 'libere');
    if (id > 0) this.k.ctx.service<IncidentsApi>(EXT.incidents)?.close(id, resolved, 0);
  }

  /** Compte les véhicules de la circulation dans un rayon (TrafficControlApi.countNear). */
  countNear(x: number, z: number, r: number, out: { moving: number; stopped: number }): void {
    const r2 = r * r;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!.v;
      const dx = v.x - x;
      const dz = v.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (Math.abs(v.speed) > 0.5) out.moving++;
      else out.stopped++;
    }
    const vehicles = this.k.ctx.vehicles;
    for (let i = 0; i < this.abandoned.length; i++) {
      const v = vehicles.get(this.abandoned[i]!);
      if (!v) continue;
      const dx = v.x - x;
      const dz = v.z - z;
      if (dx * dx + dz * dz <= r2) out.stopped++;
    }
  }
}

/** Écart à l'axe d'un point d'arrêt (m) : assez pour ne pas être fusionné, assez peu pour rester « sur l'axe ». */
const AXIS_NUDGE = 0.2;

/** Parts de la déviation essayées comme point de passage, de la plus longue à la plus courte. */
const FRACTIONS: readonly number[] = [1, 0.6, 0.3, 0.1];
