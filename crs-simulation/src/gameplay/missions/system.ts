/* =====================================================================================
 * MISSIONS — cadre de mission : déroulé, objectifs, échecs, fin et compte rendu.
 *
 * Service 'missions' (lu par la page d'accueil et le compte rendu, voir src/ui/screens/services.ts) :
 *   catalog   entrées du catalogue au format attendu par l'accueil (id, titre, rôles, type, difficulté,
 *             résumé, lieu, config) — `config` est calculé à la lecture pour résoudre lieux et parcours ;
 *   current   mission en cours (MissionDef) ou null ; phase, objectifs ;
 *   result    compte rendu de la dernière mission terminée (titre, réussite, note, mention, lignes).
 *
 * Déroulé : quand une session démarre avec config.missionId, la mission commence au premier pas de jeu.
 * Chaque phase s'ouvre par un bandeau et ses messages radio ; elle se clôt sur son déclencheur (temps
 * écoulé depuis le début, phase de la foule, seuil de tension, objectif atteint). Un déclencheur
 * « objectif » qui n'arrive pas est levé au bout de PHASE_TIMEOUT secondes, pour ne jamais bloquer.
 * La mission se termine sur échec, ou dans sa dernière phase quand la manifestation est finie, que le
 * temps est écoulé, ou que tous les objectifs à atteindre le sont. Simulation pure.
 * ===================================================================================== */

import type { GameContext, GameSystem, Person } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Objective, ObjectivesApi } from '@/core/extensions';
import type { MissionDef, MissionPhase } from '@/core/missions-schema';
import { sessionDurationSeconds } from '@/core/session';
import { MISSIONS, missionById } from './catalog';
import { missionConfig } from './config';
import { conclude, evaluate, isPreserve } from './objectives';
import { PhaseAleas } from './aleas';
import type { EvalEnv, ObjectiveRun } from './objectives';
import { MissionTracker } from './tracker';

/** Délai maximal d'une phase qui attend un objectif (s). */
export const PHASE_TIMEOUT = 300;
/** Durée minimale de la dernière phase avant une fin anticipée par objectifs atteints (s). */
const LAST_PHASE_MIN = 45;
/** Attente maximale de l'arrivée sur place avant de lancer la mission quand même (s). */
const TRAVEL_MAX = 900;

export interface MissionResultLine {
  label: string;
  value: string | number;
  delta?: number;
  note?: string;
}

export interface MissionResult {
  id: string;
  title: string;
  success: boolean;
  score: number;
  grade: string;
  summary: string;
  lines: MissionResultLine[];
}

export interface MissionsApi {
  readonly catalog: readonly unknown[];
  readonly current: MissionDef | null;
  readonly phaseIndex: number;
  readonly objectives: readonly ObjectiveRun[];
  readonly result: MissionResult | null;
  /** Termine la mission en cours tout de suite (abandon : jugée sur l'état présent). */
  finish(): void;
}

function catalogEntry(def: MissionDef, sys: MissionSystem): Record<string, unknown> {
  const roles = [def.role, ...def.altRoles];
  const entry: Record<string, unknown> = {
    id: def.id,
    title: def.title,
    roles,
    type: def.type,
    difficulty: def.difficulty,
    summary: def.pitch,
    place: def.place,
  };
  Object.defineProperty(entry, 'config', { enumerable: true, get: () => missionConfig(def, sys.world()) });
  return entry;
}

function gradeOf(score: number): string {
  if (score >= 85) return 'A — Très bien';
  if (score >= 70) return 'B — Bien';
  if (score >= 55) return 'C — Assez bien';
  if (score >= 40) return 'D — Insuffisant';
  return 'E — Très insuffisant';
}

export class MissionSystem implements GameSystem {
  /** Aléas imposés par les phases de la mission. */
  private readonly aleas = new PhaseAleas();
  /** Début de l'attente de l'arrivée sur place (journée de service), -1 sinon. */
  private waitSince = -1;
  readonly id = 'missions';
  readonly order = SystemOrder.RULES + 60;

  private ctx: GameContext | null = null;
  private tracker: MissionTracker | null = null;
  private def: MissionDef | null = null;
  private pending = false;
  private started = false;
  private ended = false;
  private t0 = 0;
  private phaseIdx = -1;
  private phaseAt = 0;
  private runs: ObjectiveRun[] = [];
  private failure = '';
  private result_: MissionResult | null = null;
  private env: EvalEnv | null = null;
  private readonly catalog_: Record<string, unknown>[];

