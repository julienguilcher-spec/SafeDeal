/* =====================================================================================
 * Monter, descendre, conduire : sièges, portes, règles d'accès et gestionnaires d'interaction.
 *
 *   - enter() / exit() du contrat (aucune règle d'accès : les scripts de mission et l'interpellation
 *     doivent pouvoir asseoir n'importe qui) ; les RÈGLES s'appliquent dans les gestionnaires
 *     d'interaction 'monter', 'conduire', 'descendre' et sont lisibles par canBoard() / canDrive() ;
 *   - choix du siège : rôle de la personne (conducteur, opérateur, passager de moto) puis porte la
 *     plus proche ; un PNJ sans poste de conducteur laisse le volant libre tant qu'il reste une place ;
 *   - un véhicule de police ou de secours n'est pas utilisable par qui n'en est pas, sauf épave ouverte ;
 *   - occupants recalés à chaque pas sur leur siège : posture 'seated', haut du corps 'drive' / 'ride' ;
 *   - sortie du côté de la porte, sur le premier point libre (ni mur, ni véhicule, ni mobilier) ;
 *   - un véhicule en feu ou réduit à l'état d'épave est évacué par ses occupants valides.
 * ===================================================================================== */

import type {
  EntityId, InteractionHandler, InteractionOption, InteractVerb, Person, SeatRole, Vec2, Vehicle,
} from '@/core/contracts';
import { distSqPointObb } from '@/core/math';
import { SEAT_FEET_DROP } from './api';
import type { DamageSystem } from './damage';
import { countOccupants, OCCUPANT_MASS } from './runtime';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Distance à l'emprise d'un véhicule en deçà de laquelle on peut y monter (m). */
const REACH = 2.0;
/** Durée d'ouverture d'une porte après un passage (s), et temps qu'elle met à s'ouvrir. */
const DOOR_TIME = 1.4;
const DOOR_SWING = 0.3;

const ROLE_LABEL: Record<SeatRole, string> = { driver: 'conducteur', gunner: 'opérateur', passenger: 'passager' };

