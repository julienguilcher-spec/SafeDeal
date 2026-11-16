/* =====================================================================================
 * SECOURS — régulation des appels et conduite d'un équipage, du départ au retour.
 *
 *   demande      l'appel est pris ; délai de régulation et de départ (18 à 32 s, plus court pour un moyen
 *                pré-positionné, plus long si aucun moyen n'était engagé sur la mission) ; temps d'arrivée estimé ;
 *   en_route     l'engin part du bord de la carte (ou de son stationnement), sirène et feux, par le pilote
 *                automatique des véhicules ; sans véhicules, l'équipe vient à pied ;
 *   en_attente   à l'approche (130 m), l'équipage évalue la zone (safety.ts). Zone non sûre : il s'arrête à
 *                distance (55 m) et dit pourquoi ; il repart dès qu'un itinéraire dégagé et une protection
 *                existent. Un itinéraire bloqué (barricade, foule, véhicules) donne le même état ;
 *   sur_place    l'équipage descend et travaille (crew-fire.ts, crew-medical.ts). Pris à partie, il ne se
 *                défend pas : il remonte et se replie à distance, puis attend une protection ;
 *   reparti      matériel rangé, tout le monde à bord, retour ; l'engin quitte la carte avec son équipage
 *                (et la victime évacuée), ou regagne son stationnement s'il était pré-positionné.
 * ===================================================================================== */

import type { EntityId, Person, RayHit } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueCall, RescueKind } from '@/core/extensions';
import {
  CallRec, C_GONE, C_LEAVE, C_PACK, C_STAGED, C_TRAVEL, C_WAIT, C_WORK, LEG_APPROACH, LEG_FINAL, LEG_HOLD, ROLE_DRIVER, T_FOLLOW,
  T_IDLE, ableBody,
} from './crew';
import type { Crew, RescueKernel } from './crew';
import type { FireWork } from './crew-fire';
import type { MedicalWork } from './crew-medical';
import type { CrewTasks } from './crew-tasks';
import type { PlayerCrew } from './player';
import type { RescueRadio } from './radio';
import type { RecordsStore } from './records';
import type { Origin, Spawner } from './spawn';
import {
  BLOCKED_PATIENCE, CALL_LINGER, CRUISE_RETURN, CRUISE_URGENT, DISMOUNT_RANGE, ETA_SPEED_FOOT, ETA_SPEED_VEHICLE, PACK_TIME,
  RETREAT_TIME, SAME_CALL_RANGE,
} from './tuning';

/** Phase propre au repli : remonter à bord, puis reculer à distance. */
const C_RETREAT = 7;
const ASSESS_RANGE = 130;
const THINK_PERIOD = 0.25;

export class Dispatcher {
  player!: PlayerCrew;
  private nextCall = 1;
  private nextCrew = 1;
  private readonly origin: Origin = { x: 0, z: 0, heading: 0, length: 0, road: false };
  private readonly hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  /** Points de départ retenus par appel (pris à la demande, utilisés au départ). */
  private readonly origins = new Map<number, Origin>();
  /** Aucun moyen n'était engagé sur la mission pour ce service : les secours viennent de plus loin. */
  external: Record<RescueKind, boolean> = { pompiers: false, samu: false };

  constructor(
    private readonly k: RescueKernel, private readonly spawner: Spawner, private readonly tasks: CrewTasks,
    private readonly fire: FireWork, private readonly medical: MedicalWork, private readonly radio: RescueRadio,
    private readonly records: RecordsStore,
  ) {}

  reset(): void {
    this.nextCall = 1;
    this.nextCrew = 1;
    this.origins.clear();
    this.external.pompiers = false;
    this.external.samu = false;
  }

  // ───────────────────────────── appels ─────────────────────────────

