/* =====================================================================================
 * COMMANDEMENT — le commandement d'UNE compagnie : dispositif, accompagnement du cortège,
 * logistique, fin de mission. Les réactions aux points chauds et la procédure des sommations sont
 * dans react.ts, la délégation des incidents dans delegate.ts.
 *
 * Le commandant IA décide par `act()` : en mode « ia » la décision est exécutée (ordre par
 * ctx.squads.issue, message radio, inscription au journal) ; en mode « adjoint » (le joueur
 * commande) la même décision devient une PROPOSITION dite à la radio, que le joueur peut accepter.
 *
 * Articulation (docs/research/06-roles-jouables.md §4.2, bible §E) :
 *   - les sections de manœuvre tiennent les débouchés latéraux du parcours (canalisation), fractionnées
 *     en groupes quand il y a plus de débouchés que de sections ; la dernière section est la réserve ;
 *   - le dispositif glisse avec le cortège : un barrage dépassé par la queue est levé, son unité se
 *     reporte en avant ; les rues en avant de la tête sont fermées à la circulation à l'avance ;
 *   - relève d'une unité épuisée par la réserve, ravitaillement aux fourgons ;
 *   - fin de mission : regroupement, rembarquement, « Fin de mission, retour à la base ».
 * ===================================================================================== */

import type { EntityId, OrderType, Person, Squad, SquadOrder } from '@/core/contracts';
import { cardinalFr } from '@/core/math';
import type { PoliceOrderDone } from '../api';
import { agentOf, unitOf } from '../brain';
import {
  COMMAND_DEPLOYED_EVENT, COMMAND_MISSION_END_EVENT, COMMAND_STATE_EVENT,
} from './api';
import type { CommandMode, CommandPhase, CommandState, CommandStateEvent, Post } from './api';
import type { Adjoint } from './adjoint';
import type { ConvoyControl } from './convoy';
import type { CommandCore } from './core';
import type { Picture } from './picture';
import { planPosts } from './plan';
import type { SpecialRegistry } from './special';
import * as TX from './texts';

export interface Element {
  squadId: number;
  name: string;
  size: number;
  /** Section d'appartenance (elle-même pour une section entière). */
  sectionId: number;
  role: 'libre' | 'poste' | 'reserve';
  post: Post | null;
  /** Dernier ordre de formation donné par le commandant, et son instant. */
  lastType: OrderType | '';
  lastAt: number;
  inPlace: boolean;
  /** Tâche confiée ('' si aucune), son instant, et l'affaire (incident) qu'elle traite. */
  task: OrderType | '';
  taskAt: number;
  affairId: number;
  /** Tâche à donner une fois le déplacement préalable terminé. */
  pending: (Partial<SquadOrder> & { type: OrderType }) | null;
  /** Grenades lacrymogènes à la prise de commandement (seuil de ravitaillement). */
  ammo0: number;
  reliefAt: number;
  /** Retenu par une manœuvre en cours (ligne d'appui des sommations) : ni tâche ni autre mission. */
  hold: boolean;
}

/** Groupe de commandement d'une section fractionnée : il suit le groupe d'appui de sa section. */
interface Support {
  squadId: number;
  followId: EntityId;
  ordered: boolean;
}

/** Allure d'une unité qui rejoint un emplacement en colonne (m/s) et allure moyenne d'un cortège (m/s). */
const MARCH_SPEED = 1.2;
const CORTEGE_SPEED = 0.7;

/** Durée maximale de la mise en place avant de déclarer le dispositif en l'état (s). */
const DEPLOY_TIMEOUT = 150;

export class Command {
  readonly state: CommandState;
  readonly posts: Post[] = [];
  readonly elements: Element[] = [];
  private readonly supports: Support[] = [];
  /** Moyens rattachés (unités spéciales, pelotons) : numéros d'unité. */
  readonly attached: number[] = [];
  thinkAt = 0;
  phaseT = 0;
  /** Lieu de rassemblement, poste de commandement (réserve, regroupement). */
  gx = 0;
  gz = 0;
  pcX = 0;
  pcZ = 0;
  pcH = 0;
  private planned = false;
  private routeN = -1;
  private ordered = 0;
  private readonly cooldowns = new Map<string, number>();
  endRequested = false;
  private endStep = 0;
  private endT = 0;
  private embarkTries = 0;
  private embarkDone = false;
  private readonly rallied: number[] = [];
  private phaseSeen = '';
  private phaseSince = 0;
  private readonly inflow = new Map<number, number>();
  private readonly closedStations: number[] = [];
  base: { x: number; z: number } | null = null;
  /** Délai de décision du commandant (s) : plus court quand il est bon. */
  latency = 3;

  constructor(
    readonly core: CommandCore, readonly pic: Picture, readonly specials: SpecialRegistry, readonly convoy: ConvoyControl,
    readonly adjoint: Adjoint, readonly squad: Squad, mode: CommandMode, aptitude: number,
  ) {
    this.state = {
      squadId: squad.id, mode, phase: 'mise_en_place', commanderId: squad.leaderId, aptitude, reserveId: 0, posts: this.posts,
      deployedAt: -1, sommations: 'aucune', authorized: core.ctx.law.roe.authorizedForce, missionEnded: false, closuresAsked: 0,
      stationsClosed: 0, delegated: 0, resolved: 0,
    };
    this.phaseT = core.now;
    this.latency = 12 - 10 * aptitude;
  }

  // ───────────────────────────── outils ─────────────────────────────

  get ia(): boolean {
    return this.state.mode === 'ia';
  }

