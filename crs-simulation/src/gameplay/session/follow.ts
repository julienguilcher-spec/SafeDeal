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
 *     groupes débarquent en ligne à côté de leur fourgon.
 * Ordres du joueur (service 'session.follow', donnés depuis la roue d'ordres ou la carte tactique) :
 *   - « Me suivre en colonne (véhicules) » : l'unité remonte dans ses véhicules, se range derrière celui du joueur et le
 *     suit en colonne, qu'il conduise ou qu'il soit passager, feux et sirène comme lui. Donné à pied, l'unité embarque et
 *     attend, moteurs tournants (« en colonne, prête à vous suivre ») ; quand le joueur descend, la colonne se gare
 *     derrière lui et l'unité RESTE À BORD jusqu'au prochain ordre ;
 *   - « Me suivre à pied » : l'unité quitte la colonne, descend si elle est à bord, puis suit le joueur à pied ; elle ne
 *     monte pas dans les fourgons quand il prend le volant.
 * Simulation pure (aucun DOM). Sans pilote automatique (module des véhicules absent), seul l'embarquement à bord du
 * véhicule du joueur a lieu.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Person, RayHit, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';

interface Autopilot {
  follow(v: Vehicle, leaderId: EntityId, distance?: number, trail?: readonly number[]): boolean;
  stop(v: Vehicle): void;
  status?(v: Vehicle): Readonly<{ mode: string; leaderId: EntityId; state?: string; blockedFor?: number }>;
}
interface CommandLike {
  stateOf(companyId: number): { phase: string; commanderId: EntityId; missionEnded: boolean } | null;
  convoyOf?(squadId: number): { stage: string } | null;
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
}
/** Délai maximal d'embarquement avant de se déclarer prête (s) et de débarquement avant de suivre à pied (s). */
const MOTOR_READY_MAX = 60;
const DISMOUNT_MAX = 45;
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
const POLICE_FLEET: ReadonlySet<string> = new Set(['moto_bravm', 'fourgon_crs', 'car_crs', 'voiture_police', 'vl_commandement', 'fourgon_cellulaire']);
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
  /** Unités « en colonne » (ordre du joueur) : instant de l'ordre, compte rendu « prête à vous suivre » fait. */
  private readonly motor = new Map<number, { since: number; ready: boolean; boarded: boolean; seated?: boolean }>();
  private unsub: (() => void) | null = null;
  /** Unités qui descendent de leurs véhicules pour suivre le joueur à pied (instant de l'ordre). */
  private readonly dismount = new Map<number, number>();
  /** Unités qui ont reçu « Me suivre à pied » : elles ne montent pas dans leur fourgon quand le joueur prend le volant. */
  private readonly afoot = new Set<number>();
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
    this.afoot.clear();
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
    this.recordTrails(me.vehicleId !== 0 && driving && !driving.def.flying ? driving : null);

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
      // une unité qui a l'ordre de suivre le joueur À PIED ne monte pas dans son fourgon
      if (!called && s !== pair && this.followsOnFoot(s)) continue;
      // unité « en colonne » venue de loin : sa colonne roule encore vers le joueur (police.command), elle la laisse finir
      if (called && this.convoying(root)) continue;
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
      if (this.column.indexOf(s.vehicleId) < 0) this.column.push(s.vehicleId);
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
    // (seulement au volant d'un véhicule de police : une voiture civile ne fait pas partir la compagnie)
    if (role === 'gendarme_centaure' || lead.def.flying || me.squadId === 0 || (!POLICE_FLEET.has(lead.kind) && !TROOP_KINDS.has(lead.kind))) return out;
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
  private readonly hit: RayHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

  /** L'unité (ou une unité dont elle dépend) a-t-elle reçu du joueur « Me suivre à pied » ? */
  private followsOnFoot(s: Squad): boolean {
    const ctx = this.ctx!;
    let q: Squad | undefined = s;
    for (let guard = 0; q && guard < 8; guard++) {
      if (this.afoot.has(q.id)) return true;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) ?? undefined : undefined;
    }
    return false;
  }

  /** Unité « en colonne » dont celle-ci fait partie (elle-même ou une unité mère) ; 0 si aucune. */
  private motorRoot(s: Squad): number {
    const ctx = this.ctx!;
    let q: Squad | undefined = s;
    for (let guard = 0; q && guard < 8; guard++) {
      if (this.motor.has(q.id)) return q.id;
      // branche détachée de la colonne par un autre ordre
      if (this.detached.has(q.id)) return 0;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) ?? undefined : undefined;
    }
    return 0;
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
      if (!own && (this.inContact(q) || this.followsOnFoot(q) || (!FREE_ORDERS.has(q.order.type) && q.order.type !== 'embarquer'))) continue;
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
          if (p.poste !== 'conducteur' && q.kind !== 'equipage') aboard++;
        } else if (p.custody === 'free' && p.posture !== 'down') onFoot++;
      }
    }
    return { onFoot, aboard };
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

  /** Le meneur est-il parti de sa place (DEPART_MOVE m) ? On ordonne alors une fois la sortie du stationnement. */
  private sortExit(ids: EntityId[], lead: Vehicle): void {
    if (this.exitSorted) return;
    const trail = this.trails.get(lead.id);
    if (!trail || Math.hypot(lead.x - trail[0]!, lead.z - trail[1]!) < DEPART_MOVE) return;
    this.exitSorted = true;
    this.exitOrder(ids, lead);
  }

  /**
   * Le véhicule peut-il prendre (ou garder) la suite de `prev` ? Le premier, s'il est garé en bloc (un véhicule juste
   * devant lui), attend que le meneur se soit dégagé : il le rejoindra par les rues.
   */
  private mayFollow(v: Vehicle, prev: EntityId, lead: Vehicle, st: Readonly<{ mode: string; leaderId: EntityId }> | null): boolean {
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

  /** « Me suivre en colonne (véhicules) ». */
  private orderColumn(squadId: number): boolean {
    const ctx = this.ctx;
    const me = ctx ? ctx.player.person() : null;
    const s = ctx ? ctx.squads.get(squadId) : undefined;
    if (!ctx || !me || !s) return false;
    if (this.fleetOf(squadId).length === 0) return false;
    this.dismount.delete(squadId);
    this.afoot.delete(squadId);
    // déjà « en colonne » par son unité mère : rien de plus
    const root = this.motorRoot(s);
    if (root !== 0 && root !== squadId) return true;
    for (const id of [...this.motor.keys()]) if (id !== squadId && this.isUnder(id, squadId)) this.motor.delete(id);
    for (const id of [...this.dismount.keys()]) if (this.isUnder(id, squadId)) this.dismount.delete(id);
    for (const id of [...this.afoot]) if (this.isUnder(id, squadId)) this.afoot.delete(id);
    for (const id of [...this.detached]) if (this.isUnder(id, squadId)) this.detached.delete(id);
    this.motor.set(squadId, { since: ctx.clock.now, ready: false, boarded: false });
    // ordre déjà donné (colonne lancée de loin par police.command) : on ne relance pas l'embarquement
    if (s.order.type !== 'embarquer') ctx.squads.issue(squadId, { type: 'embarquer', issuedBy: me.id });
    // le joueur conduit déjà : l'unité prend place dans sa colonne à la prochaine revue
    this.nextJoin = 0;
    return true;
  }

  /** « Me suivre à pied ». */
  private orderOnFoot(squadId: number): void {
    const ctx = this.ctx;
    const me = ctx ? ctx.player.person() : null;
    const s = ctx ? ctx.squads.get(squadId) : undefined;
    if (!ctx || !me || !s) return;
    this.leaveColumn(squadId);
    this.afoot.add(squadId);
    if (this.crewCount(squadId).aboard > 0) {
      // à bord : on descend d'abord, à côté du véhicule de l'unité (ou du premier de ses véhicules)
      const v = (s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined) ?? this.fleetOf(squadId)[0];
      const side = v ? v.heading + Math.PI / 2 : 0;
      const x = v ? v.x + Math.sin(side) * 4 : me.x;
      const z = v ? v.z + Math.cos(side) * 4 : me.z;
      ctx.squads.issue(squadId, { type: 'debarquer', x, z, heading: v ? v.heading : me.heading, width: 0, issuedBy: me.id });
      this.dismount.set(squadId, ctx.clock.now);
      return;
    }
    ctx.squads.issue(squadId, { type: 'suivre', targetId: me.id, issuedBy: me.id });
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
    // « à pied » levé par un autre ordre
    for (const sid of [...this.afoot]) {
      const s = ctx.squads.get(sid);
      if (!s || (s.order.type !== 'suivre' && s.order.type !== 'debarquer')) this.afoot.delete(sid);
    }
    // descente avant de suivre à pied : tout le monde dehors (ou délai écoulé) → « suivre » le joueur
    for (const [sid, since] of [...this.dismount]) {
      const s = ctx.squads.get(sid);
      if (!s || s.order.type !== 'debarquer') {
        this.dismount.delete(sid);
        continue;
      }
      if (this.crewCount(sid).aboard > 0 && now - since < DISMOUNT_MAX) continue;
      this.dismount.delete(sid);
      ctx.squads.issue(sid, { type: 'suivre', targetId: me.id, issuedBy: me.id });
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
      }
      this.mirrorLights(v, lead, ext);
      prev = v.id;
    }
  }

  private mirrorLights(v: Vehicle, lead: Vehicle, ext: VehiclesExt | undefined): void {
    const ctx = this.ctx!;
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
      const dx = v.x - p.x, dz = v.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
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
        if (this.mayFollow(v, prev, lead, st) && (!st || st.mode !== 'follow' || st.leaderId !== prev)) pilot.follow(v, prev, COLUMN_GAP, this.trails.get(prev));
      }
      this.mirrorLights(v, lead, ext);
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
      ids.splice(k, 1);
      ids.splice(i, 0, o);
      return;
    }
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
    // les groupes accompagnateurs débarquent en ligne à côté de leur fourgon
    for (const sid of this.escorts) {
      const sq = ctx.squads.get(sid);
      const v = sq ? ctx.vehicles.get(sq.vehicleId) : undefined;
      if (!sq || !v) continue;
      // un équipage d'engin (canon à eau, Centaure) reste à son poste ; une unité « en colonne » reste à bord, garée
      // derrière le joueur, jusqu'au prochain ordre
      if (sq.kind === 'equipage' || this.motorRoot(sq) !== 0) continue;
      const side = v.heading + Math.PI / 2;
      ctx.squads.issue(sid, { type: 'debarquer', x: v.x + Math.sin(side) * 4, z: v.z + Math.cos(side) * 4, heading: v.heading, width: 0, issuedBy: ctx.player.person()?.id ?? 0 });
    }
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
