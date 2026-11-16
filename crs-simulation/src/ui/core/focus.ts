/* =====================================================================================
 * Interface — navigation au focus (clavier et manette).
 *
 *   pickNeighbor()  logique pure : parmi des rectangles, lequel est le meilleur voisin dans une direction
 *   FocusNav        applique cette logique au DOM : groupes de focus, répétition quand la direction est
 *                   tenue, validation (clic sur l'élément focalisé), retour arrière.
 *
 * Un élément focalisable peut intercepter la navigation : il reçoit l'événement « ui:nav »
 * ({ detail: { dir } }, annulable) avant tout déplacement — un curseur appelle preventDefault() sur
 * gauche / droite pour changer sa valeur. De même « ui:back » (annulable) avant le retour arrière.
 * Le conteneur du groupe actif reçoit « ui:tab » ({ detail: { step: -1 | 1 } }) sur LB / RB.
 * ===================================================================================== */

import type { Button } from '@/core/contracts';
import { isTextField } from './dom';

export type NavDir = 'up' | 'down' | 'left' | 'right';

export interface NavRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ce que la navigation lit dans les entrées (sous-ensemble d'InputState). */
export interface NavInput {
  pressed(b: Button): boolean;
  down(b: Button): boolean;
}

/** Délai avant répétition quand une direction est tenue, puis période de répétition (s). */
export const NAV_REPEAT_DELAY = 0.38;
export const NAV_REPEAT_PERIOD = 0.11;

const DIRS: readonly NavDir[] = ['up', 'down', 'left', 'right'];
const DIR_BUTTON: Readonly<Record<NavDir, Button>> = { up: 'ui_up', down: 'ui_down', left: 'ui_left', right: 'ui_right' };

/**
 * Meilleur voisin de `cur` dans la direction `dir` parmi `candidates` ; -1 s'il n'y en a pas.
 * Un candidat doit commencer au-delà du bord de l'élément courant (léger recouvrement toléré). Les
 * candidats « dans le faisceau » (qui recouvrent l'élément courant sur l'axe perpendiculaire) sont
 * préférés ; les autres ne sont retenus que s'ils restent à moins d'environ 60° de la direction.
 */
export function pickNeighbor(cur: NavRect, candidates: readonly NavRect[], dir: NavDir): number {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  // axe principal p (orienté dans le sens du déplacement) et axe perpendiculaire c
  const curP0 = sign > 0 ? (horizontal ? cur.x : cur.y) : -(horizontal ? cur.x + cur.w : cur.y + cur.h);
  const curPLen = horizontal ? cur.w : cur.h;
  const curP1 = curP0 + curPLen;
  const curC0 = horizontal ? cur.y : cur.x;
  const curC1 = curC0 + (horizontal ? cur.h : cur.w);
  const curCMid = (curC0 + curC1) * 0.5;

  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (c.w <= 0 || c.h <= 0) continue;
    const p0 = sign > 0 ? (horizontal ? c.x : c.y) : -(horizontal ? c.x + c.w : c.y + c.h);
    const pLen = horizontal ? c.w : c.h;
    const c0 = horizontal ? c.y : c.x;
    const c1 = c0 + (horizontal ? c.h : c.w);
    // doit se trouver devant : au-delà du bord, avec un recouvrement toléré d'un quart de la plus petite taille
    const tolerance = Math.min(curPLen, pLen) * 0.25 + 1;
    if (p0 < curP1 - tolerance) continue;
    if (p0 + pLen * 0.5 <= curP0 + curPLen * 0.5 + 0.5) continue;
    const primary = Math.max(0, p0 - curP1);
    const overlap = Math.min(c1, curC1) - Math.max(c0, curC0);
    let score: number;
    if (overlap > 0.5) {
      const offset = Math.abs((c0 + c1) * 0.5 - curCMid);
      score = primary + Math.min(offset, 400) * 0.15;
    } else {
      const secondary = c0 >= curC1 ? c0 - curC1 : curC0 - c1;
      if (secondary > primary * 2 + 24) continue;
      score = primary + secondary * 2.5 + 30;
    }
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Sélecteur des éléments atteignables par la navigation. */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]';

/** Éléments focalisables visibles d'un conteneur, dans l'ordre du document. */
export function focusables(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.hasAttribute('data-nav-skip')) continue;
    if (n.closest('[hidden], [inert]')) continue;
    const r = n.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    out.push(n);
  }
  return out;
}