  /** Le commandant (personnage unique à l'écharpe) s'il est en état de commander. */
  commander(): Person | null {
    const p = this.core.leader(this.squad);
    if (!p) return null;
    this.state.commanderId = p.id;
    return p;
  }

  /** Identifiant porté par les ordres (issuedBy) : le commandant IA, ou le joueur quand il commande. */
  issuer(): EntityId {
    if (!this.ia) {
      const pid = this.core.ctx.player.state.personId;
      if (pid !== 0) return pid;
    }
    return this.squad.leaderId;
  }

  setPhase(phase: CommandPhase): void {
    const st = this.state;
    if (st.phase === phase) return;
    const e: CommandStateEvent = { squadId: st.squadId, phase, previous: st.phase };
    st.phase = phase;
    this.phaseT = this.core.now;
    this.core.ctx.events.emitAny(COMMAND_STATE_EVENT, e);
  }

  /** Vrai une fois par `cooldown` secondes pour une même clé (évite de répéter une décision). */
  ready(key: string, cooldown: number): boolean {
    const now = this.core.now;
    const next = this.cooldowns.get(key);
    if (next !== undefined && now < next) return false;
    this.cooldowns.set(key, now + cooldown);
    return true;
  }

  /** Annule le délai d'une clé (la décision pourra être reprise tout de suite). */
  unready(key: string): void {
    this.cooldowns.delete(key);
  }

  /**
   * Décision : exécutée tout de suite par le commandant IA ; proposée au joueur par l'adjoint sinon
   * (`advice` : phrase « Chef, … », `exec` null si seul le joueur peut le faire).
   */
  act(key: string, priority: number, x: number, z: number, advice: string, exec: (() => void) | null): void {
    if (this.ia) {
      if (exec) exec();
      return;
    }
    this.adjoint.offer(this, key, priority, x, z, advice, exec);
  }

  /** Message radio du commandant (ou de son adjoint quand le joueur commande). */
  say(text: string, priority: 0 | 1 | 2 = 1): void {
    const speaker = this.ia ? this.squad.leaderId : this.adjoint.speakerOf(this);
    this.core.say(this.squad.name, text, priority, 'commandement', speaker);
  }

  /** Ordre de formation donné à un élément, avec message radio et inscription au journal. */
  order(el: Element, key: string, order: Partial<SquadOrder> & { type: OrderType }, text: string): void {
    const core = this.core;
    if (order.issuedBy === undefined) order.issuedBy = this.issuer();
    if (text !== '') this.say(text);
    core.issue(el.squadId, order);
    el.lastType = order.type;
    el.lastAt = core.now;
    el.inPlace = false;
    if (text !== '') core.decide(this.squad.id, key, text, el.squadId, order.type, order.x ?? 0, order.z ?? 0);
  }

  /** Ordre de tâche (la formation de l'élément ne change pas). */
  task(el: Element, key: string, order: Partial<SquadOrder> & { type: OrderType }, text: string, affairId = 0): void {
    const core = this.core;
    if (order.issuedBy === undefined) order.issuedBy = this.issuer();
    if (text !== '') this.say(text);
    core.issue(el.squadId, order);
    el.task = order.type;
    el.taskAt = core.now;
    el.affairId = affairId;
    core.decide(this.squad.id, key, text, el.squadId, order.type, order.x ?? 0, order.z ?? 0);
  }

  /** Mouvement urgent : les colonnes de cet élément marchent au trot pendant `seconds` secondes. */
  hurry(el: Element, seconds = 300): void {
    const u = unitOf(this.core.ctx.squads.get(el.squadId));
    if (u) u.trotUntil = this.core.now + seconds;
  }

  element(squadId: number): Element | null {
    const list = this.elements;
    for (let i = 0; i < list.length; i++) if (list[i].squadId === squadId) return list[i];
    return null;
  }

  /** Élément dont dépend l'unité (elle-même, ou sa section). */
  elementOver(squadId: number): Element | null {
    const list = this.elements;
    for (let i = 0; i < list.length; i++) if (this.core.isUnder(squadId, list[i].squadId) || this.core.isUnder(list[i].squadId, squadId)) return list[i];
    return null;
  }

  /** Élément disponible le plus proche de (x, z) : la réserve d'abord, puis un élément libre. */
  available(x: number, z: number): Element | null {
    const core = this.core;
    let best: Element | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      if (el.role === 'poste' || el.task !== '' || el.pending || el.hold) continue;
      const st = core.status ? core.status.of(el.squadId) : null;
      if (st && (st.valid < Math.max(2, st.total * 0.5) || st.phase === 'embarque')) continue;
      if (!core.centerOf(el.squadId)) continue;
      const d = Math.hypot(core.v2.x - x, core.v2.z - z) - (el.role === 'reserve' ? 0 : 20) - el.size * 2;
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    return best;
  }

  /** Élément (posté ou non) le plus proche de (x, z), dans la limite donnée. */
  nearest(x: number, z: number, maxDist: number, needExtinguisher: boolean): Element | null {
    const core = this.core;
    let best: Element | null = null;
    let bestD = maxDist;
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      if (el.task !== '' || el.pending || el.hold) continue;
      const st = core.status ? core.status.of(el.squadId) : null;
      if (st && (st.valid < 2 || st.phase === 'embarque')) continue;
      if (needExtinguisher && st && st.ammo.extincteur <= 0) continue;
      if (!core.centerOf(el.squadId)) continue;
      const d = Math.hypot(core.v2.x - x, core.v2.z - z);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    return best;
  }

  // ───────────────────────────── articulation ─────────────────────────────

