/* =====================================================================================
 * Carte de commandement — « CADRE LÉGAL » (touche L, ou la pastille ⚖ du bandeau) : ce que la loi permet maintenant,
 * ce que le joueur autorise, et les gestes du droit (§7.1) :
 *   1 « Faire les sommations » (les trois à la suite : la chaîne légale, onChain) ;
 *   2 « Faire la sommation suivante seulement : l'annonce » ;
 *   3–6 « Autoriser : mains nues seulement », « … bâton et gazeuse », « … gaz lacrymogène et canon à eau »,
 *       « … grenades et lanceurs de balles (LBD) ».
 * Variantes : « salle de commandement » (« Faire faire les sommations par l'officier sur place ») ; chef de groupe
 * (« Mes ordres jusqu'à : … » puis « Demander plus de force (radio) ») ; sans autorité (« Réservé au commissaire ou à
 * l'officier ceint »). Les niveaux de force sont toujours dits en mots (forceWord), jamais en chiffres.
 * Les gestes sont les mêmes appels qu'avant (law.sommation, police.command.requestSommation, core.authorize, demande
 * radio), regroupés dans les fonctions exportées doSommation, authorizeLevel, setCeiling, requestForce.
 * La vue (legalView) est pure et testée sans DOM.
 * ===================================================================================== */

import type { ForceLevel } from '@/core/contracts';
import type { IconName } from '../core/icons';
import { iconMarkup } from '../core/icons';
import { el, setClass, setText } from '../maps/icons';
import type { CommandLevel } from './api';
import type { LegalStatus } from './cardTypes';
import type { CommandCore } from './core';
import { plainLine } from './intents';
import { authorizeWord, forceWord } from './orders';
import { forceRequest } from './phrases';
import { cardEnvFromCore, crowdRepere, mainCrowd } from './reperes';
import { legalCheck } from './sendLine';

// ───────────────────────────── vue (pure) ─────────────────────────────

/** Chaîne légale vue par les panneaux : son état, et si elle avance encore. */
export interface ChainView {
  status: LegalStatus;
  active: boolean;
}

/** Chaîne légale du noyau (legalChain.ts) telle que les panneaux la montrent, null s'il n'y a rien à montrer. */
export function chainOf(core: CommandCore): ChainView | null {
  const chain = (core as { legalChain?: { status(): LegalStatus | null; active(): boolean } }).legalChain;
  if (!chain || typeof chain.status !== 'function') return null;
  const s = chain.status();
  return s ? { status: s, active: chain.active() } : null;
}


export type LegalAction =
  | { kind: 'chain' }
  | { kind: 'once' }
  | { kind: 'authorize'; level: ForceLevel }
  | { kind: 'ceiling'; level: ForceLevel }
  | { kind: 'request' };

export interface LegalLine {
  /** data-id du bouton (« legal-sommations », « legal-force-3 »…). */
  id: string;
  label: string;
  /** Deuxième ligne (« les 3 avertissements, ~1 min 30 »), '' si aucune. */
  sub: string;
  icon: IconName;
  action: LegalAction;
  /** Niveau en vigueur (✓). */
  on: boolean;
  disabled: boolean;
  /** Au-delà de ce que la loi permet maintenant (orange). */
  over: boolean;
}

export interface LegalViewInput {
  level: CommandLevel;
  canSommation: boolean;
  canAuthorize: boolean;
  /** Variante « salle de commandement ». */
  salle: boolean;
  /** Un officier de la compagnie peut faire les sommations sur ordre (police.command.requestSommation, compagnie). */
  officer: boolean;
  sommations: number;
  lawful: number;
  /** Force en vigueur (roe.authorizedForce : bornée par ce que la loi permet). */
  authorised: number;
  /**
   * Niveau que l'autorité a ordonné (law:authorized), qui peut dépasser ce que la loi permet : il prend effet une fois
   * les sommations faites. Absent : celui en vigueur.
   */
  ordered?: number;
  /** Plafond des ordres d'un chef de groupe (core.orderForce). */
  ceiling: number;
  underAttack: boolean;
  chain: ChainView | null;
}

export interface LegalView {
  /** « La loi permet maintenant : mains nues. Vous autorisez : mains nues. » */
  head: string;
  lines: LegalLine[];
  /** Notes de bas de panneau (rappel de la règle, riposte, dépassement). */
  notes: { text: string; tone: 'normal' | 'warn' | 'alert' }[];
  /** Chaîne légale en cours ou arrêtée : son texte, et si « Annuler » est proposé. */
  chain: { text: string; cancel: boolean; tone: 'normal' | 'alert' } | null;
}

