/* =====================================================================================
 * Pilote automatique — conduite proprement dite : suivi d'itinéraire (direction, allure, obstacles,
 * arrivée), demi-tour en plusieurs temps, alignement et marche arrière de reprise du stationnement.
 * Écrit Vehicle.cmd ; l'API et la tenue des itinéraires sont dans autopilot.ts.
 * ===================================================================================== */

import type { Person, Prop, RoadSample, Vehicle } from '@/core/contracts';
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
/** Contournement : marge latérale laissée à l'obstacle (m), allure (m/s), contrôle du couloir (s), abandon (s). */
const AVOID_MARGIN = 0.45;
/** Allure à contresens d'un sens unique (intervention urgente) : 20 km/h. */
const CONTRA_SPEED = 20 / 3.6;
/** Attente maximale à l'arrêt d'un suivant qui a décroché (s). */
const LAG_WAIT_MAX = 60;
const AVOID_SPEED = 2.6;
const AVOID_SPEED_URGENT = 4;
const AVOID_CHECK = 0.4;
const AVOID_GIVE_UP = 45;
/** Attente derrière un véhicule arrêté avant de le contourner (s) : en intervention urgente, en conduite normale. */
const AVOID_WAIT_URGENT = 1.5;
const AVOID_WAIT = 4;
/** Suivant arrêté par une personne immobile sur la trace de son meneur : attente avant de la contourner au pas (s). */
const FOLLOW_PEOPLE_DODGE = 5;
/** Arrêt devant un obstacle fixe infranchissable avant de chercher un autre itinéraire (s) : en conduite normale, en urgence. */
const OBSTACLE_REROUTE = 10;
const OBSTACLE_REROUTE_URGENT = 6;
/** Demi-tour sans progrès (ni déplacement ni cap gagné) depuis plus de (s) : il se déclare « bloqué ». */
const UTURN_STALL = 30;

/** Emprise d'un obstacle dans le repère de l'itinéraire (abscisses le long, écarts à droite de l'axe). */
interface Extent { sMin: number; sMax: number; latMin: number; latMax: number }

/**
 * Position latérale d'un véhicule en intervention (m à droite de l'axe) : au milieu d'une rue à double sens, entre
 * les deux files qui se serrent chacune à droite (un peu à droite de l'axe sur une large avenue) ; sur l'axe d'un
 * sens unique. MÊME FORMULE que sim/traffic/tuning.ts (sirenLane) : les automobilistes s'en servent pour juger
 * s'il y a la place de se ranger.
 */
export function urgentLane(width: number, oneway: boolean): number {
  return oneway ? 0 : clamp(width * 0.25 - 2, 0, 3.2);
}

/**
 * Un véhicule de police ou de secours (ou deux-tons allumés) n'est pas arrêté par un barrage : les agents qui le tiennent
 * rangent les barrières sur le trottoir à son approche et les remettent derrière lui (sim/traffic/closures.ts) ; il le
 * franchit au pas, comme une intervention urgente — sinon une colonne de police restait plantée pour de bon devant le
 * barrage que sa tête de colonne venait de franchir.
 */
