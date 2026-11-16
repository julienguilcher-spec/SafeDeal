/* =====================================================================================
 * SECOURS — données d'un appel, d'un équipage et de ses membres ; noyau partagé du module.
 * ===================================================================================== */

import type { EntityId, EntityKind, GameContext, Person, Rng, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueCall, RescueKind, RescueState } from '@/core/extensions';
import type { CrewView, RescueCallEvent, RescueRecord, RescueTuning } from './api';
import { RESCUE_CALL_EVENT } from './api';
import type { CareService } from './care';
import { Walker } from './nav';
import type { SafetyDesk } from './safety';
import { DEFAULT_TUNING } from './tuning';

/** Ce que le module utilise du pilote automatique des véhicules (service « vehicles.autopilot »), s'il est branché. */
export interface AutopilotLike {
  driveTo(v: Vehicle, x: number, z: number, options?: { speed?: number; urgence?: boolean; stopBefore?: number }): boolean;
  park(v: Vehicle, x: number, z: number, heading: number): boolean;
  stop(v: Vehicle): void;
  status(v: Vehicle): { state: string; reason: string; remaining: number; blockedFor: number };
  isActive(v: Vehicle): boolean;
}

/** Ce que le module utilise du service étendu des véhicules (sirène, gyrophares), s'il est branché. */
export interface VehiclesExtLike {
  setSiren(v: Vehicle, mode: 0 | 1 | 2): void;
  setBeacons(v: Vehicle, on: boolean): void;
}

// ── rôles dans l'équipage ──
export const ROLE_DRIVER = 0;
/** Chef d'agrès : évalue, rend compte, se tient près de l'engin. */
export const ROLE_CHIEF = 1;
/** Binôme d'attaque : la lance. */
export const ROLE_HOSE = 2;
/** Binôme de secours à victime. */
export const ROLE_AID = 3;
/** Médecin et infirmier du SAMU. */
export const ROLE_DOCTOR = 4;
export const ROLE_NURSE = 5;

// ── tâche individuelle ──
export const T_IDLE = 0;
export const T_HOSE = 1;
export const T_CASUALTY = 2;
export const T_BOARD = 3;
export const T_STANDBY = 4;
export const T_FOLLOW = 5;

// ── état de l'équipage ──
/** Pré-positionné, à bord, sans appel. */
export const C_STAGED = 0;
export const C_TRAVEL = 1;
export const C_WAIT = 2;
export const C_WORK = 3;
export const C_PACK = 4;
export const C_LEAVE = 5;
export const C_GONE = 6;

// ── étape du trajet ──
/** Vers le point d'arrêt à distance. */
export const LEG_APPROACH = 0;
/** Zone jugée sûre : jusqu'au point de travail. */
export const LEG_FINAL = 1;
/** Arrêté à distance. */
export const LEG_HOLD = 2;

export class Rescuer {
  readonly walker = new Walker();
  task = T_IDLE;
  stage = 0;
  targetId: EntityId = 0;
  /** Nature de la cible d'un foyer (objet, véhicule, boutique, lieu). */
  targetKind: EntityKind = 'place';
  tx = 0;
  tz = 0;
  /** Point où se tenir (lance, attente). */
  sx = 0;
  sz = 0;
  until = 0;
  readyAt = 0;
  nextAt = 0;
  tries = 0;
  /** Progression vers le point où il porte quelqu'un : meilleure distance atteinte, et quand. */
  reachBest = Infinity;
  reachAt = 0;
  /** Lance établie (le temps d'établissement n'est dû qu'une fois par intervention). */
  hoseSet = false;
  /** Dernière mesure du foyer arrosé (pour compter les extinctions). */
  lastMeasure = 0;
  fxAt = 0;
  sfxAt = 0;
  /** Blessé au cours de l'intervention (compté une fois). */
  hurt = false;

  constructor(readonly p: Person, readonly role: number) {}

  reset(): void {
    this.task = T_IDLE;
    this.stage = 0;
    this.targetId = 0;
    this.tries = 0;
    this.until = 0;
    this.nextAt = 0;
  }
}

export interface FireTarget {
  kind: EntityKind;
  id: EntityId;
  x: number;
  z: number;
  /** Intensité 0..1. */
  m: number;
  /** Demi-encombrement de ce qui brûle (m). */
  r: number;
  /** Rang de priorité (boutique, véhicule, barricade, objet, sol). */
  rank: number;
}

