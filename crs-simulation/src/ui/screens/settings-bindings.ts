/* =====================================================================================
 * Paramètres — réaffectation des touches, par les services du module d'entrées
 * ('input.bindings' pour lire, écrire et capturer ; 'input.labels' pour les libellés).
 * Clavier : deux affectations par action ; manette : une. Si le module est absent, la section
 * l'explique au lieu d'afficher une liste vide.
 * ===================================================================================== */

import type { InputBindingsApi, InputLabelsApi } from '@/input/api';
import { RESERVED_KBM } from '@/input/bindings';
import { clear, el, h } from '../core/dom';
import { icon } from '../core/icons';
import type { UiEnv } from '../core/kit';
import type { SettingsPane } from './settings';

type BindAction = InputBindingsApi['actions'][number];
type BindDevice = Parameters<InputBindingsApi['get']>[0];

export function buildBindings(env: UiEnv): SettingsPane {
  const { ctx, widgets } = env;
  const root = h('div');
  const bindings = ctx.service<InputBindingsApi>('input.bindings');
  const labels = ctx.service<InputLabelsApi>('input.labels');
  if (!bindings || !labels) {
    root.append(el('div', 'ui-note ui-note--warn', icon('warning'),
      h('span', undefined, 'Le module des entrées n’est pas chargé : la réaffectation des touches est indisponible dans cette version.')));
    return { el: root };
  }
  const api = bindings;
  const names = labels;

  const intro = h('p', 'ui-para', 'Choisissez une case, puis appuyez sur la nouvelle touche ou le nouveau bouton. Échap annule. Une touche déjà prise est retirée de l’action qui l’utilisait.');
  const list = h('div', 'ui-binds');
  let cancelCapture: (() => void) | null = null;
  let version = -1;
  let labelVersion = -1;

  function stopCapture(): void {
    if (cancelCapture) {
      const cancel = cancelCapture;
      cancelCapture = null;
      cancel();
    }
  }

  function cell(action: BindAction, device: BindDevice, slot: 0 | 1): HTMLButtonElement {
    const codes = api.get(device, action);
    const code = codes[slot];
    const text = code ? names.codeLabel(device, code) : '—';
    const b = h('button', 'ui-btn' + (code ? '' : ' is-empty'), text);
    b.type = 'button';
    const actionName = names.actionName(action);
    const where = device === 'gamepad' ? 'manette' : slot === 0 ? 'clavier, touche principale' : 'clavier, touche secondaire';
    b.setAttribute('aria-label', `${actionName} — ${where} : ${code ? text : 'non affectée'}`);
    b.dataset.id = `bind-${device}-${action}-${slot}`;
    b.addEventListener('click', () => {
      stopCapture();
      b.classList.add('is-listening');
      b.textContent = 'Appuyez…';
      cancelCapture = api.capture(device, (captured: string | null) => {
        cancelCapture = null;
        if (captured === null) {
          render();
          focusCell(b.dataset.id!);
          return;
        }
        const lost = api.set(device, action, slot, captured);
        if (lost === null) {
          const reserved = device === 'kbm' ? RESERVED_KBM[captured] : undefined;
          ctx.ui.notify(reserved
            ? `${names.codeLabel(device, captured)} est réservée (${reserved}) : choisissez une autre touche.`
            : 'Cette touche ne peut pas être affectée à cette action.', 'warn');
        } else if (lost.length > 0) {
          ctx.ui.notify(`${actionName} : ${names.codeLabel(device, captured)} — retirée de ${lost.map((a) => names.actionName(a)).join(', ')}.`, 'info', 5);
        } else {
          ctx.ui.notify(`${actionName} : ${names.codeLabel(device, captured)}`, 'ok', 2.5);
        }
        render();
        focusCell(b.dataset.id!);
      });
    });
    return b;
  }

  function focusCell(id: string): void {
    list.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus({ preventScroll: true });
  }

  function render(): void {
    version = api.version;
    labelVersion = names.version;
    clear(list);
    const head = el('div', 'ui-bind ui-bind--head', h('span', undefined, 'Action'), h('span', undefined, 'Clavier'), h('span', undefined, 'Clavier (2)'), h('span', undefined, 'Manette'));
    list.append(head);
    for (const action of api.actions) {
      list.append(el('div', 'ui-bind', h('span', 'ui-bind__name', names.actionName(action)), cell(action, 'kbm', 0), cell(action, 'kbm', 1), cell(action, 'gamepad', 0)));
    }
  }

  const resetKbm = widgets.button('Clavier par défaut', () => {
    stopCapture();
    api.reset('kbm');
    ctx.ui.notify('Touches du clavier rétablies.', 'ok');
    render();
  }, 'secondary');
  resetKbm.dataset.id = 'bind-reset-kbm';
  const resetPad = widgets.button('Manette par défaut', () => {
    stopCapture();
    api.reset('gamepad');
    ctx.ui.notify('Boutons de la manette rétablis.', 'ok');
    render();
  }, 'secondary');
  resetPad.dataset.id = 'bind-reset-pad';
  const tools = el('div', 'ui-inline', resetKbm, resetPad);
  tools.style.margin = '10px 0 12px';
  const padName = h('p', 'ui-field__hint');
  padName.textContent = names.padName ? `Manette reconnue : ${names.padName}.` : 'Aucune manette détectée : branchez-la et appuyez sur un bouton.';
  render();
  root.append(intro, tools, padName, list);

  return {
    el: root,
    update(): void {
      // affectations ou libellés modifiés ailleurs (autre périphérique actif, clavier reconnu) : la liste suit
      if (cancelCapture) return;
      if (api.version !== version || names.version !== labelVersion) {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.id : undefined;
        render();
        padName.textContent = names.padName ? `Manette reconnue : ${names.padName}.` : 'Aucune manette détectée : branchez-la et appuyez sur un bouton.';
        if (active) focusCell(active);
      }
    },
    dispose(): void {
      stopCapture();
    },
  };
}
