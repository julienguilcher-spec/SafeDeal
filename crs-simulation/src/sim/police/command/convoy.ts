/* =====================================================================================
 * COMMANDEMENT — convoi : arrivée et départ d'une unité en colonne de véhicules (bible §E.8 :
 * « fourgons alignés, cap vers la sortie, à 50 m au moins de la foule ; les groupes sortent, se
 * forment en colonne puis en ligne »).
 *
 *   arrive()  la colonne roule jusqu'au point (pilote automatique, convoi : le premier conduit, les
 *             autres suivent à intervalle régulier), les véhicules se garent ALIGNÉS (en file le long
 *             de la voie par défaut, en bataille ou en épi sur une place), puis l'unité débarque et
 *             se met en ligne devant ses véhicules ;
 *   depart()  rembarquement, puis départ en colonne vers le point de sortie.
 * Sans pilote automatique (module des véhicules absent), l'unité débarque là où elle se trouve.
 * ===================================================================================== */

import type { OrderType, Vehicle } from '@/core/contracts';
import { angleDiff } from '@/core/math';
import { agentOf } from '../brain';
import { COMMAND_CONVOY_EVENT } from './api';
import type { ConvoyDestination, ConvoyEvent, ConvoyStage, ConvoyStatus } from './api';
import type { CommandCore } from './core';
import { frame, spell } from './texts';

interface Convoy {
  status: ConvoyStatus;
  vehicles: Vehicle[];
  dest: ConvoyDestination;
  hasDest: boolean;
  exitX: number;
  exitZ: number;
  hasExit: boolean;
  stageT: number;
  /** Point de départ de la colonne (base par défaut du retour). */
  fromX: number;
  fromZ: number;
  /** L'ordre de débarquement ou d'embarquement donné par le convoi est terminé. */
  orderDone: boolean;
  /** Instant où les retardataires ont commencé à rejoindre un véhicule (0 : pas encore). */
  stragglersAt: number;
}

/** Rang d'un véhicule dans la colonne : commandement en tête, fourgons, puis le cellulaire en serre-file. */
function columnRank(v: Vehicle): number {
  return v.kind === 'vl_commandement' ? 0 : v.kind === 'fourgon_cellulaire' ? 2 : 1;
}

export class ConvoyControl {
  readonly list: Convoy[] = [];
  private thinkAt = 0;

  constructor(private readonly core: CommandCore) {}

  reset(): void {
    this.list.length = 0;
    this.thinkAt = 0;
  }

