/* =====================================================================================
 * Carte de commandement au clavier seul (Mac portable sans souris) — logique pure, sans DOM.
 *
 * Cinq idées (§5.1 du plan de la carte de commandement) : les lettres choisissent une intention ou un panneau, les
 * flèches disent OÙ (la visée saute d'un repère à l'autre ; Maj + flèches : visée libre), ↑↓ ou les chiffres disent
 * QUOI (dans une fiche), U dit QUI, Entrée envoie, Échap revient en arrière.
 *
 *   mapKey(code, maj, contexte)  touche physique (KeyboardEvent.code) → commande de l'écran ;
 *   backStep(état)               ce qu'Échap referme : liste → confirmation → « Autres ordres » → fiche (et intention)
 *                                → intention → carte au repos → (null) fermer la carte ;
 *   stickyNext                   intention « collante » (B, S, I) : candidat suivant après un envoi ;
 *   enterAllowed                 Entrée ignorée 0,6 s après un envoi (pas de double ordre sur une répétition).
 *
 * Les lettres sont lues sur KeyboardEvent.code et n'utilisent que des touches au même endroit en AZERTY et en QWERTY
 * (ni A, Q, Z, W, M) ; Y reste libre (carte d'appel du HUD, équipe « modes »).
 * ===================================================================================== */

import type { CommandLevel } from './api';
import type { IntentId } from './cardTypes';
import { INTENTS } from './intents';
import type { Direction } from './reperes';

/** Ce que la logique lit d'une unité de la carte (sous-ensemble de MapUnit). */
export interface KeyUnit {
  key: number;
  squadId: number;
  parentKey: number;
}

// ───────────────────────────── aide (H) ─────────────────────────────

/** Le modèle en deux phrases : montré à la première ouverture et en tête de l'aide (H). */
export const HELP_MODEL =
  'Dites ce que vous voulez faire (les six boutons du bas) ou montrez un endroit sur la carte : le jeu propose la bonne action et la bonne unité, et vous la dessine sur la carte. Entrée ou « Donner l’ordre » l’envoie, Échap revient en arrière.';

/** Texte exact de l'aide clavier (§5.1). */
export const HELP_TEXT =
  'Flèches : d’un endroit à l’autre (Maj : précis) · Entrée : que faire ici / envoyer · E B N D I S : envoyer, bloquer, encercler, disperser, interpeller, secours · 1 à 6 ou ↑↓ : choisir · U : autre unité · T : toute la compagnie · Espace : à traiter · L : loi et force · C : commissariats · O : plus · R : rechercher un lieu · G : moi · Échap : revenir · Tab : fermer';

/** L'aide, une idée par ligne (l'écran d'aide les empile). */
export const HELP_LINES: readonly string[] = HELP_TEXT.split(' · ');

/** Ligne d'indication sous la fiche (clavier seulement). */
export const CARD_HINT = '↑↓ autre action · ←→ autre endroit · U autre unité';

// ───────────────────────────── délais ─────────────────────────────

/** Entrée ignorée pendant ce délai après un envoi (s). */
export const ENTER_GUARD = 0.6;
/** « ✓ ORDRE DONNÉ » reste affiché (s). */
export const SENT_SECONDS = 2;
/** « Annuler l'ordre » (X) reste possible (s). */
export const UNDO_SECONDS = 5;

/** Entrée est-elle prise en compte à l'instant `now` (dernier envoi à `sentAt`) ? */
export function enterAllowed(now: number, sentAt: number): boolean {
  // (marge d'arrondi : 10,6 − 10,0 vaut 0,5999… en flottants)
  return !(now - sentAt < ENTER_GUARD - 1e-6);
}

// ───────────────────────────── touches ─────────────────────────────

/** Lettres que l'écran lit : toutes au même endroit en AZERTY et en QWERTY. */
export const SAFE_LETTERS: ReadonlySet<string> = new Set([
  'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyL', 'KeyN', 'KeyO', 'KeyP', 'KeyR', 'KeyS', 'KeyT',
  'KeyU', 'KeyV', 'KeyX',
]);

/** Touche de l'option des passants de l'ancien « Barrer la rue » : B est désormais « Bloquer une rue », dont la fiche
 * propose « Barrer la rue, passants admis » en ligne 2. Conservé pour les modules qui l'affichent encore. */
export const PASSERSBY_KEY = 'KeyB';
export const PASSERSBY_KEY_LABEL = 'B';

export type Sheet = 'none' | 'card' | 'qui' | 'confirm' | 'suivi' | 'more' | 'legal' | 'help';

