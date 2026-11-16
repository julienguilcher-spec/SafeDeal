/* =====================================================================================
 * Entrées — système du module (ordre INPUT) : assemble les sources, publie ctx.input et les
 * services, scrute une fois par image et verrouille les fronts au début de chaque pas de
 * simulation (update) et de chaque image (frame).
 *
 * Rappel de la boucle du moteur : pour une image, update() × N (N ≥ 0) puis frame() × 1.
 *   update() : scrutation des périphériques si ce n'est pas déjà fait pour cette image, puis
 *              beginStep() → les systèmes suivants du même pas lisent la vue « simulation ».
 *   frame()  : scrutation si aucun pas n'a eu lieu, puis beginFrame() → les systèmes suivants
 *              (interface…) lisent la vue « image », y compris en pause.
 * Hors navigateur (ctx.headless), aucun périphérique n'est écouté : seule la source « script »
 * (et une manette injectée par les options) alimente l'état.
 * ===================================================================================== */

import type { Button, GameContext, GameSystem, InputDevice } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import {
  INPUT_BINDINGS_SERVICE, INPUT_LABELS_SERVICE, INPUT_POINTER_SERVICE, INPUT_SCRIPT_SERVICE, INPUT_TOUCH_SERVICE,
} from './api';
import type { InputBindingsApi, InputLabelsApi, InputPointerApi, KeyboardLayout, PadStyle } from './api';
import { BindingStore } from './bindings';
import type { BindDevice } from './bindings';
import { ACTIONS, BUTTON_INDEX, actionName } from './buttons';
import type { BindAction } from './buttons';
import { InputCore } from './core';
import { GamepadSource } from './gamepad';
import type { PadLike } from './gamepad';
import { KbmSource } from './kbm';
import { KeyLabels, guessKeyboardLayout, padLabel } from './labels';
import { DeviceTracker, SRC_SYSTEM, mergeAxes, createSourceAxes } from './merge';
import type { SourceAxes } from './merge';
import { ScriptSource } from './script';
import { TouchController } from './touch/controller';
import { touchLabel } from './touch/layouts';

export interface InputSystemOptions {
  /** Horloge réelle en millisecondes (défaut : performance.now) — injectable pour les tests. */
  now?: () => number;
  /** Remplace navigator.getGamepads() — permet de tester la manette sans navigateur. */
  getPads?: () => ArrayLike<PadLike | null> | null;
}

