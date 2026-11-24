/* =====================================================================================
 * Fond de plan de repli — textes : noms des rues (alignés sur la voie) et des lieux (places,
 * jardins, monuments, ponts, institutions), avec évitement des chevauchements.
 * ===================================================================================== */

import type { PlaceInfo, PlaceKind, WorldQuery } from '@/core/contracts';
import { pointOnPolyline } from '@/core/math';

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const HALO = '#0b1322';

/** Grille d'occupation : refuse un texte qui en recouvrirait un autre. */
export class LabelPlacer {
  private cell = 14;
  private cols = 0;
  private rows = 0;
  private grid = new Uint8Array(0);
  private readonly names = new Map<string, number[]>();

  reset(width: number, height: number, pr: number): void {
    this.cell = 14 * pr;
    this.cols = Math.ceil(width / this.cell) + 1;
    this.rows = Math.ceil(height / this.cell) + 1;
    const n = this.cols * this.rows;
    if (this.grid.length < n) this.grid = new Uint8Array(n);
    else this.grid.fill(0, 0, n);
    this.names.clear();
  }

  /** Réserve une boîte orientée (centre, taille, angle). false si la place est prise ou hors champ. */
  tryBox(cx: number, cy: number, w: number, h: number, angle: number): boolean {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const step = this.cell * 0.6;
    const nu = Math.max(1, Math.ceil(w / step));
    const nv = Math.max(1, Math.ceil(h / step));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i <= nu; i++) {
        const u = -w / 2 + (w * i) / nu;
        for (let j = 0; j <= nv; j++) {
          const v = -h / 2 + (h * j) / nv;
          const c = Math.floor((cx + u * ca - v * sa) / this.cell);
          const r = Math.floor((cy + u * sa + v * ca) / this.cell);
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
            if (pass === 0) return false;
            continue;
          }
          const k = r * this.cols + c;
          if (pass === 0) {
            if (this.grid[k] !== 0) return false;
          } else this.grid[k] = 1;
        }
      }
    }
    return true;
  }

  /** Le même nom n'est pas répété à moins de `minDist` pixels. Enregistre la position si elle est acceptée. */
  tryName(name: string, x: number, y: number, minDist: number): boolean {
    let arr = this.names.get(name);
    if (arr) {
      for (let i = 0; i < arr.length; i += 2) {
        const dx = arr[i]! - x, dy = arr[i + 1]! - y;
        if (dx * dx + dy * dy < minDist * minDist) return false;
      }
    } else {
      arr = [];
      this.names.set(name, arr);
    }
    arr.push(x, y);
    return true;
  }

  forgetLast(name: string): void {
    const arr = this.names.get(name);
    if (arr && arr.length >= 2) arr.length -= 2;
  }
}

/**
 * Largeur d'un texte par pixel de corps, mesurée une fois par (graisse, texte). La mesure se fait en corps 100 : la
 * police du contexte est rendue telle qu'elle était, sinon le texte suivant serait écrit en corps 100 (les noms de
 * lieux géants à la première ouverture de la carte, quand aucune largeur n'était encore en cache).
 */
const WIDTH_CACHE = new Map<string, number>();
function textWidth(g: CanvasRenderingContext2D, text: string, weight: number, size: number): number {
  const key = weight + '|' + text;
  let unit = WIDTH_CACHE.get(key);
  if (unit === undefined) {
    const font = g.font;
    g.font = `${weight} 100px ${FONT_STACK}`;
    unit = g.measureText(text).width / 100;
    g.font = font;
    if (WIDTH_CACHE.size > 6000) WIDTH_CACHE.clear();
    WIDTH_CACHE.set(key, unit);
  }
  return unit * size;
}

