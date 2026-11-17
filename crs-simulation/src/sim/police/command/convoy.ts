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
import { angleDiff, pointOnPolyline, projectOnPolyline } from '@/core/math';
import { agentOf } from '../brain';
import { isProtester } from './core';
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
  /** Embarquement préalable en cours (arrive avec boardFirst) : la colonne n'est pas encore partie. */
  boarding: boolean;
  /** Attente du joueur (instant du début, 0 sinon) et du dernier rappel radio. */
  waitSince: number;
  remindAt: number;
  /** Véhicules sortis de la colonne parce que bloqués (ils rejoignent seuls) et prochain contrôle. */
  solo: Vehicle[];
  unstuckAt: number;
  /** Départ échelonné : prochain véhicule à lancer, instant du dernier départ, positions de départ. */
  staggerIdx: number;
  staggerAt: number;
  startX: number[];
  startZ: number[];
  /** Foule à contourner (voir crowdZones) et instant du dernier relevé. */
  zones: { x: number; z: number; r: number }[];
  zonesAt: number;
  /** Longueur de l'itinéraire au départ (m ; −1 : pas encore relevée). */
  routeLen: number;
  /** Prochain nouvel itinéraire possible de la tête arrêtée par la foule (s). */
  rerouteAt: number;
  /** Tête de colonne : dernière position où elle bougeait et depuis quand elle n'en a pas bougé ; redémarrages. */
  stallX: number;
  stallZ: number;
  stallAt: number;
  restarts: number;
}

/** Attente maximale du joueur avant que la colonne parte sans lui (s), et intervalle des rappels radio. */
/**
 * Embarquement : attente de l'ordre « embarquer » (s), puis des retardataires (s) — au-delà, les retardataires sont
 * installés d'office (un agent bloqué derrière une grille ne retient pas la colonne cinq minutes).
 */
const BOARD_MAX = 120;
const STRAGGLERS_MAX = 45;
const PLAYER_WAIT = 300;
/** Un véhicule de la colonne bloqué plus longtemps que cela (s) la quitte et rejoint seul. */
const STUCK_LEAVE = 25;
/** Distance au point en deçà de laquelle un véhicule arrivé prend sa place dans le rang garé (m) ; au-delà, il finit le trajet seul. */
const ROW_REACH = 160;
/** Attente maximale du stationnement (s) ; et tant qu'un véhicule décroché finit le trajet seul, loin du point. */
const PARK_WAIT = 300;
const PARK_WAIT_JOINING = 720;
const PLAYER_REMIND = 30;

/**
 * Allure de croisière demandée pour une colonne en urgence (deux tons) ; le pilote automatique la porte à une fois et
 * demie en intervention urgente.
 */
function urgentSpeed(core: CommandCore): number {
  return core.tuning.convoySpeed;
}

/** Rang d'un véhicule dans la colonne : commandement en tête, fourgons, puis le cellulaire en serre-file. */
function columnRank(v: Vehicle): number {
  return v.kind === 'vl_commandement' ? 0 : v.kind === 'fourgon_cellulaire' ? 2 : 1;
}

