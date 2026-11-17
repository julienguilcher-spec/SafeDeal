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
 *   - les autres unités qui l'accompagnent (escorte de l'engin, groupes de la section qu'il commande, et toute la
 *     compagnie quand aucun commandant IA ne la tient en dispositif) embarquent dans LEURS fourgons et prennent place
 *     dans la colonne : c'est la colonne de fourgons qui traverse Paris, sirènes hurlantes ;
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

import type { EntityId, GameContext, GameSystem, Person, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';

interface Autopilot {
  follow(v: Vehicle, leaderId: EntityId, distance?: number): boolean;
  stop(v: Vehicle): void;
  status?(v: Vehicle): Readonly<{ mode: string; leaderId: EntityId }>;
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
/** Véhicule « juste devant » : à moins de tant de mètres devant le pare-chocs, dans l'axe (m). */
const BOXED_AHEAD = 10;
const BOXED_SIDE = 2.4;
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
  private readonly motor = new Map<number, { since: number; ready: boolean; boarded: boolean }>();
  private unsub: (() => void) | null = null;
  /** Unités qui descendent de leurs véhicules pour suivre le joueur à pied (instant de l'ordre). */
  private readonly dismount = new Map<number, number>();
  /** Unités qui ont reçu « Me suivre à pied » : elles ne montent pas dans leur fourgon quand le joueur prend le volant. */
  private readonly afoot = new Set<number>();
  /** Branches d'une unité « en colonne » qui ont reçu un autre ordre : elles ne font plus partie de la colonne. */
  private readonly detached = new Set<number>();
  /** Colonne derrière le véhicule où le joueur est passager (il ne conduit pas) : véhicules dans l'ordre. */
  private ride: EntityId[] = [];

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

    // marche vers les véhicules (à chaque pas : l'IA de police réécrit les commandes avant nous)
    if (this.mounted !== 0) this.walkToSeats(me, now);
    if (now < this.nextThink) return;
    this.nextThink = now + 0.5;
    void dt;
    this.tendOrders(me, now);
    if (this.mounted === 0) {
      this.tendRide(me);
      return;
    }
    this.board(now);
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
   * groupes de sa section), et, s'il conduit un véhicule de compagnie, les autres groupes de la compagnie — sauf si un
   * commandant IA les tient en dispositif (ils restent à leur poste pendant la manifestation).
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
      if (!under && !(companyFree && this.rootOf(s.id) === company)) continue;
      // l'escorte à pied d'un blindé (session/engins.ts) part avec la colonne, dans son fourgon
      const guardsEngine = s.order.type === 'proteger' && ARMORED.has(ctx.vehicles.get(s.order.targetId)?.kind ?? '');
      // l'ordre « en colonne » est donné à l'unité mère : les groupes partent quel que soit leur ordre propre
      if (!FREE_ORDERS.has(s.order.type) && s !== pair && !guardsEngine && !called) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || v.state === 'wrecked' || v.state === 'burnt' || v.def.flying || !POLICE_FLEET.has(v.kind) && !TROOP_KINDS.has(v.kind)) continue;
      if (Math.hypot(v.x - lead.x, v.z - lead.z) > (called ? MOTOR_RADIUS : COMPANY_RADIUS)) continue;
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
    return out;
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
      const crew = this.crewCount(sid);
      // embarquement terminé (tous ceux qui ont une place sont à bord) : pas d'attente pour un agent resté sans place
      if (crew.onFoot > 0 && !st.boarded && now - st.since < MOTOR_READY_MAX) continue;
      st.ready = true;
      const to = ctx.squads.get(me.squadId)?.name ?? me.name;
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
    this.ride = next;
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    let prev: EntityId = lead.id;
    for (const id of next) {
      const v = ctx.vehicles.get(id);
      if (!v) continue;
      if (pilot) {
        const st = pilot.status ? pilot.status(v) : null;
        if (this.mayFollow(v, prev, lead, st) && (!st || st.mode !== 'follow' || st.leaderId !== prev)) pilot.follow(v, prev, COLUMN_GAP);
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
      p.cmd.moveX = dx / d;
      p.cmd.moveZ = dz / d;
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
        if (this.mayFollow(v, prev, lead, st) && (!st || st.mode !== 'follow' || st.leaderId !== prev)) pilot.follow(v, prev, COLUMN_GAP);
      }
      this.mirrorLights(v, lead, ext);
      prev = v.id;
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
    this.column = [];
    this.escorts = [];
    this.mounted = 0;
  }
}