  /** Sections de manœuvre de la compagnie (et pelotons rattachés), hors unités spéciales. */
  private sections(out: Squad[]): void {
    out.length = 0;
    const core = this.core;
    const ctx = core.ctx;
    const consider = (s: Squad): void => {
      if (s.faction !== 'police' || this.specials.of(s.id)) return;
      if (s.kind !== 'section' && s.kind !== 'peloton' && s.kind !== 'groupe') return;
      // une section dont les subordonnés sont des unités spéciales (BRAV-M à plusieurs groupes) n'est pas de manœuvre
      const kids = ctx.squads.childrenOf(s.id);
      for (let i = 0; i < kids.length; i++) if (this.specials.of(kids[i].id)) return;
      if (core.members(s.id, core.people) === 0) return;
      out.push(s);
    };
    const kids = ctx.squads.childrenOf(this.squad.id);
    for (let i = 0; i < kids.length; i++) consider(kids[i]);
    for (let i = 0; i < this.attached.length; i++) {
      const s = ctx.squads.get(this.attached[i]);
      if (s && out.indexOf(s) < 0) consider(s);
    }
  }

  private addElement(s: Squad, sectionId: number, role: Element['role']): Element {
    const core = this.core;
    const size = core.members(s.id, core.people);
    let foot = 0;
    for (let i = 0; i < size; i++) if (core.people[i].poste !== 'conducteur') foot++;
    const st = core.status ? core.status.of(s.id) : null;
    const el: Element = {
      squadId: s.id, name: s.name, size: foot, sectionId, role, post: null, lastType: '', lastAt: -100, inPlace: false,
      task: '', taskAt: 0, affairId: 0, pending: null, ammo0: st ? st.ammo.lacrymoMain + st.ammo.lacrymoLanceur : 0, reliefAt: -1000,
      hold: false,
    };
    this.elements.push(el);
    return el;
  }

