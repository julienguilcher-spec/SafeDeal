/* =====================================================================================
 * MÉDECINS DE RUE — le joueur médecin : tableau de tri et score de prise en charge
 * (service « medics.records »). Même boucle que les PNJ : repérer, choisir QUI d'abord, traiter,
 * signaler les cas graves, passer la main aux secours.
 *
 * Tableau de tri : les victimes que le joueur peut connaître (vues à moins de 45 m, ou signalées par
 * un appel « Médic ! »), la plus urgente en tête. La couleur n'est certaine qu'après un bilan ; avant,
 * seule une estimation à vue est donnée (à terre ou non, gêne visible).
 * Barème (dossier 06 §10.4) : rinçage +3 · blessé stabilisé +8 · remise aux secours +10 · bilan
 * transmis pour un cas grave +5 · urgence absolue connue laissée en attente pendant qu'on traite un cas
 * moins grave −10 · blessé connu abandonné −20 · sac vide −5.
 * ===================================================================================== */

import type { EntityId, GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueApi } from '@/core/extensions';
import type { CareRecord, TriageColor } from '../rescue/api';
import type { CareService } from '../rescue/care';
import { injuryRank } from '../rescue/care';
import type { MedicEntry, MedicsRecords, TriageEntry } from './api';
import type { HelpCall, NpcStats } from './brain';
import {
  ABANDON_AFTER, ABANDON_DISTANCE, BOARD_MAX, BOARD_RANGE, HELP_MEMORY, PTS_ABANDON, PTS_EMPTY_BAG, PTS_HANDOVER, PTS_RINSE,
  PTS_STABILISE, PTS_TRANSMIT, PTS_TRIAGE_ERROR,
} from './tuning';

/** Ce que le joueur a su d'une victime (pour juger l'abandon et la remise). */
interface Known {
  firstSeen: number;
  treatedByPlayer: boolean;
  transmitted: boolean;
  handed: boolean;
  abandoned: boolean;
  /** Priorité la plus haute relevée tant qu'elle attendait. */
  peak: number;
}

export class MedicScore implements MedicsRecords {
  score = 0;
  rinses = 0;
  treated = 0;
  bilans = 0;
  handovers = 0;
  transmissions = 0;
  triageErrors = 0;
  abandoned = 0;
  recommendedId: EntityId = 0;
  readonly board: TriageEntry[] = [];
  readonly entries: MedicEntry[] = [];
  readonly npc: NpcStats = { medics: 0, rinses: 0, treated: 0, sheltered: 0, signalled: 0 };
  private boardCount = 0;
  private readonly pool: TriageEntry[] = [];
  private readonly known = new Map<EntityId, Known>();
  private delaySum = 0;
  private delayN = 0;
  private updateAt = 0;
  private emptyNoted = false;
  private noticeAt = -1e9;
  private readonly near: Person[] = [];
  private ctx!: GameContext;
  private care!: CareService;
  private calls: HelpCall[] = [];

  bind(ctx: GameContext, care: CareService, calls: HelpCall[]): void {
    this.ctx = ctx;
    this.care = care;
    this.calls = calls;
  }

  reset(): void {
    this.score = this.rinses = this.treated = this.bilans = this.handovers = this.transmissions = this.triageErrors = this.abandoned = 0;
    this.recommendedId = 0;
    this.board.length = 0;
    this.boardCount = 0;
    this.entries.length = 0;
    this.known.clear();
    this.delaySum = this.delayN = 0;
    this.updateAt = 0;
    this.emptyNoted = false;
    this.noticeAt = -1e9;
    const n = this.npc;
    n.medics = n.rinses = n.treated = n.sheltered = n.signalled = 0;
  }

  get meanDelay(): number {
    return this.delayN > 0 ? this.delaySum / this.delayN : 0;
  }

  /** Le joueur tient-il le rôle de médecin (secouriste de rue, ou soignant d'une équipe officielle) ? */
  private medicPlayer(): Person | null {
    const ctx = this.ctx;
    const role = ctx.player.state.role;
    if (role !== 'street_medic' && role !== 'secouriste') return null;
    const p = ctx.player.person();
    if (!p) return null;
    return role === 'street_medic' || p.kind === 'samu' ? p : null;
  }

