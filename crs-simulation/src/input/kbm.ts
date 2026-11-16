/* =====================================================================================
 * Entrées — clavier et souris.
 *
 *   - touches PHYSIQUES (KeyboardEvent.code) : ZQSD sur AZERTY sans rien configurer ;
 *   - verrouillage de la souris (pointer lock) demandé au clic sur la zone de jeu quand rien ne
 *     s'y oppose ; ce clic-là ne déclenche aucune action ;
 *   - repli « glisser pour regarder » si le verrouillage est refusé (iframe sans permission) :
 *     maintenir un bouton de la souris sur la zone de jeu et glisser fait tourner la vue ;
 *   - la perte du verrouillage non voulue par le jeu (Échap, que le navigateur ne transmet pas à
 *     la page, ou changement de fenêtre) donne un appui bref sur « pause » ;
 *   - perte de focus : tout est relâché ;
 *   - défilement, menu contextuel, raccourcis gênants : neutralisés pendant qu'on joue.
 * ===================================================================================== */

import type { Settings } from '@/core/contracts';
import { digitalMove } from './axes';
import type { Axis2 } from './axes';
import type { BindingStore } from './bindings';
import {
  ACTIONS, ACTION_COUNT, AX_BACK, AX_FORWARD, AX_LEFT, AX_LOOK_DOWN, AX_LOOK_LEFT, AX_LOOK_RIGHT, AX_LOOK_UP,
  AX_RIGHT, BUTTON_COUNT, BUTTON_INDEX, actionContext,
} from './buttons';
import { CH_LOOK_X, CH_LOOK_Y, CH_WHEEL } from './core';
import type { InputCore } from './core';
import type { KeyLabels } from './labels';
import { MouseTravel, SRC_KBM, createSourceAxes } from './merge';
import type { SourceAxes } from './merge';

/** Rotation par pixel de souris à sensibilité 1 (rad). */
export const MOUSE_RAD_PER_PX = 0.0022;
/** Vitesse de rotation aux flèches du clavier (rad/s) à sensibilité 1. */
export const KEY_YAW_SPEED = 2.2;
export const KEY_PITCH_SPEED = 1.4;
/** Mouvement maximal pris en compte pour un événement (px) : écarte les sauts parasites du pointeur verrouillé. */
const MAX_MOVE = 500;
/** Nombre d'échecs de verrouillage au-delà duquel on ne réessaie plus. */
const MAX_LOCK_FAILURES = 3;

/** Touches dont l'action par défaut du navigateur gêne le jeu (défilement, recherche rapide, focus). */
const NUISANCE: Readonly<Record<string, true>> = {
  Space: true, ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true, Tab: true, Backspace: true,
  Quote: true, Slash: true, AltLeft: true, AltRight: true, PageUp: true, PageDown: true, Home: true, End: true,
  F1: true, F3: true, F7: true,
};
/** Touches jamais neutralisées : recharger, plein écran, outils de développement. */
const NEVER_BLOCK: Readonly<Record<string, true>> = { F5: true, F11: true, F12: true };

export interface KbmEnv {
  core: InputCore;
  bindings: BindingStore;
  labels: KeyLabels;
  /** Zone de jeu : les clics qui y tombent capturent la souris. */
  gameEl: HTMLElement;
  settings(): Settings;
  /** Le jeu accepte-t-il de capturer la souris maintenant (ni écran modal, ni pause) ? */
  canLock(): boolean;
  /** Un écran modal est ouvert : le clavier garde son comportement natif (navigation dans les menus). */
  modalOpen(): boolean;
  /** Cet événement de souris est-il fabriqué par le navigateur à la suite d'un toucher ? */
  syntheticMouse(): boolean;
  /** Cible considérée comme « zone de jeu » en plus de gameEl (zones de la surcouche tactile). */
  extraGameTarget(target: Element): boolean;
  notify(text: string): void;
  /** Usage intentionnel du clavier ou de la souris. */
  activity(): void;
  /** La souris a été rendue sans que le jeu le demande (Échap, changement de fenêtre) : demander la pause. */
  autoPause(): void;
}

const tmp: Axis2 = { x: 0, y: 0 };

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type !== 'button' && type !== 'checkbox' && type !== 'radio' && type !== 'range' && type !== 'submit' && type !== 'reset';
}

/** Code de repli quand le navigateur ne renseigne pas KeyboardEvent.code (claviers virtuels, vieux moteurs). */
function fallbackCode(key: string): string {
  if (key.length === 1) {
    const c = key.toUpperCase();
    if (c >= 'A' && c <= 'Z') return 'Key' + c;
    if (c >= '0' && c <= '9') return 'Digit' + c;
    if (c === ' ') return 'Space';
    return '';
  }
  return key === 'Esc' ? 'Escape' : key;   // « Enter », « Escape », « ArrowUp »… portent le même nom
}