function haloText(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, pr: number): void {
  g.lineWidth = 3 * pr;
  g.strokeStyle = HALO;
  g.lineJoin = 'round';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

// ───────────────────────────── rues ─────────────────────────────

interface Candidate { id: number; len: number }
const CANDIDATES: Candidate[] = [];
const P_MID = { x: 0, z: 0 };
const P_A = { x: 0, z: 0 };
const P_B = { x: 0, z: 0 };

export function drawStreetLabels(
  g: CanvasRenderingContext2D, world: WorldQuery, placer: LabelPlacer, byRank: readonly number[][], inv: number,
  offX: number, offY: number, pr: number, mppCss: number, rotation: number,
): void {
  const minRank = mppCss > 6 ? 6 : mppCss > 3.2 ? 5 : mppCss > 1.8 ? 4 : mppCss > 1.0 ? 3 : 1;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let rank = byRank.length - 1; rank >= minRank; rank--) {
    const ids = byRank[rank]!;
    if (ids.length === 0) continue;
    const size = (rank >= 5 ? 11 : rank >= 3 ? 10 : 9.5) * pr;
    const weight = rank >= 5 ? 600 : 500;
    const color = rank >= 5 ? '#d3dcee' : '#a9b6d0';
    let n = 0;
    for (let i = 0; i < ids.length; i++) {
      const e = world.edge(ids[i]!);
      if (e.name === '' || e.length * inv < 46 * pr) continue;
      let c = CANDIDATES[n];
      if (!c) {
        c = { id: 0, len: 0 };
        CANDIDATES.push(c);
      }
      c.id = ids[i]!;
      c.len = e.length;
      n++;
    }
    if (n === 0) continue;
    const list = n === CANDIDATES.length ? CANDIDATES : CANDIDATES.slice(0, n);
    list.sort(byLength);
    const limit = Math.min(list.length, 500);
    g.font = `${weight} ${size}px ${FONT_STACK}`;
    for (let i = 0; i < limit; i++) {
      const e = world.edge(list[i]!.id);
      const w = textWidth(g, e.name, weight, size);
      const lenPx = e.length * inv;
      if (w + 10 * pr > lenPx) continue;
      const mid = e.length * 0.5;
      const heading = pointOnPolyline(e.points, mid, P_MID);
      // la voie doit être à peu près droite sur la longueur du texte
      const half = (w * 0.5) / inv;
      pointOnPolyline(e.points, mid - half, P_A);
      pointOnPolyline(e.points, mid + half, P_B);
      const chord = Math.hypot(P_B.x - P_A.x, P_B.z - P_A.z);
      if (chord < half * 2 * 0.94) continue;
      const sx = P_MID.x * inv + offX;
      const sy = P_MID.z * inv + offY;
      let angle = Math.atan2(Math.cos(heading), Math.sin(heading));
      if (Math.cos(angle + rotation) < 0) angle += Math.PI;
      if (!placer.tryName(e.name, sx, sy, 300 * pr)) continue;
      if (!placer.tryBox(sx, sy, w + 6 * pr, size + 3 * pr, angle)) {
        placer.forgetLast(e.name);
        continue;
      }
      g.save();
      g.translate(sx, sy);
      g.rotate(angle);
      g.font = `${weight} ${size}px ${FONT_STACK}`;
      haloText(g, e.name, 0, 0, color, pr);
      g.restore();
    }
  }
}

function byLength(a: Candidate, b: Candidate): number {
  return b.len - a.len;
}

// ───────────────────────────── lieux ─────────────────────────────

interface PlaceStyle { color: string; weight: number; size: number; maxMpp: number; italic?: boolean; marker?: boolean }

const PLACE_STYLES: Partial<Record<PlaceKind, PlaceStyle>> = {
  square: { color: '#f1f4fb', weight: 650, size: 11.5, maxMpp: 9 },
  monument: { color: '#e2cf96', weight: 600, size: 10.5, maxMpp: 5, marker: true },
  garden: { color: '#8ecb9c', weight: 500, size: 10.5, maxMpp: 6, italic: true },
  bridge: { color: '#a9c4ea', weight: 500, size: 10, maxMpp: 3, italic: true },
  institution: { color: '#c3b7dc', weight: 500, size: 10, maxMpp: 1.3, marker: true },
};
const PLACE_ORDER: readonly PlaceKind[] = ['square', 'monument', 'garden', 'bridge', 'institution'];

