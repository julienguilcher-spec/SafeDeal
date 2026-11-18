/* =====================================================================================
 * CIRCULATION — véhicules en stationnement le long des rues (cibles des incendiaires, matériau de
 * barricade), et automobilistes qui se garent en arrivant.
 *
 * Les places sont déduites du graphe, de façon déterministe : en file le long du trottoir, à l'écart des
 * carrefours et des passages piétons, seulement là où la chaussée est assez large pour qu'un engin lourd
 * conduit par le pilote automatique passe sans les frôler (sens unique ≥ 7,6 m, double sens ≥ 14 m : le
 * pilote roule dans l'axe d'un sens unique et au quart de la chaussée d'un double sens). Chaque place est
 * occupée ou non selon un tirage figé par la graine de session : une rue garde ses voitures quand on y
 * revient. Un véhicule garé est une entité ordinaire de ctx.vehicles, endormie (coût nul) ; dès qu'on y
 * touche (déplacé, endommagé, incendié, occupé), il n'appartient plus à ce module et reste où il est.
 * Le stationnement réservé des commissariats (places de leurs véhicules, src/world/commissariats) reste libre.
 * ===================================================================================== */

import type { EntityId, Prop, RoadSample, Vehicle, VehicleKind } from '@/core/contracts';
import { hash2 } from '@/core/rng';
import type { CarBrain } from './car-brain';
import type { Cars } from './cars';
import type { EdgePoint } from './graph';
import { E_BRIDGE, E_ONEWAY, N_CROSSING, N_DEADEND, N_JUNCTION, N_SIGNAL } from './graph';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';
import { COMMISSARIATS, reservedBays } from '@/world/commissariats';
import type { ReservedBay } from '@/world/commissariats';
import {
  CAR_COLORS, PARKED_MIX, PARK_CLEAR_CROSSING, PARK_CLEAR_JUNCTION, PARK_MIN_ONEWAY, PARK_MIN_TWOWAY, PARK_SLOT,
} from './tuning';

class ParkedCar {
  slot = -1;
  x = 0;
  z = 0;
  constructor(readonly v: Vehicle) {}
}

/**
 * Stationnement réservé des commissariats : aucune voiture civile garée (ni au tirage, ni en se garant) à moins de
 * cette distance (m) du centre d'une place réservée (src/world/commissariats), que le module des commissariats soit
 * chargé ou non — la règle est celle de la voirie, pas celle du stock.
 */
const RESERVED_CLEAR = 6;

