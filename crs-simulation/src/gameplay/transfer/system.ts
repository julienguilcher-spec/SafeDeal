/* =====================================================================================
 * TRANSFERT DES INTERPELLÉS AU COMMISSARIAT ET FOURGON DE RELÈVE (plan ordres-directs §5.5, §5.1, §5.7).
 * Système de simulation (SystemOrder.CONTROL + 8 : juste après les commissariats). Sans DOM, déterministe (aucun
 * tirage ; parcours dans l'ordre des unités).
 *
 *   départ          un fourgon cellulaire part quand il est plein (8 interpellés) ; ou avec au moins un interpellé, six
 *                   minutes après le premier et deux minutes sans nouveau ; ou sur l'ordre du joueur (Entrée « Partir
 *                   au commissariat », service depart()) ;
 *   jamais seul     un départ automatique attend qu'un autre fourgon ayant au moins deux places soit sur place (150 m
 *                   du point de remise), ou que son remplaçant soit à moins d'une minute — trois minutes au plus, puis
 *                   il part (« Fourgon cellulaire 1 complet — part dès que le 2 arrive (40 s) ») ; l'ordre du joueur
 *                   est obéi tout de suite (« Plus de fourgon sur place pendant 2 min ») ;
 *   commissariat    avec le module des commissariats : le commissariat le plus proche par la route (préfecture ou
 *                   commissariat, jamais la caserne de gendarmerie) ; le fourgon y roule sans deux-tons
 *                   (police.command.arrive, comme « Rentrer au commissariat »), les interpellés y sont remis à l'officier
 *                   de police judiciaire (CommissariatsSystem.arrive) et comptés là (law.records.markDelivered) ;
 *                   l'équipage repart vers le point de remise à la fin de son repos ;
 *   retenu          parti sans deux-tons, retenu 45 s au même endroit par un véhicule à l'arrêt : il met le deux-tons
 *                   (le trajet est redonné en urgence, une fois) et l'annonce à la radio (pushThrough) ;
 *   hors carte      sans le module (ou sans commissariat joignable) : le fourgon roule jusqu'à un point de la chaussée
 *                   à 600 m au moins de la foule, du côté opposé ; arrivé (ou au bout de 120 s), ses interpellés sont
 *                   remis (« déposés au commissariat ») et il revient au point de remise ;
 *   relève          quand les places libres sur place tombent à trois ou moins, ou qu'un fourgon doit partir sans
 *                   autre fourgon sur place : un fourgon du dispositif resté ailleurs vient au point de remise ; sinon le
 *                   fourgon cellulaire du commissariat le plus proche (CELLULAIRE 75-xx, engagé par CENTRAL, rattaché à
 *                   la compagnie) ; sinon (hors commissariats) un fourgon avec son équipage arrive par la route de la
 *                   compagnie, créé à 400 m au moins, hors de la vue du joueur ;
 *   patrouille      l'équipage du joueur tient un interpellé, sa voiture est à plus de 150 m et aucun fourgon à moins
 *                   de 300 m : un fourgon est demandé tout seul (« Fourgon cellulaire demandé — 2 min ; ou ramenez-le à
 *                   la voiture (150 m) ») et vient au plus près ; chargé, il part au commissariat ;
 *   voiture         une voiture (ou un fourgon) où se trouve le joueur, arrêtée devant un commissariat avec des
 *                   interpellés à bord : ils y sont remis et comptés (§5.7).
 *
 * Service ctx.service<TransferApi>('transfer') ; événements libres 'transfer:departed', 'transfer:delivered',
 * 'transfer:relief' (ctx.events.emitAny).
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Person, RoadSample, Squad, Unsubscribe, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { COMMISSARIATS_SERVICE, COMMISSARIAT_RETURNED_EVENT } from '@/gameplay/commissariats/api';
import type { CommissariatReturnedEvent, CommissariatView, CommissariatsApi } from '@/gameplay/commissariats/api';
import { atName, homeName } from '@/gameplay/commissariats/texts';
import { LAW_CUSTODY_SERVICE, LAW_RECORDS_SERVICE } from '@/gameplay/law/api';
import type { LawCustody, LawRecords } from '@/gameplay/law/api';
import { SESSION_SETUP_SERVICE } from '@/gameplay/session/api';
import type { SessionSetupApi } from '@/gameplay/session/api';
import { REMISE_SERVICE, vanFits } from '@/gameplay/session/remise';
import type { RemiseApi } from '@/gameplay/session/remise';
import type { PoliceUnitsApi } from '@/sim/police/api';
import type { CommandApi } from '@/sim/police/command/api';
import { commissariatById } from '@/world/commissariats';
import { CUSTODY_TEXTS } from '@/ui/command/direct/words';
import {
  DEPART_REFUS, OFF_MAP_AT, OFF_MAP_STATION, atStationText, backText, carDeliveredText, departText, droppedText,
  enRouteText, frame, heldText, patrolVanText, reliefText, returnText, waitAloneText, waitText,
} from './texts';

export const TRANSFER_SERVICE = 'transfer';
export const TRANSFER_SYSTEM_ID = 'gameplay.transfer';
export const TRANSFER_DEPARTED_EVENT = 'transfer:departed';
export const TRANSFER_DELIVERED_EVENT = 'transfer:delivered';
export const TRANSFER_RELIEF_EVENT = 'transfer:relief';

// ───────────────────────────── réglages ─────────────────────────────

/** Revue des fourgons (s). */
const TICK = 1;
/** Départ sans être plein : premier interpellé depuis … s et aucun nouveau depuis … s. */
const FIRST_MAX = 360;
const QUIET_MIN = 120;
/** Fourgon sur place : à moins de … m du point de remise. */
const SITE_R = 150;
/** Autre fourgon qui peut prendre la remise : au moins … places libres. */
const COVER_SEATS = 2;
/** Remplaçant attendu : départ s'il est à moins de … s ; attente maximale d'un départ automatique (s). */
const RELIEF_SOON = 60;
const WAIT_MAX = 180;
/** Places libres sur place à partir desquelles une relève est demandée d'avance. */
const RELIEF_LOW = 3;
/** Deux demandes de relève à … s au moins d'intervalle. */
const RELIEF_GAP = 20;
/** Fourgons créés hors commissariats, au plus, par session. */
const CREATED_MAX = 3;
/** Création d'un fourgon de relève : à … m au moins du point de remise et du joueur. */
const SPAWN_MIN = 400;
const SPAWN_UNSEEN = 300;
/** Point hors carte : à … m au moins de la foule. */
const OFF_MAP_MIN = 600;
/** Hors carte : interpellés remis à l'arrivée, ou au bout de … s de route. */
const OFF_MAP_DROP = 120;
/** Fourgon parti au commissariat depuis plus de … s sans y être arrivé : remise faite hors de la vue du joueur. */
const TRIP_MAX = 900;
/**
 * Aller : fourgon retenu par un véhicule à l'arrêt sans s'être éloigné de … m depuis … s : il met le deux-tons (voir
 * TransferSystem.pushThrough).
 */
const HELD_SPAN = 8;
const HELD_AFTER = 45;
/** Repos au commissariat quand le module ne le dit pas (s). */
const STATION_REST = 120;
/** Vitesse moyenne retenue en ville pour les estimations (m/s). */
const CITY_SPEED = 8;
/** Retour au point de remise : fourgon resté à plus de … m (et rien d'autre ne le conduit). */
const STRAY = 200;
/** Retour, relève : à moins de … m de sa place il s'y gare ; garé à moins de … m, il est arrivé. */
const PARK_FROM = 35;
const AT_GOAL = 15;
/** Progrès exigé en route : … m en … s ; nouvel itinéraire au plus … fois avant le rangement hors de la vue du joueur. */
const PROGRESS = 5;
const PROGRESS_TIME = 45;
const REPLANS = 4;
const UNSEEN = 250;
/** Retour bloqué près du point de remise (à moins de … m) : il se gare où il est. */
const NEAR_SITE = 100;
/**
 * Retour, relève : pilote automatique arrêté en chemin par un autre que lui (le conducteur laisse passer, recule pour
 * qu'un automobiliste dégage) : on ne le relance pas avant … s — la manœuvre se termine et reprend d'elle-même.
 */
const IDLE_GRACE = 12;
/**
 * Place à la file du point de remise : jamais devant le nez d'un véhicule garé (… m devant son pare-chocs, sur sa voie),
 * ni le nez contre un véhicule garé — chaque fourgon doit pouvoir repartir droit devant lui.
 */
const NOSE_CLEAR = 10;
/** Patrouille : voiture à plus de … m, aucun fourgon à moins de … m. */
const PATROL_CAR = 150;
const PATROL_VAN = 300;
/** Patrouille : départ … s après le dernier interpellé tenu ; fourgon resté vide … s : il rentre. */
const PATROL_GO = 20;
const PATROL_IDLE = 60;
/** Voiture devant un commissariat : à moins de … m de sa porte, arrêtée depuis … s. */
const CAR_AT = 45;
const CAR_STOP = 2;

/** Étapes d'une colonne en cours (sim/police/command/convoy.ts). */
const CONVOY_BUSY: ReadonlySet<string> = new Set(['route', 'stationnement', 'debarquement', 'rembarquement', 'depart']);

// ───────────────────────────── types publics ─────────────────────────────

