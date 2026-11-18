/* =====================================================================================
 * Carte de commandement — CHAÎNE LÉGALE : « Faire les étapes dans l'ordre » (S3).
 *
 * Le joueur choisit une ligne que la loi ne permet pas encore (🔒) ou qui part avant la dernière sommation (⚖) ; S3
 * lui liste les étapes (legalSteps) et il confirme UNE fois. La chaîne fait alors, dans l'ordre, ce qu'il aurait fait
 * à la main :
 *   ① les sommations, une par une, dès que la loi le permet (sommationWait() = 0) — par le joueur au mégaphone, ou
 *      par l'officier de la compagnie sur place (requestSommation, une étape par demande) ;
 *   ② l'autorisation du niveau de force (authorize) — ou, sans ce droit, la demande par radio : la chaîne s'arrête
 *      alors sur « En attente de l'autorisation… » ;
 *   ③ le délai laissé à la foule après la dernière sommation (forceWait() = 0) ;
 *   ④ l'ordre, une seule fois (issue).
 * Si une étape est refusée (pas d'insigne, pas d'officier…), la chaîne s'arrête et dit pourquoi en une ligne. Le droit,
 * ses niveaux et ses refus ne changent pas : seuls les clics sont automatisés. cancel() arrête tout.
 *
 * Séquenceur pur : tout passe par les dépendances injectées (LegalDeps) ; CommandCore les lie à la partie
 * (sendLine.ts, coreLegalDeps) et CommandSystem.update la fait avancer, carte fermée comprise.
 * ===================================================================================== */

import type { ForceLevel } from '@/core/contracts';
import type { CommandLevel } from './api';
import type { CardLine, LegalPlan, LegalStage, LegalStatus, LegalStep, Repere, WhoCandidate } from './cardTypes';
import { forceWord, verbOf } from './orders';
import type { OrderVerb } from './orders';

export type { LegalPlan, LegalStatus, LegalStep } from './cardTypes';

// ───────────────────────────── étapes (pur) ─────────────────────────────

/** Ce que la loi dit maintenant (roe et conseiller juridique). */
export interface LegalLawState {
  sommations: number;
  authorised: ForceLevel;
  underAttack: boolean;
  /** Riposte permise au lieu visé (violences récentes contre les forces de l'ordre). */
  riposte: boolean;
}

/** Ce que le joueur peut faire. */
export interface LegalScope {
  level: CommandLevel;
  canSommation: boolean;
  canAuthorize: boolean;
  /** Variante « salle de commandement » : les sommations sont faites par l'officier sur place. */
  salle: boolean;
  /** Un officier de la compagnie peut les faire sur ordre (police.command.requestSommation, compagnie engagée). */
  officer: boolean;
}

export interface LegalStepsResult {
  steps: LegalStep[];
  /** « Faire les étapes dans l'ordre » est possible. */
  chain: boolean;
  /** Pourquoi c'est impossible, en une ligne ('' sinon). */
  reason: string;
  /** Les sommations sont faites par l'officier de la compagnie. */
  viaOfficer: boolean;
  /** Niveau de force à autoriser (0 : rien à autoriser). */
  level: ForceLevel;
  /** Ligne ⚖ (permise, avant la dernière sommation) : l'avertissement de S3, '' sinon. */
  warning: string;
}

/** Avertissement d'un ordre de force donné avant la dernière sommation. */
export const BEFORE_LAST_WARNING = 'L’ordre part avant la dernière sommation\u00a0: vous en répondrez.';
/** Chef de groupe au-dessus de son plafond. */
export const ABOVE_CEILING = 'Au-dessus de votre plafond\u00a0: demandez plus de force par radio.';

