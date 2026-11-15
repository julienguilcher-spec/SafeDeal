/* Kit monuments — textures procédurales : pierre de taille, bossages, marbre, zinc, ardoise, métaux,
 * eau, caissons, bas-reliefs, hiéroglyphes, treillis, balustres, grilles. Toutes répétables. */
import type * as THREE from 'three';
import { canvas2d, css, fbm, mixHex, paintBumpBase, paintMatter, paintStreaks, rgbOf, rngOf, texFrom, type Canvas2D } from './canvas';

export interface TexPair { map: THREE.Texture; bump: THREE.Texture | null }

export interface StoneOpts {
  tint: number;
  /** Taille du motif (m). */
  tile?: number;
  /** Nombre d'assises dans le motif et de blocs par assise. */
  courses?: number;
  perRow?: number;
  /** 'taille' : joints fins ; 'bossage' : joints creusés et blocs bombés ; 'lisse' : sans joints. */
  joint?: 'taille' | 'bossage' | 'lisse';
  /** Coulures de patine (0 = aucune). */
  streaks?: number;
  streakColor?: number;
  seed?: number;
  size?: number;
}

/** Pierre de taille : matière mouchetée, blocs légèrement nuancés, joints, relief associé. */
export function stoneTex(o: StoneOpts): TexPair | null {
  const size = o.size ?? 512;
  const cv = canvas2d(size, size), bp = canvas2d(size, size);
  if (!cv || !bp) return null;
  const tile = o.tile ?? 4, courses = o.courses ?? 6, perRow = o.perRow ?? 3, seed = o.seed ?? 1;
  const joint = o.joint ?? 'taille';
  paintMatter(cv, o.tint, 0.07, 6, seed, 0.035, mixHex(o.tint, 0x6b6558, 0.5), 0.35);
  paintBumpBase(bp, 205, 14, 24, seed + 5);
  const g = cv.g, b = bp.g;
  if (joint !== 'lisse') {
    const rnd = rngOf(seed + 11);
    const ch = size / courses, bw = size / perRow;
    for (let r = 0; r < courses; r++) {
      const off = (r % 2) * bw * 0.5 + (joint === 'taille' ? (rnd() - 0.5) * bw * 0.12 : 0);
      for (let k = -1; k <= perRow; k++) {
        const x = k * bw + off, y = r * ch;
        // nuance propre au bloc
        const v = rnd();
        g.fillStyle = v < 0.5 ? `rgba(0,0,0,${(0.5 - v) * 0.16})` : `rgba(255,250,235,${(v - 0.5) * 0.16})`;
        g.fillRect(x, y, bw, ch);
        if (joint === 'bossage') {
          const m = Math.max(3, size / 64);
          // chanfrein : ombre en bas/à droite, lumière en haut/à gauche
          g.fillStyle = 'rgba(255,250,235,0.18)'; g.fillRect(x + m, y + m, bw - 2 * m, m * 0.8); g.fillRect(x + m, y + m, m * 0.8, ch - 2 * m);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + m, y + ch - m * 1.8, bw - 2 * m, m * 0.8); g.fillRect(x + bw - m * 1.8, y + m, m * 0.8, ch - 2 * m);
          g.fillStyle = 'rgba(40,34,26,0.55)';
          g.fillRect(x, y, bw, m); g.fillRect(x, y, m, ch);
          b.fillStyle = '#000'; b.fillRect(x, y, bw, m); b.fillRect(x, y, m, ch);
          const grd = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => { const gr = b.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
          b.fillStyle = grd(0, y + m, 0, y + m * 3); b.fillRect(x, y + m, bw, m * 2);
          b.fillStyle = grd(0, y + ch, 0, y + ch - m * 2); b.fillRect(x, y + ch - m * 2, bw, m * 2);
          b.fillStyle = grd(x + m, 0, x + m * 3, 0); b.fillRect(x + m, y, m * 2, ch);
          b.fillStyle = grd(x + bw, 0, x + bw - m * 2, 0); b.fillRect(x + bw - m * 2, y, m * 2, ch);
        } else {
          const j = Math.max(1.2, size / 300);
          g.fillStyle = 'rgba(52,44,34,0.42)';
          g.fillRect(x, y, bw, j); g.fillRect(x, y, j, ch);
          g.fillStyle = 'rgba(255,250,236,0.22)';
          g.fillRect(x + j, y + j, bw - j, j * 0.8);
          b.fillStyle = 'rgba(0,0,0,0.85)';
          b.fillRect(x, y - j * 0.3, bw, j * 1.6); b.fillRect(x - j * 0.3, y, j * 1.6, ch);
        }
      }
    }
  }
  if (o.streaks) paintStreaks(cv, o.streakColor ?? 0x3a362e, o.streaks, 0.22, seed + 23);
  return { map: texFrom(cv, { tile }), bump: texFrom(bp, { tile, srgb: false }) };
}

