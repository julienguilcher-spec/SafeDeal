/* =====================================================================================
 * INCIDENTS — vie d'un incident : mesure de sa cause, gravité, urgence, clôture automatique.
 *
 * Chaque incident actif est réexaminé deux fois par seconde (décalé d'un incident à l'autre) :
 *   1. chaque membre relit sa cause dans le monde (intensité du foyer, état de la victime, activité
 *      du pillage, présence de la barricade…) ; une cause disparue est notée, avec ou sans intervention ;
 *   2. la gravité suit la cause ET le temps passé sans traitement : un feu non combattu monte vers sa
 *      gravité potentielle, un blessé grave qui attend s'affaiblit ; elle redescend quand on traite ;
 *   3. l'urgence se relève avec la gravité ; une aggravation faute de moyen est portée au journal et
 *      annoncée à la radio ;
 *   4. quand tous les membres ont disparu, l'incident se clôt de lui-même : « traité » s'il y a eu
 *      intervention, sinon « cause disparue » (qui est un échec pour un feu ou un pillage).
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi } from '@/core/extensions';
import { INCIDENT_UPDATED_EVENT } from './api';
import type { Assigner } from './assign';
import type { Entry, Member } from './entry';
import { injuryRank } from './entry';
import type { Kernel } from './kernel';
import { relabel } from './labels';
import type { Sense } from './sense';
import type { Tracker } from './track';
import {
  AGGRAVATION_STEP, FAM_BARRICADE, FAM_FIRE, FAM_ISOLATED, FAM_LOOTING, FAM_MOTORIST, FAM_OFFICER, FAM_RESCUE, FAM_SUSPECT,
  FAM_VICTIM, FIRE_OUT, FIRE_OUT_HOLD, FIRE_RAMP_TIME, FIRE_THREAT, ISOLATED_CLEAR, LOOTING_QUIET, MOTORIST_FREE,
  TOUCH_MEMORY, VICTIM_GOLDEN_TIME,
} from './tuning';

const THINK_PERIOD = 0.5;
/** Une victime décédée que personne ne prend en charge : l'incident est clos sur un échec après ce délai (s). */
const DEAD_UNCLAIMED = 120;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Thinker {
  assigner!: Assigner;
  tracker!: Tracker;

  constructor(private readonly k: Kernel, private readonly sense: Sense) {}

  update(): void {
    const k = this.k;
    const entries = k.entries;
    const now = k.now;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.active || now < e.thinkAt) continue;
      const dt = e.thinkAt > 0 ? now - (e.thinkAt - THINK_PERIOD) : 0;
      e.thinkAt = now + THINK_PERIOD;
      this.think(e, dt > 2 ? 2 : dt);
    }
  }

  /** Aggravation constatée : journal, événement, annonce si l'incident est urgent et sans traitement. */
  aggravate(e: Entry): void {
    const r = e.record;
    r.aggravations++;
    r.aggravated = true;
    e.aggravatedFrom = e.severity;
    this.k.emit(INCIDENT_UPDATED_EVENT, e, 'aggrave');
    if (e.urgency >= 2 && e.state !== 'en_cours' && e.announced > 0) this.k.radio.worse(e);
  }

  private touched(e: Entry): boolean {
    return e.touchedAt >= 0 && this.k.now - e.touchedAt < TOUCH_MEMORY;
  }

  private think(e: Entry, dt: number): void {
    const k = this.k;
    const first = e.record.severityStart === 0 && e.severity === 0;
    let target: number;
    let urgency: number = e.baseUrgency;
    let hold = 1;
    let lapseFails = false;
    const treating = e.state === 'en_cours' || this.touched(e);
    if (!treating) e.untreated += dt;

    if (!e.tracked) {
      // incident abstrait (créé sans entité mesurable) : il s'aggrave avec le temps tant qu'on ne s'en occupe pas
      if (!treating) e.ramp = clamp01(e.ramp + dt / 300);
      target = clamp01(0.15 + 0.2 * e.baseUrgency + 0.4 * e.ramp);
      if (e.state === 'en_cours') target *= 1 - 0.6 * e.progress;
    } else {
      switch (e.family) {
        case FAM_FIRE:
          target = this.fire(e, dt, treating);
          hold = FIRE_OUT_HOLD;
          lapseFails = true;
          if (target >= 0.85) urgency = 3;
          else if (target >= 0.5 && urgency < 3) urgency++;
          break;
        case FAM_VICTIM:
        case FAM_OFFICER:
          target = this.victims(e, dt);
          urgency = this.victimUrgency(e, urgency);
          break;
        case FAM_ISOLATED:
          target = this.isolated(e, dt);
          break;
        case FAM_LOOTING:
          target = this.looting(e, dt, treating);
          lapseFails = true;
          break;
        case FAM_BARRICADE:
          target = this.barricade(e, dt, treating);
          if (target >= 0.7 && urgency < 2) urgency = 2;
          break;
        case FAM_MOTORIST:
          target = this.motorist(e, dt);
          if (target >= 0.75) urgency = 3;
          else if (target >= 0.5 && urgency < 2) urgency = 2;
          break;
        case FAM_RESCUE:
          target = this.rescueBlocked(e);
          if (target >= 0.85) urgency = 3;
          break;
        case FAM_SUSPECT:
          target = this.suspect(e);
          lapseFails = true;
          break;
        default:
          target = e.severity;
          break;
      }
      // clôture automatique : tous les membres ont disparu
      const present = e.presentCount();
      if (present !== e.lastCount) {
        if (e.lastCount >= 0 && present > 0) relabel(k.ctx, e);
        e.lastCount = present;
      }
      if (present === 0) {
        e.goneFor += dt;
        if (e.goneFor >= hold) {
          this.closeGone(e, lapseFails);
          return;
        }
      } else {
        e.goneFor = 0;
      }
    }

    // gravité : suit la cible (montée rapide, descente plus douce pour rester lisible)
    if (first) {
      e.severity = target;
      e.record.severityStart = target;
      e.aggravatedFrom = target;
    } else {
      const rate = (target > e.severity ? 0.5 : 0.3) * dt;
      const d = target - e.severity;
      e.severity = d > rate ? e.severity + rate : d < -rate ? e.severity - rate : target;
    }
    if (e.severity > e.record.severityPeak) e.record.severityPeak = e.severity;
    if (e.measure > e.peakMeasure) e.peakMeasure = e.measure;

    // urgence : se relève avec la gravité ; ne redescend que pendant le traitement
    const u = (urgency > 3 ? 3 : urgency) as 1 | 2 | 3;
    if (u > e.urgency) {
      const was = e.urgency;
      e.urgency = u;
      if (u > e.record.urgency) e.record.urgency = u;
      if (!first && was < u && !treating) this.aggravate(e);
    } else if (u < e.urgency && e.state === 'en_cours') {
      e.urgency = u;
    }
    // annonce radio des incidents urgents (une fois par niveau atteint)
    if (e.urgency >= 2 && e.announced < e.urgency) {
      if (e.announced === 0 || e.state !== 'en_cours') {
        if (e.announced === 0) k.radio.announce(e);
        e.announcedAt = k.now;
      }
      e.announced = e.urgency;
    }
    // aggravation par la seule montée de la gravité, faute de traitement
    if (!first && !treating && e.severity >= e.aggravatedFrom + AGGRAVATION_STEP) this.aggravate(e);

    this.tracker.track(e, dt, treating);
  }

  /** Tous les membres ont disparu : traité s'il y a eu intervention, sinon la cause s'est éteinte d'elle-même. */
  private closeGone(e: Entry, lapseFails: boolean): void {
    const k = this.k;
    const members = e.members;
    let handled = false;
    for (let i = 0; i < members.length; i++) if (members[i].handled) handled = true;
    if (e.record.death) {
      k.close(e, false, 0, 'echec');
    } else if (handled || (e.state === 'en_cours' && e.touchedAt >= 0)) {
      k.close(e, true, this.assigner.actorOf(e), 'traite');
    } else {
      k.close(e, !lapseFails, 0, 'cause_disparue');
    }
  }

  // ───────────────────────────── feux ─────────────────────────────

  private fireMeasure(m: Member): number {
    const ctx = this.k.ctx;
    switch (m.kind) {
      case 'prop': {
        const p = ctx.props.get(m.id);
        if (!p || p.state === 'burnt') return 0;
        m.x = p.x;
        m.z = p.z;
        return p.state === 'burning' && p.burning < 0.15 ? 0.15 : p.burning;
      }
      case 'vehicle': {
        const v = ctx.vehicles.get(m.id);
        if (!v || v.state === 'burnt') return 0;
        m.x = v.x;
        m.z = v.z;
        return v.state === 'burning' && v.burning < 0.2 ? 0.2 : v.burning;
      }
      case 'shop': {
        const s = ctx.props.shop(m.id);
        return s ? s.burning : 0;
      }
      default:
        return ctx.hazards.fireAt(m.x, m.z);
    }
  }

  private fire(e: Entry, dt: number, treating: boolean): number {
    const now = this.k.now;
    const members = e.members;
    let max = 0;
    let foyers = 0;
    const touched = this.touched(e);
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      let v = this.fireMeasure(m);
      if (!(v > 0)) v = 0;
      m.measure = v;
      if (v > m.peak) m.peak = v;
      if (v < FIRE_OUT) {
        if (!m.gone) {
          m.gone = true;
          m.goneAt = now;
          // éteint par quelqu'un (arrosage récent), ou entièrement consumé
          if (touched) m.handled = true;
        }
      } else {
        m.gone = false;
        foyers++;
        if (v > max) max = v;
      }
    }
    e.measure = max;
    if (!treating) e.ramp = clamp01(e.ramp + dt / (FIRE_RAMP_TIME[e.kind] ?? 150));
    if (foyers === 0) return 0;
    const threat = FIRE_THREAT[e.kind] ?? 0.5;
    return clamp01(threat * (0.35 + 0.65 * e.ramp) * (0.4 + 0.6 * max) + 0.06 * (foyers - 1));
  }

  // ───────────────────────────── victimes ─────────────────────────────

  /** Besoin de secours d'une victime 0..1, ou −1 si elle n'en a plus besoin. Met à jour le membre. */
  private victimMeasure(e: Entry, m: Member): number {
    const k = this.k;
    const ctx = k.ctx;
    const p = ctx.people.get(m.id);
    if (!p) {
      m.handled = m.evacuated;
      return -1;
    }
    m.x = p.x;
    m.z = p.z;
    const rank = injuryRank(p.injury);
    if (rank > m.injury) {
      // la victime s'affaiblit : aggravation si personne ne la traite
      if (m.injury > 0 && e.state !== 'en_cours' && m.treatedAt < 0) this.aggravate(e);
      m.injury = rank;
      relabel(ctx, e);
    } else if (rank < m.injury) {
      m.injury = rank;
      relabel(ctx, e);
    }
    if (p.vehicleId !== 0) {
      const v = ctx.vehicles.get(p.vehicleId);
      if (v && v.faction === 'rescue') {
        m.handled = true;
        return -1;
      }
    }
    if (p.custody === 'handed_over' || p.custody === 'in_vehicle') {
      m.handled = true;
      return -1;
    }
    if (rank >= 4) {
      if (!m.dead) {
        m.dead = true;
        m.auxAt = k.now;
        e.record.death = true;
        if (m.treatedAt < 0) this.aggravate(e);
      }
      // un corps reste à prendre en charge ; sans personne pour le faire, l'incident est clos sur un échec
      if (e.means === '' && k.now - m.auxAt > DEAD_UNCLAIMED) return -1;
      return 1;
    }
    if (p.heldBy !== 0) e.touchedAt = k.now; // porté ou traîné : pris en charge
    if (p.posture !== 'down' && p.heldBy === 0) {
      m.handled = m.treatedAt >= 0 || (e.touchedAt >= 0 && k.now - e.touchedAt < 30);
      return -1;
    }
    let v: number;
    if (rank >= 3) v = 0.75 + 0.25 * (1 - p.health / 25);
    else if (rank === 2) v = 0.45 + 0.3 * (1 - (p.health - 25) / 25);
    else v = 0.25;
    // l'attente pèse sur une urgence absolue non prise en charge (bible §G.2 : 240 s)
    if (m.treatedAt < 0) {
      const wait = (k.now - m.joinedAt) / VICTIM_GOLDEN_TIME;
      if (rank >= 3) v += 0.15 * (wait > 1 ? 1 : wait);
      else if (rank === 2) v += 0.1 * (wait > 1 ? 1 : wait);
    } else {
      v *= 0.75; // stabilisée : elle attend son évacuation
    }
    return clamp01(v);
  }

  private victims(e: Entry, _dt: number): number {
    const now = this.k.now;
    const members = e.members;
    let max = 0;
    let n = 0;
    let worst: Member | null = null;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m.gone) continue;
      const v = this.victimMeasure(e, m);
      if (v < 0) {
        m.gone = true;
        m.goneAt = now;
        m.measure = 0;
        continue;
      }
      m.measure = v;
      if (v > m.peak) m.peak = v;
      n++;
      // la victime vivante la plus atteinte est la cible de l'incident (un corps ne passe qu'en dernier)
      const key = m.dead ? v - 2 : v;
      if (!worst || key > (worst.dead ? worst.measure - 2 : worst.measure)) worst = m;
      if (v > max) max = v;
    }
    e.measure = max;
    if (worst && (e.targetId !== worst.id || e.x !== worst.x || e.z !== worst.z)) {
      const moved = Math.abs(e.x - worst.x) + Math.abs(e.z - worst.z) > 8 || e.targetId !== worst.id;
      e.targetId = worst.id;
      e.targetKind = 'person';
      e.x = worst.x;
      e.z = worst.z;
      if (moved) relabel(this.k.ctx, e);
    }
    return n === 0 ? 0 : clamp01(max + 0.05 * (n - 1));
  }

  private victimUrgency(e: Entry, base: number): number {
    const members = e.members;
    let u = base;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m.gone || m.dead) continue;
      if (m.injury >= 3) u = 3;
      else if (m.injury === 2 && u < 2) u = 2;
    }
    if (e.family === FAM_OFFICER && u < 2) u = 2;
    return u;
  }

  // ───────────────────────────── agent isolé ─────────────────────────────

  private isolated(e: Entry, dt: number): number {
    const k = this.k;
    const m = e.members[0];
    if (!m || m.gone) return 0;
    const p: Person | undefined = k.ctx.people.get(m.id);
    if (!p || p.posture === 'down' || p.health <= 0) {
      // à terre : l'incident « agent à terre » prend le relais
      m.gone = true;
      m.goneAt = k.now;
      m.handled = false;
      return 0;
    }
    m.x = p.x;
    m.z = p.z;
    e.x = p.x;
    e.z = p.z;
    const hostiles = this.sense.isolation(p);
    if (hostiles < 0) {
      m.aux += dt; // temps depuis que la condition a cessé
      if (m.aux >= ISOLATED_CLEAR) {
        m.gone = true;
        m.goneAt = k.now;
        m.handled = this.sense.friends(p, k.tuning.isolatedFriendRange) > 0 && e.means !== '';
      }
      e.measure = m.measure * 0.8;
      m.measure = e.measure;
      return e.measure;
    }
    m.aux = 0;
    const age = (k.now - m.joinedAt) / 60;
    const v = clamp01(0.55 + 0.04 * (hostiles > 8 ? 8 : hostiles) + 0.15 * (age > 1 ? 1 : age) + (p.health < 60 ? 0.15 : 0));
    m.measure = v;
    e.measure = v;
    return v;
  }

  // ───────────────────────────── pillage ─────────────────────────────

  private looting(e: Entry, dt: number, treating: boolean): number {
    const k = this.k;
    const now = k.now;
    const members = e.members;
    let max = 0;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m.gone) continue;
      const s = k.ctx.props.shop(m.id);
      if (!s) {
        m.gone = true;
        m.goneAt = now;
        continue;
      }
      const quiet = now - m.auxAt;
      if (s.occupants === 0 && quiet >= LOOTING_QUIET) {
        m.gone = true;
        m.goneAt = now;
        // les pilleurs sont partis devant une unité, ou parce qu'il n'y avait plus rien à prendre
        m.handled = e.touchedAt >= 0 && now - e.touchedAt < 60;
        m.measure = 0;
        continue;
      }
      if (s.occupants === 0 && quiet > 12) {
        m.measure *= 0.92; // plus personne à l'intérieur : l'incident retombe
      } else {
        const occ = s.occupants > 4 ? 4 : s.occupants;
        const loots = m.aux > 8 ? 8 : m.aux;
        m.measure = clamp01(0.4 + 0.08 * occ + 0.03 * loots + 0.2 * (1 - s.stock) + 0.15 * e.ramp);
      }
      if (m.measure > max) max = m.measure;
    }
    if (!treating) e.ramp = clamp01(e.ramp + dt / 120);
    e.measure = max;
    return max;
  }

  // ───────────────────────────── barricade ─────────────────────────────

  private barricade(e: Entry, dt: number, treating: boolean): number {
    const k = this.k;
    const now = k.now;
    const members = e.members;
    let max = 0;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m.gone) continue;
      const p = k.ctx.props.get(m.id);
      if (!p || p.kind !== 'barricade') {
        m.gone = true;
        m.goneAt = now;
        m.handled = true; // une barricade ne disparaît que si on la dégage
        continue;
      }
      m.x = p.x;
      m.z = p.z;
      if (m.aux > m.auxPeak) m.auxPeak = m.aux;
      const parts = m.aux > 10 ? 10 : m.aux;
      m.measure = clamp01(0.3 + 0.025 * parts + (p.burning > 0.05 ? 0.15 : 0) + 0.25 * e.ramp);
      if (m.measure > max) max = m.measure;
    }
    if (!treating) e.ramp = clamp01(e.ramp + dt / 300);
    e.measure = max;
    return max;
  }

  // ───────────────────────────── automobiliste bloqué ─────────────────────────────

  private motorist(e: Entry, dt: number): number {
    const k = this.k;
    const m = e.members[0];
    if (!m || m.gone) return 0;
    const v = k.ctx.vehicles.get(m.id);
    if (!v || v.state === 'burnt' || v.state === 'wrecked') {
      m.gone = true;
      m.goneAt = k.now;
      m.handled = false;
      return 0;
    }
    m.x = v.x;
    m.z = v.z;
    e.x = v.x;
    e.z = v.z;
    if (Math.abs(v.speed) > 1.5) {
      m.aux += dt; // roule de nouveau
      if (m.aux >= MOTORIST_FREE) {
        m.gone = true;
        m.goneAt = k.now;
        m.handled = e.means !== '';
      }
    } else {
      m.aux = 0;
    }
    const age = (k.now - m.joinedAt) / 120;
    const hostiles = this.sense.hostiles(v.x, v.z, 5);
    let val = 0.3 + 0.25 * (age > 1 ? 1 : age) + 0.08 * (hostiles > 5 ? 5 : hostiles);
    if (v.health < 70 || v.burning > 0) val += 0.2; // véhicule pris à partie
    m.measure = clamp01(val);
    e.measure = m.measure;
    return m.measure;
  }

  // ───────────────────────────── secours bloqués ─────────────────────────────

  private rescueBlocked(e: Entry): number {
    const k = this.k;
    const m = e.members[0];
    if (!m || m.gone) return 0;
    const rescue = k.ctx.service<RescueApi>(EXT.rescue);
    let waiting = false;
    if (rescue) {
      const calls = rescue.calls;
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        if (c.id !== m.aux) continue;
        if (c.state === 'en_attente') waiting = true;
        else m.handled = c.state === 'en_route' || c.state === 'sur_place';
        break;
      }
    }
    if (!waiting) {
      m.gone = true;
      m.goneAt = k.now;
      return 0;
    }
    const wait = (k.now - m.joinedAt) / 120;
    m.measure = clamp01(0.6 + 0.4 * (wait > 1 ? 1 : wait));
    e.measure = m.measure;
    return m.measure;
  }

  // ───────────────────────────── suspect ─────────────────────────────

  private suspect(e: Entry): number {
    const k = this.k;
    const m = e.members[0];
    if (!m || m.gone) return 0;
    const p = k.ctx.people.get(m.id);
    if (!p || p.dormant) {
      m.gone = true;
      m.goneAt = k.now;
      m.handled = false;
      return 0;
    }
    if (p.custody !== 'free') {
      m.gone = true;
      m.goneAt = k.now;
      m.handled = true;
      return 0;
    }
    m.x = p.x;
    m.z = p.z;
    e.x = p.x;
    e.z = p.z;
    m.measure = 0.3;
    e.measure = 0.3;
    return 0.3;
  }
}