/**
 * sur_place : au point de remise (ou ailleurs, disponible) ; attend : doit partir, attend son remplaçant ;
 * aller : en route vers le commissariat ; commissariat : au commissariat (remise, repos) ; retour : revient à la
 * remise ; releve : vient prendre la remise ; patrouille : demandé pour l'interpellé d'une patrouille.
 */
export type TransferStage = 'sur_place' | 'attend' | 'aller' | 'commissariat' | 'retour' | 'releve' | 'patrouille';

export interface TransferVanView {
  squadId: number;
  vehicleId: EntityId;
  /** Indicatif radio (« CELLULAIRE 1 »). */
  name: string;
  stage: TransferStage;
  /** Interpellés à bord, et places pour eux (interpellés + places libres). */
  detainees: number;
  seats: number;
  /** Ligne d'état en clair ('' : rien à dire). */
  line: string;
  /** Secondes avant l'arrivée (aller, retour, relève, patrouille ; 0 sinon). */
  eta: number;
  /** Commissariat visé ou dernier atteint (« commissariat du 3e »), '' sinon. */
  station: string;
}

export interface TransferDepartResult {
  ok: boolean;
  /** Pourquoi c'est impossible (mots simples), '' si le fourgon part. */
  reason: string;
  /** Ligne dite à la radio et affichée (« CELLULAIRE 1 part au commissariat du 3e avec 5 interpellés. … »). */
  text: string;
}

export interface TransferDelivery {
  /** « commissariat du 3e », « préfecture de police », « commissariat » (hors carte). */
  station: string;
  count: number;
}

export interface TransferPatrolRequest {
  vanSquadId: number;
  /** « Fourgon cellulaire demandé — 2 min ; ou ramenez-le à la voiture (150 m) ». */
  text: string;
  eta: number;
}

export interface TransferApi {
  /** « Partir au commissariat » (ordre du joueur) : obéi tout de suite. */
  depart(vanSquadId: number): TransferDepartResult;
  /** État d'un fourgon cellulaire suivi (null : inconnu). */
  view(vanSquadId: number): TransferVanView | null;
  /** Fourgons cellulaires suivis, dans l'ordre où ils ont été vus. */
  readonly vans: readonly TransferVanView[];
  /** Interpellés remis, par commissariat, dans l'ordre des premières remises. */
  readonly delivered: readonly TransferDelivery[];
  /** Fourgon demandé pour l'interpellé de la patrouille du joueur (null : aucun). */
  readonly patrolRequest: TransferPatrolRequest | null;
  /** Ce véhicule part-il au commissariat (en route, interpellés à bord) ? */
  leaving(vehicleId: EntityId): boolean;
}

export interface TransferDepartedEvent { squadId: number; station: string; detainees: number; byPlayer: boolean; t: number }
export interface TransferDeliveredEvent { squadId: number; station: string; detainees: number; t: number }
export interface TransferReliefEvent { squadId: number; source: 'dispositif' | 'commissariat' | 'renfort'; t: number }

// ───────────────────────────── formes attendues des autres services ─────────────────────────────

type Zone = { x: number; z: number; r: number; cost?: number };

interface AutopilotLike {
  driveTo(v: Vehicle, x: number, z: number, options?: { urgence?: boolean; avoid?: readonly Zone[] }): boolean;
  reroute?(v: Vehicle, pushThrough?: boolean, avoid?: readonly Zone[]): boolean;
  park(v: Vehicle, x: number, z: number, heading: number): boolean;
  stop(v: Vehicle): void;
  status(v: Vehicle): Readonly<{ mode: string; state: string; reason: string; remaining: number }>;
  isActive(v: Vehicle): boolean;
}
interface ArrestsLike { busy?(vehicleId: EntityId): boolean }
interface FollowLike { inColumn?(squadId: number): boolean; release?(squadId: number): void }

// ───────────────────────────── état interne ─────────────────────────────

type Stage = 'site' | 'aller' | 'station' | 'retour' | 'releve' | 'patrouille';

interface Trip {
  /** Site des commissariats ('' : hors carte). */
  stationId: string;
  /** « commissariat du 3e » et « au commissariat du 3e ». */
  station: string;
  at: string;
  x: number;
  z: number;
  heading: number;
  /** Longueur de l'itinéraire à l'aller (m). */
  route: number;
}

interface Goal { x: number; z: number; heading: number }

interface Van {
  squadId: number;
  vehicleId: EntityId;
  name: string;
  stage: Stage;
  /** Charge : premier interpellé (s ; −1 : vide), dernier nouveau, nombre vu à la dernière revue. */
  firstAt: number;
  lastNewAt: number;
  count: number;
  /** Départ voulu depuis (attente du remplaçant ; −1 : aucun). */
  wantSince: number;
  /** Prochaine tentative de départ après un échec d'itinéraire (s). */
  retryAt: number;
  trip: Trip | null;
  ids: EntityId[];
  leftAt: number;
  dropped: boolean;
  /** Itinéraires refaits pour contourner la ligne et la foule (aller), dernier instant. */
  detours: number;
  detourAt: number;
  /** Aller : endroit où il piétine et depuis quand (s) ; trajet déjà redonné en urgence (voir pushThrough). */
  heldX: number;
  heldZ: number;
  heldSince: number;
  pushed: boolean;
  /** Au commissariat : repart à … (s). */
  restUntil: number;
  /** Retour, relève, patrouille : place visée, point de remise d'où elle est tirée, manœuvre finale en cours. */
  goal: Goal | null;
  goalFromX: number;
  goalFromZ: number;
  parking: boolean;
  urgent: boolean;
  best: number;
  bestAt: number;
  replans: number;
  /** Créé hors commissariats (relève, patrouille). */
  created: boolean;
  /** Patrouille : dernier instant où l'équipage tenait un interpellé. */
  heldAt: number;
  /** Retour, relève : pilote automatique arrêté par un autre (laisser passer, marche arrière) depuis (s ; −1 : non). */
  idleAt: number;
  line: string;
  view: TransferVanView;
}

const STAGE_VIEW: Readonly<Record<Stage, TransferStage>> = {
  site: 'sur_place', aller: 'aller', station: 'commissariat', retour: 'retour', releve: 'releve', patrouille: 'patrouille',
};

export class TransferSystem implements GameSystem {
  readonly id = TRANSFER_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 8;