/** Places réservées des commissariats, avec leur emprise globale (pré-filtre), si la carte chargée les contient. */
interface ReservedZone {
  readonly bays: readonly ReservedBay[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Taux d'occupation des places à densité normale. */
const OCCUPANCY = 0.62;
const RINGS: readonly number[] = [0, 70, 120, 160, 1e9];
const MAX_SLOTS = 60;

export class Parking {
  readonly list: ParkedCar[] = [];
  readonly byVehicle = new Map<EntityId, ParkedCar>();
  /** Places déjà tirées (occupées, laissées libres ou impraticables) et places prises. */
  private readonly decided = new Set<number>();
  private readonly taken = new Set<number>();
  /**
   * Places réservées des commissariats tirées « occupées » : aucune voiture n'y apparaît, mais elles comptent dans le
   * plafond comme si elles l'étaient — le stationnement ailleurs dans la ville reste exactement le même, avec ou sans
   * places réservées (une voiture en moins ici ne fait pas apparaître une voiture de plus dans une autre rue).
   */
  private readonly ghosts: { slot: number; x: number; z: number }[] = [];
  private scanT = 0;
  private ring = 0;
  private prewarm = true;
  private seed = 1;
  private readonly nodes: number[] = [];
  private readonly near: Vehicle[] = [];
  private readonly props: Prop[] = [];
  private readonly pt: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly road: RoadSample = makeRoadSample();
  // géométrie de la dernière arête examinée
  private slotStart = 0;
  /** Places réservées des commissariats (undefined : pas encore calculé ; null : carte sans commissariat). */
  private reserved: ReservedZone | null | undefined = undefined;
  private poseX = 0;
  private poseZ = 0;
  private poseH = 0;

  constructor(private readonly k: TrafficKernel, private readonly cars: Cars) {}

  reset(seed: number): void {
    this.list.length = 0;
    this.byVehicle.clear();
    this.decided.clear();
    this.taken.clear();
    this.ghosts.length = 0;
    this.scanT = 0;
    this.ring = 0;
    this.prewarm = true;
    this.seed = seed | 0;
    this.reserved = undefined;
  }

  /** Retire tous les véhicules garés encore intacts (clearAmbient). */
  clear(): void {
    const vehicles = this.k.ctx.vehicles;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pc = this.list[i]!;
      if (vehicles.get(pc.v.id) === pc.v && !this.touched(pc)) vehicles.remove(pc.v.id);
    }
    this.list.length = 0;
    this.byVehicle.clear();
    this.taken.clear();
    this.ghosts.length = 0;
  }

  isParked(v: Vehicle): boolean {
    return this.byVehicle.has(v.id);
  }

  cap(): number {
    const k = this.k;
    const t = k.tuning;
    if (!t.ambient) return 0;
    const n = t.parkedBase * t.parkedDensity * k.sessionParked * k.ctx.settings.values.crowdScale;
    return Math.max(0, Math.min(t.parkedMax, Math.round(n)));
  }

  // ───────────────────────────── places ─────────────────────────────

  /** La chaussée de cette arête admet-elle du stationnement ? */
  eligible(e: number): boolean {
    const c = this.k.cache;
    const f = c.edgeFlags[e]!;
    if (!c.isVehicle(e) || (f & E_BRIDGE) !== 0 || c.edgeClass[e] === 6) return false; // ni pont, ni voie de service
    return c.edgeWidth[e]! >= ((f & E_ONEWAY) !== 0 ? PARK_MIN_ONEWAY : PARK_MIN_TWOWAY);
  }

  private clearance(node: number): number {
    const c = this.k.cache;
    const f = c.nodeFlags[node]!;
    if ((f & N_JUNCTION) !== 0) return c.nodeRadius[node]! + PARK_CLEAR_JUNCTION;
    if ((f & (N_SIGNAL | N_CROSSING)) !== 0) return PARK_CLEAR_CROSSING;
    return (f & N_DEADEND) !== 0 ? 3 : 0.3;
  }

  /** Calcule le nombre de places par côté de l'arête et l'abscisse de la première. */
  private layout(e: number): number {
    const c = this.k.cache;
    const c0 = this.clearance(c.edgeA[e]!);
    const c1 = this.clearance(c.edgeB[e]!);
    const usable = c.edgeLen[e]! - c0 - c1;
    let n = Math.floor(usable / PARK_SLOT);
    if (n > MAX_SLOTS) n = MAX_SLOTS;
    if (n < 0) n = 0;
    this.slotStart = c0 + (usable - n * PARK_SLOT) * 0.5;
    return n;
  }

  private key(e: number, index: number, side: number): number {
    return (e * 64 + index) * 2 + (side > 0 ? 1 : 0);
  }

  /** Pose d'un véhicule de demi-largeur donnée sur la place (après layout(e)). Écrit poseX / poseZ / poseH. */
  private pose(e: number, index: number, side: number, halfW: number): void {
    const c = this.k.cache;
    const w = c.edgeWidth[e]!;
    const oneway = (c.edgeFlags[e]! & E_ONEWAY) !== 0;
    const pt = this.pt;
    c.pointAt(e, this.slotStart + (index + 0.5) * PARK_SLOT, side * (w * 0.5 - 0.15 - halfW), pt);
    this.poseX = pt.x;
    this.poseZ = pt.z;
    // garé dans le sens de la circulation de son côté
    const flip = !oneway && side < 0;
    this.poseH = Math.atan2(flip ? -pt.dx : pt.dx, flip ? -pt.dz : pt.dz);
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    k.stats.parked = this.list.length;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.7;
    if (!k.cache.ready || !k.hasFocus) return;
    this.sweep();
    const cap = this.cap();
    if (this.list.length + this.ghosts.length >= cap) {
      this.prewarm = false;
      return;
    }
    if (this.prewarm) {
      // première image de la session : tout le voisinage d'un coup (écran de chargement)
      for (let r = 0; r < RINGS.length - 1; r++) this.scan(r, cap, 1e9);
      this.prewarm = false;
      return;
    }
    this.scan(this.ring, cap, 8);
    this.ring = (this.ring + 1) % (RINGS.length - 1);
  }

  /** Les véhicules loin du joueur et jamais touchés disparaissent ; ceux qu'on a touchés ne sont plus les nôtres. */
  private sweep(): void {
    const k = this.k;
    const vehicles = k.ctx.vehicles;
    const far = k.tuning.parkedRadius + 70;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pc = this.list[i]!;
      const v = pc.v;
      const exists = vehicles.get(v.id) === v;
      const touched = exists && this.touched(pc);
      const gone = exists && !touched && k.distToFocus2(v.x, v.z) > far * far;
      if (exists && !touched && !gone) continue;
      if (gone) {
        vehicles.remove(v.id);
        this.decided.delete(pc.slot); // la place sera de nouveau tirée (même résultat) au retour du joueur
      }
      this.taken.delete(pc.slot);
      this.byVehicle.delete(v.id);
      this.list[i] = this.list[this.list.length - 1]!;
      this.list.pop();
    }
    // places réservées loin du joueur : tirées de nouveau (même résultat) à son retour, comme les voitures retirées
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]!;
      if (k.distToFocus2(g.x, g.z) <= far * far) continue;
      this.decided.delete(g.slot);
      this.ghosts[i] = this.ghosts[this.ghosts.length - 1]!;
      this.ghosts.pop();
    }
  }

  private touched(pc: ParkedCar): boolean {
    const v = pc.v;
    if (v.state !== 'ok' || v.health < 99.5 || v.burning > 0 || v.engineOn || v.brain != null) return true;
    const dx = v.x - pc.x;
    const dz = v.z - pc.z;
    if (dx * dx + dz * dz > 0.16) return true;
    for (let i = 0; i < v.seats.length; i++) if (v.seats[i] !== 0) return true;
    return false;
  }

  /** Garnit les places d'une couronne autour du joueur. */
  private scan(ring: number, cap: number, budget: number): void {
    const k = this.k;
    const c = k.cache;
    const ctx = k.ctx;
    const rMin = RINGS[ring]!;
    const rMax = Math.min(RINGS[ring + 1]!, k.tuning.parkedRadius);
    if (rMax <= rMin) return;
    const nodes = this.nodes;
    const n = c.nodesInRadius(k.focusX, k.focusZ, rMax, nodes);
    const density = Math.min(1.5, k.tuning.parkedDensity * k.sessionParked);
    const min2 = rMin * rMin;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      if (k.distToFocus2(c.nodeX[node]!, c.nodeZ[node]!) < min2) continue;
      for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
        const e = c.adjEdge[j]!;
        if (c.edgeA[e] !== node || !this.eligible(e)) continue;
        const count = this.layout(e);
        for (let s = 0; s < count * 2; s++) {
          const index = s >> 1;
          const side = (s & 1) === 0 ? 1 : -1;
          const key = this.key(e, index, side);
          if (this.decided.has(key)) continue;
          const h = hash2(hash2(e, s), this.seed);
          if ((h % 1000) / 1000 >= OCCUPANCY * density) {
            this.decided.add(key);
            continue;
          }
          if (this.list.length + this.ghosts.length >= cap || spawned >= budget) return;
          const kind = this.kindFor(h);
          const def = ctx.vehicles.def(kind);
          const halfW = (def ? def.width : 1.8) * 0.5;
          this.pose(e, index, side, halfW);
          const x = this.poseX;
          const z = this.poseZ;
          if (!ctx.world.isLoaded(x, z)) continue; // tuile pas encore chargée : on y reviendra
          // pas d'apparition sous les yeux du joueur une fois la partie lancée
          if (!this.prewarm && k.distToFocus2(x, z) < 110 * 110 && k.visible(x, z)) continue;
          this.decided.add(key);
          if (!this.placeable(x, z, halfW)) continue;
          if (this.isReserved(x, z)) {
            // stationnement réservé d'un commissariat : la place reste vide, mais compte comme garnie
            this.ghosts.push({ slot: key, x, z });
            spawned++;
            continue;
          }
          const v = ctx.vehicles.spawn(kind, x, z, this.poseH, { color: CAR_COLORS[(h >>> 10) % CAR_COLORS.length]! });
          this.register(v, key);
          spawned++;
        }
      }
    }
  }

  private kindFor(h: number): VehicleKind {
    let total = 0;
    for (let i = 0; i < PARKED_MIX.length; i++) total += PARKED_MIX[i]!.weight;
    let roll = ((h >>> 4) % 997) / 997 * total;
    for (let i = 0; i < PARKED_MIX.length; i++) {
      roll -= PARKED_MIX[i]!.weight;
      if (roll <= 0) return PARKED_MIX[i]!.kind;
    }
    return 'voiture';
  }

  /**
   * Places réservées des commissariats, retenues seulement quand la carte chargée est celle de Paris (toutes les
   * portes dans l'emprise) : sur le quartier d'essai, les coordonnées de Paris ne veulent rien dire.
   */
  private reservedZone(): ReservedZone | null {
    if (this.reserved !== undefined) return this.reserved;
    const b = this.k.ctx.world.bounds;
    let inside = !!b && b.maxX - b.minX >= 3000;
    for (const c of COMMISSARIATS) {
      if (!inside) break;
      inside = c.door.x >= b.minX && c.door.x <= b.maxX && c.door.z >= b.minZ && c.door.z <= b.maxZ;
    }
    if (!inside) {
      this.reserved = null;
      return null;
    }
    const bays = reservedBays();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of bays) {
      if (r.x < minX) minX = r.x;
      if (r.x > maxX) maxX = r.x;
      if (r.z < minZ) minZ = r.z;
      if (r.z > maxZ) maxZ = r.z;
    }
    this.reserved = { bays, minX: minX - RESERVED_CLEAR, maxX: maxX + RESERVED_CLEAR, minZ: minZ - RESERVED_CLEAR, maxZ: maxZ + RESERVED_CLEAR };
    return this.reserved;
  }

  /** Le point est-il sur le stationnement réservé d'un commissariat (à moins de RESERVED_CLEAR d'une place) ? */
  isReserved(x: number, z: number): boolean {
    const r = this.reservedZone();
    if (!r || x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) return false;
    const lim = RESERVED_CLEAR * RESERVED_CLEAR;
    for (const bay of r.bays) {
      const dx = bay.x - x;
      const dz = bay.z - z;
      if (dx * dx + dz * dz < lim) return true;
    }
    return false;
  }

  /** La place est-elle praticable et libre ? (chaussée, pas dans un obstacle, ni véhicule ni mobilier, ni réservée) */
  private free(x: number, z: number, halfW: number): boolean {
    return !this.isReserved(x, z) && this.placeable(x, z, halfW);
  }

  /** La place est-elle praticable et libre, stationnement réservé mis à part ? */
  private placeable(x: number, z: number, halfW: number): boolean {
    const ctx = this.k.ctx;
    const surface = ctx.world.surfaceAt(x, z);
    if (surface !== 'road' && surface !== 'sett' && surface !== 'void') return false;
    if (!ctx.world.isFree(x, z, halfW)) return false;
    if (ctx.vehicles.queryRadius(x, z, 2.4, this.near) > 0) return false;
    const n = ctx.props.queryRadius(x, z, 2.2, this.props);
    for (let i = 0; i < n; i++) if (this.props[i]!.blocksMove) return false;
    return true;
  }

  private register(v: Vehicle, slot: number): ParkedCar {
    v.engineOn = false;
    v.locked = true;
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    v.cmd.handbrake = true;
    const pc = new ParkedCar(v);
    pc.slot = slot;
    pc.x = v.x;
    pc.z = v.z;
    this.list.push(pc);
    this.byVehicle.set(v.id, pc);
    if (slot >= 0) this.taken.add(slot);
    return pc;
  }

  /** Véhicule garé à la demande (mission, test). */
  spawnParked(kind: VehicleKind, x: number, z: number, heading: number): Vehicle {
    const v = this.k.ctx.vehicles.spawn(kind, x, z, heading);
    this.register(v, -1);
    return v;
  }

  // ───────────────────────────── automobilistes qui se garent ─────────────────────────────

  /**
   * Propose une place à un automobiliste arrivé à destination : devant lui, de son côté, avec la place
   * précédente libre pour la manœuvre. true s'il a commencé à se garer.
   */
  offer(b: CarBrain): boolean {
    const k = this.k;
    const c = k.cache;
    const v = b.v;
    const road = this.road;
    if (!k.ctx.world.nearestRoad(v.x, v.z, road, 10)) return false;
    const e = road.edgeId;
    if (e < 0 || e >= c.edgeCount || !this.eligible(e)) return false;
    const count = this.layout(e);
    if (count === 0) return false;
    // la manœuvre (alignement, parfois une marche arrière) demande une rue calme : personne qui roule alentour
    const near = this.near;
    const n = k.ctx.vehicles.queryRadius(v.x, v.z, 35, near);
    for (let i = 0; i < n; i++) if (near[i] !== v && Math.abs(near[i]!.speed) > 0.5) return false;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    const len = c.edgeLen[e]!;
    const farA = (c.nodeFlags[c.edgeA[e]!]! & N_JUNCTION) !== 0 ? 30 : 0;
    const farB = (c.nodeFlags[c.edgeB[e]!]! & N_JUNCTION) !== 0 ? 30 : 0;
    for (let s = 0; s < count * 2; s++) {
      const index = s >> 1;
      const side = (s & 1) === 0 ? 1 : -1;
      const key = this.key(e, index, side);
      if (this.taken.has(key)) continue;
      // loin des carrefours : on ne manœuvre pas là où d'autres attendent ou tournent
      const at = this.slotStart + (index + 0.5) * PARK_SLOT;
      if (at < farA || at > len - farB) continue;
      this.pose(e, index, side, b.halfW);
      const sx = Math.sin(this.poseH);
      const sz = Math.cos(this.poseH);
      if (sx * hx + sz * hz < 0.6) continue; // place de l'autre sens
      const ahead = (this.poseX - v.x) * hx + (this.poseZ - v.z) * hz;
      if (ahead < 9 || ahead > 45) continue;
      // les deux places voisines doivent être vides : il se présente par l'une, et le pilote automatique
      // n'est pas assez précis pour se glisser entre deux voitures
      if (index > 0 && this.taken.has(this.key(e, index - 1, side))) continue;
      if (index + 1 < count && this.taken.has(this.key(e, index + 1, side))) continue;
      if (!this.free(this.poseX, this.poseZ, b.halfW)) continue;
      if (!this.cars.park(b, key, this.poseX, this.poseZ, this.poseH)) return false;
      this.taken.add(key);
      this.decided.add(key);
      return true;
    }
    return false;
  }

  release(slot: number): void {
    if (slot >= 0) this.taken.delete(slot);
  }

  /** L'automobiliste est garé : il descend et s'en va à pied ; son véhicule rejoint le stationnement. */
  settle(b: CarBrain): void {
    const k = this.k;
    const ctx = k.ctx;
    const v = b.v;
    const driver = ctx.people.get(b.driverId);
    this.cars.emit(b, 'gare');
    this.cars.forget(b, false);
    if (driver && driver.vehicleId === v.id) {
      if (ctx.vehicles.exit(driver)) {
        if (k.peds) k.peds.adopt(driver, false, v.x, v.z);
      } else {
        // portière bloquée : il reste au volant, moteur coupé
        this.taken.delete(b.parkSlot);
        return;
      }
    }
    this.taken.delete(b.parkSlot);
    this.register(v, b.parkSlot);
  }
}
