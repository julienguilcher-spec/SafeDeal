/* =====================================================================================
 * SECOURS — régulation des appels.
 *
 *   demande      l'appel est pris ; délai de régulation et de départ (18 à 32 s, plus court pour un moyen
 *                pré-positionné, plus long si aucun moyen n'était engagé sur la mission) ; temps d'arrivée estimé ;
 *                la même intervention n'est pas demandée deux fois ; si tous les moyens du service sont
 *                engagés, l'appel attend son tour (premier demandé, premier servi) ;
 *   en_route     l'engin part du bord de la carte (ou de son stationnement), sirène et feux ; sans véhicules,
 *                l'équipe vient à pied ;
 *   ensuite      les phases de l'intervention sont dans crew-phases.ts (attente à distance, travail, retour).
 * Si le joueur incarne un secouriste du bon service et qu'il est disponible, c'est son équipage qui est engagé.
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueCall, RescueKind } from '@/core/extensions';
import { CallRec, C_GONE, C_STAGED, C_TRAVEL, C_WORK, LEG_APPROACH } from './crew';
import type { Crew, RescueKernel } from './crew';
import type { CrewDriver } from './crew-drive';
import type { CrewPhases } from './crew-phases';
import type { CrewTasks } from './crew-tasks';
import type { PlayerCrew } from './player';
import type { RescueRadio } from './radio';
import type { RecordsStore } from './records';
import type { Origin, Spawner } from './spawn';
import { CALL_LINGER, ETA_SPEED_FOOT, ETA_SPEED_VEHICLE, SAME_CALL_RANGE } from './tuning';

const THINK_PERIOD = 0.25;

export class Dispatcher {
  player!: PlayerCrew;
  private nextCall = 1;
  private nextCrew = 1;
  private readonly origin: Origin = { x: 0, z: 0, heading: 0, length: 0, road: false };
  /** Points de départ retenus par appel (pris à la demande, utilisés au départ). */
  private readonly origins = new Map<number, Origin>();
  /** Aucun moyen n'était engagé sur la mission pour ce service : les secours viennent de plus loin. */
  external: Record<RescueKind, boolean> = { pompiers: false, samu: false };

  constructor(
    private readonly k: RescueKernel, private readonly spawner: Spawner, private readonly tasks: CrewTasks,
    private readonly radio: RescueRadio, private readonly records: RecordsStore, private readonly driver: CrewDriver,
    private readonly phases: CrewPhases,
  ) {}

  reset(): void {
    this.nextCall = 1;
    this.nextCrew = 1;
    this.origins.clear();
    this.external.pompiers = false;
    this.external.samu = false;
  }

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
    this.phases.startLeave(crew, false);
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
      this.phases.think(crew, elapsed > 1 ? 1 : elapsed < 0 ? dt : elapsed);
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
    crew.firesDone.length = 0;
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
    this.driver.drive(crew, call.x, call.z, k.tuning.standoff, true);
  }

  /** Points de l'intervention (voir CrewPhases.score). */
  score(call: CallRec): void {
    this.phases.score(call);
  }
}
