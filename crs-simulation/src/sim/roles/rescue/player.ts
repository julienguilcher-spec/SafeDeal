/* =====================================================================================
 * SECOURS — le joueur pompier ou soignant du SAMU (rôle « secouriste »).
 *
 * Son équipage est l'unité de secours dont il fait partie (créée par la mise en place de session) et
 * l'engin de cette unité. Quand un appel de son service arrive et qu'il est disponible, c'est LUI qui
 * est engagé : l'incident lui est confié (service des incidents, playerIncidentId), la salle le lui
 * annonce par radio. Il conduit, descend, éteint à la lance ou à l'extincteur, soigne, porte, charge
 * dans l'ambulance : ce sont les mêmes objets et les mêmes gestes que les PNJ.
 *
 * Ses équipiers PNJ le suivent : ils montent quand il prend le volant, descendent avec lui, et sur
 * les lieux travaillent comme n'importe quel équipage (lance, secours à victime, soins). Le joueur
 * décide seul d'entrer ou non dans une zone dangereuse : l'évaluation de sécurité lui est donnée en
 * conseil (waitingReason), et un équipier blessé faute de protection pèse sur la note.
 * L'intervention est notée à la fin (points du dossier 06 §10.4) dans « rescue.records ».
 * ===================================================================================== */

import type { Person, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueKind } from '@/core/extensions';
import { Crew, ROLE_AID, ROLE_CHIEF, ROLE_DOCTOR, ROLE_DRIVER, ROLE_HOSE, ROLE_NURSE, Rescuer, T_FOLLOW, ableBody } from './crew';
import type { CallRec, RescueKernel } from './crew';
import type { FireWork } from './crew-fire';
import type { MedicalWork } from './crew-medical';
import type { CrewTasks } from './crew-tasks';
import type { Dispatcher } from './dispatch';
import { holdFacing } from './nav';
import type { RescueRadio } from './radio';
import type { Spawner } from './spawn';
import { WORK_RADIUS } from './tuning';

const ON_SCENE = 30;
const THINK_PERIOD = 0.25;
/** Sans foyer ni victime depuis ce temps sur les lieux, l'intervention est tenue pour terminée (s). */
const QUIET_DONE = 6;

export class PlayerCrew {
  crew: Crew | null = null;
  call: CallRec | null = null;
  private refreshAt = 0;
  private thinkAt = 0;
  private advisedAt = -1e9;
  private quietSince = -1;
  private readonly nearVehicles: Vehicle[] = [];
  dispatcher!: Dispatcher;

  constructor(
    private readonly k: RescueKernel, private readonly spawner: Spawner, private readonly tasks: CrewTasks,
    private readonly fire: FireWork, private readonly medical: MedicalWork, private readonly radio: RescueRadio,
  ) {}

  reset(): void {
    this.crew = null;
    this.call = null;
    this.refreshAt = 0;
    this.thinkAt = 0;
    this.advisedAt = -1e9;
    this.quietSince = -1;
  }

  get callId(): number {
    return this.call ? this.call.id : 0;
  }

  /** Service du joueur s'il incarne un secouriste officiel, sinon null. */
  private service(): RescueKind | null {
    const ctx = this.k.ctx;
    if (ctx.player.state.role !== 'secouriste') return null;
    const p = ctx.player.person();
    if (!p) return null;
    return p.kind === 'samu' ? 'samu' : p.kind === 'pompier' ? 'pompiers' : null;
  }

  /** L'équipage du joueur peut-il prendre un appel de ce service maintenant ? */
  canTake(kind: RescueKind): boolean {
    if (this.call && this.call.live) return false;
    if (this.service() !== kind) return false;
    const p = this.k.ctx.player.person();
    return !!p && ableBody(this.k.ctx, p);
  }