/** Ce que chaque sommation est, dans l'ordre (« Faire la sommation suivante seulement : l'annonce »). */
const NEXT_WORDS: readonly string[] = ['l’annonce', 'la première sommation', 'la dernière sommation'];

const FORCE_ICONS: readonly IconName[] = ['hand', 'hand', 'shield', 'wind', 'target'];

/** « les 3 avertissements, ~1 min 30 » selon ce qui reste à faire. */
function sommationsLeftText(done: number): string {
  const n = 3 - Math.max(0, Math.min(3, done));
  if (n >= 3) return 'les 3 avertissements, ~1\u00a0min\u00a030';
  if (n === 2) return 'les 2 avertissements restants, ~1\u00a0min';
  return 'le dernier avertissement, ~30\u00a0s';
}

/** Libellé d'une ligne de force : « Autoriser : mains nues seulement », « Mes ordres jusqu'à : bâton et gazeuse ». */
function forceLabel(level: number, prefix: string): string {
  return `${prefix}\u00a0: ${forceWord(level)}${level === 1 ? ' seulement' : ''}`;
}

/** Panneau « Cadre légal » selon le rôle, le droit et la chaîne légale en cours. */
export function legalView(s: LegalViewInput): LegalView {
  const lines: LegalLine[] = [];
  const notes: LegalView['notes'] = [];
  const done = Math.max(0, Math.min(3, Math.round(s.sommations)));
  const lawful = forceWord(s.lawful);
  let head: string;
  const ordered = s.ordered ?? s.authorised;
  const pending = s.canAuthorize && ordered > s.authorised;
  if (s.canAuthorize || s.level === 'lecture') {
    head = `La loi permet maintenant\u00a0: ${lawful}. Vous autorisez\u00a0: ${forceWord(ordered)}${pending ? ', en vigueur après les sommations' : ''}.`;
  }
  else head = `La loi permet maintenant\u00a0: ${lawful}. Le commandant autorise\u00a0: ${forceWord(s.authorised)}. Vos ordres\u00a0: jusqu’à ${forceWord(Math.min(s.ceiling, s.authorised))}.`;
  const chainBusy = !!s.chain && s.chain.active;

  // sommations : par le joueur, ou par l'officier sur place (salle de commandement)
  if (s.level !== 'lecture') {
    const byOfficer = s.salle && (s.canSommation || s.officer);
    if ((s.canSommation && !s.salle) || byOfficer) {
      const all = done >= 3;
      lines.push({
        id: 'legal-sommations', icon: 'megaphone', action: { kind: 'chain' }, on: all, over: false, disabled: all || chainBusy,
        label: all ? 'Sommations faites' : byOfficer ? 'Faire faire les sommations par l’officier sur place' : 'Faire les sommations',
        sub: all ? 'la force collective est permise après le délai laissé à la foule' : sommationsLeftText(done),
      });
      if (!all) {
        const next = NEXT_WORDS[done] ?? NEXT_WORDS[2]!;
        lines.push({
          id: 'legal-sommation', icon: 'megaphone', action: { kind: 'once' }, on: false, over: false, disabled: chainBusy,
          label: byOfficer ? `Faire faire la sommation suivante seulement\u00a0: ${next}` : `Faire la sommation suivante seulement\u00a0: ${next}`,
          sub: '',
        });
      }
    } else {
      notes.push({ text: 'Sommations\u00a0: réservées au commissaire ou à l’officier ceint.', tone: 'normal' });
    }
  }

  // force : l'autorité l'autorise ; un chef de groupe plafonne ses propres ordres et demande plus par radio
  if (s.canAuthorize) {
    for (let lvl = 1; lvl <= 4; lvl++) {
      lines.push({
        id: 'legal-force-' + lvl, icon: FORCE_ICONS[lvl]!, action: { kind: 'authorize', level: lvl as ForceLevel },
        label: forceLabel(lvl, 'Autoriser'), on: ordered === lvl, disabled: false, over: lvl > s.lawful,
        sub: lvl > s.lawful ? (ordered === lvl ? 'autorisé : en vigueur après les sommations' : 'au-delà de ce que la loi permet maintenant') : '',
      });
    }
  } else if (s.level === 'unite') {
    const shown = Math.min(s.ceiling, s.authorised);
    for (let lvl = 1; lvl <= 4; lvl++) {
      lines.push({
        id: 'legal-ceiling-' + lvl, icon: FORCE_ICONS[lvl]!, action: { kind: 'ceiling', level: lvl as ForceLevel },
        label: forceLabel(lvl, 'Mes ordres jusqu’à'), on: shown === lvl, disabled: lvl > s.authorised, over: false,
        sub: lvl > s.authorised ? 'au-dessus de ce que le commandant autorise' : '',
      });
    }
    lines.push({
      id: 'legal-request', icon: 'radio', action: { kind: 'request' }, on: false, disabled: s.authorised >= 4, over: false,
      label: 'Demander plus de force (radio)', sub: s.authorised < 4 ? `${authorizeWord(Math.min(4, s.authorised + 1)).replace(/^autoriser/, 'demander')} au commandant` : '',
    });
  }

  if (s.level === 'lecture') notes.push({ text: 'Lecture seule\u00a0: vous ne donnez pas d’ordre.', tone: 'normal' });
  notes.push({
    text: 'Avant toute force au-delà des mains nues, la loi demande les 3 sommations, sauf si vos unités sont attaquées (riposte permise).',
    tone: 'normal',
  });
  if (s.underAttack) notes.push({ text: 'Vos unités sont attaquées\u00a0: riposte immédiate permise.', tone: 'alert' });
  if (s.canAuthorize && ordered > s.lawful && !s.underAttack) {
    notes.push({ text: 'Vous autorisez plus que ce que la loi permet maintenant\u00a0: cela prendra effet après les sommations et le délai laissé à la foule.', tone: 'warn' });
  }
  const c = s.chain;
  const chain = c ? { text: c.status.text, cancel: c.active, tone: c.status.stage === 'refus' ? 'alert' as const : 'normal' as const } : null;
  return { head, lines, notes, chain };
}

