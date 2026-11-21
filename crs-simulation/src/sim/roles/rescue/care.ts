/* =====================================================================================
 * SOINS — tri des victimes, état de prise en charge, réservation entre soignants, journal.
 * Service « roles.care », partagé par les secours officiels et les médecins de rue : celui des deux
 * modules qui s'initialise le premier le crée et enregistre les gestes (care-handlers.ts).
 *
 * Tri (bible §G.3, d'après l'état simulé) :
 *   noir   décédé                          rouge  urgence absolue : blessure critique, ou personne en feu
 *   jaune  blessure sérieuse, ou à terre   vert   blessure légère, ou gêne due au gaz
 * La priorité départage dans une même couleur : le plus atteint d'abord, puis le plus ancien.
 * ===================================================================================== */

import type { EntityId, GameContext, Person } from '@/core/contracts';
import type { CareApi, CareRecord, CareState, CareVerb, TriageColor } from './api';
import { CARE_DONE_EVENT, CARE_SERVICE, CARE_TRIAGE_EVENT } from './api';
import { RINSE_AGAIN, RINSE_MIN_GAS } from './tuning';

/** Geste en cours : sert à tenir le patient immobile et à suivre le bilan. */
export interface CareSession {
  actor: Person;
  target: Person;
  verb: CareVerb;
  /** Durée du bilan en tête du geste (0 si la victime vient d'être examinée). */
  bilan: number;
  triaged: boolean;
  /** Doses dans le sac au début du geste (pour ne pas en consommer deux si l'objet en a déjà pris une). */
  kitBefore: number;
  injuryBefore: number;
  gasBefore: number;
}

const LOG_MAX = 600;

export function injuryRank(injury: string): number {
  switch (injury) {
    case 'light': return 1;
    case 'serious': return 2;
    case 'critical': return 3;
    case 'dead': return 4;
    default: return 0;
  }
}