/** Marbre veiné. */
export function marbleTex(tint: number, vein: number, seed = 3, tile = 3): TexPair | null {
  const size = 256;
  const cv = canvas2d(size, size);
  if (!cv) return null;
  const img = cv.g.createImageData(size, size);
  const [r0, g0, b0] = rgbOf(tint), [r1, g1, b1] = rgbOf(vein);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 4, (y / size) * 4, 4, 4, seed);
      const s = Math.abs(Math.sin(((x + y) / size) * Math.PI * 2 * 2 + n * 9));
      const v = Math.pow(1 - s, 6) * 0.75 + (fbm((x / size) * 16, (y / size) * 16, 16, 2, seed + 4) - 0.5) * 0.08;
      const k = Math.max(0, Math.min(1, v));
      const i = (y * size + x) * 4;
      img.data[i] = r0 + (r1 - r0) * k; img.data[i + 1] = g0 + (g1 - g0) * k; img.data[i + 2] = b0 + (b1 - b0) * k; img.data[i + 3] = 255;
    }
  }
  cv.g.putImageData(img, 0, 0);
  return { map: texFrom(cv, { tile }), bump: null };
}

/** Couverture en zinc (ou plomb) : feuilles à tasseaux verticaux, joints horizontaux décalés. */
export function zincTex(tint: number, seed = 5): TexPair | null {
  const size = 256, tile = 2.6;
  const cv = canvas2d(size, size), bp = canvas2d(size, size);
  if (!cv || !bp) return null;
  paintMatter(cv, tint, 0.06, 5, seed, 0.02, mixHex(tint, 0xc8d0d2, 0.6), 0.3);
  paintBumpBase(bp, 150, 6, 12, seed);
  const g = cv.g, b = bp.g, n = 4, w = size / n;
  for (let i = 0; i < n; i++) {
    const x = i * w;
    g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(x, 0, 2, size);
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x + 2, 0, 3, size);
    b.fillStyle = '#fff'; b.fillRect(x - 1, 0, 5, size);
    const y = ((i % 2) * 0.5 + 0.2) * size;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y, w, 1.5);
    b.fillStyle = '#555'; b.fillRect(x, y, w, 2);
  }
  paintStreaks(cv, 0x30363a, 10, 0.10, seed + 2);
  return { map: texFrom(cv, { tile }), bump: texFrom(bp, { tile, srgb: false }) };
}

