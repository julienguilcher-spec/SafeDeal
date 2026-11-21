/* =====================================================================================
 * Surcouche tactile — éléments DOM, suivi des doigts, joystick virtuel, pédales, barre d'objets.
 *
 * Chaque doigt est suivi par son identifiant de pointeur (Pointer Events) du contact au
 * relâchement : on peut marcher, regarder et tirer en même temps, et un doigt qui glisse hors
 * de son bouton le garde enfoncé. La souris est acceptée sur les boutons (essais sur ordinateur)
 * mais pas sur les zones de joystick et de regard, qui restent alors au clavier/souris.
 * Les écritures dans le DOM qui dépendent du mouvement (pommeau, jauges) sont regroupées dans
 * sync(), une fois par image ; les gestionnaires d'événements n'allouent rien.
 * ===================================================================================== */

import type { Button, Settings } from '@/core/contracts';
import type { TouchItem, TouchLayout } from '../api';
import { TOUCH_STICK, curve, resetVirtualStick, shapePedal, shapeVirtualStick } from '../axes';
import type { VirtualStick, VirtualStickTuning } from '../axes';
import { BUTTON_COUNT, BUTTON_INDEX, buttonIndex } from '../buttons';
import { CH_LOOK_X, CH_LOOK_Y } from '../core';
import type { InputCore } from '../core';
import { SRC_TOUCH, clearSourceAxes, createSourceAxes } from '../merge';
import type { SourceAxes } from '../merge';
import { CONTROLS, ICONS, ITEM_BAR, STICKS, overlayScale } from './layouts';
import type { ControlSpec, GameLayout, StickSpec, TouchSeatInfo } from './layouts';
import { STYLE_ID, TOUCH_CSS } from './style';

/** Rotation par pixel de glissement à sensibilité 1 (rad) ; le vertical est un peu moins vif. */
export const TOUCH_RAD_PER_PX = 0.0046;
export const TOUCH_PITCH_RATIO = 0.72;
/** Glissement minimal (px) avant qu'un doigt posé sur « Action » ou « Viser » fasse tourner la vue. */
const LOOK_DRAG_THRESHOLD = 8;
const MAX_FINGERS = 10;
/** Exposant du volant tactile (plus fin autour du point milieu). */
const STEER_GAMMA = 1.35;

const K_FREE = 0;
const K_STICK = 1;
const K_LOOK = 2;
const K_BUTTON = 3;
const K_PEDAL = 4;
const K_ITEM = 5;
const K_INERT = 6;

interface Finger {
  id: number;
  kind: number;
  /** Index dans CONTROLS (bouton, pédale) ou numéro de case (objet). */
  ref: number;
  toggle: boolean;
  dragging: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  el: HTMLElement | null;
}

export interface OverlayHost {
  core: InputCore;
  settings(): Settings;
  /** Le bouton est-il à bascule ? */
  isToggle(index: number): boolean;
  /** Un doigt vient de se poser sur la surcouche. */
  activity(): void;
  /** Petite vibration de confirmation (ms). */
  haptic(ms: number): void;
}

function px(scaleUnits: number): string {
  return `calc(var(--s) * ${scaleUnits}px)`;
}

function anchored(side: string, units: number): string {
  return `calc(env(safe-area-inset-${side}, 0px) + var(--s) * ${units}px)`;
}

/** Premier mot d'un nom d'objet, tronqué : « Grenade lacrymogène » → « Grenade ». */
function shortName(name: string, max: number): string {
  const first = name.trim().split(/[\s_-]/)[0] ?? '';
  return first.slice(0, max);
}

export class TouchOverlay {
  readonly root: HTMLDivElement;
  readonly axes: SourceAxes = createSourceAxes();
  /** Disposition affichée. */
  layout: TouchLayout = 'menu';
  visible = false;
  /** Écran en portrait : le message « tournez l'appareil » couvre tout. */
  portrait = false;
  scale = 1;

