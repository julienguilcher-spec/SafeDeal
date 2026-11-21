/* =====================================================================================
 * Entrées — catalogue des boutons logiques et des actions réaffectables.
 *
 * Les `Button` viennent du contrat. Le module y ajoute des actions « d'axe » (déplacement,
 * regard au clavier) qui ne sont pas des boutons du contrat mais doivent pouvoir être
 * réaffectées comme les autres : ensemble, ils forment les `BindAction`.
 * Aucun accès au DOM : ce fichier sert aussi aux tests Node.
 * ===================================================================================== */

import type { Button } from '@/core/contracts';

/** Index stable de chaque bouton du contrat (le typage impose que la liste soit complète). */
const BUTTON_TABLE = {
  primary: 0, secondary: 1, interact: 2, reload: 3, sprint: 4, crouch: 5, jump: 6,
  item_next: 7, item_prev: 8,
  slot1: 9, slot2: 10, slot3: 11, slot4: 12, slot5: 13, slot6: 14, slot7: 15, slot8: 16, slot9: 17,
  radio: 18, orders: 19, map: 20, tactical: 21, camera: 22, pause: 23, flashlight: 24, mask: 25, visor: 26,
  siren: 27, beacons: 28, horn: 29, handbrake: 30, headlights: 31, megaphone: 32, fast_forward: 33,
  zoom_in: 34, zoom_out: 35,
  ui_accept: 36, ui_back: 37, ui_up: 38, ui_down: 39, ui_left: 40, ui_right: 41,
  jog: 42,
} as const satisfies Record<Button, number>;

export const BUTTON_INDEX: Readonly<Record<Button, number>> = BUTTON_TABLE;

/** Boutons du contrat, rangés par index. */
export const BUTTONS: readonly Button[] = (Object.keys(BUTTON_TABLE) as Button[])
  .sort((a, b) => BUTTON_TABLE[a] - BUTTON_TABLE[b]);

export const BUTTON_COUNT = BUTTONS.length;

/** Actions d'axe au clavier (réaffectables, mais absentes de `Button`). */
export type AxisAction =
  | 'move_forward' | 'move_back' | 'move_left' | 'move_right'
  | 'look_left' | 'look_right' | 'look_up' | 'look_down';

export const AXIS_ACTIONS: readonly AxisAction[] = [
  'move_forward', 'move_back', 'move_left', 'move_right',
  'look_left', 'look_right', 'look_up', 'look_down',
];

/** Tout ce qui peut recevoir une touche ou un bouton de manette. */
export type BindAction = Button | AxisAction;

/** Liste complète : d'abord les boutons (mêmes index que BUTTON_INDEX), puis les axes. */
export const ACTIONS: readonly BindAction[] = [...BUTTONS, ...AXIS_ACTIONS];
export const ACTION_COUNT = ACTIONS.length;

const ACTION_TABLE: Record<string, number> = Object.create(null) as Record<string, number>;
for (let i = 0; i < ACTIONS.length; i++) ACTION_TABLE[ACTIONS[i]!] = i;

/** Index d'une action (bouton ou axe), -1 si inconnue. */
export function actionIndex(action: string): number {
  const i = ACTION_TABLE[action];
  return i === undefined ? -1 : i;
}

/** Index d'un bouton du contrat, -1 si la chaîne n'en est pas un. */
export function buttonIndex(button: string): number {
  const i = ACTION_TABLE[button];
  return i === undefined || i >= BUTTON_COUNT ? -1 : i;
}

// Index des axes dans le tableau des actions (après les boutons).
export const AX_FORWARD = BUTTON_COUNT;
export const AX_BACK = BUTTON_COUNT + 1;
export const AX_LEFT = BUTTON_COUNT + 2;
export const AX_RIGHT = BUTTON_COUNT + 3;
export const AX_LOOK_LEFT = BUTTON_COUNT + 4;
export const AX_LOOK_RIGHT = BUTTON_COUNT + 5;
export const AX_LOOK_UP = BUTTON_COUNT + 6;
export const AX_LOOK_DOWN = BUTTON_COUNT + 7;

