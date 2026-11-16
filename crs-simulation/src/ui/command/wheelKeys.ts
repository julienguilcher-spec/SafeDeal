/* =====================================================================================
 * Roues d'ordres au clavier (sans souris : Mac portable) — logique pure, sans DOM.
 *
 *   1 … 9 puis 0 : secteurs 1 à 10, dans le sens horaire à partir du haut ; « ) » et « - » (touches physiques à
 *                  droite du 0, codes Minus et Equal) : secteurs 11 et 12 ;
 *   flèches      : le surlignage se déplace vers le secteur voisin qui va dans la direction demandée (sans
 *                  surlignage, la flèche désigne le secteur placé dans cette direction) ;
 *   Entrée       : valide le secteur surligné ; Échap ou ⌫ : referme la roue (retour arrière du socle).
 * Sert à la roue d'ordres en vue de jeu et à l'ordre rapide de la carte tactique.
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