// ───────────────────────────── gestes du droit ─────────────────────────────

const STAGE_SAID: readonly string[] = [
  'Aucune sommation', 'Annonce faite\u00a0: «\u00a0Obéissance à la loi\u00a0»', 'Première sommation faite', 'Dernière sommation faite',
];

interface PoliceCommandLike {
  requestSommation(companySquadId: number, x: number, z: number): boolean;
  hotspots: readonly { x: number; z: number }[];
}

/** Un officier de la compagnie peut-il faire les sommations sur ordre (service et compagnie engagée) ? */
export function officerAvailable(core: CommandCore): boolean {
  const ctx = core.ctx;
  const cmd = ctx.service<PoliceCommandLike>('police.command');
  return !!cmd && typeof cmd.requestSommation === 'function' && ctx.squads.list.some((q) => q.kind === 'compagnie' && q.faction === 'police');
}

/** Point de sommation sur ordre : le point chaud le plus marqué, sinon la tête du cortège (NaN : aucun). */
function sommationPoint(core: CommandCore, cmd: PoliceCommandLike): { x: number; z: number } {
  if (cmd.hotspots.length > 0) return { x: cmd.hotspots[0]!.x, z: cmd.hotspots[0]!.z };
  const ctx = core.ctx;
  const route = ctx.director.route;
  let s = ctx.director.headProgress;
  for (let i = 0; i + 3 < route.length; i += 2) {
    const len = Math.hypot(route[i + 2]! - route[i]!, route[i + 3]! - route[i + 1]!);
    if (s <= len || i + 5 >= route.length) {
      const k = len > 0 ? Math.min(1, s / len) : 0;
      return { x: route[i]! + (route[i + 2]! - route[i]!) * k, z: route[i + 1]! + (route[i + 3]! - route[i + 1]!) * k };
    }
    s -= len;
  }
  return { x: NaN, z: NaN };
}

/**
 * Sommation suivante (« Faire la sommation suivante seulement ») : prononcée par le joueur au mégaphone ; en salle de
 * commandement, l'officier de la compagnie s'en charge sur ordre radio. Le refus est dit au joueur.
 */