  constructor() {
    this.catalog_ = MISSIONS.map((m) => catalogEntry(m, this));
  }

  world(): GameContext['world'] | null {
    return this.ctx ? this.ctx.world : null;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.tracker = new MissionTracker(ctx);
    const self = this;
    const api: MissionsApi = {
      get catalog() { return self.catalog_; },
      get current() { return self.def; },
      get phaseIndex() { return self.phaseIdx; },
      get objectives() { return self.runs; },
      get result() { return self.result_; },
      finish: () => self.end('abandon'),
    };
    ctx.provide<MissionsApi>('missions', api);
  }

  init(ctx: GameContext): void {
    ctx.events.on('session:started', (e) => {
      const id = e.config.missionId;
      this.clear();
      const def = id ? missionById(id) : undefined;
      if (def) {
        this.def = def;
        this.pending = true;
      }
    });
    ctx.events.on('session:ended', () => {
      if (this.started && !this.ended) this.end('abandon', false);
      this.tracker?.stop();
    });
  }

  reset(): void {
    this.clear();
  }

  private clear(): void {
    this.aleas.reset();
    this.waitSince = -1;
    this.tracker?.reset();
    this.def = null;
    this.pending = false;
    this.started = false;
    this.ended = false;
    this.phaseIdx = -1;
    this.runs = [];
    this.failure = '';
    this.env = null;
  }

  private begin(): void {
    const ctx = this.ctx!;
    const def = this.def!;
    this.pending = false;
    this.started = true;
    this.t0 = ctx.clock.now;
    this.result_ = null;
    this.tracker!.start();
    const me = ctx.player.person();
    const home = ctx.world.placeByName(def.place);
    this.env = {
      ctx,
      tracker: this.tracker!,
      elapsed: 0,
      dt: 0,
      homeX: home ? home.x : me ? me.x : 0,
      homeZ: home ? home.z : me ? me.z : 0,
      isCommander: def.role === 'commandant' || def.role === 'chef_groupe',
      scratch: [] as Person[],
    };
    this.runs = def.objectives.map((o) => ({
      def: o,
      state: 'actif' as const,
      progress: 0,
      held: 0,
      at: o.place ? ctx.world.placeByName(o.place) : null,
      note: '',
      decidedAt: -1,
    }));
    this.publishObjectives();
    ctx.ui.banner(def.title, def.pitch, 6);
    this.enterPhase(0);
  }

  private phase(): MissionPhase | null {
    const def = this.def;
    return def && this.phaseIdx >= 0 && this.phaseIdx < def.phases.length ? def.phases[this.phaseIdx]! : null;
  }

