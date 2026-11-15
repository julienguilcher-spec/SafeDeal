/* =====================================================================================
 * Entrées — manette (Gamepad API, mapping standard).
 *
 *   - stick gauche = déplacement, stick droit = regard : zones mortes radiales, courbes de réponse ;
 *   - gâchettes analogiques : InputState.brake (LT) et throttle (RT), en plus des boutons
 *     secondary / primary (avec hystérésis) ;
 *   - le stick gauche et la croix pilotent aussi les menus (ui_up / ui_down / ui_left / ui_right) ;
 *   - branchement et débranchement à chaud, choix de la manette qu'on vient d'utiliser ;
 *   - vibration (vibrationActuator ou hapticActuators selon le navigateur).
 * Le navigateur n'est touché que par `getPads` (injectable) : la logique se teste sous Node.
 * ===================================================================================== */

import type { Settings } from '@/core/contracts';
import type { PadStyle } from './api';
import { LOOK_STICK, MOVE_STICK, analogButton, shapeStick, shapeTrigger } from './axes';
import type { Axis2 } from './axes';
import type { BindingStore } from './bindings';
import { BUTTON_COUNT, BUTTON_INDEX } from './buttons';
import type { InputCore } from './core';
import { detectPadStyle, padDisplayName } from './labels';
import { SRC_PAD, clearSourceAxes, createSourceAxes, padIsActive } from './merge';
import type { SourceAxes } from './merge';

/** Vitesse de rotation à fond de stick, sensibilité 1 (rad/s). */
export const PAD_YAW_SPEED = 3.3;
export const PAD_PITCH_SPEED = 2.1;
/** Nombre de boutons du mapping standard. */
const PAD_BUTTONS = 17;
const CODES: readonly string[] = Array.from({ length: PAD_BUTTONS }, (_, i) => 'B' + i);
/** Seuils du stick gauche employé comme croix dans les menus. */
const UI_ON = 0.6;
const UI_OFF = 0.4;
/** Intervalle de recherche d'une manette tant qu'aucune n'est connue (s). */
const SCAN_INTERVAL = 1;

/** Ce qu'on lit d'une manette (sous-ensemble de l'interface Gamepad du navigateur). */
export interface PadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: ArrayLike<number>;
  readonly buttons: ArrayLike<{ readonly pressed: boolean; readonly value: number }>;
  readonly vibrationActuator?: unknown;
  readonly hapticActuators?: unknown;
}

export interface GamepadEnv {
  core: InputCore;
  bindings: BindingStore;
  settings(): Settings;
  /** navigator.getGamepads() ou un remplaçant ; peut lever une exception (iframe sans permission). */
  getPads(): ArrayLike<PadLike | null> | null;
  /** Usage intentionnel de la manette. */
  activity(): void;
  connected(name: string): void;
  /** `wasActive` : c'était le périphérique en cours d'utilisation. */
  disconnected(wasActive: boolean): void;
}

const tmp: Axis2 = { x: 0, y: 0 };

function usable(p: PadLike | null | undefined): p is PadLike {
  return !!p && p.connected !== false && p.buttons.length >= 4 && p.axes.length >= 2;
}

function anyPressed(p: PadLike): boolean {
  const b = p.buttons;
  for (let i = 0; i < b.length; i++) {
    const btn = b[i];
    if (btn && (btn.pressed || btn.value > 0.5)) return true;
  }
  return false;
}

export class GamepadSource {
  readonly axes: SourceAxes = createSourceAxes();
  /** Une manette utilisable est branchée. */
  connected = false;
  padName = '';
  style: PadStyle = 'lettres';
  /** Incrémenté quand la manette active change (libellés). */
  version = 0;

  private index = -1;
  private padId = '';
  private known = false;
  private scanTimer = SCAN_INTERVAL;      // première recherche dès la première scrutation
  private blocked = false;
  private readonly want = new Uint8Array(BUTTON_COUNT);
  private readonly prev = new Uint8Array(PAD_BUTTONS);
  /** Boutons à ignorer jusqu'à leur relâchement (celui qui vient d'être capturé pour une réaffectation). */
  private readonly ignore = new Uint8Array(PAD_BUTTONS);
  private readonly uiDir = new Uint8Array(4);
  private captureCb: ((code: string | null) => void) | null = null;
  private current: PadLike | null = null;
  private readonly uiUp = BUTTON_INDEX.ui_up;
  private readonly uiDown = BUTTON_INDEX.ui_down;
  private readonly uiLeft = BUTTON_INDEX.ui_left;
  private readonly uiRight = BUTTON_INDEX.ui_right;