  private add(what: string, targetId: EntityId, points: number, text: string): void {
    this.score += points;
    this.entries.push({ t: this.ctx.clock.now, what, targetId, points, text });
    if (points !== 0) this.ctx.ui.notify(`${text} (${points > 0 ? '+' : ''}${points})`, points > 0 ? 'ok' : 'warn', 4);
  }

  private knownOf(id: EntityId): Known {
    let k = this.known.get(id);
    if (!k) {
      k = { firstSeen: this.ctx.clock.now, treatedByPlayer: false, transmitted: false, handed: false, abandoned: false, peak: 0 };
      this.known.set(id, k);
    }
    return k;
  }

  // ───────────────────────────── gestes ─────────────────────────────

  /** Un geste de soin vient de se terminer (événement « care:done »). */
  onCare(rec: CareRecord): void {
    const ctx = this.ctx;
    const actor = ctx.people.get(rec.byId);
    if (!actor) return;
    if (!actor.isPlayer) {
      if (actor.kind === 'street_medic') {
        if (rec.verb === 'rincer_yeux') this.npc.rinses++;
        else if (rec.verb === 'soigner' && rec.injuryBefore < 4) this.npc.treated++;
      }
      return;
    }
    if (!this.medicPlayer()) return;
    const k = this.knownOf(rec.targetId);
    if (rec.waited >= 0) {
      this.delaySum += rec.waited;
      this.delayN++;
    }
    switch (rec.verb) {
      case 'rincer_yeux':
        this.rinses++;
        k.treatedByPlayer = true;
        this.triageCheck(rec, false);
        this.add('rincage', rec.targetId, PTS_RINSE, 'Yeux rincés');
        break;
      case 'soigner':
        if (rec.injuryBefore >= 4) {
          this.bilans++;
          this.add('bilan', rec.targetId, 0, 'Bilan : la personne est décédée');
          break;
        }
        this.treated++;
        this.bilans++;
        k.treatedByPlayer = true;
        this.triageCheck(rec, rec.injuryBefore >= 3);
        this.add('soin', rec.targetId, rec.stabilised ? PTS_STABILISE : 0, rec.injuryBefore >= 3 ? 'Urgence absolue stabilisée' : 'Blessé stabilisé');
        break;
      case 'remettre':
        if (!k.handed) {
          k.handed = true;
          this.handovers++;
          this.add('remise', rec.targetId, PTS_HANDOVER, 'Blessé remis aux secours');
        }
        break;
      default:
        break;
    }
  }

  /** Erreur de tri : une urgence absolue connue attendait pendant ce geste sur un cas moins grave. */
  private triageCheck(rec: CareRecord, wasRed: boolean): void {
    if (wasRed) return;
    const now = this.ctx.clock.now;
    for (let i = 0; i < this.boardCount; i++) {
      const e = this.board[i];
      if (e.id === rec.targetId || e.treated || e.inCare) continue;
      if (e.estimate !== 'rouge' && e.color !== 'rouge') continue;
      const k = this.known.get(e.id);
      // elle devait être connue avant le début du geste, et à portée
      if (!k || now - k.firstSeen < 10 || e.distance > 30) continue;
      this.triageErrors++;
      this.add('tri', e.id, PTS_TRIAGE_ERROR, 'Erreur de tri : une urgence absolue attendait');
      return;
    }
  }

  // ───────────────────────────── tableau de tri ─────────────────────────────

  /** Couleur que l'on devine sans examiner la personne. */
  private estimate(q: Person): TriageColor {
    if (q.burning > 0.3) return 'rouge';
    if (q.posture === 'down') return injuryRank(q.injury) >= 3 ? 'rouge' : 'jaune';
    return 'vert';
  }