interface Group {
  container: HTMLElement;
  disposed: boolean;
}

export interface FocusNavOptions {
  /** Hôte de l'écran du dessus (les groupes hors de cet hôte sont inactifs) ; null si aucun écran n'est ouvert. */
  scope(): HTMLElement | null;
  /** Retour arrière non intercepté par l'élément focalisé. */
  onBack(): void;
  /** Appelé après un déplacement du focus ou une validation (son d'interface). */
  onFeedback?(kind: 'move' | 'accept'): void;
  now?(): number;
}

export class FocusNav {
  private readonly groups: Group[] = [];
  private held: NavDir | null = null;
  private heldTime = 0;
  private repeatAt = 0;
  private nativeClickAt = -1e9;
  private readonly now: () => number;
  /** true : le module des entrées est absent, les flèches / Entrée / Échap sont lues directement au clavier. */
  domKeys = false;
  /** Dernier mode de pointage : « keys » affiche l'anneau de focus, « pointer » le masque. */
  mode: 'keys' | 'pointer' = 'pointer';

  constructor(private readonly root: HTMLElement, private readonly options: FocusNavOptions) {
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    root.addEventListener('click', this.onClick, true);
    root.addEventListener('pointerdown', this.onPointer, true);
    root.ownerDocument.addEventListener('keydown', this.onKeyDown, true);
    this.applyMode();
  }

  dispose(): void {
    this.root.removeEventListener('click', this.onClick, true);
    this.root.removeEventListener('pointerdown', this.onPointer, true);
    this.root.ownerDocument.removeEventListener('keydown', this.onKeyDown, true);
    this.groups.length = 0;
  }

  /** Déclare un conteneur navigable. Le dernier groupe créé (encore dans la page et dans l'écran du dessus) est actif. */
  createGroup(container: HTMLElement): { dispose(): void } {
    const group: Group = { container, disposed: false };
    this.groups.push(group);
    return {
      dispose: () => {
        if (group.disposed) return;
        group.disposed = true;
        const i = this.groups.indexOf(group);
        if (i >= 0) this.groups.splice(i, 1);
      },
    };
  }

