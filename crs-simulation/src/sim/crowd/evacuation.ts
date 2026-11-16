/* =====================================================================================
 * FOULE — ÉVACUATION FILTRÉE D'UNE NASSE : une foule encerclée (« encercler ») est évacuée par une seule issue quand
 * le commandant fait FILTRER cette issue par une unité (ordre 'filtrer' donné à moins de 40 m du pourtour d'une
 * nasse). Les manifestants enfermés font la queue vers la porte du barrage filtrant ; deux agents contrôlent les
 * identités (quelques secondes par personne, extra['evacuation.controle']) ; une personne contre qui une infraction
 * est retenue (module de droit : jets, violences, dégradations, visage dissimulé…) est interpellée par l'unité qui
 * filtre (ordre 'interpeller', procédure ordinaire du module de police) ; les autres passent la porte, s'éloignent
 * et se dispersent par les rues de l'autre côté.
 *
 * Comptes rendus à la radio (canal commandement, au nom de l'unité qui filtre) : « Évacuation en cours : 120
 * personnes sorties, 4 interpellations, une trentaine encore dans la nasse. » Événement libre 'crowd:evacuation'
 * (début, point, fin) ; service 'crowd.evacuations' (EvacuationsApi).
 *
 * Fin : quand la nasse est vide (20 s sans personne), ou quand l'unité qui filtre reçoit un autre ordre.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Person, SquadOrder, Vec2 } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { CROWD_EVACUATIONS, CROWD_EVACUATION_SYSTEM, EVACUATION_EVENT } from './api';
import type { BehaviorController, EvacuationView, EvacuationsApi } from './api';
import { F, S, brainOf } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import * as T from './tuning';

/** Personnes rangées dans la file devant la porte. */
const QUEUE = 12;
const LANES = 2;
const TICK = 0.5;
/** Distance de la porte au-delà de laquelle une personne contrôlée est libre (m). */
const CLEAR = 28;
/** Distance maximale entre l'ordre « filtrer » et le pourtour de la nasse (m). */
const REACH = 40;

/** Personne retenue : rayon autour de la porte où elle attend sans bouger (m), délai avant de la confier au binôme
 * d'interpellation (s), durée maximale de retenue (s). */
const HOLD_STAY = 5;
const HOLD_ORDER = 4;
const HOLD_MAX = 600;
/** Tentatives d'interpellation par personne (ordre « interpeller » donné à l'unité qui filtre). */
const ARREST_TRIES = 2;
/** Auteur de faits sorti de la nasse sans passer la porte : interpellé s'il est encore à moins de tant de la porte (m). */
const WANTED_RANGE = 60;

/** 'wanted' : auteur de faits établis qui s'est soustrait à la nasse (hors de la porte) ; l'unité qui filtre l'interpelle. */
type Role = 'queue' | 'check' | 'hold' | 'out' | 'wanted';

interface Evac {
  view: EvacuationView;
  radius: number;
  /** Direction de sortie (unitaire, du centre de la nasse vers la porte). */
  ox: number;
  oz: number;
  lanes: EntityId[];
  queue: EntityId[];
  /** Interpellations demandées en attente (une à la fois : l'ordre suivant annule le précédent). */
  arrests: EntityId[];
  arrestAt: number;
  arrestId: EntityId;
  emptySince: number;
  nextReport: number;
  /** Le barrage filtrant est en place (compte rendu de l'unité) : les interpellations peuvent partir. */
  ready: boolean;
  startedAt: number;
  exitIndex: number;
  /** Auteurs de faits établis vus dans la nasse (ils ne sortent que par la porte, interpellés). */
  seen: Set<EntityId>;
}

interface Tie {
  e: Evac;
  role: Role;
  slot: number;
  until: number;
  since: number;
  lastX: number;
  lastZ: number;
  lastAt: number;
  /** Nombre d'ordres « interpeller » déjà donnés à l'unité pour cette personne. */
  tries: number;
}

export class EvacuationSystem implements GameSystem {
  readonly id = CROWD_EVACUATION_SYSTEM;
  readonly order = SystemOrder.RULES + 3;
  private ctx!: GameContext;
  private readonly evacs: Evac[] = [];
  private readonly views: EvacuationView[] = [];
  private readonly ties = new Map<EntityId, Tie>();
  private nextTick = 0;
  private nextId = 1;
  private readonly buf: Person[] = [];
  private readonly v2: Vec2 = { x: 0, z: 0 };
  private readonly controller: BehaviorController;
  private readonly api: EvacuationsApi;

