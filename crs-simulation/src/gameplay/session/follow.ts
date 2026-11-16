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
}
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
/** Rayon dans lequel les fourgons d'une unité accompagnatrice peuvent rejoindre la colonne (m). */
const COMPANY_RADIUS = 160;
/** Unités appelées « avec moi » : rayon dans lequel leurs véhicules rejoignent la colonne (m), revue périodique (s). */
const CALLED_RADIUS = 700;
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

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  reset(): void {
    this.mounted = 0;
    this.assign.clear();
    this.column = [];
    this.escorts = [];
    this.escortSince = 0;
    this.nextThink = 0;
    // l'horloge repart de 0 à chaque session : une échéance héritée bloquerait la revue « avec moi »
    this.nextJoin = 0;
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

    if (isDriver && this.mounted !== driving.id) this.startConvoy(me, driving);
    else if (!isDriver && this.mounted !== 0) this.endConvoy();

    if (this.mounted === 0) return;
    // marche vers les véhicules (à chaque pas : l'IA de police réécrit les commandes avant nous)
    this.walkToSeats(me, now);
    if (now < this.nextThink) return;
    this.nextThink = now + 0.5;
    void dt;
    this.board(now);
    // unités appelées « avec moi » arrivées entre-temps (venues en véhicules de loin) : elles prennent place dans la colonne
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
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || mine.indexOf(s) >= 0 || s.vehicleId === 0 || s.vehicleId === lead.id) continue;
      if (s.members.length === 0 || s.leaderId === me.id) continue;
      // unités appelées « avec moi » sur la carte tactique (ordre « suivre » le joueur, à elles ou à une unité mère)
      const called = this.withMe(s, me.id);
      const under = this.underAny(s, led) || s === pair || called;
      if (!under && !(companyFree && this.rootOf(s.id) === company)) continue;
      // l'escorte à pied d'un blindé (session/engins.ts) part avec la colonne, dans son fourgon
      const guardsEngine = s.order.type === 'proteger' && ARMORED.has(ctx.vehicles.get(s.order.targetId)?.kind ?? '');
      if (!FREE_ORDERS.has(s.order.type) && s !== pair && !guardsEngine) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || v.state === 'wrecked' || v.state === 'burnt' || v.def.flying || !POLICE_FLEET.has(v.kind) && !TROOP_KINDS.has(v.kind)) continue;
      if (Math.hypot(v.x - lead.x, v.z - lead.z) > (called ? CALLED_RADIUS : COMPANY_RADIUS)) continue;
      if (this.escorts.indexOf(s.id) >= 0) continue;
      // le véhicule doit être libre, ou déjà occupé par les siens
      if (v.seats.some((id) => id !== 0 && s.members.indexOf(id) < 0)) continue;
      this.escorts.push(s.id);
      if (this.column.indexOf(v.id) < 0) this.column.push(v.id);
      ctx.squads.issue(s.id, { type: 'embarquer', issuedBy: me.id });
    }
    this.escortSince = ctx.clock.now;
  }

  /** L'unité (ou une unité dont elle dépend) a-t-elle l'ordre de suivre le joueur ? */
  private withMe(s: Squad, meId: EntityId): boolean {
    const ctx = this.ctx!;
    let q: Squad | undefined = s;
    for (let guard = 0; q && guard < 8; guard++) {
      if (q.order.type === 'suivre' && q.order.targetId === meId) return true;
      q = q.parentId !== 0 ? ctx.squads.get(q.parentId) ?? undefined : undefined;
    }
    return false;
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
        if (!st || st.mode !== 'follow' || st.leaderId !== prev) pilot.follow(v, prev, COLUMN_GAP);
      }
      if (v.siren !== lead.siren) {
        if (ext && ext.setSiren) ext.setSiren(v, lead.siren);
        else { v.siren = lead.siren; ctx.events.emit('vehicle:siren', { id: v.id, siren: lead.siren }); }
      }
      if (v.beacons !== lead.beacons) {
        if (ext && ext.setBeacons) ext.setBeacons(v, lead.beacons);
        else v.beacons = lead.beacons;
      }
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
      if (p && p.vehicleId !== 0) ctx.vehicles.exit(p);
    }
    // les groupes accompagnateurs débarquent en ligne à côté de leur fourgon
    for (const sid of this.escorts) {
      const sq = ctx.squads.get(sid);
      const v = sq ? ctx.vehicles.get(sq.vehicleId) : undefined;
      if (!sq || !v) continue;
      // un équipage d'engin (canon à eau, Centaure) reste à son poste
      if (sq.kind === 'equipage') continue;
      const side = v.heading + Math.PI / 2;
      ctx.squads.issue(sid, { type: 'debarquer', x: v.x + Math.sin(side) * 4, z: v.z + Math.cos(side) * 4, heading: v.heading, width: 0, issuedBy: ctx.player.person()?.id ?? 0 });
    }
    this.assign.clear();
    this.column = [];
    this.escorts = [];
    this.mounted = 0;
  }
}