export class KbmSource {
  readonly axes: SourceAxes = createSourceAxes();
  /** Souris capturée. */
  locked = false;
  /** Repli « glisser pour regarder » actif (verrouillage refusé). */
  fallback = false;

  private readonly held = new Set<string>();
  private readonly counts = new Uint8Array(ACTION_COUNT);
  private accX = 0;
  private accY = 0;
  private travelPx = 0;
  private lastX = NaN;
  private lastY = NaN;
  private dragging = false;
  /** Une vraie souris a bougé pendant cette session (sinon, inutile de la capturer depuis le clavier). */
  private mouseSeen = false;
  private wheelAcc = 0;
  private wheelIdle = 0;
  private pendingLock = false;
  /** La demande en cours rendra son verdict par une promesse : l'événement d'erreur fait doublon. */
  private viaPromise = false;
  private softRequest = false;
  private selfExit = false;
  private lockFailures = 0;
  private toldFallback = false;
  private captureCb: ((code: string | null) => void) | null = null;
  private attached = false;
  private readonly travel = new MouseTravel();
  private readonly pauseIndex = BUTTON_INDEX.pause;

  constructor(private readonly env: KbmEnv) {}

  // ───────────────────────────── cycle de vie ─────────────────────────────

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const w = window;
    const d = document;
    w.addEventListener('keydown', this.onKeyDown, true);
    w.addEventListener('keyup', this.onKeyUp, true);
    w.addEventListener('mousedown', this.onMouseDown, true);
    w.addEventListener('mouseup', this.onMouseUp, true);
    w.addEventListener('mousemove', this.onMouseMove, true);
    w.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    w.addEventListener('contextmenu', this.onContextMenu, true);
    w.addEventListener('auxclick', this.onAuxClick, true);
    w.addEventListener('dragstart', this.onDragStart, true);
    w.addEventListener('blur', this.onBlur);
    w.addEventListener('pagehide', this.onBlur);
    d.addEventListener('visibilitychange', this.onVisibility);
    d.addEventListener('pointerlockchange', this.onLockChange);
    d.addEventListener('pointerlockerror', this.onLockError);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    const w = window;
    const d = document;
    w.removeEventListener('keydown', this.onKeyDown, true);
    w.removeEventListener('keyup', this.onKeyUp, true);
    w.removeEventListener('mousedown', this.onMouseDown, true);
    w.removeEventListener('mouseup', this.onMouseUp, true);
    w.removeEventListener('mousemove', this.onMouseMove, true);
    w.removeEventListener('wheel', this.onWheel, true);
    w.removeEventListener('contextmenu', this.onContextMenu, true);
    w.removeEventListener('auxclick', this.onAuxClick, true);
    w.removeEventListener('dragstart', this.onDragStart, true);
    w.removeEventListener('blur', this.onBlur);
    w.removeEventListener('pagehide', this.onBlur);
    d.removeEventListener('visibilitychange', this.onVisibility);
    d.removeEventListener('pointerlockchange', this.onLockChange);
    d.removeEventListener('pointerlockerror', this.onLockError);
    this.releasePointer();
    this.releaseAll();
  }

  // ───────────────────────────── scrutation ─────────────────────────────

  /** Une fois par image : axes du clavier, rotation de la souris et des flèches. */
  sample(dt: number): void {
    const c = this.counts;
    const forward = c[AX_FORWARD]! > 0;
    const back = c[AX_BACK]! > 0;
    digitalMove(forward, back, c[AX_LEFT]! > 0, c[AX_RIGHT]! > 0, tmp);
    const a = this.axes;
    a.moveX = tmp.x;
    a.moveY = tmp.y;
    // Sans gâchette analogique : accélérateur et frein valent 0 ou 1 d'après avancer / reculer.
    // (La diagonale est normalisée à la fusion, à pied seulement.)
    a.throttle = forward ? 1 : 0;
    a.brake = back ? 1 : 0;

    const s = this.env.settings();
    const sens = s.mouseSensitivity > 0 ? s.mouseSensitivity : 1;
    const ySign = s.invertY ? 1 : -1;      // souris vers le haut de l'écran (dy < 0) = lever le regard
    let lookX = 0;
    let lookY = 0;
    if (this.accX !== 0 || this.accY !== 0) {
      lookX = this.accX * MOUSE_RAD_PER_PX * sens;
      lookY = this.accY * MOUSE_RAD_PER_PX * sens * ySign;
      this.accX = 0;
      this.accY = 0;
    }
    const kx = (c[AX_LOOK_RIGHT]! > 0 ? 1 : 0) - (c[AX_LOOK_LEFT]! > 0 ? 1 : 0);
    const ky = (c[AX_LOOK_UP]! > 0 ? 1 : 0) - (c[AX_LOOK_DOWN]! > 0 ? 1 : 0);
    if (kx !== 0) lookX += kx * KEY_YAW_SPEED * sens * dt;
    if (ky !== 0) lookY += ky * KEY_PITCH_SPEED * sens * dt * (s.invertY ? -1 : 1);
    if (lookX !== 0 || lookY !== 0) {
      const pending = this.env.core.pending;
      pending[CH_LOOK_X] += lookX;
      pending[CH_LOOK_Y] += lookY;
    }

    // Mouvement de souris intentionnel → périphérique actif.
    if (this.travel.update(this.travelPx, dt)) this.env.activity();
    this.travelPx = 0;

    // Un reste de molette (pavé tactile) s'efface s'il ne se passe plus rien.
    if (this.wheelAcc !== 0) {
      this.wheelIdle += dt;
      if (this.wheelIdle > 0.3) this.wheelAcc = 0;
    }
  }

  /** Libère la souris si le jeu ne doit plus la tenir (écran modal, pause). */
  enforceLockPolicy(): void {
    if (this.locked && !this.env.canLock()) this.releasePointer();
  }

  // ───────────────────────────── verrouillage de la souris ─────────────────────────────

  /**
   * Demande la capture de la souris. `soft` : tentative discrète (depuis une touche du clavier) ;
   * un refus ne bascule pas dans le repli et n'affiche rien.
   */
  requestPointer(soft = false): void {
    if (this.locked || this.pendingLock) return;
    const el = this.env.gameEl as HTMLElement & { requestPointerLock?: (o?: unknown) => unknown };
    if (typeof el.requestPointerLock !== 'function') {
      if (!soft) this.lockFailed();
      return;
    }
    this.pendingLock = true;
    this.viaPromise = false;
    this.softRequest = soft;
    try {
      // Mouvement brut (sans accélération du système) quand le navigateur le propose.
      const p = el.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
      if (p && typeof p.then === 'function') {
        this.viaPromise = true;
        p.then(() => {
          this.viaPromise = false;
        }, (err: unknown) => {
          const name = (err as { name?: string } | null)?.name;
          if (name === 'NotSupportedError') {
            // option refusée : on redemande sans elle
            this.pendingLock = true;
            try {
              const p2 = el.requestPointerLock!() as Promise<void> | undefined;
              if (p2 && typeof p2.then === 'function') {
                p2.then(() => {
                  this.viaPromise = false;
                }, () => this.lockFailed());
              } else {
                this.viaPromise = false;
              }
            } catch {
              this.lockFailed();
            }
          } else {
            this.lockFailed();
          }
        });
      }
    } catch {
      this.lockFailed();
    }
  }

  /** Rend la souris (demande du jeu : ne produit pas de « pause »). */
  releasePointer(): void {
    this.pendingLock = false;
    if (!this.locked) return;
    this.selfExit = true;
    try {
      document.exitPointerLock();
    } catch {
      this.selfExit = false;
    }
  }

  private lockFailed(): void {
    this.viaPromise = false;
    if (!this.pendingLock) return;      // déjà compté
    this.pendingLock = false;
    if (this.softRequest) return;
    this.lockFailures++;
    if (!this.fallback) {
      this.fallback = true;
      if (!this.toldFallback) {
        this.toldFallback = true;
        this.env.notify('La souris ne peut pas être capturée ici : maintenez un bouton de la souris et glissez pour regarder, ou utilisez les flèches du clavier.');
      }
    }
  }

  private readonly onLockChange = (): void => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.env.gameEl;
    this.env.core.pointerLocked = this.locked;
    this.pendingLock = false;
    if (this.locked) {
      this.lockFailures = 0;
      this.fallback = false;
      this.dragging = false;
      this.accX = 0;
      this.accY = 0;
      this.selfExit = false;
      // Un bouton de l'interface qui garderait le focus serait réactivé par Espace ou Entrée.
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && typeof active.blur === 'function') active.blur();
    } else if (was) {
      // Capture perdue sans que le jeu l'ait demandé : Échap (jamais transmise à la page quand la
      // souris est capturée) ou changement de fenêtre → on met le jeu en pause.
      if (!this.selfExit) this.env.autoPause();
      this.selfExit = false;
      this.lastX = NaN;
      this.lastY = NaN;
    }
  };

  private readonly onLockError = (): void => {
    if (this.viaPromise) return;        // la promesse de la demande rendra le même verdict
    this.lockFailed();
  };

  // ───────────────────────────── réaffectation ─────────────────────────────

  /** Remet la prochaine touche ou le prochain bouton de souris à `done` (Échap : null). */
  capture(done: (code: string | null) => void): () => void {
    this.captureCb = done;
    return () => {
      if (this.captureCb === done) this.captureCb = null;
    };
  }

  private finishCapture(code: string | null): void {
    const cb = this.captureCb;
    this.captureCb = null;
    if (!cb) return;
    try {
      cb(code);
    } catch (err) {
      console.error('[input] erreur dans la capture de touche', err);
    }
  }

  // ───────────────────────────── touches ─────────────────────────────

  private pressCode(code: string): void {
    if (this.held.has(code)) return;
    this.held.add(code);
    const acts = this.env.bindings.actionsFor('kbm', code);
    const latch = this.env.core.latch;
    for (let k = 0; k < acts.length; k++) {
      const a = acts[k]!;
      if (this.counts[a]!++ === 0 && a < BUTTON_COUNT) latch.set(SRC_KBM, a, true);
    }
  }

  private releaseCode(code: string): void {
    if (!this.held.delete(code)) return;
    const acts = this.env.bindings.actionsFor('kbm', code);
    const latch = this.env.core.latch;
    for (let k = 0; k < acts.length; k++) {
      const a = acts[k]!;
      if (this.counts[a]! > 0 && --this.counts[a]! === 0 && a < BUTTON_COUNT) latch.set(SRC_KBM, a, false);
    }
  }

  private pulseCode(code: string): void {
    const acts = this.env.bindings.actionsFor('kbm', code);
    const latch = this.env.core.latch;
    for (let k = 0; k < acts.length; k++) {
      const a = acts[k]!;
      if (a < BUTTON_COUNT) latch.pulse(SRC_KBM, a);
    }
  }

  /** Relâche tout ce que tiennent le clavier et la souris (perte de focus, réaffectation). */
  releaseAll(): void {
    this.held.clear();
    this.counts.fill(0);
    this.env.core.latch.releaseSource(SRC_KBM);
    this.dragging = false;
    this.accX = 0;
    this.accY = 0;
    this.wheelAcc = 0;
    this.travel.reset();
  }

  /** Cette touche sert-elle à jouer (autre chose que les menus et la pause) ? */
  private isGameplayCode(code: string): boolean {
    const acts = this.env.bindings.actionsFor('kbm', code);
    for (let k = 0; k < acts.length; k++) {
      const a = acts[k]!;
      if (a === this.pauseIndex) return false;
      if (actionContext(ACTIONS[a]!) !== 'menu') return true;
    }
    return false;
  }

  /** Faut-il neutraliser l'action par défaut du navigateur pour cette touche ? */
  private shouldPrevent(e: KeyboardEvent, code: string): boolean {
    if (e.metaKey || NEVER_BLOCK[code]) return false;
    if (this.env.modalOpen()) return false;           // menus : navigation native au clavier
    if (this.locked || (this.fallback && this.env.canLock())) return true;   // en jeu : tout le reste
    if (e.ctrlKey || (e.altKey && code !== 'AltLeft' && code !== 'AltRight')) return false;
    return this.env.bindings.isBound('kbm', code) || NUISANCE[code] === true;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isEditable(e.target)) return;
    const code = e.code || fallbackCode(e.key);
    if (!code) return;
    if (this.captureCb) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.finishCapture(code === 'Escape' ? null : code);
      return;
    }
    if (this.shouldPrevent(e, code)) e.preventDefault();
    if (e.repeat) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) this.env.labels.learn(code, e.key);
    if (e.metaKey) return;                            // raccourcis du système : pas une commande de jeu
    this.env.activity();
    this.pressCode(code);
    // Reprise au clavier : la souris est recapturée sans attendre un clic (tentative discrète).
    // Seulement si une souris a été vue : sur une tablette avec clavier, il n'y a rien à capturer.
    if (!this.locked && !this.fallback && this.mouseSeen && this.env.canLock() && this.isGameplayCode(code)) this.requestPointer(true);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const code = e.code || fallbackCode(e.key);
    if (!code) return;
    if (this.held.has(code) && !isEditable(e.target) && this.shouldPrevent(e, code)) e.preventDefault();
    this.releaseCode(code);
    // macOS ne signale pas le relâchement des touches tenues pendant Cmd : on relâche tout.
    if (code === 'MetaLeft' || code === 'MetaRight') this.releaseAll();
  };

  // ───────────────────────────── souris ─────────────────────────────

  private isGameTarget(target: EventTarget | null): boolean {
    const el = target as Element | null;
    if (!el || typeof el.closest !== 'function') return false;
    const game = this.env.gameEl;
    if (game === document.body) return el === game || el === document.documentElement || el.tagName === 'CANVAS' || this.env.extraGameTarget(el);
    return game.contains(el) || this.env.extraGameTarget(el);
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (this.env.syntheticMouse()) return;
    const code = 'Mouse' + e.button;
    if (this.captureCb) {
      e.preventDefault();
      e.stopPropagation();
      this.swallowNextClick();
      this.finishCapture(code);
      return;
    }
    if (!this.locked && !this.isGameTarget(e.target)) return;   // clic sur l'interface
    // bouton du milieu : défilement automatique ; boutons latéraux : page précédente / suivante
    if (e.button !== 0) e.preventDefault();
    this.env.activity();
    if (this.locked) {
      this.pressCode(code);
      return;
    }
    if (this.fallback) {
      // Repli : le bouton agit normalement et, tant qu'il est tenu, glisser fait tourner la vue.
      if (this.env.canLock() && this.lockFailures < MAX_LOCK_FAILURES) this.requestPointer();
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.pressCode(code);
      return;
    }
    // Ce clic capture la souris : il ne déclenche aucune action.
    if (this.env.canLock()) this.requestPointer();
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    const code = 'Mouse' + e.button;
    if (this.held.has(code) && e.button !== 0) e.preventDefault();
    this.releaseCode(code);
    if (this.dragging && e.buttons === 0) this.dragging = false;
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (this.env.syntheticMouse()) return;
    let dx: number;
    let dy: number;
    if (this.locked) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else {
      dx = this.lastX === this.lastX ? e.clientX - this.lastX : 0;
      dy = this.lastY === this.lastY ? e.clientY - this.lastY : 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.dragging && e.buttons === 0) this.dragging = false;   // bouton relâché hors de la fenêtre
    }
    if (dx > MAX_MOVE || dx < -MAX_MOVE || dy > MAX_MOVE || dy < -MAX_MOVE) return;
    if (dx !== 0 || dy !== 0) this.mouseSeen = true;
    this.travelPx += (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
    if (this.locked || this.dragging) {
      this.accX += dx;
      this.accY += dy;
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.locked && !this.isGameTarget(e.target)) return;     // l'interface garde son défilement
    e.preventDefault();                                            // ni défilement ni zoom (Ctrl + molette)
    if (this.captureCb) {
      if (e.deltaY !== 0) this.finishCapture(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
      return;
    }
    let notches = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY : e.deltaY / 100;
    if (notches !== notches || notches === 0) return;
    if (notches > 3) notches = 3;
    else if (notches < -3) notches = -3;
    this.env.activity();
    this.env.core.pending[CH_WHEEL] += notches;
    this.wheelAcc += notches;
    this.wheelIdle = 0;
    if (this.wheelAcc >= 1) {
      this.wheelAcc = 0;
      this.pulseCode('WheelDown');
    } else if (this.wheelAcc <= -1) {
      this.wheelAcc = 0;
      this.pulseCode('WheelUp');
    }
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    if (isEditable(e.target)) return;
    if (this.locked || this.isGameTarget(e.target) || this.held.has('Mouse2')) e.preventDefault();
  };

  private readonly onAuxClick = (e: MouseEvent): void => {
    if (this.locked || this.isGameTarget(e.target)) e.preventDefault();
  };

  private readonly onDragStart = (e: Event): void => {
    if (this.isGameTarget(e.target)) e.preventDefault();
  };

  /** Après une capture au clic, le « click » qui suit ne doit pas réactiver le bouton de l'interface survolé. */
  private swallowNextClick(): void {
    const stop = (ev: Event): void => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };
    const cleanup = (): void => {
      window.removeEventListener('click', stop, true);
      window.removeEventListener('auxclick', stop, true);
      window.removeEventListener('contextmenu', stop, true);
      window.clearTimeout(timer);
    };
    window.addEventListener('click', stop, true);
    window.addEventListener('auxclick', stop, true);
    window.addEventListener('contextmenu', stop, true);
    const timer = window.setTimeout(cleanup, 600);
  }

  private readonly onBlur = (): void => {
    this.releaseAll();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.releaseAll();
  };
}