  private ctx: GameContext | null = null;
  private readonly offs: Unsubscribe[] = [];
  private readonly byId = new Map<number, Van>();
  private readonly list: Van[] = [];
  private readonly views: TransferVanView[] = [];
  private readonly deliveries: TransferDelivery[] = [];
  private request: TransferPatrolRequest | null = null;
  private tickAt = 0;
  private reliefAt = 0;
  private created = 0;
  /** Voiture du joueur arrêtée devant un commissariat : depuis (s). */
  private carStopAt = -1;
  private carStopId: EntityId = 0;
  private readonly ids: EntityId[] = [];
  private readonly path: number[] = [];
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const self = this;
    const api: TransferApi = {
      depart: (id) => self.depart(id),
      view: (id) => self.byId.get(id)?.view ?? null,
      get vans(): readonly TransferVanView[] {
        return self.views;
      },
      get delivered(): readonly TransferDelivery[] {
        return self.deliveries;
      },
      get patrolRequest(): TransferPatrolRequest | null {
        return self.request;
      },
      leaving: (vehicleId) => {
        for (const v of self.list) if (v.vehicleId === vehicleId && v.stage === 'aller' && !v.dropped) return true;
        return false;
      },
    };
    ctx.provide<TransferApi>(TRANSFER_SERVICE, api);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.offs.push(ctx.events.on('session:started', () => this.reset()));
    this.offs.push(ctx.events.on('session:ended', () => this.reset()));
    this.offs.push(ctx.events.onAny(COMMISSARIAT_RETURNED_EVENT, (e) => this.onReturned(e as CommissariatReturnedEvent)));
  }

  reset(): void {
    this.byId.clear();
    this.list.length = 0;
    this.views.length = 0;
    this.deliveries.length = 0;
    this.request = null;
    this.tickAt = 0;
    this.reliefAt = 0;
    this.created = 0;
    this.carStopAt = -1;
    this.carStopId = 0;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.session.config) return;
    const now = ctx.clock.now;
    if (now < this.tickAt) return;
    this.tickAt = now + TICK;
    this.scan();
    const site = this.site();
    for (let i = 0; i < this.list.length; i++) this.think(this.list[i]!, site, now);
    if (site) this.cover(site, now);
    if (ctx.session.config?.role === 'patrouille') this.patrol(now);
    this.carDelivery(now);
    for (const v of this.list) this.refreshView(v, now);
  }

  // ───────────────────────────── services ─────────────────────────────

  private stations(): CommissariatsApi | null {
    const api = this.ctx!.service<CommissariatsApi>(COMMISSARIATS_SERVICE);
    return api && api.enabled ? api : null;
  }

  private command(): CommandApi | undefined {
    return this.ctx!.service<CommandApi>('police.command');
  }

  private autopilot(): AutopilotLike | undefined {
    return this.ctx!.service<AutopilotLike>('vehicles.autopilot');
  }

  private records(): LawRecords | undefined {
    return this.ctx!.service<LawRecords>(LAW_RECORDS_SERVICE);
  }

  /** Point de remise de la compagnie du joueur (null : pas encore fixé, ou aucune compagnie). */
  private site(): { x: number; z: number; heading: number } | null {
    const remise = this.ctx!.service<RemiseApi>(REMISE_SERVICE);
    return remise && typeof remise.point === 'function' ? remise.point() : null;
  }

  /** Compagnie à laquelle rattacher un fourgon de relève : celle des fourgons de la mise en place, sinon l'unité de tête. */
  private company(): number {
    const ctx = this.ctx!;
    const remise = ctx.service<RemiseApi>(REMISE_SERVICE);
    const vans = remise && typeof remise.vans === 'function' ? remise.vans() : [];
    for (const id of vans) {
      const s = ctx.squads.get(id);
      if (s && s.parentId !== 0 && ctx.squads.get(s.parentId)) return s.parentId;
    }
    const setup = ctx.service<SessionSetupApi>(SESSION_SETUP_SERVICE);
    const root = setup && setup.summary ? setup.summary.rootSquadId : 0;
    return root !== 0 && ctx.squads.get(root) ? root : 0;
  }

  // ───────────────────────────── fourgons suivis ─────────────────────────────

  /** Fourgons cellulaires de police avec un équipage (engagés : pas ceux qui dorment en réserve d'un commissariat). */
  private scan(): void {
    const ctx = this.ctx!;
    const stations = this.stations();
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.vehicleId === 0 || this.byId.has(s.id)) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || v.kind !== 'fourgon_cellulaire' || v.state === 'wrecked' || v.state === 'burnt') continue;
      if (stations && stations.atPost(s.id)) continue;
      this.track(s, v, 'site');
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const van = this.list[i]!;
      const s = ctx.squads.get(van.squadId);
      const v = ctx.vehicles.get(van.vehicleId);
      if (s && v && s.vehicleId === v.id && v.state !== 'wrecked' && v.state !== 'burnt') continue;
      this.list.splice(i, 1);
      this.byId.delete(van.squadId);
      const j = this.views.indexOf(van.view);
      if (j >= 0) this.views.splice(j, 1);
      if (this.request && this.request.vanSquadId === van.squadId) this.request = null;
    }
  }

  private track(s: Squad, v: Vehicle, stage: Stage): Van {
    const van: Van = {
      squadId: s.id, vehicleId: v.id, name: s.name, stage, firstAt: -1, lastNewAt: -1, count: 0, wantSince: -1, retryAt: 0,
      trip: null, ids: [], leftAt: 0, dropped: false, detours: 0, detourAt: 0, heldX: 0, heldZ: 0, heldSince: 0, pushed: false, restUntil: 0, goal: null, goalFromX: 0, goalFromZ: 0, parking: false,
      urgent: false, best: Infinity, bestAt: 0, replans: 0, created: false, heldAt: -1, idleAt: -1, line: '',
      view: { squadId: s.id, vehicleId: v.id, name: s.name, stage: STAGE_VIEW[stage], detainees: 0, seats: 0, line: '', eta: 0, station: '' },
    };
    this.byId.set(s.id, van);
    this.list.push(van);
    this.views.push(van.view);
    return van;
  }

  private vehicle(van: Van): Vehicle | undefined {
    return this.ctx!.vehicles.get(van.vehicleId);
  }

  /** Interpellés assis à bord (procédure close, custody 'in_vehicle') ; `out` reçoit leurs identifiants. */
  private aboard(v: Vehicle, out: EntityId[] | null): number {
    const ctx = this.ctx!;
    if (out) out.length = 0;
    let n = 0;
    for (let s = 0; s < v.seats.length; s++) {
      const id = v.seats[s]!;
      const p = id !== 0 ? ctx.people.get(id) : undefined;
      if (!p || p.isPlayer || p.custody !== 'in_vehicle') continue;
      n++;
      if (out) out.push(p.id);
    }
    return n;
  }

  /** Places de passager libres. */
  private freeSeats(v: Vehicle): number {
    let n = 0;
    for (let s = 0; s < v.seats.length; s++) if (v.seats[s] === 0 && v.def.seats[s] && v.def.seats[s]!.role === 'passenger') n++;
    return n;
  }

  private playerAboard(v: Vehicle): boolean {
    const pid = this.ctx!.player.state.personId;
    return pid !== 0 && v.seats.indexOf(pid) >= 0;
  }

  /** Conducteur de police (pas le joueur) au volant. */
  private crewed(v: Vehicle): boolean {
    const id = v.seats[0] ?? 0;
    const p = id !== 0 ? this.ctx!.people.get(id) : undefined;
    return !!p && !p.isPlayer && p.faction === 'police';
  }

  /** Le fourgon est pris par autre chose : colonne en cours, colonne derrière le joueur, pilote automatique, interpellation. */
  private engaged(van: Van, v: Vehicle): boolean {
    const ctx = this.ctx!;
    const cmd = this.command();
    const c = cmd ? cmd.convoyOf(van.squadId) : null;
    if (c && CONVOY_BUSY.has(c.stage)) return true;
    const follow = ctx.service<FollowLike>('session.follow');
    if (follow && typeof follow.inColumn === 'function' && follow.inColumn(van.squadId)) return true;
    const ap = this.autopilot();
    if (ap && ap.isActive(v)) return true;
    return this.busy(v);
  }

  /** Un binôme y conduit un interpellé, ou il est appelé pour une interpellation (police.arrests). */
  private busy(v: Vehicle): boolean {
    const arrests = this.ctx!.service<ArrestsLike>('police.arrests');
    return !!arrests && typeof arrests.busy === 'function' && arrests.busy(v.id);
  }

  private onSite(van: Van, v: Vehicle, site: { x: number; z: number }): boolean {
    return van.stage === 'site' && van.wantSince < 0 && this.crewed(v) && Math.hypot(v.x - site.x, v.z - site.z) <= SITE_R;
  }

  // ───────────────────────────── revue d'un fourgon ─────────────────────────────

  private think(van: Van, site: { x: number; z: number; heading: number } | null, now: number): void {
    const v = this.vehicle(van);
    if (!v) return;
    switch (van.stage) {
      case 'site': this.thinkSite(van, v, site, now); break;
      case 'aller': this.thinkTrip(van, v, now); break;
      case 'station': this.thinkStation(van, v, site, now); break;
      case 'retour':
      case 'releve': this.thinkDrive(van, v, site, now); break;
      case 'patrouille': this.thinkPatrolVan(van, v, now); break;
      default: break;
    }
  }

  /** Au point de remise : charge, départ automatique, retour d'un fourgon resté loin. */
  private thinkSite(van: Van, v: Vehicle, site: { x: number; z: number; heading: number } | null, now: number): void {
    const n = this.aboard(v, null);
    if (n > van.count) van.lastNewAt = now;
    if (n > 0 && van.firstAt < 0) van.firstAt = now;
    if (n === 0) van.firstAt = -1;
    van.count = n;
    if (n === 0 || this.playerAboard(v)) {
      van.wantSince = -1;
      van.line = '';
      if (n === 0 && site) this.stray(van, v, site);
      return;
    }
    const free = this.freeSeats(v);
    const full = free === 0;
    const timed = now - van.firstAt >= FIRST_MAX && now - van.lastNewAt >= QUIET_MIN;
    if (!full && !timed) {
      van.wantSince = -1;
      van.line = '';
      if (site) this.stray(van, v, site);
      return;
    }
    // (un binôme qui y conduit encore un interpellé : il attend qu'il soit à bord ; pris par un autre mouvement : après)
    if (now < van.retryAt) return;
    const busy = this.busy(v);
    if (busy && !full) return;
    if (!busy && this.engaged(van, v)) return;
    if (site) {
      if (van.wantSince < 0) van.wantSince = now;
      if (!this.coverFor(van, site)) {
        let inbound = this.inbound(site, now);
        if (!inbound) {
          this.relieve(site, now, true);
          inbound = this.inbound(site, now);
        }
        const wait = now - van.wantSince;
        if (!(inbound && inbound.eta < RELIEF_SOON) && wait < WAIT_MAX) {
          van.line = inbound ? waitText(van.name, n, n + free, inbound.van.name, inbound.eta) : waitAloneText(van.name, n, n + free, WAIT_MAX - wait);
          return;
        }
      }
    }
    const r = this.depart(van.squadId, false);
    if (!r.ok) van.retryAt = now + 30;
  }

  /**
   * Fourgon vide (ou qui se remplit) resté à plus de STRAY m du point de remise, que rien d'autre ne conduit (ni ordre du
   * joueur, ni colonne, ni interpellation) : il y revient, sans deux-tons.
   */
  private stray(van: Van, v: Vehicle, site: { x: number; z: number; heading: number }): void {
    const s = this.ctx!.squads.get(van.squadId);
    if (!s || s.order.byPlayer === true || !this.crewed(v) || this.playerAboard(v) || this.engaged(van, v)) return;
    // (rappelé par le module des commissariats, qui le ramène lui-même à ses places)
    const entry = this.stations()?.entryOf(van.squadId);
    if (entry && entry.state === 'retour') return;
    if (Math.hypot(v.x - site.x, v.z - site.z) <= STRAY) return;
    this.sendBack(van, v, site, false, 'retour');
  }

  /** Un autre fourgon sur place, en état, qui a au moins COVER_SEATS places libres. */
  private coverFor(van: Van | null, site: { x: number; z: number }): Van | null {
    for (const o of this.list) {
      if (o === van) continue;
      const v = this.vehicle(o);
      if (v && this.onSite(o, v, site) && this.freeSeats(v) >= COVER_SEATS && !this.playerAboard(v)) return o;
    }
    return null;
  }

  /** Fourgon qui vient (relève, retour, ou au commissariat sur le point de repartir) : le plus tôt arrivé. */
  private inbound(site: { x: number; z: number }, now: number): { van: Van; eta: number } | null {
    let best: { van: Van; eta: number } | null = null;
    for (const o of this.list) {
      const v = this.vehicle(o);
      if (!v) continue;
      let eta = Infinity;
      if (o.stage === 'releve' || o.stage === 'retour') eta = this.driveEta(o, v);
      else if (o.stage === 'station' && o.trip) eta = Math.max(0, o.restUntil - now) + o.trip.route / CITY_SPEED + 10;
      if (eta === Infinity || this.freeSeats(v) < COVER_SEATS) continue;
      if (!best || eta < best.eta) best = { van: o, eta };
    }
    void site;
    return best;
  }

  private driveEta(van: Van, v: Vehicle): number {
    const ap = this.autopilot();
    const g = van.goal;
    // (itinéraire du pilote automatique ; tout juste demandé, il n'est pas encore mesuré : la distance, allongée)
    const route = ap && ap.isActive(v) && !van.parking ? ap.status(v).remaining : 0;
    const left = route > 0 ? route : g ? Math.hypot(v.x - g.x, v.z - g.z) * 1.3 : 0;
    return left / CITY_SPEED + (van.parking ? 0 : 10);
  }

  // ───────────────────────────── relève ─────────────────────────────

  /** Places libres sur place trop peu nombreuses, sans fourgon qui vient : une relève est demandée d'avance. */
  private cover(site: { x: number; z: number; heading: number }, now: number): void {
    let free = 0;
    let any = false;
    for (const o of this.list) {
      const v = this.vehicle(o);
      if (!v || !this.onSite(o, v, site)) continue;
      any = true;
      free += this.freeSeats(v);
    }
    // (aucun fourgon suivi du tout : rien à relever — mission sans fourgon cellulaire)
    if (this.list.length === 0 || (any && free > RELIEF_LOW)) return;
    if (this.inbound(site, now)) return;
    this.relieve(site, now, false);
  }

  /**
   * Fait venir un fourgon au point de remise : un fourgon du dispositif resté ailleurs, sinon le cellulaire du
   * commissariat le plus proche par la route, sinon (hors commissariats) un fourgon de renfort créé sur la route de la
   * compagnie. `urgent` : un fourgon attend pour partir (deux-tons).
   */
  private relieve(site: { x: number; z: number; heading: number }, now: number, urgent: boolean): boolean {
    if (now < this.reliefAt) return false;
    this.reliefAt = now + RELIEF_GAP;
    const ctx = this.ctx!;
    // 1. un fourgon du dispositif disponible, loin de la remise
    let pick: Van | null = null;
    let pd = Infinity;
    for (const o of this.list) {
      const v = this.vehicle(o);
      if (!v || o.stage !== 'site' || o.wantSince >= 0 || !this.crewed(v) || this.playerAboard(v) || this.engaged(o, v)) continue;
      const s = ctx.squads.get(o.squadId);
      if (!s || s.order.byPlayer === true || this.freeSeats(v) < COVER_SEATS) continue;
      const d = Math.hypot(v.x - site.x, v.z - site.z);
      if (d <= SITE_R || d >= pd) continue;
      pd = d;
      pick = o;
    }
    if (pick) {
      const v = this.vehicle(pick)!;
      this.sendBack(pick, v, site, urgent, 'releve');
      this.announceRelief(pick, v, 'dispositif');
      return true;
    }
    // 2. le cellulaire du commissariat le plus proche par la route
    const stations = this.stations();
    if (stations) {
      const entry = this.nearestStationVan(stations, site);
      if (entry) {
        const r = stations.engage(entry, 0, true);
        const s = r.ok ? ctx.squads.get(r.squadId) : undefined;
        const v = s && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
        if (s && v) {
          const company = this.company();
          if (company !== 0 && company !== s.id) s.parentId = company;
          const van = this.byId.get(s.id) ?? this.track(s, v, 'site');
          this.sendBack(van, v, site, true, 'releve');
          this.announceRelief(van, v, 'commissariat');
          return true;
        }
      }
    }
    // 3. hors commissariats : un fourgon de renfort, créé sur la route de la compagnie, hors de la vue du joueur
    if (stations || this.created >= CREATED_MAX) return false;
    const van = this.spawnVan(site.x, site.z, site, true);
    if (!van) return false;
    const v = this.vehicle(van)!;
    this.sendBack(van, v, site, true, 'releve');
    this.announceRelief(van, v, 'renfort');
    return true;
  }

  private announceRelief(van: Van, v: Vehicle, source: TransferReliefEvent['source']): void {
    const ctx = this.ctx!;
    const s = ctx.squads.get(van.squadId);
    ctx.radio.say({
      channel: 'commandement', from: van.name, priority: 1, personId: s ? s.leaderId : undefined,
      text: frame('CENTRAL', van.name, reliefText(van.name, this.driveEta(van, v))),
    });
    const ev: TransferReliefEvent = { squadId: van.squadId, source, t: ctx.clock.now };
    ctx.events.emitAny(TRANSFER_RELIEF_EVENT, ev);
  }

  /** Cellulaire au poste du commissariat le plus proche de (x, z) par la route (identifiant de l'entrée du stock). */
  private nearestStationVan(stations: CommissariatsApi, at: { x: number; z: number }): string | null {
    let best: string | null = null;
    let bd = Infinity;
    for (const site of stations.list) {
      for (const e of site.entries) {
        if (e.kind !== 'cellulaire' || e.state !== 'au_poste' || !e.engageable || e.vehicles <= 0) continue;
        const d = this.routeLen(site.returnX, site.returnZ, site.returnHeading, at.x, at.z, 2.6);
        if (d < bd) {
          bd = d;
          best = e.id;
        }
        break;
      }
    }
    return best;
  }

  /**
   * Fourgon cellulaire avec son équipage créé sur une chaussée à SPAWN_MIN m au moins de (x, z), du côté opposé à la
   * foule (la route par où la compagnie est venue), à SPAWN_UNSEEN m au moins du joueur, avec un itinéraire jusqu'à
   * (x, z). null si rien ne convient.
   */
  private spawnVan(x: number, z: number, site: { x: number; z: number; heading: number }, toCompany: boolean): Van | null {
    const ctx = this.ctx!;
    const units = ctx.service<PoliceUnitsApi>('police.units');
    if (!units || typeof units.createEquipage !== 'function') return null;
    const away = this.awayFromCrowd(x, z, site.heading + Math.PI);
    const me = ctx.player.person();
    const def = ctx.vehicles.def('fourgon_cellulaire');
    const len = def ? def.length : 6;
    const wid = def ? def.width : 2.05;
    const road = this.road;
    for (const d of [SPAWN_MIN + 50, SPAWN_MIN + 200, SPAWN_MIN + 400]) {
      for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
        const a = away + off;
        const cx = x + Math.sin(a) * d, cz = z + Math.cos(a) * d;
        if (!ctx.world.nearestRoad(cx, cz, road, 60) || road.width < 5) continue;
        if (Math.hypot(road.x - x, road.z - z) < SPAWN_MIN) continue;
        if (me && Math.hypot(me.x - road.x, me.z - road.z) < SPAWN_UNSEEN) continue;
        // nez vers le point (sens de la voie le plus proche de la direction du point)
        const toward = Math.atan2(x - road.x, z - road.z);
        const h = Math.cos(road.heading - toward) >= 0 ? road.heading : road.heading + Math.PI;
        if (!vanFits(ctx, road.x, road.z, h, len, wid, null, true)) continue;
        if (this.routeLen(road.x, road.z, h, x, z, wid + 1.2) === Infinity) continue;
        let h0: ReturnType<PoliceUnitsApi['createEquipage']> | null = null;
        try {
          h0 = units.createEquipage('fourgon_cellulaire', {
            x: road.x, z: road.z, heading: h, callsign: this.freeCallsign(), parentId: toCompany ? this.company() || undefined : undefined,
            seed: (((ctx.session.config?.seed ?? 1) * 6271 + (this.created + 11) * 104729 + 17) | 0) >>> 1,
          });
        } catch (err) {
          console.error('[transfert] fourgon de renfort impossible', err);
          return null;
        }
        const v = h0 && h0.vehicles[0];
        if (!h0 || !v) return null;
        this.created++;
        ctx.people.rebuildIndex();
        const van = this.track(h0.squad, v, 'site');
        van.created = true;
        return van;
      }
    }
    return null;
  }

  /** « CELLULAIRE n » libre (le plus petit numéro qui n'est pas pris). */
  private freeCallsign(): string {
    const used = new Set<string>();
    for (const s of this.ctx!.squads.list) used.add(s.name);
    for (let n = 1; n < 100; n++) if (!used.has(`CELLULAIRE ${n}`)) return `CELLULAIRE ${n}`;
    return 'CELLULAIRE';
  }

  /** Cap « dos à la foule » depuis (x, z) : à l'opposé du barycentre des manifestants à moins de 400 m (`fallback` sinon). */
  private awayFromCrowd(x: number, z: number, fallback: number): number {
    let sx = 0, sz = 0, n = 0;
    for (const p of this.ctx!.people.list) {
      if (p.faction !== 'protest' || p.dormant || p.custody !== 'free') continue;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz > 400 * 400) continue;
      sx += p.x;
      sz += p.z;
      n++;
    }
    if (n < 8) return fallback;
    const dx = x - sx / n, dz = z - sz / n;
    return Math.hypot(dx, dz) > 1 ? Math.atan2(dx, dz) : fallback;
  }

  // ───────────────────────────── départ ─────────────────────────────

  private depart(squadId: number, byPlayerArg = true): TransferDepartResult {
    const ctx = this.ctx;
    const fail = (reason: string): TransferDepartResult => ({ ok: false, reason, text: '' });
    if (!ctx || !ctx.session.config) return fail(DEPART_REFUS.inconnu);
    const s = ctx.squads.get(squadId);
    const v = s && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (!s || !v || v.kind !== 'fourgon_cellulaire') return fail(DEPART_REFUS.inconnu);
    const van = this.byId.get(squadId) ?? this.track(s, v, 'site');
    if (van.stage === 'aller') return fail(DEPART_REFUS.enRoute);
    if (this.playerAboard(v)) return fail(DEPART_REFUS.joueur);
    if (!this.crewed(v)) return fail(DEPART_REFUS.conducteur);
    const n = this.aboard(v, this.ids);
    if (n === 0) return fail(DEPART_REFUS.vide);
    const cmd = this.command();
    if (!cmd) return fail(DEPART_REFUS.itineraire);
    const site = this.site();
    const trip = this.tripFor(van, v, site);
    if (!trip) return fail(DEPART_REFUS.itineraire);
    // (un ordre du joueur l'avait pris dans sa colonne : il la quitte)
    const follow = ctx.service<FollowLike>('session.follow');
    if (follow && typeof follow.release === 'function' && typeof follow.inColumn === 'function' && follow.inColumn(squadId)) follow.release(squadId);
    // équipage descendu (chef de bord à pied) : il remonte d'abord
    let crewOut = false;
    for (const id of s.members) {
      const p = ctx.people.get(id);
      if (p && p.vehicleId === 0 && p.custody === 'free' && !ctx.health.isIncapacitated(p)) crewOut = true;
    }
    const ap = this.autopilot();
    if (ap && ap.isActive(v)) ap.stop(v);
    let target = { x: trip.x, z: trip.z, heading: trip.heading };
    if (trip.stationId !== '') {
      const stations = this.stations();
      const t = stations ? stations.recall(squadId, trip.stationId) : null;
      if (!t) return fail(DEPART_REFUS.itineraire);
      target = { x: t.x, z: t.z, heading: t.heading };
      const def = commissariatById(t.commissariatId);
      if (def) {
        trip.stationId = def.id;
        trip.station = homeName(def);
        trip.at = atName(def);
      }
    }
    if (!cmd.arrive(squadId, { x: target.x, z: target.z, heading: target.heading, layout: 'file', boardFirst: crewOut, disembark: false, urgence: false })) {
      return fail(DEPART_REFUS.itineraire);
    }
    const now = ctx.clock.now;
    const byPlayer = byPlayerArg;
    van.stage = 'aller';
    van.trip = trip;
    van.ids = this.ids.slice();
    van.leftAt = now;
    van.dropped = false;
    van.detours = 0;
    van.detourAt = 0;
    van.heldX = v.x;
    van.heldZ = v.z;
    van.heldSince = now;
    van.pushed = false;
    van.wantSince = -1;
    van.goal = null;
    van.parking = false;
    // qui prend la remise
    let next = '';
    let eta = 0;
    let gap = 0;
    if (site) {
      const other = this.coverFor(van, site);
      if (other) next = other.name;
      else {
        let inbound = this.inbound(site, now);
        if (!inbound) {
          this.reliefAt = 0;
          this.relieve(site, now, true);
          inbound = this.inbound(site, now);
        }
        if (inbound) {
          next = inbound.van.name;
          eta = inbound.eta;
        } else {
          gap = (trip.route * 2) / CITY_SPEED + STATION_REST;
        }
      }
    }
    const text = site ? departText(van.name, trip.at, n, next, eta, gap) : `${van.name} part ${trip.at} avec ${n === 1 ? 'un interpellé' : `${n} interpellés`}.`;
    van.line = text;
    ctx.radio.say({ channel: 'commandement', from: van.name, priority: 1, personId: s.leaderId, text });
    if (byPlayer && site && next === '') ctx.ui.notify(CUSTODY_TEXTS.noVanFor(gap), 'warn', 5);
    const ev: TransferDepartedEvent = { squadId, station: trip.station, detainees: n, byPlayer, t: now };
    ctx.events.emitAny(TRANSFER_DEPARTED_EVENT, ev);
    if (this.request && this.request.vanSquadId === squadId) this.request = null;
    return { ok: true, reason: '', text };
  }

  /**
   * Destination du transfert : le commissariat le plus proche par la route (préfecture, commissariats ; un fourgon du
   * stock rentre au sien), sinon un point de la chaussée hors du secteur, à OFF_MAP_MIN m au moins de la foule.
   */
  private tripFor(van: Van, v: Vehicle, site: { x: number; z: number; heading: number } | null): Trip | null {
    const stations = this.stations();
    if (stations) {
      const own = stations.entryOf(van.squadId);
      let best: CommissariatView | null = null;
      let bd = Infinity;
      for (const c of stations.list) {
        if (c.kind === 'caserne_gendarmerie') continue;
        if (own && own.kind !== 'adopte' && c.id !== own.commissariatId) continue;
        const d = this.routeLen(v.x, v.z, v.heading, c.returnX, c.returnZ, v.def.width + 1.2);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) {
        const def = commissariatById(best.id);
        const station = def ? homeName(def) : best.name;
        const at = def ? atName(def) : 'au ' + best.name;
        return { stationId: best.id, station, at, x: best.returnX, z: best.returnZ, heading: best.returnHeading, route: bd };
      }
    }
    // hors carte : dos à la foule, à 600 m au moins
    const from = site ?? { x: v.x, z: v.z, heading: v.heading };
    const away = this.awayFromCrowd(from.x, from.z, from.heading + Math.PI);
    const road = this.road;
    const crowd = this.crowdCentre(from.x, from.z);
    for (const d of [OFF_MAP_MIN + 100, OFF_MAP_MIN + 300, OFF_MAP_MIN + 600, OFF_MAP_MIN]) {
      for (const off of [0, 0.4, -0.4, 0.9, -0.9, 1.5, -1.5, Math.PI]) {
        const a = away + off;
        const cx = from.x + Math.sin(a) * d, cz = from.z + Math.cos(a) * d;
        if (!this.ctx!.world.nearestRoad(cx, cz, road, 60) || road.width < 5) continue;
        if (crowd && Math.hypot(road.x - crowd.x, road.z - crowd.z) < OFF_MAP_MIN) continue;
        const len = this.routeLen(v.x, v.z, v.heading, road.x, road.z, v.def.width + 1.2);
        if (len === Infinity) continue;
        return { stationId: '', station: OFF_MAP_STATION, at: OFF_MAP_AT, x: road.x, z: road.z, heading: road.heading, route: len };
      }
    }
    return null;
  }

  private crowdCentre(x: number, z: number): { x: number; z: number } | null {
    let sx = 0, sz = 0, n = 0;
    for (const p of this.ctx!.people.list) {
      if (p.faction !== 'protest' || p.dormant || p.custody !== 'free') continue;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz > 600 * 600) continue;
      sx += p.x;
      sz += p.z;
      n++;
    }
    return n >= 8 ? { x: sx / n, z: sz / n } : null;
  }

  /** Longueur de l'itinéraire routier de (x0, z0) à (x1, z1), départ dans le cap `heading` (m ; ∞ sans chemin). */
  private routeLen(x0: number, z0: number, heading: number, x1: number, z1: number, minWidth: number): number {
    const path = this.path;
    path.length = 0;
    if (!this.ctx!.world.findPath(x0, z0, x1, z1, 'vehicle', path, { heading, uturn: 30, contraflow: 3, minWidth }) || path.length < 4) {
      path.length = 0;
      return Infinity;
    }
    let len = 0;
    for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
    path.length = 0;
    return len;
  }

  // ───────────────────────────── trajet, commissariat ─────────────────────────────

  /**
   * Aller : l'itinéraire de la colonne passe par le plus court, souvent droit devant le fourgon garé — à travers la ligne
   * de la compagnie et la foule, qui ne s'écartent pas pour lui. Dès qu'il roule, puis chaque fois qu'il attend
   * devant des piétons, il refait son itinéraire en contournant les groupes d'agents à pied arrêtés et la foule (demi-tour,
   * autre rue) — trois fois au plus.
   */
  private detour(van: Van, v: Vehicle, now: number): void {
    const ap = this.autopilot();
    if (!ap || typeof ap.reroute !== 'function' || van.detours >= 3 || !ap.isActive(v)) return;
    const st = ap.status(v);
    if (st.mode !== 'drive') return;
    const first = van.detours === 0;
    const waiting = st.state === 'attente' && st.reason === 'personne';
    if (!first && !(waiting && now - van.detourAt >= 15)) return;
    if (first && now - van.leftAt < 1) return;
    van.detours++;
    van.detourAt = now;
    ap.reroute(v, false, this.standingZones(v));
  }

  /**
   * Aller : le fourgon part sans deux-tons et attend dans la circulation comme tout le monde. Mais des automobilistes
   * arrêtés pour de bon autour du point de remise (ils laissaient passer des piétons, puis se sont rangés en travers
   * de la voie) le retenaient un quart d'heure, plein, à vingt mètres de sa place, sous les yeux du joueur : aucun
   * interpellé n'arrivait au commissariat, et le fourgon suivant restait derrière lui. Retenu par un véhicule à l'arrêt
   * sans s'être éloigné de HELD_SPAN m depuis HELD_AFTER s, il met le deux-tons : le même trajet est redonné en urgence
   * (départ échelonné d'une colonne d'un seul véhicule, comme le retour redonné par le commissariat), et la voiture qui
   * le retient se range devant lui (règle des colonnes en urgence, police/command/convoy.ts). Une fois par trajet ; il
   * l'annonce à la radio.
   */
  private pushThrough(van: Van, v: Vehicle, trip: Trip, now: number): void {
    if (van.pushed || van.dropped) return;
    if (Math.hypot(v.x - van.heldX, v.z - van.heldZ) > HELD_SPAN) {
      van.heldX = v.x;
      van.heldZ = v.z;
      van.heldSince = now;
      return;
    }
    if (now - van.heldSince < HELD_AFTER) return;
    const ctx = this.ctx!;
    const ap = this.autopilot();
    const cmd = this.command();
    if (!ap || !cmd || !ap.isActive(v) || this.playerAboard(v)) return;
    const st = ap.status(v);
    if ((st.state !== 'bloque' && st.state !== 'attente') || st.reason !== 'vehicule') return;
    let x = trip.x, z = trip.z, heading = trip.heading;
    if (trip.stationId !== '') {
      // (le rappel est redonné avec le trajet : pour le commissariat, ce n'est pas un nouvel ordre)
      const stations = this.stations();
      const t = stations ? stations.recall(van.squadId, trip.stationId) : null;
      if (!t) return;
      x = t.x;
      z = t.z;
      heading = t.heading;
    }
    // (départ « embarquement d'abord », échelonné : c'est celui d'une colonne en urgence — deux-tons et conduite
    // d'intervention dès le premier mètre, voiture civile qui le retient rangée au bout de quelques secondes ; le départ
    // direct gardait la conduite sans urgence du trajet en cours)
    ap.stop(v);
    if (!cmd.arrive(van.squadId, { x, z, heading, layout: 'file', boardFirst: true, stagger: true, disembark: false, urgence: true })) {
      // (refusé : le trajet sans urgence est redonné tel qu'au départ, nouvel essai après le même délai)
      cmd.arrive(van.squadId, { x, z, heading, layout: 'file', boardFirst: false, disembark: false, urgence: false });
      van.heldSince = now;
      return;
    }
    van.pushed = true;
    // (nouvel itinéraire : il contourne de nouveau la ligne et la foule, voir detour)
    van.detours = 0;
    van.detourAt = now;
    const s = ctx.squads.get(van.squadId);
    ctx.radio.say({ channel: 'commandement', from: van.name, priority: 1, personId: s ? s.leaderId : 0, text: frame('CENTRAL', van.name, heldText()) });
  }

  /** Groupes de piétons arrêtés (agents à pied, manifestants) : zones à contourner, hors du fourgon lui-même. */
  private standingZones(v: Vehicle): Zone[] {
    const cells = new Map<number, { n: number; x: number; z: number }>();
    for (const p of this.ctx!.people.list) {
      if (p.dormant || p.vehicleId !== 0 || p.posture === 'down') continue;
      const police = p.faction === 'police';
      if (!police && p.faction !== 'protest') continue;
      if (police && Math.hypot(p.vx, p.vz) > 0.8) continue;
      const key = Math.floor(p.x / 25) * 65536 + Math.floor(p.z / 25);
      const c = cells.get(key);
      if (c) {
        c.n++;
        c.x += p.x;
        c.z += p.z;
      } else cells.set(key, { n: 1, x: p.x, z: p.z });
    }
    const out: Zone[] = [];
    for (const c of cells.values()) {
      if (c.n < 4) continue;
      const x = c.x / c.n, z = c.z / c.n;
      // (pas autour du fourgon : son point de départ doit rester praticable)
      if (Math.hypot(x - v.x, z - v.z) < 8) continue;
      out.push({ x, z, r: 18, cost: 600 });
      if (out.length >= 48) break;
    }
    return out;
  }

  private thinkTrip(van: Van, v: Vehicle, now: number): void {
    const trip = van.trip;
    if (!trip) {
      van.stage = 'site';
      return;
    }
    // (instantané des interpellés à bord : ceux que le commissariat remettra)
    if (!van.dropped) {
      const n = this.aboard(v, this.ids);
      if (n > 0) van.ids = this.ids.slice();
    }
    van.line = van.dropped ? '' : enRouteText(van.name, trip.at, van.ids.length);
    this.pushThrough(van, v, trip, now);
    this.detour(van, v, now);
    if (trip.stationId !== '') {
      // l'arrivée vient du module des commissariats (onReturned) ; un fourgon resté en chemin bien au-delà du trajet (rue
      // barrée, relances épuisées) remet ses interpellés hors de la vue du joueur, comme s'il était arrivé
      if (!van.dropped && now - van.leftAt > TRIP_MAX && this.unseen(v.x, v.z)) {
        this.drop(van, v, trip.station);
        van.stage = 'site';
        van.trip = null;
      }
      return;
    }
    const cmd = this.command();
    const c = cmd ? cmd.convoyOf(van.squadId) : null;
    const arrived = !c || !CONVOY_BUSY.has(c.stage);
    if (!van.dropped && (arrived || now - van.leftAt >= OFF_MAP_DROP)) this.drop(van, v, OFF_MAP_STATION);
    if (van.dropped && arrived) {
      const site = this.site();
      if (site) this.sendBack(van, v, site, false, 'retour');
      else van.stage = 'site';
    }
  }

  /** Hors carte : les interpellés du fourgon sont remis au commissariat `station` (ils quittent la scène). */
  private drop(van: Van, v: Vehicle, station: string): void {
    const ctx = this.ctx!;
    const ids = van.ids.slice();
    let n = 0;
    for (const id of ids) {
      const p = ctx.people.get(id);
      if (!p || p.vehicleId !== v.id || p.custody !== 'in_vehicle') continue;
      ctx.vehicles.exit(p);
      ctx.people.remove(p.id);
      n++;
    }
    if (n > 0) ctx.people.rebuildIndex();
    van.dropped = true;
    this.delivered(van, ids, station);
    const s = ctx.squads.get(van.squadId);
    if (n > 0) {
      ctx.radio.say({
        channel: 'commandement', from: van.name, priority: 0, personId: s ? s.leaderId : undefined,
        text: frame('CENTRAL', van.name, droppedText(n)),
      });
    }
  }

  /** Comptage d'une remise au commissariat (relevé d'interpellation, total par commissariat, événement). */
  private delivered(van: Van, ids: readonly EntityId[], station: string): void {
    const ctx = this.ctx!;
    const records = this.records();
    if (records && typeof records.markDelivered === 'function') records.markDelivered(ids, station);
    if (ids.length > 0) {
      let d = this.deliveries.find((x) => x.station === station);
      if (!d) {
        d = { station, count: 0 };
        this.deliveries.push(d);
      }
      d.count += ids.length;
    }
    const ev: TransferDeliveredEvent = { squadId: van.squadId, station, detainees: ids.length, t: ctx.clock.now };
    ctx.events.emitAny(TRANSFER_DELIVERED_EVENT, ev);
  }

  /** Un fourgon rappelé est arrivé à son commissariat : ses interpellés y ont été remis (CommissariatsSystem.arrive). */
  private onReturned(e: CommissariatReturnedEvent): void {
    const ctx = this.ctx;
    if (!ctx || !e) return;
    const van = this.byId.get(e.squadId);
    if (!van || van.stage !== 'aller' || !van.trip) return;
    const def = commissariatById(e.commissariatId);
    const station = def ? homeName(def) : van.trip.station;
    if (def) {
      van.trip.stationId = def.id;
      van.trip.station = station;
      van.trip.at = atName(def);
    }
    this.delivered(van, van.ids, station);
    van.ids = [];
    van.dropped = true;
    van.stage = 'station';
    const entry = this.stations()?.entryOf(e.squadId);
    van.restUntil = entry && entry.restUntil > 0 ? entry.restUntil : ctx.clock.now + STATION_REST;
  }

  /** Au commissariat : à la fin du repos, retour au point de remise (sans remise fixée : il reste là, disponible). */
  private thinkStation(van: Van, v: Vehicle, site: { x: number; z: number; heading: number } | null, now: number): void {
    const at = van.trip ? van.trip.at : OFF_MAP_AT;
    van.line = atStationText(van.name, at, Math.max(0, van.restUntil - now));
    if (now < van.restUntil) return;
    van.line = '';
    if (!site || this.playerAboard(v)) {
      van.stage = 'site';
      return;
    }
    // (sur le point de remise, les places libres manquent : retour en urgence)
    const urgent = !this.coverFor(null, site);
    this.stations()?.leave?.(van.squadId);
    this.sendBack(van, v, site, urgent, 'retour');
    const s = this.ctx!.squads.get(van.squadId);
    this.ctx!.radio.say({
      channel: 'commandement', from: van.name, priority: 0, personId: s ? s.leaderId : undefined,
      text: frame('CENTRAL', van.name, returnText(van.name, this.driveEta(van, v))),
    });
  }

  // ───────────────────────────── retour à la remise ─────────────────────────────

  /**
   * Place libre à la file du point de remise, à l'écart des places déjà visées par d'autres fourgons ; dans le sens de
   * la remise, sinon dans l'autre (la file d'une rue peut être garée dans les deux sens), jamais nez à nez (noseFree).
   */
  private goalNear(site: { x: number; z: number; heading: number }, v: Vehicle): Goal | null {
    const ctx = this.ctx!;
    const fx = Math.sin(site.heading), fz = Math.cos(site.heading);
    const back180 = site.heading > 0 ? site.heading - Math.PI : site.heading + Math.PI;
    for (let back = 0; back <= 120; back += 8.5) {
      for (const lat of [0, 3.6, -3.6]) {
        const x = site.x - fx * back - fz * lat;
        const z = site.z - fz * back + fx * lat;
        let taken = false;
        for (const o of this.list) {
          if (o.vehicleId === v.id) continue;
          const g = o.goal;
          if (g && (o.stage === 'retour' || o.stage === 'releve') && Math.hypot(g.x - x, g.z - z) < 7.5) taken = true;
        }
        if (taken) continue;
        for (const h of [site.heading, back180]) {
          if (!this.noseFree(v, x, z, h) || !vanFits(ctx, x, z, h, v.def.length, v.def.width, v, true)) continue;
          return { x, z, heading: h };
        }
      }
    }
    return null;
  }

  /**
   * Un fourgon garé en (x, z), au cap `h`, laisse-t-il repartir les autres et peut-il repartir lui-même : aucun véhicule
   * arrêté dont il boucherait l'avant (NOSE_CLEAR m devant son pare-chocs, sur sa voie), ni contre son propre avant.
   * (Un fourgon de relève garé nez à nez devant un fourgon plein l'empêchait de partir ; le pilote automatique le faisait
   * alors dégager par un détour d'un kilomètre, et la remise restait sans fourgon.)
   */
  private noseFree(v: Vehicle, x: number, z: number, h: number): boolean {
    const ctx = this.ctx!;
    const fx = Math.sin(h), fz = Math.cos(h);
    const reach = v.def.length + NOSE_CLEAR + 4;
    const blocks = (ax: number, az: number, ahx: number, ahz: number, alen: number, bx: number, bz: number, wid: number): boolean => {
      // (b devant a : sur sa voie, entre son pare-chocs avant et NOSE_CLEAR m plus loin)
      const dx = bx - ax, dz = bz - az;
      const along = dx * ahx + dz * ahz;
      const lat = Math.abs(dx * ahz - dz * ahx);
      return along > 0 && along < alen * 0.5 + NOSE_CLEAR + v.def.length * 0.5 && lat < wid;
    };
    for (const o of ctx.vehicles.list) {
      if (o === v || o.def.flying || Math.abs(o.speed) > 0.5) continue;
      if (Math.abs(o.x - x) > reach || Math.abs(o.z - z) > reach) continue;
      const wid = (o.def.width + v.def.width) * 0.5 + 0.6;
      const ohx = Math.sin(o.heading), ohz = Math.cos(o.heading);
      if (blocks(o.x, o.z, ohx, ohz, o.def.length, x, z, wid)) return false;
      if (blocks(x, z, fx, fz, v.def.length, o.x, o.z, wid)) return false;
    }
    return true;
  }

  /** Le fourgon roule vers une place libre du point de remise (deux-tons si `urgent`). */
  private sendBack(van: Van, v: Vehicle, site: { x: number; z: number; heading: number }, urgent: boolean, stage: 'retour' | 'releve'): void {
    const ap = this.autopilot();
    const goal = this.goalNear(site, v) ?? { x: site.x, z: site.z, heading: site.heading };
    van.stage = stage;
    van.goal = goal;
    van.goalFromX = site.x;
    van.goalFromZ = site.z;
    van.parking = false;
    van.urgent = urgent;
    van.best = Infinity;
    van.bestAt = this.ctx!.clock.now;
    van.replans = 0;
    van.idleAt = -1;
    van.trip = stage === 'releve' ? null : van.trip;
    van.wantSince = -1;
    van.firstAt = -1;
    if (ap && !ap.driveTo(v, goal.x, goal.z, { urgence: urgent })) ap.park(v, goal.x, goal.z, goal.heading);
  }

  /** Retour, relève : route, manœuvre finale, puis « sur place » ; sans progrès, nouvel itinéraire ; enfin rangé hors de vue. */
  private thinkDrive(van: Van, v: Vehicle, site: { x: number; z: number; heading: number } | null, now: number): void {
    const ap = this.autopilot();
    if (!ap || this.playerAboard(v)) {
      van.stage = 'site';
      return;
    }
    // le point de remise a bougé : nouvelle place
    if (site && Math.hypot(site.x - van.goalFromX, site.z - van.goalFromZ) > 30) {
      this.sendBack(van, v, site, van.urgent, van.stage === 'releve' ? 'releve' : 'retour');
      return;
    }
    const g = van.goal;
    if (!g) {
      van.stage = 'site';
      return;
    }
    const d = Math.hypot(v.x - g.x, v.z - g.z);
    van.line = backText(van.name, this.driveEta(van, v));
    if (!ap.isActive(v)) {
      if (d <= AT_GOAL || (van.parking && d <= PARK_FROM)) {
        this.arrived(van);
        return;
      }
      // arrêté en chemin par un autre (il laisse passer, recule pour qu'un automobiliste dégage) : on le laisse finir sa
      // manœuvre, qui reprend d'elle-même ; relancé trop tôt, la marche arrière reprenait une fois garé
      if (ap.status(v).state !== 'arrive') {
        if (van.idleAt < 0) van.idleAt = now;
        if (now - van.idleAt < IDLE_GRACE) return;
      }
      van.idleAt = -1;
      if (d <= PARK_FROM && !van.parking) {
        van.parking = true;
        if (ap.park(v, g.x, g.z, g.heading)) return;
      }
    } else {
      van.idleAt = -1;
      if (!van.parking && d <= PARK_FROM) {
        van.parking = true;
        if (ap.park(v, g.x, g.z, g.heading)) return;
      }
    }
    if (d < van.best - PROGRESS) {
      van.best = d;
      van.bestAt = now;
      return;
    }
    if (now - van.bestAt < PROGRESS_TIME && ap.isActive(v)) return;
    // sans progrès (ou pilote arrêté loin de sa place) : nouvel itinéraire ; déjà près du point de remise, il se gare là
    // où il est (sa place est inaccessible : rue encombrée par les véhicules garés) ; au bout de REPLANS, rangé hors de vue
    van.bestAt = now;
    van.best = d;
    if (van.replans >= 2 && site && Math.hypot(v.x - site.x, v.z - site.z) <= NEAR_SITE) {
      ap.stop(v);
      this.arrived(van);
      return;
    }
    if (van.replans < REPLANS) {
      van.replans++;
      van.parking = false;
      if (!ap.driveTo(v, g.x, g.z, { urgence: van.urgent })) ap.park(v, g.x, g.z, g.heading);
      return;
    }
    if (this.unseen(v.x, v.z) && this.unseen(g.x, g.z) && vanFits(this.ctx!, g.x, g.z, g.heading, v.def.length, v.def.width, v, true)) {
      ap.stop(v);
      v.x = g.x;
      v.z = g.z;
      v.y = this.ctx!.world.heightAt(g.x, g.z);
      v.heading = g.heading;
      v.speed = 0;
      v.vx = 0;
      v.vz = 0;
      this.arrived(van);
    }
  }

  private arrived(van: Van): void {
    van.stage = 'site';
    van.goal = null;
    van.parking = false;
    van.urgent = false;
    van.line = '';
    van.count = 0;
    van.firstAt = -1;
    van.trip = null;
  }

  /** Le joueur est à plus de UNSEEN m de ce point (il ne voit pas un véhicule y être rangé). */
  private unseen(x: number, z: number): boolean {
    const me = this.ctx!.player.person();
    return !me || Math.hypot(me.x - x, me.z - z) > UNSEEN;
  }

  // ───────────────────────────── patrouille ─────────────────────────────

  /**
   * Mode patrouille : l'équipage du joueur tient un interpellé loin de sa voiture, sans fourgon à moins de 300 m : un
   * fourgon est demandé tout seul et vient au plus près de lui.
   */
  private patrol(now: number): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const crew = me && me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const custody = ctx.service<LawCustody>(LAW_CUSTODY_SERVICE);
    if (!me || !crew || !custody || typeof custody.detaineeOf !== 'function') return;
    let held: Person | null = null;
    for (const id of crew.members) {
      const d = custody.detaineeOf(id);
      if (d) {
        held = d;
        break;
      }
    }
    const req = this.request ? this.byId.get(this.request.vanSquadId) : undefined;
    if (req && held) req.heldAt = now;
    if (!held) return;
    const car = crew.vehicleId !== 0 ? ctx.vehicles.get(crew.vehicleId) : undefined;
    const carD = car ? Math.hypot(car.x - held.x, car.z - held.z) : Infinity;
    if (req) {
      // l'interpellé a bougé (le joueur l'emmène) : le fourgon vient plus près
      const v = this.vehicle(req);
      if (v && req.stage === 'patrouille' && req.goal && Math.hypot(held.x - req.goal.x, held.z - req.goal.z) > 60 && !this.busy(v)) this.patrolGoal(req, v, held);
      if (this.request) {
        this.request.eta = v ? Math.round(this.driveEta(req, v)) : 0;
        this.request.text = CUSTODY_TEXTS.vanRequested(this.request.eta, carD);
      }
      return;
    }
    if (carD <= PATROL_CAR) return;
    for (const o of ctx.vehicles.list) {
      if (o.kind === 'fourgon_cellulaire' && o.faction === 'police' && o.seats[0] !== 0 && Math.hypot(o.x - held.x, o.z - held.z) <= PATROL_VAN) return;
    }
    if (now < this.reliefAt) return;
    this.reliefAt = now + RELIEF_GAP;
    let van: Van | null = null;
    const stations = this.stations();
    if (stations) {
      const entry = this.nearestStationVan(stations, held);
      const r = entry ? stations.engage(entry, 0, true) : null;
      const s = r && r.ok ? ctx.squads.get(r.squadId) : undefined;
      const v = s && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
      if (s && v) van = this.byId.get(s.id) ?? this.track(s, v, 'site');
    }
    if (!van && this.created < CREATED_MAX) van = this.spawnVan(held.x, held.z, { x: held.x, z: held.z, heading: me.heading }, false);
    if (!van) return;
    const v = this.vehicle(van)!;
    this.patrolGoal(van, v, held);
    van.heldAt = now;
    const eta = Math.round(this.driveEta(van, v));
    this.request = { vanSquadId: van.squadId, text: CUSTODY_TEXTS.vanRequested(eta, carD), eta };
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: frame(crew.name.toUpperCase(), 'CENTRAL', patrolVanText(van.name, eta)) });
    ctx.ui.notify(this.request.text, 'info', 6);
  }

  /** Le fourgon demandé roule jusqu'à la chaussée la plus proche de l'interpellé. */
  private patrolGoal(van: Van, v: Vehicle, held: Person): void {
    const ctx = this.ctx!;
    const road = this.road;
    const ok = ctx.world.nearestRoad(held.x, held.z, road, 40);
    const x = ok ? road.x : held.x, z = ok ? road.z : held.z;
    const toward = Math.atan2(x - v.x, z - v.z);
    const h = ok ? (Math.cos(road.heading - toward) >= 0 ? road.heading : road.heading + Math.PI) : toward;
    van.stage = 'patrouille';
    van.goal = { x, z, heading: h };
    van.parking = false;
    van.urgent = true;
    van.best = Infinity;
    van.bestAt = ctx.clock.now;
    van.replans = 0;
    const ap = this.autopilot();
    if (ap) ap.driveTo(v, x, z, { urgence: true });
  }

  /** Fourgon de patrouille : il attend l'interpellé, part au commissariat une fois chargé, rentre s'il reste vide. */
  private thinkPatrolVan(van: Van, v: Vehicle, now: number): void {
    const ap = this.autopilot();
    const g = van.goal;
    const n = this.aboard(v, null);
    if (g && ap) {
      const d = Math.hypot(v.x - g.x, v.z - g.z);
      van.line = ap.isActive(v) ? CUSTODY_TEXTS.vanComing(van.name, this.driveEta(van, v)) : '';
      if (ap.isActive(v) && d <= 12) ap.stop(v);
      else if (!ap.isActive(v) && d > 30 && n === 0 && now - van.bestAt >= PROGRESS_TIME) {
        van.bestAt = now;
        ap.driveTo(v, g.x, g.z, { urgence: true });
      }
    }
    if (n > 0 && now - van.heldAt >= PATROL_GO && !this.busy(v)) {
      const r = this.depart(van.squadId, false);
      if (!r.ok) van.heldAt = now;
      return;
    }
    if (n === 0 && now - van.heldAt >= PATROL_IDLE && !this.busy(v)) {
      // plus personne à remettre : le fourgon rentre (au commissariat, ou hors de la vue du joueur s'il était de renfort)
      if (this.request && this.request.vanSquadId === van.squadId) this.request = null;
      van.goal = null;
      const stations = this.stations();
      const cmd = this.command();
      const t = stations && cmd && !van.created ? stations.recall(van.squadId) : null;
      if (t && cmd && cmd.arrive(van.squadId, { x: t.x, z: t.z, heading: t.heading, layout: 'file', boardFirst: false, disembark: false, urgence: false })) {
        van.stage = 'site';
        return;
      }
      if (van.created && this.unseen(v.x, v.z)) {
        this.removeVan(van, v);
        return;
      }
      van.stage = 'site';
    }
  }

  /** Fourgon de renfort qui n'a plus rien à faire, hors de la vue du joueur : il quitte la scène avec son équipage. */
  private removeVan(van: Van, v: Vehicle): void {
    const ctx = this.ctx!;
    const s = ctx.squads.get(van.squadId);
    const crew: EntityId[] = [];
    for (let i = 0; i < v.seats.length; i++) if (v.seats[i] !== 0) crew.push(v.seats[i]!);
    if (s) for (const id of s.members) if (crew.indexOf(id) < 0) crew.push(id);
    for (const id of crew) {
      const p = ctx.people.get(id);
      if (!p || p.isPlayer || p.custody === 'in_vehicle') continue;
      if (p.vehicleId !== 0) ctx.vehicles.exit(p);
      ctx.people.remove(id);
    }
    ctx.vehicles.remove(v.id);
    if (s) ctx.squads.remove(s.id);
    ctx.people.rebuildIndex();
  }

  // ───────────────────────────── voiture devant le commissariat (§5.7) ─────────────────────────────

  /**
   * Le joueur à bord d'un véhicule de police arrêté devant la porte d'un commissariat (préfecture, commissariats), des
   * interpellés à bord : ils y sont remis à l'officier de police judiciaire et comptés là.
   */
  private carDelivery(now: number): void {
    const ctx = this.ctx!;
    const stations = this.stations();
    const me = ctx.player.person();
    const v = me && me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    if (!stations || !v || v.faction !== 'police' || Math.abs(v.speed) > 0.5 || this.aboard(v, this.ids) === 0) {
      this.carStopAt = -1;
      return;
    }
    let site: CommissariatView | null = null;
    for (const c of stations.list) {
      if (c.kind === 'caserne_gendarmerie') continue;
      if (Math.hypot(c.x - v.x, c.z - v.z) <= CAR_AT || Math.hypot(c.returnX - v.x, c.returnZ - v.z) <= CAR_AT) {
        site = c;
        break;
      }
    }
    if (!site) {
      this.carStopAt = -1;
      return;
    }
    if (this.carStopAt < 0 || this.carStopId !== v.id) {
      this.carStopAt = now;
      this.carStopId = v.id;
      return;
    }
    if (now - this.carStopAt < CAR_STOP) return;
    this.carStopAt = -1;
    const ids = this.ids.slice();
    for (const id of ids) {
      const p = ctx.people.get(id);
      if (!p) continue;
      ctx.vehicles.exit(p);
      ctx.people.remove(p.id);
    }
    ctx.people.rebuildIndex();
    const def = commissariatById(site.id);
    const station = def ? homeName(def) : site.name;
    const at = def ? atName(def) : 'au ' + site.name;
    const van = this.byId.get(this.squadOfVehicle(v.id));
    const records = this.records();
    if (van) this.delivered(van, ids, station);
    else {
      if (records && typeof records.markDelivered === 'function') records.markDelivered(ids, station);
      let d = this.deliveries.find((x) => x.station === station);
      if (!d) {
        d = { station, count: 0 };
        this.deliveries.push(d);
      }
      d.count += ids.length;
      const ev: TransferDeliveredEvent = { squadId: me!.squadId, station, detainees: ids.length, t: now };
      ctx.events.emitAny(TRANSFER_DELIVERED_EVENT, ev);
    }
    const crew = me!.squadId !== 0 ? ctx.squads.get(me!.squadId) : undefined;
    const from = crew ? crew.name.toUpperCase() : 'PATROUILLE';
    ctx.radio.say({ channel: 'commandement', from, priority: 1, personId: me!.id, text: frame('CENTRAL', from, carDeliveredText(at, ids.length)) });
  }

  private squadOfVehicle(vehicleId: EntityId): number {
    for (const s of this.ctx!.squads.list) if (s.vehicleId === vehicleId && s.faction === 'police') return s.id;
    return 0;
  }

  // ───────────────────────────── vue ─────────────────────────────

  private refreshView(van: Van, now: number): void {
    const v = this.vehicle(van);
    const w = van.view;
    w.name = van.name;
    w.stage = van.stage === 'site' && van.wantSince >= 0 ? 'attend' : STAGE_VIEW[van.stage];
    if (!v) return;
    const n = this.aboard(v, null);
    w.detainees = n;
    w.seats = n + this.freeSeats(v);
    w.line = van.line;
    w.station = van.trip ? van.trip.station : '';
    let eta = 0;
    if (van.stage === 'retour' || van.stage === 'releve' || van.stage === 'patrouille') eta = this.driveEta(van, v);
    else if (van.stage === 'aller') {
      const ap = this.autopilot();
      eta = ap && ap.isActive(v) ? ap.status(v).remaining / CITY_SPEED : 0;
    } else if (van.stage === 'station') eta = Math.max(0, van.restUntil - now);
    w.eta = Math.round(eta);
  }
}