export function doSommation(core: CommandCore): { ok: boolean; text: string } {
  const ctx = core.ctx;
  const p = core.player();
  if (!p) return { ok: false, text: '' };
  if (ctx.session.config?.extra?.['variante'] === 'salle') {
    const cmd = ctx.service<PoliceCommandLike>('police.command');
    const company = ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police');
    if (!cmd || !company) {
      ctx.ui.notify('Aucun officier ne peut sommer sur ordre\u00a0: pas de compagnie engagée.', 'warn', 4);
      return { ok: false, text: 'Aucun officier ne peut sommer sur ordre.' };
    }
    const at = sommationPoint(core, cmd);
    if (!Number.isFinite(at.x) || !cmd.requestSommation(company.id, at.x, at.z)) {
      ctx.ui.notify('Sommation sur ordre impossible\u00a0: aucun officier habilité disponible ou aucun attroupement repéré.', 'warn', 5);
      return { ok: false, text: 'Sommation sur ordre impossible.' };
    }
    ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 2, personId: ctx.player.state.personId,
      text: `${company.name.toUpperCase()} ICI ${core.callsign().toUpperCase()}. Portez-vous à portée de mégaphone et procédez à la sommation suivante. PARLEZ.`,
    });
    return { ok: true, text: 'Sommation demandée à l’officier sur place' };
  }
  const before = ctx.law.roe.sommation;
  const stage = ctx.law.sommation(p);
  if (stage === before) {
    const text = before >= 3 ? 'Les sommations sont terminées.' : 'Sommation refusée\u00a0: seule l’autorité habilitée, insigne apparent, peut la prononcer.';
    ctx.ui.notify(text, 'warn', 4);
    return { ok: false, text };
  }
  // le texte réglementaire est diffusé par l'événement law:sommation (sous-titre, voix) ; ici, la trace radio
  ctx.radio.say({
    channel: 'commandement', from: core.callsign(), priority: 2, personId: p.id,
    text: `À TOUS ICI ${core.callsign().toUpperCase()}. ${STAGE_SAID[Math.min(3, stage)]}. ${stage >= 3 ? 'Emploi de la force possible sur mon ordre.' : 'Aucun emploi de la force avant mon ordre.'} TERMINÉ.`,
  });
  return { ok: true, text: 'Sommation faite' };
}

/**
 * Autorise un niveau de force (autorité ou commandant), annoncé à la radio par core.authorize. Le droit prévient
 * lui-même quand le niveau dépasse ce que la loi permet maintenant (il prendra effet après les sommations). Revenir à
 * un niveau égal à celui en vigueur alors qu'un niveau plus haut était ordonné passe directement par le droit
 * (core.authorize ne compare qu'au niveau en vigueur). false si le joueur n'en a pas le droit.
 */
export function authorizeLevel(core: CommandCore, level: ForceLevel): boolean {
  if (!core.scope().canAuthorize) return false;
  const ctx = core.ctx;
  if (level === ctx.law.roe.authorizedForce && orderedForce(core) !== level) {
    const from = core.callsign();
    ctx.law.authorize(level, ctx.player.state.personId);
    ctx.radio.say({
      channel: 'commandement', from, priority: 2, personId: ctx.player.state.personId,
      text: `À TOUS ICI ${from.toUpperCase()}. Emploi de la force ramené à\u00a0: ${forceWord(level)}. TERMINÉ.`,
    });
    return true;
  }
  return core.authorize(level);
}

/** Chef de groupe : plafond de ses propres ordres, borné par ce que le commandant autorise. */
export function setCeiling(core: CommandCore, level: ForceLevel): void {
  const max = core.ctx.law.roe.authorizedForce;
  core.orderForce = (level > max ? max : level) as ForceLevel;
}

