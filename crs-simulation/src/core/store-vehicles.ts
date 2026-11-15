/* =====================================================================================
 * Magasin des véhicules (VehicleApi) — données, sièges et géométrie ; la conduite, la physique
 * et l'armement sont l'affaire du module des véhicules.
 *
 *   - table de définitions vide et extensible : registerDef() / registerDefs() ;
 *     spawn() d'un type sans définition utilise un gabarit générique (berline) non enregistré ;
 *   - sièges : enter() / exit() tiennent à jour Vehicle.seats, Person.vehicleId, Person.seat et
 *     la posture, et émettent vehicle:entered / vehicle:exited ;
 *   - repère des sièges (contrat) : x vers la droite du véhicule, z vers l'avant ;
 *   - emprise : boîte orientée de demi-dimensions (width / 2, length / 2) ; les engins volants
 *     ne bloquent ni les déplacements ni les lancers de rayon ;
 *   - queryRadius() retient les véhicules dont l'emprise touche le disque demandé.
 * ===================================================================================== */

import type {
  DamageInfo, EntityId, Faction, GameContext, Person, RayHit, SeatRole, Vec2, Vehicle, VehicleApi,
  VehicleDef, VehicleKind, VehicleState,
} from './contracts';
import { circleVsObb, distSqPointObb, segmentVsObb, vehicleToWorldX, vehicleToWorldZ } from './math';
import type { SegmentCast } from './math';
import { hash2 } from './rng';

/** Magasin de base : contrat VehicleApi + enregistrement des définitions. */
export interface VehicleStore extends VehicleApi {
  /** Ajoute une définition, ou remplace celle du même `kind`. */
  registerDef(def: VehicleDef): void;
  registerDefs(defs: readonly VehicleDef[]): void;
}

