/* =====================================================================================
 * HUD — état physique : santé, endurance, exposition au gaz, blessure, équipement porté.
 * Zone : bas gauche ; en tactile, au centre en bas (au-dessus de la barre d'objets), le coin
 * bas gauche étant occupé par le joystick.
 * ===================================================================================== */

import type { HudSlot } from '@/core/extensions';
import { Attr, Shown, Transform, Txt, el, h } from '../core/dom';
import { icon } from '../core/icons';
import { healthTone, injuryLabel } from './model';
import type { HudEnv, HudPart, HudState } from './types';

function bar(className: string): { el: HTMLElement; fill: Transform; tone: Attr; last: number } {
  const root = h('div', 'hud-bar ' + className);
  const fill = h('i');
  root.append(fill);
  return { el: root, fill: new Transform(fill), tone: new Attr(root, 'data-tone'), last: -1 };
}

function setBar(b: { fill: Transform; last: number }, v: number): void {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  if (Math.abs(c - b.last) < 0.004) return;
  b.last = c;
  b.fill.set(`scaleX(${c.toFixed(3)})`);
}

export function createStatus(_env: HudEnv): HudPart {
  const root = h('div', 'hud-box hud-status');
  const health = bar('hud-bar--health');
  const stamina = bar('hud-bar--thin hud-bar--stamina');
  const gas = bar('hud-bar--thin hud-bar--gas');
  const healthNum = h('span', 'hud-status__num');
  const rowHealth = el('div', 'hud-status__row', icon('heart', 'hud-ic'), health.el, healthNum);
  rowHealth.setAttribute('aria-label', 'Santé');
  const rowStamina = el('div', 'hud-status__row hud-status__row--bare', icon('bolt', 'hud-ic'), stamina.el);
  rowStamina.setAttribute('aria-label', 'Endurance');
  const gasCap = h('span', 'hud-cap', 'gaz');
  const rowGas = el('div', 'hud-status__row', icon('mask', 'hud-ic'), gas.el, gasCap);
  rowGas.setAttribute('aria-label', 'Exposition au gaz lacrymogène');
  const chips = h('div', 'hud-status__chips');
  const injuryChip = h('span', 'hud-chip hud-chip--warn');
  const fireChip = h('span', 'hud-chip hud-chip--alert', 'En feu');
  const maskChip = h('span', 'hud-chip hud-chip--gear', 'Masque');
  const visorChip = h('span', 'hud-chip hud-chip--gear', 'Visière');
  chips.append(injuryChip, fireChip, maskChip, visorChip);
  root.append(rowHealth, rowStamina, rowGas, chips);

  const num = new Txt(healthNum);
  const injury = new Txt(injuryChip);
  const injuryTone = new Attr(injuryChip, 'class');
  const showGas = new Shown(rowGas);
  const showChips = new Shown(chips);
  const showInjury = new Shown(injuryChip);
  const showFire = new Shown(fireChip);
  const showMask = new Shown(maskChip);
  const showVisor = new Shown(visorChip);

  return {
    id: 'status',
    el: root,
    order: 20,
    slot(s: HudState): HudSlot {
      return s.touch === 'none' ? 'bottom-left' : 'bottom';
    },
    visible(s: HudState): boolean {
      return s.profile.status && s.person !== null;
    },
    tick(s: HudState): void {
      const p = s.person;
      if (!p) return;
      num.set(String(Math.max(0, Math.round(p.health))));
      health.tone.set(healthTone(p.health));
      const label = injuryLabel(p.injury);
      injury.set(label);
      injuryTone.set(p.injury === 'light' ? 'hud-chip hud-chip--warn' : 'hud-chip hud-chip--alert');
      const hasInjury = label !== '';
      const onFire = p.burning > 0.05;
      const mask = p.look.gasMask;
      const visor = p.look.visorDown;
      showInjury.set(hasInjury);
      showFire.set(onFire);
      showMask.set(mask);
      showVisor.set(visor);
      showChips.set(hasInjury || onFire || mask || visor);
      showGas.set(p.gas > 0.03);
    },
    frame(_dt: number, s: HudState): void {
      const p = s.person;
      if (!p) return;
      setBar(health, p.health / 100);
      setBar(stamina, p.stamina / 100);
      if (showGas.value) setBar(gas, p.gas);
    },
  };
}