export class ConvoyControl {
  readonly list: Convoy[] = [];
  private thinkAt = 0;
  private readonly pathBuf: number[] = [];

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
        status: { squadId, stage: 'route', vehicles: 0, parked: 0, alignError: -1, headingError: -1, t0: this.core.now, aboard: 0, total: 0, departIn: 0, awaitingPlayer: false, remaining: 0, route: [] },
        vehicles: [], dest: { x: 0, z: 0, heading: 0 }, hasDest: false, exitX: 0, exitZ: 0, hasExit: false, stageT: this.core.now,
        fromX: 0, fromZ: 0, orderDone: false, stragglersAt: 0, boarding: false, waitSince: 0, remindAt: 0, solo: [], unstuckAt: 0, staggerIdx: 0, staggerAt: 0, startX: [], startZ: [], zones: [], zonesAt: 0, routeLen: -1, rerouteAt: 0,
        stallX: 0, stallZ: 0, stallAt: 0, restarts: 0,
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
   * Départ d'un stationnement : la colonne part dans l'ordre PHYSIQUE — d'abord le véhicule le plus proche de la
   * sortie (le début de l'itinéraire vers la destination), sans quoi un fourgon attend celui qui le bloque et qui
   * l'attend lui-même. Le véhicule de commandement reste en tête s'il n'est pas enfermé derrière les autres.
   */
  private orderForDeparture(c: Convoy, tx: number, tz: number, commandFirst = true, urgent = true): void {
    const list = c.vehicles;
    if (list.length < 2) return;
    const ctx = this.core.ctx;
    let cx = 0, cz = 0;
    for (const v of list) { cx += v.x; cz += v.z; }
    cx /= list.length;
    cz /= list.length;
    // direction de la sortie : point de l'itinéraire à ~40 m du stationnement (sinon, droit vers la destination)
    let ex = tx - cx, ez = tz - cz;
    const path = this.pathBuf;
    path.length = 0;
    try {
      if (this.departRoute(c, cx, cz, tx, tz, path, urgent) && path.length >= 4) {
        for (let i = 2; i < path.length; i += 2) {
          const d = Math.hypot(path[i]! - cx, path[i + 1]! - cz);
          ex = path[i]! - cx;
          ez = path[i + 1]! - cz;
          if (d > 40) break;
        }
      }
    } catch {
      // itinéraire indisponible : direction de la destination
    }
    const l = Math.hypot(ex, ez);
    if (l < 1) return;
    const fx = ex / l, fz = ez / l;
    // abscisse le long de l'itinéraire quand il est connu (véhicules en file le long de la voie), sinon projection
    const onPath = path.length >= 4;
    const tmp = { x: 0, z: 0 };
    const ahead = (v: Vehicle): number => (onPath ? projectOnPolyline(v.x, v.z, path, tmp) : (v.x - cx) * fx + (v.z - cz) * fz);
    let front = -Infinity;
    for (const v of list) if (ahead(v) > front) front = ahead(v);
    // tête : le plus avancé vers la sortie (le véhicule de commandement s'il n'est pas enfermé)
    let head = 0;
    let best = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      const k = commandFirst && v.kind === 'vl_commandement' && ahead(v) > front - 1.5 ? 1e9 : ahead(v);
      if (k > best) { best = k; head = i; }
    }
    // puis chacun suit son voisin immédiat : la file se défait dans l'ordre où elle est garée
    const out: Vehicle[] = [list[head]!];
    const rest = list.filter((_, i) => i !== head);
    while (rest.length > 0) {
      const last = out[out.length - 1]!;
      let k = 0;
      let kd = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const d = Math.hypot(rest[i]!.x - last.x, rest[i]!.z - last.z) - ahead(rest[i]!) * 0.05;
        if (d < kd) { kd = d; k = i; }
      }
      out.push(rest.splice(k, 1)[0]!);
    }
    for (let i = 0; i < out.length; i++) list[i] = out[i]!;
  }

  /**
   * Itinéraire de sortie du stationnement, calculé comme le pilote automatique calculera celui de la tête (autopilot.ts,
   * plan) : départ dans le sens où les véhicules sont tournés, foule contournée (crowdZones), contresens au pas permis
   * en urgence, chaussée assez large. Le plus court chemin brut partait parfois de l'autre côté : la tête désignée était
   * alors le véhicule de queue, qui butait contre ceux qui devaient le suivre — colonne figée au départ.
   */
  private departRoute(c: Convoy, cx: number, cz: number, tx: number, tz: number, out: number[], urgent = true): boolean {
    const list = c.vehicles;
    let hx = 0, hz = 0;
    for (const v of list) { hx += Math.sin(v.heading); hz += Math.cos(v.heading); }
    // (cap commun seulement si les véhicules sont rangés dans le même sens)
    const aligned = list.length > 0 && Math.hypot(hx, hz) > list.length * 0.7;
    const width = list.reduce((w, v) => Math.max(w, v.def.width), 0);
    return this.core.ctx.world.findPath(cx, cz, tx, tz, 'vehicle', out, {
      heading: aligned ? Math.atan2(hx, hz) : NaN,
      uturn: aligned ? 35 : 0,
      avoid: this.crowdZones(c),
      contraflow: urgent ? 3 : 0,
      minWidth: width + 1.2,
    });
  }

  /**
   * Avant le départ : chaque véhicule a un conducteur (un passager de l'IA prend le volant si le siège est vide) ;
   * un véhicule resté vide est laissé sur place (il casserait la colonne : ceux qui le suivent l'attendraient).
   */
  private manVehicles(c: Convoy): void {
    const ctx = this.core.ctx;
    for (let i = c.vehicles.length - 1; i >= 0; i--) {
      const v = c.vehicles[i]!;
      if (v.seats[0] !== 0) continue;
      let moved = false;
      for (let s = 1; s < v.seats.length && !moved; s++) {
        const p = v.seats[s] !== 0 ? ctx.people.get(v.seats[s]!) : undefined;
        if (!p || p.isPlayer || p.custody !== 'free' || p.faction !== 'police') continue;
        ctx.vehicles.exit(p);
        moved = ctx.vehicles.enter(p, v, 0);
        if (!moved) ctx.vehicles.enter(p, v, s);
      }
      if (!moved) c.vehicles.splice(i, 1);
    }
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
    const reserved = this.reservedFor(c);
    for (let i = 0; i < n; i++) {
      const p = core.people[i];
      if (p.vehicleId !== 0 || p.isPlayer || p.posture === 'down' || p.custody !== 'free') continue;
      for (let k = c.vehicles.length - 1; k >= 0; k--) {
        const v = c.vehicles[k];
        if (Math.hypot(v.x - p.x, v.z - p.z) > 60) continue;
        if (v.id === reserved && this.freeSeats(v) <= 1) continue;
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
    c.routeLen = -1;
    c.orderDone = false;
    c.stallAt = 0;
    c.restarts = 0;
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
    c.boarding = false;
    c.waitSince = 0;
    if (dest.boardFirst && lead && ap) {
      // stationnement en bloc serré (rangs côte à côte) : personne ne pourrait manœuvrer pour sortir ; les véhicules
      // se rangent d'abord en file le long du début de l'itinéraire, nez vers la sortie (les équipages y montent)
      if (dest.stagger && this.packed(c)) this.lineUp(c, dest.x, dest.z);
      // embarquement d'abord : la colonne est « en route » pour le commandement (il attend), mais ne roule pas encore
      c.boarding = true;
      c.stragglersAt = 0;
      c.status.stage = 'echec';
      this.setStage(c, 'route');
      core.issue(squadId, { type: 'embarquer', issuedBy: squad.leaderId });
      core.say(squad.name, frame('À TOUS', squad.name, 'Embarquez, départ en colonne', false), 1, 'commandement', squad.leaderId);
      return true;
    }
    c.status.stage = 'echec';
    if (lead && ap) this.seatStragglers(c);
    if (lead && ap && ap.convoy(c.vehicles, dest.x, dest.z, { gap: core.tuning.convoyGap, speed: core.tuning.convoySpeed, avoid: this.crowdZones(c) })) {
      this.setStage(c, 'route');
      core.say(squad.name, frame('CENTRAL', squad.name, 'En route vers la zone de stationnement, ' + spell(c.vehicles.length) + ' véhicules en colonne', false), 1, 'commandement', squad.leaderId);
      return true;
    }
    // pas de véhicule ou pas de pilote : on débarque sur place
    this.beginDisembark(c);
    return lead !== undefined;
  }

  /** Embarquement préalable : ordre exécuté, retardataires à bord, joueur à bord (ou attente épuisée) → départ. */
  private thinkBoard(c: Convoy): void {
    const core = this.core;
    // le joueur est attendu (rappels radio) pendant tout l'embarquement, pas seulement à la fin
    const waiting = this.awaitPlayer(c);
    if (!c.orderDone && core.now - c.stageT < BOARD_MAX) return;
    if (c.stragglersAt === 0) c.stragglersAt = core.now;
    if (this.boardStragglers(c) > 0 && core.now - c.stragglersAt < STRAGGLERS_MAX) return;
    if (waiting) return;
    const ap = core.autopilot;
    this.seatStragglers(c);
    this.manVehicles(c);
    this.orderForDeparture(c, c.dest.x, c.dest.z);
    c.boarding = false;
    c.stageT = core.now;
    c.routeLen = -1;
    c.stallAt = 0;
    const squad = core.ctx.squads.get(c.status.squadId);
    if (ap && c.vehicles.length > 0 && c.dest.stagger) {
      c.staggerIdx = 0;
      this.launchNext(c);
      if (squad) core.say(squad.name, frame('CENTRAL', squad.name, 'Départ en colonne, ' + spell(c.vehicles.length) + ' véhicules, deux tons', false), 1, 'commandement', squad.leaderId);
      return;
    }
    if (ap && c.vehicles.length > 0 && ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, speed: urgentSpeed(core), urgence: true, avoid: this.crowdZones(c) })) {
      if (squad) core.say(squad.name, frame('CENTRAL', squad.name, 'En route vers la zone de stationnement, ' + spell(c.vehicles.length) + ' véhicules en colonne', false), 1, 'commandement', squad.leaderId);
      return;
    }
    this.beginDisembark(c);
  }

  private freeSeats(v: Vehicle): number {
    let free = 0;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s].role === 'passenger') free++;
    return free;
  }

  /**
   * Véhicule où une place reste réservée au joueur (celui de son groupe, à défaut le premier de la colonne) tant qu'il
   * est à pied et fait partie de l'unité : les retardataires de l'IA ne la lui prennent pas. 0 si aucun.
   */
  private reservedFor(c: Convoy): number {
    const core = this.core;
    const ctx = core.ctx;
    const pid = ctx.player.state.personId;
    const p = pid !== 0 ? ctx.people.get(pid) : undefined;
    if (!p || p.vehicleId !== 0 || c.vehicles.length === 0) return 0;
    const n = core.members(c.status.squadId, core.people2);
    let mine = false;
    for (let i = 0; i < n; i++) if (core.people2[i] === p) { mine = true; break; }
    if (!mine) return 0;
    const own = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
    if (own && own.vehicleId !== 0) for (const v of c.vehicles) if (v.id === own.vehicleId) return v.id;
    return c.vehicles[0].id;
  }

  /**
   * Le joueur fait partie de l'unité et il est encore à pied : la colonne l'attend (rappels radio), cinq minutes au
   * plus. Un joueur qui conduit son propre véhicule n'est pas attendu (il suit la colonne).
   */
  private awaitPlayer(c: Convoy): boolean {
    const core = this.core;
    const ctx = core.ctx;
    const pid = ctx.player.state.personId;
    const p = pid !== 0 ? ctx.people.get(pid) : undefined;
    if (!p || p.vehicleId !== 0 || p.custody !== 'free' || p.posture === 'down' || ctx.health.isIncapacitated(p)) {
      c.waitSince = 0;
      return false;
    }
    const n = core.members(c.status.squadId, core.people);
    let mine = false;
    for (let i = 0; i < n; i++) if (core.people[i] === p) { mine = true; break; }
    if (!mine) return false;
    if (c.waitSince === 0) { c.waitSince = core.now; c.remindAt = core.now + 20; }
    if (core.now - c.waitSince > PLAYER_WAIT) return false;
    if (core.now >= c.remindAt) {
      c.remindAt = core.now + PLAYER_REMIND;
      const own = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
      const squad = ctx.squads.get(c.status.squadId);
      core.say(squad ? squad.name : 'PC', `${own ? own.name : 'Unité'}, on n'attend plus que vous : embarquez !`, 2, 'unite');
    }
    return true;
  }

  /** Véhicules garés trop près les uns des autres pour sortir chacun de son côté (moins de 7 m entre deux). */
  private packed(c: Convoy): boolean {
    const list = c.vehicles;
    for (let i = 0; i < list.length; i++) {
      if (Math.abs(list[i]!.speed) > 0.3) return false;
      for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i]!.x - list[j]!.x, list[i]!.z - list[j]!.z) < 7) return true;
    }
    return false;
  }

  /**
   * Met la colonne en file le long du début de l'itinéraire vers (tx, tz) : la tête au plus loin, chacun à 4 m du
   * précédent, à droite de l'axe si la place est libre. Les véhicules qu'aucune place ne reçoit restent où ils sont.
   */
  private lineUp(c: Convoy, tx: number, tz: number): void {
    const ctx = this.core.ctx;
    const list = c.vehicles;
    let cx = 0, cz = 0;
    for (const v of list) { cx += v.x; cz += v.z; }
    cx /= list.length;
    cz /= list.length;
    const path = this.pathBuf;
    path.length = 0;
    let ok = false;
    try { ok = this.departRoute(c, cx, cz, tx, tz, path) && path.length >= 4; } catch { ok = false; }
    if (!ok) return;
    this.orderForDeparture(c, tx, tz, false);
    const p = { x: 0, z: 0 };
    const near: Vehicle[] = [];
    let s = 8;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      // un véhicule sans conducteur ne partira pas : il reste à sa place, hors de la file
      if (v.seats[0] === 0) continue;
      // première place libre le long de l'itinéraire (ni mur, ni voiture garée, ni autre véhicule)
      let placed = false;
      for (let tries = 0; tries < 8 && !placed; tries++) {
        s += v.def.length * 0.5;
        const h = pointOnPolyline(path, s, p);
        const rx = Math.cos(h), rz = -Math.sin(h);
        for (const off of [1.4, 0, -1.4]) {
          const x = p.x + rx * off, z = p.z + rz * off;
          if (!ctx.world.isFree(x, z, v.def.width * 0.5)) continue;
          let busy = false;
          ctx.vehicles.queryRadius(x, z, v.def.length * 0.5 + 2, near as never[]);
          for (const o of near) if (o !== v) { busy = true; break; }
          if (busy) continue;
          v.x = x;
          v.z = z;
          v.heading = h;
          v.vx = 0;
          v.vz = 0;
          v.speed = 0;
          placed = true;
          break;
        }
        s += v.def.length * 0.5 + (placed ? 6 : 2);
      }
    }
  }

  /** Départ échelonné : le véhicule suivant part vers le point et s'arrêtera derrière ceux qui le précèdent. */
  private launchNext(c: Convoy): void {
    const core = this.core;
    const ap = core.autopilot;
    const v = c.vehicles[c.staggerIdx];
    if (!ap || !v) return;
    const order = c.staggerIdx;
    c.startX[order] = v.x;
    c.startZ[order] = v.z;
    ap.driveTo(v, c.dest.x, c.dest.z, { urgence: true, speed: urgentSpeed(core), stopBefore: 2 + order * 11, avoid: this.crowdZones(c) });
    c.staggerIdx++;
    c.staggerAt = core.now;
  }

  /** Colonne échelonnée en route : départs successifs, puis débarquement quand tous sont arrivés (ou arrêtés). */
  private thinkStagger(c: Convoy): void {
    const core = this.core;
    const ap = core.autopilot!;
    const now = core.now;
    const n = c.vehicles.length;
    if (c.staggerIdx < n) {
      const i = c.staggerIdx - 1;
      const prev = c.vehicles[i];
      const moved = prev ? Math.hypot(prev.x - c.startX[i]!, prev.z - c.startZ[i]!) : 99;
      if (moved > 12 || now - c.staggerAt > 8) this.launchNext(c);
      return;
    }
    // colonne coincée au départ : un véhicule arrêté derrière un autre de la colonne pas encore lancé le fait partir ;
    // une voiture civile qui barre la route à une colonne en urgence se range (retirée de la chaussée)
    if (now >= c.unstuckAt) {
      c.unstuckAt = now + 2;
      for (let i = 0; i < c.staggerIdx; i++) {
        const v = c.vehicles[i]!;
        const st = ap.status(v);
        if ((st.state !== 'attente' && st.state !== 'bloque') || st.blockedFor < 6 || Math.abs(v.speed) > 0.3) continue;
        const o = obstacleOf(ap, v);
        const ov = o !== 0 ? core.ctx.vehicles.get(o) : undefined;
        if (!ov) continue;
        const k = c.vehicles.indexOf(ov);
        if (k >= c.staggerIdx) {
          // le gêneur est de la colonne et attend son tour : il part maintenant
          c.vehicles.splice(k, 1);
          c.vehicles.splice(c.staggerIdx, 0, ov);
          this.launchNext(c);
        } else if (k < 0 && ov.faction !== 'police' && st.blockedFor > 8 && Math.abs(ov.speed) < 0.3) {
          const driver = ov.seats[0] !== 0 ? core.ctx.people.get(ov.seats[0]!) : undefined;
          if (!driver || !driver.isPlayer) core.ctx.vehicles.remove(ov.id);
        }
      }
    }
    let done = 0;
    for (const v of c.vehicles) {
      const st = ap.status(v);
      const near = Math.hypot(v.x - c.dest.x, v.z - c.dest.z) < 70 + n * 11;
      // arrivé, ou arrêté près du point derrière les autres (ils se gênent à l'arrivée : c'est le débarquement)
      if (st.state === 'arrive' || st.state === 'echec' || (st.mode === 'idle' && near) || (near && Math.abs(v.speed) < 0.5 && st.blockedFor > 4)
        || (st.state === 'bloque' && st.blockedFor > 60)) done++;
    }
    const max = this.routeMax(c, 600);
    if (done < n && now - c.stageT < max) return;
    for (let i = 0; i < n; i++) if (Math.abs(c.vehicles[i]!.speed) > 0.4 && now - c.stageT < max + 20) return;
    // les véhicules arrêtés : plus de pilote automatique (ils ne cherchent plus à se faufiler pendant le débarquement)
    for (const v of c.vehicles) ap.stop(v);
    this.beginDisembark(c);
  }

  private thinkRoute(c: Convoy): void {
    const core = this.core;
    if (c.boarding) {
      this.thinkBoard(c);
      return;
    }
    if (c.dest.stagger && core.autopilot) {
      this.thinkStagger(c);
      return;
    }
    const ap = core.autopilot;
    const lead = c.vehicles[0];
    if (!ap || !lead) {
      this.beginDisembark(c);
      return;
    }
    const now = core.now;
    // un véhicule bloqué (garé en travers, embouteillage) ne doit pas immobiliser toute la colonne : il la quitte et
    // rejoint le point seul, en urgence ; les autres reforment la colonne et repartent
    if (now >= c.unstuckAt) {
      for (let i = 1; i < c.vehicles.length; i++) {
        const vi = c.vehicles[i]!;
        const vs = ap.status(vi);
        // arrêté pour de bon derrière autre chose que son meneur, ou sorti de la colonne (pilote au repos loin du point)
        // (pas pour des personnes devant lui — la foule près du point : la colonne entière l'attend — ni près du point)
        const blocked = vs.mode === 'follow' && (vs.state === 'bloque' || vs.state === 'attente') && vs.blockedFor > STUCK_LEAVE
          && vs.reason !== 'personne' && vs.reason !== '' && Math.abs(vi.speed) < 0.3 && obstacleOf(ap, vi) !== vs.leaderId
          && Math.hypot(vi.x - c.dest.x, vi.z - c.dest.z) > 200;
        const dropped = vs.mode === 'idle' && Math.hypot(vi.x - c.dest.x, vi.z - c.dest.z) > 90;
        if (blocked || dropped) {
          const v = c.vehicles.splice(i, 1)[0]!;
          // (il s'arrêtera à sa place derrière la tête, pas sur le point même : pas d'embouteillage à l'arrivée)
          ap.driveTo(v, c.dest.x, c.dest.z, { urgence: true, speed: urgentSpeed(core), stopBefore: 4 + (c.vehicles.length + c.solo.length) * 9, avoid: this.crowdZones(c) });
          c.solo.push(v);
          if (c.vehicles.length > 0) ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, speed: urgentSpeed(core), urgence: true, avoid: this.crowdZones(c) });
          c.unstuckAt = now + 10;
          break;
        }
      }
      // un véhicule parti seul dont le pilote s'est arrêté loin du point repart
      for (const v of c.solo) {
        const vs = ap.status(v);
        if (vs.mode === 'idle' && Math.abs(v.speed) < 0.3 && Math.hypot(v.x - c.dest.x, v.z - c.dest.z) > 90) {
          ap.driveTo(v, c.dest.x, c.dest.z, { urgence: true, speed: urgentSpeed(core), stopBefore: 4 + (c.vehicles.length + c.solo.indexOf(v)) * 9, avoid: this.crowdZones(c) });
        }
      }
    }
    // tête bloquée au départ par un véhicule de sa propre colonne (garés en bloc) : nouvel ordre, strictement physique
    const ls = ap.status(lead);
    if ((ls.state === 'attente' || ls.state === 'bloque') && ls.blockedFor > 15 && Math.abs(lead.speed) < 0.3 && now >= c.unstuckAt) {
      this.orderForDeparture(c, c.dest.x, c.dest.z, false);
      if (c.vehicles[0] !== lead) {
        ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, speed: urgentSpeed(core), urgence: true, avoid: this.crowdZones(c) });
        c.unstuckAt = now + 15;
        return;
      }
      c.unstuckAt = now + 15;
    }
    // tête arrêtée par la foule loin du point : la foule a bougé (cortège) — nouvel itinéraire qui la contourne
    if (ls.state !== 'en_route' && ls.reason === 'personne' && ls.blockedFor > 15 && now >= c.rerouteAt && ap.reroute
      && Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z) > 90) {
      c.rerouteAt = now + 30;
      c.zonesAt = 0;
      ap.reroute(lead, undefined, this.crowdZones(c));
    }
    const st = ap.status(lead);
    const leadToDest = Math.hypot(lead.x - c.dest.x, lead.z - c.dest.z);
    // tête immobile (à 4 m près) depuis combien de temps : manœuvres sur place comprises
    if (c.stallAt === 0 || Math.hypot(lead.x - c.stallX, lead.z - c.stallZ) > 4) {
      c.stallX = lead.x;
      c.stallZ = lead.z;
      c.stallAt = now;
    }
    // pilote de tête au repos loin du point (rendu la main, itinéraire abandonné) alors qu'il reste de la route : ce n'est
    // pas une arrivée — la colonne repart vers le point (comme un véhicule sorti de la colonne), trois fois au plus
    if (st.mode === 'idle' && st.state !== 'arrive' && leadToDest > 90 && c.restarts < 3 && now >= c.unstuckAt) {
      c.restarts++;
      c.unstuckAt = now + 10;
      for (const v of c.solo) if (c.vehicles.indexOf(v) < 0) c.vehicles.push(v);
      c.solo.length = 0;
      if (ap.convoy(c.vehicles, c.dest.x, c.dest.z, { gap: core.tuning.convoyGap, speed: urgentSpeed(core), urgence: true, avoid: this.crowdZones(c) })) return;
    }
    // tête arrivée à quelques dizaines de mètres du point mais arrêtée là (mobilier, véhicule, manœuvre sans fin sur
    // ses derniers mètres) : la colonne est arrivée, elle se gare — sans attendre qu'un demi-tour sur la place la
    // retourne nez à nez avec ses propres fourgons (elle ne pourrait plus repartir)
    const parkedNear = leadToDest < 60 && Math.abs(lead.speed) < 0.5 && st.state !== 'en_route'
      && (now - c.stallAt > 15 || ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > 6));
    const arrived = st.state === 'arrive' || parkedNear || (st.mode === 'idle' && (leadToDest <= 90 || c.restarts >= 3));
    const max = this.routeMax(c, 420);
    const stuck = st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 40) || now - c.stageT > max;
    if (!arrived && !stuck) return;
    // les véhicules partis seuls reprennent leur place pour le stationnement
    for (const v of c.solo) if (c.vehicles.indexOf(v) < 0) c.vehicles.push(v);
    c.solo.length = 0;
    // toute la colonne à l'arrêt avant de se garer
    for (let i = 0; i < c.vehicles.length; i++) if (Math.abs(c.vehicles[i].speed) > 0.4 && now - c.stageT < max + 20) return;
    const d = c.dest;
    const near = Math.hypot(lead.x - d.x, lead.z - d.z) < 60;
    // véhicules encore loin (partis seuls par un autre chemin) : ils finissent le trajet et s'arrêtent derrière la file
    // (les garer d'ici, à des centaines de mètres, les ferait manœuvrer à travers la ville)
    const rowList = near ? c.vehicles.filter((v) => Math.hypot(v.x - d.x, v.z - d.z) < ROW_REACH) : c.vehicles;
    if (near) {
      let k = rowList.length;
      for (const v of c.vehicles) {
        if (rowList.indexOf(v) >= 0) continue;
        const st = ap.status(v);
        if (st.mode !== 'drive') ap.driveTo(v, d.x, d.z, { urgence: true, speed: urgentSpeed(core), stopBefore: 4 + k * 9, avoid: this.crowdZones(c) });
        k++;
      }
    }
    if (near && rowList.length > 0 && ap.parkRow(rowList, d.x, d.z, d.heading, d.layout ?? 'file', d.layout === 'file' || d.layout === undefined ? 1.6 : undefined)) {
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
    /** Un véhicule décroché finit encore le trajet seul jusqu'au point. */
    let joining = false;
    const now = this.core.now;
    if (c.stallAt < c.stageT) c.stallAt = c.stageT;
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i];
      const st = ap.status(v);
      if (st.state === 'arrive' || st.mode === 'idle') parked++;
      else if (st.state === 'echec') failed++;
      // (un véhicule qui roule ou manœuvre réellement : le stationnement avance)
      if (Math.abs(v.speed) > 0.3) c.stallAt = now;
      // (un véhicule décroché, trop loin pour prendre place dans le rang, qui finit le trajet seul — voir thinkRoute — :
      // il manœuvre, attend un passage, prend un autre itinéraire ; on l'attend jusqu'à ce qu'il s'arrête derrière la
      // file. Compté comme « plus rien ne bouge », ou au bout des cinq minutes du stationnement, il était arrêté là où il
      // était et son équipage débarquait à des centaines de mètres du point — le joueur passager avec lui)
      if (st.mode === 'drive' && !(st.state === 'bloque' && st.blockedFor > 60)) {
        joining = true;
        c.stallAt = now;
      }
    }
    c.status.parked = parked;
    // plus rien ne bouge depuis 20 s (chacun attend un voisin qui l'attend lui-même, mobilier sur une place) : les
    // véhicules restent où ils sont, en file le long de la voie, et l'on débarque — pas cinq minutes d'attente
    const deadlock = now - c.stallAt > 20;
    if (parked + failed < c.vehicles.length && now - c.stageT < (joining ? PARK_WAIT_JOINING : PARK_WAIT) && !deadlock) return;
    if (parked + failed < c.vehicles.length) for (const v of c.vehicles) ap.stop(v);
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
    const reserved = this.reservedFor(c);
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
        if (v.id === reserved) free--;
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
    const waiting = this.awaitPlayer(c);
    if (!c.orderDone && core.now - c.stageT < BOARD_MAX) return;
    // les retardataires montent où il reste de la place (une minute et demie au plus)
    if (c.stragglersAt === 0) c.stragglersAt = core.now;
    if (this.boardStragglers(c) > 0 && core.now - c.stragglersAt < STRAGGLERS_MAX) return;
    if (waiting) return;
    const ap = core.autopilot;
    if (c.hasExit && ap && c.vehicles.length > 0) {
      this.seatStragglers(c);
      this.manVehicles(c);
      this.orderForDeparture(c, c.exitX, c.exitZ, true, false);
    }
    if (c.hasExit && ap && c.vehicles.length > 0 && ap.convoy(c.vehicles, c.exitX, c.exitZ, { gap: core.tuning.convoyGap, speed: core.tuning.convoySpeed, avoid: this.crowdZones(c) })) {
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
    if ((c.status.stage === 'debarquement' && type === 'debarquer') || (c.status.stage === 'rembarquement' && type === 'embarquer')
      || (c.boarding && type === 'embarquer')) c.orderDone = true;
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
      this.publish(c);
    }
  }

  /**
   * État lisible du départ et du trajet (carte de mission du joueur, GPS) : agents à bord sur agents attendus, délai
   * maximal avant le départ, distance et itinéraire restants de la tête. Relu deux fois par seconde.
   */
  private publish(c: Convoy): void {
    const core = this.core;
    const st = c.status;
    const now = core.now;
    const waiting = (st.stage === 'route' && c.boarding) || st.stage === 'rembarquement';
    const moving = (st.stage === 'route' && !c.boarding) || st.stage === 'depart';
    if (waiting || moving) {
      const n = core.members(st.squadId, core.people);
      let aboard = 0;
      let total = 0;
      for (let i = 0; i < n; i++) {
        const p = core.people[i];
        if (p.posture === 'down' || p.custody !== 'free') continue;
        total++;
        if (p.vehicleId !== 0) aboard++;
      }
      st.aboard = aboard;
      st.total = total;
    }
    st.awaitingPlayer = waiting && c.waitSince > 0;
    if (waiting) {
      // l'ordre d'embarquer, puis les retardataires, puis le joueur : la colonne part au plus tard au bout du plus long
      let left = !c.orderDone && now - c.stageT < BOARD_MAX ? BOARD_MAX - (now - c.stageT) : 0;
      if (c.stragglersAt > 0 && now - c.stragglersAt < STRAGGLERS_MAX) left = Math.max(left, STRAGGLERS_MAX - (now - c.stragglersAt));
      if (c.waitSince > 0) left = Math.max(left, PLAYER_WAIT - (now - c.waitSince));
      st.departIn = Math.max(0, Math.ceil(left));
    } else {
      st.departIn = 0;
    }
    const route = st.route ?? (st.route = []);
    const ap = core.autopilot;
    const lead = c.vehicles[0];
    if (moving && ap && lead) {
      st.remaining = ap.status(lead).remaining;
      if (!ap.plannedPath || !ap.plannedPath(lead, route)) route.length = 0;
    } else {
      st.remaining = 0;
      route.length = 0;
    }
  }

  /**
   * Durée maximale du trajet avant de débarquer là où l'on est (s) : au moins `min`, davantage pour traverser Paris
   * (itinéraire de la tête au départ, à 5 m/s de moyenne, plus deux minutes).
   */
  private routeMax(c: Convoy, min: number): number {
    if (c.routeLen < 0) {
      const ap = this.core.autopilot;
      const lead = c.vehicles[0];
      const rem = ap && lead ? ap.status(lead).remaining : 0;
      if (rem > 0) c.routeLen = rem;
    }
    return c.routeLen > 0 ? Math.max(min, c.routeLen / 5 + 120) : min;
  }

  /**
   * Foule à contourner sur le trajet (manifestants regroupés) : une zone par carré de 40 m où ils sont au moins six.
   * La colonne passe à l'écart quand un autre chemin existe (elle ne fend pas une manifestation pour gagner sa zone de
   * stationnement). Recalculé au plus toutes les 5 s.
   */
  private crowdZones(c: Convoy): { x: number; z: number; r: number }[] {
    const core = this.core;
    if (c.zonesAt > 0 && core.now - c.zonesAt < 5) return c.zones;
    c.zonesAt = core.now;
    const cells = new Map<number, { n: number; x: number; z: number }>();
    const list = core.ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.dormant || !isProtester(p)) continue;
      const key = Math.floor(p.x / 40) * 65536 + Math.floor(p.z / 40);
      const cell = cells.get(key);
      if (cell) {
        cell.n++;
        cell.x += p.x;
        cell.z += p.z;
      } else {
        cells.set(key, { n: 1, x: p.x, z: p.z });
      }
    }
    const out: { x: number; z: number; r: number }[] = [];
    for (const cell of cells.values()) {
      if (cell.n < 6) continue;
      out.push({ x: cell.x / cell.n, z: cell.z / cell.n, r: 30 });
      if (out.length >= 40) break;
    }
    c.zones = out;
    return out;
  }

  /** Point d'où la colonne est venue (retour à la base par défaut). */
  originOf(squadId: number): { x: number; z: number } | null {
    const c = this.of(squadId);
    return c && c.hasDest ? { x: c.fromX, z: c.fromZ } : null;
  }
}

/**
 * Véhicule qui arrête celui-ci (0 si aucun). Lu dans l'état interne du pilote automatique, faute d'un champ public
 * (à exposer dans AutopilotStatus quand le module des véhicules sera revu).
 */
function obstacleOf(ap: unknown, v: Vehicle): number {
  try {
    const rt = (ap as { k?: { rt?(v: Vehicle): { ap?: { obsId?: number; obsReason?: string } | null } } }).k?.rt?.(v);
    const st = rt && rt.ap;
    return st && st.obsReason === 'vehicule' && typeof st.obsId === 'number' ? st.obsId : 0;
  } catch {
    return 0;
  }
}

