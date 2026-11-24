/* =====================================================================================
 * SUIVRE LE CHEF — l'unité du joueur le suit naturellement, à pied comme en véhicule.
 *
 * Demande du commanditaire : « quand j'ai une responsabilité, tout le monde me suit » — chef de groupe, BRAV-M,
 * équipage d'engin, et le conducteur du fourgon de son groupe. À pied, c'est l'ordre « suivre » exécuté par l'IA de
 * police (donné à la mise en place). Ce système ajoute le cas du VÉHICULE :
 *   - quand le joueur prend le volant, les équipiers montent : d'abord dans son véhicule s'il reste des places, puis
 *     dans les autres véhicules de l'unité (motos de la BRAV-M, fourgons) ;
 *   - ces véhicules forment une COLONNE derrière le sien (pilote automatique, « follow » en chaîne) et reprennent sa
 *     sirène et ses gyrophares : on traverse Paris en convoi ;
 *   - les autres unités qui l'accompagnent (escorte de l'engin, groupes de la section qu'il commande, et TOUTE sa
 *     compagnie, même tenue par un commandant IA — sauf les unités au contact, voir CONTACT_ORDERS ; équipage du
 *     Centaure : l'engin apparié seul) embarquent dans LEURS fourgons et prennent place dans la colonne : c'est la
 *     colonne de fourgons qui traverse Paris, sirènes hurlantes ; les équipiers sans place (équipe drone, état-major
 *     plus nombreux que les places du VL) montent dans le véhicule de la colonne le plus proche (seatOrphans) ;
 *   - quand le joueur descend, la colonne s'arrête, tout le monde descend et reprend « suivre » à pied ; les autres
 *     groupes débarquent en ligne à côté de leur fourgon, puis ceux qu'il commande le suivent à pied (jamais laissés à
 *     « débarquer ») ; ceux d'une compagnie tenue par un commandant IA reprennent son dispositif.
 * « Avec moi » ne le quitte pas (spécification §3.3) : il monte en passager, ceux qui le suivaient à pied montent dans
 * leurs fourgons et suivent son véhicule ; il descend, les unités « en colonne » derrière lui descendent et le suivent.
 * Les fourgons cellulaires restent au point de remise des interpellés et la BRAV-M suit en selle, à part (jamais dans
 * la colonne des fourgons) : un ordre à toute la compagnie ne les y met pas.
 * Ordres du joueur (service 'session.follow', donnés depuis la roue d'ordres, la carte tactique ou la touche A) :
 *   - « Me suivre en colonne (véhicules) » : l'unité remonte dans ses véhicules, se range derrière celui du joueur et le
 *     suit en colonne, qu'il conduise ou qu'il soit passager, feux et sirène comme lui. Donné à pied, l'unité embarque et
 *     attend, moteurs tournants (« en colonne, prête à vous suivre ») ; quand le joueur, monté entre-temps, descend, la
 *     colonne s'arrête derrière lui et l'unité descend et le suit ;
 *   - « Me suivre à pied » : l'unité quitte la colonne, descend si elle est à bord, puis suit le joueur à pied ; ses
 *     branches trop loin pour venir à pied (direct/travel.ts) viennent dans leurs fourgons et le suivent une fois
 *     descendues. Ces ordres portent byPlayer (ce sont ceux du joueur : accusé de réception dans la seconde).
 * Simulation pure (aucun DOM). Sans pilote automatique (module des véhicules absent), seul l'embarquement à bord du
 * véhicule du joueur a lieu.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Person, RayHit, RoadSample, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
// (règle pure, sans DOM : la même que la fiche, le terrain et le Qui — quand une unité vient en véhicules)
import { SEATED_DRIVE_MIN, motorizes } from '@/ui/command/direct/travel';
import { isHeldVehicle } from '@/world/commissariats';

interface Autopilot {
  follow(v: Vehicle, leaderId: EntityId, distance?: number, trail?: readonly number[]): boolean;
  stop(v: Vehicle): void;
  status?(v: Vehicle): Readonly<{ mode: string; leaderId: EntityId; state?: string; reason?: string; blockedFor?: number }>;
  giveWay?(v: Vehicle, metres: number): boolean;
}
interface CommandLike {
  stateOf(companyId: number): { phase: string; commanderId: EntityId; missionEnded: boolean } | null;
  convoyOf?(squadId: number): { stage: string } | null;
  /** Unité spéciale (BRAV-M, engins) pilotée par le commandement ; null sinon. */
  special?(squadId: number): { kind: string } | null;
  /** Colonne motorisée de l'unité vers un point (voir sim/police/command/api.ts ConvoyDestination). */
  arrive?(squadId: number, dest: { x: number; z: number; heading: number; layout?: 'file'; boardFirst?: boolean; stagger?: boolean; disembark?: boolean }): boolean;
  /** Le véhicule roule-t-il dans une colonne du commandement (trajet, départ) ? */
  carrying?(vehicleId: number): boolean;
  /** Un ordre du joueur libère l'unité de la colonne en cours (voir sim/police/command/convoy.ts takeOver). */
  takeOver?(squadId: number, order?: Partial<Squad['order']>): boolean;
}

/** Service des ordres « Me suivre à pied » / « Me suivre en colonne (véhicules) ». */
export const FOLLOW_SERVICE = 'session.follow';
export interface FollowApi {
  /** « Me suivre en colonne » : l'unité embarque et suit le véhicule du joueur. false : aucun véhicule utilisable. */
  column(squadId: number): boolean;
  /** « Me suivre à pied » : l'unité quitte la colonne, descend si elle est à bord, puis suit le joueur à pied. */
  onFoot(squadId: number): void;
  /** Autre ordre : l'unité quitte la colonne (ses véhicules s'arrêtent). */
  release(squadId: number): void;
  /** L'unité (ou une unité dont elle dépend) est-elle « en colonne » derrière le joueur ? */
  inColumn(squadId: number): boolean;
  /**
   * L'unité (ou une unité dont elle dépend) vient-elle se mettre avec le joueur à pied — elle descend de ses véhicules
   * pour le suivre, ou vient de loin dans ses fourgons (« Avec moi ») ? La ligne d'état la compte « avec vous ».
   */
  coming(squadId: number): boolean;
}
/** Délai maximal d'embarquement avant de se déclarer prête (s) et de débarquement avant de suivre à pied (s). */
const MOTOR_READY_MAX = 60;
const DISMOUNT_MAX = 45;
/** Branche venue de loin en véhicules (« Avec moi » à pied) : au-delà, elle le suit à pied d'où elle est (s). */
const INCOMING_MAX = 600;
/**
 * Fourgon d'une branche qui vient de loin (voir walkIn) : à moins de INCOMING_WALK m du joueur, s'il ne s'est pas
 * rapproché de lui de INCOMING_GAIN m en INCOMING_STALL s (embouteillage, détour), son groupe finit à pied — après les
 * vingt secondes au bout desquelles une colonne en urgence fait ranger la voiture qui la retient (convoy.ts,
 * CIVIL_CLEAR) ; un fourgon qui n'a pas démarré INCOMING_START s après l'appel est tenu pour arrêté (m, m, s, s).
 */
const INCOMING_WALK = 400;
const INCOMING_GAIN = 5;
const INCOMING_STALL = 30;
const INCOMING_START = 30;
/** Point d'arrêt de sa colonne : à tant de mètres du joueur, de son côté, sur la chaussée la plus proche (m). */
const CALL_STOP = 40;
const CALL_ROAD = 30;
/** Rayon dans lequel les véhicules d'une unité « en colonne » rejoignent celle du joueur qui conduit (m). */
const MOTOR_RADIUS = 3000;
/** Étapes d'un mouvement motorisé encore en cours (police.command) : la colonne de l'unité roule vers le joueur. */
const CONVOY_BUSY: ReadonlySet<string> = new Set(['route', 'stationnement', 'debarquement', 'rembarquement', 'depart']);
interface VehiclesExt {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
  setBeacons?(v: Vehicle, on: boolean): void;
}

/** Délai maximal pour rejoindre un véhicule avant d'abandonner (s) et distance de montée (m). */
const BOARD_TIMEOUT = 40;
const BOARD_REACH = 4.5;
/** Équipier qui court à sa place sans plus s'en rapprocher depuis (s) : il prend le chemin d'un piéton, suivi au plus (s). */
const SEAT_STALL = 2;
const SEAT_PATH_MAX = 25;
/** Rayon dans lequel on cherche les véhicules de l'unité autour du joueur (m). */
const FLEET_RADIUS = 90;
/** Intervalle entre deux véhicules de la colonne (m, pare-chocs à pare-chocs). */
const COLUMN_GAP = 9;
/**
 * Premier véhicule de la colonne garé en bloc (un véhicule juste devant lui) : il ne prend la suite du meneur qu'à cette
 * distance (m) — au-delà, le pilote automatique le rejoint par les rues ; en deçà, il viserait tout droit le point de
 * départ du meneur, à travers les véhicules garés autour de lui (il restait alors bloqué indéfiniment, et toute la
 * colonne derrière lui).
 */
const FIRST_ENGAGE = 42;
/** Colonne coincée (voir unjam) : attente avant de faire passer le gêneur devant (s), délai avant un nouvel échange (s). */
const JAM_WAIT = 5;
const SWAP_COOLDOWN = 12;
/** Colonne coincée nez contre flanc (voir unjam) : recul de celui qui cède le passage (m), place minimale derrière lui (m). */
const YIELD_BACK = 4;
const YIELD_MIN = 1.5;
/** Véhicule « juste devant » : à moins de tant de mètres devant le pare-chocs, dans l'axe (m). */
const BOXED_AHEAD = 10;
const BOXED_SIDE = 2.4;
/** Traces : un point tous les tant de mètres, points retirés à la marche arrière (m), nombre de points gardés. */
const TRAIL_STEP = 2;
const TRAIL_UNDO = 7;
const TRAIL_MAX = 600;
/** Distance parcourue par le meneur depuis sa place à partir de laquelle on ordonne la sortie du stationnement (m). */
const DEPART_MOVE = 20;
/** Équipiers sans place d'une compagnie qui part (voir seatOrphans) : délai laissé à l'IA de police (s), rayon (m). */
const ORPHAN_DELAY = 6;
const ORPHAN_RADIUS = 120;
const ORPHAN_TRIES = 2;
/** Rayon dans lequel les fourgons d'une unité accompagnatrice peuvent rejoindre la colonne (m). */
const COMPANY_RADIUS = 160;
/** Revue périodique des unités « en colonne » qui rejoignent la colonne du joueur qui conduit (s). */
const JOIN_PERIOD = 3;
/** Ordres qui n'engagent pas une unité : on peut l'emmener sans défaire une manœuvre (une unité qui tient un barrage reste). */
const ARMORED: ReadonlySet<string> = new Set(['centaure', 'canon_eau']);
const FREE_ORDERS: ReadonlySet<string> = new Set(['libre', 'suivre', 'cesser', 'embarquer', 'debarquer', 'colonne', 'escorter']);
/** Véhicules qui emmènent la compagnie : quand le joueur en conduit un, toute la colonne suit. */
const TROOP_KINDS: ReadonlySet<string> = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'canon_eau', 'centaure', 'fourgon_cellulaire']);
const POLICE_FLEET: ReadonlySet<string> = new Set(['moto_bravm', 'fourgon_crs', 'car_crs', 'voiture_police', 'voiture_bac', 'vl_commandement', 'fourgon_cellulaire']);
/**
 * « Tout le monde me suit » (demande du commanditaire : « c'est obligatoire ») : quel que soit son rôle de police — sauf
 * l'équipage du Centaure, que seul l'engin apparié accompagne —, quand le joueur conduit un véhicule de police (ou est
 * passager de celui qui mène), TOUTE la colonne de sa compagnie embarque et le suit, même tenue par un commandant IA.
 * Seules restent les unités AU CONTACT : elles chargent, interpellent, gazent, encerclent, éteignent un feu, secourent,
 * tiennent ou emmènent quelqu'un (un interpellé, un blessé), ou tiennent un barrage, une ligne ou une nasse avec des
 * manifestants à moins de CONTACT_RADIUS m. Quand le joueur descend, la colonne se gare derrière lui, chaque groupe
 * débarque en ligne à côté de son fourgon et le commandant IA reprend son dispositif à partir de là.
 * Pour un équipage ou une équipe qui n'appartient à aucune compagnie (canon à eau, drone), c'est la compagnie engagée
 * sur place (la plus proche, à moins de WHOLE_RADIUS m) ; pour la BRAV-M, les motos de son unité.
 */
const CONTACT_ORDERS: ReadonlySet<string> = new Set(['charge', 'bond_offensif', 'refoulement', 'interpeller', 'disperser_gaz', 'encercler', 'degager_barricade', 'eteindre', 'secourir']);
const HOLD_ORDERS: ReadonlySet<string> = new Set(['tenir', 'ligne', 'tortue', 'couper_circulation', 'filtrer', 'avancer']);
const CONTACT_RADIUS = 40;
/** Rayon dans lequel les véhicules de la compagnie rejoignent la colonne du joueur (m). */
const WHOLE_RADIUS = 400;

interface Assignment {
  vehicleId: EntityId;
  role: 'driver' | 'passenger';
  /** Place attribuée (index dans v.def.seats) : poste de conduite, de tir (lance du canon à eau) ou passager. */
  seat: number;
  since: number;
  /** Plus courte distance au véhicule atteinte en chemin, et instant où elle a encore diminué (walkToSeats). */
  near?: number;
  nearAt?: number;
  /** Chemin de piéton vers le véhicule quand le trajet direct n'avance plus (walkToSeats) : points, instant du calcul, point visé. */
  path?: number[];
  pathAt?: number;
  pathI?: number;
}

