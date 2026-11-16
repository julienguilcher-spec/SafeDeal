/* =====================================================================================
 * HUD — barre d'objets (quantités, objet en main) et invite d'interaction (libellé de la touche,
 * progression). Zone : bas centre.
 *
 * En tactile, la barre d'objets est celle de la surcouche du module d'entrées : cet élément la
 * remplit (InputTouchApi.setItemBar) et masque la sienne ; de même l'invite passe par le bouton
 * contextuel (setInteractLabel) et seule la progression reste affichée ici.
 * ===================================================================================== */

import type { ItemStack, Person } from '@/core/contracts';
import type { HudSlot } from '@/core/extensions';
import type { InputTouchApi, TouchItem } from '@/input/api';
import { Flag, Shown, Transform, Txt, clear, h } from '../core/dom';
import { hasIcon, icon, itemIconName } from '../core/icons';
import { itemName, showsCount } from './model';
import type { HudEnv, HudPart, HudState } from './types';

const MAX_SLOTS = 9;
/** Durée d'affichage du nom de l'objet après un changement (s). */
const NAME_TIME = 2.4;

function signature(p: Person, device: string): string {
  let sig = device + '|' + p.active;
  const inv = p.inventory;
  for (let i = 0; i < inv.length && i < MAX_SLOTS; i++) sig += '|' + inv[i]!.id + ':' + inv[i]!.count;
  return sig;
}

export function createItemBar(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const root = h('div', 'hud-items');
  const nameEl = h('div', 'hud-items__name is-off');
  const row = h('div', 'hud-items__row');
  root.append(nameEl, row);
  const name = new Txt(nameEl);
  const nameOff = new Flag(nameEl, 'is-off');
  const rowShown = new Shown(row);
  let sig = '';
  let lastActive = -2;
  let nameLeft = 0;
  let cooldown: Transform | null = null;
  let cooldownShown: Shown | null = null;
  let touchFed = false;

  function rebuild(p: Person, s: HudState): void {
    clear(row);
    cooldown = null;
    cooldownShown = null;
    const inv = p.inventory;
    const touchItems: TouchItem[] = [];
    for (let i = 0; i < inv.length && i < MAX_SLOTS; i++) {
      const stack: ItemStack = inv[i]!;
      const def = ctx.actions.def(stack.id);
      const label = itemName(stack.id, def?.name);
      const counted = showsCount(stack.id, stack.count, def?.maxCount);
      const slot = h('div', 'hud-item');
      slot.title = label;
      if (i === p.active) slot.classList.add('is-active');
      if (counted && stack.count <= 0) slot.classList.add('is-empty');
      const iconKey = 'item_' + stack.id;
      if (hasIcon(iconKey)) slot.append(icon(itemIconName(stack.id)));
      else slot.append(h('span', 'hud-item__txt', (def?.icon || label).slice(0, 4).toUpperCase()));
      if (s.device === 'kbm') slot.append(h('span', 'hud-item__key', String(i + 1)));
      if (counted) slot.append(h('span', 'hud-item__n', String(stack.count)));
      if (i === p.active) {
        const cd = h('span', 'hud-item__cd');
        cd.hidden = true;
        slot.append(cd);
        cooldown = new Transform(cd);
        cooldownShown = new Shown(cd);
      }
      row.append(slot);
      const item: TouchItem = { icon: def?.icon || label.slice(0, 3).toUpperCase(), label: label.split(' ')[0] };
      if (counted) item.count = stack.count;
      touchItems.push(item);
    }
    const touch = ctx.service<InputTouchApi>('input.touch');
    if (touch) {
      touch.setItemBar(touchItems, p.active);
      touchFed = true;
    }
  }

  function releaseTouch(): void {
    if (!touchFed) return;
    touchFed = false;
    ctx.service<InputTouchApi>('input.touch')?.setItemBar(null);
  }

  return {
    id: 'items',
    el: root,
    order: 40,
    slot(): HudSlot {
      return 'bottom';
    },
    visible(s: HudState): boolean {
      return s.profile.items && s.person !== null && s.person.inventory.length > 0;
    },
    tick(s: HudState): void {
      const p = s.person;
      if (!p) return;
      // en tactile, la surcouche affiche sa propre barre : on ne montre ici que le nom de l'objet
      rowShown.set(s.touch === 'none');
      const next = signature(p, s.device);
      if (next !== sig) {
        sig = next;
        rebuild(p, s);
      }
      if (p.active !== lastActive) {
        const first = lastActive === -2;
        lastActive = p.active;
        const stack = p.active >= 0 ? p.inventory[p.active] : undefined;
        name.set(stack ? itemName(stack.id, ctx.actions.def(stack.id)?.name) : 'Mains nues');
        nameLeft = first ? 0 : NAME_TIME;
        nameOff.set(nameLeft <= 0);
      }
    },
    frame(dt: number, s: HudState): void {
      if (nameLeft > 0) {
        nameLeft -= dt;
        if (nameLeft <= 0) nameOff.set(true);
      }
      const p = s.person;
      if (!p || !cooldown || !cooldownShown) return;
      const stack = p.active >= 0 ? p.inventory[p.active] : undefined;
      const def = stack ? ctx.actions.def(stack.id) : undefined;
      const total = def && def.cooldown > 0 ? def.cooldown : 0;
      const left = stack && total > 0 ? stack.cooldown / total : 0;
      cooldownShown.set(left > 0.01);
      if (left > 0.01) cooldown.set(`scaleX(${Math.min(1, left).toFixed(2)})`);
    },
    hidden(): void {
      sig = '';
      lastActive = -2;
      releaseTouch();
    },
    reset(): void {
      sig = '';
      lastActive = -2;
      nameLeft = 0;
      nameOff.set(true);
    },
    dispose(): void {
      releaseTouch();
    },
  };
}