/** Ardoise : rangs d'écailles rectangulaires à joints croisés. */
export function slateTex(tint = 0x3e4651, seed = 7): TexPair | null {
  const size = 256, tile = 1.6;
  const cv = canvas2d(size, size), bp = canvas2d(size, size);
  if (!cv || !bp) return null;
  paintMatter(cv, tint, 0.05, 8, seed, 0.03);
  paintBumpBase(bp, 128, 4, 16, seed);
  const g = cv.g, b = bp.g, rows = 12, cols = 8, rh = size / rows, cw = size / cols;
  const rnd = rngOf(seed);
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = k * cw + (r % 2) * cw * 0.5, y = r * rh;
      const v = rnd();
      g.fillStyle = v < 0.5 ? `rgba(0,0,0,${(0.5 - v) * 0.3})` : `rgba(190,205,225,${(v - 0.5) * 0.22})`;
      g.fillRect(x, y, cw, rh);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, 1, rh); g.fillRect(x, y + rh - 2, cw, 2);
      g.fillStyle = 'rgba(210,220,235,0.14)'; g.fillRect(x + 1, y, cw - 1, 1.2);
      const gr = b.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, '#404040'); gr.addColorStop(1, '#d0d0d0');
      b.fillStyle = gr; b.fillRect(x + 1, y, cw - 1, rh - 1);
      b.fillStyle = '#000'; b.fillRect(x, y, 1, rh);
    }
  }
  return { map: texFrom(cv, { tile }), bump: texFrom(bp, { tile, srgb: false }) };
}

/** Métal patiné (bronze, vert-de-gris, dorure, fonte) : teinte, taches d'une seconde teinte, coulures. */
export function metalTex(base: number, tint2: number, amount: number, streak: number, streakAlpha: number, seed: number, tile = 2): TexPair | null {
  const size = 256;
  const cv = canvas2d(size, size);
  if (!cv) return null;
  paintMatter(cv, base, 0.10, 6, seed, 0.03, tint2, amount);
  if (streakAlpha > 0) paintStreaks(cv, streak, 22, streakAlpha, seed + 1);
  return { map: texFrom(cv, { tile }), bump: null };
}

/** Eau : fond glauque et reflets en ridules. */
export function waterTex(seed = 9): TexPair | null {
  const size = 256, tile = 6;
  const cv = canvas2d(size, size), bp = canvas2d(size, size);
  if (!cv || !bp) return null;
  const img = cv.g.createImageData(size, size), bi = bp.g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 6, (y / size) * 12, 12, 3, seed);
      const r = Math.pow(Math.abs(Math.sin(n * 14)), 8);
      const i = (y * size + x) * 4;
      img.data[i] = 52 + r * 150; img.data[i + 1] = 92 + r * 130; img.data[i + 2] = 100 + r * 120; img.data[i + 3] = 255;
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = 110 + n * 120; bi.data[i + 3] = 255;
    }
  }
  cv.g.putImageData(img, 0, 0); bp.g.putImageData(bi, 0, 0);
  return { map: texFrom(cv, { tile }), bump: texFrom(bp, { tile, srgb: false }) };
}

/** Jet d'eau : filets blancs verticaux à bords fondus (canal alpha), défilant de bas en haut. */
export function jetTex(seed = 13): THREE.Texture | null {
  const w = 64, h = 256;
  const cv = canvas2d(w, h);
  if (!cv) return null;
  const g = cv.g, rnd = rngOf(seed);
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    const x = w * (0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.52), y = rnd() * h, len = 20 + rnd() * 90;
    const a = 0.10 + rnd() * 0.32;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    const lw = 1 + rnd() * 3;
    for (const dy of [-h, 0, h]) g.fillRect(x, y + dy, lw, len);
  }
  // fondu latéral
  const img = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = 1 - Math.pow(Math.abs((x + 0.5) / w - 0.5) * 2, 2.5);
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.min(255, img.data[i + 3] * 1.8 * e + 46 * e);
  }
  g.putImageData(img, 0, 0);
  return texFrom(cv);
}