  /** Conteneur du groupe actif (null si aucun). */
  activeContainer(): HTMLElement | null {
    const scope = this.options.scope();
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const c = this.groups[i]!.container;
      if (!c.isConnected) continue;
      if (c.closest('[hidden], [inert]')) continue;
      if (scope) {
        if (scope === c || scope.contains(c)) return c;
      } else if (!c.closest('.ui-screen')) {
        return c;
      }
    }
    return null;
  }

  /** À appeler à chaque image. */
  update(dt: number, input: NavInput, gamepad: boolean, menu: boolean): void {
    if (gamepad && this.mode !== 'keys') this.setMode('keys');
    const container = this.activeContainer();
    if (!container) {
      this.held = null;
      return;
    }
    // directions : front, puis répétition tant que la direction reste tenue
    let moved: NavDir | null = null;
    for (let i = 0; i < DIRS.length; i++) {
      const d = DIRS[i]!;
      if (input.pressed(DIR_BUTTON[d])) {
        moved = d;
        this.held = d;
        this.heldTime = 0;
        this.repeatAt = NAV_REPEAT_DELAY;
      }
    }
    if (!moved && this.held) {
      if (!input.down(DIR_BUTTON[this.held])) {
        this.held = null;
      } else {
        this.heldTime += dt;
        if (this.heldTime >= this.repeatAt) {
          this.repeatAt += NAV_REPEAT_PERIOD;
          moved = this.held;
        }
      }
    }
    if (moved) this.navigate(moved, container);
    if (input.pressed('ui_accept')) this.accept(container);
    if (menu) {
      if (input.pressed('item_prev')) this.tab(container, -1);
      if (input.pressed('item_next')) this.tab(container, 1);
    }
  }

  /** Retour arrière : proposé d'abord à l'élément focalisé (« ui:back », annulable), puis à l'écran. */
  back(): void {
    const active = this.root.ownerDocument.activeElement;
    if (active instanceof HTMLElement && this.root.contains(active)) {
      const ev = new CustomEvent('ui:back', { bubbles: true, cancelable: true });
      if (!active.dispatchEvent(ev)) return;
    }
    this.options.onBack();
  }

  /** Déplace le focus dans une direction ; true si un élément a pris le focus. */
  navigate(dir: NavDir, container: HTMLElement | null = this.activeContainer()): boolean {
    if (!container) return false;
    this.setMode('keys');
    const doc = this.root.ownerDocument;
    const active = doc.activeElement instanceof HTMLElement && container.contains(doc.activeElement) ? doc.activeElement : null;
    if (active) {
      const ev = new CustomEvent('ui:nav', { detail: { dir }, bubbles: true, cancelable: true });
      if (!active.dispatchEvent(ev)) return true; // l'élément a géré la direction lui-même
    }
    const list = focusables(container);
    if (list.length === 0) return false;
    if (!active) return this.focusElement(defaultTarget(container, list));
    const rects: NavRect[] = [];
    let self = -1;
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!.getBoundingClientRect();
      rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      if (list[i] === active) self = i;
    }
    const cr = active.getBoundingClientRect();
    const cur: NavRect = { x: cr.left, y: cr.top, w: cr.width, h: cr.height };
    if (self >= 0) rects[self] = { x: 0, y: 0, w: 0, h: 0 }; // l'élément courant n'est pas candidat
    const next = pickNeighbor(cur, rects, dir);
    if (next < 0) return false;
    return this.focusElement(list[next]!);
  }

  /** Donne le focus à l'élément par défaut du conteneur ([data-autofocus], sinon le premier). */
  focusDefault(container: HTMLElement | null = this.activeContainer()): boolean {
    if (!container) return false;
    const list = focusables(container);
    if (list.length === 0) return false;
    const target = defaultTarget(container, list);
    target.focus({ preventScroll: true });
    return true;
  }

  private focusElement(target: HTMLElement): boolean {
    target.focus({ preventScroll: true });
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.options.onFeedback?.('move');
    return true;
  }

  private accept(container: HTMLElement): void {
    this.setMode('keys');
    const doc = this.root.ownerDocument;
    const active = doc.activeElement;
    if (!(active instanceof HTMLElement) || !container.contains(active)) {
      this.focusDefault(container);
      return;
    }
    if (isTextField(active)) return;
    // Entrée au clavier : le navigateur vient de cliquer l'élément focalisé (le focus a pu changer depuis,
    // par exemple vers le bouton d'une confirmation) — ne pas valider une seconde fois.
    if (this.now() - this.nativeClickAt < 300) return;
    active.click();
    this.options.onFeedback?.('accept');
  }

  private tab(container: HTMLElement, step: -1 | 1): void {
    this.setMode('keys');
    container.dispatchEvent(new CustomEvent('ui:tab', { detail: { step }, bubbles: true }));
  }

  private setMode(mode: 'keys' | 'pointer'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    this.root.setAttribute('data-nav', this.mode);
  }

  private readonly onClick = (e: Event): void => {
    // clic « natif » (souris, doigt, ou Entrée traitée par le navigateur) : mémorisé pour ne pas le doubler
    if (!e.isTrusted) return;
    this.nativeClickAt = this.now();
  };

  private readonly onPointer = (): void => {
    this.setMode('pointer');
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented && !this.domKeys) return;
    const key = e.key;
    const arrow: NavDir | null =
      key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : null;
    if (key === 'Tab') {
      if (this.activeContainer()) this.setMode('keys');
      return;
    }
    if (isTextField(e.target)) return;
    const container = this.activeContainer();
    if (!container) return;
    if (arrow) {
      // pas de défilement natif pendant la navigation ; sans module d'entrées, on navigue ici
      e.preventDefault();
      if (this.domKeys) this.navigate(arrow, container);
      return;
    }
    if (!this.domKeys) return;
    if (key === 'Enter') {
      const active = this.root.ownerDocument.activeElement;
      if (active instanceof HTMLElement && container.contains(active)) {
        const tag = active.tagName;
        if (tag !== 'BUTTON' && tag !== 'A') {
          e.preventDefault();
          active.click();
        }
      } else {
        this.focusDefault(container);
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      this.back();
    }
  };
}

function defaultTarget(container: HTMLElement, list: HTMLElement[]): HTMLElement {
  const marked = container.querySelector<HTMLElement>('[data-autofocus]');
  if (marked && list.indexOf(marked) >= 0) return marked;
  return list[0]!;
}