const AUTHORIZE_STEP: readonly string[] = [
  'autoriser l’emploi de la force', 'autoriser les mains nues', 'autoriser le bâton et la gazeuse',
  'autoriser le gaz lacrymogène et le canon à eau', 'autoriser les grenades et les lanceurs de balles (LBD)', 'autoriser l’arme à feu',
];
const REQUEST_STEP: readonly string[] = [
  'demander l’autorisation d’employer la force (radio)', 'demander l’autorisation des mains nues (radio)',
  'demander l’autorisation du bâton et de la gazeuse (radio)', 'demander l’autorisation du gaz (radio)',
  'demander l’autorisation des grenades et des lanceurs de balles (LBD) (radio)', 'demander l’autorisation de l’arme à feu (radio)',
];
const WAITING_AUTH: readonly string[] = [
  'en attente de l’autorisation d’employer la force', 'en attente de l’autorisation des mains nues', 'en attente de l’autorisation du bâton et de la gazeuse',
  'en attente de l’autorisation du gaz', 'en attente de l’autorisation des grenades et des lanceurs de balles', 'en attente de l’autorisation de l’arme à feu',
];

function lvl(level: number): number {
  return Math.max(0, Math.min(5, Math.round(level)));
}

/** Refus du droit dû seulement au délai entre deux étapes (la chaîne attend, ce n'est pas un blocage). */
export function isDelayRefusal(text: string): boolean {
  return text.startsWith('Délai insuffisant');
}

/** Motif de refus des sommations en une ligne claire, avec ce qu'il faut faire. */
export function plainRefusal(text: string): string {
  if (text === '') return '';
  if (/insigne/i.test(text)) return 'Vous devez porter l’écharpe tricolore pour faire les sommations.';
  if (/^Seul le commandant|^Les sommations ne peuvent être prononcées/.test(text)) return 'Seul le commissaire ou l’officier ceint peut faire les sommations.';
  if (/pas en état/.test(text)) return 'L’autorité habilitée n’est pas en état de faire les sommations.';
  return text;
}

function sommationCount(n: number): string {
  return n >= 3 ? 'les 3 sommations' : n === 2 ? 'les 2 sommations restantes' : 'la dernière sommation';
}

function sommationTime(n: number): string {
  return n >= 3 ? '~1\u00a0min\u00a030' : n === 2 ? '~1\u00a0min' : '~30\u00a0s';
}

/**
 * Étapes de S3 pour un ordre (`verb` null : les sommations seules), avec les vérifications préalables : qui fait les
 * sommations (vous, l'officier sur place) ou pourquoi personne ne le peut ; autoriser ou demander la force ; le plafond
 * d'un chef de groupe. `refusal` : law.advisor.sommationRefusal(joueur) ('' : il peut). `what` : la fin de l'étape de
 * l'ordre (« la section MISTRAL 2 lance le gaz ici »).
 */
export function legalSteps(
  verb: Pick<OrderVerb, 'force' | 'coercive'> | null, law: LegalLawState, scope: LegalScope, refusal: string, what = '',
): LegalStepsResult {
  const steps: LegalStep[] = [];
  let chain = true;
  let reason = '';
  let viaOfficer = false;
  let level: ForceLevel = 0;
  const needSom = (verb ? verb.coercive && !law.riposte : true) && law.sommations < 3;
  const needForce = !!verb && verb.force > law.authorised && !law.underAttack;
  if (needSom) {
    const n = 3 - Math.max(0, law.sommations);
    const playerCan = !scope.salle && scope.canSommation && (refusal === '' || isDelayRefusal(refusal));
    if (playerCan) {
      steps.push({ kind: 'sommations', label: `${sommationCount(n)}, par vous au mégaphone (${sommationTime(n)})` });
    } else if (scope.officer) {
      viaOfficer = true;
      steps.push({ kind: 'sommations', label: `${sommationCount(n)}, par l’officier de la compagnie sur place` });
    } else {
      chain = false;
      reason = plainRefusal(refusal) || (scope.salle
        ? 'Aucun officier de la compagnie ne peut faire les sommations\u00a0: pas de compagnie engagée.'
        : 'Seul le commissaire ou l’officier ceint peut faire les sommations.');
      steps.push({ kind: 'sommations', label: sommationCount(n) });
    }
  }
  if (needForce && verb) {
    level = verb.force;
    if (scope.canAuthorize) steps.push({ kind: 'authorize', label: AUTHORIZE_STEP[lvl(level)]! });
    else if (scope.level === 'unite') {
      steps.push({ kind: 'request', label: 'Demander plus de force' });
      if (chain) reason = ABOVE_CEILING;
      chain = false;
    } else steps.push({ kind: 'request', label: REQUEST_STEP[lvl(level)]! });
  }
  if (verb) steps.push({ kind: 'issue', label: `puis ${what !== '' ? what : 'l’ordre part'}` });
  const warning = verb && verb.coercive && !needForce && law.sommations < 3 && !law.riposte ? BEFORE_LAST_WARNING : '';
  if (scope.level === 'lecture') {
    chain = false;
    reason = 'Lecture seule\u00a0: vous ne donnez pas d’ordre.';
  }
  return { steps, chain, reason, viaOfficer, level, warning };
}

