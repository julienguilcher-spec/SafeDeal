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

import type { EntityId, PathStartOptions, RayHit, RoadSample, Vehicle } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import { angleDiff } from '@/core/math';
import type { AutopilotApi, AutopilotStatus, ConvoyOptions, DriveOptions, ParkLayout } from './api';
import { ApDriver, DEFAULT_SPEED } from './autopilot-drive';
import { ApSensor } from './autopilot-sense';
import { ApState } from './autopilot-state';
import type { PathPoint } from './autopilot-state';
import { IDLE_STATUS } from './runtime';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Pénalité (m) d'un point de la trace du meneur situé dans le dos du suivant, quand il choisit où la rejoindre. */
const TRAIL_BEHIND = 25;
/** Points de la trace examinés (du moins coûteux au plus coûteux) pour en trouver un que l'on voit d'ici. */
const TRAIL_SIGHT_TRIES = 40;
/** Suivant garé : meneur à côté ou derrière lui en deçà duquel il attend ; meneur arrêté, garé en bloc ; « bloc » (m). */
const HOLD_NEAR = 42;
const HOLD_FAR = 90;
const HOLD_PACKED = 8.5;
/** Points gardés de la trace du meneur pendant l'attente. */
const HOLD_TRACE_MAX = 600;

export class Autopilot implements AutopilotApi {
  private readonly driver: ApDriver;
  private readonly scratch: number[] = [];
  private readonly keepBuf: number[] = [];
  private readonly footBuf: number[] = [];
  private readonly joinOrder: number[] = [];
  private readonly joinCost: number[] = [];
  private readonly joinHit: RayHit = makeRayHit();
  private readonly hit: RayHit = makeRayHit();
  /** Nouvel itinéraire après un demi-tour impossible : le demi-tour sur place est exclu. */
  private forceAround = false;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly start: PathStartOptions = { heading: 0, uturn: 0 };

  constructor(private readonly k: VehicleKernel) {
    this.driver = new ApDriver(k, new ApSensor(k));
    this.driver.replan = (rt, ap, around, blocked) => this.replan(rt, ap, around === true, blocked === true);
  }

