/* =====================================================================================
 * Reconnaissance des gestes de carte (logique pure, sans DOM) : toucher, double toucher, appui
 * long, glisser (déplacement de la carte ou geste capturé par l'outil courant), pincement à deux
 * doigts, molette. Les mêmes règles servent à la souris, au doigt et au curseur de la manette.
 * ===================================================================================== */

export type PointerKind = 'mouse' | 'touch' | 'pen' | 'pad';

export interface PointerInfo {
  /** 0 = principal, 1 = milieu, 2 = secondaire (clic droit). */
  button: number;
  shift: boolean;
  ctrl: boolean;
  kind: PointerKind;
}

export interface GestureHandlers {
  /** Début d'un glissement : 'pan' = déplacer la carte ; 'capture' = le geste appartient à l'outil courant. */
  onDragStart(x: number, y: number, info: PointerInfo): 'pan' | 'capture';
  onDragMove(x: number, y: number, info: PointerInfo): void;
  onDragEnd(x: number, y: number, info: PointerInfo, cancelled: boolean): void;
  onTap(x: number, y: number, info: PointerInfo): void;
  onDoubleTap(x: number, y: number, info: PointerInfo): void;
  onLongPress(x: number, y: number, info: PointerInfo): void;
  onPan(dx: number, dy: number): void;
  /** Zoom d'un facteur (> 1 = on se rapproche) autour du point (x, y). */
  onZoom(x: number, y: number, factor: number): void;
}

interface Tracked { x: number; y: number; startX: number; startY: number; t0: number; info: PointerInfo }

const LONG_PRESS = 0.55;
const DOUBLE_TAP = 0.32;

export class PointerGestures {
  /** 'idle' | 'press' (appui sans mouvement) | 'pan' | 'capture' | 'pinch' */
  mode: 'idle' | 'press' | 'pan' | 'capture' | 'pinch' = 'idle';
  private readonly pointers = new Map<number, Tracked>();
  private primary = 0;
  private longFired = false;
  private pinchDist = 0;
  private pinchX = 0;
  private pinchY = 0;
  private lastTapT = -1;
  private lastTapX = 0;
  private lastTapY = 0;

  constructor(private readonly h: GestureHandlers) {}

  get active(): boolean {
    return this.mode !== 'idle';
  }

  /** Seuil de mouvement (px) avant qu'un appui devienne un glissement. */
  private slop(kind: PointerKind): number {
    return kind === 'mouse' ? 5 : 10;
  }

  down(id: number, x: number, y: number, t: number, info: PointerInfo): void {
    if (this.pointers.has(id)) this.cancel(id);
    this.pointers.set(id, { x, y, startX: x, startY: y, t0: t, info });
    if (this.pointers.size === 1) {
      this.mode = 'press';
      this.primary = id;
      this.longFired = false;
    } else if (this.pointers.size === 2) {
      if (this.mode === 'capture') {
        const p = this.pointers.get(this.primary);
        if (p) this.h.onDragEnd(p.x, p.y, p.info, true);
      }
      this.mode = 'pinch';
      this.resetPinch();
    }
  }

  move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    if (this.mode === 'press' && id === this.primary) {
      if (Math.hypot(x - p.startX, y - p.startY) < this.slop(p.info.kind)) return;
      if (this.longFired) return;
      this.mode = this.h.onDragStart(p.startX, p.startY, p.info);
      if (this.mode === 'pan') this.h.onPan(x - p.startX, y - p.startY);
      else this.h.onDragMove(x, y, p.info);
      p.x = x;
      p.y = y;
      return;
    }
    p.x = x;
    p.y = y;
    if (this.mode === 'pan' && id === this.primary) this.h.onPan(dx, dy);
    else if (this.mode === 'capture' && id === this.primary) this.h.onDragMove(x, y, p.info);
    else if (this.mode === 'pinch') this.updatePinch();
  }

  up(id: number, x: number, y: number, t: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (this.mode === 'press' && id === this.primary) {
      this.mode = 'idle';
      if (this.longFired) return;
      const double =
        this.lastTapT >= 0 && t - this.lastTapT < DOUBLE_TAP && Math.hypot(x - this.lastTapX, y - this.lastTapY) < 28 &&
        p.info.button === 0;
      if (double) {
        this.lastTapT = -1;
        this.h.onDoubleTap(x, y, p.info);
      } else {
        this.lastTapT = t;
        this.lastTapX = x;
        this.lastTapY = y;
        this.h.onTap(x, y, p.info);
      }
    } else if (this.mode === 'capture' && id === this.primary) {
      this.mode = 'idle';
      this.h.onDragEnd(x, y, p.info, false);
    } else if (this.mode === 'pan' && id === this.primary) {
      this.mode = 'idle';
    } else if (this.mode === 'pinch') {
      // il reste un doigt : il continue à déplacer la carte
      if (this.pointers.size === 1) {
        this.primary = this.pointers.keys().next().value as number;
        this.mode = 'pan';
      } else if (this.pointers.size === 0) this.mode = 'idle';
      else this.resetPinch();
    }
    if (this.pointers.size === 0) this.mode = 'idle';
  }

  cancel(id: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (this.mode === 'capture' && id === this.primary) this.h.onDragEnd(p.x, p.y, p.info, true);
    if (this.pointers.size === 0) this.mode = 'idle';
    else if (this.pointers.size === 1) {
      this.primary = this.pointers.keys().next().value as number;
      this.mode = 'pan';
    }
  }

  cancelAll(): void {
    const ids = Array.from(this.pointers.keys());
    for (let i = 0; i < ids.length; i++) this.cancel(ids[i]!);
    this.mode = 'idle';
  }

  /** Molette : deltaY > 0 = vers le bas = on s'éloigne. */
  wheel(x: number, y: number, deltaY: number): void {
    const d = Math.max(-240, Math.min(240, deltaY));
    this.h.onZoom(x, y, Math.exp(-d * 0.0022));
  }

  /** À appeler régulièrement : déclenche l'appui long. */
  tick(t: number): void {
    if (this.mode !== 'press' || this.longFired) return;
    const p = this.pointers.get(this.primary);
    if (!p || p.info.button !== 0) return;
    if (t - p.t0 >= LONG_PRESS) {
      this.longFired = true;
      this.h.onLongPress(p.x, p.y, p.info);
    }
  }

  private resetPinch(): void {
    const it = this.pointers.values();
    const a = it.next().value as Tracked;
    const b = it.next().value as Tracked;
    this.pinchDist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    this.pinchX = (a.x + b.x) * 0.5;
    this.pinchY = (a.y + b.y) * 0.5;
  }

  private updatePinch(): void {
    if (this.pointers.size < 2) return;
    const it = this.pointers.values();
    const a = it.next().value as Tracked;
    const b = it.next().value as Tracked;
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const cx = (a.x + b.x) * 0.5;
    const cy = (a.y + b.y) * 0.5;
    this.h.onPan(cx - this.pinchX, cy - this.pinchY);
    if (Math.abs(dist - this.pinchDist) > 0.5) this.h.onZoom(cx, cy, dist / this.pinchDist);
    this.pinchDist = dist;
    this.pinchX = cx;
    this.pinchY = cy;
  }
}