  of(squadId: number): Convoy | null {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].status.squadId === squadId) return this.list[i];
    return null;
  }

  statusOf(squadId: number): ConvoyStatus | null {
    const c = this.of(squadId);
    return c ? c.status : null;
  }

  /** Un convoi de cette unité est-il encore en route, en stationnement ou en débarquement ? */
  arriving(squadId: number): boolean {
    const c = this.of(squadId);
    return !!c && (c.status.stage === 'route' || c.status.stage === 'stationnement' || c.status.stage === 'debarquement');
  }

  private setStage(c: Convoy, stage: ConvoyStage): void {
    if (c.status.stage === stage) return;
    c.status.stage = stage;
    c.stageT = this.core.now;
    const e: ConvoyEvent = { squadId: c.status.squadId, stage };
    this.core.ctx.events.emitAny(COMMAND_CONVOY_EVENT, e);
  }

  private obtain(squadId: number): Convoy {
    let c = this.of(squadId);
    if (!c) {
      c = {
        status: { squadId, stage: 'route', vehicles: 0, parked: 0, alignError: -1, headingError: -1, t0: this.core.now },
        vehicles: [], dest: { x: 0, z: 0, heading: 0 }, hasDest: false, exitX: 0, exitZ: 0, hasExit: false, stageT: this.core.now,
        fromX: 0, fromZ: 0, orderDone: false, stragglersAt: 0,
      };
      this.list.push(c);
    }
    return c;
  }

  private gather(c: Convoy): void {
    const core = this.core;
    core.fleet(c.status.squadId, c.vehicles);
    for (let i = c.vehicles.length - 1; i >= 0; i--) {
      const v = c.vehicles[i];
      if (v.def.flying || v.kind === 'moto_bravm' || !core.usable(v)) c.vehicles.splice(i, 1);
    }
    c.vehicles.sort((a, b) => columnRank(a) - columnRank(b) || a.id - b.id);
    c.status.vehicles = c.vehicles.length;
  }

  /**
   * Avant le départ de la colonne : les agents restés à pied près des véhicules (places de leur groupe déjà
   * prises) montent là où il reste de la place, fourgon cellulaire compris. Personne ne reste devant les roues.
   */
  private seatStragglers(c: Convoy): void {
    const core = this.core;
    const ctx = core.ctx;
    const n = core.members(c.status.squadId, core.people);
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.vehicleId !== 0 || p.isPlayer || p.posture === 'down' || p.custody !== 'free') continue;
      for (let k = c.vehicles.length - 1; k >= 0; k--) {
        const v = c.vehicles[k];
        if (Math.hypot(v.x - p.x, v.z - p.z) > 60) continue;
        if (ctx.vehicles.enter(p, v, 'passenger')) break;
      }
    }
  }

  // ───────────────────────────── arrivée ─────────────────────────────

  arrive(squadId: number, dest: ConvoyDestination): boolean {
    const core = this.core;
    const squad = core.ctx.squads.get(squadId);
    if (!squad) return false;
    const c = this.obtain(squadId);
    c.dest = { ...dest };
    c.hasDest = true;
    c.orderDone = false;
    c.status.t0 = core.now;
    c.status.parked = 0;
    c.status.alignError = -1;
    c.status.headingError = -1;
    this.gather(c);
    const lead = c.vehicles[0];
    if (lead) {
      c.fromX = lead.x;
      c.fromZ = lead.z;
    }
    const ap = core.autopilot;
    c.status.stage = 'echec';
    if (lead && ap) this.seatStragglers(c);
    if (lead && ap && ap.convoy(c.vehicles, dest.x, dest.z, { gap: core.tuning.convoyGap, speed: core.tuning.convoySpeed })) {
      this.setStage(c, 'route');
      core.say(squad.name, frame('CENTRAL', squad.name, 'En route vers la zone de stationnement, ' + spell(c.vehicles.length) + ' véhicules en colonne', false), 1, 'commandement', squad.leaderId);
      return true;
    }
    // pas de véhicule ou pas de pilote : on débarque sur place
    this.beginDisembark(c);
    return lead !== undefined;
  }

  private thinkRoute(c: Convoy): void {
    const core = this.core;
    const ap = core.autopilot;
    const lead = c.vehicles[0];
    if (!ap || !lead) {
      this.beginDisembark(c);
      return;
    }
    const st = ap.status(lead);
    const now = core.now;
    const arrived = st.state === 'arrive' || st.mode === 'idle';
    const stuck = st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 40) || now - c.stageT > 420;
    if (!arrived && !stuck) return;
    // toute la colonne à l'arrêt avant de se garer
    for (let i = 0; i < c.vehicles.length; i++) if (Math.abs(c.vehicles[i].speed) > 0.4 && now - c.stageT < 440) return;
    const d = c.dest;
    const near = Math.hypot(lead.x - d.x, lead.z - d.z) < 60;
    if (near && ap.parkRow(c.vehicles, d.x, d.z, d.heading, d.layout ?? 'file', d.layout === 'file' || d.layout === undefined ? 1.6 : undefined)) {
      this.setStage(c, 'stationnement');
    } else {
      // colonne arrêtée en route (rue coupée, obstacle) : on débarque où l'on est
      this.beginDisembark(c);
    }
  }

  private measure(c: Convoy): void {
    const d = c.dest;
    const rx = -Math.cos(d.heading);
    const rz = Math.sin(d.heading);
    const fx = Math.sin(d.heading);
    const fz = Math.cos(d.heading);
    const file = d.layout === undefined || d.layout === 'file';
    let align = 0;
    let head = 0;
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i];
      // en file : écart latéral à l'axe du rang ; côte à côte : écart longitudinal à la ligne des avants
      const e = file ? Math.abs((v.x - d.x) * rx + (v.z - d.z) * rz) : Math.abs((v.x - d.x) * fx + (v.z - d.z) * fz);
      if (e > align) align = e;
      const want = d.layout === 'epi' ? d.heading - 0.5236 : d.heading;
      const h = Math.abs(angleDiff(v.heading, want));
      if (h > head) head = h;
    }
    c.status.alignError = align;
    c.status.headingError = head;
  }

  private thinkPark(c: Convoy): void {
    const ap = this.core.autopilot;
    if (!ap) {
      this.beginDisembark(c);
      return;
    }
    let parked = 0;
    let failed = 0;
    for (let i = 0; i < c.vehicles.length; i++) {
      const st = ap.status(c.vehicles[i]);
      if (st.state === 'arrive' || st.mode === 'idle') parked++;
      else if (st.state === 'echec') failed++;
    }
    c.status.parked = parked;
    if (parked + failed < c.vehicles.length && this.core.now - c.stageT < 300) return;
    this.measure(c);
    this.beginDisembark(c);
  }

  private beginDisembark(c: Convoy): void {
    const core = this.core;
    const d = c.dest;
    if (d.disembark === false) {
      this.setStage(c, 'en_place');
      return;
    }
    // la ligne se forme devant le véhicule de tête
    let lx = d.lineX;
    let lz = d.lineZ;
    let lh = d.lineHeading ?? d.heading;
    const lead = c.vehicles[0];
    if (lx === undefined || lz === undefined) {
      if (lead) {
        const h = c.hasDest ? d.heading : lead.heading;
        let front = -Infinity;
        for (let i = 0; i < c.vehicles.length; i++) {
          const v = c.vehicles[i];
          const along = (v.x - lead.x) * Math.sin(h) + (v.z - lead.z) * Math.cos(h) + v.def.length * 0.5;
          if (along > front) front = along;
        }
        lx = lead.x + Math.sin(h) * (front + 15);
        lz = lead.z + Math.cos(h) * (front + 15);
        if (d.lineHeading === undefined) lh = h;
      } else if (core.centerOf(c.status.squadId)) {
        lx = core.v2.x;
        lz = core.v2.z;
      } else {
        lx = d.x;
        lz = d.z;
      }
    }
    c.orderDone = false;
    const squad = core.ctx.squads.get(c.status.squadId);
    core.issue(c.status.squadId, { type: 'debarquer', x: lx, z: lz, heading: lh, width: 0, issuedBy: squad ? squad.leaderId : 0 });
    this.setStage(c, 'debarquement');
  }

  // ───────────────────────────── départ ─────────────────────────────

  depart(squadId: number, exit?: { x: number; z: number }): boolean {
    const core = this.core;
    const squad = core.ctx.squads.get(squadId);
    if (!squad) return false;
    const c = this.obtain(squadId);
    this.gather(c);
    c.hasExit = exit !== undefined;
    if (exit) {
      c.exitX = exit.x;
      c.exitZ = exit.z;
    }
    c.orderDone = false;
    c.stragglersAt = 0;
    c.status.t0 = core.now;
    if (c.vehicles.length === 0) {
      this.setStage(c, 'parti');
      return false;
    }
    core.issue(squadId, { type: 'embarquer', issuedBy: squad.leaderId });
    this.setStage(c, 'rembarquement');
    return true;
  }

  /**
   * Agents restés à pied après l'embarquement (plus de place dans le fourgon de leur groupe) : ils rejoignent
   * à pied un véhicule où il reste une place, fourgon cellulaire compris. Retourne le nombre d'agents en chemin.
   */
  private boardStragglers(c: Convoy): number {
    const core = this.core;
    const n = core.members(c.status.squadId, core.people);
    let walking = 0;
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.vehicleId !== 0 || p.isPlayer || p.posture === 'down' || p.custody !== 'free') continue;
      const a = agentOf(p);
      if (!a) continue;
      if (a.boardId !== 0) {
        walking++;
        continue;
      }
      for (let k = c.vehicles.length - 1; k >= 0; k--) {
        const v = c.vehicles[k];
        let free = 0;
        for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') free++;
        // places déjà promises à d'autres retardataires
        for (let j = 0; j < n; j++) {
          const b = agentOf(core.people[j]);
          if (b && b.boardId === v.id && core.people[j].vehicleId === 0) free--;
        }
        if (free <= 0) continue;
        a.boardId = v.id;
        a.hasSlot = false;
        a.pathN = 0;
        walking++;
        break;
      }
    }
    return walking;
  }

  private thinkEmbark(c: Convoy): void {
    const core = this.core;
    if (!c.orderDone && core.now - c.stageT < 200) return;
    // les retardataires montent où il reste de la place (une minute et demie au plus)
    if (c.stragglersAt === 0) c.stragglersAt = core.now;
    if (this.boardStragglers(c) > 0 && core.now - c.stragglersAt < 90) return;
    const ap = core.autopilot;
    if (c.hasExit && ap && c.vehicles.length > 0) this.seatStragglers(c);
    if (c.hasExit && ap && c.vehicles.length > 0 && ap.convoy(c.vehicles, c.exitX, c.exitZ, { gap: core.tuning.convoyGap, speed: core.tuning.convoySpeed })) {
      this.setStage(c, 'depart');
    } else {
      this.setStage(c, 'parti');
    }
  }

  private thinkLeave(c: Convoy): void {
    const ap = this.core.autopilot;
    const lead = c.vehicles[0];
    if (!ap || !lead) {
      this.setStage(c, 'parti');
      return;
    }
    const st = ap.status(lead);
    if (st.state === 'arrive' || st.mode === 'idle' || st.state === 'echec' || this.core.now - c.stageT > 300) this.setStage(c, 'parti');
  }

  // ───────────────────────────── suivi ─────────────────────────────

  onPoliceDone(squadId: number, type: OrderType): void {
    const c = this.of(squadId);
    if (!c) return;
    if ((c.status.stage === 'debarquement' && type === 'debarquer') || (c.status.stage === 'rembarquement' && type === 'embarquer')) c.orderDone = true;
  }

  update(): void {
    const core = this.core;
    if (this.list.length === 0 || core.now < this.thinkAt) return;
    this.thinkAt = core.now + 0.5;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      switch (c.status.stage) {
        case 'route': this.thinkRoute(c); break;
        case 'stationnement': this.thinkPark(c); break;
        case 'debarquement':
          if (c.orderDone || core.now - c.stageT > 120) this.setStage(c, 'en_place');
          break;
        case 'rembarquement': this.thinkEmbark(c); break;
        case 'depart': this.thinkLeave(c); break;
        default: break;
      }
    }
  }

  /** Point d'où la colonne est venue (retour à la base par défaut). */
  originOf(squadId: number): { x: number; z: number } | null {
    const c = this.of(squadId);
    return c && c.hasDest ? { x: c.fromX, z: c.fromZ } : null;
  }
}
