/* =====================================================================================
 * CARRIÈRE — système : publie le service 'career' (CareerApi) et enregistre, en mode carrière,
 * chaque mission terminée.
 *
 * Le cadre de mission émet 'mission:finished' (charge utile : MissionResult) juste après avoir
 * établi son compte rendu, avant l'écran de compte rendu ; si la session en cours est en mode
 * « carriere », le résultat est enregistré (CareerBook.record), la progression sauvegardée dans la
 * section « carriere », et 'career:updated' émis avec le bilan. Aucun travail par image.
 * ===================================================================================== */

import type { GameContext, GameSystem, PlayableRole } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { MissionResult } from '@/gameplay/missions/system';
import { CAREER_SERVICE, CAREER_UPDATED_EVENT, MISSION_FINISHED_EVENT } from './api';
import type { CareerApi, CareerChapterView, CareerOutcome, CareerProgress, MissionAvailability } from './api';
import { CareerBook } from './rules';

function isMissionResult(v: unknown): v is MissionResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<MissionResult>;
  return typeof r.id === 'string' && r.id !== '' && typeof r.success === 'boolean';
}

export class CareerSystem implements GameSystem {
  readonly id = 'career';
  // après le cadre de mission (RULES + 60) : rien ne dépend de cet ordre, l'enregistrement se fait sur événement
  readonly order = SystemOrder.RULES + 70;

  private ctx: GameContext | null = null;
  private book_: CareerBook | null = null;
  private last_: CareerOutcome | null = null;
  private unsub: (() => void) | null = null;

  /** Progression et règles (pour les tests et le débogage). */
  get book(): CareerBook | null {
    return this.book_;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const book = new CareerBook(ctx.save);
    this.book_ = book;
    const self = this;
    const api: CareerApi = {
      get progress(): Readonly<CareerProgress> { return book.progress; },
      get chapters(): readonly CareerChapterView[] { return book.chapters; },
      get last(): CareerOutcome | null { return self.last_; },
      isMissionAvailable: (id: string): boolean => book.isMissionAvailable(id),
      missionStatus: (id: string): MissionAvailability => book.missionStatus(id),
      availableRoles: (): PlayableRole[] => book.availableRoles(),
      record: (result: MissionResult): CareerOutcome => self.record(result),
      reset: (): void => {
        book.reset();
        self.last_ = null;
        ctx.events.emitAny(CAREER_UPDATED_EVENT, null);
      },
    };
    ctx.provide<CareerApi>(CAREER_SERVICE, api);
  }

  init(ctx: GameContext): void {
    this.unsub = ctx.events.onAny(MISSION_FINISHED_EVENT, (payload) => {
      const cfg = ctx.session.config;
      if (!cfg || cfg.mode !== 'carriere' || !isMissionResult(payload)) return;
      try {
        this.record(payload);
      } catch (err) {
        console.error('[carrière] enregistrement du résultat impossible', err);
      }
    });
  }

  /** Remise à zéro entre deux sessions : seul le bilan affiché au compte rendu est oublié (la progression reste). */
  reset(): void {
    this.last_ = null;
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private record(result: MissionResult): CareerOutcome {
    const outcome = this.book_!.record(result);
    this.last_ = outcome;
    this.ctx?.events.emitAny(CAREER_UPDATED_EVENT, outcome);
    return outcome;
  }
}
