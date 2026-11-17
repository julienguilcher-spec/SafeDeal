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
import { isCompact, leftZoneCenter, touchScale } from './layout';
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
  /** Position imposée à la zone de gauche ('' = centrée, règle de la feuille de style). */
  private leftTop = '';
  private toastMax = -1;
  private subBottom = -1;
  /** Bord gauche imposé aux sous-titres par la zone de gauche (px ; −1 : aucun). */
  private subLeft = -1;

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
      this.toastMax = -1;
      this.subBottom = -1;
      this.subLeft = -1;
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
    if (tick) {
      this.placeMessages();
      this.placeLeft();
    }
  }

  /**
   * Zone de gauche (boutons « Carte tactique », « Secours », proposition de l'adjoint) : centrée en hauteur, mais jamais
   * sur la zone du haut à gauche (état, mini-carte). Dans une petite fenêtre ou sur un téléphone, le bouton
   * « Carte tactique » recouvrait le bas de la mini-carte : la zone descend juste sous elle — sans jamais passer sur
   * la zone du bas ni sur la barre d'objets tactile (voir leftZoneCenter).
   */
  private placeLeft(): void {
    const zone = this.slots.left;
    let top = '';
    if (zone.childElementCount > 0) {
      const s = this.state;
      const r = zone.getBoundingClientRect();
      const above = this.slots['top-left'].getBoundingClientRect();
      // plancher : haut de la zone du bas si elle est sous la zone de gauche, à défaut haut de la barre d'objets tactile
      const below = this.slots.bottom.getBoundingClientRect();
      let floor = s.touch === 'pied' ? s.height - 68 * touchScale(s.width, s.height) : s.height;
      if (below.height > 0 && r.left < below.right && r.right > below.left && below.top < floor) floor = below.top;
      const center = leftZoneCenter(r, above, floor, s.height);
      if (center !== null) top = center + 'px';
    }
    if (top !== this.leftTop) {
      this.leftTop = top;
      zone.style.top = top;
    }
  }

  /**
   * Notifications sous les éléments du haut, sous-titres au-dessus de ceux du bas : leur position suit
   * la hauteur réelle des zones (qui dépend du rôle et des éléments ajoutés par d'autres modules).
   * Une lecture de mise en page par rafraîchissement lent, et seulement tant qu'un message est affiché.
   */
  private placeMessages(): void {
    const s = this.state;
    if (this.messages.toastCount() > 0) {
      const scale = touchScale(s.width, s.height);
      const center = s.width / 2;
      const mid = this.slots.top.getBoundingClientRect();
      const left = this.slots['top-left'].getBoundingClientRect();
      const right = this.slots['top-right'].getBoundingClientRect();
      // rangées de boutons système de la surcouche tactile, en haut à droite (290 × 110 à l'échelle 1) ;
      // en véhicule, la pastille « Sortir » est juste dessous (jusqu'à 159)
      const chipsLeft = s.touch === 'none' ? s.width : s.width - 293 * scale;
      const chipsBottom = s.touch === 'none' ? 0 : (s.touch === 'drone' ? 60 : s.touch === 'vehicule' ? 161 : 112) * scale;
      let top = (mid.height > 0 ? mid.bottom : 0) + 8;
      // place disponible de part et d'autre du centre, à côté des panneaux encore présents à cette hauteur
      const leftLimit = left.height > 0 && left.bottom > top ? left.right + 10 : 12;
      let rightLimit = right.height > 0 && right.bottom > top ? right.left - 10 : s.width - 12;
      if (chipsBottom > top) rightLimit = Math.min(rightLimit, chipsLeft - 8);
      let room = 2 * Math.min(center - leftLimit, rightLimit - center);
      if (room < 230) {
        // trop étroit entre les panneaux : les notifications passent dessous, sur toute la largeur utile
        top = Math.max(top, left.height > 0 ? left.bottom + 8 : 0, chipsBottom + 8);
        const rightEdge = right.height > 0 && right.bottom > top ? right.left - 10 : s.width - 12;
        room = 2 * Math.min(center - 12, rightEdge - center);
      }
      const width = Math.round(Math.max(200, Math.min(460, room)));
      // jamais au milieu de l'écran, sur le réticule : au plus au tiers de la hauteur (petite fenêtre, panneau
      // de gauche très haut) — quitte à passer devant le bas de ce panneau
      top = Math.round(Math.min(top, s.height * 0.3));
      if (Math.abs(top - this.noticeTop) > 1 || width !== this.toastMax) {
        this.noticeTop = top;
        this.toastMax = width;
        this.styleRoot.style.setProperty('--ui-notice-top', top + 'px');
        this.styleRoot.style.setProperty('--ui-toast-max', width + 'px');
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
      // la zone de gauche (proposition de l'adjoint et ses boutons « Accepter » / « Plus tard ») descend à la hauteur
      // des sous-titres : ils passent à sa droite au lieu de cacher les boutons
      let edge = -1;
      const zone = this.slots.left;
      if (zone.childElementCount > 0) {
        const z = zone.getBoundingClientRect();
        const bandBottom = s.height - bottom;
        if (z.height > 0 && z.bottom > bandBottom - 64 && z.top < bandBottom && z.right < s.width * 0.75) edge = Math.round(z.right + 8);
      }
      if (Math.abs(edge - this.subLeft) > 1) {
        this.subLeft = edge;
        this.applySubBand();
      }
    }
  }

  /**
   * Largeur et décalage des sous-titres : en tactile, entre le joystick et les boutons d'action ; à droite de la zone
   * de gauche quand elle est à leur hauteur (subLeft).
   */
  private applySubBand(): void {
    const s = this.state;
    const st = this.styleRoot.style;
    if (s.touch === 'none' && this.subLeft < 0) {
      st.removeProperty('--ui-sub-max');
      st.removeProperty('--ui-sub-shift');
      return;
    }
    const scale = touchScale(s.width, s.height);
    let left: number;
    let right: number;
    if (s.touch === 'none') {
      const half = Math.min(360, s.width * 0.37);
      left = s.width / 2 - half;
      right = s.width / 2 + half;
    } else {
      const [l, r] = TOUCH_SIDES[s.touch];
      left = l * scale;
      right = s.width - r * scale;
    }
    if (this.subLeft >= 0) left = Math.min(Math.max(left, this.subLeft), right - 160);
    st.setProperty('--ui-sub-max', Math.round(right - left) + 'px');
    st.setProperty('--ui-sub-shift', Math.round((left + right) / 2 - s.width / 2) + 'px');
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
      s.compact = isCompact(w, hgt);
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
    this.applySubBand();
    // positions de départ des messages ; affinées par placeMessages() dès qu'un message est affiché
    this.noticeTop = -1;
    this.toastMax = -1;
    this.subBottom = -1;
    this.styleRoot.style.removeProperty('--ui-toast-max');
    this.styleRoot.style.setProperty('--ui-sub-bottom', (s.touch === 'pied' ? Math.round(68 * scale) + 60 : s.compact ? 110 : 150) + 'px');
    this.styleRoot.style.setProperty('--ui-notice-top', (s.compact ? 92 : 80) + 'px');
  }
}