/** Commande de l'écran produite par une touche. */
export type KeyCommand =
  | { kind: 'none' }
  | { kind: 'intent'; id: IntentId }
  /** Flèche simple : la visée saute (au repos), ligne ↑↓ / endroit ←→ (fiche), ↑↓ dans une liste. */
  | { kind: 'arrow'; dir: Direction }
  /** Maj + flèche : visée libre (le curseur de la carte s'en charge). */
  | { kind: 'freeArrow'; dir: Direction }
  | { kind: 'accept' }
  | { kind: 'whoList' }
  /** 1–6 : ligne ; 0 : « Autres ordres ici… » ; 7–9 : rangées des listes. */
  | { kind: 'digit'; n: number }
  | { kind: 'unit'; step: 1 | -1 }
  | { kind: 'whole' }
  | { kind: 'todo'; step: 1 | -1 }
  | { kind: 'legal' }
  | { kind: 'stations' }
  | { kind: 'more' }
  | { kind: 'search' }
  | { kind: 'me' }
  | { kind: 'journal' }
  | { kind: 'slow' }
  | { kind: 'help' }
  | { kind: 'undo' }
  | { kind: 'filter' }
  /** = / − : zoom (la carte le lit sur les commandes zoom_in / zoom_out). */
  | { kind: 'zoom'; step: 1 | -1 }
  /** Échap / ⌫ : retour (l'interface l'adresse à back() de l'écran). */
  | { kind: 'back' }
  /** Tab : fermer la carte (raccourci global de l'interface). */
  | { kind: 'close' };

export interface KeyContext {
  /** Étendue du commandement : en lecture seule, seules C, G, H, = −, Tab et Échap servent. */
  level: CommandLevel;
  /** Une fiche est ouverte (S1). */
  card: boolean;
}

const NONE: KeyCommand = { kind: 'none' };

const ARROWS: Readonly<Record<string, Direction>> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/** Chiffre d'une touche (rangée du haut ou pavé numérique ; sur AZERTY, `code` est le même sans Maj) ; −1 sinon. */
export function digitOf(code: string): number {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return m ? Number(m[1]) : -1;
}

/**
 * Commande d'une touche de la carte de commandement (§5.1). `shift` : Maj enfoncée. Une touche que l'écran n'utilise
 * pas donne { kind: 'none' } (elle n'est pas interceptée). P / Maj + P restent au HUD (proposition de l'adjoint).
 */
export function mapKey(code: string, shift: boolean, ctx: KeyContext): KeyCommand {
  const dir = ARROWS[code];
  const readOnly = ctx.level === 'lecture';
  if (code === 'Escape' || code === 'Backspace') return { kind: 'back' };
  if (code === 'Tab') return { kind: 'close' };
  if (code === 'Equal' || code === 'NumpadAdd') return { kind: 'zoom', step: 1 };
  if (code === 'Minus' || code === 'NumpadSubtract') return { kind: 'zoom', step: -1 };
  if (code === 'KeyC') return { kind: 'stations' };
  if (code === 'KeyG') return { kind: 'me' };
  if (code === 'KeyH') return { kind: 'help' };
  if (readOnly) return NONE;
  if (dir) return shift ? { kind: 'freeArrow', dir } : { kind: 'arrow', dir };
  if (code === 'Enter' || code === 'NumpadEnter') return shift ? { kind: 'whoList' } : { kind: 'accept' };
  if (code === 'Space') return { kind: 'todo', step: shift ? -1 : 1 };
  const d = digitOf(code);
  if (d >= 0) return { kind: 'digit', n: d };
  for (const i of INTENTS) if (i.code === code) return { kind: 'intent', id: i.id };
  switch (code) {
    case 'KeyU': return { kind: 'unit', step: shift ? -1 : 1 };
    case 'KeyT': return { kind: 'whole' };
    case 'KeyL': return { kind: 'legal' };
    case 'KeyO': return { kind: 'more' };
    case 'KeyR': return { kind: 'search' };
    case 'KeyJ': return { kind: 'journal' };
    case 'KeyV': return { kind: 'slow' };
    case 'KeyX': return { kind: 'undo' };
    case 'KeyF': return { kind: 'filter' };
    default: return NONE;
  }
}

// ───────────────────────────── retour (Échap) ─────────────────────────────

/** Ce qu'Échap regarde de l'état de l'écran. */
export interface BackView {
  sheet: Sheet;
  /** Une fiche est ouverte (avec, peut-être, « Autres ordres ici… » déplié). */
  card: boolean;
  othersOpen: boolean;
  intent: IntentId | null;
  /** « OÙ L'ENVOYER ? » : Qui fixé (unité d'un commissariat, « L'envoyer ailleurs… »), le lieu reste à choisir. */
  where: boolean;
}

/**
 * Un pas d'Échap : liste (Qui, Plus…, Cadre légal, Suivi, aide) → confirmation légale → « Autres ordres ici… » →
 * fiche (l'intention avec elle : « Échap : terminer ») → choix du lieu → intention → repos. null : rien à refermer
 * (l'écran se ferme).
 */
