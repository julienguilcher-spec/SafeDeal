/* =====================================================================================
 * MISSIONS — évaluation des objectifs.
 *
 * Chaque type d'objectif (ObjectiveKind) est mesuré sur l'état réel du jeu. Deux familles :
 *   - objectifs « à atteindre » : ils deviennent réussis dès que la mesure est atteinte (interpeller, éteindre,
 *     atteindre un lieu, tenir une position N secondes…) ;
 *   - objectifs « à préserver » : ils restent en cours et ne sont jugés qu'à la fin, sauf s'ils sont violés
 *     avant (zéro bavure, limiter les dégâts, ne pas être interpellé, protéger un site…).
 * Les objectifs « personnalisé » (texte libre) ne sont pas mesurables automatiquement : ils sont jugés à la
 * fin sur l'issue générale de la mission, et le compte rendu le dit.
 * Simulation pure.
 * ===================================================================================== */

import type { GameContext, Person, PlaceInfo } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import type { MissionObjective, ObjectiveKind } from '@/core/missions-schema';
import type { MissionTracker } from './tracker';

export type ObjState = 'actif' | 'reussi' | 'echoue';

export interface ObjectiveRun {
  def: MissionObjective;
  state: ObjState;
  /** Avancement 0..1 affiché au HUD. */
  progress: number;
  /** Temps cumulé (objectifs de durée). */
  held: number;
  /** Lieu résolu sur la carte (null si aucun ou inconnu). */
  at: PlaceInfo | null;
  /** Note pour le compte rendu (pourquoi réussi, pourquoi échoué, ou « non mesuré »). */
  note: string;
  /** Instant de la décision (s de mission). */
  decidedAt: number;
}

/** Objectifs jugés seulement à la fin (sauf violation). */
const PRESERVE: ReadonlySet<ObjectiveKind> = new Set<ObjectiveKind>([
  'proteger_site', 'zero_bavure', 'sommations_regulieres', 'limiter_blesses', 'limiter_degats', 'prevention',
  'rester_dans_cortege', 'ne_pas_etre_interpelle', 'survivre', 'personnalise',
]);

export function isPreserve(o: ObjectiveRun): boolean {
  if (o.def.kind === 'proteger_les_siens') return o.def.seconds === undefined;
  return PRESERVE.has(o.def.kind);
}

/** Ressources partagées pour une évaluation (évite d'allouer à chaque appel). */
export interface EvalEnv {
  ctx: GameContext;
  tracker: MissionTracker;
  /** Secondes écoulées depuis le début de la mission. */
  elapsed: number;
  dt: number;
  /** Point de départ de la mission (lieu par défaut d'un objectif). */
  homeX: number;
  homeZ: number;
  isCommander: boolean;
  scratch: Person[];
}

const NEAR_PLACE = 30;

function placeOf(o: ObjectiveRun, env: EvalEnv): { x: number; z: number; r: number } {
  if (o.at) return { x: o.at.x, z: o.at.z, r: Math.max(NEAR_PLACE, Math.min(80, o.at.radius)) };
  return { x: env.homeX, z: env.homeZ, r: NEAR_PLACE };
}

function succeed(o: ObjectiveRun, env: EvalEnv, note: string): void {
  if (o.state !== 'actif') return;
  o.state = 'reussi';
  o.progress = 1;
  o.note = note;
  o.decidedAt = env.elapsed;
}

function fail(o: ObjectiveRun, env: EvalEnv, note: string): void {
  if (o.state !== 'actif') return;
  o.state = 'echoue';
  o.note = note;
  o.decidedAt = env.elapsed;
}

function countReached(o: ObjectiveRun, env: EvalEnv, value: number, fallback: number, note: string): void {
  const want = Math.max(1, o.def.count ?? fallback);
  o.progress = Math.min(1, value / want);
  if (value >= want) succeed(o, env, note.replace('{n}', String(value)));
}

