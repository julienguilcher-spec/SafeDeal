/* =====================================================================================
 * Carte de commandement — la FICHE (colonne de droite ; feuille de 380 px au téléphone). DOM seul : aucun accès au
 * noyau ni à la partie, l'écran (tacticalScreen.ts) lui donne tout et reçoit les choix par des rappels.
 *
 *   show(fiche, Qui, ligne, phrase, compact, extra)   S1 : en-tête (titre, sous-titre, « ‹ n / m › », onglets des
 *                                                     repères empilés, « Rue suivante (2 / 7) »), lignes numérotées
 *                                                     1–6 + « 0 ⋯ Autres ordres ici… » (ou la liste « Autres »),
 *                                                     marques ⚖ / 🔒, bloc Qui, « Ce qui va se passer », « Donner
 *                                                     l'ordre ⏎ » / « ‹ Retour Échap », ligne d'aide du clavier ;
 *   showWho(liste, surlignée, cochées)               S2 : « QUI ENVOYER ? » ;
 *   showConfirm(modèle)                              S3 : étapes légales dans l'ordre, ou la raison de l'impossibilité ;
 *   showSent(texte, annulable)                       S4 : « ✓ ORDRE DONNÉ — … » + « Annuler l'ordre X » (5 s).
 *
 * Pointeur (souris, trackpad) : survol d'une ligne = onLineHover (aperçu), clic = onSend (la ligne part ; ⚖ / 🔒 :
 * l'écran ouvre S3). Doigt (pointerType « touch ») : un premier toucher surligne (onLineTap), un second toucher sur
 * la même ligne ou « Donner l'ordre » envoie — un seul toucher n'envoie jamais rien. Tous les boutons ont
 * tabindex="-1" et un appui ne prend pas le focus : la carte le garde (modèle du clavier, §2.0 du plan).
 *
 * Identifiants (data-id) : card-line-<n> (n = numéro imprimé : 1–6, 0 = « Autres ordres ici… »), card-send,
 * card-back, card-who, card-who-next, card-who-all, card-prev / card-next (‹ ›), card-tab-<i>, who-row-<n>
 * (n = numéro imprimé, à partir de 1), who-tick-<n>, who-ok, card-confirm (« Faire les étapes dans l'ordre » ou
 * « Donner l'ordre quand même »), card-confirm-sommations, card-undo.
 *
 * Les types CardShowExtra / CardConfirmModel / CardConfirmChoice ont la forme de CardExtra / ConfirmModel /
 * ConfirmChoice de tacticalScreen.ts : CardPanel s'y branche tel quel (setTacticalParts({ createCardPanel })).
 * ===================================================================================== */

import { hasIcon, iconMarkup } from '../core/icons';
import type { IconName } from '../core/icons';
import type { Card, CardLine, LegalStep, WhoCandidate } from './cardTypes';

// ───────────────────────────── contrat avec l'écran ─────────────────────────────

/** Ce que l'écran montre en plus de la fiche (même forme que CardExtra de tacticalScreen.ts). */
export interface CardShowExtra {
  /** « Autres ordres ici… » déplié : `line` désigne alors une ligne de `card.others`. */
  othersOpen: boolean;
  /** Toutes les lignes montrent leur explication (sinon seulement la ligne surlignée). */
  explainAll: boolean;
  /** Ligne d'aide du clavier, '' au pointeur et au doigt. */
  hint: string;
  /** « 1 / 7 » : rang du lieu parmi les candidats de l'intention, '' sinon. */
  position: string;
  /** Onglet surligné parmi `card.stack`. */
  stackIndex: number;
  /** Intention collante : « Rue suivante (2 / 7) — Entrée : la bloquer aussi · Échap : terminer », '' sinon. */
  sticky: string;
  /** Bouton T (« Toute la compagnie », « Toute la section », « Tout le groupe ») ; '' : pas de bouton. */
  wholeLabel: string;
  /** T est actif. */
  whole: boolean;
  /** Qui est imposé : ni « Autre unité » ni T, et la liste ne s'ouvre pas. */
  whoFixed: boolean;
}

/** Confirmation légale (même forme que ConfirmModel de tacticalScreen.ts). */
export interface CardConfirmModel {
  title: string;
  steps: LegalStep[];
  /** Ligne permise avant la dernière sommation (⚖). */
  coercive: boolean;
  /** Pourquoi la chaîne est impossible, '' sinon. */
  reason: string;
  /** « Faire les étapes dans l'ordre » est proposé. */
  canChain: boolean;
  /** Chef de groupe au-dessus de son plafond : « Demander plus de force (radio) » est proposé avec la raison. */
  request?: boolean;
}

export type CardConfirmChoice = 'chain' | 'anyway' | 'sommations' | 'request';

// ───────────────────────────── textes ─────────────────────────────

