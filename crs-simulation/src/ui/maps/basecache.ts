/* =====================================================================================
 * Cache du fond de plan : le fond (coûteux) est dessiné nord en haut dans un canevas hors écran
 * plus grand que la vue, puis simplement recopié tant que la vue reste dans la marge. Pendant un
 * zoom, la copie est mise à l'échelle ; le fond n'est redessiné net qu'une fois le zoom stabilisé.
 * ===================================================================================== */

import type { Map2dService } from './api';

export interface BaseView {
  cx: number;
  cz: number;
  /** Mètres par pixel CSS. */
  mpp: number;
  /** Taille de la vue en pixels CSS. */
  width: number;
  height: number;
}

export interface BaseLayerOptions {
  /** Marge autour de la vue, en fraction de sa taille (0,3 = 30 % de chaque côté). */
  margin: number;
  labels: boolean;
  detail: 'plan' | 'mini';
  /** Délai de stabilité du zoom avant de redessiner net (s). */
  settle: number;
}

const DEFAULTS: BaseLayerOptions = { margin: 0.3, labels: true, detail: 'plan', settle: 0.16 };
/** Écart d'échelle toléré avant de redessiner sans attendre. */
const MAX_SCALE = 1.7;
/** Taille maximale du canevas hors écran (pixels par côté). */
const MAX_SIDE = 4096;

export class BaseLayer {
  /** Nombre de dessins complets du fond et durée du dernier (ms) : diagnostic, tests. */
  renders = 0;
  lastMs = 0;
  maxMs = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly opts: BaseLayerOptions;
  private valid = false;
  private cx = 0;
  private cz = 0;
  private mpp = 1;
  /** Taille couverte en pixels CSS à l'échelle du rendu. */
  private wCss = 0;
  private hCss = 0;
  private pr = 1;
  private rev = -1;
  private lastMpp = 0;
  private mppChangedAt = 0;

  constructor(private readonly source: () => Map2dService, options?: Partial<BaseLayerOptions>) {
    this.opts = { ...DEFAULTS, ...options };
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d', { alpha: false });
  }

  invalidate(): void {
    this.valid = false;
  }

  /**
   * Recopie le fond dans `g` (repère en pixels CSS, déjà mis à l'échelle de l'écran) pour la vue
   * donnée, en le redessinant si nécessaire. `time` : horloge réelle en secondes.
   * Retourne true si la copie est provisoire (zoom en cours) : l'appelant doit redemander un dessin.
   */
  draw(g: CanvasRenderingContext2D, view: BaseView, pixelRatio: number, time: number): boolean {
    const src = this.source();
    if (view.mpp !== this.lastMpp) {
      this.lastMpp = view.mpp;
      this.mppChangedAt = time;
    }
    let pending = false;
    let redraw = !this.valid || (src.revision ?? 0) !== this.rev || pixelRatio !== this.pr;
    if (!redraw) {
      const halfW = this.wCss * 0.5 * this.mpp;
      const halfH = this.hCss * 0.5 * this.mpp;
      const vw = view.width * 0.5 * view.mpp;
      const vh = view.height * 0.5 * view.mpp;
      const covered =
        view.cx - vw >= this.cx - halfW && view.cx + vw <= this.cx + halfW &&
        view.cz - vh >= this.cz - halfH && view.cz + vh <= this.cz + halfH;
      const ratio = this.mpp / view.mpp;
      if (!covered || ratio > MAX_SCALE || ratio < 1 / MAX_SCALE) redraw = true;
      else if (Math.abs(ratio - 1) > 1e-3) {
        if (time - this.mppChangedAt >= this.opts.settle) redraw = true;
        else pending = true;
      }
    }
    if (redraw) this.render(src, view, pixelRatio);
    if (!this.valid) return false;
    const scale = this.mpp / view.mpp;
    const dw = this.wCss * scale;
    const dh = this.hCss * scale;
    const sx = view.width * 0.5 + (this.cx - view.cx) / view.mpp;
    const sy = view.height * 0.5 + (this.cz - view.cz) / view.mpp;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.canvas, sx - dw * 0.5, sy - dh * 0.5, dw, dh);
    return pending;
  }

  private render(src: Map2dService, view: BaseView, pixelRatio: number): void {
    const g = this.g;
    if (!g) return;
    const m = 1 + this.opts.margin * 2;
    let wCss = view.width * m;
    let hCss = view.height * m;
    let w = Math.ceil(wCss * pixelRatio);
    let h = Math.ceil(hCss * pixelRatio);
    if (w > MAX_SIDE || h > MAX_SIDE) {
      const k = Math.min(MAX_SIDE / w, MAX_SIDE / h);
      w = Math.floor(w * k);
      h = Math.floor(h * k);
      wCss = w / pixelRatio;
      hCss = h / pixelRatio;
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const t0 = performance.now();
    try {
      src.draw(g, view.cx, view.cz, view.mpp / pixelRatio, 0, {
        width: w, height: h, pixelRatio, labels: this.opts.labels, detail: this.opts.detail,
      });
    } catch (err) {
      console.error('[cartes] échec du dessin du fond de plan', err);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#0f1829';
      g.fillRect(0, 0, w, h);
    }
    this.cx = view.cx;
    this.cz = view.cz;
    this.mpp = view.mpp;
    this.wCss = wCss;
    this.hCss = hCss;
    this.pr = pixelRatio;
    this.rev = src.revision ?? 0;
    this.valid = true;
    this.renders++;
    this.lastMs = performance.now() - t0;
    if (this.lastMs > this.maxMs) this.maxMs = this.lastMs;
  }
}