export class CareService implements CareApi {
  ctx!: GameContext;
  readonly log: CareRecord[] = [];
  readonly sessions: CareSession[] = [];
  private readonly states = new Map<EntityId, CareState>();
  private heldTick = -1;
  private readonly triageEvent = { id: 0, color: 'aucun' as TriageColor, byId: 0 };

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.events.on('person:removed', (e) => {
      this.states.delete(e.id);
      const s = this.sessions;
      for (let i = s.length - 1; i >= 0; i--) if (s[i].actor.id === e.id || s[i].target.id === e.id) s.splice(i, 1);
    });
  }

  reset(): void {
    this.log.length = 0;
    this.sessions.length = 0;
    this.states.clear();
    this.heldTick = -1;
  }

  get activeCount(): number {
    return this.sessions.length;
  }

  // ───────────────────────────── tri ─────────────────────────────

  triage(p: Person): TriageColor {
    const rank = injuryRank(p.injury);
    if (rank >= 4) return 'noir';
    if (rank === 3 || p.burning > 0.3) return 'rouge';
    if (rank === 2 || (p.posture === 'down' && p.health <= 75)) return 'jaune';
    if (rank === 1 || p.gas > RINSE_MIN_GAS) return 'vert';
    return 'aucun';
  }

  priority(p: Person): number {
    const color = this.triage(p);
    const st = this.states.get(p.id);
    const waited = st && st.needSince >= 0 ? this.ctx.clock.now - st.needSince : 0;
    switch (color) {
      case 'rouge': {
        const w = waited / 8;
        return 300 + (25 - p.health) * 2 + (w > 40 ? 40 : w) + (p.burning > 0.3 ? 30 : 0);
      }
      case 'jaune': return 200 + (50 - p.health) + (p.posture === 'down' ? 15 : 0);
      case 'vert': return 100 + p.gas * 80 + (p.health < 75 ? (75 - p.health) * 0.5 : 0);
      case 'noir': return 10;
      default: return 0;
    }
  }

  needsCare(p: Person): boolean {
    if (p.dormant) return false;
    const rank = injuryRank(p.injury);
    const st = this.states.get(p.id);
    if (rank >= 4) return !st || st.triage !== 'noir'; // un bilan, une fois
    if (p.burning > 0.05) return true;
    if (rank === 0) return false;
    if (!st || st.treatedAt < 0) return true;
    return p.health < st.treatedHealth - 4; // son état s'est dégradé depuis le dernier soin
  }

  needsRinse(p: Person): boolean {
    if (p.dormant || p.injury === 'dead' || !(p.gas > RINSE_MIN_GAS)) return false;
    const st = this.states.get(p.id);
    return !st || st.rinsedAt < 0 || this.ctx.clock.now - st.rinsedAt > RINSE_AGAIN;
  }

  needsEvacuation(p: Person): boolean {
    const rank = injuryRank(p.injury);
    if (rank >= 3) return true;
    if (rank !== 2 || p.posture !== 'down') return false;
    // sérieusement atteinte et toujours à terre après les soins : elle ne repartira pas à pied
    const st = this.states.get(p.id);
    return !!st && st.treatedAt >= 0 && this.ctx.clock.now - st.treatedAt > 4;
  }

  // ───────────────────────────── états ─────────────────────────────

  state(id: EntityId): CareState | undefined {
    return this.states.get(id);
  }

  ensure(id: EntityId): CareState {
    let st = this.states.get(id);
    if (!st) {
      st = {
        id, triage: 'aucun', evaluatedAt: -1, needSince: -1, treatedAt: -1, treatedBy: 0, treatedHealth: 0, rinsedAt: -1,
        handedOver: false, handedAt: -1, loaded: false, claimBy: 0, claimUntil: 0,
      };
      this.states.set(id, st);
    }
    return st;
  }

  /** Note l'instant où le besoin de soins d'une personne a été constaté (pour les délais de prise en charge). */
  noteNeed(p: Person): void {
    const st = this.ensure(p.id);
    if (st.needSince < 0) st.needSince = this.ctx.clock.now;
  }

  claim(targetId: EntityId, byId: EntityId, seconds: number): boolean {
    const st = this.ensure(targetId);
    const now = this.ctx.clock.now;
    if (st.claimBy !== 0 && st.claimBy !== byId && now < st.claimUntil) {
      // la réservation tombe si le soignant a disparu ou n'est plus en état
      const other = this.ctx.people.get(st.claimBy);
      if (other && !this.ctx.health.isIncapacitated(other)) return false;
    }
    st.claimBy = byId;
    st.claimUntil = now + seconds;
    return true;
  }

  release(targetId: EntityId, byId: EntityId): void {
    const st = this.states.get(targetId);
    if (st && st.claimBy === byId) {
      st.claimBy = 0;
      st.claimUntil = 0;
    }
  }

  claimedBy(targetId: EntityId): EntityId {
    const st = this.states.get(targetId);
    return st && st.claimBy !== 0 && this.ctx.clock.now < st.claimUntil ? st.claimBy : 0;
  }

  // ───────────────────────────── gestes en cours ─────────────────────────────

  open(session: CareSession): void {
    this.close(session.actor);
    this.sessions.push(session);
  }

  sessionOf(actor: Person): CareSession | null {
    const s = this.sessions;
    for (let i = 0; i < s.length; i++) if (s[i].actor === actor) return s[i];
    return null;
  }

  close(actor: Person): void {
    const s = this.sessions;
    for (let i = s.length - 1; i >= 0; i--) if (s[i].actor === actor) s.splice(i, 1);
  }

  /** Quelqu'un est-il en train de s'occuper de cette personne ? */
  beingTreated(targetId: EntityId): boolean {
    const s = this.sessions;
    for (let i = 0; i < s.length; i++) if (s[i].target.id === targetId) return true;
    return false;
  }

  /**
   * Un patient ne s'éloigne pas pendant qu'on le soigne : sa commande de déplacement est annulée à
   * chaque pas, après les contrôleurs (foule, police) et avant la locomotion. Une fois par pas, quel
   * que soit le nombre de systèmes qui l'appellent. Le joueur reste libre de ses mouvements.
   */
  holdPatients(): void {
    const tick = this.ctx.clock.tick;
    if (tick === this.heldTick) return;
    this.heldTick = tick;
    const s = this.sessions;
    for (let i = 0; i < s.length; i++) {
      const t = s[i].target;
      if (t.isPlayer || s[i].verb === 'remettre' || s[i].verb === 'evacuer') continue;
      t.cmd.moveX = 0;
      t.cmd.moveZ = 0;
    }
  }

  // ───────────────────────────── journal ─────────────────────────────

  reveal(target: Person, byId: EntityId): TriageColor {
    const st = this.ensure(target.id);
    st.triage = this.triage(target);
    st.evaluatedAt = this.ctx.clock.now;
    const ev = this.triageEvent;
    ev.id = target.id;
    ev.color = st.triage;
    ev.byId = byId;
    this.ctx.events.emitAny(CARE_TRIAGE_EVENT, ev);
    return st.triage;
  }

  record(verb: CareVerb, actor: Person, target: Person, triage: TriageColor, injuryBefore: number, gasBefore: number, stabilised: boolean): CareRecord {
    const st = this.states.get(target.id);
    const now = this.ctx.clock.now;
    const rec: CareRecord = {
      t: now, verb, byId: actor.id, targetId: target.id, triage, injuryBefore, injuryAfter: injuryRank(target.injury), gasBefore,
      stabilised, waited: st && st.needSince >= 0 ? now - st.needSince : -1,
    };
    if (this.log.length >= LOG_MAX) this.log.shift();
    this.log.push(rec);
    this.ctx.events.emitAny(CARE_DONE_EVENT, rec);
    return rec;
  }
}

/** Service de soins du contexte : créé à la première demande, puis partagé. `created` vaut true si l'appelant doit enregistrer les gestes. */
export function obtainCare(ctx: GameContext): { care: CareService; created: boolean } {
  const existing = ctx.service<CareService>(CARE_SERVICE);
  if (existing) return { care: existing, created: false };
  const care = new CareService();
  care.bind(ctx);
  ctx.provide(CARE_SERVICE, care);
  return { care, created: true };
}
