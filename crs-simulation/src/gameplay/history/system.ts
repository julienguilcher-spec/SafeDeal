/* =====================================================================================
 * HISTORIQUE — système : publie le service 'history' (HistoryApi) et inscrit chaque partie jouée.
 *
 * Pendant une session (de session:started à session:ended), le système compte ce qui s'y passe
 * (interpellations, blessés, actes de force, sommations, feux, soins), retient le résultat de mission
 * ('mission:finished'), le bilan de carrière ('career:updated'), la dernière étape de la journée de
 * service (service 'session.journee') et le temps réellement passé à jouer (phase « playing », hors
 * pauses). À session:ended — émis à toute fin de partie, compte rendu ou retour à l'accueil, et aussi
 * quand une partie en remplace une autre —, la partie est inscrite dans la section « historique » de
 * la sauvegarde si elle a été jouée au moins HISTORY_MIN_SECONDS secondes (ou si une mission s'y est
 * conclue), puis 'history:updated' est émis. Le dossier juridique ('law.records'), le directeur de
 * foule et les incidents ('incidents.records') complètent les chiffres quand ils sont branchés.
 * Aucun travail notable par image (une lecture de l'étape de la journée de service).
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, SessionConfig, SessionPhase, Unsubscribe } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { CareerOutcome, CareerSanction } from '@/gameplay/career/api';
import { CAREER_UPDATED_EVENT, MISSION_FINISHED_EVENT } from '@/gameplay/career/api';
import type { LawRecords } from '@/gameplay/law/api';
import { missionById } from '@/gameplay/missions/catalog';
import type { MissionResult } from '@/gameplay/missions/system';
import { HISTORY_MIN_SECONDS, HISTORY_SERVICE, HISTORY_UPDATED_EVENT } from './api';
import type { HistoryApi, HistoryCareer, HistoryEntry, HistoryFigures, HistoryOutcome, HistoryTotals } from './api';
import { HistoryBook, emptyFigures, keepConfig } from './book';

const SANCTION_LABELS: Readonly<Record<CareerSanction['kind'], string>> = {
  avertissement: 'Avertissement',
  blame: 'Blâme',
  retrogradation: 'Rétrogradation',
};

/** Vue minimale de la journée de service (src/gameplay/session/journee.ts). */
interface JourneeLike {
  readonly stage: string;
}
/** Vue minimale du journal des incidents (src/gameplay/incidents/api.ts). */
interface IncidentsLike {
  stats(): { total: number; treated: number };
}

function isMissionResult(v: unknown): v is MissionResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<MissionResult>;
  return typeof r.id === 'string' && r.id !== '' && typeof r.success === 'boolean';
}

function isCareerOutcome(v: unknown): v is CareerOutcome {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Partial<CareerOutcome>;
  return typeof o.missionId === 'string' && typeof o.grade === 'string';
}

