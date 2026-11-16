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

import type { EntityId, Vehicle } from '@/core/contracts';
import { angleDiff } from '@/core/math';
import type { AutopilotApi, AutopilotStatus, ConvoyOptions, DriveOptions, ParkLayout } from './api';
import { ApDriver, DEFAULT_SPEED } from './autopilot-drive';
import { ApSensor } from './autopilot-sense';
import { ApState } from './autopilot-state';
import { IDLE_STATUS } from './runtime';
import type { VehicleKernel, VehicleRt } from './runtime';

export class Autopilot implements AutopilotApi {
  private readonly driver: ApDriver;
  private readonly scratch: number[] = [];

  constructor(private readonly k: VehicleKernel) {
    this.driver = new ApDriver(k, new ApSensor(k));
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
    this.driver.setStatus(rt, ap, 'en_route', '');
  }

  // ───────────────────────────── itinéraires ─────────────────────────────

  /** Calcule l'itinéraire du véhicule jusqu'au point. false si aucun chemin. */
  private plan(rt: VehicleRt, ap: ApState, x: number, z: number, axisStart = false): boolean {
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
      let fromAxis = false;
      if (count >= 3) {
        const sx = buf[2]! - v.x;
        const sz = buf[3]! - v.z;
        if (sx * sx + sz * sz < 100) {
          const hx = Math.sin(v.heading);
          const hz = Math.cos(v.heading);
          const fwd = sx * hx + sz * hz;
          // (et l'itinéraire part dans son sens de marche : pas de demi-tour à faire)
          const nx = buf[4]! - buf[2]!;
          const nz = buf[5]! - buf[3]!;
          const nl = Math.sqrt(nx * nx + nz * nz);
          const ahead = nl > 1 && (nx * hx + nz * hz) / nl > 0.7;
          // Accroche à côté du véhicule (il roule sur la chaussée, à moins de 4 m de l'axe, à sa hauteur) : l'itinéraire part de
          // l'axe, et le décalage de voie partira de l'écart réel du véhicule à l'axe (voir driveTo). Parti de sa
          // position, il ajouterait au contraire son décalage à celui qu'il a déjà et roulerait contre le trottoir
          // jusqu'au carrefour suivant.
          const from = axisStart && ahead && fwd > -3 && fwd < 3 && sx * sx + sz * sz < 16 ? 0 : 1;
          fromAxis = from === 0;
          for (let i = from; i < count - 1; i++) {
            buf[i * 2] = buf[i * 2 + 2]!;
            buf[i * 2 + 1] = buf[i * 2 + 3]!;
          }
          count--;
        }
      }
      if (!fromAxis) {
        buf[0] = v.x;
        buf[1] = v.z;
      }
      ap.fromAxis = fromAxis;
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
    // (départ de l'axe : sur demande, pour un véhicule qui roule déjà sur sa voie — circulation civile)
    if (!this.plan(rt, ap, x, z, options?.inLane === true)) {
      ap.mode = 'idle';
      rt.apActive = false;
      this.driver.setStatus(rt, ap, 'echec', 'sans_itineraire');
      return false;
    }
    ap.cruise = options?.speed !== undefined && options.speed > 0 ? options.speed : 0;
    ap.urgence = options?.urgence === true;
    ap.stopBefore = options?.stopBefore !== undefined && options.stopBefore > 0 ? options.stopBefore : 0;
    ap.pushThrough = options?.pushThrough === true;
    ap.kerb = options?.kerb !== undefined && options.kerb > 0 ? options.kerb : 0;
    if (ap.fromAxis && ap.n >= 2) {
      // l'itinéraire part de l'axe : le décalage de voie part de l'écart réel du véhicule à cet axe (pas d'écart
      // brusque vers le milieu de la chaussée à chaque nouvel ordre)
      const p = ap.path;
      const dx = p[2]! - p[0]!;
      const dz = p[3]! - p[1]!;
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l > 0.01) {
        const lat = ((v.x - p[0]!) * -dz + (v.z - p[1]!) * dx) / l;
        ap.laneOffset = lat > 6 ? 6 : lat < -6 ? -6 : lat;
      }
    }
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
    this.driver.setStatus(rt, ap, 'manoeuvre', '');
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
    this.driver.setStatus(rt, ap, 'en_route', '');
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
      this.driver.finish(rt, ap, 'echec', 'hors_service');
      rt.apActive = false;
      return;
    }
    // le joueur a pris le volant : le pilote automatique lui rend la main sans freiner
    const driverId = rt.driverId;
    if (driverId !== 0) {
      const driver = this.k.ctx.people.get(driverId);
      if (driver && driver.isPlayer) {
        ap.mode = 'idle';
        rt.apActive = false;
        v.indicator = 0;
        this.driver.setStatus(rt, ap, 'repos', '');
        return;
      }
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
        this.driver.finish(rt, ap, 'repos', '');
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
      this.driver.reverseOut(rt, ap, dt);
      return;
    }
    this.driver.drive(rt, ap, dt);
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
      this.driver.finish(rt, ap, 'echec', 'meneur_perdu');
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
        this.driver.finish(rt, ap, 'echec', 'sans_itineraire');
        rt.apActive = false;
        return false;
      }
    } else if (d2 > 1.5 * 1.5) {
      ap.append(lx, lz);
      if (ap.seg > 24) ap.trim();
    }
    return true;
  }

}