  request(kind: RescueKind, x: number, z: number, byId: EntityId, incidentId = 0): RescueCall {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const calls = k.calls;
    // la même intervention n'est pas demandée deux fois
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (!c.live || c.kind !== kind) continue;
      if (incidentId !== 0 && c.incidentId === incidentId) return c;
      if (Math.hypot(c.x - x, c.z - z) <= SAME_CALL_RANGE && (incidentId === 0 || c.incidentId === 0)) {
        if (c.incidentId === 0 && incidentId !== 0) {
          c.incidentId = incidentId;
          c.record.incidentId = incidentId;
        }
        return c;
      }
    }
    const call = new CallRec(this.nextCall++, kind, x, z, incidentId, byId, now);
    calls.push(call);
    this.records.add(call.record);
    let urgent = false;
    if (incidentId !== 0) {
      const inc = ctx.service<IncidentsApi>(EXT.incidents)?.get(incidentId);
      if (inc) {
        if (inc.targetKind === 'prop') call.targetProp = inc.targetId;
        urgent = inc.urgency >= 3;
      }
    }
    // l'équipage du joueur prend l'appel s'il est du bon service et disponible
    if (this.player.canTake(kind)) {
      this.player.engage(call);
      return call;
    }
    const t = k.tuning;
    const staged = this.freeStaged(kind, x, z);
    let delay = k.rng.range(t.dispatchMin, t.dispatchMax);
    if (urgent) delay *= 0.7;
    if (staged) delay = Math.min(delay, 10);
    else if (this.external[kind]) delay *= 2;
    delay *= t.delayScale;
    call.departAt = now + delay;
    if (staged) {
      call.routeLength = Math.hypot(staged.posX() - x, staged.posZ() - z) * 1.3;
    } else if (this.spawner.pickOrigin(x, z, this.origin)) {
      const o = this.origin;
      this.origins.set(call.id, { x: o.x, z: o.z, heading: o.heading, length: o.length, road: o.road });
      call.routeLength = o.length;
    } else {
      // aucun point de départ utilisable (lieu enclavé) : les secours ne peuvent pas venir
      call.waitingReason = 'aucun accès pour les secours';
      k.setState(call, 'annule');
      call.record.cancelled = true;
      return call;
    }
    const origin = this.origins.get(call.id);
    call.eta = delay + call.routeLength / (staged || (origin && origin.road) ? ETA_SPEED_VEHICLE : ETA_SPEED_FOOT);
    if (!staged && this.busyCount(kind) >= (kind === 'pompiers' ? t.maxPompiers : t.maxSamu)) {
      call.queued = true;
      call.waitingReason = 'tous les moyens sont engagés';
      this.radio.queued(call);
    } else {
      this.radio.dispatched(call);
    }
    return call;
  }

  cancel(callId: number): void {
    const k = this.k;
    const call = this.callById(callId);
    if (!call || !call.live) return;
    if (call.state === 'sur_place' && !call.playerLed) return; // l'équipage au travail finit ce qu'il a commencé
    call.record.cancelled = true;
    call.waitingReason = '';
    const crew = call.crew;
    k.setState(call, 'annule');
    this.origins.delete(call.id);
    if (!crew) return;
    if (crew.playerLed) {
      this.player.released(call);
      return;
    }
    // demi-tour : l'équipage rentre
    this.startLeave(crew, false);
  }

  callById(id: number): CallRec | null {
    const calls = this.k.calls;
    for (let i = 0; i < calls.length; i++) if (calls[i].id === id) return calls[i];
    return null;
  }

  private busyCount(kind: RescueKind): number {
    const crews = this.k.crews;
    let n = 0;
    for (let i = 0; i < crews.length; i++) {
      const c = crews[i];
      if (c.kind === kind && !c.playerLed && c.phase !== C_STAGED && c.phase !== C_GONE) n++;
    }
    return n;
  }

  /** Équipage pré-positionné libre du bon service, le plus proche. */
  private freeStaged(kind: RescueKind, x: number, z: number): Crew | null {
    const crews = this.k.crews;
    let best: Crew | null = null;
    let bestD = Infinity;
    for (let i = 0; i < crews.length; i++) {
      const c = crews[i];
      if (c.kind !== kind || c.playerLed || c.phase !== C_STAGED || c.call) continue;
      const d = Math.hypot(c.posX() - x, c.posZ() - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Crée un équipage pré-positionné (engin garé, équipage à bord). */
  stage(kind: RescueKind, x: number, z: number, heading: number): Crew | null {
    const k = this.k;
    const vehicles = !!k.autopilot();
    const crew = this.spawner.createCrew(kind, this.nextCrew++, x, z, heading, vehicles);
    crew.staged = true;
    crew.homeX = x;
    crew.homeZ = z;
    crew.homeHeading = heading;
    crew.phase = C_STAGED;
    k.crews.push(crew);
    return crew;
  }

  // ───────────────────────────── à chaque pas ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    const now = k.now;
    const calls = k.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
      const c = calls[i];
      if (!c.live && now - c.closedAt > CALL_LINGER) calls.splice(i, 1);
    }
    // les appels en attente sont servis dans l'ordre où ils ont été passés
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c.live && c.state === 'demande' && !c.playerLed) this.pending(c);
    }
    this.flushPending();
    const crews = k.crews;
    for (let i = crews.length - 1; i >= 0; i--) {
      const crew = crews[i];
      if (crew.playerLed) continue;
      if (crew.phase !== C_STAGED) this.tasks.stepWalkers(crew);
      if (now < crew.thinkAt) continue;
      // loin du joueur, l'équipage réfléchit moins souvent
      const elapsed = now - (crew.thinkAt - crew.period);
      crew.period = this.farFromPlayer(crew) ? THINK_PERIOD * 3 : THINK_PERIOD;
      crew.thinkAt = now + crew.period;
      this.think(crew, elapsed > 1 ? 1 : elapsed < 0 ? dt : elapsed);
    }
  }

  private farFromPlayer(crew: Crew): boolean {
    const p = this.k.ctx.player.person();
    if (!p) return false;
    const d = Math.hypot(crew.posX() - p.x, crew.posZ() - p.z);
    return d > 160 && crew.phase !== C_WORK;
  }

  /** Demandes d'une ambulance supplémentaire : elles partent quand l'appel qui occupait le lieu est clos. */
  private flushPending(): void {
    const k = this.k;
    const list = k.pendingSamu;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      const prior = this.callById(d.after);
      if (prior && prior.live) continue;
      list.splice(i, 1);
      const victim = k.ctx.people.get(d.victimId);
      if (!victim || victim.posture !== 'down' || victim.vehicleId !== 0) continue;
      this.request('samu', victim.x, victim.z, 0, k.incidentOfPerson(victim.id) || d.incidentId);
    }
  }

  /** Appel en attente de départ. */
  private pending(call: CallRec): void {
    const k = this.k;
    const now = k.now;
    const t = k.tuning;
    const origin = this.origins.get(call.id);
    const road = !origin || origin.road;
    const travel = call.routeLength / (road ? ETA_SPEED_VEHICLE : ETA_SPEED_FOOT);
    if (now < call.departAt) {
      call.eta = call.departAt - now + travel;
      return;
    }
    const staged = this.freeStaged(call.kind, call.x, call.z);
    if (!staged && this.busyCount(call.kind) >= (call.kind === 'pompiers' ? t.maxPompiers : t.maxSamu)) {
      // tous les moyens sont engagés : l'appel attend qu'un équipage se libère
      call.queued = true;
      call.waitingReason = 'tous les moyens sont engagés';
      call.eta = 60 + travel;
      return;
    }
    call.queued = false;
    call.waitingReason = '';
    this.depart(call, staged);
  }

  private depart(call: CallRec, staged: Crew | null): void {
    const k = this.k;
    const now = k.now;
    let crew = staged;
    if (!crew) {
      let o = this.origins.get(call.id);
      if (!o) {
        if (!this.spawner.pickOrigin(call.x, call.z, this.origin)) {
          call.departAt = now + 10; // nouvel essai
          return;
        }
        o = this.origin;
      }
      crew = this.spawner.createCrew(call.kind, this.nextCrew++, o.x, o.z, o.heading, o.road && !!k.autopilot());
      k.crews.push(crew);
    }
    this.origins.delete(call.id);
    crew.call = call;
    call.crew = crew;
    call.vehicleId = crew.vehicleId;
    call.record.departedAt = now;
    crew.phase = C_TRAVEL;
    crew.leg = LEG_APPROACH;
    crew.phaseAt = now;
    crew.foundWork = false;
    crew.askedSamu = false;
    crew.leftBehind = 0;
    crew.blockedSince = -1;
    crew.retreatUntil = 0;
    crew.walking = false;
    crew.bestDistance = Infinity;
    crew.bestAt = now;
    crew.unstuck = 0;
    crew.unstickUntil = 0;
    crew.thinkAt = now;
    for (let i = 0; i < crew.members.length; i++) {
      crew.members[i].reset();
      crew.members[i].hoseSet = false;
    }
    k.setState(call, 'en_route');
    this.drive(crew, call.x, call.z, k.tuning.standoff, true);
  }

  /**
   * Lance l'engin vers un point (sirène et feux en intervention). Si l'itinéraire repart dans son dos, il passe
   * d'abord par un point situé devant lui (tour du pâté de maisons) plutôt que de tenter un demi-tour sur place.
   * false s'il n'y a pas d'itinéraire.
   */
  private drive(crew: Crew, x: number, z: number, stopBefore: number, urgent: boolean): boolean {
    const k = this.k;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (!v || !ap || crew.onFoot) return false;
    const ext = k.vehiclesExt();
    if (ext) {
      ext.setBeacons(v, true);
      ext.setSiren(v, urgent ? 1 : 0);
    } else {
      v.beacons = true;
      v.siren = urgent ? 1 : 0;
    }
    crew.destX = x;
    crew.destZ = z;
    crew.destStop = stopBefore;
    crew.destUrgent = urgent;
    crew.via = false;
    const speed = urgent ? CRUISE_URGENT : CRUISE_RETURN;
    if (this.spawner.pickVia(v, x, z, this.origin) && ap.driveTo(v, this.origin.x, this.origin.z, { speed, urgence: urgent })) {
      crew.via = true;
      crew.viaX = this.origin.x;
      crew.viaZ = this.origin.z;
      return true;
    }
    return ap.driveTo(v, x, z, { speed, urgence: urgent, stopBefore });
  }

  /** Point de passage atteint (ou impraticable) : on prend la route de la destination. Retourne true tant que le détour est en cours. */
  private viaStep(crew: Crew): boolean {
    if (!crew.via) return false;
    const k = this.k;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (!v || !ap) {
      crew.via = false;
      return false;
    }
    const st = ap.status(v);
    const d = Math.hypot(v.x - crew.viaX, v.z - crew.viaZ);
    if (d > 24 && st.state !== 'arrive' && st.state !== 'echec' && !(st.state === 'bloque' && st.blockedFor > 8)) return true;
    crew.via = false;
    ap.driveTo(v, crew.destX, crew.destZ, { speed: crew.destUrgent ? CRUISE_URGENT : CRUISE_RETURN, urgence: crew.destUrgent, stopBefore: crew.destStop });
    return false;
  }

  /**
   * Engin coincé contre un mur dans sa manœuvre : le conducteur recule de quelques mètres, puis reprend sa route
   * (trois tentatives). Retourne true tant que le dégagement est en cours.
   */
  private unstick(crew: Crew, blockedByWall: boolean): boolean {
    const k = this.k;
    const now = k.now;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (!v || !ap) return false;
    if (now < crew.unstickUntil) {
      if (!this.reverse(crew)) crew.unstickUntil = now; // plus de place derrière
      return true;
    }
    if (crew.unstickUntil > 0) {
      // fin du recul : on repart vers la destination
      crew.unstickUntil = 0;
      this.halt(crew);
      this.drive(crew, crew.destX, crew.destZ, crew.destStop, crew.destUrgent);
      return true;
    }
    if (!blockedByWall || crew.unstuck >= 3) return false;
    crew.unstuck++;
    ap.stop(v);
    crew.unstickUntil = now + 2.5;
    return true;
  }

  /**
   * L'équipage quitte l'engin et poursuit à pied. `lost` : l'engin est hors d'usage (il ne servira plus) ;
   * sinon il reste garé là, et l'équipage y reviendra pour repartir (et pour y charger une victime).
   */
  private dismount(crew: Crew, lost = false): void {
    const k = this.k;
    const ctx = k.ctx;
    const v = crew.vehicle;
    if (v) {
      this.halt(crew);
      const ext = k.vehiclesExt();
      if (ext) ext.setSiren(v, 0);
      else v.siren = 0;
    }
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      const p = r.p;
      // le conducteur reste à l'engin laissé en retrait
      if (!lost && r.role === ROLE_DRIVER && crew.members.length > 2) continue;
      if (p.vehicleId !== 0) ctx.vehicles.exit(p);
    }
    if (lost) crew.onFoot = true;
    else crew.walking = true;
    crew.bestDistance = Infinity;
    crew.bestAt = k.now;
  }

  // ───────────────────────────── réflexion d'un équipage ─────────────────────────────

  private think(crew: Crew, dt: number): void {
    const call = crew.call;
    this.noteCasualties(crew);
    switch (crew.phase) {
      case C_TRAVEL:
      case C_WAIT:
        if (call) this.travel(crew, call, dt);
        break;
      case C_WORK:
        if (call) this.work(crew, call, dt);
        break;
      case C_RETREAT:
        if (call) this.retreat(crew, call);
        break;
      case C_PACK:
        this.pack(crew);
        break;
      case C_LEAVE:
        this.leave(crew);
        break;
      default:
        break;
    }
  }

  /** Un membre blessé pendant l'intervention est compté ; un membre hors de combat ne fait plus partie de la manœuvre. */
  private noteCasualties(crew: Crew): void {
    const call = crew.call;
    if (!call) return;
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      if (!r.hurt && (r.p.injury === 'serious' || r.p.injury === 'critical' || r.p.injury === 'dead')) {
        r.hurt = true;
        call.record.crewHurt++;
      }
    }
  }

  private enterWait(crew: Crew, call: CallRec, reason: string): void {
    const k = this.k;
    call.waitingReason = reason;
    call.record.waitReason = reason;
    if (call.state !== 'en_attente') {
      k.setState(call, 'en_attente');
      crew.phase = C_WAIT;
      if (k.now - call.waitRadioAt > 40) {
        call.waitRadioAt = k.now;
        this.radio.waiting(call, crew);
      }
    }
  }

  private exitWait(crew: Crew, call: CallRec): void {
    if (call.state !== 'en_attente') return;
    call.waitingReason = '';
    this.k.setState(call, 'en_route');
    crew.phase = C_TRAVEL;
  }

  private blockReason(code: string): string {
    switch (code) {
      case 'personne': return 'foule sur la chaussée';
      case 'vehicule': return 'voie encombrée par des véhicules';
      case 'obstacle': return 'rue barrée par un obstacle';
      case 'fermeture': return 'rue fermée à la circulation';
      default: return 'aucun itinéraire carrossable';
    }
  }

  private travel(crew: Crew, call: CallRec, dt: number): void {
    const k = this.k;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (crew.onFoot || crew.walking || !v || !ap) {
      this.travelOnFoot(crew, call, dt);
      return;
    }
    if (v.state === 'wrecked' || v.state === 'burning' || v.state === 'burnt') {
      this.dismount(crew, true); // engin hors d'usage : on continue à pied
      return;
    }
    const now = k.now;
    const t = k.tuning;
    const work = call.kind === 'pompiers' ? t.workDistanceFire : t.workDistanceCare;
    const st = ap.status(v);
    const dScene = Math.hypot(v.x - call.x, v.z - call.z);
    call.eta = (st.remaining > 1 && !crew.via ? st.remaining : dScene * 1.3) / ETA_SPEED_VEHICLE;
    // détour par un point de passage, ou dégagement d'un engin coincé : rien d'autre à décider pendant ce temps
    if (this.unstick(crew, st.state === 'bloque' && st.reason === 'mur' && st.blockedFor > 6)) return;
    if (this.viaStep(crew)) return;

    let reason = '';
    if (now < crew.retreatUntil) {
      reason = 'équipage pris à partie, repli';
    } else if (dScene < ASSESS_RANGE || crew.leg === LEG_HOLD) {
      const rep = k.safety.assess(call.kind, call.x, call.z, v.x, v.z, v.id, call.targetProp);
      if (!rep.safe) reason = rep.reason;
    }
    if (reason !== '') {
      // zone non sûre : on s'arrête à distance (l'approche s'y arrête d'elle-même ; l'approche finale est interrompue)
      if (crew.leg === LEG_FINAL && dScene > work + 12) {
        ap.stop(v);
        crew.leg = LEG_HOLD;
      } else if (crew.leg === LEG_APPROACH && (st.state === 'arrive' || dScene <= t.standoff + 3)) {
        if (st.state !== 'arrive') ap.stop(v);
        crew.leg = LEG_HOLD;
      }
      if (crew.leg === LEG_HOLD || (Math.abs(v.speed) < 0.5 && dScene < t.standoff + 30)) {
        this.enterWait(crew, call, reason);
        call.record.waited += dt;
        call.eta = 0;
      }
      if (crew.leg !== LEG_FINAL) return;
    }

    // itinéraire bloqué (barricade, foule, véhicules) : même état d'attente, avec son motif
    if ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > BLOCKED_PATIENCE) {
      this.enterWait(crew, call, st.reason === 'obstacle' && k.safety.barred(v.x, v.z, call.x, call.z, call.targetProp)
        ? 'rue barrée par une barricade' : this.blockReason(st.reason));
      call.record.waited += dt;
      if (st.blockedFor > 15 && dScene <= DISMOUNT_RANGE && reason === '') {
        // à portée de marche et zone sûre : l'équipage finit à pied
        this.dismount(crew);
        this.exitWait(crew, call);
      }
      return;
    }
    if (st.state === 'echec') {
      if (dScene <= 400) {
        this.dismount(crew);
        this.exitWait(crew, call);
      } else if (now - crew.blockedSince > 5) {
        crew.blockedSince = now;
        this.drive(crew, call.x, call.z, t.standoff, true);
      }
      return;
    }
    if (reason !== '') return;
    this.exitWait(crew, call);
    if (crew.leg !== LEG_FINAL && (dScene < ASSESS_RANGE || crew.leg === LEG_HOLD)) {
      // zone sûre : jusqu'au point de travail
      if (this.drive(crew, call.x, call.z, work, true)) crew.leg = LEG_FINAL;
      else this.dismount(crew);
      return;
    }
    if (crew.leg === LEG_FINAL && (st.state === 'arrive' || (dScene <= work + 8 && Math.abs(v.speed) < 0.4))) this.arrive(crew, call);
  }

  /** Équipe à pied : même logique, les membres marchent groupés. */
  private travelOnFoot(crew: Crew, call: CallRec, dt: number): void {
    const k = this.k;
    const ctx = k.ctx;
    const t = k.tuning;
    const lead = this.leadOf(crew);
    if (!lead) {
      this.finish(crew); // plus personne en état
      return;
    }
    const dScene = Math.hypot(lead.x - call.x, lead.z - call.z);
    call.eta = (dScene * 1.3) / ETA_SPEED_FOOT;
    // aucune progression depuis longtemps (lieu inaccessible à pied) : l'intervention est abandonnée
    if (dScene < crew.bestDistance - 6) {
      crew.bestDistance = dScene;
      crew.bestAt = k.now;
    } else if (crew.phase === C_TRAVEL && k.now - crew.bestAt > 120) {
      call.waitingReason = 'aucun accès pour les secours';
      call.record.waitReason = call.waitingReason;
      call.record.cancelled = true;
      k.setState(call, 'annule');
      this.startLeave(crew, false);
      return;
    }
    let reason = '';
    if (k.now < crew.retreatUntil) reason = 'équipage pris à partie, repli';
    else if (dScene < ASSESS_RANGE) {
      const rep = k.safety.assess(call.kind, call.x, call.z, lead.x, lead.z, 0, call.targetProp);
      if (!rep.safe) reason = rep.reason;
    }
    let gx = call.x;
    let gz = call.z;
    let arriveAt = call.kind === 'pompiers' ? 12 : 5;
    if (reason !== '') {
      if (dScene <= t.standoff) {
        // déjà à distance d'arrêt (ou plus près) : on ne bouge plus, sauf à reculer si l'on est trop engagé
        if (dScene < t.standoff - 15) {
          gx = crew.originX;
          gz = crew.originZ;
          arriveAt = 2;
        } else {
          for (let i = 0; i < crew.members.length; i++) crew.members[i].walker.stop(crew.members[i].p);
          this.enterWait(crew, call, reason);
          call.record.waited += dt;
          call.eta = 0;
          return;
        }
      } else {
        arriveAt = t.standoff - 2;
      }
    } else {
      this.exitWait(crew, call);
    }
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      const p = r.p;
      if (!ableBody(ctx, p)) continue;
      if (p.vehicleId !== 0) {
        if (crew.walking && r.role === ROLE_DRIVER && crew.members.length > 2) continue; // il garde l'engin
        ctx.vehicles.exit(p);
      }
      r.task = T_FOLLOW;
      // groupés derrière le chef, sans se marcher dessus
      const spread = (i - (crew.members.length - 1) * 0.5) * 0.9;
      r.walker.goTo(ctx, p, gx + spread * 0.6, gz + spread * 0.6, arriveAt + Math.abs(spread) * 0.3);
    }
    if (reason === '' && dScene <= arriveAt + 3) this.arrive(crew, call);
  }

  /** Chef de la colonne à pied : le premier membre valide qui n'est pas resté à bord. */
  private leadOf(crew: Crew): Person | null {
    const ctx = this.k.ctx;
    let aboard: Person | null = null;
    for (let i = 0; i < crew.members.length; i++) {
      const p = crew.members[i].p;
      if (!ableBody(ctx, p)) continue;
      if (p.vehicleId === 0) return p;
      if (!aboard) aboard = p;
    }
    return aboard;
  }

  private arrive(crew: Crew, call: CallRec): void {
    const k = this.k;
    const now = k.now;
    k.setState(call, 'sur_place');
    call.waitingReason = '';
    call.eta = 0;
    if (call.record.arrivedAt < 0) call.record.arrivedAt = now;
    crew.phase = C_WORK;
    crew.phaseAt = now;
    crew.lastFireAt = now;
    crew.lastVictimAt = now;
    const v = crew.vehicle;
    if (v && !crew.onFoot) {
      const ext = k.vehiclesExt();
      if (ext) ext.setSiren(v, 0);
      else v.siren = 0;
    }
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      r.reset();
      r.walker.stop(r.p);
    }
    crew.retreatUntil = 0;
    this.radio.onScene(call, crew);
  }

  // ───────────────────────────── sur place ─────────────────────────────

  private work(crew: Crew, call: CallRec, dt: number): void {
    const k = this.k;
    const now = k.now;
    // pris à partie : les secouristes ne se défendent pas, ils se replient
    if (k.tuning.retreatWhenAttacked && this.attacked(crew)) {
      call.record.retreats++;
      crew.retreatUntil = now + RETREAT_TIME;
      crew.phase = C_RETREAT;
      crew.phaseAt = now;
      call.waitingReason = 'équipage pris à partie, repli';
      call.record.waitReason = call.waitingReason;
      k.setState(call, 'en_attente');
      this.radio.retreat(call, crew);
      for (let i = 0; i < crew.members.length; i++) {
        const r = crew.members[i];
        if (r.p.upper === 'extinguish') r.p.upper = 'none';
        this.tasks.release(r);
      }
      return;
    }
    const done = call.kind === 'pompiers' ? this.fire.think(crew, call, dt) : this.medical.think(crew, call, dt);
    if (!done) return;
    if (call.kind === 'pompiers' && call.record.firesOut > 0) this.radio.fireOut(call, crew);
    this.closeIncident(call, crew);
    this.startPack(crew);
  }

  /** Projectiles tombés sur l'équipage, ou secouriste frappé, dans les dernières secondes. */
  private attacked(crew: Crew): boolean {
    const k = this.k;
    if (k.now < crew.retreatUntil) return false;
    const safety = k.safety;
    if (crew.vehicle && !crew.onFoot && safety.threatsNear(crew.vehicle.x, crew.vehicle.z, 9, 8) >= 2) return true;
    for (let i = 0; i < crew.members.length; i++) {
      const p = crew.members[i].p;
      if (p.vehicleId !== 0) continue;
      if (safety.threatsNear(p.x, p.z, 7, 8) >= 2) return true;
    }
    return false;
  }

  /** L'intervention a réglé l'incident lié : il est clos au nom du chef de l'équipage (s'il ne l'est pas déjà de lui-même). */
  private closeIncident(call: CallRec, crew: Crew): void {
    if (call.incidentId === 0) return;
    const incidents = this.k.ctx.service<IncidentsApi>(EXT.incidents);
    const inc = incidents?.get(call.incidentId);
    if (!incidents || !inc || inc.state === 'resolu' || inc.state === 'echoue') return;
    const lead = this.leadOf(crew);
    if (call.kind === 'pompiers') {
      // un feu : l'incident se clôt de lui-même quand tous ses foyers sont éteints ; rien à forcer ici
      return;
    }
    // SAMU : victime évacuée ou soignée sur place ; s'il reste des victimes en attente, l'incident reste ouvert
    if (crew.leftBehind === 0 && (call.record.victimsEvacuated > 0 || call.record.victimsTreated > 0) && inc.targetKind === 'place') {
      incidents.close(inc.id, true, lead ? lead.id : 0);
    }
  }

  /** Repli : tout le monde remonte, l'engin recule à distance d'arrêt, puis on attend une protection. */
  private retreat(crew: Crew, call: CallRec): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const t = k.tuning;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (crew.onFoot || !v || !ap) {
      // à pied : on recule vers le point de départ
      const lead = this.leadOf(crew);
      if (!lead) {
        this.finish(crew);
        return;
      }
      for (let i = 0; i < crew.members.length; i++) {
        const r = crew.members[i];
        if (ableBody(ctx, r.p)) r.walker.goTo(ctx, r.p, crew.originX, crew.originZ, 2);
      }
      if (Math.hypot(lead.x - call.x, lead.z - call.z) >= t.standoff || now - crew.phaseAt > 40) {
        crew.phase = C_WAIT;
        crew.leg = LEG_HOLD;
      }
      return;
    }
    let aboard = true;
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      if (!this.tasks.board(crew, r)) aboard = false;
    }
    if (!aboard && now - crew.phaseAt < 25) return;
    // marche arrière jusqu'à la distance d'arrêt : pas de demi-tour sous les projectiles
    if (ap.isActive(v)) ap.stop(v);
    const dScene = Math.hypot(v.x - call.x, v.z - call.z);
    if (dScene >= t.standoff || now - crew.phaseAt > 60 || !this.reverse(crew)) {
      this.halt(crew);
      crew.phase = C_WAIT;
      crew.leg = LEG_HOLD;
    }
  }

  /** Le conducteur recule droit (comme le joueur au volant). false si la voie est prise derrière l'engin ou s'il n'y a personne au volant. */
  private reverse(crew: Crew): boolean {
    const ctx = this.k.ctx;
    const v = crew.vehicle;
    if (!v) return false;
    const driver = this.driverOf(crew);
    if (!driver || driver.vehicleId !== v.id || !ableBody(ctx, driver)) return false;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const rear = v.def.length * 0.5;
    const ax = v.x - sh * rear;
    const az = v.z - ch * rear;
    const bx = v.x - sh * (rear + 6);
    const bz = v.z - ch * (rear + 6);
    const hit = this.hit;
    if ((ctx.world.raycast(ax, az, bx, bz, hit) && hit.t < 0.95) || (ctx.props.raycast(ax, az, bx, bz, hit, 'move') && hit.t < 0.95)
      || (ctx.vehicles.raycast(ax - sh * 0.5, az - ch * 0.5, bx, bz, hit, 'move') && hit.id !== v.id && hit.t < 0.95)
      || ctx.people.countIn(v.x - sh * (rear + 2.5), v.z - ch * (rear + 2.5), 2.6) > 0) {
      return false;
    }
    const cmd = v.cmd;
    cmd.throttle = -0.7;
    cmd.steer = 0;
    cmd.brake = 0;
    cmd.handbrake = false;
    return true;
  }

  /** Arrête l'engin, frein serré. */
  private halt(crew: Crew): void {
    const v = crew.vehicle;
    if (!v) return;
    const ap = this.k.autopilot();
    if (ap && ap.isActive(v)) ap.stop(v);
    const cmd = v.cmd;
    cmd.throttle = 0;
    cmd.steer = 0;
    cmd.brake = 1;
    cmd.handbrake = true;
  }

  // ───────────────────────────── retour ─────────────────────────────

  private startPack(crew: Crew): void {
    crew.phase = C_PACK;
    crew.phaseAt = this.k.now;
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      if (r.p.upper === 'extinguish') r.p.upper = 'none';
      // celui qui porte le patient d'une équipe à pied le garde
      if (crew.onFoot && crew.patientId !== 0 && r.p.carrying === crew.patientId) continue;
      this.tasks.release(r);
    }
  }

  private pack(crew: Crew): void {
    const k = this.k;
    const now = k.now;
    // rangement du matériel, puis tout le monde à bord
    if (now - crew.phaseAt < (crew.kind === 'pompiers' && crew.foundWork ? PACK_TIME : 1.5)) return;
    if (crew.vehicle && !crew.onFoot) {
      let aboard = true;
      for (let i = 0; i < crew.members.length; i++) if (!this.tasks.board(crew, crew.members[i])) aboard = false;
      // le temps de regagner l'engin, qui peut avoir été laissé en retrait
      const lead = this.leadOf(crew);
      const walk = lead && lead.vehicleId === 0 ? Math.hypot(lead.x - crew.vehicle.x, lead.z - crew.vehicle.z) / 1.5 : 0;
      if (!aboard && now - crew.phaseAt < 45 + walk) return;
      crew.walking = false;
    }
    this.startLeave(crew, true);
  }

  /** Départ des lieux. `report` : compte rendu radio de fin d'intervention. */
  private startLeave(crew: Crew, report: boolean): void {
    const k = this.k;
    const now = k.now;
    const call = crew.call;
    if (call) {
      if (report) this.radio.leaving(call, crew);
      if (call.live) k.setState(call, 'reparti');
      if (call.record.leftAt < 0) call.record.leftAt = now;
      this.score(call);
    }
    crew.phase = C_LEAVE;
    crew.phaseAt = now;
    crew.blockedSince = -1;
    crew.unstuck = 0;
    crew.unstickUntil = 0;
    if (crew.vehicle && !crew.onFoot) {
      for (let i = 0; i < crew.members.length; i++) this.tasks.board(crew, crew.members[i]);
      this.driveOut(crew);
    }
  }

  /**
   * Met l'engin en route vers sa sortie : son stationnement s'il était pré-positionné, sinon une sortie située
   * devant lui (pas de demi-tour dans une rue étroite), à défaut le point d'où il est venu.
   */
  private driveOut(crew: Crew): void {
    const v = crew.vehicle;
    if (!v) return;
    if (!crew.staged && this.spawner.pickExit(v, this.origin)) {
      crew.originX = this.origin.x;
      crew.originZ = this.origin.z;
    }
    const tx = crew.staged ? crew.homeX : crew.originX;
    const tz = crew.staged ? crew.homeZ : crew.originZ;
    if (!this.drive(crew, tx, tz, 0, crew.patientId !== 0)) crew.phaseAt = this.k.now - 400; // pas d'itinéraire : retrait immédiat
  }

  private leave(crew: Crew): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const tx = crew.staged ? crew.homeX : crew.originX;
    const tz = crew.staged ? crew.homeZ : crew.originZ;
    const v = crew.vehicle;
    const ap = k.autopilot();
    let arrived: boolean;
    if (v && ap && !crew.onFoot) {
      const st = ap.status(v);
      const d = Math.hypot(v.x - tx, v.z - tz);
      const busy = this.unstick(crew, st.state === 'bloque' && st.reason === 'mur' && st.blockedFor > 6) || this.viaStep(crew);
      arrived = !busy && (st.state === 'arrive' || d < 14 || st.state === 'echec');
      // retardataires : l'engin les attend un instant avant de partir
      if (!busy && !arrived && !ap.isActive(v) && now - crew.phaseAt > 3) this.driveOut(crew);
      // non pré-positionné : dès qu'il est loin des lieux et hors de la vue du joueur, il a quitté le secteur
      if (!arrived && !crew.staged) {
        const call = crew.call;
        const away = call ? Math.hypot(v.x - call.x, v.z - call.z) : 1e9;
        const p = ctx.player.person();
        const seen = p ? Math.hypot(v.x - p.x, v.z - p.z) < 220 : false;
        if (away > 380 && !seen) arrived = true;
      }
    } else {
      let far = true;
      for (let i = 0; i < crew.members.length; i++) {
        const r = crew.members[i];
        if (!ableBody(ctx, r.p)) continue;
        r.walker.goTo(ctx, r.p, tx, tz, 2.5);
        if (Math.hypot(r.p.x - tx, r.p.z - tz) > 6) far = false;
      }
      arrived = far;
    }
    if (!arrived && now - crew.phaseAt < 200) return;
    this.finish(crew);
  }

  /** Fin : l'équipage pré-positionné reprend sa veille ; les autres quittent la carte. */
  private finish(crew: Crew): void {
    const k = this.k;
    const call = crew.call;
    if (call) {
      if (call.live) k.setState(call, call.record.arrivedAt >= 0 ? 'reparti' : 'annule');
      call.crew = null;
    }
    crew.call = null;
    if (crew.staged && crew.members.length > 0 && this.leadOf(crew)) {
      if (crew.patientId !== 0) this.spawner.evacuate(crew); // remise au point de rassemblement des victimes
      const v = crew.vehicle;
      if (v) {
        const ap = k.autopilot();
        if (ap) ap.stop(v);
        const ext = k.vehiclesExt();
        if (ext) {
          ext.setSiren(v, 0);
          ext.setBeacons(v, false);
        }
      }
      crew.phase = C_STAGED;
      crew.onFoot = !v;
      for (let i = 0; i < crew.members.length; i++) {
        crew.members[i].reset();
        crew.members[i].task = T_IDLE;
      }
      return;
    }
    crew.phase = C_GONE;
    this.spawner.removeCrew(crew);
  }

  /** Points de l'intervention (barème du dossier 06 §10.4). */
  score(call: CallRec): void {
    const r = call.record;
    let pts = r.firesOut * 12 + r.victimsEvacuated * 25 + Math.max(0, r.victimsTreated - r.victimsEvacuated) * 10;
    if (r.crewHurt > 0) pts -= 25;
    if (r.arrivedAt >= 0 && call.kind === 'samu' && r.arrivedAt - r.requestedAt > 240) pts -= 10;
    r.points = pts;
  }

  /** Le conducteur de l'équipage (pour les tests et l'interface). */
  driverOf(crew: Crew): Person | null {
    for (let i = 0; i < crew.members.length; i++) if (crew.members[i].role === ROLE_DRIVER) return crew.members[i].p;
    return null;
  }
}