export function createPrompt(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const root = h('div', 'hud-prompt');
  const pill = h('div', 'hud-prompt__pill');
  const keyEl = h('span', 'ui-key');
  const labelEl = h('span');
  pill.append(keyEl, labelEl);
  const barEl = h('div', 'hud-prompt__bar');
  const fillEl = h('i');
  barEl.append(fillEl);
  root.append(pill, barEl);

  const key = new Txt(keyEl);
  const keyShown = new Shown(keyEl);
  const noKey = new Flag(pill, 'is-nokey');
  const label = new Txt(labelEl);
  const pillShown = new Shown(pill);
  const barShown = new Shown(barEl);
  const fill = new Transform(fillEl);
  let touchLabel: string | null | undefined = undefined;

  function feedTouch(text: string | null): void {
    if (text === touchLabel) return;
    touchLabel = text;
    ctx.service<InputTouchApi>('input.touch')?.setInteractLabel(text);
  }

  return {
    id: 'prompt',
    el: root,
    order: 10,
    slot(): HudSlot {
      return 'bottom';
    },
    visible(s: HudState): boolean {
      if (!s.person) return false;
      return ctx.player.state.prompt !== null || ctx.interactions.current(s.person) !== null;
    },
    tick(s: HudState): void {
      const p = s.person;
      if (!p) return;
      const current = ctx.interactions.current(p);
      const prompt = ctx.player.state.prompt;
      const opt = current ? current.opt : prompt;
      if (!opt) return;
      const busy = current !== null && opt.duration > 0;
      label.set(busy ? opt.label + '…' : opt.label);
      const touch = s.touch !== 'none';
      // au doigt, le bouton contextuel porte déjà le libellé : la pastille n'apparaît que pendant l'action
      feedTouch(prompt ? prompt.label : null);
      pillShown.set(!touch || busy);
      const k = touch || busy ? '' : env.keyLabel('interact');
      key.set(k);
      keyShown.set(k !== '');
      noKey.set(k === '');
      barShown.set(busy);
    },
    frame(_dt: number, s: HudState): void {
      const p = s.person;
      if (!p || !barShown.value) return;
      const current = ctx.interactions.current(p);
      if (!current || current.opt.duration <= 0) return;
      const v = current.elapsed / current.opt.duration;
      fill.set(`scaleX(${(v < 0 ? 0 : v > 1 ? 1 : v).toFixed(3)})`);
    },
    hidden(): void {
      feedTouch(null);
      touchLabel = undefined;
    },
    dispose(): void {
      if (touchLabel) ctx.service<InputTouchApi>('input.touch')?.setInteractLabel(null);
    },
  };
}
