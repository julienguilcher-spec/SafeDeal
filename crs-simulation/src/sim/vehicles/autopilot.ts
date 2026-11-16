/* =====================================================================================
 * Pilote automatique réutilisable — service 'vehicles.autopilot'.
 *
 *   driveTo  itinéraire ctx.world.findPath (mode 'vehicle'), suivi en « poursuite pure » en tenant sa
 *            voie (décalage à droite de l'axe sur une voie à double sens), allure = limite de la voie,
 *            ralentissement avant chaque virage selon son angle, arrêt planifié à destination ;
 *   follow   suit un meneur (véhicule ou personne) sur sa trace, à distance constante ;
 *   convoy   colonne : le premier conduit, chacun suit le précédent à intervalle régulier et tous
 *            s'arrêtent alignés ; la tête attend si la colonne s'étire ;
 *   park     approche, alignement sur l'axe de la place, et marche arrière de reprise si l'arrivée
 *            n'est pas droite (stationnement en bataille, en épi, en file : parkRow) ;
 *   stop     freine et rend la main.
 * Si l'itinéraire repart dans son dos, il fait demi-tour en plusieurs temps sans quitter la chaussée ; à un
 * carrefour où deux véhicules pilotés se font face, la priorité à droite départage.
 * Il freine devant personnes, véhicules, objets et murs (voir autopilot-sense.ts), s'arrête devant
 * une rue fermée (service EXT.traffic s'il est branché) sauf en intervention urgente, où il passe au
 * pas, sirène et feux allumés. Il écrit Vehicle.cmd : la physique fait le reste.
 * Le pilote automatique conduit même sans personne au volant (au module appelant d'asseoir un
 * conducteur s'il en veut un) ; il met le contact et rend un véhicule arrêté, frein serré.
 * ===================================================================================== */

