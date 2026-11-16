/* =====================================================================================
 * HUD — gestionnaire : neuf zones, éléments internes (adaptés au rôle et à la situation) et
 * éléments ajoutés par les autres modules (UiKit.addHudWidget).
 *
 * Performance : l'état du joueur est lu une fois par image ; chaque élément ne touche au DOM que
 * si sa valeur change ; les textes et listes sont rafraîchis à 8 Hz (TICK), seules les
 * transformations (boussole, réticule, marqueurs) suivent l'image.
 * ===================================================================================== */

import type { SeatRole } from '@/core/contracts';
import type { HudSlot, HudWidget } from '@/core/extensions';
import type { InputTouchApi } from '@/input/api';
import { h } from '../core/dom';
import { COMPACT_HEIGHT, touchScale } from './layout';
import { hudProfile } from './model';
import type { HudEnv, HudPart, HudState, TouchMode } from './types';

export const HUD_SLOTS: readonly HudSlot[] = [
  'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right', 'center',
];

/** Période de rafraîchissement des textes et listes (s). */
export const TICK = 0.125;
interface PartSlot {
  part: HudPart;
  slot: HudSlot | null | undefined;
  shown: boolean;
}

interface External {
  id: string;
  host: HTMLElement;
  widget: HudWidget;
}

/** Messages transitoires que le HUD doit placer à côté de ses éléments (notifications, sous-titres). */
export interface HudMessages {
  toastCount(): number;
  subtitleCount(): number;
}

/** Marges latérales (px à l'échelle 1) prises par la surcouche tactile de chaque disposition, en bas de l'écran. */
const TOUCH_SIDES: Readonly<Record<Exclude<TouchMode, 'none'>, readonly [number, number]>> = {
  pied: [176, 214],
  vehicule: [210, 290],
  drone: [176, 240],
};

export class Hud {
  readonly root: HTMLElement;
  readonly slots: Record<HudSlot, HTMLElement>;
  readonly state: HudState;
  private readonly parts: PartSlot[] = [];
  private readonly externals: External[] = [];
  private visible = false;
  private tickAcc = TICK;
  private sizeDirty = true;
  private lastTouch: TouchMode | '' = '';
  private lastCompact: boolean | null = null;
  private lastScale = 0;
  private readonly onResize = (): void => {
    this.sizeDirty = true;
  };

  private noticeTop = -1;
  private subBottom = -1;

  constructor(
    layer: HTMLElement, private readonly env: HudEnv, private readonly styleRoot: HTMLElement,
    private readonly messages: HudMessages = { toastCount: () => 0, subtitleCount: () => 0 },
  ) {
    this.root = layer;
    layer.classList.add('ui-hud');
    layer.hidden = true;
    const slots = {} as Record<HudSlot, HTMLElement>;
    for (const name of HUD_SLOTS) {
      const el = h('div', `hud-slot hud-slot--${name}`);
      slots[name] = el;
    }
    this.slots = slots;
    this.state = {
      person: null, vehicle: null, seat: null, role: 'crs', camera: 'tps',
      profile: hudProfile('crs', 'tps', null, false),
      device: 'kbm', touch: 'none', compact: false, width: 1280, height: 720, x: 0, z: 0, yaw: 0, time: 0,
    };
    if (typeof window !== 'undefined') window.addEventListener('resize', this.onResize);
  }

  /** Ajoute les éléments internes, puis insère les zones (les calques plein écran restent dessous). */
  mount(parts: readonly HudPart[]): void {
    for (const part of parts) {
      part.el.hidden = true;
      part.el.dataset.w = part.id;
      part.el.style.order = String(part.order);
      this.parts.push({ part, slot: undefined, shown: false });
    }
    // calques plein écran d'abord (dans l'ordre fourni), zones par-dessus
    for (const ps of this.parts) if (ps.part.slot(this.state) === null) this.root.append(ps.part.el);
    for (const name of HUD_SLOTS) this.root.append(this.slots[name]);
  }