/** Demande par radio l'autorisation du niveau de force suivant (sans le droit d'autoriser). */
export function requestForce(core: CommandCore): void {
  const ctx = core.ctx;
  const p = core.player();
  const want = Math.min(4, ctx.law.roe.authorizedForce + 1) as ForceLevel;
  ctx.radio.say({
    channel: 'commandement', from: core.callsign(), priority: 2, personId: p ? p.id : 0,
    text: forceRequest(core.callsign(), p ? ctx.world.sectorName(p.x, p.z) : '', want, ctx.law.roe.underAttack, ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police')?.name),
  });
  ctx.ui.notify('Demande d’autorisation transmise à l’autorité.', 'info', 3);
}

/**
 * « Faire les sommations » (les trois à la suite) : la chaîne légale du noyau, au lieu de la foule principale (sinon
 * là où est le joueur). Les mêmes vérifications que S3 : qui les fait (le joueur, l'officier sur place) ou pourquoi
 * personne ne le peut. Branchement par défaut de LegalPanelOptions.onChain.
 */
export function startSommationChain(core: CommandCore): { ok: boolean; text: string } {
  const env = cardEnvFromCore(core);
  if (env.sommations >= 3) return { ok: false, text: 'Les sommations sont déjà faites.' };
  const crowd = mainCrowd(env);
  const p = core.player();
  const where = crowd ? crowdRepere(crowd) : p ? { kind: 'vous' as const, key: 'vous', x: p.x, z: p.z, name: 'Vous' } : null;
  if (!where) return { ok: false, text: 'Aucun attroupement repéré.' };
  const line = plainLine('Faire les sommations', '', 'megaphone', { kind: 'sommation', all: true });
  const r = legalCheck(core, env, line, null, where);
  if (!r.chain || !r.plan) return { ok: false, text: r.reason || 'Sommations impossibles.' };
  core.legalChain.start(r.plan);
  return { ok: true, text: r.plan.viaOfficer ? 'Sommations demandées à l’officier sur place' : 'Sommations lancées' };
}

/** Niveau ordonné par l'autorité, suivi par partie (événement law:authorized) : la loi ne publie que celui en vigueur. */
const ORDERED = new WeakMap<CommandCore, { session: unknown; level: number }>();

/**
 * Commence à suivre le niveau de force ordonné (appelé dès qu'un panneau de la carte est construit, donc avant toute
 * autorisation donnée depuis la carte). Sans suivi, le niveau en vigueur.
 */
export function watchOrderedForce(core: CommandCore): void {
  if (ORDERED.has(core)) return;
  const ctx = core.ctx;
  const rec = { session: ctx.session.config as unknown, level: ctx.law.roe.authorizedForce as number };
  ORDERED.set(core, rec);
  ctx.events.on('law:authorized', (p) => {
    rec.session = ctx.session.config;
    rec.level = p.level;
  });
}

/** Niveau de force que l'autorité a ordonné (≥ celui en vigueur, qui est borné par ce que la loi permet). */
export function orderedForce(core: CommandCore): number {
  watchOrderedForce(core);
  const ctx = core.ctx;
  const rec = ORDERED.get(core)!;
  const now = ctx.law.roe.authorizedForce;
  // nouvelle partie, ou suivi commencé après l'ordre : le niveau en vigueur fait foi
  if (rec.session !== ctx.session.config || rec.level < now) {
    rec.session = ctx.session.config;
    rec.level = now;
  }
  return rec.level;
}

/** Entrée de la vue lue dans la partie. */
export function legalInput(core: CommandCore): LegalViewInput {
  const ctx = core.ctx;
  const sc = core.scope();
  const roe = ctx.law.roe;
  return {
    level: sc.level, canSommation: sc.canSommation, canAuthorize: sc.canAuthorize,
    salle: ctx.session.config?.extra?.['variante'] === 'salle', officer: officerAvailable(core),
    sommations: roe.sommation, lawful: roe.lawfulForce, authorised: roe.authorizedForce, ordered: orderedForce(core), ceiling: core.orderForce,
    underAttack: roe.underAttack, chain: chainOf(core),
  };
}

// ───────────────────────────── panneau (DOM) ─────────────────────────────

export interface LegalPanelOptions {
  /** « Faire les sommations » (les trois) : la chaîne légale ; par défaut startSommationChain(core). */
  onChain?(): { ok: boolean; text: string };
  /** Annule la chaîne légale ; par défaut core.legalChain.cancel(). */
  onCancelChain?(): void;
  /** Ferme la feuille (bouton ✕ ; sans lui, le bouton n'est pas montré). */
  onClose?(): void;
}

export class LegalPanel {
  readonly root: HTMLDivElement;
  private readonly headEl: HTMLElement;
  private readonly list: HTMLDivElement;
  private readonly chainBox: HTMLDivElement;
  private readonly chainText: HTMLElement;
  private readonly chainCancel: HTMLButtonElement;
  private readonly notesBox: HTMLDivElement;
  private view: LegalView | null = null;
  private sig = '';

  constructor(private readonly core: CommandCore, host: HTMLElement, private readonly opts: LegalPanelOptions = {}) {
    this.root = el('div', 'cp-sheet cp-legal');
    this.root.dataset.id = 'tac-legal-panel';
    const top = el('div', 'cp-top');
    top.appendChild(el('div', 'cp-title', 'Cadre légal'));
    if (opts.onClose) {
      const x = document.createElement('button');
      x.type = 'button';
      x.tabIndex = -1;
      x.className = 'cm-btn is-icon is-small cp-x';
      x.dataset.id = 'legal-close';
      x.title = 'Fermer (Échap)';
      x.setAttribute('aria-label', 'Fermer');
      x.innerHTML = iconMarkup('close', 'cp-svg');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClose?.();
      });
      top.appendChild(x);
    }
    this.headEl = el('div', 'cp-lead');
    this.chainBox = el('div', 'cp-chain');
    this.chainText = el('span', 'cp-chain-t');
    this.chainCancel = document.createElement('button');
    this.chainCancel.type = 'button';
    this.chainCancel.tabIndex = -1;
    this.chainCancel.className = 'cm-btn is-small cp-cancel';
    this.chainCancel.dataset.id = 'legal-chain-cancel';
    this.chainCancel.textContent = 'Annuler';
    this.chainCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (opts.onCancelChain) opts.onCancelChain();
      else (core as { legalChain?: { cancel(): void } }).legalChain?.cancel();
      this.refresh(true);
    });
    this.chainBox.append(this.chainText, this.chainCancel);
    this.chainBox.style.display = 'none';
    this.list = el('div', 'cp-list ct-scroll');
    this.notesBox = el('div', 'cp-notes');
    this.root.append(top, this.headEl, this.chainBox, this.list, this.notesBox);
    host.appendChild(this.root);
    watchOrderedForce(core);
  }

  /** Vue montrée (tests, intégration). */
  get current(): LegalView | null {
    return this.view;
  }

  refresh(force: boolean): void {
    const v = legalView(legalInput(this.core));
    this.view = v;
    setText(this.headEl, v.head);
    this.chainBox.style.display = v.chain ? '' : 'none';
    if (v.chain) {
      setText(this.chainText, v.chain.text);
      this.chainCancel.style.display = v.chain.cancel ? '' : 'none';
      setClass(this.chainBox, 'is-alert', v.chain.tone === 'alert');
    }
    const sig = v.lines.map((l) => `${l.id}:${l.label}:${l.sub}:${l.on ? 1 : 0}${l.disabled ? 1 : 0}${l.over ? 1 : 0}`).join('|');
    if (sig !== this.sig || force) {
      this.sig = sig;
      this.list.textContent = '';
      for (let i = 0; i < v.lines.length; i++) this.list.appendChild(this.lineButton(v.lines[i]!, i + 1));
    }
    const nsig = v.notes.map((n) => n.tone + n.text).join('|');
    if (this.notesBox.dataset.sig !== nsig) {
      this.notesBox.dataset.sig = nsig;
      this.notesBox.textContent = '';
      for (const n of v.notes) this.notesBox.appendChild(el('div', 'ct-note' + (n.tone === 'warn' ? ' is-warn' : n.tone === 'alert' ? ' is-alert' : ''), n.text));
    }
  }

  private lineButton(l: LegalLine, n: number): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 'cp-row cp-lline' + (l.on ? ' is-on' : '') + (l.over ? ' is-over' : '');
    b.dataset.id = l.id;
    b.dataset.n = String(n);
    b.disabled = l.disabled;
    b.appendChild(el('span', 'cp-n', String(n)));
    const ic = el('span', 'cp-ic');
    ic.innerHTML = iconMarkup(l.icon, 'cp-svg');
    const main = el('span', 'cp-main');
    main.appendChild(el('b', 'cp-t', l.label));
    if (l.sub !== '') main.appendChild(el('small', 'cp-s', l.sub));
    b.append(ic, main);
    if (l.on) b.appendChild(el('span', 'cp-check', '✓'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.run(l.action);
    });
    return b;
  }

  private run(a: LegalAction): void {
    const core = this.core;
    switch (a.kind) {
      case 'chain': {
        const r = this.opts.onChain ? this.opts.onChain() : startSommationChain(core);
        if (!r.ok && r.text !== '') core.ctx.ui.notify(r.text, 'warn', 5);
        break;
      }
      case 'once':
        doSommation(core);
        break;
      case 'authorize':
        authorizeLevel(core, a.level);
        break;
      case 'ceiling':
        setCeiling(core, a.level);
        break;
      case 'request':
        requestForce(core);
        break;
    }
    this.refresh(true);
  }

  dispose(): void {
    this.root.remove();
  }
}