/** Mesure en cours de mission. Les objectifs déjà décidés ne bougent plus. */
export function evaluate(o: ObjectiveRun, env: EvalEnv): void {
  if (o.state !== 'actif') return;
  const { ctx, tracker } = env;
  const me = ctx.player.person();
  const d = ctx.director;
  switch (o.def.kind) {
    case 'tenir_position': {
      const p = placeOf(o, env);
      const n = ctx.people.countIn(p.x, p.z, p.r + 10, (q) => q.faction === 'police' && q.posture !== 'down');
      const mine = me ? Math.hypot(me.x - p.x, me.z - p.z) <= p.r + 10 : false;
      if (n >= 3 || mine) o.held += env.dt;
      const want = o.def.seconds ?? 300;
      o.progress = Math.min(1, o.held / want);
      if (o.held >= want) succeed(o, env, `Position tenue ${Math.round(o.held)} s.`);
      break;
    }
    case 'disperser':
      if (d.phase === 'apres_manif' || d.phase === 'terminee' || (d.stats.total > 0 && d.stats.present <= d.stats.total * 0.25)) {
        succeed(o, env, `Foule dispersée : ${d.stats.present} personnes encore présentes sur ${d.stats.total}.`);
      } else if (d.stats.total > 0) o.progress = Math.min(0.99, d.stats.dispersed / Math.max(1, d.stats.total * 0.75));
      break;
    case 'interpeller':
      countReached(o, env, tracker.lawfulArrests, 1, '{n} interpellation(s) fondée(s).');
      break;
    case 'eteindre':
      countReached(o, env, tracker.firesOut, 1, '{n} feu(x) éteint(s).');
      break;
    case 'secourir':
    case 'soigner':
      countReached(o, env, tracker.treated, 1, '{n} victime(s) prise(s) en charge.');
      break;
    case 'photographier':
    case 'filmer':
    case 'publier':
      countReached(o, env, tracker.shots, 3, '{n} prise(s) de vue.');
      break;
    case 'reperer_signaux': {
      const signals = ctx.service<{ list: readonly unknown[] }>('crowd.signals');
      countReached(o, env, signals ? signals.list.length : 0, 3, '{n} signe(s) avant-coureur(s) relevé(s).');
      break;
    }
    case 'guider_unite':
      countReached(o, env, tracker.playerOrders, 3, '{n} ordre(s) donné(s) aux unités.');
      break;
    case 'traiter_incidents': {
      const rec = ctx.service<{ stats(): { treated: number } }>('incidents.records');
      countReached(o, env, rec ? rec.stats().treated : 0, 3, '{n} incident(s) traité(s).');
      break;
    }
    case 'releve':
      countReached(o, env, tracker.reliefs, 1, 'Relève effectuée.');
      break;
    case 'couper_circulation': {
      const t = ctx.service<TrafficControlApi>(EXT.traffic);
      countReached(o, env, t ? t.closures.length : 0, 1, '{n} rue(s) fermée(s) à la circulation.');
      break;
    }
    case 'degager_barricade':
      countReached(o, env, tracker.barricadesCleared, 1, '{n} barricade(s) dégagée(s).');
      break;
    case 'atteindre':
    case 'escorter':
    case 'evacuer': {
      if (!me) break;
      const p = placeOf(o, env);
      const dist = Math.hypot(me.x - p.x, me.z - p.z);
      if (dist <= p.r) succeed(o, env, 'Lieu atteint.');
      break;
    }
    case 'duree': {
      const want = o.def.seconds ?? 600;
      o.progress = Math.min(1, env.elapsed / want);
      if (env.elapsed >= want) succeed(o, env, `Tenu ${Math.round(want / 60)} min.`);
      break;
    }
    case 'proteger_les_siens':
      if (tracker.ownHarmed > 0) fail(o, env, 'Un membre de votre groupe a été interpellé ou gravement blessé.');
      else if (o.def.seconds !== undefined) {
        o.held += env.dt;
        o.progress = Math.min(1, o.held / o.def.seconds);
        if (o.held >= o.def.seconds) succeed(o, env, 'Votre groupe est resté indemne.');
      }
      break;
    // ── à préserver : violations ──
    case 'zero_bavure': {
      const worst = env.isCommander ? tracker.anyWorstFault : tracker.playerWorstFault;
      if (worst >= 3) fail(o, env, 'Emploi de la force jugé fautif (voir le cadre légal).');
      break;
    }
    case 'sommations_regulieres':
      if (tracker.withoutWarning > 0) fail(o, env, 'Force employée sur un attroupement sans sommations.');
      break;
    case 'limiter_blesses': {
      const max = o.def.max ?? 10;
      if (d.stats.injured > max) fail(o, env, `${d.stats.injured} blessés (plafond : ${max}).`);
      break;
    }
    case 'limiter_degats': {
      const max = o.def.max ?? 5;
      const dmg = tracker.windows + tracker.fires;
      if (dmg > max) fail(o, env, `${tracker.windows} vitrine(s) brisée(s) et ${tracker.fires} feu(x) (plafond : ${max}).`);
      break;
    }
    case 'ne_pas_etre_interpelle':
      if (me && me.custody !== 'free') fail(o, env, 'Vous avez été interpellé.');
      break;
    case 'survivre':
      if (me && (me.injury === 'critical' || me.injury === 'dead')) fail(o, env, 'Vous êtes grièvement blessé.');
      break;
    case 'proteger_site': {
      const p = placeOf(o, env);
      const intruders = ctx.people.countIn(p.x, p.z, p.r, (q) => q.faction === 'protest' && (q.profile === 'radical' || q.profile === 'pilleur'));
      if (intruders >= Math.max(8, o.def.max ?? 8)) {
        o.held += env.dt;
        if (o.held >= 30) fail(o, env, `Site envahi : ${intruders} individus violents à l'intérieur du périmètre.`);
      } else o.held = Math.max(0, o.held - env.dt);
      break;
    }
    case 'rester_dans_cortege':
      if (me) {
        const n = ctx.people.countIn(me.x, me.z, 12, (q) => q.faction === 'protest' && q !== me);
        if (n >= 3) o.held += env.dt;
        o.progress = env.elapsed > 0 ? Math.min(1, o.held / Math.max(1, env.elapsed)) : 0;
      }
      break;
    case 'prevention':
    case 'personnalise':
      break;
    default:
      break;
  }
}

