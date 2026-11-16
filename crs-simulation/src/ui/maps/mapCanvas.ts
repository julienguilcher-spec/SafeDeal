/* =====================================================================================
 * Carte interactive plein cadre (plan de Paris, carte tactique) : un canevas, le fond en cache,
 * les couches par-dessus, et les trois façons de la manier — souris (glisser, molette), doigt
 * (glisser, pincer) et manette (curseur au stick gauche, vue au stick droit, gâchettes pour le zoom).
 * Le canevas n'est redessiné que s'il le faut : vue modifiée, interaction, ou échéance périodique.
 * ===================================================================================== */

import type { InputState, Vec2 } from '@/core/contracts';
import { BaseLayer } from './basecache';
import type { BaseLayerOptions } from './basecache';
import { PointerGestures } from './gestures';
import type { GestureHandlers, PointerInfo, PointerKind } from './gestures';
import { ALL_LAYERS, drawOverlay } from './overlay';
import type { OverlayOptions } from './overlay';
import { cursorAxes, cursorWakes, stepCursor } from './cursor';
import type { CursorAxes, CursorStep } from './cursor';
import type { MapsRuntime } from './runtime';
import { MapTransform, NORTH_UP } from './transform';

export interface MapCanvasHandlers {
  /** Début d'un glissement : 'capture' pour que l'outil courant le reçoive (sinon la carte se déplace). */
  onDragStart?(x: number, y: number, info: PointerInfo): 'pan' | 'capture';
  onDragMove?(x: number, y: number, info: PointerInfo): void;
  onDragEnd?(x: number, y: number, info: PointerInfo, cancelled: boolean): void;
  onTap?(x: number, y: number, info: PointerInfo): void;
  /** Retourner true si le double toucher a été traité (sinon : zoom avant). */
  onDoubleTap?(x: number, y: number, info: PointerInfo): boolean;
  onLongPress?(x: number, y: number, info: PointerInfo): void;
  /** Survol (souris sans bouton, ou curseur de la manette). */
  onHover?(x: number, y: number): void;
  /** Dessins de l'outil courant, par-dessus les couches (aperçus de tracé, cadre de sélection). */
  drawExtras?(g: CanvasRenderingContext2D, view: MapTransform): void;
  onViewChange?(): void;
}

export interface MapCanvasOptions {
  base?: Partial<BaseLayerOptions>;
  /** Intervalle maximal entre deux dessins quand rien ne bouge (s). */
  interval?: number;
}

const PAD_ID = -77;
/** Vitesse du curseur de la manette (px/s) et du déplacement de vue au stick droit (px par radian de regard). */
const CURSOR_SPEED = 560;
const LOOK_PAN = 260;
const NO_AXES: Readonly<CursorAxes> = Object.freeze({ x: 0, y: 0, speed: 0 });

export class MapCanvas {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly view = new MapTransform();
  readonly gestures: PointerGestures;
  readonly base: BaseLayer;
  handlers: MapCanvasHandlers = {};
  /** Options des couches : l'écran qui possède la carte les modifie puis appelle invalidate(). */
  readonly overlay: OverlayOptions;
  /** Curseur de la manette (pixels de la carte). */
  cursorX = 0;
  cursorY = 0;
  cursorOn = false;
  /** Nombre de dessins effectués (diagnostic, tests). */
  draws = 0;

  private readonly g: CanvasRenderingContext2D | null;
  private readonly cursorEl: HTMLDivElement;
  private readonly observer: ResizeObserver | null;
  private dpr = 1;
  private dirty = true;
  private needResize = true;
  private lastDraw = -1;
  private readonly interval: number;
  private rectLeft = 0;
  private rectTop = 0;
  private padDown = false;
  private fly: { fromX: number; fromZ: number; fromMpp: number; toX: number; toZ: number; toMpp: number; t: number; d: number } | null = null;
  private cursorTransform = '';
  private disposed = false;
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly axes: CursorAxes = { x: 0, y: 0, speed: 0 };
  private readonly stepOut: CursorStep = { x: 0, y: 0, panX: 0, panY: 0 };

