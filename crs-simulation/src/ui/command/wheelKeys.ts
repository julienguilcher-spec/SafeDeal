/* =====================================================================================
 * Roues d'ordres au clavier (sans souris : Mac portable) — logique pure, sans DOM.
 *
 *   1 … 8        : secteurs numérotés de la roue d'ordres (sens horaire à partir du haut) ; le numéro d'un secteur
 *                  est le même pour tous les rôles (« F puis 1 » = « Suivez-moi à pied » pour le commandant comme
 *                  pour le CRS, dont la roue réduite n'a que les secteurs 1, 2 et 7) ; couronne intérieure
 *                  (« Secours ici », « Plus… ») : 1 … n ; pavé numérique compris ;
 *   flèches      : le surlignage se déplace vers le secteur voisin qui va dans la direction demandée (sans
 *                  surlignage, la flèche désigne le secteur placé dans cette direction) ;
 *   Entrée       : valide le secteur surligné ; Échap ou ⌫ : couronne intérieure → roue, roue → fermée.
 * `wheelKeyIndex` (touche → rang, 1…9, 0, puis « ) » et « - ») reste la règle des menus radiaux sans numéros propres.
 * ===================================================================================== */

export type WheelDir = 'up' | 'down' | 'left' | 'right';

/** Codes physiques (KeyboardEvent.code) des secteurs, dans l'ordre. */
export const WHEEL_KEY_CODES: readonly string[] = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal',
];

/** Légende affichée sous la roue au clavier. */
export const WHEEL_KEYS_LEGEND = 'Chiffres, ou flèches puis Entrée';

/** Secteur choisi par une touche (pavé numérique compris) ; -1 si la touche ne choisit rien. */
export function wheelKeyIndex(code: string, count: number): number {
  let c = code;
  if (c.startsWith('Numpad') && c.length === 7 && c[6]! >= '0' && c[6]! <= '9') c = 'Digit' + c[6];
  const i = WHEEL_KEY_CODES.indexOf(c);
  return i >= 0 && i < count ? i : -1;
}

/** Chiffre porté par une touche (Digit0…9, Numpad0…9 : codes physiques, sans Maj en AZERTY) ; -1 sinon. */
export function keyDigit(code: string): number {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return m ? Number(m[1]) : -1;
}

/** Touche que la roue d'ordres prend pour elle (chiffres, pavé numérique, « ) » et « - ») : jamais transmise au jeu. */
export function isWheelKeyCode(code: string): boolean {
  return keyDigit(code) >= 0 || code === 'Minus' || code === 'Equal';
}

/**
 * Secteur d'une roue numérotée : `keys[i]` est le numéro (1…9) du secteur i, celui qui est imprimé dessus. -1 si la
 * touche ne correspond à aucun secteur (la roue réduite du CRS n'a que 1, 2 et 7 : 3 ne choisit rien).
 */
export function wheelSectorIndex(code: string, keys: readonly number[]): number {
  const d = keyDigit(code);
  return d > 0 ? keys.indexOf(d) : -1;
}

/** Libellé de repli de la touche d'un secteur (avant que la disposition du clavier soit connue). */
export function wheelKeyFallbackLabel(index: number): string {
  const code = WHEEL_KEY_CODES[index];
  if (!code) return '';
  return code.startsWith('Digit') ? code.slice(5) : code === 'Minus' ? ')' : '-';
}

/**
 * Libellé de la touche d'un secteur : les chiffres tels quels (sur AZERTY, ils sont imprimés sur la touche),
 * les deux touches suivantes d'après la disposition du clavier (`label`, service « input.labels ») si on la connaît.
 */
export function wheelKeyLabel(index: number, label?: (code: string) => string): string {
  const code = WHEEL_KEY_CODES[index];
  if (!code) return '';
  if (code.startsWith('Digit') || !label) return wheelKeyFallbackLabel(index);
  let l = '';
  try {
    l = label(code);
  } catch {
    l = '';
  }
  return l !== '' ? l : wheelKeyFallbackLabel(index);
}

const DIR_VEC: Readonly<Record<WheelDir, readonly [number, number]>> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

/** Projection du centre du secteur i (écran : x à droite, y vers le bas ; secteur 0 en haut) sur une direction. */
function along(i: number, count: number, dir: WheelDir): number {
  const a = (i * Math.PI * 2) / count;
  const v = DIR_VEC[dir];
  return Math.sin(a) * v[0] - Math.cos(a) * v[1];
}

/**
 * Secteur surligné après une flèche. Sans surlignage : le secteur placé dans cette direction. Sinon : le voisin
 * (sens horaire ou antihoraire) qui va le plus dans cette direction ; à égalité, le sens horaire ; si aucun voisin
 * ne va dans cette direction (déjà au bout), le surlignage ne bouge pas.
 */
export function wheelArrowStep(highlighted: number, dir: WheelDir, count: number): number {
  if (count <= 0) return -1;
  if (highlighted < 0 || highlighted >= count) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < count; i++) {
      const s = along(i, count, dir);
      if (s > bestScore + 1e-9) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }
  if (count === 1) return highlighted;
  const here = along(highlighted, count, dir);
  const cw = (highlighted + 1) % count;
  const ccw = (highlighted - 1 + count) % count;
  const sCw = along(cw, count, dir);
  const sCcw = along(ccw, count, dir);
  const best = sCcw > sCw + 1e-9 ? ccw : cw;
  const sBest = best === cw ? sCw : sCcw;
  return sBest > here + 1e-9 ? best : highlighted;
}

/** Ce que les entrées d'une image demandent à la roue. */
export type WheelKeyAction =
  | { kind: 'choose'; index: number }
  | { kind: 'highlight'; index: number }
  | null;

/** Sous-ensemble des entrées lu par la roue. */
export interface WheelKeyInput {
  pressed(b: 'ui_up' | 'ui_down' | 'ui_left' | 'ui_right'): boolean;
}

/**
 * Traduit les entrées d'une image : `digit` = code de la dernière touche de secteur tapée (ou ''), puis les flèches
 * (clavier seulement : à la manette, la croix directionnelle porte aussi « Ordres » et le stick choisit déjà).
 */
export function wheelKeyAction(highlighted: number, count: number, digit: string, input: WheelKeyInput, arrows: boolean): WheelKeyAction {
  if (digit !== '') {
    const i = wheelKeyIndex(digit, count);
    if (i >= 0) return { kind: 'choose', index: i };
  }
  if (!arrows) return null;
  let h = highlighted;
  let moved = false;
  const dirs: readonly WheelDir[] = ['up', 'down', 'left', 'right'];
  for (let k = 0; k < dirs.length; k++) {
    const d = dirs[k]!;
    if (input.pressed(('ui_' + d) as 'ui_up')) {
      h = wheelArrowStep(h, d, count);
      moved = true;
    }
  }
  return moved && h !== highlighted ? { kind: 'highlight', index: h } : null;
}
