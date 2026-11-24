/* =====================================================================================
 * Entrées — source pilotée par le code (service « input.script »).
 * Sert aux tests de bout en bout des autres modules, au didacticiel et aux démonstrations :
 * elle s'ajoute aux périphériques réels et ne change pas le périphérique actif.
 * ===================================================================================== */

import type { Button } from '@/core/contracts';
import type { InputScriptApi } from './api';
import { clamp, clampUnit, finite } from './axes';
import type { Axis2 } from './axes';
import { buttonIndex } from './buttons';
import type { InputCore } from './core';
import { SRC_SCRIPT, clearSourceAxes, createSourceAxes } from './merge';
import type { SourceAxes } from './merge';

const tmp: Axis2 = { x: 0, y: 0 };

export class ScriptSource implements InputScriptApi {
  readonly axes: SourceAxes = createSourceAxes();

  /** `changed` : prévenu quand un axe change, pour que la prochaine lecture en tienne compte. */
  constructor(private readonly core: InputCore, private readonly changed: () => void = () => {}) {}

  press(button: Button): void {
    this.core.latch.set(SRC_SCRIPT, buttonIndex(button), true);
  }

  release(button: Button): void {
    this.core.latch.set(SRC_SCRIPT, buttonIndex(button), false);
  }

  tap(button: Button): void {
    this.core.latch.pulse(SRC_SCRIPT, buttonIndex(button));
  }

  setMove(x: number, y: number): void {
    clampUnit(finite(x), finite(y), tmp);
    this.axes.moveX = tmp.x;
    this.axes.moveY = tmp.y;
    this.changed();
  }

  setTriggers(throttle: number, brake: number): void {
    this.axes.throttle = clamp(finite(throttle), 0, 1);
    this.axes.brake = clamp(finite(brake), 0, 1);
    this.changed();
  }

  look(dx: number, dy: number): void {
    this.core.addLook(finite(dx), finite(dy));
  }

  wheel(notches: number): void {
    this.core.addWheel(finite(notches));
  }

  clear(): void {
    this.core.latch.releaseSource(SRC_SCRIPT);
    clearSourceAxes(this.axes);
    this.changed();
  }
}