export class CallRec implements RescueCall {
  state: RescueState = 'demande';
  eta = 0;
  vehicleId: EntityId = 0;
  waitingReason = '';

  // ── internes ──
  crew: Crew | null = null;
  requestedAt: number;
  /** Instant de départ prévu. */
  departAt = 0;
  /** Longueur du trajet prévu (m) et allure d'estimation. */
  routeLength = 0;
  closedAt = -1;
  /** Objet du décor visé par l'intervention (barricade en feu) : il ne « barre » pas la route. */
  targetProp: EntityId = 0;
  playerLed = false;
  waitRadioAt = -1e9;
  /** En attente d'un moyen libre. */
  queued = false;
  record: RescueRecord;

  constructor(
    readonly id: number, readonly kind: RescueKind, public x: number, public z: number, public incidentId: number,
    readonly byId: EntityId, now: number,
  ) {
    this.requestedAt = now;
    this.record = {
      callId: id, kind, incidentId, x, z, requestedAt: now, departedAt: -1, arrivedAt: -1, leftAt: -1, waited: 0, waitReason: '',
      firesOut: 0, victimsTreated: 0, victimsEvacuated: 0, crewHurt: 0, retreats: 0, playerLed: false, cancelled: false, points: 0,
    };
  }

  get live(): boolean {
    return this.state !== 'reparti' && this.state !== 'annule';
  }
}

export class Crew implements CrewView {
  squadId = 0;
  vehicle: Vehicle | null = null;
  readonly members: Rescuer[] = [];
  call: CallRec | null = null;
  phase = C_TRAVEL;
  leg = LEG_APPROACH;
  playerLed = false;
  /** Pré-positionné : il revient à son point de stationnement au lieu de quitter la carte. */
  staged = false;
  homeX = 0;
  homeZ = 0;
  homeHeading = 0;
  /** Point d'où l'équipage est parti (et où il repart). */
  originX = 0;
  originZ = 0;
  /** À pied, sans véhicule du tout (pas de module de véhicules, engin détruit). */
  onFoot = false;
  /** L'engin a été laissé en retrait (itinéraire coupé) : l'équipage finit à pied et y reviendra. */
  walking = false;
  /** Point d'arrêt à distance (équipe à pied). */
  standX = 0;
  standZ = 0;
  thinkAt = 0;
  /** Intervalle de réflexion courant (s). */
  period = 0.25;
  /** Début de la phase courante. */
  phaseAt = 0;
  /** Repli en cours jusqu'à cet instant (prise à partie). */
  retreatUntil = 0;
  /** Dernier instant où un foyer brûlait encore / où une victime attendait. */
  lastFireAt = 0;
  lastVictimAt = 0;
  foundWork = false;
  /** Victime chargée dans l'ambulance (ou portée par un équipier à pied). */
  patientId: EntityId = 0;
  /** Victimes restées sur place faute de place : une autre ambulance est demandée. */
  leftBehind = 0;
  readonly fires: FireTarget[] = [];
  fireCount = 0;
  readonly victims: Person[] = [];
  /** Une demande de SAMU a déjà été faite par cet équipage pour cette intervention. */
  askedSamu = false;
  /** Foyers déjà comptés éteints pendant cette intervention [x0, z0, x1, z1, …] (deux lances sur un même feu : un seul foyer). */
  readonly firesDone: number[] = [];
  blockedSince = -1;
  /** Trajet en cours : destination finale, et point de passage quand il faut contourner un pâté de maisons. */
  destX = 0;
  destZ = 0;
  destStop = 0;
  destUrgent = false;
  via = false;
  viaX = 0;
  viaZ = 0;
  /** Dégagement d'un engin coincé contre un mur : marche arrière jusqu'à cet instant ; nombre de tentatives. */
  unstickUntil = 0;
  unstuck = 0;
  /** Progression à pied : meilleure distance au but relevée, et instant de ce relevé. */
  bestDistance = Infinity;
  bestAt = 0;

  constructor(readonly id: number, readonly kind: RescueKind) {}

  get vehicleId(): EntityId {
    return this.vehicle ? this.vehicle.id : 0;
  }

  get callId(): number {
    return this.call ? this.call.id : 0;
  }

  get state(): 'veille' | RescueState {
    return this.call ? this.call.state : this.phase === C_STAGED ? 'veille' : 'reparti';
  }