  private readonly host: OverlayHost;
  private readonly fingers: Finger[] = [];
  private readonly holds = new Uint8Array(BUTTON_COUNT);
  private readonly toggled = new Uint8Array(BUTTON_COUNT);
  private readonly controlEls: HTMLElement[] = [];
  private readonly labelEls: HTMLElement[] = [];
  private readonly fillEls: (HTMLElement | null)[] = [];
  private readonly controlButton: Int16Array;
  private readonly stickEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;
  private readonly tipEl: HTMLDivElement;
  private readonly itemsEl: HTMLDivElement;
  private readonly probeEl: HTMLDivElement;
  private itemEls: HTMLElement[] = [];
  private itemActive = -1;
  /** Équipement appliqué aux pastilles (bits : masque 1, visière 2, lampe 4 ; −1 : jamais appliqué). */
  private gearBits = -1;

  private readonly stick: VirtualStick = { x: 0, y: 0, knobX: 0, knobY: 0, full: false };
  private readonly tuning: VirtualStickTuning = { radius: 62, ...TOUCH_STICK };
  private stickSpec: StickSpec | null = null;
  private stickFinger = -1;
  private stickCx = 0;
  private stickCy = 0;
  private homeCx = 0;
  private homeCy = 0;
  private lookPxX = 0;
  private lookPxY = 0;
  private throttle = 0;
  private brake = 0;

  private width = 0;
  private height = 0;
  private originX = 0;
  private originY = 0;
  private safeLeft = 0;
  private safeBottom = 0;
  private metricsDirty = true;
  private stickDirty = true;
  private pedalDirty = false;
  private readonly sprintIndex = BUTTON_INDEX.sprint;
  private disposed = false;

  constructor(parent: HTMLElement, host: OverlayHost) {
    this.host = host;
    const doc = parent.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = TOUCH_CSS;
      doc.head.appendChild(style);
    }
    for (let i = 0; i < MAX_FINGERS; i++) {
      this.fingers.push({ id: -1, kind: K_FREE, ref: -1, toggle: false, dragging: false, x: 0, y: 0, startX: 0, startY: 0, el: null });
    }

    const root = doc.createElement('div');
    root.className = 'crs-touch';
    root.hidden = true;
    root.dataset.layout = 'menu';
    // #ui rend ses enfants cliquables : la racine reste transparente aux pointeurs, seuls ses boutons et zones réagissent.
    root.style.pointerEvents = 'none';
    this.root = root;

    const zone = (cls: string, ct: string): void => {
      const z = doc.createElement('div');
      z.className = 'ct-zone ' + cls;
      z.dataset.ct = ct;
      root.appendChild(z);
    };
    zone('ct-look', 'look');
    zone('ct-move', 'stick');

    this.stickEl = doc.createElement('div');
    this.stickEl.className = 'ct-stick is-idle';
    const arrows = doc.createElement('div');
    arrows.className = 'ct-stick-arrows';
    arrows.innerHTML = '<span>◀</span><span>▶</span>';
    this.knobEl = doc.createElement('div');
    this.knobEl.className = 'ct-knob';
    this.tipEl = doc.createElement('div');
    this.tipEl.className = 'ct-stick-tip';
    this.stickEl.append(arrows, this.knobEl, this.tipEl);
    root.appendChild(this.stickEl);

