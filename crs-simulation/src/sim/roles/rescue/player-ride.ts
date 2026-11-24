/* =====================================================================================
 * SECOURS — le trajet de l'engin du joueur pompier ou soignant du SAMU, conduit par son conducteur (IA).
 *
 * Demande du commanditaire : « les street medics se déplacent à pied, mais les pompiers se déplacent dans leur
 * véhicule ; il faut que ce soit réaliste ». Le joueur n'est pas le conducteur de l'engin : c'est un équipier.
 *
 *   embarquement  l'appel arrive : l'équipage monte, le conducteur attend à sa portière ; l'engin attend le joueur
 *                 deux minutes au plus (rappels de l'équipage). Monté comme passager, le conducteur prend le volant
 *                 et l'engin part ; s'il prend lui-même le volant, c'est lui qui conduit (la carte le guide) ;
 *   route         deux tons, sirène et gyrophares, par le pilote automatique ; à 130 m, la zone est évaluée : non
 *                 sûre (foule hostile, projectiles, gaz), l'engin s'arrête à distance (attente) et ne s'engage pas
 *                 dans la foule ; sinon il s'arrête à 15–20 m des lieux ;
 *   sur place     tout le monde descend (le conducteur reste à la pompe ou au volant de l'ambulance), le travail se
 *                 fait comme d'habitude (player.ts) ;
 *   évacuation    (SAMU) la victime est à bord : l'équipage remonte, l'ambulance part, deux tons ;
 *   retour        intervention terminée : l'équipage remonte, l'engin attend le joueur, puis rentre au centre de
 *                 secours (ou à l'hôpital du SMUR) le plus proche — à défaut à son point de stationnement — sans
 *                 sirène. Un nouvel appel l'engage directement.
 * Tout près (moins de 50 m pour un feu, 80 m pour une victime), l'équipage y va à pied avec le joueur.
 * Sans pilote automatique, sans conducteur ou sans engin en état, le joueur conduit (ou va à pied) comme avant.
 * ===================================================================================== */

import type { EntityId, Person, RoadSample, Vec2, Vehicle } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';
import type { PlayerRideStage, PlayerRideView } from './api';
import { LEG_APPROACH, ROLE_CHIEF, ROLE_DRIVER, ableBody } from './crew';
import type { CallRec, Crew, RescueKernel, Rescuer } from './crew';
import type { CrewDriver } from './crew-drive';
import type { CrewTasks } from './crew-tasks';
import type { RescueRadio } from './radio';
import { nearestStation } from './stations';
import { DISMOUNT_RANGE, ETA_SPEED_VEHICLE } from './tuning';

/** Attente maximale du joueur avant le départ sans lui (s), premier rappel et intervalle des rappels. */
export const RIDE_WAIT_MAX = 120;
const REMIND_FIRST = 12;
const REMIND_EVERY = 25;
/** Attente du joueur avant une évacuation (s) : la victime n'attend pas. */
const EVAC_WAIT_MAX = 45;
/** En deçà, l'équipage va à pied avec le joueur (m). */
export const FOOT_RANGE: Readonly<Record<RescueKind, number>> = { pompiers: 50, samu: 80 };
/** Arrêt de l'engin avant les lieux, zone sûre (m) : à distance de lance, jamais dans l'attroupement. */
export const RIDE_STOP: Readonly<Record<RescueKind, number>> = { pompiers: 20, samu: 15 };
const ASSESS_RANGE = 130;
/** Le centre de secours (ou l'hôpital) n'est retenu pour le retour qu'à cette distance au plus du stationnement (m). */
const STATION_MAX = 1500;
/** Bloqué depuis ce temps près des lieux (s) : on finit à pied. */
const BLOCKED_DISMOUNT = 15;
/** Bloqué plus longtemps que cela (s) par un objet fixe ou des véhicules, à moins de cette distance (m) : on finit à pied. */
const FAR_DISMOUNT_PATIENCE = 90;
const FAR_DISMOUNT_RANGE = 400;