  /** Construit (ou met à jour) l'équipage autour du joueur : ses équipiers d'unité et l'engin de l'unité. */
  private refresh(): void {
    const k = this.k;
    const ctx = k.ctx;
    const kind = this.service();
    const p = ctx.player.person();
    if (!kind || !p) {
      if (this.crew && !this.call) this.dissolve();
      return;
    }
    let crew = this.crew;
    if (!crew || crew.kind !== kind) {
      if (crew) this.dissolve();
      crew = new Crew(-1, kind);
      crew.playerLed = true;
      crew.onFoot = false;
      this.crew = crew;
      k.crews.push(crew);
    }
    crew.squadId = p.squadId;
    // équipiers : les membres de son unité, du même service
    const squad = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
    const members = crew.members;
    for (let i = members.length - 1; i >= 0; i--) {
      const q = members[i].p;
      const keep = ctx.people.get(q.id) === q && (q === p || (!q.isPlayer && q.squadId === p.squadId && p.squadId !== 0));
      if (!keep) members.splice(i, 1);
    }
    if (!crew.memberOf(p.id)) members.unshift(new Rescuer(p, kind === 'samu' ? ROLE_DOCTOR : ROLE_HOSE));
    if (squad) {
      let hoses = 0;
      let aids = 0;
      for (let i = 0; i < members.length; i++) {
        if (members[i].role === ROLE_HOSE) hoses++;
        else if (members[i].role === ROLE_AID) aids++;
      }
      for (let i = 0; i < squad.members.length; i++) {
        const q = ctx.people.get(squad.members[i]);
        if (!q || q === p || q.isPlayer || crew.memberOf(q.id) || (q.kind !== 'pompier' && q.kind !== 'samu')) continue;
        let role: number;
        if (kind === 'samu') {
          role = members.length <= 1 ? ROLE_NURSE : ROLE_DRIVER;
        } else if (q.id === squad.leaderId) {
          role = ROLE_CHIEF;
        } else if (ctx.actions.has(q, 'lance_incendie') > 0 && hoses < 2) {
          role = ROLE_HOSE;
          hoses++;
        } else if (ctx.actions.has(q, 'trousse_secours') > 0 || aids < 2) {
          role = ROLE_AID;
          aids++;
        } else {
          role = ROLE_HOSE;
          hoses++;
        }
        members.push(new Rescuer(q, role));
      }
    }
    // engin : celui de l'unité, sinon celui où le joueur est assis, sinon l'engin de secours le plus proche
    let v: Vehicle | undefined = crew.vehicle && ctx.vehicles.get(crew.vehicle.id) === crew.vehicle ? crew.vehicle : undefined;
    const want = kind === 'pompiers' ? 'camion_pompiers' : 'ambulance';
    if (!v && squad && squad.vehicleId !== 0) v = ctx.vehicles.get(squad.vehicleId);
    if (p.vehicleId !== 0) {
      const mine = ctx.vehicles.get(p.vehicleId);
      if (mine && mine.kind === want) v = mine;
    }
    if (!v) {
      const n = ctx.vehicles.queryRadius(p.x, p.z, 80, this.nearVehicles);
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const c = this.nearVehicles[i];
        if (c.kind !== want || c.state === 'wrecked' || c.state === 'burnt') continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bestD) {
          bestD = d;
          v = c;
        }
      }
    }
    crew.vehicle = v ?? null;
    if (v && crew.homeX === 0 && crew.homeZ === 0) {
      // point de rassemblement des victimes : là où l'engin stationnait au début
      crew.homeX = v.x;
      crew.homeZ = v.z;
      crew.originX = v.x;
      crew.originZ = v.z;
    }
    if (this.call) this.call.vehicleId = v ? v.id : 0;
  }

  private dissolve(): void {
    const crew = this.crew;
    if (!crew) return;
    const i = this.k.crews.indexOf(crew);
    if (i >= 0) this.k.crews.splice(i, 1);
    this.crew = null;
  }

  /** L'appel est attribué à l'équipage du joueur. */
  engage(call: CallRec): void {
    const k = this.k;
    const ctx = k.ctx;
    this.refresh();
    const crew = this.crew;
    const p = ctx.player.person();
    if (!crew || !p) return;
    call.playerLed = true;
    call.record.playerLed = true;
    call.crew = crew;
    crew.call = call;
    call.vehicleId = crew.vehicleId;
    call.record.departedAt = k.now;
    crew.foundWork = false;
    crew.askedSamu = false;
    crew.leftBehind = 0;
    crew.phaseAt = k.now;
    crew.patientId = 0;
    this.call = call;
    this.quietSince = -1;
    const d = Math.hypot(p.x - call.x, p.z - call.z);
    call.eta = d / 8 + 10;
    k.setState(call, 'en_route');
    // l'incident devient la tâche du joueur ; à défaut d'incident, on en ouvre un pour qu'il ait un repère
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    let label = call.kind === 'pompiers' ? 'Intervention incendie' : 'Secours à victime';
    let urgent = false;
    if (incidents) {
      let inc = call.incidentId !== 0 ? incidents.get(call.incidentId) : undefined;
      if (!inc) {
        inc = incidents.nearest(call.x, call.z, 20) ?? incidents.open(call.kind === 'pompiers' ? 'feu_poubelle' : 'blesse', call.x, call.z, 'place', 0, 2);
        call.incidentId = inc.id;
        call.record.incidentId = inc.id;
      }
      label = inc.label;
      urgent = inc.urgency >= 3;
      incidents.assign(inc.id, 'joueur');
    }
    const squad = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
    this.radio.toPlayer(squad ? squad.name : call.kind === 'pompiers' ? 'SAPEUR 1' : 'SANTÉ 1', label, urgent);
    ctx.ui.notify(`Appel : ${label} — à ${Math.round(d)} m`, urgent ? 'alert' : 'warn', 6);
  }

  /** L'appel a été annulé pendant que le joueur s'y rendait. */
  released(call: CallRec): void {
    if (this.call !== call) return;
    this.k.ctx.ui.notify('Appel annulé par la salle.', 'info', 4);
    this.endCall(false);
  }

  private endCall(done: boolean): void {
    const k = this.k;
    const call = this.call;
    const crew = this.crew;
    if (!call) return;
    if (call.record.leftAt < 0) call.record.leftAt = k.now;
    this.dispatcher.score(call);
    if (call.live) k.setState(call, done ? 'reparti' : 'annule');
    if (done) {
      const r = call.record;
      const parts: string[] = [];
      if (r.firesOut > 0) parts.push(`${r.firesOut} foyer${r.firesOut > 1 ? 's' : ''} éteint${r.firesOut > 1 ? 's' : ''}`);
      if (r.victimsEvacuated > 0) parts.push(`${r.victimsEvacuated} victime${r.victimsEvacuated > 1 ? 's' : ''} évacuée${r.victimsEvacuated > 1 ? 's' : ''}`);
      else if (r.victimsTreated > 0) parts.push(`${r.victimsTreated} victime${r.victimsTreated > 1 ? 's' : ''} soignée${r.victimsTreated > 1 ? 's' : ''}`);
      if (r.crewHurt > 0) parts.push('un équipier blessé');
      k.ctx.ui.notify(`Intervention terminée${parts.length > 0 ? ' — ' + parts.join(', ') : ''} (${r.points >= 0 ? '+' : ''}${r.points} points)`,
        r.crewHurt > 0 ? 'warn' : 'ok', 6);
    }
    call.crew = null;
    if (crew) {
      crew.call = null;
      for (let i = 0; i < crew.members.length; i++) {
        const m = crew.members[i];
        if (m.p.isPlayer) continue;
        if (m.p.upper === 'extinguish') m.p.upper = 'none';
        this.tasks.release(m);
        m.hoseSet = false;
      }
    }
    this.call = null;
    this.quietSince = -1;
  }

  // ───────────────────────────── à chaque pas ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    const now = k.now;
    if (now >= this.refreshAt) {
      this.refreshAt = now + 1;
      this.refresh();
    }
    const crew = this.crew;
    if (!crew) return;
    this.tasks.stepWalkers(crew);
    if (now < this.thinkAt) return;
    const elapsed = this.thinkAt > 0 ? now - (this.thinkAt - THINK_PERIOD) : dt;
    this.thinkAt = now + THINK_PERIOD;
    this.think(crew, elapsed > 1 ? 1 : elapsed);
  }

  private think(crew: Crew, dt: number): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const p = ctx.player.person();
    if (!p) return;
    const call = this.call;
    const v = crew.vehicle;
    const driving = v !== null && p.vehicleId === v.id;
    let onScene = false;
    if (call && call.live) {
      const px = driving && v ? v.x : p.x;
      const pz = driving && v ? v.z : p.z;
      const d = Math.hypot(px - call.x, pz - call.z);
      call.eta = d > ON_SCENE ? d / (driving ? 8 : 3) : 0;
      onScene = d <= ON_SCENE;
      // la victime évacuée d'un lieu : l'appel suit la victime chargée, pas le lieu
      this.advise(call, px, pz, d);
      if (onScene && call.state !== 'sur_place') {
        k.setState(call, 'sur_place');
        if (call.record.arrivedAt < 0) call.record.arrivedAt = now;
        crew.phaseAt = now;
        crew.lastFireAt = now;
        crew.lastVictimAt = now;
      }
      this.noteCrewHurt(crew, call);
    }
    // les équipiers
    const working = call !== null && call.live && onScene && !driving;
    if (working && call) {
      const done = call.kind === 'pompiers' ? this.fire.think(crew, call, dt) : this.medical.think(crew, call, dt);
      this.watchEnd(crew, call, done, p);
    } else {
      this.follow(crew, p, driving);
      if (call && call.live && call.state === 'sur_place') this.watchEnd(crew, call, false, p);
    }
    if (call && call.live) this.deliver(crew, call);
  }

  /** Conseil de sécurité à l'approche : le joueur décide, mais il sait à quoi s'attendre. */
  private advise(call: CallRec, px: number, pz: number, d: number): void {
    const k = this.k;
    if (d > 130 || call.state === 'sur_place') {
      if (call.state !== 'sur_place') call.waitingReason = '';
      return;
    }
    const rep = k.safety.assess(call.kind, call.x, call.z, px, pz, this.crew ? this.crew.vehicleId : 0, call.targetProp);
    call.waitingReason = rep.safe ? '' : rep.reason;
    if (!rep.safe && k.now - this.advisedAt > 45) {
      this.advisedAt = k.now;
      k.ctx.ui.notify(`Zone non sûre : ${rep.reason}. Demandez une protection, ou engagez-vous à vos risques.`, 'warn', 7);
      call.record.waitReason = rep.reason;
    }
  }

  private noteCrewHurt(crew: Crew, call: CallRec): void {
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      if (!r.hurt && (r.p.injury === 'serious' || r.p.injury === 'critical' || r.p.injury === 'dead')) {
        r.hurt = true;
        call.record.crewHurt++;
      }
    }
  }

  /** Fin de l'intervention : l'incident lié est clos, ou plus rien ne brûle et plus personne n'attend. */
  private watchEnd(crew: Crew, call: CallRec, crewDone: boolean, p: Person): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    // une victime est à bord : l'intervention ne se termine qu'à sa remise (voir deliver)
    if (call.kind === 'samu' && this.patientAboard(crew) !== 0) return;
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    if (incidents && call.incidentId !== 0) {
      const inc = incidents.get(call.incidentId);
      if (!inc || inc.state === 'resolu' || inc.state === 'echoue') {
        // feux éteints par le joueur lui-même : ils comptent pour l'équipage
        if (call.kind === 'pompiers' && call.record.firesOut === 0 && inc && inc.state === 'resolu') call.record.firesOut = 1;
        if (call.kind === 'samu' && call.record.victimsTreated === 0 && inc && inc.state === 'resolu') call.record.victimsTreated = 1;
        this.endCall(true);
      }
      return;
    }
    // sans service d'incidents : on regarde le terrain
    let quiet: boolean;
    if (call.kind === 'pompiers') quiet = this.fire.collectFires(crew, call.x, call.z) === 0;
    else quiet = this.medical.triage(crew, call.x, call.z) === 0 && crew.patientId === 0;
    if (!quiet || (!crewDone && Math.hypot(p.x - call.x, p.z - call.z) > WORK_RADIUS)) {
      this.quietSince = -1;
      return;
    }
    if (this.quietSince < 0) this.quietSince = now;
    if (now - this.quietSince >= QUIET_DONE && now - crew.phaseAt > 8) this.endCall(true);
  }

  /**
   * Victime chargée dans l'ambulance du joueur : elle est remise au point de rassemblement des victimes
   * (là où l'ambulance stationnait), ou dès que l'ambulance s'est éloignée de 250 m des lieux.
   */
  private deliver(crew: Crew, call: CallRec): void {
    const k = this.k;
    const ctx = k.ctx;
    const v = crew.vehicle;
    const id = this.patientAboard(crew);
    if (!v || id === 0) return;
    if (crew.patientId !== id) {
      crew.patientId = id;
      call.record.victimsEvacuated++;
      if (call.record.victimsTreated < call.record.victimsEvacuated) call.record.victimsTreated = call.record.victimsEvacuated;
      ctx.ui.notify('Victime à bord : conduisez-la au point de rassemblement des victimes.', 'info', 6);
    }
    const home = Math.hypot(v.x - crew.homeX, v.z - crew.homeZ);
    const away = Math.hypot(v.x - call.x, v.z - call.z);
    if ((home < 20 && away > 40 && Math.abs(v.speed) < 2) || away > 250) {
      this.spawner.evacuate(crew);
      this.endCall(true);
    }
  }

  /** Patient à bord de l'ambulance : la place du brancard (la dernière) occupée par quelqu'un qui n'est pas de l'équipage. 0 sinon. */
  private patientAboard(crew: Crew): number {
    const v = crew.vehicle;
    if (!v || v.kind !== 'ambulance') return 0;
    const seat = v.seats.length - 1;
    const id = seat >= 0 ? v.seats[seat] : 0;
    if (id === 0 || crew.memberOf(id) || !this.k.ctx.people.get(id)) return 0;
    return id;
  }

  /** Hors intervention : les équipiers montent quand le joueur est à bord, sinon ils restent groupés près de lui ou de l'engin. */
  private follow(crew: Crew, p: Person, driving: boolean): void {
    const ctx = this.k.ctx;
    const v = crew.vehicle;
    const members = crew.members;
    for (let i = 0; i < members.length; i++) {
      const r = members[i];
      const q = r.p;
      if (q.isPlayer || !ableBody(ctx, q)) continue;
      if (q.upper === 'extinguish') q.upper = 'none';
      if (driving && v) {
        this.tasks.board(crew, r);
        continue;
      }
      if (q.vehicleId !== 0) {
        // le joueur est descendu : on descend avec lui s'il s'éloigne de l'engin, sinon on reste prêt à repartir
        if (!v || Math.hypot(p.x - v.x, p.z - v.z) < 12) continue;
        ctx.vehicles.exit(q);
        if (q.vehicleId !== 0) continue;
      }
      if (this.tasks.busy(q)) continue;
      if (r.task !== T_FOLLOW) {
        this.tasks.release(r);
        r.task = T_FOLLOW;
      }
      // derrière le joueur, en éventail
      const a = p.heading + Math.PI + (i - members.length * 0.5) * 0.5;
      const gx = p.x + Math.sin(a) * 2.6;
      const gz = p.z + Math.cos(a) * 2.6;
      if (Math.hypot(gx - q.x, gz - q.z) > 2.2) r.walker.goTo(ctx, q, gx, gz, 1.2);
      else {
        r.walker.stop(q);
        holdFacing(q, p.x + Math.sin(p.heading) * 6, p.z + Math.cos(p.heading) * 6);
      }
    }
  }
}