import type { EntityId, RoadSample, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { angleDiff, clamp } from '@/core/math';
import { AUTOPILOT_EVENT } from './api';
import type {
  AutopilotApi, AutopilotReason, AutopilotState, AutopilotStatus, ConvoyOptions, DriveOptions, ParkLayout,
} from './api';
import { ApSensor } from './autopilot-sense';
import { ApState } from './autopilot-state';
import type { PathPoint } from './autopilot-state';
import { steerLimit } from './physics';
import { IDLE_STATUS } from './runtime';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Allure par défaut quand la voie n'en impose pas : 30 km/h, limite générale à Paris. */
const DEFAULT_SPEED = 30 / 3.6;
/** Distance à laquelle on commence à couper un virage (m) : fixe le rayon praticable. */
const CORNER_CUT = 5;
const SCAN_PERIOD = 0.15;

export class Autopilot implements AutopilotApi {
  private readonly sensor: ApSensor;
  private readonly pt: PathPoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly scratch: number[] = [];
  private readonly road: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };

  constructor(private readonly k: VehicleKernel) {
    this.sensor = new ApSensor(k);
  }

  private state(rt: VehicleRt): ApState {
    let ap = rt.ap as ApState | null;
    if (!ap) {
      ap = new ApState();
      rt.ap = ap;
    }
    return ap;
  }

  private usable(v: Vehicle): boolean {
    return !v.def.flying && (v.state === 'ok' || v.state === 'damaged') && this.k.store.get(v.id) === v;
  }

  private engage(rt: VehicleRt, ap: ApState, mode: ApState['mode']): void {
    const v = rt.v;
    ap.mode = mode;
    rt.apActive = true;
    rt.awake = true;
    v.engineOn = true;
    v.cmd.handbrake = false;
    this.setStatus(rt, ap, 'en_route', '');
  }

  private setStatus(rt: VehicleRt, ap: ApState, state: AutopilotState, reason: AutopilotReason): void {
    const s = ap.status;
    s.mode = ap.mode;
    s.state = state;
    s.reason = reason;
    s.leaderId = ap.leaderId;
    s.urgence = ap.urgence;
    const key = state + reason;
    if (key !== ap.lastState) {
      ap.lastState = key;
      this.k.ctx.events.emitAny(AUTOPILOT_EVENT, { id: rt.v.id, state, reason });
    }
  }

  /** Arrêt définitif d'un mode : frein serré, pilote au repos (mais l'état final reste lisible). */
  private finish(rt: VehicleRt, ap: ApState, state: AutopilotState, reason: AutopilotReason): void {
    const v = rt.v;
    const c = v.cmd;
    c.throttle = 0;
    c.steer = 0;
    c.brake = 1;
    c.handbrake = true;
    c.horn = false;
    v.indicator = 0;
    if (ap.urgence && v.siren !== 0) v.siren = 0;
    ap.mode = 'idle';
    this.setStatus(rt, ap, state, reason);
    ap.status.targetSpeed = 0;
  }

  // ───────────────────────────── itinéraires ─────────────────────────────

  /** Calcule l'itinéraire du véhicule jusqu'au point. false si aucun chemin. */
  private plan(rt: VehicleRt, ap: ApState, x: number, z: number): boolean {
    const v = rt.v;
    const world = this.k.ctx.world;
    const buf = this.scratch;
    let count = 0;
    let endInLane = false;
    if (world.findPath(v.x, v.z, x, z, 'vehicle', buf) && buf.length >= 4) {
      count = buf.length >> 1;
      // points d'accroche à la chaussée : inutiles s'ils sont tout près du départ ou de l'arrivée
      if (count >= 4) {
        const ex = buf[count * 2 - 4]! - x;
        const ez = buf[count * 2 - 3]! - z;
        // destination posée sur l'axe de la rue : « quelque part ici », donc sur sa voie
        endInLane = ex * ex + ez * ez < 1;
        if (ex * ex + ez * ez < 100) {
          buf[count * 2 - 4] = x;
          buf[count * 2 - 3] = z;
          count--;
        }
      }
      if (count >= 3) {
        const sx = buf[2]! - v.x;
        const sz = buf[3]! - v.z;
        if (sx * sx + sz * sz < 100) {
          for (let i = 1; i < count - 1; i++) {
            buf[i * 2] = buf[i * 2 + 2]!;
            buf[i * 2 + 1] = buf[i * 2 + 3]!;
          }
          count--;
        }
      }
      buf[0] = v.x;
      buf[1] = v.z;
    } else {
      // pas de réseau : tout droit si le point est proche et visible
      const dx = x - v.x;
      const dz = z - v.z;
      if (dx * dx + dz * dz > 120 * 120 || !world.lineOfSight(v.x, v.z, x, z)) return false;
      buf[0] = v.x;
      buf[1] = v.z;
      buf[2] = x;
      buf[3] = z;
      count = 2;
    }
    ap.setPath(buf, count);
    ap.axisUntil = ap.total;
    ap.endInLane = endInLane;
    ap.closureT = 0;
    ap.closureS = -1;
    return ap.n >= 2;
  }

  // ───────────────────────────── API ─────────────────────────────

  driveTo(v: Vehicle, x: number, z: number, options?: DriveOptions): boolean {
    if (!this.usable(v)) return false;
    const rt = this.k.rt(v);
    const ap = this.state(rt);
    ap.resetRun();
    if (!this.plan(rt, ap, x, z)) {
      ap.mode = 'idle';
      rt.apActive = false;
      this.setStatus(rt, ap, 'echec', 'sans_itineraire');
      return false;
    }
    ap.cruise = options?.speed !== undefined && options.speed > 0 ? options.speed : 0;
    ap.urgence = options?.urgence === true;
    ap.stopBefore = options?.stopBefore !== undefined && options.stopBefore > 0 ? options.stopBefore : 0;
    ap.pushThrough = options?.pushThrough === true;
    this.engage(rt, ap, 'drive');
    return true;
  }

  follow(v: Vehicle, leaderId: EntityId, distance = 6): boolean {
    if (!this.usable(v) || leaderId === v.id) return false;
    const ctx = this.k.ctx;
    if (!ctx.vehicles.get(leaderId) && !ctx.people.get(leaderId)) return false;
    const rt = this.k.rt(v);
    const ap = this.state(rt);
    ap.resetRun();
    ap.leaderId = leaderId;
    ap.followDist = distance > 0.5 ? distance : 0.5;
    ap.setPath(this.scratch, 0);
    this.engage(rt, ap, 'follow');
    return true;
  }

  convoy(list: readonly Vehicle[], x: number, z: number, options?: ConvoyOptions): boolean {
    if (list.length === 0) return false;
    const head = list[0]!;
    const speed = options?.speed !== undefined && options.speed > 0 ? options.speed : DEFAULT_SPEED;
    if (!this.driveTo(head, x, z, { ...options, speed })) return false;
    const gap = options?.gap !== undefined && options.gap > 0 ? options.gap : 6;
    let prev = head;
    this.state(this.k.rt(head)).convoy = true;
    for (let i = 1; i < list.length; i++) {
      const v = list[i]!;
      if (!this.follow(v, prev.id, gap)) continue;
      const ap = this.state(this.k.rt(v));
      ap.convoy = true;
      ap.urgence = options?.urgence === true;
      ap.cruise = speed * 1.35; // de quoi recoller à la colonne
      this.state(this.k.rt(prev)).behindId = v.id;
      prev = v;
    }
    return true;
  }

  park(v: Vehicle, x: number, z: number, heading: number): boolean {
    if (!this.usable(v)) return false;
    const rt = this.k.rt(v);
    const ap = this.state(rt);
    ap.resetRun();
    const world = this.k.ctx.world;
    const hs = Math.sin(heading);
    const hc = Math.cos(heading);
    // point d'approche sur l'axe de la place ; s'il y a du champ derrière (place, parc de stationnement), on
    // s'aligne de plus loin pour arriver droit entre les voisins ; dans une rue, on se présente au plus court
    const back = Math.max(7, v.def.length * 1.4 + 2);
    const run = back + Math.max(8, v.def.length * 1.6);
    const farX = x - hs * run;
    const farZ = z - hc * run;
    let long = world.isFree(farX, farZ, rt.radius) && world.lineOfSight(farX, farZ, x, z);
    for (let attempt = 0; attempt < 2; attempt++) {
      const ax = long ? farX : x - hs * back;
      const az = long ? farZ : z - hc * back;
      const dx = ax - v.x;
      const dz = az - v.z;
      let planned = false;
      if (dx * dx + dz * dz > 15 * 15) planned = this.plan(rt, ap, ax, az);
      if (!planned) {
        const buf = this.scratch;
        buf[0] = v.x;
        buf[1] = v.z;
        buf[2] = ax;
        buf[3] = az;
        ap.setPath(buf, 2);
      }
      if (!long || ap.n < 2) break;
      // l'approche longue ne vaut que si l'on n'y arrive pas à contresens de la place (demi-tour serré)
      const ix = ap.path[ap.n * 2 - 2]! - ap.path[ap.n * 2 - 4]!;
      const iz = ap.path[ap.n * 2 - 1]! - ap.path[ap.n * 2 - 3]!;
      const turn = Math.abs(angleDiff(Math.atan2(ix, iz), heading));
      if (turn <= 2.2) break;
      long = false;
    }
    ap.axisUntil = 0;
    ap.append(x, z);
    ap.finalFrom = ap.n - 2;
    ap.parkX = x;
    ap.parkZ = z;
    ap.parkH = heading;
    ap.parkBack = back;
    ap.cruise = 4;
    this.engage(rt, ap, 'park');
    this.setStatus(rt, ap, 'manoeuvre', '');
    return true;
  }

  parkRow(list: readonly Vehicle[], x: number, z: number, heading: number, layout: ParkLayout = 'bataille', spacing?: number): boolean {
    const n = list.length;
    if (n === 0) return false;
    let width = 0;
    let length = 0;
    for (let i = 0; i < n; i++) {
      if (list[i]!.def.width > width) width = list[i]!.def.width;
      if (list[i]!.def.length > length) length = list[i]!.def.length;
    }
    const sn = Math.sin(heading);
    const cs = Math.cos(heading);
    let ok = true;
    let previous: Vehicle | null = null;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) * 0.5;
      let px = x;
      let pz = z;
      let h = heading;
      if (layout === 'file') {
        // l'un derrière l'autre, le premier en tête
        const pitch = length + (spacing ?? 2);
        px = x - sn * pitch * (i - (n - 1) * 0.5);
        pz = z - cs * pitch * (i - (n - 1) * 0.5);
      } else {
        // côte à côte le long de la perpendiculaire (gauche = (cos h, −sin h))
        const epi = layout === 'epi';
        const pitch = spacing ?? (epi ? (width + 0.9) / Math.cos(0.5236) : width + 0.9);
        px = x + cs * pitch * k;
        pz = z - sn * pitch * k;
        if (epi) h = heading - 0.5236; // en épi : 60° par rapport à l'allée
      }
      if (!this.park(list[i]!, px, pz, h)) {
        ok = false;
        continue;
      }
      // chacun son tour, en ordre : on attend que le précédent soit garé avant de s'engager
      if (previous) this.state(this.k.rt(list[i]!)).waitFor = previous.id;
      previous = list[i]!;
    }
    return ok;
  }

  stop(v: Vehicle): void {
    const rt = this.k.peek(v.id);
    if (!rt || !rt.ap) return;
    const ap = rt.ap as ApState;
    if (ap.mode === 'idle') return;
    ap.mode = 'stop';
    this.setStatus(rt, ap, 'en_route', '');
  }

  status(v: Vehicle): Readonly<AutopilotStatus> {
    const rt = this.k.peek(v.id);
    return rt && rt.ap ? (rt.ap as ApState).status : IDLE_STATUS;
  }

  isActive(v: Vehicle): boolean {
    const rt = this.k.peek(v.id);
    return !!rt && rt.apActive;
  }

  // ───────────────────────────── mise à jour ─────────────────────────────

  update(rt: VehicleRt, dt: number): void {
    const ap = rt.ap as ApState | null;
    if (!ap || ap.mode === 'idle') return;
    const v = rt.v;
    if (v.state !== 'ok' && v.state !== 'damaged') {
      this.finish(rt, ap, 'echec', 'hors_service');
      rt.apActive = false;
      return;
    }
    rt.awake = true;
    if (ap.waitFor !== 0) {
      const w = this.k.peek(ap.waitFor);
      const wap = w ? (w.ap as ApState | null) : null;
      if (wap && wap.mode !== 'idle') {
        this.hold(v);
        return;
      }
      ap.waitFor = 0;
    }
    if (ap.mode === 'stop') {
      this.hold(v);
      if (Math.abs(v.speed) < 0.15) {
        this.finish(rt, ap, 'repos', '');
        rt.apActive = false;
      }
      return;
    }
    if (ap.mode === 'follow' && !this.trackLeader(rt, ap)) return;
    if (ap.n < 2) {
      this.hold(v);
      return;
    }
    if (ap.mode === 'park' && ap.parkPhase === 2) {
      this.reverseOut(rt, ap, dt);
      return;
    }
    this.drive(rt, ap, dt);
  }

  private hold(v: Vehicle): void {
    const c = v.cmd;
    c.throttle = 0;
    c.brake = Math.abs(v.speed) > 0.3 ? 0.6 : 1;
    c.steer = 0;
    c.horn = false;
  }

  /** Tient l'itinéraire à jour derrière le meneur. false si le suivi s'arrête (meneur disparu). */
  private trackLeader(rt: VehicleRt, ap: ApState): boolean {
    const ctx = this.k.ctx;
    const v = rt.v;
    const lv = ctx.vehicles.get(ap.leaderId);
    const lp = lv ? undefined : ctx.people.get(ap.leaderId);
    if (!lv && !lp) {
      this.finish(rt, ap, 'echec', 'meneur_perdu');
      rt.apActive = false;
      return false;
    }
    const lx = lv ? lv.x : lp!.x;
    const lz = lv ? lv.z : lp!.z;
    if (ap.n < 2) {
      // première trace : par les rues si le meneur est loin, tout droit sinon
      const dx = lx - v.x;
      const dz = lz - v.z;
      if (dx * dx + dz * dz < 40 * 40 || !this.plan(rt, ap, lx, lz)) {
        const buf = this.scratch;
        buf[0] = v.x;
        buf[1] = v.z;
        buf[2] = lx;
        buf[3] = lz;
        ap.setPath(buf, 2);
        ap.axisUntil = 0;
      }
      return true;
    }
    const ex = lx - ap.path[ap.n * 2 - 2]!;
    const ez = lz - ap.path[ap.n * 2 - 1]!;
    const d2 = ex * ex + ez * ez;
    if (d2 > 60 * 60) {
      // le meneur s'est téléporté ou a pris une avance énorme : nouvel itinéraire
      if (!this.plan(rt, ap, lx, lz)) {
        this.finish(rt, ap, 'echec', 'sans_itineraire');
        rt.apActive = false;
        return false;
      }
    } else if (d2 > 1.5 * 1.5) {
      ap.append(lx, lz);
      if (ap.seg > 24) ap.trim();
    }
    return true;
  }

  /** Suivi d'itinéraire : direction, allure, obstacles, arrivée. */
  private drive(rt: VehicleRt, ap: ApState, dt: number): void {
    const ctx = this.k.ctx;
    const v = rt.v;
    const def = v.def;
    const cmd = v.cmd;
    const u = v.speed;
    const au = u < 0 ? -u : u;
    ap.project(v.x, v.z);

    // ── voie : limite et décalage à droite de l'axe, relus de temps en temps ──
    ap.laneT -= dt;
    if (ap.laneT <= 0) {
      ap.laneT = 0.6;
      const world = ctx.world;
      if (world.edgeCount > 0 && world.nearestRoad(v.x, v.z, this.road, 15)) {
        const limit = world.edge(this.road.edgeId).speedLimit;
        ap.roadLimit = limit > 1 ? limit : DEFAULT_SPEED;
        ap.laneWant = this.road.oneway ? 0 : clamp(this.road.width * 0.25, 0, 3.2);
      } else {
        ap.roadLimit = DEFAULT_SPEED;
        ap.laneWant = 0;
      }
    }
    const laneStep = 1.2 * dt;
    if (ap.laneOffset < ap.laneWant) ap.laneOffset = Math.min(ap.laneWant, ap.laneOffset + laneStep);
    else if (ap.laneOffset > ap.laneWant) ap.laneOffset = Math.max(ap.laneWant, ap.laneOffset - laneStep);

    // ── rues fermées sur l'itinéraire ──
    ap.closureT -= dt;
    if (ap.closureT <= 0) {
      ap.closureT = 2;
      this.findClosure(ap);
    }

    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const finalLeg = ap.mode === 'park' && ap.seg >= ap.finalFrom;
    let remaining: number;
    let steerRight: number;

    if (finalLeg) {
      // ── alignement final sur l'axe de la place (commande de type Stanley, à l'essieu avant) ──
      if (ap.parkPhase === 0) {
        ap.parkPhase = 1;
        ap.phaseT = 0;
      }
      const hs = Math.sin(ap.parkH);
      const hc = Math.cos(ap.parkH);
      const a = def.wheelbase * 0.5;
      const fx = v.x + sn * a - ap.parkX;
      const fz = v.z + cs * a - ap.parkZ;
      const eLeft = fx * hc - fz * hs; // écart à gauche de l'axe
      const psi = angleDiff(v.heading, ap.parkH); // > 0 : il faut tourner à gauche
      const deltaLeft = psi - Math.atan((1.6 * eLeft) / (au + 1));
      steerRight = -deltaLeft;
      remaining = (ap.parkX - v.x) * hs + (ap.parkZ - v.z) * hc;
    } else {
      // ── poursuite pure d'un point de l'itinéraire, décalé sur la voie de droite ──
      const look = clamp(3 + 0.65 * au + def.wheelbase * 0.4, 4, 16);
      const sT = Math.min(ap.total, ap.s + look);
      const pt = this.pt;
      ap.sample(sT, pt);
      // l'itinéraire repart dans mon dos : demi-tour en plusieurs temps plutôt qu'une grande boucle hors chaussée
      const turnErr = angleDiff(v.heading, Math.atan2(pt.dx, pt.dz));
      if (ap.uturn === 0 && au < 3 && (turnErr > 2 || turnErr < -2) && ap.total - ap.s > 6 && ap.mode !== 'follow') {
        ap.uturn = 1;
        ap.uturnDir = turnErr >= 0 ? 1 : -1;
        ap.uturnMoves = 0;
        ap.phaseT = 0;
      }
      if (ap.uturn !== 0) {
        if (this.uTurn(rt, ap, turnErr, dt)) return;
      }
      // décalage sur la voie de droite : seulement là où l'itinéraire suit l'axe des rues, et fondu aux extrémités
      const toEnd = ap.endInLane && ap.axisUntil >= ap.total ? 8 : ap.axisUntil - sT;
      const taper = clamp(Math.min(sT, toEnd) / 8, 0, 1);
      const off = ap.mode === 'park' ? 0 : ap.laneOffset * taper;
      // droite du sens de marche = (−dz, dx)
      const tx = pt.x - pt.dz * off;
      const tz = pt.z + pt.dx * off;
      const dx = tx - v.x;
      const dz = tz - v.z;
      const fwd = dx * sn + dz * cs;
      const left = dx * cs - dz * sn;
      const d2 = fwd * fwd + left * left;
      const kappa = d2 > 0.01 ? (2 * left) / d2 : 0;
      steerRight = -Math.atan(def.wheelbase * kappa);
      remaining = ap.total - ap.s - ap.stopBefore;
    }
    const limit = steerLimit(def, rt.spec.handling.steerSpeed, au);
    cmd.steer = clamp(steerRight / limit, -1, 1);

    // ── allure visée ──
    const grip = Math.min(1, rt.mu / 0.85);
    const aLat = (ap.urgence ? 3.2 : 2.0) * grip;
    const aDec = (ap.urgence ? 3.0 : 1.8) * grip;
    let vt = ap.cruise > 0 ? ap.cruise : ap.roadLimit;
    if (ap.urgence) vt = Math.max(vt * 1.5, 50 / 3.6);
    if (vt > def.maxSpeed * 0.9) vt = def.maxSpeed * 0.9;
    if (ap.mode === 'park' && remaining < 25) vt = Math.min(vt, finalLeg ? 2 : 3);

    // virages à venir : chaque angle impose une vitesse au sommet, donc une vitesse maintenant
    const horizonS = ap.s + (au * au) / (2 * aDec) + 25;
    let turn = 0;
    let turnSign = 0;
    let turnDist = Infinity;
    for (let j = ap.seg + 1; j < ap.n - 1 && ap.cum[j]! < horizonS; j++) {
      let theta = ap.turnAt(j);
      // sommets rapprochés : un seul virage
      while (j + 1 < ap.n - 1 && ap.cum[j + 1]! - ap.cum[j]! < 6) {
        j++;
        theta += ap.turnAt(j);
      }
      const at = theta < 0 ? -theta : theta;
      if (at < 0.06) continue;
      const radius = Math.max(def.wheelbase / Math.tan(def.maxSteer) + 1, CORNER_CUT / Math.tan(Math.min(at, 2.6) * 0.5));
      const vc2 = aLat * radius;
      const d = ap.cum[j]! - ap.s - CORNER_CUT;
      const allowed = Math.sqrt(vc2 + 2 * aDec * (d > 0 ? d : 0));
      if (allowed < vt) vt = allowed;
      if (at > 0.4 && ap.cum[j]! - ap.s < turnDist) {
        turnDist = ap.cum[j]! - ap.s;
        turn = at;
        turnSign = theta > 0 ? -1 : 1; // clignotant : −1 gauche, 1 droite
      }
    }
    v.indicator = turn > 0 && turnDist < 30 ? (turnSign as -1 | 1) : 0;

    // arrêt à destination (ou derrière le meneur)
    let goal = remaining;
    let leaderSpeed = 0;
    if (ap.mode === 'follow') {
      const lv = ctx.vehicles.get(ap.leaderId);
      const lp = lv ? undefined : ctx.people.get(ap.leaderId);
      const half = lv ? lv.def.length * 0.5 : lp ? lp.radius : 0;
      // distance au meneur le long de sa trace, bout de trace non encore consigné compris
      const lx = lv ? lv.x : lp ? lp.x : v.x;
      const lz = lv ? lv.z : lp ? lp.z : v.z;
      const tx = lx - ap.path[ap.n * 2 - 2]!;
      const tz = lz - ap.path[ap.n * 2 - 1]!;
      goal = ap.total - ap.s + Math.sqrt(tx * tx + tz * tz) - rt.halfL - half - ap.followDist;
      if (lv) leaderSpeed = Math.max(0, lv.speed);
      else if (lp) leaderSpeed = Math.sqrt(lp.vx * lp.vx + lp.vz * lp.vz);
      // accordéon : on règle sa vitesse sur celle du meneur, corrigée de l'écart
      // et l'on anticipe ses freinages (une demi-seconde d'avance) pour ne pas venir mourir sur son pare-chocs
      const la = dt > 0 ? (leaderSpeed - ap.leadSpeed) / dt : 0;
      ap.leadAccel += (clamp(la, -8, 8) - ap.leadAccel) * Math.min(1, dt * 5);
      ap.leadSpeed = leaderSpeed;
      let want = leaderSpeed + ap.leadAccel * 0.5 + 0.8 * goal;
      if (goal < 0.25 && leaderSpeed < 0.3) want = 0; // à sa place derrière un meneur arrêté : on s'immobilise
      if (want < vt) vt = want;
      if (vt < 0) vt = 0;
    } else {
      const stop = Math.sqrt(2 * aDec * Math.max(0, goal - 0.25));
      if (stop < vt) vt = stop;
      if (goal > 0.25 && vt < 0.5) vt = 0.5;
    }
    // la tête de colonne attend si le suivant décroche
    if (ap.convoy && ap.behindId !== 0) {
      const b = this.k.peek(ap.behindId);
      if (b && b.ap) {
        const bap = b.ap as ApState;
        const dx = b.v.x - v.x;
        const dz = b.v.z - v.z;
        const lag = Math.sqrt(dx * dx + dz * dz) - rt.halfL - b.halfL - bap.followDist;
        if (bap.mode === 'follow' && lag > bap.followDist * 2.5) vt = Math.min(vt, Math.max(1, vt * 0.4));
      }
    }
    // rue fermée
    let closed = false;
    if (ap.closureS >= 0 && ap.closureS > ap.s - 2) {
      const d = ap.closureS - ap.s;
      if (ap.urgence) {
        if (d < 20) vt = Math.min(vt, 20 / 3.6); // on passe, au pas
      } else {
        const stop = Math.sqrt(2 * aDec * Math.max(0, d));
        if (stop < vt) vt = stop;
        closed = d < 1.5;
      }
    }

    // ── obstacles dans le couloir ──
    ap.scanT -= dt;
    if (ap.scanT <= 0) {
      ap.scanT = SCAN_PERIOD;
      // en fin de stationnement, on regarde juste devant soi : les voisins déjà garés ne sont pas des obstacles
      const horizon = finalLeg ? clamp(au * au / 4 + 2.5, 2.5, 8) : clamp((au * au) / (2 * 3) + 6 + au * 0.6, 6, 45);
      const kappa = Math.tan(-v.steerAngle) / def.wheelbase;
      this.sensor.scan(rt, ap, horizon, 1, kappa, finalLeg ? 0.12 : 0.35);
    } else if (ap.obsDist !== Infinity) {
      ap.obsDist -= (u - ap.obsSpeed) * dt; // entre deux relevés, l'écart évolue à la vitesse relative
    }
    let obstacle = false;
    // deux véhicules à l'arrêt l'un devant l'autre à un carrefour : priorité à droite (celui qui a l'autre sur sa
    // gauche passe, au pas) ; si personne ne bouge, le plus petit identifiant s'engage
    let priority = false;
    if (ap.obsReason === 'vehicule' && ap.obsWaiting && au < 0.3 && ap.obsDist !== Infinity) {
      ap.yieldT += dt;
      priority = ap.yieldT > 2 && (ap.obsLat > 1.2 || (ap.yieldT > 7 && v.id < ap.obsId));
    } else if (ap.obsReason !== 'vehicule' || au > 1 || ap.obsDist === Infinity) {
      ap.yieldT = 0;
    } else {
      priority = ap.yieldT > 2 && (ap.obsLat > 1.2 || (ap.yieldT > 7 && v.id < ap.obsId));
    }
    if (ap.obsDist !== Infinity) {
      const follows = ap.mode === 'follow' && ap.obsReason === 'vehicule';
      // marge laissée devant l'obstacle ; en fin de stationnement, on s'approche à quelques décimètres
      const gap = ap.obsReason === 'personne' ? (ap.urgence ? 1.8 : 2.5)
        : finalLeg ? 0.6
        : ap.obsReason === 'vehicule' ? (follows ? 1.5 : priority ? 0.7 : 2 + (ap.obsStatic ? 0.5 : 0.5 * au))
        : ap.obsReason === 'mur' ? 1.2 : 2;
      if (priority && vt > 2) vt = 2;
      const room = ap.obsDist - gap;
      const lead = ap.obsSpeed > 0 ? ap.obsSpeed : 0;
      const allowed = room > 0 ? lead + Math.sqrt(2 * (ap.urgence ? 4.5 : 3) * room) : 0;
      if (allowed < vt) {
        vt = allowed;
        obstacle = vt < 0.3;
      }
    }

    // ── décoincement : consigne d'avancer mais véhicule immobile ──
    if (ap.unstickT > 0) {
      ap.unstickT -= dt;
      cmd.throttle = -0.5;
      cmd.brake = 0;
      cmd.steer = -cmd.steer;
      cmd.handbrake = false;
      ap.status.targetSpeed = -1;
      return;
    }
    if (vt > 0.8 && au < 0.12) {
      ap.stuckT += dt;
      if (ap.stuckT > 2.5) {
        ap.stuckT = 0;
        if (++ap.unstickTries > 3) {
          this.finish(rt, ap, 'bloque', 'mur');
          rt.apActive = false;
          return;
        }
        ap.unstickT = 1.4;
      }
    } else {
      ap.stuckT = 0;
    }

    // ── commande de vitesse ──
    cmd.handbrake = false;
    if (vt <= 0.05) {
      cmd.throttle = 0;
      cmd.brake = au > 0.3 ? clamp(0.35 + au * 0.25, 0, 1) : 1;
    } else {
      const e = vt - u;
      // bande morte (roue libre) plus étroite à basse vitesse : les arrêts sont précis
      const band = 0.12 + 0.28 * (vt < 3 ? vt / 3 : 1);
      if (e > 0) {
        cmd.throttle = clamp(e * 0.9 + 0.08, 0, 1);
        cmd.brake = 0;
      } else if (e > -band) {
        cmd.throttle = 0;
        cmd.brake = 0;
      } else {
        cmd.throttle = 0;
        cmd.brake = clamp(-e * 0.4, 0.06, 1);
      }
    }
    ap.status.targetSpeed = vt;
    ap.status.remaining = goal > 0 ? goal : 0;

    // ── sirène et feux d'une intervention urgente ──
    if (ap.urgence && def.hasSiren && v.siren === 0) {
      v.siren = 1;
      v.beacons = true;
    }

    // ── états : arrivé, bloqué, en attente ──
    const stopped = au < 0.2;
    if (obstacle || closed) {
      if (stopped) ap.blockedFor += dt;
      const reason: AutopilotReason = closed && !obstacle ? 'fermeture' : ap.obsReason;
      const fixed = closed || ap.obsStatic;
      if (ap.mode === 'park' && stopped && fixed && ap.blockedFor > 2.5 && remaining < 20 && ap.parkTries < 3) {
        // gêné par un obstacle fixe tout près de la place : on recule dans l'axe pour se représenter droit
        ap.parkTries++;
        ap.parkPhase = 2;
        ap.phaseT = 0;
        ap.blockedFor = 0;
        ap.obsDist = Infinity;
        this.setStatus(rt, ap, 'manoeuvre', '');
        return;
      }
      this.setStatus(rt, ap, stopped && fixed && ap.blockedFor > 3 ? 'bloque' : 'attente', reason);
      // des personnes ne s'écartent pas : coup de klaxon
      ap.hornT -= dt;
      cmd.horn = false;
      if (stopped && ap.obsReason === 'personne' && ap.blockedFor > 2 && ap.hornT <= 0) {
        ap.hornT = ap.urgence ? 2 : 4;
        rt.hornT = 0.5;
      }
    } else {
      ap.blockedFor = 0;
      cmd.horn = false;
      if (ap.mode === 'follow') {
        const settled = au < 0.05 && goal < 0.3 && goal > -1.5 && leaderSpeed < 0.2;
        let state: AutopilotState = settled ? 'attente' : 'en_route';
        if (settled && ap.convoy) {
          // la colonne est arrivée quand sa tête l'est
          const lead = this.k.peek(ap.leaderId);
          const ls = lead && lead.ap ? (lead.ap as ApState).status.state : '';
          if (ls === 'arrive') state = 'arrive';
        }
        this.setStatus(rt, ap, state, '');
      } else if (goal <= 0.3 && stopped) {
        this.arrive(rt, ap);
        return;
      } else {
        this.setStatus(rt, ap, ap.mode === 'park' ? 'manoeuvre' : 'en_route', '');
      }
    }
    ap.status.blockedFor = ap.blockedFor;
  }

  /** Le point est-il sur une surface carrossable ? (un demi-tour ne monte pas sur le trottoir) */
  private drivable(x: number, z: number): boolean {
    const s = this.k.ctx.world.surfaceAt(x, z);
    return s === 'road' || s === 'bridge' || s === 'sett' || s === 'plaza' || s === 'quay' || s === 'void';
  }

  /**
   * Demi-tour en plusieurs temps : marche avant braquée à fond, puis marche arrière contre-braquée, jusqu'à
   * se retrouver dans le sens de l'itinéraire. Retourne false quand la manœuvre est finie.
   */
  private uTurn(rt: VehicleRt, ap: ApState, err: number, dt: number): boolean {
    const v = rt.v;
    const cmd = v.cmd;
    if ((err < 1 && err > -1) || ap.uturnMoves > 8) {
      ap.uturn = 0;
      ap.obsDist = Infinity;
      return false;
    }
    ap.phaseT += dt;
    const forward = ap.uturn === 1;
    const dir = forward ? 1 : -1;
    ap.scanT -= dt;
    if (ap.scanT <= 0) {
      ap.scanT = SCAN_PERIOD;
      this.sensor.scan(rt, ap, 4, dir, Math.tan(-v.steerAngle) / v.def.wheelbase, 0.2);
    }
    // bord de chaussée devant le pare-chocs (ou derrière, en reculant)
    const reach = rt.halfL + 0.8;
    const ex = v.x + Math.sin(v.heading) * reach * dir;
    const ez = v.z + Math.cos(v.heading) * reach * dir;
    const blocked = ap.obsDist < 1.1 || !this.drivable(ex, ez) || ap.phaseT > (forward ? 7 : 5);
    if (blocked && ap.phaseT > 0.6) {
      ap.uturn = forward ? 2 : 1;
      ap.uturnMoves++;
      ap.phaseT = 0;
      ap.obsDist = Infinity;
      ap.scanT = 0;
    }
    // tourner à gauche (cap croissant) : volant à gauche en avançant, à droite en reculant
    cmd.steer = -ap.uturnDir * dir;
    cmd.handbrake = false;
    cmd.horn = false;
    const target = forward ? 2 : -1.5;
    const e = target - v.speed;
    if (blocked) {
      cmd.throttle = 0;
      cmd.brake = 1;
    } else if (forward) {
      cmd.throttle = e > 0 ? clamp(e * 0.8 + 0.1, 0, 1) : 0;
      cmd.brake = e < -0.5 ? 0.4 : 0;
    } else {
      cmd.throttle = e < 0 ? clamp(e * 0.8 - 0.1, -1, 0) : 0;
      cmd.brake = e > 0.5 ? 0.4 : 0;
    }
    v.indicator = ap.uturnDir > 0 ? -1 : 1;
    ap.status.targetSpeed = target;
    this.setStatus(rt, ap, 'manoeuvre', '');
    return true;
  }

  /** Arrivée à destination ; pour un stationnement, contrôle de l'alignement et reprise éventuelle. */
  private arrive(rt: VehicleRt, ap: ApState): void {
    const v = rt.v;
    if (ap.mode === 'park') {
      const hs = Math.sin(ap.parkH);
      const hc = Math.cos(ap.parkH);
      const eLeft = (v.x - ap.parkX) * hc - (v.z - ap.parkZ) * hs;
      const psi = angleDiff(v.heading, ap.parkH);
      if ((Math.abs(eLeft) > 0.2 || Math.abs(psi) > 0.04) && ap.parkTries < 3) {
        // de travers : on recule dans l'axe et on recommence
        ap.parkTries++;
        ap.parkPhase = 2;
        ap.phaseT = 0;
        this.setStatus(rt, ap, 'manoeuvre', '');
        return;
      }
      v.engineOn = false;
    }
    this.finish(rt, ap, 'arrive', '');
    rt.apActive = false;
  }

  /** Marche arrière de reprise : on recule le long de l'axe de la place jusqu'au point d'approche. */
  private reverseOut(rt: VehicleRt, ap: ApState, dt: number): void {
    const v = rt.v;
    const def = v.def;
    const cmd = v.cmd;
    ap.phaseT += dt;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const hs = Math.sin(ap.parkH);
    const hc = Math.cos(ap.parkH);
    // essieu arrière et point visé 4 m plus loin en arrière, sur l'axe
    const b = def.wheelbase * 0.5;
    const rx = v.x - sn * b;
    const rz = v.z - cs * b;
    const along = (ap.parkX - rx) * hs + (ap.parkZ - rz) * hc;
    const tx = ap.parkX - hs * (along + 4);
    const tz = ap.parkZ - hc * (along + 4);
    const dx = tx - rx;
    const dz = tz - rz;
    const fwd = dx * sn + dz * cs;
    const left = dx * cs - dz * sn;
    const d2 = fwd * fwd + left * left;
    const kappa = d2 > 0.01 ? (2 * left) / d2 : 0;
    cmd.steer = clamp(-Math.atan(def.wheelbase * kappa) / def.maxSteer, -1, 1);
    cmd.handbrake = false;
    cmd.horn = false;
    // quelqu'un ou quelque chose derrière ?
    ap.scanT -= dt;
    if (ap.scanT <= 0) {
      ap.scanT = SCAN_PERIOD;
      this.sensor.scan(rt, ap, 5, -1, Math.tan(-v.steerAngle) / def.wheelbase, 0.2);
    }
    const blocked = ap.obsDist < 1.5;
    const done = along >= ap.parkBack * 0.9 || ap.phaseT > 12;
    if (done || blocked) {
      cmd.throttle = 0;
      cmd.brake = 1;
      if (Math.abs(v.speed) < 0.15 && (done || ap.phaseT > 6)) {
        // de nouveau face à la place : alignement final
        ap.parkPhase = 1;
        ap.seg = Math.max(0, ap.n - 2);
        ap.s = Math.max(ap.cum[ap.seg]!, ap.total - along - b);
        ap.obsDist = Infinity;
      }
    } else {
      const e = -1.2 - v.speed;
      cmd.throttle = e < 0 ? clamp(e * 0.8 - 0.1, -1, 0) : 0;
      cmd.brake = e > 0.4 ? 0.3 : 0;
    }
    ap.status.targetSpeed = -1.2;
    this.setStatus(rt, ap, 'manoeuvre', blocked ? ap.obsReason : '');
  }

  /** Cherche une rue fermée sur la suite de l'itinéraire ; renseigne ap.closureS (6 m avant le barrage). */
  private findClosure(ap: ApState): void {
    ap.closureS = -1;
    const traffic = this.k.ctx.service<TrafficControlApi>(EXT.traffic);
    if (!traffic || traffic.closures.length === 0) return;
    const closures = traffic.closures;
    const path = ap.path;
    let best = Infinity;
    for (let c = 0; c < closures.length; c++) {
      const cx = closures[c]!.x;
      const cz = closures[c]!.z;
      for (let i = ap.seg; i < ap.n - 1 && ap.cum[i]! < ap.s + 300; i++) {
        const ax = path[i * 2]!;
        const az = path[i * 2 + 1]!;
        const dx = path[i * 2 + 2]! - ax;
        const dz = path[i * 2 + 3]! - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 1e-9 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const ex = cx - (ax + dx * t);
        const ez = cz - (az + dz * t);
        if (ex * ex + ez * ez > 36) continue;
        const s = ap.cum[i]! + Math.sqrt(l2) * t;
        if (s > ap.s && s < best) best = s;
      }
    }
    if (best !== Infinity) ap.closureS = Math.max(ap.s, best - 6);
  }
}
