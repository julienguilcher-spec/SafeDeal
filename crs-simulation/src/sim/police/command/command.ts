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
import { closures, deployAll, isActive, plan, slide } from './dispositif';
import { planPosts } from './plan';
import { checkEnd, dispersion, logistics, metro, thinkEnd } from './sustain';
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
  readonly supports: Support[] = [];
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
  planned = false;
  routeN = -1;
  ordered = 0;
  readonly cooldowns = new Map<string, number>();
  endRequested = false;
  endStep = 0;
  endT = 0;
  embarkTries = 0;
  embarkDone = false;
  readonly rallied: number[] = [];
  phaseSeen = '';
  phaseSince = 0;
  readonly inflow = new Map<number, number>();
  readonly closedStations: number[] = [];
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
  sections(out: Squad[]): void {
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
  buildElements(split: boolean): void {
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
      if (!isActive(this, p) && p.state === 'prevu') continue;
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
      plan(this);
      if (this.elements.length === 0) return false;
      if (this.ready('dispositif', 100000)) {
        const n = this.posts.length;
        this.act('dispositif', 2, this.gx, this.gz, TX.propose(TX.spell(n) + ' débouchés à tenir autour du parcours', 'la mise en place du dispositif'), () => deployAll(this));
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
    slide(this);
    closures(this);
    logistics(this);
    metro(this);
    if (pic.basePhase === 'dispersion' || pic.basePhase === 'apres_manif') dispersion(this);
    checkEnd(this);
  }

  thinkFinish(): void {
    thinkEnd(this);
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
