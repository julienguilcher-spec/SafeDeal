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

  protected copy(o: SquadOrder): SquadOrder {
    return { type: o.type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce, issuedAt: o.issuedAt, issuedBy: o.issuedBy };
  }

  /** Ordre interne donné à sa propre unité : exécuté par le module de police. */
  protected internal(order: Partial<SquadOrder> & { type: OrderType }): void {
    this.pass = this.core.issue(this.squad.id, order);
  }

  /** Indicatif de l'échelon auquel rendre compte. */
  protected superior(): string {
    const o = this.order;
    const ctx = this.core.ctx;
    if (o && o.issuedBy !== 0) {
      const by = ctx.people.get(o.issuedBy);
      const s = by && by.squadId !== 0 ? ctx.squads.get(by.squadId) : undefined;
      if (s && s.id !== this.squad.id && s.name !== '') return s.name;
    }
    const parent = this.squad.parentId !== 0 ? ctx.squads.get(this.squad.parentId) : undefined;
    return parent && parent.name !== '' ? parent.name : 'CENTRAL';
  }

  protected say(text: string, priority: 0 | 1 | 2 = 1): void {
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

  constructor(private readonly core: CommandCore) {}

  register(factory: SpecialFactory): void {
    this.factories.push(factory);
  }

  reset(): void {
    this.list.length = 0;
    this.statuses.length = 0;
    this.scanAt = 0;
    this.scannedSquads = -1;
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
    let sp = this.of(squad.id);
    if (!sp) {
      // unité créée dans ce même pas : reconnaissance immédiate
      this.scan(true);
      sp = this.of(squad.id);
      if (!sp) return false;
    }
    if (sp.pass !== null && (o === sp.pass || (o.issuedAt === sp.pass.issuedAt && o.type === sp.pass.type))) return false;
    return sp.claim(o);
  }

  onPoliceDone(e: PoliceOrderDone): void {
    const sp = this.of(e.squadId);
    if (sp) sp.onPoliceDone(e.type, e.ok, e.reason);
  }

  think(): void {
    const now = this.core.now;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
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