  /** Constitue les éléments de manœuvre : `split` fractionne les sections en groupes (sauf la réserve). */
  private buildElements(split: boolean): void {
    const core = this.core;
    const ctx = core.ctx;
    this.elements.length = 0;
    this.supports.length = 0;
    const secs: Squad[] = [];
    this.sections(secs);
    if (secs.length === 0) return;
    // la réserve : la dernière section (une seule unité : elle manœuvre, sans réserve)
    const reserveIndex = secs.length >= 2 ? secs.length - 1 : -1;
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i];
      if (i === reserveIndex) {
        const el = this.addElement(s, s.id, 'reserve');
        this.state.reserveId = el.squadId;
        continue;
      }
      const groups = split ? ctx.squads.childrenOf(s.id) : [];
      let made = 0;
      if (groups.length >= 3) {
        // groupes d'appui et d'intervention : éléments de manœuvre ; le groupe de commandement (celui du chef
        // de section) suit le premier d'entre eux
        let first: Squad | null = null;
        let command: Squad | null = null;
        for (let g = 0; g < groups.length; g++) {
          if (core.members(groups[g].id, core.people) === 0) continue;
          if (!command && s.leaderId !== 0 && groups[g].members.indexOf(s.leaderId) >= 0) {
            command = groups[g];
            continue;
          }
          this.addElement(groups[g], s.id, 'libre');
          if (!first) first = groups[g];
          made++;
        }
        if (command && first && made >= 2) this.supports.push({ squadId: command.id, followId: first.leaderId, ordered: false });
        else if (command) {
          this.addElement(command, s.id, 'libre');
          made++;
        }
      }
      if (made === 0) this.addElement(s, s.id, 'libre');
    }
  }

  /** Emplacement du dispositif actif à cet instant (devant la queue, dans l'horizon de la tête). */
  private isActive(post: Post): boolean {
    const pic = this.pic;
    if (post.state === 'leve') return false;
    if (!pic.active || pic.route.length < 4) return true;
    const horizon = this.core.tuning.horizon * (0.5 + 0.5 * this.state.aptitude);
    return post.s >= pic.tailS - 30 && post.s <= pic.headS + horizon;
  }

  private plan(): void {
    const core = this.core;
    const pic = this.pic;
    const cfg = core.ctx.session.config;
    // poste de commandement : là où se trouve la compagnie à la prise de commandement
    const cmd = this.commander();
    if (core.centerOf(this.squad.id)) {
      this.pcX = core.v2.x;
      this.pcZ = core.v2.z;
    } else if (cmd) {
      this.pcX = cmd.x;
      this.pcZ = cmd.z;
    }
    if (pic.route.length >= 2) {
      this.gx = pic.route[0];
      this.gz = pic.route[1];
    } else if (cfg && cfg.x !== undefined && cfg.z !== undefined) {
      this.gx = cfg.x;
      this.gz = cfg.z;
    } else {
      this.gx = this.pcX;
      this.gz = this.pcZ;
    }
    planPosts(core, pic, this.gx, this.gz, this.posts);
    this.settlePost();
    this.pcH = Math.atan2(this.gx - this.pcX, this.gz - this.pcZ);
    this.routeN = pic.route.length;
    this.planned = true;
    let active = 0;
    for (let i = 0; i < this.posts.length; i++) if (this.isActive(this.posts[i])) active++;
    const secs: Squad[] = [];
    this.sections(secs);
    // fractionnement en groupes quand il y a plus de débouchés que de sections de manœuvre (un bon chef le fait)
    this.buildElements(this.state.aptitude >= 0.4 && active > Math.max(1, secs.length - 1));
  }

  /**
   * Le poste de commandement (et la réserve) ne se tient jamais sur le parcours déclaré : s'il s'y trouve, il
   * est reporté dans la rue latérale la plus proche, 25 m derrière l'emplacement du barrage.
   */
  private settlePost(): void {
    const pic = this.pic;
    if (pic.route.length < 4) return;
    const s = pic.routeAbscissa(this.pcX, this.pcZ);
    if (this.core.v3.y > 20) return;
    let best: Post | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      if (p.kind !== 'barrage' || p.width > 30) continue;
      const d = Math.hypot(p.x - this.pcX, p.z - this.pcZ) + (p.s < s - 60 ? 200 : 0);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const v = this.core.v2;
    v.x = best.x - Math.sin(best.heading) * 25;
    v.z = best.z - Math.cos(best.heading) * 25;
    this.core.ctx.world.resolveCircle(v, 1);
    this.pcX = v.x;
    this.pcZ = v.z;
  }

  // ───────────────────────────── dispositif ─────────────────────────────

  private freeElements(out: Element[]): void {
    out.length = 0;
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      if (el.role === 'libre' && el.task === '' && !el.pending) out.push(el);
    }
    out.sort((a, b) => b.size - a.size || a.squadId - b.squadId);
  }

  /** Confie un emplacement à un élément. */
  assign(el: Element, post: Post): void {
    const core = this.core;
    const cmd = this.commander();
    el.role = 'poste';
    el.post = post;
    post.squadId = el.squadId;
    post.state = 'ordonne';
    this.ordered++;
    if (post.kind === 'site') {
      this.order(el, 'dispositif', { type: 'proteger', x: post.x, z: post.z, heading: post.heading, width: post.width }, TX.orderSite(el.name, this.squad.name, post.name));
      return;
    }
    let cut = false;
    if (core.traffic && !post.pedestrian && post.closureId === 0) {
      const c = core.traffic.closeRoad(post.x, post.z, cmd ? cmd.id : 0, el.squadId);
      if (c) {
        post.closureId = c.id;
        this.state.closuresAsked++;
        cut = true;
      }
    }
    this.order(el, 'dispositif', { type: 'ligne', x: post.x, z: post.z, heading: post.heading, width: 0 }, TX.orderBarrage(el.name, this.squad.name, post.name, post.heading, cut));
  }

  /**
   * L'élément peut-il tenir utilement cet emplacement ? Non s'il n'y arriverait qu'après le passage de la
   * queue du cortège (temps de marche en colonne contre temps de défilement).
   */
  private worth(el: Element, post: Post): boolean {
    const core = this.core;
    const pic = this.pic;
    if (!pic.active || pic.route.length < 4 || post.kind !== 'barrage') return true;
    if (!core.centerOf(el.squadId)) return true;
    const travel = (Math.hypot(core.v2.x - post.x, core.v2.z - post.z) * 1.3) / MARCH_SPEED;
    // au rassemblement, l'heure du départ n'est pas connue : on compte une minute de plus
    const wait = pic.phase === 'rassemblement' ? 60 : 0;
    const useful = wait + (post.s + core.tuning.liftBehind - pic.tailS) / CORTEGE_SPEED;
    return travel < useful;
  }

  /** Élément libre le mieux placé pour un emplacement (le plus proche qui y arrive à temps). */
  private pick(free: Element[], post: Post): Element | null {
    const core = this.core;
    let best: Element | null = null;
    let bestD = Infinity;
    for (let i = 0; i < free.length; i++) {
      const el = free[i];
      if (el.role !== 'libre' || !this.worth(el, post)) continue;
      const d = core.centerOf(el.squadId) ? Math.hypot(core.v2.x - post.x, core.v2.z - post.z) : 0;
      // un front large revient à un élément étoffé
      const cost = d - (post.width > 20 ? el.size * 6 : 0);
      if (cost < bestD) {
        bestD = cost;
        best = el;
      }
    }
    return best;
  }

  /** Mise en place du dispositif : les emplacements actifs les plus importants d'abord, chacun à l'élément le mieux placé. */
  private deployAll(): void {
    const core = this.core;
    const free: Element[] = [];
    this.freeElements(free);
    const wanted: Post[] = [];
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      if (p.state === 'prevu' && this.isActive(p)) wanted.push(p);
    }
    // un chef médiocre place ses unités dans l'ordre où les rues se présentent ; un bon chef pèse l'importance
    if (this.state.aptitude >= 0.35) wanted.sort((a, b) => b.importance - a.importance || a.s - b.s);
    for (let i = 0; i < wanted.length; i++) {
      const el = this.pick(free, wanted[i]);
      if (el) this.assign(el, wanted[i]);
    }
    // la réserve tient le poste de commandement
    const res = this.element(this.state.reserveId);
    if (res && res.lastType === '') {
      this.order(res, 'dispositif', { type: 'tenir', x: this.pcX, z: this.pcZ, heading: this.pcH, width: 0 }, TX.orderReserve(res.name, this.squad.name, core.sector(this.pcX, this.pcZ)));
    }
    // les groupes de commandement des sections fractionnées suivent leur groupe d'appui
    for (let i = 0; i < this.supports.length; i++) {
      const sup = this.supports[i];
      if (sup.ordered || sup.followId === 0) continue;
      sup.ordered = true;
      core.issue(sup.squadId, { type: 'suivre', targetId: sup.followId, width: 0, issuedBy: this.issuer() });
    }
    this.closures();
  }

  /** Rues latérales sans unité : fermées à la circulation par barrières, en avance du cortège. */
  private closures(): void {
    const core = this.core;
    const pic = this.pic;
    const traffic = core.traffic;
    if (!traffic) return;
    const cmd = this.commander();
    const look = 60 + 240 * this.state.aptitude;
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      if (p.kind !== 'barrage' || p.state !== 'prevu' || p.pedestrian || p.closureId !== 0) continue;
      if (pic.active && pic.route.length >= 4 && (p.s < pic.tailS - 30 || p.s > pic.headS + look)) continue;
      const key = 'fermeture:' + i;
      if (!this.ready(key, 120)) continue;
      const ahead = pic.active && p.s > pic.headS;
      this.act(key, 1, p.x, p.z, TX.propose('débouché ' + (p.name || 'latéral') + ' ouvert à la circulation', 'de le fermer par barrières'), () => {
        const c = traffic.closeRoad(p.x, p.z, cmd ? cmd.id : 0);
        if (!c) return;
        p.closureId = c.id;
        p.state = 'barrieres';
        this.state.closuresAsked++;
        const text = TX.roadClosed(this.squad.name, p.name, ahead);
        this.say(text);
        core.decide(this.squad.id, 'fermeture', text, 0, '', p.x, p.z);
      });
    }
  }

  private lift(post: Post): void {
    const core = this.core;
    if (post.closureId !== 0 && core.traffic) core.traffic.open(post.closureId);
    post.closureId = 0;
    const el = post.squadId !== 0 ? this.element(post.squadId) : null;
    post.squadId = 0;
    post.state = 'leve';
    if (el && el.post === post) {
      el.post = null;
      el.role = 'libre';
      el.inPlace = false;
    }
  }

  /** Le dispositif glisse avec le cortège : barrages dépassés levés, unités reportées en avant. */
  private slide(): void {
    const core = this.core;
    const pic = this.pic;
    const moving = pic.active && pic.route.length >= 4;
    if (moving) {
      const behind = core.tuning.liftBehind;
      for (let i = 0; i < this.posts.length; i++) {
        const p = this.posts[i];
        if (p.kind !== 'barrage' || (p.state !== 'tenu' && p.state !== 'ordonne' && p.state !== 'barrieres')) continue;
        if (pic.tailS > p.s + behind && pic.headS > p.s + behind && this.ready('leve:' + i, 30)) {
          const el = p.squadId !== 0 ? this.element(p.squadId) : null;
          if (el && el.task !== '') continue;
          this.act('leve:' + i, 0, p.x, p.z, TX.propose('la queue du cortège a dépassé ' + (p.name || 'le barrage'), 'de lever le barrage'), () => this.lift(p));
        }
      }
    }
    // éléments libres : emplacement suivant, sinon retour au poste de commandement comme réserve
    const free: Element[] = [];
    this.freeElements(free);
    for (let i = 0; i < free.length; i++) {
      const el = free[i];
      let best: Post | null = null;
      for (let k = 0; k < this.posts.length; k++) {
        const p = this.posts[k];
        if ((p.state !== 'prevu' && p.state !== 'barrieres') || p.squadId !== 0 || !this.isActive(p) || !this.worth(el, p)) continue;
        if (moving && p.s < pic.headS - 20 && p.state === 'barrieres') continue;
        if (!best || p.importance - Math.abs(p.s - pic.headS) * 0.004 > best.importance - Math.abs(best.s - pic.headS) * 0.004) best = p;
      }
      const key = 'poste:' + el.squadId;
      if (best) {
        if (!this.ready(key, 20)) continue;
        const post = best;
        this.act(key, 1, post.x, post.z, TX.propose('débouché ' + (post.name || 'latéral') + ' non tenu', 'd’y placer ' + el.name), () => this.assign(el, post));
        // l'emplacement est réservé pour ne pas y envoyer un second élément dans la même réflexion
        if (this.ia) continue;
      } else if (core.centerOf(el.squadId) && Math.hypot(core.v2.x - this.pcX, core.v2.z - this.pcZ) > 45 && this.ready('regroupe:' + el.squadId, 60)) {
        this.act('regroupe:' + el.squadId, 0, this.pcX, this.pcZ, TX.propose(el.name + ' est disponible', 'de le garder en réserve au poste de commandement'), () => {
          el.role = 'reserve';
          this.order(el, 'reserve', { type: 'colonne', x: this.pcX, z: this.pcZ, width: 0 }, TX.orderReserve(el.name, this.squad.name, core.sector(this.pcX, this.pcZ)));
        });
      } else if (this.ia) {
        el.role = 'reserve';
      }
    }
  }

  // ───────────────────────────── logistique ─────────────────────────────

  private logistics(): void {
    const core = this.core;
    const status = core.status;
    if (!status) return;
    const now = core.now;
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      const st = status.of(el.squadId);
      if (!st) continue;
      // relève d'une unité épuisée ou entamée, par la réserve
      if (el.role === 'poste' && st.needsRelief && now - el.reliefAt > 120) {
        const res = this.available(st.x, st.z);
        const delay = 60 * (1 - this.state.aptitude);
        if (res && res !== el && now - el.lastAt > delay && this.ready('releve:' + el.squadId, 90)) {
          const post = el.post;
          this.act('releve:' + el.squadId, 2, st.x, st.z, TX.propose(el.name + ' demande la relève', 'de la relever par ' + res.name), () => {
            el.reliefAt = now;
            const lead = core.leader(core.ctx.squads.get(el.squadId));
            this.order(res, 'releve', { type: 'releve', x: st.x, z: st.z, heading: st.heading, targetId: lead ? lead.id : el.squadId }, TX.orderForce(res.name, this.squad.name, 'releve', '', 0, 0));
            res.role = 'poste';
            res.post = post;
            if (post) post.squadId = res.squadId;
            el.role = 'reserve';
            el.post = null;
            if (this.state.reserveId === res.squadId) this.state.reserveId = el.squadId;
          });
        }
      }
      // ravitaillement aux fourgons quand la dotation de grenades est entamée de moitié
      if (el.ammo0 > 0 && el.task === '' && !st.underAttack && st.phase !== 'mouvement') {
        const left = st.ammo.lacrymoMain + st.ammo.lacrymoLanceur;
        const stock = st.reserve.lacrymoMain + st.reserve.lacrymoLanceur;
        const limit = el.role === 'poste' ? 0.3 : 0.5;
        if (left < el.ammo0 * limit && stock > 0 && this.ready('ravit:' + el.squadId, 240)) {
          this.act('ravit:' + el.squadId, 1, st.x, st.z, TX.propose(el.name + ' est à court de grenades', 'un ravitaillement aux fourgons'), () => {
            this.task(el, 'ravitaillement', { type: 'ravitailler' }, TX.orderForce(el.name, this.squad.name, 'ravitailler', '', 0, 0));
          });
        }
      }
    }
  }

  /** Vague sortie d'une station pendant une phase tendue : renforts hostiles. */
  onMetroWave(stationId: number, count: number): void {
    if (this.pic.tension < 0.45 && this.pic.phase !== 'tension' && this.pic.phase !== 'affrontement') return;
    this.inflow.set(stationId, (this.inflow.get(stationId) ?? 0) + count);
  }

  private metro(): void {
    const core = this.core;
    const metro = core.metro;
    if (!metro) return;
    const pic = this.pic;
    const cmd = this.commander();
    const tense = pic.tension >= 0.45 || pic.phase === 'tension' || pic.phase === 'affrontement';
    if (pic.basePhase === 'dispersion' || pic.basePhase === 'apres_manif' || pic.basePhase === 'terminee') {
      // la foule doit pouvoir partir : un bon chef fait rouvrir les stations qu'il a fermées
      if (this.closedStations.length > 0 && this.state.aptitude >= 0.3 && this.ready('metro:rouvre', 30)) {
        const id = this.closedStations[0];
        const st = metro.get(id);
        this.act('metro:rouvre', 1, st ? st.x : 0, st ? st.z : 0, TX.propose('la dispersion est annoncée, la station ' + (st ? st.name : '') + ' est fermée', 'de la rouvrir'), () => {
          this.closedStations.shift();
          if (!st) return;
          metro.setOpen(id, true, cmd ? cmd.id : 0);
          const text = TX.stationReopened(this.squad.name, st.name);
          this.say(text);
          core.decide(this.squad.id, 'metro', text, 0, '', st.x, st.z);
        });
      }
      return;
    }
    if (!tense) return;
    const stations = metro.stations;
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (!st.open) continue;
      const arrived = this.inflow.get(st.id) ?? 0;
      // renforts constatés (deux vagues), ou affluence encore forte à moins de 300 m d'un point chaud
      const hot = pic.near(st.x, st.z, 300);
      const feeding = arrived >= 30 || (st.inflow >= 20 && hot !== null && hot.heat >= core.tuning.reactHeat);
      if (!feeding || !hot) continue;
      const key = 'metro:' + st.id;
      if (!this.ready(key, 120)) continue;
      this.act(key, 2, st.x, st.z, TX.propose('des renforts hostiles arrivent par la station ' + st.name, 'de demander sa fermeture'), () => {
        metro.setOpen(st.id, false, cmd ? cmd.id : 0);
        this.closedStations.push(st.id);
        this.inflow.set(st.id, 0);
        this.state.stationsClosed++;
        const text = TX.stationClosed(this.squad.name, st.name);
        this.say(text, 2);
        core.decide(this.squad.id, 'metro', text, 0, '', st.x, st.z);
      });
    }
  }

  // ───────────────────────────── dispersion, fin de mission ─────────────────────────────

  /** À l'annonce de la dispersion : barrages filtrants, la foule doit pouvoir sortir. */
  private dispersion(): void {
    const core = this.core;
    if (!this.ready('dispersion', 100000)) return;
    this.act('dispersion', 2, this.gx, this.gz, TX.propose('les organisateurs annoncent la dispersion', 'de passer les barrages en filtrage pour laisser sortir la foule'), () => {
      const text = TX.dispersion(this.squad.name);
      this.say(text);
      core.decide(this.squad.id, 'dispersion', text, 0, '', this.gx, this.gz);
      for (let i = 0; i < this.elements.length; i++) {
        const el = this.elements[i];
        const p = el.post;
        if (el.role !== 'poste' || !p || p.kind !== 'barrage' || el.task !== '') continue;
        this.order(el, 'dispersion', { type: 'filtrer', x: p.x, z: p.z, heading: p.heading, width: 0 }, '');
      }
    });
  }

  private checkEnd(): void {
    const pic = this.pic;
    const now = this.core.now;
    let over = this.endRequested || pic.basePhase === 'terminee';
    if (!over && pic.active && (pic.basePhase === 'dispersion' || pic.basePhase === 'apres_manif') && pic.total > 0) {
      const few = pic.present <= Math.max(3, pic.total * 0.05);
      over = few && now - this.phaseSince > 60 && this.pic.hottest(0.5) === null;
    }
    if (!over || !this.ready('fin', 100000)) return;
    this.act('fin', 2, this.pcX, this.pcZ, TX.propose('dispersion effective, chaussée libre', 'le regroupement et le rembarquement'), () => this.startEnd());
  }

  private startEnd(): void {
    const core = this.core;
    const ctx = core.ctx;
    const cmd = this.commander();
    this.setPhase('fin');
    ctx.law.authorize(1, cmd ? cmd.id : 0);
    this.state.authorized = 1;
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      if (p.closureId !== 0 && core.traffic) core.traffic.open(p.closureId);
      p.closureId = 0;
      if (p.state !== 'leve') p.state = 'leve';
      p.squadId = 0;
    }
    if (core.metro) for (let i = 0; i < this.closedStations.length; i++) core.metro.setOpen(this.closedStations[i], true, cmd ? cmd.id : 0);
    this.closedStations.length = 0;
    const text = TX.regroup(this.squad.name, core.sector(this.pcX, this.pcZ));
    this.say(text);
    core.decide(this.squad.id, 'fin', text, 0, '', this.pcX, this.pcZ);
    // chaque section se regroupe en colonne au poste de commandement
    this.rallied.length = 0;
    const done: number[] = [];
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      el.role = 'libre';
      el.post = null;
      el.task = '';
      el.pending = null;
      if (done.indexOf(el.sectionId) >= 0) continue;
      done.push(el.sectionId);
      core.issue(el.sectionId, { type: 'colonne', x: this.pcX, z: this.pcZ, width: 0, issuedBy: this.issuer() });
      this.rallied.push(el.sectionId);
    }
    // moyens spéciaux : retour à leur base
    for (let i = 0; i < this.attached.length; i++) {
      const sp = this.specials.of(this.attached[i]);
      if (sp) core.issue(sp.squad.id, { type: 'repli', x: sp.homeX, z: sp.homeZ, issuedBy: this.issuer() });
    }
    this.endStep = 1;
    this.endT = core.now;
  }

  private thinkEnd(): void {
    const core = this.core;
    const now = core.now;
    if (this.endStep === 1) {
      // on attend les sections au point de regroupement ; une seule retardataire n'immobilise pas la compagnie
      if (this.rallied.length > 0 && now - this.endT < (this.rallied.length === 1 ? 130 : 240)) return;
      const fleet = core.vehicles;
      core.fleet(this.squad.id, fleet);
      let usable = 0;
      for (let i = 0; i < fleet.length; i++) if (core.usable(fleet[i]) && !fleet[i].def.flying && fleet[i].kind !== 'moto_bravm') usable++;
      const exit = this.base ?? this.convoy.originOf(this.squad.id);
      if (usable > 0 && this.convoy.depart(this.squad.id, exit ?? undefined)) {
        this.endStep = 2;
        this.endT = now;
      } else {
        this.announceEnd(0);
      }
    } else if (this.endStep === 2) {
      const st = this.convoy.statusOf(this.squad.id);
      if (st && st.stage === 'rembarquement' && now - this.endT < 260) return;
      const status = core.status ? core.status.of(this.squad.id) : null;
      // des retardataires sont restés à pied : on les attend, une fois
      if (status && this.embarkTries === 0 && status.embarked < status.valid && status.valid - status.embarked <= status.total * 0.4) {
        this.embarkTries = 1;
        this.endT = now;
        core.issue(this.squad.id, { type: 'embarquer', issuedBy: this.issuer() });
        this.endStep = 4;
        return;
      }
      this.announceEnd(status ? status.embarked : 0);
    } else if (this.endStep === 4) {
      const status = core.status ? core.status.of(this.squad.id) : null;
      if (!this.embarkDone && now - this.endT < 110) return;
      this.announceEnd(status ? status.embarked : 0);
    }
  }

  private announceEnd(embarked: number): void {
    const core = this.core;
    const status = core.status ? core.status.of(this.squad.id) : null;
    let arrests = status ? status.arrests : 0;
    for (let i = 0; i < this.elements.length; i++) {
      const st = core.status ? core.status.of(this.elements[i].squadId) : null;
      if (st && st.arrests > arrests) arrests = st.arrests;
    }
    const text = TX.missionEnd(this.squad.name, embarked, arrests);
    this.say(text);
    core.decide(this.squad.id, 'fin', text, 0, '', this.pcX, this.pcZ);
    this.state.missionEnded = true;
    core.ctx.events.emitAny(COMMAND_MISSION_END_EVENT, { squadId: this.squad.id, t: core.now });
    this.endStep = 3;
    this.setPhase('termine');
  }

  // ───────────────────────────── événements ─────────────────────────────

  onInPlace(squadId: number): void {
    const el = this.element(squadId);
    if (!el) return;
    el.inPlace = true;
    if (el.post && el.post.state === 'ordonne') el.post.state = 'tenu';
  }

  onOrderDone(e: PoliceOrderDone): void {
    const core = this.core;
    if (this.endStep === 1) {
      const i = this.rallied.indexOf(e.squadId);
      if (i >= 0 && e.type === 'colonne') this.rallied.splice(i, 1);
    } else if (this.endStep === 4 && e.squadId === this.squad.id && e.type === 'embarquer') {
      this.embarkDone = true;
    }
    const el = this.element(e.squadId);
    if (!el) return;
    if (el.pending && e.type === el.lastType && (e.type === 'colonne' || e.type === 'avancer' || e.type === 'ligne')) {
      // le déplacement préalable est fait : la tâche est donnée
      const o = el.pending;
      el.pending = null;
      const affair = el.affairId;
      this.task(el, 'incident', o, TX.orderForce(el.name, this.squad.name, o.type, core.sector(o.x ?? 0, o.z ?? 0), 0, 0), affair);
      return;
    }
    if (el.task !== '' && e.type === el.task) {
      el.task = '';
      // retour à l'emplacement si l'élément s'en était écarté pour la tâche
      if (el.role === 'poste' && el.post && !el.inPlace && el.lastType !== 'ligne' && el.lastType !== 'proteger' && el.lastType !== 'filtrer') {
        const p = el.post;
        this.order(el, 'dispositif', { type: p.kind === 'site' ? 'proteger' : 'ligne', x: p.x, z: p.z, heading: p.heading, width: p.kind === 'site' ? p.width : 0 }, '');
      }
    }
    if (e.type === 'releve' && e.ok) {
      // l'unité relevée regagne le poste de commandement et se ravitaille
      for (let i = 0; i < this.elements.length; i++) {
        const old = this.elements[i];
        if (old.role === 'reserve' && old.squadId !== el.squadId && core.now - old.reliefAt < 300 && old.lastType !== 'colonne') {
          this.order(old, 'reserve', { type: 'colonne', x: this.pcX, z: this.pcZ, width: 0 }, TX.orderReserve(old.name, this.squad.name, core.sector(this.pcX, this.pcZ)));
        }
      }
    }
  }

  /** Ordre donné par le joueur-commandant à l'une de ses unités : le dispositif en tient compte. */
  onPlayerOrder(squadId: number, o: SquadOrder): void {
    const el = this.elementOver(squadId);
    if (!el) return;
    el.lastType = o.type;
    el.lastAt = this.core.now;
    if (o.type !== 'ligne' && o.type !== 'tenir' && o.type !== 'couper_circulation' && o.type !== 'filtrer' && o.type !== 'proteger') return;
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      if (Math.hypot(p.x - o.x, p.z - o.z) > 18 || p.state === 'leve') continue;
      p.state = 'ordonne';
      p.squadId = el.squadId;
      el.role = 'poste';
      el.post = p;
      return;
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  /** Compte rendu de dispositif en place (une fois). */
  private reportDeployed(): void {
    const core = this.core;
    let held = 0;
    let barriers = 0;
    let wanted = 0;
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      if (!this.isActive(p) && p.state === 'prevu') continue;
      wanted++;
      if (p.state === 'tenu' || p.state === 'ordonne') held++;
      else if (p.state === 'barrieres') barriers++;
    }
    const res = this.element(this.state.reserveId);
    this.state.deployedAt = core.now;
    const text = TX.deployed(this.squad.name, wanted, held, barriers, res ? res.name : '');
    this.say(text);
    core.decide(this.squad.id, 'dispositif', text, 0, '', this.pcX, this.pcZ);
    core.ctx.events.emitAny(COMMAND_DEPLOYED_EVENT, { squadId: this.squad.id, posts: wanted, held, t: core.now });
  }

  /** Phase « mise en place » : conception, ordres, attente des comptes rendus. Retourne true quand c'est fait. */
  thinkDeploy(): boolean {
    const core = this.core;
    const pic = this.pic;
    // le convoi roule encore ou l'unité débarque : on attend
    if (this.convoy.arriving(this.squad.id)) {
      this.setPhase('arrivee');
      return false;
    }
    if (this.state.phase === 'arrivee') this.setPhase('mise_en_place');
    if (!this.planned || pic.route.length !== this.routeN) {
      this.plan();
      if (this.elements.length === 0) return false;
      if (this.ready('dispositif', 100000)) {
        const n = this.posts.length;
        this.act('dispositif', 2, this.gx, this.gz, TX.propose(TX.spell(n) + ' débouchés à tenir autour du parcours', 'la mise en place du dispositif'), () => this.deployAll());
      }
      return false;
    }
    if (!this.ia) return this.ordered > 0 || core.now - this.phaseT > 60;
    let waiting = 0;
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      if (el.role === 'poste' && el.post && !el.inPlace) {
        // sans événement reçu : l'état publié par l'unité fait foi
        const st = core.status ? core.status.of(el.squadId) : null;
        if (st && st.phase === 'en_place' && core.now - el.lastAt > 2) this.onInPlace(el.squadId);
        else waiting++;
      }
    }
    if (waiting > 0 && core.now - this.phaseT < DEPLOY_TIMEOUT) return false;
    this.reportDeployed();
    return true;
  }

  /** Les ordres du dispositif initial sont partis (les réactions et la délégation peuvent commencer). */
  get engaged(): boolean {
    return this.planned && (this.ordered > 0 || !this.ia);
  }

  /** Phase « conduite » : tout ce qui n'est pas réaction ni délégation (voir react.ts, delegate.ts). */
  thinkConduct(): void {
    const pic = this.pic;
    if (pic.basePhase !== this.phaseSeen) {
      this.phaseSeen = pic.basePhase;
      this.phaseSince = this.core.now;
    }
    if (pic.route.length !== this.routeN && pic.route.length >= 4) {
      // le parcours a changé (cortège sauvage, délestage) : le dispositif est repensé
      const kept = this.elements.slice();
      planPosts(this.core, pic, this.gx, this.gz, this.posts);
      this.routeN = pic.route.length;
      for (let i = 0; i < kept.length; i++) if (kept[i].role === 'poste') {
        kept[i].role = 'libre';
        kept[i].post = null;
      }
    }
    this.slide();
    this.closures();
    this.logistics();
    this.metro();
    if (pic.basePhase === 'dispersion' || pic.basePhase === 'apres_manif') this.dispersion();
    this.checkEnd();
  }

  thinkFinish(): void {
    this.thinkEnd();
  }

  /** Cap cardinal d'un emplacement, pour les messages. */
  facing(post: Post): string {
    return cardinalFr(post.heading);
  }

  /** Le personnage du commandant est-il piloté par l'IA de police (ni joueur, ni hors de combat) ? */
  commanderAgent(): ReturnType<typeof agentOf> {
    const p = this.commander();
    if (!p || p.isPlayer) return null;
    return agentOf(p);
  }
}