  /**
   * Nouvel itinéraire vers la même destination depuis la position et le cap actuels, sans rien changer d'autre (allure,
   * urgence, place dans la colonne). false si aucun chemin (l'ancien est gardé).
   */
  private replan(rt: VehicleRt, ap: ApState, around = false, blocked = false): boolean {
    if (blocked) this.markBlocked(rt);
    if (ap.mode === 'follow') {
      // suivant : trace par les rues jusqu'au meneur, droit devant
      const ctx = this.k.ctx;
      const lv = ctx.vehicles.get(ap.leaderId);
      const lp = lv ? undefined : ctx.people.get(ap.leaderId);
      const l = lv ?? lp;
      if (!l) return false;
      this.forceAround = around;
      const ok = this.plan(rt, ap, l.x, l.z);
      this.forceAround = false;
      if (ok) ap.axisUntil = 0;
      return ok;
    }
    if (ap.mode !== 'drive' || ap.n < 2) return false;
    const x = ap.path[ap.n * 2 - 2]!;
    const z = ap.path[ap.n * 2 - 1]!;
    this.forceAround = around;
    const keep = this.keepBuf;
    keep.length = 0;
    for (let i = 0; i < ap.n * 2; i++) keep.push(ap.path[i]!);
    const n = ap.n;
    const axis = ap.axisUntil >= ap.total;
    const endInLane = ap.endInLane;
    const planned = this.plan(rt, ap, x, z);
    this.forceAround = false;
    if (!planned) {
      ap.setPath(keep, n);
      ap.axisUntil = axis ? ap.total : 0;
      ap.endInLane = endInLane;
      return false;
    }
    if (!axis) ap.axisUntil = 0;
    ap.uturn = 0;
    ap.obsDist = Infinity;
    return true;
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

  /**
   * Endroits où un véhicule est resté coincé contre un obstacle fixe sur son itinéraire (chaussée barrée par un mur,
   * un pilier, une grille — défauts de la carte) : évités par les itinéraires suivants pendant un quart d'heure.
   */
  private readonly blockedSpots: { x: number; z: number; r: number; cost: number; until: number }[] = [];
  private readonly pp: PathPoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly zoneBuf: { x: number; z: number; r: number; cost?: number }[] = [];

  private markBlocked(rt: VehicleRt): void {
    const v = rt.v;
    const now = this.k.ctx.clock.now;
    // sur l'itinéraire, un peu au-delà du point de blocage (s'il tourne là, c'est la rue où l'on voulait s'engager)
    const ap = rt.ap as ApState;
    let x = v.x + Math.sin(v.heading) * (rt.halfL + 4);
    let z = v.z + Math.cos(v.heading) * (rt.halfL + 4);
    let r = 4;
    if (ap && ap.n >= 2) {
      // l'itinéraire tourne juste après : c'est la rue où l'on s'engage qui est barrée (6 m après le carrefour) ;
      // sinon, le point de blocage lui-même
      let at = ap.s + rt.halfL + 6;
      for (let j = ap.seg + 1; j < ap.n - 1 && ap.cum[j]! < ap.s + rt.halfL + 20; j++) {
        const t = ap.turnAt(j);
        if (t > 0.5 || t < -0.5) {
          at = ap.cum[j]! + 6;
          r = 3;
          break;
        }
      }
      ap.sample(Math.min(ap.total, at), this.pp);
      x = this.pp.x;
      z = this.pp.z;
    }
    for (const b of this.blockedSpots) {
      if (Math.hypot(b.x - x, b.z - z) < 4) {
        b.until = now + 900;
        return;
      }
    }
    if (this.blockedSpots.length >= 48) this.blockedSpots.shift();
    this.blockedSpots.push({ x, z, r, cost: 1500, until: now + 900 });
  }

  /** Zones à éviter pour un itinéraire : celles du trajet (foule) et les endroits barrés. */
  private zones(ap: ApState): PathStartOptions['avoid'] {
    const now = this.k.ctx.clock.now;
    const spots = this.blockedSpots;
    for (let i = spots.length - 1; i >= 0; i--) if (spots[i]!.until < now) spots.splice(i, 1);
    if (spots.length === 0) return ap.avoidZones ?? undefined;
    const out = this.zoneBuf;
    out.length = 0;
    if (ap.avoidZones) for (const z of ap.avoidZones) out.push(z);
    for (const b of spots) out.push(b);
    return out;
  }

  /**
   * Coût (s de trajet) d'un demi-tour sur place pour ce véhicule dans cette rue : quasi nul sur une large avenue, une
   * manœuvre en trois temps si la chaussée est un peu plus large que le véhicule n'est long, prohibitif sinon (le
   * tour du pâté de maisons est alors préféré).
   */
  private uturnCost(v: Vehicle): number {
    const def = v.def;
    const world = this.k.ctx.world;
    if (world.edgeCount === 0 || !world.nearestRoad(v.x, v.z, this.road, 25)) return 30;
    const w = this.road.width;
    const r = def.wheelbase / Math.tan(def.maxSteer);
    if (w >= 2 * r + def.width + 1) return 8;
    if (w >= def.length + 3) return 35;
    return 200;
  }

  /** Calcule l'itinéraire du véhicule jusqu'au point. false si aucun chemin. */
  private plan(rt: VehicleRt, ap: ApState, x: number, z: number, axisStart = false, oriented = true): boolean {
    const v = rt.v;
    const world = this.k.ctx.world;
    const buf = this.scratch;
    let count = 0;
    let endInLane = false;
    // départ orienté : l'itinéraire part de préférence dans le sens où le véhicule est tourné (la circulation, qui
    // calcule elle-même l'itinéraire qu'elle confie au pilote, garde le calcul ordinaire)
    const start = oriented ? this.start : undefined;
    if (start) {
      start.heading = v.heading;
      start.uturn = this.forceAround ? 600 : this.uturnCost(v);
      start.avoid = this.zones(ap);
      // intervention urgente : un court sens unique peut être pris à contresens, au pas (voir ApDriver : allure)
      start.contraflow = ap.urgence ? 3 : 0;
      start.minWidth = v.def.width + 1.2;
    }
    if (world.findPath(v.x, v.z, x, z, 'vehicle', buf, start) && buf.length >= 4) {
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
          // véhicule à l'écart de l'axe (garé contre le trottoir) : il rejoint l'axe sept mètres devant lui au lieu de
          // longer la bordure jusqu'au carrefour suivant
          let merge = false;
          if (from === 1 && nl > 1) {
            const along = ((v.x - buf[2]!) * nx + (v.z - buf[3]!) * nz) / nl;
            const lat = Math.abs(((v.x - buf[2]!) * nz - (v.z - buf[3]!) * nx) / nl);
            const t = along + 7;
            if (lat > 0.8 && along > -4 && t > 0 && t < nl - 2) {
              buf[2] = buf[2]! + (nx / nl) * t;
              buf[3] = buf[3]! + (nz / nl) * t;
              merge = true;
            }
          }
          if (!merge) {
            for (let i = from; i < count - 1; i++) {
              buf[i * 2] = buf[i * 2 + 2]!;
              buf[i * 2 + 1] = buf[i * 2 + 3]!;
            }
            count--;
          }
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
    if (count >= 2 && world.edgeCount > 0) count = this.clearEnds(v, buf, count);
    ap.setPath(buf, count);
    ap.axisUntil = ap.total;
    ap.endInLane = endInLane;
    ap.closureT = 0;
    ap.closureS = -1;
    return ap.n >= 2;
  }

  /**
   * Le tronçon droit entre le véhicule et la rue la plus proche (ou entre la rue et une destination posée sur une
   * place) traverse-t-il un obstacle fixe — fontaine, statue, réverbère, grille ? On passe alors par les allées
   * (cheminement piéton, au pas : place de la Concorde, esplanades) au lieu de foncer droit dessus. Retourne le
   * nouveau nombre de points.
   */
  private clearEnds(v: Vehicle, buf: number[], count: number): number {
    const hw = v.def.width * 0.5 + 0.2;
    const world = this.k.ctx.world;
    const legClear = (ax: number, az: number, bx: number, bz: number): boolean => {
      const dx = bx - ax, dz = bz - az;
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l < 0.5) return true;
      const rx = -dz / l * hw, rz = dx / l * hw;
      const hit = this.hit;
      for (const k of [0, 1, -1]) {
        if (world.raycast(ax + rx * k, az + rz * k, bx + rx * k, bz + rz * k, hit) && hit.hit) return false;
      }
      // mobilier (réverbères, bornes, arbres : cercles que le rayon ne voit pas) et sol carrossable (pas de pelouse)
      const n = Math.ceil(l / 2);
      for (let i = 1; i < n; i++) {
        const x = ax + (dx * i) / n, z = az + (dz * i) / n;
        if (!world.isFree(x, z, hw - 0.1)) return false;
        const sf = world.surfaceAt(x, z);
        if (sf === 'park' || sf === 'gravel' || sf === 'water' || sf === 'building') return false;
      }
      return true;
    };
    const detour = (ax: number, az: number, bx: number, bz: number): number[] | null => {
      const foot = this.footBuf;
      if (!world.findPath(ax, az, bx, bz, 'foot', foot) || foot.length < 4) return null;
      let l = 0;
      for (let i = 2; i < foot.length; i += 2) {
        if (!legClear(foot[i - 2]!, foot[i - 1]!, foot[i]!, foot[i + 1]!)) return null;
        l += Math.hypot(foot[i]! - foot[i - 2]!, foot[i + 1]! - foot[i - 1]!);
      }
      return l < Math.hypot(bx - ax, bz - az) * 3 + 60 ? foot.slice() : null;
    };
    // départ
    if (count >= 2 && Math.hypot(buf[2]! - buf[0]!, buf[3]! - buf[1]!) > 4 && !legClear(buf[0]!, buf[1]!, buf[2]!, buf[3]!)) {
      const d = detour(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
      if (d) {
        const rest = buf.slice(4, count * 2);
        buf.length = 0;
        for (const x of d) buf.push(x);
        for (const x of rest) buf.push(x);
        count = buf.length >> 1;
      }
    }
    // arrivée
    if (count >= 2) {
      const i = (count - 2) * 2;
      if (Math.hypot(buf[i + 2]! - buf[i]!, buf[i + 3]! - buf[i + 1]!) > 4 && !legClear(buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!)) {
        const d = detour(buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!);
        if (d) {
          buf.length = i;
          for (const x of d) buf.push(x);
          count = buf.length >> 1;
        }
      }
    }
    return count;
  }

  // ───────────────────────────── API ─────────────────────────────

  driveTo(v: Vehicle, x: number, z: number, options?: DriveOptions): boolean {
    if (!this.usable(v)) return false;
    const rt = this.k.rt(v);
    const ap = this.state(rt);
    ap.resetRun();
    ap.avoidZones = options?.avoid && options.avoid.length > 0 ? options.avoid : null;
    ap.urgence = options?.urgence === true;
    // (départ de l'axe : sur demande, pour un véhicule qui roule déjà sur sa voie — circulation civile)
    if (!this.plan(rt, ap, x, z, options?.inLane === true, options?.inLane !== true)) {
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

  /**
   * `trail` (facultatif) : trace du meneur (x, z, x, z…, la plus récente en dernier) — le suivant la rejoint au plus près
   * (de préférence devant lui) et la parcourt, au lieu d'aller tout droit vers le meneur ou de chercher son propre
   * itinéraire par les rues : il passe là où le meneur est passé (sortie d'un stationnement en bloc, d'une place).
   */
  follow(v: Vehicle, leaderId: EntityId, distance = 6, trail?: readonly number[]): boolean {
    if (!this.usable(v) || leaderId === v.id) return false;
    const ctx = this.k.ctx;
    if (!ctx.vehicles.get(leaderId) && !ctx.people.get(leaderId)) return false;
    const rt = this.k.rt(v);
    const ap = this.state(rt);
    ap.resetRun();
    ap.leaderId = leaderId;
    ap.followDist = distance > 0.5 ? distance : 0.5;
    ap.setPath(this.scratch, 0);
    if (trail && trail.length >= 2) {
      this.joinTrail(rt, ap, trail);
      for (let i = 0; i < trail.length; i++) ap.trace.push(trail[i]!);
    }
    this.engage(rt, ap, 'follow');
    return true;
  }

  /**
   * Itinéraire du suivant : de sa position au point de la trace le plus proche (devant lui de préférence) — tout droit
   * s'il le voit, sinon par les rues —, puis la trace.
   */
  private joinTrail(rt: VehicleRt, ap: ApState, trail: readonly number[]): void {
    const v = rt.v;
    const n = trail.length >> 1;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    // coût de chaque point : distance, plus une pénalité s'il est dans mon dos (un demi-tour) ; on retient le moins
    // coûteux que l'on voit d'ici (tout droit) parmi les meilleurs, sinon le moins coûteux, rejoint par les rues
    const order = this.joinOrder;
    const cost = this.joinCost;
    order.length = 0;
    cost.length = 0;
    for (let i = 0; i < n; i++) {
      const dx = trail[i * 2]! - v.x;
      const dz = trail[i * 2 + 1]! - v.z;
      cost.push(Math.sqrt(dx * dx + dz * dz) + (dx * hx + dz * hz < 0 ? TRAIL_BEHIND : 0));
      order.push(i);
    }
    if (n === 0) return;
    order.sort((a, b) => cost[a]! - cost[b]!);
    let best = order[0]!;
    const world = this.k.ctx.world;
    // (vu ET atteignable tout droit : une grille — enclos de l'obélisque, square — laisse voir sans laisser passer ; le
    // suivant qui la traversait « tout droit » restait bloqué contre elle, toute la colonne derrière lui)
    const straight = (x: number, z: number): boolean => world.lineOfSight(v.x, v.z, x, z) && !(world.raycast(v.x, v.z, x, z, this.joinHit) && this.joinHit.hit);
    let seen = false;
    for (let k = 0; k < order.length && k < TRAIL_SIGHT_TRIES; k++) {
      const i = order[k]!;
      if (straight(trail[i * 2]!, trail[i * 2 + 1]!)) {
        best = i;
        seen = true;
        break;
      }
    }
    const bx = trail[best * 2]!;
    const bz = trail[best * 2 + 1]!;
    const buf = this.scratch;
    let far = false;
    if (!seen && this.plan(rt, ap, bx, bz)) {
      far = true;
      buf.length = 0;
      for (let i = 0; i < ap.n * 2; i++) buf.push(ap.path[i]!);
    } else {
      buf.length = 0;
      buf.push(v.x, v.z);
    }
    for (let i = best; i < n; i++) {
      const x = trail[i * 2]!;
      const z = trail[i * 2 + 1]!;
      const px = buf[buf.length - 2]!;
      const pz = buf[buf.length - 1]!;
      if ((x - px) * (x - px) + (z - pz) * (z - pz) < 0.25) continue;
      buf.push(x, z);
    }
    if (buf.length < 4) return;
    const axis = far ? ap.axisUntil : 0;
    ap.setPath(buf, buf.length >> 1);
    // (la trace est celle du meneur, déjà sur sa voie : pas de décalage de voie en plus, sauf sur l'itinéraire qui y mène)
    ap.axisUntil = far ? Math.min(axis, ap.total) : 0;
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
    // déjà dans l'axe de la place, tourné comme elle, la place devant lui (tête de colonne arrivée au point que le rang
    // fait avancer de quelques mètres) : il avance s'y garer. Le point d'approche, en arrière de la place, tombait
    // derrière lui — l'itinéraire, parti dans le sens où il est tourné, faisait le tour du quartier pour y revenir.
    const ahead = (x - v.x) * hs + (z - v.z) * hc;
    const aside = (x - v.x) * hc - (z - v.z) * hs;
    const inAxis = ahead > 0.5 && ahead < run && aside < 1.2 && aside > -1.2 && Math.abs(angleDiff(v.heading, heading)) < 0.3;
    for (let attempt = 0; attempt < 2 && !inAxis; attempt++) {
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
    if (inAxis) {
      this.scratch[0] = v.x;
      this.scratch[1] = v.z;
      ap.setPath(this.scratch, 1);
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

  reroute(v: Vehicle, pushThrough?: boolean, avoid?: DriveOptions['avoid']): boolean {
    const rt = this.k.peek(v.id);
    if (!rt || !rt.ap || !this.usable(v)) return false;
    const ap = rt.ap as ApState;
    if (ap.mode !== 'drive' && ap.mode !== 'follow') return false;
    if (pushThrough !== undefined) ap.pushThrough = pushThrough && v.def.canPush === true;
    if (avoid) ap.avoidZones = avoid.length > 0 ? avoid : null;
    return this.replan(rt, ap, false);
  }

  /**
   * Cède le passage à l'arrêt : marche arrière droite de `metres` (au plus 5), arrêtée par ce qui est derrière (voir
   * ApDriver.backOff). Pour deux véhicules d'une même colonne nez contre flanc au sortir d'un stationnement en bloc,
   * chacun attendant l'autre (session/follow.ts, unjam). false si le véhicule roule ou n'est pas au pilote automatique.
   */
  giveWay(v: Vehicle, metres: number): boolean {
    const rt = this.k.peek(v.id);
    if (!rt || !rt.ap || !this.usable(v) || Math.abs(v.speed) > 0.3) return false;
    const ap = rt.ap as ApState;
    if (ap.mode !== 'drive' && ap.mode !== 'follow') return false;
    ap.avoidBack = Math.max(0.5, Math.min(5, metres));
    ap.avoidBackT = 0;
    ap.scanT = 0;
    ap.giveWay = true;
    return true;
  }

  plannedPath(v: Vehicle, out: number[]): boolean {
    out.length = 0;
    const ctx = this.k.ctx;
    let cur: Vehicle | undefined = v;
    // on remonte la colonne jusqu'à sa tête (celle qui conduit vers le point)
    for (let guard = 0; cur && guard < 24; guard++) {
      const rt = this.k.peek(cur.id);
      const ap = rt ? (rt.ap as ApState | null) : null;
      if (!ap) return false;
      if (ap.mode === 'follow') {
        cur = ctx.vehicles.get(ap.leaderId);
        continue;
      }
      if (ap.mode !== 'drive' || ap.n < 2) return false;
      out.push(v.x, v.z);
      if (cur !== v) out.push(cur.x, cur.z);
      for (let i = ap.seg + 1; i < ap.n; i++) out.push(ap.path[i * 2]!, ap.path[i * 2 + 1]!);
      return out.length >= 4;
    }
    return false;
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
    // (suivant qui cède le passage — giveWay — : la marche arrière d'abord, l'attente derrière le meneur ensuite)
    if (ap.mode === 'follow' && ap.giveWay && ap.avoidBack > 0) {
      this.driver.backOff(rt, ap, dt);
      if (ap.avoidBack <= 0) ap.giveWay = false;
      return;
    }
    if (ap.mode === 'follow' && this.holdBehind(rt, ap)) {
      this.hold(v);
      this.driver.setStatus(rt, ap, 'attente', '');
      return;
    }
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

  /**
   * Suivant encore garé dont le meneur (un véhicule) n'est pas passé devant lui : à côté ou derrière lui, à moins de
   * HOLD_NEAR m — ou, garé en bloc (des véhicules arrêtés tout autour), arrêté à moins de HOLD_FAR m —, il attend sur
   * place, moteur tournant : le rejoindre tout de suite lui ferait faire demi-tour au milieu des véhicules garés (la
   * colonne s'emmêlait au départ). Pendant ce temps, la trace du meneur continue d'être relevée ; quand il est passé
   * devant ou parti, le suivant rejoint cette trace au plus près (devant lui de préférence) et la parcourt.
   */
  private holdBehind(rt: VehicleRt, ap: ApState): boolean {
    const v = rt.v;
    const lv = this.k.ctx.vehicles.get(ap.leaderId);
    if (!lv || (!ap.held && (Math.abs(v.speed) > 0.5 || ap.uturn !== 0 || ap.avoidBack > 0 || ap.s > 1))) {
      ap.held = false;
      return false;
    }
    const dx = lv.x - v.x;
    const dz = lv.z - v.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const ahead = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
    let hold = false;
    // (à côté de moi et qui démarre dans mon sens : il sort du rang devant moi, je prends sa suite sans attendre)
    const pulling = ahead > -rt.halfL && lv.speed > 0.5 && Math.cos(lv.heading - v.heading) > 0.7;
    if (ahead < rt.halfL + 1 && !pulling) {
      if (d <= HOLD_NEAR) hold = true;
      else if (d <= HOLD_FAR && Math.abs(lv.speed) <= 1 && this.packedAround(rt, lv.id)) hold = true;
    }
    const tr = ap.trace;
    if (hold) {
      ap.held = true;
      // trace du meneur (celle qu'on m'a donnée, prolongée de ses positions depuis)
      const n = tr.length;
      if (n < 2 || (tr[n - 2]! - lv.x) * (tr[n - 2]! - lv.x) + (tr[n - 1]! - lv.z) * (tr[n - 1]! - lv.z) > 2.25) {
        tr.push(lv.x, lv.z);
        if (tr.length > HOLD_TRACE_MAX * 2) tr.splice(0, 2);
      }
      return true;
    }
    if (ap.held) {
      ap.held = false;
      // le meneur est passé devant ou parti : on rejoint sa trace au meilleur endroit, et on la suit
      if (tr.length >= 2) this.joinTrail(rt, ap, tr.slice());
    }
    tr.length = 0;
    return false;
  }

  /** Un autre véhicule (hors `but`) arrêté à moins de HOLD_PACKED m : garé en bloc. */
  private packedAround(rt: VehicleRt, but: EntityId): boolean {
    const v = rt.v;
    const rts = this.k.rts;
    for (let i = 0; i < rts.length; i++) {
      const o = rts[i]!.v;
      if (o === v || o.id === but || o.def.flying || o.dormant || Math.abs(o.speed) > 0.5) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      if (dx * dx + dz * dz < HOLD_PACKED * HOLD_PACKED) return true;
    }
    return false;
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
