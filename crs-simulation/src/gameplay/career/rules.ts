/* =====================================================================================
 * CARRIÈRE — règles de progression (simulation pure, sans DOM ni événements).
 *
 * CareerBook tient la progression, la lit et l'écrit dans la sauvegarde (section « carriere »),
 * et applique les règles ci-dessous. Le système (system.ts) la publie sous le service 'career'.
 *
 * Exigence d'un chapitre : au moins `requiredMissions` missions DU chapitre réussies, et la moyenne
 * de leurs meilleures notes (les `requiredMissions` meilleures) au moins égale à `requiredAverage`
 * (A = 4 … E = 0). Les conditions rédigées en plus (« aucune sanction », « deux habilitations ») ne
 * sont pas mesurées dans cette version : seul le couple nombre / moyenne compte.
 *
 * Parcours principal (chapitres 0 à 8) : quand l'exigence du chapitre courant est remplie, il est
 * terminé, ses déblocages sont acquis et le chapitre suivant commence, avec son grade (promotion si
 * le grade change). Le chapitre 8 terminé clôt la carrière.
 *
 * Disponibilité des missions :
 *   - parcours principal : missions du chapitre courant et des chapitres précédents (on peut rejouer
 *     pour améliorer sa note) ;
 *   - détachements facultatifs 9 à 12 : ouverts quand le chapitre qui les annonce dans ses déblocages
 *     est terminé, c'est-à-dire quand le parcours principal ATTEINT le chapitre suivant : BRAV-M et
 *     engin lanceur d'eau au chapitre 3 (fin du chapitre 2), télépilote et Centaure au chapitre 4
 *     (fin du chapitre 3) ; toutes leurs missions s'ouvrent ensemble ;
 *   - regards croisés (13) : une mission civile qui a une mission miroir s'ouvre quand ce miroir a été
 *     joué (jusqu'au compte rendu) ; les autres s'ouvrent dans l'ordre du chapitre, trois par chapitre
 *     terminé (« les autres, à la fin de chaque chapitre ») ;
 *   - missions hors carrière (chapitre -1) : jamais proposées en carrière.
 *
 * Rôles ouverts par le grade (ROLES_BY_RANK, api.ts) : les rôles civils toujours ; CRS dès l'école ; les
 * spécialités (BRAV-M, canon à eau, télépilote, Centaure) dès la titularisation (gardien de la paix) ;
 * chef de groupe dès brigadier-chef ; commandant dès capitaine (le capitaine du chapitre 5 commande
 * déjà une demi-compagnie avec le rôle unique de commandant). Le grade tenu dans un rôle dont l'échelle
 * ne contient pas le grade de carrière est ramené au plus haut grade de cette échelle (voir l'accueil).
 *
 * Sanctions (modestes, une au plus par mission, la plus lourde) :
 *   - rétrogradation : échec sur une condition « révocation » de la mission (retrait du commandement) ;
 *   - blâme : échec sur une condition « bavure grave » ;
 *   - avertissement : régularité de l'emploi de la force sous 50 / 100, ou mission échouée notée E.
 * Elles sont inscrites au dossier et affichées ; dans cette version elles ne retirent ni grade ni
 * chapitre (la progression acquise reste acquise).
 * ===================================================================================== */

import type { PlayableRole, PoliceRank, SaveApi } from '@/core/contracts';
import type { CareerChapter, MissionDef } from '@/core/missions-schema';
import { missionById } from '@/gameplay/missions/catalog';
import { CAREER_CHAPTERS } from '@/gameplay/missions/catalog/career';
import type { MissionResult } from '@/gameplay/missions/system';
import {
  CAREER_RANK_LABELS, CAREER_SAVE_SECTION, CIVIL_ROLES, GRADE_VALUES, ROLES_BY_RANK, gradeLetter, rankIndex,
} from './api';
import type {
  CareerChapterView, CareerGrade, CareerMissionRecord, CareerOutcome, CareerProgress, CareerSanction, MissionAvailability,
  SanctionKind,
} from './api';

/** Dernier chapitre du parcours principal. */
export const LAST_MAIN_CHAPTER = 8;
/** Chapitre des rôles civils (« regards croisés »). */
export const CIVIL_CHAPTER = 13;
/** Détachements facultatifs : chapitre du parcours principal à partir duquel ils sont ouverts. */
export const DETACHMENT_OPENS_AT: Readonly<Record<number, number>> = { 9: 3, 10: 3, 11: 4, 12: 4 };
/** Missions civiles sans miroir ouvertes par chapitre terminé. */
export const CIVIL_PER_CHAPTER = 3;
/** Nombre maximal de sanctions conservées au dossier. */
const MAX_SANCTIONS = 60;

