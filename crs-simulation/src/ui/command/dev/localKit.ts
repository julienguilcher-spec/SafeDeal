/* =====================================================================================
 * BANC D'ESSAI — petite implémentation locale de l'interface (ctx.ui + UiKit), strictement conforme
 * à src/core/extensions.ts, pour développer et vérifier les cartes et le commandement sans le socle
 * de l'interface. Elle reprend ses règles : pile d'écrans, écrans modaux, pause automatique, HUD en
 * neuf zones, touches d'interface (carte, carte tactique, ordres, radio), retour arrière, navigation
 * au focus (événements « ui:nav », « ui:back », « ui:tab »), notifications et sous-titres.
 * N'est pas livrée avec le jeu.
 * ===================================================================================== */

import type { Button, GameContext, GameSystem, InputState, NoticeKind, ScreenId, UiApi } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type {
  HudSlot, HudWidget, Objective, ObjectivesApi, ScreenInstance, ScreenOptions, UiKit,
} from '@/core/extensions';

const CSS = `
.lk{position:absolute;inset:0;overflow:hidden;pointer-events:none;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#eef2f8;
--safe-top:env(safe-area-inset-top,0px);--safe-right:env(safe-area-inset-right,0px);--safe-bottom:env(safe-area-inset-bottom,0px);--safe-left:env(safe-area-inset-left,0px)}
.lk *{box-sizing:border-box}
.lk-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.lk-hud{z-index:20}.lk-screens{z-index:40}.lk-notices{z-index:60}
.lk-hud.is-off{display:none}
.lk-slot{position:absolute;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:46%;--hp:12px}
.lk-slot--top-left{left:calc(var(--hp) + var(--safe-left));top:calc(var(--hp) + var(--safe-top));align-items:flex-start}
.lk-slot--top{left:50%;top:calc(var(--hp) + var(--safe-top));transform:translateX(-50%);align-items:center}
.lk-slot--top-right{right:calc(var(--hp) + var(--safe-right));top:calc(var(--hp) + var(--safe-top));align-items:flex-end}
.lk-slot--left{left:calc(var(--hp) + var(--safe-left));top:50%;transform:translateY(-50%);align-items:flex-start}
.lk-slot--right{right:calc(var(--hp) + var(--safe-right));top:50%;transform:translateY(-50%);align-items:flex-end}
.lk-slot--bottom-left{left:calc(var(--hp) + var(--safe-left));bottom:calc(var(--hp) + var(--safe-bottom));align-items:flex-start}
.lk-slot--bottom{left:50%;bottom:calc(var(--hp) + var(--safe-bottom));transform:translateX(-50%);align-items:center}
.lk-slot--bottom-right{right:calc(var(--hp) + var(--safe-right));bottom:calc(var(--hp) + var(--safe-bottom));align-items:flex-end}
.lk-slot--center{left:50%;top:50%;transform:translate(-50%,-50%);align-items:center}
.lk-hud[data-touch="1"] .lk-slot--top-left{left:calc(12px + var(--safe-left));top:calc(8px + var(--safe-top))}
.lk-hud[data-touch="1"] .lk-slot--top{top:calc(8px + var(--safe-top))}
.lk-screen{position:absolute;inset:0;display:flex;pointer-events:none}
.lk-screen>*{pointer-events:auto}
.lk-screen--modal{pointer-events:auto;background:rgba(6,11,21,.74)}
.lk-toasts{position:absolute;left:50%;top:calc(64px + var(--safe-top));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;width:max-content;max-width:min(560px,86vw)}
.lk-toast{padding:7px 14px;border-radius:8px;background:rgba(11,18,32,.94);border:1px solid rgba(160,180,215,.34);font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.4);text-align:center}
.lk-toast.k-ok{border-color:#3ecf8e}.lk-toast.k-warn{border-color:#ff9500;color:#ffd9a3}.lk-toast.k-alert{border-color:#ef4135;color:#ffd9d5}
.lk-sub{position:absolute;left:50%;bottom:calc(84px + var(--safe-bottom));transform:translateX(-50%);max-width:min(760px,84vw);padding:6px 14px;border-radius:8px;background:rgba(6,11,21,.82);font-size:14px;text-align:center;display:none}
.lk-sub.is-on{display:block}
.lk-sub b{color:#ffd60a;margin-right:6px}
.lk-btn{appearance:none;min-height:44px;padding:0 18px;border-radius:8px;border:1px solid rgba(160,180,215,.34);background:#1a2740;color:#eef2f8;font:inherit;font-weight:600;cursor:pointer}
.lk-btn--primary{background:#0055a4}.lk-btn--danger{border-color:#ef4135}.lk-btn--ghost{background:transparent;border-color:transparent}
.lk[data-nav="keys"] :focus{outline:2px solid #ffd60a;outline-offset:2px}
`;