export class FollowLeaderSystem implements GameSystem {
  readonly id = 'session.follow';
  readonly order = SystemOrder.CONTROL + 45;

  private ctx: GameContext | null = null;
  private mounted = 0;
  private readonly assign = new Map<EntityId, Assignment>();
  /** Véhicules de la colonne, dans l'ordre (le premier suit le joueur). */
  private column: EntityId[] = [];
  /** Unités accompagnatrices (elles embarquent dans leur propre fourgon) et départ de l'embarquement. */
  private escorts: number[] = [];
  private escortSince = 0;
  private nextThink = 0;
  private nextJoin = 0;
  /**
   * Unités « en colonne » (ordre du joueur, ou « Avec moi » qui le suit quand il monte en passager) : instant de l'ordre,
   * compte rendu « prête à vous suivre » fait ; `byPlayer` : l'ordre qui la fera suivre à pied quand il descendra
   * est-il un ordre du joueur (ou la suite de son « suivre » de mise en place).
   */
  private readonly motor = new Map<number, { since: number; ready: boolean; boarded: boolean; seated?: boolean; byPlayer?: boolean }>();
  private unsub: (() => void) | null = null;
  /**
   * Unités qui descendent de leurs véhicules pour suivre le joueur à pied : instant de l'ordre, et l'ordre « suivre »
   * qui suivra est-il du joueur (« Avec moi ») ou la suite naturelle d'une colonne (comme à la mise en place).
   */
  private readonly dismount = new Map<number, { since: number; byPlayer: boolean }>();
  /**
   * Unités loin du joueur à pied appelées par « Avec moi » : elles viennent dans leurs véhicules (police.command,
   * colonne vers lui) et, débarquées, le suivent à pied. Instant de l'appel, ordre du joueur ou non.
   */
  private readonly incoming = new Map<number, { since: number; byPlayer: boolean }>();
  /** Fourgons de ces branches : distance au joueur la plus courte atteinte, instant où elle l'a été, a-t-il roulé. */
  private readonly inbound = new Map<EntityId, { d: number; at: number; rolled: boolean }>();
  /** Actions reportées après le traitement d'un ordre par le module de police (voir later). */
  private deferred: { at: number; run: () => void }[] = [];
  /** BRAV-M d'une unité qui vient de recevoir « Avec moi » : « suivre » le joueur lui est donné (ou redonné) sous peu. */
  private readonly bravmDue = new Map<number, { byPlayer: boolean; until: number }>();
  /** Escortes de la colonne qu'il conduisait : avaient-elles « Avec moi » du joueur (byPlayer) avant d'embarquer ? */
  private readonly escortBy = new Map<number, boolean>();
  /** Véhicule où se trouvait le joueur au pas précédent (montée, descente : « Avec moi » le suit) ; −1 : pas encore vu. */
  private lastVehicle: EntityId = -1;
  /** Branches d'une unité « en colonne » qui ont reçu un autre ordre : elles ne font plus partie de la colonne. */
  private readonly detached = new Set<number>();
  /** Colonne derrière le véhicule où le joueur est passager (il ne conduit pas) : véhicules dans l'ordre. */
  private ride: EntityId[] = [];
  /**
   * Traces (x, z…) du véhicule du joueur et de ceux de la colonne depuis le départ : un véhicule qui prend la suite du
   * précédent rejoint sa trace et passe là où il est passé (sortie du bloc garé), au lieu de couper au plus court à
   * travers les véhicules garés ou de chercher son propre chemin par les rues.
   */
  private readonly trails = new Map<EntityId, number[]>();
  /** La sortie du stationnement a été ordonnée (une fois par départ, voir exitOrder). */
  private exitSorted = false;
  /** Véhicule de la colonne qui recule pour céder le passage (voir unjam), et l'instant de la demande. */
  private yielder: EntityId = 0;
  private yieldAt = -1;
  /** Véhicules de la colonne passés devant celui qu'ils bloquaient (voir unjam) : instant du dernier échange. */
  private readonly swapped = new Map<EntityId, number>();
  /** Équipiers sans place à qui une place a été donnée pendant ce départ (voir seatOrphans) : véhicules essayés. */
  private readonly orphaned = new Map<EntityId, EntityId[]>();

  provide(ctx: GameContext): void {
    const api: FollowApi = {
      column: (id) => this.orderColumn(id),
      onFoot: (id) => this.orderOnFoot(id),
      release: (id) => this.leaveColumn(id),
      inColumn: (id) => {
        const s = this.ctx?.squads.get(id);
        return !!s && this.motorRoot(s) !== 0;
      },
      coming: (id) => {
        if (!this.ctx) return false;
        for (const root of this.dismount.keys()) if (this.isUnder(id, root)) return true;
        for (const root of this.incoming.keys()) if (this.isUnder(id, root)) return true;
        return false;
      },
    };
    ctx.provide(FOLLOW_SERVICE, api);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    // fin de l'embarquement de l'unité (police) : ceux qui ont une place sont à bord, un agent resté sans place
    // (véhicules détruits) ne retient pas la colonne
    this.unsub = ctx.events.onAny('police:order_done', (payload) => {
      const e = payload as { squadId: number; type: string };
      const st = e && e.type === 'embarquer' ? this.motor.get(e.squadId) : undefined;
      if (st) st.boarded = true;
    });
  }

  dispose(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
  }

  reset(): void {
    this.mounted = 0;
    this.assign.clear();
    this.column = [];
    this.escorts = [];
    this.escortSince = 0;
    this.nextThink = 0;
    // l'horloge repart de 0 à chaque session : une échéance héritée bloquerait la revue des unités « en colonne »
    this.nextJoin = 0;
    // ordres « me suivre » : propres à la session (les identifiants d'unités sont réattribués)
    this.motor.clear();
    this.dismount.clear();
    this.incoming.clear();
    this.inbound.clear();
    this.bravmDue.clear();
    this.deferred = [];
    this.escortBy.clear();
    this.lastVehicle = -1;
    this.detached.clear();
    this.ride = [];
    this.trails.clear();
    this.exitSorted = false;
    this.swapped.clear();
    this.orphaned.clear();
  }

  /**
   * Relève les traces du meneur et des véhicules de la colonne (un point tous les TRAIL_STEP m, en marche avant). En
   * marche arrière (demi-tour en plusieurs temps), les derniers points sont retirés : la trace ne fait pas d'aller-retour.
   */
  private recordTrails(lead: Vehicle | null): void {
    const ctx = this.ctx!;
    const ids = lead ? [lead.id, ...this.column, ...this.ride] : [];
    if (ids.length <= 1) {
      this.trails.clear();
      this.exitSorted = false;
      return;
    }
    for (const id of this.trails.keys()) if (ids.indexOf(id) < 0) this.trails.delete(id);
    for (const id of ids) {
      const v = ctx.vehicles.get(id);
      if (!v) continue;
      let tr = this.trails.get(id);
      if (!tr) {
        tr = [v.x, v.z];
        this.trails.set(id, tr);
        continue;
      }
      if (v.speed < -0.2) {
        while (tr.length > 2 && Math.hypot(tr[tr.length - 2]! - v.x, tr[tr.length - 1]! - v.z) < TRAIL_UNDO) tr.length -= 2;
        continue;
      }
      if (Math.hypot(tr[tr.length - 2]! - v.x, tr[tr.length - 1]! - v.z) < TRAIL_STEP) continue;
      tr.push(v.x, v.z);
      if (tr.length > TRAIL_MAX * 2) tr.splice(0, 2);
    }
  }

  /** Unités qui suivent le joueur : celles qu'il commande, et la sienne quand il conduit le véhicule de son groupe. */
  private followers(me: Person, out: Squad[]): void {
    out.length = 0;
    const ctx = this.ctx!;
    for (const s of ctx.squads.list) {
      if (s.faction === 'police' && s.leaderId === me.id && s.members.length > 1 && (s.order.type === 'suivre' || s.order.type === 'embarquer')) out.push(s);
    }
    if (me.squadId !== 0 && me.vehicleId !== 0) {
      const own = ctx.squads.get(me.squadId);
      if (own && own.vehicleId === me.vehicleId && out.indexOf(own) < 0) out.push(own);
    }
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const me = ctx.player.person();
    if (!me || me.faction !== 'police') return;
    const now = ctx.clock.now;
    const driving = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) ?? null : null;
    const isDriver = driving !== null && !driving.def.flying && driving.seats[0] === me.id;

    if (isDriver && this.mounted !== driving.id) {
      // le joueur prend le volant : la colonne « passager » devient la sienne
      this.ride = [];
      this.startConvoy(me, driving);
    } else if (!isDriver && this.mounted !== 0) this.endConvoy();
    // montée, descente : « Avec moi » le suit (au premier pas de la session, la place où la mise en place l'a laissé)
    if (me.vehicleId !== this.lastVehicle) {
      const was = this.lastVehicle;
      this.lastVehicle = me.vehicleId;
      if (was >= 0) this.onVehicleChange(me, was);
    }
    this.recordTrails(me.vehicleId !== 0 && driving && !driving.def.flying ? driving : null);