/** Gabarit générique (berline 5 places) pour un type de véhicule sans définition enregistrée. */
export function genericVehicleDef(kind: VehicleKind): VehicleDef {
  const side = 0.9 + 0.6;
  return {
    kind,
    name: 'Véhicule',
    faction: 'civil',
    length: 4.4,
    width: 1.8,
    height: 1.5,
    mass: 1300,
    wheelbase: 2.6,
    maxSpeed: 36,
    maxReverse: 8,
    accel: 3,
    brake: 8,
    maxSteer: 0.6,
    seats: [
      { role: 'driver', x: -0.38, y: 0.5, z: 0.3, exitX: -side, exitZ: 0.3 },
      { role: 'passenger', x: 0.38, y: 0.5, z: 0.3, exitX: side, exitZ: 0.3 },
      { role: 'passenger', x: -0.38, y: 0.5, z: -0.6, exitX: -side, exitZ: -0.6 },
      { role: 'passenger', x: 0.38, y: 0.5, z: -0.6, exitX: side, exitZ: -0.6 },
      { role: 'passenger', x: 0, y: 0.5, z: -0.6, exitX: side, exitZ: -1.2 },
    ],
    turrets: [],
    armored: false,
    canPush: false,
    hasSiren: false,
    hasBeacons: false,
    color: 0x8a8f96,
    flying: false,
  };
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTVWXYZ';

/** Immatriculation fictive au format français « AB-123-CD », déterministe pour un identifiant donné. */
export function plateFor(seed: number): string {
  let h = hash2(seed, 0x51ed);
  const n = PLATE_LETTERS.length;
  const a = PLATE_LETTERS[h % n]!;
  h = Math.floor(h / n);
  const b = PLATE_LETTERS[h % n]!;
  h = hash2(seed, 0x9a17);
  const digits = String(h % 1000).padStart(3, '0');
  h = Math.floor(h / 1000);
  const c = PLATE_LETTERS[h % n]!;
  h = Math.floor(h / n);
  const d = PLATE_LETTERS[h % n]!;
  return `${a}${b}-${digits}-${c}${d}`;
}

class VehicleStoreImpl implements VehicleStore {
  readonly list: Vehicle[] = [];
  readonly defs: VehicleDef[] = [];
  private readonly byId = new Map<EntityId, Vehicle>();
  private readonly defByKind = new Map<string, VehicleDef>();
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly cast: SegmentCast = { t: 0, nx: 0, nz: 0 };

  constructor(private readonly ctx: GameContext) {}

  registerDef(def: VehicleDef): void {
    const existing = this.defByKind.get(def.kind);
    if (existing) {
      const i = this.defs.indexOf(existing);
      if (i >= 0) this.defs[i] = def;
    } else {
      this.defs.push(def);
    }
    this.defByKind.set(def.kind, def);
  }

  registerDefs(defs: readonly VehicleDef[]): void {
    for (let i = 0; i < defs.length; i++) this.registerDef(defs[i]!);
  }

  def(kind: VehicleKind): VehicleDef | undefined {
    return this.defByKind.get(kind);
  }

  get(id: EntityId): Vehicle | undefined {
    return this.byId.get(id);
  }

  spawn(kind: VehicleKind, x: number, z: number, heading: number, opts?: { color?: number; faction?: Faction }): Vehicle {
    const ctx = this.ctx;
    const def = this.defByKind.get(kind) ?? genericVehicleDef(kind);
    const id = ctx.newId();
    const turrets = def.turrets.length;
    const v: Vehicle = {
      id,
      kind,
      def,
      faction: opts?.faction ?? def.faction,
      x,
      y: ctx.world.heightAt(x, z),
      z,
      heading,
      pitch: 0,
      roll: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      speed: 0,
      yawRate: 0,
      steerAngle: 0,
      rpm: 0,
      gear: 0,
      health: 100,
      state: 'ok',
      burning: 0,
      siren: 0,
      beacons: false,
      headlights: false,
      indicator: 0,
      braking: false,
      seats: new Array<EntityId>(def.seats.length).fill(0),
      turretYaw: new Array<number>(turrets).fill(0),
      turretPitch: new Array<number>(turrets).fill(0),
      turretAmmo: def.turrets.map((t) => t.capacity),
      color: opts?.color ?? def.color,
      plate: plateFor(hash2(seedOf(ctx), id)),
      locked: false,
      engineOn: false,
      cmd: { throttle: 0, steer: 0, brake: 0, handbrake: false, horn: false, lift: 0, strafe: 0 },
      brain: null,
      dormant: false,
    };
    this.list.push(v);
    this.byId.set(id, v);
    ctx.events.emit('vehicle:spawned', { id });
    return v;
  }

  remove(id: EntityId): void {
    const v = this.byId.get(id);
    if (!v) return;
    this.eject(v);
    this.byId.delete(id);
    const idx = this.list.indexOf(v);
    if (idx >= 0) {
      this.list[idx] = this.list[this.list.length - 1]!;
      this.list.pop();
    }
    this.ctx.events.emit('vehicle:removed', { id });
  }

  clear(): void {
    const all = this.list.slice();
    for (let i = 0; i < all.length; i++) this.eject(all[i]!);
    this.list.length = 0;
    this.byId.clear();
    for (let i = 0; i < all.length; i++) this.ctx.events.emit('vehicle:removed', { id: all[i]!.id });
  }

  queryRadius(x: number, z: number, r: number, out: Vehicle[]): number {
    let n = 0;
    const list = this.list;
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.dormant) continue;
      if (distSqPointObb(x, z, v.x, v.z, v.def.width * 0.5, v.def.length * 0.5, v.heading) > r2) continue;
      if (n < out.length) out[n] = v;
      else out.push(v);
      n++;
    }
    if (out.length > n) out.length = n;
    return n;
  }

  enter(p: Person, v: Vehicle, seat?: number | SeatRole): boolean {
    if (this.byId.get(v.id) !== v) return false;
    if (p.vehicleId !== 0 && p.vehicleId !== v.id) return false; // il faut d'abord descendre de l'autre véhicule
    const seats = v.seats;
    const defs = v.def.seats;
    let target = -1;
    if (typeof seat === 'number') {
      if (seat >= 0 && seat < seats.length && (seats[seat] === 0 || seats[seat] === p.id)) target = seat;
    } else {
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] !== 0) continue;
        if (seat !== undefined && defs[i]!.role !== seat) continue;
        target = i;
        break;
      }
    }
    if (target < 0) return false;
    if (p.vehicleId === v.id) {
      if (p.seat === target) return true;
      if (p.seat >= 0 && seats[p.seat] === p.id) seats[p.seat] = 0; // changement de place
    }
    seats[target] = p.id;
    p.vehicleId = v.id;
    p.seat = target;
    p.posture = 'seated';
    p.x = v.x;
    p.z = v.z;
    p.y = v.y;
    p.vx = 0;
    p.vz = 0;
    p.heading = v.heading;
    this.ctx.events.emit('vehicle:entered', { vehicleId: v.id, personId: p.id, seat: target });
    return true;
  }

  exit(p: Person): boolean {
    if (p.vehicleId === 0) return false;
    const v = this.byId.get(p.vehicleId);
    const vehicleId = p.vehicleId;
    const seat = p.seat;
    p.vehicleId = 0;
    p.seat = -1;
    if (p.posture === 'seated') p.posture = 'stand';
    if (!v) return false; // véhicule disparu : la personne est simplement libérée sur place
    if (seat >= 0 && v.seats[seat] === p.id) v.seats[seat] = 0;
    const def = v.def.seats[seat];
    const ex = def ? def.exitX : -(v.def.width * 0.5 + 0.6);
    const ez = def ? def.exitZ : 0;
    const tmp = this.tmp;
    tmp.x = v.x + vehicleToWorldX(ex, ez, v.heading);
    tmp.z = v.z + vehicleToWorldZ(ex, ez, v.heading);
    this.ctx.world.resolveCircle(tmp, p.radius);
    p.x = tmp.x;
    p.z = tmp.z;
    p.y = this.ctx.world.heightAt(tmp.x, tmp.z);
    p.vx = 0;
    p.vz = 0;
    this.ctx.events.emit('vehicle:exited', { vehicleId, personId: p.id });
    return true;
  }

  damage(v: Vehicle, d: DamageInfo): void {
    if (!(d.amount > 0)) return;
    v.health = v.health - d.amount;
    if (v.health < 0) v.health = 0;
    let next: VehicleState = v.state;
    if (v.state === 'ok' || v.state === 'damaged') {
      next = v.health <= 0 ? 'wrecked' : v.health < 50 ? 'damaged' : v.state;
    }
    if (next !== v.state) {
      v.state = next;
      this.ctx.events.emit('vehicle:state', { id: v.id, state: next });
    }
  }

  fireTurret(v: Vehicle, turret: number, byId: EntityId): boolean {
    if (turret < 0 || turret >= v.def.turrets.length) return false;
    if (!(v.turretAmmo[turret]! > 0)) return false;
    v.turretAmmo[turret] = v.turretAmmo[turret]! - 1;
    this.ctx.events.emit('vehicle:turret_fired', { id: v.id, turret, byId });
    return true;
  }

  resolveCircle(pos: Vec2, radius: number, ignoreId: EntityId = 0): boolean {
    let hit = false;
    const list = this.list;
    const tmp = this.tmp;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.dormant || v.id === ignoreId || v.def.flying) continue;
      const hx = v.def.width * 0.5;
      const hz = v.def.length * 0.5;
      const reach = radius + hx + hz;
      const dx = pos.x - v.x;
      const dz = pos.z - v.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (circleVsObb(pos.x, pos.z, radius, v.x, v.z, hx, hz, v.heading, tmp)) {
        pos.x += tmp.x;
        pos.z += tmp.z;
        hit = true;
      }
    }
    return hit;
  }

  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
    let bestT = 2;
    let best: Vehicle | null = null;
    let nx = 0;
    let nz = 0;
    const list = this.list;
    const cast = this.cast;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.dormant || v.def.flying) continue;
      if (segmentVsObb(ax, az, bx, bz, v.x, v.z, v.def.width * 0.5, v.def.length * 0.5, v.heading, cast) && cast.t < bestT) {
        bestT = cast.t;
        best = v;
        nx = cast.nx;
        nz = cast.nz;
      }
    }
    if (!best) {
      out.hit = false;
      out.t = 1;
      out.x = bx;
      out.z = bz;
      out.nx = 0;
      out.nz = 0;
      out.kind = 'none';
      out.id = 0;
      out.height = 0;
      return false;
    }
    out.hit = true;
    out.t = bestT;
    out.x = ax + (bx - ax) * bestT;
    out.z = az + (bz - az) * bestT;
    out.nx = nx;
    out.nz = nz;
    out.kind = 'vehicle';
    out.id = best.id;
    out.height = best.def.height;
    return true;
  }

  /** Fait descendre tous les occupants (avant un retrait). */
  private eject(v: Vehicle): void {
    for (let i = 0; i < v.seats.length; i++) {
      const pid = v.seats[i]!;
      if (pid === 0) continue;
      const p = this.ctx.people.get(pid);
      if (p && p.vehicleId === v.id) this.exit(p);
      v.seats[i] = 0;
    }
  }
}

function seedOf(ctx: GameContext): number {
  const s = (ctx.rng as { seed?: unknown }).seed;
  return typeof s === 'number' ? s : 0;
}

export function createVehicleStore(ctx: GameContext): VehicleStore {
  return new VehicleStoreImpl(ctx);
}
