/* =====================================================================================
 * Interface — petites aides DOM. Les « liaisons » (Txt, Flag, Num…) mémorisent la dernière valeur
 * écrite : le DOM n'est touché que si la valeur change (aucun recalcul de mise en page inutile).
 * ===================================================================================== */

import { icon } from './icons';
import type { IconName } from './icons';

/** Crée un élément avec classe et texte. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Crée un élément et lui ajoute des enfants (chaînes ou nœuds ; null et false ignorés). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string | undefined, ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = h(tag, className);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c);
  }
  return node;
}

/** Élément avec un pictogramme suivi d'un texte. */
export function withIcon<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, name: IconName, text: string): HTMLElementTagNameMap[K] {
  const node = h(tag, className);
  node.append(icon(name), h('span', 'ui-lbl', text));
  return node;
}

/** Vide un élément. */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Texte lié : n'écrit dans le DOM que si la valeur change. */
export class Txt {
  private last: string | null = null;
  constructor(readonly el: Element) {}
  set(value: string): void {
    if (value === this.last) return;
    this.last = value;
    this.el.textContent = value;
  }
}

/** Classe CSS à bascule liée. */
export class Flag {
  private last: boolean | null = null;
  constructor(readonly el: Element, private readonly className: string) {}
  set(on: boolean): void {
    if (on === this.last) return;
    this.last = on;
    this.el.classList.toggle(this.className, on);
  }
}

/** Attribut lié (data-*, aria-*…). */
export class Attr {
  private last: string | null | undefined = undefined;
  constructor(readonly el: Element, private readonly name: string) {}
  set(value: string | null): void {
    if (value === this.last) return;
    this.last = value;
    if (value === null) this.el.removeAttribute(this.name);
    else this.el.setAttribute(this.name, value);
  }
}

/** Affichage lié : bascule l'attribut `hidden`. */
export class Shown {
  private last: boolean | null = null;
  constructor(readonly el: HTMLElement | SVGElement) {}
  set(visible: boolean): void {
    if (visible === this.last) return;
    this.last = visible;
    if (visible) this.el.removeAttribute('hidden');
    else this.el.setAttribute('hidden', '');
  }
  get value(): boolean {
    return this.last === true;
  }
}

/** Variable CSS numérique liée (écrite seulement au-delà d'un seuil de variation). */
export class CssVar {
  private last = NaN;
  constructor(readonly el: HTMLElement | SVGElement, private readonly name: string, private readonly epsilon = 0.002, private readonly unit = '') {}
  set(value: number): void {
    if (Math.abs(value - this.last) < this.epsilon) return;
    this.last = value;
    this.el.style.setProperty(this.name, this.unit ? value.toFixed(2) + this.unit : value.toFixed(3));
  }
}

/** Transformation liée : translate / scale / rotate sans recalcul de mise en page. */
export class Transform {
  private last = '';
  constructor(readonly el: HTMLElement | SVGElement) {}
  set(value: string): void {
    if (value === this.last) return;
    this.last = value;
    this.el.style.transform = value;
  }
}

/** Opacité liée (pas de 1/50). */
export class Opacity {
  private last = -1;
  constructor(readonly el: HTMLElement | SVGElement) {}
  set(value: number): void {
    const v = Math.round((value < 0 ? 0 : value > 1 ? 1 : value) * 50) / 50;
    if (v === this.last) return;
    this.last = v;
    this.el.style.opacity = String(v);
  }
}

/** L'élément est-il un champ de saisie de texte ? */
export function isTextField(node: unknown): boolean {
  if (!node || typeof (node as Element).tagName !== 'string') return false;
  const e = node as HTMLElement;
  const tag = e.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (e as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio' && type !== 'range' && type !== 'button' && type !== 'file';
  }
  return e.isContentEditable === true;
}

/** Abonnement DOM avec fonction de désabonnement. */
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | Document | Window, type: K, handler: (e: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions | boolean,
): () => void {
  target.addEventListener(type, handler as EventListener, options);
  return () => target.removeEventListener(type, handler as EventListener, options);
}
