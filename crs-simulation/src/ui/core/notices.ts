/* =====================================================================================
 * Interface — messages transitoires de ctx.ui : notifications empilées, sous-titres, bandeau.
 * Les minuteries avancent avec update(dt) (temps réel de l'image) : rien ne dépend de setTimeout.
 * ===================================================================================== */

import type { NoticeKind } from '@/core/contracts';
import { h } from './dom';
import { icon } from './icons';
import type { IconName } from './icons';

/** Nombre maximal de notifications visibles ; les plus anciennes sortent au-delà. */
export const MAX_NOTICES = 4;
export const MAX_SUBTITLES = 2;
const EXIT_TIME = 0.22;

const KIND_ICON: Readonly<Record<NoticeKind, IconName>> = { info: 'info', ok: 'check', warn: 'warning', alert: 'warning' };

interface Toast {
  el: HTMLElement;
  countEl: HTMLElement;
  text: string;
  kind: NoticeKind;
  left: number;
  count: number;
  leaving: boolean;
}

interface SubLine {
  el: HTMLElement;
  key: string;
  left: number;
  age: number;
  leaving: boolean;
}

export interface NoticesOptions {
  /** Les sous-titres sont-ils activés (Settings.subtitles) ? */
  subtitlesEnabled(): boolean;
  /** Son d'interface à l'arrivée d'une notification. */
  onNotice?(kind: NoticeKind): void;
}

export class Notices {
  readonly toastsEl: HTMLElement;
  readonly subsEl: HTMLElement;
  readonly bannerEl: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly toasts: Toast[] = [];
  private readonly subs: SubLine[] = [];
  private bannerLeft = 0;
  private bannerKey = '';
  private bannerAge = 1e9;

  constructor(layer: HTMLElement, private readonly options: NoticesOptions) {
    this.toastsEl = h('div', 'ui-toasts');
    this.toastsEl.setAttribute('role', 'status');
    this.toastsEl.setAttribute('aria-live', 'polite');
    this.subsEl = h('div', 'ui-subs');
    this.subsEl.setAttribute('aria-live', 'polite');
    this.bannerEl = h('div', 'ui-banner');
    this.bannerEl.hidden = true;
    this.bannerTitle = h('div', 'ui-banner__title');
    this.bannerSub = h('div', 'ui-banner__sub');
    this.bannerEl.append(h('span', 'ui-flagline'), this.bannerTitle, this.bannerSub);
    layer.append(this.bannerEl, this.toastsEl, this.subsEl);
  }

  notify(text: string, kind: NoticeKind = 'info', seconds = 4): void {
    const message = String(text ?? '').trim();
    if (!message) return;
    const duration = seconds > 0 && Number.isFinite(seconds) ? seconds : 4;
    // même message déjà affiché : on prolonge et on compte, au lieu d'empiler
    for (const t of this.toasts) {
      if (t.text === message && t.kind === kind && !t.leaving) {
        t.left = Math.max(t.left, duration);
        t.count++;
        t.countEl.textContent = '×' + t.count;
        t.countEl.hidden = false;
        return;
      }
    }
    const el = h('div', `ui-toast ui-toast--${kind}`);
    const countEl = h('span', 'ui-toast__count');
    countEl.hidden = true;
    el.append(icon(KIND_ICON[kind]), h('span', 'ui-toast__text', message), countEl);
    this.toastsEl.append(el);
    this.toasts.push({ el, countEl, text: message, kind, left: duration, count: 1, leaving: false });
    let visible = 0;
    for (const t of this.toasts) if (!t.leaving) visible++;
    for (let i = 0; i < this.toasts.length && visible > MAX_NOTICES; i++) {
      const t = this.toasts[i]!;
      if (t.leaving) continue;
      this.leaveToast(t);
      visible--;
    }
    this.options.onNotice?.(kind);
  }

