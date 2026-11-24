/* =====================================================================================
 * COMMANDEMENT — unités spéciales : socle commun et registre.
 *
 * Une unité spéciale (BRAV-M en selle, Centaure, engin lanceur d'eau, drone) exécute elle-même
 * certains ordres reçus par ctx.squads.issue : le module de police lui passe la main par son
 * crochet (Kernel.orderHook). Quand le contrôleur a besoin d'une manœuvre à pied (colonne,
 * interpellation, rembarquement), il redonne un ordre à sa propre unité et le marque (`pass`) pour
 * que le crochet le laisse au module de police.
 * Les unités sont reconnues d'après ce qu'elles sont (engin de l'équipage, motos des binômes,
 * télépilote), quelle que soit leur origine.
 * ===================================================================================== */

import type { EntityId, OrderType, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { ORDER_DONE_EVENT, ORDER_REFUSED_EVENT } from '../api';
import type { PoliceOrderDone } from '../api';
import { COMMAND_SPECIAL_EVENT } from './api';
import type { SpecialEvent, SpecialKind, SpecialStatus } from './api';
import type { CommandCore } from './core';
import type { Picture } from './picture';
import type { Unit } from '../brain';
import { unitOf } from '../brain';

export abstract class SpecialUnit {
  readonly status: SpecialStatus;
  /** Ordre posé par le contrôleur lui-même : laissé au module de police. */
  pass: SquadOrder | null = null;
  /** Ordre pris en charge, en cours d'exécution (copie), ou null. */
  order: SquadOrder | null = null;
  stageT = 0;
  thinkAt = 0;
  /** Position de départ (base de repli, point d'eau par défaut). */
  homeX = 0;
  homeZ = 0;
  homeSet = false;

  constructor(protected readonly core: CommandCore, protected readonly pic: Picture, readonly squad: Squad, kind: SpecialKind) {
    this.status = { squadId: squad.id, kind, stage: 'repos', vehicleId: 0, order: '', supply: -1, targetId: 0, x: 0, z: 0 };
  }

  /** L'unité existe-t-elle encore (membres ou engin) ? */
  abstract alive(): boolean;
  /** Prend en charge l'ordre (true) ou le laisse au module de police (false). */
  abstract claim(o: SquadOrder): boolean;
  /** Réflexion (quelques fois par seconde). */
  abstract think(): void;
  /** À chaque pas : gestes continus (détente du canon à eau tenue). */
  step(): void { /* rien par défaut : la plupart des unités n'ont pas de geste continu */ }
  /** Fin d'un ordre exécuté par le module de police pour cette unité (ordre interne). */
  onPoliceDone(_type: OrderType, _ok: boolean, _reason: string): void { /* sans objet par défaut */ }

  protected setStage(stage: string): void {
    if (this.status.stage === stage) return;
    this.status.stage = stage;
    this.stageT = this.core.now;
  }

  protected sinceStage(): number {
    return this.core.now - this.stageT;
  }

  /** Copie d'un ordre (le nom du lieu et la marque « donné par le joueur » compris). */
  protected copy(o: SquadOrder): SquadOrder {
    const c: SquadOrder = { type: o.type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce, issuedAt: o.issuedAt, issuedBy: o.issuedBy };
    if (o.place) c.place = o.place;
    if (o.byPlayer) c.byPlayer = true;
    return c;
  }

  /**
   * L'ordre affiché (Squad.order) reste celui que l'unité a reçu pendant ses manœuvres internes (voir internal) : le
   * joueur qui a envoyé la BRAV-M lit « Envoyer », pas « embarquer » ni « colonne » pendant qu'elle remonte en selle.
   */
  protected keepShown = false;
  keepsShown(): boolean {
    return this.keepShown;
  }
  /**
   * Unité qui ne se fond pas dans la manœuvre d'un ordre donné à une unité supérieure (voir relayFrom) : la BRAV-M ne
   * tient pas la ligne de la compagnie, elle exécute elle-même ce qu'elle peut en faire.
   */
  standsApart = false;
  /** Manœuvre interne posée, que le module de police n'a pas encore prise (Kernel.internalOrder). */
  queued: SquadOrder | null = null;
  /** Ordre affiché quand la manœuvre interne a été posée (l'objet de Squad.order). */
  shown: SquadOrder | null = null;
  /** Le module de police vient de prendre la manœuvre interne : ordres des sous-unités et accusé à rétablir (registre). */
  settling = false;
  /** Ordres des sous-unités avant la manœuvre interne (le module de police leur en pose une copie). */
  readonly kidsOrders = new Map<number, SquadOrder>();

  /**
   * Ordre interne donné à sa propre unité : exécuté par le module de police. Avec keepShown, l'ordre affiché reste
   * celui reçu : la manœuvre passe par Kernel.internalOrder, elle n'est jamais lue dans le magasin.
   */
  protected internal(order: Partial<SquadOrder> & { type: OrderType }): void {
    const squad = this.squad;
    const shown = squad.order;
    if (this.keepShown) {
      this.kidsOrders.clear();
      this.rememberKids(squad.id, 0);
    }
    this.pass = this.core.issue(squad.id, order);
    if (this.keepShown && this.pass && this.pass !== shown) {
      squad.order = shown;
      this.shown = shown;
      this.queued = this.pass;
      this.settling = false;
    }
  }

  private rememberKids(id: number, depth: number): void {
    const kids = this.core.ctx.squads.childrenOf(id);
    for (let i = 0; i < kids.length; i++) {
      this.kidsOrders.set(kids[i].id, kids[i].order);
      if (depth < 4) this.rememberKids(kids[i].id, depth + 1);
    }
  }

  /**
   * Ordre reçu par une unité supérieure (toute la compagnie) : ce que cette unité en fait elle-même (ordre à se donner),
   * ou null pour garder le sien. Sans objet par défaut (les unités spéciales qui ne se tiennent pas à part).
   */
  relayFrom(_o: SquadOrder): SquadOrder | null {
    return null;
  }

  /** Indicatif de l'échelon auquel rendre compte. */
  protected superior(): string {
    const o = this.order;
    const ctx = this.core.ctx;
    if (o && o.issuedBy !== 0) {
      const by = ctx.people.get(o.issuedBy);
      const s = by && by.squadId !== 0 ? ctx.squads.get(by.squadId) : undefined;
      // (ordre donné par son propre chef, membre d'une sous-unité — chef de groupe de la BRAV-M dans le premier
      // binôme : on rend compte à l'échelon supérieur, pas à son propre binôme « FAUCON UN-UN ICI FAUCON UN »)
      let inside = false;
      for (let q = s, guard = 0; q && guard < 8 && !inside; q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined, guard++) inside = q.id === this.squad.id;
      if (s && !inside && s.name !== '') return s.name;
    }
    const parent = this.squad.parentId !== 0 ? ctx.squads.get(this.squad.parentId) : undefined;
    return parent && parent.name !== '' ? parent.name : 'CENTRAL';
  }

  /** Ordre reçu de l'unité supérieure (relayFrom) : l'unité l'exécute sans en accuser réception (l'unité supérieure l'a fait). */
  quiet = false;

  protected say(text: string, priority: 0 | 1 | 2 = 1): void {
    if (this.quiet) return;
    this.core.say(this.squad.name, text, priority, 'unite', this.squad.leaderId);
  }

  protected emitStage(stage: string, ok: boolean, reason: string): void {
    const e: SpecialEvent = { squadId: this.squad.id, kind: this.status.kind, stage, ok, reason };
    this.core.ctx.events.emitAny(COMMAND_SPECIAL_EVENT, e);
  }

  /** Clôt l'ordre en cours : événement 'police:order_done' (comme toute unité), étape de l'unité spéciale. */
  protected finish(ok: boolean, reason: string): void {
    const o = this.order;
    this.order = null;
    this.status.order = '';
    if (!o) return;
    const done: PoliceOrderDone = { squadId: this.squad.id, type: o.type, ok, reason };
    this.core.ctx.events.emitAny(ORDER_DONE_EVENT, done);
    this.emitStage('termine', ok, reason);
  }

  /** Refus motivé d'un ordre (moyen de force non licite, engin indisponible). */
  protected refuse(o: SquadOrder, reason: string): void {
    const ctx = this.core.ctx;
    ctx.events.emitAny(ORDER_REFUSED_EVENT, { squadId: this.squad.id, type: o.type, reason });
    ctx.events.emitAny(ORDER_DONE_EVENT, { squadId: this.squad.id, type: o.type, ok: false, reason });
    this.emitStage('refus', false, reason);
    if (this.order === o || (this.order && this.order.issuedAt === o.issuedAt && this.order.type === o.type)) {
      this.order = null;
      this.status.order = '';
    }
  }

  /** Occupant assis à la n-ième place du rôle demandé (null si personne). */
  protected seated(v: Vehicle, role: 'driver' | 'gunner' | 'passenger', index = 0): Person | null {
    let n = 0;
    for (let i = 0; i < v.def.seats.length; i++) {
      if (v.def.seats[i].role !== role) continue;
      if (n++ === index) {
        const id = v.seats[i];
        return id !== 0 ? this.core.ctx.people.get(id) ?? null : null;
      }
    }
    return null;
  }

  protected rememberHome(x: number, z: number): void {
    if (this.homeSet) return;
    this.homeSet = true;
    this.homeX = x;
    this.homeZ = z;
  }
}

/** Fabrique d'un contrôleur pour une unité reconnue comme spéciale (null sinon). */
export type SpecialFactory = (squad: Squad) => SpecialUnit | null;

export class SpecialRegistry {
  readonly list: SpecialUnit[] = [];
  readonly statuses: SpecialStatus[] = [];
  private readonly factories: SpecialFactory[] = [];
  private scanAt = 0;
  private scannedSquads = -1;

  /** Ordres reçus d'une unité supérieure, à transmettre aux unités spéciales qui s'en tiennent à part (voir keepsOwn). */
  private readonly relays: { sp: SpecialUnit; order: SquadOrder }[] = [];
  /** Instant d'émission du dernier ordre transmis, par unité ; unités dont l'accusé de l'ordre transmis est à taire. */
  private readonly relayed = new Map<number, number>();
  private readonly muted: number[] = [];
  private readonly internalFn = (u: Unit): SquadOrder | null => this.internalFor(u.squad);
  private readonly keepsFn = (d: Unit, o: SquadOrder, root: Unit): boolean => this.keepsOwn(d, o, root);

  constructor(private readonly core: CommandCore) {}

  register(factory: SpecialFactory): void {
    this.factories.push(factory);
  }

  reset(): void {
    this.list.length = 0;
    this.statuses.length = 0;
    this.relays.length = 0;
    this.relayed.clear();
    this.muted.length = 0;
    this.scanAt = 0;
    this.scannedSquads = -1;
  }

  /** Branche les points d'extension du module de police (manœuvres internes, unités qui gardent leur ordre). */
  private bind(): void {
    const pk = this.core.pk;
    if (!pk) return;
    pk.internalOrder = this.internalFn;
    pk.keepsOwnOrder = this.keepsFn;
  }

  /**
   * Kernel.internalOrder : la manœuvre interne posée par l'unité spéciale (une seule fois), si aucun ordre n'est arrivé
   * depuis — sinon le module de police traite ce nouvel ordre (crochet, prise en charge).
   */
  private internalFor(squad: Squad): SquadOrder | null {
    const sp = this.of(squad.id);
    if (!sp || sp.queued === null) return null;
    const q = sp.queued;
    sp.queued = null;
    if (squad.order !== sp.shown) return null;
    sp.settling = true;
    return q;
  }

  /**
   * Kernel.keepsOwnOrder : unité spéciale qui se tient à part (BRAV-M) sous l'unité qui reçoit l'ordre. Elle n'est pas
   * fondue dans sa manœuvre (elle redevient sa propre racine) ; ce qu'elle doit en faire lui est donné au pas suivant
   * (relayFrom). L'unité du joueur sous une unité de l'IA garde ses ordres ; une unité jointe à une autre est laissée au
   * module de police.
   */
  private keepsOwn(d: Unit, o: SquadOrder, root: Unit): boolean {
    let sp = this.of(d.squad.id);
    if (!sp) {
      // unité créée dans ce même pas (mise en place de la session) : reconnaissance immédiate, comme pour le crochet
      this.scan(true);
      sp = this.of(d.squad.id);
    }
    if (!sp || !sp.standsApart || d.joinedTo !== null) return false;
    const wasRoot = d.isRoot;
    d.isRoot = true;
    const pid = this.core.ctx.player.state.personId;
    const mine = pid !== 0 && d.squad.leaderId === pid;
    const fromPlayer = pid !== 0 && root.squad.leaderId === pid;
    let relay: SquadOrder | null = mine && !fromPlayer ? null : sp.relayFrom(o);
    // (elle manœuvrait avec l'unité supérieure, sans ordre propre : elle garde le sien — suivre — ou tient sa place)
    if (!relay && !wasRoot && sp.order === null) {
      const own = d.squad.order;
      relay = own.type === 'suivre' ? { ...own } : { ...own, type: 'tenir', targetId: 0, byPlayer: undefined, place: undefined };
      if (relay.type === 'tenir' && this.core.centerOf(d.squad.id)) {
        relay.x = this.core.v2.x;
        relay.z = this.core.v2.z;
      }
    }
    if (relay) this.relays.push({ sp, order: relay });
    return true;
  }

  of(squadId: number): SpecialUnit | null {
    const list = this.list;
    for (let i = 0; i < list.length; i++) if (list[i].squad.id === squadId) return list[i];
    return null;
  }

  firstOf(kind: SpecialKind, attached: readonly number[] | null): SpecialUnit | null {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      if (list[i].status.kind !== kind) continue;
      if (attached && attached.indexOf(list[i].squad.id) < 0) continue;
      return list[i];
    }
    return null;
  }

  /** Reconnaît les unités spéciales parmi les unités de police (une fois par seconde, ou quand le magasin change). */
  scan(force = false): void {
    const core = this.core;
    const squads = core.ctx.squads.list;
    if (!force && core.now < this.scanAt && squads.length === this.scannedSquads) return;
    this.scanAt = core.now + 1;
    this.scannedSquads = squads.length;
    // retrait des unités disparues
    for (let i = this.list.length - 1; i >= 0; i--) {
      const sp = this.list[i];
      if (core.ctx.squads.get(sp.squad.id) !== sp.squad || !sp.alive()) {
        this.list.splice(i, 1);
        this.statuses.splice(i, 1);
      }
    }
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.faction !== 'police' || this.of(s.id)) continue;
      for (let f = 0; f < this.factories.length; f++) {
        const sp = this.factories[f](s);
        if (sp) {
          this.list.push(sp);
          this.statuses.push(sp.status);
          break;
        }
      }
    }
  }

  /** Crochet du module de police : true si une unité spéciale prend l'ordre en charge. */
  hook(squad: Squad, o: SquadOrder): boolean {
    this.bind();
    let sp = this.of(squad.id);
    if (!sp) {
      // unité créée dans ce même pas : reconnaissance immédiate
      this.scan(true);
      sp = this.of(squad.id);
      if (!sp) return false;
    }
    if (sp.pass !== null && (o === sp.pass || (o.issuedAt === sp.pass.issuedAt && o.type === sp.pass.type))) return false;
    // ordre transmis de l'unité supérieure (voir keepsOwn) : exécuté sans accusé de réception
    const relayed = this.relayed.get(squad.id) === o.issuedAt;
    sp.quiet = relayed;
    let claimed = false;
    try {
      claimed = sp.claim(o);
    } finally {
      sp.quiet = false;
    }
    if (!claimed) {
      if (relayed) this.muted.push(squad.id);
      return false;
    }
    // (prise en charge : les sous-unités — binômes — affichent l'ordre de leur unité, qu'elle exécute elle-même)
    if (sp.keepsShown()) this.showOnKids(squad.id, o, 0);
    return true;
  }

  private showOnKids(id: number, o: SquadOrder, depth: number): void {
    const kids = this.core.ctx.squads.childrenOf(id);
    for (let i = 0; i < kids.length; i++) {
      const c: SquadOrder = { ...o };
      kids[i].order = c;
      if (depth < 4) this.showOnKids(kids[i].id, o, depth + 1);
    }
  }

  /**
   * Le module de police vient d'exécuter la manœuvre interne (même pas, avant le commandement) : les sous-unités, qui en
   * ont reçu une copie, retrouvent l'ordre qu'elles affichaient ; l'accusé de réception de la manœuvre ne part pas
   * (l'unité spéciale a déjà accusé l'ordre reçu — un second « reçu » couperait le premier sur le réseau prioritaire).
   */
  private settle(sp: SpecialUnit): void {
    sp.settling = false;
    const pass = sp.pass;
    if (!pass) return;
    const squads = this.core.ctx.squads;
    for (const [id, order] of sp.kidsOrders) {
      const s = squads.get(id);
      if (s && s.order !== order && s.order.type === pass.type && s.order.issuedAt === pass.issuedAt) s.order = order;
    }
    sp.kidsOrders.clear();
    const u = unitOf(sp.squad);
    if (u && u.ackText !== '' && u.order !== null && u.order.issuedAt === pass.issuedAt) u.ackText = '';
  }

  onPoliceDone(e: PoliceOrderDone): void {
    const sp = this.of(e.squadId);
    if (sp) sp.onPoliceDone(e.type, e.ok, e.reason);
  }

  think(): void {
    this.bind();
    const now = this.core.now;
    const list = this.list;
    // ordres de l'unité supérieure transmis aux unités qui s'en tiennent à part (voir keepsOwn)
    for (let i = 0; i < this.relays.length; i++) {
      const r = this.relays[i];
      if (this.of(r.sp.squad.id) !== r.sp) continue;
      const issued = this.core.issue(r.sp.squad.id, r.order);
      if (issued) this.relayed.set(r.sp.squad.id, issued.issuedAt);
    }
    this.relays.length = 0;
    // accusé de réception d'un ordre transmis, exécuté par le module de police : il ne part pas (voir hook)
    for (let i = 0; i < this.muted.length; i++) {
      const sp = this.of(this.muted[i]);
      const u = sp ? unitOf(sp.squad) : null;
      if (u && u.ackText !== '' && u.order !== null && u.order.issuedAt === this.relayed.get(sp!.squad.id)) u.ackText = '';
    }
    this.muted.length = 0;
    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
      if (sp.settling) this.settle(sp);
      sp.step();
      if (now >= sp.thinkAt) {
        sp.thinkAt = now + 0.25;
        sp.think();
      }
    }
  }
}

/** Entité visée par un ordre : position dans core.v2 ; retourne false si l'identifiant ne désigne rien. */
export function locate(core: CommandCore, id: EntityId): boolean {
  if (id <= 0) return false;
  const ctx = core.ctx;
  const p = ctx.people.get(id);
  if (p) {
    core.v2.x = p.x;
    core.v2.z = p.z;
    return true;
  }
  const v = ctx.vehicles.get(id);
  if (v) {
    core.v2.x = v.x;
    core.v2.z = v.z;
    return true;
  }
  const prop = ctx.props.get(id);
  if (prop) {
    core.v2.x = prop.x;
    core.v2.z = prop.z;
    return true;
  }
  return false;
}