export const SEND_LABEL = 'Donner l’ordre';
export const BACK_LABEL = '‹ Retour';
export const OTHERS_LABEL = 'Autres ordres ici…';
export const NEXT_UNIT_LABEL = 'Autre unité';
export const SENT_PREFIX = '✓ ORDRE DONNÉ';
export const UNDO_LABEL = 'Annuler l’ordre';
export const CHAIN_LABEL = 'Faire les étapes dans l’ordre';
export const ANYWAY_LABEL = 'Donner l’ordre quand même';
export const SOMMATIONS_FIRST_LABEL = 'Faire d’abord les sommations';
export const REQUEST_FORCE_LABEL = 'Demander plus de force (radio)';
export const BEFORE_LAST_TEXT = 'L’ordre part avant la dernière sommation : vous en répondrez.';
export const STEPS_INTRO = 'Il faut d’abord, dans l’ordre :';
/** S3 sans chaîne possible et sans raison donnée (chaîne légale indisponible) : le chemin manuel. */
export const MANUAL_TEXT = 'Les étapes ne peuvent pas être lancées d’ici : faites-les avec le cadre légal (L).';
/** Qui d'une fermeture aux voitures sans unité (même texte que bestUnit.NOBODY_LABEL). */
export const NOBODY_TEXT = 'Personne : barrières seules';
const SENTENCE_PREFIX = 'Ce qui va se passer : ';
const STEP_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

/** « 180 m », « 2,3 km ». */
export function distanceText(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;
}