function option(verb: InteractVerb): InteractionOption {
  return { verb, targetKind: 'vehicle', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
}

export class SeatSystem {
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly probe: Vec2 = { x: 0, z: 0 };
  private readonly near: Vehicle[] = [];
  /** Siège retenu au début d'une interaction 'monter' / 'conduire', par personne. */
  private readonly pending = new Map<EntityId, number>();
  /** Participants au retournement pendant le pas courant, par véhicule. */
  private readonly flippers = new Map<EntityId, EntityId[]>();

  constructor(private readonly k: VehicleKernel, private readonly damage: DamageSystem) {}

  reset(): void {
    this.pending.clear();
    this.flippers.clear();
  }

  // ───────────────────────────── géométrie des sièges ─────────────────────────────

  /** Point de sortie d'un siège dans le monde. */
  private doorPoint(v: Vehicle, seat: number, out: Vec2): void {
    const s = v.def.seats[seat]!;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    out.x = v.x - cs * s.exitX + sn * s.exitZ;
    out.z = v.z + sn * s.exitX + cs * s.exitZ;
  }

  private doorDistSq(p: Person, v: Vehicle, seat: number): number {
    this.doorPoint(v, seat, this.tmp);
    const dx = p.x - this.tmp.x;
    const dz = p.z - this.tmp.z;
    return dx * dx + dz * dz;
  }

  /** Le disque est-il libre de tout obstacle (décor, véhicules, mobilier) ? */
  private spotFree(x: number, z: number, radius: number): boolean {
    const ctx = this.k.ctx;
    if (!ctx.world.isFree(x, z, radius)) return false;
    const probe = this.probe;
    probe.x = x;
    probe.z = z;
    if (this.k.store.resolveCircle(probe, radius)) return false;
    probe.x = x;
    probe.z = z;
    return !ctx.props.resolveCircle(probe, radius);
  }

  /** Cherche un point de sortie libre autour de la porte du siège ; écrit le point retenu dans `out`. */
  private findExit(v: Vehicle, rt: VehicleRt, seat: number, radius: number, out: Vec2): void {
    const s = v.def.seats[seat];
    const ex = s ? s.exitX : -(rt.halfW + 0.65);
    const ez = s ? s.exitZ : 0;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const side = Math.abs(ex) > 0.3;
    const sideX = rt.halfW + 0.65;
    const end = ez < 0 ? -1 : 1;
    // candidats dans le repère du véhicule (x droite, z avant), du plus naturel au plus lointain
    for (let i = 0; i < 9; i++) {
      let cx = ex;
      let cz = ez;
      if (side) {
        // porte latérale : le long du flanc, plus loin, l'autre flanc, puis derrière et devant
        if (i === 1) cz = ez + 0.9;
        else if (i === 2) cz = ez - 0.9;
        else if (i === 3) cx = ex * 1.7;
        else if (i === 4) cx = -ex;
        else if (i === 5) { cx = -ex; cz = ez - 0.9; }
        else if (i === 6) { cx = 0; cz = -(rt.halfL + 0.8); }
        else if (i === 7) { cx = 0; cz = rt.halfL + 0.8; }
        else if (i === 8) cx = ex * 2.4;
      } else {
        // porte arrière (ou avant) : de part et d'autre, plus loin, puis les flancs
        if (i === 1) cx = ex + 0.8;
        else if (i === 2) cx = ex - 0.8;
        else if (i === 3) cz = ez + end * 0.9;
        else if (i === 4) { cx = sideX; cz = end * (rt.halfL - 0.5); }
        else if (i === 5) { cx = -sideX; cz = end * (rt.halfL - 0.5); }
        else if (i === 6) { cx = sideX; cz = 0; }
        else if (i === 7) { cx = -sideX; cz = 0; }
        else if (i === 8) cz = ez + end * 1.8;
      }
      const x = v.x - cs * cx + sn * cz;
      const z = v.z + sn * cx + cs * cz;
      if (this.spotFree(x, z, radius)) {
        out.x = x;
        out.z = z;
        return;
      }
    }
    // aucun point libre : on sort tout de même, repoussé hors du décor
    out.x = v.x - cs * ex + sn * ez;
    out.z = v.z + sn * ex + cs * ez;
    this.k.ctx.world.resolveCircle(out, radius);
  }

  // ───────────────────────────── règles d'accès ─────────────────────────────

  canBoard(p: Person, v: Vehicle): boolean {
    if (v.dormant || v.state === 'burning' || v.state === 'burnt') return false;
    const rt = this.k.rt(v);
    if (rt.flight && rt.flight.mode !== 'pose') return false;
    if (rt.flipped) return false;
    const wreck = v.state === 'wrecked';
    if (v.faction === 'police' && p.faction !== 'police') return wreck; // épave ouverte seulement
    if (v.faction === 'rescue' && p.faction !== 'rescue' && p.faction !== 'police') return wreck;
    if (v.locked && !wreck) return p.faction === v.faction && (v.faction === 'police' || v.faction === 'rescue');
    return true;
  }

  canDrive(p: Person, v: Vehicle): boolean {
    if (!this.canBoard(p, v)) return false;
    if (v.state !== 'ok' && v.state !== 'damaged') return false;
    const rt = this.k.rt(v);
    if (rt.driverSeat < 0) return false;
    const occupant = v.seats[rt.driverSeat]!;
    return occupant === 0 || occupant === p.id;
  }

  /** Rôle que la personne cherche d'abord, d'après son poste. */
  private wantedRole(p: Person): SeatRole | null {
    if (p.poste === 'conducteur' || p.poste === 'pilote_moto' || p.kind === 'conducteur') return 'driver';
    if (p.poste === 'operateur') return 'gunner';
    if (p.poste === 'passager_moto') return 'passenger';
    return null;
  }

  /** Siège que prendrait cette personne : rôle d'abord, puis porte la plus proche. −1 si aucun. */
  chooseSeat(p: Person, v: Vehicle): number {
    const defs = v.def.seats;
    const seats = v.seats;
    const want = this.wantedRole(p);
    let best = -1;
    let bestD = Infinity;
    if (want) {
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] !== 0 || defs[i]!.role !== want) continue;
        const d = this.doorDistSq(p, v, i);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) return best;
    }
    // le joueur prend la porte la plus proche, quelle qu'elle soit ; un PNJ laisse le volant et la
    // tourelle à ceux dont c'est le poste tant qu'il reste une autre place
    const free = p.isPlayer;
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] !== 0) continue;
        if (!free && pass === 0 && defs[i]!.role !== 'passenger') continue;
        const d = this.doorDistSq(p, v, i);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  // ───────────────────────────── monter / descendre ─────────────────────────────

  enter(p: Person, v: Vehicle, seat?: number | SeatRole): boolean {
    if (this.k.store.get(v.id) !== v) return false;
    if (p.vehicleId !== 0 && p.vehicleId !== v.id) return false; // descendre d'abord de l'autre véhicule
    const seats = v.seats;
    const defs = v.def.seats;
    if (p.vehicleId === v.id && typeof seat !== 'number') {
      const current = defs[p.seat];
      if (seat === undefined || (current && current.role === seat)) return true;
    }
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
    const rt = this.k.rt(v);
    if (p.vehicleId === v.id) {
      if (p.seat === target) return true;
      if (p.seat >= 0 && seats[p.seat] === p.id) seats[p.seat] = 0; // changement de place
    }
    seats[target] = p.id;
    p.vehicleId = v.id;
    p.seat = target;
    p.posture = 'seated';
    p.upper = target === rt.driverSeat ? 'drive' : 'ride';
    p.upperT = 0;
    p.cmd.moveX = 0;
    p.cmd.moveZ = 0;
    rt.occupants = countOccupants(v);
    rt.mass = v.def.mass + rt.occupants * OCCUPANT_MASS;
    this.openDoor(rt, target, DOOR_TIME);
    this.k.wake(rt);
    this.place(rt);
    if (target === rt.driverSeat && !v.engineOn && (v.state === 'ok' || v.state === 'damaged') && !rt.flipped && !rt.flight) {
      v.engineOn = true; // contact
    }
    this.k.ctx.events.emit('vehicle:entered', { vehicleId: v.id, personId: p.id, seat: target });
    return true;
  }

  exit(p: Person): boolean {
    if (p.vehicleId === 0) return false;
    const ctx = this.k.ctx;
    const v = this.k.store.get(p.vehicleId);
    const vehicleId = p.vehicleId;
    const seat = p.seat;
    if (v) {
      const frt = this.k.rt(v).flight;
      if (frt && frt.mode !== 'pose') return false; // on ne quitte pas un appareil en vol
    }
    p.vehicleId = 0;
    p.seat = -1;
    if (p.posture === 'seated') p.posture = 'stand';
    if (p.upper === 'drive' || p.upper === 'ride') {
      p.upper = 'none';
      p.upperT = 0;
    }
    if (!v) return false; // véhicule disparu : la personne est simplement libérée sur place
    const rt = this.k.rt(v);
    if (seat >= 0 && v.seats[seat] === p.id) v.seats[seat] = 0;
    const out = this.tmp;
    this.findExit(v, rt, seat, p.radius, out);
    p.x = out.x;
    p.z = out.z;
    p.y = ctx.world.heightAt(out.x, out.z);
    // descendre en marche : on garde un peu de l'élan
    p.vx = v.vx * 0.5;
    p.vz = v.vz * 0.5;
    rt.occupants = countOccupants(v);
    rt.mass = v.def.mass + rt.occupants * OCCUPANT_MASS;
    this.openDoor(rt, seat, DOOR_TIME);
    this.k.wake(rt);
    if (seat === rt.driverSeat) {
      // le conducteur parti : commandes au neutre ; le moteur reste en marche gyrophares allumés (intervention)
      const c = v.cmd;
      c.throttle = 0;
      c.steer = 0;
      c.brake = 0;
      c.handbrake = false;
      c.horn = false;
      if (!rt.apActive && !v.beacons) v.engineOn = false;
    }
    ctx.events.emit('vehicle:exited', { vehicleId, personId: p.id });
    return true;
  }

  /** Recale les occupants sur leur siège. */
  place(rt: VehicleRt): void {
    const v = rt.v;
    const ctx = this.k.ctx;
    const defs = v.def.seats;
    const seats = v.seats;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    let stale = false;
    for (let i = 0; i < seats.length; i++) {
      const id = seats[i]!;
      if (id === 0) continue;
      const p = ctx.people.get(id);
      if (!p || p.vehicleId !== v.id) {
        seats[i] = 0;
        stale = true;
        continue;
      }
      const s = defs[i]!;
      p.x = v.x - cs * s.x + sn * s.z;
      p.z = v.z + sn * s.x + cs * s.z;
      p.y = v.y + s.y - SEAT_FEET_DROP;
      p.vx = v.vx;
      p.vz = v.vz;
      p.heading = v.heading;
      if (p.posture !== 'seated' && p.posture !== 'down') p.posture = 'seated';
      if (p.upper === 'none') p.upper = i === rt.driverSeat ? 'drive' : 'ride';
      const turret = rt.spec.seatTurret[i]!;
      if (turret >= 0 && !p.isPlayer) {
        p.aimYaw = v.heading - v.turretYaw[turret]!;
        p.aimPitch = v.turretPitch[turret]!;
      }
    }
    if (stale) {
      rt.occupants = countOccupants(v);
      rt.mass = v.def.mass + rt.occupants * OCCUPANT_MASS;
    }
  }

  /** Portes qui se referment, évacuation en cours. */
  update(rt: VehicleRt, dt: number): void {
    const doors = rt.doors;
    for (let i = 0; i < doors.length; i++) {
      if (doors[i]! > 0) doors[i] = doors[i]! > dt ? doors[i]! - dt : 0;
    }
    if (rt.evacT < 0) return;
    rt.evacT -= dt;
    if (rt.evacT > 0) return;
    // un occupant valide sort ; le suivant un instant plus tard
    const ctx = this.k.ctx;
    const seats = rt.v.seats;
    let left = 0;
    let done = false;
    for (let i = 0; i < seats.length; i++) {
      if (seats[i] === 0) continue;
      const p = ctx.people.get(seats[i]!);
      if (!p) continue;
      if (ctx.health.isIncapacitated(p)) continue; // il faudra venir le chercher
      if (!done) {
        ctx.interactions.cancel(p);
        done = this.exit(p);
        if (done) continue;
      }
      left++;
    }
    rt.evacT = left > 0 && done ? 0.45 : -1;
  }

  /** Ouvre la porte d'un siège pour `time` secondes (une porte déjà ouverte le reste, sans rejouer l'ouverture). */
  private openDoor(rt: VehicleRt, seat: number, time: number): void {
    if (seat < 0 || seat >= rt.doors.length) return;
    const already = rt.doors[seat]! > 0 && rt.doorsFull[seat]! - rt.doors[seat]! >= DOOR_SWING;
    rt.doors[seat] = time;
    rt.doorsFull[seat] = already ? time + DOOR_SWING : time;
  }

  /** Ouverture de la porte d'un siège 0..1 : elle s'ouvre vite, reste ouverte, se referme sur la fin. */
  doorOpen(rt: VehicleRt, seat: number): number {
    const t = rt.doors[seat];
    if (t === undefined || t <= 0) return 0;
    const open = (rt.doorsFull[seat]! - t) / DOOR_SWING;
    const close = t / 0.4;
    return Math.max(0, Math.min(1, open, close));
  }

  // ───────────────────────────── gestionnaires d'interaction ─────────────────────────────

  private distToVehicle(p: Person, v: Vehicle): number {
    return Math.sqrt(distSqPointObb(p.x, p.z, v.x, v.z, v.def.width * 0.5, v.def.length * 0.5, v.heading));
  }

  private candidates(actor: Person, targetId: EntityId | undefined, reach: number): number {
    const near = this.near;
    if (targetId !== undefined && targetId !== 0) {
      const v = this.k.store.get(targetId);
      near.length = 0;
      if (v && !v.dormant && this.distToVehicle(actor, v) <= reach + 1) near.push(v);
      return near.length;
    }
    return this.k.store.queryRadius(actor.x, actor.z, reach, near);
  }

  private able(actor: Person): boolean {
    return actor.custody === 'free' && !this.k.ctx.health.isIncapacitated(actor);
  }

  createHandlers(): InteractionHandler[] {
    const k = this.k;
    const monter = option('monter');
    const conduire = option('conduire');
    const descendre = option('descendre');
    const renverser = option('renverser');

    const boardBegin = (actor: Person, opt: InteractionOption, driver: boolean): boolean => {
      const v = k.store.get(opt.targetId);
      if (!v || !this.able(actor)) return false;
      if (Math.abs(v.speed) > 1.5) return false;
      const rt = k.rt(v);
      let seat: number;
      if (driver) {
        if (!this.canDrive(actor, v)) return false;
        seat = rt.driverSeat;
      } else {
        if (!this.canBoard(actor, v)) return false;
        seat = this.chooseSeat(actor, v);
      }
      if (seat < 0) return false;
      this.pending.set(actor.id, seat);
      this.openDoor(rt, seat, DOOR_TIME + opt.duration);
      return true;
    };
    const boardTick = (actor: Person, opt: InteractionOption): boolean => {
      const v = k.store.get(opt.targetId);
      return !!v && Math.abs(v.speed) < 2 && (actor.vehicleId === v.id || this.distToVehicle(actor, v) < REACH + 1.5);
    };
    const boardComplete = (actor: Person, opt: InteractionOption): void => {
      const v = k.store.get(opt.targetId);
      let seat = this.pending.get(actor.id);
      this.pending.delete(actor.id);
      if (!v) return;
      if (seat === undefined || (v.seats[seat] !== 0 && v.seats[seat] !== actor.id)) seat = this.chooseSeat(actor, v);
      if (seat >= 0) this.enter(actor, v, seat);
    };
    const boardCancel = (actor: Person): void => {
      this.pending.delete(actor.id);
    };

    return [
      {
        verb: 'monter',
        find: (actor: Person, targetId?: EntityId): InteractionOption | null => {
          if (actor.vehicleId !== 0 || !this.able(actor)) return null;
          const n = this.candidates(actor, targetId, REACH);
          let best: Vehicle | null = null;
          let bestSeat = -1;
          let bestD = Infinity;
          for (let i = 0; i < n; i++) {
            const v = this.near[i]!;
            if (Math.abs(v.speed) > 1.5 || !this.canBoard(actor, v)) continue;
            const seat = this.chooseSeat(actor, v);
            if (seat < 0) continue;
            const d = this.doorDistSq(actor, v, seat);
            if (d < bestD) {
              bestD = d;
              best = v;
              bestSeat = seat;
            }
          }
          if (!best) return null;
          this.doorPoint(best, bestSeat, this.tmp);
          monter.targetId = best.id;
          monter.label = `Monter (${ROLE_LABEL[best.def.seats[bestSeat]!.role]}) — ${best.def.name}`;
          monter.priority = 50;
          monter.duration = k.rt(best).spec.boardTime;
          monter.x = this.tmp.x;
          monter.z = this.tmp.z;
          return monter;
        },
        begin: (actor, opt) => boardBegin(actor, opt, false),
        tick: boardTick,
        complete: boardComplete,
        cancel: boardCancel,
      },
      {
        verb: 'conduire',
        find: (actor: Person, targetId?: EntityId): InteractionOption | null => {
          if (!this.able(actor)) return null;
          if (actor.vehicleId !== 0) {
            // déjà à bord : prendre le volant, à l'arrêt
            const v = k.store.get(actor.vehicleId);
            if (!v || (targetId !== undefined && targetId !== 0 && targetId !== v.id)) return null;
            const rt = k.rt(v);
            if (rt.driverSeat < 0 || actor.seat === rt.driverSeat || v.seats[rt.driverSeat] !== 0) return null;
            if (Math.abs(v.speed) > 0.5 || !this.canDrive(actor, v)) return null;
            conduire.targetId = v.id;
            conduire.label = `Prendre le volant — ${v.def.name}`;
            conduire.priority = 40;
            conduire.duration = 1.5;
            conduire.x = actor.x;
            conduire.z = actor.z;
            return conduire;
          }
          const n = this.candidates(actor, targetId, REACH);
          let best: Vehicle | null = null;
          let bestD = Infinity;
          for (let i = 0; i < n; i++) {
            const v = this.near[i]!;
            if (Math.abs(v.speed) > 1.5 || !this.canDrive(actor, v)) continue;
            const d = this.doorDistSq(actor, v, k.rt(v).driverSeat);
            if (d < bestD) {
              bestD = d;
              best = v;
            }
          }
          if (!best) return null;
          const rt = k.rt(best);
          this.doorPoint(best, rt.driverSeat, this.tmp);
          conduire.targetId = best.id;
          conduire.label = `Conduire — ${best.def.name}`;
          // devant la portière du conducteur, « conduire » passe avant « monter »
          conduire.priority = bestD < 1.3 * 1.3 ? 55 : 45;
          conduire.duration = rt.spec.boardTime;
          conduire.x = this.tmp.x;
          conduire.z = this.tmp.z;
          return conduire;
        },
        begin: (actor, opt) => boardBegin(actor, opt, true),
        tick: boardTick,
        complete: boardComplete,
        cancel: boardCancel,
      },
      {
        verb: 'descendre',
        find: (actor: Person, targetId?: EntityId): InteractionOption | null => {
          if (actor.vehicleId === 0 || !this.able(actor)) return null;
          const v = k.store.get(actor.vehicleId);
          if (!v || (targetId !== undefined && targetId !== 0 && targetId !== v.id)) return null;
          const rt = k.rt(v);
          if (Math.abs(v.speed) > 1.5 || (rt.flight && rt.flight.mode !== 'pose')) return null;
          descendre.targetId = v.id;
          descendre.label = `Descendre — ${v.def.name}`;
          descendre.priority = 60;
          descendre.duration = rt.spec.boardTime * 0.6;
          descendre.x = actor.x;
          descendre.z = actor.z;
          return descendre;
        },
        begin: (actor, opt): boolean => {
          const v = k.store.get(opt.targetId);
          if (!v || actor.vehicleId !== v.id || Math.abs(v.speed) > 1.5) return false;
          const rt = k.rt(v);
          this.openDoor(rt, actor.seat, DOOR_TIME + opt.duration);
          return true;
        },
        tick: (actor, opt): boolean => actor.vehicleId === opt.targetId,
        complete: (actor): void => {
          this.exit(actor);
        },
      },
      {
        verb: 'renverser',
        find: (actor: Person, targetId?: EntityId): InteractionOption | null => {
          if (actor.vehicleId !== 0 || !this.able(actor)) return null;
          // proposé spontanément aux seuls manifestants ; les autres passent par une cible explicite (IA, scripts)
          if ((targetId === undefined || targetId === 0) && actor.faction !== 'protest') return null;
          const n = this.candidates(actor, targetId, 1.6);
          let best: Vehicle | null = null;
          let bestD = Infinity;
          for (let i = 0; i < n; i++) {
            const v = this.near[i]!;
            if (!this.damage.canFlip(k.rt(v))) continue;
            const d = this.distToVehicle(actor, v);
            if (d < bestD) {
              bestD = d;
              best = v;
            }
          }
          if (!best) return null;
          renverser.targetId = best.id;
          renverser.label = `Renverser à plusieurs — ${best.def.name}`;
          renverser.priority = 12;
          // l'effort dure tant que le groupe pousse ; la bascule dépend du nombre de bras
          renverser.duration = k.tuning.flipSeconds * 4;
          renverser.x = best.x;
          renverser.z = best.z;
          return renverser;
        },
        begin: (actor, opt): boolean => {
          const v = k.store.get(opt.targetId);
          return !!v && this.damage.canFlip(k.rt(v)) && this.distToVehicle(actor, v) < 2.4;
        },
        tick: (actor, opt): boolean => {
          const v = k.store.get(opt.targetId);
          if (!v) return false;
          const rt = k.rt(v);
          if (!this.damage.canFlip(rt) || this.distToVehicle(actor, v) > 2.6) return false;
          this.damage.pushFlip(rt, actor);
          this.notePusher(v.id, actor.id);
          actor.upper = 'push';
          return true;
        },
        complete: (actor): void => {
          if (actor.upper === 'push') actor.upper = 'none';
        },
        cancel: (actor): void => {
          if (actor.upper === 'push') actor.upper = 'none';
        },
      },
    ];
  }

  private notePusher(vehicleId: EntityId, personId: EntityId): void {
    let list = this.flippers.get(vehicleId);
    if (!list) {
      list = [];
      this.flippers.set(vehicleId, list);
    }
    if (list.indexOf(personId) < 0) list.push(personId);
  }

  /** Le véhicule vient d'être retourné : chaque participant répond d'une dégradation. */
  onFlipped(vehicleId: EntityId, x: number, z: number): void {
    const list = this.flippers.get(vehicleId);
    if (!list) return;
    const ctx = this.k.ctx;
    for (let i = 0; i < list.length; i++) {
      const p = ctx.people.get(list[i]!);
      if (p && p.faction !== 'police') ctx.law.recordOffense(p, 'degradation', x, z, 3);
    }
    this.flippers.delete(vehicleId);
  }
}