  get size(): number {
    return this.members.length;
  }

  get water(): number {
    const v = this.vehicle;
    if (!v || v.def.turrets.length === 0 || v.def.turrets[0].kind !== 'canon_eau') return -1;
    return v.turretAmmo.length > 0 ? v.turretAmmo[0] : -1;
  }

  /** Membre de référence d'un équipage à pied : le premier qui n'est pas resté à bord. */
  private walker(): Person | null {
    const m = this.members;
    for (let i = 0; i < m.length; i++) if (m[i].p.vehicleId === 0) return m[i].p;
    return m.length > 0 ? m[0].p : null;
  }

  /** Position de référence de l'équipage : l'engin, sinon (à pied, ou engin laissé en retrait) le premier membre à pied. */
  posX(): number {
    if (this.vehicle && !this.onFoot && !this.walking) return this.vehicle.x;
    const p = this.walker();
    return p ? p.x : this.originX;
  }

  posZ(): number {
    if (this.vehicle && !this.onFoot && !this.walking) return this.vehicle.z;
    const p = this.walker();
    return p ? p.z : this.originZ;
  }

  memberOf(id: EntityId): Rescuer | null {
    const m = this.members;
    for (let i = 0; i < m.length; i++) if (m[i].p.id === id) return m[i];
    return null;
  }
}

/** Noyau partagé par les fichiers du module. */
export class RescueKernel {
  ctx!: GameContext;
  rng!: Rng;
  readonly tuning: RescueTuning = { ...DEFAULT_TUNING };
  care!: CareService;
  safety!: SafetyDesk;
  readonly calls: CallRec[] = [];
  readonly crews: Crew[] = [];
  /** Demandes d'une seconde ambulance, à passer quand l'appel `after` sera clos. */
  readonly pendingSamu: { x: number; z: number; victimId: EntityId; incidentId: number; after: number }[] = [];
  private readonly callEvent: RescueCallEvent = { callId: 0, kind: 'pompiers', state: 'demande', previous: 'demande' };
  private readonly douseEvent = { x: 0, z: 0, radius: 0, amount: 0 };

  get now(): number {
    return this.ctx.clock.now;
  }

  autopilot(): AutopilotLike | undefined {
    return this.ctx.service<AutopilotLike>('vehicles.autopilot');
  }

  vehiclesExt(): VehiclesExtLike | undefined {
    return this.ctx.service<VehiclesExtLike>('vehicles.ext');
  }

  setState(call: CallRec, state: RescueState): void {
    if (call.state === state) return;
    const ev = this.callEvent;
    ev.callId = call.id;
    ev.kind = call.kind;
    ev.previous = call.state;
    ev.state = state;
    call.state = state;
    if (state === 'reparti' || state === 'annule') call.closedAt = this.now;
    this.ctx.events.emitAny(RESCUE_CALL_EVENT, ev);
  }

  /** Incident ouvert qui porte sur cette personne (0 si aucun, ou si le module des incidents n'est pas branché). */
  incidentOfPerson(id: EntityId): number {
    const incidents = this.ctx.service<IncidentsApi>(EXT.incidents);
    if (!incidents) return 0;
    const list = incidents.list;
    for (let i = 0; i < list.length; i++) {
      const inc = list[i];
      if (inc.targetKind === 'person' && inc.targetId === id && inc.state !== 'resolu' && inc.state !== 'echoue') return inc.id;
    }
    return 0;
  }

  /**
   * Eau sur un point : éteint le feu, rabat gaz et fumée. Si le module des dangers n'est pas branché,
   * l'événement d'arrosage est émis ici pour que le mobilier et les véhicules en feu réagissent quand même.
   */
  douse(x: number, z: number, radius: number, amount: number): void {
    const ctx = this.ctx;
    ctx.hazards.douse(x, z, radius, amount);
    if (!ctx.service('hazards.field')) {
      const ev = this.douseEvent;
      ev.x = x;
      ev.z = z;
      ev.radius = radius;
      ev.amount = amount;
      ctx.events.emitAny('hazards:douse', ev);
    }
  }
}

/** La personne peut-elle agir (debout, libre de ses mouvements) ? */
export function ableBody(ctx: GameContext, p: Person): boolean {
  return !p.dormant && p.custody === 'free' && p.heldBy === 0 && !ctx.health.isIncapacitated(p);
}
