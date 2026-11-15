/* =====================================================================================
 * Entrées — services publiés par le module (à importer avec `import type` depuis un autre module).
 *
 *   ctx.input                                   → InputState du contrat
 *   ctx.service<InputTouchApi>('input.touch')   → surcouche tactile (disposition, libellés, barre d'objets)
 *   ctx.service<InputLabelsApi>('input.labels') → libellés des touches/boutons pour l'interface
 *   ctx.service<InputBindingsApi>('input.bindings') → réaffectation des touches
 *   ctx.service<InputScriptApi>('input.script') → entrées simulées (tests, didacticiel)
 * ===================================================================================== */

import type { Button, InputDevice } from '@/core/contracts';
import type { BindAction } from './buttons';
import type { BindDevice } from './bindings';

export const INPUT_TOUCH_SERVICE = 'input.touch';
export const INPUT_LABELS_SERVICE = 'input.labels';
export const INPUT_BINDINGS_SERVICE = 'input.bindings';
export const INPUT_SCRIPT_SERVICE = 'input.script';

// ───────────────────────────── tactile ─────────────────────────────

/**
 * Disposition de la surcouche tactile.
 *   pied     : joystick à gauche, regard à droite, Action, Viser, Interagir, Accroupi, Saut, barre d'objets…
 *   vehicule : volant au joystick, pédales, sirène, gyrophares, klaxon, frein à main, sortir
 *   drone    : déplacement au joystick, regard à droite, monter / descendre, zoom
 *   menu     : aucune commande de jeu (les écrans de l'interface reçoivent les doigts)
 *   cache    : rien du tout, pas même le message « tournez l'appareil »
 *   auto     : (valeur initiale) choisie d'après ctx.player : drone si la caméra est en mode drone,
 *              vehicule si la personne incarnée est à bord, pied sinon ; menu hors phase « playing ».
 * Quelle que soit la disposition, un écran modal (ctx.ui.modal) masque les commandes de jeu.
 */
export type TouchLayout = 'pied' | 'vehicule' | 'drone' | 'menu' | 'cache';
export type TouchLayoutMode = TouchLayout | 'auto';

/** Une case de la barre d'objets. */
export interface TouchItem {
  /** Pictogramme : un ou deux caractères (affichés en grand) ou un identifiant (affiché en petit). */
  icon: string;
  /** Nom court affiché sous le pictogramme (facultatif). */
  label?: string;
  /** Quantité restante ; affichée si elle est définie. */
  count?: number;
}

export interface InputTouchApi {
  /** Disposition demandée (« auto » tant que setLayout n'a pas été appelé). */
  readonly mode: TouchLayoutMode;
  /** Disposition réellement affichée à cet instant. */
  readonly layout: TouchLayout;
  /** La surcouche est-elle affichée (dernier périphérique utilisé = tactile, ou affichage forcé) ? */
  readonly visible: boolean;
  setLayout(layout: TouchLayoutMode): void;
  /**
   * Libellé du bouton contextuel « Interagir ». Une chaîne : le bouton est mis en avant avec ce
   * texte (« Menotter », « Monter dans le fourgon »…). null : retour au comportement automatique
   * (libellé de ctx.player.state.prompt s'il y en a un, sinon bouton discret « Interagir »).
   */
  setInteractLabel(text: string | null): void;
  /**
   * Barre d'objets : pictogrammes (chaînes ou TouchItem) et index de l'objet en main (-1 = aucun).
   * Toucher la case n appuie brièvement sur le bouton slot(n+1). 9 cases au plus.
   * `items = null` : retour au remplissage automatique d'après l'inventaire de la personne incarnée.
   */
  setItemBar(items: readonly (string | TouchItem)[] | null, active?: number): void;
  /** Masque ou réaffiche un bouton de la surcouche (ex. pas de visière pour un journaliste). */
  setButtonVisible(button: Button, visible: boolean): void;
  /** Bouton à bascule (un appui l'enfonce, le suivant le relâche) ou momentané. Par défaut : « Viser » est à bascule. */
  setToggle(button: Button, toggle: boolean): void;
  /** true / false : force l'affichage ou le masquage ; null : automatique (dernier périphérique utilisé). */
  setForced(forced: boolean | null): void;
}

// ───────────────────────────── libellés ─────────────────────────────