export class PlayerRide implements PlayerRideView {
  stage: PlayerRideStage = 'aucun';
  selfDrive = false;
  leftBehind = false;
  /** L'engin a été conduit par l'IA pour l'intervention en cours : il rentrera de lui-même. */
  aiRide = false;
  callsign = '';
  vehicleId: EntityId = 0;
  destX = 0;
  destZ = 0;
  destName = '';
  remaining = 0;
  /** L'engin roule (embarquement terminé). */
  private rolling = false;
  private since = 0;
  private remindAt = 0;
  private retryAt = 0;
  private holdAtStandoff = false;
  /** Début du blocage en cours sur l'itinéraire (−1 sinon). */
  private blockedSince = -1;
  /** Dégagement d'un engin buté sur un objet fixe (candélabre, potelet) : marche arrière braquée jusqu'à cet instant. */
  private backUntil = 0;
  private backTries = 0;
  private backSteer = 0;
  /** Retour sans attendre le joueur (resté loin derrière). */
  private alone = false;
  private readonly door: Vec2 = { x: 0, z: 0 };
  private readonly sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

  constructor(
    private readonly k: RescueKernel, private readonly tasks: CrewTasks, private readonly driver: CrewDriver,
    private readonly radio: RescueRadio,
  ) {}

  reset(): void {
    this.stage = 'aucun';
    this.selfDrive = false;
    this.leftBehind = false;
    this.aiRide = false;
    this.callsign = '';
    this.vehicleId = 0;
    this.destX = 0;
    this.destZ = 0;
    this.destName = '';
    this.remaining = 0;
    this.rolling = false;
    this.since = 0;
    this.remindAt = 0;
    this.retryAt = 0;
    this.holdAtStandoff = false;
    this.alone = false;
  }

  // ───────────────────────────── vue ─────────────────────────────

  get aiDriving(): boolean {
    return this.rolling && (this.stage === 'route' || this.stage === 'evacuation' || this.stage === 'retour');
  }

  get waitLeft(): number {
    if (this.rolling || (this.stage !== 'embarquement' && this.stage !== 'evacuation' && this.stage !== 'retour')) return -1;
    const max = this.stage === 'evacuation' ? EVAC_WAIT_MAX : RIDE_WAIT_MAX;
    return Math.max(0, max - (this.k.now - this.since));
  }

  /** Le trajet tient l'équipage (embarquement, route, évacuation, retour) : il ne suit pas le joueur à pied. */
  holdsCrew(): boolean {
    const s = this.stage;
    return s === 'embarquement' || s === 'route' || s === 'attente' || s === 'evacuation' || s === 'retour';
  }

  /** L'équipage est sur les lieux sans le joueur (parti sans lui) : il travaille seul. */
  crewOnSceneAlone(): boolean {
    return this.leftBehind && this.stage === 'sur_place';
  }

  // ───────────────────────────── événements ─────────────────────────────

  /** Un appel est confié à l'équipage du joueur. */
  start(crew: Crew, call: CallRec, p: Person): void {
    this.selfDrive = false;
    this.leftBehind = false;
    this.aiRide = false;
    this.holdAtStandoff = false;
    this.alone = false;
    this.bind(crew);
    const v = this.usable(crew);
    this.destX = call.x;
    this.destZ = call.z;
    this.destName = this.radio.address(call.x, call.z);
    if (!v) {
      this.stage = 'a_pied';
      return;
    }
    if (this.playerDrives(v, p)) {
      this.selfDrive = true;
      this.stage = 'aucun';
      return;
    }
    const aboard = p.vehicleId === v.id;
    const near = Math.hypot(v.x - call.x, v.z - call.z) <= FOOT_RANGE[call.kind] && Math.hypot(p.x - call.x, p.z - call.z) <= FOOT_RANGE[call.kind] * 1.5;
    if (!aboard && near) {
      this.stage = 'a_pied';
      return;
    }
    if (this.rolling) this.driver.halt(crew);
    this.enterBoard('embarquement');
  }