const GRADES = new Set<string>(['A', 'B', 'C', 'D', 'E']);
const SANCTION_KINDS = new Set<string>(['avertissement', 'blame', 'retrogradation']);
const SANCTION_WEIGHT: Readonly<Record<SanctionKind, number>> = { avertissement: 1, blame: 2, retrogradation: 3 };
const SANCTION_LABELS: Readonly<Record<SanctionKind, string>> = { avertissement: 'Avertissement', blame: 'Blâme', retrogradation: 'Rétrogradation' };

/** Rôles ouverts par un grade de carrière (rôles civils compris). */
export function rolesForRank(rank: PoliceRank): PlayableRole[] {
  const level = rankIndex(rank);
  const out: PlayableRole[] = [];
  for (const step of ROLES_BY_RANK) if (level >= rankIndex(step.from)) out.push(...step.roles);
  out.push(...CIVIL_ROLES);
  return out;
}

/** Note (lettre) d'un résultat de mission : première lettre de « A — Très bien », sinon déduite du score. */
export function gradeOfResult(result: Pick<MissionResult, 'grade' | 'score'>): CareerGrade {
  const first = typeof result.grade === 'string' ? result.grade.trim().charAt(0).toUpperCase() : '';
  if (GRADES.has(first)) return first as CareerGrade;
  const s = Number.isFinite(result.score) ? result.score : 0;
  return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'E';
}

/** Libellé d'un chapitre : « chapitre 3 « Six, dont moi » ». */
export function chapterName(c: Pick<CareerChapter, 'index' | 'title'>): string {
  return `chapitre ${c.index} « ${c.title} »`;
}

