/* =====================================================================================
 * Interface — composants : curseur, sélecteur segmenté, interrupteur, carte de choix, pastille,
 * compteur, onglets, champ, boîte de confirmation, infobulle.
 *
 * Tous sont utilisables à la souris, au doigt (cibles ≥ 44 px), au clavier et à la manette : ce sont
 * des <button> (validation native) ou, pour le curseur, un élément focalisable qui intercepte
 * « ui:nav » gauche / droite (voir focus.ts).
 * ===================================================================================== */

import { Txt, el, h } from './dom';
import { icon } from './icons';
import type { IconName } from './icons';
import type { NavDir } from './focus';

export type Feedback = (kind: 'tick' | 'accept' | 'alert') => void;

export interface SliderOptions {
  /** Libellé pour les lecteurs d'écran. */
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Valeurs permises (échelle non linéaire) : remplace min / max / step. */
  stops?: readonly number[];
  /** Texte de la valeur pour les lecteurs d'écran (aria-valuetext). */
  format?(value: number): string;
  variant?: 'heat' | 'plain';
  /** Appelé pendant le glissement et à chaque pas. */
  onInput(value: number): void;
}

export interface SliderHandle {
  readonly el: HTMLElement;
  readonly value: number;
  /** Change la valeur affichée sans appeler onInput. */
  set(value: number): void;
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  tip?: string;
}

export interface ValueHandle<T> {
  readonly el: HTMLElement;
  set(value: T): void;
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

export interface TabsHandle<T extends string> {
  readonly el: HTMLElement;
  readonly value: T;
  set(id: T): void;
  /** Texte secondaire à droite de l'onglet (valeur courante de la section). */
  setNote(id: T, note: string): void;
  /** Onglet suivant (+1) ou précédent (−1), sans bouclage. */
  step(delta: -1 | 1): void;
  button(id: T): HTMLButtonElement | undefined;
}

export interface FieldHandle {
  readonly el: HTMLElement;
  /** Valeur courante affichée à droite du libellé. */
  setValue(text: string): void;
  /** Ligne d'aide sous la commande ('' la masque). */
  setHint(text: string): void;
}

export interface DialogOptions {
  title: string;
  text: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel?(): void;
}

export class Widgets {
  constructor(private readonly feedback: Feedback, private readonly focusGroup: (container: HTMLElement) => { dispose(): void }) {}

  /** Bouton stylé. */
  button(label: string, onClick: () => void, variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary', iconName?: IconName): HTMLButtonElement {
    const b = h('button', 'ui-btn' + (variant === 'secondary' ? '' : ' ui-btn--' + variant));
    b.type = 'button';
    if (iconName) b.append(icon(iconName));
    b.append(h('span', 'ui-lbl', label));
    b.addEventListener('click', () => {
      this.feedback('accept');
      onClick();
    });
    return b;
  }

  /** Bouton réduit à un pictogramme (libellé lu par les lecteurs d'écran et en infobulle). */
  iconButton(iconName: IconName, label: string, onClick: () => void, variant: 'secondary' | 'danger' | 'ghost' = 'ghost'): HTMLButtonElement {
    const b = h('button', 'ui-btn ui-btn--icon' + (variant === 'secondary' ? '' : ' ui-btn--' + variant));
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.setAttribute('data-tip', label);
    b.append(icon(iconName));
    b.addEventListener('click', () => {
      this.feedback('accept');
      onClick();
    });
    return b;
  }