/** Rang relatif de chaque lieu dans sa catégorie (0 = le plus important), d'après l'ordre des données. */
const FRACTIONS = new WeakMap<readonly PlaceInfo[], Float32Array>();
function fractionsOf(places: readonly PlaceInfo[]): Float32Array {
  let f = FRACTIONS.get(places);
  if (f && f.length === places.length) return f;
  f = new Float32Array(places.length);
  const counts = new Map<string, number>();
  for (let i = 0; i < places.length; i++) counts.set(places[i]!.kind, (counts.get(places[i]!.kind) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (let i = 0; i < places.length; i++) {
    const k = places[i]!.kind;
    const r = seen.get(k) ?? 0;
    seen.set(k, r + 1);
    f[i] = r / Math.max(1, counts.get(k)!);
  }
  FRACTIONS.set(places, f);
  return f;
}

/** Nom court d'un lieu : on garde la première partie d'un nom double (« Place X - Esplanade Y »). */
export function shortPlaceName(name: string): string {
  const cut = name.indexOf(' - ');
  return cut > 4 ? name.slice(0, cut) : name;
}

export function drawPlaceLabels(
  g: CanvasRenderingContext2D, world: WorldQuery, placer: LabelPlacer, minX: number, minZ: number, maxX: number,
  maxZ: number, inv: number, offX: number, offY: number, pr: number, mppCss: number, rotation: number,
): void {
  const places = world.places;
  const fractions = fractionsOf(places);
  // part des lieux de chaque catégorie retenue à cette échelle (tous à 1 m/px, les plus importants de loin)
  const share = Math.min(1, Math.max(0.04, 1 / Math.pow(Math.max(0.2, mppCss), 1.5)));
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // monuments modélisés : toujours nommés (repères majeurs)
  const marks = world.landmarks;
  if (mppCss <= 7) {
    const size = 10.5 * pr;
    const font = `600 ${size}px ${FONT_STACK}`;
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i]!;
      if (m.x < minX || m.x > maxX || m.z < minZ || m.z > maxZ) continue;
      placeText(g, placer, m.name, m.x * inv + offX, m.z * inv + offY, 600, size, font, '#e8d7a0', pr, rotation, false);
    }
  }

  for (let o = 0; o < PLACE_ORDER.length; o++) {
    const kind = PLACE_ORDER[o]!;
    const style = PLACE_STYLES[kind]!;
    if (mppCss > style.maxMpp) continue;
    const size = style.size * pr;
    const font = `${style.italic ? 'italic ' : ''}${style.weight} ${size}px ${FONT_STACK}`;
    for (let i = 0; i < places.length; i++) {
      const p = places[i]!;
      if (p.kind !== kind || fractions[i]! > share) continue;
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      placeText(g, placer, shortPlaceName(p.name), p.x * inv + offX, p.z * inv + offY, style.weight, size, font, style.color, pr, rotation, style.marker === true);
    }
  }
}

/** Écrit un nom de lieu en pixels de l'écran (`size` déjà multiplié par la densité de pixels), police `font`. */
function placeText(
  g: CanvasRenderingContext2D, placer: LabelPlacer, name: string, sx: number, sy: number, weight: number, size: number,
  font: string, color: string, pr: number, rotation: number, marker: boolean,
): void {
  if (name === '') return;
  const w = textWidth(g, name, weight, size);
  if (!placer.tryName(name, sx, sy, 400 * pr)) return;
  const dy = marker ? size * 0.95 : 0;
  // le texte reste horizontal à l'écran même si le fond est tourné
  if (!placer.tryBox(sx, sy + dy, w + 8 * pr, size + 4 * pr, -rotation)) {
    placer.forgetLast(name);
    return;
  }
  g.save();
  g.translate(sx, sy);
  if (rotation !== 0) g.rotate(-rotation);
  g.font = font;
  if (marker) {
    g.fillStyle = color;
    g.beginPath();
    const r = 2.6 * pr;
    g.moveTo(0, -r);
    g.lineTo(r, 0);
    g.lineTo(0, r);
    g.lineTo(-r, 0);
    g.closePath();
    g.fill();
  }
  haloText(g, name, 0, dy, color, pr);
  g.restore();
}