    // les unités qui l'accompagnent gardent leur embarquement (à chaque pas : redonné avant que personne ne descende)
    if (this.mounted !== 0 && this.escorts.length > 0) this.holdEscorts(me);
    // marche vers les véhicules (à chaque pas : l'IA de police réécrit les commandes avant nous)
    // (à pied aussi : équipiers d'une unité « en colonne » restés sans place, voir seatStragglers)
    if (this.mounted !== 0 || this.assign.size > 0) this.walkToSeats(me, now);
    if (now < this.nextThink) return;
    this.nextThink = now + 0.5;
    void dt;
    this.tendOrders(me, now);
    if (this.mounted === 0) {
      if (this.assign.size > 0) this.board(now);
      this.tendRide(me);
      return;
    }
    this.board(now);
    if (now - this.escortSince > ORPHAN_DELAY) this.seatOrphans(me, driving!, now);
    // unités « en colonne » arrivées entre-temps (venues en véhicules de loin, ou ordre donné en route) : elles prennent place dans la colonne
    if (now >= this.nextJoin) {
      this.nextJoin = now + JOIN_PERIOD;
      const mine: Squad[] = [];
      this.followers(me, mine);
      const before = this.escorts.length;
      const since = this.escortSince;
      this.gatherEscorts(me, driving!, mine);
      if (this.escorts.length === before) this.escortSince = since;
    }
    this.keepColumn(driving!);
  }

  /** Le joueur prend le volant : chaque équipier reçoit une place (son véhicule d'abord, puis la flotte). */
  private startConvoy(me: Person, lead: Vehicle): void {
    const ctx = this.ctx!;
    this.endConvoy();
    this.mounted = lead.id;
    const squads: Squad[] = [];
    this.followers(me, squads);
    if (squads.length === 0) return;
    const members: Person[] = [];
    for (const s of squads) {
      for (const id of s.members) {
        const p = ctx.people.get(id);
        if (p && !p.isPlayer && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down' && members.indexOf(p) < 0) members.push(p);
      }
    }
    if (members.length === 0) return;
    // places libres : véhicule du joueur, puis véhicules de police libres proches (motos et fourgons de l'unité)
    const fleet: Vehicle[] = [lead];
    const kinds = new Set<string>([lead.kind]);
    for (const s of squads) {
      const v = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
      if (v) kinds.add(v.kind);
    }
    const near: Vehicle[] = [];
    const rank = new Map<Vehicle, number>();
    for (const v of ctx.vehicles.list) {
      if (v === lead || v.state === 'wrecked' || v.state === 'burnt' || v.def.flying || !POLICE_FLEET.has(v.kind)) continue;
      // véhicules garés en réserve d'un commissariat : ils n'appartiennent qu'à leur unité du stock
      if (isHeldVehicle(ctx, v.id)) continue;
      if (v.seats.some((id) => id !== 0)) continue;
      const d = Math.hypot(v.x - lead.x, v.z - lead.z);
      if (d > FLEET_RADIUS) continue;
      // d'abord les véhicules du groupe, puis ceux du même type (motos de la BRAV-M), au plus près
      const own = squads.some((s) => s.vehicleId === v.id) ? 0 : kinds.has(v.kind) ? 1 : 2;
      if (own === 2) continue;
      near.push(v);
      rank.set(v, own * 1000 + d);
    }
    near.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    fleet.push(...near);
    let mi = 0;
    for (const v of fleet) {
      for (let seat = 0; seat < v.def.seats.length && mi < members.length; seat++) {
        if (v.seats[seat] !== 0) continue;
        const role = v.def.seats[seat]!.role === 'driver' ? 'driver' : 'passenger';
        // un véhicule de la flotte ne part qu'avec un conducteur : sa première place est le volant
        if (v !== lead && seat !== 0 && !this.hasDriver(v)) break;
        this.assign.set(members[mi]!.id, { vehicleId: v.id, role, seat, since: this.ctx!.clock.now });
        if (v !== lead && role === 'driver' && this.column.indexOf(v.id) < 0) this.column.push(v.id);
        mi++;
      }
      if (mi >= members.length) break;
    }
    this.gatherEscorts(me, lead, squads);
    this.departureOrder(this.column, lead);
    ctx.radio.say({ channel: 'unite', from: ctx.squads.get(me.squadId)?.name ?? 'UNITÉ', text: 'Embarquez, on part en colonne derrière moi.', priority: 1, personId: me.id });
  }

  /**
   * Unités qui accompagnent la colonne dans leurs propres véhicules : celles placées sous une unité du joueur (escorte,
   * groupes de sa section), et toute sa compagnie (wholeCompanies), même tenue en dispositif par un commandant IA —
   * sauf les unités au contact (inContact), qui restent à leur tâche.
   */
  private gatherEscorts(me: Person, lead: Vehicle, mine: readonly Squad[]): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const led = new Set<number>();
    for (const s of ctx.squads.list) if (s.faction === 'police' && s.leaderId === me.id) led.add(s.id);
    if (me.squadId !== 0) led.add(me.squadId);
    const company = this.rootOf(me.squadId);
    let companyFree = false;
    if (company !== 0 && TROOP_KINDS.has(lead.kind)) {
      const st = command ? command.stateOf(company) : null;
      companyFree = !st || st.phase === 'termine' || st.missionEnded || st.commanderId === me.id;
    }
    // engin (Centaure, canon à eau) : jamais seul — l'engin de même type le plus proche l'accompagne toujours
    let pair: Squad | null = null;
    if (lead.kind === 'centaure' || lead.kind === 'canon_eau') {
      let best = COMPANY_RADIUS * 1.5;
      for (const s of ctx.squads.list) {
        if (s.faction !== 'police' || s.vehicleId === 0 || s.vehicleId === lead.id || s.leaderId === me.id || mine.indexOf(s) >= 0) continue;
        const v = ctx.vehicles.get(s.vehicleId);
        if (!v || v.kind !== lead.kind || v.state === 'wrecked' || v.state === 'burnt') continue;
        const d = Math.hypot(v.x - lead.x, v.z - lead.z);
        if (d < best) { best = d; pair = s; }
      }
    }
    // « tout le monde me suit » : compagnies dont toute la colonne part avec le joueur (voir WHOLE_RADIUS)
    const whole = this.wholeCompanies(me, lead);
    const joining: Squad[] = [];
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || mine.indexOf(s) >= 0 || s.vehicleId === 0 || s.vehicleId === lead.id) continue;
      if (s.members.length === 0 || s.leaderId === me.id) continue;
      // unités en « Me suivre en colonne (véhicules) », elles-mêmes ou par une unité mère
      const root = this.motorRoot(s);
      const called = root !== 0;
      // (« Avec moi » ne le quitte pas : une unité qui le suivait à pied monte dans son fourgon quand il prend le volant)
      // la BRAV-M ne se met pas dans la colonne des fourgons : en selle, elle le suit à sa place, derrière (bravm.ts)
      if (this.apartBravm(s) !== 0) continue;
      // unité « en colonne » venue de loin : sa colonne roule encore vers le joueur (police.command), elle la laisse finir
      if (called && this.convoying(root)) continue;
      // un fourgon cellulaire reste au point de remise des interpellés (session/remise.ts) : il ne prend la colonne du
      // joueur que sur son ordre « en colonne » (à lui ou à son unité mère)
      if (!called && ctx.vehicles.get(s.vehicleId)?.kind === 'fourgon_cellulaire') continue;
      const under = this.underAny(s, led) || s === pair || called;
      // toute la compagnie, sauf les unités au contact (elles restent : le commandant IA les garde à leur tâche)
      const all = !under && whole.has(this.rootOf(s.id)) && !this.inContact(s);
      if (!under && !all && !(companyFree && this.rootOf(s.id) === company)) continue;
      // l'escorte à pied d'un blindé (session/engins.ts) part avec la colonne, dans son fourgon
      const guardsEngine = s.order.type === 'proteger' && ARMORED.has(ctx.vehicles.get(s.order.targetId)?.kind ?? '');
      // l'ordre « en colonne » est donné à l'unité mère : les groupes partent quel que soit leur ordre propre
      if (!FREE_ORDERS.has(s.order.type) && s !== pair && !guardsEngine && !called && !all) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || v.state === 'wrecked' || v.state === 'burnt' || v.def.flying || !POLICE_FLEET.has(v.kind) && !TROOP_KINDS.has(v.kind)) continue;
      if (Math.hypot(v.x - lead.x, v.z - lead.z) > (called ? MOTOR_RADIUS : all ? WHOLE_RADIUS : COMPANY_RADIUS)) continue;
      if (this.escorts.indexOf(s.id) >= 0) continue;
      // le véhicule doit être libre, ou déjà occupé par les siens (pour une unité « en colonne » : par son unité mère)
      if (v.seats.some((id) => id !== 0 && (called ? !this.inTree(id, root) : s.members.indexOf(id) < 0))) continue;
      joining.push(s);
    }
    // ordre de départ (le plus avancé d'abord) : personne ne double ni ne traverse le bloc pour prendre sa place
    const ids = joining.map((s) => s.vehicleId);
    this.departureOrder(ids, lead);
    joining.sort((a, b) => ids.indexOf(a.vehicleId) - ids.indexOf(b.vehicleId));
    for (const s of joining) {
      this.escorts.push(s.id);
      // (descendue, elle le suivra à pied avec le même ordre : « Avec moi » du joueur, ou la suite de la mise en place)
      this.escortBy.set(s.id, s.order.type === 'suivre' && s.order.byPlayer === true);
      if (this.column.indexOf(s.vehicleId) < 0) this.column.push(s.vehicleId);
    }
    // l'ordre d'embarquer est donné de haut en bas (la compagnie, puis ses groupes) : l'ordre d'une unité mère est copié
    // sur sa descendance (police/system.ts, handleOrder), et celui d'un groupe, traité avant le sien, était défait — le
    // groupe d'une section que commande le joueur retombait dans le « suivre » de sa section, « embarquer » affiché, et
    // l'agent dont la place venait d'être prise par l'état-major restait sur le trottoir (République, chef de section)
    const byDepth = joining.slice().sort((a, b) => this.depthOf(a) - this.depthOf(b));
    for (const s of byDepth) {
      // une unité déjà à bord (« en colonne ») n'est pas réembarquée
      if (!(this.motorRoot(s) !== 0 && s.order.type === 'embarquer')) ctx.squads.issue(s.id, { type: 'embarquer', issuedBy: me.id });
    }
    this.escortSince = ctx.clock.now;
  }

  /**
   * Compagnies (unités racines) dont toute la colonne suit le véhicule du joueur (voir CONTACT_ORDERS) : la sienne, et,
   * pour un équipage ou une équipe rattachée à aucune compagnie, la compagnie engagée sur place la plus proche. Aucune
   * pour l'équipage du Centaure (l'engin apparié seul) ni pour un aéronef ; la seule unité du joueur pour la BRAV-M.
   */
  private wholeCompanies(me: Person, lead: Vehicle): Set<number> {
    const ctx = this.ctx!;
    const out = new Set<number>();
    const role = ctx.player.state.role;
    // (seulement au volant d'un véhicule de police : une voiture civile ne fait pas partir la compagnie ; jamais derrière
    // la voiture d'un équipage de patrouille, qui n'appartient à aucune compagnie)
    if (role === 'gendarme_centaure' || role === 'patrouille' || lead.def.flying || me.squadId === 0 || (!POLICE_FLEET.has(lead.kind) && !TROOP_KINDS.has(lead.kind))) return out;
    const own = this.rootOf(me.squadId);
    if (own !== 0) out.add(own);
    const root = ctx.squads.get(own);
    if (role === 'bravm' || (root && root.kind === 'compagnie')) return out;
    let best = 0;
    let bestD = WHOLE_RADIUS;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.parentId !== 0 || s.kind !== 'compagnie' || s.id === own) continue;
      const p = ctx.people.get(s.leaderId) ?? (s.members.length > 0 ? ctx.people.get(s.members[0]!) : undefined);
      const v = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
      const at = p ?? v;
      if (!at) continue;
      const d = Math.hypot(at.x - lead.x, at.z - lead.z);
      if (d < bestD) { bestD = d; best = s.id; }
    }
    if (best !== 0) out.add(best);
    return out;
  }

  /**
   * L'unité est-elle au contact (elle reste quand la colonne part) ? Ordre d'engagement en cours, un équipier qui tient
   * ou emmène quelqu'un, ou barrage, ligne, nasse tenus avec des manifestants tout près.
   */
  private inContact(s: Squad): boolean {
    const ctx = this.ctx!;
    const type = s.order.type;
    if (CONTACT_ORDERS.has(type)) return true;
    // escorte d'un interpellé (et non d'un véhicule)
    if (type === 'escorter' && s.order.targetId !== 0 && ctx.people.get(s.order.targetId)) return true;
    for (const id of s.members) {
      const p = ctx.people.get(id);
      if (p && p.carrying !== 0) return true;
    }
    if (!HOLD_ORDERS.has(type)) return false;
    const lead = ctx.people.get(s.leaderId) ?? (s.members.length > 0 ? ctx.people.get(s.members[0]!) : undefined);
    if (!lead) return false;
    const near = this.near;
    near.length = 0;
    ctx.people.queryRadius(lead.x, lead.z, CONTACT_RADIUS, near, (p) => p.faction === 'protest' && p.custody === 'free' && p.posture !== 'down');
    const hit = near.length > 0;
    near.length = 0;
    return hit;
  }

  private readonly near: Person[] = [];
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;
  private readonly hit: RayHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

  /**
   * BRAV-M du dispositif (unité spéciale de police.command) dont fait partie cette unité, quand le joueur n'en est pas :
   * elle ne prend jamais place dans la colonne des fourgons — en selle, elle suit le joueur elle-même, à sa place
   * derrière lui (bravm.ts, « suivre ») ; sans cela ses motos s'intercalaient entre les fourgons. 0 : aucune.
   */
  private apartBravm(s: Squad): number {
    const ctx = this.ctx!;
    const cmd = ctx.service<CommandLike>('police.command');
    if (!cmd || !cmd.special) return 0;
    const me = ctx.player.person();
    let q: Squad | undefined = s;
    for (let guard = 0; q && guard < 8; guard++) {
      const sp = cmd.special(q.id);
      if (sp && sp.kind === 'bravm') return me && me.squadId !== 0 && this.isUnder(me.squadId, q.id) ? 0 : q.id;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) ?? undefined : undefined;
    }
    return 0;
  }

  /** Unité « en colonne » dont celle-ci fait partie (elle-même ou une unité mère) ; 0 si aucune. */
  private motorRoot(s: Squad): number {
    const ctx = this.ctx!;
    // un fourgon cellulaire reste au point de remise des interpellés (session/remise.ts) : seul un ordre « en colonne »
    // donné à lui-même l'emmène, jamais celui donné à sa compagnie (il venait se mettre dans la colonne du commandant,
    // en travers de la sortie de ses fourgons)
    if (this.cellCrew(s)) return this.motor.has(s.id) ? s.id : 0;
    // la BRAV-M non plus : elle suit en selle, hors de la colonne des fourgons (apartBravm)
    const bravm = this.apartBravm(s);
    let q: Squad | undefined = s;
    for (let guard = 0; q && guard < 8; guard++) {
      if (q.id !== bravm && this.motor.has(q.id)) return q.id;
      // branche détachée de la colonne par un autre ordre
      if (this.detached.has(q.id)) return 0;
      if (q.id === bravm) return 0;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) ?? undefined : undefined;
    }
    return 0;
  }

  /** Ordre qu'un fourgon cellulaire ne garde pas (voir restoreApart) : colonne, ou « suivre » le joueur. */
  private cellNeutral(o: Squad['order']): boolean {
    const me = this.ctx!.player.person();
    return o.type === 'debarquer' || o.type === 'embarquer' || (o.type === 'suivre' && !!me && o.targetId === me.id);
  }

  /** Équipage d'un fourgon cellulaire (il transporte les interpellés, ne suit la colonne que sur son propre ordre). */
  private cellCrew(s: Squad): boolean {
    return s.kind === 'equipage' && s.vehicleId !== 0 && this.ctx!.vehicles.get(s.vehicleId)?.kind === 'fourgon_cellulaire';
  }

  /** Branches de l'unité « en colonne » encore dans la colonne (sans les branches détachées par un autre ordre). */
  private columnTree(rootId: number): Squad[] {
    return this.tree(rootId, []).filter((q) => this.motorRoot(q) === rootId);
  }

  /** L'unité `id` est-elle `rootId` ou placée sous elle ? */
  private isUnder(id: number, rootId: number): boolean {
    const ctx = this.ctx!;
    let q = ctx.squads.get(id);
    for (let guard = 0; q && guard < 8; guard++) {
      if (q.id === rootId) return true;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
    }
    return false;
  }

  /** La personne appartient-elle à l'unité `rootId` ou à l'une de ses subordonnées ? */
  private inTree(personId: EntityId, rootId: number): boolean {
    const p = this.ctx!.people.get(personId);
    return !!p && p.squadId !== 0 && this.isUnder(p.squadId, rootId);
  }

  /** L'unité et ses subordonnées. */
  private tree(rootId: number, out: Squad[]): Squad[] {
    out.length = 0;
    for (const q of this.ctx!.squads.list) if (this.isUnder(q.id, rootId)) out.push(q);
    return out;
  }

  /** Véhicules utilisables de l'unité et de ses subordonnées (motos de la BRAV-M comprises). */
  private fleetOf(rootId: number): Vehicle[] {
    const ctx = this.ctx!;
    const out: Vehicle[] = [];
    for (const q of this.motor.has(rootId) ? this.columnTree(rootId) : this.tree(rootId, [])) {
      const v = q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
      if (!v || out.indexOf(v) >= 0 || v.def.flying || v.state === 'wrecked' || v.state === 'burnt') continue;
      if (!POLICE_FLEET.has(v.kind) && !TROOP_KINDS.has(v.kind)) continue;
      out.push(v);
    }
    // BRAV-M : les motos de l'unité garées avec la sienne sans être attribuées à une unité (une par binôme, seule la
    // première porte l'indicatif de l'unité) — sinon quatre équipiers sur six restaient à pied
    if (out.some((v) => v.kind === 'moto_bravm')) {
      const owned = new Set<EntityId>();
      for (const q of ctx.squads.list) if (q.vehicleId !== 0) owned.add(q.vehicleId);
      const tree = this.tree(rootId, []);
      for (const v of ctx.vehicles.list) {
        if (v.kind !== 'moto_bravm' || owned.has(v.id) || out.indexOf(v) >= 0 || v.state === 'wrecked' || v.state === 'burnt') continue;
        if (isHeldVehicle(ctx, v.id)) continue;
        if (!out.some((o) => o.kind === 'moto_bravm' && Math.hypot(o.x - v.x, o.z - v.z) < FLEET_RADIUS)) continue;
        if (v.seats.some((id) => id !== 0 && !tree.some((q) => q.members.indexOf(id) >= 0))) continue;
        out.push(v);
      }
    }
    return out;
  }

  /**
   * Équipiers de l'unité « en colonne » restés à pied quand l'IA de police a terminé l'embarquement (places de leur
   * véhicule prises, motos de binôme, équipage d'engin que l'IA tient pour déjà à bord) : chacun reçoit une place libre
   * dans les véhicules de l'unité — le volant d'abord pour un véhicule sans conducteur — et y court (walkToSeats).
   * Retourne le nombre d'équipiers placés.
   */
  private seatStragglers(rootId: number, now: number): number {
    const ctx = this.ctx!;
    const fleet = this.fleetOf(rootId);
    const taken = new Set<string>();
    for (const a of this.assign.values()) taken.add(`${a.vehicleId}:${a.seat}`);
    let n = 0;
    for (const q of this.columnTree(rootId)) {
      for (const id of q.members) {
        const p = ctx.people.get(id);
        if (!p || p.isPlayer || p.vehicleId !== 0 || p.custody !== 'free' || p.posture === 'down' || this.assign.has(p.id)) continue;
        let done = false;
        for (const v of fleet) {
          for (let seat = 0; seat < v.def.seats.length && !done; seat++) {
            if (v.seats[seat] !== 0 || taken.has(`${v.id}:${seat}`)) continue;
            const driverSeat = v.def.seats[seat]!.role === 'driver';
            // un véhicule ne part qu'avec un conducteur : sa première place est le volant
            if (!driverSeat && v.seats[0] === 0 && !taken.has(`${v.id}:0`)) continue;
            taken.add(`${v.id}:${seat}`);
            this.assign.set(p.id, { vehicleId: v.id, role: driverSeat ? 'driver' : 'passenger', seat, since: now });
            done = true;
          }
          if (done) break;
        }
        if (done) n++;
      }
    }
    return n;
  }

  /**
   * Équipiers restés sans place quand toute la compagnie part derrière le joueur : unité sans véhicule (équipe drone
   * ICARE), état-major du commandant plus nombreux que les places du VL qu'il conduit. L'ordre « embarquer » donné à la
   * compagnie envoyait l'équipe drone vers le VL de commandement, déjà plein — elle restait plantée devant son capot, le
   * VL (premier de la colonne) l'attendait, et toute la colonne avec lui ; les opérateurs de l'état-major restaient sur
   * le trottoir. Chacun reçoit, une fois par départ, une place passager dans le véhicule de la colonne le plus proche qui
   * en a (pas celui du joueur, déjà plein, ni le fourgon cellulaire, gardé pour les interpellés ; places des équipiers
   * du véhicule encore en chemin réservées) : il y court en contournant les véhicules garés (walkToSeats) et ce véhicule
   * l'attend avant de prendre sa place dans la colonne (keepColumn). Les unités au contact ou qui suivent le joueur à
   * pied ne sont pas concernées.
   */
  private seatOrphans(me: Person, lead: Vehicle, now: number): void {
    const ctx = this.ctx!;
    const mine: Squad[] = [];
    this.followers(me, mine);
    // (la compagnie entière quand elle part avec le joueur ; sinon ses seules unités — équipage du Centaure : personne
    // d'autre ne monte dans l'engin apparié)
    const roots = this.wholeCompanies(me, lead);
    if (roots.size === 0 && mine.length === 0) return;
    const fleet: Vehicle[] = [];
    for (const id of this.column) {
      const v = ctx.vehicles.get(id);
      if (v && v !== lead && v.kind !== 'fourgon_cellulaire' && v.state !== 'wrecked' && v.state !== 'burnt') fleet.push(v);
    }
    if (fleet.length === 0) return;
    // places libres de chaque véhicule : passagers, moins celles déjà attribuées et celles de ses équipiers en chemin
    const free = new Map<Vehicle, number>();
    for (const v of fleet) {
      let n = 0;
      for (let seat = 0; seat < v.def.seats.length; seat++) if (v.seats[seat] === 0 && v.def.seats[seat]!.role !== 'driver') n++;
      for (const a of this.assign.values()) if (a.vehicleId === v.id && v.seats[a.seat] === 0) n--;
      for (const o of ctx.squads.list) {
        if (o.vehicleId !== v.id) continue;
        for (const id of o.members) {
          const p = ctx.people.get(id);
          if (p && !p.isPlayer && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down' && !this.assign.has(p.id)) n--;
        }
      }
      free.set(v, n);
    }
    for (const q of ctx.squads.list) {
      const own = mine.indexOf(q) >= 0;
      if (q.faction !== 'police' || (!own && !roots.has(this.rootOf(q.id)))) continue;
      // l'unité a son propre véhicule (l'IA de police l'y fait monter), ou elle est « en colonne » (voir seatStragglers)
      if (q.vehicleId !== 0 && q.vehicleId !== lead.id) {
        const v = ctx.vehicles.get(q.vehicleId);
        if (v && v.state !== 'wrecked' && v.state !== 'burnt') continue;
      }
      if (this.motorRoot(q) !== 0) continue;
      if (!own && (this.inContact(q) || this.apartBravm(q) !== 0 || (!FREE_ORDERS.has(q.order.type) && q.order.type !== 'embarquer'))) continue;
      for (const id of q.members) {
        const p = ctx.people.get(id);
        if (!p || p.isPlayer || p.vehicleId !== 0 || p.custody !== 'free' || p.posture === 'down' || this.assign.has(p.id)) continue;
        // le chauffeur du véhicule que le joueur conduit reste à côté : il reprend le volant quand le joueur le lui rend
        if (own && q.vehicleId === lead.id && p.poste === 'conducteur') continue;
        // deux essais au plus (un autre véhicule si le premier n'a pas pu être rejoint) : un équipier qui n'y arrive pas
        // ne retient pas la colonne indéfiniment
        const tried = this.orphaned.get(p.id) ?? [];
        if (tried.length >= ORPHAN_TRIES) continue;
        let best: Vehicle | null = null;
        let bestD = ORPHAN_RADIUS;
        for (const v of fleet) {
          const d = Math.hypot(v.x - p.x, v.z - p.z);
          if (d < bestD && (free.get(v) ?? 0) > 0 && tried.indexOf(v.id) < 0) { best = v; bestD = d; }
        }
        if (!best) continue;
        let seat = 0;
        while (seat < best.def.seats.length && (best.seats[seat] !== 0 || best.def.seats[seat]!.role === 'driver' || this.seatTaken(best.id, seat))) seat++;
        if (seat >= best.def.seats.length) continue;
        free.set(best, (free.get(best) ?? 0) - 1);
        tried.push(best.id);
        this.orphaned.set(p.id, tried);
        this.assign.set(p.id, { vehicleId: best.id, role: 'passenger', seat, since: now });
      }
    }
  }

  /** Place déjà attribuée à un équipier (voir assign) ? */
  private seatTaken(vehicleId: EntityId, seat: number): boolean {
    for (const a of this.assign.values()) if (a.vehicleId === vehicleId && a.seat === seat) return true;
    return false;
  }

  /** Équipiers de l'unité qui courent encore vers la place attribuée (seatStragglers), délai non écoulé. */
  private seating(rootId: number, now: number): boolean {
    const ctx = this.ctx!;
    for (const [id, a] of this.assign) {
      const p = ctx.people.get(id);
      if (p && p.vehicleId === 0 && now - a.since <= BOARD_TIMEOUT && p.squadId !== 0 && this.isUnder(p.squadId, rootId)) return true;
    }
    return false;
  }

  /**
   * Membres de l'unité et de ses subordonnées encore à pied (valides, libres), et à bord — les conducteurs à bord ne
   * comptent pas (ils restent aux véhicules quand l'unité met pied à terre).
   */
  private crewCount(rootId: number): { onFoot: number; aboard: number } {
    const ctx = this.ctx!;
    let onFoot = 0;
    let aboard = 0;
    for (const q of this.motor.has(rootId) ? this.columnTree(rootId) : this.tree(rootId, [])) {
      for (const id of q.members) {
        const p = ctx.people.get(id);
        if (!p || p.isPlayer) continue;
        if (p.vehicleId !== 0) {
          // (l'équipage d'un engin reste à son poste ; celui d'une voiture de patrouille descend avec le joueur, le
          // conducteur compris : personne ne garde la voiture)
          if (this.patrolCrew(q) || (p.poste !== 'conducteur' && q.kind !== 'equipage')) aboard++;
        } else if (p.custody === 'free' && p.posture !== 'down') onFoot++;
      }
    }
    return { onFoot, aboard };
  }

  /** Équipage de la voiture de patrouille du joueur (rôle 'patrouille') : il met pied à terre avec lui. */
  private patrolCrew(q: Squad): boolean {
    const ctx = this.ctx!;
    return q.kind === 'equipage' && ctx.session.config?.role === 'patrouille' && q.id === ctx.player.person()?.squadId;
  }

  /** Mouvement motorisé de l'unité encore en cours (police.command : elle vient de loin rejoindre le joueur). */
  private convoying(squadId: number): boolean {
    const cmd = this.ctx!.service<CommandLike>('police.command');
    const st = cmd && cmd.convoyOf ? cmd.convoyOf(squadId) : null;
    return !!st && CONVOY_BUSY.has(st.stage);
  }

  private distTo(vehicleId: EntityId, lead: Vehicle): number {
    const v = this.ctx!.vehicles.get(vehicleId);
    return v ? Math.hypot(v.x - lead.x, v.z - lead.z) : Infinity;
  }

  /**
   * Ordre de départ de la colonne (trié en place) : véhicules orientés dans le même sens (garés en bloc ou en file), le
   * plus avancé d'abord — chacun part derrière celui qui le précède dans sa file, personne ne traverse le bloc ; sinon,
   * au plus près du meneur d'abord.
   */
  private departureOrder(ids: EntityId[], lead: Vehicle): void {
    const ctx = this.ctx!;
    let hx = 0;
    let hz = 0;
    let n = 0;
    for (const id of ids) {
      const v = ctx.vehicles.get(id);
      if (!v) continue;
      hx += Math.sin(v.heading);
      hz += Math.cos(v.heading);
      n++;
    }
    const len = Math.hypot(hx, hz);
    const aligned = n > 1 && len > n * 0.85;
    const key = new Map<EntityId, number>();
    for (const id of ids) {
      const v = ctx.vehicles.get(id);
      const d = this.distTo(id, lead);
      key.set(id, !v ? Infinity : aligned ? -((v.x * hx + v.z * hz) / len) + d * 1e-3 : d);
    }
    ids.sort((a, b) => key.get(a)! - key.get(b)!);
  }

  /**
   * Ordre de sortie du stationnement, une fois le meneur parti (à DEPART_MOVE m de sa place) : comme la colonne de début
   * de journée (police/command/convoy.ts, orderForDeparture), on part dans l'ordre PHYSIQUE — d'abord le véhicule encore
   * garé le plus avancé vers la sortie (la trace du meneur, à une quarantaine de mètres du bloc) parmi ceux dont la sortie
   * est libre (aucun véhicule garé juste devant lui), puis de même parmi ceux qui restent. Les véhicules déjà en route
   * gardent leur place en tête. Sans cela, le premier de la liste (le plus avancé dans l'axe du bloc, parfois à l'autre
   * bout, ou enfermé) partait en premier et tous les autres l'attendaient.
   */
  private exitOrder(ids: EntityId[], lead: Vehicle): void {
    const ctx = this.ctx!;
    const trail = this.trails.get(lead.id);
    if (!trail || trail.length < 4) return;
    const parked: Vehicle[] = [];
    const rolling: EntityId[] = [];
    for (const id of ids) {
      const v = ctx.vehicles.get(id);
      const t0 = this.trails.get(id);
      if (v && Math.abs(v.speed) < 0.5 && (!t0 || Math.hypot(v.x - t0[0]!, v.z - t0[1]!) < 3)) parked.push(v);
      else rolling.push(id);
    }
    if (parked.length < 2) return;
    let cx = 0;
    let cz = 0;
    for (const v of parked) { cx += v.x; cz += v.z; }
    cx /= parked.length;
    cz /= parked.length;
    // direction de la sortie : point de la trace du meneur à une quarantaine de mètres du bloc
    let ex = trail[trail.length - 2]! - cx;
    let ez = trail[trail.length - 1]! - cz;
    for (let i = 0; i < trail.length; i += 2) {
      if (Math.hypot(trail[i]! - cx, trail[i + 1]! - cz) > 40) {
        ex = trail[i]! - cx;
        ez = trail[i + 1]! - cz;
        break;
      }
    }
    const l = Math.hypot(ex, ez);
    if (l < 1) return;
    const fx = ex / l;
    const fz = ez / l;
    const out: EntityId[] = [];
    const rest = parked.slice();
    while (rest.length > 0) {
      let pick = -1;
      let best = -Infinity;
      for (let i = 0; i < rest.length; i++) {
        const v = rest[i]!;
        const k = (v.x - cx) * fx + (v.z - cz) * fz - (this.boxedIn(v, rest) ? 1e4 : 0);
        if (k > best) { best = k; pick = i; }
      }
      out.push(rest.splice(pick, 1)[0]!.id);
    }
    ids.length = 0;
    ids.push(...rolling, ...out);
  }

  /** Un véhicule de `others` est-il garé juste devant celui-ci, dans son axe (sortie barrée) ? */
  private boxedIn(v: Vehicle, others: readonly Vehicle[]): boolean {
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    for (const o of others) {
      if (o === v) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const ahead = dx * fx + dz * fz - (v.def.length + o.def.length) * 0.5;
      if (ahead < -0.5 || ahead > BOXED_AHEAD) continue;
      if (Math.abs(-dx * fz + dz * fx) < BOXED_SIDE + o.def.width * 0.5) return true;
    }
    return false;
  }

  /** Le meneur a-t-il quitté sa place (DEPART_MOVE m depuis le début de sa trace) ? */
  private departed(lead: Vehicle): boolean {
    const trail = this.trails.get(lead.id);
    return !!trail && Math.hypot(lead.x - trail[0]!, lead.z - trail[1]!) >= DEPART_MOVE;
  }

  /** Le meneur est-il parti de sa place (DEPART_MOVE m) ? On ordonne alors une fois la sortie du stationnement. */
  private sortExit(ids: EntityId[], lead: Vehicle): void {
    if (this.exitSorted) return;
    if (!this.departed(lead)) return;
    this.exitSorted = true;
    this.exitOrder(ids, lead);
  }

  /**
   * Le véhicule peut-il prendre (ou garder) la suite de `prev` ? Le premier, s'il est garé en bloc (un véhicule juste
   * devant lui), attend que le meneur se soit dégagé : il le rejoindra par les rues.
   */
  private mayFollow(v: Vehicle, prev: EntityId, lead: Vehicle, st: Readonly<{ mode: string; leaderId: EntityId }> | null, hold = false): boolean {
    // `hold` (le joueur conduit) : encore garé près du meneur qui n'est pas parti, il reste à sa place jusqu'au départ (la
    // sortie du stationnement se fait alors dans l'ordre, voir sortExit). À République, un fourgon de l'autre file du bloc, garé 50 m plus
    // loin, venait se ranger derrière le VL arrêté du joueur — en travers de la sortie du fourgon garé à côté du VL,
    // qui le suivait : chacun attendait l'autre, et la colonne restait au stationnement.
    if (hold && (!st || st.mode !== 'follow') && Math.abs(v.speed) < 0.5 && !this.departed(lead)
      && Math.hypot(v.x - lead.x, v.z - lead.z) < FLEET_RADIUS) return false;
    if (prev !== lead.id || (st && st.mode === 'follow' && st.leaderId === prev)) return true;
    return Math.hypot(v.x - lead.x, v.z - lead.z) > FIRST_ENGAGE || !this.boxed(v, lead);
  }

  /** Un autre véhicule (hors meneur) est-il arrêté juste devant celui-ci, dans son axe ? */
  private boxed(v: Vehicle, lead: Vehicle): boolean {
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    for (const o of this.ctx!.vehicles.list) {
      if (o === v || o === lead || o.def.flying || Math.abs(o.speed) > 0.5) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const ahead = dx * fx + dz * fz - (v.def.length + o.def.length) * 0.5;
      if (ahead < -0.5 || ahead > BOXED_AHEAD) continue;
      if (Math.abs(-dx * fz + dz * fx) < BOXED_SIDE + o.def.width * 0.5) return true;
    }
    return false;
  }

  // ───────────────────────────── ordres du joueur ─────────────────────────────

  /**
   * « Me suivre en colonne (véhicules) » — « Avec moi » quand le joueur est en véhicule (aussi quand il monte en
   * passager alors que l'unité le suivait à pied : elle ne le quitte pas). `byPlayer` : l'ordre est-il du joueur
   * (« Avec moi », la roue, la carte) ou la suite de son « suivre » de mise en place.
   */
  private orderColumn(squadId: number, opts: { byPlayer?: boolean } = {}): boolean {
    const ctx = this.ctx;
    const me = ctx ? ctx.player.person() : null;
    const s = ctx ? ctx.squads.get(squadId) : undefined;
    if (!ctx || !me || !s) return false;
    const byPlayer = opts.byPlayer !== false;
    // la BRAV-M ne se range pas dans la colonne des fourgons : en selle, elle suit le joueur elle-même (bravm.ts)
    if (this.apartBravm(s) === s.id) {
      ctx.squads.issue(squadId, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...(byPlayer ? { byPlayer: true } : {}) });
      return true;
    }
    if (this.fleetOf(squadId).length === 0) return false;
    this.dismount.delete(squadId);
    this.incoming.delete(squadId);
    // déjà « en colonne » par son unité mère : rien de plus (sauf une branche qui garde son propre ordre du joueur — l'ordre
    // de l'unité mère ne l'a pas remplacé, sim/police/system.ts handleOrder : elle est appelée pour elle-même)
    const root = this.motorRoot(s);
    if (root !== 0 && root !== squadId && s.order.type === 'embarquer') return true;
    for (const id of [...this.motor.keys()]) if (id !== squadId && this.isUnder(id, squadId)) this.motor.delete(id);
    for (const id of [...this.dismount.keys()]) if (this.isUnder(id, squadId)) this.dismount.delete(id);
    for (const id of [...this.incoming.keys()]) if (this.isUnder(id, squadId)) this.incoming.delete(id);
    for (const id of [...this.detached]) if (this.isUnder(id, squadId)) this.detached.delete(id);
    this.motor.set(squadId, { since: ctx.clock.now, ready: false, boarded: false, byPlayer });
    // ordre déjà donné (colonne lancée de loin par police.command) : on ne relance pas l'embarquement
    if (s.order.type !== 'embarquer') {
      const spared = this.spareApart(squadId);
      ctx.squads.issue(squadId, { type: 'embarquer', issuedBy: me.id, ...(byPlayer ? { byPlayer: true } : {}) });
      this.restoreApart(spared, byPlayer);
    }
    // le joueur conduit déjà : l'unité prend place dans sa colonne à la prochaine revue
    this.nextJoin = 0;
    return true;
  }

  /**
   * « Me suivre à pied » — « Avec moi » quand le joueur est à pied. L'unité quitte la colonne, descend si elle est à
   * bord, puis le suit ; ses branches trop loin pour venir à pied (direct/travel.ts, motorizes : plus de 450 m, ou
   * 150 m quand elles sont dans leurs fourgons) viennent dans leurs véhicules et le suivent une fois descendues.
   * `byPlayer` : ordre du joueur (défaut), ou la suite naturelle d'une colonne qu'il menait (comme la mise en place).
   */
  private orderOnFoot(squadId: number, byPlayer = true): void {
    const ctx = this.ctx;
    const me = ctx ? ctx.player.person() : null;
    const s = ctx ? ctx.squads.get(squadId) : undefined;
    if (!ctx || !me || !s) return;
    this.leaveColumn(squadId);
    for (const id of [...this.incoming.keys()]) if (this.isUnder(id, squadId)) this.incoming.delete(id);
    const flag = byPlayer ? { byPlayer: true as const } : {};
    // la BRAV-M choisit elle-même : en selle derrière lui s'il est loin ou roule, pied à terre près de lui (bravm.ts)
    if (this.apartBravm(s) === s.id) {
      ctx.squads.issue(squadId, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...flag });
      return;
    }
    const spared = this.spareApart(squadId);
    const crew = this.crewCount(squadId);
    // (presque tout le monde déjà à pied — l'état-major resté dans le véhicule de commandement : « suivre » tout de
    // suite, ceux qui sont assis descendent d'eux-mêmes ; sans cela chaque « Avec moi » commençait par une à deux
    // secondes de « débarquez » pour toute la compagnie, affichée « Personne avec vous »)
    if (crew.aboard > 0 && crew.aboard * 2 >= crew.aboard + crew.onFoot) {
      // à bord : on descend d'abord, à côté du véhicule de l'unité (ou du premier de ses véhicules)
      const v = (s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined) ?? this.fleetOf(squadId)[0];
      const side = v ? v.heading + Math.PI / 2 : 0;
      const x = v ? v.x + Math.sin(side) * 4 : me.x;
      const z = v ? v.z + Math.cos(side) * 4 : me.z;
      ctx.squads.issue(squadId, { type: 'debarquer', x, z, heading: v ? v.heading : me.heading, width: 0, issuedBy: me.id, ...flag });
      this.dismount.set(squadId, { since: ctx.clock.now, byPlayer });
      this.restoreApart(spared, byPlayer);
      return;
    }
    // « Avec moi » est un ordre du joueur (byPlayer) : il ramène aussi les sections qui tenaient une rue sur son ordre
    ctx.squads.issue(squadId, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...flag });
    this.restoreApart(spared, byPlayer);
    // (au pas suivant : l'ordre de l'unité mère, copié sur toute sa descendance par le module de police, remplacerait
    // sinon la mise en route des branches lointaines)
    if (me.vehicleId === 0) this.later(() => { if (ctx.squads.get(squadId) && s.order.type === 'suivre') this.callFar(s, me, byPlayer); });
  }

  /** Action reportée au prochain passage de tendOrders (le module de police a traité les ordres donnés entre-temps). */
  private later(run: () => void): void {
    this.deferred.push({ at: this.ctx!.clock.now, run });
  }

  /**
   * Avant un ordre donné à toute une unité : ses fourgons cellulaires (ils restent au point de remise des interpellés,
   * session/remise.ts) et sa BRAV-M (elle suit le joueur en selle, à part) garderont leur ordre — l'ordre de l'unité
   * mère, copié sur toute sa descendance, les emmenait (« Avec moi » envoyait le fourgon cellulaire derrière le
   * commandant, qui ne servait plus aux interpellations). Rend leurs ordres d'avant.
   */
  private spareApart(squadId: number): { squad: Squad; order: Squad['order'] }[] {
    const out: { squad: Squad; order: Squad['order'] }[] = [];
    for (const q of this.tree(squadId, [])) {
      if (q.id === squadId) continue;
      if (this.cellCrew(q) || this.apartBravm(q) === q.id) out.push({ squad: q, order: { ...q.order } });
    }
    return out;
  }

  /**
   * Après cet ordre : chaque fourgon cellulaire reprend son ordre d'avant ; la BRAV-M reçoit « suivre » le joueur (en
   * selle, à sa place derrière lui, ou à pied près de lui — bravm.ts), avec le même marqueur d'ordre du joueur.
   */
  private restoreApart(spared: readonly { squad: Squad; order: Squad['order'] }[], byPlayer: boolean): void {
    const ctx = this.ctx!;
    for (const { squad, order } of spared) {
      if (!ctx.squads.get(squad.id)) continue;
      if (this.cellCrew(squad)) {
        // (après que le module de police a copié l'ordre de l'unité mère sur sa descendance : au pas suivant ; un ordre de
        // colonne — embarquer, débarquer — ou « suivre » le joueur n'est pas redonné : l'équipage reste à bord, à sa
        // place — « suivre » un joueur qui monte en véhicule mettrait le fourgon cellulaire derrière le sien)
        const o: Partial<Squad['order']> & { type: Squad['order']['type'] } = this.cellNeutral(order)
          ? { type: 'libre', issuedBy: 0 }
          : { ...order };
        delete (o as { issuedAt?: number }).issuedAt;
        this.later(() => { if (ctx.squads.get(squad.id)) ctx.squads.issue(squad.id, o); });
      } else {
        // (l'ordre de l'unité mère lui est relayé au pas suivant par police.command — special.ts relayFrom : « suivre »
        // est vérifié et redonné après ce relais, voir tendOrders)
        this.bravmDue.set(squad.id, { byPlayer, until: ctx.clock.now + 3 });
      }
    }
  }

  /**
   * « Avec moi » à pied : les branches de l'unité trop loin pour venir à pied (même règle que la fiche et le terrain,
   * direct/travel.ts motorizes) viennent dans leurs véhicules jusqu'à lui (police.command.arrive, colonne qui
   * débarque près de lui), puis le suivent à pied (tendOrders). Sans cela, des sections à 400–960 m faisaient tout
   * le chemin à pied (« Avec moi » du commandant : 0 à 5 groupes sur 12 autour de lui une minute après).
   */
  private callFar(s: Squad, me: Person, byPlayer: boolean): void {
    const ctx = this.ctx!;
    const cmd = ctx.service<CommandLike>('police.command');
    if (!cmd || typeof cmd.arrive !== 'function') return;
    const far: Squad[] = [];
    const visit = (q: Squad, depth: number): void => {
      for (const c of ctx.squads.childrenOf(q.id)) {
        if (c.faction !== 'police' || this.cellCrew(c) || this.apartBravm(c) !== 0) continue;
        // (l'unité du joueur, et celles qui le contiennent, viennent à pied avec lui)
        if (me.squadId !== 0 && this.isUnder(me.squadId, c.id)) {
          if (depth < 8) visit(c, depth + 1);
          continue;
        }
        if (this.drivesHere(c, me)) far.push(c);
        else if (depth < 8) visit(c, depth + 1);
      }
    };
    visit(s, 0);
    if (s.id !== me.squadId && !(me.squadId !== 0 && this.isUnder(me.squadId, s.id)) && this.drivesHere(s, me)) {
      far.length = 0;
      far.push(s);
    }
    const now = ctx.clock.now;
    for (const q of far) {
      const lead = this.leadOf(q);
      const heading = lead ? Math.atan2(me.x - lead.x, me.z - lead.z) : me.heading;
      // (la colonne se gare sur la chaussée à une quarantaine de mètres de lui, de son côté : pas au milieu de ceux qui
      // l'entourent déjà)
      let x = me.x, z = me.z;
      if (lead) {
        const d = Math.hypot(lead.x - me.x, lead.z - me.z) || 1;
        const cx = me.x + ((lead.x - me.x) / d) * CALL_STOP, cz = me.z + ((lead.z - me.z) / d) * CALL_STOP;
        if (ctx.world.nearestRoad(cx, cz, this.road, CALL_ROAD)) {
          x = this.road.x;
          z = this.road.z;
        }
      }
      if (!cmd.arrive(q.id, { x, z, heading, layout: 'file', boardFirst: true, stagger: true, disembark: true })) continue;
      this.incoming.set(q.id, { since: now, byPlayer });
      ctx.radio.say({
        channel: 'commandement', from: q.name, priority: 1, personId: q.leaderId, reply: true,
        text: `ICI ${q.name.toUpperCase()}. REÇU, trop loin à pied : on vient en fourgons. TERMINÉ.`,
      });
    }
  }

  /**
   * Branche appelée par « Avec moi » qui vient en fourgons (callFar), colonne encore en route : chaque groupe dont le
   * fourgon est arrêté à portée de marche du joueur (SEATED_DRIVE_MIN : la fiche dirait « à pied »), ou qui, à moins de
   * INCOMING_WALK m, ne s'est plus rapproché de lui depuis INCOMING_STALL s (embouteillage, itinéraire qui repart pour un
   * détour d'un kilomètre), met pied à terre et finit à pied : il quitte la colonne (police.command.takeOver, son
   * fourgon s'arrête là) et reçoit « suivre ». Sans cela la colonne ne débarquait qu'une fois TOUS ses fourgons arrivés :
   * le premier groupe attendait assis à quarante mètres du commandant, les deux autres dans la circulation à cent
   * cinquante mètres, et personne n'était venu au bout de sept minutes (spécification « ordres directs » §2.5 : une
   * unité qui n'avance plus à moins de 400 m du point finit à pied).
   */
  private walkIn(root: Squad, me: Person, d: { since: number; byPlayer: boolean }, now: number): void {
    const ctx = this.ctx!;
    const cmd = ctx.service<CommandLike>('police.command');
    const pilot = ctx.service<Autopilot>('vehicles.autopilot');
    for (const q of this.tree(root.id, [])) {
      const v = q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
      if (!v || v.def.flying || this.cellCrew(q) || this.apartBravm(q) !== 0 || q.members.length === 0) continue;
      // (déjà descendu pour le suivre ; ou pris par un autre ordre du joueur)
      if (q.order.type !== 'embarquer') {
        this.inbound.delete(v.id);
        continue;
      }
      const dist = Math.hypot(v.x - me.x, v.z - me.z);
      let rec = this.inbound.get(v.id);
      if (!rec) {
        rec = { d: dist, at: now, rolled: false };
        this.inbound.set(v.id, rec);
      }
      if (Math.abs(v.speed) > 1) rec.rolled = true;
      if (dist < rec.d - INCOMING_GAIN) {
        rec.d = dist;
        rec.at = now;
      }
      if (dist > INCOMING_WALK) continue;
      const st = pilot && pilot.status ? pilot.status(v) : null;
      const stopped = Math.abs(v.speed) < 0.5;
      // arrivé près de lui (ou arrêté là) ; ou plus de progrès vers lui ; ou jamais parti
      const here = stopped && dist <= SEATED_DRIVE_MIN && (rec.rolled || (!!st && st.state === 'arrive'));
      const stalled = rec.rolled ? now - rec.at > INCOMING_STALL : now - d.since > INCOMING_START && stopped;
      if (!here && !stalled) continue;
      // (personne à bord : le groupe n'a pas embarqué — il viendra avec l'ordre donné à la branche)
      if (!q.members.some((id) => { const p = ctx.people.get(id); return !!p && p.vehicleId !== 0 && p.poste !== 'conducteur'; })) continue;
      this.inbound.delete(v.id);
      const order = { type: 'suivre' as const, targetId: me.id, issuedBy: me.id, ...(d.byPlayer ? { byPlayer: true as const } : {}) };
      if (cmd && typeof cmd.takeOver === 'function') cmd.takeOver(q.id, order);
      ctx.squads.issue(q.id, order);
    }
  }

  /** Chef de l'unité (ou son premier membre). */
  private leadOf(q: Squad): Person | undefined {
    const ctx = this.ctx!;
    return ctx.people.get(q.leaderId) ?? (q.members.length > 0 ? ctx.people.get(q.members[0]!) : undefined);
  }

  /**
   * L'unité viendrait-elle jusqu'au joueur en véhicules (direct/travel.ts, motorizes) ? Distance de ses agents (leur
   * centre, assis compris) au joueur, part d'agents assis, véhicules de transport utilisables.
   */
  private drivesHere(q: Squad, me: Person): boolean {
    const ctx = this.ctx!;
    let n = 0, seated = 0, x = 0, z = 0;
    for (const t of this.tree(q.id, [])) {
      for (const id of t.members) {
        const p = ctx.people.get(id);
        if (!p || p.isPlayer || p.custody !== 'free' || p.posture === 'down') continue;
        n++;
        x += p.x;
        z += p.z;
        if (p.vehicleId !== 0) seated++;
      }
    }
    if (n === 0) return false;
    const fleet = this.fleetOf(q.id).filter((v) => v.kind !== 'moto_bravm' && v.kind !== 'fourgon_cellulaire' && v.seats[0] !== 0);
    return motorizes({ x: x / n, z: z / n, hasVehicles: fleet.length > 0, seatedShare: seated / n }, me.x, me.z, false);
  }

  /** L'unité quitte la colonne : ses véhicules s'arrêtent où ils sont (ils ne suivent plus le joueur). */
  private leaveColumn(squadId: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tree = this.tree(squadId, []);
    let dropped = false;
    for (const q of tree) {
      if (this.motor.delete(q.id)) dropped = true;
      this.dismount.delete(q.id);
    }
    // unité « en colonne » par une unité mère : seule cette branche quitte la colonne (les autres restent)
    const s = ctx.squads.get(squadId);
    if (dropped) {
      for (const id of [...this.detached]) if (this.isUnder(id, squadId)) this.detached.delete(id);
    } else if (s && this.motorRoot(s) !== 0) {
      // la branche se détache : elle n'est plus réembarquée ni emmenée avec la colonne
      this.detached.add(squadId);
    } else return;
    const pilot = ctx.service<Autopilot>('vehicles.autopilot');
    for (const q of tree) {
      const ei = this.escorts.indexOf(q.id);
      if (ei >= 0) this.escorts.splice(ei, 1);
      if (q.vehicleId === 0) continue;
      const ci = this.column.indexOf(q.vehicleId);
      if (ci >= 0) this.column.splice(ci, 1);
      const ri = this.ride.indexOf(q.vehicleId);
      if (ri >= 0) this.ride.splice(ri, 1);
      const v = ctx.vehicles.get(q.vehicleId);
      if (!v || !pilot) continue;
      const st = pilot.status ? pilot.status(v) : null;
      if (!st || st.mode === 'follow') pilot.stop(v);
    }
  }

  /** Suivi des ordres : autre ordre reçu (l'unité quitte la colonne), compte rendu « prête », passage à pied. */
  private tendOrders(me: Person, now: number): void {
    const ctx = this.ctx!;
    if (this.deferred.length > 0) {
      const due = this.deferred.filter((d) => d.at < now);
      this.deferred = this.deferred.filter((d) => d.at >= now);
      for (const d of due) d.run();
    }
    for (const [sid, st] of [...this.motor]) {
      const s = ctx.squads.get(sid);
      if (!s) {
        this.motor.delete(sid);
        continue;
      }
      // un autre ordre (joueur, commandement IA) : l'unité n'est plus dans la colonne
      if (s.order.type !== 'embarquer') {
        this.leaveColumn(sid);
        continue;
      }
      if (st.ready || this.convoying(sid)) continue;
      let crew = this.crewCount(sid);
      // embarquement terminé (tous ceux qui ont une place sont à bord) : pas d'attente pour un agent resté sans place
      if (crew.onFoot > 0 && !st.boarded && now - st.since < MOTOR_READY_MAX) continue;
      // l'IA a fini, des équipiers restent à pied : ils prennent les places libres des véhicules de l'unité
      if (crew.onFoot > 0 && !st.seated) {
        st.seated = true;
        if (this.seatStragglers(sid, now) > 0) continue;
      }
      if (this.seating(sid, now)) continue;
      crew = this.crewCount(sid);
      st.ready = true;
      // à son chef d'unité ; un équipier qui appelle sa propre unité est appelé par son nom (pas « X ICI X »)
      const own = ctx.squads.get(me.squadId);
      const to = own && own.id !== sid && !this.isUnder(own.id, sid) ? own.name : me.name;
      const afoot = crew.onFoot === 1 ? ', un agent reste à pied' : crew.onFoot > 1 ? `, ${crew.onFoot} agents restent à pied` : '';
      ctx.radio.say({
        channel: 'commandement', from: s.name, priority: 1, personId: s.leaderId,
        text: `${to.toUpperCase()} ICI ${s.name.toUpperCase()}. En colonne, prête à vous suivre${afoot}. TERMINÉ.`,
      });
    }
    // descente avant de suivre à pied : tout le monde dehors (ou délai écoulé) → « suivre » le joueur (jamais laissée à
    // « débarquer » : « ils me suivent mais n'ont pas d'ordre »)
    for (const [sid, d] of [...this.dismount]) {
      const s = ctx.squads.get(sid);
      if (!s || s.order.type !== 'debarquer') {
        this.dismount.delete(sid);
        continue;
      }
      if (this.crewCount(sid).aboard > 0 && now - d.since < DISMOUNT_MAX) continue;
      this.dismount.delete(sid);
      ctx.squads.issue(sid, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...(d.byPlayer ? { byPlayer: true } : {}) });
    }
    // branches venues de loin en véhicules (« Avec moi » à pied) : leur colonne débarquée, elles le suivent à pied — sauf
    // si un autre ordre du joueur les a prises entre-temps
    for (const [sid, d] of [...this.incoming]) {
      const s = ctx.squads.get(sid);
      if (!s || (s.order.byPlayer === true && s.order.type !== 'debarquer')) {
        this.incoming.delete(sid);
        continue;
      }
      const cmd = ctx.service<CommandLike>('police.command');
      const st = cmd && cmd.convoyOf ? cmd.convoyOf(sid) : null;
      // (dès le débarquement commencé — pendant le stationnement, la colonne redonnerait son « débarquez », convoy.ts
      // beginDisembark ; ceux encore assis descendent dès que leur fourgon est garé)
      if (st && (st.stage === 'route' || st.stage === 'stationnement') && now - d.since < INCOMING_MAX) {
        // (en route : le groupe dont le fourgon est arrivé près de lui, ou n'avance plus, finit à pied sans attendre les autres)
        if (me.vehicleId === 0) this.walkIn(s, me, d, now);
        continue;
      }
      this.incoming.delete(sid);
      ctx.squads.issue(sid, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...(d.byPlayer ? { byPlayer: true } : {}) });
    }
    if (this.incoming.size === 0 && this.inbound.size > 0) this.inbound.clear();
    // BRAV-M d'une unité appelée : « suivre » le joueur, une fois l'ordre de l'unité mère relayé (special.ts)
    for (const [sid, d] of [...this.bravmDue]) {
      const s = ctx.squads.get(sid);
      if (!s || now > d.until) {
        this.bravmDue.delete(sid);
        continue;
      }
      // (le relais arrive au pas qui suit l'ordre ; on lui laisse ce pas)
      if (now < d.until - 2.5) continue;
      this.bravmDue.delete(sid);
      if (s.order.type === 'suivre' && s.order.targetId === me.id && (s.order.byPlayer === true) === d.byPlayer) continue;
      ctx.squads.issue(sid, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...(d.byPlayer ? { byPlayer: true } : {}) });
    }
  }

  /**
   * Joueur passager (il ne conduit pas) : les véhicules des unités « en colonne » suivent celui où il se trouve, en
   * chaîne, feux et sirène comme lui. Joueur à pied : la colonne s'arrête là où elle est (derrière lui), l'unité à bord.
   */
  private tendRide(me: Person): void {
    const ctx = this.ctx!;
    const pilot = ctx.service<Autopilot>('vehicles.autopilot');
    const inV = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    const lead = inV && !inV.def.flying ? inV : null;
    const want: Vehicle[] = [];
    if (lead) {
      for (const [sid, st] of this.motor) {
        if (this.convoying(sid)) continue;
        // on ne part pas en laissant des équipiers sur le trottoir (sauf délai d'embarquement écoulé)
        if (!st.ready) continue;
        for (const v of this.fleetOf(sid)) {
          if (v === lead || want.indexOf(v) >= 0) continue;
          if (v.seats[0] === 0) this.manDriver(v);
          if (v.seats[0] !== 0) want.push(v);
        }
      }
    }
    // véhicules qui ne sont plus de la colonne : ils s'arrêtent (joueur descendu, ordre levé)
    for (const id of this.ride) {
      if (want.some((v) => v.id === id)) continue;
      const v = ctx.vehicles.get(id);
      const st = v && pilot && pilot.status ? pilot.status(v) : null;
      if (v && pilot && (!st || st.mode === 'follow')) pilot.stop(v);
    }
    if (!lead || want.length === 0) {
      this.ride = [];
      return;
    }
    // l'ordre établi est gardé ; les nouveaux venus prennent la queue, dans l'ordre de départ
    const next = this.ride.filter((id) => want.some((v) => v.id === id));
    const fresh = want.filter((v) => next.indexOf(v.id) < 0).map((v) => v.id);
    this.departureOrder(fresh, lead);
    next.push(...fresh);
    this.sortExit(next, lead);
    this.ride = next;
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    this.unjam(next, pilot);
    let prev: EntityId = lead.id;
    for (const id of next) {
      const v = ctx.vehicles.get(id);
      if (!v) continue;
      if (pilot) {
        const st = pilot.status ? pilot.status(v) : null;
        if (this.mayFollow(v, prev, lead, st) && (!st || st.mode !== 'follow' || st.leaderId !== prev)) pilot.follow(v, prev, COLUMN_GAP, this.trails.get(prev));
        // (après la reprise de « follow », qui remet à zéro toute manœuvre en cours)
        if (v.id === this.yielder) {
          this.yielder = 0;
          if (pilot.giveWay && ctx.clock.now - this.yieldAt < 1) pilot.giveWay(v, YIELD_BACK);
        }
      }
      this.mirrorLights(v, lead, ext, pilot);
      prev = v.id;
    }
  }

  private mirrorLights(v: Vehicle, lead: Vehicle, ext: VehiclesExt | undefined, pilot?: Autopilot): void {
    const ctx = this.ctx!;
    // (suivant arrêté par des personnes plantées devant lui : session/engins.ts lui fait mettre ses deux-tons — et donc
    // ses gyrophares — pour que la foule s'écarte ; on ne les coupe pas pour les régler sur ceux du joueur, sinon ils
    // s'éteignaient aussitôt allumés)
    const st = lead.siren === 0 && v.siren !== 0 && pilot && pilot.status ? pilot.status(v) : null;
    if (st && (st.state === 'attente' || st.state === 'bloque') && st.reason === 'personne') return;
    if (v.siren !== lead.siren) {
      if (ext && ext.setSiren) ext.setSiren(v, lead.siren);
      else { v.siren = lead.siren; ctx.events.emit('vehicle:siren', { id: v.id, siren: lead.siren }); }
    }
    if (v.beacons !== lead.beacons) {
      if (ext && ext.setBeacons) ext.setBeacons(v, lead.beacons);
      else v.beacons = lead.beacons;
    }
  }

  /** Unité racine (compagnie) d'une unité. */
  private rootOf(id: number): number {
    const ctx = this.ctx!;
    let s = id !== 0 ? ctx.squads.get(id) : undefined;
    for (let guard = 0; s && s.parentId !== 0 && guard < 8; guard++) {
      const up = ctx.squads.get(s.parentId);
      if (!up) break;
      s = up;
    }
    return s ? s.id : 0;
  }

  /** Rang de l'unité dans l'arbre (0 : unité racine). */
  private depthOf(s: Squad): number {
    const ctx = this.ctx!;
    let depth = 0;
    for (let q = s; q.parentId !== 0 && depth < 9; depth++) {
      const up = ctx.squads.get(q.parentId);
      if (!up) break;
      q = up;
    }
    return depth;
  }

  /** L'unité est-elle placée (directement ou non) sous l'une de ces unités ? */
  private underAny(s: Squad, set: ReadonlySet<number>): boolean {
    const ctx = this.ctx!;
    let p = s.parentId;
    for (let guard = 0; p !== 0 && guard < 8; guard++) {
      if (set.has(p)) return true;
      const up = ctx.squads.get(p);
      if (!up) break;
      p = up.parentId;
    }
    return false;
  }

  /**
   * « Tout le monde me suit, c'est obligatoire » : tant que le joueur mène la colonne, une unité qui l'accompagne garde
   * « embarquer ». Un ordre qui n'est pas du joueur (le commandant IA qui reprend son dispositif pendant que la
   * compagnie monte dans ses fourgons) lui faisait abandonner ses places (police/maneuver.ts, beginDismount : tout
   * nouvel ordre à pied annule l'embarquement en cours) — ses agents restaient sur le trottoir et la colonne partait
   * avec les seuls conducteurs. L'embarquement lui est redonné dans le même pas, avant que personne ne descende. Font
   * exception : « débarquer » (elle descend, comme avant), l'unité que l'IA envoie au contact (CONTACT_ORDERS : elle y
   * va, voir inContact) et un ordre du JOUEUR autre que « avec moi » — il sort l'unité de la colonne : son véhicule
   * s'arrête, elle descend et l'exécute.
   */
  private holdEscorts(me: Person): void {
    const ctx = this.ctx!;
    for (let i = this.escorts.length - 1; i >= 0; i--) {
      const sid = this.escorts[i]!;
      const s = ctx.squads.get(sid);
      if (!s) continue;
      const o = s.order;
      if (o.type === 'embarquer' || o.type === 'debarquer' || CONTACT_ORDERS.has(o.type)) continue;
      if (o.byPlayer === true && !(o.type === 'suivre' && o.targetId === me.id)) {
        this.escorts.splice(i, 1);
        this.escortBy.delete(sid);
        const ci = s.vehicleId !== 0 ? this.column.indexOf(s.vehicleId) : -1;
        if (ci >= 0) {
          this.column.splice(ci, 1);
          const v = ctx.vehicles.get(s.vehicleId);
          const pilot = ctx.service<Autopilot>('vehicles.autopilot');
          const st = v && pilot && pilot.status ? pilot.status(v) : null;
          if (v && pilot && (!st || st.mode === 'follow')) pilot.stop(v);
        }
        continue;
      }
      ctx.squads.issue(sid, { type: 'embarquer', issuedBy: me.id });
    }
    // l'unité du joueur lui-même, quand il n'en est pas le chef (CRS au volant du fourgon de son groupe) : montée avec lui
    // (startConvoy), elle n'est pas une unité accompagnatrice — le commandant IA lui donnait une mission à tenir à pied
    // (« Protégez la Bourse du Travail ») et le groupe descendait du fourgon du joueur, à 500 m de la place (plan
    // « ordres directs », P20 : même règle que pour les unités accompagnatrices, quand toute sa compagnie le suit)
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    if (own && own.leaderId !== me.id && own.vehicleId === this.mounted && this.escorts.indexOf(own.id) < 0 && this.escorts.indexOf(this.rootOf(own.id)) >= 0) {
      const o = own.order;
      if (o.type !== 'embarquer' && o.type !== 'debarquer' && !CONTACT_ORDERS.has(o.type) && o.byPlayer !== true) ctx.squads.issue(own.id, { type: 'embarquer', issuedBy: me.id });
    }
  }

  /** Équipage d'une unité accompagnatrice au complet à bord (ou délai d'embarquement écoulé, au moins le conducteur). */
  private escortReady(v: Vehicle): boolean {
    const ctx = this.ctx!;
    for (const sid of this.escorts) {
      const s = ctx.squads.get(sid);
      if (!s || s.vehicleId !== v.id) continue;
      if (v.seats[0] === 0) return false;
      if (ctx.clock.now - this.escortSince > BOARD_TIMEOUT) return true;
      for (const id of s.members) {
        const p = ctx.people.get(id);
        if (p && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down') return false;
      }
      return true;
    }
    return true;
  }

  /**
   * Véhicule de la colonne sans conducteur (unité créée sans chauffeurs : section ou groupe du joueur en patrouille, ou
   * chauffeur descendu) : un équipier à bord prend le volant — le conducteur s'il y en a un, sinon un gardien qui ne
   * commande pas. Sans cela le fourgon restait garé et ne suivait pas le joueur.
   */
  private manDriver(v: Vehicle): void {
    const ctx = this.ctx!;
    if (v.def.flying || v.state === 'wrecked' || v.state === 'burnt' || Math.abs(v.speed) > 0.5) return;
    let seat = -1;
    for (let i = 0; i < v.def.seats.length; i++) if (v.def.seats[i]!.role === 'driver') { seat = i; break; }
    if (seat < 0 || v.seats[seat] !== 0) return;
    let pick: Person | null = null;
    let best = Infinity;
    for (let i = 0; i < v.seats.length; i++) {
      const p = v.seats[i] !== 0 ? ctx.people.get(v.seats[i]!) : undefined;
      if (!p || p.isPlayer || p.faction !== 'police' || p.custody !== 'free') continue;
      const sq = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
      const rank = p.poste === 'conducteur' ? 0 : sq && sq.leaderId === p.id ? 3 : p.poste === 'chef_groupe' || p.poste === 'chef_section' || p.poste === 'commandant_unite' ? 2 : 1;
      if (rank < best) { best = rank; pick = p; }
    }
    if (pick) ctx.vehicles.enter(pick, v, seat);
  }

  private hasDriver(v: Vehicle): boolean {
    for (const a of this.assign.values()) if (a.vehicleId === v.id && a.role === 'driver') return true;
    return v.seats[0] !== 0;
  }

  /** Équipiers à pied qui n'ont pas encore rejoint leur place : ils y courent. */
  private walkToSeats(_me: Person, now: number): void {
    const ctx = this.ctx!;
    for (const [id, a] of this.assign) {
      const p = ctx.people.get(id);
      const v = ctx.vehicles.get(a.vehicleId);
      if (!p || !v || p.vehicleId !== 0) continue;
      if (now - a.since > BOARD_TIMEOUT) continue;
      let dx = v.x - p.x, dz = v.z - p.z;
      let d = Math.hypot(dx, dz) || 1;
      // arrêté en chemin sans plus se rapprocher depuis SEAT_STALL s (un mur, une grille, une balustrade sur le trajet
      // direct — Concorde : le télépilote de l'équipe drone poussait contre la balustrade, à cinq mètres du fourgon,
      // jusqu'au départ de la colonne) : il fait le tour par le chemin d'un piéton, point après point
      if (a.near === undefined || d < a.near - 0.3) {
        a.near = d;
        a.nearAt = now;
      }
      if (a.path && (now - (a.pathAt ?? 0) > SEAT_PATH_MAX || (a.pathI ?? 0) >= a.path.length)) {
        a.path = undefined;
        a.near = d;
        a.nearAt = now;
      }
      if (!a.path && d > 3 && now - (a.nearAt ?? now) > SEAT_STALL) {
        const path: number[] = [];
        let ok = false;
        try { ok = ctx.world.findPath(p.x, p.z, v.x, v.z, 'foot', path) && path.length >= 4; } catch { ok = false; }
        a.nearAt = now;
        if (ok) {
          a.path = path;
          a.pathAt = now;
          a.pathI = 2;
        }
      }
      if (a.path) {
        const path = a.path;
        let i = a.pathI ?? 2;
        while (i < path.length && Math.hypot(path[i]! - p.x, path[i + 1]! - p.z) < 1.2) i += 2;
        a.pathI = i;
        if (i < path.length) {
          dx = path[i]! - p.x;
          dz = path[i + 1]! - p.z;
          d = Math.hypot(dx, dz) || 1;
        }
      }
      let mx = dx / d;
      let mz = dz / d;
      // un autre véhicule en travers du trajet direct (bloc garé) : on le longe, du côté opposé à son centre
      const hit = this.hit;
      const look = Math.min(d, 6);
      if (d > 3 && ctx.vehicles.raycast(p.x, p.z, p.x + mx * look, p.z + mz * look, hit, 'move') && hit.hit && hit.kind === 'vehicle' && hit.id !== v.id) {
        const o = ctx.vehicles.get(hit.id);
        if (o) {
          const side = (o.x - p.x) * -mz + (o.z - p.z) * mx > 0 ? -1 : 1;
          const sx = -mz * side * 0.9 + mx * 0.3;
          const sz = mx * side * 0.9 + mz * 0.3;
          const l = Math.hypot(sx, sz) || 1;
          mx = sx / l;
          mz = sz / l;
        }
      }
      p.cmd.moveX = mx;
      p.cmd.moveZ = mz;
      p.cmd.gait = 1;
      p.cmd.faceMove = true;
    }
  }

  /** Montée à bord à portée de portière ; abandon au-delà du délai. */
  private board(now: number): void {
    const ctx = this.ctx!;
    for (const [id, a] of this.assign) {
      const p = ctx.people.get(id);
      const v = ctx.vehicles.get(a.vehicleId);
      if (!p || !v) { this.assign.delete(id); continue; }
      if (p.vehicleId !== 0) continue;
      if (now - a.since > BOARD_TIMEOUT) { this.assign.delete(id); continue; }
      // véhicule complet entre-temps (l'IA de police y a fait monter un agent sans place d'un autre groupe, un opérateur
      // de l'état-major : les deux comptes de places ne se connaissent pas) : la place est rendue tout de suite, une
      // autre lui est donnée au pas suivant (seatOrphans, seatStragglers). Il restait devant le fourgon plein jusqu'au
      // bout du délai, et la colonne partait sans lui (Concorde : le télépilote de l'équipe drone à pied)
      if (!v.seats.some((sid) => sid === 0)) { this.assign.delete(id); continue; }
      const reach = Math.max(v.def.length, v.def.width) * 0.5 + BOARD_REACH;
      if (Math.hypot(v.x - p.x, v.z - p.z) <= reach && !ctx.vehicles.enter(p, v, a.seat)) ctx.vehicles.enter(p, v);
    }
  }

  /** Colonne : chaque véhicule suit le précédent, sirène et gyrophares comme le véhicule du joueur. */
  private keepColumn(lead: Vehicle): void {
    const ctx = this.ctx!;
    const pilot = ctx.service<Autopilot>('vehicles.autopilot');
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    this.sortExit(this.column, lead);
    this.unjam(this.column, pilot);
    let prev: EntityId = lead.id;
    for (const id of this.column) {
      const v = ctx.vehicles.get(id);
      if (v && v.seats[0] === 0 && this.escorts.some((sid) => ctx.squads.get(sid)?.vehicleId === v.id)) this.manDriver(v);
      if (!v || v.seats[0] === 0) continue;
      // tout le monde est-il à bord ? (on ne part pas en laissant un équipier sur le trottoir)
      let waiting = false;
      for (const [pid, a] of this.assign) {
        if (a.vehicleId !== v.id) continue;
        const p = ctx.people.get(pid);
        if (p && p.vehicleId === 0) waiting = true;
      }
      // une seule prise en charge : relancer « follow » effacerait la trace du meneur à chaque fois
      if (!this.escortReady(v)) waiting = true;
      // un véhicule qui attend ses équipiers ne prend pas encore sa place : les suivants se rangent derrière le précédent
      if (waiting) continue;
      if (pilot) {
        const st = pilot.status ? pilot.status(v) : null;
        // (garé en bloc, il attend que le meneur se dégage : feux et sirène déjà comme lui)
        if (this.mayFollow(v, prev, lead, st, true) && (!st || st.mode !== 'follow' || st.leaderId !== prev)) pilot.follow(v, prev, COLUMN_GAP, this.trails.get(prev));
        // (après la reprise de « follow », qui remet à zéro toute manœuvre en cours)
        if (v.id === this.yielder) {
          this.yielder = 0;
          if (pilot.giveWay && ctx.clock.now - this.yieldAt < 1) pilot.giveWay(v, YIELD_BACK);
        }
      }
      this.mirrorLights(v, lead, ext, pilot);
      prev = v.id;
    }
  }

  /**
   * Colonne coincée au départ : un véhicule arrêté devant un autre de SA colonne placé derrière lui dans l'ordre de
   * marche (garés en travers du bloc, ou venu se ranger dans sa sortie) attendait qu'il avance, et celui-ci l'attendait :
   * un véhicule ne double jamais un véhicule de sa propre colonne. Comme pour la colonne de police/command/convoy.ts
   * (« le gêneur est de la colonne et attend son tour : il part maintenant »), le gêneur passe devant lui dans l'ordre de
   * marche (au plus une fois toutes les SWAP_COOLDOWN s par véhicule).
   */
  private unjam(ids: EntityId[], pilot: Autopilot | undefined): void {
    const ctx = this.ctx!;
    if (!pilot || !pilot.status) return;
    const now = ctx.clock.now;
    for (let i = 0; i < ids.length; i++) {
      const v = ctx.vehicles.get(ids[i]!);
      if (!v || Math.abs(v.speed) > 0.3) continue;
      const st = pilot.status(v);
      if (st.mode !== 'follow' || (st.state !== 'attente' && st.state !== 'bloque') || (st.blockedFor ?? 0) < JAM_WAIT) continue;
      const o = obstacleOf(pilot, v);
      const k = o !== 0 ? ids.indexOf(o) : -1;
      if (k <= i || (this.swapped.get(o) ?? -1e9) > now - SWAP_COOLDOWN) continue;
      this.swapped.set(o, now);
      // nez contre flanc, chacun arrêté par l'autre (au sortir du bloc, l'un s'est mis en travers de la sortie de
      // l'autre) : le seul échange de l'ordre de marche ne débloque rien — ils se le rendaient indéfiniment. Celui qui a
      // de la place derrière lui recule de quoi dégager l'autre, qui passe devant ; puis il le suit.
      const ov = ctx.vehicles.get(o);
      if (ov && obstacleOf(pilot, ov) === v.id && pilot.giveWay) {
        const vRoom = this.rearRoom(v);
        const oRoom = this.rearRoom(ov);
        if (Math.max(vRoom, oRoom) >= YIELD_MIN) {
          this.yielder = vRoom >= oRoom ? v.id : o;
          this.yieldAt = now;
          // (o recule : v garde la tête, rien à échanger)
          if (this.yielder === o) return;
        }
      }
      ids.splice(k, 1);
      ids.splice(i, 0, o);
      return;
    }
  }

  /** Place libre derrière le véhicule, dans son axe (m, au plus YIELD_BACK + 1) : autres véhicules et décor. */
  private rearRoom(v: Vehicle): number {
    const ctx = this.ctx!;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const half = v.def.length * 0.5;
    let room = YIELD_BACK + 1;
    for (const o of ctx.vehicles.list) {
      if (o === v || o.def.flying) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const behind = -(dx * fx + dz * fz) - half - o.def.length * 0.5;
      if (behind < -1 || behind > room) continue;
      if (Math.abs(-dx * fz + dz * fx) < (v.def.width + o.def.width) * 0.5 + 0.4) room = Math.max(0, behind);
    }
    // décor (mur, mobilier) : pas à pas, derrière le pare-chocs arrière
    for (let d = 0.5; d < room; d += 0.5) {
      if (!ctx.world.isFree(v.x - fx * (half + d), v.z - fz * (half + d), v.def.width * 0.5)) { room = Math.max(0, d - 0.5); break; }
    }
    return room;
  }

  /**
   * « Avec moi » ne le quitte pas (spécification §3.3) : le joueur monte dans un véhicule ou en descend.
   *   - il monte en PASSAGER d'un véhicule de police (au volant, c'est startConvoy) qu'aucune colonne du commandement
   *     n'emporte : les unités qui le suivaient à pied montent dans leurs fourgons et suivent le sien (orderColumn) ;
   *   - au volant comme passager, la BRAV-M qui le suit se remet en selle derrière lui (bravm.ts, « suivre ») ;
   *   - il descend : les unités « en colonne » derrière lui descendent et le suivent à pied.
   */
  private onVehicleChange(me: Person, was: EntityId): void {
    const ctx = this.ctx!;
    if (me.vehicleId === 0) {
      if (was === 0) return;
      for (const [sid, st] of [...this.motor]) {
        const s = ctx.squads.get(sid);
        // (une colonne du commandement qui vient encore à lui de loin continue sa route)
        if (!s || this.cellCrew(s) || s.order.type !== 'embarquer' || this.convoying(sid)) continue;
        this.orderOnFoot(sid, st.byPlayer !== false);
      }
      return;
    }
    const v = ctx.vehicles.get(me.vehicleId);
    if (!v || v.def.flying || (!POLICE_FLEET.has(v.kind) && !TROOP_KINDS.has(v.kind))) return;
    // (les fourgons cellulaires qui le « suivaient » — ordre de mise en place copié de leur compagnie — restent au point de
    // remise : un équipage qui suit quelqu'un monté en véhicule prend la route derrière lui)
    for (const s of ctx.squads.list) {
      if (this.cellCrew(s) && s.order.type === 'suivre' && s.order.targetId === me.id && !s.order.byPlayer && !this.motor.has(s.id)) {
        ctx.squads.issue(s.id, { type: 'libre', issuedBy: 0 });
      }
    }
    const cmd = ctx.service<CommandLike>('police.command');
    const driver = v.seats[0] === me.id;
    // (passager d'une colonne de la journée de service : c'est elle qui emmène tout le monde — dès son embarquement : monté
    // dans le fourgon voisin pendant que la compagnie embarque, le chef de groupe appelait son propre groupe « en colonne »
    // derrière ce fourgon, qui devait lui-même suivre le sien dans la colonne de la journée ; les deux fourgons
    // s'attendaient l'un l'autre et la colonne partait sans eux)
    const carried = (!!cmd && typeof cmd.carrying === 'function' && cmd.carrying(v.id)) || this.inColumn(v);
    for (const s of this.followingOnFoot(me)) {
      // (de haut en bas : appelée avec son unité mère, une branche n'a plus « suivre » — sauf si elle gardait le sien)
      if (s.order.type !== 'suivre' || s.order.targetId !== me.id) continue;
      if (this.apartBravm(s) === s.id) {
        // la BRAV-M se remet en selle et le suit (même ordre, redonné : il roule maintenant)
        ctx.squads.issue(s.id, { type: 'suivre', targetId: me.id, issuedBy: me.id, ...(s.order.byPlayer ? { byPlayer: true } : {}) });
        continue;
      }
      if (driver || carried || this.cellCrew(s)) continue;
      // (l'équipage déjà assis avec lui — voiture de patrouille — reste à bord sans autre ordre)
      if (s.members.length > 0 && ctx.squads.childrenOf(s.id).length === 0 && s.members.every((id) => id === me.id || ctx.people.get(id)?.vehicleId === v.id)) continue;
      this.orderColumn(s.id, { byPlayer: s.order.byPlayer === true });
    }
  }

  /** Le véhicule est-il celui d'une unité dont la colonne (police.command) embarque, roule ou se gare encore ? */
  private inColumn(v: Vehicle): boolean {
    const ctx = this.ctx!;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.vehicleId !== v.id) continue;
      let q: Squad | undefined = s;
      for (let guard = 0; q && guard < 8; guard++) {
        if (this.convoying(q.id)) return true;
        q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
      }
    }
    return false;
  }

  /** Unités sous ses ordres qui le suivent à pied, des plus hautes aux plus basses. */
  private followingOnFoot(me: Person): Squad[] {
    const ctx = this.ctx!;
    const led = new Set<number>();
    for (const s of ctx.squads.list) if (s.faction === 'police' && s.leaderId === me.id) led.add(s.id);
    const out: { s: Squad; depth: number }[] = [];
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.order.type !== 'suivre' || s.order.targetId !== me.id || this.motorRoot(s) !== 0) continue;
      if (!led.has(s.id) && !this.underAny(s, led)) continue;
      let depth = 0;
      for (let q = s; q.parentId !== 0 && depth < 9; depth++) {
        const up = ctx.squads.get(q.parentId);
        if (!up) break;
        q = up;
      }
      out.push({ s, depth });
    }
    out.sort((a, b) => a.depth - b.depth || a.s.id - b.s.id);
    return out.map((e) => e.s);
  }

  /** Le joueur descend : la colonne s'arrête, tout le monde descend et reprend « suivre » à pied. */
  private endConvoy(): void {
    const ctx = this.ctx!;
    const pilot = ctx.service<Autopilot>('vehicles.autopilot');
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    for (const id of this.column) {
      const v = ctx.vehicles.get(id);
      if (!v) continue;
      if (pilot) pilot.stop(v);
      if (ext && ext.setSiren) ext.setSiren(v, 0);
    }
    for (const [id] of this.assign) {
      const p = ctx.people.get(id);
      // unité « en colonne » : elle reste à bord jusqu'au prochain ordre
      const sq = p && p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
      if (sq && this.motorRoot(sq) !== 0) continue;
      if (p && p.vehicleId !== 0) ctx.vehicles.exit(p);
    }
    // les groupes accompagnateurs débarquent en ligne à côté de leur fourgon ; ceux qu'il commande le suivent ensuite à
    // pied (« Avec moi » ne le quitte pas : jamais laissés à « débarquer », la puce disait « DESCEND » indéfiniment) —
    // ceux d'une compagnie tenue par un commandant IA reprennent son dispositif
    const me = ctx.player.person();
    const led = new Set<number>();
    if (me) for (const s of ctx.squads.list) if (s.faction === 'police' && s.leaderId === me.id) led.add(s.id);
    for (const sid of this.escorts) {
      const sq = ctx.squads.get(sid);
      const v = sq ? ctx.vehicles.get(sq.vehicleId) : undefined;
      if (!sq || !v) continue;
      // un équipage d'engin (canon à eau, Centaure) reste à son poste ; une unité « en colonne » est descendue avec le
      // joueur (afterRide)
      if (sq.kind === 'equipage' || this.motorRoot(sq) !== 0) continue;
      // (escorte restée loin derrière lui — il a filé devant, au volant : elle roulait encore à des centaines de mètres,
      // voire des kilomètres — : elle ne débarque pas là où elle est ; elle vient dans ses fourgons jusqu'à lui, puis le
      // suit à pied — colonne garantie, plan « ordres directs » P17)
      if (me && (led.has(sid) || this.underAny(sq, led)) && this.drivesHere(sq, me)) {
        this.callFar(sq, me, this.escortBy.get(sid) === true);
        continue;
      }
      const side = v.heading + Math.PI / 2;
      ctx.squads.issue(sid, { type: 'debarquer', x: v.x + Math.sin(side) * 4, z: v.z + Math.cos(side) * 4, heading: v.heading, width: 0, issuedBy: me?.id ?? 0 });
      if (me && (led.has(sid) || this.underAny(sq, led))) this.dismount.set(sid, { since: ctx.clock.now, byPlayer: this.escortBy.get(sid) === true });
    }
    this.escortBy.clear();
    this.assign.clear();
    this.orphaned.clear();
    this.column = [];
    this.escorts = [];
    this.mounted = 0;
  }
}

/** Véhicule qui arrête celui-ci (pilote automatique : obstacle « véhicule ») ; 0 sinon. Même lecture que police/command/convoy.ts. */
function obstacleOf(ap: unknown, v: Vehicle): EntityId {
  try {
    const rt = (ap as { k?: { rt?(v: Vehicle): { ap?: { obsId?: number; obsReason?: string } | null } } }).k?.rt?.(v);
    const st = rt && rt.ap;
    return st && st.obsReason === 'vehicule' && typeof st.obsId === 'number' ? st.obsId : 0;
  } catch {
    return 0;
  }
}