  constructor(private readonly runtime: MapsRuntime, host: HTMLElement, options: MapCanvasOptions = {}) {
    this.interval = options.interval ?? 0.1;
    this.el = document.createElement('div');
    this.el.className = 'cm-map';
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = -1;
    this.g = this.canvas.getContext('2d', { alpha: false });
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'cm-cursor';
    this.el.append(this.canvas, this.cursorEl);
    host.appendChild(this.el);
    this.view.up = NORTH_UP;
    this.view.bounds = runtime.ctx.world.bounds;
    this.base = new BaseLayer(runtime.basemap, options.base);
    this.overlay = {
      layers: { ...ALL_LAYERS }, compact: false, selection: null, hoverKey: 0, commandable: null, size: 15,
      time: 0, gpsRoute: runtime.gps.route, gpsTarget: null, focusIncident: 0, focusStation: 0, focusClosure: 0,
      edge: (id) => runtime.ctx.world.edge(id),
    };

    const self = this;
    const gh: GestureHandlers = {
      onDragStart: (x, y, info) => self.handlers.onDragStart?.(x, y, info) ?? 'pan',
      onDragMove: (x, y, info) => { self.handlers.onDragMove?.(x, y, info); self.dirty = true; },
      onDragEnd: (x, y, info, cancelled) => { self.handlers.onDragEnd?.(x, y, info, cancelled); self.dirty = true; },
      onTap: (x, y, info) => { self.handlers.onTap?.(x, y, info); self.dirty = true; },
      onDoubleTap: (x, y, info) => {
        if (!self.handlers.onDoubleTap?.(x, y, info)) self.zoomAt(x, y, 1.8);
        self.dirty = true;
      },
      onLongPress: (x, y, info) => { self.handlers.onLongPress?.(x, y, info); self.dirty = true; },
      onPan: (dx, dy) => {
        self.fly = null;
        self.view.panByPixels(dx, dy);
        self.viewChanged();
      },
      onZoom: (x, y, f) => self.zoomAt(x, y, f),
    };
    this.gestures = new PointerGestures(gh);
    this.bind();
    this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this.needResize = true; }) : null;
    this.observer?.observe(this.el);
  }

  // ───────────────────────────── vue ─────────────────────────────

  invalidate(): void {
    this.dirty = true;
  }

  zoomAt(x: number, y: number, factor: number): void {
    this.fly = null;
    this.view.zoomAt(x, y, factor);
    this.viewChanged();
  }

  /** Zoom autour du centre de la carte (boutons + et −). */
  zoomBy(factor: number): void {
    this.zoomAt(this.view.width * 0.5, this.view.height * 0.5, factor);
  }

  /** Va en douceur vers un point (et une échelle). */
  flyTo(x: number, z: number, mpp?: number, seconds = 0.3): void {
    const v = this.view;
    this.fly = { fromX: v.cx, fromZ: v.cz, fromMpp: v.mpp, toX: x, toZ: z, toMpp: mpp ?? v.mpp, t: 0, d: Math.max(0.01, seconds) };
    this.dirty = true;
  }

  /** Place la vue immédiatement. */
  jumpTo(x: number, z: number, mpp?: number): void {
    this.fly = null;
    if (mpp !== undefined) this.view.setMpp(mpp);
    this.view.setCenter(x, z);
    this.viewChanged();
  }

  /** Point du monde sous un pixel de la carte. */
  worldAt(x: number, y: number, out: Vec2): Vec2 {
    return this.view.screenToWorld(x, y, out);
  }

  private viewChanged(): void {
    this.dirty = true;
    this.handlers.onViewChange?.();
  }

  // ───────────────────────────── entrées ─────────────────────────────

  private bind(): void {
    const c = this.canvas;
    const kindOf = (e: PointerEvent): PointerKind => (e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse');
    const t = (): number => this.runtime.time;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button > 2) return;
      const r = c.getBoundingClientRect();
      this.rectLeft = r.left;
      this.rectTop = r.top;
      try { c.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      this.hideCursor();
      this.gestures.down(e.pointerId, e.clientX - r.left, e.clientY - r.top, t(), {
        button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, kind: kindOf(e),
      });
      this.dirty = true;
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      const x = e.clientX - this.rectLeft;
      const y = e.clientY - this.rectTop;
      if (this.gestures.active) {
        this.gestures.move(e.pointerId, x, y);
      } else if (e.pointerType === 'mouse') {
        this.hideCursor();
        this.handlers.onHover?.(x, y);
      }
    });
    c.addEventListener('pointerenter', () => {
      const r = c.getBoundingClientRect();
      this.rectLeft = r.left;
      this.rectTop = r.top;
    });
    const up = (e: PointerEvent): void => {
      this.gestures.up(e.pointerId, e.clientX - this.rectLeft, e.clientY - this.rectTop, t());
      this.dirty = true;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => {
      this.gestures.cancel(e.pointerId);
      this.dirty = true;
    });
    c.addEventListener('wheel', (e) => {
      const r = c.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      this.gestures.wheel(e.clientX - r.left, e.clientY - r.top, dy);
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private hideCursor(): void {
    if (!this.cursorOn) return;
    this.cursorOn = false;
    this.cursorEl.classList.remove('is-on');
  }

  /**
   * Manette : stick gauche = curseur (la vue suit quand il touche un bord), stick droit = vue,
   * gâchettes et touches de zoom = zoom, « Valider » = bouton du curseur (toucher, glisser, appui long).
   * Clavier seul (Mac portable sans souris), carte focalisée : flèches = curseur (Maj : plus vite),
   * Entrée = bouton du curseur, + / − = zoom (cursor.ts).
   */
  updatePad(dt: number, input: InputState): void {
    const v = this.view;
    const pad = input.device === 'gamepad';
    // au clavier, les flèches ne pilotent le curseur que si la carte a le focus (sinon elles naviguent entre les boutons)
    const keys = input.device === 'kbm' && typeof document !== 'undefined' && document.activeElement === this.canvas;
    const axes = pad || keys ? cursorAxes(input, CURSOR_SPEED, this.axes) : NO_AXES;
    const mx = axes.x;
    const my = axes.y;
    if ((pad || keys) && !this.cursorOn && cursorWakes(input, axes)) {
      this.cursorOn = true;
      this.cursorEl.classList.add('is-on');
      if (this.cursorX <= 0 || this.cursorY <= 0 || this.cursorX > v.width || this.cursorY > v.height) {
        this.cursorX = v.width * 0.5;
        this.cursorY = v.height * 0.5;
      }
    }
    if (this.cursorOn && (mx !== 0 || my !== 0)) {
      const st = stepCursor(this.cursorX, this.cursorY, axes, dt, v.width, v.height, this.stepOut);
      const x = st.x;
      const y = st.y;
      if (st.panX !== 0 || st.panY !== 0) {
        v.panByPixels(st.panX, st.panY);
        this.viewChanged();
      }
      this.cursorX = x;
      this.cursorY = y;
      if (this.padDown) this.gestures.move(PAD_ID, x, y);
      else this.handlers.onHover?.(x, y);
      this.dirty = true;
    }
    if (pad && (input.lookX !== 0 || input.lookY !== 0)) {
      v.panByPixels(-input.lookX * LOOK_PAN, input.lookY * LOOK_PAN);
      this.viewChanged();
      if (this.cursorOn && !this.padDown) this.handlers.onHover?.(this.cursorX, this.cursorY);
    }
    let zoom = 0;
    if (pad) zoom += input.throttle - input.brake;
    if (input.down('zoom_in')) zoom += 1;
    if (input.down('zoom_out')) zoom -= 1;
    if (zoom !== 0) {
      const ax = this.cursorOn ? this.cursorX : v.width * 0.5;
      const ay = this.cursorOn ? this.cursorY : v.height * 0.5;
      this.zoomAt(ax, ay, Math.exp(zoom * 1.7 * dt));
    }
    // clavier : Entrée n'agit sur le curseur que carte focalisée (sinon elle valide le bouton focalisé)
    if (this.cursorOn && (pad || keys || this.padDown)) {
      if (input.pressed('ui_accept') && !this.padDown) {
        this.padDown = true;
        this.gestures.down(PAD_ID, this.cursorX, this.cursorY, this.runtime.time, { button: 0, shift: false, ctrl: false, kind: 'pad' });
        this.dirty = true;
      } else if (this.padDown && !input.down('ui_accept')) {
        this.padDown = false;
        this.gestures.up(PAD_ID, this.cursorX, this.cursorY, this.runtime.time);
        this.dirty = true;
      }
      const tr = `translate3d(${this.cursorX.toFixed(1)}px,${this.cursorY.toFixed(1)}px,0)`;
      if (tr !== this.cursorTransform) {
        this.cursorTransform = tr;
        this.cursorEl.style.transform = tr;
      }
    }
  }

  // ───────────────────────────── dessin ─────────────────────────────

  private resize(): void {
    this.needResize = false;
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.dpr = dpr;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.view.setSize(w, h);
    const r = this.canvas.getBoundingClientRect();
    this.rectLeft = r.left;
    this.rectTop = r.top;
    this.dirty = true;
  }

  /** À appeler à chaque image tant que la carte est affichée. */
  frame(dt: number): void {
    if (this.disposed) return;
    if (this.needResize) this.resize();
    const time = this.runtime.time;
    this.gestures.tick(time);
    const fly = this.fly;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.d);
      const k = fly.t * fly.t * (3 - 2 * fly.t);
      this.view.setMpp(fly.fromMpp * Math.pow(fly.toMpp / fly.fromMpp, k));
      this.view.setCenter(fly.fromX + (fly.toX - fly.fromX) * k, fly.fromZ + (fly.toZ - fly.fromZ) * k);
      if (fly.t >= 1) this.fly = null;
      this.viewChanged();
    }
    if (!this.dirty && time - this.lastDraw < this.interval) return;
    this.draw(time);
  }

  private draw(time: number): void {
    const g = this.g;
    if (!g || this.view.width <= 1) return;
    this.lastDraw = time;
    this.dirty = false;
    this.draws++;
    this.runtime.use();
    const v = this.view;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const pending = this.base.draw(g, v, this.dpr, time);
    const o = this.overlay;
    o.time = time;
    o.gpsRoute = this.runtime.gps.route;
    o.gpsTarget = this.runtime.gps.target;
    try {
      drawOverlay(g, v, this.runtime.scene, o);
      this.handlers.drawExtras?.(g, v);
    } catch (err) {
      console.error('[cartes] erreur de dessin des couches', err);
    }
    if (pending) this.dirty = true;
  }

  dispose(): void {
    this.disposed = true;
    this.gestures.cancelAll();
    this.observer?.disconnect();
    this.el.remove();
  }

  /** Sert aux tests : position écran d'un point du monde (pixels de la carte). */
  screenOf(x: number, z: number): { x: number; y: number } {
    const p = { x: 0, y: 0 };
    this.view.worldToScreen(x, z, p);
    return p;
  }

  get tmpVec(): Vec2 {
    return this.tmp;
  }
}