/** Gravure des boutons : A/B/X/Y (A en bas), formes ✕ ○ □ △, ou lettres inversées (B en bas). */
export type PadStyle = 'lettres' | 'formes' | 'lettres_inversees';
export type KeyboardLayout = 'azerty' | 'qwerty' | 'qwertz';

export interface InputLabelsApi {
  /**
   * Libellé court de ce qui déclenche le bouton sur le périphérique actif (ou celui demandé) :
   * « E », « Clic gauche », « Maj » au clavier ; « X », « □ », « RT » à la manette ; « Interagir »,
   * « Action » en tactile (texte du bouton à l'écran). Chaîne vide si rien n'est affecté.
   */
  labelFor(button: Button, device?: InputDevice): string;
  /** Tous les libellés d'une action (affectation principale puis secondaire). */
  labelsFor(action: BindAction, device?: InputDevice): string[];
  /** Libellé du déplacement (« ZQSD », « Stick gauche », « Joystick ») et du regard (« Souris », « Stick droit », « Glisser à droite »). */
  moveLabel(device?: InputDevice): string;
  lookLabel(device?: InputDevice): string;
  /** Nom français de l'action (« Interagir », « Sirène »…). */
  actionName(action: BindAction): string;
  /** Libellé d'un code physique (« KeyW » → « Z » sur AZERTY ; « B2 » → « X » ou « □ »). */
  codeLabel(device: BindDevice, code: string): string;
  /** Famille de la manette active, pour choisir les pictogrammes. */
  readonly padStyle: PadStyle;
  /** Nom de la manette active ('' si aucune). */
  readonly padName: string;
  /** Disposition de clavier supposée ou constatée. */
  readonly keyboardLayout: KeyboardLayout;
  /** Incrémenté dès qu'un libellé peut avoir changé (périphérique actif, affectations, clavier, manette). */
  readonly version: number;
}

// ───────────────────────────── réaffectation ─────────────────────────────

export interface InputBindingsApi {
  /** Actions réaffectables, dans l'ordre d'affichage conseillé. */
  readonly actions: readonly BindAction[];
  /** Codes affectés à l'action (0 à 2) : KeyboardEvent.code, « Mouse0 »…, « WheelUp/Down » ; « B0 »…« B16 » à la manette. */
  get(device: BindDevice, action: BindAction): readonly string[];
  /**
   * Affecte un code à l'emplacement 0 (principal) ou 1 (secondaire) ; null vide l'emplacement.
   * Le code est retiré des actions du même contexte qui l'utilisaient : elles sont retournées.
   * Retourne null si la demande est invalide. Enregistré aussitôt (section « bindings »).
   */
  set(device: BindDevice, action: BindAction, slot: 0 | 1, code: string | null): BindAction[] | null;
  /** Actions du même contexte qui utilisent déjà ce code (pour avertir avant d'affecter). */
  conflicts(device: BindDevice, action: BindAction, code: string): BindAction[];
  /** Valeurs par défaut : un périphérique, ou les deux si omis. */
  reset(device?: BindDevice): void;
  resetAction(device: BindDevice, action: BindAction): void;
  isDefault(device: BindDevice, action?: BindAction): boolean;
  /**
   * Écoute la prochaine touche (ou le prochain bouton de manette) et la remet à `done` au lieu
   * de la traiter comme une commande ; Échap annule (done(null)). Retourne une fonction d'annulation.
   */
  capture(device: BindDevice, done: (code: string | null) => void): () => void;
  /** Incrémenté à chaque modification. */
  readonly version: number;
}

// ───────────────────────────── entrées simulées ─────────────────────────────

/**
 * Source d'entrées pilotée par le code : tests de bout en bout des autres modules, didacticiel,
 * démonstration. Elle s'ajoute aux périphériques réels et ne change pas le périphérique actif.
 */
export interface InputScriptApi {
  press(button: Button): void;
  release(button: Button): void;
  /** Appui bref : vu comme pressed pendant un pas, puis released au suivant. */
  tap(button: Button): void;
  /** Déplacement maintenu (x = droite, y = avant), norme bornée à 1. */
  setMove(x: number, y: number): void;
  setTriggers(throttle: number, brake: number): void;
  /** Rotation du regard à appliquer une fois (radians ; x > 0 = droite, y > 0 = haut). */
  look(dx: number, dy: number): void;
  /** Crans de molette (> 0 = vers le bas). */
  wheel(notches: number): void;
  /** Relâche tout. */
  clear(): void;
}