    this.controlButton = new Int16Array(CONTROLS.length);
    for (let i = 0; i < CONTROLS.length; i++) {
      const c = CONTROLS[i]!;
      this.controlButton[i] = c.button ? BUTTON_INDEX[c.button] : -1;
      const el = doc.createElement('div');
      el.className = `ct-c ct-${c.shape} ct-l-${c.layout} ct-k-${c.key}` + (c.accent ? ' ct-accent' : '') + (c.label.indexOf(' ') >= 0 && !c.contextual ? ' ct-w2' : '')
        + (c.seat === 'conduite' ? ' ct-drv' : c.seat === 'arme' ? ' ct-gun' : '');
      el.dataset.ct = (c.pedal ? 'p' : 'b') + i;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', c.label);
      el.style.setProperty(c.side, anchored(c.side, c.x));
      el.style.setProperty(c.anchor, anchored(c.anchor, c.y));
      el.style.width = px(c.w);
      el.style.height = px(c.h);
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.icon]}</svg>`;
      const label = doc.createElement('span');
      label.className = 'ct-t';
      label.textContent = c.label;
      if (c.shape === 'round' || c.shape === 'chip') {
        // le texte doit tenir dans le bouton (corde du cercle, largeur de la pastille) :
        // sa taille dépend de la longueur du mot le plus long
        const longest = c.label.split(' ').reduce((m, w) => Math.max(m, w.length), 0);
        const room = c.shape === 'round' ? c.w * 0.74 : c.w * 0.88;
        const fs = Math.min(c.shape === 'round' ? 9.5 : 8.5, room / (longest * 0.7));
        label.style.fontSize = px(Math.round(fs * 10) / 10);
      }
      el.appendChild(label);
      let fill: HTMLElement | null = null;
      if (c.pedal) {
        fill = doc.createElement('div');
        fill.className = 'ct-fill';
        el.appendChild(fill);
      }
      this.controlEls.push(el);
      this.labelEls.push(label);
      this.fillEls.push(fill);
      root.appendChild(el);
    }

    this.itemsEl = doc.createElement('div');
    this.itemsEl.className = 'ct-items';
    this.itemsEl.style.left = anchored('left', ITEM_BAR.left);
    this.itemsEl.style.right = anchored('right', ITEM_BAR.right);
    this.itemsEl.style.bottom = anchored('bottom', ITEM_BAR.bottom);
    this.itemsEl.style.height = px(ITEM_BAR.height);
    root.appendChild(this.itemsEl);

    const rotate = doc.createElement('div');
    rotate.className = 'ct-rotate';
    rotate.dataset.ct = 'block';
    rotate.setAttribute('role', 'alert');
    rotate.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="15" y="5" width="18" height="38" rx="3.500"/><path d="M21.500 38.500h5"/></svg>'
      + '<b>Tournez votre appareil</b><span>CRS Simulation France se joue en mode paysage.</span>';
    root.appendChild(rotate);

    this.probeEl = doc.createElement('div');
    this.probeEl.className = 'ct-probe';
    root.appendChild(this.probeEl);

    // Premier enfant : les éléments de l'interface ajoutés ensuite passent au-dessus des zones.
    parent.insertBefore(root, parent.firstChild);

    root.addEventListener('pointerdown', this.onDown, { passive: false });
    root.addEventListener('pointermove', this.onMove, { passive: false });
    root.addEventListener('pointerup', this.onUp, { passive: false });
    root.addEventListener('pointercancel', this.onUp, { passive: false });
    root.addEventListener('contextmenu', this.onPrevent);
    root.addEventListener('touchstart', this.onPrevent, { passive: false });
    root.addEventListener('touchmove', this.onPrevent, { passive: false });
    root.addEventListener('gesturestart', this.onPrevent);
    const win = doc.defaultView;
    if (win) {
      win.addEventListener('resize', this.onResize);
      win.addEventListener('orientationchange', this.onResize);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelAll();
    const win = this.root.ownerDocument.defaultView;
    if (win) {
      win.removeEventListener('resize', this.onResize);
      win.removeEventListener('orientationchange', this.onResize);
    }
    this.root.remove();
  }

  // ───────────────────────────── réglages venus du contrôleur ─────────────────────────────

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    this.cancelAll();
    this.metricsDirty = true;
  }

  setLayout(layout: TouchLayout): void {
    if (layout === this.layout) return;
    this.cancelAll();
    this.layout = layout;
    this.root.dataset.layout = layout;
    let spec: StickSpec | null = null;
    for (let i = 0; i < STICKS.length; i++) if (STICKS[i]!.layout === layout) spec = STICKS[i]!;
    this.stickSpec = spec;
    if (spec) {
      this.stickEl.classList.toggle('is-track', spec.horizontal);
      this.tipEl.textContent = spec.label;
    }
    this.metricsDirty = true;
  }

  /** Libellé des boutons contextuels ; `contextual = false` : libellé par défaut, bouton discret. */
  setInteract(text: string | null): void {
    for (let i = 0; i < CONTROLS.length; i++) {
      const c = CONTROLS[i]!;
      if (!c.contextual) continue;
      const el = this.controlEls[i]!;
      const label = text ?? c.label;
      if (this.labelEls[i]!.textContent !== label) this.labelEls[i]!.textContent = label;
      el.setAttribute('aria-label', label);
      el.classList.toggle('is-ctx', text !== null);
      el.classList.toggle('is-dim', text === null && c.key === 'interact');
    }
  }

  /**
   * Place à bord et équipement : attributs de la racine (data-seat, data-arme, data-sirene, data-gyro) lus par la
   * feuille de style, et pastilles d'équipement sans objet masquées (classe ct-na, distincte de ct-off que pose
   * setButtonVisible). Écritures seulement quand quelque chose change.
   */
  setPlace(seat: TouchSeatInfo, gear: { mask: boolean; visor: boolean; flashlight: boolean }): void {
    const d = this.root.dataset;
    const arme = seat.armed ? '1' : '0';
    const sirene = seat.siren ? '1' : '0';
    const gyro = seat.beacons ? '1' : '0';
    if (d.seat !== seat.seat) {
      // le conducteur qui devient passager ne doit pas garder l'accélérateur enfoncé
      if (d.seat !== undefined) this.cancelAll();
      d.seat = seat.seat;
    }
    if (d.arme !== arme) d.arme = arme;
    if (d.sirene !== sirene) d.sirene = sirene;
    if (d.gyro !== gyro) d.gyro = gyro;
    const g = (gear.mask ? 1 : 0) | (gear.visor ? 2 : 0) | (gear.flashlight ? 4 : 0);
    if (g === this.gearBits) return;
    this.gearBits = g;
    for (let i = 0; i < CONTROLS.length; i++) {
      const b = CONTROLS[i]!.button;
      const na = (b === 'mask' && !gear.mask) || (b === 'visor' && !gear.visor) || (b === 'flashlight' && !gear.flashlight);
      this.controlEls[i]!.classList.toggle('ct-na', na);
    }
  }

  setButtonVisible(button: Button, visible: boolean): void {
    for (let i = 0; i < CONTROLS.length; i++) {
      if (CONTROLS[i]!.button === button) this.controlEls[i]!.classList.toggle('ct-off', !visible);
    }
  }

  /** Reconstruit la barre d'objets (appelé seulement quand la liste change). */
  setItems(items: readonly TouchItem[], active: number): void {
    const doc = this.root.ownerDocument;
    this.itemsEl.textContent = '';
    this.itemEls = [];
    const n = items.length < ITEM_BAR.max ? items.length : ITEM_BAR.max;
    for (let i = 0; i < n; i++) {
      const it = items[i]!;
      const el = doc.createElement('div');
      el.className = 'ct-item';
      el.dataset.ct = 'i' + i;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', it.label ?? `Objet ${i + 1}`);
      const key = doc.createElement('span');
      key.className = 'ct-item-k';
      key.textContent = String(i + 1);
      const icon = doc.createElement('span');
      const glyph = Array.from(it.icon).length <= 2;
      icon.className = glyph ? 'ct-item-ic' : 'ct-item-ic is-text';
      icon.textContent = glyph ? it.icon : shortName(it.label ?? it.icon, 10);
      el.append(key, icon);
      if (glyph && it.label) {
        const l = doc.createElement('span');
        l.className = 'ct-item-l';
        l.textContent = shortName(it.label, 9);
        el.appendChild(l);
      }
      if (it.count !== undefined) {
        const c = doc.createElement('span');
        c.className = 'ct-item-n';
        c.textContent = String(it.count);
        el.appendChild(c);
      }
      this.itemsEl.appendChild(el);
      this.itemEls.push(el);
    }
    this.itemActive = -1;
    this.setActiveItem(active);
  }

  setActiveItem(active: number): void {
    if (active === this.itemActive) return;
    const prev = this.itemEls[this.itemActive];
    if (prev) prev.classList.remove('is-active');
    const next = this.itemEls[active];
    if (next) next.classList.add('is-active');
    this.itemActive = active;
  }

  /** Un bouton n'est plus à bascule : on le relâche s'il était resté enfoncé. */
  clearToggle(index: number): void {
    if (this.toggled[index] === 0) return;
    this.toggled[index] = 0;
    this.applyButton(index);
    this.refreshToggleClass(index);
  }

  // ───────────────────────────── scrutation et affichage ─────────────────────────────

  /** Une fois par image : axes, course, rotation du regard. */
  sample(): void {
    const a = this.axes;
    clearSourceAxes(a);
    const latch = this.host.core.latch;
    const layout = this.layout;
    const active = this.visible && !this.portrait;
    if (active && (layout === 'pied' || layout === 'drone')) {
      a.moveX = this.stick.x;
      a.moveY = this.stick.y;
      latch.set(SRC_TOUCH, this.sprintIndex, layout === 'pied' && this.stickFinger >= 0 && this.stick.full);
    } else {
      latch.set(SRC_TOUCH, this.sprintIndex, false);
      if (active && layout === 'vehicule') {
        a.moveX = curve(this.stick.x, STEER_GAMMA);
        a.throttle = this.throttle;
        a.brake = this.brake;
        a.moveY = this.throttle - this.brake;
      }
    }
    if (this.lookPxX !== 0 || this.lookPxY !== 0) {
      const s = this.host.settings();
      const sens = s.touchSensitivity > 0 ? s.touchSensitivity : 1;
      const k = TOUCH_RAD_PER_PX * sens;
      // doigt vers le haut de l'écran (dy < 0) = lever le regard
      const pending = this.host.core.pending;
      pending[CH_LOOK_X] += this.lookPxX * k;
      pending[CH_LOOK_Y] += this.lookPxY * k * TOUCH_PITCH_RATIO * (s.invertY ? 1 : -1);
      this.lookPxX = 0;
      this.lookPxY = 0;
    }
  }

  /** Une fois par image : met le DOM à jour (rien si rien n'a bougé). */
  sync(): void {
    if (!this.visible) return;
    if (this.metricsDirty) this.measure();
    if (this.stickDirty) {
      this.stickDirty = false;
      const spec = this.stickSpec;
      if (spec) {
        const s = this.scale;
        const w = spec.radius * 2 * s;
        const h = spec.horizontal ? (spec.knob + 22) * s : w;
        this.stickEl.style.transform = `translate(${(this.stickCx - w / 2).toFixed(1)}px,${(this.stickCy - h / 2).toFixed(1)}px)`;
        const half = (spec.knob * s) / 2;
        let kx = this.stick.knobX;
        let ky = this.stick.knobY;
        if (spec.horizontal) {
          // sur la piste du volant, le pommeau s'arrête au bord au lieu d'en dépasser
          kx = (kx / (spec.radius * s)) * (spec.radius - spec.knob / 2 - 6) * s;
          ky = 0;
        }
        this.knobEl.style.transform = `translate(${(kx - half).toFixed(1)}px,${(ky - half).toFixed(1)}px)`;
        this.stickEl.classList.toggle('is-full', this.layout === 'pied' && this.stickFinger >= 0 && this.stick.full);
        this.stickEl.classList.toggle('is-idle', this.stickFinger < 0);
        if (this.layout === 'pied') {
          const tip = this.stickFinger >= 0 && this.stick.full ? 'Course' : '';
          if (this.tipEl.textContent !== tip) this.tipEl.textContent = tip;
        }
      }
    }
    if (this.pedalDirty) {
      this.pedalDirty = false;
      for (let i = 0; i < CONTROLS.length; i++) {
        const fill = this.fillEls[i];
        if (!fill) continue;
        const v = CONTROLS[i]!.pedal === 'throttle' ? this.throttle : this.brake;
        fill.style.height = (v * 100).toFixed(0) + '%';
      }
    }
  }

  /** Relit la taille de l'écran, l'échelle, les zones sûres et l'orientation. */
  private measure(): void {
    this.metricsDirty = false;
    const rect = this.root.getBoundingClientRect();
    this.originX = rect.left;
    this.originY = rect.top;
    this.width = rect.width;
    this.height = rect.height;
    if (!(this.width > 0) || !(this.height > 0)) {
      this.metricsDirty = true;      // pas encore mis en page
      return;
    }
    this.portrait = this.height > this.width;
    this.root.classList.toggle('is-portrait', this.portrait);
    // en portrait, on dimensionne comme si l'écran était déjà tourné
    this.scale = this.portrait ? overlayScale(this.height, this.width) : overlayScale(this.width, this.height);
    this.root.style.setProperty('--s', this.scale.toFixed(3));
    this.safeLeft = this.probeEl.offsetWidth;
    this.safeBottom = this.probeEl.offsetHeight;
    const spec = this.stickSpec;
    if (spec) {
      const s = this.scale;
      this.tuning.radius = spec.radius * s;
      const w = spec.radius * 2 * s;
      const h = spec.horizontal ? (spec.knob + 22) * s : w;
      this.stickEl.style.width = w.toFixed(1) + 'px';
      this.stickEl.style.height = h.toFixed(1) + 'px';
      const k = (spec.knob * s).toFixed(1) + 'px';
      this.knobEl.style.width = k;
      this.knobEl.style.height = k;
      this.homeCx = this.safeLeft + spec.cx * s;
      this.homeCy = this.height - this.safeBottom - spec.cy * s;
      if (this.stickFinger < 0) {
        this.stickCx = this.homeCx;
        this.stickCy = this.homeCy;
      }
    }
    if (this.portrait) this.cancelAll();
    this.stickDirty = true;
  }

  // ───────────────────────────── doigts ─────────────────────────────

  private finger(id: number): Finger | null {
    const f = this.fingers;
    for (let i = 0; i < f.length; i++) if (f[i]!.kind !== K_FREE && f[i]!.id === id) return f[i]!;
    return null;
  }

  private freeFinger(): Finger | null {
    const f = this.fingers;
    for (let i = 0; i < f.length; i++) if (f[i]!.kind === K_FREE) return f[i]!;
    return null;
  }

  private readonly onDown = (e: PointerEvent): void => {
    const target = e.target as Element | null;
    const el = target && typeof target.closest === 'function' ? (target.closest('[data-ct]') as HTMLElement | null) : null;
    if (!el) return;
    const ct = el.dataset.ct ?? '';
    const mouse = e.pointerType === 'mouse';
    if (mouse) {
      // Zones de joystick et de regard : la souris y reste une souris (capture, clic = action).
      if (ct === 'look' || ct === 'stick' || e.button !== 0) return;
    } else {
      this.host.activity();
    }
    e.preventDefault();
    if (this.metricsDirty) this.measure();
    const old = this.finger(e.pointerId);
    if (old) this.release(old);
    const f = this.freeFinger();
    if (!f) return;
    f.id = e.pointerId;
    f.el = el;
    f.dragging = false;
    f.toggle = false;
    f.ref = -1;
    f.x = f.startX = e.clientX - this.originX;
    f.y = f.startY = e.clientY - this.originY;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché : sans importance
    }
    const c0 = ct.charCodeAt(0);
    if (ct === 'look') {
      f.kind = K_LOOK;
    } else if (ct === 'stick') {
      if (this.stickFinger >= 0 || !this.stickSpec) f.kind = K_LOOK;   // second doigt à gauche : il regarde
      else this.startStick(f);
    } else if (ct === 'block') {
      f.kind = K_INERT;
    } else if (c0 === 98 /* b */) {
      this.startButton(f, Number(ct.slice(1)));
    } else if (c0 === 112 /* p */) {
      f.kind = K_PEDAL;
      f.ref = Number(ct.slice(1));
      el.classList.add('is-down');
      this.updatePedal(f);
      this.host.haptic(8);
    } else if (c0 === 105 /* i */) {
      f.kind = K_ITEM;
      f.ref = Number(ct.slice(1));
      el.classList.add('is-down');
      const slot = buttonIndex('slot' + (f.ref + 1));
      if (slot >= 0) this.host.core.latch.pulse(SRC_TOUCH, slot);
      this.host.haptic(8);
    } else {
      f.kind = K_INERT;
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    const f = this.finger(e.pointerId);
    if (!f) return;
    e.preventDefault();
    const x = e.clientX - this.originX;
    const y = e.clientY - this.originY;
    if (f.kind === K_LOOK) {
      this.lookPxX += x - f.x;
      this.lookPxY += y - f.y;
    } else if (f.kind === K_STICK) {
      this.updateStick(x, y);
    } else if (f.kind === K_BUTTON) {
      if (CONTROLS[f.ref]!.lookDrag) {
        if (f.dragging) {
          this.lookPxX += x - f.x;
          this.lookPxY += y - f.y;
        } else {
          const dx = x - f.startX;
          const dy = y - f.startY;
          if (dx * dx + dy * dy >= LOOK_DRAG_THRESHOLD * LOOK_DRAG_THRESHOLD) f.dragging = true;
        }
      }
    } else if (f.kind === K_PEDAL) {
      f.x = x;
      f.y = y;
      this.updatePedal(f);
    }
    f.x = x;
    f.y = y;
  };

  private readonly onUp = (e: PointerEvent): void => {
    const f = this.finger(e.pointerId);
    if (!f) return;
    e.preventDefault();
    this.release(f);
  };

  private readonly onPrevent = (e: Event): void => {
    // pas de défilement, de zoom, de menu d'appui long ni d'événements de souris fabriqués
    if (e.cancelable) e.preventDefault();
  };

  private readonly onResize = (): void => {
    this.metricsDirty = true;
  };

  private release(f: Finger): void {
    const kind = f.kind;
    f.kind = K_FREE;
    f.id = -1;
    const el = f.el;
    f.el = null;
    if (kind === K_BUTTON) {
      if (el) el.classList.remove('is-down');
      const bi = this.controlButton[f.ref]!;
      if (bi >= 0 && !f.toggle) {
        if (this.holds[bi]! > 0) this.holds[bi]!--;
        this.applyButton(bi);
      }
    } else if (kind === K_PEDAL) {
      if (el) el.classList.remove('is-down');
      if (CONTROLS[f.ref]!.pedal === 'throttle') this.throttle = 0;
      else this.brake = 0;
      this.pedalDirty = true;
    } else if (kind === K_ITEM) {
      if (el) el.classList.remove('is-down');
    } else if (kind === K_STICK) {
      this.stickFinger = -1;
      resetVirtualStick(this.stick);
      this.stickCx = this.homeCx;
      this.stickCy = this.homeCy;
      this.stickDirty = true;
    }
  }

  /** Relâche tous les doigts et toutes les bascules (changement de disposition, masquage). */
  cancelAll(): void {
    for (let i = 0; i < this.fingers.length; i++) {
      if (this.fingers[i]!.kind !== K_FREE) this.release(this.fingers[i]!);
    }
    for (let i = 0; i < BUTTON_COUNT; i++) {
      if (this.toggled[i] === 1) {
        this.toggled[i] = 0;
        this.refreshToggleClass(i);
      }
    }
    this.holds.fill(0);
    this.host.core.latch.releaseSource(SRC_TOUCH);
    this.throttle = 0;
    this.brake = 0;
    this.lookPxX = 0;
    this.lookPxY = 0;
    this.pedalDirty = true;
    this.stickDirty = true;
  }

  // ───────────────────────────── boutons, joystick, pédales ─────────────────────────────

  private applyButton(index: number): void {
    this.host.core.latch.set(SRC_TOUCH, index, this.holds[index]! > 0 || this.toggled[index] === 1);
  }

  private refreshToggleClass(index: number): void {
    const on = this.toggled[index] === 1;
    for (let i = 0; i < CONTROLS.length; i++) {
      if (this.controlButton[i] === index) this.controlEls[i]!.classList.toggle('is-on', on);
    }
  }

  private startButton(f: Finger, ref: number): void {
    f.kind = K_BUTTON;
    f.ref = ref;
    const bi = this.controlButton[ref]!;
    if (f.el) f.el.classList.add('is-down');
    if (bi < 0) return;
    if (this.host.isToggle(bi)) {
      f.toggle = true;
      this.toggled[bi] = this.toggled[bi] === 1 ? 0 : 1;
      this.refreshToggleClass(bi);
    } else {
      this.holds[bi]!++;
    }
    this.applyButton(bi);
    this.host.haptic(8);
  }

  private startStick(f: Finger): void {
    const spec = this.stickSpec!;
    f.kind = K_STICK;
    this.stickFinger = f.id;
    // Socle flottant : il se centre sous le doigt, sans sortir de l'écran.
    const r = spec.radius * this.scale;
    const margin = 6 * this.scale;
    let cx = f.x;
    let cy = f.y;
    if (cx < r + margin) cx = r + margin;
    if (cy > this.height - r - margin) cy = this.height - r - margin;
    if (spec.horizontal) cy = this.homeCy;
    this.stickCx = cx;
    this.stickCy = cy;
    this.updateStick(f.x, f.y);
  }

  private updateStick(x: number, y: number): void {
    const spec = this.stickSpec;
    if (!spec) return;
    const dx = x - this.stickCx;
    const dy = spec.horizontal ? 0 : y - this.stickCy;
    shapeVirtualStick(dx, dy, this.tuning, this.stick);
    this.stickDirty = true;
  }

  private updatePedal(f: Finger): void {
    const el = f.el;
    if (!el) return;
    const top = el.offsetTop;
    const h = el.offsetHeight;
    const t = h > 0 ? (top + h - f.y) / h : 1;
    const v = shapePedal(t);
    if (CONTROLS[f.ref]!.pedal === 'throttle') this.throttle = v;
    else this.brake = v;
    this.pedalDirty = true;
  }

  // ───────────────────────────── pour les tests et le banc d'essai ─────────────────────────────

  /** Rectangle écran d'une commande de la disposition courante (null si absente ou masquée). */
  rectOf(key: string): { x: number; y: number; w: number; h: number } | null {
    for (let i = 0; i < CONTROLS.length; i++) {
      const c = CONTROLS[i]!;
      if (c.key !== key || c.layout !== (this.layout as GameLayout)) continue;
      const r = this.controlEls[i]!.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return null;
  }

  /** Centre du socle du joystick au repos et rayon de course (pixels écran). */
  stickHome(): { x: number; y: number; radius: number } {
    if (this.metricsDirty) this.measure();
    return { x: this.originX + this.homeCx, y: this.originY + this.homeCy, radius: this.tuning.radius };
  }
}

export type { ControlSpec };
