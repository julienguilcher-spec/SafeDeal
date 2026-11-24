/* =====================================================================================
 * Entrées — libellés français des touches, boutons de souris et boutons de manette.
 *
 * Les affectations désignent des touches PHYSIQUES (KeyboardEvent.code) : « KeyW » est la touche
 * en haut à gauche du pavé de lettres, marquée Z sur un clavier AZERTY et W sur un QWERTY.
 * Pour afficher la bonne lettre, on part d'une disposition supposée (AZERTY pour un navigateur
 * en français de France ou de Belgique), corrigée par ce que le navigateur sait (API
 * Keyboard.getLayoutMap, Chromium seulement) puis par ce qu'on constate à chaque frappe.
 * Aucun accès au DOM dans ce fichier : le système lui fournit ce qu'il apprend.
 * ===================================================================================== */

import type { KeyboardLayout, PadStyle } from './api';

/** Lettres et signes qui changent de place par rapport au QWERTY américain. */
const AZERTY: Readonly<Record<string, string>> = {
  KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyZ: 'W', Semicolon: 'M', KeyM: ',',
  Comma: ';', Period: ':', Slash: '!', Quote: 'ù', BracketLeft: '^', BracketRight: '$',
  Backquote: '²', Minus: ')', Equal: '=', Backslash: '*', IntlBackslash: '<',
};
const QWERTZ: Readonly<Record<string, string>> = { KeyY: 'Z', KeyZ: 'Y' };
const QWERTY_SIGNS: Readonly<Record<string, string>> = {
  Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: '\'', BracketLeft: '[', BracketRight: ']',
  Backquote: '`', Minus: '-', Equal: '=', Backslash: '\\', IntlBackslash: '<',
};

/** Touches nommées. */
const NAMED: Readonly<Record<string, string>> = {
  Space: 'Espace', Enter: 'Entrée', NumpadEnter: 'Entrée (pavé)', Escape: 'Échap', Tab: 'Tab',
  // ⌫ : le signe gravé sur la touche d'un Mac (« delete ») comme sur celle d'un PC (« Retour arrière »)
  Backspace: '⌫', Delete: 'Suppr', Insert: 'Inser', Home: 'Début', End: 'Fin',
  PageUp: 'Page préc.', PageDown: 'Page suiv.', CapsLock: 'Verr. maj',
  ShiftLeft: 'Maj', ShiftRight: 'Maj droite', ControlLeft: 'Ctrl', ControlRight: 'Ctrl droite',
  AltLeft: 'Alt', AltRight: 'Alt Gr', MetaLeft: 'Méta', MetaRight: 'Méta droite', ContextMenu: 'Menu',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  NumpadAdd: 'Pavé +', NumpadSubtract: 'Pavé −', NumpadMultiply: 'Pavé ×', NumpadDivide: 'Pavé ÷',
  NumpadDecimal: 'Pavé .', NumLock: 'Verr. num', ScrollLock: 'Arrêt défil', Pause: 'Pause', PrintScreen: 'Impr. écran',
  Mouse0: 'Clic gauche', Mouse1: 'Clic molette', Mouse2: 'Clic droit', Mouse3: 'Souris 4', Mouse4: 'Souris 5',
  WheelUp: 'Molette ↑', WheelDown: 'Molette ↓',
};

/**
 * Libellé d'une touche lue avec la touche Maj (« Maj+Entrée » : la ligne « autre » des ordres directs, « Maj+U » : à
 * qui, à l'envers) — la même forme partout (bloc d'ordres, aide, réaffectation). Libellé vide : vide.
 */
export function withShift(label: string): string {
  return label === '' ? '' : `Maj+${label}`;
}

/** Devine la disposition du clavier d'après les langues du navigateur. */
export function guessKeyboardLayout(languages: readonly string[]): KeyboardLayout {
  for (let i = 0; i < languages.length; i++) {
    const lang = languages[i]!.toLowerCase();
    if (lang === 'fr-ca') return 'qwerty';              // Canada français : base QWERTY
    if (lang === 'fr-ch' || lang.startsWith('de')) return 'qwertz';
    if (lang === 'fr' || lang.startsWith('fr-') || lang === 'nl-be') return 'azerty';
    if (lang.startsWith('en') || lang.startsWith('es') || lang.startsWith('it') || lang.startsWith('pt') || lang.startsWith('nl')) return 'qwerty';
  }
  // Jeu en français, public français : sans indication, AZERTY.
  return 'azerty';
}

export class KeyLabels {
  layout: KeyboardLayout;
  /** Incrémenté quand un libellé appris change. */
  version = 1;
  /** Ce que le navigateur ou les frappes nous ont appris : code → caractère affiché. */
  private readonly learned = new Map<string, string>();

  constructor(layout: KeyboardLayout = 'azerty') {
    this.layout = layout;
  }

  setLayout(layout: KeyboardLayout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.version++;
  }