  /** L'intervention est finie (ou annulée). */
  ended(crew: Crew, p: Person | null | undefined): void {
    const v = this.usable(crew);
    const ai = this.aiRide && !this.selfDrive;
    this.selfDrive = false;
    this.aiRide = false;
    this.holdAtStandoff = false;
    const wasLeft = this.leftBehind;
    this.leftBehind = false;
    if (!v || !ai || !this.driverOf(crew)) {
      this.stage = 'aucun';
      this.rolling = false;
      return;
    }
    this.pickHome(crew);
    // le joueur est resté loin derrière : l'engin ne l'attend pas, il rentre (le joueur le rejoindra)
    this.enterBoard('retour');
    this.alone = wasLeft && !!p && p.vehicleId !== v.id && Math.hypot(p.x - v.x, p.z - v.z) > 150;
  }

  /** La victime est à bord de l'ambulance (SAMU, trajet conduit par l'IA) : on évacue. */
  evacuate(crew: Crew): void {
    if (this.stage !== 'sur_place' || this.selfDrive || !this.aiRide) return;
    this.destX = crew.homeX;
    this.destZ = crew.homeZ;
    this.destName = 'point de rassemblement des victimes';
    this.enterBoard('evacuation');
  }

  private enterBoard(stage: PlayerRideStage): void {
    this.stage = stage;
    this.rolling = false;
    this.since = this.k.now;
    this.remindAt = this.k.now + REMIND_FIRST;
  }

  private bind(crew: Crew): void {
    this.callsign = this.radio.unitName(crew);
    this.vehicleId = crew.vehicleId;
  }

  // ───────────────────────────── à chaque réflexion ─────────────────────────────

  think(crew: Crew, call: CallRec | null, p: Person): void {
    this.vehicleId = crew.vehicleId;
    if (this.callsign === '' && crew.members.length > 0) this.callsign = this.radio.unitName(crew);
    const v = crew.vehicle;
    // le joueur prend le volant à l'embarquement : il conduit lui-même jusqu'à la fin de l'intervention
    if (v && !this.rolling && (this.stage === 'embarquement' || this.stage === 'retour' || this.stage === 'evacuation') && this.playerDrives(v, p)) {
      this.selfDrive = this.stage !== 'retour';
      this.stage = 'aucun';
      return;
    }
    switch (this.stage) {
      case 'embarquement':
        if (!call || !call.live) { this.stage = 'aucun'; return; }
        if (!this.rolling) this.board(crew, call, p, RIDE_WAIT_MAX, false);
        break;
      case 'route':
      case 'attente':
        if (!call || !call.live) { this.driver.halt(crew); this.stage = 'aucun'; this.rolling = false; return; }
        this.route(crew, call, p);
        break;
      case 'evacuation':
        if (!this.rolling) {
          if (call) this.board(crew, call, p, EVAC_WAIT_MAX, false);
        } else {
          this.drive(crew, p, true);
        }
        break;
      case 'retour':
        if (!this.rolling) this.board(crew, call, p, RIDE_WAIT_MAX, true);
        else this.drive(crew, p, false);
        break;
      default:
        break;
    }
  }