function finite(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export interface HistorySystemOptions {
  /** Horloge réelle (ms) ; Date.now par défaut (tests). */
  now?: () => number;
}

export class HistorySystem implements GameSystem {
  readonly id = 'history';
  // après le cadre de mission (RULES + 60) et la carrière (RULES + 70) : leurs événements de fin arrivent avant l'inscription
  readonly order = SystemOrder.RULES + 80;

  private ctx: GameContext | null = null;
  private book_: HistoryBook | null = null;
  private last_: HistoryEntry | null = null;
  private readonly offs: Unsubscribe[] = [];
  private readonly now: () => number;
  private journee: JourneeLike | null = null;

  // ── partie en cours ──
  private live = false;
  private reachedPlaying = false;
  private config: SessionConfig | null = null;
  /** Copie gardée pour « Rejouer » (null si la configuration est trop volumineuse). */
  private replay: SessionConfig | null = null;
  private startedAt = 0;
  private playingSince = -1;
  private playMs = 0;
  private result: MissionResult | null = null;
  private resultInterrupted = false;
  private careerOutcome: CareerOutcome | null = null;
  private journeeStage = '';
  private arrests = 0;
  private sommations = 0;
  private forceUses = 0;
  private forceFaults = 0;
  private playerForceUses = 0;
  private fires = 0;
  private firesOut = 0;
  private treated = 0;
  private readonly injuredIds = new Set<EntityId>();

  constructor(options: HistorySystemOptions = {}) {
    this.now = options.now ?? ((): number => Date.now());
  }

  /** Registre (tests, débogage). */
  get book(): HistoryBook | null {
    return this.book_;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const book = new HistoryBook(ctx.save);
    this.book_ = book;
    const self = this;
    const api: HistoryApi = {
      get entries(): readonly HistoryEntry[] { return book.entries; },
      get totals(): Readonly<HistoryTotals> { return book.totals; },
      get last(): HistoryEntry | null { return self.last_; },
      get: (id: string): HistoryEntry | null => book.get(id),
      willRecord: (): boolean => self.willRecord(),
      replayConfig: (id: string) => book.replayConfig(id),
      clear: (): void => {
        book.clear();
        self.last_ = null;
        ctx.events.emitAny(HISTORY_UPDATED_EVENT, null);
      },
    };
    ctx.provide<HistoryApi>(HISTORY_SERVICE, api);
  }

  init(ctx: GameContext): void {
    const ev = ctx.events;
    const j = ctx.service<JourneeLike>('session.journee');
    this.journee = j && typeof j === 'object' ? j : null;
    const pid = (): EntityId => ctx.player.state.personId;
    this.offs.push(
      ev.on('session:started', (e) => this.begin(e.config)),
      ev.on('session:phase', (e) => this.onPhase(e.phase, e.previous)),
      ev.on('session:ended', (e) => this.finish(e.toDebrief)),
      ev.onAny(MISSION_FINISHED_EVENT, (payload) => {
        if (!this.live || !isMissionResult(payload)) return;
        this.result = payload;
        // fin de mission pendant la fermeture de la session (abandon) : la partie s'est arrêtée avant son terme
        const phase = ctx.session.phase;
        this.resultInterrupted = /^Mission interrompue/.test(payload.summary) || (phase !== 'playing' && phase !== 'paused');
      }),
      ev.onAny(CAREER_UPDATED_EVENT, (payload) => {
        if (this.live && isCareerOutcome(payload)) this.careerOutcome = payload;
      }),
      ev.on('person:arrested', () => { if (this.live) this.arrests++; }),
      ev.on('law:sommation', () => { if (this.live) this.sommations++; }),
      ev.on('law:force', (e) => {
        if (!this.live) return;
        this.forceUses++;
        if (e.report.verdict.kind !== 'licite') this.forceFaults++;
        if (e.report.byId !== 0 && e.report.byId === pid()) this.playerForceUses++;
      }),
      ev.on('fire:started', (e) => { if (this.live && e.targetKind !== 'person') this.fires++; }),
      ev.on('fire:out', () => { if (this.live) this.firesOut++; }),
      ev.on('person:treated', () => { if (this.live) this.treated++; }),
      ev.on('person:down', (e) => {
        if (this.live && (e.injury === 'serious' || e.injury === 'critical' || e.injury === 'dead')) this.injuredIds.add(e.id);
      }),
    );
  }

  update(): void {
    if (!this.live || !this.journee) return;
    const stage = this.journee.stage;
    if (typeof stage === 'string' && stage !== 'inactif' && stage !== '') this.journeeStage = stage;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** La partie en cours sera inscrite à sa fin. */
  willRecord(): boolean {
    if (!this.live || !this.reachedPlaying) return false;
    return this.result !== null || finite(this.ctx?.clock.now) >= HISTORY_MIN_SECONDS;
  }

  private begin(config: SessionConfig): void {
    this.live = true;
    this.reachedPlaying = false;
    this.config = config;
    this.replay = keepConfig(config);
    this.startedAt = this.now();
    this.playingSince = -1;
    this.playMs = 0;
    this.result = null;
    this.resultInterrupted = false;
    this.careerOutcome = null;
    this.journeeStage = '';
    this.arrests = 0;
    this.sommations = 0;
    this.forceUses = 0;
    this.forceFaults = 0;
    this.playerForceUses = 0;
    this.fires = 0;
    this.firesOut = 0;
    this.treated = 0;
    this.injuredIds.clear();
  }

  private onPhase(phase: SessionPhase, previous: SessionPhase): void {
    if (!this.live) return;
    if (phase === 'playing') {
      this.reachedPlaying = true;
      if (this.playingSince < 0) this.playingSince = this.now();
    } else if (previous === 'playing') {
      this.closePlaying();
    }
  }

  private closePlaying(): void {
    if (this.playingSince >= 0) {
      this.playMs += Math.max(0, this.now() - this.playingSince);
      this.playingSince = -1;
    }
  }

  private finish(toDebrief: boolean): void {
    if (!this.live) return;
    const record = this.willRecord();
    this.closePlaying();
    this.live = false;
    if (!record || !this.book_) return;
    try {
      const entry = this.book_.add(this.buildEntry(toDebrief));
      this.last_ = entry;
      this.ctx?.events.emitAny(HISTORY_UPDATED_EVENT, entry);
    } catch (err) {
      // l'historique ne doit jamais empêcher une partie de se terminer
      console.error('[historique] inscription de la partie impossible', err);
    }
  }

  private buildEntry(toDebrief: boolean): HistoryEntry {
    const ctx = this.ctx!;
    const cfg = this.config ?? ctx.session.config;
    const endedAt = this.now();
    const missionId = cfg?.missionId ?? '';
    const result = this.result;
    let outcome: HistoryOutcome;
    if (result) outcome = result.success ? 'reussie' : this.resultInterrupted ? 'interrompue' : 'echouee';
    else if (missionId) outcome = 'interrompue';
    else outcome = toDebrief ? 'terminee' : 'quittee';
    const extra = cfg?.extra as { journee?: unknown } | undefined;
    const journee = extra && extra.journee === true ? this.journeeStage || 'prise_de_service' : '';
    return {
      id: `p${endedAt.toString(36)}`,
      startedAt: this.startedAt || endedAt,
      endedAt,
      playSeconds: Math.round(this.playMs / 1000),
      simSeconds: Math.round(finite(ctx.clock.now)),
      mode: cfg?.mode ?? 'test',
      role: cfg?.role ?? ctx.player.state.role,
      rank: cfg ? cfg.rank : null,
      place: cfg?.place ?? '',
      timeOfDay: finite(cfg?.timeOfDay, 14),
      weather: cfg?.weather ?? 'clair',
      crowdSize: Math.max(0, Math.round(finite(cfg?.crowdSize))),
      missionId,
      missionTitle: result ? result.title : missionId ? missionById(missionId)?.title ?? '' : '',
      journee,
      outcome,
      debrief: toDebrief,
      result: result ? { success: result.success, score: finite(result.score), grade: result.grade, summary: result.summary } : null,
      figures: this.figures(cfg),
      career: this.career(missionId),
      config: this.replay,
    };
  }

  private figures(cfg: SessionConfig | null): HistoryFigures {
    const ctx = this.ctx!;
    const f = emptyFigures();
    f.arrests = this.arrests;
    f.sommations = this.sommations;
    f.forceUses = this.forceUses;
    f.forceFaults = this.forceFaults;
    f.playerForceUses = this.playerForceUses;
    f.fires = this.fires;
    f.firesOut = this.firesOut;
    f.treated = this.treated;
    f.injured = this.injuredIds.size;
    try {
      const d = ctx.director.stats;
      f.crowd = Math.max(0, Math.round(finite(d.total)));
      f.dispersed = Math.max(0, Math.round(finite(d.dispersed)));
      f.injured = Math.max(f.injured, Math.round(finite(d.injured)));
      f.arrests = Math.max(f.arrests, Math.round(finite(d.arrested)));
    } catch {
      // directeur de foule défaillant : les compteurs de la session suffisent
    }
    const records = ctx.service<LawRecords>('law.records');
    if (records && typeof records.stats === 'function') {
      try {
        const all = records.stats();
        f.arrests = Math.max(f.arrests, all.arrests);
        f.sommations = Math.max(f.sommations, all.sommations);
        f.forceUses = all.forces;
        f.forceFaults = all.faults;
        const playerId = ctx.player.state.personId;
        const police = !!cfg && cfg.rank !== null;
        if (police && playerId !== 0) {
          const mine = records.stats(playerId);
          f.playerForceUses = mine.forces;
          f.lawScore = Math.round(finite(mine.score, 100));
        } else {
          f.lawScore = Math.round(finite(records.score, 100));
        }
      } catch (err) {
        console.warn('[historique] lecture du dossier juridique impossible', err);
      }
    }
    const inc = ctx.service<IncidentsLike>('incidents.records');
    if (inc && typeof inc.stats === 'function') {
      try {
        const s = inc.stats();
        f.incidents = Math.max(0, Math.round(finite(s.total)));
        f.incidentsTreated = Math.max(0, Math.round(finite(s.treated)));
      } catch {
        // journal des incidents défaillant : ignoré
      }
    }
    return f;
  }

  private career(missionId: string): HistoryCareer | null {
    const o = this.careerOutcome;
    if (!o || (missionId && o.missionId !== missionId)) return null;
    const c: HistoryCareer = { grade: o.grade, success: o.success, promoted: o.promoted, message: o.message };
    if (o.newRank) c.newRank = o.newRank;
    if (o.sanction) c.sanction = `${SANCTION_LABELS[o.sanction.kind] ?? o.sanction.kind} : ${o.sanction.reason}`;
    return c;
  }
}