/** Nom court de ce que fait la chaîne (« Dispersion au gaz »), d'après la ligne. */
export function chainNoun(line: CardLine): string {
  const a = line.action;
  if (a.kind === 'sommation') return a.all ? 'Sommations' : 'Sommation';
  if (a.kind !== 'verb') return line.label;
  switch (a.type) {
    case 'disperser_gaz': return 'Dispersion au gaz';
    case 'charge': return 'Charge';
    case 'refoulement': return 'Refoulement';
    case 'bond_offensif': return 'Bond en avant';
    case 'encercler': return 'Encerclement';
    default: return line.label;
  }
}

/** Plan confirmé en S3 : la ligne, Qui, le lieu, les étapes. Titre : « Dispersion au gaz — Tête de cortège ». */
export function legalPlan(line: CardLine, who: WhoCandidate | null, where: Repere, r: LegalStepsResult): LegalPlan {
  const place = where.name.split(' — ')[0]!.trim();
  return {
    line, who, where, steps: r.steps.slice(), level: r.level, viaOfficer: r.viaOfficer,
    title: place !== '' ? `${chainNoun(line)} — ${place}` : chainNoun(line),
  };
}

// ───────────────────────────── séquenceur ─────────────────────────────

/** Ce que la chaîne demande à la partie (CommandCore les lie : sendLine.ts, coreLegalDeps). */
export interface LegalDeps {
  /** Le joueur prononce la sommation suivante ; true si l'étape a avancé. */
  sommation(plan: LegalPlan): boolean;
  /** L'officier de la compagnie est envoyé prononcer la sommation suivante ; false s'il n'y en a pas. */
  requestSommation(plan: LegalPlan): boolean;
  /** Secondes avant que l'étape suivante soit permise (0 : maintenant). */
  sommationWait(): number;
  /** Sommations faites (0..3). */
  sommationsDone(): number;
  /** Motif de refus de la sommation suivante par le joueur ('' s'il peut). */
  sommationRefusal(): string;
  /** Autorise ce niveau de force ; false si le joueur n'en a pas le droit. */
  authorize(level: ForceLevel): boolean;
  /** Niveau de force autorisé. */
  authorised(): number;
  /** Demande l'autorisation par radio (sans le droit d'autoriser). */
  requestForce(level: ForceLevel): void;
  /** Secondes avant que la force soit permise après la dernière sommation (Infinity : sommations à faire). */
  forceWait(): number;
  /** Donne l'ordre de la ligne. */
  issue(plan: LegalPlan): { ok: boolean; reason: string };
}

/** Un officier qui ne prononce pas la sommation demandée dans ce délai (s) : la chaîne s'arrête. */
export const OFFICER_TIMEOUT = 150;
/** Attente maximale du délai laissé à la foule (s). */
export const FORCE_WAIT_MAX = 600;
/** Durée (s) pendant laquelle l'état final reste lisible (ordre donné, annulé, arrêté). */
const HOLD_DONE = 6;
const HOLD_CANCEL = 4;
const HOLD_REFUSAL = 20;
const HOLD_WAITING_AUTH = 120;

export class LegalChain {
  private plan: LegalPlan | null = null;
  private stage: LegalStage = 'fini';
  private running = false;
  private now = 0;
  private stageAt = 0;
  private endedAt = -Infinity;
  private hold = 0;
  private reason = '';
  /** Sommation demandée à l'officier : nombre de sommations faites au moment de la demande (−1 : aucune demande). */
  private asked = -1;
  private askedAt = 0;
  private waitingAuth = false;
  private finished = false;