function passesClosures(v: Vehicle): boolean {
  return v.faction === 'police' || v.faction === 'rescue' || v.faction === 'medic' || v.siren !== 0;
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
  private readonly nearProps: Prop[] = [];
  private readonly nearPeople: Person[] = [];
  private readonly pt2: PathPoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly extent: Extent = { sMin: 0, sMax: 0, latMin: 0, latMax: 0 };
  /** Le couloir de contournement peut passer sur le trottoir (intervention, mur sur l'axe). */
  private kerbOk = false;
  /** Contournements de personnes en cours (repérés par leur fin, ap.avoidS1) : voir dodgePeople. */
  private readonly dodging = new WeakMap<ApState, number>();
  /** Couloir regardé à courte portée (contournement d'un mur). */
  private shortCorridor = false;
  /** Nouvel itinéraire depuis la position courante (branché par Autopilot) ; false si impossible. */
  replan: ((rt: VehicleRt, ap: ApState, around?: boolean, blocked?: boolean) => boolean) | null = null;

  /** Mon meneur (colonne, suivi) est-il à plus de `d` m ? */
  private leaderAway(rt: VehicleRt, ap: ApState, d: number): boolean {
    const ctx = this.k.ctx;
    const lv = ctx.vehicles.get(ap.leaderId);
    const lp = lv ? undefined : ctx.people.get(ap.leaderId);
    const l = lv ?? lp;
    return !!l && Math.hypot(l.x - rt.v.x, l.z - rt.v.z) > d;
  }

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
    ap.avoidShift = 0;
    ap.avoidWant = 0;
    ap.avoidVeh = 0;
    ap.avoidProp = 0;
    ap.avoidBack = 0;
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
        // sens unique pris à contresens (intervention urgente, court tronçon) : au pas, serré à droite
        ap.contraflow = this.road.oneway && Math.cos(v.heading - this.road.heading) < -0.3;
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
    /** Écart (rad) entre mon cap et la direction de l'itinéraire devant moi. */
    let pathTurn = 0;

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
      pathTurn = turnErr;
      // (en colonne, un suivant garé à contresens fait demi-tour à l'arrêt, si son meneur n'est pas tout près)
      const followTurn = ap.mode === 'follow' && au < 0.6 && ap.total - ap.s > 12 && this.leaderAway(rt, ap, 10);
      // (ou, arrêté nez contre un obstacle fixe alors que l'itinéraire part franchement de côté : on manœuvre en
      // plusieurs temps pour s'aligner au lieu de forcer contre le réverbère — ou contre le véhicule garé en travers
      // devant lequel on vient de prendre un autre itinéraire)
      const wedged = au < 0.3 && ap.blockedFor > 1 && (ap.obsReason === 'mur' || ap.obsReason === 'obstacle' || (ap.obsReason === 'vehicule' && this.fixedBlocker(rt, ap)))
        && (turnErr > 1.25 || turnErr < -1.25) && ap.avoidVeh === 0 && ap.avoidProp === 0;
      if (ap.uturn === 0 && au < 3 && (turnErr > 2 || turnErr < -2 || wedged) && ap.total - ap.s > 6 && (ap.mode !== 'follow' || followTurn || wedged)) {
        ap.uturn = 1;
        ap.uturnDir = turnErr >= 0 ? 1 : -1;
        ap.uturnMoves = 0;
        ap.phaseT = 0;
        // (un nouveau demi-tour au même endroit — après un nouvel itinéraire — ne remet pas la mesure du progrès à zéro)
        if (Math.hypot(v.x - ap.uturnX, v.z - ap.uturnZ) > 4) {
          ap.uturnStallT = 0;
          ap.uturnX = v.x;
          ap.uturnZ = v.z;
          ap.uturnErr = Math.abs(turnErr);
        }
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
      // contournement d'un obstacle arrêté : décalage à gauche (ou à droite) le temps de le dépasser
      if (ap.avoidShift !== 0) off -= ap.avoidShift;
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
    // intervention urgente : une fois et demie l'allure (demandée ou limite de la voie), 50 km/h au moins
    // (les secours règlent leur allure de croisière sur cette règle : voir sim/roles/rescue)
    if (ap.urgence) vt = Math.max(vt * 1.5, 50 / 3.6);
    if (ap.contraflow && vt > CONTRA_SPEED) vt = CONTRA_SPEED;
    // écarté de l'itinéraire (virage manqué) : on ralentit pour le rejoindre au lieu de tourner autour
    if (ap.offPath > 8 && ap.avoidShift === 0 && !finalLeg) {
      const back = Math.max(3, 14 - ap.offPath * 0.5);
      if (vt > back) vt = back;
    }
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
        // (seulement s'il me suit bien encore : une colonne reformée ne laisse pas de lien périmé)
        // (on l'attend une minute au plus à l'arrêt : un suivant égaré rejoint en suivant notre trace, il ne fige pas toute la colonne)
        // (au milieu de la colonne, on n'attend que le suivant qui nous a déjà rejoints : celui qui était garé à l'écart
        // — le cellulaire de l'autre côté de la rue — rejoint la trace seul ; l'attendre retenait toute la file au départ)
        if (bap.mode === 'follow' && bap.leaderId === v.id && lag > bap.followDist * 2.5) {
          if (ap.mode === 'drive' || ap.behindJoined) {
            if (lag > 70) ap.lagWaitT += dt;
            if (ap.lagWaitT < LAG_WAIT_MAX) vt = Math.min(vt, lag > 70 ? 0 : Math.max(1, vt * 0.4));
          }
        } else if (lag < bap.followDist * 2.5) {
          ap.lagWaitT = 0;
          ap.behindJoined = true;
        }
      }
    }
    // rue fermée
    let closed = false;
    if (ap.closureS >= 0 && ap.closureS > ap.s - 2) {
      const d = ap.closureS - ap.s;
      if (ap.urgence || passesClosures(v)) {
        // (intervention urgente, ou véhicule de police ou de secours : les barrières s'ouvrent devant lui)
        if (d < 20) vt = Math.min(vt, 20 / 3.6); // on passe, au pas
      } else {
        const stop = Math.sqrt(2 * aDec * Math.max(0, d));
        if (stop < vt) vt = stop;
        closed = d < 1.5;
      }
    }

    // ── obstacles dans le couloir ──
    ap.scanT -= dt;
    if (ap.avoidBack > 0) {
      // (marche arrière de dégagement en cours : backOff relève l'arrière ; un relevé vers l'avant ici écrasait le sien
      // par l'obstacle de devant, à moins de 1,2 m, et la marche arrière s'arrêtait au bout d'un dixième de seconde)
    } else if (ap.scanT <= 0) {
      ap.scanT = SCAN_PERIOD;
      // en fin de stationnement, on regarde juste devant soi : les voisins déjà garés ne sont pas des obstacles
      const horizon = finalLeg ? clamp(au * au / 4 + 2.5, 2.5, 8) : clamp((au * au) / (2 * 3) + 6 + au * 0.6, 6, 45);
      const kappa = Math.tan(-v.steerAngle) / def.wheelbase;
      this.sensor.scan(rt, ap, horizon, 1, kappa, finalLeg ? 0.12 : 0.35);
    } else if (ap.obsDist !== Infinity) {
      ap.obsDist -= (u - ap.obsSpeed) * dt; // entre deux relevés, l'écart évolue à la vitesse relative
    }
    this.overtake(rt, ap, au, dt);
    // garé en bloc, nez contre le véhicule de devant, alors que l'itinéraire part de côté : on recule de quoi braquer
    // (sans quoi on attendait indéfiniment derrière un véhicule qui, lui, ne partira pas)
    if (ap.avoidBack <= 0 && au < 0.3 && ap.mode !== 'park' && (pathTurn > 0.6 || pathTurn < -0.6)) this.nudgeOut(rt, ap);
    if (ap.avoidBack > 0) {
      this.backOff(rt, ap, dt);
      return;
    }
    const avoidHold = this.avoid(rt, ap, au, dt, finalLeg);
    if (ap.avoidVeh !== 0 || ap.avoidProp !== 0) {
      const cap = ap.urgence ? AVOID_SPEED_URGENT : AVOID_SPEED;
      if (vt > cap) vt = cap;
      if (avoidHold) vt = 0;
    }
    // piétons au bord de la chaussée devant : allure de prudence (ils peuvent s'engager sous le capot), même deux tons
    // (véhicules d'intervention et colonnes, qui roulent plus vite que la circulation et que l'on n'attend pas)
    // quelqu'un s'engage vers la chaussée devant : on lève le pied, quel que soit le conducteur
    if (ap.pedCross < 25 && ap.mode !== 'park') {
      const careful = 2 + ap.pedCross * 0.25;
      if (vt > careful) vt = careful;
    }
    // (pas l'engin blindé qui fend un rassemblement au pas : la foule s'écarte devant lui, voir session/engins)
    if (ap.pedNear < 30 && ap.mode !== 'park' && (ap.urgence || ap.convoy) && !v.def.canPush) {
      const careful = 3 + ap.pedNear * 0.25;
      if (vt > careful) vt = careful;
    }
    // (en attente que le couloir de contournement se libère : c'est l'obstacle contourné qui nous arrête)
    let obstacle = avoidHold;
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
      if (ap.stuckAcc > 0) {
        ap.stuckAcc += dt;
        this.setStatus(rt, ap, 'bloque', ap.obsReason === 'obstacle' || ap.obsReason === 'vehicule' ? ap.obsReason : 'mur');
        ap.status.blockedFor = Math.max(ap.blockedFor, ap.stuckAcc);
      }
      // (marche arrière franche, au pas : un mètre ou deux pour reprendre l'angle)
      cmd.throttle = v.speed > -1.5 ? -0.8 : 0;
      cmd.brake = 0;
      cmd.steer = -cmd.steer;
      cmd.handbrake = false;
      ap.status.targetSpeed = -1;
      return;
    }
    // nez contre un mur (angle de façade, mobilier fixe) : même reprise en marche arrière qu'un véhicule qui force
    const wallStall = obstacle && ap.obsReason === 'mur' && !finalLeg && au < 0.12 && ap.blockedFor > 1.5;
    if ((vt > 0.8 && au < 0.12) || wallStall) {
      ap.stuckT += dt;
      if (ap.stuckT > 2.5) {
        ap.stuckT = 0;
        if (++ap.unstickTries > 3) {
          if (ap.mode === 'park') {
            this.finish(rt, ap, 'bloque', 'mur');
            rt.apActive = false;
            return;
          }
          // coincé contre quelque chose que les capteurs ne voient pas (angle de mur, bordure) : on ne renonce pas
          // (un véhicule de colonne arrêté pour de bon figerait ceux qui le suivent) — nouvel itinéraire depuis là
          // où l'on est, orienté comme on est, puis nouvelles reprises
          ap.unstickTries = 0;
          ap.blockedFor += 2.5 * 4;
          if ((ap.mode === 'drive' || ap.mode === 'follow') && this.replan && ap.replans < 8) {
            ap.replans++;
            // (contre un mur sur l'itinéraire — chaussée barrée, défaut de la carte — l'endroit est signalé : les
            // itinéraires suivants, les siens comme ceux des autres, l'évitent)
            this.replan(rt, ap, false, ap.obsReason === 'mur' || ap.obsReason === 'obstacle');
          }
          this.setStatus(rt, ap, 'bloque', 'mur');
          ap.status.blockedFor = ap.blockedFor;
        }
        ap.unstickT = 2;
        // début d'une série de reprises : on mesure le temps passé coincé au même endroit
        if (ap.stuckAcc === 0) {
          ap.stuckX = v.x;
          ap.stuckZ = v.z;
          // (le temps déjà passé à forcer ou à l'arrêt devant compte)
          ap.stuckAcc = 2.5 + ap.blockedFor;
        }
      }
    } else {
      ap.stuckT = 0;
    }
    // coincé (reprises en marche arrière) : le temps court tant qu'on n'a pas quitté l'endroit (4 m)
    if (ap.stuckAcc > 0) {
      const dx = v.x - ap.stuckX;
      const dz = v.z - ap.stuckZ;
      if (dx * dx + dz * dz > 16) ap.stuckAcc = 0;
      else ap.stuckAcc += dt;
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
      // arrêté devant un obstacle fixe qui ferme la chaussée et que l'on ne peut contourner (station de vélos, barrières,
      // mobilier en travers, véhicule garé sans conducteur ou épave) : l'endroit est signalé et l'on prend un autre
      // itinéraire — sans quoi le véhicule restait là pour de bon (« bloqué »), loin du point, et sa colonne arrivait sans lui
      // (pas la circulation civile : sa patience, son demi-tour ou son contournement sont réglés par sim/traffic)
      // (essai resté sans effet — aucun autre itinéraire, ou tête de colonne qui refuse de faire demi-tour contre son
      // suivant : voir Autopilot.replan — : le temps d'arrêt continue de courir, nouvel essai un peu plus tard ; remis à
      // zéro, il ne dépassait jamais les 20 s au bout desquelles la conduite de la colonne fait ranger les voitures
      // civiles qui la bloquent, police/command/convoy.ts)
      if (ap.blockedFor < ap.rerouteAt) ap.rerouteAt = 0;
      if (stopped && !closed && v.faction !== 'civil' && ap.avoidVeh === 0 && ap.avoidProp === 0 && (ap.mode === 'drive' || ap.mode === 'follow')
        && ap.blockedFor > ap.rerouteAt + (ap.urgence ? OBSTACLE_REROUTE_URGENT : OBSTACLE_REROUTE) && this.replan && ap.replans < 8 && this.fixedBlocker(rt, ap)) {
        ap.replans++;
        ap.rerouteAt = ap.blockedFor;
        if (this.replan(rt, ap, false, true)) {
          ap.blockedFor = 0;
          ap.rerouteAt = 0;
          this.setStatus(rt, ap, 'en_route', '');
          return;
        }
      }
      // (suivant arrêté derrière son propre meneur : il attend sa place dans la colonne, il n'est pas bloqué)
      const queued = ap.mode === 'follow' && ap.obsReason === 'vehicule' && ap.obsId === ap.leaderId && ap.stuckAcc <= 3;
      this.setStatus(rt, ap, queued ? 'attente' : (stopped && fixed && ap.blockedFor > 3) || ap.stuckAcc > 3 ? 'bloque' : 'attente', queued ? '' : reason);
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
    // (coincé, entre deux reprises : l'état reste « bloqué », le temps passé là continue de courir)
    ap.status.blockedFor = ap.stuckAcc > ap.blockedFor ? ap.stuckAcc : ap.blockedFor;
    if (ap.stuckAcc > 3 && !obstacle && !closed && au < 1 && ap.status.state !== 'arrive') this.setStatus(rt, ap, 'bloque', 'mur');
  }

  // ───────────────────────────── contournement ─────────────────────────────

  /**
   * Contournement d'un obstacle arrêté sur la voie — objet (station de vélos, borne, barrière), épave, véhicule garé,
   * ou, pour une intervention urgente, véhicule arrêté devant elle (feu rouge, file bloquée) : au pas, on se décale à
   * gauche (sur la voie d'en face si elle est libre) ou à droite le temps de le dépasser, puis on reprend sa voie.
   * Le couloir de contournement doit être carrossable, libre (ni objet, ni véhicule, ni personne) et personne ne doit
   * arriver en face. Trop près pour braquer : courte marche arrière d'abord. Retourne true s'il faut attendre sur
   * place (couloir momentanément occupé).
   */
  private avoid(rt: VehicleRt, ap: ApState, au: number, dt: number, finalLeg: boolean): boolean {
    const v = rt.v;
    // contournement de personnes arrêté à son tour, depuis un moment, par une personne immobile (rang suivant d'une ligne
    // d'agents en quinconce, blessé plus loin) : on reprend le contournement depuis là où l'on est, au lieu d'attendre
    // derrière elle pour de bon
    if (ap.avoidProp === -1 && ap.mode === 'follow' && this.dodging.get(ap) === ap.avoidS1 && ap.obsReason === 'personne'
      && au < 0.3 && ap.blockedFor > FOLLOW_PEOPLE_DODGE && ap.avoidBack <= 0 && this.dodgePeople(rt, ap, au)) {
      ap.blockedFor = 0;
      return false;
    }
    if (ap.avoidVeh !== 0 || ap.avoidProp !== 0) {
      ap.avoidT += dt;
      const ext = this.extent;
      const known = this.obstacleExtent(rt, ap, ap.avoidVeh, ap.avoidProp, ext);
      // mur (chaussée qui se resserre, angle de façade) : dépassé quand la voie habituelle est de nouveau libre
      if (ap.avoidProp === -1 && ap.avoidWant !== 0 && ap.s > ext.sMax - rt.halfL) {
        ap.avoidCheckT -= dt;
        if (ap.avoidCheckT <= 0) {
          ap.avoidCheckT = AVOID_CHECK;
          ext.sMin = ap.s;
          ext.sMax = ap.s + 8;
          if (this.corridorClear(rt, ap, ap.laneOffset, ext, 0, true)) ap.avoidWant = 0;
          else if (ap.avoidKerb) {
            // toujours barré : le couloir pris (trottoir compris) l'est-il encore ? sinon on en cherche un autre
            this.kerbOk = true;
            ext.sMin = ap.s;
            ext.sMax = ap.s + 8;
            if (!this.corridorClear(rt, ap, ap.laneOffset - ap.avoidWant, ext, ap.avoidWant, true)) ap.avoidWant = 0;
            this.kerbOk = false;
          }
          else if (ap.s > ap.avoidS1 + 40) ap.avoidWant = 0;
        }
        const step = 2.4 * dt;
        if (ap.avoidShift < ap.avoidWant) ap.avoidShift = Math.min(ap.avoidWant, ap.avoidShift + step);
        else if (ap.avoidShift > ap.avoidWant) ap.avoidShift = Math.max(ap.avoidWant, ap.avoidShift - step);
        return false;
      }
      // l'obstacle s'en va (véhicule qui repart), a disparu, ou est dépassé : on reprend sa voie
      const ov = ap.avoidVeh !== 0 ? this.k.ctx.vehicles.get(ap.avoidVeh) : undefined;
      const leaving = !!ov && ov.speed > 2.5;
      const passed = known && ext.sMax < ap.s - rt.halfL - 1.2;
      if (!known || leaving || passed || ap.avoidT > AVOID_GIVE_UP) ap.avoidWant = 0;
      // couloir revu régulièrement tant qu'on n'est pas à hauteur de l'obstacle
      let hold = false;
      // (contournement de personnes arrêtées : pas de recontrôle du couloir — les passants qui longent le véhicule le
      // fermaient sans cesse et il renonçait ; le capteur l'arrête de toute façon devant quiconque s'y engage)
      if (ap.avoidWant !== 0 && known && ap.s + rt.halfL < ext.sMin + 1 && this.dodging.get(ap) !== ap.avoidS1) {
        ap.avoidCheckT -= dt;
        if (ap.avoidCheckT <= 0) {
          ap.avoidCheckT = AVOID_CHECK;
          const off = ap.laneOffset - ap.avoidWant;
          if (!this.corridorClear(rt, ap, off, ext, ap.avoidWant)) {
            ap.avoidWaitT += AVOID_CHECK;
            ap.status.reason = 'vehicule';
          } else {
            ap.avoidWaitT = 0;
          }
        }
        hold = ap.avoidWaitT > 0;
        if (ap.avoidWaitT > 5) {
          // le couloir ne se libère pas : on renonce, et l'on ne réessaie pas tout de suite
          ap.avoidWant = 0;
          ap.avoidCheckT = 10;
          hold = false;
        }
      }
      const step = (ap.avoidWant !== 0 ? 2.4 : 1.1) * dt;
      if (ap.avoidShift < ap.avoidWant) ap.avoidShift = Math.min(ap.avoidWant, ap.avoidShift + step);
      else if (ap.avoidShift > ap.avoidWant) ap.avoidShift = Math.max(ap.avoidWant, ap.avoidShift - step);
      if (ap.avoidWant === 0 && Math.abs(ap.avoidShift) < 0.02) {
        ap.avoidShift = 0;
        ap.avoidVeh = 0;
        ap.avoidProp = 0;
        ap.avoidWaitT = 0;
      }
      return hold;
    }
    if (ap.mode !== 'drive' && ap.mode !== 'follow' && ap.mode !== 'park') return false;
    if (finalLeg || ap.uturn !== 0 || ap.obsDist === Infinity) return false;
    ap.avoidCheckT -= dt;
    if (ap.avoidCheckT > 0) return false;
    ap.avoidCheckT = AVOID_CHECK;
    // pas pour un obstacle au-delà du point d'arrivée
    if (ap.mode === 'drive' && ap.total - ap.s - ap.stopBefore < ap.obsDist + rt.halfL + 2) return false;
    const trigger = Math.max(9, (au * au) / 4 + 6);
    if (ap.obsDist > trigger) return false;
    let vehId = 0;
    let propId = 0;
    // (suivant arrêté depuis un moment par une personne immobile sur la trace de son meneur — agent en formation, à pied,
    // là où le meneur s'est faufilé — : on la contourne au pas comme un obstacle fixe, si un couloir libre le permet)
    // (de même, un véhicule de police conduit seul, arrêté par des collègues à pied immobiles devant lui — les hommes de
    // son unité, une autre compagnie rangée sur la chaussée — : ils tiennent leur place, ils ne s'écartent pas ; sans
    // contournement il les attendait pour de bon)
    // (suivant d'une colonne de l'IA — départ de la caserne, mouvement motorisé — : seulement une personne à terre, qui ne
    // se relèvera pas ; il l'attendait jusqu'à la fin, et la colonne arrivait sans le fourgon du joueur, resté à 2 km)
    const standing = ap.obsReason === 'personne' && ap.blockedFor > FOLLOW_PEOPLE_DODGE && au < 0.3
      && (ap.convoy ? ap.mode === 'follow' && this.lyingAhead(rt, ap)
        : ap.mode === 'follow' || (ap.mode === 'drive' && v.faction === 'police' && this.colleaguesAhead(rt)));
    // (personnes immobiles, ou à terre — un blessé allongé sur la chaussée —, devant un suivant : on les contourne
    // franchement, en leur laissant un mètre, comme un objet arrêté sur la voie ; un petit pas de côté ne suffisait pas
    // et la colonne attendait derrière un blessé jusqu'à la fin)
    if (standing && ap.mode === 'follow' && this.dodgePeople(rt, ap, au)) return false;
    if (ap.obsReason === 'mur' || standing) {
      // chaussée barrée devant par un mur ou du mobilier fixe (la rue se resserre, l'axe de la carte longe une façade) :
      // on cherche un couloir libre à côté, le plus près possible de sa voie
      if (au > 3) return false;
      const ext = this.extent;
      ext.sMin = ap.s + rt.halfL + Math.max(0, ap.obsDist);
      ext.sMax = ext.sMin + 3;
      ext.latMin = 0;
      ext.latMax = 0;
      // (personnes immobiles devant un suivant : couloir compté depuis la trace du meneur, que la trajectoire suit sans
      // décalage de voie — compté depuis ap.laneOffset, jusqu'à 3,2 m dans une rue à double sens, le couloir vérifié
      // était libre à droite et le suivant braquait vers la gauche, droit sur le blessé allongé qu'il voulait éviter)
      const off0 = standing && ap.mode === 'follow' && ap.axisUntil <= ap.s ? 0 : ap.laneOffset;
      // (en intervention, au pas, on monte sur le trottoir s'il le faut et s'il est libre : là où l'axe de la rue
      // relevé sur la carte coupe l'angle d'un immeuble)
      const passes = ap.urgence || ap.convoy ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        this.kerbOk = pass === 1;
        for (const shift of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4, 3.2, -3.2, 4.2, -4.2, 5.2, -5.2]) {
          this.shortCorridor = true;
          const clear = this.corridorClear(rt, ap, off0 - shift, ext, shift);
          this.shortCorridor = false;
          if (!clear) continue;
          ap.avoidVeh = 0;
          ap.avoidProp = -1;
          ap.avoidS1 = ext.sMax;
          // (personnes immobiles — une ligne de collègues en travers de la rue, en quinconce — : couloir vu de proche en
          // proche, comme pour dodgePeople ; le recontrôle sur toute la longueur butait sur le rang suivant, le véhicule
          // attendait cinq secondes, renonçait, et recommençait indéfiniment — les motos de la BRAV-M ne passaient pas)
          if (standing) this.dodging.set(ap, ap.avoidS1);
          ap.avoidKerb = this.kerbOk;
          this.kerbOk = false;
          this.engageAvoid(rt, ap, shift, au);
          return false;
        }
      }
      this.kerbOk = false;
      return false;
    } else if (ap.obsReason === 'obstacle' && ap.obsPropId !== 0) {
      // une barricade, des barrières qui ferment la rue : la circulation s'arrête ; une intervention urgente (ou une
      // colonne) passe à côté s'il reste la place
      const prop = this.k.ctx.props.get(ap.obsPropId);
      if (prop && !ap.urgence && !ap.convoy && (prop.kind === 'barricade' || prop.kind === 'barriere_vauban' || prop.kind === 'barriere_chantier')) return false;
      propId = ap.obsPropId;
    } else if (ap.obsReason === 'vehicule' && ap.obsId !== 0) {
      const o = this.k.peek(ap.obsId);
      if (!o || o.v.dormant || Math.abs(o.v.speed) > 0.5 || this.inMyColumn(rt, ap, o.v.id)) return false;
      const wreck = o.v.state === 'wrecked' || o.v.state === 'burnt';
      const parked = wreck || o.v.seats[0] === 0 || (!o.apActive && o.dyn.asleep);
      // un véhicule arrêté (feu, file) : seule une intervention urgente, ou une colonne, le double ; jamais une
      // voiture qui attend son tour dans la circulation
      // (la circulation ordinaire, elle, attend ou se fait dévier par le module de circulation)
      const urgent = ap.urgence || ap.convoy;
      // un véhicule qui suit un meneur (colonne du joueur, escorte) contourne aussi un véhicule GARÉ (sans conducteur)
      // qui lui barre la voie : sinon, sorti d'un stationnement en bloc, il attendait derrière indéfiniment
      if (!urgent && !(parked && ap.mode === 'follow')) return false;
      if (!parked && ap.blockedFor < (urgent ? AVOID_WAIT_URGENT : AVOID_WAIT)) return false;
      vehId = o.v.id;
    } else {
      return false;
    }
    const ext = this.extent;
    if (!this.obstacleExtent(rt, ap, vehId, propId, ext)) return false;
    // position latérale prévue (à droite de l'axe) et ses deux issues
    const off0 = ap.laneOffset;
    // (déjà dégagé sur la voie prévue mais arrêté devant : la trajectoire du moment le vise, on s'en écarte un peu)
    const left = Math.max(0.4, off0 - (ext.latMin - AVOID_MARGIN - rt.halfW));
    const right = Math.min(-0.4, off0 - (ext.latMax + AVOID_MARGIN + rt.halfW));
    const maxShift = Math.max(3.5, ap.roadHalf * 2 + 0.5);
    // à gauche d'abord (dépassement par la gauche, d'usage), à droite si c'est nettement plus court ou seul possible
    const order: number[] = [];
    if (left > 0 && left <= maxShift) order.push(left);
    if (right < 0 && -right <= maxShift) order.push(right);
    if (order.length === 2 && -right + (ap.roadOneway ? 0 : 0.8) < left) order.reverse();
    for (const shift of order) {
      if (!this.corridorClear(rt, ap, off0 - shift, ext, shift)) continue;
      ap.avoidVeh = vehId;
      ap.avoidProp = propId;
      this.engageAvoid(rt, ap, shift, au);
      return false;
    }
    return false;
  }

  /**
   * Contournement des personnes arrêtées devant soi : emprise des personnes dans le couloir (sur la longueur de l'arrêt,
   * plus quelques mètres), puis décalage à gauche ou à droite, couloir libre vérifié (au besoin à cheval sur le trottoir,
   * au pas). Le décalage est tenu comme pour un mur, jusqu'à ce que la voie habituelle soit de nouveau libre. false si
   * aucun couloir ne convient.
   */
  private dodgePeople(rt: VehicleRt, ap: ApState, au: number): boolean {
    const v = rt.v;
    const ctx = this.k.ctx;
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    const reach = rt.halfL + Math.max(0, ap.obsDist) + 4;
    const pt = this.pt2;
    // position latérale réelle du véhicule par rapport à l'itinéraire (en colonne, il roule sur la trace de son meneur,
    // sans décalage de voie : ap.laneOffset n'y est pas appliqué)
    ap.sample(ap.s, pt);
    const off0 = (v.x - pt.x) * -pt.dz + (v.z - pt.z) * pt.dx;
    const ext = this.extent;
    ext.sMin = Infinity;
    ext.sMax = -Infinity;
    ext.latMin = Infinity;
    ext.latMax = -Infinity;
    const n = ctx.people.queryRadius(v.x + sn * reach * 0.5, v.z + cs * reach * 0.5, reach * 0.5 + rt.halfW + 2, this.nearPeople);
    for (let i = 0; i < n; i++) {
      const p = this.nearPeople[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      const fwd = (p.x - v.x) * sn + (p.z - v.z) * cs;
      if (fwd < rt.halfL - 1 || fwd > reach) continue;
      const sP = clamp(ap.s + fwd, 0, ap.total);
      ap.sample(sP, pt);
      const along = (p.x - pt.x) * pt.dx + (p.z - pt.z) * pt.dz;
      const lat = (p.x - pt.x) * -pt.dz + (p.z - pt.z) * pt.dx;
      // (dans le couloir du véhicule sur sa voie, avec la marge du capteur)
      if (Math.abs(lat - off0) > rt.halfW + p.radius + 0.6) continue;
      const r = p.radius + 0.6;
      if (sP + along - r < ext.sMin) ext.sMin = sP + along - r;
      if (sP + along + r > ext.sMax) ext.sMax = sP + along + r;
      if (lat - r < ext.latMin) ext.latMin = lat - r;
      if (lat + r > ext.latMax) ext.latMax = lat + r;
    }
    this.nearPeople.length = 0;
    if (ext.sMin === Infinity) return false;
    const left = Math.max(0.4, off0 - (ext.latMin - AVOID_MARGIN - rt.halfW));
    const right = Math.min(-0.4, off0 - (ext.latMax + AVOID_MARGIN + rt.halfW));
    const maxShift = Math.max(3.5, ap.roadHalf * 2 + 0.5);
    const order: number[] = [];
    if (left <= maxShift) order.push(left);
    if (-right <= maxShift) order.push(right);
    if (order.length === 2 && -right < left) order.reverse();
    // (sur la chaussée d'abord ; à défaut, à cheval sur le trottoir s'il est libre)
    for (let pass = 0; pass < 2; pass++) {
      this.kerbOk = pass === 1;
      for (const shift of order) {
        if (!this.corridorClear(rt, ap, off0 - shift, ext, shift)) continue;
        ap.avoidVeh = 0;
        ap.avoidProp = -1;
        // (tenu jusqu'à ce que l'arrière du véhicule ait dépassé les personnes : voir avoid, cas du mur)
        ap.avoidS1 = ext.sMax + rt.halfL + 1;
        this.dodging.set(ap, ap.avoidS1);
        ap.avoidKerb = this.kerbOk;
        this.kerbOk = false;
        this.engageAvoid(rt, ap, shift, au);
        // (le couloir vérifié est à off0 − shift de l'itinéraire ; la trajectoire vise −avoidShift : décalage compté
        // depuis l'itinéraire, pas depuis la position du moment — sans quoi un véhicule déjà écarté de la trace, qui
        // reprend un contournement, visait un autre couloir que celui qu'il avait vérifié)
        ap.avoidWant = shift - off0;
        return true;
      }
    }
    this.kerbOk = false;
    return false;
  }

  /** Engage le décalage de contournement ; marche arrière d'abord si l'on est trop près pour braquer. */
  private engageAvoid(rt: VehicleRt, ap: ApState, shift: number, au: number): void {
    const v = rt.v;
    ap.avoidWant = shift;
    ap.avoidT = 0;
    ap.avoidWaitT = 0;
    ap.avoidCheckT = AVOID_CHECK;
    // course nécessaire pour se décaler (deux arcs au braquage maximal), sinon marche arrière d'abord
    const r = v.def.wheelbase / Math.tan(v.def.maxSteer) + 0.5;
    const need = 1.5 * Math.sqrt(r * Math.abs(shift)) + 0.6;
    if (ap.obsDist < need && au < 0.6) {
      ap.avoidBack = Math.min(5, need - ap.obsDist);
      ap.avoidBackT = 0;
    }
  }

  /** Marche arrière dans l'axe avant un contournement (place pour braquer), arrêtée par ce qui est derrière. */
  backOff(rt: VehicleRt, ap: ApState, dt: number): void {
    const v = rt.v;
    const cmd = v.cmd;
    ap.avoidBackT += dt;
    ap.scanT -= dt;
    if (ap.scanT <= 0) {
      ap.scanT = SCAN_PERIOD;
      this.sensor.scan(rt, ap, 3, -1, 0, 0.2);
    }
    const blocked = ap.obsDist < 1.2;
    if (Math.abs(v.speed) > 0.05 && v.speed < 0) ap.avoidBack += v.speed * dt;
    cmd.steer = 0;
    cmd.handbrake = false;
    cmd.horn = false;
    if (blocked || ap.avoidBack <= 0 || ap.avoidBackT > 5) {
      cmd.throttle = 0;
      cmd.brake = 1;
      if (Math.abs(v.speed) < 0.15) {
        ap.avoidBack = 0;
        ap.obsDist = Infinity;
        ap.scanT = 0;
        ap.blockedFor = 0;
      }
    } else {
      const e = -1.2 - v.speed;
      cmd.throttle = e < 0 ? clamp(e * 0.8 - 0.1, -1, 0) : 0;
      cmd.brake = e > 0.4 ? 0.3 : 0;
    }
    ap.status.targetSpeed = -1.2;
    this.setStatus(rt, ap, 'manoeuvre', '');
  }

  /** Nez contre un véhicule arrêté (pas mon meneur) depuis 2 s, à moins de 1,5 m : marche arrière de 3 m (quatre fois au plus). */
  private nudgeOut(rt: VehicleRt, ap: ApState): void {
    if (ap.obsReason !== 'vehicule' || ap.obsDist > 1.5 || ap.blockedFor < 2 || ap.nudges >= 4 || ap.uturn !== 0) return;
    if (ap.obsId === 0 || ap.obsId === ap.leaderId) return;
    const o = this.k.ctx.vehicles.get(ap.obsId);
    if (!o || Math.abs(o.speed) > 0.3) return;
    ap.nudges++;
    ap.avoidBack = 3;
    ap.avoidBackT = 0;
    ap.scanT = 0;
  }

  /** Les personnes à pied dans mon couloir, juste devant, sont-elles toutes des policiers immobiles (au moins un) ? */
  private colleaguesAhead(rt: VehicleRt): boolean {
    const v = rt.v;
    const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
    const reach = 6;
    const n = this.k.ctx.people.queryRadius(v.x + sn * (rt.halfL + reach * 0.5), v.z + cs * (rt.halfL + reach * 0.5), reach * 0.5 + rt.halfW + 1, this.nearPeople);
    let found = 0;
    for (let i = 0; i < n; i++) {
      const p = this.nearPeople[i]!;
      if (p.vehicleId !== 0 || p.dormant) continue;
      const dx = p.x - v.x, dz = p.z - v.z;
      const f = dx * sn + dz * cs - rt.halfL;
      const l = dx * cs - dz * sn;
      if (f < -0.5 || f > reach || l > rt.halfW + 0.9 || l < -(rt.halfW + 0.9)) continue;
      if (p.faction !== 'police' || p.vx * p.vx + p.vz * p.vz > 0.09) return false;
      found++;
    }
    return found > 0;
  }

  /** Une personne à terre (allongée, blessée) est-elle dans mon couloir, juste devant l'obstacle qui m'arrête ? */
  private lyingAhead(rt: VehicleRt, ap: ApState): boolean {
    const v = rt.v;
    const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
    const reach = Math.max(0, ap.obsDist) + 3;
    const n = this.k.ctx.people.queryRadius(v.x + sn * (rt.halfL + reach * 0.5), v.z + cs * (rt.halfL + reach * 0.5), reach * 0.5 + rt.halfW + 1, this.nearPeople);
    let found = false;
    for (let i = 0; i < n && !found; i++) {
      const p = this.nearPeople[i]!;
      if (p.vehicleId !== 0 || p.dormant || (p.posture !== 'down' && p.posture !== 'prone')) continue;
      const dx = p.x - v.x, dz = p.z - v.z;
      const f = dx * sn + dz * cs - rt.halfL;
      const l = dx * cs - dz * sn;
      found = f > -0.5 && f < reach && l < rt.halfW + 0.9 && l > -(rt.halfW + 0.9);
    }
    this.nearPeople.length = 0;
    return found;
  }

  /** L'obstacle qui m'arrête est-il là pour de bon : objet, ou véhicule garé sans conducteur, ou épave (hors de ma colonne) ? */
  private fixedBlocker(rt: VehicleRt, ap: ApState): boolean {
    if (ap.obsReason === 'obstacle') return ap.obsPropId !== 0;
    if (ap.obsReason !== 'vehicule' || ap.obsId === 0) return false;
    // (un véhicule de ma colonne, même laissé sans conducteur — le joueur descendu du sien —, n'est pas un obstacle à
    // contourner par un autre itinéraire : on l'attend à sa place)
    if (this.inMyColumn(rt, ap, ap.obsId)) return false;
    const o = this.k.ctx.vehicles.get(ap.obsId);
    return !!o && (o.seats[0] === 0 || o.state === 'wrecked' || o.state === 'burnt') && Math.abs(o.speed) < 0.3;
  }

  /** Le véhicule `id` est-il mon meneur, l'un des meneurs de ma colonne, ou celui qui me suit ? */
  private inMyColumn(rt: VehicleRt, ap: ApState, id: number): boolean {
    if (ap.leaderId === id || ap.behindId === id) return true;
    let cur = ap.leaderId;
    for (let guard = 0; cur !== 0 && guard < 16; guard++) {
      const o = this.k.peek(cur);
      const oap = o ? (o.ap as ApState | null) : null;
      if (!oap || oap.mode !== 'follow') break;
      cur = oap.leaderId;
      if (cur === id) return true;
    }
    const o = this.k.peek(id);
    const oap = o ? (o.ap as ApState | null) : null;
    return !!oap && oap.mode === 'follow' && oap.leaderId === rt.v.id;
  }

  /**
   * Emprise de l'obstacle (véhicule ou objet) dans le repère de l'itinéraire, à hauteur de l'obstacle : abscisses le long
   * de l'itinéraire, écarts à droite de l'axe. false s'il a disparu.
   */
  private obstacleExtent(rt: VehicleRt, ap: ApState, vehId: number, propId: number, out: Extent): boolean {
    const v = rt.v;
    const ctx = this.k.ctx;
    let cx = 0, cz = 0, r = 0;
    let ov: Vehicle | undefined;
    if (propId === -1) {
      // mur : tronçon mémorisé à l'engagement
      out.sMin = ap.avoidS1 - 6;
      out.sMax = ap.avoidS1;
      out.latMin = 0;
      out.latMax = 0;
      return true;
    }
    if (vehId !== 0) {
      ov = ctx.vehicles.get(vehId);
      if (!ov) return false;
      cx = ov.x;
      cz = ov.z;
      r = Math.max(ov.def.length, ov.def.width) * 0.5;
    } else {
      const p = ctx.props.get(propId);
      if (!p || p.state === 'broken' || p.carriedBy !== 0 || !p.blocksMove) return false;
      cx = p.x;
      cz = p.z;
      r = p.halfX > p.halfZ ? p.halfX : p.halfZ;
    }
    // abscisse de l'obstacle sur l'itinéraire : celle du véhicule plus son avance dans l'axe du véhicule
    const fwd = (cx - v.x) * Math.sin(v.heading) + (cz - v.z) * Math.cos(v.heading);
    const sObs = clamp(ap.s + fwd, 0, ap.total);
    const pt = this.pt2;
    ap.sample(sObs, pt);
    const rx = -pt.dz, rz = pt.dx;
    const along = (cx - pt.x) * pt.dx + (cz - pt.z) * pt.dz;
    const lat = (cx - pt.x) * rx + (cz - pt.z) * rz;
    if (ov) {
      // les quatre coins
      const sn = Math.sin(ov.heading), cs = Math.cos(ov.heading);
      const hl = ov.def.length * 0.5, hw = ov.def.width * 0.5;
      let sMin = Infinity, sMax = -Infinity, lMin = Infinity, lMax = -Infinity;
      for (let i = 0; i < 4; i++) {
        const a = i < 2 ? hl : -hl;
        const b = i === 0 || i === 3 ? hw : -hw;
        const x = cx + sn * a + cs * b;
        const z = cz + cs * a - sn * b;
        const sa = (x - pt.x) * pt.dx + (z - pt.z) * pt.dz;
        const la = (x - pt.x) * rx + (z - pt.z) * rz;
        if (sa < sMin) sMin = sa;
        if (sa > sMax) sMax = sa;
        if (la < lMin) lMin = la;
        if (la > lMax) lMax = la;
      }
      out.sMin = sObs + sMin;
      out.sMax = sObs + sMax;
      out.latMin = lMin;
      out.latMax = lMax;
    } else {
      out.sMin = sObs + along - r;
      out.sMax = sObs + along + r;
      out.latMin = lat - r;
      out.latMax = lat + r;
    }
    return true;
  }

  /**
   * Le couloir de contournement, à `off` m à droite de l'axe de l'itinéraire (décalage `shift` m à gauche de la voie
   * habituelle), est-il praticable de l'avant du véhicule jusqu'au-delà de l'obstacle : chaussée, sans mur, objet,
   * véhicule ni personne, et personne n'arrive en face ?
   */
  private corridorClear(rt: VehicleRt, ap: ApState, off: number, ext: Extent, shift: number, plain = false): boolean {
    const v = rt.v;
    const ctx = this.k.ctx;
    const world = ctx.world;
    const pt = this.pt2;
    const hw = rt.halfW;
    // (un débord de quelques décimètres au-dessus de la bordure est toléré : rétroviseurs, carrosserie)
    const hwIn = hw - 0.25;
    const s0 = Math.max(ap.s, ext.sMin - rt.halfL * 2 - 2);
    // (mur : couloir regardé à courte portée — la rue tourne ou se resserre là où l'axe relevé file tout droit ; on
    // longe l'espace libre de proche en proche, le contrôle est refait en avançant)
    const s1 = Math.min(ap.total, this.shortCorridor ? ext.sMin + 3 : ext.sMax + rt.halfL * 2 + 3);
    for (let s = s0; s <= s1; s += 1.5) {
      ap.sample(s, pt);
      const rx = -pt.dz, rz = pt.dx;
      // en amont de l'obstacle, le véhicule n'est qu'à moitié décalé
      const k = plain || s >= ext.sMin - rt.halfL ? 1 : 0.5;
      const o = off + (ap.laneOffset - off) * (1 - k);
      const x = pt.x + rx * o, z = pt.z + rz * o;
      if (!world.isFree(x, z, hw + 0.1)) return false;
      if (!this.drivable(x + rx * hwIn, z + rz * hwIn, this.kerbOk) || !this.drivable(x - rx * hwIn, z - rz * hwIn, this.kerbOk)) return false;
      const np = ctx.props.queryRadius(x, z, hw + 1.6, this.nearProps);
      for (let i = 0; i < np; i++) {
        const p = this.nearProps[i]!;
        if (!p.blocksMove || p.dormant || p.state === 'broken' || p.carriedBy !== 0 || p.id === ap.avoidProp) continue;
        const pr = p.halfX > p.halfZ ? p.halfX : p.halfZ;
        if (Math.hypot(p.x - x, p.z - z) < hw + pr + 0.15) return false;
      }
      const nv = ctx.vehicles.queryRadius(x, z, hw + 4, this.near);
      for (let i = 0; i < nv; i++) {
        const o2 = this.near[i]!;
        if (o2 === v || o2.dormant || o2.def.flying || o2.id === ap.avoidVeh || o2.id === ap.leaderId) continue;
        const or = Math.min(o2.def.length, o2.def.width) * 0.5;
        // distance au rectangle de l'autre véhicule
        const dx = x - o2.x, dz = z - o2.z;
        const sn = Math.sin(o2.heading), cs = Math.cos(o2.heading);
        const a = Math.abs(dx * sn + dz * cs) - o2.def.length * 0.5;
        const b = Math.abs(dx * cs - dz * sn) - o2.def.width * 0.5;
        const d = Math.hypot(Math.max(0, a), Math.max(0, b));
        if (d < hw + 0.3 && or >= 0) return false;
      }
      // (l'engin blindé avance au pas dans la foule, qui s'écarte devant lui : les personnes ne ferment pas son couloir,
      // le capteur l'arrête de toute façon devant quelqu'un)
      const ppl = v.def.canPush ? 0 : ctx.people.queryRadius(x, z, hw + 0.9, this.nearPeople);
      for (let i = 0; i < ppl; i++) {
        const p = this.nearPeople[i]!;
        if (p.vehicleId === 0 && !p.dormant) return false;
      }
    }
    // personne en face sur la voie empruntée, sur la longueur du dépassement (et un peu plus)
    const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
    const reach = s1 - ap.s + 30;
    const nv = ctx.vehicles.queryRadius(v.x + sn * reach * 0.5, v.z + cs * reach * 0.5, reach * 0.5 + 6, this.near);
    for (let i = 0; i < nv; i++) {
      const o2 = this.near[i]!;
      if (o2 === v || o2.dormant || o2.def.flying || o2.id === ap.avoidVeh) continue;
      if (Math.abs(o2.speed) < 0.8) continue;
      const toward = Math.sin(o2.heading) * sn + Math.cos(o2.heading) * cs;
      if (toward > -0.3) continue;
      const rx = o2.x - v.x, rz = o2.z - v.z;
      const fwd = rx * sn + rz * cs;
      if (fwd < -2 || fwd > reach) continue;
      const lat = rx * cs - rz * sn; // positif à gauche
      if (Math.abs(lat - shift) < hw + o2.def.width * 0.5 + 0.8) return false;
    }
    return true;
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
  private drivable(x: number, z: number, kerb = false): boolean {
    const s = this.k.ctx.world.surfaceAt(x, z);
    return s === 'road' || s === 'bridge' || s === 'sett' || s === 'plaza' || s === 'quay' || s === 'void' || (kerb && s === 'sidewalk');
  }

  /**
   * Demi-tour en plusieurs temps : marche avant braquée à fond, puis marche arrière contre-braquée, jusqu'à
   * se retrouver dans le sens de l'itinéraire. Retourne false quand la manœuvre est finie.
   */
  private uTurn(rt: VehicleRt, ap: ApState, err: number, dt: number): boolean {
    const v = rt.v;
    const cmd = v.cmd;
    // progrès : on a quitté l'endroit (4 m) ou l'écart de cap s'est réduit d'une demi-radian ; sinon le temps court
    const ae = err < 0 ? -err : err;
    if (Math.hypot(v.x - ap.uturnX, v.z - ap.uturnZ) > 4 || ae < ap.uturnErr - 0.5) {
      ap.uturnStallT = 0;
      ap.uturnX = v.x;
      ap.uturnZ = v.z;
      ap.uturnErr = ae;
    } else {
      ap.uturnStallT += dt;
    }
    if ((err < 1 && err > -1) || ap.uturnMoves > 8) {
      ap.uturn = 0;
      ap.obsDist = Infinity;
      // (demi-tour réussi : la mesure du progrès repart de zéro pour le suivant)
      if (err < 1 && err > -1) ap.uturnX = Infinity;
      if (ap.uturnMoves > 8 && (err >= 1 || err <= -1) && this.replan) {
        // huit reprises sans y parvenir (rue trop étroite, voitures garées) : on renonce au demi-tour et l'on repart
        // droit devant, par le tour du pâté de maisons (nouvel itinéraire, demi-tour sur place exclu)
        ap.uturnMoves = 0;
        this.replan(rt, ap, true);
      }
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
    // (déjà sur le trottoir — sorti de la chaussée à un angle de place : le trottoir compte, sinon aucune reprise
    // n'était possible et le véhicule restait là à « manœuvrer » sans bouger, toute sa colonne derrière lui)
    const blocked = ap.obsDist < 1.1 || !this.drivable(ex, ez, !this.drivable(v.x, v.z)) || ap.phaseT > (forward ? 7 : 5);
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
    if (ap.uturnStallT > UTURN_STALL) {
      // enfermé (véhicules arrêtés devant et derrière, chaussée trop étroite) : les reprises et les nouveaux itinéraires
      // recommençaient sans fin à l'état « manœuvre », que ni la conduite de la colonne ni la session (engins.ts) ne
      // reprennent — il continue d'essayer, mais se déclare « bloqué », le temps passé là faisant foi
      this.setStatus(rt, ap, 'bloque', ap.obsReason === 'vehicule' || ap.obsReason === 'obstacle' ? ap.obsReason : 'mur');
      ap.status.blockedFor = ap.uturnStallT;
    } else {
      this.setStatus(rt, ap, 'manoeuvre', '');
    }
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