/** Voûte à caissons : caissons carrés en creux avec rosace, sur fond de pierre. Motif d'un caisson. */
export function cofferTex(tint: number, seed = 17, tile = 1.9): TexPair | null {
  const size = 256;
  const cv = canvas2d(size, size), bp = canvas2d(size, size);
  if (!cv || !bp) return null;
  paintMatter(cv, tint, 0.05, 4, seed, 0.03);
  paintBumpBase(bp, 235, 6, 8, seed);
  const g = cv.g, b = bp.g, m = size * 0.11, s = size - 2 * m;
  // gradins du caisson
  for (let k = 0; k < 3; k++) {
    const i = m + k * size * 0.045, w = size - 2 * i;
    g.fillStyle = `rgba(30,24,16,${0.16 + k * 0.07})`; g.fillRect(i, i, w, w);
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(i, i, w, 3); g.fillRect(i, i, 3, w);
    g.fillStyle = 'rgba(255,248,230,0.20)'; g.fillRect(i, i + w - 3, w, 3); g.fillRect(i + w - 3, i, 3, w);
    b.fillStyle = `rgb(${170 - k * 55},${170 - k * 55},${170 - k * 55})`; b.fillRect(i, i, w, w);
  }
  // rosace
  const c = size / 2, R = s * 0.26;
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    g.fillStyle = 'rgba(245,236,214,0.55)'; b.fillStyle = '#c8c8c8';
    for (const ctx of [g, b]) { ctx.beginPath(); ctx.ellipse(c + Math.cos(a) * R * 0.55, c + Math.sin(a) * R * 0.55, R * 0.5, R * 0.24, a, 0, Math.PI * 2); ctx.fill(); }
  }
  g.fillStyle = 'rgba(250,242,222,0.75)'; g.beginPath(); g.arc(c, c, R * 0.26, 0, Math.PI * 2); g.fill();
  b.fillStyle = '#f0f0f0'; b.beginPath(); b.arc(c, c, R * 0.26, 0, Math.PI * 2); b.fill();
  return { map: texFrom(cv, { tile }), bump: texFrom(bp, { tile, srgb: false }) };
}

