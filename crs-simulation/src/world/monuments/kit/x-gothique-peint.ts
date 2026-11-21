/* Kit monuments — GOTHIQUE PEINT (lot « édifices ») : atlas de travées gothiques dessinées sur canvas.
 * Un atlas regroupe plusieurs RANGÉES (baies à lancettes et oculus, galerie de statues, fond de portail, mur nu),
 * chacune répétable horizontalement : un seul matériau — donc un seul appel de dessin — pour tous les murs d'une
 * église. Les vitraux s'éclairent la nuit. S'y ajoutent la claire-voie à découpe alpha (galerie de colonnettes,
 * balustrade à quadrilobes) et la grande rose.
 * Les UV d'une rangée : u = nombre de travées (1 = une travée), v de row.v0 à row.v1. */
import * as THREE from 'three';
import { Geo } from './geo';
import { canvas2d, css, mixHex, rngOf, texFrom, type Canvas2D } from './canvas';
import { defineMaterial, litMaterial, mat } from './materials';
import { paintAshlar } from './x-edifices';

export type GothicGlass = 'vitrail' | 'clair' | 'abat_son';

export interface GothicWindow {
  /** Largeur, hauteur totale (du seuil au sommet de l'arc) et altitude du seuil dans la rangée (m). */
  w: number; h: number; sill: number;
  /** Nombre de lancettes (1 à 4) ; oculus polylobé au tympan ; gâble à crochets au-dessus ; plein cintre au lieu d'arc brisé. */
  lancets?: number; rose?: boolean; gable?: boolean; round?: boolean;
  glass?: GothicGlass;
  /** Nombre de baies identiques côte à côte dans la travée (1 par défaut). */
  count?: number;
}

export interface GothicRow {
  id: string;
  /** 'baie' : mur percé de `win` ; 'mur' : pierre nue (arcature aveugle si `count`) ; 'rois' : `count` niches à statue ;
   *  'portail' : fond de portail (vantaux, trumeau, linteau, tympan sculpté). */
  kind: 'baie' | 'mur' | 'rois' | 'portail';
  /** Largeur d'une travée et hauteur de la rangée (m). */
  w: number; h: number;
  win?: GothicWindow;
  count?: number;
  /** Bandeau clair peint en haut (et en bas) de la rangée. */
  cornice?: boolean; base?: boolean;
  /** Contrefort plat peint à cheval sur les bords de la travée (largeur en m). */
  pier?: number;
}

export interface GothicRowUv { v0: number; v1: number; w: number; h: number }
export interface GothicAtlas { key: string; rows: Record<string, GothicRowUv> }

const GLASS_DAY = [0x24407c, 0x6c1f28, 0x1e5a44, 0x8a6a22, 0x4a2a66, 0x2c5590, 0x1a2c58];
const GLASS_NIGHT = [0x4a8cff, 0xff4a52, 0x46d08a, 0xffd060, 0xb46cff, 0x6ab4ff, 0xffe9b0];

type Mode = 'day' | 'night' | 'bump';

/** Chemin d'une baie (repère métrique, y vers le haut). Retourne la naissance et la flèche de l'arc. */
function archPath(ctx: CanvasRenderingContext2D, cx: number, sill: number, w: number, h: number, round = false): { ys: number; rise: number } {
  const hw = w / 2;
  ctx.beginPath();
  if (round) {
    const ys = Math.max(sill, sill + h - hw);
    ctx.moveTo(cx - hw, sill); ctx.lineTo(cx - hw, ys); ctx.arc(cx, ys, hw, Math.PI, 0, true); ctx.lineTo(cx + hw, sill); ctx.closePath();
    return { ys, rise: hw };
  }
  const rise = Math.min(h * 0.95, Math.max(hw * 1.08, Math.min(w * 0.92, h * 0.6))), ys = sill + h - rise;
  const c = (rise * rise - hw * hw) / w, R = c + hw, phi = Math.atan2(rise, c);
  ctx.moveTo(cx - hw, sill); ctx.lineTo(cx - hw, ys);
  ctx.arc(cx + c, ys, R, Math.PI, Math.PI - phi, true);
  ctx.arc(cx - c, ys, R, phi, 0, true);
  ctx.lineTo(cx + hw, sill); ctx.closePath();
  return { ys, rise };
}