  constructor(private readonly deps: LegalDeps) {}

  /** Lance la chaîne (une chaîne en cours est remplacée). */
  start(plan: LegalPlan): void {
    this.plan = plan;
    this.running = true;
    this.stage = 'sommation';
    this.stageAt = this.now;
    this.reason = '';
    this.asked = -1;
    this.waitingAuth = false;
    this.finished = false;
    this.endedAt = -Infinity;
  }

  /** Une chaîne est en cours (les étapes avancent). */
  active(): boolean {
    return this.running;
  }

  /** Plan en cours ou dernier plan (null s'il n'y en a jamais eu). */
  current(): LegalPlan | null {
    return this.plan;
  }

  cancel(): void {
    if (!this.plan || !this.running) return;
    this.running = false;
    this.stage = 'annule';
    this.end(HOLD_CANCEL);
  }

  /** Oublie tout (nouvelle session). */
  reset(): void {
    this.plan = null;
    this.running = false;
    this.stage = 'fini';
    this.endedAt = -Infinity;
    this.now = 0;
  }

  private end(hold: number): void {
    this.endedAt = this.now;
    this.hold = hold;
  }

  private fail(reason: string): void {
    this.running = false;
    this.stage = 'refus';
    this.reason = reason;
    this.end(HOLD_REFUSAL);
  }

  private finish(): void {
    this.running = false;
    this.stage = 'fini';
    this.finished = true;
    this.end(HOLD_DONE);
  }

  private has(kind: LegalStep['kind']): boolean {
    return !!this.plan && this.plan.steps.some((s) => s.kind === kind);
  }

  private verb(): OrderVerb | null {
    const a = this.plan?.line.action;
    return a && a.kind === 'verb' ? verbOf(a.type) ?? null : null;
  }

  /** Fait avancer la chaîne (temps de session, s). Appelé à chaque pas de simulation. */
  tick(now: number): void {
    this.now = now;
    if (!this.running || !this.plan) return;
    const plan = this.plan;
    const d = this.deps;
    for (let guard = 0; guard < 6 && this.running; guard++) {
      switch (this.stage) {
        case 'sommation': {
          if (!this.has('sommations')) {
            this.stage = 'autorisation';
            continue;
          }
          const done = d.sommationsDone();
          if (done >= 3) {
            this.asked = -1;
            this.stage = 'autorisation';
            this.stageAt = now;
            continue;
          }
          if (plan.viaOfficer && this.asked >= 0) {
            // l'officier se porte à portée de mégaphone : on attend qu'il ait prononcé l'étape demandée
            if (done > this.asked) {
              this.asked = -1;
              continue;
            }
            if (now - this.askedAt > OFFICER_TIMEOUT) {
              this.fail('L’officier n’a pas pu faire la sommation\u00a0: faites-la vous-même ou réessayez (L).');
            }
            return;
          }
          if (d.sommationWait() > 0) return;
          if (plan.viaOfficer) {
            if (!d.requestSommation(plan)) {
              this.fail('Aucun officier habilité ne peut faire les sommations sur place.');
              return;
            }
            this.asked = done;
            this.askedAt = now;
            return;
          }
          const refusal = d.sommationRefusal();
          if (refusal !== '' && isDelayRefusal(refusal)) return;
          if (refusal !== '') {
            this.fail(plainRefusal(refusal));
            return;
          }
          if (!d.sommation(plan)) this.fail(plainRefusal(d.sommationRefusal()) || 'Sommation refusée.');
          // une étape par pas : la suivante attend son délai
          return;
        }
        case 'autorisation': {
          if (plan.level > 0 && d.authorised() < plan.level) {
            if (this.has('authorize')) {
              // la loi enregistre le niveau ordonné mais ne le rend effectif qu'après le délai laissé à la foule
              // (authorised() le montre alors) : l'attente qui suit s'en charge
              if (!d.authorize(plan.level as ForceLevel)) {
                this.fail(`Vous ne pouvez pas autoriser ${forceWord(plan.level)}.`);
                return;
              }
            } else if (this.has('request')) {
              d.requestForce(plan.level as ForceLevel);
              this.running = false;
              this.waitingAuth = true;
              this.end(HOLD_WAITING_AUTH);
              return;
            } else {
              this.fail(`La force «\u00a0${forceWord(plan.level)}\u00a0» n’est pas autorisée.`);
              return;
            }
          }
          if (!this.has('issue')) {
            this.finish();
            return;
          }
          this.stage = 'attente';
          this.stageAt = now;
          continue;
        }
        case 'attente': {
          const v = this.verb();
          const done = d.sommationsDone();
          if (v && v.coercive && this.has('sommations') && done < 3) {
            // la série a été reprise (changement de compartiment de terrain) : on refait les sommations
            this.stage = 'sommation';
            continue;
          }
          if (v && v.coercive && done >= 3) {
            const fw = d.forceWait();
            if (fw > 0 && Number.isFinite(fw)) {
              if (now - this.stageAt > FORCE_WAIT_MAX) this.fail('Le délai laissé à la foule ne finit pas\u00a0: ordre abandonné.');
              return;
            }
          }
          // niveau autorisé pas encore en vigueur (la loi le publie au pas suivant le délai) : on l'attend
          if (plan.level > 0 && this.has('authorize') && d.authorised() < plan.level) {
            if (now - this.stageAt > FORCE_WAIT_MAX) {
              this.fail(`La loi ne permet pas encore ${forceWord(plan.level)} ici\u00a0: ordre abandonné.`);
            }
            return;
          }
          this.stage = 'ordre';
          continue;
        }
        case 'ordre': {
          const r = d.issue(plan);
          if (!r.ok) this.fail(r.reason || 'L’ordre n’a pas pu partir.');
          else this.finish();
          return;
        }
        default:
          return;
      }
    }
  }