/** Dessine une frise de personnages stylisés (silhouettes en léger relief) dans le rectangle donné. */
export function paintFigures(cv: Canvas2D, bp: Canvas2D | null, x0: number, y0: number, w: number, h: number, count: number, seed: number, light: string, shade: string): void {
  const rnd = rngOf(seed);
  const draw = (ctx: CanvasRenderingContext2D, fill: string, dx: number, dy: number): void => {
    const r2 = rngOf(seed);
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const cx = x0 + ((i + 0.5 + (r2() - 0.5) * 0.5) / count) * w + dx;
      const fh = h * (0.74 + r2() * 0.2), base = y0 + h * 0.97 + dy, hr = fh * 0.075;
      const horse = r2() < 0.16;
      if (horse) {
        const bw = fh * 0.5;
        ctx.beginPath(); ctx.ellipse(cx, base - fh * 0.42, bw * 0.55, fh * 0.15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = fh * 0.09; ctx.beginPath(); ctx.moveTo(cx + bw * 0.4, base - fh * 0.48); ctx.lineTo(cx + bw * 0.62, base - fh * 0.74); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx + bw * 0.72, base - fh * 0.76, fh * 0.09, fh * 0.05, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = fh * 0.045;
        for (const lx of [-0.42, -0.28, 0.28, 0.42]) { ctx.beginPath(); ctx.moveTo(cx + bw * lx, base - fh * 0.36); ctx.lineTo(cx + bw * (lx + (r2() - 0.5) * 0.25), base); ctx.stroke(); }
        // cavalier
        ctx.beginPath(); ctx.ellipse(cx - bw * 0.05, base - fh * 0.68, fh * 0.07, fh * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - bw * 0.05, base - fh * 0.9, hr * 0.85, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const lean = (r2() - 0.5) * 0.25;
      // jambes
      ctx.lineWidth = fh * 0.07;
      const hipY = base - fh * 0.48, sp = fh * (0.05 + r2() * 0.12);
      ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx - sp, base); ctx.moveTo(cx, hipY); ctx.lineTo(cx + sp, base); ctx.stroke();
      // torse (ou drapé)
      const drape = r2() < 0.45;
      ctx.beginPath();
      if (drape) { ctx.moveTo(cx - fh * 0.08 + lean * fh * 0.2, base - fh * 0.82); ctx.lineTo(cx + fh * 0.08 + lean * fh * 0.2, base - fh * 0.82); ctx.lineTo(cx + fh * 0.14, base - fh * 0.08); ctx.lineTo(cx - fh * 0.14, base - fh * 0.08); ctx.closePath(); }
      else ctx.ellipse(cx + lean * fh * 0.1, base - fh * 0.65, fh * 0.09, fh * 0.19, lean, 0, Math.PI * 2);
      ctx.fill();
      // tête
      ctx.beginPath(); ctx.arc(cx + lean * fh * 0.25, base - fh * 0.9, hr, 0, Math.PI * 2); ctx.fill();
      // bras
      ctx.lineWidth = fh * 0.05;
      const sh = base - fh * 0.8;
      for (const side of [-1, 1]) {
        const a = -Math.PI / 2 + side * (0.5 + r2() * 1.9);
        const ex = cx + Math.cos(a) * fh * 0.26, ey = sh - Math.sin(a) * fh * 0.26;
        ctx.beginPath(); ctx.moveTo(cx + side * fh * 0.07, sh); ctx.lineTo(ex, ey); ctx.stroke();
        const item = r2();
        if (item < 0.22) { ctx.lineWidth = fh * 0.022; ctx.beginPath(); ctx.moveTo(ex, ey + fh * 0.3); ctx.lineTo(ex, ey - fh * 0.42); ctx.stroke(); ctx.lineWidth = fh * 0.05; }
        else if (item < 0.36) { ctx.beginPath(); ctx.ellipse(ex, ey, fh * 0.1, fh * 0.13, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  };
  draw(cv.g, shade, 1.6, 1.6);
  draw(cv.g, light, 0, 0);
  if (bp) draw(bp.g, '#f2f2f2', 0, 0);
  void rnd;
}

/** Bas-relief : bandeau de personnages sur fond de pierre ou de bronze, répétable horizontalement. */
export function reliefTex(tint: number, seed = 21, tile: [number, number] = [8, 2]): TexPair | null {
  const w = 512, h = 128;
  const cv = canvas2d(w, h), bp = canvas2d(w, h);
  if (!cv || !bp) return null;
  paintMatter(cv, mixHex(tint, 0x000000, 0.12), 0.05, 4, seed, 0.03);
  paintBumpBase(bp, 70, 8, 8, seed);
  paintFigures(cv, bp, 0, 0, w, h, 18, seed + 1, css(mixHex(tint, 0xffffff, 0.22), 0.95), css(mixHex(tint, 0x000000, 0.55), 0.8));
  // listels haut et bas
  for (const ctx of [cv.g, bp.g]) {
    ctx.fillStyle = ctx === cv.g ? css(mixHex(tint, 0xffffff, 0.12)) : '#ffffff';
    ctx.fillRect(0, 0, w, 5); ctx.fillRect(0, h - 5, w, 5);
  }
  cv.g.fillStyle = 'rgba(0,0,0,0.35)'; cv.g.fillRect(0, 5, w, 2);
  return { map: texFrom(cv, { tile }), bump: texFrom(bp, { tile, srgb: false }) };
}

/** Hiéroglyphes : trois colonnes de signes incisés sur granit rose (une face d'obélisque, UV 0..1). */
export function glyphTex(tint = 0xb98474, seed = 31): TexPair | null {
  const w = 128, h = 1024;
  const cv = canvas2d(w, h), bp = canvas2d(w, h);
  if (!cv || !bp) return null;
  paintMatter(cv, tint, 0.09, 8, seed, 0.07, 0x7d5a52, 0.5);
  paintBumpBase(bp, 220, 8, 16, seed);
  const rnd = rngOf(seed);
  const ink = 'rgba(70,40,34,0.62)';
  for (const ctx of [cv.g, bp.g]) {
    const r = rngOf(seed + 2);
    ctx.strokeStyle = ctx === cv.g ? ink : '#202020'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let c = 0; c < 3; c++) {
      const x = w * (0.2 + c * 0.3);
      // filets séparateurs
      if (c > 0) { ctx.fillRect(w * (0.05 + c * 0.3) - 1, h * 0.02, 1.6, h * 0.96); }
      let y = h * 0.03;
      while (y < h * 0.97) {
        const k = Math.floor(r() * 9), s = w * 0.085;
        ctx.beginPath();
        if (k === 0) { ctx.arc(x, y + s, s * 0.8, 0, Math.PI * 2); ctx.stroke(); }                              // disque solaire
        else if (k === 1) { ctx.moveTo(x - s, y + s); ctx.lineTo(x + s, y + s); ctx.moveTo(x - s, y + s * 1.6); ctx.lineTo(x + s, y + s * 1.6); ctx.stroke(); }
        else if (k === 2) { ctx.moveTo(x - s, y + s * 2); ctx.quadraticCurveTo(x, y - s * 0.4, x + s, y + s * 2); ctx.stroke(); }
        else if (k === 3) { ctx.ellipse(x, y + s * 1.4, s * 0.7, s * 1.5, 0, 0, Math.PI * 2); ctx.stroke(); }  // cartouche
        else if (k === 4) { ctx.moveTo(x, y); ctx.lineTo(x, y + s * 2.6); ctx.moveTo(x - s * 0.8, y + s * 0.7); ctx.lineTo(x + s * 0.8, y + s * 0.7); ctx.stroke(); } // ankh / sceptre
        else if (k === 5) { ctx.moveTo(x - s, y + s * 0.4); for (let q = 0; q < 4; q++) ctx.lineTo(x - s + (q + 0.5) * s * 0.5, y + (q % 2 ? 0.4 : 1.2) * s); ctx.lineTo(x + s, y + s * 0.4); ctx.stroke(); } // eau
        else if (k === 6) { ctx.ellipse(x, y + s * 0.9, s * 1.0, s * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y + s * 0.9, s * 0.2, 0, Math.PI * 2); ctx.fill(); } // œil
        else if (k === 7) { ctx.moveTo(x - s * 0.6, y + s * 2.4); ctx.lineTo(x - s * 0.2, y + s * 0.6); ctx.lineTo(x + s * 0.8, y + s * 0.3); ctx.lineTo(x + s * 0.3, y + s * 1.2); ctx.lineTo(x + s * 0.5, y + s * 2.4); ctx.stroke(); } // oiseau
        else { ctx.fillRect(x - s * 0.7, y + s * 0.3, s * 1.4, s * 0.9); }
        y += s * (2.6 + r() * 1.6);
      }
    }
  }
  void rnd;
  return { map: texFrom(cv, { clamp: true }), bump: texFrom(bp, { srgb: false, clamp: true }) };
}

export interface LatticeOpts {
  color: number;
  /** Épaisseur relative des fers principaux (fraction du motif). */
  bar?: number;
  /** Nombre de petites croix par côté à l'intérieur de la grande. */
  sub?: number;
  /** Cadre (membrures) sur les bords du motif. */
  frame?: boolean;
  seed?: number;
  size?: number;
}

/** Treillis de fer à découpe alpha : croix de Saint-André, montants, petites croix secondaires. Répétable. */
export function latticeTex(o: LatticeOpts): THREE.Texture | null {
  const size = o.size ?? 256;
  const cv = canvas2d(size, size);
  if (!cv) return null;
  const g = cv.g, bar = (o.bar ?? 0.06) * size, sub = o.sub ?? 2;
  g.clearRect(0, 0, size, size);
  const rnd = rngOf(o.seed ?? 41);
  const line = (x0: number, y0: number, x1: number, y1: number, lw: number, col: string): void => {
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  const dark = css(mixHex(o.color, 0x000000, 0.25)), base = css(o.color), light = css(mixHex(o.color, 0xffffff, 0.12));
  // petites croix
  const cell = size / sub;
  for (let i = 0; i < sub; i++) for (let j = 0; j < sub; j++) {
    const x = i * cell, y = j * cell;
    line(x, y, x + cell, y + cell, bar * 0.42, dark);
    line(x + cell, y, x, y + cell, bar * 0.42, dark);
  }
  for (let i = 0; i <= sub; i++) { line(i * cell, 0, i * cell, size, bar * 0.5, dark); line(0, i * cell, size, i * cell, bar * 0.5, dark); }
  // grande croix
  line(0, 0, size, size, bar, base); line(size, 0, 0, size, bar, base);
  line(0, 0, size, size, bar * 0.3, light); line(size, 0, 0, size, bar * 0.3, light);
  if (o.frame !== false) {
    g.fillStyle = base;
    g.fillRect(0, 0, size, bar * 0.9); g.fillRect(0, size - bar * 0.9, size, bar * 0.9);
    g.fillRect(0, 0, bar * 0.9, size); g.fillRect(size - bar * 0.9, 0, bar * 0.9, size);
  }
  // légère variation de teinte (rouille, peinture)
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 8) continue;
    const k = 0.92 + rnd() * 0.16;
    img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    img.data[i + 3] = img.data[i + 3] > 100 ? 255 : img.data[i + 3];
  }
  g.putImageData(img, 0, 0);
  return texFrom(cv);
}

/** Balustres de pierre à découpe alpha : quatre balustres tournés par mètre, entre deux listels. */
export function balusterTex(tint: number, seed = 51): THREE.Texture | null {
  const w = 256, h = 256;
  const cv = canvas2d(w, h);
  if (!cv) return null;
  const g = cv.g;
  g.clearRect(0, 0, w, h);
  const n = 4, bw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * bw;
    const gr = g.createLinearGradient(cx - bw * 0.36, 0, cx + bw * 0.36, 0);
    gr.addColorStop(0, css(mixHex(tint, 0x000000, 0.38))); gr.addColorStop(0.35, css(mixHex(tint, 0xffffff, 0.12))); gr.addColorStop(1, css(mixHex(tint, 0x000000, 0.30)));
    g.fillStyle = gr;
    g.beginPath();
    // profil en poire d'un balustre (y de haut en bas)
    const prof: [number, number][] = [[0.00, 0.20], [0.06, 0.22], [0.07, 0.12], [0.16, 0.11], [0.30, 0.20], [0.52, 0.36], [0.66, 0.34], [0.78, 0.16], [0.86, 0.13], [0.90, 0.24], [1.00, 0.26]];
    g.moveTo(cx - prof[0][1] * bw, prof[0][0] * h);
    for (const [t, r] of prof) g.lineTo(cx - r * bw, t * h);
    for (let k = prof.length - 1; k >= 0; k--) g.lineTo(cx + prof[k][1] * bw, prof[k][0] * h);
    g.closePath(); g.fill();
  }
  void seed;
  return texFrom(cv, { tile: [1, 1] });
}

/** Grille en fer forgé à découpe alpha : barreaux à fers de lance (dorés si `gold`), deux lisses. */
export function fenceTex(color: number, gold: boolean): THREE.Texture | null {
  const w = 256, h = 256;
  const cv = canvas2d(w, h);
  if (!cv) return null;
  const g = cv.g;
  g.clearRect(0, 0, w, h);
  const n = 8, bw = w / n;
  g.fillStyle = css(color);
  g.fillRect(0, h * 0.86, w, h * 0.035);
  g.fillRect(0, h * 0.22, w, h * 0.035);
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * bw;
    g.fillStyle = css(color);
    g.fillRect(cx - bw * 0.11, h * 0.12, bw * 0.22, h * 0.88);
    g.fillStyle = gold ? css(0xd9ac2e) : css(color);
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx + bw * 0.3, h * 0.10); g.lineTo(cx + bw * 0.12, h * 0.15); g.lineTo(cx - bw * 0.12, h * 0.15); g.lineTo(cx - bw * 0.3, h * 0.10); g.closePath(); g.fill();
    if (gold) { g.beginPath(); g.arc(cx, h * 0.24, bw * 0.2, 0, Math.PI * 2); g.fill(); }
  }
  return texFrom(cv, { tile: [1.2, 1] });
}
