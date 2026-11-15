/* =====================================================================================
 * Entrées — fusion des périphériques et choix du périphérique actif.
 *
 * Chaque source (clavier/souris, manette, tactile, script) remplit un `SourceAxes` à chaque
 * scrutation. La fusion additionne les déplacements (bornés au disque unité) et prend le maximum
 * des gâchettes : on peut conduire à la manette tout en gardant une main sur le clavier.
 * Le périphérique actif est le dernier utilisé de façon INTENTIONNELLE (seuils dans les sources),
 * avec un court délai entre deux bascules pour que les pictogrammes de l'interface ne clignotent pas.
 * Aucun accès au DOM, aucune allocation après la construction.
 * ===================================================================================== */

import type { InputDevice } from '@/core/contracts';
import { clamp } from './axes';
import type { Axis2 } from './axes';

/** Identifiants des sources (bits du masque de ButtonLatch). */
export const SRC_KBM = 0;
export const SRC_PAD = 1;
export const SRC_TOUCH = 2;
export const SRC_SCRIPT = 3;
export const SOURCE_COUNT = 4;

/** Valeurs analogiques d'une source pour la scrutation courante. */
export interface SourceAxes {
  moveX: number;
  moveY: number;
  throttle: number;
  brake: number;
}

export function createSourceAxes(): SourceAxes {
  return { moveX: 0, moveY: 0, throttle: 0, brake: 0 };
}

export function clearSourceAxes(a: SourceAxes): void {
  a.moveX = 0;
  a.moveY = 0;
  a.throttle = 0;
  a.brake = 0;
}

const tmp: Axis2 = { x: 0, y: 0 };

/** Fusionne les sources dans `out` : déplacements additionnés et bornés, gâchettes au maximum. */
export function mergeAxes(sources: readonly SourceAxes[], out: SourceAxes): void {
  let x = 0;
  let y = 0;
  let throttle = 0;
  let brake = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]!;
    x += s.moveX;
    y += s.moveY;
    if (s.throttle > throttle) throttle = s.throttle;
    if (s.brake > brake) brake = s.brake;
  }
  const m2 = x * x + y * y;
  if (m2 > 1) {
    const k = 1 / Math.sqrt(m2);
    tmp.x = x * k;
    tmp.y = y * k;
  } else {
    tmp.x = x;
    tmp.y = y;
  }
  out.moveX = tmp.x === tmp.x ? tmp.x : 0;
  out.moveY = tmp.y === tmp.y ? tmp.y : 0;
  out.throttle = clamp(throttle, 0, 1);
  out.brake = clamp(brake, 0, 1);
}

/** Délai minimal entre deux bascules de périphérique (s). */
export const DEVICE_DWELL = 0.25;

/**
 * Périphérique actif = le dernier utilisé. `note(device, t)` est appelé par une source quand elle
 * constate un usage intentionnel ; la bascule est refusée pendant DEVICE_DWELL après la précédente.
 */
export class DeviceTracker {
  device: InputDevice;
  /** Incrémenté à chaque bascule. */
  version = 0;
  private lastSwitch = -Infinity;

  constructor(initial: InputDevice = 'kbm') {
    this.device = initial;
  }

  /** Retourne true si le périphérique actif a changé. */
  note(device: InputDevice, time: number): boolean {
    if (device === this.device) return false;
    if (time - this.lastSwitch < DEVICE_DWELL) return false;
    this.device = device;
    this.lastSwitch = time;
    this.version++;
    return true;
  }

  /** Le périphérique actif a disparu (manette débranchée) : repli immédiat, sans délai. */
  fallback(from: InputDevice, to: InputDevice, time: number): boolean {
    if (this.device !== from || from === to) return false;
    this.device = to;
    this.lastSwitch = time;
    this.version++;
    return true;
  }
}

/** Seuils d'usage intentionnel d'une manette (au-delà des zones mortes : une dérive ne compte pas). */
export const PAD_STICK_ACTIVITY = 0.35;
export const PAD_TRIGGER_ACTIVITY = 0.25;

/** Une manette est-elle en train d'être utilisée ? (norme des sticks APRÈS zone morte, gâchettes mises en forme) */
export function padIsActive(moveNorm: number, lookNorm: number, throttle: number, brake: number, anyButton: boolean): boolean {
  return anyButton || moveNorm >= PAD_STICK_ACTIVITY || lookNorm >= PAD_STICK_ACTIVITY
    || throttle >= PAD_TRIGGER_ACTIVITY || brake >= PAD_TRIGGER_ACTIVITY;
}

/**
 * Détecteur de mouvement intentionnel de la souris : additionne la distance parcourue, qui
 * s'évapore avec le temps ; déclenche au-delà d'un seuil (un bureau qui tremble ne bascule pas
 * l'interface sur « clavier/souris » pendant qu'on joue à la manette).
 */
export class MouseTravel {
  private travel = 0;

  constructor(private readonly threshold = 48, private readonly decayPerSecond = 160) {}

  /** `pixels` parcourus depuis la dernière scrutation ; retourne true si le seuil est franchi. */
  update(pixels: number, dt: number): boolean {
    this.travel = Math.max(0, this.travel - this.decayPerSecond * dt) + pixels;
    if (this.travel >= this.threshold) {
      this.travel = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.travel = 0;
  }
}