export function defaultProgress(): CareerProgress {
  return { chapter: 0, rank: CAREER_CHAPTERS[0]!.rank, results: {}, sanctions: [], unlocked: [], completed: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Assainit une progression lue dans la sauvegarde (format inconnu, champs manquants ou faussés). */
export function sanitizeProgress(raw: unknown): CareerProgress {
  const out = defaultProgress();
  if (!isRecord(raw)) return out;
  out.chapter = Math.max(0, Math.min(LAST_MAIN_CHAPTER, Math.floor(finiteOr(raw.chapter, 0))));
  // le grade suit toujours le chapitre courant (une valeur trafiquée ne donne pas un grade de plus)
  out.rank = CAREER_CHAPTERS[out.chapter]!.rank;
  if (isRecord(raw.results)) {
    for (const [id, r] of Object.entries(raw.results)) {
      if (!isRecord(r) || !missionById(id)) continue;
      const best = typeof r.best === 'string' && GRADES.has(r.best) ? (r.best as CareerGrade) : 'E';
      const plays = Math.max(1, Math.floor(finiteOr(r.plays, 1)));
      out.results[id] = { best, success: r.success === true, plays, lastAt: Math.max(0, finiteOr(r.lastAt, 0)) };
    }
  }
  if (Array.isArray(raw.sanctions)) {
    for (const s of raw.sanctions) {
      if (!isRecord(s) || typeof s.kind !== 'string' || !SANCTION_KINDS.has(s.kind)) continue;
      out.sanctions.push({
        at: Math.max(0, finiteOr(s.at, 0)),
        kind: s.kind as SanctionKind,
        reason: typeof s.reason === 'string' ? s.reason : '',
        missionId: typeof s.missionId === 'string' ? s.missionId : '',
      });
    }
    if (out.sanctions.length > MAX_SANCTIONS) out.sanctions.splice(0, out.sanctions.length - MAX_SANCTIONS);
  }
  if (Array.isArray(raw.completed)) {
    for (const c of raw.completed) {
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= CAREER_CHAPTERS.length) continue;
      if (out.completed.indexOf(c) < 0) out.completed.push(c);
    }
  }
  // cohérence du parcours principal : les chapitres antérieurs au chapitre courant sont terminés
  for (let i = 0; i < out.chapter; i++) if (out.completed.indexOf(i) < 0) out.completed.push(i);
  // les déblocages se déduisent des chapitres terminés (dans l'ordre où ils l'ont été)
  for (const c of out.completed) for (const u of CAREER_CHAPTERS[c]!.unlocks) if (out.unlocked.indexOf(u) < 0) out.unlocked.push(u);
  return out;
}

interface ChapterTally {
  succeeded: number;
  played: number;
  average: number | null;
  met: boolean;
}

/** Progression et règles de la carrière. */
export class CareerBook {
  private p: CareerProgress;
  private views: CareerChapterView[] | null = null;
  /** Missions civiles sans miroir, dans l'ordre du chapitre 13. */
  private readonly civilFree: string[];
  private readonly chapterByMission = new Map<string, number>();

  constructor(private readonly save: SaveApi | null) {
    for (const c of CAREER_CHAPTERS) for (const id of c.missions) this.chapterByMission.set(id, c.index);
    const civil = CAREER_CHAPTERS[CIVIL_CHAPTER];
    this.civilFree = civil ? civil.missions.filter((id) => !missionById(id)?.mirrorOf) : [];
    this.p = this.load();
  }

  get progress(): Readonly<CareerProgress> {
    return this.p;
  }

  get chapters(): readonly CareerChapterView[] {
    if (!this.views) this.views = CAREER_CHAPTERS.map((c) => this.view(c));
    return this.views;
  }

  /** Chapitre d'une mission (celui qui la liste, à défaut celui de sa fiche ; -1 hors carrière). */
  chapterOf(id: string): number {
    const c = this.chapterByMission.get(id);
    if (c !== undefined) return c;
    const def = missionById(id);
    return def ? def.chapter : -1;
  }

  isChapterDone(index: number): boolean {
    return this.p.completed.indexOf(index) >= 0;
  }

  /** Le chapitre est-il ouvert (au moins une de ses missions est jouable) ? */
  isChapterOpen(index: number): boolean {
    if (index < 0 || index >= CAREER_CHAPTERS.length) return false;
    if (index <= LAST_MAIN_CHAPTER) return index <= this.p.chapter;
    const at = DETACHMENT_OPENS_AT[index];
    if (at !== undefined) return this.p.chapter >= at;
    if (index === CIVIL_CHAPTER) return CAREER_CHAPTERS[index]!.missions.some((id) => this.missionStatus(id).available);
    return false;
  }

  missionStatus(id: string): MissionAvailability {
    const def = missionById(id);
    const chapter = def ? this.chapterOf(id) : -1;
    if (!def || chapter < 0) return { available: false, reason: 'Mission hors carrière : elle se joue en mode libre.', chapter: -1 };
    const ch = CAREER_CHAPTERS[chapter]!;
    if (chapter <= LAST_MAIN_CHAPTER) {
      if (chapter <= this.p.chapter) return { available: true, reason: '', chapter };
      return { available: false, reason: `Ouverte au ${chapterName(ch)}.`, chapter };
    }
    const at = DETACHMENT_OPENS_AT[chapter];
    if (at !== undefined) {
      if (this.p.chapter >= at) return { available: true, reason: '', chapter };
      const prev = CAREER_CHAPTERS[at - 1]!;
      return { available: false, reason: `Détachement ouvert à la fin du ${chapterName(prev)}.`, chapter };
    }
    if (chapter === CIVIL_CHAPTER) {
      if (def.mirrorOf) {
        if (this.p.results[def.mirrorOf]) return { available: true, reason: '', chapter };
        const mirror = missionById(def.mirrorOf);
        return { available: false, reason: `Ouverte après la mission miroir « ${mirror ? mirror.title : def.mirrorOf} ».`, chapter };
      }
      const rank = this.civilFree.indexOf(id);
      const open = this.p.completed.length * CIVIL_PER_CHAPTER;
      if (rank >= 0 && rank < open) return { available: true, reason: '', chapter };
      const need = Math.floor(Math.max(0, rank) / CIVIL_PER_CHAPTER) + 1;
      return { available: false, reason: `Ouverte après ${need} chapitre${need > 1 ? 's' : ''} terminé${need > 1 ? 's' : ''} (${this.p.completed.length} à ce jour).`, chapter };
    }
    return { available: false, reason: 'Chapitre inconnu.', chapter };
  }

  isMissionAvailable(id: string): boolean {
    return this.missionStatus(id).available;
  }

  availableRoles(): PlayableRole[] {
    return rolesForRank(this.p.rank);
  }

  /** Enregistre un résultat, applique sanctions et promotions, sauvegarde. */
  record(result: MissionResult, now: number = Date.now()): CareerOutcome {
    const def = missionById(result.id);
    const grade = gradeOfResult(result);
    const success = result.success === true;
    const prev = this.p.results[result.id];
    const rec: CareerMissionRecord = prev
      ? { best: GRADE_VALUES[grade] > GRADE_VALUES[prev.best] ? grade : prev.best, success: prev.success || success, plays: prev.plays + 1, lastAt: now }
      : { best: grade, success, plays: 1, lastAt: now };
    this.p.results[result.id] = rec;

    const sanction = def ? sanctionFor(result, def, grade, now) : null;
    if (sanction) {
      this.p.sanctions.push(sanction);
      if (this.p.sanctions.length > MAX_SANCTIONS) this.p.sanctions.splice(0, this.p.sanctions.length - MAX_SANCTIONS);
    }

    const rankBefore = this.p.rank;
    const done = this.advance();
    this.views = null;
    this.persist();

    const outcome: CareerOutcome = {
      missionId: result.id,
      title: def ? def.title : result.title,
      grade,
      success,
      promoted: rankIndex(this.p.rank) > rankIndex(rankBefore),
      message: '',
    };
    if (outcome.promoted) outcome.newRank = this.p.rank;
    if (done.length > 0) outcome.chapterDone = done[done.length - 1]!;
    if (sanction) outcome.sanction = sanction;
    outcome.message = this.messageFor(outcome, done);
    return outcome;
  }

  /** Recommence la carrière : la section est effacée de la sauvegarde. */
  reset(): void {
    this.p = defaultProgress();
    this.views = null;
    try {
      this.save?.remove(CAREER_SAVE_SECTION);
    } catch (err) {
      console.error('[carrière] effacement de la sauvegarde impossible', err);
    }
  }

  /** Bilan chiffré d'un chapitre au regard de son exigence. */
  tally(c: CareerChapter): ChapterTally {
    const grades: number[] = [];
    let played = 0;
    for (const id of c.missions) {
      const r = this.p.results[id];
      if (!r) continue;
      played++;
      if (r.success) grades.push(GRADE_VALUES[r.best]);
    }
    grades.sort((a, b) => b - a);
    const kept = grades.slice(0, Math.max(1, c.requiredMissions));
    const average = kept.length > 0 ? kept.reduce((s, g) => s + g, 0) / kept.length : null;
    const met = grades.length >= c.requiredMissions && average !== null && average + 1e-6 >= c.requiredAverage;
    return { succeeded: grades.length, played, average, met };
  }

  // ───────────────────────────── interne ─────────────────────────────

  private load(): CareerProgress {
    if (!this.save) return defaultProgress();
    try {
      return sanitizeProgress(this.save.read<unknown>(CAREER_SAVE_SECTION, null));
    } catch (err) {
      console.error('[carrière] lecture de la sauvegarde impossible', err);
      return defaultProgress();
    }
  }

  private persist(): void {
    if (!this.save) return;
    try {
      this.save.write<CareerProgress>(CAREER_SAVE_SECTION, this.p);
    } catch (err) {
      console.error('[carrière] écriture de la sauvegarde impossible', err);
    }
  }

  private complete(index: number): void {
    this.p.completed.push(index);
    for (const u of CAREER_CHAPTERS[index]!.unlocks) if (this.p.unlocked.indexOf(u) < 0) this.p.unlocked.push(u);
  }

  /** Termine les chapitres dont l'exigence est remplie ; retourne leurs indices, dans l'ordre. */
  private advance(): number[] {
    const done: number[] = [];
    // parcours principal : un chapitre après l'autre (un résultat peut en clore plusieurs s'ils étaient déjà acquis)
    for (;;) {
      const i = this.p.chapter;
      if (this.isChapterDone(i) || !this.tally(CAREER_CHAPTERS[i]!).met) break;
      this.complete(i);
      done.push(i);
      if (i >= LAST_MAIN_CHAPTER) break;
      this.p.chapter = i + 1;
      this.p.rank = CAREER_CHAPTERS[i + 1]!.rank;
    }
    // détachements et regards croisés, dans l'ordre ; terminer un chapitre peut ouvrir des missions civiles
    for (let i = LAST_MAIN_CHAPTER + 1; i < CAREER_CHAPTERS.length; i++) {
      if (this.isChapterDone(i) || !this.isChapterOpen(i) || !this.tally(CAREER_CHAPTERS[i]!).met) continue;
      this.complete(i);
      done.push(i);
    }
    return done;
  }

  private view(c: CareerChapter): CareerChapterView {
    const t = this.tally(c);
    const done = this.isChapterDone(c.index);
    const status = done ? 'done' : this.isChapterOpen(c.index) ? 'current' : 'locked';
    return {
      ...c,
      missions: [...c.missions],
      unlocks: [...c.unlocks],
      status,
      succeeded: t.succeeded,
      played: t.played,
      average: t.average,
      requirementMet: t.met,
      progressLabel: progressLabel(c, t),
    };
  }

  private messageFor(o: CareerOutcome, done: number[]): string {
    const parts: string[] = [];
    if (o.promoted && o.newRank) {
      const next = CAREER_CHAPTERS[this.p.chapter]!;
      parts.push(`Promotion : vous êtes nommé ${CAREER_RANK_LABELS[o.newRank].toLowerCase()}. Le ${chapterName(next)} commence.`);
    } else if (done.length > 0) {
      const last = CAREER_CHAPTERS[done[done.length - 1]!]!;
      parts.push(`${capital(chapterName(last))} terminé.${last.index === LAST_MAIN_CHAPTER ? ' Votre carrière est menée à son terme.' : ''}`);
    }
    if (done.length > 0) {
      const unlocks = done.flatMap((i) => CAREER_CHAPTERS[i]!.unlocks).filter((u) => !/^Grade de /.test(u));
      if (unlocks.length > 0) parts.push(`Débloqué : ${unlocks.join(', ')}.`);
    } else {
      // reste à faire dans le chapitre de la mission jouée, s'il est encore en cours
      const ci = this.chapterOf(o.missionId);
      const c = ci >= 0 ? CAREER_CHAPTERS[ci] : undefined;
      if (c && !this.isChapterDone(ci) && this.isChapterOpen(ci)) parts.push(remainingLabel(c, this.tally(c)));
      else if (c && this.isChapterDone(ci)) parts.push(`Résultat enregistré : le ${chapterName(c)} est déjà terminé.`);
    }
    if (o.sanction) parts.push(`${SANCTION_LABELS[o.sanction.kind]} inscrit au dossier : ${o.sanction.reason}`);
    return parts.join(' ');
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 3 / 5 missions réussies, moyenne B (B exigée) ». */
export function progressLabel(c: CareerChapter, t: Pick<ChapterTally, 'succeeded' | 'average'>): string {
  const n = Math.min(t.succeeded, c.requiredMissions);
  const avg = t.average !== null ? `, moyenne ${gradeLetter(t.average)}` : '';
  return `${n} / ${c.requiredMissions} mission${c.requiredMissions > 1 ? 's' : ''} réussie${c.requiredMissions > 1 ? 's' : ''}${avg} (${gradeLetter(c.requiredAverage)} exigée)`;
}

/** Ce qu'il reste à faire pour terminer un chapitre. */
export function remainingLabel(c: CareerChapter, t: ChapterTally): string {
  const missing = c.requiredMissions - t.succeeded;
  if (missing > 0) return `Encore ${missing} mission${missing > 1 ? 's' : ''} à réussir pour terminer le ${chapterName(c)}.`;
  if (!t.met) {
    const avg = t.average !== null ? gradeLetter(t.average) : 'E';
    return `Moyenne insuffisante au ${chapterName(c)} : ${avg} obtenue, ${gradeLetter(c.requiredAverage)} exigée. Rejouez une mission pour améliorer votre note.`;
  }
  return `Exigence du ${chapterName(c)} remplie.`;
}

/** Sanction encourue pour un résultat (la plus lourde), ou null. */
export function sanctionFor(result: MissionResult, def: MissionDef, grade: CareerGrade, now: number): CareerSanction | null {
  const found: { kind: SanctionKind; reason: string }[] = [];
  if (!result.success) {
    const summary = typeof result.summary === 'string' ? result.summary : '';
    for (const f of def.failures) {
      if ((f.kind !== 'bavure_grave' && f.kind !== 'revocation') || !f.text || summary.indexOf(f.text) < 0) continue;
      found.push({ kind: f.kind === 'revocation' ? 'retrogradation' : 'blame', reason: f.text });
    }
  }
  // régularité de l'emploi de la force, telle que le compte rendu l'a chiffrée (« 42 / 100 »)
  const law = Array.isArray(result.lines) ? result.lines.find((l) => /^Régularité/.test(l.label)) : undefined;
  const lawScore = law ? parseFloat(String(law.value)) : NaN;
  if (Number.isFinite(lawScore) && lawScore < 50) {
    found.push({ kind: 'avertissement', reason: `Emploi de la force irrégulier (régularité ${Math.round(lawScore)} / 100).` });
  }
  if (!result.success && grade === 'E' && found.length === 0) {
    found.push({ kind: 'avertissement', reason: `Mission « ${def.title} » échouée, note E.` });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => SANCTION_WEIGHT[b.kind] - SANCTION_WEIGHT[a.kind]);
  return { at: now, kind: found[0]!.kind, reason: found[0]!.reason, missionId: def.id };
}