/**
 * Contexte d'emploi d'une action. Une même touche peut servir à plusieurs actions si leurs
 * contextes ne se recouvrent pas (Espace = sauter à pied et frein à main en véhicule).
 *   pied / vehicule : exclusifs l'un de l'autre ; commun : valable partout en jeu ; menu : écrans.
 */
export type ActionContext = 'pied' | 'vehicule' | 'commun' | 'menu';

const CONTEXTS: Record<BindAction, ActionContext> = {
  primary: 'commun', secondary: 'commun', interact: 'commun',
  reload: 'pied', sprint: 'pied', crouch: 'pied', jump: 'pied',
  item_next: 'pied', item_prev: 'pied',
  slot1: 'pied', slot2: 'pied', slot3: 'pied', slot4: 'pied', slot5: 'pied',
  slot6: 'pied', slot7: 'pied', slot8: 'pied', slot9: 'pied',
  radio: 'commun', orders: 'commun', map: 'commun', tactical: 'commun', camera: 'commun', pause: 'commun',
  flashlight: 'pied', mask: 'commun', visor: 'commun',
  siren: 'vehicule', beacons: 'vehicule', horn: 'vehicule', handbrake: 'vehicule', headlights: 'vehicule',
  megaphone: 'commun', fast_forward: 'commun', zoom_in: 'commun', zoom_out: 'commun',
  ui_accept: 'menu', ui_back: 'menu', ui_up: 'menu', ui_down: 'menu', ui_left: 'menu', ui_right: 'menu',
  jog: 'pied',
  move_forward: 'commun', move_back: 'commun', move_left: 'commun', move_right: 'commun',
  look_left: 'commun', look_right: 'commun', look_up: 'commun', look_down: 'commun',
};

export function actionContext(action: BindAction): ActionContext {
  return CONTEXTS[action];
}

/** Deux actions peuvent-elles se gêner si elles partagent la même touche ? */
export function contextsOverlap(a: ActionContext, b: ActionContext): boolean {
  if (a === 'menu' || b === 'menu') return a === b;
  if (a === 'commun' || b === 'commun') return true;
  return a === b;
}

/** Nom français de chaque action (écran de réaffectation, aide). */
const NAMES: Record<BindAction, string> = {
  primary: 'Action principale', secondary: 'Action secondaire', interact: 'Interagir', reload: 'Recharger',
  sprint: 'Courir', crouch: 'S’accroupir', jump: 'Sauter / enjamber',
  item_next: 'Objet suivant', item_prev: 'Objet précédent',
  slot1: 'Objet 1', slot2: 'Objet 2', slot3: 'Objet 3', slot4: 'Objet 4', slot5: 'Objet 5',
  slot6: 'Objet 6', slot7: 'Objet 7', slot8: 'Objet 8', slot9: 'Objet 9',
  radio: 'Radio', orders: 'Ordres', map: 'Carte', tactical: 'Carte tactique', camera: 'Changer de caméra',
  pause: 'Pause', flashlight: 'Lampe', mask: 'Masque à gaz', visor: 'Visière',
  siren: 'Sirène', beacons: 'Gyrophares', horn: 'Klaxon', handbrake: 'Frein à main', headlights: 'Phares',
  megaphone: 'Mégaphone', fast_forward: 'Avance rapide', zoom_in: 'Zoom avant', zoom_out: 'Zoom arrière',
  ui_accept: 'Valider', ui_back: 'Retour', ui_up: 'Menu : haut', ui_down: 'Menu : bas',
  ui_left: 'Menu : gauche', ui_right: 'Menu : droite',
  jog: 'Marcher / trottiner',
  move_forward: 'Avancer', move_back: 'Reculer', move_left: 'Aller à gauche', move_right: 'Aller à droite',
  look_left: 'Regarder à gauche', look_right: 'Regarder à droite', look_up: 'Regarder en haut', look_down: 'Regarder en bas',
};

export function actionName(action: BindAction): string {
  return NAMES[action] ?? String(action);
}
