/* =====================================================================================
 * Pilote automatique — conduite proprement dite : suivi d'itinéraire (direction, allure, obstacles,
 * arrivée), demi-tour en plusieurs temps, alignement et marche arrière de reprise du stationnement.
 * Écrit Vehicle.cmd ; l'API et la tenue des itinéraires sont dans autopilot.ts.
 * ===================================================================================== */

import type { RoadSample, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { angleDiff, clamp } from '@/core/math';
import { AUTOPILOT_EVENT } from './api';
import type { AutopilotReason, AutopilotState } from './api';
import type { ApSensor } from './autopilot-sense';
import type { ApState, PathPoint } from './autopilot-state';
import { steerLimit } from './physics';
import type { VehicleKernel, VehicleRt } from './runtime';

/** Allure par défaut quand la voie n'en impose pas : 30 km/h, limite générale à Paris. */
export const DEFAULT_SPEED = 30 / 3.6;
/** Distance à laquelle on commence à couper un virage (m) : fixe le rayon praticable. */
const CORNER_CUT = 5;
const SCAN_PERIOD = 0.15;

/**
 * Position latérale d'un véhicule en intervention (m à droite de l'axe) : au milieu d'une rue à double sens, entre
 * les deux files qui se serrent chacune à droite (un peu à droite de l'axe sur une large avenue) ; sur l'axe d'un
 * sens unique. MÊME FORMULE que sim/traffic/tuning.ts (sirenLane) : les automobilistes s'en servent pour juger
 * s'il y a la place de se ranger.
 */
export function urgentLane(width: number, oneway: boolean): number {
  return oneway ? 0 : clamp(width * 0.25 - 2, 0, 3.2);
}

export class ApDriver {
  private readonly pt: PathPoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly road: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };

  private readonly road2: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };
  private readonly near: Vehicle[] = [];

  constructor(private readonly k: VehicleKernel, private readonly sensor: ApSensor) {}

  /** Met à jour l'état lisible du pilote ; un changement d'état émet l'événement libre 'vehicles:autopilot'. */
  setStatus(rt: VehicleRt, ap: ApState, state: AutopilotState, reason: AutopilotReason): void {
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
  finish(rt: VehicleRt, ap: ApState, state: AutopilotState, reason: AutopilotReason): void {
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

  /** Suivi d'itinéraire : direction, allure, obstacles, arrivée. */
  drive(rt: VehicleRt, ap: ApState, dt: number): void {
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
        const w = this.road.width;
        ap.roadLimit = limit > 1 ? limit : DEFAULT_SPEED;
        ap.roadHalf = w * 0.5;
        ap.roadOneway = this.road.oneway;
        // une intervention urgente roule entre les deux files, qui se serrent chacune à droite pour la laisser passer
        ap.laneWant = ap.urgence ? urgentLane(w, this.road.oneway) : this.road.oneway ? 0 : clamp(w * 0.25, 0, 3.2);
        // cycliste : au bord droit, à la distance voulue de la bordure ; à l'approche d'un tourne-à-gauche, il se
        // place au milieu de sa voie (les voitures restent derrière lui au lieu de le doubler à droite du virage)
        if (ap.kerb > 0 && ap.leftTurnAt > 32) {
          const edge = w * 0.5 - rt.halfW - ap.kerb;
          if (edge > ap.laneWant) ap.laneWant = edge;
        }
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
      const taper = clamp(Math.min(ap.fromAxis ? 8 : sT, toEnd) / 8, 0, 1);
      let off = ap.mode === 'park' ? 0 : ap.laneOffset * taper;
      // au bord de la chaussée (cycliste) : le décalage se compte depuis l'axe réel de la rue, pas depuis l'itinéraire
      // (au départ d'un nouvel ordre, celui-ci part de la position du vélo, déjà au bord, et rejoint l'axe plus loin)
      if (ap.kerb > 0 && ap.mode === 'drive') off = this.kerbOffset(ap, pt, taper, off);
      // dépassement d'un deux-roues : décalage à gauche
      if (ap.passShift > 0) off -= ap.passShift * taper;
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
    if (ap.mode === 'follow' && ap.cruise === 0 && !ap.convoy) {
      // une colonne tient l'allure de son meneur (+ de quoi recoller), même là où la voie la plus proche est un
      // cheminement piéton à vitesse de marche (place, quai) : c'est le meneur qui choisit où et à quelle vitesse on passe (les convois de l'IA ont leur propre allure de croisière)
      const lv = ctx.vehicles.get(ap.leaderId);
      if (lv && lv.speed + 4 > vt) vt = lv.speed + 4;
    }
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
    ap.leftTurnAt = turn > 0 && turnSign < 0 ? turnDist : Infinity;
    // tourne à droite : priorité au cycliste qui roule à sa droite (pas de « crochet » au carrefour)
    if (turn > 0 && turnSign > 0 && turnDist < 28 && ap.kerb === 0 && !ap.urgence && !ap.convoy && ap.mode === 'drive') {
      const lim = this.yieldRightBike(rt);
      if (lim < vt) vt = lim;
    }

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
        // la tête ralentit quand le suivant décroche, et s'arrête s'il est resté loin derrière (bloqué au départ)
        if (bap.mode === 'follow' && lag > bap.followDist * 2.5) vt = Math.min(vt, lag > 70 ? 0 : Math.max(1, vt * 0.4));
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
    this.overtake(rt, ap, au, dt);
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

  /** Décalage à droite de l'itinéraire qui place le point visé `pt` à ap.laneWant de l'axe réel de la rue. */
  private kerbOffset(ap: ApState, pt: PathPoint, taper: number, fallback: number): number {
    const road = this.road2;
    if (!this.k.ctx.world.nearestRoad(pt.x, pt.z, road, 12)) return fallback;
    // seulement dans l'axe de la rue (pas dans un carrefour, où la rue la plus proche peut être la transversale)
    const align = Math.sin(road.heading) * pt.dx + Math.cos(road.heading) * pt.dz;
    if (align < 0.92 && align > -0.92) return fallback;
    const lp = (pt.x - road.x) * -pt.dz + (pt.z - road.z) * pt.dx;
    return (ap.laneWant - lp) * taper;
  }

  /**
   * Dépassement d'un deux-roues lent (cycliste) : on se décale à gauche pour le doubler en lui laissant 1 m,
   * si la chaussée le permet et, quand il faut empiéter sur la voie d'en face, si personne n'arrive en face.
   * Sinon on reste derrière lui à son allure (rue étroite, circulation en face), comme en vrai.
   */
  private overtake(rt: VehicleRt, ap: ApState, au: number, dt: number): void {
    const v = rt.v;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    if (ap.passId !== 0) {
      // le deux-roues est-il derrière nous ?
      const o = this.k.peek(ap.passId);
      let done = true;
      if (o && !o.v.dormant) {
        const fwd = (o.v.x - v.x) * sn + (o.v.z - v.z) * cs;
        done = fwd < -(rt.halfL + o.halfL + 1.5);
        // pas encore à sa hauteur et quelqu'un arrive en face : on renonce et on reste derrière lui
        ap.passCheckT -= dt;
        if (!done && fwd > rt.halfL + o.halfL && !ap.roadOneway && ap.passCheckT <= 0) {
          ap.passCheckT = 0.4;
          if (!this.oncomingClear(rt, ap, o)) done = true;
        }
      }
      if (done) {
        ap.passId = 0;
        ap.passWant = 0;
      }
    } else if (
      !ap.urgence && !ap.convoy && ap.kerb === 0 && ap.mode === 'drive' && ap.obsReason === 'vehicule' && ap.obsId !== 0
      && ap.obsDist < 18 && ap.total - ap.s > 35 && ap.obsLat < 0.4
    ) {
      const o = this.k.peek(ap.obsId);
      if (o && o.v.kind === 'velo' && o.v.speed > 0.8 && o.v.speed < ap.roadLimit * 0.8 && o.v.speed < au + 1) {
        // décalage à gauche nécessaire pour laisser 1 m entre nos flancs
        const need = rt.halfW + o.halfW + 1.0 + ap.obsLat;
        const left = ap.laneOffset - need - rt.halfW; // bord gauche une fois décalé (m à droite de l'axe)
        // distance parcourue pendant le dépassement (le doubler et se rabattre avec 3 m d'avance), plus une marge :
        // pas de carrefour d'ici là
        const cruise = Math.min(ap.roadLimit, ap.cruise > 0 ? ap.cruise : ap.roadLimit);
        const gain = Math.max(0.6, cruise - o.v.speed);
        const span = ((ap.obsDist + rt.halfL * 2 + o.halfL * 2 + 6) / gain) * cruise + 20;
        if (
          need > 0 && left > -ap.roadHalf + 0.3 && span < 140 && !this.junctionNear(rt, ap, span)
          && (ap.roadOneway || left > -0.1 || this.oncomingClear(rt, ap, o))
        ) {
          ap.passId = o.v.id;
          ap.passWant = need;
        }
      }
    }
    const step = 1.5 * dt;
    if (ap.passShift < ap.passWant) ap.passShift = Math.min(ap.passWant, ap.passShift + step);
    else if (ap.passShift > ap.passWant) ap.passShift = Math.max(ap.passWant, ap.passShift - step);
  }

  /**
   * Avant de tourner à droite : un deux-roues roule-t-il à ma droite, à ma hauteur ou juste devant ? Renvoie la
   * vitesse permise (on le laisse prendre de l'avance, ou on reste derrière lui), Infinity sinon.
   */
  private yieldRightBike(rt: VehicleRt): number {
    const v = rt.v;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const list = this.near;
    const n = this.k.ctx.vehicles.queryRadius(v.x + sn * 3, v.z + cs * 3, rt.halfL + 10, list);
    let lim = Infinity;
    for (let i = 0; i < n; i++) {
      const o = list[i]!;
      if (o === v || o.kind !== 'velo' || o.dormant) continue;
      if (Math.sin(o.heading) * sn + Math.cos(o.heading) * cs < 0.6) continue;
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      const fwd = rx * sn + rz * cs;
      const right = -(rx * cs - rz * sn);
      if (right < 0.2 || right > rt.halfW + 3.5 || fwd < -(rt.halfL + 4) || fwd > rt.halfL + 8) continue;
      const os = o.speed > 0 ? o.speed : 0;
      // à ma hauteur ou derrière : je le laisse passer devant ; devant moi : je reste derrière lui
      const l = fwd < rt.halfL + 1 ? (os < 0.5 ? 0 : os * 0.6) : os;
      if (l < lim) lim = l;
    }
    return lim;
  }

  /**
   * Un carrefour (nœud d'au moins trois rues) est-il à moins de `dist` m devant (ou encore sous) le véhicule, ou
   * l'itinéraire tourne-t-il d'ici là ? On ne double pas un cycliste à l'approche d'un carrefour : il peut tourner.
   */
  private junctionNear(rt: VehicleRt, ap: ApState, dist: number): boolean {
    const v = rt.v;
    for (let j = ap.seg + 1; j < ap.n - 1 && ap.cum[j]! < ap.s + dist; j++) {
      const t = ap.turnAt(j);
      if (t > 0.3 || t < -0.3) return true;
    }
    const world = this.k.ctx.world;
    const road = this.road2;
    if (world.edgeCount === 0 || !world.nearestRoad(v.x, v.z, road, 15)) return false;
    const e = world.edge(road.edgeId);
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    for (let end = 0; end < 2; end++) {
      const node = world.node(end === 0 ? e.a : e.b);
      if (node.edges.length < 3) continue;
      const fwd = (node.x - v.x) * sn + (node.z - v.z) * cs;
      if (fwd > -8 && fwd < dist) return true;
    }
    return false;
  }

  /** Personne n'arrive en face (ni rien d'arrêté) sur la voie de gauche, sur la distance d'un dépassement. */
  private oncomingClear(rt: VehicleRt, ap: ApState, bike: VehicleRt): boolean {
    const v = rt.v;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const reach = 70;
    const list = this.near;
    const n = this.k.ctx.vehicles.queryRadius(v.x + sn * reach * 0.5, v.z + cs * reach * 0.5, reach * 0.5 + 4, list);
    for (let i = 0; i < n; i++) {
      const o = list[i]!;
      if (o === v || o === bike.v || o.def.flying) continue;
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      const fwd = rx * sn + rz * cs;
      if (fwd < -rt.halfL || fwd > reach) continue;
      const lat = rx * cs - rz * sn; // positif à gauche
      if (lat < 0.6 || lat > ap.roadHalf * 2) continue;
      const toward = Math.sin(o.heading) * sn + Math.cos(o.heading) * cs;
      // en face et roulant vers moi, ou arrêté sur la voie de gauche tout près
      if ((toward < -0.5 && Math.abs(o.speed) > 0.3) || fwd < 30) return false;
    }
    return true;
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
      if (ap.uturnMoves > 8 && (err >= 1 || err <= -1) && Math.abs(v.speed) < 0.5) {
        // huit reprises sans y parvenir (place trop étroite) : le conducteur finit par se dégager — le véhicule repart
        // dans le sens de l'itinéraire plutôt que de recommencer la manœuvre sans fin (colonnes figées au départ)
        v.heading = v.heading + err;
        v.vx = 0;
        v.vz = 0;
        v.speed = 0;
      }
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
  reverseOut(rt: VehicleRt, ap: ApState, dt: number): void {
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