  constructor(private readonly env: GamepadEnv) {}

  /** Une manette vient d'être annoncée par le navigateur : scruter dès la prochaine image. */
  hint(): void {
    this.known = true;
    this.scanTimer = SCAN_INTERVAL;
  }

  /** Une fois par image. */
  sample(dt: number): void {
    if (this.blocked) return;
    if (!this.known) {
      // Aucune manette connue : on ne regarde qu'une fois par seconde (getGamepads alloue un tableau).
      this.scanTimer += dt;
      if (this.scanTimer < SCAN_INTERVAL) return;
      this.scanTimer = 0;
    }
    let pads: ArrayLike<PadLike | null> | null;
    try {
      pads = this.env.getPads();
    } catch {
      // Permission refusée (iframe) : inutile d'insister.
      this.blocked = true;
      this.drop(false);
      return;
    }
    const pad = this.pick(pads);
    if (!pad) {
      if (this.connected) this.drop(true);
      this.known = false;
      return;
    }
    this.known = true;
    if (!this.connected || pad.index !== this.index || pad.id !== this.padId) this.adopt(pad);
    this.current = pad;
    this.read(pad, dt);
  }

  /** Choisit la manette : celle en cours, sauf si une autre vient d'être utilisée. */
  private pick(pads: ArrayLike<PadLike | null> | null): PadLike | null {
    if (!pads) return null;
    let current: PadLike | null = null;
    let first: PadLike | null = null;
    let busy: PadLike | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!usable(p)) continue;
      if (p.index === this.index && p.id === this.padId) current = p;
      // à qualité égale, on préfère une manette au mapping standard
      if (!first || (first.mapping !== 'standard' && p.mapping === 'standard')) first = p;
      if (!busy && anyPressed(p)) busy = p;
    }
    if (current) {
      if (busy && busy !== current && !anyPressed(current)) return busy;
      return current;
    }
    return busy ?? first;
  }

  private adopt(pad: PadLike): void {
    const wasConnected = this.connected;
    this.releaseButtons();
    this.connected = true;
    this.index = pad.index;
    this.padId = pad.id;
    this.padName = padDisplayName(pad.id);
    this.style = detectPadStyle(pad.id);
    this.version++;
    // Les boutons déjà enfoncés au branchement ne comptent pas comme des appuis.
    for (let i = 0; i < PAD_BUTTONS; i++) {
      const b = pad.buttons[i];
      this.ignore[i] = b && (b.pressed || b.value > 0.5) ? 1 : 0;
      this.prev[i] = 0;
    }
    if (!wasConnected) this.env.connected(this.padName);
  }

  /** La manette active a disparu. */
  private drop(notify: boolean): void {
    const was = this.connected;
    this.releaseButtons();
    this.connected = false;
    this.index = -1;
    this.padId = '';
    this.padName = '';
    this.current = null;
    if (was) {
      this.version++;
      if (notify) this.env.disconnected(this.env.core.device === 'gamepad');
    }
  }

  /** Relâche tout (perte de focus : le navigateur ne livre plus l'état de la manette). */
  releaseButtons(): void {
    this.env.core.latch.releaseSource(SRC_PAD);
    clearSourceAxes(this.axes);
    this.prev.fill(0);
    this.uiDir.fill(0);
  }

  private read(pad: PadLike, dt: number): void {
    const b = pad.buttons;
    const ax = pad.axes;
    const bindings = this.env.bindings;
    const want = this.want;
    want.fill(0);
    let anyDown = false;
    const n = b.length < PAD_BUTTONS ? b.length : PAD_BUTTONS;
    for (let i = 0; i < n; i++) {
      const btn = b[i];
      if (!btn) continue;
      let down: boolean;
      if (i === 6 || i === 7) {
        // gâchettes : bouton tiré de la valeur analogique, avec hystérésis
        const v = btn.value > 0 ? btn.value : btn.pressed ? 1 : 0;
        down = analogButton(shapeTrigger(v), this.prev[i] === 1);
      } else {
        down = btn.pressed || btn.value > 0.5;
      }
      if (this.ignore[i] === 1) {
        if (!down) this.ignore[i] = 0;
        this.prev[i] = 0;
        continue;
      }
      if (down && this.prev[i] === 0 && this.captureCb) {
        // réaffectation : ce bouton est remis à l'écran de réglages, pas au jeu
        this.ignore[i] = 1;
        this.finishCapture(CODES[i]!);
        continue;
      }
      this.prev[i] = down ? 1 : 0;
      if (!down) continue;
      anyDown = true;
      const acts = bindings.actionsFor('gamepad', CODES[i]!);
      for (let k = 0; k < acts.length; k++) {
        const a = acts[k]!;
        if (a < BUTTON_COUNT) want[a] = 1;
      }
    }

    // Stick gauche : déplacement (y de la manette vers le bas → « avant » positif).
    const a = this.axes;
    const moveNorm = shapeStick(ax[0] ?? 0, ax[1] ?? 0, MOVE_STICK, tmp);
    a.moveX = tmp.x;
    a.moveY = -tmp.y;
    // … et croix des menus, avec hystérésis.
    const ui = this.uiDir;
    ui[0] = analogButton(a.moveY, ui[0] === 1, UI_ON, UI_OFF) ? 1 : 0;
    ui[1] = analogButton(-a.moveY, ui[1] === 1, UI_ON, UI_OFF) ? 1 : 0;
    ui[2] = analogButton(-a.moveX, ui[2] === 1, UI_ON, UI_OFF) ? 1 : 0;
    ui[3] = analogButton(a.moveX, ui[3] === 1, UI_ON, UI_OFF) ? 1 : 0;
    if (ui[0] === 1) want[this.uiUp] = 1;
    if (ui[1] === 1) want[this.uiDown] = 1;
    if (ui[2] === 1) want[this.uiLeft] = 1;
    if (ui[3] === 1) want[this.uiRight] = 1;

    // Stick droit : vitesse de rotation × temps réel écoulé.
    const lookNorm = ax.length >= 4 ? shapeStick(ax[2] ?? 0, ax[3] ?? 0, LOOK_STICK, tmp) : 0;
    if (lookNorm > 0) {
      const s = this.env.settings();
      const sens = s.gamepadSensitivity > 0 ? s.gamepadSensitivity : 1;
      const up = s.invertY ? tmp.y : -tmp.y;
      this.env.core.addLook(tmp.x * PAD_YAW_SPEED * sens * dt, up * PAD_PITCH_SPEED * sens * dt);
    }

    // Gâchettes analogiques.
    const lt = b[6];
    const rt = b[7];
    a.brake = lt ? shapeTrigger(lt.value > 0 ? lt.value : lt.pressed ? 1 : 0) : 0;
    a.throttle = rt ? shapeTrigger(rt.value > 0 ? rt.value : rt.pressed ? 1 : 0) : 0;

    const latch = this.env.core.latch;
    for (let i = 0; i < BUTTON_COUNT; i++) latch.set(SRC_PAD, i, want[i] === 1);

    if (padIsActive(moveNorm, lookNorm, a.throttle, a.brake, anyDown)) this.env.activity();
  }

  // ───────────────────────────── réaffectation ─────────────────────────────

  /** Remet le prochain bouton enfoncé à `done` au lieu de le traiter comme une commande. */
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
      console.error('[input] erreur dans la capture de bouton', err);
    }
  }

  // ───────────────────────────── vibration ─────────────────────────────

  /** Fait vibrer la manette active ; retourne false si elle ne sait pas vibrer. */
  rumble(strength: number, seconds: number): boolean {
    const pad = this.current;
    if (!pad || !this.connected) return false;
    const ms = Math.round(seconds * 1000);
    try {
      const act = pad.vibrationActuator as
        | { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> | undefined }
        | null | undefined;
      if (act && typeof act.playEffect === 'function') {
        const p = act.playEffect('dual-rumble', {
          startDelay: 0, duration: ms, weakMagnitude: strength, strongMagnitude: strength * 0.85,
        });
        if (p && typeof p.then === 'function') p.then(undefined, () => {});
        return true;
      }
      const haptics = pad.hapticActuators as
        | ArrayLike<{ pulse?: (value: number, duration: number) => Promise<unknown> | undefined } | null>
        | null | undefined;
      const h = haptics && haptics.length > 0 ? haptics[0] : null;
      if (h && typeof h.pulse === 'function') {
        const p = h.pulse(strength, ms);
        if (p && typeof p.then === 'function') p.then(undefined, () => {});
        return true;
      }
    } catch {
      // manette sans moteur ou navigateur capricieux : pas de vibration
    }
    return false;
  }
}
