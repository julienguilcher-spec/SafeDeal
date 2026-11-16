/* =====================================================================================
 * SECOURS — les phases d'une intervention, du trajet au retour.
 *
 *   trajet      vers le point d'arrêt à distance ; à 130 m, l'équipage évalue la zone (safety.ts) ;
 *   attente     zone non sûre, itinéraire coupé ou repli : arrêt à distance, motif renseigné, annonce radio ;
 *               reprise dès qu'un itinéraire dégagé et une protection existent ;
 *   sur place   pompiers (crew-fire.ts) ou équipe médicale (crew-medical.ts) ; pris à partie, l'équipage ne
 *               se défend pas : il remonte et recule ;
 *   rangement   matériel rangé, voie dégagée devant l'engin, tout le monde à bord ;
 *   retour      vers la sortie de la carte (ou le stationnement d'un équipage pré-positionné).
 * Sans véhicule (pas de module de véhicules, engin perdu), les mêmes phases se font à pied.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import {
  C_GONE, C_LEAVE, C_PACK, C_STAGED, C_TRAVEL, C_WAIT, C_WORK, LEG_APPROACH, LEG_FINAL, LEG_HOLD, ROLE_DRIVER, T_FOLLOW, T_IDLE,
  ableBody,
} from './crew';
import type { CallRec, Crew, RescueKernel } from './crew';
import type { CrewClear } from './crew-clear';
import type { CrewDriver } from './crew-drive';
import type { FireWork } from './crew-fire';
import type { MedicalWork } from './crew-medical';
import type { CrewTasks } from './crew-tasks';
import type { RescueRadio } from './radio';
import type { Spawner } from './spawn';
import {
  BLOCKED_PATIENCE, DISMOUNT_RANGE, ETA_SPEED_FOOT, ETA_SPEED_VEHICLE, PACK_TIME, RETREAT_TIME,
} from './tuning';

/** Phase propre au repli : remonter à bord, puis reculer à distance. */
const C_RETREAT = 7;
const ASSESS_RANGE = 130;
/** Bloqué par un objet fixe ou des véhicules à l'arrêt depuis ce temps (s), l'équipage finit à pied jusqu'à cette distance (m). */
const FAR_DISMOUNT_PATIENCE = 25;
const FAR_DISMOUNT_RANGE = 400;

export class CrewPhases {
  constructor(
    private readonly k: RescueKernel, private readonly spawner: Spawner, private readonly tasks: CrewTasks,
    private readonly fire: FireWork, private readonly medical: MedicalWork, private readonly radio: RescueRadio,
    private readonly driver: CrewDriver, private readonly clear: CrewClear,
  ) {}

  think(crew: Crew, dt: number): void {
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
      this.driver.dismount(crew, true); // engin hors d'usage : on continue à pied
      return;
    }
    const now = k.now;
    const t = k.tuning;
    const work = call.kind === 'pompiers' ? t.workDistanceFire : t.workDistanceCare;
    const st = ap.status(v);
    const dScene = Math.hypot(v.x - call.x, v.z - call.z);
    call.eta = (st.remaining > 1 && !crew.via ? st.remaining : dScene * 1.3) / ETA_SPEED_VEHICLE;
    // détour par un point de passage, ou dégagement d'un engin coincé : rien d'autre à décider pendant ce temps
    const detour = crew.via;
    // (un mur, ou — trop loin pour finir à pied — un objet fixe en travers de la trajectoire : on recule pour reprendre
    // la manœuvre, trois fois au plus)
    if (this.driver.unstick(crew, st.state === 'bloque' && ((st.reason === 'mur' && st.blockedFor > 6) || (st.reason === 'obstacle' && st.blockedFor > 10
      && dScene > DISMOUNT_RANGE && !k.safety.barred(v.x, v.z, call.x, call.z, call.targetProp))))) return;
    if (this.driver.viaStep(crew) || detour) return; // (l'état lu plus haut est celui du détour : on décidera au prochain passage)

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
      const barred = st.reason === 'obstacle' && k.safety.barred(v.x, v.z, call.x, call.z, call.targetProp);
      this.enterWait(crew, call, barred ? 'rue barrée par une barricade' : this.blockReason(st.reason));
      call.record.waited += dt;
      // à portée de marche et zone sûre : l'équipage finit à pied ; plus loin aussi quand rien ne bougera
      // (objet fixe, véhicules à l'arrêt) — une foule ou une barricade peuvent encore s'ouvrir, on patiente
      const near = st.blockedFor > 15 && dScene <= DISMOUNT_RANGE;
      const far = st.blockedFor > FAR_DISMOUNT_PATIENCE && dScene <= FAR_DISMOUNT_RANGE && !barred && st.reason !== 'personne';
      if ((near || far) && reason === '') {
        this.driver.dismount(crew);
        this.exitWait(crew, call);
      }
      return;
    }
    if (st.state === 'echec') {
      if (dScene <= 400) {
        this.driver.dismount(crew);
        this.exitWait(crew, call);
      } else if (now - crew.blockedSince > 5) {
        crew.blockedSince = now;
        this.driver.drive(crew, call.x, call.z, t.standoff, true);
      }
      return;
    }
    if (reason !== '') return;
    this.exitWait(crew, call);
    if (crew.leg !== LEG_FINAL && (dScene < ASSESS_RANGE || crew.leg === LEG_HOLD)) {
      // zone sûre : jusqu'au point de travail
      if (this.driver.drive(crew, call.x, call.z, work, true)) crew.leg = LEG_FINAL;
      else this.driver.dismount(crew);
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
  leadOf(crew: Crew): Person | null {
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
    if (dScene >= t.standoff || now - crew.phaseAt > 60 || !this.driver.reverse(crew)) {
      this.driver.halt(crew);
      crew.phase = C_WAIT;
      crew.leg = LEG_HOLD;
    }
  }

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
    // déblai : ce qui traîne sur la chaussée devant l'engin est poussé sur le côté (30 s au plus)
    if (crew.vehicle && !crew.onFoot && !crew.walking && now - crew.phaseAt < 30 && this.clear.step(crew)) return;
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
  startLeave(crew: Crew, report: boolean): void {
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
      this.driver.driveOut(crew);
    }
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
      const detour = crew.via;
      const jammed = st.state === 'bloque' && (st.reason === 'mur' || st.reason === 'obstacle') && st.blockedFor > 6;
      const busy = this.driver.unstick(crew, jammed) || this.driver.viaStep(crew) || detour;
      arrived = !busy && (st.state === 'arrive' || d < 14 || st.state === 'echec');
      // retardataires : l'engin les attend un instant avant de partir
      if (!busy && !arrived && !ap.isActive(v) && now - crew.phaseAt > 3) this.driver.driveOut(crew);
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
}