/** « ~2 min », « ~1 h 05 ». */
export function etaText(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `~${min} min`;
  return `~${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** « à pied · 180 m · ~2 min ». */
export function travelLine(c: WhoCandidate): string {
  const parts = [c.mode === 'vehicules' ? 'en véhicules' : 'à pied', distanceText(c.distance), etaText(c.eta)];
  return parts.filter((p) => p !== '').join(' · ');
}

// ───────────────────────────── modèle de vue (pur, testé) ─────────────────────────────

export interface CardRowView {
  /** Numéro imprimé (1–6 ; 0 : « Autres ordres ici… » ; −1 : aucun, au-delà de 9 dans « Autres »). */
  n: number;
  /** Indice dans la liste montrée (`lines` ou `others`) ; −1 pour la rangée « Autres ordres ici… ». */
  index: number;
  label: string;
  explain: string;
  showExplain: boolean;
  icon: IconName | '';
  /** '🔒' : la loi ne permet pas encore ; '⚖' : permis avant la dernière sommation ; '' sinon. */
  mark: '' | '🔒' | '⚖';
  /** « 🔒 sommations 0/3 + autoriser le gaz », « ⚖ avant la dernière sommation ». */
  markText: string;
  highlighted: boolean;
  others: boolean;
}

export interface CardWhoView {
  /** « Qui : Section MISTRAL 2 — sans ordre ». */
  text: string;
  /** « à pied · 180 m · ~2 min ». */
  detail: string;
  /** Téléphone : « MISTRAL 2 · ~2 min ». */
  short: string;
  /** Le nom ouvre la liste Qui. */
  canList: boolean;
  /** « Autre unité U ». */
  next: boolean;
  /** Bouton T, null : aucun. */
  whole: { label: string; on: boolean } | null;
}

export interface CardView {
  title: string;
  sub: string;
  notes: string[];
  position: string;
  tabs: { name: string; on: boolean }[];
  sticky: string;
  othersOpen: boolean;
  rows: CardRowView[];
  who: CardWhoView | null;
  sentence: string;
  rule: string;
  canSend: boolean;
  hint: string;
  compact: boolean;
}

/** Fenêtre assez haute pour l'explication de toutes les lignes (≥ 760 px), quand l'écran ne le dit pas. */
function tallWindow(): boolean {
  return typeof window === 'undefined' || typeof window.innerHeight !== 'number' || window.innerHeight >= 760;
}

function iconOf(name: string): IconName | '' {
  return name !== '' && hasIcon(name) ? name : '';
}

function rowOf(line: CardLine, index: number, n: number, highlighted: boolean, explainAll: boolean): CardRowView {
  const mark: CardRowView['mark'] = line.lock ? '🔒' : line.coercive ? '⚖' : '';
  const markText = line.lock ? `🔒 ${line.lock.text}` : line.coercive ? '⚖ avant la dernière sommation' : '';
  return {
    n, index, label: line.label, explain: line.explain, showExplain: explainAll || highlighted, icon: iconOf(line.icon), mark, markText,
    highlighted, others: false,
  };
}

/** Nom court d'une unité pour la rangée Qui du téléphone (« Section MISTRAL 2 » → « MISTRAL 2 »). */
function shortName(label: string): string {
  return label.replace(/^(Section|Groupe|Compagnie|Unité)\s+/i, '');
}

/** Bloc Qui de la ligne surlignée (null : la ligne ne s'adresse à aucune unité). */
export function whoView(line: CardLine | null, who: WhoCandidate | null, extra: CardShowExtra): CardWhoView | null {
  if (!line) return null;
  const closeRoad = line.action.kind === 'closeRoad';
  if (!line.needsWho && !closeRoad) return null;
  const fixed = extra.whoFixed;
  const whole = !fixed && extra.wholeLabel !== '' ? { label: extra.wholeLabel, on: extra.whole } : null;
  if (!who || (who.squadIds.length === 0 && who.fromStation === undefined)) {
    if (closeRoad) {
      return {
        text: `Qui : ${NOBODY_TEXT}`, detail: 'U : faire tenir la fermeture par une unité', short: NOBODY_TEXT,
        canList: !fixed, next: !fixed, whole,
      };
    }
    return {
      text: 'Qui : aucune unité libre', detail: 'Choisissez une unité : U ou la liste', short: 'aucune unité libre',
      canList: !fixed, next: !fixed, whole,
    };
  }
  const eta = etaText(who.eta);
  return {
    text: `Qui : ${who.label}${who.busy !== '' ? ` — ${who.busy}` : ''}`,
    detail: travelLine(who),
    short: eta !== '' ? `${shortName(who.label)} · ${eta}` : shortName(who.label),
    canList: !fixed, next: !fixed, whole,
  };
}

/** Phrase « Ce qui va se passer : … » (préfixe ajouté s'il manque). */
function sentenceText(what: string): string {
  const w = what.trim();
  if (w === '') return '';
  return /^Ce qui va se passer/.test(w) ? w : SENTENCE_PREFIX + w;
}

/** Valeurs de `extra` quand l'écran n'en donne pas. */
export function defaultExtra(compact: boolean): CardShowExtra {
  return {
    othersOpen: false, explainAll: !compact && tallWindow(), hint: '', position: '', stackIndex: 0, sticky: '', wholeLabel: '', whole: false,
    whoFixed: false,
  };
}

/** Tout ce que la fiche affiche, calculé sans DOM. */
export function cardView(
  card: Card, who: WhoCandidate | null, line: number, sentence: { what: string; rule: string }, compact: boolean, extra?: CardShowExtra,
): CardView {
  const x = extra ?? defaultExtra(compact);
  const othersOpen = x.othersOpen && card.others.length > 0;
  const list = othersOpen ? card.others : card.lines;
  const hi = list.length === 0 ? -1 : Math.min(Math.max(0, line), list.length - 1);
  const explainAll = x.explainAll && !compact;
  const rows: CardRowView[] = list.map((l, i) => rowOf(l, i, othersOpen ? (i < 9 ? i + 1 : -1) : i + 1, i === hi, explainAll));
  if (!othersOpen && card.others.length > 0) {
    rows.push({
      n: 0, index: -1, label: OTHERS_LABEL, explain: `${card.others.length} ordre${card.others.length > 1 ? 's' : ''} de plus pour cet endroit`,
      showExplain: explainAll, icon: 'list', mark: '', markText: '', highlighted: false, others: true,
    });
  }
  const current = hi >= 0 ? list[hi]! : null;
  const tabs = card.stack.length > 1 ? card.stack.map((r, i) => ({ name: r.name.split(' — ')[0]!, on: i === x.stackIndex })) : [];
  return {
    title: card.title,
    sub: card.sub,
    notes: card.notes.slice(),
    position: x.position,
    tabs,
    sticky: x.sticky,
    othersOpen,
    rows,
    who: whoView(current, who, x),
    sentence: current ? sentenceText(sentence.what) : '',
    rule: current ? (sentence.rule !== '' ? sentence.rule : current.rule) : '',
    canSend: current !== null,
    hint: compact ? '' : x.hint,
    compact,
  };
}

export interface WhoRowView {
  n: number;
  label: string;
  detail: string;
  /** Le candidat que le jeu propose (le premier de mes unités). */
  proposed: boolean;
  /** Première rangée des renforts des commissariats : l'en-tête « Renforts des commissariats » la précède. */
  stationHead: boolean;
  highlighted: boolean;
  ticked: boolean;
}

/** Rangées de la liste « Qui envoyer ? ». */
export function whoRows(list: readonly WhoCandidate[], highlighted: number, ticked: ReadonlySet<number>): WhoRowView[] {
  const firstOwn = list.findIndex((c) => c.fromStation === undefined);
  const firstStation = list.findIndex((c) => c.fromStation !== undefined);
  return list.map((c, i) => {
    const parts = [c.busy, c.squadIds.length > 0 || c.fromStation !== undefined ? distanceText(c.distance) : '', etaText(c.eta)];
    return {
      n: i + 1,
      label: c.label,
      detail: parts.filter((p) => p !== '').join(' · '),
      proposed: i === firstOwn,
      stationHead: i === firstStation,
      highlighted: i === highlighted,
      ticked: ticked.has(i),
    };
  });
}

// ───────────────────────────── petits outils DOM ─────────────────────────────

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== '') e.textContent = text;
  return e;
}

function kbd(key: string): HTMLElement {
  return node('span', 'cm-kbd', key);
}

/** Bouton de la fiche : jamais atteint par la tabulation ni par le gestionnaire de focus. */
function btn(className: string, id: string, label: string, key?: string): HTMLButtonElement {
  const b = node('button', className);
  b.type = 'button';
  b.tabIndex = -1;
  b.setAttribute('tabindex', '-1');
  if (id !== '') b.dataset.id = id;
  if (label !== '') b.appendChild(node('span', 'cc-t', label));
  if (key) b.appendChild(kbd(key));
  return b;
}

function clear(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}

/** Type de pointeur d'un évènement ('' : inconnu, ex. un clic synthétique de Safari). */
function pointerTypeOf(e: Event): string {
  const t = (e as PointerEvent).pointerType;
  return typeof t === 'string' ? t : '';
}

// ───────────────────────────── la fiche ─────────────────────────────

export class CardPanel {
  readonly root: HTMLDivElement;

  onLineHover?: (index: number) => void;
  onLineTap?: (index: number) => void;
  onSend?: (index?: number) => void;
  onBack?: () => void;
  onOthers?: () => void;
  onWhoNext?: (step?: 1 | -1) => void;
  onWhoAll?: () => void;
  onWhoList?: () => void;
  onWhoPick?: (indices: number[]) => void;
  onConfirm?: (choice: CardConfirmChoice) => void;
  onUndo?: () => void;
  onCandidate?: (step: 1 | -1) => void;
  onStack?: (index: number) => void;

  private readonly cardBox: HTMLDivElement;
  private readonly whoBox: HTMLDivElement;
  private readonly confirmBox: HTMLDivElement;
  private readonly sentBox: HTMLDivElement;
  private readonly sentText: HTMLElement;
  private readonly sentDetail: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly cardHead: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly tail: HTMLDivElement;

  private mode: 'none' | 'card' | 'who' | 'confirm' = 'none';
  private signature = '';
  private whoSignature = '';
  private view: CardView | null = null;
  /** Identité de la fiche (repère, liste montrée) : un changement désarme le second toucher. */
  private identity = '';
  /** Ligne touchée une première fois au doigt (le second toucher l'envoie), −1 : aucune. */
  private armed = -1;
  /** Ligne survolée au pointeur (−1 : aucune). */
  private hovered = -1;
  /** Type du dernier appui (pointerdown) : sert quand le clic ne le dit pas. */
  private downType = 'mouse';
  /** Liste Qui : rangées cochées au pointeur, et les cochées données par l'écran (clavier : Espace). */
  private ticks = new Set<number>();
  private ticksFromScreen = '';
  private whoCount = 0;
  private whoHighlighted = 0;
  /** Cases à cocher de la liste Qui, par rang. */
  private whoTicks: HTMLElement[] = [];
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: HTMLElement) {
    this.root = node('div', 'cc');
    this.root.dataset.id = 'card';
    this.root.dataset.mode = 'none';
    // un appui ne prend pas le focus (la carte le garde : Entrée et les flèches restent à l'écran)
    this.listen(this.root, 'mousedown', (e) => e.preventDefault());
    this.listen(this.root, 'pointerdown', (e) => {
      const t = pointerTypeOf(e);
      if (t !== '') this.downType = t;
    });

    this.cardBox = node('div', 'cc-box cc-card');
    this.cardHead = node('div', 'cc-head');
    this.sentBox = node('div', 'cc-sent');
    this.sentBox.hidden = true;
    this.sentText = node('b', 'cc-sent-t');
    this.sentDetail = node('div', 'cc-sent-d');
    this.undoBtn = btn('cc-btn is-small', 'card-undo', UNDO_LABEL, 'X');
    this.listen(this.undoBtn, 'click', (e) => {
      e.stopPropagation();
      this.onUndo?.();
    });
    this.sentBox.append(this.sentText, this.sentDetail, this.undoBtn);
    this.list = node('div', 'cc-list');
    this.listen(this.list, 'pointerleave', (e) => {
      if (pointerTypeOf(e) === 'touch') return;
      this.hover(-1);
    });
    this.tail = node('div', 'cc-tail');
    this.tail.style.display = 'contents';
    this.cardBox.append(this.sentBox, this.cardHead, this.list, this.tail);

    this.whoBox = node('div', 'cc-box cc-qui');
    this.confirmBox = node('div', 'cc-box cc-confirm');
    this.cardBox.hidden = true;
    this.whoBox.hidden = true;
    this.confirmBox.hidden = true;
    this.root.append(this.cardBox, this.whoBox, this.confirmBox);
    host.appendChild(this.root);
  }

  /** Modèle de vue de la dernière fiche montrée (tests, intégration). */
  get current(): CardView | null {
    return this.view;
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.offs.push(() => target.removeEventListener(type, fn));
  }

  private setMode(mode: 'card' | 'who' | 'confirm'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.cardBox.hidden = mode !== 'card';
    this.whoBox.hidden = mode !== 'who';
    this.confirmBox.hidden = mode !== 'confirm';
    if (mode !== 'who') this.whoSignature = '';
    else {
      // nouvelle liste : aucune case cochée d'une ouverture précédente
      this.ticks = new Set();
      this.ticksFromScreen = '#';
    }
    if (mode !== 'card') {
      this.signature = '';
      this.hovered = -1;
    }
  }

  // ───────────── S1 : la fiche ─────────────

  show(card: Card, who: WhoCandidate | null, line: number, sentence: { what: string; rule: string }, compact: boolean, extra?: CardShowExtra): void {
    this.setMode('card');
    this.sentBox.hidden = true;
    const v = cardView(card, who, line, sentence, compact, extra);
    const identity = `${card.repere.key}|${v.othersOpen ? 'o' : 'l'}|${v.rows.map((r) => r.label).join('|')}`;
    if (identity !== this.identity) {
      this.identity = identity;
      this.armed = -1;
    }
    this.view = v;
    if (this.root.classList.contains('is-compact') !== compact) this.root.classList.toggle('is-compact', compact);
    const sig = JSON.stringify(v);
    if (sig === this.signature) return;
    this.signature = sig;
    this.renderCard(v);
  }

  /** Onglets des repères empilés sous le pointeur (« Rue Royale | Foule »). */
  private stackTabs(v: CardView): HTMLElement {
    const tabs = node('div', 'cc-tabs');
    v.tabs.forEach((t, i) => {
      const b = btn('cc-btn cc-tab' + (t.on ? ' is-on' : ''), `card-tab-${i}`, t.name);
      b.setAttribute('aria-pressed', t.on ? 'true' : 'false');
      this.listen(b, 'click', (e) => {
        e.stopPropagation();
        this.onStack?.(i);
      });
      tabs.appendChild(b);
    });
    return tabs;
  }

  private renderCard(v: CardView): void {
    // ── en-tête ──
    const head = this.cardHead;
    clear(head);
    const top = node('div', 'cc-top');
    // téléphone : les repères empilés prennent la place du titre, sur la même rangée (l'onglet surligné nomme le lieu),
    // pour que les six lignes et « Donner l'ordre » tiennent dans les 390 px sans défiler
    const tabsInTop = v.compact && v.tabs.length > 1;
    top.appendChild(tabsInTop ? this.stackTabs(v) : node('h2', 'cc-title', v.title));
    if (v.position !== '') {
      const pos = node('span', 'cc-pos');
      const prev = btn('cc-btn', 'card-prev', '‹');
      prev.title = 'Endroit précédent (←)';
      prev.setAttribute('aria-label', 'Endroit précédent');
      const next = btn('cc-btn', 'card-next', '›');
      next.title = 'Endroit suivant (→)';
      next.setAttribute('aria-label', 'Endroit suivant');
      this.listen(prev, 'click', (e) => {
        e.stopPropagation();
        this.onCandidate?.(-1);
      });
      this.listen(next, 'click', (e) => {
        e.stopPropagation();
        this.onCandidate?.(1);
      });
      pos.append(prev, node('span', 'cc-pos-t', v.position), next);
      top.appendChild(pos);
    }
    if (v.compact) {
      const x = btn('cc-btn is-small cc-x', 'card-back', '✕');
      x.title = 'Retour';
      x.setAttribute('aria-label', 'Retour');
      this.listen(x, 'click', (e) => {
        e.stopPropagation();
        this.onBack?.();
      });
      top.appendChild(x);
    }
    head.appendChild(top);
    if (!tabsInTop && v.tabs.length > 1) head.appendChild(this.stackTabs(v));
    if (v.sticky !== '') head.appendChild(node('div', 'cc-sticky', v.sticky));
    if (!v.compact) {
      if (v.sub !== '') head.appendChild(node('div', 'cc-subl', v.sub));
      if (v.notes.length > 0) {
        const notes = node('div', 'cc-notes');
        for (const n of v.notes) notes.appendChild(node('div', 'cc-note' + (/^⚠/.test(n) ? ' is-warn' : ''), n));
        head.appendChild(notes);
      }
    } else if (v.sub !== '') head.title = v.sub;

    // ── lignes ──
    const list = this.list;
    clear(list);
    if (v.othersOpen) list.appendChild(node('div', 'cc-cap', OTHERS_LABEL));
    for (const r of v.rows) list.appendChild(this.rowNode(r));
    if (v.rows.length === 0) {
      list.appendChild(node('div', 'cc-empty', v.notes.length > 0 || v.sub !== '' ? 'Aucun ordre à donner ici.' : 'Rien à faire ici.'));
    }

    // ── Qui, phrase, pied ──
    const tail = this.tail;
    clear(tail);
    const w = v.who;
    if (w && !v.compact) {
      const box = node('div', 'cc-who');
      const name = node('button', 'cc-who-name');
      name.type = 'button';
      name.tabIndex = -1;
      name.setAttribute('tabindex', '-1');
      name.dataset.id = 'card-who';
      name.append(node('b', undefined, w.text), node('span', undefined, w.detail));
      if (w.canList) {
        name.title = 'Choisir dans la liste (Maj+Entrée)';
        this.listen(name, 'click', (e) => {
          e.stopPropagation();
          this.onWhoList?.();
        });
      } else name.disabled = true;
      box.appendChild(name);
      if (w.next || w.whole) {
        const btns = node('div', 'cc-who-btns');
        if (w.next) {
          const b = btn('cc-btn', 'card-who-next', NEXT_UNIT_LABEL, 'U');
          b.title = 'Unité suivante (U ; Maj+U : précédente)';
          this.listen(b, 'click', (e) => {
            e.stopPropagation();
            this.onWhoNext?.(1);
          });
          btns.appendChild(b);
        }
        if (w.whole) {
          const b = btn('cc-btn' + (w.whole.on ? ' is-on' : ''), 'card-who-all', w.whole.label, 'T');
          b.setAttribute('aria-pressed', w.whole.on ? 'true' : 'false');
          b.title = w.whole.on ? 'Revenir à l’unité proposée (T)' : `${w.whole.label} (T)`;
          this.listen(b, 'click', (e) => {
            e.stopPropagation();
            this.onWhoAll?.();
          });
          btns.appendChild(b);
        }
        box.appendChild(btns);
      }
      tail.appendChild(box);
    }
    if (!v.compact && v.sentence !== '') tail.appendChild(node('div', 'cc-say', v.sentence));
    if (!v.compact && v.rule !== '') tail.appendChild(node('div', 'cc-rule', v.rule));
    const foot = node('div', 'cc-foot');
    if (v.compact) {
      if (w) {
        const wq = node('div', 'cc-wq');
        wq.appendChild(node('b', undefined, `Qui : ${w.short}`));
        if (w.canList) {
          const open = btn('cc-btn is-small', 'card-who', '▸');
          open.title = 'Choisir l’unité';
          open.setAttribute('aria-label', 'Choisir l’unité');
          this.listen(open, 'click', (e) => {
            e.stopPropagation();
            this.onWhoList?.();
          });
          wq.appendChild(open);
        }
        foot.appendChild(wq);
      }
      if (v.canSend) foot.appendChild(this.sendButton(false));
    } else {
      if (v.canSend) foot.appendChild(this.sendButton(true));
      const back = btn('cc-btn', 'card-back', BACK_LABEL, 'Échap');
      this.listen(back, 'click', (e) => {
        e.stopPropagation();
        this.onBack?.();
      });
      foot.appendChild(back);
    }
    if (foot.firstChild) tail.appendChild(foot);
    if (v.hint !== '') tail.appendChild(node('div', 'cc-hint', v.hint));
  }

  private sendButton(withKey: boolean): HTMLButtonElement {
    const b = btn('cc-btn is-primary', 'card-send', SEND_LABEL, withKey ? '⏎' : undefined);
    this.listen(b, 'click', (e) => {
      e.stopPropagation();
      this.armed = -1;
      this.onSend?.();
    });
    return b;
  }

  private rowNode(r: CardRowView): HTMLButtonElement {
    const b = node('button', 'cc-row' + (r.highlighted ? ' is-on' : '') + (r.mark === '🔒' ? ' is-locked' : '') + (r.others ? ' is-others' : ''));
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('tabindex', '-1');
    b.dataset.id = `card-line-${r.n >= 0 ? r.n : 'x' + r.index}`;
    if (r.highlighted) b.setAttribute('aria-current', 'true');
    b.appendChild(node('span', 'cc-mk', r.highlighted ? '▶' : ''));
    b.appendChild(node('span', 'cc-n', r.n >= 0 ? String(r.n) : ''));
    const ic = node('span', 'cc-ic');
    if (r.icon !== '') ic.innerHTML = iconMarkup(r.icon, 'cc-svg');
    b.appendChild(ic);
    const tx = node('span', 'cc-tx');
    tx.appendChild(node('span', 'cc-lab', r.label));
    const exp = node('span', 'cc-exp');
    if (r.explain !== '') exp.appendChild(node('span', 'cc-exp-t', r.explain));
    if (r.markText !== '') exp.appendChild(node('span', r.mark === '🔒' ? 'cc-lock' : 'cc-law', (r.explain !== '' ? ' · ' : '') + r.markText));
    exp.hidden = !r.showExplain || (r.explain === '' && r.markText === '');
    tx.appendChild(exp);
    b.appendChild(tx);
    if (r.mark !== '') {
      const m = node('span', 'cc-mark', r.mark);
      m.title = r.markText;
      b.appendChild(m);
    }
    b.title = [r.explain, r.markText].filter((s) => s !== '').join(' — ');
    if (r.others) {
      this.listen(b, 'click', (e) => {
        e.stopPropagation();
        this.onOthers?.();
      });
      return b;
    }
    const i = r.index;
    const enter = (e: Event): void => {
      if (pointerTypeOf(e) === 'touch') return;
      this.hover(i);
    };
    this.listen(b, 'pointerenter', enter);
    this.listen(b, 'pointermove', enter);
    this.listen(b, 'click', (e) => {
      e.stopPropagation();
      this.lineClick(i, pointerTypeOf(e) || this.downType);
    });
    return b;
  }

  private hover(i: number): void {
    if (this.hovered === i) return;
    this.hovered = i;
    this.onLineHover?.(i);
  }

  /** Clic sur une ligne : au doigt, le premier toucher surligne et le second envoie ; au pointeur, le clic envoie. */
  private lineClick(i: number, pointerType: string): void {
    if (pointerType === 'touch') {
      if (this.armed === i) {
        this.armed = -1;
        this.onSend?.(i);
        return;
      }
      this.armed = i;
      this.onLineTap?.(i);
      return;
    }
    this.armed = -1;
    this.onSend?.(i);
  }

  // ───────────── S2 : qui envoyer ? ─────────────

  showWho(list: WhoCandidate[], highlighted = 0, ticked: readonly number[] = []): void {
    this.setMode('who');
    // les cochées de l'écran (Espace) remplacent les nôtres quand elles changent ; sinon on garde les clics
    const fromScreen = ticked.slice().sort((a, b) => a - b).join(',');
    if (fromScreen !== this.ticksFromScreen || list.length !== this.whoCount) {
      this.ticksFromScreen = fromScreen;
      this.ticks = new Set(ticked.filter((i) => i >= 0 && i < list.length));
    }
    this.whoCount = list.length;
    this.whoHighlighted = highlighted;
    const rows = whoRows(list, highlighted, this.ticks);
    const sig = JSON.stringify(rows);
    if (sig === this.whoSignature) return;
    this.whoSignature = sig;
    const box = this.whoBox;
    clear(box);
    this.whoTicks = [];
    const head = node('div', 'cc-head');
    const top = node('div', 'cc-top');
    top.appendChild(node('h2', 'cc-title', 'Qui envoyer ?'));
    top.appendChild(node('span', 'cc-pos', 'les plus adaptées d’abord'));
    head.appendChild(top);
    box.appendChild(head);
    const body = node('div', 'cc-list');
    if (rows.length === 0) body.appendChild(node('div', 'cc-empty', 'Aucune unité ne peut recevoir cet ordre.'));
    rows.forEach((r, i) => {
      if (r.stationHead) body.appendChild(node('div', 'cc-cap', 'Renforts des commissariats'));
      const row = node('button', 'cc-qrow' + (r.highlighted ? ' is-on' : ''));
      row.type = 'button';
      row.tabIndex = -1;
      row.setAttribute('tabindex', '-1');
      row.dataset.id = `who-row-${r.n}`;
      if (r.highlighted) row.setAttribute('aria-current', 'true');
      row.appendChild(node('span', 'cc-mk', r.highlighted ? '▶' : ''));
      row.appendChild(node('span', 'cc-n', r.n <= 9 ? String(r.n) : ''));
      const tick = node('span', 'cc-tick' + (r.ticked ? ' is-on' : ''), r.ticked ? '✓' : '');
      tick.dataset.id = `who-tick-${r.n}`;
      tick.setAttribute('role', 'checkbox');
      tick.setAttribute('aria-checked', r.ticked ? 'true' : 'false');
      tick.title = 'Cocher pour en envoyer plusieurs (Espace)';
      this.listen(tick, 'click', (e) => {
        e.stopPropagation();
        this.toggleTick(i);
      });
      row.appendChild(tick);
      this.whoTicks.push(tick);
      const tx = node('span', 'cc-tx');
      tx.append(node('span', 'cc-lab', r.label), node('span', 'cc-exp', r.detail));
      row.appendChild(tx);
      if (r.proposed) row.appendChild(node('span', 'cc-ok', '✓ proposée'));
      this.listen(row, 'click', (e) => {
        e.stopPropagation();
        this.onWhoPick?.([i]);
      });
      body.appendChild(row);
    });
    box.appendChild(body);
    const foot = node('div', 'cc-foot');
    const ok = btn('cc-btn is-primary', 'who-ok', 'Valider', '⏎');
    if (rows.length === 0) ok.disabled = true;
    this.listen(ok, 'click', (e) => {
      e.stopPropagation();
      this.validateWho();
    });
    const back = btn('cc-btn', 'card-back', BACK_LABEL, 'Échap');
    this.listen(back, 'click', (e) => {
      e.stopPropagation();
      this.onBack?.();
    });
    foot.append(ok, back);
    box.appendChild(foot);
    box.appendChild(node('div', 'cc-hint', 'Espace : cocher plusieurs · Entrée : valider'));
  }

  private toggleTick(i: number): void {
    if (this.ticks.has(i)) this.ticks.delete(i);
    else this.ticks.add(i);
    // la case change sur place ; la prochaine image de l'écran reconstruit la liste avec nos cochées
    this.whoSignature = '';
    this.whoTicks.forEach((t, n) => {
      const on = this.ticks.has(n);
      t.classList.toggle('is-on', on);
      t.textContent = on ? '✓' : '';
      t.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /** « Valider » : les rangées cochées, sinon la rangée surlignée. */
  private validateWho(): void {
    const picked = Array.from(this.ticks).filter((i) => i >= 0 && i < this.whoCount).sort((a, b) => a - b);
    if (picked.length > 0) this.onWhoPick?.(picked);
    else if (this.whoCount > 0) this.onWhoPick?.([Math.min(Math.max(0, this.whoHighlighted), this.whoCount - 1)]);
  }

  // ───────────── S3 : confirmation légale ─────────────

  showConfirm(model: CardConfirmModel): void {
    this.setMode('confirm');
    const box = this.confirmBox;
    clear(box);
    const head = node('div', 'cc-head');
    const top = node('div', 'cc-top');
    top.appendChild(node('h2', 'cc-title', model.title));
    head.appendChild(top);
    box.appendChild(head);
    const body = node('div', 'cc-cf');
    const btns = node('div', 'cc-cf-btns');
    if (model.coercive) {
      // ⚖ : permis, mais avant la dernière sommation
      body.appendChild(node('div', 'cc-warn', BEFORE_LAST_TEXT));
      const go = btn('cc-btn is-primary', 'card-confirm', ANYWAY_LABEL, '⏎');
      this.listen(go, 'click', (e) => {
        e.stopPropagation();
        this.onConfirm?.('anyway');
      });
      const first = btn('cc-btn', 'card-confirm-sommations', SOMMATIONS_FIRST_LABEL);
      this.listen(first, 'click', (e) => {
        e.stopPropagation();
        this.onConfirm?.('sommations');
      });
      btns.append(go, first);
    } else if (model.reason !== '') {
      // impossible : la raison en une ligne, et seulement « ‹ Retour » (chef de groupe : la demande par radio en plus)
      body.appendChild(node('div', 'cc-warn', model.reason));
      if (model.request) {
        const ask = btn('cc-btn is-primary', 'card-confirm-request', REQUEST_FORCE_LABEL, '⏎');
        this.listen(ask, 'click', (e) => {
          e.stopPropagation();
          this.onConfirm?.('request');
        });
        btns.appendChild(ask);
      }
    } else {
      if (model.steps.length > 0) {
        body.appendChild(node('div', 'cc-cf-intro', STEPS_INTRO));
        const ol = node('ol', 'cc-steps');
        model.steps.forEach((s, i) => {
          const li = node('li', 'cc-step');
          li.append(node('i', undefined, STEP_NUMBERS[i] ?? `${i + 1}.`), node('span', undefined, s.label));
          ol.appendChild(li);
        });
        body.appendChild(ol);
      }
      if (model.canChain) {
        const go = btn('cc-btn is-primary', 'card-confirm', CHAIN_LABEL, '⏎');
        this.listen(go, 'click', (e) => {
          e.stopPropagation();
          this.onConfirm?.('chain');
        });
        btns.appendChild(go);
      } else body.appendChild(node('div', 'cc-warn', MANUAL_TEXT));
    }
    const back = btn('cc-btn', 'card-back', BACK_LABEL, 'Échap');
    this.listen(back, 'click', (e) => {
      e.stopPropagation();
      this.onBack?.();
    });
    btns.appendChild(back);
    body.appendChild(btns);
    box.appendChild(body);
  }

  // ───────────── S4 : ordre donné ─────────────

  /** En-tête vert « ✓ ORDRE DONNÉ — … » sur la fiche ; `undo` : « Annuler l'ordre X ». Une ligne par « \n ». */
  showSent(text: string, undo: boolean): void {
    if (this.mode !== 'card') this.setMode('card');
    const lines = text.split('\n').map((s) => s.trim()).filter((s) => s !== '');
    const first = lines.shift() ?? '';
    // un texte qui porte déjà son en-tête (« ✓ ÉTAPES LANCÉES — … » de la chaîne légale) le garde tel quel
    const title = first.startsWith('✓') ? first : first !== '' ? `${SENT_PREFIX} — ${first}` : SENT_PREFIX;
    if (this.sentText.textContent !== title) this.sentText.textContent = title;
    const detail = lines.join(' · ');
    if (this.sentDetail.textContent !== detail) this.sentDetail.textContent = detail;
    this.sentDetail.hidden = detail === '';
    this.undoBtn.hidden = !undo;
    this.sentBox.hidden = false;
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    if (this.root.parentNode === this.host) this.host.removeChild(this.root);
  }
}