/** Jugement de fin pour les objectifs encore en cours. `failed` : la mission a échoué par ailleurs. */
export function conclude(o: ObjectiveRun, env: EvalEnv, failed: boolean): void {
  if (o.state !== 'actif') return;
  const t = env.tracker;
  switch (o.def.kind) {
    case 'zero_bavure':
    case 'sommations_regulieres':
    case 'limiter_blesses':
    case 'limiter_degats':
    case 'ne_pas_etre_interpelle':
    case 'survivre':
    case 'proteger_site':
      succeed(o, env, 'Respecté jusqu’à la fin.');
      break;
    case 'prevention':
      if (t.windows + t.fires <= 2) succeed(o, env, 'Peu de dégâts : la prévention a porté.');
      else fail(o, env, `${t.windows + t.fires} dégâts malgré la prévention.`);
      break;
    case 'rester_dans_cortege':
      if (o.progress >= 0.6) succeed(o, env, `Dans le cortège ${Math.round(o.progress * 100)} % du temps.`);
      else fail(o, env, `Dans le cortège seulement ${Math.round(o.progress * 100)} % du temps.`);
      break;
    case 'proteger_les_siens':
      succeed(o, env, 'Votre groupe est resté indemne.');
      break;
    case 'personnalise':
      if (failed) fail(o, env, 'Non mesuré automatiquement ; mission échouée.');
      else succeed(o, env, 'Non mesuré automatiquement ; jugé sur l’issue de la mission.');
      break;
    default: {
      const pct = Math.round(o.progress * 100);
      fail(o, env, pct > 0 ? `Atteint à ${pct} %.` : 'Non atteint.');
      break;
    }
  }
}