/** Remplit le chemin courant d'un vitrage (mosaïque colorée, verre clair ou abat-son). Repère métrique. */
function fillGlass(ctx: CanvasRenderingContext2D, mode: Mode, kind: GothicGlass, x0: number, y0: number, w: number, h: number, rnd: () => number): void {
  ctx.save();
  ctx.clip();
  if (mode === 'bump') { ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x0, y0, w, h); ctx.restore(); return; }
  if (kind === 'abat_son') {
    ctx.fillStyle = mode === 'day' ? '#15161a' : '#050506'; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = mode === 'day' ? 'rgba(150,150,140,0.55)' : 'rgba(40,36,30,0.9)';
    const n = Math.max(4, Math.round(h / 0.7));
    for (let i = 0; i < n; i++) ctx.fillRect(x0, y0 + ((i + 0.3) / n) * h, w, (h / n) * 0.32);
    ctx.restore(); return;
  }
  if (kind === 'clair') {
    const gr = ctx.createLinearGradient(0, y0 + h, 0, y0);
    if (mode === 'day') { gr.addColorStop(0, '#1b2129'); gr.addColorStop(0.6, '#262f3a'); gr.addColorStop(1, '#3d4c5a'); }
    else { gr.addColorStop(0, '#ffd890'); gr.addColorStop(1, '#ffb868'); }
    ctx.fillStyle = gr; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = mode === 'day' ? 'rgba(200,205,200,0.35)' : 'rgba(70,50,30,0.6)';
    const nx = Math.max(2, Math.round(w / 0.45)), ny = Math.max(2, Math.round(h / 0.6));
    for (let i = 1; i < nx; i++) ctx.fillRect(x0 + (i / nx) * w - 0.02, y0, 0.04, h);
    for (let j = 1; j < ny; j++) ctx.fillRect(x0, y0 + (j / ny) * h - 0.02, w, 0.04);
    ctx.restore(); return;
  }
  ctx.fillStyle = mode === 'day' ? '#121a2c' : '#1c2a55'; ctx.fillRect(x0, y0, w, h);
  const cell = Math.max(0.22, Math.min(w, h) / 9), pal = mode === 'day' ? GLASS_DAY : GLASS_NIGHT;
  const nx = Math.ceil(w / cell), ny = Math.ceil(h / cell);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = rnd();
    if (v < 0.22) continue;
    ctx.fillStyle = css(pal[Math.floor(rnd() * pal.length)], mode === 'day' ? 0.55 : 0.9);
    ctx.fillRect(x0 + i * cell + 0.03, y0 + j * cell + 0.03, cell - 0.06, cell - 0.06);
  }
  // médaillons
  const med = Math.max(1, Math.round(h / (w * 1.1)));
  for (let k = 0; k < med; k++) {
    ctx.fillStyle = css(pal[(k * 3 + 1) % pal.length], mode === 'day' ? 0.5 : 0.85);
    ctx.beginPath(); ctx.arc(x0 + w / 2, y0 + ((k + 0.5) / med) * h, Math.min(w * 0.3, h / med * 0.32), 0, Math.PI * 2); ctx.fill();
  }
  if (mode === 'day') {
    const gr = ctx.createLinearGradient(x0, y0 + h, x0 + w, y0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.5, 'rgba(160,190,220,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = gr; ctx.fillRect(x0, y0, w, h);
  }
  ctx.restore();
}

interface Pal { light: string; shade: string; line: string }

function palette(stone: number, mode: Mode): Pal {
  if (mode === 'bump') return { light: '#f4f4f4', shade: '#505050', line: '#ffffff' };
  if (mode === 'night') return { light: css(mixHex(stone, 0x000000, 0.45)), shade: 'rgba(10,8,5,0.8)', line: css(mixHex(stone, 0x000000, 0.55)) };
  return { light: css(mixHex(stone, 0xffffff, 0.3)), shade: css(mixHex(stone, 0x000000, 0.5), 0.7), line: css(mixHex(stone, 0xffffff, 0.16)) };
}