  subtitle(speaker: string, text: string, seconds?: number): void {
    if (!this.options.subtitlesEnabled()) return;
    const line = String(text ?? '').trim();
    if (!line) return;
    const who = String(speaker ?? '').trim();
    const duration = seconds !== undefined && seconds > 0 && Number.isFinite(seconds)
      ? seconds
      : Math.min(9, Math.max(3, 2.2 + line.length * 0.055));
    const key = who + '\u0000' + line;
    // même réplique reçue deux fois (radio et module émetteur) : une seule ligne
    for (const s of this.subs) {
      if (s.key === key && !s.leaving && s.age < 2.5) {
        s.left = Math.max(s.left, duration);
        return;
      }
    }
    const el = h('div', 'ui-sub-line');
    if (who) el.append(h('span', 'ui-sub-line__who', who));
    el.append(h('span', 'ui-sub-line__text', line));
    this.subsEl.append(el);
    this.subs.push({ el, key, left: duration, age: 0, leaving: false });
    let visible = 0;
    for (const s of this.subs) if (!s.leaving) visible++;
    for (let i = 0; i < this.subs.length && visible > MAX_SUBTITLES; i++) {
      const s = this.subs[i]!;
      if (s.leaving) continue;
      s.leaving = true;
      s.left = 0;
      s.el.remove();
      visible--;
    }
  }

  banner(title: string, subtitle?: string, seconds = 4): void {
    const main = String(title ?? '').trim();
    if (!main) return;
    const sub = String(subtitle ?? '').trim();
    const key = main + '\u0000' + sub;
    const duration = seconds > 0 && Number.isFinite(seconds) ? seconds : 4;
    if (key === this.bannerKey && this.bannerAge < 2) {
      this.bannerLeft = Math.max(this.bannerLeft, duration);
      return;
    }
    this.bannerKey = key;
    this.bannerAge = 0;
    this.bannerTitle.textContent = main;
    this.bannerSub.textContent = sub;
    this.bannerSub.hidden = sub === '';
    this.bannerLeft = duration;
    this.bannerEl.hidden = false;
    this.bannerEl.classList.remove('is-out');
    // relance l'animation d'entrée
    this.bannerEl.style.animation = 'none';
    void this.bannerEl.offsetWidth;
    this.bannerEl.style.animation = '';
  }

  update(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]!;
      t.left -= dt;
      if (t.left > 0) continue;
      if (!t.leaving) {
        this.leaveToast(t);
      } else if (t.left <= -EXIT_TIME) {
        t.el.remove();
        this.toasts.splice(i, 1);
      }
    }
    for (let i = this.subs.length - 1; i >= 0; i--) {
      const s = this.subs[i]!;
      s.left -= dt;
      s.age += dt;
      if (s.left > 0) continue;
      s.el.remove();
      this.subs.splice(i, 1);
    }
    this.bannerAge += dt;
    if (this.bannerLeft > 0) {
      this.bannerLeft -= dt;
      if (this.bannerLeft <= 0) this.bannerEl.hidden = true;
      else if (this.bannerLeft < 0.4) this.bannerEl.classList.add('is-out');
    }
  }

  /** Efface tout (nouvelle session). */
  clear(): void {
    for (const t of this.toasts) t.el.remove();
    this.toasts.length = 0;
    for (const s of this.subs) s.el.remove();
    this.subs.length = 0;
    this.bannerLeft = 0;
    this.bannerKey = '';
    this.bannerEl.hidden = true;
  }

  /** Textes des notifications visibles (tests). */
  texts(): string[] {
    const out: string[] = [];
    for (const t of this.toasts) if (!t.leaving) out.push(t.text);
    return out;
  }

  /** Sous-titres visibles (tests). */
  subtitles(): string[] {
    const out: string[] = [];
    for (const s of this.subs) if (!s.leaving) out.push(s.el.textContent ?? '');
    return out;
  }

  private leaveToast(t: Toast): void {
    t.leaving = true;
    t.left = 0;
    t.el.classList.add('is-out');
  }
}