  slider(options: SliderOptions): SliderHandle {
    const stops = options.stops && options.stops.length >= 2 ? options.stops : null;
    const root = h('div', 'ui-slider' + (options.variant ? ' ui-slider--' + options.variant : ''));
    root.tabIndex = 0;
    root.setAttribute('role', 'slider');
    root.setAttribute('aria-label', options.label);
    const track = h('div', 'ui-slider__track');
    track.append(h('div', 'ui-slider__fill'), h('div', 'ui-slider__thumb'));
    root.append(track);
    let value = options.value;

    const snap = (v: number): number => {
      if (stops) return stops[nearestStop(stops, v)]!;
      const steps = Math.round((v - options.min) / options.step);
      const snapped = options.min + steps * options.step;
      const r = Math.round(snapped * 1e6) / 1e6;
      return r < options.min ? options.min : r > options.max ? options.max : r;
    };
    const toNorm = (v: number): number => {
      if (stops) return nearestStop(stops, v) / (stops.length - 1);
      return options.max > options.min ? (v - options.min) / (options.max - options.min) : 0;
    };
    const fromNorm = (t: number): number => {
      const c = t < 0 ? 0 : t > 1 ? 1 : t;
      if (stops) return stops[Math.round(c * (stops.length - 1))]!;
      return snap(options.min + c * (options.max - options.min));
    };
    const paint = (): void => {
      root.style.setProperty('--v', toNorm(value).toFixed(4));
      root.setAttribute('aria-valuemin', String(stops ? stops[0] : options.min));
      root.setAttribute('aria-valuemax', String(stops ? stops[stops.length - 1] : options.max));
      root.setAttribute('aria-valuenow', String(value));
      if (options.format) root.setAttribute('aria-valuetext', options.format(value));
    };
    const commit = (next: number): void => {
      if (next === value) return;
      value = next;
      paint();
      options.onInput(value);
    };
    const stepBy = (delta: number): void => {
      if (stops) {
        const i = nearestStop(stops, value) + delta;
        commit(stops[i < 0 ? 0 : i >= stops.length ? stops.length - 1 : i]!);
      } else {
        commit(snap(value + delta * options.step));
      }
    };
    const fromPointer = (clientX: number): void => {
      const r = track.getBoundingClientRect();
      if (r.width <= 0) return;
      commit(fromNorm((clientX - r.left) / r.width));
    };

    let dragging = -1;
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      dragging = e.pointerId;
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        // capture indisponible : le glissement reste suivi tant que le pointeur survole le curseur
      }
      root.classList.add('is-drag');
      root.focus({ preventScroll: true });
      fromPointer(e.clientX);
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId === dragging) fromPointer(e.clientX);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== dragging) return;
      dragging = -1;
      root.classList.remove('is-drag');
      this.feedback('tick');
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('ui:nav', (e) => {
      const dir = (e as CustomEvent<{ dir: NavDir }>).detail.dir;
      if (dir !== 'left' && dir !== 'right') return;
      e.preventDefault();
      stepBy(dir === 'right' ? 1 : -1);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        commit(fromNorm(e.key === 'Home' ? 0 : 1));
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        stepBy(e.key === 'PageUp' ? 5 : -5);
      }
    });
    paint();
    return {
      el: root,
      get value(): number {
        return value;
      },
      set(next: number): void {
        value = stops ? stops[nearestStop(stops, next)]! : snap(next);
        paint();
      },
    };
  }

  segmented<T extends string>(options: { label: string; options: readonly Choice<T>[]; value: T; wrap?: boolean; onChange(value: T): void }): ValueHandle<T> {
    const root = h('div', 'ui-seg' + (options.wrap ? ' ui-seg--wrap' : ''));
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', options.label);
    const buttons: HTMLButtonElement[] = [];
    let value = options.value;
    const paint = (): void => {
      for (let i = 0; i < buttons.length; i++) buttons[i]!.setAttribute('aria-checked', String(options.options[i]!.value === value));
    };
    for (const opt of options.options) {
      const b = h('button', 'ui-seg__opt');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.value = opt.value;
      if (opt.tip) b.setAttribute('data-tip', opt.tip);
      if (opt.icon) b.append(icon(opt.icon));
      b.append(h('span', undefined, opt.label));
      b.addEventListener('click', () => {
        if (value === opt.value) return;
        value = opt.value;
        paint();
        this.feedback('tick');
        options.onChange(value);
      });
      buttons.push(b);
      root.append(b);
    }
    paint();
    return {
      el: root,
      set(next: T): void {
        value = next;
        paint();
      },
    };
  }

  toggle(options: { label: string; hint?: string; value: boolean; onChange(value: boolean): void }): ValueHandle<boolean> {
    const b = h('button', 'ui-toggle');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    const text = h('span', 'ui-toggle__text');
    text.append(h('span', 'ui-toggle__label', options.label));
    if (options.hint) text.append(h('span', 'ui-toggle__hint', options.hint));
    b.append(text, h('span', 'ui-switch'));
    let value = options.value;
    b.setAttribute('aria-checked', String(value));
    b.addEventListener('click', () => {
      value = !value;
      b.setAttribute('aria-checked', String(value));
      this.feedback('tick');
      options.onChange(value);
    });
    return {
      el: b,
      set(next: boolean): void {
        value = next;
        b.setAttribute('aria-checked', String(value));
      },
    };
  }

  /** Carte de choix (pictogramme, titre, description). L'état sélectionné se règle par aria-pressed. */
  card(options: { icon?: IconName; title: string; desc?: string; selected?: boolean; onClick(): void }): HTMLButtonElement {
    const b = h('button', 'ui-card' + (options.desc ? '' : ' ui-card--solo'));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(options.selected === true));
    if (options.icon) {
      const box = h('span', 'ui-card__icon');
      box.append(icon(options.icon));
      b.append(box);
    }
    b.append(h('span', 'ui-card__title', options.title));
    if (options.desc) b.append(h('span', 'ui-card__desc', options.desc));
    b.addEventListener('click', () => {
      this.feedback('tick');
      options.onClick();
    });
    return b;
  }

  chip(options: { label: string; icon?: IconName; selected?: boolean; onClick(): void }): HTMLButtonElement {
    const b = h('button', 'ui-chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(options.selected === true));
    if (options.icon) b.append(icon(options.icon));
    b.append(h('span', undefined, options.label));
    b.addEventListener('click', () => {
      this.feedback('tick');
      options.onClick();
    });
    return b;
  }

  stepper(options: { label: string; min: number; max: number; value: number; step?: number; onChange(value: number): void }): ValueHandle<number> {
    const step = options.step ?? 1;
    const root = h('div', 'ui-stepper');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', options.label);
    const minus = h('button', 'ui-stepper__btn');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Diminuer : ${options.label}`);
    minus.append(icon('minus'));
    const plus = h('button', 'ui-stepper__btn');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Augmenter : ${options.label}`);
    plus.append(icon('plus'));
    const out = h('span', 'ui-stepper__value');
    out.setAttribute('aria-live', 'polite');
    root.append(minus, out, plus);
    let value = options.value;
    const paint = (): void => {
      out.textContent = String(value);
      minus.disabled = value <= options.min;
      plus.disabled = value >= options.max;
    };
    const bump = (delta: number, from: HTMLButtonElement, other: HTMLButtonElement): void => {
      const next = Math.min(options.max, Math.max(options.min, value + delta));
      if (next === value) return;
      value = next;
      paint();
      // le bouton vient d'être désactivé (borne atteinte) : le focus passe à l'autre pour ne pas se perdre
      if (from.disabled) other.focus({ preventScroll: true });
      this.feedback('tick');
      options.onChange(value);
    };
    minus.addEventListener('click', () => bump(-step, minus, plus));
    plus.addEventListener('click', () => bump(step, plus, minus));
    paint();
    return {
      el: root,
      set(next: number): void {
        value = Math.min(options.max, Math.max(options.min, next));
        paint();
      },
    };
  }

  tabs<T extends string>(options: { label: string; tabs: readonly TabDef<T>[]; value: T; rail?: boolean; onChange(id: T): void }): TabsHandle<T> {
    const root = h('div', 'ui-tabs' + (options.rail ? ' ui-tabs--rail' : ''));
    root.setAttribute('role', 'tablist');
    root.setAttribute('aria-label', options.label);
    if (options.rail) root.setAttribute('aria-orientation', 'vertical');
    const buttons = new Map<T, HTMLButtonElement>();
    const notes = new Map<T, Txt>();
    let value = options.value;
    const paint = (): void => {
      for (const [id, b] of buttons) b.setAttribute('aria-selected', String(id === value));
    };
    const select = (id: T, silent: boolean): void => {
      if (id === value) return;
      value = id;
      paint();
      if (!silent) {
        this.feedback('tick');
        options.onChange(id);
      }
    };
    for (const tab of options.tabs) {
      const b = h('button', 'ui-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.id = tab.id;
      if (tab.icon) b.append(icon(tab.icon));
      b.append(h('span', 'ui-tab__label', tab.label));
      const note = h('span', 'ui-tab__note');
      b.append(note);
      notes.set(tab.id, new Txt(note));
      b.addEventListener('click', () => select(tab.id, false));
      buttons.set(tab.id, b);
      root.append(b);
    }
    paint();
    return {
      el: root,
      get value(): T {
        return value;
      },
      set(id: T): void {
        select(id, true);
      },
      setNote(id: T, note: string): void {
        notes.get(id)?.set(note);
      },
      step(delta: -1 | 1): void {
        const i = options.tabs.findIndex((t) => t.id === value) + delta;
        if (i < 0 || i >= options.tabs.length) return;
        const next = options.tabs[i]!.id;
        select(next, false);
        const b = buttons.get(next);
        if (b && root.contains(document.activeElement)) b.focus({ preventScroll: true });
        b?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      button(id: T): HTMLButtonElement | undefined {
        return buttons.get(id);
      },
    };
  }

  /** Champ : libellé, valeur courante à droite, commande, aide facultative. */
  field(label: string, control: HTMLElement | null, options: { value?: string; hint?: string } = {}): FieldHandle {
    const head = h('div', 'ui-field__head');
    const valueEl = h('span', 'ui-field__value');
    head.append(h('span', 'ui-field__label', label), valueEl);
    const hintEl = h('div', 'ui-field__hint');
    const root = el('div', 'ui-field', head, control, hintEl);
    const value = new Txt(valueEl);
    const hint = new Txt(hintEl);
    const setHint = (text: string): void => {
      hintEl.hidden = text === '';
      hint.set(text);
    };
    value.set(options.value ?? '');
    setHint(options.hint ?? '');
    return { el: root, setValue: (text: string) => value.set(text), setHint };
  }

  sectionTitle(text: string): HTMLElement {
    return h('h3', 'ui-section-title', text);
  }

  /** Boîte de confirmation posée sur un écran. Le focus va au bouton d'annulation ; retour arrière = annuler. */
  confirm(host: HTMLElement, options: DialogOptions): { close(): void } {
    const back = h('div', 'ui-dialog-back');
    const box = h('div', 'ui-panel ui-panel--flag ui-dialog');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', options.title);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let closed = false;
    const group = this.focusGroup(back);
    const close = (): void => {
      if (closed) return;
      closed = true;
      group.dispose();
      back.remove();
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
    const cancel = this.button(options.cancel ?? 'Annuler', () => {
      close();
      options.onCancel?.();
    }, 'secondary');
    cancel.setAttribute('data-autofocus', '');
    cancel.dataset.id = 'dialog-cancel';
    const ok = this.button(options.confirm, () => {
      close();
      options.onConfirm();
    }, options.danger ? 'danger' : 'primary');
    ok.dataset.id = 'dialog-confirm';
    const actions = el('div', 'ui-dialog__actions', cancel, ok);
    box.append(h('h2', 'ui-dialog__title', options.title), h('p', 'ui-dialog__text', options.text), actions);
    back.append(box);
    back.addEventListener('ui:back', (e) => {
      e.preventDefault();
      close();
      options.onCancel?.();
    });
    host.append(back);
    cancel.focus({ preventScroll: true });
    this.feedback('alert');
    return { close };
  }
}

function nearestStop(stops: readonly number[], v: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const d = Math.abs(stops[i]! - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Infobulle partagée : affiche le texte de l'attribut data-tip de l'élément survolé (souris) ou
 * focalisé (clavier, manette). Positionnée par transformation, jamais hors de l'écran.
 */
export class Tooltip {
  private readonly tip: HTMLElement;
  private target: HTMLElement | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly root: HTMLElement) {
    this.tip = h('div', 'ui-tip');
    this.tip.setAttribute('role', 'tooltip');
    root.append(this.tip);
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
      root.addEventListener(type, fn as EventListener, true);
      this.offs.push(() => root.removeEventListener(type, fn as EventListener, true));
    };
    on('mouseover', (e) => this.show(e.target, false));
    on('mouseout', (e) => {
      if (this.target && !(e.relatedTarget instanceof Node && this.target.contains(e.relatedTarget))) this.hide();
    });
    on('focusin', (e) => {
      if (root.getAttribute('data-nav') === 'keys') this.show(e.target, true);
    });
    on('focusout', () => this.hide());
    on('pointerdown', () => this.hide());
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.tip.remove();
  }

  private show(node: EventTarget | null, _focus: boolean): void {
    const target = node instanceof Element ? node.closest<HTMLElement>('[data-tip]') : null;
    if (!target || !this.root.contains(target)) {
      if (this.target) this.hide();
      return;
    }
    const text = target.getAttribute('data-tip') ?? '';
    if (!text) return;
    this.target = target;
    this.tip.textContent = text;
    const host = this.root.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = r.left - host.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(host.width - tw - 8, x));
    let y = r.top - host.top - th - 8;
    if (y < 8) y = r.bottom - host.top + 8;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.tip.classList.add('is-on');
  }

  private hide(): void {
    this.target = null;
    this.tip.classList.remove('is-on');
  }
}