  /**
   * Apprend le caractère réellement produit par une touche (frappe sans Ctrl/Alt, ou carte de
   * disposition du navigateur). Seuls les caractères imprimables isolés sont retenus.
   */
  learn(code: string, key: string): void {
    if (!code || key.length !== 1 || key === ' ') return;
    if (!(code.startsWith('Key') || code in QWERTY_SIGNS)) return;   // chiffres et pavé : on garde nos libellés
    const label = key.toUpperCase();
    if (label.length !== 1) return;                                   // « ß » → « SS » : on ignore
    if (this.learned.get(code) === label) return;
    this.learned.set(code, label);
    this.version++;
    // Les lettres apprises renseignent aussi sur la disposition d'ensemble.
    if (code === 'KeyW' || code === 'KeyQ' || code === 'KeyA' || code === 'KeyZ' || code === 'KeyY') this.inferLayout();
  }

  private inferLayout(): void {
    const w = this.learned.get('KeyW');
    const q = this.learned.get('KeyQ');
    const a = this.learned.get('KeyA');
    const z = this.learned.get('KeyZ');
    const y = this.learned.get('KeyY');
    if (w === 'Z' || q === 'A' || a === 'Q' || z === 'W') this.layout = 'azerty';
    else if (y === 'Z' || z === 'Y') this.layout = 'qwertz';
    else if (w === 'W' || q === 'Q' || a === 'A' || (z === 'Z' && y !== 'Z')) this.layout = 'qwerty';
  }

  /** Libellé d'un code de clavier ou de souris. */
  label(code: string): string {
    const named = NAMED[code];
    if (named !== undefined) return named;
    const learned = this.learned.get(code);
    if (learned !== undefined) return learned;
    if (this.layout === 'azerty') {
      const k = AZERTY[code];
      if (k !== undefined) return k;
    } else if (this.layout === 'qwertz') {
      const k = QWERTZ[code];
      if (k !== undefined) return k;
    }
    if (code.length === 4 && code.startsWith('Key')) return code.charAt(3);
    if (code.length === 6 && code.startsWith('Digit')) return code.charAt(5);
    if (code.length === 7 && code.startsWith('Numpad')) return 'Pavé ' + code.charAt(6);
    if (/^F\d{1,2}$/.test(code)) return code;
    const sign = QWERTY_SIGNS[code];
    if (sign !== undefined) return sign;
    return code;
  }

  /** Libellé des quatre touches de déplacement, collées si ce sont des lettres (« ZQSD »). */
  moveLabel(forward: string, left: string, back: string, right: string): string {
    const parts = [forward, left, back, right].map((c) => (c ? this.label(c) : ''));
    if (parts.every((p) => p === '↑' || p === '↓' || p === '←' || p === '→')) return 'Flèches';
    if (parts.every((p) => p.length === 1)) return parts.join('');
    return parts.filter((p) => p).join(' ');
  }
}

// ───────────────────────────── manette ─────────────────────────────

// Gravures des trois grandes familles de manettes (indices du mapping standard, 0 = bouton du bas).
// Les familles portent des noms neutres : aucune marque n'est affichée dans le jeu.
const PAD_LETTRES: readonly string[] = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', 'Croix ↑', 'Croix ↓', 'Croix ←', 'Croix →', 'Accueil',
];
const PAD_FORMES: readonly string[] = [
  '✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'Croix ↑', 'Croix ↓', 'Croix ←', 'Croix →', 'Accueil',
];
const PAD_LETTRES_INVERSEES: readonly string[] = [
  'B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', 'Croix ↑', 'Croix ↓', 'Croix ←', 'Croix →', 'Accueil',
];

/**
 * Famille d'une manette d'après son identifiant (Gamepad.id, qui contient le nom du constructeur
 * ou ses codes USB) : « formes » (✕ ○ □ △), « lettres_inversees » (A à droite, B en bas) ou,
 * par défaut, « lettres » (A en bas, B à droite).
 */
export function detectPadStyle(id: string): PadStyle {
  const s = id.toLowerCase();
  if (/054c|sony|dualshock|dualsense|playstation|ps[345]/.test(s)) return 'formes';
  if (/057e|nintendo|switch|joy-?con|pro controller/.test(s)) return 'lettres_inversees';
  return 'lettres';
}

/** Libellé d'un bouton de manette (« B2 » → « X », « □ » ou « Y » selon la famille). */
export function padLabel(code: string, style: PadStyle): string {
  if (code.charAt(0) !== 'B') return code;
  const n = Number(code.slice(1));
  if (!(n >= 0 && n <= 16) || (n | 0) !== n) return code;
  const table = style === 'formes' ? PAD_FORMES : style === 'lettres_inversees' ? PAD_LETTRES_INVERSEES : PAD_LETTRES;
  return table[n]!;
}

/** Nom lisible d'une manette : l'identifiant donné par le navigateur, sans ses codes USB. */
export function padDisplayName(id: string): string {
  let name = id.replace(/\(.*?(vendor|vid|product|pid|standard gamepad).*?\)/gi, '').replace(/\s+/g, ' ').trim();
  name = name.replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim();
  if (name.length > 40) name = name.slice(0, 39).trimEnd() + '…';
  return name || 'Manette';
}