  private enterPhase(i: number): void {
    const ctx = this.ctx!;
    const def = this.def!;
    this.phaseIdx = i;
    this.phaseAt = ctx.clock.now;
    const ph = def.phases[i];
    if (!ph) return;
    ctx.ui.banner(ph.title, ph.text, 7);
    // aléas imposés par la phase : joués au fil de la phase (voir aleas.ts)
    this.aleas.schedule(ph.events, ctx.clock.now);
    for (const line of ph.radio) {
      // indicatif en capitales = procédure radio ; sinon voix (rue, rédaction, ami) sur le canal public
      const radio = /^[A-ZÀ-ÖØ-Þ0-9 '\-]+$/.test(line.from) && line.from !== 'VOUS';
      ctx.radio.say({ channel: radio ? 'commandement' : 'public', from: line.from, text: line.text, priority: 1 });
    }
  }

  private elapsed(): number {
    return this.ctx ? this.ctx.clock.now - this.t0 : 0;
  }

  /** Déclencheur de fin de la phase courante atteint ? */
  private phaseDone(ph: MissionPhase): boolean {
    const ctx = this.ctx!;
    const u = ph.until;
    const inPhase = ctx.clock.now - this.phaseAt;
    switch (u.kind) {
      case 'temps':
        return this.elapsed() >= u.seconds;
      case 'phase_foule':
        return this.tracker!.crowdPhases.has(u.phase) || ctx.director.phase === u.phase || inPhase >= PHASE_TIMEOUT;
      case 'tension':
        return ctx.director.tension >= u.above || inPhase >= PHASE_TIMEOUT;
      case 'objectif': {
        const run = this.runs.find((r) => r.def.id === u.id);
        return !run || run.state !== 'actif' || inPhase >= PHASE_TIMEOUT;
      }
      case 'fin':
        return false;
      default:
        return false;
    }
  }

  update(dt: number): void {
    if (!this.def || this.ended) return;
    const ctx = this.ctx!;
    if (this.pending) {
      if (!ctx.player.person()) return;
      // journée de service : la mission commence à l'arrivée sur place, pas pendant la prise de service et le
      // trajet en colonne depuis la caserne (filet : TRAVEL_MAX)
      const j = ctx.service<{ stage: string }>('session.journee');
      if (j && (j.stage === 'prise_de_service' || j.stage === 'embarquement' || j.stage === 'route')) {
        if (this.waitSince < 0) this.waitSince = ctx.clock.now;
        if (ctx.clock.now - this.waitSince < TRAVEL_MAX) return;
      }
      this.begin();
    }
    if (!this.started) return;
    this.aleas.update(ctx);
    const env = this.env!;
    env.elapsed = this.elapsed();
    env.dt = dt;
    let changed = false;
    for (const r of this.runs) {
      const before = r.state;
      const p = r.progress;
      evaluate(r, env);
      if (r.state !== before || Math.abs(r.progress - p) > 0.02) changed = true;
      if (r.state !== before) {
        if (r.state === 'reussi') ctx.ui.notify('Objectif atteint : ' + r.def.text, 'ok', 5);
        else if (r.state === 'echoue') ctx.ui.notify('Objectif manqué : ' + r.def.text + (r.note ? ' — ' + r.note : ''), 'warn', 7);
      }
    }
    if (changed) this.publishObjectives();
    // échecs
    const why = this.checkFailures();
    if (why) {
      this.failure = why;
      this.end('echec');
      return;
    }
    // phases
    const ph = this.phase();
    if (ph && this.phaseIdx < this.def.phases.length - 1 && this.phaseDone(ph)) this.enterPhase(this.phaseIdx + 1);
    // fin
    if (this.phaseIdx === this.def.phases.length - 1 && this.canEnd()) this.end('fin');
  }

  private canEnd(): boolean {
    const ctx = this.ctx!;
    const def = this.def!;
    const elapsed = this.elapsed();
    if (ctx.director.phase === 'terminee' && def.crowd.size > 0) return true;
    if (elapsed >= sessionDurationSeconds(def.duration)) return true;
    if (ctx.clock.now - this.phaseAt < LAST_PHASE_MIN) return false;
    // tous les objectifs principaux « à atteindre » le sont
    let reachable = 0;
    for (const r of this.runs) {
      if (r.def.secondary || isPreserve(r)) continue;
      reachable++;
      if (r.state !== 'reussi') return false;
    }
    return reachable > 0;
  }

  private checkFailures(): string {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const t = this.tracker!;
    for (const f of this.def!.failures) {
      switch (f.kind) {
        case 'joueur_hors_combat':
          if (me && (me.injury === 'critical' || me.injury === 'dead')) return f.text;
          break;
        case 'bavure_grave':
        case 'revocation': {
          const worst = this.env!.isCommander ? t.anyWorstFault : t.playerWorstFault;
          if (worst >= (f.kind === 'revocation' ? 5 : 4)) return f.text;
          break;
        }
        case 'trop_de_blesses':
          if (ctx.director.stats.injured > (f.value ?? 20)) return f.text;
          break;
        case 'interpelle':
          if (me && me.custody !== 'free') return f.text;
          break;
        case 'site_envahi':
          if (this.runs.some((r) => r.def.kind === 'proteger_site' && r.state === 'echoue')) return f.text;
          break;
        case 'victime_non_secourue': {
          const rec = ctx.service<{ stats(): { deaths: number } }>('incidents.records');
          if (rec && rec.stats().deaths > 0) return f.text;
          break;
        }
        case 'temps':
          if (f.value !== undefined && this.elapsed() > f.value && this.runs.some((r) => !r.def.secondary && !isPreserve(r) && r.state === 'actif')) return f.text;
          break;
        default:
          // « ligne enfoncée » et conditions personnalisées : non mesurées automatiquement
          break;
      }
    }
    return '';
  }

  private publishObjectives(): void {
    const api = this.ctx?.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    const list: Objective[] = this.runs.map((r) => {
      const o: Objective = { id: r.def.id, text: r.def.text, state: r.state, secondary: r.def.secondary };
      if (r.at) {
        o.x = r.at.x;
        o.z = r.at.z;
      }
      if (r.progress > 0 && r.progress < 1) o.progress = r.progress;
      return o;
    });
    api.set(list);
  }

  /** Fin de mission : jugement, compte rendu, passage à l'écran de compte rendu. */
  private end(reason: 'fin' | 'echec' | 'abandon', toDebrief = true): void {
    if (!this.def || this.ended || !this.started) return;
    const ctx = this.ctx!;
    this.ended = true;
    const env = this.env!;
    env.elapsed = this.elapsed();
    const failed = reason === 'echec';
    for (const r of this.runs) conclude(r, env, failed || reason === 'abandon');
    this.publishObjectives();
    this.result_ = this.buildResult(reason);
    ctx.events.emitAny('mission:finished', this.result_);
    this.tracker!.stop();
    if (toDebrief && ctx.session.phase === 'playing') ctx.session.end(true);
  }

  private buildResult(reason: 'fin' | 'echec' | 'abandon'): MissionResult {
    const ctx = this.ctx!;
    const def = this.def!;
    const lines: MissionResultLine[] = [];
    const prim = this.runs.filter((r) => !r.def.secondary);
    const sec = this.runs.filter((r) => r.def.secondary);
    const primOk = prim.filter((r) => r.state === 'reussi').length;
    const secOk = sec.filter((r) => r.state === 'reussi').length;
    for (const r of this.runs) {
      const pts = r.state === 'reussi' ? (r.def.secondary ? 5 : 15) : r.def.secondary ? 0 : -10;
      lines.push({ label: (r.def.secondary ? 'Secondaire — ' : 'Objectif — ') + r.def.text, value: r.state === 'reussi' ? 'Réussi' : 'Manqué', delta: pts, note: r.note });
    }
    const law = ctx.service<{ score: number; summary(byId?: number): string }>('law.records');
    const inc = ctx.service<{ stats(): { score: number; treated: number; total: number } }>('incidents.records');
    const lawScore = law ? law.score : 100;
    const incStats = inc ? inc.stats() : null;
    const incScore = incStats && incStats.total > 0 ? incStats.score : 100;
    lines.push({ label: 'Régularité de l’emploi de la force', value: Math.round(lawScore) + ' / 100', note: law ? law.summary() : '' });
    if (incStats && incStats.total > 0) lines.push({ label: 'Incidents traités', value: `${incStats.treated} sur ${incStats.total}`, note: 'Note de prise en charge : ' + Math.round(incScore) + ' / 100' });
    const d = ctx.director.stats;
    if (d.total > 0) lines.push({ label: 'Manifestation', value: `${d.total} manifestants`, note: `${d.injured} blessé(s), ${d.arrested} interpellé(s), ${d.dispersed} dispersé(s)` });
    const primPart = prim.length > 0 ? primOk / prim.length : 1;
    const secPart = sec.length > 0 ? secOk / sec.length : 1;
    let score = 60 * primPart + 15 * secPart + 15 * (lawScore / 100) + 10 * (incScore / 100);
    if (reason === 'echec') score = Math.min(score, 35);
    if (reason === 'abandon') score = Math.min(score, 50);
    score = Math.round(Math.max(0, Math.min(100, score)));
    const success = reason === 'fin' && prim.every((r) => r.state === 'reussi');
    const minutes = Math.max(1, Math.round(this.elapsed() / 60));
    const summary = reason === 'echec'
      ? `Mission échouée au bout de ${minutes} min : ${this.failure}`
      : reason === 'abandon'
        ? `Mission interrompue au bout de ${minutes} min. ${primOk} objectif(s) principal(aux) sur ${prim.length} atteint(s).`
        : success
          ? `Mission accomplie en ${minutes} min : ${primOk} objectif(s) principal(aux) sur ${prim.length}, ${secOk} secondaire(s) sur ${sec.length}.`
          : `Mission terminée en ${minutes} min, objectifs incomplets : ${primOk} principal(aux) sur ${prim.length}.`;
    return { id: def.id, title: def.title, success, score, grade: gradeOf(score), summary, lines };
  }
}