  addWidget(id: string, slot: HudSlot, create: (host: HTMLElement) => HudWidget): void {
    this.removeWidget(id);
    const zone = this.slots[slot] ?? this.slots.center;
    const host = h('div', 'hud-w');
    host.dataset.w = id;
    zone.append(host);
    let widget: HudWidget;
    try {
      widget = create(host);
    } catch (err) {
      host.remove();
      console.error(`[ui] création de l'élément de HUD « ${id} » impossible`, err);
      return;
    }
    this.externals.push({ id, host, widget });
  }

  removeWidget(id: string): void {
    for (let i = this.externals.length - 1; i >= 0; i--) {
      const e = this.externals[i]!;
      if (e.id !== id) continue;
      try {
        e.widget.dispose();
      } catch (err) {
        console.error(`[ui] erreur dans dispose() de l'élément de HUD « ${id} »`, err);
      }
      e.host.remove();
      this.externals.splice(i, 1);
    }
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) {
      for (const ps of this.parts) {
        if (!ps.shown) continue;
        ps.shown = false;
        ps.part.el.hidden = true;
        ps.part.hidden?.();
      }
      for (const name of ['--ui-sub-bottom', '--ui-notice-top', '--ui-sub-max', '--ui-sub-shift', '--ui-toast-max']) this.styleRoot.style.removeProperty(name);
      this.noticeTop = -1;
      this.subBottom = -1;
      this.lastTouch = '';
    } else {
      this.tickAcc = TICK;
      this.sizeDirty = true;
    }
  }

  /** Identifiants des éléments actuellement affichés (tests). */
  widgetIds(): string[] {
    const out: string[] = [];
    if (!this.visible) return out;
    for (const ps of this.parts) if (ps.shown) out.push(ps.part.id);
    for (const e of this.externals) out.push(e.id);
    return out;
  }

  update(dt: number): void {
    if (!this.visible) return;
    const s = this.state;
    s.time += dt;
    this.readState();
    this.applyLayout();

    this.tickAcc += dt;
    const tick = this.tickAcc >= TICK;
    if (tick) this.tickAcc = this.tickAcc % TICK;

    for (let i = 0; i < this.parts.length; i++) {
      const ps = this.parts[i]!;
      const part = ps.part;
      let show = false;
      try {
        show = part.visible(s);
      } catch (err) {
        console.error(`[ui] HUD « ${part.id} » : erreur dans visible()`, err);
      }
      if (show !== ps.shown) {
        ps.shown = show;
        part.el.hidden = !show;
        if (!show) part.hidden?.();
      }
      if (!show) continue;
      const slot = part.slot(s);
      if (slot !== ps.slot) {
        ps.slot = slot;
        if (slot !== null) this.slots[slot].append(part.el);
      }
      try {
        if (tick && part.tick) part.tick(s);
        if (part.frame) part.frame(dt, s);
      } catch (err) {
        console.error(`[ui] HUD « ${part.id} » : erreur de mise à jour`, err);
      }
    }
    for (let i = 0; i < this.externals.length; i++) {
      const e = this.externals[i]!;
      if (!e.widget.update) continue;
      try {
        e.widget.update(dt);
      } catch (err) {
        console.error(`[ui] HUD « ${e.id} » : erreur dans update()`, err);
      }
    }
    if (tick) this.placeMessages();
  }

  /**
   * Notifications sous les éléments du haut, sous-titres au-dessus de ceux du bas : leur position suit
   * la hauteur réelle des zones (qui dépend du rôle et des éléments ajoutés par d'autres modules).
   * Une lecture de mise en page par rafraîchissement lent, et seulement tant qu'un message est affiché.
   */
  private placeMessages(): void {
    const s = this.state;
    if (this.messages.toastCount() > 0) {
      const bottom = this.slots.top.getBoundingClientRect().bottom;
      const top = Math.round(Math.max(bottom, 0) + 8);
      if (Math.abs(top - this.noticeTop) > 1) {
        this.noticeTop = top;
        this.styleRoot.style.setProperty('--ui-notice-top', top + 'px');
      }
    }
    if (this.messages.subtitleCount() > 0) {
      const r = this.slots.bottom.getBoundingClientRect();
      const top = r.height > 0 ? r.top : s.height - 20;
      const bottom = Math.round(s.height - top + 8);
      if (Math.abs(bottom - this.subBottom) > 1) {
        this.subBottom = bottom;
        this.styleRoot.style.setProperty('--ui-sub-bottom', bottom + 'px');
      }
    }
  }

  reset(): void {
    for (const ps of this.parts) ps.part.reset?.();
    this.tickAcc = TICK;
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResize);
    for (const ps of this.parts) ps.part.dispose?.();
    while (this.externals.length) this.removeWidget(this.externals[0]!.id);
  }

  private readState(): void {
    const s = this.state;
    const ctx = this.env.ctx;
    const ps = ctx.player.state;
    const person = ctx.player.person();
    const vehicle = person ? ctx.player.vehicle() : null;
    let seat: SeatRole | null = null;
    if (person && vehicle) {
      const def = vehicle.def.seats[person.seat];
      seat = def ? def.role : 'passenger';
    }
    s.person = person;
    s.vehicle = vehicle;
    s.seat = seat;
    s.role = ps.role;
    s.camera = ps.cameraMode;
    s.yaw = ps.camYaw;
    s.device = ctx.input.device;
    if (person) {
      s.x = person.x;
      s.z = person.z;
    } else if (ctx.view) {
      s.x = ctx.view.camX;
      s.z = ctx.view.camZ;
    }
    const p = s.profile;
    const next = hudProfile(s.role, s.camera, seat, person !== null);
    p.status = next.status;
    p.items = next.items;
    p.compass = next.compass;
    p.objectives = next.objectives;
    p.situation = next.situation;
    p.legal = next.legal;
    p.vehicle = next.vehicle;
    p.drone = next.drone;
    p.viewfinder = next.viewfinder;
    p.reticle = next.reticle;

    if (this.sizeDirty) {
      this.sizeDirty = false;
      const w = this.root.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
      const hgt = this.root.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720);
      s.width = w;
      s.height = hgt;
      s.compact = hgt < COMPACT_HEIGHT;
    }
    const touch = ctx.service<InputTouchApi>('input.touch');
    let mode: TouchMode = 'none';
    if (touch && touch.visible) {
      const layout = touch.layout;
      if (layout === 'pied' || layout === 'vehicule' || layout === 'drone') mode = layout;
    }
    s.touch = mode;
  }

  /** Attributs et variables CSS de disposition, écrits seulement quand ils changent. */
  private applyLayout(): void {
    const s = this.state;
    const scale = touchScale(s.width, s.height);
    if (s.touch === this.lastTouch && s.compact === this.lastCompact && scale === this.lastScale) return;
    this.lastTouch = s.touch;
    this.lastCompact = s.compact;
    this.lastScale = scale;
    this.root.setAttribute('data-touch', s.touch);
    this.root.setAttribute('data-compact', s.compact ? '1' : '0');
    this.root.style.setProperty('--ts', scale.toFixed(3));
    // en tactile, les sous-titres tiennent entre le joystick et les boutons d'action
    if (s.touch === 'none') {
      this.styleRoot.style.removeProperty('--ui-sub-max');
      this.styleRoot.style.removeProperty('--ui-sub-shift');
      this.styleRoot.style.removeProperty('--ui-toast-max');
    } else {
      // notifications : entre le panneau de situation et la rangée de boutons système (290 px à l'échelle 1)
      this.styleRoot.style.setProperty('--ui-toast-max', Math.max(220, Math.round(s.width - 602 * scale)) + 'px');
      const [left, right] = TOUCH_SIDES[s.touch];
      this.styleRoot.style.setProperty('--ui-sub-max', Math.round(s.width - (left + right) * scale) + 'px');
      this.styleRoot.style.setProperty('--ui-sub-shift', Math.round(((left - right) * scale) / 2) + 'px');
    }
    // positions de départ des messages ; affinées par placeMessages() dès qu'un message est affiché
    this.noticeTop = -1;
    this.subBottom = -1;
    this.styleRoot.style.setProperty('--ui-sub-bottom', (s.touch === 'pied' ? Math.round(68 * scale) + 60 : s.compact ? 110 : 150) + 'px');
    this.styleRoot.style.setProperty('--ui-notice-top', (s.compact ? 92 : 80) + 'px');
  }
}