const SLOTS: readonly HudSlot[] = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right', 'center'];
const HOTKEYS: readonly { button: Button; screens: readonly ScreenId[] }[] = [
  { button: 'map', screens: ['carte'] },
  { button: 'tactical', screens: ['carte_tactique'] },
  { button: 'orders', screens: ['ordres', 'roue_ordres'] },
  { button: 'radio', screens: ['radio'] },
];
const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]';
type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: readonly { dir: Dir; button: Button }[] = [
  { dir: 'up', button: 'ui_up' }, { dir: 'down', button: 'ui_down' }, { dir: 'left', button: 'ui_left' }, { dir: 'right', button: 'ui_right' },
];

interface Def { create: (host: HTMLElement, data: unknown) => ScreenInstance; options: ScreenOptions }
interface Open { id: ScreenId; options: ScreenOptions; host: HTMLElement; instance: ScreenInstance }
interface Widget { id: string; host: HTMLElement; widget: HudWidget }

export interface LocalUi {
  readonly system: GameSystem;
  readonly kit: UiKit;
  /** Écrans ouverts, du plus ancien au plus récent. */
  stack(): ScreenId[];
  /** Textes des notifications émises depuis le début (les plus récentes en dernier). */
  readonly notices: string[];
  /** Instance de l'écran ouvert (pour les tests). */
  instance(id: ScreenId): ScreenInstance | null;
}

function isText(node: unknown): boolean {
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
}