  /**
   * L'engin attend son équipage et le joueur. Le conducteur reste à sa portière tant que le joueur n'est pas monté
   * (il peut encore choisir de prendre le volant) ; les autres montent. Rappels, puis départ (ou, au retour, l'équipage
   * redescend suivre le joueur).
   */
  private board(crew: Crew, call: CallRec | null, p: Person, waitMax: number, back: boolean): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const v = this.usable(crew);
    const drv = this.driverOf(crew);
    if (!v || !drv) {
      // plus d'engin en état ou personne pour le conduire : le joueur décide (à pied, ou au volant)
      this.stage = back ? 'aucun' : v ? 'aucun' : 'a_pied';
      return;
    }
    const aboard = p.vehicleId === v.id;
    const elapsed = now - this.since;
    // parti sans le joueur et resté loin derrière : la victime ne l'attend pas, l'ambulance évacue tout de suite
    const late = !aboard && (elapsed > waitMax
      || (this.stage === 'evacuation' && this.leftBehind && Math.hypot(p.x - v.x, p.z - v.z) > 150));
    let ready = true;
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      const q = r.p;
      if (q.isPlayer || !ableBody(ctx, q)) continue;
      if (r === drv) {
        if (aboard || late || this.alone) {
          if (!this.seatDriver(crew, r, v)) ready = false;
        } else {
          this.standBy(r, v);
          ready = false;
        }
      } else if (!this.tasks.board(crew, r)) {
        ready = false;
      }
    }
    if (!aboard && !this.alone) {
      if (late) {
        if (back) {
          // au retour, on ne laisse pas le joueur seul : l'équipage redescend et le suit
          this.stage = 'aucun';
          return;
        }
        if (!ready) return;
        this.leftBehind = true;
        if (this.stage === 'evacuation') {
          ctx.ui.notify('L’ambulance évacue la victime sans vous.', 'warn', 6);
        } else {
          if (call) this.radio.leftWithout(call, crew, p);
          ctx.ui.notify('Votre engin est parti sans vous : rejoignez les lieux par vos propres moyens.', 'warn', 6);
        }
      } else {
        if (now >= this.remindAt && elapsed < waitMax) {
          this.remindAt = now + REMIND_EVERY;
          this.radio.remind(crew, p, back);
          const left = Math.max(0, Math.round(waitMax - elapsed));
          ctx.ui.notify(back ? 'Votre engin vous attend pour rentrer : montez à bord.'
            : `Votre engin vous attend (encore ${left} s) : montez à bord comme passager, ou prenez le volant.`, 'warn', 5);
        }
        return;
      }
    }
    if (!ready) return;
    // tout le monde est à bord : on part
    if (this.stage === 'evacuation') {
      // pas d'itinéraire : l'équipage reste sur place, le joueur conduira (ou la victime sera remise sur place)
      if (!this.go(crew, this.destX, this.destZ, 0, true)) this.stage = 'sur_place';
      return;
    }
    if (back) {
      if (this.stage !== 'retour') return;
      this.pickHome(crew);
      if (!this.go(crew, this.destX, this.destZ, 0, false)) this.arrivedHome(crew);
      return;
    }
    if (!call) return;
    this.depart(crew, call);
  }

  /** Départ vers les lieux, deux tons. */
  private depart(crew: Crew, call: CallRec): void {
    const stop = RIDE_STOP[call.kind];
    this.destX = call.x;
    this.destZ = call.z;
    this.destName = this.radio.address(call.x, call.z);
    this.holdAtStandoff = false;
    this.blockedSince = -1;
    this.backUntil = 0;
    this.backTries = 0;
    crew.leg = LEG_APPROACH;
    crew.unstuck = 0;
    crew.unstickUntil = 0;
    if (!this.go(crew, call.x, call.z, stop, true)) {
      // pas d'itinéraire carrossable : l'équipage descend, on y va à pied
      this.k.ctx.ui.notify('Pas d’itinéraire pour l’engin : on y va à pied.', 'warn', 5);
      this.dismountAll(crew);
      this.stage = 'a_pied';
      return;
    }
    this.aiRide = true;
    this.stage = 'route';
    this.radio.rolling(call, crew, !this.leftBehind);
  }

  private go(crew: Crew, x: number, z: number, stop: number, urgent: boolean): boolean {
    const v = crew.vehicle;
    if (!v) return false;
    if (!this.driver.drive(crew, x, z, stop, urgent)) return false;
    if (!urgent) {
      const ext = this.k.vehiclesExt();
      if (ext) ext.setBeacons(v, false);
      else v.beacons = false;
    }
    this.rolling = true;
    this.retryAt = this.k.now + 5;
    return true;
  }

  /** Vers les lieux : arrêt à distance de travail, ou à distance de sécurité quand la zone n'est pas sûre. */
  private route(crew: Crew, call: CallRec, p: Person): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const v = this.usable(crew);
    const ap = k.autopilot();
    if (!v || !ap) {
      this.dismountAll(crew);
      this.stage = 'sur_place';
      return;
    }
    const drv = this.driverOf(crew);
    // le joueur est descendu en route, ou le conducteur n'est plus au volant : on s'arrête, on rembarque
    if ((!this.leftBehind && p.vehicleId !== v.id) || !drv || !this.atWheel(drv.p, v)) {
      this.driver.halt(crew);
      if (this.stage === 'attente' && p.vehicleId !== v.id) {
        // à l'arrêt devant une zone non sûre, le joueur décide d'y aller à pied : l'équipage le suit
        this.stage = 'aucun';
        this.rolling = false;
        return;
      }
      if (drv && p.vehicleId !== v.id
        && Math.min(Math.hypot(v.x - call.x, v.z - call.z), Math.hypot(p.x - call.x, p.z - call.z)) <= DISMOUNT_RANGE) {
        // descendu tout près des lieux : il finit à pied, l'équipage descend avec lui (l'engin ne l'attend pas pour
        // repartir « sans lui » deux minutes plus tard)
        this.arrive(crew, call, p);
        return;
      }
      this.enterBoard('embarquement');
      this.remindAt = now + 4;
      return;
    }
    const st = ap.status(v);
    const d = Math.hypot(v.x - call.x, v.z - call.z);
    const stop = RIDE_STOP[call.kind];
    this.remaining = st.remaining > 1 ? st.remaining : d;
    call.eta = this.remaining / ETA_SPEED_VEHICLE;
    // détour par un point de passage (l'état lu est alors celui du détour : on décidera au prochain passage)
    const detour = crew.via;
    // coincé contre un mur, ou buté sur un objet fixe trop loin des lieux pour finir à pied : marche arrière braquée,
    // puis nouvelle approche
    if (this.backOff(crew, v, st, st.reason === 'mur' || (d > DISMOUNT_RANGE && !k.safety.barred(v.x, v.z, call.x, call.z, call.targetProp)),
      call.x, call.z, stop, true)) return;
    if (this.driver.viaStep(crew) || detour) return;
    const t = k.tuning;
    // évaluation de la zone à l'approche
    let reason = '';
    if (d < ASSESS_RANGE) {
      const rep = k.safety.assess(call.kind, call.x, call.z, v.x, v.z, v.id, call.targetProp);
      if (!rep.safe) reason = rep.reason;
    }
    if (reason !== '') {
      call.waitingReason = reason;
      call.record.waitReason = reason;
      if (d <= t.standoff + 6 || st.state === 'arrive' || (this.holdAtStandoff && Math.abs(v.speed) < 0.4)) {
        if (this.stage !== 'attente') {
          this.driver.halt(crew);
          this.stage = 'attente';
          if (call.state === 'en_route') k.setState(call, 'en_attente');
          this.radio.waiting(call, crew);
          ctx.ui.notify(`L’engin s’arrête à distance : ${reason}. La police doit sécuriser l’accès.`, 'warn', 6);
        }
        call.record.waited += 0.25;
        call.eta = 0;
      } else if (!this.holdAtStandoff) {
        // on ne s'engage pas : arrêt à la distance de sécurité
        this.holdAtStandoff = true;
        this.driver.drive(crew, call.x, call.z, t.standoff, true);
      }
      return;
    }
    if (this.stage === 'attente' || this.holdAtStandoff) {
      // zone de nouveau sûre : on reprend l'approche
      call.waitingReason = '';
      if (call.state === 'en_attente') k.setState(call, 'en_route');
      this.stage = 'route';
      this.holdAtStandoff = false;
      this.driver.drive(crew, call.x, call.z, stop, true);
      return;
    }
    if (st.state === 'arrive' || (d <= stop + 8 && Math.abs(v.speed) < 0.5)) {
      this.arrive(crew, call, p);
      return;
    }
    // rue encombrée (foule, véhicules, obstacle) près des lieux : on finit à pied ; plus loin, on cherche un autre passage
    if (Math.abs(v.speed) > 1.5) this.blockedSince = -1;
    else if ((st.state === 'bloque' || st.state === 'attente') && this.blockedSince < 0) this.blockedSince = now - st.blockedFor;
    if ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > BLOCKED_DISMOUNT) {
      // près des lieux, ou bloqué pour de bon par un objet fixe ou des véhicules à l'arrêt : on finit à pied
      // (une foule peut s'ouvrir : on patiente, on ne force jamais le passage)
      const stuck = this.blockedSince >= 0 && now - this.blockedSince > FAR_DISMOUNT_PATIENCE && d <= FAR_DISMOUNT_RANGE && st.reason !== 'personne';
      if (d <= DISMOUNT_RANGE || stuck) {
        ctx.ui.notify('Rue encombrée : l’engin s’arrête, on finit à pied.', 'info', 5);
        this.arrive(crew, call, p);
      } else if (now >= this.retryAt && st.blockedFor > 30) {
        this.retryAt = now + 20;
        this.driver.drive(crew, call.x, call.z, stop, true);
      }
      return;
    }
    if (st.state === 'echec') {
      if (d <= 400) this.arrive(crew, call, p);
      else if (now >= this.retryAt) {
        this.retryAt = now + 5;
        this.driver.drive(crew, call.x, call.z, stop, true);
      }
    }
  }

  /** Sur les lieux : on coupe la sirène (les gyrophares restent), tout le monde descend sauf le conducteur. */
  private arrive(crew: Crew, call: CallRec, p: Person): void {
    const k = this.k;
    const v = crew.vehicle;
    this.driver.halt(crew);
    if (v) {
      const ext = k.vehiclesExt();
      if (ext) ext.setSiren(v, 0);
      else v.siren = 0;
    }
    this.rolling = false;
    this.remaining = 0;
    this.dismountAll(crew, p);
    this.stage = 'sur_place';
    if (this.leftBehind && call.state !== 'sur_place') {
      k.setState(call, 'sur_place');
      if (call.record.arrivedAt < 0) call.record.arrivedAt = k.now;
      crew.phaseAt = k.now;
      crew.lastFireAt = k.now;
      crew.lastVictimAt = k.now;
    }
    this.radio.onScene(call, crew);
  }

  /** Trajet d'évacuation ou de retour. */
  private drive(crew: Crew, p: Person, urgent: boolean): void {
    const k = this.k;
    const now = k.now;
    const v = this.usable(crew);
    const ap = k.autopilot();
    if (!v || !ap) {
      this.stage = 'aucun';
      this.rolling = false;
      return;
    }
    const drv = this.driverOf(crew);
    if (p.vehicleId !== v.id && !this.alone && !(this.stage === 'evacuation' && this.leftBehind)) {
      // le joueur est descendu : on l'attend de nouveau
      this.driver.halt(crew);
      this.enterBoard(this.stage);
      this.remindAt = now + 4;
      return;
    }
    if (!drv || !this.atWheel(drv.p, v)) {
      this.driver.halt(crew);
      this.enterBoard(this.stage);
      return;
    }
    const st = ap.status(v);
    const d = Math.hypot(v.x - this.destX, v.z - this.destZ);
    this.remaining = st.remaining > 1 ? st.remaining : d;
    // détour par un point de passage (l'état lu est alors celui du détour : on décidera au prochain passage)
    const detour = crew.via;
    if (this.backOff(crew, v, st, st.reason === 'mur' || d > 40, this.destX, this.destZ, 0, urgent)) return;
    if (this.driver.viaStep(crew) || detour) return;
    if (this.stage === 'retour' && (st.state === 'arrive' || (d <= 15 && Math.abs(v.speed) < 0.5) || st.state === 'echec')) {
      this.arrivedHome(crew);
      return;
    }
    if (this.stage === 'evacuation' && st.state === 'echec' && now >= this.retryAt) {
      this.retryAt = now + 5;
      this.driver.drive(crew, this.destX, this.destZ, 0, urgent);
    }
  }

  /**
   * Engin buté sur un mur ou un objet fixe (candélabre, potelet, borne) : le conducteur recule en braquant (quatre secondes, côté
   * alterné à chaque essai), puis reprend l'itinéraire sous un autre angle. Six essais par blocage ; remis à zéro dès
   * que l'engin roule de nouveau. true tant que la manœuvre est en cours.
   */
  private backOff(crew: Crew, v: Vehicle, st: { state: string; reason: string; blockedFor: number }, allowed: boolean,
    x: number, z: number, stop: number, urgent: boolean): boolean {
    const now = this.k.now;
    if (Math.abs(v.speed) > 3 && this.backUntil === 0) this.backTries = 0;
    if (now < this.backUntil) {
      if (!this.driver.reverse(crew)) this.backUntil = now;
      else v.cmd.steer = this.backSteer;
      return true;
    }
    if (this.backUntil > 0) {
      this.backUntil = 0;
      this.driver.halt(crew);
      this.driver.drive(crew, x, z, stop, urgent);
      return true;
    }
    if (!allowed || st.state !== 'bloque' || (st.reason !== 'obstacle' && st.reason !== 'mur') || st.blockedFor < 6 || this.backTries >= 6) return false;
    this.backTries++;
    this.backSteer = this.backTries % 2 === 1 ? 0.7 : -0.7;
    const ap = this.k.autopilot();
    if (ap) ap.stop(v);
    this.backUntil = now + 4;
    return true;
  }

  private arrivedHome(crew: Crew): void {
    const v = crew.vehicle;
    this.driver.halt(crew);
    if (v) {
      const ext = this.k.vehiclesExt();
      if (ext) {
        ext.setSiren(v, 0);
        ext.setBeacons(v, false);
      } else {
        v.siren = 0;
        v.beacons = false;
      }
    }
    this.rolling = false;
    this.remaining = 0;
    this.alone = false;
    this.stage = 'rentre';
    this.radio.available(crew, this.destName);
  }

  /** Remise de l'engin : le centre de secours (l'hôpital du SMUR) le plus proche du stationnement, sinon le stationnement. */
  private pickHome(crew: Crew): void {
    const ctx = this.k.ctx;
    const hx = crew.homeX;
    const hz = crew.homeZ;
    const s = nearestStation(crew.kind, hx, hz);
    const out = this.sample;
    if (Math.hypot(s.x - hx, s.z - hz) <= STATION_MAX && ctx.world.nearestRoad(s.x, s.z, out, 120)) {
      this.destX = out.x;
      this.destZ = out.z;
      this.destName = crew.kind === 'pompiers' ? `au centre de secours ${s.name}` : `à l’hôpital ${s.name}`;
    } else {
      this.destX = hx;
      this.destZ = hz;
      this.destName = 'au point de stationnement';
    }
  }

  // ───────────────────────────── équipage et engin ─────────────────────────────

  /** L'engin de l'équipage, s'il roule encore et que le pilote automatique est branché. */
  private usable(crew: Crew): Vehicle | null {
    const v = crew.vehicle;
    if (!v || crew.onFoot || !this.k.autopilot()) return null;
    if (v.state === 'wrecked' || v.state === 'burning' || v.state === 'burnt') return null;
    if (this.k.ctx.vehicles.get(v.id) !== v) return null;
    return v;
  }

  private driverSeat(v: Vehicle): number {
    const seats = v.def.seats;
    for (let i = 0; i < seats.length; i++) if (seats[i].role === 'driver') return i;
    return -1;
  }

  /** Le joueur est-il au volant de l'engin ? */
  playerDrives(v: Vehicle, p: Person): boolean {
    const s = this.driverSeat(v);
    return s >= 0 && v.seats[s] === p.id;
  }

  private atWheel(q: Person, v: Vehicle): boolean {
    const s = this.driverSeat(v);
    return s >= 0 && v.seats[s] === q.id;
  }

  /** Conducteur de l'engin : le conducteur désigné, sinon un équipier qui n'est pas le chef. */
  driverOf(crew: Crew): Rescuer | null {
    const ctx = this.k.ctx;
    let fallback: Rescuer | null = null;
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      if (r.p.isPlayer || !ableBody(ctx, r.p)) continue;
      if (r.role === ROLE_DRIVER) return r;
      if (r.role !== ROLE_CHIEF || !fallback) fallback = r;
    }
    return fallback;
  }

  /** Point au sol devant la portière d'un siège. */
  private doorPoint(v: Vehicle, seat: number, out: Vec2): void {
    const s = v.def.seats[seat];
    const sn = Math.sin(v.heading);
    const cs = Math.cos(v.heading);
    out.x = v.x - cs * s.exitX + sn * s.exitZ;
    out.z = v.z + sn * s.exitX + cs * s.exitZ;
  }

  /** Le conducteur attend à sa portière, tourné vers l'engin. */
  private standBy(r: Rescuer, v: Vehicle): void {
    const ctx = this.k.ctx;
    const q = r.p;
    if (q.vehicleId !== 0) return; // déjà à bord : il y reste
    const seat = this.driverSeat(v);
    if (seat < 0) return;
    this.doorPoint(v, seat, this.door);
    if (Math.hypot(this.door.x - q.x, this.door.z - q.z) > 1.6) r.walker.goTo(ctx, q, this.door.x, this.door.z, 1.4);
    else r.walker.stop(q);
  }

  /** Le conducteur prend le volant (il change de place s'il était assis ailleurs). true quand il y est. */
  private seatDriver(crew: Crew, r: Rescuer, v: Vehicle): boolean {
    const ctx = this.k.ctx;
    const q = r.p;
    const seat = this.driverSeat(v);
    if (seat < 0) return this.tasks.board(crew, r);
    if (v.seats[seat] === q.id) return true;
    if (v.seats[seat] !== 0) return this.tasks.board(crew, r); // volant pris (par le joueur) : il monte ailleurs
    if (q.vehicleId === v.id) {
      ctx.vehicles.exit(q);
      return ctx.vehicles.enter(q, v, seat);
    }
    if (q.vehicleId !== 0) ctx.vehicles.exit(q);
    this.doorPoint(v, seat, this.door);
    if (Math.hypot(this.door.x - q.x, this.door.z - q.z) <= 1.6) {
      r.walker.stop(q);
      return ctx.vehicles.enter(q, v, seat);
    }
    r.walker.goTo(ctx, q, this.door.x, this.door.z, 1.4);
    return false;
  }

  /** Tout le monde descend (le joueur compris), sauf le conducteur qui garde l'engin. */
  private dismountAll(crew: Crew, p?: Person): void {
    const ctx = this.k.ctx;
    const drv = this.driverOf(crew);
    for (let i = 0; i < crew.members.length; i++) {
      const q = crew.members[i].p;
      if (q.vehicleId === 0 || q.isPlayer) continue;
      if (drv && q === drv.p && crew.vehicle) continue;
      ctx.vehicles.exit(q);
    }
    if (p && crew.vehicle && p.vehicleId === crew.vehicle.id) ctx.vehicles.exit(p);
  }
}