  constructor(readonly core: CrowdCore) {
    const self = this;
    this.api = { get list(): readonly EvacuationView[] { return self.views; } };
    this.controller = { id: 'foule:evacuation', priority: 30, think: (p, b) => this.think(p, b) };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide(CROWD_EVACUATIONS, this.api);
  }

  init(ctx: GameContext): void {
    this.core.register('*', this.controller);
    ctx.events.on('order:issued', (e) => {
      if (!this.core.active) return;
      const sq = ctx.squads.get(e.squadId);
      if (!sq || sq.faction !== 'police') return;
      const o = e.order;
      if (o.type === 'filtrer') this.start(e.squadId, o);
      else if (o.type !== 'interpeller') {
        for (const ev of this.evacs) if (ev.view.active && ev.view.squadId === e.squadId) this.end(ev, 'ordre');
      }
    });
    // fin d'une interpellation demandée (module de police) : la suivante peut partir
    ctx.events.onAny('police:order_done', (payload) => {
      const e = payload as { squadId: number; type: string };
      if (!e) return;
      if (e.type === 'filtrer') for (const ev of this.evacs) if (ev.view.squadId === e.squadId) ev.ready = true;
      if (e.type !== 'interpeller') return;
      for (const ev of this.evacs) if (ev.view.squadId === e.squadId) ev.arrestId = 0;
    });
  }

  reset(): void {
    this.evacs.length = 0;
    this.views.length = 0;
    this.ties.clear();
    this.nextTick = 0;
    this.nextId = 1;
  }

  // ───────────────────────────── début, fin ─────────────────────────────

  private start(squadId: number, o: SquadOrder): void {
    const core = this.core;
    const now = core.now;
    // nasse visée : la plus proche dont le pourtour est à moins de REACH m (y compris celle que tenait cette unité)
    let best: { x: number; z: number; a: number } | null = null;
    let bestD = Infinity;
    for (const k of core.sense.kettles.items) {
      if (k.t < now - 5 && !(k.id === squadId && k.t >= now - 30)) continue;
      const d = Math.hypot(k.x - o.x, k.z - o.z) - k.a;
      if (d < REACH && d < bestD) {
        bestD = d;
        best = { x: k.x, z: k.z, a: k.a };
      }
    }
    if (!best) return;
    for (const ev of this.evacs) if (ev.view.active && ev.view.squadId === squadId) this.end(ev, 'ordre');
    let ox = o.x - best.x;
    let oz = o.z - best.z;
    const l = Math.hypot(ox, oz);
    if (l > 1) {
      ox /= l;
      oz /= l;
    } else {
      ox = Math.sin(o.heading);
      oz = Math.cos(o.heading);
    }
    const view: EvacuationView = {
      id: this.nextId++, squadId, x: o.x, z: o.z, kettleX: best.x, kettleZ: best.z, out: 0, arrested: 0, waiting: 0, active: true,
    };
    // issues de l'autre côté de la porte : on s'éloigne de la nasse
    const outX = o.x + ox * 60;
    const outZ = o.z + oz * 60;
    const first = core.nav.addExitsAround(outX, outZ, () => core.rngThink.next());
    let exitIndex = -1;
    let far = -Infinity;
    for (let i = first; i < core.nav.exits.length; i++) {
      const e = core.nav.exits[i]!;
      const d = Math.hypot(e.x - best.x, e.z - best.z);
      if (d > far) {
        far = d;
        exitIndex = i;
      }
    }
    const ev: Evac = {
      view, radius: best.a, ox, oz, lanes: new Array<EntityId>(LANES).fill(0), queue: [], arrests: [], arrestAt: -1e9, arrestId: 0,
      emptySince: -1, nextReport: now + 45, exitIndex, ready: false, startedAt: now, seen: new Set(),
    };
    this.evacs.push(ev);
    this.views.push(view);
    this.ctx.events.emitAny(EVACUATION_EVENT, { id: view.id, state: 'debut', x: view.x, z: view.z, out: 0, arrested: 0 });
    this.say(ev, 'Barrage filtrant en place à la sortie de la nasse : évacuation des personnes encerclées, contrôle d’identité à la sortie.');
  }