export function createLocalUi(): LocalUi {
  let ctx: GameContext;
  let root: HTMLDivElement;
  let hudLayer: HTMLDivElement;
  let screenLayer: HTMLDivElement;
  let toasts: HTMLDivElement;
  let subEl: HTMLDivElement;
  const slots = {} as Record<HudSlot, HTMLElement>;
  const defs = new Map<ScreenId, Def>();
  const open: Open[] = [];
  const widgets: Widget[] = [];
  const pendingWidgets: { id: string; slot: HudSlot; create: (host: HTMLElement) => HudWidget }[] = [];
  const groups: HTMLElement[] = [];
  const notices: string[] = [];
  const toastList: { el: HTMLElement; until: number }[] = [];
  const objectives: Objective[] = [];
  let subUntil = 0;
  let pausedByUi = false;
  let mounted = false;
  let navHeld: Dir | null = null;
  let navTime = 0;
  let navNext = 0;
  let lastNativeClick = -1e9;
  let clock = 0;

  const modal = (): boolean => open.some((s) => s.options.modal);

  function syncPause(): void {
    const want = open.some((s) => s.options.pauses);
    const session = ctx.session;
    if (want && session.phase === 'playing') {
      pausedByUi = true;
      session.pause(true);
    } else if (!want && pausedByUi) {
      pausedByUi = false;
      if (session.phase === 'paused') session.pause(false);
    }
  }

  function changed(): void {
    syncPause();
    if (modal() && subEl) subEl.classList.remove('is-on');
    hudLayer.classList.toggle('is-off', open.some((s) => s.options.hidesHud));
  }

  function destroy(index: number): void {
    const s = open[index]!;
    open.splice(index, 1);
    const g = groups.indexOf(s.host);
    if (g >= 0) groups.splice(g, 1);
    try {
      s.instance.dispose();
    } catch (err) {
      console.error(`[banc] erreur dans dispose() de l'écran « ${s.id} »`, err);
    }
    s.host.remove();
  }

  function openScreen(id: ScreenId, data?: unknown): boolean {
    const def = defs.get(id);
    if (!def) {
      console.warn(`[banc] écran « ${id} » non enregistré`);
      return false;
    }
    const existing = open.findIndex((s) => s.id === id);
    if (existing >= 0) destroy(existing);
    const host = document.createElement('div');
    host.className = 'lk-screen' + (def.options.modal ? ' lk-screen--modal' : '');
    host.dataset.screen = String(id);
    screenLayer.appendChild(host);
    let instance: ScreenInstance;
    try {
      instance = def.create(host, data);
    } catch (err) {
      host.remove();
      console.error(`[banc] création de l'écran « ${id} » impossible`, err);
      changed();
      return false;
    }
    open.push({ id, options: def.options, host, instance });
    groups.push(host);
    if (def.options.modal && !host.contains(document.activeElement)) focusDefault(host);
    changed();
    return true;
  }

  function closeScreen(id?: ScreenId): boolean {
    const index = id === undefined ? open.length - 1 : open.findIndex((s) => s.id === id);
    if (index < 0) return false;
    destroy(index);
    changed();
    return true;
  }

  // ── navigation au focus ──
  function activeContainer(): HTMLElement | null {
    const top = open.length > 0 ? open[open.length - 1]!.host : null;
    for (let i = groups.length - 1; i >= 0; i--) {
      const c = groups[i]!;
      if (!c.isConnected) continue;
      if (top ? top === c || top.contains(c) : !c.closest('.lk-screen')) return c;
    }
    return null;
  }

  function focusables(container: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.hasAttribute('data-nav-skip')) continue;
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push(n);
    }
    return out;
  }

  function focusDefault(container: HTMLElement): void {
    const list = focusables(container);
    if (list.length === 0) return;
    const marked = container.querySelector<HTMLElement>('[data-autofocus]');
    (marked && list.indexOf(marked) >= 0 ? marked : list[0]!).focus({ preventScroll: true });
  }

  function navigate(dir: Dir, container: HTMLElement): void {
    root.setAttribute('data-nav', 'keys');
    const active = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement : null;
    if (active) {
      const ev = new CustomEvent('ui:nav', { detail: { dir }, bubbles: true, cancelable: true });
      if (!active.dispatchEvent(ev)) return;
    }
    const list = focusables(container);
    if (list.length === 0) return;
    if (!active) {
      focusDefault(container);
      return;
    }
    const cur = active.getBoundingClientRect();
    const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!;
      if (n === active) continue;
      const r = n.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along < 4 || across > along * 2.2 + 30) continue;
      const score = along + across * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best) {
      best.focus({ preventScroll: true });
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function back(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) {
      const ev = new CustomEvent('ui:back', { bubbles: true, cancelable: true });
      if (!active.dispatchEvent(ev)) return;
    }
    const top = open[open.length - 1];
    if (!top) return;
    let handled = false;
    try {
      handled = top.instance.back ? top.instance.back() === true : false;
    } catch (err) {
      console.error(`[banc] erreur dans back() de l'écran « ${top.id} »`, err);
    }
    if (!handled) closeScreen(top.id);
  }

  function updateNav(dt: number, input: InputState): void {
    if (input.device === 'gamepad') root.setAttribute('data-nav', 'keys');
    const container = activeContainer();
    if (!container) {
      navHeld = null;
      return;
    }
    let moved: Dir | null = null;
    for (let i = 0; i < DIRS.length; i++) {
      if (input.pressed(DIRS[i]!.button)) {
        moved = navHeld = DIRS[i]!.dir;
        navTime = 0;
        navNext = 0.38;
      }
    }
    if (!moved && navHeld) {
      const b = DIRS.find((d) => d.dir === navHeld)!.button;
      if (!input.down(b)) navHeld = null;
      else {
        navTime += dt;
        if (navTime >= navNext) {
          navNext += 0.11;
          moved = navHeld;
        }
      }
    }
    if (moved) navigate(moved, container);
    if (input.pressed('ui_accept')) {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !container.contains(active)) focusDefault(container);
      else if (!isText(active) && clock - lastNativeClick > 0.3) active.click();
    }
    if (modal()) {
      if (input.pressed('item_prev')) container.dispatchEvent(new CustomEvent('ui:tab', { detail: { step: -1 }, bubbles: true }));
      if (input.pressed('item_next')) container.dispatchEvent(new CustomEvent('ui:tab', { detail: { step: 1 }, bubbles: true }));
    }
  }

  function toggleHotkey(screens: readonly ScreenId[]): void {
    const id = screens.find((s) => defs.has(s));
    if (!id) return;
    if (open.some((s) => s.id === id)) {
      closeScreen(id);
      return;
    }
    const hotIds: ScreenId[] = [];
    for (const k of HOTKEYS) for (const s of k.screens) hotIds.push(s);
    if (open.some((s) => s.options.modal && hotIds.indexOf(s.id) < 0)) return;
    for (let i = open.length - 1; i >= 0; i--) if (open[i]!.options.modal && hotIds.indexOf(open[i]!.id) >= 0) destroy(i);
    openScreen(id);
  }

  function mountWidget(w: { id: string; slot: HudSlot; create: (host: HTMLElement) => HudWidget }): void {
    const host = document.createElement('div');
    host.dataset.widget = w.id;
    (slots[w.slot] ?? slots.center).appendChild(host);
    try {
      widgets.push({ id: w.id, host, widget: w.create(host) });
    } catch (err) {
      host.remove();
      console.error(`[banc] création de l'élément de HUD « ${w.id} » impossible`, err);
    }
  }

  const kit: UiKit = {
    get root(): HTMLElement {
      return root;
    },
    registerScreen(id, create, options): void {
      defs.set(id, { create, options: { ...options } });
    },
    hasScreen: (id) => defs.has(id),
    addHudWidget(id, slot, create): void {
      kit.removeHudWidget(id);
      if (mounted) mountWidget({ id, slot, create });
      else pendingWidgets.push({ id, slot, create });
    },
    removeHudWidget(id): void {
      const i = widgets.findIndex((w) => w.id === id);
      if (i < 0) return;
      const w = widgets[i]!;
      widgets.splice(i, 1);
      try {
        w.widget.dispose();
      } catch (err) {
        console.error(`[banc] erreur dans dispose() de l'élément « ${id} »`, err);
      }
      w.host.remove();
    },
    h(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    },
    button(label, onClick, variant = 'secondary'): HTMLButtonElement {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lk-btn lk-btn--' + variant;
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    },
    focusGroup(container): { dispose(): void } {
      groups.push(container);
      return {
        dispose(): void {
          const i = groups.lastIndexOf(container);
          if (i >= 0) groups.splice(i, 1);
        },
      };
    },
    keyLabel(button): string {
      const labels = ctx.service<{ labelFor(b: Button): string }>('input.labels');
      return labels ? labels.labelFor(button) : '';
    },
  };

  const ui: UiApi = {
    notify(text: string, kind: NoticeKind = 'info', seconds = 3): void {
      notices.push(text);
      if (!mounted) return;
      const el = document.createElement('div');
      el.className = 'lk-toast k-' + kind;
      el.textContent = text;
      toasts.appendChild(el);
      toastList.push({ el, until: clock + seconds });
      while (toastList.length > 3) toastList.shift()!.el.remove();
    },
    subtitle(speaker: string, text: string, seconds = 5): void {
      // pas de sous-titre par-dessus un écran plein cadre : le journal radio y est déjà
      if (!mounted || modal()) return;
      subEl.textContent = '';
      const b = document.createElement('b');
      b.textContent = speaker;
      subEl.append(b, document.createTextNode(text));
      subEl.classList.add('is-on');
      subUntil = clock + seconds;
    },
    banner(title: string, subtitle?: string): void {
      ui.notify(subtitle ? `${title} — ${subtitle}` : title, 'info', 4);
    },
    open(screen: ScreenId, data?: unknown): void {
      openScreen(screen, data);
    },
    close(screen?: ScreenId): void {
      closeScreen(screen);
    },
    get modal(): boolean {
      return modal();
    },
    get current(): ScreenId | null {
      return open.length > 0 ? open[open.length - 1]!.id : null;
    },
  };

  const objectivesApi: ObjectivesApi = {
    list: objectives,
    set(list): void {
      objectives.length = 0;
      for (const o of list) objectives.push(o);
    },
    upsert(o): void {
      const i = objectives.findIndex((x) => x.id === o.id);
      if (i >= 0) objectives[i] = o;
      else objectives.push(o);
    },
    remove(id): void {
      const i = objectives.findIndex((x) => x.id === id);
      if (i >= 0) objectives.splice(i, 1);
    },
    clear(): void {
      objectives.length = 0;
    },
    tracked: '',
  };

  const system: GameSystem = {
    id: 'ui:banc',
    order: SystemOrder.UI,
    provide(c: GameContext): void {
      ctx = c;
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.className = 'lk';
      root.setAttribute('data-nav', 'pointer');
      hudLayer = document.createElement('div');
      hudLayer.className = 'lk-layer lk-hud';
      for (const name of SLOTS) {
        const el = document.createElement('div');
        el.className = 'lk-slot lk-slot--' + name;
        slots[name] = el;
        hudLayer.appendChild(el);
      }
      screenLayer = document.createElement('div');
      screenLayer.className = 'lk-layer lk-screens';
      const noticeLayer = document.createElement('div');
      noticeLayer.className = 'lk-layer lk-notices';
      toasts = document.createElement('div');
      toasts.className = 'lk-toasts';
      subEl = document.createElement('div');
      subEl.className = 'lk-sub';
      noticeLayer.append(toasts, subEl);
      root.append(hudLayer, screenLayer, noticeLayer);
      (document.getElementById('ui') ?? document.body).appendChild(root);
      root.addEventListener('click', (e) => {
        if (e.isTrusted) lastNativeClick = clock;
      }, true);
      root.addEventListener('pointerdown', () => root.setAttribute('data-nav', 'pointer'), true);
      mounted = true;
      c.ui = ui;
      c.provide(EXT.uiKit, kit);
      c.provide(EXT.objectives, objectivesApi);
    },
    init(c: GameContext): void {
      for (const w of pendingWidgets) mountWidget(w);
      pendingWidgets.length = 0;
      c.events.on('radio:message', ({ msg }) => {
        if (msg.priority >= 1) ui.subtitle(msg.from, msg.text);
      });
      c.events.on('law:sommation', ({ text }) => {
        if (text) ui.subtitle('Sommation', text, 7);
      });
    },
    frame(dt: number): void {
      clock += dt;
      const input = ctx.input;
      let backUsed = false;
      if (input.pressed('ui_back') && open.length > 0) {
        back();
        backUsed = true;
      }
      updateNav(dt, input);
      const phase = ctx.session.phase;
      if ((phase === 'playing' || phase === 'paused') && !backUsed) {
        for (let i = 0; i < HOTKEYS.length; i++) if (input.pressed(HOTKEYS[i]!.button)) toggleHotkey(HOTKEYS[i]!.screens);
      }
      for (let i = 0; i < open.length; i++) {
        const s = open[i]!;
        try {
          s.instance.update?.(dt, input);
        } catch (err) {
          console.error(`[banc] erreur dans update() de l'écran « ${s.id} »`, err);
        }
      }
      const touch = ctx.service<{ visible: boolean }>('input.touch');
      const t = touch && touch.visible ? '1' : '0';
      if (hudLayer.getAttribute('data-touch') !== t) hudLayer.setAttribute('data-touch', t);
      if (!hudLayer.classList.contains('is-off')) {
        for (let i = 0; i < widgets.length; i++) {
          try {
            widgets[i]!.widget.update?.(dt);
          } catch (err) {
            console.error(`[banc] erreur dans update() de l'élément « ${widgets[i]!.id} »`, err);
          }
        }
      }
      while (toastList.length > 0 && toastList[0]!.until <= clock) toastList.shift()!.el.remove();
      if (subUntil !== 0 && clock > subUntil) {
        subUntil = 0;
        subEl.classList.remove('is-on');
      }
    },
  };

  return {
    system,
    kit,
    stack: () => open.map((s) => s.id),
    notices,
    instance: (id) => open.find((s) => s.id === id)?.instance ?? null,
  };
}