/** Délai pendant lequel les événements de souris qui suivent un toucher sont tenus pour fabriqués (ms). */
const SYNTHETIC_MOUSE_MS = 900;
/** Délai minimal entre deux mises en pause automatiques (ms). */
const AUTO_PAUSE_MS = 1000;
/** Sans pas de simulation pendant ce temps réel, la vue « simulation » est recalée (s). */
const STEP_IDLE_LIMIT = 0.5;

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export class InputSystem implements GameSystem {
  readonly id = 'input';
  readonly order = SystemOrder.INPUT;

  readonly core = new InputCore();
  readonly tracker = new DeviceTracker('kbm');
  readonly keyLabels = new KeyLabels('azerty');
  bindings!: BindingStore;
  touch!: TouchController;
  script!: ScriptSource;
  kbm: KbmSource | null = null;
  pad: GamepadSource | null = null;

  private ctx!: GameContext;
  private readonly now: () => number;
  private readonly getPadsOption: InputSystemOptions['getPads'];
  private readonly sources: SourceAxes[] = [];
  private readonly merged = createSourceAxes();
  private polled = false;
  private stepped = false;
  private stepIdle = 0;
  private lastPoll = -1;
  private lastTouchAt = -1e12;
  private lastAutoPause = -1e12;
  private focused = true;
  private touchPrimary = false;
  private headless = true;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: InputSystemOptions = {}) {
    this.now = options.now ?? defaultNow;
    this.getPadsOption = options.getPads;
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.headless = ctx.headless;
    this.bindings = new BindingStore(ctx.save);
    this.script = new ScriptSource(this.core, () => {
      this.polled = false;
    });
    this.touch = new TouchController({
      core: this.core,
      ctx,
      activity: () => this.noteDevice('touch'),
      haptic: (ms) => this.haptic(ms),
    });
    this.core.rumbleSink = (strength, seconds) => this.rumble(strength, seconds);
    ctx.input = this.core;
    ctx.provide(INPUT_TOUCH_SERVICE, this.touch);
    ctx.provide(INPUT_LABELS_SERVICE, this.labelsApi);
    ctx.provide(INPUT_BINDINGS_SERVICE, this.bindingsApi);
    ctx.provide(INPUT_SCRIPT_SERVICE, this.script);
    ctx.provide(INPUT_POINTER_SERVICE, this.pointerApi);
  }

  init(ctx: GameContext): void {
    const dom = !ctx.headless && typeof window !== 'undefined' && typeof document !== 'undefined';
    this.headless = !dom;

    // Manette : navigateur, ou source injectée (tests).
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { getGamepads?: () => (PadLike | null)[] }) : null;
    const getPads = this.getPadsOption ?? (dom && nav && typeof nav.getGamepads === 'function' ? () => nav.getGamepads!() : null);
    if (getPads) {
      this.pad = new GamepadSource({
        core: this.core,
        bindings: this.bindings,
        settings: () => ctx.settings.values,
        getPads,
        // appelé pendant la scrutation : l'heure du suivi vient d'être mise à jour
        activity: () => {
          this.tracker.note('gamepad');
        },
        connected: () => this.notify('Manette connectée.'),
        disconnected: (wasActive) => {
          this.tracker.fallback('gamepad', this.touchPrimary ? 'touch' : 'kbm');
          this.notify('Manette débranchée.');
          if (wasActive) this.autoPause();
        },
      });
    }

    if (dom) this.initDom(ctx);

    this.sources.length = 0;
    if (this.kbm) this.sources.push(this.kbm.axes);
    if (this.pad) this.sources.push(this.pad.axes);
    if (this.touch.overlay) this.sources.push(this.touch.overlay.axes);
    this.sources.push(this.script.axes);

    this.cleanups.push(ctx.events.on('session:paused', (e) => {
      if (e.paused && this.kbm) this.kbm.releasePointer();
    }));
    this.cleanups.push(ctx.events.on('session:ended', () => {
      if (this.kbm) this.kbm.releasePointer();
    }));
    this.cleanups.push(this.bindings.onChange(() => {
      // une touche tenue pendant sa réaffectation ne doit pas rester enfoncée
      if (this.kbm) this.kbm.releaseAll();
      if (this.pad) this.pad.releaseButtons();
    }));
    this.core.device = this.tracker.device;
  }

  private initDom(ctx: GameContext): void {
    const win = window;
    const doc = document;
    const gameEl = doc.getElementById('game') ?? (ctx.view ? ctx.view.renderer.domElement : null) ?? doc.body;
    const uiEl = doc.getElementById('ui') ?? doc.body;

    // Disposition du clavier : supposée d'après la langue, puis précisée par le navigateur et par les frappes.
    const nav = navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<{ forEach(cb: (key: string, code: string) => void): void }> } };
    this.keyLabels.setLayout(guessKeyboardLayout(nav.languages && nav.languages.length ? nav.languages : [nav.language || 'fr']));
    try {
      const p = nav.keyboard && typeof nav.keyboard.getLayoutMap === 'function' ? nav.keyboard.getLayoutMap() : null;
      if (p) p.then((map) => map.forEach((key, code) => this.keyLabels.learn(code, key)), () => {});
    } catch {
      // API absente ou interdite (iframe) : on garde la supposition
    }

    // Écran tactile comme pointeur principal : la surcouche est affichée d'emblée.
    try {
      this.touchPrimary = typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
    } catch {
      this.touchPrimary = false;
    }
    if (this.touchPrimary) this.tracker.device = 'touch';

    this.kbm = new KbmSource({
      core: this.core,
      bindings: this.bindings,
      labels: this.keyLabels,
      gameEl,
      settings: () => ctx.settings.values,
      canLock: () => !ctx.ui.modal && ctx.session.phase !== 'paused',
      modalOpen: () => ctx.ui.modal,
      syntheticMouse: () => this.now() - this.lastTouchAt < SYNTHETIC_MOUSE_MS,
      extraGameTarget: (el) => el.classList.contains('ct-zone'),
      notify: (text) => this.notify(text, 8),
      activity: () => this.noteDevice('kbm'),
      autoPause: () => this.autoPause(),
    });
    this.kbm.attach();
    this.touch.attach(uiEl);

    const listen = (target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions | boolean): void => {
      target.addEventListener(type, handler, options);
      this.cleanups.push(() => target.removeEventListener(type, handler, options));
    };
    // Un doigt posé n'importe où (jeu ou interface) fait du tactile le périphérique actif.
    const onTouch: EventListener = () => {
      this.lastTouchAt = this.now();
      this.noteDevice('touch');
    };
    const onPointer: EventListener = (e) => {
      const type = (e as PointerEvent).pointerType;
      if (type === 'touch' || type === 'pen') onTouch(e);
    };
    const onTouchEnd: EventListener = () => {
      this.lastTouchAt = this.now();
    };
    listen(win, 'touchstart', onTouch, { capture: true, passive: true });
    listen(win, 'touchend', onTouchEnd, { capture: true, passive: true });
    listen(win, 'pointerdown', onPointer, { capture: true, passive: true });
    listen(win, 'pointerup', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') onTouchEnd(e);
    }, { capture: true, passive: true });

    // Manette branchée ou débranchée à chaud.
    listen(win, 'gamepadconnected', () => {
      if (this.pad) this.pad.hint();
    });
    listen(win, 'gamepaddisconnected', () => {
      if (this.pad) this.pad.hint();
    });

    // Perte de focus : le navigateur ne livre plus rien de fiable ; tout est relâché et on demande la pause.
    // (On part du principe que la fenêtre a le focus : un jeu dans une iframe pas encore cliquée doit déjà répondre à la manette.)
    this.focused = true;
    listen(win, 'blur', () => {
      this.focused = false;
      if (this.pad) this.pad.releaseButtons();
      if (this.touch.overlay) this.touch.overlay.cancelAll();
      this.autoPause();
    });
    listen(win, 'focus', () => {
      this.focused = true;
    });
  }

  update(_dt: number): void {
    if (!this.polled || this.headless) {
      this.poll();
      this.polled = true;
    }
    this.stepped = true;
    this.core.beginStep();
  }

  frame(dt: number): void {
    if (!this.polled) this.poll();
    this.polled = false;
    if (this.stepped) this.stepIdle = 0;
    else this.stepIdle += dt > 0 ? dt : 0;
    this.stepped = false;
    const ctx = this.ctx;
    const simRunning = ctx.session.phase === 'playing' && this.stepIdle < STEP_IDLE_LIMIT;
    this.core.beginFrame(simRunning);
    if (this.kbm) this.kbm.enforceLockPolicy();
    this.touch.update(dt, this.core.device);
  }

  reset(): void {
    // Nouvelle session : rien de ce qui a été pressé dans les menus ne doit y parvenir.
    this.core.resetEdges();
    this.stepIdle = 0;
  }

  dispose(): void {
    for (let i = 0; i < this.cleanups.length; i++) {
      try {
        this.cleanups[i]!();
      } catch (err) {
        console.error('[input] erreur au démontage', err);
      }
    }
    this.cleanups.length = 0;
    if (this.kbm) this.kbm.detach();
    this.kbm = null;
    this.touch.dispose();
    this.core.latch.clear();
    this.core.rumbleSink = null;
  }

  // ───────────────────────────── scrutation ─────────────────────────────

  /** Lit tous les périphériques (au plus une fois par image) et fusionne leurs axes. */
  private poll(): void {
    const t = this.now();
    let dt = this.lastPoll < 0 ? 0 : (t - this.lastPoll) / 1000;
    this.lastPoll = t;
    if (!(dt >= 0)) dt = 0;
    else if (dt > 0.1) dt = 0.1;
    this.tracker.time = t / 1000;

    if (this.kbm) this.kbm.sample(dt);
    if (this.pad && this.focused) this.pad.sample(dt);
    this.touch.sample();

    const core = this.core;
    const merged = this.merged;
    // À pied, la norme du déplacement est bornée à 1 ; en véhicule, volant et accélérateur sont indépendants.
    mergeAxes(this.sources, merged, this.ctx.player.vehicle() === null);
    core.moveX = merged.moveX;
    core.moveY = merged.moveY;
    core.throttle = merged.throttle;
    core.brake = merged.brake;
    core.device = this.tracker.device;
  }

  /** Usage intentionnel constaté par un gestionnaire d'événement (hors scrutation). */
  private noteDevice(device: InputDevice): void {
    this.tracker.time = this.now() / 1000;
    this.tracker.note(device);
  }

  // ───────────────────────────── pause automatique, vibration, messages ─────────────────────────────

  /**
   * Appui bref sur « pause » fabriqué par le module : souris rendue par Échap (le navigateur ne
   * transmet pas la touche), fenêtre qui perd le focus, manette active débranchée. Uniquement
   * en cours de jeu, et jamais deux fois de suite (sinon l'interface rouvrirait puis refermerait la pause).
   */
  private autoPause(): void {
    const t = this.now();
    if (t - this.lastAutoPause < AUTO_PAUSE_MS) return;
    const ctx = this.ctx;
    if (ctx.session.phase !== 'playing' || ctx.ui.modal) return;
    this.lastAutoPause = t;
    this.core.latch.pulse(SRC_SYSTEM, BUTTON_INDEX.pause);
  }

  private rumble(strength: number, seconds: number): void {
    if (!this.ctx.settings.values.vibration) return;
    const device = this.core.device;
    if (device === 'gamepad') {
      if (this.pad) this.pad.rumble(strength, seconds);
    } else if (device === 'touch') {
      this.vibrate(Math.round(seconds * 1000 * (0.35 + 0.65 * strength)));
    }
    // clavier/souris : rien à faire vibrer
  }

  private haptic(ms: number): void {
    if (this.ctx.settings.values.vibration) this.vibrate(ms);
  }

  private vibrate(ms: number): void {
    if (this.headless || !(ms > 0)) return;
    try {
      const nav = navigator as Navigator & { vibrate?: (pattern: number) => boolean; userActivation?: { hasBeenActive: boolean } };
      // Avant le premier geste complet de l'utilisateur, le navigateur refuse la vibration (et s'en plaint en console).
      if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
      if (typeof nav.vibrate === 'function') nav.vibrate(ms);
    } catch {
      // vibration interdite ou absente
    }
  }

  private notify(text: string, seconds = 5): void {
    try {
      this.ctx.ui.notify(text, 'info', seconds);
    } catch (err) {
      console.error('[input] notification impossible', err);
    }
  }

  // ───────────────────────────── services ─────────────────────────────

  private bindDevice(device: InputDevice | undefined): BindDevice | 'touch' {
    const d = device ?? this.core.device;
    return d === 'gamepad' ? 'gamepad' : d === 'touch' ? 'touch' : 'kbm';
  }

  private codeLabel(device: BindDevice, code: string): string {
    return device === 'gamepad' ? padLabel(code, this.pad ? this.pad.style : 'lettres') : this.keyLabels.label(code);
  }

  readonly labelsApi: InputLabelsApi = ((self: InputSystem): InputLabelsApi => ({
    labelFor(button: Button, device?: InputDevice): string {
      const d = self.bindDevice(device);
      if (d === 'touch') return touchLabel(button, self.touch.labelLayout());
      const codes = self.bindings.get(d, button);
      return codes.length > 0 ? self.codeLabel(d, codes[0]!) : '';
    },
    labelsFor(action: BindAction, device?: InputDevice): string[] {
      const d = self.bindDevice(device);
      if (d === 'touch') {
        const l = touchLabel(action as Button, self.touch.labelLayout());
        return l ? [l] : [];
      }
      return self.bindings.get(d, action).map((c) => self.codeLabel(d, c));
    },
    moveLabel(device?: InputDevice): string {
      const d = self.bindDevice(device);
      if (d === 'touch') return 'Joystick';
      if (d === 'gamepad') return 'Stick gauche';
      const b = self.bindings;
      return self.keyLabels.moveLabel(
        b.get('kbm', 'move_forward')[0] ?? '', b.get('kbm', 'move_left')[0] ?? '',
        b.get('kbm', 'move_back')[0] ?? '', b.get('kbm', 'move_right')[0] ?? '',
      );
    },
    lookLabel(device?: InputDevice): string {
      const d = self.bindDevice(device);
      return d === 'touch' ? 'Glisser à droite' : d === 'gamepad' ? 'Stick droit' : 'Souris';
    },
    actionName,
    codeLabel(device: BindDevice, code: string): string {
      return self.codeLabel(device, code);
    },
    get padStyle(): PadStyle {
      return self.pad ? self.pad.style : 'lettres';
    },
    get padName(): string {
      return self.pad ? self.pad.padName : '';
    },
    get keyboardLayout(): KeyboardLayout {
      return self.keyLabels.layout;
    },
    get version(): number {
      return self.bindings.version + self.keyLabels.version + self.tracker.version + self.touch.version + (self.pad ? self.pad.version : 0);
    },
  }))(this);

  readonly bindingsApi: InputBindingsApi = ((self: InputSystem): InputBindingsApi => ({
    actions: ACTIONS,
    get: (device, action) => self.bindings.get(device, action),
    set: (device, action, slot, code) => self.bindings.set(device, action, slot, code),
    conflicts: (device, action, code) => self.bindings.conflicts(device, action, code),
    reset: (device) => self.bindings.reset(device),
    resetAction: (device, action) => self.bindings.resetAction(device, action),
    isDefault: (device, action) => self.bindings.isDefault(device, action),
    capture(device: BindDevice, done: (code: string | null) => void): () => void {
      if (device === 'gamepad') {
        if (!self.pad) {
          done(null);
          return () => {};
        }
        // n'importe quelle touche du clavier annule l'attente d'un bouton de manette
        let cancelKeys = (): void => {};
        const cancelPad = self.pad.capture((code) => {
          cancelKeys();
          done(code);
        });
        if (self.kbm) {
          cancelKeys = self.kbm.capture(() => {
            cancelPad();
            done(null);
          });
        }
        return () => {
          cancelPad();
          cancelKeys();
        };
      }
      if (!self.kbm) {
        done(null);
        return () => {};
      }
      return self.kbm.capture(done);
    },
    get version(): number {
      return self.bindings.version;
    },
  }))(this);

  readonly pointerApi: InputPointerApi = ((self: InputSystem): InputPointerApi => ({
    get locked(): boolean {
      return self.core.pointerLocked;
    },
    get fallback(): boolean {
      return self.kbm ? self.kbm.fallback : false;
    },
    request(): void {
      const ctx = self.ctx;
      if (self.kbm && !ctx.ui.modal && ctx.session.phase !== 'paused') self.kbm.requestPointer();
    },
    release(): void {
      if (self.kbm) self.kbm.releasePointer();
    },
  }))(this);
}