  private end(ev: Evac, why: 'vide' | 'ordre'): void {
    if (!ev.view.active) return;
    ev.view.active = false;
    for (const [id, t] of this.ties) {
      if (t.e !== ev) continue;
      this.ties.delete(id);
      const p = this.ctx.people.get(id);
      const b = p ? brainOf(p) : null;
      if (b) b.nextThink = Math.min(b.nextThink, this.core.now + 0.3);
    }
    const i = this.views.indexOf(ev.view);
    if (i >= 0) this.views.splice(i, 1);
    const v = ev.view;
    this.ctx.events.emitAny(EVACUATION_EVENT, { id: v.id, state: 'fin', x: v.x, z: v.z, out: v.out, arrested: v.arrested });
    this.say(ev, why === 'vide'
      ? `Évacuation terminée : ${v.out} personnes sorties, ${v.arrested} interpellation${v.arrested > 1 ? 's' : ''}.`
      : `Fin du filtrage : ${v.out} personnes sorties, ${v.arrested} interpellation${v.arrested > 1 ? 's' : ''}.`);
  }

  private say(ev: Evac, text: string): void {
    const sq = this.ctx.squads.get(ev.view.squadId);
    const name = sq ? sq.name : 'Barrage filtrant';
    this.ctx.radio.say({ channel: 'commandement', from: name, priority: 1, text: `${name} : ${text}`, personId: sq ? sq.leaderId : 0 });
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(): void {
    if (this.evacs.length === 0 || !this.core.active) return;
    const now = this.core.now;
    if (now < this.nextTick) return;
    this.nextTick = now + TICK;
    for (const ev of this.evacs) if (ev.view.active) this.step(ev, now);
  }

  private inside(ev: Evac, p: Person): boolean {
    const v = ev.view;
    return Math.hypot(p.x - v.kettleX, p.z - v.kettleZ) <= ev.radius + 4;
  }

  private step(ev: Evac, now: number): void {
    const ctx = this.ctx;
    const core = this.core;
    const v = ev.view;
    // personnes encore dans la nasse
    const n = ctx.people.queryRadius(v.kettleX, v.kettleZ, ev.radius + 4, this.buf);
    let waiting = 0;
    const free: Person[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.buf[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || p.posture === 'down' || p.isPlayer) continue;
      const b = brainOf(p);
      if (!b || b.index < 0 || (b.flags & (F.LEAVING | F.BYSTANDER)) !== 0) continue;
      const tie = this.ties.get(p.id);
      if (tie && tie.role === 'out') continue;
      waiting++;
      if (!this.ties.has(p.id)) free.push(p);
      if (!ev.seen.has(p.id) && this.offender(p)) ev.seen.add(p.id);
    }
    v.waiting = waiting;
    this.wanted(ev, now);
    // file : les plus proches de la porte d'abord
    const q = ev.queue;
    for (let i = q.length - 1; i >= 0; i--) {
      const id = q[i]!;
      const t = this.ties.get(id);
      const p = ctx.people.get(id);
      if (!t || t.role !== 'queue' || !p || p.custody !== 'free') {
        q.splice(i, 1);
        if (t && t.role === 'queue') this.ties.delete(id);
      }
    }
    if (q.length < QUEUE && free.length > 0) {
      free.sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z));
      for (let i = 0; i < free.length && q.length < QUEUE; i++) {
        const p = free[i]!;
        q.push(p.id);
        this.ties.set(p.id, { e: ev, role: 'queue', slot: 0, until: 0, since: now, lastX: p.x, lastZ: p.z, lastAt: now, tries: 0 });
      }
    }
    for (let i = 0; i < q.length; i++) {
      const t = this.ties.get(q[i]!);
      if (t) t.slot = i;
    }
    // contrôle : deux agents à la porte
    const checkT = Number(core.extra['evacuation.controle']);
    for (let lane = 0; lane < LANES; lane++) {
      const id = ev.lanes[lane]!;
      const t = id !== 0 ? this.ties.get(id) : undefined;
      const p = id !== 0 ? ctx.people.get(id) : undefined;
      if (id !== 0 && (!t || t.role !== 'check' || !p || p.custody !== 'free')) ev.lanes[lane] = 0;
      if (ev.lanes[lane] === 0 && q.length > 0) {
        const next = q.shift()!;
        const nt = this.ties.get(next);
        if (!nt) continue;
        nt.role = 'check';
        nt.slot = lane;
        nt.since = now;
        nt.until = Infinity;
        ev.lanes[lane] = next;
      }
      const cid = ev.lanes[lane]!;
      const ct = cid !== 0 ? this.ties.get(cid) : undefined;
      const cp = cid !== 0 ? ctx.people.get(cid) : undefined;
      if (!ct || !cp) continue;
      // le contrôle commence quand on est à la porte (ou après 25 s d'attente)
      if (ct.until === Infinity) {
        this.lanePoint(ev, lane);
        if (Math.hypot(cp.x - this.v2.x, cp.z - this.v2.z) < 2.5 || now - ct.since > 25) {
          ct.until = now + (Number.isFinite(checkT) && checkT >= 0 ? checkT : 3 + 3 * core.rngThink.next());
        }
      } else if (now >= ct.until) {
        ev.lanes[lane] = 0;
        if (this.offender(cp)) {
          ct.role = 'hold';
          ct.since = now;
          ct.lastX = cp.x;
          ct.lastZ = cp.z;
          ct.lastAt = now;
        } else this.letOut(ct, cp, now);
      }
    }
    this.doorArrests(ev, now);
    this.arrestNext(ev, now);
    // personnes interpellées (comptées une fois qu'on les tient)
    for (const [id, t] of this.ties) {
      if (t.e !== ev) continue;
      const p = ctx.people.get(id);
      if (!p) {
        this.ties.delete(id);
        continue;
      }
      if (p.custody !== 'free') {
        if (t.role === 'hold' || t.role === 'check' || t.role === 'wanted') v.arrested++;
        this.ties.delete(id);
        ev.seen.delete(id);
      } else if ((t.role === 'hold' || t.role === 'wanted') && t.tries > 0 && ev.arrestId !== id && ev.arrests.indexOf(id) < 0) {
        // l'interpellation ordonnée n'a pas abouti : nouvelle tentative, puis on y renonce (la personne retenue sort
        // avec les autres). Tant qu'elle attend son tour, elle reste retenue — même au-delà de trois minutes.
        if (t.tries < ARREST_TRIES) ev.arrests.push(id);
        else if (t.role === 'hold') this.letOut(t, p, now);
        else {
          this.ties.delete(id);
          ev.seen.delete(id);
        }
      } else if (t.role === 'hold' && now - t.since > HOLD_MAX) this.letOut(t, p, now);
    }
    // (fin : nasse vide et plus aucune interpellation en attente ou en cours)
    if (waiting === 0 && q.length === 0 && ev.lanes.every((x) => x === 0) && ev.arrests.length === 0 && ev.arrestId === 0 && !this.pending(ev)) {
      if (ev.emptySince < 0) ev.emptySince = now;
      else if (now - ev.emptySince > 20) {
        this.end(ev, 'vide');
        return;
      }
    } else ev.emptySince = -1;
    if (now >= ev.nextReport) {
      ev.nextReport = now + 60;
      const left = waiting < 13 ? `${waiting}` : waiting < 36 ? 'une vingtaine' : waiting < 60 ? 'une cinquantaine' : `environ ${Math.round(waiting / 10) * 10}`;
      this.say(ev, `Évacuation en cours : ${v.out} personnes sorties, ${v.arrested} interpellation${v.arrested > 1 ? 's' : ''}, ${left} encore dans la nasse.`);
      this.ctx.events.emitAny(EVACUATION_EVENT, { id: v.id, state: 'point', x: v.x, z: v.z, out: v.out, arrested: v.arrested });
    }
  }

  /** Reste-t-il une personne retenue ou recherchée à interpeller ? */
  private pending(ev: Evac): boolean {
    for (const t of this.ties.values()) if (t.e === ev && (t.role === 'hold' || t.role === 'wanted')) return true;
    return false;
  }

  /** Une infraction est retenue contre la personne (hors la seule participation à l'attroupement). */
  private offender(p: Person): boolean {
    const law = this.ctx.law;
    for (let i = 0; i < p.offenses.length; i++) {
      const o = p.offenses[i]!;
      if (o.type !== 'attroupement_apres_sommations' && o.severity >= 1 && law.canArrest(p)) return true;
    }
    return false;
  }

  /**
   * Interpellation à la porte : la personne retenue est confiée au binôme d'interpellation de l'unité qui filtre
   * (ordre 'interpeller', procédure du module de police), à son tour. (La saisie directe par l'agent de la porte le plus
   * proche ne pouvait pas aboutir : tenu à son créneau par la formation, il a toujours une intention de déplacement, et
   * le module des interactions interrompt la saisie dans le pas même.)
   */
  private doorArrests(ev: Evac, now: number): void {
    const ctx = this.ctx;
    for (const [id, t] of this.ties) {
      if (t.e !== ev || t.role !== 'hold' || t.tries > 0) continue;
      const p = ctx.people.get(id);
      if (!p || p.custody !== 'free') continue;
      if (now - t.since > HOLD_ORDER && ev.arrests.indexOf(id) < 0 && ev.arrestId !== id) ev.arrests.push(id);
    }
  }

  /**
   * Auteurs de faits établis vus dans la nasse et qui en sont sortis sans passer la porte (par une issue que la nasse
   * ne tenait pas) : s'ils sont encore à proximité, l'unité qui filtre les interpelle, à leur tour.
   */
  private wanted(ev: Evac, now: number): void {
    const ctx = this.ctx;
    const v = ev.view;
    for (const id of ev.seen) {
      const p = ctx.people.get(id);
      if (!p || p.custody !== 'free') {
        ev.seen.delete(id);
        continue;
      }
      if (this.ties.has(id) || this.inside(ev, p) || Math.hypot(p.x - v.x, p.z - v.z) > WANTED_RANGE) continue;
      this.ties.set(id, { e: ev, role: 'wanted', slot: 0, until: 0, since: now, lastX: p.x, lastZ: p.z, lastAt: now, tries: 0 });
      if (ev.arrests.indexOf(id) < 0 && ev.arrestId !== id) ev.arrests.push(id);
    }
  }

  /** L'unité qui filtre interpelle les personnes retenues, l'une après l'autre (sa formation reste en place). */
  private arrestNext(ev: Evac, now: number): void {
    const ctx = this.ctx;
    if (!ev.ready && now - ev.startedAt < 90) return;
    if (ev.arrestId !== 0) {
      const p = ctx.people.get(ev.arrestId);
      if (p && p.custody === 'free' && now - ev.arrestAt < 120) return;
      ev.arrestId = 0;
    }
    while (ev.arrests.length > 0) {
      const id = ev.arrests.shift()!;
      const p = ctx.people.get(id);
      const t = this.ties.get(id);
      if (!p || !t || (t.role !== 'hold' && t.role !== 'wanted') || p.custody !== 'free') continue;
      const sq = ctx.squads.get(ev.view.squadId);
      if (!sq) return;
      ev.arrestId = id;
      ev.arrestAt = now;
      t.tries++;
      ctx.squads.issue(sq.id, { type: 'interpeller', x: p.x, z: p.z, targetId: id, issuedBy: sq.leaderId, maxForce: 2 });
      return;
    }
  }

  private letOut(t: Tie, p: Person, now: number): void {
    t.e.seen.delete(p.id);
    t.role = 'out';
    t.since = now;
    t.lastX = p.x;
    t.lastZ = p.z;
    t.lastAt = now;
    t.e.view.out++;
    const b = brainOf(p);
    if (b && b.group >= 0) {
      const g = this.core.groups[b.group];
      if (g && t.e.exitIndex >= 0) g.exit = t.e.exitIndex;
    }
  }

  /** Point de contrôle d'une file (dans this.v2) : côté nasse, de part et d'autre de la porte. */
  private lanePoint(ev: Evac, lane: number): void {
    const v = ev.view;
    const side = lane === 0 ? -0.6 : 0.6;
    this.v2.x = v.x - ev.ox * 2.2 - ev.oz * side;
    this.v2.z = v.z - ev.oz * 2.2 + ev.ox * side;
  }

  // ───────────────────────────── contrôleur ─────────────────────────────

  private think(p: Person, b: CrowdBrain): boolean {
    const t = this.ties.get(p.id);
    if (!t) return false;
    const ev = t.e;
    if (!ev.view.active) {
      this.ties.delete(p.id);
      return false;
    }
    const core = this.core;
    const now = core.now;
    const v = ev.view;
    if (p.gas > T.GAS_FEEL * 2 || p.burning > 0.05) return false;
    switch (t.role) {
      case 'wanted':
        // sorti de la nasse : il va où il veut ; le binôme d'interpellation vient le chercher
        return false;
      case 'queue': {
        // en file indienne, de la porte vers l'intérieur de la nasse
        const back = 3.6 + t.slot * 0.85;
        const zig = (t.slot % 2 === 0 ? -0.35 : 0.35);
        const x = v.x - ev.ox * back - ev.oz * zig;
        const z = v.z - ev.oz * back + ev.ox * zig;
        this.goNear(p, b, x, z, 0.9);
        b.lookX = v.x;
        b.lookZ = v.z;
        return true;
      }
      case 'check':
      case 'hold': {
        this.lanePoint(ev, t.role === 'check' ? t.slot : 1);
        let x = this.v2.x;
        let z = this.v2.z;
        if (t.role === 'hold') {
          // retenu : il reste sur place, à la porte, où le binôme d'interpellation vient le chercher. (Conduit vers
          // « l'agent le plus proche », il reculait dès que le binôme sortait du rang — l'agent le plus proche changeait
          // — et l'interpellation échouait : « individu hors d'atteinte ».)
          if (Math.hypot(p.x - x, p.z - z) < HOLD_STAY) {
            x = p.x;
            z = p.z;
          }
        }
        this.goNear(p, b, x, z, 0.8);
        b.lookX = v.x + ev.ox * 3;
        b.lookZ = v.z + ev.oz * 3;
        return true;
      }
      default: {
        // sortie : par la porte, puis on s'éloigne ; on est libre au-delà de CLEAR m
        const ahead = (p.x - v.x) * ev.ox + (p.z - v.z) * ev.oz;
        if (ahead > CLEAR || now - t.since > 120) {
          this.ties.delete(p.id);
          b.leaveAt = Math.min(b.leaveAt, now);
          b.dir = NaN;
          b.nextThink = now + 0.2;
          return false;
        }
        const tx = ahead < 1 ? v.x + ev.ox * 2 : v.x + ev.ox * (CLEAR + 8);
        const tz = ahead < 1 ? v.z + ev.oz * 2 : v.z + ev.oz * (CLEAR + 8);
        core.steering.goTo(p, b, tx, tz, T.WALK_MAX * b.pace, false);
        // coincé dans la ligne : les agents de la porte le font passer
        if (Math.hypot(p.x - t.lastX, p.z - t.lastZ) > 0.5) {
          t.lastX = p.x;
          t.lastZ = p.z;
          t.lastAt = now;
        } else if (now - t.lastAt > 4 && ahead > -6 && ahead < 6) {
          this.passThrough(p, ev);
          t.lastAt = now;
        }
        return true;
      }
    }
  }

  private goNear(p: Person, b: CrowdBrain, x: number, z: number, speed: number): void {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > 0.6) this.core.steering.goTo(p, b, x, z, d > 6 ? T.WALK_MAX * b.pace : speed, false);
    else {
      b.path = null;
      b.tx = p.x;
      b.tz = p.z;
    }
    if (b.state === S.STRANDED) b.timer = this.core.now + 5;
    b.flags &= ~F.PINNED;
  }

  /** Passage de la porte : la personne est conduite de l'autre côté de la ligne (premier point libre). */
  private passThrough(p: Person, ev: Evac): void {
    const world = this.ctx.world;
    const v = ev.view;
    for (let d = 2; d <= 8; d += 1) {
      const x = v.x + ev.ox * d;
      const z = v.z + ev.oz * d;
      if (!world.isFree(x, z, 0.3) || this.ctx.people.countIn(x, z, 0.6) > 0) continue;
      p.x = x;
      p.z = z;
      p.vx = 0;
      p.vz = 0;
      return;
    }
  }
}
