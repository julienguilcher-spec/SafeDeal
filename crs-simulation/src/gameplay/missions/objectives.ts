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

import { concludeCustom, watchCustom } from './custom';
import type { EntityId, GameContext, Person, PlaceInfo } from '@/core/contracts';
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
  /** « Tenir la position » : temps cumulé où la position est submergée (ligne enfoncée). */
  broken?: number;
  /** « Soigner », « secourir » : victimes mises en scène pour cet objectif (atelier sans foule), seules comptées. */
  victims?: EntityId[];
}

/** Objectifs jugés seulement à la fin (sauf violation). */
const PRESERVE: ReadonlySet<ObjectiveKind> = new Set<ObjectiveKind>([
  'proteger_site', 'zero_bavure', 'sommations_regulieres', 'limiter_blesses', 'limiter_degats', 'prevention',
  'rester_dans_cortege', 'ne_pas_etre_interpelle', 'survivre', 'personnalise',
]);

export function isPreserve(o: ObjectiveRun): boolean {
  if (o.def.kind === 'proteger_les_siens') return o.def.seconds === undefined;
  if (o.def.kind === 'sommations_regulieres') return !pronounces(o);
  return PRESERVE.has(o.def.kind);
}

/**
 * « Prononcer l'annonce et les sommations » : objectif à atteindre (le joueur les prononce lui-même, une à une), et non
 * plus seulement la règle « pas de force sans sommations », qui était jugée réussie à la fin sans que rien ait été dit.
 */
export function pronounces(o: ObjectiveRun): boolean {
  return o.def.kind === 'sommations_regulieres' && /prononcer/i.test(o.def.text);
}

/**
 * « Obtenir un parcours négocié par la liaison » : atteint dès que l'équipe de liaison est mise au contact des
 * organisateurs (crowd.core.setLiaison) — la phase qui l'attend s'ouvre alors sans délai. Sans liaison, il reste une
 * prévention jugée à la fin sur les dégâts (l'interface n'offre pas encore partout l'ordre de liaison : il ne doit pas
 * devenir impossible).
 */
export function isLiaison(o: ObjectiveRun): boolean {
  return o.def.kind === 'prevention' && o.def.target === 'liaison';
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
  /**
   * Victimes mises en scène par le cadre de mission (le blessé à secourir, les douze victimes du mouvement de foule) :
   * elles sont la prémisse de la mission et ne comptent pas parmi les blessés reprochés au joueur.
   */
  staged?: ReadonlySet<EntityId>;
  /**
   * Blessés de la foule déjà comptés au début de la mission (journée de service : le cortège part pendant le trajet en
   * colonne depuis la caserne) : la mission ne juge que ce qui arrive après son début.
   */
  injuredAtStart?: number;
}

/** Blessés de la foule, hors victimes mises en scène par la mission. */
export function crowdInjured(env: EvalEnv): number {
  const n = Math.max(0, env.ctx.director.stats.injured - (env.injuredAtStart ?? 0));
  if (!env.staged || env.staged.size === 0) return n;
  let k = 0;
  for (const id of env.staged) {
    const p = env.ctx.people.get(id);
    if (p && p.faction === 'protest' && p.injury !== 'none') k++;
  }
  return Math.max(0, n - k);
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
      // ligne enfoncée : des individus violents occupent la position en nombre nettement supérieur aux agents qui la
      // tiennent, plus de 25 s (un cortège pacifique qui passe à côté ne compte pas)
      const violent = ctx.people.countIn(p.x, p.z, p.r, (q) => q.faction === 'protest' && q.custody === 'free' && q.posture !== 'down'
        && (q.profile === 'radical' || q.profile === 'pilleur'));
      if (violent >= Math.max(6, n * 2)) o.broken = (o.broken ?? 0) + env.dt;
      else o.broken = Math.max(0, (o.broken ?? 0) - env.dt * 0.5);
      if ((o.broken ?? 0) > 25) {
        fail(o, env, `Ligne enfoncée : ${violent} individus violents ont submergé la position, ${n} agents pour la tenir.`);
        break;
      }
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
      if (o.victims && o.victims.length > 0) {
        let n = 0;
        for (const id of o.victims) if (tracker.treatedIds.has(id)) n++;
        countReached(o, env, n, o.victims.length, '{n} victime(s) prise(s) en charge.');
      } else countReached(o, env, tracker.treated, 1, '{n} victime(s) prise(s) en charge.');
      break;
    case 'photographier':
    case 'filmer':
    case 'publier':
      countReached(o, env, tracker.shots, 3, '{n} prise(s) de vue.');
      break;
    case 'reperer_signaux': {
      // signes avant-coureurs des groupes radicaux, ou comptes rendus radio du joueur quand il y avait à signaler
      // (« Signaler le passant suspect à la radio » : une nuit calme n'a aucun signe de groupe radical)
      const signals = ctx.service<{ list: readonly unknown[] }>('crowd.signals');
      // un compte rendu ne vaut que pour un objectif de signalement (« Signaler… », « … par radio ») : pas pour
      // « Désigner trois cibles » ni « Localiser et marquer douze foyers », qui demandent de vraiment les repérer
      const n = Math.max(signals ? signals.list.length : 0, /signal|radio/i.test(o.def.text) ? tracker.playerReports : 0);
      countReached(o, env, n, 3, n > (signals ? signals.list.length : 0) ? '{n} fait(s) signalé(s) par radio.' : '{n} signe(s) avant-coureur(s) relevé(s).');
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
      else if (pronounces(o)) {
        // annonce (1), première (2), dernière sommation (3) prononcées par le joueur
        const want = Math.max(1, Math.min(3, o.def.count ?? 3));
        o.progress = Math.min(1, tracker.playerSommation / want);
        if (tracker.playerSommation >= want) succeed(o, env, want === 3 ? 'Annonce et sommations prononcées dans l’ordre.' : 'Sommation(s) prononcée(s).');
      }
      break;
    case 'limiter_blesses': {
      const max = o.def.max ?? 10;
      const injured = crowdInjured(env);
      if (injured > max) fail(o, env, `${injured} blessés (plafond : ${max}).`);
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
    case 'personnalise':
      // objectif dont le texte décrit une grandeur mesurable (voir custom.ts) : violations en cours de mission
      watchCustom(o, env, (note) => fail(o, env, note));
      break;
    case 'prevention':
      if (isLiaison(o) && tracker.liaison) succeed(o, env, 'Équipe de liaison au contact des organisateurs : parcours négocié.');
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
    case 'sommations_regulieres':
      if (pronounces(o)) {
        const n = Math.min(3, t.playerSommation);
        fail(o, env, n > 0 ? `Sommations incomplètes : ${n} formule(s) sur ${Math.max(1, Math.min(3, o.def.count ?? 3))}.` : 'Aucune sommation prononcée.');
      }
      else succeed(o, env, 'Respecté jusqu’à la fin.');
      break;
    case 'zero_bavure':
    case 'limiter_blesses':
    case 'limiter_degats':
    case 'ne_pas_etre_interpelle':
    case 'survivre':
    case 'proteger_site':
      succeed(o, env, 'Respecté jusqu’à la fin.');
      break;
    case 'prevention':
      if (isLiaison(o) && t.liaison) succeed(o, env, 'Équipe de liaison au contact des organisateurs : parcours négocié.');
      else if (t.windows + t.fires <= 2) succeed(o, env, 'Peu de dégâts : la prévention a porté.');
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
      if (concludeCustom(o, env, (note) => succeed(o, env, note), (note) => fail(o, env, note))) break;
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
