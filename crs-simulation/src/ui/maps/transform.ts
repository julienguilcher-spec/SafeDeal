/* =====================================================================================
 * Conversion écran ↔ monde d'une vue de carte (logique pure, sans DOM).
 *
 * Repère du monde : x = est, z = sud. Cap h : avant = (sin h, cos h) ; droite = (−cos h, sin h).
 * `up` est le cap affiché vers le HAUT de l'écran : π = nord en haut (plan, carte tactique) ;
 * la mini-carte y met le cap du regard. Écran : sx vers la droite, sy vers le bas, en pixels CSS.
 * ===================================================================================== */

import type { Vec2, WorldBounds } from '@/core/contracts';

/** Cap « nord en haut ». */
export const NORTH_UP = Math.PI;

export interface ScreenPoint { x: number; y: number }

export class MapTransform {
  /** Centre de la vue (monde). */
  cx = 0;
  cz = 0;
  /** Mètres par pixel. */
  mpp = 1;
  /** Taille de la vue (pixels). */
  width = 1;
  height = 1;
  minMpp = 0.08;
  maxMpp = 12;
  /** Emprise autorisée pour le centre (null = libre). */
  bounds: WorldBounds | null = null;

  private up_ = NORTH_UP;
  private fx = 0;
  private fz = -1;
  private rx = 1;
  private rz = 0;

  get up(): number {
    return this.up_;
  }

  set up(h: number) {
    this.up_ = h;
    this.fx = Math.sin(h);
    this.fz = Math.cos(h);
    this.rx = -this.fz;
    this.rz = this.fx;
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  setCenter(x: number, z: number): void {
    this.cx = x;
    this.cz = z;
    this.clampCenter();
  }

  setMpp(mpp: number): void {
    this.mpp = mpp < this.minMpp ? this.minMpp : mpp > this.maxMpp ? this.maxMpp : mpp;
  }

  worldToScreen(x: number, z: number, out: ScreenPoint): ScreenPoint {
    const dx = x - this.cx;
    const dz = z - this.cz;
    out.x = this.width * 0.5 + (dx * this.rx + dz * this.rz) / this.mpp;
    out.y = this.height * 0.5 - (dx * this.fx + dz * this.fz) / this.mpp;
    return out;
  }

  screenToWorld(sx: number, sy: number, out: Vec2): Vec2 {
    const u = (sx - this.width * 0.5) * this.mpp;
    const v = -(sy - this.height * 0.5) * this.mpp;
    out.x = this.cx + u * this.rx + v * this.fx;
    out.z = this.cz + u * this.rz + v * this.fz;
    return out;
  }

  /** Angle écran (rad, sens horaire, 0 = vers le haut) d'un cap du monde. */
  headingToScreenAngle(heading: number): number {
    return this.up_ - heading;
  }

  /** Déplace la vue pour que le contenu suive un glissement de (dxPx, dyPx) pixels. */
  panByPixels(dxPx: number, dyPx: number): void {
    const u = -dxPx * this.mpp;
    const v = dyPx * this.mpp;
    this.cx += u * this.rx + v * this.fx;
    this.cz += u * this.rz + v * this.fz;
    this.clampCenter();
  }

  /** Zoom d'un facteur (> 1 = on se rapproche) en gardant fixe le point du monde sous (sx, sy). */
  zoomAt(sx: number, sy: number, factor: number): void {
    if (!(factor > 0)) return;
    const before = this.screenToWorld(sx, sy, TMP_A);
    const bx = before.x;
    const bz = before.z;
    this.setMpp(this.mpp / factor);
    const after = this.screenToWorld(sx, sy, TMP_A);
    this.cx += bx - after.x;
    this.cz += bz - after.z;
    this.clampCenter();
  }

  /** Cadre la vue sur un rectangle du monde, avec une marge en pixels. */
  fitBounds(minX: number, minZ: number, maxX: number, maxZ: number, paddingPx = 24): void {
    const w = Math.max(1, this.width - paddingPx * 2);
    const h = Math.max(1, this.height - paddingPx * 2);
    // en vue tournée, on prend le cercle englobant
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const north = Math.abs(Math.abs(this.fz) - 1) < 1e-6;
    const mpp = north ? Math.max(spanX / w, spanZ / h) : Math.hypot(spanX, spanZ) / Math.min(w, h);
    this.setMpp(mpp);
    this.setCenter((minX + maxX) * 0.5, (minZ + maxZ) * 0.5);
  }

  /** Rectangle du monde englobant la vue (aligné sur les axes), agrandi de `marginPx`. */
  visibleBounds(out: WorldBounds, marginPx = 0): WorldBounds {
    const hw = (this.width * 0.5 + marginPx) * this.mpp;
    const hh = (this.height * 0.5 + marginPx) * this.mpp;
    const ex = Math.abs(this.rx) * hw + Math.abs(this.fx) * hh;
    const ez = Math.abs(this.rz) * hw + Math.abs(this.fz) * hh;
    out.minX = this.cx - ex;
    out.maxX = this.cx + ex;
    out.minZ = this.cz - ez;
    out.maxZ = this.cz + ez;
    return out;
  }

  /** Le point du monde est-il dans la vue (avec marge en pixels) ? */
  contains(x: number, z: number, marginPx = 0): boolean {
    const p = this.worldToScreen(x, z, TMP_S);
    return p.x >= -marginPx && p.y >= -marginPx && p.x <= this.width + marginPx && p.y <= this.height + marginPx;
  }

  copyFrom(o: MapTransform): void {
    this.cx = o.cx;
    this.cz = o.cz;
    this.mpp = o.mpp;
    this.width = o.width;
    this.height = o.height;
    this.minMpp = o.minMpp;
    this.maxMpp = o.maxMpp;
    this.bounds = o.bounds;
    this.up = o.up;
  }

  private clampCenter(): void {
    const b = this.bounds;
    if (!b) return;
    if (this.cx < b.minX) this.cx = b.minX; else if (this.cx > b.maxX) this.cx = b.maxX;
    if (this.cz < b.minZ) this.cz = b.minZ; else if (this.cz > b.maxZ) this.cz = b.maxZ;
  }
}

const TMP_A: Vec2 = { x: 0, z: 0 };
const TMP_S: ScreenPoint = { x: 0, y: 0 };

/** Longueur « ronde » (1, 2, 5 × 10ⁿ mètres) la plus proche de `targetPx` pixels, pour l'échelle graphique. */
export function niceScale(mpp: number, targetPx: number): { meters: number; px: number } {
  const raw = Math.max(1e-6, mpp * targetPx);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  const meters = step * pow;
  return { meters, px: meters / mpp };
}

/** Distance lisible : « 85 m », « 1,2 km ». Espace insécable avant l'unité. */
export function formatDistance(m: number): string {
  if (!(m >= 0)) return '—';
  if (m < 1000) return `${Math.round(m < 100 ? m : m / 5) * (m < 100 ? 1 : 5)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}