  private put(q: Person, p: Person, called: boolean): void {
    if (this.boardCount >= BOARD_MAX) return;
    const care = this.care;
    const st = care.state(q.id);
    let e = this.pool[this.boardCount];
    if (!e) {
      e = { id: 0, x: 0, z: 0, color: 'aucun', estimate: 'aucun', priority: 0, waiting: 0, distance: 0, inCare: false, treated: false, needsEvacuation: false, called: false };
      this.pool.push(e);
    }
    const now = this.ctx.clock.now;
    e.id = q.id;
    e.x = q.x;
    e.z = q.z;
    e.color = st && st.evaluatedAt >= 0 ? st.triage : 'aucun';
    e.estimate = this.estimate(q);
    e.priority = care.priority(q);
    e.waiting = st && st.needSince >= 0 ? now - st.needSince : 0;
    e.distance = Math.hypot(q.x - p.x, q.z - p.z);
    const claimed = care.claimedBy(q.id);
    e.inCare = (claimed !== 0 && claimed !== p.id) || (care.beingTreated(q.id) && (!st || st.claimBy !== p.id));
    e.treated = !!st && st.treatedAt >= 0 && !care.needsCare(q);
    e.needsEvacuation = care.needsEvacuation(q);
    e.called = called;
    // insertion triée par priorité décroissante
    const board = this.board;
    let j = this.boardCount - 1;
    if (this.boardCount < board.length) board[this.boardCount] = e;
    else board.push(e);
    while (j >= 0 && board[j].priority < e.priority) {
      board[j + 1] = board[j];
      j--;
    }
    board[j + 1] = e;
    this.boardCount++;
  }