/** Une baie gothique complète : chambranle, vitrage, remplage (lancettes, oculus), gâble. Repère métrique de la rangée. */
function drawWindow(ctx: CanvasRenderingContext2D, mode: Mode, stone: number, cx: number, win: GothicWindow, seed: number): void {
  const p = palette(stone, mode), rnd = rngOf(seed);
  const { w, h, sill } = win, hw = w / 2, glass = win.glass ?? 'vitrail', n = Math.max(1, win.lancets ?? 2);
  const fw = Math.max(0.16, w * 0.07);
  // ébrasement et chambranle
  let a = archPath(ctx, cx, sill, w + 2 * fw, h + fw, win.round);
  if (mode !== 'night') { ctx.fillStyle = p.light; ctx.fill(); ctx.lineWidth = fw * 0.3; ctx.strokeStyle = p.shade; ctx.stroke(); }
  a = archPath(ctx, cx, sill, w, h, win.round);
  fillGlass(ctx, mode, glass, cx - hw, sill, w, h, rnd);
  // remplage : clippé dans la baie
  ctx.save();
  archPath(ctx, cx, sill, w, h, win.round); ctx.clip();
  ctx.strokeStyle = p.line; ctx.lineJoin = 'round';
  const tw = Math.max(0.1, w * 0.045);
  if (n > 1 || win.rose) {
    const lw = w / n, ysl = a.ys - lw * 0.25;
    ctx.lineWidth = tw;
    for (let i = 0; i < n; i++) { archPath(ctx, cx - hw + (i + 0.5) * lw, sill - 1, lw, ysl - sill + 1 + lw * 0.9, win.round); ctx.stroke(); }
    const ro = Math.min(hw * (n > 2 ? 0.5 : 0.44), a.rise * 0.34), oy = a.ys + a.rise * (n > 2 ? 0.42 : 0.5);
    ctx.beginPath(); ctx.arc(cx, oy, ro, 0, Math.PI * 2); ctx.stroke();
    if (win.rose) {
      ctx.lineWidth = tw * 0.7;
      for (let k = 0; k < 6; k++) { const t = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(t) * ro * 0.56, oy + Math.sin(t) * ro * 0.56, ro * 0.3, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (n > 2) for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * hw * 0.52, a.ys + a.rise * 0.12, ro * 0.42, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
  archPath(ctx, cx, sill, w, h, win.round);
  ctx.lineWidth = Math.max(0.06, fw * 0.35); ctx.strokeStyle = mode === 'bump' ? '#202020' : p.shade; ctx.stroke();
  // appui
  if (mode !== 'night') { ctx.fillStyle = p.light; ctx.fillRect(cx - hw - fw * 1.6, sill - fw * 0.9, w + 3.2 * fw, fw * 0.9); }
  // gâble à crochets
  if (win.gable && mode !== 'night') {
    const gy = a.ys + a.rise * 0.42, top = sill + h + w * 0.52, gx = hw + fw * 1.4;
    ctx.strokeStyle = p.light; ctx.lineWidth = fw * 0.9;
    ctx.beginPath(); ctx.moveTo(cx - gx, gy); ctx.lineTo(cx, top); ctx.lineTo(cx + gx, gy); ctx.stroke();
    ctx.fillStyle = p.light;
    for (let k = 1; k <= 5; k++) for (const s of [-1, 1]) {
      const t = k / 6, x = cx + s * gx * (1 - t), y = gy + (top - gy) * t;
      ctx.beginPath(); ctx.arc(x + s * fw * 0.8, y + fw * 0.5, fw * 0.62, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillRect(cx - fw * 0.35, top, fw * 0.7, fw * 2.6); ctx.fillRect(cx - fw * 1.1, top + fw * 1.3, fw * 2.2, fw * 0.6);
    ctx.fillStyle = mode === 'bump' ? '#303030' : p.shade;
    ctx.beginPath(); ctx.arc(cx, sill + h + w * 0.17, w * 0.085, 0, Math.PI * 2); ctx.fill();
  }
}

function drawKings(ctx: CanvasRenderingContext2D, mode: Mode, stone: number, row: GothicRow, seed: number): void {
  if (mode === 'night') return;
  const p = palette(stone, mode), n = Math.max(1, row.count ?? 4), nw = row.w / n, h = row.h, rnd = rngOf(seed);
  for (let i = 0; i < n; i++) {
    const x0 = i * nw, cx = x0 + nw / 2;
    // fond de niche
    ctx.fillStyle = mode === 'bump' ? '#555555' : css(mixHex(stone, 0x000000, 0.55), 0.62);
    ctx.fillRect(x0 + nw * 0.1, h * 0.1, nw * 0.8, h * 0.72);
    ctx.beginPath(); ctx.arc(cx, h * 0.82, nw * 0.4, 0, Math.PI); ctx.fill();
    // statue : robe, tête, couronne, sceptre
    const lean = (rnd() - 0.5) * 0.06 * nw;
    ctx.fillStyle = p.light;
    ctx.beginPath(); ctx.moveTo(cx - nw * 0.2, h * 0.11); ctx.lineTo(cx + nw * 0.2, h * 0.11); ctx.lineTo(cx + nw * 0.15 + lean, h * 0.68); ctx.lineTo(cx - nw * 0.15 + lean, h * 0.68); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + lean, h * 0.74, nw * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx + lean - nw * 0.11, h * 0.78, nw * 0.22, h * 0.045);
    ctx.fillRect(cx + (rnd() < 0.5 ? -1 : 1) * nw * 0.22, h * 0.3, nw * 0.035, h * 0.42);
    if (mode === 'day') { ctx.fillStyle = css(mixHex(stone, 0x000000, 0.4), 0.45); ctx.fillRect(cx + lean - nw * 0.02, h * 0.12, nw * 0.04, h * 0.5); }
    // colonnettes et arc trilobé
    ctx.fillStyle = p.light;
    ctx.fillRect(x0 - nw * 0.05, h * 0.06, nw * 0.1, h * 0.8); ctx.fillRect(x0 + nw * 0.95, h * 0.06, nw * 0.1, h * 0.8);
    ctx.strokeStyle = p.light; ctx.lineWidth = nw * 0.09;
    ctx.beginPath(); ctx.arc(cx, h * 0.82, nw * 0.42, 0, Math.PI); ctx.stroke();
  }
  ctx.fillStyle = p.light; ctx.fillRect(0, 0, row.w, h * 0.07); ctx.fillRect(0, h * 0.93, row.w, h * 0.07);
  if (mode === 'day') { ctx.fillStyle = p.shade; ctx.fillRect(0, h * 0.905, row.w, h * 0.025); }
}

function drawPortal(ctx: CanvasRenderingContext2D, mode: Mode, stone: number, row: GothicRow, seed: number): void {
  if (mode === 'night') return;
  const p = palette(stone, mode), w = row.w, h = row.h, rnd = rngOf(seed);
  const hd = h * 0.46, tr = Math.max(0.35, w * 0.07);
  // vantaux de bois sombre à pentures de fer forgé
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? w * 0.03 : w / 2 + tr / 2, dw = w / 2 - tr / 2 - w * 0.03;
    ctx.fillStyle = mode === 'bump' ? '#707070' : '#4a2a20'; ctx.fillRect(x0, 0, dw, hd);
    if (mode === 'day') {
      ctx.strokeStyle = 'rgba(20,16,12,0.85)'; ctx.lineWidth = Math.max(0.04, w * 0.008);
      for (let k = 0; k < 3; k++) {
        const y = hd * (0.2 + k * 0.3);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + dw, y); ctx.stroke();
        for (let q = 0; q < 5; q++) for (const u of [-1, 1]) { ctx.beginPath(); ctx.arc(x0 + ((q + 0.5) / 5) * dw, y + u * dw * 0.09, dw * 0.085, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0, 0, dw * 0.06, hd);
    }
  }
  // trumeau et sa statue, linteau, tympan
  ctx.fillStyle = p.light; ctx.fillRect(w / 2 - tr / 2, 0, tr, hd);
  ctx.fillStyle = mode === 'bump' ? '#b0b0b0' : css(mixHex(stone, 0x000000, 0.2)); ctx.fillRect(w / 2 - tr * 0.3, hd * 0.3, tr * 0.6, hd * 0.55);
  ctx.beginPath(); ctx.arc(w / 2, hd * 0.9, tr * 0.28, 0, Math.PI * 2); ctx.fill();
  const bands = [[hd, hd + h * 0.11], [hd + h * 0.12, hd + h * 0.23], [hd + h * 0.24, h]];
  for (let k = 0; k < bands.length; k++) {
    const [y0, y1] = bands[k];
    ctx.fillStyle = mode === 'bump' ? '#8a8a8a' : css(mixHex(stone, 0x8a6a30, 0.28)); ctx.fillRect(0, y0, w, y1 - y0);
    const n = k === 2 ? 7 : 13, fh = (y1 - y0) * (k === 2 ? 0.5 : 0.82);
    for (let i = 0; i < n; i++) {
      const big = k === 2 && i === 3, cx = ((i + 0.5) / n) * w, ph = big ? fh * 1.7 : fh * (0.85 + rnd() * 0.25), pw = (w / n) * (big ? 0.8 : 0.58);
      const fy = y0 + (y1 - y0) * 0.04, lean = (rnd() - 0.5) * pw * 0.3;
      if (mode === 'day') { ctx.fillStyle = p.shade; ctx.beginPath(); ctx.moveTo(cx - pw * 0.4, fy); ctx.lineTo(cx + pw * 0.72, fy); ctx.lineTo(cx + pw * 0.5 + lean, fy + ph * 0.74); ctx.lineTo(cx - pw * 0.2 + lean, fy + ph * 0.74); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = p.light;
      // robe évasée, épaules, tête (nimbe pour la grande figure centrale)
      ctx.beginPath(); ctx.moveTo(cx - pw * 0.56, fy); ctx.lineTo(cx + pw * 0.56, fy); ctx.lineTo(cx + pw * 0.34 + lean, fy + ph * 0.74); ctx.lineTo(cx - pw * 0.34 + lean, fy + ph * 0.74); ctx.closePath(); ctx.fill();
      if (big) { ctx.beginPath(); ctx.arc(cx + lean, fy + ph * 0.86, pw * 0.5, 0, Math.PI * 2); ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(cx + lean, fy + ph * 0.86, pw * 0.3, 0, Math.PI * 2); ctx.fill();
      if (mode === 'day') { ctx.fillStyle = p.shade; ctx.fillRect(cx - pw * 0.04 + lean * 0.5, fy + ph * 0.05, pw * 0.08, ph * 0.6); }
    }
    ctx.fillStyle = p.light; ctx.fillRect(0, y0 - h * 0.006, w, h * 0.012);
  }
}

function drawBlind(ctx: CanvasRenderingContext2D, mode: Mode, stone: number, row: GothicRow): void {
  if (mode === 'night') return;
  const p = palette(stone, mode), n = row.count ?? 0;
  if (n <= 0) return;
  const aw = row.w / n;
  for (let i = 0; i < n; i++) {
    archPath(ctx, (i + 0.5) * aw, row.h * 0.06, aw * 0.74, row.h * 0.84);
    ctx.fillStyle = mode === 'bump' ? '#8c8c8c' : css(mixHex(stone, 0x000000, 0.3), 0.5); ctx.fill();
    ctx.lineWidth = aw * 0.07; ctx.strokeStyle = p.light; ctx.stroke();
  }
}

/** Dessine toutes les rangées dans le canvas donné. `mode` : couleur de jour, émission de nuit ou relief. */
interface RowLayout extends GothicRowUv { v0b: number; v1b: number }

function drawRows(cv: Canvas2D, mode: Mode, stone: number, rows: GothicRow[], uv: Record<string, RowLayout>, seed: number): void {
  const g = cv.g, W = cv.w, H = cv.h;
  rows.forEach((row, ri) => {
    const r = uv[row.id];
    const yTop = Math.round(H * (1 - r.v1b)), yBot = Math.round(H * (1 - r.v0b));
    const ph = yBot - yTop, sx = W / row.w, sy = ph / row.h;
    g.save();
    g.beginPath(); g.rect(0, yTop, W, ph); g.clip();
    g.setTransform(sx, 0, 0, -sy, 0, yBot);
    const p = palette(stone, mode);
    if (row.kind === 'baie' && row.win) {
      const n = Math.max(1, row.win.count ?? 1);
      for (let i = 0; i < n; i++) drawWindow(g, mode, stone, ((i + 0.5) / n) * row.w, row.win, seed + ri * 31 + i);
    } else if (row.kind === 'rois') drawKings(g, mode, stone, row, seed + ri * 31);
    else if (row.kind === 'portail') drawPortal(g, mode, stone, row, seed + ri * 31);
    else drawBlind(g, mode, stone, row);
    if (mode !== 'night') {
      if (row.pier) {
        const pw = row.pier / 2;
        g.fillStyle = p.light; g.fillRect(0, 0, pw, row.h); g.fillRect(row.w - pw, 0, pw, row.h);
        g.fillStyle = p.shade; g.fillRect(pw, 0, Math.max(0.05, pw * 0.14), row.h);
      }
      if (row.cornice) { g.fillStyle = p.light; g.fillRect(0, row.h - 0.42, row.w, 0.42); g.fillStyle = p.shade; g.fillRect(0, row.h - 0.52, row.w, 0.1); }
      if (row.base) { g.fillStyle = p.light; g.fillRect(0, 0, row.w, 0.5); g.fillStyle = p.shade; g.fillRect(0, 0.5, row.w, 0.07); }
    }
    g.restore();
  });
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Déclare un atlas de travées gothiques (matériau `key`, créé à la première utilisation) et rend la mise en page
 * de ses rangées. La mise en page ne dépend pas du canvas : elle est identique sous Node (tests).
 */
export function gothicAtlas(key: string, stone: number, rows: GothicRow[], seed = 1): GothicAtlas {
  // hauteur visée de chaque rangée en pixels pour des pixels à peu près carrés, puis mise à l'échelle sur 1024 ou 2048
  const W = 512;
  const want = rows.map((r) => Math.max(72, (r.h * W) / r.w));
  const sum = want.reduce((a, b) => a + b, 0);
  const H = sum > 1500 ? 2048 : sum > 700 ? 1024 : 512;
  const layout: Record<string, RowLayout> = {};
  let y = 0;
  rows.forEach((r, i) => {
    const ph = (want[i] / sum) * H, v0b = y / H, v1b = (y + ph) / H;
    layout[r.id] = { v0b, v1b, v0: v0b + 1.5 / H, v1: v1b - 1.5 / H, w: r.w, h: r.h };
    y += ph;
  });
  defineMaterial(key, () => {
    const cv = canvas2d(W, H), bp = canvas2d(W, H), em = canvas2d(W, H);
    if (!cv || !bp || !em) return litMaterial(key, { color: stone, roughness: 0.92, night: 0.85 });
    rows.forEach((r, i) => {
      const L = layout[r.id], yTop = Math.round(H * (1 - L.v1b)), ph = Math.round(H * (L.v1b - L.v0b));
      paintAshlar(cv, bp, 0, yTop, W, ph, stone, W / r.w, ph / r.h, seed * 13 + i, Math.max(0.48, 8 / (ph / r.h)));
    });
    drawRows(cv, 'day', stone, rows, layout, seed);
    drawRows(bp, 'bump', stone, rows, layout, seed);
    em.g.drawImage(cv.c, 0, 0);
    em.g.fillStyle = 'rgba(20,14,6,0.30)'; em.g.fillRect(0, 0, W, H);
    drawRows(em, 'night', stone, rows, layout, seed);
    const m = litMaterial(key, { color: 0xffffff, roughness: 0.9, night: 1.0, bumpScale: 2.4 }, { map: texFrom(cv), bump: texFrom(bp, { srgb: false }) });
    m.emissiveMap = texFrom(em);
    m.emissive.setHex(0xffdcae);
    return m;
  });
  return { key, rows: layout };
}

export interface RowWallOpts { bays?: number; u0?: number; vFrom?: number; vTo?: number }

/**
 * Mur vertical de a vers b (normale sortante (−dz, dx)) portant une rangée de l'atlas : `bays` travées (par défaut
 * longueur / largeur de travée, arrondie), de y0 à y1. `vFrom`/`vTo` (0..1) ne prennent qu'une partie de la hauteur.
 */
export function rowWall(atlas: GothicAtlas, id: string, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, o: RowWallOpts = {}): Geo {
  const r = atlas.rows[id];
  if (!r) throw new Error(`[monuments] rangée gothique inconnue : ${id} (atlas ${atlas.key})`);
  const len = Math.hypot(bx - ax, bz - az);
  const bays = o.bays ?? Math.max(1, Math.round(len / r.w));
  const u0 = o.u0 ?? 0, va = r.v0 + (r.v1 - r.v0) * (o.vFrom ?? 0), vb = r.v0 + (r.v1 - r.v0) * (o.vTo ?? 1);
  return new Geo().face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, u0, va, { u1: u0 + bays, v1: vb });
}

// ───────────────────────────── claire-voie à découpe alpha ─────────────────────────────

/** v de la rangée « balustrade » (quadrilobes) et de la rangée « galerie » (colonnettes sous arcs brisés). */
export const AJOUR_RAIL: [number, number] = [0.005, 0.245];
export const AJOUR_ARCADE: [number, number] = [0.255, 0.995];

/**
 * Claire-voie de pierre à découpe alpha : en bas de la texture une balustrade à quadrilobes (un motif par mètre),
 * au-dessus une galerie de colonnettes portant des arcs brisés trilobés (une arcade par motif).
 */
export function openworkMaterial(key: string, stone: number): string {
  defineMaterial(key, () => {
    const W = 256, H = 1024;
    const cv = canvas2d(W, H);
    if (!cv) { const m0 = litMaterial(key, { color: stone, roughness: 0.9, night: 0.85, side: THREE.DoubleSide }); m0.userData.cutout = true; return m0; }
    const g = cv.g, light = css(mixHex(stone, 0xffffff, 0.2)), base = css(stone), dark = css(mixHex(stone, 0x000000, 0.35));
    g.clearRect(0, 0, W, H);
    // ── galerie : y de 0 à 768 px ──
    const AH = 768;
    g.fillStyle = base; g.fillRect(0, 0, W, AH * 0.3);
    g.fillStyle = light; g.fillRect(0, 0, W, AH * 0.035);
    g.fillStyle = dark; g.fillRect(0, AH * 0.035, W, 3);
    // arc brisé ouvert dans l'écoinçon
    g.globalCompositeOperation = 'destination-out';
    const hw = W * 0.4, ys = AH * 0.3, rise = AH * 0.21, c = (rise * rise - hw * hw) / (2 * hw), R = c + hw, phi = Math.atan2(rise, c);
    g.beginPath(); g.moveTo(W / 2 - hw, ys + 2); g.lineTo(W / 2 - hw, ys);
    g.arc(W / 2 + c, ys, R, Math.PI, Math.PI + phi, false); g.arc(W / 2 - c, ys, R, -phi, 0, false); g.lineTo(W / 2 + hw, ys + 2); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    // redents (trilobe) et colonnettes
    g.fillStyle = base;
    for (const s of [-1, 1]) { g.beginPath(); g.arc(W / 2 + s * hw * 0.9, ys - rise * 0.34, hw * 0.3, 0, Math.PI * 2); g.fill(); }
    const cw = W * 0.2;
    for (const x of [-cw / 2, W - cw / 2]) {
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, dark); gr.addColorStop(0.4, light); gr.addColorStop(1, dark);
      g.fillStyle = gr; g.fillRect(x + cw * 0.18, ys, cw * 0.64, AH * 0.66);
      g.fillStyle = light; g.fillRect(x, ys - AH * 0.012, cw, AH * 0.035); g.fillRect(x, AH * 0.955, cw, AH * 0.045);
    }
    g.fillStyle = base; g.fillRect(0, AH * 0.972, W, AH * 0.028);
    // ── balustrade : y de 768 à 1024 px ──
    const y0 = AH, BH = H - AH;
    g.fillStyle = base; g.fillRect(0, y0, W, BH);
    g.fillStyle = light; g.fillRect(0, y0, W, BH * 0.13);
    g.fillStyle = dark; g.fillRect(0, y0 + BH * 0.13, W, 3);
    g.globalCompositeOperation = 'destination-out';
    const qc = y0 + BH * 0.55, qr = BH * 0.155;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { g.beginPath(); g.arc(W / 2 + dx * qr * 0.95, qc + dy * qr * 0.95, qr, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const m = litMaterial(key, { color: 0xffffff, roughness: 0.9, metalness: 0, night: 0.85, side: THREE.DoubleSide, alphaTest: 0.5 }, { map: texFrom(cv), bump: null });
    m.userData.cutout = true;
    return m;
  });
  return key;
}

// ───────────────────────────── grande rose ─────────────────────────────

/** Rose rayonnante peinte (UV 0..1 sur le carré circonscrit) : remplage de pierre, verre coloré, éclairée la nuit. */
export function roseMaterial(key: string, stone: number, petals = 12, seed = 5): string {
  defineMaterial(key, () => {
    const S = 512;
    const cv = canvas2d(S, S), em = canvas2d(S, S);
    if (!cv || !em) return litMaterial(key, { color: 0x1c2a4a, roughness: 0.4, night: 1.2 });
    const draw = (ctx: CanvasRenderingContext2D, night: boolean): void => {
      const rnd = rngOf(seed), c = S / 2, R = S / 2, pal = night ? GLASS_NIGHT : GLASS_DAY;
      ctx.fillStyle = night ? css(mixHex(stone, 0x000000, 0.5)) : css(stone); ctx.fillRect(0, 0, S, S);
      ctx.save(); ctx.beginPath(); ctx.arc(c, c, R * 0.96, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = night ? '#1c2a55' : '#111a2e'; ctx.fillRect(0, 0, S, S);
      // verre : secteurs et anneaux colorés
      const rings = [0.16, 0.5, 0.74, 0.96];
      for (let k = 0; k < rings.length - 1; k++) {
        const n = petals * (k === 0 ? 1 : 2);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          for (let q = 0; q < 3; q++) {
            const r0 = R * (rings[k] + ((rings[k + 1] - rings[k]) * q) / 3), r1 = R * (rings[k] + ((rings[k + 1] - rings[k]) * (q + 1)) / 3);
            ctx.fillStyle = css(pal[Math.floor(rnd() * pal.length)], night ? 0.9 : 0.55);
            ctx.beginPath(); ctx.arc(c, c, r1, a0, a1); ctx.arc(c, c, r0, a1, a0, true); ctx.closePath(); ctx.fill();
          }
        }
      }
      ctx.fillStyle = css(pal[3], night ? 0.95 : 0.6); ctx.beginPath(); ctx.arc(c, c, R * 0.15, 0, Math.PI * 2); ctx.fill();
      // remplage
      ctx.strokeStyle = night ? css(mixHex(stone, 0x000000, 0.6)) : css(mixHex(stone, 0xffffff, 0.2)); ctx.lineCap = 'round';
      for (let k = 0; k < rings.length - 1; k++) {
        const n = petals * (k === 0 ? 1 : 2);
        ctx.lineWidth = S * (k === 0 ? 0.012 : 0.009);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * R * rings[k], c + Math.sin(a) * R * rings[k]); ctx.lineTo(c + Math.cos(a) * R * rings[k + 1] * 0.93, c + Math.sin(a) * R * rings[k + 1] * 0.93); ctx.stroke();
          const am = ((i + 0.5) / n) * Math.PI * 2, rr = R * rings[k + 1], hw = (Math.PI / n) * rr * 0.86;
          ctx.beginPath(); ctx.arc(c + Math.cos(am) * (rr - hw), c + Math.sin(am) * (rr - hw), hw, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.lineWidth = S * 0.016;
      for (const r of [0.16, 0.5]) { ctx.beginPath(); ctx.arc(c, c, R * r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      ctx.lineWidth = S * 0.035; ctx.strokeStyle = night ? css(mixHex(stone, 0x000000, 0.5)) : css(mixHex(stone, 0xffffff, 0.25));
      ctx.beginPath(); ctx.arc(c, c, R * 0.965, 0, Math.PI * 2); ctx.stroke();
    };
    draw(cv.g, false); draw(em.g, true);
    const m = litMaterial(key, { color: 0xffffff, roughness: 0.5, metalness: 0.1, night: 1.15 }, { map: texFrom(cv, { clamp: true }), bump: null });
    m.emissiveMap = texFrom(em, { clamp: true });
    m.emissive.setHex(0xffe6c0);
    return m;
  });
  return key;
}

/** Assure qu'un matériau déclaré existe (préchauffage) et le rend. */
export function gothicMat(key: string): THREE.Material { return mat(key); }