  /** État à montrer (« Mes unités », pastille légale), null s'il n'y a rien (ou plus rien) à montrer. */
  status(): LegalStatus | null {
    const plan = this.plan;
    if (!plan) return null;
    if (!this.running && this.now - this.endedAt > this.hold) return null;
    const d = this.deps;
    const noun = plan.title.split(' — ')[0]!;
    const done = Math.max(0, Math.min(3, d.sommationsDone()));
    let nextIn = 0;
    let text: string;
    switch (this.stage) {
      case 'sommation': {
        nextIn = Math.max(0, d.sommationWait());
        const k = Math.min(3, done + 1);
        if (plan.viaOfficer && this.asked >= 0) text = `${noun} — sommation ${k} sur 3\u00a0: l’officier se porte à portée de mégaphone`;
        else if (nextIn > 0) text = `${noun} — sommation ${k} sur 3 dans ${Math.ceil(nextIn)}\u00a0s`;
        else text = `${noun} — sommation ${k} sur 3`;
        break;
      }
      case 'autorisation':
        text = this.waitingAuth ? `${noun} — ${WAITING_AUTH[lvl(plan.level)]}` : `${noun} — autorisation\u00a0: ${forceWord(plan.level)}`;
        break;
      case 'attente': {
        const fw = d.forceWait();
        nextIn = Number.isFinite(fw) ? Math.max(0, fw) : 0;
        text = nextIn > 0 ? `${noun} — la force sera permise dans ${Math.ceil(nextIn)}\u00a0s` : `${noun} — l’ordre part`;
        break;
      }
      case 'ordre':
        text = `${noun} — l’ordre part`;
        break;
      case 'fini':
        text = this.has('issue') ? `${noun} — ordre donné` : 'Sommations faites';
        break;
      case 'refus':
        text = `${noun} — arrêté\u00a0: ${this.reason}`;
        break;
      case 'annule':
        text = `${noun} — annulé`;
        break;
      default:
        text = noun;
    }
    return {
      stage: this.stage, sommation: done, nextIn, text, reason: this.stage === 'refus' ? this.reason : '', title: plan.title,
    };
  }

  /** La dernière chaîne est allée jusqu'au bout (ordre donné ou sommations faites). */
  succeeded(): boolean {
    return this.finished;
  }
}