  update(): void {
    const ctx = this.ctx;
    const now = ctx.clock.now;
    if (now < this.updateAt) return;
    this.updateAt = now + 0.5;
    const p = this.medicPlayer();
    if (!p) {
      if (this.boardCount > 0) {
        this.boardCount = 0;
        this.board.length = 0;
        this.recommendedId = 0;
      }
      return;
    }
    const care = this.care;
    this.boardCount = 0;
    // 1. ce qu'il voit
    const n = ctx.people.queryRadius(p.x, p.z, BOARD_RANGE, this.near);
    for (let i = 0; i < n; i++) {
      const q = this.near[i];
      if (q === p || q.dormant || q.vehicleId !== 0) continue;
      const need = care.needsCare(q) || (care.needsRinse(q) && q.gas > 0.2) || (q.posture === 'down' && care.needsEvacuation(q));
      if (!need) continue;
      if (Math.hypot(q.x - p.x, q.z - p.z) > 12 && !ctx.world.lineOfSight(p.x, p.z, q.x, q.z)) continue;
      care.noteNeed(q);
      this.put(q, p, false);
    }
    // 2. ce qu'on lui crie
    const calls = this.calls;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (now - c.t > HELP_MEMORY || Math.hypot(c.x - p.x, c.z - p.z) > 80) continue;
      const q = ctx.people.get(c.id);
      if (!q || q === p || q.vehicleId !== 0 || !(care.needsCare(q) || care.needsEvacuation(q))) continue;
      let present = false;
      for (let j = 0; j < this.boardCount && !present; j++) present = this.board[j].id === q.id;
      if (present) continue;
      care.noteNeed(q);
      this.put(q, p, true);
    }
    this.board.length = this.boardCount;
    // 3. qui d'abord : la plus urgente dont personne ne s'occupe et qui a encore besoin d'un geste
    let rec: EntityId = 0;
    for (let i = 0; i < this.boardCount; i++) {
      const e = this.board[i];
      const k = this.knownOf(e.id);
      if (e.priority > k.peak) k.peak = e.priority;
      if (rec === 0 && !e.inCare && !e.treated) rec = e.id;
    }
    if (rec !== this.recommendedId) {
      this.recommendedId = rec;
      if (rec !== 0) this.recommend(p, rec);
    }
    this.followUp(p);
    // 4. sac vide
    if (!this.emptyNoted && ctx.actions.def('trousse_secours') && ctx.actions.has(p, 'trousse_secours') <= 0
      && ctx.actions.has(p, 'serum_physiologique') <= 0) {
      this.emptyNoted = true;
      this.add('sac_vide', 0, PTS_EMPTY_BAG, 'Sac vide : plus de sérum ni de pansements');
    }
  }

  /** La victime à traiter d'abord devient la tâche du joueur (repère à l'écran) et lui est annoncée. */
  private recommend(p: Person, id: EntityId): void {
    const ctx = this.ctx;
    const now = ctx.clock.now;
    const q = ctx.people.get(id);
    if (!q) return;
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    if (incidents && incidents.playerIncidentId === 0) {
      const list = incidents.list;
      for (let i = 0; i < list.length; i++) {
        const inc = list[i];
        if (inc.targetKind === 'person' && inc.targetId === id && inc.state === 'ouvert') {
          incidents.assign(inc.id, 'joueur');
          break;
        }
      }
    }
    if (now - this.noticeAt < 8) return;
    this.noticeAt = now;
    const d = Math.round(Math.hypot(q.x - p.x, q.z - p.z));
    const color = this.estimate(q);
    const what = color === 'rouge' ? 'Blessé grave' : color === 'jaune' ? 'Blessé à terre' : q.gas > 0.2 ? 'Personne gazée' : 'Blessé léger';
    ctx.ui.notify(`${what} à ${d} m — à traiter en premier`, color === 'rouge' ? 'alert' : 'info', 5);
  }

  /** Suites : bilan transmis au SAMU, relève par l'équipe médicale, blessé abandonné. */
  private followUp(p: Person): void {
    const ctx = this.ctx;
    const now = ctx.clock.now;
    const rescue = ctx.service<RescueApi>(EXT.rescue);
    for (const [id, k] of this.known) {
      const q = ctx.people.get(id);
      if (!q) {
        this.known.delete(id);
        continue;
      }
      const evac = this.care.needsEvacuation(q);
      if (rescue && evac && q.posture === 'down' && (!k.transmitted || !k.handed)) {
        const calls = rescue.calls;
        for (let i = 0; i < calls.length; i++) {
          const c = calls[i];
          if (c.kind !== 'samu' || c.state === 'annule' || Math.hypot(c.x - q.x, c.z - q.z) > 25) continue;
          if (!k.transmitted && k.treatedByPlayer) {
            k.transmitted = true;
            this.transmissions++;
            this.add('transmission', id, PTS_TRANSMIT, 'Bilan transmis au SAMU');
          }
          if (!k.handed && k.treatedByPlayer && c.state === 'sur_place') {
            k.handed = true;
            this.handovers++;
            this.add('remise', id, PTS_HANDOVER, 'Blessé stabilisé remis à l’équipe médicale');
          }
        }
      }
      // abandon : un blessé à terre que le joueur connaissait, sans soins, et dont il s'est éloigné
      if (!k.abandoned && !k.treatedByPlayer && q.posture === 'down' && injuryRank(q.injury) >= 2 && this.care.needsCare(q)
        && now - k.firstSeen > ABANDON_AFTER && Math.hypot(q.x - p.x, q.z - p.z) > ABANDON_DISTANCE && this.care.claimedBy(id) === 0) {
        k.abandoned = true;
        this.abandoned++;
        this.add('abandon', id, PTS_ABANDON, 'Blessé laissé sans soins');
      }
    }
  }

  summary(): string[] {
    const out: string[] = [];
    out.push(`Prise en charge : ${this.rinses} rinçage${this.rinses > 1 ? 's' : ''}, ${this.treated} blessé${this.treated > 1 ? 's' : ''} `
      + `soigné${this.treated > 1 ? 's' : ''}, ${this.handovers} remise${this.handovers > 1 ? 's' : ''} aux secours, `
      + `${this.transmissions} bilan${this.transmissions > 1 ? 's' : ''} transmis.`);
    if (this.triageErrors > 0) out.push(`Tri : ${this.triageErrors} urgence${this.triageErrors > 1 ? 's' : ''} absolue${this.triageErrors > 1 ? 's' : ''} laissée${this.triageErrors > 1 ? 's' : ''} en attente.`);
    if (this.abandoned > 0) out.push(`${this.abandoned} blessé${this.abandoned > 1 ? 's' : ''} laissé${this.abandoned > 1 ? 's' : ''} sans soins.`);
    if (this.delayN > 0) out.push(`Délai moyen de prise en charge : ${Math.round(this.meanDelay)} s.`);
    out.push(`Score de prise en charge : ${this.score} points.`);
    const n = this.npc;
    if (n.medics > 0) {
      out.push(`Secouristes bénévoles (${n.medics}) : ${n.rinses} rinçages, ${n.treated} blessés soignés, ${n.sheltered} mis à l’abri, ${n.signalled} cas graves signalés.`);
    }
    return out;
  }
}
