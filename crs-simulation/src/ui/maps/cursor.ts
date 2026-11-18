/* =====================================================================================
 * Curseur des cartes au clavier et à la manette — logique pure, sans DOM.
 *
 * Manette : stick gauche. Clavier seul (Mac portable sans souris) : flèches (boutons « Menu : haut / bas /
 * gauche / droite »), Maj pour aller plus vite ; Entrée fait office de bouton du curseur (toucher, appui long).
 * Carte de commandement (mode 'shiftOnly') : les flèches seules sont à l'écran, Maj + flèches bougent le curseur.
 * Quand le curseur touche un bord, la carte défile sous lui.
 * ===================================================================================== */

import type { Button, InputDevice } from '@/core/contracts';

/** Vitesse du curseur au clavier (px/s), multipliée par KEY_CURSOR_FAST avec Maj. */
export const KEY_CURSOR_SPEED = 300;
export const KEY_CURSOR_FAST = 2.6;
/** Marge (px) au-delà de laquelle le curseur fait défiler la carte. */
export const CURSOR_EDGE = 26;

/** Sous-ensemble des entrées lu pour le curseur. */
export interface CursorInput {
  readonly device: InputDevice;
  readonly moveX: number;
  readonly moveY: number;
  down(b: Button): boolean;
  pressed(b: Button): boolean;
}

export interface CursorAxes {
  /** Direction demandée : x à droite, y vers le HAUT (comme le stick). */
  x: number;
  y: number;
  /** Vitesse en px/s pour une direction de norme 1. */
  speed: number;
}

/**
 * Ce que les flèches font au curseur :
 *   'free'      flèches = curseur (Maj : plus vite), Entrée = bouton du curseur (plan de Paris, M) ;
 *   'shiftOnly' flèches seules laissées à l'écran (la carte de commandement fait sauter la visée d'un repère à
 *               l'autre) ; Maj + flèches = curseur libre, à vitesse normale ; Entrée n'est jamais le bouton du curseur
 *               (l'écran la lit lui-même, une seule fois).
 */
export type KeyCursorMode = 'free' | 'shiftOnly';

/**
 * Direction du curseur pour cette image. Manette : stick gauche ; clavier : flèches tenues (diagonale normalisée).
 * Toute autre source (doigt, souris) : aucune. `shift` : Maj tenue (par défaut, la touche « courir », Maj gauche) ;
 * en mode 'shiftOnly' les flèches ne bougent le curseur que Maj tenue.
 */
export function cursorAxes(
  input: CursorInput, padSpeed: number, out: CursorAxes, mode: KeyCursorMode = 'free', shift = input.down('sprint'),
): CursorAxes {
  out.x = 0;
  out.y = 0;
  out.speed = 0;
  if (input.device === 'gamepad') {
    out.x = input.moveX;
    out.y = input.moveY;
    out.speed = padSpeed;
  } else if (input.device === 'kbm') {
    if (mode === 'shiftOnly' && !shift) return out;
    const x = (input.down('ui_right') ? 1 : 0) - (input.down('ui_left') ? 1 : 0);
    const y = (input.down('ui_up') ? 1 : 0) - (input.down('ui_down') ? 1 : 0);
    const n = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;
    out.x = x * n;
    out.y = y * n;
    // en 'shiftOnly', Maj sert à désigner librement : la vitesse reste la vitesse normale
    out.speed = KEY_CURSOR_SPEED * (mode === 'free' && shift ? KEY_CURSOR_FAST : 1);
  }
  return out;
}

/**
 * Le curseur doit-il apparaître (première direction, ou première validation de la manette ou du clavier en mode
 * 'free') ? En 'shiftOnly', Entrée et le bouton A appartiennent à l'écran : seule une direction réveille le curseur.
 */
export function cursorWakes(input: CursorInput, axes: CursorAxes, mode: KeyCursorMode = 'free'): boolean {
  if (input.device !== 'gamepad' && input.device !== 'kbm') return false;
  return axes.x !== 0 || axes.y !== 0 || (mode === 'free' && input.pressed('ui_accept'));
}

/**
 * Entrée (clavier) ou A (manette) est-il le bouton du curseur de la carte ? Jamais en 'shiftOnly' : l'écran de la
 * carte de commandement traite Entrée une seule fois (envoi d'un ordre), un second « toucher » au curseur ferait
 * doublon.
 */
export function cursorAcceptsButton(mode: KeyCursorMode): boolean {
  return mode === 'free';
}

export interface CursorStep {
  x: number;
  y: number;
  /** Défilement de la carte à appliquer (px) quand le curseur bute sur un bord. */
  panX: number;
  panY: number;
}

/** Avance le curseur (pixels de la carte, y vers le bas) dans une vue de w × h ; il reste à CURSOR_EDGE des bords. */
export function stepCursor(x0: number, y0: number, axes: CursorAxes, dt: number, w: number, h: number, out: CursorStep): CursorStep {
  let x = x0 + axes.x * axes.speed * dt;
  let y = y0 - axes.y * axes.speed * dt;
  let panX = 0, panY = 0;
  const edge = CURSOR_EDGE;
  if (x < edge) { panX = edge - x; x = edge; }
  else if (x > w - edge) { panX = w - edge - x; x = w - edge; }
  if (y < edge) { panY = edge - y; y = edge; }
  else if (y > h - edge) { panY = h - edge - y; y = h - edge; }
  out.x = x;
  out.y = y;
  out.panX = panX;
  out.panY = panY;
  return out;
}