export function backStep(s: BackView): BackView | null {
  if (s.sheet === 'qui' || s.sheet === 'confirm') return { ...s, sheet: s.card ? 'card' : 'none' };
  if (s.sheet === 'more' || s.sheet === 'legal' || s.sheet === 'suivi' || s.sheet === 'help') return { ...s, sheet: s.card ? 'card' : 'none' };
  if (s.card && s.othersOpen) return { ...s, othersOpen: false };
  if (s.card) return { ...s, card: false, othersOpen: false, intent: null, where: false, sheet: 'none' };
  if (s.where) return { ...s, where: false };
  if (s.intent) return { ...s, intent: null };
  return null;
}

// ───────────────────────────── intention collante ─────────────────────────────

/** L'intention reste-t-elle active après un envoi (Bloquer une rue, Interpeller, Secours) ? */
export function isSticky(intent: IntentId | null): boolean {
  if (!intent) return false;
  return INTENTS.find((i) => i.id === intent)?.sticky === true;
}

/**
 * Après un envoi avec l'intention `intent`, sur le candidat `index` parmi `count` : l'indice du candidat suivant (la
 * visée y passe), ou −1 (retour au repos : intention non collante, ou plus de candidat).
 */
export function stickyNext(intent: IntentId | null, index: number, count: number): number {
  if (!isSticky(intent)) return -1;
  const next = index + 1;
  return next < count ? next : -1;
}

// ───────────────────────────── unités ─────────────────────────────

/** Unités que le joueur peut commander, dans l'ordre de l'arborescence. */
export function commandableUnits<U extends KeyUnit>(units: readonly U[], canCommand: (squadId: number) => boolean): U[] {
  const out: U[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.squadId !== 0 && canCommand(u.squadId)) out.push(u);
  }
  return out;
}

/**
 * Sections du dispositif : les unités commandables les plus hautes de l'arborescence ; s'il n'y en a qu'une (ma
 * compagnie, ma section), ce sont ses subordonnées directes commandables — un commandant obtient ainsi ses sections,
 * un chef de section ses groupes (candidats de la nasse, nasse.ts).
 */
export function keyboardSections<U extends KeyUnit>(units: readonly U[], canCommand: (squadId: number) => boolean): U[] {
  const cmd = commandableUnits(units, canCommand);
  const byKey = new Map<number, U>();
  for (let i = 0; i < cmd.length; i++) byKey.set(cmd[i]!.key, cmd[i]!);
  let level = cmd.filter((u) => !hasAncestorIn(u, byKey, units));
  for (let guard = 0; level.length === 1 && guard < 4; guard++) {
    const parent = level[0]!.key;
    const children = cmd.filter((u) => u.parentKey === parent);
    if (children.length === 0) break;
    level = children;
  }
  return level;
}

function hasAncestorIn<U extends KeyUnit>(u: U, set: ReadonlyMap<number, U>, all: readonly U[]): boolean {
  let parentKey = u.parentKey;
  for (let guard = 0; parentKey !== 0 && guard < 8; guard++) {
    if (set.has(parentKey)) return true;
    const p = all.find((x) => x.key === parentKey);
    parentKey = p ? p.parentKey : 0;
  }
  return false;
}

/** Index (0…8) d'une touche 1…9 (rangée du haut ou pavé numérique), −1 sinon. */
export function sectionKeyIndex(code: string): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
}

/**
 * Unité suivante (`step` = 1) ou précédente (−1) sous mes ordres, à partir de `current` (0 : aucune) ; on fait le
 * tour. Retourne 0 s'il n'y a aucune unité commandable.
 */
export function cycleUnitKey<U extends KeyUnit>(units: readonly U[], canCommand: (squadId: number) => boolean, current: number, step: 1 | -1): number {
  const cmd = commandableUnits(units, canCommand);
  if (cmd.length === 0) return 0;
  const at = cmd.findIndex((u) => u.key === current);
  if (at < 0) return step > 0 ? cmd[0]!.key : cmd[cmd.length - 1]!.key;
  return cmd[(at + step + cmd.length) % cmd.length]!.key;
}

/**
 * Mes unités pour U au repos : l'ordre le plus récent d'abord (celle à qui l'on vient de parler revient la première),
 * puis l'ordre de l'arborescence. `issuedAt` : instant de l'ordre en cours (−∞ sans ordre).
 */
export function unitsByRecentOrder<U extends KeyUnit>(units: readonly U[], issuedAt: (u: U) => number): U[] {
  return units
    .map((u, i) => ({ u, i, t: issuedAt(u) }))
    .sort((a, b) => (b.t === a.t ? a.i - b.i : b.t > a.t ? 1 : -1))
    .map((x) => x.u);
}
